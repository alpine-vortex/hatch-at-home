# Favourite pet and the resting switch, 2026-11-02 (build plan)

**Status: PLAN, docs only (s2720).** Written from the scout report s2717 (design scout,
nothing built) and the owner/FM decisions of 2026-11-02 (§1). Every `file:line` in the
scout was re-read against `origin/main` at `60ebf751`; they held (the card ones moved
with the card split: `src/card/<part>.js`, see §10 for the few the scout got loosely).
Line numbers are from `60ebf751`; names win over numbers. **Revised (s2725)** after the
adversarial review s2724, every finding checked against the code at `9cdc5824` (the
review's tags B1-B3, S1-S14 appear in brackets where a rule came from one). Every player line and label
is **DRAFT** until the first mate approves it (decisions 2026-10-28, "How the crew
works"). Build ships are **tier 2** (model/decay behaviour, people-store data).

## 0. Summary

Two separate things, built apart, that change nothing until someone uses them:

- **Resting**: a per-pet household switch, off by default. A resting pet keeps its day
  and night, but its needs, aging, new calls, misses and new sickness are frozen. It can
  be visited, cared for, played with, linked, and it still gets visitors and finds. An
  egg can't rest, and a resting pet can't lay.
- **Favourite** (code key `open_on`, §5): a per-person choice (plus an optional household
  default, set by an admin, for shared screens) of which pet the card opens on and which
  pet speaks for that person on their phone for the birthday and the send-off. It ranks
  nothing and is shown to nobody else.

| # | Ship | Size | Tier | Touches |
|---|---|---|---|---|
| R1 | Resting: model, switch, settings row, card label, events | L | **2** | `model.py`, `rates.py`, `coordinator.py` (incl. `MOMENTS`), `switch.py`, `__init__.py` (ws), `notify.py`, `intent.py`, `sensor.py`, `strings.json`, `icons.json`, card (`card-status`, `card-layout`, `card-tick`, `card-moment`, `lines`), guide, features |
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
- **FM (2026-11-02, replaces the open questions 1-5 of the first draft):**
  1. **Eggs can't rest.** The switch and the model refuse an egg (§3.3, §4.1).
  2. **A resting pet can't lay.** Wake it first (`can_lay_egg` and `requests` skip it).
  3. **A shared screen shows a pet's resting state read-only** (no switch to flip), **never
     shows a heart**, and opens on the household default (§5.3).
  4. **Only admins set the household default.**
  5. **Entering rest refills hunger, happiness and energy to 55** (`REST_FLOOR`), health
     untouched.

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
refuses everything (model.py:2113, 2608, 2873, 1926-1935). Resting holds the same
*needs and aging* but refuses nothing, so it **must not call `shift_times`**: that
function also slides every timestamp a care action writes (`praise_window_at`,
`praise_day_at`, `last_excite`, `cozy_until`, `cool_until`, `kept_up_until`, `game.last_at`,
`chore_treats`, `last_care_at`, `praised_care`: model.py:945-979, `UPBRINGING_TIMES`), and
for a pet that is cared for every rest step would push "just now" forward again. The
30-minute praise window would never close, the praise day never roll, the pet would stay
`excited`, a pet woken by hand at night could never be put back to bed by the house, and
the chore-treat cap would never open [B1, confirmed in the code]. Rest slides a *narrow*
list instead (§3.2).

### 3.2 `advance`, `_rest_step`, `_hold_times`

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

`_hold_times(state, delta)` is new and slides **only what must hold**:

| Slides with the clock (held) | Why |
|---|---|
| `poops`, `digesting` | no new poops; the pending ones fall due after their remaining time only |
| `latched_at`, `last_recall_at` | a re-call is not due sooner on waking |
| `last_sample_at`, `miss_day_at` | the upbringing sampling clocks (nothing is sampled) |
| `stayed_up_since`, `recent_misses`, `call` | cleared on entry (§3.3); slid anyway for a state loaded mid-rest |

Everything else **stays on the real clock**, because a person's visit writes it:
`praise_window_at`, `praise_day_at`, `last_care_at`, `praised_care`, `last_excite`,
`cozy_until`, `cool_until`, `kept_up_until`, `chore_treats`, `game`, `parked`, `opening_at`.
`last_updated` is set by `advance` as it is for `_step`; `_hold_times` doesn't move it
(the build reads `advance` to confirm no double shift). `catch_up` (a restart) keeps
using `shift_times` for every pet, as it does today: downtime is not a visit.

`_rest_step` does exactly this and nothing else:

1. `_hold_times(state, t1 - t0)`. `wake_at` stays on the wall clock (model.py:947-953), so
   a resting pet still sleeps at night and wakes in the morning.
2. `_sleep(state, t1, settings, events)`: its day and night go on (lights-out switch,
   dark-and-quiet house, bedtime and morning). With energy held at the floor it can't
   collapse.
3. If asleep: `energy = min(100, energy + R.ENERGY_REGEN_ASLEEP * hours)`. Sleep is
   free. This is what lets a daytime nap end (it ends at `NAP_WAKE_ENERGY` = 95,
   rates.py:32) and a night's sleep wake it full.
4. The game's idle drop that `_step` does (`GAME_IDLE_MINUTES`, model.py:1041-1043), so a
   game started during rest doesn't stay open until the next sleep.

Skipped, and why:

| Skipped | Rule it carries out |
|---|---|
| `state.age_hours += hours` (model.py:1054-1056) | aging paused (decided) |
| `_decay` (1243-1295) | hunger, happiness, energy, discipline, weight, **and health** all hold. A sick pet's health neither falls nor regens (decided: health holds) |
| `_digest` (1309) | no new poops; the pending ones slide |
| `_sickness` (1320) | no new sickness; a sick pet stays sick until medicine |
| `_calls` (1395) | no new calls, no misses, no re-calls, no fake calls |
| `_sample` (1861), `_learn` (1568) | upbringing and trait hours are aging by another name |
| `_give_treats` (3511) | it raises hunger, happiness and weight and writes `trait_hours["chores"]`; `treats_waiting` stays banked and arrives after waking [S5] |
| the stage-change block (1049-1072) | stage can't change, an egg can't hatch |

### 3.3 Entering rest: `set_resting(state, on, now)`

Called after `_advance(now)`, like `set_lights_out` (model.py:3550). Returns events.

Entering (`on` and not already resting):

- **Refuse an egg**: result `"egg"` ("hasn't hatched yet"), because aging is paused and
  it would never hatch (decided). Refused on every path: model, switch, ws.
- **Settle**: `hunger`, `happiness`, `energy` = `max(value, R.REST_FLOOR)`; add
  `REST_FLOOR = 55.0` to rates.py, above every call threshold (25-40, rates.py:137-141)
  and its re-arm levels. Health is **not** touched.
- `call = None` (an open call is settled: no `call_answered`, no miss; the same as
  answering it by feeding), `recent_misses = []`, `stayed_up_since = None`,
  `last_recall_at = now`; `drop_game` (as `away` does at coordinator.py:917). **Latches
  stay as they are**: the settled needs re-arm on the first `_calls` after waking.
  A napping pet is left napping (rule 3 above ends the nap). Poops stay (they were
  earned, and visiting can clean them). `sick` stays.
- **Refill cooldown (owner, 2026-11-02, R1-1 from audit s2739; replaces Open question
  1's "none"):** the settling above (the refill to `REST_FLOOR`, `call = None`,
  `recent_misses = []`, `last_recall_at = now`) happens **at most once per
  `R.REST_REFILL_HOURS` = 12 h**, by one saved stamp `last_rest_refill_at` (float, `None`
  in an old save = allowed). A rest entered inside the window only pauses, as rest
  does: no refill, and an open call and the misses stay (held, as every timer is).
  `stayed_up_since = None` and `drop_game` still run on every entry.
- `rest_since = now` (new float on `PetState`, `None` when awake), used by the birthday
  rule below.
- Event `{"type": "rest_started"}`.

Leaving (`on` False and resting): `resting = False`; `last_updated = now`; `rest_since`
cleared; event `{"type": "rest_ended"}`. Leaving rest **also works on an egg**: an egg
can't enter rest, but a downgraded save may carry one (§7) and it must be wakeable.

What waking looks like [B2, S6, checked in the code]:

- **No hunger, happiness or energy call, no miss and no debt**, as long as care hasn't
  spent the settled needs: they are ≥ 55 and every timer was held, so the first such call
  is hours away (hunger falls 5/h, rates.py:22).
- **Sick and dirty ask as before.** `_call_condition` for `sick` is just `state.sick` and
  for `dirty` is "the first poop is older than 30 minutes" (model.py:1353-1361), with no
  threshold, and poops are only held, so their age is kept. A pet that rested sick or with
  an old poop calls about it on the first `_calls` after waking. That is honest (it is
  still sick or dirty; medicine and cleaning work during rest) and the plan keeps it. It
  counts as no miss until it goes unanswered.
- **Care can spend what rest settled.** Play costs energy 10 and hunger 5 and is allowed
  down to `PLAY_MIN_ENERGY` = 15, below the energy call level of 20 (rates.py:53-55);
  medicine costs happiness 5, an unfair scold 10; feeding adds weight and `digesting`
  entries that become poops in turn after waking. So a pet that was played with a lot may
  leave rest below a threshold and call at once: the same rule as for an awake pet.
- Nothing lowers a need *by itself* during rest.

**Birthday and calendar surfaces** [S4]. Aging is paused but `hatched_on` is a date
`shift_times` cannot move (model.py:1125-1129), and `pet_birthday(hatched_on, today)`
feeds the party on the sensor (sensor.py:296-306) and the notes. Default (the owner may
veto, see Open questions): **no pet birthday while resting** (`pet_birthday` and the
party see `resting` and give none), and **on leaving, `hatched_on` moves forward by the
whole local days rested** (from `rest_since`), so the pet's years are the time it lived.
`bond.since` and `friends_for` are the *friendship's* calendar and keep running.

Away while resting is fine in both orders: away wins in `advance`; the flag and its
settling are kept; coming home resumes resting. Switching rest on while away applies the
settling at once and the freeze already holds. (`lights_out` defers while away,
model.py:3559; resting needs no deferral because settling is idempotent.)

### 3.4 The systems it touches

| System | While resting | Where |
|---|---|---|
| **Needs floor** | set to ≥ 55 on entry and held by the freeze; nothing lowers them by itself. Play, medicine and an unfair scold still cost (§3.3), so a pet can leave rest below a call level | `set_resting`, `_rest_step` |
| **Digest / poops** | no new poops; existing slide; cleaning works | `_digest` skipped |
| **Calls and pushes** | no hunger, happiness, energy or fake call starts. On entry an open call is settled (`call_answered` is *not* fired). The phone push of an open call is cleared by adding `rest_started` to `CALL_OVER_EVENTS` (notify.py:141-148): that is enough, because `_fire` already runs `update_recalls` after every event batch and `asking()` is `None` once the call is cleared, so no extra bundle wiring [review: checked]. On waking, `sick` and `dirty` ask as before (§3.3). The blueprint `call_response.yaml` triggers only on `call_started`: no change | `set_resting`, notify |
| **Care misses, upbringing** | none counted; the grade is untouched | `_calls`, `_sample` skipped |
| **Sickness** | cannot start; `recent_misses` cleared on entry so leaving rest can't be sick from a day's old misses (part of the settling, the same class as the refill). A sick pet stays sick, health holds, **medicine works** (care allowed; it adds 25, so a cured pet leaves at 26 or more) | `_sickness` skipped; `_do_action` has no resting gate |
| **Aging, stages** | paused; `age_days`, the hatch ETA and the "grows up" lines hold. The pet birthday and `hatched_on` follow §3.3. `fast_forward` (a dev tool) on a resting pet advances and holds back to nothing: it can't test growth | `_step` branch |
| **Eggs / generations** | an egg can't rest (decided). `can_lay_egg` (model.py:1926) gains `and not state.resting` and `requests` (1703) returns `[]` for a resting pet, so no "lay_egg" request (decided: wake it first). `lay_egg` builds a fresh `PetState.new`, so `resting` is not copied; but it carries `unknown` over (model.py:1969), so see the downgrade rule in §7 | model |
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
| **Assist and mood** | `resting` is a **flag** on `mood_keyed`, never a mood (a mood would hide "hungry" and "sick"), so `MOOD_WORDS` does not change and `intent.py` reads the flags (§4.5). Under privacy, an away pet reports only `["asleep"]` (coordinator.py:439-441) and drops `resting`: the card rule is *away wins, the sitter sign shows, no resting label* | `intent.py`, card |
| **Wishes** | `_daily_wish` is day-keyed and awake-gated (coordinator.py:1414-1428) with no dependence on needs [review: checked]: no change | – |
| **Upbringing** | with no samples `upbringing_score` falls back to current discipline and a wellbeing estimate from misses per day lived (model.py:1733-1742, 1824-1826); with `age_hours` held it won't read "neglected". Discipline can't be pumped: the praise window and day close on the real clock (§3.1) | – |
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
`_fire(events)`, `_save()`, `_publish()`; it returns the model's result. **Turning on an
egg is a quiet no-op on the switch** (the coordinator returns `"egg"`, the switch logs it
at debug and raises nothing), the way `_apply_lights` returns OK for an egg and remembers
it (model.py:3587-3588): a holiday automation that turns on every pet's switch must not
error for a household with an egg [S8]. The ws (§4.2) returns the refusal to the card.
Turning **off** works for any pet, an egg included (§7). Add to `async_setup_entry`, to
`strings.json` entity names (next to `lights_out`, strings.json:306), and `icons.json`
(next to 114; icon draft `mdi:sofa`). It is a normal entity: not a diagnostic, not
hidden, and exposable to Assist by the owner as any switch.

### 4.2 Websocket for the card

`virtual_pet/rest {entity_id, enabled}` in `__init__.py`, next to `my_day`
(`__init__.py:765-784`). Any logged-in user may set it (the pet is the household's).
The switch entity covers HA's own permissions. Like the shell (settings-gear §3), the
card shows it **read-only on a shared screen** (decided). On an egg the ws answers
`"egg"` for on and accepts off.

### 4.3 Settings row

In `_renderSettings` (card-status.js:187), a "resting" row with a switch, for the shown
pet, and a helper line. Hidden for an egg. Draft copy:

- Row: "resting". A shared screen (the per-browser `SHARED_KEY` flag, prefs.js) shows the
  row's state with no switch.
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

- `intent.py`: `MOOD_WORDS` is keyed by the **mood** (`MOOD_WORDS[mood]`, intent.py:259)
  and `resting` is a flag, never a mood, so an entry `MOOD_WORDS["resting"]` would be dead
  [S1]. The status handler already gets `flags` from `current_mood()`; when `"resting"` is
  in `flags` **and the mood is `content`** (or `cozy`, `bored`), the spoken word is "is
  taking it easy"; for any other mood (sick, hungry, calling, dirty, asleep, away) the
  mood's own word is spoken, then "and resting" is added after it. A resting pet that is
  asked to be fed or played with is not refused. No new intent: the switch is exposable
  and "turn on Pip resting" works through HA's own intents.
- Bus events `virtual_pet_rest_started` and `virtual_pet_rest_ended`, fired by `_fire`
  (coordinator.py:1158), carrying only `pet_id`, like `went_away` and `came_home`. No
  user, no reason. Documented in the guide's events list (guide.md:1015) and
  features.md:215. `rest_started` also joins `CALL_OVER_EVENTS` (§3.4).
- **The card learns events only through `MOMENTS`** (coordinator.py:126-168) and the
  private channel, so `rest_ended` (and `rest_started`, for the quiet "settling" line)
  must be added to `MOMENTS` **and** a `case` added in `card-moment.js` `_react`; without
  both the leave lines (§4.6) can never show [S2]. Neither goes in `MOMENT_BARE`:
  they carry nothing to hide.
- `sensor.mood` flags include `resting`; the sensor that reports "away" as "asleep"
  under privacy does not do so for resting. Away + resting: the flags carry both, and
  under privacy `current_mood_keyed` returns `["asleep"]` and drops `resting`
  (coordinator.py:439-441); that is fine. The card rule is: away wins, the sitter sign
  shows, the resting label does not.

### 4.6 Draft lines

Pet, idle while resting (each ≤ 40 characters, scan-safe): "just pottering about ♪" ·
"comfy here! ☁" · "having a lazy day, hehe" · "this is a good spot ♪". On a visit: the
usual hello, and now and then "oh! hi ♥ i was just daydreaming". Leaving rest: "good
stretch! i'm back ♪" · "that was a nice rest!". Status-page label: "resting" (alts:
"taking it easy", "a lazy day"). A baby-talk variant of each goes in `BABY`
(lines.js:91) per the existing rule; `RESTING_IDLE` and the leave lines go in
`COPY_TABLES` (scripts/copy-scan.js) so the scan covers them.

## 5. Favourite

**Name in code: `open_on`** [S12]. "favourite" already means the person's favourite game
(`bond.favourite`, model.py:3439-3456; `mine.bond.favourite`, coordinator.py:2568), the
pet's favourite snack (`state.favourites`, `favourite_said`) and the favourite visitor
(`fav_visitor`), and player lines already say "you're my favourite" (lines-fresh.js:186)
and "our favourite game!" (card-moment.js:310). So every new key, ws command, cache key
and snapshot field uses **`open_on`** (person key, `house.open_on`, `virtual_pet/open_on`,
`mine.open_on`, `house_open_on`, `hatch-open-${user}`, `async_set_open_on`). This plan,
the guide and features.md still call the feature "the favourite" in prose.

### 5.1 Who owns it, and what it is

Per person. HA knows who sits at each screen (`hass.user`, card-base.js:232) and the
people store exists for exactly this kind of per-person, cross-pet fact (people.py:1-12).
One pet per person: picking another moves it. There is no ranking word for it in the UI
(decided): a heart on the head dot and a toggle.

### 5.2 Storage

- **Person:** `people[user]["open_on"] = <pet_id>` (the pet's config-entry id,
  coordinator.py:243). Add `"open_on": lambda v: isinstance(v, str)` to `_PERSON_KEYS`
  (people.py:472-). A stale id (the pet was removed) is **ignored on read** (that is the
  guarantee) and cleared on the next write; `async_remove_entry` (`__init__.py:1003`)
  also clears it from every person and the house default, as a best effort: it is a
  module function and `hass.data[DOMAIN]` may be gone or the entry never loaded, so it
  must not raise, and a test removes an entry that was never loaded.
- **House default:** `data["house"]["open_on"] = <pet_id>`. `People.async_load`
  rebuilds `data` from only `people` and `weather` (people.py:196-209), so it must read
  and keep `house` (a dict with an optional `open_on` str, dropped quietly if the
  shape is wrong, as the other keys are).
- **Forget my data** (`People.forget`, people.py:247-258) pops the whole record, so the
  person's `open_on` goes with it; only `birthday_skipped` is kept. The card's forget
  handler (card-status.js:455-470) adds `open_on` to its `_setMine` key list and
  removes the local cache key (§5.3). The **house default is no person's** and
  "Forget my data" does not touch it.
- It never goes on a state attribute or the bus, never in diagnostics (people.py:11-12).

### 5.3 How the card gets it and what it does

- Private: each pet's `mine` object (coordinator.py:1744 and 2574, where `my_day` and
  `baby_talk` ride) gains `open_on: bool` ("this pet is mine to open on"). Shared screens
  get `mine = null` (card-base.js:304, 321), so a shared screen never learns anyone's
  choice (coordinator.py:2625 principle).
- House default: the shared screen's snapshot gains `house_open_on: bool` for that
  pet, sent only on a `shared` subscription (`channel` watchers carry `shared`,
  channel.py:19). It is the household's, and says nothing about a person.
- **Opens the card on it.** The rule is *per card instance* ("the session" is one page
  load of the card, the `_shelfRestored` flag at card-build.js:566): at the first draw
  the person's choice **beats** the saved shelf position (`shelfRead`, world.js:464),
  which includes the "pet on show before a reload" restore (UX fix 2, F8). That is the
  point of "opens on": every fresh load opens on it. After that swiping works as today and
  `shelfWrite` (card-build.js:896) keeps the position **until the next load**.
  The snapshots arrive after the build, so the card caches the device id in
  `localStorage` as `hatch-open-${user}` (the way `hatch-welcomed-${user}` does,
  card-status.js:468) and the next load opens on it at once. **Every snapshot refreshes
  the cache**: the pet reporting `mine.open_on` writes its device id, and the key is
  removed when no pet reports it, so a change made on another device is picked up on the
  next snapshot and the stale key does not last. The very first time (no cache) the card
  opens as today, and moves only if the snapshot arrives inside the first 1.5 s and the
  person hasn't swiped. No choice: today's behaviour.
- **Shared screen** (the per-browser `SHARED_KEY` flag, prefs.js:327-338): it opens on
  the household default if there is one, otherwise today's shelf position. It has no
  person, so it caches the default's device id under `hatch-open-house` on that browser,
  refreshed by every snapshot's `house_open_on` and removed when none reports it, so it
  doesn't jump on every reload [S11]. It **never shows a heart** (decided: a mark anyone
  can see would rank) and shows a pet's resting state read-only.
