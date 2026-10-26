#!/usr/bin/env python3
"""usage: cut_creature.py NAME -> <name>-out/ sprites, using creatures.py config and cut.py helpers."""
import sys, pathlib, importlib.util, numpy as np
from PIL import Image
here = pathlib.Path(__file__).parent; sys.path.insert(0, str(here)); from creatures import C, DEFAULT_MOODS, EXTRAS
n = sys.argv[1]; c = C[n]; root = pathlib.Path.home()/"github/hatch-art"; src = root/f"{n}-batch"; out = root/f"{n}-out"; out.mkdir(exist_ok=True)
spec = importlib.util.spec_from_file_location("cut", here/"cut.py"); sys.argv = [sys.argv[0], "/nonexistent", "/tmp/_cut_unused"]
cut = importlib.util.module_from_spec(spec); spec.loader.exec_module(cut)
moods = dict(DEFAULT_MOODS); moods.update(c.get("moods", {})); M = list(moods)
got, sheet = {}, {}
def add(k, im, s): got[k] = im; sheet[k] = s
for st in ["baby", "child", "teen"]:
    for gi, g in enumerate([M[0:3], M[3:6], M[6:8], M[8:10]], 1):
        p = src/f"{st}_{gi}.png"
        if not p.exists(): continue
        cs = cut.cells(p, len(g), 2)
        for r, m in enumerate(g):
            for f in (0, 1):
                if (r, f) in cs: add(f"{st}_{m}_{f+1}", cs[(r, f)], p.name)
for si, g in enumerate([EXTRAS[0:4], EXTRAS[4:6]], 1):
    p = src/f"extra_{si}.png"
    if p.exists():
        cs = cut.cells(p, 2, 2)
        for i, (m, _) in enumerate(g):
            if (i//2, i%2) in cs: add(f"child_{m}", cs[(i//2, i%2)], p.name)
for si, g in enumerate([c["sigs"][0:2], c["sigs"][2:4]], 1):
    p = src/f"sig_{si}.png"
    if g and p.exists():
        cs = cut.cells(p, 2, 2)
        for r, (m, _, _) in enumerate(g):
            for f in (0, 1):
                if (r, f) in cs: add(f"child_{m}_{f+1}", cs[(r, f)], p.name)
key = (lambda im: im.width) if c["measure"] == "w" else (lambda im: im.height)
T = dict(zip(["baby", "child", "teen"], c["target"]))
for st in T:
    ks = [k for k in got if k.startswith(st + "_")]
    if not ks: continue
    pal = cut.make_palette([got[k] for k in ks]); per = {}
    for k in ks: per.setdefault(sheet[k], []).append(key(got[k]))
    for k in ks:
        im = got[k]; s = min(T[st] / np.median(per[sheet[k]]), 248 / im.width, 224 / im.height)
        cut.place(im, s, palette=pal).save(out/f"{k}.png")
p = src/"props_1.png"
if p.exists():
    cs = cut.cells(p, 2, 2)
    for i, (m, _) in enumerate(c["props"]):
        if (i//2, i%2) in cs:
            im = cs[(i//2, i%2)]; sm = cut.pixelize(im, min(26/im.width, 26/im.height), cut.make_palette([im], 16)); sm = sm.resize((sm.width*4, sm.height*4), Image.NEAREST)
            cv = Image.new("RGBA", (128, 128)); cv.alpha_composite(sm, ((128-sm.width)//8*4, (128-sm.height)//8*4)); cv.save(out/f"{m}.png")
print(n, len(list(out.glob("*.png"))), "files")
