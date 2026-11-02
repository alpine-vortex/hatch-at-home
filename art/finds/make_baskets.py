"""V-F baskets, hand-placed (12 cells is below where the image model holds a shape).

One shared wicker basket drawn once and reused pixel for pixel in basket_1/2/3; only the generic
things peeking out change (a red berry, then a gold one, then a green leaf between them).
48 x 48 PNG, 12 x 12 world cells at 4 px, the bottom on the stand-ins' row (docs/plan-2026-11-01-visitors-v2.md §9).
usage: make_baskets.py OUTDIR
"""

import pathlib
import sys

from PIL import Image

PX = 4
OUTLINE = (34, 20, 10, 255)
COL = {
    "O": OUTLINE,
    "r": (214, 160, 90, 255),
    "R": (166, 106, 52, 255),
    "w": (196, 136, 72, 255),
    "W": (138, 88, 44, 255),
    "a": (220, 82, 70, 255),
    "A": (252, 160, 140, 255),
    "y": (236, 196, 72, 255),
    "Y": (255, 242, 170, 255),
    "g": (96, 176, 84, 255),
    "G": (52, 120, 56, 255),
}
BODY = [
    "OOOOOOOOOOOO",
    "OrRrRrRrRrRO",
    ".OwWwWwWwWO.",
    ".OWwWwWwWwO.",
    ".OwWwWwWwWO.",
    "..OOOOOOOO..",
]
BODY_TOP = 5  # rows 5..10; row 11 stays clear, as the stand-ins
THINGS = {
    "berry": {
        (3, 2): "a",
        (2, 3): "A",
        (3, 3): "a",
        (4, 3): "a",
        (2, 4): "a",
        (3, 4): "a",
        (4, 4): "a",
    },
    "gold": {
        (9, 2): "y",
        (8, 3): "Y",
        (9, 3): "y",
        (10, 3): "y",
        (8, 4): "y",
        (9, 4): "y",
        (10, 4): "y",
    },
    "leaf": {
        (6, 1): "g",
        (6, 2): "g",
        (7, 2): "g",
        (6, 3): "G",
        (7, 3): "g",
        (6, 4): "G",
    },
}
SETS = {1: ["berry"], 2: ["berry", "gold"], 3: ["berry", "gold", "leaf"]}


def basket(n):
    g = [["."] * 12 for _ in range(12)]
    pix = {}
    for t in SETS[n]:
        pix.update(THINGS[t])
    for (x, y), c in pix.items():
        g[y][x] = c
    for x, y in pix:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < 12 and 0 <= ny < 12 and g[ny][nx] == ".":
                g[ny][nx] = "O"
    for dy, row in enumerate(BODY):
        for x, c in enumerate(row):
            if c != ".":
                g[BODY_TOP + dy][x] = c
    im = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
    for y, row in enumerate(g):
        for x, c in enumerate(row):
            if c in COL:
                im.paste(COL[c], (x * PX, y * PX, (x + 1) * PX, (y + 1) * PX))
    return im


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for n in SETS:
        basket(n).save(out / f"basket_{n}.png")
