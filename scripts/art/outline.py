"""Close the dark outline around a creature where its edge is light.

Usage: outline.py <species folder> [...]

Some generated creatures come out with gaps in their outline, mostly along
cream feet, chests and tail tips, so on a phone the silhouette blurs into the
scene. For every stage sprite ({baby,child,teen,adult}_*.png) this adds one art
pixel (4 px) of the sprite's own outline colour just outside each light edge
pixel. Edges that are already dark are left alone, so nothing gets a doubled
outline. Small detached marks (sparkles, 'z', '!') are skipped, and nothing is
added below the feet line (y=224). Props and backgrounds aren't touched.

Running it again changes nothing. Prints how many art pixels it added per file.
"""

from collections import Counter
from pathlib import Path
import sys

import numpy as np
from PIL import Image

GRID = 4  # art pixel size in the 256 px frame
BASE = 224 // GRID  # feet line, in art pixels
MIN_PART = 25  # art pixels; smaller detached bits are effects, not body
DARK = 200  # r+g+b below this counts as outline
STAGES = ("baby_", "child_", "teen_", "adult_")


def parts(mask):
    """Label 8-connected parts of a small boolean grid; returns (labels, sizes)."""
    lab = np.zeros(mask.shape, int)
    sizes = [0]
    for y, x in zip(*np.nonzero(mask)):
        if lab[y, x]:
            continue
        n = len(sizes)
        lab[y, x] = n
        stack, size = [(y, x)], 0
        while stack:
            cy, cx = stack.pop()
            size += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if (
                        0 <= ny < mask.shape[0]
                        and 0 <= nx < mask.shape[1]
                        and mask[ny, nx]
                        and not lab[ny, nx]
                    ):
                        lab[ny, nx] = n
                        stack.append((ny, nx))
        sizes.append(size)
    return lab, sizes


def outline(im):
    """Return (new image, art pixels added)."""
    full = np.array(im.convert("RGBA"))
    art = full[::GRID, ::GRID].copy()
    solid = art[:, :, 3] > 40
    lum = art[:, :, :3].astype(int).sum(2)
    lab, sizes = parts(solid)
    body = np.isin(lab, [i for i, z in enumerate(sizes) if i and z >= MIN_PART])
    pad = np.pad(body, 1)
    edge = body & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    inks = Counter(tuple(art[y, x, :3]) for y, x in zip(*np.nonzero(edge & (lum < DARK))))
    if not inks:
        return im, 0
    ink = inks.most_common(1)[0][0]
    light_edge = edge & (lum >= DARK)
    ring = np.zeros_like(solid)
    p = np.pad(light_edge, 1)
    ring |= p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    ring &= ~solid
    # Keep a gap to detached effects, so they stay separate from the body.
    fx = np.pad(solid & ~body, 1)
    near_fx = np.zeros_like(solid)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            near_fx |= fx[dy:dy + solid.shape[0], dx:dx + solid.shape[1]]
    ring &= ~near_fx
    ring[BASE:, :] = False
    if not ring.any():
        return im, 0
    big = np.kron(ring, np.ones((GRID, GRID), bool))
    full[big, :3] = ink
    full[big, 3] = 255
    return Image.fromarray(full, "RGBA"), int(ring.sum())


def main(folders):
    for folder in folders:
        total = 0
        for path in sorted(Path(folder).glob("*.png")):
            if not path.name.startswith(STAGES):
                continue
            im = Image.open(path)
            if im.size != (256, 256):
                continue
            new, added = outline(im)
            if added:
                new.save(path)
                total += added
        print(f"{folder}: {total} art pixels added")


if __name__ == "__main__":
    main(sys.argv[1:])
