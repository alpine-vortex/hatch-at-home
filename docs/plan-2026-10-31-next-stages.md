# Next two stages, 2026-10-31 (plan; reconciled against git)

Base: `fm-batch6c` @`b57149da` (main + batch 6). The plans were reconciled against git
the same day (one commit per plan on `crew/hatch-at-home-s2570-…`). Labels used:
**released** = in a tag up to v0.38.0; **main** = on main since v0.38.0, unreleased (batches 4-5 and Waves 2-3); **batch 6** =
`fm-batch6c`, still gating. Release 0.39.0 follows batch 6.

**The owner's priority (2026-10-31):** reactions, visitors and playtime are "where the
connections really shine". **Art merges with the code that plays it.** Every copy line
below is PROPOSED.

## Where things stand

- **Built:** experience Waves 0-3, 4c-rest and 4e. R1 (eat and cheer) and R2: hooks for
  pat, refuse, aww, ready and splash, each with a fallback. Personality P1-P4. Visitors v1
  with its catch-up line and final art. Winter lights with stand-in art and the "holiday
  names" toggle. ✕ ends the game on the server. Bond connections, voices phases 1-5 and
  device charm Parts 1-4.
- **Deferred by the owner (2026-10-30):** 4a, 4b, 4d, 4g and the forms book. These stay
  deferred here. Only 4g comes back, as a question (Q8).
- **On hold:** 4f (Catch as a normal game), by the owner's Catch call (Q2).

## Stage 1: land what's in flight, art-only pose slices, winter before 1 Dec

| # | Slice | Size | Tier | Art | Art queued? | Needs |
|---|---|---|---|---|---|---|
| 1a | Batch 6 lands; release 0.39.0 | S | 0 (FM) | none | — | the batch 6 gate |
| 1b | **Refuse poses**: PNGs + `acts.refuse` in each `species.json`; card-check `react`, bench sheet | S | 1 | ~90 (87 planned) | **yes, drawing** (`art-128-refuse`, one world per commit) | 1a |
| 1c | **Aww poses** (a lost game), as 1b | S | 1 | ~90 | yes, next | 1a |
| 1d | **Ready poses** (game start), as 1b | S | 1 | ~90 | yes | 1a |
| 1e | **Splash poses** (clean's last beat), as 1b | S | 1 | ~90 | yes | 1a |
| 1f | **Winter lights final art**: swap the 16 stand-ins; re-run `costume-preview.js winter` (the earmuffs' sink) | S | 1 | ~16-25 | yes, after the poses | 1a; **must be in a release before 1 Dec** |
| 1g | ✕ after a guess: the rule the owner picks (Q1) | S | 1 | none | — | Q1 |
| 1h | Tuning review (HANDOFF item 4, about 2026-11-03): read the owner's diagnostics against `rates.py`, propose numbers | S | 0, then 1 | none | — | the owner's diagnostics |

- 1b-1e are **art-only slices**. R2's hooks and fallbacks are already on main (`f663533d`),
  so no code slice is planned for them. Each world's art merges with its `acts` entry.
- A release of 1b-1f together (0.40.0) before 1 Dec is the date that matters. Your Luna
  order puts reactions before the seasonal set; if the pose art runs late, whether winter
  jumps the queue is Q11.

## Stage 2: connections (reactions, visitors, playtime)

| # | Slice | Size | Tier | Art | Queued? | Needs |
|---|---|---|---|---|---|---|
| 2a | **Kindred pairs + persona link lines**: one extra line when a kindred pair links (personality "Later"), and each type's link line variants (device charm "Left"); card only | M | 0 copy plan, then 1 | none | — | Q4, Q6; the owner picks the PROPOSED lines first |
| 2b | Visitor catch-up for a baby: the `BABY.visit` babble, e.g. PROPOSED "hi hi! ♪" | XS | 1 | none | — | Q9; fold into 2a's ship |
| 2c | **Playtime design note**: the Catch rethink and 4d's slower game in one note (shapes, odds, the 70-80% rule) | — | 0 | none for the note | — | Q2, Q3 |
| 2d | A **wave** pose for the link greet and visitors (device charm Q6; visitors §6 "later `acts.wave`"): `acts.wave` + one `STAGE_POSES` entry | S | 1 | ~90 | **no** | the owner's yes; it goes into the Luna queue after winter |
| 2e | **Visitors v2 plan** (finds, basket, collection, gifts: check-ins item 1) | — | 0, then an L/tier-2 build | ~60 finds | no | Q10; the seed moves to the server |
| 2f | Older generations (4g), unbundled from the forms book | S | 1 | none | — | Q8 |

**Dependencies.**
- 2a reads the built personality (P1-P3) and the infrared link (D6). It has no server or
  save change.
- 2d's art merges with its hook.
- 2e: v1 picks the visitor on the card and saves nothing. A collection can't credit a
  visit until the server owns the day's seed, so this is the plan's first design point.
- 2f touches the same `_renderJournal` code as the forms book's PR 2a. Whichever ships
  second rebases.

## Open owner questions (each with a recommendation)

1. **✕ after a guess.** `end_game` (batch 6, `f1e90a9a`) ends a game for free even after a
   guess. PR 0f made "a dropped game with a guess" a loss, so a losing game can't be quit
   and restarted to farm records, bond points or dream seeds. *Recommend:* ✕ stays free
   before the first guess and counts as a loss after one, as a drop does (1g). No new copy.
2. **Catch vs Q9/A4.** On 10-28 you decided "Catch ships as a normal game" (4f). On 10-31
   you said it "doesn't seem like a strong game". *Recommend:* 4f is withdrawn. Catch stays
   card-only until the rethink, which becomes 2c's design note rather than a separate task.
3. **A6 pounce art** (queued last for Luna) only plays in Catch, and there's no hook for it.
   *Recommend:* take it off the queue until 2c settles Catch's future, and put the wave
   (2d) in its place if you want it.
4. **Personality lines.** The plan says the tables were approved on 10-28 and shipped
   verbatim, and also says all 307 lines are still proposals. *Recommend:* treat the
   shipped tables as approved, and mark any line you want changed as you meet it.
5. **Bond connections "as built".** There's no separate send-off switch, quiet mode is on
   for everyone with "notify me", and the dream choices (stars, the sea, snacks, you) are
   the same in every world. *Recommend:* confirm all three as built.
6. **Pet friendships.** Check-ins item 5 counts visits ("best friends" at a few), but the
   infrared link's rule is no friendship meter or visit counts. *Recommend:* keep the
   link's rule. Kindred pairs and "neighbours talking" stay flavour from today's link
   only, with nothing counted.
7. **Stage 2 order.** *Recommend:* 2a first (no art, card only, it uses what's built and
   it's the "connections" you named), with 2c's note written alongside. Then 2e's plan.
8. **Older generations (4g)**: unbundle it from the deferred forms book? *Recommend:*
   yes. It's small, it's on your interest list, and its only tie to the forms book is
   one shared function.
9. **Baby visitor catch-up.** It's plain for now. *Recommend:* a babble line, e.g.
   PROPOSED "hi hi! ♪", in 2b.
10. **Visitors v2.** *Recommend:* write the plan in stage 2 (server seed, basket of 3,
    collection, gifts) starting from v1's 18-visitor roster, and build it after stage 2.
11. **Winter vs the poses, if the art runs late.** Your Luna order is reactions first, then
    the seasonal set, and the queue was estimated at about 3 days. *Recommend:* keep your
    order. If by about 20 Nov the poses aren't done, winter's art jumps ahead so it can be
    in a release before 1 Dec.
