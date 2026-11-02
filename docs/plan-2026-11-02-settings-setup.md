# Settings and new-pet setup, 2026-11-02 (build plan)

**Status: PLAN, docs only.** Written by s2657 from the settings review (s2655,
`~/.local/state/crew/research/settings-review.md`) and the owner's answers to it
(2026-11-01 ~23:50, quoted in §1). The owner's answers win over the review. Every
player line and flow label here is **DRAFT** until the first mate approves it
(decisions 2026-10-28, "How the crew works"). Line numbers are from `018cecc1`;
names win over numbers.

Sources read: the review, `plan-2026-10-28-experience.md` PR 4b (748-775) and its copy
table (C12-C15, 973-976), `plan-2026-10-31-next-stages.md` (the 2026-10-30 deferral of
4b), `decisions-2026-10-28.md`, `plan-2026-10-30-settings-gear.md` §3 (shared screens).

## 0. Summary

| # | Slice | Size | Tier | Touches |
|---|---|---|---|---|
| S1 | Setup pre-selects the first unused world | S | 1 | `config_flow.py` |
| S2 | Next egg in the lay confirm (4b, reshaped) | M | 1 | card |
| S3 | Name the new generation in the card | M | **2** | `__init__.py` (ws), `coordinator.py`, card |
| S4 | First-run links: empty state, welcome, "connect more ›" | S | 1 | card, `coordinator.py` (welcome text) |
| S5 | Options split into a menu | M | **2** | `config_flow.py`, `strings.json`, `translations/en.json` |
| S6 | Reconfigure copy and the world label | S | 1 | `config_flow.py`, strings, `docs/guide.md` |
| S7 | Settings sheet: bedtime line, sub-headings, shared screen apart | S-M | **2** | `sensor.py`, card |
| S8 | Opt-in "make a Pets dashboard" at setup | M | **2** | `config_flow.py`, strings, a new `dashboard.py` |

Build order is the table order. Two lanes can run side by side: **card** (S2 → S3 →
S4 → S7) and **flows** (S1 → S5 → S6 → S8). S3 and S6 both touch the reconfigure
description, so S6 goes after S3. S8 goes last: it is the only slice on HA internals.

Five owner questions are left (§11). Each has a recommendation, and no slice is
blocked by one: each slice builds the recommendation unless the owner says otherwise.

## 1. The owner's decisions this plan builds (2026-11-01)

Quoted from the review's "Owner decisions":

- **Q1:** "YES build in-card next-egg choice (4b) in the lay confirm: raised creatures +
  'surprise me'. Revisits the 2026-10-30 deferral." → S2.
- **Q2:** "name a new generation IN THE CARD, ANY logged-in user, right after laying (new
  virtual_pet/rename; 20 chars)." → S3.
- **Q3:** "links (empty-state 'Add a pet ›' for admins, welcome says add the shelf card,
  'connect more ›' deep link) PLUS an opt-in setup checkbox that creates a Pets dashboard
  with the card." → S4, S8.
- **Q4:** "SPLIT Options into a menu now (House, People & privacy, Bedtime, Notifications,
  ...; builder proposes)." → S5.
- **Q5:** "bedtime/wake stay admin options; card shows a read-only line." → S7.
- **Q6 (FM, obvious):** "setup pre-selects the first world not already used." → S1.

Earlier decisions kept: 4b's offer is raised creatures plus "surprise me" (experience
Q8), and choosing is allowed on a shared screen (A10). Settings open from the gear
(decisions 2026-10-28). On a shared screen, THIS SCREEN stays editable and the pet's
shell is read-only (settings-gear §3).

## 2. Copy rules for this plan

- Card lines: lowercase, short (**≤ 40 characters**, counted with the longest name, 20
  characters), the pet's warm tone, no guilt, no nagging. `♥`/`♪` sparingly.
- HA flow labels and help: plain sentence case, no pet voice, no jargon a household
  member wouldn't use.
- Every new string is quoted below as **DRAFT**. A builder adds no string that is not
  here. Changing one goes back to the first mate.
- Existing strings that a slice reuses are marked "(existing)".

---

## S1. Setup pre-selects the first unused world (S, tier 1)

Review M7, owner Q6.

- **Change:** in `async_step_user` (`config_flow.py:170-206`), the World default is the
  first world in catalog order that no existing entry uses. "Uses" means its
  `data[CONF_WORLD]` **or** its `data[CONF_NEXT_WORLD]` (a pet already moving there
  counts). If every world is used, the default stays `DEFAULT_WORLD`. An entry with no
  `CONF_WORLD` (from before worlds) counts as `DEFAULT_WORLD`.
