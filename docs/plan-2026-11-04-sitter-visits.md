# The sitter visits the house

**Date:** 2026-11-04
**Status:** Plan only. No code in this document's commit. Four slices, none started.
**Revised 2026-11-04** after the adversarial review (worker s2883, findings A1-A9, B1-B7,
C1-C3): section 12 maps each finding to where it is fixed. The tuning in 3.2 and 3.2a is now
measured (`dev/sitter_sim.py`), not drafted.
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
  (a Hop refusal), `card-looks.js:7` (the first look), `card-games.js:22` (the ball prop). This
  list is not complete; S2's file list has the grep and the rest (B1).
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
zone):

| round | offset | default clock (wake 07:00) |
|---|---|---|
| breakfast | wake + 1 h | 08:00 |
| lunch | wake + 5 h | 12:00 |
| tea | wake + 9 h | 16:00 |
| supper | wake + 13 h, **never later than bedtime - 1 h** | 20:00 |

`rates.py`: `SITTER_ROUNDS_HOURS = (1, 5, 9, 13)`, `SITTER_SUPPER_BEFORE_BED_HOURS = 1`. The
bedtime clamp is there because `Settings.bedtime` is configurable: with the clock at 19:00 the
20:00 slot falls on a sleeping pet and Pip woke hungry (hunger 22, 218 "hungry" steps in 30
days; with the clamp, hunger never under 50, section 3.2a).

**Slot arithmetic is wall clock** (A7, DST): a slot is
`datetime.combine(day, wake_time, tz) + timedelta(hours=h)`, then `.timestamp()`, so "wake + 9 h"
is 16:00 on the clock on the day the clocks change too (zoneinfo adds to the wall clock). The
last slot is `min(that, combine(day, bedtime, tz) - 1 h)`, with `day + 1` for a bedtime at or
before the wake time (00:30). The DST rows stay in the test table (3.8).

**Due.** `sitter_due(state, now, settings)` takes the **latest slot at or before `now`**, looking
at today's and yesterday's slots (there is no "house day" window), and it is due when that slot
is later than `min(state.sitter_served, now)` and Pip is awake. Several missed slots (a long
nap, a restart) make one round, stamped with the latest slot, never a burst. A pet asleep at its
slot (a nap, or a supper slept through) is served the moment it wakes: the missed slot is still
the latest one, so the round runs at wake with that slot's threshold.

