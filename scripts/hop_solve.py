"""Solve a Hop of the Day board: a `board` reply (JSON) on stdin, a winning move
list and a tidy one out, by hop.py's own solver. For a real-HA round trip: the
live board hangs on the dev pet's entry id and today's date, so no fixture list
can match it (plan 2026-11-02-hop-of-the-day, ship 1).

Run from the repo root with the dev venv (the package imports Home Assistant):
    .venv/bin/python scripts/hop_solve.py < board.json
    .venv/bin/python scripts/hop_solve.py --json < board.json
Prints the lists as move letters; --json prints {win, tidy, win_count,
tidy_count, min_win, min_tidy, states}. A list that does not exist is null.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from custom_components.virtual_pet import hop  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="print JSON")
    args = parser.parse_args()
    reply = json.load(sys.stdin)
    board = hop.Board.from_dict(reply.get("board", reply))
    got = hop.solve(board)
    win = hop.encode(got.win) if got.win is not None else None
    tidy = hop.encode(got.tidy) if got.tidy is not None else None
    if args.json:
        print(
            json.dumps(
                {
                    "win": win,
                    "tidy": tidy,
                    "win_count": got.win_count,
                    "tidy_count": got.tidy_count,
                    "min_win": got.min_win,
                    "min_tidy": got.min_tidy,
                    "states": got.states,
                }
            )
        )
    else:
        print(f"win:  {win or '(none)'}")
        print(f"tidy: {tidy or '(none)'}")
    return 0 if win else 1


if __name__ == "__main__":
    sys.exit(main())
