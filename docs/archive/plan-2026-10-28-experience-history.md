# Experience plan: history (archived 2026-10-30)

Moved out of `docs/plan-2026-10-28-experience.md` to cut what each worker reads.
Waves 0 and 1 shipped (PRs 0a-0h, 1a-1c), with the Wave 0 audit folded in. Read-only.

### Wave 0: balance (first)

From the balance audit, the owner's decisions on it (2026-10-28) and **Wave 0's own
adversarial audit** (27 findings, 9 high; all folded in here, and its table, "The Wave 0
audit (27 findings) and what changed" near the end of this plan, wins). **Line numbers
in Wave 0 are for main at `8904a0a`** (0.35.0: privacy P1 is merged), not `afd56b9`.

**Draft 3's rules and numbers are prototyped.** Everything in 0a-0g below was built in a
scratch copy of the package (not in this PR) and `scripts/balance_sim.py --check` was run
against it (`BALANCE_SIM_ROOT=<copy>`): **every band passes on all 10 seeds**, the
exploits included. On main the same check fails 161 bands. The builders start from these
numbers, and the sim decides. The prototype's diff, its patch script and the sim output
are in the crew worker's evidence folder
(`~/.local/state/crew/workers/hatch-at-home-s2444/evidence/`).

Every PR here:

- runs `scripts/balance_sim.py --check` (`.venv/bin/python`, 10 seeds, about 8 s). Its
  **Done includes the 14-day simulation** of every strategy in `STRATEGIES`: careful
  (also with card games), casual (also with card games), twice a day, neglect,
  responder, responder who praises, responder who misses a call a day, and the exploits
  (launder, sleeper, praise_bot, care_bot, launder + praise, walking away from games,
  rerolling openings, praise spam, fast-forward, a scrappy adult's whines). Each PR
  names the bands it must turn green, and **no band that passed before may fail
  after**. The tuned numbers go in `rates.py` with a one-line comment naming the sim;
- keeps the strategies honest: they decide from what a person can see (the meters and
  the call as the sensors show it), so once C3 lands a careful player sometimes scolds a
  real call, as a person would. A PR that changes what a strategy can see updates the
  strategy in the same PR;
- adds pytest cases for the rule itself (the sim is the balance check, not the unit
  test).

**Order (finding 21):** 0a → 0c → 0d, then 0b (after the owner picks how re-calls
notify) and 0f, then **0e last**. 0g and 0h go any time. Nothing waits on privacy P1
any more (merged), so 0b, 0e and 0f use its validation helpers directly. 0e is last
because it is tuned against how many calls are missed (0a-0d) and against discipline,
which 0f moves (a game spoils a whine, -10). C2's praise farm is closed in 0e, since
praise is half of how discipline is earned.

**PR 0a: sleep pauses calls; naps need tiredness (C1, minor 5).** Size **S-M**, tier 1
(no saved field).
- **Owner: pause.** `_fall_asleep` (model 767-789) keeps `state.call`, every reason,
  the energy call and a whine included: no `_unlatch`, no `state.call = None`. While
  asleep, `_calls` (936) pushes the open call's `deadline` back by the step (`hours`)
  before it returns (947).
- **An energy call is answered only by real rest (finding 26):** while asleep, once
  energy is above its re-arm level (40, `CALL_THRESHOLDS`), or at a natural wake
  (`_wake` how `morning` or `rested`). A hand wake before that (`lights`, `night`)
  leaves it open with its paused time, so lights out and on at once no longer answers
  it. (Today sleep answers it at once, 782-788, and the next tick calls again: 686
  laundered energy calls in 14 days in the audit's prototype.)
- **A natural wake (finding 1):** a paused call gets at least `RESUME_MIN_MINUTES` (10)
  left. At the **morning** wake it is also sent again: a `call_started` with
  `resumed: true` (it went off the phones when it fell asleep: `fell_asleep` is in
  `CALL_OVER_EVENTS`, notify 84-93), as a normal push, not a time-sensitive one. The
  end of a nap gives the 10 minutes but sends nothing: re-sending at every nap's end
  sent 10 pings a day to a pet kept napping (the sim's `sleeper`). A hand wake gives
  neither: a top-up there would let lights out and on refill any call's window.
- **While asleep a paused call doesn't show as asking (finding 14):** the `calling`
  binary sensor is `call is not None and not asleep` (binary_sensor 36); it has no
  `deadline` attribute while asleep (77-87: today it is skipped only while away; it is
  already in `_unrecorded_attributes`, 59, so this is about a state write every tick,
  not recorder history); `mood_keyed` drops the `calling` flag while asleep; the card's
  attention art stays off.
- **Owner: a nap only when tired or near bedtime.** `set_lights_out(on)` (2056) outside
  sleep hours refuses unless `energy < NAP_WAKE_ENERGY` (95) or
  `minutes_to_bedtime <= NAP_INTO_NIGHT_MINUTES` (60). The check sits in `_apply_lights`
  (2087), so a flip made while away is checked when `come_home` applies it (finding
  16). `set_lights_out` sets `lights_out` before it calls `_apply_lights`, so a refusal
  resets `lights_out` to off and `_apply_lights` returns `not_sleepy` for the caller to
  pass on. A flip refused at `come_home` is dropped silently (nobody is there to hear
  it): the pet comes home awake. An egg put to bed still sleeps on hatching (accepted: a hatchling is tired).
  The pause, not the gate, closes the laundering exploit; the gate stops a rested pet
  being put down for nothing.
- **Refusal (finding 15):** a refusal writes the `care_log` entry
  `{"action": "lights_out", "result": "not_sleepy"}` and a `care` event, so the card's
  `_react` says W1; `coordinator.async_set_lights_out` (1870) returns the result;
  Assist (intent 229-231, which today sets `OK` whatever happens) answers with it, and
  `REFUSED` (64) gets `not_sleepy` (copy W3). The switch snaps back to off. The
  notification's Lights out button only shows on an energy call (energy < 20), so it is
  never refused.
- **Minor 5:** `switch.py` `is_on` (31-32) reads `asleep`, not `lights_out`, so a pet
  that dozed, collapsed or was put to bed by the house shows on, and a refused nap
  snaps back to off. Pressing off on a sleeping pet still wakes it.
- **Tests:** pytest: a hunger call open at lights-out is open on waking with the same
  time left; a call paused with 1 minute left gets 10 minutes and one `call_started`
  (`resumed`) at the morning wake, 10 minutes and none at a nap's end, and neither on a
  hand wake; an energy call stays open through an immediate hand wake and is answered
  once energy passes 40 asleep; `calling` is off while asleep, with no `deadline`
  attribute and no `calling` flag; lights-out at energy 100 at 10:00 returns
  `not_sleepy` (and is logged) and the pet stays awake, also when flipped while away;
  at energy 50 it naps; at 22:30 it sleeps whatever the energy; the switch is on while
  dozed; Assist says W3.
- **Sim Done:** `launder` scrappy with no fewer energy misses than `neglect` (prototype:
  score 13.6, 14 energy misses each); `sleeper` pushes drop from 123 a day on main to
  under 1 (0.3-0.4) and its grade does not rise; careful and responder unchanged or
  better. **`sleeper` scrappy (17.5) moves to 0e's Sim Done:** on 0a alone sleeper is
  steady 57.4 (main: steady 70), because each need latches after one miss (3 misses)
  and scrappy needs at least 5; it needs 0b's re-calls plus 0e's score.

**PR 0b: a missed call can call again (M2).** Size **S-M**, tier 2 (saved fields).
**The owner picked (c), bundled, for how re-calls notify** (Wave 0 Q1, evaluated below). The
decisions file's earlier line "sends one phone notification per re-call" is superseded.
Poop (`dirty`) calls send no push (owner, Wave 0 Q4); that change lands here too.
- A latched reason may call again `RECALL_HOURS` (4) after its miss, while its
  condition still holds. **One clock per pet (finding 2):** at most one re-call per
  `RECALL_HOURS` per pet, for the latched need **waiting longest** (oldest
  `latched_at`; a tie goes to the most urgent, `CALL_PRIORITY`), so every latched need
  gets its turn (first mate, 0b audit finding 5: most urgent first starved the third
  need). A missed
  re-call is **not** another care miss: it re-latches for another `RECALL_HOURS`. One
  neglect stays one miss; the pet keeps asking on the card and the sensors.
- **Telling a re-call apart (finding 17):** `latched_at[reason]` is kept until the
  reason re-arms; a call started from a latched reason is a re-call, and `Call` gets a
  `recall` field (P1 builds `Call` field by field, model 404-410; add it there). P1 has
  `_str_map` and `_int_map` (129-135) but no float map: add `_float_map`.
- **Its phone ping** follows the owner's Q1 pick. Whatever the pick, a re-call is a
  **normal push, not a time-sensitive one** (notify `send` level; the "Pet calls"
  channel is for first calls).
- **One ping per sickness:** today a pet that falls ill sends `became_sick` and then,
  in the same tick, a `sick` call: two pushes for one event (about 0.8 a pet a day for a
  casual player, 1.5 for twice a day). A `sick` call started in the same tick as
  `became_sick` sends nothing more.
- Sick: the same rule (a sick pet asks for medicine every 4 h until cured).
- **Saved:** `latched_at: dict[str, float]`, `last_recall_at`, `Call.recall`, validated
  with P1's helpers. `from_dict` gives an existing latch `latched_at = now`, so an old
  latch may re-call 4 h after the update: **the release notes say so** (households with
  latched needs get a first round of re-calls). `shift_times` (556) shifts both times.
- **Tests:** pytest: a missed hunger call re-calls after 4 h if still hungry, not
  before; two latched needs re-call 4 h apart, the longest waiting first; missing the
  re-call doesn't add to `care_misses`; a re-call event carries `recall: true`; a
  sickness sends one push; an old save loads with `latched_at` filled.
- **Sim Done:** `responder_miss1` min health ≥ 20 and steady (prototype: 57-76, steady
  66-76; main: 1); **calls started per pet per day** (the sim's `notify_day`: every
  `call_started` and `became_sick`, which is what option (a) would push, not the pushes
  under (b)-(d)): careful ≤ 4 (1.8-2.7), casual ≤ 6 (4.2-5.5), neglect and sleeper ≤ 6.5
  (6.0-6.2, 4.1-4.3). `--notify` prints the house push table below; the owner's pick
  sets its target.
- **Re-read against 0a, 0c and 0d (the 0b builder, 2026-10-28):** one assumption broke.
  `responder_miss1` **steady** needs 0e's score: on 0a-0d the score is still
  `0.7 × (100 − 6 × misses) + 0.3 × discipline`, and its 10-14 misses make it scrappy
  (11-31) with or without re-calls, as `casual` is. 0b turns its **min health** green
  (54-78, was 1 on all 10 seeds); **steady** stays in 0e's Sim Done, which already lists
  it (66-76). As built: a re-call keeps its reason latched while it is open, so
  answering it without passing the re-arm level leaves it latched (no fresh first call,
  so no new miss); a missed re-call fires `call_expired` (`recall: true`, not a moment
  on the card); `recall` is on an event only when true, so first calls are unchanged on
  the bus. `--notify` gains a `0b` column: (c) plus no poop pushes and one push per
  sickness, the pushes a person really gets.
- **Release-notes line (drafted by the 0b builder; the owner approves the words):**
  "A need left unanswered now asks again every 4 hours while it lasts, in one quiet
  notification for all your pets; poop calls stay on the card, and falling ill sends one
  notification, not two. If a pet already had a need left unanswered before this
  update, expect one round of these reminders about 4 hours after updating."
- **After the tier-2 audit (fixes on the 0b branch, 2026-10-28):** the bundle names, when
  sent, every pet of that person's still asking (a latched need that still holds, poop
  aside), not only pets whose 20-minute re-call is open, and clears once none of them is
  (finding 1: two neglected pets' re-calls share the person's 4-hour cycle, so only the
  first was ever named). Re-calls go longest waiting first (finding 5). The coordinator
  remembers a sickness already on the phones (`became_sick` until `recovered` or asleep),
  so a hand wake also sends one push (finding 2). Setup clears each subscriber's bundle
  left from before a restart (finding 4); removing the last pet clears it too (finding
  10); `from_dict` clamps `latched_at` and `last_recall_at` to `last_updated` (finding
  8). The guide's Calls and notification paragraphs say a need asks again.

**Wave 0 Q1: how should re-calls reach phones? (evaluated for the owner)**

`balance_sim.py --notify` raises houses of 1, 2 and 4 pets, each pet its own seed,
everyone in the house playing the same way, and counts the pushes **one person with
"notify me" on** gets per day of childhood (14 days; calls only happen while the pet is
awake, so this is per waking day). Mean over 10 houses; the range was within
about ±1 of it everywhere. Today = main; the options run on the prototype (draft 3's calls: wider
whines, the lonely call and the morning re-send add about half a ping a pet a day).

| Play | Pets | Today | 0b as written (a clock per reason) | (a) per pet, one re-call per 4 h | (b) house budget, 2 re-call pings a day | (c) bundled, one ping per 4 h for every pet still asking | (d) card only |
|---|---|---|---|---|---|---|---|
| careful | 1 / 2 / 4 | 1.9 / 3.8 / 7.5 | 2.4 / 4.7 / 9.4 | 2.4 / 4.7 / 9.4 | 2.4 / 4.7 / 9.4 | 2.4 / 4.7 / 9.4 | 2.4 / 4.7 / 9.4 |
| casual (4 looks) | 1 / 2 / 4 | 4.6 / 9.3 / 18.5 | 4.9 / 9.9 / 19.7 | 4.9 / 9.9 / 19.7 | 4.9 / 9.9 / 19.7 | 4.9 / 9.9 / 19.7 | 4.9 / 9.9 / 19.7 |
| twice a day | 1 / 2 / 4 | 5.4 / 10.7 / 21.2 | 11.7 / 23.5 / 47.1 | 8.3 / 16.5 / 32.9 | 7.5 / 13.4 / 24.6 | 8.3 / 14.0 / 25.2 | 5.7 / 11.4 / 22.6 |
| neglect | 1 / 2 / 4 | 1.4 / 2.7 / 5.5 | 12.6 / 25.3 / 50.5 | 6.1 / 12.2 / 24.4 | 3.3 / 4.8 / 7.6 | 6.1 / 7.5 / 10.3 | 1.4 / 2.8 / 5.6 |

Of those, re-call pings alone (4 pets): twice a day (a) 10.2, (b) 2.0, (c) 2.6, (d) 0;
neglect (a) 18.8, (b) 2.0, (c) 4.7, (d) 0. Careful and casual players get **no
re-calls at all** (they see to a need within 4 h), so every option gives them the same.

What this shows:
- **Re-calls only matter for a pet nobody has seen to for 4 hours.** (a) multiplies
  with the number of pets: 4 neglected pets send 24 a day. (b) and (c) stay flat as
  pets are added; (d) adds nothing.
- **The bulk of a busy house's pushes are first calls, not re-calls.** A casual
  4-pet house gets about 20 a day today and under every option. Per pet, a casual
  player's 4.9 a day are: poop calls 2.5, sickness 1.5 (half of it the double push
  0b now removes), whines 0.7, the rest 0.2. With the sickness fix, casual 4 pets drop
  to about 16.6; with poop calls on the card only as well, to about 6.7 (new question
  Q4 below).
- Build cost: (a) and (d) live in one pet's coordinator. (b) and (c) need a small
  house-wide notifier shared by every pet entry (`hass.data[DOMAIN]`), keyed by person,
  because each pet is its own config entry with its own `notify_users` and its own call
  tag (`virtual_pet_<id>_call`).

**Recommendation: (c), bundled.** One push, at most every 4 h per person, naming every
pet of theirs with an open re-call ("Pip and Mochi would like a visit", copy W4; with
one pet, that pet's usual call text, no new copy), sent as a normal push. It costs a
1-pet house nothing over (a) and caps re-call pings at about 4-5 a day **whatever the
number of pets**, while a person who relies on the phone still hears that something
went unanswered, which (d) drops. (b) is a little lower but arbitrary (the third need
of the day is never sent, whichever pet it is). Bundle rules: the bundle has its own
tag per person (`virtual_pet_recalls`); answering one pet doesn't rewrite it (a rewrite
would buzz again); it is cleared once none of its pets has an open re-call; it has no
buttons (several pets), and a tap opens the dashboard. If the owner prefers the
quietest option, (d) is the cheapest to build and still keeps the pet asking on the
card and the `calling` sensor, which an automation can notify on.

**PR 0c: weight and game rewards, retuned (M1, M6).** Size **S**, tier 1.
- **Weight (finding 3):** `WEIGHT_BURN` 0.7 → **0.5**, `WEIGHT_FEED` 4 → **4.75**, and a
  **restoring term**: above 50, burn grows with weight, `WEIGHT_BURN × (1 + 0.1 ×
  (weight − 50))` per awake hour (`WEIGHT_RESTORE` 0.1). Without it weight is an open
  integrator: 0.05 of burn moves the 14-day result by about 30, the audit's 0.45 / 5
  put careful at 66-72, and 0.5 / 4.75 alone, with 0e's praise in, put careful at
  74-79 and a no-play automation at 98-99. With it, every style lands near 50 (below).
- **M6, a game must pay at least what Play does (20).** `GAME_WIN_HAPPINESS` 25 → 30,
  `GAME_LOSE_HAPPINESS` 10 → 12 (Left or Right: 0.49 × 30 + 0.51 × 12 ≈ 20.8), and
  **`SKILL_GAME_WIN_HAPPINESS` 20 → 21** (finding 4: Higher or Lower is won about 92%
  of the time, 0.92 × 20 + 0.08 × 12 = 19.4, below Play; at 21 it is 20.3).
  `WEIGHT_GAME` -4 → -3, the same as Play.
- The "could use a proper meal" hint (`_WEIGHT_REASONS`) stays actionable: careful is
  never light in the sim.
- **Sim (finding 19):** `careful_games` and `casual_games` play every other Play as a
  whole game of Left or Right, as the card's Play button does.
- **Tests:** pytest for the new constants' signs; each game's expected happiness ≥
  Play's (both games, at their win rates); the restoring term at weight 50 and 70.
- **Sim Done:** careful weight 40-60 and never light; careful_games 40-60; responder,
  casual and casual_games 30-70; praise_bot ≤ 75. Prototype, with 0c alone: careful
  54-57, careful_games 53-58, casual 46-50, responder 44-48, praise_bot 56-57; with all
  of Wave 0: careful 51-56, careful_games 50-54, casual 43-51, casual_games 44-55,
  responder 42-48, praise_bot 56-57.
- **Built (s2450, on 0a):** 0a left weight, burn and the games alone, so no assumption
  here broke. With 0a and 0c in, 10 seeds: careful 54-57, careful_games 53-58, casual
  46-50, casual_games 43-51, responder 44-48, praise_bot 56-57 (main: 29-32, 24-28, 0-3,
  0-4, 2-6, 39-40). Pytests: signs, each game's expected happiness >= Play's, the
  restoring term at 30, 50 and 70.

**PR 0d: fake calls disguised; real needs first (C3, minor 3).** Size **S-M**, tier 1.
- **Owner: disguise, accepted as "unsure only while happiness is 25-40"** (owner,
  2026-10-28). A whine publishes `reason_key` `call_happiness` (`_reason` 2205: the key
  for `fake` is `happiness`), so the card's `reason.call_fake` line key (card 494) is
  dropped, and phase 5's scan exception for `call_fake` with it. Already disguised: the
  `call_started` event (`_start_call` 1172), the binary sensor, the sentence and the
  notification's buttons (notify 73-80).
- **Overlapping ranges.** A whine's gate becomes the gate a real happiness call passes:
  no `CALL_PRIORITY` condition holds (not sick, no poop old enough to call, hunger ≥ 25,
  energy ≥ 20, happiness ≥ 25). Today it also needs every stat > 50 and no poop at all
  (`_wants_to_whine` 998-1006). And a real **"a bit lonely"** happiness call may start,
  at `LONELY_CALL_RATE` 0.1 an hour, while `25 <= happiness < 40`. Between 25 and 40
  either can happen; above 40 only a whine; below 25 only a real call.
- **What answers a happiness call (findings 5, 6).** A real happiness call is answered
  only by a **care action that raises happiness** and leaves it at least at the call
  level (25): play, a finished game, praise, a snack, a blanket or the fan. It is never
  closed by a passive gain (the house bonus, a trait, a chore treat), so a free house
  bonus no longer tells a whine from a real call, and the lonely call (which starts
  above 25) doesn't answer itself on the next tick. In code: `_calls` no longer closes
  a happiness call on its condition (952-954), and `_resolve_call` (2049) checks the
  gain. A whine stays as it is: play, a game and praise spoil it, scolding answers it,
  and **a snack spoils it too** (so a snack is never a safe probe that only answers a
  real call). A missed lonely call is a care miss that latches and re-calls like any
  other.
- A wrong scold of a real call keeps today's cost (`unfair`).
- **Minor 3:** a more urgent real need replaces an open whine, or an open real call of
  lower priority (`CALL_PRIORITY`, model 46): the old call ends with no miss and no
  event beyond the new `call_started`.
- **The guide (W2):** whines and real pleas "often look alike"; the hearts are the
  best clue.
- **Tests:** pytest: a whine's `reason_key` is `call_happiness`; a whine can start at
  happiness 30, at hunger 30, and with a fresh poop; a lonely call starts only at
  25-40 and is still open after a house bonus lifts happiness past 40; play answers it;
  a snack during a whine spoils it; a hunger call replaces an open whine with no
  `discipline_miss`; the card-check line test covers `reason.call_happiness` only.
- **Built (s2451, on 0a + 0c):** no assumption broke (0a and 0c touch neither the whine
  gate nor `_resolve_call`'s happiness path). `_calls` no longer closes a happiness call
  on its condition; `_resolve_call` takes `raised` (happiness went up in the action).
  `_wants_to_whine` is "no `CALL_PRIORITY` condition holds" (a latched need still blocks a
  whine). `FAKE_CALL_MIN_STATS` is gone; `LONELY_CALL_RATE` 0.1 is new. `fake` left
  `_CALL_REASONS` (the key maps to `call_happiness`), so card-check needs no `call_fake`
  line. A snack spoils a whine like play does (discipline +`PRAISE_WHINING_DISCIPLINE`).
  10 seeds, base (0a+0c) vs 0d: careful 0 care misses, devoted, 10/10 (both);
  casual care misses 44-50 vs 44-49, casual_games 45-52 vs 45-51; scrappy adult whines
  worst seed 0.92 vs 2.07 a day (<= 3); responder 9 steady + 1 devoted vs 10 steady.
- **Sim:** careful and responder guess (scold at happiness ≥ 50, else play). The sim
  counts lonely calls among casual's misses. **Sim Done:** careful devoted with no care
  misses; casual's misses don't jump (prototype 44-49, main 44-50); a scrappy adult
  whines at most 3 times an awake day (finding 22: the wider gate times
  `SCRAPPY_WHINE_FACTOR`; prototype worst seed 2.0); no strategy reads `call.reason`.

**PR 0e: upbringing that measures care; praise that can't be farmed (C4, C2).** Size
**M**, **tier 2** (saved state and a migration). Last in Wave 0.
- **The score (findings 7, 8, 10):**
  `score = 0.75 × care + 0.25 × average discipline`, with
  `care = 0.8 × wellbeing + 0.2 × max(0, 100 − 2 × counted misses)`.
  - **Average discipline:** sampled each hour while awake, from hatching to adulthood.
  - **Wellbeing:** sampled with it: the share of waking hours with the pet **not sick
    and every meter (hunger, happiness, energy, health) at 10 or more**. (N1's "no
    meter at 0" barely separated careful, 97-99, from casual, 84-91; the audit's "no
    open call and every meter ≥ 25" put casual at 74-79, scrappy.)
  - **Counted misses:** at most 2 a day (local date, the settings' time zone).
    `care_misses` keeps the raw count for status and journals.
  - Rates: `UPBRINGING_CARE_WEIGHT` 0.7 → **0.75**, `UPBRINGING_MISS_COST` 6 → **2**,
    new `UPBRINGING_MISS_SHARE` **0.2**, `UPBRINGING_WELL_MIN` 10, `MISSES_COUNTED_PER_DAY`
    2. Grades unchanged (devoted ≥ 80, steady ≥ 50).
- **Discipline from good care (finding 8):** praise within `PRAISE_AFTER_CARE_MINUTES`
  (10) of a care action that **met a need** gives `PRAISE_DISCIPLINE` (2), once per
  action, whether or not a call was open: a meal at hunger < 60, a clean with poop
  there, play or a finished game at happiness < 60, medicine when sick. Praise at any
  other time gives none; scolding a whine stays +25. (Paying only after an answered
  call made waiting for calls the best play: the audit's responder who praises
  averaged 75-87 discipline, careful 25-70.)
- **Praise happiness (C2, finding 9):** inside a 30-minute window 8, 4, 2, then 0; and
  after the day's first `PRAISE_FULL_PER_DAY` (3) praises that gave happiness,
  `PRAISE_TIRED_HAPPINESS` (1) from a window's first press only. (The audit's "then 2"
  doesn't close it: one press per 30 minutes at 2 is 4 an hour, exactly the decay; nor
  does 1 a press, since two presses a window are the same 4.) Praise still answers a happiness
  call when it lifts happiness to 25 or more.
- **The card (finding 25):** the discipline bar stays "today"; the status's "growing
  up: <grade>" uses the new score.
- **Saved fields** (all defaulted; P1's `_FLOATS` (68) and `_INTS` (86) and helpers):
  `discipline_sum`, `discipline_samples`, `wellbeing_sum`, `wellbeing_samples`,
  `last_sample_at`; `counted_misses`, `miss_day_at` (a timestamp, not a date, finding
  13), `miss_day_count`; `last_care_at`, `praised_care`; `praise_window_at`,
  `praise_count`, `praise_day_at`, `praise_day_count`; `upbringing_floor`,
  `upbringing_base` (the 0e audit fixes, below).
  `last_praise` (read only by the model) is replaced by the window.
- **`shift_times` (finding 13)** shifts every new timestamp: `last_sample_at`,
  `miss_day_at`, `last_care_at`, `praised_care`, `praise_window_at`, `praise_day_at`.
- **Migration** (in `from_dict`, for a pet hatched and not yet adult; owner Q3 and the
  decisions file):
  - The hours lived before the update count at **half weight**: with `h` the awake
    hours lived (about two thirds of the hours since hatching),
    `discipline_samples = wellbeing_samples = round(h / 2)`,
    `discipline_sum = discipline × samples`, and `wellbeing_sum = samples × estimate`,
    where `estimate = clamp(1 − 0.06 × care_misses / days since hatching, 0, 1)`
    (finding 11).
  - `counted_misses = min(care_misses, 2 × days since hatching)`.
  - **No pet drops a grade because the rules changed** (decisions file; this is the
    plan's reading of it): `upbringing_floor` is the grade today's instant score gives
    at the migration, **capped at steady**, and it **lapses at the first counted miss
    after the update**. The grade at adulthood is the better of the floor (if it
    stands) and the new one. Uncapped, the floor would carry today's exploits forward:
    launder + praise scores devoted (100) on main, so a child being laundered on update
    day would stay devoted while it starves. A careful child loses nothing: it scores
    devoted under the new rules anyway (93-98).
  - Eggs start fresh. Adults keep their upbringing. **An adult save with no upbringing
    (finding 27)** gets one from `from_dict` (458), and with no samples the score falls
    back to today's discipline and the wellbeing estimate, never a divide by zero.
- **Tests:** pytest: the migration for an egg; a child with 10 misses on day 3 (→ 6
  counted, samples at half weight); a careful child mid-childhood keeps its grade; a
  launder + praise child migrated mid-childhood (old score 100) that keeps laundering
  ends scrappy (the floor is capped at steady and lapses at its first counted miss); an
  adult (unchanged); an old adult save with no upbringing loads with one;
  praise five times in a minute gives 14 happiness and no discipline; the fourth window
  of a day gives at most 1; praise 5 minutes after a meal at hunger 40 gives discipline
  once, after a meal at hunger 80 none; three misses on one day count two; away 3 days
  takes no catch-up sample and expires no praise window.
- **Sim Done** (prototype, 10 seeds): careful devoted on every seed (93-98);
  careful_games devoted (92-98); casual **steady** exactly (56-61); casual_games steady
  (56-60); responder steady or better (72-87); responder_praise steady or better
  (75-97); responder_miss1 steady (66-76); neglect (13.7), launder (13.6), launder +
  praise (13.3), sleeper (17.5; moved here from 0a, which needs 0b's re-calls) and twice a day (25-32) scrappy; praise_bot not
  devoted (scrappy, 44-47) with a real happiness call a day (3.1-3.4), and so does
  `praise_bot_x3`, pressing three times a window (the 0e audit fixes); care_bot, which
  feeds, cleans, doses and praises but never plays, not devoted (scrappy, 28-29: its
  happiness sits under 10 most waking hours); praise spam ≤ 16 (14).
- **Re-read against 0a-0d, 0f, 0g and 0b (the 0e builder, 2026-10-28):** no assumption
  broke; every band passes on 10 seeds. As built, where the section left a choice:
  0f's dropped game (`drop_game`) is not care, so praise after it teaches nothing;
  "once per action" is once per the **latest** care (`last_care_at`, as the prototype
  the bands were tuned on): feed, then clean, then two praises teach once, not twice;
  praise that spoils a whine still takes its place in the window and the day; "days
  since hatching" counts today and is at least 1 (`_days_lived`), so a baby's misses
  aren't divided by a fraction of a day; the old score is kept as literals
  (`_old_grade`: 6 a miss, 0.7 care) since this PR changes the rates. **An old adult
  with no upbringing** gets the same capped floor as a growing pet, so no save loads
  a grade below the old rule's (a pytest grid over babies, children, teens and such
  adults, misses 0-10, discipline 0-100). A journal record's damaged `upbringing` is
  dropped; `last_praise` is dropped from the save. The sim's `act` passes the
  settings (the praise day is a local day). Numbers moved slightly from the
  prototype: praise_bot's real happiness calls 2.8-3.1 a day (band ≥ 1), twice a day
  24.5-27.0, sleeper 17.8, responder_miss1 65.2-77.3.
- **The 0e audit's fixes (first mate's calls, 2026-10-28; owner rule "no pet drops a
  grade because the rules changed" guards drops, not rises):**
  - **#1, the migration lifted neglected pets** (the wellbeing estimate gives a fully
    neglected teen about 93%): a migrated pet grows up **no better than the better of
    its old grade (capped at steady) and the grade of its samples since the update
    alone**. `upbringing_base` saves the sums, counted misses and capped old grade at
    the migration and is dropped at adulthood; a damaged one, or one past sums that
    started over, is dropped on load (no cap). While growing up with no sample since
    the update yet, the status shows no cap (a careful child keeps reading devoted on
    update day); from the first sample it's capped, so a neglected teen's "growing up"
    can step down to its old grade then, never below. **An old adult with no
    upbringing gets its old grade, capped at steady**, not the estimate (above, which
    gave it better(new, capped old)). A pytest grid: no migrated pet ends above both.
    Fix A (seeding the estimate from the old care term) was rejected: it turns
    migrated casual teens scrappy. **Accepted residual:** praise_bot migrated at 200 or
    330 hours stays devoted, since its post-update discipline is the 100 its old
    praise farming left (Q3's half weight).
  - **#2, praise stood in for play once tired** (1 a press, so two presses a window
    were 4 an hour): 1 on a window's first press only (above). `praise_bot_x3`: scrappy
    29.6-31.5 with 3.35-3.57 real happiness calls a day, was steady 66.5-67.5 with 0.
    The guide's "It can't stand in for play" now holds.
  - **#3, a damaged far-negative timestamp crashed praise or a miss:**
    `UPBRINGING_TIMES` are clamped to ≥ −1e10 on load (about 1653; `fromtimestamp`
    fails below year 1); fast-forward's small negatives survive a save.
  - **Accepted, no code:** #4, downgrading and re-upgrading is lenient (time on the
    old build isn't counted; rare, and only ever kinder); #5, the day anchors
    (`miss_day_at`, `praise_day_at`) shift with away, as audit row 13 says, carrying
    at most one day's caps into the return day; #6, the floor lapses only on a counted
    miss, as the owner's rule is worded (a sleeper migrated as a child stays steady,
    as it was on the old rules); #7, the `upbringing_score` attribute shows the raw
    score, so a floored pet can read steady with a low score.

**PR 0f: games can't be quit or rerolled for free; card Play spoils a whine (M3, M4,
and A2's server side).** Size **M**, tier 2 (saved game fields). Before PR 1a, its card
side.
- **A2, carry on (owner):** a start of the same kind within `GAME_IDLE_MINUTES` returns
  the running game, guessed or not: `round`, `wins` and, for Higher or Lower, the
  number on show. `start_game` (1503) today replaces a guessed game.
- **A dropped game with a guess is a loss (M4, finding 18):** on **both** switch paths
  (`start_game` of another kind, and `play_game` of another kind, 1549-1552), the
  3-minute idle drop in `_step`, going to sleep, and going away. It counts in
  `games.played`, costs the game's energy and gives the losing happiness. It fires
  `game_finished` with `dropped: true`, which grants no play wish (coordinator 1000-1003),
  no game record and no bond (the idle drop has no person: `by` is None), and its
  happiness answers a happiness call like any care. A game with no guess yet costs
  nothing.
- **No reroll (M4):** a Higher or Lower opening dropped unguessed is kept for
  `OPENING_KEEP_MINUTES` (30) and shown again by the next start. Saved: the kept number
  and its time (shifted by `shift_times`), beside P1's `_game` validation.
- **M3, reconciled with #41:** the first game call while a whine is open spoils it, in
  `start_game` (both paths go through it) and at the top of `play_game` for a game
  already running: `PRAISE_WHINING_DISCIPLINE`, `call_answered` with
  `answer: "spoiled"`, the card's "hehe, whining works" line (card 405).
- **Built (checked against 0a/0c/0d, nothing broke):** `model.drop_game` does the loss,
  the event and the kept opening; the saved fields are `opening` and `opening_at`; going
  away calls it from the coordinator's presence step. The care log gets a `lost` entry.
- **Tests:** pytest: reopening Left or Right after one guess returns round 1 and the
  win; reopening Higher or Lower returns the same number; switching after a guess adds a
  played, unwon game and a `dropped` `game_finished` with no wish; switching before a
  guess doesn't; the idle drop and sleep count it too; the opening survives a switch and
  returns; a game started during a whine spoils it.
- **Sim Done:** walking away doesn't raise the win rate (≤ honest + 3 points; prototype
  0.50 against 0.49, main 0.72); no sure Higher or Lower opening by restarting
  (prototype: never in 50 tries; main: after 2).

**PR 0g: odds and ends on the server (M5, minors 1, 2, 4).** Size **S**, tier 1.
- **M5 (finding 20):** a model helper `fast_forward(state, now, hours, settings, rng)`
  advances, rebases with `shift_times`, and then, if the pet is asleep and not
  napping, sets `wake_at = next_wake(now)`. `coordinator.async_fast_forward`
  (1895-1916) and the sim's `fast_forward_wake` both call it (the sim uses it once it
  exists). `stayed_up_since` is already shifted.
- **Minor 1:** the coordinator remembers the to-do items it has paid for today, per list
  (`_chores_paid`, in memory beside `_chores_done`), so un-ticking and re-ticking one
  item pays once. The 5-a-day cap stays.
- **Minor 2:** the "tuck me in" wish (coordinator 1007-1008, any `how == "lights"`
  today) is granted only by lights-out from `TUCK_IN_EVENING_HOUR` (18:00) to 03:00
  local, the hours `async_set_lights_out` already uses for the bond (1879-1880).
- **Minor 4 (owner):** a snack is refused at `hunger >= FEED_FULL_AT` (95), with the
  meal's refusal (`full`) and its line. No daily cap.
- **Tests:** pytest for each; card-check: a refused snack shows the "full" line once.
- **Sim Done:** fast-forward wakes within 12 h (prototype 11.0; main 35).

**PR 0h: card display fixes (minors 8, 9, 10).** Size **S**, tier 1.
- **Minor 8 (finding 23):** hearts round to the **nearest** half (card 3192, today
  `Math.ceil`), and show full at `hunger >= FEED_FULL_AT`, so a pet the server calls
  full shows 4 hearts: 30 shows 1 heart, 34 shows 1.5, 96 shows 4.
- **Minor 9 (finding 24):** the hatch countdown (2203) and "time ago" (`timeAgo`, 861)
  use a server-time offset taken from something fresh: the `time_fired` of the next
  state event over the websocket, and P3a's snapshot `now` once it lands. Not
  `last_updated`, which only moves when a sensor changes and can be an hour old after a
  reload. Until a fresh reading arrives, the device clock is used with the skew capped.
- **Minor 10:** a refused game says its refusal line once (drop the `_pickGame` line and
  leave it to `_react`, 3136).
- **Tests:** card-check: 30 shows one heart, 34 one and a half and 96 four; with the device clock 10 min
  fast, the countdown matches the server's after one state event; a refused game writes
  one line.

### Wave 1: reliability (PR 0f before 1a)

**Plan review folded in (2026-10-28, scout report of worker s2463 against main
`39ec87b`; first mate's decisions recorded below).** All card line numbers are
`hatch-pet-card.js` on that main; server ones name the file. **Build order: 1a and 1c may
build in parallel; 1b after 1c** (1b and 1c both touch `_visit` / the status handlers;
all three edit the one card file and CHANGELOG/version, so expect trivial merge
conflicts, not logic ones).

**PR 1a: games carry on, old timers die (F01, F02; balance minors 6, 7).** Size
**S-M**, tier 1. **Card only**, on top of PR 0f.
- **Owner (A2): carry on.** `_pickGame` (4030-4067) makes the same no-guess start call for
  Left or Right that Higher or Lower makes (`_playCall(s, {game: kind})`). The reply
  carries the running game (PR 0f; `_round_info`, model 1866-1877, `start_game`
  1673-1708): the card **adopts `info.round` and `info.wins`** instead of the hard reset
  `s.game = {round: 0, wins: 0}` and "round 1/5" (4044-4048), on **both** paths (Higher or
  Lower ignores them today, 4061-4067). The score line reads
  `round ${round + 1}/5 · ${wins} right`, or a fresh round 1 if there was no game. A start
  reply is never `done` (the server clears finished games). The per-round `last_result`
  is not in `_round_info`, so what carries on is the round and the wins, not "the first
  result". While waiting, Left or Right gets the same `busy` path and `aria-disabled`
  buttons as Higher or Lower's start (4057-4063).
- **Checked (corrected from draft 1):** an abandoned game was **not** "for nothing" on
  `afd56b9`: restarting a losing game until a win farmed `bond_record`'s "new record"
  line (model 1664-1671), bond `game` points and a favourite (coordinator 1683-1691),
  and a `dream_seed` (coordinator 895-897). Carrying on (A2) and PR 0f's "a dropped game
  with a guess is a loss" close that.
- **The timers (1a-1, 1a-3).** `s.gameTimers` **does not exist yet; 1a adds it**: a
  `Set` on the slide, into which go the 900 ms guess timeout (4129-4141), Catch's
  kickoff (4051) and `_catchResolve`'s timeout (4748); `_endGame` clears it. The slide
  teardown needs no change: `_dropSlide` (1864) and `disconnectedCallback` (1501-1515)
  already call `_endGame`. On top of the set, every delayed callback captures the game
  object and returns unless `s.game === g`. The real bug is in `_guess`'s 900 ms timeout,
  which tests only `!s.game`: a *new* game started inside the window gets `busy = false`,
  its score overwritten, and is **ended** if the old reply was `done`. The fix:
  `const g = s.game` before the await and `if (s.game !== g) return` in the timeout.
  (The part after the await is already safe: `_playCall` returns null when
  `s.game !== game`, 4090.)
- **Two viewers** share one server game (one `state.game`). Opening it on a second
  device now shows the real score instead of wiping it. **C1 applies only to Higher or
  Lower and Left or Right** (Catch is client-only). A reply whose `round` is not the
  card's `round + 1` means someone else guessed meanwhile: the card ends its game with
  a line (copy C1), not a wrong score. **Accepted (first mate, 1a-7):** a retry after a
  lost reply (the server is at r+1, the card at r) shows C1 wrongly; it is rare and the
  card cannot tell.
- **Catch has no carry-on (first mate, Q2).** It is client-only: nothing to carry. PR 4f
  later gives Catch server rewards, so its checks will be rewritten then.
- **Tests:** card-check: stop a Left or Right game after one guess, reopen within 3 min,
  and the score reads round 2 of 5 with the wins kept; the same for Higher or Lower,
  with the same number; stop during the 900 ms window and start Higher or Lower, and the
  new game is untouched; **card-check sets `experimental_catch: true`** (Catch is hidden
  without it, 77-80, `_games` 3979) for: open Catch, close and reopen it inside 900 ms,
  and exactly one round runs (this tests the kickoff timer only); two viewers: **a
  second `page` in the same context** (tabs share storage and the HA user, card-check
  113-114, 2484; no second login), play one round on page B, then guess on page A with
  A's now-stale round: A ends with C1; a game closed during a pending guess throws
  nothing.
- **Done =** the checks pass, and no `setTimeout` in the game code runs against a
  game other than the one it was made for.

**PR 1b: taps and answers that wait (F07, F06, A1, A7).** Size **S** (re-sized from S-M:
the guard is merged; first mate, X-1), tier 1. **Builds after 1c.** The visit hook is
not in `_visit` (see below), so 1b and 1c no longer fight over `_visit`.
- `_call` (3956): a per-button in-flight flag. A second tap while one is pending does
  nothing except the press feedback (`_tapped`, 3937, fires the feedback before the
  flag check: keep that order), and other buttons stay live. `.pending` and `.failed`
  stay as they are. `_call` also serves `lay_egg` (via `_press`, after `_confirmed`) and
  the lights toggle (4796-4800, a service call): the flag covers both.
- **One shared confirm guard** for every irreversible control: `_confirmTap(button, s,
  run)`. The first tap arms it ("sure? tap again"); a tap less than `CONFIRM_GAP_MS`
  (600) after arming is ignored; a tap from 600 ms to `CONFIRM_MS` (4 s) confirms;
  after 4 s it disarms. This fixes "any second tap within 4 s confirms". It guards
  **laying an egg** (1642-1654), **"forget my birthday"** (owner A1: today a single tap,
  3267-3277) and **privacy P2's "forget my data"** (cross-plan change 1).
  - **Built in privacy P2 (0.36.0b1, 2026-10-28), so 1b adopts it rather than writing
    it** (owner, via the P2 brief). The card has `confirmTap(s, key)` and
    `confirmArmed(s, key)` (module functions, armed state on the slide by control key:
    `lay_egg`, `forget_birthday`, `forget_me`), `CONFIRM_ARIA`, and
    `this._confirmed(s, key, button, redraw)`, which arms the button in place and
    redraws when the window closes. **One difference from the rule above:** the 600 ms
    is measured from the *previous* tap, not from arming, so a fast triple tap (0, 300,
    650 ms) doesn't confirm either; the 4 s window still runs from arming. **The guard
    is already tested** ("forgetting takes two taps, and a fast double tap is one" and
    "laying an egg takes two taps, with a pause between", card-check 716-730), so 1b adds
    only the **1 s second-tap case** on the three controls.
- **Answers (owner A7: a failed save is not a try).** The try is *already spent* when
  the question is **asked** (`mark_once`, people 411-417, called from `_question`), not
  when it is answered, so a failed save cannot give the try back on the server. What
  the stash does is land the answer before the question comes again (14 days later,
  `ASK_LIKES_AGAIN_DAYS`, rates 334). `_ask` (2859, 2905-2912) with `keep` keeps the
  optimistic reply (the charm), then:
  - on failure, retries the `virtual_pet/answer` call once, quietly, after 3 s. The
    retry timer and the bubble are guarded by `s.ids?.[...] === entity`: after
    `_dropSlide` or a pet switch the retry may still send, but never writes the bubble
    or C2 on a different slide. This applies to `dream` and `guess` too;
  - if that fails too, and the question is a **once-question** (`fav_weather`,
    `fav_season`, `catchphrase`), keeps `{question, answer, at}` in `localStorage`
    under **`hatch-answers-<hass.user.id>`**, never on a shared screen (`sharedScreen()`,
    183). **A birthday is never stashed (first mate, 1b-1 / owner Q1):** a failed
    birthday save simply asks again later, as today. `forget_me` (`.forgetme`,
    3432-3458) removes the key (and `forget_birthday`, 3418-3425, has nothing to remove);
  - **the resend runs when the card gets `hass` with a user** (first mate, 1b-5), not in
    `_visit`, which is skipped on a shared screen and rate-limited to hourly
    (2795-2800). It sends the stored answers one by one. **An error `not_asked` or
    `invalid_answer` drops the stored answer** (the first attempt may have reached the
    server and only its reply been lost; the server raises `ValueError` → `not_asked`,
    `__init__.py` 300-325, coordinator `async_answer` 1564-1600); a transport error keeps
    it. The server's open-ask check applies to the catchphrase (same generation, `asked`
    and not `answered`), so a catchphrase stashed across a new generation is dropped the
    same way; there is none for the likes (**"no server change"** holds);
  - `dream` and `guess` are **not** resent: they are about tonight and tomorrow
    (`pick_dream` for now, `guess` for `P.tomorrow(today)`), so a late answer would land
    on the wrong day. They aren't once-questions, so no try is lost;
  - a stored answer older than `ASK_LIKES_AGAIN_DAYS` (14) is dropped (the question may
    come again by then);
  - the bubble says C2 only when the retry also failed. It promises nothing.
- **Tests:** card-check: a double tap on feed sends one `button.press`; **lights tapped
  twice sends one service call**; on each of the three guarded controls, a second tap at
  1 s confirms; with `virtual_pet/answer` stubbed to fail twice, the bubble shows C2, the
  answer is in `localStorage` under the user's key, and it is sent when the card next gets
  `hass` with a user; **a stashed answer answered `not_asked` is dropped**; a retry that
  fires after the slide was dropped writes no bubble; a failed `dream` answer isn't
  stored; **a failed birthday is not stored**; **a shared screen stores nothing**;
  **`forget_me` removes the key**. pytest: a late `fav_weather` answer is stored (no
  open-ask check for the likes, 1584-1590); a late `catchphrase` after it was answered
  raises.
- **Done =** the definition of done's "no duplicate effect from fast taps" and "visible
  failure" hold for every care button, the three guarded controls and the six kept
  questions (`keep: true`: `fav_weather`, `fav_season`, `dream`, `guess`, `birthday`,
  `catchphrase`, 632-660).

**PR 1c: preferences and sound samples (rest of F05, F09).** Size **S**, tier 1. May
build in parallel with 1a.
- **Privacy P3a supersedes the visit-reply fields** (owner Q1, 2026-10-28). `mine` on the
  privacy plan's channel carries `my_day`, `baby_talk`, `birthday_phone` and
  `birthday_kept`, pushed on change. Once P3a-card lands, the card reads them from there
  and the visit reply's fields below are redundant. 1c still ships first, as written.
- `coordinator.async_visit`: the too-soon (1215-1221) and asleep (1237-1244) replies
  carry `my_day`, `birthday_kept` and `birthday_phone` (and `baby_talk`, already in
  the counted reply, 1277-1279), like the counted one. `birthday_*` stay out on a shared
  screen as now (`_visit` returns early at 2798, before the request).
- **Status before any reply:** until a visit reply has set `_myDay` (a reload, or a
  failed visit), the "my day" row shows "…" and the birthday rows are hidden, never
  "off" (`_renderStatus` 3341, `!!this._myDay`). `_myDay` is card-wide and `undefined`
  before any reply; after `forget_me` the card sets it to `false` on purpose (3442): that
  is *not* "unknown", keep it.
- **Owner (Q3):** the two samples (`playChirp("win")`, 3392, and the baby-talk sample,
  3478) go through `_maySample(s)`: **`_mayPlay`'s rules** (2961-2966: the asleep,
  lights-out and quiet-hours rules, the `s === this._slides[this._index]` check and
  `visibilityState === "visible"`, all true on a tap), without "on show". **The tap must
  still unlock audio** (`unlockAudio()` and `audio.resume()`, inside the gesture, for
  *both* samples): only the sound is skipped, or phones lose sound for good. A short
  status note says why (C3, **approved by the first mate**, with three variants: quiet
  hours, asleep, and daytime lights out; see section 5).
- **Tests:** pytest: a too-soon and an asleep visit both return the three fields for a
  person who has them. Card-check: the "my day" row reads "…" before the first reply
  (hold the reply by delaying the `visit` service in the `callService` wrapper); a
  second browser opening within the hour shows "my day: on" for a person who has it on;
  at a stubbed 22:00 (stub `Date` with `page.addInitScript` or the clock, since a reload
  resets it; `QUIET_HOURS` read `new Date().getHours()`, 2963; precedent card-check 488),
  turning "sounds here" on plays nothing and shows C3, and a chirp after a stubbed 09:00
  plays; with lights out by day and with the pet asleep, the sample is skipped with the
  matching C3 line.
- **Phone test, not a gate (first mate):** that "phones lose sound for good" when a tap
  skips the unlock goes on the phone-test list (tududi). It can't be verified on this
  host, and the phone test is no longer a gate.
- **Done =** status rows never show a default in place of the person's real setting,
  and no sample plays at night or while the pet sleeps.

**First mate's decisions (2026-10-28), from the Wave 1 review:** birthday never stashed
(1b-1 / Q1); Catch has no carry-on and card-check sets `experimental_catch` (1a-5 / Q2);
1a adds `s.gameTimers` and identity checks (1a-1); the retry-after-lost-reply C1 misfire
is accepted and C1 is for Higher or Lower and Left or Right only (1a-7); the stash resend
runs on `hass` with a user (1b-5); 1b is size S (X-1); C1-C3 approved.


## The Wave 0 audit (27 findings) and what changed

An adversarial audit of draft 2's Wave 0 (scout hatch-at-home-s2442, 2026-10-28, main
`64bd401`) found 27 problems (9 high: 1, 2, 3, 5, 7, 8, 9, 10, 26). **This table wins
where it differs from anything above it, for Wave 0.** Every finding was checked
against main at `8904a0a` (privacy P1 merged since the audit, so its line numbers
moved), and the fixes were prototyped together and run through the extended
`balance_sim.py` on 10 seeds: all bands pass. **26 findings hold as found; none is
rejected outright.** Four of the audit's proposed numbers or rules didn't survive the
prototype and were replaced (rows 1, 3, 9, 10: "rejected in part"), and one claim is
narrower than stated (row 14). The owner answered Q2 and Q3; Q1 is evaluated in 0b.

