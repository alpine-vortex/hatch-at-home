"""Winter lights pieces for the card's seasonal touches, drawn in code.

Usage: python art/seasonal/make_winter.py [out dir]  (default art/seasonal/out)

Stand-ins in the Halloween and Thanksgiving stand-ins' style (dark brown
outline, two or three tones, 4 px art pixels) and on their canvases, so the
card places them alike: a hat's brim on the bottom edge, a walker's feet on the
bottom edge, a flyer facing right. The shipped copies in frontend/ui are these
until the final art swaps the files at the same names and sizes; this script
writes elsewhere, so a rerun never overwrites final art.

Canvases (pixels): hats 64x48 (knit_cap, star_cap) and 80x40 (earmuffs,
light_wreath); lanterns 120x104; bunting 96x32; deco and cookie 128x128; frost
72x64; mug 48x24; twinkle 68x40; the snow hare 68x68.
"""

from __future__ import annotations

import math
from pathlib import Path
import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from make_halloween import from_rows, outline  # noqa: E402

OUT = (
    Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "out"
)
PX = 4  # screen pixels per art pixel

C = {
    "o": (59, 26, 12, 255),
    "R": (200, 56, 56, 255),  # red wool, bulbs
    "r": (238, 116, 104, 255),
    "W": (246, 246, 250, 255),  # snow, fur, trim
    "w": (204, 212, 228, 255),
    "Y": (240, 186, 56, 255),  # gold, star, warm light
    "y": (255, 232, 150, 255),
    "L": (255, 246, 214, 255),  # the glow
    "G": (64, 136, 80, 255),  # green bulbs, greenery
    "g": (112, 182, 112, 255),
    "B": (64, 104, 184, 255),  # blue wool, bulbs
    "b": (128, 168, 228, 255),
    "P": (214, 74, 52, 255),  # paper lantern
    "p": (240, 128, 76, 255),
    "t": (96, 72, 58, 255),  # wire, wood
    "T": (140, 106, 80, 255),
    "s": (150, 150, 160, 255),  # stone
    "S": (112, 112, 124, 255),
    "k": (206, 230, 248, 255),  # frost, glass
    "K": (156, 194, 232, 255),
    "c": (218, 164, 94, 255),  # cookie
    "C": (172, 114, 58, 255),
    "m": (186, 72, 64, 255),  # mug
    "M": (226, 120, 108, 255),
    "n": (240, 152, 164, 255),  # the hare's nose and ears
    "e": (40, 36, 44, 255),
}


def save(grid: list[list[str]], name: str, size: tuple[int, int] | None = None) -> None:
    h, w = len(grid), len(grid[0])
    cw, ch = size or (w, h)
    cw, ch = max(cw, w), max(ch, h)  # never crop a piece that came out bigger
    img = Image.new("RGBA", (cw * PX, ch * PX), (0, 0, 0, 0))
    ox, oy = (cw - w) // 2, ch - h  # centred, standing on the bottom
    for y, row in enumerate(grid):
        for x, k in enumerate(row):
            if k != ".":
                for i in range(PX):
                    for j in range(PX):
                        img.putpixel(((x + ox) * PX + i, (y + oy) * PX + j), C[k])
    img.save(OUT / f"season_winter_{name}.png")


def grid(rows: list[str], lined: bool = True) -> list[list[str]]:
    g = from_rows(rows)
    return outline(g) if lined else g


# A small painter for the round pieces: a w x h grid of "." to fill in.
def blank(w: int, h: int) -> list[list[str]]:
    return [["."] * w for _ in range(h)]


def ellipse(g, cx: float, cy: float, rx: float, ry: float, k: str) -> None:
    for y in range(len(g)):
        for x in range(len(g[0])):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                g[y][x] = k


def rect(g, x0: int, y0: int, x1: int, y1: int, k: str) -> None:
    for y in range(y0, y1):
        for x in range(x0, x1):
            g[y][x] = k


def star(g, cx: float, cy: float, r: float, k: str, inner: float = 0.45) -> None:
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * inner
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    for y in range(len(g)):
        for x in range(len(g[0])):
            px, py = x + 0.5, y + 0.5
            inside = False
            for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1], strict=True):
                if (ay > py) != (by > py) and px < ax + (py - ay) * (bx - ax) / (
                    by - ay
                ):
                    inside = not inside
            if inside:
                g[y][x] = k


