"""Draw perch_lilypad.png: the flat lily pad the frog sits on in the card.

Pond's day scene is open water in the middle, so the frog gets a pad under its
feet. Same 4 px pixel grid and palette as the pad in child_lily_sit (Sol's art).

Usage: python -I art/treefrog/make_perch.py <out.png>
"""

import math
import sys

from PIL import Image

CELL = 4  # the sprites' pixel size
FILL = (118, 150, 43)
VEIN = (107, 108, 48)
EDGE = (64, 43, 21)
DARK = (44, 18, 2)
LIGHT = (143, 173, 56)

# In cells, on a 64x64 grid (256 px): centre, radii. Feet stand on y=224 (56).
CX, CY, RX, RY = 32, 55, 23.5, 7


def inside(x: float, y: float) -> bool:
    return ((x - CX) / RX) ** 2 + ((y - CY) / RY) ** 2 <= 1


def main(out: str) -> None:
    img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    for gy in range(64):
        for gx in range(64):
            x, y = gx + 0.5, gy + 0.5
            if not inside(x, y):
                continue
            # The notch: a narrow wedge cut from the centre to the back edge.
            angle = math.degrees(math.atan2(-(y - CY) * RX / RY, x - CX))
            if 70 < angle < 92:
                continue
            edge = not all(inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            notch_edge = 64 < angle < 98 and y < CY
            if edge or notch_edge:
                color = DARK if y > CY else EDGE
            elif y < CY - RY + 2:
                color = LIGHT
            else:
                color = FILL
                # Veins fanning from the centre.
                if abs(angle) > 8 and int(abs(angle)) % 40 < 6 and abs(x - CX) > 3:
                    color = VEIN
            for py in range(gy * CELL, gy * CELL + CELL):
                for px in range(gx * CELL, gx * CELL + CELL):
                    img.putpixel((px, py), (*color, 255))
    img.save(out)


if __name__ == "__main__":
    main(sys.argv[1])
