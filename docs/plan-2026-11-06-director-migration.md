# Director migration: every card timer, one-shot and temporary class under the director

**Date:** 2026-11-06
**Status:** Plan only (tier 0). The migration it describes is tier 2 in total, tier 1 per slice.
No code under `src/` changes with this document. **Revised 2026-11-06 (s2977) after the adversarial
review s2976**, which found the first draft UNSAFE (blockers A1-A4); every finding is resolved below or
answered in section 10, and "Changes since review" says where. **Revised again 2026-11-06 (s2979) after the
re-check s2978** (SOUND WITH FIXES: 0 blockers, 7 fixes, 5 nits); rows R2-1 to R2-12 of the same table.
**Basis:** `origin/main` `531cd101`. Every `file:line` below was read on that tree; recheck when a
slice starts (a line drifts, the site list does not: section 3 has a script that finds a new one).
**Input:** the scout audit s2973 (`report.md`, findings 1-7). Its table was by group and sampled; this
plan's inventory is by line and complete (section 8 says how that was checked). Where the audit and the
code disagree, the code wins and section 3.1 says so.
**Intent:** `docs/plan-2026-11-03-device-alive-interactions.md` section 5 (from
`docs/plan-2026-11-03-living-device-interactions.md` section 5) says the director "owns handles
(timeout, animation, class, CSS var), clears on slide switch, removal, hidden tab and scene/game
transitions". Today it does that for the glass and the rim only. The owner asked (2026-11-06) for all of
it, with minimal risk: **the player sees no change except the bug fixes and the disclosed changes listed
in section 0 (D1-D4).**

## Changes since review

The adversarial review (s2976: 4 blockers, 19 fixes, 11 nits; verdict UNSAFE as written) is answered in
this revision. Each finding was checked against `origin/main` `531cd101` before the plan changed; all four
blockers were reproduced in the code. Labels: **A1-A4** are the review's blockers (the first mate's brief
lists the last two the other way round: A3 here is the re-entrancy, A4 the slide-less caller); **F1-F19**
are its 19 fixes (the review calls them B1-B19; the plan's own audit bugs are also B1-B4, so they are
F here); **N1-N11** its nits. Section 10 lists what was rejected or changed in form, with the evidence.

