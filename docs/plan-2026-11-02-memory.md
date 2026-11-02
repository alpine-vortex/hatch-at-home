# Per-person memory and the ask gaps, 2026-11-02 (build plan)

**Status: PLAN, docs only (tier 0).** Written by s2716 from the scout report s2714
(`~/.local/state/crew/archive/hatch-at-home-s2714-20261102-1303/report.md`) and the
owner's answers of 2026-11-02 (section 1). The scout's claims were checked against
`origin/main` `60ebf751`; where the code differs, section 2 says so. Names win over line
numbers. **Every pet line, flow label and sticker name here is DRAFT** until the first
mate approves it (decisions-2026-10-28.md, "How the crew works with the owner"). No final
player copy is in this plan.

Every build ship from this plan is **tier 2** (a privacy boundary, saved data), with an
adversarial privacy review like fresh-expand F1 got (section 14).

## 0. Summary

| Ship | What | Size | Tier |
|---|---|---|---|
| **M0** | Four gap fixes: dated asks before a came-home "how was your day?" (M0-a), fav-weather line in the turn rotation (M0-b), "ask me again" for favourites (M0-c), forget_me clears the dream pick (M0-d) | S-M | M0-b 1; M0-a, c, d **2** |
| **M1** | The switch, `person["memory"]`, admin option, the one-time ask, off/forget erase, the privacy test table; doors 2, 4, 5, 6, 12 | M | **2** |
| **M2** | Tag chips on big day and weekend; doors 1, 3, 9, 10 (weekday pattern), 11 | M | **2** |
| **M3** | "Things you told me" page with per-item forget, and stickers (doors 7, 8) | M-L | **2** |

Order: M0 (the four parts are independent and can be four small commits or four ships) ->
M1 -> M2 -> M3. M2 and M3 both need M1's record and validation; M3 needs M2's tags to show
stickers, but can ship first with an empty sticker row if M2 slips. Nothing in M0 waits on
the owner.

## 1. Decisions

### Owner, 2026-11-02 (answers to the scout's Q1-Q4)

- **Q1 = C. Memory keeps picks and fixed tags with dates, plus weekday patterns** (door
  10: "match tomorrow? i'll be cheering"). **Never typed words, never anyone's names.**
  Typed words stay memory-only, as the follow-up system keeps them today.
- **Q2 = A. A private "things you told me" journal page**, on the person's own
  non-shared screen only, with **per-item forget** and **a sticker per tagged big day.**
  This **supersedes the 2026-10-28 decline of "memories in the journal"**
  (plan-2026-10-28-daily-checkins.md, "Second pass") **for this opt-in page only.** The
  rest of that decline stands: no memories in the public journal, no daily diary
  (HANDOFF.md), nothing from this page on any shared screen.
- **Q3 = A. Per person, off by default; the pet asks once, at bond level 4.** An **admin
  household option allows memory, default on.**
- **Q4 = C. Kept until forgotten** (the person turns it off, "forget my data", or forgets
  an item), **capped by count only.** The caps are in section 4.

### First mate, 2026-11-02

- **M0 gap 1.** On the Friday weekend-ask day and the Monday (and Sunday) big-day-ask days,
  the dated ask goes **before** a came-home "how was your day?". This **re-decides FM Q1 A
  on the reconcile** (the comment at `people.py:723-725`, "never ... a came-home how_day").
- **M0 gap 2.** The fav-weather line goes into the existing turn rotation (`turnPick`) so
  it doesn't repeat word for word.
- **M0 gap 3.** Favourites get an "ask me again".
- **M0 gap 4.** `forget_me` also clears the dream pick.

## 2. What was checked against the code

Read at `origin/main` `60ebf751`. The scout's claims held, with these corrections:

| Scout claim | Check |
|---|---|
| came-home how_day goes before the follow-up (`people.py:718-729`) | True: line 718 (`came_home in DAY_ZONES or came_home == "home"`), the follow-up at 723-729. Note the test is also true for `"home"` (a friend just home), not only work and school. `tests/test_people.py:63-65, 99-102` pin the old order for how_day; the new order changes only days when a dated follow-up is due. |
| `JUST_HOME_HOURS = 2.0` (`rates.py:444`) | True. |
| fav_weather: one fixed line, once a day (`coordinator.py:1898-1912`, `ui-copy.js:283`) | True. The server's `people.said(user, "fav_weather", today)` is the once-a-day guard; the card's `fav_weather` entry in `NOTES` (`ui-copy.js:283`) is one string per weather. |
| `forget_me` leaves the dream pick (`__init__.py:558-576`, `model.py:3151`) | True. `async_forget_games` (`coordinator.py:2787`) drops only `parked` and `game.player`. `state.dream.user` is also read at `coordinator.py:1846` (`yours`) and is a second place the person's id stays (about a day). |
| `_event_ok` forbids `pet` on a big-day event (`people.py:525-527`) | True (`return "pet" not in v` for big_day and weekend). Door 9 therefore keeps its "said by" in memory, not in the event (section 6). |
| Options are household options | **Not quite.** All options are per pet entry (`config_flow.py`, `topics.py`: `CONF_PRIVACY` and `CONF_HOUSE_WORDS_PRIVATE` sit in the "people" topic and are read from `self.config_entry.options` in `coordinator.py:420-426`). There is no integration-wide option. Section 5 says how a per-person record meets per-pet options. |
| `People.forget` pops the whole record | True, and keeps `birthday_skipped` (`people.py:244-254`). Section 5 says the same for the memory question. |
| `REDACT_PEOPLE` exists (`diagnostics.py:72`) | True; `memory` joins it. |
| `_mine` is per person and not pushed to shared screens (`coordinator.py:2558`, `2626`, `2664`) | True. |
| Assist knows the asker (`intent.py:245`) | True (`bond_for(intent_obj.context.user_id)`). Memory still never reaches `intent.py` or `llm.py`. |

