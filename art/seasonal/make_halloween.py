"""Halloween pieces for the card's seasonal touches, drawn in code.

Usage: python art/seasonal/make_halloween.py [out dir]  (default art/seasonal/out)

These were the stand-ins (dark brown outline, two or three tones, 4 px art
pixels). On 2026-10-28 the Hatch API Art session redrew all 17; 16 of its
pieces are in frontend/ui, and the witch is still this script's silhouette
(the redraw's purple shading blurred it). The script writes elsewhere so a rerun
never overwrites the redrawn art; copy a piece over by hand if it's wanted.
"""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image

OUT = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else Path(__file__).resolve().parent / "out"
)
PX = 4  # screen pixels per art pixel

OUTLINE = (59, 26, 12, 255)
C = {
    "o": OUTLINE,
    "O": (240, 138, 42, 255),  # pumpkin
    "d": (196, 93, 26, 255),
    "D": (150, 66, 20, 255),
    "h": (255, 184, 92, 255),
    "s": (122, 150, 54, 255),  # stem
    "S": (78, 102, 34, 255),
    "y": (255, 214, 77, 255),  # candle glow
    "Y": (255, 246, 196, 255),
    "r": (232, 104, 28, 255),
    "w": (232, 232, 242, 235),  # web
    "W": (168, 168, 190, 225),
    "b": (112, 96, 148, 255),  # bat: light enough for night scenes
    "B": (160, 142, 196, 255),
    "e": (255, 214, 77, 255),
    "p": (92, 52, 128, 255),  # hat
    "P": (128, 78, 168, 255),
    "q": (66, 34, 96, 255),
    "g": (255, 170, 40, 255),  # hat band
    "G": (255, 214, 77, 255),
    "c": (240, 90, 120, 255),  # sweet
    "C": (255, 150, 170, 255),
    "k": (200, 56, 92, 255),
    "n": (255, 236, 240, 255),
    "K": (52, 44, 64, 255),  # cat ears
    "m": (240, 150, 170, 255),
    "R": (214, 54, 54, 255),  # horns
    "x": (150, 30, 40, 255),
    "j": (246, 246, 252, 235),  # ghost
    "J": (206, 210, 232, 235),
    "z": (40, 30, 50, 255),
    "Z": (24, 18, 34, 255),  # witch silhouette
    "1": (250, 212, 60, 255),  # candy corn
    "2": (244, 130, 32, 255),
    "3": (252, 250, 240, 255),
    "4": (226, 106, 26, 255),  # bunting
    "5": (120, 70, 168, 255),
    "6": (58, 48, 70, 255),
    "7": (120, 96, 72, 255),
}


def from_rows(rows: list[str]) -> list[list[str]]:
    width = max(len(r) for r in rows)
    return [list(r.ljust(width, ".")) for r in rows]


def outline(grid: list[list[str]]) -> list[list[str]]:
    """A dark outline round every filled pixel (4-neighbours), on a grid one
    pixel bigger each side."""
    h, w = len(grid), len(grid[0])
    big = [["."] * (w + 2) for _ in range(h + 2)]
    for y in range(h):
        for x in range(w):
            big[y + 1][x + 1] = grid[y][x]
    out = [row[:] for row in big]
    for y in range(h + 2):
        for x in range(w + 2):
            if big[y][x] != ".":
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h + 2 and 0 <= nx < w + 2 and big[ny][nx] not in ".o":
                    out[y][x] = "o"
                    break
    return out


def save(grid: list[list[str]], name: str, size: tuple[int, int] | None = None) -> None:
    h, w = len(grid), len(grid[0])
    cw, ch = size or (w, h)
    img = Image.new("RGBA", (cw * PX, ch * PX), (0, 0, 0, 0))
    ox, oy = (cw - w) // 2, ch - h  # centred, standing on the bottom
    for y, row in enumerate(grid):
        for x, k in enumerate(row):
            if k != ".":
                for i in range(PX):
                    for j in range(PX):
                        img.putpixel(((x + ox) * PX + i, (y + oy) * PX + j), C[k])
    img.save(OUT / f"season_halloween_{name}.png")


FACES = {
    1: [  # the grin
        "...y........y.....",
        "..yYy......yYy....",
        ".yyYyy....yyYyy...",
        "yyyyyyy..yyyyyyy..",
        "..................",
        "y.yyy.yyyy.yyy.y..",
        "yyyyyyyYYyyyyyyy..",
        ".yyyyyyyyyyyyyy...",
        "...yy..yyy..yy....",
    ],
    2: [  # surprised
        "..yyy......yyy....",
        ".yyYyy....yyYyy...",
        ".yYYYy....yYYYy...",
        ".yyYyy....yyYyy...",
        "..yyy......yyy....",
        "......yyyy........",
        ".....yyYYyy.......",
        ".....yyYYyy.......",
        "......yyyy........",
    ],
    3: [  # happy, eyes shut
        "..................",
        ".yy....yy.yy....yy",
        "..yy..yy...yy..yy.",
        "...yyyy.....yyyy..",
        "..................",
        ".yy............yy.",
        "..yyyyyyyyyyyyyy..",
        "...yyyyYYYYyyyy...",
        ".....yyyyyyyy.....",
    ],
}


