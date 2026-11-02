# Favourite pet and the resting switch, 2026-11-02 (build plan)

**Status: PLAN, docs only (s2720).** Written from the scout report s2717 (design scout,
nothing built) and the owner/FM decisions of 2026-11-02 (§1). Every `file:line` in the
scout was re-read against `origin/main` at `60ebf751`; they held (the card ones moved
with the card split: `src/card/<part>.js`, see §10 for the few the scout got loosely).
Line numbers are from `60ebf751`; names win over numbers. Every player line and label
is **DRAFT** until the first mate approves it (decisions 2026-10-28, "How the crew
works"). Build ships are **tier 2** (model/decay behaviour, people-store data).

## 0. Summary

Two separate things, built apart, that change nothing until someone uses them:

- **Resting**: a per-pet household switch, off by default. A resting pet keeps its day
  and night, but its needs, aging, calls, misses and sickness are frozen. It can be
  visited, cared for, played with, linked, and it still gets visitors and finds.
- **Favourite**: a per-person choice (plus an optional household default for shared
  screens) of which pet the card opens on and which pet speaks for that person on their
  phone. It ranks nothing and is shown to nobody else.

| # | Ship | Size | Tier | Touches |
|---|---|---|---|---|
| R1 | Resting: model, switch, settings row, card label, events | L | **2** | `model.py`, `rates.py`, `coordinator.py`, `switch.py`, `__init__.py` (ws), `notify.py`, `intent.py`, `strings.json`, `icons.json`, card (`card-status`, `card-layout`, `card-tick`, `lines`), guide, features |
| R2 | Favourite: people store, card opens on it, heart, phone voice | M | **2** | `people.py`, `coordinator.py`, `__init__.py` (ws, remove), `channel` snapshot, card (`card-base`, `card-build`, `card-layout`, `card-status`), guide, features |
| R3 | The offer: "let the others rest?" after a favourite is picked | S | 2 | `people.py` (one key), card (`card-status`) |

Build order is the table order. R2 and R1 touch no common code, so they can run side by
side; R3 needs both. R3 adds no server rule: it only calls R1's switch for the other
pets.

No new art. The resting pose is an existing idle pose with a small label and CSS (§4.4).

## 1. Decided (2026-11-02, owner and first mate)

Recorded as given in the brief; not up for review in this plan.

- **Owner:** resting is its **own per-pet switch**, separate from favourites, **off by
  default**. Nothing changes on upgrade. A one-time offer after a favourite is picked
  with 2+ pets ("let the others rest?", draft) that **only flips switches**.
- **Owner:** resting **pauses aging**, like the sitter's. A **sick pet may rest**:
  health holds and medicine still works.
- **FM:** the favourite is **per person**, plus an **optional household default** for
  shared screens. **No ranking word** in the UI: a heart on the head dot and a toggle
  like "♥ open on {name}" (draft). "Forget my data" covers it.
- **FM:** a resting pet **still gets visitors and finds**.

Earlier rules this plan keeps: no ranking, no guilt or nagging, wishes credit nobody
(decisions 2026-10-28:50-53); nothing from the people store on a state attribute or the
bus (people.py:1-12); settings open from the gear and the pet's own settings are
read-only on a shared screen (settings-gear §3, as the shell is).

## 2. Copy rules for this plan

Same as the settings plan and `scripts/copy-scan.js`: positive or quiet, no guilt. For
pet lines in a table that the scan covers: 40 characters at most with the longest fill,
no digits, no "?" outside a question, no "!!!", and none of
`still again why never please sad cry alone forgot`. Never: "neglected", "waiting for
you", "missed you", or any count of rest days. A resting pet is not a sad pet and not a
parked one; it is content.

## 3. Resting: the model

### 3.1 What it is

`resting` is a bool on `PetState` (model.py:584 sits `away`), default False, saved with
the pet. It is the owner's choice, never derived from presence, so it is **not** private
the way `away` is (model.py `mood` hides "away" as "asleep" when privacy is on): it may
show on the mood, on Assist and on the switch.

It is a **freeze that still lets people in**. The sitter's `away` freezes the pet and
refuses everything (model.py:2113, 2608, 2873, 1926-1935). Resting reuses the freeze
and refuses nothing.

### 3.2 `advance` and `_rest_step`

`advance` (model.py:999-1026) today picks `shift_times` for `away` and `_step`
otherwise. Add a branch after `away` (away wins):

```python
if state.away:
    shift_times(state, t_next - t)          # unchanged
elif state.resting:
    _rest_step(state, t, t_next, settings, events)
else:
    _step(...)
```

`_rest_step` does exactly this and nothing else:

1. `shift_times(state, t1 - t0)`: every deadline, poop, digest, call and game timer
   slides with the clock, so nothing falls due on waking. `wake_at` stays on the wall
   clock (model.py:947-953), so a resting pet still sleeps at night and wakes in the
   morning. `shift_times` also moves `last_updated`.
2. `_sleep(state, t1, settings, events)`: its day and night go on (lights-out switch,
   dark-and-quiet house, bedtime and morning). With energy held at the floor it can't
   collapse.
3. If asleep: `energy = min(100, energy + R.ENERGY_REGEN_ASLEEP * hours)`. Sleep is
   free. This is what lets a daytime nap end (it ends at `NAP_WAKE_ENERGY` = 95,
   rates.py:32) and a night's sleep wake it full.
4. `_give_treats` (waiting chore treats still arrive; they are not a load).

Skipped, and why:

| Skipped | Rule it carries out |
|---|---|
| `state.age_hours += hours` (model.py:1054-1056) | aging paused (decided) |
| `_decay` (1243-1295) | hunger, happiness, energy, discipline, weight, **and health** all hold. A sick pet's health neither falls nor regens (decided: health holds) |
| `_digest` (1309) | no new poops; the pending ones slide |
| `_sickness` (1320) | no new sickness; a sick pet stays sick until medicine |
| `_calls` (1395) | no calls, no misses, no re-calls, no fake calls |
| `_sample` (1861), `_learn` (1568) | upbringing and trait hours are aging by another name |
| the stage-change block (1049-1072) | stage can't change, an egg can't hatch |

### 3.3 Entering rest: `set_resting(state, on, now)`

Called after `_advance(now)`, like `set_lights_out` (model.py:3550). Returns events.

Entering (`on` and not already resting):

- **Refuse an egg**: result `"egg"` ("hasn't hatched yet"), because aging is paused and
  it would never hatch (Q1).
- **Settle**: `hunger`, `happiness`, `energy` = `max(value, R.REST_FLOOR)`; add
  `REST_FLOOR = 55.0` to rates.py, above every call threshold (25-40, rates.py:137-141)
  and its re-arm levels. Health is **not** touched.
- `call = None`, `latched = {}`, `latched_at = {}`, `recent_misses = []`,
  `last_recall_at = now`, `stayed_up_since = None`; `drop_game` (as `away` does at
  coordinator.py:917). A napping pet is left napping (rule 3 above ends the nap).
  Poops stay (they were earned, and visiting can clean them). `sick` stays.
- Event `{"type": "rest_started"}`.

Leaving (`on` False and resting): `resting = False`; `last_updated = now`; event
`{"type": "rest_ended"}`. Needs resume from where they were held (≥ 55 unless a visit
lowered them: it can't, nothing falls). The first call is hours away (hunger falls
5/h, rates.py:22). **No catch-up and no debt**: every timer was shifted.

Away while resting is fine in both orders: away wins in `advance`; the flag and its
settling are kept; coming home resumes resting. Switching rest on while away applies the
settling at once and the freeze already holds. (`lights_out` defers while away,
model.py:3559; resting needs no deferral because settling is idempotent.)

### 3.4 The systems it touches

| System | While resting | Where |
|---|---|---|
| **Needs floor** | held at ≥ 55 by entry settling plus the freeze; feeding and play raise them, nothing lowers them | `set_resting`, `_rest_step` |
| **Digest / poops** | no new poops; existing slide; cleaning works | `_digest` skipped |
| **Calls and pushes** | none start. On entry an open call is settled (`call_answered` is *not* fired: it was never answered). The phone push of an open call is cleared: add `rest_started` to `CALL_OVER_EVENTS` (notify.py:141-148) and clear the pet from the re-call bundle (`Recalls`, notify.py:197-; `_refresh_recalls` in `__init__.py`) | `set_resting`, notify |
| **Care misses, upbringing** | none counted; the grade is untouched | `_calls`, `_sample` skipped |
| **Sickness** | cannot start; `recent_misses` cleared on entry so leaving rest can't be sick from a day's old misses. A sick pet stays sick, health holds, **medicine works** (care allowed) | `_sickness` skipped; `_do_action` has no resting gate |
| **Aging, stages** | paused; `age_days`, the hatch ETA and the "grows up" lines hold | `_step` branch |
| **Eggs / generations** | an egg can't rest. `can_lay_egg` (model.py:1926) gains `and not state.resting` and `requests` (1703) returns `[]` for a resting pet, so no "lay_egg" request (Q2). `lay_egg` builds a fresh `PetState.new`, so `resting` is never copied to the new egg | model |
| **Journal** | no entry for rest, no rest-day count (decided copy rule). Care log: a toggle is not a care action and logs nothing | – |
| **Visitors** | the daily visit is the server's, picked in every stage (coordinator.py:1279-1283, model `daily_visit`): unchanged. The greeting happens because it is awake (decided) | unchanged |
| **Finds** | `can_find` (model.py:2870) has no resting gate; the roll is in the coordinator tick (coordinator.py:1306-1317), not `_step`, so it goes on (decided) | unchanged |
| **House moments, reactions, house requests** | house moments and reactions are talk (coordinator.py:982, 1234): unchanged. `requests()` returns `[]` while resting (blanket and fan asks are asks) | `requests` |
| **Infrared link** | allowed: the gates are away, asleep, egg only (card-actions.js:111; card-link) | unchanged |
| **Care actions, games, dig** | allowed (`_do_action`, `_refuse_play`: no resting gate). The bond grows within `BOND_DAILY_LIMIT` = 8 (rates.py:389) | unchanged |
| **Lights-out switch, sleep** | works; its night rhythm continues | `_rest_step` |
| **Sitter / away** | **away wins**: full freeze, everything refused, the sitter sign; resting resumes on coming home. Going away does not clear the flag. `sitter_settles` only settles a whine (model.py:1677): rest's settling is a superset | `advance` order |
| **Notifications** | no calls, so no pushes. Morning, holiday and birthday messages are not calls and go on (a resting pet is awake and home; coordinator.py:2253 gates are away and egg only) | unchanged |
| **Phone voice** | `_closest_pet` has no resting filter: a resting pet may still speak for a person | – |
| **Wishes** | not verified; build reads `wishes` in card-looks and the coordinator before R1 merges (§10) | – |
| **Diagnostics** | `resting` is pet state, not a person's: it may appear as a bool | `diagnostics.py` |

**Every pet may rest.** Then the house is on a break: nothing calls, nothing ages. That
suits a holiday (an automation can flip the switches). There is no automatic wake and
no time limit (non-goal).

## 4. Resting: surfaces

### 4.1 Switch entity

`switch.py` has one switch today, `LightsOutSwitch` (switch.py:24). Add
`RestingSwitch(PetEntity, SwitchEntity)`, key `resting`, `is_on = pet.resting`,
`async_turn_on/off` call a new `coordinator.async_set_resting(on)` that mirrors
`async_set_lights_out` (coordinator.py:3021): `_advance(now)`, `model.set_resting`,
`_fire(events)`, `_save()`, `_publish()`. Turning on an egg raises
`HomeAssistantError("hasn't hatched yet")`. Add to `async_setup_entry`, to
`strings.json` entity names (next to `lights_out`, strings.json:306), and `icons.json`
(next to 114; icon draft `mdi:sofa`). It is a normal entity: not a diagnostic, not
hidden, and exposable to Assist by the owner as any switch.

### 4.2 Websocket for the card

`virtual_pet/rest {entity_id, enabled}` in `__init__.py`, next to `my_day`
(`__init__.py:765-784`). Any logged-in user may set it (the pet is the household's).
The switch entity covers HA's own permissions. Like the shell (settings-gear §3), the
card shows it **read-only on a shared screen** (Q3).

### 4.3 Settings row

In `_renderSettings` (card-status.js:187), a "resting" row with a switch, for the shown
pet, and a helper line. Hidden for an egg. Draft copy:

- Row: "resting".
- Helper: "{name} stays content with no calls and no hungry tummy, and doesn't grow up
  until it's back. Visit any time."
- Read-only on shared screens: the switch shows its state, with the helper.

### 4.4 Card label and pose

No sitter sign (it is home). The card's `mood.state` for a resting pet is its normal
mood; the **flag** `resting` is added to `mood_keyed` flags (model.py:3628 is where
`away` is added) and the card reads it:

- A small label "resting ☁" under the pet (where the away sign puts "at the sitter's",
  card-layout.js:538-541), in the same quiet style.
- Pose: the existing idle pose, with a slow breathing CSS animation. No new frames, no
  new art. `prefers-reduced-motion` and the mono and sound prefs behave as for idle.
- Idle chatter while resting comes from a `RESTING_IDLE` table in `lines.js` (§4.6).
- Priority: asleep, sick and egg poses win over the resting label. A sick resting pet
  shows sick, and the label still reads "resting ☁" in the status page.
- Shelf dots: no mark for resting (it ranks nothing and a dot with a cloud reads as a
  state to nag about).

### 4.5 Assist, the bus, the mood

- `intent.py`: `MOOD_WORDS["resting"] = "is taking it easy"` (intent.py:35). A
  resting pet that is asked to be fed or played with is not refused. No new intent: the
  switch is exposable and "turn on Pip resting" works through HA's own intents.
- Bus events `virtual_pet_rest_started` and `virtual_pet_rest_ended`, fired by `_fire`
  (coordinator.py:1158), carrying only `pet_id`, like `went_away` and `came_home`. No
  user, no reason. Documented in the guide's events list (guide.md:1015) and
  features.md:215.
- `sensor.mood` flags include `resting`; the sensor that reports "away" as "asleep"
  under privacy does not do so for resting.

### 4.6 Draft lines

Pet, idle while resting (each ≤ 40 characters, scan-safe): "just pottering about ♪" ·
"comfy here! ☁" · "having a lazy day, hehe" · "this is a good spot ♪". On a visit: the
usual hello, and now and then "oh! hi ♥ i was just daydreaming". Leaving rest: "good
stretch! i'm back ♪" · "that was a nice rest!". Status-page label: "resting" (alts:
"taking it easy", "a lazy day"). A baby-talk variant of each goes in `BABY`
(lines.js:91) per the existing rule; `RESTING_IDLE` and the leave lines go in
`COPY_TABLES` (scripts/copy-scan.js) so the scan covers them.

## 5. Favourite

### 5.1 Who owns it, and what it is

Per person. HA knows who sits at each screen (`hass.user`, card-base.js:232) and the
people store exists for exactly this kind of per-person, cross-pet fact (people.py:1-12).
One favourite per person: picking another moves it. There is no word for it in the UI
(decided): a heart on the head dot and a toggle.

### 5.2 Storage

- **Person:** `people[user]["favourite"] = <pet_id>` (the pet's config-entry id,
  coordinator.py:243). Add `"favourite": lambda v: isinstance(v, str)` to `_PERSON_KEYS`
  (people.py:472-). A stale id (the pet was removed) is ignored on read and cleared on
  the next write; `async_remove_entry` (`__init__.py:1003`) also clears it from every
  person and from the house default.
- **House default:** `data["house"]["favourite"] = <pet_id>`. `People.async_load`
  rebuilds `data` from only `people` and `weather` (people.py:196-209), so it must read
  and keep `house` (a dict with an optional `favourite` str, dropped quietly if the
  shape is wrong, as the other keys are).
- **Forget my data** (`People.forget`, people.py:247-258) pops the whole record, so the
  person's `favourite` goes with it; only `birthday_skipped` is kept. The card's forget
  handler (card-status.js:455-470) adds `favourite` to its `_setMine` key list and
  removes the local cache key (§5.3). The **house default is no person's** and
  "Forget my data" does not touch it.
- It never goes on a state attribute or the bus, never in diagnostics (people.py:11-12).

### 5.3 How the card gets it and what it does

- Private: each pet's `mine` object (coordinator.py:1744 and 2574, where `my_day` and
  `baby_talk` ride) gains `favourite: bool` ("this pet is my favourite"). Shared screens
  get `mine = null` (card-base.js:304, 321), so a shared screen never learns anyone's
  favourite (coordinator.py:2625 principle).
