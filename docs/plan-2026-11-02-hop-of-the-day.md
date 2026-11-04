# Plan: board mode and Hop of the Day (2026-11-02)

Status: ships 1, 2a and 3a are built (2a: s2779, `73564bfb`, awaiting the batch gate; **3a: s2857,
`5c0b2ad8`, awaiting owner merge OK**); the rest is plan. The build is five numbered ships, seven builds (section
9: 1, 2a, 2b, 3a, 3b, 4, 5). **Ship 3a is tier 2** (it adds a saved field, `PetState.hop_day`);
the others are tier 1. The owner picked Hop on 2026-11-02 from scout s2713's five concepts.
The decisions made on 2026-11-02 are recorded at the end ("Decided"); nothing is left open
except what section 11 lists. Folded on 2026-11-02 (s2722) from adversarial review s2718:
every finding was checked against the code at `7fe09174` before it was written in.
Folded again on 2026-11-02 (s2772, ship 1) from review s2771's P1-P13 and the first mate's
answers to its four questions (Decided 8-11): the rules ship 1 pinned are in sections 2-2b,
the generator, solver and bots as built in section 4, the API later ships call in ship 1.
Reconciled on 2026-11-03 (s2781) after ship 2a (s2779, `73564bfb`, on branch
`crew/hatch-at-home-s2779-hop-of-the-day-ship-2a-the-boa`) and review s2778's 19 problems
and Q1-Q5: ship 2a is marked shipped and its text matches the build; Decided 12-15 record
the first mate's answers; ship 2b carries the review's card findings. **Q3 (where the keys
live) was decided by the owner on 2026-11-03: Option A, the keys in the `gameBox` overlay
(Decided 16)**; section 1 and ship 2b were edited to match (s2800).
Folded on 2026-11-03 (s2856) from adversarial review s2855 of ship 3a (P1-P17, Q1-Q4) and
the first mate's answers (Decided 17-20): every finding was checked against the code at
`0bc3c1b8` first. Sections 6-8, ship 3a and ship 3b carry the edits. In short: `settle`
refuses `egg`, `away`, `asleep` and not `too_tired`; it answers `board_changed` on a stale or
empty `hop_day` and never writes it; the day rolls over only forward; `tidy` is set whatever
the find's outcome; the reply is one table (`ok` with `won`, `tidy`, `paid`, `found`,
`already`; plus `not_won`); the pay block re-checks after its awaits; `hop_day` is published
on the life-stage sensor. Ship 3a can be built from this plan alone.
Reconciled on 2026-11-03 (s2858) after ship 3a as built (s2857, `5c0b2ad8`): Decided 21 records
the first mate's acceptance of its readings; ship 3a is marked built; ship 3b is rewritten
against the as-built reply and refusals, and carries the review of 3b itself (P1-P12, Q1-Q4).
Ship 3b can be built from this plan alone.

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
on random boards: the generator needs a filter to make it hard (section 4).

**Measured in ship 1** (s2772, this machine, CPython 3.14, the dev venv). Review s2771 (P2)
pointed out that the run above was a feasibility search with an early exit, and measured a
full counting solve on open random 6×4 boards at about 1.2 s mean. The full count does blow
up on open boards (an obstacle-free 6×4 at 3 hops passes 3,000,000 states), but the
generator's candidates (section 4's table: 15-25% walls and water at teen and adult, the
static-reach prune) solve in a few ms each. Measured:
- `hop_board` (generator, every check, bots included), 200 boards per (family, stage), 4,800
  boards: **median 7 ms, mean 21 ms, worst 0.87 s** (squeeze adult). By stage: baby median
  0.3 ms, child 8 ms, teen 12 ms, adult 19 ms; worst per stage 55 ms, 152 ms, 314 ms, 866 ms.
  The target was median under 1 s, worst under 5 s (Decided 9); a Pi-class box several times
  slower stays inside it. The board still runs in the executor (2a).
- `HOP_FULL=1`, 1,000 boards per (family, stage), 24,000 boards: **no fallback in any
  cell** (the cap is 10%). Candidates per board: baby 2.4-2.6 (about 40% of baby 4×3
  candidates pass), child 4.4-8.0, teen 2.1-4.7, adult 1.6-4.0. Largest solve 99,964 states
  (hop adult) under the 100,000 cap.
- Noisy casual bot over the same boards: wins 94.7-99.8% per cell, tidy 0.0-0.2%.
- Careful bot (budget 300) tidy per cell: baby 100%, child 76-97%, teen 49-92%, adult
  41-91% (squeeze lowest, dig highest). It moves with its budget: over 40 boards per
  family, child 34% / 55% / 74% / 92% at budgets 25 / 50 / 100 / 300 moves tried, teen
  23 / 45 / 57 / 75%, adult 18 / 48 / 60 / 72%. So the draft 40-70% band is a statement about
  the budget, as review P9 said; the board-side knobs are `TRAP_MARGIN` and `TIDY_MAX`.

## 0. Summary

- **Board mode** (ships 2a-2b): while a board game is on, the game's keys sit in the game
  overlay, as the dig's do (the care pad is untouched), and the LCD shows a grid. Cells under 44 px (every card up to about 376 px) use tap,
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

**The keys sit in the `gameBox` overlay, as the dig's do** (owner, 2026-11-03, Decided 16).
While a board is open the screen belongs to the board: the Hop row (section 5) lives in the
picker's view and is gone once a board is open, so a game key never has to share the screen
with it. The keys are part of the `gameBox` view, built in `_gameView` beside the dig's
(`.gl`, `.gr`, `.gx`). The care pad (`ACTIONS` in `prefs.js`), `_press`, the lights key, the
`wants` pulse and the pad's `aria-label`s are not touched, so no care action can fire from a
game key by construction. Hop's keys (all draft labels), eight in a 2×4 block:

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
when the card is removed (`card-base.js`), when a slide is reused (`_forget`,
`card-build.js`), when the pet falls asleep, goes away or is an egg mid-board
(`card-layout.js`), and on a failed call (`card-games.js`). Writing on every
move makes all of them safe. Escape is a `keydown` on `gameBox` only
(`card-build.js`); the keys are inside the overlay, so that handler already sees them. (Line numbers drift: the review found every one
in this section stale within a day. Grep for the name, e.g. `grep -n "_endGame(" src/card/*.js`.)
**The board's state is `s.game`, not a new flag** (review problem 9): every one of those
paths, and the status sheet, the idle drop and the power-off checks, tests `s.game`; a
separate `s.board` would skip all of them. See ship 2b.
Why the card and not the server: the board has no hidden information and no luck, so a
parked game can't be fished. A player who ✕s and comes back sees the same fixed board and
their own moves, which they could redo for free anyway. Nothing is lost if the browser
forgets it. A new day, a new board id (a stage change, a generator version bump) drops the
parked list without comment. Starting Hop again resumes it; a board that was settled shows
the solved view (section 6). No timer anywhere, so there is no idle drop and the server
never sees a half-played board.

**Everything else.**
- Turn-based. Under `prefers-reduced-motion` (and `calm()`) the hop piece's move becomes a
  cut; nothing else moves. The piece's motion follows the composition rule in `AGENTS.md`
  ("Motion on the card"; ship 2b says how). Sound is off unless the player opted in.
- The pet reacts to each move with the frames it already has (`acts.ready` at the start, a
  hop frame per special, the `won` pose at the nest; the existing cheer or `aww` frames
  stand in). No new art in any ship. A line is never required to play.
- The keys are part of the `gameBox` view, `_press` and the pad are untouched, so no care
  action can fire from a game key and the pad's `wants` pulse and aria labels need no
  handling.
- Where the code goes: a **pure engine** top-level in a new part, `src/card/hop-engine.js`
  (before the class chain: it holds no `this`; ship 1), and the board view as a new class
  link, `src/card/card-board.js` (`HatchPetCardBoard`, between `card-games` and
  `card-season`; ship 2b). Both go in `manifest.txt` in that order. `card-season.js:1` is
  `extends HatchPetCardGames` and is repointed to `HatchPetCardBoard`. Board CSS goes in the
  `style` part. Per `AGENTS.md`, run `scripts/card-check` after the first build: a manifest
  order mistake shows there (a TDZ error), not in `node --check`.
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
| `o` | stone | walkable; never sinks, any number of crossings. **Never two orthogonally touching** (a generator rule, below) |
| `~` | water | blocked |
| `#` | wall (a rock or log) | blocked |
| `P` | start | a pad the pet stands on |
| `N` | nest | enterable only when every find is picked up; entering it ends the board (section 6 says what ends means for the card) |

- **Step:** 1 cell up, down, left or right, onto a walkable cell that hasn't sunk.
- **The move into the nest sinks the pad it leaves**, like any move: a tidy list's last pad
  sinks on the way in.
- **Entering the nest ends the board:** a letter after it is illegal at its index. An empty
  list is illegal at 0; a letter outside `a`-`x` or past the board's last cell is illegal at
  its index. A list over 200 letters is `too_long`, decided before any replay.
- **No two touching stones** (FM, Decided 8). Every move but a step between two stones sinks a
  pad or spends a use, so with no two stones side by side the moves can't loop and the count
  of winning lists is finite. Two touching stones make a free loop (o1, o2, o1, ...) and an
  endless count. The generator never places them; the solver raises on a state met twice on
  one line rather than loop. **Ship 4's rule (Decided 34):** no two orthogonally
  touching cells of the **never-sinking walkable class**: stones `o`, stumps `1` `2` (a stump
  beside its own twin too: the pet on one would name the other and land where it stands), rugs
  `=` and pools `%` (a pool is a stone every other move, so a pool beside a stone is a free
  loop). The generator places twist cells with the same "near" test it uses for stones, the
  check is `touching_never_sinking(board)` (it replaces `touching_stones`), and `check()` also
  catches the solver's `CycleError` and rejects the candidate (`Verdict(False, "loop")`), so a
  missed adjacency costs a candidate, never the day's `board` call.
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
| **glide** | 1 cell diagonally, over the corner whatever is there (the landing is on the board, so both corner cells are) | glide |
| **swim** | step onto a water cell. Water stays water; it never sinks and can be left by a step. | entry |
| **dig** | 2 cells straight with a **wall** as the middle cell (tunnel under it) | tunnel |
| **climb** | step onto a wall cell. A wall stays a wall; it never sinks and can be left by a step. | entry |
| **squeeze** | step back onto **one sunk pad** (slip through the gap it left), any pad: a find pad, the start; it stays sunk when left | squeeze (each one: "one sunk pad" is per use, not one at a time) |

The scout's first sketch had the squeezer "fit through a crack" with a new terrain. This plan
uses a sunk pad instead so six families need only four terrains. Swim and climb are the same
shape on different terrain on purpose, so the rules read in one line each.

### 2b. Stage sets the specials and the size

| stage | specials | largest board | notes |
|---|---|---|---|
| egg | n/a | n/a | refused, as every game (`_refuse_play`) |
| baby | 0 | 4×3 | starter boards: steps, pads and stones only; **no twist** (Decided 26) |
| child | 1 | 5×4 | the family's special appears |
| teen | 2 | 6×4 | |
| adult | 3 | 6×4 | |

Size rotates by weekday: **Wednesday is one column narrower** than the stage's largest
(draft; the scout's "a short one midweek"), **never below 4 wide**: a baby's Wednesday
stays 4×3, because a 3×3 board (9 cells, no specials) is unlikely to pass the trap filter
and every Wednesday baby would get the same fallback. The sizes are therefore 4×3 (baby,
every day: the only steps-only boards), 5×4 (child; teen and adult on Wednesday), 4×4 (child
on Wednesday) and 6×4 (teen, adult); there is no 5×3. Ship 1 reports the acceptance rate per
size, 4×3 called out. The number comes from
`life_stage(state)`.
Growing up opens new boards; it does not touch today's (section 8: the stage is pinned for
the day).

### 2c. One twist per world

All six worlds come from `worlds.json` (woodland, terrarium, hearth, tidepool, pond,
nightsky). A world adds **one** rule to its boards, with its own cell glyph, from ship 4
(ships 1-3 have no twist). **Babies have no twist** (Decided 26: a 4×3 with one obstacle,
one stone and one find has no room for one, and the shared `base` fallback and every baby test
stay as they are); a twist starts at child. No twist uses real time. The scout gave examples
for three; the other three are this plan's proposals.

| world | twist (draft name) | glyph(s) | rule |
|---|---|---|---|
| woodland | **stump holes** | `1` `2` | stumps come in pairs. Stepping onto one puts the pet out of its twin in the same move, free. Stumps never sink. |
| terrarium | **crackle pads** | `c` | a crackle pad sinks only on the **second** time it is left (it is walkable once more after the first). Tidy needs two visits to every one. |
| hearth | **rug** | `=` | a rug is walkable and slides the pet one **more** cell the way it was going, if that cell is walkable (else it stops on the rug). Rugs never sink. (scout) |
| tidepool | **tide pools** | `%` | a pool is a stone while the **count of moves made is odd**, water while it is even; undo rewinds the count. (scout: "open and close every 2 moves"; this plan fixes the 1-move version, Decided 28.) |
| pond | **ripple pads** | `r` | a pad that, when it is left, also sinks the pads to its right (chain below). It never sinks a find pad (Decided 27). |
| nightsky | **dark cells** and a **lantern** | `?` `*` | a dark cell is drawn dim and **can't be entered** until the lantern `*` (an ordinary pad) has been entered; then every dark cell becomes a pad for the rest of the board. (scout: dark cells light next to a lantern; this turns it into a rule instead of a view, because a view-only twist makes nothing harder with free undo.) |

**Engines read the grid glyphs only** (Decided 32). A board's twist is whatever its glyphs
say, so a fallback, a hand-written fixture and an older parked list play correctly with no
field, and a board cannot disagree with its own `twist`. The `board` reply's `twist` is a
**string id for copy and the bench only**, derived from the grid by one function
(`twist_of(board)` in `hop.py`): `"stumps"`, `"crackle"`, `"rug"`, `"pool"`, `"ripple"`,
`"lantern"`, or `null` for a board with none (a baby's, a fallback's). No rule reads it. One
board holds the glyphs of **one** twist only (`Board.__post_init__` and `valid()` refuse a
mix; P13).

**The holes the review found, settled** (each is a fixture case in ship 4):
- **Tide pool.** A pool's phase is judged **when the pet steps onto it**, by the move count
  that move makes (odd: stone, enterable; even: water, blocked). The pet leaves the pool on
  its next move, and every move changes the count, so a pet never stands on a pool when it
  turns to water. A special move counts as one move. **The phase is fixed at one move**
  (Decided 28: the build does not tune 1 or 2). **A special move that lands on a pool**
  (hop, glide) follows the same test, so a pool in its water phase is blocked to it as any
  water is; a swim use onto a pool in its water phase is a water entry like any other. Undo
  rewinds the count. **What the card draws** (P11) is the phase of the **next** move: the
  board on screen sits at count *n*, and a pool is drawn as stone when *n + 1* is odd (so
  every pool is a stone at the start, *n* = 0), water when it is even. The key labels follow
  the same phase (a pool in its water phase is "blocked", never "sunk").
