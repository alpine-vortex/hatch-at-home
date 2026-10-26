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

## Tabby kitten (Hearth): imported 2026-10-26, not ready yet

The sprites are in `sprites/kitten/` with `"ready": false`, so Hearth stays hidden.
`art/kitten/` has the prompts, the probe and Sol's generic scripts
(`creatures.py` holds every creature's config; `cut_creature.py` cuts any of them).
Before the kitten can be marked ready:

- `teen_content_1` is drawn about 20% bigger than `teen_content_2` and its ears
  touch the top edge, so the idle animation pulses. Asked Sol to redraw it at frame
  2's size.
- The kitten is first on Hearth's roster, so it must supply Hearth's egg
  (`egg_idle`, `egg_wiggle`, `egg_crack`, two frames each) and at least `bg_day`.
- The card has no `house` shell shape yet (Hearth's device); it falls back to the egg.
