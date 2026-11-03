# Favourite pet and the resting switch, 2026-11-02 (build plan)

**Status: PLAN, docs only (s2720).** Written from the scout report s2717 (design scout,
nothing built) and the owner/FM decisions of 2026-11-02 (§1). Every `file:line` in the
scout was re-read against `origin/main` at `60ebf751`; they held (the card ones moved
with the card split: `src/card/<part>.js`, see §10 for the few the scout got loosely).
Line numbers are from `60ebf751`; names win over numbers. **Revised (s2725)** after the
adversarial review s2724, every finding checked against the code at `9cdc5824` (the
review's tags B1-B3, S1-S14 appear in brackets where a rule came from one). **R3 folded
(s2788)** from review s2787, checked against `ce4f3c8a` (§6, tests 29-31, §9 R3, and the
list at the end of the file). Every player line and label
is **DRAFT** until the first mate approves it (decisions 2026-10-28, "How the crew
works"); the offer's copy (§6.1) is approved. Build ships are **tier 2** (model/decay behaviour, people-store data).

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
| R3 | The offer: "let the others rest?" after a favourite is picked | S | 2 | `people.py` (one key), `coordinator.py` (`async_set_rest_offer`, `_mine`), `__init__.py` (one ws command), card (`card-status`, `card-sheets`, `ui-copy`), guide, features (full list: §6.6) |

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

- **Owner (2026-11-02, R1-1 from audit s2739):** the entry refill (decision 5 above) comes
  **at most once per 12 h** (`last_rest_refill_at`, §3.3). A rest inside the window only
  pauses: no refill, an open call and the misses held. Every copy about resting (§4.3's
  helper, §6's offer) must promise no refill, no "content" and no "no calls".

- **FM (2026-11-03, review s2787; the offer, §6):**
  1. **Leaving the sheet without a button is not an answer.** Only "rest them" and "not
     now" mark the person (`rest_offer`); leaving clears the card's in-memory offer (Q1).
  2. **The edge is person-level**: the offer comes when no pet was marked before the call.
     Moving the favourite from one pet to another never offers (Q2).
  3. **"The others" are this card's slides**, not the household's; a card limited to some
     pets rests only those (Q3).
  4. **Answered if at least one rest call succeeded.** Any failure shows
     `SETTINGS_AGAIN.failed`; no retry (Q4).
  5. **Not shown and not marked when no other pet can rest**, so the offer appears at a
     later first pick, e.g. once a new pet has hatched (Q5).
  6. **After "rest them" the row just goes**; no new line (Q6).
  7. **The helper is aligned with the live `REST_HELP`**: "Resting pets won't get any
     hungrier, and don't grow up until they're back. Visit any time." (Q7). The row title
     "Let the others rest?", "rest them", "not now" and the helper are approved; the
     `aria-label`s are `spoken()` of the same text.

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
- Helper (FM copy, 2026-11-02, audit s2748): "{name} won't get any hungrier, and doesn't
  grow up until it's back. Visit any time." It promises no refill: inside the 12 h
  window (§3.3) a rest only pauses, so "content" and "no calls" would be untrue.
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
  point of "opens on". **Decided (FM, 2026-11-02, audit s2748 player-impact 2):** HA
  re-creates the card on a view or panel switch, not only on a page load, and a player who
  swiped to another pet would come back on the favourite. So the choice decides the opening
  pet **only when no swipe was written in this browser session**: `_go` sets a
  `sessionStorage` flag (`hatch-shelf-<first device>-swiped`) on a player's swipe, arrow or
  dot (not on the late move below), and while it is set the shelf restore wins. A new
  session (the tab or browser closed) opens on the choice again. `shelfWrite`
  (card-build.js:896) keeps the position as before.
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
  choice, personal screens only, and only when there are 2+ pets. **Spoken** (FM copy,
  audit s2748 nit 4): that dot's `aria-label` is "Show {name}, your card opens here"; the
  others stay "Show {name}". The settings rows' `aria-label` is `spoken()` of the copy with
  the pet's name put in afterwards, so a `~`, `*` or emoji in a name is read as it is.
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

**Folded (s2788)** from review s2787 on the FM's answers of 2026-11-03 (§1). Names win over
line numbers; every code name below was checked on `origin/main` at `ce4f3c8a`.

After a person turns their favourite (`open_on`) **on** for the first time and there is at
least one other pet on the card that can rest, the settings sheet shows one inline row
under the toggle (no modal, nothing blocks).

### 6.1 The row and its copy

All **FM approved 2026-11-03** (review s2787 Q7 and the brief):

- Row title: "Let the others rest?". Buttons: "rest them" and "not now".
- Helper: "Resting pets won't get any hungrier, and don't grow up until they're back. Visit any
  time." It is `REST_HELP` (ui-copy.js) in the plural, so it keeps R2's audit fix and
  promises no refill, no "content" and no "no calls" (§1, owner R1-1). The row title, the
  buttons and the helper are the whole of the new copy, except as below.
- `aria-label`s are `spoken()` of the same text (§5.3): the row's is the title and the helper,
  each button's is its label. There is no pet name in any of them, so the stand-in trick of
  the open-on rows is not needed.
- **Pending:** while the calls run, both buttons carry the `pending` class (as `_setResting`
  does) and ignore taps.
- **After "rest them":** no new line. The row just goes. The pets' "resting ☁" labels (§4.4)
  and each sheet's resting row are the confirmation.
- **Failure:** `SETTINGS_AGAIN.failed` ("hm, that didn't work. try again soon") through
  `_statusMessage`, on any failed call. No retry button: each pet's own sheet has its resting
  row.
- **Placement:** directly under the `openon` row in the sheet's "for {pet}" section, never
  under the `openhouse` row. It sits in the sheet of the pet that was just picked.
- **Not scanned:** `scripts/copy-scan.js` (`COPY_TABLES`) covers the pet's lines only, not
  settings strings, so nothing scans these. The worker checks by eye that no line promises a
  refill, "content" or "no calls", and uses no ranking word (checklist, Card). "The others" is
  owner-drafted (§1) and stays.
- **Guide / features.md** (**FM approved 2026-11-03**; it promises only what §6.2-6.4 build
  and what R1 does): "The first time you pick which pet your card opens on, and you have other
  pets that can rest, the settings sheet asks whether to rest them. \"rest them\" switches
  resting on for the other pets on that card; \"not now\" leaves them as they are. It asks
  until you answer, then not again (\"Forget my data\" starts it fresh). Resting pets won't
  get any hungrier and don't grow up until they're back, and anyone can wake one from its own
  settings." One line in the guide's resting section, one in features.md.

### 6.2 State on the card, and when the row shows

The offer is **card-instance state**: `this._restOffer = {device}` (the picked slide's
`s.ids.device`). It is not saved and not in the channel. `mine.rest_offer` says only "already
answered"; it never says "show now". The settings render reads both: the row shows while

1. `this._restOffer` is set and its `device` is the shown slide's, and
2. `s.mine.rest_offer === false` (a boolean: an older server sends none, so no offer, as the
   resting row skips an older server), and
3. not `sharedScreen()`, and the scope was `me`, and
4. **the others can rest** (one rule, replacing "2+ pets that are not eggs"): among the
   card's slides other than `s` that have `ids` and are not `empty`, at least one has
   `sensor.life_stage` **known** (not `unavailable`/`unknown`, which would only draw an `egg`
   or `no_pet` error) and not `egg`, and `switch.resting` not `on`. The favourite itself may
   be an egg or resting. The toggle's own gate (`several`, card-status.js) counts eggs and is
   left as it is.

**"The others" are this card's slides** (`_devices()` honours `config.devices`): a card
limited to two of three pets rests only those two. A hidden third pet is not rested. The
helper is true of the pets it names. (FM, review s2787 Q3.)

**It clears** (set to `null`): a button; the sheet's back or close; a swipe to another pet;
turning the toggle off; forget; and a render that finds rule 2 or 4 false (a push made the
others eggs or resting, or `mine.rest_offer` true from another device or slide). The render
may drop it; it must not leave a stale row. Because the state is read at each render, a
channel push, which redraws the sheet (`s.statusHtml = null`, card-base.js), does not lose
the row, and `_setStatus` skips unchanged HTML.

### 6.3 The edge, and what answers it

- **The edge is per person, not per pet** (FM, review s2787 Q2). In `_setOpenOn`, on scope
  `me`, `enabled` true, with no slide having had `mine.open_on === true` before the call (the
  `before` array it already takes), `mine.rest_offer` not true, and not shared: set
  `this._restOffer` **after the call succeeds** (a failure reverts the toggle and offers
  nothing). Moving the favourite from pet A to pet B is on→on for the person, so **it never
  offers**. Never for scope `house` (branch on `scope === "me"` first, before anything else
  in the offer), never from `_openOnSync`'s late move.
- **Only the buttons answer** (Q1). Leaving the sheet without a button is not an answer: it
  clears the in-memory offer and nothing is saved, so the offer comes at the next first pick
  (turn off, then on; or a new page load and a first pick).
- **Not shown and not marked** when no other pet can rest (rule 4; Q5): it appears at a later
  first pick, when a new pet has hatched or been added.
- **"not now"** calls `virtual_pet/rest_offer` and flips nothing. It is as permanent as
  "rest them".
- **"rest them"** runs `virtual_pet/rest {entity_id, enabled: true}` for each other slide that
  passes rule 4's per-pet test (known, not an egg, not resting; a pet that is **away** is
  included: resting while away is allowed, §3.4), with `Promise.allSettled`, then
  `virtual_pet/rest_offer` for the person. It flips switches only: no favourite change, no
  server rule, no automation, and it touches no `open_on`.
- **Answered** if at least one rest call succeeded (Q4). Any rejection shows
  `SETTINGS_AGAIN.failed`. No retry. If **all** calls failed, the person is not marked and
  the row clears; they see the offer at the next first pick.
- The two methods are named and extractable by `tests/js/open_on.test.js`'s loader, which
  takes methods by name: `_offerRest` (the edge, called from `_setOpenOn`) and
  `_answerRestOffer(s, rest, button)` (the buttons). The render is a small named helper
  (`_restOfferRow`) so a JS test can run it.

The offer is the only place the favourite and resting meet. Neither reads the other.

### 6.4 The server

1. **Websocket** `virtual_pet/rest_offer {entity_id, shared}`, registered in `async_setup`
   next to `websocket_open_on`. It copies `websocket_open_on`'s guard: `vol.Required("shared"):
   bool`, refused unless `False`, error code `shared` ("fail closed", the owner's rule for
   `open_on` and `ask_again`); a missing pet is `no_pet`. It takes **no `enabled`**: it only
   sets true. Clearing is forget.
2. **`async_set_rest_offer(user)`** takes `people.lock(user)`, sets
   `people[user]["rest_offer"] = True`, **`await self.people.async_save_now()`** and then
   `_push_everywhere()`. It differs from `async_set_open_on` on purpose: that one saves with
   `people.save()` (a 60 s delay, `SAVE_DELAY`) on enable and `async_save_now()` only on a
   clear. `rest_offer` is a once-only answer, so a crash must not bring the offer back.
3. **People store:** `"rest_offer"` in `_PERSON_KEYS` with `isinstance(v, bool)` (a wrong type
   is dropped by `_clean`); not in `_FORGET_KEEPS`, so `People.forget` erases it and the offer
   can return once (a fresh start; the birthday's `memory_asked` survives, this does not).
   An older build keeps the unknown key. The people store keeps its version.
4. **Channel:** `mine.rest_offer: bool` in `_mine`, pushed to **every** pet by
   `_push_everywhere`, so a second slide's sheet does not offer again. Shared screens get
   `mine = null`, `house` never gets the key, and it is on no state attribute, bus event or
   diagnostics (people.py:1-12).
5. **Card, forget:** `"rest_offer"` goes in the forget handler's key list in `card-status.js`
   (the `_setMine(key, false)` list that has `open_on`), and the handler clears
   `this._restOffer`.
6. **No pet-save change; no `strings.json`** (no service).

**Rest N times, not once.** "rest them" is N independent `virtual_pet/rest` calls, each with
R1's own 12 h refill cooldown (§3.3). A pet rested within 12 h only pauses (no refill), and
the offer does not override that. The offer never reads `last_rest_refill_at` and must not
(§6.5 point 2).

### 6.5 Corrections kept from the R2 audit (s2748)

1. **API:** §6.4.
2. **Helper copy:** promises no refill; the card knows nothing of `last_rest_refill_at`, and
   the copy stays neutral rather than putting a boolean on `mine` or `house`.
3. **Trigger:** §6.3 (reworded: person-level; "already resting" is `switch.resting`, the same
   source as the settings row, not the mood flags).
4. **Cooldown:** §6.4's last paragraph.
5. **Forget and restart:** §6.4 points 2-3 and 5.

**Who sees it** [S10]. "rest them" freezes pets that other people may open on or hear from.
Nothing is sent to them and rest events don't notify (§4.5), so a phone-only person simply
stops getting calls from those pets and sees the "resting ☁" label only when they open the
card. The only signals are that label, the helper text and the guide. **Decided (FM,
2026-11-02, Open questions item 3):** no push, nobody else is told.

### 6.6 Touch list

`people.py` (`_PERSON_KEYS`), `coordinator.py` (`async_set_rest_offer`, `_mine` with `rest_offer` and `has_open_on`),
`__init__.py` (the ws command and its registration), `card-status.js` (the row, the handlers,
the forget key list), `card-sheets.js` (`_offerRest`, `_answerRestOffer`, the call in
`_setOpenOn`), `ui-copy.js` (the copy), the guide and features.md. Not `strings.json`.

## 7. Save impact

- **Pet save:** three new keys on `PetState` (audit s2748 nit 7): `resting: bool = False`,
  `rest_since: float | None = None` and `last_rest_refill_at: float | None = None` (§3.3,
  the refill cooldown; a missing, null or damaged value loads as `None`); add `"resting"` to the bool list in `from_dict` (model.py:687) and
  `rest_since` to the optional-float handling. A missing key is False and None. **No
  migration and no version bump** (`PetStore` has none, coordinator.py:215-226;
  `STORE_MINOR_VERSION` 1, const.py:17). `lay_egg` doesn't copy them. **`to_dict` is
  `asdict(self)` (model.py:659), so every pet save gets `resting: false` and
  `rest_since: null` and `last_rest_refill_at: null` after upgrade** [S9]: harmless, but
  "byte-identical" below means *identical except those three keys*, and the recorded-run test strips them before it
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
   `resting`, `rest_since` and `last_rest_refill_at` keys** [S9] (a recorded run in
   `test_recorded.py`, keys stripped before the compare; the audit s2748 found this
   compare is **not yet there**: `test_1_a_week_with_no_pet_resting_never_takes_the_rest_path`
   covers the default path instead, and `test_resting.py` asserts the three keys).
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
    another** (the choice beats the reload restore); with none, on `shelfRead`; **after a
    swipe in this browser session the shelf wins over the choice, and a new session opens
    on the choice again** (audit s2748); the late move is not a swipe; each snapshot refreshes the cache
    and removes it when no pet reports `mine.open_on`; a shared screen opens on the house default (cached under
    `hatch-open-house`), or the shelf; no heart on a shared screen; no toggle for one
    pet.

**R3, the offer (pytest in `tests/test_people.py` and `tests/test_open_on.py`; JS in a new
`tests/js/rest_offer.test.js`, in the style of `tests/js/open_on.test.js`, which pulls card
methods out by name):**

29. **The offer (JS).** With a fake `hass` and three slides (A the favourite, B and C):
    a. First pick (no slide had `mine.open_on`, `mine.rest_offer` false), scope `me`: after
       the call resolves, `this._restOffer` is set and the settings render of A has the row,
       with the title, the helper and both buttons, each with its `aria-label` =
       `spoken()` of the text.
    b. The row survives a redraw: a channel push for A (`statusHtml = null`) and a second
       render still show it.
    c. Not offered: scope `house`; a shared screen (`sharedScreen()`); one pet; every other
       pet an egg, resting or with `life_stage` `unavailable`/`unknown`; `mine.rest_offer`
       true on any slide; an older server (`mine.rest_offer` not a boolean); the late move of
       `_openOnSync`; **moving the favourite from A to B** (a slide had `open_on` before);
       a failed `open_on` call (the toggle reverts, no row).
    d. Gate edge cases: the favourite itself an egg or resting still offers if one other pet
       can rest; a card with `config.devices` of two pets counts only those two.
    e. The row clears on: either button, back/close, a swipe to another pet, the toggle off,
       forget, and a push that makes the rule false; and it is absent on the other pets'
       sheets and on the `openhouse` row.
    f. **"rest them"** calls `virtual_pet/rest {enabled: true}` once for each other slide
       that is known, not an egg, not resting (an **away** one included), and for no other;
       then `virtual_pet/rest_offer {entity_id, shared: false}` once; **no `open_on` call.**
       Both buttons are `pending` until all calls settle, and a second tap sends nothing.
       No text follows; the row is gone.
    g. **"not now"** sends `virtual_pet/rest_offer` and no `rest` call.
    h. **Failure:** with one of two `rest` calls rejected, `rest_offer` is still sent and
       `SETTINGS_AGAIN.failed` shows once; with both rejected, no `rest_offer` is sent, the
       message shows, the row clears, and a later first pick offers again; with
       `rest_offer` itself rejected, the message shows. There is no retry button.
    i. **Leaving is not an answer:** close the sheet without a button: no `rest_offer` call,
       and turning the toggle off and on again offers again.
30. **The server and the store (pytest).**
    a. `virtual_pet/rest_offer` with `shared: true` answers `shared` and changes nothing;
       an unknown entity answers `no_pet`; a call with `enabled` is refused by the schema.
    b. `async_set_rest_offer` sets `rest_offer` true, **saves at once** (a Store reloaded
       straight after, with no 60 s wait, still has it, as `test_open_on.py` reloads), and
       pushes `mine.rest_offer` true to **every** pet's channel (a second slide's sheet does
       not offer again).
    c. A wrong-typed `rest_offer` is dropped on load; one an older build kept is kept by
       this one; it is not in `_FORGET_KEEPS`.
    d. `forget_me` erases it (the offer can then return once; JS: the forget handler sets
       `mine.rest_offer` false and clears `this._restOffer`); it survives a restart.
    e. **Privacy** (extend the sweep in `test_public.py`): `rest_offer` is on no state
       attribute, bus event or diagnostics, no shared snapshot (`mine = null`) and not on
       `house`.
31. **Rest N times, not the model.** "rest them" is N separate `virtual_pet/rest` calls
    (JS, 29f). The 12 h refill cooldown itself is **R1's** test (§3.3; R1 test 2,
    `test_2_the_refill_comes_at_most_once_in_twelve_hours` in `tests/test_resting.py`), reused, not re-tested here: R3's own check is that the offer sends one call per
    pet and never reads or sets `last_rest_refill_at`. The offer's edge conditions are test
    29c.

**Where R3's looks are checked.** No bench preset: the offer's visibility depends on card
state after a click (`this._restOffer`), and the bench has no click steps and no `mine` flag
for it. The JS tests render the row from the card's own code (29a-e). The row's wording and
fit are read by the owner on a phone (§9 R3 device queue). The `resting` preset (R1) exists.
Card-check: no new section; `scripts/pick-sections` chooses from the diff (the forget and
settings sections drive `forget_me` and the sheet already).

## 9. Ships, acceptance criteria, device queue

Gates as AGENTS.md: ship workers run `scripts/gate --auto`; the full gate is the first
mate's once per merged batch. R1 and R2 touch server code, so `pick-sections` is likely
to pick `all` and `scripts/ci-gate` is the route. Bench presets: `resting` (R1) exists on `origin/main` (label, pose, settings row at
420/330/300, night, mono, big text, shared read-only); R2 **adds** `open_on` (dots with a
heart, the toggle, the house row; no preset exists today). The offer row is not on the
bench (§8, "Where R3's looks are checked"). The bench pins states through the fake `hass`;
no real HA is needed for looks. Each criterion below is a test number or a named
command; a device item is a look, never a gate.

### R1, Resting (tier 2)

Acceptance:

- With nothing switched, a recorded week matches `origin/main` **except the `resting`,
  `rest_since` and `last_rest_refill_at` keys** (test 1).
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

Acceptance:

- Tests 29-31 pass (29a-i the card, 30a-e the server and the store, 31 the N calls).
- The offer reads as §6.1 (approved copy, `aria-label`s, pending, failure, no line after
  "rest them"), sits under the toggle, and follows §6.2-6.4: card-instance state, the
  person-level edge, "the others" = the card's slides, answered by a button only, answered if
  one rest call succeeded, not shown and not marked when no other pet can rest.
- It appears once per person (until "Forget my data"), never on a shared screen, `house`
  or a move of the favourite.
- Saves at once (`async_save_now`); `rest_offer` is on no attribute, event, diagnostic or
  shared snapshot (30e).
- Guide (the sentence in §6.1) and features.md.
- Card-check sections from `scripts/pick-sections`; no new section.

Device queue: pick a favourite on a phone with three pets, see the offer, tap "rest
them": the two others rest and the favourite doesn't; pick another favourite later: no
second offer. Then, as a second person with an unanswered offer: pick, leave the sheet
without a button, pick again later: the offer comes again. Read the row at 420/330/300 and
in mono and big text.

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

## R2 audit (s2748, tier 2): 2 player-impact / 7 nits

Fixed by s2752 on the FM's decisions of 2026-11-02:

- Player-impact 1 (the resting helper lied inside the 12 h window): the helper is now
  "{name} won't get any hungrier, and doesn't grow up until it's back. Visit any time."
  (§4.3, §6).
- Player-impact 2 (a view switch snapped the card back to the favourite): the choice opens
  the card only when no swipe was written this browser session (§5.3).
- Nit 1: a future `last_rest_refill_at` is clamped to now when a rest is entered, so it
  holds the refill for at most 12 h (§3.3).
- Nit 4: the head dot says which pet the card opens on; the rows' `aria-label` keeps the
  pet's name characters (§5.3).
- Nit 7: three new save keys in §7, §8 test 1 and the checklist; the over-long docstring
  at `coordinator.py` `_birthday_morning` is wrapped. The recorded-run compare of §8 test 1
  is still not in `tests/test_recorded.py` (see the note there).
- The report's R3 corrections are folded into §6, tests 29-31 and §9 R3 (reworked by s2788, below).

**Known remainders, not fixed (out of scope for s2752):**

- Nit 2: a cache hit disables the late correction (`card-build.js` sets `_openedOn`;
  `card-base.js` `_openOnSync`). If the favourite was changed on another device, this
  browser opens the old pet once and the next load is right.
- Nit 3: `admin` is fixed at subscribe time (`__init__.py`, `channel.add`). A demoted admin
  keeps `mine.house_open_on` and the "shared screens open on" row until the card
  reconnects. Sets still fail (`is_admin` is checked per call).
- Nit 5: `hatch-open-<user>` stays in `localStorage` when a browser is later flagged shared.
  It is never read there.
- Nit 6: `websocket_forget_me` has no `shared` guard (`__init__.py`), unlike `open_on` and
  `ask_again`. Older than R2; the card hides the row and the call only touches the
  caller's own record.

## R3 review (s2787): 12 problems, folded by s2788

Each checked against `origin/main` at `ce4f3c8a` first; all held.

1. Where the offer lives: §6.2 (`this._restOffer`, read at each render; every clear path).
2. "Edge" for moving the favourite: §6.3 (person-level), FM Q2 in §1.
3. "2+ pets that are not eggs": §6.2 rule 4 (known life stage, not egg, not resting).
4. "The others": §6.2 (the card's slides), FM Q3 in §1.
5. Partial failure, in-flight, permanence: §6.3 (`allSettled`, answered if one call
   succeeded, `SETTINGS_AGAIN.failed`, pending), FM Q4 in §1.
6. Save timing: §6.4 point 2 (`async_save_now`, unlike `async_set_open_on`).
7. The ws command: §6.4 point 1 (`shared` guard, `no_pet`, no `enabled`, registration).
8. Stale "open question" text: §6.5 ("Who sees it", decided no push).
9. Incomplete copy: §6.1 (aria-labels, after-text, pending, failure, placement, guide
   sentence, copy-scan note), FM Q6-Q7 in §1.
10. Unbuildable acceptance: §8 "Where R3's looks are checked" and §9 (no bench preset for the
    offer; JS tests; no new card-check section; `resting` preset exists, `open_on` is R2's).
11. Tests 29-31: §8, expanded to 29a-i, 30a-e, 31.
12. Touch list: §0 table and §6.6.

## R3 audit (s2790, tier 2): player-impact 1 (fixed), nits 7 (N2, N5 fixed; N3, N4, N6, N7, N8 accepted)

Fixed by s2791:

- Player-impact 1 (a favourite on a pet this card doesn't show still offered): `mine.has_open_on`
  (`people.open_on(user) is not None`, the person's own `mine` only, a yes/no and never which
  pet) tells the card the person already has a favourite somewhere. `_offerRest` returns when
  any slide's `mine.has_open_on` was true before the call (captured with `before`). Never on
  shared snapshots, `house`, the bus, state or diagnostics; the forget handler resets it.
- Nit 2: after the `open_on` await, no offer if the sheet closed or the card moved off that pet.
- Nit 5: a busy offer stays through a toggle off, and no new offer is made while it is busy.
- Accepted: N3 (a late `rest_offer` failure reads as a failure), N4 (failure message on a
  slide left), N6 (a late `rest_offer` after forget recreates the record), N7 (a disabled
  `switch.resting` counts as can-rest), N8 (a tap in the same tick as a push clears silently).

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
      pytest run are identical to `origin/main` **except the `resting`, `rest_since` and
      `last_rest_refill_at` keys** on every pet save. Check `_step`, `advance`, `requests`, `can_lay_egg`,
      `_voice_pet` all keep the default path.
- [ ] No new person or house key is written until something is chosen. (Pet saves gain
      the three new keys; that is expected, §7.)

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
- [ ] Declining is as easy as accepting and equally permanent; leaving without a button
      is not an answer and saves nothing.
- [ ] The row is card state read at each render (survives a push), clears on every
      path in §6.2, and is never built from `house`, a shared screen or the late move.
- [ ] `async_set_rest_offer` saves at once; the ws has the `shared` guard and no `enabled`.
- [ ] The copy promises no refill, no "content", no "no calls" (copy-scan does not scan
      settings strings; read it).

**Docs and gates**
- [ ] Guide, features.md, events list, Assist words and the settings chapter match the
      code (the last commit `60ebf751` did this for settings; keep it so).
- [ ] Bench presets exist and were read; card-check sections chosen by `pick-sections`
      ran, and the full gate is the first mate's.
