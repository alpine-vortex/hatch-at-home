#!/usr/bin/env python3
"""Cut Sol grid sheets (flat grey bg) into transparent sprites.
usage: cut.py SHEETDIR OUTDIR
Pets: 256x256, bbox bottom on y=224, centred; one scale per stage (median bird height -> target).
Props: 128x128 centred, fit 104px. Egg: like pets, target height 150."""
import sys, pathlib, numpy as np
from PIL import Image
from scipy import ndimage
src, out = map(pathlib.Path, sys.argv[1:3]); out.mkdir(parents=True, exist_ok=True)
BEETLE = len(sys.argv) > 3 and sys.argv[3] == "beetle"
GECKO = len(sys.argv) > 3 and sys.argv[3] == "gecko"
SQUIRREL = len(sys.argv) > 3 and sys.argv[3] == "squirrel"

MOODS = ["content","excited","cozy","bored","hungry","sleepy","asleep","sick","calling","dirty"]
GROUPS = [MOODS[0:3], MOODS[3:6], MOODS[6:8], MOODS[8:10]]
EXTRA = [["squint","shiver","sweat","mask"], ["dance","watch_tv","birdwatch",None]]
PROPS = [["poop_1","poop_2","poop_3","attention"],["bowl_food","snack","medicine","ball"],["sparkle_clean","blanket","sitter_sign",None]]
TARGET = {"baby": 150, "child": 180, "teen": 200, "egg": 140}
SIG = []
if BEETLE:
    EXTRA = [["squint","shiver","sweat","mask"], ["dance","watch_tv",None,None]]
    PROPS = [["bowl_food","snack","hide_bark",None]]
    TARGET = {"baby": 120, "child": 130, "teen": 150, "egg": 110}  # widths read lower than birds' heights; checked on contact sheet
    SIG = [("sig_1", ["play_dead", "peek"]), ("sig_2", ["content_humid", "cozy_humid"])]
if GECKO:
    EXTRA = [["squint","shiver","sweat","mask"], ["dance","watch_tv",None,None]]
    PROPS = [["bowl_food","snack","hide","heat_glow"], ["cricket",None,None,None]]
    TARGET = {"baby": 170, "child": 200, "teen": 232, "egg": 100}  # gecko: per-sheet median WIDTH -> target (long bodies)
    SIG = [("sig_1", ["eye_lick", "shed"]), ("sig_2", ["tail_wiggle"])]
if SQUIRREL:
    EXTRA = [["squint","shiver","sweat","mask"], ["dance","watch_tv",None,None]]
    PROPS = [["bowl_food","pinecone",None,None]]
    SIG = [("sig_1", ["chatter", "cache"]), ("sig_2", ["cheeks"])]

def cells(path, rows, cols):
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[:4].reshape(-1,3), a[-4:].reshape(-1,3), a[:,:4].reshape(-1,3), a[:,-4:].reshape(-1,3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    near = dist < 28
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:,0], lab[:,-1]]))) - {0}
    bgmask = np.isin(lab, list(edge))
    # enclosed flat-bg holes
    flat = dist < 10
    fl, n = ndimage.label(flat & ~bgmask)
    if n:
        sizes = ndimage.sum(np.ones_like(fl), fl, range(1, n+1))
        for i, s in enumerate(sizes, 1):
            if s > 400: bgmask |= fl == i
    fg = ~bgmask
    # Split subjects that touch across a cell boundary (Sol sometimes lets neighbours kiss): cut 2 px along every grid line.
    for k in range(1, cols): x = w * k // cols; fg[:, x-1:x+1] = False
    for k in range(1, rows): y = h * k // rows; fg[y-1:y+1, :] = False
    alpha = np.where(fg, np.clip((dist - 6) / 40, 0, 1), 0)
    alpha[fg & (dist >= 46)] = 1
    al = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - bg * (1 - al)) / al, 0, 255)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    comp, n = ndimage.label(fg)
    objs = ndimage.find_objects(comp)
    sizes = ndimage.sum(fg, comp, range(1, n+1))
    res = {}
    for i, (sl, s) in enumerate(zip(objs, sizes), 1):
        if s < 150: continue
        cy, cx = ndimage.center_of_mass(comp == i)
        r, c = min(int(cy * rows / h), rows-1), min(int(cx * cols / w), cols-1)
        res.setdefault((r, c), []).append(i)
    # Drop neighbour slivers (Hatch review, octopus 2026-10-26): a piece that touches this cell's edge (a grid line
    # or the sheet border) and is small next to the cell's main subject is a tip of the subject next door.
    gx = [w * k // cols for k in range(cols + 1)]; gy = [h * k // rows for k in range(rows + 1)]
    for k, ids in list(res.items()):
        big = max(sizes[i - 1] for i in ids); keep = []
        for i in ids:
            sl = objs[i - 1]; r, c = k
            touches = (sl[0].start <= gy[r] + 2 or sl[0].stop >= gy[r + 1] - 2 or sl[1].start <= gx[c] + 2 or sl[1].stop >= gx[c + 1] - 2)
            if touches and sizes[i - 1] < 0.15 * big: continue
            keep.append(i)
        res[k] = keep
    outc = {}
    for k, ids in res.items():
        m = np.isin(comp, ids)
        ys, xs = np.nonzero(m)
        crop = rgba.copy(); crop[~m, 3] = 0
        outc[k] = Image.fromarray(crop[ys.min():ys.max()+1, xs.min():xs.max()+1])
    return outc

def pixelize(im, scale, palette):
    """Downsample to art pixels (scale = art px per source px), hard alpha, shared palette.
    Line-preserving: in each block, if enough pixels are much darker than the block median (outline,
    eye arcs, mouths), the block takes their colour instead of the average."""
    w, h = max(1, round(im.width*scale)), max(1, round(im.height*scale))
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    ys = np.linspace(0, a.shape[0], h + 1).astype(int); xs = np.linspace(0, a.shape[1], w + 1).astype(int)
    rgb = np.zeros((h, w, 3), np.float32); al = np.zeros((h, w), np.float32)
    lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    for j in range(h):
        for i in range(w):
            blk = a[ys[j]:ys[j+1], xs[i]:xs[i+1]].reshape(-1, 4); L = lum[ys[j]:ys[j+1], xs[i]:xs[i+1]].reshape(-1)
            op = blk[:, 3] > 128; al[j, i] = op.mean() * 255 if len(op) else 0
            if not op.any(): continue
            b, l = blk[op, :3], L[op]; med = np.median(l); dark = l < med - 45
            rgb[j, i] = b[dark].mean(0) if dark.mean() >= 0.2 else b.mean(0)
    q = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
    return Image.fromarray(np.dstack([np.asarray(q), np.where(al >= 128, 255, 0)]).astype(np.uint8), "RGBA")

def place(im, scale, canvas=256, base=224, palette=None):
    px = 4
    small = pixelize(im, scale / px, palette)
    small = small.resize((small.width*px, small.height*px), Image.NEAREST)
    c = Image.new("RGBA", (canvas, canvas))
    x = ((canvas - small.width)//2)//px*px
    c.alpha_composite(small, (x, max(0, base - small.height)))
    return c

def make_palette(ims, n=int(__import__("os").environ.get("PALETTE", "32"))):
    strip = Image.new("RGB", (sum(i.width for i in ims), max(i.height for i in ims)), (0, 0, 0))
    x = 0
    for i in ims:
        bg = Image.new("RGB", i.size, (0, 0, 0)); bg.paste(i.convert("RGB"), mask=i.split()[3]); strip.paste(bg, (x, 0)); x += i.width
    return strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT)

def fit(im, box):
    s = min(box / im.width, box / im.height)
    return im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)

