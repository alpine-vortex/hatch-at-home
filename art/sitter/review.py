#!/usr/bin/env python3
"""review.py FRAMES_DIR OUT_HTML : a contact page, each pose beside 3 species at card scale (2-frame loop)."""

import pathlib
import re
import sys

fr = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
poses = {}
for p in sorted(fr.glob("*.png")):
    m = re.match(r"(.+?)(?:_(\d))?\.png", p.name)
    poses.setdefault(m.group(1), []).append(p.name)
ORDER = "stand walk wave read doze chair feed play clean medicine tuck pat cheer shoo stretch tea laugh water window tidy knit biscuit glasses nap knitread".split()
poses = dict(
    sorted(
        poses.items(),
        key=lambda kv: (ORDER.index(kv[0]) if kv[0] in ORDER else 99, kv[0]),
    )
)
# poses only the granny (gingham) draws; other sitters are not "missing" them
GRANNY_ONLY = "knit biscuit glasses nap knitread".split()
SP = ["hamster", "corgi", "deer"]
SPR = "../../custom_components/virtual_pet/frontend/sprites"
h = [
    """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Sitter sprites review</title>
<style>:root{--bg:#f4efe6;--ink:#2a1a0a}@media(prefers-color-scheme:dark){:root{--bg:#1d1a16;--ink:#eadfcb}}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}
h1{font-size:20px}h2{font-size:15px;margin:22px 0 6px}.row{display:flex;flex-wrap:wrap;gap:10px}
.cell{width:300px;height:180px;position:relative;background:url(SPR/bird/bg_day.png) center bottom/cover;border:2px solid #3a1a08;border-radius:6px;overflow:hidden;image-rendering:pixelated}
.cell img{position:absolute;bottom:2%;height:62%;aspect-ratio:1;image-rendering:pixelated}
.pet{left:4%}.sit{left:48%}.sit.chair{left:48%}

.loop{position:absolute;left:0;top:0;width:100%;height:100%}
.f1,.f2{animation:ab 1s steps(1) infinite}.f2{animation-name:ba}
@keyframes ab{0%{opacity:1}50%{opacity:0}}@keyframes ba{0%{opacity:0}50%{opacity:1}}
.still .f1,.still .f2{animation:none}.still .f2{opacity:0}
details{margin:8px 0}summary{cursor:pointer;font-size:15px}.cap{position:absolute;left:4px;top:2px;font-size:11px;background:#fffa;color:#000;padding:0 3px;border-radius:3px}
.sheet{display:flex;flex-wrap:wrap;gap:4px}.sheet img{width:128px;height:128px;image-rendering:pixelated;background:#c8bea0}
</style><h1>Sitter sprites: A1 review</h1>
<p>Each pose beside a small (hamster), medium (corgi) and large (deer) pet, at the card's scale (sprite 256 box, 62% of the screen; both at the same scale). Frames alternate once a second. Sources: art/sitter/.</p>""".replace(
        "SPR", SPR
    )
]
for pose, files in poses.items():
    h.append(f"<h2>{pose}</h2><div class=row>")
    for sp in SP:
        h.append(
            f"<div class=cell><span class=cap>{sp}</span><img class=pet src='{SPR}/{sp}/adult_content_1.png'>"
        )
        for i, f in enumerate(files[:2]):
            h.append(f"<img class='sit f{i + 1}' src='{fr.name}/{f}'>")
        h.append("</div>")
    h.append("</div>")
LK = pathlib.Path("looks")
if LK.is_dir():
    FIN = "woodland aqua grove celestial dune clear glitter glow speckle stripes hearts stars gingham dots camo waves scales leaves paws constellation rainbow twotone sunset smoke".split()
    h.append(
        "<h1>Looks: one sitter per shell finish</h1><p>Each look is the stand pose (2 frames), the wave (1 frame) and its accessory. Shown beside a hamster, a corgi and a deer. The body is the same in every look.</p>"
    )
    for fin in FIN:
        d = LK / fin
        if not d.is_dir():
            continue
        flag = (
            " <b style='color:#b03;'>(granny: owner's request, own redraw later; shorter and rounder)</b>"
            if fin == "gingham"
            else ""
        )
        h.append(f"<h2>{fin}{flag}</h2><div class=row>")
        for sp in SP:
            h.append(
                f"<div class=cell><span class=cap>{sp}</span><img class=pet src='{SPR}/{sp}/adult_content_1.png'><img class='sit f1' src='looks/{fin}/stand_1.png'><img class='sit f2' src='looks/{fin}/stand_2.png'></div>"
            )
        h.append(
            f"<div class=sheet><img src='looks/{fin}/wave_1.png' title=wave><img src='looks/{fin}/accessory.png' title=accessory></div></div>"
        )
SIT = pathlib.Path("sitters")
if SIT.is_dir():
    h.append(
        "<h1>Sitters (A2-A5): twenty-four redrawn sitters, one per shell finish, the full pose set each</h1><p>The granny (gingham) has her own slower walk and knits in the chair; the others are themed to their shell (A2: the world shells; A3: glitter, hearts, rainbow, sunset, leaves, paws; A4: clear, constellation, glow, scales, smoke, speckle; A5: stars, twotone, stripes, dots, waves, camo). One section per sitter: each pose beside a hamster, a corgi and a deer, the two frames alternating once a second (never both at once). Open a section to see its poses.</p>"
    )
    for fin in "gingham woodland aqua grove celestial dune glitter hearts rainbow sunset leaves paws clear constellation glow scales smoke speckle stars twotone stripes dots waves camo".split():
        d = SIT / fin / "frames"
        if not d.is_dir():
            continue
        sp_poses = {}
        for p in sorted(d.glob("*.png")):
            m = re.match(r"(.+?)(?:_(\d))?\.png", p.name)
            sp_poses.setdefault(m.group(1), []).append(p.name)
        sp_poses = dict(
            sorted(
                sp_poses.items(),
                key=lambda kv: (ORDER.index(kv[0]) if kv[0] in ORDER else 99, kv[0]),
            )
        )
        missing = [
            n
            for n in ORDER
            if n not in sp_poses and n != "chair" and n not in GRANNY_ONLY
        ]
        note = (
            " (own redraw: a shuffling walk, read is knitting; her own extras: knit, the idles biscuit, glasses, nap (with a drifting Z), and knitread, the knitting-to-reading in-between)"
            if fin == "gingham"
            else ""
        )
        miss = (
            f" <b style='color:#b03'>missing: {', '.join(missing)}</b>"
            if missing
            else ""
        )
        h.append(
            f"<details><summary><b>{fin}</b>{note}: {len(sp_poses)} poses, {sum(len(v) for v in sp_poses.values())} frames{miss}</summary>"
        )
        h.append(
            "<div class=sheet>"
            + "".join(
                f"<img src='sitters/{fin}/frames/{n}' title='{n}'>"
                for v in sp_poses.values()
                for n in v
            )
            + "</div>"
        )
        for pose, files in sp_poses.items():
            h.append(f"<h2>{fin}: {pose}</h2><div class=row>")
            for sp in SP:
                h.append(
                    f"<div class=cell><span class=cap>{sp}</span><img class=pet src='{SPR}/{sp}/adult_content_1.png'>"
                )
                for i, f in enumerate(files[:2]):
                    h.append(
                        f"<img class='sit f{i + 1}' src='sitters/{fin}/frames/{f}'>"
                    )
                h.append("</div>")
            h.append("</div>")
        h.append("</details>")
h.append("</html>")
out.write_text("\n".join(h))
