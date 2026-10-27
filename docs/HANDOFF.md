# Handoff (2026-10-27, end of the fourth session)

Branch: `ccr-a5f628ca-979gik`, which is also the repo's default branch (all work
pushed; no PR). Version **0.18.0**, released. **The owner runs it on their live HA.**
Read the README first, then `docs/design-worlds.md`, `art/README.md` and
`docs/remediation-plan-2026-10-26.md` (the latest review and what came of it). The owner's original brief is not in the repo; its key
rules are restated across the README and the design doc.

**The repo is public. Keep the owner's personal details out of it**: real entity IDs,
location, hostnames, session IDs, people's names. They live in a private Artifact on the
owner's account, **Hatch house notes** (find it with the Artifact tool's `list`, then
`read` it): the entity mapping and options for their house, BirdNET notes, the
file-share host and Sol's session ID. History was rewritten once to remove them. Scan
anything from Sol or the owner for such details before committing it.

## Where things stand

- **Phases 0–3, HACS packaging and most of phase 4 are done and released.** Phase 4
  so far: traits, generations, the journal, the moon, per-user notifications and adult
  forms. README "How the pet works" describes all of it for users.
- **Added in the fourth session (0.16–0.18):**
  - Gameplay: discipline that fades and damps whining, upbringing at adulthood
    (devoted, steady, scrappy), weight, the left/right game (`virtual_pet.play_game`),
    chore treats from to-do lists, and collapsing into a nap at 0 energy.
  - Card feedback: the "moments" feed on `last_care` (the card reacts to misses,
    hatching, growing up, traits and more), species `reactions` poses, and stand-ins
    for missing art (props, rain overlay, breeze). Also a card editor (`devices`).
  - HA plumbing: notification buttons that clear themselves, diagnostics, repair
    warnings, and reconfigure (rename; change world, applied to the next egg).
  - The remediation plan's phases 1–3 and 5 are done (translations: not wanted).
- **Worlds, all six live:**
  - Woodland: bird, Douglas squirrel (deer to come). Egg shell.
  - Terrarium: leopard gecko (tarantula held back). Tank shell.
  - Hearth: tabby kitten, lop bunny. House shell.
  - Tidepool: sea otter, giant Pacific octopus. Porthole shell; water world (murk).
  - Pond: Pacific tree frog, axolotl. Lily-pad shell; water world.
  - Night Sky: little brown bat, luna moth. Moon shell.
  - The beetle is shelved (`art/beetle/`).
- **Adults** exist for bird, squirrel, gecko, kitten, bunny, otter, octopus and tree
  frog. Long adults come out shorter than their teen in the 256 px frame, so
  `species.json` `"scale": {"adult": …}` (1.05–1.2) draws them back up in the card.
  Axolotl, bat and luna moth still fall back to their teen sprites (`stage_fallback`).
- **Tests:** 183, run with `scripts/test` (ruff, format check, pytest). The card has
  `scripts/card-check` (Playwright, 13 checks) against `scripts/develop`; it onboards a
  fresh instance and creates pets by itself.
  `tests/test_species.py` checks that every sprite each ready `species.json` points at
  exists. `tests/conftest.py` seeds the coordinator's rng (`PET_SEED=n` picks another).
  The old "flaky" test was seed-dependent and is fixed (60 random seeds pass).
