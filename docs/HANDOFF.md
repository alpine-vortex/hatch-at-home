# Handoff (2026-10-27, end of the fourth session)

Branch: `ccr-a5f628ca-979gik`, which is also the repo's default branch (all work
pushed; no PR). Version **0.20.0**, released. **The owner runs it on their live HA**
(they were on 0.18.0 at the end of the fourth session).
Read the README first, then `docs/design-worlds.md`, `art/README.md`,
`docs/remediation-plan-2026-10-26.md` (the last review and what came of it) and
`docs/assist-scoping.md`. The owner's original brief is not in the repo; its key rules
are restated across the README and the design doc.

**The repo is public. Keep the owner's personal details out of it**: real entity IDs,
location, hostnames, session and trigger IDs, people's names. They live in a private
Artifact on the owner's account, **Hatch house notes** (find it with the Artifact
tool's `list`, then `read` it): the entity mapping and options for their house, the
house check of 2026-10-27, BirdNET notes, the file-share host and Sol's session ID.
History was rewritten once to remove them. Scan anything from Sol or the owner for such
details before committing it.

## Where things stand

- **Phases 0–3, HACS packaging and most of phase 4 are done and released.** README
  "How the pet works" describes all of it for users.
- **The fourth session (0.16–0.19)** added:
  - **Gameplay:** discipline that fades and damps whining; upbringing at adulthood
    (devoted, steady, scrappy; a care miss costs 6 points); weight; the left/right
    game (`virtual_pet.play_game`); chore treats from to-do lists; collapsing into a
    nap at 0 energy.
  - **Card feedback:** the "moments" feed on `sensor.<pet>_last_care` (the card reacts
    to misses, hatching, growing up, traits, sunsets, TV titles...); species
    `reactions` poses; stand-ins for missing art (scold/praise icons, CSS rain, breeze,
    lightning); idle life; greetings by the viewer's first name; a card editor
    (`devices`). The excited bounce lasts 10 s (the mood lasts `EXCITED_MINUTES`).
  - **Passing moments (server):** sunrise/sunset, good morning at the first stir, good
    night, TV and music titles, the TV going off late, thunder (`storm`) and `windy`
    flags, and the season's first snow and frost as `memories` in the journal.
  - **HA plumbing:** notification buttons that clear themselves, diagnostics (redacted),
    repair warnings (gone entities, empty world), reconfigure (rename; change world,
    applied to the next egg), recorder hygiene.
- **0.20.0** (start of the fifth session): talking to the pet through Assist, as
  `docs/assist-scoping.md` recommended. `intent.py` (`VirtualPetStatus`,
  `VirtualPetCare`), `llm.py` (tools `virtual_pet__status`, `virtual_pet__care`), and
  `docs/custom_sentences/en/virtual_pet.yaml` for the built-in agent (a names list,
  not a wildcard: a wildcard grabbed "how is the weather"). Only pets with an exposed
  entity answer. `PetCoordinator.current_mood()` now holds the privacy rule the mood
  sensor used. Tested end to end through the built-in agent in `tests/test_assist.py`;
  not yet tried on a real voice assistant or LLM agent.
- **0.20.1** (polish pass, checked in the browser on all six worlds at 420 and 330 px):
  the header is one line (no "1 / n" chip; the world is on the device plate), the dots
  wrap instead of pushing the arrows off a narrow card, neighbouring devices peek
  visibly, status rows share one grid, tapered wind streaks, the tank lid sits on the
  body, lily-pad buttons stay inside the pad, moon stars clear of the labels, and the
  tree frog stands on a lily pad (`perch_lilypad`, drawn by `art/treefrog/make_perch.py`).
- **Worlds, all six live:**
  - Woodland: bird, Douglas squirrel (deer to come). Egg shell.
  - Terrarium: leopard gecko, Mexican red-knee tarantula (0.21.0, Sol's v2 at 2 px art
    pixels so its faces read; borrows the gecko's scene and cricket). Tank shell.
  - Hearth: tabby kitten, lop bunny. House shell.
  - Tidepool: sea otter, giant Pacific octopus. Porthole shell; water world (murk).
  - Pond: Pacific tree frog, axolotl. Lily-pad shell; water world.
  - Night Sky: little brown bat, luna moth. Moon shell.
  - The beetle is shelved (`art/beetle/`).
- **Adults** exist for every creature (the last four arrived in 0.21.0). Long adults
  are drawn back up with `species.json` `"scale": {"adult": …}` (1.05–1.2; the bat
  needs none).
- **Tests:** 196, run with `scripts/test` (ruff, format check, pytest).
  `tests/conftest.py` seeds the coordinator's rng (`PET_SEED=n` picks another).
  `scripts/card-check` (Playwright, 22 checks) drives the card against
  `scripts/develop`; it onboards a fresh instance and creates pets by itself.
- **CI:** `.github/workflows/validate.yml` (HACS action, hassfest, tests) is green.
  License MIT; Tiny5 keeps its OFL.

## Open items, in priority order

1. **Assist on the owner's HA:** ask them to try it (an LLM agent, and the sentences
   file) and report what it says; tune the wording from that.
2. *(merged into 3: the scheduled send failed with access denied on 2026-10-27, so
   the batch went out by hand at 03:07 UTC, together with the deer brief.)*
