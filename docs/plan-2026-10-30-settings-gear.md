# Settings gear: design pass and slice plan (scout s2503, 2026-10-30)

Goal: a gear on the status screen that opens a settings sheet; first tenants are the
per-pet shell finish picker and a per-browser monochrome screen. Nothing built yet.
Mocks (bench-backed, LCD views drawn over the real bench card; the *real* gear and
sheet do not exist): `renders/gear-*.png` in the worker dir (listed at the end).

## 0. What exists (file:line, `custom_components/virtual_pet/frontend/hatch-pet-card.js`)

- Status is an overlay *inside the LCD*, not a page: `.screen.show-status .status`
  (1937-1940), toggled by the header "Status" chip `.statusbtn` (2478, 2507, 1259) via
  `_toggleStatus` (3574). Journal is a second view in the same box (`_setStatus` 5052,
  `s.journal`, `jlink` 5065). The LCD scrolls; it holds about 7 rows at 420, 6 at 330.
- `_renderStatus` (4690-4770) is one flat list: the pet's stats, then switches. Mixed
  scopes today, no headings:
  - per **person** (server, `s.mine`): notify me, my day, my birthday, birthday on my
    phone, baby talk (cached per user in localStorage `hatch-baby-talk-<id>`, 205), my data.
  - per **browser** (localStorage): sounds here (`hatch-sound`, 4747), babble (4748),
    screen effects here (`hatch-lcd`, 199, 4749), shared screen (`hatch-shared-screen`,
    223, 4750).
- Shared screen: `sharedScreen()` (223) is read in ~25 places; it hides notify me, baby
  talk, my data, my birthday rows (4740-4746) and names, bonds, questions, photos.
  Flipping fires `SHARED_EVENT` so every card follows (4767-4781). Today *anyone* on a
  shared screen can flip it back off and can change sound and effects.
- Finishes: `FINISHES` registry (1147-1197; 8 world/special plus 16 prints, 24 keys
  counting `clear glitter glow`). The slide takes `world.shell.finish` (worlds.json, one
  per world) at `_renderSlide` 3365-3380 -> class `finish-<key>` on `.device`,
  `--d-face/--d-ink` for captions. Bench: `scripts/bench.js` `finishes()` preset (71,
  keeps its own FINISHES list in step), shot field `shell.finish`.
- Server: no per-pet cosmetic exists. The world comes from the config entry
  (`sensor.py:206` `"world": coordinator.world`; config_flow reconfigure `CONF_WORLD`,
  `CONF_NEXT_WORLD` for the *next egg*). Per-person server flags go through service
  **and** websocket pairs: `notify_me`/`my_day` (`__init__.py` 183-212, 243-258,
  ws 487-531, services.yaml) calling `pet.async_set_my_day`. Pet state persists in
  `model.Pet` (`model.py:355` `notify_users`, copied on rebirth 1667).

## 1. The gear: place and look

- **Where:** inside the status view, top right of the LCD, as a sticky header row
  (`status` title left, gear right). Not in the card header: the owner's decision is
  "a gear button on the status screen", the header chips are already crowded at 330
  (Status chip is 44 px tall), and the sheet then opens in the same LCD, one tap deep.
- **Look:** 12x12 pixel-art gear (a new `icon_gear`, drawn in `pixelIcon` style like
  `icon_status`), 34x30 px hit area (44 px tall touch target via padding), 2 px ink
  outline, filled when the sheet is open. Same at 330; nothing else in the header moves.
  Mock: `gear-status-420.png`.
- **Open/close:** gear -> `_settings=true` view in the same `.status` box (like
  `journal`); a "‹ settings" row at the top goes back; the Status chip closes both (as it
  closes the journal now, 5707). `aria-label="settings"`, focus goes to the back row.

## 2. The sheet: sections and rows

Three sections with dotted headings; the heading says *who it changes*. Rows are the
existing `row()` + `.bell` toggle, so no new control except the shell row.

