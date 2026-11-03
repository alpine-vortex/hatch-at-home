# Device Alive: Functional Design and Implementation Plan
**Date:** 2026-11-03  
**Status:** Proposed; specification only, no runtime changes  
**Repository:** alpine-vortex/hatch-at-home  
**Audience:** Implementing agents, art pipeline, test/QA, reviewer  
**Priority:** Home Assistant signal physicalization, then input feel and Interaction Director

## 0. Intent, product rules, and existing foundations

Make the Hatch device appear to be a living physical object, not merely a screen displaying a pet. Ordinary actions receive immediate, tactile, coordinated feedback; real-world Home Assistant changes express themselves through the screen, casing and imagined electronics; world-exclusive morphs make each device distinctive. **Nothing delays care, navigation, dialogue, questions or minigames.** All additions are cosmetic: no new stats, consumables, challenges, currencies, failure states, punishment for absence or chores.

Required invariants:
- **Action is authoritative, visuals are disposable.** Input dispatch, service calls, server state and existing care results proceed independently of presentation. Provisional anticipation retracts gracefully on a refusal/failure.
- **Protect interaction.** No new effect overlays an accessible control, text input, modal, question, status view, game, focus indicator, or player response.
- **Quiet by default.** No automatic audio; existing opt-in sound, quiet hours, sleep and lights-off constraints remain. Haptic vibration only from explicit user gestures; never from background HA events.
- **Privacy and restraint.** Do not expose entity IDs, camera images, media titles, precise presence or names on shared screens. No unbounded subscription to HA state_changed. Respect disabled/unconfigured sources.
- **Performance first.** No per-frame DOM rebuild, all effects cancel on hidden/offscreen state, no constant GPU-intensive shaders, no permanent fast blinking. All essential affordances remain visible with reduced motion and high contrast.
- **Personality without disruption.** Idle beats are rare, context-aware and preemptible. No additional speech required, no re-enactment of missed gameplay events.
- **Existing visuals win.** Avoid duplicating already-built LCD grid/ghosting/backlight/IR, existing care scene timeline, or existing idle and flair animations.

### Baseline verified from current main on 2026-11-03

- `AGENTS.md` says **edit `src/card/*.js`**, not generated `custom_components/virtual_pet/frontend/hatch-pet-card.js`; add any new parts to `src/card/manifest.txt` in inheritance/load order. The card is an inheritance chain of `card-*` parts. `scripts/build-card.js` generates the distributable.
- `src/card/card-build.js`: `_buildSlide` creates `.device`, `.body`, `.bezel`, `.hw.guts`, `.hw.light`, `.screen`, `.buttons`, backlight, pet/prop/game/status and LCD layers. `IntersectionObserver` and visibility handling already exist.
- `src/card/card-layout.js`: `_mould`, `_dress`, `_renderSlide` own physical shell finishes and six shapes; the active slide and its neighbors may be present.
- `src/card/card-actions.js`: `_tapped` already applies a pressed/tapped class, burst ring, ~12 ms gesture haptic and pet perk; `_press` starts care before a service call; `_sceneStart/_sceneRender/_sceneEnd` own care sequences. **Extend these, don't create a second care engine.**
- `src/card/card-tick.js`: `_tick`, `_idle`, `_free`, `_freeBody`, `_firstMove`, `_ghostFrame`, `_backlight` own existing ambient behavior. Do not add uncoordinated timers.
- `src/card/card-moment.js`: `_moment` already reacts to house changes, temperature/heating/cooling, media, doorbell, appliances and other semantic moments; `_houseFx` exists.
- `src/card/card-base.js`: `_channel` distinguishes live `msg.moment` from the snapshot `msg.moments`. Historical snapshot moments are intentionally not re-spoken; live moments have a roughly 15-second freshness gate. `serverNow()` and `_watchServerClock()` exist. Any new first-view visual echo must use a **separate contract**, not replay old conversational moments.
- `custom_components/virtual_pet/watcher.py`: mapped inputs plus explicitly authorized auto-detected ones, normalized readings and held unavailable values. `home.py` produces environmental flags and moments. Use semantic transitions, not raw HA writes.
- Relevant existing design: `docs/plan-2026-10-29-device-charm.md` (LCD/ghost/backlight/link/shell picker are built); `docs/plan-2026-11-02-care-reactions.md` (care scenes, anticipated and ongoing work; reconcile before changing scenes); `docs/plan-2026-10-27-real-time-connections.md` (weather commentary already built); `docs/design-worlds.md` and `docs/HANDOFF.md`.
- Existing animation rule from `AGENTS.md`: persistent pet position uses `translate`, orientation `rotate`, size `scale`; **only one one-shot body `transform` animation** may own the pet at a time. Tests enforce motion rules. Do not violate them with the director.

