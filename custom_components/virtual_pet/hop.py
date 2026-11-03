"""Hop of the Day: the rules, the generator, the solver and the bots.

Pure: no Home Assistant here (the package's __init__ imports it, so run a
script that uses this file with the dev venv, as scripts/balance_sim.py does).
The card's twin is src/card/hop-engine.js; tests/fixtures/hop_cases.json holds
cases both engines must agree on. Plan: docs/plan-2026-11-02-hop-of-the-day.md.

A board is at most 6 wide by 4 tall, one character per cell, rows top first:

    .  pad       walkable; sinks when the pet leaves it
    f  find pad  a pad; entering it picks up its find
    o  stone     walkable; never sinks
    ~  water     blocked (a swimmer enters it with a use)
    #  wall      blocked (a climber enters it with a use; a digger tunnels under)
    P  start     a pad the pet stands on
    N  nest      enterable once every find is picked up; entering it ends the board

A cell is named by its index in reading order, a letter `a` to `x` on the wire.
A move names the cell the pet steps onto; the server works out the move from
where the pet was. Leaving a pad sinks it, the move into the nest included.
A win is the nest with every find; tidy is a win with every pad sunk.

A state is (pos, sunk, uses): the pet's cell, the sunk pads as a bit mask, the
specials left. A find is picked up when its pad is entered, so the finds in are
the find pads that are sunk or under the pet: no field of their own.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
import hashlib
import json
import random
from typing import Any

from . import rates as R

# Bump on any change that can change a board for the same inputs; the golden
# boards in tests/fixtures/hop_golden.json are then regenerated.
GEN_VERSION = 1

FAMILIES = ("hop", "glide", "swim", "dig", "climb", "squeeze")
DEFAULT_FAMILY = "hop"

# Species to move family (plan section 3; decided as drafted). The beetle waits
# for its species.json; a species with no line gets DEFAULT_FAMILY.
FAMILY_OF = {
    # woodland
    "bird": "glide",
    "squirrel": "climb",
    "deer": "hop",
    "fox": "dig",
    "bananaslug": "squeeze",
    # terrarium
    "gecko": "climb",
    "tarantula": "dig",
    "beetle": "climb",
    "tortoise": "squeeze",
    "beardeddragon": "hop",
    "ballpython": "squeeze",
    # hearth
    "kitten": "hop",
    "bunny": "hop",
    "corgi": "dig",
    "hamster": "dig",
    "ferret": "squeeze",
    # tidepool
    "otter": "swim",
    "octopus": "squeeze",
    "seal": "swim",
    "hermitcrab": "climb",
    "puffin": "glide",
    # pond
    "treefrog": "hop",
    "axolotl": "swim",
    "pondturtle": "swim",
    "duckling": "swim",
    "beaver": "dig",
    # nightsky
    "bat": "glide",
    "lunamoth": "glide",
    "owl": "glide",
    "firefly": "glide",
    "opossum": "climb",
}

# Stage: (specials, width, height). Wednesday is one column narrower, never
# below 4 wide (plan 2b). Egg has no board.
STAGES = {
    "baby": (0, 4, 3),
    "child": (1, 5, 4),
    "teen": (2, 6, 4),
    "adult": (3, 6, 4),
}
MIN_WIDTH = 4
NARROW_WEEKDAY = 2  # date.weekday(): Wednesday

LETTERS = "abcdefghijklmnopqrstuvwx"  # 6 x 4: a wider board is a format change
PADS = ".fP"
CELLS = ".fo~#PN"


def family_of(species: str | None) -> str:
    """The species' move family, or the default for a species with no line."""
    return FAMILY_OF.get(species or "", DEFAULT_FAMILY)


def params_for(stage: str, day: str) -> tuple[int, int, int]:
    """(specials, width, height) for a stage on a day ("YYYY-MM-DD")."""
    specials, w, h = STAGES[stage]
    if date.fromisoformat(day).weekday() == NARROW_WEEKDAY:
        w = max(MIN_WIDTH, w - 1)
    return specials, w, h


# --- The board -------------------------------------------------------------------


class CycleError(RuntimeError):
    """The solver met a state twice on one line: the board has a free loop
    (two touching stones). The generator never makes one."""


class TooBig(RuntimeError):
    """The solve passed the state cap."""


