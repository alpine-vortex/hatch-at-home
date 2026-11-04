# The sitter visits the house

**Date:** 2026-11-04
**Status:** Plan only. No code in this document's commit. Four slices, none started.
**Basis:** `b5cf3b28`. Every "built" claim carries a file and line from that tree; recheck when a
slice starts (the card parts move often).
**Source:** the s2881 scout report (design, slices, art, Q1-Q6), re-checked against the code here
(section 11 lists what the scout got wrong). Owner answers to its six questions, 2026-11-04, are
section 1.

The goal: when nobody has been home for `away_after` (2 h by default), Pip no longer goes "to the
sitter's" and vanishes. Pip stays in the house, **a sitter comes to look after it**, and the
card draws the sitter beside Pip. Any signed-in person can still feed, clean, play and tuck in
from work. Pip's needs keep decaying; the sitter tops them up at set times, so care is never
required. When someone comes home the sitter waves and leaves, and Pip greets them as it does
today.

## 1. Decided (the owner, 2026-11-04)

Cite them as "owner decision D1-D6" (Q1-Q6 of the scout; the slices are S1-S4, section 7).

| # | Decision |
|---|---|
| D1 | **Q1 = (c). Privacy mode does not cover the card.** Every card shows the sitter and allows play and care, whether "Keep presence private" is on or off, shared screens included. Sensors, Assist and events keep their current privacy behaviour (section 5 says exactly what each shows). |
| D2 | **Q2 = (c). Needs decay as normal while the sitter is here; the sitter feeds and tops up Pip at set times**, so care is never required. This replaces the scout's "Resting step, frozen" design. Section 3. |
| D3 | **Q3 = (a). Care while the sitter is here counts as at home**: bond, streak and the care log per person, as for any care. |
| D4 | **Q4 = (a). At night the sitter dozes in a chair** (an art pose). |
| D5 | **Q5 = (a). No "at the sitter's" fallback.** The sitter always comes to the house; the old sign is retired. |
| D6 | **Q6 copy is drafted here**, marked "draft, FM approves" (section 9). Nothing in section 9 ships without the first mate's approval. |

## 2. What exists (base `b5cf3b28`)

**The model freezes an away pet and refuses it.**

- `PetState.away: bool` (`model.py:585`, bool-coerced on load at `:702`) and
  `lights_before_away: bool | None` (`:548`, coerced `:704`).
- `advance` (`model.py:1032-1058`): in the 5-minute stepping loop `if state.away:` calls
  `shift_times`, which skips `_step` entirely (`:1049-1050`), so nothing decays, ages, digests,
  calls or gets sick, and `last_updated` slides along. `resting` is the next branch (`:1051`):
  `_rest_step` (`:1081`). Away wins over resting today.
- `shift_times` (`:973`) also serves `catch_up` (`:1010`, HA downtime) and `fast_forward`
  (`:1227`). Downtime stays frozen; this plan does not touch it.
- Care refused: `_do_action` returns `"away"` first (`:2227-2228`); `_refuse_play` too
  (`:2859-2860`). `start_game` logs the refusal (`:2400`). A game ends when the pet goes
  away (`:2572`, and `drop_game` from the coordinator at `:953`).
- Other away gates in the model: `requests` (`:1820`), `give_treats` (`:3759`), `can_lay_egg`
  (`:2044`), `house_answer` (`:2184`), `can_find` (`:3124`), `react` (`:1149`).
- Lights while away: `set_lights_out` stores `lights_before_away` and applies nothing
  (`:3812-3818`); `come_home` applies the flip on return (`:3825-3832`).
- Mood: `MOODS` has `"away"` first (`:31-33`); `mood_keyed` adds the flag (`:3881-3882`) and
  `away` wins, so the mood is "away" with the reason "at the sitter's" (`:3953`).
- Poop, sickness, calls: `_digest` (`:1422`), `_sickness` (`:1433`), `_calls` (`:1508`). The
  chore-treat top-up is the precedent for a no-person, no-`apply_action` care entry:
  `_give_treats` logs `{"action": "chore_treat", "by": None}` (`:3764-3780`).

**The coordinator applies presence and hides it.**

- `Presence` (`home.py:334-374`): `update` returns away once the zone has been empty for
  `away_after` (`:372`), and makes a greeting on a return (`:362-369`). Count `None` (no signal)
  changes nothing. `watcher.people_home` is `watcher.py:408`. `HOME_AWAY_AFTER_HOURS = 2.0`
  (`rates.py:335`); the option is `CONF_AWAY_AFTER` (`const.py:110`, read at
  `coordinator.py:351`); `CONF_SITTER_SETTLES` (`const.py:111`) settles a whine on leaving.
- `_sense_home` (`coordinator.py:911-962`): sets `state.away`, drops the game, settles a whine
  (`sitter_settles`, `model.py:1790`), fires `went_away` / `came_home` (`:961`, unconditionally,
  privacy never gated them) and calls `model.come_home`.
- Privacy ("Keep presence private", `coordinator.py:436`, default on): the mood sensor reads
  `asleep` / `zzz` for an away pet (`:464-469`); `binary_sensor.asleep` reads on
  (`binary_sensor.py:63-71`); a refused care or game says `asleep` instead of `away`
  (`:3096`, `:3186`, `:3248`); the news and react services answer `asleep` (`:3384`, `:3441`);
  the debug sensor shows the masked flags (`sensor.py:391`); Assist's words say the same
  (`intent.py:36, :83, :261`).
