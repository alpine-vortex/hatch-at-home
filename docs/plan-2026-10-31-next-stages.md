# Next two stages, 2026-10-31 (plan; reconciled against git)

Base: `fm-batch6c` @`b57149da` (main + batch 6). The plans were reconciled against git
the same day (one commit per plan on `crew/hatch-at-home-s2570-…`). Labels used:
**released** = in a tag up to v0.38.0; **main** = on main since v0.38.0, unreleased (batches 4-5 and Waves 2-3); **batch 6** =
`fm-batch6c`, still gating. Release 0.39.0 follows batch 6.

**The owner's priority (2026-10-31):** reactions, visitors and playtime are "where the
connections really shine". **Art merges with the code that plays it.** Every copy line
below is PROPOSED unless marked approved.

**Answers folded in (2026-10-31).** "(owner)" marks the owner's own calls and "(FM)" the
first mate's. They are listed under "Decided" at the end.

## Where things stand

- **Built:** experience Waves 0-3, 4c-rest and 4e. R1 (eat and cheer) and R2: hooks for
  pat, refuse, aww, ready and splash, each with a fallback. Personality P1-P4. Visitors v1
  with its catch-up line and final art. Winter lights with stand-in art and the "holiday
  names" toggle. ✕ ends the game on the server, free (owner, Q1). Bond connections, voices
  phases 1-5 and device charm Parts 1-4.
- **Deferred by the owner (2026-10-30):** 4a, 4b, 4d and the forms book. These stay
  deferred. 4g is unbundled from the forms book (FM, Q8) and is slice 2e.
- **Withdrawn:** 4f, Catch as a normal game (FM, Q2). The Catch rethink is in 2c.

## Stage 1: land what's in flight, art-only pose slices, winter before 1 Dec

| # | Slice | Size | Tier | Art | Art queued? | Needs |
|---|---|---|---|---|---|---|
| 1a | Batch 6 lands; release 0.39.0 | S | 0 (FM) | none | — | the batch 6 gate |
| 1b | **Refuse poses**: PNGs + `acts.refuse` in each `species.json`; card-check `react`, bench sheet | S | 1 | ~90 (87 planned) | **yes, drawing** (`art-128-refuse`, one world per commit) | 1a |
| 1c | **Aww poses** (a lost game), as 1b | S | 1 | ~90 | yes, next | 1a |
| 1d | **Ready poses** (game start), as 1b | S | 1 | ~90 | yes | 1a |
| 1e | **Splash poses** (clean's last beat), as 1b | S | 1 | ~90 | yes | 1a |
| 1f | **Winter lights final art**: swap the 16 stand-ins; re-run `costume-preview.js winter` (the earmuffs' sink) | S | 1 | ~16-25 | yes, after the wave (2a) | 1a; **must be in a release before 1 Dec** |
| 1g | Tuning review (HANDOFF item 4, about 2026-11-03): read the owner's diagnostics against `rates.py`, propose numbers | S | 0, then 1 | none | — | the owner's diagnostics |

- 1b-1e are **art-only slices**. R2's hooks and fallbacks are already on main (`f663533d`),
  so no code slice is planned for them. Each world's art merges with its `acts` entry.
- **The Luna queue (owner, Q7):** refuse, aww, ready, splash, **wave**, then winter's final
  art. A6 pounce is off the queue until 2c (FM, Q3). **Winter jumps ahead if the poses
  aren't done by about 20 Nov** (FM, Q11), so it is in a release before 1 Dec.
- The old 1g (a rule for ✕ after a guess) is dropped: ✕ is free always (owner, Q1).

## Stage 2: connections (reactions, visitors, playtime)

Order (owner, Q7): **the wave pose first**, then kindred pairs.

| # | Slice | Size | Tier | Art | Queued? | Needs |
|---|---|---|---|---|---|---|
| 2a | **BUILT (v0.39.x).** World visitors' greet plays the species' existing `waves` frames (the link greeting's loader and fallbacks, `_linkPose`); no `acts.wave`, no new art (the wave art already existed). The baby's visitor catch-up line "hi hi! ♪" (owner, Q9) shipped with it. Seasonal visitors keep their startle/perk | S | 1 | 0 (was ~90: the art existed) | no | none |
| 2b | **Kindred pairs + persona link lines**: one extra line when a kindred pair links (personality "Later"), and each type's link-line variants (device charm "Left"); card only, nothing counted (FM, Q6) | M | 0 copy plan (`plan-2026-11-01-kindred-pairs.md`, 45 PROPOSED lines, 5 owner questions), then 1 | none | — | the owner picks the PROPOSED lines first (new lines stay proposals, Q4) |
| 2c | **Playtime design note**: the Catch rethink (FM, Q2) and 4d's slower game in one note (shapes, odds, the 70-80% rule); decides whether pounce art comes back | — | 0 | none for the note | — | — |
| 2d | **Visitors v2 plan** (finds, basket, collection, gifts: check-ins item 1), from v1's 18-visitor roster; plan in stage 2, build after (FM, Q10) | — | 0, then an L/tier-2 build | ~60 finds | no | the seed moves to the server |
| 2e | Older generations (4g), unbundled from the forms book (FM, Q8) — **built** (s2574) | S | 1 | none | — | — |

**Dependencies.**
- 2a: built, needing no art (the wave frames already existed in `species.json` "waves").
  It no longer gates 1f.
- 2b reads the built personality (P1-P3) and the infrared link (D6). It has no server or
  save change.
- 2d: v1 picks the visitor on the card and saves nothing. A collection can't credit a
  visit until the server owns the day's seed, so this is the plan's first design point.
- 2e touches the same `_renderJournal` code as the forms book's PR 2a. Whichever ships
  second rebases. **2e is built:** `_renderJournal` now keeps `every` (all records plus
  now), `past = every.slice(-4)` for the line and `older` for the link; the species-name
  load covers `every`, and `line(p)` is the per-generation renderer. If 2a restyles the
  family line, keep those three names and the `.jolder`/`.jmore` nodes, or card-check
  2e fails.

## Decided (2026-10-31)

1. **✕ is free always** (owner), before or after a guess. 0f's "a dropped game with a guess
   is a loss" no longer applies to a person's ✕; it still applies to drops the server
   makes (idle, asleep, away). As built in `f1e90a9a`; no slice.
2. **4f withdrawn** (FM); the Catch rethink goes in 2c.
3. **A6 pounce off the Luna queue until 2c** (FM; done).
4. **The shipped personality lines are approved as shipped** (owner, 2026-10-31). New lines
   stay proposals.
5. **Bond connections kept as built** (owner): no separate send-off switch, quiet mode on
   for everyone with "notify me", the same dream choices in every world. The old
   questions are closed.
6. **No counts between pets** (FM): kindred pairs and "neighbours talking" are flavour from
   the day's link only.
7. **Stage 2 starts with the wave pose** (owner), ahead of kindred pairs. The Luna queue is
   refuse, aww, ready, splash, wave, then winter's final art.
8. **4g unbundled** from the forms book (FM).
9. **The baby's visitor catch-up line: "hi hi! ♪"** (owner, approved).
10. **Visitors v2:** plan in stage 2, build after (FM).
11. **Winter jumps the queue** if the poses aren't done by about 20 Nov (FM, as recommended).
