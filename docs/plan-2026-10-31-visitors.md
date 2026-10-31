# Visitors v1, 2026-10-31 (card only, seeded by date, nothing saved)

**Owner decided 2026-10-31:** card-only v1. On some days a small creature from the pet's
world drops by at the edge of the scene, picked by date (the same on every screen that
day), and the pet greets it. Nothing is saved, the server doesn't change, and there's no
collection or basket yet (that is a later tier-2 plan, `plan-2026-10-28-daily-checkins.md`
item 1). The owner's frame: "reactions, visitors, playtime animations... that's where
the connections really shine."

Rules kept (HANDOFF and experience plan, "The owner's taste"): Animal Crossing flavour,
positive or quiet, no guilt, nothing to keep up, nothing missed by being away, and no
person named on a shared screen.

**Builds after R1 and R2** (`_actPose`, `STAGE_POSES`, the `acts.cheer` pose). Both are
on `fm-batch4` / s2549, not yet on main. Names in this plan win over line numbers.

## 1. What the player sees (storyboard, about 7 s)

| t | Beat |
|---|---|
| 0 | The visitor comes in from one side of the scene: walking along the ground line, or flying in at the height of the seasonal flyers. Two frames flap/step (`.sfly.flap`), using the `_seasonFly` machinery with a new `stop` option: it **stops at the edge**, at about 12% of the width from its side, instead of crossing. |
| 1.4 s | The pet notices: `look` toward that side (`_animate` + `_moving`), with no startle line. World visitors are friends, not ghosts. |
| 2.4 s | The greet: `_reactFrames(s, "greet")`, with `STAGE_POSES.greet = "cheer"` through `_actPose` (`acts.cheer`), else `excited` + `greethop`. A child uses its existing species pose path, as `_react` does. **One bubble line** (section 5), 3 s, through `_speak` with `catch: false`. |
| 5.4 s | The visitor stays a beat (frames still cycling), then leaves the way it came (or carries on across, for flyers). |
| ~7 s | Gone. `s.flairUntil` covers the whole visit, so nothing else starts meanwhile. |

The visitor is drawn about as big as the seasonal ghost (13–15% of the screen's width),
smaller than the pet, at the scene edge on the side away from the pet's current spot.

## 2. When (gating)

- **At most once a day per screen, per pet.** `oncePerDay("visit-" + device)`
  (localStorage, the same as the link visit and the countdown; once per page load with
  no storage). This is a browser flag, **not a save**: nothing goes to HA. The day's key
  is used up **only when the visit actually starts**, never when it is checked.
- **A visit day** comes up on about **4 days in 7** (seeded, section 3). No visit on the
  other days; nothing says so.
- **Its window:** a seeded 3-hour window inside the visitor's hours. Day visitors
  09:00–18:00 local time; night visitors 20:00–23:00 (when the scene is `night`/`dim`
  and the pet is still awake). If nobody looks during the window, there's no visit
  today and nothing is said about it later (no "you missed...").
- **Only on the slide on show**, after `s.lookedFirst`, with `this._linkFree(s)`
  true (`_free`, no queue, not an egg). On top of that it also needs: not `s.power`,
  not `this._link` running, not `s.calling`, not asleep (`_free`), not away (`away`
  is not in `IDLE_MOODS`), no game or scene (`_free`), the status closed (`_free`).
  Checked from `_seasonTick`'s caller (`_tick`, next to `_linkTick`), at most once
  every 20 s.
- **Not in its first 30 s** on screen (let the first-look lines go first), and never
  within 2 minutes of a link visit.
- **Seasons:** on a day when the season has a `visitor` (Halloween, Thanksgiving), the
  world visitor still comes (the seed decides), but `flairUntil` keeps them apart, and
  a seasonal visitor waits 2 minutes after a world one. *Recommendation, Q4.*
- **Calm (`calm()`):** the visitor appears **still** (frame 1 only, no walk or flap) at
  its stop spot for 5 s, then disappears. The pet changes to the greet frame (3a's rule:
  only the `_1` frame) and says the line. Under 3a, things may appear or change when
  the state changes, but nothing moves. *Recommendation, Q3* (seasonal visitors skip
  calm entirely today).

## 3. The seed

- One helper, `daySeed(salt)`, from `dailyPick`'s hash (`h * 31 + ch`, over
  `${salt}|${new Date().toDateString()}`). Three **separate salts**, so the choices
  aren't correlated: `visit-day|<device>` (`% 7 < 4`), `visit-who|<device>` (which
  visitor), `visit-at|<device>` (the window's start hour inside the visitor's hours).
