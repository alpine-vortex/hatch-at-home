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