- Other coordinator away gates: `_awake` (`:1018`, `:1272`, the daily wish and moments), the
  open-on pick (`:1645`), the birthday push (`:2522`), the voice pet pick (`:2540`), and
  `:1830`.

**The card hides the pet.**

- `card-layout.js:537-538`: `away = mood?.state === "away"`. On away (`:566-571`): no frames, the
  pet hidden, the `sitter_sign` prop shown (`species.json` `props.away`), the label "at the
  sitter's". Also: the game ends (`:681`), the care buttons and lights are disabled (`:700`,
  `:720`), the request chip is hidden (`:709`), `_say` returns "" (`:737-738`).
- Other card gates: `card-actions.js:123` (`_sceneStart` returns on away), `card-board.js:71`
  (a Hop refusal), `card-looks.js:7` (the first look), `card-games.js:22` (the ball prop).
- **The card reads the masked sensors.** It takes `mood`, `binary_sensor.asleep` and
  `binary_sensor.calling` from `hass.states` (`card-layout.js:534-537`). With privacy on, those
  say asleep for an empty house, so the card has **no way to see the sitter or the real mood
  today**. S1 needs a new, unmasked path: section 5.3.
- Care goes through the entities: `hass.callService(button.press)` (`card-actions.js:61`), the
  same path as an automation or a voice command, so the server can't tell the card from an
  automation (section 5.2).

**The channel** (`virtual_pet/subscribe`): `channel_snapshot` (`coordinator.py:2934`) sends
`mine` (a person's own view), `house` (`_house_view`, `:2902`; shared screens get it plus
`house_open_on`, `:2886`) and `moments`. `house` is the view every screen sees, shared ones
included, so it is where the sitter goes.

**Save.** `PetStore` has `STORE_VERSION = 1` and no migrations (`coordinator.py:223-233`);
`from_dict` defaults missing keys and keeps unknown ones (`model.py:673-712`), so an additive
field needs no migration. `last_care` sensor exposes the care log (`sensor.py:353-366`); the
log holds 20 entries (`CARE_LOG_SIZE`, `rates.py:240`).

**Art today.** One prop per species, `sitter_sign` (`species.json` `props.away`). No sitter
character exists. Visitors (`card-visitors.js`) are the closest precedent for a drawn guest.

## 3. The design: the sitter looks after Pip (owner decision D2)

### 3.1 The state

**`state.away` stays and now means "the sitter is here"** (nobody home for `away_after`). Same
name, same type, same coordinator logic, so no migration and every automation on
`went_away` / `came_home` keeps working. What changes is what `away` does:

| | Today | After |
|---|---|---|
| `advance` | `shift_times` (frozen) | the normal `_step` plus the sitter (3.2) |
| aging, growth, hatching | paused | go on (Pip is at home, living) |
| hunger, happiness, energy, weight | frozen | decay as normal |
| calls, misses, discipline misses | none | none: the sitter's round stops them being needed (3.4) |
| care and play | refused `"away"` | allowed (3.7) |
| lights | stored, applied on return | applied at once |

Resting beats the sitter in `advance` (the order flips: `resting` is tested first). A resting
pet's needs are held, so there is nothing for the sitter to top up and no round runs. The card
still draws the sitter (nobody is home), and the resting label wins as today.

An egg gets no round (it is not cared for): `_step` returns before the sitter code at
`if stage == "egg": return` (`model.py:1183-1184`), so the order puts the sitter after that line, between `_digest` and `_sickness`, so it sees the
step's decay and the pet's current sleep.

### 3.2 The rounds: when, what, how much

All of it is in the model, a pure function of `(state, now, settings)` with **no random draw**
(the sitter does not call `apply_action`, so it never uses the feed jitter), so a test pins it.

**When.** Four set times a day, as offsets from the pet's wake time (`settings.wake_time`, local
zone, DST-safe like `next_wake`, `model.py:1248`):

| round | offset | default clock (wake 07:00) |
|---|---|---|
| breakfast | wake + 1 h | 08:00 |
| lunch | wake + 5 h | 12:00 |
| tea | wake + 9 h | 16:00 |
| supper | wake + 13 h | 20:00 |

`rates.py`: `SITTER_ROUNDS_HOURS = (1, 5, 9, 13)`. The "house day" starts at the latest wake time
at or before now, so after midnight it is still last evening's day. A round is **due** when its
slot time has passed, it is later than `state.sitter_served`, and Pip is awake. Several missed
slots (a long nap, a restart) make one round, stamped with the latest slot, never a burst.
A pet asleep at its slot is served on waking.

**On arrival.** The round also runs once at the moment the sitter arrives (`away` flips to true),
whatever the clock says, and stamps the latest slot. So a pet that left hungry is fed at arrival,
and the stale-slot case (arriving at 23:00, the 20:00 slot unserved) cannot feed a sleeper at
dawn.

**What, in this order,** each only if needed (so a pet that is fine is never over-fed):

1. **Medicine** if `sick`: `health += MEDICINE_HEALTH`, `happiness += MEDICINE_HAPPINESS`, clears
   `sick` and `recent_misses`, event `recovered` (the same effect as `_do_action`, `model.py:2287-2296`).
