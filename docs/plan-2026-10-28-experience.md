# Plan: the experience review (13 defects, 8 opportunities) and a balance wave

**DRAFT 3, 2026-10-28.** A plan for the owner's review: nothing here is built. Draft 1
was audited adversarially (25 findings, all checked against main and folded in), the
owner answered its questions (Q1-Q13 and the audit's A1-A10), and a separate gameplay
balance audit added **Wave 0: balance**, which goes first. **Draft 3 rewrites Wave 0**
after its own adversarial audit (27 findings, all folded in and prototyped; every sim
band passes on 10 seeds) and evaluates how re-calls should reach phones in a house of
several pets (Wave 0 Q1, in PR 0b). "The audit of draft 1 (25 findings) and what
changed" **wins** where it differs from the sections above it, and "The Wave 0 audit
(27 findings) and what changed", the last section, wins for Wave 0. Code changes in
these PRs: only `scripts/balance_sim.py` (added in draft 2, extended in draft 3).

The source is an outside "deep interaction, feature, animation and quality review" of
2026-10-28 at `0821baf` (0.35.0b3). It reports 13 defects (F01-F13) and 8 opportunities
(O01-O08), plus a QA section and a "definition of done" for new interactions. Both are
used below. (Its F numbers are its own: they are not the privacy plan's F1-F6.) The
balance audit (2026-10-28, main `afd56b9`) reports C1-C4, M1-M6 and ten minors; its
numbers are used as they are.

**Line numbers are for `origin/main` at `afd56b9`** (PR #39-#41 merged). Since `0821baf`
the card has changed by one line (2849), so the review's card references still hold;
`coordinator.py` is unchanged above line 1792; `model.py` has moved (cited fresh here).
Privacy P1 has since merged (0.35.0, #45); Wave 0 cites main at `8904a0a`.

## The owner's taste (the rules every phase keeps)

From `docs/HANDOFF.md` ("Start here") and the earlier plans:

- **Animal Crossing is the touchstone.** Flavour, never gameplay pressure.
- **Positive or quiet**: never guilt, nagging, ranking people or anxious timers.
- **Private things go only to their person.** Anything that leaves a trace in HA's
  history is opt-in.
- **No shops, currencies or forced dailies.** No new stats to keep up.
- Earlier "no" or "not now" answers stand (`docs/plan-2026-10-27-feature-gaps.md`): no daily diary; no
  trained tricks for now; no shop or decorations; no learning household rhythms; no
  death. This plan proposes none of them. Where an item comes near one, it says so.

## 1. The defects, checked against main

| # | Verdict on main | Where (main `afd56b9`) | Notes |
|---|---|---|---|
| F01 game cancel/reopen reuses the old server game | **Confirmed, narrower than reported** | card `_pickGame` 3832-3868 (the `left_right` branch, 3847-3849, writes a line and makes no call); `_endGame` 4573-4586 (local only); `model.play_game` 1284-1320 (no game: start one; a game of the same kind carries on until `GAME_IDLE_MINUTES`, 3, `rates.py:91`, `model.py:431`) | **Higher or Lower already resets:** its opening call has no guess, so it goes through `coordinator.async_play_game` 1676-1677 to `model.start_game` (1258), which replaces any game that has had a guess. Only Left or Right reuses the old game. A second viewer of the same pet also shares the one server game. **Owner (A2): reopening carries on with the real score, for both games** (PR 0f server, PR 1a card). |
| F02 old timers act on a newer game | **Confirmed** | `_guess` 3895-3941 (the 900 ms timeout checks only `!s.game`); `_pickGame` 3844 (Catch's 900 ms kickoff calls `_catchRound`, which checks only `kind`, 4465) | Catch's `_catchResolve` (4529-4560) already compares the game object; the other two delayed paths don't. Same as the balance audit's minor 7. |
| F03 a filtered shelf shows raised creatures as ??? | **Confirmed** | `_renderJournal` 3423-3426 (`raised` from `this._slides` only); the editor's device filter 4609-4659 | **Owner (Q1): house-wide.** A change to the forms book, not a separate edit (section 2). |
| F04 every person's bond in a public attribute | **Confirmed; covered** | `sensor.py:216` (`notify_users`), `231-237` (`bonds`) | Privacy P3a/P3b (see section 2). Not re-planned here. |
| F05 preference switches wrong for up to an hour | **Confirmed** | `coordinator.async_visit`: the too-soon reply 1075-1080 and the asleep reply 1085-1092 carry `baby_talk` only; the counted reply 1133-1141 carries `my_day`, `birthday_kept`, `birthday_phone`. Card `_visit` 2673-2676 keeps the last value; status 3196-3198 shows `undefined` as "off" and hides the birthday rows | Privacy P3a covers only part of it (section 2). A reload resets `s.visitedAt`, and a visit that fails leaves `_myDay` undefined: PR 1c handles both. |
| F06 a failed saved answer is acknowledged, then dropped | **Confirmed** | `_ask` 2755-2775: the reply is spoken (2761) before `virtual_pet/answer` resolves; `.catch` (2772) says nothing | Six questions keep their answer (`keep: true`, 628-655): weather, season, dream, guess, birthday, catchphrase. Four are once-questions whose try is counted when **sent** (coordinator `_question`, `P.mark_once` 1389, `_catch_ask` 1391; `may_ask_again`, people 282-290: 2 tries, 14 days apart). **Owner (A7): a failed save doesn't count as a try** (PR 1b). |
| F07 repeat taps aren't coalesced | **Confirmed, and one case is worse than reported** | `_call` 3746-3758: `.pending` class only, no in-flight guard | **Laying an egg:** the request button's two-tap confirm (1642-1654, `CONFIRM_MS` 4000 at 765) takes any second tap within 4 s. **"Forget my birthday"** (`.bell.forgetbday`, 3197, 3267-3277) has no confirm at all: one tap deletes. **Owner (A1): one shared guard for every irreversible control** (PR 1b). |
| F08 simultaneous events overwrite each other | **Confirmed; partly covered** | `_renderSlide` 2073-2077 (reacts to `log[0]` only); 2078-2088 (moments loop, each `_moment` writes the bubble at once through `_write`/`_speak`, 2838-2843); the 15 s `recent()` filter (2071) drops anything older | Privacy P3a moves personal moments to a pushed channel and gives `recent()` the server's `now` (section 2). The card **already has a queue** (`s.queue`, `_queue`/`_sayQueued` 2439-2455): PR 2a builds on it. |
| F09 sound samples ignore quiet hours and sleep | **Confirmed** | `_mayPlay` 2823-2828 (`QUIET_HOURS` 21-8, line 92); the status "sounds here" sample 3244 and the babble sample 3292 call `playChirp`/`babble` directly | Both samples come from the person's own tap, which also unlocks audio on phones. **Owner (Q3): silent at night and asleep**, with a note. |
| F10 the family line shows four generations | **Confirmed** | `_renderJournal` 3437 (`.slice(-4)`); `model.lay_egg` 1032-1061 keeps every record (`egg.journal = [*state.journal, record]`, 1057) | **Owner (Q2): "older generations (N)"** (PR 4g). |
| F11 reduced motion doesn't stop JS movement | **Confirmed, partly** | CSS rule 874-876; `_tick` 2187-2224 swaps frames every tick whatever the setting; Catch `_catchRound` 4466-4499 slows (`calm`: travel ×1.6, window ×2) and drops the spin, but still slides | `_idle` already limits itself to mumble and pose under reduced motion (personality plan, "Idle manner"; card-check 1481), and typing is skipped (card-check 548-555). |
| F12 known art faults | **Confirmed; covered** | `docs/plan-2026-10-28-art-reviews.md` | Its phase 1 (`claude/elegant-pascal-44cy2y`, the axolotl/moth outline stopgap and resized frames) **is merged** (`2598fec` is on main), but the plan's status line still says "plan only". Phases 2 (octopus palette, tarantula eyes, gecko "!", bat) and 3 (the art batch: axolotl and moth adults, deer, kitten, squirrel) are open. The art session is redrawing the axolotl and moth adults now. |
| F13 stale counts in the README and guide | **Confirmed** | `README.md:2` ("all thirteen creatures"), `:103` ("Collect all 13"); `docs/guide.md:730` ("still to come: more species"). 30 `species.json` under `frontend/sprites/` | Changing the number means re-rendering `docs/readme/hero.png` and `collect.png` **and re-laying `collect()`** (PR 4e, M). **Owner (A9): after the new axolotl and moth adults land.** **Beetle:** closed by forms book owner decision 9 ("nothing"); `species.py:roster` (32-36) already skips it. |

No defect is "Already fixed" or "Not reproducible". PR #39-#41 touched none of these
paths except the one card line in `call_answered` (2849), which no finding uses.

### The balance audit, checked against main

The headline holds: **upbringing doesn't measure care.** Every claim was checked against
`afd56b9`, and the auditor's sims were copied into `scripts/balance_sim.py` and re-run
on the real package (its `vp/` copy is identical to main's `model.py`, `rates.py` and
`home.py`). Today's numbers, 14 days hatch to adult, seed 1:

| Strategy (`balance_sim.py`) | Care misses | Discipline | Upbringing | At adulthood |
|---|---|---|---|---|
| careful (looks every 5 min, feeds and plays ahead, praises after a real call) | 0 | 28-79 (by seed) | steady or devoted | weight 0-1, light from day 4-5 |
| casual (opens the card at 8, 12, 17 and 21; naps it if worn out) | 44-50 | 0 | scrappy | weight 0; min health 43-66 |
| neglect | 17 | 0 | scrappy | health 1, sick |
| responder (answers only calls, correctly) | 0 | 0 | steady (70) | weight 2-3 |
| responder, lets the first call a day go | 14 | 0 | scrappy | starving, health 1 (M2) |
| launder (lights out and on at every call) | 0 | 0 | steady (70) | starving, health 1, sick |
| praise_bot (feeds, praises every 30 min) | 14 | 100 | scrappy | fine |
| launder + praise | 0 | 100 | **devoted (100)** | starving, health 1, sick |

| Exploit | Today |
|---|---|
| Left or Right, walk away once a win is out of reach | 72% of counted games won (honest: 49%) |
| Higher or Lower, switch kinds to reroll the opening | a sure 1 or 9 after 2 restarts |
| Praise 20 times in 20 s, from happiness 0 | 100 happiness |
| Fast-forward 30 h from 20:00 | asleep 35 real hours |

| # | Verdict on main | Where (main `afd56b9`) | Notes |
|---|---|---|---|
| C1 lights-out wipes calls | **Confirmed [sim]** | `_fall_asleep` 523-545 (`state.call = None` at 544 after `_unlatch`); `_calls` returns while asleep (703-704); `set_lights_out` 1811-1830, `_apply_lights` 1844-1856 | The comment says calls pause; the code deletes them. Launder ends steady with the pet starving. |
| C2 praise is free and farmable | **Confirmed [sim]** | `apply_action` praise 1220-1236; `PRAISE_*` rates 58-63 | +8 happiness a press (13 presses 0→100); discipline +2 a 30-min window, `last_praise` moved on every press (1234), so praising more often earns none. |
| C3 fake calls are machine-readable | **Confirmed, narrower** | `_reason` 1961-1963 gives `call_fake`, published as `reason_key` (`sensor.py:125`); whines need every stat > 50 (`_wants_to_whine` 754-760, `FAKE_CALL_MIN_STATS` rates 119) while a real happiness call needs < 25 | The `call_started` event already says `happiness` for a fake (933), the binary sensor carries no reason (83), the sentence is the same (1942-1943), and the notification offers Play and Scold for both (notify 73-80). So the tells are `reason_key`, the card's `reason.call_fake` line key (card 492) and the stat ranges. |
| C4 upbringing reads one instant | **Confirmed [sim]** | `upbringing_score` 955-959; `UPBRINGING_*` rates 156-163 | The careful player's discipline at adulthood ranges 28-79 across seeds, so the same play gives steady or devoted. |
| M1 normal care drifts underweight | **Confirmed [sim]** | `WEIGHT_*` rates 70-80 | careful is light from day 4.3. |
| M2 one miss silences a need for good | **Confirmed [sim]** | `_calls` 711-721 latch; `_rearmed` 676-683 | New evidence: the responder who lets one call a day go starves to health 1, because a missed hunger call never calls again. |
| M3 card games never spoil a whine | **Confirmed** | `start_game` 1258-1282 and `play_game` 1284-1370 end in `_resolve_call` (1369); `_call_condition` is always true for `fake` (672) | **PR #41 reconciled:** #41 made `apply_action("play")` spoil a whine (1184-1191). The card's Play button opens a game, which goes through `start_game`/`play_game`, not `apply_action`, so the card's main path still never spoils. PR 0f fixes the game path. |
| M4 games can be quit and rerolled for free | **Confirmed [sim]** | `play_game` 1303-1307 (a switch drops the old game); `start_game` 1272-1281 | 49% → 72%; a sure Higher or Lower opening after 2 restarts. |
| M5 fast-forward oversleeps | **Confirmed, half** | coordinator 1800; `shift_times` 312-333 skips `wake_at` | **`stayed_up_since` is already shifted** (331-332); only `wake_at` needs the fix. Debug-only. |
| M6 a lost game pays less than Play | **Confirmed** | rates 52, 73-74, 86-90 | Left or Right averages 17.5 happiness, Play 20; weight -4 vs -3. |
| Minor 1 chores farmable | **Confirmed, capped** | coordinator 525-545 (in-memory `_chores_done`) | Already capped at 5 treats a day (`chores_done`, model 1763-1774). Low impact. |
| Minor 2 a 10 a.m. nap is "tucking in" | **Confirmed** | coordinator 901-902 (any `how == "lights"`); `TUCK_IN_EVENING_HOUR` rates 290 is unused there | |
| Minor 3 a whine blocks real calls | **Confirmed** | `_calls` 707-734 (an open call returns early) | |
| Minor 4 snacks never refused | **Confirmed** | `apply_action` snack (1166-1174) | Each snack is -2 health and +6 weight. |
| Minor 5 the lights switch shows off while asleep | **Confirmed** | `switch.py` `is_on` = `lights_out` | |
| Minors 6, 7 card game display and old timers | = F01, F02 | | Wave 1a. |
| Minor 8 hearts round up | **Confirmed** | card 3123 (`Math.ceil`) | |
| Minor 9 device clock for countdowns | **Confirmed** | card 2135, 859-866 | |
| Minor 10 a refused game says its line twice | **Confirmed** | card 3888 and `_react` 3106 | |

**New from the re-run (not in the audit): the auditor's "sloppy" strategy never misses
a call**, so its row equalled "good". The new **casual** strategy, a person who opens
the card four times a day, gets **44-50 misses in 14 days** (seed 1: 34 poop calls,
each 30 min after a poop with a 20-minute window, about three a day; 8 sicknesses from
old poop; one energy and one hunger call). Neglect gets only 17, because missed calls
latch (M2). So today a person who checks in four times a day
raises a worse pet, by the numbers, than nobody at all. Wave 0 must fix this, and the
owner's "at most 2 missed calls a day counted" alone doesn't (open question N1).

## 2. What other plans already cover

| Item | Covered by | What remains for this plan |
|---|---|---|
| F04 bonds in a public attribute | Privacy hardening P3a (the `virtual_pet/subscribe` channel, `mine.bond`) and P3b (`sensor.py` drops `bonds` and `notify_users`) | Nothing. |
| F05 preference switches | Privacy P3a: `mine` = `{bond, notify_me, wish_for_you}`, pushed on change; the new `virtual_pet/my_day` command | **`my_day`, `birthday_kept` and `birthday_phone` are not in `mine`**, so after P3a they still come only from the visit and its two short replies. The privacy plan's test 3 expects "`virtual_pet/my_day` a `mine` push", but `mine` has no `my_day`. That is a **cross-plan change** (listed below), not this plan's. This plan's PR 1c adds all three to the visit's two short replies, and doesn't wait on P3a. |
| F08 events overwrite each other | Privacy P3a: personal moments (D–G) arrive by push as they happen, not in the 10-slot public list; the snapshot carries the server's `now` for `recent()`; `house.media` is deduped by `at`. P3c moves media out of `moments` into a push | The classes on the existing queue; care bursts (`log[0]` only); a catch-up line for a milestone missed while the card was closed. After P3a and P3c, moments come from **two streams**, so the classes sit at `_moment` and `_queue`, not in `_renderSlide`. PR 2a comes after P3a **and P3c**. |
| F03 filtered shelf | Forms book: **not covered** today | **Owner (Q1): house-wide.** A forms-book change (cross-plan list below); it lands in the forms book's PR 2a. |
| F10 four generations | Forms book: the creature page's "raised here" (newest four, then "and more"; decision 8) | The journal's family line (3437): PR 4g. |
| F12 art faults | Art reviews plan, phases 2 and 3 | Nothing new. Fix the plan's stale status line in its next PR. Phase 3's batch goes to the **Hatch API Art** session, as that plan says. |
| F13 beetle | Forms book decision 9 | Only the counts and the images (PR 4e). |
| O02 mature-stage reactions | Personality P2b (idle and mood lines) and P3 (per-type move weights in `_idle`, no new art) | P3 only reweights moves that already exist. This plan's O02 (PR 3c) is about **reactions to care** at baby, teen and adult, which P3 doesn't touch. |
| O05 next egg | Feature-gaps B (built: `select.<pet>_next_egg`, any ready species, "surprise me" default) | Choosing on the card (PR 4b). **Owner (Q8): raised ones plus "surprise me"**; (A10) allowed on a shared screen. |
| O06 more games | Feature-gaps C: Higher or Lower built; Catch a hidden prototype (`experimental_catch`); "Copy me" cut | **Owner (Q9): a mix of reflex and slower games, chosen freely.** Catch ships as a normal game (PR 4f, feature-gaps C2 full); a slower game is designed first, then built against a win-rate simulation (PR 4d). |
| O08 lost milestones | Feature-gaps: "Daily diary in the journal: not doing" | Milestones only (PR 4a). No diary. |

The **scope guard** in `plan-2026-10-27-feature-gaps.md` (shop, decorations,
household rhythms, trained tricks) is kept. O01 (pats) and O02 (reactions) come nearest
to "trained tricks". Both are reactions, not tricks: nothing is learned, unlocked or
counted.

### Changes this plan asks of other plans (not edited here)

Each goes into that plan's next PR. They are listed here so the builder of either side
finds them.

1. **Privacy plan, P2 ("forget my data"):** use PR 1b's shared confirm guard
   (`_confirmTap`), not "the `lay_egg` pattern with `CONFIRM_MS`" (privacy 858-859,
   1150). The forget row stays last among the person's own rows (privacy decision 12).
2. **Privacy plan, P3a:** add `my_day` to `mine`, or drop "`virtual_pet/my_day` a
   `mine` push" from its test 3.
3. **Forms book, decision 10:** "every same-world device **in the house**", not "on the
   card". `_bookOf`, the seeding rule ("waits for every slide") and "raised here" get
   house-wide rules: pets found by `hass.entities[id].platform === "virtual_pet"` with a
   `world` and `roster` in the attributes, never by entity-id pattern (a user may rename
   one). A device with no slide has no `s.ids.device`: "raised here" names it from its
   entity's device name, and it gives no new-page line (forms C8's "late device: no
   dot, no line" stands for it).
4. **Forms book, PR 2a:** the "older generations (N)" link (PR 4g) is the same
   `_renderJournal` edit; whichever lands second rebases onto the other.
5. **Art-reviews plan:** its status line ("plan only") is stale; phase 1 is merged.

## 3. The phases

Each numbered item is its own PR. Versions are **decided at build time**, on top of
whatever has shipped (0.35.0b4 onward belong to privacy hardening, as the forms book
also says). The bump goes last in each PR. Every PR runs `scripts/test` and
`scripts/card-check`. Sizes: S = a few hours, M = 1-3 days, L = more, or art-bound.
**Tiers** are the crew review tiers: 1 a normal slice, 2 a save or schema change (an
audit after it).

### Ordering against the plans in flight

- **Wave 0 goes first.** It is server balance, mostly in `model.py` and `rates.py`.
  Privacy P1 is merged (0.35.0), so the three Wave 0 PRs that change the save (0b, 0e,
  0f) validate their fields with its helpers (`_float`, `_int`, `_numbers`,
  `_records`, `_game` and others). Wave 0's own order: 0a → 0c → 0d, then 0b (after the
  owner's re-call pick) and 0f, then 0e last; 0g and 0h any time. PR 0f's server game
  changes come before PR 1a (the card side of the same games).
- **Privacy P1** (`_dropSlide`, the observer: privacy F6) is merged. Wave 1's game
  timers must also be cleared when a slide is dropped, so PR 1a builds on it (and goes
  after 0f). PR 1b and 1c don't touch slide teardown and can go any time.
- **Privacy P2** (forget my data) and **PR 1b** share the confirm guard. **P2 built it
  first** (0.36.0b1; see PR 1b), so 1b adopts it.
- **Privacy P3a** (the channel) and **P3c** (media pushes) go before Wave 2 (the queue
  reads both streams).
- **Privacy P3b** (the `_fire` scrub) goes before PR 2b (a new public moment must pass
  `PERSONAL_EVENTS` and `PRIVATE_EVENT_FIELDS`).
- **The forms book 2a** goes before PR 4b (the egg choice), PR 4c (status layout) and
  PR 4g (older generations).
- **Privacy P2** (the "forget my data" row) and **P3a** (the bell and "my day" over the
  socket) go before PR 4c: all three edit `_renderStatus`.
- **Privacy P1** (merged) provides PR 4a's `from_dict` validation helpers.

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
  `RECALL_HOURS` per pet, for the most urgent latched need (`CALL_PRIORITY`). A missed
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
  before; two latched needs re-call 4 h apart, the more urgent first; missing the
  re-call doesn't add to `care_misses`; a re-call event carries `recall: true`; a
  sickness sends one push; an old save loads with `latched_at` filled.
- **Sim Done:** `responder_miss1` min health ≥ 20 and steady (prototype: 57-76, steady
  66-76; main: 1); **calls started per pet per day** (the sim's `notify_day`: every
  `call_started` and `became_sick`, which is what option (a) would push, not the pushes
  under (b)-(d)): careful ≤ 4 (1.8-2.7), casual ≤ 6 (4.2-5.5), neglect and sleeper ≤ 6.5
  (6.0-6.2, 4.1-4.3). `--notify` prints the house push table below; the owner's pick
  sets its target.

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
  after the day's first `PRAISE_FULL_PER_DAY` (3) praises that gave happiness, at most
  `PRAISE_TIRED_HAPPINESS` (1) each. (The audit's "then 2" doesn't close it: one press
  per 30 minutes at 2 is 4 an hour, exactly the decay.) Praise still answers a happiness
  call when it lifts happiness to 25 or more.
- **The card (finding 25):** the discipline bar stays "today"; the status's "growing
  up: <grade>" uses the new score.
- **Saved fields** (all defaulted; P1's `_FLOATS` (68) and `_INTS` (86) and helpers):
  `discipline_sum`, `discipline_samples`, `wellbeing_sum`, `wellbeing_samples`,
  `last_sample_at`; `counted_misses`, `miss_day_at` (a timestamp, not a date, finding
  13), `miss_day_count`; `last_care_at`, `praised_care`; `praise_window_at`,
  `praise_count`, `praise_day_at`, `praise_day_count`; `upbringing_floor`.
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
  devoted (scrappy, 44-47) with a real happiness call a day (3.1-3.4); care_bot, which
  feeds, cleans, doses and praises but never plays, not devoted (scrappy, 28-29: its
  happiness sits under 10 most waking hours); praise spam ≤ 16 (14).

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
  full shows 4 hearts: 34 shows 1 heart, 96 shows 4.
- **Minor 9 (finding 24):** the hatch countdown (2203) and "time ago" (`timeAgo`, 861)
  use a server-time offset taken from something fresh: the `time_fired` of the next
  state event over the websocket, and P3a's snapshot `now` once it lands. Not
  `last_updated`, which only moves when a sensor changes and can be an hour old after a
  reload. Until a fresh reading arrives, the device clock is used with the skew capped.
- **Minor 10:** a refused game says its refusal line once (drop the `_pickGame` line and
  leave it to `_react`, 3136).
- **Tests:** card-check: 34 shows one heart and 96 four; with the device clock 10 min
  fast, the countdown matches the server's after one state event; a refused game writes
  one line.

### Wave 1: reliability (PR 0f before 1a)

**PR 1a: games carry on, old timers die (F01, F02; balance minors 6, 7).** Size
**S-M**, tier 1. **Card only**, on top of PR 0f.
- **Owner (A2): carry on.** `_pickGame` makes the same no-guess start call for Left or
  Right that Higher or Lower makes (`_playCall(s, {game: kind})`). The reply carries
  the running game (PR 0f): the card shows "round 3/5 · 1 right" and carries on, or a
  fresh round 1 if there was none. While waiting, the buttons are `aria-disabled`, as
  Higher or Lower's are (3853-3855).
- **Checked (corrected from draft 1):** an abandoned game was **not** "for nothing" on
  `afd56b9`: restarting a losing game until a win farmed `bond_record`'s "new record"
  line (model 1664-1671), bond `game` points and a favourite (coordinator 1683-1691),
  and a `dream_seed` (coordinator 895-897). Carrying on (A2) and PR 0f's "a dropped game
  with a guess is a loss" close that.
- Every delayed game callback captures the game object and returns unless
  `s.game === g`: `_guess`'s 900 ms timeout, Catch's kickoff (3844), and
  `_catchResolve`'s (already does). `_guess` (3910) reads `s.game.round` only after
  that check, so a game closed mid-request can't throw. `_endGame` and the slide
  teardown from P1 clear the timers they own (`s.gameTimers`).
- **Two viewers** share one server game (one `state.game`). Opening it on a second
  device now shows the real score instead of wiping it. A reply whose `round` is not the
  card's `round + 1` means someone else guessed meanwhile: the card ends its game with
  a line (copy C1), not a wrong score.
- **Tests:** card-check: stop a Left or Right game after one guess, reopen within 3 min,
  and the score reads round 2 of 5 with the first result kept; the same for Higher or
  Lower, with the same number; stop during the 900 ms window and start Higher or
  Lower, and the new game is untouched; open Catch, close and reopen it inside 900 ms,
  and exactly one round runs; a second browser guessing mid-game ends the first
  browser's game with C1; a game closed during a pending guess throws nothing.
- **Done =** the checks pass, and no `setTimeout` in the game code runs against a
  game other than the one it was made for.

**PR 1b: taps, one confirm guard, answers that wait (F07, F06, A1, A7).** Size **S-M**,
tier 1.
- `_call`: a per-button in-flight flag. A second tap while one is pending does nothing
  except the press feedback, and other buttons stay live. `.pending` and `.failed`
  stay as they are.
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
    650 ms) doesn't confirm either; the 4 s window still runs from arming. Card checks:
    "forgetting takes two taps, and a fast double tap is one" and "laying an egg takes
    two taps, with a pause between". 1b keeps the in-flight flag and the answers, and
    checks the guard on the three controls as its test line says.
- **Answers (owner A7: a failed save is not a try).** `_ask` with `keep` keeps the
  optimistic reply (the charm), then:
  - on failure, retries the `virtual_pet/answer` call once, quietly, after 3 s;
  - if that fails too, and the question is one of the four **once-questions** (whose try
    is counted: `fav_weather`, `fav_season`, `birthday`, `catchphrase`), keeps
    `{question, answer, at}` in `localStorage` for this person and device, and sends it
    before anything else at the next visit. `async_answer` (coordinator 1424-1468)
    stores those with no open-ask check (the catchphrase while the same generation's
    ask is unanswered), so **no server change**: a late answer is an answered question,
    and the try never mattered;
  - `dream` and `guess` are **not** resent: they are about tonight and tomorrow
    (`pick_dream` for now, `guess` for `P.tomorrow(today)`, 1464-1467), so a late
    answer would land on the wrong day. They aren't once-questions, so no try is lost;
  - a stored answer older than `ASK_LIKES_AGAIN_DAYS` (14) is dropped (the question may
    come again by then);
  - the bubble says C2 only when the retry also failed. It promises nothing.
- **Tests:** card-check: a double tap on feed sends one `button.press`; on each of the
  three guarded controls, a double tap under 600 ms does nothing and a second tap at 1 s
  confirms; with `virtual_pet/answer` stubbed to fail twice, the bubble shows C2, the
  answer is in `localStorage`, and the next visit sends it first; a failed `dream`
  answer isn't stored; pytest: a late `fav_weather` answer is stored.
- **Done =** the definition of done's "no duplicate effect from fast taps" and "visible
  failure" hold for every care button, the three guarded controls and the six kept
  questions.

**PR 1c: preferences and sound samples (rest of F05, F09).** Size **S**, tier 1.
- `coordinator.async_visit`: the too-soon (1075-1080) and asleep (1085-1092) replies
  carry `my_day`, `birthday_kept` and `birthday_phone`, like the counted one.
  `birthday_*` stay out on a shared screen as now (the card skips the visit there).
- **Status before any reply:** until a visit reply has set `_myDay` (a reload, or a
  failed visit), the "my day" row shows "…" and the birthday rows are hidden, never
  "off" (3196, `!!this._myDay`).
- **Owner (Q3):** the two samples go through `_maySample(s)`: the asleep, lights-out and
  quiet-hours rules of `_mayPlay` (which checks `lightsOut`, 2827), without "on show"
  (the person is on the status view). **The tap must still unlock audio**
  (`audio.resume()`, and `playChirp`'s context creation, inside the gesture): only the
  sound is skipped, or phones lose sound for good. A short status note says why (C3).
- **Tests:** pytest: a too-soon and an asleep visit both return the three fields for a
  person who has them. Card-check: the "my day" row reads "…" before the first reply; a
  second browser opening within the hour shows "my day: on" for a person who has it on;
  at a stubbed 22:00, turning "sounds here" on plays nothing and shows C3, and a chirp
  after a stubbed 09:00 plays.
- **Done =** status rows never show a default in place of the person's real setting,
  and no sample plays at night or while the pet sleeps.

### Wave 2: event fidelity (after privacy P3a and P3c; 2b after P3b)

**PR 2a: classes on the existing queue (rest of F08).** Size **M**, tier 1.
- **No second queue.** The card already queues lines: `s.queue`, `_queue` and
  `_sayQueued` (2439-2455) carry `_firstLook`'s lines (2497, capped at
  `FIRST_LOOK_LINES`, 3), visit notes and celebrations (2693-2713), questions with
  `ask` and `then` (2679-2681), the teen reveal (2869), `wish_granted` (2984),
  `bond_up` (2992) and `friend_home` (3004). The server budgets visit notes from the
  queued count the card sends (card 2663; coordinator 1128, `LOOK_LINES` 3). 2a adds a
  **class** to each queue entry and to `_moment`'s direct writes; it never drops an
  entry the server has counted as said.
- **The classes:**
  1. **mine**: the viewer's own care press (its `_react` reply), never overwritten for
     its 3 s. `button.press` returns nothing, and the log's `by` is a display name two
     people can share, so `_press` stores `{action, pressedAt}` in `s.pressed`, and the
     first new log entry with that action that **arrives** within 10 s of the press is
     "mine" (matched on arrival, not by comparing the browser's clock with the server's
     `at`, which `recent()` avoids, 2067-2068);
  2. **kept**: never dropped, may wait: questions, visit notes and celebrations,
     milestones, and lines the server budgets;
  3. **care by someone else**, call and sleep beats;
  4. **flavour**: may be dropped if it would wait more than 8 s, never replayed as a
     barrage.
- **Every moment type has a class** (one table in the PR, and a test that every
  `MOMENTS` member, coordinator 89-118, has one):

  | Class | Types |
  |---|---|
  | kept | `hatched`, `stage_changed`, `egg_laid`, `trait_learned`, `trait_deepened`, `wish_granted`, `bond_up`, `bond_record`, `bond_favourite`, `friend_home`, `tucked_in`, `favourite_snack`, `first_snow`, `first_frost`, **`care_miss`** ("...oh, there you are ♥" is never dropped), the forms book's new-page line, the teen reveal |
  | care / beats | `call_answered`, `woke_up`, `fell_asleep`, `good_morning`, `discipline_miss`, `became_sick` (2b), `someone_home` (privacy P3b) |
  | flavour | `sunrise`, `sunset`, `weather`, `forecast`, `news`, `pooped`, `tv_off_late`, `watching`, `listening`, and P3c's `tv_on`/`music_on` and `house.media` pushes |

  Phase 5's baby lines (`_lines`, `catch: false`) keep the class of the line they
  replace.
- A higher class interrupts a lower one, **except**: during a kept line, a running game
  or an open question, nothing of class 3 or 4 interrupts (it waits or, flavour, is
  dropped). `_moment`'s `say` writes into a running game's bubble today; under 2a it
  queues instead, like `_sayQueued` (which holds while `s.game`).
- **The order inside "kept"** is the queue's order, so the forms book's owner decision
  14 (stage line, then reveal, then new-page line) holds.
- **Care bursts:** every fresh log entry since `s.lastLogAt` is considered, not only
  `log[0]`. Two people's care in one update gives the newest one's reaction plus, if
  they differ, one short combined line (C4) instead of two overwrites.
- **Catch-up:** a kept milestone that `recent()` would drop (the card was hidden or
  closed) is said **once**, as a line of the next look. It **counts toward
  `FIRST_LOOK_LINES` and the `queued` sent to the server**, so a look never holds more
  than three lines. Seen-ness uses the one existing key, `hatch-seen-<device>` (2483),
  holding the newest milestone `at` this browser has said; no second key, nothing to
  prune. Flavour is never caught up. With PR 4a, the catch-up reads the kept
  milestones list, not the 10-slot buffer.
- **Tests:** card-check: inject wake + good morning + weather in one update, and the
  bubble shows good morning, then nothing about weather; a care press followed 1 s later
  by `pooped` keeps the care line for 3 s; a `stage_changed` 40 s old on reopening is
  said once and not again after a reload; a look with two queued notes and a catch-up
  line sends `queued: 3` and asks no question; a `care_miss` during a game waits and is
  said after it; two care entries in one update give C4; every `MOMENTS` type has a
  class.
- **Done =** no kept line is silent or said twice, and a person's own press is never
  overwritten by house flavour (the review's O03 rule).

**PR 2b: before, action, result (O03).** Size **S**, tier 1.
- **One** new public moment, checked against the privacy scrub (no `user`, `by` or
  `for`): `became_sick` (`model.py` 557 and 664) gets a "feeling poorly" beat: the sick
  frames already show, plus a line (C6) and a slow droop.
- **`chore_treat` is already built** (draft 1 was wrong): `_react` says "a treat!
  someone did a chore ♪" (card 3069-3071) and `PROP_FOR.chore_treat` shows the snack
  prop (409), from the care-log entry (model 1797). No new moment.
- **Recovery:** the medicine result is `ok` or `not_sick` (model 1200-1208), so any
  `ok` medicine **is** a recovery. `_react` gives medicine `ok` the "all better" reply
  (C8). No new moment.
- `wish_made`, `call_started` and `request_answered` stay out, as draft 1 said.
- **Tests:** pytest: `became_sick` lands in `self.moments` with no `user`; card-check:
  it shows C6 once; medicine `ok` shows C8.
- **Done =** every autonomous change of state that a person would care about has a
  0-3 s visible beat, and no new moment carries a person.

**PR 2c: what it wants, in order (O04).** Size **S**, tier 1.
- **Checked:** a missed call costs something quiet (`care_misses`, model 717; the
  upbringing score). **Owner (Q7): no clock anywhere.** `call_deadline` stays a sensor
  attribute for automations.
- **The real overlap:** the call's bubble text is the server's mood sentence (`_say`,
  2132-2143), written only when `sayUntil` is empty; it isn't a queued line. But
  `_sayQueued` (2451) doesn't check `s.calling`, so a queued first-look line (a wish
  mention) shows over a call. Fix: `_sayQueued` holds every non-kept line while
  `s.calling`. (`_wishMention` already waits: `_free` excludes `s.calling`, 2227.)
- **Status:** one "would like" row (C9), the call's need if calling, else the first
  request, placed **above** the wish row (which stays as it is, 3176-3178). So the owner
  sees the need first, then today's wish. The wording names the right button: "a meal"
  for a hunger call, never "a snack" (snacks are another button and add weight).
- **Tests:** card-check: calling + a queued wish line shows the call's line and the
  wish waits; the status row names the need above the wish; nothing renders
  `call_deadline`.
- **Done =** a glance at the card says what it wants most, with no countdown.

### Wave 3: the pet itself

**PR 3a: reduced motion, all the way (F11).** Size **S-M**, tier 1. Independent: it can
go any time, but before PR 4f (Catch).
- One `calm()` helper (today the `matchMedia` test is repeated in nine places).
- **Owner (Q4):** `_tick` under `calm()` holds frame 1. Frames change only when the
  mood or stage changes (a still picture, not a frozen one). Asleep pets show
  `asleep_1`.
- Poses (`poseFrames`) show their first frame for the same time, with no cycling.
- Catch under `calm()`: the prop **steps** to three fixed spots (far, near, at the pet)
  instead of sliding. The last step appears **exactly at `travel - window`**, the "too
  soon" boundary (`t < travel - window`, 4520), so a tap on the visible "at the pet"
  spot is never judged too soon. The catch window is the last step, at the same
  doubled length. Decoys step too. No transform.
- Flourishes (`_sparkle`, `_bondHearts`, bursts): already CSS, so already still; check
  that none is moved by JS.
- **Tests:** card-check with `emulateMedia({reducedMotion: "reduce"})`: the pet's `src`
  is the same over 5 ticks; a mood change swaps it once; Catch's prop takes exactly
  three `left` values per round, and a tap at the third step's first frame catches.
  Screenshots at 330 px of a calm Catch round, kept in the worker's `renders/`.
- **Done =** with reduced motion on, nothing on the card moves unless the person taps
  or the pet's state changes.

**PR 3b: a pat (O01).** Size **M**, tier 1, no art.
- **Owner (A3): the pat takes taps on the pet; a tap elsewhere on the screen still
  opens status; the Status button stays.**
- **A hit box, not the `img`:** `.screen img` has `pointer-events: none` (1028-1029),
  so a tap on the sprite falls through to the screen. Add a transparent `button.pat`
  sized to the visible body (the `.pet` box is 62% of the screen's height and about
  46% of its width, 1034), that moves with the pet (`go-left`/`go-right`, wander). Its
  handler calls `stopPropagation` and checks `_swiped`, and acts only on the slide on
  show (a tap on a peeking neighbour brings it forward, 1664-1667). It is **off**
  (`hidden`) during a game, an open question, the egg stage and the status view.
- **Card only (owner Q5):** no server call, no bond points, no counter, no event,
  nothing in HA history.
- The response: a `perk` or the existing `greethop`, a soft haptic where supported,
  and a line by mood (C10). A 4 s cooldown: a tap in the cooldown is a smaller wiggle
  and no line. Asleep: a "z" wiggle and no line, no sound. Sick: a slow lean in. On a
  shared screen it works the same way (it names nobody).
- **With the queue (2a):** a pat line is class 1 ("mine"), but **during a kept line, a
  game or an open question a pat gives the wiggle and no line**, so rapid pats can't
  cut off "I'm a teen now!".
- Lines go through `_speak` with **`catch: false`** (a catchphrase every third pat
  would be a flood, `catchCount` 2349-2353), and through `_lines` for baby talk (C10's
  route column).
- **Accessible:** `aria-label` "pat <name>" (C10); Enter and Space pat (it is a
  `button`). Under reduced motion only the line and the haptic happen.
- **Tests:** card-check: tapping the pet's box gives a C10 line and doesn't open
  status; tapping the screen beside it opens status; three fast pats give one line; a
  pat during a stage-change line keeps that line; keyboard Enter pats; no
  `callService` and no `callWS` is made; the box is hidden during a game.
- **Done =** the review's definition of done (feedback, no duplicates, accessible,
  reduced-motion equivalent), and nothing is stored.

**PR 3c: reactions at every stage (O02).** Size **M** without art, tier 1; art is a
later, separate batch (**L**).
- **No-art first.** Today only the child has species poses (`_petFrames` 2174,
  `_react` 3076, `_pounce` 4563); other stages get a CSS stand-in (`standIn`, 2046).
  But every non-beetle stage has ten mood frames (checked: 30 per stage across baby,
  teen and adult). Map a small reaction vocabulary onto **frames that already exist**,
  shown for 900 ms with a CSS move:
  | Reaction | Frames (baby, teen, adult) | Move |
  |---|---|---|
  | fed, accepted | `excited` | hop |
  | praised, won | `excited` | greethop |
  | refused care | `bored` | turn away (mirror) |
  | cozy / tucked in | `cozy` | settle (scale 0.97) |
  | music / TV | `content` | sway |
  | happy arrival | `excited` | perk |
- If personality P3 has merged, "praised" uses **the first move the type's row adds**
  in P3's table (personality 559-570), and `greethop` for types that add none (sweet).
  The weights aren't changed.
- **Owner (Q6): the art slice, then decide.** After the no-art set has been seen on the
  phone: one species with two poses (say `eat` and `cheer`) at baby, teen and adult:
  1 × 3 stages × 2 poses × 2 frames = **12 frames**, from the **Hatch API Art** session.
  All 30 species would be **360 frames**: the owner's call after the slice. The
  feature-gaps "trained tricks: not now" answer stands: these are reactions to care.
- **Tests:** card-check: with the stage stubbed to teen and adult, feed gives the
  `excited` frame for 900 ms, then the mood frame; under reduced motion the frame
  changes and nothing moves; one loop loads every `<stage>_<mood>_1.png` named by every
  `species.json` (the review's animation matrix).
- **Done =** an adult reacts visibly and differently to feed, praise, refusal and
  tucking in, with no new files.

### Wave 4: progression and polish

**PR 4a: milestones that wait (O08).** Size **M**, tier 2 (a saved list). After privacy
P1 and PR 2a.
- **Checked:** `state.memories` (`model.py:133`, kept 30, `MEMORIES_KEPT` 1402) holds
  only seasonal firsts today (`first_<kind>`, 1413), and the journal shows the newest
  six (`_memories`, 3709-3717). It is carried to the next generation (1061).
- **Owner (Q10):** the household's milestones are `hatched`, `stage_<stage>`,
  `trait_<trait>`, `egg_laid`. Never a person, never a bond, never media titles.
  Labels in `MEMORY_LABELS` (C11).
- **Its own list:** `PetState.milestones`, this generation's (cap 12). Mixing them into
  `memories` would push the seasonal firsts out within two or three generations.
- **Owner (A6): into the journal record.** `lay_egg` copies the retiring generation's
  milestones into its `journal` record (it already keeps species, traits and
  upbringing, model 1032-1061), **after** appending `egg_laid`, then starts the new
  generation's list empty. The journal shows each generation's milestones on its line,
  so "laid an egg" is seen.
- **Plumbing (audit #7):** `milestones` goes in `LifeStageSensor._unrecorded_attributes`
  (sensor 145-166, beside `memories`), so it never reaches Recorder history;
  `shift_times` shifts each `at` (it shifts `chore_treats` today, not `memories`: fix
  both), so `fast_forward` can't stamp future times; `from_dict` validates the list
  with privacy P1's hardened helpers.
- Fix `_memories`'s label fallback (3713): `m.kind.replace("_", " ")` replaces only the
  first underscore. Use `replaceAll`, and give every new kind a label.
- The daily dream and wish stay browser-local (`oncePerDay`).
- Not a diary: no daily entries, nothing to keep up, and the journal keeps showing six
  memories (newest first).
- **Tests:** pytest: hatching and a stage change append one milestone each, capped at
  12; `lay_egg` puts them and `egg_laid` in the journal record and empties the list;
  `memories` is untouched; `milestones` is absent from recorded attributes;
  `fast_forward` leaves every `at` in the past. Card-check: a stage change while the
  card was closed for an hour is said once on reopening and shows in the journal; the
  previous generation's line shows "laid an egg".
- **Done =** a milestone missed on one device can be found in the journal on any
  device, for every generation.

**PR 4b: the next egg on the card (O05).** Size **M**, tier 1. After forms book 2a.
- **Owner (Q8): raised creatures plus "surprise me".** The offer is **the select's
  `options` ∩ creatures raised here**, plus "surprise me". `egg_roster` is the next
  world's roster when `next_world` is set (coordinator 288-296), and
  `async_set_egg_choice` rejects anything else (1755-1762), so a raised creature of
  this world is not offered then.
- On the forms book's creature page (2a), under a hatched creature: "hatch one next"
  (C12), which calls `select.select_option` on `select.<pet>_next_egg`. **Hidden when
  `next_world` is set** (or when the creature isn't in the select's options).
- The status "next egg" row is **always shown for an adult** (today only when a
  creature is picked, `nextEgg ?`, 3192), reading "surprise" when none is, with
  "change" opening a small sheet of the offer above.
- Names: the select's `options` are display **names**; the card's `raised` holds
  species ids. Map ids to names through the select's own options (the coordinator's
  `egg_species_names`), never `species.json`.
- **Owner (A10): allowed on a shared screen**, like laying an egg.
- Read-only logins: `select_option` fails only for them. The card shows the controls
  and, on a refusal, says C13 in the status feedback.
- The review asks for "a clearly previewed inherited trait". Status already marks the
  inherited trait (`traitLabel`'s "↓", 3134). Previewing the *next* egg's trait would
  need the server to pick it early: out of scope.
- **Tests:** card-check: picking a raised creature sets the select and the egg screen
  says C15; an unraised one isn't offered; with `next_world` set, "hatch one next" is
  hidden and only the next world's raised creatures are offered; "surprise me" resets;
  the row shows "surprise" with nothing picked; on a shared screen it works.
- **Done =** a person can choose the next egg without leaving the card, the server
  never rejects an offered choice, and the book still hides what nobody has raised.

**PR 4c: status and settings apart; 44 px targets (O07).** Size **M**, tier 1. After
privacy P2 and P3a, and forms book 2a.
- **Owner (Q13, A8):** every current row, placed:

  | Row (card 3165-3200) | Goes to |
  |---|---|
  | meters, mood | status |
  | would like (2c), wish | status |
  | you two (bond) | status |
  | traits, learning, personality | status |
  | weight | status |
  | growing up / raised | status |
  | best catch | status |
  | next egg (4b) | status |
  | care history, journal link, settings link | status |
  | **misses, whines** | **settings** (they tally a person's lapses: kept, but off the main view) |
  | notify me, my day, my birthday, birthday on my phone, baby talk | settings, the person's own rows, in that order |
  | forget my data (privacy P2) | settings, **last** of the person's own rows (privacy decision 12) |
  | sounds here, babble, shared screen | settings, the device's rows, after the person's |

- Every control in status and settings gets at least 44 × 44 px of hit area (today
  `.bell` is 26 px high, 1269; `.jlink` 28 px, 1266). The visual size can stay smaller
  through padding.
- **Tests:** card-check at 320, 360 and 420 px: no control's bounding box is under
  44 px; the settings view holds every row the table puts there, forget last among the
  person's own; tab order reaches each one; screenshots of both views at 320 and
  420 px.
- **Done =** status fits a phone without scrolling past settings to read the meters.

**PR 4d: one slower game (O06).** Size **M-L**, tier 1. **Owner (Q9): a mix of reflex
and slower games, chosen freely; (A5) best play wins 70-80%; Higher or Lower stays as
it is.**
- **Step 1: a design note for the owner, before any code.** One or two shapes, each
  with its odds. Two-choice games are allowed: they fit `.gl`/`.gr` and `play_game`'s
  guess shape (a new `GAMES` kind with two guesses), so a slower game doesn't need new
  buttons. The audit's sketch, for the note (numbers not recommended): a
  **push-your-luck dig** ("stop" or "more"; each round a fresh pile of, say, 6 berries
  and 2 bees; "more" digs one leaf; "stop" banks this round's berries; a bee loses
  only this round's; five rounds; a win at a total of T). The right stopping point
  depends on the odds, so care helps and nothing always wins. The server draws and
  settles a bee **in the same call**, so closing the game can't undo a loss.
  Hide-and-seek (three spots, three tries) fails the test and isn't offered.
- **Step 2, after the owner picks: the build.** Its **Done is a win-rate simulation**:
  a pytest that plays best play over many seeded games and asserts the win rate is
  **70-80%**, and a second assert that random play wins clearly less (proposal: at least
  20 points less), so skill matters. Higher or Lower (about 92%) is not held to this.
- PR 0f's rules apply: a reopen carries on; a dropped game with a guess is a loss; the
  opening is kept.
- Art: none for a first cut. Props, if any, from the **Hatch API Art** session.
- **Done =** the two simulation asserts pass, and the game plays with one thumb at
  330 px and in compact mode.

**PR 4e: the counts (F13).** Size **M**, tier 1. **Owner (A9): after the new axolotl
and moth adults land** (the art session is redrawing them now).
- `scripts/readme/art.py` reads the rosters from `worlds.json` and `species.json`
  instead of the hard-coded 13 in `WORLDS` (38-45) and `NAMES` (46-); `collect()`
  (372-392) is re-laid for 30 (about five per world column, not `col = w / 6`); the
  "COLLECT ALL 13!" banner (379) is drawn from the count.
- Re-render `docs/readme/hero.png` and `collect.png`; update the README alt text and
  captions (C14) and the guide's roadmap line 730 (drop "more species").
- `art.py` prints the alt text with the number it drew, so they can't drift again.
- **Done =** the README and guide name the number the images show, and the images show
  the new adults.

**PR 4f: Catch, a normal game (O06, owner A4).** Size **M**, tier 1. After PR 1a and
PR 3a (both change Catch's code).
- Feature-gaps **C2 full** (`plan-2026-10-27-feature-gaps.md` 224-312): the start call
  returns the five rounds; a `caught: n` finish call; rewards, play counts, bond and
  favourite, like the other games; the per-pet best in place of the browser-wide
  `BEST_CATCH_KEY` (card 3145, 4548-4552; "best catch" stays on status, A8); the shared
  decoy prop from the **Hatch API Art** session; Catch in the default picker, and
  `experimental_catch` retired.
- **Play is never gated behind reflexes:** with free choice, a person who can't do
  reflexes, or has reduced motion on, always has the slower games. That holds while at
  least one slower game is in the picker, which Left or Right and Higher or Lower are.
- PR 0f's rules apply (carry on, a dropped game is a loss).
- **Tests:** pytest: a finish call with `caught: 3` counts a game and pays like the
  others; a per-pet best. Card-check: Catch is in the picker without the experimental
  option; the best shows per pet.
- **Done =** Catch plays, pays and records like the other games.

**PR 4g: older generations (F10, owner Q2).** Size **S**, tier 1. After forms book 2a
(the same `_renderJournal` edit; cross-plan change 4).
- The family line (3437, `.slice(-4)`) keeps the newest four, then "older generations
  (N)" (C16), a tap that opens the rest, oldest first.
- **Tests:** card-check: with seven generations, four show and the link says 3; a tap
  opens them, oldest first.
- **Done =** every generation the journal keeps can be seen.

### F12 (art)

Not re-planned: `docs/plan-2026-10-28-art-reviews.md` phases 2 and 3. Phase 3's batch
(about 60 frames) goes to the **Hatch API Art** session, which picks Luna or Sol. Its
open question (all at once, or the axolotl and moth first) is still the owner's; the
axolotl and moth adults are being redrawn now (A9).

## 4. Sizes at a glance (build order)

| PR | What | Size | Tier | Waits on |
|---|---|---|---|---|
| 0a | Sleep pauses calls (energy too, until really rested); naps need tiredness; the switch shows sleep (C1, m5) | S-M | 1 | — |
| 0c | Weight (with a restoring term) and game rewards retuned (M1, M6) | S | 1 | 0a |
| 0d | Fake calls disguised; only care answers a happiness call; real needs first (C3, m3) | S-M | 1 | 0c |
| 0b | A missed call calls again after 4 h, one clock per pet; one push per sickness (M2) | S-M | 2 | 0d; re-calls bundled (owner, Wave 0 Q1); poop calls don't push (owner, Wave 0 Q4) |
| 0f | Games: carry on, a drop is a loss, no reroll, Play spoils a whine (M3, M4, A2) | M | 2 | 0d (before 1a) |
| 0e | Upbringing measures care; praise can't be farmed; migration at half weight (C4, C2) | M | 2 | 0b, 0f (last in Wave 0) |
| 0g | Fast-forward helper, chores, tuck-in, snacks (M5, m1, m2, m4) | S | 1 | — |
| 0h | Hearts, server clock, one refusal line (m8-m10) | S | 1 | — |
| 1a | Games carry on, old timers die (F01, F02, m6, m7) | S-M | 1 | 0f (privacy P1 merged) |
| 1b | Taps coalesced, one confirm guard, answers that wait (F07, F06, A1, A7) | S-M | 1 | — (P2 adopts the guard) |
| 1c | Preferences on every visit, quiet samples (F05, F09) | S | 1 | — |
| 2a | Classes on the existing queue, bursts, catch-up (F08) | M | 1 | privacy P3a, P3c |
| 2b | Feeling poorly, all better (O03) | S | 1 | 2a, privacy P3b |
| 2c | Wants in order, no clock (O04) | S | 1 | 2a |
| 3a | Reduced motion throughout (F11) | S-M | 1 | — |
| 3b | A pat (O01) | M | 1 | 2a (can ship before with a plain `_speak`) |
| 3c | Reactions at every stage, no art (O02) | M | 1 | — (art slice later: L) |
| 4a | Milestones kept, then into the journal record (O08) | M | 2 | privacy P1, 2a |
| 4b | Next egg on the card (O05) | M | 1 | forms book 2a |
| 4c | Status and settings apart, 44 px (O07) | M | 1 | privacy P2/P3a, forms book 2a |
| 4d | A slower game: design note, then a build held to 70-80% (O06) | M-L | 1 | the owner's pick of the design |
| 4e | README and guide counts, `art.py` re-laid (F13) | M | 1 | the new axolotl and moth adults |
| 4f | Catch, a normal game (O06) | M | 1 | 1a, 3a, the decoy prop |
| 4g | Older generations (F10) | S | 1 | forms book 2a |

## 5. Copy (proposals; the owner decides the words)

Route: `_lines` = a baby-talk key (phase 5), "normal" = the same at every stage.
`catch` = whether the catchphrase may be added. Every line passes the no-nagging scan
(personality 279-283: no "!!!", no word repeated more than twice in a row, none of
"still", "again", "why", "never", "pleas", "sad", "cry", "alone", "forgot", and no `?`
that asks the person for something), which the copy test runs over C1-C16 and W1-W4.

| # | Where | Proposal | Route | catch |
|---|---|---|---|---|
| W1 | Lights out refused, not tired (0a) | "not sleepy yet ♪" | `_lines` (baby "no sleepy!") | no |
| W2 | Guide, fake calls (0d) | "A whine and a real plea to play often look alike: the hearts are the best clue." (owner Q2: "often look alike") | guide | — |
| W3 | Assist, lights out refused (0a) | "<name> isn't sleepy yet." (`REFUSED["not_sleepy"]` = "isn't sleepy yet") | Assist | — |
| W4 | Bundled re-call push, if the owner picks (c) (0b) | two pets: "<A> and <B> would like a visit"; three or more: "<A>, <B> and <C> would like a visit"; one pet: its usual call text (no new copy) | notification | — |
| C1 | Someone else played this game meanwhile | "oh! someone else is playing with me" | normal | no |
| C2 | A kept answer failed to save, twice | "hm, that one slipped away ♪" | normal | no |
| C3 | Sound sample skipped (status feedback) | "sounds are on: quiet till morning ♪" (asleep: "sounds are on: shh, it's sleeping") | normal | no |
| C4 | Two kinds of care at once | "<first> and <second>! ♥" (e.g. "snacks and a bath! ♥") | normal | no |
| C5 | Catch-up milestone on the next look | stage: "guess what? I'm a <stage> now!"; trait: "I learned something: <trait>!"; hatched: "hello! I hatched while you were away" | `_lines` | no |
| C6 | `became_sick` | "I don't feel so good..." | `_lines` | no |
| C8 | Medicine `ok` | "all better! ♪" | `_lines` | no |
| C9 | Status "would like" row | label "would like", value: "a meal", "a bath", "a nap", "medicine", "to play" | normal | — |
| C10 | A pat | content: "hehe ♥"; excited: "hehe! ♪"; sleepy: "mmm..."; sick: "thanks... ♥"; hungry and dirty: the content line; aria-label "pat <name>" | `_lines` | **no** |
| C11 | Milestone labels (journal) | "hatched", "became a child/teen/adult", "learned <trait>", "laid an egg" | normal | — |
| C12 | Creature page, next egg | "hatch one next"; chosen: "next egg ✓" | normal | — |
| C13 | Next egg refused (read-only login) | "only someone who can change things can pick" | normal | — |
| C14 | README alt text | "…a parade of all thirty creatures"; "Collect all 30: the adult creatures of every world, with the eggs they hatch from" (the number from `art.py`) | — | — |
| C15 | Egg screen, a creature chosen | "a <creature> is on the way" | normal | no |
| C16 | Journal family line | "older generations (<N>)" | normal | — |

C7 (`chore_treat`) is gone: the line exists (card 3070). A refused snack (0g) reuses
the meal's existing "full" line; no new copy.

## 6. Decided, and still open

### Decided (owner, 2026-10-28)

| # | Question | Decided |
|---|---|---|
| Q1 | F03: count creatures raised by every pet device in the house? | **Yes, house-wide**, in the forms book's PR 2a (cross-plan change 3). |
| Q2 | F10: show generations older than four? | **Yes, "older generations (N)"** (PR 4g). |
| Q3 | F09: samples silent at night and asleep? | **Yes**, with C3; the tap still unlocks audio. |
| Q4 | F11: reduced motion holds one frame? | **Yes.** |
| Q5 | O01: a pat gives nothing kept? | **Yes.** |
| Q6 | O02: the 12-frame slice? | **Yes to the slice**; the rest after it's been seen. |
| Q7 | O04: show how long the pet will wait? | **No clock anywhere.** |
| Q8 | O05: which creatures can be picked? | **Raised ones plus "surprise me"** on the card; the select keeps all. |
| Q9 | O06: a slower game, and Catch? | **A mix of reflex and slower games, the player choosing freely.** Catch ships (4f); a slower game is designed, then built to a 70-80% simulation (4d). |
| Q10 | O08: which milestones? | **Hatched, each stage, each trait learned, egg laid.** |
| Q11 | F13: re-render when? | Superseded by **A9**: after the new axolotl and moth adults. |
| Q12 | F07: the confirm gap? | **600 ms**, in the shared guard. |
| Q13 | O07: a settings view? | **Yes**, linked like the journal. |
| A1 | "Forget my birthday" under a two-tap confirm? | **Yes**; one shared guard for every irreversible control, coordinated with privacy P2. |
| A2 | Reopening a game within 3 minutes? | **Carries on with the real score**, both games. |
| A3 | The pat takes taps on the pet? | **Yes**; elsewhere still opens status; the Status button stays. |
| A4 | Catch a normal game? | **Yes**, after 1a and 3a. |
| A5 | The slower game's ceiling? | **70-80% for best play**; Higher or Lower stays as it is. |
| A6 | Milestones at the egg? | **Into the generation's journal record.** |
| A7 | A failed save, a try? | **No.** |
| A8 | Status rows? | **Weight, learning, growing up and best catch stay**; misses and whines move to settings. |
| A9 | README images when? | **After the new axolotl and moth adults land.** |
| A10 | Next egg from a shared screen? | **Allowed**, like laying an egg. |
| Balance C1 | Lights-out and calls | **Pause** the call while asleep; a nap only when tired or near bedtime. |
| Balance C3 | Fake calls | **Truly disguise** them: the same key and overlapping ranges. |
| Balance C4 | Upbringing | **Rework**: averaged discipline, discipline from good care, praise farming limited, at most 2 missed calls a day counted; tier 2 with a migration. |
| Balance M1, M2, M6, minors | Retune | **Retune with sims**, each change checked by a 14-day simulation. |
| Wave 0 Q2 | A disguise unsure only while happiness is 25-40? | **Accepted**; the guide says whines and real pleas "often look alike" (W2). |
| Wave 0 Q3 | Discipline earned under the old rules? | **Hours lived before the update count at half weight**; and no pet drops a grade because the rules changed (decisions file). |

### Still open (new in draft 2)

| # | Question | Recommendation |
|---|---|---|
| N1 | **What should a casual player raise?** A person who opens the card four times a day misses three to four calls a day today (most are poop calls), and with "at most 2 a day counted" at 6 points each, 13 days of childhood cost 156 points: scrappy, the same as neglect. (Corrected in draft 3: neglect's misses don't reach the cap; its calls latch, and a missed re-call isn't another miss, so neglect counts fewer misses than casual. Only wellbeing orders them: Wave 0 audit row 10.) | **Steady.** Lower `UPBRINGING_MISS_COST` (start at 2), and make the care half part misses, part an **hourly wellbeing sample** while awake (share of hours with no meter at 0 and not sick), the same sampling as discipline's. Tune so careful is devoted, casual steady and neglect scrappy on every seed (the sim's bands). No new stat on screen. |
| N2 | Poop calls are most of a casual player's misses (about three a day, 20-minute window, 30 min after each poop; with the sickness old poop brings, about 80%). Keep them as calls? | **Keep them**, but let N1 absorb the cost (the cap and the lower cost). Revisit only if the casual band can't be met. |

### Still open (new in draft 3)

| # | Question | Recommendation |
|---|---|---|
| Wave 0 Q1 | **How should re-calls reach phones** with several pets? (a) per pet, one per 4 h; (b) a house budget a day; (c) one bundled push per 4 h naming every pet still asking; (d) card only. Numbers in PR 0b: 4 neglected pets get 24.4 pushes a day under (a), 7.6 (b), 10.3 (c), 5.6 (d); careful and casual players get no re-calls under any option. | **Owner: (c), bundled**, as a normal push (W4). |
| Wave 0 Q4 | **Poop calls on phones?** A casual player's pet sends 4.9 pushes a day; 2.5 are poop calls (N2 kept them as calls). A casual 4-pet house gets about 20 a day today, 16.6 with 0b's one-push-per-sickness fix, and about 6.7 if poop calls stayed on the card and the sensors but sent no push. | **Owner: yes, card only.** A `dirty` call sends no push; it lands in 0b. |

## 7. QA beyond the PRs

From the review's QA section, kept for the builders:

- **Temporal:** cancel and restart, change game, double tap, a card destroyed mid-request,
  a stale reply, a dropped websocket, sleep and wake with a question open. Covered by
  0f, 1a, 1b; "destroyed mid-request" by privacy P1's `_dropSlide` checks plus 1a's
  timers. Sleep with a call open: 0a.
- **Cross-device / cross-person:** two browsers on one login (1c, 1a), two logins (privacy
  P3a), a filtered shelf (Q1), shared screen (privacy FA, 3b, 4b).
- **Balance:** `scripts/balance_sim.py --check` after every Wave 0 PR, and after any later
  PR that touches `rates.py` or `model.py`'s care, call or game code.
- **Animation matrix:** every stage × species × mood frame loads; a loop in card-check
  over `species.json` (PR 3c). The art plan's `check.py` already scans every live
  folder for baselines.
- **Bursts:** 2a.
- **Input:** 320/360/420 px, keyboard, live regions, 44 px (4c); haptics on Android vs
  iOS, sound unlocked vs blocked: the owner's phone test (HANDOFF already owes one for
  the photo), one combined pass after Wave 3.

## The audit of draft 1 (25 findings) and what changed

This table wins where it differs from the sections above. Every finding was checked
against `afd56b9` before it was folded in. **All 25 held**; none is rejected. Small
corrections are noted in their rows. From the balance audit, one claim is rejected in
part: M5's "same for `stayed_up_since`" (`shift_times` already shifts it, model
331-332).

| # | Finding | Change |
|---|---|---|
| 1 | Not every irreversible control is guarded: "forget my birthday" is one tap (card 3267-3277); privacy P2 copies the `lay_egg` confirm and its flaw. Verified | PR 1b: one `_confirmTap` guard (arm, ignore < 600 ms, confirm within 4 s) for laying an egg, forget my birthday and P2's forget my data; cross-plan change 1. Owner A1: yes |
| 2 | 2a designed a second queue beside `s.queue`/`_queue`/`_sayQueued` (2439-2455), whose entries the server budgets (`queued`, coordinator 1128). Verified | PR 2a rewritten as classes on the existing queue; kept lines never dropped; the catch-up line counts toward `FIRST_LOOK_LINES` and `queued`; order against a question, a game and the forms-book line specified |
| 3 | 2a's classes covered only part of `MOMENTS`; P3c missing from the ordering. Verified (coordinator 89-118) | One class table for every type, present and coming; `care_miss` is kept; 2a waits on P3c too; a test that every `MOMENTS` type has a class |
| 4 | Q9 answered, but 4d and the Catch text said "open". Verified | PR 4f (Catch, C2 full) added; 4d is a design note, then a build held to a win-rate simulation; Q9 recorded |
| 5 | 1a turned a display bug into a free restart that farms records, bond points and dream seeds; a second viewer would wipe the first's game. Verified (model 1664-1671, coordinator 1683-1691, 895-897) | Owner A2: carry on, both games. PR 0f makes the server carry on and count a dropped game with a guess as a loss; 1a is card-only and shows the real score; draft 1's "Checked" claim corrected in 1a |
| 6 | Q10's `egg_laid` milestone was dropped the moment it was written. Verified | Owner A6: `lay_egg` copies the milestones, `egg_laid` last, into the generation's journal record (PR 4a) |
| 7 | 4a's plumbing: `_unrecorded_attributes`, `shift_times`, P1's validation. Verified (sensor 145-166; `shift_times` shifts `chore_treats` only) | All three added to 4a, which now waits on P1; `memories` gets the `shift_times` fix too; tests added |
| 8 | "As the server already allows" was false: four kept questions are once-questions whose try is counted when sent. Verified (coordinator 1389-1391, people 282-290) | Owner A7: a failed save isn't a try. PR 1b retries once, then keeps a once-question's answer locally and sends it at the next visit; `async_answer` accepts a late one, so no server change. `dream` and `guess` aren't resent (they'd land on the wrong day) and cost no try. C2 promises nothing |
| 9 | 2b's `chore_treat` is already built; `recovered` is any medicine `ok`. Verified (card 3069-3071, 409; model 1200-1208) | `chore_treat` and C7 dropped; C8 on medicine `ok`; 2b adds only `became_sick` (size S) |
| 10 | Q1 overrides the forms book's decision 10 without changing the forms book; matching by entity id breaks on rename. Verified (forms book 37) | Cross-plan change 3: decision 10 house-wide, `_bookOf`/seeding/"raised here" rules, pets found by platform plus `world`/`roster`. The P3a note moved to cross-plan change 2 |
| 11 | 4b could offer creatures the server rejects; no row on "surprise me"; names vs ids. Verified (coordinator 288-296, 1755-1762; card 3192) | The offer is the select's options ∩ raised; "hatch one next" hidden with `next_world`; the row always shows for adults; names through the select's options; C15 added |
| 12 | 3b's pat targeted an `img` with `pointer-events: none`. Verified (card 1028-1029) | A transparent `button.pat` hit box, on show only, with `stopPropagation` and `_swiped`, hidden during a game, a question, the egg and status. Owner A3: taps on the pet pat |
| 13 | A class-1 pat could cut off milestones and questions. Accepted (follows from 2a's rule) | During a kept line, a game or a question a pat wiggles and says nothing |
| 14 | 2c's "call line" isn't a queued line; `_sayQueued` doesn't check `s.calling`; a "would like" row half-repeats the wish row; "a snack" is wrong for hunger. Verified (card 2132-2143, 2451, 2227, 3176-3178) | `_sayQueued` holds non-kept lines while calling; one "would like" row above the wish row; C9 says "a meal" |
| 15 | 4e is more than a render pass: `art.py` hard-codes 13 and lays out six columns; the new adults are coming. Verified (art.py 38-50, 317, 379, 386) | 4e is size M: rosters from the JSON, `collect()` re-laid, the banner from the count. Owner A9: after the new axolotl and moth adults |
| 16 | Copy broke the owner's rules: C2 ("forgot", "again", a promise), C10 ("again! again!", nagging hungry/dirty lines). Verified against personality 279-283 | C2 "hm, that one slipped away ♪"; C10 excited "hehe! ♪", hungry and dirty use the content line; the scan runs over every new line |
| 17 | New lines didn't say how they're routed (`_lines`, `catch`); pat lines with `catch: true` would flood. Verified (card 2349-2353) | A route and a `catch` column in the copy table; pat lines `catch: false` |
| 18 | 1c's Done can't be met by the server change alone: a reload or a failed visit leaves `_myDay` undefined, shown as "off". Verified (card 2660-2662, 3196) | Status shows "…" for "my day" and hides the birthday rows until a reply; a card-check for it |
| 19 | F10/Q2 had no PR; the family line is 3437. Verified | PR 4g, after forms book 2a (cross-plan change 4); line fixed |
| 20 | 2a's "mine" compared the browser's clock with the server's `at`. Verified (comment 2067-2068) | Matched on arrival within 10 s of the press |
| 21 | 3a's Catch step timing must sit on the "too soon" boundary; `_maySample` must check `lightsOut`. Verified (card 4520, 2827) | Both stated in 3a and 1c, with a card-check for a tap at the last step |
| 22 | 3c's "the type's favourite move" doesn't exist. Verified (personality 559-570) | The first move the type's row adds; `greethop` for sweet |
| 23 | 4c dropped rows without saying so; the forget row must stay last. Verified (card 3184-3191; privacy decision 12) | 4c lists every current row; owner A8 placed weight, learning, growing up and best catch on status, misses and whines in settings; forget last of the person's rows |
| 24 | Small slips: `.slice(-4)` at 3437; `raised` 3423-3426; `rates.py:220` is `PLAYER_WIN_HAPPINESS`; `chore_treat` 1797 is `model.py`; catch-up `localStorage` with no pruning; two "seen" schemes. Verified | Lines fixed; the `PLAYER_WIN_HAPPINESS` paragraph removed with 1a's old "Checked" claim; the catch-up uses the one `hatch-seen-<device>` key |
| 25 | The art-reviews status line is stale. Verified (`2598fec` is an ancestor of main) | Cross-plan change 5; no change here |

### The owner's other answers and the balance audit, folded in

| Topic | Change |
|---|---|
| Q1-Q13 | Recorded as decided, as recommended, except Q9 (a mix of games, chosen freely) and Q11 (superseded by A9) |
| A1-A10 | Recorded as decided (section 6) and built into 1a, 1b, 3b, 4a, 4b, 4c, 4d, 4e and 4f |
| The balance audit | New **Wave 0** (PRs 0a-0h), first in the order; its minors 6 and 7 are Wave 1a; M3 reconciled with #41 (the game path, not button Play); M5's `stayed_up_since` half rejected |
| `scripts/balance_sim.py` | Added in this PR, from the auditor's `sim.py`-`sim4.py`, on the real package. Two changes from the originals: strategies decide from what the sensors show (so C3 can fool them), and a real **casual** strategy replaces "sloppy", which never missed a call. Today it fails 29 bands, as expected |
| Casual play | New finding from the re-run; open questions N1 and N2 |

## Decided after draft 2 (owner, 2026-10-28)

- **N1:** a casual player (about 4 looks a day) raises a **steady** pet. Lower the cost per
  miss and blend an hourly wellbeing sample into the care half, tuned by the sims so careful
  play ends devoted, casual steady and neglect scrappy.
- **N2:** poop calls stay as calls; N1's retune absorbs their cost.
- **Copy approved:** W1 "not sleepy yet ♪" (baby "no sleepy!"), W2 (the guide's fake-call
  sentence), C2 "hm, that one slipped away ♪", C15 "a <creature> is on the way", and the
  rest of the copy table as written.
- Wave 0 gets its own adversarial audit before it builds.

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
| 23 | 0h's hearts: rounding down shows a full pet as not full. Verified (card 3192) | 0h: nearest half, full at `FEED_FULL_AT`; card-check 34 → 1, 96 → 4 |
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
