# Feature-gap plan, 2026-10-27 (after 0.21.0)

**Status:** planned, nothing started. The owner chose these four items from an
outside feature-gap audit, which compared Hatch at Home with Tamagotchi and Giga
Pets. Each item still has open decisions (listed with it), to settle before work
starts.

## What the audit said and what came of it

| Audit suggestion | Outcome |
| --- | --- |
| Daily diary in the journal | Not doing (owner's call). |
| Pet reaches back into the house on calls | **Planned (A):** a blueprint, no integration code. |
| Care-shaped evolution / guide the next egg | **Planned (B) and (D):** choose the next egg; a one-species adult pilot. |
| Second minigame | **Planned (C).** |
| Trained tricks | Not now. Signature poses are drawn for the child only, so other stages would need stand-ins or new art. |
| Pets on the shelf noticing each other | Not now. |
| Birthdays / calendar celebrations | Not now. A generation lasts 3–5 weeks (adult at 14 days, egg a week later), so a yearly birthday never arrives. A calendar "big day" was offered and not chosen. |
| Owned items, decorations, shop | Deferred. Needs art and an economy, and could turn gentle care into a grind. |
| Learning household rhythms | Deferred. Lots of complexity for flavour only, and close to the surveillance feel the audit itself warns about. |
| Death or old age | No. "It never dies" is a design rule. |
| Deer, rain scenes, shared props | Already requested from Sol (HANDOFF open item 3). |
| Assist on a real agent, notification buttons on a real phone | Already open (HANDOFF items 1 and 5). They need the owner. |
| BirdNET visits | Deferred by the owner. |

## A. Call response blueprint (S)

An optional HA automation blueprint: when the pet calls, briefly pulse a lamp of the
owner's choosing and/or play a short sound on a speaker. Every piece is opt-in and
set up by the owner. The integration doesn't change.

- File: `blueprints/automation/virtual_pet/call_response.yaml`.
- Trigger: the `virtual_pet_call_started` event, filtered by `pet_id` (a
  `config_entry` selector limited to `virtual_pet`).
- Inputs: the pet; the lights (optional), the colour and how long the pulse lasts;
  the media player and sound (optional); a cooldown in minutes (default 30); and
  an "only while someone's home" toggle.
- Lights: snapshot them with `scene.create`, pulse, then restore them. It skips
  lights that are off, so it never turns a dark room on at night.
- The cooldown uses `mode: single` and a delay at the end, so repeated calls are
  dropped instead of queued.
- Fake calls appear on the bus as real ones (`reason: happiness`). That's intended:
  the blueprint must not give them away.
- README: one section with a "My Home Assistant" import button.
- Tests: load the blueprint through HA's blueprint component in pytest, fire the
  event, and assert the light and media service calls, including that the
  cooldown holds.

Decisions:
- Pulse lights that are already on only (proposed), or also flash lights that
  are off?
- One blueprint for all pets, or one per pet (proposed: one automation per pet,
  as in the inputs above)?

## B. Choose the next egg (S–M)

`design-worlds.md` already lists this as a later option. A **select entity**,
`select.<pet>_next_egg`, with "Surprise me" (the default) plus the world's
ready species. It's stored on the state and used when the egg hatches
(`model.py` `_hatch`, which currently picks at random and prefers unraised
species). After hatching it resets to "Surprise me".

- The state gets a new field, `egg_choice: str | None`, carried over by
  `lay_egg`. It's dropped if that species leaves the roster, for example after a
  world change through reconfigure.
- The card: the egg screen shows the choice. Changing it happens from the entity
  (HA's more-info dialog) or the card editor, without adding a button to the
  device.
- Assist: no change.
- Tests: the choice is honoured; "surprise" keeps today's behaviour; a choice
  from another world is ignored; the choice survives a restart.

Decisions:
- May the owner pick any ready species, or only those this device has already
  raised (so discovery stays a surprise the first time)? Proposed: raised species
  only, and "Surprise me" stays the only way to meet a new one.
- Should the choice be possible only while it's an egg, or at any time for the
  next egg? Proposed: at any time, so it can be set before laying.

## C. A second minigame (M)

One new game, then watch how much it gets played (the 2026-11-03 tuning review
covers game use) before adding more.

Proposal: **copy me**, a pattern-repeat game on the existing left/right
buttons. The pet shows a short sequence (3 steps, then 4, then 5), and the
player repeats it. It needs no new art: the existing `hop`/`perk` and the left
and right glances are enough. The server creates the sequence and checks the
answers, as with the left/right game, so it works the same from any device.

- `model.py`: `Game` gains a `kind` field, and `play_game` takes `game` as well
  as `guess`. Same `GAME_IDLE_MINUTES` drop, same refusals, and the same rewards
  (`GAME_WIN_HAPPINESS` etc.) so nothing needs rebalancing.
- `virtual_pet.play_game` gets an optional `game` field (default `left_right`).
  `virtual_pet_game_finished` gains `game`.
- Card: the play button opens a two-choice picker (the left/right game, copy
  me). The sequence plays at about 600 ms a step with no time limit on the
  answer. The species' `reactions.won` pose is reused.
- Tests: model tests for the sequence, a wrong step ending the round, the idle
  drop, and rewards; a `card-check` step that plays it through.

Decisions:
- Copy me, or another kind of game (the audit also suggested a timing game,
  which sits poorly with server-side checking and network lag)?
- Should the play button open a picker, or should the games take turns?

## D. Care-shaped adult form: one-species pilot (M, art-bound)

Two adult looks for one species, chosen by upbringing. Both looks are positive.
Neither is a "bad" form: the difference shows care history without punishing.

- Art request to Sol (add it to the next batch): a second adult sheet for the
  chosen species. Same moods and frames as its adult; probe first, as for new
  creatures.
- `species.json`: an optional `adult_forms` map, upbringing → sprite prefix, e.g.
  `{"scrappy": "adult_wild"}`. Grades that aren't listed use the plain adult.
  The sprites README documents it.
- The card picks the prefix from the `upbringing` attribute it already has. The
  journal records which form each generation had.
- `stage_changed` at adulthood already carries `upbringing`. The card's line
  "all grown up: …" can name the form.
- Tests: `tests/test_species.py` checks that every mapped prefix has a full set
  of sprites; Playwright screenshots of both forms.

Decisions:
- Which species to pilot? Proposed: the tabby kitten or the bird, since both
  have strong adults and a clear visual axis (tidy and fluffy versus rough).
- Which grades get which look? Proposed: devoted and steady keep the plain
  adult; scrappy gets the alternate, drawn as adventurous rather than neglected.

## Order and releases

1. **A** (blueprint): on its own, a small release (0.22.0).
2. **D's art request**: send it to Sol early, since art is the slow part. The code
   comes when the art arrives.
3. **B** (next egg): 0.23.0.
4. **C** (second game): 0.24.0, after the 2026-11-03 tuning review, so that the
   game-use numbers from that review give a baseline.
5. **D's code**, once the art is in.

Each release: `scripts/test`, `scripts/card-check` where the card changes,
screenshots to the owner, and then the release workflow as in the HANDOFF.
