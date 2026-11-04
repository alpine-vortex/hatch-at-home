"""Write dev/bench/hop-boards.json: canned `hop` `board` replies for the card bench
(view "board"), built by hop.py itself so no grid is hand-typed (plan
2026-11-02-hop-of-the-day, ship 2b). Each entry is the reply a pet of that family
and stage would get on the fixed day, plus a winning and a tidy move list (move
letters) from hop.py's solver, so the bench can pin a solved or tidy view. The
family boards are woodland's (its stumps from child up, ship 4a); each twist world
adds its own (`<world>-<family>-<stage>`). `landing` is the shortest move list
whose last move ends off its named cell (a stump's twin, a rug's slide), or null
on a board with no twist: the bench's `moves` for a shot just after one. `acted`
is the shortest list whose last move shows the board's twist acting (ship 4b
too): a landing off the named cell, a crackle left half-sunk, a ripple's chain
sinking past the cell left, the lantern lit; null for a pool (the bench pins its
phase with `parity`) and a board with no twist.

Run from the repo root with the dev venv, only when the generator changes
(GEN_VERSION); the file is committed:
    .venv/bin/python scripts/hop_bench_boards.py
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from custom_components.virtual_pet import hop  # noqa: E402

DAY = "2026-06-15"  # a Monday: the full width
WORLD = "woodland"
PET = "bench"
ENTRIES = [(WORLD, family, "adult") for family in hop.FAMILIES] + [
    (WORLD, "hop", "baby"),
    (WORLD, "hop", "child"),
    (WORLD, "hop", "teen"),
    # A twist world's own boards (ship 4a: hearth's rugs; ship 4b: the other four).
    ("hearth", "hop", "adult"),
    ("hearth", "dig", "child"),
    ("terrarium", "hop", "adult"),
    ("tidepool", "swim", "adult"),
    ("pond", "hop", "adult"),
    ("nightsky", "glide", "adult"),
]


def _acts(board: hop.Board, state: hop.State, cell: int, after: hop.State) -> bool:
    """Whether the move shows the board's twist acting."""
    twist = hop.twist_of(board)
    if twist in ("stumps", "rug"):
        return after.pos != cell
    if twist == "crackle":
        return bool(after.half)
    if twist == "ripple":
        return bool(after.sunk & ~(state.sunk | 1 << state.pos))
    if twist == "lantern":
        return board.cells[after.pos] == "*"
    return False


def landing(board: hop.Board, test: object = None) -> str | None:
    """The shortest list (first in index order) whose last move lands off its
    named cell (or passes `test(board, state, cell, after)`), by a
    breadth-first walk of the states."""
    if hop.twist_of(board) is None:
        return None
    if test is None:
        test = lambda board, state, cell, after: after.pos != cell  # noqa: E731
    level = [(hop.start_state(board), [])]
    seen = {level[0][0]}
    while level:
        nxt = []
        for state, path in level:
            for cell in hop.legal_targets(board, state):
                after = hop.apply_move(board, state, cell)
                assert after is not None
                if test(board, state, cell, after):
                    return hop.encode([*path, cell])
                if after not in seen and not after.done:
                    seen.add(after)
                    nxt.append((after, [*path, cell]))
        level = nxt
    return None


def main() -> int:
    out = {"gen_version": hop.GEN_VERSION, "day": DAY, "boards": {}}
    for world, family, stage in ENTRIES:
        specials, w, h = hop.params_for(stage, DAY)
        board = hop.hop_board(PET, DAY, world, family, specials, w, h)
        solved = hop.solve(board)
        name = f"{family}-{stage}" if world == WORLD else f"{world}-{family}-{stage}"
        out["boards"][name] = {
            "reply": {
                "result": "ok",
                "day": DAY,
                **board.to_dict(),
                "twist": hop.twist_of(board),
                "done": False,
                "tidy": False,
            },
            "win": hop.encode(solved.win) if solved.win is not None else None,
            "tidy": hop.encode(solved.tidy) if solved.tidy is not None else None,
            "landing": landing(board),
            "acted": landing(board, _acts),
        }
    path = os.path.join(ROOT, "dev", "bench", "hop-boards.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(f"{len(out['boards'])} boards -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
