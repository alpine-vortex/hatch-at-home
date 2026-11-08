"""Write dev/bench/crate-boards.json: canned crate push `board` replies for the card bench
(view "crate"), built by crate_push.py itself (never hand-typed). One board per level for a
fixed pet and day, with its fewest-moves solution (`win`). Run from the repo root with the
dev venv, only when the generator changes (GEN_VERSION); the file is committed:
    .venv/bin/python scripts/crate_bench_boards.py
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from custom_components.virtual_pet import crate_push  # noqa: E402

PET, DAY, WORLD = "bench", "2026-11-09", "woodland"


def main() -> None:
    boards = {}
    for level in crate_push.LEVELS:
        board = crate_push.crate_push_board(PET, DAY, WORLD, level, 1)
        solve = crate_push.solve(board)
        assert solve is not None
        boards[level] = {
            "reply": {
                "result": "ok",
                "day": DAY,
                "id": board.id,
                "round": 1,
                "rounds": {"easy": 0, "normal": 0, "hard": 0},
                "w": board.w,
                "h": board.h,
                "grid": list(board.grid),
                "par": board.par,
            },
            "win": solve.moves,
        }
    out = os.path.join(ROOT, "dev", "bench", "crate-boards.json")
    with open(out, "w") as f:
        json.dump({"gen": crate_push.GEN_VERSION, "boards": boards}, f, indent=1)
        f.write("\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
