# Plan: species nature, 2026-11-02 (build plan)

**Status: PLAN, docs only (tier 0).** Written by s2730 from scout s2728's report
(`~/.local/state/crew/archive/hatch-at-home-s2728-20261102-1414/report.md`) and the
decisions of 2026-11-02 (section 1). Every file:line claim in the scout's report was
re-checked against `origin/main` `b38c9852`; where the code differs, section 2 says so.
**Revised by s2736** to fold in the adversarial review s2733 (3 blockers, 10 should-fix,
5 nits; each checked against the code first). Section 15 lists every finding and what
became of it.
**N2 folded by s2793** from review s2792 (the first mate's decisions of 2026-11-03,
section 16; every finding's fate in section 15). N2 is now a build-ready section (8, N2).
**N2 shipped by s2794** (branch `crew/hatch-at-home-s2794-species-nature-n2-action-line`;
section 16 "N2 shipped" says where the code differed and what each pin became).
Names win over line numbers. **Every pet line, field-note and pose name here is DRAFT**
until the first mate approves it (decisions-2026-10-28.md, "How the crew works with the
owner"), **except N1's (shipped) and N2's 22 lines, which the first mate approved on
2026-11-03** (section 16).

The build is four ships. **Ships 1-2 are tier 1** (card and data; flavour only; no saved
field, no stat, no rate). **Ship 3 is tier 1 with a small server change** (one species-note
map and one Assist slot; the gate is `scripts/ci-gate`, section 8). **Ship 4 is art** (tier 1
for the code, the art goes through the art review). Nothing here touches `PetState`.

## 0. Summary

Today species differ in **look, voice and words, never in behaviour** (the care scenes
already pick a gesture by `nature().habit` and time a beat by pace, `card-care.js`: the
care-reactions plan's decision, a picture and never a number). Each species has
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
| **N2** | The species action-line layer in `_lines`, opt-in per call site (idle, find, visit, link host), the solo "peeks first" visit line. Snack and clean are the care scenes' (section 8a) | S-M | none | 22 |
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

(**Line numbers below are as of `b38c9852` and have since moved** (care B1/B2, the resting
ships and N1 all touched these files; review s2792 S10 lists the new places). Names win.
The care scenes now live in `card-care.js`, the clean `squint` is gone from
`card-actions.js`, and `_lines` is `card-tick.js:239`.)

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
| **Company** | `social`, `solo` | `nature.company` | How it meets a world visitor: a solo species says one shy line, "peeks first, then waves"; never cold, no timing change. |
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

`_idleMoves` (`card-tick.js`) builds the list from the common moves, the type's adds
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
  move (0 picks `mumble`), **[the neighbour roll, with two or more pets]**, `pick(lines)`
  for the normal line, then the persona coin. **The cadence scale and the sky check
  draw no `Math.random` before the delay and the move.** The scale is a multiplier on the
  two constants, not a draw. (Corrected by s2792 S5: the neighbour roll and the `normal`
  pick sit between the move and the coin; section 5.4 has the full order.)
- The species roll (section 5.4) runs **after** the persona coin, and only in the `mumble`
  branch, for the `idle` key (content and cozy). A test key whose persona has no list would otherwise see the species line where
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
(the final `else` of `_idle`), so every add lowers `mumble`'s share. The list for a content
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

**Folded from review s2792 and the first mate's decisions of 2026-11-03 (section 16).** N2
has **four keys: `idle`, `find`, `visit`, `link_host`.** Snack and clean are **not** N2's:
the care scenes own those moments (section 8a). All lines are **FM-approved copy** (the
quoted lines below are final, except the one marked "new" in section 16, which needs the
first mate's nod); the copy scan was re-run on every one (section 8, N2: PASS).

**Every species line is an `*action*` line** (the body); no species line is speech. The
voice stays with the personality (`plan-2026-10-28-personality-types.md:33,103`), and a
species line competes with the persona list in `_lines`, not beside it. They fit 40
characters with the longest fill (the copy scan's rule).

**A species line and the catchphrase.** The species already owns a voice block
(`species.json` `voice`: catchphrase, sound, likes; `coordinator.py:479-487`; the opener
logic at `prefs.js:172-181`). An `*action*` line begins with `*`, which `OPENERS`
(`prefs.js:181`; the check is in `_idle`, `card-tick.js`) treats as a sound of its own, so
the catchphrase is **not** put in front of it. A species line is said bare; the catchphrase
still opens the persona and normal lines as today.

**The cell shape (one, everywhere).** Every cell is an object `{ text, move }`:

- `text` is a string, or a function `(home) => string` for a line with the `{home}` fill.
  The function returns a falsy value when `home` is missing, and that cell is **dropped from
  the pool** (never "my undefined"); a pool left empty means the roll is skipped and
  **nothing is drawn**, so the cap stays exact.
- `move` is optional, from the closed set `perk settle munch rock look wander` (the idle
  moves `_idle` already handles). Only the `idle` key has moves; `find`, `visit` and
  `link_host` cells have none.

**The table** (`SPECIES_LINES` in `lines-fresh.js`, inside the fresh-expand copy block):

```js
const SPECIES_LINES = {
  habit:   { hoarder: { idle: [...], find: [...] }, builder: { idle: [...], link_host: [...] }, ... },
  company: { solo: { visit: [...] } },
  own:     { firefly: { idle: [...] }, lunamoth: { idle: [...] } },
};
```

A cell is looked up for `(species, key)` **most specific first: `own[speciesId][key]`, then
`company[nature.company][key]`, then `habit[nature.habit][key]`**; the first that exists
wins as a whole (cells are never merged across levels). A missing level, key or `nature`
gives no cell, and the call site says its normal line.

| Habit | `idle` (2 cells; `move` after "with") | `find` | `visit` | `link_host` |
|---|---|---|---|---|
| **hoarder** (squirrel, hamster, ferret, hermitcrab) | "\*tucks something away\*" with `munch`; "\*pats its cheeks\*" | "\*stashes it, happily\*" | none | none |
| **builder** (beaver, puffin, tarantula, opossum) | `(home)` "\*fixes up the {home}\*" with `settle`; "\*nudges a bit into place\*" | none | none | `(home)` "\*shows off the {home}\*" |
| **basker** (beardeddragon, tortoise, pondturtle, seal) | "\*a long, slow stretch\*" with `settle`; "\*soaks it in\*" | none | none | none |
| **groomer** (kitten, bunny, gecko, otter) | "\*grooms\*" with `rock`; "\*smooths itself down\*" | none | none | none |
| **explorer** (fox, octopus, bananaslug, duckling, corgi) | "\*sniffs around\*" with `wander`; "\*pokes at a corner\*" | "\*came back with something\*" | "\*sniffs the air\*" (new, see below) | none |
| **watcher** (deer, axolotl, ballpython, owl) | "\*watches closely\*" with `look`; "\*stays very quiet\*" | none | "\*ears up\*" | none |
| **performer** (bird, treefrog, firefly, lunamoth, bat) | "\*hums a little tune\*" with `perk`; "\*does a tiny twirl\*" | none | none | none |

**The two other levels.**

- **`own`, the light performers.** Firefly and lunamoth do not hum; their `idle` cells
  replace the performer's two: "\*glows a little brighter\*" with `perk`; "\*flickers in a
  tiny loop\*". (Bird, treefrog and bat keep the hum and the twirl.)
- **`company.solo.visit`: "\*peeks first, then waves\*"** (no move). All 15 solo species say
  it on a visitor's greeting, and it **wins over the habit's `visit` cell** (so the solo
  watchers, ballpython, owl and axolotl, and the solo explorers, fox, octopus and
  bananaslug, say "peeks first", not "ears up" or "sniffs the air"). The habit's `visit`
  cell is therefore said only by a **social** watcher or explorer: deer ("\*ears up\*"),
  corgi and duckling ("\*sniffs the air\*"). That is the whole `visit` map; every other
  social species says the usual greeting.
- **Reworded from the draft (review S4):** the explorer's "\*wanders over first\*" claimed a
  motion the card does not play (a visiting pet is held by `flairUntil`), so the cell is
  "\*sniffs the air\*", a stand-alone gesture. It is the one line not named in the first
  mate's decisions; it passes the scan; refusing it costs one deleted cell and nothing else.

The old draft's speech lines are **gone** (they were voice), and so are: the won-game "its
sound as a tune" (Hop's win lines stay plain), the sky-flag line for the basker (the sky
has its own 14 lines), the morning line (the clock flavour has it), the dream column
(section 8, N2), and the **snack and clean columns** (section 8a). An empty cell is absent:
the call site says its normal line for that key. (Fresh-expand's "never the same twice"
rule is not involved: none of the four keys is a `fresh` key.)

**How a species line is said.** The species roll is **opt-in per call site**:

```js
this._lines(s, key, normal, arg, { fresh, nature: "<key>" })
```

`nature` names the cell key, and the result gains a `move`: `{ text, baby, move }` (`move` is
`null` unless a species cell with a move was taken). A call site that does not pass
`nature` is byte-identical to today: the ~40 other `_lines` callers (wish, yum, praise,
the refusals, the seasons...) draw no extra `Math.random` and their `{text, baby}` result
is unchanged. Inside `_lines`, after the persona's coin has failed to take the line (or
the persona has no list for the key) and the pet is **not** a baby set:

1. the stage must be **teen or adult** (`sensor.life_stage` read directly, as
   `_speciesAdds` does: a child, a baby and an egg get none, whatever baby talk is on);
2. the pool is every cell for `(species, key)` whose `text` resolves (the `{home}` word from
   `this._words(s)`); an empty pool ends it, with no draw;
3. `Math.random() < SPECIES_LINE_ODDS` (0.25), and then `pick(pool)` is the line, said bare.

**The draw order a card-check or bench pin must know** (it corrects section 5.1): the
`_idle` delay, the move, **[the neighbour roll, only with two or more pets and not for a
baby or a bodily mood]**, `pick(lines)` for `normal`, the persona coin (only when the persona
has a list for the key; if it passes, `pick` of the persona list follows and the species
roll is **not** made), **[the species roll, then `pick(pool)`]**. A key without a species
cell draws exactly what it draws today.

**Rate, so nobody tunes against 25%.** "At most 1 in 4" is the ceiling. No persona list
has a `find` key, so `find` is a flat 25% of the eligible finds; `idle`, `visit` and
`link_host` have a persona list for all 8 types, so after the persona's 50% coin a typed
teen or adult says the species line on **12.5%** of those lines (a pet with no type yet:
25%).

**Per key:**

- **`idle`** is the `mumble` branch of `_idle` only (`card-tick.js`, the final `else`),
  `nature: "idle"`, and only when `key === "idle"` (the content and cozy moods): the
  bored and excited keys (`idle_bored`, `idle_excited`) and the bodily moods (sleepy,
  hungry, dirty, sick, which skip `_lines`) get none, and so neither does a resting pet or
  a neighbour line. So rule 7's "not while sick or resting" holds without a new check.
  **The move** is not `_animate`'s for every name: `look` and `wander` go through `_look(s,
  1800)` and `_wander(s, 2200)` (persistent classes with their own `_moving`), the rest
  (`perk settle munch rock`) through `_animate`. N2 therefore **extracts the simple branches
  of `_idle`** (`look`, `wander`, `perk`, `settle`, `munch`, `rock`, with the ms they use
  today) into one `_idleMove(s, move)`, which `_idle`'s own `if/else` calls for those
  moves too (no behaviour change for them), and the `mumble` branch calls
  `this._idleMove(s, move)` **after `_write`, only if `!isCalm` and the result has a
  `move`**. Calm or reduced motion: the line only, no move.
- **`find`** is `_findLine` (`card-visitors.js`), the **V1 branch only**: the species line
  is offered only when the find has no visitor who left it (V3) and is not a first-ever
  find (V2) (`nature: who || f.new ? null : "find"`), so a line that names the visitor or
  says "new" is never replaced. (The V1 line names the thing found; the species line does
  not, the find's picture shows it.)
- **`visit`** is the last branch of `_visitorGreet` (`card-visitors.js`), after the guest,
  pair, favourite and friend lines: `nature: "visit"`. Those branches stay first, and a
  baby set stays first (`_babySet`).
- **`link_host`** is the existing call in `_linkStart` (`card-link.js`), `nature:
  "link_host"`. It is an **alternate hello** for the builder host: the species line stands
  in for "hi, {guest}!" 1 time in 4 at most (above), so the host does not greet the guest by
  name on that visit. The guest's reply (`link_guest`) is unchanged, and **no species
  line is added on the guest's side**. The line is stored in `L.said` like any hello.
  The `_linkStart` comment, "every roll is made here, at the start", stays true.

The `{home}` fill comes from `_words(s)` (`card-visit.js`), so a moth's stage words still
apply. A JS test walks all 30 species' `words` (and the stage words) and asserts no cell
text contains `undefined` or an unfilled brace.

(The scout's draft day-in-the-life lines for six species are kept in the scout's report;
they were illustrations and are not copied here as final.)

### 5.5 Company (N2)

How a species meets a world visitor (`card-visitors.js`) or a link guest (`card-link.js`).
**Lines only, no beat** (first mate, 2026-11-03; review s2792 B2):

- **social:** unchanged. The greeting already plays a bounce (`greethop`, from
  `_reactFrames(s, "greet")`) for every species; N2 adds nothing, no `perk`, no line of
  its own (a social watcher or explorer has the habit's `visit` cell, section 5.4).
- **solo:** the one `visit` line, "\*peeks first, then waves\*" (section 5.4), at the
  usual cap. **No delay, no `perk`, no `look` call.** The "look first" beat already exists:
  a visitor from the left makes the pet look from the arrival, and holds it through the
  stay, and a right-hand one meets the art already facing it; the calm path has no look and
  needs none. A delayed greet would eat the 3 s stay and a second one-shot `.pet.<cls>`
  animation would silence `greethop` (AGENTS.md, composition rule).
- **Link guest: nothing.** The guest's reply is timed to `t0+1800` and the extra's timing
  is built on it (`card-link.js`), so a solo guest says what it says today.

Warm with its own people; never "doesn't like you", never refuses the guest. It changes one
short line and no timing. The existing `waves` frames, the greet text tables and the kindred
pairs (by personality) are unchanged. It never changes who visits, how often, or what is
left behind.

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
4. **Rate caps.** Species action lines are **at most 1 in 4 of the lines a call site says**:
   one constant (`SPECIES_LINE_ODDS = 0.25`), rolled after the persona's coin fails to take
   the line, and only at the four call sites that opt in (section 5.4: `idle` in the
   `mumble` branch, `find`, `visit`, `link_host`). It is defined on `mumble` and not on all idle
   moves, because only `mumble` says a line and the species adds change its share
   (section 5.1). With the persona's 50% coin before it, a typed teen or adult says it on
   12.5% of those lines; `find` has no persona list, so it is 25% of the eligible finds. The JS test sweeps the random value across 0..1 and counts: species
   line for `r < 0.25` of the draws that reach the roll, never otherwise. One sky
   reaction per day. The clock lines are the existing `sunset` and `good_morning` moments,
   so their rate is unchanged (once a day each, as the server emits them). The idle
   cadence changes by at most +/-25%. The species adds at most 3 copies to the idle list.
5. **Body, not voice.** Species lines are `*action*` lines only (no speech). The
   personality type keeps the voice. In `_lines` the order is: baby set (wins everything);
   else the persona list at its 50% roll; else, only on the lines the persona did **not**
   take, the species list at 1 in 4 (section 5.4, opt-in per call site). A line is never both,
   and a species line is said bare, without the catchphrase (section 5.4).
6. **Babies and children get no species line.** A baby keeps its baby talk (`_babySet`). A
   child gets the **cadence** only (it already has its own poses, and no persona, so a
   species line would have no coin before it); the **teen and adult** get the idle manner,
   the action lines and, in N4, the signature pose (first mate, 2026-11-03; review s2792 S2).
7. **Not while the pet's state owns the screen:** asleep, lights out, away, resting, sick,
   in a game, an egg; a game's prompt owns the bubble. This is the existing idle gate
   (`_free(s)`) plus the `resting` flag.
8. **Calm or reduced motion:** no new movement, lines only (as `_idleMoves` does now). A
   species line's `move` is skipped under `calm()` (section 5.4, `idle`).
9. **Nothing private.** The nature is a species fact. It reads no person's data, stores
   nothing on the server, and nothing about it joins an entity, bus event or log. No privacy
   table applies. (The "once a day" keys are `localStorage`, as every other card
   once-a-day.)
10. **Status screen, calls, notifications, quiet hours: unchanged** (the status page gains
    the one "nature" row of N3, nothing else). The axes must never look
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
  the `sunset` and `good_morning` cases in `card-moment.js` (now via `_clockLines`) (the `normal` argument
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
  `FILL` (`copy-scan.js:10-15`) has no home or food kind, and N1 added neither (it has no
  `{home}` line). **N2 adds `home` ("vivarium" and "kelp bed" are 8)**; no `food` kind
  (no line uses one).
- **No server, no save, no art.**

### N2: the action-line layer and the solo visit line (card only, tier 1, S-M)

**Status: SHIPPED (s2794), as written below.** Differences, the pin audit and the bench shots
are in section 16, "N2 shipped". The text that follows is the build brief as it was folded
(s2793) from review s2792 and the first mate's decisions of 2026-11-03 (section 16). Card, scan, tests and
bench only: **no server change, no save, no art, no `species.json` change, no heating flag**
(the `cozy`/`sunny` stand-in for `fire` stays; section 16).

**What it is.** Four keys, `idle`, `find`, `visit`, `link_host`, each an opt-in species
line in `_lines` (section 5.4 has the table, the cell shape, the lookup order, the draw
order and the rates). 22 cells. Snack and clean are the care scenes' and are not built here.

**Build, in order:**

1. **`lines-fresh.js`**, inside the `// --- fresh-expand copy` block: `SPECIES_LINES` (the
   table of section 5.4; cells `{ text, move }`, the `{home}` cells as `(home) => ...`).
   `lines.js`: `SPECIES_LINE_ODDS = 0.25` beside the other idle constants.
2. **`scripts/copy-scan.js`**: `SPECIES_LINES: { fill: "home" }` in `COPY_TABLES`;
   `FILL.home = "vivarium"` (8, the longest `words.home` of the 30; every function cell
   is scanned with it); `lines()` skips the key `move` (a move name is not copy). No
   `food` kind: no N2 line uses a food.
3. **`card-tick.js`, `_lines`**: the `{ nature }` option and the `move` in the result
   (section 5.4, "How a species line is said"). A small helper `_natureCells(s, key)`
   (the lookup order and the dropped-cell rule) is what the tests call. **No `_natureLine`
   public helper, no `tuck`/`pat` keys, no `snack`/`clean` keys.**
4. **`card-tick.js`, `_idle`**: extract `_idleMove(s, move)` for `look`, `wander`, `perk`,
   `settle`, `munch`, `rock` (the same ms as today: 1800, 2200, 320, 2500, 1500, 600);
   `_idle`'s own `if/else` calls it for those moves (no behaviour change for them); the
   `mumble` branch passes `nature: "idle"` when `key === "idle"` and calls `_idleMove` for
   the result's `move` only when `!isCalm`. The `mumble` branch is reached under calm: the
   line is said, the move is not.
5. **`card-visitors.js`**: `_findLine` passes `nature: "find"` on its V1 branch only;
   `_visitorGreet`'s last branch passes `nature: "visit"`.
6. **`card-link.js`**: the `link_host` `_lines` call passes `nature: "link_host"`. The
   `link_guest` call is untouched.
7. **No new `.pet.<cls>` animation, no CSS.** The moves are existing classes, so
   `motion_rule.test.js` needs nothing (it lists `perk`, `settle`, `munch`, `rock`
   already, from N1).

**Not built (decided, section 16):** snack and clean lines; any change of timing, `perk` or
`look` on a greeting; any line on `link_guest`; the `tuck` and `pat` keys; child lines;
the dream layer (server); Hop flavour; the heating flag.

**Existing pins to audit and update in the same ship**, listing each in the report
(a constant-`Math.random` pin with no persona list for the key takes the species roll for
r < 0.25). `scripts/card-check.js`: the idle order (~7541-7546); the greet/sunset pin
(~7514; `_greet` and `sunset` take no species key, expected safe); the games pins
(~3897, ~3911), `wish_granted` (~5495) and `how_day` (~7012), all expected unaffected
(their keys do not opt in); ~12639; and `_linkStart` with `Math.random = () => 0`
(~13194: a typed host's persona coin takes the persona first; a persona-less builder host
would show the species hello). Plus any `tests/js` file that pins `Math.random` around
`_lines`. The dev pet's species and stage decide which bite; the rule is to pin the
expectation to the new order (section 5.4), never to loosen it.

**Copy: 22 lines, FM-approved (section 16), copy scan PASS (s2793, 2026-11-03).**
Re-run with `node scripts/copy-scan.js` (or `node --test tests/js/fresh_copy.test.js`)
once the table is in; every line below was checked for the scan's rules (NAG words,
`?`, `!!!`, digits, 40 characters with `{home}` = "vivarium") and for the banned words
(favourite, fond, love, best): longest "\*came back with something\*" 26, then
"\*nudges a bit into place\*", "\*glows a little brighter\*", "\*flickers in a tiny loop\*",
"\*peeks first, then waves\*" 25.