- House default: the shared screen's snapshot gains `house_favourite: bool` for that
  pet, sent only on a `shared` subscription (`channel` watchers carry `shared`,
  channel.py:19). It is the household's, and says nothing about a person.
- **Opens the card on it.** On a personal screen, at the first draw, the person's
  favourite beats the saved shelf position (`shelfRead`, world.js:464; restored at
  card-build.js:566). The snapshots arrive after the build, so the card caches the
  favourite's device id in `localStorage` as `hatch-fav-${user}` (the way
  `hatch-welcomed-${user}` does, card-status.js:468): the next load opens on it at
  once. The very first time (no cache) the card opens as today, and moves only if the
  snapshot arrives inside the first 1.5 s and the person hasn't swiped. After that,
  swiping works as today and `shelfWrite` (card-build.js:896) keeps the position inside
  the session. No favourite: today's behaviour.
- **Shared screen:** the house default if there is one, otherwise today's shelf position.
  It never shows a heart (a mark anyone can see would rank, Q3).
- **Heart:** on the head dot (card-layout.js:312-327), a small ♥ on the person's
  favourite, personal screens only, and only when there are 2+ pets.
- **Toggle:** in the settings sheet for the shown pet, shown only with 2+ pets: "♥ open
  on {name}". On sets it (and moves it from the old pet); off clears it. Admins on a
  personal screen get a second row: "shared screens open on {name}", the house default.
