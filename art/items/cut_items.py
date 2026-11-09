#!/usr/bin/env python3
"""Cut the 48 item pieces from the owner's four 4x3 sheets, for review (not wired in).

usage: cut_items.py [SRC_DIR] [OUTDIR]
SRC_DIR holds toys.png, wearables.png, room-decor.png, food-and-drink.png (concept
sheets, kept out of git; default /home/poe/github/hatch-at-home/art/item-sheets).
OUTDIR defaults to art/items/cut, one folder per sheet.

Method as art/props/cut_clean_props.py, but the items bleed across the nominal cells
(a lantern's cord), so they are connected components of the alpha (dilated a little
to hold a mallet or a string to its item), not fixed cells. Alpha is soft, so it is
re-keyed hard (>= 128). The pitch (source px per art px) is measured per sheet from
the colour edges, each item is snapped to that grid, one 16-colour palette per sheet,
written at 4x with NEAREST and trimmed to the drawn box.
"""

import json
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as nd

HERE = pathlib.Path(__file__).parent
SRC = pathlib.Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "/home/poe/github/hatch-at-home/art/item-sheets"
)
OUT = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "cut"
PX = 4

SHEETS = {
    "toys": [
        "item_ball",
        "item_ring_stacker",
        "item_chick",
        "item_drum",
        "item_rattle",
        "item_snail",
        "item_cloud_plush",
        "item_cups",
        "item_xylophone",
        "item_pinwheel",
        "item_boat",
        "item_kite",
    ],
    "wearables": [
        "hat_beanie",
        "hat_sunhat",
        "hat_flower_band",
        "hat_bunny_hood",
        "wear_bow_tie",
        "wear_scarf",
        "wear_glasses",
        "hat_leaf_crown",
        "hat_rain_hood",
        "wear_cape",
        "hat_chef",
        "wear_backpack",
    ],
    "room-decor": [
        "deco_item_sprout",
        "deco_item_clock",
        "deco_item_frame",
        "deco_item_lantern",
        "deco_item_cushion",
        "deco_item_plaque",
        "deco_item_bookshelf",
        "deco_item_star_lights",
        "deco_item_aquarium",
        "deco_item_basket",
        "deco_item_lamp",
        "deco_item_flower_box",
    ],
    "food-and-drink": [
        "food_tart",
        "food_toast",
        "food_rice_ball",
        "food_fish_biscuit",
        "food_cocoa",
        "food_fruit_bowl",
        "food_dumpling",
        "food_pancakes",
        "food_muffin",
        "food_star_cookie",
        "food_yogurt",
        "food_onigiri",
    ],
}


def pitch(rgb, keep):
    """Source px per art px: the strongest period of colour edges inside the drawn area."""
    best = []
    for axis in (1, 0):
        d = np.abs(np.diff(rgb, axis=axis)).sum(2).astype(float)
        k = keep[:, 1:] & keep[:, :-1] if axis == 1 else keep[1:] & keep[:-1]
        d = d * k
        prof = d.sum(axis=0) if axis == 1 else d.sum(axis=1)
        x = np.arange(len(prof)) + 0.5
        ps = np.arange(6.0, 12.01, 0.02)
        sc = [abs((prof * np.exp(2j * np.pi * x / p)).sum()) for p in ps]
        best.append(float(ps[int(np.argmax(sc))]))
    return best