- Keyed by the **pet's device id**, so every screen showing that pet agrees that day;
  two pets in the house get different visitors.
- **No weather in v1** (Q2): the pick is the seed alone, so every screen agrees.
- **Never rare enough to fear missing:** with 3 visitors and about 4 visit days a week,
  each visitor comes about once a week. A test checks that over 365 seeded days every
  visitor turns up at least once in every 21-day stretch.
- Edge: `toDateString()` is the **browser's** local date, so a screen in another time
  zone may see a different day's pick. That's acceptable for flavour; the same as
  `dailyPick` today.

## 4. The visitors (3 per world, 2 frames each)

**Rule:** no visitor is a creature on its world's roster (`worlds.json`). The old draft
list had 7 that are creatures now: banana slug, beetle, hermit crab, seal, duckling,
owl, firefly. All three here are new.

| World | Visitors (id: name, hours, entry) |
|---|---|
| Woodland | `chickadee`: chickadee (day, flies in) · `stellersjay`: Steller's jay (day, flies in) · `snail`: garden snail (day, crawls; the slow one) |
| Terrarium | `pillbug`: pill bug (day, walks) · `ladybird`: ladybird (day, flies in) · `moth`: moth (night, flies in) |
| Hearth | `robin`: robin (day, hops in) · `mouse`: house mouse (night, scurries) · `cricket`: hearth cricket (night, hops) |
| Tidepool | `gull`: gull (day, flies in) · `shorecrab`: shore crab (day, sidesteps) · `seastar`: sea star (day, creeps; stays longest) |
| Pond | `dragonfly`: dragonfly (day, darts) · `strider`: water strider (day, skates) · `heron`: heron (day, wades in at the far edge, drawn smaller) |
| Night Sky | `shootingstar`: shooting star (night, streaks over; no ground stop) · `nighthawk`: nighthawk (night, flies in) · `raccoon`: raccoon (night, ambles) |

Data: a `VISITORS` table in the card, next to `SEASONS`
(`{world: [{id, name, hours: "day"|"night", walk, ms, lines}]}`), not in `worlds.json`,
because v1 doesn't touch the server. The tier-2 plan moves it into `worlds.json` once the
server needs it.

## 5. Copy (PROPOSED; the owner picks)

One line per visit, picked from the visitor's two and the world's shared lines. Each
names only the visitor, never a person.

| Visitor | Proposed lines |
|---|---|
| any (shared) | "oh! a visitor ♪" · "hi there, friend!" · "you came to see me?" |
| chickadee | "chick-a-dee-dee! ♪" · "hello, little chickadee!" |
| Steller's jay | "ooh, so blue!" · "hi, jay! ♪" |
| garden snail | "take your time, snail~" · "hello, slow friend" |
| pill bug | "hi, pill bug! don't roll away~" · "a tiny armadillo!" |
| ladybird | "a ladybird! lucky ♪" · "count your spots for me?" |
| moth | "hi, moth! the light's over there~" · "fuzzy friend ♪" |
| robin | "hello, robin! ♪" · "a robin at the window!" |
| house mouse | "shh... hi, mouse ♪" · "a crumb for you?" |
| hearth cricket | "cri-cri! ♪" · "sing me a song, cricket" |
| gull | "hi, gull! no snacks here~" · "hello from the sea ♪" |
| shore crab | "sideways hello! ♪" · "hi, little crab!" |
| sea star | "a star in the water!" · "hello, sea star~" |
| dragonfly | "zoom! hi, dragonfly ♪" · "so shiny!" |
| water strider | "walking on water?!" · "hi, strider ♪" |
| heron | "a heron! so tall..." · "shh, it's fishing~" |
| shooting star | "a shooting star! make a wish ✦" · "ooh! did you see that?" |
| nighthawk | "hi, nighthawk ♪" · "night flyer friend!" |
| raccoon | "hello, masked friend!" · "a raccoon! say hi ♪" |

Baby stage: the line goes through `_lines` like other pet lines (baby talk), so a baby
says its babble version. Under 2a's classes the visit line is **flavour**.

## 6. Interactions

- **2a class: flavour.** The visit isn't a server moment and has no queue entry. It
  starts only when the queue is empty (`_linkFree`). If a kept or care line arrives
  mid-visit, the greet beat is **skipped** (the timer checks
  `_mayInterrupt(s, "flavour")` / `sayUntil` before `_speak`). The visitor still
  finishes its walk silently. This fixes the seasonal visitor's unconditional
  `_speak` at 3400 ms, which v1 doesn't copy.
