#!/usr/bin/env python3
"""art/items/contact.png: all cut pieces on a dark and a light background, labelled."""

import json
import pathlib

from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).parent
info = json.loads((HERE / "cut/sizes.json").read_text())
names = list(info)
CELL, COLS = 200, 6
rows = -(-len(names) // COLS)


def sheet(bg, fg):
    im = Image.new("RGB", (CELL * COLS, CELL * rows), bg)
    d = ImageDraw.Draw(im)
    for i, n in enumerate(names):
        x, y = i % COLS * CELL, i // COLS * CELL
        p = Image.open(HERE / "cut" / info[n]["sheet"] / f"{n}.png")
        s = min(1, (CELL - 30) / max(p.size))
        if s < 1:
            p = p.resize(
                (max(1, int(p.width * s)), max(1, int(p.height * s))), Image.NEAREST
            )
        im.paste(p, (x + (CELL - p.width) // 2, y + 6 + (CELL - 30 - p.height) // 2), p)
        d.text(
            (x + 4, y + CELL - 20),
            f"{n} {info[n]['art_px'][0]}x{info[n]['art_px'][1]}",
            fill=fg,
        )
    return im


a, b = sheet((40, 40, 48), (230, 230, 230)), sheet((238, 232, 220), (30, 30, 30))
out = Image.new("RGB", (a.width * 2, a.height))
out.paste(a, (0, 0))
out.paste(b, (a.width, 0))
out.save(HERE / "contact.png")
