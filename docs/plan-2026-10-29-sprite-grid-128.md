# Plan: creature sprites on the 128 art-pixel grid (2026-10-29)

**Owner decision (2026-10-29):** every creature sprite moves from the 64 to the 128
art-pixel grid. The canvas stays 256 × 256, the art pixel goes from 4 to 2 frame px
(ARTPX 4 → 2), and the card shows the pet at the same size. "Yes 128, it resolves a
lot of issues." 256 was rejected because it clashed with the chunky world
backgrounds and lost detail at dpr 1.

This is the scope pass. It covers what changes, in what order, at what cost, and how
each slice is proven. Nothing is changed here, and the plan gets an adversarial
review before any slice ships.

Evidence: `~/github/hatch-art/grid-test-2026-10-29/`
(`bench_today_vs_128.png`, `bench_64_128_256.png`, `side_by_side*.png`), with test
cuts of bunny, gecko and bearded dragon in `~/github/hatch-art/<sp>-out-g128/`.

## Verdict

The move is cheaper than it looks. The card needs **no behaviour change**: every
creature coordinate it uses is in 256 px frame units, not art pixels. One creature,
the tarantula, already ships on the 2 px grid, and it reads fine at dpr 1, even on
the compact 330 px card (bench, below).

The real work is in three places:

1. **The cutters and art tools.** Several of them hard-code the 4 px grid and would
   quietly ruin 128 art. They must be fixed before any 128 sprite lands.
2. **The re-cut itself.** The art coordinator does it with no image calls.
3. **Re-applying the hand fixes.** About a dozen fixes were made on the 64 grid, and
   a fresh cut from the raw sheets undoes them.

The world art stays at 64: shells, LCD, backgrounds, props, UI, hats and season
pieces.

## What is grid-free today (no change needed)

Each claim gives its evidence.

- **Head points, hat points, hat sink.** These are all in 256 px frame px.
  - `_flairAnchors` scales `head` by `r.height / 256` (`hatch-pet-card.js:6307-6310`).
  - `_headTop` scans a 256 × 256 canvas (`:5911-5918`).
  - The brim is `(top + costume.sink) * k`, with `k = r.height / 256` (`:5985`). The
    comment at `:335` says sink is "in frame pixels".
  - `test_species.py:90` bounds them to 0-256 / 0-224.
  - They stay valid wherever the 128 silhouette lands in the same place. They need
    **re-measuring**, not converting (slice 3).
- **Costume width.** It is in scene units: `costume.width * at.ks` with
  `ks = sr.width / 512` (`:5993`, `:6312`).
- **Scale.** `species.json` `scale` grows the pet box about its feet (`:5095`, and the
  `.pet` box `:1412`). It has no grid term.
- **Ghosting.** It reuses the pet's own `src` at the pet's geometry (`:3528-3549`,
  CSS `:1603`).
- **Care-scene props.** `_sceneArt` sets `naturalHeight / 4 * 62 / 64` %
  (`:5388`), which is `naturalHeight * 62 / 256`: frame px over the frame. The
  comment's "4 screen px per art px" goes stale, but the maths doesn't. The props
  themselves stay at 64.
- **The photo print.** It draws the 256 frame into a 0.62 × 268 px box at canvas
  scale 2 (`:924`, `:5095`). That gives about 2.6 canvas px per 128-art px, so no
  rows drop.
- **Rendering.** Every creature `<img>` is `image-rendering: pixelated`
  (`:1406`, flair `:1467`, journal `:1857`).

## Touch points that do change

### Card (`custom_components/virtual_pet/frontend/hatch-pet-card.js`)

