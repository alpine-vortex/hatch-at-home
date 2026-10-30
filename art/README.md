# Art sources

Sprites were drawn by Sol (an image-generation agent) on 2026-10-26, in chunky
pixel style. The finished PNGs the card uses are in
`custom_components/virtual_pet/frontend/sprites/{bird,gecko,beetle}/`, and the UI kit
(button and status icons, world emblems, ground decorations) is in
`custom_components/virtual_pet/frontend/ui/`.

- `gecko/`: the prompts, the anatomy fix-ups that led to the approved
  `gecko_ref_v5.png`, and the cutting script.
- `ui/`: the icon prompts and `cut_ui.py`. Icons are drawn on a 24-pixel grid at 4×,
  so they're crisp at 24 or 48 CSS pixels.

This folder keeps what's needed to make more in the same style: the
reference images, the prompts, and Sol's scripts (`make_*prompts.py` writes
the prompts, `cut.py` slices generated sheets into 256×256 sprites with the
feet on y=224). The full generated sheets are not committed; they're in the
original share zips.

Every sprite: transparent PNG, 256×256 (props 128×128, backgrounds 512×384),
named `{stage}_{mood}_{frame}.png`.

## Notes from Sol for the card (phase 2)

- `sitter_sign.png`: the text is unreadable at prop size, so the card adds its own label.
- `*_sick_*`: the green tint is faint; the thermometer is what says "sick".
- `bg_day`, `bg_night`, `bg_rain`, `bg_dim` are four different rooms, not one room
  in four lights, so cross-fading between them won't look like a light change.
- Hop poses (`excited`) keep the feet on the baseline. If the card wants a
  visible hop, it can add a small CSS bounce.
- Beetle stages (the owner's choice): egg → baby (pale larva) → child (small blue
  adult) → teen (bigger blue adult). No pupa.

## Beetle child/teen: redraw requested (2026-10-26)

The first child and teen beetles had the antennae standing straight up out of
the head, so they looked like raised arms. Those sprites are in
`art/beetle/rejected-v1/` for reference. Sol has been asked to redraw them with
short, beaded antennae pointing forward and down. The egg, larva, props and
terrarium are approved and stay in `sprites/beetle/`.

## Tabby kitten (Hearth): ready 2026-10-26

`art/kitten/` has the prompts, the probe and Sol's generic scripts
(`creatures.py` holds every creature's config; `cut_creature.py` cuts any of them).
The first import (75 sprites) was held back for three things, all fixed in Sol's
"Hearth v2" pack (sha256 checked):

- `teen_content_1` is now `teen_content_2` raised one art pixel, so the idle bobs
  instead of pulsing; `teen_sick_1/2` match the other teens' height.
- Hearth's egg (a knitted egg in a wicker basket) comes from the kitten, first on
  Hearth's roster.
- `bg_day`, `bg_night`, `bg_rain` and `bg_dim` show one room: brick fireplace, braided
  rug, lace-curtained window seat. They replace an earlier kit that copied the
  Woodland cabin and was never imported.

Hearth's `emblem_hearth`, `deco_yarn` and `deco_cushion` came in the same pack.

## Lop bunny (Hearth): ready 2026-10-26

74 sprites (sha256 checked), all 256×256 RGBA with the feet on y=224; the hay pile
(`bowl_food`) and carrot (`snack`) are 128×128. Signature poses: binky, flop, thump.
Its `content_1` frames are `content_2` raised one art pixel, a fix Sol's cutter
(`art/bunny/cut_creature.py`) now applies to every creature. The bunny is second on
Hearth's roster, so it hatches from the kitten's egg and borrows the kitten's rooms;
`play` borrows the bird's ball.

**2026-10-26, v0.7.1:** the cut that raised `content_1` one art pixel left a 4 px
transparent band across the legs (`baby`, `child` and `teen_content_1` of both
the kitten and the bunny). Sol's Hearth v3 and bunny v2 packs (sha256 checked) close it. The
review now also runs a connected-pieces check, which catches a band like that; the
floating "z", bowls and TVs are the expected extra pieces.

## Sea otter and the Tidepool kit: ready 2026-10-26

75 otter sprites (sha256 checked). It floats on its back on a water ripple that sits on
y=224. Signature poses: rock, hold_paws, kelp_wrap. Props: clams and urchin (`feed`),
crab (`snack`), stone (`play`). The Tidepool kit (sha256 checked) brings the egg (a
speckled egg in a clam), `bg_day`, `bg_night`, the `murk` overlay, the emblem and the
starfish and anemone decorations. Its bubbles became the otter's `clean` prop
(`sprites/otter/bubbles.png`). The night scene is not the day scene's layout; Sol was
asked for an aligned redraw. Kit prompts are in `art/tidepool/`.

## Giant Pacific octopus (Tidepool): ready 2026-10-26

74 sprites (sha256 checked). Signature poses: ink, colour_shift, jar. Props: shrimp
(`feed`) and a puzzle jar (`play`); it borrows the otter's crab as `snack`, and the
otter's scenes, murk and bubbles. Six frames (`child_excited_1/2`, `teen_excited_1/2`,
`teen_hungry_1/2`) came with dark slivers floating above the head: the tentacle tips
of the sheet row above, caught by the crop. They were erased here with
`art/octopus/erase_slivers.py` (dark, flat pieces wholly above the body); the
sparkles and bubbles were kept. Sol was told so the cutter can trim them.

