# Plan: Snug, a push-puzzle board for the pet (working title, 2026-11-08)

**Status:** DRAFT 1, 2026-11-08. Plan only (tier 0); no code. The owner asked (2026-11-08) for a minigame at
Hop's level of depth, "sokoban style" but **not** themed as berry-pushing, and something more original.
Everything under "Proposed" is this draft's suggestion for the owner to change; "Questions" lists what needs
an answer before slice 1. Written from `docs/plan-2026-11-02-hop-of-the-day.md` (read sections 0, 2, 6, 7);
file and line cites are **not** yet re-checked against the code, recheck when a slice starts.

## 0. The idea in one paragraph

Each day the pet is given a second small board: a **nook board**. Soft things (the pet's world's "bits") sit on
the floor and the pet pushes them, one cell at a time, into the **nooks** that are marked on the floor. When
every nook is full the room is **snug** and the pet is pleased. It is Sokoban: the pet only pushes, never
pulls, and a bit that is pushed into a corner is stuck. The difference from Hop is the goal: Hop is a path
(visit everything, leave nothing standing); Snug is arrangement (move things to places). It reuses Hop's
board mode, eight shell buttons, keyboard keys, undo, restart, daily seed and "card plays, server replays and
pays" settle, so almost all the new work is one rules engine and its art.

### Why not "berry push", and why not simply "boxes"

The berry is the dig's. A box is Sokoban's. The pet's own things are cushions, shells, pebbles, moss, leaves
and stars, and the game already has a room, a basket, a nest and blankets. Proposed theme: **the pet is
making its corner of the world snug**, with the thing pushed taken from the world:

| world | the bits | the nooks | the pet says when snug (draft) |
|---|---|---|---|
| woodland | moss bundles | hollows in the roots | "cosy ♪" |
| terrarium | smooth pebbles | dents in the sand | "just right" |
| hearth | cushions | the dips in the rug | "all snug ♪" |
| tidepool | shells | rock cups | "tucked in" |
| pond | lily leaves | gaps in the reeds | "nice and calm" |
| nightsky | star-bits | the sky's empty spots | "all in place ♪" |

The mechanic is one rule set; only the sprite and the line change per world, like Hop's art. Working title
**Snug** (alternatives for the owner: Tuck-in, Nooks, Tidy-up, Settle). The title is the only thing the
player sees of the rules, so it is Q1.

## 1. The rules (proposed)

