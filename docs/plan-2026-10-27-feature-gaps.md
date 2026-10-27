# Feature-gap plan, 2026-10-27 (after 0.21.0)

**Status:** planned, nothing started. The owner chose these items from an outside
feature-gap audit, which compared Hatch at Home with Tamagotchi and Giga Pets.
An adversarial review of the first draft changed several of them; the owner
accepted all of its recommendations, and asked for a third minigame based on the
classic Tamagotchi games. The open decisions left are listed with each item.

## What the audit said and what came of it

| Audit suggestion | Outcome |
| --- | --- |
| Daily diary in the journal | Not doing (owner's call). |
| Pet reaches back into the house on calls | **Planned (A):** a blueprint, no integration code. |
| Care-shaped evolution / guide the next egg | **Planned (B) and (D):** choose the next egg; a one-species alternate adult, shaped by the house (a trait) rather than by care quality. |
| More minigames | **Planned (C1–C3):** Higher or Lower (the 1997 second-generation Tamagotchi's game); Catch (the Giga Pets game), as a prototype first; copy me only with a twist. |
| Trained tricks | Not now. Signature poses are drawn for the child only, so other stages would need stand-ins or new art. |
| Pets on the shelf noticing each other | Not now. |
| Birthdays / calendar celebrations | Not now. A generation lasts 3–5 weeks (adult at 14 days, egg a week later), so a yearly birthday never arrives. A calendar "big day" was offered and not chosen. |
| Owned items, decorations, shop | Deferred. Needs art and an economy, and could turn gentle care into a grind. |
| Learning household rhythms | Deferred. Lots of complexity for flavour only, and close to the surveillance feel the audit itself warns about. |
| Death or old age | No. "It never dies" is a design rule. |
| Deer, rain scenes, shared props | Already requested from Sol (HANDOFF open item 3). |
| Assist on a real agent, notification buttons on a real phone | Already open (HANDOFF items 1 and 5). They need the owner. |
| BirdNET visits | Deferred by the owner. |

## A. Call response blueprint (S, no release)

An optional HA automation blueprint: when the pet calls, briefly pulse a lamp of the
owner's choosing and/or play a short sound on a speaker. Every piece is opt-in and
set up by the owner. The integration doesn't change.

- File: `blueprints/automation/virtual_pet/call_response.yaml`.
- **Not shipped through HACS.** HACS installs only `custom_components/`, so the
  blueprint is imported from its GitHub URL. The README gets a section with a
  "My Home Assistant" import button. No version bump: it goes live when it's
  merged. The README change reaches HACS users with the next release.
- Trigger: the `virtual_pet_call_started` event, filtered by `pet_id` (a
  `config_entry` selector limited to `virtual_pet`). **Events from fast-forward
  carry `simulated: true` and are skipped**, so a debug run doesn't flash the
  lamps.
- Inputs: the pet; the lights (optional), and the colour or flash; the media
  player and sound (optional); a cooldown in minutes (default 30).
- **Lights: change the colour or use `light.turn_on` with `flash: short`, never
  the brightness.** Past bedtime the pet treats a bright room light as "too
  bright" (`home.py`), and the pet can be awake and calling then. A brighter
  pulse could feed back into what it senses. Only lights that are already on
  are touched, so a dark room never lights up at night. A colour pulse restores
  the previous colour afterwards. `flash` needs no restore.
- No "only while someone's home" input: an away pet is frozen and never calls
  (`model.advance`).
- The cooldown uses `mode: single` and a delay at the end, so repeated calls are
  dropped instead of queued.
- Fake calls appear on the bus as real ones (`reason: happiness`). That's intended:
  the blueprint must not give them away.
- Tests: load the blueprint through HA's blueprint component in pytest, fire the
  event, and assert the service calls. Check that the cooldown holds, that
  simulated events are ignored, and that lights that are off stay off.

## B. Choose the next egg (S–M)

`design-worlds.md` already lists this as a later option. A **select entity**,
`select.<pet>_next_egg`, with "Surprise me" (the default) plus **every ready
species in the device's world**. It's stored on the state and used when the egg
hatches (`model._hatch`, which currently picks at random and prefers unraised
species). After hatching it resets to "Surprise me".

- Any ready species, not only those already raised. A "raised only" rule would
  make the choice useless until the third generation (6–10 weeks in), because
  the hatch already prefers unraised species. Any species also lets the owner
  pick D's pilot creature. "Surprise me" stays the default.
- It can be set at any time. It applies to the next hatch, so it can be set
  before laying the egg.
- The state gets a new field, `egg_choice: str | None`, carried over by
  `lay_egg`. It's dropped if that species leaves the roster, for example after a
  world change through reconfigure. The select's options follow the roster.
- The card: the egg screen shows the choice ("a kitten is on the way" versus
  "who could it be?"). Changing it happens from the entity (HA's more-info
  dialog) or the card editor, without adding a button to the device.
- Tests: the choice is honoured; "surprise" keeps today's behaviour; a choice
  from another world is ignored; the choice survives a restart and a world
  change.

## C. More minigames (M each)

The pet has the first-generation Tamagotchi's left/right game. More come in
turn, after the 2026-11-03 tuning review, so the game-use numbers from that
review give a baseline.

**The fun test.** Skill games pay a win like plain play (below), so nobody plays a
game for its reward. It gets played only if it's fun on its own. An
adversarial review of the games found:
- **Higher or Lower is close to solved:** the right guess is obvious except on a
  5. Keep it for nostalgia and because it's cheap, but don't count on it to
  carry the fun.
- **Copy me as first drafted is too easy:** three to five lefts and rights are
  trivial to remember. It's built only with a twist (C2).
- **Catch's original wasn't hard either:** Giga Pets players called it "almost
  impossible to lose". Its appeal is watching your own creature pounce, so it
  needs decoys, speed-up and per-creature motion to stay fun, and it's tried out
  as a prototype before any server work (C3).
- Several thin games are worth less than one good one. Each game must earn the
  next one: watch the play counts (`game_finished` with `game`) and the owner's
  feedback before building the next.

Order: C1, then C3 (the prototype, then the full version if it's kept), then C2
only if a twist makes it worth having. C1 and C2 reuse the left and right
buttons, need no new art, and are checked on the server like the current game.
C3 is timed by the card (see C3).

**Shared changes (done with C1):**
- `Game` gains a `kind`, and `virtual_pet.play_game` gets an optional `game`
  field (default `left_right`). `virtual_pet_game_finished` gains `game`. The
  same `GAME_IDLE_MINUTES` drop and refusals apply.
- **Rewards: skill games pay a win like plain play.** Plain play gives
  `PLAY_HAPPINESS` (20). Left/right is a coin flip (a win gives 25, a loss 10;
  17.5 on average), so it's already worth less than plain play. A skill game
  that pays 25 would be the best happiness button and leave the luck game
  pointless. So a win in C1 or C2 gives `PLAY_HAPPINESS`, and a loss gives
  `GAME_LOSE_HAPPINESS`. Left/right keeps its 25 as the reward for luck.
  Energy, hunger and weight are the same as the existing game.
- Card: the play button opens a picker with one button per game. The picker
  remembers the last game played.
- The species' `reactions.won` pose is reused for every game.

### C1. Higher or Lower (the classic, first)

The game from the 1997 second-generation Tamagotchi: the pet shows a number from
1 to 9, and the player guesses whether the next number will be higher or lower.
Five rounds; three right wins, the same as the existing game.

- The next number is never the same as the current one, so there are no ties.
- Left = lower, right = higher. It's one guess per round, the same flow as
  left/right, so the service shape stays as it is (`guess`: `lower` or `higher`).
  The number to guess against comes back in each response, and the first
  number in the start response.
- Card: the number is drawn in Tiny5 on the pet's screen, the pet "flips" it
  with the existing `perk`, and the score uses the same line as the left/right
  game.
- With good play the win rate is around 90%. That's why the win reward is set to
  plain play's above.
- Tests: no ties; the score and win line; the idle drop; the rewards; one
  `card-check` step that plays a game through.

### C2. Copy me (only with a twist)

The pet shows a short sequence and the player repeats it. A wrong step ends that
round; two rounds right out of three wins. **As first drafted (3–5 lefts and
rights), it's too easy to be worth building.** It's built only with a twist
that makes it a real memory test, for example:
- four directions (adding up and down, with two more buttons on the game
  overlay), with longer sequences (4, 6, then 8 steps);
- or the pet shows the sequence once, quickly, and then the pet itself acts as
  a distraction (wandering, a bubble) while the player answers.
Choose the twist when C2 comes up, by playing a card prototype as for C3. If no
twist feels good, drop C2.

- **A separate start call.** Today the first guess starts a game, and `guess` is
  required. Copy me needs a call that starts the game and returns the first
  sequence, so `guess` becomes optional (`game: copy_me` with no guess starts
  the game).
- **One call per round, not per tap.** The card collects the player's taps and
  sends the whole answer for that round (`answer: [left, right, …]`). The
  server checks it and returns the next sequence. That's 3 calls per game
  instead of about 12.
- Each step shows for about 600 ms, and there's no time limit on the answer.
- Tests: the sequence lengths; a wrong answer; a malformed answer is rejected;
  the idle drop; the rewards; one `card-check` step.

### C3. Catch (the Giga Pets game; prototype first)

From the 1997 Tiger Giga Pets ([Compu Kitty
manual](https://www.hasbro.com/common/instruct/kitty-in.pdf): "press the LEFT or
RIGHT key to make your pet react … at the correct time"). Something drifts in
from one side, and you tap that side while it's in reach, so the pet pounces.
It's the only reflex game in the set: left/right is luck, Higher or Lower is
odds, and copy me is memory.

**How it plays:** five rounds, catch three to win.
- Each round, the creature's own play prop drifts in from the left or right:
  the ball, the gecko's cricket, the squirrel's pine cone (every species has a
  `play` prop already).
- Tap that side while the prop is in the catch zone, and the pet turns toward
  it (the sprite mirrored in CSS) and pounces (the existing `hop`). A catch
  shows the species' `reactions.won` pose briefly, which is the Giga Pets "trick";
  that pose exists for the child stage only, so other stages hop.
- Tap too early, too late or on the wrong side, and it gets away.

**What keeps it fun** (from the fun review):
- **Decoys.** Now and then something drifts in that the pet mustn't catch (a
  bee, a wasp); tapping it loses the round. That turns "tap when it arrives"
  into "tap or don't?". Biggest win for the least work. The prototype uses a
  recoloured existing prop; one shared `decoy` prop from Sol replaces it if
  Catch is kept.
- **Speed-up within a game.** Round 1 is slow and forgiving; round 5 is quick.
  Every game builds to a tense last round.
- **Per-creature motion.** The cricket hops, the moth zigzags, the ball rolls,
  the fish swims a wave: a few CSS motion types, picked by a `catch_motion`
  key in `species.json` (default: roll).
- **Best score.** "best catch: 5/5" on the status screen, kept per pet.
- No stage-based difficulty: more rules for little gain.

**Fairness and access:**
- The catch window starts at about 1.2 s in round 1 (Giga Pets: about 1 s)
  and narrows to about 0.6 s by round 5. Prototype numbers; tune by playing.
- With `prefers-reduced-motion`, props move more slowly and every window is
  doubled.
- It's the only planned game that needs quick hands, and the others stay
  available, so play itself is never gated behind reflexes.

**Who judges the taps: the card.** A round trip to the server can take
longer than the catch window, so the server can't time the taps.
- The start call (`game: catch`) returns all five rounds: the side, and
  whether it's a decoy. The card runs the rounds locally and times the taps in
  the browser, where network lag can't matter.
- One finish call reports the catches (`caught: n`). The server checks the game
  exists and hasn't timed out and that `n` is between 0 and 5, then applies the
  reward and the best score.
- The card is trusted, and nothing here needs guarding: anyone who can call
  `play_game` can already press "play" as often as they like, and happiness is
  capped.
- Assist can't play it; it doesn't offer any game today.

**Prototype first (card only).**
- The card runs Catch entirely locally, behind a hidden card option
  (`experimental_catch: true` in the card's YAML), reward-free, with no server
  changes.
- It goes out in a normal release, with the option off by default and
  undocumented.
- The owner plays it on the phone and the wall dashboard for a few days.
- **Keep it** only if they find themselves coming back to it. Then build the
  server side above, ask Sol for the decoy prop, and ship it in the picker.
- **Drop it** otherwise, with only the card code to remove.

Tests (full version): the finish call's checks; the idle drop; the rewards; the
best score survives a restart. `card-check` drives one game with the card's
clock stubbed (a test hook for the timer), so its taps land deterministically.

## D. An alternate adult form: one-species pilot (M, art-bound)

**Shaped by the house, not by care quality.** The first draft tied the alternate
look to upbringing. Scrappy needs about 9 or more missed calls before adulthood,
so a caring owner would never see that look, and getting it would mean
neglecting the pet. Tying it to devoted instead turns the plain adult into the
"did worse" look. Traits come from the house (the sun, the fire, music,
company…), so neither form is a grade.

- **One alternate look for one species, for one trait.** At adulthood, a pet
  that has that trait (learned or inherited) takes the alternate look. It's
  decided once and stored, like upbringing (`adult_form` on the state), so a
  trait learned later doesn't flip it. Because traits pass down the line, a
  family can keep its look across generations.
- **The species comes from a world the owner actually runs** (which worlds are in
  the private notes, not this repo). Otherwise the pilot is never seen. B lets
  the owner pick the creature for the next egg.
- **The trait should be one the house reliably teaches.** Check the owner's
  current pets' traits through the debug sensor or diagnostics before choosing.
- `species.json`: an optional `adult_forms` map, trait → sprite prefix, e.g.
  `{"fireside": "adult_fireside"}`. A pet without a mapped trait uses the plain
  adult. The sprites README documents it.
- The card reads the form from the life-stage sensor's attributes (a new
  `adult_form` next to `upbringing`). The journal records each generation's
  form, and the "all grown up" line can name it.
- **Art request to Sol** (a full adult sheet, the same size as the plain adult:
  10 moods × 2 frames for the kitten). Probe first, as for new creatures. It's
  sent only once the species and trait are chosen, since both shape the brief.
- Tests: `tests/test_species.py` checks that every mapped prefix has a full set
  of sprites; the form is decided once at adulthood and survives a restart;
  Playwright screenshots of both forms.

Decisions (to settle when D starts):
- Which species and trait? The rule is a species from a world the owner runs,
  and a trait the house teaches. A visual fit helps (a kitten with `fireside`
  or `couch_potato`, a bat with `moon_child`).

## Order and releases

1. **A** (blueprint): merged on its own, no release.
2. **B** (next egg): 0.22.0.
3. **D's decision and art request**: pick the species and trait from the owner's
   pets, then send the brief to Sol. The code comes when the art arrives.
4. **C1** (Higher or Lower, with the shared game changes): 0.23.0, after the
   2026-11-03 tuning review.
5. **C3 prototype** (Catch, card only, hidden option): it can ride along in
   0.23.0 or come in a patch release. The owner plays it for a few days.
6. **C3 full** (server side, decoy prop, in the picker): 0.24.0, only if the
   owner keeps it.
7. **C2** (copy me), only if a twist proves itself in a prototype.
8. **D's code**, once the art is in.

Each release: `scripts/test`, `scripts/card-check` where the card changes,
screenshots to the owner, and then the release workflow as in the HANDOFF.
