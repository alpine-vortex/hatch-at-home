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

**Revised 2026-11-02 (s2721)** to fold in the adversarial privacy review of this plan
(s2719; two blockers, twelve should-fixes, four nits), each checked against the code
before it went in. The review's findings are marked "(review B1)", "(review S3)" and so
on where they land. The owner's Q1-Q4 and the first mate's decisions are unchanged.

## 0. Summary

| Ship | What | Size | Tier |
|---|---|---|---|
| **M0** | Four gap fixes: dated asks before a came-home "how was your day?" (M0-a), fav-weather line in the turn rotation (M0-b), "ask me again" for favourites (M0-c), forget_me clears the dream pick (M0-d) | S-M | M0-b 1; M0-a, c, d **2** |
| **M1a** | The record and validators, the switch, the admin option and its erase, the WS command rules, the privacy test table, the guide | M | **2** |
| **M1b** | The one-time ask (with the card's "great" send); doors 2, 4, 5, 6, 12 | M | **2** |
| **M2** | Tag chips on big day and weekend; doors 1, 3, 11, then 9 and 10 each as its own commit | M | **2** |
| **M3a** | "Things you told me" page with per-item forget; the `memory_get` / `memory_forget` commands | M | **2** |
| **M3b** | Stickers (door 8), the bench preset and the card-check section if not already in M3a | S | **2** |

Order: M0 (the four parts are independent and can be four small commits or four ships) ->
M1a -> M1b -> M2 -> M3a -> M3b. M2 and M3 both need M1a's record and validation; M3b needs
M2's tags to show stickers, but M3a can ship first without them if M2 slips. Nothing in M0
waits on the owner. The review's S12 asked for the M1 and M3 splits: each ship was too much
for one worker, and M1a is the part the privacy review must pass before anything else is
built on it.

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
- **Admin option off on every pet erases all memory** (was open question 1, option A;
  trigger in section 5). Off on only some pets silences those pets and erases nothing.
- **Door 10 (weekday pattern) has no separate switch** (was open question 2, option A).
  It is a forgettable item on the page; forgetting one of its tags ends it.
- **Copy scan: "still" and "again"**: reword the memory lines first; ask for an exception
  only if a line loses its charm (section 12, as this plan proposed).

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
| `REDACT_PEOPLE` exists (`diagnostics.py:72`) | True, and it is **referenced nowhere else**; the people store is not in the dump (`diagnostics.py:66-71`). `memory` joins the set for a later dump, but the live surface to test is the pet's save (`_saved`, `diagnostics.py:96`), where M0-d's `dream_picks` and `dream.user` sit (review S12). |
| `_mine` is per person and not pushed to shared screens (`coordinator.py:2558`, `2626`, `2664`) | True. |
| Review B1: a `vol.In` failure echoes the value into the log | **True.** `ActiveConnection.async_handle_exception` builds the message with `humanize_error(msg, err)` for a schema failure and logs it (HA `websocket_api/connection.py`). The repo already knows: `websocket_answer`'s `text` is typed `object` for that reason (`__init__.py:462-464`). Section 5 applies it to every memory field. |
| Review B2: an options save leaves no safe moment to read "any pet allows it" | **True, with a correction to the cite.** The options flow is `PetOptionsFlow(OptionsFlowWithReload)` (`config_flow.py:337`), saved by `async_create_entry(data=new)` in `_topic_step` (`config_flow.py:522`), and the entry then reloads; `async_unload_entry` pops the pet from `hass.data[DOMAIN]["pets"]` (`__init__.py:994-1001`, "a reload of the only pet (options) keeps its bundle"). The review's `config_flow.py:214` is the reconfigure flow, same effect. There is **no options-update listener**, so the plan's old wording had nothing to hook. The people store is `hass.data[DOMAIN]["people"]` (`__init__.py:219`), reachable from the options flow. |
| Review S3: the 15:00 claim in M0-a | **True.** `follow_question` is gated by `hour >= R.ASK_DAY_FROM` (16) at `people.py:726`; the came-home ask has no hour floor (`people.py:718`); `mark_asked` closes the later slot (`people.py:714, 818`). Section 7 re-specs it. |
| Review S9: the ask burns on an old card | **True.** `_question` marks the ask and `mark_once` at ask time (`coordinator.py:2004-2006`); the `phone` ask alone waits for the card's "shown" answer (`coordinator.py:1981-1987, 2161-2166`). |
| (found while checking) "great" never reaches the server | **True.** `ANSWERS["how_day"]` is `("tough",)` and the card sends only "tough" (`people.py:63-66`, `card-visit.js:439-441`): "great" and "ok" stay on the card on purpose. Door 2 needs "great", so M1b adds a card send and an accepted answer that exist **only while memory is on** (section 8). |
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
  adds to memory. **Fail closed** (review S1): every memory command (`memory`,
  `memory_get`, `memory_forget`, `ask_again`, the `memory` ask's answer, and an `answer`
  carrying a `tag`) takes `shared` as a **required** bool and the server refuses unless
  `msg["shared"] is False`, as the gift path does (`__init__.py:855-857, 884-886`, "so the
  gift path can't fail open"). A card that forgets the flag gets no memory. This is a
  **card-honesty guard, not authentication**: `shared` is the client's own claim, read
  from a localStorage flag (`SHARED_KEY`, `prefs.js:338-344`), so a wall tablet whose flag
  was cleared counts as personal. The guide says that plainly. Memory is
  fetched only by `connection.user.id`. `_mine` carries a `memory_on` boolean and an
  `memory_allowed` boolean and nothing else about memory. Nothing is cached in
  localStorage. The guide says what it already says for typed words: a family sharing one
  HA login shares one memory, and a tablet signed in as one person shows that person's
  page to whoever holds it. The page asks one confirm tap before it shows (draft), as
  `forget_me` has its two-tap guard. Free-value fields in these commands (`tag`, `key`,
  `list`, `pick`) are typed `object` in the schema and checked in the handler with a
  generic error, so a schema failure can never log a value (review B1, section 5).
- **R4. Never off the private path.** Memory is on no entity state or attribute, no bus
  event, no logbook entry, no service call or script trace, no phone notification, no
  diagnostics dump (`memory` joins `REDACT_PEOPLE`), no integration log, no Assist or LLM
  output, no `debug` sensor. Every row of the F1 privacy table (plan-2026-11-01-fresh-expand.md,
  "The privacy table") applies again, with the same tests.
- **R5. Only fixed-list values and dates on disk.** No typed words, no names (not the
  person's, not another person's, not a pet's), no times of day, no places, no free text.
  Anything outside the fixed lists is dropped on load, entry by entry. There is
  **no `appointment` tag** (review S5, section 4): it would feed no door and would only
  put a health-adjacent dated list into every backup.
- **R6. Kept until forgotten; count caps only (Q4 = C).** No time-based expiry on a
  remembered thing. Each class has a count cap; when full, the oldest entry goes (section
  4). Operational bookkeeping that is not a memory (the door 9 "said by", the one-line
  `said` marks) is pruned by its own day, as follow-up events are today. `People.prune`
  gets the cap step; load drops invalid entries as it drops an expired event
  (`people.py:219-220`).
- **R7. Every erase path erases for real, saved at once.** Turning the switch off pops
  `person["memory"]` and saves immediately, like `forget`. "Forget my data" erases it with
  the rest. A per-item forget removes that entry and saves at once. The admin option
  being switched off on the last pet that allowed it (section 5) erases every person's
  memory, from the options flow's save and nowhere else. Favourites, the birthday and the
  follow event stay on "off": they predate the option and have their own controls.
- **R8. Storage and migration.** Memory is a key inside the person record, not a new
  store, so an older version's "forget my data" (which pops the record) still erases it.
  The key is additive: `STORE_VERSION` stays 1. After a downgrade the record stays on disk
  unread and uncapped (`people.py` keeps unknown keys as they are); the guide says so.
  Each entry is validated on its own, as `_event_ok` does.
- **R9. Assist: no.** Memory never reaches `intent.py` or `llm.py`; a pytest greps their
  output after memory is filled. A spoken reply is heard by the room, and LLM agents are
  often cloud services.
- **R10. Child users.** HA has no age, but the product has a self-declared child signal:
  **baby talk** ("simpler words from babies and children", `person["baby_talk"]`,
  `coordinator.py` `_mine`, `prefs.js:346-350`; review S7). (a) Tags and picks only, never
  words (R5), so a child's details never reach disk. (b) Only the person themselves can
  turn it on, **keyed by `connection.user.id`**: a parent's login can't turn it on for a
  child's own account, and the reverse. That says nothing about a **shared login** (a
  family tablet signed in as a parent): whoever holds it can tap "yes" on that record, and
  their picks then show on that person's page. The guide says so (R3). **Proposed, FM to
  confirm (section 13):** the one-time ask is **held while the person's `baby_talk` is on**
  (it delays Q3's "asks once at bond 4", it does not change it; the settings row still
  works), and the page's confirm tap (R3) is the guard for the rest. (c) The admin
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
                                       # one per (day, kind): see "Dates and keys" below
  "picks": {"dream": [{"day": ..., "pick": "snacks"}, ...],
            "game":  [{"day": ..., "pick": "dig"}, ...],
            "guess": [{"day": ..., "pick": "sun"}, ...],
            "great": [{"day": ..., "ask": "how_day"}, ...]},
  "since_told": {"fav_weather": "2026-11-20", "fav_season": "...", "visitor_<world>": "..."},
                                       # only for a favourite told WHILE memory is on
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

**Dates and keys (review S4, S11).**
- **One entry per key, so a repeat can't double-record.** `tags` holds at most one entry
  per `(day, kind)`; each `picks` list at most one per `day`. A second write for the same
  key **replaces** the entry (a dated follow-up is answered twice for one ask, "yes" then
  its typed step, `coordinator.py` `async_answer`; the tag may ride on either call, and a
  later tag corrects an earlier one). The per-item key is therefore `(list, day)` for
  picks and `(list, day, kind)` for tags, with no new id, and "forget removes exactly one
  entry" holds.
- **A tag is written only while the person has an open event of that kind** (the "yes"
  just opened it, or its typed step), never from a bare call.
- **`tags.day` is the event's own day:** for `big_day` the day they picked
  (`big_day_pick`, 1-7 days ahead, the event's `due`); for `weekend` the **Saturday** of
  that weekend (`follow_dates` gives the Monday as `due`, which would make every weekend
  tag a Monday). A big day picked ahead may not happen; the tag is what the person said
  was coming, and the page says "you told me" rather than "you went".
- **Which doors read which kind:** doors 1, 3 and 10 read `big_day` tags only (they need
  a real, specific day). `weekend` tags feed the page and door 11's recap, nothing else.
- **`since_told`** has no value for a favourite told before memory was on (`likes` holds
  values with no date, `coordinator.py` answer branch). The page shows no "since" for
  those and door 6 does not fire for them; nothing is back-filled. `ask_again` (M0-c)
  pops `likes[kind]`, and M1a makes it pop the matching `since_told` key too, or the page
  would show a favourite that was un-told.

**Not kept, even with the switch on:** typed words (they stay memory-only until the event
closes, as now); any name; times, places; **a "tough" mood** (the soft morning stays
memory-only for one day as today; a saved list of someone's bad days has no door that
needs it, and a backup shouldn't hold one). Only "great" is saved, for door 2. No
right/wrong count for guesses or games (the "no score" rule, guide.md "Using the card").

**The fixed tag list (draft):** test, match, show, trip, party, lesson, work thing,
something else. Translatable, so no free text; the first mate approves the labels.
**`appointment` is dropped from the scout's list** (review S5; FM to confirm, section
13): R5 gave it no anniversary, count, sticker or pattern, so no door would read it, and
it would sit in every HA backup as a dated health-adjacent list only to be shown on the
page. `work thing` and `something else` stay: door 11 and the page use them (R5 draws no
sticker for either).

## 5. The switch, the ask, the admin option (M1a, M1b)

**The person's switch (M1a).** A row beside "my day" in the settings sheet
(`card-status.js:190, 249-250`, a `_mineSwitch` on `mine.memory_on`), shown on a personal
screen only, and only when `mine.memory_allowed`. The forget-me reset (`card-status.js:463`,
`_setMine(key, false)` over `my_day`, `baby_talk`, `birthday_*`) gains `memory_on`, or the
card shows a stale "on" after "forget my data" (review nit). WS command
`virtual_pet/memory` `{entity_id, enabled, shared}` follows `my_day` (`__init__.py:765`):
pet looked up by `entity_id`, then `async_set_memory(user, enabled)` and
`_push_everywhere()`. Off erases (R7). Turning **on** is refused when this pet's option is
off; turning **off** is always allowed.

**WS command rules (every memory command; review B1, S1, S8).**
- `shared` is a **required** bool, refused unless `is False` (R3, fail closed); tests send
  it `true` **and absent**.
- `tag`, `key`, `list`, `pick` are typed `object` in the schema (as `text` is,
  `__init__.py:462-464`) and checked in the handler, which sends one generic error
  (`not_asked` style) that never repeats the value. HA logs a schema failure at ERROR
  with `humanize_error`, so a `vol.In` here would put the value in `home-assistant.log`,
  and a `memory_forget` `key` with a valid day and a wrong `list` is a real remembered
  entry. The handler's error text and any `ValueError` text also carry no value
  (`websocket_answer` already turns `ValueError` into one fixed message).
- **The pet's option is checked on the server, not only in `_mine`** (review S8):
  `memory_get`, `memory_forget`, the `memory` ask's answer and a `tag` are refused with
  one error when **this pet's** `CONF_MEMORY` is off, even if the person's memory is on
  through another pet. Only the switch-off is exempt.

**The one-time ask (M1b).** A `memory` entry in the one-time list (`people.py` `ONCE`,
level 4, after `birthday`, so `ASK_ONCE_GAP_DAYS` = 3 keeps them apart), asked only when
`memory_allowed`, not yet on, not already answered, and **not while the person's
`baby_talk` is on** (R10, FM to confirm). Answers `ANSWERS["memory"] = ("shown", "yes",
"not_now")`; `"memory"` joins `QUESTION_KINDS` so `asked_later` accepts it.
- **It counts as asked only when the card says it showed it** (review S9), in the
  `phone` ask's way, not only its shape: `_question` marks the day's later slot as for
  `phone` (`coordinator.py:1981-1987`) but does **not** call `mark_once` for `memory`;
  the card's `shown` answer does (tries in `likes_asked["memory"]`, `once_last`, as
  `async_answer "phone"` does at `coordinator.py:2161`). An old cached card (the file
  keeps its name and URL) ignores an ask kind it doesn't know (`QUESTIONS[ask]`,
  `card-visit.js:235`), never sends `shown`, and so burns only that day's later slot, not
  the ask.
- **Asked once means any answer ends it** (review S2): "yes" sets the switch **and**
  `memory_asked: true`; "not now" sets `memory_asked: true`. `memory_asked` survives
  `forget_me` as `birthday_skipped` does (`People.forget`, `people.py:244-254`), and
  `once_due` adds `"memory"` to its `done` set when `person.get("memory_asked")` (it is
  not in `likes`, which is where `done` comes from today, `people.py:~770`). So yes then
  off, or yes then forget-me, does not ask again; the settings row is the way back. The
  key is a boolean with no content and the only memory-adjacent key outside
  `person["memory"]`. An unanswered ask is tried the usual `ASK_LIKES_TRIES` times, weeks
  apart (`may_ask_again`). Copy: DRAFT.

**The admin option (M1a).** `CONF_MEMORY` in `const.py`, a `BooleanSelector` default
**True** (Q3 = A), in the existing "people" options topic beside `CONF_PRIVACY` and
`CONF_HOUSE_WORDS_PRIVATE` (`topics.py`, `config_flow.py:379-380`), with strings in
`strings.json` and `translations/en.json`. Options are per pet entry, so: a pet adds to
memory, speaks from it and asks for it **only if its own option is on**; `memory_allowed`
in `_mine` is the viewed pet's option. The person's one record is shared by all pets, so
an admin turning it off on one pet only silences that pet.

**The erase when it is off on every pet (decided; trigger from review B2).** The pets
reload on every options save, and unloading pops a pet from `hass.data[DOMAIN]["pets"]`
(`__init__.py:994-1001`), so **live coordinators can never answer "does any pet allow
it?"**; the plan's earlier "options-update listener and the daily prune evaluate it" had
no listener to hook and a window where the only pet is absent. The rule:
- The erase runs **only from the options flow's save** (`PetOptionsFlow._topic_step`, just
  before `async_create_entry`, `config_flow.py:522`), and only when this save **changes
  `CONF_MEMORY` from on to off** (old = `self.config_entry.options.get(CONF_MEMORY,
  True)`, new = the merged value) **and** every **other** entry of the domain
  (`hass.config_entries.async_entries(DOMAIN)`, whatever its state) has
  `options.get(CONF_MEMORY, True)` false. It compares **stored options**, never live
  coordinators.
