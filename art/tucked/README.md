# Tucked-in blanket probe (2026-11-03, s2777)

A probe, not shipped: bespoke tucked-in blanket art per species, to replace the shared
`ui/drape_*` (owner rejected it: "flat cream slab, no fold or pattern, the kitten sinks into it").
Nothing here is wired into the card, `species.json` or any copy.

Five pets, one blue quilt-patch blanket (checkerboard of two blues, cream stitch dots, lighter
hem binding, dark navy outline, a fold): kitten baby, gecko adult, owl teen, octopus adult, fox adult.

Per pet:

- `<species>_<stage>_tucked.png`: the full replacement sprite. Sol (`gpt-6.1-sol`) redrew the
  pet's asleep frame with the blanket on it (the asleep frames were the image references);
  `cut_tucked.py` keys the grey, scales to the asleep frame's width, puts the feet on y=224 and snaps
  to the 4 px art grid (28 colours).
- `<species>_<stage>_tucked_comp.png`: the same blanket pasted over the ORIGINAL asleep frame
  (`comp.py`: blue pixels of the tucked frame, closed and hole-filled, replace the original's pixels).
  Face, fur and eyes are exactly the shipped sprite's. It keeps the original's finer-than-4 px detail,
  so it is not a uniform 4 px grid (the shipped sprites are not either).
- `fox_adult_tucked_B*.png`: fox rework (tail kept visible; the blanket shrank to a saddle patch).
- `source/*_raw.png`: Sol's raw output on flat grey. `SHA256SUMS` lists every file.
- `sheet.py OUT.png .` renders the review sheet (existing | old shared drape | tucked day | tucked
  at `brightness(.8)` on the dim room | composite).

Prompts and the call log are not committed (see the private notes).
