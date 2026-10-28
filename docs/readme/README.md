# README art: style guide

The repo's front page reads like the back of a Tamagotchi box. This folder holds
its pictures, the screenshots they're built from, and this guide to the look,
so the next change can match it.

| Path | What |
| --- | --- |
| `*.png` (here) | The seven finished images the README shows. Generated; never edit by hand. |
| `src/` | Screenshots of the real card that the images are built from (committed, so the art can be redrawn without running Home Assistant). |
| `scripts/readme/art.py` | Draws every image from `src/` plus the card's own sprites, icons and font. |
| `scripts/readme/shots.js` | Retakes the per-world device shots in `src/`. |
| `docs/guide.md` | The full reference. Every claim on the box must agree with it. |

**Redraw:** `python3 scripts/readme/art.py` from the repo root (needs Pillow, and
fontTools with brotli for the woff2 font: `pip install pillow fonttools brotli`).
It's deterministic: the same inputs give byte-identical PNGs.

**Publishing:** the README links its images by raw URL on `main`
(`https://raw.githubusercontent.com/alpine-vortex/hatch-at-home/main/...`), so HACS
can show them too. A new or renamed image shows up only after it reaches
`main`; until then the PR preview shows a broken image. Keep the file names
stable when you can.

## Voice

- **Box-back copy:** short, upbeat and full of exclamation marks. Speak to the
  owner ("your pet", "it calls for YOU!").
- **Headings:** in the README, ALL CAPS behind one emoji or a ★ pair
  (`## 🥚 IT'S HATCHING!`, `## ★ FEATURES ★`). In the images, ALL CAPS on a
  label box ("CHOOSE YOUR WORLD!").
- **Feature items:** an icon, a **bold exclamation** title, `<br>`, then one or
  two sentences. Each item is its own paragraph inside the two-column table.
- **Never invent mechanics.** Marketing may exaggerate tone, never facts. Check
  each claim against `docs/guide.md` or the code. Mistakes caught in review so far:
  "keep it warm" (eggs hatch on a timer), "yawns when the lights go out" (it
  says good night; it yawns at a late TV), "spooky seasons" (only Halloween
  exists).
- **Creature names** come from `sprites/<species>/species.json` `name`,
  shortened (Bird, not Robin; Deer, not Fawn). `NAMES` in `art.py` holds the
  short forms.
- **Numbers on the box:**
  - 6 worlds, 13 creatures and 16 traits.
  - The stage times: egg → baby 30 min → child 1 day → teen 5 days → adult 14 days.
  - The 20-minute call window, and three wins out of five rounds in a game.

  If any of these changes, update the README text *and* the image text (see
  "When the game changes").
- **Keep the owner's personal details out:** no real entity IDs, names,
  places or hostnames. The screenshots show the dev user "Dev" and the dev pets.

## Palette

Defined at the top of `art.py`. Use these, not new colours.

| Name | Hex | Used for |
| --- | --- | --- |
| `PINK` | `#ff6faa` | Hero and "life" sunbursts (dark ray) |
| `PINK_LT` | `#ff96c4` | Same sunbursts (light ray) |
| `PINK_DK` | `#d6337a` | Heading shadows, ribbon tails, arrows, world names, small accents |
| `YELLOW` | `#ffd640` | Heading text, burst badge, ground-strip edge, "grow" sunburst |
| `YELLOW_DK` | `#f5a623` | Ground shadows under the growth sprites |
| `CYAN` | `#3ec6e0` | "Collect" sunburst (light ray `#6ed6ec`) |
| `PURPLE` | `#3b1f4a` | The ink: label boxes, outlines, hard shadows, body text, ground strip |
| `CREAM` | `#fff6e0` | Calm panels ("worlds" background, "collect" cards) |
| `WHITE` | `#ffffff` | Sparkles, tile borders, pill text |
| `RED` | `#e8343c` | Burst badge text only |
| (house) | `#7e68de` / `#9682ec` | "Knows your house" sunburst |
| (dots) | `#ffdec8` | Dot grid on the "worlds" background |

