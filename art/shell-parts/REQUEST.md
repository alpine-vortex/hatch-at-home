# Shell parts: a request for the art session

The six device shells (egg, tank, house, porthole, pad, moon) are drawn by the
card in CSS, on the creatures' own pixel grid: one cell per art pixel, 2 CSS px
on a 420 px card (1.5 or 2 px on a narrower one, always whole device pixels).
The small hardware sits in named slots. Each slot shows a stand-in drawn in code
(`HW_ART` in `hatch-pet-card.js`) or a hand-reduced mark (`cut_marks.py`). A PNG
of the same size replaces either one.

## How a part is drawn and tinted

- **One PNG pixel per art pixel**, transparent background, at the size listed.
  The card scales it up on the grid. Don't draw it bigger.
- **Greyscale with a dark outline** (near black, about `#222`), except the world
  emblems, which can be full colour.
- **Tinting is hard-light over the slot's colour.** 50% grey (`#808080`) comes
  out as the shell colour itself. Lighter greys lift it toward white, darker
  greys shade it toward black. Pure white stays white and the outline stays
  dark. So draw the part's lit side above mid-grey and its shaded side below.
- The alpha channel cuts the part out. Half-transparent pixels are fine for the
  glare.
- Light comes from the top left, as on the rest of the shell.

To swap one in: save it under `custom_components/virtual_pet/frontend/ui/`.
Then point the slot's `--hw-<name>` at it, either where the card sets the
variables in `_build` (look for `--hw-`) or in the slot's own CSS rule.

## The slots

Sizes are in art pixels (cells). Every reference crop is in `ref/`, taken from
the card at 420 px and 2× pixel ratio, then enlarged 2×.

| Part | Slot / variable | Size | Tinted from | Where, on which shapes | Now | Reference |
| --- | --- | --- | --- | --- | --- | --- |
| Screw, front, a slight angle on the slot | `.hw.screws`, `--hw-screw` | 5 × 5 | shell | All four body corners of the tank, house, porthole and moon, 4 to 7 cells in. The egg and pad snap shut, so they have none. | code stand-in | `ref/screw.png` |
| Speaker grille | `.hw.grille` (left and right), `--hw-slot` | one slot is 2 × 5 (the slot plus a 1-cell gap), tiled 5 times each side | shell | Bottom centre of every shape, either side of the logo | code stand-in | `ref/grille_logo.png` |
| Power light, on | `.hw.light`, `--hw-light-on` | 5 × 5 | red `#e8584a` | Left of the screen at its middle, in the body's margin, every shape | hand-reduced from `source/shell_marks.png` | `ref/power_light.png` |
| Power light, off | `--hw-light-off` | 5 × 5 | red `#e8584a` | Same place, shown while the lights are out | hand-reduced from `source/shell_marks.png` | — |
| HATCH egg logo | `.hw.logo`, `--hw-logo` | 7 × 9 | shell | Bottom centre between the grilles, every shape | hand-reduced from `source/shell_marks.png` | `ref/grille_logo.png` |
| Bezel stripes, printed | `.hw.stripes`, `--hw-stripes` | 1 × 3 (two 1-cell lines with a gap), tiled across | bezel | Across the top of the bezel, 18% to 82% of its width. Not on the porthole, whose ring has rivets. | code stand-in | `ref/bezel_stripes.png` |
| Backlight bulb (shape only) | `.backlight::after`, `--hw-bulb` | 5 × 7 | filled with the shell's dark tone, teal when lit | On the backlight's domed cap (9 × 9 plus a 2-cell side), at each shape's spot | hand-reduced from `../ui/source/backlight_btn.png` | `ref/backlight_cap.png` |
| Glitter fleck, 2 to 3 frames | `.hw.flecks` a, b and c, `--hw-fleck` | 5 × 5 a frame | each set its own: gold `#fff6c8`, pink `#ffd2e6`, mint `#c8f6e6`. The alpha only is used for now. | About 11 spots in the body's margins, three sets twinkling slowly out of step. A frame strip (5 × 5 per frame, side by side) can replace the opacity twinkle. | code stand-in | `ref/glitter_flecks.png` |
| Clear-finish glare streak | `.hw.glare`, `--hw-glare` | 8 × 8 | white, at 60% | Upper right of the body, clear finish only | code stand-in | `ref/clear_glare.png` |
| Battery-door seam | (no slot yet) | about 24 × 12, a rounded rectangle with a thumb notch | shell | Proposed: the lower body, under the buttons, on the tank and house | not placed | — |
| Small name plate | `--hw-plate` | 12 × 7, ends of 3 cells and a middle that stretches | shell | Proposed: behind the world label when a world has no `trim.plate` (all six have one today) | hand-reduced from `source/shell_marks.png`, not shown yet | — |
| World emblem: woods, home, night, pond, tide, terra | (no slot yet) | 9 × 9, **full colour** | — | Proposed: one on each body, low left, beside the grille | not placed. The card header uses `ui/emblem_<world>.png` at 32 px. | — |

## Not slots

These are cut by the card from the shell colour and need no art: the body,
bezel, lid, feet, loop, roof, crescent and button caps, with their outline,
light and shade bands, dither and the parting seam. The porthole's rivets, the
pad's notch and veins, and the clear finish's board are cut the same way.
