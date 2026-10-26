# Handoff (2026-10-26, end of the first session)

Branch: `ccr-a5f628ca-979gik` (all work pushed; no PR opened). Version **0.6.0**.
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

1. **The card sometimes doesn't appear.** The test dashboard showed "Configuration
   error" in place of the card on some page loads, while `customElements.get(...)` was
   true and a manual import worked. Not yet reproduced reliably.
   - Suspect: the card module (from `add_extra_js_url`) defines the element after
     Lovelace builds the card, and the error card isn't rebuilt.
   - Investigate with `/tmp`-style Playwright scripts like the ones described below.
   - A likely fix: `window.loadCardHelpers` or a `ll-rebuild` event, or registering the
     card JS as a Lovelace resource as well.
2. **Unverified CSS fix for the owner's feedback (committed with this note,
   not yet checked in a browser):**
   - The woodland garland was "too big and too high". It's now 192×57 (3 CSS px per art
     pixel) at `top: -12px`.
   - The bottom row's labels were cut off by the egg's curve. The fix is
     `.egg .buttons { width: 88% }` and more bottom padding.
   - Check both in the browser at 320, 360, 412, 520 and 900 px, and send screenshots
     to the owner. The trim itself is still an experiment the owner is judging.
3. **A flaky test:** about 2 failures in ~25 suite runs, never reproduced on demand.
   Likely cause: the coordinator uses a real `random.Random()`, so a random fake call or
   a poop-sickness roll can change a mood assertion in `tests/test_init.py`. Fix: seed
   or stub `coordinator.rng` in the test `setup` helpers.
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
6. **The owner's live HA:** they install by copying `custom_components/virtual_pet/` and
   restarting, after taking a backup. Their suggested options are in the README's
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
