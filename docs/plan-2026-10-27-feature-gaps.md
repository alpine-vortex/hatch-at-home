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
| More minigames | **Planned (C1, C2):** Higher or Lower (the 1997 second-generation Tamagotchi's game) and copy me. |
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

## C. Two more minigames (M each)

The pet has the first-generation Tamagotchi's left/right game. Two more come in
turn, after the 2026-11-03 tuning review, so the game-use numbers from that
review give a baseline. Both reuse the left and right buttons, need no new art,
and are checked on the server like the current game.

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

### C2. Copy me

The pet shows a short sequence of lefts and rights (3, then 4, then 5 steps) and
the player repeats it. The pet hops to each side as it shows the steps. A wrong
step ends that round; two rounds right out of three wins.

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
5. **C2** (copy me): 0.24.0, once C1 has been in use for a while.
6. **D's code**, once the art is in.

Each release: `scripts/test`, `scripts/card-check` where the card changes,
screenshots to the owner, and then the release workflow as in the HANDOFF.
