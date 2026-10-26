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
key = (lambda im: im.width) if c["measure"] == "w" else (lambda im: max(im.width, im.height) if c.get("measure_max") else im.height)
T = dict(zip(["baby", "child", "teen"], c["target"]))
for st in T:
    ks = [k for k in got if k.startswith(st + "_")]
    if not ks: continue
    pal = cut.make_palette([got[k] for k in ks]); per = {}
    for k in ks: per.setdefault(sheet[k], []).append(key(got[k]))
    sc = {k: min(T[st] / np.median(per[sheet[k]]), 248 / got[k].width, 224 / got[k].height) for k in ks}
    for k in ks:  # both frames of a pose share one scale, so the idle loop never pulses
        if k.endswith(("_1", "_2")):
            o = k[:-1] + ("2" if k.endswith("1") else "1")
            if o in sc: sc[k] = min(sc[k], sc[o])
    for k in ks: cut.place(got[k], sc[k], palette=pal).save(out/f"{k}.png")
p = src/"props_1.png"
if p.exists():
    cs = cut.cells(p, 2, 2)
    for i, (m, _) in enumerate(c["props"]):
        if (i//2, i%2) in cs:
            im = cs[(i//2, i%2)]; sm = cut.pixelize(im, min(26/im.width, 26/im.height), cut.make_palette([im], 16)); sm = sm.resize((sm.width*4, sm.height*4), Image.NEAREST)
            cv = Image.new("RGBA", (128, 128)); cv.alpha_composite(sm, ((128-sm.width)//8*4, (128-sm.height)//8*4)); cv.save(out/f"{m}.png")
print(n, len(list(out.glob("*.png"))), "files")
# Idle bob (Hatch review 2026-10-26): {stage}_content_1 = content_2 with the body above the feet raised one art pixel,
# so the idle loop is a true 1-pixel bob, never a size pulse.
for st in ("baby", "child", "teen"):
    p2 = out/f"{st}_content_2.png"
    if not p2.exists(): continue
    f2 = Image.open(p2); a = np.asarray(f2)[..., 3]; ys = np.nonzero(a.any(1))[0]; feet = ys.max() + 1 - 16
    f1 = Image.new("RGBA", (256, 256)); f1.alpha_composite(f2.crop((0, feet, 256, 256)), (0, feet)); f1.alpha_composite(f2.crop((0, 0, 256, feet)), (0, -4))
    f1.save(out/f"{st}_content_1.png")