- **Heart:** on the head dot (card-layout.js:312-327), a small ♥ on the person's
  choice, personal screens only, and only when there are 2+ pets.
- **Toggle:** in the settings sheet for the shown pet, shown only with 2+ pets: "♥ open
  on {name}". On sets it (and moves it from the old pet); off clears it. **Admins** on a
  personal screen get a second row: "shared screens open on {name}", the household
  default (decided: only admins set it).
- **Phone voice.** Only two phone messages come from "the pet that speaks for a person":
  the **birthday** (coordinator.py:2268-2279, inline, with an extra filter: not away and
  not an egg) and the **send-off** (`_send_off`, coordinator.py:1601, through
  `_closest_pet`, 1587-1599). Morning and holiday messages are per pet
  (`_holiday_morning`, `good_morning` through `_notify`), do not use `_closest_pet`, and
  **do not change** [S3]. R2 folds the two selections into one helper
  `_voice_pet(user, eligible=...)` with one rule: **the person's choice is a preference
  among pets that pass the gate, never a replacement for it.** If it is a loaded pet that
  notifies this person and is `eligible` (for both messages: not away, not an egg), it
  speaks; otherwise the selection is **exactly today's** for that message. In particular
  `_send_off` checks `level < R.SENDOFF_LEVEL` on the pet it gets: a favourite whose bond
  is under the level must not make the person lose their send-offs. The helper therefore
  takes the level check as part of `eligible` for the send-off, and falls back to the
  closest bond. With no choice set, both messages are byte-for-byte today's.

