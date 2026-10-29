# World visitor sprite studies

24 small scene visitors: four associated with each world. These are draft art assets,
separate from the live pet sprites and not installed or wired into card behavior.

Each visitor has four transparent 256×256 frames:

1. `idle` — pause and look around
2. `walk_a` / `walk_b` — alternate for a small movement loop
3. `interact` — notice or greet the pet

Original 4×4 world atlases are preserved under `source/`. The row order and frame
paths are recorded in `manifest.json`; `build_frames.py` reproduces the extracted
frames. `preview.html` cycles through all four poses, and `contact-sheet.png` shows
the idle pose for every visitor.

| World | Visitors |
| --- | --- |
| Woodland | Raccoon, hedgehog, chipmunk, blue jay |
| Terrarium | Horned lizard, desert mouse, scorpion, cricket |
| Hearth | House sparrow, ladybug, painted lady butterfly, house mouse |
| Tidepool | Sea turtle, moon jellyfish, seahorse, shrimp |
| Pond | Blue darner dragonfly, water strider, koi, tadpole |
| Night Sky | Northern flying squirrel, striped skunk, nightjar, stag beetle |

These do not define interaction rules or when visitors appear; that can be decided
separately when the game is ready to use them.