def trim(g):
    """Drop empty rows and columns round the drawing."""
    rows = [r for r in g if any(k != "." for k in r)]
    cols = [i for i in range(len(rows[0])) if any(r[i] != "." for r in rows)]
    return ["".join(r[cols[0] : cols[-1] + 1]) for r in rows]


# Costumes: 16 x 12 and 20 x 10 art pixels with the outline; the bottom row is
# where the costume meets the head.
KNIT_CAP = [
    "......WW......",
    ".....WWWW.....",
    "......WW......",
    "....RRRRRR....",
    "...RRrRRrRR...",
    "..RRrRRrRRrR..",
    ".RRrRRrRRrRRR.",
    ".RRRRRRRRRRRR.",
    "WWWWWWWWWWWWWW",
    "WwWwWwWwWwWwWW",
]
EARMUFFS = [
    ".....bbbbbbbb.....",
    "...bb........bb...",
    "..b............b..",
    ".b..............b.",
    "WWW............WWW",
    "WwWW..........WWwW",
    "WWwW..........WwWW",
    ".WW............WW.",
]
LIGHT_WREATH = [
    ".R....Y....B....R.",
    "RrR..YyY..BbB..RrR",
    ".R....Y....B....R.",
    "GGgGGGGgGGGGgGGGGg",
    "GgGGgGGGGgGGGgGGgG",
    "GGGgGGGgGGgGGGgGGG",
]
STAR_CAP = [
    "......Y.......",
    ".....YyY......",
    "....YYYYY.....",
    ".....YYY......",
    ".....BBB......",
    "....BBbBB.....",
    "...BBbBBBB....",
    "..BBbBBYBBB...",
    ".BBbBBBBBBBB..",
    "WWWWWWWWWWWWWW",
]


# The ground piece of the day (30 x 26 art pixels with the outline).
def paper_lantern():
    g = blank(28, 24)
    rect(g, 13, 0, 15, 3, "t")
    rect(g, 9, 3, 19, 5, "t")
    ellipse(g, 14, 12.5, 9, 8, "P")
    for x in (8, 11, 17, 20):  # the ribs
        for y in range(5, 21):
            if g[y][x] == "P":
                g[y][x] = "p"
    ellipse(g, 14, 12.5, 4, 4.5, "L")
    ellipse(g, 14, 12.5, 2, 2.5, "y")
    rect(g, 9, 20, 19, 22, "t")
    rect(g, 13, 22, 15, 24, "T")
    return trim(g)


def star_lamp():
    g = blank(28, 24)
    star(g, 14, 8, 8.5, "Y")
    star(g, 14, 8.5, 4.5, "y")
    ellipse(g, 14, 8.5, 1.6, 1.6, "L")
    rect(g, 13, 15, 15, 22, "t")
    rect(g, 9, 22, 19, 24, "T")
    return trim(g)


def snow_lantern():
    g = blank(28, 24)
    ellipse(g, 14, 3, 12, 3.2, "S")  # the wide roof, snow on top
    ellipse(g, 14, 2, 10, 2.2, "W")
    rect(g, 8, 6, 20, 13, "s")
    rect(g, 11, 7, 17, 12, "L")
    rect(g, 13, 8, 15, 11, "y")
    rect(g, 7, 13, 21, 15, "S")
    rect(g, 12, 15, 16, 21, "s")
    rect(g, 8, 21, 20, 24, "S")
    return trim(g)


# A light string tile (24 x 8), unlined: bulbs on a sagging wire.
BUNTING = [
    "tt....................tt",
    "..tttt............tttt..",
    "...t..tttttttttttt..t...",
    "..RRR..t.....t.....BBB..",
    "..RrR.YYY...GGG....BbB..",
    "...R..YyY...GgG.....B...",
    ".......Y.....G..........",
]