- **Phone voice.** `_closest_pet(user)` (coordinator.py:1587-1599) gains one rule: if the
  person's favourite is a loaded pet that notifies them, return it; else the closest
  bond, as now. The birthday code repeats the selection inline with an extra filter,
  not away and not an egg (coordinator.py:2268-2279); R2 folds both into one
  helper `_voice_pet(user, eligible=...)` so the favourite rule is written once, and the
  birthday keeps its filter (a favourite that is away or an egg doesn't speak; the
  closest eligible does).

### 5.4 Server API

`virtual_pet/favourite {entity_id, enabled, scope}` in `__init__.py`; `scope` is `"me"`
(any logged-in user) or `"house"` (admin only, refused otherwise with the usual
`unauthorized`). Handler `coordinator.async_set_favourite(user, enabled)` follows
`async_set_my_day` (coordinator.py:2232-2243): set or pop the key under the person's
lock (people.py:176), save (at once on an off), and `async_set_updated_data` on **every**
pet, because the previous favourite's `mine` changed too.

## 6. The offer

After a person turns their favourite **on** with 2+ pets that are not eggs, the settings
sheet shows one inline row under the toggle (no modal, nothing blocks):

- "Let the others rest?" with two buttons, "rest them" and "not now". Helper: "Resting
  pets stay content with no calls and don't grow up, for everyone at home. Wake them
  any time."
