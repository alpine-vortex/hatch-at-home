# Plan: device charm (LCD quirks, the infrared link, power-on)

**DRAFT 1, 2026-10-29; owner answered Q1-Q10 the same day (all recommendations taken)** (revised the same day after a review pass: boot order, the ghost's class, the boot timeout, restart detection, the link's rate). A plan for the owner's review: nothing here is built. Three
ideas from the owner, in one plan because they share pieces: an overlay layer inside
the screen, the per-browser settings rows, the reduced-motion rule and the sound
gate. Each part ships on its own and in any order, except where a PR says "after".

**Line numbers are for `origin/main` at `29d77c2`.** P3a-card (in flight) rewrites
parts of the card, so re-check every reference against main before building; the
function names are the stable anchors.

## The owner's taste (the rules every part keeps)

From `docs/HANDOFF.md`, `docs/decisions-2026-10-28.md` and the earlier plans:

- **Animal Crossing is the touchstone.** Flavour only: nothing here changes a stat, a
  mood, a trait, a call or a care result, and nothing is counted.
- **Positive or quiet.** No guilt, nagging or worry. The pet never suffered while HA was
  down (downtime is frozen, `model.catch_up`), so nothing may say it did.
- **No new stats, no shops, no currencies, no forced dailies.** The infrared link has
  no friendship meter, gifts or visit counts (that would be a stat, and the Connection's
  Gotchi Points were turned down in `docs/scope-2026-10-28-progression-unlocks.md`).
- **Private things go only to their person.** None of the three reads anything private.
- **Sounds keep their rules**: off by default per browser (`hatch-sounds`), never in
  quiet hours (21:00-08:00), never while the pet sleeps or the lights are out
  (`_mayPlay`, card 3104).
- **Reduced motion** (`prefers-reduced-motion`) turns off anything that moves, not
  just CSS animation (experience plan F11).
- **Wording**: the first mate approves new lines (decisions file); art goes to the
  owner.

## What the card has today

