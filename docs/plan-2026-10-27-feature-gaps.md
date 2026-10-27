# Feature-gap plan, 2026-10-27 (written after 0.21.0; releases renumbered after 0.22.0)

**Status (2026-10-27):** everything chosen is built. A and B are released (B in
0.23.0); C1, the C2 prototype and D, with Sol's art and a polish pass, are in draft
PR #7 and out as the beta 0.26.0b3. What's left is the owner's: try the beta, decide
whether Catch stays (C2 full), and merge PR #7 after the 2026-11-03 tuning review.
The owner chose these items from an outside feature-gap audit, which compared
Hatch at Home with Tamagotchi and Giga Pets. Three adversarial reviews followed: of
the first draft, of how fun the games are, and of the whole plan against the code.
The owner accepted their recommendations; this version includes them.

## What the audit said and what came of it

| Audit suggestion | Outcome |
| --- | --- |
| Daily diary in the journal | Not doing (owner's call). |
| Pet reaches back into the house on calls | **Planned (A):** a blueprint, no integration code. |
| Care-shaped evolution / guide the next egg | **Planned (B) and (D):** choose the next egg; and, instead of an evolution, visible flair for every trait, with a cap of 4 traits, per-pet temperament and seven new traits. |
| More minigames | **Planned (C):** Higher or Lower (the 1997 second-generation Tamagotchi's game), then Catch (the Giga Pets game), as a prototype first. Copy me was cut: too easy as drafted, and it needed its own buttons and service shape. |
| Trained tricks | Not now. Signature poses are drawn for the child only, so other stages would need stand-ins or new art. |
| Pets on the shelf noticing each other | Not now. |
| Birthdays / calendar celebrations | Not now. A generation lasts 3–5 weeks (adult at 14 days, egg a week later), so a yearly birthday never arrives. A calendar "big day" was offered and not chosen. |
| Owned items, decorations, shop | Deferred. Needs art and an economy, and could turn gentle care into a grind. |
| Learning household rhythms | Deferred. Lots of complexity for flavour only, and close to the surveillance feel the audit itself warns about. |
| Death or old age | No. "It never dies" is a design rule. |
| Deer, rain scenes, shared props | Shipped in 0.22.0. |
| Assist on a real agent, notification buttons on a real phone | Already open (HANDOFF items 1 and 5). They need the owner. |
| BirdNET visits | Deferred by the owner. |

## A. Call response blueprint (S–M, no release)

**Built** (2026-10-27): `blueprints/automation/virtual_pet/call_response.yaml`, the
README section "Let the house answer a call", and `tests/test_blueprint.py` (10
tests). The default pulse is a flash. Test note: `async_block_till_done` waits for
the automation's run to end, which includes the cooldown's delay, so the tests let
the loop run a few steps instead (`settle()`). Not yet tried on a real HA with real
lamps.

An optional HA automation blueprint: when the pet calls, briefly pulse a lamp of the
owner's choosing and/or play a short sound on a speaker. Every piece is opt-in and
set up by the owner. The integration doesn't change.

- File: `blueprints/automation/virtual_pet/call_response.yaml`.
- **Not shipped through HACS.** HACS installs only `custom_components/`, so the
  blueprint is imported from its GitHub URL. The README gets a section with a
  "My Home Assistant" import button. No version bump: it goes live when it's
  merged. The README change reaches HACS users with the next release.
- **The URL names `main`.** The repo's default branch was renamed to `main` on
  2026-10-27 so the URL stays valid. The README button and `source_url` point
  at `…/blob/main/blueprints/automation/virtual_pet/call_response.yaml`.
- Trigger: the `virtual_pet_call_started` event, filtered by `pet_id` (a
  `config_entry` selector limited to `virtual_pet`; `pet_id` is the config
  entry ID).
- **Events from fast-forward carry `simulated: true` and are skipped**, so a
  debug run doesn't flash the lamps. This needs a template condition, because
  an event-data filter can't match "key absent".
- Inputs: the pet; the lights (optional), and the colour or flash; the media
  player and sound (optional); a cooldown in minutes (default 30); **quiet hours
  for the sound** (on by default, 22:00–07:00; the pet can be awake and calling
  past bedtime).
- **Lights: change the colour or use `light.turn_on` with `flash: short`, never
  the brightness.**
  - Past bedtime the pet treats a bright room light as "too bright"
    (`home.py`), and the pet can be awake and calling then. A brighter pulse
    could feed back into what it senses.
  - Only lights that are already on are touched, so a dark room never lights up
    at night.
  - A colour pulse is restored through a `scene.create` snapshot
    (`snapshot_entities`), not by rebuilding the colour in YAML, which breaks
    between colour and colour-temperature modes. `flash` needs no restore.
- No "only while someone's home" input: an away pet is frozen and never calls
  (`model.advance`).
- **The cooldown** uses `mode: single` with `max_exceeded: silent` and a delay at
  the end. Repeated calls are dropped instead of queued, and nothing is logged
  for each dropped call.
- Fake calls appear on the bus as real ones (`reason: happiness`). That's intended:
  the blueprint must not give them away.
- **Tests (budget for them; not a quick one):**
  - copy the blueprint into a temporary `config_dir`, since the testing config
    is shared (HANDOFF "Tests");
  - set up stand-in `light` and `media_player` entities and services;
  - fire the event, and assert the service calls;
  - check that the cooldown holds, that simulated events are ignored, that lights
    that are off stay off, and that quiet hours mute the sound.

## B. Choose the next egg (M)

**Built** (2026-10-27): `select.py` (`select.<pet>_next_egg`, config category),
`egg_choice` in the model, the coordinator's `egg_roster`, `next_egg` on the life
stage sensor, a "next egg" / "hatching" row on the status screen, 8 tests and a
`card-check` step. Options are creature names; the state keeps the species ID.

`design-worlds.md` already lists this as a later option. A **select entity**,
`select.<pet>_next_egg`, with "Surprise me" (the default) plus **every ready
species in the egg's world**. It's stored on the state and used when the egg
hatches (`model._hatch`, which currently picks at random and prefers unraised
species). After hatching it resets to "Surprise me".

- **A new platform.** The integration has no select platform yet (`PLATFORMS` in
  `__init__.py`). This adds `select.py`, its strings, icon and translations, and
  `Platform.SELECT`.
- Any ready species, not only those already raised. A "raised only" rule would
  make the choice useless until the third generation (6–10 weeks in), because
  the hatch already prefers unraised species. Any species also lets the owner
  pick D's pilot creature. "Surprise me" stays the default.
- It can be set at any time. It applies to the next hatch, so it can be set
  before laying the egg.
- **The egg's world, not always the current one.** A world change through
  reconfigure on a hatched pet waits in `CONF_NEXT_WORLD` until the egg is laid,
  then the entry reloads (`coordinator.py`). While such a change is pending, the
  select offers the **next** world's roster. Otherwise a choice made before
  laying would be dropped silently at the reload.
- The state gets a new field, `egg_choice: str | None`, carried over by
  `lay_egg`. It's dropped (back to surprise) if that species isn't on the egg's
  roster when it hatches.
- The card: the egg screen shows the choice ("a kitten is on the way" versus
  "who could it be?"). The choice is changed from the entity (HA's more-info
  dialog, or any dashboard). The card editor can't do it: it edits the card's
  own YAML, which isn't per pet.
- Tests:
  - the choice is honoured;
  - "surprise" keeps today's behaviour;
  - a choice from another world is ignored;
  - the choice survives a restart;
  - with a pending world change, the options are the next world's and a choice
    from it is honoured after the reload;
  - an older stored state without `egg_choice` loads.

## C. More minigames (M each)

The pet has the first-generation Tamagotchi's left/right game. More come in
turn, after the 2026-11-03 tuning review.

**The fun test.** No game is played for its reward (the rule below keeps the
games about level). A game gets played only if it's fun on its own. The
reviews found:
- **Higher or Lower is partly solved.** On 1–3 and 7–9 the right guess is plain.
  On 4, 5 and 6 (a third of rounds) it's close to a coin flip. A good player
  wins about 92% of games. Keep it for nostalgia and because it's cheap, but
  don't count on it to carry the fun.
- **Catch's original wasn't hard either:** Giga Pets players called it "almost
  impossible to lose". Its appeal is watching your own creature pounce, so it
  needs decoys, speed-up and its own motion to stay fun, and it's tried out as a
  prototype before any server work.
- Several thin games are worth less than one good one. **Each game must earn the
  next one**, judged by the play counts below and the owner's word.

Order: C1, then the C2 prototype, then the full C2 if it's kept.

### Shared changes (all made in C1, so the service changes shape once)

- **The service, designed once for every game.** `virtual_pet.play_game` gets:
  - `game`: `left_right` (the default), `higher_lower` or `catch`;
  - `guess`: optional. Without a guess, the call starts a game and returns its
    opening (Higher or Lower's first number, Catch's rounds). With a guess, it
    plays a round. For `left_right`, the first guess still starts the game, as
    today, so existing automations keep working;
  - `caught`: Catch's finish call (C2), reserved now.
  - Each game checks the guesses it accepts (`left`/`right`,
    `lower`/`higher`), replacing today's schema check against `SIDES` alone.
- **Game state.** `Game` gains `kind`, plus each game's own fields:
  - `number` (Higher or Lower's current number);
  - `rounds_plan` (Catch's rounds as handed out: side and decoy);
  - left/right needs nothing new.
  `from_dict` drops unknown keys and the 3-minute idle drop clears any game in
  progress, so a downgrade loses only an unfinished game. Test loading a
  stored game from before the change.
- **Play counts for "each game must earn the next".** Today nothing measures it:
  `game_finished` isn't one of the kept moments, the care log holds only 20
  entries shared by every action, and diagnostics show only the state. The state
  gains `games: {kind: {played, won}}`, persisted for the pet's life, shown in
  diagnostics and on the debug sensor, and carried into the journal record when
  an egg is laid. The tuning review reads it from there.
- `virtual_pet_game_finished` gains `game`. The same `GAME_IDLE_MINUTES` drop and
  refusals apply to every game.
- **Rewards: the games stay about level on average.** On the card, "play" *is*
  the left/right game: a win gives 25 and a loss 10, about 17.5 on average.
  The plain-play button (20) exists only as an entity and through Assist. A
  skill game paying 25 for a win would leave left/right pointless. So a win in
  Higher or Lower or Catch gives `PLAY_HAPPINESS` (20), and a loss gives
  `GAME_LOSE_HAPPINESS` (10). At a 90% win rate that's about 19 on average.
  Left/right keeps its 25 as the reward for luck. Happiness is capped, so the
  difference is small in practice. Energy, hunger and weight are the same as the
  existing game.
- **Card: the play button opens a picker** with one button per game. Plain play
  isn't added: it stays an entity and an Assist action, as today. The picker
  remembers the last game played. With only one game available, the button
  starts it directly, as today.
- A win shows the species' `reactions.won` pose. Otter and squirrel have none,
  and poses exist only for the child stage, so the fallback is the existing
  `hop`.

### C1. Higher or Lower (first)

**Built** (2026-10-27), release held until after the 2026-11-03 tuning review (then
0.26.0 or later; the other session released 0.23.1, 0.24.0 and 0.25.0 meanwhile). Everything under
"Shared changes" is in except `caught` (Catch's finish field), which comes with C2:
adding an optional field later doesn't break callers. The number sits at 30% from the
top of the screen, clear of the speech bubble. Checked with `scripts/card-check`
(25/25 at 420 px), 232 tests.

The game from the 1997 second-generation Tamagotchi: the pet shows a number from
1 to 9, and the player guesses whether the next number will be higher or lower.
Five rounds; three right wins, the same as the existing game.

- The start call (`game: higher_lower`, no guess) returns the first number.
- Each guess (`lower` or `higher`) returns whether it was right and the next
  number.
- The next number is never the same as the current one, so there are no ties.
- Left = lower, right = higher.
- Card: the number is drawn in Tiny5 on the pet's screen, the pet "flips" it
  with the existing `perk`, and the score uses the same line as the left/right
  game.
- Ships with all the shared changes above.
- Tests:
  - no ties;
  - the score and the win line;
  - the idle drop and the rewards;
  - the play counts;
  - left/right still starts on its first guess;
  - a stored game from before the change loads;
  - one `card-check` step that plays a game through.

### C2. Catch (the Giga Pets game; prototype first)

**Prototype built** (2026-10-27): card only, offered in the picker when the card's
YAML has `experimental_catch: true`. Five rounds; the species' `play` prop rolls
in (a cricket hops) and a tap on its side in the window catches it; a stand-in
pixel bee is the decoy from round 2; the window narrows 1.2 s → 0.6 s and the
trip 1.9 s → 1.0 s; reduced motion slows the trip ×1.6 and doubles the window; a
local best score. No reward and nothing sent to the server. `card-check` plays it
from inside the page (one tap too soon on purpose: 4/5). The owner tries it next.

From the 1997 Tiger Giga Pets ([Compu Kitty
manual](https://www.hasbro.com/common/instruct/kitty-in.pdf): "press the LEFT or
RIGHT key to make your pet react … at the correct time"). Something drifts in
from one side, and you tap that side while it's in reach, so the pet pounces.
It's the reflex game of the set: left/right is luck, and Higher or Lower is
odds.

**How it plays:** five rounds, catch three to win.
- Each round, the species' `play` prop drifts in from the left or right.
  - Every species has one, but six borrow the bird's ball (axolotl, bat,
    bunny, luna moth, tarantula, tree frog).
  - The others have their own: the gecko's cricket, the squirrel's pine cone,
    the kitten's, the otter's and the octopus's toys.
- Tap that side while the prop is in the catch zone, and the pet turns toward
  it (the sprite mirrored in CSS) and pounces (the existing `hop`). A catch
  shows the `won` pose if there is one (see the shared changes), which is the
  Giga Pets "trick".
- Tap too early, too late or on the wrong side, and it gets away.

**What keeps it fun:**
- **Decoys.** Now and then something drifts in that the pet mustn't catch (a
  bee, a wasp); tapping it loses the round. That turns "tap when it arrives"
  into "tap or don't?". Biggest win for the least work. The prototype uses a
  recoloured existing prop; one shared `decoy` prop from Sol replaces it if
  Catch is kept.
- **Speed-up within a game.** Round 1 is slow and forgiving; round 5 is quick.
  Every game builds to a tense last round.
- **Motion by prop, not by species.** The ball rolls, the cricket hops, a moth
  would zigzag. The motion belongs to the prop sprite (a `motion` entry next to
  the prop in `species.json`, defaulting to roll), so a borrowed ball rolls for
  every species that borrows it. Today that means most species roll; a creature
  gets its own motion by getting its own prop.
- **Best score.** "best catch: 5/5" on the status screen, kept per pet.
- No stage-based difficulty: more rules for little gain.

**Fairness and access:**
- The catch window starts at about 1.2 s in round 1 (Giga Pets: about 1 s)
  and narrows to about 0.6 s by round 5. Prototype numbers; tune by playing.
- With `prefers-reduced-motion`, props move more slowly and every window is
  doubled.
- It's the only planned game that needs quick hands, and the others stay
  available, so play itself is never gated behind reflexes.

**Timing on the real card.**
- The card ticks on a 700 ms `setInterval` and re-renders on every `hass`
  update. The catch window can't hang off either.
- The game runs on `requestAnimationFrame` and `performance.now()`, in its own
  overlay, which a state update doesn't redraw while a game is running.
- Try the prototype on the wall panel early; it's the slowest device.

**Who judges the taps: the card.** A round trip to the server can take
longer than the catch window, so the server can't time the taps.
- The start call (`game: catch`, no guess) returns all five rounds: the side,
  and whether it's a decoy. The card runs the rounds locally and times the taps
  in the browser, where network lag can't matter.
- One finish call reports the catches (`caught: n`). The server checks that the
  game exists and hasn't timed out, and that `n` is between 0 and the rounds
  that weren't decoys. It then applies the reward, the play counts and the
  best score.
- The card is trusted, and nothing here needs guarding: the pet can already be
  played with at any time, and happiness is capped.
- Assist can't play it; it doesn't offer any game today.

**Prototype first (card only).**
- The card runs Catch entirely locally, behind a hidden card option
  (`experimental_catch: true` in the card's YAML), reward-free, with no server
  changes.
- It goes out in a normal release, with the option off by default and
  undocumented.
- The owner plays it on the phone and the wall dashboard for a few days.
- The prototype records nothing on the server, so **the owner's word decides**.
- **Keep it** if they find themselves coming back to it: build the server side
  above, ask Sol for the decoy prop, and ship it in the picker.
- **Drop it** otherwise, with only the card code to remove.

Tests (full version):
- the finish call's checks;
- the idle drop, the rewards and the play counts;
- the best score survives a restart.
- `card-check` drives one game using Playwright's `page.clock` to control time,
  with no test hook in the card. The clock is installed only after the HA
  frontend's own reload, about 10–15 s after the first page load (see HANDOFF),
  so HA's timers aren't frozen while it boots.

## D. Trait flair, a trait cap and seven new traits (L, art-bound)

**Replaces the one-species alternate adult.** That pilot changed the pet once, at
day 14, for one species. The owner preferred visible flair for every trait the pet
picks up: it grows with the pet, works for every species and stage, and shows the
house in the pet. A mockup (stand-in pixel art on the real card: a rain cloud over
the head, embers and a glow at the feet, rising notes, a butterfly) was approved on
2026-10-27.

### Flair

- **Around the pet, never on it.** Something drawn on the body (a scarf, drops on
  feathers) would have to fit 12 species × 4 stages × 10 moods × 2 frames. Flair
  sits in the scene, placed from two anchors:
  - **feet:** y=224 in every 256 px frame (already true of all sprites);
  - **head:** a hand-set point per species and stage, `"head": {"baby": [x, y], …}`
    in `species.json` (48 points, measured once with a helper in `scripts/art/`).
    Reading the head from the image's alpha is the fallback, but it's only rough:
    in the mockup the kitten's tail rose as high as its ears and pulled the guess
    sideways, and the squirrel's tail is higher than its head.
- **Three places**, one flair each at a time: **head** (just above it), **air**
  (around it), **ground** (at its feet). Each trait has a place (table below).
- **Layering.** In a flair moment every trait the pet has shows at once, one per
  place, so its combination reads as one picture (a cloud above, butterflies
  around, embers below). Traits sharing a place take turns between moments.
- **Rhythm.** About once a minute (with jitter), for about 4 s. A deeper trait
  (★★, ★★★) shows a little more (more particles, a brighter glow). Never during a
  game, sleep, away, the status screen or a reaction pose. With
  `prefers-reduced-motion`, a still frame fades in and out instead.
- **Art.** One small pixel sprite (or a 2-frame strip) per trait from Sol, shared
  by every species: 16 in all. Placement and motion are CSS in the card, like the
  rain, breeze and lightning.

### The cap and temperament

- **A pet keeps at most 4 traits** for life; an inherited trait counts toward the
  4. Once full it learns no new trait (trait progress stops counting new ones);
  levels still deepen as today (relearning an inherited trait).
- **Temperament, so pets in one house differ.** With a cap and one fixed set of
  thresholds, every pet in the same house would learn the same four fastest
  traits. So at hatching each pet rolls a sensitivity per trait (a factor of about
  0.6–1.6 on its threshold), stored as `temperament` and kept for life. The
  inherited trait and which experiences come first then shape who it becomes.
- Saved pets that already have more than 4 traits keep them (nothing is taken
  away); they just learn no more.

### Traits and their places

| Trait | Learned from (awake, at ★, before temperament) | Place | Flair |
| --- | --- | --- | --- |
| storm watcher | 15 h of rain | head | a little rain cloud, dripping |
| thunder heart (new) | 2 h of thunderstorms | head | a tiny lightning flicker |
| early bird (new) | up in the hour after wake time on 7 mornings | head | a small sunrise glow |
| moon child | 3 h of full moon | head | a crescent and a few twinkles |
| music lover | 12 h of music | air | notes floating up |
| social butterfly | about 15 arrivals home | air | a butterfly looping, landing by it |
| snow child (new) | 6 h of snow | air | drifting snowflakes |
| breeze rider (new) | 10 h of wind | air | a swirl of leaves |
| night owl | 10 h awake in sleep hours | air | a few fireflies |
| sun lover | 20 h of sun | air | sun glints |
| fireside | 10 h of fire | ground | embers rising, a warm glow |
| fog wanderer (new) | 8 h of fog | ground | a low curl of mist |
| helper (new) | 10 chore treats | ground | a sparkle and a tiny broom |
| player (new) | 15 games played | ground | a little ball bouncing |
| homebody | 75% of 48+ h with company | ground | a small cushion |
| couch potato | 12 h of TV | ground | a few popcorn bits |

- The new weather traits use flags the house already senses (`snowy`, `windy`,
  `foggy`, `storm`); early bird counts mornings from the existing good-morning
  logic; helper and player count chore treats and finished games (C1's `games`).
- New traits add a small happiness bonus while their flag is up, like the existing
  flag traits (`TRAIT_HAPPINESS`); helper and player give a little more for a
  chore treat or a won game. Numbers go to the owner with the tuning review.
- The mockup's notes (cream on a dark wall) were the weakest; Sol's brief asks for
  outlines and colours that read on both day and night scenes of every world.

**Model built** (2026-10-27): the 7 traits, the cap (`TRAIT_CAP`), temperament
(`TEMPERAMENT_RANGE`, rolled in `_hatch`), early bird counted by
`model.morning_stir` from the good_morning moment, helper and player counted when
a chore treat is handed over and a game finishes. Pets from before keep every
trait they have and learn as before (no temperament).

**Card built** (2026-10-27) with Sol's art, which arrived the same day (16
sprites, 25 files in `ui/`; no stand-ins were needed). Head points for all 13
creatures × 4 stages in `species.json`. Checked on real pets in every world (bird,
kitten, otter, tree frog, luna moth, gecko; day and night) at 420 and 330 px, and
with reduced motion; `card-check` forces a moment and checks the cloud stands on
the head point and the embers by the feet line. Two fixes found in the browser:
the card's `.screen img { position: absolute }` left flair pieces with no height
(so they hung over the face), and the butterfly's loop crossed the head place and
covered the cloud; it now goes round the pet's side.

### Build order

1. **Model:** the 7 traits, the cap, temperament (with a save from before it),
   tests. The card shows nothing new yet.
2. **Head points:** the measuring helper and the 48 points in `species.json`, with
   a test that every ready species has them.
3. **Card:** the flair layer with stand-in art (the mockup's), checked in the
   browser on every world, day and night, at 420 and 330 px; `card-check` forces a
   flair moment and checks each place is drawn.
4. **Art:** Sol's 16 sprites replace the stand-ins (probe first: 4 of them on two
   worlds, day and night).

Release: the model and the card can ship together with stand-ins as soon as they
look good, or wait for Sol's art (the owner's call at the time).

## Order and releases

1. **A** (blueprint): built; lands with the plan's PR, no release.
2. **B** (next egg): 0.23.0.
3. **D (trait flair):** built, in PR #7: the model (cap, temperament, 7 new
   traits) and the card's flair layer with Sol's sprites.
4. **C1** (Higher or Lower, with every shared game change): built, in a PR held
   until after the 2026-11-03 tuning review; then the next free version (0.26.0 as
   of now).
5. **C2 prototype** (Catch, card only, hidden option): built, in PR #7 with C1;
   the owner plays it for a few days (betas 0.26.0b1 to b3).
6. **C2 full** (server side, decoy prop, in the picker): the release after, only if
   the owner keeps it.
7. **D's art:** in (Sol's flair sprites, the lit night-owl frame, the decoy bee).

Each release: `scripts/test`, `scripts/card-check` where the card changes,
screenshots to the owner, and then the release workflow as in the HANDOFF.
