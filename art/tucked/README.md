# Tucked-in blanket set (s2799; probe s2777)

Bespoke tucked-in blanket art per species and stage, to replace the shared `ui/drape_*` (owner
rejected it 2026-11-03; chose bespoke over no blanket). Art only: nothing here is wired into the
card, `species.json` or any copy yet.

One blue quilt-patch blanket on every pet: checkerboard of two dusty blues, cream stitch dots,
lighter hem binding, dark navy outline, one fold. One contiguous piece lying over the body.

Per `<species>_<stage>` (every hatched stage of every species that has an asleep frame):

- `<species>_<stage>_tucked_comp.png`: **the one to use.** The SHIPPED `<stage>_asleep_1.png`
  with only the blanket composited over it (256x256, feet y=224 as shipped). Face, fur, eyes and
  everything outside the blanket are exactly the shipped sprite's pixels. `comp.py` builds it:
  blanket mask = blue/navy pixels of the tucked frame below, closed on the 64x64 art grid, holes
  filled, largest piece only, clipped to the original's silhouette (so it never widens the pet).
  On the water pets (duckling, otter) pixels already water-blue in the original are not blanket.
- `<species>_<stage>_tucked.png`: the source of that mask. Sol (`gpt-6.1-sol`) redrew the asleep
  frame (asleep_1 and asleep_2 as references) with the blanket on it; `cut_tucked.py` keys the
  grey, scales to the asleep frame's width, puts the feet on y=224 and snaps to the 4 px art grid
  (28 colours). Not for use itself: the redraw loses the original's finer detail.
- `source/*_raw.png`: Sol's raw output on flat grey, stored at 512x512 and 64 colours to keep the
  repo small (the full 1024 px files are in the worker archive).
- `SHA256SUMS` lists every file.

Reworked frames (the first try failed the reject rule: tiny blanket, blanket over the tail,
blanket hanging below the body) are listed in the s2799 report. Prompts and the call log are
not committed.

Beetle has only a baby stage, so it has one frame.

## Owner review 2026-11-03

Merged only the species where the blanket drapes over a lying body. Rejected (the blanket reads
as a flat patch on an upright or odd-shaped pet), removed from the repo, to be redrawn as bespoke
sleeping poses: octopus, hermitcrab, treefrog, tarantula, bird, owl, bat, lunamoth, firefly,
puffin.