| Finding | What changed | Where |
|---|---|---|
| **A1** undo ran on a replace and on `stop` | Undo runs **only on a drain**; a same-key replace and `stop` are silent; a five-row table says which event runs what; `_hold` stops its key first; L3, L4, L20 and the adapter tests pin "re-arm keeps the class" for each named site | 1.3 rule 1, G1, G7, 1.4, 1.5, 2, 3.14 |
| **A2** `reset()` drained everything | `reset()` drains nothing; the disconnect policy is "keep, except what `disconnectedCallback` already closes"; the row table; D-keep and D-reattach tests per slice; the leak check after the longest due time | 1.3 G9, 1.5 L7, 3.14, 5.8, 5.13, 6.3, 7.4, Q11 |
| **A3** an undo that schedules during a drain | The drain runs to empty (cap 50); undo must be synchronous and final (lean's undo removes every `lean-*`); the boot timers are never drained | 1.3 G1, G7, 1.5 L18, 5.4, 5.8 |
| **A4** `_tapped(button)` has no slide | Scope rule G8: `this._dirCard` for slide-less callers; R1-R3, R5 use it; an audit step and a "called with no slide" trace in every slice | 1.3 G8, 3.2, 5.1, 5.7 |
| **F1** bench and card-check reach into deleted fields | Each slice names its `dev/bench/page.js` and `scripts/card-check.js` edits | 2, 5.1, 5.2, 5.4, 5.5, 5.8, 5.10, 5.11, 5.12, 5.13 |
| **F2** existing tests break | A per-slice list of tests edited in the move commit; the trace harness always loads the slice-0 adapters | 2, 5.0, 6.2 |
| **F3** fields read as flags | `has(scope, sel)` added; `_headTimer`, `retryTimer`, `waitTimer`, `leanTimer` named | 1.3 G7, 2, 3.4, 3.6, 5.13 |
| **F4** keys where today has none | One rule: key only where today clears that field; nine rows lose their key | 1.3 G1, 2, 3.2-3.12 |
| **F5** `adopt` had no completion | `handle.done()`, wired to `finish` and `cancel` events | 1.3 G4, 1.5 L12 |
| **F6** `_dirPause` also runs on scroll-off | `hidden(why)` with `"tab"` and `"offscreen"`; the X1 policy is `"tab"` | 1.3 G6, 5.X1, Q2 |
| **F7** slice 9's scene drain | A `swipe` flag at `card-build.js:1020`; drain before `entry.clear`; R16 in group `scene.murk` | 0 (B4 row), 3.5, 5.9 |
| **F8** slice 13 and Q7 | R51-R55 join the allowlist; slice 13 keeps R8, R9, R38, R39, R56; Q7 reversed for them, with an optional 13b | 4.5, 5 table, 5.13, 7.1, Q7 |
| **F9** `ci-gate` on every slice | In the rules and in every slice's checks | 2, 5.x, 6.6 |
| **F10** card-check sections | `boot` added to slice 8, `memorypage` to slice 13, `prelude` removed | 5.8, 5.13 |
| **F11** X1 is not independent | X1 comes after slices 2, 3, 6 and 11 | 5 table, 5.X1 |
| **F12** ratchet holes | Bare identifiers, not call syntax; `forEach(clearTimeout)` and aliases counted; `card-flair.js:195` deleted in slice 10; per-file numbers in Appendix B | 5.0, 5.10, 7.1, App. B |
| **F13** the calm test could not be written first | The `motion` label and the pending-set test are gone; each trace's `calm: true` run is the pin | 1.3 G5, 6.4 |
| **F14** the end/drop rule was not filled in | The lifecycle table, one row group at a time | 3.14 |
| **F15** missing owner questions | Q11 (disconnect policy) and Q12 (slide switch) | 9 |
| **F16** riskiest slice | Slice 7 marked high; a bench before/after contact sheet for slices 3, 4, 7 and 9 | 5 table, 5.3, 5.4, 5.7, 5.9, 6.7 |
| **F17** slice 12 notes | `L.hideAt`/`L.endAt` handle cancels named; the bench shots need the group stop | 3.7, 5.12 |
| **F18** `dueAt` clock | `deviceNow` | 1.3 G7, L14 |
| **F19** a revert conflicts in the ratchet | A rule: a revert restores its counts by hand | 2 |
| **N1-N11** | N1 `card-link.js` cites; N2 slice 12 has no B1; N3 R83 once; N4 counts 85 and 8; N5 wrappers; N6 two commits; N7 one test name; N8 `getAnimations` not counted; N9 `finish` dropped; N10 tick-polled state out; N11 leak measured late | 3.7, 5.12, 5.13, 3.12, 3.6, 1.3, 2, 7.2, App. A, G1, 4.8, G9 |

**Second pass (re-check s2978, SOUND WITH FIXES: 0 blockers, 7 fixes, 5 nits).** A1-A4 were confirmed
fixed. Each finding below was checked against `origin/main` `531cd101` first; all twelve reproduced
(`_forget` has no `_visitorEnd`/`_seasonVisitEnd` call, `_go` has no `i !== to` guard at `:1020`,
`card-board.js:174` is a quiet `_sceneEnd`, `_dropFinds` never touches `s.reveal`, `card-layout.js:433`
is R52's clear). **Nothing was rejected.** Q11 and the "no other visible change" claim now list every
disclosed change (section 0, D1-D4).

| Finding | What changed | Where |
|---|---|---|
| **R2-1** (fix 1, high) a forget mid-visit leaves `s.visitor` set | `_forget` calls `_visitorEnd(s)` (slice 11, in its move commit) and `_seasonVisitEnd(s)` (slice 6) before `detach`; R85, R14 and R50 become "closer"; a rule in 3.14: a "drop" row's `fn` must not be the only thing that clears a `BUSY_OWNERS` flag; slice 11 pins it with a forget trace (`s.visitor === null`, elements gone, `pending(s) === 0`, `_free`), slice 6 with the same for the flyer; B1 row names it | 0 (B1, D2), 3.14, 5.6, 5.11 |
| **R2-2** (fix 2) R86's disconnect closer `_dropFinds` | Disconnect = keep; `_dropFinds` must not stop group `reveal`; the A2 response row no longer lists `_dropFinds` as a closer | 1.3 G9, 3.14, 5.11, 10 |
| **R2-3** (fix 3) the swipe drain hits the slide on show | `{ swipe: i !== to }` at `card-build.js:1020`; a one-pet swipe and a dot tap keep `rock2` (trace case); disclosed as D4 | 0 (B4, D4), 5.9, Q12 |
| **R2-4** (fix 4) the Hop board's quiet `_sceneEnd` | Disclosed (D3, Q11, the B4 row, slice 9 trace case); the explicit-flag alternative is named as the cost of a "no" in Q11 and 5.9 | 0, 5.9, Q11 |
| **R2-5** (fix 5) G9/5.9/Q11 vs 3.14 on the murk | G9, 5.9 (D-keep case), Q11 and section 10 say `rock2` only; R16 is keep (it fires at +50 ms); a 3.14 row of its own | 1.3 G9, 3.14, 5.9, Q11, 10 |
| **R2-6** (fix 6) `_hold` cannot express `_wander`, `_wipe` | `_hold` gets `opts.remove` (default `classes`: the list the timer removes and `restart` clears); R28 and R61 written with it | 1.4, 3.11 R61, 3.6 R28 |
| **R2-7** (fix 7) the ratchet end state misses `card-layout.js:433` | Added to the allowlist with R52 (7.1, App. B end state); R27's cite corrected (the only head cancel is `card-base.js:183`) | 7.1, App. B, R27 |
| **R2-8** (nit 1) R36 forget closer | "drop; the tick ends it within 700 ms" (`_clearAsk` does not touch `s.textStep`) | 3.14 |
| **R2-9** (nit 2) `adopt`'s late `done()` | `done()` is per handle, idempotent, and cannot remove a newer entry under the same key | 1.5 L12 |
| **R2-10** (nit 3) slice 13's test edits | `memory_page.test.js:194,198` added | 5.13, 6.2 |
| **R2-11** (nit 4) `_animate`'s key namespace | key is `"anim:" + cls` | 5.7 |
| **R2-12** (nit 5) R19's undo never runs at a forget | R17-R20 row says closer (`_drapeStop` runs first and sets `drapeAnim = false`) | 3.14 |


## 0. The shape of the answer

1. The director gets a small, additive, pure **ledger** (section 1): owned timers, keyed replacement,
   groups, a silent `stop`, an `undo` that runs **only on a drain**, and a drain on `detach` (a forgotten
   pet), on a scene's quiet or swipe end, and on a hidden tab for the listed X1 entries. A disconnect
   drains nothing: HA re-attaches the same card and every timer that runs through a disconnect today
   still does (G9). It adds no lease, no priority, no watchdog and no drop rule to these
   timers: **ownership without arbitration**. A pet one-shot that plays today plays tomorrow.
2. 87 timer/animation start sites in 18 parts (section 3); 77 move, in 15 slices, 0 to 14, plus an
   owner-gated X1 (section 5), smallest and safest first. Slice 0 is the API, the tests, the trace
   harness and a **ratchet** test that pins today's bare-timer count per file; no caller moves. Each later
   slice lowers the ratchet.
3. Ten sites stay out for a stated reason (section 4): the five the first draft named plus the five sheet
   waits R51-R55 (review F8). The final allowlist is those ten rows.
4. Every slice writes its characterization test **first**, against the unmoved code, and the same test
   passes unchanged after the move (section 6). Timings are identical; the intentional changes are the four
   audit bugs and the disclosed list below, and each is named in its slice.
5. Open questions for the owner are in section 9 (Q1-Q12), each with a recommendation.

### The disclosed changes (the whole list; Q11, Q12 and 7.1 point here)

"The player sees no change" means no change but these four (the murk restore is **not** one: it keeps
firing at +50 ms, R16 is keep, R2-5). Anything else a trace test shows is a bug in
the slice (review s2978, fixes 1, 3, 4):

| # | What the player can see | When | Where it is fixed or decided |
|---|---|---|---|
| D1 | A second flip inside 200 ms keeps `turn` to its own end (B3) | a double tap on a species change | B3, slice 3 |
| D2 | A forgotten pet's leftovers no longer land on the next pet (B1): a class a one-shot would strip, an old visitor's art, a flock | `_forget` | B1; 3.14; slice 11 for the visitor (`_forget` ends it, R2-1) |
| D3 | The clean scene's 1.3 s `rock2` shake-off is cut when the scene ends **quietly**: at a forget, at a disconnect (G9, Q11), and when Hop's board loads over a live clean scene (`card-board.js:174`, behind `experimental_hop`; R2-4) | the scene lives past 1800 ms | B4; slice 9; Q11 |
| D4 | A swipe away from a care scene on a card with **two or more** pets cuts `rock2` on the slide being left. A one-pet swipe or a tap on the current dot goes `_go(to)` with `to === i`, the visible slide, and keeps `rock2` as now (`{ swipe: i !== to }`, R2-3) | a swipe or a dot tap | B4; slice 9; Q12 |

### The four audit bugs (named here so the slices can cite them)

The audit said "4 management bugs" without naming them; these are its findings 2, 3, 6 and 7, checked
against the code:

| # | Bug | Where | Fix | Slice | Test |
|---|---|---|---|---|---|
| B1 | A timer survives `_forget` (a slide reused for another pet) and strips a class from the next pet's sprite, or puts the old pet's art on it. Also the lean timers (`card-tick.js:992,1005`) and the `_animate` map are not cleared by `_forget`; the audit said the lean timers were. | `_look`, `_wander`, `_swapFlip`, `_afterTurn`, speck, perk2, yawn, shake, lean, `_animate`, fx boxes, season, looks | everything is created through the ledger; `_forget` calls `detach`, which drains: an end entry's `undo` runs, a drop entry is stopped (3.14). **`_forget` also calls `_visitorEnd` and `_seasonVisitEnd` before `detach`** (they are the only code that clears `s.visitor` and `s.seasonVisit`, and `s.visitor` is a `BUSY_OWNERS` entry: slice 11 owns the first, slice 6 the second; 3.14) | 1-13 | per-slice trace test, plus the global `forget_drain.test.js` in slice 14 |
| B2 | A hidden tab does not end one-shots: they finish late on return (timers are throttled), so a stale flair, season box, house fx or robot shows for a moment. | flair, season boxes, house fx, robot, hearts, sparkle | the `hidden` policy of the entry (G6); default `keep` everywhere until slice X1 flips the listed ones to `tab` (a hidden tab only, not a scroll-off) | X1 | `hidden_policy.test.js` |
| B3 | `_swapFlip` does not clear its earlier timers: a second flip inside 200 ms is cut short by the first flip's `remove("turn")`. | `card-tick.js:203-204` | `turn` removal is keyed (a new flip replaces the first removal **silently**, so the class the second flip just added stays to its own end); `put` keeps one timer per flip, in a group drained on forget | 3 | `pet_oneshots_trace.test.js` (two flips 100 ms apart) |
| B4 | `_sceneEnd` does not clear what the scene started: the `rock2` removal (1.3 s) and the murk transition reset (50 ms) survive a quiet end (a forget, a disconnect) or a swipe away. | `card-care.js:122,169` | `rock2` is in group `scene`, drained by `_sceneEnd` for `quiet` and swipe ends only (the quiet callers are `_forget`, the disconnect and **Hop's board load**, `card-board.js:174`; the swipe is `{ swipe: i !== to }` at `card-build.js:1020`), **not** a normal end (a normal end keeps the 1.3 s shake-off today, and keeps it), and **before** `entry.clear`; the murk restore is made *by* `entry.clear`, so it is in its own group `scene.murk`, is **not** drained by `_sceneEnd` (it keeps firing at +50 ms) and is drained by `detach` only | 9 | `scene_stragglers.test.js` |

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

`reset()` replaces the per-slide state map, so the ledger (1.3) lives outside it.

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

All in `interaction-director.js`, inside `create`, pure like the rest: no DOM, no clock of its own, no
timer of its own. The card passes two more injected functions (`repeat`, `frame`, none required; the
card wraps `setInterval` and `requestAnimationFrame` as it wraps `setTimeout` in `schedule` at
`card-build.js:56-59`: `repeat(ms, fn) -> cancel`, `frame(fn) -> cancel`; their signatures differ from the
natives and they return ids, so they are wrappers, not the natives). Tests pass fakes. The existing tracks,
`tick`, `cancel(slide, reason, tracks)` and `release` are untouched. **`cancel` stays track-only and never
touches the ledger** (a test pins it); the ledger's own calls are `stop`, `drain`, `has` (below), so
there is no overload of `cancel`.

**The ledger does not live in the per-slide state map.** `reset()` replaces that map (`states = new
WeakMap()`), and a ledger inside it would be lost with its timers still pending. The ledger is its own
`WeakMap(scope -> Set(entry))` plus one `Set` of all entries (for `pending`, `hidden`, `inspect`).

#### The four rules (review A1-A4)

1. **Undo runs only on a drain (A1).** An entry ends in exactly one of five ways:

   | Event | `fn` | `undo` | Used for |
   |---|---|---|---|
   | it fires | runs | no | the timer's own end |
   | a same-key `later` replaces it | no | **no** | `clearTimeout(s.x); s.x = setTimeout(...)` |
   | `stop(scope, sel)` takes it | no | **no** | every `clearTimeout(s.x)` that stands alone, and a closer's own cancel (`_powerEnd`, `_drapeStop`, `_giftPopEnd`) |
   | `drain(scope, sel)` or `detach(scope)` takes it | no | **runs, once** | `_forget`, a scene's quiet or swipe end |
   | `hidden("tab")` takes it (policy `tab`, slice X1 only) | no | **runs, once** | a decorative one-shot on a hidden tab |

   `reset()` is **not** in the table: it does not touch the ledger (rule 2). The idiom being replaced, `clearTimeout`
   then `setTimeout`, never runs an end today, and every site re-adds its class **before** it re-arms
   (the backlight, `_wipe`, `_houseFx`, breezy, the mode swap, the status note, `_animate`, `_swapFlip`, the
   ask `wait()`); an undo on replacement would strip the class it had just added. That is the A1 failure
   and the table is its fix. `_hold` still stops its own key before it touches the class, so the order
   of its two steps cannot matter.
2. **`reset()` leaves the ledger alone (A2).** See G9: today a disconnect ends a fixed list of things, by
   calling their closers, and every other timer runs on through it (HA detaches and re-attaches the same
   element). The ledger keeps that: the closers that `disconnectedCallback` calls today are unchanged,
   and they stop or drain their own entries; no entry is ended by `reset()` itself.
3. **A scope is never undefined (A4).** A site that can run with no slide uses the card's own token
   `this._dirCard`. G8.
4. **A drain runs to empty (A3).** G7.

**G1. `later(scope, ms, fn, opts) -> handle`: an owned one-shot timer.**
- `scope` is any object: a slide, or the card's own token `this._dirCard` (made in `_build`, used for the
  card-level timers: button chrome, head swap, boot, link).
- `ms` is passed to `schedule` **unchanged** (no clamp, no validation: `setTimeout` semantics, so a
  `NaN` or a negative behaves as now). No watchdog is added: the timer is `fn`, not an effect. Exactly one
  `schedule` call per `later`, so two timers of equal `ms` fire in creation order, as bare timers do.
- `opts.key` (any string): a second `later` with the same `(scope, target, key)` first stops the
  earlier one **silently** (rule 1). **Key only where today's code clears that field** (section 2): a key on
  a site that does not clear today would turn two timers into one and change when the class goes.
- `opts.target` (an object, default `scope`): a second index so one slide can hold the same key on two
  elements. This is the pet-sprite and gnum target `_animate` needs (G5).
- `opts.group` (a string): entries sharing a group are stopped or drained together, replacing the
  `V.timers`, `R.timers`, `L.timers`, `s.power.timers`, `s.gameTimers`, `s.drapeTimers` arrays.
- `opts.undo()`: what a **drain** does in place of `fn` (rule 1). It must be **synchronous and final**:
  it reaches the end state directly (a class or node removal, `drapeAnim = false`, the murk transition
  restore) and does not start a new timer. Where the natural end schedules (the pat lean's `_patLeanOff`
  makes `lean-rel` and a timer; `_bootEnd(false)` makes the fill timer), the undo is the direct form:
  lean's undo removes every `lean-*` class itself. G7 covers an undo that schedules anyway. An entry
  with no `undo` is a **drop**: a drain just stops it (a delayed start such as the treat, a flyer, a
  second perk, a line, a trick's move: it would only show on a card nobody sees, or on the next pet).
- `opts.hidden`: `"keep"` (default, today's behaviour) or `"tab"` (G6). No `finish` policy: nothing needs
  it.
- Bookkeeping first, then `fn`, **no try/catch**: the entry leaves the ledger before `fn` runs, so a
  `later` with the same key inside `fn` (a re-arm) is not stopped by itself, and a throw reaches the
  page as it does from a bare timer (the console stack is unchanged).

**G2. `every(scope, ms, fn, opts) -> handle`: an owned interval** (injected `repeat`). Same key, group,
undo and drain rules. Two sites need it (the link's frame swap and head flap); the typing interval stays
out (section 4).

**G3. `frame(scope, fn, opts) -> handle`: an owned next-frame callback** (injected `frame`). One site
(`card-layout.js:260`). Not `later(...,0)`: the timing differs and must not.

**G4. `adopt(scope, { cancel, key, group, target, hidden }) -> handle`: an owned thing that was started
elsewhere** (a WAAPI `Animation` from `.animate()`). `later` is `adopt` plus a schedule.
- **It has a completion (review F5).** `handle.done()` removes the entry without calling `cancel` or
  `undo`. The adapter `_waapi` wires `a.addEventListener("finish", done)` and `("cancel", done)`, so
  the ghost frame that `card-tick.js:99` makes on every frame swap leaves the ledger after its 180 ms and
  `pending()` can return to 0. Listeners, not `onfinish`/`oncancel`: they would overwrite a handler.
- A drain calls `cancel()` once, then forgets the entry. A same-key `adopt` replaces the earlier one
  silently (it does not call `cancel`: the ghost trail's own `getAnimations().forEach(cancel)` does that).
- The ghost keeps that call on retrigger; `adopt` only adds the drain and the count.

**G5. Pet sprite target and reduced motion.**
- The pet sprite (`s.pet`), its blanket mirror (`s.drape`) and the game counter (`s.gameNum`) need no new
  concept: they are `target`s (G1). The card adapter `_hold` (below) does the class add, the reflow and the
  drape mirror that `_animate` does today; the director never touches the DOM.
- Reduced motion has **no central rule and no flag in the ledger.** Each site keeps the `calm()` guard it
  has today, verbatim (some sites add a class even under calm because the CSS kill at `style.js:37-40`
  covers it; the trace test pins which). The pin is the trace itself: every trace test runs each site
  with `calm: true` and records what the unmoved code does (the list of effects; empty where the guard
  returns), and the moved code must give the same list. (The first draft had a `motion` label and a
  "set of pending motion entries before the move"; no such set exists before the move, so the label is
  gone: review F13.)

**G6. Hidden policy and `hidden(why)`.** `director.hidden(why)` walks the ledger; `why` is `"tab"` (the
tab hides: `_onHidden`, `card-base.js:116`) or `"offscreen"` (the card scrolls out of view:
`IntersectionObserver`, `card-build.js:141`). Both call `_dirPause` today, and `_dirPause` passes its `why`
on. An entry with `hidden: "tab"` is **drained** (its `undo` runs, review rule 1) on `"tab"` and kept on
`"offscreen"`; the default `"keep"` is kept on both, so slice 0 changes nothing. Nothing is dropped on
scroll-off: a timer does not throttle there, so the effect ends on time with nobody looking, and a drop
would end it early for a player who scrolls back (Q2). Slice X1 flips the named entries to `"tab"`; that is
bug B2 and an owner call.

**G7. Drain, stop and look.**
- `stop(scope, { key, target, group }) -> count`: silent (no `undo`, no `fn`). Every standalone
  `clearTimeout(s.x)` becomes `stop(s, { key })` at the same place.
- `drain(scope, { key, target, group }) -> count`: the same selection, but each entry's `undo` runs once
  and `fn` never does. No selector drains the whole scope.
- `detach(scope)`: **drain the scope's whole ledger first, then end the tracks and delete the state**
  (the existing order inside `detach` is otherwise untouched). `_forget` calls it already
  (`card-build.js:824`).
- **A drain runs to empty (A3).** An entry leaves the ledger *before* its `undo` runs. If the `undo`
  adds a new entry to the same scope (and, for `drain(.., {group})`, the same selection), the loop takes
  that one too: its `undo` runs, never its `fn`; so nothing is left behind in a scope that is about to be
  deleted. The loop stops after 50 passes; whatever is left is then stopped silently (a test pins both the
  normal case and the cap). An entry added by an `undo` to **another** scope is left alone. `hidden()`
  walks a snapshot: an entry created by a hidden `undo` is new and keeps its own policy.
- `has(scope, { key, target, group }) -> boolean` (review F3): for the sites that read a timer field as a
  flag. The field is removed and the read becomes `has`.
- `inspect(scope)` gains `timers: [{key, group, target?, ms, dueAt}]` (plain data), `dueAt` on the
  **device** clock (`deviceNow`, as the busy read at `interaction-director.js:118-120`; the director's
  `now` is the server clock and jumps with `noteServerTime`). `pending(scope?)` returns the count (one
  scope, or the whole director) for the leak test.
- `drainAll(why)`: drains every scope. **Tests and the bench only; the card never calls it.**
- `reset()` is unchanged for the tracks (it ends every live effect and replaces the state map) and does
  not touch the ledger. Its existing doc comment gains one line saying so.

**G8. Which scope (A4).** `later` with a scope that is not an object throws `TypeError`, like `stateOf`.
So every row names its scope, and a method that can run with no slide uses `this._dirCard`:
- `_tapped(button, s)` is called with no `s` at 54 of its 67 call sites (`card-build.js:80,86,91,95,391`,
  `card-journal.js:78,197,204`, `card-memory.js:30,238`, `card-sheets.js:64,72,85`, `card-status.js:194,341`, ...).
  R1-R3 (and R5, the failed class on the same buttons) use `this._dirCard` with `target: button`.
  Button chrome belongs to the card, not to a pet, so `_forget` does not drain it (it fires on time,
  as today). `_perk(s)` already returns on `!s?.pet`, and its `_hold` comes after that guard.
- `_animate(s, ...)` reads `s?.pet`; the 85 callers all pass a slide, but the helper uses
  `s ?? this._dirCard` for its scope.
- **Audit rule for every slice.** Before the move, list each moved method's callers that pass no slide
  (`grep -n "_name(" src/card/*.js`), and give each a scope in the slice's section. The slice's trace has
  one case "called with no slide": no throw, same effect.

**G9. The disconnect policy (A2, Q11).** What a disconnect does today, from `disconnectedCallback`
(`card-base.js:180-211`): it clears `_timer` and `_headTimer`, calls `_linkEnd`, disconnects the observers,
calls `_director.reset()`, and for each slide ends the game, the mode, the scene (`quiet`), the drape, the
typing, the power gag, the photos, the gift pop, the finds, the memory page and the subscription (with its
wait and retries). **Every other timer keeps running** on the detached element; HA re-attaches the same
element (a view switch and back, masonry re-columning), the card's `_build` does not run again, and
`connectedCallback` re-subscribes and goes on. The policy:
- `disconnectedCallback` changes by nothing except what its closers do inside: each closer stops or
  drains its own entries through the ledger instead of `clearTimeout`. `reset()` does not drain.
- **Default `keep`.** An entry that no closer names fires on its time, as the bare timer does. So `s.asking`
  is cleared by the ask's own `done` at 60 s (the question stays up through a quick re-attach, as now),
  the shell pick's race settles, the rename retry resolves, `layAt` is cleared by its `check`, `_booting`
  is cleared by the boot fill timer, and the subscribe retries are exactly as today (stopped by
  `_unsubscribe`, started again by `connectedCallback`'s `_subscribe`).
- An entry is **ended at a disconnect only where today's code ends it**, and only by the closer that does
  it. The one visible difference at a disconnect: the scene's quiet end drains group `scene` (the clean
  scene's 1.3 s `rock2` shake-off ends with the scene, which `disconnectedCallback` already closes). A
  re-attach inside 1.3 s used to see `rock2` for the rest of the second; it now does not. The scene itself
  is already gone, so this is the same state the forget path reaches (bug B4). **The murk restore is not
  drained:** it is made by `entry.clear` inside that very `_sceneEnd` (group `scene.murk`, R16: keep), so it
  fires at +50 ms as today; draining it after `clear` would restore `transition` in the same frame and the
  murk would fade back (F7). Stated in Q11 (D3) so the owner can refuse it.
- **The reveal is keep at a disconnect** (review s2978 fix 2). `disconnectedCallback` calls `_dropFinds`,
  which only bumps `findsEpoch` and drops the finds page; it never calls `_revealEnd`, so today the reveal's
  steps run through a disconnect and `s.reveal` and its box are taken off by the reveal's own last step.
  `_dropFinds` must not stop group `reveal`: it also runs when the finds page opens (`card-journal.js:524`)
  and on shared-screen flips (`card-build.js:892,926`), and a stopped reveal leaves `s.reveal` and its box
  on screen for good (only `_revealEnd` removes them).
- **Not done, on purpose:** ending decorative one-shots at a disconnect. A disconnect cannot be told from
  a re-attach until it is too late, and "end after N seconds disconnected" needs a timer of the card's
  own, which a disconnected card has none of (`_timer` is cleared). Q11 asks.
- The leak test measures `pending()` **after the longest due time** (the slowest entry is the 120 s memory
  idle, which a disconnect closes through `_memoryPageClose`; the next is 60 s), not at the leave.
- Tests, per slice, on the shared harness: **D-keep** (`disconnectedCallback`, advance 10 s, reconnect, tick
  once: the end state equals what the unmoved code leaves, field by field: classes, nodes, `s.asking`,
  `layAt`, `nameBusy`, `_booting`, `drapeAnim`, retries) and **D-reattach** (disconnect, `connectedCallback`
  100 ms later, advance to the longest due time: the same). `reattach_keeps.test.js` (slice 14) runs
  the lot once.

### 1.4 The card adapters (slice 0 adds them; no caller yet)

Thin methods in `card-base.js` (a link in the existing chain; no new part), so the migration can be a
mechanical rename. They read `this._director` (created in `_build`, which runs before any slide exists, so
there is no pre-build fallback and no bare timer in them):

| Method | Does |
|---|---|
| `_later(scope, ms, fn, opts)` | `this._director.later(scope, ms, fn, opts)` |
| `_hold(scope, el, classes, ms, opts)` | `stop` the key (if any); add `classes` to `el`; with `opts.restart` remove `opts.remove`, reflow (`void el.offsetWidth`), add; `later(scope, ms, remove, { key, target: el, undo: remove })` where `remove` takes off `opts.remove`. **`opts.remove` (default: `classes`) is the list the timer takes off** and the list `restart` clears first: a site whose adds and removes differ passes it (`_wipe` adds one of three `wipe-*` and removes all three; `_wander` adds `look` only for a left wander and removes `look` always). `opts.mirror` is the drape mirror `_animate` keeps |
| `_waapi(scope, el, frames, timing, opts)` | `const a = el.animate(frames, timing)`, then `adopt(scope, { cancel: () => a.cancel(), ...opts })`; `finish` and `cancel` events call `handle.done()`; returns `a` |
| `_stop(scope, sel)`, `_drain(scope, sel)`, `_has(scope, sel)` | the director's `stop`, `drain`, `has` |

`scope` is the first argument everywhere so a slide-less call reads `this._hold(this._dirCard, button, ...)`.

### 1.5 Tests for the API (slice 0, `tests/js/interaction_director_ledger.test.js`, `node --test`, fake `schedule`)

- **L1** fires once, at the passed `ms`, not before. **L2** equal-`ms` timers fire in creation order.
- **L3** `key` replaces **silently**: the earlier `fn` never runs and its `undo` **never runs** (A1).
- **L4** `stop` by handle, key, target and group is **silent**; a second stop is a no-op; the handle's
  own `stop` too. **L4b** `undo` does not run when the entry fires.
- **L5** `drain` by key, target and group runs each `undo` once, never `fn`; an entry with no `undo` is just
  stopped. **L6** `detach(a)` drains `a` and leaves `b`.
- **L7** `reset()` leaves every ledger entry pending and still firing, ends the tracks as before, and a
  `later` after `reset()` works (A2). **L7b** `drainAll` drains every scope.
- **L8** `hidden("tab")`: `keep` leaves it, `tab` runs `undo`; `hidden("offscreen")` leaves both.
- **L9** a throwing `fn` leaves nothing pending and reaches the caller of the schedule callback.
- **L10** a re-arm inside `fn` with the same key survives.
- **L11** `every` and `frame` through fake `repeat`/`frame`; drained.
- **L12** `adopt` calls `cancel` on drain, once; `done()` removes it without `cancel`; a finished animation
  (the stub fires `finish`) leaves `pending() === 0` (F5). **`done()` is per handle and idempotent** (review
  s2978 nit 2): the WAAPI `cancel` event of a drained ghost and the `finish` of a replaced one arrive after
  its entry has left, so `done()` on a handle that is gone does nothing, and never removes a newer entry
  under the same key (a stale handle checks that it is still the entry in the ledger).
- **L13** `target` indexes (same key on two elements: two entries).
- **L14** `inspect` and `pending()`; `dueAt` follows `deviceNow`, not `now` (F18).
- **L15** bad arguments (`scope` undefined or not an object, `fn` not a function) throw `TypeError`; `ms`
  is never validated.
- **L16** `director.cancel(slide, reason)` (tracks) does not touch the ledger, and the ledger does not
  touch tracks, `tick`, `seen` or `KEPT`.
- **L17** `detach` order: the ledger's `undo`s run, then the tracks end, then the state is deleted.
- **L18** an `undo` that calls `later` on the scope being drained (A3): the new entry is drained too, its
  `undo` runs, its `fn` never does, and `pending(scope) === 0` after. **L18b** a self-rescheduling `undo`
  stops at the 50-pass cap and leaves nothing pending. **L18c** an `undo` that adds to another scope
  leaves that entry pending. **L18d** a hidden `undo` that adds an entry: the new one is kept.
- **L19** `has` is true while pending, false once it fires (inside `fn` too) or is stopped.
- **L20** *re-arm keeps the class* (A1; adapter test, below).
- Adapter tests (vm, as `sitter_life.test.js` extracts card methods): `_hold` adds and removes; `restart`
  reflows; `mirror` follows; **a second `_hold` with the same key leaves the class on until the second
  timer** (backlight, wipe `side` then `up`, status note, `_animate` twice 300 ms apart, `_swapFlip`
  twice 100 ms apart, `_houseFx` with the same class twice); `drain` removes the class at once;
  `_hold(this._dirCard, button, ...)` with no slide works and `_hold(undefined, ...)` throws.

## 2. Rules for every slice

- One slice = one PR = one revert (the move commit). No storage, wire, server, CSS or copy change in any
  slice. (X-slices change timing only where section 9 says the owner agreed.)
- Same `ms`, same order of calls, same guards, same `calm()` checks, same `Date.now()`-based fields
  (`poseUntil`, `movingUntil`, ... stay; they are state the tick reads, not timers: section 3.13 and 4.8).
- **Key only where today's code clears that field** (review F4). A site that does `clearTimeout(s.x)`
  before it re-arms gets a key (same replace, now silent). A site that does not (`_look`, `_wander`, the
  visitor swipe grace, the trick and promise moves, perk2, the song chirp, the yawn, the head shake, the
  smug rock, the moment flair, `_perk`, `_poseEnd`, the game flavour line) stays **unkeyed**: two calls give
  two entries, as two bare timers, and the entry only gains the drain. A key there would make the
  second call replace the first and move a removal from first-plus-`ms` to second-plus-`ms`.
- **Undo runs only on a drain** (1.3 rule 1). A site that has a separate cancel path today
  (`clearTimeout(s.x)`) keeps it as `stop(s, { key })` at the same place, silent. The drain happens in
  exactly the places that already clean up: `_forget` (through `detach`), a scene's quiet or swipe end, a
  hidden tab for the X1 entries. Each row's end/drop and disconnect behaviour is in section 3.14.
- **Disconnect keeps** (1.3 G9): `reset()` drains nothing. A disconnect ends what its closers end today.
- **A timer field that something else reads as a flag** (`_headTimer` in `card-layout.js:282,289`;
  `s.retryTimer` and `s.waitTimer` in `card-base.js:246,255,264`; `s.leanTimer`, read by `_patLeanOff`)
  becomes `_has(scope, { key })` and the field goes in the same commit. Otherwise the field goes in the
  same commit as its last reader. `_forget`'s manual `clearTimeout` lines for it go in slice 14, not earlier
  (a slice never removes a safety net it did not install).
- **Bench and card-check reach into fields the slice deletes** (review F1): each slice names the edits to
  `dev/bench/page.js` and `scripts/card-check.js` in its section. The bench freezes a shot with
  `director.stop(scope, { group })` (or `drain`, where it wants the end) and card-check counts with
  `inspect(s).timers.length`. These edits go in the move commit, so the bench and the gate run on every
  slice.
- **Existing tests change in the move commit, by name** (review F2): each slice lists the tests that
  extract the code it moves (section 6.2). "The trace passes unchanged" is about the new trace tests; an
  old test that pinned a `setTimeout` call or an extracted constant is edited in the same commit.
- **The ratchet** (5.0) counts bare identifiers. A slice lowers its numbers in the same commit. **A revert
  of a middle slice** reverts its code and its trace, but the ratchet table is edited by every later slice
  on the same lines, so the revert also restores that slice's counts **by hand** (the table has one
  line per file, so the conflict is small and obvious); do not resolve it by loosening any other line.
- The characterization test is committed **before** the move, in its own commit on the slice's branch
  (it passes on the unmoved code), then the move commit makes the same test pass. Two commits, one PR;
  the rollback is the move commit (review N6).
- **Every slice runs `scripts/ci-gate` on its branch before it is called done** and again after each
  follow-up fix (AGENTS.md, owner 2026-11-04). A `gate --auto` run is for iterating. Report the run's link.
- No player copy is added or changed.

## 3. Inventory (complete by line)

Basis `531cd101`. One row per line that starts a timer, interval, frame callback or WAAPI animation:
87 rows (R-numbers). "Reach" is the card-check sections (`scripts/card-check.js --list`, found by token
search of the section's range) and `tests/js` files that **run** the path; it is not proof that anything
asserts the timer's end. Where no check asserts the end, the slice's characterization test is the pin and
the row says "uncovered" for the end. The cancel lines (`clearTimeout` etc., 58 of them) are in
Appendix A.

The "Target" column says the scope, key and group; **the end/drop and disconnect behaviour of every row is in 3.14**, and a row has a key only where its "Cancel today" names a clear (section 2).

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
| R1 | card-actions.js:12 | remove `pressed` from the tapped button | 160 ms | none | `_hold(this._dirCard, button, [pressed], 160)`: **card scope** (`_tapped` has no `s` at 54 of 67 call sites, G8), unkeyed | low | `cap_press.test.js`; cc `care`, `memorytags` |
| R2 | card-actions.js:13 | remove `tapped` | 400 ms | none | `_hold(this._dirCard, button, ...)`, unkeyed | low | same |
| R3 | card-actions.js:18 | remove the `burst` ring on a toy | 500 ms | none | `_later(this._dirCard, ...)` + node undo, unkeyed | low | cc `care` (reach) |
| R4 | card-actions.js:32 | `_perk`: remove `perk` from the pet | 320 ms | none (re-add restarts, the old timer still fires) | `_hold(s, s.pet, [perk], 320)`, **unkeyed** (a key would end the second perk at the second tap + 320 instead of the first tap + 320: Q5); after the `!s?.pet` guard | low | uncovered |
| R5 | card-actions.js:65 | remove `failed` from the button | 400 ms | none | `_hold(this._dirCard, button, [failed], 400)`, unkeyed | low | cc `moments`, `photos` (reach) |
| R6 | card-actions.js:175,177 | the care scene's rAF loop | until `_sceneOver` (feed ≤ 3200 ms) | `_sceneEnd` `cancelAnimationFrame` (`:255`), `_forget`, disconnect | **stays out** (4.2) | n/a | cc `care` |

(R6 is two lines, one site; the 87 count is by site, the ratchet counts lines.)

### 3.3 card-base.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R7 | card-base.js:138 | `_tick` interval | 700 ms | `clearInterval` `:182` | **stays out** (4.1) | n/a | all |
| R8 | card-base.js:256 | subscribe wait: the first look waits for the channel | `SUBSCRIBE_WAIT_MS` 3000 | `:298,301`, `_unsubscribe` | `_later(s, ..., { key: "sub.wait" })`; the flag read `!s.waitTimer` (`:255`) and the `s.waitTimer` read at `:264` become `_has(s, { key: "sub.wait" })` | high | `subscribe_silence.test.js`; cc `channel` |
| R9 | card-base.js:287 | subscribe retry | 2/5/15 s, then 60 s | `:347`, `_unsubscribe` | `_later(s, ..., { key: "sub.retry" })`; the reads of `s.retryTimer` (`:246`, `:264`) become `_has(s, { key: "sub.retry" })` | high | same |

### 3.4 card-build.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R10 | card-build.js:57 | the director's own `schedule` | per effect | `reset` | **stays out** (4.1): it is the injection point | n/a | `interaction_director.test.js`; cc `devicefx` |
| R11 | card-build.js:469 | power-on gag steps (`at`: blank blinks, low-battery lines, `_powerEnd`), lines 487-499 | up to 4200 ms | `timers` array in `s.power`; `_powerEnd` (`:508`) | `_later(s, ..., { group: "power" })`; `_powerEnd` stops the group | med | cc `lowbattery` |
| R12 | card-build.js:524 | boot-logo wait; a tap ends it sooner | `BOOT_WAIT_MS` 5000 | `clearTimeout(this._bootTimer)` `:533` | `_later(this._dirCard, ..., { key: "boot.wait" })`, no `undo`; `_bootEnd` stops the key. Card scope: never drained | med | cc `lowbattery`, prelude |
| R13 | card-build.js:563 | boot fill, then the screen cuts to the pet | `BOOT_FILL_MS` 600 | none | `_later(this._dirCard, ..., )`, **unkeyed**, no `undo`; it fires through a disconnect and clears `_booting`, as now | med | same |
| R14 | card-build.js:1023 | a world visitor leaves after a swipe away, unless the slide is back | `VISIT_SWIPE_GRACE_MS` 600 | none (guarded by `x.visitor === V`) | `_later(x, ...)`, **unkeyed** (two swipes away inside 600 ms end the visitor at the first + 600 today; a key would make it the second + 600) | med | cc `visitors` (reach) |

### 3.5 card-care.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R15 | card-care.js:122 | clean scene: remove `rock2` after the broom's shake-off | 1300 ms | none (B4) | `_hold(s, s.pet, [rock2], 1300, { group: "scene" })`, unkeyed; drained by `_sceneEnd` for a quiet or swipe end, before `entry.clear` | med | cc `care`, `pat` (reach) |
| R16 | card-care.js:169 | clean scene (murk): restore `transition` after `none` | 50 ms | none (B4) | `_later(s, 50, ..., { group: "scene.murk", undo: restore })`. **Not in group `scene`**: `entry.clear` makes it, after the drain would have run, and a drain after it would restore `transition` in the same frame (the murk would fade back instead of snapping); `detach` takes it | med | cc `care` (`murk`, 4 lines) |
| R17 | card-care.js:1004 | drape fall frame 2 | `DRAPE_FALL_MS` 450 / 3 | `_drapeStop` (`:970`, `_forget`, disconnect) | `_later(s, ..., { group: "drape" })` | med | `care_reactions.test.js`; no cc token |
| R18 | card-care.js:1005 | drape fall frame 3 | 300 ms | same | same | med | same |
| R19 | card-care.js:1006 | drape fall done (`drapeAnim = false`) | 450 ms | same | same | med | same |
| R20 | card-care.js:1017 | drape slide-out hide | 150 ms | same | same | med | same |

### 3.6 card-flair.js, card-games.js, card-journal.js, card-layout.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R21 | card-flair.js:35 | remove the trait flair box | `FLAIR_MS` 4200 | `clearTimeout(s.flairTimer)` `:34`, `_forget` (`card-build.js:856`) | `_later(s, ..., { key: "flair", undo: box.remove })` | low | cc `moments`, `winter`, `play` (reach) |
| R22 | card-games.js:310 | `_gameLater`: every delayed game step (8 callers: `:94,289,364,421,443,468,520,577`) | 300 ms to `GAME_END_MS` | `s.gameTimers`, `_endGame` (`card-flair.js:203-204`); guard `s.game === g` | `_gameLater` becomes `_later(s, ..., { group: "game" })`; `_endGame` stops the group | med | cc `play`, `resume`, `shellmode`; `hop_board.test.js` |
| R23 | card-games.js:330 | flip-clock digit swap | `FLIP_SWAP_MS` 80 | none (guard `dataset.n`) | `_later(s, ..., { group: "game" })` | low | cc `play`, `pat` (reach); bench `gnumFlip` |
| R24 | card-games.js:479 | the pet's game-end flavour line | `GAME_TYPE_MS` 4000 | none (guard `!s.game`) | `_later(s, ...)`, unkeyed | low | uncovered |
| R25 | card-journal.js:51 | hide the status feedback note | 3500 ms | `clearTimeout` `:50`, `_forget` (`card-build.js:858`) | `_later(s, ..., { key: "status.note", undo })` | low | cc `shelf`, `play`, `photos`, ... (reach) |
| R26 | card-layout.js:260 | `_mould` one frame after a layout | one frame | none | `frame(s, ...)` (G3) | low | `mould_pin.test.js`; cc `shelf` |
| R27 | card-layout.js:283 | swap the title and line when the new pet is half there | 250 ms | `clearTimeout(this._headTimer)` `card-base.js:183` (the only head cancel; `card-layout.js:433` is R52's `shellPendingTimer` clear in `_shellSettled`, see 7.1) | `_later(this._dirCard, ..., { key: "head" })`; the flag reads `!this._headTimer` (`card-layout.js:282,289`) become `this._has(this._dirCard, { key: "head" })`; `fn` clears `_headFor` as now | low | cc `shelf` (reach) |
| R28 | card-layout.js:785 | remove the status page's `wipe-*` classes | 170 / 220 ms | `clearTimeout(s.wipeTimer)` `:784`; an open cancels it | `_hold(s, s.status, [`wipe-${kind}`], ms, { key: "wipe", restart: true, remove: ["wipe-side", "wipe-down", "wipe-up"] })` (the code removes all three, reflows, adds one: `restart` with `opts.remove`; a re-arm keeps `wipe-up`, A1) | low | `motion_ship2.test.js`; cc `pat` (`wipe-`, 7) |

### 3.7 card-link.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R29 | card-link.js:89 | `at(ms, fn)`: all steps of the visit (11 calls, `:126-219`), each guarded by `this._link === L`. Two of them, `L.hideAt` and `L.endAt` (`:166-168`), are re-armed with a per-handle `clearTimeout` inside a queued line's `then` | up to ≈ 5.6 s (3.6 s calm) | `L.timers`, `_linkEnd` (`:303-305`), disconnect; `:166,167` the two handles | `_later(this._dirCard, ..., { group: "link" })`; `_linkEnd` stops the group. `L.hideAt` and `L.endAt` get keys `link.hide`, `link.end` and the `:166,167` clears become `_stop(this._dirCard, { key })`: a **handle** stop, named so the slice does not stop at the group | high | cc `infrared` (71 refs); `link_lines.test.js` |
| R30 | card-link.js:154 | guest frame swap (not under calm) | 700 ms interval | `L.swap`, `_linkEnd` (`:304`) | `every(..., { group: "link" })` | high | cc `infrared` |
| R31 | card-link.js:290 | head flap | 200 ms interval | `L.flap`, `_linkEnd` (`:305`) | `every(..., { group: "link" })` | high | same |
| R32 | card-link.js:291 | beam `gone` | `ms + 500` | `L.timers` | `_later` group `link` | high | same |
| R33 | card-link.js:292 | beam removed | `ms + 900` | `L.timers` | `_later` group `link` | high | same |

### 3.8 card-looks.js, card-memory.js, card-mode.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R34 | card-looks.js:97 | a new trick's move after the line | 600 ms | none | `_later(s, ...)`, unkeyed | low | cc `personality` (`_trickMove`) |
| R35 | card-looks.js:106 | the promise's payoff move | 600 ms | none | `_later(s, ...)`, unkeyed | low | `promise.test.js` |
| R36 | card-looks.js:329 | an ask's text step ends | `ASK_MS` 60000 | `step.timer`, `_askTextEnd` (`:375`), hidden tab | `_later(s, ..., { key: "ask.text" })` | med | cc `memorytags`, `moments`, `visitors` |
| R37 | card-looks.js:445 | the gift pop and its line end | `GIFT_LINE_MS` 5000 | `P.timer`, `_giftPopEnd` (`:455`), disconnect | `_later(s, ..., { key: "gift.pop" })` | med | cc `gifts`; `gift_lines.test.js` |
| R38 | card-memory.js:71 | the memory page closes after idle | 120000 ms | `:56,70`, `_memoryPageClose` (5 paths) | `_later(s, ..., { key: "memory.idle" })` | med | `memory_page.test.js` |
| R39 | card-memory.js:296 | redraw when the "sure?" confirm lapses | `CONFIRM_MS` 4000 | `clearTimeout` `:295` | `_later(s, ..., { key: "confirm" })` | low | `memory_page.test.js` |
| R40 | card-mode.js:98 | remove `swap` from the eight buttons | 90 ms | `clearTimeout` `:96` | `_hold`-like, key `mode.swap`, eight targets in one entry (`_later` + undo) | low | `shell_modes.test.js`, `cap_press.test.js`; cc `shellmode` |

### 3.9 card-moment.js, card-season.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R41 | card-moment.js:81 | show the new trait's flair after the sparkle | 700 ms | none | `_later(s, ...)`, unkeyed | low | cc `moments` (reach) |
| R42 | card-moment.js:587 | remove a clean's bubble pop | 1300 ms | none (the returned `timer` is read by no caller, `:601`) | `_later(s, ..., { group: "fx", undo: img.remove })` | low | uncovered |
| R43 | card-moment.js:660 | remove `breezy` from the screen | 2600 ms | `clearTimeout` `:659`, `_forget` (`card-build.js:852`) | `_hold(s, s.screen, [breezy], 2600, { key: "breezy" })` | low | cc `sharedscreen`, `ghost` (reach); `care_reactions.test.js` |
| R44 | card-moment.js:690 | the smug second rock | 1300 ms | none (guard `!s.scene && !s.asleep && !owned`) | `_later(s, ...)`, unkeyed | low | uncovered |
| R45 | card-season.js:126 | the treat, after the costume | 1600 ms | none | `_later(s, ..., { group: "season" })` | med | cc `winter`, `moments` (reach) |
| R46 | card-season.js:198 | remove the confetti box | 3600 ms | none | `_later(s, ..., { group: "season", undo: box.remove })` | low | cc `winter` (reach) |
| R47 | card-season.js:307 | remove the costume box (`flair costume`) | `FLAIR_MS + 1800` ≈ 6000 | none (the next `.flair` removal sweeps it) | same (Q3: the length stays) | low | cc `winter` (reach) |
| R48 | card-season.js:339 | each flyer of a flock, by its lag | `lag * 450` | none | `_later(s, ..., { group: "season" })` | low | cc `winter` |
| R49 | card-season.js:355 | remove a flyer | `ms + 200` | none | `_later(s, ..., { group: "season", undo: el.remove })` | low | cc `winter` |
| R50 | card-season.js:372 | the seasonal visit's steps (`at`: 1400, 3400, `ms`) | up to the flyer's `ms` | `V.timers`, `_seasonVisitEnd` (`:399`) | `_later(s, ..., { group: "season.visit" })`; the end stops the group | med | cc `winter` (3) |

### 3.10 card-sheets.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R51 | card-sheets.js:141 | the shell pick's 10 s race timeout (rejects) | 10000 ms | `.finally(clearTimeout)` `:143` | **stays out** (4.5): a promise's lifetime | n/a | cc `shell` |
| R52 | card-sheets.js:147 | clear `shellPending` and redraw | 5000 ms | `clearTimeout` `:146` | **stays out** (4.5; optional 13b, Q7) | n/a | cc `shell` |
| R53 | card-sheets.js:306 | the lay wait, still reloading | 5000 ms | `_layDrop` (`:317`) | **stays out** (4.5; optional 13b, Q7) | n/a | cc `egg`, `types` (lay sheet) |
| R54 | card-sheets.js:311 | the lay wait starts | `NAME_WAIT_MS` 30000 | same | **stays out** (same) | n/a | same |
| R55 | card-sheets.js:460 | the rename's one retry delay (a promise) | `NAME_RETRY_MS` 2000 | `_clearNameTimers` (`:373`) | **stays out** (4.5): a promise's lifetime | n/a | cc `egg` (name sheet) |
| R56 | card-sheets.js:492 | redraw when the "sure?" confirm lapses | `CONFIRM_MS` + 50 | `clearTimeout` `:491`, `_forget` (`card-build.js:805`) | `_later(s, ..., { key: "confirm" })` (same key as R39: one confirm at a time, as now) | low | cc `forget`; `memory_page.test.js` |

### 3.11 card-tick.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R57 | card-tick.js:99 | ghost frame fade (WAAPI) | 180 ms | none (finishes) | `adopt` (G4) | med | cc `ghost` |
| R58 | card-tick.js:112 | ghost trail (WAAPI) | `turn + move + 300` | `getAnimations().forEach(cancel)` `:105` | `adopt` (G4) | med | cc `ghost` |
| R59 | card-tick.js:123 | remove `lit` from the screen | `BACKLIGHT_MS` 3000 | `clearTimeout` `:120`, `_forget` (`card-build.js:854`) | `_hold(s, s.screen, [lit], 3000, { key: "lit" })` | low | cc `backlight` |
| R60 | card-tick.js:178 | `_look`: remove `look` | `ms` (200 ms to a few s) | none | `_hold(s, s.pet, [look], ms)`, **unkeyed** (5.3); the class is added without reflow, so `restart` is false | med | cc `react`, `pat`, `visitors`, `infrared` (reach); `touch.test.js` |
| R61 | card-tick.js:189 | `_wander`: remove the side class and `look` | `ms` | none | `_hold(s, s.pet, side === "wander-l" ? [side, "look"] : [side], ms, { remove: [side, "look"] })`, unkeyed (a right wander adds no `look` today and still removes it; the adds stay where they are) | med | cc `ghost`, `pat`; `touch.test.js` |
| R62 | card-tick.js:203 | `_swapFlip`: `put` the new art | `TURN_MS / 2` 100 | none (B1, B3) | `_later(s, ..., { group: "swapflip" })` | med | cc `pat` (`turn`); `motion_ship2.test.js` |
| R63 | card-tick.js:204 | `_swapFlip`: remove `turn` | `TURN_MS` 200 | none (B3) | `_hold(s, s.pet, [turn], 200, { key: "turn" })`: a second flip replaces it silently (the one intended change, B3) | med | same |
| R64 | card-tick.js:210 | `_afterTurn`: run `fn` when the flip is done | the flip's remainder | none | `_later(s, ..., { group: "swapflip" })` | med | cc `moments`, `egg` (reach) |
| R65 | card-tick.js:348 | perk2: the second perk | 420 ms | none | `_later(s, ...)`, unkeyed | low | cc `personality` |
| R66 | card-tick.js:411 | a song promise's second chirp | 500 ms | none | `_later(s, ...)`, unkeyed | low | uncovered |
| R67 | card-tick.js:507 | the idle speck: the pet follows it | 0 / 1200 ms | none | `_later(s, ..., { group: "speck" })` | low | cc `prelude`, `play`, `types` (token `speck`) |
| R68 | card-tick.js:508 | remove the speck | 2700 ms | none | `_later(s, ..., { group: "speck", undo: speck.remove })` | low | same |
| R69 | card-tick.js:593 | the typing interval | 40 ms | `_stopTyping` `:642` | **stays out** (4.3) | n/a | cc many |
| R70 | card-tick.js:708 | a yawn turns excited (a hop) | 900 ms | none (guards `s.poseFrames`, `s.poseUntil`) | `_later(s, ...)`, unkeyed | med | `excited_pose.test.js` |
| R71 | card-tick.js:727 | `_poseEnd`: put the mood frames back | to `poseUntil + 30` | none (guard `s.poseUntil !== until`) | `_later(s, ...)`, **unkeyed**: the guard stays and makes the older timer a no-op, so no key is needed and none changes the timing | med | cc `react` (37), `types`, `visitors`; `excited_pose.test.js`, `care_reactions.test.js` |
| R72 | card-tick.js:749 | `_propShow`: add `prop-out` | `ms - 300` | `clearTimeout` `:741` | `_later(s, ..., { key: "prop.out" })` | med | `care_reactions.test.js`; no cc token |
| R73 | card-tick.js:771 | head shake: the second flip | 550 ms | none (guard on `s.poseUntil`) | `_later(s, ...)`, unkeyed | low | cc `react` (reach) |
| R74 | card-tick.js:992 | pat lean: let go after the hold | `holdMs` | `clearTimeout` `:986,999`; **not `_forget`** (B1) | `_later(s, ..., { key: "lean", undo: leanOff })`; `leanOff` removes every `lean-*` class directly (A3: `_patLeanOff` would start a timer inside a drain); `_patLeanOff` keeps its `stop` at `:999` | med | `touch.test.js`; cc `pat`, `care` |
| R75 | card-tick.js:1005 | pat lean release: drop `lean-rel`, `lean-sick` | 300 / 450 ms | `clearTimeout` `:987,1002`; **not `_forget`** (B1) | `_hold`-like, key `lean.rel`, `undo` the same direct removal | med | same |

### 3.12 card-visit.js, card-visitors.js

| ID | file:line | Effect | Duration | Cancel today | Target | Risk | Reach |
|---|---|---|---|---|---|---|---|
| R76 | card-visit.js:415 | a question's end | `ASK_MS` 60000 | `clearTimeout` `:408,414`, `_clearAsk` | `_later(s, ..., { key: "ask" })` | med | cc `memorytags`, `moments`, `visitors` |
| R77 | card-visit.js:477 | a question's end (the second path) | `ASK_MS` | same | same | med | same |
| R78 | card-visit.js:512 | the answer's one resend | `ANSWER_RETRY_MS` 3000 | none, on purpose | **stays out** (4.4) | n/a | cc `memorytags`, `moments` |
| R79 | card-visit.js:546 | remove the hearts box | 2800 ms | none | `_later(s, ..., { group: "fx", undo: box.remove })` | low | cc `play`, `react`, `infrared` (token `hearts`) |
| R80 | card-visit.js:571 | `_animate`: remove the class | `ms` per call (85 callers) | the module `WeakMap` `ANIMATE_TIMERS`, `clearTimeout` `:570` | `_hold(s, el, [cls], ms, { key: cls, target: el, restart: true, mirror })`; the map goes | med-high | `motion_ship1/2.test.js`, `care_reactions.test.js`, `touch.test.js`, `sitter_life.test.js`; cc `pat`, `react`, `care` |
| R81 | card-visit.js:623 | remove the house fx class (heat, cool, suds, tumble, chime) | 2500 ms | `clearTimeout` `:622` only a re-trigger; not `_forget` (B1) | `_hold(s, s.screen, [cls], 2500, { key: "housefx" })` | low | cc `moments`, `channel`, `devicefx` (11 refs) |
| R82 | card-visit.js:632 | remove `fx-robot` | 6000 ms | `clearTimeout` `:631`; not `_forget` (B1) | `_hold(s, s.screen, [fx-robot], 6000, { key: "robot" })` (Q3) | low | cc `moments` (2) |
| R83 | card-visit.js:731 | the glass mark's backstop | `showMs + fadeMs + 500` | `_markEnd` (`:754`), `_forget` | `_later(s, ..., { key: "mark" })`; the adapter keeps its `animationend`. Moves in **slice 2 only** | low | cc `devicefx`; `rare_glass.test.js` |
| R84 | card-visit.js:791 | remove the sparkle ring | 600 ms | none | `_later(s, ..., { group: "fx", undo: ring.remove })` | low | uncovered |
| R85 | card-visitors.js:196 | the world visitor's steps (`at`, 8 calls `:203-222`) | up to `total` | `V.timers`, `_visitorEnd` (`:321`) | `_later(s, ..., { group: "visitor" })`; `_visitorEnd` stops the group | med | cc `visitors` (20) |
| R86 | card-visitors.js:429 | the basket reveal's steps (`at`: one per find, then `total`) | `FIND_STEP_MS` 2500 per find | `R.timers`, `_revealEnd` (`:487`) | `_later(s, ..., { group: "reveal" })` | med | cc `finds`; `find_lines.test.js` |
| R87 | card-visitors.js:455 | remove a new find's ring | 600 ms | none | `_later(s, ..., { group: "reveal", undo: ring.remove })` | low | uncovered |

Two rows are shared lines that look like several sites: R29 (11 `at` calls through one `setTimeout`),
R85 (8) and R22 (8 callers of one helper). The grep rule counts lines.

### 3.13 Things that are not timers but are read like them

Not migrated, and not in the rule: `animationend` listeners (`card-build.js:216,221,226`; they `release()`
the leased effect, with the director's own watchdog behind them) and `transitionend` on the track
(`:74`, a layout snap). `Date.now()` state fields that the tick reads as clocks: `poseUntil`, `patPoseUntil`,
`movingUntil`, `turnUntil`, `ghostUntil`, `flairUntil`, `visitUntil`, `propUntil`, `markUntil`,
`nextVisitCheck`, `sayUntil`, `stretched`. They schedule nothing; the tick polls them. The same goes
for the tick's own temporary state: the prop hide (`card-tick.js:33`, `s.propUntil` checked in `_tick`).
Section 4.8.

### 3.14 Lifecycle: forget and disconnect, row by row (review F14, A2)

Decided here, not by the implementer. **Forget** is what `detach` does at `_forget` (a slide reused for
another pet): **end** (the entry has an `undo` that reaches the end state: a class or node removal, a
flag), **drop** (nothing owed: stopped silently), **closer** (a function `_forget` already calls stops
it, and it stays stopped by that call), or **n/a** (not in the slide's scope: it fires). **Disconnect** is
**keep** (the entry fires on its time, as the bare timer does; `reset()` does not drain) or the **closer**
that `disconnectedCallback` already calls today. The rule for end or drop: *the timer's job is to take
something off (a class, a node, a flag) = end; its job is to start something = drop.*
**A "drop" row's `fn` must not be the only thing that clears a `BUSY_OWNERS` flag or any other field a
live slide reads** (`s.visitor`, `s.seasonVisit`, `s.reveal`, `s.asking`, ...): `detach` stops the `fn`
silently, so the field would stick on the slide's next pet (review s2978 fix 1). Such a row is a
**closer**: `_forget` calls the function that clears the field, before `detach`. A trace in the slice
checks the field after a forget mid-flight.

| Rows | Forget | Disconnect |
|---|---|---|
| R1-R3, R5 button chrome (card scope) | n/a (fires on the button) | keep |
| R4 perk, R60 look, R61 wander, R21 flair box, R25 status note, R28 wipe, R40 mode swap, R43 breezy, R59 lit, R81 house fx, R82 robot, R63 turn | end (remove the class or hide) | keep |
| R42 bubble pop, R46 confetti, R47 costume box, R49 flyer, R68 speck, R79 hearts, R84 sparkle, R87 find ring | end (remove the node) | keep |
| R15 rock2 (group `scene`) | end | the scene's quiet end drains `scene` (closer `_sceneEnd`, G9) |
| R16 murk restore (group `scene.murk`) | end (`detach`) | **keep**: `entry.clear` makes it inside the draining `_sceneEnd`, so it is not in the drained group; it fires at +50 ms (G9) |
| R74, R75 pat lean | end: one `undo` removes every `lean-*` class directly (A3) | keep |
| R57, R58 ghost frames (`adopt`) | end (`cancel` the animation) | keep |
| R62 art put, R64 after-turn, R34/R35 moves, R41 moment flair, R44 smug rock, R45 treat, R48 flock start, R65 perk2, R66 chirp, R67 speck start, R70 yawn, R71 pose end, R72 prop out, R73 shake, R24 flavour line, R23 digit swap, R14 swipe grace | drop | keep |
| R22 game steps | closer `_endGame` (group `game`) | closer `_endGame` |
| R11 power gag steps | closer `_powerEnd` | closer `_powerEnd` |
| R17-R20 drape | closer `_drapeStop` (it runs before `detach` at `card-build.js:795` and already sets `drapeAnim = false`, `card-care.js:969-973`; R19's `undo` never runs at a forget) | closer `_drapeStop` |
| R36 ask text step | drop: `_clearAsk` (`card-build.js:960-964`) does not touch `s.textStep`; the tick ends it within 700 ms (`card-tick.js:39-41`, on any slide: the step is for a slide that is not on show, or past its `until`) | keep |
| R76-R77 ask end | closer `_clearAsk` (drops `s.queue`) | keep: the question stays up through a re-attach and `done` clears `s.asking` at 60 s |
| R37 gift pop | closer `_giftPopEnd` | closer `_giftPopEnd` |
| R12-R13 boot (card scope) | n/a | keep: the fill timer clears `_booting` |
| R29-R33 link (card scope) | n/a | closer `_linkEnd` |
| R50 season visit | **closer `_seasonVisitEnd(s)`**, called by `_forget` before `detach` (slice 6): it clears `s.seasonVisit` and takes the flyer away; a "drop" would leave `s.seasonVisit` set (harmless, `_visitorTick:117` tidies it, but cleaner as a closer) | keep |
| R85 visitor steps | **closer `_visitorEnd(s)`**, called by `_forget` before `detach` (slice 11): it is the only code that sets `s.visitor = null`, and today the visitor's own last step (`card-visitors.js:222`) or the swipe grace (`card-build.js:1023-1025`) does it within `total`. A "drop" would leave `s.visitor` set: a busy owner (`BUSY_OWNERS`, `interaction-director.js:62`) that blocks `_free` (`card-tick.js:138`), idle life (`:448`) and the next visitor (`card-visitors.js:99`), and the old visitor's art stays over the new pet | keep |
| R14 swipe grace | **closer `_visitorEnd(s)`** (the same call; the grace's guard `x.visitor === V` is moot once `s.visitor` is null; its entry is then dropped by `detach`) | keep |
| R86 reveal steps | closer `_revealEnd` (`card-build.js:842` already calls it) | **keep**: `disconnectedCallback` calls `_dropFinds`, which never touches `s.reveal` (G9); `_dropFinds` is not a closer for group `reveal` |
| R8, R9 subscribe wait and retry | closer `_unsubscribe` | closer `_unsubscribe` (then `connectedCallback` subscribes again) |
| R38 memory idle | closer `_memoryPageClose` | closer `_memoryPageClose` |
| R39, R56 "sure?" lapse | drop (`_forget` clears `confirmTimer` today) | keep |
| R83 mark backstop | closer `_markEnd(s, true)` | keep |
| R27 head swap (card scope) | n/a | closer: `disconnectedCallback`'s own head clear becomes `_stop(this._dirCard, { key: "head" })` |
| R26 mould frame | drop | keep |

Rows R51-R55 (allowlisted) keep their bare timers and today's closers (`_shellSettled`, `_layDrop`,
`_clearNameTimers`). A re-attach trace (G9) pins first the rows whose "keep" matters most (ask, boot, the
shell race, the rename retry, the lay wait, the subscribe retries).


## 4. What stays out, and why

The owner wants "all". These sites stay out of the ledger (the final allowlist), each with its reason, and
each with the nearest thing the migration can still do for it. Everything else in the card moves.

1. **R7 `_tick` interval and R10 the director's injection point (`schedule`, `repeat`, `frame` in
   `card-build.js`).** They are the clock and the plumbing; the ledger is built on them. The rule's
   allowlist names the lines; `repeat` and `frame` are new lines in the same call (wrappers: N5).
2. **R6 the care scene's rAF loop (`card-actions.js:175,177`).** A pure function of `t` per frame, owned by
   `_sceneStart/_sceneEnd` and `s.scene`, which the director already reads as a busy owner. Moving the frame
   loop through `frame()` gains nothing (the loop is already cancelled by `_sceneEnd` on every path:
   forget, disconnect, swipe) and risks the scene's 60 fps timing. What moves is everything the scene
   leaves behind: R15, R16, R17-R20, R42 (slice 9). Q4.
3. **R69 the typing interval (`card-tick.js:593`).** The `text` track belongs to the card by design
   (`device-alive` 5.1: "the director reads them as busy and never cancels them"). It is wall-clock driven
   (a tab held back catches up from `Date.now()`), is stopped by `_stopTyping` on hidden, forget and
   disconnect, and has no class or element to undo. Q4.
4. **R78 the answer resend (`card-visit.js:512`).** A delivery retry of something the player typed or
   tapped. Draining it on `_forget` or disconnect would **lose an answer** (the pet said it would
   remember): a regression, not a fix. It must outlive the slide and the card. Q4.
5. **R51-R55 the sheets' call waits (`card-sheets.js:141,147,306,311,460`)** (review F8, Q7). R51 (the
   shell pick's race timeout) and R55 (the rename's retry delay) are a **call's lifetime**: each is a
   promise that must settle (reject or resolve) whatever happens to the slide or the card, and a drain
   leaves it unsettled (`set_shell` hung, `nameBusy` stuck). That is the argument that keeps R78 out.
   R52-R54 (`shellPending`, the lay wait) share the flow and the closers (`_shellSettled`, `_layDrop`,
   `_clearNameTimers`, which `_forget` calls) and have no promise; under the keep policy they could move
   without harm, but they stay with their neighbours, and Q7 asks whether to move them as an optional
   late slice 13b. Their `clearTimeout` lines (`card-sheets.js:143,146,317,373`) stay with them.
6. **CSS `infinite` animations** (the 45-odd rules the audit listed: breathe, hop, dance, shiver, rainfall,
   lightning, leaf, ripple, ...). They are not timers; each is gated by a class that **something removes**.
   The plan moves the thing that removes the class (the rows above), not the CSS. The reduced-motion kill
   (`style.js:37-40`) and `tests/js/motion_rule.test.js` stay the guard.
7. **WebAudio** (`prefs.js:209-280,470`): scheduled on the AudioContext's own clock, parked on hidden
   (`audioPark`) and released on disconnect (`audioLeave`); no timer exists to own. `stopBabble` stays.
8. **State clocks and tick-polled temporary state** (3.13): `poseUntil`, `sayUntil`, `propUntil`, ... and
   the prop hide at `card-tick.js:33` (`s.propUntil && Date.now() > s.propUntil` in `_tick`) are checked by
   the tick, not scheduled. They are temporary state (and the prop hide is a temporary class), but they
   are not handles: the tick owns them, as it owns the typing. Review N10.

Plus one **dead line deleted**: `card-flair.js:195` `cancelAnimationFrame(s.game?.cur?.raf)`. No game rAF
exists (the only `requestAnimationFrame` calls are `card-actions.js:175,177` and `card-layout.js:260`),
so it cancels `undefined`. Slice 10 deletes it so slice 14's rule holds.

So the final allowlist is **R7, R10, R6, R69, R78 and R51-R55** (ten rows;
their lines are in 7.1), not five.

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
| 7 | The `_animate` helper | R80 | **high** (85 callers; as risky as 12) | B1 |
| 8 | Boot and power-on | R11-R13 | med | none |
| 9 | Care scene stragglers and the drape | R15-R20 | med-high | **B4** |
| 10 | Games | R22-R24 | med | B1 |
| 11 | Visitors, reveal, swipe grace | R14, R85-R87 | med-high | B1 |
| 12 | The infrared link | R29-R33 | high | B1 |
| 13 | Channel waits, memory page, confirm | R8, R9, R38, R39, R56 | high | none |
| 14 | Close-out: final allowlist, `_forget` becomes one drain, docs | none (deletes dead fields) | low | B1 (global test) |
| X1 | Hidden policy: flip the listed entries to `tab`. **After 2, 3, 6 and 11** | policy only | low-med | **B2** |

Slice 14's `forget_drain.test.js` is the global proof of B1. X1 is outside the numbered ladder because it
is the only slice that changes what the player can see (a stale effect no longer shows on return) and it
rests on Q2. **X1 flips entries that slices 2, 3, 6 and 11 create** (flair, house fx, robot, hearts,
sparkle, bubble pop, speck, season boxes and flyers, the find ring), so it ships after them; the other
slices do not depend on it, and slice 14 does not wait for it.

Every slice's **Checks** end with `scripts/ci-gate` on its branch (section 2, AGENTS.md); each slice
section below names the *extra* things, including the **bench and card-check edits** (F1) and the
**existing tests it edits** (F2) that the first draft left out. Slices 3, 4, 7 and 9 also require a
**bench before/after contact sheet** (6.7). Each slice has a "no slide" line where a moved method can run
without one (G8), and a disconnect trace (D-keep and D-reattach, G9).

### 5.0 Slice 0: the API, adapters, harness and ratchet (no caller moves)

- **Moves:** nothing. Adds `later`, `every`, `frame`, `adopt`, `stop`, `drain`, `has`, `drainAll`,
  `hidden(why)`, `pending`, the `inspect().timers` field to `interaction-director.js`; `_later`, `_hold`,
  `_waapi`, `_stop`, `_drain`, `_has` to `card-base.js`; `this._dirCard` and the `repeat`/`frame` wrappers
  in `card-build.js`; `_dirPause(why)` calling `hidden(why)` (`"tab"` from `card-base.js:116`,
  `"offscreen"` from the observer at `card-build.js:141`); a row in AGENTS.md's table for the ledger.
- **Characterization:** none needed (nothing moves). The new behaviour is tested by L1-L20 (1.5) and the
  adapter tests.
- **The harness:** `tests/js/timer_trace.js` (helper) and `tests/js/timer_trace.test.js`. A `vm` sandbox
  as in `sitter_life.test.js`: the card's own methods from `card-source.js`, a **fake clock** (`setTimeout`,
  `clearTimeout`, `Date.now`, `performance.now`, all driven by `advance(ms)`, equal-delay timers in
  creation order), a tiny DOM (an element with a `classList`, `style`, `remove()`, `offsetWidth`,
  `append`, `getAnimations`, `addEventListener` for the stub animation's `finish`), the real
  `HATCH_DIRECTOR` built with the fake `schedule`, `repeat` and `frame`, and `calm()` switchable. **The
  harness always loads the slice-0 adapters and a real director into the sandbox**, before and after a
  move, so a new trace test never needs the move to exist (F2). `trace(site, { calm, noSlide })`
  also runs the "called with no slide" case (G8), and `disconnect()`/`reconnect()` drive D-keep and
  D-reattach (G9): they run `disconnectedCallback`'s body over the sandbox and `connectedCallback`'s. `trace(site, { calm })` runs a site, advances in 10 ms steps to the site's longest delay plus
  500 ms and returns the ordered list `[ { t, el, op, arg } ]` (`class+ pet.perk`, `class- pet.perk`,
  `remove speck`, `call _look`, ...). Tests assert the list. **The same sandbox runs before and after the
  move**: before, the code uses bare timers (the sandbox's fake); after, it goes through the ledger over the
  same fake clock. A trace that differs by one `t` fails.
- **The ratchet:** `tests/js/timer_rule.test.js`. It strips comments from each `src/card/*.js` and counts
  the **bare identifiers** `\bsetTimeout\b`, `\bsetInterval\b`, `\brequestAnimationFrame\b`,
  `\bclearTimeout\b`, `\bclearInterval\b`, `\bcancelAnimationFrame\b` and the member `.animate(`, per file,
  against a table pinned to `531cd101`'s counts (Appendix B). Counting the bare word, not the call,
  catches `forEach(clearTimeout)` (seven value uses: `card-build.js:508`, `card-care.js:970`,
  `card-flair.js:203`, `card-link.js:303`, `card-season.js:399`, `card-visitors.js:321,487`) and an alias
  (`const t = setTimeout`). `getAnimations()` reads (`card-tick.js:96,105`) are not counted (they start
  nothing; Appendix A lists them apart). **It fails when a count differs in either direction**: a new bare
  timer fails at once, and a slice that removes one must lower the number in the same commit. Slice 14
  replaces the table with the allowlist (7.1) and adds the field rule (`\w+Timers?\s*=`).
- **Checks:** `node --test tests/js/*.test.js`; `node scripts/build-card.js`; `scripts/ci-gate` (the
  diff touches `card-base.js` and `card-build.js`; `gate --auto` is for iterating).
- **Device queue:** none (nothing to see).
- **Timings:** none changed. **Rollback:** revert the commit.

### 5.1 Slice 1: chrome

- **Moves:** R1-R5 (`_tapped`, `_perk`, the failed class), R25 (status note), R26 (`_mould` frame), R27
  (head swap), R28 (wipe), R40 (mode swap). Keys as in section 3. `_forget`'s `clearTimeout(s.statusMessageTimer)`
  stays until slice 14.
- **Scope (A4):** R1-R3 and R5 take `this._dirCard` with the button as the `target` (`_tapped(button)` is
  called without a slide at 54 of 67 sites); R4 `_perk` keeps its `!s?.pet` guard before the `_hold`; R25,
  R28, R40 take the slide; R27 and R26 are as in section 3. The trace has a case "`_tapped(button)` with no
  slide": the classes and the ring come and go at 160, 400, 500, `_perk` does nothing, no throw.
- **Characterization first:** `chrome_trace.test.js`: a tap adds `tap-feedback tapped pressed`, `pressed`
  goes at 160, `tapped` at 400, `burst` ring at 500 on a toy; `_perk` removes at 320; a double tap at 100 ms:
  the first tap's timer removes `pressed` at 160 and the second's at 260 is a no-op (**this pins the
  quirk**; to keep it, R1/R2 use no key, so two taps give two timers); `_wipe("side")` then `_wipe("up")`:
  one removal at 170 from the second call, and **`wipe-up` is still on at 100 ms after a `side` then `up`
  pair** (A1: the re-arm keeps the class); the status note hides at 3500 and a second call restarts it
  with the note still shown (A1); `_modeSwap` removes at 90, none under calm; the head swap fires once at
  250 and `_has` is true until then. Reach today: `cap_press.test.js`, `shell_modes.test.js`,
  `motion_ship2.test.js`, cc `pat`, `shellmode`.
- **Edits outside `src`:** `dev/bench/page.js:1228` (`clearTimeout(cur.wipeTimer)` becomes
  `cur._director.stop(cur, { key: "wipe" })`) and `:1393` (`clearTimeout(cur.swapTimer)` becomes
  `stop(cur, { key: "mode.swap" })`); `scripts/card-check.js:1640,1658` (`clearTimeout(s.statusMessageTimer)`
  becomes `stop(s, { key: "status.note" })` through `page.evaluate`); `tests/js/cap_press.test.js:62`
  (a regex that pins `setTimeout(() => button.classList.remove("failed"), 400)`: rewritten to pin the
  `_hold` form and the 400); `tests/js/motion_ship2.test.js` (the wipe 170/220 cases extract `_wipe` and
  stub `setTimeout`: they gain the adapter stubs). `_forget`'s own `clearTimeout(s.statusMessageTimer)`
  stays until slice 14 (a no-op on the deleted field).
- **Checks:** the trace tests; `cap_press.test.js`, `motion_rule.test.js`, `motion_ship2.test.js`;
  `scripts/ci-gate` on the branch (iterate with `gate --auto`: `pat`, `shellmode`, `care` and the sections
  that name `_tapped`).
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
  `_markEnd` cancels it. Under calm: `_bubblePop` and hearts are not made. **A1 cases (the re-arm keeps the
  class):** a backlight re-tap at 1000 ms keeps `lit` until 4000; `_houseFx` with the same class twice
  keeps it until the second + 2500; a second `breezy` keeps the class to its own end; a second flair
  replaces the box and the first timer never removes the new box. **D-keep:** disconnect at 500 ms, advance
  10 s: every class and box is gone at its time, as before.
- **Edits outside `src`:** `scripts/card-check.js:10621` plants `s.breezeTimer = setTimeout(...)` as a
  `_forget` probe: it plants `_later(s, 60000, () => {}, { key: "breezy" })` and checks `has` is false
  after `_forget`; `tests/js/rare_glass.test.js:355` requires the text `s.markTimer` in `_markEnd`'s body:
  it requires the `_stop(s, { key: "mark" })` form; `tests/js/care_reactions.test.js` (breezy via
  `_react`) gains the adapter stubs.
- **Checks:** trace tests; `device_fx_room.test.js` (house fx and robot are named there), `care_reactions.test.js`;
  `scripts/ci-gate` (iterate with `gate --auto`: `moments`, `devicefx`, `backlight`, `sharedscreen`, `winter`).
- **Device queue:** fixture: dev pet with the house signals (heating, cooling, robot, tumble dryer) from
  `scripts/dev-seed`. `qa_screen`: the pet screen. Look at: the heat shimmer, the cool wisps, the robot
  crossing (still 6 s), a trait flair box on a new trait, the backlight tap (3 s), the fan's breeze, a bond
  hearts burst. Swipe to the next pet mid-effect: nothing of it on the next pet.
- **Timings:** identical. B1 (house fx, robot) fixed. **Rollback:** revert.

### 5.3 Slice 3: pet body one-shots in `_tick`

- **Moves:** R60 `_look`, R61 `_wander`, R62-R63 `_swapFlip`, R64 `_afterTurn`, R65 perk2, R66 chirp, R67-R68
  speck, R70 yawn, R73 shake. The class adds stay where they are. Only R63 (`turn`) has a key; the
  rest are unkeyed (section 2).
- **Characterization first:** `pet_oneshots_trace.test.js`: `_look(s, 600)` adds `look` at 0, removes at 600;
  `_wander(s, 2000)` with a pinned side adds the side (and `look` when left), removes both at 2000; a
  second `_look(s, 600)` at 300 ms does **not** extend the first (the first timer removes the class at 600;
  the second's at 900 is a no-op). A key would make the second replace the first and keep the class to 900,
  a timing change, so `_look` and `_wander` use **no key** (two entries) and only gain the drain. `_swapFlip`: `put` at 100, `turn` removed at 200; **B3 case:** two flips 100 ms apart:
  before, `turn` is removed at 200 by the first, cutting the second short; after, it is removed at 300
  (keyed, the first removal replaced **silently**, so the class the second flip added stays to its own
  end: A1). This is the one intended change and the trace test carries both traces: the "before" trace
  marked `B3` in the test and replaced in the same commit as the fix. **Forget** mid-flip: `turn` is
  removed at once and the `put` is dropped (the next pet's art is not swapped). `_afterTurn` runs now or at the
  remainder; the speck is removed at 2700 and the pet looks at 0 or 1200; yawn: excited frames and a
  `greethop` at 900 only if the pose is still the yawn; shake: second flip at 550 only if the pose is
  unchanged. Every one of these also under `calm()`.
- **Edits outside `src`:** `tests/js/motion_ship2.test.js:28-118` (the `_swapFlip` case pins timers
  `[100, 200]` through a stubbed `setTimeout`; the flip-clock case at `:110-118` is slice 10), `motion_ship1.test.js:25`
  (`_wander` pins `timers[0][1] === 2200`), `care_reactions.test.js:121` (the shake's 550 ms timer),
  `touch.test.js:101` (`_look`/`_wander` with `setTimeout: () => 0`): each gains the adapter stubs and
  reads the entry from the ledger (`inspect().timers`) where it read a stubbed `setTimeout` call.
- **Checks:** trace tests; `motion_rule.test.js`, `touch.test.js`, `excited_pose.test.js`,
  `nature_lines.test.js` (speck); `scripts/ci-gate` (iterate with `gate --auto`: `pat`, `react`, `ghost`,
  `types`, `moments`, `egg`); **a bench before/after contact sheet** (`--preset species`, 6.7).
- **Device queue:** fixture: bench `--preset species` (`petAt` pauses mid look) and a dev pet that changes
  stage (`scripts/dev-seed` stage-up). `qa_screen`: the pet screen. Look at: an idle glance and a wander
  (left turns first), a stage-up (the paper flip, then the born pop), a trick on a new day, a head shake
  on a refusal, a speck crossing.
- **Timings:** identical except B3 (named above). **Rollback:** revert.

### 5.4 Slice 4: pose, props, lean, ghost

- **Moves:** R57-R58 (ghost, `adopt`, completing on `finish`/`cancel`: F5), R71 `_poseEnd` (unkeyed),
  R72 `_propShow` out, R74-R75 the pat lean. **The lean's undo is direct** (A3): it removes `lean-l`,
  `lean-r`, `lean-rel` and `lean-sick` itself and starts no timer; `_patLeanOff` (the natural release,
  which makes the `lean-rel` timer) is not the undo. `s.leanTimer`'s reads become `_has`/`_stop`.
- **Characterization first:** `pose_lean_trace.test.js`: `_poseEnd` restores frames at `poseUntil + 30` and
  not if a newer pose owns the end (both traces); the prop gets `prop-out` at `ms - 300` unless calm or
  re-shown (a second `_propShow` at 200 ms cancels the first, as `clearTimeout(s.propOutTimer)` does);
  the lean: add `lean-l`, release at `holdMs` (add `lean-rel`, drop `lean-l`), `lean-rel` and `lean-sick`
  gone at 300 / 450; a new pat inside the hold clears both (as now); **`_forget` mid-lean: before, the
  release timer strips `lean-*` from the next pet at its due time; after, the drain does it at once (B1),
  `pending(s) === 0` straight after, and no `lean-rel` is left on the next pet at 10 s (A3)**; `_forget`
  mid-release (the `lean-rel` entry pending): the same.
  Ghost: a frame swap while `getAnimations()` is non-empty does nothing; a trail cancels the earlier
  animations (the WAAPI object is a stub that records `cancel`).
- **Edits outside `src`:** `dev/bench/page.js:1312` (`clearTimeout(cur.leanTimer)` becomes
  `stop(cur, { key: "lean" })`); `tests/js/care_reactions.test.js:161` (pose end: `log.timers.some(ms 2400-2600)`),
  `touch.test.js`, `excited_pose.test.js` gain the adapter stubs. The ghost frame's stub animation needs
  `addEventListener`.
- **Checks:** trace tests; `touch.test.js`, `care_reactions.test.js`, `excited_pose.test.js`; `scripts/ci-gate`
  (iterate with `gate --auto`: `pat`, `react`, `ghost`, `care`); **a bench before/after contact sheet** (6.7).
- **Device queue:** fixture: dev pet teen and adult, awake. `qa_screen`: the pet screen. Look at: pat the
  left and the right of the head (the lean in and out), pat a sick pet (slower), a food reaction (the prop
  falls, then slides out), a wander (the faint ghost trail).
- **Timings:** identical; B1 for the lean. **Rollback:** revert.

### 5.5 Slice 5: looks, gift, ask, moment follow-ups

- **Moves:** R34 trick move, R35 promise move, R36 ask text step, R37 gift pop, R41 moment flair, R44 smug
  rock (R34, R35, R41, R44 unkeyed), R76-R77 ask timers. **The ask's `wait()` re-arm is a silent
  replace** (`key: "ask"`): the question must not close on a focus, which an `undo: done` would have done
  (A1).
- **Characterization first:** `looks_trace.test.js`: trick and promise moves 600 ms after the line (none
  under calm for the trick; the promise move checks calm itself); the ask ends at 60000 and the text step at
  60000 (`step.until` is `ASK_MS + 1000`); a hidden tab ends the text step now (existing, unchanged); the gift
  pop ends at 5000 and `_giftPopEnd` at 3000 cancels the timer; the smug rock fires only if
  `!s.scene && !s.asleep && !owned`; a `focusin` at 30 s restarts the ask to 90 s with the box still up
  (A1). **D-keep (A2):** the question up, disconnect at 1 s, reconnect at 2 s: the box is still on screen at
  59 s and gone at 60 s with `s.asking` false and the next queued line free to come (`asking` is a
  `BUSY_OWNERS` entry; if the timer were drained or dropped it would be busy forever). Reach:
  `promise.test.js`, `gift_lines.test.js`, cc `gifts`, `memorytags`, `personality`.
- **Edits outside `src`:** `scripts/card-check.js:14064` (`clearTimeout(s.askTimer)` becomes
  `stop(s, { key: "ask" })` through `page.evaluate`). **A card-check probe** in `memorytags` pins A2 in
  a real browser: with a question up, `el.remove()` then re-append to the same parent within 1 s; the
  question is still on screen, `s.asking` is true, and at 60 s it is gone. (The review's open
  question: whether HA's masonry re-columning still detaches and re-attaches cards on the current HA.
  A2 stands on the view-switch case alone; the probe does not depend on which HA path does it.)
- **Checks:** trace tests; the above `tests/js` files; `scripts/ci-gate` (iterate with `gate --auto`:
  `gifts`, `moments`, `personality`, `memorytags`, `visitors`).
- **Device queue:** fixture: dev pet with a gift waiting, and a question due (`scripts/dev-seed`).
  `qa_screen`: first look after a long absence; the question bubble. Look at: the gift pop above the pet and
  its line (5 s), the question stays 60 s then goes, a trick's move after its line.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.6 Slice 6: season

- **Moves:** R45-R50. The `.flair` sweep in `_flair` (which removes a costume box too) stays. **`_forget`
  calls `this._seasonVisitEnd(s)` before `detach`** (in this slice's move commit; R50 is a closer, 3.14), so
  `s.seasonVisit` is null and the flyer gone after a forget mid-visit.
- **Characterization first:** `season_trace.test.js`: a costume then the treat at +1600; the confetti box at
  3600; the costume box at `FLAIR_MS + 1800`; a flock of 5 flyers at `lag * 450`; each flyer removed at
  `ms + 200`; the visit steps at 1400, 3400 and `ms`, with `_seasonVisitEnd` cancelling the rest (the group)
  and keeping the flyer's picture only when `passed`. **Forget mid-visit** (at 2000): `s.seasonVisit ===
  null`, the flyer node gone, `pending(s) === 0`. Under calm: the same trace (the audit's finding 5:
  these sequences run under calm today; pinned, not changed).
- **Checks:** trace tests; cc `winter` and `moments` carry the season code (`gate --auto` picks them; the
  `winter` section is the largest consumer); `scripts/ci-gate`.
- **Device queue:** fixture: no bench preset covers the season boxes; use the dev HA with the date pinned to a
  season, as the `winter` card-check section does. `qa_screen`: the pet screen on a seasonal day. Look
  at: costume and treat, confetti, a flyer crossing, the visitor's startle and greet; swipe away mid-visit.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.7 Slice 7: the `_animate` helper

- **Moves:** R80. `ANIMATE_TIMERS` goes. `_animate(s, el, cls, ms)` becomes `_hold` with `restart` and the
  drape mirror; `key = "anim:" + cls`, `target = el`, scope `s ?? this._dirCard` (G8). The prefix keeps `_animate`'s
  keys out of the `(scope, target, key)` space of the named keys on the same sprite (`turn` R63, `lit`,
  `breezy`, ...): no `_animate` call uses one today, but the dynamic classes (`move`, `pose.move`, `jump`,
  `REACT_POSE.startle.move`) could. 85 callers do not change.
  **This is the slice A1 bites hardest:** a snack's chews 300 ms apart are two `_animate` calls on the same
  class, and the first call's replacement must not run an undo that removes the class the second just
  added. AGENTS.md's motion rule ("`_animate` restarts only the class it is given") is the contract.
- **Characterization first:** `animate_trace.test.js`, a table of every `(cls, ms)` pair `_animate` is
  called with (extracted from the source by regex so a new caller is a new row): for each, the class is
  added at 0, removed at `ms`; a second call at `ms / 2` restarts (the old timer does not remove the new
  class; removal at `1.5 * ms`); the same class on two elements (`s.pet` and `s.gameNum`) is two entries;
  the drape mirror gets the class unless `cls === "lie"` or the drape is hidden; `ms` of `0`; an
  element that left the DOM; **a second call at `ms / 2` keeps the class on until `1.5 * ms` (A1)**; a call
  with `s` undefined uses the card scope and does not throw. `_forget` mid-move now removes the class at
  once (B1). Reach: `motion_ship1/2`, `touch`, `care_reactions`, `sitter_life` tests; cc `pat`, `react`,
  `care`.
- **Edits outside `src`:** `tests/js/care_reactions.test.js:633,1433` extract `konst("ANIMATE_TIMERS")` and
  count sandbox `setTimeout` calls (`:1249-1268` is slice 9): they drop the extraction and use the adapter
  stubs; `motion_ship1.test.js`, `motion_ship2.test.js`, `touch.test.js`, `sitter_life.test.js` gain the
  adapter stubs (every vm test whose fake `this` lacks `_director`/`_later`/`_hold` throws once the
  method moves).
- **Checks:** trace tests; all `tests/js`; `scripts/ci-gate` (the whole gate: nearly every section names
  `_animate`); **a bench before/after contact sheet** (`--preset species` and the care shots, 6.7).
- **Device queue:** fixture: dev pet; bench `--preset species` for the moves. `qa_screen`: the pet screen,
  then a care scene. Look at: perk after a tap, greeting hops after a long absence, a snack's chews 300 ms
  apart (the comment above `_animate`, `card-visit.js:557`), settle on sleep, every game win.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.8 Slice 8: boot and power-on

- **Moves:** R11 gag steps, R12 boot wait, R13 boot fill. R11 is group `power` on the slide; `_powerEnd`
  stops the group (silent: it is the gag's own closer, and `disconnectedCallback` and `_forget` already
  call it). R12 and R13 are on the **card scope** (`this._dirCard`), which no `detach` or `reset` ever
  drains: a disconnect leaves them running, as the bare timers do, so the fill timer still clears
  `_booting` and removes the `booting` class after a re-attach (A2, A3: there is no undo and so no
  `_bootEnd(false)` scheduling inside a drain). `_bootEnd` stops the key `boot.wait` and the R13 entry
  is unkeyed, as today.
- **Characterization first:** `boot_power_trace.test.js`: the gag's steps at their `at` offsets (blank
  blinks, the low line at 0, the next at 2200, the end at 4200) and calm's reduced set; a tap during the gag
  ends it with the rest dropped; the boot wait ends silently at 5000, a tap sooner, and the fill finishes
  at +600 (none under calm). **D-keep:** disconnect during the fill, advance 10 s: `_booting` is false, the
  logo is hidden. **D-reattach:** disconnect at 4900 ms and reconnect at 5000: the boot ends at 5000 and
  fills to 5600, as the unmoved code. The power gag is closed at a disconnect by `_powerEnd`, as now.
- **Edits outside `src`:** `dev/bench/page.js:714` (`cur.power.timers.forEach(clearTimeout)` becomes
  `stop(cur, { group: "power" })`; `s.power.timers` goes with the move).
- **Checks:** trace tests; `leak_guard.test.js`; `scripts/ci-gate` (iterate with `gate --auto`:
  `lowbattery`, **`boot`**; the prelude is not a section, it always runs).
- **Device queue:** fixture: dev pet with a low battery; a first load with the boot logo (reload the page).
  `qa_screen`: the boot logo, then the low-battery screen. Look at: 5 s with no tap ends silently; a tap
  fills the logo and cuts to the pet; the low-battery gag's blinks and lines.
- **Timings:** identical. **Rollback:** revert.

### 5.9 Slice 9: care scene stragglers and the drape

- **Moves:** R15 rock2 (group `scene`), R16 murk (group `scene.murk`), R17-R20 drape (group `drape`,
  stopped silently by `_drapeStop` as now; R19's `drapeAnim = false` is its `undo` for the forget drain).
  `_sceneEnd` gains `drain(s, { group: "scene" })` **after** the `if (!sc) return` and **before**
  `entry.clear?.call(...)`, and **only when `quiet` is true or the end is a swipe**. Its quiet callers are
  `_forget` (`card-build.js:791`), the disconnect (`card-base.js:200`) and **Hop's board load**
  (`card-board.js:174`, behind `experimental_hop`: the board loading over a clean scene past 1800 ms now
  cuts `rock2`, disclosed as D3, Q11). A normal end (the
  answer arrives, the hold runs out) leaves the group, so the 1.3 s shake-off after the broom still plays
  out, exactly as now. The swipe is not told apart from a press today: every caller is `this._sceneEnd(x)`
  (`card-build.js:1020`, `card-actions.js:86,162,171`, `card-mode.js:120`, `card-flair.js:231`). The slice
  adds **`{ swipe: i !== to }`** at `card-build.js:1020` only, so the press paths are untouched (F7).
  `_go` calls `_sceneEnd(x)` for every slide **including `to`** (no `i !== to` guard), and on a one-pet card
  a sideways swipe is `_go(this._index + 1)` (`card-build.js:113`) and a tap on the current dot is
  `_go(i)` (`card-layout.js:324`), so `to` is the visible slide: today the scene ends there and the 1.3 s
  `rock2` plays out on the visible pet, and with a bare `{ swipe: true }` it would be cut at once (review
  s2978 fix 3). The guard keeps it (D4). If the owner refuses D3 for Hop's board only, the drain moves
  behind an explicit flag (`_sceneEnd(s, { quiet, drain: true })`, passed at the forget, the disconnect and
  the leaving swipe) at the cost of one argument. R16 is
  outside the drained group because `entry.clear` (`card-actions.js:262` -> `card-care.js:164-170`) is
  what starts it: a drain after `clear` would restore `transition` in the same frame and the murk would
  fade back instead of snapping.
- **Characterization first:** `scene_stragglers.test.js`: a clean scene to 1800 ms adds `rock2` and removes
  at +1300 even if the scene ends at 2000 (pins the normal end); the murk restore at +50. The B4 cases: a
  quiet end at 1900 (forget): before, `rock2` is stripped at 3100 from the next pet; after, it goes at 1900.
  Drape: a fall is three frames at 0, 150, 300 and `drapeAnim = false` at 450; `_drapeStop` cancels all
  (the group); a lights-on slide-out hides at 150. **Cases F7:** a press end at 1900 (not quiet, not a
  swipe) leaves `rock2` to 3100; a leaving swipe end (`i !== to`) drains it at once but the murk restore
  still happens at +50 (not at 0); **one-pet swipe (fix 3):** `_go` to the same slide on a card with one
  pet keeps `rock2` to +1300 (D4); **Hop board (fix 4):** `_sceneEnd(s, { quiet: true })` at 1900 cuts
  `rock2` at once (D3), and the scene's murk restore still fires at +50; **D-keep:** disconnect during a
  clean scene: the scene is closed by `_sceneEnd({quiet})` and the `rock2` entry ends with it (the one
  disconnect-visible difference, G9/Q11); the murk restore entry is **not** drained and still fires at
  +50 ms.
- **Edits outside `src`:** `tests/js/care_reactions.test.js:1249-1268` (the drape: `f.log.timers` is the
  stubbed `setTimeout` list `[150, 300, 450]` and `[150]`; `:1427` reads `f.s.drapeTimers`): they read the
  ledger group `drape` and drop the field.
- **Checks:** trace tests; `care_reactions.test.js`, `motion_rule.test.js`; `scripts/ci-gate` (iterate with
  `gate --auto`: `care`, `pat`, `react`); **a bench before/after contact sheet** (the care shots, 6.7).
- **Device queue:** fixture: bench `--preset` care shots (`care: "clean"`, `careAt: 2000`) and a dev pet
  asleep with lights out. `qa_screen`: the clean scene, the lights scene. Look at: the broom shake-off
  after the sweep (still plays to the end), tuck and wake (the blanket's three frames), swipe away from a
  scene mid-way.
- **Timings:** identical; B4 fixed for forget, disconnect, the Hop board and a leaving swipe. **Rollback:** revert.

### 5.10 Slice 10: games

- **Moves:** R22 `_gameLater` (8 callers), R23 flip swap, R24 flavour line (unkeyed). `_endGame` stops the
  group `game` (its `gameTimers` set goes) and the dead `cancelAnimationFrame(s.game?.cur?.raf)` at
  `card-flair.js:195` is deleted: no game rAF exists, and slice 14's rule would otherwise fail on it (F12).
- **Characterization first:** `games_trace.test.js`: `_gameLater(s, g, 1500, fn)` fires at 1500 only if
  `s.game === g` (the guard stays in the wrapper); `_endGame` cancels all pending; a replaced game (`g2`)
  drops `g`'s steps; the flip swap at 80 only if `dataset.n` unchanged; the flavour line at 4000 only if no
  game. Reach: `hop_board.test.js`, cc `play`, `resume`, `shellmode`, `board`.
- **Edits outside `src`:** `scripts/card-check.js:3834,3841,3844` (`s.gameTimers.size`, no `?.`: it would
  throw once the set is gone), `:3864-3866` (a check that would go vacuous) and `:5685` read the count:
  they read `inspect(s).timers.filter((t) => t.group === "game").length` through `page.evaluate`;
  `tests/js/motion_ship2.test.js:110-118` (the flip-clock case pins `timers[0][1] === 80`).
- **Checks:** trace tests; `hop_board.test.js`, `shell_modes.test.js`; `scripts/ci-gate` (iterate with
  `gate --auto`: `play`, `resume`, `shellmode`, `board`).
- **Device queue:** fixture: dev pet, `left_right` and `higher_lower`, and Hop if `experimental_hop`.
  `qa_screen`: the game screen. Look at: the flip-clock digit, a round's end pause and the next prompt, quit
  mid-game (nothing late appears), the pet's line a few seconds after a win.
- **Timings:** identical. **Rollback:** revert.

### 5.11 Slice 11: visitors, reveal, swipe grace

- **Moves:** R14 (unkeyed), R85, R86, R87. `_visitorEnd` and `_revealEnd` stop their groups (`V.timers`,
  `R.timers` go). **This slice owns the R85/R14 forget path (review s2978 fix 1):** `_forget` calls
  `this._visitorEnd(s)` before `detach`, in the move commit (not in slice 14). `_visitorEnd` is the only
  code that sets `s.visitor = null`; `detach` alone drops the steps silently, and `s.visitor` would stay
  set (a `BUSY_OWNERS` entry: idle life, `_free` and the next visitor blocked, the old visitor's art left
  over the new pet). The reveal needs no new call (`card-build.js:842` has `_revealEnd`). R86's disconnect
  is keep; `_dropFinds` is not touched (G9).
- **Characterization first:** `visitors_trace.test.js`: a walking visitor's steps at their offsets (the look
  at `inMs`, the pair behind at `PAIR_BEHIND_MS`, greet at `greetAt`, leave at `greetAt + stay`, end at
  `total`); each step re-checks `_visitorLive`; swipe away at +100 and back at +400: the visitor stays; away
  past 600: it goes at +600; the reveal's find *i* at `i * 2500` and the end at `total`.
  Two swipes away inside 600 ms: the visitor still ends at the **first** swipe + 600 (unkeyed, F4).
  **The forget trace (pins fix 1):** `_forget(s)` at +500 of a walking visitor (and again inside a swipe
  grace): `s.visitor === null`, the visitor's elements gone, `pending(s) === 0`, `_free(s)` true on the next
  tick and a new visitor can start, and nothing of the old one fires later (no step on the new pet).
  Today the same trace ends the visitor at `total` (or the grace), on the new pet's slide.
  `forget_drain.test.js` (slice 14) carries the visitor case beside the others.
- **Edits outside `src`:** `dev/bench/page.js:219` (`R.timers.forEach(clearTimeout)`) and `:645`
  (`V.timers.forEach(clearTimeout)`) become `stop(<slide>, { group: "reveal" })` and `{ group: "visitor" }`
  (the bench freezes a beat this way).
- **Checks:** trace tests; `find_lines.test.js`, `visitor_day.test.js`; `scripts/ci-gate` (iterate with
  `gate --auto`: `visitors`, `finds`, `gifts`, `collection`).
- **Device queue:** fixture: dev pet with a world visitor due and a basket of finds
  (`scripts/dev-seed`). `qa_screen`: the pet screen with a visitor; the basket reveal. Look at: the visitor
  walks in, is greeted, leaves; swipe away and back quickly (it stays); the reveal shows each find 2.5 s.
- **Timings:** identical. B1. **Rollback:** revert.

### 5.12 Slice 12: the infrared link

- **Moves:** R29-R33, with `every` for the two intervals. `_linkEnd` stops the group `link` (its
  `L.timers`, `L.swap`, `L.flap` go). The card-level scope is `this._dirCard` (the link outlives a slide).
  **Named, not left to the group:** `L.hideAt` and `L.endAt` are re-armed with a per-handle clear inside
  a queued line's `then` (`card-link.js:162-168`): keys `link.hide` and `link.end`, and the two
  `clearTimeout` lines become `_stop(this._dirCard, { key })`; the re-arm after them is a new entry in
  the same group. `_linkEnd` stays the closer at a disconnect, as now; nothing else is drained.
- **Characterization first:** `link_trace.test.js`: the 11 `at` offsets for a calm and a non-calm visit,
  with and without a stretch (`L.beamMs`), the frame swap every 700 ms (none under calm), the head flap
  every 200 ms, beam `gone` at `ms + 500` and removed at `ms + 900`; `_linkEnd(true)` at the end; a cut
  short (a sleep, a tap on Status) cancels everything and leaves no interval (the fake clock's pending count
  is 0); a queued line that moves the end (the `then` at `:162-168`) leaves one `link.hide` and one
  `link.end` entry, not two. Reach: cc `infrared` (71 refs), `link_lines.test.js`.
- **Edits outside `src`:** `dev/bench/page.js:697` (`card._link.timers.forEach(clearTimeout)`) becomes
  `stop(card._dirCard, { group: "link" })`; `:726-734` (`irBeam` builds `card._link = { timers: [] }`,
  then `_linkBeam` pushes into it, then `L.timers.forEach(clearTimeout)`) builds `card._link = {}` and
  stops the group. The shots `irBeam` and `link.say` need the group stop.
- **Checks:** trace tests; `leak_guard.test.js` (no live interval after the card leaves, measured after
  the longest due time: N11); `scripts/ci-gate` (iterate with `gate --auto`: `infrared`, `restart`,
  `oldcard`).
- **Device queue:** fixture: two dev pets on one card, a kindred pair and a stranger pair
  (`scripts/dev-seed`). `qa_screen`: the shelf with two pets, then the visit. Look at: the whole visit start
  to end (about 5.6 s, 3.6 s with reduced motion), the beam, the guest's frame swap, the host's line; swipe
  mid-visit; open Status mid-visit.
- **Timings:** identical. No B1 here (N2): the link lives on the card scope and `_forget` never reached it.
  **Rollback:** revert.

### 5.13 Slice 13: channel waits, the memory page and the confirm lapse

- **Moves:** R8, R9 (subscribe wait and retry), R38 (memory idle), R39 and R56 (the "sure?" lapses). **Not
  moved:** R51-R55 (the sheets' call waits: section 4.5, Q7; the shell pick's race and the rename's retry
  are promises that must settle, and the lay wait shares their closers) and R83 (moved in slice 2). The
  reads of the timer fields as flags become `_has` (`s.waitTimer`, `s.retryTimer`: `card-base.js:246,255,264`),
  and the fields go. `_unsubscribe` stops both keys, as before, and stays the closer at a disconnect and
  at `_forget`; `connectedCallback` subscribes again, as before.
- **Characterization first:** `waits_trace.test.js`: the subscribe wait at 3000 then `subscribeFailed`;
  the retry at 2000, 5000, 15000, then 60000; `_unsubscribe` stops both; a stale `subGen` ignores the
  retry; `confirm` lapses at 4000 (R39) and 4050 (R56); memory idle closes at 120000 and a tap restarts it.
  The sheets' waits (R51-R55) get a *characterization only* trace (they do not move): the shell pick
  rejects at 10000 unless the call finishes; `shellPending` clears at +5000 after a success for the same
  pet only; the lay wait at 30000, again at +5000 while reloading, up to 120000; `_layDrop` cancels; the
  rename retry at 2000 once (code `not_ready`). **D-keep and D-reattach (A2):** disconnect while the shell
  race is pending, reconnect, advance 10 s: the race rejects, the picker settles; disconnect during the
  rename retry: `nameBusy` clears; disconnect while the lay wait runs: `layAt` is cleared at its time;
  disconnect with a subscribe retry pending: it is stopped (as now), `connectedCallback` subscribes
  again and the retry count restarts. Reach: `subscribe_silence.test.js`, `memory_page.test.js`, cc
  `channel`, `shell`, `egg`, `forget`, `memorypage`.
- **Edits outside `src`:** `scripts/card-check.js:11560,11566` read `!!s.retryTimer`: they read
  `_has(s, { key: "sub.retry" })` through `page.evaluate`; `tests/js/subscribe_silence.test.js:63` counts
  `setTimeout` calls with `ms === 3000` (the wait) and `:86` sets `s.retryTimer = 99` ("what the catch
  sets"): they use the adapter stubs and the ledger; `tests/js/memory_page.test.js:153,171,228,254` call
  `clearTimeout(s.confirmTimer)`: they `stop` the key; `:194` plants `memoryIdle: setTimeout(...)` and `:198`
  asserts `s.memoryIdle === null`: both go (the field goes; assert `pending` for key `memory.idle` is 0).
- **Checks:** trace tests; `subscribe_silence.test.js`, `memory_page.test.js`, `leak_guard.test.js`;
  because `card-base.js` subscribe code changes, **`scripts/ci-gate`** on the slice's branch (the whole
  card-check, five shards) before it merges (as for every slice now); iterate with `gate --auto`
  (`channel`, **`memorypage`**, `forget`; the prelude always runs).
- **Device queue:** fixture: dev HA, reload mid-session; airplane mode on the phone and back. `qa_screen`:
  the pet screen, the status page's memory page. Look at: the card loads on a cold start, comes back
  after a lost connection, the memory page closes after two idle minutes, a forget's "sure?" lapses.
- **Timings:** identical. **Rollback:** revert.
- **Slice 13b (optional, Q7):** R52-R54 (`shellPending`, the lay wait) under the keep policy, with the
  lay sheet's `_layDrop` and `_shellSettled` as closers. Only if the owner says so; its own trace and
  `ci-gate`.

### 5.14 Slice 14: close-out

- **Moves:** nothing new. Replaces the ratchet table with the allowlist (7.1) and adds the field rule (no
  `\w+Timers?\s*=` outside the allowlist). `_forget` loses the manual `clearTimeout` lines
  (`card-build.js:805,852-858`) now that `detach` drains; `disconnectedCallback` loses
  `clearTimeout(this._headTimer)` (it is `_stop(this._dirCard, { key: "head" })` since slice 1).
  Adds `forget_drain.test.js` (B1, global) and `reattach_keeps.test.js` (A2, global) and extends
  `leak_guard.test.js` with `director.pending() === 0` **after the longest due time** (N11). AGENTS.md:
  the "Where things live" row for `interaction-director` gets the ledger; a short "Timers on the card"
  rule (a new timer goes through `_later`/`_hold`; the allowlist is the only exception). This plan is
  marked done.
- **Characterization first:** the global trace: every migrated trigger run once, then `_forget(s)`, then
  `pending(s) === 0` and the clock advanced by 10 s changes nothing on the next pet (`class`, `style`,
  child count unchanged); and the re-attach: every trigger, `disconnectedCallback`, `connectedCallback`
  100 ms later, the clock to the longest due time: the end state equals the unmoved code's, field by
  field (`s.asking`, `layAt`, `nameBusy`, `_booting`, `drapeAnim`, retries).
- **Checks:** all `tests/js`; `scripts/ci-gate` (the first mate's batch gate covers it too).
- **Device queue:** none beyond a smoke of slices 1-13.
- **Rollback:** revert (the earlier slices stand; they do not depend on it).

### 5.X1 Hidden policy (B2)

- **Order:** after slices 2, 3, 6 and 11, which create the entries it flips (F11).
- **Changes:** `hidden: "tab"` for the entries of: flair box, season boxes and flyers, confetti, house fx,
  robot, hearts, sparkle, speck, bubble pop, find ring. Each has an `undo` that removes its node or class
  (a drain, so it runs). Not for: anything with a state side effect (pose end, ask, gift, memory,
  visitors' end, subscribe, boots) and not the link until Q2's second half. **Not on `"offscreen"`**: a
  scroll-off does not throttle timers, and ending an effect early for a player who scrolls back is a
  visible change with no stale effect to cure (G6).
- **Characterization first:** `hidden_policy.test.js`: with `document.hidden` true and the clock advanced,
  each listed entry is gone at once (its class off, its node removed) and not again at its due time; the
  IntersectionObserver path (`hidden("offscreen")`) changes nothing; each unlisted one still fires on time.
- **Checks:** `hidden_policy.test.js`, `scripts/ci-gate` (iterate with `gate --auto`: `moments`, `winter`).
- **Device queue:** phone: start a flair or a house fx, lock the screen for 10 s, unlock: nothing stale on
  the screen. **Timings:** the visual ends earlier on a hidden tab (the bug). **Rollback:** revert.

## 6. The testing method, once

1. **Write the trace first.** For the slice's rows, a `trace()` test (5.0) against the unmoved code. It must
   pass on the tree before the move. It records, for each trigger, the ordered `(t, effect)` list with
   `calm` both ways, and the "called with no slide" case where a moved method can run without one (G8). This is
   the contract. It is the pin for reduced motion too (F13): a site's `calm: true` list is whatever the
   unmoved code does, empty or not.
2. **Move.** Change the sites as the table says; the trace test must pass **unchanged**. The only allowed
   edits to an existing trace are the ones the slice names (B3 in slice 3, nothing else). The **existing**
   tests that extracted the moved code are edited in the move commit (6.2).
3. **Drain tests.** For each moved row: (a) `_forget(s)` after the trigger, then advance 10 s: the next
   pet's classes and nodes are untouched and `director.inspect(s).timers` is empty (3.14 says which rows
   are end, drop or closer); (b) **D-keep**: `disconnectedCallback`, advance 10 s, compare the end state
   (classes, nodes, `s.*` flags, `_booting`, `drapeAnim`, `s.asking`, `layAt`, `nameBusy`, retries) with
   what the unmoved code leaves; (c) **D-reattach**: `disconnectedCallback`, `connectedCallback` 100 ms
   later, advance to the longest due time: the same end state, and a tick runs.
4. **Re-arm tests (A1).** Every keyed site: trigger, trigger again at half the time; the class is on until
   the second's end, and no `undo` has run. Every `stop` site: the `undo` has not run.
5. **Ratchet.** Lower the numbers in `timer_rule.test.js` by the identifiers the slice removed.
6. **Gates.** `node --test tests/js/*.test.js`, `node scripts/build-card.js`, `scripts/gate --auto` to
   iterate, and **`scripts/ci-gate` on every slice's branch before it is called done, and after every
   follow-up fix** (AGENTS.md, owner 2026-11-04; the first draft ran it only for slice 13). A FLAKE line is
   fine; a FAIL is the slice's to fix, even in a section it did not touch.
7. **Real browser and the bench.** `leak_guard.test.js` (Playwright, bench page) after slices 8, 12, 13
   and 14. **Slices 3, 4, 7 and 9 each attach a bench before/after contact sheet**: `NODE_PATH=... node
   scripts/bench.js --preset species` (and the care shots for 9) on the commit before and after, side by
   side, with the `petAt`/`careAt` pins; the diff must be empty. Slice 7 is the one the bench catches
   best.

### 6.2 Existing tests that change, by slice (F2)

| Slice | Test | Why |
|---|---|---|
| 1 | `cap_press.test.js:62` | a regex pins `setTimeout(() => button.classList.remove("failed"), 400)` |
| 1, 3 | `motion_ship2.test.js:28-118` | `_wipe` (170/220) is slice 1; `_swapFlip` `[100, 200]` is slice 3; the flip-clock 80 is slice 10 |
| 2 | `rare_glass.test.js:355` | requires `s.markTimer` in `_markEnd`'s text |
| 2, 3, 4, 7, 9 | `care_reactions.test.js:121,161,633,1249-1268,1427,1433` | `:121` shake (3), `:161` pose end (4), `:633,1433` extract `ANIMATE_TIMERS` (7), `:1249-1268,1427` drape (9) |
| 3 | `motion_ship1.test.js:25`, `touch.test.js:101` | `_wander` pins the timer; the fake `this` has no `_hold` |
| 7 | `sitter_life.test.js`, `touch.test.js`, `motion_ship1/2.test.js` | `_animate` is extracted |
| 13 | `subscribe_silence.test.js:63,86`, `memory_page.test.js:153,171,194,198,228,254` | `setTimeout` count; `s.retryTimer = 99`; `clearTimeout(s.confirmTimer)` |
| all | any vm test whose fake `this` lacks `_director`, `_later` or `_hold` | it throws once its method moves; the sandbox helper adds them |

Each is edited in the move commit of its slice, by name; the slice section repeats the line.

## 7. Acceptance for the whole effort

1. **The grep rule is a test.** `tests/js/timer_rule.test.js`: no bare `setTimeout`, `setInterval`,
   `requestAnimationFrame`, `clearTimeout`, `clearInterval`, `cancelAnimationFrame` (counted as the bare
   identifier, F12) or `.animate(` in `src/card/*.js` outside the allowlist: `card-base.js` (`_tick` and
   its clear), `card-build.js` (the director's three injected wrappers: `schedule`, `repeat`, `frame`),
   `card-tick.js` (the typing interval and its clear), `card-actions.js` (the scene rAF and its cancel),
   `card-visit.js` (the answer resend), `card-sheets.js` (R51-R55: lines 141, 147, 306, 311, 460 and their
   clears 143, 146, 317, 373) and `card-layout.js` (R52's `clearTimeout(s.shellPendingTimer)` in
   `_shellSettled`, line 433: the one `card-layout` line left, 0 timers started there). Each entry has a comment with its reason and a count; an unused entry
   fails. From slice 0 it is a ratchet (5.0). Appendix B has the starting counts.
2. **B1-B4 each have a test:** B1 `forget_drain.test.js` (and the per-slice drain tests); B2
   `hidden_policy.test.js`; B3 `pet_oneshots_trace.test.js` (the two-flip case; one name, N7); B4
   `scene_stragglers.test.js`. **A1-A4 each have tests:** A1 L3, L4, L20 and the re-arm tests (6.4); A2
   D-keep, D-reattach and `reattach_keeps.test.js`; A3 L18 and the lean forget case; A4 L15 and the
   "no slide" traces.
3. **The player sees no change:** every trace test in section 5 passes unchanged across its move; the
   device rows above show nothing new. The differences are exactly **D1-D4 of section 0**: the B3 second
   flip, B1's forget (including the forgotten visitor), the `rock2` cut at a quiet end (forget,
   disconnect, Hop's board load; B4) and a leaving swipe (B4). Nothing else.
4. **No leaks:** `leak_guard.test.js` extended: **after the longest due time** (not at the leave: a
   disconnect keeps entries running, G9), `director.pending() === 0`.
5. **The docs:** AGENTS.md carries the ledger and the rule.

## 8. How this inventory was checked

`grep -nE "(setTimeout|setInterval|requestAnimationFrame|\.animate\()" src/card/*.js` (style.js excluded,
it holds CSS) gave 89 lines on `531cd101`; one is a comment (`card-build.js:51`), so 88 code lines. The
review re-ran it and agrees (review: "complete by line"; the 56 `clear*` lines plus 2 `getAnimations`
lines match Appendix A's 58). R1-R87 are exactly
those (R6 is two lines, `:175,177`; a helper called from many places, such as R22, R29 and R85, is one
row at its one `setTimeout` line). A script compared the rows' `file:line` list with the grep: no line
missing, none extra. The 58 cancel lines are Appendix A. The first mate (or slice 0) can re-run the check: `timer_rule.test.js`
pins the same counts, now as bare identifiers (Appendix B), which also catches a `forEach(clearTimeout)`
and an alias.

## 9. Open questions for the owner

1. **Q1. Ownership only, or arbitration too?** Do the pet's one-shots stay as they are (the director owns
   the handle and the cleanup, never refuses a call), or should a `petBody` lease start dropping a move that
   arrives while another plays? *Recommendation: ownership only.* A lease would change what the player sees
   (a perk that plays today would be dropped); that is a design change for a separate plan.
2. **Q2. Hidden tab.** (a) End the decorative one-shots at once when the **tab** hides (slice X1; flair,
   season boxes, house fx, robot, hearts, sparkle, speck), so nothing stale shows on return? (b) Also end the
   infrared visit on hidden (the audit's `_linkEnd()`)? (c) Also end them when the card **scrolls out of
   view** (the observer at `card-build.js:141` also calls `_dirPause`)? *Recommendation: (a) yes; (b) no for
   now; (c) no.* The visit is a scripted scene with queued lines and a cut-short path that says things;
   ending it on hidden is a behaviour change, not cleanup. A scroll-off does not throttle timers, so the
   effect ends on time unseen, and ending it early would be cut short for a player who scrolls back.
3. **Q3. The long ones.** The robot's 6 s (`card-visit.js:632`), the season box's ≈6 s (`card-season.js:307`)
   and the 4.2 s flair: keep, cap at 3 s, or document? *Recommendation: keep all three and document them as
   ambient (pointer-events none, never blocking input); a 3 s cap changes the look and the CSS keyframes
   (`robot-cross 6s`), which is art, not a migration.* No slice changes them.
4. **Q4. The allowlisted sites** (`_tick`, the director's injection point, the typing interval, the
   care scene's rAF loop, the answer resend, and the five sheet waits R51-R55 of Q7): accept the reasons in
   section 4? *Recommendation: yes.* The alternative for the rAF loop is to move it through `frame()` as a
   late optional slice; I advise against it (60 fps timing, no gain). The dead `cancelAnimationFrame` at
   `card-flair.js:195` is deleted, not allowlisted.
5. **Q5. The `perk` quirk.** `_perk` (`card-actions.js:32`) and `_animate(.., "perk", 320)` use the same class
   with independent timers, so one can remove the class from the other early. *Recommendation: keep them
   independent (`_perk` unkeyed, `_animate`'s keyed on its own: identical timing) in slice 1 and leave it;
   merging them is a one-line follow-up if the owner wants it.*
6. **Q6. Where the ledger lives.** In `interaction-director.js` (443 → about 700 lines; one frozen
   namespace, one `detach`, as section 5 of the plan reads), or a new `director-ledger.js` part (its own
   frozen namespace, created next to the director; `manifest.txt` order and the TDZ check)? *Recommendation:
   keep it in the director's file;* the file's header already says "decides which effect may run"; add one
   sentence for "and owns the timers of the card's own one-shots".
7. **Q7. Network waits in the director.** The first draft recommended moving all of slice 13 (subscribe
   wait and retry, the sheets' waits, memory idle). The review found that two of them are a call's
   lifetime. *Recommendation, reversed:* move R8, R9, R38, R39, R56 (last, with `scripts/ci-gate`; drop
   the slice, not the effort, if the first mate sees a flake) and **leave R51-R55 out** (the allowlist
   grows by those five lines, so "all" is met by every site except the ten in section 4). R51 (the shell
   pick's race timeout) and R55 (the rename's retry) must settle whatever happens to the slide or the card,
   as R78 must. R52-R54 have no promise and would move safely under the keep policy: **Q7b: move them
   too, as an optional slice 13b?** *Recommendation: no;* the sheet flows share closers (`_shellSettled`,
   `_layDrop`, `_clearNameTimers`), and a rename of five lines gains the ledger's drain where the closers
   already do the job.
8. **Q8. Device rows required before merge?** Slices 11, 12 and 13 change nothing visible; their rows are
   a smoke. *Recommendation: the owner reads one phone row for slice 12 (the link) before the batch merges;
   the others ride on the next device pass.*
9. **Q9. Batching.** One PR per slice (15 PRs, each one revert), or bundle 1+2, 3+4, 5+6 (about 9)? *Recommendation:
   one per slice until slice 4 is in and quiet, then bundle low-risk neighbours.*
10. **Q10. The device queue tool.** The brief names `qa_screen`; the repo has no `qa_screen`. The queue rows
    above name a fixture and a screen in words. *Recommendation: the first mate maps each row to the
    queue's real fields.*
11. **Q11. The disconnect policy.** HA detaches and re-attaches the same card (a view switch and back,
    masonry re-columning). Today `disconnectedCallback` ends a fixed list (the game, mode, scene, drape,
    typing, power gag, photos, gift pop, finds, memory page, subscription, link, head swap, `_tick`) and
    every other timer runs on, so the question, the shell pick's race, the rename retry, the lay wait and
    the boot fill all finish on their own. (a) Keep exactly that: `reset()` drains nothing, the ledger's
    entries fire on their time, and the closers stay the only ending at a disconnect. (b) End the
    decorative one-shots (flair, season boxes, house fx, robot, ...) at a disconnect too, as the intent
    doc's acceptance 10 reads ("reconnect cancels timers/classes"). *Recommendation: (a).* (b) cannot tell
    a re-attach from a removal in `disconnectedCallback`, ends a question or a pick unfinished on a view
    switch unless every entry is classed, and a delayed "end after N s disconnected" needs a timer the
    disconnected card does not have. The disclosed changes under (a) are D1-D4 of section 0, and the one that
    touches a disconnect is D3: the clean scene's 1.3 s `rock2` shake-off ends with the scene when the card
    leaves (the scene's own quiet end already runs at a disconnect); a re-attach inside 1.3 s no longer
    sees the shake. The murk restore is **not** drained: it keeps firing at +50 ms as now (R16 is keep).
    The same `rock2` cut also happens at a forget and when **Hop's board loads** over a clean scene past
    1800 ms (`card-board.js:174`, behind `experimental_hop`), because the drain is on every quiet end. Say
    no to any of these and the scene drain moves behind an explicit flag
    (`_sceneEnd(s, { quiet, drain: true })`) passed only at the callers the owner keeps, at the cost of one
    argument. The intent doc's acceptance line
    (`docs/plan-2026-11-03-living-device-interactions.md:501`) is then amended to match.
12. **Q12. Slide switch.** The intent doc says a slide switch cancels timers and classes (item 6 at `:133`,
    acceptance 10 at `:501`). Today `_go` ends a game, mode, typing, lay sheet, name sheet, memory page, lay
    wait and scene on the slide being left, and **leaves every other one-shot running on the off-screen
    slide** (a flair, a house fx, a perk), where it ends on its own within 6 s. The plan keeps that:
    nothing new is drained by a swipe except the scene's `rock2` (B4, D4) on a slide being left
    (`i !== to`: on a one-pet card a swipe or a dot tap goes to the slide on show and drains nothing), so
    the player sees no other change.
    (a) Keep, and amend the intent line to "a forgotten pet, a quit game, a closed scene". (b) Drain the
    decorative entries of the slide being left in `_go` (a `group`-based drain; the effect vanishes at
    once instead of finishing off-screen, and a swipe back within 6 s finds it gone). *Recommendation: (a);*
    (b) is a behaviour change with no stale effect to cure.

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
`clearTimeout`.) The 58 are 56 clear lines (50 `clearTimeout`, 4 `clearInterval`, 2 `cancelAnimationFrame`)
plus the two reads. The ratchet counts the identifiers of the 56, not the two reads (N8).

## Appendix B: the ratchet's starting counts on `531cd101` (F12)

Bare identifiers per file, comments stripped (`\bsetTimeout\b` and so on, plus the member `.animate(`);
`style.js` holds CSS and is skipped. Slice 0 generates this table with the same rule and pins it.

| file | setTimeout | setInterval | requestAnimationFrame | clearTimeout | clearInterval | cancelAnimationFrame | .animate( |
|---|---|---|---|---|---|---|---|
| card-actions | 5 | | 2 | | | 1 | |
| card-base | 2 | 1 | | 4 | 1 | | |
| card-build | 5 | | | 9 | | | |
| card-care | 6 | | | 1 | | | |
| card-flair | 1 | | | 2 | | 1 | |
| card-games | 3 | | | | | | |
| card-journal | 1 | | | 1 | | | |
| card-layout | 2 | | 1 | 2 | | | |
| card-link | 3 | 2 | | 3 | 2 | | |
| card-looks | 4 | | | 2 | | | |
| card-memory | 2 | | | 3 | | | |
| card-mode | 1 | | | 1 | | | |
| card-moment | 4 | | | 1 | | | |
| card-season | 6 | | | 1 | | | |
| card-sheets | 6 | | | 5 | | | |
| card-tick | 16 | 1 | | 6 | 1 | | 2 |
| card-visit | 9 | | | 7 | | | |
| card-visitors | 3 | | | 2 | | | |
| **total** | 79 | 4 | 3 | 50 | 4 | 2 | 2 |

The seven `forEach(clearTimeout)` value uses are in these numbers (`card-build.js:508`, `card-care.js:970`,
`card-flair.js:203`, `card-link.js:303`, `card-season.js:399`, `card-visitors.js:321,487`). The end state
(7.1): `card-actions` 2 rAF + 1 cancel; `card-base` 1 `setInterval` + 1 `clearInterval`; `card-build` the
three wrappers (`setTimeout` 1, `setInterval` 1, `requestAnimationFrame` 1) and `clearTimeout` 1 (`:58`),
the `repeat` and `frame` cancels beside it; `card-tick` 1 `setInterval` + 1 `clearInterval` (typing);
`card-visit` 1 `setTimeout`; `card-sheets` 5 `setTimeout` + 4 `clearTimeout`; `card-layout` 1 `clearTimeout` (`:433`, R52's
`shellPendingTimer`, allowlisted with R52; with Q7b "yes" it goes in slice 13b); every other file 0. The
exact numbers are set by slice 0's wrappers and checked by slice 14.

## 10. Review response (s2976)

The review is `/home/poe/.local/state/crew/archive/hatch-at-home-s2976-20261106-0735/report.md`. Every
finding was checked against `531cd101` first. All four blockers reproduced. None of the 19 fixes or 11
nits was found wrong. The table lists where the plan **departs from the review's wording**, and what
the check turned up beyond it.

| Finding | Response | Evidence |
|---|---|---|
| A1, the name `cancel()` | The ledger's silent cancel is `stop`, not `cancel`. The review's text says "`cancel()` used for a `clearTimeout` is silent". `cancel(slide, reason, tracks)` already exists and is the track API; an overload by argument shape would be a trap. Same behaviour, a new name. | `interaction-director.js` exports `cancel` with that signature; L16 pins it |
| A2, the mechanism (`onReset`, a per-entry flag) | Done in effect, by a **simpler mechanism**: `reset()` drains nothing at all. The review wants "end" only for what `disconnectedCallback` ends today; those are all ended by closers it calls (`_endGame`, `_powerEnd`, `_drapeStop`, `_sceneEnd`, `_giftPopEnd`, `_memoryPageClose`, `_unsubscribe`, `_linkEnd`), so a flag would repeat what the closer does and give a second place to set it wrong. No entry needs `reset()` to end it. | `card-base.js:180-211`; 3.14 |
| A2, the one visible difference | Not in the review: the scene's quiet end drains `rock2` at a disconnect (the scene closes there today; its 1.3 s leftover now closes with it; the murk restore is kept, s2978 fix 5). Disclosed in G9 and Q11. (`_dropFinds` was listed as a closer here in the first revision: it is not one for the reveal, s2978 fix 2.) | `card-base.js:200` calls `_sceneEnd(s, { quiet: true })` |
| A3, the fix | Both of the review's options are taken: the drain runs to empty (cap 50), **and** undos are synchronous (lean's removes every `lean-*` itself). The boot half needs neither: R12/R13 sit on the card scope, which is never drained. | `_patLeanOff` makes `leanRelTimer`; `_bootEnd(false)` makes `finish` |
| A4, "30+ sites" | There are **54 of 67** call sites without `s`, more than the review said; the scope rule covers them all, and every slice gets an audit step. `_perk(s)` is already null-safe (`if (!s?.pet) return`). | `grep -n "_tapped(" src/card/*.js` |
| F1, extra lines | The card-check reads of `gameTimers` also include `:3834`, and `dev/bench/page.js` also freezes `cur.wipeTimer` (`:1228`), `cur.leanTimer` (`:1312`) and `cur.swapTimer` (`:1393`). All named in the slices. | `dev/bench/page.js`, `scripts/card-check.js` |
| F3, option | `has(scope, sel)` chosen over keeping the field as the handle: one source of truth, and the fields go. | 1.3 G7 |
| F6, recommendation | Q2 gets the offscreen half, with the recommendation **no**: a scroll-off does not throttle timers, so a drop there ends an effect early with nothing stale to cure. The API still takes `why`, so the owner can say yes. | 1.3 G6 |
| F8, scope | R51-R55 are all out, as the review and the brief say. The code argues only for R51 and R55 (promises); R52-R54 would move safely under the keep policy. Q7b asks; recommendation no. | 4.5, Q7 |
| F13 | Adopted: the `motion` label and the pending-set test are dropped; the trace's `calm: true` run is the pin. | 1.3 G5 |
| The review's open question (HA masonry) | Not verified here (no HA run in a docs job). A2 stands on the view switch alone; slice 5 adds a card-check probe that does not depend on the path. | 5.5 |
| Brief numbering | The brief lists the slide-less `_tapped` as A3 and the drain re-entrancy as A4; the review has them the other way. The plan follows the review. | "Changes since review" |

Nothing was rejected. The one finding the plan answers differently from its wording is A2's flag (above).
