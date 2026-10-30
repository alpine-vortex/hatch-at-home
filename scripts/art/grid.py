"""The art grid a frame is drawn on: how many frame px make one art pixel.

Creatures are on 4 px (the 64 art-pixel grid) or 2 px (the 128 grid, see
docs/plan-2026-10-29-sprite-grid-128.md); props, UI and season art stay on 4.
A frame on 4 px also fits 2, so this measures the coarsest grid it fits.
"""

import numpy as np
from PIL import Image

GRIDS = (4, 2)


def coarsest(im) -> int:
    """Art pixel size of an image or RGBA array: 4, 2, or 1 when off-grid.

    Transparent pixels count as one colour whatever their RGB. A blank or tiny
    frame fits 8 as well; it counts as 4, the coarsest grid art is drawn on.
    """
    a = np.array(im.convert("RGBA") if isinstance(im, Image.Image) else im)
    a[a[..., 3] == 0] = 0
    h, w = a.shape[:2]
    for g in GRIDS:
        if h % g or w % g:
            continue
        b = a.reshape(h // g, g, w // g, g, -1)
        if (b == b[:, :1, :, :1]).all():
            return g
    return 1