## Pacific tree frog and the Pond kit: ready 2026-10-26

74 frog sprites (sha256 checked), cut with Sol's sliver fix; the sliver and gap checks
came back clean. Signature poses: croak, lily_sit, tongue. Props: a dish of flies
(`feed`) and a bug (`snack`; hard to read at sprite size, a nit); `play` borrows the
bird's ball. The Pond kit (sha256 checked) brings the frog-spawn egg, `bg_day`,
`bg_night`, the `murk` overlay, the emblem and the cattail and lily-pad decorations;
its bubbles became the frog's `clean` prop. The day scene puts the pet on open water.
The night scene is not the day's layout; Sol is sending matching nights for Pond and
Tidepool. Kit prompts are in `art/pond/`.

## Axolotl (Pond): ready 2026-10-26

74 sprites (sha256 checked); the size, gap and sliver checks came back clean. Signature
poses: float, gill_flutter, smile. Props: a bowl of bloodworms (`feed`) and a shrimp
(`snack`); `play` borrows the bird's ball. Second on Pond's roster, it hatches from
the frog-spawn egg and borrows the frog's scenes, murk and bubbles.

## Little brown bat and the Night Sky kit: ready 2026-10-26

74 bat sprites (sha256 checked); the size, gap and sliver checks came back clean.
Signature poses: echo, hang (hanging from a twig, so its head is on y=224, not its
feet), wing_wrap. Props: a dish of bugs (`feed`) and a fig (`snack`); `play` borrows
the bird's ball. The Night Sky kit (sha256 checked) brings the starry egg, `bg_day` (a
twilight meadow), `bg_night` on the same layout, the emblem and the lantern. Its
mushroom came as `ui/deco_mushroom.png`, which is Woodland's red toadstool, so it's
saved as `deco_glowshroom`, the name `worlds.json` already used for Night Sky. Ask Sol
to name world decorations uniquely. Night Sky isn't a water world, so poop stays poop.
Kit prompts are in `art/nightsky/`.

## Luna moth (Night Sky): ready 2026-10-26

72 sprites (sha256 checked); the size, gap and sliver checks came back clean. It has
two signature poses, not three (glow, with a little lantern flower, and wing_spread),
hence 72. Baby and child are the green caterpillar; the teen is the winged moth.
Props: leaves (`feed`) and a flower (`snack`); `play` borrows the bird's ball. It
hatches from the bat's starry egg and borrows the bat's meadow scenes.

