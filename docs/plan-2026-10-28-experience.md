# Plan: the experience review (13 defects, 8 opportunities) and a balance wave

**DRAFT 3, 2026-10-28.** A plan for the owner's review: nothing here is built. Draft 1
was audited adversarially (25 findings, all checked against main and folded in), the
owner answered its questions (Q1-Q13 and the audit's A1-A10), and a separate gameplay
balance audit added **Wave 0: balance**, which goes first. **Draft 3 rewrites Wave 0**
after its own adversarial audit (27 findings, all folded in and prototyped; every sim
band passes on 10 seeds) and evaluates how re-calls should reach phones in a house of
several pets (Wave 0 Q1, in PR 0b). "The audit of draft 1 (25 findings) and what
changed" **wins** where it differs from the sections above it, and The Wave 0 audit (shipped;
now in `docs/archive/plan-2026-10-28-experience-history.md`) won for Wave 0. Code changes in
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
| F05 preference switches | Privacy P3a: `mine` = `{bond, notify_me, wish_for_you, my_day, baby_talk, birthday_phone, birthday_kept}`, pushed on change; the new `virtual_pet/my_day` command | **Stale since P3a (2a fold #15):** `mine` carries all the switches, `my_day` too (`coordinator._mine`); every visit reply carries them as well (`_visit_prefs`). |
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
  after 0f). PR 1b and 1c don't touch slide teardown; 1a and 1c may build in parallel, 1b after 1c.
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

### Waves 0 and 1 (shipped)

Wave 0 (balance, PRs 0a-0h) and Wave 1 (reliability, PRs 1a-1c) shipped in 0.35-0.36.
Their build detail and the Wave 0 audit (27 findings) are in
`docs/archive/plan-2026-10-28-experience-history.md`.

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
  | care / beats | `call_answered`, `woke_up`, `fell_asleep`, `good_morning`, `discipline_miss`, `became_sick` (2b), `someone_home` (privacy P3a, shipped 0.36.0) |
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

