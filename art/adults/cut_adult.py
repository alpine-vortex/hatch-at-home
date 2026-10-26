#!/usr/bin/env python3
"""usage: cut_adult.py NAME -> <name>-adult/out/adult_<mood>_<1|2>.png at the teen's size (teen target from creatures.py)."""
import sys, pathlib, importlib.util, numpy as np
from PIL import Image
here = pathlib.Path(__file__).parent; sys.path.insert(0, str(here)); from creatures import C, DEFAULT_MOODS
n = sys.argv[1]; c = C[n]; root = pathlib.Path.home()/"github/hatch-art"; src = root/f"{n}-adult"; out = src/"out"; out.mkdir(exist_ok=True)
spec = importlib.util.spec_from_file_location("cut", here/"cut.py"); sys.argv = [sys.argv[0], "/nonexistent", "/tmp/_cut_unused"]
cut = importlib.util.module_from_spec(spec); spec.loader.exec_module(cut)
moods = dict(DEFAULT_MOODS); moods.update(c.get("moods", {})); M = list(moods)
got, sheet = {}, {}
for gi, g in enumerate([M[0:3], M[3:6], M[6:8], M[8:10]], 1):
    p = src/f"adult_{gi}.png"
    if not p.exists(): continue
    cs = cut.cells(p, len(g), 2)
    for r, m in enumerate(g):
        for f in (0, 1):
            if (r, f) in cs: got[f"adult_{m}_{f+1}"] = cs[(r, f)]; sheet[f"adult_{m}_{f+1}"] = p.name
key = (lambda im: im.width) if c["measure"] == "w" else (lambda im: im.height)
T = c["target"][2]; pal = cut.make_palette(list(got.values())); per = {}
for k in got: per.setdefault(sheet[k], []).append(key(got[k]))
sc = {k: min(T / np.median(per[sheet[k]]), 248 / got[k].width, 224 / got[k].height) for k in got}
for k in got:
    o = k[:-1] + ("2" if k.endswith("1") else "1")
    if o in sc: sc[k] = min(sc[k], sc[o])
for k in got: cut.place(got[k], sc[k], palette=pal).save(out/f"{k}.png")
p2 = out/"adult_content_2.png"
if p2.exists():
    f2 = Image.open(p2); a = np.asarray(f2)[..., 3]; ys = np.nonzero(a.any(1))[0]; feet = ys.max() + 1 - 16
    f1 = Image.new("RGBA", (256, 256)); f1.alpha_composite(f2.crop((0, feet, 256, feet + 4)), (0, feet - 4))
    f1.alpha_composite(f2.crop((0, feet, 256, 256)), (0, feet)); f1.alpha_composite(f2.crop((0, 0, 256, feet)), (0, -4)); f1.save(out/"adult_content_1.png")
print(n, len(list(out.glob("*.png"))), "adult files")