- **Never** on unload, setup, reload, the daily prune, or removing an entry. An unrelated
  option saved on the only pet leaves memory alone; so does removing the last pet (section
  12).
- **Disabled and not-loaded entries count** by their stored option (a disabled pet whose
  option is on keeps memory allowed; the guide says to turn it off there too). **A pet
  added later defaults on**, which re-allows memory for everyone whose record is now
  empty; `memory_asked` survives the erase, so nobody is asked again and they use the
  settings row.
- The erase pops `memory` from every person's record synchronously (no `await` between
  the list and the pops) and then awaits `people.async_save_now()`, so the file is clean
  before the flow returns. The daily prune (`prune_daily`, per coordinator) only applies
  the count caps and never erases.
- Acceptance (also section 10): save an unrelated option on the only pet -> nothing
  erased; flip memory off on the only pet -> erased once and saved; two pets: off on one
  -> nothing, then off on the second -> erased; a disabled third entry with memory on ->
  no erase; flip back on -> nothing returns.

## 6. The doors, by ship

All lines are DRAFT. Each is said only on that person's own non-shared screen, only with
the switch on and the option allowed, and once per door per its own spacing (`said`).

| # | Door | Example (draft) | Ship |
|---|---|---|---|
| 2 | **Good-day echo:** morning after a "great" to how_day or big_how | "yesterday was a great one! more of that" | M1b |
| 4 | **Running joke:** 3 of the last 5 dream picks the same | "snacks again?! hehe, ok" | M1b |
| 5 | **Your habit:** the last 5 guesses all the same way | "you always say sun! my sunny friend" | M1b |
| 6 | **Since you told me:** first time a favourite comes back after it was told. Joins M0-b's rotation as extra lines | "it's snowing! you told me snow's the best" | M1b |
| 12 | **The game you picked:** the picker opens after a lapsed pick, or it's the most-picked of the last 5 | "your dig again? i'm ready" | M1b |
| 1 | **Week-later echo:** about 7 days after a tagged `big_day`, once | "i still think about your show!" | M2 |
| 3 | **Anniversary:** a year after a tagged `big_day` (tag `trip`, `show`, ...) | "a year ago today was your big trip!" | M2 (dormant until a year passes) |
| 9 | **Pets compare notes:** with several pets, a second pet nods to a big day another pet already cheered | "Mochi told me about your test! good luck" | **M2, its own commit, FM nod needed** (section 13) |
| 10 | **Weekday pattern:** the same tag on the same weekday 3 times | "match tomorrow? i'll be cheering" | **M2, its own last commit** |
| 11 | **Friendship-year recap** on the 12-month friendship day (`coordinator.py:1825-1837`); **no numbers** (review S10: section 4 forbids counts shown as a score, and the sticker rule says the same) | "a whole year! so many big days, and so many snack dreams" | M2 |
| 7 | **"Things you told me" page** | see section 9 | M3a |
| 8 | **Stickers** | see section 9 | M3b |

