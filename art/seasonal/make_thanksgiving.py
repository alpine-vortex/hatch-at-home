"""Thanksgiving pieces for the card's seasonal touches, drawn in code.

Usage: python art/seasonal/make_thanksgiving.py [out dir]  (default art/seasonal/out)

Stand-ins in the Halloween stand-ins' style (dark brown outline, two or three
tones, 4 px art pixels) and on the same canvases as their Halloween
counterparts, so the card places both alike: a hat's brim on the bottom edge,
a walker's feet on the bottom edge, a flyer facing right. The Hatch API Art
session is asked to redraw them at the same names, sizes and anchoring.
"""

from __future__ import annotations

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
    "L": (198, 58, 38, 255),  # leaves: red, orange, gold
    "l": (232, 112, 30, 255),
    "Y": (240, 182, 44, 255),
    "y": (255, 222, 120, 255),
    "t": (120, 96, 72, 255),  # twine, twigs
    "B": (150, 92, 44, 255),  # wicker, horn of plenty
    "b": (192, 132, 70, 255),
    "k": (104, 60, 28, 255),
    "O": (240, 138, 42, 255),  # pumpkin
    "d": (196, 93, 26, 255),
    "s": (122, 150, 54, 255),  # stems, green gourd
    "S": (78, 102, 34, 255),
    "R": (204, 48, 48, 255),  # apples, cranberries
    "r": (240, 110, 90, 255),
    "G": (240, 206, 84, 255),  # yellow gourd
    "c": (226, 172, 92, 255),  # crust
    "C": (186, 118, 50, 255),
    "p": (210, 104, 38, 255),  # pumpkin pie filling
    "n": (252, 250, 240, 255),  # cream
    "P": (236, 236, 244, 255),  # plate
    "q": (186, 186, 206, 255),
    "K": (52, 44, 64, 255),  # pilgrim hat
    "H": (92, 82, 110, 255),
    "Z": (28, 22, 36, 255),
    "T": (118, 72, 38, 255),  # turkey
    "u": (156, 100, 54, 255),
    "h": (230, 190, 160, 255),
    "e": (138, 138, 146, 255),  # goose
    "E": (196, 196, 204, 255),
    "N": (40, 36, 44, 255),
    "w": (246, 246, 250, 255),
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
    img.save(OUT / f"season_thanksgiving_{name}.png")


def grid(rows: list[str], lined: bool = True) -> list[list[str]]:
    g = from_rows(rows)
    return outline(g) if lined else g


# Costumes: 16 x 12 (hat), 20 x 10, 18 x 10, 16 x 12 art pixels with the outline;
# the bottom row is where the costume meets the head.
PILGRIM_HAT = [
    "....KKKKKK....",
    "....KHKKKK....",
    "...KKHKKKKK...",
    "...KKHKKKKK...",
    "...KKKKKKKK...",
    "...ZZYYYYZZ...",
    "...ZZYZZYZZ...",
    "...ZZYYYYZZ...",
    "KKKKKKKKKKKKKK",
    ".KKKKKKKKKKKK.",
]
LEAF_CROWN = [
    "..L......Y......l.",
    ".LLL....YYY....lll",
    "LLLLL..YYYYY..llll",
    ".LLL.lYYYYYYYl.ll.",
    "..L.lll.YYY.lll.L.",
    "...lllll.Y.lllllLL",
    "tttttttttttttttttt",
    "tttttttttttttttttt",
]
FEATHER_BAND = [
    "....l..Y..L..Y..",
    "...lll.YY.LL.YY.",
    "..llll.YYYLLLYY.",
    ".lllLL.YYLLLYYY.",
    ".llLLLLYYLLYYYl.",
    "..LLLLYYYLYYYll.",
    "...LLYYYYYYYll..",
    "BBBBBBBBBBBBBBBB",
]
ACORN_CAP = [
    "......kk......",
    "......kk......",
    "...BBBBBBBB...",
    "..BkBkBkBkBB..",
    ".BBkBkBkBkBkB.",
    ".BkBkBkBkBkBB.",
    "BBBBBBBBBBBBBB",
    "BkBkBkBkBkBkBk",
    "bbbbbbbbbbbbbb",
    "bbbbbbbbbbbbbb",
]

