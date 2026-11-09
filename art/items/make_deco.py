#!/usr/bin/env python3
"""frontend/ui/deco_item_<name>.png: the six floor-decor cuts on a transparent 160x160.

x centred and rounded to a multiple of 4, standing 4 px above the bottom edge.
Then run scripts/art/palette.py on the outputs.
"""

import pathlib

from PIL import Image

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent.parent / "custom_components/virtual_pet/frontend/ui"
NAMES = ["sprout", "basket", "flower_box", "bookshelf", "aquarium", "lamp"]

for n in NAMES:
    p = Image.open(HERE / f"cut/room-decor/deco_item_{n}.png").convert("RGBA")
    w, h = p.size
    assert w % 4 == 0 and h % 4 == 0, (n, p.size)
    assert set(p.getchannel("A").getdata()) <= {0, 255}, n
    x = (160 - w) // 2 // 4 * 4
    im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    im.paste(p, (x, 160 - h - 4))
    im.save(OUT / f"deco_item_{n}.png")