2. **Clean** if `poops` is not empty (`poops = []`).
3. **Feed** if `hunger < SITTER_FEED_BELOW` (60; the supper round uses `SITTER_SUPPER_BELOW`,
   80, so Pip is not hungry at wake): `hunger += FEED_HUNGER` (35), `weight += WEIGHT_FEED`, and
   one `digesting` entry at exactly `now + DIGEST_MINUTES` (120 min, no jitter).
4. **Play** if `happiness < SITTER_PLAY_BELOW` (55) and `energy >= PLAY_MIN_ENERGY +
   SITTER_PLAY_ENERGY_MARGIN` (15 + 20 = 35): `PLAY_HAPPINESS` (+20), `PLAY_ENERGY` (-10),
   `PLAY_HUNGER` (-5), `WEIGHT_PLAY` (-3). It does not set `last_excite` (nobody is there to
   see it) and does not touch discipline.

The numbers are draft tuning, in `rates.py`, and the simulation (3.8) is what pins them. They are
chosen so that the worst case never reaches a "hungry" or "bored" flag (both below 35,
`rates.py:179, :181`): between rounds hunger falls at most 20 in four awake hours; across the
night from the supper round at 80 it falls about 36 (3 h awake, 8 h asleep at 40% speed, 1 h
awake), so Pip wakes at about 44 or more and is still at about 39 an hour later, just before
breakfast. Happiness falls at most 16 between rounds.

**Energy is not topped up.** It is the only need the sitter cannot restore, and sleep does. An
awake pet still reaches the `COLLAPSE_ENERGY` rule or the "dozes off past bedtime" rule
(`_sleep`, `model.py:1259`) as it does at home; no call is made for it (3.4).

### 3.3 Poop: tidied as it happens

A meal digests about two hours after the sitter fed it, so a poop would sit up to four hours until
the next round: old poop costs health (`HEALTH_PER_OLD_POOP`, `rates.py:38`) and risks sickness
(`POOP_SICK_HAZARD`, `:137`). So while `away`, `_digest` (`model.py:1422`) **tidies a poop the
moment it would appear**: it is not added to `poops`; a `sitter_clean` log entry is written (3.6)
and a `sitter_round` event with `did: ["clean"]` is returned (3.6). The sitter is in the house all day, so
this reads true. The meals and games stay at set times; only the cleaning is on demand. (Open
question Q-A, section 10, offers the alternative: clean only at rounds, with sitting poops.)

### 3.4 Calls, misses, sickness, aging

- **Calls are not made while the sitter is here.** `_calls` takes the sleeping branch for an away
  pet: no new call, no miss, no whine, no lonely call, the deadline of an open call slides
  (`call.deadline += hours * 3600`, as `model.py:1523` does for sleep). So a household
  away never gets a "Pip is hungry" push, and no `care_miss` can lead to `neglect` sickness.
  A real call open on arrival is settled by the arrival round: if its need is met after the
  round, it ends with `call_answered`; anything left (a whine the option keeps, 3.9) stays
  paused until someone is home.
- **Sickness stays live** as a safety net (`_sickness` runs). The paths the sitter closes are
  `neglect` (no misses), `poop` (tidied), `low_health` (no starving, no old poop). `weight`
  stays reachable only if Pip arrives already heavy, and the sitter's diet is the maintenance
  diet (about 2.75 meals a day, about 13 weight against a burn of about 8 at weight 50, so it
  settles near 56, far under `WEIGHT_HEAVY_ABOVE = 75`). If a sickness still happens, the next
  round gives medicine, and `became_sick` pushes as it does at home (honest: something went
  wrong).
- **Aging and growth go on**, including stage changes, an egg hatching (the `hatched` event, the
  first look stays pending for whoever opens the card first) and the next birthday. This is the
  cost of "needs decay as normal": the old "frozen, no aging" guarantee goes (docs, section 8).
  `_learn` and `_sample` also keep running; S1 checks neither assumes a person is home.

### 3.5 What the sitter's care is not

The sitter does **not** call `apply_action`. So it sets no `last_care_at`, opens no praise
window, earns no bond, no streak, no per-person count, no wish, no memory, no dream seed, no
`by`. (`_check_ins` and the bond code key off `{"type": "care"}` events and `care_log[0]["by"]`,
`coordinator.py:1485-1500`; the sitter writes none of them.) The upbringing and discipline
counters do not move for it either. A person's care, from the card or an automation or voice,
does everything it does at home (3.7).

### 3.6 The log and the report

Four care-log actions, `by: None`, `result: "ok"`, written into `care_log` (`model.py:2352`) so
the card's away note and the `last_care` sensor see them: `sitter_feed`, `sitter_play`,
`sitter_clean`, `sitter_medicine`. A round that does nothing writes nothing. The log holds 20
entries, so a quiet visit won't overflow it (about 4 entries a round at the very most, normally
1 or 2).

A round (and a tidy) returns one event, `{"type": "sitter_round", "did": ["feed", "play"],
"at": ts}`, in the list `advance` already returns. **It must never reach the bus**: `_fire` fires
every event it is given as `virtual_pet_<type>` (`coordinator.py:1194-1215`), so the coordinator
takes `sitter_round` out of the list first, keeps the last one for the channel's `sitter.last`
(5.3), and fires the rest. A test pins that no `virtual_pet_sitter_round` event is ever fired
(section 5.4).

