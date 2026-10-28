# Phase 2: voices, typing, babble, the favourite snack (build plan, draft 2)

Phase 2 of `plan-2026-10-28-voices-and-lines.md`: A1 (each creature's sound,
`_speak`), A2 (typing and babble) and A4 (the favourite snack). That plan's "The
second audit" section wins over part A; this file says how it's built. Version
0.32.0, its own PR. Draft 2 follows an audit of draft 1 (table at the end).

## Data (13 `species.json`, documented in `sprites/README.md`)

`voice: {sound, pitch, pace, likes}`:

- `sound`: one word, unique in its world: tweet, chirr, mew (Woodland); tik, fuzz
  (Terrarium); mrrp, snuf (Hearth); squeak, bloop (Tidepool); ribbit, blep (Pond);
  squee, fwip (Night Sky).
- `pitch`: the babble's base frequency, 330-1200 Hz (lower is near silent on tablet
  speakers).
- `pace`: typing speed, 25-45 characters a second.
- `likes`: 2-3 foods for the favourite snack, in the creature's own words:

| Creature | likes |
| --- | --- |
| bird | berries, sunflower seeds, mealworms |
| squirrel | hazelnuts, fir cones, mushrooms |
| deer | acorns, apples, clover |
| gecko | mealworms, crickets, waxworms |
| tarantula | crickets, mealworms, waxworms |
| kitten | kibble, tuna, chicken |
| bunny | hay, carrot tops, dandelions |
| otter | clams, crab, sea urchins |
| octopus | shrimp, crab, clams |
| treefrog | flies, crickets, beetles |
| axolotl | bloodworms, earthworms, shrimp |
| bat | midges, beetles, mosquitoes |
| lunamoth | walnut leaves, birch leaves, sweetgum leaves (the caterpillar's; part B decides the moth's) |

No `voice`: plain lines, no babble, no favourite. A `test_species` check: the sound is
one lowercase word and unique in its world, pitch and pace in range, likes 2-3 short
strings.

## Server: the favourite snack (A4)

- `PetState.favourites: dict[str, str]` (`{"snack": "hazelnuts"}`) and
  `favourite_said: str | None` (the local date it was last said). `from_dict` keeps
  only string values. A new egg starts empty (`lay_egg` builds a fresh state; a test
  says so).
- The coordinator keeps `likes` and stage `words` for every ready species (so an egg
  from the next world finds its own).
- **Picking:** one check after every `_advance` (ticks, fast-forward, load): hatched,
  the species has likes, no `snack` yet: `model.pick_favourite(state, likes, rng)`.
  Never re-picked. This covers hatching, old pets at load, dev pets hatched by
  `fast_forward`, and likes added in a later version.
- **Saying:** `model.favourite_snack(state, today, rng)` after a snack that worked
  (from `_check_ins`), with `R.FAVOURITE_SNACK_CHANCE` (0.4), at most once a local
  day: event `favourite_snack` `{food}`, in `MOMENTS`. Not while the stage has its own
  food word (the moth; part B), so a moth doesn't use up the day. Chore treats never
  reach it (they aren't a care snack).
- Life stage sensor: `favourites`, unrecorded. Diagnostics keep it (not private).

## Card

### Writing to the bubble

- `_write(s, text, ms)`: every direct bubble write, the mood-line redraws too. It
  cancels typing and stops a babble. It sets `sayUntil` only when `ms` is given, so
  the game's writes keep the 60 s hold they have now (a pure refactor: card checks
  green before the next step, plus a new check that plays a whole game).
- Typing runs carry a token; a run stops when the bubble isn't its own any more.

### Speaking (A1)

- `_speak(s, text, ms)`: lines that may carry the sound. Used by `_greet`, the
  question's answers, `_sayQueued` (so every queued line: the first look, notes,
  questions, the wish mention, welcomes), house moments (sunrise, sunset, good
  morning, TV, music, weather, forecast, news), wish and bond moments, tucked in,
  the countdown, the treat line, seasonal and costume lines, the visitor's greeting
  (not its startle), the favourite snack.
