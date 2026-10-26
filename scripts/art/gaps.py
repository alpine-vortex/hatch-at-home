"""Connected-pieces check (art review, step 2). Usage: gaps.py <folder>...

Flags sprites split into several big pieces or with a transparent band inside
the body. Expected extra pieces: "z", "!", bowls, TVs. The 0.7.0 leg gap was
only caught by this check.
"""

import os
import sys

import numpy as np
from PIL import Image


def pieces(a):
    h, w = a.shape
    lab = np.zeros((h, w), np.int32)
    sizes = []
    n = 0
    for y0, x0 in zip(*np.nonzero(a), strict=True):
        if lab[y0, x0]:
            continue
        n += 1
        st = [(y0, x0)]
        lab[y0, x0] = n
        c = 0
        while st:
            y, x = st.pop()
            c += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and a[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    st.append((yy, xx))
        sizes.append(c)
    return sorted(sizes, reverse=True)


for d in sys.argv[1:]:
    for f in sorted(os.listdir(d)):
        if not f.endswith(".png") or f.startswith("bg_") or f == "murk.png":
            continue
        a = np.array(Image.open(os.path.join(d, f)).convert("RGBA"))[..., 3] > 16
        s = pieces(a)
        big = [x for x in s if x >= 0.08 * s[0]]
        rows = a.any(1)
        ys = np.nonzero(rows)[0]
        band = (~rows[ys.min() : ys.max() + 1]).sum() if len(ys) else 0
        if len(big) > 1 or band:
            print(os.path.basename(d), f, "pieces", big[:5], "empty rows inside", band)
