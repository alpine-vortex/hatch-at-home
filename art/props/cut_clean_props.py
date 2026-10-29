#!/usr/bin/env python3
"""Cut the cleaning props from the owner's 2x2 sheets. usage: cut_clean_props.py [OUTDIR]

source/broom.png: top row two broom frames, bottom row a dust puff in two frames.
source/water_clean.png: top row a fish net (murk in it) in two frames, bottom row
rising bubbles in two frames. Both on flat mid-grey.

The grey is keyed out everywhere, not only from the edges: the net's mesh holes
show it inside the outline. The sheets are drawn at about 13 source px per art
pixel (measured across, per sheet; art pixels are square, and the vertical
edges read longer only because the strokes are), so each
cell is snapped back to that grid, its colours cleaned to one shared palette, and
written at 4x like the creatures, trimmed to what's drawn. Default OUTDIR is the
card's ui/ folder; the card sizes them by their art height (see _sceneArt).
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
SHEETS = {
    "broom": ["prop_broom_1", "prop_broom_2", "prop_dust_1", "prop_dust_2"],
    "water_clean": ["prop_net_1", "prop_net_2", "prop_bubbles_1", "prop_bubbles_2"],
}
PX = 4  # screen px per art px in the written PNGs, as the creatures


def pitch(a, axis):
    """Source px per art px along an axis: the strongest period of the colour edges."""
    edges = np.abs(np.diff(a, axis=axis)).sum(2)
    prof = edges.sum(axis=0) if axis == 1 else edges.sum(axis=1)
    x = np.arange(len(prof)) + 0.5
    best = max(
        np.arange(9, 16.01, 0.02),
        key=lambda p: abs((prof * np.exp(2j * np.pi * x / p)).sum()),
    )
    return float(best)


def snap(a, keep, px, py):
    """Each art pixel takes the median colour of its block; opaque if most of it is drawn."""
    h, w = round(a.shape[0] / py), round(a.shape[1] / px)
    ys = np.linspace(0, a.shape[0], h + 1).astype(int)
    xs = np.linspace(0, a.shape[1], w + 1).astype(int)
    rgb = np.zeros((h, w, 3), np.uint8)
    alpha = np.zeros((h, w), np.uint8)
    for j in range(h):
        for i in range(w):
            k = keep[ys[j] : ys[j + 1], xs[i] : xs[i + 1]]
            if k.mean() < 0.5:
                continue
            # The block's middle only: the soft edges between art pixels muddy it.
            bh, bw = k.shape
            mid = (slice(bh // 4, bh - bh // 4), slice(bw // 4, bw - bw // 4))
            blk = a[ys[j] : ys[j + 1], xs[i] : xs[i + 1]][mid]
            sel = blk[k[mid]]
            if not len(sel):
                sel = a[ys[j] : ys[j + 1], xs[i] : xs[i + 1]][k]
            rgb[j, i] = np.median(sel, axis=0)
            alpha[j, i] = 255
    return Image.fromarray(np.dstack([rgb, alpha]), "RGBA")


def clean(cells, colours=16):
    """One shared palette for a sheet's cells, no dithering."""
    strip = Image.new(
        "RGB", (sum(c.width for c in cells), max(c.height for c in cells))
    )
    x = 0
    for c in cells:
        strip.paste(c.convert("RGB"), (x, 0), c)
        x += c.width
    pal = strip.quantize(colors=colours, method=Image.Quantize.MEDIANCUT)
    out = []
    for c in cells:
        q = (
            c.convert("RGB")
            .quantize(palette=pal, dither=Image.Dither.NONE)
            .convert("RGBA")
        )
        q.putalpha(c.getchannel("A"))
        out.append(q)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet, names in SHEETS.items():
        a = np.asarray(
            Image.open(HERE / "source" / f"{sheet}.png").convert("RGB")
        ).astype(np.int16)
        border = np.concatenate(
            [
                a[:6].reshape(-1, 3),
                a[-6:].reshape(-1, 3),
                a[:, :6].reshape(-1, 3),
                a[:, -6:].reshape(-1, 3),
            ]
        )
        bg = np.median(border, axis=0)
        keep = (
            np.sqrt(((a - bg) ** 2).sum(-1)) >= 30
        )  # the grey goes everywhere, holes too
        px = py = pitch(a, 1)
        h, w = a.shape[0] // 2, a.shape[1] // 2
        cells = []
        for r in range(2):
            for c in range(2):
                cells.append(
                    snap(
                        a[r * h : (r + 1) * h, c * w : (c + 1) * w],
                        keep[r * h : (r + 1) * h, c * w : (c + 1) * w],
                        px,
                        py,
                    )
                )
        cells = clean(cells)
        # Both frames of a pair share one box, so swapping them never jumps.
        for k in (0, 2):
            boxes = [c.getbbox() for c in cells[k : k + 2]]
            box = (
                min(b[0] for b in boxes),
                min(b[1] for b in boxes),
                max(b[2] for b in boxes),
                max(b[3] for b in boxes),
            )
            cells[k : k + 2] = [c.crop(box) for c in cells[k : k + 2]]
        for name, cell in zip(names, cells, strict=True):
            cell.resize((cell.width * PX, cell.height * PX), Image.NEAREST).save(
                OUT / f"{name}.png"
            )
            print(
                f"{name}: {cell.width}x{cell.height} art px (pitch {px:.2f} x {py:.2f})"
            )


if __name__ == "__main__":
    main()
