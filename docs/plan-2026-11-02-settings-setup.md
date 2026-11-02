# Settings and new-pet setup, 2026-11-02 (build plan)

**Status: PLAN, docs only. Revised by s2659** (folds the adversarial review s2658,
findings F1-F22, and the 2026-11-02 decisions, §12). Written first by s2657 from the
settings review (s2655, `~/.local/state/crew/research/settings-review.md`) and the
owner's answers to it (2026-11-01 ~23:50, quoted in §1). The owner's answers win over
the review; the review wins over the first draft; §12 wins over both. Every player line
and flow label here is **DRAFT** until the first mate approves it (decisions
2026-10-28, "How the crew works"). Line numbers are from `018cecc1`; names win over
numbers. S8 (the Pets-dashboard checkbox) is **dropped** (owner, §12).

Sources read: the review, `plan-2026-10-28-experience.md` PR 4b (748-775) and its copy
table (C12-C15, 973-976), `plan-2026-10-31-next-stages.md` (the 2026-10-30 deferral of
4b), `decisions-2026-10-28.md`, `plan-2026-10-30-settings-gear.md` §3 (shared screens),
and the s2658 review report (F1-F22).

## 0. Summary

| # | Slice | Size | Tier | Touches |
|---|---|---|---|---|
| S1 | Setup pre-selects the first unused world | S | 1 | `config_flow.py` |
| S2 | Next egg in the lay confirm (4b, reshaped) | M | 1 | card, `sensor.py` (`egg_roster`, unrecorded) |
| S3 | Name the new generation in the card | M | **2** | `__init__.py` (ws), `coordinator.py`, card |
| S4 | First-run links, welcome wording, second pet | S | 1 | card, `coordinator.py` (welcome), `config_flow.py` (Dashboard default) |
| S5 | Options split into a menu | M | **2** | `config_flow.py`, `strings.json`, `translations/en.json` |
| S6 | Reconfigure copy, world label, two guards | S | 1 | `config_flow.py`, strings, `docs/guide.md` |
| S7 | Settings sheet: bedtime line, sub-headings, shared screen apart | S-M | **2** | `sensor.py`, card |

S8 (opt-in Pets dashboard) is gone: no HA internals anywhere in this plan.

Build order is the table order. Two lanes can run side by side: **card** (S2 → S3 →
S4 → S7) and **flows** (S1 → S5 → S6). S4 also edits `async_step_user`, so it goes
after S1. S3 and S6 both touch the reconfigure description and the name check, so S6
goes after S3. The review's verdict was: S1, S4, S6, S7 buildable as drafted; S2, S3, S5
needed their fixes (all folded in below).

No owner question is open. Remaining open items (§11) are the first mate's.

## 1. The owner's decisions this plan builds (2026-11-01)

Quoted from the review's "Owner decisions":

- **Q1:** "YES build in-card next-egg choice (4b) in the lay confirm: raised creatures +
  'surprise me'. Revisits the 2026-10-30 deferral." → S2.
- **Q2:** "name a new generation IN THE CARD, ANY logged-in user, right after laying (new
  virtual_pet/rename; 20 chars)." → S3.
- **Q3:** "links (empty-state 'Add a pet ›' for admins, welcome says add the shelf card,
  'connect more ›' deep link) PLUS an opt-in setup checkbox that creates a Pets dashboard
  with the card." → S4. **The checkbox half is dropped (Q-D, §12).**
- **Q4:** "SPLIT Options into a menu now (House, People & privacy, Bedtime, Notifications,
  ...; builder proposes)." → S5.
- **Q5:** "bedtime/wake stay admin options; card shows a read-only line." → S7.
- **Q6 (FM, obvious):** "setup pre-selects the first world not already used." → S1.

Earlier decisions kept: 4b's offer is raised creatures plus "surprise me" (experience
Q8), and choosing is allowed on a shared screen (A10). Settings open from the gear
(decisions 2026-10-28). On a shared screen, THIS SCREEN stays editable and the pet's
shell is read-only (settings-gear §3).

## 2. Copy rules for this plan

- Card lines: lowercase (including the pet's "i"), short (**≤ 40 characters**, counted
  with the longest name, 20 characters, and the longest creature name, 26), the pet's
  warm tone, no guilt, no nagging. `♥`/`♪` sparingly.
- **Where the new card lines live (F19).** Static player lines go in one new table
  `SETUP_COPY` inside the card's `// --- fresh-expand copy` block, listed in
  `COPY_TABLES` in `scripts/copy-scan.js`, so the scan covers them: no digits, no "?",
  no nag words, ≤ 40. Every such line below is a statement for that reason. Lines with
  digits or built at run time (N21's times, N12 and N6 aria-labels, the name field's
  `maxlength`) are built outside the block and are not scanned; they still obey the
  length rule by hand. The existing "lay an egg?" stays where it is.
- HA flow labels and help: plain sentence case, no pet voice, no jargon a household
  member wouldn't use.
- Every new string is quoted below as **DRAFT**. A builder adds no string that is not
  here. Changing one goes back to the first mate.
- Existing strings that a slice reuses are marked "(existing)".

---

## S1. Setup pre-selects the first unused world (S, tier 1)

Review M7, owner Q6; review F17, F18.

- **Change:** in `async_step_user` (`config_flow.py:170-206`), the World default is the
  first world in catalog order that no existing entry uses. "Uses" means its world **or**
  its `data[CONF_NEXT_WORLD]` (a pet already moving there counts). The entry's world is
  `entry.runtime_data.world` when the entry is loaded (as Reconfigure does, so an old
  entry whose world was re-derived from its species counts right), else `data[CONF_WORLD]`,
  else `DEFAULT_WORLD`. If every world is used, the default stays `DEFAULT_WORLD`.
- **Disabled entries count as used (F18):** the check reads the entry, not its state, and
  a disabled pet still lives in its world.
- The player can still pick any world. Nothing is saved differently.
- **Files:** `config_flow.py`, `tests/test_config_flow.py` (new; S5 and S4 add to it).
- **Acceptance:** with no pets, the default is Woodland; with a Woodland pet, the default
  is the next world in catalog order; with a pet whose `next_world` is that world, the
  one after; with every world taken, Woodland.
- **Tests:** pytest reads the `default` of the `world` marker in the user step's
  `data_schema` (`tests/test_init.py:114` reads `["world"].config["options"]`, so it is
  feasible) for those four cases, plus an unloaded entry with no `CONF_WORLD`, and a
  disabled entry.
