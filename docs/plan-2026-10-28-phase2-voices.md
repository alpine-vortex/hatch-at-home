# Phase 2: voices, typing, babble, the favourite snack (build plan, draft 1)

Phase 2 of `plan-2026-10-28-voices-and-lines.md`: A1 (each creature's sound,
`_speak`), A2 (typing and babble) and A4 (the favourite snack). That plan's "The
second audit" section wins over part A; this file says how it's built. Version
0.32.0, its own PR.

## Data (13 `species.json`, documented in `sprites/README.md`)

`voice: {sound, pitch, pace, likes}`:

- `sound`: one word (the second audit's table: tweet, chirr, mew, tik, fuzz, mrrp,
  snuf, squeak, bloop, ribbit, blep, squee, fwip).
- `pitch`: the babble's base frequency in Hz (a high quick bird about 1100, a low
  slow octopus about 220).
- `pace`: typing speed, characters a second (25-45).
- `likes`: 2-3 foods for the favourite snack, in the creature's own words:

| Creature | likes |
| --- | --- |
| bird | berries, sunflower seeds, mealworms |
| squirrel | hazelnuts, pine seeds, mushrooms |
| deer | acorns, apples, clover |
| gecko | mealworms, crickets, waxworms |
| tarantula | crickets, roaches, mealworms |
| kitten | kibble, tuna, chicken |
| bunny | hay, carrot tops, dandelions |
| otter | clams, crab, sea urchins |
| octopus | shrimp, crab, clams |
| treefrog | flies, crickets, moths |
| axolotl | bloodworms, earthworms, shrimp |
| bat | bugs, moths, mosquitoes |
| lunamoth | walnut leaves, birch leaves, sweetgum leaves (the caterpillar's; part B decides the moth's) |

No `voice`: plain lines, the default babble (pitch 600, pace 35), no favourite.
`species.py` keeps reading the files as is; the coordinator reads `likes`
defensively (a list of short strings, else none).

## Server: the favourite snack (A4)

