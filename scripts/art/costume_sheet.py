"""Contact sheets from scripts/costume-preview.js: one per costume.

Usage: costume_sheet.py [folder] [out folder]   (default: dev/costumes, both)
Rows are creatures, columns stages, cropped close around the head and
enlarged 1.5x. A cell the card would never show (the costume's skip list)
says so instead.
"""

import os
import re
import sys

from PIL import Image, ImageDraw

src = sys.argv[1] if len(sys.argv) > 1 else "dev/costumes"
out = sys.argv[2] if len(sys.argv) > 2 else src
STAGES = ["baby", "child", "teen", "adult"]
BOX = (66, 50, 206, 170)  # around the pet on a 272 x 205 screen
W, H = (BOX[2] - BOX[0]) * 3 // 2, (BOX[3] - BOX[1]) * 3 // 2
LABEL = 70

shots = {}
for name in os.listdir(src):
    m = re.fullmatch(r"([a-z]+)_(baby|child|teen|adult)_([a-z_]+?)(-SKIPPED)?\.png", name)
    if m:
        shots[(m[1], m[2], m[3])] = name
species = sorted({k[0] for k in shots})
for art in sorted({k[2] for k in shots}):
    sheet = Image.new("RGB", (LABEL + W * 4, 20 + H * len(species)), "white")
    d = ImageDraw.Draw(sheet)
    for j, stage in enumerate(STAGES):
        d.text((LABEL + j * W + W // 2 - 12, 4), stage, fill="black")
    for i, sp in enumerate(species):
        d.text((4, 20 + i * H + H // 2), sp, fill="black")
        for j, stage in enumerate(STAGES):
            name = shots.get((sp, stage, art))
            x, y = LABEL + j * W, 20 + i * H
            if name is None:
                continue
            im = Image.open(os.path.join(src, name)).convert("RGB")
            sheet.paste(im.crop(BOX).resize((W, H), Image.NEAREST), (x, y))
            if name.endswith("-SKIPPED.png"):
                d.rectangle((x, y, x + W - 1, y + 14), fill="white")
                d.text((x + 4, y + 2), "never shown (skip list)", fill="gray")
    path = os.path.join(out, f"sheet_{art}.png")
    sheet.save(path)
    print(path)