# The ground piece of the day (28 x 26 art pixels, like the jack-o'-lanterns).
CORNUCOPIA = [
    "..................RR.GG.....",
    "...............sRRrRGGGG....",
    "...........BBBBRRRRRGGGG.OO.",
    "........BBBbbbBBRRRsssGOOOOO",
    "......BBbbbbbbbBBsssssOOdOOO",
    ".....BbbbBBBbbbbBssGGGOOdOOO",
    "....BbbBBkkkBBbbbBGGGGOOOOOO",
    "...BbBBkkkkkkkBbbBGGGGRRROOO",
    "...BbBkk....kkBbbBGGRRRrRR..",
    "..BbBk.......kBbbBRRRRRRRR..",
    "..BbBk.......kBbbBRRRRRRR...",
    ".BbBk.........kBbbbBRRRR....",
    ".BbBk.........kBbbbBBB......",
    ".BbB...........kBbbbbB......",
    "BbB.............kBBbbB......",
    "BbB..............kBBB.......",
    "BB..........................",
    "Bk..........................",
    ".kk.........................",
    "..kkk.......................",
]
GOURDS = [
    "..........s.................",
    ".........ss..........s......",
    "......OOOOOOOO......Ss......",
    "....OOOOdOOOOdOO...GGGG.....",
    "...OOOOOdOOOOOdOO.GGGGGG....",
    "..OOOOOOdOOOOOOdOOGGGGGG....",
    "..OOOOOOdOOOOOOdOOGGGGGG....",
    "..OOOOOOdOOOOOOdOO.GGGG.....",
    "..OOOOOOdOOOOOOdOO.GGGGG....",
    "...OOOOOdOOOOOdOOGGGGGGGG...",
    "...OOOOOdOOOOOdOGGGGGGGGGG..",
    "....OOOOOOOOOOOGGGGGGGGGGG..",
    "...sssss.......GGGGGGGGGG...",
    "..ssSssSs..s....GGGGGGG.....",
    ".ssSssSsss.s................",
    ".sSssSssSsss................",
    ".ssSssSssSss................",
    "..ssSssSsss.................",
    "....sssss...................",
]
BASKET = [
    "......RR..RR..RR............",
    ".....RrRRRrRRRrRR...........",
    "....RRRRRRRRRRRRRR..........",
    "...RRRRRRRRRRRRRRRR.........",
    "..BBBBBBBBBBBBBBBBBBB.......",
    "..BbkbkbkbkbkbkbkbkbB.......",
    "..BkbkbkbkbkbkbkbkbkB.......",
    "...BbkbkbkbkbkbkbkbB........",
    "...BkbkbkbkbkbkbkbkB........",
    "....BbkbkbkbkbkbkbB.........",
    "....BkbkbkbkbkbkbkB.........",
    ".....BBBBBBBBBBBBB..........",
]

# Corner leaves (16 x 16), drawn for the top-right corner; the card mirrors them.
LEAVES = [
    "..tttttttttttttt",
    ".....LL...t...t.",
    "....LLLL..t..YY.",
    "...LLLLLL.t.YYYY",
    "....LLLL..tYYYYY",
    ".....LL....YYYY.",
    "......t.....YY..",
    ".....lll........",
    "....lllll.......",
    ".....lll........",
    "......l.........",
]

# Falling leaves (4 x 4 art pixels each, outlined).
FALLING = {
    1: ["L.", "LL"],
    2: [".l", "ll"],
    3: ["Y", "Y"],
}

# The treat day's plate and the hearth's doorstep (12 x 6), and the snack (32 x 32).
PLATE = [
    "..pppppp..",
    ".cpppppnc.",
    "PPPPPPPPPP",
    ".qqqqqqqq.",
]
PIE = [
    "...........nnn..........",
    "..........nnnnn.........",
    ".....ppppppnnnpppp......",
    "...ppppppppppppppppp....",
    "..cppppppppppppppppppc..",
    ".ccccccccccccccccccccccc",
    ".cCcCcCcCcCcCcCcCcCcCcCc",
    "PPPPPPPPPPPPPPPPPPPPPPPP",
    ".qqqqqqqqqqqqqqqqqqqqqq.",
]