| Where | Today | At 128 | Decision |
|---|---|---|---|
| Shell grid `--px` (`:2915`) | `w·0.465/64`, "one cell per art pixel". Every `.hw` part (`:1655-1726`), the finishes (`:1257-1328`) and `_mould` (`:2924`) cut on it | Halving it would halve the whole toy's chunk | **Stays /64.** Name it a world/shell constant, not the creature grid. This is the one edit most likely to be done wrong |
| LCD pitch (`:2901-2913`, CSS `:1593-1600`) | `w·0.465/64`, doubled where under 3 device px (`:2906`) | Unchanged, it becomes one cell per 2 × 2 creature art px. At /128 it would double on dpr 1-2 anyway and give a 1/3 px line on dpr 3 | **Stays /64** (decided; reversible). Fix the comment at `:1593` and `:2898` |
| `_sceneArt` comment (`:5383-5384`) | "4 screen px per art px … 1/64" | Stale | Comment only |
| Journal tiles `.jtile img` 48 px (`:1857`) | `child_content_1` at 0.75 CSS px per art px, already sub-pixel at dpr 1 | 0.375 CSS px per art px: sub-pixel at dpr 1 **and 2** | Bench it (slice 2). If outlines break up, see owner question 5 |

The pet on screen, measured with the bench at dpr 1 (`renders/tar-420.png`,
`tar-330.png`):

| Card | Screen | Pet box | CSS px per 128-art px |
|---|---|---|---|
| 420 px | 272 × 204 | 126 px | 0.99 |
| 330 px | 228 × 171 | 106 px | 0.83 |

At dpr 1 a few art rows drop on the big card and about 1 in 6 on the compact card.
The tarantula (2 px today) shows that this still reads (`renders/tar_dpr1.png`). At
dpr 2 and above, nothing drops.

### Art tools in this repo (`scripts/art/`)

| Tool | Problem at 128 | Fix |
|---|---|---|
| `outline.py:23` | `GRID = 4`, samples `[::4]` (`:61`) and pastes 4 px blocks (`:87`). It would paint a 4 px outline on 2 px art, and it already would on the tarantula | Detect the grid per file (2 or 4, as the test below does). Scale `MIN_PART` by the area, as `outline_g.py:25` does |
| `rescale.py:16,39` | `G = 4`, samples `[::4]`: throws away half the resolution | Detect per file |
| `art/adults/outline_fix.py:20` | `G = 4` | Detect per file, or retire it (the re-cut closes the outlines) |
| `check.py` | Grid-blind: feet ±2 px, pair jump >8 px (`:46-70`) are frame px and fine | Add a grid report: the frame's grid, flagged if it differs from the species' |
| `heads.py` | `MIN_RUN = 18` frame px (`:21`), fine | Re-run on the new art (slice 3) |
| `gaps.py`, `slivers.py` | Full-res pixels, size thresholds in frame px (`gaps.py:45`, `slivers.py:56`) | None. A 1-art-px gap is now 2 px, still caught |

### Cutters in `~/github/hatch-art/tools` (the art coordinator's)