- **Rug.** Stepping onto a rug in direction *d* slides the pet one more cell in *d*, only if
  that cell is walkable and unsunk; else it stops on the rug. **"Walkable" is the plain
  meaning**: for the swim and climb families a water or wall cell is not walkable, so a rug
  never slides the pet into one (a swim use is a separate move; the slide is not a use). The
  landing cell is an ordinary entry (a find is picked up; the nest opens only if every find
  is in, else the pet stops on the rug; a stump's twin applies). A rug is not a pad, so it
  never sinks and "leaving" it sinks nothing; the cell the pet left before the rug sinks as
  usual. Hop and glide land on a rug without sliding (only a step slides). Rugs never touch
  another never-sinking cell (section 2), so a slide never meets a second rug. **The landing
  differs from the named cell** (see "Landing" below).
- **Stump pair.** Stepping onto a stump puts the pet on its twin in the same move; it never
  stops on the first. Stumps never sink, so the twin is always free. A special move may land
  on a stump (then the twin rule applies). **Each glyph is exactly one pair**: `1` appears
  twice and `2` twice or not at all. A child's board has the one pair (`1`), a teen's or
  adult's one or two (draft, tuned by the generator's candidate table, not by a rule). The two
  cells of a pair never touch each other or any other never-sinking cell (section 2).
- **Crackle pad.** Never carries a find, the start or the nest. It sinks on the second
  leaving: the first leaving makes it **half-sunk** (still walkable, still a pad for tidy); a
  squeeze use steps back only onto a **fully sunk** pad, never onto a half-sunk one. A crackle
  pad is a pad: tidy needs every one fully sunk, so two visits each.
- **Ripple pad, the chain** (P2, Decided 27). On leaving a ripple pad `r`, it sinks as
  any pad does; then, going **right along the same row** (no wrap), the pads to its right sink
  while they are `r` (each of those sinks too, and the chain goes on); the chain **stops at
  the first cell that is not `r`**, and that cell sinks as well only if it is a plain pad
  `.`. It stops at the row's edge and at a cell already sunk. It **never sinks a find pad
  `f`, the start `P`, a stone, a nest or a non-pad**, so a ripple never changes which finds
  are in: "the find is in" is still "the find pad sinks, or the pet is on it" in both engines,
  the solver, the bots and the card, and no picked-finds mask is added. **The entry is judged
  before any sinking**: the pet may step from `r` onto its right neighbour `X`, and `X` is
  then sunk while the pet stands on it (it cannot be stepped back onto; leaving it sinks
  nothing new). A special move that leaves a ripple pad fires the chain too.
- **Lantern and dark cells** (P10, Decided 31). The lantern `*` is an ordinary pad; it is
  **lit by any entry** onto it (a step, a hop or glide landing, a squeeze back onto it).
  **Lit is derived, not stored**: the lantern is lit when it is sunk or the pet stands on it
  (one twist per world, so no ripple shares the board). Before it is lit, a dark cell is not
  walkable, so **no special move lands on one** (2a: specials land on walkable cells) and a
  swim or climb use cannot enter one either. Once lit, a dark cell is **a pad in every way**:
  it sinks when left, a squeeze may step back onto it once sunk, and **it counts toward
  tidy** (Decided 31): the pad mask for tidy holds every dark cell from the start, so tidy
  means lighting the lantern and sinking each dark cell. The static reach (the cut-off test)
  treats a dark cell as walkable only once the lantern is in the reached set. A dark cell
  never carries a find, the start or the nest.
- **Landing.** Stump and rug make the landing cell differ from the named cell. The move letter
  is still the **stepped-on cell's** index; `step()` returns the state at the landing, and
  nothing in either engine, the solver, the bots or `reach` may assume that the landing is
  the target (ship 4a lists the places). A rug slide into the nest, with every find in, is a
  win on that move.
- **Move letters.** A letter is the **stepped-on cell's** index (reading order, `a` to `x`),
  not the landing cell: for a rug or a stump the server derives the landing. `a`-`x` is
  exactly 24 letters, 6×4; the 6×4 cap is deliberate, and a wider board is a format change
  (a `GEN_VERSION` bump and a longer alphabet), not a tweak.
- **The state.** The twist's state is **never in a board without that twist** (P5, Decided 32):
  `State` and the JS `view()` keep `{pos, sunk, uses, done}` and gain, only on boards that
  hold the glyph, `parity` (the move count mod 2; pool boards) and `half` (the half-sunk
  crackle pads as a list of cells in `view()`, a bit mask inside; crackle boards). The lantern
  flag is derived (above). `fromView` defaults a missing `parity` or `half` to 0, so a parked
  list, `_hopNest` and every existing fixture's `final` stay as they are. The memo key
  widens by those fields on the boards that have them, and on none else, so the other
  worlds' state counts do not double.
- **Cells and invariants** (P13). The engines' `CELLS` grow from `.fo~#PN` by the glyphs above,
  in both engines in the same commit. `Board.__post_init__` and `valid()` refuse: a stump
  glyph that is not exactly paired, a `?` with no `*` (or a `*` with no `?`, or two), a
  second twist kind on one board, and a twist glyph on a baby board (`specials == 0` and a
  4×3 is never given one). `tests/fixtures/hop_cases.json` has a `bad_boards` case
  `"P.o?"` ("a cell that is not one"); it becomes a valid dark cell, so the 4b commit that
  adds `?` changes it in the same commit.
- **Old cards.** A card cached from before the ship refuses a twist board (`valid()` is false:
  `card-board.js` ends the game with one console warning and no copy). The release's
  VERSION cache-bust covers that in normal use; no extra line is added.

Each twist is a small addition to the shared engine (Python and JS) and the generator, and
gets its own fixture cases and one bench shot per world. Ship 4 is built in two parts
(Decided 33): **4a** (stump, rug: the landing differs from the target) and **4b** (crackle,
pool, ripple, lantern: new state, key packing, parity).

**Player copy** (Q4, Decided 29). There is no tutorial text: the art is the explanation. A
twist is never named on screen. Each new cell kind carries one **aria label** (the `.hc`
cell gets `role="img"` and the label; the plain cell kinds keep no label, as today), drafted
here for the first mate to approve; **a worker uses these and invents none** (Decided 24's
rule: a line the plan does not quote is not here):

| cell | aria label (draft) |
|---|---|
| stump | `stump hole, leads to its twin` |
| rug | `rug, slides you one more` |
| crackle pad, whole | `crackle pad, holds two visits` |
| crackle pad, half-sunk | `crackle pad, cracked, one visit left` |
| tide pool, stone on the next move | `tide pool, a stone on the next move` |
| tide pool, water on the next move | `tide pool, water on the next move` |
| ripple pad | `ripple pad, sinks the pads to its right` |
| dark cell, unlit | `dark cell, lit by the lantern` |
| lantern | `lantern, step here to light the dark cells` |

A lit dark cell has the plain pad's look and no label. The **keys' labels** keep
`HOP_COPY.blocked` and `.sunk` (no new key copy): a key onto a twist cell says "sunk" when the
cell is a pad that has sunk (`.`, `f`, `P`, a ripple `r`, a crackle `c` fully sunk, the
lantern `*`, a lit dark cell) and "blocked" otherwise (water, wall, a pool in its water phase,
an unlit dark cell). `card-board.js` tests `".fP".includes(cell)` today; ship 4b widens that
to the pad class of the board's glyphs.

**Motion** (P17). A stump jump and a rug slide are `translate` transitions on `.hpiece`
(`_hopPlace`), not `.pet.<cls>` animations, so `tests/js/motion_rule.test.js` is not touched
and `calm()` already switches the transition off. A crackle crack or a pool flip drawn
with a new `@keyframes` on `.hc` is a new one-shot: it is not an infinite loop and it
honours the OS reduced-motion rule at the top of `style.js` (a plain class swap with no
animation needs neither).

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

