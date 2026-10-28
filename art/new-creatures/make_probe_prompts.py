#!/usr/bin/env python3
"""usage: make_probe_prompts.py [NAME ...] -> prompts/<name>_probe.txt (all creatures if none named).

A probe sheet is the first drawing of a new creature, for the owner to approve
before the full set (docs/design-worlds.md): baby, child and teen content in
row 1; the teen sick and asleep and one signature pose in row 2. Attach the
creature's world reference (WORLD_REF) so the style and palette match.
"""
import sys, pathlib
here = pathlib.Path(__file__).parent; sys.path.insert(0, str(here)); from creatures import C, WORLD_REF
out = here/"prompts"; out.mkdir(exist_ok=True)
# NO_TINT says "as the reference", but here the reference is another creature, and some
# creatures change colour as they grow (the fox kit, the duckling, the owlet).
PROBE_TINT = ("Each stage keeps its body colours identical in the cells it appears in; moods show through face, pose and small props only, "
              "never by recolouring the body.")
# The defaults from art/kitten/creatures.py for the two moods the probe shows.
PROBE_MOODS = {"sick": ("droopy sad eyes, a small thermometer in its mouth (NO colour tint on the body)", ""),
               "asleep": ("eyes closed, resting curled up, a small 'z'", "")}
COMMON = ("Art style: chunky retro pixel art exactly like the attached reference sheet: big hard square pixels, no anti-aliasing, no gradients, "
          "limited palette, dark pixel outline. Keep the reference's pixel size relative to the subject, so the pixels are large and clearly visible\n"
          "Background: one flat even mid-grey everywhere (no gradient, no texture, no floor, no shadows on it). "
          "Every subject is drawn whole inside its own cell with a generous empty margin; nothing crosses a cell edge. No text labels, no titles, no cell borders, no grid lines.\n")
for n in sys.argv[1:] or C:
    c = C[n]; moods = dict(PROBE_MOODS); moods.update({k: v for k, v in c.get("moods", {}).items() if k in moods})
    baby, child, teen = c["stages"]; sig, sig_desc, _ = c["sigs"][0]
    (out/f"{n}_probe.txt").write_text(
        f"Use your image generation tool to draw ONE image (landscape 3:2) and save it as {n}_probe.png in the current directory.\n\n"
        f"A probe sheet of 2 rows x 3 columns of equal square cells introducing a NEW original cute {c['kind']} for a virtual pet: {c['look']} "
        f"It lives in the same world as the creature in the attached reference sheet, so match that sheet's style and palette feel; do not copy its creature. "
        f"Faces three-quarters to the right. {PROBE_TINT}\n"
        f"- Row 1, mood 'content' (happy idle, soft smile, eyes as gentle arcs). Left = {baby} Middle = {child} Right = {teen}\n"
        f"- Row 2, all the TEEN unless stated. Left = mood 'sick': {moods['sick'][0]}. Middle = mood 'asleep': {moods['asleep'][0]}. "
        f"Right = the CHILD in its signature pose '{sig}': {sig_desc}.\n"
        "Row 1 grows clearly from left to right; the three stages share colours and markings so they read as one creature growing up. "
        "In every cell the creature rests on the same height, low in the cell.\n\n"
        f"Attach: art/{WORLD_REF[c['world']]} (style reference).\n\n" + COMMON)
    print(n, "ok")
