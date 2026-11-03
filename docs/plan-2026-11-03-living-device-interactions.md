# Hatch at Home: Living Device Interaction Plan

> **Superseded by device-alive** (owner, 2026-11-03). The one canonical plan is
> `docs/plan-2026-11-03-device-alive-interactions.md`. Its §5 (tracks, arbitration),
> §7 (press profiles) and §12 (authoring model) are folded in there, rebased on current
> main. Do not build from this file; it stays as the source of those sections. Its
> frontend-only path for Home Assistant signals does not work (the server emits no edge
> for most of them) and its internals plane is parked.

**Status:** Implementation plan  
**Prepared:** 2026-11-03  
**Repository basis:** `alpine-vortex/hatch-at-home`, `main` at `ca19f71fef223747864a17cb653c4155bd2504bd`  
**Scope:** Client-side interaction polish for the pet card, shells, Home Assistant moments, idle behavior, and screen transitions. This document proposes work; it does not claim the proposed director or effects API already exists.

## 1. Product goal

Make the card feel like a small, physical, inhabited device. Ordinary actions should produce immediate, coherent responses from the button, shell, display, and pet, while the existing care, games, stories, and Home Assistant integration remain in control of the experience.

The target is a layered response:

1. **Mechanical:** the toy visibly responds to touch.
2. **Behavioral:** the pet acknowledges, anticipates, or reacts to context.
3. **Environmental:** the shell and scene reflect the home without becoming a notification panel.

The work should increase perceived presence, not add new chores, resource systems, mandatory interactions, or time-sensitive rewards. Most enhancements are visual flourishes over existing actions and state.

### Design rules

- The first visible feedback to direct input starts on the same event turn, before any service or WebSocket response.
- A real care action, game, question, or state update is authoritative. Animation success is never a precondition for it.
- Ambient behavior is optional, interruptible, and disposable. It has no gameplay debt if unseen or cancelled.
- Device/world identity comes from authored visual language, not a pile of unrelated particles.
- A Home Assistant state can change the standing atmosphere even if nobody saw the exact transition. A one-shot “the house just changed” reaction is only eligible while that event is still fresh.
- One conspicuous effect at a time. Several quiet layers may coexist when they do not compete for the same visual space.
- Retain the card’s existing reduced-motion, contrast, visibility, and shared-screen privacy behavior.

## 2. Existing implementation to extend

The current repository is organized as a split card, with source parts under `src/card/` joined by `scripts/build-card.js`. Agents must edit those source parts and `src/card/manifest.txt`, never hand-edit the generated `custom_components/virtual_pet/frontend/hatch-pet-card.js`.

Relevant current parts and behavior:

| Current part | Existing responsibility | Plan extension |
|---|---|---|
| `src/card/card-actions.js` | `_tapped()` gives immediate press classes, optional short vibration, a burst on toy controls, and a pet perk. `_call()` handles pending/failure. `_press()` begins care scenes and sends the authoritative service call. | Keep `_tapped()` as the immediate feedback entry point; give controls differentiated press profiles and send semantic events to one director. Preserve failure feedback and current action ordering. |
| `src/card/card-moment.js` | `_moment()` renders Home Assistant and game/life moments; distinguishes live, queued, flavor, and catch-up behavior; can attach an `fx` callback to spoken lines. | Add freshness-aware environmental reactions that can occur without text, plus state-driven ambient sync. Do not replay one-shot effects during catch-up. |
| `src/card/card-tick.js` | `_tick()` advances visible slides, idle, visits, visitors, links, seasons, and other scheduled behavior; it pauses for hidden tabs and respects scene/turn state. | Offer idle opportunities to a budgeted scheduler; do not add another unbounded timer or event queue to the tick loop. |
| `src/card/card-layout.js` / `card-build.js` | Constructs slides, shell, screen, pet and controls; handles render and navigation. | Add stable decorative layers inside the moulded shell and screen; keep them `aria-hidden` and outside hit testing. Route screen navigation morphs through the director. |
| `src/card/shell-data.js` | Defines moulded shell pieces, finishes, and pixel-grid styling. | Add world-specific internal component descriptors and conservative CSS variables; do not replace the existing shell mould/highlight system. |
| `src/card/world.js` | Holds world/season/trait data and intervals. | Add authored world effect data and idle behavior definitions here or a clearly scoped companion data part. |
| `src/card/style.js` | Shared card styles, reduced-motion rules, and scene visuals. | Add effect-layer styles and CSS keyframes; every new animation must fit current transform-composition rules. |
| `src/card/card-base.js` | HA connection, visibility, theme, time, and card lifecycle. | Initialize, cancel, and dispose director state with the slide/card lifecycle; use existing connection/time helpers. |
| `src/card/manifest.txt` | Defines source-part order and thus class inheritance/load order. | Insert any new director part before consumers, and keep the built artifact generated. |
| `custom_components/virtual_pet/coordinator.py` | Produces and queues server-side moments, including house-related events. | First phase should consume the existing moment contract. Only add server metadata if the client cannot reliably identify event time, edge/state semantics, or safe coalescing. |

Important implementation constraint: pet movement properties already compose (`translate` for position, `rotate` for lean/turn, `scale` for size). One-shot `.pet.<class>` animations share `transform` and must not run simultaneously unless explicitly designed to replace one another. Continue using the existing `calm()` and reduced-motion conventions. The director should not circumvent them with unmanaged Web Animations or extra classes.