The "grow" sunburst's light ray is `#ffe26e`.

## Type

**Tiny5 only**, the card's own pixel font
(`custom_components/virtual_pet/frontend/fonts/Tiny5.woff2`). `font(px)` sets a
size in *font pixels*: one font pixel is `px` screen pixels, the point size is
`px × 8` and capitals are 5 font pixels tall. Keep `px` a whole number, or the
glyphs blur.

| px | Use |
| --- | --- |
| 30 / 17 | Hero logo "HATCH" / "AT HOME!" |
| 10 | Image headings (on a label box) |
| 8 | "NEW!" in the burst |
| 5–6 | World names, stage names, ribbon and strip text, "AGES 8 TO 108" |
| 4 | Captions on pills, the burst's second line, world names on the collect cards |
| 3 | Creature names, stage times, footer small print |

## Frames and pieces

Each one is a function in `art.py`; reuse them rather than drawing anew.

- **`sunburst(w, h, cx, cy, a, b, rays)`:** alternating rays from a centre.
  It's the box's loud background. Use two tints of one hue, never two hues.
- **`sparkles(img, n, seed, box)`:** white four-point pixel stars. Seeded, so
  each image's stars stay put between redraws. Keep them out of text areas (pass
  a `box`).
- **Heading label:** `pixel_text(..., fill=YELLOW, box=PURPLE, shadow=PINK_DK,
  anchor="ma")`. Text sits on a purple box padded by 2 font pixels, with a hard
  pink shadow offset down-right. Headings are centred at `y = 30`.
- **`ribbon(img, cx, y, text, px)`:** a purple band with pink swallowtails, for
  the tagline.
- **`burst(img, cx, cy, r, lines)`:** a yellow starburst badge with red text,
  outlined in purple with a purple drop shadow ("NEW! 6 worlds").
- **`drop(img, tile, xy, radius, border)`:** the standard frame for a screenshot.
  It has rounded corners, a white border (6–10 px) and a hard purple shadow
  offset 10 px down-right, with no blur. Every screenshot goes in one.
- **`pill(img, xy, text, px=4)`:** a white caption on a purple rounded pill,
  under a framed screen.
- **Ground strip** (hero): a purple band with an 8 px yellow top edge. The cast
  stands on it.
- **Sprites:** `sprite(species, frame, size)` scales the card's 256×256 sprites
  with nearest-neighbour, so pixels stay square. Use sizes that divide well:
  136, 168, 256. The feet of every sprite sit at y = 224 of 256.
- **Screenshots:** scale them with Lanczos (`scale_w` / `scale_h`), since they
  aren't pure pixel art.
- **Output:** every image is 1600 px wide, quantised to 256 colours without
  dither (`save`). That keeps each one under about 200 KB.

## The images