- The player can still pick any world. Nothing is saved differently.
- **Files:** `config_flow.py`, `tests/test_init.py` (or a new `tests/test_config_flow.py`).
- **Acceptance:** with no pets, the default is Woodland; with a Woodland pet, the default
  is the next world in catalog order; with a pet whose `next_world` is that world, the
  one after; with every world taken, Woodland.
- **Tests:** pytest on the user step's schema default for those four cases.
- **Copy:** none.
- **Out of scope:** steering creatures across devices (two devices in different worlds
  never share a roster, so nothing else is needed).

## S2. Next egg in the lay confirm (M, tier 1)

Review H1, owner Q1, experience PR 4b reshaped (the forms book stays deferred, so 4b's
"hatch one next" on the creature page is out).

### The flow

Today: the request button reads "lay an egg?" (existing); the first tap arms it, the
second tap within 4 s lays (`confirmTap`, card 2083-2096; handler 4281-4286).

New, **when the offer has at least one raised creature**:

1. Tap "lay an egg?": instead of arming, the status box opens the **lay sheet** (the
   same box the journal and settings use, `_setStatus`).
2. The sheet shows the offer as a short list: **"surprise me"** first, then each raised
   creature by name. The current choice is marked. A tap on a creature calls
   `select.select_option` on `select.<pet>_next_egg` at once (the choice is the next
   egg's, even if the player then backs out; that is how the select works today).
3. **"lay the egg"** lays it (`button.press`, as `_press(s, "lay_egg")` does). This tap is
   the confirm: the sheet is the deliberate second step, so the 4 s window does not
   apply inside it. A fast double tap on the request button must not lay (the first tap
   opens the sheet; the button is no longer under the finger).
4. **"‹ not yet"** closes the sheet. Nothing is laid.

**When the offer is only "surprise me"** (the first generation, or a world change with
nothing raised in the new world): today's two-tap arm, unchanged. No sheet for one
choice.

### The offer

- As 4b: **the select's `options` ∩ creatures raised here**, plus "surprise me". The
  select's options already follow `next_world` (`coordinator.egg_roster`, 458-463), so a
  world change offers only the new world's raised creatures, and the server never
  rejects an offered choice (`async_set_egg_choice`, 2957-2963).
- **"Raised here"** = the forms book's known set: the union of `raised` over this card's
  pets in that world (card 8695-8698), so the sheet and the book reveal the same
  creatures. Map species ids to names through `egg_species_names` (the select's own
  options), never `species.json`.
- Order: the select's option order (catalog order).

### Rules

- **Shared screen: allowed** (A10), like laying.
- **Read-only login:** `select_option` refuses. The sheet stays, the choice reverts, and
  the status feedback says C13' (below). Laying itself refuses for them already.
- After laying, the egg screen shows C15' when a creature was chosen, as a line on the
  screen (an egg doesn't talk), once on each screen (a `oncePerDay`-style key on the
  device and generation).
- The status "next egg" row (8046) shows **for every adult**, reading "surprise" with
  nothing picked (4b). On the egg it keeps its "hatching" label (existing).
- Nothing new is saved; `egg_choice` exists (`model.py:587`) and is copied to the egg
  at lay time (1961).

### Copy (DRAFT)

| Id | Where | Line | Chars |
|---|---|---|---|
| N1 | lay sheet heading | "a new egg" | 9 |
| N2 | lay sheet prompt | "who should hatch?" | 17 |
| N3 | first choice | "surprise me" | 11 |
| N4 | confirm button | "lay the egg" | 11 |
| N5 | back button | "‹ not yet" | 9 |
| N6 | lay button aria-label | "lay the egg: <name> retires to the journal and a new egg takes its place" | aria |
| C13' | refused (read-only login), status feedback | "this login can't choose, sorry" | 30 |
| C15' | egg's first look, a creature chosen | "a <creature> is coming" | ≤ 38 |
| N7 | status row value, nothing picked | "surprise" | 8 |

C13' and C15' replace experience C13 ("only someone who can change things can pick", 44
characters) and C15 ("a <creature> is on the way", 42 with "Mexican red-knee tarantula"),
both over the limit. Creature names show lowercase, as the status row does.

### Files, acceptance, tests

- **Files:** `hatch-pet-card.js` (request handler, a `_renderLaySheet`, the status row),
  `scripts/card-check.js` (section `play` holds the lay confirm, 2146-2243; `egg`),
  `scripts/bench.js` + `dev/bench` (a `view: "lay"` shot).
- **Acceptance:** a person chooses the next egg and lays it without leaving the card; an
  unraised creature is never offered; the server never rejects an offered choice; a
  first-generation pet lays with today's two taps.
- **Tests (card-check):** with two raised creatures, the first tap opens the sheet and
  nothing is pressed; a creature tap calls `select_option` with its **name**; "lay the
  egg" presses `lay_egg` once; "‹ not yet" presses nothing; an unraised creature is
  absent; with `next_world` set only that world's raised creatures show; with none
  raised, the old two-tap arm still works (the existing `play` checks pass unchanged);
  a refused `select_option` shows C13'; it works with `sharedScreen()` on; the status
  row reads "surprise" for an adult with nothing picked. **Bench:** the sheet in two
  worlds, 330 px and full width, big text on.
- **Out of scope:** the forms book's "hatch one next" (C12; the book stays deferred);
  previewing the egg's inherited trait; the HA select's option list (owner question
  Q-A, §11).

## S3. Name the new generation in the card (M, tier 2)

Review H2, owner Q2. Tier 2: it writes the entry title, the device name and
`state.name`.

### The server: `virtual_pet/rename`

```
{type: "virtual_pet/rename", entity_id, name}
```

- **Who:** any logged-in user (owner). A login without control permission on the pet's
  entity (`user.permissions.check_entity(entity_id, POLICY_CONTROL)`) is refused with
  `read_only`, as the select refuses them.
- **When:** only while the pet is an **egg or a baby** (the first 24 hours of a
  generation, `STAGE_STARTS`). Otherwise `not_now`. That is "right after laying" with
  room for a family to agree, and it stops a casual rename of an older pet. The first
  generation gets the same window (harmless). Admins keep Reconfigure for any time.
- **Validation:** strip, collapse inner spaces, NFC; 1-20 characters (`len` after NFC);
  no control characters. Refused with `bad_name`. A name another pet here already has
  (casefold, against the other entries' titles) is refused with `taken`: Assist finds
  pets by name, and two "Pip"s break "feed Pip".
- **What it writes, in order:** `async_update_entry(entry, title=name, data={**data,
  CONF_NAME: name})`; the device registry's `name` (`dr.async_update_device(device.id,
  name=name)`), so the device page and the entity names follow without a reload; then
  `_sync_name()`, save, publish. **No reload** (`OptionsFlowWithReload` and Reconfigure
  reload; this must not, or the card flickers on the egg moment).
- **`name_by_user`:** `_sync_name` prefers the device's `name_by_user` (1125). If an
  admin renamed the device in HA, a card rename would silently not show. Owner question
  Q-C (§11); the recommendation is to clear `name_by_user` on a card rename.
- **Kept:** entity IDs (as Reconfigure, `guide.md:395`); the journal's record of the old
  generation keeps the old name (it was copied at lay time, `model.py:1945`).
- Like `set_shell`, it is a websocket command, so who renamed isn't recorded.
- **Privacy:** no new personal data. The name already shows on every screen and sensor.

### The card

- **Right after laying** (the `lay_egg` press succeeds on this screen): the status box
  opens the **name sheet**: a text field prefilled with the current name (`maxlength`
  20), "name it" and "keep <name>". Only the screen that laid opens it.
- **Any screen, while egg or baby:** the status page gets a row "name" with the pet's
  name and a "change" button that opens the same sheet. Gone once a child.
- **Shared screen:** owner question Q-B (§11); the recommendation is allowed, as laying
  is (A10).
- On success the bubble says N13 and the sheet closes. On a refusal the field stays
  with the error line under it.
- The keyboard: Enter submits, Escape is "keep". The field gets focus when the sheet
  opens (it opens from a tap, so a phone keyboard rising is expected).

### Copy (DRAFT)

| Id | Where | Line | Chars |
|---|---|---|---|
| N8 | name sheet heading | "a name for the egg?" | 19 |
| N9 | save button | "name it" | 7 |
| N10 | keep button | "keep <name>" | ≤ 25 |
| N11 | status row label / button | "name" / "change" | 4 / 6 |
| N12 | field aria-label | "the new egg's name, up to 20 letters" | aria |
| N13 | saved, bubble | "<name>! I like it ♥" | ≤ 33 |
| N14 | `bad_name` | "a name needs 1 to 20 letters" | 28 |
| N15 | `taken` | "another pet here has that name" | 30 |
| N16 | `not_now` | "only a new egg or baby can be named" | 35 |
| N17 | `read_only` | "this login can't name, sorry" | 28 |
| N18 | anything else | "hm, that name didn't stick ♪" | 28 |

N13 is said by the pet (an egg can't talk: on the egg it shows as the status feedback
instead of a bubble).

### Files, acceptance, tests

- **Files:** `__init__.py` (register `websocket_rename`), `coordinator.py`
  (`async_rename`), card (`_renderNameSheet`, the status row), `scripts/card-check.js`
  (`egg`, `sharedscreen`), `tests/test_rename.py` (new), bench (`view: "name"`).
- **Acceptance:** after laying, anyone names the egg in the card in two taps and some
  typing; the name shows on every screen, in HA's device page and in notifications at
  once, with no reload; entity IDs are unchanged.
- **Tests (pytest):** a rename updates the entry title, `data[CONF_NAME]`, the device
  name and `state.name`, saves, and does not reload; 21 characters, empty, all spaces
  and a control character are `bad_name`; another pet's name in another case is
  `taken`; its own current name is fine (no-op); a child is `not_now`; a read-only user
  is `read_only`; unknown entity is `no_pet`; the old generation's journal record keeps
  the old name; `name_by_user` follows Q-C. **Card-check:** the sheet opens after a lay
  on that screen only; "name it" sends `{type: "virtual_pet/rename", name}`; each error
  key shows its line; the status row shows on egg and baby, not child; shared screen
  per Q-B. **Bench:** the sheet with an empty, a 20-character and an error state.
- **Out of scope:** renaming entity IDs; a rename history; naming from Assist; changing
  Reconfigure itself (S6 changes only its words).

## S4. First-run links (S, tier 1)

Review H3 a+b and M1, owner Q3 (the links half; the dashboard half is S8).

### Empty state (card 4488-4499)

- With no pets and no configured entities, an **admin** (`hass.user.is_admin`) gets a
  button **N19** under the existing sub-line. It navigates (as "connect more ›" does,
  `history.pushState` + `location-changed`) to HA's add-integration dialog for
  `virtual_pet`. A non-admin sees today's text only.
- **The link** (verify on the dev HA first, then pick): `/_my_redirect/config_flow_start?domain=virtual_pet`
  (HA's own "My" redirect, handled by the frontend with no internet) or
  `/config/integrations/dashboard/add?domain=virtual_pet`. Neither is tested in this
  repo yet. If neither opens the dialog, fall back to the integrations page
  (`/config/integrations/dashboard`) and say so in the report.
- "Pet not found" (entities configured but gone) is unchanged.

### "connect more ›" and the clock-only pet (card 8079-8080, 8138-8143)

- The link goes to **this pet's** entry, not the integration list. Try
  `/config/integrations/integration/virtual_pet#config_entry=<entry_id>` (the entry id
  from `hass.devices[<device>].config_entries`); if the dev HA doesn't highlight the
  entry, use the device page `/config/devices/device/<device_id>` (it has the entry's
  Configure).