There is already a care-reactions plan and existing tap feedback. This plan extends them; it should be reconciled with any in-flight care-reaction work before implementation so button/scene responses are not authored twice.

## 3. Scope and non-goals

### In scope

- Layered internal-shell illustration with subtle state-reactive light/motion.
- More convincing and distinct button press/release feedback.
- A small, curated ambient micro-behavior system.
- Physical-feeling responses to Home Assistant events and recent state transitions.
- Short, motivated display morphs, including exclusive treatments for each world.
- An interaction director that arbitrates effects and owns timing, interruption, and cleanup.
- Card-bench presets and regression checks for deterministic visual states.

### Out of scope for the initial delivery

- Any new pet care stat, reward, inventory item, obligation, or interaction requirement.
- Changes to Home Assistant entity selection, event interpretation, or automations.
- Persistent per-user behavior history, cross-device synchronisation, or analytics.
- Sound as a required feedback channel. Browser/HA sound remains governed by existing settings and policies.
- Full screen-breaking effects that obscure or relocate controls. Escaping the bezel, networked light travelling between devices, and inherited/generational echoes are optional later experiments.
- Rewriting the existing scheduler, scene engine, or card class chain wholesale.

## 4. Interaction model

Every cause is represented as an **interaction request**. The request describes what happened and the effects that may respond; it does not own game state or decide whether a Home Assistant command succeeded.

### Proposed event shape

```js
{
  type: "care.started",
  source: "player",
  at: performance.now(),
  slideId: s.entity,
  context: { action: "feed", scene: "meal" },
  freshness: "immediate",
  effects: ["button.feed.press", "shell.feed.pulse", "pet.notice_food"],
}
```

The exact API can be adapted to code conventions, but the useful distinctions are:

- `type`: semantic cause, not an animation name.
- `source`: player, Home Assistant, pet/idle, navigation, lifecycle, or game.
- `at`: a monotonic client timestamp for elapsed-time/cooldown calculations. Preserve server event time separately when supplied; do not compare wall-clock strings without parsing and time-zone normalization.
- `slideId`: prevents an old callback from animating a newly selected pet.
- `context`: small, non-sensitive facts used to choose a response.
- `freshness`: immediate action, recent external transition, current ambient state, or catch-up only.
- `effects`: optional explicit effect requests; most callers should dispatch a semantic event and let policies select effects.

### Effect tracks

Keep separate lanes so harmless lighting does not block pet behavior, while conflicts on the pet remain serialized:

| Track | Examples | Concurrency rule |
|---|---|---|
| `input` | pressed/released button, focus | Immediate; never queued behind animation. |
| `pet` | perk, glance, hop, idle chain, care response | At most one transform-based one-shot at a time. Direct action cancels/replaces ambient movement. |
| `shell` | core pulse, circuit flow, status lamp | May coexist with one pet move; newest compatible event may replace a weaker one. |
| `screen` | frost edge, ripple, star wipe, journal page | At most one major morph. Never intercept input or cover essential text/controls. |
| `atmosphere` | day/night tint, rain/firelight/music wash | Persistent state, not a timed event. Compose using CSS variables/layers. |
| `text` | existing bubbles, questions, game prompts | Remains owned by the existing line/question/game systems. Effects may not overwrite or delay it. |

## 5. Interaction Director: detailed implementation plan

### Responsibilities

The director is a lightweight client-side effect coordinator, not a second simulation engine. It:

1. Accepts semantic events from controls, `_moment()`, navigation, idle opportunities, and lifecycle changes.
2. Applies freshness, priority, eligibility, cooldown, reduced-motion, and visibility policies.
3. Chooses at most one effect per visual track and prevents incompatible pet transforms.
4. Starts effects immediately when eligible, drops stale decorative work, and cancels lower-priority work when the player acts.
5. Owns handles (timeout, animation, temporary class, CSS custom property, callback) so cancellation cleans them all up.
6. Clears state on slide switch, removal, hidden tab, and relevant scene/game transitions.
7. Exposes small start/stop/status hooks usable by the bench; it does not expose a user-facing queue.

### Suggested source placement

Add `src/card/card-interaction.js` as an inherited part early enough for all consumers, preferably after `card-base.js` and before `card-build.js` in `src/card/manifest.txt`. Its class extends `HatchPetCardBase`; subsequent class parts extend it in the existing chain. Keep world/shell configuration in data parts and CSS in `style.js`.

Candidate internal methods (names are proposals):

```js
_interactionInit(s)
_interactionDispatch(s, event)
_interactionCanRun(s, effect, event)
_interactionStart(s, track, effect, event)
_interactionCancel(s, { tracks, reason })
_interactionState(s, snapshot)
_interactionDispose(s)
```

Per slide, keep a bounded state object: active handles by track, last-start times by effect key, a small recent-event/coalescing map, current atmosphere snapshot, monotonically increasing slide generation, and a count/budget for ambient behavior. Do not store this in HA entity state or persistent user data.

### Priority and arbitration

| Priority | Source | Rule |
|---|---|---|
| P0 | player press, game answer, question answer, active care/scene input | Immediate. Cancels ambient pet/screen effects that compete. Does not wait for a service result. |
| P1 | critical lifecycle moment: hatch, stage change, waking/sleeping, explicit visitor reveal | May replace ambient effects; never delays navigation/input. Respect current line/scene and shared-screen rules. |
| P2 | fresh Home Assistant edge: doorbell, arrival, rain onset, music start, appliance/robot transition | Starts promptly if visible and eligible. Coalesce duplicate/bursty events. No backlog. |
| P3 | navigation/menus, game entry/exit, status/journal | Short transition only; skip if busy, reduced motion, or action needs instant access. |
| P4 | ambient atmosphere and idle micro-behavior | Lowest priority. Drop if another lane is active or not watched. |