**On arrival.** If Pip is **awake** (and not an egg or resting), the round also runs once at the
moment the sitter arrives (`away` flips to true), whatever the clock says, and stamps the latest
slot at or before now (always one: yesterday's supper at worst). So a pet that left hungry is
fed at arrival. If Pip is **asleep** on arrival there is no arrival round and no stamp
(`_do_action` refuses a sleeper, and the sitter does not feed one); the due rule serves the
missed slot when it wakes. A save loaded with `away: true` counts as an arrival (3.10).

**What, in this order,** each only if needed (so a pet that is fine is never over-fed):

1. **Medicine** if `sick`: `health += MEDICINE_HEALTH`, `happiness += MEDICINE_HAPPINESS`, clears
   `sick` and `recent_misses`, event `recovered` (the same effect as `_do_action`, `model.py:2287-2296`).
2. **Clean** if `poops` is not empty (`poops = []`).
3. **Feed** if `hunger < SITTER_FEED_BELOW` (**65**; the supper round uses `SITTER_SUPPER_BELOW`,
   80, so Pip is not hungry at wake): `hunger += FEED_HUNGER` (35), `weight += WEIGHT_FEED`, and
   one `digesting` entry at exactly `now + DIGEST_MINUTES` (120 min, no jitter).
4. **Play**, a gentle one with **its own constants**, not `PLAY_*` (A1), if `happiness <
   SITTER_PLAY_BELOW` (**65**) and `energy >= PLAY_MIN_ENERGY` (15, the same gate a person's
   play has): `happiness += PLAY_HAPPINESS` (+20), `energy += SITTER_PLAY_ENERGY` (**-5**),
   `hunger += SITTER_PLAY_HUNGER` (**-2.5**), `weight += SITTER_PLAY_WEIGHT` (**-1.5**). It does not
   set `last_excite` (nobody is there to see it) and does not touch discipline.

`rates.py`: `SITTER_FEED_BELOW = 65`, `SITTER_SUPPER_BELOW = 80`, `SITTER_PLAY_BELOW = 65`,
`SITTER_PLAY_ENERGY = -5.0`, `SITTER_PLAY_HUNGER = -2.5`, `SITTER_PLAY_WEIGHT = -1.5`. There is no
energy margin on top of `PLAY_MIN_ENERGY` (the draft's `SITTER_PLAY_ENERGY_MARGIN` is gone).

**The numbers are measured** (3.2a), and one claim of the first draft is retired: "happiness falls
at most 16 between rounds" was wrong, because a play that is gated on energy is skipped exactly
when it is needed, and each full-cost play took 10 more energy. What the constants guarantee is
the table in 3.2a, which the bot (3.8) and `dev/sitter_sim.py` both check.

**Energy is not topped up.** It is the only need the sitter cannot restore, and sleep does. An
awake pet still reaches the `COLLAPSE_ENERGY` rule or the "dozes off past bedtime" rule
(`_sleep`, `model.py:1259`) as it does at home; no call is made for it (3.4). In the sim Pip is
under the "sleepy" line (30) for about a fifth of the day, in the evening: a normal mood, not a
harm. After a short night (the spring DST night is an hour short) it can collapse at about 18:30,
before supper; the supper is then served the moment it wakes (the due rule above).

### 3.2a The tuning record (A1)

`dev/sitter_sim.py` (new, a dev tool, not shipped) runs this section's round on the **real**
`model.advance` (an adult bird, `away` off so it steps; the sitter applied after each 5-minute
step; poop tidied at once; the open call dropped each step, as 3.4 does; default 07:00 wake and
23:00 bed, UTC, the pet left at 80 hunger, 80 happiness, 90 energy). Reproduce:
`python dev/sitter_sim.py --days 30`; flags set the zone, bedtime, wake time, start date and
each constant.

| run | hunger min (at wake) | happiness min | weight range (end) | "bored" steps | sick |
|---|---|---|---|---|---|
| **the first draft** (play at happiness < 55 and energy >= 35, full `PLAY_*` costs, feed < 60), 14 days | 36.4 (56.0) | **0.0** by day 4 | 43.2-52.5 (51.6) | **3590 of 4032** | 0 |
| **the tuned round**, 14 days | 44.4 (56.0) | 45.3 | 46.8-56.8 (56.0) | 0 | 0 |
| **the tuned round**, 30 days | 44.4 (56.0) | 45.3 | 46.8-56.9 (56.0, healthy) | 0 | 0 |

Over the 30-day run: 120 rounds, 90 feeds, 93 plays, health 100 throughout, no care miss,
no "hungry" step. A matrix of 15 further 30-day runs (kept in the ship's report) held
**hunger >= 41.9, happiness >= 44.7, weight 46.2-60.3** in every one: Los Angeles from 5 March
(the spring DST night) and 30 October (the autumn one), London, Sydney, cat, bedtime 22:00,
21:00, 20:30 and 19:00, wake 05:00 / 21:00, 09:30 / 23:30, 06:00 / 00:30, and starts at two
other hours. Without the bedtime clamp, the same 19:00 bedtime run goes to hunger 22.4.

What each constant fixes, found by running it:

- **Happiness**: the draft's trigger (55) and its energy gate (35) skipped the play at 16:00 and
  20:00 when energy had fallen, so happiness drained to 0. Gate at `PLAY_MIN_ENERGY`, trigger 65.
- **Weight and energy**: with the gate at 15 but the draft's trigger (55), full-cost plays and
  feed < 60, 14 days: happiness 23.7, hunger 27.7, 479 "bored" steps and weight down to 27.8 (end
  32.7). With trigger 65 and full costs the flags clear but weight still falls to 25.7 (end
  30.9) and with half the energy cost and the full weight cost it reaches 20.6 (end 24.8,
  `light`, < 25, `weight_band`, `model.py:1409`, which gives Pip the "could use a proper meal"
  reason while the sitter feeds it). So the weight cost is halved (-1.5), the energy cost is
  halved (-5) and the hunger cost is -2.5. The draft's weight sentence left out `WEIGHT_PLAY`
  altogether.
- **Hunger**: a feed threshold of 60 let a pet that skipped one round fall to about 34 just before
  breakfast on one morning after a short DST night. At 65 the floor is 41.9.
- **Limit** (R5): the slots assume an awake day of about 16 hours or less. A wake time of 02:00
  with a bedtime of 23:00 (21 awake hours) goes to hunger 28.9 and 126 "bored" steps; no such
  setting is expected, and the guide says nothing about it.

### 3.3 Poop: tidied as it happens

A meal digests about two hours after the sitter fed it, so a poop would sit up to four hours until
the next round: old poop costs health (`HEALTH_PER_OLD_POOP`, `rates.py:38`) and risks sickness
(`POOP_SICK_HAZARD`, `:137`). So while `away`, `_digest` (`model.py:1422`) **tidies a poop the
moment it would appear**: it is not added to `poops`; a `sitter_clean` log entry is written (3.6)
and a `sitter_round` event with `did: ["clean"]` is returned (3.6). The sitter is in the house all day, so
this reads true. The tidy's log row counts against the sitter's row cap (3.6), so tidying
about three times a day cannot push a person's rows out of the log (A4). The meals and games stay at set times; only the cleaning is on demand. (Open
question Q-A, section 10, offers the alternative: clean only at rounds, with sitting poops.)

### 3.4 Calls, misses, sickness, aging

- **Calls are not made while the sitter is here, and an open one is settled, not left on
  screen** (A2). `_calls` gets an `away` branch **before** the sleeping branch (which returns
  before `_call_condition` is ever checked, `model.py:1520`): no new call, no miss, no whine,
  no lonely call; the deadline of an open call slides (`call.deadline += hours * 3600`, as the
  sleeping branch does); and, on **every step, not only on arrival**, an open call whose
  condition is now false ends with `call_answered` (the awake branch's test, `model.py:1534`;
  the energy call as the sleeping branch settles it). A `happiness` call is answered by the
  sitter's play: `sitter_round` ends with `_resolve_call(state, now, events, raised=True)`, as
  `apply_action` does after a play. A real call open on arrival is therefore settled by the
  arrival round and, if the round could not fix it (a sleeper, no energy to play), by the next
  one. What stays open is a whine the option keeps (3.9) and a happiness call the sitter could
  not play for: paused with a sliding deadline, `calling` on, deadline hidden (the keep list,
  3.7), until someone is home.
- **No push for an empty house** (A2). `_wake(... "morning")` (`model.py:1336-1357`) fires
  `call_started {resumed: True}` for any call still open; while `away` it skips that event (the
  deadline is still pushed out to `RESUME_MIN_MINUTES`). So a household away gets no "Pip is
  hungry" push, at wake or otherwise, and no `care_miss` can lead to `neglect` sickness. A test
  runs a night and a morning with a call open on arrival and asserts zero `call_started`
  events of any kind.
- **Sickness stays live** as a safety net (`_sickness` runs). The paths the sitter closes are
  `neglect` (no misses), `poop` (tidied), `low_health` (no starving, no old poop). `weight`
  stays reachable only if Pip arrives already heavy: the sitter's diet and gentle play settle
  Pip's weight in the 47-57 range over 30 days in the sim (3.2a), far from `WEIGHT_HEAVY_ABOVE =
  75` and `WEIGHT_LIGHT_BELOW = 25`. If a sickness still happens, the next round gives medicine,
  and `became_sick` pushes as it does at home (honest: something went wrong).
- **Aging and growth go on**, including stage changes, an egg hatching (the `hatched` event, the
  first look stays pending for whoever opens the card first) and the next birthday. This is the
  cost of "needs decay as normal": the old "frozen, no aging" guarantee goes (docs, section 8).
- **`_give_treats`, `_learn`, `_sample`: decided** (A3). All three run during a visit.
  `_step` calls `_give_treats` itself (`model.py:1190`) with no away test inside (the test was in
  the `give_treats` wrapper, `:3759`), so once `away` reaches `_step` chore treats land during a
  visit; the wrapper loses its `away` term to match. A treat is a household chore ticked off by a
  person, `by: None` as ever, and Pip is awake and living. `_learn` counts awake hours and the
  flags in `settings.home`, which says nobody is home (no `company` hours), so nothing in it
  assumes a person. `_sample` counts a growing pet's discipline and wellbeing, which the sitter
  keeps well. A test pins each.

### 3.5 What the sitter's care is not

The sitter does **not** call `apply_action`. So it sets no `last_care_at`, opens no praise
window, earns no bond, no streak, no per-person count, no wish, no memory, no dream seed, no
`by`. (`_check_ins` and the bond code key off `{"type": "care"}` events and `care_log[0]["by"]`,
`coordinator.py:1485-1500`; the sitter writes none of them.) The upbringing and discipline
counters do not move for it either. A person's care, from the card or an automation or voice,
does everything it does at home (3.7).

**Wish credit must skip the sitter's rows** (A5). `_check_ins` (`coordinator.py:1492`) takes `by`
from `care_log[0]` for a `game_finished` event (a game win logs nothing on success, only refusals
do, `model.py:2402`). After a sitter row `care_log[0]["by"]` is `None`, so a person's game win
during a visit would grant the wish to nobody (`_grant("play", None, ...)`) instead of them: D3
("care counts as at home") makes this live where it was a rare quirk with `chore_treat` rows.
S1 reads `by` from the **newest row that has a `by`**, skipping every `by: None` row (sitter and
chore treat alike). A test: a sitter round, then a person's game win, grants the wish to that
person.

### 3.6 The log and the report

Four care-log actions, `by: None`, `result: "ok"`, written into `care_log` (`model.py:2352`) so
the card's away note and the `last_care` sensor see them: `sitter_feed`, `sitter_play`,
`sitter_clean`, `sitter_medicine`. A round that does nothing writes nothing.

**The sitter cannot fill the log** (A4). The log holds `CARE_LOG_SIZE = 20` rows (`rates.py:240`)
and a visit writes up to four rows a round plus a row per tidy (about 3 a day), i.e. up to ~9
a day: the first draft's "a quiet visit won't overflow it" counted only the rounds, and after
two days away the log would hold nothing but the sitter's rows, so the away note, `last_care.log`
and `_awayNote` would lose every person's row. So a sitter row goes in through
`_log_sitter(state, entry)`: it is inserted at the head like any row, and if the log then holds
more than `SITTER_LOG_ROWS` (8, `rates.py`) rows whose action starts with `sitter_`, the
**oldest sitter row** is removed (not the oldest row). At least 12 rows are always left for
people. The away note therefore knows about the last day or so of the sitter's care, which is
what it says. A test runs the 14-day bot after 12 people's rows and asserts all 12 survive.

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

**The keep list** (A3). The same grep that finds the gates, `grep -n away
custom_components/virtual_pet/*.py`, finds terms that **must stay**. A worker who removes "every
away term" breaks them:

- `sensor.py:135` (`call_deadline` hidden while away) and `binary_sensor.py:80` (the `deadline`
  attribute hidden while away). Both comments say it would move on every tick. Under this design
  an open call's deadline slides each step (3.4), so the attribute would change every 5 minutes
  and the recorder would log a new state each time. They stay; their comments are updated
  ("slides while the sitter is here").
- The news and react **services** (`coordinator.py:3384, :3441`), as above.
- Comments and docstrings that go stale and are only reworded: `sensor.py:332`, `model.py:918,
  :976, :1013`, `rates.py:128`.

S1 ends with that grep, and each hit is on one of three lists in the PR description: dropped
(3.7), kept (this list), or reworded. The gates table test (R1) has a row per dropped gate.

### 3.8 Determinism and tests (pytest, no Home Assistant)

The round is `model.sitter_round(state, now, settings) -> list[Event]` and
`model.sitter_due(state, now, settings) -> float | None` (the slot time). Neither reads a clock
or a random generator. Tests, in a new `tests/test_sitter.py`:

- `sitter_due`: a table of (wake time, now, `sitter_served`) to slot; a DST day (LA 2026-03-08
  and 2026-11-01, and a wake time before 03:00, where wall clock and elapsed time differ); after
  midnight; asleep; several missed slots give one; a slept-through supper is due at wake; a
  `sitter_served` in the future is clamped to now (3.10); arrival at 07:30 (before the 08:00
  slot) stamps yesterday's supper; arrival while asleep runs and stamps nothing.
- `sitter_round`: each need alone and together; thresholds on both sides; the supper
  threshold; a pet that is fine does nothing and writes no log; play refused for low energy;
  egg and resting do nothing; the same input twice gives the same output.
- `advance` with `away` true over **14 days** (a "sitter bot": no care at all; R4 says a fortnight
  away is expected and Q-C lets aging go on for any absence): **zero** `care_miss`, **zero**
  `call_started` (including `resumed`), never `sick`, health 100, no old poop, **hunger >= 36**
  and **happiness >= 35** at every step (the sim holds 44.4 and 45.3; no "hungry" or "bored"
  flag), **weight between 40 and 65 and `weight_band` healthy at every step** (the sim holds
  46.8-56.8), aging goes on, an egg hatches, and the log keeps the people's rows (3.6). Run for
  each row of (bedtime, wake, zone): 23:00 / 07:00 UTC, 22:00, 21:00, 20:30, 19:00 (the
  clamp), 00:30 / 06:00, 21:00 / 05:00, and LA across 2026-03-08 and 2026-11-01. The numbers
  come from `dev/sitter_sim.py` (3.2a); the test re-derives them, it does not copy them.
  `scripts/balance_sim.py` has bots of this kind (`responder`, `neglect`, ...); add a `sitter`
  bot so the invariant also runs in the balance sim.
- Calls: a hunger call open on arrival is fed and ends `call_answered` at the arrival round; a
  call whose need a person meets during a visit ends on the next step; a night and a morning
  with a call kept open (the whine option off) fires no `call_started`.
- `sitter_round` never reaches the bus; a person's game win during a visit grants the wish to
  that person, not nobody (3.5).
- Upgrade: a save with `away: true`, a shifted `last_updated` and no `sitter_served` loads, and
  the first `advance` after load does not replay anything (3.10); a save with `away: true` and an
  open whine is settled at load (3.10).
- `fast_forward` (3.10): after fast-forwarding a visiting pet by N hours, `sitter_served` is not
  in the future.
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
  timestamp, so `shift_times` does not move it; `_FLOATS` in `model.py:83`, range 0 to a far
  limit). **The future-stamp clamp is in `sitter_due`** (`served = min(sitter_served, now)`), not
  on load: `last_rest_refill_at` is not in `_FLOATS` (it is Optional, `model.py:708-712`) and its
  clamp is at use, in `set_resting`. Clamping at use covers a damaged save and also a clock set
  back at runtime (the `now <= last_updated` branch of `advance`, `model.py:1034-1037`).
- **`fast_forward`** (`model.py:1227`, the dev-only service) advances to now + N h, which stamps
  `sitter_served` N hours ahead, then `shift_times(-seconds)` does not move it. So `fast_forward`
  subtracts `seconds` from `sitter_served` itself, with the other times it rebases (A6).
- **Saving.** The stamp is saved with the pet's 60 s debounce (`SAVE_DELAY`); a crash in that
  window replays one round on restart: harmless, the thresholds make it a no-op for a fed pet.
- `PetState.salvage` (`model.py:860`) starts a fresh egg: `sitter_served` 0.0 is right.
- **No migration:** `from_dict` defaults it, `STORE_VERSION` stays 1.
- **Existing `away: true` saves** load as "the sitter is here". Their `last_updated` was kept
  current by the freeze, so nothing is replayed; the first `advance` runs live. A
  `lights_before_away` left in an old save is applied once on load
  (`settle_legacy_lights`, a call to the `come_home` body) and cleared; the field itself stays
  (always `None` from now), no save change. The same function treats `away: true` at load as an
  arrival (A8): a fussy whine the pet left with is settled by the option (3.9) or paused, and an
  open call is settled like any (3.4), instead of staying open with no arrival ever having
  flipped it. That settling runs on every load. The arrival **round** runs only for an old save
  (`sitter_served` 0.0, "once": the first load stamps the slot) or when `sitter_due` says a slot
  is due (the restart came after a slot); a reload or restart inside a served slot adds no round
  (S1 audit P2: it used to run a free feed and play on every load).
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
| `sensor.last_care` state (`care_log[0].at`, `sensor.py:353`) | moves at each round, either way (see below) | same |
| debug sensor flags | masked (as built, `sensor.py:391`) | real |
| events `virtual_pet_went_away` / `came_home` | fired as built (never gated by privacy, `coordinator.py:961`) | same |
| any new bus event for the sitter's rounds | **none** (the rounds go to cards by the channel only) | none |
| the pet's own events during a visit (`virtual_pet_fell_asleep`, `woke_up`, `found`, `wish_made`, ...), `last_care.moments`, the mood sensor's `requests` attribute | **real**: a living pet's events and moments fire, beside a mood of `asleep` (S1 audit N1; inside the privacy bar, nothing leaves the household, no free text) | same |
| notifications | the same as at home; calls don't fire (3.4); `became_sick`, `hatched` and stage changes do | same |
| Assist, "how is Pip" | "asleep" (as built, `intent.py:261`) | "with the sitter" (draft, 9) |
| Assist, a care command | refused "asleep" (**new in S1**: the intent checks `away and privacy` itself, 5.2; today the refusal comes from `coordinator.py:3096`, which S1 deletes) | works |
| `virtual_pet.news` / `react` services | refused `asleep` (as built, `:3384, :3441`) | refused `away` |
| the card (every card, shared screens too) | **the sitter, the real mood, care and play on** | same |
| the private channel | the `house.sitter` view (5.3), sent to every watcher, shared screens too | same |

**What the privacy-ON row set means** (A9). With privacy ON the mood sensor says `asleep` and
`binary_sensor.asleep` is on while the numeric sensors move and `last_care` jumps at set times:
an observer of the recorder can see a pet that is "asleep" being fed at 08:00, 12:00, 16:00 and
20:00. That is decided (D1, Q-B) and inside the AGENTS.md privacy bar (nothing leaves the
household; the free-text rule is untouched), so there is nothing to change; the guide says it
once. One consequence worth a line there: `sensor.last_care`'s state is the newest row's time, so
the sitter's rows reset an automation's "nobody has fed Pip for N hours" timer. An automation
that wants people only reads `last_care.log` and `by`.

### 5.2 The care front doors

`model.apply_action` no longer refuses `away`, so the privacy mapping has nothing to remap
(`coordinator.py:3096, :3186, :3248` become dead code; S1 removes them). The card, a button
entity, an automation and a service call all reach the same `async_action`, so **they all work
during a visit, privacy on or off**: the server cannot tell the card from an automation, and S1
does not try. The one door that is not the card is Assist: S1 adds the check to
`intent.py` (the care-command path, `intent.py:327`; **today the intent has no such check**, the
refusal comes from `coordinator.py:3096`, which S1 deletes). It refuses `asleep` when `away and
privacy`, so a voice command cannot be used to find out the house is empty, and the answer sounds
the same as for a sleeping pet. (If the owner wants buttons and
services held back too, that is Q-B, section 10.)

### 5.3 The new channel field

`_house_view` gains `sitter`: `None` when nobody is away, otherwise

```
{"mood": "hungry", "key": "hungry", "reason": "...", "reason_key": "hungry",
 "flags": ["away", ...], "asleep": false, "lights_out": false,
 "last": {"at": 1730700000.0, "did": ["feed"]}}
```

`mood`, `key`, `reason`, `reason_key` and `flags` come from `model.mood_keyed` **without the
privacy mask and with the away flag but not the away mood** (a new `model.real_mood` that skips
`"away"` in `MOODS`); the card draws that mood, so the sitter's Pip is happy, hungry or sleepy
like any Pip. `reason` and `reason_key` are in the view because the card reads them from the mood
sensor's attributes (the speech bubble in `card-tick`, the status page in `card-status`), and
with privacy ON the sensor says `reason: "zzz"`, `reason_key: "asleep"` (`coordinator.py:464-469`)
(B2). `requests` is already unmasked on the sensor, and `call_deadline` stays hidden (3.7). `last` is the
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

**One override, in the accessor** (B2). The card reads `sensor.mood` and `binary_sensor.asleep`
through `this._state(s, key)` in at least nine places (`card-actions.js:120`, `card-care.js:622`,
`card-layout.js:529`, `card-looks.js:7, :477`, `card-moment.js:417, :499`, `card-status.js:100`,
`card-tick.js:58`). A swap only in `_update` would leave the rest reading the masked sensors:
with privacy ON the medicine scene's "sick" flag (`card-moment.js:417`), `_sceneKey`'s weather
flags (`card-care.js:622`) and the status page would be wrong during a visit, which contradicts D1
("every card shows the sitter and allows care, privacy on or off"). So S2 changes **`_state`**
(`card-build.js:925`, which already has a `held` override for scenes): when `s.house.sitter` is
set it answers `sensor.mood` (state, `flags`, `reason`, `reason_key`) and `binary_sensor.asleep`
from the view, and every read site follows without being touched. `_update` then uses
`s.sitter = view`, `away = false` for the old purposes (the pet is drawn, the buttons enabled,
the game kept, `_say` speaks), and `mood` / `asleep` / `flags` from the view.

**The channel handler redraws** (B3). `_channel` (`card-base.js:317-340`) handles `house` by
calling `_powerNews`, `_basketSync` and `_dirSync` and does **not** call `_update`. The sensors
and the channel push at the same coordinator update but reach the browser as two messages; if the
sensors come first the card would draw once without `sitter` and nothing would redraw it. So S2
adds: when `house.sitter` changes (compared as JSON, old against new), the channel handler calls
`_update`. A missing `sitter` key means an older server and is read as `None`, as the code treats
`visit` ("Always present (None...)"). When the channel has not yet answered (the first render),
the card draws as at home from the sensors and corrects at the first snapshot, which now does
redraw (no flash of the sign).

**The fallback draws no sign** (B4). If the card has no channel (it is not subscribed) it reads
the sensors as built. After S2, with privacy off `mood.state === "away"` is read as "the sitter is
here, the real mood is not available": the card draws the **sitter beside Pip in the generic
`content` mood, no sign** (D5 retires it; S4 deletes `props.away`), the buttons on. With privacy
on it sees a napping Pip and no sitter: the only case where privacy on hides the sitter from a
card. S2 draws and tests both.

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
sitter (9). **With privacy ON the card cannot name the sitter in the note** (B6): the
rows are mapped to plain `feed` / `play` (5.1), so the note says "had a meal" while the card on
screen shows the sitter. Whether to carry the visit's tallies on the channel so the note can say
"the sitter fed me" with privacy ON is Q-E, section 10; until it is answered S3 builds the plain
wording. The note is the card's own, on a card inside the household, so the "echoes" of the
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

- `rates.py`: `SITTER_ROUNDS_HOURS`, `SITTER_SUPPER_BEFORE_BED_HOURS`, `SITTER_FEED_BELOW`,
  `SITTER_SUPPER_BELOW`, `SITTER_PLAY_BELOW`, `SITTER_PLAY_ENERGY`, `SITTER_PLAY_HUNGER`,
  `SITTER_PLAY_WEIGHT`, `SITTER_LOG_ROWS` (values: 3.2, 3.6).
- `model.py`: `sitter_served`; `sitter_due` (the clamp is here), `sitter_round`, `sitter_arrives`
  (settle the whine by the option, run the round if awake, settle calls); `advance` away branch to
  `_step` (resting tested first); `_step` calls the sitter after the egg return, between `_digest`
  and `_sickness`; `_digest` tidies when away; `_calls` gets its away branch before the sleeping
  one (3.4); `_wake` skips the resumed `call_started` while away; `_log_sitter` (3.6); the
  `_do_action` / `_refuse_play` / `drop_game` away terms removed; the other gates (3.7, with the
  keep list); `give_treats` loses its away term; `set_lights_out` loses the away branch;
  `real_mood`; `settle_legacy_lights` (also runs `sitter_arrives` for `away: true`: the round only for an old save or a due slot, 3.10);
  `fast_forward` rebases `sitter_served`; `MOOD_REASONS["away"]` = "the sitter's here"; the four
  log actions.
- `coordinator.py`: `_sense_home` stops dropping the game, calls `sitter_arrives` on the flip,
  takes `sitter_round` out of the event list before `_fire` (3.6), `settle_legacy_lights` at load;
  the gates in 3.7; the dead privacy mappings removed; `_check_ins` reads `by` from the newest
  row that has one (3.5); the channel `house.sitter` (5.3) and its diff; the `last_care` log
  mapping (5.1, in `sensor.py`).
- `sensor.py:135` and `binary_sensor.py:80` **stay** (3.7); their comments change.
- `intent.py`: the Assist gate (5.2, new) and the words (9).
- `strings.json` / `translations/en.json`: the people-page text (9); the strings that name the
  sitter: `strings.json:91, :100, :101, :273` (the last is the `away` mood label); `:62` is
  still true.
- Docs (C3): `docs/guide.md:615-622` (the options table), `:586` and `:807` (the lights and
  resting lines that name the sitter; `:807` says "the sitter's freeze wins while it lasts; resting
  carries on", and this plan flips the order, so the sentence is wrong), the privacy line of 5.1's
  last-care note, `docs/features.md:41-42` and `:228` (the options list "off to the sitter's"),
  `docs/HANDOFF.md:446`, README line 97. (`guide.md:1232`, the events list, is unchanged.)
- Tests: section 3.8, plus `test_home` (presence flip, the whine option), `test_channel`
  (snapshot, diff, shared screen), `test_assist` (privacy on and off), `test_init` (the strings,
  21 hits), `test_resting` (resting beats the sitter), the gates table, `balance_sim` bot. **The
  tests that pin the old behaviour change too** (B5): `tests/test_model.py:105, :216, :377, :917,
  :1436, :1448, :2059, :3085`, `test_resting.py:420-438, :632`, `test_finds.py:415-463`,
  `test_gifts.py:179`, `test_doorbell.py:307`, `test_open_on.py:340-372`, `test_react.py:247,
  :264`. S1 greps `away` in `tests/` and lists every hit it changes.
- `dev/sitter_sim.py` (from this plan's revision) stays as the tuning tool; the bot test and the
  sim must agree when a constant changes.

**The card in S1** is unchanged and still reads the sensors. S1 keeps the `away` mood value on
the sensor (privacy off), so the old card keeps drawing the sign and the hidden pet with the
buttons off; with privacy on it sees a napping Pip with `binary_sensor.asleep` on **and the care
buttons enabled**: pressing Feed now succeeds (before, S1's mapping refused it as "asleep"), and
the old card's reaction to an ok on a pet it thinks is asleep is untested (B7), so card-check
gets one line for it (device queue). Neither is wrong, only stale: the server looks after Pip
either way. The new view reaches the card in S2.

**Acceptance:** section 3.8's tests green; `pytest` in full; `ruff`; the **14-day** sitter bot
shows the invariants, weight band included, for each (bedtime, wake, zone) row; `dev/sitter_sim.py
--days 30` still prints the numbers in 3.2a; a save with `away: true` from the main branch loads
and runs; the privacy table (5.1) is a test (one parametrised test, ON and OFF, per row that a
test can reach); and one **end-to-end test** drives the real path: a zone with nobody in it for
`away_after` -> `_sense_home` -> `sitter_arrives` -> the channel's `house.sitter` -> the zone
refilled -> the sitter gone (C2). `test_home` ("presence flip") with a patched zone is where it
lives.

**Device queue (S1):** none for a phone; this is server-only. The full gate runs (`scripts/ci-gate`),
since server code is in the diff and `pick-sections` would pick `all`. The real-stack check
(C2): `dev/config/configuration.yaml` has no person and no zone, and the zone count comes from
`watcher.people_home` (`watcher.py:408`), so in a throwaway HA via `scripts/gate` set the
zone's count with `hass.states.set` on the zone entity (or add a template sensor to the scratch
config), set `away_after` to the minimum in the dev options, see the sitter round fire
(`last_care` log), then put the count back. If that proves fiddly, the real-stack line is
`test_home` with a patched zone and the throwaway HA is not needed for it. Card-check:
the sections that exist (`node scripts/card-check.js --list`) and that hold the old `away`
checks are `care`, `react`, `pat`, `channel` and `restart` (the old `away` section was never a
name; **C1**): they must pass unchanged, or `scripts/gate --auto` picks them. One added line (B7):
privacy ON, the old card on a visiting pet, a Feed press ends ok and the card does not break.

### S2. The card (placeholder). Tier 1.

- The card reads `house.sitter` (6.1): `_state` (`card-build.js:925`) answers the mood and asleep
  keys from the view, the `_channel` handler calls `_update` when `house.sitter` changes
  (`card-base.js:317-340`); draws Pip, the real mood, the buttons on; a **placeholder sitter** (a
  CSS/inline shape or the existing `sitter_sign` frame at pet scale, so the layout and the label
  are right before the art lands); the label "sitter's here"; the sign is not drawn, also in the
  no-channel fallback (6.1).
- The `away` terms in the card (B1; the grep is `grep -n away src/card/*.js`):
  - `card-layout.js:537-738` (`away` and the sign, the game end `:681`, the buttons `:700, :720`,
    the request chip `:709`, `_say` `:737-738`) become sitter terms;
  - `card-actions.js:123`, `card-board.js:71`, `card-games.js:22`;
  - `card-looks.js:7-8` (the first look) **and `:477-478`** (`_giftReturn`, the gift-after-return
    gate);
  - `card-status.js:105` (`moodNow?.state === "away"`, "would like most") **and `:119`**
    (`restNow`);
  - `card-tick.js:61` (`this._say(s, mood, mood?.state === "away")`);
  - readers of `s.away` that need only the `_update` change: `card-tick.js:436, :658, :801`,
    `card-visitors.js:62, :100, :110, :357`.
  - Strings that become false: `lines.js:15` (REFUSALS `away`: unreachable after S1, delete it, no
    new line), `ui-copy.js:549-551` (`restLabel`: drop its `away` terms, so a resting pet under the
    sitter shows the resting label as 3.1 says; the comment above it about "the sitter's sign"
    goes), `ui-copy.js:623` (a comment, "ageing pauses while it's away": reword the comment).
    None needs a new line of copy.
- Bench: a `sitter` state in `scripts/bench.js` (and the `ui` preset), pinned by flags
  (`--sitter day|night`).
- JS tests: `card-source` regex tests that pin the away terms change with them
  (`care_reactions.test.js:83, :110, :186, :475, :1208`, `motion_ship1.test.js:46-48`,
  `hop_settle.test.js:51`) **and `tests/js/resting_lines.test.js:52-66`**, which greps `_update` for
  the `if (away) {...} else {...}` branch and `awaysign, sp.props?.away`, both of which S2
  rewrites. `scripts/card-check.js` has `away` flags and the `["away", "i'm at the sitter's!"]`
  refusal line at `:5014, :11585, :11985, :12067, :12396, :12429`; they change with S2.
- Docs: how-to-play page and the guide's card section.

**Acceptance:** bench shots of day, night, calling-not-possible, a game running, a shared
screen, privacy ON and OFF (identical on the card), three species and an egg; `motion_rule` green;
the degraded case (6.1) drawn: no channel with privacy off (sitter in the generic mood, no sign)
and with privacy on (napping Pip); a card whose sensors arrive before the channel redraws when the
channel arrives.

**Device queue (S2):** the bench presets `ui` and `shells` plus the sitter shots above. Real HA
only for the behaviour: card-check via `scripts/gate --auto`, which picks from the diff;
the sections to add by hand with `--only` are `care,react,pat,channel,restart` (C1: there is no
`away` section; `node scripts/card-check.js --list` prints the names), and one check that a
shared-screen card (`shared: true`) shows the sitter with privacy ON. No full gate.

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

Owner 2026-11-04: more pose variety. Beyond the 14 poses, about 6 extra idles at 2 frames
each (stretching, sipping tea, knitting or reading a book, watering a plant, looking out of
the window, tidying a shelf, phone or notebook, laughing), drawn after the core poses.

Owner 2026-11-04: a different sitter for each of the 24 shell finishes
(`rates.py` `SHELL_FINISHES`). One base body serves every pose, built so a look layer (hair,
skin tone, outfit, colours, one shell-themed accessory) swaps over the same poses; 24 look
sheets, one per finish, each a distinct person.

Owner 2026-11-04 (later, not A1): five fully redrawn sitters, one per world shell
(woodland, aqua, grove, celestial, dune).

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
- R5. **Tuning is measured, with one limit.** The constants are the first set that held every
  line of 3.2a on the real model, and `dev/sitter_sim.py` re-runs it when one changes. The
  slots assume an awake day of about 16 hours or less (3.2a, "Limit"); a wrong number shows up
  as a "hungry" or "bored" flag, not as harm. Pip is also "sleepy" in the evening (energy is not
  topped up), which is a normal mood.
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


- **Q-E. The away note with privacy ON (new, from the review, B6).** With privacy ON the
  log rows reach the card as plain `feed` / `play` (5.1), so the "while you were out" note says
  "had a meal" while the card on screen shows the sitter. Recommended: **accept the plain
  wording** (no new surface; the sitter is on screen anyway). Alternative: carry the visit's
  tallies on `house.sitter` (for example `did` counts since the last person was home) so the
  note can use the approved "the sitter fed me" lines with privacy ON too. It does not block S1
  or S2; S3 builds the plain wording until it is answered.

**Answered 2026-11-04** (owner Q-A, Q-C; first mate Q-B, Q-D as recommended, low risk):
- Q-A: poop is **tidied the moment it happens** during a visit (owner).
- Q-B: buttons and services **work during a visit** under privacy on; only Assist refuses (FM).
- Q-C: aging **goes on** during any absence; the guide drops "frozen" (owner).
- Q-D: the `mood` sensor **keeps the value `away`** with privacy off (FM).
- Section 9 copy: **approved by the first mate** as drafted (D6). Workers ship those lines verbatim.
- The review's fixes (section 12) change numbers, rules and file lists only. They add **no copy**;
  Q-E: **accept the plain wording** with privacy on (FM, as recommended, 2026-11-04). No open items.

## 11. What the scout got wrong (checked against the code)

The scout's file and line claims were checked one by one. Right: the `model.py` lines for
`away` (`:585, :702, :704, :1049, :2227, :2572, :2859, :3124, :3812-3830, :3881, :3953`),
the `coordinator.py` lines (`:464, :911-962, :1018, :1272, :1645, :3096, :3186, :3248, :3384,
:3441`), `home.py:334-374`, `rates.py:335`, `watcher.py:408`, `intent.py:36, :83`, and the doc lines
(features `:41-42`, guide `:615-622, :807`). Wrong or incomplete:

- **`card-status.js:105`** and **`card-looks.js:478`**: the first version of this section said
  neither has an `away` term and that the gate list was section 2's. **That was wrong** (review
  B1). Both have one: `card-looks.js:477-478` (`_giftReturn`) and `:7-8`, `card-status.js:105`
  (`moodNow?.state === "away"`) and `:119` (`restNow`), and so do `card-tick.js:61` (`_say`) and
  the `s.away` readers in `card-tick`, `card-visitors` and `card-games`. The complete list is
  S2's file list (section 7).
- **Missed:** `card-games.js:22` (the ball prop), `binary_sensor.py:63-71` (the masked asleep),
  `model.py:1149` (`react`), `model.py:2044` (`can_lay_egg`), `coordinator.py:2522, :2540`.
- **The design itself:** the scout's "Resting step, frozen" is replaced by owner decision D2.
  Its claim that care "needs no change" was right for the care scenes, but its plan to let the
  card read the unmasked state was missing: with privacy on the card has no way to see the real
  mood (it reads the masked sensors), which is why section 5.3's channel field exists.
- **Its slice order** (S1+S2 together) is no longer needed: S1 here keeps the sensor value `away`
  for privacy OFF, so the old card is merely stale, not broken, until S2.
- **The scout's save claim** ("no new key") changes to one additive float, `sitter_served`.

## 12. Review fixes (adversarial review of 2026-11-04, worker s2883)

Every finding in `hatch-at-home-s2883/report.md`, and where this revision addresses it. The
owner decisions D1-D6 and the answers Q-A to Q-D are unchanged, as is the approved copy.

| finding | what | where fixed |
|---|---|---|
| A1 | The tuning failed on the real model; the play rule starved happiness | 3.2 (own constants, gate at `PLAY_MIN_ENERGY`, trigger 65, feed 65, bedtime clamp); 3.2a (the record: numbers and runs); 3.4 (weight sentence); 3.8 (14-day bot with a weight band); `dev/sitter_sim.py`; R5 |
| A2 | A stale call stays on screen; a push at wake | 3.4 (the away branch of `_calls` settles every step; `_wake` skips the resumed push); 3.8 (call tests) |
| A3 | Terms to keep; `_give_treats`, `_learn`, `_sample` undecided; `intent.py:327` | 3.7 (the keep list: `sensor.py:135`, `binary_sensor.py:80`); 3.4 (the three decided); 5.1, 5.2 ("new in S1"); S1 list |
| A4 | The care log fills with the sitter's rows | 3.6 (`_log_sitter`, `SITTER_LOG_ROWS`); 3.3; 3.8 (the 12 people's rows survive) |
| A5 | Wish credit after a sitter row | 3.5 (read `by` from the newest row that has one); 3.8 |
| A6 | `sitter_served` details | 3.10 (the clamp in `sitter_due`, `fast_forward` rebases, the save debounce, `salvage`) |
| A7 | Spec gaps in 3.2 | 3.2 (asleep on arrival; "latest slot at or before now"; wall-clock slot arithmetic; the bedtime clamp); 3.8 (DST and bedtime rows) |
| A8 | A fresh `away: true` save gets no arrival | 3.10 (`settle_legacy_lights` runs `sitter_arrives`) |
| A9 | Privacy-ON sensors | 5.1 (a row and the paragraph under the table); the guide line is in the S1 docs |
| B1 | Section 11's card correction was wrong | Section 11; S2 file list |
| B2 | One override, not many | 6.1 (`_state` in `card-build.js:925`); 5.3 (`reason`, `reason_key`) |
| B3 | No redraw on a channel-only change | 6.1 (the `_channel` handler calls `_update`; a missing key is `None`); S2 acceptance |
| B4 | The fallback drew the retired sign | 6.1 (sitter in the generic mood, no sign); S2 acceptance |
| B5 | Test lists incomplete | S1 list (Python tests), S2 list (`resting_lines.test.js`, `card-check.js` lines) |
| B6 | Away note vs D1 | 6.5; Q-E (a question, no new copy) |
| B7 | Old card with privacy ON during S1 | S1 "The card in S1"; S1 device queue (one added line) |
| C1 | "Card-check section `away`" does not exist | S1 and S2 device queues (`care,react,pat,channel,restart`, or `gate --auto`) |
| C2 | The device queue's person entity; no end-to-end test | S1 acceptance (end-to-end test in `test_home`); S1 device queue |
| C3 | Docs list misses | S1 docs list (`guide.md:807`, `features.md:228`, `HANDOFF.md:446`, `strings.json:91, :100, :101, :273`) |

Also: the review's open question 1 (a gentle sitter play, or a lower happiness floor) is
answered in the plan as a gentle play with its own constants, since the brief for this revision
asked for it; no owner decision is changed by it. Question 2 is Q-E.

## S1 audit 2026-11-04

S1 audit 2026-11-04: player-impact 2 (fixed in this branch), save 0, nits 7.

- **P1 (fixed):** `_sitter_slot` raised for a wake time of 23:01 to 23:59 around midnight; it now
  looks back to the day before yesterday, so there is always a slot. Test rows: wake 23:30 at
  00:10, wake 23:01 at 00:00, and others.
- **P2 (fixed):** a reload or restart during a visit ran a free round; see 3.10.
- **N1:** the private visit's events are listed in the 5.1 table. **N7:** 3.10 says what the code
  does, and the guide's restart sentence is true again.
- **Known, no code (N2 to N6):** N2 the `by` guess still takes the newest non-nobody row, which
  can be someone else's when the winner has none (as A5, no regression). N3 discipline still
  falls during a visit (0.25 per awake hour); the sitter keeps Pip well, not schooled. N4 energy
  ends each evening near zero and Pip may fall asleep where it is; no health cost seen. N5 a wake
  time inside a spring-forward gap puts breakfast an hour late. N6 until S2 the card still draws
  the old away look and disables the buttons, so S1 should not ship alone in a release.
