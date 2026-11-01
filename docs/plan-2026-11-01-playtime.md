# Design note: playtime, the Catch rethink and the slower game (next-stages 2c)

**Status: DECIDED (owner, 2026-11-01): all six recommendations in §5 taken** (drop Catch; build the Berry dig as 4d; slower games only for now; A6 pounce art stays off; ✕ parks the dig, free, no time limit; the dig pays 23). Build: dig + park as one tier-1 PR, then Catch removal (S). Was: for the owner. Docs only; nothing is built. It covers the Catch rethink (FM, Q2) and
4d's slower game (deferred by the owner, 2026-10-30), and it decides whether A6 pounce art
comes back. Sources: `plan-2026-10-31-next-stages.md` (2c, "Deferred", "Withdrawn",
Decided 1-3), `plan-2026-10-28-experience.md` (PR 4d, PR 4f, owner Q9 and A5, the taste
rules), `plan-2026-10-27-feature-gaps.md` C2, and the code at `26b31353`:
`model.py` (`GAMES`, `start_game`, `end_game`, `drop_game`, `play_game`), `rates.py`
(games block), `hatch-pet-card.js` (`GAMES`, `CATCH`, `_pickGame`, `_guess`,
`_catchRound`, `_catchTap`, `_catchResolve`, `_pounce`, `_quitGame`).

**Copy:** every line quoted for the player is a **DRAFT for the owner**, marked "draft".
That includes the game names ("Berry dig", "Pounce"), the button labels (keep/dig,
pounce/creep) and Pounce's tell glyphs ("z", "!"): all working names and drafts. No other
copy is proposed.

**Odds:** worked out exactly (dynamic programming over every game state) in scripts kept
outside the repo. Higher or Lower was also checked by playing 20,000 games through the real
`model.play_game`. "Best" = the best possible policy, "random" = a coin flip at every
choice, "naive" = the best simple fixed rule a player might settle on.

## 1. What is there today

| Game | Where it runs | What the player does | Win | Best play | Random play | Pays |
|---|---|---|---|---|---|---|
| Left or Right | server (`play_game`, `left_right`) | guess where the pet goes, 5 rounds | 3 of 5 | **50%** (pure luck) | 50% | win 30, loss 12 |
| Higher or Lower | server (`higher_lower`) | guess whether the next number (1-9, never the same) is higher or lower | 3 of 5 | **95.4%** (measured: 20,000 games through the real model; guess the larger side, coin flip on 5) | 50% | win 21, loss 12 |
| Catch (prototype) | card only, behind `experimental_catch` | tap the side a rolling toy comes from, in the last part of its trip; leave a bee alone (from round 2, 1 in 4) | 3 of 5 | **100%** (a bee is won by not tapping; a well-timed tap always catches) | n/a (timing) | nothing; a browser-wide best on status |

- `rates.py` and feature-gaps say Higher or Lower is "about 92%". That looks like a
  rough estimate: the exact figure is 95.4%. The payout reasoning in the `rates.py`
  comment still holds: 0.954 × 21 + 0.046 × 12 = 20.6, not below Play's 20.
- **Catch, owner 2026-10-31: "doesn't seem like a strong game".** It stays card-only and
  not counted (PR 4f withdrawn). Why it is weak, as the code stands:
  - No choice. The only decision is "bee or not", which is plain to see. Everything else
    is timing, and the windows (1.2 s down to 0.6 s, the last part of a 1.9 s to 1.0 s
    trip) are wide. Giga Pets players called the original "almost impossible to lose".
  - Nothing is at stake: no reward, no count, a best kept per browser, not per pet.
  - The pet is a spectator until the catch. It only reacts at the end (`_pounce`: the child's
    `won` pose, else a hop or the cheer frames). That is the beat A6 pounce art was for.
  - We have no human numbers. It counts nothing, so the only evidence is the owner's word.

### The 70-80% rule: what it binds

