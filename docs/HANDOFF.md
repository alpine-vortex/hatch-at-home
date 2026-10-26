# Handoff (2026-10-26, end of the second session)

Branch: `ccr-a5f628ca-979gik`, which is also the repo's default branch (all work
pushed; no PR). Version **0.6.1**. Read the README first, then `docs/design-worlds.md`
and `docs/audit-2026-10-26.md`. The owner's original brief is not in the repo; its key
rules are restated across the README and the design doc.

**The repo is public. Keep the owner's personal details out of it**: real entity IDs,
location, hostnames, session IDs, people's names. They live in a private Artifact on the
owner's account, **Hatch house notes** (find it with the Artifact tool's `list`, then
`read` it): the entity mapping for their house, BirdNET notes, the file-share host and
Sol's session ID. History was rewritten on 2026-10-26 to remove them, and the GitHub
repo was deleted and recreated so the old commits are gone too. Scan anything from Sol
or the owner for such details before committing it.

## Where things stand

- **Done:** phases 0–3, plus HACS packaging.
  - Test bench (`scripts/setup`, `scripts/test`, `scripts/develop` with stand-in
    entities in `dev/config`).
  - The living pet (`model.py`, every number in `rates.py`).
  - The device-shelf card (`frontend/hatch-pet-card.js`, loaded automatically through
    `add_extra_js_url`). It defines itself after `<home-assistant>` is defined: once
    HA's service worker cached the module, it could run before the frontend's scoped
    custom element registry existed and Lovelace never found it ("Configuration
    error"). Fixed in 0.6.1 and checked with Playwright reloads (11/15 bad → 0/25).
  - Home awareness: `home.py` holds the pure rules and `watcher.py` reads entities.
    The options flow lives in `config_flow.py`.
  - HACS: `hacs.json`, install and update steps in the README,
    `.github/workflows/validate.yml` (HACS action, hassfest, tests; green) and
    `.github/workflows/release.yml`. Actions minutes are free on a public repo.
- **Worlds:** Woodland (bird ✅, Douglas squirrel ✅) and Terrarium (leopard gecko ✅;
  tarantula pending). Hearth has the kitten imported but not ready. Tidepool, Pond and
  Night Sky are listed in `frontend/worlds.json` and stay hidden until a creature is
  ready. The beetle is shelved; its partial art is in `art/beetle/`.
- **Woodland trim:** the smaller, lower garland and the egg's bottom labels were checked
  at 320–900 px and shown to the owner, who was happy with it. More trim is the owner's
  call.
- **Tests:** 73, run with `scripts/test`. `tests/conftest.py` seeds the coordinator's
  rng (`PET_SEED=n` picks another seed).

## Open items, in priority order

1. **No GitHub release exists yet.** The recreated repo never registered
   `release.yml`: only Validate appears under Actions, and dispatching Release returns
   404, even after a second push. This session can push only its branch, not tags.
   Last time, the owner was asked to make the release by hand: Releases → Draft a new
   release → tag `v0.6.1` on this branch → Generate release notes → Publish. They were
   also told to check Settings → Actions → General → Workflow permissions ("Read and
   write"). Check whether that happened, and whether Release now shows under Actions.
   Until a release exists, HACS installs from the branch. Still true on the third
   session's check; the owner was given the same steps again. `release.yml` now exits
   green when a tag push finds its release already published by hand.
2. **Art from Sol, still in progress.** The tabby kitten (Hearth) is in
   `frontend/sprites/kitten/` with `"ready": false`; review notes are in
   `art/README.md`. Sol was asked (2026-10-26) for one zip containing:
   - `teen_content_1` redrawn at `teen_content_2`'s size (it's about 20% bigger, with
     the ears clipped at y=0, so the idle animation pulses);
   - Hearth's egg: `egg_idle`, `egg_wiggle`, `egg_crack`, two frames each (the kitten
     is first on Hearth's roster, so it supplies the egg);
   - Hearth backgrounds, 512×384: `bg_day` required; `bg_night`, `bg_rain`, `bg_dim`
     welcome;
   - optionally, `teen_sick` frames at the other teens' size.
   When the owner relays the link: download, review, add the files, add `egg` and
   `backgrounds` to `species.json`, then set `"ready": true`. Then check Hearth in the
   browser.
3. **Hearth's own art beyond the kitten.** The card's `house` shell (roof and chimney)
   is done and checked at 320/412/900 px with a test Hearth pet, but `emblem_hearth`,
   `deco_yarn` and `deco_cushion` don't exist yet and show as broken images. Ask Sol for
   them with the next batch. Shapes `porthole`, `pad` and `moon` still fall back to the egg.
4. **The flaky test is not pinned down.** About 2 failures in about 25 runs were seen
   in the first session. A sweep of seeds 0–60 passed every time, which argues against
   the rng being the cause. If it flakes again, save the full failure output; the next
   suspects are wall-clock time and task timing.
5. **Phase 4 (not started):**
   - adult forms per species
   - traits learned from the house (night owl, music lover, homebody)
   - generations and per-world journals
   - sky events: moon and BirdNET visits (the owner's entities, the stalled
     `last_bird` feed and the fallback are in the private house notes)
   - optional notifications and a chirp sound
6. **Art queue after the kitten:** tarantula probe, then the remaining new worlds
   (probe, review, batch).
7. **License:** none yet; `validate.yml` skips HACS's license check until the owner
   picks one. MIT was suggested.
8. **The owner's live HA:** install through HACS (custom repository, type Integration)
   or by manual copy, after taking a backup. The README's "Connect it to your house"
   tables show generic stand-ins; the owner's real entities are in the private notes.
   Remind them to delete the old manual card resource from 0.3.x.

## How to

- **Get art from Sol:** the owner forwards a share link.
  - POST `/api/shares/<id>/token` (keep the cookie), then GET `/api/shares/<id>` for
    the file list and description, then GET `/api/shares/<id>/files/<file id>`.
    The share host is reachable from cloud sessions.
  - Check the sha256 in the description.
  - Extract into a scratch folder, guarding against `..` paths.
  - Check every sprite: 256×256 RGBA with the feet on y=224, props 128×128,
    backgrounds 512×384. Also compare the two frames of each mood: a size jump shows
    as a pulse.
  - Make a contact sheet, look at it, and send it to the owner. The beetle failed this
    review twice.
  - Copy only the finished PNGs into `frontend/sprites/<species>/`. Put prompts,
    probes and scripts in `art/<species>/`, but not the raw sheets or Sol's tool logs.
- **Release:** bump the version in `const.py`, `manifest.json` and
  `frontend/hatch-pet-card.js` (the card URL's `?v=` busts the service-worker cache),
  push, then run Actions → Release (or have the owner make the release by hand while
  it's unregistered; see item 1).
- **Message Sol:** use `send_message` to Sol's session (ID in the private notes; a new
  session may need the owner's approval to reach other sessions). Sol can't reply; the
  owner relays share links.

## Conventions the owner cares about

- Never develop against their live HA. Use `scripts/develop`; the onboarded test user
  is `dev` / `devdevdev`.
- Verify UI changes in the browser (Playwright plus Chromium are preinstalled), and
  send screenshots.
- Commit attribution: no `Co-Authored-By` trailer; keep the `Claude-Session:` line.
- Say plainly what's verified and what isn't; the owner is often on a phone.
