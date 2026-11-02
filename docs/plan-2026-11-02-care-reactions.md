# Plan: care reactions, every button, 2026-11-02 (build plan)

**Status: PLAN, docs only (s2738, tier 0).** Written from scout s2735's report
(`~/.local/state/crew/archive/hatch-at-home-s2735-20261102-1439/report.md`) and the
decisions of 2026-11-02 (section 1). Every `file:line` claim in the scout was re-read at
`origin/main` `73a3fb96`; section 2 lists the ones that were loose or wrong. Line numbers
are from `73a3fb96`; **names win over numbers**. Card code is `src/card/<part>.js`.
Every player line here is **DRAFT** until the first mate approves it (decisions 2026-10-28,
"How the crew works"). Ships A-C and D's code are **tier 1** (card behaviour, no save
change, no server change); D's art and E are art jobs.

## 0. Summary

Every care button today answers the same way: the server replies, a 128 px prop pops in at
a fixed spot (`left: 67%`), the pet changes frames **on the spot**, and 2.5-3.2 s later the
prop is cut out. Nothing travels, nothing is eaten, nothing is tucked. Scold gets **no**
pet reaction at all, the fan only a sway, and a **child** pet gets only the prop for feed
(20 of 30 species), snack (21 of 30) and blanket (27 of 30). Medicine and clean already
play as a rAF **care scene** (`_sceneStart`): that is the engine to generalise.

The goal (owner): **every care button causes a real pet reaction, never only a prop.**
Feed, snack, tuck in and touch are the richest. Motion first: ships A-C need **no art**.

| Ship | What | Size | Art | Tier |
|---|---|---|---|---|
| **A** | The floor: scold, fan, praise, wake, clean and meds touches, refusal variants, prop drop and leave, child fallback on the existing mood frames | S-M | none | 1 |
| **B** | The engine registry (medicine and clean move into it unchanged), then **feed and snack as scenes**: anticipation at the tap, the commit gate, push-away on a refusal, variants, a stepped CSS clip for the bowl | M-L | none | 1 |
| **C** | **Touch**: where you tap, the lean, escalation, saturation, asleep stir, egg | M | none | 1 |
| **D** | **Tuck in**: the shared blanket drape (9 images), the bedtime and wake scenes | M | **9** | 1 + art |
| **E** | Child `eat` and `pat` frames (100 images), owner-gated, last | S code | **100** | art |

Order: A, B, C (they need no art and can go to workers now), D (its art can start any time
and run beside B; its code ships with a no-drape fallback), E last. Nothing here changes a
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

Everything else below is this plan's own call, flagged where it is a real choice, and
section 15 lists what is truly open.

## 2. What was checked against the code

The scout's table of the pipeline held. Corrections and additions:

| # | Scout / assumption | At `73a3fb96` |
|---|---|---|
| 1 | The engine is `card-actions.js:107-318` | It is `_sceneStart` (107) to `_sceneAnswered` (324-345). Names hold. |
| 2 | "Care scene: the action waits on the reply" | **No.** The scene runs on a fixed clock **from the tap**. `_sceneStart` holds every state but `sensor.last_care` (the `held` map), so nothing jumps; an **ok** answer only sets `sc.answered`; a **refusal** calls `_sceneEnd` (a hard stop) and `_react` then plays the refusal. Waiting on the reply is **new** (section 4.3). |
| 3 | Keyframes `startle`, `sulk`, `stretch`, `born`, `bighop`, `greethop` | They are **classes** over other keyframes: `.pet.sulk` = `shake`, `.stretch` and `.startle` = `perk`, `.born` = `pop`, `.greethop` = `hop` (`style.js:597-609, 1265-1270`). The keyframes are `perk`, `munch`, `settle`, `rock`, `pat-soft`, `hop`, `bighop`, `pop`, `shake`, `sway`. |
| 4 | The flip is a keyframe | `.pet.look { rotate: y 180deg }` over a `rotate .2s` **transition** (`style.js:780-781`). s2734 makes it a `@keyframes`. |
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

s2734 (motion ship 1) is **not on origin yet**; section 11 states the overlap from its brief.

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

What every scene keeps from today: one clock (`_sceneRender(s, t)`); the held states; a tap
on the screen ends it; a second tap on the same care ends it without sending again
(`_press`); only the slide on show plays; `calm()` means no scene (`sceneFade`).

