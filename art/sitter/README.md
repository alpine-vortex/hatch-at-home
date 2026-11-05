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

## The last six redrawn sitters (art A5)

`stars`, `twotone`, `stripes`, `dots`, `waves`, `camo`: the same method and contract again (38
files each, 188-192 px standing), each a different person themed to its shell, starting from
`looks/<finish>/`. After A5 every one of the 24 finishes has a full sitter (`gingham` is the granny);
`looks/` stays as the starting look and the card's fallback path. The stars sitter is a blond kid in a
navy sweater with big yellow stars, grey trousers and yellow shoes, so it does not read as the celestial
sitter (lavender hair, moon) or the constellation one (near-black jacket); the waves sitter has dark
navy wavy hair and a cream top fading into rolling blue wave stripes, against aqua's teal hair and
striped sweater. `review.py` has a section per sitter.

## The granny's own extras (art A6)

`sitters/gingham/frames/` gains the granny's own poses (owner 2026-11-04: "her own poses (a slower walk,
knitting in the chair, and so on)"), same contract as A2-A5 (256x256, feet on y=224, centred on x=128, 4 px
grid, on-model with her `stand_1`, 160-168 px tall):

- `knit_1`, `knit_2`: knitting on the shared chair, the long knitted piece over her knees and a red ball of wool on
  the floor (the chair is drawn into the frame, as `read` and `doze` do, and sits on the same x as `read`'s chair; the
  ball sticks out to the right).
- `walk_1`, `walk_2` redrawn (same names): a shorter, shuffling stride.
- `biscuit`, `glasses`, `nap`, two frames each, granny-only idles: offering a biscuit tin, polishing her glasses with a
  hankie, a standing head-nod nap.

`sitters/gingham/sitter.json` lists her idles (`scripts/sync-sitter.py` copies them into her manifest row; a row's
`idles` replaces the default list, so it holds the seven defaults plus `knit biscuit glasses nap`). `review.py`
knows the four new pose names; a sitter without them is not "missing" them.

Polish (s2910): `nap_1`, `nap_2` gain a hand-placed "Z" (4 px grid, her outline colour, cream fill) that grows and
drifts up-right between the two frames; the figure is unchanged. `knitread_1`, `knitread_2` are the in-between of
`knit` and `read` (frame 1 lowers the knitting into her lap, frame 2 lifts the book with the knitting left on her lap),
Sol-drawn on the same chair at `knit`'s x. They are served (the manifest lists them) but nothing plays them yet; they
are not in her `idles`.
