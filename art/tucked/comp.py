#!/usr/bin/env python3
"""No-call variant: the ORIGINAL asleep frame with only the blanket pasted over it.
Blanket mask = blue/navy pixels of the cut tucked frame (cream stitch dots filled by closing)."""

import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SP = (
    str(
        __import__("pathlib").Path(__file__).resolve().parents[2]
        / "custom_components/virtual_pet/frontend/sprites"
    )
    + "/"
)
sp, st, cut, out = sys.argv[1:5]
t = np.asarray(Image.open(cut).convert("RGBA")).astype(int)
o = Image.open(SP + f"{sp}/{st}_asleep_1.png").convert("RGBA")
r, g, b, a = t[..., 0], t[..., 1], t[..., 2], t[..., 3]
blue = (a > 0) & (b > r + 8) & (b >= g - 4)
# art-pixel grid: work at 64x64
bl = blue[::4, ::4]
bl = ndimage.binary_closing(bl, structure=np.ones((3, 3)))
bl = ndimage.binary_fill_holes(bl)
lab, n = ndimage.label(bl)
if n > 1:
    sz = ndimage.sum(bl, lab, range(1, n + 1))
    bl = lab == (1 + int(np.argmax(sz)))
mask = np.kron(bl, np.ones((4, 4), bool))
res = o.copy()
ta = Image.fromarray(t.astype(np.uint8), "RGBA")
tn = np.asarray(ta)
rn = np.asarray(res).copy()
rn[mask] = tn[mask]
Image.fromarray(rn, "RGBA").save(out)
print(out, mask.sum())