| Key | Lines |
|---|---|
| `idle` (16) | hoarder: "\*tucks something away\*" munch, "\*pats its cheeks\*". builder: "\*fixes up the {home}\*" settle, "\*nudges a bit into place\*". basker: "\*a long, slow stretch\*" settle, "\*soaks it in\*". groomer: "\*grooms\*" rock, "\*smooths itself down\*". explorer: "\*sniffs around\*" wander, "\*pokes at a corner\*". watcher: "\*watches closely\*" look, "\*stays very quiet\*". performer: "\*hums a little tune\*" perk, "\*does a tiny twirl\*". own firefly and lunamoth: "\*glows a little brighter\*" perk, "\*flickers in a tiny loop\*" |
| `find` (2) | hoarder "\*stashes it, happily\*"; explorer "\*came back with something\*" |
| `visit` (3) | solo "\*peeks first, then waves\*"; watcher "\*ears up\*"; explorer "\*sniffs the air\*" |
| `link_host` (1) | builder "\*shows off the {home}\*" |

The builder lists the working text in the report, as the dig's and Hop's did.

**Acceptance** (section 10 has the full list): the JS tests and the bench shots there; the
card-check sections `moments personality types visitors infrared` with the pins above
updated; `scripts/gate --auto` for the worker, the first mate's batch gate as usual.

