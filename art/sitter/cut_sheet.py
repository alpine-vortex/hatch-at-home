#!/usr/bin/env python3
"""cut.py SHEET COLSxROWS OUTDIR name1,name2,... [--h HEIGHT_PX] [--scale S]
Cut a magenta-ground sheet into 256x256 frames: feet on y=224, feet centred on x=128, 4 px art blocks.
All cells of a sheet share one scale (default: the tallest figure becomes HEIGHT_PX, default 192)."""
import sys, pathlib, numpy as np
from PIL import Image
from scipy import ndimage
a = sys.argv[1:]; sheet, grid, out, names = a[0], a[1], pathlib.Path(a[2]), a[3].split(",")
H = 192; S = None
if "--h" in a: H = int(a[a.index("--h") + 1])
if "--scale" in a: S = float(a[a.index("--scale") + 1])
cols, rows = map(int, grid.split("x")); out.mkdir(parents=True, exist_ok=True)
im = Image.open(sheet).convert("RGB"); A = np.asarray(im).astype(int)
mag = (A[..., 0] > 170) & (A[..., 2] > 170) & (A[..., 1] < 110) & (np.abs(A[..., 0] - A[..., 2]) < 90)
mag |= (np.abs(A - np.array([255, 0, 255])).sum(-1) < 140)
fg = ~mag
fg = ndimage.binary_opening(fg, np.ones((2, 2)))
lab, n = ndimage.label(fg, np.ones((3, 3)))
sz = ndimage.sum(fg, lab, range(1, n + 1))
keep = np.zeros(n + 1, bool); keep[1:] = sz > 400
fg = keep[lab]
h, w = fg.shape; cw, ch = w / cols, h / rows
cells = []
for i, nm in enumerate(names):
    r, c = divmod(i, cols)
    x0, x1, y0, y1 = int(c * cw), int((c + 1) * cw), int(r * ch), int((r + 1) * ch)
    m = fg[y0:y1, x0:x1]
    ys, xs = np.nonzero(m)
    if not len(ys): print("EMPTY", nm); cells.append(None); continue
    sub = np.array(im)[y0:y1, x0:x1]
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    cells.append((nm, sub, m, box))
tall = max(c[3][3] - c[3][1] for c in cells if c)
sc = S or H / tall
print("tallest", tall, "scale", round(sc, 4))
for c in cells:
    if not c: continue
    nm, sub, m, (x0, y0, x1, y1) = c
    rgba = np.dstack([sub, (m * 255).astype(np.uint8)])[y0:y1, x0:x1]
    # defringe magenta-tinged edge pixels
    cr = Image.fromarray(rgba)
    nw, nh = max(1, round(cr.width * sc / 4)), max(1, round(cr.height * sc / 4))   # size in 4px art blocks
    # box-downscale colour on premultiplied-ish data, alpha by coverage
    arr = np.asarray(cr).astype(float); al = arr[..., 3:] / 255
    pm = Image.fromarray((arr[..., :3] * al).astype(np.uint8)).resize((nw, nh), Image.BOX)
    am = Image.fromarray(arr[..., 3].astype(np.uint8)).resize((nw, nh), Image.BOX)
    pa = np.asarray(am).astype(float) / 255
    col = np.asarray(pm).astype(float) / np.maximum(pa[..., None], 1e-3)
    alpha = pa > 0.5
    img = np.dstack([np.clip(col, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
    small = Image.fromarray(img)
    # palette snap to 28 colours (opaque pixels only)
    op = np.asarray(small)[..., :3][alpha]
    if len(op):
        pal = Image.fromarray(op.reshape(-1, 1, 3)).quantize(28, Image.MEDIANCUT)
        q = Image.fromarray(np.asarray(small)[..., :3]).quantize(palette=pal, dither=Image.NONE).convert("RGB")
        img[..., :3] = np.asarray(q)
    small = Image.fromarray(img)
    big = small.resize((nw * 4, nh * 4), Image.NEAREST)
    ba = np.asarray(big)[..., 3] > 0
    ys, xs = np.nonzero(ba)
    bot = ys.max()
    foot = xs[ys > bot - 8]
    fx = (foot.min() + foot.max()) / 2
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ox = int(round((128 - fx) / 4)) * 4; oy = 224 - (bot + 1)
    canvas.paste(big, (ox, oy), big)
    canvas.save(out / f"{nm}.png")
    b = canvas.getchannel("A").getbbox(); print(nm, "bbox", b)
