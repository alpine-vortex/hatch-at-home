#!/usr/bin/env python3
"""usage: make_adult_prompts.py NAME -> <name>-adult/adult_1..4 (ref = that creature's teen_1 sheet)."""
import sys, pathlib, shutil
sys.path.insert(0, str(pathlib.Path(__file__).parent)); from creatures import C, DEFAULT_MOODS, NO_TINT, ADULT_LOOK, TEEN_SHEET
root = pathlib.Path.home()/"github/hatch-art"; n = sys.argv[1]; c = C[n]; out = root/f"{n}-adult"; out.mkdir(exist_ok=True)
src = root/TEEN_SHEET.get(n, f"{n}-batch/teen_1.png")
if src.exists(): shutil.copy(src, out/"ref.png")  # else the job line points at the teen sheet directly
STYLE = ("chunky retro pixel art exactly like the attached reference sheet: big hard square pixels, no anti-aliasing, no gradients, "
         "limited palette, dark pixel outline, the same pixel size relative to the creature")
COMMON = (f"Art style: {STYLE}\nBackground: one flat even mid-grey everywhere (no gradient, no texture, no floor, no shadows on it). "
          "Every subject is drawn whole inside its own cell with a generous empty margin; nothing crosses a cell edge. No text labels, no titles, no cell borders, no grid lines.\n")
WHO = c["who"] + " Faces three-quarters to the right. " + NO_TINT
ST = (f"ADULT stage: the grown-up {n}. The attached reference sheet shows its TEEN stage, which still has youthful proportions. "
      f"The ADULT must look clearly older at a glance: ADULT PROPORTIONS - the head noticeably smaller relative to the body (about a quarter "
      f"of its height, not a third), a longer, fuller body, a calm mature face with smaller, relaxed eyes (no oversized baby eyes). "
      f"Grown-up details: {ADULT_LOOK[n]}. Same overall height as the teen (not bigger), same body colours, still cute with blush and a gentle smile.")
moods = dict(DEFAULT_MOODS); moods.update(c.get("moods", {})); M = list(moods.items())
for gi, g in enumerate([M[0:3], M[3:6], M[6:8], M[8:10]], 1):
    rows = "\n".join(f"- Row {r}: mood '{m}': {d}. Left = frame 1; right = {f2}." for r, (m, (d, f2)) in enumerate(g, 1))
    (out/f"adult_{gi}.txt").write_text(f"Use your image generation tool to draw ONE square image and save it as adult_{gi}.png in the current directory.\n\n"
        f"A sheet of {len(g)} rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{ST}\n{rows}\n"
        "In every cell the creature is the same size and rests on the same height, low in the cell.\n\n" + COMMON)
    (out/f"adult_{gi}.img").write_text("")
print(n, "ok")
