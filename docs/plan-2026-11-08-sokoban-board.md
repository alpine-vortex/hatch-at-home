# Plan: Sokoban, a crate-pushing board for the pet (working title, 2026-11-08)

**Status:** DRAFT 2, 2026-11-08 (slice 1 built on branch `sokoban-slice-1`; the owner then asked that the **player choose the difficulty** and that happiness rewards scale with it, folded below as section 3's levels and section 5). Plan only (tier 0); no code. The owner asked (2026-11-08) for a minigame at
Hop's level of depth, "sokoban style", then (same day) plain crates with the pet's own sprite, the name Sokoban, and world push objects only as a later skin.
Everything under "Proposed" is this draft's suggestion for the owner to change; "Questions" lists what needs
an answer before slice 1. Written from `docs/plan-2026-11-02-hop-of-the-day.md` (read sections 0, 2, 6, 7);
file and line cites are **not** yet re-checked against the code, recheck when a slice starts.

## 0. The idea in one paragraph

Each day the pet gets a second small board: a **crate board**. The pet (drawn as the pet's own sprite, the
piece, as in Hop) pushes **crates** one cell at a time onto the marked **spots** on the floor. When every spot
holds a crate the board is **solved**. It is Sokoban: the pet only pushes, never pulls, and a crate pushed into
a corner is stuck. The difference from Hop is the goal: Hop is a path (visit everything, leave nothing
standing); this is arrangement (move things to places). It reuses Hop's board mode, eight shell buttons,
keyboard keys, undo, restart, daily seed and "card plays, server replays and pays" settle, so almost all the
new work is one rules engine and a plain look.

### Difficulty is the player's choice (owner, 2026-11-08)

The player picks **easy, normal or hard** before the board opens; the pet's stage no longer sets the board
(it still sets the specials' uses, a later slice, not yet scheduled). The board is a function of (pet, day, world, **level**), so each
level has one board a day, the same on every screen. Harder levels are bigger, have more crates and walls
and need longer solutions; the pay rises with them (section 5). Built in slice 1 (`LEVELS`, `GATES`).

### Theme (owner, 2026-11-08)

- **Name:** the owner prefers **Sokoban**, ideally "the same thing" as the classic game. Working title in this
  plan: **Sokoban** (Q1 flags that the name is a registered trademark in places, so the player-facing title
  may need a plain alternative such as "Crates"; the code and docs can say Sokoban either way).
- **Now:** plain **crates** and spots, with the pet's own sprite as the character. No world art needed for
  slices 1 to 4: a CSS or pixel stand-in crate, like Hop's early boards.
- **Later (slice 5, optional):** the **world push objects** are fine as a skin. Only the sprite changes; the
  rules are the same in every world:

| world | the pushed thing (later skin) |
|---|---|
| woodland | moss bundles |
| terrarium | pebbles |
| hearth | cushions |
| tidepool | shells |
| pond | lily leaves |
| nightsky | star-bits |

## 1. The rules (proposed)

Terrain, one character per cell, boards at most **6 wide by 4 tall** (the card's 44 px cell rule from Hop):

| char | cell | rule |
|---|---|---|
| `.` | floor | walkable, never changes (**no sinking pads here**: that is Hop) |
| `#` | wall | blocked for the pet and for a crate |
| `P` | start | floor the pet starts on |
| `b` | crate | a pushable on floor |
| `n` | spot | floor that wants a crate |
| `B` | crate already on a spot | at the start only if a board has one (the generator may, for a gentle first step) |
| `~` | water or void | blocked, as `#`, drawn differently |

- **Step:** 1 cell up, down, left or right onto a walkable cell with no crate.
- **Push:** stepping toward a crate pushes it one cell the same way, if the cell behind it is floor or a spot
  with no wall and no other crate. Otherwise the step is **illegal** (nothing moves, no cost).
- **Pull:** none. (Hence dead ends exist; see "No loss" below.)
- **Win (solved):** every spot holds a crate. The board ends the moment the last spot fills (no walk to an exit).
- **Par:** the solver's fewest-moves answer plus a slack. A win within par is **neat** (this plan's name for
  Hop's "tidy"; a better word is welcome, Q1). Undo and restart are free and unlimited, as in Hop. The count
  that matters is the move list left after undos.
- **No timing anywhere. No loss.** A stuck board is not a game over: undo one move or restart. The generator
  guarantees every shipped board is solvable (section 3), so "stuck" always means "undo", never "give up".
- **The special move** (the 5th button): each species keeps its family, stage gives uses (baby 0, child 1,
  teen 2, adult 3), as in Hop. The special is one of: **leap** (jump a crate or wall to the cell behind it, no
  push), **tug** (pull the crate in front of you one cell toward you, when the cell behind you is free),
  **nudge** (push a crate sideways one cell without moving), **slide** (push a crate until it stops),
  **swap** (trade places with an adjacent crate), **hop-over-wall** (cross one wall cell). Six families to map to
  the 30 species, as Hop maps its six; Q4 asks whether the same species-to-family map as Hop is used.
  Because every special is a bounded, undoable move, the "free loop" problem from Hop's section 2 needs the
  same proof: **with no pull in the base rules, a push never undoes a push; the only loops are specials, and
  those spend a use**. The solver still raises on a state met twice on one line.

## 2. How it fits the code that exists

Everything below follows Hop's pattern; its names are what the plan says exist and are **to be rechecked**.

- **Engines:** a pure `sokoban.py` (rules, generator, solver) and its twin `sokoban-engine.js`, with one shared
  fixture file (`tests/fixtures/sokoban_cases.json`) both test suites run: boards, move lists, the expected result
  (legal or the first illegal index, solved, neat, final state), as Hop's `hop_cases.json` does.
- **Board service:** Hop's `board` service (ship 2a) serves the day's board. Sokoban adds a `game` field
  ("hop" or "sokoban") rather than a second service; the service stays deterministic in (pet, day, world, family,
  specials, game), so every screen of a pet gets the same board.
- **Card:** board mode (`card-board.js`) already draws a grid, takes eight buttons or arrow keys, parks on ✕
  and undoes. Sokoban needs a second cell vocabulary (crate, spot, push preview) and nothing more in the shell.
  `SHELL_MODES` gets a `shellSokoban` slot map: left, up, down, right, special (its cap is the uses left), undo,
  restart, quit (the same as Hop's `shellHop`).
- **Settle and pay:** the card plays locally and sends the move list once; the server replays it on its own
  copy and pays (Hop's section 6). A new `settle_sokoban` beside `settle_hop` shares the pay tail.
- **Saved state:** one small map per pet, `sokoban_day` (day, highest level paid, neat paid), plus counts in `games`
  (Hop's `hop_day`). This is a saved field: **tier 2**, as Hop's ship 3a.
- **The play screen:** Hop has a row outside the picker. Sokoban gets a second row, or one "Today's boards" row
  that holds both (Q3). The picker itself stays as it is (shell-modes D2).
- **Art:** one crate sprite and one spot mark, plain, as a CSS stand-in (as Hop's early boards). The world
  push objects and a "solved" line per world are the optional slice 5, a separate owner-gated art step.

## 3. The generator and the solver (the main risk)

A 6 by 4 board is small, which makes the **state space tiny** (24 cells, up to 3 crates: about 42 000 states),
so a plain breadth-first solver finds the optimum in milliseconds. That settles solvability and par. What is
hard is making a board **interesting** rather than trivially solved:

- **Generate by working backwards:** place the crates on the spots (solved), then apply random legal **pulls**
  (the reverse of a push) for N steps, so the result is always solvable and the solution is at least a little
  long. Reject boards the solver solves in fewer than a minimum number of pushes, boards where a crate starts
  next to its spot with an open line, and boards with no wall that matters.
- **Difficulty by level (built):** easy 5 by 4, 2 crates, 1-3 walls, at least 12 moves and 3 pushes; normal 6 by 4,
  2 crates, 2-4 walls, at least 15 moves and 4 pushes; hard 6 by 4, 3 crates, 3-5 walls, at least 20 moves and
  7 pushes. Measured on 300 boards each: the median fewest-moves are 14, 17 and 27 (hard ranges 20 to 46);
  the generator draws on average 5.8, 10.5 and 30.3 candidates (worst 143) before one passes. A hard gate
  of 24 moves was tried first and accepted only 1 candidate in 100, so it went to 20.
- **Two bots as in Hop's section 4** (a random walker and a greedy bot) to check "win easy, neat hard": a
  random walker rarely wins; the greedy bot gets stuck in a corner on a hard board.
- **Dead-state check:** the solver also marks which crate positions are dead (a crate in a corner that is not a
  spot). The card does **not** warn the player (that would solve it for them); a hint is a later slice (the
  Hop plan's ship 5).

**Honest risk:** at most 3 crates on a 6 by 4 board, Sokoban gets hard fast or stays shallow. If the sample
boards are dull the slice-1 acceptance fails and the answer is a 7 by 5 board on wider cards only, or fewer
walls. This is the plan's biggest unknown, so slice 1 ends with the owner judging 20 generated boards on the
bench (the way Hop's art was judged on the bench) before any card work starts.

## 4. Slices

| # | What | Tier | Risk | Depends on |
|---|---|---|---|---|
| 0 | Owner answers Q1-Q6; this plan is folded and gets a review pass | 0 | low | none |
| 1 | `sokoban.py`, `sokoban-engine.js`, shared fixtures, generator by level, solver, two bots, a contact sheet for the owner. **Built** (branch `sokoban-slice-1`) | 1 | med | 0 |
| 2 | The `board` service takes `game: "sokoban"` and a `level`; deterministic per day, three boards a day | 1 | low | 1 |
| 3 | The card: a level picker (easy, normal, hard, with what each pays and a practice note), crate and spot cells, push, `shellSokoban`, undo and restart, park, keyboard, a plain CSS stand-in crate and the pet's own sprite, bench `view: "board"` for Sokoban | 1 | med | 2 |
| 4 | Settle, pay, `sokoban_day`, the journal line; a replay test shared with the card's engine | 2 | med | 3 |
| 5 | Optional skins: the world's push objects replace the crate (art, lines) | 1, owner-gated art | low | 3 |
| 6 | Optional: per-world twists (a rug that slides a crate, a tide that flips a spot), hints and practice boards | 1 | med | 4 |

Each slice follows the migration's method: a characterization test first, a card-check section, `ci-gate`,
a device queue for the phone. Slice 1 may use a worker session; slices 3 and 4 are the first mate's.

## 5. Pay (proposed): by level, no farming

Scale: Play pays 20, the dig 23, Hop 23, higher or lower 21, left or right 30 (`rates.py`). The easy level
is deliberately below Play (it is short), normal matches Hop, hard pays more for the longer solution:

| level | pay | why |
|---|---|---|
| easy | 12 | median solve 14 moves; a warm-up |
| normal | 23 | the same as Hop and the dig |
| hard | 34 | median solve 27 moves, 3 crates; about 1.5 times normal |

(Plus the player-trait bonus `PLAYER_WIN_HAPPINESS` as other games. The numbers are the first draft's; slice 4
sets them in `rates.py` as `SOKOBAN_WIN_HAPPINESS = {easy: 12, normal: 23, hard: 34}`.)

- **Pays by upgrade, once a day:** the day's pay is the highest level solved that day. Solving easy pays 12;
  solving hard later the same day pays the other **22**, so the day's total never passes the hard level's
  34 and a pet that goes straight to hard gets 34 once. Solving a **lower level than one already paid is free
  practice** and pays nothing (the card says so before it opens).
- **Costs:** the shared tail's `PLAY_ENERGY`, `PLAY_HUNGER` and `WEIGHT_GAME` are charged on a **paid** settle
  only (the first solve of the day and each upgrade), so practice is free in both directions.
- **Neat** (within par) pays one find from the pet's world, once a day across all levels (not per level).
- **Saved:** `sokoban_day` holds the day, the highest level paid, and whether neat was paid.
- **Hop:** pays on its own, as it does today. Two daily boards can pay at most 23 + 34 = 57 a day together;
  Q2 asks whether that is too much.
- No loss, and the pay tail is Hop's (`settle_sokoban` beside `settle_hop`).

## 6. Questions for the owner (each with a recommendation)

1. **Q1. Name and the "neat" word.** The owner wants **Sokoban**. Recommendation: use it in code and docs, check the trademark before it is the title on the play screen (plain "Crates" is the fallback), and **neat** for the within-par finish.
2. **Q2. Pay.** Recommendation: the table in section 5 (12 / 23 / 34, paid by upgrade, once a day), with Hop
   paying on its own. (Alternative: share one daily pay between Hop and Sokoban, so two boards cannot pass
   34 a day together.)
3. **Q3. Where it starts.** Recommendation: one "Today's boards" row that opens a two-choice (Hop, Sokoban), so
   the play screen does not grow a row per game; the picker stays as it is.
4. **Q4. Species families.** Recommendation: Sokoban uses its own six specials (section 1) mapped from the same
   six Hop families, so the pet's special stays "its move" across both boards.
5. **Q5. Board size.** Recommendation: 6 by 4 like Hop, and let the slice 1 contact sheet decide whether wider
   cards get 7 by 5.
6. **Q6. Build order.** Recommendation: slice 1 first as a worker task, owner judges the 20 boards, and only
   then the card. If the boards are dull we stop at a cheap point.

## 7. Not verified

- Hop's file and service names, `hop_day` and `shellHop` come from the Hop plan, not from the code at today's
  `origin/main`; slice 1 starts by re-reading `hop.py`, `hop-engine.js`, `card-board.js` and `card-mode.js`.
- The state-space estimate (about 42 000) is arithmetic (24 cells times the ways to place 3 crates), not a run.
- Whether pushes feel good with the eight buttons and the 44 px cell rule is a device-queue item.
- Nothing here touches the director migration's rules: any timer a slice adds goes through the ledger
  (`_later`, `_hold`) and the ratchet test.
