# Plan: board mode and Hop of the Day (2026-11-02)

Status: plan only; no code changes. The build is five numbered ships, seven builds (section
9: 1, 2a, 2b, 3a, 3b, 4, 5). **Ship 3a is tier 2** (it adds a saved field, `PetState.hop_day`);
the others are tier 1. The owner picked Hop on 2026-11-02 from scout s2713's five concepts.
The decisions made on 2026-11-02 are recorded at the end ("Decided"); nothing is left open
except what section 11 lists. Folded on 2026-11-02 (s2722) from adversarial review s2718:
every finding was checked against the code at `7fe09174` before it was written in.

Sources: scout s2713's report (Pick, Shared base, section 1, Owner decisions) and its
`renders/hop-sample-solver.py` (the sample board below is its board, rules adjusted in
section 2); `docs/plan-2026-11-01-playtime.md` (the 70-80% rule, why ✕ parks, the dig's
build spec and pay); `docs/plan-2026-11-02-card-split.md` (card parts, where a new part
goes); and the code at `f2c5e8a8`: `model.py` (`GAMES`, `start_game`, `play_game`,
`_finish_game`, `roll_find`, `pick_find`, `add_find`, `from_dict`), `rates.py` (games
block), `coordinator.py` (`async_play_game`, `_today`), `src/card/card-games.js`,
`prefs.js`, `worlds.json` and the 30 ready `sprites/*/species.json` (a 31st, the beetle, is
in `worlds.json` but has no `species.json` yet; section 3).

**Copy:** every line quoted for the player is a **DRAFT for the owner**, marked "draft".
That includes the names ("Hop of the Day", "tidy", the move names) and every glyph. No
other copy is proposed. The build lists the working text it adds in its report, as the
dig's did.

**Measured while writing** (scratch script, kept in the worker's renders, not in the repo:
`feas2.py`, `feas2.out`): a plain memoised search over (position, sunk pads, hops left)
on 40 random boards with the hop move only and no world twist took, per board,
0.003 s at 5×4 with 1 hop, 0.02 s at 5×4 with 3 hops, 0.07 s at 6×4 with 3 hops (largest
235,000 states; 1 board in 40 passed a 400,000-state cap). Of 40 random 6×4 boards, 39
were solvable and 28 solvable tidy. So the solver is cheap at 6×4, and tidy is **common**
on random boards: the generator needs a filter to make it hard (section 4). Nothing else in
this plan was run.

## 0. Summary

- **Board mode** (ships 2a-2b): while a board game is on, the care buttons become that game's
  keys and the LCD shows a grid. Cells under 44 px (every card up to about 376 px) use tap,
  then confirm. ✕ parks the board. The bench gets `view: "board"`.
- **Hop of the Day** (ships 1-5): once a day the pet gets one board, the same on every
  screen. The pet is the piece. Its species picks one special move (six families) and its
  stage picks how many uses it has (baby 0, child 1, teen 2, adult 3). Reach the nest with
  every find: a win. Sink every pad on the way: **tidy**. Undo and restart are free.
- **Server** (ship 1): a pure `hop.py` holds the rules, the generator and the solver, and
  its twin `hop-engine.js` holds the same rules for the card. The board is a function of
  (pet, day, world, family, specials), so the server builds it once and every screen is
  served the same one. It is checked for "win easy, tidy hard" by the solver and two bots.
- **Settle** (ship 3a): the card plays every move locally. When the pet enters the nest the
  board ends and the card sends the move list; the server replays it on its own copy of the
  board and pays. A plain win does not lock the day: the solved view offers a free restart
  for tidy, and a later tidy settle pays the find (section 6). This replaces "every tap
  settled on the server" for this game only.
- **Pay**: the first win of the day pays 23 happiness. There is no loss. The day's first
  tidy also pays one find from the pet's world.
- **Saved**: one small map per pet, `hop_day` (day, stage, done, tidy), plus a `tidy` count
  in the existing `games` counts. No streak. No migration beyond defaults (section 8).
- **Start**: Hop has its own row on the play screen, outside the picker. Left or Right
  stays where it is, and so does everything that names it (section 5).

## 1. Board mode (ships 2a-2b)

