#!/usr/bin/env python3
"""Sol batch prompts for the Douglas squirrel. usage: make_squirrel_prompts.py OUTDIR
ref.png in OUTDIR = the approved beetle reference sheet (egg, larva, young adult, teen adult)."""
import sys, pathlib
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
STYLE = ("chunky retro pixel art exactly like the attached reference sheet: big hard square pixels, no anti-aliasing, no gradients, "
         "limited palette, dark pixel outline. Keep the reference's pixel size relative to the subject, so the pixels are large and clearly visible")
WHO = ("the same original cute Douglas squirrel as in the attached probe sheet: identical palette, markings, outline and proportions, "
       "same cute face with lots of attitude. Faces three-quarters to the right. LOOK: small compact tree squirrel, dark olive-brown back, bright "
       "orange-rust belly and chest, a CLEAR BRIGHT WHITE EYE RING around each eye (clearly visible, 1 art pixel wide), small rounded ears, "
       "bushy tail curled up over its back, four paws.")
STAGES = {
 "baby": "BABY stage: the tiny kit from the probe sheet (row 1 left): eyes just open, big head, stubby tail.",
 "child": "CHILD stage: the fluffy juvenile from the probe sheet (row 1 middle).",
 "teen": "TEEN stage: the full adult from the probe sheet (row 1 right), the biggest.",
}
MOODS = [
 ("content", "happy idle, soft smile, eyes as gentle arcs", "frame 2 = same pose, body bobbed down slightly"),
 ("excited", "hopping up on its hind legs, tail fluffed high, small sparkles", "frame 2 = landed, tail flicked, sparkles moved"),
 ("cozy", "curled up wrapped in its own big bushy tail like a blanket, content face", "frame 2 = same, eyes blinking closed"),
 ("bored", "slumped flat on its belly, chin on its paws, half-lidded flat eyes", "frame 2 = same, a small sigh puff"),
 ("hungry", "looking at an empty little bowl beside it, mouth open", "frame 2 = same, paws on its tummy"),
 ("sleepy", "droopy half-closed eyes, sitting up and nodding", "frame 2 = head lower, eyes nearly shut"),
 ("asleep", "eyes closed, curled up under its tail, a small 'z'", "frame 2 = same, a second small 'z' higher up"),
 ("sick", "colours tinted slightly green, droopy eyes, a small thermometer in its mouth", "frame 2 = same, a small wobble lean"),
 ("calling", "sitting up, one front paw raised and waving, a small '!' above it", "frame 2 = paw at the other end of the wave, '!' same"),
 ("dirty", "grossed out face, a few small smudges on it", "frame 2 = same, little stink lines"),
]
COMMON = (f"Art style: {STYLE}\n"
 "Background: one flat even mid-grey everywhere (no gradient, no texture, no floor, no shadows on it). "
 "Every subject is drawn whole inside its own cell with a generous empty margin; nothing crosses a cell edge. "
 "No text labels, no titles, no cell borders, no grid lines.\n")
LOW = "In every cell the creature is the same size and rests on the same height, low in the cell.\n"
POS = "top-left top-right bottom-left bottom-right".split()
def write(name, body):
    (out / f"{name}.txt").write_text(f"Use your image generation tool to draw ONE square image and save it as {name}.png in the current directory.\n\n{body}\n{COMMON}")
    (out / f"{name}.img").write_text("")
for st, desc in STAGES.items():
    for gi, g in enumerate([MOODS[0:3], MOODS[3:6], MOODS[6:8], MOODS[8:10]], 1):
        rows = "\n".join(f"- Row {r}: mood '{m}': {d}. Left = frame 1; right = {f2}." for r, (m, d, f2) in enumerate(g, 1))
        write(f"{st}_{gi}", f"A sheet of {len(g)} rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{desc}\n{rows}\n{LOW}")
CH = STAGES["child"]
write("sig_1", f"A sheet of 2 rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{CH}\n"
 "- Row 1: 'chatter': indignant scolding chatter, mouth wide open, stamping a foot, small sound marks. Left = frame 1 (tail flicked up); right = frame 2 (tail flicked to the side).\n"
 "- Row 2: 'cache': crouched, burying a small fir cone with its front paws in a little dirt mound. Left = frame 1 (pushing the cone in); right = frame 2 (patting the dirt down).\n" + LOW)
write("sig_2", f"A sheet of 2 rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{CH}\n"
 "- Row 1: 'cheeks': sitting up with its cheeks comically stuffed round with seeds. Left = frame 1; right = frame 2 = cheeks a bit rounder, a seed falling.\n"
 "- Row 2: leave both cells empty grey.\n" + LOW)
EX = [("squint","squinting against bright light, one front paw shading its eyes"),("shiver","shivering cold, fur puffed, small shake lines"),
 ("sweat","too hot, small sweat drops, mouth open"),("mask","wearing a small white face mask over its nose and mouth"),
 ("dance","dancing happily on its hind legs, tail swishing, small music notes"),("watch_tv","seen from behind-right watching a tiny glowing TV set beside it")]
for si, g in enumerate([EX[0:4], EX[4:6]], 1):
    cells = "\n".join(f"- {POS[i]}: '{m}': {d}." for i, (m, d) in enumerate(g))
    write(f"extra_{si}", f"A 2 x 2 grid of equal square cells, each cell one pose of {WHO}\n{CH}\n{cells}\n"
          + ("Leave the bottom-left and bottom-right cells empty grey.\n" if len(g) == 2 else "") + LOW)
PR = "each holding one small game prop drawn as chunky pixel art (props about 24 art pixels wide) in the same style and outline as the reference (no squirrel). Each object centred, filling about 60% of its cell.\n"
write("props_1", "A 2 x 2 grid of equal square cells, " + PR +
 "- top-left: a small pile of hazelnuts.\n- top-right: a single Douglas-fir cone.\n- the bottom two cells: leave empty grey.\n")
print(len(list(out.glob('*.txt'))), "prompts")
