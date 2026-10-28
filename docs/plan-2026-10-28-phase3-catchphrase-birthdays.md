# Phase 3: a catchphrase, birthdays, and the one-time questions (build plan, draft 1)

Phase 3 of `plan-2026-10-28-voices-and-lines.md`: A5 (a catchphrase a friend gives
it), A6 (birthdays, the pet's and yours) and the one-time question fix. That plan's
"The second audit" section (rows 4, 5, 6, 11) wins over part A; this file says how
it's built. Version 0.33.0, its own PR.

## 0. The one-time questions (the fix comes first)

Today `choose_question` asks "favourite weather?" and then "favourite season?" in a
loop that `break`s: once the weather question has used its two tries unanswered,
the season is never asked (the stall). And they're only asked when no question was
asked that morning.

- One table of one-time questions, in order: `fav_weather` (level 3), `fav_season`
  (level 3), `birthday` (level 4, part 2), `catchphrase` (level 7, part 1; the
  pet's, below). Each has its own tries (`ASK_LIKES_TRIES` = 2, `ASK_LIKES_AGAIN_DAYS`
  = 14 apart), so one left unanswered never blocks another.
- At most one one-time question a day per person (across pets), in the later slot,
  `ASK_LIKES_FROM`-`ASK_LIKES_UNTIL` (11-16). A morning question no longer blocks it.
- The person's ones keep `likes_asked` (renamed in meaning only: `once_asked`,
  read from both keys); answered or skipped ones are never asked again.
- `catchphrase` is the pet's: its tries live in the pet's bond with that person
  (`bond["once_asked"]["catchphrase"]`, with the generation), so a new pet asks
  afresh and three pets each ask their own. `choose_question` gets a
  `pet_once` argument: the pet's one-time questions still open for this person.

## 1. A catchphrase a friend gives it (A5)

- **Its own.** `voice.catchphrase` in `species.json`, one or two short words that
  suit it: bird "tra la", squirrel "nutty", deer "mm-hm", gecko "tik tok", tarantula
  "fuzzy", kitten "mew mew", bunny "hop hop", otter "splish", octopus "wiggle",
  tree frog "hoppity", axolotl "smiley", bat "flappity", luna moth "flutter". Never
  another creature's sound. (The audit and the owner may change these.)
- **The question.** At bond level 7 (`R.CATCHPHRASE_LEVEL`), once per person per
  generation: "what should I say at the end of things?" with four choices and
  "keep mine": `hehe`, `yay`, `and stuff`, `toodles`, `keep mine`. Two rows of
  buttons on a 330 px card, never over the pet.
- **The answer** (websocket `virtual_pet/answer`, as now): a choice sets
  `PetState.catchphrase` (the pet's, like a villager's: the latest friend's choice
  wins, everyone hears it); "keep mine" changes nothing. Either way the bond marks it
  answered. The pet says "ok! I'll say it! <phrase>" or "ok! <its own>".
- **Saying it.** The card adds it to the end of about every fourth voiced line
  (`_speak` keeps a count per slide; the fourth, eighth...): "tweet! hi, Sam!
  toodles". Never on a question (ends in "?"), a line with the viewer's name or
  nickname in it, a sad line (those are never voiced), or past 60 characters. A
  burst has one voiced line, so never twice in one.
