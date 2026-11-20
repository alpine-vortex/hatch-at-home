# Plan: your birthday, the big version (2026-11-20)

The pet already asks "when's your birthday?", keeps the answer per HA user (the people
store, `birthday: "MM-DD"`) and on the day says "happy birthday, <name>!! ♥" once with
the Happy Birthday chirp, and (if "birthday on my phone" is on) sends one push. This plan
makes that day a party and adds a countdown before it. Deadline: the first real birthday
it serves is 24 Nov 2026, so the countdown and party ship by 22 Nov.

Rules carried in: nothing names a real person or date in the repo (names come from HA
data at run time); no shared screen shows it (`sharedScreen()`); the date never reaches
the card (only a day count); Privacy bar in AGENTS.md.

## 1. Server (`coordinator.py`, `people.py`, `model.py`)

1.1 **`call_me`**: a new optional person key, a string of 1-16 characters (validated in
`_PERSON_KEYS`; stripped; empty or wrong shape dropped). Name rules, exactly:
- **Card, birthday lines** (countdown, party, `your_birthday`): `call_me`, else the bond
  nickname (at its level), else the HA first name, else the line without a name.
- **Card, every other line**: unchanged (it does not read `call_me`).
- **Push** (`_birthday_morning`): `call_me`, else the nickname, else no name (today's
  rule plus `call_me` in front). A quiet birthday changes the tune, not the name. Set today by an admin store edit; a settings row to set it
is out of scope (parked).

1.2 **`birthday_in`** in `_visit_prefs`: an int 0-5, present only when this person has a
`birthday` and it falls within the next 5 days by the server's local date (0 = today).
29 Feb follows `birthday_today` (the 28th in common years). Absent otherwise. Plus
`call_me` when set. These go to this person only (visit reply and the private channel's
prefs). Both paths: `_visit_prefs` (visit replies) **and** `_mine` (the private channel's
snapshot and its diffs, `channel_snapshot`), never on a shared screen's snapshot
(`mine` is None there). `_mine` must be re-sent when the server's day turns (the
countdown changes with no visit): acceptance is an open card that goes from 1 to 0 at
the server's midnight with no reload. Alongside it, `birthday_year`: the "YYYY" of the
occurrence being counted down to (so 12-30 counting to 01-02 says next year). The card
keys every once-per-day and once-per-party store on `birthday_year` and `birthday_in`,
never on the browser's date (the browser may be in another time zone). The date itself
never leaves.
New pure helper `model.birthday_in(birthday, today) -> int | None` (unit-tested across
month and year ends: 12-30 → 01-02 is 3, and Feb 29).

1.3 **`birthday_soon` note**: a "person" look note (said once a day per person, by the
first pet they look at), for `birthday_in` 1-5, below the celebrations in priority (it
never displaces `your_birthday`, a pet birthday or a friends month). Payload
`{"kind": "birthday_soon", "days": n}`. Not while the pet is resting or an egg.

1.4 **Push name**: `_birthday_morning` uses `call_me` when set, else today's nickname
rule. (The push sits in HA history, which the household's admins can read; that is inside
the household, so it passes the privacy bar.)

1.5 **Keepsake record**: when `your_birthday` is said, append the year to the person's
`parties` (a list of "YYYY" strings, max 10 kept, validated in `_PERSON_KEYS`). Changing
the birthday keeps it; "forget my birthday" (`async_forget_birthday`) and "forget my
data" both clear it (it is not in `_FORGET_KEEPS`), and the next `_mine` diff drops it
from an open card's journal. Tests cover both forget paths and a store reload. The journal reads it (4.3) from the visit prefs as
`parties: ["2026", ...]`.

1.6 **Tip-off for others** (owner's decision, 2026-11-20: it tells the house a birthday
is near, which in a small house may say whose; that is accepted, inside the household).
House-wide, names no one: `_visit_prefs` gains
`house_birthday_in`: the smallest `birthday_in` 1-3 among the *other* people in the people store
who keep a birthday, absent otherwise. Never the person, never 0. Card copy
says "someone" only.

