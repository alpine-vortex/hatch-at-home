"""Hand-placed winter pieces too small for the image model (bunting, frost, mug, light_wreath, twinkle_1/2),
and an outline fix for two Luna cuts (hare_1/2, knit_cap) whose outline sampled as a pale mauve.

Luna's sheets turned these to mush at 7-10 art px tall, so they are drawn here as pixel maps on the
64 grid (4 image px per art px), the same way as art/house/make_house.py.
usage: make_winter_small.py OUTDIR (the frontend ui dir: the outline fix edits the Luna cuts there; idempotent)
"""

import pathlib
import sys

from PIL import Image

OUTLINE = (59, 26, 12, 255)
PAL = {
    "O": OUTLINE,
    "W": (244, 248, 255, 255),
    "L": (191, 224, 255, 255),
    "B": (127, 176, 232, 255),
    "r": (210, 58, 58, 255),
    "R": (255, 154, 138, 255),
    "y": (240, 176, 32, 255),
    "Y": (255, 240, 160, 255),
    "g": (63, 160, 74, 255),
    "G": (168, 240, 160, 255),
    "b": (58, 106, 216, 255),
    "X": (168, 200, 255, 255),
    "m": (196, 60, 52, 255),
    "M": (232, 120, 104, 255),
    "D": (140, 34, 34, 255),
    "c": (255, 236, 200, 255),
    "s": (255, 208, 64, 255),
    "S": (240, 160, 32, 255),
    "H": (255, 251, 224, 255),
    "P": (255, 233, 160, 255),
    "k": (90, 90, 96, 255),
    "f": (46, 120, 56, 255),
    "F": (98, 178, 84, 255),
    "e": (30, 84, 40, 255),
}
PX = 4


def render(grid):
    h, w = len(grid), max(len(r) for r in grid)
    im = Image.new("RGBA", (w * PX, h * PX), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch in PAL:
                im.paste(PAL[ch], (x * PX, y * PX, (x + 1) * PX, (y + 1) * PX))
    return im


def outlined(w, h, pix):
    """pix: {(x, y): char}; every empty 4-neighbour inside the canvas becomes outline."""
    g = [["."] * w for _ in range(h)]
    for (x, y), c in pix.items():
        g[y][x] = c
    for x, y in list(pix):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and g[ny][nx] == ".":
                g[ny][nx] = "O"
    return ["".join(r) for r in g]


def bunting():
    # 24x8; the wire meets both edges at row 0 so copies tile seamlessly.
    g = [["."] * 24 for _ in range(8)]
    for x in range(24):
        g[0 if x < 2 or x > 21 else 1][x] = "O"
    bulb = ["..O..", ".OcO.", "OcHcO", "OcccO", ".OcO.", "..O.."]
    for cx, (c, h) in zip(
        (3, 9, 14, 20), (("r", "R"), ("y", "Y"), ("g", "G"), ("b", "X")), strict=True
    ):
        for dy, row in enumerate(bulb):
            for dx, ch in enumerate(row):
                if ch != ".":
                    g[2 + dy][cx - 2 + dx] = {"c": c, "H": h}.get(ch, ch)
    return ["".join(r) for r in g]


def frost():
    # 18x16, flush to the top-right corner: an icy band along the top and the right, icicles, a snowflake.
    w, h = 18, 16
    pix = {}
    for x in range(w):
        pix[(x, 0)] = "W"
        pix[(x, 1)] = "L"
    for y in range(14):
        pix[(17, y)] = "W"
        pix[(16, y)] = "L"
    for x0, wid, n in (
        (1, 2, 4),
        (4, 1, 2),
        (6, 2, 5),
        (9, 1, 3),
        (11, 2, 6),
        (14, 1, 3),
    ):
        for k in range(n):
            for i in range(wid):
                pix[(x0 + i, 2 + k)] = "B" if i == wid - 1 and wid == 2 else "L"
    cx, cy = 9, 12
    for d in (1, 2):
        for p in ((cx + d, cy), (cx - d, cy), (cx, cy + d), (cx, cy - d)):
            pix[p] = "W"
    for p in ((cx + 1, cy + 1), (cx - 1, cy - 1), (cx + 1, cy - 1), (cx - 1, cy + 1)):
        pix[p] = "L"
    pix[(cx, cy)] = "B"
    return outlined(w, h, pix)


def twinkle(big):
    # 17x10, drifting right: a four-point sparkle at the right with three trail dots behind it.
    w, h, cx, cy = 17, 10, 12, 5
    pix = {(x, cy): "P" for x in (2, 5, 8)}
    arm = 3 if big else 2
    for d in range(1, arm + 1):
        c = "S" if d == arm else "s"
        for p in ((cx + d, cy), (cx - d, cy), (cx, cy + d), (cx, cy - d)):
            pix[p] = c
    if big:
        for p in (
            (cx + 1, cy + 1),
            (cx - 1, cy - 1),
            (cx + 1, cy - 1),
            (cx - 1, cy + 1),
        ):
            pix[p] = "s"
    pix[(cx, cy)] = "H"
    return outlined(w, h, pix)


def light_wreath():
    # 20x10 canvas, art in rows 2..9 (as the stand-in): a fir band with four little bulbs standing on it.
    w, h = 20, 10
    pix = {}
    for x in range(1, 19):
        pix[(x, 6)] = "F" if x % 2 == 0 else "f"
        pix[(x, 7)] = "f"
        pix[(x, 8)] = "F" if x % 3 == 1 else "e"
    for cx, (c, hi) in zip(
        (3, 8, 12, 16), (("r", "R"), ("y", "Y"), ("b", "X"), ("r", "R")), strict=True
    ):
        pix[(cx, 3)] = c
        for dx in (-1, 0, 1):
            pix[(cx + dx, 4)] = hi if dx == 0 else c
        pix[(cx, 5)] = "k"
    return outlined(w, h, pix)


def fix_outline(path, mauves):
    """Snap the listed sampled outline colours to the house outline colour."""
    im = Image.open(path).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][:3] in mauves:
                px[x, y] = OUTLINE
    im.save(path)


MUG = [
    ".OOOOOOOO...",
    "OcccccccWO..",
    "OMmmmmmmDOOO",
    "OMmmmmmmDO.O",
    "OMmmmmmmDOOO",
    ".OOOOOOOO...",
]

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    pieces = {
        "bunting": bunting(),
        "frost": frost(),
        "mug": MUG,
        "twinkle_1": twinkle(False),
        "twinkle_2": twinkle(True),
        "light_wreath": light_wreath(),
    }
    for name, grid in pieces.items():
        render(grid).save(out / f"season_winter_{name}.png")
        print(name, len(grid[0]) * PX, "x", len(grid) * PX)
    for name in ("hare_1", "hare_2"):
        fix_outline(out / f"season_winter_{name}.png", {(191, 125, 123), (77, 42, 25)})
    fix_outline(out / "season_winter_knit_cap.png", {(199, 143, 131), (107, 32, 19)})
