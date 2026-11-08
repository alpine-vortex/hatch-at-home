# Art wiring status (2026-11-07)

What is drafted in `art/` versus wired into the card (`src/card/`, `frontend/ui/`). Read from committed
files only. Update this when a pack moves.

## Summary

| Pack | Where | State |
|---|---|---|
| Shared effects pack (35 effects x 4 frames) | `art/effects/` | **Started**: 1 of 35 wired (`sparkle`); 34 drafted |
| World visitor sprite studies (24 x 4 frames) | `art/visitors/` | **Superseded draft**: the card's visitors are the v1 roster (18, 72 px, `ui/visitor_<world>_<id>_<n>.png`); the studies are not needed unless the owner wants the roster widened |
| Seasonal (halloween, thanksgiving, winter, party) | `art/seasonal/` | Wired (`ui/season_*`, card-season) |
| Care-scene props | `art/props/` | Wired (`ui/prop_broom/dust/net/bubbles`, card-care, card-moment) |
| Shell parts | `art/shell-parts/` | Wired (`ui/shell_*`, card-build's hardware slots; REQUEST.md lists the still-stand-in parts) |
| Conservation, item sheets | none | No `art/conservation` or `art/item-sheets` exists in the committed tree; nothing to inventory. If they live only in the owner's Codex checkout they are untracked and untouched |
| Other generators (finds, flair, drape, birthday, trim, tucked) | `art/` | Wired earlier (their outputs are in `frontend/ui/`); not re-audited here |

## Effects pack, effect by effect

Draft frames: `art/effects/frames/<name>_<1..4>.png` (256 x 256, soft-alpha AI art, about 5,000 colours per
frame, so not palette-exact like the rest of `ui/`; `tests/test_frontend_png_palette.py` lets it through
because the >256-colour test passes). Draft provenance: an OpenAI Codex session, 2026-10-28; **no
owner sign-off recorded.**

- **Wired:** `sparkle` -> `ui/fx_sparkle_1..4.png`, played by `_fxPack` over the birthday and
  "friends for" celebrations (`_sparkleFx`: the existing ring, then the loop). None under calm.
- **Drafted, overlaps art the card already has (low value to wire):**
  care actions `feed`, `snack`, `play`, `clean`, `medicine`, `praise`, `scold`, `tuck_in` (each has a
  prop or care scene already); weather `rain`, `drizzle`, `heavy_rain`, `snow`, `fog`, `wind`,
  `thunderstorm`, `hot`, `cold`, which the device-fx glass/rain recipe and the screen heat/cool wash
  already draw (docs/plan-2026-11-06-director-migration.md).
- **Drafted, no card home yet (natural next ones):** emotions `calm`, `happy`, `sad`, `scared`, `hungry`,
  `surprised`, `tired`, `stressed`, `proud`, `frustrated` (a mood badge over the pet when a line is said or
  a wish shows); flair `shimmer`, `swirl`; weather `sunny`, `hail`, `sleet`, `overcast`, `rainbow`
  (a weather chip, or the rainbow after rain).
- To wire another: copy `art/effects/frames/<name>_<n>.png` to `frontend/ui/fx_<name>_<n>.png`, add it to
  `FX_PACK` in `src/card/world.js`, call `this._fxPack(s, "<name>")` from the one place that should show it.
  `tests/js/fx_pack.test.js` checks every shipped name has its four frames and is in the manifest.

## Blocked on the owner

- Sign-off that the effects pack looks right at card size (and whether to quantise it to an exact palette;
  that is lossy, so it needs a look).
- Which effects the owner wants as a mood badge, and where.

## Remaining wiring items

1. Emotion badges (10 effects): decide the trigger (line said, wish shown, bond moment).
2. Weather chip or the `rainbow` after rain, `sunny`/`hail`/`sleet`/`overcast` (needs the weather mapping).
3. Flair `shimmer`/`swirl`: could replace or join the trait flair moments.
4. Care-action effects: only if the owner prefers them to the current props.
5. Visitors: nothing to wire unless the roster grows past 18.
6. Palette cleanup of the shipped `fx_*` frames once the owner approves the look.