- **CI:** `.github/workflows/validate.yml` (HACS action with the license check on,
  hassfest, tests) is green. License MIT (owner's choice); Tiny5 keeps its OFL.

## Open items, in priority order

1. **Tuning review, about 2026-11-03** (a reminder is scheduled in the fourth
   session). Ask the owner for each pet's diagnostics download, then check care misses
   per day, weight drift, whine rate, and game and chore use against `rates.py`.
   Propose new numbers before changing them. The house check (2026-10-27) is in the
   private notes; it led to 0.17.1 (lights only count as too bright after bedtime).
   The owner still has to confirm that the notification buttons work on a phone.
2. **BirdNET bird visits** (the owner deferred this: "will be reset at a later
   time"; don't start it unasked), the last phase 4 feature that needs no art. The design and
   the owner's entities are in the private notes, including the workaround for the
   stalled `last_bird` feed: trigger on increases of today's detection count, name the
   bird only when `last_bird` is under 10 minutes old, journal only fresh detections.
3. **Art still coming from Sol** (the owner relays share links):
   - the deer (Woodland's third creature), with adult sheets in the same batch;
   - the tarantula face re-run (the owner chose to wait for it rather than ship the
     first set, `hatch-4664de9c`, whose dark faces vanish), with adults. Its only prop
     was `web_mat`: borrow the gecko's cricket for feed and its other props, and the
     gecko's `bg_vivarium`;
   - batch "hatch-batch-feedback" (requested 2026-10-27): adults for axolotl, bat
     and luna moth; `bg_rain` for Terrarium, Tidepool, Pond and Night Sky; the gecko's
     `bg_night` and `bg_dim`; one shared `prop_fan`, `prop_scold`, `prop_praise` set.
     The shared props replace the card's `FALLBACK_PROPS` (scold, praise) and the CSS
     breeze (fan): put them in each world's first species' `props` (others borrow with
     `other/name` paths). A species with a `bg_rain` no longer gets the drawn rain.
   When adults arrive: add "adult" to `stages`, drop `stage_fallback`, measure adult vs
   teen content height and set `scale.adult` (cap 1.2), check in the browser.
4. **A chirp sound on calls** (optional; browsers only allow sound after a tap).
5. **Small known nits:** the tree frog's snack is hard to read; Pond's day scene puts
   the pet on open water; moods vary a little in size (asleep and sick bigger), as Sol
   warned. Once, in a dev test, the card jumped back to the first pet; an 85-second
   probe didn't reproduce it, so it was probably the test page reloading.

## How to

- **Get art from Sol:** the owner forwards a share link.
  - POST `/api/shares/<id>/token` with a JSON body `{}` (without it the server answers
    500; keep the cookie), GET `/api/shares/<id>` for the file and description (with
    the sha256), then GET `/api/shares/<id>/files/<file id>`.
  - Check the sha256, extract into a scratch folder (guard against `..` paths) and
    read untrusted files with `python -I`.
  - Review with `scripts/art/` (each has usage in its docstring): `check.py` (sizes,
    feet on y=224, frame-pair jumps), `gaps.py` (connected pieces: this caught the
    0.7.0 leg gap), `slivers.py` (dark slivers from the sheet row above; `--fix`
    erases them), `sheet.py` (contact sheet). Look at the sheet and send it to the
    owner.
  - Copy finished PNGs into `frontend/sprites/<species>/`; prompts, probes and scripts
    into `art/<species>/` (adult prompts in `art/<species>/adult/`), never raw sheets.
  - Watch for name collisions with existing files: the Night Sky kit's
    `deco_mushroom` would have overwritten Woodland's (saved as `deco_glowshroom`).
  - Write `species.json` (see `sprites/README.md`); a world's later creatures borrow
    the first one's egg, scenes, murk and bubbles with `other/name` paths.
  - Check in `scripts/develop` with Playwright: hatch pets in the world until the
    species comes up (the egg picks at random), `fast_forward` for later stages.
- **Release:** bump the version in `const.py`, `manifest.json` and
  `frontend/hatch-pet-card.js` (the card URL's `?v=` busts the service-worker cache),
  push, then run the Release workflow: the GitHub MCP tool `actions_run_trigger` with
  `release.yml` and ref = this branch. It tags the manifest's version. Runs can sit
  queued for a minute.
- **Message Sol:** `send_message` to Sol's session (ID in the private notes). Sol can't
  reply; the owner relays links. Ask for batch jobs (cheaper).
- **Card not showing after an update:** a hard refresh, or in the companion app,
  Settings → Companion app → Debugging → Reset frontend cache.

## Conventions the owner cares about

- Never develop against their live HA. Use `scripts/develop`; the onboarded test user
  is `dev` / `devdevdev`.
- Verify UI changes in the browser (Playwright plus Chromium are preinstalled), and
  send screenshots.
- Commit attribution: no `Co-Authored-By` trailer; keep the `Claude-Session:` line.
- Say plainly what's verified and what isn't; the owner is often on a phone.
- Log finished work in tududi (Development area, tag `done-by-claude`).