**2a plan review fold (s2532, 2026-10-31; wins over the 2a text above).** Reviewed with
privacy P3c against the P3b branch: FIX FIRST, plan edits only. 2a builds after P3c, on
the same branch. First-mate decision on its question (owner delegated): **catch-up
includes the viewer's own bond moments.**
- **Streams (#12):** catch-up reads the public `moments` plus `s.privateMoments` on a
  personal screen, public only on a shared one. `friend_home` is excluded (the first look
  says it). A restart loses private moments not yet said: accepted, as for public ones.
- **`hatch-seen-<device>` keeps its meaning (#13):** it is the away note's last-looked
  time, rewritten every minute. Store `{seen, said}` JSON in it (read the old number form
  too), or keep `said` as a `momentKey`. Compare `at` with `serverNow()` (audit #20).
- **Class table (#11):** after P3c, `tv_on`/`music_on` are "no line" on the card (the live
  line comes from `house.media`). The test checks `MOMENTS ∪ PERSONAL_EVENTS ∪
  MEDIA_EVENTS` (read from `coordinator.py`/`const.py` by a named regex in card-check)
  against the card's class table.
- **Missing classes (#14):** first-look lines (away note, dream incl. `house.dream`, wish)
  and `_wishMention` are kept; `bootMoments` keep their type's class. Card-check: a
  `house.media` push during a kept line is dropped, not said over it.
- Stale (#15): §2's F05 row: `mine` carries all the switches (`my_day` too) since P3a.

**2a reconcile (s2537, 2026-10-31), for 2b and 2c.** 2a is built on the P3b branch after P3c,
per its fold. Names, all in `hatch-pet-card.js`:
- **Classes:** `MINE` 4, `KEPT` 3, `BEAT` 2, `FLAVOUR` 1 (0 = the rest: a greeting, the mood
  line, a game's prompt). `MOMENT_CLASS` is the table (`became_sick` already a beat);
  `HatchPetCard.momentClasses` exposes it by name for card-check. Each `s.queue` entry has
  `cls` (`lineClass(q)`: none = kept), and `type` for a moment's line.
- **One door:** `_line(s, cls, text, ms, {then, at, write, type, perk, catch})` says it now if
  `_mayInterrupt(s, cls)`, else queues it (kept, beats) or, flavour, queues it with `dropAt`
  (now + `FLAVOUR_WAIT_MS`) or drops it. `_sayLine` puts an entry in the bubble, sets
  `s.sayClass`/`s.sayEntry`, runs `then` (a moment's sparkle, chirp and move go there, so
  they happen when it is said). `_write(s, text, ms, cls)` and `_speak(..., {cls})` record
  the class; an unclassed write is 0.
- **`_mayInterrupt(s, cls)`:** `MINE` always; else not during `s.game` or an open question
  (`_questionOn`: `.askday` on show, not `s.asking`), not while an entry of this class or
  higher waits in the queue, and only over a lower class. **3b's `_patMayTalk` doesn't exist
  on this branch** (3b hasn't landed here): when it does, its body becomes
  `this._mayInterrupt(s, MINE)`-style plus the fold's rule (a pat is wiggle only during a
  kept line, a game or a question) and keeps `!s.calling`.
- **`_sayQueued`:** drops expired flavour, then says the highest class first (queue order
  within a class). Asleep, kept lines wait and a beat or flavour may still be said. It still
  doesn't check `s.calling`: **2c adds that** (hold every entry with `lineClass(q) < KEPT`
  while `s.calling`; held entries stay queued). `_visit`'s `queued` counts kept entries only,
  so a held beat is never budgeted.
- **2b's C6** is a new `_moment` case: `say(...)` there goes through `_line` as a `BEAT`
  (`became_sick` is in `MOMENT_CLASS`). Put the droop in its `fx` (the third argument), and
  "dropped if `sick` is gone at say-time" in the same `then` or a check in `_sayLine`. C8 in
  `_react` goes through its `said = [...]` / `out()`, which is `MINE` for the viewer's own
  press (matched by `s.pressed`) and `BEAT` for someone else's.
- **Care:** `_care(s, fresh)` gets every fresh log entry (newest first); `_react(s, entry,
  {mine, both})` says one line. C4 nouns are `CARE_NOUNS` (C9's words plus "snacks"); a pair
  with no noun (praise, scold) says only the newest's reaction.
- **Catch-up:** `_catchUp`/`_catchUpLine` in `_firstLook`, after the welcome and before the
  away note. `hatch-seen-<device>` is `{seen, said}` (`_seenRead` reads the old number);
  `_markSaid` is called when a kept moment is said (or handled with no line).
- **Forms book's new-page line:** not on this branch (nothing to class yet); when it lands it
  goes through `_line(s, KEPT, ...)` after the stage line and the teen reveal.

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

**2b + 2c plan review fold (s2533, 2026-10-31; wins over the 2b and 2c text above).**
FIX FIRST both, plan edits only; report archived with the worker. **2b and 2c are one
Sonnet ship, built after P3c and 2a on the same branch.** First-mate decisions (owner
delegated): C6 before a coinciding `good_morning` (the cheer waits); a sick pet with no
live call shows "medicine" in the row; C9 gains "a blanket" and "a fan" (from the
existing request buttons, without their `?`).

*2b acceptance:*
- `became_sick` already exists with `cause`. Its public moment is `{type, at}` only (strip
  `cause` for this type, like P3c's media shape); the bus and notify keep `cause`. Test:
  moment keys == `{type, at}`; a simulated tick and an away pet add none; once per
  sickness (asleep: on waking, after `woke_up`).
- C6 "I don't feel so good..." (new `_moment` case) with a **droop**: a bounded `_animate`
  class (never infinite; under reduced motion one frame holds). `_lines` key with a plain
  fallback. A waiting C6 is dropped if `sick` is gone from `mood.flags` at say-time.
- C8 "all better! ♪" in **both** paths: after the medicine scene's cheer ends (the
  viewer's own tap: `_sceneAnswered` returns early today) and in `_react`'s `ok` branch
  (another viewer). Test both.
- A sick call following C6 in the same tick is accepted (C6 is a 4.5 s beat, then the
  server's call line). The existing `?` in sick-call copy is out of scope.
- Card-check 8b: an old card ignores `became_sick` without an error. Bench shot of the
  droop (and its reduced-motion hold); the owner checks the droop once on a tablet.
- **Done =** a pet falling sick shows C6 once; medicine `ok` shows C8; no new moment
  carries a person.

*2c acceptance:*
- Sources, all on the card already (no server change): the need = `mood.attributes.
  reason_key` when it starts with `call_`; the sick flag in `flags`; `requests` in
  list order. `call_deadline` is never read.
- Order: call > `sick` flag ("medicine") > requests in list order (`lay_egg` excluded).
  C9 values: "a meal", "a bath", "a nap", "medicine", "play", "a blanket", "a fan" (never
  `REQUEST_LABELS`, which carry `?`). Row hidden asleep, away, egg. It is the status
  sheet's row only; the `wanted` glow and the request button stay and agree with it.
- `_sayQueued` holds non-kept lines while `s.calling` (needs 2a's classes); held lines
  stay queued and counted once, and are said when the call ends. 2a's later body keeps
  `!s.calling` in `_patMayTalk`. PR 4c's status-row list gains this row.

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

**3a/3b plan review fold (s2528, 2026-10-30; wins over the 3a and 3b text above).**
Scout `hatch-at-home-s2528` against `1d72923`: both FIX FIRST, 29 findings (10 player-impact,
13 plan defects, 6 nits), plan edits only; full report archived with the worker. CARD =
`hatch-pet-card.js` at `1d72923`; names win over numbers. First-mate decisions on its five
questions (owner delegated "decide the obvious", 2026-10-30): **3b ships before 2a with a
stub; a pat while calling is wiggle only; asleep = a slowed `perk`, no text, no new art;
babies and children use the normal pat lines (no `BABY` keys yet); calm Catch has two steps.**

*3a acceptance:*
- `calm()` replaces all **14** `prefers-reduced-motion` sites plus `_ghosting`'s local
  `media()` (CARD 2962, 3050, 4137, 4209, 4487, 4569, 4616, 4894, 6062, 6543, 6659, 6899,
  7221; 4039-4043). Card-check grep guard: no `prefers-reduced-motion` string outside `calm()`
  and the CSS block (1340-1342).
- **Catch has shipped** (7215-7345) and its calm branch still slides the prop: 3a changes a
  shipped game; the "before 4f" ordering is dropped. Calm Catch: **two steps**, the prop
  appears at once at the far spot (left 0 %, right 84 %) and jumps to "at the pet" (28 % /
  56 %) at `travel - window - 50 ms` (a one-frame grace, so a tap on the visible last spot
  is never "too soon", 7276). Test with `page.clock` or `c.start`, not wall time. A live OS
  change applies from the next round (`c.calm` is per round). The catch pose jumps, no slide.
- Hold frame 1: when calm and the frame list changed, `_redraw` sets `s.frame = 0`
  (3805-3807, 4001); after a mood change the `src` ends in `_1`.
- Also still under calm: `_frames()` returns one frame (poses, `_linkPose` waves), the link
  guest's 700 ms `setInterval` is skipped (6945), the egg keeps the first `crack`/`wiggle`
  frame.
- Checked, no change: the beam (6910-6913), typewriter (4209-4217), boot (6062), cleaning
  fade (3050), idle moves (4137-4145); CSS `perk`/`hop` are already killed by the global rule.
- Tests: bench for the 330 px calm-Catch shots (`motion` field, `_startGame`, frozen
  `performance.now`); card-check for the tap judging and the `src` checks.

*3b acceptance:*
- Copy: the five C10 adult lines only; **`bored` and any mood outside C10's list use the
  content line**; babies and children use the same lines (no `_lines` route until `BABY`
  `pat.*` keys exist, owner may add later). Asleep: `perk` slowed (CSS), no line, no sound.
  Add no other player copy.
- **Stub for 2a:** `_patMayTalk(s)` = `!(s.sayUntil > now) && !s.queue?.length && !s.game &&
  !s.asking && !s.power && !s.calling`; otherwise wiggle only. 2a later replaces the body
  with its class rule (loosen only).
- The box: a `button.pat` placed by the same `.pet` rule (1634), added to the
  `MutationObserver` that copies `PERCH_MOVES` and `scale` (2833-2845), `z-index` above
  `.bubble` (1648) and below `.askday`, `.game`, `.status`, `.boot`. `aria-label` "pat
  <given name>" (species name as fallback), updated on rename.
- Hidden/inert when: not the current slide (a peeking neighbour's tap still brings it
  forward), `.screen.show-status` (covers settings, picker, journal), the game pick menu and
  a game (`:has()` as at 2086), `s.scene` (6117), `s.linking`, `s.power` (2965), `_booting`,
  away (3797-3801), `.askday` up, the egg stage. Mono needs nothing.
- Handler: `stopPropagation`; ignore `_swiped` when `e.detail === 0` (keyboard after a
  swipe still pats); `_tapped(patBtn, s)` for the `perk` + the existing `vibrate(12)` (no
  second vibrate, no `greethop`); line via plain `_speak(s, line, ms)` (never the `speak`
  helper at 4730, which passes `catch: true`); a wiggle without a line sets
  `s.movingUntil = now + 400` so `_idle` doesn't start a wander mid-wiggle. 4 s cooldown.
- Tests (card-check for behaviour, bench for the box position and hidden states): pat gives
  a C10 line and no status; tap beside the pet (outside 26.75-73.25 %, above 34 %) opens
  status; three fast pats, one line; a pat during a kept line, a game, a question or a call
  keeps it; swipe then Enter pats; peeking neighbour comes forward with no line;
  `catchCount` unchanged after 6 pats; no `callService`/`callWS` and `localStorage`
  unchanged in the 200 ms after a pat; one shared-screen pat; a visible focus ring.

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

**3c plan review fold (s2529, 2026-10-30; wins over the 3c text above).** Scout
`hatch-at-home-s2529` against `52e815e`: FIX FIRST, 14 findings (3 player-impact, 8 plan
defects, 3 nits), plan edits only; report archived with the worker. CARD names win over
numbers. First-mate decisions on its questions (owner delegated, 2026-10-30): **drop the
music/TV and happy-arrival rows** (no event; the `dance` stand-in and the greet already
cover them), **one reaction length, 2500 ms, at every stage** (the child's), **a lost game
gives no reaction.**

- Frames: 30 ready species x 3 stages x 4 moods = 360 files, **0 missing**. Beetle has no
  `species.json`, so it is not on the roster: skipped.
- **Personality P3 has not merged:** "praised" is `greethop` for every type. Revisit after P3.
- Build on what exists: a `_reactFrames(s, kind)` helper sets `s.poseFrames` from
  `${s.drawn}_${mood}_n` with `s.poseUntil = now + REACT_MS` (2500) for non-child stages,
  called from `_react` and `_pounce`'s non-child branch. No new hook in `_tick`. Child
  behaviour unchanged.
- Hooks (the four reactions): **fed** = log `action` `feed`/`snack`, `result` `ok`;
  **praised** = `praise`, `ok`; **won** = `game` with `result: "won"`, or a catch
  (`_pounce`); **tucked in** = `blanket` answered (`_answer_request`, `REQUEST_ACTIONS`);
  **refused** = the `REFUSALS` fallthrough in `_react`, only for `full`, `not_needed`,
  `already_clean`, `not_sick`, `not_sleepy`, `too_tired` (not `asleep`, `egg`, `away`,
  `no_game`, `unfair`, `spoiled`). `lost` takes no reaction.
- Moves: fed = a bounded class like `greethop` via `_animate` (**never `hop`**, which is
  infinite and stripped by `_redraw`); praised/won = `greethop`; refused = `look` for the
  reaction via `_animate` plus `_moving(s, ...)`; tucked in = a `transform` keyframe settle
  (not `scale`, which carries the species scale). When the reaction frame equals the
  current mood frame, the move alone carries it.
- Never while `s.scene`, `s.linking`, `s.game`, `s.power`, `s.asleep`, away or egg. A
  reaction does not clear `sayUntil`; `_patMayTalk` is unchanged, so a pat during a
  reaction wiggles. Under reduced motion only the `_1` frame changes (3a's rule).
- Tests: card-check stubs `sensor.life_stage` to teen and adult and injects a care-log entry;
  `src` is `<stage>_excited_*`, then back to the mood frame after `poseUntil`; whitelisted
  refusals only; an asleep refusal changes nothing; under reduced motion the `src` changes
  and no animation class sticks; a load loop over every species' 4 moods x 3 stages
  (`naturalWidth > 0`). Bench shots per stage x reaction frame.
- **Done =** a teen and an adult react visibly and differently to feed, praise/win, refusal
  and tucking in, with no new files.

### Wave 4: progression and polish

**Release scope (owner, 2026-10-30).** This release keeps only **PR 4e** (the counts and
images) and **the rest of PR 4c**: misses/whines move to the settings sheet, and every
status and settings control gets a 44 px hit area. The settings gear (its slice 1) already
moved the person's and the device's rows into the sheet. **Deferred to a later release:**
PR 4a, 4b, 4d, 4f and 4g, and the forms book (`plan-2026-10-28-forms-book.md`) that 4b,
4c's creature-page parts and 4g wait on. Catch stays behind `experimental_catch`.

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

**4c-rest + 4e plan review fold (s2534, 2026-10-31; wins over the 4c and 4e text).**
Both FIX FIRST, plan edits only; report and measurements archived with the worker.
**Two ships, 4c first** (no shared files). First-mate decisions (owner delegated):
the shell picker is in 44 px scope (about 1.4-2 tile rows in view, it scrolls); the
dots (24 px) and compact answer buttons (40 px) are out (later nit); species.json gains a
`short` name (the old thirteen kept; **the worker proposes the other 17 in its report
for the owner's sign-off before merge**); collect.png drops the egg row and the alt
phrase "with the eggs they hatch from"; hero and worlds.png keep the 2026-10-28 device
shots and re-lay only sprites and names (retaking devices is a later bench-wired job);
misses and whines go under the "for <name>" group, which always renders.

*4c-rest (the gear already moved the person and device rows, in the right order):*
- Move `misses` and `whines` from `_renderStatus` to the "for <name>" group (rendered
  even without `shell_finish_options` and on a shared screen; read-only). Card-check's
  `/whines/` asserts (~804, 830) move with them. Dependencies on forms book 2a and 4b are
  dropped (deferred). "my birthday" stays third; only "forget my data" must be last of
  the person's rows. The status-row list gains 2c's "would like" row.
- **44 px, real (min-height 44 and a 44 px pitch, not a padded hit area that overlaps):**
  `.bell` (44x26; 24 in the compact picker), `.gear` (34x30, though the gear plan said
  44), `.sback`/`.pback` (28 / 22 compact), `.jlink` (~42x28), `.shellrow` (38), picker
  tiles (37 / 34 compact) and `.psave`/`.pclose`. Already fine: `.statusbtn`, `.nav`,
  `.toy`, game buttons. Settings will scroll ~3-4 screens: accepted.
- **Done =** every control in status, settings and the picker is at least 44x44 at 330 and
  420 (a permanent card-check box-size assert); meters, mood and wish are visible without
  scrolling at both widths; settings holds every row; shared-screen settings still hide
  the person's rows and show misses/whines.
- Tests: bench boxes and shots at 330 and 420 (`settings`, `settings-shared`, `picker`
  presets; 320 as a shot), card-check for tab order and the forget two-tap.

*4e (A9 met: the axolotl and moth adults were redrawn at 128 and merged 2026-10-30):*
- The roster is 30 (worlds.json lists 31; beetle has no species.json, skip it as
  `catalog.roster` does); art.py asserts 30 and prints the count used in the alt text.
- Draw sprites at 128 (exact 2:1 of the 256 files), five rows per column in collect.png.
  Re-lay the hero strip (two rows, no overlap) and worlds.png (no KeyError on new names;
  fits the canvas). Labels use `short`, with a minimum text size.
- Copy to update: README.md line 2 ("all thirteen creatures"), 103 ("Collect all 13"),
  the art.py banner, guide.md ~854 ("still to come: more species").
- Verified from the repo files; the README's raw URLs show the new images after merge.
  A contact sheet goes to the first mate for the owner's look.

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
| 1b | Taps coalesced, one confirm guard, answers that wait (F07, F06, A1, A7) | S | 1 | 1c (build order); the guard is merged |
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
| C1 | Someone else played this game meanwhile (Higher or Lower, Left or Right) | "oh! someone else is playing with me" **(approved, first mate)** | normal | no |
| C2 | A kept answer failed to save, twice | "hm, that one slipped away ♪" **(approved, first mate)** | normal | no |
| C3 | Sound sample skipped (status feedback) | **(approved, first mate)** quiet hours: "sounds are on: quiet till morning ♪"; asleep: "sounds are on: shh, it's sleeping"; lights out by day: "sounds are on: shh, it's napping" | normal | no |
| C4 | Two kinds of care at once | "<first> and <second>! ♥" (e.g. "snacks and a bath! ♥") | normal | no |
| C5 | Catch-up milestone on the next look | stage: "guess what? I'm a <stage> now!"; trait: "I learned something: <trait>!"; hatched: "hello! I hatched while you were away" | `_lines` | no |
| C6 | `became_sick` | "I don't feel so good..." | `_lines` | no |
| C8 | Medicine `ok` | "all better! ♪" **(approved, owner 2026-10-29)** | `_lines` | no |
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