Within a track, higher priority replaces lower priority. Equal-priority events should coalesce by semantic key and latest relevant state rather than stack. For instance, several temperature updates within a short window update one temperature atmosphere; they do not queue several “brr” animations.

### Eligibility and interruption rules

- **Visible active slide only** for one-shot animation. Adjacent/preview slides may receive static atmosphere but no pet performance.
- **Freshness window:** event-level HA effects should normally run only if the event occurred while the card was visible or within a short configurable grace period after the transition. Start with a 2-minute default for transient edges; tune per event type (a slow weather onset can remain meaningful longer than a doorbell). If the card is first opened later, reflect the current state quietly without replaying a missed arrival/startle.
- **Catch-up:** retain existing catch-up text behavior, but set `freshness: "catchup"`; no button-like shell pulses, startles, screen morphs, or event replay.
- **Direct input:** cancel ambient pet movement in the same turn; shell ambience may finish or fade if it does not compete. A fresh HA effect yields immediately to direct input.
- **Scenes/games/questions:** no screen morph over an active game, question choice, or essential care-scene frame. Shell status light may remain subdued.
- **Hidden/tab suspension:** cancel timed effects and stop scheduling; on return, sync atmospheric state from the latest HA snapshot, then allow new one-shot effects only from fresh events.
- **Slide/card disposal:** cancel every owned handle; callbacks must verify slide generation and connected DOM before mutating.
- **No backlog:** maintain at most one pending eligible ambient candidate; discard it when its opportunity ends. A missed cue never becomes owed.
- **Accessibility:** with `prefers-reduced-motion`/`calm()`, preserve semantic acknowledgement using static tint, a single opacity change, or no motion. More-contrast mode suppresses ghosts and low-contrast overlays. Avoid flashes; no luminance strobe.
- **Shared screens:** the visual effect may acknowledge public house state, but must never reveal personal identity, private bond data, names, presence detail, or private notification settings.

### Lifecycle/API integration

- `_tapped()` keeps its synchronous class/haptic feedback, then dispatches an input event. The press should still be visible if the service call rejects.
- `_press()` dispatches a care intent before `_call()`, then the existing scene and server reply remain authoritative. A refusal/failure dispatches a separate result event; it does not retroactively erase the press.
- `_moment()` handles spoken/catch-up text as it does today, and separately dispatches a visual event only if the moment is live, public, fresh, and eligible. Avoid hiding effects inside line callbacks: a line can be queued or delayed while a physical signal should be immediate.
- `_tick()` asks for an idle opportunity only when the slide is visible, no scene/game/question is protected, and the director is quiet. It should not own effect timers itself.
- `_go()`, slide selection, `visibilitychange`, card disconnect, and HA reconnect all notify the director to cancel or resync.
- Shell state should be set from a normalized current snapshot on render/reconnect, so the shell can correctly show “currently raining / dark / warm / playing music” independent of the order of event delivery.

### Effect descriptor and cleanup contract

Each effect definition should declare:

- `track`, `priority`, `durationMs`, `cooldownMs`;
- preconditions (e.g. active slide, asleep allowed, no question/game);
- reduced-motion fallback;
- cancellation behavior (`finish`, `fade`, or `reset`);
- target classes/elements and any CSS variables it changes;
- whether it is event-only or can be active as a persistent atmosphere;
- maximum concurrent instances (normally one per track and one per descriptor).

The start function returns a disposer or handle; the director never depends solely on a `transitionend` that may not fire when the tab is hidden. Use a bounded timeout fallback and reset temporary properties in `finally`/dispose paths.

## 6. Living transparent shells and functional-looking internals

The card already renders pixel-moulded shells, highlights, seams, finishes, and translucent styling. The opportunity is to add a small set of inner-window layers behind the display and under the shell gloss, not to cover or replace the existing mould.

### Layer stack

From back to front:

1. **Shell base** (existing moulded body and finish).
2. **Circuit/structure plane** (world-specific traces, channels, ribs, or a low-contrast printed board).
3. **Functional component silhouettes** (core, coil, wheel, reservoir, dial, or constellation ring).
4. **Light emission plane** (state driven, small-area glow with a hard opacity cap).
5. **Existing shell highlights/glints** (remain above internal graphics).
6. **Screen and controls** (existing hit targets, no overlay interception).

Prefer CSS/vector/SVG-like authored pixel layers or small transparent PNGs that align to the existing shell grid. Keep key components readable at the smallest supported card size. Avoid realistic generic circuit boards that make every world look alike.

### Core behaviors

Each device gets one recognizable **core** and at most two secondary mechanisms in the first pass. The core is nearly still at rest; its rhythm becomes visible only when something meaningful happens. Example state palette:

| Device state | Core/internal response |
|---|---|
| Idle, pet awake | Occasional faint travelling pixel along a trace; long rest between. |
| Pet asleep | Low-brightness slow pulse, no movement-heavy animation. |
| Player care press | Immediate short pulse following the button's world-specific route. |
| Pet delighted / bond moment | One soft expanding glow, then return to resting level. |
| Current HA atmosphere | Low-intensity tint or direction cue held while the state remains true. |
| Fresh external event | One authored transient reaction, eligible only inside the freshness window. |
| Evolution/hatch/anniversary | Rare signature pattern, one brief sequence, never repeated by catch-up. |