## Matching nights for Tidepool and Pond: 2026-10-26

`otter/bg_night.png` and `treefrog/bg_night.png` replaced (sha256 checked): each is now
its day scene by moonlight, so the scene no longer changes place at sunset.

## Adult pass: 2026-10-26

Sol's batch (sha256 checked): `adult_<mood>_<1|2>.png` for bird, squirrel, gecko,
kitten, bunny, otter, octopus and tree frog, 160 sprites. All 256x256 RGBA with the
feet on y=224, a one-pixel content bob, and no slivers or gaps. Adults look grown up
through detail: smaller heads, longer bodies, calmer eyes, the squirrel's bushier tail,
bolder gecko spots and a deeper octopus red.

Long adults fit 256 px wide by coming out shorter than their teen (content height,
adult vs teen: bird 164/188, kitten 164/188, bunny 148/184, gecko 84/108, octopus
112/144, tree frog 124/148, otter 148/156; the squirrel is taller). Instead of a
redraw, `species.json` gets `"scale": {"adult": ...}` (1.15 to 1.2, capped so wide
adults stay on screen; otter 1.05, squirrel none), which the card applies with the feet
fixed. Sizes still vary a little between moods (asleep and sick come out bigger), as
the teens' do. Prompts are in `art/<species>/adult/`, Sol's adult scripts in
`art/adults/`; the raw sheets aren't committed.

## Squirrel paws-up poses: six legs fixed (2026-10-28, v0.29.1)

`child_cheeks_1/2` (the snack reaction), `child_hungry_2` and `child_shiver` held both
forepaws at the chest but still stood on three feet, so they read as six legs. The
middle foot was removed by hand on the 64×64 art grid (the foot rows cleared, the row
above closed with the outline colour); the haunch foot and the far foot stay, and the
feet stay on y=224.

## Frame review: 2026-10-28

A review of every live frame found two broken adult sets (axolotl, luna moth: outline
lost in the cut) and frames drawn at the wrong size for their stage. The axolotl and
moth outlines were closed with `art/adults/outline_fix.py`, and the oversized gecko sick
and squirrel baby cozy/sleepy frames were shrunk with `scripts/art/rescale.py`. What
needs new drawings is listed in `art/redraw-2026-10-28.md`.

## The 2026-10-28 creatures

`new-creatures/` holds the configs and probe prompts for the 17 creatures that bring
every world to five. How they're made, the checklist for each set and what the probes
taught us are in `docs/design-worlds.md` ("The 2026-10-28 creatures"). Probe sheets
are in `art/<id>/<id>_probe.png`.

## Shared action and weather effects

Creature-agnostic four-frame reaction, care-action, flair and weather loops are in
[`effects/`](effects/README.md). They are draft assets kept separate from the live
frontend; the preview and atlas cutter are included there.

## World visitors

Small creature-agnostic visitor sprites for all six worlds are in
[`visitors/`](visitors/README.md): four visitors per world, each with idle, two
movement and interaction frames. They are draft art and are not installed in the
frontend.

## Care-scene props (2026-10-29)

