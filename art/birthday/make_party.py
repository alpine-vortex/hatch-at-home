"""The birthday party hat, hand-placed pixel by pixel (like art/seasonal/).

Usage: python art/birthday/make_party.py [out dir]  (default art/birthday/out)

Same canvas and anchoring as the season hats (64 x 48, 4 px art pixels, the brim
on the bottom row, centred), so the card's costume code places it unchanged.
Copy the result to frontend/ui/season_party_hat.png. Redrawn 2026-10-28 by the
art session: a cone with spiral stripes lit from the left, a pom-pom, and a
blue band with white dots.
"""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image

OUT = (
    Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "out"
)
PX = 4

C = {
    "o": (59, 26, 12, 255),  # outline
    "p": (240, 110, 150, 255),  # pink stripe
    "P": (196, 72, 112, 255),  # its shade
    "q": (255, 170, 196, 255),  # its light
    "y": (255, 214, 77, 255),  # yellow stripe
    "Y": (214, 168, 40, 255),
    "z": (255, 240, 170, 255),
    "w": (252, 250, 240, 255),  # pom-pom, and the band's dots
    "W": (210, 206, 196, 255),
    "b": (92, 168, 220, 255),  # band
    "B": (60, 120, 170, 255),
    "s": (234, 196, 120, 255),  # sponge
    "S": (200, 150, 80, 255),  # its shade
    "c": (255, 246, 214, 255),  # cream filling
    "r": (224, 60, 70, 255),  # cherry
    "f": (255, 150, 40, 255),  # flame
    "g": (200, 204, 214, 255),  # smoke
    "G": (150, 154, 170, 255),  # smoke, darker
    "m": (168, 172, 184, 200),  # smoke wisp: soft, reads on dark and light
    "t": (110, 84, 70, 255),  # string / wick
    "d": (232, 226, 210, 255),  # plate
    "D": (186, 178, 158, 255),  # plate shade
}

HAT = [
    "......oooo......",
    ".....owwwwo.....",
    ".....owwWWo.....",
    "......oooo......",
    "......opPo......",
    ".....ozppPo.....",
    ".....ozyyPo.....",
    "....oqpyyyYo....",
    "....oqpppyYo....",
    "...ozyyppppYo...",
    "..obwbbwbbwbBo..",
    "..oooooooooooo..",
]


# ---- the party pieces (2026-11-20): a grid of art pixels, filled by shape
# helpers, then outlined; the palette above is shared with the hat. ----