Brightness must be capped and compose with HA dark/light theme and mono-display worlds. In mono worlds use pixel/value differences and backlight tint; do not rely on hue alone.

### World-specific internal motifs

| World | Core and visible mechanism | Motion vocabulary |
|---|---|---|
| Woodland | Seed-shaped amber core; fine branch traces; one leaf/seed indicator. | A light “grows” outward along a branch, then settles. Rain uses a short downward path. |
| Terrarium | Sand/green core, tiny humidity/temperature dial and a vent/sliding shutter. | Dial nudges by a few discrete pixels; a vent breathes once; no persistent gauge that implies new gameplay stats. |
| Hearth | Warm filament/copper path and small bellows or ember chamber. | A warm line lights toward the screen; firelight has a slow, low-amplitude flicker. |
| Tidepool | Blue-green reservoir/channel, bubble nodes, shell/pearl core. | Bubbles rise through two or three nodes; a soft current sweeps sideways. |
| Pond | Lily-pad core, reed-like traces, small waterwheel/flow marks. | A ripple/light travels outward; the wheel moves only on water/rain events. |
| Night Sky | Star-dial core and constellation traces. | One star-to-star route, gentle orbital alignment, or a non-flashing twinkle. |

These are visual metaphors, not new functional sensors. A dial can reflect an already mapped temperature/humidity category, but never invent a numeric value or imply precision the integration does not have.

### “Living” not “busy” rules

- Define a static resting pose for each internal mechanism and a small number of authored transient states.
- No continuous full-bright pulsing. Use long pauses, low amplitude, and event-triggered response.
- Keep moving internal pixels small and behind the screen/bezel, never over text or touch targets.
- No randomized visual variation that makes state appear different from HA reality. Randomness is acceptable only for flavor that is not state-bearing.
- Provide one feature switch for “device effects” if existing settings architecture supports it; default enabled only if the static shell remains legible and performance cost is negligible.

## 7. Make button presses feel physical

Current `_tapped()` already provides immediate press classes, optional 12 ms browser vibration, a ring on toy buttons, and an optional pet perk. Preserve this reliable first-frame response. Improve it by differentiating cap travel, rebound, and outcome—not by delaying activation or waiting for Home Assistant.

### Button state sequence

| Phase | Target | Proposed timing/behavior |
|---|---|---|
| Pointer/focus down | Control cap | Immediately translate down 1–2 device pixels; darken lower bevel and reduce highlight. No animation delay. |
| Held | Control cap | Stay compressed; no looping bounce. Keyboard activation uses the same down state. |
| Release | Control cap | Spring back in about 100–160 ms with a restrained overshoot; keep the hit target stable. |
| Action accepted | Control/shell/pet | Distinct quiet confirmation pulse; pet response depends on action and state. |
| Action unavailable/refused | Control/bubble | Small mechanical stop or muted rebound, then existing refusal message. Do not imply an action succeeded. |
| Service failure | Control/bubble | Existing failure state/message; stop pending indicator and restore cap. Never leave button visually depressed. |

Use `:active`/pointer events where possible with class-based fallback. Handle `pointercancel`, lost pointer capture, keyboard Space/Enter, disabled, and rapid repeat. Preserve current duplicate-call protection and scene skip semantics.

### Distinct tactile profiles

Profiles should vary through the same small vocabulary (travel, rebound curve, haptic if supported, one shell cue), not bespoke long animation for every click.

| Action | Press character | Secondary cue |
|---|---|---|
| Feed | Soft, confident travel; slightly rounded rebound. | A short internal “delivery path” glow; pet anticipates food if hungry. |
| Play | Springier rebound. | Tiny shell bounce or bright two-point pulse; pet may perk up. |
| Clean | Crisp short press with a restrained two-part release. | One wiper/clearance trace; avoid adding a full-screen wipe to every cleaning step. |
| Medicine | Firm but gentle, minimal bounce. | Brief stable confirmation; pet reaction remains temperament/context driven. |
| Sleep / tuck-in | Soft press that settles rather than bounces. | Core and shell lamps dim in sequence once the sleep action is confirmed. |
| Praise / affection | Warm press, not a loud mechanical snap. | Warm core response; use only if these actions exist in the current configuration. |
| Scold / discipline | Quiet stop; no celebratory burst. | Pet response is subdued and remains governed by existing fairness rules. |
| Navigation / menu | Light, quick travel. | No pet hop by default; subtle screen transition only when it adds orientation. |

### Important semantics

The tap animation means “I registered your input,” not “the server accepted the care.” Keep the existing asynchronous result path. The pet may acknowledge the intention immediately (glance/lean) but should perform the outcome animation only when the scene/server state supports it. If the action is refused, switch to the existing refusal semantics without playing an eating/cleaning success.

## 8. Idle micro-behaviors

Micro-behaviors are brief, optional actions in the pet’s existing idle space. They must not become a second event/story queue or compete with the existing `_idle()` lines, tricks, visits, seasons, flair, promises, or games.

### Good candidates