- **The status page**, for an admin on a personal screen, when `senses` is an empty list:
  the row "notices: just the clock" with "connect more ›" (both existing), above the
  log. Hidden once anything is mapped, hidden for non-admins and on shared screens.

### The welcome (coordinator `_welcome`, 2421-2444)

- With a dashboard set, unchanged ("[Open the pet shelf](…)", existing).
- With **no** dashboard, the **sidebar** note (persistent notification) gets N20. The
  phone push (only to people who already have another pet's "notify me") is unchanged:
  they already have a card.

### Copy (DRAFT)

| Id | Where | Line | Chars |
|---|---|---|---|
| N19 | empty state button, admins | "add a pet ›" | 11 |
| N20 | welcome sidebar note, no dashboard (plain) | "To meet {name}, add the Hatch at Home pet shelf card to a dashboard." | notification |
| — | status row | "notices" / "just the clock" / "connect more ›" (existing) | — |

### Files, acceptance, tests

- **Files:** card (`_renderEmpty` part of the shelf update, `_renderStatus`, the
  `.connect` handler), `coordinator.py` (`_welcome`), `notify.py` (N20 next to
  `welcome`), `tests/test_welcome.py`, `scripts/card-check.js` (`shelf`, `prefs`).
- **Acceptance:** a new admin with an empty card reaches the Add dialog in one tap; an
  admin on a clock-only pet sees that on the status page and reaches that pet's
  options in one tap; a welcome with no dashboard tells the admin to add the card.
- **Tests:** pytest: the sidebar note carries N20 without a dashboard and the link with
  one; the phone text never carries N20. Card-check: the empty state has N19 for an
  admin and not for a user; its click navigates to the chosen path; "connect more ›"
  navigates to the entry/device path; the status "notices" row shows only for an admin,
  personal screen, empty `senses`. The verified deep links go in the report with the HA
  version they were checked on.
- **Out of scope:** driving the config flow from the card (review §5: admin-only REST,
  fragile; deep link instead); a setup wizard.

## S5. Options split into a menu (M, tier 2)

Review M2, owner Q4. Tier 2: it changes how the options are saved; a bug here wipes a
household's mappings.

### The menu

`async_step_init` becomes `async_show_menu(step_id="init", menu_options=[...])`. Each
topic is its own small form step. Proposed topics, in this order (privacy moves up next
to people, as the review asks):

| Step id | Menu label (DRAFT) | Fields (keys unchanged) |
|---|---|---|
| `bedtime` | Bedtime | `bedtime`, `wake_time`, `bedtime_lights`, `motion` |
| `people` | People and privacy | `zone`, `away_after`, `sitter_settles`, `privacy`, `house_words_private` |
| `weather` | Weather and air | `rain`, `weather`, `indoor_temperature`, `comfort_low`, `comfort_high`, `aqi`, `solar` |
| `room` | The pet's room | `room_lights`, `fireplace`, `lux`, `tv`, `music` |
| `house` | The house helps | `heating`, `cooling`, `notice_robot`, `notice_doorbell`, `appliances`, `appliance_watts`, `chores` |
| `sky` | Moon and sky | `moon_phase`, `moon_illumination`, `moon_altitude` |
| `notifications` | Notifications | `dashboard` |

TVs and music move to the room (they are things playing in it); chore lists move to the
house. Every key keeps its name, so **no migration** and no `MINOR_VERSION` bump.

### Saving: one topic at a time

- A topic's **Submit saves and closes** (`async_create_entry`). No "done" hub: nothing is
  lost if the dialog is closed half-way. `OptionsFlowWithReload` reloads once per save,
  as today.
- **The merge rule (the risky part):** `new = {k: v for k, v in options.items() if k not
  in topic_keys} | entered`, where `entered` drops `None`, `""` and `[]`, as today. So
  every other topic's values are kept exactly, and clearing a field in this topic
  removes only that key.
- Temperatures: the °C conversion (`_to_celsius`/`_to_unit`) and `dashboard_path` apply
  inside their topics as today.
- Errors stay on their topic: `comfort_range` on weather, `same_times` on bedtime,
  `fireplace_temperature` on room (each is within one topic).
- A field with a default stays `Required` (today's behaviour, review L2 skipped, §10).
  Opening a topic and saving it writes that topic's defaults only, not every topic's.
- **Existing entries keep all values**: nothing is read or written outside the topic.
- The form's title placeholder `{name}` stays (`description_placeholders`).

### Copy (DRAFT; plain labels, M2)

- Menu (`options.step.init`): title "What {name} notices" (existing); description
  "Pick what to connect. Every field is optional; anything left empty is ignored."
- Each topic's description: **at most two sentences**. Drafts:
  - Bedtime: "Lights out always wins. Otherwise the pet goes to bed when the bedtime lights are off and the house is quiet, and wakes at wake time."
  - People and privacy: "Who is home decides whether the pet is with you or at the sitter's. The privacy switches decide what dashboards and sensors may show."
  - Weather and air: "The pet sees the weather outside and feels the room's temperature and air. It never gets sick from them."
  - The pet's room: "Lights, a fireplace, the TV and music change the pet's scene and mood."
  - The house helps: "Heating, cooling and appliances give the pet something to notice and help with. A robot vacuum or the doorbell can startle it."
  - Moon and sky: "Optional: the moon sensors make the night sky match yours."
  - Notifications: "Phone notifications go to whoever taps "notify me" on the pet's status screen." (existing)
- Label changes (others unchanged):

  | Key | Today | DRAFT |
  |---|---|---|
  | `weather` | Weather forecast | Weather |
  | `aqi` | Air quality index | Air quality sensor |
  | `solar` | Solar radiation (optional) | Sunlight sensor |
  | `notice_robot` | Notice robot vacuums | Robot vacuums |
  | `notice_doorbell` | Notice doorbells | Doorbells |
  | `appliance_watts` | Idle power | Counts as off below |
  | `away_after` | Go to the sitter's after | Off to the sitter's after |

- **Privacy blurbs (M5).** The privacy fields' `data_description` say what each covers
  and point at the card's switch:
  - `privacy`: "On: an empty house shows the pet napping, never at the sitter's, and the pet never names anyone on sensors. For a wall tablet, also turn on "shared screen" in the card's settings." (DRAFT; the first sentence is existing.)
  - `house_words_private`: existing text, unchanged.
  - The old section blurb "For wall tablets and shared dashboards." goes (it described the card's switch).

### Files, acceptance, tests

- **Files:** `config_flow.py` (`_sections` → `_topics`, `async_step_init` → menu, one
  `async_step_<topic>` each sharing one `_topic_step(name, user_input)`), `strings.json`
  and `translations/en.json` (kept identical, as today), `tests/test_config_flow.py`.
- **Acceptance:** the Configure dialog opens on the menu; each topic shows only its
  fields with today's values; saving one topic leaves every other option byte-for-byte
  unchanged; clearing a field removes only that key; each validation error shows on its
  topic.
- **Tests (pytest, `hass.config_entries.options`):** for an entry with every option set,
  saving each topic unchanged leaves `entry.options` equal; clearing `tv` in room
  removes `tv` only; `comfort_low ≥ comfort_high` errors on weather and saves nothing;
  `same_times` errors on bedtime; a °F house round-trips the comfort values; an entry
  with empty options gets only the opened topic's defaults; every menu option and step
  has its strings (a test over `strings.json`, so a missing label fails). The card-check
  is unaffected (options are HA-only), but the pick-sections run must still pass.
- **Out of scope:** new options; storing only non-default values (L2); editing options
  from the card (owner Q5: admin only).

## S6. Reconfigure copy and the world label (S, tier 1)

Review M3 and L4. After S3 (the description changes because naming moved) and S5
(strings).

- **Title:** "Rename {name} or change its world" (DRAFT; replaces "Rename or move
  {name}").
- **Description (DRAFT):** "A new name shows on the card and in notifications; entity
  IDs stay the same. A new egg can be named on the card for its first day, too. A new
  world changes the device and which creatures hatch."
- **Two step ids.** `async_step_reconfigure` shows `step_id="reconfigure"` for a pet
  still in its egg (or unloaded with unknown hatch state, as today), and
  `step_id="reconfigure_hatched"` for a hatched pet, with its own
  `async_step_reconfigure_hatched` sharing the submit code. Labels:
  - `reconfigure.data.world`: "World" (existing).
  - `reconfigure_hatched.data.world`: "World for the next egg" (DRAFT), with
    `data_description`: "{name} stays where it is. Its next egg starts in this world."
    (DRAFT).
- **Guide (L4 and the glossary):** one paragraph in `docs/guide.md`: world = which
  creatures hatch and the device's look; shell finish = this pet's colour, picked on
  the card; a rename keeps entity IDs (existing line 395, moved next to it).
- **Files:** `config_flow.py`, `strings.json`, `translations/en.json`, `docs/guide.md`,
  `tests/test_init.py`.
- **Tests:** pytest: an egg gets `reconfigure`, a hatched pet `reconfigure_hatched`;
  submitting either keeps today's world rules (egg moves now, hatched waits in
  `next_world`), already covered by the existing reconfigure tests, which must pass
  unchanged.
- **Out of scope:** changing what Reconfigure does.

## S7. Settings sheet: bedtime line, sub-headings, shared screen apart (S-M, tier 2)

Owner Q5 (read-only bedtime), review M4 and M5 (card half). Tier 2 because a new sensor
attribute shows an admin-only option (the household's bedtime) to every login.

### The bedtime line

- **Server:** `sensor.<pet>_life_stage` gets `sleep_times: {"bedtime": "HH:MM",
  "wake": "HH:MM"}` from the options (defaults when unset). Added to
  `_unrecorded_attributes` (not in history). It is the pet's schedule, not a person's,
  so it shows on shared screens too.
- **Card:** in the "for <pet>" group of the settings sheet, under "notices": a read-only
  row **N21**, times in the viewer's HA time format (`hass.locale.time_format`, 12/24 h).
  No edit control for anyone; an admin already has "connect more ›" just above.

### Sub-headings and the shared screen

- "this screen" splits into two small sub-headings, **look** (screen effects here, mono
  screen, big text, holiday names) and **sound** (sounds here, babble). localStorage keys
  unchanged.
- **shared screen** moves to its own heading at the bottom, with its existing note
  ("a family tablet? …", existing) and one new line N24 pointing at the HA option.

### Copy (DRAFT)

| Id | Where | Line | Chars |
|---|---|---|---|
| N21 | row label / value | "bedtime" / "bed 23:00 · up 07:00" | 7 / 20 (12 h: "bed 11:00 pm · up 7:00 am", 25) |
| N22 | sub-headings | "look", "sound" | 4, 5 |
| N23 | heading | "shared screen" (the row keeps its label) | 13 |
| N24 | note, admins only | "sensors too? see the privacy options" | 36 |

### Files, acceptance, tests

- **Files:** `sensor.py`, `tests/test_recorded.py` (the attribute unrecorded), card
  (`_renderSettings`), `scripts/card-check.js` (`prefs`, `sharedscreen`), bench (`ui`
  preset's settings shots).
- **Acceptance:** everyone sees the pet's bedtime and wake time on the settings sheet and
  can't change them; the sheet's "this screen" reads as two short groups; the shared
  screen switch is on its own at the bottom.
- **Tests:** pytest: `sleep_times` follows the options and the defaults, and is not
  recorded. Card-check: the row shows on personal and shared screens with the right
  times and no button; N24 only for admins; every existing `prefs` row still toggles
  (the move changes no handler). Bench: the sheet at 330 px, personal and shared, big
  text on.
- **Out of scope:** editing bedtime in the card (owner Q5); a PIN for the shared screen
  (settings-gear §3).

## S8. Opt-in "make a Pets dashboard" at setup (M, tier 2)

Owner Q3 (second half). Tier 2: it writes the household's Lovelace config.

### What HA allows (checked against HA 2026.10 in this repo's venv)

- There is **no public API** for an integration to create a dashboard. The dashboards
  collection (`lovelace/dashboard.py`, `DashboardsCollection`) is a local in
  `lovelace.async_setup` (`lovelace/__init__.py:291`); only its websocket commands
  (`lovelace/dashboards/create`, `lovelace/config/save`, admin) are public, and they are
  for the frontend.
- HA's own onboarding makes the Map dashboard by calling the collection's
  `async_create_item({...})` and then `hass.data[LOVELACE_DATA].dashboards[url].async_save(config)`
  (`_create_map_dashboard`, `__init__.py:414-434`). That is the pattern to copy.
- **Reaching the live collection:** the registered handler
  `hass.data["websocket_api"]["lovelace/dashboards/create"][0]` is a bound method of
  `DashboardsCollectionWebSocket`, whose `storage_collection` is the live collection.
  Using it means the dashboard is registered as a normal storage dashboard: it shows in
  Settings → Dashboards, the panel appears at once, the user can edit or delete it.
  A second `DashboardsCollection(hass)` instance must **not** be used: it writes the
  same store without the live listener, so the panel would not appear and the next
  write from HA would drop it.
- **YAML vs storage:** storage dashboards can be added whatever mode the default
  dashboard is in (the collection is set up either way; `mode` only governs the
  default dashboard, and YAML mode is deprecated). If `lovelace` isn't loaded, or the
  handler isn't found, or its `storage_collection` isn't a `DashboardsCollection`, the
  feature is **off**: the checkbox is not shown.
- The card element is already registered on every page (`add_extra_js_url`,
  `__init__.py:182`), so a fresh dashboard with `custom:hatch-pet-card` renders without
  a resource step.
- Doing it from the card instead (an admin calling the public ws commands) doesn't work
  for a first run: the card isn't on any dashboard yet.

This route depends on HA internals: owner question Q-D (§11).

### The flow

- **Spike first (part of the slice, before building):** on the dev HA, create and delete
  the dashboard through the route above from a scratch script; confirm the panel
  appears without a restart and survives one. Record the HA version in the report.
- The user step gets a checkbox `make_dashboard` (BooleanSelector, **default off**),
  shown only when the feature is available **and** no dashboard at `hatch-pets` exists.
  It is not stored in the entry (no new key, no migration).
- On submit with it ticked: create `url_path: "hatch-pets"`, title "Pets", icon
  `mdi:egg`, `show_in_sidebar: true`, `require_admin: false`, `mode: storage`; then save
  `{"views": [{"title": "Pets", "path": "pets", "cards": [{"type": "custom:hatch-pet-card"}]}]}`
  (the builder may use a sections view; check it on the dev HA). The shelf shows every
  pet by itself, so one dashboard serves every later pet.
- **Never overwrite:** if `hatch-pets` is a panel or a dashboard already (checked again
  at submit, not only when the form was drawn), nothing is created or saved, and the
  existing one is left alone. `async_save` is only ever called on a dashboard this
  submit just created.
- **The pet's dashboard:** if the Dashboard field was left empty, the entry's
  `CONF_DASHBOARD` becomes `/hatch-pets/pets`, so the welcome links to it (S4).
- **Failure never blocks the pet:** any error is logged as a warning, the entry is
  created anyway, and the welcome carries N20 (S4) since no dashboard was set.

### Copy (DRAFT, plain)

- Field label: "Make a Pets dashboard with the pet shelf"
- Field help: "Adds a Pets dashboard to the sidebar with the pet shelf card on it. It never changes a dashboard you already have."
- Dashboard title: "Pets"

### Files, acceptance, tests

- **Files:** new `custom_components/virtual_pet/dashboard.py` (`available(hass)`,
  `async_make(hass) -> path | None`; all HA-internal access in this one file, each
  step guarded), `config_flow.py`, `strings.json`, `translations/en.json`,
  `tests/test_dashboard.py`, `docs/guide.md` (the install steps mention the checkbox).
- **Acceptance:** an admin adding the first pet ticks one box and finds a Pets dashboard
  in the sidebar with the shelf on it, no restart; an existing dashboard is never
  changed; with HA internals not as expected, the box simply isn't offered.
- **Tests (pytest, with `lovelace` set up in the test hass):** ticked, a `hatch-pets`
  dashboard exists after setup with the card in its config and the entry's dashboard
  set to it; unticked, none; with `hatch-pets` already present (made by a test with
  other content), the checkbox is absent, and a submit that races one into existence
  leaves its config unchanged; with the handler missing, the checkbox is absent and
  setup works; a creation error still creates the entry. **This pins the internal
  route:** an HA upgrade that moves it fails here, not in a household.
- **Out of scope:** adding the card to an existing dashboard; removing the dashboard
  when the last pet goes; a dashboard per pet.

---

## 10. The review's other findings: do or skip

| Finding | Call | Why |
|---|---|---|
| M1 "connect more ›" deep link; clock-only on status | **Do** (S4) | One tap to the right page; the clock-only state is otherwise invisible. |
| M2 Options order, names, long texts | **Do** (S5) | Folded into the menu. |
| M3 Reconfigure title, world label | **Do** (S6) | "Move" misleads; the hatched case needs its own label. |
| M4 Settings sheet grown past its design | **Do** (S7) | Sub-headings and the shared screen apart; no key changes. |
| M5 Three "private" switches | **Do** (S5 options text, S7 card note) | Wording only; the admin-only options stay admin-only. |
| M6 Device-page `lay_egg` in one press | **Skip** | Day 21 only and nothing is lost (the pet goes to the journal); moving the entity to CONFIG would reshuffle existing auto-generated dashboards. |
| M7 Second device same world | **Do** (S1) | Owner/FM Q6. |
| L1 "Surprise me" untranslated | **Skip** | Only English exists; turning the option into a key changes the select's value and breaks automations that set "Surprise me". Revisit with a first translation. |
| L2 First options save freezes defaults | **Skip** (S5 keeps it per topic) | Storing only non-defaults is a migration for no visible gain; with the menu, a save now freezes one topic's defaults, not all of them. |
| L3 Dashboard asked before there is one | **Skip** | S8's checkbox fills it in the common case; the field stays for people with a dashboard. |
| L4 Rename vs entity IDs | **Do** (S6, guide) | One line. |
| §6 "No mammals" option missing from the options | **Flag, not planned** | The 2026-10-28 decision says it is a per-pet option, but no `CONF_` exists. First mate to check whether it was dropped. |

## 11. Owner questions left

Each slice builds the recommendation unless the owner answers otherwise.

- **Q-A. Should the HA select stop listing unraised creatures?** Recommendation: **no,
  keep the full roster in HA.** The card (S2) offers raised only, as the owner chose.
  The HA select is the admin's tool and automations may set any creature; "surprise
  me" already prefers an unraised one (`model.py:1085-1101`). The cost: a curious person
  on the device page can read the world's creature names.
- **Q-B. Can a new egg be named on a shared screen?** Recommendation: **yes, like
  laying** (A10). The egg moment often happens on the family tablet; the window is a
  day; the name shows to everyone anyway. Alternative: read-only there, like the shell
  ("ask a grown-up…"), naming from a personal screen.
- **Q-C. If an admin named the device in HA (`name_by_user`), does a card rename replace
  it?** Recommendation: **yes, clear it.** Otherwise the card's rename silently doesn't
  show (`_sync_name` prefers it). The cost: an admin's own device name is overwritten
  by any user during the first day.
- **Q-D. S8 reaches HA's dashboard collection through internals (no public API
  exists). Accept that?** Recommendation: **yes**, kept in one file, every step guarded
  (the checkbox hides itself if HA changes), and pinned by a pytest that fails on an HA
  upgrade first. Alternative: drop S8 and keep S4's "add the shelf card" sentence.
- **Q-E. Naming window: the egg and baby stages (the first day).** Recommendation:
  **keep it to the first day**, as planned. Alternative: any time (any user could rename
  any pet whenever).