- **"rest them"** calls `virtual_pet/rest` for each other pet that is not an egg and
  not already resting. It flips switches and does nothing else: no favourite change, no
  server rule, no automation.
- Either button sets `people[user]["rest_offer"] = true`
  (`isinstance(v, bool)` in `_PERSON_KEYS`), and the offer is **never repeated** for that
  person. "Forget my data" erases the key, so a person who forgot may see it once more
  (that is a fresh start; a refusal that must survive is the birthday's special case
  only).
- Not shown on a shared screen (there is no person), nor when every other pet is an egg
  or already resting.

The offer is the only place the favourite and resting meet. Neither reads the other.

## 7. Save impact

- **Pet save:** `resting: bool = False` on `PetState`; add `"resting"` to the bool list
  in `from_dict` (model.py:687). A missing key is False. **No migration and no version
  bump** (`PetStore` has none, coordinator.py:215-226; `STORE_MINOR_VERSION` 1,
  const.py:17). `lay_egg` doesn't copy it. Existing households: no pet rests, no favourite
  exists, behaviour is byte-for-byte today's.
- **Downgrade of the pet save:** an older version keeps `resting` as an unknown key
  (`from_dict` keeps them, model.py:669-675; `lay_egg` carries `unknown` over,
  model.py:1969) and runs normal decay from the held values, which are ≥ 55 except health.
  A sick resting pet resumes its health drain, and a pet that was resting for weeks
  simply ages again. Nothing dies (`HEALTH_FLOOR` = 1.0, rates.py:41) and nothing
  freezes. On upgrading again the key is read back and the pet is resting again.
