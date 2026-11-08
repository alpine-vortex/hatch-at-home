# Review: device charm plan (2026-11-07)

Reviewed `docs/plan-2026-10-29-device-charm.md` against current main (v0.48.0 era).

## Main finding: nothing to build

The plan is already built. Its own status table (2026-10-31) lists D1 to D6 and
Part 4's shell picker as shipped in 0.36.0, and the code agrees:

| Part | Where it lives now |
|---|---|
| 1a grid, `hatch-lcd`, off under `prefers-contrast: more` | `src/card/style.js` (`.lcd`, `lcd-on`), `src/card/prefs.js` |
| 1b ghosting (not a `.pet`, JS-gated for reduced motion and contrast) | `src/card/card-tick.js` (ghost, `_waapi`), `style.js` |
| 1c backlight (3 s `lit` hold, `_chirp(s, "click")`, no server call) | `card-tick.js` `_backlight`, `card-layout.js` placement per shell, `ui-copy.js` `BACKLIGHT_MS` |
| 2a infrared link | `src/card/card-link.js` (`LINK_AFTER_MS`, `_chirp(host, "link")`) |
| 3a boot screen | `src/card/boot.js` |
| 3b `powered_on` | `coordinator.py` (`_powered_on`, `_house_view`), `card-base.js` `_powerNews` |

The task brief ("build Part 1a as its own change") was written from the stale
plan body, so I built nothing and made no card change. Building 1a again would
duplicate shipped code.

## Review of the plan text against current code

- **Anchors are all stale.** Every line number is for `29d77c2` and the card has
  since been split from one file into `src/card/*.js` modules (the shipped card
  is generated from them). Use function names only: `_buildSlide`, `_tick`,
  `_free`, `_chirp`, `_mayPlay`, `_powerNews`, `_backlight`.
  The status block at the top is the trustworthy part; the body is historical.
- **Z-index and bubble clash (1a/1c).** Checked in the shipped CSS: `.lcd` and
  `.glow` are hidden by `.screen.show-status` and `.slide.empty`, and the
  prefers-contrast rule hides `.lcd` and `.ghost`. No clash found.
- **Reduced motion (1b, link, gag).** The ghost's WAAPI animation is not stilled
  by the global CSS rule, so `card-tick.js` checks reduced motion and contrast in
  JS before starting it (comment at the ghost code says so). Correct.
- **Sound gate.** Backlight click and link chirp go through `_chirp`, which
  applies `_mayPlay` (quiet hours, asleep, lights out). Correct. Boot beep is
  tap-gated by design.
- **Stat/mood.** None of the shipped pieces writes a stat; the backlight makes
  no service call. Plan wording matches.
- **Private data.** `house.powered_on` carries only a timestamp, goes to shared
  screens on purpose. No leak found.
- **Restart detection.** Uses `hass.state is not CoreState.running` rather than a
  downtime threshold, as planned. The hole the plan names (5-minute
  `last_updated`) is avoided.
- Not re-run here: card-check and the test suite were not run, since no code
  changed. The shipped features have card-check coverage (316 matching lines in
  `scripts/card-check.js`).

## What remains (from the plan itself)

- Persona link-line variants (same slice as personality's "kindred pairs"). Unblocked.
- Q5: links across separate cards (deferred by the owner).
- Q6: the wave pose (`acts.wave` plus one `STAGE_POSES` hook; owner put it first
  in stage 2; art is fifth in the Luna queue, owned by another agent).
- Part 4: per-pet shell picker (after the settings gear) and earned-by-stage shells.
- Doc hygiene: the plan body could be trimmed to a "what shipped" note with the
  line numbers dropped, since it now misleads.
