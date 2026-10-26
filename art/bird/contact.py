#!/usr/bin/env python3
"""contact.py OUTDIR PNG: grid of all sprites, alternating light/dark tiles, red baseline at 224."""
import sys, pathlib
from PIL import Image, ImageDraw
d = pathlib.Path(sys.argv[1]); fs = sorted(p for p in d.glob("*.png") if not p.name.startswith("bg_"))
cols = 10; T = 128; rows = (len(fs) + cols - 1) // cols
c = Image.new("RGBA", (cols*T, rows*(T+14)), (255,255,255,255)); dr = ImageDraw.Draw(c)
for i, p in enumerate(fs):
    x, y = (i % cols)*T, (i // cols)*(T+14)
    bg = (238,238,232,255) if (i + i//cols) % 2 == 0 else (30,30,40,255)
    t = Image.new("RGBA", (T, T), bg); im = Image.open(p).convert("RGBA")
    im = im.resize((T, T) if im.width == 256 else (im.width, im.height), Image.NEAREST)
    t.alpha_composite(im, ((T-im.width)//2, (T-im.height)//2)); c.alpha_composite(t, (x, y))
    if im.width == T and Image.open(p).width == 256: dr.line([(x, y+112), (x+T, y+112)], fill=(255,0,0,120))
    dr.text((x+2, y+T), p.stem[:21], fill=(0,0,0,255))
c.save(sys.argv[2]); print(len(fs))
