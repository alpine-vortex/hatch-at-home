"""Shrink a frame drawn too big for its stage, on its own art grid (grid.py).

Usage: rescale.py <sprite folder> <name>=<factor> ...   (rewrites in place)
Scales about the middle of the sprite with the feet fixed on their line, so the
pose stays put. Give both frames of a pair the same factor to keep the bob.
Only for shrinking: growing pixel art doubles outline pixels, so a frame drawn
too small goes back to the artist instead.
"""

import os
import sys

from grid import coarsest
import numpy as np
from PIL import Image


def rescale(a: np.ndarray, f: float) -> np.ndarray:
    ys, xs = np.nonzero(a[..., 3] > 16)
    cx = (xs.min() + xs.max() + 1) / 2
    feet = ys.max() + 1
    h, w = a.shape[:2]
    y, x = np.mgrid[0:h, 0:w] + 0.5
    sy = np.floor(feet - (feet - y) / f).astype(int)
    sx = np.floor(cx + (x - cx) / f).astype(int)
    ok = (sy >= 0) & (sy < h) & (sx >= 0) & (sx < w)
    out = np.zeros_like(a)
    out[ok] = a[sy[ok], sx[ok]]
    return out


folder = sys.argv[1]
for arg in sys.argv[2:]:
    name, f = arg.split("=")
    if float(f) > 1:
        sys.exit(f"{name}: only shrinking is supported")
    p = os.path.join(folder, name + ".png")
    full = np.array(Image.open(p).convert("RGBA"))
    g = coarsest(full)
    if g == 1:
        sys.exit(f"{name}: not on a 2 or 4 px art grid")
    a = full[::g, ::g]
    Image.fromarray(rescale(a, float(f)).repeat(g, 0).repeat(g, 1)).save(p)
