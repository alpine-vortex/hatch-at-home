# Plan: species nature, 2026-11-02 (build plan)

**Status: PLAN, docs only (tier 0).** Written by s2730 from scout s2728's report
(`~/.local/state/crew/archive/hatch-at-home-s2728-20261102-1414/report.md`) and the
decisions of 2026-11-02 (section 1). Every file:line claim in the scout's report was
re-checked against `origin/main` `b38c9852`; where the code differs, section 2 says so.
Names win over line numbers. **Every pet line, field-note and pose name here is DRAFT**
until the first mate approves it (decisions-2026-10-28.md, "How the crew works with the
owner"). No final player copy is in this plan.

The build is four ships. **Ships 1-3 are tier 1** (card and data; flavour only; no saved
field, no stat, no rate). **Ship 4 is art** (tier 1 for the code, the art goes through the
art review). Nothing here touches `PetState`.

## 0. Summary

Today species differ in **look, voice and words, never in behaviour**. Each species has
three own poses (the otter's rock, hold paws and kelp wrap), but they are drawn **for the
child only**, about four days of a pet's life. A teen or adult otter idles exactly like a
teen or adult tortoise.

This plan gives each species a **nature**: four fixed facts in `species.json` (`clock`,
`sky`, `company`, `habit`), plus a fifth, `pace`, that the data already has (`voice.pace`),
and the sixth, the Hop move family, that Hop's plan already decided. The facts show as
**body language and action lines**; the personality type keeps the **voice**. It is
flavour only. No species is better at anything, needier, or sadder.

| Ship | What | Size | Art | Copy (DRAFT lines) |
|---|---|---|---|---|
| **N1** | `nature` block in all 30 `species.json`, README row, data test. The idle manner (habit and pace reweight the existing idle moves, cadence by pace). The sky body reaction and the clock lines (sunset, morning look) | S-M | none | about 20 |
| **N2** | The species action-line layer in `_lines` (idle, snack, clean, find), the company manner on visitor greet and link host, one dream per habit | M | none | about 46 |
| **N3** | A field note per species in the creature book; a species note in the Assist status data | S | none | 30 + 1 prompt sentence |
| **N4** | One adult signature pose per species (30 species x 2 frames = 60 frames), `signature` in `species.json`, the two child-only guards learn the stage | L | **60 frames** | 0 |

Order: N1 -> N2 -> N3 -> N4. N1 and N2 have no art and ship first (owner Q2). N3 can ship
any time after N1 (it needs only the data). N4 needs N1's data and N2's lines only for its
bench shots.

## 1. Decisions

### Owner, 2026-11-02

- **Q2. Ships 1-2 first with no art; then one adult signature pose per species (60 frames)
  as ship 4.** The teen is not drawn (that would be 120 frames).

### First mate, 2026-11-02

- **Q1. A `nature` block in each `species.json`:** `{"clock", "sky", "company", "habit"}`.
  **Pace is derived from `voice.pace`.** **The move comes from Hop's family table**
  (`hop.py` `FAMILY_OF`, plan-2026-11-02-hop-of-the-day.md section 3), not from a field here.
- **Q3. The sky axis is a body reaction only.** Never the word "favourite" (for the pet),
  and never on the same look as the person's own favourite-weather line.
- **Q4. No numeric nudge at all.** Flavour only. No temperament tint, no happiness, no find
  weighting. (The scout's option b and c are out.)

Nothing else is left to the owner; section 13 lists what is open.

## 2. What was checked against the code

Checked at `b38c9852` (the scout read `f2c5e8a8` or earlier). Everything in the scout's
Part 1 held. Items worth the builder's knowing:

- **30 ready species**, each `custom_components/virtual_pet/frontend/sprites/<id>/species.json`.
  The beetle has a sprite folder and a `worlds.json` roster slot but no `species.json`
  (pulled for a redraw); `species.py` loads only a directory with a valid, `ready` file,
  so the game does not have it. Its nature row (section 4) waits.
- **Pace thresholds hold.** All 30 `voice.pace` values were printed: 25-45. The scout's
  rule (>= 40 quick, <= 29 slow, else steady) gives exactly the table in section 4
  (e.g. otter 40 quick, corgi 40 quick, deer 30 steady, hermitcrab 30 steady, axolotl 28
  slow, puffin 38 steady). No `species.json` has a `nature` key yet.
- **The own-pose guards are where the scout said.** `card-tick.js` `_idle`:
  `const own = s.drawn === "child" ? Object.keys(s.species.extras || {}).filter(...)`
  (line 356-357), and the `pose` move reads `s.species.extras[pick(own)]` (line 366).
  `card-moment.js` `_react`: `const poseFrames = s.drawn === "child" && s.species?.extras?.[pose]`
  (line 554). Two more child-only places that **stay as they are**: the house-flag poses
  `card-layout.js:771-776` ("Special poses are drawn for the child; other stages would
  change size") and the clean scene's `squint` at `card-actions.js:144`.
- **The idle cadence is two constants** in `lines.js:50-51`: `IDLE_MIN_MS = 20000`,
  `IDLE_SPREAD_MS = 25000`, used at `card-tick.js:351-353`. The vroom robot's 20-40 s
  cadence is separate and stays.
- **The type's idle adds are `IDLE_ADDS` through `_typeAdds`** (`card-tick.js:343-347`), only for
  a teen or adult; `_idleMoves` (`card-tick.js:232-242`) is the one place that builds the
  list, and calm leaves only `mumble` and `pose`. The species manner joins here, the same
  way.
- **`_lines(s, key, normal, arg, {fresh})`** (`card-tick.js:204`) is the personality layer:
  baby set first (`_babySet`), else the persona list half the time, else the normal line.
  A baby's talk wins over everything; species lines follow the same rule (section 6).
- **The house flags** are `sunny`, `rainy`, `snowy`, `foggy`, `windy`, `fireside`,
  `full_moon` (`home.py:26-38`), carried on `mood.attributes.flags`, which the card reads
  in `_update` (`card-layout.js:505+`). Their traits (`model.py:1533-1541`:
  `sun_lover`, `storm_watcher`, `fog_wanderer`, `fireside` ...) are learned from the house
  and are a separate thing; a species' sky does not touch them.
- **The weather change lines already exist**: the `weather` moment (`card-moment.js:150`,
  `rain_started`, `snow_started`, `sun_out`...), the `today` forecast (`card-moment.js:236-248`)
  and the visit notes. The sky reaction is a different path (section 5) so none of these doubles.
- **The person's favourite-weather line** is the note kind `fav_weather`
  (`ui-copy.js:283`, server `coordinator.py:1898-1912`, once a day on a matching day,
  guarded by `people.said`). The memory plan's M0-b makes it a rotating list in
  `lines-fresh.js`. Q3's "never on the same look" is written against this (section 5).
- **`oncePerDay(name, day)`** (`world.js:447`) is per device per day in `localStorage`
  (once per page load without it). All "once a day" rules here use it, so **nothing is
  saved on the server** and nothing is private data.
- **`FIRST_LOOK_LINES = 3`** (`ui-copy.js:57`): a first look queues at most three lines
  and several things compete for them (wish, dream, today, gift, the cure, catch-up). The
  nature lines are the **lowest priority** there (section 5).
- **`test_species.py`** already loops `READY` species and checks sprite names (lines 35-48,
  where `extras` and `waves` are in the name loop) and that `reactions` point at `extras`
  (lines 83-86). The new data test sits beside them.
- **`waves` is already stage-keyed** (`waves.teen`, `waves.adult`; never `child`). The
  precedent for ship 4's `signature` key.

One discrepancy to remember: the scout's table cites the "fixed quiet hours 21:00-08:00" at
`prefs.js:127-142`; the chirps' quiet hours are there. The idle cadence constants are in
`lines.js`, not `prefs.js`.

## 3. The model

Six facts per species. Five are shown; none changes a number.

| Axis | Values | Where it lives | Shows as |
|---|---|---|---|
| **Clock** | `day`, `dusk`, `night` | `nature.clock` | A line at sunset and one at the morning look; a lighter idle after dark for night creatures. **Sleep hours, chirps and quiet hours never change.** |
| **Sky** | `sun`, `rain`, `snow`, `fog`, `wind`, `fire`, `moon` | `nature.sky` | A **body reaction** (a perk and a short `*action*` line) when its flag is up, once a day. Never "favourite" (Q3). |
| **Company** | `social`, `solo` | `nature.company` | How it meets a world visitor or a link guest. Solo means shy for a beat, never cold. |
| **Pace** | `quick`, `steady`, `slow` | derived from `voice.pace` | The idle cadence (+/-25% at most) and the move mix. |
| **Habit** | `hoarder`, `builder`, `basker`, `groomer`, `explorer`, `watcher`, `performer` | `nature.habit` | The signature: idle moves, action lines, a dream, a field note, and in N4 the pose. |
| **Move** | `hop`, `glide`, `swim`, `dig`, `climb`, `squeeze` | Hop's `FAMILY_OF` | Hop of the Day only. Not repeated here. |

**Body, not voice.** The personality type (8 of them, chosen at teen) keeps the voice:
hellos, compliments, how it asks. The species adds what its body does. A "plucky tortoise"
is a tortoise doing tortoise things, said plucky-ly. They do not compete for one line
(section 6).

**The data shape** (one block per file, beside `voice`):

```json
"nature": { "clock": "day", "sky": "rain", "company": "social", "habit": "groomer" }
```

Four string keys, each from a closed list. No `pace` key: `pace_of(species)` reads
`voice.pace` (>= 40 quick, <= 29 slow, else steady), in one function on each side (the
card, and `species.py` for N3). A species with no `nature` block, or an unknown value,
gets **no nature** (no manner, no lines): a new species cannot break the card or the
server.

## 4. The full species table

All 30 ready species. Pace is derived (the number is `voice.pace`). The last column is
Hop's decided family, **for reading only** (the source is `hop.py` `FAMILY_OF` once Hop's
ship 1 lands; the table in plan-2026-11-02-hop-of-the-day.md section 3 matches this column
row by row). The values in the first five columns are DRAFT for the first mate's eye and
are the values N1 writes.

| World | Species | Clock | Sky | Company | Pace | Habit | Hop |
|---|---|---|---|---|---|---|---|
| woodland | bird | day | sun | social | quick (42) | performer | glide |
| woodland | squirrel | day | wind | solo | quick (44) | hoarder | climb |
| woodland | deer | dusk | fog | social | steady (30) | watcher | hop |
| woodland | fox | dusk | snow | solo | quick (42) | explorer | dig |
| woodland | bananaslug | night | rain | solo | slow (25) | explorer | squeeze |
| terrarium | gecko | night | fire | solo | steady (34) | groomer | climb |
| terrarium | tarantula | night | fire | solo | slow (26) | builder | dig |
| terrarium | tortoise | day | sun | solo | slow (25) | basker | squeeze |
| terrarium | beardeddragon | day | sun | social | steady (33) | basker | hop |
| terrarium | ballpython | night | fire | solo | slow (25) | watcher | squeeze |
| terrarium | **beetle (pending)** | night | rain | solo | n/a | builder | climb |
| hearth | kitten | dusk | fire | solo | steady (38) | groomer | hop |
| hearth | bunny | dusk | fire | social | steady (36) | groomer | hop |
| hearth | corgi | day | snow | social | quick (40) | explorer | dig |
| hearth | hamster | night | fire | solo | quick (45) | hoarder | dig |
| hearth | ferret | dusk | fire | social | quick (44) | hoarder | squeeze |
| tidepool | otter | day | rain | social | quick (40) | groomer | swim |
| tidepool | octopus | night | fog | solo | slow (25) | explorer | squeeze |
| tidepool | seal | day | sun | social | steady (34) | basker | swim |
| tidepool | hermitcrab | night | rain | social | steady (30) | hoarder | climb |
| tidepool | puffin | day | wind | social | steady (38) | builder | glide |
| pond | treefrog | night | rain | social | steady (34) | performer | hop |
| pond | axolotl | night | fog | solo | slow (28) | watcher | swim |
| pond | pondturtle | day | sun | solo | slow (26) | basker | swim |
| pond | duckling | day | rain | social | quick (42) | explorer | swim |
| pond | beaver | night | snow | social | steady (32) | builder | dig |
| nightsky | bat | night | moon | social | quick (45) | performer | glide |
| nightsky | lunamoth | night | moon | solo | steady (30) | performer | glide |
| nightsky | owl | night | fog | solo | slow (27) | watcher | glide |
| nightsky | firefly | night | rain | social | quick (43) | performer | glide |
| nightsky | opossum | night | fire | solo | steady (31) | builder | climb |

**The beetle** is pending its `species.json`. When it returns, its row is `night / rain /
solo / builder` (pace from its own `voice.pace`; the data test covers ready species only,
so the missing file waits harmlessly, as Hop's `FAMILY_OF` does).

**Counts over the 30 ready species:** clock day 10 / dusk 5 / night 15. Sky: fire 8, rain 6
(7 with the beetle), sun 5, fog 4, snow 3, wind 2, moon 2. Company: social 15 / solo 15.
Pace: quick 10, steady 12, slow 8 (counted from the table above and from the 30 files). Habit: explorer 5,
performer 5, hoarder 4, builder 4 (5 with the beetle), basker 4, groomer 4, watcher 4.

Notes on the table:

- Every world mixes clocks, skies and habits, so a household inside one world still sees
  variety. This is what Hop's table cannot do for Night Sky (all four fliers glide): its
  five pets split moon/fog/rain/fire and performer/watcher/builder.
- The sky skews to `fire` because Terrarium and Hearth both live by a warm spot. That is
  fine for flavour, and is one more reason Q4 is "no numeric nudge": fireside and moon
  flags are rarer than sun, so any tie to a number would be uneven.
- Wording: "night" means "comes alive after dark", not "awake all night". A night creature
  sleeps when the house says it does.
- The table is flavour, not biology; a swap is a one-line change in one `species.json`.

## 5. Behaviours

### 5.1 The idle manner (N1)

`_idleMoves` (`card-tick.js:232`) builds the list from the common moves, the type's adds
and the tricks. N1 adds one more source for a **teen or adult**, the same guard as
`_typeAdds`: `SPECIES_ADDS[habit]`, a table in `lines.js`, copies of existing moves only.

| Habit | Adds to the idle list | Why (draft) |
|---|---|---|
| hoarder | `speck`, `speck`, `munch` | busy with small things, a cheek bob |
| builder | `settle`, `wander` | tidies about |
| basker | `settle`, `settle`, `look` | long and slow stretches |
| groomer | `rock`, `settle` | a small tilt is the groom |
| explorer | `wander`, `wander`, `look` | wanders twice as often |
| watcher | `look`, `look`, `look` | looks, holds longer |
| performer | `perk`, `perk`, `rock` | hums and bounces |

**Moves.** `_idle` today handles `mumble pose look wander perk speck hop` (and the
tricks' `spin`/`perk2`, `robot`); `IDLE_ADDS` uses only `mumble hop look perk wander`.
`settle`, `munch` and `rock` are **not idle moves yet but their CSS is already there**
(`.pet.rock`, `.pet.munch`, `.pet.settle`, `style.js:357-362`), so N1 adds three small
`else if` branches that call `_animate(s, s.pet, <class>, ms)` as `perk` does: no new CSS
and no art. (`sway` and `shake` exist only as keyframes of other states, the breeze and
the shiver, and there is no `.pet.sway`/`.pet.shake`; the plan does not use them, and
`sulk` is a shake that reads sad, so it is not used either.) The table is the starting
draft.

**Pace sets the cadence**, scaled from the two constants, +/-25% at most:

| Pace | `IDLE_MIN_MS` / `IDLE_SPREAD_MS` scale |
|---|---|
| quick | x0.8 |
| steady | x1 |
| slow | x1.25 |

It applies from the child up and to teen and adult alike (the baby keeps the common
cadence; its talk is its own). The vroom robot's 20-40 s stays. **Calm or reduced motion:
no change** (`_idleMoves` already returns only `mumble` and `pose` then; the cadence scale
is applied only when not calm, so a calm pet's idle is exactly as today).

The manner and the type's adds are both copies in one list. A cap keeps a pet from becoming
a caricature: the species adds at most **3 copies** in total (the table above has at most
3), and the type's adds are untouched.

### 5.2 The sky reaction (N1)

When the pet's sky flag is up (`sun` -> `sunny`, `rain` -> `rainy`, `snow` -> `snowy`,
`fog` -> `foggy`, `wind` -> `windy`, `fire` -> `fireside`, `moon` -> `full_moon`), the pet
**reacts with its body**: a `perk` (a `settle` for a slow one), and one short `*action*`
line from a two-line list for that sky (14 lines in all). Rules:

1. **Once a day per pet**: `oncePerDay(`sky-${device}`)` (one key, so one reaction a day
   whichever flag; the first flag seen wins).
2. **Body language only (Q3).** The line is an action or an exclamation about the body or
   the moment: "*tail fluffs in the wind*", "warm rock...". It never says "favourite",
   "love", "best", "my kind of day". It never compares to the person.
3. **Never on the same look as the person's own favourite-weather line (Q3).** If this look
   queued a `fav_weather` note (the note kind at `ui-copy.js:283`, the memory plan's M0-b
   rotating list, M1b's door 6 variant), the sky reaction **does not run and does not
   consume its once-a-day key**; it may run at a later look that day that has no such
   line. A "look" is one `_firstLook` burst and its follow-up, or one resumed tab's burst
   (`card-looks.js`). The builder finds the exact queue to check; the acceptance test (section 10)
   pins it.
4. **It rides the idle path, not the change path.** The reaction is one of the idle
   choices when the flag is up and not yet done today, so it never doubles the `weather`
   moment's own line (`rain_started`, `snow_started`, `sun_out`, `card-moment.js:150`) or
   the forecast line. If a `weather` moment line was said in the last 60 s, the reaction
   waits for the next idle.
5. **No dislike.** A sun creature on a snowy day does nothing special; the shared shiver
   pose for the flag is unchanged. Only the pet's own flag reacts.
6. **Skipped** when asleep, lights out, away, resting (the favourite-and-resting plan's
   `resting` flag; a resting pet has its own `RESTING_IDLE` table), sick, in a game, or
   the pet is an egg or a baby.
7. **Calm or reduced motion:** the line only, no `perk`.

### 5.3 The clock lines (N1)

Two moments, each once a day per pet, each one line:

- **Sunset** (`sun.sun` goes `below_horizon`, seen live by the open card, the same state
  `card-layout.js:519` reads for the night scene): a night creature wakes up, a dusk
  creature gets a lively line, a day creature winds down. **Never** a catch-up line (a card
  opened after dark says nothing about sunset).
- **The morning look**: on the day's first `_firstLook` before noon, a night creature is
  groggy and fond, a day creature bright, a dusk creature in between. It takes a first-look
  slot **only if one is free** after the wish, dream, gift, cure and catch-up (section 7).

Never grumpy: the groggy line is "five more minutes..." not "leave me alone". Sleep hours,
the wake time, the chirps and the quiet hours (21:00-08:00, `prefs.js:127-142`) never move.
Ship 1 does not try to make night creatures noisier at night.

### 5.4 Signature behaviours per habit (N2 copy)

Each habit gets a handful of keys. All lines are DRAFT; they are `*action*` lines or short
reactions, and fit 40 characters with the longest fill (the copy scan's rule).

| Habit | Idle | Snack / clean | Find / visitor | Dream |
|---|---|---|---|---|
| **hoarder** (squirrel, hamster, ferret, hermitcrab) | "\*tucks something away\*" with a `munch` | a snack: "saving half for later ♪" | a find: "mine! ...ok, ours ♥" | a mountain of its `food` word |
| **builder** (beaver, puffin, tarantula, opossum) | "\*fixes up the {home}\*" with `settle` | after a clean: "now to tidy my {home}" | link host: "come see my {home}!" | building something big |
| **basker** (beardeddragon, tortoise, pondturtle, seal) | a long stretch, `settle` | its sky flag: "warm rock... ♪" | the morning: "warming up..." | a warm, flat place |
| **groomer** (kitten, bunny, gecko, otter) | "\*grooms\*" with a small `rock` | after a clean: "\*fluffs\* perfect ♪" | the dirty line in its own words | being very tidy |
| **explorer** (fox, octopus, bananaslug, duckling, corgi) | wanders twice as often | a visitor: wanders toward it first | a find: "I went looking and found..." | somewhere new |
| **watcher** (deer, axolotl, ballpython, owl) | `look` often, holds longer | the doorbell or an arrival: "\*ears up\*" | a night idle: "\*watches the stars\*" | a quiet, still place |
| **performer** (bird, treefrog, firefly, lunamoth, bat) | hums or blinks (`fl-glow` / `twinkle` for the light ones) | music playing: joins in with its sound | a won game: its sound as a tune, or a glow | a stage and a crowd |

(The scout's draft day-in-the-life lines for six species are kept in the scout's report;
they were illustrations and are not copied here as final.)

The `{home}` and `{food}` fills come from the species' `words` (`_words(s)`,
`card-visit.js:194`), so a moth's stage words still apply and a species with no home word
falls back to the plain line, never "my undefined".

### 5.5 Company (N2)

How a species meets a world visitor (`card-visitors.js`) or a link guest (`card-link.js`):

- **social:** a bounce (`perk`), then the wave, as today.
- **solo:** it **watches for a beat first** (`look`, about 1 s), then waves with a small
  "...oh! hi". Warm with its own people; never "doesn't like you", never refuses the guest.

This changes timing and one short line only. The existing `waves` frames, the greet text
tables and the kindred pairs (by personality) are unchanged. It never changes who visits,
how often, or what is left behind.

## 6. The non-intrusive rules

1. **Flavour only. No exceptions (Q4).** No species changes a stat, rate, decay, call,
   refusal, sickness, care result, wish, bond, game pay, find count or happiness. There is
   **no temperament tint and no nudge**. The only real species rules are Hop's symmetric
   families and (planned, separately) the moth.
2. **No species is better at care or collecting.** Calls, needs and timers are identical.
   A species never needs more or less.
3. **Nothing punishing.** No axis value produces a sad or reluctant line. A night
   creature's morning is groggy and fond. A solo creature is shy with guests, never cold to
   its person. The sky axis has no "dislike".
4. **Rate caps.** Species action lines are **at most 1 in 4** of a pet's idle lines. One
   sky reaction per day. One sunset line and one morning line per day. The idle cadence
   changes by at most +/-25%. The species adds at most 3 copies to the idle list.
5. **Body, not voice.** Species lines are `*action*` lines and short reactions. The
   personality type keeps the voice. In `_lines` the order is: baby set (wins everything);
   else the persona list at its 50% roll; else, only on the lines the persona did **not**
   take, the species list at 1 in 4 (section 8). A line is never both.
6. **Babies get none.** A baby keeps its baby talk (`_babySet`). A child gets the lines and
   the cadence (it already has its own poses); the teen and adult also get the idle manner
   and, in N4, the signature pose.
7. **Not while the pet's state owns the screen:** asleep, lights out, away, resting, sick,
   in a game, an egg; a game's prompt owns the bubble. This is the existing idle gate
   (`_free(s)`) plus the `resting` flag.
8. **Calm or reduced motion:** no new movement, lines only (as `_idleMoves` does now).
9. **Nothing private.** The nature is a species fact. It reads no person's data, stores
   nothing on the server, and nothing about it joins an entity, bus event or log. No privacy
   table applies. (The "once a day" keys are `localStorage`, as every other card
   once-a-day.)
10. **Status screen, calls, notifications, quiet hours: unchanged.** The axes must never look
    like stats or ratings; the field note (N3) is the only place they are named, as prose.

## 7. Priority in a first look

`FIRST_LOOK_LINES = 3`. The order is unchanged for everything that exists. The nature
lines come **last**, taking a slot only if one is free:

wish / dream / gift / cure / catch-up / the memory plan's doors / the follow-up >> **the
morning nature line**.

The sky reaction and the sunset line are not first-look lines. They ride the idle path and
the live sun state (sections 5.2, 5.3), so they cannot displace a first-look line.

## 8. The ships

### N1: the data, the manner, the sky and clock (card + data, tier 1, S-M)

- **Data.** A `nature` block in all 30 `species.json` (section 4). The README gets one row
  (`nature`) and a line saying pace is derived. A **data test** in `tests/test_species.py`:
  every ready species has a `nature` with exactly the four keys, each from its closed list;
  `voice.pace` is an int in 20-50 (the derivation needs it); the counts do not drift
  silently (a table of expected values is the test's data, so a change to one species is a
  deliberate diff).
- **Card.** `nature(s)`/`paceOf(s)` helpers in `lines.js`; `SPECIES_ADDS` there;
  `_idleMoves` and the two cadence lines in `_idle` use them. The sky reaction and the clock
  lines are small methods in `card-moment.js` (where the moments live) called from the idle
  path and from `_firstLook`. No new part in `manifest.txt` is needed; if a part grows past
  its neighbours the builder may add `card-nature.js` between `card-moment` and
  `card-status` (the class is an extends chain; the new link goes in the chain order, so it
  is a TDZ-sensitive reorder: card-check, not `node --check`).
- **Copy (DRAFT, about 20 lines):** sky 7 x 2 = 14; clock 3 clocks x (sunset, morning) = 6.
  In `lines-fresh.js` with a `COPY_TABLES` entry in `scripts/copy-scan.js`, so the scan
  checks them (no nagging words, 40 characters with the longest fill, no `?` outside a
  question, no `!!!`, no digits). The scan's nag list includes **"still" and "again"**;
  these lines avoid both.
- **No server, no save, no art.**

### N2: the action-line layer, company, dreams (card only, tier 1, M)

- **Lines.** A species layer in `_lines`: a `SPECIES_LINES[habit][key]` table and a
  helper `_natureLine(s, key)` that returns an action line or `null` (a missing key is
  `null`, so a habit with nothing for a key says its normal line). Keys: `idle`, `snack`,
  `clean`, `find`, plus `visit` and `host` for company. The 1-in-4 roll is taken **after**
  the persona's roll fails to take the line (section 6, rule 5). `fresh` lines keep their
  "never the same twice" rule via `_fresh`.
- **Company** (section 5.5): a `look` beat before the wave for solo species, a `perk`
  for social; two short lines.
- **Dreams.** One dream per habit in the dream copy (`card-moment.js` dreams,
  `lines-fresh.js`), picked on the morning when the pet has no plainer dream to tell. The
  dream pick stays the server's (`model.PLAIN_DREAMS`); the card only colours the
  fill, so **no server change** and no new dream kind. (If that proves not to fit the
  existing pick, the dream line is dropped from N2, not the server changed.)
- **Copy (DRAFT, about 46 lines):** 7 habits x 6 keys (idle, snack, clean, find, visit or
  host, dream) = 42; company 2 x 2 = 4.
- **Hop:** the habit win line for a Hop game (the explorer's "I went looking...") is **not**
  in N2; Hop's own ships own the game's lines. A later copy pass may add it once Hop 3b has
  landed.

### N3: the field note and the Assist note (data + card, tier 1, S)

- **Field note.** One line per species in the creature book (the forms book's four
  portraits, `card-journal.js`), e.g. "comes alive at dusk · perks up in the rain · keeps a
  stash" (draft). It is **built from the `nature` block with a small template**, not 30
  free-written strings, so a new species gets one for free: `clock` phrase, `sky` phrase,
  `habit` phrase. Copy: three phrase tables (3 + 7 + 7 = 17 phrases) and the join, not 30
  lines; the 30 notes are what the table produces and the bench shows them all. If the first
  mate wants hand-written notes, it is 30 lines instead.
- **Assist.** `species.py` carries `nature` through the catalog (it loads `species.json`
  already); `intent.py` adds one short species note to the status data (the slot at
  `intent.py:268` already carries `species`): "a night creature, fond of rain" (draft),
  built from the same phrases. One sentence in the LLM `PROMPT` (`llm.py`, no braces in it,
  as the module's rule) tells the model to colour, not to quote, the note. `spoken_status`
  stays unchanged. The note names the species, not any person.
- No saved state, no new entity, no new service.

### N4: the adult signature pose (art, L)

- **What.** One adult pose per species, 2 frames: **30 x 2 = 60 frames**. (The owner's Q2:
  adult only. The teen has none.)
- **Format.** A new optional `species.json` key `signature`, stage -> list of sprite names,
  the way `waves` is stage-keyed: `"signature": { "adult": ["adult_cache_1", "adult_cache_2"] }`.
  **`extras` and `reactions` are not changed** (every consumer reads them as child poses:
  `test_species.py:45, 83-86`, `card-tick.js:356-366`, `card-moment.js:554`,
  `card-layout.js:771-776`), so no existing file and no existing test shifts. The test
  loops `signature` into the sprite-name check and requires its stage to be in `stages`
  and not `baby` or `child`.
- **Code.** (a) `card-tick.js` `_idle`: `own` adds the species' `signature` pose for the
  drawn stage (so the `pose` move is no longer child-only); the frames line (366) reads
  from `signature` for that name. (b) `card-moment.js` `_react`: the guard at line 554
  learns the stage: for a teen or adult it plays the `signature` pose, **only for `won`
  and a snack**, the reactions the child's `reactions` map already ties to a pose, for 2.5 s;
  the child path is untouched. The house-flag poses (`card-layout.js:771`) and the clean
  scene's `squint` (`card-actions.js:144`) **stay child-only**.
- **Cadence.** The pose is two `pose` copies in the idle list as the child's are (so about 1
  in 8 idle moves), and a pose never plays inside the 1-in-4 action-line cap.
- **Copy:** none.

#### Ship 4's art brief inputs

Each pose is **the habit made visible**. Where the child's own poses (names below, from
every `species.json`'s `extras`, not counting the six shared house poses) already hold the
idea, the adult **redraws that idea at adult size**, so the pet looks like the same
character grown up. Eight are new ideas (marked **new**).

| Species | Habit | Adult signature pose | From the child's own poses |
|---|---|---|---|
| bird | performer | `sing` **new** | (child has `birdwatch` only) |
| squirrel | hoarder | `cache` | `cache` |
| deer | watcher | `flag` | `flag` |
| fox | explorer | `pounce` | `pounce` |
| bananaslug | explorer | `slime_slide` | `slime_slide` |
| gecko | groomer | `eye_lick` | `eye_lick` |
| tarantula | builder | `web_mend` **new** | (`wave`, `hair_flick`, `molt`) |
| tortoise | basker | `neck_sun` **new** | (`hide`, `dig`, `munch`) |
| beardeddragon | basker | `bask` | `bask` |
| ballpython | watcher | `tongue_flick` | `tongue_flick` |
| kitten | groomer | `lick_paw` **new** | (`knead`, `loaf`, `zoomies`) |
| bunny | groomer | `ear_wash` **new** | (`binky`, `flop`, `thump`) |
| corgi | explorer | `ball_fetch` | `ball_fetch` |
| hamster | hoarder | `cheeks` | `cheeks` |
| ferret | hoarder | `stash` **new** | (`war_dance`, `tunnel`, `dook`) |
| otter | groomer | `float_groom` **new** | (`rock`, `hold_paws`, `kelp_wrap`) |
| octopus | explorer | `jar` | `jar` |
| seal | basker | `banana` | `banana` |
| hermitcrab | hoarder | `shell_try` | `shell_try` |
| puffin | builder | `fish_bill` | `fish_bill` |
| treefrog | performer | `croak` | `croak` |
| axolotl | watcher | `gill_flutter` | `gill_flutter` |
| pondturtle | basker | `bask` | `bask` |
| duckling | explorer | `bottoms_up` | `bottoms_up` |
| beaver | builder | `stick` | `stick` |
| bat | performer | `echo` | `echo` |
| lunamoth | performer | `glow` | `glow` |
| owl | watcher | `head_turn` | `head_turn` |
| firefly | performer | `blink` | `blink` |
| opossum | builder | `leaf_bundle` **new** | (`play_dead`, `hiss`, `tail_curl`) |

(The pose names are DRAFT; the first mate or the art lead may swap any. The bird's child
pose list is a single pose, so its adult gets a new idea.)

**Stage-keyed extras and sprite names.** `adult_<pose>_1.png`, `adult_<pose>_2.png`, on the
species' own art grid (the grid test `test_every_creature_frame_is_on_the_species_art_grid`
already runs over every sprite in the folder), at the species' adult `scale`. The eyes and
head point must stay near `head.adult`, so trait flair (`card-flair.js:45`) and the costume
sit right; a pose whose head moves far from it needs an entry the way `hat` handles
`adult_dirty` (README `hat`: a pose key overrides the stage's point, `null` means no hat
fits). Costumes show only in idle moods and the child's weather and TV poses
(README), so a signature pose normally shows no costume; the bench checks it.

**The art budget.** 60 frames is about 30 image calls if a call gives a pair, more if not.
The codex image cap (`codex-image-cap`: about 100 per 5 h, under about 300 a day) makes this
one to two days of budget, run as a normal art ship through the first mate's art review. The
art goes in `private-content` as every art does; no file of it is committed here.

## 9. Interaction with Hop and the memory plan

**Hop of the Day** (plan-2026-11-02-hop-of-the-day.md):

- Hop's species -> family table is the **only** place a species becomes a rule. Nature adds
  none. The two share no code: nature reads `species.json`, Hop reads its own `FAMILY_OF` in
  `hop.py`. The nature test does not import Hop; Hop's test does not read `nature`.
- Nature gives the four Night Sky fliers four different manners, which Hop's single `glide`
  cannot (moon, fog, rain, fire; performer, watcher, builder). That is the point of the
  `habit` column.
- Hop's win and tidy lines stay in Hop's ships. Nature may add a habit flavour to them
  **after** Hop's 3b lands, as a copy pass, not in N1-N4.
- A Hop board is a game: `s.game` is on, so sky, clock and action lines do not run (rule 7).

**The memory plan** (plan-2026-11-02-memory.md):

- **Q3 (above) is written against its M0-b/M1b `fav_weather` list.** The sky reaction checks
  the look's queue for a `fav_weather` note and skips (section 5.2, rule 3).
- **The two voices never share a line.** The memory plan's doors are spoken lines about the
  person ("since you told me...", the ask); nature lines are body lines. Nature never reads
  `mine`, the people store or any memory field, and says nothing about a person.
- **Slots.** The memory doors, the wish, the dream and the gift all outrank the morning
  nature line (section 7). It takes only a free slot.
- **Copy scan.** Both plans' lines go in `lines-fresh.js` with a `COPY_TABLES` entry; the
  scan's nag list ("still", "again") binds N1-N3 as it binds M0-b. N1's builder adds the
  entry; the memory plan's M0-b builder owns `fav_weather`'s.
- **Privacy.** The memory plan's privacy table (its section 10) does not apply to nature:
  nothing here is per person, on disk, or on any entity.

**The favourite-and-resting plan:** a resting pet has its own `RESTING_IDLE` table and a
`resting` flag; nature lines and the manner do not run while it rests (rule 7). Nothing
else meets.

**Moths don't eat** (planned part B, no plan yet): unchanged, a real species rule with its
own plan. The lunamoth's `performer / moon / solo` row has no hunger or food content.

## 10. Acceptance criteria

### Bench shots (`scripts/bench.js`; the default for any look, per AGENTS.md)

The bench pins a clock (`time`) and flags (`pet.flags`) and has `idle` and `look` hooks, so
the following need no Home Assistant. The builder adds what it cannot yet pin (a `sky`
and `clock` hook, or `pet.flags` with `time`) to the bench, not to a throwaway HA.

- **N1:** a `--preset nature`: per world at 330, an adult for each of the 7 skies with its
  flag up and the reaction line in the bubble (14 shots across the roster is enough: one
  shot per sky); a sunset line and a morning line for one species per clock (3 x 2); the
  same pet at calm. Every line fits the 330 px bubble. A baby and a child shot show **no**
  nature line.
- **N2:** a species-line shot per habit (7), a solo and a social visitor greeting (2 x the
  `visitors` preset's shape), a link host line for the builder, a dream per habit. Mono
  mode and big text for one.
- **N3:** the creature book at 420 and 330 for one species per world and the longest note;
  the Assist output is a test, not a shot.
- **N4:** a `--preset signature`: all 30 species, adult, both frames, 330 and 420; one
  contact sheet per world; with a seasonal costume on, with a flair on, and with the pose
  mid-move (`petAt`); a night and a mono pass for the whole 60. The art review reads the
  contact sheets and the diff, not 60 single shots.

### card-check cases (a real HA, behaviour only)

Sections that exist (`--list`): `moments`, `personality`, `types`, `visitors`, `infrared`,
`react`, `pat`, `care`, among others. N1/N2 run `moments personality types visitors
infrared`; N4 adds `react pat care`. New cases (sections named by the builder):

- **No nature line at baby**, and a baby set wins a key over a species line.
- **The sky reaction runs once** for a flag and **not twice in a day**, across a reload
  (`localStorage`).
- **The sky reaction skips** a look that has a `fav_weather` note, **and runs on a later
  look** that day (the key unconsumed).
- **No sky reaction** while asleep, lights out, away, resting, in a game.
- **The cadence** of a quick and a slow species differs, and calm leaves both as today.
- **The solo species' visitor greet** has the beat before the wave; the social one does not.
- **No server call** from any nature behaviour (the card-check stubs count calls: none new).
- N4: the idle `pose` move plays `signature` for an adult and nothing for a baby; `won`
  and a snack play it for a teen or adult; the house-flag pose for an adult is unchanged
  (still no pose at adult).

### Tests

- **Python (data test), N1:** every ready species has a valid `nature`; `voice.pace` derives
  the pace table of section 4; the exact table is the test's data (a changed row is a
  deliberate diff). A species with no `nature` is allowed (the beetle) and gives none.
- **Python, N3:** `species.py` carries `nature`; `intent.py`'s status data has the species
  note, and `spoken_status` is byte-for-byte unchanged (a golden); the LLM prompt has no
  braces added.
- **Python, N4:** every `signature` sprite exists, its stage is in `stages` and is not
  `baby` or `child`, and the existing grid test covers the frames.
- **JS (`node --test tests/js`):** a `nature_lines.test.js` reading the card source as
  `dream_lines.test.js` does: every sky has 2 lines, every clock 2, every habit all its keys
  (or an explicit `null`); none has a nagging word, a `?`, a digit, "favourite", "favorite"
  or more than 40 characters with the longest fill; `paceOf` thresholds; `SPECIES_ADDS`
  names only moves `_idle` handles and at most 3 copies; the first-look priority
  (the morning nature line is last); a missing nature gives nothing.
- **Copy scan** (`scripts/copy-scan.js`) passes with the new tables named in `COPY_TABLES`.
- **Save:** an existing save loads unchanged (nothing saved by nature); `PetState` unchanged
  (a diff check in review).

## 11. Copy budget

All lines **DRAFT**; the first mate approves them. The count is the plan's, not a limit on
the builder's fewer.

| Ship | Lines | Made of |
|---|---|---|
| N1 | about 20 | sky 7 x 2 = 14; clock 3 x 2 = 6 |
| N2 | about 46 | 7 habits x 6 keys = 42; company 2 x 2 = 4 |
| N3 | 17 phrases, 30 notes built; or 30 hand-written; plus 1 prompt sentence | clock 3, sky 7, habit 7 |
| N4 | 0 | art only |
| **Total** | about 83 lines, plus the notes | |

Each line: 40 characters at most with the longest fill, no digits, no `?` outside a
question, no `!!!`, none of the nag words (the scan's list). The builder lists the working
text in the report, as the dig's and Hop's did.

## 12. Save and risk

- **Save impact: none for N1-N4.** The nature is read from `species.json` by species id.
  Nothing is saved on the pet or the server; the once-a-day keys are `localStorage`. An
  old save, an old card and a new server (or the other way round) all work: an old card
  ignores an unknown `nature` key, and a new card with an old server still reads it from
  the frontend files it is served with.
- **A card update is needed to see anything**; HA needs a restart for a new card build
  (AGENTS.md).
- **Risk: a pet that feels scripted.** The caps (1 in 4, once a day, +/-25%) are the guard;
  the bench contact sheet and a day's real use judge it. If a species reads too busy, the
  fix is a smaller table, not a new rule.
- **Risk: the sky line is mistaken for "a favourite".** Copy review (the scan fails the
  word "favourite") and Q3's look rule are the guards.
- **Risk: art cost.** N4 is optional in spirit: N1-N3 stand without it, and N4 can be done
  a world at a time (the `signature` key is optional per species).
- **Risk: `card-tick`'s `own` list changes shape for N4**, and `_idle` is the card's busiest
  function; the change is a few lines but needs the `react` and `pat` sections, listed above.

## 13. Open questions

Only what is truly open:

1. **The pose names and the 8 new pose ideas in N4** (section 8). The names are the plan's
   draft; the art lead or the first mate may swap any before the art is drawn.
2. **Hand-written field notes (30) or the template (17 phrases)** for N3. The plan
   defaults to the template (a new species gets one free); the first mate may want the
   hand-written voice.
3. **Whether the first mate wants the habit flavour in Hop's win lines** (a later copy pass
   after Hop 3b). Not blocking: nothing in N1-N4 depends on it.

Not open (decided above): where the axes live (Q1), the art order (Q2), the sky wording and
look rule (Q3), no numeric nudge (Q4).

## 14. Adversarial review checklist

For the reviewer of this plan, and again of each ship. Each is a question to answer with a
file and line, not a feeling.

1. **Flavour only.** Search the diff for any read of `nature` in `model.py`, `rates.py`,
   `coordinator.py` (beyond the species catalog), or any rng draw. There must be none. Is
   `PetState` byte-for-byte unchanged? Would a seeded test shift?
2. **Q3, the word.** Do any sky lines, field notes or the Assist note use "favourite",
   "favorite", "love", "best" for the pet's sky? Does the copy scan fail the word?
3. **Q3, the look.** Walk a morning with a favourite-weather note queued: does the sky
   reaction run on that look? Does it eat its once-a-day key? Does it run later? Does the
   M0-b rotating list and M1b's door 6 variant both count as the person's line?
4. **Doubling.** Can the sky reaction fire on top of a `weather` moment line or the
   forecast? What stops it within the 60 s window? What about the fan flag and the
   `fireside` house effect?
5. **Slots.** Can the morning nature line ever push out a wish, a dream, a gift, a cure, a
   catch-up line, a memory door or a follow-up? (The order is in section 7.)
6. **Babies and children.** Does a baby ever get a nature line, manner or cadence? Does the
   child get the manner (it should not, only the cadence and lines)? Is there a stage test?
7. **Calm.** Reduced motion and calm: no new movement, and the cadence scale off? Is the
   test real (it fails if the scale is applied in calm)?
8. **The caps.** 1 in 4 of idle lines: counted over which lines? Can the species roll and
   the persona roll together exceed it? Over a day, how many nature lines can a pet say?
   (Compute the worst case.)
9. **The 3-copy cap** on `SPECIES_ADDS` and the type's adds together: can an idle list be
   dominated by one move? (List the longest list.)
10. **Clock honesty.** Does any line, rate, chirp, call or sleep time depend on `clock`? A
    night creature must still sleep at the house's hours and be quiet in the quiet hours.
11. **Resting, away, sick, asleep, lights out, game, egg:** each blocks every nature
    behaviour? Is there a test per state?
12. **Priority of personality vs species** in `_lines`: is a persona line ever replaced by a
    species line that was not rolled? Is the roll after the persona's, and is `fresh`'s
    "never the same text twice" still true?
13. **Company.** Is a solo greet ever cold, refusing, or sad? Does the beat delay a
    visitor's own timers (`card-visitors.js`) or the link visit's handshake
    (`card-link.js`) enough to break a state (a timeout, a double greet)?
14. **Data.** Closed lists enforced in Python? A bad value gives no nature, not a crash?
    A species with no `nature` (the beetle) still renders? Does the table in section 4 match
    the files exactly, and `voice.pace`'s derivation match it?
15. **Server.** N3 only: does `intent.py` leak anything per person? Is `spoken_status`
    unchanged? Do the LLM prompt braces stay out (`str.format`)?
16. **N4 format.** `signature` stage-keyed and optional: no existing file changes without
    it? `extras`, `reactions` and their tests untouched? The child path in `card-tick.js`
    and `card-moment.js` byte-identical for a child?
17. **N4 art.** Does each pose keep the head near `head.adult` (flair, costume)? Are the
    two frames on the species' grid? Does a seasonal costume or a trait flair sit wrongly on
    a pose? Is the whole set read on a contact sheet at 330, in mono and at night?
18. **N4 reactions.** Does a won game or a snack really need the signature pose, or is the
    idle enough? (If the reaction creates a clash with `acts.cheer` or the care scenes in
    `card-actions.js`, drop it.)
19. **Load order.** If a `card-nature.js` part is added, was `node scripts/card-check.js`
    run, not `node --check`? Is the class chain order right?
20. **Hop and memory.** Does any nature code read `FAMILY_OF`, `hop_day`, `mine`, a memory
    field or a person? (None should.) Do the two plans' copy tables collide in
    `COPY_TABLES`?
21. **The counts.** Re-derive the section 4 counts from the table (clock 10/5/15; sky 8/6/5/4/
    3/2/2; company 15/15; pace 10/12/8; habit 5/5/4/4/4/4/4). Do the copy budgets in section 11
    add up to the ship lines?
22. **Docs the build updates.** `sprites/README.md` (the `nature` and `signature` rows, and
    the "extras are drawn for the child" line stays true), `docs/features.md`, the bench
    README for any new preset or hook, and the card-split table if a part is added.