### 4.2 The prediction (`due`)

A scene starts **at the tap** only when the card predicts the server will say yes. All
inputs are states the card already holds. No scene while a game, the status page, a link,
the low-battery gag, an egg, `away`, asleep or `lightsOut` (today's `_sceneStart` guard),
except tuck and wake, which are about exactly those.

| Kind | Starts when | Why it can be wrong |
|---|---|---|
| `feed`, `snack` | `sensor.hunger` < `FEED_FULL_AT` (95; `world.js:6`) | a stale state: the answer is `full` (4.4) |
| `lights` (tuck) | awake, not `lightsOut`, and `energy` < 95 **or** in the sleep window / the hour before bedtime (`sleepTimes`) | the server's nap rule is wider; the answer may be `not_sleepy` |
| `lights` (wake) | asleep or `lightsOut` | none: waking is always ok |
| `blanket`, `fan` | the kind is in `mood.attributes.requests` (the chip is only up then) | the request lapsed: `not_needed` |
| `medicine` / `clean` | as today (`sick` flag / `poop` > 0) | as today |
| `praise` | always | never refuses |
| `scold` | never a scene (4.6): its outcome (fair or unfair) is not known at the tap |

Unpredicted, the press is exactly today's: the perk, then the reply's reaction.

### 4.3 Anticipation at the tap, the gate, and the wait

Each beat before the **gate** is safe to play whatever the server says: it is the pet
noticing, and the prop arriving. The gate is the first beat that **commits** (the first
bite, the lie-down). If the reply has not come by the gate, the scene **holds**:

1. The scene's clock is `t - sc.shift`. At the gate with no answer, the scene sets
   `sc.holdAt` and draws a **waiting loop**: two frames, the pet's own mood frame swaying
   (`rotate` +-2deg, `steps(2)`, 600 ms period), the prop sitting where it landed. `sc.shift`
   grows with the real time, so the scene resumes exactly at the gate when the answer
   comes.
2. The button's `.pending` pulse stays on (it is `_call`'s, unchanged).
3. **Up to 2000 ms** of waiting. Then the scene takes its **failure exit** (4.5).

Where the gates are: feed and snack 650 ms (the bowl has landed, the pet has looked); lights
400 ms (after the turn-round, before the lie-down). The local HA answers in roughly 50-300
ms (the scout's estimate; **not measured**: card-check logs the tap-to-`last_care` delta
once, section 13), so in practice the gate never holds and **the scene feels like one
continuous beat from the tap**: that is the point of the decision.

`_sceneAnswered` gains one thing: on **ok** it sets `sc.answered` as today and, if the scene
is holding, releases it.

### 4.4 A refusal turns the scene into a push-away

`_sceneAnswered` today ends the scene hard on any non-ok. The registry's optional
`refuse(s, sc, result, t)` replaces that: the scene **does not end**; it switches to its
refusal beat from where it is, then ends, and the REFUSALS line is said at the beat's
start (so the words and the gesture arrive together).

- **Feed or snack, `full`:** the pet **sniffs** (lean toward the bowl, 250 ms), the `refuse`
  act, the flip away (the existing refusal), the bowl **slides back out** (`steps(3)`,
  300 ms). About 900 ms from the refusal. "i'm full!" is the existing line.
- **Tuck, `not_sleepy`:** the turn-round already under way becomes a head shake (two flips),
  then a hop (`excited` frame): "not sleepy yet" (existing line).
- **Blanket or fan, `not_needed`:** the prop slides out, the `refuse` act, the flip.
- **Snack, `spoiled`** (a fake call): not a refusal of the snack. It is **eaten** as ok, then
  a smug beat: a small wiggle (two `rock`s) and the existing "hehe, whining works" line.

A refusal that arrives **before** the scene has drawn anything the pet could not take back
(before the gate) is the cleanest case; a refusal after the gate cannot happen for feed
(the server decided on the reply).

### 4.5 Failure, the late answer, someone else's care

