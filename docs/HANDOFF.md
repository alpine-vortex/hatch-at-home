# Handoff (2026-10-28, end of the sixth session)

Default branch: **`main`** (renamed on 2026-10-27 from the fourth session's branch
`ccr-a5f628ca-979gik`, so blueprint import URLs can name a lasting branch). Sessions
work on their own branch and land work in `main` through a PR, unless the owner says
a session may push to `main` (the fifth session may: owner, 2026-10-27). Latest
release **0.33.1** (2026-10-28: catchphrase, birthdays and the one-time
question fix, #27, #29); 0.32.0 brought each creature's voice, typing, babble and a
favourite snack, #26); 0.31.0 brought the bond with each person, bond connections and
phase 1 of the voices plan, #25); 0.30.0 brought Thanksgiving (#18) and the squirrel's paws-up poses
no longer having six legs; 0.29.0 brought the daily wish, dreams, "while you were out"
and two Halloween costume fixes; 0.28.0 brought weather talk (#10) and Halloween (#11), 0.28.1
the Halloween morning notification, 0.28.2 the redrawn witch. **The owner runs it on
their live HA** (they were on 0.18.0 at the end of the fourth session).
Read `docs/guide.md` first (the full user guide; the README is box-back
marketing; its art, palette, frames and how to redraw them are in
`docs/readme/README.md`), then `docs/design-worlds.md`, `art/README.md`,
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

## Start here (handed over 2026-10-28 at the end of the sixth session)

**The driving role for this project passed to the owner's "Hatch First Mate"
session** (owner's request, 2026-10-28). Released: 0.33.1 (PR #29: the "birthday on
my phone" switch, off by default; the Art session's redrawn party hat, PR #28; a
sturdier idle-life card check). `main` is clean; nothing is in flight.

**Phase 4 of the voices plan, the photo (A7), is built as 0.34.0b1, awaiting the
beta try** (crew branch `crew/hatch-at-home-s2407-phase-4-of-the-voices-plan-the`,
from `docs/plan-2026-10-28-phase4-photo.md` draft 2; the owner confirmed both open
calls on 2026-10-28: the photo waits until the pet is a teen, and if Android can't
save, the dialog says so honestly). Not yet released: next, a GitHub pre-release
0.34.0b1 from the PR's branch, with the ask to tap "save" on a photo in the
iPhone and Android apps and say what happened; then fix (b2 if save changes) and
release 0.34.0. The Android "you can save it from a computer" line is not shipped:
it waits on that answer. `scripts/test` 409, `scripts/card-check` 93.

The owner has said (2026-10-28): open, push and merge PRs when ready, and start on
the next work. The way the owner wants work done: **a full plan, an adversarial
audit by a fresh subagent, revise, then build**; after building, **another audit of
the work**, fix, test (`scripts/test`, 409 tests), check the card
(`scripts/card-check`, 93 checks), send screenshots, then PR. Each phase is its own
PR. After phase 4: phases 5 (baby talk) and 6 (moths, its own plan and audit), then
personality types (a new plan). Gifts and neighbours talking are noted in
`docs/plan-2026-10-28-daily-checkins.md`.

The plans to read: `docs/plan-2026-10-28-voices-and-lines.md` (draft 3; phases 1-3
built) and its phase files (`phase2-voices`, `phase3-catchphrase-birthdays`,
`phase4-photo`), `docs/plan-2026-10-28-daily-checkins.md`,
`docs/plan-2026-10-28-bond-connections.md`. The owner's taste: Animal Crossing is the
touchstone; flavour, never gameplay, for bonds; positive or quiet, never guilt,
nagging or ranking people; private things only to their person (a birthday, a
photo); anything that leaves a trace in HA's history is opt-in (the birthday phone
switch).

Card-check tips from this session: `hush()` keeps legacy checks unvoiced (pets now
open lines with their sound); `bubble()` waits for typing; checks that call the
card's own methods should hold `sayUntil` so the card's tick doesn't race them; the
dev pets drift (below).

**Dev pets drift.** After many `card-check` runs the dev pets in `dev/config` get
sick (weight 0, recent misses), and checks like idle life fail. Until the dev utility
(open item 0) exists: stop HA, then in `dev/config/.storage/virtual_pet.0*` set
`sick` false, `recent_misses` [], `health` 100, `energy` 90, `hunger` 80, `weight` 50,
`call` null, `latched` [], and start it again. An old HA may still be running from an
earlier session: `scripts/develop` then exits with "stop the existing instance".

## Where things stand

- **Phases 0–3, HACS packaging and most of phase 4 are done and released.** `docs/guide.md`
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
- **Shell trims** (0.24.0): every world's device wears Sol's pixel trim (`worlds.json`
  `trim`: `top`, `plate`, `corner`; art in `ui/trim_<world>_*`, sources in
  `art/trim/`). The card sizes each piece from its own image (`_trim`) and places it
  per shell in CSS: the tank's top stands on both lid ends (mirrored), the house's
  wreath hangs in the gable, the pad's garland parts at the notch, the moon's leaves
  a gap under the crescent. A plate taller than 44 px (the hanging house sign) keeps
  its text in the bottom 44 px.
- **Welcome and dashboard** (0.24.1): adding a pet (a new save file, so never an
  egg or a restart) sends "<name> has been welcomed into the home." to every
  mobile_app phone and the sidebar, and fires `virtual_pet_welcomed`. Option
  `dashboard` (setup form and options, "Notifications") is the path every one of the
  pet's notifications opens (`url` and `clickAction`); `notify.dashboard_path`
  normalises it. The dashboard list reads `hass.data["lovelace"]` without importing
  it; custom paths are allowed.
- **News** (0.25.0): `virtual_pet.share_news` (`entity_id` one or a list,
  `headline`, optional `topic`) makes a `news` moment the card says in the bubble ("did you hear? …", "guess
  what? …", "ooh, news! …", "<topic> news! …"), with the short `perk`. Cosmetic: no
  save, no stat or mood change (a test compares the whole state); since 0.25.1 it
  catches the pet up first (`_advance`), so news never reaches a pet that just fell
  asleep, and it's dropped mid-game. The topic line is used only for topics of 12
  characters or fewer that don't already end in "news".
  Dropped, not queued, while asleep, away or an egg; at most one per
  `NEWS_COOLDOWN_MINUTES` (30) per pet, in memory, set only when news shows. The
  headline is cut at 60 characters (`home.news_text`): at 80 the bubble buried the pet
  on a 330 px card. Checked in the browser at 420 and 330 px.
- **Seasons, starting with Halloween** (0.28.0, card only): `SEASONS` in the card
  (date window, per-world `worlds` parts, lines, a `treat` day), `seasonNow` by the
  viewer's local date, card option `seasonal` (false, or a key to force one). Pieces
  in `.season` behind the pet; the costume hat sits on the top of the head found by
  `_headTop` (first solid pixel down the head point's column) or on `species.json`
  `hat` where ears or antlers rise above the skull (the deer; the owner caught it
  hovering). The art is the Hatch API Art session's redraw (2026-10-28, 16 of 17
  pieces) and its witch (0.28.2, a near-black silhouette with a cat and a lantern
  pixel; the stand-in from
  `art/seasonal/make_halloween.py` flew backwards; the script now writes to
  `art/seasonal/out/`, not `ui/`). `card-check` forces the season and
  checks the hat; it keeps seasons off for the other checks. Halloween's extras (owner:
  "go all out on every holiday"): a costume of the day per pet (`costumes`, each with
  its `sink` into the head), a lantern face of the day, bunting, night mist, a ghost the
  pet jumps at, a witch in Night Sky, candy for snacks, a countdown, a `spooky` chirp.
  `species.json` `hat` points now exist for the deer, the axolotl (its gills rise above
  its crown) and the tarantula (the hat goes on its front body, by its face, not on its
  abdomen). Every costume was previewed on all 13 creatures × 4 stages, close up.
  Costumes carry `skip` lists (my call, not the owner's): no cat ears on creatures
  with their own ears or the luna moth, no horns on the deer. The bird wears them all:
  the owner's complaint was where the ears landed, which was a preview mix-up.
  The ears and horns have a thin band. Costumes sit on the lowest head top across the
  idle frames (`_headTopAll`). The preview script's injected creature can be undone by
  the test pet's own update mid-shot; discard cells that show the wrong creature.
  Re-verified 2026-10-28 (0.29.0) on all 13 creatures × 4 stages × 4 costumes, which
  found two faults, both fixed: a costume moment could fire while the pet was mid-wander
  or mid-look (mirrored), leaving the hat hovering where the pet had been (`_free` now
  waits out `movingUntil`, set by `_moving` for a wander, a look and a speck), and the
  pumpkin cap's flat bottom read as perched on domed heads (sink 6 → 10). The preview
  script is not in the repo; it freezes the card's `hass` setter, injects species and
  stage, and must check the frame on show (`s.pet.src`) is the one asked for.
- **Daily check-ins, batch 1** (`docs/plan-2026-10-28-daily-checkins.md`, items 2 and
  4; released in 0.29.0): `model.pick_wish` / `grant_wish` (state `wish`, from
  `coordinator.wish_options()`: `ALWAYS_WISHES` plus music, TV, chores when mapped and
  rain when today's forecast says so), granted in `coordinator._check_ins` from care,
  games, chores, lights out, sunset with company, and the house (music, TV, rain);
  `dream_seed` / `dream_on_waking` (state `dream_seeds`, `dream`), dreamed at the
  morning wake. Both on the life stage sensor (`wish`, `dream`, today only, unrecorded;
  who granted it stays on the server; diagnostics redact dream titles). Card: a say
  queue (`_queue`, so lines that arrive together are all said), `_firstLook` (away
  note, dream, wish, each once a day per device), `_wishMention`, the wish row, the
  `wish_granted` moment. The wish row leads the status screen (0.29.0; lower down it
  sat below the fold). `card-check` screenshots the three first-look lines and the
  status screen.
- **Daily check-ins, the bond with each person** (item 3; the owner confirmed every
  player has their own HA login; 0.31.0, not yet released): state `bonds` (HA user ID
  → points, today's count, visited, games per kind, nickname, favourite), from
  `model.add_bond` (visit, care, game, wish; care and games share
  `BOND_DAILY_LIMIT`), `bond_level` from `BOND_LEVELS`, a nickname at level 4 and the
  favourite of their games at 6 (`favourite_game`: extra happiness). The coordinator
  credits the person behind a button or `play_game` (`_person`: system users and
  automations get none), and the wish to whoever granted it (`_actor`). New service
  `virtual_pet.visit` (the card calls it on the pet on show, hourly; the server also
  limits it hourly per person, in memory) counts the day's visit and grants the new
  `say_hi` wish after noon. Life stage `bonds` (unrecorded): only levels, nicknames and
  favourites; the card shows only the viewer's (`_bond`): warmer hellos at 2, a hop
  (`greethop`, not `hop`, which the excited bounce clears) at 3, the nickname at 4,
  hearts at 8, a "you two" row of five hearts on the status screen, and `bond_up` /
  `bond_favourite` moments said only to their `user`. Diagnostics redact `bonds` and
  moments' `user`, and add anonymous `bond_points`. Bonds carry into the next
  generation (my call). Second pass (owner: flavour only, never stats): the favourite
  game no longer adds happiness; `bond_for` gives (level, nickname); `_notify` sends
  each nickname group its own text (`notify.to_friend`); Assist's status and care
  replies add "Hi, sunbeam!" / "Thanks, sunbeam!" and status slots `bond`, `nickname`;
  `friend_home` moments from person entities coming home (`person_moved` →
  `_arrivals` → `_friends_home` in `_sense_home`, level `BOND_FRIEND_LEVEL`, once per
  `FRIEND_HOME_EVERY_MINUTES` per person); aimed wishes (`pick_wish` `friends`, wish
  `for` and `for_name`, `WISH_FOR_CHANCE`), drawn by the card's `_wishLine`. Third
  pass: `virtual_pet.visit` now answers with `notes` for the caller only
  (`_notes`: `friends_for` from bond `since`, `tucked_in` from `tucked_at`, and
  "my day" from `wellbeing.notice`, each once a day via bond `noted`); new service
  `virtual_pet.my_day` (bond `my_day`); `wellbeing.py` finds each person's phone
  sensors through mobile_app's `user_id`, reads today and their 14-day median from
  recorder statistics (hourly `change`), and keeps bike rides and runs seen today in
  memory (`_moved`); `model.game_record` (bond `best`, `bond_record` moment); lights
  out by a person in the evening is `tucked_in` (switch, Assist and the phone button
  pass their context). Card: `_note`, `_maybeAskDay` / `_askDay` (a queued line can
  carry `then`), a "my day" switch on the status screen. Unverified: real phones'
  sensors (the companion docs' names are used: `steps`, `floors_ascended`,
  `activity`, `detected_activity`, `health_connect_daily_steps`,
  `health_connect_daily_floors`, `health_connect_sleep_duration`).
  Bond connections (`docs/plan-2026-10-28-bond-connections.md`, all twelve, audited
  by a subagent and revised before building): `people.py` is a store shared by all
  pets (`hass.data[DOMAIN]["people"]`, `virtual_pet.people`) for what belongs to the
  person, not the pet: likes, `asked` (a morning and a later slot a day), `noted`
  (person lines, once by whichever pet they look at first), `zone`, `arrived`,
  `sendoffs`, `alarms`, `guess`, `my_day`, and the house's `weather` by day.
  `hass.data[DOMAIN]["pets"]` lists the loaded pets (`_closest_pet` sends the
  send-off). `visit` answers `{notes (≤ NOTES_PER_VISIT, best first), ask}`;
  `choose_question` picks the question (rotation by date for the later slot);
  answers come by the websocket command `virtual_pet/answer` (no bus event). Calls
  are `time-sensitive` on phones, send-offs `passive`; focus/DND are not read.
  `model.pick_dream` / `dream_on_waking` make a picked dream; diagnostics redact its
  `user`. A code audit before the PR found 17 problems, all fixed but one (new person
  entities and phone sensors are noticed only after a reload); see the plan's last
  section. `card-check` (now 62 checks) covers the visit, a close bond's
  greeting, the status row and the level-up line. Next in the plan: finds and
  visitors per world, then pets visiting each other.
- **Thanksgiving** (owner, 2026-10-28: "must do", the same all-out treatment as
  Halloween; tududi task due 20 November). Built on 2026-10-28, released in 0.30.0:
  `SEASONS` grew general fields (documented above the list: `corner`, `sweet`, `flyer`
  with `flock`, `nightFlyer`, `visitor`, `snackLines`, `treatLine`, `thanks`, `leaves`,
  `chirp`), and Halloween moved onto them unchanged. `from`/`to`/`treat` may be a
  function of the year: Thanksgiving is the fourth Thursday of November
  (`thanksgiving(year, days)`), from 12 days before to the Sunday after (14–29 Nov
  2026). Pieces: a leaf garland, falling leaves, a harvest piece of the day
  (cornucopia, gourds, basket), corner leaves, a plate by Hearth's door and popped on
  the day, a wheat-sheaf deco, geese in a V of 3 (by day too), a walking turkey
  visitor ("gobble?!"), pie snacks, costumes pilgrim hat / leaf crown / feather band /
  acorn cap (no skip lists; all seat on 13 creatures × 4 stages), a `harvest` chirp,
  and on the day "happy thanksgiving! ♥" then a thank-you to whoever gave the most care
  in the recent log (`_thanks`, first names only). The night lantern glow is
  Halloween's only (`.s-halloween`). The art is the Hatch API Art session's redraw of
  the stand-ins from `art/seasonal/make_thanksgiving.py` (2026-10-28, branch
  `thanksgiving-art`, 19 of 19; cut from Sol's drawings, the geese placed by hand).
  Checked on the card: every costume on 13 creatures × 4 stages, the turkey and
  geese at night.
- **Voices** (phase 2 of the voices plan; released in 0.32.0): `species.json` `voice`
  (`sound`, `pitch`, `pace`, `likes`). Card: `_write` is the one direct bubble write
  (with `ms` it sets the hold; without, a game keeps its own); `_speak` may open a
  line with the sound (`_soundFor`: not within `VOICE_QUIET_MS` of the last, not on
  `OPENERS`, by the first sentence's mark, not for an egg, ≤ 60 characters), types it
  out (`untyped` span hidden, so no layout shift; `data-typing` while typing;
  finished by `_stopTyping` on status, slide change, offscreen, hidden tab), and
  babbles it with the per-browser "babble" switch (`hatch-babble`; only on a running
  AudioContext, unlocked by a tap's end). `s.plain` holds the text `_speak` already
  announced, so the live-region observer skips only that. Sad, sick, refusal, game,
  idle and sulky weather lines stay plain. Server: `favourites` / `favourite_said`
  on the pet, picked after every advance from `coordinator.likes`; the
  `favourite_snack` moment at most once a day (`FAVOURITE_SNACK_CHANCE`), not at a
  stage with its own food. card-check's `hush()` keeps legacy checks unvoiced.
- **Catchphrase and birthdays** (phase 3; released in 0.33.0): one-time questions
  (`people.ONCE`, `once_due`, `mark_once`; 11-20 h, `ASK_ONCE_GAP_DAYS` apart, each
  its own tries). Catchphrase: `voice.catchphrase` per creature, `PetState.catchphrase`
  (a friend's pick), asked at `CATCHPHRASE_LEVEL` from the child stage, once per
  generation (`bond["catchphrase"]`, `_pet_once`, `_catch_ask`; answers checked);
  the card's `_speak(..., {catch: true})` ends every third such voiced line with it.
  Birthdays: `hatched_on` (set in `_hatch`; old pets at load from `born`),
  `model.pet_birthday` / `valid_birthday` / `birthday_today`; your birthday in the
  people store only (`birthday`, `birthday_skipped`, `birthday_sent`), answered and
  forgotten by websocket; celebration notes first in `_notes` (one a look; the visit
  says `made_room` when it forced room, and the card drops its away note);
  `_birthday_morning` (phone, once a year, closest hatched pet at home, nickname).
  Card: `QUESTIONS.birthday` pickers, `_partyTick` / `_confetti` / `PARTY` through
  `_costume`, "forget my birthday" on the status screen.
- **Holiday mornings** (0.28.1): `notify.HOLIDAYS` maps a date to a holiday and
  `HOLIDAY_MORNINGS` its phone text; on that date the pet's first morning moment
  (`good_morning`, or waking at wake time) fires a `holiday` event, which notifies the
  opted-in users once a day (`_holiday_morning`, in memory). `notify.holiday(date)`
  also answers Thanksgiving (`notify.thanksgiving(year)`, computed).
- **Weather talk** (Tier 1 of `docs/plan-2026-10-27-real-time-connections.md`,
  merged in PR #10, released in 0.28.0): `weather` moments (`change`:
  rain_started, rain_stopped, rainbow, snow_started, sun_out, hot, cold) from
  `HouseMoments._weather`, one per `HOME_WEATHER_GAP_MINUTES`, each kind once per
  `HOME_WEATHER_COOLDOWN_MINUTES`; `forecast` moments (`when` today/tomorrow, `kind`)
  from `weather.get_forecasts` (daily, fetched hourly in the background, in memory)
  only for notable days. Temperatures go out as `temperature`/`high`/`low` in the
  owner's unit (`_degrees`). `windy` now also comes from `wind_speed`/
  `wind_gust_speed`, with any weather, so the breeze rider trait will count more
  often. Not yet seen on the owner's HA: whether their provider has daily forecasts
  and wind speed. Tiers 2 and 3 await the owner.
- **Whole-app review** (0.25.1, 2026-10-27): three reviews (pet logic, the HA side,
  the card) and fixes, each checked against the code first. Among them: a freeze no
  longer moves the morning's wake time; a call's phone notification clears on every
  way a call can end, and a stale button does nothing; Reconfigure keeps a pre-worlds
  pet's world; moments are judged on the server's clock; the card retries a failed
  species or worlds file and caches the pets' entities per registry. Left as is, on
  purpose: house and trait bonuses share `HOME_BONUS_CAP` (a tuning question for the
  review), motion after a sensor dropout (needs HA's change events to tell apart),
  and the debug sensor showing "away" (it's off by default and for debugging).
- **Polish pass (2026-10-27, for 0.26.0b4):** sprites stored as exact palettes
  (10.7 MB → 7.3 MB, same pixels, `scripts/art/palette.py`; backgrounds untouched
  until the owner decides on 256-colour versions). Card speed: loops pause off screen,
  redraws per slide, cache headers. Accessibility: a live region, focus, contrast ink
  per shell (`deviceInk`), names. Storage: `trait_progress` in whole percents, no
  frozen deadline while away, `SAVE_DELAY` 60. Privacy: diagnostics and the debug
  sensor redact what the house was doing; the dev bench uses HA's demo location. Left
  as is, on purpose: the journal and memories stay on the life stage sensor (moving
  them breaks anyone reading them there), and the six stat sensors keep long-term
  statistics.
- **History rewrite, 2026-10-27 (owner's request):** the 0.25.0 commit carried a
  local username as its author; `main` and PR #7's branch were rewritten from that
  commit on (author renamed, same files and dates, older history untouched). The
  session's proxy refused tag pushes and branch deletes, so v0.25.1 was rebuilt on
  the rewritten main by the release workflow (`replace`) and the owner moved the
  other tags (v0.25.0, v0.26.0b1-b4) by hand; the old commits stay reachable only through the art
  session's branch `ccr-7ac3cdae-vv7jj5` (its work is already in PR #7), the merged
  `ccr-a828d8c1-review` branch and GitHub's PR refs. Anyone with an older clone:
  `git fetch && git reset --hard origin/<branch>` before working on it.
- **Worlds, all six live:**
  - Woodland: bird, Douglas squirrel, Columbia black-tailed deer (0.22.0). Egg shell.
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
- **Tests:** 409, run with `scripts/test` (ruff, format check, pytest).
  `tests/conftest.py` seeds the coordinator's rng (`PET_SEED=n` picks another).
  `scripts/card-check` (Playwright, 93 checks) drives the card against
  `scripts/develop`; it onboards a fresh instance and creates pets by itself.
- **CI:** `.github/workflows/validate.yml` (HACS action, hassfest, tests) is green.
  License MIT; Tiny5 keeps its OFL.

## Open items, in priority order

0. **Dev utility (owner, 2026-10-28, to do later):** a way to restore a test pet to
   full health and/or reset it to defaults. The dev pets in `dev/config` drift after
   many `card-check` runs (energy, weight, recent misses: sickness by neglect), which
   breaks checks like idle life; today that means stopping HA and editing
   `.storage/virtual_pet.*` by hand. A debug service (admin, like `fast_forward`) or a
   `scripts/` helper.

1. **Assist on the owner's HA:** ask them to try it (an LLM agent, and the sentences
   file) and report what it says; tune the wording from that.
2. *(done)* Sol's batch "hatch-batch-feedback" and the deer arrived on 2026-10-27
   and shipped in 0.22.0: rain scenes for every world, the gecko's night and dim, the
   shared `ui/prop_fan`, `prop_scold`, `prop_praise` (the card's `FALLBACK_PROPS`; the
   fan keeps its CSS breeze too). A species with its own `bg_rain` gets no drawn rain.
3. **Art reviews (2026-10-28):** two reviews of the live frames disagree;
   `docs/plan-2026-10-28-art-reviews.md` reconciles them. Next: phase 1 (merge the
   branch `claude/elegant-pascal-44cy2y` and release), then phase 2 (small fixes here)
   and phase 3 (one art batch).
   **Art from Sol:** nothing is on order. Every creature on every roster has all four
   stages. Ideas if more is wanted: house poses for baby, teen and adult (expensive),
   a clearer tree-frog snack, an Ocean world.
4. **Tuning review, about 2026-11-03.** A scheduled reminder fires then. Ask the owner
   for each pet's diagnostics download, then check care misses per day, weight drift,
   whine rate, and game and chore use against `rates.py`. Propose numbers before
   changing them.
5. **Unconfirmed on a real phone:** the notification buttons. Ask the owner.
6. **Feature-gap plan** (`docs/plan-2026-10-27-feature-gaps.md`): the owner chose
   a call-response blueprint, choosing the next egg, more minigames (Higher or
   Lower; then Catch from Giga Pets, as a card-only prototype first; copy me was
   cut) and trait flair. A (the blueprint) and B (the next egg, 0.23.0) are
   released. Released in 0.27.0 (PR #7, merged on 2026-10-27 at the owner's word,
   ahead of the 2026-11-03 tuning review, which now tunes the released game):
   C1 (Higher or Lower), the Catch prototype (card option
   `experimental_catch: true`, for the owner to try), and D, trait flair (Sol's 16
   sprites around the pet, a cap of 4 traits, per-pet temperament, 7 new traits,
   head points in `species.json`). The owner tries it first as the beta
   0.26.0b1, released from that branch on 2026-10-27. 0.26.0b2 added polish: trait
   icons, cap and progress on the status screen, flair when a trait is learned,
   game counts in the journal, toy-style game picker, pixel digits, Catch's pounce
   and best score, opt-in chirps per device, and traits in Assist's status.
   0.26.0b3 (the owner asked the art session to release it, 2026-10-27): Sol's lit
   `flair_night_owl_2` and the Catch decoy bee (`ui/catch_decoy_*`).
   **Two sessions work on this repo at once** (this plan's, and the one doing art
   and releases). Both land work in `main` through PRs; whoever releases takes the
   next free version from `main` then, and never releases the other's unmerged work.
   Merge `main` into your branch before pushing, and say in the PR when you touch
   shared files (`scripts/card-check.js`, the card's game overlay, `play_game`). Not chosen (don't start unasked): learning household
   routines, a daily diary in the journal (declined), pets on the shelf noticing
   each other, chore streaks, trained tricks, items, calendar celebrations.
7. **BirdNET bird visits:** the owner deferred this ("will be reset at a later time");
   don't start it unasked. The design and the stalled-feed workaround are in the
   private notes.
8. **Small known nits:** the tree frog's snack was redrawn as a blue-bottle fly (0.23.1). (Pond's open water
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
  tool `actions_run_trigger` with `release.yml` and ref = `main`.
  **Betas:** a version like `0.26.0b1` (or `rc1`) is published as a GitHub
  pre-release, which HACS offers only to someone who turned on "show beta
  versions" for the integration. Run the workflow with ref = the PR's branch to
  let the owner try unmerged work; the final release later drops the suffix.
- **Art requests (from 2026-10-28):** send them to the owner's **Hatch API Art**
  session (find it with `list_sessions`; it isn't named here because the repo is public).
  It decides between Luna and Sol. A Halloween redraw of all 17 `season_halloween_*`
  stand-ins was requested on 2026-10-28, due 30 October; keep the stand-ins' file names,
  canvas sizes and anchoring when installing it.
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
