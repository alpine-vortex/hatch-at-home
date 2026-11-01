# Plan: gaps and seams (the review's non-Top-10 items)

**Status: built 2026-11-01** (§4c). Left: spring/summer (8, a plan in Feb) and a level-5
bond unlock (a later bond plan, Q8).

Source: the fresh-eyes review `~/.local/state/crew/research/gaps.md` (and `features.md`), at
origin/main `dcbb8367` (0.41.0), 2026-11-01. The review's Top 10 belongs to another agent; where one
of my items touches it, I cross-reference it and leave it to them. Code is named by function;
the card is `custom_components/virtual_pet/frontend/hatch-pet-card.js`.

Every player-facing line below is a **DRAFT** until the owner approves it. Nothing ships
that isn't approved here.

## 1. Coverage: every (a)/(b)/(c) bullet in the review

| Review bullet | Owner of it | Note |
|---|---|---|
| a1 no nudge to connect the house | Top-10 #2 | — |
| a2 phone calls never suggested | Top-10 #1 | — |
| a3 no overall collection | Top-10 #8 | — |
| a4 few ways to play | Top-10 #5 | also `plan-2026-11-01-playtime.md` |
| a5 no visual for weight | **mine, §2.2** | |
| a6 finds half-visible | Top-10 #7 | — |
| a7 no winter phone greeting | **mine, §2.3** | plus a seam the review missed (holiday names never reach phones) |
| a8 no spring or summer | **mine, §2.8** (plan only) | already sketched in `plan-2026-10-28-daily-checkins.md` l.213-217 |
| a9 card editor: devices only | **mine, §2.7** | |
| a10 Assist status is thin | **mine, §2.6** | |
| b visitors/finds/gifts an island | Top-10 #6 | — |
| b read-only stats inside settings | Top-10 #4 | — |
| b "earned" shells not earned | Top-10 #9 | — |
| b personality reaches half the voice | **mine, §2.4** | **finding mostly wrong**, see there |
| b two ways in, three levels deep | dropped | the real pain is "notify me" being deep, which is Top-10 #1. The layering is otherwise consistent; no slice. |
| b two kinds of "settings" | Top-10 #2 (card link) + #10 (guide wording) | nothing left for me once #2 shows "what I notice" from the card. **Suggestion to #10:** the guide says "card settings (the gear)" vs "what *pet* notices (Home Assistant)". |
| b two paths for a family screen; tablet greeted by first name | Top-10 #3 | — |
| b temperament never shown, upbringing a word | **mine, §2.9** (recommend no change) | the upbringing "why" is Top-10 #4 |
| b tone is consistent | — | a strength, nothing to do |
| b docs drift | Top-10 #10 | includes the guide's stale "idle chatter and mood line keep the usual words" (l.578), see §2.4 |
| c readability of page 2 | Top-10 #4 | — |
| c first-week arc | **mine, §2.1** | the review's "flat" is a guess; corrected by the beat table |
| c care feedback loop | Top-10 #4 | — |
| c multi-pet value | **mine, §2.5** | |
| c release hygiene for hidden features | Top-10 #7 | — |
| catalog: hidden beetle | **mine, §2.10** (recommend no change) | not player-visible |

## 2. Items, ranked by player impact

Ranked by how many players meet it and how often. §5 gives the build order, which differs
only because the winter greeting has a date.

### 2.1 First-week arc: days 6-13 (every player, week 1-2)

**Problem, checked against rates.** The review guessed days 6-13 feel flat. Bond levels
alone say otherwise for an engaged player, but not for a light one. Points a day: a look 2
(`BOND_VISIT_POINTS`), care and games up to 8 together (`BOND_DAILY_LIMIT`), the wish 3.
Levels need 0, 4, 10, 20, 34, 52, 75, 105, 145, 200 (`BOND_LEVELS`).

| Day a level is reached | 13/day (everything) | 10/day (look + care/games) | 5/day (look + a little care) |
|---|---|---|---|
| L4 nickname, birthday question | 2 | 2 | 4 |
| L5 (no unlock) | 3 | 4 | 7 |
| L6 favourite game | 4 | 6 | 11 |
| L7 catchphrase | 6 | 8 | 15 |
| L8 hearts | 9 | 11 | 21 |
| L10 photo | 16 | 20 | 40 |