**Door 10, now in scope (Q1 = C): M2, its own last commit.** It needs only the M2 tag
history; the weekday is computed from the saved date, so **no new data is kept** for it.
Because it is the most sensitive door, the plan limits it:

- Only for `big_day` tags `lesson`, `match` and `show` (a weekly activity). Never
  `test`, `work thing`, `party`, `trip` or `something else`, and never a `weekend` tag
  (its day is the Saturday, section 4).
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

**Door 9 and the "not chosen" list (review S10).** `docs/HANDOFF.md:525` lists, as *not
chosen, don't start unasked*, "learning household routines" and "pets on the shelf noticing
each other". Door 10 is a learned routine, but the owner chose it (Q1 = C); the commit
updates that HANDOFF line to say so, as the 2026-10-28 journal decline is named above.
Door 9 is pets noticing each other and **no owner answer names it**: it is its own commit,
not built until the first mate says yes (section 13).

**Door 12 also closes** Part 1 item 6 of the scout (a game picked and never played), gently.

## 7. M0: the gap fixes

Independent of M1a. Four small commits; M0-b alone is tier 1.

### M0-a. Dated asks go before a came-home "how was your day?" (tier 2)

**Rule (first mate, 2026-11-02):** in `choose_question` (`people.py:718-729`), on a day
when a dated follow-up (`FOLLOW_DATED`: weekend on Fridays, big day on Sundays and
Mondays) is due, it is asked **before** the came-home how_day. The sequence in the later
slot becomes: one-time question (unchanged) -> **due dated follow-up** -> came-home
how_day -> rotation's own how_day -> the other follow-ups (trick, game) -> dream/guess ->
fallback how_day.

