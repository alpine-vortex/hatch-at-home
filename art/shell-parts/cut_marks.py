"""Hand-reduced shell marks, one PNG pixel per art pixel.

The owner's references (source/shell_marks.png: egg logo, name plate, power light
off and on; ../ui/source/backlight_btn.png: the lone bulb) are drawn at about 25-30
art pixels. These are redrawn by hand at their slot sizes rather than downscaled.

Greyscale for hard-light tinting: 50% grey is the shell colour itself, lighter
lifts it, darker shades it, and the outline is near black. The card tints each
from the shell (see the .hw slots in hatch-pet-card.js).

    python3 art/shell-parts/cut_marks.py
"""

import pathlib

from PIL import Image

OUT = (
    pathlib.Path(__file__).resolve().parents[2]
    / "custom_components/virtual_pet/frontend/ui"
)
GREY = {"#": 34, "c": 72, "d": 104, "m": 128, "l": 176, "w": 236}

MARKS = {
    # The egg, cracked across the middle (7 x 9).
    "shell_logo": [
        "..###..",
        ".#wll#.",
        "#wllmm#",
        "#lmmmm#",
        "#cmcmc#",
        "#mcmcd#",
        "#mmmdd#",
        ".#mdd#.",
        "..###..",
    ],
    # The name plate, a raised bar; the card stretches its middle (12 x 7).
    "shell_plate": [
        ".##########.",
        "#wllllllllm#",
        "#lmmmmmmmmd#",
        "#lmmmmmmmmd#",
        "#lmmmmmmmmd#",
        "#mddddddddd#",
        ".##########.",
    ],
    # The power light: a lens in a ring, lit and dark (5 x 5).
    "shell_light_on": [
        ".###.",
        "#wlm#",
        "#lmm#",
        "#mmd#",
        ".###.",
    ],
    "shell_light_off": [
        ".###.",
        "#mdd#",
        "#dcc#",
        "#dc##",
        ".###.",
    ],
    # The backlight's bulb, a shape only: the card fills it (5 x 7).
    "backlight_bulb": [
        ".###.",
        "#####",
        "#####",
        ".###.",
        ".....",
        ".###.",
        "..#..",
    ],
}


def main():
    for name, rows in MARKS.items():
        im = Image.new("LA", (len(rows[0]), len(rows)), (0, 0))
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch != ".":
                    im.putpixel(
                        (x, y), (GREY[ch] if name != "backlight_bulb" else 34, 255)
                    )
        im.save(OUT / f"{name}.png")
        print(OUT / f"{name}.png", im.size)


if __name__ == "__main__":
    main()
