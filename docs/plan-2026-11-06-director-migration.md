# Director migration: every card timer, one-shot and temporary class under the director

**Date:** 2026-11-06
**Status:** Plan only (tier 0). The migration it describes is tier 2 in total, tier 1 per slice.
No code under `src/` changes with this document.
**Basis:** `origin/main` `531cd101`. Every `file:line` below was read on that tree; recheck when a
slice starts (a line drifts, the site list does not: section 3 has a script that finds a new one).
**Input:** the scout audit s2973 (`report.md`, findings 1-7). Its table was by group and sampled; this
plan's inventory is by line and complete (section 8 says how that was checked). Where the audit and the
code disagree, the code wins and section 3.1 says so.
**Intent:** `docs/plan-2026-11-03-device-alive-interactions.md` section 5 (from
`docs/plan-2026-11-03-living-device-interactions.md` section 5) says the director "owns handles
(timeout, animation, class, CSS var), clears on slide switch, removal, hidden tab and scene/game
transitions". Today it does that for the glass and the rim only. The owner asked (2026-11-06) for all of
it, with minimal risk: **the player sees no change except the bug fixes.**

## 0. The shape of the answer

1. The director gets a small, additive, pure **ledger** (section 1): owned timers, keyed replacement,
   groups, an undo that runs when a timer is cancelled before it fires, and a drain on `detach`,
   `reset` and a hidden tab. It adds no lease, no priority, no watchdog and no drop rule to these
   timers: **ownership without arbitration**. A pet one-shot that plays today plays tomorrow.
2. 87 timer/animation start sites in 18 parts (section 3), moved in 15 slices, 0 to 14, plus an owner-gated X1 (section 5), smallest
   and safest first. Slice 0 is the API, the tests, the trace harness and a **ratchet** test that pins
   today's bare-timer count per file; no caller moves. Each later slice lowers the ratchet.
3. Five sites stay out for a stated reason (section 4); the final allowlist is those five.
4. Every slice writes its characterization test **first**, against the unmoved code, and the same test
   passes unchanged after the move (section 6). Timings are identical; the few intentional changes are
   the four audit bugs, and each is named in its slice.
5. Open questions for the owner are in section 9, each with a recommendation.

### The four audit bugs (named here so the slices can cite them)

The audit said "4 management bugs" without naming them; these are its findings 2, 3, 6 and 7, checked
against the code:

| # | Bug | Where | Fix | Slice | Test |
|---|---|---|---|---|---|
| B1 | A timer survives `_forget` (a slide reused for another pet) and strips a class from the next pet's sprite, or puts the old pet's art on it. Also the lean timers (`card-tick.js:992,1005`) and the `_animate` map are not cleared by `_forget`; the audit said the lean timers were. | `_look`, `_wander`, `_swapFlip`, `_afterTurn`, speck, perk2, yawn, shake, lean, `_animate`, fx boxes, season, looks | everything is created through the ledger; `_forget` calls `detach`, which runs each entry's `undo` | 1-13 | per-slice trace test, plus the global `forget_drain.test.js` in slice 14 |
| B2 | A hidden tab does not end one-shots: they finish late on return (timers are throttled), so a stale flair, season box, house fx or robot shows for a moment. | flair, season boxes, house fx, robot, hearts, sparkle | the `hidden` policy of the entry (section 1.5); default `keep` everywhere until slice X1 flips the listed ones to `drop` | X1 | `hidden_policy.test.js` |
| B3 | `_swapFlip` does not clear its earlier timers: a second flip inside 200 ms is cut short by the first flip's `remove("turn")`. | `card-tick.js:203-204` | `turn` removal is keyed (a new flip replaces it); `put` keeps one timer per flip, in a group drained on forget | 3 | `swap_flip.test.js` (two flips 100 ms apart) |
| B4 | `_sceneEnd` does not clear what the scene started: the `rock2` removal (1.3 s) and the murk transition reset (50 ms) survive a quiet end (a forget, a disconnect) or a swipe away. | `card-care.js:122,169` | both are in group `scene` of the slide; `_sceneEnd` drains it only for `quiet` and swipe ends, **not** a normal end (a normal end keeps the 1.3 s shake-off today, and keeps it) | 9 | `scene_stragglers.test.js` |

Two things the audit called "too long" (the robot's 6 s and the season box's 6 s) are **not** bugs and are
not changed by any slice here: owner question Q3.

## 1. The director API today, and the gaps

### 1.1 What `src/card/interaction-director.js` (443 lines) owns today

| Capability | How | Where |
|---|---|---|
| A timeout per effect | `schedule(ms + WATCHDOG_MS, endEffect)`; `WATCHDOG_MS = 250` past the effect's `durationMs` is the bounded backstop for a missed `animationend` | `:253`, `:37` |
| An animation, a class, a CSS var | not owned: a recipe's `start`/`dispose` hooks (declared by `device-fx.js`) add and remove them; the director only calls the hook, in a try/catch | `:206`, `:257` |
| Tracks | `control`, `shellImpulse`, `screenFx`, `petBody` leased, one effect each per slide with a generation token; `shellAmbient` is state; `text` and `modal` are the card's, read as busy | `:22-28` |
| Arbitration | priority, `NEEDS_FREE` (a busy body drops the request), `collapseKey`, `cooldownMs`, the held echo | `:216-263` |
| Busy list | `BUSY_OWNERS` (game, mode, scene, power, visitor, asking, sheets, link, call, asleep, pose, status) | `:53-75` |
| Reset on hidden | `_dirPause` cancels the **`shellImpulse`** track of every slide only (`card-visit.js:675`) | `card-base.js:116` |
| Reset on disconnect | `reset()` ends every live effect and replaces the state map | `card-base.js:189`, `:411` |
| Reset on a forgotten pet | `detach(slide)` ends its effects and drops its state | `card-build.js:824`, `:403` |
| Expiry sweep | `tick()` from the card's `_tick` | `card-tick.js:14` |
| Timer injection | `schedule(ms, fn) -> cancel` (the card passes `setTimeout`; `card-build.js:57`) | `:111` |

What it **cannot** own: any timer that is not an effect on a leased track (every site in section 3
except the rain, the rim cues and the glass mark's adapter), any element other than the glass and the rim
(hooks reach them), any interval, any frame callback, any WAAPI animation, and any per-pet scope other
than "the slide's effect state".

### 1.2 The principle: ownership without arbitration

A track lease **drops** a request that cannot run (`NEEDS_FREE`, `track-busy`, `cooldown`). That is right
for decoration the player never asked for (rain, a mark). It would be a **visible change** for the pet's
perk, a look, a flair box or a hearts burst, which play today whenever called. So the migration uses the
director only as an owner: it keeps the handle, runs the end, and cancels on the same events that already
end the glass. It never refuses a call, never queues, never reorders. A `petBody` lease for these moves
would be a design change, not a migration (Q1, recommendation: no).

### 1.3 The gaps, each a small additive API

All in `interaction-director.js`, inside `create`, pure like the rest: no DOM, no clock, no timer of its
own. The card passes three more injected functions (`repeat`, `frame`, none required): tests pass fakes.
The existing tracks, `tick`, `cancel(slide, reason, tracks)` and `release` are untouched; **`cancel`
stays track-only and never drains the ledger** (a test pins it).

**G1. `later(scope, ms, fn, opts) -> handle`: an owned one-shot timer.**
- `scope` is any object: a slide, or the card's own token `this._dirCard` (made in `_build`, used for the
  few card-level timers: head swap, boot, link). `detach(scope)` and `reset()` drain it.
- `ms` is passed to `schedule` **unchanged** (no clamp, no validation: `setTimeout` semantics, so a
  `NaN` or a negative behaves as now). No watchdog is added: the timer is `fn`, not an effect. Exactly one
  `schedule` call per `later`, so two timers of equal `ms` fire in creation order, as bare timers do.
- `opts.key` (any string): a second `later` with the same `(scope, target, key)` first **cancels** the
  earlier one (running its `undo`), the `clearTimeout(s.x); s.x = setTimeout(...)` idiom as data.
- `opts.target` (an object, default `scope`): a second index so one slide can hold the same key on two
  elements. This is the pet-sprite and gnum target `_animate` needs (G4).
- `opts.group` (a string): entries sharing a group are cancelled together by `cancel(scope, {group})`,
  replacing the `V.timers`, `R.timers`, `L.timers`, `s.power.timers`, `s.gameTimers`, `s.drapeTimers`
  arrays.
- `opts.undo(why)`: runs when the entry is cancelled **before it fires** (cancel, replace, detach, reset,
  a hidden `drop`); never after it fired; `fn` and `undo` are alternatives. For a class hold, both remove
  the class, so the end state is the one the timer would have produced.
- **The drain rule (what `undo` is).** A bare timer that is pending when the card disconnects still fires,
  so on a reconnect the card finds the state "as if it had fired". The ledger must leave the same state.
  So each entry declares one of two: **end** (`undo` reaches the end state the timer would have: a class or
  node removal, a closer such as `_bootEnd(false)`, `_powerEnd`, `drapeAnim = false`, the murk transition
  restore) or **drop** (nothing is owed: a delayed start such as the treat, a flyer, a second perk, a
  moment's flair, a second chirp, a line, a trick's move; they would only show on a card nobody sees, or
  on the next pet, which is B1). Every row's slice section names which, and its characterization test
  includes a **disconnect trace**: `disconnectedCallback`, then the clock forward, then the same end state
  as the unmoved code.
