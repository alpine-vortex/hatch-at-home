# Plan: the experience review (13 defects, 8 opportunities)

**DRAFT 1, 2026-10-28.** A plan for the owner's review: nothing here is built. An
adversarial audit of this draft comes next. No code changes in this PR.

The source is an outside "deep interaction, feature, animation and quality review" of
2026-10-28 at `0821baf` (0.35.0b3). It reports 13 defects (F01-F13) and 8 opportunities
(O01-O08), plus a QA section and a "definition of done" for new interactions. Both are
used below. (Its F numbers are its own: they are not the privacy plan's F1-F6.)

**Line numbers are for `origin/main` at `afd56b9`** (PR #39-#41 merged). Since `0821baf`
the card has changed by one line (2849), so the review's card references still hold;
`coordinator.py` is unchanged above line 1792; `model.py` has moved (cited fresh here).
Privacy P1 is being built on a crew branch; nothing of it is on main yet.

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
| F01 game cancel/reopen reuses the old server game | **Confirmed, narrower than reported** | card `_pickGame` 3832-3868 (the `left_right` branch, 3847-3849, writes a line and makes no call); `_endGame` 4573-4586 (local only); `model.play_game` 1284-1320 (no game: start one; a game of the same kind carries on until `GAME_IDLE_MINUTES`, 3, `rates.py:91`, `model.py:431`) | **Higher or Lower already resets:** its opening call has no guess, so it goes through `coordinator.async_play_game` 1676-1677 to `model.start_game` (1258), which replaces any game that has had a guess. Only Left or Right reuses the old game. A second viewer of the same pet also shares the one server game. |
| F02 old timers act on a newer game | **Confirmed** | `_guess` 3895-3941 (the 900 ms timeout checks only `!s.game`); `_pickGame` 3844 (Catch's 900 ms kickoff calls `_catchRound`, which checks only `kind`, 4465) | Catch's `_catchResolve` (4529-4560) already compares the game object; the other two delayed paths don't. |
| F03 a filtered shelf shows raised creatures as ??? | **Confirmed** | `_renderJournal` 3424-3427 (`raised` from `this._slides` only); the editor's device filter 4609-4659 | **Not fixed by the forms book.** That plan keeps this rule on purpose ("Multi-device homes": a device not on the card adds nothing). It needs an owner answer (Q1). |
| F04 every person's bond in a public attribute | **Confirmed; covered** | `sensor.py:216` (`notify_users`), `231-237` (`bonds`) | Privacy P3a/P3b (see section 2). Not re-planned here. |
| F05 preference switches wrong for up to an hour | **Confirmed** | `coordinator.async_visit`: the too-soon reply 1075-1080 and the asleep reply 1085-1092 carry `baby_talk` only; the counted reply 1133-1141 carries `my_day`, `birthday_kept`, `birthday_phone`. Card `_visit` 2673-2676 keeps the last value; status 3196-3198 shows `undefined` as "off" and hides the birthday rows | Privacy P3a covers only part of it (section 2). |
| F06 a failed saved answer is acknowledged, then dropped | **Confirmed** | `_ask` 2755-2775: the reply is spoken (2761) before `virtual_pet/answer` resolves; `.catch` (2772) says nothing | Six questions keep their answer (`keep: true`, 628-655): weather, season, dream, guess, birthday, catchphrase. |
| F07 repeat taps aren't coalesced | **Confirmed, and one case is worse than reported** | `_call` 3746-3758: `.pending` class only, no in-flight guard | **Laying an egg:** the request button's two-tap confirm (1642-1654, `CONFIRM_MS` 4000 at 765) takes any second tap within 4 s. A fast accidental double tap therefore passes the confirm, and laying an egg ends this pet's turn. It can't be undone. |
| F08 simultaneous events overwrite each other | **Confirmed; partly covered** | `_renderSlide` 2073-2077 (reacts to `log[0]` only); 2078-2088 (moments loop, each `_moment` writes the bubble at once through `_write`/`_speak`, 2838-2843); the 15 s `recent()` filter (2071) drops anything older | Privacy P3a moves personal moments to a pushed channel and gives `recent()` the server's `now` (section 2). The queue, the priorities and the catch-up remain. |
| F09 sound samples ignore quiet hours and sleep | **Confirmed** | `_mayPlay` 2823-2828 (`QUIET_HOURS` 21-8, line 92); the status "sounds here" sample 3244 and the babble sample 3292 call `playChirp`/`babble` directly | Both samples come from the person's own tap, which also unlocks audio on phones. Whether that is a defect is an owner call (Q3). |
| F10 the family line shows four generations | **Confirmed** | `_renderJournal` 3438 (`.slice(-4)`); `model.lay_egg` 1032-1061 keeps every record (`egg.journal = [*state.journal, record]`, 1057) | The forms book caps its "raised here" list at four, then "and more" (owner decision 8), but that is the creature page. The family line is separate: owner question (Q2). |
| F11 reduced motion doesn't stop JS movement | **Confirmed, partly** | CSS rule 874-876; `_tick` 2187-2224 swaps frames every tick whatever the setting; Catch `_catchRound` 4466-4499 slows (`calm`: travel ×1.6, window ×2) and drops the spin, but still slides | `_idle` already limits itself to mumble and pose under reduced motion (personality plan, "Idle manner"; card-check 1481), and typing is skipped (card-check 548-555). |
| F12 known art faults | **Confirmed; covered** | `docs/plan-2026-10-28-art-reviews.md` | Its phase 1 (`claude/elegant-pascal-44cy2y`, the axolotl/moth outline stopgap and resized frames) **is merged** (`2598fec` is on main), but the plan's status line still says "plan only". Phases 2 (octopus palette, tarantula eyes, gecko "!", bat) and 3 (the art batch: axolotl and moth adults, deer, kitten, squirrel) are open: no commits to those sprites since. |
| F13 stale counts in the README and guide | **Confirmed** | `README.md:2` ("all thirteen creatures"), `:103` ("Collect all 13"); `docs/guide.md:730` ("still to come: more species"). 30 `species.json` under `frontend/sprites/` | The alt text describes images that do show 13. Changing the number means re-rendering `docs/readme/hero.png` and `collect.png` (a render pass, not new art), or the alt text becomes untrue. **Beetle:** closed by forms book owner decision 9 ("nothing"); `species.py:roster` (32-36) already skips it. |

No defect is "Already fixed" or "Not reproducible". PR #39-#41 touched none of these
paths except the one card line in `call_answered` (2849), which no finding uses.

## 2. What other plans already cover

| Item | Covered by | What remains for this plan |
|---|---|---|
| F04 bonds in a public attribute | Privacy hardening P3a (the `virtual_pet/subscribe` channel, `mine.bond`) and P3b (`sensor.py` drops `bonds` and `notify_users`) | Nothing. |
| F05 preference switches | Privacy P3a: `mine` = `{bond, notify_me, wish_for_you}`, pushed on change; the new `virtual_pet/my_day` command | **`my_day`, `birthday_kept` and `birthday_phone` are not in `mine`**, so after P3a they still come only from the visit and its two short replies. The privacy plan is also inconsistent here: its test 3 expects "`virtual_pet/my_day` a `mine` push", but `mine` has no `my_day`. **For the P3a builder:** either add `my_day` to `mine` (simplest), or drop that line from test 3. Either way, this plan's Wave 1 adds all three to the visit's two short replies (PR 1c). That is a two-line server fix and doesn't wait on P3a. |
| F08 events overwrite each other | Privacy P3a: personal moments (D–G) arrive by push as they happen, not in the 10-slot public list; the snapshot carries the server's `now` for `recent()`; `house.media` is deduped by `at` | The single reaction queue with priorities; care bursts (`log[0]` only); a catch-up line for a milestone missed while the card was closed. Because after P3a moments come from **two streams** (public attributes and the private push), the queue must sit at `_moment`, not in `_renderSlide`. So PR 2a comes after P3a. |
| F03 filtered shelf | Forms book: **not covered.** It keeps the "devices the card holds" rule and adds a house-wide `virtual_pet.book` store only for deleted devices kept by choice | The owner's decision (Q1). If yes, it should land **in** the forms book's PR 2a (`_bookOf`), not as a separate change to `_renderJournal`: both read the same set. |
| F10 four generations | Forms book: the creature page's "raised here" (newest four, then "and more"; decision 8) | The journal's family line (3438). Owner question (Q2). |
| F12 art faults | Art reviews plan, phases 2 and 3 | Nothing new. Fix the plan's stale status line in its next PR. Phase 3's batch goes to the **Hatch API Art** session, as that plan says. |
| F13 beetle | Forms book decision 9 | Only the counts and the images (PR 4e). |
| O02 mature-stage reactions | Personality P2b (idle and mood lines) and P3 (per-type move weights in `_idle`, no new art) | Small overlap: P3 only reweights moves that already exist. This plan's O02 (PR 3c) is about **reactions to care** at baby, teen and adult, which P3 doesn't touch. PR 3c builds on P3's move table if P3 has merged and doesn't change its weights. |
| O05 next egg | Feature-gaps B (built: `select.<pet>_next_egg`, any ready species, "surprise me" default) | Choosing on the card. B's "any species" rule clashes with the forms book's plain silhouettes, so this needs an owner answer (Q8). |
| O06 more games | Feature-gaps C: Higher or Lower built; Catch a hidden prototype (`experimental_catch`), "whether Catch stays" is the owner's; "Copy me" cut | One slower game, if the owner wants one (Q9). Catch's fate stays with the owner. |
| O08 lost milestones | Feature-gaps: "Daily diary in the journal: not doing" | Milestones only, kept server-side in the existing `memories` list. No diary. |

The **scope guard** in `plan-2026-10-27-feature-gaps.md` (shop, decorations,
household rhythms, trained tricks) is kept. O01 (pats) and O02 (reactions) come nearest
to "trained tricks". Both are reactions, not tricks: nothing is learned, unlocked or
counted.

## 3. The phases

Each numbered item is its own PR. Versions are **decided at build time**, on top of
whatever has shipped (0.35.0b4 onward belong to privacy hardening, as the forms book
also says). The bump goes last in each PR. Every PR runs `scripts/test` and
`scripts/card-check`. Sizes: S = a few hours, M = 1-3 days, L = more, or art-bound.

### Ordering against the plans in flight

- **Privacy P1** (`_dropSlide`, the observer: privacy F6) is being built now. Wave 1's
  game timers must also be cleared when a slide is dropped, so **PR 1a goes after P1
  merges**. PR 1b and 1c don't touch slide teardown and can go any time.
- **Privacy P3a** (the channel) goes before Wave 2 (the queue reads both streams).
- **Privacy P3b** (the `_fire` scrub) goes before PR 2b (new public moments must pass
  `PERSONAL_EVENTS` and `PRIVATE_EVENT_FIELDS`).
- **The forms book 2a** goes before PR 4b (the egg choice) and PR 4c (status layout),
  since both change the journal or the status view.
- **Privacy P2** (the "forget my data" row) and **P3a** (the bell and "my day" over the
  socket) go before PR 4c: all three edit `_renderStatus`.

### Wave 1: reliability (after privacy P1 for 1a)

**PR 1a: games start clean and old timers die (F01, F02).** Size **S-M**.
- `_pickGame`: Left or Right makes the same no-guess start call Higher or Lower makes
  (`_playCall(s, {game: kind})`), so `start_game` drops any game with a guess
  (`model.py:1258`). It needs no new service, and an older server already accepts it:
  `start_game` takes any kind in `GAMES`. Show "left or right?" after the reply. While
  waiting, the buttons are `aria-disabled`, as Higher or Lower's are (3853-3855).
- Every delayed game callback captures the game object and returns unless
  `s.game === g`: `_guess`'s 900 ms timeout, Catch's kickoff (3844), and
  `_catchResolve`'s (already does). `_endGame` and the slide teardown from P1 clear the
  timers they own (`s.gameTimers`).
- **An abandoned game counts for nothing**, as today's 3-minute idle drop already
  does: no played or won count, no happiness, no bond point. Checked: a win's only
  extras are `GAME_WIN_HAPPINESS` and the player trait's `PLAYER_WIN_HAPPINESS`
  (`rates.py:220`, `model.py:1334-1350`), and the player trait counts games
  *finished* (`TRAIT_PLAYER_GAMES`, `rates.py:217`), so walking away from a losing game
  to start again buys at most a little happiness. The guide's games section says so
  in a sentence.
- Two viewers of one pet share one server game (one `state.game`). That stays as it is.
  Instead, the card copes: a reply whose `round` is not the card's `round + 1` means
  someone else played, and the card ends its game with a line (copy C1), not a wrong
  score.
- **Tests:** pytest: a Left or Right start after one guess resets `rounds` to 0; a start
  with no guess yet carries on (unchanged). Card-check: stop a Left or Right game after
  one guess, reopen within 3 min, and the score reads round 1 of 5; stop during the
  900 ms window and start Higher or Lower, and the new game is untouched; open Catch,
  close and reopen it inside 900 ms, and exactly one round runs; a second browser
  guessing mid-game ends the first browser's game with C1.
- **Done =** the four checks pass, and no `setTimeout` in the game code runs against a
  game other than the one it was made for.

**PR 1b: taps and answers (F07, F06).** Size **S**.
- `_call`: a per-button in-flight flag. A second tap while one is pending does nothing
  except the press feedback, and other buttons stay live. `.pending` and `.failed`
  stay as they are.
- **Laying an egg:** the confirming tap must come at least 600 ms after the first one.
  An earlier tap is ignored, and "sure? tap again" stays. Keep the 4 s window.
- `_ask` with `keep`: keep the optimistic reply (the pet answers at once, which is the
  charm), but on failure say a gentle line (C2) and leave `s.asking` free so the
  question can come back another day, as the server already allows. No retry button
  and no modal.
- **Tests:** card-check: a double tap on feed sends one `button.press`; a double tap
  (under 600 ms) on "lay an egg?" doesn't lay one, and a tap at 1 s does; with
  `virtual_pet/answer` stubbed to fail, the bubble shows C2 and nothing claims it was
  kept.
- **Done =** the definition of done's "no duplicate effect from fast taps" and "visible
  failure" hold for every care button and the six kept questions.

**PR 1c: preferences and sound samples (rest of F05, F09).** Size **S**.
- `coordinator.async_visit`: the too-soon (1075-1080) and asleep (1085-1092) replies
  carry `my_day`, `birthday_kept` and `birthday_phone`, like the counted one.
  `birthday_*` stay out on a shared screen as now (the card skips the visit there).
- F09, if the owner agrees (Q3): the two samples go through a `_maySample(s)` check:
  the asleep and quiet-hours rules of `_mayPlay`, without "on show" (the person is on
  the status view). **The tap must still unlock audio** (`audio.resume()`, and
  `playChirp`'s context creation, inside the gesture): only the sound is skipped, or
  phones lose sound for good. A short status note says why (C3).
- **Tests:** pytest: a too-soon and an asleep visit both return the three fields for a
  person who has them. Card-check: a second browser opening within the hour shows "my
  day: on" for a person who has it on; at a stubbed 22:00, turning "sounds here" on
  plays nothing, shows C3, and a chirp after a stubbed 09:00 plays.
- **Done =** status rows never show a default in place of the person's real setting,
  and no sample plays at night or while the pet sleeps.

### Wave 2: event fidelity (after privacy P3a; 2b after P3b)

**PR 2a: one reaction queue (rest of F08).** Size **M**.
- One queue at `_moment` and `_react`, fed by public moments, private pushes and care
  log entries alike. Each reaction gets a class:
  1. **mine**: the viewer's own care press (its `_react` reply), never overwritten for
     its 3 s. `button.press` returns nothing, and the log's `by` is a display name
     (kept, privacy Q4) that two people can share. So the card keeps its own record:
     `_press` stores `{action, at}` in `s.pressed`, and the next log entry with that
     action within 10 s is "mine";
  2. **milestone**: `hatched`, `stage_changed`, `egg_laid`, `trait_learned`,
     `trait_deepened`, `wish_granted`, `bond_up`, `bond_record`;
  3. **care by someone else**, `call_answered`, `woke_up`, `good_morning`;
  4. **flavour**: weather, sunrise/sunset, media, news, forecast, `pooped`.
- A higher class interrupts a lower one. One of the same class waits its turn (max 3
  waiting). Flavour that would wait more than 8 s is dropped, never replayed as a
  barrage.
- **Care bursts:** every fresh log entry since `s.lastLogAt` is considered, not only
  `log[0]`. Two people's care in one update gives the newest one's reaction plus, if
  they differ, one short combined line ("snacks and a bath!", C4) instead of two
  overwrites.
- **Catch-up:** a milestone of class 2 that `recent()` would drop (the card was hidden
  or closed) and that is still in the moments list is said **once**, as the first line
  of the next look, through `_firstLook`'s queue (C5). It is keyed in `localStorage` by
  `at|type` so a reload doesn't repeat it. Flavour is never caught up.
- **Tests:** card-check: inject wake + good morning + weather in one update, and the
  bubble shows good morning, then nothing about weather; a care press followed 1 s later
  by `pooped` keeps the care line for 3 s; a `stage_changed` 40 s old on reopening is
  said once and not again after a reload; two care entries in one update give C4.
- **Done =** no milestone is silent or replayed twice, and a person's own press is never
  overwritten by house flavour (the review's O03 rule).

**PR 2b: before, action, result (O03).** Size **S-M**.
- New public moments, each checked against the privacy scrub (none carries `user`, `by`
  or `for`):
  - `became_sick` (`model.py`: `_sickness`, and on waking since #41) gets a "feeling
    poorly" beat: the sick frames already show, plus a line (C6) and a slow droop;
  - `chore_treat` (1798) gets "a treat!" with the snack prop (C7);
  - `recovered` (1207) is the medicine press's own result. It comes through the care
    log, so `_react` gives medicine a distinct "all better" reply (C8) when the log's
    result says so, not a new moment.
- `wish_made` stays out: it carries `for` (personal; privacy P3b fires it with `kind`
  only), and the wish line already comes from `_wishLine`.
- `call_started` and `request_answered` stay out of the moments: the attention art and
  the `_react` care reply already show them.
- **Each new moment type flushes the 10-slot buffer faster** (`MOMENTS_KEPT`,
  `coordinator.py:120`), which loses more for O08. So only these two are added, and
  PR 4a moves milestones out of the buffer anyway.
- **Tests:** pytest: `became_sick` and `chore_treat` land in `self.moments` with no
  `user`; card-check: each shows its line and isn't replayed; medicine after sickness
  shows C8.
- **Done =** every autonomous change of state that a person would care about has a
  0-3 s visible beat, and no new moment carries a person.

**PR 2c: what it wants, in order (O04).** Size **S**.
- **Checked:** a missed call costs something quiet. A care miss adds to `care_misses`
  (`model.py:717-728`), and `UPBRINGING_MISS_COST` (6 points, `rates.py:156`) comes
  off the upbringing score. Upbringing is only words, but it is a cost.
- Even so, **no clock anywhere** (owner taste; Q7). `call_deadline` stays a sensor
  attribute for automations.
- The order on the screen: the attention icon (a call) first; the request button
  (`requests`) second; the wish third. Today a wish line can push a call's bubble line
  away: the queue (2a) gives a call's line class 3 and the wish class 4.
- Status: a "would like" row naming the wanted thing (C9), with no time.
- **Tests:** card-check: calling + a request + a wish shows the attention icon and the
  call's line, and the wish waits; the status row names it; nothing on the card
  renders `call_deadline`.
- **Done =** a glance at the card says what it wants most, with no countdown.

### Wave 3: the pet itself

**PR 3a: reduced motion, all the way (F11).** Size **S-M**. Independent: it can go
any time.
- One `calm()` helper (today the `matchMedia` test is repeated in nine
  places).
- `_tick` under `calm()`: hold frame 1. Frames change only when the mood or stage
  changes (a still picture, not a frozen one, Q4). Asleep pets show `asleep_1`.
- Poses (`poseFrames`) show their first frame for the same time, with no cycling.
- Catch under `calm()`: the prop **steps** to three fixed spots (far, near, at the pet)
  instead of sliding. The catch window is the last step, at the same doubled length.
  Decoys step too. No transform.
- Flourishes (`_sparkle`, `_bondHearts`, bursts): already CSS, so already still; check
  that none is moved by JS.
- **Tests:** card-check with `emulateMedia({reducedMotion: "reduce"})`: the pet's `src`
  is the same over 5 ticks; a mood change swaps it once; Catch's prop takes exactly
  three `left` values per round. Screenshots at 330 px of a calm Catch round, kept in
  the worker's `renders/`.
- **Done =** with reduced motion on, nothing on the card moves unless the person taps
  or the pet's state changes.

**PR 3b: a pat (O01).** Size **M**, no art.
- **The sprite becomes its own target:** a tap on the pet (its `img`, padded to at
  least 44 px) is a pat. A tap anywhere else on the screen still opens status, as
  today (1658-1663). The Status button is unchanged, so status stays one tap away
  everywhere.
- **Card only:** no server call, no bond points, no counter, no event, nothing in HA
  history. It can't become a stat or a daily chore, because nothing is kept.
- The response: a `perk` or the existing `greethop`, a soft haptic where supported,
  and a line by mood (C10). A 4 s cooldown: a tap in the cooldown is a smaller wiggle
  and no line, so rapid pats feel alive but don't flood the bubble. Asleep: a "z"
  wiggle and no line, no sound. Sick: a slow lean in. On a shared screen it works the
  same way (it names nobody).
- With the reaction queue (2a), a pat is class 1 (it is the person's own act).
- **Accessible:** the sprite gets `role="button"`, `tabindex="0"` and `aria-label`
  "pat <name>" (C10); Enter and Space pat. Under reduced motion only the line and the
  haptic happen.
- **Tests:** card-check: tapping the sprite gives a C10 line and doesn't open status;
  tapping the screen beside it opens status; three fast pats give one line; keyboard
  Enter pats; no `callService` and no `callWS` is made.
- **Done =** the review's definition of done (feedback, no duplicates, accessible,
  reduced-motion equivalent), and nothing is stored.

**PR 3c: reactions at every stage (O02).** Size **M** without art; art is a later,
separate batch (**L**).
- **No-art first.** Today only the child has species poses (`_petFrames` 2174,
  `_react` 3076, `_pounce` 4563); other stages get a CSS stand-in (`standIn`, 2046).
  But every stage has ten mood frames (fox: `asleep`, `bored`, `calling`, `content`,
  `cozy`, `dirty`, `excited`, `hungry`, `sick`, `sleepy`). Map a small reaction
  vocabulary onto **frames that already exist**, shown for 900 ms with a CSS move:
  | Reaction | Frames (baby, teen, adult) | Move |
  |---|---|---|
  | fed, accepted | `excited` | hop |
  | praised, won | `excited` | greethop |
  | refused care | `bored` | turn away (mirror) |
  | cozy / tucked in | `cozy` | settle (scale 0.97) |
  | music / TV | `content` | sway |
  | happy arrival | `excited` | perk |
- If personality P3 has merged, the move used for "praised" follows the type's
  favourite move from P3's table. The weights aren't changed.
- **Art, only after the no-art set has been seen on the phone:** a **vertical slice**
  first, one species with two poses (say `eat` and `cheer`) at baby, teen and adult:
  1 × 3 stages × 2 poses × 2 frames = **12 frames**, from the **Hatch API Art** session.
  All 30 species would be 30 × 3 × 2 × 2 = **360 frames**. That is the owner's call
  after the slice (Q6). The feature-gaps "trained tricks: not now" answer stands: these
  are reactions to care, not tricks.
- **Tests:** card-check: with the stage stubbed to teen and adult, feed gives the
  `excited` frame for 900 ms, then the mood frame; under reduced motion the frame
  changes and nothing moves.
- **Done =** an adult reacts visibly and differently to feed, praise, refusal and
  tucking in, with no new files.

### Wave 4: progression and polish

**PR 4a: milestones that wait (O08).** Size **M**.
- **Checked:** `state.memories` (`model.py:133`, kept 30, `MEMORIES_KEPT` 1402) holds
  only seasonal firsts today (`first_<kind>`, 1413), and the journal shows the newest
  six (`_memories`, 3709-3717). It is server-side, per pet and carried to the next
  generation (1061). The right kind of record, but not the same list (below).
- The household's milestones: `hatched`, `stage_<stage>`, `trait_<trait>`,
  `egg_laid`. Never a person, never a bond, never media titles. Labels in
  `MEMORY_LABELS` (C11).
- **Its own list, not the seasonal one.** `memories` is carried to every generation
  and capped at 30, and a generation makes about nine milestones (hatched, three
  stages, up to four traits, an egg), so mixing them in would push the seasonal firsts
  out within two or three generations and fill the visible six at once. So milestones
  go in a new `PetState.milestones` for **this generation only** (cap 12, not carried
  by `lay_egg`; the journal record already keeps the generation's species, traits and
  upbringing). The journal shows them on the current generation's line.
- Fix `_memories`'s label fallback (3713): `m.kind.replace("_", " ")` replaces only the
  first underscore. Use `replaceAll`, and give every new kind a label.
- PR 2a's catch-up line reads the newest milestone the browser hasn't seen (its `at`
  against `hatch-seen-<device>`, 2483). It no longer depends on the 10-slot buffer.
- The daily dream and wish stay browser-local (`oncePerDay`). A second device telling
  the same dream is fine: it's flavour, and the review says so too.
- Not a diary: no daily entries, nothing to keep up, and the journal keeps showing six
  (newest first).
- **Tests:** pytest: hatching and a stage change append one milestone each, capped at
  12, cleared by `lay_egg`, and `memories` is untouched; card-check: a stage change while the card was closed for an
  hour is said once on reopening and shows in the journal's memories.
- **Done =** a milestone missed on one device can be found in the journal on any device.

**PR 4b: the next egg on the card (O05).** Size **M**. After forms book 2a.
- On the forms book's creature page (2a), under a hatched creature: "hatch one next"
  (C12), which calls `select.select_option` on `select.<pet>_next_egg`. In the status
  "next egg" row: "change" opens a small sheet with **creatures raised here plus
  "surprise me"** (recommended, Q8). Unraised creatures stay silhouettes, so the book
  isn't spoiled; the HA select keeps offering all of them for anyone who wants to pick
  blind.
- Read-only logins: HA lets ordinary (non-admin) users call services, but not
  read-only ones, so `select_option` fails only for them. The card can't tell a
  read-only login in advance, so it shows the controls and, on a refusal, says C13 in
  the status feedback.
- The review asks for "a clearly previewed inherited trait". Status already marks the
  inherited trait (`traitLabel`'s "↓", 3134). Previewing which trait the *next* egg
  inherits would need the server to pick it early: out of scope here, noted for the
  audit. Laying the egg keeps the two-tap confirm (PR 1b).
- **Tests:** card-check: picking a raised creature sets the select and the egg screen
  says "a <creature> is on the way"; an unraised one isn't offered; "surprise me" resets.
- **Done =** a person can choose the next egg without leaving the card, and the book
  still hides what nobody has raised.

**PR 4c: status and settings apart; 44 px targets (O07).** Size **M**. After privacy
P2 and P3a, and forms book 2a.
- Status keeps what's checked often: meters, mood, wants (2c), traits, personality,
  bond line, next egg, care history, the journal link.
- A "settings" link (like the journal's) opens the person's switches: notify me, my
  day, birthday rows, forget my data, sounds here, babble, baby talk, shared screen.
- Every control in status and settings gets at least 44 × 44 px of hit area (today
  `.bell` is 26 px high, 1269; `.jlink` 28 px, 1266). The visual size can stay smaller
  through padding.
- **Tests:** card-check at 320, 360 and 420 px: no control's bounding box is under
  44 px; the settings view holds every switch; tab order reaches each one; screenshots
  of both views at 320 and 420 px.
- **Done =** status fits a phone without scrolling past settings to read the meters.

**PR 4d: one slower game (O06).** Size **M-L**. **Only if the owner wants one, and no
design is recommended yet** (Q9).
- The precedent: feature-gaps C cut "Copy me" because it was too easy as drafted and
  needed its own buttons and service shape. Any slower game meets the same two tests:
  - **It must not be a sure win.** A first sketch here, Hide and seek (three spots,
    three tries, warmer/colder hints), failed this: with three spots and three tries
    you always find it. With directional hints, five spots fall to a binary search in
    three tries. A design needs more choices than tries, or a score by tries used.
  - **It costs UI.** Today the game box has two buttons (`.gl`, `.gr`). Three or more
    choices need a new layout at 330 px and in compact mode, and `play_game` needs a
    kind whose guess isn't left/right or higher/lower.
- Like Left or Right after PR 1a, a reopen after a guess starts fresh; an abandoned game
  counts for nothing.
- Catch's fate (stay hidden, ship, or drop) stays the owner's, as feature-gaps C says.
  If it ships, its best score moves from browser-wide (`BEST_CATCH_KEY`) to per pet,
  as C2 planned.
- Art: none for a first cut. Props, if any, come from the **Hatch API Art** session.
- **Done =** a game a person can play with one thumb, slowly, that they can lose.

**PR 4e: the counts (F13).** Size **S** plus a render pass.
- Re-render `docs/readme/hero.png` and `collect.png` with the 30 creatures
  (`scripts/readme/art.py`, `hero()` 257 and `collect()` 372). Then update the README
  alt text and captions (C14), and the guide's roadmap line 730 (drop "more species"; the 17 new creatures shipped in
  0.35.0b3).
- Better still: `art.py` counts the ready `species.json` files it draws and prints
  the alt text with that number, so they can't drift again.
- **Done =** the README and guide name the number the images show.

### F12 (art)

Not re-planned: `docs/plan-2026-10-28-art-reviews.md` phases 2 and 3. Phase 3's batch
(about 60 frames) goes to the **Hatch API Art** session, which picks Luna or Sol. Its
open question (all at once, or the axolotl and moth first) is still the owner's.

## 4. Sizes at a glance

| PR | What | Size | Waits on |
|---|---|---|---|
| 1a | Games start clean, old timers die (F01, F02) | S-M | privacy P1 |
| 1b | Taps coalesced, egg confirm gap, failed answers (F07, F06) | S | — |
| 1c | Preferences on every visit, quiet samples (F05, F09) | S | Q3 for F09 |
| 2a | One reaction queue, bursts, catch-up (F08) | M | privacy P3a |
| 2b | Sick, chore treat, recovered beats (O03) | S-M | 2a, privacy P3b |
| 2c | Wants in order, no clock (O04) | S | 2a |
| 3a | Reduced motion throughout (F11) | S-M | — |
| 3b | A pat (O01) | M | 2a (for its class; can ship before with a plain `_speak`) |
| 3c | Reactions at every stage, no art (O02) | M | — (art slice later: L) |
| 4a | Milestones kept per generation (O08) | M | 2a |
| 4b | Next egg on the card (O05) | M | forms book 2a, Q8 |
| 4c | Status and settings apart, 44 px (O07) | M | privacy P2/P3a, forms book 2a |
| 4d | A slower game, design open (O06) | M-L | Q9 |
| 4e | README and guide counts (F13) | S | — |

## 5. Copy (proposals; the owner decides the words)

| # | Where | Proposal |
|---|---|---|
| C1 | Someone else played this game meanwhile | "oh! someone else is playing with me" |
| C2 | A kept answer failed to save | "oops, I forgot already! ask me again another day?" |
| C3 | Sound sample skipped (status feedback) | "sounds are on: quiet till morning ♪" (asleep: "sounds are on: shh, it's sleeping") |
| C4 | Two kinds of care at once | "<first> and <second>! ♥" (e.g. "snacks and a bath! ♥") |
| C5 | Catch-up milestone on the next look | stage: "guess what? I'm a <stage> now!"; trait: "I learned something: <trait>!"; hatched: "hello! I hatched while you were away" |
| C6 | `became_sick` | "I don't feel so good..." |
| C7 | `chore_treat` | "a treat! for the chores? ♪" |
| C8 | Medicine that cured it | "all better! ♪" |
| C9 | Status "would like" row | label "would like", value e.g. "a snack", "a cuddle", "lights out" |
| C10 | A pat | content: "hehe ♥"; excited: "again! again!"; sleepy: "mmm..."; hungry: "...is that a snack?"; sick: "thanks... ♥"; dirty: "careful, I'm muddy!"; aria-label "pat <name>" |
| C11 | Milestone labels (journal) | "hatched", "became a child/teen/adult", "learned <trait>", "laid an egg" |
| C12 | Creature page, next egg | "hatch one next"; chosen: "next egg ✓" |
| C13 | Next egg refused (read-only login) | "only someone who can change things can pick" |
| C14 | README alt text | "…a parade of all thirty creatures"; "Collect all 30: the adult creatures of every world, with the eggs they hatch from" |

## 6. Open questions for the owner

Each has a recommendation; the plan assumes it unless the owner says otherwise.

| # | Question | Recommendation |
|---|---|---|
| Q1 | F03: should the journal count creatures raised by **every** pet device in the house, not only those on this card? Today a filtered shelf shows them as ???. The forms book decided "devices the card holds". | **Yes, house-wide.** Every `sensor.*_life_stage` of the `virtual_pet` platform is already readable by every login (`hass.states`, filtered through `hass.entities` by platform), so it needs no new store and adds no privacy exposure. The book reads pets and forms only, never people. It lands in the forms book's PR 2a. |
| Q2 | F10: the journal's family line shows the newest four generations. Show older ones? | **Yes, behind "older generations (N)"**, a tap that opens the rest, oldest first. Four stay the default, matching the book's "and more". |
| Q3 | F09: should the samples you tap for (sounds here, babble) stay silent at night and while the pet sleeps? | **Yes**, with C3 so the switch doesn't seem broken. The tap still unlocks audio. |
| Q4 | F11: with reduced motion, should the pet hold one frame (a still picture that changes when its mood changes)? | **Yes.** A two-frame swap every tick is the motion the setting asks to stop. |
| Q5 | O01: a pat gives nothing (no bond points, nothing kept). Agree? | **Yes.** Anything kept would become a stat or a daily habit to keep up. |
| Q6 | O02: after the no-art reactions, send the 12-frame vertical slice to the Hatch API Art session? All 30 species would be 360 frames. | **Yes to the slice, no decision on the rest** until it has been seen on the phone. |
| Q7 | O04: show how long the pet will wait when it calls? A missed call costs upbringing points (6 each). | **No clock anywhere.** Wants are shown in order of importance only. |
| Q8 | O05: which creatures can be picked as the next egg on the card? The HA select offers every one (feature-gaps B). | **Raised ones plus "surprise me"** on the card; the select keeps all. That way the book's silhouettes stay a surprise. |
| Q9 | O06: do we want a slower, non-reflex game at all? And Catch: keep hidden, ship, or drop? | **Open: no design recommended.** "Copy me" was cut for being too easy and needing its own buttons; the first sketch here (Hide and seek) failed the same test (section 3, PR 4d). If yes, the next step is a short game design for the owner, not a build. Catch: the owner's existing call. |
| Q10 | O08: which milestones does a generation keep (its own list, not the seasonal memories)? | **Hatched, each stage, each trait learned, egg laid.** Nothing about people. |
| Q11 | F13: re-render the README images now, or after the forms book (whose journal screenshots may change)? | **Now** for hero and collect, which don't show the journal. |
| Q12 | F07: a second tap within 600 ms of the first won't confirm laying an egg. Right gap? | **600 ms.** It is longer than a double tap and shorter than a deliberate second press. |
| Q13 | O07: move the person's switches out of status to a "settings" view? | **Yes,** linked like the journal. |

## 7. QA beyond the PRs

From the review's QA section, kept for the audit of this draft and the builders:

- **Temporal:** cancel and restart, change game, double tap, a card destroyed mid-request,
  a stale reply, a dropped websocket, sleep and wake with a question open. Covered by
  1a, 1b; "destroyed mid-request" by privacy P1's `_dropSlide` checks plus 1a's timers.
- **Cross-device / cross-person:** two browsers on one login (1c, 1a), two logins (privacy
  P3a), a filtered shelf (Q1), shared screen (privacy FA, 3b).
- **Animation matrix:** every stage × species × mood frame loads and keeps its baseline. A
  data-driven check over 30 species (one loop, not 30 cases) belongs with the art plan's
  `check.py`, which already scans every live folder; the card-side check is a loop in
  card-check over `species.json` that loads each `<stage>_<mood>_1.png`. Suggested for
  PR 3c.
- **Bursts:** 2a.
- **Input:** 320/360/420 px, keyboard, live regions, 44 px (4c); haptics on Android vs
  iOS, sound unlocked vs blocked: the owner's phone test (HANDOFF already owes one for
  the photo), one combined pass after Wave 3.
