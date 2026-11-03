#!/usr/bin/env python3
"""Cut a tucked-blanket probe: RAW.png (pet + blanket on flat grey) -> 256x256 transparent PNG on the 4 px grid.
usage: cut_tucked.py RAW.png ASLEEP_1.png OUT.png [NCOLORS]
Keys the grey, scales the figure so its bbox height matches the asleep frame's (wide figures: width),
places it with the feet line on y=224 and its centre on the asleep frame's, snaps to a 64x64 art grid
(median of each cell's middle, opaque if most of the cell is drawn), and reduces to NCOLORS (default 28)."""

import sys

import numpy as np
from PIL import Image
from scipy import ndimage

raw, ref, out = sys.argv[1:4]
ncol = int(sys.argv[4]) if len(sys.argv) > 4 else 28
a = np.asarray(Image.open(raw).convert("RGB")).astype(np.int16)
border = np.concatenate(
    [
        a[:6].reshape(-1, 3),
        a[-6:].reshape(-1, 3),
        a[:, :6].reshape(-1, 3),
        a[:, -6:].reshape(-1, 3),
    ]
)
bg = np.median(border, axis=0)
keep = np.sqrt(((a - bg) ** 2).sum(-1)) >= 36
# drop specks: keep connected pieces bigger than 0.05% of the figure
lab, n = ndimage.label(keep)
sizes = ndimage.sum(keep, lab, range(1, n + 1))
big = np.isin(
    lab, [i + 1 for i, s in enumerate(sizes) if s > max(60, keep.sum() * 0.0004)]
)
ys, xs = np.where(big)
box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
r = Image.open(ref).convert("RGBA")
rb = r.getbbox()
# scale: raw figure -> reference figure by bbox width (the figure is as wide as the pet; height changes with the blanket)
s = (rb[2] - rb[0]) / (box[2] - box[0])
W = 12  # work pixels per art pixel after scaling
sc = s * 4  # raw px -> 1024-grid px is s*4 ; work grid is 256*3 = 768
work = 768 / 256 * s  # raw px -> 768 grid
rgb = Image.fromarray(a.astype(np.uint8)).resize(
    (round(a.shape[1] * work), round(a.shape[0] * work)), Image.LANCZOS
)
al = Image.fromarray((big * 255).astype(np.uint8)).resize(rgb.size, Image.LANCZOS)
rgb = np.asarray(rgb)
al = np.asarray(al) > 127
bx0, by0, bx1, by1 = [round(v * work) for v in box]
# place: feet line (box bottom) on y=224 -> 672 in work grid; centre x on reference centre (128 +/- )
ox = round((rb[0] + rb[2]) / 2 * 3) - (bx0 + bx1) // 2
oy = 224 * 3 - by1
canvas = np.zeros((768, 768, 3), np.uint8)
ca = np.zeros((768, 768), bool)
H, Wd = al.shape
for y in range(H):
    yy = y + oy
    if not 0 <= yy < 768:
        continue
    x0 = max(0, -ox)
    x1 = min(Wd, 768 - ox)
    canvas[yy, x0 + ox : x1 + ox] = rgb[y, x0:x1]
    ca[yy, x0 + ox : x1 + ox] = al[y, x0:x1]
cell = 12
o = np.zeros((64, 64, 4), np.uint8)
for j in range(64):
    for i in range(64):
        blk = canvas[j * cell : (j + 1) * cell, i * cell : (i + 1) * cell]
        m = ca[j * cell : (j + 1) * cell, i * cell : (i + 1) * cell]
        if m.mean() > 0.5:
            o[j, i, :3] = np.median(blk[m], axis=0)
            o[j, i, 3] = 255
rgba = Image.fromarray(o, "RGBA")
q = (
    Image.fromarray(o[:, :, :3])
    .quantize(ncol, method=Image.MEDIANCUT, dither=Image.NONE)
    .convert("RGB")
)
qa = np.asarray(q)
qa = np.dstack([qa, o[:, :, 3]])
Image.fromarray(qa, "RGBA").resize((256, 256), Image.NEAREST).save(out)
print(out, f"scale {s:.3f}", "bbox", Image.open(out).getbbox())