def snap(rgb, keep, px, py):
    h, w = round(rgb.shape[0] / py), round(rgb.shape[1] / px)
    ys = np.linspace(0, rgb.shape[0], h + 1).astype(int)
    xs = np.linspace(0, rgb.shape[1], w + 1).astype(int)
    out = np.zeros((h, w, 3), np.uint8)
    alpha = np.zeros((h, w), np.uint8)
    for j in range(h):
        for i in range(w):
            k = keep[ys[j] : ys[j + 1], xs[i] : xs[i + 1]]
            if k.size == 0 or k.mean() < 0.5:
                continue
            blk = rgb[ys[j] : ys[j + 1], xs[i] : xs[i + 1]]
            bh, bw = k.shape
            mid = (slice(bh // 4, bh - bh // 4), slice(bw // 4, bw - bw // 4))
            sel = blk[mid][k[mid]]
            if not len(sel):
                sel = blk[k]
            out[j, i] = np.median(sel, axis=0)
            alpha[j, i] = 255
    return Image.fromarray(np.dstack([out, alpha]), "RGBA")


def clean(cells, colours=16):
    strip = Image.new(
        "RGB", (sum(c.width for c in cells), max(c.height for c in cells))
    )
    x = 0
    for c in cells:
        strip.paste(c.convert("RGB"), (x, 0), c)
        x += c.width
    pal = strip.quantize(colors=colours, method=Image.Quantize.MEDIANCUT)
    out = []
    for c in cells:
        q = (
            c.convert("RGB")
            .quantize(palette=pal, dither=Image.Dither.NONE)
            .convert("RGBA")
        )
        q.putalpha(c.getchannel("A"))
        out.append(q)
    return out


# The hoods' face hole is a flat brown patch: flood it from a seed (art px, x, y of the
# trimmed cut) through the same palette colour and make it transparent.
HOLES = {"hat_bunny_hood": (20, 20), "hat_rain_hood": (15, 19)}


def key_hole(cell, seed):
    a = np.array(cell)
    h, w = a.shape[:2]
    col = tuple(a[seed[1], seed[0]])
    stack, seen = [seed], set()
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
            continue
        if a[y, x, 3] == 0 or tuple(a[y, x]) != col:
            continue
        seen.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    for x, y in seen:
        a[y, x] = (0, 0, 0, 0)
    print(f"  face hole keyed: {len(seen)} art px")
    return Image.fromarray(a, "RGBA")


def components(alpha):
    m = alpha >= 128
    lab, n = nd.label(nd.binary_dilation(m, iterations=10))
    assert n == 12, f"expected 12 items, found {n}"
    boxes = nd.find_objects(lab)
    items = []
    for i, sl in enumerate(boxes, 1):
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        items.append((cy, cx, sl, (lab == i) & m))
    items.sort(key=lambda t: t[0])
    rows = []
    for r in range(3):
        row = sorted(items[r * 4 : (r + 1) * 4], key=lambda t: t[1])
        rows += row
    return rows


def main():
    info = {}
    for sheet, names in SHEETS.items():
        im = np.asarray(Image.open(SRC / f"{sheet}.png").convert("RGBA"))
        comps = components(im[..., 3])
        raw = []
        for _cy, _cx, sl, mask in comps:
            sub = im[sl]
            keep = mask[sl]
            raw.append((sub[..., :3].astype(np.int16), keep))
        pitches = [pitch(r, k) for r, k in raw]
        p = float(np.median([v for pr in pitches for v in pr]))
        cells = [snap(r, k, p, p) for r, k in raw]
        cells = [c.crop(c.getbbox()) for c in cells]
        cells = clean(cells)
        cells = [
            key_hole(c, HOLES[n]) if n in HOLES else c
            for c, n in zip(cells, names, strict=True)
        ]
        (OUT / sheet).mkdir(parents=True, exist_ok=True)
        for name, cell, pr in zip(names, cells, pitches, strict=True):
            cell.resize((cell.width * PX, cell.height * PX), Image.NEAREST).save(
                OUT / sheet / f"{name}.png"
            )
            info[name] = {"sheet": sheet, "art_px": [cell.width, cell.height]}
            print(
                f"{sheet}/{name}: {cell.width}x{cell.height} art px (item pitch {pr[0]:.2f},{pr[1]:.2f}; sheet {p:.2f})"
            )
    (OUT / "sizes.json").write_text(json.dumps(info, indent=1))


if __name__ == "__main__":
    main()
