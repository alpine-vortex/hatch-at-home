#!/usr/bin/env python3
"""Cut the six crate-push skins from luna_sheet.png and write the contact sheet.
usage: cut_crate_skins.py [OUTDIR]   (default: the card's ui/ folder)

luna_sheet.png: one Luna sheet (3 x 2) of the pushed objects on flat magenta.
Each object is keyed, trimmed, box-shrunk to fit 16 art px, centred on a 20 x 20
art-px cell (as the hop_* tiles) and written at 4x: crate_<world>.png, 80 x 80.
Also writes crate_contact.png next to this script: each skin on its world's floor
at 1x and at the card's ~44 px cell, beside a plain ring spot.
"""

import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).parent
UI = HERE.parents[1] / "custom_components/virtual_pet/frontend/ui"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else UI
WORLDS = ["woodland", "terrarium", "hearth", "tidepool", "pond", "nightsky"]  # sheet order
FIT = 16  # art px the object may fill
CELL = 20  # art px per cell
PX = 4


def cut():
    a = np.array(Image.open(HERE / "luna_sheet.png").convert("RGB")).astype(int)
    h, w, _ = a.shape
    key = (abs(a[..., 0] - 255) < 60) & (a[..., 1] < 90) & (abs(a[..., 2] - 255) < 60)
    out = {}
    for i, world in enumerate(WORLDS):
        r, c = divmod(i, 3)
        y0, y1, x0, x1 = r * h // 2, (r + 1) * h // 2, c * w // 3, (c + 1) * w // 3
        sub = ~key[y0:y1, x0:x1]
        ys, xs = np.where(sub)
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.dstack([a[y0:y1, x0:x1], sub * 255]).astype(np.uint8)[by0:by1, bx0:bx1]
        im = Image.fromarray(rgba, "RGBA")
        s = FIT / max(im.size)
        sz = (max(1, round(im.width * s)), max(1, round(im.height * s)))
        small = im.resize(sz, Image.BOX)
        arr = np.array(small)
        arr[..., 3] = np.where(arr[..., 3] >= 128, 255, 0)  # crisp edge, no halo
        arr[arr[..., 3] == 0] = 0
        small = Image.fromarray(arr, "RGBA")
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        cell.paste(small, ((CELL - sz[0]) // 2, (CELL - sz[1]) // 2 + 1))  # sits 1 px low
        out[world] = cell.resize((CELL * PX, CELL * PX), Image.NEAREST)
    return out


def contact(skins):
    grounds = {k: v["ground"] for k, v in json.load(open(UI.parent / "worlds.json")).items()}
    cellpx = 44
    sheet = Image.new("RGB", (6 * 190, 330), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    for i, w in enumerate(WORLDS):
        x = i * 190
        g = grounds[w]
        d.rectangle([x, 0, x + 189, 329], fill=g)
        d.text((x + 6, 4), w, fill=(255, 255, 255))
        sk = skins[w]
        # 1x (80 px = the file size) off a spot and on a spot
        sheet.paste(sk, (x + 5, 24), sk)
        ring = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse([14, 14, 66, 66], outline=(240, 220, 120, 255), width=4)
        sheet.paste(ring, (x + 100, 24), ring)
        sheet.paste(sk, (x + 100, 24), sk)
        # card size: 44 px cells, off / on spot, and next to nothing else
        small = sk.resize((cellpx, cellpx), Image.NEAREST)
        sr = ring.resize((cellpx, cellpx), Image.NEAREST)
        sheet.paste(small, (x + 5, 130), small)
        sheet.paste(sr, (x + 100, 130), sr)
        sheet.paste(small, (x + 100, 130), small)
        # on-spot glow, as the card can do in CSS (drop-shadow)
        glow = Image.new("RGBA", sk.size, (0, 0, 0, 0))
        m = Image.fromarray(np.array(sk)[..., 3])
        from PIL import ImageFilter

        halo = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(3))
        glow.paste((255, 235, 140, 255), mask=halo.point(lambda v: int(v * 0.8)))
        gs = glow.resize((cellpx, cellpx), Image.BILINEAR)
        sheet.paste(gs, (x + 52, 190), gs)
        sheet.paste(small, (x + 52, 190), small)
        d.text((x + 5, 118), "off", fill=(255, 255, 255))
        d.text((x + 100, 118), "on spot", fill=(255, 255, 255))
        d.text((x + 52, 178), "on + glow", fill=(255, 255, 255))
    sheet.save(HERE / "crate_contact.png")


def main():
    skins = cut()
    OUT.mkdir(parents=True, exist_ok=True)
    for w, im in skins.items():
        im.save(OUT / f"crate_{w}.png")
    contact(skins)


if __name__ == "__main__":
    main()
