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

Too small to cut from a drawn image (pieces under ~20 art px turn to mush when
shrunk), so the pixels are placed here by hand.
"""

from __future__ import annotations

import math
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "custom_components" / "virtual_pet" / "frontend" / "ui"
PX = 4  # image px an art pixel (the 64 grid)

ROBOT_PALETTE = {
    "o": (20, 18, 20, 255),  # outline
    "r": (138, 146, 158, 255),  # thin light rim round the lid (reads on a dark floor and in mono)
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


def _draw(rows: list[str], palette: dict[str, tuple[int, int, int, int]]) -> Image.Image:
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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for i, rows in enumerate(ROBOT, 1):
        _draw(rows, ROBOT_PALETTE).save(OUT / f"house_robot_{i}.png")
    for i in range(3):
        _heat(i).save(OUT / f"house_heat_{i + 1}.png")


if __name__ == "__main__":
    main()
