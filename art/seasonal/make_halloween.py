"""Halloween pieces for the card's seasonal touches, drawn in code.

Usage: python art/seasonal/make_halloween.py  (writes frontend/ui/season_halloween_*)

Stand-ins in Sol's style (dark brown outline, two or three tones, 4 px art
pixels): a jack-o'-lantern, a cobweb, a bat (two frames), a witch hat and a
sweet. Sol can redraw any of them; the card only needs the file names.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[2] / "custom_components/virtual_pet/frontend/ui"
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


def pumpkin() -> list[list[str]]:
    """A jack-o'-lantern: lobed body, stem, a lit grin."""
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
    face = [
        "...y........y.....",
        "..yYy......yYy....",
        ".yyYyy....yyYyy...",
        "yyyyyyy..yyyyyyy..",
        "..................",
        "y.yyy.yyyy.yyy.y..",
        "yyyyyyyYYyyyyyyy..",
        ".yyyyyyyyyyyyyy...",
        "...yy..yyy..yy....",
    ]
    for j, row in enumerate(face):
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


def main() -> None:
    save(pumpkin(), "pumpkin")
    save(cobweb(), "web")
    for i, rows in enumerate(BAT, 1):
        save(from_rows(rows), f"bat_{i}")
    save(from_rows(HAT), "hat")
    save(from_rows(SWEET), "sweet")
    # The device's own decoration: the same lantern on the deco canvas (32 x 32).
    save(pumpkin(), "deco", (32, 32))


if __name__ == "__main__":
    main()