- **Copy:** none.
- **Out of scope:** steering creatures across devices (two devices in different worlds
  never share a roster, so nothing else is needed).

**2026-11-02, UX fix 5 (BUILT in s2673):** the setup form also got the world list as rows
(F3), a `name_taken` error on the name (F2, "Another pet here already has that name."),
and plain texts (F8): the description now says the pet lives in a handheld device "shown
by the Hatch at Home pet shelf card"; the Dashboard field is "Dashboard with the pet
shelf". S1 builds on these strings and must not revert them.

## S2. Next egg in the lay confirm (M, tier 1)

Review H1, owner Q1, experience PR 4b reshaped (the forms book stays deferred, so 4b's
"hatch one next" on the creature page is out). Review F1, F2, F3, F16, F22; decisions
Q-A and Q-F (§12).

### The server: `egg_roster`

The card has no id→name map for the egg roster, and `egg_roster` follows `next_world`
(`coordinator.py:458-463`), not the current world. So `sensor.<pet>_life_stage` gets
`egg_roster: [{"id": "<species id>", "name": "<select option>"}, ...]`, built from
`coordinator.egg_species_names` (id → name, in option order), in `_unrecorded_attributes`
(`sensor.py:148`, next to `roster`). The names are exactly the select's options minus
"Surprise me", so nothing new is revealed on the bus that the select does not list
already. Tests: `tests/test_recorded.py` (unrecorded), `tests/test_public.py` (names and
ids only, nothing personal), and a pytest that `egg_roster` names equal the select's
`options[1:]` in order, with and without a pending `next_world`.

### The flow

Today: the request button reads "lay an egg?" (existing); the first tap arms it, the
second tap within 4 s lays (`confirmTap`, card 2083-2096; handler 4281-4286).

New, **when the offer has two or more creatures** (Q-F; not counting "surprise me"):

1. Tap "lay an egg?": instead of arming, the status box opens the **lay sheet** (the
   same box the journal and settings use, `_setStatus`).