Fixed beats: hatch (30 min), child (day 1), teen + personality reveal + shells (day 5),
adult (day 14), first monthly birthday (day ~30). Daily: wish, dream, questions (L2+),
visitors 4 days in 7.

So an engaged player has a bond beat every 2-3 days through week 2. A light player, or a
household that splits care across several logins (each bond fills on its own), gets the
teen beat on day 5 and then nothing marked until adult on day 14. Nothing tells anyone that
adult is coming: the header says "day 9", never "grown up in 5 days". (Bond level 5 has no
unlock; see Q8.)

**Proposal (card only, zero art).**
- **1a. A countdown on status.** A row under the personality/upbringing rows, from
  `life_stage` `age_days` and the stage starts (`STAGE_STARTS`: child 24 h, teen 120 h,
  adult 336 h; mirrored as a card constant like `TRAIT_CAP`). Shown for child and teen
  only. "About" because ageing pauses while away.
- **1b. A one-week moment.** On the first look at or after `age_days` 7, the pet says a
  line once (a KEPT line; once per pet and generation per browser, a localStorage key like
  `oncePerDay`'s; nothing saved on the server).

**Lines (DRAFT).**
- 1a row: label `grows up`, value `in about N days` / `tomorrow` (teen → adult);
  label `next`, value `teen in about N days` / `teen tomorrow` (child → teen).
- 1b: `one week old today! ♥`, `a whole week together! ♥`. Baby talk: none needed (a
  day-7 pet is a teen).

**Slices.** 1a S, tier 1. 1b S, tier 1. **Art:** none.

### 2.2 Weight: make snacks → heavy → sick readable (every player who snacks)

**Problem, checked.** Weight shows only as `54 · just right` on status (`weightLabel`).
Heavy (>75, `WEIGHT_HEAVY_ABOVE`) stops healing and adds a sickness risk (`_sickness`,
cause `weight`). The card never learns the cause: `became_sick` is in `MOMENT_BARE`, so its
public moment drops it. Snacks are never refused for weight. The review's guess stands:
nothing links "sick" to "too many snacks".

**Proposal (card only, zero art), from the public `sensor.weight`.**
- A heavy pet's snack gets a weight line instead of the normal snack line, half the time.
- The status weight row adds a short hint when out of band.
- The "would like" row (`WANT_WORDS`) offers a game when heavy and nothing more urgent is
  wanted (games and play burn weight, `WEIGHT_GAME`/`WEIGHT_PLAY` -3).
- **Not** inferring the sickness cause from the band: a heavy pet sick from old poop would
  be blamed on snacks. Saying the cause needs a server/privacy change (Q3).
- A sprite "round" look: see Q2. A non-integer scale on pixel art doubles some pixel
  columns, so I recommend no squash in v1.

**Lines (DRAFT).**
- Heavy snack: `one more and I'll be round as a ball!`, `*pats tummy* getting a bit round...`
- Status hint: `54 · just right` unchanged; `81 · a bit heavy · snacks add up`;
  `19 · a bit light · a meal would help`.
- Would like (heavy): `a game, to run it off`.

**Slices.** 2a S, tier 1. **Art:** none (a "round" pose would be ~90 images: not asked for).

### 2.3 Winter phone greeting (every "notify me" person, one day; has a date)

**Problem, checked.** `notify.HOLIDAY_MORNINGS` has Halloween and Thanksgiving; `HOLIDAYS`
holds only 31 Oct (Thanksgiving is computed). Winter lights (1-31 Dec) sends no push.

**The holiday-names decision.** The "holiday names" switch (winter-lights plan, reconciled
2026-10-31) is **per screen** (localStorage `hatch-named-holidays`); the server can't see
it. So a winter push must name **no** festival. Seam the review missed: the existing
Halloween and Thanksgiving pushes name the festival whatever any screen's switch says (Q5).

**Proposal.** One push on **21 Dec**, the card's winter treat day (`treat: [12, 21]`), with
no festival name and no "longest night" (it's the longest day south of the equator).

**Watch-out for the build.** Adding `(12, 21): "winter"` to `HOLIDAYS` also feeds
`season_holiday` (coordinator, fav-season note), and the card's `NOTES.season` (l.1212)
renders any non-Halloween holiday as "Thanksgiving in your favourite season!". The slice
keeps the winter morning out of `holiday()` (its own date check in `_holiday_morning`), or
fixes l.1212 to fall back to the generic line for `winter`. Recommend the former: no card
change.

**Lines (DRAFT).** `Winter lights day! {name} saved you a star cookie ✨`
(ends in an emoji, so `to_friend` leaves it without a nickname, as Halloween's.)

**Slices.** 3a S, **tier 2** (server, `notify.py` + `coordinator.py`; no save change).
Must be in a release **before 21 Dec**. **Art:** none.

### 2.4 Personality in mood lines (teens and adults, daily)

**Correction.** The review says idle chatter and mood lines keep the plain words. **That is
mostly wrong in code:** `PERSONA` has `idle`, `idle_bored`, `idle_excited`, `mood_content`,
`mood_excited` for all 8 types; `_idle` uses them half the time (not for bodily moods:
sleepy, hungry, dirty, sick, by design), and `_moodOwn` gives content and excited their
own mood line. The **guide** (l.578) is stale; that's Top-10 #10's docs pass.

**What stays plain:** the `cozy` and `bored` mood lines (`nice and cozy`, `nothing to do`),
bodily moods (deliberate), calls, refusals and visitor greetings.

**Proposal.** Extend `_moodOwn` to `cozy` and `bored` (same daily pick, so the line doesn't
flicker). Refusals, calls and visitor greetings stay plain (Q6).

**Lines (DRAFT), 2 per type per key (32).**

| Type | mood_cozy | mood_bored |
|---|---|---|
| mellow | `mm, perfect nap spot`, `warm and comfy... ♪` | `a nap sounds nice...`, `just lazing about` |
| sweet | `all snug ♥`, `warm and happy ♥` | `wish someone would visit ♥`, `waiting for a friend ♥` |
| bouncy | `cozy... but ready to hop!`, `warm paws, happy hops` | `need to hop about!`, `so... much... sitting` |
| starry | `cozy, like backstage ★`, `a warm spotlight ♪` | `no audience today...`, `waiting for my cue ★` |
| old soul | `a fine warm spot`, `cozy. as it should be.` | `hm. quiet day.`, `nothing doing. hm.` |
| fancy | `cozy and fabulous ♥`, `warm and lovely ♥` | `how dull...`, `nothing lovely to do` |
| charming | `splendidly cozy`, `warm as a welcome` | `a bit dull, isn't it?`, `awaiting company` |
| plucky | `cozy post, all clear`, `warm and on watch` | `nothing to guard...`, `waiting for orders!` |

**Slices.** 4a S, tier 1. **Art:** none.

### 2.5 Multi-pet value (households with 2+ pets on one card)

**Problem, checked.** The infrared link waits 10-25 min after page load
(`LINK_AFTER_MS`), then once per pair per day (`_linkTick`; it does re-arm across days on
an always-on tablet). A phone look rarely lasts 10 minutes, so phone-only households
almost never see it. Between links, pets on one shelf never mention each other.
Constraint: next-stages Decided 6, "no counts between pets": flavour only, nothing saved.

**Proposal (card only).**
- **5a. First link of the day sooner:** if a pair hasn't linked today, the first wait is
  1-3 min instead of 10-25 (Q7). Later pairs keep 10-25 min.
- **5b. Neighbour idle lines:** with 2+ slides, a non-bodily idle line may name a
  neighbour (rare, e.g. 1 in 6 idle lines; `_linkName` for the name). Not on babies (baby
  talk keeps its own set).

**Lines (DRAFT, 5b).** `wonder what {pet} is up to ♪`, `*waves toward {pet}*`,
`I hope {pet} is having a nice day`.

**Slices.** 5a S, tier 1. 5b S, tier 1. **Art:** none.

### 2.6 Assist status detail (voice users)

**Problem, checked.** `spoken_status` (intent.py) says the nickname, mood, reason and
traits. No stage or age, no wish, no visitor.

**Proposal.** Add the stage and day, and today's open wish (plain kind only: the aimed
wish's "for" is private-channel data and speech is overheard). No visitor (Q9). English
only, like the rest of Assist.

**Lines (DRAFT).**
- Stage: `It's a teen, day 6.` / `It's still an egg.` (egg: no mood words change.)
- Wish (open, not granted): `Today it wishes for {wish}.` with spoken wish words:
  play `a game together`, snack `a snack after lunch`, bath `a bubble bath`, praise
  `to hear "good job"`, tuck_in `to be tucked in tonight`, sunset `to watch the sunset`,
  music `some music`, tv `to watch TV together`, chore `a chore treat`, rain `to see the
  rain`, say_hi `a hello this afternoon`.
- Granted today: `Its wish came true today.`

Example: "Hi, sunbeam! Pip is cozy: nice and cozy. It's a teen, day 6. Today it wishes
for a bubble bath. Traits: homebody."

**Slices.** 6a S, **tier 2** (server `intent.py`; reads the public wish; no save change).
**Art:** none.

### 2.7 Card editor: the seasonal switch (dashboard admins, once)

**Problem, checked.** `HatchPetCardEditor` has one field, `devices`, and a constant
`computeLabel`. `seasonal: false` is YAML-only. (`experimental_catch` stays out: Catch is
withdrawn, next-stages.)

**Proposal.** A boolean field: on unless `seasonal === false`. Turning it on deletes the
key; a string preview value (`seasonal: "winter"`) is left alone unless the box is
unticked. `computeLabel`/`computeHelper` become per field.

**Lines (DRAFT).** Label `Seasonal decorations`; helper `Halloween, Thanksgiving and winter
lights on this card. Off hides them on this card only.`

**Slices.** 7a S, tier 1. **Art:** none.

### 2.8 Spring and summer (half the year; plan only, art-heavy)

**Problem, checked.** `SEASONS` has halloween, thanksgiving, winter. Half the year has no
seasonal layer. Already sketched in `plan-2026-10-28-daily-checkins.md` l.213-217 (spring:
equinox week, blossoms on the trims, a flower crown; summer: solstice week, sunglasses on
sunny days, a sunflower; both need HA's latitude for the hemisphere).

**Proposal (no build now).** Two `SEASONS` entries with the same shape as winter's, dated by
`hass.config.latitude`: spring = the March equinox week in the north, September's in the
south; summer = the June/December solstice week likewise; none within the tropics (as the
season talk already does, `people.season`). Generic lines only, no festival names, so the
holiday-names switch has nothing to hide. A treat day each. No phone push.

**Art estimate.** Per season: a trim deco (1-2), a hat or prop (2-3 costumes), a treat
snack (1), a season visitor (optional, 4 frames): about 8-12 Luna images each, ~20 for both.

**Lines (DRAFT, for the later plan).** Spring: `flowers everywhere! ♪`, `it smells like
spring~`, `everything's waking up!`. Summer: `sunny days! ☀`, `so warm out ♪`, `ice lolly
weather!`.

**Slices.** 8 (later) M, tier 1; its own plan when the art is queued (Q10).

### 2.9 Temperament and upbringing visibility

**Checked.** Temperament (×0.6-1.6 per trait, rolled at hatch) already shows indirectly:
`trait_progress` divides by it, so the "learning" bars fill faster for its natural traits.
Upbringing shows as a word; why and how to move it is Top-10 #4.

**Proposal.** No change. Naming temperament ("a natural homebody") would add a stat to
explain for little play value. The upbringing hint is #4's.

### 2.10 The hidden beetle

**Checked.** `beetle` is on Terrarium's roster in `worlds.json` with 30 baby-only sprites
but no `species.json`; `species.py` filters rosters to ready species, so the journal, the
egg select and the egg picture never see it. It's shelved on purpose (`design-worlds.md`,
HANDOFF). Terrarium already has a pill bug visitor.

**Proposal.** No change, no slice. (Removing it from `worlds.json` is tidy but harmless
either way; the server checks saved collections against all of `worlds.json`.)

## 3. Slices

| # | Slice | Size | Tier | Art | Server/save |
|---|---|---|---|---|---|
| 1a | Status: grows-up countdown | S | 1 | 0 | none |
| 1b | One-week moment | S | 1 | 0 | none (browser key) |
| 2a | Weight lines, hint and "would like" | S | 1 | 0 | none |
| 3a | Winter phone greeting (21 Dec) | S | **2** | 0 | server, no save |
| 4a | Persona cozy/bored mood lines | S | 1 | 0 | none |
| 5a | First link of the day sooner | S | 1 | 0 | none |
| 5b | Neighbour idle lines | S | 1 | 0 | none |
| 6a | Assist: stage, day and wish | S | **2** | 0 | server, no save |
| 7a | Editor: seasonal switch | S | 1 | 0 | none |
| 8 | Spring/summer | M | 1 | ~20 | none (later, own plan) |

Each card slice adds card-check coverage where a section exists for it (status rows,
idle, link, editor) and a bench shot where it's visual (1a, 2a).

## 4. Owner questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Approve the DRAFT lines (§2.1-2.7)? | as written / edit some / drop an item | As written; edit any you like. |
| Q2 | Weight: show it on the sprite too? | (a) words only; (b) a slight squash when heavy (bench-tested for blur first); (c) "round" art later | **(a)**: zero art, no pixel blur. |
| Q3 | Say "too many snacks" when it gets sick *from weight*? | (a) no; (b) yes: a tier-2 change to keep `cause` in the public moment for `weight` only | **(a)** for now: 2a's hints carry it; revisit if players still miss it. |
| Q4 | Winter push: which day? | (a) 21 Dec only; (b) 1 Dec "the lights are up"; (c) both | **(a)**: one push, matches the card's treat day. |
| Q5 | Halloween/Thanksgiving pushes name the festival whatever a screen's "holiday names" says. | (a) leave: the switch is per screen, the phone is the person's own; (b) make all holiday pushes generic; (c) a per-person switch (tier 2 save) | **(a)**, and the guide says so (Top-10 #10). |
| Q6 | Personality: which plain lines get type variants? | (a) cozy + bored mood lines only; (b) also refusals; (c) also visitor greetings | **(a)**: biggest reach, 32 lines; refusals must stay instantly clear. |
| Q7 | Multi-pet: first link of the day sooner? | (a) 1-3 min; (b) 3-8 min; (c) keep 10-25 | **(a)**: otherwise phone-only homes never see it. |
| Q8 | Bond level 5 has no unlock (reached ~day 3-7). Add one? | (a) no; (b) yes, in a later bond plan | **(a)** now; 1a/1b cover the gap. |
| Q9 | Assist: mention today's visitor? | (a) no; (b) yes once its window has ended | **(a)**: it spoils the surprise and it's flavour. |
| Q10 | Spring/summer: queue the art? | (a) plan + art in Feb, for a March equinox; (b) later; (c) never | **(a)**: a plan in Feb leaves the art time for 20 March. |

## 4a. Owner answers (2026-11-01, relayed by the FM)

| # | Answer |
|---|---|
| Q1 | **Approved:** all draft lines in §2.1-2.7 as written. |
| Q2 | **Mock up first:** bench mockups of a slight horizontal stretch for heavy pets (2-3 scale steps, a few species, 330 and 420 px, checked for pixel doubling), as a contact sheet for the owner. The stretch ships only once the owner picks; the weight words ship as planned. |
| Q3 | **Yes:** the public `became_sick` moment keeps its cause for `weight` only, and the card says it. Tier 2 (slice 2b); its line is in §4b. |
| Q4 | **Both:** 1 Dec and 21 Dec. 1 Dec line in §4b. Ships before 1 Dec, so 3a is built first. |
| Q5 | **Leave it;** the guide says the phone pushes name the festival whatever a screen's switch says (Top-10 #10's docs pass). |
| Q6 | **Cozy + bored moods and visitor greetings** get type variants (2 per type, §4b); refusals stay plain. |
| Q7 | **Only when someone is watching:** the first link of the day fires 1-3 min into a visible look that was touched recently (the tab is shown, and a tap or swipe in the last few minutes). Never on a hidden tab or an untouched wall tablet. Later pairs keep 10-25 min. |
| Q8 | **Yes, later:** a level-5 unlock and a bond-timing review go in a later bond plan. No slice here. |
| Q9 | **Yes:** Assist mentions today's visitor once its window has ended. Line in §4b. |
| Q10 | **Plan + art in Feb.** |

## 4b. New drafts (all approved by the owner, 2026-11-01)

The owner approved every line below, the charming swap included. The FM reviewed 3a.
Q2 follow-up: the stretch ships at ×1.06, only while the pet is heavy (>75), and is bench-checked at
330 and 420 px (slice 2c). 2b keeps the cause in the public moment for `weight` only, with a test
that no other cause leaks.

- **3a, 1 Dec phone push:** `The winter lights are up! {name} is all aglow ✨` (no festival
  name; ends in an emoji, so no nickname).
- **2b, sick from weight (card, the became_sick moment with `cause: weight`):**
  `ugh... too many snacks, I think`, `my tummy's grumbly... too many snacks`.
  Baby talk (baby, child): `tummy hurts... too many snacks`.
- **4b, visitor-greeting variants (PERSONA `visit`, said half the time like other keys):**

  | Type | visit |
  |---|---|
  | mellow | `oh, hi there... ♪`, `mm, a visitor... nice` |
  | sweet | `a visitor! welcome ♥`, `hello, little friend ♥` |
  | bouncy | `a visitor! hup hup, hi!`, `hiya, friend! *bounce*` |
  | starry | `a guest star! ★`, `welcome to the show! ★` |
  | old soul | `well, hello there.`, `ah. a visitor. welcome.` |
  | fancy | `oh, a visitor! how lovely ♥`, `welcome, welcome, dear ♥` |
  | charming | `a visitor! what an honour`, `do come in, friend ♥` |
  | plucky | `who goes there? oh, hi!`, `visitor spotted! hi! ♥` |

- **4a, a swap:** charming's approved bored line `a bit dull, isn't it?` asks a question,
  which the persona scan forbids ("no asking"). Built as `a bit dull today, I must say`
  (approved).
- **6a, Assist visitor (today's visit, window ended):** `A {visitor} came by today.`
  (the shooting star: `A shooting star went by today.`), after the wish sentence.

## 4c. Build log

| Slice | Commit | Notes |
|---|---|---|
| 3a winter mornings | `f334f862` | reviewed by the FM; 1 Dec line approved |
| 1a countdown | `f2873ad2` | bench: `s1a-*.png` |
| 1b one week | `c8f4444b` | |
| 2a weight words | `43cbefe0` | bench `pet.weight`; `s2a-weight-330.png` |
| Q2 mockups | `54101007` | bench `petStretch`; sheet `q2-stretch-sheet.png` |
| 4a persona moods | `7ab947ff` | charming swap above |
| 5a watched first link | `e1703495` | card-check marks the day's link done on its pages |
| 5b neighbour lines | `004f82e4` | |
| 7a editor switch | `7c7fade2` | |
| 4b persona visitor greetings | `29d59c8c` | plucky's approved "who goes there? oh, hi!" passes the no-asking scan by name |
| 2c heavy stretch x1.06 | `12c37479` | `.heavy` aspect-ratio 1.06, pet and ghost, not an egg; `s2c-heavy-sheet.png` |
| 2b sick from weight (tier 2) | `8808878f` | `MOMENT_CAUSES_SHOWN = {"weight"}`; leak test in test_channel |
| 6a Assist (tier 2) | `67dded2a` | "to ..." wishes read "wishes to ..." (no "for"); asleep adds nothing (privacy); an egg skips "It's still an egg." (its mood already says it) |

## 5. Build order

1. **3a winter greeting** first (tier 2: 1 Dec and 21 Dec; in a release before 1 Dec).
2. 1a, 1b (first-week), 2a (weight words), 4a (persona moods), 5a, 5b (multi-pet), 7a (editor).
3. 6a Assist (tier 2), now with the visitor.
4. Added by the answers: **2b** sick-from-weight (tier 2, server + card); **4b** persona
   visitor greetings (tier 1, after §4b approval); **2c** the heavy stretch (bench
   mockups now, a build only once the owner picks).
4. 8 spring/summer: its own plan later (Q10).

Items dropped or answered "no change": 2.9 temperament, 2.10 beetle, "two ways in", "two
kinds of settings" (to #2/#10).