- `opts.hidden`: `"keep"` (default, today's behaviour), `"drop"` (run `undo`, forget the entry) or
  `"finish"` (run `fn` now). See G6.
- `opts.motion`: `true` marks the entry as motion, for `inspect` and the calm test only (G5).
- Bookkeeping first, then `fn`, **no try/catch**: the entry leaves the ledger before `fn` runs, so a
  `later` with the same key inside `fn` (a re-arm) is not cancelled by itself, and a throw reaches the
  page as it does from a bare timer (the console stack is unchanged).

**G2. `every(scope, ms, fn, opts) -> handle`: an owned interval** (injected `repeat(ms, fn) -> cancel`;
the card passes `setInterval`). Same key, group, undo and drain rules. Two sites need it (the link's frame
swap and head flap); the typing interval stays out (section 4).

**G3. `frame(scope, fn, opts) -> handle`: an owned next-frame callback** (injected `frame(fn) -> cancel`,
the card passes `requestAnimationFrame`). One site (`card-layout.js:260`). Not `later(...,0)`: the
timing differs and must not.

**G4. `adopt(scope, { cancel, key, group, target, hidden, motion }) -> handle`: an owned thing that was
started elsewhere** (a WAAPI `Animation` from `.animate()`, whose `cancel` the ledger will call on a
drain). `later` is `adopt` plus a schedule. This is the one gap for the ghost frames (`card-tick.js:99,112`).
The ghost keeps its own `getAnimations().forEach(cancel)` on retrigger; `adopt` only adds the drain.

**G5. Pet sprite target and reduced motion.**
- The pet sprite (`s.pet`), its blanket mirror (`s.drape`) and the game counter (`s.gameNum`) need no new
  concept: they are `target`s (G1). The card adapter `_hold` (below) does the class add, the reflow and the
  drape mirror that `_animate` does today; the director never touches the DOM.
- Reduced motion has **no central rule**. Each site keeps the `calm()` guard it has today, verbatim (some
  sites add a class even under calm because the CSS kill at `style.js:37-40` covers it; the trace test
  pins which). `motion: true` only labels the entry. The calm test (section 6) runs every migrated site
  with `calm()` true and asserts that the set of pending `motion` entries equals the set pinned before the
  move, so a migration can neither add motion under calm nor lose a guard.

**G6. Hidden policy and `hidden()`.** `director.hidden(why)` walks the ledger and applies each entry's
`hidden` policy (default `keep`, so slice 0 changes nothing). `_dirPause` calls it next to its current
`shellImpulse` cancel. Slice X1 flips named entries to `drop`; that is bug B2 and an owner call (Q2).

**G7. Drain and look.**
- `detach(scope)` additionally drains the scope's ledger (before it deletes the state). `reset()` drains
  every scope. `drain(scope, why)` is the same for a caller that wants it without `detach` (the scene end).
- `cancel(scope, { key, target, group }, why) -> count` cancels by key or group.
- `inspect(scope)` gains `timers: [{key, group, target?, motion, ms, dueAt}]` (plain data); `pending()`
  returns the count across the director (the leak test).
- A drained entry runs its `undo` exactly once and never `fn`.

### 1.4 The card adapters (slice 0 adds them; no caller yet)

Thin methods in `card-base.js` (a link in the existing chain; no new part), so the migration can be a
mechanical rename. They read `this._director` (created in `_build`, which runs before any slide exists, so
there is no pre-build fallback and no bare timer in them):

| Method | Does |
|---|---|
| `_later(s, ms, fn, opts)` | `this._director.later(s, ms, fn, opts)` |
| `_hold(s, el, classes, ms, opts)` | add `classes` to `el`; with `opts.restart` remove, reflow (`void el.offsetWidth`), add; `later(s, ms, remove, { key, target: el, undo: remove })`. `opts.mirror` is the drape mirror `_animate` keeps |
| `_waapi(s, el, frames, timing, opts)` | `const a = el.animate(frames, timing)`, then `adopt(s, { cancel: () => a.cancel(), ...opts })`; returns `a` |

### 1.5 Tests for the API (slice 0, `tests/js/interaction_director_ledger.test.js`, `node --test`, fake `schedule`)

L1 fires once, at the passed `ms`, not before. L2 equal-`ms` timers fire in creation order. L3 `key`
replaces: the earlier `undo` runs, its `fn` never does. L4 `cancel` by handle, key, target and group; `undo`
runs on cancel and not on fire; a second cancel is a no-op. L5 `detach(a)` drains `a` and leaves `b`. L6
`reset()` drains all, and a `later` after `reset()` works. L7 `hidden()`: `keep` leaves it, `drop` runs
`undo`, `finish` runs `fn` once. L8 a throwing `fn` leaves nothing pending and reaches the caller of the
schedule callback. L9 a re-arm inside `fn` with the same key survives. L10 `every` and `frame` through
fake `repeat`/`frame`; drained. L11 `adopt` calls `cancel` on drain, once. L12 `target` indexes (same key on
two elements: two entries). L13 `inspect` and `pending()`. L14 bad arguments (`scope` not an object, `fn`
not a function) throw `TypeError`; `ms` is never validated. L15 `director.cancel(slide, reason)` (tracks)
does not drain the ledger, and the ledger does not touch tracks, `tick`, `seen` or `KEPT`. L16 `detach`
order: `undo` runs before the state is deleted. Adapter tests (vm, as `sitter_life.test.js` extracts card
methods): `_hold` adds and removes, `restart` reflows, `mirror` follows, `undo` removes at once.

## 2. Rules for every slice

- One slice = one commit = one revert. No storage, wire, server, CSS or copy change in any slice.
  (X-slices change timing only where section 9 says the owner agreed.)
- Same `ms`, same order of calls, same guards, same `calm()` checks, same `Date.now()`-based fields
  (`poseUntil`, `movingUntil`, ... stay; they are state the tick reads, not timers: section 4.6).
- Drain rule: a state-closing timer (boot, power, drape, class and node removals) is **end**; a delayed
  start is **drop** (1.3, G1). The disconnect trace in each slice's test pins which.
- A migrated site keeps its field only if something else reads it (`s.leanTimer` is read by
  `_patLeanOff`); otherwise the field goes in the same commit, and `_forget`'s manual `clearTimeout` lines
  for it go in slice 14, not earlier (a slice never removes a safety net it did not install).
- Where a bare timer today has a separate cancel path (`clearTimeout(s.x)`), the migrated code keeps that
  call as `cancel(s, {key})` at the same place, so the slice is a rename plus a drain, not a redesign.
- The characterization test is committed **before** the move, in its own commit on the slice's branch
  (it passes on the unmoved code), then the move commit makes the same test pass. Both go in one PR; the
  rollback is the move commit.
- No player copy is added or changed.

## 3. Inventory (complete by line)

Basis `531cd101`. One row per line that starts a timer, interval, frame callback or WAAPI animation:
87 rows (R-numbers). "Reach" is the card-check sections (`scripts/card-check.js --list`, found by token
search of the section's range) and `tests/js` files that **run** the path; it is not proof that anything
asserts the timer's end. Where no check asserts the end, the slice's characterization test is the pin and
the row says "uncovered" for the end. The cancel lines (`clearTimeout` etc., 58 of them) are in
Appendix A.

Risk: **low** = a class or node removal on a persistent or throw-away element; **med** = state or frames
the next tick reads, or a sequence with guards; **high** = a scripted scene, the channel, or the first
impression.

### 3.1 Corrections to the audit

- `card-tick.js:992,1005` (lean): the audit said `_forget` clears them. It does not (Appendix A: no
  `leanTimer` in `card-build.js`). Part of B1.
- Missed by the audit's table: `card-build.js:1023` (visitor swipe grace), `card-visitors.js:455` (find
  ring), `card-tick.js:210` (`_afterTurn`), `card-layout.js:260` (a `requestAnimationFrame`).
- The audit's "`_animate` is sound" holds (one timer per element and class), but it is a module-level
  `WeakMap` (`card-visit.js:2`) that no `_forget` or disconnect reaches.
- Every `file:line` in the audit's table matched `531cd101`.
- Files with no timer at all: `card-board.js` (its observers are not timers), `card-sitter.js` (the
  sitter's one timer is `_tick`), `card-status.js`, `device-fx.js`, `hop-engine.js`, `sitter-engine.js`,
  `shell-modes.js`, `editor.js`, `boot.js`, `prefs.js` (audio is on the AudioContext clock).

### 3.2 card-actions.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R1 | card-actions.js:12 | remove `pressed` from the tapped button | 160 ms | none | `_hold(s, button, [pressed], 160)` | low | `cap_press.test.js`; cc `care`, `memorytags` |
| R2 | card-actions.js:13 | remove `tapped` | 400 ms | none | `_hold` | low | same |
| R3 | card-actions.js:18 | remove the `burst` ring on a toy | 500 ms | none | `_later` + node undo | low | cc `care` (reach) |
| R4 | card-actions.js:32 | `_perk`: remove `perk` from the pet | 320 ms | none (re-add restarts, the old timer still fires) | `_hold(s, s.pet, ..., { key: "perk:_perk" })`; distinct key from `_animate`'s `perk` (Q5) | low | uncovered |
| R5 | card-actions.js:65 | remove `failed` from the button | 400 ms | none | `_hold` | low | cc `moments`, `photos` (reach) |
| R6 | card-actions.js:175,177 | the care scene's rAF loop | until `_sceneOver` (feed ≤ 3200 ms) | `_sceneEnd` `cancelAnimationFrame` (`:255`), `_forget`, disconnect | **stays out** (4.2) | n/a | cc `care` |

(R6 is two lines, one site; the 87 count is by site, the ratchet counts lines.)

### 3.3 card-base.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R7 | card-base.js:138 | `_tick` interval | 700 ms | `clearInterval` `:182` | **stays out** (4.1) | n/a | all |
| R8 | card-base.js:256 | subscribe wait: the first look waits for the channel | `SUBSCRIBE_WAIT_MS` 3000 | `:298,301`, `_unsubscribe` | `_later(s, ..., { key: "sub.wait" })` | high | `subscribe_silence.test.js`; cc `channel` |
| R9 | card-base.js:287 | subscribe retry | 2/5/15 s, then 60 s | `:347`, `_unsubscribe` | `_later(s, ..., { key: "sub.retry" })` | high | same |

### 3.4 card-build.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R10 | card-build.js:57 | the director's own `schedule` | per effect | `reset` | **stays out** (4.1): it is the injection point | n/a | `interaction_director.test.js`; cc `devicefx` |
| R11 | card-build.js:469 | power-on gag steps (`at`: blank blinks, low-battery lines, `_powerEnd`), lines 487-499 | up to 4200 ms | `timers` array in `s.power`; `_powerEnd` (`:508`) | `_later(s, ..., { group: "power" })`; `_powerEnd` cancels the group | med | cc `lowbattery` |
| R12 | card-build.js:524 | boot-logo wait; a tap ends it sooner | `BOOT_WAIT_MS` 5000 | `clearTimeout(this._bootTimer)` `:533` | `_later(this._dirCard, ..., { key: "boot.wait" })` | med | cc `lowbattery`, prelude |
| R13 | card-build.js:563 | boot fill, then the screen cuts to the pet | `BOOT_FILL_MS` 600 | none | `_later(this._dirCard, ..., { key: "boot.fill" })` | med | same |
| R14 | card-build.js:1023 | a world visitor leaves after a swipe away, unless the slide is back | `VISIT_SWIPE_GRACE_MS` 600 | none (guarded by `x.visitor === V`) | `_later(x, ..., { key: "visitor.grace" })` | med | cc `visitors` (reach) |

### 3.5 card-care.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R15 | card-care.js:122 | clean scene: remove `rock2` after the broom's shake-off | 1300 ms | none (B4) | `_hold(s, s.pet, [rock2], 1300, { group: "scene" })` | med | cc `care`, `pat` (reach) |
| R16 | card-care.js:169 | clean scene (murk): restore `transition` after `none` | 50 ms | none (B4) | `_later(s, 50, ..., { group: "scene", undo: restore })` | med | cc `care` (`murk`, 4 lines) |
| R17 | card-care.js:1004 | drape fall frame 2 | `DRAPE_FALL_MS` 450 / 3 | `_drapeStop` (`:970`, `_forget`, disconnect) | `_later(s, ..., { group: "drape" })` | med | `care_reactions.test.js`; no cc token |
| R18 | card-care.js:1005 | drape fall frame 3 | 300 ms | same | same | med | same |
| R19 | card-care.js:1006 | drape fall done (`drapeAnim = false`) | 450 ms | same | same | med | same |
| R20 | card-care.js:1017 | drape slide-out hide | 150 ms | same | same | med | same |

### 3.6 card-flair.js, card-games.js, card-journal.js, card-layout.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R21 | card-flair.js:35 | remove the trait flair box | `FLAIR_MS` 4200 | `clearTimeout(s.flairTimer)` `:34`, `_forget` (`card-build.js:856`) | `_later(s, ..., { key: "flair", undo: box.remove })` | low | cc `moments`, `winter`, `play` (reach) |
| R22 | card-games.js:310 | `_gameLater`: every delayed game step (9 callers: `:94,289,364,421,443,468,520,577`) | 300 ms to `GAME_END_MS` | `s.gameTimers`, `_endGame` (`card-flair.js:203-204`); guard `s.game === g` | `_gameLater` becomes `_later(s, ..., { group: "game" })`; `_endGame` cancels the group | med | cc `play`, `resume`, `shellmode`; `hop_board.test.js` |
| R23 | card-games.js:330 | flip-clock digit swap | `FLIP_SWAP_MS` 80 | none (guard `dataset.n`) | `_later(s, ..., { group: "game" })` | low | cc `play`, `pat` (reach); bench `gnumFlip` |
| R24 | card-games.js:479 | the pet's game-end flavour line | `GAME_TYPE_MS` 4000 | none (guard `!s.game`) | `_later(s, ..., { key: "game.flavour" })` | low | uncovered |
| R25 | card-journal.js:51 | hide the status feedback note | 3500 ms | `clearTimeout` `:50`, `_forget` (`card-build.js:858`) | `_later(s, ..., { key: "status.note", undo })` | low | cc `shelf`, `play`, `photos`, ... (reach) |
| R26 | card-layout.js:260 | `_mould` one frame after a layout | one frame | none | `frame(s, ...)` (G3) | low | `mould_pin.test.js`; cc `shelf` |
| R27 | card-layout.js:283 | swap the title and line when the new pet is half there | 250 ms | `clearTimeout(this._headTimer)` `card-base.js:183`, `card-layout.js:433` | `_later(this._dirCard, ..., { key: "head" })` | low | cc `shelf` (reach) |
| R28 | card-layout.js:785 | remove the status page's `wipe-*` classes | 170 / 220 ms | `clearTimeout(s.wipeTimer)` `:784`; an open cancels it | `_hold(s, s.status, [..], ms, { key: "wipe" })` | low | `motion_ship2.test.js`; cc `pat` (`wipe-`, 7) |

### 3.7 card-link.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R29 | card-link.js:89 | `at(ms, fn)`: all steps of the visit (11 calls, `:126-219`), each guarded by `this._link === L` | up to ≈ 5.6 s (3.6 s calm) | `L.timers`, `_linkEnd` (`:303-305`), disconnect | `_later(this._dirCard, ..., { group: "link" })`; `_linkEnd` cancels the group | high | cc `infrared` (71 refs); `link_lines.test.js` |
| R30 | card-link.js:154 | guest frame swap (not under calm) | 700 ms interval | `L.swap`, `_linkEnd` (`:166`) | `every(..., { group: "link" })` | high | cc `infrared` |
| R31 | card-link.js:290 | head flap | 200 ms interval | `L.flap`, `_linkEnd` (`:167`) | `every(..., { group: "link" })` | high | same |
| R32 | card-link.js:291 | beam `gone` | `ms + 500` | `L.timers` | `_later` group `link` | high | same |
| R33 | card-link.js:292 | beam removed | `ms + 900` | `L.timers` | `_later` group `link` | high | same |

### 3.8 card-looks.js, card-memory.js, card-mode.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R34 | card-looks.js:97 | a new trick's move after the line | 600 ms | none | `_later(s, ..., { key: "look.trick" })` | low | cc `personality` (`_trickMove`) |
| R35 | card-looks.js:106 | the promise's payoff move | 600 ms | none | `_later(s, ..., { key: "look.promise" })` | low | `promise.test.js` |
| R36 | card-looks.js:329 | an ask's text step ends | `ASK_MS` 60000 | `step.timer`, `_askTextEnd` (`:375`), hidden tab | `_later(s, ..., { key: "ask.text" })` | med | cc `memorytags`, `moments`, `visitors` |
| R37 | card-looks.js:445 | the gift pop and its line end | `GIFT_LINE_MS` 5000 | `P.timer`, `_giftPopEnd` (`:455`), disconnect | `_later(s, ..., { key: "gift.pop" })` | med | cc `gifts`; `gift_lines.test.js` |
| R38 | card-memory.js:71 | the memory page closes after idle | 120000 ms | `:56,70`, `_memoryPageClose` (5 paths) | `_later(s, ..., { key: "memory.idle" })` | med | `memory_page.test.js` |
| R39 | card-memory.js:296 | redraw when the "sure?" confirm lapses | `CONFIRM_MS` 4000 | `clearTimeout` `:295` | `_later(s, ..., { key: "confirm" })` | low | `memory_page.test.js` |
| R40 | card-mode.js:98 | remove `swap` from the eight buttons | 90 ms | `clearTimeout` `:96` | `_hold`-like, key `mode.swap`, eight targets in one entry (`_later` + undo) | low | `shell_modes.test.js`, `cap_press.test.js`; cc `shellmode` |

### 3.9 card-moment.js, card-season.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R41 | card-moment.js:81 | show the new trait's flair after the sparkle | 700 ms | none | `_later(s, ..., { key: "moment.flair" })` | low | cc `moments` (reach) |
| R42 | card-moment.js:587 | remove a clean's bubble pop | 1300 ms | none (the returned `timer` is read by no caller, `:601`) | `_later(s, ..., { group: "fx", undo: img.remove })` | low | uncovered |
| R43 | card-moment.js:660 | remove `breezy` from the screen | 2600 ms | `clearTimeout` `:659`, `_forget` (`card-build.js:852`) | `_hold(s, s.screen, [breezy], 2600, { key: "breezy" })` | low | cc `sharedscreen`, `ghost` (reach); `care_reactions.test.js` |
| R44 | card-moment.js:690 | the smug second rock | 1300 ms | none (guard `!s.scene && !s.asleep && !owned`) | `_later(s, ..., { key: "moment.smug" })` | low | uncovered |
| R45 | card-season.js:126 | the treat, after the costume | 1600 ms | none | `_later(s, ..., { group: "season" })` | med | cc `winter`, `moments` (reach) |
| R46 | card-season.js:198 | remove the confetti box | 3600 ms | none | `_later(s, ..., { group: "season", undo: box.remove })` | low | cc `winter` (reach) |
| R47 | card-season.js:307 | remove the costume box (`flair costume`) | `FLAIR_MS + 1800` ≈ 6000 | none (the next `.flair` removal sweeps it) | same (Q3: the length stays) | low | cc `winter` (reach) |
| R48 | card-season.js:339 | each flyer of a flock, by its lag | `lag * 450` | none | `_later(s, ..., { group: "season" })` | low | cc `winter` |
| R49 | card-season.js:355 | remove a flyer | `ms + 200` | none | `_later(s, ..., { group: "season", undo: el.remove })` | low | cc `winter` |
| R50 | card-season.js:372 | the seasonal visit's steps (`at`: 1400, 3400, `ms`) | up to the flyer's `ms` | `V.timers`, `_seasonVisitEnd` (`:399`) | `_later(s, ..., { group: "season.visit" })`; the end cancels the group | med | cc `winter` (3) |

### 3.10 card-sheets.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R51 | card-sheets.js:141 | the shell pick's 10 s race timeout (rejects) | 10000 ms | `.finally(clearTimeout)` `:143` | `_later(s, ..., { key: "shell.late" })`, cancel in the same `.finally` | med | cc `shell` |
| R52 | card-sheets.js:147 | clear `shellPending` and redraw | 5000 ms | `clearTimeout` `:146` | `_later(s, ..., { key: "shell.pending" })` | med | cc `shell` |
| R53 | card-sheets.js:306 | the lay wait, still reloading | 5000 ms | `_layDrop` (`:317`) | `_later(s, ..., { key: "lay" })` | med | cc `egg`, `types` (lay sheet) |
| R54 | card-sheets.js:311 | the lay wait starts | `NAME_WAIT_MS` 30000 | same | same | med | same |
| R55 | card-sheets.js:460 | the rename's one retry delay (a promise) | `NAME_RETRY_MS` 2000 | `_clearNameTimers` (`:373`) | `_later(s, ..., { key: "name.retry" })` resolving; a cancel leaves it unresolved, as now | med | cc `egg` (name sheet) |
| R56 | card-sheets.js:492 | redraw when the "sure?" confirm lapses | `CONFIRM_MS` + 50 | `clearTimeout` `:491`, `_forget` (`card-build.js:805`) | `_later(s, ..., { key: "confirm" })` (same key as R39: one confirm at a time, as now) | low | cc `forget`; `memory_page.test.js` |

### 3.11 card-tick.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R57 | card-tick.js:99 | ghost frame fade (WAAPI) | 180 ms | none (finishes) | `adopt` (G4) | med | cc `ghost` |
| R58 | card-tick.js:112 | ghost trail (WAAPI) | `turn + move + 300` | `getAnimations().forEach(cancel)` `:105` | `adopt` (G4) | med | cc `ghost` |
| R59 | card-tick.js:123 | remove `lit` from the screen | `BACKLIGHT_MS` 3000 | `clearTimeout` `:120`, `_forget` (`card-build.js:854`) | `_hold(s, s.screen, [lit], 3000, { key: "lit" })` | low | cc `backlight` |
| R60 | card-tick.js:178 | `_look`: remove `look` | `ms` (200 ms to a few s) | none | `_hold(s, s.pet, [look], ms)`, **unkeyed** (5.3); the class is added without reflow, so `restart` is false | med | cc `react`, `pat`, `visitors`, `infrared` (reach); `touch.test.js` |
| R61 | card-tick.js:189 | `_wander`: remove the side class and `look` | `ms` | none | `_hold(s, s.pet, [side, look], ms)`, unkeyed | med | cc `ghost`, `pat`; `touch.test.js` |
| R62 | card-tick.js:203 | `_swapFlip`: `put` the new art | `TURN_MS / 2` 100 | none (B1, B3) | `_later(s, ..., { group: "swapflip" })` | med | cc `pat` (`turn`); `motion_ship2.test.js` |
| R63 | card-tick.js:204 | `_swapFlip`: remove `turn` | `TURN_MS` 200 | none (B3) | `_hold(s, s.pet, [turn], 200, { key: "turn" })`: a second flip replaces it | med | same |
| R64 | card-tick.js:210 | `_afterTurn`: run `fn` when the flip is done | the flip's remainder | none | `_later(s, ..., { group: "swapflip" })` | med | cc `moments`, `egg` (reach) |
| R65 | card-tick.js:348 | perk2: the second perk | 420 ms | none | `_later(s, ..., { key: "trick.perk2" })` | low | cc `personality` |
| R66 | card-tick.js:411 | a song promise's second chirp | 500 ms | none | `_later(s, ..., { key: "promise.chirp" })` | low | uncovered |
| R67 | card-tick.js:507 | the idle speck: the pet follows it | 0 / 1200 ms | none | `_later(s, ..., { group: "speck" })` | low | cc `prelude`, `play`, `types` (token `speck`) |
| R68 | card-tick.js:508 | remove the speck | 2700 ms | none | `_later(s, ..., { group: "speck", undo: speck.remove })` | low | same |
| R69 | card-tick.js:593 | the typing interval | 40 ms | `_stopTyping` `:642` | **stays out** (4.3) | n/a | cc many |
| R70 | card-tick.js:708 | a yawn turns excited (a hop) | 900 ms | none (guards `s.poseFrames`, `s.poseUntil`) | `_later(s, ..., { key: "pose.yawn" })` | med | `excited_pose.test.js` |
| R71 | card-tick.js:727 | `_poseEnd`: put the mood frames back | to `poseUntil + 30` | none (guard `s.poseUntil !== until`) | `_later(s, ..., { key: "pose.end" })`; a new pose replaces (the guard stays, so both are safe) | med | cc `react` (37), `types`, `visitors`; `excited_pose.test.js`, `care_reactions.test.js` |
| R72 | card-tick.js:749 | `_propShow`: add `prop-out` | `ms - 300` | `clearTimeout` `:741` | `_later(s, ..., { key: "prop.out" })` | med | `care_reactions.test.js`; no cc token |
| R73 | card-tick.js:771 | head shake: the second flip | 550 ms | none (guard on `s.poseUntil`) | `_later(s, ..., { key: "react.shake" })` | low | cc `react` (reach) |
| R74 | card-tick.js:992 | pat lean: let go after the hold | `holdMs` | `clearTimeout` `:986,999`; **not `_forget`** (B1) | `_later(s, ..., { key: "lean" })` | med | `touch.test.js`; cc `pat`, `care` |
| R75 | card-tick.js:1005 | pat lean release: drop `lean-rel`, `lean-sick` | 300 / 450 ms | `clearTimeout` `:987,1002`; **not `_forget`** (B1) | `_hold`-like, key `lean.rel` | med | same |

### 3.12 card-visit.js, card-visitors.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R76 | card-visit.js:415 | a question's end | `ASK_MS` 60000 | `clearTimeout` `:408,414`, `_clearAsk` | `_later(s, ..., { key: "ask" })` | med | cc `memorytags`, `moments`, `visitors` |
| R77 | card-visit.js:477 | a question's end (the second path) | `ASK_MS` | same | same | med | same |
| R78 | card-visit.js:512 | the answer's one resend | `ANSWER_RETRY_MS` 3000 | none, on purpose | **stays out** (4.4) | n/a | cc `memorytags`, `moments` |
| R79 | card-visit.js:546 | remove the hearts box | 2800 ms | none | `_later(s, ..., { group: "fx", undo: box.remove })` | low | cc `play`, `react`, `infrared` (token `hearts`) |
| R80 | card-visit.js:571 | `_animate`: remove the class | `ms` per call (86 callers) | the module `WeakMap` `ANIMATE_TIMERS`, `clearTimeout` `:570` | `_hold(s, el, [cls], ms, { key: cls, target: el, restart: true, mirror })`; the map goes | med-high | `motion_ship1/2.test.js`, `care_reactions.test.js`, `touch.test.js`, `sitter_life.test.js`; cc `pat`, `react`, `care` |
| R81 | card-visit.js:623 | remove the house fx class (heat, cool, suds, tumble, chime) | 2500 ms | `clearTimeout` `:622` only a re-trigger; not `_forget` (B1) | `_hold(s, s.screen, [cls], 2500, { key: "housefx" })` | low | cc `moments`, `channel`, `devicefx` (11 refs) |
| R82 | card-visit.js:632 | remove `fx-robot` | 6000 ms | `clearTimeout` `:631`; not `_forget` (B1) | `_hold(s, s.screen, [fx-robot], 6000, { key: "robot" })` (Q3) | low | cc `moments` (2) |
| R83 | card-visit.js:731 | the glass mark's backstop | `showMs + fadeMs + 500` | `_markEnd` (`:754`), `_forget` | `_later(s, ..., { key: "mark" })`; the adapter keeps its `animationend` | low | cc `devicefx`; `rare_glass.test.js` |
| R84 | card-visit.js:791 | remove the sparkle ring | 600 ms | none | `_later(s, ..., { group: "fx", undo: ring.remove })` | low | uncovered |
| R85 | card-visitors.js:196 | the world visitor's steps (`at`, 8 calls `:203-222`) | up to `total` | `V.timers`, `_visitorEnd` (`:321`) | `_later(s, ..., { group: "visitor" })`; `_visitorEnd` cancels the group | med | cc `visitors` (20) |
| R86 | card-visitors.js:429 | the basket reveal's steps (`at`: one per find, then `total`) | `FIND_STEP_MS` 2500 per find | `R.timers`, `_revealEnd` (`:487`) | `_later(s, ..., { group: "reveal" })` | med | cc `finds`; `find_lines.test.js` |
| R87 | card-visitors.js:455 | remove a new find's ring | 600 ms | none | `_later(s, ..., { group: "reveal", undo: ring.remove })` | low | uncovered |

Two rows are shared lines that look like several sites: R29 (11 `at` calls through one `setTimeout`),
R85 (8) and R22 (9 callers of one helper). The grep rule counts lines.

### 3.13 Things that are not timers but are read like them

Not migrated, and not in the rule: `animationend` listeners (`card-build.js:216,221,226`; they `release()`
the leased effect, with the director's own watchdog behind them) and `transitionend` on the track
(`:74`, a layout snap). `Date.now()` state fields that the tick reads as clocks: `poseUntil`, `patPoseUntil`,
`movingUntil`, `turnUntil`, `ghostUntil`, `flairUntil`, `visitUntil`, `propUntil`, `markUntil`,
`nextVisitCheck`, `sayUntil`, `stretched`. They schedule nothing; the tick polls them.

## 4. What stays out, and why

The owner wants "all". Five sites stay out of the ledger (the final allowlist), each with its reason, and
each with the nearest thing the migration can still do for it. Everything else in the card moves.

1. **R7 `_tick` interval and R10 the director's injection point (`schedule`, `repeat`, `frame` in
   `card-build.js`).** They are the clock and the plumbing; the ledger is built on them. The rule's
   allowlist names the lines; `repeat` and `frame` are new lines in the same call.
2. **R6 the care scene's rAF loop (`card-actions.js:175,177`).** A pure function of `t` per frame, owned by
   `_sceneStart/_sceneEnd` and `s.scene`, which the director already reads as a busy owner. Moving the frame
   loop through `frame()` gains nothing (the loop is already cancelled by `_sceneEnd` on every path:
   forget, disconnect, swipe) and risks the scene's 60 fps timing. What moves is everything the scene
   leaves behind: R15, R16, R17-R20, R42 (slices 9). Q4.
3. **R69 the typing interval (`card-tick.js:593`).** The `text` track belongs to the card by design
   (`device-alive` 5.1: "the director reads them as busy and never cancels them"). It is wall-clock driven
   (a tab held back catches up from `Date.now()`), is stopped by `_stopTyping` on hidden, forget and
   disconnect, and has no class or element to undo. Q4.
4. **R78 the answer resend (`card-visit.js:512`).** A delivery retry of something the player typed or
   tapped. Draining it on `_forget` or disconnect would **lose an answer** (the pet said it would
   remember): a regression, not a fix. It must outlive the slide and the card. Q4.
5. **CSS `infinite` animations** (the 45-odd rules the audit listed: breathe, hop, dance, shiver, rainfall,
   lightning, leaf, ripple, ...). They are not timers; each is gated by a class that **something removes**.
   The plan moves the thing that removes the class (the rows above), not the CSS. The reduced-motion kill
   (`style.js:37-40`) and `tests/js/motion_rule.test.js` stay the guard.
6. **WebAudio** (`prefs.js:209-280,470`): scheduled on the AudioContext's own clock, parked on hidden
   (`audioPark`) and released on disconnect (`audioLeave`); no timer exists to own. `stopBabble` stays.
7. **State clocks** (3.13): polled by `_tick`, not scheduled.

## 5. Slices

Ordered low risk to high, each independently shippable and revertible. "Tier" is the repo's review tier
(1: JS tests plus the gate's picked sections). Size is the number of rows moved.

| # | Slice | Rows | Risk | Fixes |
|---|---|---|---|---|
| 0 | The API, adapters, trace harness, ratchet. No caller moves | none | none | none |
| 1 | Chrome: taps, mode swap, wipe, status note, head, mould frame | R1-R5, R25-R28, R40 | low | B1 (part) |
| 2 | Screen boxes and classes: flair, house fx, robot, breezy, hearts, sparkle, bubble pop, backlight, glass mark backstop | R21, R42, R43, R59, R79, R81-R84 | low | B1 (part) |
| 3 | Pet body one-shots in `_tick`: look, wander, swap flip, after-turn, speck, perk2, chirp, yawn, shake | R60-R68, R70, R73 | med | B1, **B3** |
| 4 | Pose, props, lean, ghost | R57, R58, R71, R72, R74, R75 | med | B1 (lean) |
| 5 | Looks, gift, ask, moment follow-ups | R34-R37, R41, R44, R76, R77 | med | B1 |
| 6 | Season | R45-R50 | med | B1 |
| 7 | The `_animate` helper | R80 | med-high | B1 |
| 8 | Boot and power-on | R11-R13 | med | none |
| 9 | Care scene stragglers and the drape | R15-R20 | med-high | **B4** |
| 10 | Games | R22-R24 | med | B1 |
| 11 | Visitors, reveal, swipe grace | R14, R85-R87 | med-high | B1 |
| 12 | The infrared link | R29-R33 | high | B1 |
| 13 | Channel and sheet waits, memory page | R8, R9, R38, R39, R51-R56 | high | none |
| 14 | Close-out: final allowlist, `_forget` becomes one drain, docs | none (deletes dead fields) | low | B1 (global test) |
| X1 | Hidden policy: flip the listed entries to `drop` | policy only | low-med | **B2** |

Slice 14's `forget_drain.test.js` is the global proof of B1. X1 is outside the numbered ladder because it
is the only slice that changes what the player can see (a stale effect no longer shows on return) and it
rests on Q2. Slices 1-13 can ship before or after it.

### 5.0 Slice 0: the API, adapters, harness and ratchet (no caller moves)

- **Moves:** nothing. Adds `later`, `every`, `frame`, `adopt`, `cancel(scope, {...})`, `drain`, `hidden`,
  `pending`, the `inspect().timers` field to `interaction-director.js`; `_later`, `_hold`, `_waapi` to
  `card-base.js`; `this._dirCard` and the three injected functions in `card-build.js`; one line in
  `_dirPause` calling `hidden()`; a row in AGENTS.md's table for the ledger.
- **Characterization:** none needed (nothing moves). The new behaviour is tested by L1-L16 (1.5) and the
  adapter tests.
- **The harness:** `tests/js/timer_trace.js` (helper) and `tests/js/timer_trace.test.js`. A `vm` sandbox
  as in `sitter_life.test.js`: the card's own methods from `card-source.js`, a **fake clock** (`setTimeout`,
  `clearTimeout`, `Date.now`, `performance.now`, all driven by `advance(ms)`, equal-delay timers in
  creation order), a tiny DOM (an element with a `classList`, `style`, `remove()`, `offsetWidth`,
  `append`, `getAnimations`), the real `HATCH_DIRECTOR` built with the fake `schedule`, and `calm()`
  switchable. `trace(site, { calm })` runs a site, advances in 10 ms steps to the site's longest delay plus
  500 ms and returns the ordered list `[ { t, el, op, arg } ]` (`class+ pet.perk`, `class- pet.perk`,
  `remove speck`, `call _look`, ...). Tests assert the list. **The same sandbox runs before and after the
  move**: before, the code uses bare timers (the sandbox's fake); after, it goes through the ledger over the
  same fake clock. A trace that differs by one `t` fails.
- **The ratchet:** `tests/js/timer_rule.test.js`. It strips comments from each `src/card/*.js` and counts
  `setTimeout(`, `setInterval(`, `requestAnimationFrame(`, `clearTimeout(`, `clearInterval(`,
  `cancelAnimationFrame(` and `.animate(` per file, against a table pinned to `531cd101`'s counts (the
  Appendix A and section 3 numbers). **It fails when a count differs in either direction**: a new bare
  timer fails at once, and a slice that removes one must lower the number in the same commit. Slice 14
  replaces the table with the five-entry allowlist (section 4) and adds the field rule (`\w+Timers?\s*=`).
- **Checks:** `node --test tests/js/*.test.js`; `node scripts/build-card.js`; `scripts/gate --auto` (the
  diff touches `card-base.js` and `card-build.js`; it picks what uses them); no HA needed beyond that.
- **Device queue:** none (nothing to see).
- **Timings:** none changed. **Rollback:** revert the commit.

### 5.1 Slice 1: chrome

- **Moves:** R1-R5 (`_tapped`, `_perk`, the failed class), R25 (status note), R26 (`_mould` frame), R27
  (head swap), R28 (wipe), R40 (mode swap). Keys as in section 3. `_forget`'s `clearTimeout(s.statusMessageTimer)`
  stays until slice 14.
- **Characterization first:** `chrome_trace.test.js`: a tap adds `tap-feedback tapped pressed`, `pressed`
  goes at 160, `tapped` at 400, `burst` ring at 500 on a toy; `_perk` removes at 320; a double tap at 100 ms:
  the first tap's timer removes `pressed` at 160 and the second's at 260 is a no-op (**this pins the
  quirk**; to keep it, R1/R2 use no key, so two taps give two timers); `_wipe("side")` then `_wipe("up")`:
  one removal at 170 from the second call; the status note hides at 3500 and a second call restarts it;
  `_modeSwap` removes at 90, none under calm; the head swap fires once at 250. Reach today:
  `cap_press.test.js`, `shell_modes.test.js`, `motion_ship2.test.js`, cc `pat`, `shellmode`.
- **Checks:** the trace tests; `cap_press.test.js`, `motion_rule.test.js`, `motion_ship2.test.js`;
  `scripts/gate --auto` (picks `pat`, `shellmode`, `care` and the sections that name `_tapped`).
- **Device queue:** fixture: any pet on a phone, day. `qa_screen`: the pet screen with the four care caps.
  Look at: tap each cap (pressed fall, tapped glow ends in about half a second, the toy's ring), tap the
  status button and close it (the wipe), a failed call (the cap's shake), switch to a game (the eight caps
  rebound once). Nothing should differ from the build before.
- **Timings:** identical. **Rollback:** revert.

### 5.2 Slice 2: screen boxes and classes

- **Moves:** R21 flair, R42 bubble pop, R43 breezy, R59 backlight, R79 hearts, R81 house fx, R82 robot,
  R83 glass mark backstop, R84 sparkle. House fx and robot also clear on `_forget` now (B1: before, a house
  fx survived a reused slide). The mark keeps its `animationend` release and `_markEnd`; only the
  `markTimer` field moves.
- **Characterization first:** `screen_fx_trace.test.js`: `_houseFx("fx-heat")` adds, removes at 2500,
  a second call at 1000 removes the first class at once and the second at 3500 (exactly as now: the first
  `clearTimeout` and the class sweep); `_robotFx` removes at 6000 (pins Q3); `_flair` box at 4200 and a
  second flair replaces the first box and timer; `_backlight` at 3000, re-tap restarts; `breezy` at 2600;
  `_bondHearts` box at 2800 and a second call removes the old box (the timer of the old box still fires
  and is a no-op on a detached node; the ledger version leaves one entry per box, so **the trace pins the
  call count, not the entry count**); `_sparkle` at 600; `_bubblePop` removes the image at 1300 (no caller reads its return value, so
  the migrated form may return the image only); the mark's backstop at `showMs + fadeMs + 500` and
  `_markEnd` cancels it. Under calm: `_bubblePop` and hearts are not made.
- **Checks:** trace tests; `device_fx_room.test.js` (house fx and robot are named there), `care_reactions.test.js`;
  `gate --auto` picks `moments`, `devicefx`, `backlight`, `sharedscreen`, `winter`.
- **Device queue:** fixture: dev pet with the house signals (heating, cooling, robot, tumble dryer) from
  `scripts/dev-seed`. `qa_screen`: the pet screen. Look at: the heat shimmer, the cool wisps, the robot
  crossing (still 6 s), a trait flair box on a new trait, the backlight tap (3 s), the fan's breeze, a bond
  hearts burst. Swipe to the next pet mid-effect: nothing of it on the next pet.
- **Timings:** identical. B1 (house fx, robot) fixed. **Rollback:** revert.

### 5.3 Slice 3: pet body one-shots in `_tick`

- **Moves:** R60 `_look`, R61 `_wander`, R62-R63 `_swapFlip`, R64 `_afterTurn`, R65 perk2, R66 chirp, R67-R68
  speck, R70 yawn, R73 shake. The class adds stay where they are.
- **Characterization first:** `pet_oneshots_trace.test.js`: `_look(s, 600)` adds `look` at 0, removes at 600;
  `_wander(s, 2000)` with a pinned side adds the side (and `look` when left), removes both at 2000; a
  second `_look(s, 600)` at 300 ms does **not** extend the first (the first timer removes the class at 600;
  the second's at 900 is a no-op). A key would make the second replace the first and keep the class to 900,
  a timing change, so `_look` and `_wander` use **no key** (two entries) and only gain the drain. `_swapFlip`: `put` at 100, `turn` removed at 200; **B3 case:** two flips 100 ms apart:
  before, `turn` is removed at 200 by the first, cutting the second short; after, it is removed at 300
  (keyed). This is the one intended change and the trace test carries both traces: the "before" trace
  marked `B3` in the test and replaced in the same commit as the fix. `_afterTurn` runs now or at the
  remainder; the speck is removed at 2700 and the pet looks at 0 or 1200; yawn: excited frames and a
  `greethop` at 900 only if the pose is still the yawn; shake: second flip at 550 only if the pose is
  unchanged. Every one of these also under `calm()`.
- **Checks:** trace tests; `motion_rule.test.js`, `touch.test.js`, `excited_pose.test.js`,
  `nature_lines.test.js` (speck); `gate --auto` (picks `pat`, `react`, `ghost`, `types`, `moments`, `egg`).
- **Device queue:** fixture: bench `--preset species` (`petAt` pauses mid look) and a dev pet that changes
  stage (`scripts/dev-seed` stage-up). `qa_screen`: the pet screen. Look at: an idle glance and a wander
  (left turns first), a stage-up (the paper flip, then the born pop), a trick on a new day, a head shake
  on a refusal, a speck crossing.
- **Timings:** identical except B3 (named above). **Rollback:** revert.

### 5.4 Slice 4: pose, props, lean, ghost

- **Moves:** R57-R58 (ghost, `adopt`), R71 `_poseEnd`, R72 `_propShow` out, R74-R75 the pat lean.
- **Characterization first:** `pose_lean_trace.test.js`: `_poseEnd` restores frames at `poseUntil + 30` and
  not if a newer pose owns the end (both traces); the prop gets `prop-out` at `ms - 300` unless calm or
  re-shown (a second `_propShow` at 200 ms cancels the first, as `clearTimeout(s.propOutTimer)` does);
  the lean: add `lean-l`, release at `holdMs` (add `lean-rel`, drop `lean-l`), `lean-rel` and `lean-sick`
  gone at 300 / 450; a new pat inside the hold clears both (as now); **`_forget` mid-lean: before, the
  release timer strips `lean-*` from the next pet at its due time; after, the drain does it at once (B1)**.
  Ghost: a frame swap while `getAnimations()` is non-empty does nothing; a trail cancels the earlier
  animations (the WAAPI object is a stub that records `cancel`).
- **Checks:** trace tests; `touch.test.js`, `care_reactions.test.js`, `excited_pose.test.js`; `gate --auto`
  (`pat`, `react`, `ghost`, `care`).
- **Device queue:** fixture: dev pet teen and adult, awake. `qa_screen`: the pet screen. Look at: pat the
  left and the right of the head (the lean in and out), pat a sick pet (slower), a food reaction (the prop
  falls, then slides out), a wander (the faint ghost trail).
- **Timings:** identical; B1 for the lean. **Rollback:** revert.

### 5.5 Slice 5: looks, gift, ask, moment follow-ups

- **Moves:** R34 trick move, R35 promise move, R36 ask text step, R37 gift pop, R41 moment flair, R44 smug
  rock, R76-R77 ask timers.
- **Characterization first:** `looks_trace.test.js`: trick and promise moves 600 ms after the line (none
  under calm for the trick; the promise move checks calm itself); the ask ends at 60000 and the text step at
  60000 (`step.until` is `ASK_MS + 1000`); a hidden tab ends the text step now (existing, unchanged); the gift
  pop ends at 5000 and `_giftPopEnd` at 3000 cancels the timer; the smug rock fires only if
  `!s.scene && !s.asleep && !owned`. Reach: `promise.test.js`, `gift_lines.test.js`, cc `gifts`,
  `memorytags`, `personality`.
- **Checks:** trace tests; the above `tests/js` files; `gate --auto` (`gifts`, `moments`, `personality`,
  `memorytags`, `visitors`).
- **Device queue:** fixture: dev pet with a gift waiting, and a question due (`scripts/dev-seed`).
  `qa_screen`: first look after a long absence; the question bubble. Look at: the gift pop above the pet and
  its line (5 s), the question stays 60 s then goes, a trick's move after its line.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.6 Slice 6: season

- **Moves:** R45-R50. The `.flair` sweep in `_flair` (which removes a costume box too) stays.
- **Characterization first:** `season_trace.test.js`: a costume then the treat at +1600; the confetti box at
  3600; the costume box at `FLAIR_MS + 1800`; a flock of 5 flyers at `lag * 450`; each flyer removed at
  `ms + 200`; the visit steps at 1400, 3400 and `ms`, with `_seasonVisitEnd` cancelling the rest (the group)
  and keeping the flyer's picture only when `passed`. Under calm: the same trace (the audit's finding 5:
  these sequences run under calm today; pinned, not changed).
- **Checks:** trace tests; cc `winter` and `moments` carry the season code (`gate --auto` picks them; the
  `winter` section is the largest consumer).
- **Device queue:** fixture: no bench preset covers the season boxes; use the dev HA with the date pinned to a
  season, as the `winter` card-check section does. `qa_screen`: the pet screen on a seasonal day. Look
  at: costume and treat, confetti, a flyer crossing, the visitor's startle and greet; swipe away mid-visit.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.7 Slice 7: the `_animate` helper

- **Moves:** R80. `ANIMATE_TIMERS` goes. `_animate(s, el, cls, ms)` becomes `_hold` with `restart` and the
  drape mirror; `key = cls`, `target = el`. 86 callers do not change.
- **Characterization first:** `animate_trace.test.js`, a table of every `(cls, ms)` pair `_animate` is
  called with (extracted from the source by regex so a new caller is a new row): for each, the class is
  added at 0, removed at `ms`; a second call at `ms / 2` restarts (the old timer does not remove the new
  class; removal at `1.5 * ms`); the same class on two elements (`s.pet` and `s.gameNum`) is two entries;
  the drape mirror gets the class unless `cls === "lie"` or the drape is hidden; `ms` of `0`; an
  element that left the DOM. `_forget` mid-move now removes the class at once (B1).
  Reach: `motion_ship1/2`, `touch`, `care_reactions`, `sitter_life` tests; cc `pat`, `react`, `care`.
- **Checks:** trace tests; all `tests/js`; `gate --auto` (every section that names `_animate`: it will pick
  most; the first mate's batch gate covers the rest).
- **Device queue:** fixture: dev pet; bench `--preset species` for the moves. `qa_screen`: the pet screen,
  then a care scene. Look at: perk after a tap, greeting hops after a long absence, a snack's chews 300 ms
  apart (the comment above `_animate`, `card-visit.js:557`), settle on sleep, every game win.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.8 Slice 8: boot and power-on

- **Moves:** R11 gag steps, R12 boot wait, R13 boot fill. `_powerEnd` cancels the group; `_bootEnd`
  cancels the key. Drain rule: R12 and R13 are **end** (their `undo` is `_bootEnd(false)` / the `finish`
  closure), because today the fill timer outlives a disconnect and clears `_booting`; if they were dropped,
  a reconnect would find `_booting` stuck. R11's `_powerEnd` is the gag's own closer: **end**.
- **Characterization first:** `boot_power_trace.test.js`: the gag's steps at their `at` offsets (blank
  blinks, the low line at 0, the next at 2200, the end at 4200) and calm's reduced set; a tap during the gag
  ends it with the rest dropped; the boot wait ends silently at 5000, a tap sooner, and the fill finishes
  at +600 (none under calm).
- **Checks:** trace tests; `leak_guard.test.js`; `gate --auto` (`lowbattery`, prelude).
- **Device queue:** fixture: dev pet with a low battery; a first load with the boot logo (reload the page).
  `qa_screen`: the boot logo, then the low-battery screen. Look at: 5 s with no tap ends silently; a tap
  fills the logo and cuts to the pet; the low-battery gag's blinks and lines.
- **Timings:** identical. **Rollback:** revert.

### 5.9 Slice 9: care scene stragglers and the drape

- **Moves:** R15 rock2, R16 murk, R17-R20 drape (group `drape`, drained by `_drapeStop` as now). `_sceneEnd` gains `drain(s, "scene-end", { group: "scene" })`
  **only when `quiet` is true or the end is a swipe/forget**; a normal end (the answer arrives, the hold runs
  out) leaves the group, so the 1.3 s shake-off after the broom still plays out, exactly as now.
- **Characterization first:** `scene_stragglers.test.js`: a clean scene to 1800 ms adds `rock2` and removes
  at +1300 even if the scene ends at 2000 (pins the normal end); the murk restore at +50. The B4 cases: a
  quiet end at 1900 (forget): before, `rock2` is stripped at 3100 from the next pet; after, it goes at 1900.
  Drape: a fall is three frames at 0, 150, 300 and `drapeAnim = false` at 450; `_drapeStop` cancels all
  (the group); a lights-on slide-out hides at 150.
- **Checks:** trace tests; `care_reactions.test.js`, `motion_rule.test.js`; `gate --auto` (`care`, `pat`,
  `react`).
- **Device queue:** fixture: bench `--preset` care shots (`care: "clean"`, `careAt: 2000`) and a dev pet
  asleep with lights out. `qa_screen`: the clean scene, the lights scene. Look at: the broom shake-off
  after the sweep (still plays to the end), tuck and wake (the blanket's three frames), swipe away from a
  scene mid-way.
- **Timings:** identical; B4 fixed for forget and disconnect. **Rollback:** revert.

### 5.10 Slice 10: games

- **Moves:** R22 `_gameLater`, R23 flip swap, R24 flavour line. `_endGame` cancels the group `game` (its
  `gameTimers` set goes).
- **Characterization first:** `games_trace.test.js`: `_gameLater(s, g, 1500, fn)` fires at 1500 only if
  `s.game === g` (the guard stays in the wrapper); `_endGame` cancels all pending; a replaced game (`g2`)
  drops `g`'s steps; the flip swap at 80 only if `dataset.n` unchanged; the flavour line at 4000 only if no
  game. Reach: `hop_board.test.js`, cc `play`, `resume`, `shellmode`, `board`.
- **Checks:** trace tests; `hop_board.test.js`, `shell_modes.test.js`; `gate --auto` (`play`, `resume`,
  `shellmode`, `board`).
- **Device queue:** fixture: dev pet, `left_right` and `higher_lower`, and Hop if `experimental_hop`.
  `qa_screen`: the game screen. Look at: the flip-clock digit, a round's end pause and the next prompt, quit
  mid-game (nothing late appears), the pet's line a few seconds after a win.
- **Timings:** identical. **Rollback:** revert.

### 5.11 Slice 11: visitors, reveal, swipe grace

- **Moves:** R14, R85, R86, R87. `_visitorEnd` and `_revealEnd` cancel their groups (`V.timers`,
  `R.timers` go).
- **Characterization first:** `visitors_trace.test.js`: a walking visitor's steps at their offsets (the look
  at `inMs`, the pair behind at `PAIR_BEHIND_MS`, greet at `greetAt`, leave at `greetAt + stay`, end at
  `total`); each step re-checks `_visitorLive`; swipe away at +100 and back at +400: the visitor stays; away
  past 600: it goes at +600; the reveal's find *i* at `i * 2500` and the end at `total`.
- **Checks:** trace tests; `find_lines.test.js`, `visitor_day.test.js`; `gate --auto` (`visitors`, `finds`,
  `gifts`, `collection`).
- **Device queue:** fixture: dev pet with a world visitor due and a basket of finds
  (`scripts/dev-seed`). `qa_screen`: the pet screen with a visitor; the basket reveal. Look at: the visitor
  walks in, is greeted, leaves; swipe away and back quickly (it stays); the reveal shows each find 2.5 s.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.12 Slice 12: the infrared link

- **Moves:** R29-R33, with `every` for the two intervals. `_linkEnd` cancels the group `link` (its
  `L.timers`, `L.swap`, `L.flap` go). The card-level scope is `this._dirCard` (the link outlives a slide).
- **Characterization first:** `link_trace.test.js`: the 11 `at` offsets for a calm and a non-calm visit,
  with and without a stretch (`L.beamMs`), the frame swap every 700 ms (none under calm), the head flap
  every 200 ms, beam `gone` at `ms + 500` and removed at `ms + 900`; `_linkEnd(true)` at the end; a cut
  short (a sleep, a tap on Status) cancels everything and leaves no interval (the fake clock's pending count
  is 0). Reach: cc `infrared` (71 refs), `link_lines.test.js`.
- **Checks:** trace tests; `leak_guard.test.js` (no live interval after the card leaves); `gate --auto`
  (`infrared`, `restart`, `oldcard`).
- **Device queue:** fixture: two dev pets on one card, a kindred pair and a stranger pair
  (`scripts/dev-seed`). `qa_screen`: the shelf with two pets, then the visit. Look at: the whole visit start
  to end (about 5.6 s, 3.6 s with reduced motion), the beam, the guest's frame swap, the host's line; swipe
  mid-visit; open Status mid-visit.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.13 Slice 13: channel, sheets and the memory page

- **Moves:** R8, R9 (subscribe wait and retry), R38-R39 (memory idle, confirm), R51-R56 (sheets), R83 (the
  mark's backstop). These are network and UI waits; the owner may drop this slice (Q7) and the allowlist
  then grows by these lines.
- **Characterization first:** `waits_trace.test.js`: the subscribe wait at 3000 then `subscribeFailed`;
  the retry at 2000, 5000, 15000, then 60000; `_unsubscribe` cancels both; a stale `subGen` ignores the
  retry; the shell pick rejects at 10000 unless the call finishes; `shellPending` clears at +5000 after a
  success for the same pet only; the lay wait at 30000, again at +5000 while reloading, up to 120000;
  `_layDrop` cancels; the rename retry at 2000 once (code `not_ready`); confirm lapses at 4050;
  memory idle closes at 120000 and a tap restarts it. Reach: `subscribe_silence.test.js`,
  `memory_page.test.js`, cc `channel`, `shell`, `egg`, `forget`.
- **Checks:** trace tests; `subscribe_silence.test.js`, `memory_page.test.js`, `leak_guard.test.js`;
  `gate --auto` picks `channel` and more; the mark backstop moved in slice 2; because `card-base.js` subscribe code changes, **run
  `scripts/ci-gate`** on the slice's branch (the whole card-check, five shards) before it merges.
- **Device queue:** fixture: dev HA, reload mid-session; airplane mode on the phone and back. `qa_screen`:
  the pet screen, the status page's memory page, the shell picker, the lay sheet. Look at: the card loads
  on a cold start, comes back after a lost connection, the shell pick commits, the memory page closes after
  two idle minutes.
- **Timings:** identical. **Rollback:** revert.

### 5.14 Slice 14: close-out

- **Moves:** nothing new. Replaces the ratchet table with the five-entry allowlist (section 4) and adds
  the field rule (no `\w+Timers?\s*=` outside the allowlist). `_forget` loses the manual `clearTimeout` lines
  (`card-build.js:805,852-858`) now that `detach` drains; `disconnectedCallback` loses `clearTimeout(this._headTimer)`.
  Adds `forget_drain.test.js` (B1, global) and extends `leak_guard.test.js` with `director.pending() === 0`.
  AGENTS.md: the "Where things live" row for `interaction-director` gets the ledger; a short "Timers on the
  card" rule (a new timer goes through `_later`/`_hold`; the allowlist is the only exception). This plan is
  marked done.
- **Characterization first:** the global trace: every migrated trigger run once, then `_forget(s)`, then
  `pending(s) === 0` and the clock advanced by 10 s changes nothing on the next pet (`class`, `style`,
  child count unchanged).
- **Checks:** all `tests/js`; `gate --auto` plus a final **`scripts/ci-gate`** (the first mate's batch gate
  covers it).
- **Device queue:** none beyond a smoke of slices 1-13.
- **Rollback:** revert (the earlier slices stand; they do not depend on it).

### 5.X1 Hidden policy (B2)

- **Changes:** `hidden: "drop"` for the entries of: flair box, season boxes and flyers, confetti, house fx,
  robot, hearts, sparkle, speck, bubble pop, find ring. Not for: anything with a state side effect (pose
  end, ask, gift, memory, visitors' end, subscribe, boots) and not the link until Q2's second half.
- **Characterization first:** `hidden_policy.test.js`: with `document.hidden` true and the clock advanced,
  each listed entry is gone at once (its class off, its node removed) and not again at its due time; each
  unlisted one still fires on time.
- **Checks:** `hidden_policy.test.js`, `gate --auto` (`moments`, `winter`).
- **Device queue:** phone: start a flair or a house fx, lock the screen for 10 s, unlock: nothing stale on
  the screen. **Timings:** the visual ends earlier on a hidden tab (the bug). **Rollback:** revert.

## 6. The testing method, once

1. **Write the trace first.** For the slice's rows, a `trace()` test (5.0) against the unmoved code. It must
   pass on the tree before the move. It records, for each trigger, the ordered `(t, effect)` list with
   `calm` both ways. This is the contract.
2. **Move.** Change the sites as the table says; the trace test must pass **unchanged**. The only allowed
   edits to an existing trace are the ones the slice names (B3 in slice 3, nothing else).
3. **Drain tests.** For each moved row: (a) `_forget(s)` after the trigger, then advance 10 s: the next
   pet's classes and nodes are untouched and `director.inspect(s).timers` is empty; (b) the **disconnect
   trace**: `disconnectedCallback`, advance 10 s, compare the end state (classes, nodes, `s.*` flags,
   `_booting`, `drapeAnim`) with what the unmoved code leaves, then reconnect and tick once.
4. **Calm test.** Each moved site under `calm()`: the set of pending `motion` entries equals the set before.
5. **Ratchet.** Lower the numbers in `timer_rule.test.js` by the lines the slice removed.
6. **Gates.** `node --test tests/js/*.test.js`, `node scripts/build-card.js`, `scripts/gate --auto`; the
   first mate runs `scripts/ci-gate` on the merged batch. Slice 13 runs `scripts/ci-gate` itself.
7. **Real browser, sparingly.** `leak_guard.test.js` (Playwright, bench page) after slices 8, 12, 13 and 14;
   the bench `petAt`/`careAt` shots for the look of 3, 4, 7, 9.

## 7. Acceptance for the whole effort

1. **The grep rule is a test.** `tests/js/timer_rule.test.js`: no `setTimeout`, `setInterval`,
   `requestAnimationFrame`, `clearTimeout`, `clearInterval`, `cancelAnimationFrame` or `.animate(` in
   `src/card/*.js` outside the allowlist: `card-base.js` (`_tick`), `card-build.js` (the director's three
   injected functions), `card-tick.js` (the typing interval and its clear), `card-actions.js` (the scene
   rAF and its cancel), `card-visit.js` (the answer resend). Each entry has a comment with its reason and a
   count; an unused entry fails. From slice 0 it is a ratchet (5.0).
2. **B1-B4 each have a test:** B1 `forget_drain.test.js` (and the per-slice drain tests); B2
   `hidden_policy.test.js`; B3 `swap_flip.test.js`; B4 `scene_stragglers.test.js`.
3. **The player sees no change:** every trace test in section 5 passes unchanged across its move; the
   device rows above show nothing new.
4. **No leaks:** `leak_guard.test.js` extended: after the card leaves, `director.pending() === 0`.
5. **The docs:** AGENTS.md carries the ledger and the rule.

## 8. How this inventory was checked

`grep -nE "(setTimeout|setInterval|requestAnimationFrame|\.animate\()" src/card/*.js` (style.js excluded,
it holds CSS) gave 89 lines on `531cd101`; one is a comment (`card-build.js:51`), so 88 code lines. R1-R87 are exactly
those (R6 is two lines, `:175,177`; a helper called from many places, such as R22, R29 and R85, is one
row at its one `setTimeout` line). A script compared the rows' `file:line` list with the grep: no line
missing, none extra. The 58 cancel lines are Appendix A. The first mate (or slice 0) can re-run the check: `timer_rule.test.js`
pins the same counts.

## 9. Open questions for the owner

1. **Q1. Ownership only, or arbitration too?** Do the pet's one-shots stay as they are (the director owns
   the handle and the cleanup, never refuses a call), or should a `petBody` lease start dropping a move that
   arrives while another plays? *Recommendation: ownership only.* A lease would change what the player sees
   (a perk that plays today would be dropped); that is a design change for a separate plan.
2. **Q2. Hidden tab.** (a) End the decorative one-shots at once when the tab hides (slice X1; flair, season
   boxes, house fx, robot, hearts, sparkle, speck), so nothing stale shows on return? (b) Also end the
   infrared visit on hidden (the audit's `_linkEnd()`)? *Recommendation: (a) yes; (b) no for now.* The visit
   is a scripted scene with queued lines and a cut-short path that says things; ending it on hidden is a
   behaviour change, not cleanup.
3. **Q3. The long ones.** The robot's 6 s (`card-visit.js:632`), the season box's ≈6 s (`card-season.js:307`)
   and the 4.2 s flair: keep, cap at 3 s, or document? *Recommendation: keep all three and document them as
   ambient (pointer-events none, never blocking input); a 3 s cap changes the look and the CSS keyframes
   (`robot-cross 6s`), which is art, not a migration.* No slice changes them.
4. **Q4. The five allowlisted sites** (`_tick`, the director's injection point, the typing interval, the
   care scene's rAF loop, the answer resend): accept the reasons in section 4? *Recommendation: yes.* The
   alternative for the rAF loop is to move it through `frame()` as a late optional slice; I advise against
   it (60 fps timing, no gain).
5. **Q5. The `perk` quirk.** `_perk` (`card-actions.js:32`) and `_animate(.., "perk", 320)` use the same class
   with independent timers, so one can remove the class from the other early. *Recommendation: keep them as
   two keys (identical timing) in slice 1 and leave it; merging them is a one-line follow-up if the owner
   wants it.*
6. **Q6. Where the ledger lives.** In `interaction-director.js` (443 → about 650 lines; one frozen
   namespace, one `detach`, as section 5 of the plan reads), or a new `director-ledger.js` part (its own
   frozen namespace, created next to the director; `manifest.txt` order and the TDZ check)? *Recommendation:
   keep it in the director's file;* the file's header already says "decides which effect may run"; add one
   sentence for "and owns the timers of the card's own one-shots".
7. **Q7. Network waits in the director.** Slice 13 (subscribe wait and retry, sheet waits, memory idle)
   is the riskiest; the timers are not presentation. Move them, or add them to the allowlist (the allowlist then holds
   ten more entries, and "all" is not met)? *Recommendation: move them, last, with `scripts/ci-gate`; drop the
   slice (not the effort) if the first mate sees a flake.*
8. **Q8. Device rows required before merge?** Slices 11, 12 and 13 change nothing visible; their rows are
   a smoke. *Recommendation: the owner reads one phone row for slice 12 (the link) before the batch merges;
   the others ride on the next device pass.*
9. **Q9. Batching.** One PR per slice (15 PRs, each one revert), or bundle 1+2, 3+4, 5+6 (about 9)? *Recommendation:
   one per slice until slice 4 is in and quiet, then bundle low-risk neighbours.*
10. **Q10. The device queue tool.** The brief names `qa_screen`; the repo has no `qa_screen`. The queue rows
    above name a fixture and a screen in words. *Recommendation: the first mate maps each row to the
    queue's real fields.*

## Appendix A: every cancel line on `531cd101`

`clearTimeout`, `clearInterval`, `cancelAnimationFrame`, `forEach(clearTimeout)` and `getAnimations()`:

```
card-actions 255
card-base    182 183 298 301 347
card-build   58 508 533 805 852 854 856 858 962
card-care    970
card-flair   34 195 203
card-journal 50
card-layout  433 784
card-link    166 167 303 304 305
card-looks   375 455
card-memory  56 70 295
card-mode    96
card-moment  659
card-season  399
card-sheets  143 146 317 373 491
card-tick    96 105 120 642 741 986 987 999 1002
card-visit   408 414 570 622 631 730 754
card-visitors 321 487
```

(`card-tick.js:96` and `:105` are `getAnimations()` reads. `card-build.js:58` is the director's own
`clearTimeout`.)
