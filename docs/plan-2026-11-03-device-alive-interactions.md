# Device Alive: the canonical plan

**Date:** 2026-11-03 (rewritten the same day, slice 0)
**Status:** Canonical. Slice 0 of 7; no runtime change in this document.
**Replaces:** `docs/plan-2026-11-03-living-device-interactions.md` (marked superseded; its
§5 tracks, §7 press profiles and §12 authoring model are folded in below).
**Basis:** `origin/main` `5fc36152` (card code unchanged since `ca19f71f`). Every
"built" claim carries a file and line; recheck when a slice starts.
**Review it answers:** the s2803 scout review, findings F1-F19 (cited as F#).

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
| FM2 | Rare glass (slice 6) comes before morphs and depends on slice 3's glass layer. |
| FM3 | No labels: matrix rows stay letterless glyphs; any wording goes to the first mate as a DRAFT question. |
| FM4 | `_houseFx`/`_robotFx` stay as they are through slice 3. The director leases only the new glass/rim classes (named `dir-*`, never `fx-*`) so it cannot clear a `fx-*` class. Whether `_houseFx` moves under a lease is a slice-4 decision; decide it there with the matrix rows (heat/cool/chime overlap rows). (First mate, 2026-11-03, from the slice-1 review F4; reversible.) |

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
| `screenFx` | a morph (slice 7 only) | Exclusive; never over status, a game or a question. |
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
  pick-sections change move to the first slice with an adapter (slice 3).
- **`_houseFx` / `_robotFx` are not adopted (FM4).** `_houseFx` (`card-visit.js:610-616`)
  already does the `shellImpulse` job for the `fx-*` screen classes (one class, one
  2.5 s timer, no busy test); `_robotFx` keeps a second timer (6 s). They stay as they
  are through slice 3. The director leases only the classes it adds, named `dir-*`, never
  `fx-*`, so it cannot clear one. The slice-3 rain pulse lands on `.hw`, not on the
  `.screen` classes `_houseFx` toggles. Whether `_houseFx` moves under a lease is slice
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
- `canRender(slide)` is `lcdOn() && !calm()` (`prefs.js:251,188`; the Q3 switch) plus
  on-show and visible. When it is false there is no onset, no echo and no pulse, but
  `setAmbient` still stores the state so a later switch-on paints it.
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
with the first slice that has adapters (slice 3). Until then the table test sets it by
hand. No other owner needs one.)

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
a short cancellable chain), **transition** (purpose and world to a short screen effect;
slice 7), and the **reduced-motion fallback** (the same cue as a static tint, one opacity
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
already exist (`doorbell_live`, `robot_*`, `appliance_done`, `house_*`); `device_fx`
takes those as they are.

### 6.2 Schema and the signal map

```json
{
  "device_fx": {
    "version": 1,
    "current": { "rain": true, "snow": false, "night": true, "room_light": "dim", "fireplace": true },
    "recent": [{ "id": "generation-sequence-218", "kind": "rain_started",
                 "occurred_at": "2026-11-03T19:30:00-08:00",
                 "expires_at": "2026-11-03T19:31:30-08:00", "scope": "house" }]
  }
}
```

A proposed schema. `current` is whitelisted booleans and enums, never an HA string.
`device_fx.py` owns normalization, transition detection, per-category hysteresis, TTL, a
bounded in-process ring (about 16 events, 90 s), a monotonic sequence plus a generation
nonce, and the serialized snapshot. On restart it rebuilds `current` and **never invents
a recent transition**. A source without an exact onset sends only ambience. Old clients
ignore additive fields; a version mismatch fails closed to static baseline ambience.

A machine-checked `DEVICE_SIGNAL_MAP` lists every supported kind with its recipe; a
future kind gets an approved fallback only, never a generic flash. A test fails when a
kind the server can send has no map row.

### 6.3 Delivery on the real channel (F5)

`_channel` returns early when a message has neither `mine` nor `house`
(`card-base.js:344`), and `_push_watchers` diffs only `(mine, house)` held in `_sent`
(`coordinator.py:2943-2970`). So a bare `device_fx` key would be dropped. The spec:

- **Current state rides in `_house_view()`** (`coordinator.py:2884`, "what every screen
  sees"; `_shared_house` at `:2878` covers shared screens). It diffs and resends with
  `house` as any house change does, and the snapshot carries it. No change to the `_sent`
  tuple shape.
- **Onsets are a new live message type** (a sibling of `msg.moment`), handled in
  `_channel` **before** the early return, and sent through `_to_channel`
  (`coordinator.py:2999`). Both sides go in the same PR as a pair, with a
  `tests/test_channel.py` case for each.
- The `recent` ring in the snapshot feeds the first-view echo only.

### 6.4 Time (F7)

State changes pass `_home_debouncer` (10 s, `rates.py:302`; `coordinator.py:359-366`)
before the home pass, and the card's live gate for moments is 15 s. So a live onset
arrives **10 s or more after the sensor**, not "0.4-1.2 s". The echo window is **90 s
from the server `occurred_at`** (the sensor's own change time, not the debounce end), so
in practice a first view sees about 80 s of it. Measure the debounce before promising a
number to the owner. A doorbell keeps its own fast path.

### 6.5 Hysteresis and chatter

Rain oscillation 30-60 s; lights 3-5 s; temperature on a meaningful step only; music and
TV on state change, never track metadata. Unknown/unavailable and an HA reconnect invent
no onset; the last accepted state holds. Better a missed flicker than a flicker stream.

### 6.6 Coverage matrix (a target, not a claim a row exists)

With the internals parked, the response to each row is a **shell/glass/rim treatment on
the `.hw` family**, plus a pet look only if the body is free. Anything a row draws with
letters is out; glyphs only. New ambience is shell and glass only; it never draws a
second rain on the display (F14), and `fx-*` stays (F13): `device_fx` sits **beside** the
screen glow, shell-only.

| Source / transition | Onset | Ambience | Echo |
|---|---|---|---|
| Rain starts / ends | drop on the inner glass / last bead clears | wet sheen | yes |
| Snow starts / ends | frost forms / thaws | faint corner frost | yes |
| Rain to sun | warm sweep along the rim | brighter rim | yes |
| Wind rises / stops | flecks lean across the glass | slight directional accent | yes |
| Storm arrives / ends | **non-flashing** dim shiver / release | cooler tint | yes, subtle |
| Fog begins / clears | rim fog and clearing | soft diffusion | yes |
| Dawn / dusk | rim palette settles cool to warm or back | day/night rim | yes |
| Lights on / off / dim | rim brightens / dims | dimmed rim, never over `.lit` | yes |
| Heating / cooling | warm / cool wash along the rim | faint tint | yes |
| Fireplace on / off | ember rim lights / sets | warm rim | yes |
| Music begins / ends | a few bars rise / fall | quiet bars glyph | yes |
| TV starts / ends | reflected rectangle at the screen edge | faint colour reflection | yes |
| Arrival | one welcoming rim pulse | none | arrival only |
| Vacuum starts / ends | small rotor turns once / slows | none | yes |
| Doorbell | rim chime mark | none | yes, short TTL |
| Appliance cycle done | small tick mark | none | yes |
| Full / new moon | halo aligns | static halo | yes |
| Season, first snow, first frost | short themed pulse | seasonal rim | yes |
| Unknown, unavailable, reconnect | **none** | last accepted state | no |

World recipes differ by world id and share semantics (rain is a leaf bead in Woodland, a
porthole streak in Tidepool, a ring in Pond, and so on), a family and not six engines.
Recipes start generic in slice 3 and 4; a world flavour is CSS variables, not art.

### 6.7 Client algorithm

Per slide: `ambientState`, `seenFxIds`, one `pendingEcho`, `activeFx`, a generation.
Snapshot: paint ambience, collect eligible recents, replay no moment. Live onset on a
selected, visible, unbusy slide: one pulse now; body busy means shell only. While hidden:
keep only the newest best candidate. First view (intersection, visibility, slide
selection, boot end; the card tracks `this._visible` and the selected slide, not a
per-slide visibility, so slice 3 adds that hook): if within 90 s by `serverNow()` and still true, one shortened
echo; mark it seen whether played or skipped. A user action at the same instant drops the
echo; a game, question or scene updates ambience only. If the server clock is not
trusted (`trusted` false), ambience only. Slice 3 adds `serverClockKnown()` to
`shell-data.js` (true after one accepted reading; `serverNow()` has no "unknown" state
today, `shell-data.js:288-293`) and passes it as `trusted`; slice 1's `enterView` takes
the argument. Reconnect: snapshot and delta share one dedup path in either
order. Each card dedups for itself. Reduced motion: static state, no echo motion, no
flashing. Echo rank: doorbell and appliance done, weather onset, lights/fire/heating,
media, astronomy; ties by recency.

### 6.8 Acceptance cases (kept intact from the first plan)

1. Rain starts with the card visible: one pulse and a sustained wet look, no duplicate speech.
2. Card opened 20 s later: one brief rain echo, no narrative replay.
3. Card opened 3 min later: ambience only.
4. Rain starts and ends while hidden: no false rain; the latest coherent event only if fresh.
5. HA restarts in rain: ambient rain returns, **no fake onset**.
6. Source unavailable, then restored: no fabricated signal; only a true later change pulses.
7. Reconnect delivers one event in snapshot and delta: one physical pulse.
8. Two cards, many slides: no neighbour animates; the selected one reacts on its own.
9. The player opens a game with an echo pending: the game wins with no delay.
10. A shared wall tablet: no identity, media title or private message leaks.
11. Flapping weather coalesces; an echo never contradicts current truth.
12. Reduced motion, quiet hours, asleep pet: static lighting, no haptic, no audio.
13. IntersectionObserver toggles on a scroll: the event is not replayed.
14. Ambience updates under an open dialogue without covering it.

Added by the review: 15. a server test beside `tests/test_channel.py` and
`tests/test_public.py` that audits a shared screen's `device_fx`; 16. a recorded week with
the bridge on equals main (no save field); 17. the card-check TDZ-order case for the director, in the first slice with an adapter (slice 3; slice 1 has none, section 5.2).

## 7. Press feel: the gaps only (F2, LD section 7)

The cap goes down on press and holds (`style.js:1288-1291`); the care scene owns the
body. What is missing, all CSS custom properties and classes, no new `.pet` class:

| Gap | Treatment |
|---|---|
| Release | 90-140 ms spring rebound; the hit target does not move. |
| Pending | a restrained cap state until the service settles. |
| Failed or refused | the cap returns muted and never suggests success; the existing refusal stays as it is. |
| Cleanup | check first whether `:active` already covers `pointercancel`, lost capture and blur; fix only what it misses. A swipe that starts on a cap must not leave it down. |
| Character | the same small vocabulary per action (travel, rebound curve, one shell cue), not a long animation per click: |

| Action | Rebound | Shell cue |
|---|---|---|
| Feed | soft, rounded | a short delivery-path glow on the rim |
| Play | springy | a brief two-point rim pulse |
| Clean | crisp, two-part release | one clearing sweep, not a wipe on every step |
| Medicine | firm, minimal bounce | stable, quiet |
| Sleep / tuck | settles, no bounce | rim lamps dim in sequence once confirmed |
| Navigation | light, quick | none |

The press means "I got your input", not "the server accepted it". Praise/scold rows
apply only where those actions exist in this configuration. **Must not touch the tuck
beats** (the `s.wasAsleep` rule, care-reactions §4.9). Tests: pointer cancel, swipe off a
cap, fast double tap, Space/Enter, a refusal, repeated status navigation, reduced
motion.

## 8. Idle: a delta over N1-N4 (F8)

N1 and N2 are built (section 2); N4 (60 signature-pose frames, idle only) owns the
signature-pose space. Only these rows are new, and only if N4's poses do not already
cover them: **glass curiosity** (a brief face/paw touch where the sprite allows),
**post-play settle** (a finished game with a free body), **link-port curiosity** (after a
real link, once the body is free). Rules: eligibility stays with `_idle`, `_freeBody` and
`_firstMove`; a beat is a short cancellable chain with an absolute maximum and cancels on
any state change; 45-120 s global cooldown while viewed, glass moments several minutes;
never the same beat twice in a row; no counts, no reward, no trick progress, and a glance
is never mistaken for a care response. Any new body class goes on `ALLOWED` on purpose.
A per-world exclusive beat is a separate decision for after N4 (it would be art).

## 9. Rare glass moments

A paw mark, a leaf caught on the glass, a rim shadow, at most one per long viewing
interval, no reward, no requirement, clipped to the shell and never over a button
affordance. CSS on the glass layer slice 3 adds. Only if slices 1-5 read well on the
phone.

## 10. Screen morphs (last, optional, CSS only)

A morph makes the display feel like a material, drawn in a fixed pixel-grid plane
without moving a control. One flagship first (Tidepool liquid lens or Woodland leaf
shutter), then at most five more. Targets: common navigation under 180 ms, a rare morph
300-550 ms; **navigation completes at once** and the effect cancels on any frame. Never
on every tap, never over a modal, game or question. Shared fallback: the LCD quick
refresh or nothing. Stepped masks and `color-mix` in the style the `FINISHES` already use;
the Tidepool "pre-rendered displacement frames" are dropped unless CSS cannot do it. It
may use the director's `screenFx` track; the pet is never touched. Reduced motion: none.

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
| 2 | **Press release feel**: section 7 only. Rebound, pending, failed, cleanup, per-action character, as classes and custom properties on the cap. Bench `alive` preset. The cap states are CSS only and must not go through the director's `canRender` (`lcdOn() && !calm()`): a press with screen effects off still feels like a press. The per-action rim cues are `shellImpulse` effects, so they use the director; slice 2 is then the first slice with an adapter and takes slice 3's TDZ card-check case and `pick-sections` entry from section 5.2, or the rim cues wait for slice 3 (first mate's call; slice 1 leaves it open). | 1 | S-M | `gate --auto` | Press the four care caps and a nav cap; swipe off a cap; Space on a focused cap; one refusal. |
| 3 | **Signal bridge, rain**: `device_fx.py` (current, ring, hysteresis), `current` in `_house_view`, the live message, the client `ambient`/`echo`, one glass-drop pulse on the `.hw` family. The 14 cases for the rain row, plus 15-17. No new copy. The adapter owns the wire-to-cue mapping (`occurred_at`/`expires_at` ISO to `occurredAt`/`ttlMs` on `serverNow`, `rain_started` to a recipe kind and a `direction`), passes `deviceNow` (`Date.now`) and `trusted` (`serverClockKnown()`), sets `s.statusOpen` in `_toggleStatus`, and calls `release` from `animationend`. | 1 (server) | L | `scripts/ci-gate` (pick-sections picks `all`) | Rain on a wall tablet (shared) and a phone; open at 20 s and at 3 min; HA restarted in rain. |
| 4 | **Expand the matrix**: snow, fog, storm, wind, lights, fireplace, heating/cooling, media, TV, vacuum, appliance, moon, `DEVICE_SIGNAL_MAP` machine-checked. Two PRs. | 1 | M | `ci-gate` for the server half, `gate --auto` for the rest | Each row once on the phone: lights, fireplace, heating, doorbell, a storm with reduced motion on. |
| 5 | **Idle delta**: section 8's three rows, only if N4 leaves them open. | 1 | S-M | `gate --auto` | A ten-minute idle watch on the phone; a game then idle. |
| 6 | **Rare glass**: section 9. | 1 | S | `gate --auto` | A long idle watch; confirm it is rare and never over a control. |
| 7 | **Screen morphs**, last, optional: section 10. | 1 | L | `gate --auto` | The flagship morph, then navigating fast through it; the Hop board and a question open. |

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
adapter (slice 3).

Whether slice 5 ships at all is the owner's call after N4. Slice 6 depends on slice 3's
glass layer, not on slice 7. The full gate is the first mate's, once per merged batch;
slice 3 is the only one that needs `scripts/ci-gate` at once.

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
| 5 idle | 0 if N4's poses cover it; a per-world exclusive pose set is about 9-12 and a separate decision |
| 6 rare glass | 0 (CSS) |
| 7 morphs | 0-10, only where CSS cannot do it |

So about **0-10 calls** on the plan as it stands, plus 9-12 only if the owner wants
world-exclusive idle poses. The internals art (parked) is not counted.

## 15. Tests and bench

- **JS (`node --test`, `tests/js`):** slice 1: the acceptance list in section 13
  (`interaction_director.test.js`). Later: signal-map completeness (slice 4),
  `motion_rule`.
- **Python:** `tests/test_device_fx.py` for hysteresis, ring age, restart with no fake
  onset, the sanitiser, HA-unavailable chatter, and the `_house_view` carry; `test_channel.py`
  and `test_public.py` for the shared screen.
- **Bench:** a new `alive` preset: rest, pressed, rain current, echo pending, a
  protected state (Hop board open, status open), reduced motion, 420 and 330 px. The
  bench cannot test the channel or a restart (its README Limits).
- **card-check:** from slice 3, a section for the echo (a fake `device_fx` over the real
  channel), the TDZ-order case, restart. Slice 1 has none. Use a real HA only for behaviour (AGENTS.md).

## 16. Risks

| Risk | Mitigation |
|---|---|
| Effects collide with pet transforms, lines, scenes, games, visitors | One pet-body track, the `BUSY_OWNERS` table and its completeness test, `dir-*` classes (never `fx-*`), `ALLOWED` discipline, card-check from slice 3 |
| A stale moment plays as if the house just changed | State/edge/echo split; server `occurred_at`; `current` wins; catch-up never pulses |
| Sensor noise becomes toy notifications | Hysteresis, one pulse at most, quiet ambience |
| The detector disagrees with the speech moments | It reads `Readings`, not moments; they may differ on purpose |
| Visual clutter, fatigue | Long cooldowns, one pulse per slide, morphs last and optional |
| A tablet runs hot | Active slide only, no new loop, CSS only, freeze when hidden |
| A directed effect hides control or focus | `pointer-events:none`, the busy owners, a bench shot each |

## 17. Open questions for the first mate

1. Rows in section 6.6 that were drawn with internals (filament, bellows, dial) are now
   rim/glass treatments. Is a generic rim the right first look in every world, or does
   the owner want the world flavour before slice 4?
2. Slice order puts rare glass before morphs (the brief's order); the review had it
   after. Slice 6 therefore rides on slice 3's glass layer. Confirm.
3. Any wording: none is needed by this plan. If the owner wants a label on the echo or
   the quiet-hours behaviour, it needs a DRAFT line from the first mate.
