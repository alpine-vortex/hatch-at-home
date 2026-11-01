# Plan: a fresh moment on every daily visit

**Status: built, 2026-11-01** (see the build log). The owner approved the drafts for slices 4 and 6
(below) and chose no new lines for slice 3. The FM approved 5a, 5b and 6 from this text.
Slice 6b's 15 more dreams were approved too, so the plain list has 30 kinds.

Source: the scout's research `~/.local/state/crew/research/fresh-moment.md` (s2619, at
origin/main `f37a0cc8`). The owner took every recommendation (2026-11-01): Q1-Q4, Q6, Q7
yes; Q5 (thought of the day) not now, so proposal 8 is left out. The card is
`custom_components/virtual_pet/frontend/hatch-pet-card.js`.

Every player-facing line below is a **DRAFT** until the owner approves it. Nothing ships
that isn't approved here.

Rules for every slice: never nag or guilt, and never say a wish is still open. Nothing
personal on a shared screen. No counts. Finds stay hidden (`FINDS_SHOWN`), but the gift's
slot in the first look and the basket's turn before a visitor stay as they are.

## Slices, in build order

| # | Slice | Size | Tier | New lines |
|---|---|---|---|---|
| 1 | A resumed tab, or a new day on a screen left on, is a new look | S | 1 | none |
| 2 | The first look leads with what's new | S | 1 | none |
| 7 | One move in the first 10 s | S | 1 | none |
| 3 | A missed day visitor plays live at the next daytime look | M | 1 | none |
| 5a | A question no longer freezes visitors and moves | S | 2 | none |
| 5b | A later question on most evenings; the dream question 4 h before bed | S | 2 | none |
| 4 | An evening "today" line | S-M | 1 | 36 |
| 6 | A plain dream every unmapped morning, from 30 | S | 2 | 27 |

The FM approved the 5a, 5b and 6 approaches before the build and reads their diffs
before the merge. Each slice merges origin/main first. The top-10 branch (s2614) touches the
same first look (its dream line takes a third `worlds` argument), so its form is kept.

### 1. A resumed tab is a new look (owner Q1)

- `_onHidden`: back after `AWAY_NOTE_AFTER_MS` (3 h) hidden, `_newLook` resets every
  slide's `lookedFirst`, `greeted` and `visitedAt`, as `giftAgain` is reset now.
- The wish mention's timer is re-armed too. Otherwise it ran out while hidden, and the
  wish is said twice: once in the first look and again by the mention.
- Moments aren't replayed live on the return (`lastMoment` and `lastLogAt` are cleared,
  as `_forget` does). The catch-up alone tells what happened while hidden.
- A screen left on looks again too, since a wall tablet never hides. That happens on a
  new local day (`_tick`) or when the pet is seen waking for the day (the live `woke_up`
  morning moment). Review s2622 #2.
- Doubles: the 3 h greet key, `oncePerDay` (dream, wish, visit) and the `said` mark
  guard each line.
