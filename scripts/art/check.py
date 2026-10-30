"""Sizes, feet and frame pairs for a sprite folder (Sol's art review, step 1).

Usage: check.py <new sprite folder> [<current folder, to show NEW/CHANGED>]
Flags wrong sizes, feet off y=224, sprites touching the top, and mood frame
pairs whose size jumps more than 8 px (a pulse unless the pose moves). Reports
the art grid (grid.py) of the creature frames, and flags a frame whose grid isn't
the species' (the grid most of them are on): a half-migrated species.
"""

import collections
import os
import re
import sys

from grid import coarsest
import numpy as np
from PIL import Image

new = sys.argv[1]
old = sys.argv[2] if len(sys.argv) > 2 else None


def bbox(p):
    a = np.array(Image.open(p).convert("RGBA"))[..., 3]
    ys, xs = np.nonzero(a > 16)
    return (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else None


CHARACTER = ("baby_", "child_", "teen_", "adult_", "egg_")
grids = {
    f: coarsest(Image.open(os.path.join(new, f)))
    for f in sorted(os.listdir(new))
    if f.endswith(".png") and f.startswith(CHARACTER)
}
counts = collections.Counter(grids.values())
species_grid = counts.most_common(1)[0][0] if counts else None
print("-- art grid of the creature frames:", dict(sorted(counts.items(), reverse=True)))

groups = collections.defaultdict(dict)
for f in sorted(os.listdir(new)):
    if not f.endswith(".png"):
        continue
    p = os.path.join(new, f)
    # Most shipped sprites are optimized palette-indexed PNGs (see
    # scripts/art/palette.py). Convert before checking alpha and dimensions;
    # the encoded mode is an implementation detail, not an art defect.
    im = Image.open(p).convert("RGBA")
    note = []
    if f.startswith(("bg_", "murk")):
        if im.size != (512, 384):
            note.append(f"BG SIZE {im.size}")
    else:
        b = bbox(p)
        exp = (256, 256)
        if im.size not in [(256, 256), (128, 128)]:
            note.append(f"SIZE {im.size}")
        is_character = f.startswith(CHARACTER)
        if is_character and grids[f] != species_grid:
            note.append(f"GRID {grids[f]} px (species {species_grid} px)")
        if (
            is_character
            and im.size == (256, 256)
            and b
            and abs(b[3] - 223) > 2
        ):
            note.append(f"feet y={b[3] + 1}")
        if is_character and b and b[1] == 0:
            note.append("TOUCHES TOP")
        m = re.match(r"(.*)_(\d)$", f[:-4])
        if is_character and m and b:
            groups[m.group(1)][m.group(2)] = b
    if old and os.path.exists(os.path.join(old, f)):
        same = open(p, "rb").read() == open(os.path.join(old, f), "rb").read()
        note.append("same" if same else "CHANGED")
    elif old:
        note.append("NEW")
    if note and note != ["same"]:
        print(f, *note)
print("-- frame pairs with size jump >8px (w or h):")
for k, fr in groups.items():
    if "1" in fr and "2" in fr:
        a, b = fr["1"], fr["2"]
        dw = (a[2] - a[0]) - (b[2] - b[0])
        dh = (a[3] - a[1]) - (b[3] - b[1])
        if abs(dw) > 8 or abs(dh) > 8:
            print(k, "dw", dw, "dh", dh, a, b)
