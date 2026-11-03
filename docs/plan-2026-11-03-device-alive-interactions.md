# Device Alive: the canonical plan

**Date:** 2026-11-03 (rewritten the same day, slice 0)
**Status:** Canonical. Slice 0 of 7; no runtime change in this document.
**Replaces:** `docs/plan-2026-11-03-living-device-interactions.md` (marked superseded; its
§5 tracks, §7 press profiles and §12 authoring model are folded in below).
**Basis:** `origin/main` `5fc36152` (card code unchanged since `ca19f71f`). Every
"built" claim carries a file and line; recheck when a slice starts.
**Review it answers:** the s2803 scout review, findings F1-F19 (cited as F#). Slice 3 was
reviewed again before it started (the s2811 adversarial review, findings B1-B4, M1-M7,
m1-m8, cited as B#, M#, m#); section 13 folds it in and splits slice 3 into 3A, 3B and 3C.
Slice 4 was reviewed before it started (s2818, findings F1-F17 and owner questions Q1-Q5,
cited as F#; the numbers repeat the first review's): section 13 folds it in and splits slice 4
into 4A-4D (FM9); 4C and 4D wait for the owner's privacy answers (section 17).
Slices 5-7 were reviewed before they start (s2824; cited as the s2824 review): slice 5 is
parked until N4's art merges (FM12), slice 6 is narrowed and starts after 4B (FM13), slice 7
is parked (FM14).

The goal: the device reads as a small physical object that notices the house. The order
of value is (1) real Home Assistant changes show on the shell and glass, (2) the
buttons feel like buttons, (3) the pet has a little more to do between care. Nothing
delays care, navigation, dialogue, questions or games.

## 1. Decided (owner, 2026-11-03)

| Q | Decision |
|---|---|
| Q1 | **Device-alive is canonical.** Living-device is superseded; it stays in git as the source of the folded sections. |
| Q2 | **The internals / "world inside the device" slice is dropped for now.** It is deferred, not cancelled: see section 11 (Parked). It is not a slice. |
| Q3 | **Reuse the "screen effects here" switch** (`card-status.js:311`, the `lcdfx` button). No new label, no second row. Ambience and echo follow it. |
| Q4 | **The server `device_fx` slice comes before any art.** |
| Q5 | **Screen morphs come last, optional, CSS only.** |
| FM1 | Generic rim/glass treatments are fine in every world for slices 3-4; world flavour can come later (first mate, 2026-11-03, reversible). |
| FM2 | Rare glass (slice 6) comes before morphs and depends on slice 3B's glass layer. |
| FM3 | No labels: matrix rows stay letterless glyphs; any wording goes to the first mate as a DRAFT question. |
| FM4 | `_houseFx`/`_robotFx` stay as they are through slice 3. The director leases only the new glass/rim classes (named `dir-*`, never `fx-*`) so it cannot clear a `fx-*` class. Whether `_houseFx` moves under a lease is a slice-4 decision; decide it there with the matrix rows (heat/cool/chime overlap rows). (First mate, 2026-11-03, from the slice-1 review F4; reversible.) |
| FM5 | **Slice 2 is CSS only, on the cap.** No director, no `canRender`, no adapter, no TDZ card-check case, no `pick-sections` entry. The per-action rim cues wait for slice 3; section 7's table has no rim-cue column (first mate, 2026-11-03, from the slice-2 review; reversible). |
| FM6 | **Press feel details** (first mate, 2026-11-03, reversible): no minimum pending time (a fast reply may never show it, fine); a refusal gets no cap cue (the care scenes already push away); the nav arrows are out of scope; snack, scold and praise get the default rebound. |
| FM7 | **Slice 3 decisions** (first mate, 2026-11-03, from the slice-3 review; reversible). **B1:** `occurred_at` is the server pass time, not the sensor's time (section 6.4). **B2:** leading-edge accept, plus "a reverse is blocked for N s, then re-evaluated", run by an explicit `async_call_later` timer; the onset latency is given as a number (section 6.4, 6.5). **B3:** unknown is its own state, not dry: no onset into or out of unknown (section 6.2, 6.5). **M3:** no visual quiet hours; a silent rain drop may play at night; reduced motion = static ambience, no onset and no echo motion; the "screen effects here" switch off = nothing drawn (section 6.7, case 12). **m1:** slice 3 ships only a `rain` boolean on the wire; the schema example is cut to `rain` (section 6.2). **M7:** a reconnect snapshot on an already-viewed slide never echoes (section 6.7). |
| FM8 | Order 3A (server) then 3B (client rain adapter) then 3C (rim cues, which use 3B's adapter). The rain reverse block is N = 45 s. (First mate, 2026-11-03, reversible.) |
| FM9 | **Slice 4 is four PRs** (first mate, 2026-11-03, from the slice-4 review s2818, F8; reversible): **4A** weather server, **4B** weather client (and the client-computed moon, FM11), **4C** activity server, **4D** activity client plus moment-driven rim cues. 4A and 4B start now. **4C and 4D wait for the owner's privacy answers (section 17, Q1-Q4)** and are not startable until the first mate records them here. Section 13 has the rows and the slice 4 acceptance table. |
| FM10 | **`_houseFx`/`_robotFx` do not move in slice 4** (first mate, 2026-11-03, from s2818 F10; reversible). This closes FM4's open question. **One cue per event:** where a moment already drives an `fx-*` cue, a rim cue for the same event is offered from **the same card handler at the same instant** (client-only), never from a second server edge a debounce later. No recipe in `device-fx.js` names an `fx-` class (source test, section 13). |
| FM11 | **The moon is client-computed and off the wire; arrival is cut** (first mate, 2026-11-03, from s2818 F5 and Q5, FM side; reversible). `moon_date` always falls back to the date (`watcher.py:438-442`), so a moon key would put `device_fx` in every house and void case 16; the client computes full/new from `serverNow()`. Arrival is presence (section 3) and its own matrix echo was "arrival only". |
| FM12 | **Slice 5 is parked until species N4's art merges, then re-scoped; glass curiosity is dropped** (first mate, 2026-11-03, from the s2824 review, slice 5; owner may override; reversible). N4 has not shipped (no `signature` data or card code on main), so "only if N4 leaves them open" has no input yet. Glass curiosity is art per species (a face or paw touch is a pose) and slice 6's glass in disguise. The re-scope is two rows (post-play settle, link-port curiosity) with the acceptance in section 13. Section 8. |
| FM13 | **Slice 6 is generic marks only; rare; after 4B** (first mate, 2026-11-03, from the s2824 review, slice 6; owner may override; reversible). **Marks:** paw print, smudge, rim shadow, in every world (FM1); **no leaf** (it is Woodland-flavoured; a world flavour can come later). **Rarity:** one mark per about 20 minutes of *viewed* time, per pet, in memory only (no saved field), **no night rule** (M3: no visual quiet hours). **Order:** starts only after 4B has merged, because 4B puts snow, fog, storm and wind on the same `.hw.glass` and the same `s.dirEffect`; slice 6 gets its own layer, scheduler and acceptance (section 9, section 13), and a card-check `elementFromPoint` assertion that the mark is never over a control. |
| FM14 | **Slice 7 (screen morphs) is parked like section 11** (first mate, 2026-11-03, from the s2824 review, slice 7; owner may override; reversible). It stays as a paragraph in section 10 and is not a slice. It is re-planned only when the owner asks, after seeing slice 6. This narrows Q5 ("last, optional") to "parked". |

Consequences: the first four slices need no art. The plan has no new player copy; any
wording a slice finds it needs goes to the first mate as a DRAFT question, not into the
code (section 12).

## 2. What main already has (dropped from this plan)

These were in one or both older plans as work to do. They are built; the plan builds on
them and does not redo them.

| Dropped | Where it is | Was |
|---|---|---|
| Care reactions: anticipation at the tap, the commit gate, the push-away on refusal, the scene frame | `SCENES` in `card-care.js:24`; the shared frame in `card-actions.js` (`_sceneStart/_sceneRender/_sceneEnd`); `_press` passes `perk:false` into `_tapped` when a scene owns the body (`card-actions.js:83`). Notes in care-reactions §19-22. | F1: "provisional-care", "retract on refusal" |
| Cap depress on press and hold, with the darker bevel and tones | `.toy:active .cap, .toy.pressed .cap` and the `-dn` clip and tones (`style.js:1288-1291`). `:active` fires on pointerdown and on held Space/Enter. `_tapped` adds the ring, the 12 ms haptic and the perk on click. | F2: new pointer/keyboard handlers for the down state |
| Idle manner N1 (habit-weighted idle moves, `_idleMoves` `card-tick.js:294`) and the once-a-day sky glance `_skyReact` (`card-moment.js:488`, called at `card-tick.js:465`) | species-nature N1 | F8: "notice ambient weather" |
| Species action-line layer N2 (`card-tick.js:240-270`); "paw/fin inspection" is the `groomer` habit | species-nature N2 | F8: "paw/fin inspection" |
| Hardware layers `.hw.guts`, `.stripes`, `.light` (`card-build.js:127`; `style.js:825-845`). `.hw.guts` is already the board behind the screen for the clear finish. | device-charm | F3: a new under-plastic internals plane |
| In-screen rain, storm, wind: `.screen.raining/.stormy/.windy` from the `flags` attribute (`card-layout.js:620-628`), layers at `style.js:717-719, 950-1002` | real-time connections | F14: ambient weather on the display |
| `_houseFx` and its six screen classes (`fx-heat/cool/suds/tumble/chime/robot`, 2.5 s timer) | `card-visit.js:610`, called from `card-moment.js:191,210,220,236` | F13 |
| `serverNow()` (`shell-data.js:293`), `_watchServerClock` (`card-base.js:88`), `_flairTick` (`card-flair.js:4`) | | F15, F16 |

Still true and still relevant: the **bespoke tuck art set is in progress** (the older
review called it shipped; it is not). Nothing here touches the tuck, wake or drape beats.
The motion for them is care-reactions §22; the art is its own ship.

## 3. Rules every slice keeps

- **Action is authoritative, the visual is disposable.** Input dispatch, service calls,
  server state and care results never wait for presentation.
- **Protect interaction.** No new effect covers a control, text input, modal, question,
  the status view, a game or a focus ring.
- **Quiet by default.** No automatic audio. Haptic only from the user's own gesture
  (`_tapped` already vibrates on every click, `card-actions.js:20`); never from the house.
- **Privacy.** A whitelisted enum payload; no entity id, media title, name, camera or
  precise presence; shared screens get nothing a personal one would add. No unbounded HA
  subscription.
- **No new stats, currency, reward, failure state or save field.** `PetState` is
  untouched; the ring is in memory. A recorded week must equal main (as in
  favourite-resting §9).
- **Motion rule (AGENTS.md).** Persistent state uses `translate`, `rotate`, `scale`; one
  one-shot `.pet.<cls>` animation at a time; a new flip is a `@keyframes`; reduced
  motion honoured in CSS and `calm()` (`prefs.js:188`). Each new `.pet.<cls>` rule with
  an `animation` needs its line on `ALLOWED` in `tests/js/motion_rule.test.js`, checked
  to never run with another one, with a comment next to the rule (F11). Prefer `.screen`
  and `.hw` layers over the pet body.
- **Ambient never overrides `.lit`.** The player's own backlight stays its own control;
  an ambient tint is added to it, never in place of it.
- **Offscreen and hidden stop.** No new `setInterval`; one `_tick`; freeze on
  `document.hidden`; on return paint the current state, not accrued frames. No `filter` or
  `blur` on the live subtree.
- **Performance numbers are review items, not gates.** The bench renders states, not
  frame timing. The checkable ones are structural (the two above).

## 4. Vocabulary: state, edge, echo

- **Ambience (state):** what the house is now, drawn quietly. Always correct even if no
  onset was seen.
- **Onset (edge):** a live change while the slide is on show. A short shell/glass pulse,
  and a pet look only if the body is free.
- **Echo:** a first view within the window after a meaningful change plays one shortened
  onset, only if the state still matches. It is not a speech replay and not a claim that
  the event just happened.
- **Catch-up** text (the existing `msg.moments`) is never re-spoken and never drives a
  pulse (`card-base.js:303`; the live gate is 15 s, `card-base.js:333`).

## 5. Tracks and the director

### 5.1 Tracks (from living-device §4-5, DA §6.2)

| Track | Examples | Rule |
|---|---|---|
| `control` | cap feedback | Never blocks activation; may coexist with a shell pulse. |
| `shellAmbient` | static glass and rim tint from current state | Long-lived; never leased out. |
| `shellImpulse` | one short pulse on the shell or glass | One per slide; the latest compatible event may replace. |
| `screenFx` | a morph (slice 7 only; parked, FM14) | Exclusive; never over status, a game or a question. |
| `petBody` | perk, glance, idle chain, care response | Exclusive; goes through `_animate`, `_sceneStart/_End`, `_idle`, `_flair`, visitor/link. No competing CSS animation. |
| `text`, `modal` | bubbles, questions, game prompts | The card owns them. The director reads them as busy and never cancels them. |

Priority, highest first: input and open modal/question/game; care scenes and their
result; significant pet moments (hatch, wake, visit, link); live house onset (shell only
unless the body is free); echo and optional morph; flair and idle; ambience. Tracks are
not one mutex: a busy pet body can sit beside a shell pulse. A modal blocks `screenFx`
but not `shellAmbient`. On conflict the decorative request is dropped or replaces a lower
one on its own track. **Nothing queues. A missed cue is never owed.**

### 5.2 Placement (F9): a pure part, like `hop-engine.js`

- New `src/card/interaction-director.js`: one frozen namespace (`HATCH_DIRECTOR`), no
  `this`, no DOM, no HA. An injected clock and `canRender`. It sits in `manifest.txt`
  beside `hop-engine.js`, before the class chain; it is not a link in the chain.
- Adapters live in the parts that already own the thing they touch: `card-build.js`
  (layers, lifecycle), `card-layout.js` (`_renderSlide` applies ambient state and must
  not restart a pulse on every redraw), `card-actions.js` (cap), `card-tick.js` (idle
  offers), `card-moment.js` and `card-visit.js` (house cues), `card-base.js` (channel).
  A method stays in one part. There is no `card-interaction.js` chain link.
- A reorder of the manifest can hit a TDZ that only card-check shows. Slice 1 adds no
  card-check case and no `scripts/pick-sections` entry: nothing uses `HATCH_DIRECTOR`
  yet, so neither could fail, and `gate --auto` picks no section for a new part, a
  manifest line, `tests/js` and docs (`scripts/pick-sections:96,138-141`). Slice 1's guard
  is `tests/js/interaction_director.test.js`, copying `hop_engine.test.js:19-31`: in the
  built card, before `class HatchPetCardBase`; one frozen namespace; the part's only
  top-level declaration is `const HATCH_DIRECTOR`. The TDZ card-check case and any
  pick-sections change moved to the first slice with an adapter, which is 3B (built: section 13, "As built in 3B").
- **`_houseFx` / `_robotFx` are not adopted (FM4).** `_houseFx` (`card-visit.js:610-616`)
  already does the `shellImpulse` job for the `fx-*` screen classes (one class, one
  2.5 s timer, no busy test); `_robotFx` keeps a second timer (6 s). They stay as they
  are through slices 3A-3C. The director leases only the classes it adds, named `dir-*`, never
  `fx-*`, so it cannot clear one. The slice 3B rain pulse lands on the new glass
  element (section 6.6), not on the `.screen` classes `_houseFx` toggles, and not on
  `.device` (`_layout` rewrites `dev.className`, `card-layout.js:455`, and would wipe a
  `dir-*` class there). A source test greps the adapter for `fx-` and fails on a hit, so the
  two families stay apart (m5). Whether `_houseFx` moves under a lease is slice
  4's call, with the heat/cool/chime overlap rows of the matrix.
- Data stays declarative (section 5.4), with generic fallbacks so a new species, an
  unknown kind or a future shell still works.

### 5.3 API (illustrative, pure, tested with `node --test`)

```js
HATCH_DIRECTOR.create({ now, trusted, canRender, schedule, recipes })
  .setAmbient(slide, state)          // current normalized state; stored even when canRender is false
  .offer(slide, cue)                 // -> { accepted, reason, effectId }
  .enterView(slide, recent, trusted) // at most one echo
  .cancel(slide, reason, tracks)
  .release(slide, effectId)          // ends one effect by its token (animationend); false if stale
  .tick(now)                         // expires TTLs; called from the card's existing _tick
  .detach(slide)                     // timers, animations, observers
  .reset()                           // disconnect
HATCH_DIRECTOR.BUSY_OWNERS           // the one busy list (below); no setBusy
```

Built in slice 1 (`src/card/interaction-director.js`), beyond the sketch: `create` also takes
`deviceNow`; `ambient(slide)`, `isBusy(slide)`, `busyOwners(slide)` and `inspect(slide)` read
state; `setAmbient` returns `{changed, render}` (the director paints nothing, the adapter does,
from `ambient(slide)`); `HATCH_DIRECTOR.PRIORITY` names section 5.1's ladder for recipe authors.

Inputs are injected, so the part stays pure:

- `now()` is the server clock the card passes in (`serverNow`, `shell-data.js:293`).
  `trusted` (a boolean or a function) says whether that clock is trusted (see section 6.7);
  `enterView` takes it too, and anything but `true` (including unset) is untrusted.
- `deviceNow()` is the device clock (`Date.now`), for the busy read only. The slide's own
  timers (`poseUntil`, `card-build.js:409`) are set from the device clock, `now()` is
  offset from it by up to a day, so comparing them would be wrong. It defaults to `now`.
- `schedule(ms, fn) -> cancel` is the only timer. The director never calls `setTimeout`
  itself; tests drive it with a fake. There is no new `setInterval` (section 3): `tick(now)`
  rides the card's existing `_tick`.
- `canRender(slide)` is `lcdOn()` (`prefs.js:251`; the Q3 switch, per browser) plus
  on-show and visible; the adapter does **not** put `!calm()` in it (M3). When it is false
  there is no onset, no echo and no pulse, and `setAmbient` returns `render:false`
  (`interaction-director.js:178-182`) so no ambience is painted either, but it still stores
  the state so a later switch-on paints it. Reduced motion is a different gate: it needs
  static ambience drawn and no onset or echo motion, so under `calm()`
  (`prefs.js:188`) the adapter calls `setAmbient` with `canRender` true and never calls
  `offer` or `enterView`; or, equivalently, the `dir-*` motion rules sit under
  `@media (prefers-reduced-motion: reduce)` with a still fallback (the pattern at
  `style.js:975,999,1000`). Three gates, then: switch off = nothing; reduced motion = static
  only; busy owners = the director (FM7/M3). The bench and card-check read the switch from
  `lcdOn()`, not from a copy of its key (m6).
- `slide` is the slide object `s` itself, not a string key. Per-slide state sits in a
  `WeakMap`, so `_forget` (`card-build.js`) is `detach` and a dropped slide is freed.

A cue carries an id, kind, origin (`user|house|pet|idle`), the server `occurredAt` (ms on
`now()`'s clock; the adapter turns the wire's `occurred_at` ISO string into it, and
`expires_at` into `ttlMs`), a presentation (`onset|echo|ambient|interaction`), a TTL, a
`direction` (`start|end`, only for a transition that has an opposite) and a whitelisted
`data`. A recipe names the `collapseKey` it shares with its opposite: an end that meets its
own still-running start (or the reverse) ends both and plays neither, and in an `enterView`
ring a start then an end cancel each other. A recipe may also give `echoRank` (lower plays
first, section 6.7's order), `echoMs` (the shortened length; half of `durationMs` if unset)
and `stillTrue(ambient, cue)` (else `data.key`/`data.value` against the ambient state).
The wire `kind` (`rain_started`) is the adapter's to map to a recipe kind and a direction. The
server never sends CSS, JS, HTML, selectors or asset paths; the client picks from recipes
it declares.

Per slide, bounded in memory: active tracks, ambient state, `seenFxIds` (about 128), one
`pendingEcho` (a house onset offered while nothing may render, kept if it is the best, for
`enterView` to use; it is never played late by itself), `lastMicroBeat`, cooldowns. The
generation is one counter for the director, so no two effects share a token. A cue is
marked seen once it is decided (played, dropped or collapsed), not when nothing may
render or the clock is untrusted: those stay eligible for an echo inside their window. **Every effect has a generation token**; a
timer or animation callback checks it before it clears a class, so an old timeout cannot
clear a newer press. Never rely only on `animationend` (a hidden tab may drop it): each
effect also gets a bounded watchdog, a `schedule` call the director cancels with the
effect.

**Busy owners (F12): pulled from one named list, not pushed from ~62 call sites.**
`s.scene` is touched 46 times, `s.power` 14, `s.visitor` 9, across `card-build.js`,
`card-visitors.js` and `card-actions.js`. A `setBusy` push API would need a hook at every
set and clear, and one missed path leaves a stale "busy" or a stomp. So there is none.
The director reads `HATCH_DIRECTOR.BUSY_OWNERS`, a frozen table inside the part, and asks
`isBusy(slide)` at the moment it offers or paints. The card's adapters set nothing.

Each entry is `{ name, busy(s) }` over plain slide fields, and `busy` is a pure read:

| Owner | Read |
|---|---|
| `game` | `s.game` (the Hop board's keys live in the `gameBox` overlay) |
| `scene` | `s.scene` |
| `power`, `powerPending` | `s.power`, `s.powerPending` |
| `visitor` | `s.visitor` |
| `asking` | `s.asking` (a boolean; `s.ask` is the question itself) |
| `laySheet`, `picker` | `s.laySheet`, `s.picker` |
| `linking`, `calling` | `s.linking`, `s.calling` |
| `asleep` | `s.asleep` |
| `pose` | `s.poseUntil > now` (`card-layout.js:598`) |
| `status` | `show-status` is a class, not a field (`style.js:674` already hides `.rain`, `.breeze`, `.flash` under it); the adapter passes it in as `s.statusOpen`, set in `_toggleStatus` only (`card-layout.js:781-786`) |

(The `status` row is the one owner with no field today. Slice 1 only reads
`s.statusOpen`; the one line in `_toggleStatus` that sets it is an adapter, so it lands
with the first slice that has adapters, which is 3B (it sets it, and the table test no longer sets it by hand).  No other owner needs one.)

**How slice 1 checks the list is complete** (a source test, no device). The card already
has two "can the body act" gates, `_freeBody` (`card-tick.js:122`) and `_ghosting`
(`card-tick.js:70`). The test in `tests/js/interaction_director.test.js`:

1. reads the built card text, takes the `s.<field>` names those two methods test, and
   fails on any name that is in neither `BUSY_OWNERS` nor the test's short `NOT_BUSY` list
   with a one-line reason each (`species`, `moodState`, `propUntil`, `flairUntil`,
   `movingUntil`, `pet`, `screen`: traits, timers or elements, not owners);
2. fails if a `BUSY_OWNERS` field is never assigned anywhere in `src/card/*.js` (a
   rename leaves a dead read);
3. runs `isBusy` over a table: each owner alone makes the slide busy, none makes it free.

A new owner that appears in `_freeBody` or `_ghosting` therefore fails the test until it
is classed. A field gated elsewhere is not caught by this; that is the stated limit, and
a later slice that adds a gate adds its field to the table in the same PR. A bench shot
per owner comes with the adapters (Hop board open; status sheet open), not slice 1.

### 5.4 Authoring model (from living-device §12)

Keep content declarative so a designer adds an effect without touching arbitration:

```js
// A sketch. Names follow shell-data.js (world keys) and the signal map (section 6.2).
const SHELL_EFFECTS = {
  woodland: {
    events: { rain_started: { shell: "bead", pet: "glance" } },
    ambience: { rain: "wet-rim", night: "amber-low" },
  },
};
```

Five descriptors, kept apart: **ambience** (current state to CSS classes and custom
properties), **event** (a fresh cue to eligible track effects), **idle** (eligibility to
slice 7, parked), and the **reduced-motion fallback** (the same cue as a static tint, one opacity
change or nothing). Every recipe declares: track, priority, `durationMs`, `cooldownKey`,
preconditions, reduced-motion fallback, cancel behaviour (`finish|fade|reset`), the
classes and custom properties it touches, and a disposer. World data for shells lives in
`shell-data.js`, not `world.js` (F18).

## 6. The Home Assistant signal bridge (the first priority)

### 6.1 Why a server module (F6)

`HouseMoments._weather` emits only `rain_started`, `rain_stopped`, `rainbow`,
`snow_started`, `sun_out`, `hot`, `cold` (`home.py:545-600`), only while the pet is
awake, with a 20 min gap and a 90 min per-change cooldown (`rates.py:322-323`). There is
no snow-end, storm, fog or wind moment, and lights, fireplace, TV, heating and cooling
have no edge event. A client-only version cannot work for a sleeping pet or a throttled
weather change. So the detector is a new `custom_components/virtual_pet/device_fx.py`
that reads **`Readings` directly** (`home.py:49-86`: fireplace, music, tv, heating_on,
cooling_on, room_light_level, condition and wind; the `SNOWY/FOGGY/STORMY/WINDY` sets at
`home.py:105-113`), not the speech-gated moments. Doorbell, robot and appliance edges
already exist (`doorbell_live`, `robot_*`, `appliance_done`, `house_*`). Whether
`device_fx` takes those as post-gate moment events, or detects them a second time from
raw readings (a doorbell is not in `Readings` at all), is **open**: the weather keys of
slice 4A need no answer, and the doorbell, robot and appliance rows wait for Q2-Q3
(section 6.6a, section 17). The reading of F3/F10 to carry into any answer: a moment that
the card already receives is not detected a second time on the server (FM10). Moments are
also gated by `awake` and by cooldowns (`rates.py:304,341,342`); a row that is public only
because it was gated must not bypass that gate (s2818 F16).

### 6.2 Schema and the signal map

Slice 3 ships the rain row and nothing else on the wire (m1):

```json
{
  "device_fx": {
    "version": 1,
    "current": { "rain": true },
    "recent": [{ "id": "generation-sequence-218", "kind": "rain_started",
                 "occurred_at": "2026-11-03T19:30:00+00:00",
                 "expires_at": "2026-11-03T19:31:30+00:00", "scope": "house" }]
  }
}
```

A proposed schema. `current` is whitelisted booleans and enums, never an HA string (section
6.2a). Later slices add keys one row at a time; slice 3 sends only `rain`, slice 4A adds
`snow`, `fog`, `storm` and `wind`, and the activity keys (lights, fireplace, TV, music,
heating, cooling, vacuum) wait for the owner (FM9, section 6.6a). Room-light and
fireplace state with timestamps on a **shared** wall tablet is presence-adjacent (section
3). `night` in `Readings` is the bedtime window (`home.py:50`), not dawn or dusk, and
**dawn/dusk has no wire key**: `sun_up` already gives the `sunrise`/`sunset` moments, and a
dawn/dusk rim, if it ships, is client-side. A new key is additive: **no `version` bump**
(an unknown `version` is ignored by the client, so a bump would drop rain and every other
key on a newer server). Rain adds nothing new
publicly: `flags` already carries it. Timestamps are UTC ISO from `dt_util.utcnow()`, like
the rest of the channel (`coordinator.py:1190,2913`), not a local offset (m3).
`occurred_at` is the server pass time (B1, FM7; section 6.4).

`device_fx.py` owns normalization, transition detection, per-category hysteresis, TTL, a
bounded in-process ring (about 16 events, 90 s), a monotonic sequence plus a generation
nonce, and the serialized snapshot. Each pet has its own coordinator, watcher and
debouncer (`coordinator.py:350-366`), so each gets its own `DeviceFx` (m7). The whole
`device_fx` key is **omitted** when no key could ever be present (the per-key rule of
section 6.2a), so a house with nothing mapped has a `_house_view()` equal to main (case
16). On restart it rebuilds `current`
and **never invents a recent transition**. A source without an exact onset sends only
ambience. Old clients ignore additive fields; an unknown `version` is ignored by the
client: no ambience, no echo (m2; there is no static baseline for rain to fall back to).

**Rain is known, or it is unknown (B3, FM7).** `Watcher._get` holds the last good value
`HOME_HOLD_MINUTES = 10` (`rates.py:301`) and then returns `None`; with no rain sensor
and no weather reading `is_raining` is `False` (`home.py:115-117`), so calling it alone
would turn an 11-minute outage into `rain_stopped` and the recovery into `rain_started`.
So `device_fx` first asks whether the reading is known: **known iff
`r.rain_rate is not None or r.condition is not None`** (the guard `HouseMoments._weather`
already uses, `home.py:551-558`). Known: rain is `is_raining(r)`, so `flags`, speech and
`device_fx` share one truth. Unknown is its own state, not dry:

- entering unknown keeps the last accepted value, adds no ring entry and sends no live
  message; a hysteresis block still running is dropped;
- the first known reading after unknown is **silent**: `current.rain` takes the new value
  (ambience is truth) and nothing enters the ring, even if it differs from the value held
  before (no onset out of unknown). The same rule covers the very first known reading
  after a restart (the `self.raining is not None` pattern, `home.py:554`);
- `current` **omits** `rain` while it has never been known (not `false`), or the card would
  see dry, then wet, at startup; the card reads a missing key as "nothing to paint".

Tests: one for each of: unavailable for under and over the 10 min hold, then back (same
and changed value); never known; first reading after a restart.

**`DEVICE_SIGNAL_MAP` and what "machine-checked" means (F9).** Slice 4A turns 3A's
`assert KINDS == ("rain_started","rain_stopped")` (`test_device_fx.py:103-107`) into a map,
and the recipe half is JS, which pytest cannot see. So, exactly:

1. `DEVICE_SIGNAL_MAP` in `device_fx.py` is the one source. Per key it holds
   `{type: "bool" | the enum's members, kinds: (started, stopped), block_s, echo: bool,
   echo_ttl_s, echo_rank}`; `KINDS` and the `view()` whitelist are **derived** from it, and
   so is the per-key table of section 6.5.
2. `tests/js/device_signal_map.json` is a committed export of that map. A pytest rebuilds
   it in memory and **fails on a diff**, with an `--update` hint in the message. A node test
   loads the JSON and asserts: every wire kind has a `HATCH_DEVICE_FX.KINDS` entry and a
   `RECIPES` entry; every ambient key is read by `ambientOf` and painted by `paint`; the JS
   names no kind absent from the JSON; every key has a bench shot in the `alive` preset
   (a new row cannot land without a look).
3. Python: `view()` output keys and values are a subset of the map's types (the fuzz of
   section 6.2a); a kind outside the map never reaches the ring. This is a raised error or
   a dropped entry, **not** the `assert` in `_add`, which `-O` strips.
4. "A future kind gets an approved fallback only, never a generic flash" is defined as:
   **a kind the card has no recipe for is ignored** (the director returns `no-recipe`;
   ambience unchanged, nothing drawn). The test that backs the claim is the existing
   unknown-kind drop in `device_fx.test.js` (near line 172).

### 6.2a What may cross (s2818 F1, F5)

The baseline is what every viewer of a shared pet already gets: the `flags` carry `windy`,
`foggy`, `snowy`, `fireside`, `vroom`, `dancing`, `watching_tv`, `dim`, `too_bright`, `cozy`,
`cool`; `PRIVATE_READINGS` are always redacted (`const.py:82-92`); `house.media` already
reaches shared screens (`coordinator.py:2907`) and does **not** license a title in
`device_fx`; `CHANNEL_CATEGORIES` and `doorbell_live` are deliberately not public or kept
(`const.py:169-175`). What `device_fx` adds is the **edge with a timestamp, replayed for
90 s to whoever opens the screen next** (`recent`, the snapshot). That is an activity log,
and it is what these rules police.

1. **Wire values are a bool or a closed enum declared in `DEVICE_SIGNAL_MAP`.** The
   serializer drops any other type and any member outside the enum. `current` is
   **rebuilt from the map**, never copied from a reading.
2. **Forbidden on the wire, for good:** entity ids; friendly names; titles, artist, series;
   media app; room or area names; device counts or any "how many" (lights on, pets, people);
   brightness numbers or lux; temperatures; presence, `company`, motion, arrival; user ids;
   an appliance kind (unless the owner says so, Q3); any timestamp finer than a 90 s ring
   entry's (`occurred_at` stays the pass time, section 6.4, not the sensor's).
3. **A key with an onset and an echo ships only when its edge is not an activity log.**
   The weather keys (`rain`, `snow`, `fog`, `storm`, `wind`) qualify: their state is already
   in `flags` and the edge is the sky's. Every activity key (lights, fireplace, TV, music,
   heating, cooling, and doorbell and appliance as rows) is **pending the owner's privacy
   answer (Q1-Q4, section 6.6a)**: a state already being in `flags` is necessary, and is
   not enough.
4. **The canary test is built from the map.** `test_public.py` today hardcodes `{"rain"}`
   and `kind.startswith("rain_")` (lines 473, 481, 484). It builds its whitelist **from
   `DEVICE_SIGNAL_MAP`** instead, and a fuzz case sets every mapped source to a string
   canary (`"Zebulon"`, a `media_title`, an entity id) and asserts the canary appears in no
   message, no snapshot and not in `device_fx_recent`, on a shared channel and a private
   one. A new key therefore gets the audit with no test edit.

**A key is present only when its source is mapped and known (F5).** `_fx_mapped()` is
weather-or-rain only today (`coordinator.py:2890-2895`) and gates `_house_view`, the ring
and `observe_rain`; slice 4A makes it **per key**. A key is present in `current` only if
(a) its source is mapped and (b) the key has been **known** at least once (section 6.5's
known-guard), and it is omitted, not `false`, until then. `device_fx` is omitted when no key
could ever be present. Case 16 ("a house with nothing mapped equals main") is restated per
key: a house mapping only a snow source has only `snow`, and a house with no source has no
`device_fx`. This is why the moon is not a key (FM11): its date fallback is always known.

**Compound weather (F7).** `condition` is one string, so `lightning-rainy` is both rainy and
stormy (`home.py:109-112`), and `windy` is also set from `wind_kmh`/`gust_kmh`
(`home.py:126-132`). So: `snow`, `fog` and `storm` are known iff `condition is not None` (a
rain sensor alone does not make snow "dry"); `wind` is known iff `condition`, `wind_kmh` or
`gust_kmh` is not None. **When one pass produces several onsets** (a `condition` change
giving `rain_started` and `storm_started`), they would contend for the one `shellImpulse`
track (`REPLACES_EQUAL`, `interaction-director.js:26`) and the later wins within a frame.
The rule: **one onset per pass; storm supersedes rain**, otherwise the higher echo rank
of section 6.7. The superseded onset gets no ring entry and no live message; `current`
still carries every key's truth, so the ambience is right and the echo shows one kind.

### 6.3 Delivery on the real channel (F5, B4, M1)

`_channel` returns early when a message has neither `mine` nor `house`
(`card-base.js:344`), and `_push_watchers` diffs only `(mine, house)` held in `_sent`
(`coordinator.py:2943-2970`). So a bare `device_fx` key would be dropped. The spec:

- **Only `current` rides in `_house_view()`** (`coordinator.py:2884`, "what every screen
  sees"; `_shared_house` at `:2878` covers shared screens). It diffs and resends with
  `house` as any house change does, and the snapshot carries it. No change to the `_sent`
  tuple shape. `recent` is **not** in `_house_view()` and not in `_sent`:
  `channel_snapshot` stores the house it sends in `self._sent[token]`
  (`coordinator.py:2917-2920`) and `_push_watchers` compares each later `_house_view()` to
  it, so a `recent` on one side only (or one that expires between pushes) is a spurious
  `{"house": ...}` (B4).
- **`recent` rides beside the house on the snapshot**, as `snapshot["device_fx_recent"]`
  (the name 3A built), built **after** `_sent` is stored and never
  diffed. It feeds the first-view echo only. A `tests/test_channel.py` case: after
  subscribe, a no-change `_push_watchers` sends nothing (the existing tests at `:179` and
  `:459` rely on exact push lists).
- **Onsets are a new top-level live message key**, `{"fx": {...}}`, **not** under
  `moment`. Old cards run `_keepMoment` and `_channelMoment` on anything under `moment`
  (`card-base.js:329-339`) and could keep or say it; a top-level unknown key is dropped by
  an old card at `card-base.js:344`. The new handler goes in `_channel` **before** that
  early return and before `s.statusHtml = null; this._redraw(s)`: an onset must not redraw
  the slide. It is sent through `_to_channel` (`coordinator.py:2999`). Both sides go in
  the same PR (3A has the server half, 3B the handler), with a `tests/test_channel.py`
  case for each.
- **As built in 3A (the wire 3B reads).** Three places, nothing else:
  1. the house view (and so every `house` message and the snapshot's `house`, shared
     screens too): `house.device_fx = {"version": 1, "current": {"rain": bool}}`.
     `rain` is **missing** (not `false`) until the server has known it once; the key
     `device_fx` is missing for a house with no weather entity and no rain sensor. A
     card reads either absence as "nothing to paint", never as dry;
  2. the snapshot, beside the house: `snapshot.device_fx_recent`, a list of ring
     entries oldest first (empty, or missing for a house with no `device_fx`). It is
     not in `house` and is never sent in a diff;
  3. a live top-level message `{"fx": entry}`, one per accepted transition, to every
     watcher (shared included), sent after any `house` message of the same push.
  An entry is `{"id", "kind", "occurred_at", "expires_at", "scope"}` and the same shape
  in both places: `kind` is `rain_started` or `rain_stopped`, `scope` is `"house"`, the
  times are UTC ISO from the accepting pass, `expires_at` is 90 s on, `id` is
  `<nonce>-<n>` (a per-run nonce, so an id never repeats after a restart). An entry has
  no `version`: the card keys on `house.device_fx.version`. A watcher that connects in
  the pass that accepts a change gets the entry in its snapshot ring **and** live, same
  `id` (case 7): the card dedups by id. The timer for the held reverse lives on the
  server (`DeviceFx._timer`, one `async_on_unload` in `_listen`, not one per block).
- **Order (M1).** `_sense_home` runs before `_publish()` (`coordinator.py:897-904,662`).
  If an onset were sent inside `_sense_home`, it would reach the card **before**
  `house.device_fx.current` changes, and the director's `admit` does not check `stillTrue`
  for live offers (only `enterView` does, `interaction-director.js:234-238,296`), so the
  card would paint an onset against an old ambient. So `_sense_home` only **collects**
  fresh ring entries, and they are sent at the end of `_push_watchers`, **after** the house
  diff, in one flush that both callers share. Test: the house `current` goes out first,
  the `fx` message second.
- **As built in 4A (what 4B reads).** The wire shape of 3A, with more keys; nothing else moved.
  1. `house.device_fx = {"version": 1, "current": {...}}` (still `version` 1: a key is
     additive). `current` holds any of `rain`, `snow`, `fog`, `storm`, `wind`, each a bool,
     **in that order** and each **missing (not `false`) until the server has known it once**.
     A weather entity that is mapped and reads normally gives all five at once; a house
     with only a rain gauge gives `rain` and never the others (a gauge says nothing of
     snow); `device_fx` is missing from a house with neither. A card reads a missing key as
     "nothing to paint" for that key.
  2. Ring entries and the live `{"fx": entry}` are the 3A shape, unchanged (`id`, `kind`,
     `occurred_at`, `expires_at`, `scope`; no `key` field and no `version`). `kind` is
     `<key>_started` or `<key>_stopped` for the five keys: **the key is the kind with its
     suffix removed**. `snapshot.device_fx_recent` is the same list, oldest first.
  3. `tests/js/device_signal_map.json` is the map's export: `{"version", "scope", "keys":
     {key: {type, kinds, block_s, echo, echo_ttl_s, echo_rank}}}`, in map order (rain,
     snow, fog, storm, wind). Every row is `bool`, `block_s` 45, `echo` true, `echo_ttl_s`
     90, `echo_rank` 2. `tests/test_device_fx.py::test_the_map_is_exported_to_the_json_the_card_tests_read`
     fails on a diff and says how to update it (`UPDATE_DEVICE_SIGNAL_MAP=1 pytest ...`).
  4. **One onset per pass, so a kind can be missing even though `current` changed.** Two
     keys that change in one pass send one entry: the same direction goes to the storm
     over the rain, otherwise a start beats a stop (`rainy` to `snowy` sends only
     `snow_started`; `rain` has gone false in `current` with no `rain_stopped`), then the
     lower `echo_rank`, then the map's order. 4B must take `current` as the truth and an
     entry as at most one cue; an echo for `rain` can be dropped by its own `stillTrue`
     (current disagrees) as usual. (The start-over-stop tie-break is 4A's; the plan text
     gave only "storm over rain, otherwise the higher rank".)
  5. A condition can be several keys at once: `lightning-rainy` is `rain` **and** `storm`
     (both true in `current`, one `storm_started` entry); `snowy-rainy` is `snow` only
     (it is not in `RAINY`); `wind` is also true from the weather entity's wind or gust
     speed alone (30 and 50 km/h), with any condition.
  6. Timing is as for rain, per key: leading edge 0-10 s after the sensor, a reverse held
     45 s (`block_s`) and then 0-10 s for the pass its own timer asks for (45-55 s), one
     timer per key. Unknown (no weather reading after the 10 min hold) holds every key's
     last value, sends nothing, and the first known reading after it is silent.

### 6.4 Time (F7, B1, B2)

State changes pass `_home_debouncer` (10 s, `rates.py:302`; `coordinator.py:359-366`)
before the home pass, and the card's live gate for moments is 15 s. HA's `Debouncer`
(`helpers/debounce.py`, with `immediate=False`) runs the function 10 s after the first
change, then starts another 10 s cooldown after each run; a change inside the cooldown
runs at its end. So the pass comes **0 to 10 s after the sensor** for a change that
`device_fx` accepts at once, not "0.4-1.2 s" and not "10 s or more" (B2). This is a
number to state in the device queue; the test for it drives the debouncer with
`freezer`/`settle` as `test_channel.py:459+` does and asserts the bound, not an exact
second.

**`occurred_at` is the accepting pass's `now`** (`_sense_home`'s `now`,
`coordinator.py:906`; B1, FM7), not the sensor's change time. `Readings`
(`home.py:49-86`) carries no timestamps, the state-change listener throws the event away
(`def changed(_)`, `coordinator.py:741-743`), and `last_changed` of a rain-rate sensor moves
on every value change, not when rain started. So the echo window is **90 s from the
accepting pass**, up to 10 s after the sensor, and a first view sees the full 90 s of it
(the earlier "about 80 s" is gone). A doorbell keeps its own fast path.

### 6.5 Hysteresis and chatter (B2, B3)

Better a missed flicker than a flicker stream. Every key has its own hold, known-guard and
echo numbers in the **per-key table** below, and nothing in this section is stated as "3-5
s": passes happen 0-10 s after a change (the debouncer, section 6.4), so a block shorter
than one debounce can never be observed. Temperatures are never on the wire (section
6.2a), so "temperature on a meaningful step" is not a rule; heating and cooling are a bool
(section 6.6a). Music and TV never carry track metadata.

**Rain oscillation: leading-edge accept, reverse blocked for N s, then re-evaluated
(B2, FM7).** The only things that call `_sense_home` are the debouncer (a state change)
and `_tick`, every 5 minutes (`rates.py:12`, `coordinator.py:662`), so a "steady for 45 s"
dwell has no pass at 45 s and would fire at the next tick, up to 5 min late, outside the
90 s ring. So:

1. The first pass that sees a different known rain value **accepts it at once**: it
   updates `current`, adds the ring entry and the live message. Onset latency: **0 to 10 s**
   after the sensor (section 6.4).
2. From that pass, a **reverse is blocked for N s** (N = 45 s, a constant in
   `device_fx.py` inside the 30-60 s range; a starting value to tune on the device). A
   pass inside the block that sees the old value again changes nothing and sends nothing.
3. At the end of the block the module re-evaluates, with an **explicit timer, one per key
   (F6)**: `async_call_later(hass, N, ...)`, registered with `config_entry.async_on_unload` (it is
   cancelled on unload and not persisted: a restart has no pending block), whose callback
   calls `self._home_debouncer.async_schedule_call()`. The resulting pass compares the
   latest known reading to the accepted value: equal (the flap undid itself) sends
   nothing; different accepts the reverse as a new onset. Latency of a held reverse:
   **N + 0 to 10 s** (45-55 s with the constant above) after the first accepted change;
   a reverse that first appears after the block is accepted like any first change, in 0-10 s.
4. **One timer per key, never one shared timer.** 3A's `_arm()` calls `self.cancel()`
   first (`device_fx.py:149-151`), so a second key arming its block would cancel the first
   key's pending re-check and a held reverse would never fire (the next chance is the 5 min
   tick, outside the 90 s ring). Slice 4A keeps a timer handle per key (or one timer armed
   for the earliest deadline that re-arms for the next; a per-key dict is the simpler
   one). All are registered with `async_on_unload`, and unload cancels every one.
5. A timer in this module is the only new clock. Tests drive it with `freezer`/`settle`
   (`test_channel.py:459+`), **parametrised over every key in `DEVICE_SIGNAL_MAP`** (never a
   copy for rain), and cover: no flap, one flap inside the block (nothing sent), a flap
   that settles on the reverse (one onset at N + 0-10 s), unload cancelling the timers,
   unknown arriving during a block (the block is dropped, section 6.2), first-known-silent
   and a restart. Plus one test that **two keys are blocked at once and both held reverses
   are delivered**.

**The per-key table (F6, F7, F9).** One row per key, kept in `DEVICE_SIGNAL_MAP` (section
6.2) and exported to `tests/js/device_signal_map.json`. `echo_rank` follows section 6.7
(1 doorbell and appliance, 2 weather, 3 lights/fire/heating, 4 media, 5 astronomy).

| key | type | source reader | known-guard | `block_s` | echo | `echo_ttl_s` | `echo_rank` | PR |
|---|---|---|---|---|---|---|---|---|
| `rain` | bool | `is_raining(r)`: rain sensor, else condition | `rain_rate is not None or condition is not None` | 45 | yes | 90 | 2 | 3A (built) |
| `snow` | bool | `condition` in `SNOWY` | `condition is not None` | 45 | yes | 90 | 2 | 4A |
| `fog` | bool | `condition` in `FOGGY` | `condition is not None` | 45 | yes | 90 | 2 | 4A |
| `storm` | bool | `condition` in `STORMY` | `condition is not None` | 45 | yes | 90 | 2 | 4A |
| `wind` | bool | `condition` in `WINDY`, or `wind_kmh`/`gust_kmh` over their thresholds | `condition`, `wind_kmh` or `gust_kmh` is not None | 45 | yes | 90 | 2 | 4A |
| lights, fireplace, TV, music, heating, cooling, vacuum | pending | pending | pending | pending | pending | pending | 3 / 4 | 4C, **pending owner privacy answer (Q1-Q4)** |

The weather `block_s` is **45 s, the same as rain** (FM8): the s2818 review gives no reason
for another number, the same debouncer and the same `condition` updates drive all five,
and one constant is one thing to tune on the device (a starting value inside the 30-60 s
range, as for rain). The four new weather rows need no new known-guard machinery: their
readings are already `Optional`. A key whose reading is a plain `bool` in `Readings`
(`fireplace`, `music`, `tv`, `heating_on`, `cooling_on`, `robot_cleaning`, `home.py:68-72`)
**cannot express unknown**: `Watcher._get` returns `None` after the 10 min hold and
`any([])` is `False`, so an 11-minute outage would read as "ended" and the recovery as
"started", the bug B3 fixed for rain. For 4C the mechanism is **`Watcher.known(key)`** ("at
least one mapped entity of this key currently yields a state"), used as the known-guard;
`Readings` and its consumers do not change (the s2818 option (b), chosen over a tri-state
`Readings`, which touches `evaluate()`). The activity rows' own numbers wait for the owner
(section 6.6a).

Unknown/unavailable and an HA reconnect invent no onset, into or out of unknown
(section 6.2, B3, FM7); the last accepted state holds.

### 6.6 Coverage matrix (a target, not a claim a row exists)

With the internals parked, the response to each row is a **shell/glass/rim treatment on
the `.hw` family**, plus a pet look only if the body is free. Anything a row draws with
letters is out; glyphs only. New ambience is shell and glass only; it never draws a
second rain on the display (F14), and `fx-*` stays (F13): `device_fx` sits **beside** the
screen glow, shell-only.

| Source / transition | Onset | Ambience | Echo | Slice |
|---|---|---|---|---|
| Rain starts / ends | drop on the inner glass / last bead clears | wet sheen | yes | 3A, 3B (built) |
| Snow starts / ends | frost forms / thaws | faint corner frost | yes | 4A server, 4B client |
| Rain to sun | warm sweep along the rim | brighter rim | yes | later (not slice 4): fold into the `sun_out` moment client-side, or a slice of its own |
| Wind rises / stops | flecks lean across the glass | slight directional accent | yes | 4A server, 4B client |
| Storm arrives / ends | **non-flashing** dim shiver / release | cooler tint | yes, subtle | 4A server, 4B client |
| Fog begins / clears | rim fog and clearing | soft diffusion | yes | 4A server, 4B client |
| Dawn / dusk | rim palette settles cool to warm or back | day/night rim | none (no wire key) | later (not slice 4); client-side off `sunrise`/`sunset` if it ships |
| Lights on / off / dim | rim brightens / dims | dimmed rim, never over `.lit` | yes | owner answered, section 6.6a |
| Heating / cooling | warm / cool wash along the rim | faint tint | yes | owner answered, section 6.6a |
| Fireplace on / off | ember rim lights / sets | warm rim | yes | owner answered, section 6.6a |
| Music begins / ends | a few bars rise / fall | quiet bars glyph | yes | owner answered, section 6.6a |
| TV starts / ends | reflected rectangle at the screen edge | faint colour reflection | yes | owner answered, section 6.6a |
| Arrival | one welcoming rim pulse | none | arrival only | **cut** (FM11: presence) |
| Vacuum starts / ends | small rotor turns once / slows | none | yes | 4C/4D, after the owner's answers; its state is already in `flags`, and its onset comes from the `robot_out` handler (FM10) |
| Doorbell | rim chime mark | none | yes, short TTL | owner answered, section 6.6a |
| Appliance cycle done | small tick mark | none | yes | owner answered, section 6.6a |
| Full / new moon | halo aligns | static halo | none (client-computed, no edge; FM11) | 4B, client only |
| Season, first snow, first frost | short themed pulse | seasonal rim | yes | later (not slice 4) |
| Unknown, unavailable, reconnect | **none** | last accepted state | no | every slice |

World recipes differ by world id and share semantics (rain is a leaf bead in Woodland, a
porthole streak in Tidepool, a ring in Pond, and so on), a family and not six engines.
Recipes start generic in slices 3 and 4; a world flavour is CSS variables, not art.

**The glass element (M4).** There is no "glass" to draw on today: `.hw` is
`display:none; z-index:-1` (`style.js:791`), hidden entirely without CSS `round()`
(`style.js:840`), and sits behind the body face. Slice 3B adds a new element, `.hw.glass`
(or a child of `.bezel`; the implementer picks, the plan fixes the rules):
`pointer-events:none`; a stated z-index above the `.screen` content and **below** the
dialogue, the status view, the `gameBox` and the focus ring (section 3, case 14); shown
only under `@supports (width: round(1px,1px))`. The `dir-*` classes go on this element,
never on `.device`. The bench pins the open-dialogue and open-status states.

**Rain on the card has two sources, and the screen wins (M2).** The in-screen rain follows
`flags` (`.screen.raining`, `card-layout.js:620-628`, from `evaluate()` on the same pass);
the new sheen follows `current.rain`, after hysteresis. Under flapping the screen could be
dry while the glass is wet, or the reverse. Rule: `current.rain` is derived from the same
`is_raining(readings)` as `flags` (section 6.2), and the glass is allowed to lag the
screen by the block of section 6.5; it is never ahead of a reversal the screen has not
shown. Case 11 checks that an echo is dropped when the two disagree.

### 6.6a Rows pending the owner's privacy answers (Q1-Q4)

**Owner answers (2026-11-03). These decide 4C and 4D; they override the "decides nothing" text and the quoted recommendations below.**

| Q | Owner answer |
|---|---|
| Q1 lights | **Ambience only**: a derived `off|on` enum with named thresholds (no float, no `dim` unless a later answer adds it), a steady look, **no onset, no ring entry, no echo**. |
| Q1 fireplace, TV, music | **Live onset only**: a cue to screens open at the edge, **no ring entry, no echo** for a later viewer. Music counts `playing` only, with a block of at least 45 s; no track metadata ever. |
| Q2 doorbell | **Live only**: a client-side rim chime mark off the existing `doorbell_live` moment, no ring, no echo, no server, no wire (the 2026-11-01 rule holds). |
| Q3 appliance | **A tick per machine**: `washer`, `dryer`, `dishwasher` may cross as a closed enum (already public on the bus). Oven, coffee, EV, timer and delivery **never** get a device cue. The onset comes from the existing `appliance_done` handler (FM10). |
| Q4 heating / cooling | **Tint while running plus a live cue at the switch**: a faint warm/cool tint as ambience, and a live rim wash when it switches on or off, **no ring entry, no echo**. One cue per event (FM10): the live wash is offered from the `house_answered` handler where that moment fires, not from a second server edge. |


Slice 4C and 4D wait on these (FM9; section 17). The plan **decides nothing** for them.
The state of fireplace, TV, music and vacuum is already public in `flags`; what the wire
would add is the edge with a timestamp, replayed for 90 s to the next viewer of a shared
tablet, and, for heating, cooling and lights, a reading `flags` does not carry. The review's
recommendations, quoted as input to the owner and not as decisions:

- **Q1, lights, fireplace, TV, music.** Options: (a) ambience only, no onset, no echo;
  (b) onset live only, no ring entry, no echo; (c) full, as the matrix. Review
  recommendation: **(a) for lights** ("whole-house 'brightest room', strongest presence
  signal; or drop lights entirely"; `room_light_level` is the max over every mapped light,
  `watcher.py:514-522`, and a float, so only a derived enum `off|on` with named thresholds
  could ever cross) and **(b) for fireplace, TV and music** (music is `state == playing`
  and flips on every pause, so it needs a block of at least 45 s and `playing` only; `tv`
  counts `on` or `playing`, `watcher.py:407`).
- **Q2, doorbell.** Review recommendation: a **client-only rim cue off the existing
  `doorbell_live`** moment (`card-moment.js:196-222`), `presentation:"onset"`, **no ring
  entry and no echo**, no server, no wire. The matrix's "yes, short TTL" would put a press
  into `snapshot.device_fx_recent` for a later subscriber for up to 90 s, which the
  2026-11-01 decision forbids (`const.py:173-175`; `_doorbell_pressed` deliberately skips
  `_advance/_save/_publish`, `coordinator.py:837-848`) and would need a `_push_watchers()`
  call it avoids. The doorbell never rides the ring in this recommendation.
- **Q3, appliance.** Review recommendation: **one generic "done" tick with no `kind`**.
  Washer, dryer and dishwasher kinds are public on the bus today, but oven, coffee, EV,
  timer and delivery are channel-only (`const.py:169`) and must never get a device cue
  either way. Robot start and appliance done may ride the ring if the owner wants an echo
  (their moments are public already); the doorbell does not.
- **Q4, heating and cooling.** Raw `heating_on`/`cooling_on` is not in `flags` (only
  `cozy`/`cool`, which need an out-of-range indoor temperature). Review recommendation:
  **ambience tint only, a long block (at least 10 min, thermostats cycle on `hvac_action`),
  no echo**, or leave it off the wire. The onset wash would come from `house_answered`
  (`card-moment.js:186-193`), one cue per event (FM10).

Numbers the review gave for the other rows, to be set only after the answers: lights hold
at least one debounce (for example 45 s), a vacuum block like rain's and "slows" meaning
docked and done, not each pause (`robot_cleaning` toggles on pause, resume and error,
`watcher.py:430`), and the 3-per-day and `robot_seen` limits of `HouseMoments`
(`home.py:517-534`) which a raw-reading detector would bypass. Each such row gets its line
in the section 6.5 table when its PR is released.

### 6.6b Client rules for slice 4B (s2818 F11, F12)

**The adapter becomes a table (F12).** 3B's `device-fx.js` hardcodes `rain`: one `COLLAPSE`,
`ambientOf` returns only `{rain}`, `cueOf` sets `kind:"rain"`, `paint` toggles only `dir-wet`
(`device-fx.js:25-31,38-43,54,140-146`). 4B is a **refactor to a table, not adding rows**:
a JS map keyed like `DEVICE_SIGNAL_MAP` (the JSON export of section 6.2) drives
`ambientOf`, `cueOf`, `paint` and `sync`. The 3B tests that assume rain
(`device_fx.test.js:82-86,155-190`) move to the table form, and `Object.isFrozen(F.RECIPES.rain)`
becomes a per-key check.

**The glass listener must filter (F11).** The card's one listener on the glass,
`s.glass.addEventListener("animationend", () => { if (s.dirEffect) release(s, s.dirEffect) })`
(`card-build.js:194-195`), does not check the target or the animation name, and
`animationend` bubbles. New one-shot ambience animations (frost forming, fog, a tint
settling) would release whatever effect is current, including a running rim cue. So:

- the listener filters on `e.target === s.glass && /^dir-/.test(e.animationName)`, like the
  rim listener (`card-build.js:199-200`, which checks the target and `dir-rim-life`), and
  the lease's clock is a **named** `dir-*` animation;
- ambience uses `transition` or custom properties on persistent classes, **never a finite
  `animation` that ends on the same element**;
- `RAIN.start` clears only its `CLASSES` and `rimRecipe` only `RIM_CLASSES`
  (`device-fx.js:32-33,68,102`). A `CLASSES_BY_LAYER` constant lists, per layer (glass,
  rim), every class a recipe may set, and each recipe's start clears its layer's whole set;
  a test checks it against `style.js` (every `.hw.glass.dir-*` and `.hw.rim.dir-*` rule has
  an owner in the constant, and none is missing);
- `shellImpulse` is `REPLACES_EQUAL`, so two house onsets of equal priority replace each
  other mid-flight, which is chatter by another name. Each kind carries a per-kind
  `cooldownMs` (the director supports it, `interaction-director.js:188-210`), and the
  ranks match section 6.7's echo rank; both are columns of `DEVICE_SIGNAL_MAP` and the
  JSON export.
- 4D recipes reuse 3C's rim-lamp vocabulary (three amber `<b>` lamps; opacity and `left`
  only) for position, colour custom property, count and duration, rather than adding new
  shapes.

**Storm is non-flashing, and checkable.** A CSS source test: no `opacity` swing above a
stated threshold and no `animation` faster than 3 Hz in a storm rule; reduced motion keeps
the still ambience and plays no onset or echo (FM7/M3).

### 6.7 Client algorithm

Per slide: `ambientState`, `seenFxIds`, one `pendingEcho`, `activeFx`, a generation.
Snapshot: paint ambience, collect eligible recents, replay no moment. Live onset on a
selected, visible, unbusy slide: one pulse now; body busy means shell only. While hidden:
keep only the newest best candidate.

**First view (M7).** `enterView` is for a first view only. The hooks are slide
selection (`_go`), the IntersectionObserver callback (`card-build.js:104-109` today has
only a card-wide `_visible`), and the visibility return (`_onHidden`, `card-base.js:111`);
boot end is the same as selection. A per-slide "viewed" mark is new code in those three.
A **reconnect snapshot** (`_channel` receives a full snapshot on every reconnect,
`card-base.js:303-320`) on a slide that has already been viewed calls `setAmbient` only and
**never** `enterView`: it never echoes (FM7). A snapshot before the first view is stored
and the first-view hook plays it. Within the window (90 s by `serverNow()` from the
accepting pass) and still true: one shortened echo; mark it seen whether played or skipped.
A user action at the same instant drops the echo; a game, question or scene updates
ambience only.

**The three gates (M3, FM7).**

- The "screen effects here" switch off (`lcdOn()` false): nothing drawn, no ambience,
  no onset, no echo.
- Reduced motion (`calm()`): static ambience drawn, no onset or echo motion; the adapter
  calls `setAmbient` and never `offer` or `enterView` (section 5.3).
- No visual quiet hours. The card's `QUIET_HOURS = [21, 8]` (`prefs.js:130`) is for sound
  only. A silent rain drop may play at 22:00 on a wall tablet; the pulse makes no sound
  and no haptic. An asleep pet is the `asleep` busy owner, which keeps the body still and
  nothing else.

**Clock (M5).** If the server clock is not trusted, ambience only, for both paths.
`trusted` is checked by `enterView` only, not `offer`, and `offer` expires a cue past
`occurredAt + ttlMs` on `now()` (`interaction-director.js:213-218`); on a device clock
more than 90 s off with no accepted reading, every live onset would be silently expired and
marked seen. So in the adapter, for a **live onset** `occurredAt` and `ttlMs` are left
unset (receipt time is within 10 s of the truth, and the adapter has it), and the server
ISO strings are passed only for **ring entries**; the adapter also gates `offer` on
`serverClockKnown()`. Slice 3B adds `serverClockKnown()` to `shell-data.js` (true after one
accepted reading; `serverNow()` has no "unknown" state today, `shell-data.js:288-293`) and
passes it as `trusted`. Test in node with a skewed fake clock.

**Mapping (M6).** The wire has no `data.key`/`value` or `direction` (section 6.2), and
`stillTrue` defaults to `st.ambient[key] === value` only when `cue.data` has both, else it
returns `true` (`interaction-director.js:138-143`), so an echo's "still true" would pass
silently. The adapter maps `rain_started` to `{kind:"rain", direction:"start",
data:{key:"rain", value:true}}` and `rain_stopped` to `direction:"end"`,
`data:{key:"rain", value:false}`, both with the same `collapseKey`. (The director's
`direction` is `start|end`, section 5.3; the review's `on`/`off` names are the same
thing.) In the snapshot path `setAmbient` goes **before** `enterView`, or `stillTrue`
compares an old ambient. Test: an echo with the ambient flipped does not play (case 11).

Reconnect: snapshot and delta share one dedup path in either order. Each card dedups for
itself; with N pets sharing one weather entity, N identical onsets go to N slides: the
non-selected ones get `pending` (`canRender` false), only the selected plays (case 8).
Echo rank: doorbell and appliance done, weather onset, lights/fire/heating, media,
astronomy; ties by recency.

### 6.8 Acceptance cases (kept intact from the first plan)

1. Rain starts with the card visible: one pulse and a sustained wet look, no duplicate speech.
2. Card opened 20 s later: one brief rain echo, no narrative replay.
3. Card opened 3 min later: ambience only.
4. Rain starts and ends while hidden: no false rain; the latest coherent event only if fresh.
5. HA restarts in rain: ambient rain returns, **no fake onset**.
6. Source unavailable, then restored: no fabricated signal; only a true later change pulses.
7. Reconnect delivers one event in snapshot and delta: one physical pulse.
8. Two cards, many slides: no neighbour animates; the selected one reacts on its own. Includes two slides with the *same* rain: both get `pending`, only the selected plays (m7).
9. The player opens a game with an echo pending: the game wins with no delay.
10. A shared wall tablet: no identity, media title or private message leaks.
11. Flapping weather coalesces (leading edge plus the block, section 6.5); an echo never contradicts current truth, including when the in-screen rain (`flags`) and `current.rain` disagree (M2).
12. Reduced motion, the switch, asleep pet: reduced motion draws static ambience with no onset or echo motion; the "screen effects here" switch off draws nothing; an asleep pet keeps its body still; no haptic, no audio. There are no visual quiet hours (FM7/M3): a silent rain drop may play at night.
13. IntersectionObserver toggles on a scroll: the event is not replayed.
14. Ambience updates under an open dialogue without covering it.

Added by the review: 15. a server test beside `tests/test_channel.py` and
`tests/test_public.py` that audits a shared screen's `device_fx`; 16. a recorded week with
the bridge on equals main (no save field); 17. the card-check TDZ-order case for the director, in the first slice with an adapter (3B, as built; slice 1 has none, section 5.2).

## 7. Press feel: the gaps only (F2, LD section 7)

The cap goes down on press and holds (`style.js:1288-1291`); the care scene owns the
body. What is missing is CSS on the cap only: custom properties and the existing state
classes, no new `.pet` class, no director (FM5). A "cap" here is a `.toy` button's `.cap`
(the care caps, play, and the lights toy, which is the tuck). The nav arrows (`.prev`,
`.next`, which have `.tap-feedback.pressed` and no `.cap`), `.statusbtn` and the
backlight are out of scope (FM6).

`.toy.pending` and `.toy.failed` **already exist** (`style.js:1293-1296`; `_call`,
`card-actions.js:54-71`, adds `pending` before `callService`, adds `failed` for 400 ms on a
rejection, removes `pending` in `finally`). Slice 2 restyles them; it adds no field and no
second pair. "Settles" means the `callService` promise, not the care result that arrives
later in the sensor. `button.press` returns in tens of ms, so pending is often never seen;
there is no minimum pending time (FM6).

| Gap | Treatment |
|---|---|
| Release | 90-140 ms rebound, an overshoot `cubic-bezier` on the cap's existing transition (a transition cannot collide with another animation, and the `:active` end and the `.pressed` removal both start it); the hit target (`.toy`) does not move. |
| Pending | `.toy.pending .cap`: a restrained, dim, static-plus-slow-pulse tone (no transform); a static tone remains under reduced motion. |
| Failed | `.toy.failed .cap`: a muted, desaturated return (a `filter` transition, no `transform`, so it cannot fight the pressed offset). Never suggests success. The old horizontal shake goes, because it read as a refusal and overrode the pressed offset. |
| Refused | no cap cue (FM6): a refusal is not a rejected call (`button.press` resolves, the server says no later through the scene or the bubble). The existing refusal stays as it is. |
| Cleanup | `:active` clears natively on cancel and drag-off, `.pressed` and `.tapped` are timer-bounded, `.pending` clears in `finally`, `.failed` on a timer: nothing sticks. Fix only what a test finds missing. A source test guards that every state class has a removal. |
| Character | per-action rebound only: one `--rebound` curve and duration per `.toy[data-action]`; snack, scold and praise take the default. |

| Action | Rebound |
|---|---|
| Feed | soft, rounded |
| Play | springy |
| Clean | crisp, two-part release |
| Medicine | firm, minimal bounce |
| Sleep / tuck (the lights toy) | settles, no bounce |
| Others (snack, scold, praise) | the default |

The per-action **shell cues** (a delivery-path glow, a two-point pulse, one clearing
sweep, the lamps dimming in sequence once the tuck is confirmed) are `shellImpulse` rim
effects and so move to slice 3C with the other rim cues (FM5).

Motion rule: the cap's animations are not `.pet.<cls>` rules, so `motion_rule.test.js`'s
`ALLOWED` list needs no entry (a stale entry would fail its own test). Reduced motion
(`style.js:7-9`) removes every animation and transition, so the cap keeps its static
`:active`/`.pressed` down state and static pending and failed tones. Any class a button
wears for a moment goes on `PASSING_CLASSES` (`shell-data.js:258`), `failed` included.

**As built (slice 2).** `style.js` `.toy .cap`: the pressed offset is `translate`, the
release is `transition: translate var(--rebound-ms) var(--rebound)` (an overshoot curve; 90-140 ms
per action), `.toy[data-action=...] .cap` sets the curve, `.toy.pending .cap` is a still
`filter: brightness(.94)` with a slow pulse, `.toy.failed .cap` a still `saturate(.35)
brightness(.88)` that fades in and out through the `filter` transition (`animation: none`
so it wins over pending). The old `shake` is gone. The one JS change is `card-build.js` setting
`data-action` on the action toys and the lights toy. Bench `alive` and the shot option
`capClasses` pin the states; `tests/js/cap_press.test.js` is the structural guard. The
card-check `care` section fails the same way on origin/main (meds disabled), so slice 2's
gate run is `scripts/test` plus the passing sections before it; see the report.

The press means "I got your input", not "the server accepted it". **Must not touch the
tuck beats** (the `s.wasAsleep` rule, care-reactions §4.9). Tests: a structural check (no
state class without a removal; no `animation` on the cap that touches `transform`), the
bench `alive` preset with `.pressed`/`.pending`/`.failed` pinned by class (the bench
cannot hold `:active`), a card-check fast double tap (one `button.press`, `.pending`
clears). Device rows are in the slice 2 device queue (section 13).

## 8. Idle: a delta over N1-N4 (F8) (parked until N4's art merges, FM12)

**Slice 5 is not startable.** N1 and N2 are built (section 2: `_idleMoves`,
`card-tick.js:294`, and `_skyReact` in `_idle`). N4 (60 signature-pose frames, idle only)
has not shipped: `signature` appears in no species data and no card code on main, and
`own` is child-only today. So the gate "only if N4's poses do not already cover them" has
no input, and N4's cadence (one signature every 2-3 minutes) is unjudged and may already
be busy enough that extra beats are noise. When N4's art has merged and the owner has seen
it (the bench `signature` preset), the first mate re-scopes this slice from what is left.

**Glass curiosity is dropped (FM12).** A face or paw touch on the glass is a pose, so it
needs art per species, not CSS ("where the sprite allows" is undefined), and it is slice
6's glass in disguise. If a pet-touches-the-glass beat is ever wanted it joins slice 6
only when a pose exists.

**What the re-scope may contain:** two rows, **post-play settle** (a finished game with a
free body; it overlaps the existing `settle` idle move, `card-tick.js:450`, and `_react`'s
win/cheer, so it must add something those do not) and **link-port curiosity** (after a
real link, once the body is free; `card-link.js:123` already has a look-at-guest beat
`_look(guest, 6500)`, so only "after the link, body free" is new). Rules: eligibility
stays with `_idle`, `_freeBody` and `_firstMove`; a beat is a short cancellable chain with
an absolute maximum and cancels on any state change; 45-120 s global cooldown while
viewed; never the same beat twice in a row; no counts, no reward, no trick progress, and a
glance is never mistaken for a care response. Any new body class goes on `ALLOWED`
(`motion_rule.test.js`) on purpose, with a comment. The slice needs **no director track**
unless it leases `petBody`; the re-scope says which. The acceptance for the re-scope is
in section 13 ("Slice 5 acceptance, for the re-scope"). A per-world exclusive beat is a
separate decision for after N4 (it would be art).

## 9. Rare glass moments (after 4B, FM13)

A **generic** mark on the glass, rare, with no reward and no requirement. The marks are a
**paw print**, a **smudge** and a **rim shadow**, the same in every world (FM1). There is
no leaf: it is Woodland-flavoured, and a world flavour can come later as its own decision.
No labels. Clipped to the shell, `pointer-events:none`, and never over a button
affordance.

**Starts only after 4B has merged (FM13).** 3B's glass is built (`<i class="hw glass">`,
`card-build.js:156`; its rules in `style.js` hide it until `ha-card.lcd-on` and under
`.screen.show-status`), and rain already uses both pseudo-elements (`::before` sheen,
`::after` drop) and the slide's single `s.dirEffect`, which the glass's `animationend`
releases (`card-build.js:194`). 4B puts snow, fog, storm and wind on the same glass and
adds `CLASSES_BY_LAYER`, the glass `animationend` filter and per-kind cooldowns (F11, FM9).
A mark written before 4B would fight the same two pseudo-elements, the same effect field
and the same filter, and be reworked. Read 4B's built CSS and `CLASSES_BY_LAYER` first.

**Its own layer.** The mark is its own element (a child of the glass, as the rim's lamps
are, or a third layer), **never `::before` or `::after`**, so persistent ambience (the wet
sheen, frost, fog) can sit under it. It adds its own entry to `CLASSES_BY_LAYER`, and 4B's
`animationend` filter ignores it: **a mark ending must not release a running rain or
weather lease**, and a weather animation ending must not clear a mark. It does not touch
`s.dirEffect` unless it takes the lease (priority idle, the lowest: any house onset
wins, which is correct). It uses `dir-*` classes only, no `fx-*`, no `filter` or `blur`.

**Its scheduler.** No new `setInterval` (section 3): `_tick` calls a `_rareGlass(s)` gate.

- **Viewed time** is a counter that advances only while the slide is on show, the page is
  visible (`document.hidden` freezes it), `lcdOn()` is true, the status sheet is closed and
  `BUSY_OWNERS` is clear. Off-slide or hidden time does not count.
- **Default (FM13): one mark per about 20 minutes of viewed time, per pet**, kept in memory
  on the slide. No saved field, no `PetState`, nothing on the wire (section 3). The counter
  starts at zero on card load and on the first view; a mark is never drawn on the first
  view. Never the same mark twice in a row.
- **Eligibility when it comes due:** on-show, `lcdOn()`, no busy owner, `!calm()` (reduced
  motion: no mark, it is decoration), and no *onset or echo* lease on the glass or the rim.
  Persistent weather ambience does not block it (the mark is a separate element, so a paw
  on a wet window is allowed); if the bench shows it reads as dirt, the first mate may flip
  this to blocked. The "screen effects here" switch off means nothing is drawn.
- **No night rule (FM13, M3):** no visual quiet hours.
- Injected clock, so tests do not wait.

**Verification the worker can do.** Node tests for the gate and the CSS source test
(section 13, "Slice 6 acceptance"), bench stills at 420 and 330 px on a clear, a dark and a
glitter shell, and a card-check `elementFromPoint` assertion. **Whether a mark reads as
charming or dirty, and whether 20 minutes feels rare, only a long idle watch on a device
can say**; that stays the owner's queue, and the number to react to is 20 minutes of viewed
time.

## 10. Parked: screen morphs (Q5, FM14)

Parked like section 11; **not a slice**. It stays as a paragraph and is re-planned only if
the owner asks after seeing slice 6. Q5 ("last, optional, CSS only") is narrowed to
"parked" (FM14).

- The idea: a morph makes the display feel like a material, drawn in a fixed pixel-grid
  plane without moving a control; one flagship first (Tidepool liquid lens or Woodland leaf
  shutter), then at most five more. Targets: common navigation under 180 ms, a rare morph
  300-550 ms; navigation completes at once and the effect cancels on any frame. Never on
  every tap, never over a modal, game or question. Shared fallback: the LCD quick refresh
  or nothing. Stepped masks and `color-mix` in the style the `FINISHES` already use. It
  would use the director's `screenFx` track (exclusive; the pet is never touched).
  Reduced motion: none.
- Why it waited (the s2824 review): it has no mechanism, no acceptance and no named files;
  a flagship per world contradicts FM1 (generic in every world) and creates per-world art
  decisions (0-10 image calls, section 14); it touches navigation (`_go`,
  `card-build.js:950`), the most protected path, and "navigation completes at once" is
  exactly what a stepped mask over `.screen` can break (hit-testing, the `.lcd` grid, the
  pixel-grid `ResizeObserver` at `card-build.js:200`); the screen is where the Hop board,
  questions and games render, so "never on every tap" would need a rate limit and a spec;
  and nearly all of its verification is by eye on a device (180/300-550 ms timing, fast
  navigation).
- To revive it: split a **7a** first (one generic LCD quick-refresh, CSS, with its own
  acceptance and rate limit) before any per-world morph, and give it the sections the
  other slices have (mechanism, files, acceptance, device queue).

## 11. Parked: the world inside the device (Q2)

Deferred by the owner, not a slice. Kept so the idea is not lost.

- The idea: per-world functional-looking internals (core, path, one mechanism: a seed
  capsule in Woodland, a dial in Terrarium, a filament in Hearth, an impeller in
  Tidepool, a lily rotor in Pond, an orbital ring in Night Sky) behind the screen.
- Why it waited (F3, F4): `.hw.guts` already draws the board for the clear finish, so any
  work extends `.hw` with per-world `--art` masks and does not add a parallel plane; and
  only `clear` (`see: .34`, `shell-data.js:175`) and `smoke` (`see: .62`,
  `shell-data.js:222`) are see-through, so five worlds of art would reach few shells.
  device-charm Part 4 recorded that the clear board once drew past the device edge: it
  must clip to the shell.
- To revive it: the owner chooses between internals on clear/smoke only (CSS, no art) and
  a see-through default finish per world (a shell redesign and an art job). Its art
  estimate then returns (about 20-40 image calls on top of section 14).

## 12. Copy, settings, docs

- **No new player copy.** Matrix rows use glyphs without letters. The one switch is the
  existing "screen effects here"; if a second is ever wanted its two-word label goes to
  the first mate as a DRAFT.
- Rollback is that switch, plus the version field failing closed to the static baseline.
- Slice 1 adds one row for the new part to AGENTS.md's "Where things live" table.
- Each slice's PR updates `docs/guide.md` ("The device") and `docs/features.md` where it
  changes what a player sees (the device-charm convention).

## 13. Slices

Order is dependency order. Tiers: 0 docs only, 1 card or small server with no saved
field, 2 saved field or schema. Sizes: S small, M several modules and tests, L protocol or
art. **Do not run two workers on the card chain or `manifest.txt` at once.**

| # | Slice | Tier | Size | Route | Device queue (the owner reads these on a phone) |
|---|---|---|---|---|---|
| 0 | This rewrite | 0 | M | docs only | none |
| 1 | **Director core**: pure `interaction-director.js`, track leases, generation tokens, `BUSY_OWNERS`, injected `schedule`, `node --test`; a manifest line, one AGENTS.md table row. No adapter, no card-check case, no `pick-sections` entry. **No visual change.** Acceptance below. | 1 | S-M | `scripts/gate --auto` (picks no card-check section; the JS tests are the guard) | none (nothing to see) |
| 2 | **Press release feel**: section 7 only, CSS on the cap (FM5, FM6). Rebound, restyled `.pending`/`.failed`, cleanup, per-action rebound curves via `data-action` and `--rebound`; `failed` joins `PASSING_CLASSES`; bench `alive` preset. No director, no `canRender`, no adapter, no TDZ card-check case, no `pick-sections` entry; the rim cues wait for slice 3C. | 1 | S | `gate --auto` | Press feed, play, clean and meds caps and the lights toy; hold a cap and drag off it (touch and mouse); Space on a focused cap (does it pop up, then down?); a quick double tap; iOS `:active`; the feel of the 90-140 ms rebound; one refusal (the cap does nothing special). |
| 3A | **Signal bridge, rain: server.** `custom_components/virtual_pet/device_fx.py` (`current`, ring, leading-edge hysteresis with the `async_call_later` block, unknown state; sections 6.2, 6.4, 6.5), the `_sense_home` call, `current` (only) in `_house_view()`, `recent` beside the house on the snapshot, the `{"fx": ...}` live message flushed at the end of `_push_watchers` after the house diff (section 6.3), `tests/test_device_fx.py`, `test_channel.py`, `test_public.py`. Wire: `{"version":1,"current":{"rain":bool}}` and the rain ring entries, nothing else (FM7/m1). Old cards ignore all of it, so 3A can land alone and bake. **Tier 1** (nothing stored: the ring, nonce and state are in memory and join no `PetState.to_dict`, diagnostics, debug sensor or bus). No new copy. | 1 | M | `scripts/ci-gate` (pick-sections prints `all` for any non-test `.py`, `scripts/pick-sections:84-86`) **plus a privacy review of its PR** (case 15 is the shared-screen audit; a second pair of eyes on it) | Rain on a wall tablet (shared) and a phone: nothing visible changes yet (3A has no client); confirm the card still loads and a rain flip leaves no console error. HA restarted in rain: same. |
| 3B | **Signal bridge, rain: client adapter.** The first adapter *if it lands first*; else it reuses 3C's. Creates the director (`create` with `now` = `serverNow`, `deviceNow`, `trusted`, `canRender` = `lcdOn()` + on-show + visible, `schedule`); `s.statusOpen` set in `_toggleStatus`; `release` from `animationend`; `serverClockKnown()` in `shell-data.js`; the `{"fx"}` handler in `_channel` before the early return and before the redraw; the wire-to-cue mapping (section 6.7: `direction`, `data.key/value`, the same `collapseKey`, `occurredAt`/`ttlMs` only for ring entries); the `.hw.glass` element and its rules (section 6.6); the rain recipe, ambience and echo; the first-view hooks in `_go`, the IO callback and `_onHidden` (M7); bench `alive` rain shots; card-check section `devicefx`. Needs 3A for a real wire; its tests drive `_channel` directly with a fake `device_fx` shaped as 3A built it (section 6.3, "As built in 3A": `house.device_fx.current.rain`, missing until known; `snapshot.device_fx_recent`; `{"fx": entry}` with a ring-shaped entry; the same `id` may come in both; no `device_fx` key means nothing to paint). | 1 | M-L | `gate --auto`, plus the new card-check section (below) | The wet look and the drop on a phone and a wall tablet against each finish; open at 20 s and at 3 min by eye; the 0-10 s onset delay and, on a flap, the 45-55 s held reverse (m4: the pet says "rain!" and the glass is dry 45 s later is the **expected** result); rain with reduced motion on (still sheen); rain at night (the drop plays, silent); the switch off. **Added by the 3B build:** the sheen on each finish and in each world on a phone (is it a wet window or a dirty one: the bead gradients and `.dir-wet::before` opacity in `style.js` are the dial); the drop's size and speed at arm's length (18 steps over 1.8 s, 3x7 px at the 2 px grid); a first view by swiping to the second pet (the echo plays once, on that slide only; going back and forth does not replay); a hidden tab in rain and back (no replay: M7); the status sheet opened over rain (the glass is hidden under it, nothing plays) and closed (the sheen is back); a browser without CSS `round()` (older Safari: no glass at all, the card as before); HA restarted while it rains (the sheen returns with the first snapshot, no echo); the pet's own lines ("it's raining") unchanged. |
| 3C | **Rim cues from section 7** (from slice 2, FM5): feed's delivery glow, play's two-point pulse, clean's one sweep, the tuck's lamps dimming once confirmed, as `shellImpulse` leases through the director, gated by `canRender` (a press with screen effects off still has its cap feel from slice 2; only the rim cue goes). They key off the toy's `data-action` that slice 2 already sets (`feed`, `play`, `clean`, `medicine`, `lights`; snack, scold and praise have none and get no rim cue, as FM6 gave them the default), fire from `_tapped` or the scene's own beat and never from the cap's classes, and add no `transform`, `animation` or `filter` to `.cap` or `.toy` (slice 2 owns the cap's `translate`, `filter` and transition; a rim cue lives on the rim layer, `dir-*`). Needs only the adapter, no wire, no server; **3B landed first, so 3C reuses what it built**: the director on the card (`this._director`, created in `_build`), `s.glass` is the rain's layer and not the rim's (the rim cue gets its own `dir-*` element or the toy's rim; it must not reuse `.hw.glass`), `canRender` (`lcdOn()` and the slide's `_dirShown`), `s.statusOpen`, the `animationend` release (the card's one listener on the slide's screen releases `s.dirEffect`; 3C leases need their own effect id field or the same one, one effect per track), `serverClockKnown()`, `device-fx.js` (a rim recipe is a new entry in the card's `recipes`, passed to `create`), the TDZ card-check case and the `devicefx` section (3C adds its own section or extends `devicefx`, and names its methods in the comment, `pick-sections` finds a section by mention), and the `device-fx` AGENTS.md row (3C adds a part, or its rim recipes to `device-fx.js`, and a row). Reduced motion: no cue (it is an onset). | 1 | S-M | `gate --auto` plus the `devicefx` section if it is the first adapter | Press feed, play, clean and the lights toy; each cue once against each finish; the cue with the switch off (none); the cue with a care scene running (scene wins). |
| 4A | **Weather keys: server** (FM9). Generalise `DeviceFx` to a keyed table from `DEVICE_SIGNAL_MAP` (section 6.2, F9); one timer per key (section 6.5, F6); per-key known-guards and `_fx_mapped` per key (section 6.2a, F5); keys `snow`, `fog`, `storm`, `wind` (all already in `flags`: no privacy change), `block_s` 45 each; one onset per pass, storm over rain; `test_public`/`test_channel`/`test_device_fx` parametrised over the map; the `tests/js/device_signal_map.json` export and its pytest. No version bump. | 1 | M | `scripts/ci-gate` **plus a privacy review of its PR** (as 3A; pick-sections prints `all` for non-test `.py`) | Nothing visible changes (4A has no client): the card loads; flip dev's `input_select.fake_weather` through snow, fog, storm, windy and rain, and restart HA in each: no console error. Dev config has fakes for weather and rain rate only. |
| 4B | **Weather keys: client** (FM9, FM11). `device-fx.js` becomes a table (section 6.6b, F12): `ambientOf`/`cueOf`/`paint`/`sync` driven by a JS map, no hardcoded `rain`; recipes for snow (frost), fog, storm (non-flashing) and wind on `.hw.glass`; the glass `animationend` filter, `CLASSES_BY_LAYER` and per-kind cooldowns (F11); the **client-computed moon** (static halo, full/new from `serverNow()`, no onset, no wire, no echo); the node parity test on `device_signal_map.json`; bench `alive` shots per key; `devicefx` card-check extended. Drives `_channel` with a fake wire shaped by 4A, as 3B did. | 1 | M | `gate --auto` plus the extended `devicefx` section | Each weather look once on the phone and the wall tablet, against a light and a dark finish (frost, fog, wind and the storm shiver: is it quiet, is it **not a flash**); storm with reduced motion on (still tint, nothing moves); the switch off (nothing drawn); the moon on a full and a new day; a flap in snow (the 45-55 s held reverse); the drop for rain unchanged. |
| 4C | **Activity keys: server. Owner answered Q1-Q4 (section 6.6a, 2026-11-03); startable after 4A** (FM9). The lights/fireplace/TV/music/heating/cooling/vacuum keys, per the owner's answers (section 6.6a) and the section 6.5 table, with `Watcher.known(key)` as the known-guard for the plain-bool readings; dev config gains `input_boolean`s (and templates) for fireplace, heating, cooling and vacuum, none of which has a fake today. | 1 | M | `scripts/ci-gate` plus a privacy review | With the dev fakes: flip each activity fake on a shared and a private view; confirm what the owner allowed crosses and nothing else. Without the fakes the first real flip is the owner's. |
| 4D | **Activity: client, and moment-driven rim cues. Pending owner privacy answer (Q1-Q4); not startable** (FM9, FM10). Recipes for the 4C keys; rim cues for doorbell, robot and appliance offered **from the existing moment handlers** (`card-moment.js:186-222`: `robot_out`, `appliance_done`, `doorbell_live`, `house_answered`) as `presentation:"onset"` with no second server edge; the 4D recipes reuse 3C's rim lamps. `_houseFx`/`_robotFx` do not move (FM10). | 1 | M | `gate --auto` | Each row once on the phone: lights, fireplace, heating, doorbell, a storm with reduced motion on; the rim cue and the `fx-*` cue for one event fire together, once. |
| 5 | **Idle delta: parked until species N4's art merges, then re-scoped; not startable** (FM12). Glass curiosity is dropped; what may remain is section 8's post-play settle and link-port curiosity, with the "Slice 5 acceptance, for the re-scope" below. | 1 | S-M | `gate --auto` | After the re-scope: a game then idle; a link then idle; a ten-minute idle watch on the phone (subjective: the owner's call). |
| 6 | **Rare glass: generic marks, after 4B merges** (FM13; section 9). Paw print, smudge, rim shadow (no leaf); its own element and `CLASSES_BY_LAYER` entry, not the glass pseudo-elements; a `_rareGlass` gate in `_tick` on an injected clock, with a viewed-time counter (about 20 min per pet, in memory, no night rule); `dir-*` only. **Not startable before 4B has merged.** Acceptance below, including a card-check `elementFromPoint` assertion. | 1 | S | `gate --auto` plus the extended `devicefx` section (the assertion needs real Chromium) | A long idle watch on the phone and the wall tablet: is a mark charming or dirty, and is one per about 20 minutes of viewed time rare enough; never over a control; the switch off (nothing); reduced motion (nothing). The bench stills are the worker's, the watch is the owner's. |
| 7 | **Screen morphs: parked, not a slice** (FM14; section 10). Re-planned only if the owner asks after slice 6. | n/a | n/a | n/a | none |

**Slice 3 is three PRs (s2811 review).** Order: **3A, then 3C or 3B, then the other.**
3B and 3C both need the adapter and neither depends on the other, so whichever lands
first carries the adapter foundation: the director created per card, `canRender`,
`statusOpen`, the `animationend` release, `serverClockKnown()`, the manifest line for any
new part (after `interaction-director.js`, before the `card-*` chain if it holds top-level
code; AGENTS.md "Where things live" gets a row), the TDZ card-check case and the
manifest-order guard. The review recommends 3C first (the smaller one), then 3B. The first
mate picks. **Do not run 3B and 3C at once** (card chain rule, the line above the table).

The three card-check/pick-sections facts for 3B and 3C: a new section is written in the
`if (enter("devicefx"))` form so pick-sections finds its range
(`scripts/pick-sections:46-47`), and it must **name** the adapter methods and
`_channel`, `_toggleStatus`, `_go`, or a client-only follow-up picks nothing (`:118-134`);
say so in the section's comment. `_toggleStatus` is already named by the status sections,
so a change there picks them. The real-HA end-to-end line needs the **rain rate**, not only
the weather (`is_raining` prefers the rain sensor, `home.py:115`; dev config has
`input_select.fake_weather` and `input_number.fake_rain_rate`); a real flip costs the
debounce plus, on a flap, the block. Drive `_channel(s, msg)` directly for the timing
cases and use one real flip for the end-to-end line. `scripts/copy-scan.js` should see no
diff (m8: no new strings anywhere in section 6).

**Slice 3 acceptance.** The 14 cases of section 6.8 plus 15-17, split by PR. Every case is
provable without a device; the device queue above is for the look and feel only.

3A (server; pytest, run by `ci-gate`):

| Case | Proof |
|---|---|
| 1 (server half) | one live `fx` plus `current.rain` true, no speech |
| 2 (server half) | `recent` present at 20 s (`freezer`) |
| 3 (server half) | the ring is empty after 90 s |
| 5 | fresh coordinator with rain: `current.rain` true, empty ring, no live message; the reload variant through `async_start_channel` (`coordinator.py:2930`) |
| 6 | unavailable then restored, including the over-10-min hold expiry and the never-known case (B3): no ring entry, no live message, first known reading silent |
| 7 (server half) | one event, once in the snapshot ring and once as the live message, same id |
| 10, 15 | shared channel: `device_fx` holds only the whitelisted keys and no id, title or user (`test_public.py`, `test_channel.py`) |
| 11 (server half) | leading edge, the block, the timer, the unload cancel (section 6.5) |
| 16 | a seeded week with `device_fx` on and stubbed out: equal `state.to_dict()` and bus events, and no `self.rng` draw; a house with no weather or rain sensor has no `device_fx` key |
| channel | after subscribe, a no-change `_push_watchers` sends nothing (B4); `current` goes before `fx` (M1) |

3B (client rain; `node --test`, card-check, the bench):

| Case | Proof |
|---|---|
| 1 | node: one `offer`, `_channelMoment` untouched; bench shot for the wet look |
| 2, 3 | node: `enterView` inside the window gives one admit; after it, `nothing-to-echo` |
| 4 | node: two offers with `canRender` false, `pending` holds one, `enterView` decides from the ambient (`interaction-director.js:218-224,296`) |
| 7 | node: director `seen` dedup in both orders; card-check: `_channel` snapshot then `fx` (the `channel` section's `_mineFor`) |
| 8 | card-check, two slides, the same rain on both: only the selected plays |
| 9 | node: `isBusy` game, `enterView` returns `busy`; card-check for "no delay" |
| 11 (client half) | node: collapse and `stillTrue`; an echo with the ambient flipped does not play; `flags` and `current.rain` disagree (M2) |
| 12 | CSS source test and bench with reduced motion; node: `calm()` means no `offer` or `enterView` and ambience still set; switch off means no ambience; no quiet-hours branch; source test: no `vibrate` and no audio in the adapter |
| 13 | card-check (a real IntersectionObserver in Chromium); node cannot. A reconnect snapshot on a viewed slide does not echo (M7) |
| 14 | bench shot with the dialogue and the status open; card-check: the glass's bounding box, `pointer-events:none`, `elementFromPoint` on a control |
| 17 | node: the part-order guard like `hop_engine.test.js:19-31`; card-check: no `pageerror`, `customElements.get("hatch-pet-card")` defined, the slide has a director (a TDZ error stops the card defining at all, so the prelude already fails loudly; the dedicated case is cheap) |
| clock (M5) | node: a skewed fake clock, a live onset is not silently expired; `offer` gated on `serverClockKnown()` |
| fx / dir (m5) | source test: no `fx-` in the adapter |

**As built in 3B (what 3C reads).**

- **Part and adapter.** `src/card/device-fx.js` (`HATCH_DEVICE_FX`, after `interaction-director.js` in
  `manifest.txt`): `RECIPES.rain`, `ambientOf`, `cueOf`, `ringOf`, `paint`, `sync`, `live`, `enter`. No `this`,
  no timer, no sound or vibrate. The card's methods that call it are in `card-visit.js`:
  `_dirEnv`, `_dirShown`, `_dirSync`, `_dirLive`, `_dirView`, `_dirPause`, `_dirSwitch`.
- **Director.** Created in `_build` with `now` = `serverNow`, `deviceNow` = `Date.now`, `trusted` =
  `serverClockKnown`, `canRender(s)` = `lcdOn() && this._dirShown(s)` (on show and visible; reduced motion
  is **not** in `canRender`, `live` and `enter` check `calm()` so the ambience is still set),
  `schedule` a `setTimeout` returning its cancel. `tick` runs from `_tick`; `reset` on disconnect;
  `detach` in `_forget`. `serverClockKnown()` is in `shell-data.js` (true after the first reading inside the
  skew cap).
- **Wire to cue.** `rain_started` is `direction:"start"`, `data:{key:"rain", value:true}`; `rain_stopped` is
  `"end"`, `false`; both `collapseKey:"rain"`. A live entry is `presentation:"onset"` with no `occurredAt` or
  `ttlMs` (M5); a ring entry is `"echo"` with the server's times.
- **Where it hooks.** `_channel`: the snapshot sets the ambient (`_dirSync`) and keeps the ring, then the
  first view decides (`_dirView`); a house diff re-syncs; `{"fx": entry}` goes to `_dirLive` before the
  early return. `_go`, the IO callback, `_onHidden` and `_bootEnd` call `_dirView` for the slide in view (the
  first view marks the slide; a reconnect snapshot on a viewed slide never echoes, M7); leaving a slide, a
  hidden tab and the IO "not visible" cancel the `shellImpulse` track. `_toggleStatus` sets `s.statusOpen`.
  `animationend` on the slide's screen releases `s.dirEffect`. `lcd` switch: `_dirSwitch` (off clears the
  glass, on repaints the sheen).
- **Glass.** `.hw.glass` (an `<i>` in `.screen`, after `.glow`, before the attention icon, bubble, status
  sheet, game box and boot layer, `z-index:0`, `pointer-events:none`), only under `ha-card.lcd-on` and
  `@supports (width: round(1px,1px))`, hidden while `.screen.show-status`. Classes: `dir-wet` (the still
  sheen: beads and a faint wash), `dir-drop`/`dir-clear` (the onset, 1.8 s, 18 steps), `dir-echo` (the
  shortened form, .9 s). Reduced motion: the sheen only; `live` and `enter` offer nothing under `calm()`
  (and the global rule would stop the animation anyway).
- **Not changed.** `_houseFx`/`_robotFx`, the `.pet` rules (`motion_rule.test.js` `ALLOWED` is untouched),
  the server. No new copy; the pet says nothing for the rain from this path.
- **card-check.** Section `devicefx` (before `lcd`), written in the `if (enter("devicefx"))` form, naming
  the adapter methods, `_channel`, `_toggleStatus`, `_go`, `_onHidden` and the part's constants. It drives
  the card's own `_channel` (cases 1, 2, 3, 7, M7, 8, 9, 12, 13, 14, 17); the real-rain-flip line (dev's
  `input_number.fake_rain_rate`) is not in it, see the first mate's list in the 3B report.

**As built in 3C.**

- **Part.** No new part: the rim recipes are in `device-fx.js` (`RIM`: `feed`, `play`, `clean`, `lights`, each a kind
  `rimFeed`, `rimPlay`, `rimClean`, `rimTuck`; `RIM_CLASSES`; `rim(dir, slide, action, id, env)`), merged into
  `RECIPES` beside the rain, so the manifest order and the TDZ guard are unchanged. A rim recipe is a `shellImpulse`
  lease at `PRIORITY.care` (a press is over a house onset; a rain drop in flight is replaced, the sheen stays),
  `durationMs` 1300 / 900 / 1100 / 1800, `cancel: "finish"`, origin `user`, presentation `onset`, no cooldown, a fresh
  id per press (`rim-<n>`).
- **Layer.** `<i class="hw rim"><b></b><b></b><b></b></i>` in the `.bezel`, after `.hw.light` and before `.screen`
  (so beside the toys, never over one): `inset:0`, `z-index:-1` like every `.hw`, `pointer-events:none`, shown only
  under `ha-card.lcd-on` and the `round()` gate, hidden under reduced motion. `.cap` and `.toy` have no rim rule. The
  rain's `.hw.glass` is untouched; the two layers share the one `s.dirEffect` (one `shellImpulse` effect per slide).
  The rim's own `dir-rim-life` animation is the lease's clock; its `animationend` (target the rim only) releases it.
- **Cues.** Amber lamps (`b`) on the bezel plastic, by opacity or `left` only: feed = three lamps along the bottom edge
  lighting in turn; play = the middle of each side, two pulses; clean = one lamp sweeping the top edge; tuck = three lamps
  on the top edge, each lit then dimming, one after another.
- **Where they start.** `_rimCue(s, action)` (card-visit.js) is the one method, called from `_press` (feed, clean: after
  the call is known to go out, **ahead of `_sceneStart`**), `_startGame` (play: after its refusals) and `_sceneEnd` (the
  tuck: `sc.kind === "lights" && !sc.wake && sc.result === "ok" && s.wasAsleep === true`, so a confirmed lie-down, never
  a wake, a refusal or a tap that cut the scene before the lie-down beat). Not from `_tapped`, which in `_press` runs after
  `_sceneStart`, when the press's own scene already counts as running and would win. No tuck beat is edited
  (`_lightsTuck`, `_lightsWake`, `card-care.js` are untouched).
- **Rules.** `rim` offers nothing under `calm()`; checks `busyOwners(slide)` for `scene` itself (the director only
  consults the busy list for `screenFx` and `petBody`) and returns `busy`; the director's `canRender` handles the switch
  and the slide on show. A press is never held as an echo. Medicine, snack, scold and praise: `no-cue`. No sound and no
  haptic anywhere in the path.
- **Bench.** `alive/rim-*`: one shot per cue mid-flight at both widths, feed and tuck on a dark shell, the switch off,
  reduced motion, a clean scene running (the scene wins) and medicine (no cue). Shot option `rimCue` (README).
- **Not done / for slice 4.** No card-check case (the node tests and the bench cover it; the real-Chromium
  `elementFromPoint` check on a control is a one-liner to add to `devicefx` if the first mate wants it). The tuck's cue
  comes at the scene's end, after the dim, not during it (the scene is running then, and it wins). Slice 4 may move the
  rim recipes with the house rows if they are to share a rim layer with ambience.

3C (rim cues; `node --test`, the bench, card-check only if first adapter):

| Case | Proof |
|---|---|
| 12 (the rim half) | reduced motion or the switch off: no cue; no haptic and no audio from the cue |
| 14 (the rim half) | the cue sits on the rim layer, `pointer-events:none`, never over a control |
| 17 | already in `devicefx` (3B); a new part for 3C goes in `manifest.txt` after `device-fx.js` and extends the TDZ test |
| rule | source test: no `transform`, `animation` or `filter` on `.cap` or `.toy` from a rim rule; the cue starts from `_tapped` or the scene beat, never from the cap's classes; `dir-*` only |
| shared frame | node: a care scene running wins over a rim cue (`BUSY_OWNERS` `scene`) |

**Slice 4 acceptance** (FM9). Every case is provable without a device; the queue above is
for the look and feel only. 4A and 4B may overlap only in the sense that 4B drives
`_channel` with a fake wire shaped by 4A, as 3B did; **never two workers on the card chain
at once**.

| PR | Proof |
|---|---|
| 4A | pytest, per key of the map: leading edge, the block, the timer, the unload cancel, unknown (into and out of), first-known-silent, restart; two keys blocked at once, both held reverses delivered (F6); one onset per pass, storm over rain; 17 or more entries in one pass keep every fresh live entry (ring `maxlen`, `take_fresh`); the shared-screen **canary built from the map** (section 6.2a); case 16 per key (a week equals main; a house mapping only a snow source has only `snow`; no source, no `device_fx`); the JSON export in sync (section 6.2) |
| 4B | node: the parity test (every wire kind has `KINDS` and `RECIPES` entries, every ambient key is read and painted, no JS kind outside the JSON, a bench shot per key); an echo with the ambient flipped does not play, per key; the glass `animationend` of an ambience animation does not release a running rim cue (F11); `CLASSES_BY_LAYER` against `style.js`; per-kind `cooldownMs`; CSS source test: the storm has no `opacity` swing above the threshold and no `animation` above 3 Hz; reduced motion is still ambience; a kind with no recipe is ignored; the moon is computed with no wire key and `device_fx` absent in a house with no source; the 3B rain tests pass in table form; card-check `devicefx` |
| 4C | as 4A for each activity key the owner allows, plus the canary for every one of them; the "nothing the owner did not allow" case (a key the answers exclude is absent from the map and the wire) |
| 4D | as 4B for the 4C keys, plus: source test, no recipe in `device-fx.js` names an `fx-` class and the `_houseFx` call sites are unchanged (extend the m5 test, FM10); a moment's rim cue and its `fx-*` cue come from one handler at one instant, with no second wire edge; a doorbell never has a ring entry (if Q2 is as recommended) |

**Slice 6 acceptance** (FM13). Everything except the last row is provable without a device.

| Case | Proof |
|---|---|
| gate | node, injected clock: no mark before the viewed-time threshold; one mark at it; the next not before another full threshold; never the same mark twice in a row; never on the first view |
| hidden / off-slide | node: `document.hidden`, an off-slide pet and the status sheet open freeze the counter (time spent there does not count) |
| switch off, reduced motion | node: "screen effects here" off draws nothing; `calm()` draws nothing (decoration, not an onset) |
| busy owner | node: any `BUSY_OWNERS` owner (a care scene, a game, a question, a visit) draws nothing and the counter does not run |
| ambience / onset | node: an onset or echo lease on the glass or rim blocks the mark; persistent weather ambience does not (section 9); a mark never changes `s.dirEffect` unless it takes the lease, and then loses to any house onset |
| no release | node: a mark's `animationend` does not release a running rain or weather lease, and a weather animation ending does not clear a mark (4B's `animationend` filter and `CLASSES_BY_LAYER` cover the new layer) |
| memory only | source test: the gate reads no save field, writes no `PetState`, no `localStorage`, nothing on the wire; the counter lives on the slide `s` |
| CSS source | source test: the mark's rules have `pointer-events:none`, use `dir-*` only, no `fx-*`, no `filter`/`blur`, no `transform`, `animation` or `filter` on `.cap` or `.toy`, and do not use the glass's `::before`/`::after` |
| motion rule | `motion_rule.test.js` passes untouched (the glass, not `.pet`; no new `.pet.<cls>`) |
| bench | stills of each mark at 420 and 330 px on a clear, a dark and a glitter shell, in at least two worlds (generic: the same marks) |
| **card-check** | `devicefx` extended (name `_rareGlass` in its comment so `pick-sections` finds it): force one mark through the real gate with a stubbed clock and random, then `document.elementFromPoint` at the mark's centre and at the nearest cap and toy returns the control (or the screen), never the glass or the mark. Real Chromium, not a device. |
| device (owner) | a long idle watch: charming or dirty, and whether one per about 20 min of viewed time is rare enough. Not provable by the worker. |

**Slice 5 acceptance, for the re-scope** (FM12; it holds only after N4's art has merged and
the first mate has re-scoped the slice). Everything is provable without a device except the
last row.

| Case | Proof |
|---|---|
| eligibility | node: a beat starts only through `_idle`, `_freeBody` and `_firstMove`; never over a care scene, game, question, visit or link in progress |
| one move | node: one move per beat; an absolute maximum; any state change cancels it |
| cooldown | node, injected clock: a 45-120 s global cooldown while viewed; never the same beat twice in a row |
| body class | `motion_rule.test.js`: any new `.pet.<cls>` is on `ALLOWED` with a comment saying it cannot be on with another; reduced motion honoured (`calm()`) |
| draw order | node, seeded `Math.random`: replay equals main when no beat qualifies (the `_idle` comment says "no draw: the `Math.random` order is as before") |
| no reward | source test: no count, no trick progress, no care response from a beat |
| director | the re-scope states whether the slice leases `petBody` (and so needs a director track) or not |
| device (owner) | a ten-minute idle watch; subjective |

**Slice 1 acceptance** (each checked by `node --test` or a source test; none needs a
device, card-check or the bench):

a. `node --test` covers the section 5.3 methods: track exclusivity, generation tokens
   (an old timer cannot clear a newer effect), once-only dedup by cue id, TTL expiry on
   the injected clock via `tick`, opposite-transition collapse, `cancel`, `detach`,
   `reset`, `enterView` with `trusted` false giving ambience only, `canRender` false
   storing ambient state with no onset, and `isBusy` over every owner;
b. the busy-list completeness test of section 5.3;
c. a source test fails if the part names `document`, `window`, `this`, `Date`,
   `setTimeout`, `setInterval` or `localStorage`;
d. the `hop_engine.test.js:19-31` load-order guard for `HATCH_DIRECTOR` (section 5.2);
e. "no visual change" is mechanical: the diff touches only the new part, `manifest.txt`,
   the new test, AGENTS.md's "Where things live" (one row) and docs; no other
   `src/card/*.js`, `style.js` or `bench` file changes, and the built card differs only by
   the appended part;
f. `motion_rule.test.js` passes untouched (slice 1 adds no `.pet.<cls>`).

Anything a slice would otherwise check only by eye (the bench shot per owner, a pulse on
screen) belongs to that slice's device queue and starts with the first slice that has an
adapter (3B or 3C).

Slice 5 is parked until N4's art merges (FM12). Slice 6 depends on slice 3B's glass layer
and starts only after 4B has merged (FM13), not on slice 7; slice 7 is parked (FM14). The full gate is the first mate's, once per merged batch;
3A is the only slice-3 PR that needs `scripts/ci-gate` at once (and its PR gets the
privacy review); in slice 4 that is 4A and 4C.

**In flight:** Hop 3a/3b touch `card-board.js` and `card-games.js` (3a saves `hop_day`,
tier 2); slice 1 may land at any time: it touches no file they touch, and a
`manifest.txt` conflict with 3a/3b is one line. The Hop board stays a protected owner. The bespoke tuck art set is in progress and
is not a dependency, but no slice touches its beats.

## 14. Art estimate (CSS-first)

The Luna cap is about 100 per 5 h and under about 300 a day. The card already draws
every finish with CSS (`glitterTile`, printed tiles), so this plan is CSS-first:

| Slice | Image calls |
|---|---|
| 1-4 | 0 |
| 5 idle | 0 if N4's poses cover it (parked, FM12); a per-world exclusive pose set is about 9-12 and a separate decision |
| 6 rare glass | 0 (CSS; generic marks, FM13) |
| 7 morphs | parked (FM14); if revived, 0-10, only where CSS cannot do it |

So about **0 calls** on the plan as it stands, plus 9-12 only if the owner wants
world-exclusive idle poses, and 0-10 only if slice 7 is ever revived. The internals art (parked) is not counted.

## 15. Tests and bench

- **JS (`node --test`, `tests/js`):** slice 1: the acceptance list in section 13
  (`interaction_director.test.js`). Later: signal-map completeness (slice 4),
  `motion_rule`.
- **Python:** `tests/test_device_fx.py` for hysteresis and the block timer, ring age,
  restart with no fake onset, the sanitiser, HA-unavailable chatter and the unknown rule
  (B3), and the `_house_view` carry (only `current`, B4); `test_channel.py`
  and `test_public.py` for the shared screen.
- **Bench:** a new `alive` preset: rest, pressed, rain current, echo pending, a
  protected state (Hop board open, status open), reduced motion, 420 and 330 px. The
  bench cannot test the channel or a restart (its README Limits).
- **card-check:** from 3B (built), a section for the echo (a fake `device_fx` over the real
  channel), the TDZ-order case, restart. Slice 1 has none. Use a real HA only for behaviour (AGENTS.md).

## 16. Risks

| Risk | Mitigation |
|---|---|
| Effects collide with pet transforms, lines, scenes, games, visitors | One pet-body track, the `BUSY_OWNERS` table and its completeness test, `dir-*` classes (never `fx-*`), `ALLOWED` discipline, card-check from 3B/3C |
| A stale moment plays as if the house just changed | State/edge/echo split; server `occurred_at`; `current` wins; catch-up never pulses |
| Sensor noise becomes toy notifications | Hysteresis, one pulse at most, quiet ambience |
| The detector disagrees with the speech moments | It reads `Readings`, not moments; they may differ on purpose |
| Visual clutter, fatigue | Long cooldowns, one pulse per slide, morphs last and optional |
| A tablet runs hot | Active slide only, no new loop, CSS only, freeze when hidden |
| A directed effect hides control or focus | `pointer-events:none`, the busy owners, a bench shot each |

## 17. Open questions for the first mate

**Answered, kept for the trail.** The first draft's three questions are decided in section
1: a generic rim in every world through slices 3-4 is FM1; rare glass before morphs, on
3B's glass layer, is FM2; no wording is needed, and any label needs a DRAFT line from the
first mate, is FM3. The two non-privacy questions of the slice-4 review are FM9 (four PRs,
weather first) and FM10 (`_houseFx`/`_robotFx` stay). Arrival cut and the moon off the
wire are FM11, which the owner may reverse. The slice 5-7 review's questions are decided
as FM12 (slice 5 parked until N4's art, glass curiosity dropped), FM13 (slice 6 generic
marks, about one per 20 minutes of viewed time, after 4B) and FM14 (slice 7 parked); the
owner may reverse any of them.

**Open: the owner's privacy questions.** They gate 4C and 4D (FM9) and nothing else; 4A and
4B do not wait. They are cited as Q1-Q4 here and in section 6.6a, which holds the review's
recommendation for each; section 1's Q1-Q5 are a different list (already decided). Privacy
ones first, as the review asked: Q1, then Q2, then Q3.

1. **Q1: lights, fireplace, TV, music on a shared wall tablet.** May their on/off *edges*
   (with the 90 s echo) cross the wire? The states are already in `flags`; the edge with a
   timestamp is new. (a) ambience only, no onset, no echo; (b) onset live only, no ring
   entry, no echo; (c) full, as the matrix. Review recommendation: (a) for lights, or drop
   lights entirely; (b) for fireplace, TV and music.
2. **Q2: doorbell.** A live-only rim mark off the existing `doorbell_live`, no ring entry,
   no echo (recommended; it matches the 2026-11-01 decision that a doorbell is "said live
   and kept nowhere"), or an echo for up to N s?
3. **Q3: appliance.** One generic "done" tick with no kind (recommended), or washer, dryer
   and dishwasher kinds on the wire? Confirm oven, coffee, EV, timer and delivery never get
   a device cue.
4. **Q4: heating and cooling.** Raw `heating_on`/`cooling_on` is not in `flags` today (only
   `cozy`/`cool`). Ambience tint only, a long block, no echo (recommended), or leave it off
   the wire?