def stage(st):
    got = {}
    for gi, g in enumerate(GROUPS, 1):
        p = src / f"{st}_{gi}.png"
        if not p.exists(): continue
        cs = cells(p, len(g), 2)
        for r, m in enumerate(g):
            for f in (0, 1):
                if (r, f) in cs: got[f"{st}_{m}_{f+1}"] = cs[(r, f)]; SHEET[f"{st}_{m}_{f+1}"] = p.name
    return got
SHEET = {}

for st in ["baby", "child", "teen"]:
    got = stage(st)
    if st == "child":
        for si, g in enumerate(EXTRA, 1):
            p = src / f"extra_{si}.png"
            if p.exists():
                cs = cells(p, 2, 2)
                for i, m in enumerate(g):
                    if m and (i//2, i%2) in cs: got[f"child_{m}"] = cs[(i//2, i%2)]; SHEET[f"child_{m}"] = p.name
        for sn, names in SIG:
            p = src / f"{sn}.png"
            if p.exists():
                cs = cells(p, 2, 2)
                for r, m in enumerate(names):
                    for f in (0, 1):
                        if (r, f) in cs: got[f"child_{m}_{f+1}"] = cs[(r, f)]; SHEET[f"child_{m}_{f+1}"] = p.name
    if not got: continue
    h = np.median([im.height for k, im in got.items() if ("_content_" in k or "_bored_" in k) and "humid" not in k] or [im.height for im in got.values()])
    sheet_h = {}
    for k, im in got.items(): sheet_h.setdefault(SHEET.get(k), []).append(im.width if GECKO else im.height)
    pal = make_palette(list(got.values()))
    for k, im in got.items():
        scale = TARGET[st] / np.median(sheet_h[SHEET.get(k)])
        s = min(scale, 248 / im.width, 224 / im.height)
        place(im, s, palette=pal).save(out / f"{k}.png")
p = src / "egg.png"
if p.exists():
    cs = cells(p, 3, 2); names = ["idle", "wiggle", "crack"]
    h = np.median([im.height for im in cs.values()])
    pal = make_palette(list(cs.values()), 16)
    for (r, f), im in cs.items(): place(im, min(TARGET["egg"]/h, 248/im.width), palette=pal).save(out / f"egg_{names[r]}_{f+1}.png")
for si, g in enumerate(PROPS, 1):
    p = src / f"props_{si}.png"
    if not p.exists(): continue
    cs = cells(p, 2, 2)
    for i, m in enumerate(g):
        if m and (i//2, i%2) in cs:
            src_im = cs[(i//2, i%2)]; sc = min(26 / src_im.width, 26 / src_im.height)
            sm = pixelize(src_im, sc, make_palette([src_im], 16)); sm = sm.resize((sm.width*4, sm.height*4), Image.NEAREST)
            c = Image.new("RGBA", (128, 128)); c.alpha_composite(sm, ((128-sm.width)//8*4, (128-sm.height)//8*4)); c.save(out / f"{m}.png")
for n in ["bg_day", "bg_night", "bg_rain", "bg_dim", "bg_terrarium", "bg_vivarium"]:
    p = src / f"{n}.png"
    if p.exists():
        im = Image.open(p).convert("RGB"); w, h = im.size; th = round(w*384/512)
        if th <= h: im = im.crop((0, (h-th)//2, w, (h-th)//2+th))
        else: tw = round(h*512/384); im = im.crop(((w-tw)//2, 0, (w-tw)//2+tw, h))
        im.resize((512, 384), Image.LANCZOS).save(out / f"{n}.png")
print(len(list(out.glob("*.png"))), "files in", out)