- **People store:** per-person `favourite` and `rest_offer` ride in the person record; an
  older version keeps person keys it doesn't know ("keys this version doesn't know are
  kept as they are", people.py:466-469), so they survive a round trip. The **house
  default** is a new top-level key that an older `async_load` rebuilds away (people.py:196)
  : harmless, but the household default is lost on a downgrade-upgrade cycle and must be
  set again. The people store keeps its version.
- **Privacy:** favourite is per-person: private channel only, not in diagnostics, erased
  by "forget my data". Resting is pet state: a normal entity.

## 8. Tests, one per rule

Pytest unless noted. Names are suggestions; `tests/test_resting.py` and
`tests/test_favourite.py` are new.

**R1, resting (`tests/test_resting.py`, plus edits to `test_assist.py`, `test_notify.py`,
`test_init.py`):**

1. Default: a fresh pet and a loaded save without the key are not resting; a household
   advanced a day with no resting pet gives byte-identical state to `origin/main` (a
   recorded run in `test_recorded.py`).
2. Entry floors hunger, happiness and energy to 55 and leaves health unchanged (a sick
   pet at health 30 stays 30).
3. A day of `advance` while resting: needs, health, weight, discipline, poops, `age_hours`,
   `care_misses`, `recent_misses`, `discipline_samples`, `trait_hours` unchanged; no
   events but sleep and wake.
4. No call is ever started, including fake ones, over 7 days across many seeds.
5. Entering with an open call (real, fake, recall, latched) clears it and the latches;
   leaving gives no immediate call.
6. A sick pet may rest: stays sick, health holds, medicine cures it, health then regens
   only after leaving rest.