Before implementation, confirm the latest main/working branch version of all anchors and actual emitted event categories. This is a design verified against architecture and selected modules, not a line-by-line audit of every renderer or backend publication path.

## 1. The common visual layering system

Introduce four conceptual planes:
1. **Shell body:** existing molded case, finish, bezel, screws, trim and button caps; no ordinary transform of the entire shell.
2. **Under-plastic internals:** noninteractive clipped PCB/circuit traces, a small central core, one decorative world mechanism. Visible primarily in transparent finishes. Draw **behind shell highlights and outside screen cutout**.
3. **Display world:** existing background, pet, effects, care scenes, speech, game and status. Add `.morph-fx` in a deliberately constrained visual slot, never over controls or legible text.
4. **Inner glass:** tiny edge shadows, water beads, refractions, paw marks and very rare bounded cross-bezel illusions. `pointer-events:none; aria-hidden=true`.

Add only a few elements in `_buildSlide` (example: `.internals .core/.trace/.mechanism`, `.glass-fx`, `.morph-fx`) with slide refs. Establish local stacking contexts rather than global increasing z-index numbers. Ensure `.status`, `.game`, `.bubble`, `.pat`, `.basket`, `.boot`, focus and controls keep priority. Never alter hit target geometry when animating.

Design `shellInternalsOpacity(finish)` or equivalent in `shell-data.js`: opaque finishes hide or drastically attenuate internals; transparent ones use a mask for the physical shell (exclude display/bezel/labels). World changes and shell-picker previews swap internals and masks atomically. Keep pixel edges aligned with `_mould` and use crisp nearest-neighbor art, CSS stepped animations or a small atlas rather than blurred subpixel effects. CSS custom properties control material, emission, color and finish.

### Internal components: visual grammar and asset brief

Every device has a **core** (life indication), a **path** (input or environmental signal travels through the case) and a **world mechanism** (one recognizably different physical motion). No permanent moving particle soup. Idle core should be quiet, perhaps one weak pulse every 30–90 s while active.

| World | Functional-looking internals | Idle and user reaction | HA-initiated look |
|---|---|---|---|
| Woodland (egg) | Amber seed capsule, branch-like conducting traces | Tiny core throb; branching pulse to active cap | Leaf shadow/rain bead; warm sunlit outline |
| Terrarium (tank) | Tiny thermometric dial, geared sand regulator | Dial nudges; single cog shift on action | Corner condensation; dial moves toward warmer/cooler |
| Hearth (house) | Copper filament, little bellows/chimney circuit | Ember glows; bellows sighs softly | Fireplace/on lights warms filament; chimney wisp |
| Tidepool (porthole) | Pressure impeller, translucent channels | Bubbles in channel; short liquid transfer | Droplet travels across porthole glass; wave shimmer |
| Pond (pad) | Lily rotor, concentric water-trace rings | Rotor shifts intermittently; ripple to cap | Ripples spread under glass; dew glints |
| Night Sky (moon) | Orbital ring and constellation trace | A rare star aligns; one photon travels a path | Moon dial aligns and a faint celestial halo appears |

Asset batches: (A) CSS-only technical pilot one shell; (B) six approved static mask/PCB/core designs; (C) one short mechanism animation and one input pulse per world; (D) optional one specialty HA effect and one exclusive morph per world. Each needs default and reduced-motion static treatment, compact and normal screenshots, transparent and opaque finish samples. Do not ship placeholder art without review.

### Device state
- `ambient`: static shell lighting/tint, low-frequency core.
- `pressed`: cap depresses; signal path lights immediately. Does not represent server confirmation.
- `provisional-care`: tiny machinery begins in tandem with existing scene; success completes, refusal/failure retracts.
- `sleep`: internals dim gently, no forced waking; user backlight remains its own control.
- `link`: circuit pulse travels to existing IR port and beam; do not replace actual link behavior.
- `offscreen`: freeze expensive decorative animation and restore a coherent current static snapshot on return, not accrued frames.

## 2. Make button presses physical

Preserve existing `_tapped` behavior but move the **mechanical down state** earlier than click. Add delegated pointer and keyboard handlers that only style; the existing click / service path performs the action. Must support `pointerdown/up/cancel`, `lostpointercapture`, pointer leaving target, `blur`, keyboard Space/Enter, disabled/loading state and touchscreen scrolling. Do not cause duplicate activation or capture events that break navigation swipes. Avoid shifting actual button bounds.

| Stage | Treatment | Target |
|---|---|---|
| Hover (fine pointer) | light rim and rare eligible pet glance | no audio/haptic |
| Down | 1–2 px cap depression, lower highlight, deeper shadow, trace ignition | first rendered frame |
| Hold | stays depressed; no periodic pulses | until up/cancel |
| Release | 90–140 ms springy rebound | no activation delay |
| Pending | quiet, restrained indicator | until service settles |
| Succeeded | cap returns, scene carries reaction | immediate and consistent |
| Refused / failed | machinery withdraws, brief low-energy stop | never suggests success |
| Disabled | no false physical indication | accessibility intact |

