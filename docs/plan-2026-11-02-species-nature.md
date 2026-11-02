# Plan: species nature, 2026-11-02 (build plan)

**Status: PLAN, docs only (tier 0).** Written by s2730 from scout s2728's report
(`~/.local/state/crew/archive/hatch-at-home-s2728-20261102-1414/report.md`) and the
decisions of 2026-11-02 (section 1). Every file:line claim in the scout's report was
re-checked against `origin/main` `b38c9852`; where the code differs, section 2 says so.
**Revised by s2736** to fold in the adversarial review s2733 (3 blockers, 10 should-fix,
5 nits; each checked against the code first). Section 15 lists every finding and what
became of it.
Names win over line numbers. **Every pet line, field-note and pose name here is DRAFT**
until the first mate approves it (decisions-2026-10-28.md, "How the crew works with the
owner"). No final player copy is in this plan.

The build is four ships. **Ships 1-2 are tier 1** (card and data; flavour only; no saved
field, no stat, no rate). **Ship 3 is tier 1 with a small server change** (one species-note
map and one Assist slot; the gate is `scripts/ci-gate`, section 8). **Ship 4 is art** (tier 1
for the code, the art goes through the art review). Nothing here touches `PetState`.

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
| **N1** | `nature` block in all 30 `species.json`, README row, data test. The idle manner (habit and pace reweight the existing idle moves, cadence by pace). The sky body reaction. The clock flavour, as variant lines on the **existing** `sunset` and `good_morning` moments | S-M | none | about 20 |
| **N2** | The species action-line layer in `_lines` (idle, snack, clean, find), the company manner on visitor greet and link host | M | none | about 40 |
| **N3** | A hand-written field note per species on the status page (the pet's own species), and the same note in the Assist status data. **Server change** (a coordinator map, an `intent.py` slot, a prompt sentence) | S-M | none | 30 notes + 1 prompt sentence |
| **N4** | One adult signature pose per species (30 species x 2 frames = 60 frames), `signature` in `species.json`, the idle `pose` move learns the stage. **No reaction path** | L | **60 frames** | 0 |

Order: N1 -> N2 -> N3 -> N4. N1 and N2 have no art and ship first (owner Q2). N3 can ship
any time after N1 (it needs only the data). N4 needs N1's data and N2's lines only for its
bench shots. **N1's 30-file `species.json` edit lands after the open `art-128-*` branches
merge** (section 8, "Merge order").

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
- **Pose names stay as drafted** (section 8, N4's table).
- **The field notes are 30 hand-written lines, not a template.** A new species needs a
  note written; without one it simply has none.
- **Hop's win lines stay plain.** Nature adds no habit flavour to them, now or later.

(The last three are recorded from the s2736 brief, which lists them as decided; the first
mate dates them.)

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
  Two more mechanisms already react to the same flags and are **separate things** the sky
  reaction must not stack on: the trait flair (`card-flair.js`: `storm_watcher`,
  `sun_lover`, `fireside`) and the `REASONS` bubble lines (`home.py:20-41`: "snow!! snow!!",
  "all misty out there"). Section 5.2, rule 4.
- **The sunset and the morning already have moments, persona-voiced.** The server emits
  `sunrise`, `sunset` and `good_morning` (`home.py:435-441`, `coordinator.py:138-140`,
  `coordinator.py:1034`) and the card says them in `card-moment.js:107-119`:
  `good_morning` with a stretch, `sunset` through `this._lines(s, "sunset", ...)`, `sunrise`.
  The morning has `_wakeLine` (`card-moment.js:441-445`); the sunset has its bedtime
  callback `_nightLine` / `NIGHT_SUNSET` (`card-moment.js:451-466`, `lines-fresh.js:145`).
  There is **no live `sun.sun` watcher**; the card reads that state only at render time
  (`card-layout.js:524`, `card-build.js:501,603`). The clock flavour hangs on these moments
  (section 5.3); it builds no detector and no second line.
- **The care scenes and the reactions already have stage art.** A teen or adult taking a
  feed, snack, praise or won game goes down the `else` branch of `_react`
  (`card-moment.js:559-567`) and plays `acts.eat` / `acts.cheer` through `_reactFrames`
  (`STAGE_POSES`, `ui-copy.js:415`). All 30 species list `eat`, `cheer`, `pat`, `refuse`
  for baby, teen and adult, and open art branches (`art-128-aww`, `-ready`, `-acts-r2`) add
  `aww`, `ready` and more `eat`/`cheer`. N4 leaves all of it alone (section 8, N4).
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
- **`waves` is already stage-keyed** (`waves.baby`, `waves.teen`, `waves.adult`; never
  `child`; `README.md:21`, `test_species.py:50-52`). The precedent for ship 4's `signature`
  key.

One discrepancy to remember: the scout's table cites the "fixed quiet hours 21:00-08:00" at
`prefs.js:127-142`; the chirps' quiet hours are there. The idle cadence constants are in
`lines.js`, not `prefs.js`.

## 3. The model

Six facts per species. Five are shown; none changes a number.

| Axis | Values | Where it lives | Shows as |
|---|---|---|---|
| **Clock** | `day`, `dusk`, `night` | `nature.clock` | A clock-flavoured variant of the existing sunset and good-morning lines. **Sleep hours, chirps and quiet hours never change.** |
| **Sky** | `sun`, `rain`, `snow`, `fog`, `wind`, `fire`, `moon` | `nature.sky` | A **body reaction** (a perk and a short `*action*` line) when its flag is up, once a day. Never "favourite" (Q3). |
| **Company** | `social`, `solo` | `nature.company` | How it meets a world visitor or a link guest. Solo means shy for a beat, never cold. |
| **Pace** | `quick`, `steady`, `slow` | derived from `voice.pace` | The idle cadence (+/-25% at most) and the move mix. |
| **Habit** | `hoarder`, `builder`, `basker`, `groomer`, `explorer`, `watcher`, `performer` | `nature.habit` | The signature: idle moves, action lines, a field note, and in N4 the idle pose. (No dream: dreams are the server's pick, section 8, N2.) |
| **Move** | `hop`, `glide`, `swim`, `dig`, `climb`, `squeeze` | Hop's `FAMILY_OF` | Hop of the Day only. Not repeated here. |

**Body, not voice.** The personality type (8 of them, chosen at teen) keeps the voice:
hellos, compliments, how it asks. The species adds what its body does. A "plucky tortoise"
is a tortoise doing tortoise things, said plucky-ly. They do not compete for one line
(section 6).

**The data shape** (one block per file, beside `voice`):

```json
"nature": { "clock": "day", "sky": "rain", "company": "social", "habit": "groomer" }
```

Four string keys, each from a closed list (the field note of N3 is a sibling key, `field_note`, outside this block). No `pace` key: `pace_of(species)` reads
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
- **Reach of the sky axis (checked in `home.py`).** `sun`, `rain`, `snow`, `fog` are one
  `elif` chain (`home.py:245-256`): exactly one is up at a time, and only while the house
  has that weather. `wind` rides any weather. `fire` needs a configured fireplace entity
  (`home.py:260-262`) and `moon` needs the full-moon window (`home.py:196-211`, a 3-night
  window with the sun down, when the pet is often asleep or in quiet hours). So the 8
  `fire` and 2 `moon` species (a third of the roster) show their sky rarely, and in a home
  with no fireplace never. **That is stated, not hidden**: it is flavour, and a species still has
  its habit, clock and company every day. Whether to accept it or swap those species to a
  sky that needs no extra sensor (the one-line change above) is the first mate's
  (section 13, Q3).

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
| explorer | `wander`, `wander`, `look` | wanders three times as often (the base list has one `wander`) |
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

**Rules for the builder that the existing card-check idle tests need** (the tests mock
`Math.random` in a fixed order, `scripts/card-check.js:7541-7546`, babies at `:6325`):

- `mumble` stays element 0 of `_idleMoves`. The draws are, in order: the delay, then the
  move (0 picks `mumble`), then the persona coin. **The cadence scale and the sky check
  draw no `Math.random` before those two.** The scale is a multiplier on the two
  constants, not a draw.
- The species roll (section 5.4) runs **after** the persona coin, and only in the `mumble`
  branch. A test key whose persona has no list would otherwise see the species line where
  it expects the normal line (`NORMAL_GREET`, "hehe!"/"wheee"). The builder updates those
  card-check expectations in the same ship, and says so in the report.
- **"Idle life happens by itself"** (`card-check.js:3384-3390`) waits 225 x 400 ms = 90 s.
  Its first idle is due at 10-35 s and the next 20-45 s later; with a slow species (x1.25)
  the worst case is about 100 s. The builder re-times that window (or pins the dev pet's
  species to a steady one); the dev pet's species decides it.
- The sky reaction spends a once-a-day `localStorage` key. Under card-check the key is
  **pre-spent in the sections' setup** (the suite has no such switch today, so the
  builder adds that one line), so a dev house with a flag up does not change the first
  idle line in `types` and `personality`. The sky cases are tested on the bench and in JS
  (section 10), where the flags are pinned.

The manner and the type's adds are both copies in one list. A cap keeps a pet from becoming
a caricature: the species adds at most **3 copies** in total (the table above has at most
3), and the type's adds are untouched.

**What the adds do to the mix.** A line is said only in the `mumble` branch
(`card-tick.js:391-409`), so every add lowers `mumble`'s share. The list for a content
adult without a pose is `mumble, look, look, wander, perk, speck` (6 moves, `mumble` 1 in
6); three `look` copies for a watcher make it 9 (1 in 9). That is intended (a watcher
talks less, looks more), and it is why the line cap in section 6 is defined on the
`mumble` branch, not on all idle moves.

### 5.2 The sky reaction (N1)

When the pet's sky flag is up (`sun` -> `sunny`, `rain` -> `rainy`, `snow` -> `snowy`,
`fog` -> `foggy`, `wind` -> `windy`, `fire` -> `fireside`, `moon` -> `full_moon`), the pet
**reacts with its body**: a `perk` (a `settle` for a slow one), and one short `*action*`
line from a two-line list for that sky (14 lines in all). Rules:

1. **Once a day per pet**: `oncePerDay(`sky-${device}`)` (one key, so one reaction a day
   whichever flag; the first flag seen wins). The key is spent on the first idle that
   reacts, so it is a no-op under card-check (section 5.1).
2. **Body language only (Q3).** The line is an action or an exclamation about the body or
   the moment: "*tail fluffs in the wind*", "warm rock...". It never says "favourite",
   "fond of", "love", "best", "my kind of day". It never compares to the person. (The
   same wording rule binds the field notes, section 8 N3: "perks up in rain", not "fond of
   rain", because a model rephrases "fond of" as "loves".)
3. **Never on the same look as the person's own favourite-weather line (Q3).** If this look
   queued a `fav_weather` note (the note kind at `ui-copy.js:283`, the memory plan's M0-b
   rotating list, M1b's door 6 variant), the sky reaction **does not run and does not
   consume its once-a-day key**; it may run at a later look that day that has no such
   line. A "look" is one `_firstLook` burst and its follow-up, or one resumed tab's burst
   (`card-looks.js`). The builder finds the exact queue to check; the acceptance test
   (section 10) pins it, in a JS test with a stubbed queue (the note is server-made, so no
   fixture is needed, section 10).
   **Residual, by design:** Q3 says "the same look", not "the same day". The person's
   `fav_weather` note is made once a day (`coordinator.py:1898-1912`, matching
   `_weather_now`), so a rain pet can still react to rain minutes later, at an idle, on
   the day the person's own favourite was rain. That is allowed. The first mate may tighten
   it to "not on a day the note was said" (one more check on the same queue); section 13,
   Q3.
4. **It rides the idle path, not the change path.** The reaction is one of the idle
   choices when the flag is up and not yet done today, so it never doubles the `weather`
   moment's own line (`rain_started`, `snow_started`, `sun_out`, `card-moment.js:150`) or
   the forecast line. If a `weather` moment line or a `REASONS` bubble was said in the
   last 60 s, the reaction waits for the next idle. The card keeps **no such timestamp
   today** (`card-moment.js:150` stamps nothing); the builder adds one field
   (`s.skySaid = Date.now()`, set where those lines are said) and tests it. The trait
   flair (`storm_watcher`, `sun_lover`, `fireside`, `card-flair.js`) is a picture, not a
   line, and may show with the reaction; the bench checks the two together read well.
5. **No dislike.** A sun creature on a snowy day does nothing special; the shared shiver
   pose for the flag is unchanged. Only the pet's own flag reacts.
6. **Skipped** when asleep, lights out, away, resting (the favourite-and-resting plan's
   `resting` flag; a resting pet has its own `RESTING_IDLE` table), sick, in a game, or
   the pet is an egg or a baby.
7. **Calm or reduced motion:** the line only, no `perk`.

### 5.3 The clock flavour (N1)

The sunset and the morning **already have moments** (section 2): `sunset` and
`good_morning` in `card-moment.js:107-119`, said through `this._lines(s, key, ...)`, so
already persona-voiced; `sunrise` is a plain `pick`. The clock flavour is a **variant line
list on those same cases, chosen by `nature.clock`**. It adds no `sun.sun` watcher, no
second line per sunset, no second morning line and no first-look slot.

- **`sunset`** (the existing case): the line list is chosen by `clock`: a night creature
  wakes up, a dusk creature gets a lively line, a day creature winds down. The existing
  `speak(...)` and `_look` stay; only the `normal` argument to `_lines` changes, so the
  persona's 50% roll and the baby set work exactly as today. The moment is already replayed
  or skipped by the existing catch-up rules; the clock flavour **follows them** and adds
  none (it is not "never a catch-up" as an extra rule, it is whatever the moment does).
- **`good_morning`** (the existing case): the same, by `clock`: a night creature groggy
  and fond, a day creature bright, a dusk creature in between. `_wakeLine` and the dream
  callback are unchanged.
- **`sunrise`** is left alone.
- The bedtime callback `NIGHT_SUNSET` (`_nightLine`) is left alone.

So there is **no morning-look slot** (the old section 7 entry is gone) and nothing to
displace a first-look line. N1's clock copy is 3 clocks x 2 moments = 6 variant lines
replacing the one-list `pick` at each case (a day creature may keep the existing
defaults, which is also valid).

Never grumpy: the groggy line is "five more minutes..." not "leave me alone". Sleep hours,
the wake time, the chirps and the quiet hours (21:00-08:00, `prefs.js:127-142`) never move.
Ship 1 does not try to make night creatures noisier at night.

### 5.4 Signature behaviours per habit (N2 copy)

Each habit gets a handful of keys. All lines are DRAFT. **Every species line is an
`*action*` line** (the body); no species line is speech. The voice stays with the
personality (`plan-2026-10-28-personality-types.md:33,103`), and a species line competes
with the persona list in `_lines`, not beside it. They fit 40 characters with the
longest fill (the copy scan's rule).

**A species line and the catchphrase.** The species already owns a voice block
(`species.json` `voice`: catchphrase, sound, likes; `coordinator.py:479-487`; the opener
logic at `prefs.js:172-181`). An `*action*` line begins with `*`, which `OPENERS`
(`prefs.js:181`; the check is at `card-tick.js:502`) treats as a sound of its own, so the catchphrase is **not** put in front
of it. A species line is said bare; the catchphrase still opens the persona and normal
lines as today.

| Habit | Idle (2 each, `*action*`) | Snack | Clean | Find | Visitor / link guest |
|---|---|---|---|---|---|
| **hoarder** (squirrel, hamster, ferret, hermitcrab) | "\*tucks something away\*" with `munch`; "\*pats its cheeks\*" | "\*pockets half for later\*" | none | "\*stashes it, pleased\*" | none |
| **builder** (beaver, puffin, tarantula, opossum) | "\*fixes up the {home}\*" with `settle`; "\*nudges a bit into place\*" | none | "\*tidies the {home}\*" | none | host: "\*shows off the {home}\*" |
| **basker** (beardeddragon, tortoise, pondturtle, seal) | "\*a long, slow stretch\*" with `settle`; "\*soaks it in\*" | "\*eats slowly, eyes half shut\*" | none | none | none |
| **groomer** (kitten, bunny, gecko, otter) | "\*grooms\*" with a small `rock`; "\*smooths itself down\*" | none | "\*fluffs up, pleased\*" | none | none |
| **explorer** (fox, octopus, bananaslug, duckling, corgi) | "\*sniffs around\*" with `wander`; "\*pokes at a corner\*" | none | none | "\*went looking, and look!\*" | visit: "\*wanders over first\*" |
| **watcher** (deer, axolotl, ballpython, owl) | "\*watches closely\*" with `look`; "\*holds very still\*" | none | none | none | visit: "\*ears up\*" |
| **performer** (bird, treefrog, firefly, lunamoth, bat) | "\*hums a little tune\*" with `perk`; "\*does a tiny twirl\*" (a glow for the light ones) | none | none | none | none |

The old draft's speech lines ("saving half for later ♪", "mine! ...ok, ours ♥", "now to
tidy my {home}", "come see my {home}!", "I went looking and found...") are **gone**:
they were voice. Also gone: the won-game "its sound as a tune" (a Hop-or-game line, and
Hop's win lines stay plain), the sky-flag line for the basker (the sky has its own 14
lines), the morning line (the clock flavour has it) and the dream column (section 8, N2).
An empty cell is `null`: the habit says its normal line for that key.

**How a species line is said** (the mechanics the first draft left open):

- **Idle** is the `mumble` branch of `_idle` only (`card-tick.js:391-409`), which has no
  animation of its own. A row with a move ("with `munch`") is a pair `[text, move]`, and
  after the bubble is written the branch calls `_animate(s, s.pet, move, ms)` as `perk` does.
  This is the only new coupling.
- **Snack and clean are not rows in an existing table.** `_lines` has no `snack` or `clean`
  key today. The keys that exist are `yum` (via `_mealLine`, `card-moment.js:467-480`),
  `find` (`card-visitors.js:472`), `visit` (`card-visitors.js:259`), `praise`,
  `all_better` and the refusals; a clean does only `_bubblePop` (`card-moment.js:530`).
  So the snack and the clean are **two new call sites** in `_care`/`_react`, each one
  `this._natureLine(s, "snack")` ahead of the normal line. They are the interplay hooks of
  section 8a.
- **`find`, `visit`** go through the existing `_lines` calls; the species roll sits inside
  `_lines` after the persona's. **`host`** (a link guest) is a new call in `card-link.js`.

The `{home}` and `{food}` fills come from the species' `words` (`_words(s)`,
`card-visit.js:196`), so a moth's stage words still apply. A line with a fill whose word
is missing is **not offered** (it falls back to the plain line, never "my undefined"); a
JS test walks all 30 species' `words` and asserts no line contains `undefined` or an
unfilled brace.

(The scout's draft day-in-the-life lines for six species are kept in the scout's report;
they were illustrations and are not copied here as final.)

### 5.5 Company (N2)

How a species meets a world visitor (`card-visitors.js`) or a link guest (`card-link.js`):

- **social:** a bounce (`perk`), then the wave, as today.
- **solo:** it **watches for a beat first** (`look`, about 1 s), then waves with a small
  action line ("\*peeks first, then waves\*"). Warm with its own people; never "doesn't like you", never refuses the guest.

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
4. **Rate caps.** Species action lines are **at most 1 in 4 of the lines the `mumble`
   branch says**: one constant (`SPECIES_LINE_ODDS = 0.25`) on that branch, rolled after the
   persona's coin fails to take the line. It is defined on `mumble` and not on all idle
   moves, because only `mumble` says a line and the species adds change its share
   (section 5.1). The JS test sweeps the random value across 0..1 and counts: species
   line for `r < 0.25` of the draws that reach the roll, never otherwise. One sky
   reaction per day. The clock lines are the existing `sunset` and `good_morning` moments,
   so their rate is unchanged (once a day each, as the server emits them). The idle
   cadence changes by at most +/-25%. The species adds at most 3 copies to the idle list.
5. **Body, not voice.** Species lines are `*action*` lines only (no speech). The
   personality type keeps the voice. In `_lines` the order is: baby set (wins everything);
   else the persona list at its 50% roll; else, only on the lines the persona did **not**
   take, the species list at 1 in 4 (section 8). A line is never both, and a species line is
   said bare, without the catchphrase (section 5.4).
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

`FIRST_LOOK_LINES = 3`. **Nature takes no first-look slot.** The order is unchanged for
everything that exists (wish / dream / gift / cure / catch-up / the memory plan's doors /
the follow-up). The old "morning nature line" is gone: the morning flavour is a variant of
the existing `good_morning` moment (section 5.3), which is not a first-look line.

The sky reaction rides the idle path and the clock flavour rides existing moments (sections
5.2, 5.3), so nothing here can displace a first-look line.

## 8. The ships

### N1: the data, the manner, the sky and clock (card + data, tier 1, S-M)

- **Data.** A `nature` block in all 30 `species.json` (section 4). The README gets one row
  (`nature`) and a line saying pace is derived. A **data test** in `tests/test_species.py`:
  every ready species has a `nature` with exactly the four keys, each from its closed list;
  `voice.pace` is an int in 20-50 (the derivation needs it); the counts do not drift
  silently (a table of expected values is the test's data, so a change to one species is a
  deliberate diff).
- **Card.** `nature(s)`/`paceOf(s)` helpers in `lines.js`; `SPECIES_ADDS` there;
  `_idleMoves` and the two cadence lines in `_idle` use them. The sky reaction is a small
  method in `card-moment.js` called from the idle path. The clock flavour is a change to
  the `sunset` and `good_morning` cases in `card-moment.js:107-119` (the `normal` argument
  chosen by `nature.clock`), with **no detector and no `_firstLook` change**. No new part in `manifest.txt` is needed; if a part grows past
  its neighbours the builder may add `card-nature.js` between `card-moment` and
  `card-status` (the class is an extends chain; the new link goes in the chain order, so it
  is a TDZ-sensitive reorder: card-check, not `node --check`).
- **Merge order.** Open branches `art-128-aww`, `-ready` and `-acts-r2` each rewrite the
  `acts` line (the last key, with `waves` just above it) in all 30 `species.json`. `nature`
  goes **beside `voice`**, four lines clear of it, so it merges; but N1's 30-file edit
  still **lands after those merges** (or merges `main` after them) to keep the diff
  readable.
- **Copy (DRAFT, about 20 lines):** sky 7 x 2 = 14; clock 3 clocks x (sunset, morning) = 6
  variants of the existing lines. In `lines-fresh.js` with a `COPY_TABLES` entry in
  `scripts/copy-scan.js`, so the scan checks them. **What the scan really checks**
  (`scripts/copy-scan.js:8,89-93`): the NAG list `still|again|why|never|pleas*|sad|cry|alone|forgot*`,
  40 characters with the longest fill, no `?` outside a question, no `!!!`, no digits. So
  these lines avoid "still", "again", "why", **"never"** (no "never cold"), "alone" and
  "sad" as well. The scan has **no** "favourite" rule and must not get a global one (the
  memory plan's `fav_weather` list in the same block says it, `plan-2026-11-02-memory.md:436`);
  the "favourite"/"fond of"/"love"/"best" ban lives in `nature_lines.test.js` (section 10).
  `FILL` (`copy-scan.js:10-15`) has no home or food kind: N1/N2 add `home` ("kelp bed" is
  8, "vivarium" 8) and `food` ("dandelions" 10, "bloodworms" 10) so the 40-character check
  is proven for `{home}`/`{food}` lines.
- **No server, no save, no art.**

### N2: the action-line layer and company (card only, tier 1, M)

- **Lines.** A species layer in `_lines`: a `SPECIES_LINES[habit][key]` table and a
  helper `_natureLine(s, key)` that returns an action line (or `[text, move]`) or `null`
  (a missing key is `null`, so a habit with nothing for a key says its normal line). Keys:
  `idle`, `snack`, `clean`, `find`, `visit`, `host`. **`idle`, `find` and `visit` ride
  existing `_lines` calls; `snack`, `clean` and `host` are new call sites** (section 5.4,
  "How a species line is said"), so N2 is M, not a table-only change. The 1-in-4 roll is
  taken **after** the persona's roll fails to take the line (section 6, rules 4-5).
  `fresh` lines keep their "never the same twice" rule via `_fresh`.
- **Company** (section 5.5): a `look` beat before the wave for solo species, a `perk`
  for social; two short lines. The beat must not delay a visitor's own timers or the link
  handshake enough to double a greet (checklist 13).
- **Dreams: dropped from N2.** The server picks the dream kind every morning from
  `PLAIN_DREAMS`, a rotation shuffled per pet (`model.py:3163-3210`, `plain_dream` always
  returns a kind); the card maps kind to text (`ui-copy.js:299-330`) and keys its callbacks
  off the pick (`card-moment.js:402-435`). There is no plain dream "to colour", and a habit
  dream that differed from the server's kind would disagree with `pet.dream`. Adding habit
  kinds to `PLAIN_DREAMS` is a server change (and `test_model.py:2312` pins `>= 15`
  distinct kinds), which this plan forbids. If the owner wants habit dreams, that is a
  separate plan with a server ship.
- **Copy (DRAFT, about 27 lines):** the section 5.4 table has 23 filled cells (idle 14,
  snack 2, clean 2, find 2, visitor/host 3; `visit` and `host` count as two keys, so a
  habit has up to 6 keys but fills only some); company 2 x 2 = 4.
- **Hop:** no habit flavour in Hop's win lines. They stay plain, as decided (section 1).

### N3: the field note and the Assist note (data + card + a small server change, tier 1, S-M)

**Not "data + card".** N3 is server code, so `pick-sections` goes to `all` and the gate is
`scripts/ci-gate` (AGENTS.md), not a partial card-check.

- **The notes.** **30 hand-written lines, one per species** (decided, section 1), not a
  template. They live in `species.json` as a sibling of `nature`:
  `"field_note": "comes alive at dusk · perks up in rain · keeps a stash"` (draft). One text,
  two readers (below). A species with no `field_note` has none (the beetle waits). The
  data test (section 10) checks length (60 characters or fewer, so it fits the status row
  at 330) and the banned wording.
- **Wording rule.** The notes say what the body does, never a liking: "perks up in rain",
  "warms up in sun", "stirs at the full moon". Never "favourite", "fond of", "loves",
  "best". (Review S2: "fond of rain" would be rephrased by the model as "loves rain", the
  favourite-weather line the voices plan dropped for the pet, `plan-2026-10-28-voices-and-lines.md:108`.)
- **The surface (card).** The **status page** (`_renderStatus`, `card-status.js`): one row
  under "personality", "nature", showing the field note of **the pet's own species** only.
  That pet is already hatched, so its species is never a "???" locked tile and the note
  leaks nothing a lock hides. Fit: a row like the others, wrapped, checked at 420, 330
  and 300 and in big text (section 10). The journal's species tiles (name only,
  `card-journal.js:143-160`, locked species "???") and the "every world" page get **no**
  note: the forms book that would hold four portraits is deferred
  (`plan-2026-10-28-forms-book.md:3`) and the note joins it if that book ships.
- **The server (Assist).** `Catalog.species` already keeps the whole dict (`species.py:58-75`),
  but the coordinator copies only named fields into per-species maps
  (`coordinator.py:471-490`: `species_names`, `catchphrases`, `likes`,
  `own_food_stages`). So N3 adds:
  1. a map `species_notes: dict[str, str]` in `coordinator.py`, filled beside
     `species_names` from each species' `field_note`;
  2. a slot `species_note` in the status data at `intent.py:268` (beside `species`; today it
     reads `pet.species_names` only), `None` when the species has no note;
  3. one sentence in the LLM `PROMPT` (`llm.py`, built by `.format(names=...)`, so no braces
     in it, `llm.py:37-56,75`) telling the model to colour, not to quote, the note.
  `spoken_status` stays unchanged (a golden). The note names the species, not any person.
  Tests in Python: the map, the slot, the golden, the prompt without a new brace.
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
  **Where the key goes.** Before `waves`, never after `acts`: the `art-128-aww`, `-ready`
  and `-acts-r2` branches each rewrite the `acts` line, the last key, in all 30 files, and
  anything appended after it changes that line's trailing comma and conflicts with every
  pending art merge. (N1's `nature` sits beside `voice`, clear of it.)
  **Why not an `acts` entry** (the alternative the review raised: `acts` is already
  stage-keyed, named `<stage>_<act>_1/2` and covered by the existence and grid tests,
  `test_species.py:35-66,165-173`): `acts` names are the care scenes' own acts, read by
  name (`eat`, `cheer`, `pat`, `refuse`, soon `aww`, `ready`) and listed in the README as
  such; an idle pose there would be a different kind of thing under the same key, and it
  is the line that conflicts. The existing grid test covers `signature` frames anyway
  (`hat_problems` accepts `adult_<pose>` keys, `test_species.py:128-146`), so a separate
  key costs one loop line in the name test and nothing else.
- **Code.** **One place only: `card-tick.js` `_idle`.** `own` adds the species' `signature`
  pose for the drawn stage (so the `pose` move is no longer child-only; a teen has none
  and a baby none); the frames line (366) reads from `signature` for that name. **The
  reaction path is not touched** (decision below). The house-flag poses
  (`card-layout.js:771`) and the clean scene's `squint` (`card-actions.js:144`) **stay
  child-only**.
- **Why there is no `_react` pose (the earlier draft's (b) is dropped).** A teen or adult
  already takes the `else` branch of `_react` (`card-moment.js:559-567`) and plays
  `acts.eat` / `acts.cheer` for a feed, snack, praise or won game; open art branches are
  adding `aww`, `ready` and more `eat`/`cheer` to the same line. The draft's rule, "play
  the signature where the child's `reactions` map ties a pose", would have suppressed that
  freshly drawn adult art on every snack and win, and the map names **child** poses that
  are not the signature (tarantula `won -> wave` but signature `web_mend`; kitten `won ->
  zoomies`, signature `lick_paw`; pond turtle `won -> swim`, signature `bask`; otter
  `snack -> rock`, signature `float_groom`). A grooming pose on a won game is not a
  reaction. The signature is an **idle** thing, full stop. (Checklist 18 is now a
  guard, not a question.)
- **Cadence (the true number).** `hasPose` pushes two `pose` copies (`card-tick.js:232-241`).
  The list for a content adult with a pose is `mumble, pose, pose, look, look, wander,
  perk, speck`: **2 in 8, 1 in 4 idle moves** before the type's and the species' adds
  (a watcher's three extra `look`s make it 2 in 11). With the idle gap of 20-45 s that is
  one signature about every two to three minutes of an awake, free pet: roughly twice
  what the earlier draft's "1 in 8" claimed. The bench judges whether that is too busy; if
  so the adult gets **one** `pose` copy (1 in 7), a one-line change. The "1 in 4 cap" of
  section 6 counts `mumble` lines and has nothing to do with the pose move.
- **README.** `sprites/README.md:20` says `reactions` are "Child stage only"; with (b)
  dropped that stays true. The README gets a `signature` row and a `nature` row.
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

**The art budget.** 60 frames. The pace limiter (`codex-image-cap` memory) allows one start
per 180 s, about 95 per 5 h and under 230 per 24 h window, and Sol and Luna share that cap.
Assumptions, stated: a call gives a **pair** (two frames) when the prompt is a 2-frame
sheet; so 30 calls for a clean first pass, about 1.5 h at one start per 180 s. A
`art-128-acts-r2` style retry of three tries per pose is up to about 90 calls, about 4.5
h, **under one day** of the cap if nothing else runs. The cap is shared with the art
already in flight (aww, ready, splash, the beetle redraw), so the plan does **not** claim
"one to two days"; the art lead schedules N4 around those. **Two batches**: the 22 poses
that redraw an existing child idea (the child's frames are the reference and the head
point is known), then the **8 new ideas** (`sing`, `web_mend`, `neck_sun`, `lick_paw`,
`ear_wash`, `stash`, `float_groom`, `leaf_bundle`), which have no reference and need a
prompt, a pose sketch and a head-point check first. They run as a normal art ship through
the first mate's art review. **What is committed:** the raw sheets and logs stay in
`private-content`; the finished frames `adult_<pose>_1/2.png` go into
`frontend/sprites/<id>/` and **are committed** (the grid test and the `signature` list
require them there).

## 8a. Interplay with the core-interactions effort

New context (owner, 2026-11-02): **feed, snack, tuck in and touch are to become the
richest interactions** of the game. That is a separate effort; scout s2735 is designing
it, and nothing in it is decided here. Where the two meet, this plan gives way:

**What the species layer offers those sequences** (all optional, all flavour, none
changes a number):

- `nature(s)` and `paceOf(s)` (`lines.js`), pure helpers over `species.json`: a sequence
  may scale a beat's length by pace (a slow pet lingers, a quick one is brisk) or choose a
  gesture by `habit`. Timing and picture only, never a stat.
- `this._natureLine(s, key)` (N2), returning an `*action*` line, a `[text, move]` pair, or
  `null`. A sequence calls it where it wants the species' body in a beat and says its own
  line when it gets `null`. The table already has `snack` and `clean` cells (section 5.4);
  the helper accepts two more keys, **`tuck` and `pat`, empty in N2**, so the new
  sequences can fill them without another layer. A habit with nothing for a key says
  nothing, as today.
- The `move` of a pair (`munch`, `settle`, `rock`, `perk`, `look`, `wander`) is an existing
  CSS class (`style.js:357-362`); a sequence may use the habit's move for a beat.
- The idle manner and the sky reaction are idle-path only; they never run during a
  sequence (the existing `_free(s)` gate and rule 7).

**What this plan keeps out of the way:**

- **N4's signature art is idle-only.** `signature` is its own key and the idle `pose`
  move is its only reader (section 8, N4); no `_react` path plays it. No signature frame
  is named, shared or reused as an `eat`, `snack`, `tuck` or `pat` frame, and the eat,
  snack, tuck and pat frames (`acts.eat`, `acts.pat`, `acts.cheer`, `acts.aww`, `acts.ready`,
  the care scenes in `card-actions.js`, `reactions`, and whatever the new sequences draw)
  may be replaced wholesale **without touching `signature` or its tests**.
- **No signature pose depicts the interaction itself.** Before N4's art starts, the art
  lead reads s2735's design and checks the 30 pose names against its beats; a pose that
  would read as eating, being tucked in or being petted gets another idea (a candidate
  list: `cheeks`, `stash`, `fish_bill`, `bottoms_up`; this is the art lead's call, not
  made here, and it is why N4 sits last).
- **N2's `snack` and `clean` call sites are thin.** Each is one `_natureLine` call ahead of
  the normal line in `card-moment.js`. If s2735's sequences land first, N2 builds only the
  helper and the idle, find, visit and host keys, and the sequences call `_natureLine`
  for `snack`/`clean`/`tuck`/`pat` themselves. N1 and the N3 notes are untouched either way.
- **The first mate sequences it:** N1 and N3 do not depend on the core-interactions design;
  N2's snack/clean wait for it only if the first mate wants no duplicated call sites.

## 9. Interaction with Hop and the memory plan

**Hop of the Day** (plan-2026-11-02-hop-of-the-day.md):

- Hop's species -> family table is the **only** place a species becomes a rule. Nature adds
  none. The two share no code: nature reads `species.json`, Hop reads its own `FAMILY_OF` in
  `hop.py`. The nature test does not import Hop; Hop's test does not read `nature`.
- Nature gives the four Night Sky fliers four different manners, which Hop's single `glide`
  cannot (moon, fog, rain, fire; performer, watcher, builder). That is the point of the
  `habit` column.
- Hop's win and tidy lines stay in Hop's ships and **stay plain** (decided, section 1):
  nature adds no habit flavour to them, now or in a later copy pass.
- A Hop board is a game: `s.game` is on, so sky, clock and action lines do not run (rule 7).

**The memory plan** (plan-2026-11-02-memory.md):

- **Q3 (above) is written against its M0-b/M1b `fav_weather` list.** The sky reaction checks
  the look's queue for a `fav_weather` note and skips (section 5.2, rule 3).
- **The two voices never share a line.** The memory plan's doors are spoken lines about the
  person ("since you told me...", the ask); nature lines are body lines. Nature never reads
  `mine`, the people store or any memory field, and says nothing about a person.
- **Slots.** Nature takes no first-look slot (section 7), so the memory doors, the wish,
  the dream and the gift are never displaced by it.
- **Copy scan.** Both plans' lines go in `lines-fresh.js` with a `COPY_TABLES` entry; the
  scan's nag list (`still|again|why|never|pleas*|sad|cry|alone|forgot*`) binds N1-N2 as it
  binds M0-b. N1's builder adds the entry; the memory plan's M0-b builder owns
  `fav_weather`'s. The "favourite" ban is in `nature_lines.test.js`, not the scan (the
  `fav_weather` list says the word).
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
the following need no Home Assistant. The builder adds what it cannot yet pin to the
bench, not to a throwaway HA: a `sky` and `clock` hook (or `pet.flags` with `time`), and
a way to **fire a `sunset` / `good_morning` moment** (the bench's `look` hook fills only
`moments`, `dev/bench/README.md:109`; with the clock flavour on the existing moments, a
moments entry is all it takes and no `sun.sun` transition is needed).

- **N1:** a `--preset nature`: per world at 330, an adult for each of the 7 skies with its
  flag up and the reaction line in the bubble (one shot per sky); the `sunset` and
  `good_morning` line for one species per clock (3 x 2); the same pet at calm. **Every
  line fits at 330, at 300 and in big text** (`.bubble` max-width is 64%, `style.js:381`;
  the newer presets run 300 and big text, `bench/README.md:22-24,37`). A baby and a child
  shot show **no** nature line. A sky reaction together with a trait flair for the same
  flag (storm_watcher on a rainy day) reads well.
- **N2:** a species-line shot per habit (7), a solo and a social visitor greeting (2 x the
  `visitors` preset's shape), a link host line for the builder. **Mono mode and big text
  for the species with the longest `{home}` / `{food}` fill** ("bloodworms" or "dandelions"
  for food, "kelp bed", "lily pad" or "vivarium" for home), not "one".
- **N3:** the status page's "nature" row at 420, 330 and 300 and in big text, for one
  species per world and the longest note; the Assist output is a test, not a shot.
- **N4:** a `--preset signature`: all 30 species, adult, both frames, 330 and 420; one
  contact sheet per world; with a seasonal costume on, with a flair on, and with the pose
  mid-move (`petAt`); a night and a mono pass for the whole 60. The art review reads the
  contact sheets and the diff, not 60 single shots.
- **Sky cases live here** (the bench pins `pet.flags`), or in JS tests, not in card-check:
  the dev HA's house decides which flag is up, so a card-check sky case would depend on
  the weather.

### card-check cases (a real HA, behaviour only)

Sections that exist (`--list`): `moments`, `personality`, `types`, `visitors`, `infrared`,
`react`, `pat`, `care`, among others. N1/N2 run `moments personality types visitors
infrared`; N4 adds `pat care` (not `react`: `_react` is untouched). New cases (sections
named by the builder):

- **No nature line at baby**, and a baby set wins a key over a species line.
- **The sky reaction runs once** for a flag and **not twice in a day**, across a reload
  (`localStorage`).
- **No sky reaction** while asleep, lights out, away, resting, in a game.
- **The cadence** of a quick and a slow species differs, and calm leaves both as today.
- **The solo species' visitor greet** has the beat before the wave; the social one does not.
- **No server call** from any nature behaviour (the card-check stubs count calls: none new).
- The **existing idle expectations are updated** in the same ship (section 5.1): the
  re-timed "idle life happens by itself" window, the `Math.random` order, `NORMAL_GREET`.
- N4: the idle `pose` move plays `signature` for an adult and nothing for a baby or teen;
  the house-flag pose for an adult is unchanged (still no pose at adult); `won` and a snack
  still play `acts.cheer` / `acts.eat` for an adult (unchanged).

**The look rule** (the sky reaction skips a look that queued a `fav_weather` note and runs
on a later one) is a **JS test with a stubbed queue**, not card-check: the note is
server-made and needs a person who answered the question and a matching weather in the
dev house, which no fixture provides. The test stubs the queue the builder finds
(`card-looks.js`) with and without a `fav_weather` entry, and checks the key is unspent.

### Tests

- **Python (data test), N1:** every ready species has a valid `nature`; `voice.pace` derives
  the pace table of section 4; the exact table is the test's data (a changed row is a
  deliberate diff). A species with no `nature` is allowed (the beetle) and gives none.
- **Python, N3:** the coordinator's `species_notes` map carries each `field_note`;
  `intent.py`'s status data has `species_note` (None without a note); `spoken_status` is
  byte-for-byte unchanged (a golden); the LLM prompt has no braces added; every
  `field_note` is 60 characters or fewer and has none of the banned wording ("favourite",
  "favorite", "fond", "love", "best").
- **Python, N4:** every `signature` sprite exists, its stage is in `stages` and is not
  `baby` or `child`, and the existing grid test covers the frames.
- **JS (`node --test tests/js`):** a `nature_lines.test.js` reading the card source as
  `dream_lines.test.js` does: every sky has 2 lines, every clock 2 (per moment), every
  habit all its keys (or an explicit `null`); none has a nagging word, a `?`, a digit,
  "favourite", "favorite", "fond", or more than 40 characters with the longest `{home}` /
  `{food}` fill; **no line contains `undefined` for any of the 30 species' `words`**;
  `paceOf` thresholds; `SPECIES_ADDS` names only moves `_idle` handles and at most 3
  copies; **the species-line cap**: a sweep of the random value over the `mumble` branch
  gives a species line for `r < SPECIES_LINE_ODDS` of the draws that reach the roll and
  never for a baby; the look rule (above); a missing nature gives nothing.
- **Copy scan** (`scripts/copy-scan.js`) passes with the new tables named in `COPY_TABLES`
  and the `home` / `food` fill kinds added.
- **Save:** an existing save loads unchanged (nothing saved by nature); `PetState` unchanged
  (a diff check in review).

## 11. Copy budget

All lines **DRAFT**; the first mate approves them. The count is the plan's, not a limit on
the builder's fewer.

| Ship | Lines | Made of |
|---|---|---|
| N1 | about 20 | sky 7 x 2 = 14; clock 3 x 2 = 6 variants of the existing sunset and good-morning lines |
| N2 | about 27 | the section 5.4 table's 23 filled cells (idle 14, snack 2, clean 2, find 2, visitor/host 3); company 2 x 2 = 4. No dream lines |
| N3 | 30 hand-written notes, plus 1 prompt sentence | one per species |
| N4 | 0 | art only |
| **Total** | about 47 lines, plus 30 notes | |

Each line: 40 characters at most with the longest fill, no digits, no `?` outside a
question, no `!!!`, none of the nag words (the scan's list). The builder lists the working
text in the report, as the dig's and Hop's did.

## 12. Save and risk

- **Save impact: none for N1-N4.** The nature is read from `species.json` by species id.
  Nothing is saved on the pet or the server; the once-a-day keys are `localStorage`. An
  old save, an old card and a new server (or the other way round) all work: an old card
  ignores an unknown `nature` key, and a new card with an old server still reads it from
  the frontend files it is served with. N3 adds a coordinator map and an Assist slot, both
  optional (`None` without a note), so an old card with a new server also works.
- **A card update is needed to see anything**; HA needs a restart for a new card build
  (AGENTS.md).
- **Risk: a pet that feels scripted.** The caps (1 in 4, once a day, +/-25%) are the guard;
  the bench contact sheet and a day's real use judge it. If a species reads too busy, the
  fix is a smaller table, not a new rule.
- **Risk: the sky line is mistaken for "a favourite".** Copy review, the "favourite"/"fond"
  ban in `nature_lines.test.js` and the data test on the notes (the scan has no such rule,
  section 8, N1), and Q3's look rule are the guards. The residual "same day" case is in
  section 13, Q3.
- **Risk: art cost.** N4 is optional in spirit: N1-N3 stand without it, and N4 can be done
  a world at a time (the `signature` key is optional per species).
- **Risk: `card-tick`'s `own` list changes shape for N4**, and `_idle` is the card's busiest
  function; the change is a few lines but needs the `pat` and `care` sections, listed above
  (`_react` is untouched).
- **Risk: the sequences of the core-interactions effort** may reshape the snack and clean
  call sites; section 8a keeps them thin so N2 gives way.

## 13. Open questions: decided (first mate, 2026-11-02)

1. **The 8 new pose ideas in N4** (section 8): an art prompt and a head-point check before the
   second batch, at N4 time; names stay as drafted.
2. **Core-interactions overlap** (section 8a): which eating-like poses (`cheeks`, `stash`,
   `fish_bill`, `bottoms_up`) change is decided when scout s2735's design lands, before N4.
3. **Q3 tightened:** the pet's sky reaction is not said on a day the person's own
   favourite-weather note was said (one more check), not only "never on the same look".
4. **Rare skies:** `moon` stays (the moon comes from the date with no sensor). `fire` falls
   back to the house's heating being on (the mapped climate or heater), and to `sun` when
   nothing is mapped, so the 8 fire species show their sky in any house.

## 14. Adversarial review checklist

For the reviewer of this plan, and again of each ship. Each is a question to answer with a
file and line, not a feeling.

1. **Flavour only.** Search the diff for any read of `nature` in `model.py`, `rates.py`,
   `coordinator.py` (beyond the species catalog and N3's `species_notes` map), or any rng draw. There must be none. Is
   `PetState` byte-for-byte unchanged? Would a seeded test shift?
2. **Q3, the word.** Do any sky lines or field notes (the Assist note is the same text)
   use "favourite", "favorite", "fond of", "love", "best" for the pet's sky? Does
   `nature_lines.test.js` / the data test fail the word? (The copy scan does not and must
   not, section 8, N1.)
3. **Q3, the look.** Walk a morning with a favourite-weather note queued: does the sky
   reaction run on that look? Does it eat its once-a-day key? Does it run later? Does the
   M0-b rotating list and M1b's door 6 variant both count as the person's line?
4. **Doubling.** Can the sky reaction fire on top of a `weather` moment line or the
   forecast? What stops it within the 60 s window? What about the fan flag and the
   `fireside` house effect?
5. **Slots and doubling of moments.** Nature takes no first-look slot (section 7). Does
   the clock flavour add a second `sunset` or `good_morning` line, a detector, or a first-look
   entry? (It must only change the `normal` list of the existing cases.)
6. **Babies and children.** Does a baby ever get a nature line, manner or cadence? Does the
   child get the manner (it should not, only the cadence and lines)? Is there a stage test?
7. **Calm.** Reduced motion and calm: no new movement, and the cadence scale off? Is the
   test real (it fails if the scale is applied in calm)?
8. **The caps.** 1 in 4 of the `mumble` branch's lines (`SPECIES_LINE_ODDS`): does the
   sweep test pin it? Can the species roll and
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
15. **Server.** N3 only: the `species_notes` map, the `species_note` slot and the prompt
    sentence are the whole server change. Does `intent.py` leak anything per person? Is
    `spoken_status` unchanged? Do the LLM prompt braces stay out (`str.format`)? Did the
    gate go through `scripts/ci-gate`?
16. **N4 format.** `signature` stage-keyed and optional: no existing file changes without
    it? `extras`, `reactions` and their tests untouched? The child path in `card-tick.js`
    and `card-moment.js` byte-identical for a child?
17. **N4 art.** Does each pose keep the head near `head.adult` (flair, costume)? Are the
    two frames on the species' grid? Does a seasonal costume or a trait flair sit wrongly on
    a pose? Is the whole set read on a contact sheet at 330, in mono and at night?
18. **N4 reactions.** Decided: there is none. Does the diff touch `_react` or `reactions`,
    or play a `signature` frame anywhere but the idle `pose` move? Do `acts.eat` /
    `acts.cheer` still play for an adult snack and win? Does a signature frame share a
    name or file with an eat/snack/tuck/pat frame (section 8a)?
19. **Load order.** If a `card-nature.js` part is added, was `node scripts/card-check.js`
    run, not `node --check`? Is the class chain order right?
20. **Hop and memory.** Does any nature code read `FAMILY_OF`, `hop_day`, `mine`, a memory
    field or a person? (None should.) Do the two plans' copy tables collide in
    `COPY_TABLES`?
21. **The counts.** Re-derive the section 4 counts from the table (clock 10/5/15; sky 8/6/5/4/
    3/2/2; company 15/15; pace 10/12/8; habit 5/5/4/4/4/4/4). Do the copy budgets in section 11
    add up to the ship lines (N2's 23 cells + 4)?
22. **Docs the build updates.** `sprites/README.md` (the `nature`, `field_note` and
    `signature` rows; the "extras are drawn for the child" and `reactions` "Child stage only"
    lines stay true), `docs/features.md`, the bench
    README for any new preset or hook, and the card-split table if a part is added.
23. **The 3-ship merge hazard.** Did N1's 30-file edit land after the `art-128-*` merges?
    Is `signature` before `waves` and not after `acts`? Does the diff touch the `acts`
    line at all?
24. **Existing idle tests.** Are the card-check idle window, the `Math.random` order
    and `NORMAL_GREET` updated in the same ship? Does `mumble` stay element 0?


## 15. Review s2733: what became of each finding

The adversarial review (`~/.local/state/crew/archive/hatch-at-home-s2733-20261102-1428/report.md`)
was checked against the code at `origin/main` `b38c9852` (the load-bearing claims by
reading the files: the moments, `_react`, the idle list, the scan, the coordinator maps,
the dream pick, the weather flags, the art-128 branches). All 18 held; none rejected
outright. Two were folded with a changed shape (S2's doubling and
reach, S10's alternative).

| # | Finding | Verdict | Where |
|---|---|---|---|
| B1 | Sunset and morning lines already exist (`sunset`, `good_morning` moments) | Folded: clock flavour hangs on them; no detector, no second line, no morning-look slot | 2, 5.3, 7, 8 N1 |
| B2 | N4 (b) `_react` signature overrides `acts.eat`/`acts.cheer` | Folded: (b) **dropped**; signature is idle-only | 8 N4, 10, 14 (18) |
| B3 | N3 has no surface (forms book deferred) and is a server change | Folded: surface is the status page (own species only); server change named (map, slot, prompt); gate `ci-gate`; size S-M | 8 N3 |
| S1 | Stale: template notes, Hop open question, decision list | Folded: 30 hand-written notes; Hop win lines plain; both recorded in section 1 and Q-list | 1, 8 N3, 9, 13 |
| S2 | Sky can read as "favourite"; doubling; reach | Folded: "fond of" banned and the Assist note drops the liking; sky de-dup against `REASONS` and `weather` via one new timestamp, flair noted; reach stated. **The same-look vs same-day choice is left to the first mate** (Q3 stays as decided) | 4, 5.2, 8 N3, 13 |
| S3 | Idle cadence vs existing card-check idle tests | Folded: `mumble` element 0, no draws before the two, species roll after the coin, window re-timed, sky key pre-spent | 5.1, 10 |
| S4 | Wrong numbers; cap untestable; explorer `wander` | Folded: pose is 1 in 4 (not 1 in 8); cap defined on the `mumble` branch with a sweep test; explorer is three times | 5.1, 6, 8 N4, 10 |
| S5 | Dreams cannot be card-only | Folded: dreams dropped from N2 | 8 N2 |
| S6 | N2 mis-sized; draft lines are voice | Folded: snack, clean, host are new call sites (N2 stays M); species lines are `*action*` only and drafts rewritten; catchphrase combination stated; `[text, move]` coupling; `undefined` test | 5.4, 8 N2 |
| S7 | Copy scan claims do not match the scan | Folded: the real NAG list; "favourite" ban moves to the JS test; `home`/`food` fill kinds added | 8 N1, 9, 10 |
| S8 | Acceptance criteria unverifiable | Folded: look rule in a JS test with a stubbed queue; sky cases on the bench; moments hook replaces the `sun.sun` transition; 300 and big text; named species for mono/big text | 10 |
| S9 | N4 art budget not worked out; frames are committed | Folded: calls-per-pose and retry assumption, shared cap, two batches (22 + 8), frames committed | 8 N4 |
| S10 | Merge hazard with `art-128-*` on the `acts` line | Folded: `signature` before `waves`; N1 lands after the art merges. The `acts`-entry alternative is **rejected** (acts are the care scenes' named acts; it is the conflicting line; a separate key costs one loop line) | 8 N1, 8 N4 |
| N1 | `waves` stages are baby/teen/adult | Folded | 2 |
| N2 | README `reactions` "Child stage only" | Folded: stays true once (b) is dropped; README rows listed | 8 N4, 14 (22) |
| N3 | Line drift (`card-layout.js:524`) | Folded (the clock section now cites 524; names win over numbers anyway) | 2 |
| N4 | No 60 s `weather` timestamp | Folded: one new field, named | 5.2 |
| N5 | 42 vs 49 key count | Folded: count is the 23 filled cells; `visit` and `host` are two keys | 8 N2, 11 |

Also folded from the brief: the **interplay with the core-interactions effort** (section 8a).

## 16. N1 shipped: corrections for N2-N4

N1 is built (branch `crew/hatch-at-home-s2742-n1-species-nature-data-idle-ma`, worker
s2742). Where the code differed from this plan, the code is right and N2-N4 read from it.

**First mate decisions on N1 (2026-11-02):**

- **Fire fallback = `cozy`, then `sunny`.** The `fire` sky reacts to `fireside`, else the
  `cozy` flag, else `sunny`. A real "heating on" flag (a server change) is an **N2
  question**, not N1's.
- **A child skips the sky reaction** (section 10 wins over section 6 rule 6 for the sky).
  The cadence still applies to a child. N2 decides for the action lines.
- **Clock copy is two lines per cell** (3 clocks x 2 moments x 2 = 12), not one, so a pet
  does not repeat its line every day. With the 14 sky lines N1 ships 26 lines, approved.

**What N1 built, as N2-N4 will find it:**

1. **The heating signal.** The card has no "heating on" flag, only `cozy` (heating on and
   the house cold, `home.py:272`). N1 uses `cozy`; sun is the last stand-in, so a house with
   no fireplace, no cold and no sun shows a fire species nothing.
2. **Child.** Section 6 rule 6 says a child gets the lines; section 10 says a child shot
   shows none. N1 followed section 10 for the sky.
3. **`REASONS` is a persistent caption**, the status sentence redrawn every tick, not a timed
   bubble. Section 5.2 rule 4 therefore needs only the `weather` and `forecast` stamps
   (`s.skySaid`), done; nothing for `REASONS`.
4. **`_babyStage` returns a child only while baby talk is on.** The nature rules read
   `sensor.life_stage` directly (egg, baby, child) and also `_babyStage`.
5. **The favourite-weather key.** The sky rule reads `favweather-said-<device>`, which
   `_note` sets for note kind `fav_weather`. If the memory plan's M0-b or M1b queue that line
   by another path, they must set the same key, or the reaction can land on that day.
6. **The idle path.** `_skyReact` runs in `_idle` after the promise practice and before the
   move pick, and takes that idle tick. N2's species line roll (after the persona coin, in
   the `mumble` branch only) is unaffected. All idle changes sit in `_idle`, `_idleMoves`,
   `_speciesAdds` and `_idleScale`; `_reactFrames` is untouched, so care-reactions ship A has
   no overlap.
7. **card-check.** `hush` stubs `_skyReact` off, the "idle life happens by itself" wait is 120 s
   (a slow pet's worst case is about 100 s), and the sunset, morning and idle-manner checks
   accept the clock lines and a child's list without the species adds. N2's `Math.random`
   order rule (section 5.1) held: the cadence scale draws nothing and no draw comes before
   the delay and move.
8. **Bench.** `moment` (a public moment through the card's `_moment`) and `idle.draw` (the
   draw that picks the sky line) now exist, with `--preset nature`. N2 and N3 shots can reuse
   them. Not shot in N1: a sky reaction together with a trait flair, and big text (a bubble
   does not change with it).
