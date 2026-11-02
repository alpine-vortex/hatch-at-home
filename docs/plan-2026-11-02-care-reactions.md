# Plan: care reactions, every button, 2026-11-02 (build plan)

**Status: PLAN, docs only (s2738, tier 0), revised by s2743 (tier 0) after the adversarial
review s2740.** Written from scout s2735's report
(`~/.local/state/crew/archive/hatch-at-home-s2735-20261102-1439/report.md`) and the
decisions of 2026-11-02 (section 1). Every `file:line` claim in the scout was re-read at
`origin/main` `73a3fb96`; section 2 lists the ones that were loose or wrong. Line numbers
are from `73a3fb96`; **names win over numbers**. Card code is `src/card/<part>.js`.
**Revision (s2743):** the review (`~/.local/state/crew/archive/hatch-at-home-s2740-20261102-1455/report.md`,
5 blockers B1-B5, should-fixes S1-S9, nits) was checked against the code at `origin/main`
`05ac0080` plus motion ship 1 (s2734, `f7bc429c`, which has since landed on `origin/main`). Every blocker held.
The fixes are in sections 4.2-4.5 (the answer path), 5.3 (tuck), 8, 10, 11 and 13; section 18
lists each finding and where it went. The owner's and first mate's decisions are unchanged.
Every player line here is **DRAFT** until the first mate approves it (decisions 2026-10-28,
"How the crew works"). Ships A-C and D's code are **tier 1** (card behaviour, no save
change, no server change); D's art and E are art jobs.

## 0. Summary

Every care button today answers the same way: the server replies, a prop (128 px art,
drawn 22% of the screen high, so about 50 px at a 300 px card) pops in at
a fixed spot (`left: 67%`), the pet changes frames **on the spot**, and 2.5-3.2 s later the
prop is cut out. Nothing travels, nothing is eaten, nothing is tucked. Scold gets **no**
pet reaction at all, the fan only a sway, and a **child** pet gets only the prop for feed
(20 of 30 species), snack (21 of 30) and blanket (27 of 30). Medicine and clean already
play as a rAF **care scene** (`_sceneStart`): that is the engine to generalise.

The goal (owner): **every care button causes a real pet reaction, never only a prop.**
Feed, snack, tuck in and touch are the richest. Motion first: ships A-C need **no art**.