Functional character: food = chute trace; play = little spring; clean = dual short gear ticks; medicine = deliberate quiet slide; sleep = damped/lamp settling; navigation/status = universal crisp cap; backlight = glow without waking. Limit novel pet anticipation to `_freeBody` and never over ongoing care scene, question, game or sleeping state. If `_sceneStart` claims pet motion, do not call `_perk` concurrently. Keep current haptic limited to the actual user gesture; optional setting in future only.

**Tests:** pointer cancel, swipe from cap, fast double tap, keyboard accessibility, HA failure/refusal, repeated status navigation, reduced motion, screen reader and low-power hardware. Benchmark time from pointerdown to first painted visual change at 60 Hz. No timer leak when slide removed.

## 3. Idle micro-behaviors: identify gaps rather than duplicating idle

Use existing `_idle`, `_flairTick`, `_firstMove`, `_freeBody` and species/trait signatures as the eligibility owner. The new director may choose a visual beat **only if existing movement, scene, visitor, game, dialogue or status doesn't already claim it**. One pet body motion at a time, no ambient backlog.

| Opportunity | Eligibility and visual response | Why worthwhile |
|---|---|---|
| Look toward player's hovered menu | awake, available, coarse-pointer fallback after down | Device seems aware of input |
| Paw/fin inspection | compatible species silhouette; subtle look/tilt | Tiny self-directed action |
| Practice a known trick | trick already learned, optional partial gesture | Connects current behavior to memory |
| Follow a leaf/bubble/star | world & scene context; no words | Creates layered attention |
| Drowsy catch | sleepy but awake, no sleep transition | Personality without new status |
| Glass curiosity | sprite alignment allows brief face/paw touch | Makes screen material tangible |
| Notice ambient weather | eligible rain/snow/wind; glances toward glass | Connects HA event without a speech bubble |
| Post-play settling | successful finished game with free body | A satisfying response rather than abrupt idle |
| Shadow inspection | rare eligible posture, 1–2 s | Crosses screen/physical bezel illusion |
| Link port curiosity | after a real link when body becomes free | Links existing device physics |

Initial ship: 6–8 cross-world micro-behaviors (use existing frames where possible), plus one exclusive per world after art review. Suggested tune: common nonverbal chance evaluated at normal idle opportunities, 45–120 s global cooldown while viewed; glass/rare moments several minutes, not guaranteed. No new periodic wake timers; no extra server fields or persistence. Never play the same behavior back-to-back; no daily counts or rewards. Respect stage/sprite compatibility and reduced-motion fallback. A pet's glance must not be mistaken for a successful care response.

A beat is a tiny optional mini-sequence (notice -> approach -> react -> settle), with absolute maximum duration and cancellation at any state change. Avoid overriding pet transform on step two if `_sceneStart` has begun. For partial tricks, never grant trick progress or misleading positive feedback.

## 4. Home Assistant signals physically present: the primary initiative

### 4.1 Product definition

**Every supported and authorized meaningful HA transition gets a defined short device response, plus a coherent ongoing atmospheric state if appropriate.** Not every raw sensor update: HA can publish minute-by-minute lux/power changes, unavailable/unknown chatter and repeated values. Normalize first, apply threshold/debounce/hysteresis, then interpret. Users opening the dashboard *shortly after* the change should see one relevant abbreviated visual echo.

Three separate effects:
- **Live onset:** while active card is visible, immediate 0.4–1.2 s shell/display response, plus optional pet look **only if body free**. No required text.
- **Current ambience:** ongoing quiet shell lighting/material state derived from latest normalized HA snapshot. Always correct even if no onset was observed.
- **First-view echo:** when a hidden tab/card/slide becomes actively viewed within **90 s** of a meaningful transition observed on server, play **one** shortened nonverbal onset (if still consistent with current state). After 90 s, ambience only. Echo is not a speech replay or a literal claim that event just occurred.

Settings: global `deviceMotion` following OS reduced-motion by default; `environmentEffects` default on if low-cost; optional `firstViewEcho` default on. Exact settings location must follow current settings gear conventions. No additional entity mapping for the basic feature. All existing supported sensors automatically get a visual recipe.

### 4.2 Complete initial semantic coverage matrix