### 5.4 Server API

`virtual_pet/open_on {entity_id, enabled, scope}` in `__init__.py`; `scope` is `"me"`
(any logged-in user) or `"house"` (**admin only**, refused otherwise with the usual
`unauthorized`). Handler `coordinator.async_set_open_on(user, enabled)` follows
`async_set_my_day` (coordinator.py:2232-2243): set or pop the key under the person's
lock (people.py:176), save (at once on an off), and `async_set_updated_data` on **every**
pet, because the previous choice's `mine` changed too.

## 6. The offer

After a person turns their favourite (`open_on`) **on** with 2+ pets that are not eggs, the settings
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

**Who sees it** [S10]. "rest them" freezes pets that other people may open on or hear
from. Nothing is sent to them and rest events don't notify (§4.5), so a phone-only
person simply stops getting calls from those pets and sees the "resting ☁" label only
when they open the card. The only signals are that label, the helper text ("for everyone
at home") and the guide. Whether anyone else should be told is an open question for the
owner (Open questions); until it is answered, none is sent.

## 7. Save impact

- **Pet save:** `resting: bool = False` and `rest_since: float | None = None` on
  `PetState`; add `"resting"` to the bool list in `from_dict` (model.py:687) and
  `rest_since` to the optional-float handling. A missing key is False and None. **No
  migration and no version bump** (`PetStore` has none, coordinator.py:215-226;
  `STORE_MINOR_VERSION` 1, const.py:17). `lay_egg` doesn't copy them. **`to_dict` is
  `asdict(self)` (model.py:659), so every pet save gets `resting: false` and
  `rest_since: null` after upgrade** [S9]: harmless, but "byte-identical" below means
  *identical except those two keys*, and the recorded-run test strips them before it
  compares. With no pet resting, no favourite and no house key, behaviour is today's.
- **A resting egg can't exist, and a downgrade must not make one** [B3]. An older build
  has no `can_lay_egg` gate, so a resting adult can lay there, and `lay_egg` carries
  `unknown` over (model.py:1969), so the egg inherits `resting: true`. On upgrading again
  `from_dict` would load an egg that never hatches, with the settings row hidden for
  eggs. So: **`from_dict` (or load) normalises `resting` to False and `rest_since` to
  None for an egg**; **the switch and the ws accept "off" for any pet, an egg included**
  (§4.1, §4.2), so an egg that slips through can always be woken. A bug in the
  normalisation is then a wake button away, not a stuck pet.
- **Downgrade of the pet save:** an older version keeps `resting` as an unknown key
  (`from_dict` keeps them, model.py:669-675) and runs normal decay from the held values,
  which are ≥ 55 except health. A sick resting pet resumes its health drain, and a pet
  that was resting for weeks simply ages again. Nothing dies (`HEALTH_FLOOR` = 1.0,
  rates.py:41) and nothing freezes. On upgrading again the key is read back and the pet is
  resting again (not re-settled; harmless).
- **People store:** per-person `open_on` and `rest_offer` ride in the person record; an
  older version keeps person keys it doesn't know ("keys this version doesn't know are
  kept as they are", people.py:466-469), so they survive a round trip. The **house
  default** is a new top-level key that an older `async_load` rebuilds away
  (people.py:196): harmless, but the household default is lost on a downgrade-upgrade
  cycle and must be set again. The people store keeps its version.
- **Privacy:** the favourite is per-person: private channel only, not in diagnostics,
  erased by "forget my data". Resting is pet state: a normal entity.

## 8. Tests, one per rule

Pytest unless noted. Names are suggestions; `tests/test_resting.py` and
`tests/test_open_on.py` are new.

**R1, resting (`tests/test_resting.py`, plus edits to `test_assist.py`, `test_notify.py`,
`test_init.py`):**

1. Default: a fresh pet and a loaded save without the key are not resting; a household
   advanced a day with no resting pet gives the same state as `origin/main` **except the
   `resting` and `rest_since` keys** [S9] (a recorded run in `test_recorded.py`, keys
   stripped before the compare).
2. Entry floors hunger, happiness and energy to 55 and leaves health unchanged (a sick
   pet at health 30 stays 30).
3. A day of `advance` while resting with **no visit**: needs, health, weight, discipline,
   poops, `age_hours`, `care_misses`, `recent_misses`, `discipline_samples`, `trait_hours`
   unchanged; `treats_waiting` still banked; no events but sleep and wake.
4. No hunger, happiness, energy or fake call is ever started over 7 days across many
   seeds (a `sick` or `dirty` call may, see 5).
5. Entering with an open call (real, fake, recall) clears `call`; the latches stay. Leaving
   gives **no hunger, happiness or energy call**; a sick pet and a pet with a poop already
   30 minutes old **do call at once** on the first `_calls` after leaving [B2].
6. A sick pet may rest: stays sick, health holds, medicine cures it, health then regens
   only after leaving rest.
7. **Care works and its stamps run on the real clock** [B1]: praise a resting pet at t,
   t+1 h and t+25 h: the first pays 8+4+2, the second pays 0 inside the window, the third
   pays again (window and day rolled). `last_excite` expires (the pet stops being
   `excited` after `EXCITED_MINUTES`). A pet woken by hand at night can be put back to
   bed by the house after `kept_up_until`. A game started during rest is dropped after
   `GAME_IDLE_MINUTES`. `chore_treats` reopens after 24 h. The bond grows within
   `BOND_DAILY_LIMIT`.
8. Aging: `life_stage` doesn't change over a simulated month; `can_lay_egg` is False
   and `requests` has no `lay_egg`; the new egg from `lay_egg` isn't resting. The pet
   birthday is not offered while resting; leaving moves `hatched_on` forward by the whole
   days rested [S4].
9. An egg refuses (`"egg"`) by model and by ws; the **switch is a quiet no-op** and raises
   nothing [S8]; "off" is accepted for an egg.
10. Sleep: lights-out works; a resting pet falls asleep at bedtime, wakes at the morning,
    regens energy asleep; a daytime nap ends at 95; a pet can't collapse.
11. Precedence: away + resting: away wins, everything refused; coming home resumes
    resting; resting set while away; resting cleared while away.
12. Time: a restart and a long gap (`catch_up`, `max_gap`) while resting hold timers and
    change nothing else; leaving rest with a poop pending lets it fall due after the
    remaining time only.
13. Finds roll while resting; the daily visit is picked and greeted.
14. Bus: `rest_started` and `rest_ended` fire once each with only `pet_id`; neither
    notifies; `rest_started` clears a posted call push (`CALL_OVER_EVENTS`) and the pet
    is out of the recall bundle; both are in `MOMENTS`.
15. Switch entity: on/off, state restore from the pet, translation keys exist; privacy
    test: `resting` is on the mood flags but the `away` masking is unchanged.
16. Assist: a resting content pet says "taking it easy"; a resting sick or hungry pet
    keeps its own word and adds "resting"; feed/play aren't refused [S1].
17. **Downgrade** [B3]: a save with `resting: true` loads in a build that doesn't know the
    key (simulated by `from_dict` with the key dropped from `fields`) and round-trips it;
    **downgrade, lay, upgrade**: an egg carrying `resting: true` loads with `resting`
    False; and "off" wakes any pet.
18. Care that spends (play ×N, medicine, unfair scold, feeding) then leaving: a pet below
    a threshold may call at once; feeding leaves `digesting` entries that become poops in
    turn after leaving [S6].
19. JS (`tests/js/resting_lines.test.js`): `RESTING_IDLE` passes the copy scan; every
    line has a `BABY` variant; the label shows for flag `resting`, not for `away`, and
    the sitter sign is not shown; `_react` has a case for `rest_ended`; on a shared
    screen the row is read-only.

**R2, favourite (`tests/test_open_on.py`, plus `test_people.py`, `test_forget.py`,
`test_channel.py`):**

20. Set, move and clear; one pet per person; a second person's is independent.
21. `mine.open_on` is true only for that person's pet; **never** on a shared
    subscription; `house_open_on` only there.
22. `virtual_pet/open_on` scope `house` refused for a non-admin.
23. "Forget my data" removes the person's `open_on` and its cache key (JS), and leaves
    the house default.
24. `async_remove_entry` of the chosen pet clears person and house references; a
    stale id on load is ignored; removing an entry that was **never loaded** (no
    `hass.data[DOMAIN]`) doesn't raise.
25. `People.async_load` keeps `house`; a damaged `house` shape is dropped quietly, other
    keys intact.
26. `_voice_pet`: a chosen pet that notifies the person and is eligible speaks; one that
    doesn't notify them is ignored; **a chosen pet whose bond is under `SENDOFF_LEVEL`
    doesn't cost the person their send-off** (the closest eligible speaks); a chosen
    pet that is away or an egg is skipped for both messages; none set gives today's
    selection exactly, away/egg filter and all [S3]. The morning and holiday messages are
    unchanged.
27. Nothing in a state attribute, the bus event or diagnostics contains `open_on`
    (extend the existing privacy sweep in `test_public.py`).
28. JS: with a cached choice the card opens on its device **even if the shelf holds
    another** (the choice beats the reload restore); with none, on `shelfRead`; a swipe
    is kept until the next load; each snapshot refreshes the cache and removes it when no
    pet reports `mine.open_on`; a shared screen opens on the house default (cached under
    `hatch-open-house`), or the shelf; no heart on a shared screen; no toggle for one
    pet.

**R3, the offer (`test_people.py`, JS):**

29. Shown once after a choice is set with 2+ non-egg pets; not shown on a shared
    screen, with one pet, or after either button; "rest them" flips exactly the others
    that are not eggs and not resting, and touches no `open_on`; "not now" flips nothing.
30. `rest_offer` is erased by forget and survives a restart.

## 9. Ships, acceptance criteria, device queue

Gates as AGENTS.md: ship workers run `scripts/gate --auto`; the full gate is the first
mate's once per merged batch. R1 and R2 touch server code, so `pick-sections` is likely
to pick `all` and `scripts/ci-gate` is the route. Bench presets to **add** (neither
exists today): `resting` (label, pose, settings row, sheet at 420/330/300, day/night,
mono, big text, baby, shared screen read-only) and, for R2/R3, `open_on` (dots with a
heart, the toggle, the house row, the offer row). The bench pins them through the fake
`hass`; no real HA is needed for looks. Each criterion below is a test number or a named
command; a device item is a look, never a gate.

### R1, Resting (tier 2)

Acceptance:

- With nothing switched, a recorded week matches `origin/main` **except the `resting` and
  `rest_since` keys** (test 1).
- Tests 2-19 pass. Switching on in HA, the card or Assist works; switching off leaves no
  debt (tests 5, 12).
- The card shows "resting ☁" and the idle pose and never the sitter sign (test 19);
  the settings row and helper read as in §4.3, read-only on a shared screen.
- Guide: a "Resting" section (the options chapter and the multi-pet part), the events
  list, the Assist words; features.md rows; `docs/` mention that aging pauses.
- No pet line fails the copy scan (`scripts/copy-scan.js`); every new line has a baby
  variant.
- The card-check sections come from `scripts/pick-sections` for the build's diff; the
  build worker runs `node scripts/card-check.js --list` first and names the settings
  section in the ship's report (this plan can't: `playwright` isn't installed in the
  planning worktree). Bench preset `resting` is added, rendered and read.