# The visitor: a turkey stepping along (17 x 17), facing right, two frames.
TURKEY = [
    [
        "..L.Y.l.L.Y......",
        ".LlYlLYlLlY......",
        "LlYlLYlLlYlL.....",
        "LYlLYlLlYlLY..R..",
        "lLYlLTTTTlYl.hhY.",
        ".lYLTTuuuTTL.hh..",
        "..LTTuuuuuTTThR..",
        "...TTuuuuuuTTTR..",
        "...TTTuuuuTTT....",
        "....TTTTTTTT.....",
        ".....TTTTTT......",
        "......Y..Y.......",
        "......Y..Y.......",
        ".....YY.YY.......",
    ],
    [
        "..L.Y.l.L.Y......",
        ".LlYlLYlLlY......",
        "LlYlLYlLlYlL.....",
        "LYlLYlLlYlLY..R..",
        "lLYlLTTTTlYl.hhY.",
        ".lYLTTuuuTTL.hh..",
        "..LTTuuuuuTTThR..",
        "...TTuuuuuuTTTR..",
        "...TTTuuuuTTT....",
        "....TTTTTTTT.....",
        ".....TTTTTT......",
        ".....Y....Y......",
        "....Y......Y.....",
        "...YY......YY....",
    ],
]

# Geese fly over in a V (15 x 8 each), facing right, wings up and down.
GOOSE = [
    [
        "....ee.........",
        "....eEe........",
        ".....eEe.......",
        "..eeeeEEeeNNN..",
        ".eEEEEEEEEeNwNY",
        "..eeeeeeeee....",
    ],
    [
        "...............",
        "...............",
        "..eeeeeeeeNNN..",
        ".eEEEEEEEEeNwNY",
        "..eeeeEEeee....",
        ".....eEe.......",
        "....eEe........",
        "....ee.........",
    ],
]

# A garland tile (24 x 8): leaves on a sagging twine.
BUNTING = [
    "tt....................tt",
    "..tttt............tttt..",
    "......tttttttttttt......",
    "..LLL....lll....YYY.....",
    ".LLLLL..lllll..YYYYY....",
    "..LLL....lll....YYY.....",
    "...L......l......Y......",
]

# The device's decoration (32 x 32): a sheaf of wheat tied with a ribbon.
SHEAF = [
    "....y..y..y..y....",
    "...yYyyYyyYyyYy...",
    "...YyYYyYYyYYyY...",
    "..yYyyYyyYyyYyYy..",
    "...YyYYyYYyYYyY...",
    "....Y..Y..Y..Y....",
    ".....Y.Y..Y.Y.....",
    "......YY..YY......",
    ".......YYYY.......",
    "......LLLLLL......",
    ".....LLlLLlLL.....",
    "......LLLLLL......",
    ".......YYYY.......",
    "......YY..YY......",
    ".....Y.Y..Y.Y.....",
    "....Y..Y..Y..Y....",
    "...Y...Y..Y...Y...",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save(grid(PILGRIM_HAT), "pilgrim_hat")
    save(grid(LEAF_CROWN), "leaf_crown")
    save(grid(FEATHER_BAND), "feather_band")
    save(grid(ACORN_CAP), "acorn_cap")
    save(grid(CORNUCOPIA), "cornucopia", (28, 26))
    save(grid(GOURDS), "gourds", (28, 26))
    save(grid(BASKET), "basket", (28, 26))
    save(grid(LEAVES), "leaves", (16, 16))
    for i, rows in FALLING.items():
        save(grid(rows), f"leaf_{i}", (4, 4))
    save(grid(PLATE), "plate", (12, 6))
    save(grid(PIE), "pie", (32, 32))
    for i, rows in enumerate(TURKEY, 1):
        save(grid(rows), f"turkey_{i}", (17, 17))
    for i, rows in enumerate(GOOSE, 1):
        save(grid(rows), f"goose_{i}", (17, 10))
    save(grid(BUNTING, lined=False), "bunting", (24, 8))
    save(grid(SHEAF), "deco", (32, 32))


if __name__ == "__main__":
    main()