| Section | Rows | Source |
| --- | --- | --- |
| FOR <PET> (everyone who sees this pet) | shell (picker, s4) | new, per pet, server |
| FOR YOU (follows your login) | notify me, my day, my birthday + birthday on my phone, baby talk, my data | move from status (4740-4746, 4698-4700) |
| THIS SCREEN (this browser only) | sounds, babble, screen effects, mono screen, shared screen | move (4747-4750) + new mono row |

Status keeps: wish, bond, stats, traits, upbringing, personality, next egg, the care
log and `journal ›`. Rows keep their `aria-label`s and handlers; only the container
moves, so `_mineSwitch`, confirm-tap and `_setStatus` focus-keeping all carry over.
Headings: `FOR PIP`, `FOR YOU`, `THIS SCREEN` (COPY?). The pet's name is used, not "pet".
Length: 11 rows plus 3 headings is about 14 lines: **the sheet scrolls** like status
(`gear-sheet-330.png` shows it clipped at about 6 rows). Order puts the per-pet shell
first because it is the new thing, and "this screen" last, nearest to `shared screen`.

## 3. Shared-screen behaviour

`sharedScreen()` means "nothing personal, no one's bond". Settings rules:
- **FOR YOU is absent** (as today's rows). Heading too, not an empty section.
- **FOR <PET>: visible, read-only** (shell shown dimmed, dashed, no picker; line
  "ask a grown-up to change it", COPY?). Reason: a lobby tablet is signed in as one
  person; letting passers-by recolour the household's pet is a quiet, odd write under
  that person's name. Cheap to open later. `gear-shared-330.png`.
- **THIS SCREEN: stays editable** (sounds, effects, mono): they are the tablet's own
  settings and nothing personal. The `shared screen` row stays, so the device can be
  turned back to personal. Known gap, not new: anyone can do that; a PIN is out of scope.
- The gear itself shows on shared screens (the THIS SCREEN section is useful there).

## 4. Per-pet finish picker

- **Entry:** the `shell` row shows a swatch plus the current finish name; tap opens a
  full-LCD picker view ("‹ shell for Pip").
- **Preview:** two parts. (a) Tapping a tile applies it to the *live device* at once
  (`dev.className` / `--d-*` via the same code as `_renderSlide` 3365-3380, no save), so
  the real shell is the preview and nothing new is drawn. (b) `use` saves, `world default`
  clears the override, leaving the picker without saving reverts. A tile is a 26x20 chip
  with the finish's own face colour/tile (`FINISHES[k].tile`, `face(color)`), 3 per row.
- **Tiles:** current marked `now`; the world's own default listed first as "<world>
  (default)". With 24 finishes, 3 per row, the list scrolls (mock shows 9). Group by
  `world plastics / specials / prints` with the same dotted headings.
- **Locked (earned by stage):** shown, dimmed, dashed, with the stage that opens it
  ("teen"); tapping shows the note, never a points price, never hidden (so the pet has
  something to grow toward). Which shells are earned is the owner's pick (Q3). Rule:
  open when the pet has *reached* the stage (`stage_rank >= n`), so adults keep it.
- **Storage and push (shipped, slice 2):** `PetState.shell_finish: str | None` (None =
  world default), persisted with the pet, type-checked on load (not a string: None; a
  string this version doesn't know is kept, so a downgrade loses nothing); a salvaged
  save starts on the default, like a new egg. It stays through growing up; a new egg starts on None (Q4), and
  `lay_egg` drops it from `egg.unknown`. The finish list and the unlocks live on the
  server: `rates.SHELL_FINISHES` (the card's `FINISHES` keys in order; a test checks
  the card's and the bench's copies match) and `rates.SHELL_UNLOCKS` (the six
  show-offs -> `teen`, Q3). `model.shell_unlocked` / `model.shell_options`: open once
  the pet has *reached* the stage. Exposed on `sensor.life_stage` beside `world`:
  `shell_finish` (a key this version doesn't draw shows as None) and
  `shell_finish_options` (the keys it may wear now, card order; unrecorded). Both hold
  still across ticks. Write paths:
  - **The card: websocket only**, `{type: "virtual_pet/set_shell", entity_id, finish:
    <key> | null}`. Errors: `no_pet`, `shell_locked` (not grown into it),
    `invalid_format` (not a finish). No service fallback: a missing command means
    "can't change the shell here", because a service call logs who made it.
  - **Automations:** the `virtual_pet.set_shell` service (`finish` optional; left out =
    the world's own). Its description says history records it and who ran it. A locked
    key raises `ServiceValidationError` (`shell_locked`, placeholders `finish`, `stage`).
  Card reads the attribute in `_renderSlide`: `shell.finish` becomes `pet override ??
  world.shell.finish`, ignoring a key it doesn't know. Alternatives: HA option
  (rejected by the owner, 2026-10-29), per-browser (rejected: "per pet"), house view
  (no such view exists; wrong place for a pet-owned setting).
- **Privacy check:** the finish is not about a person; nothing goes to history beyond one
  short string on the existing sensor. `diagnostics.py` needs no redaction. No "set by".

## 5. Monochrome slot

A row in THIS SCREEN: `mono screen`: off / 4 tones / 2 tones (localStorage
`hatch-mono`, default off, same shape as `lcdOn()` 199). `mono screen -> colour ›` opens a
tiny view with the tone strip (`gear-mono-330.png`). Implementation sketch (slice 6):
a class `mono-4` / `mono-2` on `.screen` (the LCD only, not the device plastic, not the
sprites' source files) with a CSS `filter: grayscale(1) contrast() ` plus a
`mix-blend-mode`/`color-mix` ramp to the 2-4 LCD greens (`#e9e2c6 .. #2f3a24`);
a 4-level quantise needs an SVG `feComponentTransfer` discrete table in the card's
shadow root (no images). Must-read check: every mood and status icon still reads in 2
tones, so the acceptance is a bench contact sheet of all moods x stages x 2 tones
(`--preset species --mono 2`, add the flag). Open question whether "reads" fails for
any species: that is a review of the sheet by the owner/art, not a code gate.
The bench seeds it through `storage` like `lcd`.

## 6. Slices (build order)

Each slice ships alone, ends green on `scripts/test`, and a bench look.
1. **Gear + empty sheet + move rows** (card only). Add `icon_gear`, `_settings` view,
   split `_renderStatus` into status and `_renderSettings`; rows move unchanged.
   Check: `scripts/test`; bench `--preset ui` plus new presets `settings` (420/330,
   woodland/tidepool/nightsky, day/night) and `settings-shared`; card-check: open gear,
   toggle sounds/effects, back, Status chip closes both, shared screen hides FOR YOU,
   focus returns; existing card-check rows (notify, my day, baby talk, forget) pass from
   their new place. Bench needs `view: "settings"` (page.js calls `_toggleStatus` +
   `_settings`; add to the README table).
2. **Per-pet finish, server** (shipped, s2506; python, services.yaml, strings only).
   `PetState.shell_finish`, `SHELL_FINISHES`/`SHELL_UNLOCKS` in rates.py, the
   `shell_finish`/`shell_finish_options` attributes, the `virtual_pet/set_shell` ws
   command (the card's only write path) and the `set_shell` service (automations,
   logged), the `shell_locked` exception string. Tests (`tests/test_shell.py`, plus
   test_model, test_channel's `no_pet` loop and `test_busy_attributes_stay_out_of_history`):
   the card's and bench's finish lists match the server's; round-trip, damaged values,
   an unknown key kept and shown as None, salvage on the default; unlocks per stage; a new egg on the
   default; service set/locked/unknown/clear and a reload; a second pet keeps its own;
   ws set/locked/invalid with no `call_service` event and no user on the state change;
   attributes equal across a tick.
3. **Picker, card** (needs 1 and 2). Row, picker view, live preview, use/default/revert,
   locked tiles, the override in `_renderSlide`. Check: bench `finishes` still byte-same
   for no override (regression), new preset `picker` (locked + current, 420/330),
   `scripts/test`; card-check: pick, save, reload page keeps it, default clears it, a
   locked tile does not save, a *second pet* keeps its own, shared screen is read-only.
4. **Earned-shell list and copy** (data + COPY? lines, after owner answers).
   The `SHELL_UNLOCKS` table and its test already shipped in slice 2 (Q3 answered);
   left: the COPY? lines and a picker sheet per stage.
5. **Monochrome** (card only, after 1). The row, `hatch-mono`, the tone filter, a
   bench flag and preset `mono`. Check: sheet of every mood at 2 and 4 tones judged by
   the owner; reduced motion unaffected; `scripts/test`; card-check toggles it and a
   reload keeps it, and it does not cross browsers (localStorage only).
6. **README/docs** and the `dev/bench/README.md` table (view `settings`, `mono`).

## 7. Owner questions (recommendation first)

**Answers (2026-10-30).** Owner: Q3 (a) the show-offs (glitter, glow, smoke, sunset,
constellation, stars) unlock at teen, the rest are open from the start; Q4 (a) the shell
stays through growing up and a new egg starts on its world's default; Q5 (a) 4 tones with
an off switch, 2 tones only as a later step. First mate: Q1 (a) gear top right inside the
status screen (the recorded decision); Q2 (a) shared screens are read-only; Q6 (a) one
scrolling sheet with three headed sections; Q7 the first mate approves every COPY? line
before its slice ships.

1. **Gear place.** (a) Top right inside the status screen, in the LCD *(recommended:
   matches the recorded decision, no header crowding)*; (b) a second chip in the header
   next to Status; (c) a corner of the device body.
2. **Who may change a pet's shell on a shared screen?** (a) Nobody, read-only *(rec.)*;
   (b) anyone; (c) only a person signed in on a personal screen (same as (a) in
   practice, plus an "ask" hint).
3. **Which finishes are earned?** (a) Only the show-offs earned: glitter, glow,
   smoke, sunset, constellation, stars locked until `teen`, rest open *(rec.)*;
   (b) three tiers: open / child / teen+adult; (c) only by egg and adult.
4. **When the pet grows or is reborn,** does the shell stay? (a) Stays through growing,
   resets to the new world's default on a new egg *(rec.: a new pet, a new look)*;
   (b) stays always; (c) always resets.
5. **Monochrome tone count.** (a) 4 tones with an off switch, 2 as a second step
   *(rec.)*; (b) 2 only; (c) 3 (an odd, not real-LCD, number).
6. **Sheet layout at 330.** (a) One scrolling sheet, three headed sections *(rec.)*;
   (b) three tabs (pet / you / screen), nothing scrolls but more taps; (c) split into two
   views ("this screen" is its own page).
7. **Copy.** All new lines are `COPY?` placeholders for the first mate (headings, the
   locked note, the shared note, mono labels).

## Evidence and limits

- Mocks use the real bench card behind hand-drawn LCD views: they show layout and
  overflow honestly, not the real pixel fonts or art. The sheet overflowing the LCD at 330
  is a finding (scroll needed), not a mock bug.
- Not verified: the stage names order in `model.py` for the unlock rule (`life_stage`),
  the exact `pixelIcon` registry for `icon_gear`, translations plumbing. Slice 2/1
  workers confirm. (Slice 2: stage order is `rates.STAGE_STARTS`, egg..adult;
  translations are `strings.json` = `translations/en.json`, kept byte-identical.) `scripts/test` was not run (scout).
- Mocks: gear-status-420, gear-sheet-420, gear-sheet-330, gear-shared-330,
  gear-picker-420, gear-mono-330 (.png), plus base-status-420 (today's status).
