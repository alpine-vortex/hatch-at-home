# The sitter (art A1)

One sitter for every species: human-ish, gender-neutral, chunky pixel art in the pets' style.
Spec: docs/plan-2026-11-04-sitter-visits.md section 8.

- `frames/<pose>_<n>.png`: 256x256 RGBA, feet on y=224, centred on x=128, drawn on the pets'
  4 px art grid, so the sitter sits in the same box as any pet sprite (it is about 192 px
  tall standing, a deer is 198, a corgi 156). The care props are not drawn: the card shows
  `bowl_food`, the ball, the medicine bottle and the blanket beside the hands.
- Poses: stand, walk, wave, read (chair, awake), doze (chair, night), chair (empty, one
  frame), feed, play, clean (a small sponge in hand), medicine, tuck, pat, cheer, shoo; two
  frames each; six extra idles (stretch, tea, laugh, water, window, tidy), two frames each. Walk out is the walk, mirrored by the card (no frames of its own).
- `cut_sheet.py` cuts a generated sheet into frames; `review.py` writes `review.html`, each
  pose beside a hamster, a corgi and a deer at card scale.
- `looks/<finish>/`: one sitter per shell finish (the 24 of `rates.py` `SHELL_FINISHES`): the
  stand pose (`stand_1`, `stand_2`), the wave (`wave_1`) and the `accessory` alone. Same body in
  every look, a different person (skin, hair, clothes, one themed accessory). Only these three
  poses exist per look; the other poses are the base sitter's. `looks/gingham` is the granny
  (owner's request): her full set of poses is the later redraw batch.
- The look is not a recolour layer: a palette transfer over the base poses was tried and breaks
  on patterned clothes and on hair against skin, so a look needs its poses drawn.

## The six redrawn sitters (art A2)

`sitters/<finish>/frames/<pose>_<n>.png`: six fully redrawn sitters, each with the full pose set
under A1's file names (19 poses, 2 frames each, 38 files; the chair is the shared
`frames/chair.png`, and doze and read are drawn sitting on that chair). Same contract as
`frames/`: 256x256 RGBA, feet on y=224, centred on x=128, 4 px grid, no care props. The card
can swap a sitter per shell by folder. Nothing is wired in yet.

- `gingham`: the granny (grey bun, round glasses, cardigan). Shorter and rounder: 168 px tall
  standing, the others 188-192. Her own variants: a slow short-step `walk`, and `read` is
  knitting in the chair (doze has the knitting in her lap).
- `woodland`, `aqua`, `grove`, `celestial`, `dune`: themed to their world shell, starting from
  `looks/<finish>/` of A1.
- Cut with `cut_sheet.py`, one scale per sitter. `review.py` has a section per sitter.

## Six more redrawn sitters (art A3)

`glitter`, `hearts`, `rainbow`, `sunset`, `leaves`, `paws`: the same method and contract as A2
(38 files each, 19 poses x 2, the same file names, 188-192 px standing), each a different person
themed to its shell, starting from `looks/<finish>/`. `review.py` has a section per sitter.

## Six more redrawn sitters (art A4)

`clear`, `constellation`, `glow`, `scales`, `smoke`, `speckle`: the same method and contract again
(38 files each, 188-192 px standing), each a different person themed to its shell, starting from
`looks/<finish>/`. The constellation sitter is a dark-skinned person in a near-black jacket with a
pale gold constellation drawn across it (long dark hair with gold glints), so she does not read as
the celestial sitter (lavender hair, navy sweater, moon). `review.py` has a section per sitter.