@dataclass(frozen=True)
class Board:
    """One board. `grid` is the rows, top first. `id` is set by hop_board()."""

    w: int
    h: int
    grid: tuple[str, ...]
    family: str
    specials: int
    world: str | None = None
    id: str | None = None
    fallback: bool = False  # the hand-made board stood in (none accepted)
    tries: int = 0  # candidates drawn
    cells: str = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        if not (1 <= self.w <= 6 and 1 <= self.h <= 4):
            raise ValueError("a board is at most 6 x 4")
        if len(self.grid) != self.h or any(len(r) != self.w for r in self.grid):
            raise ValueError("grid does not match w x h")
        cells = "".join(self.grid)
        if any(c not in CELLS for c in cells):
            raise ValueError("unknown cell")
        if cells.count("P") != 1 or cells.count("N") != 1:
            raise ValueError("one start and one nest")
        if self.family not in FAMILIES:
            raise ValueError("unknown family")
        object.__setattr__(self, "cells", cells)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Board:
        """A board from its wire form ({w, h, grid, family, specials, ...})."""
        return cls(
            w=int(data["w"]),
            h=int(data["h"]),
            grid=tuple(data["grid"]),
            family=data["family"],
            specials=int(data["specials"]),
            world=data.get("world"),
            id=data.get("id"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "w": self.w,
            "h": self.h,
            "grid": list(self.grid),
            "family": self.family,
            "specials": self.specials,
            "world": self.world,
        }

    @property
    def start(self) -> int:
        return self.cells.index("P")

    @property
    def nest(self) -> int:
        return self.cells.index("N")

    @property
    def pad_mask(self) -> int:
        return _mask(i for i, c in enumerate(self.cells) if c in PADS)

    @property
    def find_mask(self) -> int:
        return _mask(i for i, c in enumerate(self.cells) if c == "f")


def _mask(indices: Any) -> int:
    m = 0
    for i in indices:
        m |= 1 << i
    return m


def _bits(mask: int) -> list[int]:
    return [i for i in range(mask.bit_length()) if mask >> i & 1]


# --- The rules -------------------------------------------------------------------


@dataclass(frozen=True)
class State:
    pos: int
    sunk: int
    uses: int
    done: bool = False  # in the nest: the board is over

    def to_dict(self) -> dict[str, Any]:
        return {
            "pos": self.pos,
            "sunk": _bits(self.sunk),
            "uses": self.uses,
            "done": self.done,
        }


def start_state(board: Board) -> State:
    return State(board.start, 0, board.specials)


class _Rules:
    """A board's move table, built once: for each cell, the cells a step or the
    family's special can name, with what the special needs."""

    __slots__ = (
        "board",
        "pads",
        "finds",
        "nest",
        "moves",
        "walk",
        "extra",
        "steps",
        "any",
    )

    def __init__(self, board: Board) -> None:
        self.board = board
        self.pads = board.pad_mask
        self.finds = board.find_mask
        self.nest = board.nest
        w, h, cells, fam = board.w, board.h, board.cells, board.family
        self.moves: list[list[tuple[int, bool]]] = []
        for i in range(w * h):
            r, c = divmod(i, w)
            out: list[tuple[int, bool]] = []  # (target, is a special)
            for dr, dc in ((0, -1), (-1, 0), (1, 0), (0, 1)):  # ◀ ▲ ▼ ▶
                rr, cc = r + dr, c + dc
                if 0 <= rr < h and 0 <= cc < w:
                    t = rr * w + cc
                    special = (fam == "swim" and cells[t] == "~") or (
                        fam == "climb" and cells[t] == "#"
                    )
                    out.append((t, special))
                    if fam == "squeeze" and cells[t] in PADS:
                        out.append((t, True))  # back onto it once it has sunk
                if fam in ("hop", "dig"):
                    rr, cc = r + 2 * dr, c + 2 * dc
                    if 0 <= rr < h and 0 <= cc < w:
                        mid = (r + dr) * w + c + dc
                        if fam == "hop" or cells[mid] == "#":
                            out.append((rr * w + cc, True))
            if fam == "glide":
                # Diagonals: the landing is on the board, so both corner cells are.
                for dr, dc in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < h and 0 <= cc < w:
                        out.append((rr * w + cc, True))
            self.moves.append(out)
        # The relaxed map the solver prunes with: cells a move may ever enter,
        # sinking aside (water and walls only for their family).
        stones = _mask(i for i, ch in enumerate(cells) if ch == "o")
        self.walk = self.pads | stones | (1 << self.nest)
        self.extra = _mask(
            i
            for i, ch in enumerate(cells)
            if (fam == "swim" and ch == "~") or (fam == "climb" and ch == "#")
        )
        self.steps = [[t for t, sp in out if not sp] for out in self.moves]
        self.any = [sorted({t for t, _ in out}) for out in self.moves]

    def reach(self, pos: int, sunk: int, uses: int) -> int:
        """The cells the pet could still enter from `pos`, as if pads it
        crosses did not sink and a use were never spent: a mask that holds
        every cell a real line can reach (the solver's prune)."""
        open_ = self.walk & ~sunk
        nbrs = self.steps
        if uses:
            open_ |= self.extra
            if self.board.family == "squeeze":
                open_ |= sunk
            nbrs = self.any
        seen = 1 << pos
        todo = [pos]
        nest = self.nest
        while todo:
            for t in nbrs[todo.pop()]:
                if open_ >> t & 1 and not seen >> t & 1:
                    seen |= 1 << t
                    if t != nest:
                        todo.append(t)
        return seen

    def entry(self, pos: int, t: int, special: bool, sunk: int, uses: int) -> bool:
        """Whether the pet on `pos` may enter `t` by that kind of move."""
        cell = self.board.cells[t]
        fam = self.board.family
        if special:
            if uses < 1:
                return False
            if fam == "swim":
                return cell == "~"
            if fam == "climb":
                return cell == "#"
            if fam == "squeeze":
                return cell in PADS and bool(sunk >> t & 1)
        if cell in PADS:
            return not sunk >> t & 1
        if cell == "o":
            return True
        if cell == "N":
            left = sunk | (1 << pos)  # the finds in: sunk, or under the pet
            return self.finds & ~left == 0
        return False

    def step(self, s: State, t: int) -> State | None:
        """The state after naming cell `t`, or None if that is not a move."""
        if s.done:
            return None
        for target, special in self.moves[s.pos]:
            if target == t and self.entry(s.pos, t, special, s.sunk, s.uses):
                sunk = s.sunk | (self.pads & (1 << s.pos))
                return State(t, sunk, s.uses - special, t == self.nest)
        return None

    def targets(self, s: State) -> list[int]:
        if s.done:
            return []
        return sorted(
            {
                t
                for t, special in self.moves[s.pos]
                if self.entry(s.pos, t, special, s.sunk, s.uses)
            }
        )


_RULES: dict[Board, _Rules] = {}


def _rules(board: Board) -> _Rules:
    rules = _RULES.get(board)
    if rules is None:
        if len(_RULES) > 64:
            _RULES.clear()
        rules = _RULES[board] = _Rules(board)
    return rules


def legal_targets(board: Board, state: State) -> list[int]:
    """The cells the pet may name next, in index order."""
    return _rules(board).targets(state)


def apply_move(board: Board, state: State, cell: int) -> State | None:
    """The state after naming `cell`, or None if it is not a legal move."""
    if not 0 <= cell < board.w * board.h:
        return None
    return _rules(board).step(state, cell)


def is_won(board: Board, state: State) -> bool:
    return state.done


def is_tidy(board: Board, state: State) -> bool:
    return state.done and board.pad_mask & ~state.sunk == 0


def encode(cells: list[int]) -> str:
    return "".join(LETTERS[i] for i in cells)


def decode(moves: str) -> list[int] | None:
    """Letters to cells; a letter outside `a`-`x` decodes to -1 (illegal where
    it stands). None if the list is over R.HOP_MAX_MOVES (too_long)."""
    if len(moves) > R.HOP_MAX_MOVES:
        return None
    return [LETTERS.find(ch) for ch in moves]


def replay(board: Board, moves: str) -> dict[str, Any]:
    """Replay a move list from the start: {legal, bad_index, won, tidy, final,
    too_long}. An empty list, a letter off the board, any move that is not legal
    and any letter after the nest are illegal at their index. `final` is the
    state after the last legal move."""
    out: dict[str, Any] = {
        "legal": False,
        "bad_index": None,
        "won": False,
        "tidy": False,
        "final": None,
        "too_long": False,
    }
    cells = decode(moves)
    if cells is None:
        out["too_long"] = True
        return out
    state = start_state(board)
    bad = 0 if not cells else None
    for i, cell in enumerate(cells):
        nxt = apply_move(board, state, cell)
        if nxt is None:
            bad = i
            break
        state = nxt
    out["final"] = state.to_dict()
    if bad is not None:
        out["bad_index"] = bad
        return out
    out["legal"] = True
    out["won"] = is_won(board, state)
    out["tidy"] = is_tidy(board, state)
    return out


# --- The solver ------------------------------------------------------------------


@dataclass
class Solve:
    """Every winning list from a state, counted (the move lists, not the paths
    through them: two lists that differ in one letter are two)."""

    win_count: int
    tidy_count: int
    min_win: int | None  # moves in the shortest winning list
    min_tidy: int | None
    win: list[int] | None  # a shortest winning list
    tidy: list[int] | None  # a shortest tidy list
    states: int  # states visited (the cost)


_NONE = 1 << 30  # "no list" for a length


def solve(
    board: Board,
    state: State | None = None,
    cap: int | None = None,
) -> Solve:
    """Count the winning and tidy lists from `state` (default: the start).

    A memoised depth-first search over (pos, sunk, uses). Every move but a
    step between stones sinks a pad or spends a use, so the state graph is
    acyclic unless two stones touch; a state met again on the current line
    raises CycleError rather than loop. Raises TooBig past `cap` states
    (default R.HOP_STATE_CAP)."""
    rules = _rules(board)
    cap = R.HOP_STATE_CAP if cap is None else cap
    s0 = state or start_state(board)
    if s0.done:
        return Solve(0, 0, None, None, None, None, 0)
    pads, finds, nest = rules.pads, rules.finds, rules.nest
    moves, entry, reach = rules.moves, rules.entry, rules.reach
    memo: dict[int, tuple[int, int, int, int]] = {}
    line: set[int] = set()

    def rec(pos: int, sunk: int, uses: int) -> tuple[int, int, int, int]:
        key = sunk | pos << 24 | uses << 29
        got = memo.get(key)
        if got is not None:
            return got
        if key in line:
            raise CycleError(f"state met twice: pos {pos}")
        if len(memo) >= cap:
            raise TooBig(cap)
        left = sunk | (pads & (1 << pos))
        need = (finds & ~left & ~(1 << pos)) | 1 << nest
        if reach(pos, sunk, uses) & need != need:
            got = memo[key] = (0, 0, _NONE, _NONE)  # a find or the nest is cut off
            return got
        line.add(key)
        win = tidy = 0
        min_win = min_tidy = _NONE
        for t, special in moves[pos]:
            if not entry(pos, t, special, sunk, uses):
                continue
            if t == nest:
                win += 1
                min_win = 1 if min_win > 1 else min_win
                if pads & ~left == 0:
                    tidy += 1
                    min_tidy = 1
                continue
            w, td, mw, mt = rec(t, left, uses - special)
            win += w
            tidy += td
            if mw + 1 < min_win:
                min_win = mw + 1
            if mt + 1 < min_tidy:
                min_tidy = mt + 1
        line.discard(key)
        got = memo[key] = (win, tidy, min_win, min_tidy)
        return got

    win, tidy, mw, mt = rec(s0.pos, s0.sunk, s0.uses)

    def walk(slot: int) -> list[int] | None:
        """A shortest list by the memo (slot 2: win, slot 3: tidy), the first
        in move order (◀ ▲ ▼ ▶, then the special) among equals."""
        if (mw if slot == 2 else mt) >= _NONE:
            return None
        out: list[int] = []
        pos, sunk, uses = s0.pos, s0.sunk, s0.uses
        need = mw if slot == 2 else mt
        while True:
            left = sunk | (pads & (1 << pos))
            for t, special in moves[pos]:
                if not entry(pos, t, special, sunk, uses):
                    continue
                if t == nest:
                    if need == 1 and (slot == 2 or pads & ~left == 0):
                        return [*out, t]
                    continue
                key = left | t << 24 | (uses - special) << 29
                if memo[key][slot] == need - 1:
                    out.append(t)
                    pos, sunk, uses, need = t, left, uses - special, need - 1
                    break
            else:  # pragma: no cover - the memo always has the next step
                raise AssertionError("broken memo")

    return Solve(
        win,
        tidy,
        None if mw >= _NONE else mw,
        None if mt >= _NONE else mt,
        walk(2),
        walk(3),
        len(memo),
    )


# --- The bots --------------------------------------------------------------------


def _pick(rng: Any, seq: list[Any]) -> Any:
    """One of `seq` by random() alone (the stream documented stable)."""
    return seq[int(rng.random() * len(seq))]


def _order(rng: Any, seq: list[Any]) -> list[Any]:
    """`seq` shuffled by sorting on drawn keys (no random.shuffle)."""
    keys = [rng.random() for _ in seq]
    return [x for _, x in sorted(zip(keys, seq, strict=True), key=lambda kx: kx[0])]


def _plan(
    rules: _Rules,
    s: State,
    rng: Any | None,
    prefer: list[int] | None,
    banned: int | None,
) -> list[int] | None:
    """The casual bot's next walk: to the nearest find not yet in (the nest
    once every find is in) by a shortest walk on the live board, ties by
    reading order of the goal and ◀ ▲ ▼ ▶ along the way. A special only when
    no walk exists (then the fewest specials, then the shortest). `rng` makes
    ties random; `prefer` is a find order to try first; `banned` is a first
    move it may not take (its second choice after an undo)."""
    finds_in = s.sunk | (1 << s.pos)
    goals = _bits(rules.finds & ~finds_in) or [rules.nest]
    sunk = s.sunk | (rules.pads & (1 << s.pos))  # the cell it leaves
    for allow in range(s.uses + 1):
        # BFS over (cell, specials spent <= allow), by moves made.
        start = (s.pos, 0)
        parent: dict[tuple[int, int], tuple[int, int] | None] = {start: None}
        frontier = [start]
        found: list[tuple[int, int]] = []
        while frontier and not found:
            nxt: list[tuple[int, int]] = []
            for node in frontier:
                pos, spent = node
                moves = rules.moves[pos]
                if rng is not None:
                    moves = _order(rng, moves)
                for t, special in moves:
                    if node == start and t == banned:
                        continue
                    spent2 = spent + special
                    if spent2 > allow:
                        continue
                    if not rules.entry(pos, t, special, sunk, s.uses - spent):
                        continue
                    if t == rules.nest and goals != [rules.nest]:
                        continue
                    child = (t, spent2)
                    if child in parent or any((t, k) in parent for k in range(spent2)):
                        continue
                    parent[child] = node
                    if t in goals:
                        found.append(child)
                    elif t != rules.nest:
                        nxt.append(child)
            frontier = nxt
        if not found:
            continue
        if prefer:
            pref = [g for g in prefer if any(f[0] == g for f in found)]
            if pref:
                found = [f for f in found if f[0] == pref[0]]
        found.sort(key=lambda f: (f[1], f[0]))
        if rng is not None:
            best = [f for f in found if f[1] == found[0][1]]
            goal = _pick(rng, best)
        else:
            goal = found[0]
        path: list[int] = []
        node: tuple[int, int] | None = goal
        while node is not None and node != start:
            path.append(node[0])
            node = parent[node]
        return path[::-1]
    return None


def _greedy(
    rules: _Rules,
    s: State,
    moves: list[int],
    rng: Any | None,
    prefer: list[int] | None,
    banned: int | None,
    undo: bool,
) -> tuple[list[int], State]:
    path: list[int] = []
    while not s.done:
        if not path:
            plan = _plan(rules, s, rng, prefer, banned)
            banned = None
            if plan is None:
                if undo:
                    # Undo 1, 2 or 3 moves and take the second choice there.
                    board = rules.board
                    for j in range(1, min(3, len(moves)) + 1):
                        back = moves[:-j]
                        prev = start_state(board)
                        for m in back:
                            prev = rules.step(prev, m) or prev
                        got = _greedy(
                            rules, prev, list(back), rng, prefer, moves[-j], False
                        )
                        if got[1].done:
                            return got
                return moves, s
            path = plan
        t = path.pop(0)
        nxt = rules.step(s, t)
        if nxt is None:  # pragma: no cover - a planned path is always legal
            path = []
            continue
        s = nxt
        moves.append(t)
    return moves, s


def casual_bot(board: Board, rng: Any | None = None) -> tuple[list[int], bool, bool]:
    """A player who doesn't think about tidy: nearest find, then the next, then
    the nest, by shortest walks; a special only when no walk exists; at a dead
    end, undo up to 3 moves and take the second choice. With `rng` it is the
    noisy bot: random ties, and a shuffled find order it tries first.
    Returns (moves, won, tidy)."""
    rules = _rules(board)
    prefer = _order(rng, _bits(rules.finds)) if rng is not None else None
    moves, s = _greedy(rules, start_state(board), [], rng, prefer, None, True)
    return moves, s.done, is_tidy(board, s)


def careful_bot(board: Board, budget: int = 300) -> tuple[list[int], bool, bool]:
    """A player who thinks about tidy and will undo: a depth-first search that
    tries plain moves first, then the cell with the fewest ways on, and drops a
    line that cuts off a pad, a find or the nest. It gives up after `budget`
    moves tried and plays the casual bot's list. Returns (moves, won, tidy)."""
    rules = _rules(board)
    pads = rules.pads
    tried = 0

    def ways(s: State) -> int:
        return len(rules.targets(s))

    def dfs(s: State, line: list[int]) -> list[int] | None:
        nonlocal tried
        if s.done:
            return line if pads & ~s.sunk == 0 else None
        left = s.sunk | (pads & (1 << s.pos))
        need = (pads & ~left & ~(1 << s.pos)) | 1 << rules.nest
        if rules.reach(s.pos, s.sunk, s.uses) & need != need:
            return None
        options = []
        for t in rules.targets(s):
            nxt = rules.step(s, t)
            assert nxt is not None
            special = nxt.uses < s.uses
            options.append((special, ways(nxt) if not nxt.done else 99, t, nxt))
        options.sort(key=lambda o: o[:3])
        for _, _, t, nxt in options:
            tried += 1
            if tried > budget:
                return None
            got = dfs(nxt, [*line, t])
            if got is not None:
                return got
        return None

    found = dfs(start_state(board), [])
    if found is not None:
        return found, True, True
    moves, won, tidy = casual_bot(board)
    return moves, won, tidy


# --- The generator ---------------------------------------------------------------

# Draft numbers, tuned in ship 1 and reported (plan section 4). Finds per board
# by specials (stage): baby 1, child 2, teen 2-3, adult 3.
FINDS = {0: (1, 1), 1: (2, 2), 2: (2, 3), 3: (3, 3)}
# Walls and water, as a share of the cells (at least 1, never over 25%). A
# baby's 4 x 3 takes one: more cut it off. More at teen and adult keeps the
# solve small (fewer open pads, fewer lines).
OBSTACLES = {0: (0.0, 0.1), 1: (0.1, 0.2), 2: (0.15, 0.25), 3: (0.15, 0.25)}
# Stones, never two touching. One at least: crossing a stone twice is what
# makes most tidy lines exist.
STONES = {0: (1, 1), 1: (1, 2), 2: (1, 2), 3: (1, 2)}
# Check 2's window: tidy lists, at most this many, by specials.
TIDY_MAX = {0: 40, 1: 80, 2: 160, 3: 320}
# Check 3: every tidy list is at least this many moves longer than the shortest win.
TRAP_MARGIN = 1


def _seed(
    pet_id: str,
    day: str,
    world: str | None,
    family: str,
    specials: int,
    w: int,
    h: int,
    n: int,
) -> str:
    return f"hop|{GEN_VERSION}|{pet_id}|{day}|{world}|{family}|{specials}|{w}x{h}|{n}"


def board_id(
    pet_id: str,
    day: str,
    w: int,
    h: int,
    grid: tuple[str, ...] | list[str],
    family: str,
    specials: int,
    n: int = 0,
) -> str:
    """The board's id: a hash, so the pet id (an entry id) never leaves the
    server. Binds the pet, the day, the generator and the board, so another
    pet's or day's list, or a stale generator's, does not match."""
    text = json.dumps(
        [GEN_VERSION, pet_id, day, w, h, list(grid), family, specials, n],
        separators=(",", ":"),
    )
    return hashlib.sha256(text.encode()).hexdigest()[:10]


def _candidate(rng: Any, family: str, specials: int, w: int, h: int) -> Board:
    """One random board: start in a bottom corner, nest in the top row on the
    far side, walls and water by family, stones (never two touching), finds,
    the rest pads."""
    n = w * h
    cells = ["."] * n
    left = rng.random() < 0.5
    start = (h - 1) * w + (0 if left else w - 1)
    far = list(range(w // 2, w)) if left else list(range(0, (w + 1) // 2))
    nest = _pick(rng, far)
    cells[start] = "P"
    cells[nest] = "N"
    free = _order(rng, [i for i in range(n) if cells[i] == "."])
    lo, hi = OBSTACLES[specials]
    k_lo, k_hi = max(1, round(n * lo)), int(n * hi)
    k = k_lo + int(rng.random() * (k_hi - k_lo + 1))
    lean = {"swim": "~", "dig": "#", "climb": "#"}.get(family)
    for j, i in enumerate(free[:k]):
        if lean is not None and j == 0:
            cells[i] = lean  # the family's own terrain is always there
        elif lean is not None:
            other = "#" if lean == "~" else "~"
            cells[i] = lean if rng.random() < 0.75 else other
        else:
            cells[i] = "#" if rng.random() < 0.5 else "~"
    rest = free[k:]
    f_lo, f_hi = FINDS[specials]
    finds = f_lo + int(rng.random() * (f_hi - f_lo + 1))
    for i in rest[:finds]:
        cells[i] = "f"
    s_lo, s_hi = STONES[specials]
    stones = s_lo + int(rng.random() * (s_hi - s_lo + 1))
    for i in rest[finds:]:
        if stones == 0:
            break
        r, c = divmod(i, w)
        near = [
            (r + dr) * w + c + dc
            for dr, dc in ((0, -1), (-1, 0), (1, 0), (0, 1))
            if 0 <= r + dr < h and 0 <= c + dc < w
        ]
        if all(cells[j] != "o" for j in near):
            cells[i] = "o"
            stones -= 1
    grid = tuple("".join(cells[r * w : (r + 1) * w]) for r in range(h))
    return Board(w, h, grid, family, specials)


def touching_stones(board: Board) -> bool:
    """Two orthogonally touching stones (a free loop, so endless lists)."""
    cells, w = board.cells, board.w
    for i, ch in enumerate(cells):
        if ch != "o":
            continue
        if i % w + 1 < w and cells[i + 1] == "o":
            return True
        if i + w < len(cells) and cells[i + w] == "o":
            return True
    return False


@dataclass
class Verdict:
    ok: bool
    why: str  # the first check that failed, or "ok"
    solve: Solve | None = None
    states: int = 0


def check(board: Board, needs_special: bool = False, cap: int | None = None) -> Verdict:
    """Checks 1-6 of the plan's section 4, cheapest first. `needs_special`:
    a win must spend a use (check 5's coin on a child's boards)."""
    if touching_stones(board):
        return Verdict(False, "stones")
    rules = _rules(board)
    s0 = start_state(board)
    need = rules.finds | rules.pads | 1 << rules.nest
    if rules.reach(s0.pos, 0, s0.uses) & need != need:
        return Verdict(False, "reach")
    moves, won, tidy = casual_bot(board)
    if not won:
        return Verdict(False, "4 casual loses")
    if tidy:
        return Verdict(False, "3 casual tidy")
    try:
        got = solve(board, cap=cap)
    except TooBig:
        return Verdict(
            False, "6 too big", states=R.HOP_STATE_CAP if cap is None else cap
        )
    states = got.states
    if got.win_count < 1:
        return Verdict(False, "1 no win", got, states)
    if not 1 <= got.tidy_count <= TIDY_MAX[board.specials]:
        why = "2 no tidy" if got.tidy_count == 0 else "2 tidy flood"
        return Verdict(False, why, got, states)
    assert got.min_win is not None and got.min_tidy is not None
    if got.min_tidy < got.min_win + TRAP_MARGIN:
        return Verdict(False, "3 no trap", got, states)
    if board.specials > 0:
        bare = solve(board, State(s0.pos, 0, 0), cap=cap)
        states += bare.states
        if bare.tidy_count:
            return Verdict(False, "5 tidy without a use", got, states)
        if needs_special and bare.win_count:
            return Verdict(False, "5 win without a use", got, states)
    return Verdict(True, "ok", got, states)


def hop_board(
    pet_id: str,
    day: str,
    world: str | None,
    family: str,
    specials: int,
    w: int,
    h: int,
    n: int = 0,
    candidates: int | None = None,
) -> Board:
    """The day's board for a pet: a function of its inputs alone (the same on
    every screen and every run). Draws up to R.HOP_CANDIDATES candidates and
    takes the first that passes check(); else the hand-made fallback for the
    (family, specials, size). `n` is the practice board's number (ship 5; 0
    is the day's board). Blocking: run it in the executor."""
    rng = random.Random(_seed(pet_id, day, world, family, specials, w, h, n))
    tries = R.HOP_CANDIDATES if candidates is None else candidates
    for i in range(tries):
        board = _candidate(rng, family, specials, w, h)
        needs = specials == 1 and rng.random() < 0.5
        if check(board, needs).ok:
            return _stamp(board, pet_id, day, world, n, False, i + 1)
    grid = fallback_grid(family, specials, w, h)
    board = Board(w, h, grid, family, specials)
    return _stamp(board, pet_id, day, world, n, True, tries)


def _stamp(
    board: Board,
    pet_id: str,
    day: str,
    world: str | None,
    n: int,
    fallback: bool,
    tries: int,
) -> Board:
    bid = board_id(
        pet_id, day, board.w, board.h, board.grid, board.family, board.specials, n
    )
    return Board(
        board.w,
        board.h,
        board.grid,
        board.family,
        board.specials,
        world,
        bid,
        fallback,
        tries,
    )


def fallback_grid(family: str, specials: int, w: int, h: int) -> tuple[str, ...]:
    """The hand-made board for a (family, specials, size) no candidate passed."""
    key = "base" if specials == 0 else family
    return FALLBACKS[(key, specials, w, h)]


# The fallback boards, one per (family, specials, size); a baby's are shared
# ("base": no special). Each is the first candidate from the seed
# f"fallback|{key}|{specials}|{w}x{h}" that passed check() with a child's
# win needing its use, and that the noisy bot won 20 times in 20; then pinned
# here, so a generator change does not move them. tests/test_hop.py checks them.
FALLBACKS: dict[tuple[str, int, int, int], tuple[str, ...]] = {
    ("base", 0, 4, 3): ("f.N.", "..#.", "P.o."),  # 3 wins, 1 tidy, 4/10 moves
    ("hop", 1, 5, 4): (
        "..N~f",
        "o....",
        ".#...",
        "~of.P",
    ),  # 13 wins, 2 tidy, 8/16 moves
    ("glide", 1, 5, 4): (
        "N.f~.",
        "..#.o",
        "....f",
        "....P",
    ),  # 87 wins, 6 tidy, 6/18 moves
    ("swim", 1, 5, 4): (
        "..N..",
        "f....",
        ".o.~~",
        "P...f",
    ),  # 96 wins, 14 tidy, 13/19 moves
    ("dig", 1, 5, 4): (
        "..N..",
        "o....",
        "~..fo",
        "P#.f.",
    ),  # 106 wins, 2 tidy, 6/18 moves
    ("climb", 1, 5, 4): (
        "....N",
        ".....",
        "#...f",
        "P#of.",
    ),  # 317 wins, 12 tidy, 7/17 moves
    ("squeeze", 1, 5, 4): (
        ".N...",
        ".#..o",
        "f.o..",
        "f#..P",
    ),  # 140 wins, 14 tidy, 10/18 moves
    ("hop", 1, 4, 4): ("N.of", "o#..", ".f~.", "..~P"),  # 6 wins, 2 tidy, 9/13 moves
    ("glide", 1, 4, 4): ("N~ff", "..o~", "....", "..oP"),  # 20 wins, 2 tidy, 9/13 moves
    ("swim", 1, 4, 4): ("oNf#", "~f~.", ".o..", "...P"),  # 32 wins, 1 tidy, 7/13 moves
    ("dig", 1, 4, 4): ("f.oN", "...#", "..#f", "P..."),  # 7 wins, 2 tidy, 11/13 moves
    ("climb", 1, 4, 4): ("N#f#", "..fo", "....", "o~.P"),  # 22 wins, 2 tidy, 6/12 moves
    ("squeeze", 1, 4, 4): (
        "o.N#",
        "...o",
        "...f",
        "P#~f",
    ),  # 5 wins, 2 tidy, 9/13 moves
    ("hop", 2, 6, 4): (
        ".....N",
        "f~.o#.",
        "f~....",
        "P..~..",
    ),  # 1111 wins, 4 tidy, 6/20 moves
    ("glide", 2, 6, 4): (
        "N..o.#",
        "~..f..",
        "#.~f..",
        "...o.P",
    ),  # 15082 wins, 95 tidy, 6/18 moves
    ("swim", 2, 6, 4): (
        "...ffN",
        "..~.~~",
        "o.....",
        "P...~.",
    ),  # 1207 wins, 8 tidy, 8/20 moves
    ("dig", 2, 6, 4): (
        "f..##N",
        "#.o.#.",
        "f#....",
        "P#o..f",
    ),  # 68 wins, 6 tidy, 13/18 moves
    ("climb", 2, 6, 4): (
        "#..N#f",
        "..o...",
        "..f#.o",
        "P.f..#",
    ),  # 1210 wins, 49 tidy, 10/20 moves
    ("squeeze", 2, 6, 4): (
        ".#..No",
        ".~...#",
        "..f~.o",
        "P#...f",
    ),  # 155 wins, 1 tidy, 11/19 moves
    ("hop", 2, 5, 4): (
        ".N...",
        ".of..",
        ".##.~",
        "...fP",
    ),  # 928 wins, 12 tidy, 5/15 moves
    ("glide", 2, 5, 4): (
        ".foN.",
        "..~~.",
        "f~..o",
        "P#..#",
    ),  # 30 wins, 4 tidy, 5/12 moves
    ("swim", 2, 5, 4): (
        "N~f~~",
        ".o..~",
        "ff.o.",
        "~...P",
    ),  # 720 wins, 113 tidy, 11/15 moves
    ("dig", 2, 5, 4): (
        "#N.fo",
        "o.#ff",
        ".#...",
        "....P",
    ),  # 65 wins, 5 tidy, 6/15 moves
    ("climb", 2, 5, 4): (
        "#.N..",
        "o....",
        "##o..",
        "#fffP",
    ),  # 396 wins, 31 tidy, 7/15 moves
    ("squeeze", 2, 5, 4): (
        "...N~",
        "~fo..",
        "#f.f.",
        "P....",
    ),  # 18613 wins, 57 tidy, 8/16 moves
    ("hop", 3, 6, 4): (
        "o.~N.f",
        "..f...",
        ".#..~.",
        "Pf.#..",
    ),  # 782 wins, 12 tidy, 7/19 moves
    ("glide", 3, 6, 4): (
        "~N.o.#",
        "f.....",
        "f~f..#",
        "#....P",
    ),  # 3903 wins, 127 tidy, 8/18 moves
    ("swim", 3, 6, 4): (
        ".~N..~",
        "o.~f.f",
        "..~.~.",
        "..f..P",
    ),  # 1136 wins, 19 tidy, 10/20 moves
    ("dig", 3, 6, 4): (
        "N..~..",
        "..ff.#",
        "..#f#.",
        "..#o.P",
    ),  # 91 wins, 4 tidy, 7/17 moves
    ("climb", 3, 6, 4): (
        ".#.~.N",
        ".#.f.o",
        "..f.o.",
        "P.f.#.",
    ),  # 4254 wins, 42 tidy, 8/20 moves
    ("squeeze", 3, 6, 4): (
        "N~..##",
        "...o..",
        "..f.~f",
        "f~o..P",
    ),  # 5589 wins, 43 tidy, 12/22 moves
    ("hop", 3, 5, 4): (
        ".oN..",
        "~....",
        ".#~ff",
        "P~.f.",
    ),  # 476 wins, 8 tidy, 6/15 moves
    ("glide", 3, 5, 4): (
        "o~##N",
        "....#",
        "of...",
        "Pf.f#",
    ),  # 622 wins, 47 tidy, 7/12 moves
    ("swim", 3, 5, 4): (
        "....N",
        "~..f~",
        "f.~o.",
        "P.f..",
    ),  # 3501 wins, 101 tidy, 9/17 moves
    ("dig", 3, 5, 4): (
        "N..of",
        "#...#",
        "f..#f",
        ".o..P",
    ),  # 162 wins, 16 tidy, 9/16 moves
    ("climb", 3, 5, 4): (
        "#No##",
        "....o",
        "..f#.",
        "f..fP",
    ),  # 606 wins, 101 tidy, 10/16 moves
    ("squeeze", 3, 5, 4): (
        "...N.",
        "f~f.o",
        ".#~of",
        "P...~",
    ),  # 3958 wins, 55 tidy, 12/18 moves
}
