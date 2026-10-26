# Handoff (2026-10-26, updated in the second session)

Branch: `ccr-a5f628ca-979gik` (all work pushed; no PR opened). Version **0.6.1**.
Read the README first, then `docs/design-worlds.md`, `docs/entity-mapping.md` and
`docs/audit-2026-10-26.md`. The owner's original brief is not in the repo; its key rules
are restated across the README and the design doc.

## Where things stand

- **Done:** phases 0–3.
  - Test bench (`scripts/setup`, `scripts/test`, `scripts/develop` with stand-in
    entities in `dev/config`).
  - The living pet (`model.py`, every number in `rates.py`).
  - The device-shelf card (`frontend/hatch-pet-card.js`, loaded automatically through
    `add_extra_js_url`).
  - Home awareness: `home.py` holds the pure rules and `watcher.py` reads entities.
    The options flow lives in `config_flow.py`.
- **Worlds:** Woodland (bird ✅, Douglas squirrel ✅) and Terrarium (leopard gecko ✅;
  tarantula pending). Hearth, Tidepool, Pond and Night Sky are listed in
  `frontend/worlds.json` and stay hidden until a creature is ready. The beetle is shelved;
  its partial art is in `art/beetle/`.
- **Tests:** 73, run with `scripts/test`. Each logic bug from the audit has a
  regression test.

## Open items, in priority order

1. ~~**The card sometimes doesn't appear.**~~ Fixed in 0.6.1. Once HA's service
   worker caches the card module, it can run before the frontend installs its scoped
   custom element registry, so the card was defined in a registry Lovelace never asks.
   The card now defines itself after `<home-assistant>` is defined. Playwright reloads
   of the bench: 11 of 15 bad before, 0 of 25 after.
2. ~~**Unverified CSS fix (garland size, egg labels)**~~ Checked at 320, 360, 412, 520
   and 900 px: the garland sits low on the cap and every bottom label stays inside the
   egg. Screenshots sent to the owner. The trim itself is still the owner's call.
3. **The flaky test is not pinned down.** `tests/conftest.py` now seeds the
   coordinator's rng (`PET_SEED` picks another seed). A sweep of seeds 0–60 passed every
   time, which argues *against* the rng being the cause. If it flakes again, save the
   full failure output; the next suspects are wall-clock time and task timing.
4. **Phase 4 (not started):**
   - adult forms per species
   - traits learned from the house (night owl, music lover, homebody)
   - generations and per-world journals
   - sky events: moon (the `sensor.home_moon_*` entities) and BirdNET visits (see
     `docs/entity-mapping.md`, including the stalled `last_bird` feed and the fallback)
   - optional notifications and a chirp sound
5. **Art queue with Sol** (an image agent in another session, which can't reply here):
   - tarantula probe, then the four new worlds (probe, review, batch)
   - more trim if the owner likes the woodland test
   - The owner forwards share links like `the owner's file share/share/hatch-…`.
   - Download recipe: POST `/api/shares/<id>/token`, GET `/api/shares/<id>` for the
     file list, then GET `/api/shares/<id>/files/<file id>` with the cookie.
   - Check the sha256 in the share description.
   - Check every sprite: 256×256 RGBA with the bottom at y=224, and props 128×128.
   - Make a contact sheet and look at it. The beetle failed this review twice.
   - Copy only the finished PNGs into `frontend/sprites/<species>/` and write its
     `species.json`. Keep prompts and scripts in `art/`, but not Sol's tool logs (they
     contain local paths).
6. **The owner's live HA:** the repo is public and packaged for HACS (custom repository,
   type Integration); v0.6.1 is the first release. Release by bumping the version and
   running Actions → Release (this session can't push tags, but can dispatch it). The
   repo has no license yet; `validate.yml` skips HACS's license check until the owner
   picks one. Manual copy still works, after taking a backup. Their suggested options are in the README's
   "Connect it to your house" tables. Remind them to delete the old manual card resource
   from 0.3.x.

## Conventions the owner cares about

- Never develop against their live HA. Use `scripts/develop`; the onboarded test user
  is `dev` / `devdevdev`.
- Verify UI changes in the browser (Playwright plus Chromium are preinstalled), and
  send screenshots.
- Commit attribution: no `Co-Authored-By` trailer; keep the `Claude-Session:` line.
- Messages to Sol go through `send_message` to `(Sol's session ID: ask the owner)` (this
  session was granted access to the owner's other sessions; a new one may need the owner's
  approval again). Sol can't reply here; the owner relays share links.
