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
  full-LCD picker view ("‹ shell", no pet name; see FM decision 3). The row and the
  heading exist only if the server sends `shell_finish_options` (FM decision 2).
- **Preview:** two parts. (a) Tapping a tile applies it to the *live device* at once, no
  save, so the real shell is the preview and nothing new is drawn. It lives in
  `s.previewFinish`; `_renderSlide` reads `s.previewFinish ?? attribute ?? world.shell.finish`
  and nothing touches `dev` outside it, so a hass update (mood tick, `sun.sun`, rename:
  all rebuild `dev.className` and `--d-*`) cannot wipe it. Slice 3 first extracts
  `_dress(s, key)` from `_renderSlide` (className, `--d-face/ink/ink-top`; it removes
  `--d-ink-top` when the finish has no `top`, today it is never cleared). Both
  `_renderSlide` and the tap call `_dress`. A tap swaps classes (`now`/selected) and calls
  `_dress`; it does not re-render the view, so scroll holds and `s.statusHtml` stays stable.
  (b) `use` saves, `world default` clears the override. Leaving without saving reverts:
  `_closePicker(s)` clears `s.picker` and `s.previewFinish` and re-dresses, and is called
  from every exit: back, `_toggleStatus` (Status chip, screen tap, game start), `_forget`
  (pet change), `_goShared` (here or from another tab via SHARED_EVENT/storage). (A page
  hide has no handler today and the preview survives it harmlessly; a ws failure is in the
  error table, not an exit.) After a successful save, `s.shellPending = key` stays in force in
  `_renderSlide` until the attribute equals it or 5 s pass, so closing before the sensor
  push does not flicker; revert applies to unsaved previews only. A tile is a 26x20 chip
  with the finish's own face colour/tile (`FINISHES[k].tile`, `face(color)`), 3 per row.
- **Tiles:** current marked `now`; the world's own default listed first as "<world>
  (default)". With 24 finishes, 3 per row, the list scrolls (mock shows 9). Group by
  `world plastics / specials / prints` with the same dotted headings.
