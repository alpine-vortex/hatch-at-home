#!/usr/bin/env python3
"""Review sheet for the drape: usage review_sheet.py OUT.png [UIDIR]

One block per size (S, M, L): four asleep sprites of matching width, one row each,
with frames 1, 2, 3 on the day room and frame 3 again at brightness(.8) on the dim room.
The blanket goes on the pets' feet line; a pet shorter than the blanket gets it shifted
down (y) so the blanket covers about the lower 65% of the body (the card's per-species
`drape.y`). The bench's care: lights sheet replaces this once D ships it.
"""

import pathlib
import sys

from PIL import Image, ImageDraw, ImageEnhance

REPO = pathlib.Path(__file__).resolve().parents[2]
FE = REPO / "custom_components/virtual_pet/frontend"
UI = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else FE / "ui"
PETS = {
    "s": [
        ("beardeddragon", "baby"),
        ("corgi", "baby"),
        ("fox", "baby"),
        ("treefrog", "child"),
    ],
    "m": [
        ("axolotl", "child"),
        ("opossum", "child"),
        ("puffin", "child"),
        ("owl", "teen"),
    ],
    "l": [
        ("ferret", "adult"),
        ("squirrel", "teen"),
        ("deer", "teen"),
        ("bunny", "teen"),
    ],
}


def bg(name):
    im = Image.open(FE / "sprites/bird" / name).convert("RGBA")
    return im.crop((128, 64, 384, 320)).copy()


def pet(sp, stage):
    return Image.open(FE / f"sprites/{sp}/{stage}_asleep_1.png").convert("RGBA")


def drape(size, n):
    return Image.open(UI / f"drape_{size}_{n}.png").convert("RGBA")


def main():
    day, dim = bg("bg_day.png"), bg("bg_dim.png")
    blocks = []
    for size, pets in PETS.items():
        sheet = Image.new("RGBA", (256 * 4, 256 * len(pets)), (0, 0, 0, 255))
        d = ImageDraw.Draw(sheet)
        for r, (sp, stage) in enumerate(pets):
            p = pet(sp, stage)
            box = p.getbbox()
            ph = box[3] - box[1]
            for c in range(4):
                cell = (dim if c == 3 else day).copy()
                n = min(c + 1, 3)
                dr = drape(size, 3 if c == 3 else n)
                bh = dr.getbbox()
                dh = bh[3] - bh[1]
                y = max(0, round(dh - 0.65 * ph))
                layer = Image.new("RGBA", (256, 256))
                layer.alpha_composite(p)
                shifted = Image.new("RGBA", (256, 256))
                shifted.alpha_composite(dr, (0, y))
                layer.alpha_composite(shifted)
                if c == 3:
                    layer = ImageEnhance.Brightness(layer).enhance(0.8)
                    layer.putalpha(Image.eval(layer.getchannel("A"), lambda v: v))
                cell.alpha_composite(layer)
                sheet.paste(cell, (c * 256, r * 256))
            d.text(
                (4, r * 256 + 4),
                f"{size.upper()} {sp} {stage} w{box[2] - box[0]} y+{y}",
                fill=(255, 255, 255, 255),
            )
        blocks.append(sheet)
    out = Image.new("RGBA", (1024, sum(b.height for b in blocks)))
    y = 0
    for b in blocks:
        out.paste(b, (0, y))
        y += b.height
    out.convert("RGB").save(sys.argv[1])
    print(out.size)


if __name__ == "__main__":
    main()
