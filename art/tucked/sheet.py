#!/usr/bin/env python3
"""Review sheet: per probe pet, existing asleep | old shared drape | new tucked (day) | new tucked at brightness(.8) on the dim room.
usage: sheet.py OUT.png TUCKED_DIR   (TUCKED_DIR holds <species>_<stage>_tucked.png, 256x256)"""

import pathlib
import sys

from PIL import Image, ImageDraw, ImageEnhance

REPO = pathlib.Path(__file__).resolve().parents[2]
FE = REPO / "custom_components/virtual_pet/frontend"
SP = FE / "sprites"
T = pathlib.Path(sys.argv[2])
ROWS = [  # species, stage, (day bg), (dim bg), world, drape size
    ("kitten", "baby", "kitten/bg_day.png", "kitten/bg_dim.png", "Hearth"),
    ("gecko", "adult", "gecko/bg_vivarium.png", "gecko/bg_dim.png", "Terrarium"),
    ("owl", "teen", "bat/bg_day.png", "bat/bg_night.png", "Night Sky"),
    ("octopus", "adult", "otter/bg_day.png", "otter/bg_night.png", "Tidepool"),
    ("fox", "adult", "bird/bg_day.png", "bird/bg_dim.png", "Woodland"),
    ("fox", "adult", "bird/bg_day.png", "bird/bg_dim.png", "Woodland, rework B"),
]


def bg(p):
    return Image.open(SP / p).convert("RGBA").crop((128, 64, 384, 320)).copy()


def dsize(w):
    return "s" if w <= 160 else "m" if w <= 210 else "l"


def old_drape(pet):
    box = pet.getbbox()
    w, ph = box[2] - box[0], box[3] - box[1]
    dr = Image.open(FE / f"ui/drape_{dsize(w)}_3.png").convert("RGBA")
    bh = dr.getbbox()
    y = max(0, round((bh[3] - bh[1]) - 0.65 * ph))
    out = pet.copy()
    sh = Image.new("RGBA", (256, 256))
    sh.alpha_composite(dr, (0, y))
    out.alpha_composite(sh)
    return out


def put(base, layer, dim=False):
    c = base.copy()
    if dim:
        layer = ImageEnhance.Brightness(layer).enhance(0.8)
    c.alpha_composite(layer)
    return c


Z = 2
HEAD = 34
sheet = Image.new("RGB", (5 * 256 * Z, HEAD + len(ROWS) * (256 * Z + 24)), (24, 24, 28))
d = ImageDraw.Draw(sheet)
for c, t in enumerate(
    [
        "existing asleep (day)",
        "old shared drape (day)",
        "bespoke tucked (day)",
        "bespoke tucked, brightness(.8), dim room",
        "composite: original pet + blanket only (day)",
    ]
):
    d.text((c * 256 * Z + 10, 10), t, fill=(235, 235, 235))
for r, (sp, st, dayb, dimb, world) in enumerate(ROWS):
    pet = Image.open(SP / sp / f"{st}_asleep_1.png").convert("RGBA")
    b = "_B" if world.endswith("B") else ""
    tk = Image.open(T / f"{sp}_{st}_tucked{b}.png").convert("RGBA")
    day, dim = bg(dayb), bg(dimb)
    ck = Image.open(T / f"{sp}_{st}_tucked{b}_comp.png").convert("RGBA")
    cells = [
        put(day, pet),
        put(day, old_drape(pet)),
        put(day, tk),
        put(dim, tk, True),
        put(day, ck),
    ]
    y0 = HEAD + r * (256 * Z + 24)
    for c, im in enumerate(cells):
        sheet.paste(
            im.convert("RGB").resize((256 * Z, 256 * Z), Image.NEAREST),
            (c * 256 * Z, y0 + 24),
        )
    d.text((10, y0 + 6), f"{sp} {st} ({world})", fill=(235, 235, 235))
sheet.save(sys.argv[1])
print(sheet.size)