- **Sensor:** life stage `catchphrase` (the pet's current one, or its own), unrecorded.
  A new egg starts with its creature's own. Not on phones or in Assist.

## 2. Birthdays (A6)

### The pet's

- `PetState.hatched_on` (local date, ISO). Set right after the advance that
  hatched it (the same hook as the favourite snack). Old pets get it at load:
  their oldest care log entry's local date, else `born` plus the egg's hours
  (approximate; said so in the guide).
- **On its day** (the same day of the month as `hatched_on`; the 29th-31st fall on a
  short month's last day): in its first year, monthly: "I'm 3 months old today!";
  then yearly: "it's my birthday!! I'm 2 today!". Not a notification.
- Said through the visit's notes, so it's once per person per day and goes
  through the same line budget: note `pet_birthday` `{months}` or `{years}`, scope
  pet, keyed by the day.
- **The party** (yearly only, card-side from `hatched_on`, on every screen, shared
  ones too): confetti at the first look and a party hat as a costume (the season
  costume code, `sink`, `width`, head top). A season's costume wins that day: the
  hat waits for the next day without one (the line is still said on the day).
- Art: a party hat stand-in drawn by `art/birthday/make_party.py` (like
  `make_halloween.py`, into `art/birthday/out/`, then `ui/party_hat.png`); a request
  to the Hatch API Art session for the real one. Confetti is CSS.

### Yours

- **The question** (one-time, level 4): "when's your birthday?" with a month and a
  day picker and "skip" in the question box. The box stops every tap from reaching
  the screen (selects too) and stays 60 s.
- **The answer:** websocket `virtual_pet/answer` with `question: "birthday"` and
  `answer: "MM-DD"` (validated as a real month-day, 02-29 allowed) or `"skip"`.
  Stored privately in the people store (`birthday`, or `birthday_skipped`); never on
  a sensor, the bus or diagnostics. "skip" sticks.
- **Forget it:** a "forget my birthday" row on the status screen (only when one is
  kept; not on a shared screen), websocket `virtual_pet/forget_birthday`.
- **On the day** (02-29 falls on 28 February in other years):
  - The first pet you look at says "happy birthday, sunbeam!! ♥" (your nickname
    with it, else your first name), once (people store, keyed by the year), with
    a short tune (`CHIRPS.birthday`) if sounds are on. A pet that's sick or sad
    says a quiet "happy birthday ♥" with no tune.
  - Your phone (only with "notify me"): "Pip says: happy birthday, sunbeam! ♥" at
    your wake time: from the pet closest to you (`_closest_pet`, as the send-off),
    `passive`, once a year (people store), never as a bus event.
- **One celebration line per look:** your birthday, else the pet's birthday merged
  with the friendship month when both fall on that look ("I'm 3 months old, and
  we've been friends all that time! ♥"), else the friendship month. What doesn't
  fit waits for the next look (notes are keyed, so nothing is lost).

## Server

- `rates.py`: `CATCHPHRASE_LEVEL = 7`, `BIRTHDAY_ASK_LEVEL = 4`.
- `model.py`: `PetState.catchphrase: str | None`, `hatched_on: str | None`
  (`from_dict` type-checks; `lay_egg` gives a fresh egg neither);
  `pet_birthday(hatched_on, today) -> {"months": n} | {"years": n} | None`;
  `birthday_today(mmdd, today) -> bool` (with the 02-29 rule); `valid_mmdd`.
- `people.py`: the one-time table and `choose_question(..., pet_once=...)`.
- `coordinator.py`: `hatched_on` after advance and at load; the catchphrase
  question (`pet_once` from the bond), `async_answer` for `catchphrase` and
  `birthday`, `async_forget_birthday`; notes `pet_birthday`, `your_birthday`
  and the merged line in `_notes`; the birthday phone message at the morning wake.
- `__init__.py`: the answer command accepts `catchphrase` and `birthday` (its own
  validation); a `forget_birthday` command.
- `notify.py`: the birthday text, passive.
- `sensor.py`: `catchphrase`, `hatched_on` on the life stage sensor (unrecorded).
- Diagnostics: `catchphrase` and `hatched_on` are the pet's (kept); birthdays are
  in the people store (never in diagnostics).

## Card

- `QUESTIONS.catchphrase` and `QUESTIONS.birthday` (pickers: a month `<select>` and a
  day `<select>` sized to the month, and "ok" / "skip"; the box's `click`, `change`
  and `pointerdown` stop at the box).
- `NOTES.pet_birthday`, `NOTES.your_birthday`, `NOTES.birthday_friends`.
- `_speak` adds the catchphrase (rules above).
- The party: confetti and the hat at the first look on a yearly birthday.
- A "forget my birthday" row (the visit tells the card whether one is kept:
  `birthday_kept`, to this person only).
- `CHIRPS.birthday` (a few notes of a happy tune).

## Tests

- people: the stall is gone (the weather question exhausted, the season is still
  asked); a morning question doesn't block a one-time one; one one-time a day;
  `birthday` at level 4; skip sticks.
- model: `pet_birthday` monthly then yearly, the 31st in a short month;
  `birthday_today` with 02-29; `valid_mmdd`; `from_dict`; `lay_egg`.
- coordinator: `hatched_on` at hatch and at load; the catchphrase asked once per
  person per generation, the answer sets it, "keep mine" doesn't; the birthday
  answer stored privately (not in states, diagnostics or bus events); one phone
  message across pets, once a year; one celebration note per look and the merge.
- Card checks: the catchphrase on the fourth voiced line and not on a question or a
  named line; the birthday question's pickers (a tap on a select doesn't open the
  status); the pet's birthday line and party (an injected `hatched_on`); your
  birthday line; "forget my birthday" hidden on a shared screen.

## Order of work

1. The one-time question fix (people.py), with tests.
2. Catchphrase: data, server, card, checks.
3. Birthdays: the pet's, then yours; art stand-in.
4. Screenshots, the audit of the work, fixes, PR.