- **`_call` returns false** (network, `unavailable`): `_press` already has the
  `.then((ok) => ...)`. Add `if (ok === false) this._sceneFail(s)`: the scene takes its
  exit beat (the prop slides out, 400 ms, the pet's frame goes back) and `_call`'s own
  "hmm, that didn't work" stays in the bubble.
- **No answer by the end of the 2 s hold:** the same exit; `s.sceneOwes` is set with
  `late: true`. If the reply **does** come within 10 s, `_sceneAnswered` returns **false** for
  a `late` owe, so the normal `_react` plays (a short non-scene reaction: the pose and the
  prop, section 6). Today an owed ok is swallowed because the scene "showed" it; that stays
  true for an owe from a **tap-skip** (the scene played to a point the viewer chose).
- **Someone else's care** (no tap here, `mine` false): **no scene**. It plays the A-floor
  path (the pose, a dropped and departing prop, section 6). The viewer's own press is the
  rich one. (A short scene from the reply is possible later; it is not planned.)
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

## 5. The four rich interactions

All times are ms **from the tap**. "Anticipation" is the part that plays whatever the
server will say. Perk, ring, haptic and `.pending` at 0 stay exactly as `_tapped` does them.

### 5.1 Feed: "the bowl arrives, it eats in bites, the bowl goes" (about 2.75 s)

| Beat | ms | What |
|---|---|---|
| tap | 0 | `_tapped` as today (press, ring, haptic, `perk` 300 ms) |
| look | 0-300 | the pet looks toward the pad: `rotate -4deg` (inline, `steps(2)`), its `hungry` mood frame if the species has it |
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

**Variants** (no-repeat, 4.7):

- **A: drop-in** (above).
- **B: slide-in from the left edge.** The bowl comes in at `steps(5)`; the pet **flips first**
  (s2734's turn-before-travel), walks, flips back, eats. +300 ms.
- **C: gobble.** Four bites at 250 ms. **Conditional:** `hunger` < 30. Rolled in only then.
- **D: savour.** Two bites, a look up at you (the `excited` frame held 400 ms with a tilt),
  a last bite. 

**The food shrinking: the stepped CSS clip.** The scene draws the bowl in its own element,
and each bite sets its `clip-path: inset(<cut> 0 0 0)` to a step (a **stepped** change, no
tween: LCD style). `<cut>` runs from 0 to a fraction of the sprite height where the rim
sits. This **reads on the heaped bowls** (the food stands above the rim; about a third of the
29 sprites: the kibble heaps, the hay and leaf mounds). It **reads badly** on the flat
dishes (a cut takes the dish, not the food) and does nothing for loose heaps with no bowl.
So:

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
written), so the scene is driven by the **tap** and the `fell_asleep {how: "lights"}`
moment. (b) The **blanket request chip**, a daytime ask when the pet is chilly. Both get a
reaction, (a) the full scene, (b) a short one.

**(a) Lights out, the pet awake** (the prediction in 4.2):

| Beat | ms | What |
|---|---|---|
| tap | 0 | `_tapped`; the toy clicks (its existing chirp) |
| yawn | 0-250 | the `sleepy` frame; a tilt (`rotate 4deg`) |
| turn round | 100-400 | the circle before lying down: two paper flips (`rotate: y 180deg` and back, 2 x 200 ms, s2734's flip) |
| **gate** | 400 | |
| lie down | 400-700 | swap to the asleep frame **at the bottom of a `settle` dip** (the swap hides in the squash) |
| blanket | 500-1000 | **the drape falls** from the top over the lower body: shared art, 3 frames, `steps(3)` (ship D; before it lands, this beat is skipped) |
| tuck | 1000-1200 | two small press-ins on the blanket edge (`scaleY .97`, `steps(2)`) |
| lights | 1200-1800 | **the dim in three steps** (an LCD click, `steps(3)`) in place of the .6 s fade |
| sigh | 1800-2400 | one slow breath (scale 1, 1.02, 1; 600 ms); the thanks line types |

- **The blanket is state, not a prop.** It shows whenever the pet is **asleep and `lightsOut`
  is on** (both already in `_layout`), on every device and after a reload, with **no new
  server data and no saved field**. A pet that fell asleep by itself at bedtime, with the
  lights not out, has no blanket (nobody put it to bed). The scene only animates the
  **arrival**; a pet already tucked when the card opens shows the final drape frame.
  (The evening/known-person rule stays what it is: it gates the **thanks line**, not the
  blanket.)
- **Wake** (`lights` on; `woke_up {how: "lights"}`, which has **no reaction today**, only the
  morning one stretches): the light comes up in three steps; the pet blinks (`asleep`,
  `sleepy`, `asleep`, `sleepy` at 150 ms); the blanket **slides off in two steps**;
  `stretch`; the content frame. About 1.6 s.
- **Not evening, a nap:** the same scene (a nap is a tuck too).
- **`not_sleepy`:** 4.4.
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

**Zones.** From `e.clientX/Y` against `s.pat.getBoundingClientRect()`: the top **40%** is
**head**, the rest **body**; left or right of the middle is the **lean side**. A keyboard
pat (`e.detail === 0`) counts as head, no side. The 40% is a default; the bench's
`patBox` outline checks it per shape and a species may carry a `head` fraction later (not
planned).

**The lean:** `rotate +-5deg` about the feet (the pet's `transform-origin` is already
`50% 100%`), 150 ms in, held while pats keep coming (released 900 ms after the last), 300 ms
out. It is the **inline `rotate`** property, which the `.look` flip also uses
(`rotate: y 180deg`), so **no lean while `.look` is on the pet** (a guard, not a bug to
find in review).

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

**Other states:**

- **Asleep:** `pat-slow` as today; the 3rd pat: it **stirs** (the `sleepy` mood frame 500 ms,
  a small turn) and stays asleep; "mm..." 1 in 4.
- **Egg:** `rock` as today; the 3rd pat a **double rock**; in the **7** species that have
  `egg_wiggle_1/2`, those frames play instead (they are drawn and unused).
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
| **praise** | perk; the star rises **from above its head** (a new `prop-rise` keyframe, modelled on `fl-float`, not the floor spot); the `cheer` act and the type's move (exists); a blush (`excited` frame) and 1-2 hearts | variants (no-repeat): hearts; a spin (adult); the child pose (22/30) |
| **scold** (fair, a fake call) | the pet looks up; the finger **wags** above it (`rotate +-12deg`, `steps(2)` x 3); a **flinch** (`startle`) with the `refuse` act; `sulk`; the `bored` frame 1.2 s, then rest. "ok... sorry" is the existing later moment | new kind `scolded` in `REACTIONS` and `STAGE_POSES` (`refuse` act) |
| **scold** (unfair) | the finger wags; the pet **turns away** (the `refuse` act and the `look` flip, a "huh?"); "hey, i didn't do anything!" is the existing line | **add `unfair` to `REACT_REFUSALS`** (`ui-copy.js:430`); today it has no frame |
| **fan** | the fan **slides in** (not pops); the breeze crosses (exists); the pet **leans into it** (`skewX -4deg`), the `cozy` frame (eyes closed), a `shiver` or `dance` class stops; "ahh" line; the fan slides out. **Replaces** the infinite `sway` | new kind `aired`. Predicted from `requests`, so it can use the short scene shape of 5.3(b) later; the floor path is enough |
| **wake** (lights on) | 5.3 | the one place that reuses the scene |
| **clean** (due) | the existing scene, plus: the pet **hops over the broom** as it passes its x (the medicine scene's hop maths), then shakes off (a 2-step `rock`) and cheers at 1.8 s. Water worlds: the pet bobs on the net's wake | a render tweak inside the registry entry |
| **clean** (not due) | the `refuse` act and the flip (exists); variant: a look at the floor (a `look` flip there and back) | refusal variants below |
| **meds** | already rich; add a variant where the pet **sniffs first** (a lean, 300 ms) before it takes it | |
| **meds** (not sick) | the refusal, as above | |
| **lights** | 5.3 | |
| **play** | a **beat before the picker**: the species' `play` prop (the ball) bounces in from the pad, the pet bats it (perk and a lean), 600 ms, then the picker opens. The `ready` act is in **no** species.json, so a game start plays `cheer` instead | the picker must not wait on the beat: it opens at the tap's end, the beat plays over its fade |
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
frame choice above. This is s2734's item 10 (child parity); if s2734 shipped it, ship A
drops this item and builds on it.

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
- **A second tap on the same care ends the scene** without a second call; a tap on the
  screen ends it (both exist).
- **The `.pending` pulse stays on the button** until `callService` resolves, as today.
- **No new infinite loops.** The waiting loop is bounded by the 2 s hold; the old `sway` and
  the 10 s excited `hop` loop are replaced by bounded moves. Only `transform`, `translate`,
  `rotate`, `opacity`, `clip-path` and `mask` (the last two repaint, on one 128 px element).
- **At most about 12 DOM nodes** a scene (crumbs and sparks, removed at `_sceneEnd`).

## 9. Reduced motion

`calm()` (the OS setting, read live) is checked by **every new JS path**; the CSS is covered by
the global rule (`style.js:7-9`).

- **No scenes.** `_sceneStart` takes the existing `sceneFade` branch: the news fades in.
- **The pose still changes** (as `_frames` already does under calm: the first frame): a feed
  shows the `eat` frame and then the content frame; so the pet **visibly reacts** even
  without motion. The prop is shown **still**, beside the pet, and removed with the pose.
- **The dim is instant** (no steps), the drape shows at its final frame, a wake removes it.
- **Pats:** the pat pose and the line, no lean, no wiggle; saturation is the `cozy` frame
  and the line only.
- **Lines and the haptic** are unchanged.

## 10. The ships

### A. The floor (S-M, no art, tier 1)

- Kinds `scolded` and `aired` in `REACTIONS` / `STAGE_POSES`; `unfair` into `REACT_REFUSALS`;
  refusal variants (`REACTIONS.refused` a pool); fan's lean replacing `sway`.
- Praise's star above the head (`prop-rise`); the prop **drop** and **leave** for every care,
  timer-driven; the pose ends with the prop.
- Wake on `woke_up {how: "lights"}`: `stretch`.
- The snack's excited loop spent as one `greethop`.
- The child ladder rung 3 (lift the `drawn === "child"` guard for motion).
- Clean's hop over the broom and meds' sniff (the engine is not touched).
- A one-pose `play` beat before the picker.
- Files: `card-moment.js` (`_react`), `card-tick.js` (`_reactFrames`), `ui-copy.js`
  (`REACTIONS`, `REACT_REFUSALS`), `card-actions.js` (clean, meds), `card-layout.js`
  (the excited loop), `style.js`. Copy: section 14.

### B. The registry, then feed and snack (M-L, no art, tier 1)

1. **Refactor commit:** `SCENES` registry, medicine and clean moved in, byte-identical bench
   contact sheets (4.1). New part `card-care.js`.
2. The `due` predictions, the gate and hold, `refuse`, `_sceneFail`, the `late` owe.
3. Feed (5.1) and snack (5.2), variants A-D each, world and time hooks.
4. **First deliverable of this ship's bowl work:** the 30-species bench sheet for the clip,
   and `bowl_rim` for the species where it reads.
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
- The bedtime scene (5.3a), the wake scene, the blanket chip's shawl (5.3b), the drape as
  state (`asleep` and `lightsOut`), species anchors (`drape: {y, w}` or an opt-out, in
  `species.json` beside `props`).
- The code **ships before the art** with the no-drape fallback and flips on when the files
  exist. Files: `card-care.js`, `card-layout.js` (the state), `style.js`, `species.json` x N.

### E. Child eat and pat (art 100, owner-gated, last)

- `child_eat_1/2` for the **20** species with no child feed pose (40), `child_pat_1/2` for
  all **30** (60). The `child` stage is added to each species' `acts.eat` and `acts.pat`
  **list** (no new key); the `drawn === "child"` guards in `_patPose` and the scene frames
  are lifted. **Lands after the open `art-128-*` branches merge** (they rewrite the `acts`
  line in all 30 files; the nature plan's N1 rule).

## 11. Overlap with other efforts

### Motion ship 1 (s2734, building now)

The brief names four items. They are read from the brief, not from a branch (none on origin):

- **#4 sleep settle on `fell_asleep`.** Ship D's tuck sequence replaces it when the sleep
  came from the lights toy and `s.scene` is live: **the settle guards on `if (s.scene)
  return`**. s2734's settle stays for `collapsed` and `house` sleep. The two must not both
  run.
- **#1 turn-before-travel, the flip as `@keyframes`.** Feed variant B and the tuck turn-round
  both **use it**; the scenes call the class s2734 adds and do not write a second flip.
  Until it lands, the transition-based `.look` (`style.js:780`) works for one flip (a
  200 ms turn) but not the back-and-forth of the turn-round, so **D waits on #1**.
- **#10 child-stage care parity** = ladder rung 3 (section 7). Whoever lands second drops
  its half.
- **#7 egg wobble** uses `rock`. Touch's egg escalation uses `egg_wiggle` frames and the
  double rock, so **the idle wobble and the pat are kept apart** (the pat guards on
  `s.egg`, as today).

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

- **Favourite and resting:** a resting pet is still cared for; the scenes treat it as awake.
  No conflict.
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

The bench already seeks a scene by `care` and `careAt` (`dev/bench/page.js`, 645-650) and
runs the card's own `_pat`. Additions (the README asks for bench fields over HA):

- `care` accepts `feed`, `snack`, `lights`, `blanket`; `careAt` seeks each. The builder adds
  what the fake `hass` needs to pin a prediction (`hunger`, `energy`, `requests`).
- **`variant`** (new): pins `_careVariant`'s pick (`"A"`-`"D"`).
- **`patTap`** (extended): `true` stays; `{n, zone: "head"|"body", side: "left"|"right"}` runs
  n pats through `_pat` with the bench's pinned clock.
- **Contact sheets** (a `--preset care`, `--sheet`): every variant x `careAt` 0, 200, ...,
  2800 at 330, for one adult; the child ladder (rung 1 and rung 3) at 330; **the 30-species
  bowl clip sheet**; the drape sheet (D); the touch ladder n = 1, 3, 5, 8, 10, 12 head and
  body; **`motion: reduce`** for each interaction (the final frame, the prop still, no
  scene); murk and nightsky worlds for feed; big text and mono for the line in the bubble.
- **Medicine and clean byte-identical** before and after the registry refactor (4.1).

### JS tests (`tests/js/care_reactions.test.js`, through `tests/js/card-source.js`)

- `_careVariant`: never the same twice in a row; the conditional filter (variant C only
  under hunger 30); one pick for a pinned `variant`.
- The predictions: `due("feed")` at hunger 94 and 95; asleep, egg, away give null; `lights`
  at energy 94 and 95; `blanket` only with the request.
- The hold clock: `sc.shift` grows while holding and the scene resumes at the gate; the 2 s
  limit; a `late` owe returns false from `_sceneAnswered`, a tap-skip owe true.
- The zone maths (head 40%, the side, `detail: 0`); the escalation counter (the 5 s window,
  n = 10 flops, 11+ is quiet for 8 s, a new run after 5 s idle); no lean while `.look`.
- The child ladder picks rung 1, 2, then 3 by what the species has.
- Every new line fits `scripts/copy-scan.js` (40 characters with the longest fill, no
  nagging words); new tables are added to its `COPY_TABLES`, as the scan requires.

### card-check (a real HA; behaviour only; sections `pat`, `react`, `care`)

- A feed press runs a scene and leaves **no `.scene` element and no inline `translate` or
  `rotate`** on the pet or perch after 3.5 s.
- A feed press at hunger 100 (the server says `full`): the scene ends in the push-away,
  the line is the refusal, the call count is **one**.
- A second tap on the same care ends the scene **without a second call**.
- Under `reducedMotion: reduce` **no scene element appears**, the pose still changes.
- **Lights out keeps the drape** until lights on (D); a `not_sleepy` nap leaves no drape and
  no dim.
- 12 pats: past 10 the pet's class list stops changing (**no class churn**, `pat-soft` only).
- **The tap to `last_care` delta is logged once** (the number the scout estimated).
- `scripts/gate --auto` picks the sections from the diff (`pick-sections`); the batch gate is
  the first mate's, through `scripts/ci-gate`.

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

1. **The bowl's half art.** After the 30-species bench sheet (B's first deliverable), if the
   clip reads poorly on **more than about a third** of the species, does the owner want
   `bowl_half` art for them (up to 30 images, no empty bowl) or accept "it eats, the bowl
   leaves whole" for those? This cannot be answered before the sheet exists.
2. **Ship E's go.** 100 images is a day of the image cap. Does the owner start it after C
   and D, or after a week of living with rung 3 (the mood-frame fallback)?
3. **Does the blanket show on every device whenever the lights are out and the pet is
   asleep** (this plan's call, 5.3: derived from existing state, no data), or only on the
   device that tucked it in (a card-local flag that does not survive a reload)? The
   plan chose the first; it is **visible to everyone who looks at the pet**, which is a
   product call as much as a technical one.
4. **Others' care** gets the floor path, not a scene (4.5). If the owner wants a partner's
   feed to play the bowl scene from the reply, that is a small follow-up after B.

Everything else in the scout's Q1-Q4 is decided (section 1).

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
- **Perf:** one rAF loop per scene as today; `clip-path` and `mask` on a 128 px element.

## 17. Adversarial review checklist

For the reviewer (the numbers are for the findings table):

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