- **R2 poses:** greet = `acts.cheer` via `_actPose` (load fallback: `excited` +
  `greethop`). No new act in v1. A later `acts.wave` could replace it, and that's the
  art plan's call.
- **Pat during a visit:** wiggle only, no line, while `s.flairUntil > now`. This is a
  one-line change to `_patMayTalk`, and it also applies during seasonal visitors (today
  a pat there speaks and is then overwritten by the greet). Taps on the visitor
  itself: none (`pointer-events: none`, as `.sfly`). Q5.
- **Shared screen:** identical on every screen; it names nobody, so no rule changes.
- **The house never notices:** no `callService`, no `callWS`, no event, no bond points,
  no happiness.

## 7. Art batch

- **Count:** 6 worlds × 3 visitors × 2 frames = **36 PNGs**.
- **Size:** a 64 × 64 canvas at 2 frame px per art px (the 128 grid's pixel, so
  visitors match the pets): **32 × 32 art px**, the creature sitting on the canvas's
  bottom edge (walkers) or centred (flyers). The heron gets a 64 × 96 canvas. Shown at
  13–15% of the screen width, like `.sghost`/`.sturkey` (68 px canvases at 4 px).
- **Palette:** the world's own (the backdrop's and its creatures' tones), the same dark
  outline as the 128 sprites; stored as exact palettes (`scripts/art/palette.py`);
  transparent background; facing right (the card mirrors for `rtl`).
- **Naming:** `frontend/ui/visitor_<world>_<id>_<1|2>.png`
  (e.g. `visitor_woodland_chickadee_1.png`).
- **Provenance:** stand-ins drawn in code first (`art/visitors/make_visitors.py`, as
  `art/seasonal/make_halloween.py`), so v1 can ship and be felt on the phone. The real
  batch is one request to the owner's **Hatch API Art** session (it picks Luna or Sol),
  sent through the art coordinator, keeping the stand-ins' names, canvases and
  anchoring. Prompts and runs stay in gitignored `private-content/`. Within the Codex
  image budget, 36 frames is one batch.

## 8. Tests

- **Bench:** a `visitor` field `{world, id, frame: 1|2, beat: "arrive"|"greet"|"leave"}`
  that pins one visit (no timers), and a `--preset visitors` contact sheet (18
  visitors × greet at 330 px, plus a night and a calm shot).
- **Card-check section `visitors`:**
  - the seed: 365 stubbed dates give about 4/7 visit days, every visitor within any
    21 days, and two card instances agree on the pick for one date and device;
  - a visit plays on a free, shown slide: the visitor `img` appears, the pet's `src`
    goes to the cheer (or `excited`) frame, and one line is said;
  - no visit when asleep, away, egg, in a game, in a scene, linking, calling, power,
    status open, or off-slide; the day's key isn't used up by a skipped check;
  - a kept line arriving mid-visit keeps its bubble (the greet is skipped);
  - a pat mid-visit wiggles with no line;
  - under `emulateMedia({reducedMotion: "reduce"})`: the visitor's `left` is the same
    over the visit, and only `_1` frames show;
  - every `VISITORS` frame loads (`naturalWidth > 0`); no `callService`/`callWS`.

## 9. Size and tier

**M**, tier 1, card only (the card, card-check, the bench and the stand-in script).
The art batch is separate and runs in parallel (**M**, art-bound). Ship after R1/R2.

## 10. Open owner questions (each with a recommendation)

1. **The roster:** are these 18 right? Your examples (crab, owl) are now creatures, so
   the crab became a shore crab, and the owl became a nighthawk. *Rec: as listed.*
2. **Weather visitors** (a snail or slug only after rain)? *Rec: not in v1; plain seed
   keeps every screen agreeing. Add with the tier-2 plan.*
3. **Under reduced motion:** a still visitor plus the line, or no visitor? *Rec: still
   visitor plus the line (3a's "a still picture, not a frozen one").*
4. **Season days:** do world visitors still come at Halloween/Thanksgiving? *Rec: yes,
   kept apart by 2 minutes; the season's visitor is the one that repeats.*
5. **Pat during any visitor** (world or seasonal) wiggles silently? *Rec: yes.*
6. **How often:** about 4 days in 7? *Rec: yes; daily would feel like a schedule,
   rarer would feel like missing out.*
7. **The copy** in section 5: pick, cut or rewrite. *Rec: ship the shared three plus
   one per visitor at first.*
