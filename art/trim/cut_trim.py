#!/usr/bin/env python3
"""Cut the woodland shell trim and build the mock-up. usage: cut_trim.py SHEET OUTDIR"""
import sys, pathlib, importlib.util, numpy as np
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location("cut", pathlib.Path(__file__).with_name("cut.py"))
sheet, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
sys.argv = [sys.argv[0], "/nonexistent", "/tmp/_cut_unused"]; cut = importlib.util.module_from_spec(spec); spec.loader.exec_module(cut)
# 3 rows x 1 col split by centroid: top garland, middle plate, bottom acorn
cs = cut.cells(sheet, 3, 1)
def emit(im, art_w, name, h_override=None):
    sc = art_w / im.width
    sm = cut.pixelize(im, sc, cut.make_palette([im], 16))
    big = sm.resize((sm.width*4, sm.height*4), Image.NEAREST); big.save(out / f"{name}.png"); return big
top = emit(cs[(0, 0)], 64, "trim_woodland_top")
plate = emit(cs[(1, 0)], 48, "trim_woodland_plate")
corner = emit(cs[(2, 0)], 16, "trim_woodland_corner")
print(top.size, plate.size, corner.size)
# mock-up: orange egg shell ~330 px wide
W, H = 520, 560; m = Image.new("RGBA", (W, H), (244, 239, 230, 255)); d = ImageDraw.Draw(m)
ex, ey, ew, eh = (W-330)//2, 70, 330, 430
d.ellipse([ex-6, ey-6, ex+ew+6, ey+eh+6], fill=(0xa7, 0x5e, 0x35, 255))
d.ellipse([ex, ey, ex+ew, ey+eh], fill=(0xe8, 0x83, 0x4a, 255))
d.ellipse([W//2-16, ey-34, W//2+16, ey+2], outline=(0xa7, 0x5e, 0x35, 255), width=7)  # keychain loop
d.rounded_rectangle([ex+65, ey+120, ex+ew-65, ey+290], radius=14, fill=(0x2e, 0x3a, 0x2c, 255))  # screen placeholder
for i, x in enumerate([ex+95, W//2, ex+ew-95]): d.ellipse([x-22, ey+343, x+22, ey+387], fill=(0xd9, 0xc8, 0xae, 255)); d.ellipse([x-22, ey+338, x+22, ey+382], fill=(0xff, 0xf7, 0xec, 255))
m.alpha_composite(top, ((W - top.width)//2, ey - 4))
m.alpha_composite(plate, ((W - plate.width)//2, ey + 296))
m.alpha_composite(corner, (ex + 62, ey + eh - 58))
m.alpha_composite(corner.transpose(Image.FLIP_LEFT_RIGHT), (ex + ew - 62 - corner.width, ey + eh - 58))
m.save(out / "mockup_woodland_trim.png")