| Family | Example | Context hook |
|---|---|---|
| Attention | Tracks a falling leaf/bubble/star with head/eyes; looks toward the edge, then returns. | Appropriate ambient prop/weather; no active line or visitor reveal. |
| Self-maintenance | Checks paw/wing, smooths feathers, adjusts posture, shakes off a droplet. | Species-appropriate; never while eating, sick reaction, or active care scene. |
| Drowsiness | Nods off briefly, catches itself, stretches. | Sleepy but not currently asleep; suppress around scheduled bedtime line. |
| Practice | Rehearses one learned trick or promised movement, with a small imperfect attempt. | Only if trick/promise state exists; do not imply failure or alter progress. |
| Curiosity | Inspects a static shell element, the glass edge, a visitor clue, or a device light. | Triggered by a real nearby cue; no generic staring loop. |
| Playful discovery | Nudges an idle prop, balances, then casually resumes. | Only with the right prop/temperament and a free pet track. |
| Social | Glances toward another visible shelf pet or waves. | Respect per-person/shared-screen handling; never reveal private identities. |
| Screen awareness (later) | Paws at glass, brief reflection glance, smudge fading from foreground. | Rare; do not place under controls or over content; first prototype only one. |

### Candidate selection and cadence

- Trigger opportunities from the existing visible-slide tick, but decide no more than once per interval. Start at a deliberately low rate (roughly one micro-behavior every 90–180 seconds of eligible visible idle, with per-behavior cooldowns); tune from bench and user observation.
- Require a minimum idle window since the last pet movement, line, visit, care action, navigation, or HA one-shot. Do not try to “make up” skipped behavior.
- Use pet species, life stage, awake/asleep status, temperament, learned tricks, available props, current world atmosphere, and current scene as gates. Avoid hard-coded one-animation-per-species for initial delivery; author a handful of broadly compatible behaviors and add species variants where art exists.
- Use short chains of 2–4 beats (notice → investigate → return); each beat is cancellable and has a maximum overall duration of about 2–5 seconds.
- Never run a micro-behavior while a question, game, care scene, visitor arrival, first-look greeting, important spoken line, or direct action is active.
- Existing line and animation semantics remain authoritative. Micro-behaviors should not set new pet state, memory, bond, resource, or care history.
- A direct action interrupts at the next animation frame/beat. The pet transitions toward the action’s response, not abruptly to a frozen pose.

### Initial micro-behavior set

Build three first: (1) tracks a world particle, (2) a species-safe self-adjustment, (3) practices a learned trick. These use existing art/frames and offer context variation. Add screen-glass behaviors after the director/layer prototype proves stable.

## 9. Make Home Assistant signals feel physical (highest priority)

Hatch already has a distinctive advantage: the home itself can affect the pet. The device should appear to register a house change before or alongside the pet’s spoken reaction. The key is to distinguish a **state** from an **edge**:

- **State:** “music is playing,” “it is dark,” “the mapped room is cold,” “rain is currently present.” State drives a quiet persistent atmosphere that can be synchronized on card open/reconnect.
- **Edge:** “music just started,” “lights just went out,” “someone just arrived,” “the doorbell just rang.” Edge can trigger a one-shot physical response if it is still fresh.

That resolves the “every signal” goal without replaying stale events every time the dashboard is opened. Each newly received, eligible HA event gets either (a) a clear immediate one-shot reaction, or (b) a meaningful persistent atmospheric change. Repeated sensor updates are coalesced.

### Proposed event treatment matrix

Use actual existing `m.type` values from `_moment()` where possible; specific examples below describe visual treatment, not new server events. Final event mapping must confirm which current moments carry an event timestamp, before/after state, entity category, and live/catch-up marker.

| Existing HA moment/category | Immediate physical cue if fresh and visible | Ongoing state treatment |
|---|---|---|
| `weather`, `forecast`, rain onset | A few droplets travel down the inner glass; Woodland/Tidepool/Pond internal channel lights in a short route. Pet glances toward rain; no startling unless thunder event supports it. | Rain tint/rivulet can remain very faint while rain is current; clear when the underlying state ends. Forecast-only rain should read as distant sky, not actual wet glass. |
| Fireplace / mapped heat (`house_moment`, `house_live`) | Hearth filament warms from one side; pet may turn toward the fire after the device responds. | Low warm side-light while fireplace is confirmed active. Never infer a fire from general room temperature. |
| Temperature change / HVAC (`house_moment`, `house_live`) | Core shifts one shade warmer/cooler; one tiny frost/condensation edge or warm shimmer, then recedes. | Only when a mapped sensor indicates a meaningful configured category; use bands already defined by integration and never display invented precision. |
| Music starts/stops (`listening`) | One trace/equalizer-like pulse follows a short rhythm; pet acknowledges the sound afterward. | Restrained rhythmic movement only while music remains active, with a cap on animation work and no sound playback required. |
| TV starts/stops (`watching`, `tv_off_late`) | Screen-side reflection sweeps once; pet looks offscreen toward it. | Faint shifting light only while active; off event fades it away. Do not keep moving the pet or replay the “late” line. |
| Arrival / occupancy (`someone_home`, `friend_home`) | Core gives one warm heartbeat; pet looks up before its existing greeting. | Stable occupancy may slightly warm the ambient scene; do not keep pulsing. Suppress personal identity details on shared screens. |
| Doorbell (`doorbell_live`) | One quick, low-luminance shell tick; pet’s existing startle follows. | No persistent effect after the moment. Avoid multi-flash/strobe behavior. |
| Robot (`robot_out`, `robot_home`) | Small internal sweep toward a side/edge; pet may watch the direction consistent with current animation. | While out, an optional tiny movement indicator remains parked; it clears on return. No continuous loop. |
| Appliance completion (`appliance_done`) | A brief completed indicator travels to the screen edge; pet acknowledges after the indicator, not before. | No lasting status unless existing UI already shows one. Coalesce completion for multiple appliances in one short interval. |
| Chore/device/blueprint (`house_moment`, `house_live`, `house_answered`) | A small component answers the event’s category: light pulse, moving trace, or a grounded prop cue. | If it describes an ongoing entity state, maintain the corresponding low-key atmosphere; if it is a one-off, reset after the transient. |
| Moon / sunrise / sunset (`sunrise`, `sunset`, moon-related moment) | Night Sky dial aligns; Pond/Woodland horizon tint changes subtly; no extra “alert” animation. | Atmosphere smoothly follows the server’s current day/time and existing world logic. |
| Seasonal weather (`first_snow`, `first_frost`, `first_warm`, `first_fog`) | Brief world-exclusive screen material response (see section 10), then normal scene. | Existing seasonal assets remain the source of seasonal appearance; do not duplicate them with a competing overlay. |

