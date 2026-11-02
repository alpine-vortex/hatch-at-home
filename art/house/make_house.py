"""House-effect art for the ha-signals slices (H3, H4), hand-placed pixel maps.

Usage: python art/house/make_house.py [out dir]
       (default custom_components/virtual_pet/frontend/ui)

Props sit on the 64 grid (4 image px an art pixel), like prop_* and season_*.

- house_robot_1/2: 72 x 40 (18 x 10 art px; owner, probe 3: bigger than the
  plan's 48 x 28), a round flat robot-vacuum puck seen from a little above: a
  charcoal oval lid with a thin light rim (so it reads on a dark floor and in
  mono), a dust-bin seam, a ringed button light, a near-black bumper band and
  a side brush at the front. Frame 2: light off, brush turned (probe 4).
- house_heat_1/2/3: 64 x 64 (16 x 16 art px), warm air shimmer: three thin
  wavy lines rising, soft red at the floor through orange to amber, see-through
  and fading at the top. No flame shapes and no cool colours, so it reads as
  warm air, not a fire. Drawn a body-width or more from the pet (toward the
  room's heat source or the screen edge), not against it.

- house_cool_1/2/3: 64 x 64 (16 x 16 art px), twinkling frost sparkles (H3 AC).
- house_breeze_1/2/3: 72 x 48 (18 x 12 art px), soft wind lines from one side, no
  leaves (H3 fan).
- house_chime_1/2: 40 x 40 (10 x 10 art px), a beamed pair of notes that bobs (H5).
- house_tumble_1/2/3: 48 x 48 (12 x 12 art px), a sock tumbling in a warm swirl
  (H6 dryer).
- house_season_<spring|summer|autumn|winter>: 24 x 24 (6 x 6 art px) stamps (H7).
- house_suds: none here; H6 reuses prop_bubbles_1/2 as they are.

Cool and breeze were planned as cuts of art/effects cold_1..3 and wind_1..3, but
that pack is painted (anti-aliased, thousands of colours) and shrinking it 16x left
blobs, so they are hand-placed after its look instead.

Too small to cut from a drawn image (pieces under ~20 art px turn to mush when
shrunk), so the pixels are placed here by hand.
"""

from __future__ import annotations

import math
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else ROOT / "custom_components" / "virtual_pet" / "frontend" / "ui"
)
PX = 4  # image px an art pixel (the 64 grid)

ROBOT_PALETTE = {
    "o": (20, 18, 20, 255),  # outline
    "r": (
        138,
        146,
        158,
        255,
    ),  # thin light rim round the lid (reads on a dark floor and in mono)
    "k": (58, 62, 70, 255),  # lid, charcoal
    "d": (38, 41, 47, 255),  # dust-bin seam on the lid
    "i": (104, 110, 120, 255),  # ring round the button
    "b": (34, 36, 42, 255),  # bumper band round the side, near black
    "y": (150, 140, 120, 255),  # side brush bristles
    "L": (96, 236, 140, 255),  # button light, on
    "l": (64, 110, 80, 255),  # button light, off
}
# house_robot is 18 x 10 art px = 72 x 40 image px (owner, probe 3: ~1.5x the first size).
# A round flat puck seen from a little above, heading right: a charcoal lid with a thin
# light rim, a dust-bin seam at the back, a ringed button light in the middle, a
# near-black bumper band, and a side brush peeking out at the front. Frame 2: light off,
# the brush turned.
ROBOT = [
    [
        "......oooooo......",
        "...ooorrrrrrooo...",
        ".oorrkkkkkkkkkrro.",
        "orkkdkkiiiikkkkkro",
        "orkkdkkiLLikkkkkro",
        "obrkkdkiiiikkkkrbo",
        "obbbrrrrrrrrrrrbbo",
        ".oobbbbbbbbbbbboy.",
        "...ooobbbbbbooo.yy",
        "......oooooo...y..",
    ],
    [
        "......oooooo......",
        "...ooorrrrrrooo...",
        ".oorrkkkkkkkkkrro.",
        "orkkdkkiiiikkkkkro",
        "orkkdkkillikkkkkro",
        "obrkkdkiiiikkkkrbo",
        "obbbrrrrrrrrrrrbbo",
        ".oobbbbbbbbbbbbo.y",
        "...ooobbbbbbooo.y.",
        "......oooooo....yy",
    ],
]