| Piece | Where (`29d77c2`) | What it means here |
|---|---|---|
| The screen | `_buildSlide` 1766-1896; markup 1772-1802 | A 4:3 `.screen` (1169) with `overflow: hidden` and rounded corners (the porthole's are oval, 1026). Every layer is an `<img>` or a `div` inside it, so an overlay inherits the shape for free. |
| Layer order | CSS 1171-1198, 1354, 1370, 1391 | Most layers have `z-index: auto` and stack by DOM order. `.rain` is 1, `.flash` 2, `.game` 3. The `.bubble` (1191) has no z-index, so **anything given a positive z-index paints over the speech bubble**. |
| Art scale | sprites 256 × 256 | Creatures are 64 art pixels drawn as 4 × 4 blocks. Backgrounds are 512 × 384 with 1-pixel detail. No one pixel grid lines up with both. |
| Frames | `_tick` 2451-2486 (swap 2459-2462) | Two frames a mood, swapped each tick on the slide on show and its two neighbours; every other tick while asleep. |
| Movement | `.pet.wander-l/-r` 1361, `.go-left/-right` 1385; `_idle` 2541 (wander 2563); the games 4216, 4323, 4941 | CSS `translate` transitions, not keyframes. The perch follows the pet through a MutationObserver (1825-1829). `_moving` (2499) keeps hats from being placed mid-move. |
| Night | `_renderSlide` 2263-2281; filters 1174-1176 | `.night` dims the background to 85%; `.dim` (asleep or lights out) to 50%, the pet to 80%. |
| Buttons | 1876-1893 | Seven `.toy` buttons (six actions and lights). The finishes colour caps by `nth-child` (aqua 4n, 1076-1079; grove 3n, 1092-1093; dune 3n, 1120), so **a new `.toy` in the row shifts every finish's colours**. Egg and pad rows are already tight (88%, 86%; compact 38 px caps, 1509). A tap on the screen opens the status (1866). |
| Sounds | `CHIRPS` 93-101, `playChirp` 241, `unlockAudio` 123, `_chirp` 3094, `_mayPlay` 3104 | One shared `AudioContext`. Browsers start it suspended until a tap, so **no sound can play on a fresh page load**. |
| Per-browser settings | status rows 3502 ("sounds here") | Where a new per-browser switch goes. The settings gear (decisions file) isn't built yet; if it lands first, the rows move with it. |
| Several pets | `_findDevices` 1660-1683 | With no config, one card shows **every pet as a slide**. Only the slide on show is live; neighbours are dimmed (`.away-slide`, 976) and their loops paused (978-979). |
| Once a day | `oncePerDay` 398 | A localStorage key per day, with an in-memory fallback. |
| Shared screen | `sharedScreen` 183, `SHARED_EVENT` 182 | A wall tablet: nothing personal. None of these features is personal. |
| HA restart | `coordinator.async_load` 310-403 | Downtime is measured at load (`downtime = now - last_updated`, 388) and frozen. A reload makes a new coordinator. The private channel's snapshot (`channel_snapshot`, after 1943) goes to every open card on subscribe and after a reload, shared screens included through `house`. |
| Effects pack | `art/effects/` (#67) | 35 shared effects, 4 frames each, not wired. `sparkle`, `shimmer` and `happy` could serve the link; there is no beam. |

## Part 1: LCD quirks

### 1a. A faint dot-matrix grid (S)

A `div.lcd` inside `.screen`, after `.flash` and before `.attention` in the markup,
`position: absolute; inset: 0; pointer-events: none; z-index: auto`. That puts it over
the background, season, mess, pet and prop, **under** the weather effects (`.rain` z 1
and `.flash` z 2 paint above any `auto` layer whatever the DOM order, which is fine:
rain and lightning are in front of the glass anyway), and under the attention mark,
the bubble, the game and the status, so words stay crisp and buttons work.

- **The look.** Two `repeating-linear-gradient`s (rows and columns) of a 1 px dark
  line at about 8% opacity, plus a very faint warm tint. Sized by a custom property
  `--lcd-pitch`.
- **The pitch.** One cell per creature art pixel, so the grid reads as the pixels the
  creature is drawn in: `pitch = screen width × 0.465 / 64` (the pet is 62% of a 4:3
  screen high and square, so 46.5% of it wide, 1177). A slide is at most 330 px
  (`_layout`, 2092), so the screen is about 276 px and the pitch **about 2 CSS px**
  (less in compact). Set in `_layout`. Where that is under 3 device pixels
  (`devicePixelRatio` 1, an old tablet) it moirés: there the grid doubles its pitch
  (one cell per 2 × 2 art pixels). An adult with `scale.adult` won't line up exactly;
  that's fine at 8%.
- **Not on**: the status screen (it's a paper panel, not the LCD), the photo print
  (`_savePhoto` draws its own canvas, 4011), or the shelf/journal tiles.
- **Setting.** A per-browser row on the status screen, "screen effects here: on/off"
  (`hatch-lcd`, like `hatch-sounds`), covering the grid and ghosting. Default **on**
  (owner question Q1). Off also under `prefers-contrast: more`.
- **Checks**: card-check at 420 and 330 px on all six shells (the porthole and moon
  corners), with a bubble, the game and the status open: the grid is under all three
  and absent from the status. Screenshot contrast of the bubble text unchanged.
  **The existing checks run with `hatch-lcd` off** (seeded in card-check's setup), so
  their screenshots and pixel samples don't drift; only the new steps turn it on.

### 1b. Ghosting when the pet moves (M)

Real LCDs are slow: a moved pixel leaves a fading trace. Two pieces, both only on the
slide on show, both off under reduced motion and with the setting off.

1. **Frame ghost.** A second `<img class="ghost">` placed just **after** `.perch`
   and before `.pet` in the markup, so it paints under the pet. **It must not carry
   the `pet` class**: `q(".pet")` in `_buildSlide` would find it first, and it would
   pick up every `.pet` rule (`hop`, `greethop`, the `breezy` sway, `.dim .pet`,
   `look`, the transitions), plus `_headTop`/`_headTopAll` and card-check's `.pet`
   selectors. `.ghost` copies `.pet`'s geometry rule (1177) in its own selector, and
   the perch's MutationObserver (1825-1829) copies to it only the move classes
   (`PERCH_MOVES`) and `scale`, as it does for the perch. When `_tick` swaps a frame,
   the ghost takes the **old** frame and fades from 35% to 0 over about 180 ms.
2. **Move trail.** For a wander or a game move, the ghost's `translate` transition
   runs about 120 ms behind the pet's (`transition-delay`), at 30% opacity, so the
   pet leaves a short smear that catches up. Nothing new to time: the existing
   classes drive it.

- **Not during Catch.** A reflex game needs a clean pet; the ghost hides while
  `s.game?.kind === "catch"`.
- **Hats.** `_headTop` measures `.pet` only; the ghost has no hat. A costume ghost is
  not worth its code.
- **Paused** with the rest under `.away-slide` and `ha-card.offscreen` (978-979).
- **Checks**: card-check forces a wander and a frame swap and samples the ghost's
  opacity (above 0 just after, 0 by 300 ms); with reduced motion emulated, the ghost
  never shows; in Catch it stays hidden. The idle-life check (made deterministic in
  #68) must not see the ghost as a second pet.

### 1c. The backlight (M)

A real button on the **shell**, not in the toy row (that row's `nth-child` colours and
tight egg/pad widths rule it out, and a screen tap is taken). Where it sits per shell:

| Shell | Spot |
|---|---|
| egg (woodland) | a small round nub on the right edge of the body, level with the screen |
| tank (terrarium) | the lid's right grip (the lid already has three `span`s) |
| house (hearth) | a little lamp on the chimney (a real element over the chimney: `.roof::before` is a pseudo-element and can't be a button) |
| porthole (tidepool) | one of the brass rivets, slightly raised |
| pad (pond) | a dewdrop on the right rim |
| moon (nightsky) | a star on the crescent |

All are a `<button class="backlight" aria-label="Backlight">` with a 44 × 44 hit area
(visible part smaller), the shared focus ring, and a title "Light up the screen".

**What it does.** A tap lights the screen for 3 s: a `div.glow` over the scene (above
`.lcd`, below the bubble) in Indiglo blue-green (`#4fe3c1`), blended with
`mix-blend-mode: screen` at about 55%, a soft vignette from the centre, and the `.dim`
filter lifted to `brightness(.9)` while it's on, so the sleeping pet is seen, glowing.
Then it fades over 600 ms (no fade under reduced motion: it just goes off). A second
tap while lit restarts the 3 s.

- **Card only.** No server call, no `lights_out`, never wakes the pet, no line said.
  While asleep, the pet's frames don't change (it stays asleep under the glow).
- **Day.** It works any time, but the glow is barely visible over a bright scene
  (owner question Q2: night-only, or any time).
- **Sound.** A tiny click (`CHIRPS.click`, one 40 ms note) only through `_chirp`, so
  never at night or while asleep: in practice, never when it matters.
- **Checks**: each shell at 420 and 330 px, compact and full: the button is reachable,
  its 44 px target doesn't overlap a toy or the label, and doesn't spill into the
  16 px gap between slides (a tap there would land on the neighbour's "bring
  forward" click); a tap at night shows the glow,
  it's gone by 4 s, `switch.lights_out` untouched (no service call recorded); keyboard
  Enter works.

**Art.** The buttons are CSS on each shell. If the owner wants pixel art for them
instead, that's an ask for the art session (six tiny sprites).

## Part 2: the infrared link

### What "share a dashboard" means

**Two or more pets on one card**, which is what a card with no config shows
(`_findDevices`). Pets on **separate cards on the same view** could link later through
a window event like `SHARED_EVENT` (Q5); it's left out of v1, because two cards don't
know each other's slide or timing.

### 2a. The visit (M)

1. **When.** At most once a day per pair of pets, and only when the pet on show and a
   neighbour (the slide next to it) are both free: awake, not away, not an egg, no
   call, no game, status closed (`_free`, 2489, for both), and nothing queued (the
   first look's lines and `s.queue` empty). The rate is set in **time**, not ticks (the
   tick is 700 ms, 1608): a `LINK_AFTER_MS = [600000, 1500000]` timer, 10-25 minutes of
   the card being open with both free, drawn fresh at each page load, like
   `FLAIR_EVERY_MS`. So it's a surprise for someone who lingers, not a routine on
   opening. `oncePerDay("link-<a>-<b>")` (the pair sorted) is called **only when the
   timer has passed and both are free**, because calling it uses up the day. Owner
   question Q3: also a **manual** trigger (a long-press on the backlight button, or a
   "visit" row on the status screen).
2. **The beam (about 1.5 s).** On wide layouts where the neighbour peeks in, a dashed
   pixel beam crosses from the current device's top edge to the neighbour's (a CSS
   element over `.track`, `steps()` animation, in the screen's ink colour). Where the
   neighbour is off-screen (phones), the beam leaves the screen's edge on the
   neighbour's side instead. Both devices give the `call` chirp's softer cousin
   (`CHIRPS.link`, two short high notes) through `_chirp`.
3. **The visit screen (about 6 s).** The pet on show's screen shows a little
   "connecting..." band of dots for a second, then both pets side by side on the
   **host's** background: the host at 30% from the left, the guest at 70%, each at
   about 70% of its normal size, the guest mirrored to face the host. Each shows its
   **excited** frames (every species has them) and hops twice (`greethop`), in turn,
   which reads as a wave. Then a hearts burst (the existing `.burst`, or the effects
   pack's `sparkle` once wired), and the guest slides out.
4. **Lines.** One each, in their own voices, through the queue (`_queue`), e.g. the host
   "hi, Mochi!" and the guest "hi hi, Pip! ♪". Short, positive, with names. No line
   about missing or having been lonely.
5. **The guest's own slide** shows its pet looking toward the host (`_look`) with a
   tiny "♪" bubble for the length of the visit, so swiping over doesn't find it
   unaware. If the person swipes during the visit, the visit ends at once (no
   leftover sprites).

- **Guest art.** The guest's frames come from `_petFrames(sp, stage, "excited", ...)`
  (2427), which handles the drawn stage (`stage_fallback`, the last stage drawn), not
  a raw `<stage>_excited_<n>`; then `spriteSrc`, with the guest's own `scale`
  (duckling 1.2). Every one of the 29 species with a `species.json` lists `excited`
  in its moods (checked on main; the beetle has none and isn't in the roster).
  Costumes and hats stay off the guest.
- **Not** in the journal, not counted, no friendship level. Owner question Q4: a
  "first met <name>" memory in the journal would need the server (memories live in the
  save); v1 stays card-only.
- **Reduced motion**: no beam, no hops; the two pets just appear together, say their
  lines and go.
- **Checks**: card-check with two pets, forced trigger (a test hook like the others):
  both sprites on the host screen, both lines queued, gone by 9 s; a swipe mid-visit
  leaves nothing behind; not when either pet is asleep, calling or in a game; once a
  day per pair; at 420 and 330 px, and with three pets (the pair is the neighbour on
  the side the beam goes).

**Art.** v1 needs none: excited frames exist for every species, and the beam is CSS.
A proper **wave** pose for all 30 species (a 2-frame `wave` extra) would be lovely but
is 60 frames for the art session; owner question Q6. A shared pixel "beam" effect for
the effects pack is a small ask if the CSS beam looks too plain.

## Part 3: power-on

### 3a. The boot screen (M)

A real Tamagotchi starts when you pull the battery tab. The card can't beep on a
fresh load (no tap yet, so no audio), so the boot screen **waits for a tap**, and that
tap is what unlocks the sound.

1. **When.** The first time this **browser** shows the card (`hatch-booted` in
   localStorage), and again after a card update that bumps a `BOOT_VERSION` constant
   (only when the owner wants a new release to "power on"). Owner question Q7: once per
   browser (recommended), once a day, or every page load.
2. **What.** Every screen on the card shows the boot screen at once: the LCD grid on a
   plain pale-green field, a chunky pixel **HATCH** logo (Tiny5 at a large size, with a
   2 px hard shadow; no art needed) and a small blinking "▶ tap to start". The pet and
   its buttons are drawn behind it but hidden. With no storage at all (private mode),
   it shows once per page load at most.
3. **The tap.** Unlocks audio (`unlockAudio`), plays a **power-on beep**
   (`CHIRPS.boot`, a rising three-note square-wave beep) if this browser has sounds on
   and `_mayPlay` allows, then the logo "fills in" left to right in about 600 ms and
   the screen cuts to the pet. Under reduced motion: no fill, straight to the pet.
   The tap does nothing else (it doesn't open the status).
4. **It never waits forever.** A wall tablet nobody taps would hide the pet for good,
   so with no tap the boot finishes **on its own after about 5 s**, silently (the fill,
   then the pet). A tap inside those 5 s gets the beep.
5. **Order.** `_firstLook` and `_visit` run as they do now and in the same order
   (`_tick` 2470-2471: the first look tells the server what's queued before the
   visit). While the boot screen is up, only the **speaking** waits: `_greet`,
   `_sayQueued` and `_wishMention`. The first look's lines are already queued, so they
   play after the boot and nothing is missed.
6. **Sounds are off by default**, so most first boots are silent. Owner question Q8:
   should the boot screen offer "sounds on?" (two buttons, the tap choosing) so the
   beep has a chance on first use? Recommended **no**: it's a settings question at the
   worst moment; the beep comes for those who turned sounds on.

- **Checks**: fresh storage shows the boot screen on all slides, no beep scheduled
  before the tap (no oscillator started), the tap shows the pet and queues the first
  look; with no tap the pet shows by 6 s, silently; a second load shows no boot
  screen; with sounds on at 10:00 the boot chirp plays; at 22:00 it doesn't. **D4
  seeds `hatch-booted` in card-check's setup**, or every existing check would start on
  the boot screen; only the new steps clear it.

### 3b. The low-battery face after HA restarts (S server, S card)

**Detecting a restart.** The card can't tell a restart from a Wi-Fi blip on its own
(the websocket reconnects either way). The server knows: `async_load` measures the
downtime. So:

- **Server**: in `async_load`, the coordinator notes whether HA itself is starting:
  `restart = self.hass.state is not CoreState.running` (`CoreState` is already
  imported and used the same way in `async_start_home`, 487). A restart sets
  `self._powered_on = {"at": <load time ISO>, "away_minutes": <downtime, rounded>}`;
  an integration reload (HA already running) keeps none. `_house_view` adds it as
  `house.powered_on`. It goes out in the snapshot (on subscribe, and to open cards after
  a reload), shared screens included, and is never in a state attribute, so it leaves
  no trace in HA's history. Tests: a load with HA starting gives a `powered_on`; a load
  with HA running (a reload) gives none; `away_minutes` from a stored `last_updated`
  an hour back is about 60.
- **Why not a downtime threshold.** `last_updated` moves on the 5-minute tick, so a
  30-second restart can measure anywhere from 0 to 5 minutes, and so can a reload.
  HA's own state is the reliable signal. `away_minutes` rides along only in case a
  later line wants it (v1 says nothing about time away). Owner question Q9.
- **Card**: keeps the last `powered_on.at` it reacted to per pet
  (`hatch-power-<pet>`). A newer one, on a pet that's awake and on show, plays the gag
  once; a card that has never seen one just stores it (no gag on first install).

**The gag (about 4 s).** The screen flickers once (two 80 ms blanks; none under
reduced motion), a pixel **battery icon** with one bar blinks in the top-left corner,
and the pet shows its **sleepy** frames with one line, then perks up:

| Moment | Line (first mate approves) |
|---|---|
| battery blinking | "w-whoa... did someone pull my battery?" / "low batt... ♪ ... oh! we're back" |
| perking up | "all charged! hi! ♥" / "power's back! ♪" |

Then the battery shows full for a second and goes. No mention of time away, no
"I was scared", no "you left me": downtime is frozen, nothing happened to the pet.

- **Not** while asleep (it waits for the next awake look while the stored marker is
  still newer, at most 12 h; after that it's dropped), not during a call or a game,
  not on the boot screen (the boot comes first; a fresh browser never sees the gag).
- **Art.** The battery is a CSS pixel icon or a 3-state sprite (empty, one bar, full)
  in `ui/`; a tiny ask for the art session if the CSS version looks thin.
- **Checks**: a stubbed snapshot with a new `powered_on.at`: the battery shows, the line
  is queued, it's gone by 6 s, and a second snapshot with the same `at` does nothing;
  asleep defers it; a snapshot with no `powered_on` does nothing.

## The PRs

| PR | What | Size | After |
|---|---|---|---|
| D1 | LCD grid (1a) and the "screen effects here" row | S | — |
| D2 | Ghosting (1b) | M | D1 (shares the setting) |
| D3 | Backlight (1c), six shell spots | M | D1 (glow sits over the grid) |
| D4 | Power-on boot screen (3a) | M | — |
| D5 | `house.powered_on` (server) and the low-battery gag (card) | S + S | P3a-card merged (the card reads the channel) |
| D6 | Infrared link (2a) | M | — |

Each PR: `scripts/test` (D5's server part), `scripts/card-check` with its new steps at
420 and 330 px, the guide's section updated (`docs/guide.md`: "The device", or a new
"Little touches"), and the version left alone (no releases until the end of the work:
owner, 2026-10-28).

## New lines (for the first mate)

| Where | Lines |
|---|---|
| infrared link, host | "hi, {guest}!", "oh! {guest}! hello hello ♪" |
| infrared link, guest | "hi hi, {host}! ♪", "*waves* hi, {host}!" |
| infrared link, guest's own slide | "♪" |
| boot screen | "▶ tap to start" |
| low battery | as in 3b |
| settings row | "screen effects here: on / off" |
| backlight title | "Light up the screen" |

Persona variants (`PERSONA`, 538) can come later; v1 uses one set for all.

## Owner answers (2026-10-29)

The owner took every recommendation below ("all recommended", 2026-10-29). The
Recommendation column is now the decision.

| # | Question | Recommendation |
|---|---|---|
| Q1 | Grid and ghosting **on by default**, with a per-browser switch to turn them off? | Yes, on. They're faint. |
| Q2 | Backlight **any time**, or only at night and while the pet sleeps? | Any time; it just shows best at night. |
| Q3 | Infrared link: **surprise only**, or also a manual "visit" you can start? | Surprise, once a day per pair; manual later if wanted. |
| Q4 | Should a pet's first link with another be a **journal memory** ("met Mochi")? | Not in v1 (card-only, no counts). |
| Q5 | Link pets on **separate cards** on the same view too? | Later, if one card with all pets isn't how you use it. |
| Q6 | A drawn **wave** pose for every species (60 frames), or excited frames and hops? | Excited frames and hops now; the wave only if the hops look thin. |
| Q7 | Boot screen: once per **browser**, once a day, or every page load? | Once per browser (and on a big update you choose). |
| Q8 | Offer "sounds on?" on the boot screen? | No. |
| Q9 | Should an **integration reload** (not a full HA restart) also show the low-battery face? | No: HA restarts only. |
| Q10 | Backlight buttons drawn in CSS, or pixel art from the art session? | CSS first; art if they look plain. |