- Stay `_write` (never voiced): refusals, sick, sad and miss lines, the mood line,
  games and their end lines, praise "♥", hatching, egg laid, grown up, trait
  moments, the chore treat, the visitor's startle, and the idle mumble.
- **The idle mumble** is never voiced, never typed, never counted and never sent to
  the live region (as the comment above the observer says).
- **One rule for the sound:** voiced when the species has a `sound`, nothing on this
  slide was voiced in the last `VOICE_QUIET_MS` (2 min), and the line doesn't start
  with an opener. A queued burst is said within seconds, so only its first line
  carries it. (No `kind`, no "quiet spell".)
- **Openers**, matched case-insensitively as whole words at the start: `*`, `♪`,
  `...`, `hmm`, `hehe`, `boo`, `gobble`, `crack`, `eep`, `eek`, `news`, `ooh`, `oh`,
  `brr`, `aww`, `mm`/`mmm`/`mmh`, `ew`, `wheee`, `la la`, `yay`, `zzz`, `pitter`,
  and the sound itself. ("yay, Dev's here!" stays unvoiced on purpose: it already
  sounds like one.)
- **The form** by the line's end, after stripping trailing `♥ ♪ ~ ★ ❄ ☂` and emoji:
  "!!" → "tweet tweet!!", "?" → "tweet?", "..." or "…" → "tweet...", else "tweet!".
  Over 60 characters with the sound: no sound.
- **The sound is `<span class="snd" aria-hidden="true">`**, so a screen reader
  browsing the page doesn't read it either.
- **Live region:** `_speak` writes `spoken(text)` there once and sets `s.plain` to
  the exact text it put in the bubble; the observer skips only while
  `bubble.textContent === s.plain`. Any other write, from anywhere, is announced as
  today.

### Typing (A2)

- A typed line is laid out whole: a visible `typed` span and a `visibility: hidden`
  `untyped` span, so the bubble has its final size from the first frame and
  `textContent` is the whole line.
- A 40 ms interval reveals `elapsed * pace` characters (by elapsed time, so a late
  tab catches up), by code point, never splitting an emoji. `data-typing` is set on
  the bubble while typing.
- `sayUntil = now + typingMs + ms`.
- Typing finishes at once (and the babble stops) when the status screen opens, on a
  slide change, when the card goes offscreen and when the tab is hidden. No
  tap-to-finish (a tap opens the status screen already).
- No typing with reduced motion, for idle lines, or on a slide not on show.

### Babble (A2)

