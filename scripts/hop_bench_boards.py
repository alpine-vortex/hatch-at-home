"""Write dev/bench/hop-boards.json: canned `hop` `board` replies for the card bench
(view "board"), built by hop.py itself so no grid is hand-typed (plan
2026-11-02-hop-of-the-day, ship 2b). Each entry is the reply a pet of that family
and stage would get on the fixed day, plus a winning and a tidy move list (move
letters) from hop.py's solver, so the bench can pin a solved or tidy view.

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
ENTRIES = [(family, "adult") for family in hop.FAMILIES] + [
    ("hop", "baby"),
    ("hop", "child"),
    ("hop", "teen"),
]


def main() -> int:
    out = {"gen_version": hop.GEN_VERSION, "day": DAY, "boards": {}}
    for family, stage in ENTRIES:
        specials, w, h = hop.params_for(stage, DAY)
        board = hop.hop_board(PET, DAY, WORLD, family, specials, w, h)
        solved = hop.solve(board)
        out["boards"][f"{family}-{stage}"] = {
            "reply": {
                "result": "ok",
                "day": DAY,
                **board.to_dict(),
                "twist": None,
                "done": False,
                "tidy": False,
            },
            "win": hop.encode(solved.win) if solved.win is not None else None,
            "tidy": hop.encode(solved.tidy) if solved.tidy is not None else None,
        }
    path = os.path.join(ROOT, "dev", "bench", "hop-boards.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")
    print(f"{len(out['boards'])} boards -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