1.7 **Admin service** (owner's addition, 2026-11-20): `virtual_pet.set_person_birthday(user_id,
birthday "MM-DD" optional, birthday_phone bool optional, call_me str optional)`, admin callers
only (`async_register_admin_service`), `user_id` must be a real HA user (nothing is created for an
unknown one). Values validate like `_PERSON_KEYS` (a real day; `call_me` stripped, at most 16, an
empty string clears it); a bad value refuses the call. Setting a birthday clears
`birthday_skipped`. The store is saved at once and every pet's channel re-sends that person's
`mine`. This replaces the admin store edit that 1.1 names; a settings row stays parked.

Tests: pytest for each of 1.1-1.7 (shape drop, window edges, once a day, priority under
celebrations, push name, parties append/cap, house tip-off excludes self and never says
who).

## 2. Countdown on the card (birthday_in 1-5)

2.1 The look note `birthday_soon` says one line from COUNTDOWN (below) with the name
(`call_me`, else the existing first-name rule) and a sparkle.
2.2 Now and then during the visit, an idle line from the same table (at most 2 more per
device per day, `oncePerDay`-style keys, never on a shared screen, never during a scene,
game or question: `_free(s)`), with a small chirp on 1 day to go.
2.3 Copy (lowercase house style, `{n}` = name, may be empty → the line without it):
- 5: "psst {n}... your birthday is in 5 days! ♪", "5 more sleeps till your birthday!"
- 4: "4 days to your birthday, {n}! i'm planning things ♪"
- 3: "3 more sleeps! i'm practising the song ♪", "3 days! do you like cake? i like cake"
- 2: "2 days to go, {n}! i can't sit still!"
- 1: "tomorrow's your birthday, {n}!! ♥", "one more sleep!! i'm so excited!!"
Copy goes in `ui-copy.js` (a `BIRTHDAY_SOON` table), through `scripts/copy-scan.js`.

## 3. Party day on the card (birthday_in 0, own screen)

3.1 **Trigger**: the server's `birthday_in === 0` and not `sharedScreen()`; never the
browser's date. Its own `_yourPartyFirst` key
(`hatch-yourparty-<device>-<user>-<birthday_year>`), not the pet's.
3.2 **Look**: party hat (`PARTY` costume), confetti on the first look and on each
greeting, a bunting banner across the top of the screen and a balloon bunch at one side
(props, `aria-hidden`, under the pet's z-order rules), the cake prop beside the pet with
lit candles.
3.3 **Words**: the first line is "HAPPY BIRTHDAY, {N}!!! 🎂" style (`{N}` the name;
existing `your_birthday` note, now 6 s, chirp `birthday`). Idle lines now and then from
PARTY_YOURS: "best day of the year! it's {n}'s birthday!", "make a wish, {n}! ♥",
"i saved you the biggest slice ♪", "party party party!! ♪", "you're the best, {n} ♥".
3.4 **Beats every season**: while the party is on, `_seasonTick` returns before its
visitor, treat and costume branches (the guard goes at the top, ahead of the treat at
card-season.js ~112, not beside the pet-birthday return at ~130); the season's ambient
art (sky, scenery) stays. If the pet's own birthday is the same day, `_partyTick` (the
pet's) is skipped too: one party, one hat, the confetti once, and the line says both
("it's your birthday AND mine!!"). Acceptance: bench shot of day 0 with Thanksgiving
pinned and `treat` forced to that day shows no turkey costume.
3.5 Reduced motion: no confetti or balloon bob (`calm()`); still the hat, banner, cake.
3.6 **Bench**: new flags `--your-birthday-in <n>` and `--call-me <name>` that set the prefs
the card receives; a `birthday` preset with 5, 1 and 0 (day and night) shots, plus 0 with
the Thanksgiving season pinned.

## 4. Extras

4.1 **Blow out the candles**: on party day, tapping the cake blows the candles out (the
pet leans and puffs, lit → out art), a confetti burst, the chirp, the line "yay!! now your
wish comes true ♥". Once per device per day; after that the cake stays out-candled.
Keyboard: the cake is a button (`aria-label="blow out the candles"`).
4.2 **A slice to share**: on party day the feed scene serves a cake slice instead of the
day's food (art swap in `SCENES.feed` / `bowlCuts`; the server's feed is unchanged).
Line: "birthday cake for breakfast! ♪".
4.3 **Keepsake**: the journal gets a "birthday parties" entry per year in `parties`: the
cake art and "{n}'s birthday party, <year>" (own screen only).
4.4 **Tip-off**: with `house_birthday_in` 1-3 (and the viewer's own `birthday_in` absent),
once a day per device: "psst... someone's birthday is in {d} days 🤫" (1: "...is
tomorrow 🤫"). Not on shared screens either (a shared screen could be the person).

## 5. Art (S5, Sol/Luna, pixel style of `frontend/ui/season_*`)

Name-free, transparent, same palette and outline as the party hat
(`season_party_hat.png`): `party_cake_lit` (whole cake, 3 candles lit, ~40x34 art px),
`party_cake_out` (same cake, smoke wisps), `party_cake_slice` (feed-bowl size, like
`food_*`), `party_balloons` (3-balloon bunch with strings, ~24x48), `party_bunting`
(a tileable pennant strip, ~64x12). Under 30 images including retries. Runs and prompts in
`private-content/art/runs/birthday-2026-11-20/` only.

## 6. Slices

| slice | what | depends on | tier |
|---|---|---|---|
| S0 | her data set on the household HA (admin store edit, not repo work) | - | 0 |
| S1 | server 1.1-1.7 + tests | - | 2 (people store schema) |
| S2 | card countdown (2.x) + bench flags (3.6 part) | S1 prefs names | 1 |
| S3 | party day 3.1-3.5 + bench preset, with stand-in art | S1, S2 | 1 |
| S4 | extras 4.1-4.4 | S3, S5 | 1 |
| S5 | art batch | - (runs now) | art review |
| S6 | ci-gate, version bump, release, HACS update on the house HA | all | - |

Order of cuts if time runs short: 4.3, then 4.4, then 4.2. S1-S3 are the must-ship.

## Parked

- A settings row for `call_me` (set it yourself).
- A birthday-list page for the household.

## Audit (2026-11-20, tier 2, range 5294bd46..3ae09f3b)

Player impact 1, nits 7. Fixed in 49167ce8: the cake button sat inside an aria-hidden
wrapper (screen readers skipped it), and `{n}` replacement now takes the name as plain text.
Left as is: `call_me` survives "forget my birthday" (by design, 1.5; "forget my data" clears
it); tip-off day key in the browser's zone; the admin service can't clear a birthday; a stale
party on a card whose channel drops past midnight; cake slice on the murk exit ease; ß upper-cases
to SS. Server and privacy bar: no findings.

## Polish (2026-11-20, after release)

- Countdown copy (2.3) widened to 3-4 lines a day (days 4 and 2 had one line, said up to three
  times a day); an idle line is never the one just said (`s.lastBdaySoon`).
- Art nits fixed: smoke over the blown-out candles is a two-tone curl that reads on light and dark;
  the slice's plate outline is closed (no nubs) with a full shade ring.
- Luna review of 5294bd46..57a6e75d: one finding, fixed: the tip-off's once-a-day key no longer
  includes the count.