## 3. Rules (R1-R12, as decided)

These are the scout's proposals with the owner's answers applied. Changes from the scout:
R6 follows Q4 = C; R2 follows Q3 = A; R10 follows Q3's default-on admin option.

- **R1. Per person, not per pet.** Memory is `person["memory"]` in the people store, one
  switch for every pet, as "my day" is. Bonds never hold memory, so "forget my data"
  reaches all of it.
- **R2. Opt-in, by the person, on their own screen.** Off by default. Turned on only by a
  websocket command from a personal screen, never by a service (the recorder would keep
  who opted in), through the settings row or the pet's one-time ask (a "yes" to it is the
  same command's effect). The ask comes from bond level 4, once; "not now" sticks.
- **R3. Shared screens and other people.** A shared screen never asks, shows, fetches or
  adds to memory. The server refuses a memory command that says `shared`. Memory is
  fetched only by `connection.user.id`. `_mine` carries a `memory_on` boolean and an
  `memory_allowed` boolean and nothing else about memory. Nothing is cached in
  localStorage. The guide says what it already says for typed words: a family sharing one
  HA login shares one memory, and a tablet signed in as one person shows that person's
  page to whoever holds it. The page asks one confirm tap before it shows (draft), as
  `forget_me` has its two-tap guard.
- **R4. Never off the private path.** Memory is on no entity state or attribute, no bus
  event, no logbook entry, no service call or script trace, no phone notification, no
  diagnostics dump (`memory` joins `REDACT_PEOPLE`), no integration log, no Assist or LLM
  output, no `debug` sensor. Every row of the F1 privacy table (plan-2026-11-01-fresh-expand.md,
  "The privacy table") applies again, with the same tests.
