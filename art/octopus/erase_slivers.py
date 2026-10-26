# List (or with --fix, erase) small dark pieces floating above the body's top.
import sys, os
from PIL import Image
import numpy as np
sys.setrecursionlimit(100000)
def comps(a):
    h, w = a.shape; lab = np.zeros((h, w), np.int32); out = []; n = 0
    for y0, x0 in zip(*np.nonzero(a)):
        if lab[y0, x0]: continue
        n += 1; st = [(y0, x0)]; lab[y0, x0] = n; px = []
        while st:
            y, x = st.pop(); px.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y+dy, x+dx
                    if 0 <= yy < h and 0 <= xx < w and a[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n; st.append((yy, xx))
        out.append(px)
    return out
d, out, fix = sys.argv[1], sys.argv[2], '--fix' in sys.argv
for f in sys.argv[3:]:
    if f.startswith('--'): continue
    im = np.array(Image.open(os.path.join(d, f + '.png')).convert('RGBA'))
    cs = sorted(comps(im[..., 3] > 16), key=len, reverse=True)
    body = cs[0]; top = min(y for y, x in body)
    for c in cs[1:]:
        ys = [y for y, x in c]; xs = [x for y, x in c]
        rgb = np.array([im[y, x, :3] for y, x in c]).mean(0)
        dark = rgb.mean() < 90
        above = max(ys) < top
        flat = (max(ys) - min(ys) + 1) <= 12 and (max(xs) - min(xs) + 1) >= 2 * (max(ys) - min(ys) + 1)
        kill = dark and above and flat
        print(f, 'piece y%d-%d x%d-%d n=%d rgb=%s %s' % (min(ys), max(ys), min(xs), max(xs), len(c), rgb.astype(int).tolist(), 'ERASE' if kill else 'keep'))
        if kill and fix:
            for y, x in c: im[y, x] = 0
    if fix: Image.fromarray(im).save(os.path.join(out, f + '.png'))