### 3.7 Care and play while the sitter is here (owner decisions D1, D3)

- `_do_action` and `_refuse_play` stop refusing `"away"`; `_sense_home` stops dropping the game
  on `away`; `drop_game` at `model.py:2572` stops testing `away`. A game started from the card
  runs on.
- Lights are applied at once; `set_lights_out` loses the away branch.
- The other away gates: `requests`, `give_treats`, `can_lay_egg`, `house_answer`, `can_find`,
  `react`, `_awake`, the open-on pick, the voice pick, the birthday push drop their `away` term:
  Pip is up and living. The news and react **services** (`coordinator.py:3384, :3441`) stay as
  built: refused `asleep` with privacy on, `away` off, since they are the house talking to an
  empty room. A test lists each gate and the decision.
- A person's care is that person's: bond, streak, per-person log, wish and memory follow
  `apply_action` exactly as at home (owner decision D3). Care by a person who is not home (from
  work) is the same.
- `can_lay_egg` loses `not state.away`. Eggs: the egg refusals stay (`"egg"`).

Each one is a one-line change plus a test; the table of gates is in the S1 acceptance.

### 3.8 Determinism and tests (pytest, no Home Assistant)

The round is `model.sitter_round(state, now, settings) -> list[Event]` and
`model.sitter_due(state, now, settings) -> float | None` (the slot time). Neither reads a clock
or a random generator. Tests, in a new `tests/test_sitter.py`:

- `sitter_due`: a table of (wake time, now, `sitter_served`) to slot; a DST day; after midnight;
  asleep; several missed slots give one.
- `sitter_round`: each need alone and together; thresholds on both sides; the supper
  threshold; a pet that is fine does nothing and writes no log; play refused for low energy;
  egg and resting do nothing; the same input twice gives the same output.
- `advance` with `away` true over 7 days (a "sitter bot": no care at all): **zero** `care_miss`,
  **zero** `call_started`, never `sick`, health 100, no old poop, weight band healthy, hunger
  and happiness never under 35 at any slot or at wake, aging goes on, an egg hatches.
  `scripts/balance_sim.py` has bots of this kind (`responder`, `neglect`, ...); add a `sitter`
  bot so the invariant also runs in the balance sim.
- Upgrade: a save with `away: true`, a shifted `last_updated` and no `sitter_served` loads, and
  the first `advance` after load does not replay anything (3.10).
- Care by a person during `away` is logged with `by`, earns bond, and starts a game that runs;
  the sitter's entries have `by: None`; a sitter feed does not set `last_care_at`.

### 3.9 The options that already exist

- **Away after (hours)** (`CONF_AWAY_AFTER`): when the sitter comes. Unchanged.
- **The sitter calms a fussy pet** (`CONF_SITTER_SETTLES`, default on): on arrival a whine is
  settled with `call_settled` (`sitter_settles`, `model.py:1790`), as built. Off: the whine stays
  open and **paused** (sliding deadline) until someone is home, then waits for them as it does
  now. The setting's label is still true.
- **Keep presence private**: section 5.

### 3.10 Save impact

- **One new field:** `PetState.sitter_served: float = 0.0` (the slot time last served, a wall-clock
  timestamp, so it is not shifted by `shift_times`; `_FLOATS` in `model.py:83` with a range and a
  future-stamp clamp like `last_rest_refill_at`, `:1121-1125`). A stamp in the future (a clock set
  back, a damaged save) is clamped to now.
- **No migration:** `from_dict` defaults it, `STORE_VERSION` stays 1.
- **Existing `away: true` saves** load as "the sitter is here". Their `last_updated` was kept
  current by the freeze, so nothing is replayed; the first `advance` runs live. A
  `lights_before_away` left in an old save is applied once on load
  (`settle_legacy_lights`, a call to the `come_home` body) and cleared; the field itself stays
  (always `None` from now), no save change.
- **Downgrade:** an older version keeps `sitter_served` as an unknown key and treats `away: true`
  as frozen and refusing care again. Harmless, and Pip simply loses the sitter for the time.
- **No** change to the people store, the channel store, options or `config_flow` options (the
  strings change, section 9).
- Tier 2 (it changes saved state and the away behaviour).

## 4. Whose care counts, and the day-to-day (owner decision D3)

Care while the sitter is here counts as at home. A person on their phone at work presses Feed:
the pet is fed, the log says who, the bond grows, the wish may be granted. Nothing in
`apply_action` checks presence any more. The rounds do not compete with it: a person who fed Pip at
11:50 makes the 12:00 round a no-op (hunger is above 60), and a sitter who fed at 12:00 makes a
person's 12:05 feed answer `full` only above 95 (as at home).

## 5. Privacy: exactly what each surface shows (owner decision D1)

The privacy bar (AGENTS.md) is two things only: nothing leaves the household, and free text is
never shared. Nothing here sends anything off the box, and the sitter has no free text. The
option "Keep presence private" stays as a setting and keeps its meaning for everything except the
card.

### 5.1 The table

With **Keep presence private ON** (the default) and **OFF**, for a visit in progress:

| surface | ON | OFF |
|---|---|---|
| `sensor.mood` state | `asleep`, reason `zzz` (as built, `coordinator.py:464-469`) | `away`, reason "the sitter's here" (was "at the sitter's") |
| `sensor.mood` flags | `asleep` (+ `resting` if resting) | the real flags, plus `away` |
| `binary_sensor.asleep` | on (as built, `binary_sensor.py:63-71`) | the real value |
| numeric sensors (hunger, happiness, ...), `calling`, `poop` | the real values (as built; they now move, as Pip is living) | same |
| `sensor.last_care` `log` | the sitter's rows shown as the plain actions `feed`, `play`, `clean`, `medicine`, `by: null` (not `sitter_*`) | the rows as logged, `sitter_*` |
| debug sensor flags | masked (as built, `sensor.py:391`) | real |
| events `virtual_pet_went_away` / `came_home` | fired as built (never gated by privacy, `coordinator.py:961`) | same |
| any new bus event for the sitter's rounds | **none** (the rounds go to cards by the channel only) | none |
| notifications | the same as at home; calls don't fire (3.4); `became_sick`, `hatched` and stage changes do | same |
| Assist, "how is Pip" | "asleep" (as built, `intent.py:261`) | "with the sitter" (draft, 9) |
| Assist, a care command | refused "asleep" (the intent checks `away and privacy` itself, 5.2) | works |
| `virtual_pet.news` / `react` services | refused `asleep` (as built, `:3384, :3441`) | refused `away` |
| the card (every card, shared screens too) | **the sitter, the real mood, care and play on** | same |
| the private channel | the `house.sitter` view (5.3), sent to every watcher, shared screens too | same |

### 5.2 The care front doors

`model.apply_action` no longer refuses `away`, so the privacy mapping has nothing to remap
(`coordinator.py:3096, :3186, :3248` become dead code; S1 removes them). The card, a button
entity, an automation and a service call all reach the same `async_action`, so **they all work
during a visit, privacy on or off**: the server cannot tell the card from an automation, and S1
does not try. The one door that is not the card is Assist: `intent.py:327` refuses
`asleep` when `away and privacy`, so a voice command cannot be used to find out the house is
empty, and the answer sounds the same as for a sleeping pet. (If the owner wants buttons and
services held back too, that is Q-B, section 10.)

### 5.3 The new channel field

`_house_view` gains `sitter`: `None` when nobody is away, otherwise

```
{"mood": "hungry", "key": "hungry", "flags": ["away", ...], "asleep": false,
 "lights_out": false, "last": {"at": 1730700000.0, "did": ["feed"]}}
```

`mood`, `key` and `flags` come from `model.mood_keyed` **without the privacy mask and with the
away flag but not the away mood** (a new `model.real_mood` that skips `"away"` in `MOODS`); the
card draws that mood, so the sitter's Pip is happy, hungry or sleepy like any Pip. `last` is the
last round, for the card's cue. The view carries no name, no `by`, no free text. It goes to every
watcher of the pet, because every card shows the sitter (D1); the watchers are authenticated
Home Assistant sessions already. `_shared_house` adds to it as before.

Cost: the house view is diffed per watcher (`_sent`); `sitter` changes at most a few times an
hour. The `tests/test_channel.py` snapshot and diff tests grow a case.

### 5.4 Why no bus event for rounds

The bus and `last_care.moments` are the surfaces privacy covers. A `virtual_pet_sitter_round`
event would say "the house is empty" to an automation and a template with privacy on, which is
what the option promises not to do. So the rounds live in the log (with the privacy mapping of
5.1) and the channel only.

## 6. The card

### 6.1 What it reads

`_update` (`card-layout.js:530+`) takes the sitter from the channel's `house.sitter`, not from
`sensor.mood`. When `sitter` is set: `away = false` for the old purposes (so the pet is drawn,
the buttons enabled, the game kept, `_say` speaks), `s.sitter = view`, and `mood` / `asleep` /
`flags` come from the view, not the sensors. When the channel has not yet answered (the first
render), the card draws as at home from the sensors and corrects at the first snapshot (no
flash of the sign).

If the card has no channel (it is not subscribed), it falls back to the sensors as built: with
privacy off it sees `mood.state === "away"`, with privacy on it sees a napping Pip. S2 tests the
fallback; it is the only case where privacy on hides the sitter from a card.

### 6.2 What it draws

- Pip drawn as at home (the frames of its real mood).
- The sitter beside Pip: standing/idle by day, **dozing in a chair at night** (D4), a small
  label "sitter's here" where the old "at the sitter's" label sat (`.awaylabel`, `card-build.js:143`).
- The old sign: not drawn (D5). `props.away` is retired in slice S4.
- Buttons, lights, games, the request chip, `_say`, the first look and the gift moments all
  work as at home.

### 6.3 Cues (slice 3)

On `house.sitter.last` changing: the sitter performs the round's items (feed, play, clean,
medicine) with the existing care props, once, if the card is on screen and `calm()` is false;
otherwise no motion. A person's own care while the sitter is here plays the existing care
scene with the sitter standing by (no extra animation in the scene frame). Arrival and leaving
are beats (6.4). The pet's `transform` stays as in AGENTS.md "Motion on the card": the sitter is
its own element with its own animations; Pip's classes are not reused. Any new `.pet.<cls>` rule
with an `animation` goes on `tests/js/motion_rule.test.js`'s list.