7. Care and games work while resting; the bond grows within `BOND_DAILY_LIMIT`.
8. Aging: `life_stage` doesn't change over a simulated month; `can_lay_egg` is False
   and `requests` has no `lay_egg`; the new egg from `lay_egg` isn't resting.
9. An egg refuses (`"egg"`), by model and by the switch (`HomeAssistantError`).
10. Sleep: lights-out works; a resting pet falls asleep at bedtime, wakes at the morning,
    regens energy asleep; a daytime nap ends at 95; a pet can't collapse.
11. Precedence: away + resting: away wins, everything refused; coming home resumes
    resting; resting set while away; resting cleared while away.
12. Time: a restart and a long gap (`catch_up`, `max_gap`) while resting shift timers and
    change nothing else; leaving rest with a poop pending lets it fall due after the
    remaining time only.
13. Finds roll while resting; the daily visit is picked and greeted.
14. Bus: `rest_started` and `rest_ended` fire once each with only `pet_id`; neither
    notifies; `rest_started` clears a posted call push and takes the pet out of the
    recall bundle.
15. Switch entity: on/off, state restore from the pet, translation keys exist; privacy
    test: `resting` is on the mood flags but the `away` masking is unchanged.
16. Assist: mood phrase for resting; feed/play aren't refused.
17. Downgrade: a save with `resting: true` loads in a build that doesn't know the key
    (simulated by `from_dict` with the key dropped from `fields`) and round-trips it.
18. JS (`tests/js/resting_lines.test.js`): `RESTING_IDLE` passes the copy scan; every
    line has a `BABY` variant; the label shows for flag `resting`, not for `away`, and
    the sitter sign is not shown.

**R2, favourite (`tests/test_favourite.py`, plus `test_people.py`, `test_forget.py`,
`test_channel.py`):**

19. Set, move and clear; one favourite per person; a second person's is independent.
20. `mine.favourite` is true only for that person's pet; **never** on a shared
    subscription; `house_favourite` only there.
21. `virtual_pet/favourite` scope `house` refused for a non-admin.
22. "Forget my data" removes the person's favourite and its cache key (JS), and leaves
    the house default.
23. `async_remove_entry` of the favourite pet clears person and house references; a
    stale id on load is ignored.
24. `People.async_load` keeps `house`; a damaged `house` shape is dropped quietly, other
    keys intact.
25. `_closest_pet`: with a favourite that notifies the person, it speaks; a favourite
    that doesn't notify them is ignored; none set gives today's closest bond; the
    birthday keeps its away/egg filter.
26. Nothing in a state attribute, the bus event or diagnostics contains a favourite
    (extend the existing privacy sweep in `test_public.py`).
27. JS: with a cached favourite the card opens on its device; with none, on `shelfRead`;
    a swipe within the session is kept; a shared screen opens on the house default, or
    the shelf; no heart on a shared screen; no toggle for one pet.

**R3, the offer (`test_people.py`, JS):**

28. Shown once after a favourite is set with 2+ non-egg pets; not shown on a shared
    screen, with one pet, or after either button; "rest them" flips exactly the others
    that are not eggs and not resting, and touches no favourite; "not now" flips nothing.
29. `rest_offer` is erased by forget and survives a restart.

## 9. Ships, acceptance criteria, device queue

Gates as AGENTS.md: ship workers run `scripts/gate --auto`; the full gate is the first
mate's once per merged batch. R1 and R2 touch server code, so `pick-sections` is likely
to pick `all` and `scripts/ci-gate` is the route. Bench presets to add: `resting`
(label, pose, settings row, sheet at 420/330/300, day/night, mono, big text, baby, shared
screen read-only) and, for R2/R3, `favourite` (dots with a heart, the toggle, the house
row, the offer row). The bench pins `resting` and `favourite` through the fake `hass`;
no real HA is needed for looks.

### R1, Resting (tier 2)

Acceptance:

- With nothing switched, a recorded week matches `origin/main` exactly (test 1).
- Switching on in HA, the card or Assist makes tests 2-17 true; switching off leaves
  no debt (test 12).
- The card shows "resting ☁" and the idle pose; never the sitter sign (test 18); the
  settings row and helper read as in §4.3, read-only on a shared screen.
- Guide: a "Resting" section (the options chapter and the multi-pet part), the events
  list, the Assist words; features.md rows; `docs/` mention that aging pauses.
- No pet line fails the copy scan; every new line has a baby variant.
- `scripts/card-check` section for the settings row passes (§ `--only` list from
  `scripts/pick-sections`); bench preset `resting` rendered and read.

