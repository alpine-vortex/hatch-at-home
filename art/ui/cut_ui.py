#!/usr/bin/env python3
"""Cut the UI icon kit. usage: cut_ui.py SHEETDIR OUTDIR
Icons/stats: 24-art-px grid -> 96x96. Emblems/deco: 32 grid -> 128x128. Plus contact sheet on cream buttons."""
import sys, pathlib, importlib.util
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location("cut", pathlib.Path(__file__).with_name("cut.py"))
src, out = map(pathlib.Path, sys.argv[1:3]); out.mkdir(parents=True, exist_ok=True)
sys.argv = [sys.argv[0], str(src), str(out / "_unused")]
cut = importlib.util.module_from_spec(spec); spec.loader.exec_module(cut)
(out / "_unused").rmdir() if (out / "_unused").exists() and not any((out / "_unused").iterdir()) else None
ICONS = {"icons_1": ["icon_feed","icon_snack","icon_play","icon_clean","icon_medicine","icon_scold","icon_praise","icon_lights_out","icon_lights_on"],
         "icons_2": ["icon_status","icon_journal","stat_heart_full","stat_heart_half","stat_heart_empty","stat_energy","stat_health","stat_discipline","stat_care_miss"]}
BIG = {"emblems": ["emblem_woodland","emblem_terrarium","emblem_ocean",None], "deco": ["deco_moss","deco_mushroom","deco_pebbles","deco_succulent"]}
def emit(im, grid, art, name):
    sc = art / max(im.width, im.height)
    sm = cut.pixelize(im, sc, cut.make_palette([im], 12))
    c = Image.new("RGBA", (grid, grid)); c.alpha_composite(sm, ((grid - sm.width)//2, (grid - sm.height)//2))
    c.resize((grid*4, grid*4), Image.NEAREST).save(out / f"{name}.png")
for sheet, names in ICONS.items():
    p = src / f"{sheet}.png"
    if not p.exists(): continue
    cs = cut.cells(p, 3, 3)
    for i, n in enumerate(names):
        if (i//3, i%3) in cs: emit(cs[(i//3, i%3)], 24, 22, n)
for sheet, names in BIG.items():
    p = src / f"{sheet}.png"
    if not p.exists(): continue
    cs = cut.cells(p, 2, 2)
    for i, n in enumerate(names):
        if n and (i//2, i%2) in cs: emit(cs[(i//2, i%2)], 32, 30, n)
# contact: icons on cream buttons (26 px on screen -> shown at 1x and 2x), light + dark
fs = sorted(out.glob("icon_*.png")) + sorted(out.glob("stat_*.png"))
CREAM, SHADOW = (0xff,0xf7,0xec,255), (0xd9,0xc8,0xae,255)
c = Image.new("RGBA", (len(fs)*80 + 20, 4*80), (255,255,255,255)); d = ImageDraw.Draw(c)
for row, (bg, size) in enumerate([((238,238,232,255), 26), ((30,30,40,255), 26), ((238,238,232,255), 52), ((30,30,40,255), 52)]):
    d.rectangle([0, row*80, c.width, row*80+79], fill=bg)
    for i, p in enumerate(fs):
        cx, cy, r = 20 + i*80 + 30, row*80 + 40, size*0.85
        d.ellipse([cx-r, cy-r+3, cx+r, cy+r+3], fill=SHADOW); d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=CREAM)
        ic = Image.open(p).resize((size, size), Image.NEAREST if size % 24 == 0 else Image.BOX)
        c.alpha_composite(ic, (int(cx - size/2), int(cy - size/2)))
c.save(out / "contact_buttons.png")
big = sorted(out.glob("emblem_*.png")) + sorted(out.glob("deco_*.png"))
c2 = Image.new("RGBA", (max(1, len(big))*136, 272), (238,238,232,255)); ImageDraw.Draw(c2).rectangle([0,136,c2.width,272], fill=(30,30,40,255))
for i, p in enumerate(big):
    im = Image.open(p); c2.alpha_composite(im, (i*136+4, 4)); c2.alpha_composite(im, (i*136+4, 140))
c2.save(out / "contact_emblems_deco.png")
print(len(fs), "icons,", len(big), "emblems/deco")