### 6.4 Arriving and leaving

- **Arrival:** the channel's `sitter` goes from `None` to a view: the sitter walks in (2 frames),
  stops beside Pip, waves; Pip looks over (the existing `look` rotate). If the card was not open
  it just draws the sitter standing.
- **Leaving:** `sitter` goes back to `None` while the card is on screen: the sitter waves, walks
  out (2 frames), then the existing greeting runs (`greeting` flag, `home.py:362-369`). Not on
  screen: nothing, the sitter is gone.
- A reduced-motion user gets no walk: the sitter is simply there or not.

### 6.5 The away note

`_awayNote` (`card-visit.js:54`) builds "while you were out, I ..." from the log and moments
(`_dayBits`, `:81`). `CARE_BITS` gains `sitter_feed`, `sitter_play`, `sitter_clean`,
`sitter_medicine`. With the privacy mapping of 5.1 the plain actions are already covered for
privacy-on sensors, but the card reads `sensor.last_care.log` too, so it sees `feed` rows with
`by: null` and says "had a meal" as it would for a chore treat. With privacy off it can name the
sitter (9). The note is the card's own, on a card inside the household, so the "echoes" of the
visit are fair game.

## 7. The slices

Each is shippable alone. After each one the card and the server agree.

| slice | what | tier | needs |
|---|---|---|---|
| **S1** | The visit in the model and coordinator: the rounds, no refusals, the front doors, the docs for the server | **2** | nothing |
| **S2** | The card shows the sitter beside Pip and works as at home (placeholder art) | 1 | S1 |
| **S3** | The sitter's life: arrive, leave, cues, doze, away note | 1 | S2 and art A1 |
| **S4** | Retire the old sign and tidy | 1 | S3 |
| **A1** | The sitter's art (parallel, no code) | n/a | nothing |

Order: S1, S2, S3, S4. A1 starts at once. A review tier of 2 means the adversarial review before
the merge.

### S1. The visit (server). Tier 2.

Changes the away behaviour and saved state.

- `rates.py`: `SITTER_ROUNDS_HOURS`, `SITTER_FEED_BELOW`, `SITTER_SUPPER_BELOW`,
  `SITTER_PLAY_BELOW`, `SITTER_PLAY_ENERGY_MARGIN`.
- `model.py`: `sitter_served`; `sitter_due`, `sitter_round`, `sitter_arrives`
  (settle the whine by the option, run the round, settle calls); `advance` away branch to `_step`
  (resting tested first); `_step` calls the sitter after the egg return, between `_digest` and `_sickness`; `_digest` tidies when
  away; `_calls` pauses when away; the `_do_action` / `_refuse_play` / `drop_game` away terms
  removed; the other gates (3.7); `set_lights_out` loses the away branch; `real_mood`;
  `settle_legacy_lights`; `MOOD_REASONS["away"]` = "the sitter's here"; the four log actions.
- `coordinator.py`: `_sense_home` stops dropping the game, calls `sitter_arrives` on the flip, takes
  `sitter_round` out of the event list before `_fire` (3.6),
  `settle_legacy_lights` at load; the gates in 3.7; the dead privacy mappings removed; the channel
  `house.sitter` (5.3) and its diff; the `last_care` log mapping (5.1, in `sensor.py`).
- `intent.py`: the Assist gate (5.2) and the words (9).
- `strings.json` / `translations/en.json`: the people-page text (9).
- Docs: `docs/guide.md:615-622` (the options table), `:586` and `:807` (the lights and resting
  lines that name the sitter), `docs/features.md:41-42`, README line 97.
- Tests: section 3.8, plus `test_home` (presence flip, the whine option), `test_channel`
  (snapshot, diff, shared screen), `test_assist` (privacy on and off), `test_init` (the strings),
  `test_resting` (resting beats the sitter), the gates table, `balance_sim` bot.

**The card in S1** is unchanged and still reads the sensors. S1 keeps the `away` mood value on
the sensor (privacy off), so the old card keeps drawing the sign and the hidden pet with the
buttons off; with privacy on it sees a napping Pip. Neither is wrong, only stale: the server
looks after Pip either way. The new view reaches the card in S2.

**Acceptance:** section 3.8's tests green; `pytest` in full; `ruff`; the 7-day sitter bot shows
the invariants; a save with `away: true` from the main branch loads and runs; the privacy table
(5.1) is a test (one parametrised test, ON and OFF, per row that a test can reach).

**Device queue (S1):** none for a phone; this is server-only. The full gate runs (`scripts/ci-gate`),
since server code is in the diff and `pick-sections` would pick `all`. In a throwaway HA via
`scripts/gate`: with the real stack, leave the dev house's person entity not home for the
away window (set `away_after` to the minimum in the dev options), see the sitter round fire
(`last_care` log), then bring the person home. Card-check sections `away` and `restart`
must pass unchanged.

### S2. The card (placeholder). Tier 1.

- The card reads `house.sitter` (6.1); draws Pip, the real mood, the buttons on; a **placeholder
  sitter** (a CSS/inline shape or the existing `sitter_sign` frame at pet scale, so the layout
  and the label are right before the art lands); the label "sitter's here"; the sign is not
  drawn.