3. **Art still coming from Sol** (asked 2026-10-27 03:07 UTC; the owner relays links):
   - the deer (Woodland's third creature): Columbia black-tailed deer, brief sent; Sol
     probes it first, then all four stages. Species folder `deer`;
   - batch "hatch-batch-feedback": `bg_rain` for Terrarium, Tidepool, Pond and Night
     Sky; the gecko's `bg_night` and `bg_dim`; one shared `prop_fan`, `prop_scold`,
     `prop_praise` set. The shared props replace the card's `FALLBACK_PROPS` (scold,
     praise) and the CSS breeze (fan): put them in each world's first species' `props`
     (others borrow with `other/name` paths). A species with its own `bg_rain` no
     longer gets the drawn rain.
   When adults arrive: add "adult" to `stages`, measure adult vs teen content height
   and set `scale.adult` (cap 1.2), check in the browser.
4. **Tuning review, about 2026-11-03.** A scheduled reminder fires then. Ask the owner
   for each pet's diagnostics download, then check care misses per day, weight drift,
   whine rate, and game and chore use against `rates.py`. Propose numbers before
   changing them.
5. **Unconfirmed on a real phone:** the notification buttons. Ask the owner.
6. **Feature-gap plan** (`docs/plan-2026-10-27-feature-gaps.md`): the owner chose
   a call-response blueprint, choosing the next egg, two more minigames (Higher or
   Lower, then copy me) and a one-species alternate adult chosen by a trait. The
   plan has been reviewed and the owner has approved it; D still needs a species
   and a trait picked from the owner's pets. Not chosen (don't start unasked): learning household
   routines, a daily diary in the journal (declined), pets on the shelf noticing
   each other, chore streaks, trained tricks, items, calendar celebrations.
7. **BirdNET bird visits:** the owner deferred this ("will be reset at a later time");
   don't start it unasked. The design and the stalled-feed workaround are in the
   private notes.
8. **Small known nits:** the tree frog's snack is hard to read. (Pond's open water
   is solved by the frog's `perch`; mood sizes were measured in 0.20.1 and differ
   under 12% except the child gecko asleep, 17%, from its drawn "zzz".)

## How to

- **Get art from Sol:** the owner forwards a share link.
  - POST `/api/shares/<id>/token` with a JSON body `{}` (without it the server answers
    500; keep the cookie), GET `/api/shares/<id>` for the file and description (with
    the sha256), then GET `/api/shares/<id>/files/<file id>`.
  - Check the sha256, extract into a scratch folder (guard against `..` paths) and
    read untrusted files with `python -I`.
  - Review with `scripts/art/` (each has usage in its docstring): `check.py`, `gaps.py`,
    `slivers.py`, `sheet.py`. Look at the sheet and send it to the owner.
  - Copy finished PNGs into `frontend/sprites/<species>/`; prompts, probes and scripts
    into `art/<species>/`, never raw sheets. Watch for name collisions.
  - Write `species.json` (see `sprites/README.md`; `reactions` maps actions to the
    creature's own child poses).
- **Check the card:** `scripts/develop` in the background, then `scripts/card-check`.
  Gotchas found this session:
  - The HA frontend reloads itself once, about 10 s after the first page load; wait 15 s
    before driving the card.
  - The card lives in HA's shadow DOM: use Playwright locators, not `querySelector`.
  - HA keeps its sign-in tokens in `localStorage`; never clear all of it.
  - To inject a state for a quick visual check, `hass.callApi("POST", "states/<id>", …)`
    from the page; the integration overwrites it on its next update.
- **Stopping the test HA:** a `pkill -f`/`pgrep -f` pattern also matches the shell
  running it whenever the command line contains the same text, and kills that shell
  (exit 144). Match `/proc/*/cmdline` from a small Python script instead.
- **Tests:** `async_block_till_done(wait_background_tasks=True)` when background tasks
  matter (chores). The shopping list writes into the shared testing config, so give
  such tests their own `hass.config.config_dir`. `OptionsFlowWithReload` forbids update
  listeners. Use `async_get_device_by_identifier`, not the deprecated `async_get_device`.
- **Release:** bump the version in `const.py`, `manifest.json` and
  `frontend/hatch-pet-card.js` (the card URL's `?v=` busts the service-worker cache),
  push, wait for Validate to go green, then run the Release workflow: the GitHub MCP
  tool `actions_run_trigger` with `release.yml` and ref = this branch.
- **Message Sol:** `send_message` to Sol's session (ID in the private notes). Sol can't
  reply; the owner relays links. Ask for batch jobs (cheaper).
- **Card not showing after an update:** a hard refresh, or in the companion app,
  Settings → Companion app → Debugging → Reset frontend cache.

## Conventions the owner cares about

- Never develop against their live HA (it isn't reachable from cloud sessions anyway).
  For what the pet senses there, ask for the debug sensor's attributes or a diagnostics
  download.
- Verify UI changes in the browser and send screenshots; contact sheets afterwards are
  fine for art choices (no sign-off needed first).
- Keep animations short: a 15-minute bounce after a treat was too much.
- Release once work is verified; the owner updates through HACS.
- Commit attribution: no `Co-Authored-By` trailer; keep the `Claude-Session:` line.
- Say plainly what's verified and what isn't; the owner is often on a phone.
- Log finished work in tududi (Development area, tag `done-by-claude`).
