#!/usr/bin/env python3
"""Write the Sol batch prompts for the Hatch at Home bird set.
usage: make_prompts.py OUTDIR "STYLE SENTENCE"
Each sheet: regular grid, flat mid-grey background, one subject per cell."""
import sys, pathlib
out = pathlib.Path(sys.argv[1]); style = sys.argv[2]; out.mkdir(parents=True, exist_ok=True)

BIRD = ("the same original cute round woodland bird as in the attached reference image: identical palette, "
        "markings, outline weight and proportions. Pacific Northwest cozy rainy-forest feel, little kaomoji-like "
        "charm in the face. Thin dark outline. Faces three-quarters to the right.")
STAGES = {
 "baby": "BABY stage: a fresh hatchling, very small and extra fluffy down, tiny stub wings, oversized head, a wisp of down on top.",
 "child": "CHILD stage: a fledgling, exactly the bird in the reference image.",
 "teen": "TEEN stage: a juvenile, a bit taller and gangly, longer legs and tail, slightly scruffy half-grown feathers, same colours.",
}
MOODS = [
 ("content", "happy idle, soft smile, eyes as gentle arcs", "frame 2 = same pose, body bobbed down slightly"),
 ("excited", "hopping in the air, wings up, small sparkles around it", "frame 2 = landed low, sparkles in different spots"),
 ("cozy", "wrapped snugly in a small knitted blanket, content face", "frame 2 = same, eyes blinking closed"),
 ("bored", "slumped, half-lidded flat eyes, wings hanging", "frame 2 = same slump, a small sigh puff"),
 ("hungry", "looking down at an empty bowl at its feet, beak open", "frame 2 = same, beak closed, glancing at the bowl"),
 ("sleepy", "droopy half-closed eyes, head nodding", "frame 2 = head nodded lower, eyes nearly shut"),
 ("asleep", "eyes closed, tucked down, a small 'z'", "frame 2 = same, a second small 'z' higher up"),
 ("sick", "feathers tinted slightly green, droopy eyes, a small thermometer in its beak", "frame 2 = same, a small wobble lean"),
 ("calling", "waving one wing up, a small '!' above its head", "frame 2 = wing at the other end of the wave, '!' same"),
 ("dirty", "grossed out face, holding its beak with one wing, a few small smudges on its feathers", "frame 2 = same, little stink lines"),
]
COMMON = (f"Art style: {style}\n"
 "Background: one flat even mid-grey everywhere (no gradient, no texture, no floor, no shadows on it). "
 "Every subject is drawn whole inside its own cell with a generous empty margin; nothing crosses a cell edge. "
 "No text labels, no titles, no cell borders, no grid lines.\n")
FEET = "In every cell the bird stands at the same size with its feet on the same height, low in the cell.\n"

def write(name, body, refs="ref.png"):
    (out / f"{name}.txt").write_text(
        f"Use your image generation tool to draw ONE square image and save it as {name}.png in the current directory.\n\n{body}\n{COMMON}")
    (out / f"{name}.img").write_text(refs + "\n")

for st, desc in STAGES.items():
    for i in range(0, 10, 3 if False else 1):
        pass
    groups = [MOODS[0:3], MOODS[3:6], MOODS[6:8], MOODS[8:10]]
    for gi, g in enumerate(groups, 1):
        rows = "\n".join(f"- Row {r}: mood '{m}': {d}. Left = frame 1; right = {f2}." for r, (m, d, f2) in enumerate(g, 1))
        write(f"{st}_{gi}", f"A sheet of {len(g)} rows x 2 columns of equal square cells, each cell one pose of {BIRD}\n{desc}\n{rows}\n{FEET}")

write("egg", "A sheet of 3 rows x 2 columns of equal square cells. Each cell shows the same small speckled egg this bird hatches from "
 "(soft cream shell with mossy-green and brown speckles, thin dark outline, same art style as the reference), standing upright on the same height.\n"
 "- Row 1 'idle': left = egg still; right = egg with a tiny shine shift.\n"
 "- Row 2 'wiggle': left = egg tilted left with small motion marks; right = tilted right.\n"
 "- Row 3 'crack': left = a small zigzag crack on top; right = bigger crack with a peeking eye in the gap.\n")

EXTRA = [("squint", "squinting against bright light, one wing shading its eyes"),
 ("shiver", "shivering cold, feathers puffed, small shake lines"),
 ("sweat", "too hot, small sweat drops, beak open panting"),
 ("mask", "wearing a small white face mask over its beak"),
 ("dance", "dancing happily, one foot up, wings out, small music notes"),
 ("watch_tv", "seen three-quarters from behind-right sitting and watching a tiny glowing TV set beside it"),
 ("birdwatch", "standing on tiptoe looking out of a small round window beside it, curious")]
for si, g in enumerate([EXTRA[0:4], EXTRA[4:7]], 1):
    cells = "\n".join(f"- Cell {i} ({'top-left top-right bottom-left bottom-right'.split()[i-1]}): '{m}': {d}." for i, (m, d) in enumerate(g, 1))
    write(f"extra_{si}", f"A 2 x 2 grid of equal square cells, each cell one pose of {BIRD}\nCHILD stage, exactly the reference bird.\n{cells}\n"
          + ("Leave the bottom-right cell empty grey.\n" if len(g) == 3 else "") + FEET)

PROPS = [("poop_1", "a cute stylised little swirl poop with a tiny shine"), ("poop_2", "the same poop, slightly squatter swirl"),
 ("poop_3", "the same poop, a little leaning swirl"), ("attention", "a call icon: a round speech bubble with a bold '!'"),
 ("bowl_food", "a small wooden bowl full of seeds and berries"), ("snack", "a single plump blue huckleberry with a leaf"),
 ("medicine", "a small amber medicine bottle with a dropper"), ("ball", "a small soft striped toy ball"),
 ("sparkle_clean", "a cluster of clean sparkles with a bubble or two"), ("blanket", "a small folded knitted blanket"),
 ("sitter_sign", "a small wooden sign on a post reading 'At the sitter's'"), (None, None)]
pos = "top-left top-right bottom-left bottom-right".split()
for si in range(3):
    g = PROPS[si*4:si*4+4]
    cells = "\n".join(f"- {pos[i]}: {d}." if m else f"- {pos[i]}: leave empty grey." for i, (m, d) in enumerate(g))
    write(f"props_{si+1}", "A 2 x 2 grid of equal square cells, each holding one small game prop object drawn in the same art style, palette and "
          f"outline as the attached reference bird (the bird itself does NOT appear). Each object centred, filling about 60% of its cell.\n{cells}\n")

BG = [("bg_day", "a cozy wooden-cabin living room nook by day: a window showing Pacific Northwest firs and soft daylight, a rug, a houseplant"),
 ("bg_night", "the same cozy nook at night: window shows a crescent moon and stars over dark firs, warm lamp glow"),
 ("bg_rain", "the same cozy nook on a rainy day: rain streaks and drops on the window, grey-green forest outside"),
 ("bg_dim", "the same cozy nook in dim evening light, a small candle or lamp, soft shadows")]
for n, d in BG:
    (out / f"{n}.txt").write_text(f"Use your image generation tool to draw ONE landscape image (4:3, wide) and save it as {n}.png in the current directory.\n\n"
        f"A background scene for a virtual-pet game, no creature in it: {d}. Same art style, palette and outline as the attached reference. "
        f"Leave the lower-middle floor area open and uncluttered where the pet will stand. No text.\nArt style: {style}\n")
    (out / f"{n}.img").write_text("ref.png\n")
print(len(list(out.glob('*.txt'))), "prompts")