- `card-layout.js` away terms (`:537-738`) become sitter terms; `card-actions.js:123`,
  `card-board.js:71`, `card-looks.js:7`, `card-games.js:22`.
- Bench: a `sitter` state in `scripts/bench.js` (and the `ui` preset), pinned by flags
  (`--sitter day|night`).
- JS tests: `card-source` regex tests that pin the away terms (`care_reactions.test.js:83, :110,
  :186, :475, :1208`, `motion_ship1.test.js:46-48`, `hop_settle.test.js:51`) change with them.
- Docs: how-to-play page and the guide's card section.

**Acceptance:** bench shots of day, night, calling-not-possible, a game running, a shared
screen, privacy ON and OFF (identical on the card), three species and an egg; `motion_rule` green;
the degraded case (6.1) drawn.

**Device queue (S2):** the bench presets `ui` and `shells` plus the sitter shots above. Real HA
only for the behaviour: card-check `away` and `restart` via `scripts/gate --auto`, and one check
that a shared-screen card (`shared: true`) shows the sitter with privacy ON. No full gate.

### S3. The sitter's life. Tier 1. Needs A1.

- The sitter art in (the poses in section 8); arrive and leave beats (6.4), the round's cue
  (6.3), the doze in a chair at night (D4), the idle (read, look around), the care-scene
  companion pose; the away note and the journal line (9).
- Lines for Pip about the sitter (9); `copy-scan.js` `COPY_TABLES` updated.
- `CARE_BITS` for the four actions (6.5).

**Device queue (S3):** bench shot per pose and per beat (a frame-by-frame `petAt` pause), reduced
motion on and off, a long-run idle check, a partial card-check (`scripts/gate --auto`) and a
full `ci-gate` at the batch's end because the art lands in `frontend/`.

### S4. Retire the old sign. Tier 1.

- Drop `props.away` and the `sitter_sign` art from the 30 species' `species.json`, the
  `awaysign` elements and their CSS, `strings.json` "away" mood label as needed (the sensor
  value `away` stays).
- Resources are in the diff, so this slice gates at its commit (AGENTS.md: a commit touching
  resources gates there).
- Optional: delete the `lights_before_away` field once no save can hold it (never; keep it, a
  dead key costs nothing and avoids a save change).

**Device queue (S4):** the shells and species bench presets (no sign on any), `ci-gate`.

### A1. The art (parallel, no code)

Section 8. It goes through the art desk's usual route, not through this plan. S2 uses the
placeholder, so nothing waits on it until S3.

## 8. The art list

One sitter, one set, shared by every species. Human-ish, gender-neutral, simple, readable at
pet scale beside any species (the size is taken from the existing prop frames; the art desk
settles it). Two frames per pose unless marked. Reuse the existing care props (`bowl_food`,
`play`, `bird/medicine`) so only the sitter's body and hands are new.

| # | pose | frames | used by |
|---|---|---|---|
| 1 | walk in | 2 | arrival (6.4) |
| 2 | stand / idle | 2 | S2 placeholder replaced; the default |
| 3 | idle: reading, sitting up (chair, awake) | 2 | long stays, a quiet day |
| 4 | wave (hello and goodbye) | 2 | arrival, leaving |
| 5 | walk out | 2 | leaving |
| 6 | feed (bowl) | 2 | the round, 3.2 |
| 7 | play (ball) | 2 | the round |
| 8 | clean (sponge) | 2 | the round and the tidy |
| 9 | medicine | 2 | the round |
| 10 | tuck in (blanket) | 2 | a person's tuck-in, the sitter by |
| 11 | pat | 2 | now and then, idle |
| 12 | **dozing in a chair** | 2 | **night (owner decision D4)** |
| 13 | cheer (a win) | 2 | a game won |
| 14 | shoo / "not now" | 2 | a refused care |
| + | the chair (a prop) | 1 (2 with a doze nod) | 3 and 12 |

About 14 poses, about 28 frames, plus the chair. The chair sits at the bottom edge of the
screen so it does not cross Pip. The sign `sitter_sign` is retired in S4.

## 9. Copy (draft, FM approves — owner decision D6)

Nothing here ships until the first mate approves it. Lines for Pip follow the card's voice
(lowercase, short). All "draft".

**Card**
- Label by the sitter: "sitter's here" (approved).
- Arrival bubble: "the sitter's here!" / "hi, sitter!" (approved).
- After a round, fed: "yum! thank you, sitter" (approved).
- After a round, played: "that was fun!" (approved).
- After a round, cleaned: "all tidy!" (approved).
- After medicine: "i feel better" (approved).
- Leaving, to the sitter: "bye, sitter!" (approved).
- The return: the existing greeting.
- Idle, night: none (the sitter dozes; Pip sleeps).
- The away note: "while you were out, the sitter and I played!" / "while you were out, the
  sitter fed me!" (approved); the existing form otherwise.

**Mood and Assist (privacy off)**
- Mood reason: "the sitter's here" (approved).
- Assist, "how is Pip": "Pip is with the sitter" (approved); `MOOD_WORDS["away"]` and
  the "is at the sitter's" line (`intent.py:36, :83`) change to match. With privacy on it stays
  "asleep" (5.1).

