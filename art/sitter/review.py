#!/usr/bin/env python3
"""review.py FRAMES_DIR OUT_HTML : a contact page, each pose beside 3 species at card scale (2-frame loop)."""
import sys, pathlib, re
fr = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
poses = {}
for p in sorted(fr.glob("*.png")):
    m = re.match(r"(.+?)(?:_(\d))?\.png", p.name); poses.setdefault(m.group(1), []).append(p.name)
ORDER="stand walk wave read doze chair feed play clean medicine tuck pat cheer shoo".split()
poses = dict(sorted(poses.items(), key=lambda kv: (ORDER.index(kv[0]) if kv[0] in ORDER else 99, kv[0])))
SP = ["hamster", "corgi", "deer"]; SPR = "../../custom_components/virtual_pet/frontend/sprites"
h = ["""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Sitter sprites review</title>
<style>:root{--bg:#f4efe6;--ink:#2a1a0a}@media(prefers-color-scheme:dark){:root{--bg:#1d1a16;--ink:#eadfcb}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
h1{font-size:20px}h2{font-size:15px;margin:22px 0 6px}.row{display:flex;flex-wrap:wrap;gap:10px}
.cell{width:300px;height:180px;position:relative;background:url(SPR/bird/bg_day.png) center bottom/cover;border:2px solid #3a1a08;border-radius:6px;overflow:hidden;image-rendering:pixelated}
.cell img{position:absolute;bottom:2%;height:62%;aspect-ratio:1;image-rendering:pixelated}
.pet{left:4%}.sit{left:48%}.sit.chair{left:48%}
.sit.f2,.sit.f1{animation:none}
.loop{position:absolute;left:0;top:0;width:100%;height:100%}
.f1,.f2{animation:ab 1s steps(1) infinite}.f2{animation-name:ba}
@keyframes ab{0%{opacity:1}50%{opacity:0}}@keyframes ba{0%{opacity:0}50%{opacity:1}}
.still .f1,.still .f2{animation:none}.still .f2{opacity:0}
.cap{position:absolute;left:4px;top:2px;font-size:11px;background:#fffa;color:#000;padding:0 3px;border-radius:3px}
.sheet{display:flex;flex-wrap:wrap;gap:4px}.sheet img{width:128px;height:128px;image-rendering:pixelated;background:#c8bea0}
</style><h1>Sitter sprites: A1 review</h1>
<p>Each pose beside a small (hamster), medium (corgi) and large (deer) pet, at the card's scale (sprite 256 box, 62% of the screen; both at the same scale). Frames alternate once a second. Sources: art/sitter/.</p>""".replace("SPR", SPR)]
for pose, files in poses.items():
    h.append(f"<h2>{pose}</h2><div class=row>")
    for sp in SP:
        h.append(f"<div class=cell><span class=cap>{sp}</span><img class=pet src='{SPR}/{sp}/adult_content_1.png'>")
        for i, f in enumerate(files[:2]):
            h.append(f"<img class='sit f{i+1}' src='{fr.name}/{f}'>")
        h.append("</div>")
    h.append("</div>")
h.append("</html>")
out.write_text("\n".join(h))