- `PetState.favourites: dict[str, str]` (`{"snack": "hazelnuts"}`), the pet's, not
  carried to the next egg (`lay_egg` resets it, as it resets the pet's own things).
- `model.pick_favourite(state, likes, rng)`: picks once when `favourites` has no
  `snack` and `likes` is non-empty; never re-picks.
- The coordinator keeps `self.likes` (species -> likes, all ready species, so a
  next-world egg finds its own). It picks on the `hatched` event (in `_fire`,
  before `_check_ins`) and at load for a hatched pet without one.
- `model.favourite_snack(state, today, rng)`: after a snack that worked, with
  `R.FAVOURITE_SNACK_CHANCE` (0.4), at most once a local day (`favourites["said"]`
  = today): event `favourite_snack` `{food}`. Called from `_check_ins` on the
  care event. Added to `MOMENTS`. Not for a chore treat (it's the house's snack,
  not someone's).
- Life stage sensor: `favourites` (`{snack}` only), unrecorded. Diagnostics keep it
  (not private).

## Card

### Speaking (A1)

- `_write(s, text, ms)`: the one direct bubble write. Cancels any typing, clears
  `s.plain` (so the live-region observer copies it, as today), sets the text and
  `sayUntil`. All 31 direct writes move to it, except the two mood-line redraws in
  `_tick`/`_update`, which only run when nothing is being said and keep writing
  `textContent` (cancelling nothing).
- `_speak(s, text, {ms, kind, type = true})`: voiced lines. `kind` is `"greet"`,
  `"welcome"`, `"ask"` or absent. Used by: `_greet`, the first-look lines (welcome,
  away note, dream, wish), `_sayQueued` (everything queued), `_note`, the wish and
  bond moments, house moments (sunrise, sunset, good morning, TV, music, weather,
  forecast, news, friend home), seasonal lines and the costume line, the idle
  mumble (`type: false`), the favourite snack line. Not used (stay `_write`):
  refusals, sick, sad and miss lines, the mood line, games, praise "♥", hatching.
- **The sound:** a line is voiced when the species has a `sound`, the line doesn't
  start with an opener (`OPENERS`: "*", "♪", "...", "hmm", "hehe", "boo", "gobble",
  "crack", "eep", "news!", "ooh", "brr", "aww", "mmh", "wheee", "la la", "yay",
  "zzz", "pitter", or the sound itself), nothing on this slide was voiced in the
  last `VOICE_QUIET_MS` (2 min), and either `kind` is set or the last line ended
  (`s.saidUntil`) at least `VOICE_QUIET_MS` ago. A queued burst is said within
  seconds, so only its first line can be voiced.
- **The form** by the line's end: "!!" → "tweet tweet!!", "?" → "tweet?", "..." or
  "…" → "tweet...", else "tweet!". Joined with a space. If the result passes 60
  characters, the sound is left off.
- **Live region:** `_speak` writes `spoken(text)` (the line without the sound) to the
  live region itself, once, and sets `s.plain` until `sayUntil`; the bubble's
  observer skips while `s.plain` is set. Only the pet on show, as today.
- **Never** in notifications, Assist, the status screen or the journal: those don't
  go through the card's bubble.

### Typing (A2)

- A typed line is laid out whole: `<span class="typed">` (visible) and
  `<span class="untyped">` (`visibility: hidden`) in the bubble, so the bubble has
  its final size from the first frame and `textContent` is the whole line.
- A 40 ms interval reveals `elapsed * pace` characters (by elapsed time, so a
  background tab catches up), by code point, never splitting an emoji or "♥".
  `s.bubble.dataset.typing` is set while typing (card checks wait for it to go).
- `sayUntil = now + typingMs + ms`. A tap anywhere on the screen finishes the line
  (the tap still does what it does now).
- No typing with reduced motion, for the mood line, idle lines (`type: false`), or a
  slide that isn't on show (written whole).

### Babble (A2)

- `babble(text, voice)` beside `playChirp`: one short syllable (triangle wave, 45 ms,
  gain 0.035, below the chirps' 0.06) per letter, pitch from `voice.pitch` varied by
  the letter (a vowel a little higher, a step of ±3 semitones by char code), spaces
  and punctuation a pause; spacing `1 / pace` s; stopped at 1.2 s; a new babble
  stops the previous one's oscillators.
- Only on voiced lines, only when typed (so not with reduced motion), through the
  chirp gates (`_chirp`'s: on show, visible, not asleep, not lights out, not quiet
  hours) and its own per-browser switch "babble" (`hatch-babble`, off by default)
  on the status screen beside "sounds here". The switch's first tap plays a sample
  (unlocks audio on iOS, as "sounds here" does).

### The favourite snack line

`favourite_snack` moment: `_speak(s, "<food>, my favourite!!")` (so "chirr chirr!!
hazelnuts, my favourite!!"), after `_react`'s snack line. Skipped while the stage
has its own food word (the moth; part B).

## Tests

- Model: `pick_favourite` picks from likes, never re-picks, none without likes;
  `favourite_snack` chance, once a day, not for a failed snack; `lay_egg` resets
  `favourites`; `from_dict` defaults it.
- Coordinator: picked at hatch (by the hatched species, in another world's roster
  too) and at load for an old hatched pet; the moment reaches `moments`; the sensor
  attribute.
- Card checks (`scripts/card-check`):
  1. A greeting is voiced ("<sound>! hi, Dev!" form) and its live region has no sound.
  2. A care miss line is never voiced.
  3. Once per burst: three queued lines, only the first carries the sound.
  4. An opener line ("hmm...") isn't voiced.
  5. Typing: `data-typing` set, then cleared; the bubble's size doesn't change while
     typing; the live region is announced once, plain.
  6. A tap finishes the line.
  7. Reduced motion: no typing.
  8. The babble switch starts off and turns on; no AudioContext is made with it off.
  9. Fit: for every species, the longest voiced line form stays ≤ 60 or is unvoiced.
  10. The favourite snack moment says the line.
  Existing exact-text checks of voiced lines strip a leading sound before comparing.
- A sample sheet for the owner: each of the 13 creatures greeting and asking, with
  its sound.

## Order of work

1. Data and server (favourites), with tests.
2. `_write` (pure refactor, card checks still green).
3. `_speak` and sounds; then typing; then babble.
4. Card checks, screenshots, the audit of the work, fixes, PR.