def pumpkin(face: int = 1) -> list[list[str]]:
    """A jack-o'-lantern: lobed body, stem, a lit face."""
    w, h = 26, 20
    cx, cy, rx, ry = 12.5, 10.5, 12.6, 9.6
    grid = [["."] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            u, v = (x - cx) / rx, (y - cy) / ry
            if u * u + v * v > 1:
                continue
            # Five lobes across; darker at a lobe's edges and on the right.
            lobe = (u + 1) * 2.5
            edge = min(lobe % 1, 1 - lobe % 1)
            k = "O"
            if edge < 0.16:
                k = "d"
            if u > 0.55 and edge < 0.3 or v > 0.75:
                k = "D" if k == "d" else "d"
            if u < -0.15 and v < -0.35 and edge > 0.3:
                k = "h"
            grid[y][x] = k
    # The grin and eyes, carved (orange rim at the top of each cut).
    for j, row in enumerate(FACES[face]):
        for i, k in enumerate(row):
            if k != ".":
                grid[4 + j][4 + i] = k
    for y in range(1, h):
        for x in range(w):
            if grid[y][x] in "yY" and grid[y - 1][x] in "OdDh":
                grid[y - 1][x] = "r"
    stem = ["..sS", ".sS.", ".sS.", ".sS."]
    top = [["."] * w for _ in range(len(stem))]
    for j, row in enumerate(stem):
        for i, k in enumerate(row):
            if k != ".":
                top[j][11 + i] = k
    return outline(top + grid)


def cobweb() -> list[list[str]]:
    """A corner web: threads from the top-right corner, sagging rings."""
    n = 16
    grid = [["."] * n for _ in range(n)]
    import math

    for a in range(5):  # spokes
        ang = math.pi / 2 + a * (math.pi / 2) / 4
        for t in range(n * 2):
            r = t / 2
            x = round(n - 1 + math.cos(ang) * r)
            y = round(math.sin(ang) * r)
            if 0 <= x < n and 0 <= y < n:
                grid[y][x] = "w"
    for ring in (5, 9.5, 14):  # rings sag between spokes
        for s in range(200):
            ang = math.pi / 2 + (s / 199) * (math.pi / 2)
            seg = ((ang - math.pi / 2) / (math.pi / 8)) % 1
            r = ring * (1 - 0.12 * math.sin(seg * math.pi))
            x = round(n - 1 + math.cos(ang) * r)
            y = round(math.sin(ang) * r)
            if 0 <= x < n and 0 <= y < n and grid[y][x] == ".":
                grid[y][x] = "W"
    return grid


BAT = [
    [
        "o.............o",
        "oo....o.o....oo",
        "oBo...ooo...oBo",
        "obBo.obbbo.oBbo",
        "obbBoobebboBbbo",
        ".obbbbbbbbbbbo.",
        "..obbo.o.obbo..",
        "...oo.....oo...",
    ],
    [
        "......o.o......",
        "......ooo......",
        ".....obbbo.....",
        "..oooobebooooo.",
        ".obbbbbbbbbbbbo",
        "obBbbo.o.obbBbo",
        "oBo..........Bo",
        "oo............o",
    ],
]

HAT = [
    "..........oo..",
    ".........oPqo.",
    "........oPpqo.",
    ".......oPppqo.",
    "......oPpppqo.",
    ".....oPppppqo.",
    "....oPpppppqo.",
    "...ogGgggggggo",
    "...oggggggggo.",
    "ooopppppppppqooo",
    "oPPPpppppppppqqo",
    ".oooooooooooooo.",
]

SWEET = [
    "oo........oo",
    "oCo.oooo.oCo",
    "ocCoCnccocco",
    "ockoccckokko",
    "oCo.oooo.oCo",
    "oo........oo",
]


def body(w: int, h: int) -> list[list[str]]:
    """A small plain pumpkin (no face), for the pumpkin cap."""
    grid = [["."] * w for _ in range(h)]
    cx, cy, rx, ry = (w - 1) / 2, (h - 1) / 2, w / 2, h / 2
    for y in range(h):
        for x in range(w):
            u, v = (x - cx) / rx, (y - cy) / ry
            if u * u + v * v <= 1:
                lobe = (u + 1) * 1.5
                edge = min(lobe % 1, 1 - lobe % 1)
                k = "d" if edge < 0.18 or u > 0.5 else "O"
                if u < -0.2 and v < -0.2 and edge > 0.3:
                    k = "h"
                grid[y][x] = k
    return grid


def pumpkin_cap() -> list[list[str]]:
    stem = [["."] * 14 for _ in range(3)]
    for j, row in enumerate(["..sS", ".sS.", ".sS."]):
        for i, k in enumerate(row):
            if k != ".":
                stem[j][6 + i] = k
    return outline(stem + body(14, 9))


def ears(kind: str) -> list[list[str]]:
    """A headband with two cat ears."""
    w, h = 18, 9
    grid = [["."] * w for _ in range(h)]
    fill, inner, band = ("K", "m", "K") if kind == "cat" else ("R", "x", "x")
    for side in (0, 1):
        for y in range(h - 2):
            half = (y + 1) * (0.55 if kind == "cat" else 0.4)
            # cat ears stand up; horns lean outwards and curl in at the tip
            apex = 3 if kind == "cat" else 2 + (h - 3 - y) * 0.35
            cx = apex if side == 0 else w - 1 - apex
            for x in range(w):
                if abs(x - cx) <= half:
                    grid[y][x] = fill
            if kind == "cat" and y >= 2:
                for x in range(w):
                    if abs(x - cx) <= half - 1.2:
                        grid[y][x] = inner
    for x in range(2, w - 2):  # a thin band, so it reads as ears, not a bar
        grid[h - 1][x] = band
    del grid[h - 2]
    return outline(grid)


GHOST = [
    [
        ".....jjjjj.....",
        "...jjjjjjjjJ...",
        "..jjjjjjjjjjJ..",
        ".jjjjjjjjjjjjJ.",
        ".jjjzzjjjzzjjJ.",
        ".jjjzzjjjzzjjJ.",
        "jjjjjjjjjjjjjjJ",
        "jjjmjjzzjjjmjjJ",
        "jjjjjjzzjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jj.jjjj.jjjj.jJ",
        "j...jj...jj...J",
    ],
    [
        ".....jjjjj.....",
        "...jjjjjjjjJ...",
        "..jjjjjjjjjjJ..",
        ".jjjjjjjjjjjjJ.",
        ".jjjzzjjjzzjjJ.",
        ".jjjzzjjjzzjjJ.",
        "jjjjjjjjjjjjjjJ",
        "jjjmjjzzjjjmjjJ",
        "jjjjjjzzjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jjjjjjjjjjjjjjJ",
        "jjjj.jjjj.jjjjJ",
        ".jj...jj...jj..",
    ],
]

WITCH = [
    "...........Z...............",
    "..........ZZ...............",
    ".........ZZZ...............",
    "........ZZZZ...............",
    ".......ZZZZZZZ.............",
    "........ZZZZ...............",
    ".......ZZZZZZ..............",
    "......ZZZZZZZZ.............",
    "ZZZZZZZZZZZZZZZZZZZZZZ.ZZ..",
    ".........ZZ.Z........ZZZZZ.",
    ".....................ZZZZ..",
]

# Little devil horns on a band: tips curl outwards.
HORNS = [
    "R..............R",
    "RR............RR",
    ".RR..........RR.",
    ".RRx........xRR.",
    "..RRx......xRR..",
    "..RRRx....xRRR..",
    "..xxxxxxxxxxxx..",
]

CANDY = [
    "....3....",
    "...333...",
    "...222...",
    "..22222..",
    "..22222..",
    ".1111111.",
    ".1111111.",
    "111111111",
]

# One tile of bunting: the string sags a little; three pennants hang from it.
BUNTING = [
    "77....................77",
    "..7777............7777..",
    "......777777777777......",
    "..44444...55555...66666.",
    "..44444...55555...66666.",
    "...444.....555.....666..",
    "...444.....555.....666..",
    "....4.......5.......6...",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    save(pumpkin(), "pumpkin")
    for face in (2, 3):
        save(pumpkin(face), f"pumpkin_{face}")
    save(pumpkin_cap(), "pumpkin_cap")
    save(ears("cat"), "cat_ears")
    save(outline(from_rows(HORNS)), "horns")
    for i, rows in enumerate(GHOST, 1):
        save(outline(from_rows(rows)), f"ghost_{i}")
    save(from_rows(WITCH), "witch")
    save(outline(from_rows(CANDY)), "candy", (32, 32))
    save(from_rows(BUNTING), "bunting")
    save(cobweb(), "web")
    for i, rows in enumerate(BAT, 1):
        save(from_rows(rows), f"bat_{i}")
    save(from_rows(HAT), "hat")
    save(from_rows(SWEET), "sweet")
    # The device's own decoration: the same lantern on the deco canvas (32 x 32).
    save(pumpkin(), "deco", (32, 32))


if __name__ == "__main__":
    main()
