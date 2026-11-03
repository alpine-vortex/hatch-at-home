#!/usr/bin/env python3
"""The ORIGINAL asleep frame with only the blanket pasted over it (no call).
usage: comp.py SPECIES STAGE CUT.png OUT.png
Blanket mask = blue/navy pixels of the cut tucked frame (stitch dots filled by closing on the 64x64 art grid),
the largest piece only, clipped to the original's silhouette so it never widens the pet. On the water pets
(duckling, otter) pixels that are already water-blue in the original are not blanket.
Prints one JSON line of checks: pieces dropped, mask px, share of the pet covered, px clipped off the silhouette."""

import json
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SP = (
    pathlib.Path(__file__).resolve().parents[2]
    / "custom_components/virtual_pet/frontend/sprites"
)
WATER = {"duckling", "otter"}


def comp(sp, st, cut, out):
    t = np.asarray(Image.open(cut).convert("RGBA")).astype(int)
    o = np.asarray(Image.open(SP / sp / f"{st}_asleep_1.png").convert("RGBA")).astype(
        int
    )
    r, g, b, a = (t[..., i] for i in range(4))
    blue = (a > 0) & (b > r + 8) & (b >= g - 4)
    if sp in WATER:
        orr, og, ob = o[..., 0], o[..., 1], o[..., 2]
        blue &= ~((o[..., 3] > 0) & (ob > orr + 8) & (ob >= og - 4))
    bl = ndimage.binary_closing(blue[::4, ::4], structure=np.ones((3, 3)))
    bl = ndimage.binary_fill_holes(bl)
    lab, n = ndimage.label(bl)
    dropped = 0
    if n > 1:
        sz = ndimage.sum(bl, lab, range(1, n + 1))
        keep = 1 + int(np.argmax(sz))
        dropped = int(sz.sum() - sz.max())
        bl = lab == keep
    mask = np.kron(bl, np.ones((4, 4), bool))
    inside = mask & (o[..., 3] > 0)
    clipped = int(mask.sum() - inside.sum())
    res = o.copy()
    res[inside] = t[inside]
    res[inside, 3] = 255
    Image.fromarray(res.astype(np.uint8), "RGBA").save(out)
    pet = int((o[..., 3] > 0).sum())
    return {
        "pieces": int(n),
        "dropped_art_px": dropped,
        "mask_px": int(inside.sum()),
        "cover": round(inside.sum() / max(pet, 1), 3),
        "clipped_px": clipped,
        "clipped_share": round(clipped / max(mask.sum(), 1), 3),
    }


if __name__ == "__main__":
    sp, st, cut, out = sys.argv[1:5]
    print(json.dumps(comp(sp, st, cut, out)))