| Source / semantic transition | Live shell/screen pulse | Ongoing state | Echo? |
|---|---|---|---|
| Rain starts / ends | drop strikes inner glass / last bead clears | glass wet sheen | Yes |
| Snow starts / ends | little crystalline frost / thaw | faint corner frosting | Yes |
| Rain -> sun / sunny appears | warm path fills case | brighter rim | Yes |
| Wind rises meaningfully / stops | flecks lean across a trace | slight static directional accent | Yes |
| Storm arrives / ends | **nonflashing** short dim shiver / release | cooler background tint | Yes, subtle |
| Fog begins / clears | translucent rim fog and clearing | soft glass diffusion | Yes |
| Dawn / dusk | core palette settles from cool to warm or reverse | day/night shell theme | Yes |
| Lights on/off/dim | shell circuit brightens/dims | dimmed core, independent of manual backlight | Yes |
| Heating / cooling engages | warm/cool filament passes through internals | miniature temperature sign | Yes |
| Fireplace on/off | ember ignition/sunset | warm filament | Yes |
| Media/music begins/ends | a few bars rise/fall | optional quiet media glyph | Yes |
| TV starts/ends | brief reflected rectangle near screen edge | faint TV color reflection | Yes |
| Arrival/occupancy change | single welcoming core pulse | none | Arrival only by default |
| Vacuum starts/ends | tiny rotor spins once/slows | static rotor state | Yes |
| Doorbell ring | bezel chime indicator rings visually | none | Yes (short TTL) |
| Appliance cycle completes | miniature dial passes check mark | none | Yes |
| Full/new moon | orbital mechanism aligns | static moon dial | Yes |
| Season / first snow / first frost | thematic short celebration | seasonal shell palette | Yes |
| Bad air / outdoor hot/cold (when already supported) | quiet air-filter/thermal indicator | safe static atmosphere | If meaningful transition exists |
| Unknown/unavailable or HA reconnect | **no invented onset** | use last accepted safe state, then current | No |

Inspect current `home.py`, `watcher.py`, `coordinator.py`, `card-moment.js`, `react.py` for all actual current emitted kinds. The matrix is a **coverage target, not a claim every row already has a backend event**. Build a machine-checkable `DEVICE_SIGNAL_MAP` of each supported semantic kind; support future kinds through an explicitly approved fallback only, not a generic noisy flash. Avoid media titles, image thumbnails, named occupants and raw HA entity IDs in payloads.

**World-specific mapping examples:** rain = Woodland leaf/bead, Terrarium condensation, Hearth roof drip, Tidepool porthole streak, Pond concentric ring, Night Sky droplet crossing a star-shaped reflection. A sunset is a warm seed in Woodland, a dial temperature shift in Terrarium, filament settle in Hearth, coral-colored light in Tidepool, circular rim warmth in Pond and orbit alignment in Night Sky. Reuse shared semantics but choose recipes by world ID, making a coherent family rather than six unrelated engines.

### 4.3 Event delivery and replay contract

Do **not** reinterpret historical `msg.moments` as live events; that would replay speech and privacy-sensitive events. Introduce additive **`device_fx`**, a sanitized semantic presentation snapshot independent of `mine` and conversational history:

```json
{
  "device_fx": {
    "version": 1,
    "current": {
      "rain": true,
      "snow": false,
      "night": true,
      "room_light": "dim",
      "fireplace": true
    },
    "recent": [{
      "id": "generation-sequence-218",
      "kind": "rain_started",
      "occurred_at": "2026-11-03T19:30:00-08:00",
      "expires_at": "2026-11-03T19:31:30-08:00",
      "scope": "house"
    }]
  }
}
```

This is a **proposed schema**. `current` uses normalized whitelisted booleans/enums, not arbitrary strings from HA. Never transmit dynamic CSS, arbitrary asset path or private entity information. Proposed server component `custom_components/virtual_pet/device_fx.py` owns normalization, transition detection, per-category hysteresis, time-to-live, in-process bounded recent ring (e.g. 16 total/90 s max), monotonic sequence plus generation nonce, and serialized snapshot. Coordinator/watch listeners supply normalized observations; the channel transmits snapshot and live deltas. On restart reconstruct **current** state but never fabricate recent transitions. If a server source cannot identify an exact onset time, send only ambient current. Existing old clients ignore additive fields.

Delivery details:
1. Reuse only allowed mapped watcher/coordinator events, including the explicitly supported auto-detected doorbell/robot semantics. No browser-wide HA state subscription beyond the existing bounded server clock sync.
2. Debounce or hysteresis thresholds (rain oscillation 30–60 s, light 3–5 s, temperature meaningful change threshold, music/TV only on state transition—not track metadata). Better an occasional missed flicker than constant pulsing.
3. Publish once per normalized change, with server timestamps, duplicate-resistant ID, an expiration time; keep latest current state.
4. Keep a semantic envelope separate from pet moments. Existing `house_live` and `_houseFx` still handle narrative; the director can add shell-only visuals to the same event without speaking twice.
5. The same source may be represented by current and recent; **current wins** for ongoing appearance. A recent rain-start is ineligible once current is dry. Opposite transitions collapse.
6. Private/shared channel output must be audited before deployment: no source entity ID, person, media text, camera or per-person moment may appear in `device_fx`.
7. Old snapshots/version mismatches fail closed to static baseline ambience. No requirement to persist ephemeral ring to database.