- **R5. Only fixed-list values and dates on disk.** No typed words, no names (not the
  person's, not another person's, not a pet's), no times of day, no places, no free text.
  Anything outside the fixed lists is dropped on load, entry by entry. The `appointment`
  tag gets no anniversary, no recap count, no sticker, no weekday pattern.
- **R6. Kept until forgotten; count caps only (Q4 = C).** No time-based expiry on a
  remembered thing. Each class has a count cap; when full, the oldest entry goes (section
  4). Operational bookkeeping that is not a memory (the door 9 "said by", the one-line
  `said` marks) is pruned by its own day, as follow-up events are today. `People.prune`
  gets the cap step; load drops invalid entries as it drops an expired event
  (`people.py:219-220`).
- **R7. Every erase path erases for real, saved at once.** Turning the switch off pops
  `person["memory"]` and saves immediately, like `forget`. "Forget my data" erases it with
  the rest. A per-item forget removes that entry and saves at once. The admin option
  being off (section 5) erases every person's memory. Favourites, the birthday and the
  follow event stay on "off": they predate the option and have their own controls.
- **R8. Storage and migration.** Memory is a key inside the person record, not a new
  store, so an older version's "forget my data" (which pops the record) still erases it.
  The key is additive: `STORE_VERSION` stays 1. After a downgrade the record stays on disk
  unread and uncapped (`people.py` keeps unknown keys as they are); the guide says so.
  Each entry is validated on its own, as `_event_ok` does.
- **R9. Assist: no.** Memory never reaches `intent.py` or `llm.py`; a pytest greps their
  output after memory is filled. A spoken reply is heard by the room, and LLM agents are
  often cloud services.
- **R10. Child users.** HA has no age. (a) Tags and picks only, never words (R5), so a
  child's details never reach disk. (b) Only the person themselves can turn it on: a
  parent's login can't turn it on for a child's account, and the reverse. (c) The admin
  option (section 5) hides the switch for everyone when off; its default is **on** (Q3 =
  A), so the guide tells a household with children that the option is there and what it
  does.
- **R11. HA backups.** The people store is in every HA backup, cloud agents included.
  "Off", "forget" and a per-item forget cannot reach an earlier backup, and a restore
  brings memory back. With Q4 = C memory now lives as long as the person wants it, so
  the guide says plainly, next to the existing "kept in Home Assistant's history" notes,
  that backups hold it. Typed words are never saved, so they are never in a backup (true
  today).
- **R12. A damaged store.** Memory goes with the person record into the
  `.damaged.<time>` copy (`backup.py`); the existing repair text covers it. The guide's
  admin-erase line already names those copies; add "and memory".

## 4. What is kept, and the caps

All inside `person["memory"]`, all values from fixed lists or ISO dates.

```
memory = {
  "on": true,                          # the switch; the dict exists only while on
  "since": "2026-11-14",               # day it was turned on (the page can say it)
  "tags":  [{"day": "2026-11-14", "kind": "big_day", "tag": "show"}, ...],
  "picks": {"dream": [{"day": ..., "pick": "snacks"}, ...],
            "game":  [{"day": ..., "pick": "dig"}, ...],
            "guess": [{"day": ..., "pick": "sun"}, ...],
            "great": [{"day": ..., "ask": "how_day"}, ...]},
  "since_told": {"fav_weather": "2026-03-02", "fav_season": "...", "visitor_<world>": "..."},
  "said": {"door2": "2026-11-15", ...},   # last day a door's line was said
  "heard": {"day": "...", "pet": "<pet id>"},   # door 9 only; pruned after its day
}
```

| Class | Cap | Why this number |
|---|---|---|
| `tags` | **120 entries**, oldest out | Big day is asked at most once a week and weekend once a week (`BIG_DAY_GAP` 6, `FOLLOW_ASK_PER_WEEK` 2), so at the very most about 104 tags a year. 120 holds the anniversary window (13+ months) even for someone who says yes to everything; for most people it spans several years. About 40 bytes an entry, so under 5 KB. |
| `picks.dream`, `.game`, `.guess`, `.great` | **5 each**, oldest out | Doors 4, 5 and 12 look at "3 of the last 5"; more history buys no door and keeps more in backups. 20 entries at most. |
| `since_told` | one per favourite: weather, season, one per world | Bounded by the fixed lists (at most about 12). |
| `said` | one per door (12) | A "last said" day so a door doesn't repeat; bounded by the door list. |
| `heard` | 1, dropped after its day | Door 9's "which pet already cheered this big day", so pets don't all say it. Bookkeeping, not a memory (R6). |

The whole record is bounded at roughly 160 entries, well under 10 KB.

**Not kept, even with the switch on:** typed words (they stay memory-only until the event
closes, as now); any name; times, places; **a "tough" mood** (the soft morning stays
memory-only for one day as today; a saved list of someone's bad days has no door that
needs it, and a backup shouldn't hold one). Only "great" is saved, for door 2. No
right/wrong count for guesses or games (the "no score" rule, guide.md "Using the card").

**The fixed tag list (draft):** test, match, show, trip, party, lesson, work thing,
appointment, something else. Translatable, so no free text; the first mate approves the
labels.

## 5. The switch, the ask, the admin option (M1)

**The person's switch.** A row beside "my day" in the settings sheet
(`card-status.js:190, 249-250`, a `_mineSwitch` on `mine.memory_on`), shown on a personal
screen only, and only when `mine.memory_allowed`. WS command `virtual_pet/memory`
`{entity_id, enabled}` follows `my_day` (`__init__.py:765`): pet looked up by `entity_id`,
then `async_set_memory(user, enabled)` and `_push_everywhere()`. Off erases (R7).

**The one-time ask.** A `memory` entry in the one-time list (`people.py` `ONCE`, level 4,
after `birthday`, so `ASK_ONCE_GAP_DAYS` = 3 keeps them apart), asked only when
`memory_allowed` and not yet on. Answers "yes" / "not now" in the `phone` question's
shape (`QUESTION_KINDS`, the WS `answer` schema). "Yes" sets the switch; "not now" sets
`memory_asked: true` in the person record, and **it survives `forget_me`**, as
`birthday_skipped` does (`people.py:244-254`): a refusal is remembered so the pet doesn't
ask again. That boolean is the only memory-adjacent key outside `person["memory"]`, and
it holds no content. Tries and spacing follow the `likes_asked` pattern. Copy: DRAFT.

**The admin option.** `CONF_MEMORY` in `const.py`, a `BooleanSelector` default **True**
(Q3 = A), in the existing "people" options topic beside `CONF_PRIVACY` and
`CONF_HOUSE_WORDS_PRIVATE` (`topics.py`, `config_flow.py:379-380`), with strings in
`strings.json` and `translations/en.json`. Options are per pet entry, so: a pet adds to
memory, speaks from it and asks for it **only if its own option is on**; `memory_allowed`
in `_mine` is the viewed pet's option. The person's one record is shared by all pets, so
an admin turning it off on one pet only silences that pet. **When it is off on every pet,
every person's memory is erased** (see open question 1). The options-update listener and
the daily prune both evaluate "any pet allows it".

## 6. The doors, by ship

All lines are DRAFT. Each is said only on that person's own non-shared screen, only with
the switch on and the option allowed, and once per door per its own spacing (`said`).

| # | Door | Example (draft) | Ship |
|---|---|---|---|
| 2 | **Good-day echo:** morning after a "great" to how_day or big_how | "yesterday was a great one! more of that" | M1 |
| 4 | **Running joke:** 3 of the last 5 dream picks the same | "snacks again?! hehe, ok" | M1 |
| 5 | **Your habit:** the last 5 guesses all the same way | "you always say sun! my sunny friend" | M1 |
| 6 | **Since you told me:** first time a favourite comes back after it was told. Joins M0-b's rotation as extra lines | "it's snowing! you told me snow's the best" | M1 |
| 12 | **The game you picked:** the picker opens after a lapsed pick, or it's the most-picked of the last 5 | "your dig again? i'm ready" | M1 |
| 1 | **Week-later echo:** about 7 days after a tagged big day, once | "i still think about your show!" | M2 |
| 3 | **Anniversary:** a year after a tagged big day or trip (never `appointment`) | "a year ago today was your big trip!" | M2 (dormant until a year passes) |
| 9 | **Pets compare notes:** with several pets, a second pet nods to a big day another pet already cheered | "Mochi told me about your test! good luck" | M2 |
| 10 | **Weekday pattern:** the same tag on the same weekday 3 times | "match tomorrow? i'll be cheering" | **M2, its own last commit** |
| 11 | **Friendship-year recap** on the 12-month friendship day (`coordinator.py:1825-1837`) | "a whole year! 9 big days, 2 trips and a lot of snack dreams" | M2 |
| 7 | **"Things you told me" page** | see section 9 | M3 |
| 8 | **Stickers** | see section 9 | M3 |

**Door 10, now in scope (Q1 = C): M2, its own last commit.** It needs only the M2 tag
history; the weekday is computed from the saved date, so **no new data is kept** for it.
Because it is the most sensitive door, the plan limits it:

- Only for tags `lesson`, `match` and `show` (a weekly activity). Never `appointment`,
  `test`, `work thing`, `party`, `trip` or `something else`.
- Only after **3 of the last 5 entries for that tag fall on the same weekday**, said on
  the **eve** of that weekday, at most once per pattern per 28 days (`said`).
- The line never names the weekday's reason beyond the tag, and never says the pet
  "knows" or "has been watching" (no surveillance framing; first mate checks the copy).
- Forgetting any one of those tag entries from the page ends the pattern at once (fewer
  than 3 remain), and turning memory off erases the history it came from.
- Separate commit so the first mate can drop it from the batch without touching the rest.

**Door 9 and `_event_ok`.** The event record stays free of `pet`. The "which pet already
cheered" lives in `memory["heard"]` (one entry, dropped after its day) and is read when
a second pet's first look finds a tagged big day of the day.

**Door 12 also closes** Part 1 item 6 of the scout (a game picked and never played), gently.

## 7. M0: the gap fixes

Independent of M1. Four small commits; M0-b alone is tier 1.

### M0-a. Dated asks go before a came-home "how was your day?" (tier 2)

**Rule (first mate, 2026-11-02):** in `choose_question` (`people.py:718-729`), on a day
when a dated follow-up (`FOLLOW_DATED`: weekend on Fridays, big day on Sundays and
Mondays) is due, it is asked **before** the came-home how_day. The sequence in the later
slot becomes: one-time question (unchanged) -> **due dated follow-up** -> came-home
how_day -> rotation's own how_day -> the other follow-ups (trick, game) -> dream/guess ->
fallback how_day.

- The rule is limited to `FOLLOW_DATED`. `trick` and `game` are the pet's own and stay
  after the came-home ask, as today.
- The rotation's own how_day (every third day, `ROTATION[ordinal % 3]`) still goes before
  the follow-up, unchanged: the decision was about the came-home ask, and moving the
  rotation's how_day is a bigger change in the week's balance. On that Friday the weekend
  ask is still lost. Noted in section 12 as a known remainder.
- The existing caps hold: no ask while an event is open, 2 dated asks a week, a kind
  missed twice rests 14 days, one later question a day. A commuter's Friday gets the
  weekend ask instead of "how was your day?"; the how_day that evening is simply not
  asked (one later slot a day). That is the intent.
- `follow_question` takes `hour >= R.ASK_DAY_FROM` today; the came-home ask has no hour
  floor but `JUST_HOME_HOURS`. If someone is home at 15:00 on a Friday the dated ask
  waits for 16:00 and the came-home how_day is asked as before; decided: the dated ask
  does not move earlier than `ASK_DAY_FROM` (a "weekend plans?" ask at 15:00 is odd, and
  this keeps `follow_question`'s one gate).
- Update the comment at `people.py:723-725`; it names FM Q1 A and must now name this
  decision and its date.

**Acceptance.**
- A person with `came_home="work"`, hour 18, on a Friday with no open event and the
  weekend kind off rest: `choose_question` returns `weekend`. Same for Monday `big_day`
  and Sunday `big_day`.
- Same person on Thursday: `how_day`, as before. Same person on Friday with an open event,
  or after 2 dated asks that week, or with `weekend` resting: `how_day`.
- `came_home="home"` behaves the same as `"work"`.
- `tests/test_people.py:63-65, 99-102` still pass unchanged (they use 2026-10-28, a
  Wednesday, which is no follow-up day).
- A new test per row above, in `tests/test_people.py` or `test_follow.py`.

### M0-b. Fav-weather line in the turn rotation (tier 1, card only)

- `ui-copy.js:283` `fav_weather` returns one string per weather. Replace it with a list
  per weather (3 lines each, **DRAFT**), picked by `turnPick(list, `${device}|favweather`)`
  as the other day lines take turns (`world.js:252-296`, `lines-fresh.js`). No line twice
  within 3 days.
- The server stays as is: still one `fav_weather` note per day on a matching day
  (`coordinator.py:1898-1912`, guarded by `people.said`). The fix is only that the line
  varies.
- New lines go in `lines-fresh.js` and the `COPY_TABLES` entry in `scripts/copy-scan.js`,
  so the scan checks them (no nagging words, 40 characters with the longest fill, no `?`
  outside a question, no `!!!`, no digits). The scan's nag list includes **"still" and
  "again"**; M0-b's lines must avoid them, and so must M1's table (section 12).
- M1's door 6 lines join this list, so the since-you-told-me variant replaces one
  plain line after the favourite has been told, not a second line.

**Acceptance.** `tests/js/turn_pick.test.js` style test: for each of the four weathers,
three consecutive days give three different lines, and no line repeats within 3 days; the
copy scan passes with the new table named in `COPY_TABLES`; card-check section `types`
(which runs the scan) passes.

### M0-c. "Ask me again" for favourites (tier 2, touches saved likes)

- A row in the settings sheet's personal group, shown only on a personal screen and only
  for a favourite that is set (`fav_weather`, `fav_season`, the current world's
  `fav_visitor`): the value (read from `mine`, which already carries `fav_visitor`) and
  a button "ask me again" (**DRAFT** label), with a confirm tap.
- New WS command `virtual_pet/ask_again` `{entity_id, kind}` with `kind` in the three
  favourites; refuses `shared`. Server: pops the `likes` key, resets that kind's
  `likes_asked` tries (so the 2-try limit starts over), and does **not** touch
  `once_last`, so the 3-day gap still spaces it from other one-time asks. Saved at once.
  The next eligible look (11:00-20:00, bond level 3+) asks it again. Nothing else about
  the person changes (birthday, switches, history stay).
- `_mine` gains `fav_weather` and `fav_season` values, as it already has `fav_visitor`.
  The channel is the person's own; sensors, house view, diagnostics and bus stay free of
  them (`likes` is already in `REDACT_PEOPLE`).
- No memory option needed: this works with memory off.
- Once M3 ships, the same buttons appear on the page next to each favourite; the settings
  row stays as the way to do it without the page.

**Acceptance.** Pytest: `ask_again` removes the like and `noted` is untouched; the next
`choose_question` in the window returns that kind; a shared call is refused; user B's call
never touches user A's record; the answer is not on the bus (`MATCH_ALL` listener) nor in
a `caplog` on the integration and `websocket_api` loggers; the sensor and `_house_view`
JSON hold no favourite. Card-check: the row is absent on a shared screen and on a pet with
no bond; the button asks a confirm, then calls the stub once (card side).

### M0-d. `forget_me` clears the dream pick (tier 2, small)

- `async_forget_games` (`coordinator.py:2787`) also drops the person's entries from
  `state.dream_picks` (`model.py:3151`) and, if `state.dream["user"] == user`, removes
  that key from `state.dream` (read at `coordinator.py:1846`; "your idea" for the asker
  disappears, the story to everyone stays). It saves if anything changed, as it already
  does for the dig. Check `model.py`'s dream loader and `PetState.from_dict` accept a
  dream without `user` before relying on it; if not, set it to `None` and loosen the
  loader.
- The guide's "erases all of that, at once" (guide.md "Privacy: what the pets remember")
  is then true for the dream pick; add the pick to the list of what is kept.

**Acceptance.** Pytest in `tests/test_forget.py`: user A picks a dream, user B picks one;
A forgets; the saved pet state has no entry with A's id in `dream_picks`; the morning
dream still comes from B's pick; after a wake with A's pick already turned into
`state.dream`, forget removes A's id from `state.dream` and the asker note's `yours` is
false; B's data is untouched.

## 8. M1 and M2: building notes

**M1 (tier 2).**
- `people.py`: the `memory` key in the person validators (`_ok` table near line 491), a
  `_memory()` validator that drops invalid entries one by one and enforces the caps on
  load, `set_memory(user, on)`, `memory(user)`, `remember(user, kind, entry)` (cap-aware),
  `forget_item(user, key)`, `forget_memory(user)`, and the prune cap step. Memory changes
  save with the usual delayed save, except **off, forget and per-item forget**, which save
  at once (`async_save_now`).
- `coordinator.py`: where an answer is stored today (`async_answer`, near line 2193 for
  the dream pick; the guess; how_day's "great"; the game pick), add `remember(...)` **only
  when `memory_on` and the pet's option allows it**. `_mine` gets `memory_on` and
  `memory_allowed`. The door lines are `note` kinds in the existing notes list, with the
  `said` guard.
- `__init__.py`: WS `virtual_pet/memory` (switch). The answer command's `memory` question
  kind. `REDACT_PEOPLE` gains `memory` (`diagnostics.py:72`).
- `const.py`, `config_flow.py`, `topics.py`, `strings.json`, `translations/en.json`: the
  option, with a description line saying what it does and that turning it off on every
  pet erases what people told their pets.
- Card: the settings row, the answer for the one-time ask (it is **not** added to
  `STASHED_QUESTIONS`, `prefs.js:378`: a failed send leaves nothing in localStorage),
  and the door lines in `lines-fresh.js` with `COPY_TABLES` entries.
- Docs: guide "Privacy: what the pets remember" gets the memory paragraph (what is kept,
  what is not, backups, the shared login, downgrade), the settings table gets the switch
  and the option, `features.md` section 7 gets a row.

**M2 (tier 2).**
- The tag step in the big_day and weekend flows: after "yes" (and the day, for big day),
  **a chip row** (the fixed list), shown only when `mine.memory_on`; with it off, the ask
  is exactly as today (typed step included). With memory on, the chips replace nothing:
  the optional typed step stays (memory-only), and a tag may be skipped ("no tag").
  The tag goes in the `answer` command as `tag` (a fixed list, `vol.In`), so no free text
  can arrive in that field and a schema failure can't echo it.
- `memory["tags"]` gets the entry when the event is created. Pytest: an invalid tag is
  refused and nothing saved.
- Doors 1, 3, 9, 10, 11 as in section 6. Door 3's lines are dormant until a year passes;
  tested with the freezer.

## 9. M3: the page and the stickers (tier 2, card-heavy)

**The page.** A "things you told me" page in the journal's page family
(`card-journal.js`: `_pageBand`, `_pageShown`, the "journal" and "every world" pages), linked from the
journal when `mine.memory_on` and the screen is personal. It is fetched **on open** by WS
`virtual_pet/memory_get` (refuses `shared`; returns the asker's items only), shown
after the one confirm tap (R3), kept in no localStorage and dropped from the DOM and the
card's fields when the page closes.

What it lists (all DRAFT wording): the favourites told (weather, season, the visitor of
each world) with their "since" day and "ask me again"; the tagged big days and trips by
date; recent picks (dream, game, guess); noticed weekday patterns (door 10) as their own
items, so a person sees exactly what the pet noticed; and one line saying what is never
kept (typed words, names). Each item has its own **"forget this"** (WS
`virtual_pet/memory_forget` `{key}`, key = the entry's own `(list, day, tag/pick)`, no
new id), a tap-to-confirm, saved at once. The page also has "stop remembering" (the switch
off, erases).

**Stickers.** One small sticker per **tagged big day** (kind `big_day`; also `trip`),
shown on the page only. Cosmetic: no streak, no count shown as a score, nothing lost or
gained by skipping, never a sticker for `appointment` or `something else`, and a
per-item forget removes it with the tag. Stickers are derived from `tags`: **nothing new
is kept.** First pass: the existing card icon glyphs and emoji by tag, no new art. If the
owner wants painted stickers later it is a separate art job through the usual art path,
not part of this plan.

**Door 7 and `_mine`.** The page's data does not enter `_mine`, the channel snapshot or
the sensors.

**Acceptance.**
- Card-check (new section `memorypage`): absent on a shared screen (no `memory_get` call,
  no link); present on a personal screen only with `memory_on`; the confirm tap guards the
  content; "forget this" calls the stub once with the item's key; after "stop
  remembering" the page is gone. The page contents are `textContent` only.
- Bench: a `--memory` preset pinning `mine.memory_on` and a fake `memory_get` reply
  (the bench's fake `callWS` answers only what it is taught, `dev/bench/README.md`);
  shots: empty, a few items, all stickers, a long list at the cap. Per AGENTS.md, add
  this state to the bench rather than falling back to HA.
- Pytest: `memory_get` returns only the asker's items; user B gets none of A's; per-item
  forget removes exactly one entry and saves at once.

## 10. The privacy test table (every tier-2 ship)

R4's list is the F1 table repeated for memory. M1 builds the test file
(`tests/test_memory.py`); M2 and M3 add rows for what they add. "Test" is what the
adversarial review should be able to run.

| Concern | Rule | Test |
|---|---|---|
| Sensors and attributes | Never (R4) | Pytest: with memory on and full (caps hit), the JSON of every sensor's attributes, `_house_view`, and `debug` holds none of the memory strings (tags, picks, dates of tags) |
| `_mine` and the channel | Only `memory_on` and `memory_allowed` booleans (R3) | Pytest: `_mine(user)` and a channel snapshot grep clean for tag and pick values; `memory_get` is the only carrier |
| Bus, logbook, recorder | WS commands, not services | Pytest: a `MATCH_ALL` listener across `memory`, `memory_get`, `memory_forget`, `ask_again`, and the answer with a tag sees no event holding memory or the choice |
| Logs | No integration log with memory or answers; no schema failure echoing a value | Pytest with `caplog` on the integration **and** `homeassistant.components.websocket_api`: a bad tag, bad `key`, wrong type leaves no record containing the value |
| Shared screens | The card never asks, shows, fetches or adds; the server refuses `shared` | Pytest: each memory command with `shared: true` is refused and saves nothing. Card-check `sharedscreen`: no memory WS call, no row, no link, no page |
| Other people | Only `connection.user.id` | Pytest: B's `memory_get` and `memory_forget` never see or touch A's entries; B turning memory on leaves A's record alone |
| WS fetch on demand | The page is fetched on open, held in no cache | Card-check: after closing the page, no memory text in the DOM; no `hatch-memory-*` localStorage key ever; `STASHED_QUESTIONS` doesn't include the memory ask |
| Erase: off | Pops `person["memory"]`, saved at once | Pytest: turn off, then read the store file (`hass_storage`) with no delay: no `memory` key, no entry; `forget`'s save-at-once rule holds if HA stops right after |
| Erase: forget me | `People.forget` takes memory with the record; `memory_asked` survives like `birthday_skipped` | Pytest: forget, then the store has no memory, no tags, no picks; `memory_asked` stays, so the ask isn't repeated |
| Erase: per item | One entry gone, saved at once, a pattern ends with its history | Pytest: forget one tag; store and `memory_get` both lack it; a door 10 pattern with 3 entries stops after one is forgotten |
| Erase: admin option off | Off on every pet erases every person's memory | Pytest: turn the option off on the only pet; the options-update listener erases; with two pets, off on one leaves it, off on both erases |
| Retention | Count caps only (Q4 = C); invalid entries dropped on load | Pytest: 130 tags saved -> 120 kept, oldest gone; a hand-edited store with an unknown tag, a bad date, a text-like value drops those entries and keeps the rest; a 13-month-old tag is **kept** (no time prune) |
| What may be stored | Fixed lists and dates only (R5) | Pytest: every key and value in `person["memory"]` after a full flow matches the fixed-list schema; no typed text is anywhere in the store after a big day with words |
| Typed words | Memory only, as today | Pytest: after a big day with text and memory on, the saved store, the pet state and `memory_get` hold none of the text |
| Backups | The store is in backups; the guide says so (R11); typed words never are | Guide text exists (a docs test greps for the paragraph); pytest: the saved JSON is the full extent of memory, no second file |
| Diagnostics | `memory` is in `REDACT_PEOPLE` (R4) | Pytest: a diagnostics dump with memory filled holds none of it |
| Assist and LLM | Never (R9) | Pytest: the spoken status and the LLM tool JSON with memory filled hold no tag, no pick, no "remember" line |
| Notifications | Never | Pytest: `notify.message()` and send-offs hold no memory |
| Child users | Only the person turns it on; tags and picks only; admin option can hide it (R10) | Pytest: user A's `memory` command never changes user B's record; the option off removes `memory_allowed`; the guide paragraph for households with children exists |
| Migration up | Additive; `STORE_VERSION` 1; old stores load | Pytest: a pre-memory store loads with no `memory` key and every behaviour as before; the switch off is the default |
| Migration down | An older version keeps the key unread (R8) | Pytest: a record with `memory` round-trips through the older `_person` validator without loss (the validator keeps unknown keys); the guide says what a downgrade leaves |
| Damaged store | Memory goes with the record to the `.damaged` copy (R12) | Existing `test_damaged.py` style test with memory present; the guide's erase line names memory |
| Concurrency | A visit and a switch change don't interleave | Pytest: the switch change takes `people.lock(user)`; an answer racing an off-switch cannot re-add memory after the erase |
| Dream pick (M0-d) | forget_me leaves no id in the pet's save | See M0-d acceptance |
| HTML | `textContent` only | Card-check: a tag label, a pick value and an item key with markup render as text |
| Door order | One door per visit; a door never runs on a shared screen or with the switch off | Pytest/JS: the door note is absent in the shared snapshot and with `memory_on` false |

## 11. Device queue

I found no document defining a "device queue" in the repo, so I read it as the checks on
real phones and tablets that the bench and card-check cannot make. Per slice, if any:

| Slice | Real-device check |
|---|---|
| M0-a, M0-b, M0-d | None. Server and copy rules; pytest and card-check cover them. |
| M0-c | One look on a phone that the "ask me again" row and its confirm tap fit the settings sheet. |
| M1 | One phone, one tablet signed in as one person: the switch row, and the pet's one-time ask answered by tap. |
| M2 | One phone: the chip row for tags fits a narrow screen without scroll traps; a tap on a chip registers (the chips are a new tap target). |
| M3 | One phone and one wall tablet: the page's confirm tap, scrolling a page at the cap, "forget this" confirm; a tablet **shared** screen shows no link and no page. |

If "device queue" means something else (a queue of art or sprite jobs to the codex
tools), none of these slices needs one: no new art (section 9).

## 12. Known remainders and cautions

- **Rotation's own how_day on a follow day** still goes first (M0-a). On a Friday that
  is the rotation's how_day day (about 1 in 3), the weekend ask is still lost that
  Friday. It comes next Friday. If the first mate wants it changed too, it is a one-line
  move in `choose_question`, but it shifts the week's balance.
- **The copy scan's nag list** (`scripts/copy-scan.js`, `NAG`) contains "still" and
  "again". Some of the scout's example lines use them ("snacks again?!", "i still think
  about your show", "your dig again?"). The memory line tables must either be reworded or
  the first mate must allow an explicit exception in `COPY_TABLES` for these lines
  (the "no nagging" rule is about reminding the person, not a pet remembering fondly, but
  the scan can't tell). The plan's choice: reword first, ask for an exception only if a
  line loses its charm.
- **Good news has no callback besides door 2.** "great" to slept, or a weekend "yes"
  without words, still end at the reply. Out of scope here.
- **`slept: not really`** has no follow-up. Out of scope.
- **Weekend, game and trick lapse quietly** (scout 1.3 item 6, "no guilt" rule). Door 12
  softens the game case only when memory is on.
- **`back_from` and the guess outcome lines** are fixed lines and repeat. Out of scope;
  the same turn-rotation pass would fix them.
- **A downgrade** leaves memory on disk unread (R8); the guide says so.
- **Pet removal** doesn't remove memory (the people store outlives pets, guide "Privacy"),
  so removing the last pet leaves it unless the person turns it off or forgets first. The
  guide says this next to the existing line about what stays.

## 13. Open questions for the owner

Only what is still open. Recommendation first.

**1. What does turning the admin option off do to what people already told their pets?**
The option is set per pet (section 5), and the memory is per person.
- **A (recommended).** Off on **every** pet erases every person's memory, at once and
  saved; the option's description says so. Off on only some pets silences those pets and
  erases nothing. It matches what an admin who switches memory off expects, and the
  data is small and rebuildable.
- B. Off hides the switch and silences the pets but erases nothing; each person erases
  their own. Safer against an accidental toggle, but a household that "turned memory
  off" still has it on disk and in backups.
- C. Off on any single pet erases all memory. Simplest to explain, but a second pet's
  setup could wipe what the first pet's person told it.

**2. Door 10 (weekday pattern): does it get its own switch?** It is the most sensitive
door; Q1 = C put it in. The plan already limits it (three tags only, 3 of the last 5, the
eve of the day, once per 28 days, each pattern shown and forgettable on the page).
- **A (recommended).** No separate switch; the page lists any noticed pattern as an item
  with its own "forget this", and forgetting one of the tags ends it. One switch for
  everything keeps the model simple.
- B. A second per-person switch, "notice my weekly things", **off** by default, shown
  only when memory is on. Strongest for privacy; one more row and one more ask.
- C. Door 10 never says a pattern aloud; it is shown only as a line on the page ("you
  seem to have lessons on Tuesdays"). Safe, but loses the line the owner asked for.

## 14. Adversarial review checklist

For the reviewer of each build ship. Try to break each; every item should have a test.

1. **Where can a memory value escape?** Search for every consumer of `person` in
   `coordinator.py`, `sensor.py`, `diagnostics.py`, `notify.py`, `intent.py`, `llm.py`,
   `debug`, `_house_view`, `_mine`, the channel snapshot, and the logs. Fill memory to the
   caps and grep every output for a tag, a pick and a date.
2. **Shared screens.** Open the card as a shared screen after memory is on. Is there a
   row, a link, a line from a door, a fetch, or a place where `shared` is ignored (a
   second WS call that forgot the flag)? What about a screen whose "shared" status
   changes while open?
3. **Another person's data.** Can user B read, forget, or write A's memory by any
   command (`memory`, `memory_get`, `memory_forget`, `ask_again`, `answer` with a tag)?
   Does a user with a read-only login get through? (`set_shell` has no permission check,
   see settings-setup plan; do memory commands need one?)
4. **Erase really erases.** After off, forget-me, per-item forget, and admin-off: is the
   `.storage` file clean at once, not after the save delay? Are the pet's own saves
   (`dream_picks`, `dream.user`) clean? Does any in-memory copy (a card field, a channel
   `_sent` cache, a `said` mark) survive and re-add it?
5. **A race.** An answer lands while the person turns memory off. Does the erase win?
   Is the answer stored after it? Do `remember` and `set_memory` share the person lock?
6. **Free text through the side door.** Is every stored value from a fixed list or a
   date? Can `tag`, `key`, `kind`, `pick` or `question` carry text? Does a schema
   failure echo it into a log? Does a hand-edited store with a long string survive load?
7. **The caps.** Does a full list drop the oldest, not the newest? Does a person who
   says yes to everything for two years still keep the last 13 months of tags? Does any
   time-based prune remain that would eat remembered things (Q4 = C says none)?
8. **Doors and nagging.** Does any door's line read as watching, scoring or nagging? Does
   door 10 stay inside its limits (three tags, 3 of 5, eve only, once per 28 days)? Does
   an `appointment` tag ever reach a door, a sticker, a count or the recap? Does a door
   repeat on consecutive days? Do the new tables pass `scripts/copy-scan.js` or have an
   explicit, reviewed exception?
9. **M0-a's order.** Walk every weekday for a person who has come home (work, school,
   home) with: no event, an open event, 2 dated asks used, a kind resting, level 1 and 2,
   a one-time question due, morning vs evening. Does anyone ever get two later questions
   in a day, or a dated ask at 15:00, or lose a one-time question?
10. **M0-b's rotation.** Four weathers, a month of days: is any line repeated within
    three days? Does the salt keep two pets out of step? Does the card-check day shift
    (`__hatchDayShift`) drive it?
11. **M0-c's reset.** Does "ask me again" leave the birthday, switches and `noted`
    alone? Can it be spammed to pester the person (the 3-day gap, the 2-try limit)? Does
    it work on a pet in a new world for the visitor?
12. **M0-d.** After forget, is there any copy of the user id in the pet's save, in the
    dream story's "your idea" note, or in the `dream` dict?
13. **Child accounts.** Can one login turn memory on for another? With the option on by
    default, does the guide tell households that children's accounts can opt in on their
    own, and what is stored for them?
14. **Backups and downgrade.** Does the guide say memory is in backups, that older
    backups can't be erased by "off", and what a downgrade leaves? Does an older
    version's validator keep or drop the `memory` key, and is the guide right?
15. **Admin option.** One option per pet entry: after two pets with different settings,
    what is `memory_allowed` for each, and what does "any pet allows" do on the daily
    prune and on an options change? Is the erase on "off on every pet" safe against a
    reload that briefly has no pet?
16. **The supersession.** The 2026-10-28 decline of journal memories is superseded for
    the private page only. Does nothing from memory appear in the public journal, the
    photos, the every-world page, or the finds page?
17. **The card.** Is every new string `textContent`? Is the memory ask absent from
    `STASHED_QUESTIONS`? Does the page leave the DOM when closed? Does the card build
    still pass `scripts/card-check` `sharedscreen` and `types`?
