"""The birthday party hat, a stand-in drawn in code (like art/seasonal/).

Usage: python art/birthday/make_party.py [out dir]  (default art/birthday/out)

Same canvas and anchoring as the season hats (64 x 48, 4 px art pixels, the brim
on the bottom row, centred), so the card's costume code places it unchanged.
Copy the result to frontend/ui/season_party_hat.png. A redraw by the Hatch API
Art session should keep the name, canvas and anchoring.
"""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "out"
PX = 4

C = {
    "o": (59, 26, 12, 255),  # outline
    "p": (240, 110, 150, 255),  # pink stripe
    "P": (196, 72, 112, 255),  # its shade
    "y": (255, 214, 77, 255),  # yellow stripe
    "Y": (214, 168, 40, 255),
    "w": (252, 250, 240, 255),  # pom-pom
    "W": (210, 206, 196, 255),
    "b": (92, 168, 220, 255),  # band
    "B": (60, 120, 170, 255),
}

HAT = [
    "......oooo......",
    "......owWo......",
    ".......oo.......",
    "......oppo......",
    "......oyYo......",
    ".....oppPPo.....",
    ".....oyyyYo.....",
    "....opppPPPo....",
    "....oyyyyyYo....",
    "...oooooooooo...",
    "...obbbbbbbBo...",
    "...oooooooooo...",
]


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


if __name__ == "__main__":
    main()
