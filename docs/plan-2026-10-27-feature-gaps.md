# Feature-gap plan, 2026-10-27 (written after 0.21.0; releases renumbered after 0.22.0)

**Status:** planned, nothing started. The owner chose these items from an outside
feature-gap audit, which compared Hatch at Home with Tamagotchi and Giga Pets.
Three adversarial reviews followed: of the first draft, of how fun the games
are, and of the whole plan against the code. The owner accepted their
recommendations; this version includes them. The only decision still open is
D's species and trait.

## What the audit said and what came of it

| Audit suggestion | Outcome |
| --- | --- |
| Daily diary in the journal | Not doing (owner's call). |
| Pet reaches back into the house on calls | **Planned (A):** a blueprint, no integration code. |
| Care-shaped evolution / guide the next egg | **Planned (B) and (D):** choose the next egg; a one-species alternate adult, shaped by the house (a trait) rather than by care quality. |
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

## D. An alternate adult form: one-species pilot (M, art-bound)

**Shaped by the house, not by care quality.** The first draft tied the alternate
look to upbringing. Scrappy needs about 9 or more missed calls before adulthood,
so a caring owner would never see that look, and getting it would mean
neglecting the pet. Tying it to devoted instead turns the plain adult into the
"did worse" look. Traits come from the house (the sun, the fire, music,
company…), so neither form is a grade.

- **One alternate look for one species, for one trait.** At adulthood, a pet
  that has that trait (learned or inherited) takes the alternate look. It's
  decided once, at the moment the pet becomes an adult, and stored
  (`adult_form` on the state), so a trait learned later doesn't flip it.
  Because traits pass down the line, a family can keep its look across
  generations.
- **Pets that are already adults when it ships keep the plain look.** Unlike
  `upbringing`, which `from_dict` fills in for stored adults, `adult_form` is
  filled in as None, so nobody's adult changes look at an update. A world
  change doesn't touch it: it applies to the next egg only.
- **The species comes from a world the owner actually runs** (which worlds are in
  the private notes). Otherwise the pilot is never seen. B lets the owner pick
  the creature for the next egg.
- **The trait should be one the house reliably teaches.** Check the owner's
  current pets' traits through the debug sensor or diagnostics before choosing.
- **Keep the house out of the repo.** The species and trait together hint at the
  owner's world and house (a fireplace, say). Commit messages, docs and the art
  brief describe the feature in general terms ("an alternate adult for one
  species, chosen by a trait"), never as "the owner's house has…". The
  `species.json` entry itself is unavoidable and reads as an ordinary design
  choice. The reason for the pick lives in the private notes.
- `species.json`: an optional `adult_forms` map, trait → sprite prefix, e.g.
  `{"<trait>": "adult_<name>"}`. A pet without a mapped trait uses the plain
  adult. The sprites README documents it.
- The card reads the form from the life-stage sensor's attributes (a new
  `adult_form` next to `upbringing`). The journal records each generation's
  form, and the "all grown up" line can name it.
- **Art request to Sol** (a full adult sheet, the same size as the plain adult:
  10 moods × 2 frames). Probe first, as for new creatures. It's sent only once
  the species and trait are chosen, since both shape the brief.
- Tests:
  - `tests/test_species.py` checks that every mapped prefix has a full set of
    sprites;
  - the form is decided once at adulthood and survives a restart;
  - a stored adult from before the change loads with no form;
  - Playwright screenshots of both forms.

Decision (to settle when D starts): which species and trait. The rule is a
species from a world the owner runs and a trait the house teaches; a visual fit
helps.

## Order and releases

1. **A** (blueprint): built; lands with the plan's PR, no release.
2. **B** (next egg): 0.23.0.
3. **D's decision and art request**: pick the species and trait from the owner's
   pets, then send the brief to Sol. The code comes when the art arrives.
4. **C1** (Higher or Lower, with every shared game change): 0.24.0, after the
   2026-11-03 tuning review.
5. **C2 prototype** (Catch, card only, hidden option): it can ride along in
   0.24.0 or come in a patch release. The owner plays it for a few days.
6. **C2 full** (server side, decoy prop, in the picker): 0.25.0, only if the
   owner keeps it.
7. **D's code**, once the art is in.

Each release: `scripts/test`, `scripts/card-check` where the card changes,
screenshots to the owner, and then the release workflow as in the HANDOFF.
