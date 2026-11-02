# Plan: fresh at every engagement point (fresh-expand)

**Status: building, 2026-11-01 (s2627).** The copy is **APPROVED** (FM dialogue pass on the
owner's delegation, 2026-11-01: "ensure they all sound like actual dialogue"). The
adversarial review s2624 (27 findings) is folded into the slice text below; where the
review and the scout's draft differed, the review's fix is what's written here. The FM's
decisions on that review are recorded in "Decisions" at the end. See the build log.

Source: the s2622 report `~/.local/state/crew/research/fresh-expand.md`; the scout's plan
(s2623) `~/.local/state/crew/research/fresh-expand-plan.md`; the review s2624
`~/.local/state/crew/research/review-fresh-expand.md`. Base: origin/main after the
fresh-moment merge (s2621) and the dialogue pass (s2625). Two report items are already
covered by fresh-moment: **Q-b** (its finding 5) and **Sh-a**'s day roll (its finding 2).

The card is `custom_components/virtual_pet/frontend/hatch-pet-card.js`. Places are named by
function, not line, since the card moves under every merge.

Rules for every slice:

- Never nag or guilt. Never say a wish is still open.
- Nothing personal on a shared screen. Visitor names are fine (they are the world's);
  people's names never appear.
- No counts the player could read as a score or tally. Tallies stay hidden. Finds stay
  hidden (`FINDS_SHOWN` false, owner 2026-11-01).
- A baby keeps its baby talk (`BABY`) where a key has one. New pools apply to teens and
  adults through `PERSONA`, or to everyone where the slice says so.
- Each new table joins card-check's copy scans (no-nag words, 40 characters, no asking)
  through one list, `COPY_TABLES` (E1).
- No player line beyond the APPROVED copy below. A line a builder finds missing is a
  question in its report, not shipped.

## How lines avoid repeats (shared by every slice)

| Tool | What | Used for |
|---|---|---|
| `dailyPick(list, salt)` | The same pick all day for one salt | Things said at most once a day, where all day is fine (G-a's game of the day, G-b's lucky number) |
| **new `turnPick(list, salt, date?)`** (E1) | A per-salt permutation of the list, seeded by `hash(salt \| cycle)`, cycle = `floor(dayOrdinal / n)`; day `dayOrdinal % n` takes its slot. Never repeats within n days, two salts don't lock together, and the order changes each cycle | Once-a-day lines noticed day to day: wake, wish phrasing, friend lines, Q-c, B-a |
| **new `_fresh(s, key, list)`** (E1) | A random pick, never the same as the last one at that key on this slide (`s.lastPick[key]`, memory only) | Event lines said many times a day: pat, praise, meals, game ends, replies |
| `oncePerDay(name, day)` / `onceEver(name)` | localStorage once-keys | Callbacks (M-a, S-b, F-b, A-a, LS-a, B-a) |
| `_lines(s, key, normal)` | Baby set first, else a 50% coin for the persona's own lines, else the normal line | Every new persona pool goes in under `PERSONA.<type>.<key>`, so the coin and baby talk come free |

E1 lets `_lines` take an optional picker (`{pick: (list) => this._fresh(s, key, list)}`), so
persona pools don't repeat back to back either.

## Slices, in build order

| # | Slice | Proposals | Size | Tier | Copy | New lines | Files |
|---|---|---|---|---|---|---|---|
| E1 | Helpers and copy scans | — | S | 1 | — | 0 | card, `scripts/card-check.js`, `tests/js/turn_pick.test.js` |
| E2 | Pat and praise | P-a, P-b, P-c | S | 1 | B2 | 33 | card, card-check (`pat`, `react`), bench |
| E3 | Visitors become friends | V-a | S-M | 1 | B1a, B1b | 54 | card, card-check (`visitors`), bench |
| E4 | Wake, bedtime, meals, medicine | S-a, S-b, F-a, F-b, M-a, M-b | S | 1 | B3 | 23 | card, card-check (`moments`, `care`), bench |
| E5 | Games and dig | G-a, G-b, G-c, D-a, D-b (line only) | S-M | 1 | B4 | 23 | card, card-check (`play`), bench |
| E6 | Wishes | W-a, W-b | S | 1 | B5a | 22 | card, card-check (`moments`) |
| E7 | Replies | Q-a | S | 1 | B5b | 24 | card, card-check (`personality`) |
| E8 | Welcome, L10, monthly trick, shared stay | A-a, B-a, LS-a, Sh-a | S | 1 | B5d | 10 | card, card-check |
| E9 | Link news, journal dream, status today | L-a, J-a, St-a | S | 1 | B5a | 3 | card, card-check (`infrared`, `moments`) |
| E10 | Rare pair and cross-world guest | V-b, V-c | M | 1 | B1c | 9 | card, card-check (`visitors`), bench |
| F3 | The pet's own promise | follow-ups | S | 1 | B7d | 7 | card, card-check, node test |
| E11 | Call phrasings | N-a | S | **2** | B6 | 15 | `notify.py`, `coordinator.py`, `tests/test_notify.py` |
| E12 | Seasonal firsts: warm day, fog | Se-a | S-M | **2** | B5d | 4 | `model.py`, `coordinator.py`, `rates.py`, card, tests |
| F1 | The follow-up mechanism + big day | follow-ups | M-L | **2** (save, privacy) | B7a | 32 | `people.py`, `coordinator.py`, `__init__.py`, card, tests, card-check |
| E13 | A softer morning after a tough day | Q-c | S-M | **2** (privacy) | B5c | 21 | as F1 |
| F2 | Dream stories | follow-ups | S-M | **2** (sensor attribute) | B7b, B7c | 45 | `sensor.py`, card, tests |
| F4 | Favourite visitor | follow-ups | S-M | **2** (save: a like) | B7d | 4 | `people.py`, `coordinator.py`, `__init__.py`, card, tests |
| F5-F7 | Weekend, game tomorrow, new trick | follow-ups | S each | **2** (on F1) | B7d | 17 | as F1 |
| E14 | This week strip in the journal | J-b | L | **2** (save) | — | 0 (+ labels) | `model.py`, `coordinator.py`, `sensor.py`, card, tests, bench |

Order (FM decision): E1-E10 + F3 (tier 1), then E11, E12, then F1 (+ E13 on it), F2, F4,
F5-F7, E14. Each slice merges origin/main first. Dependencies, explicit:

- E3 before E10 (E10 reuses E3's tally) and before F4 (greet precedence: the fav line wins
  over the friend line).
- E5 before F6 (G-a's picker). E8 before F7 (`TRICKS`).
- E7 before E13 (E7's tough replies set the voice E13 calls back to).
- F1 before E13 and F5-F7 (they are its classes). E13 is the first sender of a how_day
  answer, so it builds only on F1's ask record (#2), memory-only mood (#3) and the look
  order (#10).

The tier-2 slices need the FM to read their diffs before merge; an audit scout follows over
the tier-2 range. F1 and E13 get the adversarial privacy review.

### E1. Helpers and copy scans (S, tier 1)

- `turnPick` and `_fresh`, as in the table above. `turnPick`'s day ordinal is local days
  since an epoch. It takes an optional Date, so tests and the bench can pin it.
- `_lines(s, key, normal, arg, {pick})`: an optional picker. The default stays `pick`.
- Card-check's scans read every new table through one list, `COPY_TABLES`, so a new table
  can't skip the scan.
- **Tests:** node `tests/js/turn_pick.test.js`: n days in a row give n different picks; two
  salts don't match on every day of a cycle; the same salt and day give the same pick from
  a fresh process; `_fresh` never repeats twice in a row over 200 picks.

### E2. Pat and praise (S, tier 1; B2)

- **P-a:** the spoken pat becomes `this._lines(s, "pat", PAT_LINES[mood] || …, {pick:
  fresh})`, for `content` and `excited` only. Sleepy and sick keep their one line, which is
  information. The persona's `pat` has 2 lines per type (16).
- **P-b:** 1 in 12 **spoken** pats (after the cooldown), any stage but a baby: the existing
  `greethop` and `_bondHearts`, and "that's the spot!! ♥". Random, never counted, nothing
  stored. Under reduced motion, the line only.
- **P-c:** praise's `"♥"` becomes `this._lines(s, "praise", "♥", …, {pick: fresh})`. The
  persona's `praise` has 2 per type (16). A baby keeps "♥".
- **Tests:** card-check `pat`: 40 spoken pats on a typed teen give its `pat` lines and the
  mood line, no two in a row the same; random stubbed to 0 gives the sweet spot; a sleepy
  pat stays as it is. Card-check `react`: a praise on a typed teen says one of its `praise`
  lines or "♥".
- **Bench:** `--preset ui` adds a pat shot and a praise shot for one type.

### E3. Visitors become friends (S-M, tier 1; B1a, B1b)

- **Tally:** localStorage `hatch-visitfriends-<device>-<gen>` holds `{<visitorId>: {n,
  day}}`. `_visitorStart` adds 1 when this visitor plays live and `day` isn't today, so it
  counts **sighting days**, not visits. No catch-up line counts. Never shown or sent; names
  no person.
- **Friend:** `n ≥ 3` (`VISIT_FRIEND_AFTER`). `_visitorGreet` then says a friend line 1 visit
  in 2, else the usual greet. A baby keeps `BABY.visit`.
- **Lines:** `VISIT_FRIENDS = {<id>: [3 lines]}`, by `turnPick(list, `${device}|${id}`)`.
- **Where:** anywhere a visit plays, shared screens included (they name the visitor).
- **Forget:** forget doesn't clear it (the pet's history on this screen, like
  `hatch-seen-`). A new generation starts over: the key carries the generation, and this
  browser's other generations' keys are removed when a new one is written.
- **Tests:** card-check `visitors`: a tally at `{snail: {n: 3}}` with random stubbed to the
  friend branch greets with a snail friend line; at `n: 2`, never; two starts on one day add
  1; a new generation reads 0.
- **Bench:** a `visitFriends` option seeds the tally; `--preset visitors-friends`, each
  world's visitors greeting as friends.

### E4. Wake, bedtime, meals, medicine (S, tier 1; B3)

- **S-a wake:** `woke_up` `how:"morning"` says `turnPick(WAKE_LINES, `${device}|wake`)`, not
  always "*yaaawn*" (kept in the list). The dream wake line is used only when the sensor's
  dream is today's; on a no-dream day that slot says "*yaaawn*". The list has a fixed length
  so the no-repeat holds. The stretch stays.
- **S-b bedtime callback:** on `fell_asleep` `how` `house` or `lights`, once per device a
  day (`oncePerDay("nightcb-<device>")`): this device saw today's visitor live
  (`_visitSeen`) → a visitor line; else today's moments hold a `sunset` → the sunset line;
  else the usual line. `tucked_in` keeps its personal line.
- **F-a meals:** feed's "yum" half becomes 50% "yum" and 50% `_fresh(s, "meal",
  MEAL_LINES[part])`, by the device clock: breakfast 05-11, lunch 11-16, supper 16-22; 22-05
  "yum" only. The type's `yum` lines still come through `_lines` on the "yum" half.
- **F-b:** 1 feed in 15, on a day `_visitSeen` names a visitor that isn't a crosser: the
  crumb line in place of the meal line, once a day (`oncePerDay("crumb-<device>")`).
- **M-a:** a cure (`_care` medicine with `cured`) sets `hatch-cured-<device>` to today. The
  **next day's** first look says one M-a line once (`oncePerDay("curedcb-<device>")`), after
  the wish and before the away note. Never says "sick".
- **M-b:** 1 clean in 8: one extra bubble drifts up 30 px over 1.2 s and pops. CSS only, no
  line, none under reduced motion.
- **Tests:** card-check `moments`: a morning `woke_up` with a dream today can say the dream
  wake line, with none never; `fell_asleep` after a live visitor today says the callback
  once, a second sleep the usual line. Card-check `care`: feeds at a pinned 08:00 draw from
  breakfast lines or "yum"; the medicine callback comes on the next day's look.

### E5. Games and dig (S-M, tier 1; B4)

- **G-a:** the picker leads with the pet's game of the day, `dailyPick(GAMES by type,
  `${device}|game`)`: bouncy and plucky lean to dig, old_soul and fancy to higher_lower, the
  rest to left_right (that game twice in a list of 4). It says that game's G-a line once a
  day (`oncePerDay("gamepick-<device>")`) when the picker opens. `LAST_GAME_KEY` still wins
  the focus; the pick only reorders.
- **G-b lucky number:** `dailyPick([1..9], `${device}|lucky`)`. When higher/lower shows it,
  `_sparkle` plays and the lucky line shows over the number line for 1.5 s. At most once a
  game. No score change.
- **G-c (owner Q1 = A):** `_endGame`'s count line stays (the only place the score shows).
  One time in 2, a teen or adult then queues its type's `game_win` or `game_lose` line
  (`_fresh`) 4 s later.
- **D-a:** a dig on a day `_visitSeen` names a walking day visitor, on a day screen: the
  visitor's frame 1 (still) sits at the pile's other side, and the pet says the watching
  line once. Behind the buttons' layer. On a dark screen, none.
- **D-b shiny berry (line only):** 1 berry in 25 (a card roll) gets `_sparkle` and the shiny
  line in place of the berry line. No score change. Art optional (art desk), the line ships
  without it.
- **Tests:** card-check `play`: a pinned lucky number equal to the opening number says the
  lucky line, score unchanged; a won game's end is the count line, then a type line or
  nothing; random 0 gives the shiny line, basket unchanged; D-a's watcher present with a
  `visitseen` seed and absent on a dark screen, and a dig tap still lands.

### E6. Wishes (S, tier 1; B5a)

- **W-a:** the wish as said (`_wishSaid`) uses `turnPick([WISHES[kind][0],
  ...WISH_MORE[kind]], `${device}|wish|${kind}`)`. An aimed wish and baby talk keep theirs.
  `WISHES[kind][1]` (status) never changes.
- **W-b:** the live `wish_granted` says `TODAY_WISH[kind]` 1 time in 2, else the usual line.
  When it does, it sets `oncePerDay("todaywish-<device>")`, and the evening `_todayLine`
  skips its wish branch. `tuck_in` has no `TODAY_WISH` line, so it keeps the usual one.
- **Tests:** card-check `moments`: a wish over 3 pinned days gives 3 phrasings; a live grant
  with random 0 says the `TODAY_WISH` line, and that evening's today line isn't it.

### E7. Replies (S, tier 1; B5b)

- **Q-a:** `how_day`'s answers gain `PERSONA.<type>.reply_great`, `reply_ok`, `reply_tough`
  (24). The reply becomes `this._lines(s, `reply_${answer}`, pick(lines))`. `slept` is left.
- **Tests:** card-check `personality`: a typed teen's how_day "tough" says its line or a base
  line.

### E8. Welcome, L10, monthly trick, shared stay (S, tier 1; B5d)

- **A-a:** in `_firstLook`, when `mark.seen` is ≥ 48 h ago (`LONG_AWAY_MS`) on a personal or
  shared screen, the look starts with a greethop and an A-a line, and `_catchUp` prefers
  visitor and dream bits over care bits. It takes the away note's slot (no away note in that
  look). It names nobody and says nothing about the gap. Once per return.
- **B-a L10:** a personal screen with `mine.bond.level === 10`, at most once a week
  (`hatch-fav-<device>` = the ISO week last said, one key, overwritten), at a first look
  with room: `turnPick(FAV_LINES)` and `_chirp(s, "win")`. Never on a shared screen.
- **LS-a monthly trick:** an adult with `month = floor((age_days - 14) / 30) ≥ 1` gains moves
  from `TRICKS` (`spin`, a double `perk`, `look`: existing animations), one per month up to
  all 3, in its idle list. The first look of a new month says an LS-a line once
  (`onceEver("trick-<device>-<gen>-<month>")`) and plays the move. Shared screens too.
- **Sh-a:** on a shared screen a live visitor's `stay` is ×2. No copy.
- **Tests:** card-check `moments`: `seen` 3 days ago gives an A-a line first and no away
  note. `sharedscreen`: no B-a line; a visitor's stay is twice the personal one.
  `personality`: age 45 days puts the trick in `_idleMoves`, and the trick line once.

### E9. Link news, journal dream, status today (S, tier 1; B5a)

- **L-a:** in `_linkStart`, 1 link in 3, when the guest has today's dream: the guest's reply
  is followed 1.5 s later by its dream line (`DREAMS`, no new copy); or, if the guest's
  device saw today's visitor (`_visitSeen(guest)`), the L-a visitor line. The host answers
  "ooh, nice! ♪". Public pet data, so shared screens too. The visit holds 1.5 s longer.
- **J-a:** the journal head gets a second line: today's dream as said, only if today's, in
  the subink colour. No new copy.
- **St-a:** status shows `_todayLine(s)` at the top after `TODAY_FROM_HOUR`, before that
  today's dream line, as a plain row. No new copy.
- **Tests:** card-check `infrared`: a guest with today's dream adds its line once (random
  0), yesterday's adds none. `moments`: the journal head carries the dream line; status at
  a pinned 18:00 shows a today line.

### E10. Rare pair and cross-world guest (M, tier 1; B1c)

Card-only and cosmetic: no collection credit, no server change.

- **V-b pair:** on a day with a planned visit, 1 in 15 by `hash(device|day|pair) % 15`: a
  second visitor of the same world with the same `hours`, not the planned one, comes in
  1.5 s behind from the other side. A pair line replaces the greet. Both leave together
  (`s.visitor.els[]`). Not in E3's tally, not written to `visitseen`.
- **V-c guest:** on a day with no planned visit, 1 in 30 by the same hash: a visitor from
  another world whose `hours` match comes once, in the day window (09-12) or night window
  (19-22), through `_visitorTick`'s gate, once a day (`oncePerDay("guest-<device>")`). It
  says its home world's guest line. Not counted or written anywhere.
- **Tests:** card-check `visitors`: a pinned pair day shows two visitors and a pair line,
  collection unchanged; a pinned guest day shows another world's visitor, `visitseen`
  untouched; a dark screen gets only night guests.

### E11. Call phrasings (S, tier 2, no save; B6)

- `notify.CALLS` becomes `{reason: (3 templates)}`. The first of each is the shipped line
  (as the dialogue pass s2625 left it).
- `message()` picks `templates[(day_ordinal + crc32(f"{name}|{reason}")) % 3]`: one
  phrasing per reason per day. It gains a `day: date` argument. **Both callers** pass it:
  the call notification and the recall bundle (`coordinator.py`, the `call_started` send
  and the bundle's re-send). The day is the **call's start day** (the event's time), not
  "now", so a recall after midnight re-sends the same phrasing as the open call (review
  #24).
- `became_sick` uses the `sick` pool, the same pick as that day's sick call.
- Every template ends in `.`, `!` or `?`; `to_friend` handles all three.
- **Tests:** pytest `tests/test_notify.py`: every template ends in `.`, `!` or `?` and is ≤40
  with a 12-character name; each names its need; 3 days give 3 phrasings; the same day gives
  the same; `to_friend` on each; a recall the next day keeps the call day's phrasing.

### E12. Seasonal firsts: the first warm day and the first fog (S-M, tier 2; B5d)

- `model.season_first` takes the season's start month.
  - **warm:** the house latitude decides (as `people.season`): from the local spring
    equinox month (March north, September south), once per year from that month; **none in
    the tropics** (`season()` → None). It fires at `outdoor_c >= R.HOME_WARM_FIRST_C`
    (20.0, new).
  - **fog:** when `readings.condition == "fog"`, once per season-year (July-June, as snow
    and frost).
  - It uses the existing `firsts` map. No new saved field.
  - Trade-off, said: two more yearly memories push older ones out of `MEMORIES_KEPT` (30)
    a little faster.
- The new types join the moment type list, the card's `KEPT`, `MEMORY_LABELS`, the away and
  today bits, and the live moment switch. No phone notification.
- **Tests:** pytest: warm fires once a year, not before the spring month, not in the
  tropics, from September in the south; fog once per July-June. Card-check `moments`: a
  `first_warm` moment says its line.

### E13. A softer morning after a tough day (S-M, tier 2, privacy; B5c; on F1)

Someone answers "tough" to "how was your day?". On **their own** first look the **next
day**, on a **personal** screen, the pet says one gentle line, once, with no reference to
the answer. The owner OK'd keeping this signal one day (2026-11-01: "Yes, kept one day");
it is memory-only (decision #3), so no further question.

It is F1's **mood** class, kind `soft`.

- **Kept:** in memory only, `People._moods[user] = {kind: "soft", day}` (a date, not the
  word "tough", not a time). Never in `self.data`, so never on disk, in a backup, in a
  `.corrupt` copy, or kept by an older version. A restart overnight just skips the line.
  "great" and "ok" never leave the card.
- **Sent:** the tough reply (E7) sends `virtual_pet/answer {question: "how_day", answer:
  "tough"}` over the websocket, **only if the server advertises follow-ups** (`follow: 1`
  in the visit reply; review #4), so an older server never logs a schema error naming it.
  Fire and forget: no retry, and never through `_keepAnswer` / `hatch-answers-`
  (`how_day` never joins `STASHED_QUESTIONS`; review #20). Nothing is written locally but
  the `softcb` once-key.
- **Checked:** the server accepts it only when today's later question for this user was
  `how_day` (`asked.later_kind`, review #2), else `not_asked`. "great"/"ok" are rejected.
- **Said:** at the next day's first look on a personal screen, through F1's
  `virtual_pet/follow`, **after** the look's own lines (as the gift is; review #10). The
  fetch marks it said under the person's lock, so their other devices and pets don't
  repeat it. Then the mood is gone.
- **Lines:** the type's `soft` (2) plus the shared `SOFT_MORNING` (4), by `turnPick(list,
  `${device}|soft`)`. A baby says `BABY.soft`; a child the shared 4. With it, the pet does
  `_bondHearts`.
- **Not:** no question back, no mention of yesterday, no streaks, nothing on status or the
  journal.
- **Tests:** F1's privacy tests for kind `soft`, plus: pytest "great" and "ok" rejected for
  how_day; tough without a how_day ask today → `not_asked`; a restart drops the mood.
  Card-check `moments` (stubbed follow reply): a personal look gets the soft line after its
  own lines; `sharedscreen`: no fetch and no line.

### E14. This week strip in the journal (L, tier 2, save)

- **Why a save:** `MOMENTS_KEPT` is 10, so a week of dreams, visitors and weather isn't in
  the kept moments.
- **What it saves:** `PetState.week`, up to 7 entries `{day, dream: <kind>|None, visit:
  <visitor id>|None, weather: <kind>|None}`. No wish (decision #16). `dream` is the kind
  only, never a media title. `visit` is set when the server credits the day's visit.
  `weather` is the day's first notable house weather (rain, snow, sun, storm). No user ids,
  names or answers.
- **Where:** `PetState.week`, loaded through a validating `_week()` (drops bad entries,
  keeps 7). It rolls on the first `_advance` that sees a new local date (there is no
  day-roll hook; review #5). On `sensor.life_stage` as an attribute, in
  `_unrecorded_attributes`. A new egg starts empty.
- **Card (decision #16):** `_renderJournal` adds a strip under the head with **only the days
  that hold something** (oldest left; no fixed 7 slots, no blank cells, so it's no streak
  chart). Icons: weather glyphs (☂ ❄ ☀ ⚡), ✦ for a dream, and the visitor's frame 1 scaled
  down **only when `findsShown()`** (otherwise the strip would be the hidden collection).
  A text label per day ("Mon: a dream, rain"). No counts.
- **Tests:** pytest: 9 rolls keep 7; a bad entry is dropped on load; a media dream stores
  only its kind; diagnostics shows `week` without titles. Card-check `moments`: the strip
  shows only filled days with labels, and no visitor icon while finds are hidden.

## Follow-ups: questions the pet comes back to

One shared mechanism (F1), which tier-2 slices use, plus one card-only promise (F3).

### What already exists

- **The dream question** follows up: `dream_picks` → a `picked` dream; the asker's next
  visit note says the word-swap line. Other screens get no line (the sensor's dream has no
  pick). F2 fixes both.
- **The forecast guess** follows up already (`person.guess`). Nothing to add.
- `early_alarm`, `up_early`, the tuck-in thanks and "say hi" follow up from sensors and
  bonds; they stay. Big day must not double `early_alarm` (F1 asking).
- The visit's notes path (`async_visit` → `_notes`) is a **service call**, so its response
  can sit in a script trace. F1 puts nothing there.

### Ranked by player impact

| Rank | Follow-up | Slice |
|---|---|---|
| 1 | Big day tomorrow? → morning luck, evening warmth | F1 |
| 2 | Dream stories (the dream question, with story lines and a later callback) | F2 |
| 3 | The pet's own promise ("I'm practising my hop!" → days later the payoff) | F3 |
| 4 | Favourite visitor → an extra-happy greet | F4 |
| 5 | Anything fun this weekend? (Fri) → Monday line | F5 |
| 6 | What should we play tomorrow? → the picker leads with it | F6 |
| 7 | Should I learn a new trick? → shown in 3 days | F7 |

### F1. The follow-up mechanism + big day (M-L, tier 2 privacy, save)

**Retention by class**, in one place (`people.FOLLOW_CLASSES`):

| Class | Kinds | Kept | One open | Where |
|---|---|---|---|---|
| **mood** | `soft` (E13) | the next local day, then gone | one per person | **memory only**: `People._moods[user] = {kind, day}` |
| **event** | `big_day`, `weekend`, `game`, `trick` | until its last beat, at most 7 days (`FOLLOW_EVENT_MAX_DAYS`) | one per person | saved: `person["follow"]["event"] = {kind, asked, due, until, said[], choice?, pet?}`; the typed text **memory only**: `People._texts[user]` |
| **preference** | `fav_visitor` (F4) | until forget_me, or answered differently | one per world | saved: `likes["visitor_<world>"]` |

- **Memory-only (decision #3):** the typed text and the mood are never in `self.data`, so
  never in `.storage/virtual_pet.people`, a backup, a `.corrupt.<time>` copy, or kept by a
  downgrade. A restart drops them: the event falls back to its no-text lines; the mood is
  skipped. `forget` pops both dicts with the record.
- **One open per class:** never asked while an event is open (review #18). A big-day yes on
  Thursday blocks Friday's weekend ask: fine. A concurrent second answer (a race) replaces
  the open record. An answer with no follow-up ("no", "not really", "maybe later") stores
  nothing and clears nothing.
- **Validation** (`_PERSON_KEYS["follow"]`, drop **per class**; review #6):
  - class and kind known, and the kind belongs to the class (no `soft` under `event`)
  - `asked`, `due`, `until` parse with `date.fromisoformat`; `asked ≤ due ≤ until`,
    `until - asked ≤ 7` days
  - `said` a list of that kind's known beats
  - `choice` only for `game`, one of `GAMES`; `pet` only for `game`/`trick`, a str
  - any other key, or `text` in the store at all (it is memory-only), drops the class
  - pytest per bad field, including `"2026-13-45"` and a stored `text`.
- **Expiry and prune (review #5):** `People.prune(today)` pops each class past its limit
  (event: `until < today`; mood: `day + 1 < today`; texts with their event). It runs in
  `async_load` (saved if anything dropped), on every read (`follow_due`), and once per house
  per local date from the first `_advance` that sees the new date. Pytest: a store whose
  event expired yesterday is rewritten without it on load.

**The ask record (review #2):** `mark_asked` keeps `asked["later_kind"]` (the later
question's kind, validated against the known kinds) and a new `follow_asked: [ISO dates]`
(the follow-up asks of the last 7 days, validated, pruned). `async_answer` raises
`not_asked` for how_day, big_day, weekend, game and trick unless today's `later_kind`
matches.

**Asking** (`people.choose_question`, the later slot; review #1, Q3 = A):

- From `ASK_DAY_FROM`, a due follow-up question **takes the place of the fallback how_day**,
  and of a dream or guess that can't be asked now. The rotation's own how_day, and an
  askable dream or guess, keep their evening. So the number of questions a week doesn't
  grow.
- At most 2 follow-up asks per person per 7 days (`FOLLOW_ASK_PER_WEEK`, `follow_asked`).
- Never while an event is open.
- `big_day`: Sun-Thu evenings, at most once a week, and not when `early_tomorrow` is set:
  `choose_question` gets that flag from `_tomorrows_alarm` at ask time (any hour, "my day"
  on; review #13), since the `early_alarm` note is only queued from 19:00.
- `weekend`: Fridays. `game`: any evening (one per pet; F6). `trick`: once per pet per
  generation-month, gated in that pet's bond (F7).
- Choice answers only, from `people.ANSWERS[kind]`.
- Pytest: big day is askable on each of Sun-Thu (an evening where the rotation's own pick
  can't be asked); not Fri/Sat; not twice in a week; not with an early alarm tomorrow.

**The optional typed answer** (`big_day` and `weekend` "yes"; FM Q2: natural sentences,
`{it}` ≤ **20**):

- **UI:** after "yes", the ask box shows "what is it?" with one `<input maxlength="20"
  autocomplete="off" enterkeyhint="done">`, "ok" and "skip". Skip or empty sends no text.
  Built with `document.createElement`, read as `.value`, never put back as HTML. The ask
  box stops `keydown` as well as click/change/pointer, so HA's shortcuts (`e`, `c`, `a`,
  `m`) don't fire while typing (review #27).
- **Timeout (review #19):** on `ASK_MS`, a slide switch or the tab hiding during the text
  step, the card sends "yes" with no text, so the event still opens.
- **Card cleaning:** trim, collapse whitespace, strip `\p{C}`, cut to 20 code points.
- **Sent:** in the same `virtual_pet/answer` WS message, as `text`. The schema is
  `vol.Optional("text"): str` with **no** length or content rule; the handler cleans and
  cuts (review #4), because HA logs every schema failure at ERROR with the value. The card
  sends `text` only when the server advertises `follow: 1`. WS only: never a service call,
  so never on the bus or in a trace.
- **Server cleaning:** the same clean (`unicodedata` category `C*` removed, whitespace
  collapsed), cut to 20. A leading "my "/"My " becomes "your ", only if the result still fits
  20 (so every line stays ≤40). Accepted only for a `big_day`/`weekend` "yes" asked of this
  user today; otherwise the text alone is dropped.
- **Kept:** `People._texts[user]`, with the event's own expiry (big day: after its evening
  beat; 7 days at most).
- **Said back:** only in `virtual_pet/follow`'s reply to **that user**, on a personal screen,
  in the bubble through `_write` (`textContent`, HTML-safe). It shows nowhere else.
- **Never:** on a sensor, in `_mine`, `_house_view` or a moment; on the bus or in any log
  record; in a notification; in diagnostics; in Assist or the LLM API.
- Every text line has a no-text twin, and the checker fills `{it}` with 20 characters.

**Delivery** (new WS `virtual_pet/follow {entity_id}` → `{kind, beat, text?}` or `{}`):

- **When (review #12):** at a personal screen's first look, at each tab return
  (`_giftReturn`), and once at the first tick after 17:00 when an evening beat could be due.
  Never on a shared screen.
- **Room (review #11):** the fetch reserves a slot exactly as the gift does (`room =
  FIRST_LOOK_LINES - gift - follow`), and the visit's `queued` counts the pending follow,
  so follow + notes + gift stay within the look's 3 lines. The line comes after the look's
  own lines.
- **Once (review #21):** the server reads the due beat for `connection.user.id` only and
  marks it said (`said`) under `people.lock(user)` with no await between, then saves. Their
  other devices and pets get `{}`.
- **Beats:** `big_day`: `morning` (the first look of the due day before 17) and `evening`
  (the due day from 17); after the evening, or past the due day, it is popped. `weekend`:
  `monday` (the first look Mon-Tue). `soft`: `morning` (the next day, any time). `game`:
  `day`. `trick`: `shown` (3-5 days on). `game`/`trick` are returned only to the pet that
  asked (`pet`, review #8).
- An older server has no `virtual_pet/follow` (logged at INFO, type only); the card says
  nothing. An older card never calls it.

**The privacy table** (for the adversarial review):

| Concern | Rule | Test |
|---|---|---|
| Stored where | The people store only; text and mood in memory only | Pytest: after an answer with text, the people store's saved data, the pet's state and sensor attributes hold no text and no mood |
| How long | Mood the next day, event ≤7 days, text with its event, preference until forget_me | Pytest + freezer: prune pops each class at its limit; a hand-edited 30-day event is dropped on load |
| Restarts | Text and mood don't survive one | Pytest: a reloaded `People` has no text and no mood; the event says its no-text line |
| One open | One mood, one event per person | Pytest: no event ask while one is open |
| forget_me | `People.forget` pops the record, `follow`, `likes`, `_texts`, `_moods` | Pytest: forget → `virtual_pet/follow` returns `{}` |
| Diagnostics | The people store isn't dumped. A separate `REDACT_PEOPLE` set (not the shared one: `likes` is a voice key in `debug`; review #25) is for any later dump | Pytest: the diagnostics JSON has none of the text, no `follow`, no `soft` |
| Bus, logbook, recorder | WS commands, not services | Pytest: a `MATCH_ALL` listener across answer + follow sees no event data with the text or `follow` (review #17) |
| Sensors, `_mine`, house view | Never | Pytest: a JSON grep of `_mine`/`_house_view`/every sensor's attributes |
| Logs | No integration log with answers or text; no WS schema failure that echoes them | Pytest with `caplog` on the integration **and** `homeassistant.components.websocket_api`: an over-long or wrong-typed text leaves no record containing it (review #4) |
| Notifications | `notify.py` never reads `follow` | Pytest: `message()`, send-offs, birthday hold no text |
| Assist / LLM | `intent.py`/`llm.py` never read `follow` | Pytest: spoken status and the LLM JSON hold no text |
| Shared screens | The card never asks, sends or fetches there; the server refuses `text` with `shared` | Card-check `sharedscreen`: no follow WS call, no line |
| Other people | `virtual_pet/follow` answers only `connection.user.id` | Pytest: user B's fetch is `{}` while A has one due |
| HTML | `textContent` only | Card-check `moments`: a text `<img src=x onerror=…>` shows as text |
| Local stash | big_day, weekend and how_day never join `STASHED_QUESTIONS` (review #20) | Card-check: a failed text answer leaves no `hatch-answers-` entry |
| Backups | Nothing to back up: text and mood are memory-only; the event record holds kinds and dates | — |
| Debug logging, shared accounts | HA's `websocket_api` debug logging logs every message; one HA account shared by a family sees its text on every personal screen of that account (as birthdays) | Said in `docs/guide.md`'s privacy section (review #22); no code change |

**Big day's beats** (B7a):

- Asked "big day tomorrow?": "yes" → a reply and the optional text step; "no" → a reply,
  nothing stored. Due tomorrow, until tomorrow.
- Morning: with text, a text line (3); without, the type's `bigday_am` or the shared 3, by
  `turnPick`.
- Evening: the same with `bigday_pm`. Warm either way: never "you did it".
- **Tests (review #17: the clock moves only in pytest):** pytest + freezer for asking, the
  beats (morning before 17, evening from 17, each once across 2 devices and 2 concurrent
  fetches), the expiry, text cleaning (control and format characters, 21 characters,
  whitespace, the "my" rewrite at the cap), "no" storing nothing. Card-check stubs the
  `virtual_pet/follow` reply (card side only): a text "your exam" in the morning and
  evening lines, the no-text lines, an HTML text shown as text.

### F2. Dream stories (S-M, tier 2: a sensor attribute, no save)

- `sensor.py` `_dream`: a `picked` dream also gives `pick` (stars / sea / snacks / you),
  never `user`. Public: everyone in the house sees what it dreamed; "you" names no one.
- **The card (review #14):** everyone, the asker included, hears the **story** at the first
  look: `turnPick` over the pick's 2 shared stories plus the type's own
  (`PERSONA.<type>.dream_<pick>`). The asker's note then says only the tail ("you picked
  it! ♥"). **"you"** stays the exception: the first look says the existing "my friends"
  line, and the asker's note tells the "you" story, then the tail.
- **Callback:** a device that told a stars/sea/snacks story keeps `hatch-dreamstory-<device>
  = {pick, day}` (one key, overwritten). 2-4 days later (`turnPick` of the offset), at a
  first look with room, it says that pick's callback once and removes the key. "you" has no
  callback.
- **Tests:** pytest `picked` → `{kind, pick}`, no user. Card-check `moments` (card clock
  pinned): a picked sea dream on a shared screen says a sea story; the asker's note says
  the tail once; the callback comes 3 days later.

### F3. The pet's own promise (S, tier 1, no save)

- No question. Card-only, deterministic from the pet and the date, so every screen agrees:
  a 21-day cycle per pet, offset by `hash(device)`.
  - Day 0: the first look of a teen or adult says a promise line (topic by cycle: hop,
    spin, song).
  - Days 1-3: a 1-in-3 idle may show the move done small, with the in-between line once.
  - Day 4: the first look says the payoff and plays the move bigger (a `greethop` at 1.4×,
    a full `spin`, or `_chirp` twice).
- Once-keys `oncePerDay("promise-<device>")` for each beat. Shared screens too.
- A missed day 4 moves the payoff to the next first look, up to day 7, then it lapses.
- **Tests:** node: the schedule (day 0 and day 4 per pet; two pets not locked). Card-check
  `personality`: a pinned day 0 says the promise; a pinned day 4 the payoff and the move.

### F4. Favourite visitor (S-M, tier 2: a preference)

- A one-time question `fav_visitor` (at `ASK_LIKES_LEVEL`): "who's your favourite
  visitor?". The buttons are the pet's world's 3 visitor names.
- **Per world (review #15):** done = `f"visitor_{world}" in likes`; tries keyed
  `fav_visitor_<world>`; `once_due` gets the pet's world, so a new world asks again.
  `async_answer` checks the answer against that pet's `worlds.json` visitor ids, not the
  static `ANSWERS`.
- `_mine` gains `fav_visitor` (an id), only on that user's own subscription; a shared
  screen's `mine` is `None`.
- When that visitor plays on that person's personal screen: a greethop, `_bondHearts`, and
  a fav line in place of the greet, 1 visit in 2. **The fav line wins over E3's friend
  line.**
- **Tests:** pytest: answers limited to the world's ids; asked again in a new world, not
  after an answer; forget clears it. Card-check `visitors`: the fav greet on a personal
  screen, none on a shared one.

### F5-F7. Weekend, game tomorrow, new trick (S each, tier 2, on F1)

- **F5 weekend:** asked Friday from `ASK_DAY_FROM`, in F1's slot. "yes" → the optional text;
  due Monday, until Tuesday. "not really" → a reply, nothing stored. Monday-Tuesday's first
  personal look: a Monday line, with text or without.
- **F6 game (after E5):** "what should we play tomorrow?" (the 3 game labels). Stores
  `choice` and `pet` (review #8). Due tomorrow, until tomorrow. That pet's picker leads with
  the game over G-a's pick and says a game line when it opens.
- **F7 trick (after E8):** "should I learn a new trick?" yes / maybe later. Stores `pet`.
  Yes → due in 3 days, until day 5. Shown at their first look on that pet: the payoff line
  and a move from `TRICKS` the pet doesn't have yet, in its idle list only that day.
  **No moves left** (an adult past month 3) → not asked. **A teen** (no LS-a moves) gets the
  first move. The once-a-generation-month gate is in that pet's bond (`state.bonds[user]`),
  not the people store (review #26, #8).
- **Tests:** each kind's ask rules, beats and expiry (pytest + freezer); `game`/`trick`
  returned only to their pet; one card-check `moments` case each (stubbed reply).

## Copy (APPROVED 2026-11-01)

All lines below are APPROVED by the FM dialogue pass (owner-delegated). The pass's rewrites
are applied in place. Checked by `check_drafts.py` (s2623) and, as built, by card-check's
scans: ≤40 characters with `{visitor}` = "hearth cricket", `{name}` = 12 characters, `{it}` =
20 characters; no no-nag words (`still|again|why|never|pleas*|sad|cry|alone|forgot*`); no `?`
outside B6 and the `ask:` lines; no digits.

### B1a: visitor friend lines: woodland, terrarium, hearth (27)

- chickadee: "my chickadee pal! dee-dee ♪" · "chickadee! you came by ♪" · "hi, little chickadee friend ♥"
- stellersjay: "my blue jay friend! hi!" · "ooh, it's my jay pal ♪" · "jay! looking so blue today ♥"
- snail: "the snail! my slow pal ♪" · "hi, snail buddy, no rush ♥" · "my snail friend! take it easy~"
- pillbug: "my pill bug pal! hi hi ♪" · "oh, my roly-poly friend! ♥" · "pill bug! good to see you ♪"
- ladybird: "my ladybird friend! ♪" · "hi, spotty pal! ♥" · "ladybird! my lucky friend ♪"
- moth: "my fuzzy moth friend ♪" · "moth pal! hello, hello ♥" · "hi, moth! my night buddy ♪"
- robin: "robin! my window pal ♪" · "hi, robin friend! ♥" · "my robin! looking cheery ♪"
- mouse: "shh... hi, mouse pal ♥" · "my mouse friend! hi hi ♪" · "mouse pal! a crumb's waiting ♪"
- cricket: "my cricket pal! cri-cri ♪" · "cricket! my little singer ♥" · "hi, cricket friend ♪"

### B1b: visitor friend lines: tidepool, pond, night sky (27)

- gull: "my gull pal! hello ♪" · "gull friend! fresh from the sea ♪" · "hi, gull! my sky buddy ♥"
- shorecrab: "hi hi, little crab pal ♪" · "my sideways friend! ♥" · "crab pal! snip snip ♪"
- seastar: "my sea star friend ✦" · "hi, starry pal! ♥" · "sea star! good to see you ♪"
- dragonfly: "my dragonfly pal! zoom ♪" · "hi, shiny friend! ♥" · "dragonfly! my zippy pal ♪"
- strider: "strider pal! hi hi ♪" · "my water-walking friend ♥" · "hi, strider buddy ♪"
- heron: "my tall heron friend ♥" · "heron pal! happy fishing ♪" · "hi, heron! my quiet pal ♪"
- shootingstar: "oh! my shooting star ✦" · "my wishing star friend ✦" · "my star friend! whoosh ✦"
- nighthawk: "my nighthawk pal ♪" · "nighthawk! my night friend ♥" · "hi, sky buddy! swoop ♪"
- raccoon: "the raccoon! my night buddy" · "my masked friend! hi hi ♥" · "raccoon pal! hello ♪"

### B1c: rare pair and cross-world guest (9)

- Pair, in place of the greet: "oh! a pair of friends ♪" · "two visitors at once! ♪" · "a little parade! hi hi ♪"
- Guest, by its home world: woodland "a guest from the woods! ♪" · terrarium "a guest from the terrarium! ♪" · hearth "a visitor from a cozy house! ♪" · tidepool "a guest from the seaside! ♪" · pond "a guest from the pond! ♪" · nightsky "a guest from the night sky ✦"

### B2: pat and praise (33)

- P-a `pat`:
  - mellow: "mm, right there ♪" · "*melts a little* ahh ♥"
  - sweet: "aw, you ♥" · "that's so nice ♥ hehe"
  - bouncy: "hee! that tickles!" · "pat pat! hup! ♪"
  - starry: "a pat for the star! ★" · "my favourite kind of applause ★"
  - old_soul: "hm. that's rather nice." · "ah. just the thing."
  - fancy: "how very kind ♥" · "mind the fluff! ♥ hehe"
  - charming: "oh, how delightful ♥" · "a splendid pat, thank you"
  - plucky: "hah! good pat ♥" · "heh, not bad at all ♥"
- P-b: "that's the spot!! ♥"
- P-c `praise`:
  - mellow: "mm, thanks... ♥" · "aw, that's nice to hear ♪"
  - sweet: "hehe, you're sweet ♥" · "you make me so happy ♥"
  - bouncy: "yes! *happy hop*" · "woo! I'm good! hup!"
  - starry: "a bow, thank you ★" · "I'll take a bow for that ★"
  - old_soul: "hm. kind of you." · "much obliged, friend."
  - fancy: "oh, you flatter me ♥" · "I do try, darling ♥"
  - charming: "how lovely of you ♥" · "what a splendid thing to say ♥"
  - plucky: "I'll do it even better! ♪" · "heck yes, I'm good! hah"

### B3: wake, bedtime, meals, medicine (23)

- S-a `WAKE_LINES` ("*yaaawn*" kept): "*yawn* ...morning already ♪" · "*stretch* mm, cozy night ♪" · "*yaaawn* ...hi, day ♪" · "*blink blink* morning ♪" · dream days only: "*yawn* I had the best dream"
- S-b, at lights out: "night, little {visitor} ♪" · "sweet dreams, {visitor} ♪" · "night... what a nice sunset ♥"
- F-a `MEAL_LINES`:
  - breakfast: "breakfast! ♪" · "a good start to the day ♪" · "morning munchies! yum" · "breakfast time, yum ♥"
  - lunch: "lunch! just what I needed" · "a midday munch ♪" · "lunch! yum yum ♪" · "mm, a hearty lunch ♥"
  - supper: "mm, a cozy supper ♥" · "supper time! yum ♪" · "a warm supper, mm ♥" · "dinner! just right ♪"
- F-b: "saving a crumb for the {visitor} ♪"
- M-a: "feeling much better today ♪" · "I feel all better today ♥"

### B4: games and dig (23)

- G-a: dig "ooh, berry dig today ♪" · left_right "I'm extra sneaky today ♪" · higher_lower "I feel lucky today ♪" · generic "I picked a game for us ♪"
- G-b: "my lucky number! ★"
- G-c `game_win` · `game_lose`:
  - mellow: "mm, nice game ♪" · "close one! that was cozy ♥"
  - sweet: "you're so good at this ♥" · "that was fun anyway ♥"
  - bouncy: "woo! what a game! hup!" · "phew! rematch soon! hup"
  - starry: "a winning show! ★" · "bravo, both of us ★"
  - old_soul: "a fine match, well played." · "hm. a good game, all told."
  - fancy: "you play beautifully ♥" · "a lovely little game ♥"
  - charming: "a splendid victory ♥" · "a grand game, truly ♥"
  - plucky: "hah! great game! ♥" · "rematch tomorrow. you're on! hah"
- D-a: "the {visitor} is watching ♪"
- D-b: "a shiny one! ✦"

### B5a: wish phrasings and link news (25)

- W-a `WISH_MORE`:
  - play: "a game today would be fun ♪" · "I'm in a playing mood today ♪"
  - snack: "a snack after lunch sounds nice ♥" · "I've got room for an afternoon snack"
  - bath: "I hope it's a bubble bath day ♪" · "I'd love some bubbles today ♥"
  - praise: "I'm hoping for a kind word today" · "a little praise would be nice ♥"
  - tuck_in: "a tuck-in tonight would be cozy ♥" · "I'd love to be tucked in tonight"
  - sunset: "a sunset together would be nice ♥" · "I'd love to watch the sky tonight ♪"
  - music: "some music today would be nice ♪" · "I'm in the mood for a song ♪"
  - tv: "a show together would be fun ♪" · "I'd love some TV time today ♪"
  - chore: "a chore treat would be lovely ♥" · "I'm hoping for a chore treat ♪"
  - rain: "I'd love to see some rain today ☂" · "rain today would be fun to watch ☂"
  - say_hi: "a hello this afternoon would be nice" · "I'm hoping for an afternoon hello ♥"
- L-a: guest "a {visitor} came to see me today ♪" (its dream line is the existing `DREAMS`) · host "ooh, nice! ♪"

### B5b: how_day replies by type (24)

- great: mellow "mm, a good day. nice ♥" · sweet "yay! I'm so glad ♥" · bouncy "woo! great day! high five! hup" · starry "a great day! bravo ★" · old_soul "hm. good to hear." · fancy "how marvellous, darling ♥" · charming "splendid news! ♥" · plucky "heck yes! good day ♥"
- ok: mellow "ok days can be cozy too ♪" · sweet "ok is nice too ♥" · bouncy "ok! more hops tomorrow, then!" · starry "every show has quiet nights ★" · old_soul "hm. ok days count too, friend." · fancy "ok is perfectly fine, darling ♥" · charming "a fair day, then ♥" · plucky "ok's a win in my book ♥"
- tough: mellow "*leans on you* I'm here ♥" · sweet "*sits close* I'm here ♥" · bouncy "*hops over softly* I'm here ♥" · starry "you're my star anyway ★" · old_soul "hm. sit with me a while ♥" · fancy "come here, darling ♥" · charming "tea and a cuddle, then ♥" · plucky "I've got you. *hug* ♥"

### B5c: the softer morning, Q-c (21)

Said only on the answerer's own personal screen, the next day, once. None names the answer,
yesterday or a feeling. None asks anything back.

- Shared `SOFT_MORNING`: "hope today's a softer one ♥" · "I'm right here today ♥" · "a gentle day to you ♥" · "I saved you a cozy spot ♥"
- `PERSONA.<type>.soft`: mellow "let's go slow and easy today ♥" · "mm, a soft day for you ♥" | sweet "I saved you a hug today ♥" · "a softer day for you, I hope ♥" | bouncy "*gentle hop* morning, pal ♥" · "let's have an easy day, pal ♥" | starry "today, you're the star ★" · "here's to a brighter show today ★" | old_soul "hm. a kinder day ahead." · "take today slowly, friend." | fancy "a gentle day, darling ♥" · "only nice things today ♥" | charming "a lovely day to you ♥" · "here's to a kinder day ♥" | plucky "fresh day, fresh start ♥" · "I'm on your side today ♥"
- `BABY.soft`: "*snuggle* hi hi ♥"

### B5d: welcome, seasons, stages, L10 (14)

- A-a: "you're here! ♥ hop hop" · "yay, a visit! ♥" · "hello hello! ♥ come in"
- B-a `FAV_LINES`, personal only: "I made up a song for you ♪" · "you're my favourite ♥" · "I saved you the comfy spot ♥" · "*hums your song* ♪"
- LS-a: "look what I can do! ♪" · "ta-da! a new trick ♪" · "I learned a new move! ♪"
- Se-a: live "first warm day! ☀ ♪" · "ooh, the first fog ♪"; today and away bits (in "today I {bit}! ♪") "felt the first warm day" · "saw the first fog"; journal labels (UI) first warm day · first fog

### B6: call notifications, notify.py (15; question slots allowed)

The first of each pool is the shipped line, as the dialogue pass s2625 left it.

- hunger: "{name} is hungry!" · "{name}'s tummy is rumbling!" · "{name} could use a meal!"
- happiness: "{name} wants to play!" · "{name} is up for a game!" · "{name} would love some playtime!"
- energy: "{name} is sleepy. Lights out?" · "{name} is yawning. Lights out?" · "{name} is drowsy. Lights out?"
- dirty: "{name} needs a clean-up!" · "{name} could use a wash!" · "{name} is a bit messy. Bath time?"
- sick and became_sick: "{name} feels sick. Medicine?" · "{name} feels poorly. Medicine?" · "{name} needs some medicine!"

### B7a: big day (32; question slots marked "ask")

- ask: "big day tomorrow?" Buttons yes / no. Replies: yes "ooh! I'll cheer for you ♥" · no "a cozy one, then ♪".
- ask: "what is it?" Buttons ok / skip. Reply after skip or text: "ok! I'll remember ♥".
- Morning, with text (`{it}`, their words, ≤20; FM Q2: natural sentences): "good luck with {it}! ♥" · "it's {it} day! go go ♥" · "cheering you on: {it} ♥"
- Morning, no text, shared: "good luck today! ♥" · "big day! I'm cheering for you ♥" · "you've got this today ♥"
- Morning, `bigday_am`: mellow "deep breath... you'll be ok ♥" · sweet "sending you a big hug for today ♥" · bouncy "big day! hup hup, go go! ♥" · starry "today's your big show! ★" · old_soul "steady on today, friend." · fancy "go shine today, darling ♥" · charming "go on, have a splendid day ♥" · plucky "go get 'em today! hah ♥"
- Evening, with text (warm either way): "hugs after {it} ♥" · "{it} is done. rest up ♥" · "hugs, however {it} went"
- Evening, no text, shared: "big day done. come rest ♥" · "however it went, I'm here ♥" · "I saved you a cozy spot ♥"
- Evening, `bigday_pm`: mellow "phew, big day. sit with me ♥" · sweet "a hug for after your big day ♥" · bouncy "big day over! rest those paws ♥" · starry "curtain's down. you showed up ★" · old_soul "hm. a long day. rest now." · fancy "feet up, darling. what a day ♥" · charming "here's to you, big day and all ♥" · plucky "you faced your big day! rest up ♥"

### B7b: dream stories: stars, sea (20)

- stars: shared "I dreamed I hopped star to star ★" · "a star waved at me in my dream ★" | mellow "I napped on a star all night ★" · sweet "I dreamed a star tucked me in ★" · bouncy "I bounced right up to the stars!" · starry "I dreamed the stars gave me a bow ★" · old_soul "I dreamed I counted the stars. hm." · fancy "I dreamed I wore a star crown ★" · charming "I danced with a comet last night ★" · plucky "I raced a shooting star. I won! ★"
- sea: shared "I dreamed a wave carried me home ♪" · "a little fish showed me a shell ♪" | mellow "I floated on the sea all night ♪" · sweet "I dreamed a seal gave me a hug ♥" · bouncy "I surfed a giant wave! wheee!" · starry "the sea sang me a song in my dream ★" · old_soul "I dreamed of a quiet, wide sea." · fancy "I dreamed of a pearl just my size ♥" · charming "I sailed a teacup across the sea ♪" · plucky "I dreamed I steered a big ship! hah"

### B7c: dream stories: snacks, you, tail, callbacks (25)

- snacks: shared "I dreamed a cookie said hello! ♪" · "I found a pie tree in my dream ♪" | mellow "I dreamed I napped in a soft bun ♪" · sweet "I dreamed I shared cake with friends ♥" · bouncy "I dreamed of a snack race! I won!" · starry "a cake threw me a party ★" · old_soul "I dreamed of soup. it was good." · fancy "I dreamed of a fancy tea party ♥" · charming "I dreamed of a grand snack ball ♥" · plucky "I climbed a mountain of muffins! hah"
- you (the asker's note only; everyone else hears the existing "my friends" line): shared "I dreamed we had a picnic ♥" · "you were in my dream! we sang ♪" | mellow "we napped in the sun in my dream ♥" · sweet "I dreamed we held paws all night ♥" · bouncy "we raced in my dream! you won! ♥" · starry "you were my co-star last night ★" · old_soul "we had tea in my dream. nice ♥" · fancy "we went to a ball in my dream ♥" · charming "we waltzed all night in my dream ♥" · plucky "we were a team in my dream! hah ♥"
- Asker's tail: "you picked it! ♥" · "your idea! thank you ♥"
- Callbacks, 2-4 days later: stars "my star dream was the best ★" · sea "I keep thinking of my sea dream ♪" · snacks "that snack dream... yum ♪"

### B7d: weekend, game, trick, favourite visitor, promise (28; question slots marked "ask")

- Weekend: ask "anything fun this weekend?" Buttons yes / not really. Replies: yes "ooh, fun! ♪" · not really "a restful one, then ♥". Reuses B7a's text step. Monday, with text: "back from {it}! ♥" · "hope {it} was fun ♥". Monday, no text: "welcome back from the weekend ♪" · "I saved you a Monday hug ♥"
- Game: ask "what should we play tomorrow?" Reply "ok! I'll get ready ♪". Next day: "let's play your pick today ♪" · "ready for your game ♪"
- Trick: ask "should I learn a new trick?" Buttons yes / maybe later. Replies: yes "ok! I'll practise ♪" · maybe later "ok! another time ♪". Shown: "I learned it! look ♪" · "you said I should! ta-da ♪"
- Favourite visitor: ask "who's your favourite visitor?" Reply "the {visitor}! good pick ♪". Greet: "your favourite, the {visitor}! ♥"
- Promise (F3, every screen): hop "I'm practising my hop! ♪" → "I can hop higher now ♪" · spin "I'm practising a spin ♪" → "look, a whole spin now! ♪" · song "I'm learning a new song ♪" → "I learned my song! ♪ la la" · in between "hup! getting there ♪"

## Decisions

- **Owner questions** (FM, on the owner's delegation, 2026-11-01): Q1 G-c = A (count line,
  then the type line 4 s later, 1 in 2). Q2 = natural sentences, `{it}` ≤ 20, a leading "my"
  → "your" only. Q3 big day = A (at most once a week, Sun-Thu, in F1's slot).
- **FM on review s2624** (2026-11-01): all 27 findings folded with their fixes; the review
  wins over the scout's draft, the dialogue pass wins over both on copy. #3: text **and**
  mood memory-only. #9: the owner's explicit OK ("Yes, kept one day"), memory-only, no
  further question. #16: the strip gates visitor icons on `findsShown()`, shows only filled
  days, no wish icon. #1: a due follow-up takes the fallback how_day's place.

- **FM on reconcile s2631 (part 2)** (2026-11-01, `reconcile-fresh-expand-p2.md`): all
  five answers A; its per-slice edits are folded below (*Part 2, as reconciled*). Where they
  and the slice sections above differ, these win.

## Part 2, as reconciled (s2631; FM answers all A)

### F1 + E13

- **Asking (Q1 A).** On the event's eve a follow-up may take the later slot from the
  fallback how_day, from an unaskable **or askable** dream/guess, but never from the
  rotation's own how_day, a came-home how_day or a one-time question. The weekly cap
  (`FOLLOW_ASK_PER_WEEK = 2`) and "never while an event is open" stay; a race replaces the
  open record (the race rule only).
- **First look (Q2 A).** The follow beat reserves one slot as the gift does, ranked after
  `cured` and before today/away, the L10 line, the trick, the dream callback, the promise
  and raised. The card reserves it only when the viewer's own `mine.follow_waiting` says a
  beat may be waiting (an open event of theirs, or this pet's, or a mood), so an ordinary
  first look keeps its three lines. A fetch that returns `{}` leaves the slot unsaid.
- **Questions under the budget:** the server asks only when `queued + notes < 3`. Pytest: a
  visit with `queued = 2` still asks.
- **Ask record:** `mark_asked(person, today, hour, kind)`; `asked.later_kind`; the phone ask
  passes `"phone"`. `ANSWERS` gains `how_day: ("tough",)`, `big_day`, `weekend`, `game`,
  `trick`. `fav_visitor` is checked against the world, not `ANSWERS`.
- **WS:** `text` is `vol.Optional("text"): object`, cleaned on the server (a bad text is
  dropped, the answer kept); `shared: true` drops it. Capability: the visit reply's
  `follow: 1`.
- **Ask box:** the yes of a text kind (big_day, weekend) is sent once, when the text step
  ends (ok, skip, empty, the time, a slide switch, the tab hiding). Every other kind keeps
  the old one-click path.
- **E13 send:** one `callWS`, no bubble, no stash; never on a shared screen.
- **Reply:** `{kind, beat, text?, choice?}`; a pet's own kinds (game, trick) only to that pet.
- **Names:** `FOLLOW_*`, `_follow*`; never `fav` (E8's L10 line owns `FAV_LINES`/`_favLine`).
- **Tests:** card-check checks pool membership (or a `vm`-pinned day), never an exact
  rotating line; pytest dates are explicit strings.

### F2 dream stories (Q4 A)

- The first look tells the picked dream's story to everyone, once a day per pet
  (`dream-<device>`). The asker's server note carries the story: if the first look already
  told it (the once-key is spent) the note says only the tail ("you": the asker's story,
  then the tail); if it didn't (a full look), the note tells the story, then the tail, and
  spends the key. Nobody else's note repeats it.
- `DREAMS` sees the slide (device, persona); journal, status and link news inherit the
  story; "you" is the friends line there.
- The callback day is `turnPick([2, 3, 4], <device>|dreamcb)`.

### F4 favourite visitor

- A one-time question in `ONCE` after `fav_season` (`ASK_LIKES_LEVEL`), per world: its
  tries are keyed `fav_visitor_<world>`, its answer `likes["visitor_<world>"]`, checked
  against the pet's world's visitors. Not a follow record.
- Greet priority: guest/pair (E10) > favourite (F4) > friend (E3) > usual. The favourite
  needs no sightings; 1 visit in 2 (`Math.random() < 0.5`), on the viewer's own screen.
- Names: `FAVV_LINES`, not `FAV_LINES`.

### F5-F7

- **F5 weekend:** Friday, by Q1 A's rule; yes → the text step, due Monday until Tuesday.
- **F6 game:** asked in the later slot; the answer is the choice. The beat is fetched when
  the picker opens (not at the first look), and the picker leads with the choice over
  G-a's daily pick and says a game line.
- **F7 trick (Q5 A):** asked only of an adult with a trick left (`trickMonth < 3`) or a teen
  (the first), at most once a generation-month per person (in that pet's bond). Shown from
  day 3 to day 5 at a first look, in the follow slot: the payoff line and a move the pet
  hasn't learned, in its idle list that day only. Skipped (said, not shown) when LS-a's
  monthly line was said on that look.
- Game and trick carry `pet` (the entry id); other pets never get their beat.

### E14 week strip (Q3 A)

- No new `PetState.week`: `state.social`'s day entries gain `dream` (kind), `visit` (the
  credited visitor's id, at `credit_visit`) and `weather` (rain, snow, sun, storm, fog),
  validated by `_social`. The strip reads them; visitor icons only when `findsShown()`,
  only days that hold something, no wish icon. `MOMENTS_KEPT` stays 10.

## Build log

Branch `crew/hatch-at-home-s2627-fresh-expand-fold-review-build`.

- **Plan** (this file): the scout's plan with the review folded in and the copy approved.
- **E1** `de4f41ed`: `dayOrdinal`, `turnHash`, `turnOrder`, `turnPick`, `_fresh`, `_lines`'
  `fresh`; the copy block between its markers, every table named in `scripts/copy-scan.js`
  and scanned by node and card-check `types`.
- **E2** `aee234f1`: pat P-a/P-b, praise P-c. Card-check `pat`, `react`, `types`; bench `ui`
  adds the pat, praise shots.
- **E3** `f63a0874`: visitor friends (per screen, `hatch-visitfriends-<device>`). Card-check
  `visitors`; bench preset `visitors-friends`.
- **E4** `70a1930e`: wake, night visitor and sunset callbacks, meals, crumb, cured, bubble pop.
  F-b's crumb isn't limited to babies; M-a only when the cure was yesterday and the pet is
  well. Card-check `moments`, `care`.
- **E5** `a2dd9afb`: game of the day (typed pets say their game's line, untyped the generic;
  the prompt only on cards ≥300 px), lucky number, win/lose, dig watcher, shiny berry. The
  dig checks live in card-check `resume`.
- **E6** `b539472f`, **E7** `638357e0`, **E8** `8026b319`: wishes in turns and W-b; how_day
  replies; welcome back, L10 favourite, monthly trick (spin is a new CSS turn, no art),
  shared stay ×2. Card-check `moments`, `personality`, `sharedscreen`.
- **E9** `94179001`: link news, journal dream, status today. Card-check `infrared`, `moments`.
- **E10** `17cb2014`: rare pair and guest. Card-check `visitors`; bench preset
  `visitors-rare` (`5568458b`).
- **F3** `098176b1`: the promise. Node `promise.test.js`; card-check `personality`.