### 4.4 Client algorithm: live, hidden, catch-up

Maintain per-slide `ambientState`, `seenFxIds` (bounded to ~128), `pendingEcho` (one slot max), `activeFx` and `renderGeneration`.

- **Snapshot received:** paint current ambient state. Collect recent eligible candidate events but **do not replay** any `msg.moments`, dialogues or pet poses.
- **Live event, active view:** if visible, selected, not hidden/booting/animating protected scene, start one onset immediately. If pet body is busy, allow a *shell-only* pulse; never steal the body.
- **Live event while hidden/offscreen:** record only newest best candidate by priority/TTL. No queue.
- **First actual view:** on IntersectionObserver transition, document visibility transition, slide selection or boot end, evaluate fresh server times using existing `serverNow()`; if within 90 s and still matches current normalized state, deliver at most one abbreviated echo. Mark seen whether played or deliberately skipped for conflict, to avoid an echo repeatedly attempting to interrupt play.
- **User action at same instant:** drop echo immediately. If a question/game/scene occupies the view, update ambient safely but don't run echo or prolong any animation. Do not resume it later unless the first view opportunity is still genuinely idle and eligible.
- **Reconnect/reload:** dedup with generation + event ID, in-memory cache, optionally sessionStorage keyed only by sanitized IDs and pet key to prevent duplicate effects in the same tab. No cross-user personal data in cache. Snapshot and live delta may arrive in either order; both share one dedup path.
- **Time uncertainty:** if server clock not known or skew high, do not use local browser timestamp to assert event freshness. Show current ambience only.
- **Multiple cards:** each card may independently express the same event when watched; server events are not “consumed”. Each card dedups within its own viewport.
- **Reduced motion:** render static state without echo motion, including storm with no flashing.

Echo ranking: authorized doorbell/appliance completion > meaningful weather onset > home light/fireplace/heating > media > ambient astronomy. Tie-break by recency, not queue order. Allow users to disable echo if they want only current ambience.

### 4.5 Acceptance tests for HA integration

1. Rain starts with visible card: exactly one pulse and sustained rainy appearance, no duplicate speech.
2. Card opened 20 s later: one brief rain echo, no previous narrative replay.
3. Card opened 3 min later: ambient only.
4. Rain starts and ends while card hidden: no false ongoing rain; latest coherent event only if still fresh.
5. HA restarts in rain: ambient rain returns, **no fake rain-start**.
6. Unavailable/unknown source, then restored: no fabricated signal, and only a true subsequent change triggers onset.
7. Reconnect delivers same event in snapshot + delta: one physical pulse.
8. Two cards and multiple pet slides: no neighbor animating; selected card can react independently.
9. Player opens game when echo is pending: game takes priority without delay.
10. Shared wall tablet: no identity/media titles/private messages leak; permission-independent.
11. Weather thresholds flapping: coalesced/no rapid flashes; first-view echo never conflicts with current truth.
12. Motion reduction, quiet hours and asleep pet: safe static lighting, no involuntary haptics/audio.
13. Browser tab stays visible but IntersectionObserver briefly toggles due to scroll: event not replayed.
14. Current ambient state updates under active dialog without covering dialogue.

## 5. Screen morphs and world exclusivity

A **morph** makes the display seem to be made of a particular material—glass, water, a tiny window or constellations—without physically moving real controls. Draw in a fixed pixel-grid plane, not by reparenting or warping controls. Every world has one signature morph, one cheap accent and static reduced-motion fallback.

| World | Signature | Where it fits | Exclusive accent | Technique |
|---|---|---|---|---|
| Woodland | **Leaf shutter**: silhouettes close in natural spiral, open to new world view | rare journal/opening memory | leaf sticks to interior glass | 2–4 transparent pixel planes, stepped masks |
| Terrarium | **Thermal glass**: fog creeps at corners, wiping a clear crescent into scene | waking / meaningful temperature shift | falling sand veil | alpha masks/sprite frames, no text blur |
| Hearth | **Window-lamp**: room darkens to warm ember-shaped aperture, reopens | bedtime/wake, hearth ambience | window reflection or chimney silhouette | masked vignette, no whole-device deformation |
| Tidepool | **Liquid lens**: surface ripple briefly bends scene, settles into next view | water clean, rare scene transitions | bubble wipes porthole edge | pre-rendered displacement frames / layered highlights, no heavy real-time shader |
| Pond | **Lily iris**: pads / concentric rings overlap then reveal scene | journal transition, pond weather | waterline shifts briefly | circular sprite masks |
| Night Sky | **Constellation redraw**: stars trace tiny orbit or outline before returning as next view | moon/bedtime/journal | soft star veil | authored dot path/sprite atlas; no infinite particle system |