### Freshness, “viewed shortly after,” and reconnect behavior

1. On a live event while the card is open and the slide visible, respond immediately through the director, concurrent with existing text/behavior.
2. If the card is open but the pet is asleep, keep the physical change quiet and let the existing sleep behavior remain valid; the pet may react after waking only if the event is still relevant, not by interrupting sleep.
3. If the tab is hidden, the event is not queued as an animation. On return, sync the latest state snapshot and offer a one-shot only when the event timestamp is within the configured grace window and the event type is explicitly replay-safe. Doorbell/arrival/startle should not replay after a delay; current rain/music/light atmosphere may update silently.
4. If the card was already visible during a sensor transition, the event receives the normal live reaction even if the human did not interact. This is how the toy can feel aware without requiring a button press.
5. Never dispatch physical one-shots from catch-up or stale queued moments. Existing text can still use its own catch-up semantics.
6. Use event keys to deduplicate the same server moment reaching multiple state/private channels; if no stable ID exists, coalesce by type/entity/time bucket and inspect the actual server payload before choosing the key.

### Event metadata and server changes

Prefer frontend-only implementation if current moments already provide `m.at`, `m.type`, relevant context, and enough state to distinguish transition from snapshot. If not, extend the existing moment payload minimally with a stable event ID, server `time_fired`, category/edge metadata, and relevant normalized state. Keep that metadata free of private values. Avoid adding a general HA event stream or subscribing each card to every HA state; the current integration intentionally limits subscriptions.

## 10. Screen morphing and world-exclusive transitions

Transitions should express the material and identity of the selected device. Most routine navigation remains a quick orientation cue; longer morphs belong to world changes or meaningful events. Keep user input available throughout and never make a player wait for a decorative transition.

### Shared transition vocabulary

- **LCD settle:** 80–140 ms brightness/scan settle for ordinary panel change; no heavy scanline overlay.
- **Shell aperture:** 120–180 ms shutter/iris cue for game entry/exit; keep hit target immediately responsive.
- **Page slip:** 100–160 ms layered paper/card slide for journal/status; short enough to disappear under repeated use.
- **World threshold:** 250–500 ms rare signature transition for hatching, evolution, or changing device world only. Can be skipped on repeated/open-close navigation.
- **Material echo:** 150–350 ms screen surface effect following an actual world cue (drop, frost, ripple, star, leaf), not every screen change.

Respect reduced motion by replacing displacement/zoom with a quick static color or opacity change. Avoid flashes, persistent screen warps, long blur, or effects that make pixel art unreadable. Limit transition layers to one full-screen material layer at a time.

### World-exclusive morph concepts

| World | Signature surface morph | Suitable moments | Implementation notes |
|---|---|---|---|
| Woodland | A leaf crosses the foreground glass and briefly masks the scene; when it lifts, the new panel is underneath. Rain can draw 2–3 clear droplets on the glass. | Journal open, rain onset, seasonal wind. | Layer leaf in foreground; no full panel occlusion; use a short authored sprite or CSS mask with a fixed pixel grid. |
| Terrarium | A translucent vent/aperture slides, or a fine condensation ring clears from the center outward. | Status open, humidity/temperature category change, clean. | Make it feel dry and granular; avoid water/rain treatment that overlaps Tidepool/Pond. No numeric gauges unless sourced. |
| Hearth | Warm ember wipe: a copper/amber glow appears at an edge and reveals the next view as it cools. | Sleep/goodnight, fireplace event, journal. | Limit intensity; never flame-flicker rapidly. Use the same warm palette as internals. |
| Tidepool | A short current pulls the scene sideways; bubbles rise and the next panel settles beneath a clear water surface. | Clean, rain/water cue, status. | Keep text stationary or transition between views before text appears; avoid lens distortion during active play. |
| Pond | A circular ripple expands from a grounded water contact point and resolves into the next scene. | Jump/visitor, care result, page transition. | Keep ripple centered on scene prop; do not distort controls or question text. |
| Night Sky | Star points connect into a constellation that becomes the new panel; for sleep, stars drift down into the core. | Journal, dream, sleep/wake, hatch/evolution. | Discrete, slow, no twinkling flash. Keep mono-green display legible with shape/value contrast. |

### World-exclusive signature moments

Choose one *material response* per world for first release and reserve the other ideas. A world effect should be recognizable in a small thumbnail and still be distinguishable with reduced motion.

