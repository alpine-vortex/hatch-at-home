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