`props/source/broom.png` and `props/source/water_clean.png` are the owner's 2×2
sheets for the clean scene: a broom in two tilts and a dust puff in two frames; a
fish net with murk in it in two tilts and rising bubbles in two frames.
`props/cut_clean_props.py` cuts them into `frontend/ui/prop_{broom,dust,net,bubbles}_{1,2}.png`
(the grey keyed out everywhere, as it shows through the net's mesh; snapped to
the sheets' ~12.8 px art-pixel grid; one palette per sheet; 4 px per art pixel).
`storyboards/` holds the medicine and clean storyboards the scenes follow (visual
references only).

## Bearded dragon grain cleanup (2026-10-29, stopgap)

The owner found the bearded dragon set too grainy: stray single pixels and a broken
outline. Its drawings have fine stripes, a spike fringe, a furry beard and thin toes
that are smaller than one art pixel, so the 64×64 cut turned them to grain. As a
stopgap, `scripts/art/grain_cleanup.py` was run over all 92 dragon frames on main
(after art-batch-4). It merges near-duplicate shades, removes 1–2 px specks stuck to
the body, despeckles lone light pixels and closes the outline in one dark colour.
Silhouette, palette and effects are unchanged. No image model and no new drawings were
used. `bowl_food.png` and `play.png` (128 px props) were left alone. A clean redraw is
planned.

## Terrarium on the 128 grid (2026-10-29, slice 2 pilot)

Per `docs/plan-2026-10-29-sprite-grid-128.md`, every character frame of the leopard gecko, bearded dragon,
Russian tortoise and ball python (baby, child, teen, adult and the gecko's egg: 374 frames) is re-cut from the
same raw sheets at 2 px per art pixel. No image calls, no new drawings. Props, backgrounds and species.json are
unchanged (props stay at 64). The tarantula was already on 2 px and is not re-cut.

Overlay order, as the plan sets it: base cut (`cut.py` gecko mode for the gecko, as its set was first made;
`cut_creature`/`cut_adult` for the others; the dragon from its v1 sheets, replacing the grain stopgap), then
the redraws on top (the dragon's baby/child/teen asleep curls, 37ec5c0), then `rescale.py` (gecko baby/child
sick at 0.83/0.79, as 2598fec), then `outline.py` on the fresh cuts, then the marks last (the crisp Z and !
of 072d84a, and the gecko teen "!" of bb5a9ff with its call dashes kept), then `palette.py`. Head points and
hat points are unchanged. The gecko's egg comes out 8 px shorter than the old one (the cutter's egg crop has
changed since it shipped); same width and look.

## Hearth on the 128 grid (2026-10-29)

Every character frame of the lop bunny, tabby kitten, corgi, Syrian hamster and ferret (472 frames, including
the bunny's waves and the kitten's knitted egg) is re-cut at 2 px per art pixel from the same raw sheets, in the
plan's overlay order. No image calls; props, backgrounds and species.json unchanged. Base cut `cut_creature` /
`cut_adult` (the kitten with 48 stage colours: at 32 its teen's blue-grey blanket was cut brown). Redraws on top:
corgi teen sick/calling/dirty and kitten adult calling/dirty (37ec5c0, with the four-legged calls of 1cf81aa and
e570173), kitten baby calling/dirty (3dfc6c4), the bunny's waves from their react sheets (ddeb07e), the kitten egg
from the Hearth egg sheet. Then `outline.py`, then the marks (the crisp Z and ! on every corgi and ferret stage,
072d84a, and on the kitten adult calling; the kitten baby keeps its drawn "!"), then `palette.py`. Head and hat
points unchanged.

## Night Sky on the 128 grid (2026-10-30)

Every character frame of the bat, luna moth, saw-whet owl, firefly and opossum (464 frames, including the bat's
Night Sky egg and its waves) is re-cut at 2 px per art pixel from the same raw sheets, in the plan's overlay order.
No image calls; props, backgrounds and species.json unchanged. Base cut `cut_creature` / `cut_adult` (each
reproduces the shipped set at 64). Redraws on top: the bat adult (R7, f9c6c40, `cut_bat7.py`), the luna moth adult
(03e1e83, redraw5 at the scale that reproduces it), the opossum teen sick and four-legged adult calling/dirty
(37ec5c0, e570173), the bat's waves from their react sheets (ddeb07e), the Night Sky egg from its kit sheet. The luna
moth's cream face mask (bdc85f2) is carried over from the shipped frame. Then `outline.py`, then the marks (the bat
and moth adult Z and ! moved to where main has them, the opossum adult "!"), then `palette.py`. Head and hat points
unchanged.