**Deterministic.** `hop_board(pet_id, day, world, family, specials, w, h, n=0)` seeds
`random.Random(f"hop|{GEN_VERSION}|{pet_id}|{day}|{world}|{family}|{specials}|{w}x{h}|{n}")`
(`n` is ship 5's practice board number, reserved now so ship 5 needs no `GEN_VERSION` bump;
0 is the day's board)
(a str seed; CPython derives it with a hash that is stable across runs and Python
versions, unlike `hash()`). It draws **only from `random()`**, the one stream the stdlib
documents as stable across versions: a pick is `seq[int(rng.random() * len(seq))]` and a
shuffle is a sort on drawn keys; `choice`, `shuffle` and `randrange` are not used. It sorts
every collection before it picks from it, so dictionary or set order can't change a board.
The pinned golden boards (ship 1) would catch a drift in CI anyway. The server builds the
board once per cache key (the coordinator is the pet; the key is `(day, world, family,
specials, w, h)`, Decided 13; 2a, `async_hop_day_board`) and serves it, so two screens of one pet get the same board
because the card never generates one (the JS engine has no generator). `pet_id` is the
config entry id (`coordinator.pet_id`), `day` is `_today(now)[0]` (the local date).

**Version guard.** A change to the generator bumps `GEN_VERSION`, and the **board id**
goes to the card with the board and back with the settle. The id is `board_id()`: the first
10 hex of sha256 over (`GEN_VERSION`, pet id, day, world, w, h, grid, family, specials, n)
(FM, Decided 11; the world was added after the s2773 audit). It binds the pet, the day and
the world, not only the grid, so a fallback board shared by two pets, two days or two worlds
still has two ids, and a list for another pet or day answers
`board_changed`. It is a hash, so the entry id never leaves the server. A mid-day upgrade that changes today's board makes the settle answer
`board_changed` and the card loads the new board and drops its parked moves. This happens
at most once per release per pet.

**Candidates and checks.** The generator draws a candidate, solves it, and accepts it only
if it passes the checks below. A candidate (draft numbers, tunable, FM Decided 10; ship 1's
values):

| | baby | child | teen | adult |
|---|---|---|---|---|
| finds | 1 | 2 | 2-3 | 3 |
| walls + water (share of cells, at least 1) | 1 cell | 10-20% | 15-25% | 15-25% |
| stones (never two touching) | 1 | 1-2 | 1-2 | 1-2 |

The start is a bottom corner, the nest a top-row cell on the far half. Swim boards always
carry water and dig/climb boards a wall (their first obstacle), then 3 in 4 of the rest are
the family's terrain; other families draw walls and water evenly. More obstacles at teen and
adult keep the solve small (fewer open pads, fewer lines; review P2). The checks, cheapest
first (`check()`): no touching stones; every pad, find and the nest reachable on the static
board (a tidy list must visit every pad); the casual bot (checks 3, 4); then the full count:

1. **Solvable:** at least one winning move list exists (`win_count >= 1`).
2. **Tidy exists:** at least one tidy list, and not a flood: `1 <= tidy_count <= 40, 80,
   160, 320` for 0, 1, 2, 3 specials (`TIDY_MAX`: tidy lists grow with the specials, review
   P10).
3. **The trap:** the **shortest** winning list is not tidy (the shortest tidy list is at
   least `TRAP_MARGIN` = 1 move longer than the shortest win), and neither is the
   (deterministic) casual bot's list (below). This is the scout's "has a trap" filter, and it
   is what makes tidy hard.
4. **Win is easy:** the deterministic casual bot wins it.
5. **Specials matter:** with specials > 0, every tidy list spends at least one use (a solve
   with 0 uses has no tidy list), and on a child's boards a win needs one at least half the
   time: a seeded coin per candidate (`rng.random() < 0.5`) decides, and when it says so the
   solve with 0 uses must have no win (review P5).
6. **Size of search:** the solve stays under `R.HOP_STATE_CAP` = 100,000 states or the
   candidate is thrown away (FM, Decided 9).

It tries up to `R.HOP_CANDIDATES` = 60 candidates and falls back to the **fallback board**
for its (family, specials, size) in `hop.py` if none is accepted, so a day never has no
puzzle. The 37 fallbacks (the baby's 4×3 shared, 6 families × 6 sizes) are not hand-drawn:
each is the first candidate from the seed `fallback|{key}|{specials}|{w}x{h}` (`key` is the
family, or `base` for the baby's shared board) that passed
every check (a child's with its win needing the use) and that the noisy bot won 20 times in
20, then pinned in `hop.py`, so a generator change does not move them and a fallback is
instant. A test asserts they pass. The fallback share must stay at or under 10% per (family,
stage); ship 1 measured it (section "Measured"). **The fallbacks stay twist-free and shared**
(Decided 30): `fallback_grid` keys on `(family|"base", specials, w, h)` and ship 4 does not
touch it, so **a fallback day has no twist** (the board's `twist` is `null`, and every
screen plays the same plain board). Ship 4 therefore asserts the share per **(world, family,
stage)** over the 21 real pairs (below), at most 10%, and with `PER_CELL = 5` that means
none may fall back in the default suite.

**The solver:** `solve(board, state=None)`, a memoised depth-first search over (position,
sunk set, uses left; ship 4b adds the twist's state on the boards that have the twist only:
the move count's parity (pools) and a crackle pad's half-sunk set, section 2c "The state"; the
lantern flag is derived) from any state, not only the start (ship 5's hint solves from
where the pet is). The memo key is packed by hand in two places (`rec` and the replay in
`walk`); the 4b widening changes both together, and a test asserts `walk` finds the memo
entry for every step (it already asserts "broken memo"). It counts winning and tidy lists, finds the shortest of each, and returns
one of each. It drops a state from which a find or the nest is cut off on the static board
(a relaxed reach: sinking aside, a use never spent), which leaves the counts exact and about
halves the states. It raises past the state cap, and on a state met twice on one line (a
loop; section 2). The same solver serves `hint` (ship 5) and `scripts/hop_solve.py`.
**Where the landing is not the target** (ship 4a; Decided 33): the solver, the bots and
`reach` read the move's **landing**, never its named cell. In `hop.py` that is `State(t,
..., t == self.nest)` in `step`, the solver's `if t == nest: win += 1` shortcut and its `walk`
twin, the bots' BFS `_plan` (nest and finds as goals by target) and `_greedy`, and the
cell-based `reach()`; in `hop-engine.js` it is `done: cells[t] === "N"` in `apply`. Each of
those asks the rules for the move's landing instead. The bots' planner replays every step of
a planned path with `rules.step`, and `_greedy` treats a `None` from `step` as a **failed
plan** (it returns the moves so far; today's `path = []; continue` re-plans the same illegal
path forever, which the BFS can only produce once the landing differs from the target, so a
test forces it).

**Two bots stand in for players, and bracket the difficulty:**
- **Casual bot:** goes to the nearest find not yet in by a shortest walk **on the live
  board** (sunk pads are gone), then the next, then the nest (passing over another find picks
  it up). Ties: the goal first in reading order; along the walk, ◀ ▲ ▼ ▶. It uses a special
  only when no walk exists (then the fewest specials, then the shortest). At a dead end it
  undoes 1, then 2, then 3 moves, and from each, bans the move it made there (its second
  choice) and plays on greedily with no further undo; the first that wins stands, else it
  loses. This is "a player who doesn't think about tidy".
- **Noisy casual bot** (statistics only): the same, seeded, with random ties among equal
  goals and equal walks, and a shuffled find order it tries first.
- **Careful bot:** a depth-first search that tries plain moves before specials, then the cell
  with the fewest ways on, and drops a line that cuts off a pad, a find or the nest; after a
  budget of 300 moves tried it plays the casual bot's list. This is "a player who thinks, and
  has patience for several undos".

**What "win easy, tidy hard" means as numbers.** Checks 3 and 4 are **per-candidate
filters** and use the deterministic casual bot, so over accepted boards it wins 100% and is
tidy on 0% by construction; asserting 90% / 20% of those would be vacuous. The statistics
use the **noisy casual bot** the filter never sees, so it can differ from the deterministic
one. Asserted over seeded boards per (family, stage) (the twist adds "per world" in ship 4):
the noisy casual bot wins at least 90% of accepted boards and is tidy on at most 20%. The
careful bot's tidy rate is **reported, not asserted** (review P9): its node budget sets it
more than the boards do. The draft aim was 40-70%; ship 1 measured it (section "Measured"). The knobs that move the careful bracket are the trap's strictness
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
board is open (the keys sit in the overlay then; section 1). Its label is draft ("Hop of the Day")
and it carries the state:

| state | row says (draft) | press does |
|---|---|---|
| open | "Hop of the Day" | opens today's board, or resumes the parked moves |
| solved, not tidy | "Hop ✓" | opens the solved view with "try for tidy" |
| tidy | "Hop ✓ tidy" | opens the solved view with "back tomorrow" |

**How it fits.** `_fitPicker` (`src/card/card-games.js`) measures only the `.gpick`
buttons against the close button, the prompt and the screen's foot, and drops to `wrap`,
then `tight`, to fit. A row outside `.gpick` would not be measured and could overlap. So:
the row is measured first and takes a strip at the foot (`bottom: 2%`, one button high,
full width of the picker); the picker's available height is the box minus that strip, and
`_fitPicker` runs the same `wrap`/`tight` search against the reduced height. The row has its
own last step: if the picker still doesn't clear at `tight`, the row shrinks to its label
only, never to nothing. Ship 2b adds a bench shot of the picker plus the row at 300, 330 and
420 and a card-check that no game button or the row overlaps the close button or the
prompt at each width. Existing checks that count `.gpick button` as 3
(`grep -n 'gpick button' scripts/card-check.js`: the two that assert a count of 3) stay valid
because the row is not inside `.gpick`.

**Where the row learns its state.** The card does not call `board` on every Play press: that
call writes the save at a day rollover (section 8) and runs the generator in the executor.
(As built in 2a, `board` writes nothing; the write at a rollover is 3a's, section 8.)
Instead ship 3a **publishes `hop_day` as an attribute** next to `games` on the **life-stage
sensor** (as built in 3a, `LifeStageSensor`, in its unrecorded set; not the mood sensor):
`{day, stage, done, tidy}`, nothing personal (the stage is not personal). The card treats a
`day` other than today as "open". The attribute is absent on a pet that never asked for a
board, and the row reads "open" then. The `board` call is made only when the row is pressed.

**What does not change.** Left or Right stays in the server (`GAMES`, `play_game`, the
service's `vol.In(list(GAMES))`, old saves and automations) and in the card (`GAMES` in
`prefs.js`, `GAME_LEAN`, `gameDayList`, the `kind === "left_right"` branch and game-of-the-day
pick in `card-games.js`, `lines-fresh.js:162`, `people.py:67`, `ANSWERS["game"]`,
`LAST_GAME_KEY`). Hop is not a picker game, so none of those is touched, the game of the day
never picks it, and the F6 "which game" question does not list it. A row outside the picker
is reached from the same Play press, so a daily puzzle is one tap from the pet.

The row and the board sit behind a card config flag, `experimental_hop`, until ship 3b
settles and pays, then 3b removes the flag. **It is a YAML-only key** (Decided 14): read in
`setConfig` (`card-base.js`), no field in the visual editor (`editor.js`), no
`getStubConfig` entry, so it is off by default. There is no `experimental_*` key in the card
today (Catch's is gone), so 2b adds the first. With the flag off the Hop row does not exist,
so every existing card-check count stays valid. 2b's card-check runs with and without it.

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
  undo a long path the player restarts. The parked list is cleared when the settle answers `ok` (kept for a
  refused one, which re-sends on reopen: ship 3b) and a restart starts from empty.
- **Server side, per settle** (a pure function of the replay and the `hop_day` map):
  first settle of the day, plain or tidy: pays the 23 (`done` set). A tidy settle also pays
  the find if `tidy` is not set (and sets it, whatever the find's outcome: Decided 20). A plain
  settle after `done`: `ok` with `already: true`, pays nothing. A tidy settle after a plain
  win: pays the find and no second 23. A settle after `tidy`: `already: true`. Nothing to
  undo ever costs anything.
- Once the day is tidy the solved view has no restart ("back tomorrow"); free practice
  boards (ship 5) are the only thing left to play, unpaid.
- A reload on the same day shows the solved view without a path (the card keeps no list
  after a settle and the server never stored one); "try for tidy" is offered unless tidy is
  set, read from the published `hop_day`.
- **Midnight and bedtime.** A board is for one day and one id. A settle on yesterday's day
  (`hop_day` empty, or its `day` behind today) answers `board_changed` and writes nothing
  (Decided 18); the card loads today's board, dropping the parked moves; a board played
  across midnight is lost. A day that goes *backwards* (a timezone change, a clock set
  back, a restored save) is the same day, not a new one (Decided 19). A settle refused with `asleep` leaves the moves in
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
| `board` | | `{result: "ok", day, id, w, h, grid (rows), family, specials, world, twist, done, tidy}`; a refusal is `{result: "<code>"}`. As built in 2a: `twist` is `null` (ship 4 fills it), `done` and `tidy` are `false` (3a fills them from `hop_day`) |
| `settle` | `id`, `moves` (a string, one letter per move: the **stepped-on** cell's index in reading order, `a`-`x`), `shared` | one reply table, below |
| `hint` | `id`, `moves` so far | ship 5: `{result, next}` the next cell of some **winning** list from there (not a tidy one: that would make tidy free) |

**The `settle` reply, one table (review s2855 P5).** `result` is one of `ok`, `illegal` (with
`bad_index`, the index of the first bad move), `board_changed`, `too_long`, `not_won` (the
list is legal but does not end in the nest: a buggy or forged caller; pays nothing, writes
nothing), and the refusals `egg`, `asleep`, `away` (never `too_tired`: Decided 17). On `ok`
the fields are: `won` (always `true`), `tidy` (this list was tidy), `paid` (the 23 was paid
by this settle), `found` (a find was picked and added by this settle, to the basket or,
when the basket was full, straight to the collection; `false` if none was picked or the
tidy find was already paid), and `already` (`true` when this settle paid nothing at all:
no 23 and no find). `already` is a boolean beside `result: "ok"`, never a `result` code;
ship 3b reads `tidy`, not `already`, for the day's tidy (Decided 21, D2). The reply always carries all four booleans on `ok`.

Targets, not move kinds: the server derives the move from where the pet was to the stepped-on
cell (the pet has one family, so a two-cell straight move is unambiguous), and applies the
board's rules (a rug's slide, a stump's twin, so the landing cell) itself (ship 4a). `moves` is capped
at 200 letters.
**`settle`:** `shared`, privacy and the person work as in `play_game`: a shared screen's call
is the household's; the private-pet `away` answer is rewritten to `asleep`. **`board` takes no
`shared` and no person** (as built in 2a: the board is the pet's, the same for every caller,
and nothing is read from or written to a person; the only privacy rule is the `away` →
`asleep` rewrite). So `shared` is a field of `settle` alone: 3a adds it to the schema for
that action (optional, ignored by `board`), not 2a. **The refusals differ** (Decided 17):
`board` refuses `egg`, `asleep`, `away` and `too_tired`; `settle` refuses only `egg`, `away`
and `asleep`. `too_tired` is `board`-only because a board is served while the pet can play,
and a 16-40 move board takes minutes, in which energy can fall under
`PLAY_MIN_ENERGY`: a won board must not be lost to tiredness. The pay costs `PLAY_ENERGY`,
and `_clamp` holds energy at 0. The settle's refusals go through `model._refuse_play` with
`too_tired` ignored (the build may split the helper, or test `energy` out of its result);
`board` is unchanged. A refusal at `settle`
leaves the moves in the card's parked list so the player can retry. `board` refuses
**without writing the care log** (`start_game` logs every refusal and fires a `care` event;
a row opened on a tired pet would fill the capped log; 2a calls `model._refuse_play(state)`
directly, after `_advance(now)`, and no `start_game`, `_fire`, `_save` or `_publish`); `settle` writes one care entry on a
paid settle, like a finished game, and none on a refusal.

**The stage and the day for the replay (Decided 18, 19).** `settle` carries only `id` and
`moves`, so the board it rebuilds comes from `hop_day`, never from the live stage. Before it
builds anything it reads `hop_day`: if the map is empty (never pinned, or a damaged load
dropped it mid-day) or its `day` is behind today (`today > hop_day["day"]`, the card was
open across midnight and nobody called `board`), it answers `board_changed` and does not
build, write or save; the card then calls `board`, which pins today's stage. Otherwise it
builds from `hop_day["stage"]` for `hop_day["day"]` (a stored day *ahead* of today, after a
clock set back, is still that day) and compares the board's id with the request's; a
mismatch answers `board_changed` and writes nothing. **`board` is the only writer of
`hop_day` apart from the pay block** (section 8).

**No race on the pay.** `async_play_game` awaits `_who` and `_person` and then mutates
synchronously (`coordinator.py:3160-3205`). The settle does the same: everything that
awaits (the board rebuild, which runs the generator in the executor if it is not cached,
and the replay) comes first (the rebuild is `PetCoordinator.async_hop_day_board(day, family,
specials, w, h)`, built in 2a: settle calls it so it replays the board the screen was shown,
and concurrent callers share one build); then, in one synchronous block with no `await`, it
**re-checks everything the awaits could have changed, with a fresh `now`** (review s2855
P4: the rebuild can take 0.87 s and a pet can fall asleep, or the local day can turn,
in that time): `_advance(now)`, the settle's refusals (`egg`, `away`, `asleep`), and that
`hop_day` is still the entry the board was built for (same `day` and `stage`, and its `day`
not behind `self._today(now)[0]`); on any miss it answers the refusal or `board_changed`
and writes nothing. Then it decides paid / `already` and writes. Two screens settling at
once both finish the awaited part, and only the first through the block pays. Pytests:
two concurrent settles (`asyncio.gather`) pay once; a settle whose rebuild is slow
(monkeypatch `hop_board` to wait on an event) while another screen's `board` rolls the day
answers `board_changed` and writes no `done`; one where the pet falls asleep meanwhile
answers `asleep`.

**The cheat surface, honestly.**
- **A forged "won" is impossible:** the server decides. A forged *move list* only works if
  it is a legal winning list on that day's board, which is a solved puzzle. The solver
  being public (or a friend's list pasted in) gives a free solve, not an exploit: the pay
  is one 23 and one find a day.
- **Replay a day's list to be paid again:** `hop_day.day`, `.done` and `.tidy` make the
  second `settle` answer `ok` with `already: true` and pay nothing. A tidy settle after a
  plain win pays the find once and no second 23.
- **A day that comes back (accepted, one case closed):** the rollover is `today >` the
  stored day, so a timezone change westward or a clock set back does not reset `done` and
  `tidy` for a date already paid (Decided 19). Still accepted, because they need no normal
  play: a damaged load that drops `hop_day` mid-day, or a save restored from an earlier
  backup, can pay a day twice. The cost is one 23 and one find.
- **A list for another pet or day:** the board id binds (pet, day, generator, family,
  specials); a mismatch answers `board_changed`/`illegal`.
- **Cost of a bad request:** capped at 200 moves, a replay is O(moves); no search runs on
  `settle`. `board` generates at most once per cache key `(day, world, family, specials, w, h)` (the
  coordinator is the pet; today's keys only; in memory, rebuildable; one shared in-flight
  build, Decided 13); it runs in the executor, never on the event loop. `hint` (ship 5) runs a search, so it
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
  out of `_finish_game` rather than building a fake `Game`. **The shared tail, all of it
  (review s2855 P9):** `PLAYER_WIN_HAPPINESS * _scale(state, "player")` added to the
  happiness, `_meets_need(state, "play")` then `last_care_at`, happiness (clamped),
  `PLAY_ENERGY`, `PLAY_HUNGER` and `WEIGHT_GAME` (each `_clamp`ed: **energy stops at 0**,
  Decided 17), `last_excite`, the `_log` entry, the `care` event, and
  `_resolve_call(state, now, events, state.happiness > happiness_before)`. Skipping the
  last leaves a happiness call open after a 23-point win. Only what is bound to a `Game`
  stays out: the `games[kind]` counting (Hop counts days, section 8), `_game_score`, and
  the event's `wins`. The log entry is `{"at", "action": "game", "by", "result": "won",
  "score": "tidy" or "win", "game": "hop"}`; one grep of the card for a renderer keyed on
  the log's `game` kind found none (`card-journal.js` only reads the `games` counts), and
  the build repeats it before writing. `game_finished` is what grants the play wish and the
  `dream_seed` (`coordinator.py:1505-1509`), so the event is fired through `_fire` like a
  finished game's.
- **No loss:** an unsolved board, a ✕, a restart or a refusal costs and earns nothing and
  logs nothing. (Which refusals `settle` has is section 6: not `too_tired`, so a won
  board is never lost to tiredness; Decided 17.) There is no 12-happiness loss branch, because nothing can be lost. (This
  differs from the dig, where a 3-minute idle drop is a loss.)
- **Tidy:** the day's first tidy settle also pays **one find** from the pet's world, picked
  and added exactly as `roll_find` does it (`can_find`, `pick_find` with the
  coordinator's flags and the `known` map, `add_find`, a `found` event) but **outside the
  find clock**: `next_find_at` is not touched, so a tidy never delays or doubles the
  clock. A full basket sends the find to the collection unseen, as `add_find` already does.
  A tidy that comes after an earlier plain win the same day pays the find and no second 23.
  **What the find pay does around the edges (review s2855 P1, P8; Decided 20):**
  - **`_find_flags` is `None`** until the house has been read once (`coordinator.py:278`,
    set at `:927`; `_roll_find` guards it at `:1340`), and `find_weight` calls
    `flags.get(...)`, which raises on `None`. The tidy pay passes **`{}`** when the flags are
    `None` (every `when` token missing: the rare fallback weight, a bias only) and never
    raises, and it never defers. All of `settle`'s writes happen after this call or are
    safe if it fails, so nothing is left half-written.
  - **`tidy` is set on the first tidy settle, whatever the find's outcome.** The find is
    attempted once. `pick_find` returns `None` when the pool is empty; `add_find` returns
    `False` when the basket is full and the find goes to the collection. Either way `tidy`
    is set, so the card stops offering "try for tidy" and the restart key cannot become a
    loop. The reply's `found` is `true` when a find was picked (basket or collection) and
    `false` when none was.
  - **A `found` event (the card's moment, `coordinator.py:169`) fires only when the find went
    into the basket**, as `roll_find`'s does; a full-basket find fires none.
- **Events and bond:** the settle emits `game_finished` with `game: "hop"`, `won: true`,
  and a `tidy` bool. It is a **separate coordinator method**, not `async_play_game`'s
  loop: that loop calls `game_record(... event["wins"])` unconditionally
  (`coordinator.py:2856-2866`), which a hop event has no `wins` for. The new method gives
  the bond (`BOND_GAME_POINTS`, 2) to the person who settled and bumps the counts.
  `game_record` is **not** used (decided: its "beat your best" line has no meaning for a
  one-a-day board), and nor is `favourite_game`: `add_bond` picks a favourite from `GAMES`
  (`model.py:3442-3444`) and Hop is not in it, so Hop can never be a favourite; fine for a
  first build. `games_played` (`model.py:1657`) counts Hop, one a day (not one per settle), toward the
  15-game "player" trait (`rates.py:272`); accepted. `add_bond` records `bond["games"]["hop"]`
  (a free key) and `known` is built from `GAMES`, so Hop is never a favourite.
- Constants: `R.HOP_WIN_HAPPINESS`, `R.HOP_MAX_MOVES = 200`, `R.HOP_FALLBACK_TRIES = 200`,
  `R.HOP_HINTS_PER_MIN` (ship 5) in `rates.py` (the games block), none in the card.
- The find pay uses the call site `_roll_find` already has (`coordinator.py:1299-1316`):
  `pick_find` and `add_find` take `self.world`, `self.finds`, `self._find_flags`,
  `self.known_finds`, `self.rng` (with `{}` for the flags while they are `None`, above). `roll_find` sets
  `next_find_at` itself (`model.py:3051`), so calling `pick_find` and `add_find` directly leaves the clock
  alone, as claimed. `can_find`'s asleep rule is moot: a settle refuses asleep (and the pay block re-checks it
  after the awaits, section 6).

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
- **Ship 3a changes `board`** (in 2a it writes nothing and reads the stage live). A `board`
  call that passes the refusals and finds `hop_day` empty, or its `day` **behind** today
  (`today > hop_day["day"]`; ISO date strings compare), overwrites the map with
  `{"day": today, "stage": stage_now, "done": False, "tidy": False}` (Decided 19). A day
  that goes backwards (`today < hop_day["day"]`: a timezone change west, a clock set back, a
  restore) is the same day: the map stays, and `board` serves that stored day's board
  (reply `day` is the stored day). A stale `day` is read as empty and rewritten on the
  next `board` call (no sweep needed). **`board` is the only writer of `hop_day` apart
  from the pay block** (Decided 18): `settle` never pins or rolls it. A refused `board`
  (`egg`, `asleep`, `away`, `too_tired`) is checked first and still writes nothing.
  **The rollover write is followed by `_save()` and `_publish()`** (review P7): `_save`
  is a delayed write (`async_delay_save`), so without it a restart loses the pin and the
  next `board` could pin a different stage, a new id; `_publish` moves the sensor attribute
  (3b reads it). Tests: after one rolling `board` call the sensor attribute and `to_dict()`
  carry the new day and `async_delay_save` was called; a second same-day `board` writes
  nothing (no `async_delay_save`, no publish); a `board` with `today < stored day` writes
  nothing and keeps `done`/`tidy`; `today > stored` rolls and resets them.
- **Counts:** `games["hop"]` joins the existing map as `{"played": days won, "won": days
  won, "tidy": days tidy}`. `from_dict` whitelists the keys
  (`model.py:790`, `("played", "won", "dropped")`), so `"tidy"` is added to that tuple.
  The transitions (review P10): the day's first settle, plain or tidy, is `played` +1 and
  `won` +1 (a tidy one also `tidy` +1); a tidy settle after a plain win is `tidy` +1 only;
  a plain settle after `done` and any settle after `tidy` change nothing. So
  `games_played` rises by 1 a day, not per settle. `lay_egg` copies `game_counts(state)`
  raw into the journal record (`model.py:2058`) and `_retired` keeps any dict, so `tidy`
  rides into the journal without a whitelist: harmless.
  There is **no streak** (decided): counts only go up, so a missed day costs
  nothing, per the experience plan's "never guilt, nagging, ranking people or anxious
  timers".
- **Migration:** none beyond defaults. An old save has no `hop_day`, so it loads as `{}`; an
  old `games` has no `hop` entry. `from_dict` validates `hop_day`: `day` an ISO date string,
  `stage` one of `LIFE_STAGES`, `done` and `tidy` bools; anything else drops the whole map.
  `shift_times` has nothing to shift (a date, no times). A retire or a new egg clears it
  by construction: `lay_egg` builds `PetState.new(...)` and copies only named fields, so
  `hop_day` is `{}` (test: after `lay_egg`, `hop_day == {}`). One subtlety: `lay_egg` copies
  `state.unknown` to the egg (`model.py:2073`), so a `hop_day` that an older version kept
  as an unknown key would follow the egg; it is a stale day and reads as empty at the
  next `board`. **Downgrade:** an older version keeps `hop_day` as an unknown top-level key
  and re-emits it (`from_dict` keeps unknown keys, `model.py:684, 834`; `to_dict` `:668`;
  the dig's `parked` relied on it), covered by the general unknown-key test, so no new test
  claims it. What a downgrade does lose is `games.hop.tidy`: the older whitelist drops it
  (accepted). `test_damaged.py`'s parametrised table (`:111-130`) gets `hop_day` rows
  (wrong type, a bad date, an unknown stage, `done` not a bool).
- `SAVE`/`diagnostics`: the day's board is **not** stored (it is rebuilt), and the move list
  is never stored, so nothing about how a person played is saved. `diagnostics.py:99` dumps
  `pet.to_dict()`, so `hop_day` (day, stage, done, tidy: nothing personal) appears in the
  `pet` block on its own. There is no diagnostics snapshot test to update (checked: none
  snapshots the `pet` block); 3a's test asserts `hop_day` is in the `pet` block and is not
  redacted (it is not in `REDACT_STATE`, `diagnostics.py:85`, and should not be).
- **Published:** `hop_day` is an attribute on the **life-stage sensor** (`LifeStageSensor`,
  `sensor.py:141`) beside `games` (`:315`), and is added to **that** class's
  `_unrecorded_attributes` (`:148-160`, where `games` is), so the recorder does not keep it
  (the mood sensor, `MoodSensor` at `:101`, has a different set and is not the place; the
  card reads `games` from the stage sensor, `card-journal.js:132`, and will read
  `hop_day` there). `DebugSensor` also publishes `games` (`:398`) and does not get
  `hop_day`: nothing reads it there. A private pet publishes it as it publishes `games`.
  `tests/test_recorded.py` asserts `hop_day` is not recorded.

## 9. Slices

Five numbered ships, eight builds: ship 2 splits into 2a (server, `board`) and 2b (card),
ship 3 into 3a (server, settle and save) and 3b (card), and ship 4 into 4a (stump, rug) and
4b (crackle, pool, ripple, lantern). The review found ship 2 added
server code under a "card, tier 1" label and ship 3 was too big; ship 4's review (s2860)
found it was L, not M. Gates follow `AGENTS.md`:
ships run `scripts/gate --auto`; the first mate gates the merged batch once. A build that
adds server code (1 is Python and JS, 2a, 3a, 5) makes `pick-sections` choose `all`, so it
uses `scripts/ci-gate`. 3a is tier 2; 4a and 4b are tier 1 (no saved field).

### Ship 1: the Hop engine, generator and solver (Python and JS, tier 1, L)

`hop.py` (rules, six families, stage table, `FAMILY_OF`, generator, solver, bots, fallback
boards) and **its twin `hop-engine.js`**, with `tests/js/hop_engine.test.js`; `rates.py`
constants (`HOP_MAX_MOVES` = 200, `HOP_CANDIDATES`, `HOP_STATE_CAP`; `HOP_WIN_HAPPINESS` is
3a's); the shared fixture file (`tests/fixtures/`, new); `scripts/hop_solve.py` (below); no
service, no card UI, no save field.

The API later ships call (review P7), so they need not extend the engine after the fixtures
are pinned:
- `hop.py`: `params_for(stage, day) -> (specials, w, h)`, `family_of(species)`,
  `hop_board(pet_id, day, world, family, specials, w, h, n=0)` (blocking: 2a runs it in the
  executor, never on the loop), `board_id(...)`, `replay(board, moves) -> {legal, bad_index,
  won, tidy, final, too_long}` (3a; its `final` is the plain form, `State.from_dict` turns it
  back into a state), `solve(board, state=None)` (ship 5's hint), `encode` /
  `decode`, `legal_targets`, `apply_move`, `Board.from_dict` / `to_dict`.
- `hop-engine.js`: one `const HATCH_HOP = Object.freeze({...})` (review P12: the card is a
  classic script, so every top-level name is a page global shared with other cards; a
  duplicate `const` would kill the card), in `manifest.txt` right after `world.js`, before
  the class chain; no `this`, no DOM. It holds `start`, `legalTargets(board, state)` (2b's
  lit cells, key `aria-disabled` and preview), `apply`, `replay`, `isTidy`, `encode`,
  `decode`, `view`, `fromView` (a view back to a state), `valid` (a reply is a board the rules
  can play: `Board`'s checks); undo is a replay of the list without its last move. It ships in the
  built card from ship 1 (a few KB, unused until 2b).
- `hop.py` imports `rates` (`from . import rates as R`), so a script that uses it runs with
  the dev venv, as `scripts/balance_sim.py` does (review P11: importing the package runs its
  `__init__`, which imports Home Assistant). The JS
engine is here, not in 2b, so the shared fixtures are checked by both engines from the
start: a rule ambiguity found while writing the JS then forces a rule change *before*
anything has merged, not a `GEN_VERSION` bump and a golden regeneration after. It changes no
player-visible behaviour (it is dead code in the card until 2b).

Acceptance (pytest, `tests/test_hop.py`; `node --test`, `tests/js/hop_engine.test.js`):
- Rules: every case in `tests/fixtures/hop_cases.json` passes **both** engines (at least:
  one legal and one illegal case per family, a pad sinking, a stone crossed twice, the nest
  closed until the finds are in, the pad left by the move into the nest sinking, a letter
  after the nest, an empty list, an off-board letter, 201 letters, a squeeze onto a sunk find
  pad and the sunk start; and each case's prefixes give the same state as a step-by-step
  apply, which is what undo is). The scout's sample's 20/3 counts at 1 hop (and 12/16 moves)
  are a pytest, since the JS engine has no solver.
- `FAMILY_OF` covers every ready species (read from `species.py`'s catalog or
  `frontend/sprites/*/species.json`, not a copy), names no species outside `worlds.json`'s
  rosters, every family has at least one ready species (climb has four ready, five with the
  beetle), and an unknown species gets the default family instead of raising.
- Determinism: the same inputs give the same board twice and in a fresh process; one input
  changed gives a different board; a golden set of 12 boards is pinned so an accidental
  generator change shows (an intentional one bumps `GEN_VERSION` and regenerates the file).
- Checks 1-6 of section 4 hold for seeded boards per (family, stage): **5 per cell in the
  default suite** (24 cells, 120 generations; FM Decided 9) and **1,000 per cell with
  `HOP_FULL=1`** (24,000 generations, run once for the ship's report, which prints the table;
  an env var, not a pytest marker: the repo has none). The bots' ranges are asserted over
  every cell's boards by default and per cell under `HOP_FULL=1`. The tests assert **state
  counts** (the solver's visited states stay under the cap), not wall-clock time, which
  flakes on CI shards. Fallback boards pass checks 1-4. There are no twists yet, so "per
  world" is not a ship 1 dimension; it joins in ship 4.
- The ship's report gives the measured acceptance rate and fallback share per family and
  stage, with 4×3 (baby, every day) called out, the noisy- and careful-bot rates and the
  `hop_board` timing, so ships 4-5 and the owner's tuning start from numbers.
- The golden boards are `tests/fixtures/hop_golden.json`; `HOP_GOLDEN_WRITE=1` rewrites them
  after an intended change (with the `GEN_VERSION` bump).
- `scripts/hop_solve.py` reads a `board` reply (JSON on stdin) and prints a winning move
  list and a tidy one, using the same solver. Ship 3a's real-HA round trip uses it: the
  live board depends on the dev pet's entry id and today's date, so no fixture list can
  match it.
- **Ship 1 audit (s2773): player-impact 0, nits 6, all fixed in
  `crew/hatch-at-home-s2774-hop-ship-1-audit-fixes-6-nits`.** N1 `decode` counts code points
  in JS as in Python (fixture cases with emoji); N2 `params_for` raises `ValueError` for an
  egg or unknown stage; N3 `board_id` hashes the world, `GEN_VERSION` 2, goldens rewritten
  (Decided 11); N4 `State.from_dict` and `HATCH_HOP.fromView` rebuild a state from a view;
  N5 the fallback seed text above; N6 `Board` checks `specials` is 0-3, `HATCH_HOP.valid`
  mirrors the `Board` checks, and the fixture's `bad_boards` pin both.

### Ship 2a: the `board` service (server, tier 1, S-M) — SHIPPED (s2779, `73564bfb`)

Built on 2026-11-03 on branch `crew/hatch-at-home-s2779-hop-of-the-day-ship-2a-the-boa`
(7 files, +411; `scripts/test` green before the merge; the first mate gates the batch).
What is there, so later ships read the build and not the first draft:
- `virtual_pet.hop` with `action` only `board` (`HOP_SCHEMA`: `entity_id`, `action` as
  `vol.In(["board"])`, so 3a adds a value in one line). **No `shared` and no person:** the board
  is the pet's, the same on every screen. `SupportsResponse.OPTIONAL`, as `play_game`.
  Text in `services.yaml`, `strings.json`, `translations/en.json`; a test makes the three
  agree (it stands in for hassfest, which runs only in CI).
- `PetCoordinator.async_hop_board()`: `_advance(now)`, then `model._refuse_play(state)`
  (`egg`, `asleep`, `away`, `too_tired`; **`too_tired` is refused**, Decided 12), `away`
  rewritten to `asleep` when `self.privacy`. It does **not** call `start_game`, `_who`,
  `_person`, `_fire`, `_save` or `_publish`, so the care log, `state.to_dict()` and the bus
  are unchanged by any call, refused or not. No save field, no sensor attribute, no card
  file; the stage is read live (`model.life_stage`) until 3a.
- **The reply:** `{result: "ok", day, id, w, h, grid, family, specials, world, twist: null,
  done: false, tidy: false}` (`**board.to_dict()` plus `result`, `day` and three constants);
  a refusal is `{result: "<code>"}`. `twist` is ship 4's; `done` and `tidy` are 3a's, so
  until 3a a board already settled today still says `done: false`. **2b must not render the
  row's or the board's solved/tidy states from these two.** It holds no user id and no entry
  id.
- **The cache lives in the coordinator.** `async_hop_day_board(day, family, specials, w, h)`
  builds in the executor (`hass.async_add_executor_job(hop.hop_board, ...)`) and caches in
  `_hop_boards`, keyed `(day, world, family, specials, w, h)` (Decided 13), today's keys
  only (other days' keys are dropped on each call). One in-flight future per key is shared
  and each awaiter shields it, so three simultaneous calls run the generator once; a failed
  build is dropped and the next call retries. **This is the entry 3a's `settle` reuses**
  (section 6) to rebuild the board the screen was shown.
- Left for later, on purpose: 3a fills `done`/`tidy`, pins the stage (section 8) and adds
  `shared`, `id`, `moves` to the schema for `settle`; ship 5 adds `n` to the key and the
  arguments (see ship 5). The "a generator version changes the id" check is ship 1's golden
  test, not a 2a test (`GEN_VERSION` is a module constant). Player-facing docs
  (`docs/features.md`, `docs/guide.md`) are 2b's and 3a's.

Tests (`tests/test_hop_service.py`, 20): the reply keys and a `Board.from_dict` round trip;
same pet and day, same board, and the second call is the cache; a new day, a stage change
(`age_hours`), a world change and a Wednesday (one column narrower) each change the id or
size; each refusal (parametrized) returns its code with the care log, `to_dict()` and
`virtual_pet*` events unchanged and no build; a private pet's `away` is `asleep`; an unknown
species gets the `hop` family; `hop_board` runs off the loop thread (the monkeypatch records
the thread, no timing); three concurrent calls build once (`asyncio.gather`); a failed build
is not cached; only `board` is accepted; the three text files agree.

### Ship 2b: board mode and a playable board (card, tier 1, M)

Built **after** motion ship 2 (landed `9062364a`, Decided 15), so `AGENTS.md`'s "Motion on
the card" rule and `tests/js/motion_rule.test.js` are on main when it starts. Nothing is paid
and nothing is settled. The first job is the picker-plus-row fit at 300 / 330 / 420 (section
5; the plan has not seen it drawn).

`card-board.js` (the class link between `card-games` and `card-season`, repointed), CSS in
`style`, the Hop row (section 5), the keys (in the overlay, below), tap-then-confirm,
park/resume, the Escape handler, all behind `experimental_hop`. Grep the names below; the
line numbers in the review had all moved within a day.

**The board is `s.game`, not a new flag** (review problem 9). `_startGame` for the row sets
`s.game = {kind: "hop", ...}`. Every quit path already tests `s.game`: card removal, slide
reuse (`_forget`), swipe away, Escape, sleep/away/egg, the status sheet, and the power-off
checks. A separate `s.board` would skip all of them, and the park-on-every-move safety does
not restore the overlay. `SERVER_GAMES` is derived from `GAMES` (`prefs.js`) and hop is not
in it, so `_quitGame` sends no `play_game end` and the idle drop skips it. Card-check: quitting
a board makes **no** `play_game` call. `_endGame` also clears whatever the board adds:
listeners, the hop piece, and its timers (through `s.gameTimers`).

**The care scene engine** (`card-care.js`, `s.scene`; `_sceneStart`/`_sceneEnd` in
`card-actions.js`; review problem 10). A scene (feed, medicine, clean, lights) can be alive
when the row is pressed, or be offered late (`_sceneOffer` from `s.sceneOwes`: the server's
answer to a care tap arrives after the tap's own scene ended), and `_sceneEnd` restores
frames and props on top of the grid. So:
- `_startGame` for hop ends a live scene first: `if (s.scene) this._sceneEnd(s, {quiet: true})`.
- `_sceneStart` is not entered while `s.game?.kind === "hop"`; a scene offered late
  (`_sceneOffer`) during a board is held until the board closes or its owe runs out
  (`SCENE_OWE_MS`).
- The pet's frames (`_reactFrames`) share one sprite with the scene engine, so the board's
  `ready`/reaction frames go through the same call `_pickGame` uses.
- Card-check: a feed scene live when the row is pressed leaves no bowl or prop in the LCD;
  a scene offered late during a board waits until the board closes.

**Motion** (`AGENTS.md` "Motion on the card"; review problem 11). The "pet's hop tween" is a
sprite inside the board layer, **not a `.pet` class**: position is `translate` on that
element (a CSS `translate` transition or a Web Animation), and the real `.pet` sprite stays
still and only swaps frames. No `.pet.<cls>` rule with an `animation` is added; if one is
wanted after all, it goes on `tests/js/motion_rule.test.js`'s list with a comment saying
why it cannot be on with another one. `go-left`/`go-right` (translate classes, cleared in
`_endGame`) are not used for the board. A one-shot is not an infinite loop. The move is gated
on `calm()` and the OS reduced-motion rule: card-check with `emulateMedia({reducedMotion:
"reduce"})` asserts a cut (no transition, the piece already on the cell). A flip, if any, is
a `@keyframes`, not a `transition`, and the bench's `petAt` can pause it.

**The flag.** `experimental_hop` is a YAML-only key (Decided 14; section 5): read in
`setConfig`, no editor field, no stub entry. With it off nothing of the board or the row is
built, so existing card-check counts (`.gpick button` as 3) are untouched. Card-check runs
the board section with it on and one check that it is off by default.

**The keys: in the `gameBox` overlay, as the dig does** (owner, 2026-11-03, Decided 16). The
dig and the other games draw their keys in `gameBox` (`.gl`, `.gr`, `.gx`), over the LCD,
swapped by `_gameView`; the care pad (`ACTIONS`, seven keys and the lights key) is a separate
row whose presses go through `_press` (`card-actions.js`). Eight keys in a 2×4 block inside
the overlay (◀ ▲ ▼ ▶, special, undo, restart, and a blank for ship 5's hint), built in
`_gameView` beside the dig's. `_press`, `_toggleLights`, the `wants` pulse and the pad's
`aria-label`s are not touched. The cost: the overlay must hold the grid *and* the keys at
300 px, so 2b's bench shots decide whether the 2×4 block fits under a 6×4 grid or the keys go
beside it.

**Copy** (all draft; review problem 14). The worker reports the working text, as the dig's
did. Drafts to start from: keys `◀ ▲ ▼ ▶` with aria "Step left/up/down/right" (disabled:
"… blocked" / "… sunk"); `special ×n`, aria "Special move, n left"; `undo`, aria "Take back
the last move"; `restart`, aria "Start the board again"; the row "Hop of the Day", aria "Play
Hop of the Day". The refusal lines reuse the existing refusal copy. A `board` reply with an
unknown `family` or a malformed grid (`HATCH_HOP.valid` rejects it) shows nothing and logs
once with `console.warn`. Until 3a, `done`/`tidy` in the reply are not read.

**Bench** (review problem 16): `dev/bench/page.js` has no `view: "board"` (it has settings,
picker, lay, name, journal, everyworld, collection, games). 2b adds the view, a `board` state
field, and `--preset hop`, and the README lists the field. The bench fakes `callService`, so a
board shot takes a **canned reply built from `hop.py` once** (`Board.to_dict`, committed as a
fixture), never a hand-typed grid.

Acceptance:
- **bench:** `view: "board"` shots at 300, 330 and 420 for each family (a board, a lit cell,
  a spent special, a solved view, a tidy view), a "blocked key" shot, each stating the
  measured cell size; the picker with the Hop row at the three widths. `--preset hop` is
  added. (The solved and tidy shots pin the state by the bench field, not by `done`/`tidy`.)
- **card-check** (new section `board`, after `resume`, with stubbed `callService` replies,
  not a random draw): the row sits outside `.gpick` and the picker still counts three
  buttons; no button or the row overlaps the close button or the prompt at 300, 330 and
  420; the keys show and go away with the overlay's view, and the care pad is unchanged; a lit cell then a second tap commits at 300; one tap commits at 420; an
  arrow key commits at once; undo restores a sunk pad and a use; each move is written to
  `localStorage` and ✕, Escape on the card, a swipe to another pet, **a slide reused
  (`_forget`)** and **the pet falling asleep mid-board** all leave the same moves to resume;
  a different board id drops them; quitting makes no `play_game` call; no care action fires
  from a game key; the keys
  carry aria labels; the scene collisions above; reduced motion cuts the move; the flag off
  builds nothing.
- Taps at 300 use Playwright `mouse.click` at the measured centre of the cell, not
  `.click()`. "A swipe to another pet" and "a slide reused" need two pets: if the card-check
  prelude has only one, those two are JS/bench tests that call `_go` and `_forget` directly.
- A `board` reply with an unknown `family` or a malformed grid shows nothing and logs once
  (a card-check stub case).
- The real-HA run owns the wiring only (the row calls `board` and the reply has the right
  shape; `done`/`tidy` are false).

**Built as shipped (s2800, branch `crew/hatch-at-home-s2800-hop-ship-2b-board-mode-keys-in`).**
- `src/card/card-board.js` (`HatchPetCardBoard`, between `HatchPetCardGames` and
  `HatchPetCardSeason`), the Hop CSS in `style.js`, small hooks in `card-games.js`
  (`_startGame` adds the row, `_gameView` has a `hop` view, `_fitPicker` measures the row) and
  `card-flair.js` (`_endGame` calls `_hopEnd`). The board is `s.game = {kind: "hop"}`; no
  `play_game` call is made and no `.pet.<cls>` animation was added.
- **The keys are a 2×4 column at the right of the board**, in the overlay (Decided 16): ◀ ▲ ▼ ▶,
  `✦n` (special), undo, restart, and the close button as the eighth. There is no blank for
  ship 5's hint: ship 5 shares the restart slot or takes the cell the close button leaves. The
  keys are sized from the overlay's height (24-44 px) and the grid takes the rest.
- **Cell sizes are 19 / 22 / 28 px at card widths 300 / 330 / 420 (6×4 board)**, not the
  35-49 px this plan expected: the LCD is 198×148 px at 300 (228×171 at 330, 272×204 at 420) and the keys take a column of
  it. Every adult board is therefore tap-then-confirm; one tap commits only where the drawn
  cell is 44 px or more (the code reads the size it drew, so a wider card gets it).
- The row is a `.ghop` button outside `.gpick` (strip at the foot where the games fit on one
  line, else in the last line of the wrapped games, label-only at 300). The picker's game count
  is still three.
- The fetch is one method, `_hopFetch(id)`, the seam card-check stubs. A refusal answers
  `REFUSALS[result]`; a reply `HATCH_HOP.valid` rejects shows nothing and logs once.
- Park/resume: `hatch-hop|<device>|<day>|<board id>` in `localStorage`, written on every move,
  undo and restart, dropped when the board id changes. A board that was won parks nothing.
- Until 3a the Hop row's label never changes, and the solved view is the bubble ("solved" or
  "tidy") with a restart key reading "try for tidy" (aria) while tidy is not set; `done` and
  `tidy` in the reply are not read.
- Copy: no line beyond the plan's quotes. The visible key labels are glyphs; the quoted words
  are the aria labels. "solved" and "tidy" (the bubble) and "blocked"/"sunk" (aria) are the
  plan's drafts, used as they stand. Open questions are in the s2800 report.
- Proof: `tests/js/hop_board.test.js` (9), card-check section `board` (33 checks, 0 fail,
  `scripts/gate -- --only board`), bench `--preset hop` (102 shots) with `<shot>.json` giving
  each cell and key size and overlap.
- At the card-check width of 300 (a 284 px card, LCD 180×135) the **three games with no Hop row
  already** wrap to two lines that run 6 px below the LCD's foot and touch the close button; the
  row adds nothing to that. That is the picker's and the dig's own fit at the smallest width,
  not 2b's; it is on the device queue.

### Ship 3a: settle, pay, saved state (server, tier 2, M) — BUILT (s2857, `5c0b2ad8`, awaiting owner merge OK)

Built on 2026-11-03 on branch `crew/hatch-at-home-s2857-hop-of-the-day-ship-3a-settle`
(12 files, +1169 -40; one commit on `e3aadcd3`; full pytest 2331 passed, ruff clean; the
first mate gates the batch with `scripts/ci-gate`). Readings and deviations the first mate
accepted are Decided 21. The text below is the plan it was built from; where the build
differs, Decided 21 and ship 3b's "As built" list win.

`settle` in `virtual_pet.hop`, the replay in `hop.py`, `settle_hop` and the pay (section 7),
the `hop_day` map, its published attribute and `games["hop"].tidy`, the tidy find, the
privacy mapping, the service text for `settle`.

What 2a left for it (shipped `73564bfb`; ship 2a above):
- **The schema.** `HOP_SCHEMA` has `entity_id` and `action` (`vol.In(["board"])`). 3a adds
  `settle` to the list and the optional fields `id`, `moves` and `shared` for it; `board`
  ignores them. `shared` and the person exist for `settle` only (section 6). Types at the
  boundary (review s2855 P15): `moves` is `vol.All(cv.string, vol.Length(max=R.HOP_MAX_MOVES
  + 1))` (so a megabyte string is rejected by the schema, and 201 letters reach the server's
  own `too_long` reply), `id` is `vol.All(cv.string, vol.Length(max=32))`, `shared` is
  `vol.Optional("shared", default=False): cv.boolean` as `play_game` has it. `services.yaml`,
  `strings.json` and `translations/en.json` get the new fields in the same ship (a test in
  `tests/test_hop_service.py` already checks the three agree).
- **The board for the replay** is `await self.async_hop_day_board(day, family, specials, w, h)`
  (2a): the same cache, the same shared build. Its arguments come from the pinned stage
  (`hop_day["stage"]`) once 3a lands, so `async_hop_board` changes too: it reads the stage from
  `hop_day` (writing it on the day's first ask, section 8) and not live from `life_stage`.
  The cache key (Decided 13) then changes only with the world or the day.
- **`done` and `tidy`** in the `board` reply (`false` in 2a) are filled from `hop_day`.
  `twist` stays `null` until ship 4.
- **What 2b fixed for 3a (card side).** The card sends `id` (the `board` reply's), `moves`
  (`HATCH_HOP.encode(g.moves)`, letters a-x) and `shared`; the `board` reply's shape is
  `{result, day, id, w, h, grid, family, specials, world, twist, done, tidy}`, which the card's
  `valid` check reads without `done`/`tidy`/`twist`. No server change comes from 2b.
- **2a's `async_hop_board` changes, and so do some of 2a's tests.** It computes `specials, w, h`
  from the live stage (`coordinator.py:3226`); 3a reads the pinned stage instead. The 2a tests
  that vary the stage mid-day (`tests/test_hop_service.py:100-120`, the cache-by-key tests)
  get their *expectations edited* (a mid-day stage change no longer changes today's board),
  not only new tests added beside them.
- `board` stops being write-free at a day rollover (section 8), and that write is followed by
  `_save()` and `_publish()`; every other `board` call, and every refusal, still writes
  nothing and logs nothing. The "board refuses without the care log" test of 2a stays.
- **`settle`'s order** (sections 6-8; the build follows it): schema; `_advance(now)`; the
  settle's refusals (`egg`, `away`, `asleep`; `away` rewritten to `asleep` for a private pet;
  never `too_tired`); `hop_day` empty or behind today -> `board_changed` (no build, no
  write); the await (`_who`, `_person`, the board from the pinned stage); the replay
  (`too_long`, `illegal`, `not_won`, id mismatch -> `board_changed`); then one synchronous
  block with a fresh `now` that re-checks the refusals and that `hop_day` is the entry the
  board was built for, decides paid / `already`, pays (`settle_hop`, the tidy find with
  `{}` for `None` flags), updates `hop_day` and the counts, fires the events, `_save()`,
  `_publish()`.

Acceptance:
- pytest (`tests/test_hop.py` and `tests/test_finds.py`'s pattern): settle with a
  solver-made winning list pays 23 plus the trait bonus and the play costs, once; a second
  settle answers `ok` with `already: true` and pays nothing; a tidy list pays the find once (basket and
  full-basket cases); **a tidy settle after a plain win pays the find and no second 23**;
  **two concurrent settles pay once** (`asyncio.gather`); an illegal list, a too-long list,
  another pet's board id and a stale generator id each answer their code and pay nothing;
  `settle` refuses `egg`, `away` and `asleep` (and `away` rewritten to `asleep` for a private
  pet) and pays nothing and writes no log; **`settle` does not refuse `too_tired`**: a pet at
  energy 10 settles a won board, pays, and its energy ends at 0 (Decided 17); `board` still
  refuses `too_tired` (2a's test stays); a new day resets `done` and `tidy`; `shared`
  goes to the household and the bond to the person; `game_record` and `favourite_game` are
  not called; no `next_find_at` change.
- **The review's edge cases (s2855), one test each:**
  - tidy settle with `_find_flags = None`: no raise, one find from the `{}` fallback (P1);
  - settle on an empty `hop_day`, and on one whose `day` is behind today: `board_changed`,
    nothing built (assert no `hop_board` call), nothing written, nothing saved (P3, Decided 18);
  - a `board` with `today < stored day` writes nothing and keeps `done`/`tidy`; `today >
    stored` rolls and resets them (P13, Decided 19);
  - a settle whose rebuild is slow while another screen's `board` rolls the day: `board_changed`,
    no `done` written; one where the pet falls asleep during the await: `asleep`, no pay (P4);
  - the rollover `board`: sensor attribute and `to_dict()` carry the new day, `async_delay_save`
    was called; a second same-day `board` writes nothing (P7);
  - tidy with an empty find pool: `tidy` set, `found: false`, no event; tidy with a full
    basket: `tidy` set, `found: true`, the find in the collection, no `found` event; tidy
    in the basket: `found: true` and the event (P8, Decided 20);
  - a legal list that stops short of the nest: `not_won`, nothing paid or written (P5);
  - the reply carries `won`, `tidy`, `paid`, `found`, `already` on every `ok`, and `already`
    is `true` exactly when nothing was paid (P5);
  - an open happiness call is closed by a hop win; the care-log entry has `game: "hop"` and
    `score: "win"` or `"tidy"` (P9);
  - `games["hop"]` transitions: first settle tidy = `played`, `won`, `tidy` each +1; plain
    then tidy = `tidy` +1 only; a plain settle after `done` changes nothing;
    `games_played` rises by 1 a day, not per settle (P10);
  - an over-long `moves` string is rejected at the schema; 201 letters answer `too_long` (P15).
- Save: an old save loads (`hop_day` `{}`); a new one round-trips; a damaged `hop_day` (wrong
  types, bad date, unknown stage) is dropped, as rows in `test_damaged.py`'s parametrised
  table (wrong type, a bad date, an unknown stage, `done` not a bool; P16); the general
  unknown-key survival check stands (no new downgrade claim; P12); `games["hop"]` loads with
  and without `tidy`; after `lay_egg`, `hop_day == {}` (P11); the attribute is on the
  life-stage sensor and is in its unrecorded set (`tests/test_recorded.py`; P6); `hop_day` is
  in the diagnostics `pet` block and not redacted (P16).
- **The round trip** (review P16): a pytest with the real HA test harness imports
  `scripts/hop_solve.py`'s solver, fetches the board through
  `hass.services.async_call("virtual_pet", "hop", ..., return_response=True)` as
  `tests/test_hop_service.py` does for `board`, solves the reply and settles with its list,
  and checks the pay and the saved day. No device is needed; the batch gate (`scripts/ci-gate`)
  runs it with the rest. (A list from the fixtures could not match the live board.)

### Ship 3b: the row's state, settle wiring, flag removal (card, tier 1, S-M)

The card sends the move list when the pet enters the nest, shows the solved view with its
restart ("try for tidy"), reads `hop_day` for the row's label, shows the settle replies, and
removes `experimental_hop` (a YAML-only key; with it gone no config key is left to remove, and
the card-check run "flag off builds nothing" is dropped); `strings`/guide/README/how-to-play
lines (draft). **No server change**: ship 3a is built (s2857, `5c0b2ad8`), and this ship
reads what it built.

**What 3a built, as the card sees it (read before building; Decided 21).**
- **The `settle` call:** `callService("virtual_pet", "hop", {entity_id, action: "settle", id,
  moves, ...(sharedScreen() ? {shared: true} : {})}, undefined, false, true)`; `id` is the
  `board` reply's, `moves` is `HATCH_HOP.encode(g.moves)`. `shared` is accepted and ignored by
  the server (Decided 21), so the card sends it only for parity with `play_game`; leaving it
  out would change nothing. The schema caps `moves` at 201 letters and `id` at 32 characters;
  a card that sends more gets a thrown call, not a code.
- **The reply on `ok`:** exactly `{result: "ok", won: true, tidy, paid, found, already}`. `tidy`
  is whether *this list* was tidy, not whether the day is; `paid` is the 23; `found` is a find
  added by this settle (basket, or straight to the collection when the basket was full);
  `already` is `not (paid or found)`. A tidy list that finds nothing to pick (or after the
  day's find) is `tidy: true, found: false`, and `already: true` if no 23 was paid either
  (D2): so **the card reads `tidy` for "the day is tidy", never `already`**, and shows the
  tidy view whenever `tidy` is true.
- **The refusal and error replies:** `{result}` alone, `result` one of `board_changed`
  (stale or empty `hop_day`, another board's id, a missing `id`, or a day that turned during
  the build), `too_long`, `illegal` (adds `bad_index`; a missing `moves` is `illegal` at 0),
  `not_won`, `egg`, `asleep`, `away` (a private pet's `away` arrives as `asleep`). Never
  `too_tired` (Decided 17). `REFUSALS` in `lines.js` already has `egg`, `away` and `asleep`;
  it has none for the rest.
- **The `board` reply** now carries real `done` and `tidy` for the pinned day (booleans), and
  `day` is the stored day. The card's `valid` check ignores them today; 3b reads them.
- **The attribute:** `hop_day` on the **life-stage sensor** (`s.ids["sensor.life_stage"]`, where
  `card-journal.js` reads `games`), `{day, stage, done, tidy}`; absent until the pet's first
  `board` call, and `{}` after a new egg.

**What 2b left for 3b (reconciled after 2b shipped, and again after 3a).**
- **Where it plugs in.** `_hopMove` in `card-board.js`: on entering the nest it sets
  `g.done`/`g.tidy` (local `HATCH_HOP.isTidy`), clears the parked list, reacts and says
  "solved"/"tidy". 3b adds the settle call there with the `_hopFetch` pattern (a seam of its
  own, `_hopSettle(id, moves)`, for card-check). The solved view shows **at once** from the
  local result (no wait on "thinking…"), and the settle runs behind it. The **parked list
  must not be cleared at the nest any more**: the line in `_hopMove` (`_hopStore(g.key,
  null)`) moves into the settle's reply handler. The reply's `result` decides:
  - `ok`: clear the list; `g.tidy = reply.tidy || g.tidy` (see P1: never lowered by a plain
    list); `g.settled = true`. "Try for tidy" ends for the day whenever `g.tidy` is true,
    `found` or not (Decided 20).
  - `board_changed`: drop the list, call `board`, load the new board (the day turned, or
    another screen's generator moved on).
  - `egg`/`away`/`asleep`: keep the list; the bubble is `REFUSALS[result]`; `g.settled` stays
    false (P3 for what the board then offers).
  - `illegal`, `not_won`, `too_long`: bugs, or an engine drift between hop-engine.js and
    hop.py. Keep the list, say "hmm, that didn't work", and `console.warn` once per code (as
    `HOP_WARNED` does for the board), naming the code and, for `illegal`, `bad_index`; never
    the move list.
  - a thrown call (network, HA restarting): as a refusal, keep the list, "hmm, that didn't
    work".
  - **In every case the handler first checks that `s.game === g`** (the player did not
    restart, quit or open another board meanwhile; a restart plus a second nest entry sends a
    second settle while the first is in flight, and the server pays once either way). A stale
    reply changes nothing on the card. The first reply to the older list still clears or keeps
    its own key (`g.key`), whoever is on screen.
- **The reopen path.** `_hopStart` today resumes a parked list only when it is legal and *not*
  won, and drops one that won. With the list kept at the nest this drops exactly the lists
  3b means to keep (asleep, a thrown call, a closed tab before the reply). So `_hopStart`
  changes (P2): a parked list that is legal **and won** opens the solved view (the pet in the
  nest, `g.done`, the local `tidy`) and **sends the settle again**; its reply is handled as
  above. A parked list that is illegal on this board is dropped, as now. A `board` reply with
  `done: true` and `tidy: true` drops any parked list (nothing is left to pay) and opens the
  tidy solved view.
- **A reload on the same day** (the `board` reply's `done`/`tidy`, no parked list): the solved
  view with the pet in the nest and no path. `g.st` is built from a replay of nothing, so 3b
  needs the nest state without a list: `{pos: <index of "N">, sunk: 0, uses: 0, done: true}`
  (`HATCH_HOP.fromView` takes the view form), or the solved view draws the pet on the
  start pad. `g.done = reply.done`, `g.tidy = reply.tidy` from the `board` reply, and "try for
  tidy" is offered while `!g.tidy`, restarting from the start pad with the board's own `st`.
- **Already built in 2b, not 3b's:** the solved view's keys (undo off once `g.done`, restart on
  only while `!g.tidy`, aria "try for tidy"), `_hopRestart`, the bubble lines. 3b changes the
  *source* of `tidy` (the settle reply, the `board` reply and `hop_day`) and the bubble's text
  per settle code.
- **The row's label is one constant** (`HOP_COPY.row`; `_hopRow` in `card-board.js`); 3b adds
  open / solved / tidy to it and the row's `aria-label` (all draft). The state is read from
  `hop_day` on the life-stage sensor: `open` when the attribute is absent, or its `day` is not
  today, or `done` is false; `solved` when `done`; `tidy` when `tidy`. "Today" is the server's
  day, the HA local date (Q1). The row is rebuilt when the picker opens, and also when the
  sensor's attribute changes while the picker is open (another screen settled): the local
  game's own settle updates it from the reply.
- **The flag.** Removing `experimental_hop` takes out `_hopOn()` (one line) and its guards in
  `_hopRow`, the flag-off checks in card-check's `board` section ("flag off: the picker has
  three games and no Hop row" and "flag off again"), and the bench's `hop: true` /
  `experimental_hop` lines in `page.js`, `scripts/bench.js`, `dev/bench/README.md`,
  `docs/features.md` (the grep above lists the files). The card-check `board` baseline in the
  picker-fit check (flag off first) goes with them. **A saved YAML with `experimental_hop:
  true` must still load** (P7): `setConfig` does not validate unknown keys today; a check
  asserts it.
- **Cell size.** The tap-then-confirm path is the common case (cells 19-28 px), so 3b's
  settle must not assume a one-tap commit anywhere.
- **Docs.** `docs/guide.md` (the life-stage attribute list near line 519 gains `hop_day`; 3a
  left it for this ship), the games text, README, how-to-play, `docs/features.md` and
  `dev/bench/README.md` (draft copy; section 10).

Acceptance (P-numbers are the review's, below):
- card-check on stubbed replies, each stub carrying the full as-built shape (`result`, `won`,
  `tidy`, `paid`, `found`, `already` on `ok`; `{result}` on a refusal):
  - a plain win: the solved view at once, the settle sent once with the board's `id`, the encoded `moves`
    string, no `shared` on a private screen, the list cleared on the `ok` (`paid: true,
    tidy: false, found: false, already: false`), "try for tidy" on;
  - then a restart and a tidy list: settle sent again, stub `ok` with `tidy: true, paid: false,
    found: true, already: false`: the tidy view, restart off; and the same with
    `found: false, already: true`: tidy view, restart off (D2: `already` is not read);
  - a plain list after a tidy day (stub `ok, tidy: false, already: true` with the `board`
    reply's `tidy: true`): the view stays tidy and restart stays off (P1);
  - `board_changed` loads the new board (a stubbed `board`) and drops the parked moves; `egg`,
    `away` and `asleep` each keep the moves and say their `REFUSALS` line; `illegal`,
    `not_won`, `too_long` and a thrown call keep the moves, say "hmm, that didn't work" and warn
    once each; none of them shows "paid";
  - the reopen after a refused settle: the parked won list opens the solved view and the
    settle goes out again, answered `ok` this time (P2);
  - a reply that arrives after a restart or a quit changes nothing on screen (P4);
  - the solved view has no undo; restart only while tidy is not set (the 2b check stands);
  - the row reads open / solved / tidy from the attribute, from a stale `day` (open), from an
    absent attribute (open), and from the local settle's reply;
  - a reload on the same day (the stubbed `board` with `done: true`): the solved view, pet in
    the nest, "try for tidy" offered when `tidy: false`, and a restart then plays from the
    start pad; with `tidy: true` no restart;
  - `experimental_hop: true` in a config does nothing and raises nothing; a card with no key
    has the row (P7).
- JS (`tests/js`): the reply handler as a pure function of (reply, game), if it is split out:
  the table above, one row each (P8).
- bench: the row in each of its three states at 300, 330 and 420; the solved view of a won
  board, of a tidy one, and of a reload (the nest state without a path).
- **Not verifiable without a device (device queue):** the real round trip from the card (the
  3a pytest covers server through the service with `hop_solve.py`, the card-check stubs cover
  the card; nothing runs the two together outside the batch gate's HA); how the settle reads
  on a real phone at 19-28 px cells; the "found" moment against a real find event (P6); a
  settle racing a bedtime on a real pet.

**Review of ship 3b itself (s2858, adversarial; against 3a as built).** What was wrong or
missing in the draft, and what was done:
- **P1 (wrong; fixed above).** The draft said the card takes `tidy` from the reply. The reply's
  `tidy` is *this list's*: a plain list on a day that is already tidy (a second screen, a
  second pass after a tidy settle that the card dropped, another person) answers `tidy:
  false, already: true`. Setting `g.tidy` from it would offer "try for tidy" again on a tidy
  day. The card keeps `g.tidy` as an OR of the `board` reply's `tidy`, the attribute, and every
  reply's `tidy`; nothing lowers it. Fixed: the `ok` handler and an acceptance row.
- **P2 (missing; fixed above).** The draft kept the list for a refused settle and then
  reopened through a `_hopStart` that drops any parked list that is won, so "the player can
  retry once the pet wakes" was not true in code: the first reopen threw the list away. Fixed:
  the reopen path, and its acceptance row.
- **P3 (missing; question Q2).** A refused settle leaves a solved board on screen that is not
  paid. The solved view then offers "try for tidy" (restart) whose handler clears the parked
  list: the player loses an unsettled win. See Q2.
- **P4 (missing; fixed above).** Nothing said what a reply for a board that is no longer on
  screen does; with restart plus a second nest entry two settles are in flight. Fixed: the
  `s.game === g` check, and an acceptance row.
- **P5 (wrong; fixed above).** The draft's acceptance stubbed `ok` with `already: true` and
  then `found: true`, with no value for the other fields, so a card that read `already` for
  tidy would have passed. Each stub now carries the full shape, and one row asserts D2.
- **P6 (unverifiable; device queue).** The draft said nothing of what the card says for
  `found: true` or for `paid`. The basket find already has its own moment through the
  `found` event, and a full-basket find has none (Decided 20: `found: true`, no event). This
  ship adds no new copy beyond the draft lines for the row and the solved view; for
  `found: true` with no event, Q3.
- **P7 (missing; fixed above).** Removing the flag with a YAML that still has it, and the
  card-check/bench/docs files that mention it (the grep), were not listed.
- **P8 (missing; fixed above).** No JS-level test: the reply table is a small pure function
  and cheap to cover without HA.
- **P9 (missing; fixed above).** The reload on the same day needs a nest state without a path;
  `HATCH_HOP.start` puts the pet on the start pad.
- **P10 (stale; fixed above).** The draft said the card reads `done`/`tidy` "once 3a fills
  them" and that 2b ignores both: 3a is built, and the `board` reply has them.
- **P11 (wrong in section 6; fixed there).** "The parked list is cleared on a settle" and
  "ship 3b reads [`already`] so" are edited: cleared on `ok` only; `tidy` for the day.
- **P12 (judgement; Q4).** Removing the flag exposes the row to every household with tier 1
  and no device pass.

Questions (answer before or during the build; each has a recommendation):
- **Q1. What is "today" for the row's label?** The server's day is the HA local date
  (`_today`); the card has no HA-timezone day (nothing reads `hass.config.time_zone`), and a
  browser in another timezone or a day-turn mismatch would show "solved" or "open" wrongly
  for hours. *Recommend:* compute the date with `Intl.DateTimeFormat("en-CA", {timeZone:
  hass.config.time_zone})`, fall back to the device's local date, and let the `board` reply's
  `done`/`tidy` correct the row when it opens. A wrong label costs a tap, not a pay.
- **Q2. A refused settle and the restart key.** *Recommend:* while `g.settled` is false the
  solved view's restart is disabled, and the list is kept; the player leaves and returns, and
  the reopen re-sends it (P2). The alternative (a "send again" key) is a new key and new copy.
- **Q3. `found: true` with a full basket gives no event.** *Recommend:* the card says one
  draft line ("found something!") from the reply's `found`, not from the event, and the
  basket's own `found` moment is not duplicated when the event also arrives (the `found` line
  wins within a short window). If the owner wants no new line, say nothing for a full basket.
- **Q4. Flag removal in the same ship as the settle.** *Recommend:* keep it in 3b as planned,
  but land the flag removal as the last commit, so the owner can merge 3b without it and
  after a device pass.

### Ship 4: world twists (engine and generator, tier 1, split 4a + 4b)

The six twists of section 2c, with the holes settled there, in `hop.py` and `hop-engine.js`,
their generator terrain and checks, fixtures, one bench shot per world. Built in **two
ships, 4a then 4b** (review s2860 Q8, Decided 33), because the first changes what a move
*is* (the landing differs from the target) and the second adds state. Each has its own
acceptance, and 4b is built on 4a's merge.

**Shared by 4a and 4b** (read section 2c first; it holds every rule):
- "Per world" first appears here: the acceptance and bot ranges are now per (world, family,
  stage), over the **21** (world, family) pairs the roster has (woodland 5, terrarium 4,
  hearth 3, tidepool 4, pond 3, nightsky 2), not 36. The test derives the pairs from
  `FAMILY_OF` and the roster rather than hard-coding 21. `cell_boards` in
  `tests/test_hop.py` takes the world (it hard-codes `"woodland"` today).
- **Babies get no twist** (Decided 26); stages child, teen and adult do. A fallback day has
  no twist (Decided 30).
- **No saved field.** `hop_day` is `{day, stage, done, tidy}` before and after, so ship 4
  stays tier 1 (review P15). It stays tier 1 only while the world and the twist stay out of
  `hop_day`. `lay_egg` already clears `hop_day`. The one mid-day effect is `GEN_VERSION`:
  **each of 4a and 4b bumps it by one** (2 to 3, then 3 to 4), because each changes boards;
  ids change, a settle on an old id answers `board_changed`, and the card loads the new board
  (once per release per pet). Each bump regenerates the golden boards
  (`tests/fixtures/hop_golden.json`), `dev/bench/hop-boards.json` (`scripts/hop_bench_boards.py`;
  it is woodland-only today and gains one board per twist world as they land) and updates the
  `card-check` board stub (`scripts/card-check.js`, which hard-codes `twist: null`).
- **The reply's `twist`** is `twist_of(board)` (section 2c), filled by `async_hop_day_board`
  (`coordinator.py` hard-codes `None`; `tests/test_hop_service.py`'s assertion on it changes
  with it). The card's `_hopStart` copies `w, h, grid, family, specials` and drops `twist`
  and `world`; it may keep `twist` for copy and the bench, and no rule reads it.
- **Cost** (Decided 9 holds here, where the solve gets bigger): median `hop_board` under 1 s
  and worst under 5 s on this machine, states under `HOP_STATE_CAP` (100,000), fallback share
  at most 10% per (world, family, stage) with `PER_CELL = 5` (so none in the default suite).
  The report states the measured numbers per twist world.
- **Every twist world's seeded board holds its glyph** (a test per twist world: of the
  `PER_CELL` boards of a (world, family, stage) cell at child and up, none is a fallback and
  each holds its twist's glyph). Goldens (`GOLDEN_INPUTS` already spans worlds, all
  twist-less) are regenerated, and each golden of a twist world asserts its glyph. A
  fresh-process determinism test (`test_same_inputs_same_board_in_a_fresh_process`) runs per
  twist world.
- **Python and JS agree** on `replay`'s `final` for every new field and every fixture case
  (`tests/fixtures/hop_cases.json`, which both engines read). `to_dict`/`view()` and
  `from_dict`/`fromView` follow section 2c "The state".
- **The touching rule and the loop net** (Decided 34): `touching_never_sinking(board)`
  replaces `touching_stones` in `check()` for the glyphs each ship adds; the generator
  places the ship's twist cells with `_candidate`'s "near" test for stones; `check()` catches
  `CycleError` (`Verdict(False, "loop")`); a test runs seeded boards of every world and
  asserts none raises out of `hop_board`.
- **Player copy**: section 2c "Player copy". The aria labels for the ship's cell kinds, the
  `role="img"` on twist cells, and the key labels' widened pad class come in with the ship
  whose cell it is.
- **Motion**: section 2c "Motion".
- **Bench**: the bench `board:` shot gains the fields it needs to pin each ship's states
  (4a: none beyond a fixture name; 4b: `parity` for the pool and `lantern: "lit"` or
  `"unlit"`, and a half-sunk crackle by playing its first leaving), and the README lists them.
  One bench shot per world at 300 / 330 / 420, each read by a worker for overlaps
  (`<shot>.json`); `--preset hop` shows the worlds the built ships cover.
- **The device** judges what no worker can (device queue, below): how the new cells read at
  300 px, the dim dark cell's contrast, the crackle's half-sunk look, the pool's phase, and
  the stump jump and rug slide as `translate` transitions on `.hpiece`. No acceptance line
  depends on those.

#### Ship 4a: stump holes and rugs (the landing differs from the target; M)

Woodland's stumps `1` `2` and hearth's rug `=`. The engine change is the landing: `step`
returns the state at the **landing** (a rug's slide, a stump's twin), and every place that
took the named cell for the landing is changed (section 4, "Where the landing is not the
target"): `step` and `apply`, the solver's nest shortcut and its `walk` twin, the bots' `_plan`
and `_greedy` (with the failed-plan fix), `reach()`, the card's `_hopNest` and key/tap
targets (`targets()` names the stepped-on cell; the card draws the landing). Also in 4a:
`CELLS` gains `1 2 =` in both engines; `Board` invariants for stumps; `touching_never_sinking`
for stones, stumps and rugs; the generator's stump and rug placement; woodland and hearth
boards at child and up carry the twist; `twist_of`; `GEN_VERSION` 3.

Acceptance (4a): fixture cases both engines pass: a stump pair (step in, land on the twin;
a hop and a glide landing on a stump, twin applies), a rug slide against an edge and against a
wall, a rug slide that stops on the rug because the next cell is sunk, a rug slide into the nest
with a find still missing (stops on the rug) and with every find in (wins on that move), a
hop and a glide landing on a rug (no slide), a swim or climb step from a water or wall cell
onto a rug and a rug facing water or a wall (no slide into it), a squeeze that names a stump
or a rug (refused: neither is a sunk pad), undo across a stump jump and across a rug slide;
`bad_boards` cases for an unpaired stump, a stump glyph used three times, and a mixed-twist
board; the casual bot **cannot hang** (a test forces `rules.step` to return `None` in
`_greedy` and the bot returns); checks 1-6 hold for woodland and hearth; the bot ranges hold
per (world, family, stage) for those two worlds; every woodland and hearth seeded board at
child and up holds its glyph with no fallback; `check()` rejects a stump beside its twin,
a rug or stump beside a stone, and a candidate whose solve raises `CycleError`
(`"loop"`); a pytest that a save made before the ship loads (a `hop_day` saved with the old
stage and day loads, `board` serves a new id, a `settle` with the old id answers
`board_changed`); card-check `board` is rerun on a stubbed board per twist (stump, rug);
the bench shows a woodland and a hearth board at 300 / 330 / 420; `scripts/gate --auto` plus
the first mate's `ci-gate` for the batch.

#### Ship 4b: crackle, pool, ripple, lantern (new state; M-L)

Terrarium's crackle `c`, tidepool's pool `%`, pond's ripple `r`, nightsky's `?` and `*`. The
new state (section 2c "The state"): `parity` on pool boards and `half` on crackle boards,
in `State`, `view()`, `fromView` and the memo key (both places it is packed, and the walk).
Also in 4b: the **bots' BFS** gets nodes `(cell, spent, parity)` for pools, plans a path and
replays each step with `rules.step`; a ripple's chain in `step` (and the solver, and `reach`'s
relaxed relation, which may over-approximate); the lantern's derived flag in `entry` and
`reach`; dark cells in the tidy pad mask; the card reads `parity` from the state view and
draws pools in the next move's phase and a half-sunk crackle; the key labels' pad class;
`CELLS` gains `c % r ? *`; invariants for `?`/`*`; `touching_never_sinking` gains `%`;
`twist_of` the rest of its values; `GEN_VERSION` 4; the `"P.o?"` `bad_boards` case changes in
the same commit.

**What 4a built that 4b extends** (reconciled after ship 4a, s2866):
- **Tables, not branches.** `hop.py` holds `TWIST_GLYPHS` (twist to glyphs), `WORLD_TWIST`
  (world to twist; 4a: woodland `stumps`, hearth `rug`) and `NEVER_SINKING = "o12="`, which
  `entry`, the walk mask and `touching_never_sinking` read; `hop-engine.js` mirrors
  `CELLS`, `NEVER_SINKING` and `TWIST_GLYPHS`. 4b adds its four rows to `TWIST_GLYPHS` and
  `WORLD_TWIST` and `%` to `NEVER_SINKING` in both engines. `Board` already refuses more than
  one twist kind and a twist on a baby's board (`specials == 0`); 4b adds the `?`/`*` counts.
- **The landing.** `_Rules.land(pos, t, special, sunk)` gives the cell after entering `t`
  (JS: `land(board, cells, pos, t, special, sunk)`, direction from `t - pos`); `step`, the
  solver's `rec` and `walk` (nest test and memo key on the landing) and the JS `apply` use it.
  A ripple's chain goes in `step` next to it, not in `land` (it sinks cells, it does not move
  the pet). `reach` seeds the twin of a pos on a stump and pushes a stump's twin; the rug needs
  nothing there (the cell past it is a neighbour).
- **The bots.** `_plan` returns `(named, landing)` pairs over landing nodes; `_greedy` steps
  the named cell, returns its moves when a planned step is `None`, and re-plans when the
  landing is not the planned one. 4b's `(cell, spent, parity)` nodes extend that node. The
  re-plan fires on the landing only, so a ripple's or a crackle's change of `sunk` must be in
  the plan's own step (or trigger a re-plan too), or the next planned step returns `None` and
  the bot gives up.
- **The generator.** `_place_twist(rng, cells, order, twist, specials, w, h, clear)` places a
  twist on a candidate (stumps in whole pairs, a rug only where a row or a column gives it a
  pad-or-stone neighbour on both sides, so it can slide); `clear(i)` is `_candidate`'s near
  test over `NEVER_SINKING`. A twist-free world draws exactly as before. 4b adds one branch
  per twist, with the same care that each cell can act (a ripple with a pad to its right, a
  lantern not walled off from its dark cells), and `hop_board` already skips a candidate whose
  `twist_of` is not its world's.
- **Squeeze "refused".** A squeeze naming a cell that is not a sunk pad is never an illegal
  letter: the plain step onto the cell is legal, so the move is taken as a plain step and no
  use is spent. 4a's fixture for a stump and a rug asserts that (`uses` unchanged); 4b's
  "squeeze back onto a half-sunk crackle" asserts the same (one visit spent, `uses`
  unchanged), and the squeeze onto a fully sunk one spends the use.
- **Tests.** `cell_boards` takes the world and `PAIRS` derives the 21 pairs. With
  `PER_CELL = 5` the bot ranges are too noisy per cell (hearth dig cells scored 12/15 and
  13/15 at 5, and at least 0.96 at 200), so the default suite asserts them per (world, family) over its stages and per
  (world, family, stage) only under `HOP_FULL`; 4b keeps that split. The old-save test
  (`test_hop_settle.py`) builds the old board by monkeypatching `GEN_VERSION` and
  `WORLD_TWIST`; 4b's version sets 3 and drops its four worlds.
- **Bench and card-check.** `scripts/hop_bench_boards.py` lists `(world, family, stage)`;
  a board outside woodland is named `<world>-<family>-<stage>`, and each fixture's
  `landing` holds the shortest list whose last move lands off its named cell. `--preset hop`
  shoots `HOP_TWIST_WORLDS` (scripts/bench.js) at each width, at start and `-landed`; 4b adds
  its worlds there and its pins (`parity`, `lantern`) to the `board:` shot. card-check's stub
  reply derives `twist` from the grid (`twistOf`) and sets `world`.
- **Card.** `legalTargets` already names stepped-on cells and `_hopPlace` draws the landing;
  `_hopNest` needed no change. `HOP_LABELLED` maps a glyph to its `HOP_COPY.cell` label
  (`role="img"`); 4b's labels depend on state (crackle half, pool phase, dark lit), so it
  becomes a function of the cell and the state.

Acceptance (4b): fixture cases both engines pass: a crackle pad's two visits (and tidy needing
both), a squeeze back onto a half-sunk crackle (taken as a plain step, no use spent) and onto a
fully sunk one; a pool
across the move parity with an undo, a swim onto a pool in its water phase (a water entry),
a hop and a glide onto a pool in its water phase (blocked) and in its stone phase, an undo
across a parity change; a ripple chain (a run of `r`, then a plain pad that sinks with it, then
a find pad that does **not**), a chain stopped by the row's edge and by a sunk cell, a step
from `r` onto its sinking right neighbour, a ripple left by a special move; a lantern then a
dark cell, a hop onto the lantern (lit), a special onto an unlit dark cell (refused), a
lit dark cell left (sinks), a squeeze onto it, a tidy list that must light and sink every
dark cell; `bad_boards` for a `?` with no `*`, two lanterns and a mixed-twist board; the Python
replay and the JS engine agree on `final` for `parity` and `half`; `walk` finds the memo entry
at every step; checks 1-6 hold for the four worlds; the bot ranges hold per (world, family,
stage) over the four worlds' 13 pairs (terrarium 4, tidepool 4, pond 3, nightsky 2); every
seeded board at child and up holds its glyph with no fallback; the cost numbers above are
reported per world, and if a world exceeds the cap or the fallback share the report says so
rather than loosening them; the loop net test covers all six worlds (no `CycleError` out of
`hop_board`); card-check `board` is rerun on a stubbed board per twist (crackle, pool, ripple,
lantern), with the key labels (a crackle `sunk` only when fully sunk, a water-phase pool
`blocked`) and the aria labels of section 2c asserted; the bench shows each world's board at
300 / 330 / 420, a pool in both phases and the lantern unlit and lit
(`--preset hop`); `scripts/gate --auto` plus the first mate's `ci-gate` for the batch.

### Ship 5: hints and practice boards (server and card, tier 1, S-M)

The `hint` action (a server solve from the position; the card's hint key; the pet looks
toward the cell after three undos in a row, draft line "hmm… that way?"). The hint is the
next cell of some **winning** list from the position, not a tidy one (a tidy hint would make
tidy free and pay the find). It runs the solver with the same state cap, in the executor,
with a per-minute limit per pet (`R.HOP_HINTS_PER_MIN`), because a search per call is a cost
`settle` never has.
Practice boards (decided: daily first, unpaid practice in this last ship): `action: board`
takes `n`, the board is the same function with `n` in the seed (the coordinator's cache key
`(day, world, family, specials, w, h)` from 2a gets `n` appended and `async_hop_day_board`
takes it as a defaulted argument `n=0`, so the day's entry is unchanged and practice boards
are kept by the same rule, today's only, with a cap on the keys per day), and the settle for a
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
- Whether the keys are understood without a line telling the player (keys inside
  the overlay, as the dig's are, need it least).
- How long a board takes: this plan guesses 2-5 minutes at child and 5-10 at adult.
- The first week of `played`/`tidy` counts, against the bots' brackets (section 4).
- **Cell size with the keys in the LCD (2b).** The grid shares the overlay with a 2×4 key
  column, so the drawn cell is 19 / 22 / 28 px at 300 / 330 / 420 (6×4 board), not the 35-49
  px this plan first expected. Every adult board is therefore tap-then-confirm; the one-tap
  path (cell ≥ 44 px) is real but only a very wide card reaches it. Does a 19 px cell read at
  arm's length, does the first tap find the cell, and is it better to let the keys overlap
  the grid's own edge or to shrink the grid cap to 5×4 at 300?
- Keys of 24-44 px (the overlay sizes them from its height): are the glyph keys (◀ ▲ ▼ ▶,
  ✦n, undo, restart, ✕) understood without words, and are the smallest ones (24 px at 300)
  hit reliably with a thumb?
- The Hop row at 300: in the "slot" (beside the last game's button, label only) it is 44 px
  high and sits close to the close button; does it read as a game or as a stray button?
- The piece's 140 ms glide, the dotted path and the arc (hop, glide) on a real LCD: too
  quick, too slow, or invisible at 19 px?
- Glide's diagonal special has no key; it is tapped only. Is that found without a hint?
- **Ship 4 on a real phone and pet** (review s2860 P16; no worker can judge these, and no
  acceptance line depends on them). 4a: whether a stump hole and a rug read at 300 px (cell
  12-44 px by width) and are told apart from a stone and a pad; the stump jump and the rug
  slide as `translate` transitions on `.hpiece`: is the move followed by eye, or does the pet
  seem to vanish? 4b: a dim dark cell's contrast against the LCD (unlit and lit); a crackle
  pad's half-sunk look beside a whole one; a pool's phase (drawn as the next move's) read
  during play, and whether the water-phase pool is taken for a wall; a ripple pad's look and
  whether the chain to its right is guessed without text; the nine aria labels read by a screen
  reader. The decision is the owner's eye, then the first mate's copy if a world wants a
  one-line "what is this" on open (new copy, Decided 29).
- **Ship 3b on a real phone and pet.** The real round trip from the card to the server and
  back (the stubs and `hop_solve.py` cover the halves); the settle at 19 / 22 / 28 px cells
  (tap, confirm, nest, solved view, no one-tap assumption); the "found" moment and its line
  against a real find event and a full basket; a settle racing a bedtime (the pet falls asleep
  with the win on screen, the list stays parked, the reopen sends it again).
- The picker at the smallest width (a 284 px card, LCD 180×135): the three games already run
  6 px past the LCD's foot and the second touches the close button (found by 2b's baseline, not
  caused by the row). Is that visible on a phone, and does the picker need its own 300 px fix?

## 10. Docs the build updates

`docs/features.md` (a row; the Hop row on the play screen), `docs/guide.md` and README (the games text),
the `virtual_pet` service texts (`strings.json`, `translations/en.json`, `services.yaml`),
`dev/bench/README.md` (`view: board`, the `board` field, the preset), `AGENTS.md`'s part
table (two new parts: `hop-engine`, added in ship 1; `card-board`, 2b), and the how-to-play
page. All with draft copy.

## 11. Not verified / risks

- Ship 1 measured the generator, the filter and the bots (section "Measured in ship 1"); no
  twist yet. A baby's 4×3 has only one obstacle, one stone and one find, so baby boards are
  few in kind (about 40% of candidates pass), but none fell back in 6,000 baby boards. The
  careful bot is tidy far above 70% at a budget of 300 moves tried; whether tidy should be
  harder is the owner's call after the first week of real counts (`TRAP_MARGIN`, `TIDY_MAX`).
- The 2×4 pad and the 35 × 34 px cell come from the scout's single 300 px render. The 8 keys must also fit inside the overlay with the grid; 2b's bench shots
  at 300 px are the first look.
- Ship 2a is built and tested; what it did not do: no real-HA run of the service (the
  batch gate does it) and no hassfest (CI only; the service text test stands in). The cost
  of a build stays in the executor, which the GIL does not make free: the worst board (0.87 s,
  squeeze adult) still slows the loop a little. Accepted.
- The picker-plus-row fit (section 5) has no bench shot yet; the review took none either.
  Ship 2b's first job is the 300 / 330 / 420 shots, and the row's strip may need a design
  pass if the picker at `tight` has no room for it.
- The twists for terrarium, pond and nightsky, and the squeeze family, are this plan's
  proposals and are the likeliest to be changed after the owner looks.
- Ship 4's review (s2860, folded by s2861) found no saved field: `hop_day` is
  `{day, stage, done, tidy}` before and after, the board and the twist are rebuilt from
  the entry's data, and the world is not pinned. Pinning the world or the twist in `hop_day`
  would make ship 4 tier 2 (a validation row in `test_damaged.py`); nothing here does.
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
- The replay is deterministic across restarts and upgrades (a pure function of the pet id,
  day, world, family, specials, size and `n`, seeded through `random.Random(str)`), with one
  caveat (review s2855 P14): `random.Random(str)` is stable across CPython versions, but the
  `shuffle`/`choices`/`sample` call sequences are not guaranteed to be, so an HA upgrade that
  changes CPython could build a different grid from the same seed. The id hashes the grid,
  so the effect is `board_changed` for a board in flight, never a double pay; ship 1's
  `tests/fixtures/hop_golden.json` catches it in CI.
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
8. **No two orthogonally touching stones**, nor touching never-sinking walkable cells of
   any later kind (first mate, answering review s2771 Q1; section 2). The solver raises on a
   loop rather than count it.
9. **Cost targets** (first mate, Q2): median `hop_board` under 1 s on this machine, worst
   under 5 s; state cap at most 100,000; about 5 boards per (family, stage) in the default
   suite, 1,000 per cell behind `HOP_FULL=1`. Ship 1's report set the final numbers
   (section "Measured").
10. **The candidate table as tunable drafts** (first mate, Q3): finds baby 1, child 2, teen
    2-3, adult 3; walls and water at most 25% of the cells (section 4).
11. **The board id hashes the pet id, the day and `GEN_VERSION`** with the board and `n`
    (first mate, Q4; section 4). FM: world added after audit (s2773 N3): the id also hashes
    the world, and `GEN_VERSION` went to 2 before anything was live.

Also settled by this fold, for the first mate to veto: a nest entry ends the board and
settles at once, a plain win does not lock the day, and the solved view offers a free restart
for tidy (section 6); a board that crosses midnight or bedtime is lost, with no grace window;
the saved map is `hop_day`, not `hop` (section 8).

## Decided (2026-11-03)

The first mate answered review s2778's Q1, Q2, Q4 and Q5 on 2026-11-03, after ship 2a (s2779)
shipped. The numbering continues the list above. Item 16 is the owner's answer to Q3,
made later the same day.

12. **`board` refuses `too_tired`** (first mate, Q1), with `egg`, `asleep` and `away`, through
    `model._refuse_play`. A tired pet shows no Hop; the row and the card's own `_startGame`
    (energy under 15) agree. Built in 2a. **Scope: `board` only; `settle` does not refuse
    `too_tired` (Decided 17).**
13. **The cache is keyed on the full argument tuple, today only** (first mate, Q2): `(day,
    world, family, specials, w, h)` in the coordinator (the pet is the coordinator), other
    days' keys dropped on each call, so memory does not grow and a stage change, a world
    change or a Wednesday's narrower board changes the key by construction. Built in 2a
    (`PetCoordinator._hop_boards`, `async_hop_day_board`); ship 5 appends `n`.
14. **`experimental_hop` is a YAML-only key** (first mate, Q4): read in `setConfig`, not in
    the visual editor, no stub default, removed by 3b. Ship 2b adds it (section 5).
15. **Ship 2b is built after motion ship 2** (first mate, Q5). It landed as `9062364a`, so
    the composition rule in `AGENTS.md` and `tests/js/motion_rule.test.js` are on main, and
    2b follows them (ship 2b, "Motion").

### Owner decision

16. **Q3: the board's keys live in the `gameBox` overlay, as the dig's do (Option A)**
    (owner, 2026-11-03). Less code: the care pad, `_press`, the lights key, the `wants` pulse
    and the aria labels are untouched, so no care action can fire from a game key by
    construction. Option B (the real care pad becomes the keys) is dropped with its guards.
    Section 1 and ship 2b were edited to match and the "pending Q3" marks cleared (s2800).

## Decided (2026-11-03, review s2855)

The first mate answered review s2855's Q1-Q4 on 2026-11-03 (they are folded into sections
6-8, ship 3a and ship 3b; s2856).

17. **`settle` refuses only `egg`, `away` and `asleep`; `too_tired` applies at `board` only**
    (first mate, Q1). The pay costs `PLAY_ENERGY`, clamped at 0 (`_clamp`). A won board is
    never lost to tiredness; sleep still blocks it, with the parked retry. Amends Decided 12's
    scope and the 3a acceptance.
18. **`settle` on a stale or empty `hop_day` answers `board_changed`, never writes, never
    builds** (first mate, Q2). `board` is the only writer of `hop_day` apart from the pay
    block, and the only place the stage is pinned.
19. **The day rolls over only when `today > stored day`** (first mate, Q3). A day that goes
    backwards (timezone, clock, restore) is the same day. One test.
20. **`tidy` is set on the first tidy settle even if the find cannot be added** (first mate,
    Q4). The reply carries `found: true/false`; the card stops offering "try for tidy".

## Decided (2026-11-03, ship 3a as built)

The first mate accepted ship 3a's readings D1-D3 and its other deviations (report of s2857,
"Deviations and readings"), recorded by s2858.

21. **Ship 3a as built, accepted** (first mate):
    - **D1, the find-only settle.** A tidy settle after a plain win pays only the find (and the
      `found` event if the find went into the basket). It has no play costs, no care-log entry,
      no `game_finished` event and no bond. That day's log shows `win`; the later tidy shows
      only in `games.hop.tidy` and `hop_day.tidy`. Section 6's "one care entry on a paid settle"
      is the 23's.
    - **D2, `already` is `not (paid or found)`.** A tidy settle after a plain win with no find to
      pick answers `ok, tidy: true, paid: false, found: false, already: true`, and `hop_day.tidy`
      and the tidy count are still set (Decided 20). **The card reads `tidy` from the reply, never
      `already`**, to decide that the day is tidy.
    - **D3, "writes nothing"** means nothing beyond what `_advance` saves on every call (as in
      2a's `board`); the tests count saves outside `_advance` and compare `to_dict()`.
    - **Egg is refused in `hop_day`.** The load validation drops a map with `stage: "egg"` (an egg
      has no board; `params_for` would raise). Otherwise as section 8.
    - **The sensor attribute is `{day, stage, done, tidy}`** (sections 5 and 8; the stage is not
      personal).
    - **`shared` is accepted and ignored** by `settle`: nothing of Hop is kept per person, and the
      bond goes to the signed-in person, only when the 23 was paid (as `play_game`).
    - **The checks after the build run in this order:** board id mismatch (`board_changed`), then
      `too_long`, `illegal` (with `bad_index`), `not_won`. So another board's list answers
      `board_changed`, not `illegal`. A `settle` with no `id` answers `board_changed`; with no
      `moves`, `illegal` at index 0 (answered, not raised by the schema).
    - **The `ok` reply** is `{result, won, tidy, paid, found, already}` and nothing else (no `day`,
      no `done`): `tidy` is whether *this list* was tidy, not whether the day is. A refusal or
      `board_changed`/`too_long`/`not_won` is `{result}` alone; `illegal` adds `bad_index`.

## Decided (2026-11-03, ship 3b questions)

The first mate answered ship 3b's Q1-Q4 on 2026-11-03 (brief of s2859).

22. **Q1: the row's "today" comes from `Intl` with `hass.config.time_zone`** (first mate). The
    `board` reply's `done`/`tidy` corrects the row when it opens. Fall back to the device's
    local date when the zone is missing or unknown.
23. **Q2: restart is disabled while a won board is unsettled** (first mate), whether the settle
    was refused or is still in flight. The list is kept; the reopen re-sends it (P2).
24. **Q3: one short line for a find from `found: true`** (first mate), in the house voice of
    the existing find lines. It is the only new player copy in 3b; any other missing line is a
    question for the first mate, not a guess.
25. **Q4: flag removal (`experimental_hop`) is the last commit of 3b, on its own** (first
    mate), so it can be dropped. Old YAML that still sets the flag must load (P7).

## Decided (2026-11-04, review s2860, ship 4)

The first mate answered review s2860's Q1-Q9 on 2026-11-04, all as the review recommended
(brief of s2861). They are folded into sections 2, 2b, 2c and 4, the device queue and ship 4,
which is built as 4a and 4b. The numbering continues.

26. **Q1: no twists for babies** (first mate). A twist starts at child; babies stay steps,
    pads and stones, which keeps the shared `base` fallback and every baby test unchanged.
27. **Q2: a ripple never sinks a find pad** (first mate), with the P2 chain wording (section
    2c). Only `.` and `r` sink by a ripple; no picked-finds mask in the engines, the solver,
    the bots or the card.
28. **Q3: the pool phase is fixed at one-move parity** (first mate): a stone when the move
    count the entering move makes is odd. The build does not tune 1 or 2. The card draws the
    **next** move's phase.
29. **Q4: no tutorial text** (first mate). The art explains; one aria string per new cell kind,
    quoted in section 2c for the first mate to approve (a worker invents none); `twist` is a
    copy-only id. A one-line "what is this" per world, if wanted, is new copy.
30. **Q5: fallbacks stay twist-free and shared** (first mate). "A fallback day has no
    twist". The fallback share is asserted at most 10% per (world, family, stage) over the 21
    real pairs.
31. **Q6: lit dark cells count toward tidy** (first mate): they are pads, so tidy means
    lighting the lantern and sinking each of them.
32. **Q7: the engines read the grid glyphs only** (first mate). A board's `twist` is derived
    from its glyphs and is never read by a rule. The twist's state fields (`parity`, `half`)
    exist only on boards with that twist.
33. **Q8: ship 4 is split** (first mate): **4a** stump and rug (the landing differs from the
    target: `step`, solver, bots, `reach`, fixtures), **4b** crackle, pool, ripple and lantern
    (new state, key packing, parity), each with its own acceptance and tests, and each bumping
    `GEN_VERSION` by one.
34. **Q9: `check()` rejects a candidate on `CycleError`** (`Verdict(False, "loop")`), beside the
    generalised touching rule over the never-sinking walkable class (section 2), so a missed
    adjacency costs a candidate, never the day's board.
