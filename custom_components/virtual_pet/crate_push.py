"""Crate push: the rules, the generator, the solver and the bots.

Pure: no Home Assistant here. The card's twin is src/card/crate-push-engine.js;
tests/fixtures/crate_push_cases.json holds cases both engines must agree on.
Plan: docs/plan-2026-11-08-crate-push.md (slice 1). The specials (the plan's
section 1) are not in this slice; a board here has none.

A board is at most 6 wide by 4 tall, one character per cell, rows top first:

    .  floor   walkable
    #  wall    blocked for the pet and for a crate
    ~  void    blocked, drawn differently
    P  start   floor the pet starts on
    p  start   a spot the pet starts on
    b  crate   on floor
    n  spot    floor that wants a crate
    B  crate   already on a spot

The pet steps up, down, left or right. Stepping into a crate pushes it one cell
the same way, if that cell is floor or a spot with no wall and no other crate;
otherwise the move is illegal. There is no pull. The board is solved when every
spot holds a crate, and it ends there: a letter after that is illegal. A move
list is the letters u, d, l, r. A solve within `par` moves is neat.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import hashlib
import json
import random
from typing import Any

GEN_VERSION = 1
MAX_MOVES = 400  # a longer list is too_long, decided before any replay
MOVES = "udlr"
DIRS = {"u": (0, -1), "d": (0, 1), "l": (-1, 0), "r": (1, 0)}
CELLS = ".#~PpbnB"
BLOCKED = "#~"
PAR_SLACK = 2  # par is the fewest moves plus this

# level -> (crates, width, height). The player picks the level (plan section 0); the
# pet's level no longer sets the board, only its specials (a later slice).
LEVELS = {
    "easy": (2, 5, 4),
    "normal": (2, 6, 4),
    "hard": (3, 6, 4),
}


def params_for(level: str) -> tuple[int, int, int]:
    """(crates, width, height) for a level. An unknown level has no board:
    ValueError, so the caller refuses it before it asks."""
    if level not in LEVELS:
        raise ValueError(f"no board for level {level!r}")
    return LEVELS[level]


class TooBig(RuntimeError):
    """The solver passed its state cap (never met on a 6 x 4 board)."""


# --- The board -------------------------------------------------------------------


@dataclass
class Board:
    """One board. `grid` is the rows, top first."""

    w: int
    h: int
    grid: tuple[str, ...]
    par: int | None = None
    world: str | None = None
    id: str | None = None
    fallback: bool = False  # the hand-made board stood in (none accepted)
    tries: int = 0  # candidates drawn
    cells: str = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        self.grid = tuple(self.grid)
        if not (1 <= self.w <= 6 and 1 <= self.h <= 4):
            raise ValueError("a board is at most 6 x 4")
        if len(self.grid) != self.h or any(len(r) != self.w for r in self.grid):
            raise ValueError("grid does not match w x h")
        cells = "".join(self.grid)
        if any(c not in CELLS for c in cells):
            raise ValueError("unknown cell")
        if cells.count("P") + cells.count("p") != 1:
            raise ValueError("one start")
        crates = cells.count("b") + cells.count("B")
        spots = cells.count("n") + cells.count("B") + cells.count("p")
        if crates < 1 or crates != spots:
            raise ValueError("as many crates as spots, at least one")
        if self.par is not None and self.par < 0:
            raise ValueError("par is not negative")
        self.cells = cells

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Board:
        try:
            return cls(
                w=int(d["w"]),
                h=int(d["h"]),
                grid=tuple(str(r) for r in d["grid"]),
                par=None if d.get("par") is None else int(d["par"]),
            )
        except (KeyError, TypeError) as err:
            raise ValueError("not a board") from err

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"w": self.w, "h": self.h, "grid": list(self.grid)}
        if self.par is not None:
            out["par"] = self.par
        if self.id is not None:
            out["id"] = self.id
        return out

    @property
    def walls(self) -> frozenset[int]:
        return frozenset(i for i, c in enumerate(self.cells) if c in BLOCKED)

    @property
    def spots(self) -> frozenset[int]:
        return frozenset(i for i, c in enumerate(self.cells) if c in "npB")


# --- State and moves -------------------------------------------------------------


@dataclass(frozen=True)
class State:
    pet: int
    crates: frozenset[int]

    def to_dict(self) -> dict[str, Any]:
        return {"pet": self.pet, "crates": sorted(self.crates)}


def start_state(board: Board) -> State:
    cells = board.cells
    pet = next(i for i, c in enumerate(cells) if c in "Pp")
    return State(pet, frozenset(i for i, c in enumerate(cells) if c in "bB"))


def is_solved(board: Board, state: State) -> bool:
    return state.crates == board.spots


def apply_move(board: Board, state: State, letter: str) -> State | None:
    """One move, or None if it is illegal (off the board, a wall, a crate that
    cannot move, or the board already solved)."""
    if letter not in DIRS or is_solved(board, state):
        return None
    dx, dy = DIRS[letter]
    x, y = state.pet % board.w + dx, state.pet // board.w + dy
    if not (0 <= x < board.w and 0 <= y < board.h):
        return None
    to = y * board.w + x
    if board.cells[to] in BLOCKED:
        return None
    if to not in state.crates:
        return State(to, state.crates)
    bx, by = x + dx, y + dy
    if not (0 <= bx < board.w and 0 <= by < board.h):
        return None
    beyond = by * board.w + bx
    if board.cells[beyond] in BLOCKED or beyond in state.crates:
        return None
    return State(to, (state.crates - {to}) | {beyond})


def legal_moves(board: Board, state: State) -> list[str]:
    return [m for m in MOVES if apply_move(board, state, m) is not None]


def replay(board: Board, moves: str) -> dict[str, Any]:
    """Replay a move list from the start: {legal, bad_index, solved, neat,
    final, too_long}. An empty list, any letter that is not u, d, l or r, any
    move that is not legal and any letter after the board is solved are illegal
    at their index. `final` is the state after the last legal move."""
    out: dict[str, Any] = {
        "legal": False,
        "bad_index": None,
        "solved": False,
        "neat": False,
        "final": None,
        "too_long": False,
    }
    if len(moves) > MAX_MOVES:
        out["too_long"] = True
        return out
    state = start_state(board)
    bad = 0 if not moves else None
    for i, letter in enumerate(moves):
        nxt = apply_move(board, state, letter)
        if nxt is None:
            bad = i
            break
        state = nxt
    out["final"] = state.to_dict()
    if bad is not None:
        out["bad_index"] = bad
        return out
    out["legal"] = True
    out["solved"] = is_solved(board, state)
    out["neat"] = out["solved"] and board.par is not None and len(moves) <= board.par
    return out


# --- The solver ------------------------------------------------------------------


@dataclass
class Solve:
    moves: str  # a fewest-moves solution
    pushes: int  # how many of its moves push a crate
    states: int  # states met


def solve(board: Board, cap: int = 400_000) -> Solve | None:
    """Breadth-first over (pet, crates): a fewest-moves solution, or None if the
    board cannot be solved. Raises TooBig past `cap` states."""
    start = start_state(board)
    if is_solved(board, start):
        return Solve("", 0, 1)
    seen: dict[State, tuple[State, str] | None] = {start: None}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        for m in MOVES:
            nxt = apply_move(board, state, m)
            if nxt is None or nxt in seen:
                continue
            seen[nxt] = (state, m)
            if is_solved(board, nxt):
                path: list[str] = []
                pushes = 0
                cur: State = nxt
                while seen[cur] is not None:
                    prev, letter = seen[cur]  # type: ignore[misc]
                    path.append(letter)
                    if prev.crates != cur.crates:
                        pushes += 1
                    cur = prev
                return Solve("".join(reversed(path)), pushes, len(seen))
            if len(seen) > cap:
                raise TooBig(f"over {cap} states")
            queue.append(nxt)
    return None


# --- The bots --------------------------------------------------------------------


def casual_bot(
    board: Board, rng: random.Random | None = None, budget: int = 300
) -> tuple[str, bool]:
    """A random walker: a legal move at random, `budget` times. (moves, solved)."""
    rng = rng or random.Random(0)
    state = start_state(board)
    out: list[str] = []
    for _ in range(budget):
        moves = legal_moves(board, state)
        if not moves:
            break
        m = rng.choice(moves)
        state = apply_move(board, state, m)  # type: ignore[assignment]
        out.append(m)
        if is_solved(board, state):
            return "".join(out), True
    return "".join(out), False


def _score(board: Board, state: State) -> int:
    """Manhattan distance from each crate to its nearest spot (a crate-greedy
    heuristic that does not see walls, corners or other crates)."""
    w = board.w
    total = 0
    for c in state.crates:
        total += min(abs(c % w - s % w) + abs(c // w - s // w) for s in board.spots)
    return total


def greedy_bot(board: Board, budget: int = 300) -> tuple[str, bool]:
    """Takes the legal move that lowers the crates' distance to the spots the
    most, never going back to a state it has been in. It does not look ahead, so
    a corner or a blocked line stops it. (moves, solved)."""
    state = start_state(board)
    seen = {state}
    out: list[str] = []
    for _ in range(budget):
        best: tuple[int, str, State] | None = None
        for m in MOVES:
            nxt = apply_move(board, state, m)
            if nxt is None or nxt in seen:
                continue
            key = (_score(board, nxt), m, nxt)
            if best is None or key[0] < best[0]:
                best = key  # type: ignore[assignment]
        if best is None:
            break
        _, m, state = best
        seen.add(state)
        out.append(m)
        if is_solved(board, state):
            return "".join(out), True
    return "".join(out), False


# --- The generator ---------------------------------------------------------------

# level -> (fewest moves, most moves, fewest pushes, wall count range)
GATES = {
    "easy": (12, 40, 3, (1, 3)),
    "normal": (15, 60, 4, (2, 4)),
    "hard": (20, 120, 7, (3, 5)),
}
PULLS = {"easy": 8, "normal": 12, "hard": 18}  # reverse pulls made


def _seed(pet_id: str, day: str, world: str | None, level: str, n: int) -> str:
    return f"crate-push|{GEN_VERSION}|{pet_id}|{day}|{world}|{level}|{n}"


def board_id(
    pet_id: str,
    day: str,
    world: str | None,
    w: int,
    h: int,
    grid: tuple[str, ...] | list[str],
    n: int = 0,
) -> str:
    """The board's id: a hash, so the pet id (an entry id) never leaves the
    server. Binds the pet, the day, the world, the generator and the board."""
    text = json.dumps(
        [GEN_VERSION, pet_id, day, world, w, h, list(grid), n], separators=(",", ":")
    )
    return hashlib.sha256(text.encode()).hexdigest()[:10]


def _connected(w: int, h: int, walls: set[int]) -> bool:
    free = [i for i in range(w * h) if i not in walls]
    seen = {free[0]}
    todo = [free[0]]
    while todo:
        i = todo.pop()
        x, y = i % w, i // w
        for dx, dy in DIRS.values():
            nx, ny = x + dx, y + dy
            j = ny * w + nx
            if 0 <= nx < w and 0 <= ny < h and j not in walls and j not in seen:
                seen.add(j)
                todo.append(j)
    return len(seen) == len(free)


def _candidate(rng: random.Random, level: str) -> Board | None:
    """One candidate, built backwards: crates on the spots, then random pulls
    (the reverse of a push), so it is solvable by construction. None if the
    walls cut the floor apart."""
    crates_n, w, h = params_for(level)
    lo, hi = GATES[level][3]
    walls = set(rng.sample(range(w * h), rng.randint(lo, hi)))
    if not _connected(w, h, walls):
        return None
    free = [i for i in range(w * h) if i not in walls]
    if len(free) < crates_n * 2 + 2:
        return None
    spots = set(rng.sample(free, crates_n))
    crates = set(spots)
    pet = rng.choice([i for i in free if i not in crates])

    last = -1  # the crate just pulled (and where it is now): not pulled again at once
    for _ in range(PULLS[level]):
        # the pet's reach (it cannot walk through a crate or a wall)
        reach = {pet}
        todo = [pet]
        while todo:
            i = todo.pop()
            for dx, dy in DIRS.values():
                x, y = i % w + dx, i // w + dy
                j = y * w + x
                if (
                    0 <= x < w
                    and 0 <= y < h
                    and j not in walls
                    and j not in crates
                    and j not in reach
                ):
                    reach.add(j)
                    todo.append(j)
        pulls = []  # (cell the pet pulls from, the cell it steps to, the crate)
        for q in sorted(reach):
            qx, qy = q % w, q // w
            for dx, dy in DIRS.values():
                cx, cy, ax, ay = qx - dx, qy - dy, qx + dx, qy + dy
                if not (0 <= cx < w and 0 <= cy < h and 0 <= ax < w and 0 <= ay < h):
                    continue
                crate, ahead = cy * w + cx, ay * w + ax
                if (
                    crate in crates
                    and (crate != last or crates_n == 1)
                    and ahead not in walls
                    and ahead not in crates
                ):
                    pulls.append((q, ahead, crate))
        if not pulls:
            break
        q, ahead, crate = rng.choice(pulls)
        crates.discard(crate)
        crates.add(q)
        pet = ahead
        last = q
    rows = []
    for y in range(h):
        row = ""
        for x in range(w):
            i = y * w + x
            if i in walls:
                row += "#"
            elif i == pet:
                row += "p" if i in spots else "P"
            elif i in crates:
                row += "B" if i in spots else "b"
            else:
                row += "n" if i in spots else "."
        rows.append(row)
    try:
        return Board(w, h, tuple(rows))
    except ValueError:
        return None


@dataclass
class Verdict:
    ok: bool
    why: str = ""
    solve: Solve | None = None


def check(board: Board, level: str) -> Verdict:
    """Is a candidate worth a day? Solvable, long enough, not too long, enough
    pushes, and not mostly solved already."""
    lo, hi, pushes, _ = GATES[level]
    done = sum(1 for c in board.cells if c == "B")
    crates = board.cells.count("b") + done
    if done > crates // 2 or done == crates:
        return Verdict(False, "mostly_solved")
    try:
        s = solve(board)
    except TooBig:
        return Verdict(False, "too_big")
    if s is None:
        return Verdict(False, "unsolvable")
    if len(s.moves) < lo:
        return Verdict(False, "too_short", s)
    if len(s.moves) > hi:
        return Verdict(False, "too_long", s)
    if s.pushes < pushes:
        return Verdict(False, "few_pushes", s)
    return Verdict(True, "", s)


# One hand-made board per level stands in if no candidate is accepted (it
# should never happen; the tests count it). Each is solvable and passes its level's gate (a test checks).
FALLBACK = {
    "easy": ("....n", ".Pb.n", ".b...", "....."),
    "normal": ("#...n.", ".Pb.n.", ".b....", "......"),
    "hard": ("...#P#", ".bb.b.", "nn#...", "..n..."),
}
TRIES = 400


def crate_push_board(pet_id: str, day: str, world: str | None, level: str) -> Board:
    """The day's board for a pet: a function of (pet, day, world, level). The
    first accepted candidate of a seeded stream, with its par set. If none is
    accepted in TRIES, the level's hand-made board (fallback=True)."""
    params_for(level)  # an unknown level has no board
    for n in range(TRIES):
        rng = random.Random(_seed(pet_id, day, world, level, n))
        cand = _candidate(rng, level)
        if cand is None:
            continue
        verdict = check(cand, level)
        if not verdict.ok or verdict.solve is None:
            continue
        cand.par = len(verdict.solve.moves) + PAR_SLACK
        cand.world = world
        cand.tries = n + 1
        cand.id = board_id(pet_id, day, world, cand.w, cand.h, cand.grid, n)
        return cand
    grid = FALLBACK[level]
    board = Board(
        len(grid[0]), len(grid), grid, world=world, fallback=True, tries=TRIES
    )
    s = solve(board)
    board.par = (len(s.moves) if s else 0) + PAR_SLACK
    board.id = board_id(pet_id, day, world, board.w, board.h, board.grid, TRIES)
    return board