- **A5 set 70-80% for the slower game only** (owner, 2026-10-28: "best play wins 70-80%;
  Higher or Lower stays as it is"). It binds the slower game below, and any game that
  takes Catch's place in the picker. It only *describes* the three games above: Left or
  Right is luck (50%), Higher or Lower is mostly solved (95%), and Catch is 100% for best play.
- **A reflex game can't be held to it by best play**, because perfect timing always wins.
  If a reflex game is kept (option A), its rule has to be a model of a typical player instead:
  a timing bot with a set tap jitter. That is a weaker promise, and it should be the owner's
  call.
- **A free ✕ breaks the rule unless the game is parked.** Decided Q1 makes a person's ✕
  free, before or after a guess, and `end_game` clears the game. So the next start deals a
  fresh one. A player who quits whenever a game goes badly and starts again wins
  **every finished game in the long run**. Worked out for Higher or Lower, the dig and
  Pounce: each goes to 100% per finished game. The rule only means something if ✕ can't
  reroll the game. The shape that keeps ✕ free:
  - **Park, don't end.** A person's ✕ parks the game on the server **once it has shown
    anything that bears on play**: after a guess, or, in Pounce, as soon as a toy's mood is
    shown. Parked are the round, the score, and the pile or the toy's mood. There is one parked
    game per kind, like Higher or Lower's kept opening (`state.opening`). (The dig's
    fresh pile shows nothing, so a ✕ before its first tap can simply end it.) The next start of that kind carries on from
    it. No time limit, so waiting gains nothing. Starting another kind doesn't touch it.
  - It costs and earns nothing, as ✕ does now. The server's own drops (idle, asleep,
    away) stay losses (`drop_game`), as Decided 1 says.
  - The build's simulation then needs no quitting player: a parked game resumes in the
    same state, so quitting can't change the odds.
- **Found while writing (not for this note to fix):** both server games can be fished
  this way today. **Left or Right** (✕ after a losing guess, and the next guess deals a
  fresh game) pays the most of any game (30 a win). **Higher or Lower** (✕ after a guess,
  then Play: a fresh number) pays 21. Neither is held to the rule, but both belong in the 1g
  tuning review.

## 2. The slower game (4d): Berry dig

4d's sketch, given numbers. Best play lands at 76% and random play 35 points below it.
The right stop depends on the round and what is banked, so care helps and no fixed rule
plays it well.

**What the player does.** Five rounds. Each round the pet faces a fresh leaf pile hiding
**6 berries and 2 bees**. **Dig** (right) turns one leaf over: a berry goes in this
round's basket, a bee scares off **this round's** berries and ends the round. **Keep**
(left) banks the basket and ends the round. **Win at 5 berries banked.** The pile shows how
many leaves are left; the score shows banked and basket.

- Draft lines (owner decides): prompt "dig or keep?"; a bee "bzz! the berries rolled away";
  a keep "safe in the basket ♪".

**Odds** (6 berries, 2 bees, 5 rounds, win at 5):

| Play | Wins |
|---|---|
| best | **76.4%** |
| random (coin flip each choice; keep isn't offered on an empty basket, so a round's first tap is a dig) | 41.7% (34.7 points less) |
| naive: always keep at 3 | 58.5% |
| naive: always keep at 2 | 56.7% |
| naive: always keep at 1 | 23.7% |

Best play's stop point (keep when the basket holds this many), by round and banked:

| banked → | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| rounds 1-2 | 2 | 2 | 2 | 1 | 1 |
| round 3 | 3 | 2 | 2 | 2 | 1 |
| round 4 | 3 | 3 | 3 | 2 | 1 |
| round 5 | 5 | 4 | 3 | 2 | 1 |

Other piles tried: 5 berries/2 bees, win at 4, gives 80.4% best but 78.1% for "keep at 2",
so a fixed rule plays it almost perfectly. 6/3 at 4 gives 72.1% best, 69.1% naive. **6/2 at 5 is
the pick**: it has the widest gap between thinking and a habit.

**Server.** A new `GAMES` kind, `"dig": ("keep", "dig")`, so it fits `.gl`/`.gr` and
`play_game`'s guess shape. `Game` gains the bank, the basket and the pile left. These are
new save fields; an old save loads with the defaults. Each dig is drawn and settled **in
the same call**, so closing the card can't undo a bee. The game ends after round 5 or once
5 are banked. It is about **10 calls a game** under best play, against 5 for the other
games. That is fine at one tap each, but each tap waits on a round trip ("thinking…").
✕ parks the game (§1).

**Card.** Two buttons labelled keep/dig, the pile and basket in the existing pixel digits
(`digit()`), and the bee reusing Catch's `ui/catch_decoy_1/2.png`. Turn-based: nothing moves,
so it is the same under reduced motion. `acts.ready` at the start, `aww` on a lost game,
cheer on a win: all hooks that exist.