- **Locked (earned by stage):** shown, dimmed, dashed, with the stage that opens it
  ("teen"); tapping shows the note, never a points price, never hidden (so the pet has
  something to grow toward). Which shells are earned is the owner's pick (Q3). The rule is
  the server's (`model.shell_unlocked`, reached-the-stage, adults keep it); the card never
  recomputes it. Locked = key absent from `shell_finish_options`; its stage comes from
  `shell_locked` (FM decision 1).
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
  still across ticks. **Slice 3 adds `shell_locked: {key: stage}`** beside them (the
  keys of `SHELL_UNLOCKS` the pet has not reached; unrecorded; FM decision 1). Write paths:
  - **The card: websocket only**, `{type: "virtual_pet/set_shell", entity_id, finish:
    <key> | null}`. Errors: `no_pet`, `shell_locked` (not grown into it),
    `invalid_format` (not a finish). No service fallback: a missing command means
    "can't change the shell here", because a service call logs who made it.
  - **Automations:** the `virtual_pet.set_shell` service (`finish` optional; left out =
    the world's own). Its description says history records it and who ran it. A locked
    key raises `ServiceValidationError` (`shell_locked`, placeholders `finish`, `stage`).
  Card reads the attribute in `_renderSlide`: `shell.finish` becomes `pet override ??
  world.shell.finish`, ignoring a key it doesn't know. The ws call goes through
  `callWS` directly with `s.ids["sensor.life_stage"]` (not `_callOwn`, which falls back to
  the service); a missing id is `no_pet`. The server does not check who calls: read-only
  on a shared screen is card-level only, and the service/ws stay open to any logged-in user
  (by design, §3). Alternatives: HA option
  (rejected by the owner, 2026-10-29), per-browser (rejected: "per pet"), house view
  (no such view exists; wrong place for a pet-owned setting).
- **Privacy check:** the finish is not about a person; nothing goes to history beyond one
  short string on the existing sensor. `diagnostics.py` needs no redaction. No "set by".

## 5. Monochrome slot (slice 5; reworked by the s2516 review, see the table at the end)

**Scope (owner, 2026-10-30):** no Apple devices in the household, so build the true
4-tone SVG filter; Chrome/Android/desktop only. **4 tones only** (owner Q5): the row is
`off / on`; 2 tones are parked as a later slice (7), not built or proven here. No
`mono screen -> colour ›` sub-view (FM 3): one toggle, no extra screen.

- **Row:** `mono screen` in THIS SCREEN, a `.bell` toggle like `screen effects here`
  (strings in 6.5). Editable on a shared screen (it is the tablet's own setting, §3).
- **Storage and class:** localStorage `hatch-mono` = `"4"` or absent; default off.
  `monoOn()` is **not** shaped like `lcdOn()` (that one is default-on, `!== "off"`): it
  is `=== "4"` in the same try/catch, and a throwing `localStorage` means off. The
  click handler mirrors the `lcdfx` one: no storage = `return`, nothing changes. The
  class `mono` goes on **`ha-card`** (like `lcd-on`, read at build and toggled at click),
  so every slide and both cards in a tab follow, and the beam (below) is reachable.
  **Cross-tab decision: add a `storage` listener** for `hatch-mono` beside
  `_onSharedStorage` (it only toggles the class; ~6 lines). A wall tablet left on one tab
  and a phone on another is rare but the listener is cheap and card-check can test it.
- **What goes mono (LCD) and what keeps colour (plastic):**
  - Mono: everything inside `.screen` (scene, pet, props, marks, bubble, game, picker,
    journal, status sheet, boot, battery) **and the IR beam** `.irbeam`. The beam is
    appended to `this._track`, a sibling of the devices spanning two of them, so it is
    outside `.screen`; it flies over the glass, so it is LCD (FM 2).
  - Colour: the shell and bezel plastic, `.buttons`, `.label`, and **`.request`** (the
    "wants attention" button: a plastic-style button, FM 2). Its only parent is `.bezel`.
- **The filter:** an inline `<svg>` in the card's shadow root holds
  `<filter id="hatch-mono4">`: `feColorMatrix` to luma, then `feComponentTransfer` with
  `type="discrete"` four-step tables on R, G and B giving the four LCD tones below.
  `ha-card.mono .screen, ha-card.mono .irbeam { filter: url(#hatch-mono4); }`. No
  images, no JS per frame. **Known limit, not a gate:** `filter: url()` pointing into a
  shadow root fails in Safari/WebKit, so iOS and macOS Safari show colour. There are no
  Apple devices in the household; do not test or gate on it. Perf: the filter re-rasterises
  the animating `.screen` (pet, rain, season, bubble typing) each frame; check on the wall
  tablet (Chrome) once, after the bench passes.
- **The four tones** (named from the card's own LCD palette, status and boot at card
  2002-2022; the status panel's cream `#e9e2c6` is a fifth value that maps to the top):
  darkest `#2f3a24`, `#6f7f4f`, `#9aaa72`, lightest `#c6d4a0`. The two mid values are the
  ramp's choice (`#9aaa72` exists in the card; `#6f7f4f` is new). Luma thresholds even
  quarters, tuned in the bench against the pass rule.
- **Status, journal and boot:** remapped like everything else, not exempt. The status
  sheet is already cream/green; cream (`#e9e2c6`) falls in the lightest quarter and maps
  to `#c6d4a0`, a small visible shift in mono only, which is the point of the switch.
  Nothing is drawn twice; one rule, no exemption list.
- **Backlight:** `.glow` is a cyan `mix-blend-mode: screen` layer; inside the filtered
  group it would flip a whole quarter. In mono `.glow` is hidden
  (`ha-card.mono .glow { display: none }`) and `.lit` keeps its `brightness()` lift on
  `.bg` (before the quantise), so a lit screen reads one tone lighter, not a cyan flip.
- **Grid and ghost:** `.lcd` (alpha .08 lines) and `.ghost` (~.35 opacity) are inside
  `.screen`, so a discrete table would snap them to a hard mesh or double the pet. In mono
  both are hidden inside the filtered node. The grid is redrawn **after** the quantise by
  one new overlay `.mono-grid` (a sibling of `.screen` in `.bezel`, before `.request`,
  `pointer-events: none`), same lines and pitch vars as `.lcd` (`_lcdPitch` sets the vars
  on it too). Ghosting is dropped in mono (an LCD afterimage is not worth a second
  quantised layer); say so in the README. Both follow `lcd-on`: with effects off there is
  no grid (`ha-card.lcd-on.mono .mono-grid`).
- **State-dependent input:** day/night/dim/faded/raining/lit are `filter: brightness()`
  on `.bg`/`.pet` (and `.murk`) *before* the parent's filter (the right order). Dim
  (`.5`) can crush pet and background to one tone. This is the main risk and the main
  proof: it is checked per state (below), not assumed from the species sheet.
- **`prefers-contrast: more`** hides `.lcd`/`.ghost` (card 1933); mono keeps applying
  and `.mono-grid` is hidden there too. Mono works with that and with effects off.
  (Replaces "reduced motion unaffected": mono has no motion.)
- **Bench (no fake-hass change):** `storage` already seeds any key, so `shot.mono`
  (like `lcd`) sets `hatch-mono`, plus `--mono on` in `parseArgs`. The bench cannot pin
  `dim`, `faded`, `lit` or `raining` (its `scene` is day/night only): add shot field
  `classes: [...]` applied to the `.screen` (or `scene` values `dim|faded`, `lit`,
  `raining`), per the README rule "add it to the bench". Preset `mono`: the species sheet
  (frame 1, as `species`) plus a **state strip** (one adult, one world, woodland): day,
  night, dim, faded, raining, lit; status sheet, journal, shell picker (slice 3), game
  picker, bubble, boot, and the sick, dirty and attention marks; the IR beam; at 420 and
  330. 4 tones only.
- **Pass rule (mechanical, then an owner look):** for each shot, the pet's mean luma vs
  its background's differ by at least N tone steps (the bench reads two crops; start at
  1 of 4, tune once on `day`) and no shot is a single flat tone. Fail = the shot is listed.
  Then the owner eyeballs the worst 10 by delta. Not a code gate beyond the numeric rule.

## 6. Slices (build order)

Each slice ships alone, ends green on `scripts/test`, and a bench look.
1. **Gear + sheet + move rows** (card only). **Shipped (s2505, 2026-10-30)**, amended by
   the adversarial review (s2504, findings 1-7 and 14-16):
   - Gear: an inline 12x12 pixel SVG (`GEAR_ICON`, drawn at 24 px, `currentColor`),
     not a `ui/icon_gear.png`, so no art step; Sol can replace it later. It sits alone in
     a sticky `.shead` row at the top of the status view (no "status" title, so no
     new copy). Hit area 34x30 px, `aria-label="settings"`. Not filled when open: the
     sheet replaces the status view, so the gear isn't on screen then.
   - Routing: `s.settings` per slide (like `s.journal`), checked at the top of
     `_renderStatus`, which calls `_renderSettings(s)`. Every redraw (hass update,
     row handlers, confirm-tap, `_goShared`/`_goPersonal`) stays in the sheet. The
     rows and all their handlers moved into `_renderSettings`. The status view binds
     only `.jlink` and `.gear`. The `bond &&` guard on my day is kept.
   - The sheet renders into `s.status` only and draws its own `.status-feedback`
     (last, inside the scroll box). `s.settings=false` where `journal` resets: the pet
     change and `_toggleStatus` (so the Status chip, a screen tap and a game start
     close both). `_goShared` keeps the sheet open and redraws it without FOR YOU.
   - Focus: the gear moves it to the back row (`.sback`, "‹ settings"); back moves it
     to the gear. The gear, the back row and the headings `stopPropagation`.
   - Sections: `for you` (absent on a shared screen, heading too) and `this screen`,
     dotted headings, upper-cased by CSS. No FOR <PET> heading until slice 3.
   - New strings awaiting the first mate's sign-off (review #15): gear aria-label
     `settings`, back row `‹ settings`, headings `for you` and `this screen`.
   - Card-check: every moved check opens the sheet (`s.settings=true` or a gear
     click) and resets it after; each negative is paired with a positive in the same
     view; the cross-tab look checks personal rows in whichever view is up. New: gear
     tap keeps the status up and focuses the back row, back focuses the gear, a
     heading tap keeps the sheet, the Status chip closes both, the shared sheet keeps
     THIS SCREEN and drops FOR YOU, a forced forget failure shows its line in the
     sheet, the sheet at 420 and 330 reaches its last row.
   - Bench: `view: "settings"`, a `mine` shot field (bond, notify me, my day, my
     birthday kept), presets `settings` (420/330, woodland/tidepool/nightsky,
     day/night) and `settings-shared`; README table and preset list.
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
3. **Picker, card** (needs 1 and 2; folds the s2513 review, see the table at the end).
   Row, picker view, live preview, use/default/revert, locked tiles, the override in
   `_renderSlide`. Details in §4; here is what is specific to the slice.
   - **Server (small):** `shell_locked: {key: stage}` on `sensor.life_stage` (not
     recorded), plus a test that it equals `SHELL_UNLOCKS` minus the unlocked keys per
     stage and holds still across a tick. No card-side unlock map.
   - **Card:** `_dress` refactor; `s.picker`, `s.previewFinish`, `s.shellPending`;
     `_closePicker` on all six exits; no shell row or heading when
     `shell_finish_options` is undefined; on a shared screen the row is read-only, no
     name in any heading, and the picker is unreachable.
   - **Errors** (all through `_statusMessage` in the picker; the preview reverts to the
     saved finish, the picker stays open; unknown codes get the generic line):

     | Failure | Line key (quoted in the 6.3 strings) |
     | --- | --- |
     | `no_pet` | `err_nopet` |
     | `shell_locked` (also refreshes the options) | `err_locked` |
     | `invalid_format`, no `err.code`, disconnect, timeout | `err_generic` |
     | `unknown_command` (older server) | `err_here` (no service fallback) |
   - **Bench (slice 3 owns it):** shot fields `shellFinish`, `shellOptions`,
     `shellLocked`, `view: "picker"` (+ `preview`), README rows, preset `picker` at
     420/330 and stages egg/teen to show locked and current. `use`, `world default` and
     errors are not benchable: card-check only.
   - **Proof** (no "byte-same": the bench is not deterministic today, s2499):
     (a) a style-snapshot JSON, `dev.className` + `--d-shell/face/ink/ink-top/dark/
     btn-shadow/bezel` from `page.evaluate` for 24 finishes x 3 worlds, before and
     after the `_dress` refactor; the diff must be empty. (b) pixels: `finishes` run
     twice before and once after; a shot counts as changed only if it differs from
     both before-runs and is not in the before-vs-before set; report the noise count.
     Plus `scripts/test`.
   - **Card-check** (scratch HA on its own port, fresh `.storage`, per AGENTS.md; every
     test ends with `world default` and asserts it): pick, save, reload keeps it;
     default clears it; locked tile (a pet below teen) does not save and shows the note
     (unlock at teen needs a model clock: test locked-at-baby and an unlocked key only);
     a second pet keeps its own value (name both dev pets and their stages); "leaving
     without saving reverts" (one per exit path: back, Status chip, pet change, shared
     switch here, shared flip in a second tab); preview survives a mood tick and a
     `sun.sun` flip; closing right after `use` does not flicker; "never hidden" (locked
     tiles present); shared screen read-only with no pet name, picker unreachable;
     older-server attribute absent hides row and heading; each error line.

4. **Earned-shell list and copy** (data + COPY? lines, after owner answers).
   The `SHELL_UNLOCKS` table and its test already shipped in slice 2 (Q3 answered);
   left: owner wording changes to the slice-3 strings (6.3), the stage-specific locked
   note if more stages than `teen` ever unlock, and a picker sheet per stage. Slice 4 adds
   no other lines: every picker line is owned by slice 3, so 6.3 and 6.4 do not overlap.
5. **Monochrome** (card only, after 1; reworked by the s2516 review, §5). Row `mono screen`
   (off/on), `hatch-mono`, `monoOn()`, class on `ha-card`, `storage` listener, the SVG
   4-tone filter on `.screen` and `.irbeam`, `.glow`/`.lcd`/`.ghost` handling and
   `.mono-grid`, bench `mono` shot field, `classes` and preset `mono`. Check: the
   pass rule and the owner's look at the worst 10 (§5); `scripts/test`; card-check toggles
   it, a reload keeps it, a second tab follows through the listener, no storage stays
   off, and it works with effects off and `prefers-contrast: more`. Strings: 6.5.
6. **README/docs** and the `dev/bench/README.md` table (view `settings`, `mono`).
7. **Two tones** (parked, owner Q5: "2 tones only as a later step"). Not started; needs its own pass rule, since 2 tones can merge pet and background on dim.

## 6.3 FM decisions and strings (slice 3)

**FM decisions, 2026-10-30** (first mate, on the s2513 review's questions):
1. The server exposes `shell_locked: {key: stage}` on `sensor.life_stage` beside
   `shell_finish_options`; part of slice 3, with a test that it matches `SHELL_UNLOCKS`.
   No card-side unlock map.
2. Older server without `shell_finish_options`: hide the shell row and the pet heading
   entirely.
3. Shared screen: no pet name anywhere in the picker or row heading; the picker view is
   not reachable there.
4. Proof: style-snapshot JSON diff plus a noise-aware pixel check; "byte-same" is dropped
   from slice 3.

**Slice 3 strings** (signed off by the first mate 2026-10-30, with `err_nopet` changed from "can't find the pet to dress"; lowercase, the card's voice,
checked against the no-nagging rules in `docs/plan-2026-10-28-experience.md` §5: no `?`,
none of "still, again, why, never, pleas, sad, cry, alone, forgot"):

| Where | Proposal |
| --- | --- |
| Row heading, personal screen | "for <pet>" (upper-cased by CSS) |
| Row heading, shared screen | "for the pet" |
| Row label | "shell" |
| Picker back row | "‹ shell" |
| Group headings | "world plastics", "specials", "prints" |
| World's own tile | "<world> (default)" |
| Current marker | "now" |
| Buttons | "use", "world default" |
| Locked tile sub-label | the stage, e.g. "teen" |
| Locked tap note | "I get this one as a teen ♪" |
| Shared read-only note | "ask a grown-up to change it" |
| Saved | "shell saved ♪"; default: "back to the world's own ♪" |
| `err_nopet` | "can't find this pet" |
| `err_locked` | "not grown into that one yet" |
| `err_here` | "can't change the shell here" |
| `err_generic` | "that didn't work, try later" |
| aria: row | "shell: <name>, change" |
| aria: tile | "<name> shell"; locked: "<name> shell, opens at <stage>" |
| aria: use / default | "use <name> shell", "use the world's own shell" |
| aria: back | "back to settings" |

Finish display names (24; the key, except `twotone`): "woodland", "aqua",
"grove", "celestial", "dune", "clear", "glitter", "glow", "speckle", "stripes", "hearts",
"stars", "gingham", "dots", "camo", "waves", "scales", "leaves", "paws", "constellation",
"rainbow", "two-tone", "sunset", "smoke". Groups: world plastics = woodland, aqua, grove,
celestial, dune; specials = clear, glitter, glow; prints = the other 16.
Slice 3 owns all of the above, including the locked and shared notes; slice 4 may only
reword them.

## 6.5 Slice 5 strings (proposals for first-mate sign-off)

Lowercase, the card's voice; checked against the no-nagging rules in
`docs/plan-2026-10-28-experience.md` §5 (no `?`, none of "still, again, why, never,
pleas, sad, cry, alone, forgot"). Existing rows have long aria-labels (card 5055), so
this one follows them.

| Where | Proposal |
| --- | --- |
| Row label | "mono screen" |
| Value, on | "on" |
| Value, off | "off" |
| aria-label (row) | "mono screen: on, change" / "mono screen: off, change" |
| Toggle feedback | none (the screen changes at once; no "saved" line, like effects) |
| No storage | silent (no line exists for effects either) |

Not added: no sub-view title or tone-strip caption (FM 3), no "2 tones" label (parked),
no shared-screen note (the row stays editable there).

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

## Review fold (s2513)

Report: 18 findings (14 player-impact, 4 nit), verdict FIX FIRST. Each was re-checked
against the card, the server and the bench on 2026-10-30 (code lines moved since the
report: `_renderSlide` is about 3509, not 3365). All 18 hold except where noted.

| # | Finding | Re-check | Landed |
| --- | --- | --- | --- |
| 1 | Preview wiped by redraw | holds (`own` joins `last_updated` and `sun.sun`) | §4 Preview: `s.previewFinish` |
| 2 | No callable "same code" | holds | §4: `_dress` extracted first |
| 3 | "byte-same" unprovable | holds (bench nondeterministic) | FM 4; 6.3 Proof |
| 4 | Stale `--d-ink-top` | holds (never cleared) | §4 `_dress`; snapshot proof |
| 5 | Revert paths unlisted | holds, **corrected**: page hide has no handler and a ws failure is not an exit; the exits are back, `_toggleStatus`, `_forget`, `_goShared` | §4 `_closePicker`; 6.3 card-check per exit |
| 6 | Save/refresh race | holds | §4 `s.shellPending` |
| 7 | Two sources for locked | holds | FM 1; `shell_locked` in §4, 6.3 |
| 8 | Older server | holds (`_callOwn` falls back to service) | FM 2; §4 uses `callWS` |
| 9 | ws errors unsurfaced | holds | 6.3 error table; strings |
| 10 | Pet name on shared | holds | FM 3; strings |
| 11 | Read-only is card-only | holds (`set_shell` ws has no user check) | §4 Write paths; card-check flip in second tab |
| 12 | Copy not quoted | holds | 6.3 strings; slice 4 narrowed |
| 13 | Bench cannot show picker | holds (fake hass has no attrs, `callWS` returns `{}`) | 6.3 Bench |
| 14 | Card-check thin, mutates pet | holds | 6.3 card-check (scratch HA, `world default` ends each test) |
| 15 | `stage_rank >= n` wording | holds | §4 Locked rewritten |
| 16 | Entity-id source | holds | §4 Write paths |
| 17 | Tile count, scroll | holds | §4 Preview: tap swaps classes only |
| 18 | Claims without a test | holds | 6.3 card-check names both |

## Slice 3 reconcile (s2515, 2026-10-30)

Shipped as planned: `shell_locked` on `sensor.life_stage` (unrecorded, holds across a
tick, test per stage), `_dress`, `s.picker` / `s.previewFinish` / `s.shellPending`,
`_closePicker` from back, `_toggleStatus`, `_forget` and `_goShared`, the row and
headings, the picker, locked tiles, `use` / `world default`, the error table, shared
read-only, the older-server hide, `callWS` only. Copy: only the 6.3 strings.

Where it differs from the plan:
- **`shellPending` starts at the `use` tap**, not after the reply. Closing the picker
  before the websocket answered would otherwise flash the old shell. A failure clears it.
- **The world's own finish is listed once**, as the first tile "<world> (default)".
  It does not appear again under its group. That tile saves `null`, so `now` sits on it
  whenever the pet has no pick, or has picked its world's own key (an automation can
  do that). The row shows the same "<world> (default)" text for the world's own.
  Hearth has no `shell.finish`, so its default tile is the plain world colour.
- **Tile swatches** are drawn from a copy of each plastic's band colours
  (`SWATCH_BANDS`, from the `.finish-<key>` CSS) plus the print tiles. A new finish or
  a recoloured plastic must update that copy too.
- **A card-side 10 s timeout** on the save maps to the generic line.
- **Pixel proof:** the bench is far noisier than s2499 measured. Across 4 runs of the
  old code, 343 of the 576 `finishes` shots differed somewhere, and a 4th old-code run
  against 3 others still had 87 shots with pixels none of them had. So the planned
  "2 before, 1 after" test can't separate a change from noise. Instead: per pixel, an
  after pixel counts only if no before-run had that value there. The after runs gave
  99 and 82 such shots, inside the same-code control's 87. The style-snapshot diff
  (6 worlds x 24 finishes x day/night, className + 7 vars) is empty, and that is the
  real proof.
- **The `_forget` exit** is driven in card-check by calling `_forget` on the slide; a
  real device swap isn't staged.
- **Bench:** besides the planned fields, a `scroll` shot field (the picker list scrolls)
  and two sheets, `picker-card` and `picker-screen`.

For slices 4-5:
- **The locked note is the literal "I get this one as a teen ♪"** for any stage. If a
  stage other than teen ever unlocks something, slice 4 needs the stage-specific line.
- **A swipe (`_go`) closes the picker it leaves** (first mate, 2026-10-30), a fifth exit
  with its own card-check. `use` on the world's own tile reads "use the world's own shell".
- The back row and the `use` / `world default` bar are full-width opaque bands. Between
  them the LCD shows two whole rows of tiles at 330 (tighter compact spacing) and a bit
  more at 420. The list scrolls; a status line sits above the bar.
- Monochrome (slice 5) should check that the swatches still read, or skip them.

## Review fold (s2516)

Report: 15 findings (10 player-impact, 5 nit), verdict FIX FIRST. Each was re-checked
against the s2515 card (`origin/crew/hatch-at-home-s2515-gear-slice-3-per-pet-shell-pic`,
2026-10-30; the report's line numbers still match). All 15 hold; #6 and #13 are adjusted.

| # | Finding | Re-check | Landed |
| --- | --- | --- | --- |
| 1 | IR beam and `.request` outside `.screen` | holds (`_track.append(beam)` 6916; `.request` sibling in `.bezel`) | §5 what goes mono; FM 2: beam LCD, `.request` plastic |
| 2 | `.glow` blend flips under quantise | holds (1801-1809) | §5 backlight: hide `.glow`, `.lit` via brightness; `lit` bench shot |
| 3 | Grid/ghost quantised | holds (1783-1793) | §5 grid and ghost: `.mono-grid` after the filter, ghost dropped |
| 4 | Dim/night/faded/raining change the input | holds (1597-1599, 1807-1809, 1980, 2137) | §5 state-dependent input; per-state shots in the pass rule |
| 5 | Palette: two endpoints, not four | holds (1997, 2002-2022) | §5 four tones named; status/boot remapped, no exemption |
| 6 | SVG filter in a shadow root fails in Safari; per-frame cost | holds, **adjusted**: owner has no Apple devices, so the SVG filter stays and Safari is a known limit, not a gate; the report's gradient-map fallback is dropped. Perf on the wall tablet (Chrome) kept | §5 filter, known limit |
| 7 | 2 tones contradict Q5 | holds | Decision FM 1: 4 tones only; slice 7 parked |
| 8 | `species` preset cannot prove states | holds (bench.js 62-80) | §5 bench: preset `mono`, state strip, pass rule |
| 9 | Cross-tab and multiple cards | holds (only `SHARED_KEY` listens, 3204; `lcd-on` 2617, 5137) | §5 class on `ha-card`; `storage` listener decided yes |
| 10 | `lcdOn()` shape is wrong for default-off | holds (230-236) | §5 `monoOn()` is `=== "4"`, no storage = off |
| 11 | Slice number wrong | holds | the build slice is 5; slice 6 stays docs |
| 12 | Reduced motion vs `prefers-contrast` | holds (1933) | §5 `prefers-contrast` and effects off |
| 13 | Bench cannot pin lit/dim/faded | holds, **adjusted**: no fake-hass change is needed (storage seeds; the report's ask is only the shot field and `classes`) | §5 bench |
| 14 | Copy not quoted; sub-view | holds | 6.5 strings; FM 3 drops the sub-view |
| 15 | Naming ("color", "green") | holds | FM 4: row name `mono screen` |

**Decisions (2026-10-30):** owner: no Apple devices, true 4-tone SVG filter, Safari
shadow-root limit noted only. First mate: 1 slice 5 is 4 tones (row off/on, 2 tones
parked); 2 beam is LCD, `.request` plastic; 3 no `colour ›` sub-view; 4 row name
`mono screen`.