- Stale state: a phone resumes with last night's states in memory, and the sensor's
  dream and wish carry no `day`. So the first look, the visit and the `seen` mark wait
  until `hass.states` is a new object, which is the house's fresh states. A set hass
  with the old object (a connection change) doesn't count.
  - After `RESUME_HOLD_MS` (5 s) the look goes on, but without the dream and wish. Their
    keys stay unused for the next look (review s2622 #1).
- **Test:** card-check `moments`:
  - After 3 h hidden, the greeting and the first look run again, once fresh states come.
    Under 3 h, nothing reruns.
  - The same states object keeps the hold. A timeout says no dream or wish.
  - The `seen` mark holds.
  - A date roll or a live morning wake-up looks again; the same day doesn't.
- `gifts` takes a gift on the return.
- **Bench:** `--preset look` with `look.resumed`: a resumed morning tab at 5, 10, 20
  and 30 s.

### 2. The first look leads with what's new (owner Q2)

- New order: friend-home welcome → catch-up → week-old → dream → wish → away note →
  upbringing → gift → missed visitor. Before, the away note came before the dream.
- An away note whose only bit is sleep ("napped") is dropped.
- The away note now checks there's room (it was never last before).
- It keeps `{away: true}`, so a celebration note still takes its place.
- So mapped notes ("you got a good sleep! ♥") and the morning question stop losing their
  room to "I napped".
- **Test:** card-check `moments`: a morning look says the dream and the wish before the
  away note, and a sleep-only note isn't said.

### 7. One move in the first 10 s

- The first look's first flair comes 6 s in (`FIRST_MOVE_MS`), while a line is showing.
  Flair is pieces around the pet, not a bubble.
- A pet with no traits looks around instead (not when calm). There's no costume draw:
  every pet gets one of the two.
- After that, flair and idle keep their own timers.
- **Test:** card-check `moments`: a first look plans its move within 10 s, and it plays
  over a line.
- **Bench:** `look: {at}` moves the pinned clock forward in 250 ms steps and ticks. Shot
  strip: a 30 s morning look.

### 3. A missed day visitor plays live at the next daytime look (owner Q3, Q7)

- Today's day visitor passed with nobody watching on this device. At the first daytime
  look after its window, once per device that day, it walks or flies in and greets the
  pet live. Before, this was one catch-up line.
- On a dark screen (night or dim) the day/night rule holds (Q7). It stays the line, as
  now.
- Fix: the first look spends the `visit-` key on the line before `_visitorTick` runs. On
  a day screen the first look now leaves the key alone, and `_visitorTick` accepts a day
  visitor whose window has passed.
- It comes right after the look's first line (`s.lateVisit`), not after the queue
  drains and the 10 s and 20 s checks, which half the time fell after a 30 s look
  (review s2622 #7).
  - The other lines go on, and its greet is a move with no line while they wait.
  - It still waits for the basket and a free pet, and is given up after 60 s.
- The server's collection credit at the window's end is unchanged.
- Greeting: the visitor's own lines as now (owner: no new lines).
- **Test:** card-check `visitors`:
  - After the window, a day screen plays the visit and says no catch-up line.
  - A dark screen says the line and plays no visit.
  - A second look that day plays neither.
  - The visit starts after the first line, with the rest still queued.

### 5a. A question no longer freezes visitors and moves (before Q6)

- A question holds the bubble for 60 s (`ASK_MS`), and `_free` stays false all that
  time. Then no visitor, flair or idle move comes in a 30 s look.
- Change: while the only thing showing is a question, a visitor and a flair may still
  start, and the question's bubble stays. The visitor's greet line is skipped, as it
  already is over a kept line. Its picture and the pet's look and hop still play.
- Idle moves still wait for the question's hold. Slice 7's first move doesn't.
- **Test:** card-check `visitors`:
  - A question showing, then a visitor and a flair still come, and the question stays.
  - A real click on an answer mid-visit lands (review s2622 #9).
- **Bench:** `--preset look`: a question on show as a visitor arrives and greets.

### 5b. A later question on most evenings (owner Q6)

- `choose_question`: when the rotation's kind can't be asked now, it falls back to
  `how_day` (from `ASK_DAY_FROM`). That covers a dream question before its window, and a
  guess with no forecast or too early.
  - It does so only on `ASK_FALLBACK_DAYS` (4) of every 7 days, by the day, so it isn't
    nightly (review s2622 #5).
  - The rotation's own how_day days are always asked; the cap is only on the stand-in
    (FM diff review).
- On a morning the pet has a dream to tell (`dreamed`), the dream stands in for "did you
  sleep well?" on alternate days only, by the day. Slice 6 makes a dream nearly every
  morning, so the question still comes about half the mornings (FM diff review).
- `ASK_DREAM_BEFORE_BED_MINUTES` goes from 180 to 240, so a 19:30 look before a 23:00 bed
  can get it.
- Still one later question per person a day. Personal screens only, as now.
- **Test:** pytest `tests/test_people.py`:
  - On a dream day at 19:30 the dream question is asked; at 17:00, how_day.
  - On a guess day with no forecast, how_day.
  - Already asked: none.
  - At most 4 stand-ins in 7 days.
  - A rotation how_day day is always asked, cap or not.
  - On dream mornings, "slept" on alternate days (7 of 14); every morning without a
    dream.

### 4. An evening "today" line (owner Q4)

- The first look from 17:00 adds one line about the pet's own day, once per device a day.
  It takes the away note's place: both would tell the same day.
- What it says, first match:
  1. Today's wish was granted: that wish's line. Not when this look's catch-up already
     told it (review s2622 #3).
  2. A day visitor seen live here today: "a {visitor} visited me today ♪".
  3. Today's newest moment, as a bit. These are the away note's bits without sleep and
     without care (review s2622 #6). A find's bit, once finds show, only if it fits in 40.
  4. The pet's personality line, `dailyPick`ed.
- A day visitor's catch-up line and a visitor seen live never meet in one look.
- A teen or adult only. A baby or child says nothing new.
- No names and nothing about who did what, so a shared screen gets it too. It never
  mentions an open wish.
- **Test:** card-check `personality`: 17:00 with a granted wish gives the wish line; with
  a sunset moment, the bit; with neither, a type line. The morning gets none; a second
  look gets none. Plus the no-nag, 40-character and no-asking scans over the new tables.

### 6. A plain dream every unmapped morning (tier 2)

- `dream_on_waking`: with no seeds, always a plain dream (`DREAM_PLAIN_CHANCE` 0.5 → 1).
- Plain kinds are a plain list: the 3 now, plus the 12 below, plus 6b's 15 (30 in all).
- Each cycle of that many days walks the list in its own order (review s2622 #4):
  - It's shuffled by `random.Random(crc32(pet_id) ^ cycle)`, so no kind comes twice in a
    cycle and two pets don't keep step.
  - A cycle never opens with the last one's last dream.
- The hash is fixed (`zlib.crc32`, never Python's salted `hash()`), so it holds across
  restarts. No new saved field (FM, 2026-11-01).
- The top-10 branch's visitor dream (6d) is the visitor seed, so this slice adds none.
- No season keying: the server doesn't know the card's seasons.
- **Test:** pytest `tests/test_model.py`:
  - A cycle gives every kind once.
  - No two mornings running are the same.
  - Two pets differ.
  - The same kind comes from a process with another hash seed.
  - A seed still wins.
- Node `tests/js/dream_lines.test.js`: every kind has a scanned line. Card-check `moments`: each kind has a line.

## Drafts

Approved (owner, 2026-11-01): slice 4's wish branch A, its 2 moment lines and its 24 type
lines, and slice 6's 12 dreams; then slice 6b's 15. Slice 3 adds no lines.

Each draft is 40 characters at most, with no question and none of the no-nag words
(still, again, why, never, please, sad, cry, alone, forgot).

### Slice 4: the wish branch

Pick one:

- **A (recommended):** a line per kind, about the pet. It credits nobody, so it's true
  whoever granted it:
  - play: "I got to play a game today! ♪"
  - snack: "I got a snack after lunch! ♥"
  - bath: "I got my bubble bath today! ♥"
  - praise: "somebody said I'm good today ♥"
  - sunset: "I got to watch the sunset today ♥"
  - music: "I got some music today ♪"
  - tv: "I got to watch TV today ♪"
  - chore: "I got a chore treat today! ♥"
  - rain: "I got to see the rain today! ♪"
  - say_hi: "I got a hello this afternoon ♥"
  - tuck_in: none. It's granted at bedtime, after the evening look.
- **B:** the type's approved `wish_granted` lines ("my wish came true ♥"). This adds no
  copy, but they're less specific.

### Slice 4: the moment branch (2)

- "today I {bit}! ♪", for example "today I watched the sunset! ♪" or "today I saw a
  rainbow! ♪".
- "a {visitor} visited me today ♪", when this device saw it live today.

### Slice 4: the type lines (24)

- mellow: "a slow, cozy sort of day ♪" · "mm, a comfy kind of day" · "today was nice and
  lazy ♪"
- sweet: "today was a lovely day ♥" · "such a warm, homey day ♥" · "a nice, gentle day
  today ♥"
- bouncy: "today was a hoppy one!" · "what a zippy day! hup!" · "today went boing boing!
  ♪"
- starry: "today was a little show ★" · "a day worth an encore ★" · "today had its own
  sparkle ★"
- old_soul: "hm. a good, quiet day." · "a fine day, all told." · "hm. today was well
  spent."
- fancy: "a rather elegant day ♥" · "today was simply divine ♥" · "such a stylish day,
  darling ♥"
- charming: "what a splendid day it was ♥" · "a marvellous little day ♥" · "today was
  quite grand ♥"
- plucky: "today was a good run! hah" · "all handled today ♥" · "today went great. heck
  yes!"

### Slice 6: plain dreams (12 new)

1. "I dreamed I swam with the fish ♪"
2. "I dreamed of a giant acorn!"
3. "I dreamed I was really, really tall!"
4. "I dreamed the stars sang to me ★"
5. "I dreamed of a big warm blanket..."
6. "I dreamed I found a secret door!"
7. "I dreamed I rode a leaf down a stream"
8. "I dreamed of bubbles, so many bubbles!"
9. "I dreamed I could talk to birds ♪"
10. "I dreamed I was a tiny boat ♪"
11. "I dreamed of a hill made of pillows"
12. "I dreamed I danced in the moonlight ★"

### Slice 6b: more dreams (15, approved by the owner 2026-11-01)

The owner wants a bigger pool, since a plain dream comes most mornings. They join the list
once approved.

1. "I dreamed I baked the biggest pie!"
2. "I dreamed I slid down a rainbow ♪"
3. "I dreamed the clouds were candy floss"
4. "I dreamed I wore a teeny tiny hat ♪"
5. "I dreamed I hid in a giant sock!"
6. "I dreamed of a parade just for me ★"
7. "I dreamed I juggled shiny pebbles!"
8. "I dreamed I painted the sky pink ♪"
9. "I dreamed of a puddle as big as a lake"
10. "I dreamed I sang and everyone joined ♪"
11. "I dreamed I was the size of a bean!"
12. "I dreamed of a house made of cake!"
13. "I dreamed I bounced on a big jelly ♪"
14. "I dreamed of a lantern that hummed ♪"
15. "I dreamed I learned to whistle ♪"

## Build log

All slices built on 2026-11-01, on `crew/hatch-at-home-s2621-fresh-moment-every-daily-visit`.

- **1** `87f1a5d5`: the reset on a return after 3 h. The first look and visit wait for the
  house's next state push (`RESUME_HOLD_MS`, 5 s at most), since the sensor's wish and dream
  carry no day to check. Card-check `moments` and `gifts`. Bench: `--preset look`
  (`128e4e8e`).
- **2** `bd4cd68e`: the new order, and no sleep-only note.
- **7** `07b45b8f`: flair 6 s in, else a look around. No costume draw: flair or a look
  covers every pet. On a two-line bubble the flair can touch its corner, as the resting
  mood line's always could.
- **3** `5694e6e6`: `_visitorLate`; the first look leaves a day screen's missed day visitor
  to it.
- **5a** `19b319ce`: `_askOnly`. A visitor and a flair still come while a question is on
  show; the greet is a move with no line.
- **5b** `7ad7d5cd`: the how_day stand-in, and the dream question 240 min before bed.
- **6** `23c6c9fb`: `PLAIN_DREAMS` (30), `plain_dream`, a crc32 offset; a node test
  (`tests/js/dream_lines.test.js`).
- **4** `e05dc703`: `_todayLine`, `TODAY_WISH`, `PERSONA.*.today`, and a visitor seen live
  kept per device (`hatch-visitseen-<device>`, one key, overwritten). Bench: the look
  preset adds an evening.
- **Review s2622** (FM, 2026-11-01), all folded in:
  - #1, #2, #8 and the `seen` hold: `2a9f5a15`
  - #3, #6: `6d6c9139`
  - #4: `7009f794`
  - #5: `fa2efc56`
  - #7: `25183284`
  - #9: `e9e3e87d`
  - the today line's 40-character cap on a bit: in the plan-text commit
- **FM diff review of 5b**: the rotation's own how_day restored, and the dream replacing
  "slept" on alternate days only (see §5b): in the commit after `b4364e4e`.