# Frost (16 x 14 inside the 18 x 16 canvas), drawn for the top-right corner.
FROST = [
    "kkkkkkkkkkkkkkkk",
    "kKkkKkkkKkkKkkKk",
    ".kK.kK.kKk.kK.kK",
    ".k..kK..kK..k.kK",
    ".k...k..k...k..k",
    "....k....k.....k",
    "....k..........k",
    "...........k...k",
    "..........kkk..k",
    "...........k....",
    ".......k.k...k..",
    "........kkk.....",
    ".......kkKkk....",
    "........kkk.....",
]

# The mug by Hearth's door (12 x 6), handle to the right.
MUG = [
    "mmmmmmmm..",
    "mMmmmmmmmm",
    "mMmmmmmm.m",
    ".mmmmmmmm.",
]


# The device's decoration (32 x 32): a snow globe with a lit house.
def deco():
    g = blank(30, 30)
    ellipse(g, 15, 12.5, 12, 12, "k")
    ellipse(g, 11, 8, 3, 3, "W")  # the shine
    ellipse(g, 15, 21, 11, 3.5, "W")  # snow inside
    rect(g, 11, 13, 19, 20, "R")  # the house
    for i in range(5):
        rect(g, 10 + i, 12 - i, 20 - i, 13 - i, "t")
    rect(g, 13, 15, 15, 17, "y")
    rect(g, 16, 16, 18, 20, "t")
    for x, y in ((7, 14), (22, 10), (19, 5), (9, 18), (24, 16)):
        g[y][x] = "W"
    rect(g, 6, 24, 24, 26, "T")
    rect(g, 4, 26, 26, 30, "t")
    return trim(g)


# The snack (32 x 32): a star cookie with icing.
def cookie():
    g = blank(30, 30)
    star(g, 15, 16, 14, "C", inner=0.5)
    star(g, 15, 16, 12.5, "c", inner=0.5)
    star(g, 15, 16, 7, "W", inner=0.5)
    for x, y in ((15, 6), (8, 13), (22, 13), (11, 24), (19, 24)):
        g[y][x] = "R"
    return trim(g)


# The night drift (17 x 10): a little light with a trail, facing right; two frames.
TWINKLE = [
    [
        "...........Y...",
        "..........YyY..",
        ".y..y..y.YyLyY.",
        "..........YyY..",
        "...........Y...",
    ],
    [
        "...........Y...",
        "...........Y...",
        "..........YyY..",
        "y..y..y.YYyLyYY",
        "..........YyY..",
        "...........Y...",
        "...........Y...",
    ],
]

# The season's visitor: a snow hare hopping along (17 x 17), facing right, two frames.
HARE_TOP = [
    "..........nW...",
    ".........nWW...",
    "........nWW....",
    "........WWW.WW.",
    ".......WWWWWnW.",
    "......WWWWWWW..",
    "......WWWWeWWn.",
    "..WW.WWWWWWWWW.",
    ".WWWWWWWWWWWw..",
    "WWWWWWWWWWWww..",
    "WWWwWWWWWWWW...",
    ".WWWWWWWWWWW...",
    "..WwWWWWWWww...",
]
HARE = [
    HARE_TOP + ["...WW....WW....", "..WW......WW..."],
    HARE_TOP + ["....WW..WW.....", "....WW..WW....."],
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save(grid(KNIT_CAP), "knit_cap", (16, 12))
    save(grid(EARMUFFS), "earmuffs", (20, 10))
    save(grid(LIGHT_WREATH), "light_wreath", (20, 10))
    save(grid(STAR_CAP), "star_cap", (16, 12))
    save(grid(paper_lantern()), "paper_lantern", (30, 26))
    save(grid(star_lamp()), "star_lamp", (30, 26))
    save(grid(snow_lantern()), "snow_lantern", (30, 26))
    save(grid(BUNTING, lined=False), "bunting", (24, 8))
    save(grid(FROST), "frost", (18, 16))
    save(grid(MUG), "mug", (12, 6))
    save(grid(deco()), "deco", (32, 32))
    save(grid(cookie()), "cookie", (32, 32))
    for i, rows in enumerate(TWINKLE, 1):
        save(grid(rows), f"twinkle_{i}", (17, 10))
    for i, rows in enumerate(HARE, 1):
        save(grid(rows), f"hare_{i}", (17, 17))


if __name__ == "__main__":
    main()
