#!/usr/bin/env python3
"""usage: cut_trims.py -> trims/out/ui/trim_<world>_{top,plate,corner}.png (tight) + trims/out/mockup_<world>.png"""
import sys, pathlib, importlib.util
from PIL import Image, ImageDraw
here = pathlib.Path(__file__).parent; root = pathlib.Path.home()/"github/hatch-art/trims"; out = root/"out"/"ui"; out.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location("cut", here/"cut.py"); sys.argv = [sys.argv[0], "/nonexistent", "/tmp/_cut_unused"]
cut = importlib.util.module_from_spec(spec); spec.loader.exec_module(cut)
W = {"terrarium": ("#d8b07a", 20, None), "hearth": ("#c75b5b", 14, 16), "tidepool": ("#3f7f8c", 64, 16), "pond": ("#6f9e4f", 64, 16), "nightsky": ("#3d4a8a", 64, 16)}
for w, (shell, top_w, corner_w) in W.items():
    p = root/f"{w}_trims.png"
    if not p.exists(): print("missing", w); continue
    cs = cut.cells(p, 3, 1); pieces = {}
    for (r, _), im in cs.items():
        name, aw = [("top", top_w), ("plate", 48), ("corner", corner_w)][r]
        if aw is None: continue
        sm = cut.pixelize(im, aw / im.width, cut.make_palette([im], 24)); big = sm.resize((sm.width*4, sm.height*4), Image.NEAREST)
        bb = big.getbbox(); big = big.crop(bb); big.save(out/f"trim_{w}_{name}.png"); pieces[name] = big
    # mock-up: each piece on a flat swatch of the shell colour, with a cream label on the plate
    m = Image.new("RGBA", (360, 300), shell); d = ImageDraw.Draw(m); y = 12
    for name in ("top", "plate", "corner"):
        if name not in pieces: continue
        im = pieces[name]; x = (360 - im.width)//2; m.alpha_composite(im, (x, y))
        if name == "plate":
            d.text((180, y + im.height//2), w.upper(), fill="#2a1d12", anchor="mm"); d.text((179, y + im.height//2 - 1), w.upper(), fill="#fff4dc", anchor="mm")
        if name == "corner": m.alpha_composite(im.transpose(Image.FLIP_LEFT_RIGHT), (x + im.width + 24, y))
        y += im.height + 24
    m.save(root/"out"/f"mockup_{w}.png")
    print(w, {k: v.size for k, v in pieces.items()})