Shared fallback: LCD quick refresh (~60–100 ms) or no morph. Common nav target: total decorative timing <180 ms. Exclusive uncommon morph target ~300–550 ms, but **navigation itself completes immediately** and effect can be canceled in any frame. Do not morph on every tap or force the player to wait to open status, feed, or dismiss overlays. Avoid full-screen effects when modal/game/question active. The director uses `screenFx` exclusivity and may choose only a shell impulse during protected states.

Special discoveries (separate, optional rare track): paw pressed against inner glass; pet's shadow falls on inner bezel; a leaf appears caught on glass; a star or tiny gift briefly crosses into shell area. At most one per long viewing interval, no reward state or user requirement. Must fit clipping/safe area and never cover navigation/button affordances.

## 6. Detailed Interaction Director

### 6.1 Responsibility

The Interaction Director is a **presentation arbiter**, not a second gameplay engine. It receives a semantic cue (user action, authoritative server pet event, normalized HA event or idle opportunity), checks whether it can render, chooses a fixed world/style recipe, acquires effect tracks, starts it, and reliably cancels/cleans up. No data persistence or gameplay decisions. The director does not own HA service calls, pet stats, dialogue queues, actual care success, screen navigation or private content.

Suggested source parts:
- `src/card/interaction-data.js`: pure recipe registry, priority classes, compatibility metadata, world recipes, cooldowns. Insert in `manifest.txt` before card classes.
- `src/card/interaction-director.js`: standalone policy/state class with injected clock and visibility predicate, no DOM or HA dependency. Load before `card-base.js`.
- `src/card/card-interactions.js`: optional new inheritance-chain part owning DOM effect adapters; if it would substantially complicate extends ordering, put adapters in the existing appropriate part and keep the pure class separate.
- Extend `card-build.js` for layers and lifecycle, `card-layout.js` for shell finish/mask/viewport, `card-actions.js` for physical cap lifecycle, `card-tick.js` for idle arbitration, `card-moment.js` for semantic cues, `card-base.js` for channel `device_fx`.
- Server: `custom_components/virtual_pet/device_fx.py` plus bounded changes to watcher/coordinator/channel publication. Do not mix server integration and visual asset batch into one PR.

### 6.2 Event and recipe contracts

```js
// Proposed client cue (not an existing API).
{
  id: "server-generation:218",
  slideKey: "internal-device-key",
  kind: "rain_started",
  origin: "house",        // "user" | "house" | "pet" | "idle"
  occurredAt: 1793763000000, // server-normalized time where available
  presentation: "onset", // "onset" | "echo" | "ambient" | "interaction"
  priority: "environment",
  ttlMs: 90000,
  data: { intensity: "normal" } // validated whitelist only
}
```

Registry recipe fields: `key`, `allowedOrigins`, `worldKeys`, `trackClaims`, `durationMs`, `cooldownKey`, `preconditions`, `onConflict` (drop, replace, shorten), `reducedMotionRecipe`, `apply`, `cancel`, `cleanup`, `assetNeeds`. The server never supplies arbitrary CSS selectors, JS, HTML, asset URLs or styles. Client selects only trusted locally declared recipes.

Track claims:
- `control`: independent cap feedback; cannot block activation; may coexist with shell.
- `shellAmbient`: long-lived static styling, never leased out.
- `shellImpulse`: max one short visual mechanism/pulse per slide; latest meaningful compatible event may replace.
- `screenFx`: exclusive morph/crossover; never covers status/game/question.
- `petBody`: exclusive, integrated with existing `_animate`, `_sceneStart/_End`, `_idle`, `_flair`, visitor/link; **no competing CSS animation**.
- `text` and `modal`: existing card retains ownership. Director sees these as blocking/protected constraints, never owns or cancels them.

Priority tiers (highest first):
1. Input handling, focus, active controls, player-opened modal, question and game.
2. User care scenes and authoritative resulting pet/refusal response.
3. Significant pet moments: hatch, wake, visit, link and timed scene.
4. Live HA **shell-only** onset (petBody optional if free).
5. User-triggered optional morph, first-view environmental echo.
6. Existing flair/contextual micro-behavior, then generic idle.
7. Persistent ambient state (always safe, never preempts UI).

The above tiers are not a single global mutex: a protected pet body can coexist with a nonobscuring shell impulse. A modal blocks screenFx but shellAmbient remains. If conflicts occur, reject decorative request or replace lower priority on the same track. Do not queue decorative requests.

### 6.3 Pure scheduler API (illustrative)

```js
class InteractionDirector {
  constructor({ now, canRender, recipes, adapter }) { /* pure policy + adapter */ }
  setAmbient(slideKey, normalizedState) {}
  offer(slideKey, cue) {}           // returns { accepted, reason, effectId }
  enterView(slideKey, recent) {}   // considers one fresh echo
  cancel(slideKey, reason, tracks = null) {}
  setBusy(slideKey, owners) {}     // constraints from existing scene/game/ask
  detach(slideKey) {}             // cancels all timers/animations/observers
  reset() {}                      // teardown on disconnect
}
```