class Grid:
    def __init__(self, w: int, h: int, wrap: bool = False):
        self.w, self.h, self.wrap = w, h, wrap
        self.g = [["."] * w for _ in range(h)]

    def put(self, x: int, y: int, k: str) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = k

    def ell(self, cx: float, cy: float, rx: float, ry: float, k, only=None) -> None:
        for y in range(self.h):
            for x in range(self.w):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    kk = k(x, y) if callable(k) else k
                    if kk and (only is None or self.g[y][x] in only):
                        self.g[y][x] = kk

    def rect(self, x0: int, y0: int, x1: int, y1: int, k: str) -> None:
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, k)

    def poly(self, pts, k) -> None:
        n = len(pts)
        for y in range(self.h):
            for x in range(self.w):
                px_, py_ = x + 0.5, y + 0.5
                inside = False
                for i in range(n):
                    (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
                    if (ay > py_) != (by > py_) and px_ < ax + (py_ - ay) * (
                        bx - ax
                    ) / (by - ay):
                        inside = not inside
                if inside:
                    self.put(x, y, k)

    def outline(self, skip="") -> None:
        src = [r[:] for r in self.g]
        for y in range(self.h):
            for x in range(self.w):
                if src[y][x] != ".":
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if self.wrap:
                        nx %= self.w
                    if (
                        0 <= nx < self.w
                        and 0 <= ny < self.h
                        and src[ny][nx] not in ".o" + skip
                    ):
                        self.g[y][x] = "o"
                        break

    def image(self) -> Image.Image:
        img = Image.new("RGBA", (self.w * PX, self.h * PX), (0, 0, 0, 0))
        for y, row in enumerate(self.g):
            for x, k in enumerate(row):
                if k != ".":
                    for i in range(PX):
                        for j in range(PX):
                            img.putpixel((x * PX + i, y * PX + j), C[k])
        return img


CAKE_W, CAKE_H = 40, 35
CANDLES = (9, 19, 29)  # left column of each 2-wide candle


def cake(lit: bool) -> Image.Image:
    """Whole round layer cake, 40 x 35 art px (160 x 140). Anchor: bottom centre."""
    g = Grid(CAKE_W, CAKE_H)
    cx = 19.5
    # body: a cylinder, sponge lit from the left
    g.rect(2, 17, 37, 29, "s")
    g.ell(cx, 29, 18.5, 5, lambda x, y: "s" if y >= 29 else None)
    g.ell(cx, 29, 18.5, 5, "s")
    g.rect(2, 17, 37, 29, "s")
    for y in range(17, 34):
        for x in range(CAKE_W):
            if g.g[y][x] == "s" and x >= 30:
                g.g[y][x] = "S"
    # cream filling band
    for y in (23, 24):
        for x in range(2, 38):
            if g.g[y][x] in "sS":
                g.g[y][x] = "c"
    # base shade along the bottom curve
    for x in range(CAKE_W):
        for y in range(CAKE_H - 1, 25, -1):
            if g.g[y][x] in "sS":
                g.g[y][x] = "S"
                break
    # icing: top ellipse, then drips down the side
    g.ell(cx, 15, 18.5, 5, "p")
    drips = {3: 4, 7: 6, 11: 3, 15: 5, 20: 7, 24: 3, 28: 6, 32: 4, 36: 5}
    for x0, d in drips.items():
        for x in (x0, x0 + 1):
            for y in range(17, 17 + d):
                if 0 <= x < CAKE_W and g.g[y][x] in "sS":
                    g.g[y][x] = "p"
    for y in range(15, 18):
        for x in range(2, 38):
            if g.g[y][x] in "sS":
                g.g[y][x] = "p"
    # light on the top, shade on the right and under the drips
    g.ell(cx - 5, 13.2, 9, 2, "q", only="p")
    for y in range(CAKE_H):
        for x in range(30, CAKE_W):
            if g.g[y][x] == "p":
                g.g[y][x] = "P"
    for x in range(CAKE_W):
        for y in range(CAKE_H - 1):
            if g.g[y][x] == "p" and g.g[y + 1][x] in "sSc" and y > 16:
                g.g[y][x] = "P"
    # candles: white with a blue spiral, a wick, then flame or smoke
    smoke = []
    cols = "wbwbwbw"
    for c0 in CANDLES:
        for i, y in enumerate(range(7, 14)):
            g.put(c0, y, cols[(i + 1) % 7] if i % 2 else "w")
            g.put(c0 + 1, y, "W" if i % 2 == 0 else "b")
        g.put(c0, 7, "w")
        g.put(c0 + 1, 7, "W")
        g.put(c0, 6, "t")
        if lit:
            g.put(c0, 5, "f")
            g.put(c0, 4, "y")
            g.put(c0, 3, "y")
            g.put(c0 - 1, 4, "f")
            g.put(c0 + 1, 4, "f")
            g.put(c0 + 1, 5, "f")
            g.put(c0 - 1, 5, "f")
            g.put(c0, 2, "f")
            g.put(c0, 1, "f")
            g.put(c0, 3, "z")
        else:
            # a soft curl, two wide: a darker core over a light edge, rising and leaning right
            wisp = (
                (0, 5, "G"),
                (0, 4, "G"),
                (1, 4, "g"),
                (1, 3, "G"),
                (2, 3, "g"),
                (1, 2, "G"),
                (0, 2, "g"),
                (0, 1, "G"),
                (1, 1, "g"),
                (1, 0, "g"),
            )
            smoke += [(c0 + dx, dy, k) for dx, dy, k in wisp]
    g.outline()
    # the wisps go on after the outline: one soft mid-grey, no dark rim, so they read on a dark
    # screen and a light one (a dark rim round each pixel made a checker)
    for x, y, k in smoke:
        g.put(x, y, k)
    return g.image()


def slice_() -> Image.Image:
    """A slice on a small plate, filling 34 x 26 art px (136 x 104) like food_pancakes."""
    g = Grid(34, 26)
    # the plate leaves a 1 px margin so the outline closes all round
    g.ell(16.5, 13, 15.4, 11.4, "d")
    # the well: a closed shade ring, then the inside lifted a pixel so the shade shows below
    g.ell(16.5, 13.2, 12.6, 8.6, "D")
    g.ell(16.5, 12.4, 11.8, 7.8, "d")
    # the wedge: pink top face, front face with sponge and cream, lit from the left
    g.poly([(7, 12), (26, 7), (27, 11), (9, 17)], "p")
    g.poly([(7, 12), (9, 17), (9, 20), (7, 15)], "s")
    g.poly([(9, 17), (27, 11), (27, 17), (9, 21)], "s")
    g.poly([(27, 11), (29, 9.5), (29, 15), (27, 17)], "S")
    g.poly([(9, 17.6), (27, 11.6), (27, 13), (9, 19.2)], "P")
    g.poly([(9, 18.8), (27, 12.8), (27, 14.4), (9, 20.4)], "c")
    g.poly([(9, 17), (27, 11), (27, 11.9), (9, 17.9)], "p")
    for x, y in ((9, 13), (11, 12), (13, 11), (12, 14)):
        g.put(x, y, "q")
    for x, y in ((17, 10), (18, 9)):
        g.put(x, y, "q")
    g.put(20, 8, "r")
    g.put(21, 8, "r")
    g.put(20, 7, "r")
    g.put(21, 7, "P")
    g.put(21, 6, "t")
    g.outline()
    return g.image()


BALLOONS = ((6.5, 15, "p", "P", "q"), (17.5, 15, "y", "Y", "z"), (12, 8, "b", "B", "w"))


def balloons(n: int = 3) -> Image.Image:
    """A bunch of n (3, 2, 1), 24 x 48 art px (96 x 192). Anchor: the strings' tie, bottom centre.

    Popped in the order blue (the top one, drawn last over the others), yellow, pink: the
    canvas and the tie stay put, so the bunch doesn't move as it empties (birthday plan 7.1).
    """
    g = Grid(24, 48)
    tie = (11, 47)
    spec = BALLOONS[:n]
    # strings first, under the balloons
    for cx, cy, *_ in spec:
        bx, by = int(cx), int(cy + 7)
        n = tie[1] - by
        for i in range(n + 1):
            g.put(round(bx + (tie[0] - bx) * i / n), by + i, "o")
    for cx, cy, k, sh, lt in spec:
        g.ell(cx, cy, 6, 7.5, k)
        g.ell(
            cx + 2, cy + 1.5, 5, 6.5, lambda x, y, sh=sh: sh, only=None
        )  # placeholder shade layer
        g.ell(cx - 0.7, cy - 0.5, 4.8, 6.6, k)
        g.put(int(cx), int(cy + 7), sh)
        g.put(int(cx) - 1, int(cy + 7), sh)
        g.put(int(cx) + 1, int(cy + 7), sh)
        g.put(int(cx), int(cy + 8), sh)
        for dx, dy in ((-3, -4), (-2, -5), (-3, -3), (-4, -2)):
            g.put(int(cx) + dx, int(cy) + dy, lt)
        g.put(int(cx) - 2, int(cy) - 3, lt)
    # the others hid each balloon's one-pixel bumps; alone they show, so they go
    if len(spec) < 3:
        src = [r[:] for r in g.g]
        for y in range(g.h):
            for x in range(g.w):
                near = sum(
                    0 <= x + dx < g.w
                    and 0 <= y + dy < g.h
                    and src[y + dy][x + dx] != "."
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                )
                if src[y][x] not in ".o" and near <= 1:
                    g.g[y][x] = "."
    g.outline()
    return g.image()


def pop_puff() -> Image.Image:
    """The pop (plan 7.1): a white burst with yellow tips and two scraps, 14 x 14 art px
    (56 x 56). Anchor: the centre, over the balloon that went."""
    g = Grid(14, 14)
    cx = cy = 7
    for dx, dy, ln in (
        (1, 0, 6),
        (-1, 0, 6),
        (0, 1, 6),
        (0, -1, 6),
        (1, 1, 4),
        (-1, -1, 4),
        (1, -1, 4),
        (-1, 1, 4),
    ):
        for i in range(2, ln + 1):
            g.put(
                cx + dx * i - (dx < 0),
                cy + dy * i - (dy < 0),
                "y" if i >= ln - 1 else "w",
            )
    g.ell(7, 7, 2.2, 2.2, "w")
    g.put(2, 4, "p")
    g.put(11, 10, "b")
    g.outline()
    return g.image()


def save_tight(img: Image.Image, path: Path) -> None:
    """A palette PNG with exactly the image's own colours, checked pixel-identical."""
    n = len(img.getcolors(1 << 16))
    pal = img.quantize(
        colors=n, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE
    )
    pal.save(path, optimize=True)
    assert list(Image.open(path).convert("RGBA").getdata()) == list(img.getdata()), path


def bunting() -> Image.Image:
    """A pennant strip, 64 x 12 art px (256 x 48); the left and right edges meet, so it tiles."""
    g = Grid(64, 12, wrap=True)
    for x in range(64):
        g.put(x, 0, "t")
        g.put(x, 1, "t" if x % 8 not in (0, 7) else "t")
    pal = (("p", "q", "P"), ("y", "z", "Y"), ("b", "w", "B"), ("w", "w", "W"))
    for i in range(8):
        k, lt, sh = pal[i % 4]
        x0 = i * 8
        for y in range(2, 11):
            half = 0.4 + 3.4 * (10 - y) / 8  # tapers to the point
            for x in range(8):
                if abs(x + 0.5 - 4) <= half:
                    g.put(x0 + x, y, sh if x >= 5 else (lt if x <= 1 and y < 6 else k))
    g.outline()
    return g.image()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    w, h = 16, 12
    rows = HAT
    img = Image.new("RGBA", (w * PX, h * PX), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, k in enumerate(row):
            if k != ".":
                for i in range(PX):
                    for j in range(PX):
                        img.putpixel((x * PX + i, y * PX + j), C[k])
    img.save(OUT / "season_party_hat.png")
    cake(True).save(OUT / "party_cake_lit.png")
    cake(False).save(OUT / "party_cake_out.png")
    slice_().save(OUT / "party_cake_slice.png")
    balloons().save(OUT / "party_balloons.png")
    save_tight(balloons(2), OUT / "party_balloons_2.png")
    save_tight(balloons(1), OUT / "party_balloons_1.png")
    save_tight(pop_puff(), OUT / "party_pop.png")
    bunting().save(OUT / "party_bunting.png")


if __name__ == "__main__":
    main()