Device queue (the owner, on real screens; none is a gate):

1. Phone (HA companion): with a call showing on the lock screen, switch that pet to
   resting from its settings; the call disappears (the push clearing is test 14).
2. A day later: the resting pet has not called (a sick or dirty pet still does, test 5),
   hasn't grown, and still says its idle lines; feeding it and playing with it works.
3. Wall tablet (shared screen): the resting state shows, the switch is read-only.
4. HA automation: flip the switch on leaving for a holiday and off on return; an egg in
   the house causes no error.
5. Turn it off: the pet says its leave line (needs `rest_ended` in `MOMENTS` and the
   `_react` case, test 19) and does not call about hunger, happiness or energy for hours.

Audit (s2739, tier 2): **1 player-impact / 8 nits.** The player-impact one, R1-1 (a rest
on/off/on refilled the needs every time), is fixed by the refill cooldown (§3.3, commit
`cb273822`).

### R2, Favourite (tier 2, people-store data)

Acceptance:

- Tests 20-28 pass; the privacy sweep (27) proves it is on no attribute, bus event or
  diagnostic.
- On a personal screen with a choice, the card opens on it (after the first visit via
  the cache); with none it opens as today. A heart sits on that pet's dot for that
  person only.
- Admins can set a house default; a shared screen opens on it; no heart is shown there.
- "Forget my data" clears the choice, the cache key and the heart.
- The **birthday and the send-off** come from the chosen pet when it is eligible (test
  26). Morning and holiday messages are unchanged.