Per slide: `activeTracks`, `ambient`, `seenFxIds`, `pendingEcho`, `lastMicroBeat`, `generation`, `abortHandles` (for timers/WAAPI); all bounded in memory. Avoid creating a new interval per slide. One existing `_tick` or current scheduling mechanism checks opportunity only when visible, while event-driven calls handle user and HA changes.

Lifecycle:
```
semantic cue -> validate origin/schema -> compute freshness and visibility
             -> resolve world + reduced-motion recipe
             -> check protected UI and cooldown
             -> acquire compatible tracks (no indefinite wait)
             -> apply effects (immediate)
             -> authoritative change may replace/modify visual
             -> cleanup on finish/cancel/slide switch/hidden/disconnect
```

Token/generation safety: each effect invocation has a unique generation ID. Timer/animation completion callbacks verify that generation is still current before removing classes or restoring DOM. This prevents an old timeout from clearing a newer press or shell impulse. Use AbortController where supported and explicit teardown otherwise. Ensure no retained DOM references after slide removal. Never set a CSS class and rely solely on animationend: hidden tabs may pause or discard callbacks; use bounded watchdog/cleanup.

### 6.4 Integration specifics and conflicts

- `_tapped` remains the semantic click feedback; pointer-down adds physical depression only. A pressed button should not cause two haptics.
- `_press` and `_sceneStart` reserve `petBody` before action; director may light shell, but never animate pet body again. Existing care failure/refusal paths inform the director to retract provisional machinery.
- `_moment` is the primary adaptation site for already-known semantic house moments. New `device_fx` normalizes and delivers onscreen/catch-up effects; dedup with existing `_houseFx` for same cue, using one event identity if available. Avoid duplicate glow/ring/chime.
- `_idle` offers candidates, director approves or rejects; it doesn't start additional timers.
- `_renderSlide` applies shell masks/ambient current state when finish/world/state changes; it must not accidentally restart one-shot pulses on every redraw.
- `_go`, visibility lifecycle, `disconnectedCallback`, `_powerEnd`, clear/hide dialogs and `_sceneEnd` must notify or cancel conflicting tracks.
- User-driven screen transitions must change actual view first; a morph is a nonblocking flourish, not the navigation mechanism.
- Existing `_ghostFrame` and infrared link already have animation/render ownership; put their track reservations in the director adapter rather than reimplementing them.

### 6.5 Accessibility, performance, observability

Targets, subject to bench validation: initial cap state on next animation frame, typical decorative effect <1.2 s, routine UI animation <180 ms, <1 concurrently animated visual family in each physical plane, steady-state no new heavy per-frame work. CSS transforms/opacity preferred; never apply SVG filter or blur to whole live status/game subtree. Freeze when `document.hidden` or offscreen; refresh static ambience on return. No sound on catch-up; never programmatically vibrate on house events. Maintain static mode for OS reduced motion and settings; avoid flashes and rapid >3 Hz pulses. Preserve color-independent discernibility and focus outline.

Debug mode (dev only) should show bounded in-memory counters: offered/played/replaced/dropped, reason codes, active tracks, transition age, effect key, reduced-motion fallback, last cleanup. **No network telemetry**. Optional developer bench knobs: force world, transparent finish, emit cue, simulate visibility loss, simulate HA reconnect, freeze animation at frame/time, take snapshots.

## 7. Build phases, dependencies and acceptance gates

### Phase 0 — Inventory / collision map (S)
- Read latest files and identify all emitted house kinds, current shell CSS/masks, pet body animations, scene owners, signal sources and art assets.
- Record a registry of existing behavior to avoid overlaps with care reactions/device charm.
- Define layer stack, track constraints, normalized semantic list, schema version and reduced-motion approach.
- **Gate:** reviewed source map and tests proving event coverage baseline; no visual changes.

### Phase 1 — Interaction Director core + press feel (M)
- Add policy class, fixed recipe registry, track leases, cancellation/generation token handling, and dev-only diagnostics.
- Delegate pointer/keyboard cap states; preserve click semantics and existing `_tapped`, `_sceneStart`.
- Add one shell impulse with CSS-only visuals.
- **Gate:** no duplicate action, no overlapping pet body animations, clean pointer cancel, stable multi-slide, no layout shifts.

### Phase 2 — HA normalized signal bridge + first-view echo (L; highest product priority)
- Add server `device_fx` normalization/ring/current snapshot and private/shared sanitization.
- Add additive channel snapshot + live publishing, client dedup/TTL/current precedence/visibility/first-view echo.
- Implement **one end-to-end rain pathway** first, then expand every existing meaningful supported signal.
- **Gate:** all 14 scenarios in §4.5, especially restart, reorder, stale sensor, reconnect, multiple cards and hidden tab; no replay of private lines.