| Tool | Problem | Fix |
|---|---|---|
| `cut.py:111` | `place()` reads `ARTPX` | Fine |
| `cut_adults.py:110,165,171` | `place(px=4)`, and its own callers never pass `px` (the known bug) | Read `ARTPX` like `cut.py` |
| `cut_adult_g.py:25` | Passes `px` to `cut_adults.place` | Already fixed in the test copy; fold it into `cut_adult.py` |
| `cut_creature*.py:59-62`, `cut_adult*.py:29-30` | Idle bob: hard `-16` leg band, `4` px raise | Make both a number of art px × ARTPX. The value is owner question 1 |
| `cut_react.py:13,45` | `GRID` 4 except the tarantula; **outline runs only when `GRID == 4`**, so 128 reactions and waves ship with no outline closed | Grid from ARTPX; always run the grid-aware `outline.py` |
| `cut_react.py:9` | `REPO = …/main_snapshot` | Point at a checkout of current main |
| `creatures.py:162` | Config path (fixed in the coordinator's copy) | Check that it is fixed in the copy used |
| `marks.py:3` | Snaps marks to the 4 px grid | Snap to ARTPX |
| `art/bird/cut.py` (this repo) | Bird has no `-batch` dir. Its sheets are in `hatch-bird-sprites.zip` / `pkg-bird/source`, and it has its own cutter | Unzip to a `bird-batch`, or give `cut.py` an ARTPX like the others |

### Tests and checks

- `tests/test_species.py:58` asserts 256 × 256, which still holds.
- `test_species.py:99-100` samples "a few art pixels below" the head on a 4 px step.
  That is still fine as frame px, but make it a 2 px step so a 1-art-px feature
  can't fall between samples.
- **New test:** every creature frame (`baby_/child_/teen_/adult_/egg_`) is on a
  2 px or 4 px grid, and each species uses **one** grid. This catches a half-migrated
  species. Once the migration is done, tighten it to 2 px only. Today it measures
  29 species at 4 and the tarantula at 2, and the beetle isn't ready.
- `card-check`:
  - `:3765` asserts LCD pitch ≥ 3 device px. With the pitch kept at /64 it is
    unchanged.
  - The costume checks (`:1507`, `:1589`) and the birthday hat (`:792`) prove the
    re-measured head and hat points.
- Bench presets that change: `species` (1230 shots) is the before/after sheet per
  species, and `shells` should come out byte-identical. That identity proves the
  shell grid didn't move.

### What stays at 64, and why

These are measured with a per-file grid scan. All of them are on 4 px today unless
noted.

- **Props in species dirs**: bowls, snacks, play, poop, medicine, blanket, perches,
  hides and the like. They are scene objects, sized by `_sceneArt` and grid-free.
- **UI**:
  - `ui/icon_*`, `prop_*`, `deco_*`, `catch_decoy`, `emblem_*`
  - `flair_*`: 24 files on 4 px; `flair_night_owl_2` is already off-grid
  - `season_*` (37): the hats, the **witch**, the **geese**, pumpkins
  - Shell parts and `ir_*` are not on an art grid.
- **Backgrounds** (512 × 384, 1 px detail) and **shells**, which stay on the
  `--px` grid above.

So the brief's "witch, goose, hand-made hats" are `ui/season_*` art, not creature
frames, and need no redo. The only open point is how a 64 hat looks on a 128 head
(owner question 2).

**Eggs** (6 species: bat, bird, gecko, kitten, otter, treefrog) move with their
species. They share the pet box and the same cutter. Decided.

## Hand fixes a re-cut undoes

Each one comes from `git log -- sprites/<sp>/*.png`, for commits after the species'
full-set commit.

| Species | Fix (commit) | Redo at 128 |
|---|---|---|
| Squirrel | Middle foot removed by hand: `child_cheeks_1/2`, `child_hungry_2`, `child_shiver` (c0e5c4a, 7ca7696; `art/README.md:154-160`) | **Hand redo at 128.** A 2× upscale of the fixed 64 frames would leave these four at 64 detail beside 128 neighbours |
| Squirrel, gecko | Oversized frames shrunk with `rescale.py`: squirrel baby cozy/sleepy, gecko sick (2598fec) | Scripted. Re-run the grid-aware `rescale.py` with the same factors, if the 128 cut is still oversized |
| Axolotl, luna moth | Adult outlines closed by `outline_fix.py` (2598fec), then both adults redrawn (0e7fd39, 03e1e83) | Re-cut from the redraw sheets. `outline.py` closes the outline |
| Axolotl | Adult asleep Z moved (2bc5b7f) | Hand redo (2 frames) |
| Octopus | Slivers erased (`art/README.md:89-91`); baby content/excited colours remapped, `child_colour_shift_2` recoloured (bb5a9ff) | `slivers.py --fix` is scripted. Colour remap by hand (5 frames) |
| Gecko, kitten | Hand-placed "!" on `teen_calling` (bb5a9ff) and the adult calling (3dfc6c4) | Hand redo at 128, or via `marks.py` once it is grid-aware |
| 10 creatures | Sleep and call marks (072d84a, `marks.py`) | Scripted: re-run `marks.py` at ARTPX 2 |
| Deer, luna moth, tree frog | Visible face mask (bdc85f2) | Check the re-cut first. Hand redo only if the mask is lost |
| Bird, deer, luna moth | One frame each (902e5de, "review and repair") | Check after the re-cut; hand redo if needed |
| Tarantula | Light eyes on bored/sleepy (f8ae8cd) | None: already 2 px, not re-cut |
| Kitten, bunny | Leg gap in the content_1 bob (10362ef) | None: the cutter's bob now stretches the legs (`cut_creature_g.py:61`) |
| All new creatures | Outline closed (50ac77b) | Scripted: `outline.py`, grid-aware |
| Bearded dragon | Unmerged branch `art-dragon-stopgap` (c02b848): grain cleanup on all 92 frames | Owner question 4 |

There is **no 2× upscale anywhere**. It gains nothing over keeping the frame at 64,
and it puts 64-detail frames inside a 128 species, which the new test would reject.

## Cut order (30 ready species; 29 to cut)

The tarantula is already native 2 px (Sol's v2, `HANDOFF.md:434`; scan: 92 of 92
frames on 2 px), so it is not cut. The beetle isn't ready. Cutting by **world** means
each world's line-up changes together.

1. **Terrarium**: gecko and bearded dragon (both test-cut already), tortoise, ball
   python. This completes the world with the tarantula.
2. **Hearth**: bunny (test-cut already, add its waves), kitten, corgi, hamster, ferret.
3. **Pond**: tree frog, axolotl, pond turtle, duckling, beaver.
4. **Tidepool**: otter, octopus (hand colour fixes), seal, hermit crab, puffin.
5. **Night Sky**: bat, luna moth, owl, firefly, opossum.
6. **Woodland** last: bird (its own source and cutter), squirrel (the most hand
   fixes), deer, fox, banana slug.

A species is "cut" only when its full set is cut:

- base moods plus the adult (`cut_creature`, `cut_adult`)
- the species' extras
- eggs, where it has them
- reactions and waves (`cut_react` at ARTPX 2)
- the audit redraws and four-legged calls (redraw5, fix6/7, react6)

The test cuts in `*-out-g128` lack the child extras, eggs and waves. Compare the
gecko (86 frames cut, 98 shipped) and the bunny (missing its 6 wave frames).

## Slices

| # | Slice | Size | Proof | Parallel with the re-cut? |
|---|---|---|---|---|
| 0 | **Tools first.** Grid detection in `outline.py`, `rescale.py`, `outline_fix.py`; grid report in `check.py`; the grid test in `test_species.py` (one grid per species, 2 or 4); the head-test step 4 → 2. The coordinator's cutters: `cut_adults` ARTPX, the bob in art px, `cut_react` outline at any grid, the `REPO` path, `marks.py` | S | `pytest tests/test_species.py` passes on today's sprites (29 × 4 px, tarantula 2 px). `outline.py` on the tarantula adds 0 px. Run the tools on a g128 test set and diff against a run at ARTPX 4 | Must land **before** any 128 sprite |
| 1 | **Card: name the grids.** A constant for the world/shell grid (64), used by `--px` and the LCD pitch; comments at `:1593`, `:2898`, `:5383`. No behaviour change | S | Bench `shells` and `ui` presets byte-identical before and after. `card-check` D1 LCD checks pass | Yes |
| 2 | **Pilot: Terrarium** (4 species), full sets, hand fixes, heads re-measured (`heads.py`), hat points re-checked | M | `check.py`, `gaps.py`, `slivers.py` clean. The grid test. Bench `species` preset before/after sheet for the 4, plus `--width 330 --dpr 1` and the journal at dpr 1 and 2. `costume-preview.js` + `costume_sheet.py` for every costume. `card-check` costume and birthday-hat checks (on an own-port HA, per AGENTS.md). Owner looks at the sheet | Cutting runs alongside; this slice is the gate for the rest |
| 3 | **Worlds 2-6**, one PR per world (5 species each), with that world's hand fixes | L total (M each) | As slice 2 for its species. Bench `species` sheet per world. `card-check` costume checks | Each world after the previous one is merged; the cutting can run ahead |
| 4 | **Hand redos at 128**: squirrel four frames, axolotl Z, octopus colours, gecko and kitten "!", and the masks if lost | S-M | Before/after crops at 4×; `gaps.py` and `slivers.py`; owner look | Inside the world PR it belongs to |
| 5 | **Close out.** Tighten the grid test to 2 px only; update `art/README.md`, `docs/design-worlds.md` and `plan-2026-10-29-device-charm.md:38,65` (the "64 art pixels" lines); retire `art/adults/outline_fix.py` if unused | S | `pytest`; grep for "64 art" finds no stale line | After the last world |

**Cost.**

- No image calls: the raw sheets are on disk, and the coordinator re-cuts at no
  image cost.
- Code slices 0, 1 and 5 are small.
- The per-world review is the big cost. That is 1230 bench shots across all species
  plus a costume sheet per costume, so it's owner-eye time, and the plan budgets one
  owner look per world.
- The hat points (`hat` in 26 species, hand-placed per pose) are the likeliest rework.
  The 128 silhouette moves heads by a pixel or two, and `card-check` only catches a
  hovering hat, not one that sits a bit deep.

## Owner questions

1. **The idle bob: how far does content_1 rise?**
   - **4 px, two 128 art px (recommended).** The same motion as today; the g128 test
     cut kept it (bunny baby top 82 → 86).
   - 2 px, one 128 art px: a true one-pixel bob, as the 2026-10-26 review asked, but
     half the motion. It may not read at dpr 1.
2. **Hats, flair and season pieces at 64 on a 128 head?**
   - **Keep them at 64 (recommended).** They are world art like the props, and the
     chunk matches the shells and backgrounds.
   - Re-cut the 9 costume pieces (8 season costumes and the party hat) at 128 from their sources, if any look coarse in the
     pilot's costume sheet.
   - Re-cut all 37 `season_*` and 25 `flair_*` pieces.
3. **How does it ship?**
   - **One release per world (recommended).** A world's line-up changes together,
     and the other worlds stay at 64 meanwhile. Mixed grids across worlds are already
     live (the tarantula).
   - Hold everything for one release with all 29: one look change, but a long branch
     that conflicts with art batches.
   - Per species as each is cut.
4. **The bearded dragon's unmerged grain stopgap (`art-dragon-stopgap`)?**
   - **Drop it; the 128 re-cut replaces it (recommended).** The dragon is in the
     pilot, so the stopgap would live a day or two.
   - Merge it now and replace it in the pilot.
   - Run its `grain_cleanup.py` on the 128 cut too, if the 128 dragon still shows
     grain.
5. **Only if the pilot's dpr 1 bench shows broken outlines in the 48 px journal
   tiles:**
   - **Smooth those tiles (`image-rendering: auto` on `.jtile img`) (recommended).**
     It's a one-line change.
   - Ship a 64 thumbnail per species: 30 more files to keep in step.

## Risks

- **Changing the shell grid by mistake.** "Every 64 becomes 128" would halve the
  toy's hardware and finishes. Slice 1 names the constant, and the `shells` bench
  must be byte-identical.
- **Silent tool damage.** `outline.py`, `rescale.py`, `outline_fix.py` and
  `cut_react.py`'s outline gate assume 4 px today. Run on 128 art, they paint 4 px
  outlines, halve the resolution, or skip the outline, all without an error. Slice 0
  goes first, and the grid test rejects mixed frames.
- **Fixes lost in the re-cut.** The table above is the checklist. Each world PR ticks
  its rows.
- **Hat points drift.** They are re-measured per pilot species; the `card-check`
  costume checks and `costume_sheet.py` are the proof.
- **dpr 1 detail.** It is 0.83-0.99 device px per art px. The tarantula shows this
  reads, and the bench at `--dpr 1 --width 330` is part of every world's proof.
- **Art batches in flight.** A batch cut at 64 during the migration would mix grids.
  The grid test fails it, and new batches cut at ARTPX 2 from slice 0 onward.
