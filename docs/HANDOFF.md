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
  tarantula pending). Hearth has the tabby kitten ✅ (bunny pending). Tidepool, Pond and
  Night Sky are listed in `frontend/worlds.json` and stay hidden until a creature is
  ready. The beetle is shelved; its partial art is in `art/beetle/`.
- **Woodland trim:** the smaller, lower garland and the egg's bottom labels were checked
  at 320–900 px and shown to the owner, who was happy with it. More trim is the owner's
  call.
- **Tests:** 73, run with `scripts/test`. `tests/conftest.py` seeds the coordinator's
  rng (`PET_SEED=n` picks another seed).

## Open items, in priority order

1. **Releases work.** The owner published `v0.6.1` by hand on 2026-10-26 (and set
   Workflow permissions to "Read and write"). That tag push registered `release.yml`,
   and its first run passed. From now on, use Actions → Release → Run workflow (see
   "How to"). HACS now offers releases instead of the branch.
2. **Hearth is live (kitten ready).** Sol's "Hearth v2" pack fixed the kitten's
   flagged frames and brought Hearth's egg, four rooms, emblem and decorations; review
   notes are in `art/README.md`. Checked in the dev HA: egg, baby, child and teen inside
   the card's new `house` shell. Shapes `porthole`, `pad` and `moon` still fall back to
   the egg; draw each before its world goes live.
3. (merged into 2)
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
  - POST `/api/shares/<id>/token` with a JSON body `{}` (without it the server
    answers 500; keep the cookie), then GET `/api/shares/<id>` for
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
  push, then run Actions → Release → Run workflow. It tags the manifest's version.
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
