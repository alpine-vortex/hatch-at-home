# Plan: creature sprites on the 128 art-pixel grid (2026-10-29)

**Owner decision (2026-10-29):** every creature sprite moves from the 64 to the 128
art-pixel grid. The canvas stays 256 × 256, the art pixel goes from 4 to 2 frame px
(ARTPX 4 → 2), and the card shows the pet at the same size. "Yes 128, it resolves a
lot of issues." 256 was rejected because it clashed with the chunky world
backgrounds and lost detail at dpr 1.

This is the scope pass. It covers what changes, in what order, at what cost, and how
each slice is proven. Nothing is changed here. The plan has had its adversarial
review (s2497); the findings and the owner's answers are folded in (see *Decisions* and
*Review fold (s2497)* at the end).

Evidence: `~/github/hatch-art/grid-test-2026-10-29/`
(`bench_today_vs_128.png`, `bench_64_128_256.png`, `side_by_side*.png`, and the
tarantula dpr 1 renders `tar-420.png`, `tar-330.png`, `tar_dpr1.png`), with test
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

## Decisions (owner, 2026-10-29)

Answers to the review's questions and the first mate's calls. These supersede the
"owner question" wording further down where they differ.

- **LCD pitch stays /64** (today's pitch). This departs from device-charm 1a's
  rationale ("one cell per creature art pixel, so the grid reads as the pixels the
  creature is drawn in", `plan-2026-10-29-device-charm.md:65-66`): at /64 a cell
  covers 2 × 2 creature pixels. Owner's choice, knowingly.
- **Z and ! marks:** keep the chunky 64-chunk glyph, snapped to the 2 px grid. Not a
  native 128 glyph.
- **Download size:** accept about **+9-10 MB** (shipped creature frames are 8.0 of the
  11.1 MB `sprites/`; `palette.py` output is about 2.2× larger at g128, e.g. bunny
  182 → 413 KB). `palette.py` (594cd31) is a step in **every world PR**. Release
  notes get one line: the creature art is sharper and the download is about 10 MB larger.
- **Idle bob stays 4 px** (two 128 art px). Q1 closed.
- **Hats, flair and season pieces stay at 64.** Q2 closed.
- **Ship per world, merge per world, no release until the end** (owner standing rule).
  Q3 closed: nothing is released between worlds.
- **Bearded dragon:** cut v1 at 128 in the pilot. Resume the paused `beardeddragon2`
  Codex redraw (`make_bd2_prompts.py`, paused at `queue.log:1270`) only if the 128 cut
  still reads grainy. `art-dragon-stopgap` is merged to main as a stopgap (Q4 closed).
- **Q5 smoothing** (`image-rendering: auto`) covers the journal tiles, and extends to the
  main pet at dpr 1 if the gecko pilot shows outline breaks (see the dpr 1 proof).

## What is grid-free today (no change needed)

Each claim gives its evidence.

- **Head points, hat points, hat sink.** These are all in 256 px frame px.
  - `_flairAnchors` scales `head` by `r.height / 256` (`hatch-pet-card.js:6307-6310`).
  - `_headTop` scans a 256 × 256 canvas (`:5911-5918`).
  - The brim is `(top + costume.sink) * k`, with `k = r.height / 256` (`:5985`). The
    comment at `:335` says sink is "in frame pixels".
  - `test_species.py:90` bounds them to 0-256 / 0-224.
  - They stay valid wherever the 128 silhouette lands in the same place. They need
    **re-measuring**, not converting, in each world's slice (2-3).
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
| LCD pitch (`:2901-2913`, CSS `:1593-1600`) | `w·0.465/64`, doubled where under 3 device px (`:2906`) | Unchanged, it becomes one cell per 2 × 2 creature art px. At /128 it would double on dpr 1-2 anyway and give a 1/3 px line on dpr 3 | **Stays /64** (owner, 2026-10-29: a knowing departure from device-charm 1a, see *Decisions*). Fix the comments at `:1593`, `:2898`, `:2490` |
| `_sceneArt` comment (`:5383-5384`) | "4 screen px per art px … 1/64" | Stale | Comment only |
| Other stale comments | `:972` ("cut on the creature's on-screen pixel grid"), `:2490` ("one cell per creature art pixel"), `:2914` | Comments only |
| `_linkBeam` (`:6196-6202`) | `0.00727` (= 0.465/64) with the comment "64 of them across the pet"; `:1753` "one art pixel is --u" | Same world/shell constant as `--px`, comments fixed. Also a 128 guest beams into a 64 host's screen (`.vguest`, `:1771`, `:6156`) while worlds roll out: the box is the same, the only effect is mixed chunk on one screen, as with the tarantula today. No fix |
| Journal tiles `.jtile img` 48 px (`:1857`) | `child_content_1` at 0.75 CSS px per art px, already sub-pixel at dpr 1 | 0.375 CSS px per art px: sub-pixel at dpr 1 **and 2** | Bench it (slice 2), which needs a journal fixture in the bench first (its Limits list the journal as empty; see slice 2). If outlines break up, see Q5 |

The pet on screen, measured with the bench at dpr 1 (`grid-test-2026-10-29/tar-420.png`,
`tar-330.png`):

| Card | Screen | Pet box | CSS px per 128-art px |
|---|---|---|---|
| 420 px | 272 × 204 | 126 px | 0.99 |
| 330 px | 228 × 171 | 106 px | 0.83 |

At dpr 1 a few art rows drop on the big card and about 1 in 6 on the compact card.
The tarantula (2 px today) shows that this still reads (`grid-test-2026-10-29/tar_dpr1.png`). At
dpr 2 and above, nothing drops.

The tarantula is dark-bodied, so dropped rows hide there. A light-edged creature
shows them as gaps in the outline, on the main pet and not only in the journal tiles.
So the pilot proof is the **gecko** (light edge) at `--width 330 --dpr 1`, judged for
outline breaks; if they break, Q5's smoothing applies to `.pet` too.

### Art tools in this repo (`scripts/art/`)

| Tool | Problem at 128 | Fix |
|---|---|---|
| `outline.py:23` | `GRID = 4`, samples `[::4]` (`:61`) and pastes 4 px blocks (`:87`). It would paint a 4 px outline on 2 px art, and it already would on the tarantula | Detect the grid per file (2 or 4, as the test below does). Scale `MIN_PART` by the area, as `outline_g.py:25` does. Every cutter calls **one** checkout's `scripts/art/outline.py` (see the cutter table) |
| `rescale.py:16,39` | `G = 4`, samples `[::4]`: throws away half the resolution | Detect per file |
| `art/adults/outline_fix.py:20` | `G = 4` | Detect per file, or retire it (the re-cut closes the outlines) |
| `check.py` | Grid-blind: feet ±2 px, pair jump >8 px (`:46-70`) are frame px and fine | Add a grid report: the frame's grid, flagged if it differs from the species' |
| `heads.py` | `MIN_RUN = 18` frame px (`:21`), fine | Keep the current head points by default: the README says they are heads.py's estimate "corrected where a tail, ear or wing rises higher", and those overrides are in no file. Run `heads.py` only to diff, and move only points that are off the new silhouette (`test_species.py:96-104` checks this), in each world's slice (2-3) |
| `gaps.py`, `slivers.py` | Full-res pixels, size thresholds in frame px (`gaps.py:45`, `slivers.py:56`) | None. A 1-art-px gap is now 2 px, still caught |

### Cutters in `~/github/hatch-art/tools` (the art coordinator's)

| Tool | Problem | Fix |
|---|---|---|
| `cut.py:111` | `place()` reads `ARTPX` | Fine |
| `cut_adults.py:110,165,171` | `place(px=4)`, and its own callers never pass `px` (the known bug) | Read `ARTPX` like `cut.py` |
| `cut_adult_g.py:25` | Passes `px` to `cut_adults.place` | Already fixed in the test copy; fold it into `cut_adult.py` |
| `cut_creature*.py:59-62`, `cut_adult*.py:29-30` | Idle bob: hard `-16` leg band, `4` px raise | Make both a number of art px × ARTPX. The value is 2 art px = 4 px (decided) |
| `cut_react.py:13,45` | `GRID` 4 except the tarantula; **outline runs only when `GRID == 4`**, so 128 reactions and waves ship with no outline closed | Grid from ARTPX; always run the grid-aware `outline.py` |
| `cut_react.py:9` | `REPO = …/main_snapshot` | Same env var as above |
| `creatures.py:162` | Config path (fixed in the coordinator's copy) | Check that it is fixed in the copy used |
| `marks.py:18,22` | Snaps to 4 and paints the glyph in 4 px cells | Keep the 64-chunk glyph (owner), snapped to the **2 px** grid: draw it in 4 px cells but position on ARTPX. Do not halve it |
| `restamp.py:24-26`, `restamp_head.py:20-21` | Snap with `//4*4` and step by 4 | Same: snap to ARTPX, keep the glyph size |
| `cut_creature.py:66-71`, `cut_creature_g.py:66-71` `fit_height` | `/4`, `*4`, `//4*4`: a hard 64 re-quantise, live for the kitten (`creatures.py:107` `{"teen_sick": 196}`) | Resize in ARTPX units |
| `cut_fix7.py:8,15,32-33`, `cut_bat7.py:8,43` | Run `outline.py` from `main_snapshot` (not a git repo, so the slice-0 fix never reaches it). `cut_fix7` has the same `grid == 4` outline gate as `cut_react`, and a per-item `grid` field | Drop the per-item `grid` for ARTPX, outline always runs |
| `process_redraw5.py:9,40`, `cut_tarantula5.py:7,24`, `species_json.py:8-9` | Point at `~/github/hatch-at-home-art-fixes`, which no longer exists (`creatures.py:162` notes it was removed). "The full set includes redraw5" can't be re-run as written | Point **every** cutter at one current checkout's `scripts/art/` through an env var; delete or refresh `main_snapshot` |
| `art/bird/cut.py` (this repo) | Bird has no `-batch` dir. Its sheets are in `hatch-bird-sprites.zip` / `pkg-bird/source`, and it has its own cutter | Unzip to a `bird-batch`, or give `cut.py` an ARTPX like the others |

### Tests and checks

- `tests/test_species.py:56-58` asserts 256 × 256, which still holds, but only for
  `{stage}_{mood}_1`. The new grid test also checks the size of every frame: extras,
  waves, `_2` frames and eggs.
- `test_species.py:99-100` samples "a few art pixels below" the head on a 4 px step.
  That is still fine as frame px, but make it a 2 px step so a 1-art-px feature
  can't fall between samples.
- **New test:** it measures each frame's **coarsest** grid (of 8/4/2), not any grid it
  fits: every 4 px frame is also 2 px-aligned, so "on a 2 or 4 px grid" would pass a
  leftover 64 frame. Rule: per species, the coarsest grid is 4 for all its frames or 2
  for all of them (`baby_/child_/teen_/adult_/egg_`, extras and waves included). This
  catches a half-migrated species. Slice 5 tightens it to "coarsest == 2". Today it
  measures 29 species at 4 and the tarantula at 2; the g128 test cuts (bunny, gecko,
  dragon) all come out coarsest 2, so the strict rule won't false-fail. The beetle
  isn't ready.
- `card-check`:
  - `:3765` asserts LCD pitch ≥ 3 device px. With the pitch kept at /64 it is
    unchanged.
  - The costume checks (`:1481-1509`, `:1561-1591`) and the birthday hat (`:792`) dress
    only the dev pet on show, so they are a **regression gate**, not proof of a
    re-measured head or hat point. That proof is per world: `costume-preview.js` with
    `HA_URL` on an own port (its default is `localhost:8123`, forbidden by AGENTS.md; or
    add a costume shot to the bench), plus `costume_sheet.py`.
- Bench presets that change: `species` (1230 shots) is the before/after sheet per
  species. It pins frame 1 of each animation (`stage × mood`), so it never shows the
  `_2` frames, extras, waves, reactions or eggs, and several hand fixes are
  frame-2-only (squirrel `child_hungry_2`, `teen_excited_2`, octopus
  `child_colour_shift_2`). Each world's proof adds a **full-frame contact sheet per
  species**, old vs new (`scripts/art/sheet.py`).
- `shells` is byte-identical **only in slice 1**, before any sprite changes: the preset
  uses `clip: card` with the world's first species on screen (`bench.js:35-47`). For
  later PRs, use `lcd: off` and a pet-less shot, or mask the screen.

### What stays at 64, and why

These are measured with a per-file grid scan. All of them are on 4 px today unless
noted.

- **Props in species dirs**: bowls, snacks, play, poop, medicine, blanket, perches,
  hides and the like. They are scene objects, sized by `_sceneArt` and grid-free.
- **UI**:
  - `ui/icon_*`, `prop_*`, `deco_*`, `catch_decoy`, `emblem_*`
  - `flair_*`: 24 files on 4 px; `flair_night_owl_2` is already off-grid (decided: hats, flair and season pieces stay at 64)
  - `season_*` (37): the hats, the **witch**, the **geese**, pumpkins
  - Shell parts and `ir_*` are not on an art grid.
- **Backgrounds** (512 × 384, 1 px detail) and **shells**, which stay on the
  `--px` grid above.

So the brief's "witch, goose, hand-made hats" are `ui/season_*` art, not creature
frames, and need no redo. The only open point is how a 64 hat looks on a 128 head
(decided: they stay at 64).

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
| Gecko, kitten | Hand-placed "!" on `teen_calling` (bb5a9ff) and the adult calling (3dfc6c4) | Hand redo at 128, or via `marks.py` once it snaps to ARTPX |
| 10 creatures | Sleep and call marks (072d84a, `marks.py`) | Scripted: re-run `marks.py`, glyph kept at 64-chunk size, snapped to 2 px (decided) |
| Deer, luna moth, tree frog | Visible face mask (bdc85f2) | Check the re-cut first. Hand redo only if the mask is lost |
| Bird, deer, luna moth | One frame each (902e5de, "review and repair") | Check after the re-cut; hand redo if needed |
| Tarantula | Light eyes on bored/sleepy (f8ae8cd) | None: already 2 px, not re-cut |
| Kitten, bunny | Leg gap in the content_1 bob (10362ef) | None: the cutter's bob now stretches the legs (`cut_creature_g.py:61`) |
| All new creatures | Outline closed (50ac77b) | Scripted: `outline.py`, grid-aware |
| Bearded dragon | `art-dragon-stopgap` (c02b848): grain cleanup on all 92 frames, merged to main as a stopgap | Decided: cut v1 at 128 in the pilot; resume the paused `beardeddragon2` redraw only if it still reads grainy |
| Deer | Adult calling/dirty and teen dirty redrawn (49fd78d); teen calling redrawn, "!" restamped 4 px higher (91f7ee7). Source `probes5/` (`cutdeer_*`), no committed cutter | Re-cut from the `probes5` source with a cutter written for it, then `marks.py` |
| Kitten | **Baby** calling/dirty full-size redraw (3dfc6c4), not only the adult "!". Source `probes5/` | As deer |
| Squirrel, bat | R6 squirrel `teen_excited_2`; R7 **bat adult, 20 frames** (f9c6c40), source `fix6/`, cutter `cut_bat7.py` | Re-run `cut_bat7.py` at ARTPX 2 (after the cutter fixes above); squirrel frame by hand with the squirrel set |
| Ball python | Child redraw (8733d9c) | Looks covered by the dated `-batch` dir; confirm in the Terrarium pilot |
| Pond turtle | Full redraw (5e33f86) | Looks covered by the dated `-batch` dir; confirm in the Pond world PR |

**Overlay order** for every cut, so a later step never undoes an earlier one: base cut,
then the redraws (`probes5`, `fix6`, `redraw5`, `fix7`, `react6`), then rescale and
slivers, then outline, then **marks last**.

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
| 0 | **Tools first.** Grid detection in `outline.py`, `rescale.py`, `outline_fix.py`; grid report in `check.py`; the grid test in `test_species.py` (one grid per species, 2 or 4); the head-test step 4 → 2. The coordinator's cutters: `cut_adults` ARTPX, the bob in art px, `fit_height` in ARTPX units, `cut_react` and `cut_fix7` outline at any grid (drop per-item `grid`), one env-var checkout path for every cutter (`cut_react`, `cut_fix7`, `cut_bat7`, `process_redraw5`, `cut_tarantula5`, `species_json`; refresh or delete `main_snapshot`), `marks.py`, `restamp.py`, `restamp_head.py` | S | `pytest tests/test_species.py` passes on today's sprites (29 × coarsest 4, tarantula 2). A synthetic 64 frame inside a 2 px species **fails** the grid test (the gate proves it can fail). `outline.py` on the tarantula adds 0 px. Run the tools on a g128 test set and diff against a run at ARTPX 4 | Must land **before** any 128 sprite |
| 1 | **Card: name the grids.** A constant for the world/shell grid (64), used by `--px`, the LCD pitch and `_linkBeam`; comments at `:1593`, `:2898`, `:5383`, `:972`, `:2490`, `:2914`, `:1753`, `:6196`. No behaviour change | S | Bench `shells` and `ui` presets byte-identical before and after (valid here only, before any sprite changes). `_linkBeam` on the same constant. `card-check` D1 LCD checks pass | Yes |
| 2 | **Pilot: Terrarium** (4 species), full sets, hand fixes, heads checked (`heads.py` as a diff, see the tools table), hat points re-checked; `palette.py` on the output; dragon cut from v1 `beardeddragon-batch` | M | `check.py`, `gaps.py`, `slivers.py` clean. The grid test. Bench `species` preset before/after sheet for the 4, plus a full-frame `sheet.py` contact sheet per species (old vs new), plus the **gecko** at `--width 330 --dpr 1` judged for outline breaks, plus the journal at dpr 1 and 2 (needs a **journal fixture added to the bench** first, since the bench shows the journal empty; or drop that proof). `costume-preview.js` (own-port `HA_URL`) + `costume_sheet.py` for every costume. `card-check` costume and birthday-hat checks as a regression gate only (own-port HA, per AGENTS.md). Owner looks at the sheet | Cutting runs alongside; this slice is the gate for the rest |
| 3 | **Worlds 2-6**, one PR per world (5 species each), with that world's hand fixes | L total (M each) | As slice 2 for its species, including `palette.py` and the full-frame contact sheet. Merged per world; no release until the last world | Each world after the previous one is merged; the cutting can run ahead |
| 4 | **Hand redos at 128**: squirrel four frames, axolotl Z, octopus colours, gecko and kitten "!", the masks if lost, and the deer, kitten, bat, squirrel redraws from the new table rows | S-M | Before/after crops at 4×; `gaps.py` and `slivers.py`; owner look | Inside the world PR it belongs to |
| 5 | **Close out.** Tighten the grid test to 2 px only; update `art/README.md`, `custom_components/virtual_pet/frontend/sprites/README.md:22` ("4 px per art pixel like the creatures"), `docs/design-worlds.md` and `plan-2026-10-29-device-charm.md:38,65` (the "64 art pixels" lines); retire `art/adults/outline_fix.py` if unused | S | `pytest`; grep for "64 art" finds no stale line | After the last world |

**Cost.**

- No image calls: the raw sheets are on disk, and the coordinator re-cuts at no
  image cost. (The dragon's `bd2` redraw is the one possible exception, see *Decisions*.)
- **Download:** about +9-10 MB, nearly doubling the 11.1 MB `sprites/`. Accepted by the
  owner; one line in the release notes.
- Code slices 0, 1 and 5 are small.
- The per-world review is the big cost. That is 1230 bench shots across all species
  plus a costume sheet per costume, so it's owner-eye time, and the plan budgets one
  owner look per world.
- The hat points (`hat` in 26 species, hand-placed per pose) are the likeliest rework.
  The 128 silhouette moves heads by a pixel or two, and `card-check` only catches a
  hovering hat, not one that sits a bit deep.

## Owner questions (all answered, 2026-10-29)

1. **Idle bob:** 4 px, two 128 art px. Kept.
2. **Hats, flair, season pieces:** stay at 64. Re-cut the 9 costume pieces only if the
   pilot's costume sheet shows them coarse.
3. **Shipping:** merge per world, no release until the end.
4. **Bearded dragon:** `art-dragon-stopgap` merged as a stopgap; cut v1 at 128 in the
   pilot; resume `beardeddragon2` only if it still reads grainy.
5. **Journal tiles at dpr 1:** if the pilot bench shows broken outlines, smooth those
   tiles (`image-rendering: auto` on `.jtile img`, one line). Extended: also the main
   pet at dpr 1 if the gecko pilot shows outline breaks. A 64 thumbnail per species is
   the rejected alternative.
6. **LCD pitch:** stays /64 (see *Decisions*).
7. **Z and ! marks:** 64-chunk glyph on the 2 px grid.
8. **Download size:** +9-10 MB accepted.

## Risks

- **Changing the shell grid by mistake.** "Every 64 becomes 128" would halve the
  toy's hardware and finishes. Slice 1 names the constant, and the `shells` bench
  must be byte-identical in that slice.
- **Silent tool damage.** `outline.py`, `rescale.py`, `outline_fix.py` and
  `cut_react.py`'s outline gate assume 4 px today. Run on 128 art, they paint 4 px
  outlines, halve the resolution, or skip the outline, all without an error. Slice 0
  goes first, and the grid test rejects mixed frames.
- **Fixes lost in the re-cut.** The table above is the checklist. Each world PR ticks
  its rows and follows the overlay order.
- **Hat points drift.** They are re-measured per pilot species; the `card-check`
  costume checks and `costume_sheet.py` are the proof.
- **dpr 1 detail.** It is 0.83-0.99 device px per art px. The tarantula is dark-bodied and hides dropped rows, so the
  gecko (light edge) at `--dpr 1 --width 330` is the pilot's judge; that bench is part of
  every world's proof.
- **Art batches in flight.** A batch cut at 64 during the migration would mix grids.
  The grid test fails it, and new batches cut at ARTPX 2 from slice 0 onward.

## Review fold (s2497)

Finding (review `/tmp/review-128.md`) → where it landed. Each was re-checked against the
code before folding; all 20 held. #16 was re-checked at the README line; #12's file is
`bench.js:35-47` as cited.

| # | Landed in |
|---|---|
| 1 grid test is vacuous | Tests: coarsest-grid rule; slice 0 proof (synthetic 64 frame must fail); slice 5 |
| 2 `fit_height` | Cutter table; slice 0 |
| 3 marks, restamp | Cutter table (`marks.py`, `restamp*`); slice 0; Decisions (glyph size) |
| 4 `main_snapshot` and the missing `art-fixes` | Cutter table (env-var checkout); slice 0 |
| 5 `cut_fix7` outline gate | Cutter table; slice 0 |
| 6 missing hand redos, overlay order | Hand fixes table (deer, kitten baby, bat, ball python, pond turtle) and *Overlay order*; slice 4 |
| 7 dragon bd2 | Decisions; hand fixes table |
| 8 download size, `palette.py` | Decisions; Cost; every world PR |
| 9 LCD pitch rationale | Decisions; touch-point table |
| 10 `_linkBeam` and stale comments | Touch-point table; slice 1; slice 5 (`sprites/README.md:22`) |
| 11 bench can't show the journal | Touch-point table; slice 2 (add a bench fixture or drop the proof) |
| 12 `shells` identity | Tests; slice 1 only |
| 13 card-check costume checks | Tests; slice 2 (`costume-preview.js` on an own port, `costume_sheet.py`) |
| 14 frame-1-only species sheet | Tests; slices 2-3 (full-frame `sheet.py` sheet) |
| 15 dpr 1 on light-edged creatures | Touch-point section; slice 2 (gecko); Q5 extended |
| 16 `heads.py` overrides | Tools table (keep points, run as diff) |
| 17 head re-measure slice | Grid-free list: "each world's slice (2-3)" |
| 18 renders in a scratchpad | Moved to `~/github/hatch-art/grid-test-2026-10-29/`; paths fixed |
| 19 size check on all frames | Tests |
| 20 visiting pets | Touch-point table (`_linkBeam` row); no fix |

**Not folded:** nothing. Two items are open work, not decisions: the bench journal
fixture (slice 2) and a cutter for the deer and kitten `probes5` redraws (no committed
cutter exists).