| File | Canvas | Background | Contents | Sources |
| --- | --- | --- | --- | --- |
| `hero.png` | 1600×860 | Pink sunburst centred at (520, 330), 32 rays | Logo "HATCH"/"AT HOME!" top left. Tagline ribbon and "for Home Assistant". "NEW! 6 worlds" burst bottom left. Hearth and Woodland devices tilted +7° and −6° on the right. All 13 child sprites on the ground strip, and "feed it! play with it! tuck it in!" on the strip. | `src/world-hearth.png`, `src/world-woodland.png`, the sprites |
| `worlds.png` | 1600×780 | Cream with a dot grid | "CHOOSE YOUR WORLD!". Six framed devices 214 px wide in six columns, each with its world name and creatures below. | `src/world-*.png` |
| `grow.png` | 1600×560 | Yellow sunburst from below centre | "WATCH IT GROW!". The kitten's five stages (256 px) on orange ground shadows, with pink arrows between, and the stage name and time under each. | Kitten sprites (egg is `egg_idle_1`, the rest `*_content_1`) |
| `collect.png` | 1600×900 | Cyan sunburst | "COLLECT ALL 13!". Six cream cards, one per world, each with its emblem and name, and the adults at 168 px. Two-creature worlds fill the third slot with their egg and "which one?". | `ui/emblem_<world>.png`, `adult_content_1`, `egg_idle_1` |
| `play.png` | 1600×980 | Pink sunburst | "A LIFE OF ITS OWN!". Six framed screens (420 px wide) in a 3×2 grid, each with a pill caption. | `src/04a-greeting`, `04a-pick`, `04c-higher-lower`, `02-status`, `05-wish-granted`, `03-journal` |
| `house.png` | 1600×980 | Purple sunburst | "IT KNOWS YOUR HOUSE!". The same grid. | `src/05-forecast`, `05-watching`, `05-first_snow`, `05-sunset`, `05-trait_learned`, `05-halloween-extras` |
| `footer.png` | 1600×300 | White with a 6 px purple border | A barcode (the bits of "HATCH AT HOME"), "AGES 8 TO 108" and the small print, with a bird egg on the right. | Bird `egg_idle_1` |

The screen tiles are cut from the 660×1070 Woodland device shots with
`screen()`: the box `(38, 238, 622, 688)` holds the LCD plus its cream bezel. If the
card's layout moves, re-measure it: the bezel colour is `#f3ead7`.

## Retaking the screenshots

Only needed when the card's look changes. Everything runs against the throwaway
HA (`scripts/setup` once, then `scripts/develop`).

1. **Feature screens** (the 12 `src/0*.png` files): run `SCALE=2 scripts/card-check`.
   It shoots the Woodland pet at 2× into `dev/card-check/`. Copy the twelve files
   named in the table above into `docs/readme/src/`.
2. **Daylight:** the dev config's time zone is America/Los_Angeles. If it's
   night there, the scenes are dark and the pets asleep. Temporarily set
   `time_zone`, `latitude` and `longitude` in `dev/config/configuration.yaml`
   to somewhere in daylight (Asia/Tokyo, 35.68, 139.69 worked) and restart
   `scripts/develop`. **Put the file back before committing.**
3. **World devices:**
   - `node scripts/readme/shots.js setup` adds Terrarium, Tidepool, Pond and Night
     Sky pets and fast-forwards them to children.
   - `node scripts/readme/shots.js care` gets every pet rested, fed and happy,
     and prints each mood. *Sleepy* everywhere means it's evening or night in
     HA's time zone (step 2). If a pet is still sick, run `care` again.
   - `node scripts/readme/shots.js shoot` writes `src/world-<world>.png`.
     `SEASONAL=1` writes `halloween-<world>.png` instead (not used yet).
4. **Redraw and look:** run `python3 scripts/readme/art.py`, then open every
   PNG before committing.

## When the game changes

- **A new creature:**
  - Add it to its world's roster in `WORLDS` and to `NAMES`.
  - Update the counts: "COLLECT ALL 13!" in `collect()` and "13" in the README
    (the features and the collect alt text).
  - `hero()` spaces the cast automatically. Past about 16 creatures, shrink the
    sprite size.
  - `collect()` fits three per card. A fourth needs a smaller `slot`.
- **A new world:**
  - Add it to `WORLDS`, plus the `src/world-<key>.png` shot and its UI emblem.
  - The six-column layouts in `worlds()` and `collect()` assume six worlds; at
    seven, narrow `col` and the device width.
  - Update "6 worlds" in the hero burst and the README.
- **A new season or feature:** swap a tile in `play.png` or `house.png`.
  Take the screen with card-check, copy it to `src/` and change the item list
  at the bottom of `art.py`. Keep it six tiles.
- **Text changes in the images** live in `art.py` only. Search for the
  string.