- Guide: favourite described without a ranking word; features.md.

Device queue:

1. Two people on two phones pick different pets: each opens on their own pet, and
   neither sees the other's heart.
2. Wall tablet: opens on the house default (set by an admin), no heart, no toggle, and
   it opens there again after a reload.
3. Pick a favourite, restart HA, reload the phone: it still opens there.
4. "Forget my data": the heart and the opening pet reset.
5. The next birthday or rain-morning send-off arrives on the phone from the chosen pet.

### R3, The offer (tier 2, small)

Acceptance: tests 29-30; the offer reads as §6; it appears once per person.

Device queue: pick a favourite on a phone with three pets, see the offer, tap "rest
them": the two others rest and the favourite doesn't; pick another favourite later: no
second offer.

## 10. Checked, and what is still to read

Re-read against the code at `9cdc5824` (and `60ebf751` for the first draft), holding:
model.py 584, 687, 945-1026, 1041-1083, 1243-1295, 1320, 1353-1361, 1395, 1677, 1703,
1926, 2105-2114, 2607, 2870; coordinator.py 243, 914-927, 1158, 1587-1599, 2232-2243,
2253-2285, 3021; switch.py:24; people.py 176, 196-209, 247, 472; card-build.js 566 and
896; card-layout.js 312-327 and 538-541; card-base.js 232; card-status.js 187 and
455-470; world.js 464-477; notify.py 141-148; rates.py 22, 32, 41, 137-141, 389. The
scout's card claims cite the old single file's names, now `src/card/` parts (the AGENTS.md
table); `_closest_pet` is at coordinator.py:1587 and the inline repeat is the birthday at
2268-2279.

