# Handoff (2026-10-26, third session)

Branch: `ccr-a5f628ca-979gik`, which is also the repo's default branch (all work
pushed; no PR). Version **0.15.0** (released through Actions → Release). Read the README first, then `docs/design-worlds.md`
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
  tarantula pending). Hearth (tabby kitten ✅, lop bunny ✅) and Tidepool (sea otter ✅, giant Pacific octopus ✅) and Pond (tree frog ✅, axolotl ✅) and Night Sky (bat ✅, luna moth ✅). Every
  world in `frontend/worlds.json` is live now. The beetle is shelved; its partial art is in `art/beetle/`.
- **Woodland trim:** the smaller, lower garland and the egg's bottom labels were checked
  at 320–900 px and shown to the owner, who was happy with it. More trim is the owner's
  call.
- **Tests:** 73, run with `scripts/test`. `tests/conftest.py` seeds the coordinator's
  rng (`PET_SEED=n` picks another seed).

## Open items, in priority order

1. **Releases work.** The owner published `v0.6.1` by hand on 2026-10-26 (and set
   Workflow permissions to "Read and write"). That tag push registered `release.yml`,
   and its first run passed. This session released 0.7.0 (Hearth) through
   0.15.0 (adults, luna moth); the commit log says what each held. Releases go out with Actions → Release → Run workflow, dispatched through the
   GitHub MCP tool (`actions_run_trigger`, `release.yml`, ref = this branch).
2. **Hearth is live (kitten ready).** Sol's "Hearth v2" pack fixed the kitten's
   flagged frames and brought Hearth's egg, four rooms, emblem and decorations; review
   notes are in `art/README.md`. Checked in the dev HA: egg, baby, child and teen inside
   the card's new `house` shell. The card draws every shell in `worlds.json`: `egg`, `tank`,
   `house`, `porthole`, `pad` (lily pad) and `moon` (crescent on top). Pad and moon were
   checked with throwaway stand-in species, since Pond and Night Sky have no creatures yet.
3. **Tarantula set held back for the owner's call.** Sol's set (`hatch-4664de9c`,
   sha256 `b5076cd8…`, 73 sprites) passes the size and feet checks, but its faces are
   dark lines on a dark body and mostly vanish, so moods don't read. Sol offered a cheap
   re-run of the sheets with lighter eye highlights and a cream mouth line. Nothing is in
   the repo yet; the owner decides between shipping as-is and waiting for that re-run.
   Its props: only `web_mat`; borrow `gecko/cricket` for feed and the gecko's other props
   for the rest, and the gecko's `bg_vivarium`.
4. **The flaky test is fixed.** It was `test_empty_house_goes_to_the_sitter_privately`,
   and it depended on the seed, not on timing (seeds 16619 and 19214 failed every time).
   In the two hours the house sat empty before the sitter took over, the pet could start
   a random "play with me?" call. The call was frozen at the sitter's and outranked the
   greeting on return. The test pet now has full discipline, so it never fake-calls;
   that test passes on 153 seeds and the whole suite on 60 random seeds (4 in parallel).
   The owner then decided: going to the sitter's settles a pending fake call by default
   (option "The sitter settles whining", `sitter_settles`); real needs still wait.
   Also seen once: during a dev-HA test the card jumped back to the first pet. An
   85-second probe of the same steps didn't reproduce it, so it was most likely the
   test page reloading; watch for it.
5. **Phase 4 (in progress):** traits are done (`model._learn`, `trait_progress`,
   `_trait_bonus`), and so are generations (`model.lay_egg`, `button.<pet>_lay_egg`,
   the card's two-tap "lay an egg?" pill; the owner chose: offered from a week into
   adulthood, never automatic, never while sick, the egg inherits one trait) and the journal (status
   screen → "journal"). Also done: the moon (options section Sky; `home.moon_phase`,
   flags `full_moon`/`new_moon`; the owner's moon entities are in the private notes)
   and per-user phone notifications (`notify.py`, service `notify_me`, the card's
   "notify me" toggle; PetState.notify_users). README "How the pet works" covers
   them. Traits then grew (owner's choice): nine traits from `R.TRAIT_FLAG_HOURS` plus
   the first three, levels ★–★★★ (`trait_levels`; ×1/×1.5/×2), inheritance at the
   parent's level with relearning deepening it (`inherited`, `inherited_from`), and
   the journal's family line. Sensor attributes are copies (HA's frontend diff
   missed in-place list changes; test_attributes_are_copies_of_the_pets_lists).
   Still to do:
   - adult forms per species
   - BirdNET visits (the owner's entities, the stalled `last_bird` feed and the
     fallback are in the private house notes)
   - a chirp sound on calls (browser autoplay rules apply)
6. **Adult forms: delivered and live for 8 creatures (2026-10-26).** See `art/README.md`
   "Adult pass" for the scale fix. The original request: a 4th stage for the 8 live
   creatures, 4 sheets each, 160 sprites: `sprites/<species>/adult_<mood>_<1|2>.png`
   for the 10 moods, at the teen's height (teens are already the biggest; adults look
   grown-up through details, not size). The creatures still to come get the same 4
   adult sheets in their own batches. When the zip arrives: run the usual checks, add
   "adult" to each `species.json` `stages`, drop `stage_fallback`, and check an adult in
   the browser. A slim set (content, asleep, sick, calling) was the cheaper option, not
   chosen.
7. **Art queue:** the deer (Woodland), the tarantula face re-run, and adults for the
   creatures drawn after the adult pass (axolotl, bat, luna moth; deer and tarantula
   get theirs in their own batches). Sol is sending `bg_night`
   replacements for Pond and Tidepool on their day scenes' layouts: drop them into
   `sprites/treefrog/` and `sprites/otter/` after the usual checks.
   Review tip: run a connected-pieces check on every sprite; the leg gap that shipped in
   0.7.0 was a 4 px transparent band only that check caught.
8. **License:** MIT (owner's choice, 2026-10-26), `LICENSE` in the repo root; HACS's
   license check is on again. The Tiny5 font stays under its OFL.
9. **The owner's live HA: installed (2026-10-26)** through HACS, with their real entities
   mapped in the options (the private house notes list them). The card needed a hard
   refresh / "Reset frontend cache" in the companion app before it appeared in the card
   picker. Next: ask the owner to enable the pet's diagnostic sensor ("debug", off by
   default) and read it to see what the pet actually senses in their house.

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