Device queue (the owner, on real screens; none is a gate):

1. Phone (HA companion): switch one of three pets to resting from its settings; a call
   that was showing on the lock screen disappears.
2. A day later: the resting pet has not called, hasn't grown, and still says its idle
   lines; feeding it and playing with it works.
3. Wall tablet (shared screen): the resting state shows, the switch is read-only.
4. HA automation: flip the switch on leaving for a holiday and off on return.
5. Turn it off: the pet says its leave line and does not call for hours.

### R2, Favourite (tier 2, people-store data)

Acceptance:

- Tests 19-27 pass; the privacy sweep (26) proves it is on no attribute, bus event or
  diagnostic.
- On a personal screen with a favourite, the card opens on it (after the first visit via
  the cache); with none it opens as today. A heart sits on that pet's dot for that
  person only.
- Admins can set a house default; a shared screen opens on it; no heart is shown there.
- "Forget my data" clears the favourite, the cache key and the heart.
- The birthday and send-off messages come from the favourite when it notifies the person.
- Guide: favourite described without a ranking word; features.md.

Device queue:

1. Two people on two phones pick different favourites: each opens on their own pet, and
   neither sees the other's heart.
2. Wall tablet: opens on the house default (set by an admin), no heart, no toggle.
3. Pick a favourite, restart HA, reload the phone: it still opens there.
4. "Forget my data": the heart and the opening pet reset.
5. A morning message arrives on the phone from the favourite pet.

### R3, The offer (tier 2, small)

Acceptance: tests 28-29; the offer reads as §6; it appears once per person.

Device queue: pick a favourite on a phone with three pets, see the offer, tap "rest
them": the two others rest and the favourite doesn't; pick another favourite later: no
second offer.

## 10. Not verified, and where the scout was loose

Re-read and holding: model.py 584, 687, 945-1026, 1041-1083, 1243-1295, 1320, 1395,
1677, 1703, 1926, 2105-2114, 2607, 2870; coordinator.py 243, 914-927, 1158, 1587-1599,
2232-2243, 2253-2285, 3021; switch.py:24; people.py 176, 196-209, 247, 472; card-build.js
566 and 896; card-layout.js 312-327 and 538-541; card-base.js 232; card-status.js 187 and
455-470; world.js 464-477; notify.py 141-148; rates.py 22, 32, 41, 137-141, 389.
Loose in the scout: its card claims cite the old single file's names, now `src/card/`
parts (the AGENTS.md table); `_closest_pet` is at coordinator.py:1587 but the inline
repeat is the birthday at 2268-2279; "away ... 2113-2114 `_do_action`" is right.

Still not verified, and the build reads these before R1 merges:

- Wishes: how a pet's wish is raised and granted (card-looks, the aimed wish in
  card-check section 8) against a pet whose needs are frozen. Expect no change; read it
  before R1 merges.
- The upbringing grade at adulthood for a pet that rested through its growing years:
  `upbringing(state, final=True)` reads `discipline_samples`; with few samples it may
  fall back to a default grade. Check it reads "well-raised" and not "neglected".
- `sensor.py` age and hatch-ETA sensors for a resting pet (they hold).
- Whether the bench can pin `resting`: it can't today; R1 adds it.
- The card's start slide on a shared versus a personal screen beyond the shelf path
  (card-base.js:120-160 not read in full): R2 reads it first.
- `playwright` isn't installed in this worktree, so `card-check --list` wasn't run; the
  section names above come from `scripts/pick-sections` in the build.

## Open questions for the owner

Only what is still open. Recommendation first.

1. **Can an egg rest?** Recommended: **no.** Aging is paused, so it would never hatch, and
   an egg has no needs to relieve. The switch refuses with "hasn't hatched yet", and the
   offer skips eggs. Alternative: allow it, so a holiday pauses hatching too.
2. **Can a resting pet lay its egg?** Recommended: **no, wake it first** (`can_lay_egg`
   and `requests` skip it, as they do for sick and away). Alternative: laying ends the
   rest and the new egg starts awake. Laying is the end of a life chapter and should be
   chosen by a person who sees the pet awake.
3. **Shared screens.** Recommended: the shared screen **shows** a pet's resting state but
   its switch is **read-only** (as the shell is), and it **never shows a heart**; it
   opens on the house default. Alternative: anyone at the tablet can wake a pet, and the
   house default's heart shows.
4. **Who sets the household default?** Recommended: **admins only**, from a personal
   screen's settings row. Alternative: any logged-in user (a child could change what the
   hall tablet opens on).