Checked by the review (s2724) and now settled in the plan: the wishes (day-keyed,
awake-gated: no change), the upbringing fallback (§3.4), the re-call bundle and push
clearing (`CALL_OVER_EVENTS` is enough), the blueprint (no change), the infrared link
gates (away, asleep, egg: no change), finds (`next_find_at` is not in `shift_times`, so
the find clock runs on the wall clock, as decided).

Still to read in the build:

- `sensor.py` age and hatch-ETA sensors for a resting pet (they hold; confirm).
- How `parked` games and `opening_at` are used in `_step`, so each gets the same
  real-clock treatment as `game` (§3.2).
- The card's start slide on a shared versus a personal screen beyond the shelf path
  (card-base.js:120-160 not read in full): R2 reads it first.
- Whether `advance` sets `last_updated` itself (§3.2: no double shift).

## Open questions: decided (first mate, 2026-11-02)

The five first-draft questions are decided in §1. The three the review left are decided
with the recommendation:

1. **Refill cooldown [S7]:** none. Feeding and playing are already free and unlimited, and
   entry cannot hide a miss already counted or heal a sickness.
   **Superseded** by the owner, 2026-11-02 (R1-1, audit s2739): once per 12 h, see §3.3.
2. **Pet birthday while resting [S4]:** none while resting; on leaving, `hatched_on` moves
   forward by the days rested (§3.3).