| # | Finding | Change |
|---|---|---|
| 1 | 0a: a call paused across the night resumes in silence with minutes left, and runs out (`fell_asleep` clears the phone, notify 84-93). Verified | 0a: a natural wake gives at least 10 minutes; a hand wake gives nothing. **Rejected in part:** the audit re-sent at every natural wake; a pet kept napping then sent 10 pings a day (sim `sleeper`), so only the **morning** wake re-sends, as a normal push |
| 2 | 0b: re-calls are notification spam: a neglected pet went from 1.2 to 11.5-12.2 calls a day, each time-sensitive. Verified (0b as written: 12.6 a day on the prototype) | 0b: one re-call clock per pet, the most urgent need first; re-calls are normal pushes; a pings-per-day band. The phone side is **Wave 0 Q1**, evaluated for 1, 2 and 4 pets (0b), recommendation (c) bundled. 0b waits on the owner's pick |
| 3 | 0c's 0.45 / 5 fails 0c's own band (careful 66-72); weight is an open integrator; praise_bot sits at 98-99. Verified | 0c: 0.5 / 4.75 **plus a restoring term** (burn × (1 + 0.1 × (weight − 50)) above 50) and a praise_bot ≤ 75 band. **Rejected in part:** 0.5 / 4.75 alone gives careful 74-79 once 0e's praise is in (praise lifts happiness, so careful plays less) |
| 4 | M6's pytest fails for Higher or Lower: 0.92 × 20 + 0.08 × 12 = 19.4 < 20. Verified (`SKILL_GAME_WIN_HAPPINESS = PLAY_HAPPINESS`) | 0c: `SKILL_GAME_WIN_HAPPINESS` 21 (20.3); the test covers both games |
| 5 | 0d's lonely call answers itself on the next tick (`_call_condition` is happiness < 25). Verified (model 911-920, 952-954) | 0d: a happiness call is answered only by a care action that raises happiness to 25 or more; it never closes passively; a miss latches and re-calls like any other |
| 6 | 0d's disguise covers only happiness 25-40; a passive gain closes a real call but not a whine. Verified | **Owner Q2: accepted** (W2 "often look alike"). 0d: no happiness call closes on a passive gain; a snack spoils a whine, so it isn't a safe probe either |
| 7 | 0e: careful can't be devoted on every seed (its discipline comes from random whines). Verified | 0e: the praise rule of row 8 and careful praising after any care it gives (the sim's `careful`, updated): careful 93-98, devoted on 10/10 |
| 8 | 0e's discipline pays most for waiting for calls (responder_praise 75-87, careful 25-70). Verified | 0e: praise within 10 minutes of any care that met a need, once per action, call or not; `responder_praise` and `care_bot` added. Unlike the audit's prototype, care_bot (never plays) is scrappy, not steady: the wellbeing measure counts happiness under 10. Deliberate |
| 9 | C2 isn't closed: one praise per 30 minutes keeps happiness up with no play (praise_bot ≥ 93). Verified | 0e: after the day's first 3 praises, at most 1 happiness each; band: praise_bot still gets a real happiness call a day (3.1-3.4). **Rejected in part:** the audit's "then 2" is 4 an hour, exactly the decay |
| 10 | N1's misses term ranks casual below neglect (28-30 counted vs 16-20); only wellbeing orders them. Verified | 0e: misses are 0.2 of the care half at 2 points each; the care weight is 0.75; wellbeing is "not sick and every meter ≥ 10". Casual 56-61 (steady, margin 6), neglect 13.7. **Rejected in part:** the audit's 0.4 share left casual at 50.0-52.9, and its finer measure ("no open call, meters ≥ 25") put casual at 74-79 wellbeing, scrappy. N1's sentence is corrected (section 6) |
| 11 | 0e's saved fields and migration leave out the wellbeing sample. Verified | 0e: `wellbeing_sum`, `wellbeing_samples`; migration estimate `1 − 0.06 × misses a day`, clamped, at Q3's half weight; a pytest |
| 12 | The migration bakes in discipline earned under the old rules at full weight. Verified | **Owner Q3: half weight.** Plus the decisions file's "no pet drops a grade because the rules changed", read as `upbringing_floor` from today's instant score, capped at steady and lapsing at the first counted miss after the update (uncapped, launder + praise would keep its devoted 100 from main); pytests for a careful child and a laundered one |
| 13 | `shift_times` misses 0e's and 0f's timestamps; `miss_day` is a date. Verified (model 556-584) | 0e and 0f list every new timestamp in `shift_times`; `miss_day_at` is a timestamp; pytest for 3 days away |
| 14 | 0a's sensor plumbing has no acceptance criteria (calling while asleep; a deadline written every tick; the `calling` flag). Verified, **narrower:** `deadline` is already in `_unrecorded_attributes` (binary_sensor 59), so it writes no recorder history, only a state write every tick | 0a: calling off while asleep, no deadline attribute, no `calling` flag; all three tested |
| 15 | Assist and the button report a refused nap as success (intent 229-231). Verified | 0a: `async_set_lights_out` returns the result; `REFUSED` gets `not_sleepy` (W3); a `care_log` entry; the notification button is never refused |
| 16 | The nap rule is bypassed while away or as an egg. Verified (`come_home` 2078, `_apply_lights` 2087) | 0a: the check sits in `_apply_lights`; the egg case is accepted and documented |
| 17 | 0b doesn't say how a re-call is told apart; no float map in P1; update day re-calls every old latch. Verified (`_str_map`, `_int_map` only, model 129-135; `Call` built at 404-410) | 0b: `Call.recall`, `latched_at` until re-arm, `_float_map`, release-notes line |
| 18 | 0f doesn't say what a dropped game fires; two switch paths. Verified (model 1549-1552; `start_game` 1503) | 0f: `game_finished` with `dropped: true`, no wish, record or bond; both paths, idle, sleep and away; a whine spoiled in `start_game` and in `play_game` |
| 19 | The sim never plays card games. Verified | `careful_games` and `casual_games` in the sim (this PR); 0c and 0f bands |
| 20 | 0g's fast-forward band can't turn green from a coordinator fix (the sim calls `advance` itself). Verified | 0g: `model.fast_forward`, used by the coordinator and the sim (this PR's sim already prefers it) |
| 21 | The ordering contradicts itself, and 0e doesn't wait on 0f. Verified | Order 0a → 0c → 0d, then 0b and 0f, then 0e; P1 is merged, so nothing waits on it; section 3 and section 4 fixed |
| 22 | The bands don't match the owner's decisions (casual steady exactly; no notification, responder_praise or praise-only bands; 10 seeds; adult whines). Verified | All added to the sim (this PR): casual steady, responder_miss1 steady, calls started per pet a day, responder_praise, praise_bot's happiness call, launder's energy misses, a scrappy adult ≤ 3 whines a day, 10 seeds in `--check` |
| 23 | 0h's hearts: rounding down shows a full pet as not full. Verified (card 3192) | 0h: nearest half, full at `FEED_FULL_AT`; card-check 30 → 1, 34 → 1.5, 96 → 4 |
| 24 | 0h's clock: `last_updated` isn't fresh. Verified | 0h: offset from a state event's `time_fired`, then P3a's `now`; device clock with a capped skew until then |
| 25 | 0e: the card doesn't explain the new score. Verified | 0e: the bar is "today", "growing up" uses the new score, tested |
| 26 | 0a's Done fails: an energy call is still laundered (686 calls, 0 misses). Verified | 0a: an energy call is answered only once energy passes 40 asleep or at a natural wake (no saved field, unlike the audit's "30 minutes asleep"); launder 14 energy misses = neglect's, scrappy |
| 27 | 0e: an adult save with no upbringing has zero samples. Verified (model 456-458) | 0e: fall back to today's discipline and the wellbeing estimate; pytest |

**New from the prototype (not in the audit):**

- **Napping a pet whenever it wakes** (`sleeper`) gets **123 pushes a day and a steady
  pet on main** (each nap ends its call, which calls afresh on waking). With 0a and the
  morning-only re-send: 4.2 a day, scrappy. Added to the sim with bands.
- **A sickness sends two pushes** (`became_sick`, then the `sick` call in the same tick).
  0b sends one.
- **A twice-a-day player starves the pet** (weight 2, health 1, scrappy in every seed):
  feeding below 60 twice a day can't keep up with hunger. No band; noted for the owner,
  since it is today's behaviour too.
- **Most pushes in a busy house are first calls, mostly poop calls:** new question Q4.
