#!/usr/bin/env python3
"""Print the card's DRAPE table (src/card/shell-data.js) from the asleep sprites.

The blanket is drawn on the pet's own frame: for each species and stage the rule below turns the
alpha box of <stage>_asleep_1 into a target box for the drape's last frame, and the card scales the
shared art (ui/drape_<s|m|l>_3.png) onto it. Rerun it when a sprite's asleep frame changes and paste
the lines in; tests/test_species.py holds the table to the same rule.

    python3 scripts/drape-table.py
"""

import json
import pathlib
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "custom_components/virtual_pet/frontend"
SIDE = 8  # sprite px the blanket reaches past the body, each side
COVER = 0.4  # the share of the body's height under the blanket on the last frame
MIN_HEIGHT = 16
OPT_OUT = {"bat", "otter"}  # hangs upside down; floats on its back on a ripple


def alpha_box(path: pathlib.Path) -> tuple[int, int, int, int]:
    alpha = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3]
    ys, xs = np.nonzero(alpha)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def art_boxes() -> dict[str, tuple[int, int, int, int]]:
    return {s: alpha_box(FRONTEND / "ui" / f"drape_{s}_3.png") for s in "sml"}


def entry(box: tuple[int, int, int, int], art: dict) -> list:
    left, top, right, bottom = box
    want = (right - left) + 2 * SIDE
    size = min(art, key=lambda s: abs((art[s][2] - art[s][0]) - want))
    height = max(MIN_HEIGHT, round((bottom - top) * COVER))
    return [size, max(0, left - SIDE), bottom - height, min(256, right + SIDE), bottom]


def main() -> None:
    art = art_boxes()
    sprites = FRONTEND / "sprites"
    for sp in sorted(
        p.name for p in sprites.iterdir() if (p / "species.json").exists()
    ):
        if sp in OPT_OUT:
            print(f"  {sp}: null,")
            continue
        stages = [
            s
            for s in json.loads((sprites / sp / "species.json").read_text())["stages"]
            if s != "egg"
        ]
        cells = ", ".join(
            f"{st}: {json.dumps(entry(alpha_box(sprites / sp / f'{st}_asleep_1.png'), art))}"
            for st in stages
        )
        print(f"  {sp}: {{ {cells} }},")


if __name__ == "__main__":
    sys.exit(main())
