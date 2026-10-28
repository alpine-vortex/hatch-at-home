# Character sprite review (2026-10-27)

Reviewed the 1,189 live stage, mood, and pose frames in the 13 ready species
folders under `custom_components/virtual_pet/frontend/sprites/`. The shelved
beetle and its incomplete baby-only set are not part of the live roster. The
review covered character identity and anatomy, expression, stage progression,
pair animation, cropping, and tone at native 256×256 size and in contact sheets.

## Findings

- **Bird:** `adult_asleep_2.png` had the two sleep marks clipped at the top edge.
  The marks are now fully inside the canvas; the bird and its y=224 baseline are
  unchanged.
- **Deer:** `teen_sick_1.png` had an ear tip clipped by the top edge. The frame now
  has a small clear margin above the ear and keeps the feet on the common baseline.
- **Luna moth:** `baby_asleep_2.png` had a weaker, uneven larva silhouette than its
  paired frame. Its body now follows the complete frame 1 silhouette with a small
  horizontal bob; frame 2's sleep marks are retained. I reviewed the baby, larva,
  and winged-moth stages together; the teen/adult wings are intact in the source
  sprites.
- **Squirrel:** a six-leg read was flagged in a user attachment. I reviewed the
  local pose family, but couldn't retrieve that image to identify the exact frame;
  I left the squirrel art unchanged rather than edit a potentially valid paw overlap.
- **Other live species:** no clear crop, anatomy, expression, palette, or tone issue
  that warrants changing an approved frame. The bat reads a little more serious
  than the other species at small size, but its face remains friendly and fits its
  nocturnal character. The moth's caterpillar-to-winged transition is intentional;
  the otter's floating pose and the froglet's tail loss are stage-appropriate.

Across the active roster, the chunky pixel outlines, transparent 256×256 canvases,
shared baseline, readable mood props, and two-frame idle movement feel consistent.
Sleep, sick, hungry, dirty, and excited poses remain gentle and suitable for a
family-facing virtual pet.

## Review tooling

`scripts/art/check.py` now reads palette-indexed PNGs as image data instead of
flagging their storage mode, and applies character crop/baseline checks only to
character and egg frames. This avoids false positives for full-scene water overlays
and ground decorations. The two repaired frames and all other live character frames
pass its size, baseline, and top-edge checks. The connected-pieces scan reports only
expected separate elements such as food bowls, TVs, bubbles, and sleep marks; no
transparent bands or broken body silhouettes were found.