**Bench changes this ship makes** (section 10 names the shots): `idle.species` and
`link.rolls` (section 10), documented in `dev/bench/README.md`.

- **Dreams: dropped from N2.** The server picks the dream kind every morning from
  `PLAIN_DREAMS`, a rotation shuffled per pet (`model.py:3163-3210`, `plain_dream` always
  returns a kind); the card maps kind to text (`ui-copy.js:299-330`) and keys its callbacks
  off the pick (`card-moment.js:402-435`). There is no plain dream "to colour", and a habit
  dream that differed from the server's kind would disagree with `pet.dream`. Adding habit
  kinds to `PLAIN_DREAMS` is a server change (and `test_model.py:2312` pins `>= 15`
  distinct kinds), which this plan forbids. If the owner wants habit dreams, that is a
  separate plan with a server ship.
- **Hop:** no habit flavour in Hop's win lines. They stay plain, as decided (section 1).

### N3: the field note and the Assist note (data + card + a small server change, tier 1, S-M)

**Not "data + card".** N3 is server code, so `pick-sections` goes to `all` and the gate is
`scripts/ci-gate` (AGENTS.md), not a partial card-check. N3 is **build-ready** once the one
open line below (octopus) is settled: review s2795 and the first mate's decisions of
2026-11-03 (the "N3 fold" section at the end; section 15 has each finding's fate) are
folded in. Line numbers below are on `origin/main` `6d82439a`; names win over numbers.

**Reconciled against what N2 shipped (s2794).** Nothing in N3's build changes; these are the
assumptions that moved, one note each:

- *The scan.* N3's notes live in `species.json`, not in the card's copy block, so
  `copy-scan.js` (which N2 gave a `home` fill and a `move`-key skip) does not read them. The
  data test stays the only check on them (60 characters, the banned words).
- *Wording must agree with the lines.* The notes sit beside N2's action lines, so they must
  not contradict them: the **firefly and lunamoth** say "glows a little brighter" and
  "flickers in a tiny loop" (an `own` cell), not the performer's hum and twirl, so their
  notes must not say "hums" or "sings". A **solo** species peeks first at a visitor ("peeks
  first, then waves"), whatever its habit; a note must not call a solo watcher or explorer
  "alert at visitors" or "sniffs the air at visitors" (only the social deer, corgi and
  duckling say those). No note promises a frequency (the lines are at most 1 in 4, 12.5%
  for a typed pet).
- *`nature` is also a `_lines` option now.* `_lines(s, key, normal, arg, { nature })` means
  "ask the species table", unrelated to the `nature()` data helper N3 reads (the helper
  stays global; the option is a local name, `natureKey`, inside `_lines`). N3 adds no
  `_lines` call and no `SPECIES_LINES` key.
- *The status page is untouched by N2.* `_renderStatus` (`card-status.js`), the
  "personality" row and its 420/330/300 and big-text shots are as N3 describes them.
- *The bench.* N3's shot (the status row at 420, 330 and 300, in big text) is a new preset or
  a `--preset nature` addition; `nature()` now has 39 more N2 shots after N1's, so a new
  group name (`nature-note`) keeps its sheets apart. `idle.species` and `visitor.species`
  do not matter to it.
- *The gate.* Unchanged: server code, so `scripts/gate --auto` picks `all` and the batch
  gate is `scripts/ci-gate`. The new N2 card-check cases sit in `personality`, `visitors`
  and `infrared`, not in anything N3 reorders.

- **The notes.** **30 hand-written lines, one per species** (decided, section 1), not a
  template: the three-clause frame below, with a **species-specific third clause** so no two
  notes are equal. They live in `species.json` as a sibling of `nature`, **on the line right
  after `nature`** (`otter/species.json:36`), away from the `acts` line the pending
  `art-128-*` branches rewrite in all 30 files (the same hazard as N4's `signature` key):
  `"field_note": "up with the day · warms up in sun · hums and twirls"`. One text, two
  readers (below). A species with no `field_note` has none (the beetle has no
  `species.json` at all, so it is not in the catalog).
- **The frame (decided, Q2).** `<clock> · <sky> · <species clause>`. Clock: day "up with the
  day"; dusk "livelier at dusk"; night "livelier after dark" (never "wakes" or "awake at
  night": section 4 says night means livelier after dark, not awake all night, and a model
  rephrases "wakes at night" into "Pip is awake all night" beside a pet that is asleep, Q5).
  Sky: sun "warms up in sun"; rain "perks up in rain"; snow "frisky in snow"; fog "goes
  quiet in fog"; wind "stirs in the wind"; **fire "snug in a warm spot"** (house-neutral:
  the fire sky shows as `fireside`, `cozy` or `sunny` in a house, section 16 item 1, so
  "by the fire" would read as untrue in a house with no fire, Q7); moon "stirs at full
  moon". The clock and sky of every note must match that species' `nature` block (section 4
  table); a data test checks it.