- `babble(text, voice)` beside `playChirp`: one short syllable (triangle wave, 45
  ms, gain 0.04, below the chirps' 0.06) per letter, from `voice.pitch` varied by
  letter (±3 semitones), spaces and punctuation a pause; spacing `1 / pace` s;
  stopped at 1.2 s. One babble at a time.
- Only on voiced, typed lines; only on the pet on show with the status screen
  closed and no game; through the chirp gates (visible, not asleep, not lights out,
  not quiet hours); and its own per-browser switch "babble" (`hatch-babble`, off by
  default) on the status screen beside "sounds here".
- **Stopped** by `_write`, a slide change, the status screen opening and the tab
  going hidden.
- **iOS:** one `pointerdown` listener on the card resumes the AudioContext when
  babble or sounds is on (a reload leaves it locked). The switch's first tap plays
  a sample.
- The "notify me" switch gets its own class (`.bell.notify`) and is found by it: the
  old `:not(...)` selector would catch the babble switch on a shared screen.

### The favourite snack line

The `favourite_snack` moment queues "<food>, my favourite!!" (so it comes after
whatever the snack itself said, and is voiced if it's the first line in a while).
Not in a season with its own snack (Halloween candy, Thanksgiving pie already
say theirs).

## Tests

- Model: `pick_favourite` (from likes, never re-picked, none without likes);
  `favourite_snack` (chance, once a day, not for a failed snack, not with a stage
  food word); a new egg has none; `from_dict` defaults and type-checks.
- Coordinator: picked after a `fast_forward` hatch and at load for an old pet, also
  for a next-world species; the moment reaches `moments`; the sensor attribute.
- `test_species`: the voice rules above.
- Card checks (`scripts/card-check`):
  1. A greeting carries the sound (in an `aria-hidden` span); the live region has
     none.
  2. A care miss line is never voiced.
  3. Once per burst: three queued lines, only the first voiced.
  4. An opener line ("hmm...") isn't voiced.
  5. Typing: `data-typing` set then cleared; the bubble's size doesn't change while
     typing; one plain live-region announcement.
  6. Opening the status screen finishes the line.
  7. Reduced motion: no typing.
  8. The babble switch starts off and turns on; "notify me" is still found on a
     shared screen.
  9. A whole game plays with the mood line never drawn over it.
  10. The favourite snack moment queues its line.
  The helper `bubble()` waits until `data-typing` is gone; length and exact-text
  checks strip a leading sound; checks reset the "last voiced" time so a sound never
  depends on timing.
- A sample sheet for the owner: each of the 13 creatures greeting, with its sound.

## Order of work

1. Data and server (favourites), with tests.
2. `_write` (a pure refactor, card checks still green, the game check added).
3. `_speak` and sounds; then typing; then babble.
4. Card checks, screenshots, the audit of the work, fixes, PR.

## The audit of draft 1 (19 findings) and what changed

| # | Finding | Change |
| --- | --- | --- |
| 1 | The favourite line can't follow `_react`'s snack line (it has none outside seasons) and would overwrite Thanksgiving's "pumpkin pie, my favourite!" | Queued, skipped in a snack season, skipped on the server for a stage with its own food |
| 2 | `_write` always setting `sayUntil` would cut the game's 60 s hold | `sayUntil` only when `ms` is given; a whole-game check |
| 3 | Tap-to-finish can't work (a tap opens the status screen, which hides the bubble) | Cut; typing finishes on status, slide change, offscreen, hidden |
| 4 | `fast_forward` hatches are simulated, so the `hatched` hook never picks for dev pets | One check after every `_advance` |
| 5 | The "notify me" selector would catch the babble switch on a shared screen | `.bell.notify` |
| 6 | A sticky `s.plain` flag would silence later direct writes (breaks a check) | `s.plain` holds the exact text; skip only while it matches |
| 7 | Mood redraws not cancelling typing lets a late interval write over them | They go through `_write`; runs carry a token |
| 8 | Queue entries can't carry a `kind` | `kind` dropped (see 19) |
| 9 | Voiced idle mumbles would set the rhythm, nudge a hungry pet, and reach screen readers | Idle mumbles never voiced, counted or announced |
| 10 | `innerText` checks would read half-typed lines; a sound breaks length checks | `bubble()` waits for typing; checks strip the sound and reset the voice timer |
| 11 | The sound is still read when browsing the page | `aria-hidden` span |
| 12 | A babble keeps going after the line leaves the screen | Stopped by `_write`, slide change, status, hidden; never with status open or a game on |
| 13 | iOS: nothing unlocks audio after a reload | A `pointerdown` resume on the card |
| 14 | Openers miss "mm", "ew", "oh", "eek"; "yay" catches a greeting | Whole-word, case-insensitive list; "yay" greetings unvoiced on purpose |
| 15 | The form read from a trailing ♥ | Trailing marks stripped first |
| 16 | "moths" for the bat (beside the luna moth) and frog; "roaches"; a Douglas squirrel eats conifer seeds | New likes |
| 17 | Writes in neither list | Every write is listed |
| 18 | `favourites` hygiene; no voice validation; `lay_egg` needs no reset | `favourite_said` field, type check, `test_species` |
| 19 | Over-built: the default babble, the fit check, `kind` and "quiet spell", a 220 Hz babble | Cut; pitch 330 Hz and up |