**Pays.** At 76%, today's skill payout (win 21, loss 12) expects 18.9, below Play's 20.
A win needs **at least 23** (0.764 × 23 + 0.236 × 12 = 20.4). The player-trait bonus
comes on top as for the others. The number is the owner's (Q6).

**Build Done (as 4d said):** a pytest plays best play over many seeded games and asserts
70-80%, and random play at least 20 points less. Plus the park test: ✕ then start resumes
the same pile.

- **Cost:** M-L, tier 1. Server about 120 lines plus tests (the kind, three `Game`
  fields, the settle, park/resume, the simulation). Card about 100 lines (the view, the
  labels, the score line), a card-check step, a bench `game: "dig"` shot. **Art: none**
  for a first cut. Berry and leaf props can come later from the Hatch API Art session.
- **A6 pounce art: no.** The dig doesn't need it. A later polish could play a pounce into the
  pile on each dig, but that is not part of this proposal.

## 3. Catch: three ways forward

### A. Rework Catch (keep a reflex game)

**What the player does.** A round is a short volley instead of one toy: three things
drift in one after another from either side, sometimes overlapping, toys and bees mixed.
Tap a toy's side as it reaches the pet, and let the bees by. The score counts toys caught
over five volleys. The choice comes back under time: two things on one side, a bee
on the side you were about to tap. It becomes C2-full: the start call deals the
volleys, one finish call reports `caught: n`, it pays and counts like the others, and there
is a per-pet best.