- Woodland: one leaf landing on the glass; the pet peeks around it, then it slides away.
- Terrarium: a brief fogged corner clears where the pet touches the glass; tiny pixel vent turns once.
- Hearth: core warms as the room darkens; pet settles and the screen’s amber edge fades.
- Tidepool: a bubble rises from the shell core and reaches the screen edge; pet follows it.
- Pond: a pet/visitor movement sends a ripple through the display plane, not through controls.
- Night Sky: a constellation alignment reflects a meaningful event (dream/hatch), not a generic button press.

Keep any “pet crosses the bezel” or reflected pet moment as a later experiment after depth layers have been tested. It needs hand-authored silhouettes, hitbox/overlay checks, and a graceful static fallback.

## 11. Implementation phases and deliverables

### Phase 0 — Baseline and one-device vertical slice

**Goal:** prove the director, shell internal plane, state/edge separation, and one morph before adding six-world art.

- Work in the current `main` source layout and inspect current in-flight care-reactions changes first.
- Add the director part and minimal per-slide lifecycle/disposal.
- Prototype **Woodland** or **Tidepool** as a vertical slice; recommended Woodland for leaf/rain distinction and simpler pixel layers.
- Extend `_tapped()` for button cap travel/rebound and one semantic dispatch.
- Add one shell core, one reactive trace, one atmosphere state, one fresh HA event response (rain onset), and one world-exclusive screen morph.
- Add a deterministic bench shot/preset for active/inactive shell, press state, fresh event, stale catch-up, and reduced motion.
- Validate with card-check and project gate once implementation begins; this plan itself has not run tests.

**Exit criteria:** press feedback precedes the service result; a failed action cleans up; a stale event does not play its one-shot; atmospheric state still matches the current HA state; reduced-motion and mono-display fallback are readable; removing/changing slides leaves no active effect.

### Phase 1 — Interaction director and tactile controls

- Implement bounded track arbitration, per-slide generation token, cooldowns, effect handles, dispose hooks, and debug/bench controls.
- Standardize control states for pointer, keyboard, focus, disabled, pending, failure, and pointer cancellation.
- Add action press profiles and result-specific cues, reusing existing response animations and care scenes.
- Add basic navigation morphs; keep ordinary transitions short.

### Phase 2 — Shell internals and HA physical responses

- Add the shell component layer and data schema for all six shell motifs. Initially share a small set of reusable drawings and animation states; do not build six independent animation engines.
- Map actual HA moment types to category, state/edge, freshness policy, and one-shot visual response.
- Add state snapshot sync for render/reconnect and one-shot dispatch for live events.
- Implement one response per important signal family, then test burst handling and simultaneous music/weather/arrival cases.

### Phase 3 — Micro-behavior pilot and world morphs

- Add three micro-behaviors with conservative cadence and explicit eligibility gates.
- Add one signature screen morph per world, initially only for the most meaningful navigation/event.
- Add world-exclusive event moments only where existing art and state semantics support them.
- Review whether glass-touch/reflection should be enabled by default or remain a rare optional behavior.

### Phase 4 — Polish and expand

- Add more species/temperament variants based on observed repetition, not up-front inventory targets.
- Add rare signature moments (first hello, goodnight, hatch/evolution, visitor anticipation) by coordinating existing events and line/scene timing.
- Consider device-to-device signal travel and generational echoes only after basic effects remain stable across card reload, HA reconnect, sleep, hidden tabs, and multiple slides.

## 12. Proposed data and authoring model

Keep content declarative where possible so designers can add an effect without modifying arbitration logic.

```js
const SHELL_EFFECTS = {
  woodland: {
    core: "seed",
    idle: "rare-trace",
    events: {
      "ha.rain_started": { shell: "branch-flow", screen: "leaf-rain", pet: "notice-weather" },
      "care.feed.started": { shell: "seed-pulse", pet: "notice-food" },
    },
    atmosphere: { rain: "cool-rivulets", night: "amber-low" },
  },
};
```

This is a design sketch. Align names and schema with current `world.js`, `shell-data.js`, action types, and moment contracts. Keep the table small; generic fallbacks are essential so new species, unknown events, and future shells continue to work.

Separate descriptors into:

- **persistent atmosphere mapping:** normalized current state → CSS classes/custom properties;
- **event mapping:** fresh semantic event → eligible track effects;
- **idle behavior definition:** eligibility/context → short cancellable chain;
- **transition mapping:** navigation/event purpose + world → short screen effect;
- **accessibility fallback:** same semantic cue with reduced movement/contrast-safe visuals.

## 13. Performance, accessibility, and reliability limits

- Keep the visible card’s normal animation cost close to current behavior; no perpetual high-frequency JS loop. Prefer CSS animations and the existing tick cadence for eligibility.
- Only the active slide may animate internal layers; adjacent slides receive static state.
- Cap concurrent effects: one pet one-shot, one major screen effect, one shell transient, plus persistent low-cost atmosphere. Coalesce before starting more.
- Use CSS opacity/transform where possible. Avoid full-card filters, repeated large blur, layout reads inside every tick, or canvas loops.
- Ensure decorative layers have `pointer-events: none`, are `aria-hidden="true"`, and do not alter focus order or touch geometry.
- Check high contrast, light/dark HA theme, mono display/backlight, narrow/mobile card width, wall tablet, hidden-tab return, sleep, active game, and shared screen.
- Motion never conveys unique actionable information. Every state has a still readable representation.
- Don’t use bright flashes or rapid repeated pulses. Keep optional vibration under existing user/browser controls; no forced sound.
- Every timer/animation/listener is owned and disposed. Test reconnect/disconnect and slide replacement for orphan callbacks.
- Avoid logging HA entity values or personal details for effect debugging.