What the scout measured (300 px render, not CSS): the LCD is about 210 × 150 px; the
journal draws inside the LCD the same way. So a board is at most **6×4** cells, about
35 × 34 px at 300 px. The board is the same on every screen (two screens must agree, so the
server can't size it per width), so 6×4 is the cap for all widths. The cell scales with
the card: about 35 px at 300, 38 at 330, 49 at 420 (the 210 px LCD is 70% of the card, over
6 columns). One tap commits from about 377 px up; below that a tap lights and a second
tap commits, and that covers most phones.

**The pad becomes the game's keys.** While a board is open the pad belongs to the board,
and so does the screen: the Hop row (section 5) lives in the picker's view and is gone once
a board is open, so a game key never has to share the screen with it. The care buttons (`ACTIONS` in `prefs.js`: seven, plus
the lights key; the scout counted eight in a 2×4 block, to verify in the build) are replaced
while a board is open, as a handheld's buttons are. The pad's own `aria-label`s change with
them. Hop's keys (all draft labels):

| key | does | notes |
|---|---|---|
| ◀ ▲ ▼ ▶ | step to the next cell | disabled if blocked or sunk (`aria-disabled`, as the dig's keep is) |
| special | the pet's special move, then ◀ ▲ ▼ ▶ (or a lit cell) picks where | shows "×n" uses left; disabled at 0 |
| undo | take back the last move | free, no limit, restores a sunk pad and a spent use |
| restart | back to the start | free |
| hint | ask for a hint | ship 5; hidden before it ships |

Eight keys, so ship 5's hint fills the last one; ships 2b-4 leave it blank. A confirm needs
no key: it is the second tap on the lit cell.

**Tap, then confirm, for small cells.** Two-tap is the phone default, not the 300 px edge:
44 px needs a 264 px LCD, which is a card about 377 px wide, and typical phone cards are
330-376.
- Under 44 px, the first tap on a cell **lights** it (and shows the move that would be made:
  a dotted path for a step, an arc for a hop). A second tap on the same cell commits. A tap
  elsewhere moves the light.
- Only the legal cells are tappable (2-6 at a time). The rule is **nearest legal cell**: a
  tap resolves to the legal cell whose centre is nearest, if it is within 22 px of it, so a
  legal cell's hit area is a 44 px square at most, grown into its empty or blocked
  neighbours. A tap farther than that from every legal cell does nothing and says nothing
  (the cells are not focusable; the keys carry the state and `aria-disabled` says why a
  direction is blocked, so a screen reader uses the keys).
- At 377 px and up a cell is 44 px or more: one tap commits. The card reads the cell size it
  drew, not the viewport, so one rule covers both. The bench shots at 330 and 360 state the
  measured cell size.
- The arrow keys never need a confirm: they are the 44 px path for a thumb.

**Park and resume.** The move list is written to `localStorage` **on every move** (and on
undo and restart), under `hatch-hop|<pet id>|<day>|<board id>`, so no quit path has to
remember to park it. Not every path goes through `_quitGame`: `_endGame` is called directly
when the card is removed (`card-base.js:182`), when a slide is reused (`_forget`,
`card-build.js:707`), when the pet falls asleep, goes away or is an egg mid-board
(`card-layout.js:624`), and on a failed call (`card-games.js:238`, `:260`). Writing on every
move makes all of them safe. Escape is a `keydown` on `gameBox` only
(`card-build.js:234-236`) and the keys sit on the pad, outside it, so for a board the
Escape handler moves to the card.
Why the card and not the server: the board has no hidden information and no luck, so a
parked game can't be fished. A player who ✕s and comes back sees the same fixed board and
their own moves, which they could redo for free anyway. Nothing is lost if the browser
forgets it. A new day, a new board id (a stage change, a generator version bump) drops the
parked list without comment. Starting Hop again resumes it; a board that was settled shows
the solved view (section 6). No timer anywhere, so there is no idle drop and the server
never sees a half-played board.

**Everything else.**
- Turn-based. Under `prefers-reduced-motion` the pet's hop tween becomes a cut; nothing else
  moves. Sound is off unless the player opted in.
- The pet reacts to each move with the frames it already has (`acts.ready` at the start, a
  hop frame per special, the `won` pose at the nest; the existing cheer or `aww` frames
  stand in). No new art in any ship. A line is never required to play.
- The pad remap is a card-side view like the game overlay's `_gameView`: the care buttons
  keep their handlers and the overlay swaps what a press means while `s.board` is set, so
  no care action can fire from a game key.
- Where the code goes: a **pure engine** top-level in a new part, `src/card/hop-engine.js`
  (before the class chain: it holds no `this`; ship 1), and the board view as a new class
  link, `src/card/card-board.js` (`HatchPetCardBoard`, between `card-games` and
  `card-season`; ship 2b). Both go in `manifest.txt` in that order. `card-season.js:1` is
  `extends HatchPetCardGames` and is repointed to `HatchPetCardBoard`. Board CSS goes in the
  `style` part. Per `AGENTS.md`, run `scripts/card-check` after the first build: a manifest
  order mistake shows there (a TDZ error), not in `node --check`.
- The pad's `wants` pulses (`ACTIONS` `wants`, `prefs.js`) would land on remapped keys: while
  a board is open the pulse is suppressed, and card-check shows a calling pet's pulse does
  not light a game key.
- **Bench:** `view: "board"` plus `board: {...}` pins any state: the grid, the family and
  specials, the world twist, the moves made so far, a lit cell, solved or tidy. A
  `--preset hop` contact sheet shows one board per world and one per family at 300, 330
  and 420. The bench's README lists the field.

## 2. The rules

Terrain (a character per cell; all boards are at most 6 wide by 4 tall):

| char | cell | rule |
|---|---|---|
| `.` | pad | walkable; **sinks when the pet leaves it** (never walkable again) |
| `f` | find pad | a pad; entering it picks up its find |
| `o` | stone | walkable; never sinks, any number of crossings |
| `~` | water | blocked |
| `#` | wall (a rock or log) | blocked |
| `P` | start | a pad the pet stands on |
| `N` | nest | enterable only when every find is picked up; entering it ends the board (section 6 says what ends means for the card) |

- **Step:** 1 cell up, down, left or right, onto a walkable cell that hasn't sunk.
- **Win:** the pet is in the nest with every find picked up.
- **Tidy:** a win in which **every pad** (`.`, `f`, `P`) has sunk. Stones needn't be touched.
- **Undo and restart:** free and unlimited. The move list that counts is the one left after
  the undos.
- **No timing anywhere.** Where a rule uses a count, it counts moves made, which undo
  rewinds (section 2c).
- **No loss.** A board can be left (parked), restarted or given up on at no cost.

### 2a. The six move families (one special each)

Each family's special is one extra kind of move. Each use spends one of the board's
specials (the stage sets the count, 2b). A special lands only on a walkable, unsunk cell,
or the nest under the nest's own rule. The family names are drafts.

| family | special move | spends 1 use per |
|---|---|---|
| **hop** | exactly 2 cells straight, over **anything** (a pad, stone, water or wall) | jump |
| **glide** | 1 cell diagonally, over the corner whatever is there | glide |
| **swim** | step onto a water cell. Water stays water; it never sinks and can be left by a step. | entry |
| **dig** | 2 cells straight with a **wall** as the middle cell (tunnel under it) | tunnel |
| **climb** | step onto a wall cell. A wall stays a wall; it never sinks and can be left by a step. | entry |
| **squeeze** | step back onto **one sunk pad** (slip through the gap it left); it sinks again when left | squeeze |

The scout's first sketch had the squeezer "fit through a crack" with a new terrain. This plan
uses a sunk pad instead so six families need only four terrains. Swim and climb are the same
shape on different terrain on purpose, so the rules read in one line each.

### 2b. Stage sets the specials and the size

| stage | specials | largest board | notes |
|---|---|---|---|
| egg | n/a | n/a | refused, as every game (`_refuse_play`) |
| baby | 0 | 4×3 | starter boards: steps, pads and stones only |
| child | 1 | 5×4 | the family's special appears |
| teen | 2 | 6×4 | |
| adult | 3 | 6×4 | |

Size rotates by weekday: **Wednesday is one column narrower** than the stage's largest
(draft; the scout's "a short one midweek"), **never below 4 wide**: a baby's Wednesday
stays 4×3, because a 3×3 board (9 cells, no specials) is unlikely to pass the trap filter
and every Wednesday baby would get the same fallback. Ship 1 reports the acceptance rate
for 4×3 and 5×3 (steps only), and if even 4×3 is poor the fallback boards for it are
accepted as a known limit and said so in the ship's report. The number comes from
`life_stage(state)`.
Growing up opens new boards; it does not touch today's (section 8: the stage is pinned for
the day).

### 2c. One twist per world

All six worlds come from `worlds.json` (woodland, terrarium, hearth, tidepool, pond,
nightsky). A world adds **one** rule to its boards, with its own cell glyph, from ship 4
(ships 1-3 have no twist). No twist uses real time. The scout gave examples for three; the
other three are this plan's proposals.

| world | twist (draft name) | rule |
|---|---|---|
| woodland | **stump holes** `1` `2` | stumps come in pairs. Stepping onto one puts the pet out of its twin in the same move, free. Stumps never sink. |
| terrarium | **crackle pads** `c` | a crackle pad sinks only on the **second** time it is left (it is walkable once more after the first). Tidy needs two visits to every one. |
| hearth | **rug** `=` | a rug is walkable and slides the pet one **more** cell the way it was going, if that cell is walkable (else it stops on the rug). Rugs never sink. (scout) |
| tidepool | **tide pools** `%` | a pool is a stone while the **count of moves made is odd**, water while it is even; undo rewinds the count. (scout: "open and close every 2 moves" — this is the 1-move version; the build tunes 1 or 2.) |
| pond | **ripple pads** `r` | a pad that, when it sinks, also sinks the pad to its right if it is a pad. Chains. |
| nightsky | **dark cells** `?` and a **lantern** `*` | a dark cell is drawn dim and **can't be entered** until the lantern `*` (an ordinary pad) has been stepped on; then every dark cell becomes a pad for the rest of the board. (scout: dark cells light next to a lantern; this turns it into a rule instead of a view, because a view-only twist makes nothing harder with free undo.) |

**The holes the review found, settled** (each is a fixture case in ship 4):
- **Tide pool.** A pool's phase is judged **when the pet steps onto it**, by the move count
  that move makes (odd: stone, enterable; even: water, blocked). The pet leaves the pool on
  its next move, and every move changes the count, so a pet never stands on a pool when it
  turns to water. A special move counts as one move. A swim use onto a pool in its water
  phase is a water entry like any other. Undo rewinds the count.
- **Rug.** Stepping onto a rug in direction *d* slides the pet one more cell in *d*, only if
  that cell is walkable and unsunk; else it stops on the rug. The landing cell is an
  ordinary entry (a find is picked up; the nest opens only if every find is in, else the
  pet stops on the rug; a stump's twin applies). A rug onto a rug stops on the first (one
  slide per move). A rug is not a pad, so it never sinks and "leaving" it sinks nothing; the
  cell the pet left before the rug sinks as usual. Hop and glide land on a rug without
  sliding (only a step slides).
- **Stump pair.** Stepping onto a stump puts the pet on its twin in the same move; it never
  stops on the first. Stumps never sink, so the twin is always free. A special move may land
  on a stump (then the twin rule applies).
- **Crackle pad.** Never carries a find, the start or the nest. It sinks on the second
  leaving; a squeeze use steps back only onto a fully sunk pad.
- **Move letters.** A letter is the **stepped-on cell's** index (reading order, `a` to `x`),
  not the landing cell: for a rug or a stump the server derives the landing. `a`-`x` is
  exactly 24 letters, 6×4; the 6×4 cap is deliberate, and a wider board is a format change
  (a `GEN_VERSION` bump and a longer alphabet), not a tweak.

Each twist is a small addition to the shared engine (Python and JS) and the generator, and
gets its own fixture cases and one bench shot per world.

### 2d. Sample (the scout's, adapted to the rules above)

Child bunny, Woodland (no twist yet), family hop, 1 use, 5×4:
```
    a b c d e
 1  N . ~ f .
 2  . o . . ~
 3  f . ~ o .
 4  . . P . f
```
The scout's solver found, with exactly 1 hop: 20 winning move lists, 3 of them tidy, and
none with 0 hops. Its walkthrough stands: the obvious line wins and leaves six pads
standing; the tidy line takes 16 moves, spends the hop early to cross the
water at 2e, and crosses the stone at 2b twice. The scout's solver ended a path at the nest and counted it only if every find was in, so
its counts hold under the closed-nest rule unchanged.

## 3. Species → move family, for every species in the repo

The 30 ready species (`custom_components/virtual_pet/frontend/sprites/*/species.json`,
grouped by `worlds.json` roster), plus the beetle, which `worlds.json` lists but whose
`species.json` was pulled for a redraw (`species.py` loads only a directory with a valid,
`ready` file, so the game does not have it yet). Every species has the four stages baby,
child, teen, adult, so the stage table applies to all. The mapping is a plain dict in
`hop.py` (`FAMILY_OF`). The test is "`FAMILY_OF` covers every ready species and names no
species outside `worlds.json`'s rosters", so the beetle row waits harmlessly. `hop.py` also
has a default family (hop) for a species with no line, so a new species can't raise at
`board` time. The table is **decided as drafted** (section "Decided"); the owner may still
name swaps. The reason column is draft flavour, not copy.

| world | species | family | why |
|---|---|---|---|
| woodland | bird | glide | flies |
| woodland | squirrel | climb | trees |
| woodland | deer | hop | bounds |
| woodland | fox | dig | dens |
| woodland | bananaslug | squeeze | slime trail, goes back over its own |
| terrarium | gecko | climb | walls |
| terrarium | tarantula | dig | burrows |
| terrarium | beetle (pending its `species.json`) | climb | stems |
| terrarium | tortoise | squeeze | slow, careful, retraces |
| terrarium | beardeddragon | hop | scrambles in bursts |
| terrarium | ballpython | squeeze | slithers back through the gap |
| hearth | kitten | hop | pounces |
| hearth | bunny | hop | hops |
| hearth | corgi | dig | digs |
| hearth | hamster | dig | burrows |
| hearth | ferret | squeeze | through any gap |
| tidepool | otter | swim | |
| tidepool | octopus | squeeze | fits anywhere |
| tidepool | seal | swim | |
| tidepool | hermitcrab | climb | rocks |
| tidepool | puffin | glide | flies |
| pond | treefrog | hop | |
| pond | axolotl | swim | |
| pond | pondturtle | swim | |
| pond | duckling | swim | |
| pond | beaver | dig | digs and builds |
| nightsky | bat | glide | |
| nightsky | lunamoth | glide | |
| nightsky | owl | glide | |
| nightsky | firefly | glide | |
| nightsky | opossum | climb | trees |

Counts: hop 5, glide 6, swim 5, dig 5, climb 5 (4 ready, 5 with the beetle), squeeze 5; 31
rows, 30 ready. Worth the owner's eye: all
four nightsky fliers share glide, so a nightsky household of fliers gets the same special
whatever the pet; a nightsky pet with a dark-cell twist and a glide is the same on every
screen but identical across species. A swap (the owl to hop, say) is a one-line change.

Board terrain follows the family: swim boards carry water (so the special matters), dig and
climb boards carry walls, hop and glide boards have gaps they cross, squeeze boards have
long single-pad chains. Walls and water may appear on every board as plain obstacles.

## 4. The generator and the solver

Both live in `custom_components/virtual_pet/hop.py`: **pure functions, no Home Assistant
imports**, as `model.py` keeps its game logic apart. Ship 1.

**Deterministic.** `hop_board(pet_id, day, world, family, specials, size)` seeds
`random.Random(f"hop|{GEN_VERSION}|{pet_id}|{day}|{world}|{family}|{specials}|{w}x{h}")`
(a str seed; CPython derives it with a hash that is stable across runs and Python
versions, unlike `hash()`). It draws **only from `random()`**, the one stream the stdlib
documents as stable across versions: a pick is `seq[int(rng.random() * len(seq))]` and a
shuffle is a sort on drawn keys; `choice`, `shuffle` and `randrange` are not used. It sorts
every collection before it picks from it, so dictionary or set order can't change a board.
The pinned golden boards (ship 1) would catch a drift in CI anyway. The server builds the
board once per (pet, day) and serves it, so two screens of one pet get the same board
because the card never generates one (the JS engine has no generator). `pet_id` is the
config entry id (`coordinator.pet_id`), `day` is `_today(now)[0]` (the local date).

**Version guard.** A change to the generator bumps `GEN_VERSION`, and the **board id**
(a short hash of the grid and the specials) goes to the card with the board and back with
the settle. A mid-day upgrade that changes today's board makes the settle answer
`board_changed` and the card loads the new board and drops its parked moves. This happens
at most once per release per pet.

**Candidates and checks.** The generator draws a candidate (terrain by world and family,
finds, start in a low corner, nest in a high corner), solves it, and accepts it only if:

1. **Solvable:** at least one winning move list exists (`win_count >= 1`).
2. **Tidy exists:** at least one tidy list, and not a flood (`1 <= tidy_count <= 40`).
3. **The trap:** the **shortest** winning list is not tidy, and neither is the (deterministic)
   casual bot's list (below). This is the scout's "has a trap" filter, and it is what makes
   tidy hard.
4. **Win is easy:** the deterministic casual bot wins it.
5. **Specials matter:** with specials > 0, every tidy list spends at least one use, and on
   a child's boards a win needs one at least half the time (tunable: this is what makes
   growing up feel new).
6. **Size of search:** the solve stays under a state cap (400,000 in the scratch run) or
   the candidate is thrown away.

It tries up to a fixed number of candidates (200) and falls back to the nearest hand-made
**fallback board** per (family, stage) in `hop.py` if none is accepted, so a day never has
no puzzle. A test asserts the fallbacks pass checks 1-4. A baby has no special, so its six
families share one fallback and a repeat board is possible; that is acceptable only if it is
rare, so ship 1 reports the real acceptance rate per (family, stage) and the fallback share.

**The solver:** a memoised depth-first search over (position, sunk set, uses left, and the
twist's state: the move count's parity, the lantern flag, a crackle pad's half-sunk set). It
counts winning and tidy lists, finds the shortest, and returns one tidy list. It is the
scout's script made exact and bounded; the 6×4 / 3-hop run above is the only timing measured
so far. Ship 1 measures all families and stages and sets the cap (the twists in ship 4).
The same solver serves `hint` (ship 5) and the helper `scripts/hop_solve.py` (ship 1).

**Two bots stand in for players, and bracket the difficulty:**
- **Casual bot:** goes to the nearest find by the shortest walk, then the next, then the
  nest. It uses a special only when no walk exists. If it dead-ends it may undo at most 3
  moves and try its second choice. This is "a player who doesn't think about tidy".
- **Careful bot:** a search with a fixed node budget that prefers lists that sink more
  pads. This is "a player who thinks, and has patience for several undos".

**What "win easy, tidy hard" means as numbers.** Checks 3 and 4 are **per-candidate
filters** and use the deterministic casual bot, so over accepted boards it wins 100% and is
tidy on 0% by construction; asserting 90% / 20% of those would be vacuous. The statistics
use a **noisy casual bot** the filter never sees: seeded, with random tie-breaks among
equal walks and a shuffled find order, so it can differ from the deterministic one. Tuned in
ship 1 over seeded boards per (family, stage) (the twist adds "per world" in ship 4):
noisy casual bot wins at least 90% of accepted boards and is tidy on at most 20%; careful
bot is tidy on 40-70%. The knobs that move the careful bracket are the trap's strictness
(how many moves the tidy list must exceed the shortest win by) and the window on
`tidy_count` (check 2's 40). The scout's "tidy on 40-60% of days for a regular player" is a
target a bot can only bracket. The real figure appears after release from the saved counts
(`played` vs `tidy`, section 8); retuning after that is a normal change (a `GEN_VERSION`
bump).

**This replaces the 70-80% best-play rule** for Hop (decided 2026-11-02): with free undo a
player's best play wins every board, so no win rate can be held to 70-80%. The rule is
replaced by: every board is solvable; a win is easy; the difficulty lives in tidy; and the
bots' ranges above are asserted in pytest. The rule stays for the three repeatable games.

## 5. Where Hop starts

**Decided (owner, 2026-11-02): Hop starts from its own row on the play screen, outside the
picker. Left or Right stays.** The picker keeps its three entries (Left or Right, Higher or
Lower, Dig), so `_fitPicker` and its s2616 audit at 300-420 px are untouched in what they
measure; the row is new surface that needs its own fit rule.

**The row.** One button, `.ghop`, a sibling of `.gpick` in `gameBox`, shown in the picker's
view (`_gameView(s, "pick")`) and hidden in every other view, so it does not exist once a
board is open (the pad is remapped then; section 1). Its label is draft ("Hop of the Day")
and it carries the state:

| state | row says (draft) | press does |
|---|---|---|
| open | "Hop of the Day" | opens today's board, or resumes the parked moves |
| solved, not tidy | "Hop ✓" | opens the solved view with "try for tidy" |
| tidy | "Hop ✓ tidy" | opens the solved view with "back tomorrow" |

**How it fits.** `_fitPicker` (`src/card/card-games.js:93-131`) measures only the `.gpick`
buttons against the close button, the prompt and the screen's foot, and drops to `wrap`,
then `tight`, to fit. A row outside `.gpick` would not be measured and could overlap. So:
the row is measured first and takes a strip at the foot (`bottom: 2%`, one button high,
full width of the picker); the picker's available height is the box minus that strip, and
`_fitPicker` runs the same `wrap`/`tight` search against the reduced height. The row has its
own last step: if the picker still doesn't clear at `tight`, the row shrinks to its label
only, never to nothing. Ship 2b adds a bench shot of the picker plus the row at 300, 330 and
420 and a card-check that no game button or the row overlaps the close button or the
prompt at each width. Existing checks that count `.gpick button` as 3
(`scripts/card-check.js:3410`, `:3488`) stay valid because the row is not inside `.gpick`.

**Where the row learns its state.** The card does not call `board` on every Play press: that
call writes the save at a day rollover (section 8) and runs the generator in the executor.
Instead ship 3a **publishes `hop_day` as an attribute** next to `games` on the mood sensor
(`sensor.py:314`, and in the unrecorded list at `~160`): `{day, done, tidy}`, nothing
personal. The card treats a `day` other than today as "open". Until ship 3a ships the
attribute is absent and the row always reads "open" (ship 2b is behind a flag). The `board`
call is made only when the row is pressed.

**What does not change.** Left or Right stays in the server (`GAMES`, `play_game`, the
service's `vol.In(list(GAMES))`, old saves and automations) and in the card (`GAMES` in
`prefs.js`, `GAME_LEAN`, `gameDayList`, the `kind === "left_right"` branch and game-of-the-day
pick in `card-games.js`, `lines-fresh.js:162`, `people.py:67`, `ANSWERS["game"]`,
`LAST_GAME_KEY`). Hop is not a picker game, so none of those is touched, the game of the day
never picks it, and the F6 "which game" question does not list it. A row outside the picker
is reached from the same Play press, so a daily puzzle is one tap from the pet.

The row and the board sit behind a card config flag (`experimental_hop`, as Catch's
`experimental_catch` once did) until ship 3b settles and pays, then 3b removes the flag.

## 6. Settling: the card plays, the server replays and pays

**What changes.** Today every game tap is a server call that draws and settles the round
(the dig even draws each leaf in its own call, so closing the card can't undo a bee). That
rule exists because those games hide information or luck: the card must not know the
outcome before the player chooses. Hop has neither. The board is known; the rules are
deterministic; undo is free. So for Hop the card plays every move locally (undo needs no
network, and ~16-40 moves would be a long wait on "thinking…"), and **one call** when the
board ends sends the move list. The server rebuilds the board from its own inputs, replays the list
move by move with the same rules, and decides legal, won, tidy, and the pay. The server
never trusts the card's claim of "won"; it trusts only its own replay.

What this costs:
- **Two engines.** The rules exist in Python (`hop.py`) and JS (`hop-engine.js`). One shared
  fixture file, `tests/fixtures/hop_cases.json`, holds boards, move lists and the expected
  result (legal or the index of the first illegal move, won, tidy, final state), and both
  pytest and `tests/js/hop_engine.test.js` run every case. A rule change that touches one
  engine fails the other's test. The JS engine also reads the fixtures' twist cases.
- **No server view of a half-played board.** No idle drop, no "someone else is playing"
  check, no `parked` map. Two screens of one pet each play their own copy; the first settle
  pays and the second answers `already` (the card then shows the solved board, with no
  pay and no scolding). Two people on two screens racing the same board is a non-issue:
  there is nothing to lose. The pay check itself must not race (below).

**When a board ends, and what a plain win means (decided here; the review found the
earlier text contradicted itself).** The rule, in one place:
- **Entering the nest ends the board and settles it, at once, on that move.** There is no
  "done" tap. The card sends the move list that led to the nest. Settle is therefore sent
  once per nest entry, not once per day.
- **A settle does not lock the board.** Win easy, tidy hard means the first nest entry is
  usually a plain win, so tidy has to stay reachable after it. After any settle the card
  shows the **solved view** (the pet curled in the nest, a "solved" or "tidy" line, draft).
  Its one key is **restart** (draft label "try for tidy"), free, which loads the same board
  from the start. Undo does not reach back across the nest: the solved view has no undo; to
  undo a long path the player restarts. The parked list is cleared on a settle and restarts
  from empty.
- **Server side, per settle** (a pure function of the replay and the `hop_day` map):
  first settle of the day, plain or tidy: pays the 23 (`done` set). A tidy settle also pays
  the find if `tidy` is not set (and sets it). A plain settle after `done`: answers
  `already`, pays nothing. A tidy settle after a plain win: pays the find and no second 23.
  A settle after `tidy`: `already`. Nothing to undo ever costs anything.
- Once the day is tidy the solved view has no restart ("back tomorrow"); free practice
  boards (ship 5) are the only thing left to play, unpaid.
- A reload on the same day shows the solved view without a path (the card keeps no list
  after a settle and the server never stored one); "try for tidy" is offered unless tidy is
  set, read from the published `hop_day`.
- **Midnight and bedtime.** A board is for one day and one id. A settle on yesterday's day
  answers `board_changed` and the card loads today's board, dropping the parked moves; a
  board played across midnight is lost. A settle refused with `asleep` leaves the moves in
  the parked list and the player can retry once the pet wakes the same day; if the day
  turns first, they are dropped. This is accepted rather than adding a grace window: a
  board that crosses midnight or bedtime is rare and costs only free replay. (If the owner
  wants a grace window it is a one-line server change: accept the previous day's id until
  the first `board` call of the new day.)

**The call.** A new service `virtual_pet.hop` (with a response, as `play_game` has), not
`play_game` with a new kind: `GAMES` maps a kind to a left/right guess pair and `Game` is a
round counter, neither of which fits. The card calls it through `callService`, so the same
stubbing the card-check uses for the dig works.

| `action` | in | reply |
|---|---|---|
| `board` | | `{result, day, id, w, h, grid (rows), family, specials, world, twist, done, tidy}` |
| `settle` | `id`, `moves` (a string, one letter per move: the **stepped-on** cell's index in reading order, `a`-`x`) | `{result, won, tidy, paid, found?, already}` or `illegal` (with the index of the first bad move), `board_changed`, `too_long` |
| `hint` | `id`, `moves` so far | ship 5: `{result, next}` the next cell of some **winning** list from there (not a tidy one: that would make tidy free) |

Targets, not move kinds: the server derives the move from where the pet was to the stepped-on
cell (the pet has one family, so a two-cell straight move is unambiguous), and applies the
board's rules (a rug's slide, a stump's twin, so the landing cell) itself. `moves` is capped
at 200 letters.
`shared`, privacy and the person work as in `play_game`: a shared screen's call is the
household's; the private-pet `away` answer is rewritten to `asleep`; the same refusals
(`egg`, `asleep`, `away`, `too_tired`) apply at `board` and `settle`. A refusal at `settle`
leaves the moves in the card's parked list so the player can retry. `board` refuses
**without writing the care log** (`start_game` logs every refusal, `model.py:2288-2295`; a
row opened on a tired pet would fill the capped log); `settle` writes one care entry on a
paid settle, like a finished game, and none on a refusal.

**No race on the pay.** `async_play_game` awaits `_who` and `_person` and then mutates
synchronously (`coordinator.py:2820-2870`). The settle does the same: everything that
awaits (the board rebuild, which runs the generator in the executor if it is not cached,
and the replay) comes first; then, in one synchronous block with no `await`, it re-reads
`hop_day`, decides paid / `already`, and writes. Two screens settling at once both finish
the awaited part, and only the first through the block pays. A pytest settles twice
concurrently (`asyncio.gather`) and asserts one pay.

**The cheat surface, honestly.**
- **A forged "won" is impossible:** the server decides. A forged *move list* only works if
  it is a legal winning list on that day's board, which is a solved puzzle. The solver
  being public (or a friend's list pasted in) gives a free solve, not an exploit: the pay
  is one 23 and one find a day.
- **Replay a day's list to be paid again:** `hop_day.day`, `.done` and `.tidy` make the
  second `settle` answer `already` and pay nothing. A tidy settle after a plain win pays the
  find once and no second 23.
- **A list for another pet or day:** the board id binds (pet, day, generator, family,
  specials); a mismatch answers `board_changed`/`illegal`.
- **Cost of a bad request:** capped at 200 moves, a replay is O(moves); no search runs on
  `settle`. `board` generates at most once per (pet, day) (cached in memory, rebuildable);
  it runs in the executor, never on the event loop. `hint` (ship 5) runs a search, so it
  has the same state cap and the executor, and a per-minute limit per pet
  (`R.HOP_HINTS_PER_MIN`), since `settle` is not the only call the plan has to bound.
- **What the server no longer sees:** the number of undos, the time taken, the moves
  abandoned. None of these is paid for, so none is needed.
- **Fishing a favourable board by ✕:** the board is fixed for the day, so no reroll exists.

## 7. Pay

- **Win (first win of the day):** `R.HOP_WIN_HAPPINESS = 23.0`, its own branch beside
  `DIG_WIN_HAPPINESS`, plus the player-trait bonus (`PLAYER_WIN_HAPPINESS`) as other games.
  Why 23 (the owner's number for the dig): it is the lowest that meets Play's 20 at a
  76% win rate, and Hop is once a day, so it can't be farmed. It then costs what a
  finished game costs: `PLAY_ENERGY`, `PLAY_HUNGER`, `WEIGHT_GAME`, and it satisfies the
  `play` need (`_meets_need(state, "play")`). `_finish_game` takes a `Game`
  (`model.py:2540-2575`: `game.kind`, `_game_score`), and Hop has no `Game`, so ship 3a
  adds a separate `settle_hop` in `model.py` with its own tail and factors the shared pay
  (happiness, costs, need, log) out of `_finish_game` rather than building a fake `Game`.
- **No loss:** an unsolved board, a ✕, a restart or a refusal costs and earns nothing and
  logs nothing. There is no 12-happiness loss branch, because nothing can be lost. (This
  differs from the dig, where a 3-minute idle drop is a loss.)
- **Tidy:** the day's first tidy settle also pays **one find** from the pet's world, picked
  and added exactly as `roll_find` does it (`can_find`, `pick_find` with the
  coordinator's flags and the `known` map, `add_find`, a `found` event) but **outside the
  find clock**: `next_find_at` is not touched, so a tidy never delays or doubles the
  clock. A full basket sends the find to the collection unseen, as `add_find` already does.
  A tidy that comes after an earlier plain win the same day pays the find and no second 23.
- **Events and bond:** the settle emits `game_finished` with `game: "hop"`, `won: true`,
  and a `tidy` bool. It is a **separate coordinator method**, not `async_play_game`'s
  loop: that loop calls `game_record(... event["wins"])` unconditionally
  (`coordinator.py:2856-2866`), which a hop event has no `wins` for. The new method gives
  the bond (`BOND_GAME_POINTS`, 2) to the person who settled and bumps the counts.
  `game_record` is **not** used (decided: its "beat your best" line has no meaning for a
  one-a-day board), and nor is `favourite_game`: `add_bond` picks a favourite from `GAMES`
  (`model.py:3442-3444`) and Hop is not in it, so Hop can never be a favourite; fine for a
  first build. `games_played` (`model.py:1551`) counts Hop, one a day, toward the 15-game
  "player" trait (`rates.py:272`); accepted.
- Constants: `R.HOP_WIN_HAPPINESS`, `R.HOP_MAX_MOVES = 200`, `R.HOP_FALLBACK_TRIES = 200`,
  `R.HOP_HINTS_PER_MIN` (ship 5) in `rates.py` (the games block), none in the card.
- The find pay uses the call site `_roll_find` already has (`coordinator.py:1299-1316`):
  `pick_find` and `add_find` take `self.world`, `self.finds`, `self._find_flags`,
  `self.known_finds`, `self.rng`. `roll_find` sets `next_find_at` itself
  (`model.py:~2965`), so calling `pick_find` and `add_find` directly leaves the clock
  alone, as claimed. `can_find`'s asleep rule is moot: a settle refuses asleep.

## 8. Saved state and migration (ship 3a, tier 2)

One new map on `PetState`. It is named `hop_day`, not `hop`: `hop` is already a family, a
game, a reaction (`react.py:30`, `REACTIONS`) and a CSS class (`.pet.hop`, `style.js:359`).

```python
hop_day: dict = field(default_factory=dict)   # {"day": "2026-11-02", "stage": "child", "done": True, "tidy": False}
```

- `day`: the local date the entry belongs to. `stage`: the stage when the day's board was
  **first asked for**; it pins the specials and the size for the whole day, so growing up
  mid-day changes tomorrow's board, not today's. `done`: a win has paid today. `tidy`: a
  tidy has paid today.
- A `board` call for a new day (`day != today`) overwrites the map with
  `{"day": today, "stage": stage_now, "done": False, "tidy": False}`. A stale `day` is read
  as empty and rewritten on the next call (no sweep needed).
- **Counts:** `games["hop"]` joins the existing map as `{"played": days won, "won": days
  won, "tidy": days tidy}`. `from_dict` whitelists the keys
  (`model.py:~774`, `("played", "won", "dropped")`), so `"tidy"` is added to that tuple.
  There is **no streak** (decided): counts only go up, so a missed day costs
  nothing, per the experience plan's "never guilt, nagging, ranking people or anxious
  timers".
- **Migration:** none beyond defaults. An old save has no `hop_day`, so it loads as `{}`; an
  old `games` has no `hop` entry. `from_dict` validates `hop_day`: `day` an ISO date string,
  `stage` one of `LIFE_STAGES`, `done` and `tidy` bools; anything else drops the whole map.
  `shift_times` has nothing to shift (a date, no times). A retire or a new egg clears it,
  like the game. **Downgrade:** an older version keeps unknown top-level keys and re-emits
  them in `to_dict` (`from_dict` keeps unknown keys, `model.py:665-675, 819`; `to_dict`
  re-emits them, `:659`; the dig's `parked` relied on it); ship 3a's test round-trips a save
  with `hop_day` through the current loader to confirm the key survives, and
  `test_damaged.py`'s pattern covers a damaged map.
- `SAVE`/`diagnostics`: the day's board is **not** stored (it is rebuilt), and the move list
  is never stored, so nothing about how a person played is saved. `diagnostics.py:99` dumps
  `pet.to_dict()`, so `hop_day` (day, stage, done, tidy: nothing personal) appears in the
  `pet` block on its own; ship 3a's diagnostics test snapshot is updated for it.
- **Published:** `hop_day` is an attribute on the mood sensor beside `games`
  (`sensor.py:314`) and is added to that sensor's unrecorded list, as `games` is, so the
  recorder does not keep it. A private pet publishes it as it publishes `games`.

## 9. Slices

Five numbered ships, seven builds: ship 2 splits into 2a (server, `board`) and 2b (card),
and ship 3 into 3a (server, settle and save) and 3b (card). The review found ship 2 added
server code under a "card, tier 1" label and ship 3 was too big. Gates follow `AGENTS.md`:
ships run `scripts/gate --auto`; the first mate gates the merged batch once. A build that
adds server code (1 is Python and JS, 2a, 3a, 5) makes `pick-sections` choose `all`, so it
uses `scripts/ci-gate`. 3a is tier 2.

### Ship 1: the Hop engine, generator and solver (Python and JS, tier 1, L)

`hop.py` (rules, six families, stage table, `FAMILY_OF`, generator, solver, bots, fallback
boards) and **its twin `hop-engine.js`** (pure, top-level in a new part before the class
chain, no `this`), with `tests/js/hop_engine.test.js`; `rates.py` constants; the shared
fixture file; `scripts/hop_solve.py` (below); no service, no card UI, no save field. The JS
engine is here, not in 2b, so the shared fixtures are checked by both engines from the
start: a rule ambiguity found while writing the JS then forces a rule change *before*
anything has merged, not a `GEN_VERSION` bump and a golden regeneration after. It changes no
player-visible behaviour (it is dead code in the card until 2b).

Acceptance (pytest, `tests/test_hop.py`; `node --test`, `tests/js/hop_engine.test.js`):
- Rules: every case in `tests/fixtures/hop_cases.json` passes **both** engines (at least:
  one legal and one illegal case per family, a pad sinking, a stone crossed twice, the nest
  closed until the finds are in, undo-equivalent lists, the scout's sample with its 20/3
  counts at 1 hop).
- `FAMILY_OF` covers every ready species (read from `species.py`'s catalog or
  `frontend/sprites/*/species.json`, not a copy), names no species outside `worlds.json`'s
  rosters, every family has at least one ready species (climb has four ready, five with the
  beetle), and an unknown species gets the default family instead of raising.
- Determinism: the same inputs give the same board twice and in a fresh process; one input
  changed gives a different board; a golden set of 12 boards is pinned so an accidental
  generator change shows (an intentional one bumps `GEN_VERSION` and regenerates the file).
- Checks 1-6 of section 4 hold for seeded boards per (family, stage): **50 per cell in the
  default suite** (6 families × 4 stages = 24 cells, 1,200 generations) and **1,000 per cell
  behind a marker** (24,000 generations, run once for the ship's report; the build confirms
  the default run fits the pytest budget and adds the marker to the pytest config if there
  is none). The bots' ranges are asserted over the larger run. The tests assert **state
  counts** (the solver's visited states stay under the cap), not wall-clock time, which
  flakes on CI shards. Fallback boards pass checks 1-4. There are no twists yet, so "per
  world" is not a ship 1 dimension; it joins in ship 4.
- The ship's report gives the measured acceptance rate and fallback share per family and
  stage, with 4×3 and 5×3 (baby, Wednesday) called out, and the noisy- and careful-bot rates,
  so ships 4-5 and the owner's tuning start from numbers.
- `scripts/hop_solve.py` reads a `board` reply (JSON on stdin) and prints a winning move
  list and a tidy one, using the same solver. Ship 3a's real-HA round trip uses it: the
  live board depends on the dev pet's entry id and today's date, so no fixture list can
  match it.

### Ship 2a: the `board` service (server, tier 1, S-M)

`virtual_pet.hop` with `action: board` only: the service schema in `__init__.py`, a
coordinator method that builds the board off the event loop and caches it per (pet, day),
the same refusals as `play_game` (`egg`, `asleep`, `away`, `too_tired`, `away` rewritten to
`asleep` for a private pet) **without writing the care log**, `shared` and the person as in
`play_game`, and its `services.yaml` / `strings.json` / `translations/en.json` text in this
ship (a registered service with no description fails hassfest, `.github/workflows/validate.yml`).
No save field: the stage is read live until 3a. Nothing is paid.

Acceptance (pytest): the reply shape (`day, id, w, h, grid, family, specials, world, twist,
done, tidy`); the same pet and day answer the same board; a new day, a stage change and a
generator version each change the id; every refusal, with no care-log entry written; a
private pet's `away` becomes `asleep`; `shared` and privacy as `play_game`; an unknown
species falls back to the default family; the executor, not the loop, builds it (a test
that the call does not block, by the repo's pattern). The care log stays unchanged.

### Ship 2b: board mode and a playable board (card, tier 1, M)

`card-board.js`, CSS, the Hop row (section 5), the pad remap, tap-then-confirm, park/resume,
the Escape handler on the card, `card-season.js` repointed, all behind `experimental_hop`.
Nothing is paid and nothing is settled.

Acceptance:
- **bench:** `view: "board"` shots at 300, 330 and 420 for each family (a board, a lit cell,
  a spent special, a solved view, a tidy view), a "blocked key" shot, each stating the
  measured cell size; the picker with the Hop row at the three widths. `--preset hop` is
  added.
- **card-check** (new section `board`, after `resume`, with stubbed `callService` replies,
  not a random draw): the row sits outside `.gpick` and the picker still counts three
  buttons; no button or the row overlaps the close button or the prompt at 300, 330 and
  420; the pad remaps and restores; a lit cell then a second tap commits at 300; one tap
  commits at 420; an arrow key commits at once; undo restores a sunk pad and a use; each
  move is written to `localStorage` and ✕, Escape on the card, a swipe to another pet, **a
  slide reused (`_forget`)** and **the pet falling asleep mid-board** all leave the same
  moves to resume; a different board id drops them; no care action fires from a game key and
  a calling pet's pulse does not light one; the keys carry aria labels; reduced motion cuts
  the hop tween.
- A `board` reply with an unknown `family` or a malformed grid shows nothing and logs once
  (a card-check stub case).
- The real-HA run owns the wiring only (the row calls `board` and the reply has the right
  shape).

### Ship 3a: settle, pay, saved state (server, tier 2, M)

`settle` in `virtual_pet.hop`, the replay in `hop.py`, `settle_hop` and the pay (section 7),
the `hop_day` map, its published attribute and `games["hop"].tidy`, the tidy find, the
privacy mapping, the service text for `settle`.

Acceptance:
- pytest (`tests/test_hop.py` and `tests/test_finds.py`'s pattern): settle with a
  solver-made winning list pays 23 plus the trait bonus and the play costs, once; a second
  settle answers `already` and pays nothing; a tidy list pays the find once (basket and
  full-basket cases); **a tidy settle after a plain win pays the find and no second 23**;
  **two concurrent settles pay once** (`asyncio.gather`); an illegal list, a too-long list,
  another pet's board id and a stale generator id each answer their code and pay nothing;
  every refusal (`egg`, `asleep`, `away`, `too_tired`, and `away` rewritten to `asleep` for
  a private pet) pays nothing and writes no log; a new day resets `done` and `tidy`; `shared`
  goes to the household and the bond to the person; `game_record` and `favourite_game` are
  not called; no `next_find_at` change.
- Save: an old save loads (`hop_day` `{}`); a new one round-trips; a damaged `hop_day` (wrong
  types, bad date, unknown stage) is dropped; the unknown-key survival check; `games["hop"]`
  loads with and without `tidy`; the published attribute and the diagnostics snapshot.
- **One real-HA round trip:** fetch the board, feed the reply to `scripts/hop_solve.py`,
  settle with its list, check the pay and the saved day. (The earlier "a list from the
  fixtures" could not match the live board.)

### Ship 3b: the row's state, settle wiring, flag removal (card, tier 1, S-M)

The card sends the move list when the pet enters the nest, shows the solved view with its
restart ("try for tidy"), reads `hop_day` for the row's label, shows the settle replies
(win, tidy with a find, `already`, `illegal`, `board_changed`, each refusal), and removes
`experimental_hop`; `strings`/guide/README/how-to-play lines (draft).

Acceptance:
- card-check on stubbed replies: the settle contract above; a plain win then a restart then a
  tidy settle (stubbed `already` then `found`); the solved view has no undo and a restart
  only while tidy is not set; `board_changed` loads the new board and drops the parked
  moves; a refused settle (asleep) keeps the moves; the row reads open / solved / tidy from
  the attribute and from a stale `day` (open); a reload on the same day shows the solved
  view.
- bench: the row in each of its three states at 300, 330 and 420; the solved view.

### Ship 4: world twists (engine and generator, tier 1, M)

The six twists of section 2c, with the holes settled there, in `hop.py` and
`hop-engine.js`, their generator terrain and checks, fixtures, one bench shot per world.
"Per world" first appears here: the acceptance and bot ranges are now per (world, family,
stage).

Acceptance: each twist has fixture cases both engines pass (a stump pair, a crackle pad's
two visits, a rug slide against an edge and against a wall, a pool across the move
parity with an undo, a ripple chain, a lantern then a dark cell); checks 1-6 hold for each
world; the bot ranges hold per world; card-check `board` is rerun on a board per twist
(stubbed); the bench `--preset hop` shows all six worlds. A save made before this ship loads
(the board changes, the saved map doesn't); a settle on yesterday's generator id answers
`board_changed`.

### Ship 5: hints and practice boards (server and card, tier 1, S-M)

The `hint` action (a server solve from the position; the card's hint key; the pet looks
toward the cell after three undos in a row, draft line "hmm… that way?"). The hint is the
next cell of some **winning** list from the position, not a tidy one (a tidy hint would make
tidy free and pay the find). It runs the solver with the same state cap, in the executor,
with a per-minute limit per pet (`R.HOP_HINTS_PER_MIN`), because a search per call is a cost
`settle` never has.
Practice boards (decided: daily first, unpaid practice in this last ship): `action: board`
takes `n`, the board is the same function with `n` in the seed, and the settle for a
practice board is **free and unpaid** (answers `practice`), which has no cheat surface
because it pays nothing. They fill the row's idle time after the day's board is done.

Acceptance: pytest — a hint from any reachable position is the first move of some
winning list (checked on the fixtures and on generated boards), a hint from a dead end
says so, hints cost nothing and save nothing, the per-minute limit answers and recovers;
practice boards are deterministic, differ by `n`, pass checks 1-4 and never change
`hop_day`, `games` or the happiness; card-check — the
hint key calls the stubbed service and lights the returned cell; the pet's glance after
three undos; bench — a hint shot.

### Device queue (not blocking any ship)

Only a phone shows these. Each ship above stands without them; they tune numbers.
- Tap, then confirm, with a real thumb on a 300 px card: does the grown hit area feel right,
  or does the first tap need to move the light more visibly?
- Whether the 35 × 34 px cell reads at arm's length, and whether 6×4 should be 5×4 at the
  smallest width (the server size is fixed, so this would be a global cap).
- Whether the pad remap is understood without a line telling the player.
- How long a board takes: this plan guesses 2-5 minutes at child and 5-10 at adult.
- The first week of `played`/`tidy` counts, against the bots' brackets (section 4).

## 10. Docs the build updates

`docs/features.md` (a row; the Hop row on the play screen), `docs/guide.md` and README (the games text),
the `virtual_pet` service texts (`strings.json`, `translations/en.json`, `services.yaml`),
`dev/bench/README.md` (`view: board`, the `board` field, the preset), `AGENTS.md`'s part
table (two new parts: `hop-engine`, `card-board`), and the how-to-play page. All with draft copy.

## 11. Not verified / risks

- The only run was the scratch timing above: hop move only, random boards, no twist, no
  trap filter. The generator's acceptance rate for the trap filter is unknown until ship 1;
  if it is low, the candidate cap rises or boards are made by editing a solved base.
- The 2×4 pad and the 35 × 34 px cell come from the scout's single 300 px render.
- The picker-plus-row fit (section 5) has no bench shot yet; the review took none either.
  Ship 2b's first job is the 300 / 330 / 420 shots, and the row's strip may need a design
  pass if the picker at `tight` has no room for it.
- The twists for terrarium, pond and nightsky, and the squeeze family, are this plan's
  proposals and are the likeliest to be changed after the owner looks.
- Checked by the review and the fold: nothing in `intent.py`, `llm.py` or `blueprints/`
  calls `play_game`; callers of `left_right` are `__init__.py`, `services.yaml`, strings,
  `coordinator.py`, `model.py`, tests, `scripts/balance_sim.py`, `scripts/card-check.js`
  and `dev/bench/page.js`. With Left or Right staying, none of them changes. The F6 "which
  game" question and the game-of-the-day pick need no Hop entry either, for the same reason.
- `can_find`/`pick_find`'s `flags` and `known` arguments are the coordinator's
  (section 7 gives the call site), so that item is closed.
- Not run by this plan or its review: the generator, the bots, the twists, the picker with the
  row at 300-420 px, and any timing beyond the scratch run. The sample board's counts
  (20 winning lists, 3 tidy, shortest win 12 moves, shortest tidy 16) were re-run by the
  review with its own solver and hold.
- Path puzzles with sinking tiles are a known genre. The piece, the species moves, the
  growth and the world twists are what is this game's own.

## Decided (2026-11-02)

These were open questions in the first draft. The owner and the first mate settled them on
2026-11-02, so a ship worker does not wait on them. The numbering is the old one.

1. **The 70-80% best-play rule is dropped for Hop** (first mate). A win is easy, tidy is
   hard, and the bots check it (section 4). The rule stays for the three repeatable games.
2. **The card plays; the server replays the move list and pays** (first mate; section 6).
3. **The species → family table is approved as drafted** (first mate; section 3). The
   owner may still name swaps; each is a one-line change.
4. **Daily first; unpaid practice boards come in the last ship** (first mate; ship 5).
5. **Where it starts** (owner): Hop starts from its own row on the play screen, outside the
   picker. **Left or Right stays** (section 5).
6. **Pay** (first mate): the first win of the day pays 23 happiness; no loss state; tidy
   adds one world find (section 7).
7. **No streak; counts only; no `game_record` line** (first mate; sections 7-8).

Also settled by this fold, for the first mate to veto: a nest entry ends the board and
settles at once, a plain win does not lock the day, and the solved view offers a free restart
for tidy (section 6); a board that crosses midnight or bedtime is lost, with no grace window;
the saved map is `hop_day`, not `hop` (section 8).
