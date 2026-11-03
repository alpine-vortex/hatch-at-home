#!/usr/bin/env python3
"""Cut the shared blanket drape: source/drape_{s,m,l}.png (one 3-frame strip each,
flat mid-grey ground) -> frontend/ui/drape_{s,m,l}_{1,2,3}.png.

usage: cut_drape.py [OUTDIR [SIZES]]   (SIZES like "sm"; default every size with a source)

Each output is a 256 x 256 transparent PNG on the pets' sprite frame: art on the 4 px
grid (64 x 64 art pixels), the blanket centred, its bottom edge (the ground line)
on y=224, the pets' feet line. The three frames of a size share one ground line and one
left and right edge, so `steps(3)` never jumps. Final-frame width is the size
(S 160 px, M 208, L 252) and the heights are about 100, 110 and 120 px.

Per frame: the grey is keyed out, the frame is resized to the art grid at a work
pitch of 12 source px per art px, each art pixel takes the median colour of its
block's middle (opaque if most of it is drawn), and every colour is mapped to the one
shared 4-colour palette (outline, fold shade, cream, highlight). No dithering.
"""

import pathlib
import sys

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).parent
OUT = (
    pathlib.Path(sys.argv[1])
    if len(sys.argv) > 1
    else (HERE.parents[1] / "custom_components/virtual_pet/frontend/ui")
)
# size: (final width in art px, final height in art px)
SIZES = {"s": (40, 25), "m": (52, 28), "l": (63, 30)}
HEIGHT_FRAC = (0.55, 0.85, 1.0)  # frame 1, 2, 3 against the final height
PX = 4  # screen px per art px
GROUND = 224  # the feet line
WORK = 12  # source px per art px while snapping
PALETTE = [  # 4 colours, the brief allows 5
    (92, 58, 30),  # outline
    (209, 176, 120),  # fold shade
    (239, 217, 171),  # cream
    (248, 236, 206),  # highlight
]


def key(a):
    border = np.concatenate(
        [
            a[:6].reshape(-1, 3),
            a[-6:].reshape(-1, 3),
            a[:, :6].reshape(-1, 3),
            a[:, -6:].reshape(-1, 3),
        ]
    )
    bg = np.median(border, axis=0)
    return np.sqrt(((a - bg) ** 2).sum(-1)) >= 40


def frames(path):
    """The three frames as (rgb, keep) crops, split on empty columns."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    k = key(a)
    cols = k.sum(0) > 0
    runs, start = [], None
    for x, on in enumerate(cols):
        if on and start is None:
            start = x
        if not on and start is not None:
            runs.append([start, x])
            start = None
    if start is not None:
        runs.append([start, len(cols)])
    # merge runs split by a gap under 8 px, drop specks
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 8:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    merged = [r for r in merged if r[1] - r[0] > a.shape[1] // 30]
    if len(merged) != 3:
        raise SystemExit(f"{path}: found {len(merged)} frames, wanted 3: {merged}")
    out = []
    for x0, x1 in merged:
        kk = k[:, x0:x1]
        rows = np.where(kk.sum(1) > 0)[0]
        y0, y1 = rows[0], rows[-1] + 1
        out.append((a[y0:y1, x0:x1].astype(np.uint8), kk[y0:y1]))
    return out


def snap(rgb, keep, w, h):
    """Resize the crop to w x h art px (work pitch), then median per block."""
    img = Image.fromarray(rgb, "RGB").resize((w * WORK, h * WORK), Image.LANCZOS)
    kp = Image.fromarray((keep * 255).astype(np.uint8)).resize(
        (w * WORK, h * WORK), Image.BILINEAR
    )
    a = np.asarray(img)
    k = np.asarray(kp) >= 128
    out = np.zeros((h, w, 4), np.uint8)
    for j in range(h):
        for i in range(w):
            kb = k[j * WORK : (j + 1) * WORK, i * WORK : (i + 1) * WORK]
            if kb.mean() < 0.5:
                continue
            blk = a[j * WORK : (j + 1) * WORK, i * WORK : (i + 1) * WORK][3:9, 3:9]
            sel = blk[kb[3:9, 3:9]]
            if not len(sel):
                sel = a[j * WORK : (j + 1) * WORK, i * WORK : (i + 1) * WORK][kb]
            out[j, i, :3] = np.median(sel, axis=0)
            out[j, i, 3] = 255
    return out


def to_palette(px):
    pal = np.array(PALETTE, np.float32)
    on = px[..., 3] > 0
    d = ((px[..., None, :3].astype(np.float32) - pal) ** 2).sum(-1)
    idx = d.argmin(-1)
    out = px.copy()
    out[..., :3] = pal[idx].astype(np.uint8)
    out[~on] = 0
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[2] if len(sys.argv) > 2 else "".join(SIZES)
    for size, (aw, ah) in SIZES.items():
        if size not in only or not (HERE / "source" / f"drape_{size}.png").exists():
            continue
        fr = frames(HERE / "source" / f"drape_{size}.png")
        cells = []
        for n, (rgb, keep) in enumerate(fr):
            h = max(2, round(ah * HEIGHT_FRAC[n]))
            if n == 2:
                h = ah
            cells.append(to_palette(snap(rgb, keep, aw, h)))
        for n, cell in enumerate(cells):
            h = cell.shape[0]
            canvas = np.zeros((64, 64, 4), np.uint8)
            x0 = (64 - aw) // 2
            y1 = GROUND // PX
            canvas[y1 - h : y1, x0 : x0 + aw] = cell
            img = Image.fromarray(canvas, "RGBA").resize((256, 256), Image.NEAREST)
            img.save(OUT / f"drape_{size}_{n + 1}.png")
            cols = len({tuple(p) for p in canvas.reshape(-1, 4) if p[3]})
            print(f"drape_{size}_{n + 1}: {aw}x{h} art px, {cols} colours")


if __name__ == "__main__":
    main()