### Phase 3 — Transparent shell internals for one pilot world (M–L)
- Pilot Woodland, if transparent finish available; build masked internals/core/path, no sprite pipeline changes to pet.
- Validate shell picker, opaque fallback, resizing, mono, six shapes boundary assumptions.
- **Gate:** zero overlay intercepts, shell is convincing at 330 px, minimal CPU when idle.

### Phase 4 — All-world hardware + HA physical language (L plus approved art)
- Expand masks/PCB/core/mechanisms to Terrarium, Hearth, Tidepool, Pond, Night Sky.
- Bind all supported HA events to coherent world recipes, static ambient variants.
- **Gate:** six-world matrix snapshots at compact/normal and opaque/transparent; semantics match current sensor truth.

### Phase 5 — Idle micro-behaviors (M plus optional art)
- Integrate opportunity registry with `_idle` and exclusive petBody leasing.
- Ship 6–8 compatible nonverbal beats before adding world-exclusive ones.
- **Gate:** zero interference with care, talk, games, hats, poses or visitors; no repetitive loop; stage compatibility.

### Phase 6 — Exclusive screen morphs (L plus approved art)
- Build common cancelable screenFx adapter, one flagship morph (Tidepool liquid lens or Woodland leaf shutter).
- Add six exclusives with sparse trigger rules; opt out on reduced motion.
- **Gate:** all controls functional during/after cancellation; no text distortion, no nav delay.

### Phase 7 — Discovery moments, tuning and release (M)
- Add up to three rare, bounded cross-glass moments (paw mark, leaf/glass, rim shadow), with conservative cooldowns.
- Measure first impression, repetition fatigue, contrast, mobile touch and battery; reduce visual noise before adding breadth.
- **Gate:** visible immediate response on ordinary action, distinct all-world physical personality, quiet long idle, no missed command.

**Sizing:** S small focused change; M several modules + test/bench updates; L backend/frontend protocol or significant art and integration. Parallelizable: shell atlas artwork can proceed alongside Phase 2; backend schema may be developed alongside input feel. Do **not** run multiple agents editing the same card chain or manifest concurrently.

## 8. Test matrix and tooling

Use the card bench as specified by `AGENTS.md` for visuals, not a scratch Home Assistant. Add presets/shot flags for: all six worlds, every shell finish, compact and 420px, ambient rain/day/night, pending HA echo, button press/release, modal protected state, OS reduced motion, mono/LCD effects, partial shell masking. Capture image comparisons.

Use JS unit tests (alongside `tests/js`) for: registry completeness, priority/track exclusivity, exact once dedup, TTL with server clock, opposite transition coalescing, cancellation and disposal, pointer/keyboard and existing animation rule. Use Python tests for watcher normalization, debounce/hysteresis, ring age, versioned snapshot, restart behavior, privacy sanitization and event publication. Use card-check/gate for integration scenarios, multi-card and authentication; avoid assuming bench covers networking. Run `node scripts/build-card.js`, lint and relevant tests, `scripts/gate --auto` for bounded changes and `scripts/ci-gate` for complete server/channel changes as guided by `AGENTS.md`.

Explicit regressions: changed shape/finish does not display floating guts; statuses/games on top of effects; focus styles intact; care action result continues even if effect canceled; no former effect attached to a newly selected slide; screen ghosts and care transforms still compose; no accidental media title or personal presence data on shared screen.

## 9. Definition of done and decisions to review

Completion requires:
- Immediate mechanical feedback on every normal input, independent of HA latency, with keyboard and touch parity.
- Transparent shells convincingly reveal meaningful internals; opaque finishes remain coherent.
- Every existing authorized, meaningful HA signal has a documented mapping to a live shell response and appropriate ambient state, with **one 90-second first-view echo**, no false onset, no backlog or dialogue replay.
- Six visually differentiated world morph vocabularies with measured minimal navigation friction.
- A single Interaction Director coordinating all new visual tracks and respecting existing motion ownership.
- Written screenshot benchmarks, performance thresholds, semantic event coverage, privacy/accessibility review and gate pass.

Decisions for owner/art review (not blockers for architecture):
1. Start with **90 s** first-view echo; consider 60–120 s after testing.
2. Keep environment effects on by default, sound never enabled by these effects.
3. Use one common core/trace + one mechanism per world; don't redraw entire shells at first.
4. Choose Woodland as internals pilot and Tidepool as signature morph pilot.
5. Keep rare glass-breaking moments sparse and cosmetic; no reward for finding them.

**Recommended first pull request:** Phase 0 inventory and pure `InteractionDirector` tests/registry (no visual change); then Phase 1 pointer feedback; then an end-to-end **rain transition -> shell pulse -> ambient state -> first-view echo** vertical slice. Only after the vertical slice survives restart/reconnect/privacy tests should the signal registry be expanded.
