#!/usr/bin/env python3
"""Close the broken outline on a cut adult (axolotl and luna moth, 2026-10-28).

Usage: outline_fix.py <sprites/species folder> <out folder> <name>...

Their adult batch came out of the cutter with the dark outline missing along
much of the silhouette and lone pixels of fringe left beside it. Working on the
file's own art grid (4 px, or 2 px on the 128 grid), this erases specks of one or
two art pixels (on 4 px; the same area on 2 px) touching the body, then repaints
the outermost ring of the body (art pixels next to transparency) in the teen's
outline colour where it isn't dark already. The silhouette, the
feet on y=224 and every separate piece (z, !, sparkles, bowls) are kept.
"""

import os
import sys

import numpy as np
from PIL import Image

DARK = 90  # luminance below this already reads as outline


def grid(a):
    """Art pixel size of an RGBA frame: 4, 2, or 1 off-grid (as scripts/art/grid.py)."""
    a = a.copy()
    a[a[..., 3] == 0] = 0
    for g in (4, 2):
        b = a.reshape(a.shape[0] // g, g, a.shape[1] // g, g, -1)
        if (b == b[:, :1, :, :1]).all():
            return g
    return 1


def art(path):
    """(art pixels, art pixel size) of a frame; exits if it is off-grid."""
    full = np.array(Image.open(path).convert("RGBA"))
    g = grid(full)
    if g == 1:
        sys.exit(f"{path}: not on a 2 or 4 px art grid")
    return full[::g, ::g].copy(), g


def lum(rgb):
    return 0.3 * rgb[..., 0] + 0.59 * rgb[..., 1] + 0.11 * rgb[..., 2]


def comps(m):
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y0, x0 in zip(*np.nonzero(m), strict=True):
        if lab[y0, x0]:
            continue
        n += 1
        st = [(y0, x0)]
        lab[y0, x0] = n
        while st:
            y, x = st.pop()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        st.append((yy, xx))
    return lab, n


def edge(m):
    p = np.pad(m, 1)
    return m & (~p[:-2, 1:-1] | ~p[2:, 1:-1] | ~p[1:-1, :-2] | ~p[1:-1, 2:])


def outline_colour(path):
    a, _ = art(path)
    e = edge(a[..., 3] > 16)
    cols, counts = np.unique(a[e][:, :3], axis=0, return_counts=True)
    return cols[counts.argmax()]


def fix(path, ink):
    a, g = art(path)
    op = a[..., 3] > 16
    lab, n = comps(op)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    body = lab == sizes.argmax()
    near = body.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            near |= np.roll(np.roll(body, dy, 0), dx, 1)
    for k in range(1, n + 1):
        piece = lab == k
        speck = 2 * (4 // g) ** 2
        if sizes[k] <= speck and (piece & near).any() and not (piece & body).any():
            a[piece] = 0
    ring = edge(a[..., 3] > 16) & body & (lum(a[..., :3].astype(float)) >= DARK)
    a[ring, :3] = ink
    a[ring, 3] = 255
    return Image.fromarray(a.repeat(g, 0).repeat(g, 1))


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    ink = outline_colour(os.path.join(src, "teen_content_1.png"))
    for name in sys.argv[3:]:
        fix(os.path.join(src, name + ".png"), ink).save(os.path.join(out, name + ".png"))