- The rule is limited to `FOLLOW_DATED`. `trick` and `game` are the pet's own and stay
  after the came-home ask, as today. `follow_question` returns `trick` and `game` too
  (`people.py:837-870`, its `pet_kinds` loop), so it gains a `dated_only: bool = False`
  parameter; the came-home branch calls it with `dated_only=True` (review S3).
- The rotation's own how_day (every third day, `ROTATION[ordinal % 3]`) still goes before
  the follow-up, unchanged: the decision was about the came-home ask, and moving the
  rotation's how_day is a bigger change in the week's balance. On that Friday the weekend
  ask is still lost. Noted in section 12 as a known remainder.
- The existing caps hold: no ask while an event is open, 2 dated asks a week, a kind
  missed twice rests 14 days, one later question a day. A commuter's Friday gets the
  weekend ask instead of "how was your day?"; the how_day that evening is simply not
  asked (one later slot a day). That is the intent.
- **The 15:00 case (review S3; the earlier text here was wrong).** The follow-up branch
  is gated by `hour >= R.ASK_DAY_FROM` (16, `people.py:726`); the came-home ask has no
  hour floor but `JUST_HOME_HOURS`. If the dated ask kept the 16:00 floor, a child back
  from school at 15:00 would get the came-home how_day, the look would mark the later
  slot (`mark_asked`, `people.py:818`), `if "later" in asked: return None`
  (`people.py:714`) would close it, and the Friday or Monday dated ask would be **lost
  for the day, not delayed**. So **the came-home branch has no 16:00 floor**: it asks the
  due dated follow-up in the place of the how_day it would have asked at that same hour
  (a "weekend plans?" from someone who just walked in is the same moment as "how was your
  day?"). The 16:00 floor stays for the ordinary follow-up branch below it, unchanged.
  The dated ask is still one later slot and still counts toward the caps.
- Update the comment at `people.py:723-725`; it names FM Q1 A and must now name this
  decision and its date.

**Acceptance.**
- A person with `came_home="school"`, hour 15, on a Friday with a due weekend ask:
  `choose_question` returns `weekend` (and `how_day` on a Thursday at 15). A person with
  no `came_home` at hour 15 on a Friday gets no dated ask (the 16:00 floor stays), as today.
- A `pet_kinds=("trick",)` person with `came_home="work"` on a day with no dated ask due:
  `how_day`, not `trick` (`dated_only`).
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
  "again"**; M0-b's lines must avoid them, and so must M1b's table (section 12).
- M1b's door 6 lines join this list, so the since-you-told-me variant replaces one
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
  favourites; `shared` required and refused unless `false` (R3). Server: pops the `likes` key, resets that kind's
  `likes_asked` tries (so the 2-try limit starts over), and does **not** touch
  `once_last`, so the 3-day gap still spaces it from other one-time asks. Saved at once.
  The next eligible look (11:00-20:00, bond level 3+) asks it again. Nothing else about
  the person changes (birthday, switches, history stay).
- `_mine` gains `fav_weather` and `fav_season` values, as it already has `fav_visitor`.
  The channel is the person's own; sensors, house view, diagnostics and bus stay free of
  them (`likes` is already in `REDACT_PEOPLE`).
- No memory option needed: this works with memory off.
- Once M3a ships, the same buttons appear on the page next to each favourite; the settings
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

## 8. M1a, M1b and M2: building notes

**M1a (tier 2): the record, the switch, the option.**
- `people.py`: the `memory` key in the person validators (`_ok` table near line 491), a
  `_memory()` validator that drops invalid entries one by one and enforces the caps and
  the one-per-key rule on load, `set_memory(user, on)`, `memory(user)`, `remember(user,
  list, entry)` (cap-aware, replaces on the same key), `forget_item(user, key)`,
  `forget_memory(user)`, `forget_all_memory()` (the admin erase), and the prune cap step.
  Memory changes save with the usual delayed save, except **off, forget, per-item forget
  and the admin erase**, which save at once (`async_save_now`).
- **Locking and the race (review S6).** The code M1a copies does not all lock:
  `async_set_my_day` and `async_set_baby_talk` take no lock (`coordinator.py:2232,
  2215`) and `async_answer`'s dream, guess and favourite branches (`coordinator.py:
  ~2186-2200`) take none either; only the `LATER_CHECKED` branch does (`:2106`). The new
  functions take `people.lock(user)`, **and the real guard is the order**: `set_memory(off)`
  pops `person["memory"]` **before** its `await async_save_now()`, and `remember` checks
  that `memory` exists and writes with **no `await` between**, so an answer that lands
  during the save's `await` finds no memory and writes nothing. `remember` reads with
  `self.data["people"].get(user)` (as `_mine` does, `coordinator.py:2558`), **never
  `person()`**, whose `setdefault` (`people.py:256-257`) would re-create a forgotten record.
- `coordinator.py`: where an answer is stored today (`async_answer`: the dream pick, the
  guess, a favourite, the game pick, and the "great" below), add `remember(...)` **only
  when `memory_on` and the pet's option allows it**. `_mine` gets `memory_on` and
  `memory_allowed`. The door lines are `note` kinds in the existing notes list, with the
  `said` guard.
- `__init__.py`: WS `virtual_pet/memory` (switch) under the command rules of section 5.
  `diagnostics.py`: `REDACT_PEOPLE` gains `memory` (it guards nothing today, section 2).
- `const.py`, `config_flow.py`, `topics.py`, `strings.json`, `translations/en.json`: the
  option, with a description line saying what it does and that turning it off on every
  pet erases what people told their pets; the erase in `PetOptionsFlow._topic_step`
  (section 5).
- Card: the settings row and the forget-me reset (section 5).
- Docs: guide "Privacy: what the pets remember" gets the memory paragraph (what is kept,
  what is not, backups, the shared login and the localStorage flag, a family's children
  and baby talk, downgrade, **debug logging**: HA's `websocket_api` debug logging logs
  every message, so `memory_get` replies, tags and keys land in a debug log, as the
  fresh-expand table says for birthdays, `plan-2026-11-01-fresh-expand.md:485`; and that a
  disabled pet's option still counts), the settings table gets the switch and the option,
  `features.md` section 7 gets a row, `docs/HANDOFF.md:525` is updated (section 6). **M1a
  adds the docs test** the table in section 10 relies on: no test greps the guide today.

**M1b (tier 2): the ask and the doors.**
- The ask as section 5. The answer for the one-time ask is **not** added to
  `STASHED_QUESTIONS` (`prefs.js:378`): a failed send leaves nothing in localStorage.
- **"great" reaches the server only with memory on.** The card sends only "tough" today
  (`card-visit.js:439-441`, `ANSWERS["how_day"]` and `["big_how"]` are `("tough",)`) so a
  person who never opts in sends nothing new. M1b: the card also sends "great" **only
  when `mine.memory_on`**, and the server accepts it only when memory is on and the pet's
  option allows it (otherwise the fixed "not an answer" reply), then `remember`s it under
  the same `asked_later` check as "tough".
- The door lines in `lines-fresh.js` with `COPY_TABLES` entries (the copy scan, section 12).
- `since_told` is written where a favourite is answered, only while memory is on.

**M2 (tier 2).**
- The tag step in the big_day and weekend flows: after "yes" (and the day, for big day),
  **a chip row** (the fixed list), shown only when `mine.memory_on`; with it off, the ask
  is exactly as today (typed step included). With memory on, the chips replace nothing:
  the optional typed step stays (memory-only), and a tag may be skipped ("no tag").
  The tag goes in the `answer` command as `tag`, typed `object` and checked in the
  handler against the fixed list (section 5: a `vol.In` here would log the value on a
  schema failure), with `shared` required.
- `memory["tags"]` gets the entry on the answer that carries the tag, which may be the
  "yes" or its typed step, under the one-per-`(day, kind)` rule and the open-event check
  of section 4. Pytest: an invalid tag is refused with one generic error and nothing
  saved; the same tag on both calls leaves one entry; a different tag on the second call
  replaces the first; forgetting that one entry leaves no twin.
- Doors 1, 3, 10, 11 as in section 6 (door 10 last, door 9 its own commit if the first
  mate agrees). Door 3's lines are dormant until a year passes; tested with the freezer.

## 9. M3a and M3b: the page and the stickers (tier 2, card-heavy)

M3a is the page, `memory_get`, `memory_forget` and per-item forget. M3b is the stickers, plus the
bench preset and the card-check section if M3a left them. (Review S12.)

**The page.** A "things you told me" page in the journal's page family
(`card-journal.js`: `_pageBand`, `_pageShown`, the "journal" and "every world" pages), linked from the
journal when `mine.memory_on` and the screen is personal. It is fetched **on open** by WS
`virtual_pet/memory_get` (`shared` required and refused unless `false`, section 5; refused
too when **this pet's** option is off; returns the asker's items only), shown
after the one confirm tap (R3), kept in no localStorage and dropped from the DOM and the
card's fields when the page closes.

What it lists (all DRAFT wording): the favourites told (weather, season, the visitor of
each world) with their "since" day and "ask me again"; the tagged big days and trips by
date; recent picks (dream, game, guess); noticed weekday patterns (door 10) as their own
items, so a person sees exactly what the pet noticed; and one line saying what is never
kept (typed words, names). Each item has its own **"forget this"** (WS
`virtual_pet/memory_forget` `{key, shared}`, key = the entry's own `(list, day[, kind])`
(section 4), no new id; the schema types it `object` and the handler checks it, review
B1), a tap-to-confirm, saved at once. The page also has "stop remembering" (the switch
off, erases).

**Stickers.** One small sticker per **tagged big day** (kind `big_day`; also `trip`),
shown on the page only. Cosmetic: no streak, no count shown as a score, nothing lost or
gained by skipping, never a sticker for `work thing` or `something else`, and a
per-item forget removes it with the tag. Stickers are derived from `tags`: **nothing new
is kept.** First pass: the existing card icon glyphs and emoji by tag, no new art. If the
owner wants painted stickers later it is a separate art job through the usual art path,
not part of this plan.

**Door 7 and `_mine`.** The page's data does not enter `_mine`, the channel snapshot or
the sensors.

**Teardown when memory ends elsewhere (review S8).** The page also drops its DOM and
the card's fields when a push changes `mine.memory_on` or `mine.memory_allowed` to false:
memory turned off, forgotten, or admin-erased on another device or tab while the page is
open. (`stop remembering` in the same tab is the easy case.)

**Acceptance.**
- Card-check (new section `memorypage`): absent on a shared screen (no `memory_get` call,
  no link); present on a personal screen only with `memory_on`; the confirm tap guards the
  content; "forget this" calls the stub once with the item's key; after "stop
  remembering" the page is gone; a push with `memory_on: false` (or `memory_allowed: false`) while the
  page is open removes it and its text from the DOM. The page contents are `textContent`
  only.
- Bench: a `--memory` preset pinning `mine.memory_on` and a fake `memory_get` reply
  (the bench's fake `callWS` answers only what it is taught, `dev/bench/README.md`);
  shots: empty, a few items, all stickers, a long list at the cap. Per AGENTS.md, add
  this state to the bench rather than falling back to HA.
- Pytest: `memory_get` returns only the asker's items; user B gets none of A's; per-item
  forget removes exactly one entry and saves at once. With pets A (option off) and B (on)
  and the person's memory on, `memory_get` and `memory_forget` through pet A are refused
  (the server checks the pet's own option, section 5), through B they work.

## 10. The privacy test table (every tier-2 ship)

R4's list is the F1 table repeated for memory. M1a builds the test file
(`tests/test_memory.py`); M1b, M2 and M3 add rows for what they add. "Test" is what the
adversarial review should be able to run.

| Concern | Rule | Test |
|---|---|---|
| Sensors and attributes | Never (R4) | Pytest: with memory on and full (caps hit), the JSON of every sensor's attributes, `_house_view`, and `debug` holds none of the memory strings (tags, picks, dates of tags) |
| `_mine` and the channel | Only `memory_on` and `memory_allowed` booleans (R3) | Pytest: `_mine(user)` and a channel snapshot grep clean for tag and pick values; `memory_get` is the only carrier |
| Bus, logbook, recorder | WS commands, not services | Pytest: a `MATCH_ALL` listener across `memory`, `memory_get`, `memory_forget`, `ask_again`, and the answer with a tag sees no event holding memory or the choice |
| Logs | No integration log with memory or answers; no schema failure echoing a value (all free-value fields typed `object`, section 5) | Pytest with `caplog` on the integration **and** `homeassistant.components.websocket_api`: a bad tag, a bad `list`, a bad `key` **with a valid day and tag of a real entry**, a wrong type leave no record containing the value; and the handler's own error carries no value. This row can pass only with `object`-typed fields (review B1): with `vol.In` HA logs `humanize_error`'s message |
| Shared screens | The card never asks, shows, fetches or adds; the server refuses unless `shared` is `false` (fail closed, R3; a card-honesty guard, not authentication) | Pytest: each memory command with `shared: true` **and with `shared` absent** is refused and saves nothing. Card-check `sharedscreen`: no memory WS call, no row, no link, no page |
| Other people | Only `connection.user.id` | Pytest: B's `memory_get` and `memory_forget` never see or touch A's entries; B turning memory on leaves A's record alone |
| WS fetch on demand | The page is fetched on open, held in no cache | Card-check: after closing the page, no memory text in the DOM; no `hatch-memory-*` localStorage key ever; `STASHED_QUESTIONS` doesn't include the memory ask |
| Erase: off | Pops `person["memory"]`, saved at once | Pytest: turn off, then read the store file (`hass_storage`) with no delay: no `memory` key, no entry. (That HA's `Store` flushes on stop is HA's, not tested here; `async_save_now` writing before the command returns is.) |
| Erase: forget me | `People.forget` takes memory with the record; `memory_asked` survives like `birthday_skipped` | Pytest: forget, then the store has no memory, no tags, no picks; `memory_asked` stays, so the ask isn't repeated; yes then off, and yes then forget-me, never ask again (review S2) |
| The ask | Counts only on the card's `shown`; asked once; held for baby talk | Pytest: `_question` for `memory` writes no `likes_asked` and no `once_last` until `shown`; an old card (never sends `shown`) gets the ask again on a later day; "not now" and "yes" both set `memory_asked`; `once_due` skips it after; with `baby_talk` on it is not asked (if the FM agrees) |
| Erase: per item | One entry gone, saved at once, a pattern ends with its history | Pytest: forget one tag; store and `memory_get` both lack it; a door 10 pattern with 3 entries stops after one is forgotten |
| Erase: admin option off | Off on every pet erases every person's memory; the trigger is the options flow's save, comparing **stored options** across all entries (section 5; review B2) | Pytest through the options flow: an unrelated option saved on the only pet erases **nothing** (the reload that follows leaves memory alone, and so does unloading or setting up an entry with zero or one pet loaded); memory off on the only pet erases once, saved at once; two pets: off on one erases nothing, then off on the second erases; a disabled third entry with memory on blocks the erase; the daily prune never erases |
| Retention | Count caps only (Q4 = C); invalid entries dropped on load | Pytest: 130 tags saved -> 120 kept, oldest gone; a hand-edited store with an unknown tag, a bad date, a text-like value drops those entries and keeps the rest; a 13-month-old tag is **kept** (no time prune) |
| What may be stored | Fixed lists and dates only (R5) | Pytest: every key and value in `person["memory"]` after a full flow matches the fixed-list schema; no typed text is anywhere in the store after a big day with words |
| Typed words | Memory only, as today | Pytest: after a big day with text and memory on, the saved store, the pet state and `memory_get` hold none of the text |
| Backups | The store is in backups; the guide says so (R11); typed words never are | Guide text exists (the docs test M1a adds greps for the paragraph); pytest: the saved JSON is the full extent of memory, no second file |
| Diagnostics | `memory` is in `REDACT_PEOPLE` (R4), though no dump uses the set today (section 2) | Pytest: a diagnostics dump with memory filled holds none of it **and** the pet's save in the dump (`_saved`) holds no user id after `forget_me` (M0-d). A test of `REDACT_PEOPLE` alone would pass vacuously |
| Assist and LLM | Never (R9) | Pytest: the spoken status and the LLM tool JSON with memory filled hold no tag, no pick, no "remember" line |
| Notifications | Never | Pytest: `notify.message()` and send-offs hold no memory |
| Child users | Only the person turns it on; tags and picks only; admin option can hide it (R10) | Pytest: user A's `memory` command never changes user B's record; the option off removes `memory_allowed`; the guide paragraph for households with children exists |
| Migration up | Additive; `STORE_VERSION` 1; old stores load | Pytest: a pre-memory store loads with no `memory` key and every behaviour as before; the switch off is the default |
| Migration down | An older version keeps the key unread (R8) | **A read-the-code note, not a test**: today's `_person` validator is the only one a test can run, and the claim rests on `out = dict(record)` keeping unknown keys (`people.py:539-541`). The guide says what a downgrade leaves (review S12) |
| Damaged store | Memory goes with the record to the `.damaged` copy (R12) | Existing `test_damaged.py` style test with memory present; the guide's erase line names memory |
| Concurrency | An answer that lands during an off-switch's save can't re-add memory | Pytest: patch `async_save_now` to wait on an event, call `set_memory(off)`, send an answer while it waits, release: no memory in the store and in `memory_get`. Holding the lock is not the test; an `await` held open is (review S6). `remember` on a forgotten person does not re-create the record |
| Dream pick (M0-d) | forget_me leaves no id in the pet's save | See M0-d acceptance |
| HTML | `textContent` only | Card-check: a tag label, a pick value and an item key with markup render as text |
| Door order | One door per visit; a door never runs on a shared screen or with the switch off | Pytest/JS: the door note is absent in the shared snapshot and with `memory_on` false. (This row and "Concurrency" assert more than they test; the review asks that they not count as evidence on their own.) |
| Stale card | An old card burns no ask and sends no `great` | See "The ask"; the `great` send only when `mine.memory_on` is a card-side test, and the server refuses it with memory off |

## 11. Device queue

I found no document defining a "device queue" in the repo, so I read it as the checks on
real phones and tablets that the bench and card-check cannot make. **A ship worker cannot
do them** (review S12): they belong to the **first mate or the owner** after the merged
batch, they **do not gate a ship**, and the in-repo stand-in for each is a bench shot at a
phone-width and tablet-width viewport. Per slice, if any:

| Slice | Real-device check (first mate / owner, not a ship gate) |
|---|---|
| M0-a, M0-b, M0-d | None. Server and copy rules; pytest and card-check cover them. |
| M0-c | One look on a phone that the "ask me again" row and its confirm tap fit the settings sheet. |
| M1a, M1b | One phone, one tablet signed in as one person: the switch row, and the pet's one-time ask answered by tap. |
| M2 | One phone: the chip row for tags fits a narrow screen without scroll traps; a tap on a chip registers (the chips are a new tap target). |
| M3a, M3b | One phone and one wall tablet: the page's confirm tap, scrolling a page at the cap, "forget this" confirm; a tablet **shared** screen shows no link and no page. |

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
  the scan can't tell). **Decided (FM, 2026-11-02): this plan's choice stands:** reword
  first, ask for an exception only if a line loses its charm.
- **Good news has no callback besides door 2.** "great" to slept, or a weekend "yes"
  without words, still end at the reply. Out of scope here.
- **`slept: not really`** has no follow-up. Out of scope.
- **Weekend, game and trick lapse quietly** (scout 1.3 item 6, "no guilt" rule). Door 12
  softens the game case only when memory is on.
- **`back_from` and the guess outcome lines** are fixed lines and repeat. Out of scope;
  the same turn-rotation pass would fix them.
- **A downgrade** leaves memory on disk unread (R8); the guide says so.
- **The admin erase's reach.** It runs only from an options save (section 5). A pet entry
  *removed* or *disabled* does not erase, and a disabled entry's stored option counts. A
  pet added later defaults to on, so memory is allowed again with an empty record.
- **`shared` is a claim, not a proof** (R3): a wall tablet whose localStorage flag was
  cleared reads as personal. The guide says so; no server fix exists.
- **Pet removal** doesn't remove memory (the people store outlives pets, guide "Privacy"),
  so removing the last pet leaves it unless the person turns it off or forgets first. The
  guide says this next to the existing line about what stays.

## 13. Open questions

The two earlier questions are **decided** (first mate, 2026-11-02; section 1): the admin
option off on every pet erases all memory, and door 10 has no separate switch. A ship
worker must not treat them as open. What is left came out of the privacy review (s2719),
each with the default this plan already uses; none blocks M0 or M1a.

**1. Child accounts (review S7).** Hold the memory ask while the person's `baby_talk` is
on? **Default in this plan: yes** (R10, section 5): it delays Q3's "asks once at bond 4"
for those people and changes nothing else. The alternative is to ask everyone and rely on
the page's confirm tap. First mate's call, since it touches Q3.

**2. The `appointment` tag (review S5).** **Default: dropped from the list** (section 4):
no door reads it and it would put a health-adjacent dated list in every backup. Keep it
only if the owner wants the chip for the page's sake.

**3. Door 9, pets compare notes (review S10).** No owner answer names it and HANDOFF.md:525
lists "pets noticing each other" as not chosen. **Default: its own commit, not built until
the first mate says yes.**

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
5. **A race.** An answer lands while the person turns memory off, during the save's
   `await`. Does the erase win? Is the answer stored after it? Does `remember` ever call
   `person()` and re-create a forgotten record?
6. **Free text through the side door.** Is every stored value from a fixed list or a
   date? Can `tag`, `key`, `list`, `kind`, `pick` or `question` carry text? Is every
   free-value field `object`-typed so a schema failure echoes nothing into the log
   (`caplog` on `websocket_api`)? Does a hand-edited store with a long string survive load?
7. **The caps.** Does a full list drop the oldest, not the newest? Does a person who
   says yes to everything for two years still keep the last 13 months of tags? Does any
   time-based prune remain that would eat remembered things (Q4 = C says none)?
8. **Doors and nagging.** Does any door's line read as watching, scoring or nagging? Does
   door 10 stay inside its limits (three tags, 3 of 5, eve only, once per 28 days)? Does
   a `work thing` or `something else` tag ever reach a door, a sticker, a count or the recap? Does a door
   repeat on consecutive days? Do the new tables pass `scripts/copy-scan.js` or have an
   explicit, reviewed exception?
9. **M0-a's order.** Walk every weekday for a person who has come home (work, school,
   home) with: no event, an open event, 2 dated asks used, a kind resting, level 1 and 2,
   a one-time question due, morning vs evening, and a child back at 15:00. Does anyone
   ever get two later questions in a day, lose a Friday or Monday dated ask to a 15:00
   came-home how_day, or lose a one-time question?
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
   prune and on an options change? The erase is decided to fire only from the options
    flow's save, from stored options (section 5): can an unrelated option save, a reload,
    an unload with zero pets loaded, a disabled entry or a removed entry ever erase? Can
    the erase fire twice or miss a person?
16. **The supersession.** The 2026-10-28 decline of journal memories is superseded for
    the private page only. Does nothing from memory appear in the public journal, the
    photos, the every-world page, or the finds page?
17. **The card.** Is every new string `textContent`? Is the memory ask absent from
    `STASHED_QUESTIONS`? Does the page leave the DOM when closed? Does the card build
    still pass `scripts/card-check` `sharedscreen` and `types`?
18. **`shared` fails closed.** Send every memory command with `shared` absent and with
    `true`: refused, nothing saved? (R3)
19. **Dedupe and keys.** A dated follow-up answered twice for one ask leaves one tag? Does
    a per-item forget remove exactly one entry with no twin? Which date does a weekend tag
    carry, and which doors read it (section 4)?
20. **An old card.** Does an old cached card burn the memory ask, or send "great" with
    memory off?
21. **The pet's own option, server side.** Pets A (off) and B (on), memory on: does
    `memory_get`, `memory_forget` or a `tag` through A work?