**Settings (`strings.json`, `translations/en.json`, `docs/guide.md:620-622`)**
- "Off to the sitter's after" becomes "The sitter comes after" (approved); its text:
  "With nobody home this long, a sitter looks after your pet. It still gets older and hungry,
  and the sitter feeds it and tidies up at set times." (approved)
- "Keep presence private": "On: sensors, Assist and the mood show your pet napping when nobody
  is home, and the pet never names anyone. The card still shows the sitter. For a wall tablet,
  also turn on "shared screen" in the card's settings." (approved)
- "The sitter calms a fussy pet": text unchanged.
- The `away` mood label (`strings.json:273`): "With the sitter" (approved).

**The journal / guide**
- Journal line: "The sitter looked after Pip." (approved). A round's detail is not
  journalled (the log has it).

## 10. Risks, and the questions left for the owner

**Risks**

- R1. **Every away gate flips at once** (3.7). Missing one leaves a feature dead during a
  visit. Mitigation: the gates table in S1's acceptance is a test, one case per gate.
- R2. **A sleeping sitter-less house is quiet; the sitter is not.** Notification pushes for
  `hatched`, stage changes and `became_sick` now reach phones while nobody is home. They did
  not before (frozen). Judged right (the same as at home) but it is a change: the guide says so.
- R3. **The channel is the only new surface**, and it is household-internal. A
  card without the channel degrades (6.1).
- R4. **Aging goes on** (3.4): "frozen" in the old guide is gone. A pet that is away for a
  fortnight grows two weeks. Q-C below.
- R5. **Tuning.** The thresholds are draft; the simulation is what fixes them. A wrong number
  shows up as a "hungry" flag at breakfast, not as harm.
- R6. **A reload during a visit** (`s.reloading`): the sitter view is in the snapshot, so a
  reloaded card draws it at once.

**Open questions for the owner** (recommendation first; none block S1, but Q-A and Q-C change
its behaviour, so they are asked before it starts)

- **Q-A. Poop during a visit.** Recommended: **tidied the moment it happens** (3.3), the sitter
  being in the house. Alternative: only at the rounds, so a poop can sit up to four hours, wearing
  health and risking a sickness that the next round cures. Simpler model, slightly less
  "care is never required".
- **Q-B. Buttons and services under privacy ON.** Recommended: **they work during a visit**
  (the card uses them, so they can't be told apart, 5.2); only Assist refuses. Alternative: hold
  the buttons and services back as well, which would make the card's own care presses fail, so
  it would need a different door for the card (a new websocket command). Not recommended.
- **Q-C. Aging during a long absence.** Recommended: **it goes on** (decay as normal, D2).
  Alternative: pause aging only (not needs) after N days away. Not asked by the owner; flagged
  because "frozen" was a promise in the guide.
- **Q-D. The `mood` sensor with privacy OFF.** Recommended: it keeps the value `away` (reason
  "the sitter's here") so automations on `mood == away` still work, though Pip is not
  literally away. Alternative: it reports the real mood and `away` is only a flag, which breaks
  those automations.


**Answered 2026-11-04** (owner Q-A, Q-C; first mate Q-B, Q-D as recommended, low risk):
- Q-A: poop is **tidied the moment it happens** during a visit (owner).
- Q-B: buttons and services **work during a visit** under privacy on; only Assist refuses (FM).
- Q-C: aging **goes on** during any absence; the guide drops "frozen" (owner).
- Q-D: the `mood` sensor **keeps the value `away`** with privacy off (FM).
- Section 9 copy: **approved by the first mate** as drafted (D6). Workers ship those lines verbatim.

## 11. What the scout got wrong (checked against the code)

The scout's file and line claims were checked one by one. Right: the `model.py` lines for
`away` (`:585, :702, :704, :1049, :2227, :2572, :2859, :3124, :3812-3830, :3881, :3953`),
the `coordinator.py` lines (`:464, :911-962, :1018, :1272, :1645, :3096, :3186, :3248, :3384,
:3441`), `home.py:334-374`, `rates.py:335`, `watcher.py:408`, `intent.py:36, :83`, and the doc lines
(features `:41-42`, guide `:615-622, :807`). Wrong or incomplete:

- **`card-status.js:105`** and **`card-looks.js:478`**: neither has an `away` term (a grep of
  `src/card/*.js` finds `away` in `card-actions`, `card-board`, `card-games`, `card-layout` and
  `card-looks:7` only). The real gate list is in section 2.
- **Missed:** `card-games.js:22` (the ball prop), `binary_sensor.py:63-71` (the masked asleep),
  `model.py:1149` (`react`), `model.py:2044` (`can_lay_egg`), `coordinator.py:2522, :2540`.
- **The design itself:** the scout's "Resting step, frozen" is replaced by owner decision D2.
  Its claim that care "needs no change" was right for the care scenes, but its plan to let the
  card read the unmasked state was missing: with privacy on the card has no way to see the real
  mood (it reads the masked sensors), which is why section 5.3's channel field exists.
- **Its slice order** (S1+S2 together) is no longer needed: S1 here keeps the sensor value `away`
  for privacy OFF, so the old card is merely stale, not broken, until S2.
- **The scout's save claim** ("no new key") changes to one additive float, `sitter_served`.