3. **Telling others [S10]:** no push. The card label, the offer's helper line and the guide
   are the signal.

## Adversarial review checklist

For the reviewer (tier 2: at least one pass before each ship merges). The first pass
(s2724) found the blockers now folded in §3 and §7; a second pass checks the folds.

**Behaviour changes on upgrade**
- [ ] With no pet resting, no favourite and no house key, a recorded week and a full
      pytest run are identical to `origin/main` **except the `resting` and `rest_since`
      keys** on every pet save. Check `_step`, `advance`, `requests`, `can_lay_egg`,
      `_voice_pet` all keep the default path.
- [ ] No new person or house key is written until something is chosen. (Pet saves gain
      the two new keys; that is expected, §7.)

**The freeze**
- [ ] `_rest_step` really skips every aging path. Grep `age_hours`, `trait_hours`,
      `discipline_samples`, `last_sample_at`, `counted_misses`, `recent_misses` for a
      write outside `_step`.
- [ ] `_rest_step` does **not** call `shift_times`; only `_hold_times` (§3.2) holds the
      listed fields, and a care stamp is on the real clock (test 7).
- [ ] Anything on the coordinator's own clock that bypasses `advance` (finds, the daily
      visit, treats, house moments, `next_news`, `next_react`) is intended to run.
- [ ] `fast_forward` and `catch_up` with a resting pet: no stage change, no calls.
- [ ] A pet resting at a stage boundary, an egg laid while resting (older build), a
      hatching on the same tick as rest begins: none can leave a resting egg (§7).
