"""Contact sheet for looking at sprites (art review, step 4).

Usage: sheet.py <folder> <out.png> "name,name,..." ["name,..." ...]
One row per argument; a red line marks the feet line y=224.
"""

import os
import sys

from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
rows = [r.split(",") for r in sys.argv[3:]]
C = 160
bgc = (58, 40, 56)
W = max(len(r) for r in rows) * C
H = len(rows) * (C + 14)
sheet = Image.new("RGB", (W, H), bgc)
d = ImageDraw.Draw(sheet)
for y, r in enumerate(rows):
    for x, n in enumerate(r):
        if not n:
            continue
        p = os.path.join(src, n + ".png")
        im = Image.open(p).convert("RGBA")
        w, h = im.size
        s = C / max(w, h)
        im = im.resize((int(w * s), int(h * s)), Image.NEAREST)
        tile = Image.new(
            "RGBA", (C, C), (90, 70, 88, 255) if w <= 256 else bgc + (255,)
        )
        tile.alpha_composite(im, ((C - im.width) // 2, C - im.height))
        if w == 256:
            ImageDraw.Draw(tile).line(
                [(0, int(224 * s)), (C, int(224 * s))], fill=(255, 80, 80, 120)
            )
        sheet.paste(tile.convert("RGB"), (x * C, y * (C + 14)))
        d.text((x * C + 3, y * (C + 14) + C), n[:26], fill=(240, 230, 220))
sheet.save(out)