| Ship | What | Size | Art | Tier |
|---|---|---|---|---|
| **A** | The floor: scold, fan, praise, wake, clean and meds touches, refusal variants, prop drop and leave, **the child fallback on the existing mood frames (this includes motion ship 1's skipped #10 child-stage care parity, section 7)** | S-M | none | 1 |
| **B** | Split in two (review nit): **B1** the engine registry (medicine and clean move into it unchanged), the answer path (4.3-4.5), then **feed** as a scene: anticipation at the tap, the commit gate, push-away on a refusal, variants, a stepped CSS clip for the bowl. **B2** **snack** on the same engine | L (B1 M-L, B2 S-M) | none | 1 |
| **C** | **Touch**: where you tap, the lean, escalation, saturation, asleep stir, egg | M | none | 1 |
| **D** | **Tuck in**: the shared blanket drape (9 images), the bedtime and wake scenes | M | **9** | 1 + art |
| **E** | Child `eat` and `pat` frames (100 images), owner-gated, last | S code | **100** | art |

Order: A, B1, B2, C (they need no art; **B and D wait for this revision**, which now makes the
answer path a design, not a reviewer's task), D (its art can start any time and run beside B;
its code ships with a no-drape fallback and needs B1's engine), E last. Nothing here changes a
stat, a rate, a saved field or the server.

## 1. Decided

### Owner, 2026-11-02

- **Every care button causes a real pet reaction, never only a prop.** Feed, snack, tuck in
  and touch are the richest.
- **Art level: motion first.** Ships A-C have no art. The **food shrinks by a stepped CSS
  clip** of the existing bowl art; half or empty art only for the species where the clip
  reads poorly on the bench. The **blanket is one shared drape, 9 images** (ship D). The
  **child eat and pat frames (100 images) come last** (ship E).

### First mate, 2026-11-02

- **Anticipation starts at the tap** when the card predicts a yes. A refusal turns it into
  a push-away.
- **Pats past 10 saturate** into a contented flop (not an annoyed turn-away).
- **A refusal turns the scene into a push-away** (not a hard stop).
- **The blanket shows on every device while the lights are out and the pet is asleep**
  (derived from existing state, no new data; was open question 3).
- **Someone else's care gets the floor path, not a scene** (was open question 4).
- Source for these three: the first mate's brief for s2743, 2026-11-02. Cited here, not
  restated as new decisions.

Everything else below is this plan's own call, flagged where it is a real choice, and
section 15 lists what is truly open.

## 2. What was checked against the code

The scout's table of the pipeline held. Corrections and additions:

| # | Scout / assumption | At `73a3fb96` |
|---|---|---|
| 1 | The engine is `card-actions.js:107-318` | It is `_sceneStart` (107) to `_sceneAnswered` (324-345). Names hold. |
| 2 | "Care scene: the action waits on the reply" | **No.** The scene runs on a fixed clock **from the tap**. `_sceneStart` holds every state but `sensor.last_care` (the `held` map), so nothing jumps; an **ok** answer only sets `sc.answered`; a **refusal** calls `_sceneEnd` (a hard stop) and `_react` then plays the refusal. Waiting on the reply is **new** (section 4.3). |
| 3 | Keyframes `startle`, `sulk`, `stretch`, `born`, `bighop`, `greethop` | They are **classes** over other keyframes: `.pet.sulk` = `shake`, `.stretch` and `.startle` = `perk`, `.born` = `pop`, `.greethop` = `hop` (`style.js:597-609, 1265-1270`). The keyframes are `perk`, `munch`, `settle`, `rock`, `pat-soft`, `hop`, `bighop`, `pop`, `shake`, `sway`. |
| 4 | The flip is a keyframe | `.pet.look { rotate: y 180deg }` over a `rotate .2s` **transition** (`style.js:780-781`). **s2734 kept it a transition** (review S1; the first draft said it made a `@keyframes`): it added `_wander(s, ms)` (`card-tick.js`), which adds `.look` with `wander-l`, and a `.2s` translate delay on `.pet.wander-l`, `.perch.wander-l`, `.pat.wander-l` and the ghost. Scenes flip with `.look` on a timer (section 4.9). |
| 5 | "Fan: the pet does nothing" | It **sways**: `.screen.breezy .pet { animation: sway .7s infinite }` for 2.6 s (`style.js:621`, `card-moment.js:570`). No frame change, no lean, and it overrides every other animation on the pet while it runs. |
| 6 | Bench needs `patTap` | `patTap: true` **exists** (`dev/bench/README.md`, one pat). It is extended, not added. `variant` is new. |
| 7 | The bowl clip depends on each bowl's art | The scout checked only the fox. All 29 `bowl_food.png` files were looked at (`renders/bowls-all30.png`; the seal borrows the otter's): **about a third are a heap above the rim** (the clip reads), **about half are flat dishes** (a clip cuts the dish, not the food), and a few are loose heaps with no bowl (nuts, shells, leaves). See 5.1. |
| 8 | `egg_wiggle_1/2` for "some" species | Exactly **7** of 30. The others keep `rock`. |
| 9 | Snack `spoiled`: "the catch, then smug" | Today `spoiled` is **not** `ok`: `_react` takes the refusal path, so a spoiled snack shows **no frame and no prop**, only its line. The scene must treat `spoiled` as eaten (5.2). |
| 10 | Lights out always puts the pet to bed | The server can **refuse a nap** (`not_sleepy`: daytime, energy >= 95, not near bedtime; `model.py` `_apply_lights`, which puts `lights_out` back off and logs a `lights_out` care entry). The dim comes from `switch.lights_out` through `_layout` (`card-layout.js:509-531`). |
| 11 | "A snack that excites loops `hop` for 10 s" | True but gated: only while `mood.state === "excited"` and under `BOUNCE_MS` (`card-layout.js:553-555`). Not every snack. |
| 12 | Tick is "700 ms" | `setInterval(..., 700)` (`card-base.js:131`). Anything that must land on a beat (a prop leaving) uses a timer, not the tick. |

Held up: the 30-species counts (`acts.eat/cheer/pat/refuse` for baby, teen, adult in all 30;
child `reactions` feed 10, snack 9, blanket 3, praise 22, scold 22, play 24, won 27), the
prop position and `pop`, `REACT_REFUSALS` without `unfair`, `_reactFrames` skipping the
child, `_patPose` skipping the child and the asleep, the pat box being one button over the
whole pet, `FEED_FULL_AT` 95 for both feed and snack (`model.py` `_do_action`), `tucked_in`
only for an evening, known person (`coordinator.py` `async_set_lights_out`), and the
`patTap`/`careAt` bench hooks.

s2734 (motion ship 1, `f7bc429c`) is **on `origin/main`** (merged while this revision was
written); section 11 states the overlap from its diff.

## 3. Today, in one table

(Detail and renders: the scout's report; `renders/sheet-*.png`.)

| Button | b/t/a today | Child today | Missing |
|---|---|---|---|
| feed ok | `eat` act + `munch`, bowl pops at 67%, full bowl cut at +2.5-3.2 s | species `reactions.feed` pose (10/30), else **prop only** | the pet never touches the bowl; the bowl never empties |
| feed full | `refuse` act + the `look` flip, "i'm full!" | the line only | already the best one; no bowl |
| snack ok | same as feed with the snack prop; the food is in the paws **and** on the floor | pose 9/30, else prop only | throw, catch, bite |
| lights out | dim crossfade, hard swap to asleep frames, a line | same | no pet motion, no blanket (s2734's `settle` is the first) |
| blanket chip | `cozy` frame + `settle`, folded blanket beside it | pose 3/30 | the blanket never covers the pet |
| pat | `acts.pat` 900 ms, `pat-soft`, a line (1 in 12 the sweet spot) | `pat-soft` + line only | tap position ignored; pat 2 = pat 20 |
| scold | the finger pops; **no pet reaction** | `reactions.scold` 22/30 | the pet |
| fan | `.breezy` sway for 2.6 s, thanks line | `reactions` none | frame, lean |
| praise | star on the floor beside, `cheer` + the type's move | 22/30 | the star should be above its head |
| clean / meds | scene (meds is the model; clean: the pet stands still as the broom passes through it) | scene | clean's pet beat |
| play | the picker opens, no beat | none | a beat before the picker |

Repeats word for word in **motion**: prop at 67%, `pop` .3 s, a 2.5 s window, the cut,
`munch` x 3, `settle`, `pat-soft`. Lines have fresh pools; motion has none.

## 4. The engine: one care scene for every button

### 4.1 From two scenes to a registry

`_sceneStart` and `_sceneRender` today branch on `kind` inside one body (medicine, else
clean). Ship B's first commit **refactors, changing no pixel**:

```
SCENES[kind] = {
  due(s, mood, stage)  -> variant | null    // the prediction (4.2)
  ms(variant)          -> total ms
  gate                 -> ms at which the answer is needed, or null (4.3)
  setup(s, sc, box, pet)                    // make the elements
  render(s, sc, t)                          // everything from one clock, t ms
  refuse(s, sc, result, t)                  // the refusal beat (4.4), optional
}
```

Medicine and clean move in as two entries with the same maths. **Proof it moved nothing:**
bench `care: medicine` and `care: clean` at `careAt` 0, 300, ... 2200 before and after
are **byte-identical** (the bench is deterministic). `SCENE_MS` (`lines.js`) becomes the
`ms` of each entry. The new entries live in a **new part `card-care.js`** after
`card-actions` in `manifest.txt` (one link in the extends chain; the next part's
`extends` changes to `HatchPetCardCare`, as AGENTS.md says a new part does). The shared
frame (held states, tap-to-skip, `sceneFade`, `sceneOwes`, the late answer) **stays in
`card-actions.js`**.

What every scene keeps from today: one clock (`_sceneRender(s, t)`); the held states; only
the slide on show plays; `calm()` means no scene (`sceneFade`). What changes by kind
(review B2): medicine and clean keep "a tap on the screen ends it" and "a second tap on the
same care ends it without sending again". **Feed, snack and lights keep neither** (4.3): their
second tap is **ignored** (the ring and haptic only), and the screen tap does nothing, so
the bowl is never left uneaten by a double tap. Each registry entry has `skippable`
(true for medicine and clean) and `playOwed` (true for feed, snack, lights; 4.5).

**The proof it moved nothing** is a **PNG hash** of each bench shot (`sha256` of the file),
before and after, on the bench's pinned clock. The bench pins `Math.random` (`mulberry32`,
seed 7 by default, `dev/bench/page.js`) and seeks the scene on its own clock; the refactor's
first step is to confirm `_sceneStart` takes its start from the seeked clock and not from a
bare `performance.now()` (if it does not, the bench pins it first, as its own commit). A hash
that differs is a failure of the refactor, not of the proof.

### 4.2 The prediction (`due`)

A scene starts **at the tap** only when the card predicts the server will say yes. All
inputs are states the card already holds, **read after `_press` has ended any running scene**
(`_sceneEnd` first, so `_state` is not held; review S9). Reading rules:

- Numbers come through `Number.parseFloat(state)` (a sensor can be `"94.99"`); **`NaN`,
  `unavailable`, `unknown` or a missing sensor: no scene**, today's path.
- No scene while a game, the status page, a link, the low-battery gag, an egg, `away`, asleep
  or `lightsOut` (today's `_sceneStart` guard), except tuck and wake, which are about exactly
  those. A **resting** pet (R1) is cared for as an awake one.
- `FEED_FULL_AT` is the server's `>=`: 95 itself is full, so `due` is `hunger < 95`.

| Kind | Starts when | Why it can be wrong |
|---|---|---|
| `feed`, `snack` | `sensor.hunger` < `FEED_FULL_AT` (95; `world.js:6`) | a stale state: the answer is `full` (4.4) |
| `lights` (tuck) | awake, not `lightsOut`, and `energy` < 95 **or** in the sleep window / the hour before bedtime (`sleepTimes`) | the server's nap rule is wider; the answer may be `not_sleepy` |
| `lights` (wake) | asleep or `lightsOut` | the card is a beat behind and the pet is already awake: the server does nothing (4.3b) |
| `blanket`, `fan` | the kind is in `mood.attributes.requests` (the chip is only up then) | the request lapsed: `not_needed` |
| `medicine` / `clean` | as today (`sick` flag / `poop` > 0) | as today |
| `praise` | always a **floor** reaction (4.6); `spoiled` is the same reaction (5.5) | none |
| `scold` | never a scene (4.6): its outcome (fair or unfair) is not known at the tap |

Unpredicted, the press is exactly today's: the perk, then the reply's reaction.

### 4.3 Anticipation at the tap, the gate, and the wait

Each beat before the **gate** is safe to play whatever the server says: it is the pet
noticing, and the prop arriving. The gate is the first beat that **commits** (the first
bite, the lie-down). If the reply has not come by the gate, the scene **holds**.

**The hold lives inside `_sceneRender(s, t)`** (review S5), so the bench can reach it. The
scene state is `sc.answerAt` (ms on the real clock since the tap, or `null`) and `sc.result`.
The scene's own clock is a pure function of those:

```
te = t < gate                 ? t                            // before the gate: real time
   : sc.answerAt == null      ? gate                         // holding: stuck at the gate
   :                            gate + max(0, t - max(sc.answerAt, gate))   // resumed
hold = t - gate while sc.answerAt == null;  at hold > 2000 -> the failure exit (4.5)
```

While `te == gate` with no answer the scene draws the **waiting loop**: the pet's own mood
frame swaying (`rotate` +-2deg, `steps(2)`, 600 ms period; written by `_sceneRender` on the
same clock, so no class animation), the prop sitting where it landed. `sc.answerAt` is set
by `_sceneAnswered` (and by the lights signal, 4.3b); the bench gets an **`answer` field**
(`{at, result}`) that sets the same two fields, so the gate, the hold, the 2 s limit and the
refusal beats are all bench-reachable.

The button's `.pending` pulse stays on (it is `_call`'s, unchanged).

Where the gates are: feed and snack 650 ms (the bowl has landed, the pet has looked); lights
400 ms (after the turn-round, before the lie-down). The local HA answers in roughly 50-300
ms (the scout's estimate; **not measured**: card-check logs the tap-to-`last_care` delta
once and fails over 650 ms on the local HA, section 13), so in practice the gate never holds
and the scene runs as one continuous beat from the tap. **Pass rule** for "continuous":
in the card-check run, the scene's `sc.answerAt` is at or before the gate.

**A second tap on the same care while its scene lives (feed, snack, lights) is ignored**
(review B2, the reviewer's recommendation, taken): `_press` calls `_tapped` (ring, haptic) and
returns before anything else, for `kind in {feed, snack, lights}` while `s.scene.kind` is
that kind. It does **not** `_sceneEnd` and sends nothing. This is the same outcome as
today's `_inflight` coalescing, so card-check's "a double tap on feed sends one press" stays
true. Medicine and clean keep today's second-tap-ends-it. The **screen tap** (`sc.stop`)
is not installed for feed, snack and lights: the pat box is hidden during a scene (`_patOn`),
so a child's tap on the pet during a meal is a no-op, not a skip.

A tap on a **different** care ends the running scene first (as `_press` does) and starts
its own; the owed answer of the ended one is handled by 4.5.

#### 4.3b The lights scene: its entry and its answer (review B1, B5)

The lights toy does not go through `_press`: `card-build.js` calls `_toggleLights`, which
calls `_call` directly. So the tuck and wake scenes get an entry that **mirrors `_press`**:

1. `_toggleLights(s)` works out `on` as now (`switch.lights_out` is `on` **or** `s.asleep`
   decides turn_off). **Ignored if a lights scene lives** (above).
2. It pushes `{action: "lights_out", pressedAt}` onto `s.pressed` (so a refusal's log entry
   is **mine**; the refusal logs `action: "lights_out"`, `by: None`, `result: "not_sleepy"`,
   `model.py` `LIGHTS_OUT`), then `_sceneStart(s, "lights")` (which ends any other scene
   first and runs `due`), then `_call`.
3. **Kind map:** one table, `SCENE_KIND_OF = {lights_out: "lights"}`, used by
   `_sceneAnswered`, the owe lookup and `_care`'s claiming. `lights_out` entries answer a
   `lights` scene; every other action answers its own kind.

**What "answered" means for lights.** An **ok writes no log entry** (`model.py`: only a
refusal logs), so the scene is answered by **state**, not by `_react`:

- `_call` resolving `true` marks `sc.called = performance.now()`.
- The scene reads the **live** (unheld) `this._hass.states` for `binary_sensor.asleep`
  each `hass` update and each tick of its own rAF. Tuck: live `asleep` going `on` sets
  `sc.answerAt` and `sc.result = "ok"`. Wake: live `asleep` going `off` does the same.
- A **refusal** is a `lights_out` log entry with `not_sleepy` (claimed as mine): it sets
  `sc.answerAt`, `sc.result = "not_sleepy"`, and the refuse beat plays (4.4).
- **No-change answer:** `sc.called` set and **600 ms later** the live state has not changed
  and no refusal came (an egg: the server returns ok with no sleep; an `away` pet; a pet
  already tucked; a wake on an already-awake pet, where `model.py` returns before it logs
  anything): the scene takes its **quiet exit** (the pet's own frame back, the light step
  undone, no line): the tap changed nothing, the card's picture was stale. It does not
  wait out the 2 s hold. A `false` from `_call` takes the failure exit (4.5).
- The `fell_asleep {how: "lights"}` moment is **not** the answer: it says only that someone
  tucked the pet, not that it was this tap. When a lights scene lives, `_moment` plays no
  sleep settle, no dim, and no sleep line for it (the scene plays its own sigh and the
  thanks line at the end); when none lives, the moment reaches the floor as today (4.9).
- The pending-pulse and `_inflight` stay per button: two quick lights taps send **one**
  call (card-check's existing check), now by the ignore rule as well.

### 4.4 A refusal turns the scene into a push-away

`_sceneAnswered` today ends the scene hard on any non-ok. The registry's optional
`refuse(s, sc, result, t)` replaces that: the scene **does not end**; it switches to its
refusal beat from where it is, then ends, and the REFUSALS line is said at the beat's
start (so the words and the gesture arrive together).

- **Feed or snack, `full`, before the gate:** the pet **sniffs** (lean toward the bowl,
  250 ms), the `refuse` act, the flip away (the existing refusal), the bowl **slides back
  out** (`steps(3)`, 300 ms). About 900 ms from the refusal. "i'm full!" is the existing line.
- **Feed or snack, `full` after the gate** (review B3: this **is** a normal case, not an
  impossible one. A partner's feed between the tap and the reply raises fullness, or a
  partner's ok claimed the answer first (4.5) and our own `full` follows): the bite in
  progress **finishes** (to its end, at most 400 ms), the pet stops with the food partly
  eaten (the clip stays where it is), then the same push-away: the `refuse` act, the flip,
  "i'm full!", the bowl slides out **with what is left on it**. A `full` after the scene has
  **ended** (the owe was consumed or the window passed) is a normal floor refusal.
- **Tuck, `not_sleepy`:** the turn-round already under way becomes a head shake (two flips),
  then a hop (`excited` frame): "not sleepy yet" (existing line). The lie-down, the drape
  and the dim are all after the gate, and the lights scene commits there **only on a live
  `asleep`** (4.3b), so a `not_sleepy` always arrives with nothing to undo. (A refusal that
  arrives after the 2 s failure exit is a late owe: 4.5.)
- **Blanket or fan, `not_needed`:** the prop slides out, the `refuse` act, the flip.
- **Snack, praise or play, `spoiled`** (the effect is applied, then a fake call is spoiled): not a refusal. Snack is **eaten** as
  ok, then a smug beat: a small wiggle (two `rock`s) and the existing "hehe, whining works"
  line. Praise and play: 5.5.

### 4.5 The answer: who answers a scene, the owes, failure, someone else's care

**The scene is answered per entry, not per update** (review B3). Today `_care` hands only the
**newest** fresh entry to `_react`, so a feed and a partner's praise in one update drop
the feed. The change, in `_care`:

1. The claim loop `_care` already runs (each fresh entry uses up one matching press) now
   records **which entries** were claimed (a `Set`), not one `mine` boolean, and compares
   by **kind** (through `SCENE_KIND_OF`).
2. Before the newest-entry logic, `_care` offers **every** fresh entry, newest first, to
   `_sceneTake(s, entry, claimed)`. It takes an entry when (a) a live scene has that kind
   **and** the entry was claimed as the viewer's own, or (b) an **owe** for that kind is
   alive and the entry was claimed. An entry taken this way is removed from `fresh`.
3. What is left of `fresh` goes through today's logic (the newest, the combined line). While
   a scene lives, that remainder is played **line only** (`_react(..., {busy: true})`: no
   pose, no prop; the pet is busy being fed).

**An unclaimed entry of a live scene's kind does not answer it** (a partner's feed ok, a
second card on the same pet). Claiming is still **by arrival**, as today (the server does
not name who pressed: a change the plan forbids), so the known limit stays: a partner's
`ok` that arrives inside `MINE_MATCH_MS` of my press, with my press still unclaimed, claims
it and my own reply is then "not mine". The worst case is that the partner's ok answers my
scene and mine arrives after: for feed that is "ok, then (probably) `full`", which 4.4
defines. The cost is a late push-away, not a lost reaction.

**The owes are a list.** `s.sceneOwes` becomes `s.sceneOwes = [{kind, until, playOwed}]`
(`until` = 10 s). Two presses on two cares (feed, then medicine) leave two owes and each
reply consumes the one of its **kind**; a medicine reply cannot swallow a feed owe. An owe is
made when a scene ends without an answer (a different care's tap, a slide change, the
2 s hold running out, a swipe).

- **`playOwed` false** (medicine, clean, today's meaning): an owed `ok` is swallowed; the
  scene showed it.
- **`playOwed` true** (feed, snack, lights; review B2): an owed `ok` **plays the floor path**:
  the pose, the prop (drop and leave, section 6) and the line (the meal line "yum",
  the thanks line). Never a prop alone. This covers a tap on another care, a swipe, and the
  2 s failure exit's `late` case below. A `lights` owe is answered by the live state, not a
  log entry (the quiet or the settle: 4.9).

**Failure and the late answer:**

- **`_call` returns false** (network, `unavailable`): `_press` already has the
  `.then((ok) => ...)`. Add `if (ok === false) this._sceneFail(s)` (and the same in
  `_toggleLights`): the scene takes its exit beat (the prop slides out, 400 ms, the pet's
  frame goes back) and `_call`'s own "hmm, that didn't work" stays in the bubble.
- **No answer by the end of the 2 s hold:** the same exit, and an owe is left with
  `late: true`. A reply within 10 s plays the floor path (the pose and the prop,
  section 6) whatever `playOwed` says: the viewer saw the scene give up, so the news must
  show.
- **A `full` and an `ok` for one feed** (a double answer): the scene takes the first; the
  second finds neither a scene nor an owe and is today's floor reaction.
- **Someone else's care** (no tap here, no claimed press): **no scene**. It plays the
  A-floor path (the pose, a dropped and departing prop, section 6). The viewer's own press
  is the rich one. (A short scene from the reply is possible later; it is not planned.)
- **An off-show slide**, a shelf peek, the catch-up after a hidden tab: the line and the
  final frame, as today. Only the slide on show plays a scene.

### 4.6 What the engine does not do

- **Scold, praise, fan-after-the-fact, wake-as-news** are not tap-predicted scenes. They are
  the floor (5.5): a reaction at the reply made of `_reactFrames` plus CSS.
  (`fan` and `blanket` **are** predicted from `requests`, section 5.3, and get a short scene.)
- **No scene while a scene is running** for the same slide: a different care's tap ends the
  running scene first (`_press` already does).

### 4.7 Variants: the no-repeat pick

`_careVariant(s, kind, pool)` picks from the pool with the card's existing no-repeat idiom
(`s.lastPick["care:<kind>"]`, the same store `PAT_SPOT` uses), so no variant plays twice in
a row. Some variants are **conditional** (feed variant C is chosen by hunger, not random);
conditional ones are filtered out of the pool, then the pick runs. The bench's `variant`
field (section 13) pins the pick.

### 4.8 The species hooks (the nature plan)

`plan-2026-11-02-species-nature.md` section 8a offers: `nature(s)` and `paceOf(s)`
(`lines.js`), `_natureLine(s, key)` with two more keys, **`tuck` and `pat`**, and the habit's
move (`munch`, `settle`, `rock`, `perk`, `look`, `wander`). This plan uses them **only
through a null-safe wrapper**:

- `paceOf(s)` scales a **beat length** (a slow pet lingers, a quick one is brisk), **+-20% at
  most**, never the total over 3.2 s, never the gate. Timing only.
- `nature(s)?.habit` picks a **variant** or a **gesture** (hoarder: variant C and a carry-off;
  watcher or basker: variant D; performer: a hop between bites).
- `nature(s)?.clock` picks a tuck or wake **mood** (a night creature is reluctant at bedtime
  and groggy at wake).
- With **no nature block** (N1 not landed, a new species) every hook is a no-op and the
  scene plays its default. **Ships A-E do not wait for N1-N3**; the hooks are listed in each
  interaction so N1's builder and ours do not collide (section 11).

### 4.9 Rules the scenes share: the flip, the lean, the held states, the dim, the settle

These answer review B4, S2 and S3. They bind every scene entry.

**The flip and the lean (S1, S2).** The flip is s2734's: `.pet.look { rotate: y 180deg }`
over `rotate .2s ease-out`. A scene turns the pet by `classList.toggle("look")` at a beat
(two flips = on at one beat, off at the next; each takes .2 s), and `_sceneEnd` **removes
`.look`** along with the inline `translate`, `rotate` and `transition` it already clears (a
class the scene added must not outlive it). It does not use `_wander`/`wander-*`: those carry
s2734's .2 s translate delay (and a `.look` of their own), which would offset an approach
step; the scene writes `translate` inline on its clock, as the medicine scene does.

`rotate` is **one property**, so the flip and a lean cannot both be on. The rule: **a flip
wins over a lean, per beat.** The beat tables never overlap them: a lean is written only
while `.look` is off, and a lean beat that would fall inside a flip is dropped (tuck's 0-250 ms
yawn tilt ends at 100 ms where the first flip begins, and feed variant B's lean comes only
after the flip back). A lean inside a scene is **written per frame by `_sceneRender(s, t)`**
with the inline `transition` cleared (as the engine already does), so "150 ms in, 300 ms out"
is the scene's own curve, not the CSS `ease-out`. The pat lean outside a scene (5.4) is a
class with its own transition and is **skipped while `.look` or any `wander-*` is on the
pet**. No scene uses `transform` for a tilt (`munch`, `breathe`, `perk` own it).

**Held states, the dim and the settle (B4).** While a scene lives, `_state` returns the
**held** value for every id but `sensor.last_care`, so `_layout` sees an awake pet with the
lights off all through a lights scene. That is what keeps every other scene from jumping,
and for the lights scene it needs three explicit rules, none optional:

1. **The scene owns the dim.** While `s.scene?.kind === "lights"`, `_layout` **skips** the
   background block (the `bg` swap, the `faded`, `night` and `dim` toggles; `card-layout.js`
   near `if (asleep || lightsOut) scene = "dim"`). Without this the reply's own `_layout`
   pass would take the dim away. The dim is **not one filter**: all 30 species have their
   own `backgrounds.dim` art, so it is a `bg` image swap plus the `.screen.dim .bg` filter.
   "Three steps" is therefore: two steps of a black `.scene-dusk` layer over the bg only
   (opacity .15, .3, `steps(1)` each), then on the third the real swap to the `dim` art
   (the `dim` class on, the layer off in the same frame). The bench acceptance: the frame
   just after the third step differs from the plain `dim` end state by **no more than 2% of
   pixels** (the layer's last opacity is tuned to the filter). All lcd/mono settings behave
   the same: the steps are the scene's, not the `lcd-on` ghost's.
2. **The scene owns the sleep transition**, so s2734's settle cannot double up. s2734's
   `_layout` plays `settle` for 2.5 s when `asleep` goes false -> true and
   `s.wasAsleep === false`. During the scene `asleep` is held false, so the first draft's
   guard `if (s.scene) return` was a no-op, and at `_sceneEnd` (`s.scene = null` then
   `_redraw`) `_layout` would see the change and play a **second** settle 2.5 s after the
   scene's own sigh. The rule: **at the lie-down beat (after the live `asleep` answer) the
   scene writes `s.wasAsleep = true`; a wake scene writes `s.wasAsleep = false` at its
   pose.** The `_layout` pass at the end then sees no change. The scene's own lie-down dip and
   sigh are the settle. (A tuck from `fell_asleep {how: "lights"}` with **no** live scene
   plays s2734's settle as it ships; the `collapsed` and `house` sleeps too.)
3. **Lifting the hold at the end is one `_redraw`.** `_sceneEnd` sets `s.scene = null`,
   then `_redraw`. The live `asleep` is true, the dim class is already on (the scene set it
   at step 3), the drape state is on (5.3), so the redraw changes nothing the viewer sees.

Two consequences to state, not fix: the **lights button's label** and the `wanted` chip
(`card-layout.js`) stay "sleep" for the whole scene (held), and a **partner's tuck**
arriving while this card holds a scene of **another** kind shows its drape and dim only when
that scene ends (at most 2.75 s later). Both are accepted.

**A resting pet (R1, S3).** `.pet.resting` runs `breathe 4.5s` and `.awaylabel` ("resting
☁") sits at `bottom: 5%` across the width (`style.js`, `restLabel` in `ui-copy.js`). So:
(a) a scene's motion is inline `translate`/`rotate`/`scale` on its clock, which does not
replace the `animation`, so `breathe` keeps running through a scene; the **floor** classes
(`munch`, `settle`, `rock`, `perk`) do replace it, and `breathe` restarts at phase 0 on
removal. Accepted, if the bench's resting row shows no visible snap (its pass rule: the pet
frame at removal is within 1 px of the frame before); if it does, the floor path adds
`animation-delay` to put `breathe` on its phase. (b) The label **hides while a scene lives or
a care prop is up** (it would lie under the bowl at `bottom: 7%` and the drape's edge), and
`restLabel` also hides it for `asleep`, which a tuck scene holds false: the scene hides it
at the lie-down beat. (c) **The bench contact sheet and B's, C's and D's acceptance each
get a resting row** (one adult, resting flag on).

**The tuck's other tell:** `calm()` is read live; switching the OS setting mid-scene does not
stop the running rAF (the same as today). Not worth a change.

## 5. The four rich interactions

All times are ms **from the tap**. "Anticipation" is the part that plays whatever the
server will say. Perk, ring, haptic and `.pending` at 0 stay exactly as `_tapped` does them.

### 5.1 Feed: "the bowl arrives, it eats in bites, the bowl goes" (about 2.75 s)

| Beat | ms | What |
|---|---|---|
| tap | 0 | `_tapped` as today (press, ring, haptic, `perk` 300 ms) |
| look | 0-300 | the pet looks toward the pad: a lean `rotate -4deg` written by the scene (4.9; no `.look` on), its `hungry` mood frame if the species has it |
| arrival | 100-450 | **the bowl drops in** from above the screen to 67%: a `steps(4)` fall, one frame of landing squash (`scaleY .8 -> 1`), two dust pixels |
| notice, approach | 450-650 | the `excited` frame; the pet **steps toward the bowl** (the medicine scene's `step` maths: its front, 72% across the frame, to the bowl's middle) |
| **gate** | 650 | needs the answer (4.3) |
| bite 1 | 650-1050 | 0-120: `eat_1` and a lean `rotate 4deg`; 120-400: `eat_2` and `munch`'s squash. The food steps to **two thirds** (the clip, below). 2-3 crumbs hop out (CSS pixels in the food's colour, a 300 ms arc, fade) |
| bite 2 | 1050-1450 | the same; food to **one third** |
| bite 3 | 1450-1850 | the same; the food is **nearly gone** |
| satisfied | 1850-2350 | the pet steps back; `content` frame; one slow `settle` breath; 1 in 4: a small heart (`_bondHearts`), a lick (an `eat_1` flash), or, when heavy, the burp line |
| bowl leaves | 2350-2750 | the bowl slides off right, `steps(3)`, with what is left on it (no empty-bowl art: it **leaves**, it is never shown empty); the line types meanwhile |

Today's total, from the tap to the cut, is about 2.5 s plus the round trip plus up to
700 ms of tick. This is **about the same total**, with no dead air and no cut.

**At a 300 px card** (review nit; the layout worked through): the bowl is `height: 22%` of
the 4:3 screen (about 50 px) at `left: 67%`, so about 17% wide, spanning 67-84%. The pet's
front (72% of its box) is at about 60% of the screen and the bowl's middle at about 75%, so
the approach step is about 15% of the width (45 px). The second poop sits at `right: 7%`
(about 82-93%) and overlaps the bowl's right edge by a few px, and the slide-off passes
over it. Decision: **poops are not moved**; the bowl draws above them (z-order), and the
bench's 300 px shot with two poops is part of B1's acceptance.

**Variants** (no-repeat, 4.7):

- **A: drop-in** (above).
- **B: slide-in from the left edge.** The bowl comes in at `steps(5)`; the pet **flips first**
  (`.look` on a timer, 4.9), walks, flips back (`.look` off), then leans and eats: the lean
  beat starts only after the flip back. +300 ms.
- **C: gobble.** Four bites at 250 ms. **Conditional:** `hunger` < 30. Rolled in only then.
- **D: savour.** Two bites, a look up at you (the `excited` frame held 400 ms with a tilt),
  a last bite. 

**The food shrinking: the stepped CSS clip.** The scene draws the bowl in its own element,
and each bite sets its `clip-path: inset(<cut> 0 0 0)` to a step (a **stepped** change, no
tween: LCD style). `<cut>` runs from 0 to a fraction of the sprite height where the rim
sits. This **reads on the heaped bowls** (the food stands above the rim) and **reads badly** on
the flat dishes (a cut takes the dish, not the food), and does nothing for loose heaps with no
bowl. The scout's estimate was "about a third heaped, about half flat" from a 30-species sheet
that is **not in the branch**, so those fractions are **unverified**: the sheet below is the
measurement. **"Reads" has a pass rule** (review S5), computed by the bench sheet script from the
sprite: each of the 3 steps removes at least **8%** of the sprite's opaque pixels, and every
row **below** `bowl_rim` is pixel-identical to the full bowl. A species that fails it has no
`bowl_rim`. So:

- **One optional number per species**, in `species.json` beside `props` (never after `acts`,
  the line the open art branches rewrite in all 30 files; the nature plan's N4 note): the rim
  line as a fraction of the sprite height, e.g. `"bowl_rim": 0.45`. **No number: no shrink**
  for that species; it eats, and the bowl leaves whole (the bites and crumbs still play).
- **Ship B's first deliverable is the 30-species bench sheet** (every bowl at full, 2/3, 1/3,
  mid-bite, at 330 and 420, day and night). The first mate reads it and the list of species
  that read poorly. **Only those** get `bowl_half` art (30 at most; the empty bowl is never
  shown, so no `bowl_empty`), as a follow-up art job, if the owner wants it (section 15).

**Hooks:**

- **Time** (`mealPart`, `world.js`): breakfast opens on 300 ms of the `sleepy` frame; supper
  ends on a yawn and a longer settle.
- **World:** a water world (`world.mess === "murk"`): the food **sinks** instead of dropping
  (a slow `steps(6)` wobble down), the bowl drifts out; the crumbs rise as bubbles.
  Nightsky: a twinkle on landing. The season's snack prop may stand in for the bowl food
  where one exists (the existing `candy` lookup).
- **Nature:** hoarder = variant C and a piece carried off behind it (`_natureLine(s,
  "feed")` empty in N2, so its own line); watcher and basker = variant D; performer = a small
  hop between bites; `paceOf` scales the bite length.

**Child:** the species' own feed pose where it has one (10 of 30; the cache **carries it
off**), else the **fallback ladder** (section 7): the `excited` child frames with the same
lean and `munch` (CSS on the pet, no new art), until ship E's `child_eat` frames.

### 5.2 Snack: "tossed and caught" (about 1.9 s)

| Beat | ms | What |
|---|---|---|
| tap | 0 | `_tapped` as today |
| watch | 0-300 | the pet watches the pad (a tilt toward the bottom-left, the player's side) |
| toss | 100-550 | the snack flies from the bottom-left edge in an arc (a rAF parabola, about 1.5 turns of rotation) to the pet's mouth height |
| **gate** | 650 | |
| catch | 550-700 | a small hop up (`hop`'s .05), `eat_1` on contact, the snack **hidden** in the mouth or paws (the fox's eat art already holds the item) |
| chew | 700-1300 | `eat_2`/`eat_1` x 2 at 300 ms with the squash |
| delight | 1300-1750 | the `cheer` act, one `greethop`, 1-2 hearts |
| settle | 1750-1950 | back to rest |

**The excited loop is spent here:** the snack's `excited` mood turns on the infinite
`hop` for up to 10 s (item 11 above). During and after the scene the loop is replaced by
the **one `greethop`** in "delight": `s.excitedSince` is set so the `hop` class stays off
for a snack-excited pet. (A pet excited for another reason keeps the loop.)

**Variants:** **A** catch; **B** a miss: the snack bounces once on the floor and the pet
pounces (`hop` toward it; picked for bouncy types); **C** savour: it lands in front, three
nibbles, each takes a round **bite mask** (`mask-image` with a radial gradient) out of the
snack (no art; a `snack_bite` per species only if the mask reads badly on the bench);
**D** stash: the hoarder's cheeks (the child `cheeks` and `cache` poses exist for the
child; b/t/a use the `eat` frames and a puffed-cheek squash).

**Hooks:** `favourite_snack` day: `bighop` and the sparkle, both exist. Season candy: the
same throw with the candy art. Heavy: a `look` at the snack (400 ms) before it eats, and
the existing heavy line. `spoiled`: 4.4. `chore_treat` (an automation, nobody tapped): the
snack **drops in from the top**, no throw, as the floor path (4.5). Nature: a hoarder
stashes (variant D); `paceOf` scales the chew.

**Child:** as 5.1.

### 5.3 Tuck in: "turn round, lie down, the blanket, the lights dim, a sigh" (about 2.4 s)

**Two things sit under "tuck".** (a) The **lights toy** (`_toggleLights`, `switch.lights_out`)
puts the pet to bed or wakes it; there is **no care-log entry** for an ok (`last_care` is not
written; a refusal logs `lights_out` / `not_sleepy`). The scene is started by the **tap**
through `_toggleLights` (it does not go through `_press`), and answered by the live
`binary_sensor.asleep` or the `lights_out` refusal entry: **the whole entry and answer path
is 4.3b**, not the `fell_asleep` moment. (b) The **blanket request chip**, a daytime ask
when the pet is chilly (a normal `_press` care, kind `blanket`). Both get a reaction,
(a) the full scene, (b) a short one.

**(a) Lights out, the pet awake** (the prediction in 4.2):

| Beat | ms | What |
|---|---|---|
| tap | 0 | `_tapped`; the toy clicks (its existing chirp) |
| yawn | 0-100 | the `sleepy` frame; a tilt (`rotate 4deg`), ending where the flip begins (4.9: flip over lean) |
| turn round | 100-400 | the circle before lying down: two paper flips (`.look` on at 100, off at 250; each .2 s, s2734's flip, 4.9) |
| **gate** | 400 | needs the live `asleep` (4.3b) |
| lie down | 400-700 | swap to the asleep frame **at the bottom of a `settle` dip** (the swap hides in the squash); the scene writes `s.wasAsleep = true` here (4.9) so s2734's settle does not run a second time |
| blanket | 500-1000 | **the drape falls** from the top over the lower body: shared art, 3 frames, `steps(3)` (ship D; before it lands, this beat is skipped) |
| tuck | 1000-1200 | two small press-ins on the blanket edge (`scaleY .97`, `steps(2)`) |
| lights | 1200-1800 | **the dim in three steps** (two dusk-layer steps, then the swap to the `dim` art; mechanism and tolerance in 4.9) in place of the .6 s fade. `_layout` skips the bg block for the scene's life |
| sigh | 1800-2400 | one slow breath (scale 1, 1.02, 1; 600 ms); the thanks line types |

- **The blanket is state, not a prop.** It shows whenever the pet is **asleep and `lightsOut`
  is on** (both already in `_layout`), on every device and after a reload, with **no new
  server data and no saved field**. A pet that fell asleep by itself at bedtime, with the
  lights not out, has no blanket (nobody put it to bed). The scene only animates the
  **arrival**; a pet already tucked when the card opens shows the final drape frame.
  (The evening/known-person rule stays what it is: it gates the **thanks line**, not the
  blanket.) Decided (section 1).
- **During a lights scene** `_layout` reads the held (awake) state, so the drape is the
  **scene's own element** (`sc.els`). At `_sceneEnd` the state drape (live `asleep` and
  `lightsOut`) appears in the same frame at the same final frame and position, so the hand-over
  shows nothing; a wake scene does the reverse. The bench's `care: lights` sheet at
  `careAt` = scene end checks this by a pixel compare against the state drape (<= 2%).
- **What the others see** (review S8): a tuck seen live on a card that did not tap it (a
  second device, a partner) has no scene; the drape arrives by its **own short fall**, the
  three drape frames at `steps(3)` over 450 ms on the `_layout` pass where `asleep` and
  `lightsOut` both turn on, and the dim is today's .6 s fade. The same pass plays s2734's
  settle. Under `calm()` the drape is simply on. A wake seen live: the drape slides off in
  two steps (the wake scene's beat, without the pet's blink).
- **Wake** (`lights` on; `woke_up {how: "lights"}`, which has **no reaction today**, only the
  morning one stretches): the light comes up in three steps (the same layer, reversed); the
  pet blinks (`asleep`, `sleepy`, `asleep`, `sleepy` at 150 ms); the blanket **slides off in
  two steps**; `stretch`; the content frame. About 1.6 s. **Gate at 300 ms** (before the
  light comes up), answered by the live `asleep` going off (4.3b). Its entry is the same
  `_toggleLights`: the branch `on = lights_out is on || s.asleep` sends `turn_off`.
  `s.wasAsleep = false` is written at the blink.
- **The wake that changes nothing** (review B5): the card thought the pet asleep and it was
  already awake (woken a beat before), so `turn_off` is a no-op in the model (no log entry,
  no moment). That is 4.3b's **no-change answer**: 600 ms after the call resolves, the quiet
  exit. The wake scene does not hold for the full 2 s and does not fail.
- **Not evening, a nap:** the same scene (a nap is a tuck too).
- **`not_sleepy`:** 4.4.
- **Egg, away, already tucked:** no tuck scene is predicted for an egg or an away pet. A
  stale card state can still start one; the server returns ok and sleeps nothing, and that is
  the same no-change answer (the egg and away cases need no extra code).
- **The pet already asleep** when a tap lands (the card is a beat behind): the wake scene.

**(b) The blanket chip:** the request is in `requests`, so it is predicted. A short scene
(about 1.3 s): the drape falls over its **back as a shawl** (the same art, the final frame
only), a `shiver` stops (`_layout` toggles it off at the reply; the scene shows it
stopping), the `cozy` frame, `settle`, two warm hearts. It stays while the pet is `cozy`
(the request is answered: `cozy_until`), then slides off.

**Variants** (no-repeat): **A** curl; **B** peek (after the sigh, the `sleepy` frame for
400 ms, then back under); **C** wiggle-in (two `rock`s under the blanket before the sigh);
**D** species (the bat hangs and wing-wraps, the otter kelp-wraps, the kitten loafs: the
**existing child poses**, so child only; others use A). **Hooks:** a night creature
(`nature.clock === "night"`) gives a reluctant `look` before it settles; `paceOf` scales
the sigh.

**No-drape fallback** (D's code ships before D's art): the scene runs without the blanket
and tuck beats, exactly the "no blanket" case, so the code is never blocked on art.

### 5.4 Touch: "where you tap matters, it leans in, it escalates, then it saturates"

The pat box is `.screen .pat`, a button over the whole pet (62% high, 46.5% wide). Today the
tap point is ignored and every pat is the same (`_pat`: card only, nothing sent).

**Zones.** From `e.clientX/Y` against `s.pat.getBoundingClientRect()` **read at the tap**
(the box moves with the pet, `wander` and the scene's step, so never a rect kept from
earlier): the top **40%** is **head**, the rest **body**; left or right of the middle is the
**lean side**. A keyboard pat (`e.detail === 0`) counts as head, no side. **So does any
event without finite `clientX`/`clientY`** (the bench's `patTap` calls `_pat` with
`{stopPropagation(){}, detail: 0}`, and some card-check calls pass only `detail: 0` or no
`detail`): the zone maths must return head, no side, never `NaN`. The 40% is a default; the bench's
`patBox` outline checks it per shape and a species may carry a `head` fraction later (not
planned).

**The lean:** `rotate +-5deg` about the feet (the pet's `transform-origin` is already
`50% 100%`), held while pats keep coming (released 900 ms after the last). It is a class
pair (`.lean-l`, `.lean-r`) with its **own** `transition: rotate .15s ease-out` in, and
`.3s` out (set on release), not the pet's `rotate .2s`. `rotate` is one property (4.9), so
**no lean while `.look` or any `wander-*` is on the pet**; a lean already on when `.look` is
added by s2734's idle `_look` or a wander is dropped for that beat.

**Escalation:** a run is the pats within **5 s** of each other (`s.patRun = {n, at, quietUntil}`;
a new run after 5 s idle, a slide change, or a scene).

| n | Head | Body |
|---|---|---|
| 1 | `acts.pat` 900 ms, the lean, today's line | a wiggle (two `rock`s, +-3deg) |
| 2-3 | a longer lean; on the 3rd a heart | the wiggle; on the 3rd the `excited` frame and a giggle line (**ticklish**) |
| 4-6 | the **habit move**: b/t/a the `cheer` act plus the type's move (`_praiseMove`); child the existing extras where the species has them (the kitten's knead, the corgi's sploot) | the same |
| 7-9 | **purr**: the `pat` act held (eyes closed), a slow breathing `settle`, no new moves | same |
| 10 | one "ok ok ♥" and a **contented flop** (`cozy` frame, `settle` 2.5 s) | same |
| 11+ | for **8 s** (`quietUntil`): `pat-soft` only, the `cozy` frame kept, no line, no haptic escalation | same |

Never annoyed: no frown, no turn-away (the first mate's call). The 4 s line cooldown
(`PAT_COOLDOWN_MS`) and `_patMayTalk` stay as they are; the new lines go through them.

**The edges of the run (review S7):**

- **Saturation ends the run.** At n = 10 the flop plays and `s.patRun` becomes
  `{n: 11, quietUntil: now + 8000}`. Pats during the quiet **do not extend it** and do not
  count. The first pat after `quietUntil` starts a **new run at n = 1**, whatever the 5 s
  window says. So a user tapping every 2 s sees: ten pats, a flop, 8 s of `pat-soft`, then
  the ladder again from the top; never a loop of flops.
- **A run is also bounded in time:** it ends 30 s after its first pat, or 5 s after its last,
  whichever is first. "n" is therefore a burst count, not a counter that ten slow pats over a
  minute can reach.
- **`PAT_SPOT`** (1 in 12, `greethop` and hearts, `card-tick.js`) keeps firing for **n <= 3**
  only; from n = 4 the habit move and the purr own the beat (the sweet spot would be a
  second, louder surprise inside a ladder that is already building). A sweet spot does
  not count for or reset n.
- **Where the escalation hooks in** (`_pat`): the run's `n` is counted at the top of `_pat`
  for **every** pat, before the cooldown and `reacting` (`poseUntil > now`) checks. The
  table's **moves, hearts and poses** run in both branches (the line branch and the cooldown
  branch, where `_tapped(s.pat)` and the move already are); only the **lines** go through
  the 4 s cooldown, so most pats of a run show a move and few say a line. While `reacting`
  suppresses moves, the pat still counts toward n and the next un-suppressed pat plays the
  step it has reached.
- **`s.patRun` is reset by card-check's `patReset`** (section 13), and by a slide change or a
  scene (as listed above), or the section's pats accumulate to n >= 10 within 5 s of
  each other and later checks expecting a line get `pat-soft` only.

**Other states:**

- **Asleep:** `pat-slow` as today; the 3rd pat: it **stirs** (the `sleepy` mood frame 500 ms,
  a small turn) and stays asleep; "mm..." 1 in 4.
- **Egg:** `rock` as today; the 3rd pat a **double rock** (s2734 added `.pet.rock2`, a
  double rock, for the cracking egg: use it, no new class); in the **7** species that have
  `egg_wiggle_1/2`, those frames play instead (they are drawn and unused). s2734's idle
  `_eggWobble` stays apart from a pat: it is silent while `poseUntil` or `movingUntil` is
  live, and the pat guards on `s.egg`, as today.
- **Sick:** a slower lean (+50% in, +50% out) and "thanks... ♥" in place of the mood line.
- **Nature:** a `solo` company waits 400 ms (`look`) before it leans in; a groomer grooms
  after the 7th (a `rock` and an N2 `pat` line); a performer hums a tune at the flop.
- **Calm:** the pose and the line only (section 9).

**Child:** no `acts.pat` at child, so heads and bodies use the lean and the wiggle on the
child frame (CSS), and the 4-6 step is the species' extras; **child_pat** frames are ship E.

### 5.5 The floor: every other button

"Never only a prop." Sequence = anticipation, action, follow-through, settle. All of these
are **ship A**, a reaction at the reply (no scene) made of `_reactFrames` kinds, an
existing move and one new CSS class. **No new art.**

| Button | What happens | Notes |
|---|---|---|
| **praise** | perk; the star rises **from above its head** (a new `prop-rise` keyframe, modelled on `fl-float`, not the floor spot); the `cheer` act and the type's move (exists); a blush (`excited` frame) and 1-2 hearts | variants (no-repeat): hearts; a spin (adult); the child pose (22/30). **`spoiled`** (praising a fake call; `model.py` returns `spoiled` and the pet learns to whine): the **same reaction as ok, without the hearts**, then the smug beat of 4.4 (two `rock`s) and the existing "whining works" line. It is a reaction, so `spoiled` leaves the "does nothing" list for praise, snack and play |
| **scold** (fair, a fake call) | the pet looks up; the finger **wags** above it (`rotate +-12deg`, `steps(2)` x 3); a **flinch** (`startle`) with the `refuse` act; `sulk`; the `bored` frame 1.2 s, then rest. "ok... sorry" is the existing later moment | new kind `scolded` in `REACTIONS` and `STAGE_POSES` (`refuse` act) |
| **scold** (unfair) | the finger wags; the pet **turns away** (the `refuse` act and the `look` flip, a "huh?"); "hey, i didn't do anything!" is the existing line | **add `unfair` to `REACT_REFUSALS`** (`ui-copy.js:430`); today it has no frame |
| **fan** | the fan **slides in** (not pops); the breeze crosses (exists); the pet **leans into it** (`skewX -4deg`), the `cozy` frame (eyes closed), a `shiver` or `dance` class stops; "ahh" line; the fan slides out. **Replaces** the infinite `sway` | new kind `aired`. Predicted from `requests`, so it can use the short scene shape of 5.3(b) later; the floor path is enough |
| **wake** (lights on) | 5.3 | the one place that reuses the scene |
| **clean** (due) | the existing scene, plus: the pet **hops over the broom** as it passes its x (the medicine scene's hop maths), then shakes off (a 2-step `rock`) and cheers at 1.8 s. Water worlds: the pet bobs on the net's wake | a render tweak inside the registry entry |
| **clean** (not due) | the `refuse` act and the flip (exists); variant: a look at the floor (a `look` flip there and back) | refusal variants below |
| **meds** | already rich; add a variant where the pet **sniffs first** (a lean, 300 ms) before it takes it | |
| **meds** (not sick) | the refusal, as above | |
| **lights** | 5.3 | |
| **play** | a **beat before the picker**: the species' `play` prop (the ball) bounces in from the pad, the pet bats it (perk and a lean), 600 ms, then the picker opens. The `ready` act is in **no** species.json, so a game start plays `cheer` instead. **`spoiled`** (`model.py` applies the play, then spoils a fake call, as praise does): the ball beat plays as for ok, followed by the smug beat of 4.4 and the existing line | the picker must not wait on the beat: it opens at the tap's end, the beat plays over its fade |
| **refusals** (`full`, `not_needed`, `already_clean`, `not_sick`, `not_sleepy`, `too_tired`) | today: the `refuse` act and the flip. Add **variants** (no-repeat): a **head shake** (two flips); a **yawn** for `not_sleepy` (then an `excited` hop); a **flop** for `too_tired` (a `settle`) | `REACTIONS.refused` becomes a small pool |

Out of scope: lay-an-egg, the name sheet and the shell change (not care buttons; the
scout's ideas for them are in its report, not planned here).

## 6. The prop and the pose end, for every care

The floor changes how a prop **arrives and leaves** for **every**
care, scene or not: it **drops** from above (`steps(4)`, a 1-frame squash; replacing
`pop`) and **leaves in two steps** (a `prop-out` class, 300 ms, set by a **timer** at
`propUntil` minus 300 ms from `_react`, not by the 700 ms tick). The pose ends on a beat
the same way: a timer back to the mood frames, so the pose and the prop go together.

## 7. The child fallback ladder

A child gets a reaction by the first rung that exists:

1. The species' own `reactions[action]` extras pose (today's path), **plus** the CSS move.
2. **Ship E:** `child_eat_1/2` or `child_pat_1/2` through `acts` (the `child` stage added to
   `acts.eat` and `acts.pat`, no new key: `_sceneFrames` and `_actPose` read the stage list
   by name, and `test_species.py`'s acts loop already builds `<stage>_<act>_<i>`).
3. The **`excited`** child mood frames (`cozy` for a blanket, `bored` for a scold) with the
   same CSS move the older stages use (lean, `munch`, `settle`, the wiggle). **No new art.**

Rung 3 is the **state of the art after ship A**: a child feeds, snacks, tucks and is
scolded like the others, in motion, wearing a mood face. `_reactFrames` today returns for
the child (`s.drawn === "child"`); ship A lifts that guard for the **motion** and keeps the
frame choice above.

**This is motion ship 1's item #10 (child-stage care parity), which s2734 skipped**
(29 of 30 species have no child poses; its diff, `f7bc429c`, touches none of it). It is now
**explicitly part of ship A**, its first task, not "whoever lands second drops its half":
nothing to drop, nothing to rebase on. Concretely:

- Lift the `drawn === "child"` guard in `_reactFrames` **for the move only**. The frame
  choice stays: rung 1 (the species' `reactions` extras) when it exists, else the rung 3
  mood frame. Extras timing (`poseUntil`) is unchanged, and the house-flag poses (`squint`,
  `sweat`) stay mood-frame decisions made before the ladder, so the guard lift does not change
  them (review checklist 7; a JS test per flag at child).
- Child scenes for feed, snack and tuck (ships B and D) read the same ladder through
  `_sceneFrames`.
- card-check's "a child gets no stage reaction" (`!kid.live && kid.moves.length === 0`
  for a feed refusal) is **rewritten** by this task (section 13).

## 8. Timing budget, the pending path

- **The tap feels instant:** the press, ring, haptic and `perk` at 0 are unchanged.
- **Anticipation covers the round trip** (about 650 ms of it before the first commit). The
  local HA answers in 50-300 ms (unmeasured; section 13); a remote one longer: the hold (4.3)
  takes up to 2 s, then the failure exit.
- **Totals** (from the tap, one answer in time): feed 2.75 s, snack 1.95 s, tuck 2.4 s, the
  blanket chip 1.3 s, wake 1.6 s, praise, scold, fan 1.2-1.6 s, a pat at most 0.9 s per tap.
  Today's window is the round trip plus 2.5 s plus up to 0.7 s of tick (about 3.5 s for a
  feed); every total here is within it.
- **Beat lengths scale by `paceOf` at most +-20%**; gates and the hold do not.
- **A second tap on the same care**: for **feed, snack and lights it is ignored** (ring and
  haptic only; the scene runs and the owed answer is never lost, 4.3). For medicine and clean it
  ends the scene without a second call, as today; a tap on the screen ends those two only.
- **The `.pending` pulse stays on the button** until `callService` resolves, as today.
- **No new infinite loops.** The waiting loop is bounded by the 2 s hold; the old `sway` and
  the 10 s excited `hop` loop are replaced by bounded moves. Only `transform`, `translate`,
  `rotate`, `opacity`, `clip-path` and `mask` (the last two repaint, on one element, about
50 px high at a 300 px card; unmeasured on a wall tablet, so the bench logs the frame time of
a feed scene once and the first mate reads it).
- **At most 12 DOM nodes** a scene (crumbs, sparks and the dusk layer, removed at
  `_sceneEnd`). A JS test asserts `sc.els.length <= 12` at every `careAt` of each scene.

## 9. Reduced motion

`calm()` (the OS setting, read live) is checked by **every new JS path**; the CSS is covered by
the global rule (`style.js:7-9`).

- **No scenes.** `_sceneStart` takes the existing `sceneFade` branch: the news fades in. (A
  lights tap under calm sets `sceneFade` with kind `lights`; the kind map `SCENE_KIND_OF`
  makes the refusal's `lights_out` entry find it.)
- **The pose still changes** (as `_frames` already does under calm: the first frame): a feed
  shows the `eat` frame and then the content frame; so the pet **visibly reacts** even
  without motion. The prop is shown **still**, beside the pet, and removed with the pose.
- **The dim is instant** (no steps), the drape shows at its final frame, a wake removes it.
- **Pats:** the pat pose and the line, no lean, no wiggle; saturation is the `cozy` frame
  and the line only.
- **Lines and the haptic** are unchanged.

## 10. The ships

### A. The floor (S-M, no art, tier 1)

- **First task: the child-stage care parity** (motion ship 1's skipped #10, section 7):
  lift the `drawn === "child"` guard in `_reactFrames` for the motion, rung 3 mood frames,
  and rewrite card-check's "a child gets no stage reaction".
- Kinds `scolded` and `aired` in `REACTIONS` / `STAGE_POSES`; `unfair` into `REACT_REFUSALS`;
  refusal variants (`REACTIONS.refused` a pool); fan's lean replacing `sway`.
- Praise's star above the head (`prop-rise`); the prop **drop** and **leave** for every care,
  timer-driven; the pose ends with the prop.
- Wake on `woke_up {how: "lights"}`: `stretch`.
- The snack's excited loop spent as one `greethop`.
- `spoiled` as a reaction for praise, snack (floor path) and play (5.5); the card-check
  "does nothing" list loses `spoiled` and `unfair` (section 13).
- Clean's hop over the broom and meds' sniff (the engine is not touched).
- A one-pose `play` beat before the picker.
- Files: `card-moment.js` (`_react`), `card-tick.js` (`_reactFrames`), `ui-copy.js`
  (`REACTIONS`, `REACT_REFUSALS`), `card-actions.js` (clean, meds), `card-layout.js`
  (the excited loop), `style.js`. Copy: section 14.

### B. The registry, then feed and snack (L, split in two, no art, tier 1)

**B1 (M-L): the engine and feed.**
1. **Refactor commit:** `SCENES` registry, medicine and clean moved in, PNG-hash-identical
   bench shots (4.1). New part `card-care.js`.
2. **The answer path (4.2-4.5, 4.9), in its own commit:** `due` with the parse rules, the
   hold inside `_sceneRender`, `sc.answerAt`, `refuse` (before and after the gate),
   `_sceneFail`, the `late` owe, `s.sceneOwes` as a list with `playOwed`, `SCENE_KIND_OF`,
   `_care`'s per-entry claim and `_sceneTake`, the ignore rule for a second tap, the bench
   `answer` field. Medicine and clean keep their behaviour (`skippable`, `playOwed` false).
3. Feed (5.1), variants A-D, world and time hooks.
4. **First deliverable of the bowl work (before the feed art is judged):** the 30-species
   bench sheet for the clip, with the pass rule of 5.1, and `bowl_rim` for the species where it
   reads. This is B1's first piece of work, ahead of the scene beats that use it.

**B2 (S-M): snack**, on B1's engine (5.2), its variants, `spoiled`, the excited loop.
- Files: `card-actions.js` (the shared frame), `card-care.js` (new), `lines.js`
  (`SCENE_MS`), `ui-copy.js`, `style.js` (`.scene-bowl`, crumbs), `manifest.txt`,
  `dev/bench`.

### C. Touch (M, no art, tier 1)

- Zones, lean, `s.patRun`, the escalation table, saturation, the asleep stir, the egg's
  third pat. Files: `card-tick.js` (`_pat`, `_patPose`), `ui-copy.js`, `style.js`.
- Pure helpers (`patStep`, the zone maths) in a part loaded early (`ui-copy.js` or
  `world.js`) so a JS test can call them without a DOM.

### D. Tuck in (M, art 9 + code, tier 1)

- **Art first, in parallel with B** (section 12): `ui/drape_<size>_<n>.png`.
- The `_toggleLights` entry and the live-`asleep` answer (4.3b), the bedtime scene (5.3a),
  the wake scene, the blanket chip's shawl (5.3b), the drape as state (`asleep` and
  `lightsOut`), the `_layout` skip and the `wasAsleep` writes (4.9), species anchors
  (`drape: {y, w}` or an opt-out, in `species.json` beside `props`). **Needs B1's engine
  and answer path.**
- The code **ships before the art** with the no-drape fallback and flips on when the files
  exist. Files: `card-care.js`, `card-layout.js` (the state), `style.js`, `species.json` x N.

### E. Child eat and pat (art 100, owner-gated, last)

- `child_eat_1/2` for the **20** species with no child feed pose (40), `child_pat_1/2` for
  all **30** (60). The `child` stage is added to each species' `acts.eat` and `acts.pat`
  **list** (no new key); the `drawn === "child"` guards in `_patPose` and the scene frames
  are lifted. **Lands after the open `art-128-*` branches merge** (they rewrite the `acts`
  line in all 30 files; the nature plan's N1 rule).

## 11. Overlap with other efforts

### Motion ship 1 (s2734, `f7bc429c`, landed on `origin/main`)

Read from its diff (`git diff origin/main...f7bc429c -- src/card/`), not from a brief:

- **The sleep settle** (`card-layout.js`: `if (asleep && s.wasAsleep === false && !s.egg &&
  !calm()) this._animate(s, s.pet, "settle", 2500)`, then `s.wasAsleep = asleep`). It reads
  `asleep` from the **held** `_state`, so during a lights scene it cannot fire, and at
  `_sceneEnd` it would fire a second time after the scene's own sigh. The first draft's guard
  `if (s.scene) return` was a no-op. **The rule is 4.9 item 2:** the lights scene writes
  `s.wasAsleep` itself at its lie-down (true) and wake (false) beats. s2734's settle stays
  for `collapsed` and `house` sleep and for a tuck seen live with no scene of ours.
- **The flip is still a transition** (review S1): `.pet.look { rotate: y 180deg }` over
  `rotate .2s`. There is **no** new flip class and **no** dependency of D on it (the first
  draft's "D waits on #1" is dropped). The scenes toggle `.look` on timers (4.9). s2734 also
  gave `.pet.wander-l`, `.perch.wander-l`, `.pat.wander-l` and the ghost a .2 s translate
  delay, plus `ghost.look`; a scene's own `translate` is written inline and does not use
  `wander-*`, so it takes no such delay. `_wander(s, ms)` (adds `.look` with `wander-l`) is
  the idle and `wander`-move helper only.
- **#10 child-stage care parity was skipped** by s2734 (29 of 30 species have no child
  poses): **ship A owns it, as its first task** (section 7). Nothing is dropped by "whoever
  lands second".
- **#7 egg wobble** landed as `_eggWobble` (`card-tick.js`) with `.pet.rock2`. Touch's egg
  escalation uses `egg_wiggle` frames, `rock2` for the double rock, and keeps apart from the
  idle wobble (5.4).

### Species nature plan (N1-N4)

- **N4's signature pose is idle-only** and **never an eat, snack, tuck or pat frame**
  (its section 8a): this plan replaces `acts.eat`, `acts.pat`, `acts.cheer` and the care
  scenes wholesale and **does not touch `signature`**. The art lead checks the 30 pose
  names against the beats here before N4's art starts (a pose that reads as eating, being
  tucked in or petted gets another idea; its candidates `cheeks`, `stash`, `fish_bill`,
  `bottoms_up` are the ones to check against 5.2 variant D and 5.1).
- **N2 `_natureLine`** gains `tuck` and `pat` keys, empty in N2. Where N2 has landed, the
  scenes call `_natureLine(s, "snack" | "tuck" | "pat")` at their delight or sigh beat and say
  their own line on `null`. Where it has not, they say their own line.
- **N2's `snack` and `clean` call sites** are thin (one call ahead of the normal line in
  `card-moment.js`): **if B lands first, N2 builds only the helper** and the scenes call
  it; either order merges.
- **N1's `clock`, `habit`, `paceOf`** are read through the null-safe wrapper (4.8).

### Other plans

- **Favourite and resting (R1, on main):** a resting pet is still cared for; the scenes treat
  it as awake. The first draft said "no conflict" without evidence (review S3); there are
  three real touch points (`breathe` on `.pet.resting`, the `.awaylabel` at the bowl's
  height, and the label under a held `asleep`), all handled in 4.9, with a resting row in
  every bench acceptance (section 13).
- **Hop and the memory plan:** no shared code.
- **`card-split`:** a new part goes in `manifest.txt`; `scripts/split-card.js` is for ports
  of pre-split branches, not for this.

## 12. The art briefs (DRAFT; the art desk's process, no tool details here)

### Ship D: the blanket drape (9 images)

- **Brief.** One shared blanket that **drapes over any sleeping pet**: it covers the lower
  half to two thirds of the body and leaves the head and ears. 3 sizes x 3 frames.
- **Style reference:** `bird/blanket.png` (the folded blanket) for palette, outline and pixel
  density, and the existing pets for scale. Warm neutral that reads against **every**
  species' colour and in the `dim` backdrop (the card darkens the pet 20% when dim; the
  drape gets the same filter in CSS).
- **Sizes** (by the drawn body width, measured from the 30 species' frames by the art lead,
  not guessed): **baby**, **child and teen** (one size), **adult**.
- **Frames** (per size): **1** unfurl (a corner held up, mid-fall), **2** settling (covering,
  a wavy edge), **3** draped and tucked (the final, held as the state frame).
- **Format:** the pets' pixel grid (the `_sceneArt` convention: the card scales scene art by
  art pixels, 4 frame pixels per art pixel), transparent PNG, names draft:
  `ui/drape_baby_1.png` ... `ui/drape_adult_3.png` (shared art lives in `ui/`, like
  `prop_scold`). Species with different needs (the bat hangs, the axolotl and octopus are
  not furred) **opt out or offset through data** (`drape: {y, w}`), not extra art.
- **Not asked for:** a per-species blanket (about 180 images, the owner's option c, not
  chosen), a kelp drape for water worlds (not planned; the same drape serves).
- **Cost:** 9 images, 3-9 calls, at most 12 with rework, under an hour of the image cap
  (memory `codex-image-cap`; one batch, not mixed into another art job's 5 h window).
- **Checks:** the bench `care: lights` contact sheet at all three sizes over **30 species x 3
  stages**, day and dim; the art review reads the sheets and the diff, not 9 singles.

### Ship E: child eat and pat (100 images)

- **Brief.** Two-frame poses at the **child** stage in each species' own look and palette,
  on the existing 256 x 256 frame and grid: `child_eat_1/2` (**20** species, the ones with
  no child feed pose; holding food and chewing; the frame must work for snack too) and
  `child_pat_1/2` (**30**; eyes closed, leaning into a hand, the same idea as the adult
  `pat` frames).
- **Style reference:** that species' own `adult_eat` and `adult_pat` (drawn), plus its
  `child_*` mood frames for the child's proportions.
- **Cost:** 100 images, about 50 calls as two-frame strips, 65-125 with 25% rework; about a
  full 24 h window as singles, one 5 h window as strips. **Never in one 5 h window with another
  art job.** Owner-gated: the owner says go.
- **After:** `acts.eat` and `acts.pat` gain `"child"`; `test_species.py` already checks the
  files; the bench `species` preset child shots are the review.

### Not in either

The bowl's half art (up to 30), only if the bench sheet of 5.1 says the clip reads
poorly and the owner wants it (section 15).

## 13. Verification

### Bench (`scripts/bench.js`; the default for any look, per AGENTS.md)

The bench already seeks a scene by `care` and `careAt` (`dev/bench/page.js`, the `care`
shot) with the scene paused, and runs the card's own `_pat`. `callService`/`callWS` return
empty and nothing changes state (README Limits). So everything that depends on an answer
reaches the bench through a field, not a server (review S5). Additions:

- `care` accepts `feed`, `snack`, `lights`, `blanket`; `careAt` seeks each. The builder adds
  what the fake `hass` needs to pin a prediction (`hunger`, `energy`, `requests`).
- **`answer`** (new): `{at: <ms>, result: "ok"|"full"|"not_sleepy"|...}` sets `sc.answerAt`
  and `sc.result` (4.3). With none, the scene holds at its gate, which the bench can seek to
  (`careAt` past the gate with no answer = the waiting loop; `careAt` 2000 past it = the
  failure exit). The hold is implemented inside `_sceneRender(s, t)`, so this is the same
  code path as the card's.
- **`variant`** (new): pins `_careVariant`'s pick (`"A"`-`"D"`), applied **before** `careAt`
  seeks, bypassing the no-repeat store.
- **`patTap`** (extended): `true` stays; `{n, zone: "head"|"body", side: "left"|"right"}` runs
  n pats through `_pat` with the bench's pinned clock. The existing call passes no
  `clientX`: the zone maths returns head (4.9, 5.4).
- **Contact sheets** (a `--preset care`, `--sheet`): every variant x `careAt` 0, 200, ...,
  2800 at 330, for one adult; the child ladder (rung 1 and rung 3) at 330; **the 30-species
  bowl clip sheet** (with the pixel-count pass rule of 5.1); the drape sheet (D); the touch
  ladder n = 1, 3, 5, 8, 10, 12 head and body; **`motion: reduce`** for each interaction (the
  final frame, the prop still, no scene); murk and nightsky worlds for feed; big text and mono
  for the line in the bubble; **a resting row** (one adult, resting flag on) for every
  interaction (4.9); a **300 px** shot of a feed with two poops (5.1).
- **Medicine and clean unchanged by the refactor** (4.1): the sha256 of each bench PNG at
  `careAt` 0, 300, ..., 2200 equals the one made before the refactor commit.

### JS tests (`tests/js/care_reactions.test.js`, through `tests/js/card-source.js`)

- `_careVariant`: never the same twice in a row; the conditional filter (variant C only
  under hunger 30); one pick for a pinned `variant`.
- The predictions: `due("feed")` at hunger 94, 94.99 as a string, and 95; `unavailable`,
  `unknown`, a missing sensor and `NaN` give null; asleep, egg, away give null; `lights`
  at energy 94 and 95; `blanket` only with the request.
- **The scene clock** (a pure function, 4.3): `te` equals `t` before the gate, sticks at the
  gate with no answer, resumes from the answer's time; the 2 s limit takes the failure exit;
  **no path leaves `s.scene` set or `sc.raf` running** after `_sceneEnd` on a swipe, a slide
  change or a tap on another care (checklist 1).
- **The answer path** (review B1-B3), each a test of `_care` with a scripted `fresh`:
  - a refusal logged as `lights_out` answers a `lights` scene (the kind map);
  - my feed and a partner's praise in **one** update: the scene is answered by the feed and
    the praise plays line only;
  - a partner's unclaimed feed ok does not answer my scene; a claimed one does;
  - an ok then a `full` for one feed: the push-away after the gate finishes the bite;
  - two presses on two cares leave two owes and each reply takes its own; a medicine reply
    does not swallow a feed owe;
  - a **double tap on feed** sends one call, the scene runs to its end, the ok plays the
    eat, the prop and the meal line (the B2 scenario, asserted end to end);
  - a `playOwed` owe plays the floor path; a medicine owe is swallowed; a `late` owe plays.
- **The lights answer:** live `asleep` on answers a tuck; 600 ms after `_call` resolved
  with no change gives the quiet exit; a wake on an awake pet gives the quiet exit; `_call`
  false gives the failure exit.
- **Held states** (B4): during a lights scene a `_layout` pass leaves the bg, `dim` and
  `faded` alone; exactly **one** `settle` runs across the scene's life (count `_animate`
  calls with `"settle"`); `s.wasAsleep` is true after the lie-down beat.
- `sc.els.length <= 12` at every `careAt` of every scene.
- The zone maths (head 40%, the side, `detail: 0`, no `clientX`: no `NaN`); the escalation
  counter (the 5 s window, the 30 s cap, n = 10 flops, 11+ is quiet for 8 s and is not
  extended, a new run after the quiet, `PAT_SPOT` only for n <= 3); no lean while `.look`.
- The child ladder picks rung 1, 2, then 3 by what the species has; the house-flag poses
  at child are unchanged by the guard lift.
- Every new line fits `scripts/copy-scan.js` (40 characters with the longest fill, no
  nagging words); new tables are added to its `COPY_TABLES`, as the scan requires. Run it on
  the draft lines before approval (the "*burp* ...pardon me" line passes only if the
  scan's 40-character rule counts its asterisks).

### card-check (a real HA; behaviour only; sections `pat`, `react`, `care`)

New checks:

- A feed press runs a scene and leaves **no `.scene` element and no inline `translate` or
  `rotate`** and no `look` class on the pet or perch after 3.5 s.
- A **stale** feed (review S5): the check passes the card a `hass` whose `sensor.hunger`
  reads 90 while the server's is 100, so `due` says yes and the server says `full`. The scene
  ends in the push-away, the line is the refusal, the call count is **one**. (A press at
  a card state of 100 starts no scene at all and plays today's refusal.)
- Feed and snack: a double tap sends one call **and** the pet eats (`eat` frames seen,
  the prop dropped, the meal line said).
- Under `reducedMotion: reduce` **no scene element appears**, the pose still changes.
- **Lights out keeps the drape** until lights on (D); a `not_sleepy` nap leaves no drape and
  no dim; two quick lights taps send **one** call.
- 12 pats: past 10 the pet's class list stops changing (**no class churn**, `pat-soft` only).
- **The tap to the answer is a measurement with a bound:** the delta from the press to
  `last_care` is logged to the card-check output once, and the check **fails above 650 ms**
  on the local HA (the gate), so a slow machine is seen rather than hidden. It is the
  number the scout estimated, and its home is the report of the gate run.
- `scripts/gate --auto` picks the sections from the diff (`pick-sections`); the batch gate is
  the first mate's, through `scripts/ci-gate`.

**Existing checks these changes break** (review S4; each is rewritten in the ship that
breaks it, named by its text because line numbers drift; the references are the
`react:` and `pat` sections of `scripts/card-check.js`):

| Existing check | Why it breaks | Ship |
|---|---|---|
| "`react: <stage> <result> does nothing`" over `asleep, egg, away, no_game, unfair, spoiled` | `unfair` (scold) joins `REACT_REFUSALS`; `spoiled` becomes a reaction (praise, snack, play) | A |
| "`react: <stage> refusal <result> reacts`": `r.moves.join() === "look"` | the refusal pool (head shake, yawn then hop, flop) is random and not only `look` | A: assert "one of the pool's moves" per pinned variant |
| "fed / snack shows `munch` as the only move"; the fan's `sway`; the blanket's `settle`; praise | intended edits: scenes, `aired`, the star above the head | A, B |
| "`react: a child gets no stage reaction`" (`!kid.live && kid.moves.length === 0`) | the child guard is lifted (section 7) | A |
| "a second pat inside the cooldown still wiggles (`pat-soft`)" | pat n = 2 on the head is a longer lean, not `pat-soft` | C |
| `patReset` resets only `patAt`/queue/say | `s.patRun` is never reset, and the `pat` and `react` sections call `_pat` dozens of times with `{detail: 0}` (head) inside 5 s: they would reach n >= 10 and later checks get "pat-soft only, no line". **`patReset` must also clear `s.patRun`** | C |
| "a double tap on feed sends one press, and the button is free again after" | still true with the ignore rule (4.3); extended to check the pet eats | B |
| `lost` / `aww` (the lost-game check) | **untouched**: `lost` and `won` stay on the floor path, and `_sceneAnswered`'s change must not touch them (a JS test pins it) | B |

### Review gates

A: bench sheets of the floor, read by the first mate. B: the 30-species bowl sheet (**the
decision input for the half art**), feed and snack sheets. C: the touch ladder. D: the drape
sheet through the art review. E: the 100 frames' sheets through the art review.

## 14. Copy (DRAFT; the first mate approves every line)

All fit 40 characters, carry no digits, no "?" outside a question, no nagging words
(`scripts/copy-scan.js`). Species `*action*` lines are said **bare** (the catchphrase is not put
in front, the nature plan 5.4). They go in `lines-fresh.js` tables named in `COPY_TABLES`.

| Where | Lines |
|---|---|
| feed, satisfied (1 in 4) | "*licks its lips*", "*pats its tummy*", heavy: "*burp* ...pardon me" |
| feed, push-away | "*pushes the bowl back*" (with the existing "i'm full!") |
| snack, catch / miss | "*gotcha!*", "*pounce!*" |
| snack, spoiled smug | "*sneaky grin*" (with the existing line) |
| tuck, sigh | "*sighs, all snug*", "*peeks out, then dozes*" |
| tuck, night creature | "*one more look around*" |
| wake | "*stretches*", groggy: "*blinks, squinting*" |
| pat, ticklish | "hehe, that tickles ♥" |
| pat, saturate | "ok ok ♥ ...so cozy", "*melts into a puddle*" |
| pat, asleep | "mm..." |
| pat, sick | "thanks... ♥" |
| scold, unfair | none new (the existing "hey, i didn't do anything!") |
| fan | "ahh, so breezy ♪" |
| refusal variants | "*shakes its head*" |

About **16** lines, plus the species keys N2 may add for `tuck` and `pat`.

## 15. Open questions (only what is truly open)

Resolved by the first mate's brief for s2743 (2026-11-02):

1. **The bowl's half art. DEFERRED.** Decided after ship B1's 30-species bench sheet exists,
   by the sheet and its pass rule (5.1): if the clip fails on **more than about a third** of
   the species, does the owner want `bowl_half` art for them (up to 30 images, no empty
   bowl) or accept "it eats, the bowl leaves whole" for those? Nothing is built for it
   before the sheet.
2. **Ship E's start. DEFERRED to the owner, later.** 100 images is a day of the image cap.
   The owner says go; the plan does not fix when (after C and D, or after a week of living
   with rung 3). Ship A's child fallback (section 7) is what the child has until then.
3. **The blanket on every device whenever the lights are out and the pet is asleep.
   DECIDED: yes** (derived from existing state, no data; section 1). The "what the others
   see when it appears live" gap the review found is closed in 5.3.
4. **Others' care gets the floor path, not a scene. DECIDED** (section 1, 4.5). A partner's
   feed playing the bowl scene from the reply is a possible follow-up after B, not planned.

Nothing else is open. Everything in the scout's Q1-Q4 is decided (section 1). Two design
calls the review forced are the plan's own, made in this revision and listed so the first
mate can overrule them: a second tap on feed, snack and lights is **ignored** (4.3), and a
post-gate `full` **finishes the bite then pushes away** (4.4).

## 16. Save and risk

- **No saved field, no server change, no stat or rate**, no new entity. The blanket is
  derived; `patRun` and the scene state are card-memory only.
- **Risk: the scene predicts a yes and is wrong.** The cost is a bowl that slides back out
  (4.4); the hold is capped at 2 s; the failure exit is the existing line.
- **Risk: a long `card-actions.js`.** The registry and the new part keep the old file under
  the part sizes the split planned.
- **Risk: bench and card disagree about timing.** The bench pins one clock; card-check
  measures the real round trip once.
- **Risk: the bowl art.** Isolated by the per-species `bowl_rim`: no number, no clip.
- **Risk: who pressed.** The server names no pressing device, so "mine" is claimed by arrival
  (4.5); a partner's ok inside the match window can answer my scene and mine then arrives as
  a late `full`. Defined, not removed; removing it is a server change this plan forbids.
- **Risk: the lights scene's answer is a state, not a log entry** (4.3b). Its failure modes
  (no change, stale state, a late refusal) each have a named exit; the 600 ms no-change
  window is a number the gate run's tap-to-state timing should confirm.
- **Perf:** one rAF loop per scene as today; `clip-path` and `mask` on a 128 px element.

## 17. Adversarial review checklist

For the reviewer (the numbers are for the findings table). Round 1 (s2740) used this list and
found the blockers; the revision's answers are in section 18, and the list stays as the
checklist for the second review. `sc.shift` below is the first draft's name for the hold: it
is now `sc.answerAt` and a pure clock (4.3); item 12's guard `if (s.scene) return` is now the
`wasAsleep` writes (4.9).

1. **The hold clock.** Does `sc.shift` stay correct when the scene is skipped, ended by a
   swipe (`card-build.js` `_sceneEnd`) or a slide change **while holding**? Any path that
   leaves `s.scene` set or `sc.raf` running?
2. **`_sceneAnswered` and the late owe.** Walk every order: ok before the gate, ok at the
   hold, ok after the failure exit, refusal after a tap-skip, **two presses on two
   different cares** back to back. Does any order swallow a reaction, or play one twice?
3. **The held states and the refusal.** The scene holds `switch.lights_out`; a `not_sleepy`
   nap flips it on and off. Does the dim or the drape ever show for a refused nap, on any
   device, in the 10 s `sceneOwes` window?
4. **`sceneOwes` is per slide** and `kind`-matched. Is `lights` (no `last_care` entry for an
   ok) ever answered at all? What ends the **tuck scene's `answered`** (the `fell_asleep`
   moment, not `_sceneAnswered`)? This is the one scene with no log entry to match.
5. **The inline `rotate` and `translate`** (the engine, the lean, `look`, `wander-l`): which
   writes win, and what clears them? `_sceneEnd` clears both; the lean must not leave one.
6. **The pat box moves with the pet** (`wander`, the scene's step): is the zone maths done
   on the box's rect at the tap, or a stale one?
7. **`_reactFrames` for the child.** The guard exists for a reason (the child's poses are a
   different set). Does lifting it for motion change a house-flag pose (`squint`,
   `sweat`) or the `reactions` extras timing?
8. **The prediction at the boundary:** hunger 94.99 vs 95 as a string and a float
   (`Number.parseFloat`), a missing sensor, `unavailable`. What if `sensor.hunger` is
   absent: no scene, today's path?
9. **The prop timers** (`propUntil`, the drop and leave classes, the pose end): two quick
   cares of different kinds, a slide change, a hidden tab. Is a prop ever left on screen?
10. **Calm:** every new JS path checks `calm()`; the CSS rule covers `animation` and
    `transition` but **not** `translate` or `rotate` set inline by the engine. Is there a
    path that moves under calm?
11. **Pace and nature:** is a beat ever scaled past the 3.2 s cap, or the gate moved?
    With **no** nature block, is every hook a no-op (a test per hook)?
12. **Interplay with s2734's settle and flip:** the guard `if (s.scene) return`; the two
    flips in the turn-round against a `.look` already on the pet.
13. **The drape as state:** `asleep` and `lightsOut` on a slide that is off show, a
    reloading pet, a resting pet, an away pet (the sitter). Is the drape on a pet that is
    asleep by itself at night with the lights **not** out? (It must not be.)
14. **Copy:** no line says "favourite" for a pet, nags, or runs past 40 characters with the
    longest fill; species lines are bare `*action*` lines; every new table is in
    `COPY_TABLES`.
15. **Bench:** is the `variant` field applied **before** `careAt` seeks, and does a pinned
    variant bypass the no-repeat store (so sheets are the same every run)?
16. **Scope:** does any ship touch the server, `PetState`, a saved field or a rate? It must
    not. Does the plan make the pet **sad, needy or annoyed** anywhere (saturation is
    contented; a refusal is a gesture, not a scolding)?
17. **Art counts and costs:** 9 (D) and 100 (E) add up (40 + 60); the half art is **not**
    counted and is gated on the sheet. The named files do not collide with `art-128-*`
    branches (new `ui/` names; E only edits `acts` lists after they merge).

## 18. The review (s2740) and what became of each finding

Report: `~/.local/state/crew/archive/hatch-at-home-s2740-20261102-1455/report.md`. Every
finding was checked against the code at `origin/main` `05ac0080` and s2734's diff
(`f7bc429c`) before it was folded. **All 5 blockers held; none rejected.** Line numbers in
the review drifted a few lines (card-check moved; the `react` check on `unfair` and
`spoiled` is keyed on action `play`); the substance held in each case.

| # | Finding | Result | Where |
|---|---|---|---|
| B1 | The tuck scene has no entry and no reachable answer (`_toggleLights` skips `_press`; a refusal logs `lights_out`; an ok logs nothing; egg, away, tucked) | **Folded.** Entry mirrors `_press`; `SCENE_KIND_OF`; "answered" for lights is the live `asleep` or the refusal entry, with a 600 ms no-change exit; the `fell_asleep` moment is not the answer | 4.3b, 5.3, 13 |
| B2 | A second tap on the same care kills the scene and swallows the reaction (feed double tap, screen tap) | **Folded.** Second tap ignored for feed, snack, lights (so `_inflight`'s outcome is kept); no screen-skip for them; an owed ok for these kinds plays the floor path (`playOwed`) | 4.1, 4.3, 4.5, 8, 13 |
| B3 | Only the newest entry is offered; any ok of the kind answers; "no refusal after the gate" is false | **Folded.** Per-entry claim and `_sceneTake`; unclaimed entries do not answer; owes are a list by kind; a post-gate `full` finishes the bite then pushes away; the by-arrival claim limit is accepted and written down | 4.4, 4.5, 16 |
| B4 | Held states break the scene's dim and s2734's settle guard (a second settle) | **Folded.** The scene owns the bg block (`_layout` skips it) and the dim is a dusk layer then the real `dim` swap; the scene writes `s.wasAsleep`; the button label stays "sleep" (stated) | 4.9, 5.3, 11 |
| B5 | The wake scene: stale `s.asleep`, a no-op `turn_off`, no answer | **Folded.** Same entry and answer; the no-change answer is the quiet exit | 4.3b, 5.3 |
| S1 | Section 11 and 2 out of date vs s2734; the flip is still a transition; D does not wait on #1 | **Folded.** Rewritten from the diff; `.look` on timers; `wander-*` delay noted; "D waits on #1" dropped | 2 row 4, 4.9, 11 |
| S2 | Inline `rotate` cannot carry a lean and a flip; transition easing | **Folded.** Flip wins per beat; scene leans written per frame with the transition cleared; the pat lean a class with its own transition and skipped under `.look`/`wander-*`; `_sceneEnd` removes `.look` | 4.9, 5.1, 5.3, 5.4 |
| S3 | R1 "no conflict" with no evidence (`breathe`, `.awaylabel`) | **Folded.** Three touch points named, rules, and a resting row in every bench acceptance | 4.9, 11, 13 |
| S4 | Existing card-check sections the plan breaks (not named); `patRun` never reset | **Folded**, with one correction: the `unfair`/`spoiled` check is action `play`, and `play` can return `spoiled` for real. The table lists each check, the ship that rewrites it, and `patReset` clearing `patRun` | 13 |
| S5 | No route to verify hold/refusal/failure; a hunger-100 check cannot happen as written; no bounds; subjective acceptances; byte-identical asserted; `patTap` without coordinates | **Folded.** The hold is a pure clock inside `_sceneRender`; bench `answer` field; stale-hass card-check; the delta is a bounded measurement (650 ms); the bowl "reads" rule is a pixel-count rule; the byte compare is a PNG hash with the pin check named; zone maths NaN-safe. The "about a third / half" bowl fractions are marked **unverified** (the sheet is not in the branch) | 4.1, 4.3, 5.1, 13 |
| S6 | `praise` and `play` can return `spoiled`; snack's treatment half-defined | **Folded.** `spoiled` is a reaction for all three (praise: ok reaction minus hearts, then the smug beat; play: ok then smug); the card-check "does nothing" list loses it | 4.4, 5.5, 13 |
| S7 | Escalation edge cases: pat 20 after the quiet; a run's time bound; `PAT_SPOT`; line cooldown; `reacting` | **Folded.** Saturation ends the run; quiet not extended; 30 s cap; spot only n <= 3; counts at the top, moves in both branches | 5.4 |
| S8 | A shared screen's drape has no arrival; a partner's tuck during another scene | **Folded.** A 450 ms three-frame fall on a live-seen tuck, no scene; the held-scene delay (<= 2.75 s) is stated and accepted | 5.3, 4.9 |
| S9 | `due` reads held state / needs `_press` to end the old scene first; hunger parsing | **Folded.** Order stated; `Number.parseFloat`, `NaN`/`unavailable` give no scene; 95 is full | 4.2 |
| N1 | "128 px" prop; the 300 px layout; poops in the bowl lane | **Folded.** Sizes stated at 300 px; poops are not moved, the bowl draws above | 0, 5.1 |
| N2 | `bowl_rim` count as B's first deliverable (29 of 30 sprites) | **Folded.** B1's first piece of work, stated | 5.1, 10 |
| N3 | Ship B too large; split feed from snack | **Folded.** B1 (engine + feed), B2 (snack) | 0, 10 |
| N4 | Stepped dim only for lcd-on? | **Folded.** All modes; the steps are the scene's | 4.9 |
| N5 | `calm()` read live mid-scene | **Folded** as one line, no change | 4.9 |
| N6 | "about 12 DOM nodes", no count test | **Folded.** "At most 12" with a JS test | 8, 13 |
| N7 | Perf not measured | **Folded** as a once-logged bench frame time, read by the first mate; no claim of a result | 8 |
| N8 | Copy-scan on the draft lines | **Folded** as a step before approval (it cannot run on text that is not yet in a table) | 13 |

Also from the brief: motion ship 1's skipped **#10 child-stage care parity** is now
ship A's first task (sections 0, 7, 10, 11). Open questions 1-2 are marked deferred and 3-4
decided (section 15).

## 19. A shipped: notes for B1 (s2746)

Ship A (the floor, branch `crew/hatch-at-home-s2746-care-reactions-ship-a-the-floo`) changed
the following. B1 builds on it; names win over lines.

**Code B1 meets**

- `_reactFrames(s, kind, { inGame, ms, frames, variant })` no longer skips the child (section 7).
  `frames` is the child's own species pose (rung 1; `_react` sets it, `_reactFrames` adds only the
  move). The move now lives in `_reactMove(s, kind, r, { inGame, ms, variant })` (variants
  `shake`, `flop`, `spin`). A child's visitor `greet` and a game's `refused` (`inGame`) are still
  skipped on purpose: they are not care. **`_sceneFrames` and `_actPose` still return null for the
  child**; B1's scenes need the same ladder (rung 3 = `child_<mood>_<n>`) themselves.
- `_poseEnd(s)` puts the mood frames back by a timer at `poseUntil` (a newer pose wins).
  `_reactFrames` calls it; a scene that sets `poseUntil` itself may too.
- `_propShow(s, sprite, ms, cls)` is the **one way to put a prop on the floor**: it resets the class
  (`above rise`, `above wag`, `slide`, or none), restarts the drop, and adds `prop-out` by a timer at
  `ms - 300`. A direct `_show(s, s.prop, ...)` leaves a stale `prop-out` class and the prop is
  invisible; B1's bowl is `.scene-bowl` (its own element), so it is not affected, but any use of
  `s.prop` goes through `_propShow` (clean's closing prop now does). Under `calm()` there is no `prop-out`; the tick hides the prop.
- `.prop` is now `drop .4s steps(4)` (was `pop`); `pop` is still `.born` and `.attention.arrive`.
- `_floorVariant(s, key, list)` is the no-repeat pick, with `s.pinVariant[key]` for the bench. B1's
  `_careVariant` can wrap or replace it; the bench field `variant` (a map key -> value) already pins it
  (`{ "refused.full": "shake", praise: "spin", medicine: "sniff" }`). Section 13's `variant: "A"` form is
  not built.
- `_react` computes `kind` before the pose branch and has a `spoiled` path (praise, snack, play, as
  an ok without hearts, then two `rock2`s and the "whining works" line). **A snack's `spoiled` already
  shows the snack prop on the floor path; B2's scene must treat it as eaten** (as 5.2 says) and drop
  this prop then.
- The fan: `aired` kind (cozy frame, `lean` 2.6 s, bounded). `.screen.breezy .pet` and `@keyframes
  sway` are gone. Scold: `scolded` kind (refuse act, `startle`, 1.2 s) and the finger `above wag`;
  `unfair` is in `REACT_REFUSALS` (turn away + the wagging finger). Refusals are a pool
  (`REFUSAL_POOL`, `REFUSAL_VARIANTS`): feed's `full` is `look` or `shake` today, so **B1's push-away
  after the gate must replace or follow this pick, not stack a second flip**.
- `_bondHearts(s, kind, n)` takes a count; praise uses `carehearts` (cleared with `bondhearts` and
  `linkhearts` on a slide change, `card-build.js`).
- The excited loop is gone: `_render` plays one `greethop` when a pet becomes excited (not over a
  pose, scene, sleep or away). It replaces the 10 s `hop` loop, so `BOUNCE_MS` is deleted. A snack's
  `fed` (`munch`) and this greethop can overlap: greethop wins in CSS order. B2 should not add its own.
- `_startGame` plays a play beat (`played` kind: cheer act or excited frame, `perk`, the ball prop for
  900 ms) **before** the picker opens; it sits before `s.game` is set.
- Clean's scene hops over the broom and shakes off (`rock2` at 1.8 s) and meds may sniff first
  (`sc.sniff`); the engine is untouched, `_sceneRender` only has the two tweaks, so the refactor's
  PNG-hash check (4.1) must be taken **after** A's commit, not before it.
- Wake on lights: `woke_up {how: "lights"}` plays a `stretch`, no line (D's wake scene replaces it).

**Tests and bench B1 reuses**

- `tests/js/care_reactions.test.js` (a fake card around the real `_reactFrames`, `_reactMove`,
  `_poseEnd`, `_propShow`, `_floorVariant`).
- Bench: `reactEntry: {action, result}` runs the card's own `_react` (the whole floor path) and
  `reactAt` seeks every animation; `variant` pins picks; `--preset care` is the floor's sheets.
- card-check: the `react` section's child check, the refusal pool (each variant pinned), the "does
  nothing" list (now `asleep, egg, away, no_game`) and the "an excited bounce" check were rewritten.

**Not shipped, for the first mate (copy)**: the plan's lines for the wake (`*stretches*`, groggy),
`ahh, so breezy ♪` (the fan keeps its existing thank-you), and `*shakes its head*` (where it is said
beside "i'm full!" is not stated). No new player copy went in.
