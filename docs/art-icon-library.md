# Icon library (concept, FM 2026-11-05)

One bulk art run that covers the shell-modes slice 4 icons now and a stock of
icons for later slices. Only set A ships into `frontend/ui/`; every other set
lands in `art/ui/library/<set>/` as a library until a slice uses it.

## Spec (all sets)

- 24 x 24 art-pixel grid, cut to 96 x 96 PNG (4x), transparent background,
  same style, outline and palette family as the current `icon_*` set.
- Bold silhouette, 1-art-px dark outline, 2-3 fills + a highlight. No text.
- Drawn as 3 x 3 sheets (9 per sheet), cut with `art/ui/cut_ui.py`.
- Contact sheet per set at 24 and 48 px on: cream `(255,247,236)` (care caps)
  and the game face `#c4e2f2` (mode caps), including blocked (0.6 opacity) and
  armed (pressed) looks for set A.
- Names: `icon_mode_*` (A), `icon_*_v2` / `stat_*_v2` (B), `icon_game_<game>_*`
  (C), `icon_util_*` and `glyph_*` (D), `icon_<world>_*` (E).

## A. Shell-mode keys (ships; slice 4)

Sheet A1: left, right, up, down, keep (basket), dig (trowel), special (sparkle;
must read with a number beside it), undo, restart.
Sheet A2: quit, lo, hi, plus alternates to choose from: special (star),
keep (full basket), dig (paw scoop), undo (curl arrow), restart (circle arrow),
quit (door).

## B. Improved current set (library, `_v2`, never overwrite live files)

Redraws of the 11 `icon_*` (feed, snack, play, clean, medicine, scold, praise,
status, journal, lights_on, lights_out) and the 7 `stat_*` (health, energy,
discipline, care_miss, heart full/half/empty). Same meaning, crisper read at
24 px, more consistent weight across the set. 2 sheets.

## C. Per-game sets (library)

- left_right: picker emblem; themed left/right (pointing paws).
- higher_lower: picker emblem (number card); themed lo/hi.
- dig: picker emblem; basket empty/full, leaf, trowel.
- hop: picker emblem; nest; hint marker that sits on the board (D9: never a
  ninth key); solved star.
- Shared results: win, lose, tie, streak flame, new best, play again, trophy.
About 3 sheets.

## D. Utility (library)

- Controls: gear, close, back, help, info, sound on, sound off, bell, timer,
  check, refresh, edit, trash, plus, minus, sleep (zzz), wake, camera, share.
- Pixel versions of the inline glyphs: heart, note, star, sparkle, sun,
  umbrella/rain, snow, cloud, storm, moon. Needs a code change to use (today
  these are text inside lines).
- Skip what `art/card-themes/home-assistant-icons/` already has (lock,
  calendar, light, door, climate, media, motion, plant, presence, appliance).
About 4 sheets.

## E. Shell variants (pilot only, then ask the owner)

D5 keeps one tint for game keys, so game keys get no per-shell versions.
Care icons may: a world-themed set (e.g. feed shows that world's food).
Pilot: woodland and tidepool, 9 care icons each (2 sheets). The other worlds
wait for the owner's look at the pilot.

## Budget

About 13 sheets, ~20-25 image calls with retries: well inside one 5-hour
window. Order: A, B, C, D, E. Stop at the first quota wall and resume after.

## What landed (run 2026-11-05, hatch-at-home-s2908)

Cut with `art/ui/cut_ui.py --lib <set> <sheetdir>`: it keys the magenta sheet, finds the sheet's
own art-pixel pitch and snaps each icon to it (no resample) when it fits 23 art px, else shrinks
it to 22 as the old cut did. Each set's contact sheet is `art/ui/library/<set dir>/contact.png`.

- **A** (`frontend/ui/icon_mode_*`, the ten of the shell-modes plan's 4A table, not wired into
  src): left, right, up, down, keep, dig, special, undo, restart, quit; 4-bit palette PNGs like
  the live icons. lo and hi (double chevrons) wait in `art/ui/library/a-modes/`, since 4A reuses
  down/up for them, with the alternates for the owner's pick: A2's special_star, keep_full,
  dig_paw, undo_curl, restart_circle, quit_door, and a bolder A3 sheet (special_v2, special_coin,
  special_twin, special_wand, undo_v2, restart_v2, dig_spade, keep_v2, quit_button). The weakest
  shipped key at 24 px is `special` (thin rays); `special_v2` or `special_twin` read stronger.
  The owner signs `art/ui/library/a-modes/contact.png` before merge (plan FM3).
- **B** (`library/b-v2/`, 18): crisper, but Sol drew them with chunkier pixels, so they are
  about 17-19 art px against the live set's 22 (three takes each; the biggest kept).
- **C** (`library/c-games/`, 27): the 22 named plus hop pad, sunk pad, stone, berry, shiny berry.
- **D** (`library/d-util/`, 36): 19 controls, 10 glyphs, plus umbrella, rainbow, wind, drop,
  flower, paw, gift. `glyph_rain`'s drops are recoloured blue by hand (`FIX` in cut_ui.py).
- **E** (`library/e-worlds/`, 63): the woodland and tidepool pilot, and (FM, for the weekly
  quota window) terrarium, pond, hearth, night sky and ocean for the owner to pick from.