2. The sheet shows the offer as a short list: **"surprise me"** first, then each offered
   creature by name. The current choice is marked. A tap on a row calls
   `select.select_option` on `select.<pet>_next_egg` at once (the choice is the next
   egg's, even if the player then backs out; that is how the select works today).
   - **The value sent (F3):** the surprise row sends `options[0]` from the select's own
     state (today `"Surprise me"`); a creature row sends its option string unchanged
     (`egg_roster[i].name`). Only the display is lowercased. A lowercased or hard-coded
     value would be rejected as an unknown option.
3. **"lay the egg"** lays it (`button.press`, as `_press(s, "lay_egg")` does). This tap is
   the confirm: the sheet is the deliberate second step, so the 4 s window does not
   apply inside it. A fast double tap on the request button must not lay (the first tap
   opens the sheet; the button is no longer under the finger).
4. **"‹ not yet"** closes the sheet. Nothing is laid.

**With fewer than two offered creatures** (F2: the offer is never empty for a pet that
can lay, because `_hatch` appends the hatched species to `raised`, `model.py:1106`; so
the first lay offers exactly one creature, its own): today's two-tap arm, unchanged. No
sheet for a choice of one. The same goes for a stub state without `raised` (card-check's
`play` section, `card-check.js:2146`) and a world change with at most one raised
creature in the new world. Consequence, accepted: a pet that has raised only one kind
can pick it only in Home Assistant until it has raised a second.

### The offer

- **Offered creatures** = `egg_roster` ∩ the creatures raised in the **egg's world**,
  in `egg_roster` order (catalog order). The egg's world is `next_world` when one is
  pending, else the current world. "Raised" is the union of `raised` over this card's
  pets whose world is that world (the forms book's set, card 8695-8698). A pet's own
  `raised` can hold ids from other worlds (card comment at 9005); the `egg_roster`
  intersection drops them. The server never rejects an offered choice
  (`async_set_egg_choice`, 2957-2963).
- Names come from `egg_roster`, not `species.json`.
- Rebuilt on every draw (F16), never cached: the lay sheet shows the list the state
  gives now.
- **The HA select keeps the full roster (Q-A).** A choice set in HA that is not in the
  offered set (F22) shows as read-only **N25** in the sheet, never by name; the status
  row and C15' read as a surprise for it (below). Nothing is spoiled by the card.

### The sheet's life (F16)

- A flag `s.laySheet` on the screen state; the sheet lives in the status box.
- It closes on: "‹ not yet"; a tap on the status chip; a pet change (swipe or pick);
  the shared-screen switch; the pet no longer being able to lay (stage, or the entry
  reloading after a world change); and the lay itself. The settings-gear plan's five
  exit paths for its sheet apply, with these added.
- A state tick redraws it from the new offer; a selection that went stale (a creature
  that left the offer) falls back to the marked current choice.

### Rules

- **Shared screen: allowed** (A10), like laying.
- **Read-only login:** `select_option` refuses. The sheet stays, the choice reverts, and
  the status feedback says C13' (below). Laying itself refuses for them already.
- After laying, the egg screen shows C15' when an offered creature was chosen, as a line
  on the screen (an egg doesn't talk), once on each screen (a `oncePerDay`-style key on
  the device and generation). It never shows for a choice outside the offered set.
- The status "next egg" row (8046) shows **for every adult**, reading "surprise" with
  nothing picked, or with a choice outside the offered set (4b, F22). On the egg it keeps
  its "hatching" label (existing).
- Nothing new is saved; `egg_choice` exists (`model.py:587`) and is copied to the egg
  at lay time (1961).

### Copy (DRAFT)

All static lines below go in `SETUP_COPY` (§2) except N6.

| Id | Where | Line | Chars |
|---|---|---|---|
| N1 | lay sheet heading | "a new egg" | 9 |
| N2 | lay sheet prompt (a statement, F19) | "pick who hatches" | 16 |
| N3 | first choice | "surprise me" | 11 |
| N4 | confirm button | "lay the egg" | 11 |
| N5 | back button | "‹ not yet" | 9 |
| N6 | lay button aria-label (not scanned) | "lay the egg: <name> retires to the journal and a new egg takes its place" | aria |
| C13' | refused (read-only login), status feedback | "this login can't choose, sorry" | 30 |
| C15' | egg's first look, a creature chosen | "a <creature> is coming" | ≤ 38 (measured with "Mexican red-knee tarantula", 26) |
| N7 | status row value, nothing picked | "surprise" | 8 |
| N25 | sheet row for a choice made in HA, outside the offer | "set in home assistant" | 21 |

C13' and C15' replace experience C13 ("only someone who can change things can pick", 44
characters) and C15 ("a <creature> is on the way", 42 with "Mexican red-knee tarantula"),
both over the limit. Creature names show lowercase, as the status row does.

### Files, acceptance, tests

- **Files:** `hatch-pet-card.js` (request handler, a `_renderLaySheet`, the status row,
  `SETUP_COPY`), `sensor.py`, `scripts/copy-scan.js` (`COPY_TABLES`), `scripts/card-check.js`
  (section `play` holds the lay confirm, 2146-2243; `egg`), `scripts/bench.js` +
  `dev/bench` (a `view: "lay"` shot), `tests/test_recorded.py`, `tests/test_public.py`.
- **Acceptance:** a person chooses the next egg and lays it without leaving the card; an
  unraised creature is never offered or named; the server never rejects an offered
  choice; a pet with fewer than two raised creatures lays with today's two taps.
- **Tests (pytest):** `egg_roster` as above. **Tests (card-check):** with two raised
  creatures, the first tap opens the sheet and nothing is pressed; a creature tap calls
  `select_option` with the select's own option string, and the surprise row with
  `options[0]` verbatim (case and all); "lay the egg" presses `lay_egg` once; "‹ not
  yet" presses nothing; an unraised creature is absent and a pet's other-world id is
  absent; with `next_world` set only that world's raised creatures show; with one raised
  creature, or none, or a stub state without `raised`, the old two-tap arm works (the
  existing `play` checks pass unchanged); a refused `select_option` shows C13'; each
  exit path closes the sheet; a choice outside the offer shows N25 and the status row
  reads "surprise"; it works with `sharedScreen()` on; the status row reads "surprise"
  for an adult with nothing picked. **Bench:** the sheet in two worlds, 330 px and full
  width, big text on.
- **Out of scope:** the forms book's "hatch one next" (C12; the book stays deferred);
  previewing the egg's inherited trait; the HA select's option list (kept in full, Q-A).

## S3. Name the new generation in the card (M, tier 2)

Review H2, owner Q2. Tier 2: it writes the entry title, the device name and
`state.name`. Review F4, F5, F6, F9, F10, F13 (N13), F19; decisions Q-B, Q-C, Q-E (§12).

### The server: `virtual_pet/rename`

```
{type: "virtual_pet/rename", entity_id, name}
```

- **Who:** any logged-in user (owner). **There is no permission pattern to copy (F6):**
  nothing in the integration checks `POLICY_CONTROL`, and `websocket_set_shell`
  (`__init__.py:735-753`) checks no permission at all. HA's service layer refuses the
  select for a read-only login; a websocket command is not covered by that. So the
  handler checks explicitly, `connection.user.permissions.check_entity(entity_id,
  POLICY_CONTROL)`, and refuses with `read_only`. This is a new pattern here; it is
  tested with `hass_read_only_user`. `set_shell` is left as it is (outside this plan;
  §11 files it).
- **When:** only while the pet is an **egg or a baby** (the first 24 hours of a
  generation, `STAGE_STARTS`; Q-E). Otherwise `not_now`. That is "right after laying"
  with room for a family to agree, and it stops a casual rename of an older pet. The
  first generation gets the same window (harmless). Admins keep Reconfigure for any time.
- **Validation:** strip, collapse inner spaces, NFC; 1-20 characters (`len` after NFC);
  no control characters. Refused with `bad_name`.
- **`taken` (F9):** a name any other pet here already answers to (casefold) is refused.
  "Answers to" is both the other entry's **title** and its **`state.name`** (which is
  `name_by_user` when an admin set one, `coordinator.py:1125`), because Assist's
  `find_pet` matches either (`intent.py:199`). The check is one helper, `name_taken(hass,
  name, except_entry_id)`, in `coordinator.py`; S6 reuses it for Reconfigure.
- **Not loaded (F4):** `async_rename` takes the pet from `hass.data[DOMAIN]["pets"]` at
  call time. While the entry is not loaded (it is reloading) it returns the retryable
  error `not_ready`, never `no_pet`, and writes nothing to a coordinator that is being
  torn down. A lay that carries a pending `next_world` ends in `async_update_entry` +
  `async_schedule_reload` (`coordinator.py:2947-2955`), so the entities go away for a
  moment right after such a lay. The card waits (below).
- **What it writes, in order:** `async_update_entry(entry, title=name, data={**data,
  CONF_NAME: name})`; the device registry's `name` (`dr.async_update_device(device.id,
  name=name)`), so the device page and the entity names follow without a reload (HA
  rewrites entity state on a device name change, `helpers/entity.py:1691-1706`); then
  `_sync_name()`, save, publish. **No reload** (`OptionsFlowWithReload` and Reconfigure
  reload; this must not, or the card flickers on the egg moment). **Do not add an update
  listener** to the entry: `OptionsFlowWithReload` forbids it (`config_entries.py:4107-4111`).
- **`name_by_user` (Q-C):** a card rename **clears** the device's `name_by_user`
  (`dr.async_update_device(device.id, name=name, name_by_user=None)`), so the new name
  shows (`_sync_name` prefers `name_by_user`). An admin's own device name is overwritten
  by any user during the first day; accepted.
- **Kept:** entity IDs (as Reconfigure, `guide.md:395`); the journal's record of the old
  generation keeps the old name (it was copied at lay time, `model.py:1945`).
- Like `set_shell`, it is a websocket command, so who renamed isn't recorded.
- **Privacy:** no new personal data. The name already shows on every screen and sensor.

### The card

- **The trigger (F5).** `button.press` returns before the lay is known, and a lay that
  `can_lay_egg` refuses does nothing (`model.py:1962-1964`; `coordinator.py:2943-2947`).
  So the screen stores `layAt = {generation}` (the `generation` attribute of
  `sensor.life_stage` at the tap of "lay the egg" or the second tap) and the name sheet
  opens when that sensor shows `egg` with `generation` = stored + 1. The stored value is
  dropped after 30 s without that change, on a pet change, and on a failed press. A
  refused lay opens nothing. This also covers the reload case: the card keeps waiting
  through the entities going unavailable, and a `not_ready` answer is retried once after
  2 s, then shows N18.
- **Only the screen that laid opens it.** The name sheet is the status box (`_setStatus`)
  with a flag `s.nameSheet`: a text field prefilled with the current name (`maxlength`
  20), "name it" and "keep <name>". It closes on: "keep", a successful save, the back
  gesture, the status chip, a pet change, the shared-screen switch, the pet leaving the
  baby stage, and the entry reloading with a different generation.
- **Any screen, while egg or baby:** the status page gets a row "name" with the pet's
  name and a "change" button that opens the same sheet. Gone once a child.
- **Shared screen: allowed** (Q-B), like laying (A10): the egg moment often happens on
  the family tablet, the window is a day, and the name shows to everyone anyway.
- On success the bubble says N13 and the sheet closes. On a refusal the field stays
  with the error line under it.
- The keyboard: Enter submits, Escape is "keep". The field gets focus when the sheet
  opens (it opens from a tap, so a phone keyboard rising is expected).

### Copy (DRAFT)

The static lines go in `SETUP_COPY` (§2). N12 is an aria-label, outside the scan.

| Id | Where | Line | Chars |
|---|---|---|---|
| N8 | name sheet heading (a statement, F19) | "a name for the egg" | 18 |
| N9 | save button | "name it" | 7 |
| N10 | keep button | "keep <name>" | ≤ 25 |
| N11 | status row label / button | "name" / "change" | 4 / 6 |
| N12 | field aria-label | "the new egg's name, up to 20 characters" | aria |
| N13 | saved, bubble | "<name>! i like it ♥" | ≤ 33 |
| N14 | `bad_name` (no digits, F19) | "names are short, but not empty" | 30 |
| N15 | `taken` | "another pet here has that name" | 30 |
| N16 | `not_now` | "only a new egg or baby can be named" | 35 |
| N17 | `read_only` | "this login can't name, sorry" | 28 |
| N18 | anything else, `not_ready` after the retry | "hm, that name didn't stick ♪" | 28 |

N13 is said by the pet (an egg can't talk: on the egg it shows as the status feedback
instead of a bubble). N13 now keeps the plan's own lowercase rule ("i").

### Files, acceptance, tests

- **Files:** `__init__.py` (register `websocket_rename`), `coordinator.py`
  (`async_rename`, `name_taken`), card (`_renderNameSheet`, the status row,
  `SETUP_COPY`), `scripts/copy-scan.js`, `scripts/card-check.js` (`egg`, `sharedscreen`),
  `tests/test_rename.py` (new), bench (`view: "name"`).
- **Acceptance:** after laying, anyone names the egg in the card in two taps and some
  typing; the name shows on every screen, in HA's device page and in notifications at
  once, with no reload; entity IDs are unchanged; an admin's HA device name does not
  hide it.
- **Tests (pytest):** a rename updates the entry title, `data[CONF_NAME]`, the device
  name and `state.name`, clears `name_by_user`, saves, and does not reload; 21 characters,
  empty, all spaces and a control character are `bad_name`; another pet's name in another
  case is `taken`, and so is another pet's `name_by_user`-derived `state.name` (a pet
  titled "Fern" shown as "Pip" blocks "Pip"); its own current name is fine (no-op); a
  child is `not_now`; a read-only user (`hass_read_only_user`) is `read_only`; an unknown
  entity is `no_pet`; **a rename right after a lay that carries a world change** (the
  entry reloading) answers `not_ready`, then succeeds once loaded and survives a save;
  the old generation's journal record keeps the old name. **Card-check:** the sheet opens
  after a lay on that screen only, once the sensor shows the new generation; **a refused
  lay (`can_lay_egg` false) opens nothing**; a missed state change leaves it closed after
  30 s; "name it" sends `{type: "virtual_pet/rename", name}`; each error key shows its
  line; each exit path closes the sheet; the status row shows on egg and baby, not child;
  it works with `sharedScreen()` on. **Bench:** the sheet with an empty, a 20-character
  and an error state.
- **Out of scope:** entity IDs; a rename history; naming from Assist; changing
  Reconfigure itself (S6 changes its words, adds `taken` and the open-form guard).

**2026-11-02, UX fix 5 (F1, BUILT in s2673): one name helper.** The pet's name lives in
three places: `entry.title` (Reconfigure writes it), the device's `name_by_user` (HA's
pencil and its "Name and assign" step write it) and `state.name`. `names.py` now has
`pet_name(hass, entry)` (the device's own name if set, else the title, so it never lags
a tick like `state.name`), `clear_device_name(hass, entry)` and `name_taken(hass, name,
except_entry_id=None)`. Every text that names the pet (the Options title, repairs, the
welcome, Reconfigure's title and default) uses `pet_name`. **S3's card rename uses
these:** `name_taken` already exists, so S3 must not write a second one, and a rename
clears `name_by_user` (`clear_device_name`) as Reconfigure now does.

## S4. First-run links, welcome wording, second pet (S, tier 1)

Review H3 a+b and M1, owner Q3 (the links half; the dashboard checkbox is dropped,
Q-D). Review F8, F15, F21; the deep links were checked (below).

### Empty state (card 4488-4499)

- With no pets and no configured entities, an **admin** (`hass.user.is_admin`) gets a
  button **N19** under the existing sub-line. It navigates (as "connect more ›" does,
  `history.pushState` + `location-changed`) to HA's add-integration dialog for
  `virtual_pet`. A non-admin sees today's text only.
- **Changed by UX fix 4 (first run, review 4), which S4 builds on:** a non-admin's
  empty-state text is now "Ask whoever runs Home Assistant to add a pet." (not
  "today's text"), the not-found text no longer says "entities", the empty card draws
  the first world's toy with an egg silhouette (N19 goes under it), and the welcome
  text (`notify.welcome`) now says "Its egg hatches in about half an hour." before
  "Say hi ♥". N20 and N20b follow that new text.
- **The link:** `/_my_redirect/config_flow_start?domain=virtual_pet` (HA's own "My"
  redirect, handled by the frontend with no internet). Checked by the s2658 review against
  the pinned frontend 20260930.5: the redirect has no `component` gate; the alternative
  `/config/integrations/dashboard/add?domain=virtual_pet` also exists. The builder uses
  the first and confirms it opens the dialog on the dev HA (a visual check). If it does
  not, the second; if neither, `/config/integrations/dashboard`, said in the report.
- "Pet not found" (entities configured but gone) is unchanged.

### "connect more ›" and the clock-only pet (card 8079-8080, 8138-8143)

- The link goes to **this pet's** entry, not the integration list:
  `/config/integrations/integration/virtual_pet#config_entry=<entry_id>` (the entry id
  from `hass.devices[<device>].config_entries`), which the frontend itself uses after a
  config flow. Alternative: the device page `/config/devices/device/<device_id>` (it
  has the entry's Configure). Both exist; the dev HA check is only whether the entry is
  highlighted.
- **One place (reconciled when S4 was built).** The settings sheet and the status page are
  one screen now: the "notices" row with "connect more ›" has a single handler
  (`.connect` in `_renderSettings`), and S4 changes that one. Card-check covers it.
- **The "notices" row (already built, top10 2b; S4 leaves it as shipped).** Everyone sees
  the row: the kinds the server lists, or "just the clock" for an empty `senses`; an
  admin on a personal screen also gets "connect more ›", whatever `senses` holds. A new
  rule that hid the row once anything is mapped would have removed that list, so it was
  not built.

### The welcome (coordinator `_welcome`, 2421-2444) and the second pet

The shelf card shows every pet by itself, so a household needs the card on one dashboard
once. The welcome must tell a new household that, and must not tell a household that
already did it (F8).

- **The Dashboard field's default (setup; BUILT in S4).** `async_step_user` defaults the
  Dashboard field to the dashboard of the first other entry that has one, so a second pet carries
  the household's choice without retyping. (Editable, as today.)
- **The welcome's dashboard** = this entry's `CONF_DASHBOARD`, else the first other
  entry's. That is "a dashboard the setup named".
  - **Own dashboard, and no other entry named one** (the first pet): "[Open the pet
    shelf](…)" (existing) plus **N20b**, because the first option, "Overview"
    (`config_flow.py:211`), is an auto-generated dashboard that has no card (F15).
  - **A dashboard another entry named, or the same one again** (the second pet): the
    plain "[Open the pet shelf](…)" only. No nag: the pet already shows there.
  - **No dashboard anywhere:** **N20** (the sidebar note) in place of the link.