Terrain, one character per cell, boards at most **6 wide by 4 tall** (the card's 44 px cell rule from Hop):

| char | cell | rule |
|---|---|---|
| `.` | floor | walkable, never changes (**no sinking pads here**: that is Hop) |
| `#` | wall | blocked for the pet and for a bit |
| `P` | start | floor the pet starts on |
| `b` | bit | a pushable on floor |
| `n` | nook | floor that wants a bit |
| `B` | bit already in a nook | at the start only if a board has one (the generator may, for a gentle first step) |
| `~` | water or void | blocked, as `#`, drawn differently |

- **Step:** 1 cell up, down, left or right onto a walkable cell with no bit.
- **Push:** stepping toward a bit pushes it one cell the same way, if the cell behind it is floor or a nook
  with no wall and no other bit. Otherwise the step is **illegal** (nothing moves, no cost).
- **Pull:** none. (Hence dead ends exist; see "No loss" below.)
- **Win (snug):** every nook holds a bit. The board ends the moment the last nook fills (no walk to an exit).
- **Par:** the solver's fewest-moves answer plus a slack. A win within par is **neat** (this plan's name for
  Hop's "tidy"; a better word is welcome, Q1). Undo and restart are free and unlimited, as in Hop. The count
  that matters is the move list left after undos.
- **No timing anywhere. No loss.** A stuck board is not a game over: undo one move or restart. The generator
  guarantees every shipped board is solvable (section 3), so "stuck" always means "undo", never "give up".
- **The special move** (the 5th button): each species keeps its family, stage gives uses (baby 0, child 1,
  teen 2, adult 3), as in Hop. The special is one of: **leap** (jump a bit or wall to the cell behind it, no
  push), **tug** (pull the bit in front of you one cell toward you, when the cell behind you is free),
  **nudge** (push a bit sideways one cell without moving), **slide** (push a bit until it stops),
  **swap** (trade places with an adjacent bit), **hop-over-wall** (cross one wall cell). Six families to map to
  the 30 species, as Hop maps its six; Q4 asks whether the same species-to-family map as Hop is used.
  Because every special is a bounded, undoable move, the "free loop" problem from Hop's section 2 needs the
  same proof: **with no pull in the base rules, a push never undoes a push; the only loops are specials, and
  those spend a use**. The solver still raises on a state met twice on one line.

## 2. How it fits the code that exists

Everything below follows Hop's pattern; its names are what the plan says exist and are **to be rechecked**.

- **Engines:** a pure `snug.py` (rules, generator, solver) and its twin `snug-engine.js`, with one shared
  fixture file (`tests/fixtures/snug_cases.json`) both test suites run: boards, move lists, the expected result
  (legal or the first illegal index, snug, neat, final state), as Hop's `hop_cases.json` does.
- **Board service:** Hop's `board` service (ship 2a) serves the day's board. Snug adds a `game` field
  ("hop" or "snug") rather than a second service; the service stays deterministic in (pet, day, world, family,
  specials, game), so every screen of a pet gets the same board.
- **Card:** board mode (`card-board.js`) already draws a grid, takes eight buttons or arrow keys, parks on ✕
  and undoes. Snug needs a second cell vocabulary (bit, nook, push preview) and nothing more in the shell.
  `SHELL_MODES` gets a `shellSnug` slot map: left, up, down, right, special (its cap is the uses left), undo,
  restart, quit (the same as Hop's `shellHop`).
- **Settle and pay:** the card plays locally and sends the move list once; the server replays it on its own
  copy and pays (Hop's section 6). A new `settle_snug` beside `settle_hop` shares the pay tail.
- **Saved state:** one small map per pet, `snug_day` (day, stage, done, neat), plus counts in `games`
  (Hop's `hop_day`). This is a saved field: **tier 2**, as Hop's ship 3a.
- **The play screen:** Hop has a row outside the picker. Snug gets a second row, or one "Today's boards" row
  that holds both (Q3). The picker itself stays as it is (shell-modes D2).
- **Art:** per world one bit sprite, one nook mark, one "snug" pose line. First a CSS stand-in (as Hop's
  early boards), art later through the image pipeline; art is a separate owner-gated step.

## 3. The generator and the solver (the main risk)

A 6 by 4 board is small, which makes the **state space tiny** (24 cells, up to 3 bits: about 42 000 states),
so a plain breadth-first solver finds the optimum in milliseconds. That settles solvability and par. What is
hard is making a board **interesting** rather than trivially solved:

- **Generate by working backwards:** place the bits in the nooks (solved), then apply random legal **pulls**
  (the reverse of a push) for N steps, so the result is always solvable and the solution is at least a little
  long. Reject boards the solver solves in fewer than a minimum number of pushes, boards where a bit starts
  next to its nook with an open line, and boards with no wall that matters.
- **Difficulty by stage:** baby: 1 bit, 4 by 3, no walls that matter, par short. Child: 2 bits. Teen: 2 bits
  and a wall. Adult: 3 bits and a tight corner. The stage sets size and bits as Hop's stage sets size.
- **Two bots as in Hop's section 4** (a random walker and a greedy bot) to check "win easy, neat hard": a
  random walker rarely wins; the greedy bot gets stuck in a corner on a hard board.
- **Dead-state check:** the solver also marks which bit positions are dead (a bit in a corner that is not a
  nook). The card does **not** warn the player (that would solve it for them); a hint is a later slice (the
  Hop plan's ship 5).

**Honest risk:** at most 3 bits on a 6 by 4 board, Sokoban gets hard fast or stays shallow. If the sample
boards are dull the slice-1 acceptance fails and the answer is a 7 by 5 board on wider cards only, or fewer
walls. This is the plan's biggest unknown, so slice 1 ends with the owner judging 20 generated boards on the
bench (the way Hop's art was judged on the bench) before any card work starts.

## 4. Slices

| # | What | Tier | Risk | Depends on |
|---|---|---|---|---|
| 0 | Owner answers Q1-Q6; this plan is folded and gets a review pass | 0 | low | none |
| 1 | `snug.py`, `snug-engine.js`, shared fixtures, generator, solver, two bots, 20-board contact sheet for the owner | 1 | med | 0 |
| 2 | The `board` service takes `game: "snug"`; deterministic per day | 1 | low | 1 |
| 3 | The card: bit and nook cells, push, `shellSnug`, undo and restart, park, keyboard, a CSS stand-in look, bench `view: "board"` for snug | 1 | med | 2 |
| 4 | Settle, pay, `snug_day`, the journal line; a replay test shared with the card's engine | 2 | med | 3 |
| 5 | Skins per world (art, lines) | 1, owner-gated art | low | 3 |
| 6 | Optional: per-world twists (a rug that slides a bit, a tide that flips a nook), hints and practice boards | 1 | med | 4 |

Each slice follows the migration's method: a characterization test first, a card-check section, `ci-gate`,
a device queue for the phone. Slice 1 may use a worker session; slices 3 and 4 are the first mate's.

## 5. Pay (proposed)

- **First snug of the day:** the same 23 happiness Hop pays, **but shared**: the day's first board win of
  either kind pays, the second pays a smaller 10, so two daily boards cannot be farmed for double (Q2).
- **Neat** (within par) pays one find from the pet's world, the way Hop's tidy does, once a day per board.
- No loss, no energy cost beyond what a finished game costs (Hop's tail: `PLAY_ENERGY`, `PLAY_HUNGER`,
  `WEIGHT_GAME`), and it satisfies the `play` need.

## 6. Questions for the owner (each with a recommendation)

1. **Q1. Name and the "neat" word.** Recommendation: **Snug**, with **neat** for the within-par finish.
2. **Q2. Two daily boards: pay.** Recommendation: the first win of each day pays 23, the other board 10.
   (Alternative: both pay 23; farmed at one extra play need per day.)
3. **Q3. Where it starts.** Recommendation: one "Today's boards" row that opens a two-choice (Hop, Snug), so
   the play screen does not grow a row per game; the picker stays as it is.
4. **Q4. Species families.** Recommendation: Snug uses its own six specials (section 1) mapped from the same
   six Hop families, so the pet's special stays "its move" across both boards.
5. **Q5. Board size.** Recommendation: 6 by 4 like Hop, and let the slice 1 contact sheet decide whether wider
   cards get 7 by 5.
6. **Q6. Build order.** Recommendation: slice 1 first as a worker task, owner judges the 20 boards, and only
   then the card. If the boards are dull we stop at a cheap point.

## 7. Not verified

- Hop's file and service names, `hop_day` and `shellHop` come from the Hop plan, not from the code at today's
  `origin/main`; slice 1 starts by re-reading `hop.py`, `hop-engine.js`, `card-board.js` and `card-mode.js`.
- The state-space estimate (about 42 000) is arithmetic (24 cells times the ways to place 3 bits), not a run.
- Whether pushes feel good with the eight buttons and the 44 px cell rule is a device-queue item.
- Nothing here touches the director migration's rules: any timer a slice adds goes through the ledger
  (`_later`, `_hold`) and the ratchet test.