5. **Does resting give the free refill?** Recommended: **yes**, entry raises hunger,
   happiness and energy to 55, because without it a hungry pet put to rest would call the
   moment it woke. It also lets a worn-out pet reset by resting then waking. Alternative:
   freeze the needs exactly as they were and accept a call on waking, which feels worse.

## Adversarial review checklist

For the reviewer (tier 2: at least one pass before each ship merges).

**Behaviour changes on upgrade**
- [ ] With no pet resting, no favourite and no house key, a recorded week and a full
      pytest run are identical to `origin/main`. Check `_step`, `advance`, `requests`,
      `can_lay_egg`, `_closest_pet` all keep the default path.
- [ ] No new key is written to a save until something is switched on.

**The freeze**
- [ ] `_rest_step` really skips every aging path. Grep `age_hours`, `trait_hours`,
      `discipline_samples`, `last_sample_at`, `counted_misses`, `recent_misses` for a
      write outside `_step`.
- [ ] Anything on the coordinator's own clock that bypasses `advance` (finds, the daily
      visit, treats, house moments, `next_news`, `next_react`) is intended to run.
- [ ] `fast_forward` and `catch_up` with a resting pet: no stage change, no calls.
- [ ] A pet resting at a stage boundary, an egg laid while resting, a hatching on the
      same tick as rest begins: none can leave a resting egg.
- [ ] `shift_times` moves `last_updated`; `advance` also sets it. No double shift.
- [ ] A napping pet that rests: the nap ends; a pet asleep at night still wakes at the
      morning; the lights-out switch while resting isn't refused.
- [ ] A pet that rests while asleep with a paused call: the call is cleared on entry.

**Care and exploits**
- [ ] The free refill (Q5): rest-and-wake cannot be used to dodge `care_misses` already
      counted (it can't; they stay), or an open sickness (it doesn't heal it).
- [ ] Feeding a resting pet repeatedly can't make it heavy then sick on waking
      (`full` refuses; weight has no burn while resting). Check `weight` after a
      day of feeding and the first tick after leaving rest.
- [ ] A sick pet with health under 25 rests: on waking `_sickness` sees low health
      immediately. Decide it's honest or add a grace (the plan keeps it honest).
- [ ] Bond growth while resting is still capped by `BOND_DAILY_LIMIT`.

**Notifications**
- [ ] A call push posted before rest is cleared from every phone; the recall bundle
      doesn't name a resting pet; no re-call fires after waking within `RECALL_HOURS`.
- [ ] No resting-related message to a phone says or implies neglect or an absence.

**Privacy**
- [ ] The favourite is on no state attribute, bus event, diagnostics, log line or
      `issue` text; on no shared-screen snapshot; the per-person lock is taken for writes.
- [ ] `house_favourite` leaks nothing a person chose; it is admin-set, household-level.
- [ ] `resting` on the mood isn't a presence signal (the sitter's `away` is, and keeps
      its masking).
- [ ] The cache key `hatch-fav-${user}` is removed by forget and never holds another
      user's value on a shared browser (keyed by user id).
- [ ] `rest_offer` leaks nothing and forget handles it.

**Save and downgrade**
- [ ] `from_dict` type-checks `resting`; a string or int `resting` is False.
- [ ] A save written by R1, loaded by `origin/main`, then by R1 again: no data lost, no
      crash, `resting` back on.
- [ ] People store: person `favourite` of the wrong type is dropped; `house` of the wrong
      type is dropped; a downgrade keeps person keys and loses `house` (documented).
- [ ] `async_remove_entry` leaves no dangling id; a removed and re-added pet isn't a
      favourite again (new entry id).

**Card**
- [ ] The label never reads as the sitter's sign; the settings row is read-only on a
      shared screen; baby talk, mono, big text and 300 px width fit.
- [ ] The card never jumps pets after the user has swiped; the 1.5 s window and the
      cache hold; a two-card page behaves.
- [ ] Every new pet line passes `copy-scan` and has a baby variant.
- [ ] No ranking word anywhere ("favourite", "best", "main", "top") in a player string;
      the guide uses it only as the feature's description, not the UI's label.
- [ ] The heart is on the dot only on a personal screen with 2+ pets.

**Offer**
- [ ] "rest them" flips switches only; it can't be triggered twice, shown twice, or
      shown to a person who cannot see more than one pet.
- [ ] Declining is as easy as accepting and equally permanent.

**Docs and gates**
- [ ] Guide, features.md, events list, Assist words and the settings chapter match the
      code (the last commit `60ebf751` did this for settings; keep it so).
- [ ] Bench presets exist and were read; card-check sections chosen by `pick-sections`
      ran, and the full gate is the first mate's.