- [ ] `advance` sets `last_updated` once; `_hold_times` doesn't move it.
- [ ] A napping pet that rests: the nap ends; a pet asleep at night still wakes at the
      morning; the lights-out switch while resting isn't refused.
- [ ] A pet that rests while asleep with a paused call: the call is cleared on entry.

**Care and exploits**
- [ ] The free refill (Open question 1): rest-and-wake cannot hide a miss already counted
      (they stay) or an open sickness (it doesn't heal it); it can settle an open call,
      which feeding does too.
- [ ] Feeding a resting pet repeatedly can't make it heavy then sick on waking (`full`
      refuses; weight has no burn while resting). Check `weight` after a day of feeding
      and the first tick after leaving rest.
- [ ] Bond growth while resting is still capped by `BOND_DAILY_LIMIT`.

**Notifications**
- [ ] A call push posted before rest is cleared from every phone; the recall bundle
      doesn't name a resting pet; no re-call fires after waking within `RECALL_HOURS`.
- [ ] No resting-related message to a phone says or implies neglect or an absence.

**Privacy**
- [ ] The choice (`open_on`) is on no state attribute, bus event, diagnostics, log line
      or `issue` text; on no shared-screen snapshot; the per-person lock is taken for
      writes.
- [ ] `house_open_on` leaks nothing a person chose; it is admin-set, household-level.
- [ ] `resting` on the mood isn't a presence signal (the sitter's `away` is, and keeps
      its masking).
- [ ] The cache key `hatch-open-${user}` is removed by forget and never holds another
      user's value on a shared browser (keyed by user id); `hatch-open-house` is read
      only on a shared screen.
- [ ] `rest_offer` leaks nothing and forget handles it.

**Save and downgrade**
- [ ] `from_dict` type-checks `resting`; a string or int `resting` is False; an egg's
      `resting` is False (test 17).
- [ ] A save written by R1, loaded by `origin/main`, then by R1 again: no data lost, no
      crash, `resting` back on, and "downgrade, lay, upgrade" leaves no resting egg.
- [ ] People store: person `open_on` of the wrong type is dropped; `house` of the wrong
      type is dropped; a downgrade keeps person keys and loses `house` (documented).
- [ ] `async_remove_entry` leaves no dangling id (and a stale id is ignored on read); a
      removed and re-added pet isn't chosen again (new entry id).

**Card**
- [ ] The label never reads as the sitter's sign; the settings row is read-only on a
      shared screen; baby talk, mono, big text and 300 px width fit.
- [ ] The card never jumps pets after the user has swiped; the 1.5 s window and the
      cache hold; a two-card page behaves; a fresh load opens on the choice, not the
      pre-reload pet.
- [ ] Every new pet line passes `copy-scan` and has a baby variant.
- [ ] No ranking word in a **new** player string ("favourite", "best", "main", "top").
      Existing lines that say "my favourite" or "our favourite game" are not this
      feature's and stay. The guide uses "favourite" only as the feature's description,
      not the UI's label.
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