def _draw(
    rows: list[str], palette: dict[str, tuple[int, int, int, int]]
) -> Image.Image:
    w, h = len(rows[0]), len(rows)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        assert len(row) == w, (y, row)
        for x, ch in enumerate(row):
            if ch != ".":
                im.putpixel((x, y), palette[ch])
    return im.resize((w * PX, h * PX), Image.NEAREST)


HEAT = [  # bottom to top: soft red, orange, amber, pale amber, fading out
    (255, 104, 76, 250),
    (255, 146, 62, 220),
    (255, 186, 80, 170),
    (255, 212, 130, 110),
]


def _heat(frame: int) -> Image.Image:
    """Warm air shimmer: three wavy lines rising off the floor, warm colours only, a
    one-px line with a half-strength glow beside it, fading toward the top; each frame
    moves the wave up a third of a period."""
    n = 16
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    for i, (x0, top, bottom) in enumerate(((3, 3, 15), (8, 0, 15), (13, 4, 15))):
        for y in range(top, bottom + 1):
            phase = (y + frame * 2 + i * 3) / 6 * 2 * math.pi
            x = x0 + round(math.sin(phase))
            r, g, b_, a = HEAT[min(3, (bottom - y) * 4 // (bottom - top + 1))]
            im.putpixel((x, y), (r, g, b_, a))
            im.putpixel((x + 1, y), (r, g, b_, a // 2))
    return im.resize((n * PX, n * PX), Image.NEAREST)


COOL = {"W": (250, 253, 255, 255), "L": (176, 214, 248, 255), "D": (72, 118, 196, 255)}
# twinkling frost sparkles (after the effects pack's cold loop): (x, y, size) per frame,
# size 2 = big four-point star, 1 = small one, 0 = a dot
COOL_FRAMES = [
    [(4, 4, 2), (11, 6, 1), (6, 11, 0), (12, 12, 1), (1, 9, 0)],
    [(4, 4, 1), (11, 6, 2), (6, 11, 1), (12, 12, 0), (13, 2, 0)],
    [(4, 4, 0), (11, 6, 1), (6, 11, 2), (12, 12, 1), (2, 13, 0)],
]


def _cool(frame: int) -> Image.Image:
    n = 16
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    for x, y, size in COOL_FRAMES[frame]:
        if size == 0:
            im.putpixel((x, y), COOL["L"])
            continue
        im.putpixel((x, y), COOL["W"])
        for d in range(1, size + 1):
            c = COOL["D"] if d == size else COOL["L"]
            for dx, dy in ((d, 0), (-d, 0), (0, d), (0, -d)):
                im.putpixel((x + dx, y + dy), c)
    return im.resize((n * PX, n * PX), Image.NEAREST)


BREEZE = [(206, 230, 252, 255), (104, 150, 212, 255)]  # light stroke, darker underside


def _breeze(frame: int) -> Image.Image:
    """Soft wind lines from the left (after the pack's wind loop, no leaves): three
    gently waving strokes, the middle one ending in a small curl; each frame moves the
    wave along (the card drifts the whole piece sideways)."""
    w, h = 18, 12
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    def px(x: int, y: int, c: tuple[int, int, int, int]) -> None:
        if 0 <= x < w and 0 <= y < h and im.getpixel((x, y))[3] == 0:
            im.putpixel((x, y), c)

    for y0, x0, length, curl in ((1, 2, 9, False), (5, 0, 12, True), (9, 4, 8, False)):
        pts = [
            (x, y0 + (1 if (x + frame * 2) % 6 in (3, 4) else 0))
            for x in range(x0, x0 + length)
        ]
        if curl:
            ex, ey = pts[-1]
            pts += [(ex + 1, ey - 1), (ex + 1, ey - 2), (ex, ey - 3), (ex - 1, ey - 2)]
        for x, y in pts:
            px(x, y, BREEZE[0])
        for x, y in pts:
            px(x, y + 1, BREEZE[1])
    return im.resize((w * PX, h * PX), Image.NEAREST)


OUTLINE = (34, 20, 10, 255)


def _outlined(
    fill: dict[tuple[int, int], tuple[int, int, int, int]], w: int, h: int
) -> Image.Image:
    """Fill pixels, then the sprites' dark outline on every clear pixel beside one (4-way)."""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for (x, y), c in fill.items():
        im.putpixel((x, y), c)
    for x, y in fill:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if 0 <= q[0] < w and 0 <= q[1] < h and q not in fill:
                im.putpixel(q, OUTLINE)
    return im


GOLD, CREAM = (255, 204, 80, 255), (255, 240, 196, 255)


def _chime(frame: int) -> Image.Image:
    """house_chime: a beamed pair of notes (a doorbell's ding-dong) that bobs, with two
    ring ticks that swap sides; 10 x 10 art px."""
    dy = frame  # frame 2 sits one art px lower
    fill: dict = {}
    for hx, hy in ((1, 7), (6, 6)):  # 2x2 heads
        for q in ((hx, hy), (hx + 1, hy), (hx, hy + 1), (hx + 1, hy + 1)):
            fill[(q[0], q[1] - 1 + dy)] = GOLD
    for y in range(2, 7):  # stems
        fill[(2, y + dy)] = GOLD
    for y in range(1, 6):
        fill[(7, y + dy)] = GOLD
    for x in range(3, 7):  # the beam, rising to the right
        fill[(x, (2 if x < 5 else 1) + dy)] = GOLD
    im = _outlined(fill, 10, 10)
    for x, y in ((0, 2), (9, 8)) if frame == 0 else ((9, 1), (0, 8)):
        if im.getpixel((x, y))[3] == 0:
            im.putpixel((x, y), CREAM)
    return im.resize((10 * PX, 10 * PX), Image.NEAREST)


SOCK, CUFF = (214, 84, 72, 255), (250, 244, 232, 255)
SOCK_MAP = ["ww..", "rr..", "rr..", "rrrr", ".rrr"]
SWIRL = [(255, 214, 160, 255), (255, 168, 96, 255)]


def _tumble(frame: int) -> Image.Image:
    """house_tumble: a sock tumbling in a warm swirl (the dryer); 12 x 12 art px. The sock
    turns a quarter each frame and the swirl's open end goes round with it."""
    n = 12
    sock = {
        (x, y): (CUFF if ch == "w" else SOCK)
        for y, row in enumerate(SOCK_MAP)
        for x, ch in enumerate(row)
        if ch != "."
    }
    for _ in range(frame):  # quarter turns
        sock = {(4 - y, x): c for (x, y), c in sock.items()}
    xs = [x for x, _ in sock]
    ys = [y for _, y in sock]
    ox, oy = 6 - (max(xs) + min(xs) + 1) // 2, 6 - (max(ys) + min(ys) + 1) // 2
    im = _outlined({(x + ox, y + oy): c for (x, y), c in sock.items()}, n, n)
    for k in range(18):  # a 240-degree arc, light to warm
        a = math.radians(frame * 120 + k * 240 / 17)
        x, y = round(5.5 + 5.2 * math.cos(a)), round(5.5 + 5.2 * math.sin(a))
        if im.getpixel((x, y))[3] == 0:
            im.putpixel((x, y), SWIRL[k * 2 // 18])
    return im.resize((n * PX, n * PX), Image.NEAREST)


SEASON_PALETTE = {
    "o": OUTLINE,
    "p": (248, 156, 196, 255),
    "P": (255, 214, 232, 255),  # blossom petals
    "y": (255, 212, 72, 255),
    "Y": (250, 150, 40, 255),  # sun, centres
    "g": (232, 120, 48, 255),
    "G": (176, 72, 30, 255),  # autumn leaf
    "s": (226, 242, 255, 255),
    "S": (112, 164, 230, 255),  # snowflake
}
# house_season_<season>: 6 x 6 art px stamps (24 x 24) for the journal row and the moment
SEASONS = {
    "spring": ["..oo..", ".oPPo.", "oPyypo", "opyypo", ".oppo.", "..oo.."],
    "summer": ["Y.yy.Y", ".oyyo.", "yyYYyy", "yyYYyy", ".oyyo.", "Y.yy.Y"],
    "autumn": ["...ooo", "..oggo", ".ogggo", "oggGo.", "oGGo..", "Go...."],
    "winter": ["S.ss.S", ".SssS.", "ssSSss", "ssSSss", ".SssS.", "S.ss.S"],
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for i, rows in enumerate(ROBOT, 1):
        _draw(rows, ROBOT_PALETTE).save(OUT / f"house_robot_{i}.png")
    for i in range(3):
        _heat(i).save(OUT / f"house_heat_{i + 1}.png")
        _cool(i).save(OUT / f"house_cool_{i + 1}.png")
        _breeze(i).save(OUT / f"house_breeze_{i + 1}.png")
        _tumble(i).save(OUT / f"house_tumble_{i + 1}.png")
    for i in range(2):
        _chime(i).save(OUT / f"house_chime_{i + 1}.png")
    for season, rows in SEASONS.items():
        _draw(rows, SEASON_PALETTE).save(OUT / f"house_season_{season}.png")


if __name__ == "__main__":
    main()