- **The 30 notes (copy, FM-approved 2026-11-03, final).** Lengths are characters.

| species | len | note |
|---|---|---|
| bird | 51 | up with the day · warms up in sun · hums and twirls |
| squirrel | 51 | up with the day · stirs in the wind · keeps a stash |
| deer | 54 | livelier at dusk · goes quiet in fog · watches closely |
| fox | 47 | livelier at dusk · frisky in snow · pokes about |
| bananaslug | 53 | livelier after dark · perks up in rain · slides about |
| gecko | 58 | livelier after dark · snug in a warm spot · licks its eyes |
| tarantula | 57 | livelier after dark · snug in a warm spot · digs a burrow |
| tortoise | 49 | up with the day · warms up in sun · basks a while |
| beardeddragon | 51 | up with the day · warms up in sun · basks on a rock |
| ballpython | 55 | livelier after dark · snug in a warm spot · keeps watch |
| kitten | 57 | livelier at dusk · snug in a warm spot · kneads a blanket |
| bunny | 56 | livelier at dusk · snug in a warm spot · grooms its ears |
| corgi | 53 | up with the day · frisky in snow · herds things about |
| hamster | 60 | livelier after dark · snug in a warm spot · fills its cheeks |
| ferret | 56 | livelier at dusk · snug in a warm spot · hides treasures |
| otter | 49 | up with the day · perks up in rain · grooms often |
| octopus | 58 | livelier after dark · goes quiet in fog · slips into nooks |
| seal | 53 | up with the day · warms up in sun · hauls out to bask |
| hermitcrab | 54 | livelier after dark · perks up in rain · keeps a stash |
| puffin | 51 | up with the day · stirs in the wind · digs a burrow |
| treefrog | 56 | livelier after dark · perks up in rain · hums and twirls |
| axolotl | 58 | livelier after dark · goes quiet in fog · drifts and waits |
| pondturtle | 50 | up with the day · warms up in sun · basks on a log |
| duckling | 50 | up with the day · perks up in rain · paddles about |
| beaver | 57 | livelier after dark · frisky in snow · builds with sticks |
| bat | 55 | livelier after dark · stirs at full moon · twirls about |
| lunamoth | 57 | livelier after dark · stirs at full moon · flickers about |
| owl | 53 | livelier after dark · goes quiet in fog · keeps watch |
| firefly | 55 | livelier after dark · perks up in rain · glows brighter |
| opossum | 58 | livelier after dark · snug in a warm spot · makes a hollow |

  Checked 2026-11-03 (s2796): all 30 are distinct; none has a digit, `?`, `!`, a NAG word
  or a banned word; all 30 are 60 characters or fewer. **Settled (first mate, 2026-11-03):**
  the octopus clause is "slips into nooks" (58; "squeezes into nooks" was 61). Hamster is exactly 60. Several are over what two
  lines hold at 330 (next bullet); the bench cap (Q4) is a ceiling, not a target, and the
  longest note decides it.
- **Wording rule.** The notes say what the body does, never a liking: "perks up in rain",
  "warms up in sun", "stirs at full moon". Never "favourite", "fond of", "loves", "best".
  (Review S2: "fond of rain" would be rephrased by the model as "loves rain", the
  favourite-weather line the voices plan dropped for the pet,
  `plan-2026-10-28-voices-and-lines.md:108`.) No note promises a frequency, names a stat or
  ranks; firefly and lunamoth do not say hum or sing; no solo species is "alert at visitors"
  (N2's reconcile).
- **The surface (card).** The **status page** (`_renderStatus`, `card-status.js`; not the
  settings sheet, whose `favRows` and `memory` rows R3 and M2 changed): one row,
  "nature", showing the field note of **the pet's own species** (`s.species`, the object
  `card-build.js` sets from `species.json`, `:599-602`).
  - **Placement.** Its own line right after the personality line (`card-status.js:159`),
    **not** inside the `teenOrAdult` test, so it sits in the same place at every stage.
    `row(null, "nature", ...)`, with `.replace('class="row"', 'class="row naturerow"')` as
    `friendsrow` does (`:152`), so the bench's `scroll` can name it.
  - **Stages (Q3): every hatched stage, never the egg.** It is a species fact, not a pet
    line, so section 6 rule 6 (lines for teen and adult only) does not apply. The egg's html
    branch has no rows (`:131-137`) and its `s.species` is the world's `roster[0]`
    (`card-build.js:596`): **read the note only in the non-egg branch**, and the acceptance
    list has an egg shot that shows no nature row.
  - **No note, no row** (`if (note)`).
  - Leaks nothing: that pet is hatched, so its species is never a "???" locked tile. The
    journal's species tiles (name only, `card-journal.js:143-160`; "???" at `:151` and
    `:473`) and the "every world" page get **no** note: the forms book that would hold four
    portraits is deferred (`plan-2026-10-28-forms-book.md:3`) and the note joins it if that
    book ships.
  - **Fit (Q4).** The value column is a `minmax(0,1fr)` grid cell after an 18px icon and an
    84px label (`style.js:1039`), 60px less in the porthole (`:1040`), so 60 characters do
    not fit one line. The status page scrolls, so nothing clips, but the row adds height.
    The builder benches the **longest note at 420, 330, 300 and big text** (and the
    porthole), reads the line count, and **sets the data test's cap to what the bench shows
    fits in two lines at 330**; the hard ceiling is 60 characters, whatever the bench says.
    The measured number goes in the report and in the data test's comment. If the longest
    note does not fit the measured cap, the builder reports it and does not reword.
- **The server (Assist).** `Catalog.species` already keeps the whole dict (`species.py`,
  `load_catalog`). So N3 adds:
  1. a map `species_notes: dict[str, str]` in `coordinator.py`, filled **in the
     `catalog.species` loop** (`:497-515`, where `catchphrases`, `likes` and
     `own_food_stages` are filled) and **not beside `species_names`**, which is built over
     `self.roster` only (`:492`): a pet whose species is outside the current roster (a
     `next_world` change, `:3335-3342`) must still get its note. Keep a note only when
     `isinstance(data.get("field_note"), str)` and it is non-empty. The map is a derived
     copy of `species.json`, not a second source;
  2. a slot `species_note` in the status data at `intent.py:283` (beside `species`), from
     `species_notes.get(state.species or "")`, so an egg (`state.species` is `None`) and a
     species with no note give `None`. The slot carries a species fact only, so the
     privacy mask (`current_mood` returns `asleep` for away + privacy) leaks nothing new;
  3. **one sentence in the LLM `PROMPT`** (`llm.py:37`, built by `.format(names=...)` at
     `:75`, so no braces in it), placed **before "Care for it only when asked to."**
     (`test_assist.py:467` pins `PROMPT.endswith("never guilt, nag or worry the
     person.")`, so the ending stays and the test needs no edit; the `VOICE_NOTES` loop at
     `:463` stays satisfied). The sentence (approved as copy, Q6, 194 characters):
     > 'species_note' is how that kind of creature is built, not a taste: let it colour what you say now and then, never quote it, and never say the pet likes, loves or prefers something because of it.

     The prompt already says "fond of snacks and naps" and "loves a little song", so the
     model is primed to talk in liking words; the sentence forbids it outright. **A test
     can only check the string is present; the model's behaviour is not testable by a
     worker** (section 10 says so).
  `spoken_status` stays unchanged (a golden; it takes no note, `intent.py:146`). The note
  names the species, not any person.
  Tests in Python: the map (equal to the `species.json` files, including a species outside
  the roster), the slot (note, none, egg), the golden, the prompt without a new brace and
  with the sentence before "Care for it only when asked to", and the data tests (section 10).
