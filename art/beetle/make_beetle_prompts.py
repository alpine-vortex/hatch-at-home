#!/usr/bin/env python3
"""Sol batch prompts for the blue death-feigning beetle. usage: make_beetle_prompts.py OUTDIR
ref.png in OUTDIR = the approved beetle reference sheet (egg, larva, young adult, teen adult)."""
import sys, pathlib
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
STYLE = ("chunky retro pixel art exactly like the attached reference sheet: big hard square pixels, no anti-aliasing, no gradients, "
         "limited palette, dark pixel outline. Keep the reference's pixel size relative to the subject, so the pixels are large and clearly visible")
WHO = ("the same original cute blue death-feigning beetle as in the attached reference sheet: identical palette, markings, outline and proportions, "
       "same cute kaomoji-like face. Faces three-quarters to the right.")
STAGES = {
 "baby": "BABY stage: the small pale cream mealworm-like larva from the reference sheet (top-right).",
 "child": "CHILD stage: the small young adult beetle from the reference sheet (bottom-left): powder-blue speckled bumpy shell, black legs and antennae.",
 "teen": "TEEN stage: the bigger chunkier adult beetle from the reference sheet (bottom-right).",
}
MOODS = [
 ("content", "happy idle, soft smile, eyes as gentle arcs", "frame 2 = same pose, body bobbed down slightly"),
 ("excited", "a little hop off the ground, antennae up, small sparkles around it", "frame 2 = landed, sparkles in different spots"),
 ("cozy", "tucked snugly under a small knitted blanket, content face", "frame 2 = same, eyes blinking closed"),
 ("bored", "flattened low, half-lidded flat eyes, antennae drooping", "frame 2 = same, a small sigh puff"),
 ("hungry", "looking at an empty little dish beside it, mouth open", "frame 2 = same, mouth closed, glancing at the dish"),
 ("sleepy", "droopy half-closed eyes, antennae sagging", "frame 2 = head lower, eyes nearly shut"),
 ("asleep", "eyes closed, resting low, a small 'z'", "frame 2 = same, a second small 'z' higher up"),
 ("sick", "colours tinted slightly green, droopy eyes, a small thermometer in its mouth", "frame 2 = same, a small wobble lean"),
 ("calling", "one front leg raised and waving, a small '!' above it", "frame 2 = leg at the other end of the wave, '!' same"),
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
write("egg", "A sheet of 3 rows x 2 columns of equal square cells. Each cell shows the beetle's tiny pale cream oval egg from the reference sheet (top-left), drawn larger here so it fills about a third of the cell, resting on the same height.\n"
 "- Row 1 'idle': left = egg still; right = egg with a tiny shine shift.\n- Row 2 'wiggle': left = tilted left with small motion marks; right = tilted right.\n"
 "- Row 3 'crack': left = a small zigzag crack on top; right = bigger crack with a peeking eye in the gap.\n")
CH = STAGES["child"]
write("sig_1", f"A sheet of 2 rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{CH}\n"
 "- Row 1: 'play_dead': flipped onto its back, legs tucked up in the air, little X eyes, perfectly still. Left = frame 1; right = frame 2 = identical except one leg twitches slightly.\n"
 "- Row 2: 'peek': still on its back, legs up, cracking one eye open to check if anyone is watching. Left = frame 1 (eye barely open); right = frame 2 (eye a bit wider, glancing).\n"
 "The shell rests on the same height in every cell, low in the cell.\n")
write("sig_2", f"A sheet of 2 rows x 2 columns of equal square cells, each cell one pose of {WHO}\n{CH}\n"
 "HUMID variant: its waxy shell has turned dark, almost black slate-blue with the speckles barely visible (as happens in humid air); everything else identical.\n"
 "- Row 1: 'content': happy idle, eyes as gentle arcs. Left = frame 1; right = frame 2 = body bobbed down slightly.\n"
 "- Row 2: 'cozy': tucked under a small knitted blanket. Left = frame 1; right = frame 2 = eyes blinking closed.\n" + LOW)
EX = [("squint","squinting against bright light, one front leg shading its eyes"),("shiver","shivering cold, small shake lines"),
 ("sweat","too hot, small sweat drops"),("mask","wearing a small white face mask"),
 ("dance","dancing happily, two legs up, small music notes"),("watch_tv","seen from behind-right watching a tiny glowing TV set beside it")]
for si, g in enumerate([EX[0:4], EX[4:6]], 1):
    cells = "\n".join(f"- {POS[i]}: '{m}': {d}." for i, (m, d) in enumerate(g))
    write(f"extra_{si}", f"A 2 x 2 grid of equal square cells, each cell one pose of {WHO}\n{CH}\n{cells}\n"
          + ("Leave the bottom-left and bottom-right cells empty grey.\n" if len(g) == 2 else "") + LOW)
write("props_1", "A 2 x 2 grid of equal square cells, each holding one small game prop drawn as chunky pixel art (props about 24 art pixels wide) in the same style and outline as the reference (no beetle). Each object centred, filling about 60% of its cell.\n"
 "- top-left: a small shallow dish of rolled oats and little veggie pieces.\n- top-right: a single slice of red apple.\n"
 "- bottom-left: a curved piece of cork bark a beetle could hide under.\n- bottom-right: leave empty grey.\n")
(out / "bg_terrarium.txt").write_text("Use your image generation tool to draw ONE landscape image (4:3, wide) and save it as bg_terrarium.png in the current directory.\n\n"
 "A background scene for a virtual-pet game, no creature in it: a cozy desert terrarium interior seen from the front, warm sand floor, a piece of cork bark, "
 "a small rock and a little succulent, soft warm lamp light. Leave the lower-middle sand open where the pet will rest. No text.\n"
 f"Art style: {STYLE}\n")
(out / "bg_terrarium.img").write_text("")
print(len(list(out.glob('*.txt'))), "prompts")