## 14. Verification plan and acceptance criteria

Implementation should use the project’s established gates and bench workflow. The current agent instructions say to use the card bench for screenshots and visual review; real HA is for subscription, server call, privacy, restart, and reload behavior. Build generated output from source; do not edit the bundled output by hand.

### Functional cases

1. Pointer down shows depression on the same input turn; service latency does not delay it.
2. Keyboard Space/Enter and touch/pointer produce equivalent accessible feedback; pointer cancel returns the cap.
3. Failed and refused actions restore the button and do not play success effects.
4. A new care action cancels the active pet idle motion without losing the server action or care-scene semantics.
5. A live HA event updates atmosphere and plays at most one eligible one-shot. Duplicate event deliveries coalesce.
6. A stale/catch-up HA moment does not start a one-shot. Current atmosphere still synchronizes after card open or reconnect.
7. Several sensor updates in one burst settle to latest state without queued animations.
8. Multiple HA events across categories do not obscure pet text, questions, games, or care actions.
9. An idle behavior cannot start during a scene, game, question, important line, visitor reveal, hidden tab, or unselected slide.
10. Slide switch, card removal, hidden tab, and reconnect cancel timers/classes and avoid stale callbacks.
11. Reduced motion disables displacement/long morphs while preserving readable static state.
12. Dark/light themes, high contrast, mono backlight, small viewport, and shared-screen mode remain usable.
13. Every world’s unique morph remains short, cancellable, and does not intercept control input.

### Visual benchmark states

- Each of six shells at rest (light and dark HA themes).
- Pet asleep and awake with resting core.
- Button down, released, pending, refused, and failed.
- Fresh vs stale rain/music/arrival/doorbell event.
- Combined rain + night, fireplace + night, and music + active play.
- Active care scene, open question, active game, visitor, and navigation to status/journal.
- Reduced motion, high contrast, mono display, and narrow card size.

### Success measures

- Player input is acknowledged before any network response.
- No decorative effect delays, drops, or changes authoritative action/state.
- In a quick repeated dashboard session, routine navigation remains fast and does not become animation-heavy.
- Each HA signal family has either a clear state-linked device response or an explicit reason why it is intentionally silent (unsupported, stale, private, duplicate, or visually competing).
- Shells are recognizable as six different little devices even with all effects static.
- No new persistent state is required to earn, replay, or understand a visual moment.

## 15. Priority recommendation

| Work | Player impact | Relative effort | Priority |
|---|---:|---:|---:|
| Director lifecycle/arbitration skeleton | Very high; reduces collisions across every later feature | Medium | P0 |
| Immediate press/rebound profiles built on `_tapped()` | High | Low | P0 |
| Fresh-vs-state HA response policy | Very high; makes the core differentiator coherent | Medium | P0 |
| First world internal core + event-reactive trace | Very high | Medium | P0 |
| Three interruptible micro-behaviors | High | Medium | P1 |
| Shared short morph vocabulary + 1 per world | Very high | Medium–high | P1 |
| Glass touch/reflection moment | High delight, limited frequency | Medium | P2 |
| Bezel crossing, IR shell light travel, generational visual echo | Exceptional but art/state coordination heavy | High | P2 |

**Recommended first slice:** director skeleton + stronger physical button response + Woodland core/branch trace + live rain-onset cue + leaf-on-glass morph. This validates mechanical, environmental, and screen-material responses together while using a clear existing HA event category. Keep text and care behavior exactly authoritative.

## 16. Key risks and decisions

| Risk | Mitigation |
|---|---|
| Effect collisions with existing pet transforms, lines, scenes, games, visitors, and tricks | Central arbitration, one pet motion lane, explicit interruption/priority, card-check scenarios. |
| Stale moments replay as if the home just changed | Freshness policy and current-state atmosphere sync; separate live from catch-up. |
| HA sensor noise becomes a stream of toy notifications | Coalesce by signal family, add meaningful deadbands, low-amplitude persistent atmosphere, one transient at most. |
| “Functional-looking” internals imply sensors/precision that are not configured | Tie only to normalized existing categories; label no numeric gauges; unknown state falls back to resting look. |
| Visual clutter or animation fatigue | Long idle cadence, event-gated effects, one major morph at a time, quick routine navigation. |
| Art cost across 30 species / six worlds | Start with shell-level systems reusable across species, then add only high-value compatible variants. |
| Reduced motion / mono / high contrast makes effects unreadable or inaccessible | Static fallbacks and shape/value distinction; validate all world views in bench. |
| Device effects increase mobile tablet workload | Animate active slide only; no new busy loop; cap layers and use CSS. |
| Existing button action already has tactile feedback and planned care reactions | Build atop `_tapped()` and reconcile in-flight plan before parallel implementation. |

## 17. Implementation handoff checklist

- [ ] Confirm this plan against current `main` before coding and inspect any changes merged after the basis commit.
- [ ] Reconcile with `docs/plan-2026-11-02-care-reactions.md` and any active implementation branch.
- [ ] Confirm current HA moment payload fields and card lifecycle hooks before setting the event schema.
- [ ] Add the director part in manifest order and maintain class-chain inheritance.
- [ ] Add baseline bench shots and interaction event controls before authoring many effects.
- [ ] Implement one vertical slice with explicit stale/live, reduced-motion, failure, and cancellation behavior.
- [ ] Run the matching project gate/card-check sections and full CI gate for merged work.
- [ ] Expand to additional worlds only after the vertical slice passes mobile, mono, and accessibility review.

