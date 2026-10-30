#!/usr/bin/env python3
"""grain_cleanup.py: clean up grainy creature frames without redrawing them (no image calls).

Usage: grain_cleanup.py OUT_DIR FRAME.png [FRAME.png ...]
Works on the 64x64 art grid (input is 4x nearest-scaled), writes the cleaned 256x256
frame to OUT_DIR/<name>.png. Steps:
  1. merge near-duplicate colours into the more common one (keeps the palette's look)
  2. remove specks: 4-connected bits of <=2 px stuck to the body (floating effects such
     as zzz or sparkles, which sit apart from the body, are kept)
  3. despeckle the fill: a light pixel unlike all 8 neighbours, with >=5 neighbours
     sharing one colour, takes that colour
  4. close the outline: every body pixel touching transparency becomes the one outline
     colour (the commonest dark), and every other dark-outline shade is unified to it
"""
import sys
from collections import Counter, deque
from pathlib import Path
from PIL import Image

SCALE, MERGE_D, DARK_L = 4, 12, 70


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])) ** 0.5


def clean(im):
    W, H = im.size
    px = {(x, y): im.getpixel((x, y)) for y in range(H) for x in range(W)}
    op = lambda p: p in px and px[p][3] > 0
    n4 = lambda x, y: [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    n8 = lambda x, y: [(x + i, y + j) for i in (-1, 0, 1) for j in (-1, 0, 1) if i or j]

    # 1. merge near-duplicate colours
    cnt = Counter(c for c in px.values() if c[3])
    keep = []
    for c, _ in cnt.most_common():
        if not any(dist(c, k) < MERGE_D for k in keep):
            keep.append(c)
    remap = {c: min(keep, key=lambda k: dist(c, k)) for c in cnt}
    for p, c in px.items():
        if c[3]:
            px[p] = remap[c]

    # 2. specks stuck to the body
    seen, comps = set(), []
    for p in px:
        if op(p) and p not in seen:
            comp, q = [], deque([p])
            seen.add(p)
            while q:
                a = q.popleft(); comp.append(a)
                for b in n4(*a):
                    if op(b) and b not in seen:
                        seen.add(b); q.append(b)
            comps.append(comp)
    body = set(max(comps, key=len))
    for comp in comps:
        if len(comp) <= 2 and any(b in body for a in comp for b in n8(*a)):
            for a in comp:
                px[a] = (0, 0, 0, 0)

    # 3. despeckle light fill
    out = dict(px)
    for (x, y), c in px.items():
        if not c[3] or lum(c) < DARK_L:
            continue
        nb = [px.get(b, (0, 0, 0, 0)) for b in n8(x, y)]
        if any(n[3] == 0 for n in nb) or c in nb:
            continue
        top, k = Counter(nb).most_common(1)[0]
        if k >= 5:
            out[(x, y)] = top
    px = out

    # 4. one closed outline (body only)
    darks = Counter(c for c in px.values() if c[3] and lum(c) < DARK_L)
    line = darks.most_common(1)[0][0]
    out = dict(px)
    for (x, y), c in px.items():
        if not c[3] or (x, y) not in body:   # floating effects keep their colours
            continue
        edge = any(not op(b) for b in n4(x, y))
        if edge or lum(c) < DARK_L and c != line and any(not op(b) for b in n8(x, y)):
            out[(x, y)] = line
    res = Image.new('RGBA', (W, H))
    for p, c in out.items():
        res.putpixel(p, c)
    return res, len(cnt), len(set(c for c in out.values() if c[3]))


def main():
    od = Path(sys.argv[1]); od.mkdir(parents=True, exist_ok=True)
    for f in sys.argv[2:]:
        big = Image.open(f).convert('RGBA')
        small = big.resize((big.width // SCALE, big.height // SCALE), Image.NEAREST)
        res, before, after = clean(small)
        res.resize(big.size, Image.NEAREST).save(od / Path(f).name)
        print(f'{Path(f).stem}: colours {before} -> {after}')


if __name__ == '__main__':
    main()
