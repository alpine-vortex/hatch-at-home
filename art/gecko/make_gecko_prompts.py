#!/usr/bin/env python3
"""Sol batch prompts for the leopard gecko. usage: make_gecko_prompts.py OUTDIR
ref.png in OUTDIR = the approved beetle reference sheet (egg, larva, young adult, teen adult)."""
import sys, pathlib
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
STYLE = ("chunky retro pixel art exactly like the attached reference sheet: big hard square pixels, no anti-aliasing, no gradients, "
         "limited palette, dark pixel outline. Keep the reference's pixel size relative to the subject, so the pixels are large and clearly visible")
WHO = ("the same original cute leopard gecko as in the attached reference sheet: identical palette, markings, outline and proportions, "
       "same cute kaomoji-like face. Faces three-quarters to the right. ANATOMY: chubby low-slung body, belly near the ground; four short legs "
       "splayed out to the sides with elbows and knees bent outward; broad rounded head, big eyes with eyelids, wide gentle smile; thin toes "
       "with tiny claws, no toe pads; thick fat carrot-shaped tail almost as long as the body, resting on the ground and curving gently. "
       "The whole gecko, tail included, fits inside its cell.")
STAGES = {
 "baby": "BABY stage: the small hatchling from the reference sheet (top-right): bold dark-brown and yellow bands on body and tail, no spots.",
 "child": "CHILD stage: the juvenile from the reference sheet (bottom-left): bands breaking into blotches, first small spots, banded brown/cream tail.",
 "teen": "TEEN stage: the biggest gecko from the reference sheet (bottom-right): golden body with black spots, cream belly, and the brown/cream banded tail exactly as in the reference.",
}
MOODS = [
 ("content", "happy idle, soft smile, eyes as gentle arcs", "frame 2 = same pose, body bobbed down slightly"),
 ("excited", "alert hunting crouch, eyes wide, tail tip wiggling with small motion marks, a few sparkles", "frame 2 = tail tip flicked the other way, sparkles moved"),
 ("cozy", "curled up half inside a little brown half-log hide, head poking out, content face", "frame 2 = same, eyes blinking closed"),
 ("bored", "flopped flat on its belly, chin on the ground, half-lidded flat eyes", "frame 2 = same, a small sigh puff"),
 ("hungry", "watching a small shallow dish of mealworms beside it, mouth open", "frame 2 = same, mouth closed, licking its lips"),
 ("sleepy", "droopy half-closed eyelids, head nodding", "frame 2 = head lower, eyelids nearly shut"),
 ("asleep", "eyelids closed, curled with tail around itself, a small 'z'", "frame 2 = same, a second small 'z' higher up"),
 ("sick", "colours tinted slightly green, droopy eyes, a small thermometer in its mouth", "frame 2 = same, a small wobble lean"),
 ("calling", "head up, one front foot raised and waving, a small '!' above it", "frame 2 = foot at the other end of the wave, '!' same"),
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
write("egg", "A sheet of 3 rows x 2 columns of equal square cells. Each cell shows the gecko's leathery white, slightly dented oval egg from the reference sheet (top-left), filling about a third of the cell, resting on the same height.\n"
 "- Row 1 'idle': left = egg still; right = egg with a tiny shine shift.\n- Row 2 'wiggle': left = tilted left with small motion marks; right = tilted right.\n"
 "- Row 3 'crack': left = a small zigzag crack on top; right = bigger crack with a peeking eye in the gap.\n")
CH = STAGES["child"]
write("sig_1", f"A sheet of 2 rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{CH}\n"
 "- Row 1: 'eye_lick': licking its own eyeball with its little pink tongue. Left = frame 1 (tongue reaching the eye); right = frame 2 (tongue across the eye, eye squeezed).\n"
 "- Row 2: 'shed': covered in pale, peeling, flaky patches of old skin, looking a bit grumpy. Left = frame 1; right = frame 2 = a flake falling off.\n" + LOW)
write("sig_2", f"A sheet of 2 rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{CH}\n"
 "- Row 1: 'tail_wiggle': low hunting crouch, eyes locked forward, tail tip vibrating with small motion marks. Left = frame 1 (tip left); right = frame 2 (tip right).\n"
 "- Row 2: leave both cells empty grey.\n" + LOW)
EX = [("squint","squinting against bright light, one front foot shading its eyes"),("shiver","shivering cold, small shake lines"),
 ("sweat","too hot, small sweat drops, mouth open"),("mask","wearing a small white face mask over its snout"),
 ("dance","dancing happily, up on its back legs, small music notes"),("watch_tv","seen from behind-right watching a tiny glowing TV set beside it")]
for si, g in enumerate([EX[0:4], EX[4:6]], 1):
    cells = "\n".join(f"- {POS[i]}: '{m}': {d}." for i, (m, d) in enumerate(g))
    write(f"extra_{si}", f"A 2 x 2 grid of equal square cells, each cell one pose of {WHO}\n{CH}\n{cells}\n"
          + ("Leave the bottom-left and bottom-right cells empty grey.\n" if len(g) == 2 else "") + LOW)
PR = "each holding one small game prop drawn as chunky pixel art (props about 24 art pixels wide) in the same style and outline as the reference (no gecko). Each object centred, filling about 60% of its cell.\n"
write("props_1", "A 2 x 2 grid of equal square cells, " + PR +
 "- top-left: a small shallow dish with a few mealworms.\n- top-right: a single plump pale waxworm.\n"
 "- bottom-left: a small brown half-log hide.\n- bottom-right: a warm glowing orange heat-mat patch, a soft rounded rectangle.\n")
write("props_2", "A 2 x 2 grid of equal square cells, " + PR + "- top-left: a small cute brown cricket.\n- the other three cells: leave empty grey.\n")
(out / "bg_vivarium.txt").write_text("Use your image generation tool to draw ONE landscape image (4:3, wide) and save it as bg_vivarium.png in the current directory.\n\n"
 "A background scene for a virtual-pet game, no creature in it: a cozy desert-scrub vivarium interior seen from the front, sand-coloured substrate, "
 "a flat slate rock, a small half-log hide and a little plant, soft warm lamp light. Leave the lower-middle floor open where the pet will rest. No text.\n"
 f"Art style: {STYLE}\n")
(out / "bg_vivarium.img").write_text("")
print(len(list(out.glob('*.txt'))), "prompts")