- The phone push (only to people who already have another pet's "notify me") is
  unchanged: they already have a card.

- **The welcome's title (2026-11-02, UX fix 5 F10; BUILT in s2673).** The sidebar note's
  title is "{name} moved in ♥", no longer "Virtual Pet". `_welcome` already has the
  name from `pet_name(hass, entry)` (see S3). The body and N20/N20b follow it unchanged.

### Copy (DRAFT)

N19 goes in `SETUP_COPY` (§2). N20 and N20b are notification text (plain, not scanned).

| Id | Where | Line | Chars |
|---|---|---|---|
| N19 | empty state button, admins | "add a pet ›" | 11 |
| N20 | welcome sidebar note, no dashboard anywhere (plain) | "To meet {name}, add the Hatch at Home pet shelf card to a dashboard." | notification |
| N20b | welcome sidebar note, first pet with a dashboard, after the link (plain) | "If it isn't there, add the Hatch at Home pet shelf card." | notification |
| — | status row | "notices" / "just the clock" / "connect more ›" (existing) | — |

### Files, acceptance, tests

- **Files:** card (`_renderEmpty` part of the shelf update, `_renderStatus`, the settings
  sheet and the status page `.connect` handlers, `SETUP_COPY`), `coordinator.py`
  (`_welcome`), `config_flow.py` (the Dashboard default), `notify.py` (N20 and N20b next
  to `welcome`), `tests/test_welcome.py`, `tests/test_config_flow.py`,
  `scripts/card-check.js` (`shelf`, `prefs`).
- **Acceptance:** a new admin with an empty card reaches the Add dialog in one tap; an
  admin on a clock-only pet sees that on the status page and reaches that pet's
  options in one tap, from either place; a welcome with no dashboard tells the admin to
  add the card; a second pet in a household that named a dashboard is not told to add
  the card.
- **Tests:** pytest: the sidebar note carries N20 with no dashboard anywhere, and the
  link plus N20b for a first pet with one; **a second pet with another entry's dashboard
  (its own field empty) carries the plain link and neither N20 nor N20b**; the Dashboard
  field's default is the first other entry's; the phone text never carries N20 or N20b.
  Card-check: the empty state has N19 for an admin and not for a user; its click
  navigates to the chosen path; both "connect more ›" handlers navigate to the
  entry/device path; the status "notices" row shows only for an admin, personal screen,
  empty `senses`. The verified deep links go in the report with the HA version they
  were checked on.
- **Out of scope:** driving the config flow from the card (review §5: admin-only REST,
  fragile; deep link instead); a setup wizard; creating a dashboard (Q-D: dropped).

## S5. Options split into a menu (M, tier 2)

Review M2, owner Q4; review F11, F12, F13, F14 (bedtime wording). Tier 2: it changes how
the options are saved; a bug here wipes a household's mappings.

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
  inside their topics as today. **Display rounding (F13):** `_to_unit` rounds to 0.5
  (`config_flow.py:345-353`), so in a °F house 26.5 °C shows as 79.5 °F and would be
  stored back as 26.39 °C. A comfort value whose submitted number equals the rounded
  display of the stored °C **keeps the stored value**, so saving the weather topic
  unchanged does not drift it. The "byte-for-byte" claim below then holds in °F too.
- **Errors stay on their topic, keyed to a real field (F11).** Today they are keyed to
  section names (`errors["weather"]`, `["sleep"]`, `["room"]`, `config_flow.py:376-380`).
  Topic forms are flat, so `errors["weather"]` would land on the **weather entity
  field** (key `weather`) and `["sleep"]`/`["room"]` would match nothing, so a bad save
  would fail without a visible message. Each error goes on a field of its own topic:
  `comfort_range` on `comfort_low` (weather), `same_times` on `wake_time` (bedtime),
  `fireplace_temperature` on `fireplace` (room); anything with no natural field goes on
  `base`. The strings carry the same keys.
- A field with a default stays `Required` (today's behaviour, review L2 skipped, §10).
  Opening a topic and saving it writes that topic's defaults only, not every topic's.
- **Existing entries keep all values**: nothing is read or written outside the topic.
- The form's title placeholder `{name}` stays (`description_placeholders`).

### Copy (DRAFT; plain labels, M2)

**2026-11-02, UX fix 5 (review 5, F4-F6; all approved by the first mate):** the
tables below are corrected by the notes marked UX5. Where a UX5 line and a draft
disagree, UX5 wins.

- Menu (`options.step.init`): title "What {name} notices" (existing); description
  ~~"Pick what to connect. Every field is optional; anything left empty is ignored."~~
  **UX5 (F6):** "Pick what {name} notices. Everything is optional, and the house never
  hurts the pet: it only changes its mood, its scene and what it asks for." It keeps
  today's reassurance for a worried parent.
- Each topic's description: **at most two sentences**. Drafts:
  - Bedtime: "Bedtime and wake time are targets: the pet may turn in up to an hour either side, and lights out always wins. It sleeps when the bedtime lights are off and the house is quiet."
  - People and privacy: "Who is home decides whether the pet is with you or at the sitter's. The privacy switches decide what dashboards and sensors may show."
  - Weather and air: "The pet sees the weather outside and feels the room's temperature and air. It never gets sick from them."
  - The pet's room: "Lights, a fireplace, the TV and music change the pet's scene and mood."
  - The house helps: ~~"Heating, cooling and appliances give the pet something to notice and help with. A robot vacuum or the doorbell can startle it."~~ **UX5 (F6):** "When the heating or a fan comes on as the pet asks, the house answers for you. Finished machines, ticked-off chores, robot vacuums and the doorbell give it something to notice." (Chores moved to this topic; here the house helps the pet, not the other way round.)
  - Moon and sky: ~~"Optional: the moon sensors make the night sky match yours."~~ **UX5 (F6):** "The moon sensors make the pet's night sky match yours, full moons and all." ("Optional" repeated what the menu says.)
  - Notifications: "Phone notifications go to whoever taps "notify me" on the pet's status screen." (existing)
- **UX5 (F6): the menu label "Notifications"** becomes **"Where notifications open"**
  (it holds one field, the dashboard a tap opens; someone looking to switch
  notifications on or off finds nothing there, since that switch is the card's "notify
  me"). The description stays.
- **UX5 (F5): every topic form needs a title and `{name}`.** Each
  `options.step.<topic>` carries a `title` and its step passes
  `description_placeholders={"name": pet_name(hass, entry)}` (not `entry.title`; see
  S3/S6). Titles: "{name}'s bedtime", "People and privacy", "Weather and air",
  "{name}'s room", "The house helps", "Moon and sky", "Where notifications open".
- **UX5 (F5): one-line menu hints.** HA's pinned frontend supports
  `menu_option_descriptions` under a menu step, so each entry carries one plain line:

  | Topic | Hint |
  |---|---|
  | bedtime | When the pet goes to bed and wakes up |
  | people | Who's home, the sitter, and privacy |
  | weather | Rain, sun, indoor temperature and air |
  | room | Lights, fireplace, TV and music |
  | house | Heating, fans, machines, chores and visitors |
  | sky | The moon |
  | notifications | Which dashboard a tap opens |

- **UX5 (F4, Q4): the missing-entities repair names the topic.** Compute `{topics}` from
  which option keys hold the missing IDs (via the topic map) and use it in the repair
  text (`issues.missing_entities`). Approved text: "…Open Settings → Devices & services
  → Hatch at Home → the gear next to {pet}, then {topics}, and pick the new entities or
  clear those fields. This warning goes away once that's saved." **S5b (new, M, after
  S5; first mate: yes):** make that repair fixable. A one-step repair flow, "Forget
  them", removes only the missing IDs from `options` and reloads the pet: one tap, no
  form. `is_fixable=True` and a `RepairsFlow` in a new `repairs.py`; the text names
  what will be forgotten.
- **UX5 (F8, partly BUILT in s2673 on today's one-form strings; S5 must keep the words
  when it moves them):** `sitter_settles` is "The sitter calms a fussy pet" (help "…if the
  pet was fussing for attention when it left (not a real need)…"); `notice_robot` and
  `notice_doorbell` end "One added later is noticed once these settings are saved again."
  (saving a topic reloads the pet anyway); the `bedtime` help reads "…Switching "Lights
  out" off again after bedtime costs a little happiness."; the `away_after` unit is
  "hours", not "h". The setup form's lines (description, name help, "Dashboard with the pet shelf" and its help) are also built.
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
  and `translations/en.json` (kept identical, as today; a test now asserts it, F12),
  `tests/test_config_flow.py` (**new**: no such file exists yet; S1 creates it).
  **Existing tests that submit the old section-shaped dict and break (F12), rewritten
  per topic:** `tests/test_init.py` (the flat-mapping test ~410-445, the °F test
  ~711-750, the impossible-settings test ~927-960) and `tests/test_welcome.py`
  (~160-172). Names win over those line numbers.
- **Acceptance:** the Configure dialog opens on the menu; each topic shows only its
  fields with today's values; saving one topic leaves every other option byte-for-byte
  unchanged; clearing a field removes only that key; each validation error shows on its
  topic.
- **Tests (pytest, `hass.config_entries.options`):** for an entry with every option set
  (°C), saving each topic unchanged leaves `entry.options` equal, and so does the same
  in a °F house (the F13 rule); a topic's error key is a key of that topic's schema (or
  `base`), checked over all topics; clearing `tv` in room
  removes `tv` only; `comfort_low ≥ comfort_high` errors on weather and saves nothing;
  `same_times` errors on bedtime; a °F house round-trips the comfort values, including 26.5 °C; an entry
  with empty options gets only the opened topic's defaults; every menu option and step
  has its strings (a test over `strings.json`, so a missing label fails). The card-check
  is unaffected (options are HA-only), but the pick-sections run must still pass.
- **Out of scope:** new options; storing only non-default values (L2); editing options
  from the card (owner Q5: admin only).

## S6. Reconfigure copy, world label, two guards (S, tier 1)

Review M3 and L4; review F9, F10, F20. After S3 (the description changes because naming
moved, and the `name_taken` helper) and S5 (strings).

- **Title:** "Rename {name} or change its world" (DRAFT; replaces "Rename or move
  {name}").
- **Description:** the UX5 text below, on both step ids. (S3 shipped "To name a new
  generation, lay the egg first, then rename it here." and S5's old "A pet that has
  already hatched stays where it is" line; both are replaced by it and by the
  `reconfigure_hatched` help.)
- **Two step ids.** `async_step_reconfigure` shows `step_id="reconfigure"` for a pet
  still in its egg, and `step_id="reconfigure_hatched"` for a hatched pet **and for an
  unloaded entry** (F20: an unloaded entry has `unhatched` false, so the submit path
  already treats it as hatched and the move waits in `next_world`; the label must match
  it). `async_step_reconfigure_hatched` shares the submit code. Labels:
  - `reconfigure.data.world`: "World" (existing). **UX5 (F6):** the description's
    second and third sentences read "A new name shows everywhere the pet does; its entity
    IDs stay the same. A newly laid egg can also be named on the card during its first
    day. A new world changes the device and which creatures hatch." (replaces "A new egg
    can be named on the card for its first day, too").
  - **UX5 (F3, BUILT in s2673):** the world select is `SelectSelectorMode.LIST` in Add a
    pet and Reconfigure (a dropdown cut the creatures off on a phone).
  - `reconfigure_hatched.data.world`: "World for the next egg" (DRAFT), with
    `data_description`: "{name} stays where it is. Its next egg starts in this world."
    (DRAFT).
- **UX5 (F1, BUILT in s2673): the helper and the device page.** Reconfigure's title,
  placeholder and default now come from `pet_name(hass, entry)`. A submit with a changed
  name writes `title` and clears the device's `name_by_user` (`clear_device_name`); an
  unchanged submit keeps both. What is left for S6: `name_taken` on Reconfigure (below),
  and the `self._shown` guard stores `pet_name` at the moment the form opens, not at
  submit (today's code recomputes it at submit, which cannot catch a card rename in
  between).
- **A name taken (F9).** Reconfigure had no duplicate check (`config_flow.py:131`), so an
  admin could give two pets one name. **Add a pet already has it (UX5 F2, BUILT in
  s2673: `name_taken` on `name`, the line below).** It now uses `names.name_taken(hass, name,
  except_entry_id)` (as shipped in S3: it compares `pet_name`, so a title hidden behind a
  device's own name is free again, UX5 rule; it is not in `coordinator.py`). It is
  checked only when the submitted name differs from the one the form showed, and shows
  the error `name_taken` on the name field, with N15's words as plain flow text: "Another pet here already has that name." (DRAFT).
- **Don't undo a card rename (F10).** The form is filled with `entry.title` when it
  opens (`:161`) and the submit writes `title=name` (`:151-153`), so an admin who opens
  Reconfigure, lets someone rename the egg in the card, then submits for the world would
  put the old name back. The flow remembers the name it showed (`self._shown`); if the
  submitted name equals it, the entry's **current** title is kept.
- **Guide (L4 and the glossary):** one paragraph in `docs/guide.md`: world = which
  creatures hatch and the device's look; shell finish = this pet's colour, picked on
  the card; a rename keeps entity IDs (existing line 395, moved next to it).
- **Files:** `config_flow.py`, `strings.json`, `translations/en.json`, `docs/guide.md`,
  `tests/test_init.py`, `tests/test_names.py` (the name and device-page helpers
  are there; `tests/test_config_flow.py` needed no change).
- **Tests:** pytest: an egg gets `reconfigure`, a hatched pet and an unloaded entry
  `reconfigure_hatched`; submitting either keeps today's world rules (egg moves now,
  hatched waits in `next_world`), already covered by the existing reconfigure tests,
  which must pass unchanged; a name another pet answers to is `name_taken`; a card
  rename between opening and submitting survives a submit that left the name field
  alone.
- **Out of scope:** changing what Reconfigure does beyond the above.

## S7. Settings sheet: bedtime line, sub-headings, shared screen apart (S-M, tier 2)

Owner Q5 (read-only bedtime), review M4 and M5 (card half); review F14, F19; decision
Q-G (§12). Tier 2 because a new sensor attribute shows an admin-only option (the
household's bedtime) to every login.

### The bedtime line

- **Server:** `sensor.<pet>_life_stage` gets `sleep_times: {"bedtime": "HH:MM",
  "wake": "HH:MM"}` from the options (defaults when unset). Added to
  `_unrecorded_attributes` (not in history). It is the pet's schedule, not a person's,
  so it shows on shared screens too. **Owner-approved route (Q-G):** a state attribute
  is visible to every HA user and integration and reaches the event bus, not only the
  card; `_unrecorded_attributes` only keeps it out of the recorder. That is accepted for
  this value. It is worded as a **target**, never as the pet's real bedtime (the pet may
  turn in up to an hour either side, S5's text says so).
- **Card:** in the "for <pet>" group of the settings sheet, under "notices": a read-only
  row **N21** (a target: "about"), times in the viewer's HA time format (`hass.locale.time_format`, 12/24 h).
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
| N21 | row label / value (built at run time, digits, not scanned) | "bedtime" / "about 23:00 · up 07:00" | 7 / 22 (12 h: "about 11:00 pm · up 7:00 am", 27) |
| N22 | sub-headings | "look", "sound" | 4, 5 |
| N23 | heading | "shared screen" (the row keeps its label) | 13 |
| N24 | note, admins only (a statement, F19; in `SETUP_COPY`) | "sensors: see the privacy options" | 32 |

### Files, acceptance, tests

- **Files:** `sensor.py`, `tests/test_recorded.py` (the attribute unrecorded),
  `tests/test_public.py` (**a line for `sleep_times`**: it holds only the two times and
  nothing personal, Q-G), card (`_renderSettings`, `SETUP_COPY`), `scripts/copy-scan.js`, `scripts/card-check.js` (`prefs`, `sharedscreen`), bench (`ui`
  preset's settings shots).
- **Acceptance:** everyone sees the pet's bedtime and wake time on the settings sheet and
  can't change them; the sheet's "this screen" reads as two short groups; the shared
  screen switch is on its own at the bottom.
- **Tests:** pytest: `sleep_times` follows the options and the defaults, is not
  recorded, and `test_public` names it with only `bedtime` and `wake`. Card-check: the row shows on personal and shared screens with the right
  times and no button; N24 only for admins; every existing `prefs` row still toggles
  (the move changes no handler). Bench: the sheet at 330 px, personal and shared, big
  text on.
- **Out of scope:** editing bedtime in the card (owner Q5); a PIN for the shared screen
  (settings-gear §3).

### As built (s2693; reconciled against S3/S4 and the UX fixes)

- **Order (UX F15, first mate 2026-11-02):** the sheet now reads "this screen" (sub-headings
  **sound**: sounds here, babble; **look**: screen effects, holiday names, mono screen, big
  text) → "for you" → "for <pet>" (notices, connect more, **bedtime**, shell) → "shared
  screen" (the switch, its family-tablet note, N24). "this screen" keeps its heading (it says
  who the rows change); the sub-headings sit under it.
- **Bedtime row:** after the "connect more ›" link, so an admin's link stays right under
  "notices". It follows the shipped S1-S6 code: older servers send no `sleep_times` and get no row.
  The label is "bedtime"; the value is built in `sleepLine` (outside the scanned tables: digits).
- **N24** is §13's wording, "sensor privacy is in the pet's options" (`SETUP_COPY.sharedPrivacy`,
  scanned). It shows for an admin, and not on a shared screen (as "connect more ›" does not).
- **N22/N23** are inline headings, as the sheet's other headings are.
- **`test_init.py`:** `test_senses_are_kinds_never_entities` forbade the word "bedtime" anywhere
  in the attributes; it now forbids it in `senses` and checks `sleep_times`.
- **Status page (the 4c gotcha):** the friends row is a 44 px target (`.friendsrow`), and card-check
  4c measures the status with a social level above 0. At 330 a 44 px row above the meters pushed
  "happy" and "energy" off the box, so the row moved below the meters (after "discipline").

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
| L1 "Surprise me" untranslated | **Skip** | Only English exists; turning the option into a key changes the select's value and breaks automations that set "Surprise me". Revisit with a first translation. (S2 sends the select's own `options[0]`, so a later translation keeps working.) |
| L2 First options save freezes defaults | **Skip** (S5 keeps it per topic) | Storing only non-defaults is a migration for no visible gain; with the menu, a save now freezes one topic's defaults, not all of them. |
| L3 Dashboard asked before there is one | **Skip** | S8 is dropped; the field stays for people with a dashboard, and S4's second-pet default and welcome wording cover first run. |
| L4 Rename vs entity IDs | **Do** (S6, guide) | One line. |
| §6 "No mammals" option missing from the options | **Flag, not planned** | See §11 for what the history shows. |

### Review findings by slice (s2658, F1-F22)

| F | Where folded |
|---|---|
| F1 `egg_roster` attribute, names, which world | S2 "The server", "The offer" |
| F2 first generation is not "only surprise me" | S2 flow (two taps unless 2+ creatures, Q-F) |
| F3 surprise row sends `options[0]` | S2 flow step 2, tests |
| F4 lay with `next_world` reloads the entry | S3 "Not loaded", the card trigger, tests |
| F5 how the card knows the lay succeeded | S3 "The trigger", `s.nameSheet` |
| F6 no permission pattern | S3 "Who" (explicit check, `hass_read_only_user`) |
| F7 bound-method premise false | moot: S8 dropped (Q-D) |
| F8 second pet gets the wrong welcome | S4 "The welcome and the second pet" |
| F9 `taken` misses `name_by_user` / `state.name` | S3 `taken`; S6 applies it to Reconfigure |
| F10 Reconfigure overwrites a card rename | S6 `self._shown` |
| F11 errors keyed to sections | S5 errors on real fields |
| F12 missing/broken test files | S5 Files |
| F13 °F rounding drift | S5 temperatures, tests |
| F14 bedtime on the bus | S7 (approved, Q-G, `test_public` line, "target") |
| F15 welcome link to a card-less dashboard | S4 N20b |
| F16 lay sheet lifecycle | S2 "The sheet's life" |
| F17 world of an old entry | S1 |
| F18 disabled entries | S1 (count as used) |
| F19 copy-scan rules | §2, S2/S3/S7 tables (N2, N8, N13, N14, N24) |
| F20 unloaded entry label | S6 |
| F21 two "connect more ›" handlers | S4 |
| F22 spoiling the forms book | S2 N25, status row, C15' |

## 11. Open items

No owner question is open: every earlier question is decided (§12). What is left, none
blocking a build:

- **First mate:** approve the DRAFT copy (§2 rule) before the slices that carry it ship.
  New lines: N2, N8-N18 (N13, N14 reworded), N19, N20b, N24, N25, C13', C15'.
- **"No mammals" (decisions-2026-10-28.md:37) — what the history shows (s2659), not
  built.** `git log -S` for `mammal` (case-insensitive), `CONF_NO_MAMMALS` and
  `no_mammals` finds only the decisions doc (`399eb795`, "decisions taken up front") and
  this plan: the option was **never in code**, so nothing was removed. The creature
  work since went another way: `8e3374b4` ("Voices for the 17 new creatures") put
  realistic `voice.likes` in each `species.json` as the only behaviour (fox likes
  blackberries, beetles, apples; ball python likes quail eggs, egg yolk), with no
  switch. So realistic likes ship and the decision's per-pet switch does not exist.
  Whether the owner still wants the switch is not a question for
  this plan; the first mate files it if so.
- **`set_shell` has no permission check** (F6): a read-only login can set a shell finish
  over the websocket. S3's `rename` checks explicitly; `set_shell` is outside this plan.
  The first mate files a small task if wanted.
- **Deep-link highlight (S4):** the routes exist in frontend 20260930.5; whether the
  integrations page highlights the pet's entry is a visual check on the dev HA, with the
  device page as the fallback.

## 12. Decisions, 2026-11-02 (owner + first mate)

Applied in the body above. Q-A to Q-G came from the s2658 review and this plan's first
draft; the owner's own decisions are marked **OWNER**.

- **Q-A (FM):** the HA select keeps its full roster. The card offers raised creatures
  only (S2); a choice made in HA outside the offer is never named by the card.
- **Q-B (FM):** naming is allowed on a shared screen, like laying (S3).
- **Q-C (FM):** a card rename clears an admin's `name_by_user` (S3).
- **Q-D (OWNER):** **drop S8.** No Pets-dashboard checkbox and no HA internals. S4's
  links and welcome wording cover first run; F8's second-pet welcome problem is handled
  in S4 (the welcome does not nag when the pet already appears on a dashboard the setup
  named; otherwise the plain "add the pet shelf card" line).
- **Q-E (FM):** the naming window is the first day only (egg and baby stages).
- **Q-F (FM):** two taps at the first lay unless the offer has two or more creatures
  (S2).
- **Q-G (OWNER):** bedtime and wake time as an attribute on the life-stage sensor is
  fine; add a `test_public` line (S7).

## 13. First mate copy review (2026-11-02; owner delegated copy review)

All DRAFT copy above is APPROVED, with these rewrites (they win over the tables):
- N14 `bad_name`: "keep it short, and not blank" (28).
- N24: "sensor privacy is in the pet's options" (38).
- `appliance_watts` label: "Counts as off at or below".
Everything else ships as quoted. A builder still adds no string that isn't here.