- **Docs and cache.** `sprites/README.md` (under `custom_components/virtual_pet/frontend/`):
  add a `field_note` row, and fix the `nature` row's `company` text, "(not read yet)" is
  stale after N2. `loadJson` fetches `species.json?v=${VERSION}` (`ui-copy.js:689`), so the
  edited files reach a cached browser only if `VERSION` moves in the ship: the builder
  checks the release process does it, and if not, bumps it in N3.
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
  dropped that stays true. The README gets a `signature` row. (The `nature` row and the
  `field_note` row are done: N1 and N3 added them, N3 also fixed the `company` text.)
- **The field notes sit beside the poses (N3 shipped, s2797).** The adult's status page now
  reads a one-line note, and its third clause is a habit in words ("kneads a blanket"). A
  signature pose should not contradict it. Table below against the notes: **agree** for
  most; the art lead should look at the three that pull apart: **kitten** (note "kneads a
  blanket"; pose `lick_paw`, while the child already has `knead`), **seal** (note "hauls
  out to bask"; pose `banana`) and **tarantula** (note "digs a burrow"; pose `web_mend`).
  Either side may move: a pose swap is N4's, a note change is copy (the first mate, and the
  data test's checks apply). Nothing is changed here. `field_note` is the line right after
  `nature` and `signature` goes before `waves`, so the two keys are never adjacent.
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
| tarantula | builder | `dig` **new** (first mate 2026-11-03: matches the note "digs a burrow"; was `web_mend`) | (`wave`, `hair_flick`, `molt`) |
| tortoise | basker | `neck_sun` **new** | (`hide`, `dig`, `munch`) |
| beardeddragon | basker | `bask` | `bask` |
| ballpython | watcher | `tongue_flick` | `tongue_flick` |
| kitten | groomer | `knead` (first mate 2026-11-03: matches the note "kneads a blanket"; was `lick_paw`) | `knead` |
| bunny | groomer | `ear_wash` **new** | (`binky`, `flop`, `thump`) |
| corgi | explorer | `ball_fetch` | `ball_fetch` |
| hamster | hoarder | `cheeks` | `cheeks` |
| ferret | hoarder | `stash` **new** | (`war_dance`, `tunnel`, `dook`) |
| otter | groomer | `float_groom` **new** | (`rock`, `hold_paws`, `kelp_wrap`) |
| octopus | explorer | `jar` | `jar` |
| seal | basker | `bask` **new** (first mate 2026-11-03: matches the note "hauls out to bask"; was `banana`) | (`banana`, `flipper_clap`, `splash`) |
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
point is known), then the **8 new ideas** (`sing`, tarantula `dig`, `neck_sun`, seal `bask`,
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
- `this._natureCells(s, key)` (N2), the lookup that returns the `{ text, move }` cells for
  a species and key (empty when there are none). N2 ships cells for `idle`, `find`, `visit`
  and `link_host` only. **There are no `snack`, `clean`, `tuck` or `pat` keys** (first mate,
  2026-11-03; review s2792 B1, Q7): the care scenes already pick a gesture by
  `nature().habit` and time a beat by pace, and say their own lines (`SNACK_LINES`, the
  tuck's `LIGHTS_LINES`, the touch ladder's `PAT_RUN_LINES`; the clean scene says none), so
  an empty key would have no caller and a test of it would prove nothing. A later ship
  that wants a species line in a scene adds the key, the cells and its call in the same
  change: for the snack, the species line replaces the `SNACK_LINES` pick when the habit
  has one (same 1-in-4), and for the clean a new end beat of `SCENES.clean`.
- The `move` of a cell (`munch`, `settle`, `rock`, `perk`, `look`, `wander`) is an existing
  CSS class or idle move (`style.js:357-362`, `_idleMove`); a sequence may use the habit's
  move for a beat.
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
- **N2 has no `snack` or `clean` call site.** Care B1/B2 landed first: feed, snack, clean
  and medicine are scenes (`card-care.js`), and for the person's own press `_care` offers
  the scene first and `_react` never runs. A species line there would be a competitor in
  an existing 1-in-4 slot (the snack's) or a new end beat (the clean's), which is the
  scenes' territory. N2 builds the table and the four keys; N1 and the N3 notes are
  untouched either way.
- **The first mate sequences it:** N1 and N3 do not depend on the core-interactions design;
  N2 no longer waits for it.

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
- **N2:** added to `--preset nature` (or a `--preset lines` beside it, the builder's call):
  - an `idle` species-line shot per habit (7, first cell, an adult, 330) and the two light
    performers' cells (firefly "\*glows a little brighter\*", lunamoth "\*flickers in a tiny
    loop\*"), and the same lines at 300;
  - a solo visitor greeting ("\*peeks first, then waves\*", e.g. fox), a social watcher's
    ("\*ears up\*", deer) and a social explorer's ("\*sniffs the air\*", corgi), through the
    `visitor` hook with the species roll pinned (the `visitors` preset's shape);
  - a builder host's link line (`link.say: "host"`, tarantula or puffin, `{home}` =
    "burrow");
  - **mono mode and big text for the longest lines**, named: the longest line is
    "\*came back with something\*" (26, `find`), then "\*nudges a bit into place\*",
    "\*glows a little brighter\*" and "\*flickers in a tiny loop\*" (25); the longest
    `{home}` among the builders is "burrow" or "hollow" (6: tarantula, puffin, opossum;
    the 8-letter homes, "kelp bed", "lily pad", "vivarium", belong to species whose
    lines take no fill). A child shot and a baby shot show **no** species line.
  - The find line is proved in JS (below) and shot only if the bench already pins a V1
    find; the builder adds no find hook.
  - **Bench hooks N2 adds** (they cannot be pinned today): `idle.species` (true): the
    persona coin forced to fail and the species roll forced to pass, so the pinned draws
    are the delay 0, the move 0 (`mumble`), `pick(lines)` 0.1, the coin 0.9, the roll 0.1,
    then `idle.draw` for the cell pick (the hook is for one pet, so no neighbour roll);
    and `link.rolls` for the order of section 5.4 (`pick` of the normal hello, the persona
    coin >= 0.5, the roll < 0.25, the cell pick, then the guest's draws). Both go in
    `dev/bench/README.md`.
- **N3:** `view: "status"` with `scroll: ".naturerow"` at 420, 330 and 300 and in big text
  (and the porthole): one species per world, **the longest note** (its line count sets the
  data test's cap, section 8 N3), and a teen or adult, a child and a baby. An **egg shot
  shows no nature row.** The Assist output is a test, not a shot.
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

- **No species line at baby or child** (N2: the idle, visit and link host lines; N1's
  sky reaction already skips a child), and a baby set wins a key over a species line.
- (N1, built; not N2's work:) **the sky reaction runs once** for a flag and **not twice in
  a day**, across a reload (`localStorage`); **no sky reaction** while asleep, lights out,
  away, resting, in a game; **the cadence** of a quick and a slow species differs.
- N2 adds:
  - **a solo species' visitor greet says the same timers and frames as a social one** (no
    delay, no extra animation class; `greethop` plays once), and its line, when the roll
    takes it, is "\*peeks first, then waves\*";
  - **no server call** from any nature behaviour (the card-check stubs count calls: none
    new).
- The **existing idle expectations are updated** in the same ship (section 5.1 and the pin
  audit in section 8, N2): the `Math.random` order and `NORMAL_GREET`; the re-timed "idle
  life happens by itself" window is N1's and done.
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
- **Python, N3:** the coordinator's `species_notes` map equals the `field_note` of every
  `species.json` in `catalog.species` (including a species outside the current roster);
  `intent.py`'s status data has `species_note` (None without a note and for an egg);
  `spoken_status` is byte-for-byte unchanged (a golden); the LLM prompt has no braces
  added, contains the species-note sentence before "Care for it only when asked to", and
  `test_assist.py`'s `endswith("never guilt, nag or worry the person.")` still passes
  untouched. **The data test over the 30 files:** each `field_note` is a non-empty string,
  at most 60 characters (or the bench-set cap, section 8 N3, whichever is lower); all 30
  are distinct (a duplicate fails); its clock and sky clauses match the species' `nature`
  block (section 4 table); no digit, `?` or `!`; no NAG word; and none of the banned
  words, matched on **word boundaries** (`\b(favou?rite|fond|loves?|best)\b`, so "glove" or
  "clover" pass). **The model's behaviour is not testable by a worker**: the tests check
  the sentence is present and the slot is filled, not that the model obeys it.
- **Python, N4:** every `signature` sprite exists, its stage is in `stages` and is not
  `baby` or `child`, and the existing grid test covers the frames.
- **JS, N3:** a test over the 30 `species.json` `field_note`s that reuses `NAG` from
  `scripts/copy-scan.js` (**export it**: today only `scanFreshCopy`, `COPY_TABLES` and
  `FILL` are exported, `:115`), so the card's copy rule and the data cannot drift; it also
  checks the status page shows the row for a teen and a baby and not for an egg.
- **JS (`node --test tests/js`):** a `nature_lines.test.js` reading the card source as
  `dream_lines.test.js` does: every sky has 2 lines, every clock 2 (per moment), every
  habit its keys (an absent cell is absent, not an empty list); none has a nagging word, a `?`, a digit,
  "favourite", "favorite", "fond", or more than 40 characters with the longest `{home}`
  fill; **no cell text contains `undefined` or an unfilled brace for any of the 30
  species' `words` (and stage words)**; `paceOf` thresholds; `SPECIES_ADDS` names only
  moves `_idle` handles and at most 3 copies. N2 adds:
  - **the cell shape**: every cell is `{ text, move? }`, `text` a string or a function,
    `move` in `perk settle munch rock look wander` and only on `idle`;
  - **the lookup order**: `own` over `company` over `habit`; the 15 solo species get
    "peeks first" for `visit`, deer "ears up", corgi and duckling "sniffs the air", every
    other social species none; firefly and lunamoth get the glow cells, bird, treefrog and
    bat the hum and twirl; a missing `nature` or key gives no cell; a cell whose `{home}`
    is missing is dropped and an empty pool draws nothing;
  - **the cap**: a sweep of the random value through `_lines` with `nature` gives a species
    line for `r < SPECIES_LINE_ODDS` of the draws that reach the roll and never otherwise;
    never for an egg, a baby or a child (also with baby talk off), never after the persona's
    coin took the line; **a call without `nature` draws exactly the `Math.random` count it
    drew before** (count the calls) and returns no `move`; a key with no cell draws the same
    count too;
  - **the keys**: `idle` only for the `idle` key (not `idle_bored`, `idle_excited`, a
    bodily mood, a resting pet or a neighbour line); `find` only on the V1 branch (a V3 find
    with a visitor and a V2 first find keep their lines, with any roll); `visit` after the
    guest, pair, favourite and friend lines; `link_host` replaces only the host's hello
    (the guest's reply and `L.said`'s other entries unchanged), and only a builder host
    has a cell;
  - **the move dispatch**: `look` goes through `_look`, `wander` through `_wander`, the rest
    through `_animate` (spy on all three); under `calm()` the line is said and no move is
    made; `_idle`'s own move branches still call the extracted `_idleMove` with the same
    classes and ms; no `.pet.<cls>` rule is added (`motion_rule.test.js` unchanged);
  - the look rule (above); a missing nature gives nothing.
- **Copy scan** (`scripts/copy-scan.js`) passes with `SPECIES_LINES` named in
  `COPY_TABLES` (`fill: "home"`), the `home` fill kind added and `move` skipped.
- **Save:** an existing save loads unchanged (nothing saved by nature); `PetState` unchanged
  (a diff check in review).

## 11. Copy budget

N1's and N2's lines are approved (N1 as shipped, section 16; N2 by the first mate on
2026-11-03, with the one new line noted in section 16); N3's 30 notes are **approved**
(first mate, 2026-11-03, listed in section 8 N3), except that the octopus note is one
character over the ceiling and waits for the first mate (section 8 N3). The count is the plan's, not a limit on
the builder's fewer.

| Ship | Lines | Made of |
|---|---|---|
| N1 | about 20 | sky 7 x 2 = 14; clock 3 x 2 = 6 variants of the existing sunset and good-morning lines |
| N2 | 22 (FM-approved) | idle 16 (7 habits x 2, plus the 2 light-performer cells); find 2; visit 3; link host 1. No snack, clean, company-beat or dream lines |
| N3 | 30 hand-written notes, plus 1 prompt sentence | one per species |
| N4 | 0 | art only |
| **Total** | about 48 lines (N1's 26 as shipped, N2's 22), plus 30 notes | |

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
- **Risk: the sequences of the core-interactions effort** (now landed as the care scenes)
  own the snack and clean moments; N2 has no call site there (section 8a), so it cannot
  collide with them.

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
   child get the manner or a species line (it should not: only the cadence)? Is there a
   stage test, with baby talk on and off?
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
    species line that was not rolled? Is the roll after the persona's, and does a call
    without `nature` draw exactly what it drew before (count `Math.random`)?
13. **Company.** Is a solo greet ever cold, refusing, or sad? N2 adds no beat: does the
    diff touch a visitor timer (`greetAt`, `VISIT_STAY_MS`), call `_look` or `_animate` on
    a greeting, or move the link guest's reply (`t0+1800`)? (It must not.)
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
    add up to the ship lines (N2's 22: idle 16, find 2, visit 3, link host 1)?
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

### Review s2792 (N2): what became of each finding

The adversarial review of N2 (`~/.local/state/crew/archive/hatch-at-home-s2792-20261103-0306/report.md`)
was read against `origin/main` `f3099b1d`; the load-bearing claims were re-checked in the
code by s2793 (`_lines` at `card-tick.js:239`, the `_idle` move branches, `_findLine`,
`_visitorGreet`, `_linkStart`, `copy-scan.js`). All held. Verdict "ready after fold"; the
first mate took every recommendation on 2026-11-03 (section 16). **Folded here, in the
sections named.**

| # | Finding | Fate | Where |
|---|---|---|---|
| B1 | Snack and clean call sites in `_care`/`_react` are dead paths since care B1/B2 (scenes own them; the clean says no line; the snack has a 1-in-4 `SNACK_LINES` slot; habit already picks the snack variant) | **Taken (Q1):** snack and clean are out of N2; N2 keys are `idle`, `find`, `visit`, `link_host`; 4 cells cut; counts fixed | 5.4, 8 N2, 8a, 11, 12 |
| B2 | Company beat collides with `greethop` (a second one-shot class), the existing look at `inMs`, the 3 s stay, and the link reply at `t0+1800` | **Taken (Q2):** lines only; social unchanged; solo "peeks first" line on `visit`; nothing on `link_guest`; no delay, `perk` or `look` call; the `look`/`perk` rows and the card-check case that asserted a difference are cut | 5.5, 8 N2, 10, 14 (13) |
| B3 | Three quoted lines fail the copy scan (`still`, `pleas*` twice) | **Taken (Q6):** "\*stays very quiet\*", "\*stashes it, happily\*"; the groomer clean cell is cut with B1. Scan PASS on all 22 lines | 5.4, 8 N2 |
| B4 | `[text, move]` does not fit: `look`/`wander` are `_look`/`_wander`, not `_animate`; calm is unspecified | **Taken:** `_idleMove(s, move)` extracted from `_idle`'s own branches; the `mumble` branch calls it after `_write`, only when `!isCalm`; calm = line only | 5.4, 8 N2, 6 (8), 10 |
| S1 | A roll inside `_lines` adds a draw to ~40 callers and has nowhere to return a move; keys do not match; "1 in 4" is only the ceiling | **Taken (Q4):** opt-in `_lines(..., { nature })`, `{text, baby, move}`; a call without it is byte-identical; keys mapped; the rates stated (12.5% typed, 25% for `find`) | 5.4, 6 (4), 10 |
| S2 | Child lines contradict themselves (6 vs 10 vs 16) | **Taken (Q3):** teen and adult only; rule 6 and the tests fixed | 6 (6), 10, 14 (6) |
| S3 | `host` is not a new call site; the line would replace "hi, {guest}!" | **Taken (Q5):** `link_host` opts in on the existing call; an alternate hello for the builder at the usual 1-in-4; guest reply unchanged; nothing on the guest | 5.4, 8 N2 |
| S4 | `find` replaces informative V3/V2 lines; "wanders over first" claims an unplayed motion; solo vs habit `visit` overlap | **Taken:** `find` on the V1 branch only; `visit` lookup `own`, then `company`, then `habit` (solo wins); the explorer visit cell is reworded to "\*sniffs the air\*" (**the one new line, section 16**) | 5.4 |
| S5 | Existing constant-`Math.random` pins in card-check; §5.1's draw order omits the neighbour roll and the `normal` pick | **Folded:** the pin list is the builder's audit, each listed in the report; §5.1 and §5.4 give the corrected order | 5.1, 5.4, 8 N2 |
| S6 | `FILL` has no `home`; one fill per `COPY_TABLES` entry; no line uses `{food}` | **Folded:** one table, `fill: "home"` (= "vivarium", 8); `food` dropped; `move` skipped by the scan; the bench names the longest line and the longest builder home | 8 N1, 8 N2, 10 |
| S7 | A cell that is a pair and a function of `words` needs one shape | **Taken:** one shape, `{ text, move }`, `text` a string or `(home) => string` | 5.4 |
| S8 | Bored/excited/bodily moods | **Taken:** the `idle` key only (content and cozy); rule 7 is then automatic | 5.4 |
| S9 | Acceptance needs a bench hook the plan did not name; the sky/cadence cases are N1's | **Folded:** `idle.species` and `link.rolls` named; N1's cases marked as built, not N2's | 10 |
| S10 | Stale file:line claims | **Folded:** the ones N2 touches now cite names; §2 carries a note that its numbers are old | 2, 5.1, 5.4, 8 |
| N-1 | The glow variant was unwritten | **Taken (Q6):** "\*glows a little brighter\*", "\*flickers in a tiny loop\*" for firefly and lunamoth (the `own` level) | 5.4 |
| N-2 | Copy counts inconsistent (40 / 27) | **Folded:** 22 lines | 0, 8 N2, 11 |
| N-3 | Table counts | Nothing to change | n/a |
| N-4 | "\*went looking, and look!\*" reads as speech | **Taken (Q6):** "\*came back with something\*" | 5.4 |
| N-5 | §16 item 6 "mumble branch only" | **Folded:** "an opted-in `_lines` call"; item 6 corrected | 16 |
| N-6 | The `fresh` / `_lastPick` sentence is wrong for N2 | **Folded:** dropped; the checklist item changed to the draw-count check | 5.4, 14 (12) |
| N-7 | A fill word missing: dropped or skipped? | **Folded:** the cell is dropped from the pool; an empty pool draws nothing | 5.4 |
| C1 | §0 "never in behaviour" is no longer true of care (the scenes read habit and pace) | **Folded:** a clause in §0 | 0 |
| C2 | Heating flag is "an N2 question" and not addressed | **Taken (Q8):** no flag, no server change; `cozy`/`sunny` stays | 8 N2, 16 |
| Neg. | Empty `tuck`/`pat` keys have no consumer | **Taken (Q7):** dropped; a future ship adds key, cells and caller together | 8a |
| Neg. | Hop win lines plain; no dream; babies get none | Consumers are named or untouched; kept | 8 N2, 6 |

### Review s2795 (N3): what became of each finding

The adversarial review of N3 (`~/.local/state/crew/archive/hatch-at-home-s2795-20261103-0415/report.md`,
with `renders/proposed-notes-scan.txt`) was read against `origin/main` `6d82439a` and the N2
branch. Verdict "not build-ready" (the notes did not exist); the first mate took every
recommendation on 2026-11-03 (the "N3 fold" section at the end). **Folded here, in the
sections named.**

| # | Finding | Fate | Where |
|---|---|---|---|
| B1 | The 30 notes do not exist; the one example fits no species | **Taken (Q1):** the 30 drafts are in section 8 N3, with the fire sky "snug in a warm spot" and ten species clauses chosen by the first mate. 29 pass; **the octopus note is 61 characters and waits** for the first mate | 8 N3, 11 |
| S1 | `test_assist.py:467` pins the prompt's last words | **Folded (Q6):** the sentence goes before "Care for it only when asked to"; no test edit | 8 N3, 10 |
| S2 | Stale line numbers (`coordinator.py`, `intent.py`) | **Folded:** names first, numbers re-checked on `6d82439a` (`:492`, `:497-515`, `intent.py:283`) | 8 N3 |
| S3 | The map is built beside `species_names` (roster only) | **Folded:** built in the `catalog.species` loop; a test compares the map to the files, including a species outside the roster | 8 N3, 10 |
| S4 | The 60 cap is not derived from the layout | **Taken (Q4):** the bench measures the longest note at 420/330/300/big text and sets the cap; 60 stays the hard ceiling; the row gets `.naturerow` | 8 N3, 10 |
| S5 | "wakes at night" against section 4 | **Taken (Q5):** "livelier after dark" / "livelier at dusk" | 8 N3 |
| S6 | The scan does not read the notes; substring banned words hit "glove" | **Taken:** Python data test with word-boundary banned words and NAG; JS test reusing `NAG`, exported from `copy-scan.js` | 10 |
| S7 | Notes from the nature block alone are templates (kitten = bunny, owl = axolotl) | **Taken (Q2):** a species clause per note; a test fails duplicates | 8 N3, 10 |
| S8 | The prompt already primes "fond of", "loves"; model behaviour is untestable | **Taken (Q6):** the sentence forbids liking words; section 10 says a worker cannot test the model | 8 N3, 10 |
| N-1 | Row placement; stages; egg | **Taken (Q3):** every hatched stage, own line after the personality line, never the egg (non-egg branch, an egg shot shows no row) | 8 N3, 10 |
| N-2 | Rule 10 says the status screen is unchanged | **Folded:** "unchanged except the one nature row" | 6 |
| N-3 | Settings sheet vs status page | **Folded:** "status page, not the settings sheet" | 8 N3 |
| N-4 | `sprites/README.md` stale after N2 | **Folded:** N3 fixes the `company` text and adds `field_note` | 8 N3, 14 (22) |
| N-5 | `species.json?v=${VERSION}` cache | **Folded:** the builder checks `VERSION` moves in the ship | 8 N3 |
| N-6 | Merge hazard with `art-128-*` | **Folded:** `field_note` on the line right after `nature` | 8 N3 |
| N-7 | Gate | Already stated: `ci-gate`; the LLM behaviour is out of reach | 8 N3 |
| N-8 | Privacy | Checked fine; stated in the slot bullet | 8 N3 |
| Held | `Catalog.species` keeps the dict; 30 `nature` blocks match section 4; no lock leaked; negative claims have consumers | Kept | 8 N3 |

## 16. N1 shipped: corrections for N2-N4

N1 is built (branch `crew/hatch-at-home-s2742-n1-species-nature-data-idle-ma`, worker
s2742). Where the code differed from this plan, the code is right and N2-N4 read from it.

**First mate decisions on N1 (2026-11-02):**

- **Fire fallback = `cozy`, then `sunny`.** The `fire` sky reacts to `fireside`, else the
  `cozy` flag, else `sunny`. A real "heating on" flag (a server change) was an N2
  question: **answered no, 2026-11-03** (below).
- **A child skips the sky reaction** (section 10 wins over section 6 rule 6 for the sky).
  The cadence still applies to a child. N2's action lines: **none for a child**
  (decided 2026-11-03, below).
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
   move pick, and takes that idle tick. N2's species line roll (after the persona coin, in an
   opted-in `_lines` call, `idle` from the `mumble` branch) is unaffected. All idle changes sit in `_idle`, `_idleMoves`,
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

### N2 shipped (s2794): where the code differed, the pins, the shots

N2 is built as section 8 (N2) and 5.4 say. Where the code differed, the code is right and
N3-N4 read from it.

1. **Shape.** `SPECIES_LINES` (`lines-fresh.js`, 22 distinct lines; the firefly and lunamoth
   `own` cells are two entries with the same two lines) and `SPECIES_LINE_ODDS` and
   `IDLE_BODY_MOVES` (`lines.js`). `_lines` has `{ fresh, nature: natureKey }`; a call
   that names `nature` always returns `{ text, baby, move }` (`move` is `null` unless a
   cell with a move was taken), a call that does not returns `{ text, baby }` exactly as before.
2. **Helpers.** `_natureCells(s, key)` (the lookup, the home fill, the dropped cells; `[]`
   for a non-teen/adult or no nature) and `_natureCell(s, key)` (the roll, drawn only for a
   non-empty pool, then the pick) in `card-tick.js`; `_idleMove(s, move)` plays `look`,
   `wander`, `perk`, `settle`, `munch`, `rock` with the same ms (1800, 2200, 320, 2500, 1500,
   600), and `_idle`'s own branch calls it for `IDLE_BODY_MOVES`.
3. **The `mumble` branch** now takes the `_lines` result, writes it, then calls `_idleMove`
   for the move unless `calm()`. A resting pet, a neighbour line and a bodily mood do not call
   `_lines` at all, as before. The draw order is the one section 5.4 states.
4. **Bench.** `link.rolls` already existed (it was only undocumented for this use);
   `idle.species` is new and, not in the plan, **`visitor.species`** (`Math.random` pinned to 0
   for the greet so the species cell is taken). 39 shots in `--preset nature`.
   The idle species shots are calm (the line is the shot); the moves are proved by the JS tests
   and card-check.
5. **Pins audited** (card-check, by name; line numbers drift): the **idle order** in
   "P2b idle mumble" (draws delay 0, move 0, then `r`: heads r 0.1 is the persona's coin
   passing, tails r 0.9 fails the coin and the roll 0.9 is over 0.25, so no species line;
   `bored`, `excited`, and the bodily moods never reach the roll): expectations unchanged,
   the draw comment updated; the **neighbour check** ("gaps-seams 5b", `t.pet("adult", null)`:
   untyped; r 0.1 for `alone` now takes the species roll and says a species line, which the
   check does not forbid, `!/Nib/`): unchanged; the **greet/sunset side-by-side** (`show`,
   `Math.random = 0.1`, ~7514: `_greet` and `_moment` take no species key): safe, unchanged; the
   **games** pins (`_pickGame`, `_guess`, dig, lucky), `wish_granted`, `how_day`, the
   **meal lines** (~12639: `_mealLine`, no `_lines` nature) and the **feed** pin
   (`_react`, key `feed`): none opts in, safe; the **friend and favourite visitor** pins
   (`Math.random = 0.2`, the E3 and F4 cases): the friend and favourite branches come before
   the species line, and the "at 2 days, never a friend line" check passes on a species line
   too (not a friend line, non-empty): unchanged; `_linkStart` with `Math.random = 0`
   (kindred pair, mellow host): the typed host's persona coin passes first, no species line:
   unchanged. **Changed, because a real roll bites:** "visitors: the pet greets it with its
   wave frames ... and one of its lines" and the reduced-motion greet check (a real random
   greet; a teen or adult now says a species visit cell up to 1 in 4): the allowed-line list
   gains the species visit cells (read from `SPECIES_LINES`); the **V-C reveal's V1 check**
   (a real-random reveal of a hoarder or explorer says its find cell 1 in 4): accepts the
   species' own find line (`_natureCells(s, "find")`). Plus new cases: the species idle line
   (adult, teen; its move; none for a child, bored or hungry), the greeting (solo "peeks
   first", social watcher "ears up", the same classes and hold, none for a child, nothing sent)
   and the builder host's alternate hello (teen, adult; a baby and a child say the usual one;
   nothing sent).
6. **JS pins.** `tests/js/nature_lines.test.js`: "SPECIES_ADDS names only moves `_idle`
   handles" reads `_idle` **and** `_idleMove` now (the branches moved; the check is as strict).
   `tests/js/turn_pick.test.js` extracts `_lines` by its signature prefix and still passes.
   `tests/js/nature_species_lines.test.js` is new (section 10's N2 list).
7. **Not shot:** the V1 find line (the bench pins no find; proved in JS and by the card-check
   V-C case) except as a long-line text in mono and big text (said straight, like the find).

## N2 fold: first mate decisions, 2026-11-03

Recorded from the s2793 brief (the first mate's answers to review s2792; section 15 has each
finding's fate). All eight recommendations were taken.

- **Q1.** Snack and clean are out of N2 (the care scenes own them). N2's keys are `idle`,
  `find`, `visit`, `link_host`.
- **Q2.** Company is lines only, no beat: social unchanged; the solo "peeks first" line on
  `visit`; nothing on `link_guest`; no delay, no `perk`, no `look` call.
- **Q3.** Teen and adult only; section 6 rule 6 and section 10 fixed.
- **Q4.** Opt-in per call site, `_lines(..., { nature })` returning a move. `idle` only on
  content and cozy; `find` on the V1 branch only.
- **Q5.** The builder host gets an alternate hello at 1 in 4; the guest's reply is unchanged.
- **Q6.** Copy, final: watcher idle "\*stays very quiet\*"; hoarder find "\*stashes it,
  happily\*"; the explorer find "\*came back with something\*"; the groomer clean cell cut;
  the social company cell dropped; the performer idle glow variants for firefly
  ("\*glows a little brighter\*") and lunamoth ("\*flickers in a tiny loop\*"). All other
  quoted lines stand as approved.
- **Q7.** The empty `tuck` and `pat` keys are dropped.
- **Q8.** No heating flag, no server change.

**Not in the decisions list, so for the first mate's nod:** the explorer's `visit` cell is
**"\*sniffs the air\*"**, replacing the quoted "\*wanders over first\*" because review S4
showed the card plays no such motion (a visiting pet is held by `flairUntil`). It passes the
scan. If refused, the cell is deleted and corgi and duckling say the usual greeting.

**Copy scan, 2026-11-03 (s2793): PASS** on all 22 N2 lines (NAG words, `?`, `!!!`,
digits, 40 characters with `{home}` = "vivarium", and the banned words favourite, fond,
love, best), run with the scan's own rules over the lines as written in section 8, N2. The
builder re-runs the real scan once the table is in the card.

## N3 fold: first mate decisions, 2026-11-03

Recorded from the s2796 brief (the first mate's answers to review s2795; section 15 has each
finding's fate). All recommendations were taken.

- **Q1.** The 30 notes are the s2795 drafts, with "warms up by the fire" replaced by
  "snug in a warm spot", and these third clauses: kitten "kneads a blanket"; bunny "grooms its
  ears"; gecko "licks its eyes"; hamster "fills its cheeks"; ferret "hides treasures"; seal
  "hauls out to bask"; axolotl "drifts and waits"; corgi "herds things about"; duckling
  "paddles about"; octopus "slips into nooks" (FM, was "squeezes into nooks", 61). Others as drafted. Final copy.
- **Q2.** Three-clause frame, each note distinct; a test fails duplicates.
- **Q3.** The nature row shows at every hatched stage, never on the egg.
- **Q4.** The cap is set by a bench measurement of the longest note at 330/300/big text; the
  hard ceiling is 60 characters.
- **Q5.** "livelier after dark" / "livelier at dusk", never "wakes" or "awake at night".
- **Q6.** The Assist sentence is approved as the review wrote it, placed before "Care for it
  only when asked to".
- **Q7.** The fire sky reads "snug in a warm spot".
- **S6.** A Python data test with word-boundary banned words, and a JS test reusing the copy
  scan's `NAG` (exported).
- Every other should-fix and nit folded as recommended (the map from `catalog.species`,
  `test_assist.py`'s `endswith` untouched, stale server lines fixed).

**Copy check, 2026-11-03 (s2796):** all 30 distinct; no digit, `?`, `!`, NAG word or banned
word (word-boundary); all 30 are 60 characters or fewer after the first mate set the octopus
clause to "slips into nooks" (58).

## N3 shipped (s2797): where the code differed, the pins, the shots

N3 is built as section 8 (N3) says (branch `crew/hatch-at-home-s2797-species-nature-n3-field-note-a`).
Where the code differed, the code is right and N4 reads from it.

1. **Data.** `field_note` on the line right after `nature` in all 30 `species.json`, the 30
   approved notes exactly (octopus "slips into nooks"). No `VERSION` bump: 0.45.0 is
   released and the release prep commit (`9b796054`) is what bumps it, so the edited files
   reach a cached browser with the next release (`species.json?v=${VERSION}`).
2. **Card.** `card-status.js` `_renderStatus`: `fieldNote` is read only when `!isEgg`,
   from `s.species.field_note`; the row is `row(null, "nature", ...)` with `naturerow`,
   right after the personality line in the hatched template, no stage test. No `_lines`
   call, no copy-scan entry.
3. **Server.** `coordinator.species_notes` (filled in the `catalog.species` loop),
   `species_note` in the status slots (`intent.py`), the sentence in `PROMPT` before "Care
   for it only when asked to". `test_assist.py`'s `endswith` check is untouched.
4. **The cap (Q4), measured; FM decision 2026-11-03: keep 60, no shortening.** The bench's
   new `lines` shot option counts a row's wrapped lines (`nature/note-*` shots, plus a
   throwaway run over all 30). First measure: the value column is 122px at 420, 78 at 330,
   54 at 300 and 44 in big text, so no note fit two lines at 330 and octopus was 3 / 5 / 8 / 9
   lines at 420 / 330 / 300 / big text. **Fix (card CSS only, `style.js`):** where the
   column is narrow (`.compact`, which is every viewport under 420, and big text) the
   `.naturerow` stacks: the label on its own line, the note full width below; the 420 card
   is unchanged. After it, the worst of all 30 is 3 / 2 / 3 / 3 lines (octopus 3 / 2 / 3 / 3;
   hamster, 60 characters, 3 / 2 / 2 / 3). The data test's cap stays the hard ceiling, 60.
   The full table is in the worker's `renders/note-line-counts.txt`.
5. **Tests.** Python: `test_species.py` (each note: valid, at most 60, no digit or `?` or
   `!`, no NAG or banned word on word boundaries, clock and sky clauses equal to the
   species' `nature`; all 30 distinct; firefly and lunamoth do not hum or sing) and
   `test_assist.py` (the map equals the files and has species outside the roster, the slot
   with a note, none and an egg, `spoken_status`'s parameters unchanged, the prompt
   sentence before "Care for it only when asked to" and no new brace). JS:
   `tests/js/nature_notes.test.js` (the 30 files with `NAG` now exported from
   `scripts/copy-scan.js`; the row's source: `!isEgg`, one row, after the personality line,
   no stage test, `naturerow`). The egg, teen, child and baby cases are bench shots.
6. **Bench.** `--preset nature` gains 34 shots (`--only nature/note-`): the longest note of
   each of the 6 worlds at 420, 330, 300, big text and the porthole, and hamster as teen,
   child, baby and egg (the egg shows no row, though its `s.species` is the world's first).
7. **Not done / not testable.** The LLM's behaviour with the new sentence (a worker cannot
   test the model); no card-check case (the plan lists none for N3).