- **Odds.** Best play is still 100%. The 70-80% would be held by a timing bot (a tap
  jitter of, say, ±120 ms around the window's middle) in a card-check run. That is a model
  of a person, not a proof, and it is the weakest promise of the three options.
- **✕:** card-timed, so a park means the server keeps the dealt volleys and the next
  start replays from the volley where it stopped.
- **Cost:** L, tier 2 (a server game, a save field, a trusted card count). The card
  rewrites `_catchRound`/`_catchTap`/`_catchResolve` (about 9015-9175) for overlapping
  props. Server: feature-gaps C2's start/finish calls. Art: the shared decoy prop from the
  Hatch API Art session (the bee stand-in exists).
- **A6 pounce art: yes.** The pounce is the payoff, about 90 PNGs as each pose slice.
- **Risk:** it keeps the thing the owner found weak, speed, and hopes more of it fixes it.

### B. Replace Catch with Pounce (a slow, pet-first game)

**What the player does.** The pet stalks its toy across the screen. Each round the toy
starts 3 steps away and shows a tell: **dozy** or **alert**. **Creep** (right) moves one step
closer and risks spooking it, which loses the round. **Pounce** (left) jumps now. The closer
the pet is, the surer the catch. 5 rounds, catch 3.

- Draft lines (owner decides): dozy "it's nodding off…"; alert "its ears are up!"; spooked
  "it rolled away!"; caught "got it!" (Catch's own line).
- **Numbers.** A pounce lands at 45% / 75% / 95% from 3 / 2 / 1 steps. A creep spooks a
  dozy toy 5% then 10%, and an alert one 40% then 60%.

| Play | Wins |
|---|---|
| best | **73.5%** |
| random | 50.1% (23.4 points less) |
| naive: always creep to 2, then pounce | 65.0% |
| naive: always creep all the way | 53.8% |

- **Honest about depth:** best play is one rule, "creep all the way when dozy, pounce at
  once when alert", whatever the score. It is 8.5 points over the best habit that ignores the
  tell. So the skill is reading the pet's quarry, learned once. It passes the rule. It is a thinner
  game than the dig, though more about the pet, which suits the owner's taste.
- **Server.** A `GAMES` kind `"pounce": ("pounce", "creep")`. `Game` gains the distance
  and the round's mood (new save fields). Each call is settled on the server. About 2
  calls a round. ✕ parks (§1), keeping the mood already shown.
- **Card.** The `.gcatch` element shows the toy at three fixed spots (the calm Catch spots
  are a start: `CALM_FAR`, then nearer), and the tell as a small glyph ("z" or "!") beside it.
  Nothing slides, so it is the same under reduced motion. The prototype's timing code goes.
- **Pays.** As the dig: a win needs at least 23 to meet Play's 20 (0.735 × 23 + 0.265 × 12 = 20.1).
- **Cost:** M, tier 1. Server about 100 lines plus a simulation test. Card: about 160 lines of
  Catch out, about 90 in. Art: none needed (the species' `play` prop is the toy).
- **A6 pounce art: yes.** It is the payoff of every caught round. Without it, the child's
  `won` pose or the cheer frames stand in, as `_pounce` does now.
- **Either Pounce or the dig could be 4d's slower game.** Both would make two new games. One
  is enough for now (Q2).

### C. Drop Catch

**What the player does.** Nothing: the picker keeps Left or Right and Higher or Lower,
plus the dig if it is built.

- **Odds:** n/a. The default picker already has no reflex game (Catch is behind
  `experimental_catch`), so nothing changes for most players. Dropping it does mean Q9's
  "a mix of reflex and slower games" would not be met for now (Q3).
- **Cost:** S, tier 1, removal only:
  - in `hatch-pet-card.js`: `CATCH_GAME`, `CATCH`, `CALM_FAR`, `BEST_CATCH_KEY` (104-118),
    `BEE_FLAP_MS`, the `.gcatch` element and its CSS, `_catchRound`/`_catchTap`/`_catchResolve`
    (about 9015-9130), the `catch` branches in `_pickGame`, `_guess` and `_gameView`, and
    status's "best catch" row;
  - elsewhere: the bench `catch` field, card-check's Catch steps (the `play` section and the
    calm-Catch checks), and guide lines 72 and 99.
  - Keep `BEE_FRAMES` and `catch_decoy_*.png` if the dig is built (its bee). `_pounce`
    goes or becomes the dig's win beat.
- **A6 pounce art: no.** Nothing would play it.

### Side by side

| | A. Rework | B. Pounce | C. Drop (+ dig) |
|---|---|---|---|
| Kind of play | reflex | slow, one tell | slow, push-your-luck |
| Meets 70-80% | only by a timing model | yes, 73.5% (random 50%) | the dig: yes, 76.4% (random 42%) |
| Counted and pays | yes (C2 full) | yes | the dig: yes |
| Reduced motion | slowed, two steps (as now) | same game, nothing moves | same game, nothing moves |
| Size, tier | L, 2 | M, 1 | S, 1 (+ the dig M-L, 1) |
| New art | decoy prop + A6 | A6 (stand-ins work) | none |
| A6 pounce back | yes | yes | no |

## 4. Recommendation

**Drop Catch (C) and build the dig as the slower game (4d).** The dig is the only shape here
whose skill isn't a single lesson. It meets the rule with the widest margins, needs no art, and
reuses the bee. Catch's weakness is the reflex idea itself, so A puts L-size work into the thing
the owner found weak. **Pounce stays on file** as the pet-first game to add later if the picker
feels thin. If it is built, A6 comes back with it. **A6 stays off the Luna queue.**

Build order if the owner agrees: (1) the park-on-✕ rule for the new kind, and the dig, as one
tier-1 PR held to its simulation; (2) the Catch removal as an S PR, at any time: Catch is
only offered with `experimental_catch`, so the default picker (two games) doesn't change.

## 5. Owner questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Catch: rework, replace or drop? | A rework (reflex volley, C2 full) · B replace with Pounce · C drop | **C, drop**: its weakness is the reflex idea, and the dig covers playtime |
| Q2 | The slower game (4d, deferred 2026-10-30): build one now, and which? | the dig · Pounce · both · not yet | **The dig** (6 berries, 2 bees, win at 5: 76% best, 42% random), one game first |
| Q3 | Revise Q9's "a mix of reflex and slower games" to slower games only, for now? (The default picker has no reflex game today; Catch is the only one, behind an option) | yes, for now · keep a reflex game (A) | **Yes for now**: revisit if the play counts show people want speed |
| Q4 | A6 pounce art back on the Luna queue? | yes · no · only with Pounce or a reworked Catch | **No**: only if B or A is built |
| Q5 | A person's ✕ in the new game: park it so the next start carries on (still free)? | park, no time limit · park for 30 min · end it as today | **Park, no time limit**: otherwise a free ✕ rerolls every bad game and the 70-80% means nothing |
| Q6 | The new game's win payout (Play pays 20; Higher or Lower 21 at 95%) | 23 · 25 · as Higher or Lower (21) | **23**: the lowest that expects at least Play's 20 at 76% |
