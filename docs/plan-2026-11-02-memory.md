# Per-person memory and the ask gaps, 2026-11-02 (build plan)

Status (2026-11-05): M0 (`1cb5971d`, `02611a24`, `bc82a756`, `2246a002`), M1a (`fb5586d4`), M1b (`4ccef2b3`) and M2 (`f9481e1b`, `dc342933`, `76b0065e`, audit `ffe21f56`) are built on main. M3a (the "things you told me" page, `memory_get`/`memory_forget`) and M3b (stickers) are open; nothing for them is in code.

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

**Revised 2026-11-02 (s2745)** to fold in the adversarial review of M1a/M1b (s2744; three
blockers, nine should-fixes, five nits) and the first mate's four decisions on it
(section 1, Q-A to Q-D). Each finding was checked against the code at `afac8d9b` first;
section 2a is the table, with what was folded and what was not. These marks read
"(M1 B1)", "(M1 S3)" and so on, to keep them apart from the s2719 marks above. **After
this revision M1a is ready to build**; M1b waits only on the first mate's go (section 13,
Q1 is now decided).

**Revised 2026-11-03 (s2783)** to fold in the adversarial review of the M2 plan (s2782; two
blockers, seven should-fixes, four nits, in the numbering "(M2 B1)", "(M2 S3)", "(M2 N12)"
and so on, problems 1-15) and the first mate's eight answers on it (section 1, "on the M2
review"). Each problem was checked against the code at `9f4c8125` first; section 2b is the
table. **The first mate approved the copy table (section 6a) on 2026-11-03, so M2 is ready to
build.** M2 now has a copy table written by the plan's author; the M2 ship worker writes no
copy.

## 0. Summary

| Ship | What | Size | Tier |
|---|---|---|---|
| **M0** | Four gap fixes: dated asks before a came-home "how was your day?" (M0-a), fav-weather line in the turn rotation (M0-b), "ask me again" for favourites (M0-c), forget_me clears the dream pick (M0-d) | S-M | M0-b 1; M0-a, c, d **2** |
| **M1a** | The record and validators, the switch, the admin option and its erase, the WS command rules, the privacy test table, the guide | M | **2** |
| **M1b** | The one-time ask (with the card's "great" send); doors 2, 4, 5, 6 (weather + season), 12 | M | **2** |
| **M2** | Tag chips on big day and weekend (inside the text step); doors 3, 1, 11, then 10 as its own commit (door 9 dropped, FM Q4); the tag `test` is now `exam` | M | **2** |
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

### First mate, 2026-11-02, on the M1a/M1b review (s2744)

- **Q-A: keep the "great" server send**, with the blockers fixed: the `shared` guard on
  every `remember` path (M1 B1) and no soft morning for a great day (M1 B2). Used in
  section 5 (WS rules) and section 8 (M1b).
- **Q-B: door 6 = weather + season only, one-shot per favourite; drop "lapsed" from door
  12.** No visitor door in M1b. Used in section 6 (the door table and "Door timing").
- **Q-C: erase on removing an entry too.** `async_remove_entry` runs the same check as the
  options save, on stored options. Used in section 5 (the admin erase) and section 12.
- **Q-D: hold the memory ask while `baby_talk` is on.** This **confirms the section 13 Q1
  default**; it is decided, not open. Used in R10, section 5 and section 13.

### First mate, 2026-11-02, on the M1b brief (s2763)

- **Q1: yes.** A door 4, 5 or 12 note may carry exactly **one fixed-list pick** (`pick`),
  nothing dated. The section 10 row for `_mine`, `_visit_prefs` and the channel is
  reworded to "no dates, no tags, no lists; door notes hold at most one fixed-list pick".
- **Q2: the draft copy is approved as drafted** (the ask, its two buttons and replies,
  doors 2, 4, 5, 12, door 6's four weathers and its season line), scanned by
  `scripts/copy-scan.js`; a line that fails goes to the first mate as a question, unshipped.
  No other player copy.
- **Q3: keep door 6's season.**
- **Q4: no to door 9** (pets compare notes): dropped from M2.
- **Q5: yes, 3 chosen days per 14, then retry** (the stale-card bound, section 5).

### First mate, 2026-11-03, on the M2 review (s2782)

All eight are **Decided** and cite review s2782 (the problem number is in brackets). Used
in sections 4, 5, 6, 8 and 10.

- **Decided (s2782 Q1, problem 3): a door note may carry one fixed-list `tag`**, nothing
  dated. The section 10 row for `_mine`, `_visit_prefs` and the visit reply is reworded as
  for `pick` (M1b Q1): "at most one fixed-list pick or one fixed-list tag, nothing dated".
  `tests/test_memory.py` (the door-notes test, `assert set(note) <= {"kind", "pick"}`)
  is updated to `{"kind", "pick", "tag"}`.
- **Decided (s2782 Q2, problems 1, 2): the chips sit inside the text-step box** (one ask,
  no extra stage). The tag lives on `step.tag`; every end path of the text step sends the
  one `yes` with it.
- **Decided (s2782 Q3, problem 6): the plan holds a draft copy table** (section 6a: chip
  prompt, eight labels, "no tag", doors 1 and 3 per tag, 10, 11), every line run through
  `scripts/copy-scan.js`. **The M2 ship worker writes no copy.** The first mate approves
  the table before M2 starts.
- **Decided (s2782 Q4, problem 6): doors 1 and 3 do not assert the day happened** ("you told
  me" style). Door 1 may read the named tags (and `exam`, Q8); **`exam` is out of door 3.**
- **Decided (s2782 Q5, problem 4): door order 2, 3, 1, 10, 4, 5, 12**, an exception to
  door-number order; one `said` key per door; door 10's 28 days hold across all patterns;
  an exact-day trigger is **lost** when no look falls in its window; Feb 29 uses Feb 28.
- **Decided (s2782 Q6, problem 5): door 11 only on the 12-month `friends_for`**, by
  extending that note with fixed-list fields (no numbers, no count words); lost when
  `birthday_friends` wins that day; the line is at most 40 characters.
- **Decided (s2782 Q7, problem 8): a valid tag the server cannot store keeps the `yes` and
  drops the tag silently**; only a tag outside the list is refused.
- **Decided (s2782 Q8, problem 7): the tag `test` is renamed `exam`** (a medical reading
  is the reason `appointment` was dropped). Door 1 reads it; door 3 does not.
- **Door 9 is dropped** (FM Q4, above); the stale wording is removed (problem 10).

### First mate, 2026-11-03, on the M2 build (s2784)

- **Decided (s2784 Q2): door 10 fires only while its pattern is fresh.** The pattern's
  most recent entry on its weekday must be within the last 8 weeks (56 days,
  `R.MEMORY_DOOR10_STALE_DAYS`); an older pattern (a season of lessons that ended) is
  not remarked on. Like the rest of door 10 it is re-derived from the tags, nothing kept.

### Audit tally, 2026-11-02

- **M0 audit (s2739, tier 2): 0 player-impact findings, 6 nits.** (The R1 tally belongs in
  the favourite plan, not here.)
- **M1a audit (s2758, tier 2): 1 player-impact finding, 5 nits** ("player-impact 1, nits
  5"). The fixes shipped in s2759: the row shows while memory is on (finding 1), the
  admin erase pushes to every loaded pet (5), the row's fallback is the viewed pet's own
  option and the row hides until it is known (4), memory's days are canonical ISO (2);
  findings 3 and 6 are the notes in section 12 and the guide.
- **M2 audit s2785 (2026-11-03): player-impact 1 (mono chip, fixed in this follow-up), nits 6 (N2, N4, N6 fixed; N1, N3, N5 accepted).**

## 2. What was checked against the code

Read at `origin/main` `60ebf751`. The scout's claims held, with these corrections:

| Scout claim | Check |
|---|---|
| came-home how_day goes before the follow-up (`people.py:718-729`) | True: line 718 (`came_home in DAY_ZONES or came_home == "home"`), the follow-up at 723-729. Note the test is also true for `"home"` (a friend just home), not only work and school. `tests/test_people.py:63-65, 99-102` pin the old order for how_day; the new order changes only days when a dated follow-up is due. |
| `JUST_HOME_HOURS = 2.0` (`rates.py:444`) | True. |
| fav_weather: one fixed line, once a day (`coordinator.py:1898-1912`, `ui-copy.js:283`) | True. The server's `people.said(user, "fav_weather", today)` is the once-a-day guard; the card's `fav_weather` entry in `NOTES` (`ui-copy.js:283`) is one string per weather. |
| `forget_me` leaves the dream pick (`__init__.py:558-576`, `model.py:3151`) | True. `async_forget_games` (`coordinator.py:2787`) drops only `parked` and `game.player`. `state.dream.user` is also read at `coordinator.py:1846` (`yours`) and is a second place the person's id stays (about a day). |
| `_event_ok` forbids `pet` on a big-day event (`people.py:525-527`) | True (`return "pet" not in v` for big_day and weekend). So no event ever holds who said it; door 9, which would have needed that, is dropped (FM Q4). |
| Options are household options | **Not quite.** All options are per pet entry (`config_flow.py`, `topics.py`: `CONF_PRIVACY` and `CONF_HOUSE_WORDS_PRIVATE` sit in the "people" topic and are read from `self.config_entry.options` in `coordinator.py:420-426`). There is no integration-wide option. Section 5 says how a per-person record meets per-pet options. |
| `People.forget` pops the whole record | True, and keeps `birthday_skipped` (`people.py:244-254`). Section 5 says the same for the memory question. |
| `REDACT_PEOPLE` exists (`diagnostics.py:72`) | True, and it is **referenced nowhere else**; the people store is not in the dump (`diagnostics.py:66-71`). `memory` joins the set for a later dump. **Corrected (M1 B3):** the dump runs `async_redact_data(_saved(pet), REDACT_STATE | PRIVATE_READINGS)` and `REDACT_STATE` already holds `bonds`, `user`, `by`, `for` and `player` (`diagnostics.py:84-93, 126`), so "no user id in the dump" passes vacuously. M0-d's claim is tested on the store (`pet.to_dict()` / `hass_storage`), for `dream_picks` and `dream.user` only (section 10, Diagnostics). |
| `_mine` is per person and not pushed to shared screens (`coordinator.py:2558`, `2626`, `2664`) | True. |
| Review B1: a `vol.In` failure echoes the value into the log | **True.** `ActiveConnection.async_handle_exception` builds the message with `humanize_error(msg, err)` for a schema failure and logs it (HA `websocket_api/connection.py`). The repo already knows: `websocket_answer`'s `text` is typed `object` for that reason (`__init__.py:462-464`). Section 5 applies it to every memory field. |
| Review B2: an options save leaves no safe moment to read "any pet allows it" | **True, with a correction to the cite.** The options flow is `PetOptionsFlow(OptionsFlowWithReload)` (`config_flow.py:337`), saved by `async_create_entry(data=new)` in `_topic_step` (`config_flow.py:522`), and the entry then reloads; `async_unload_entry` pops the pet from `hass.data[DOMAIN]["pets"]` (`__init__.py:994-1001`, "a reload of the only pet (options) keeps its bundle"). The review's `config_flow.py:214` is the reconfigure flow, same effect. There is **no options-update listener**, so the plan's old wording had nothing to hook. The people store is `hass.data[DOMAIN]["people"]` (`__init__.py:219`), reachable from the options flow. |
| Review S3: the 15:00 claim in M0-a | **True.** `follow_question` is gated by `hour >= R.ASK_DAY_FROM` (16) at `people.py:726`; the came-home ask has no hour floor (`people.py:718`); `mark_asked` closes the later slot (`people.py:714, 818`). Section 7 re-specs it. |
| Review S9: the ask burns on an old card | **True.** `_question` marks the ask and `mark_once` at ask time (`coordinator.py:2004-2006`); the `phone` ask alone waits for the card's "shown" answer (`coordinator.py:1981-1987, 2161-2166`). |
| (found while checking) "great" never reaches the server | **True.** `ANSWERS["how_day"]` is `("tough",)` and the card sends only "tough" (`people.py:63-66`, `card-visit.js:439-441`): "great" and "ok" stay on the card on purpose. Door 2 needs "great", so M1b adds a card send and an accepted answer that exist **only while memory is on** (section 8). |
| Assist knows the asker (`intent.py:245`) | True (`bond_for(intent_obj.context.user_id)`). Memory still never reaches `intent.py` or `llm.py`. |

## 2a. The M1a/M1b review (s2744), checked against the code

Read at `afac8d9b`. Every finding was checked; all 17 held (no finding was rejected).
Where the fix is not what the review recommended, the row says so.

| Finding | Check | Where it landed |
|---|---|---|
| **B1** `shared` guard misses the new `remember` paths | **True.** `websocket_answer` has `vol.Optional("shared")` and uses it only to drop typed text (`__init__.py:470, 498`); the card's `_keepAnswer` sends none; `virtual_pet.visit` is a service with no `shared`. | R3, section 5 "WS command rules", section 8 M1b card work, section 10 "Shared screens" |
| **B2** "great" would set a soft morning | **True.** `coordinator.py:2116-2117` calls `set_mood` for any accepted `how_day` / `big_how` answer; today that is only "tough" (`people.py:63-66`). | section 8 M1b, section 10 "Great answer" |
| **B3** Diagnostics row passes vacuously | **True** (`diagnostics.py:84-93, 126`; bonds and `care_log[].by` keep ids in the store by the "bonds stay" decision). | section 2 (row for `REDACT_PEOPLE`), R4, section 10 "Diagnostics" |
| **S1** door 6 specified two ways; "within 3 days" unmeetable | **True.** `turnPick` (`world.js:284-293`) only guarantees no line on two consecutive days; `FAV_WEATHER_LINES` has 4 lines per weather. **Resolved by Q-B.** | section 6 (door 6, "Door timing"), M0-b, section 14 item 8 |
| **S2** `people.said` / `mark` write `noted`, outside `memory` | **True** (`people.py:258-273`; the visit marks every note, `coordinator.py:1724-1725`). | section 8 M1a, section 10 "Off leaves no trace" |
| **S3** the ask's `shown` is not `phone`'s way; `ONCE_KINDS` marks it | **True.** `phone` is not in `ONCE`; `_question` calls `mark_once` for every kind in `ONCE_KINDS` (`coordinator.py:2011-2012`). | section 5 "The one-time ask", section 10 "The ask" |
| **S4** the ask's answers have no guards; loader details left out | **True** (`QUESTION_KINDS` at `people.py:151`, `later_kind` check at `:552`, `_PERSON_KEYS` at `:474`, `forget` at `:246`). | section 5, section 8 M1a and M1b |
| **S5** door spacing, order and triggers undefined | **True.** | section 6 "Door timing" |
| **S6** "Door order" row untestable | **True** (door lines come from the `visit` reply). | section 10 "Doors", "Door order" |
| **S7** flags also ride on `_visit_prefs`; caps on write | **True** (`coordinator.py:1743-1755`; `remember` is sync; the prune is daily, `people.py:321-325`). | R3, section 8 M1a, section 10 `_mine` and Retention rows |
| **S8** an entry removed while others are off leaves a hole; the flow's `KeyError` | **True** (`__init__.py:219-222`; the settings row is hidden unless `memory_allowed`). **Resolved by Q-C.** | section 5 "The erase", section 12, section 10 |
| **S9** the guide's "kept for you alone, for every pet" | **True** (`docs/guide.md` "What the pets remember about you"; `forget_me` reaches only loaded pets, `__init__.py:572-575`). | section 8 M1a docs |
| **N1** `ask_again` is shipped | **True** (`__init__.py:581-612`). | section 4 `since_told`, section 8 M1a |
| **N2** copy `websocket_ask_again`'s shape | **True.** | section 5 "WS command rules" |
| **N3** `memory` follows `ask_again`, not `my_day`, for `shared` | **True** (`websocket_my_day` has no `shared`). | section 5 |
| **N4** `forget_me` is not a memory command; no `shared` field | **True** (`__init__.py:560-579`). | R3 |
| **N5** docs test strings; HANDOFF line owner | **True.** | section 8 M1a, section 10 |

## 2b. The M2 review (s2782), checked against the code

Read at `origin/main` `9f4c8125`. Every problem was checked against the code first; all 15
held (none rejected). "FM" is the first mate's answer of 2026-11-03 (section 1).

| Problem | Check | Where it landed |
|---|---|---|
| **1** (B) "answered twice" is false | **True.** `_askTextEnd` sends one `yes`; a second `yes` re-runs `open_follow`, replaces the event and resets `said`. | section 4 "Dates and keys", section 8 M2, section 14 item 19 |
| **2** (B) chips have no slot | **True.** FM Q2: inside the text-step box, `step.tag`. | section 8 M2 "The card", section 11, section 14 |
| **3** doors need a tag; the row forbids it | **True.** FM Q1. | section 1, section 10 `_mine` row, section 8 |
| **4** doors 1, 3, 10 have no window, key, order | **True.** FM Q5. | section 6 "Door timing" and bullets, section 8, section 10 "Doors", section 12 |
| **5** door 11's hook is stale | **True** (`_notes` celebrations block; every whole month). FM Q6. | section 6a "Door 11's carrier", section 12 |
| **6** example lines fail the scan; no approved copy | **True.** FM Q3, Q4. | section 6a (draft table, scan result), section 6 table |
| **7** which tag feeds which door contradicts | **True.** FM Q8. | section 4 (the table, `exam`), section 14 item 8 |
| **8** a valid tag the server will not store | **True.** FM Q7. | section 5 "The `tag` field", R3, section 10 |
| **9** M2 acceptance is one paragraph | **True.** | section 8 M2 "Acceptance" |
| **10** door 9 residue | **True** (R6, section 8, the "Door 9 ..." paragraphs). | R6, section 2, section 6 table row 9, "Old stores" and "The not chosen list", section 8 |
| **11** "forgetting ends the pattern" is wrong | **True** (4-of-5; window moves). | section 6 door 10 bullets, section 10 "Erase: per item" |
| **12** `BIG_DAY_AHEAD` is 6; the Saturday formula | **True** (`people.py`; `follow_dates` returns the Monday). | section 4 "Dates and keys" |
| **13** "open event" check is vacuous | **True.** The guard is `asked_later` and `keep`. | section 4 |
| **14** M1a already built the tag plumbing | **True.** | section 8 M2 |
| **15** where the tag is validated | **True** (`async_answer`; the handler's `except ValueError`). | section 5 "The `tag` field" |

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
  `memory_get`, `memory_forget`, `ask_again` and the `memory` ask's answer) takes `shared` as a **required** bool and the server refuses unless
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
  **Every write path is covered (M1 B1).** The rule is on the *write*, not the command
  name: any `answer` that would call `remember` (a dream, guess, game or favourite pick,
  "great", `since_told`, a `tag`) needs `msg.get("shared") is False`. An `answer` with
  `shared` true or absent still stores its ordinary state (the pick, the like, the `yes`
  that opens a big day) and writes **nothing** to memory, and it is not an error, **a `tag`
  included** (FM s2782 Q7: the `yes` is kept and the tag dropped silently); the `memory`
  ask's answers are refused with the generic error, and so is a `tag` outside the fixed
  list (section 5). The card passes `shared: false` explicitly (an old
  card sends none, so it writes no memory: the same fail-closed stance as an old card
  elsewhere). **What the server cannot guard:** door notes and the `memory` ask come from
  the `virtual_pet.visit` service's reply, which has no `shared`; the only guard there is
  the card's own skip (`card-visit.js:216, 230`), and `said` / `memory_asked` are marked
  at generation. `forget_me` is **not** a memory command and gets no `shared` field (a
  behaviour change for old cards); the card guards it (`card-status.js`) and it erases.
  `_visit_prefs` carries `memory_on` and `memory_allowed` too (M1 S7), as booleans only,
  so a second device never shows a default.
- **R4. Never off the private path.** Memory is on no entity state or attribute, no bus
  event, no logbook entry, no service call or script trace, no phone notification, no
  diagnostics dump (`memory` joins `REDACT_PEOPLE`; the people store is not dumped, so
  the real guard is that nothing puts memory into a pet's save), no integration log, no Assist or LLM
  output, no `debug` sensor. Every row of the F1 privacy table (plan-2026-11-01-fresh-expand.md,
  "The privacy table") applies again, with the same tests. **Bonds and `care_log[].by`
  keep user ids in the store by decision** ("bonds stay", `__init__.py` `forget_me`
  docstring), so no test or guide line ever claims "no user ids" for the store; the claim
  is only "no dream pick and no dream asker" (M1 B3, section 10).
- **R5. Only fixed-list values and dates on disk.** No typed words, no names (not the
  person's, not another person's, not a pet's), no times of day, no places, no free text.
  Anything outside the fixed lists is dropped on load, entry by entry. There is
  **no `appointment` tag** (review S5, section 4): it would feed no door and would only
  put a health-adjacent dated list into every backup.
- **R6. Kept until forgotten; count caps only (Q4 = C).** No time-based expiry on a
  remembered thing. Each class has a count cap; when full, the oldest entry goes (section
  4). Operational bookkeeping that is not a memory (the one-line
  `said` marks) is pruned by its own day, as follow-up events are today. `People.prune`
  gets the cap step; load drops invalid entries as it drops an expired event
  (`people.py:219-220`).
- **R7. Every erase path erases for real, saved at once.** Turning the switch off pops
  `person["memory"]` and saves immediately, like `forget`. "Forget my data" erases it with
  the rest. A per-item forget removes that entry and saves at once. The admin option
  being switched off on the last pet that allowed it (section 5) erases every person's
  memory, from the options flow's save or from removing an entry (FM Q-C) and nowhere
  else. Favourites, the birthday and the
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
  their picks then show on that person's page. The guide says so (R3). **Decided (FM Q-D,
  2026-11-02; section 1):** the one-time ask is **held while the person's `baby_talk` is on**
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
  "since_told": {"fav_weather": "2026-11-20", "fav_season": "..."},
                                       # only for a favourite told WHILE memory is on
  "said": {"door2": "2026-11-15", "door6_fav_weather": "2026-11-21", ...},
                                       # last day a door's line was said; door 6 is one-shot
                                       # per favourite, so its key holds the day it fired
}
```

| Class | Cap | Why this number |
|---|---|---|
| `tags` | **120 entries**, oldest out | Big day is asked at most once a week and weekend once a week (`BIG_DAY_GAP` 6, `FOLLOW_ASK_PER_WEEK` 2), so at the very most about 104 tags a year. 120 holds the anniversary window (13+ months) even for someone who says yes to everything; for most people it spans several years. About 40 bytes an entry, so under 5 KB. |
| `picks.dream`, `.game`, `.guess`, `.great` | **5 each**, oldest out | Doors 4, 5 and 12 look at "3 of the last 5"; more history buys no door and keeps more in backups. 20 entries at most. |
| `since_told` | one per favourite: weather, season | Bounded by the fixed lists (at most about 12). |
| `said` | one per door, plus one per door-6 favourite (about 14) | A "last said" day so a door doesn't repeat; bounded by the door list. **Lives only in `memory["said"]`** (M1 S2): never in `person["noted"]`, which `People.said` / `People.mark` use and which survives "off". |

The whole record is bounded at roughly 160 entries, well under 10 KB.

**Dates and keys (review S4, S11).**
- **Caps hold on write, not only on the daily prune** (M1 S7): `remember` drops the oldest
  entry of its list the moment the list passes its cap (the prune runs once a day,
  `people.py:321-325`), so 130 tags in one day leave 120.
- **One entry per key, so a repeat can't double-record.** `tags` holds at most one entry
  per `(day, kind)`; each `picks` list at most one per `day`. A second write for the same
  key **replaces** the entry. The per-item key is therefore `(list, day)` for picks and
  `(list, day, kind)` for tags, with no new id, and "forget removes exactly one entry"
  holds.
- **The tag rides on the one `yes` (M2 B1; the review found the earlier "answered twice"
  wording false).** The card sends **one** `virtual_pet/answer ... yes` per ask, at the end
  of the text step (`_askTextEnd`, `src/card/card-looks.js`: "However it ends ... the 'yes'
  is sent once"); with no follow support or on a shared screen `_askTextStart` sends one
  `yes` at once. The day question for a big day sends nothing. So the tag is chosen on the
  card **before** that single send, held on the step object (`step.tag`, section 8), and
  goes in the same `answer`. There is no second call to carry it and no "a later tag
  corrects an earlier one" rule. A repeated `yes` is not a normal path: it calls
  `People.open_follow` again, which **replaces the event, resets `said`** and pops the
  held typed words (`self._texts`), as it does today. If a hand-made client repeats a `yes`
  the same day with a different `tag`, the entry for that `(day, kind)` is replaced (the
  key rule); with a different `day` it adds an entry per day, at most 6 (`BIG_DAY_AHEAD`)
  for one ask, own data, capped (M2 N13: accepted, said plainly).
- **The write guard is `keep` and `asked_later` (M2 N13).** The tag is written inside the
  `LATER_CHECKED` branch of `async_answer`, after `asked_later(person, today, question)`
  holds (the dated kinds keep `later_kind` after a `yes`, `SLOT_CLOSED_BY_ANSWER` omits
  them), and only when `keep` (memory on, this pet's option, `shared` false: the same flag
  the picks use). Not "an open event": the tag rides on the call that opens it.
- **`tags.day` is the event's own day:** for `big_day` the day they picked
  (`big_day_pick`, the next 1 to 6 days: `BIG_DAY_AHEAD = 6`, `people.py`; the event's
  `due`); for `weekend` the **Saturday** of that weekend. `follow_dates("weekend", today)`
  returns the **Monday** as `due`, so the Saturday is `due` minus 2 days (M2 N12). The
  weekend ask is made on Fridays only (`follow_question`, weekday 4), so the Saturday is
  the next day. A big day picked ahead may not happen; the tag is what the person said
  was coming, and the doors and the page say "you told me" rather than "you went".
- **Which doors read which tag, and which kind** is the table below (M2 S7). Doors 1, 3,
  10 and 11 read `big_day` tags only (they need a real, specific day). **`weekend` tags
  feed the page and nothing else** (door 11 reads `big_day` tags, section 6a; the earlier
  "weekend tags feed door 11's recap" had no line to use them).
- **`since_told`** has no value for a favourite told before memory was on (`likes` holds
  values with no date, `coordinator.py` answer branch). The page shows no "since" for
  those and door 6 does not fire for them; nothing is back-filled. `ask_again` (M0-c) is
  **already shipped** (`async_ask_again`, `coordinator.py:2238-2262`, `__init__.py:581-612`)
  and pops `likes[kind]`; M1a **edits** it to pop the matching `since_told` key (and the
  door-6 `said` key, so the one-shot can fire for the new answer) too, or the page would
  show a favourite that was un-told. It pops them **even when the pet's option is off**:
  that is an erase, not a write (M1 N1). It reads memory with `.get`, never `person()`.

**Not kept, even with the switch on:** typed words (they stay memory-only until the event
closes, as now); any name; times, places; **a "tough" mood** (the soft morning stays
memory-only for one day as today; a saved list of someone's bad days has no door that
needs it, and a backup shouldn't hold one). Only "great" is saved, for door 2; "great"
never sets the soft morning (M1 B2, section 8). No
right/wrong count for guesses or games (the "no score" rule, guide.md "Using the card").

**The fixed tag list (draft):** exam, match, show, trip, party, lesson, work thing,
something else (keys `exam`, `match`, `show`, `trip`, `party`, `lesson`, `work_thing`,
`something_else`). Translatable, so no free text; the labels are in section 6a, which the
first mate approves. **`test` is renamed `exam`** (FM s2782 Q8): "test" can be read as
medical, the reason `appointment` was dropped. M1a shipped `MEMORY_TAGS` with `test`
(`people.py`) but nothing writes a tag yet, so no store holds one and the rename is a
one-word change in M2 (a stray `test` in a hand-made store is dropped on load like any
other value outside the list). **`appointment` is dropped from the scout's list** (review
S5; section 13): no door would read it, and it would sit in every HA backup as a dated
health-adjacent list only to be shown on the page.

**Which tag feeds what (M2 S7; the single table, replacing the earlier contradiction
between this section and section 14).** "Page" is the M3a page. "Sticker" is M3b's
(section 9).

| Tag | Door 1 | Door 3 | Door 10 | Door 11 | Page | Sticker |
|---|---|---|---|---|---|---|
| `exam` | yes | **no** (FM Q4/Q8) | no | yes | yes | yes |
| `match` | yes | yes | yes | yes | yes | yes |
| `show` | yes | yes | yes | yes | yes | yes |
| `trip` | yes | yes | no | yes | yes | yes |
| `party` | yes | yes | no | yes | yes | yes |
| `lesson` | yes | yes | yes | yes | yes | yes |
| `work_thing` | no | no | no | no | yes | no |
| `something_else` | no | no | no | no | yes | no |
| any `weekend` tag | no | no | no | no | yes | no |

Door 11 and its line read **one** tag (section 6a). Neither `work_thing` nor
`something_else` ever reaches a door, a sticker, a count or the recap; the page is their
only reader. (Section 14 item 8 asks the reviewer to check exactly this.)

## 5. The switch, the ask, the admin option (M1a, M1b)

**The person's switch (M1a).** A row beside "my day" in the settings sheet
(`card-status.js:190, 249-250`, a `_mineSwitch` on `mine.memory_on`), shown on a personal
screen only, and only when `mine.memory_allowed`. The forget-me reset (`card-status.js:463`,
`_setMine(key, false)` over `my_day`, `baby_talk`, `birthday_*`) gains `memory_on`, or the
card shows a stale "on" after "forget my data" (review nit). WS command
`virtual_pet/memory` `{entity_id, enabled, shared}` follows `my_day` (`__init__.py:765`)
for its pet lookup and `async_set_memory(user, enabled)` then `_push_everywhere()`, **but
follows `ask_again`, not `my_day`, for `shared`** (M1 N3): `websocket_my_day` has no
`shared` field (`__init__.py:799-818`). Off erases (R7). Turning **on** is refused when
this pet's option is off; turning **off** is exempt from the option check only, and
**still needs `shared: false`** (a shared screen has no row anyway).

**WS command rules (every memory command; review B1, S1, S8; M1 B1, N2).**
- **The shape is `websocket_ask_again`'s** (`__init__.py:581-612`): `vol.Required("shared"):
  bool`, refused first (`if msg["shared"] is not False: send_error(..., "shared", ...)`),
  **before** the pet lookup, then `no_pet`. The free-value fields are `object` typed and
  checked in the handler. The fixed error codes are `shared`, `no_pet` and `not_asked`
  (one generic text each), so a test can assert "one generic error".
- `shared` is a **required** bool, refused unless `is False` (R3, fail closed); tests send
  it `true` **and absent**.
- **`answer` is the exception, because it predates memory** (M1 B1): `shared` stays
  `vol.Optional` there (an old card, or a pick that has nothing to do with memory, must
  still work). The server calls `remember` only when `msg.get("shared") is False`;
  otherwise the pick or like is stored as today and memory is left unchanged. The
  `memory` ask's answer with `shared` not `False` is refused with the generic error. The
  M1b card passes `shared: false` from `_keepAnswer`, `_sendFollow` and the new "great"
  send.
- **The `tag` field (M2 Q7, S8, N15).** `tag` is optional on `answer`, typed `object`, and
  checked in `async_answer`, not in `websocket_answer` (whose `ANSWERS` check is for
  `answer` only): a `ValueError` there becomes the fixed "It didn't ask that" message
  (`__init__.py`, the handler's `except ValueError`), so the one generic error holds. Two
  cases, and they differ:
  - **A value outside the fixed list (or not a string, or a tag on a question that has none):
    refused** with the one generic error, **nothing saved** (not the `yes`, not the event).
    A real client never sends one, so this is the tampered-client path; the `caplog` test
    (section 10, "Logs") covers it.
  - **A valid tag the server cannot store: the `yes` is kept and the tag dropped, silently,
    no error.** That is memory off for this person, this pet's option off, or `shared` not
    `False`. A person who turns memory off on another device while the chip row is open
    must not lose their big day or the typed words; this is how the picks already behave
    (the ordinary answer stores, memory is left alone). The list check runs first, then the
    storage check, so a bad value is refused whatever the memory state.
- `tag`, `key`, `list`, `pick` are typed `object` in the schema (as `text` is,
  `__init__.py:462-464`) and checked in the handler, which sends one generic error
  (`not_asked` style) that never repeats the value. HA logs a schema failure at ERROR
  with `humanize_error`, so a `vol.In` here would put the value in `home-assistant.log`,
  and a `memory_forget` `key` with a valid day and a wrong `list` is a real remembered
  entry. The handler's error text and any `ValueError` text also carry no value
  (`websocket_answer` already turns `ValueError` into one fixed message).
- **The pet's option is checked on the server, not only in `_mine`** (review S8):
  `memory_get`, `memory_forget` and the `memory` ask's answer are refused with
  one error when **this pet's** `CONF_MEMORY` is off, even if the person's memory is on
  through another pet. Only the switch-off is exempt. A `tag` is **not** refused for this:
  it is dropped silently (the bullet above, FM s2782 Q7).

**The one-time ask (M1b).** A `memory` ask, level 4, after `birthday` in the order (so
`ASK_ONCE_GAP_DAYS` = 3 keeps them apart), asked only when `memory_allowed`, not yet on,
not already answered, and **not while the person's `baby_talk` is on** (R10, FM Q-D).
Answers `ANSWERS["memory"] = ("shown", "yes", "not_now")`.
- **It counts as asked only when the card says it showed it** (review S9; M1 S3). The
  review found the earlier wording ("in the `phone` ask's way") did not match the code:
  the `phone` branch of `async_answer` only sets `phone_asked = True`
  (`coordinator.py:2167-2172`) and `phone` has no tries or `once_last`; and `_question`
  calls `P.mark_once(...)` for **every** kind in `P.ONCE_KINDS`
  (`coordinator.py:2011-2012`), which is built from `ONCE` (`people.py:81`). So
  **`memory` is not added to `ONCE` / `ONCE_KINDS`**: it lives in its own tuple
  (`MEMORY_ASK = ("memory", <level 4>)`, the level a constant beside `R.BIRTHDAY_ASK_LEVEL`), and `once_due` consults it after the
  `ONCE` loop. Test: `_question` choosing `memory` writes no `likes_asked`, no `once_last`.
- **The `shown` write** is `mark_once` (tries in `likes_asked["memory"]`, `once_last`) **plus**
  the guard `asked_later(person, today, "memory")`, so a stray `shown` counts for nothing.
- **A stale card cannot starve the later slot** (M1 S3). An old cached card (the file keeps
  its name and URL) ignores an ask kind it doesn't know (`QUESTIONS[ask]`,
  `card-visit.js:235`) and never sends `shown`; with no tries counted, the ask would sit
  first in `once_due` **every day** and burn that day's later slot each time, starving
  how_day, weekend and the rest. So `_question` records each day it chose `memory` without
  a `shown` (`memory_chosen_days`, a short list of dates in the person's record, outside
  `memory`, content-free, kept by `forget`), and **stops choosing it after 3 such days**;
  it is tried again after the usual weeks gap. **As built (FM Q5):** the gap is on the
  days list itself, not `may_ask_again` (an unshown ask has no tries, so that is always
  true): chosen only while fewer than 3 chosen days fall in the last
  `ASK_LIKES_AGAIN_DAYS` (14); the writer keeps the newest 7 (the loader drops a longer
  list whole); `shown` clears the list. Acceptance: a card that never sends `shown` gets
  `how_day` on day 4.
- **The answers have guards** (M1 S4). "yes" and "not_now" require
  `asked_later(person, today, "memory")`: a bare "yes" with no ask today would otherwise
  be a second, unguarded route into R2's "only by a WS command from a personal screen",
  and would skip the ask's accounting. "yes" is also refused when **this pet's option is
  off**, and (R3) needs `shared: false`. Each is a pytest.
- **Loader and `forget`** (M1 S4). `"memory"` joins `QUESTION_KINDS` (`people.py:151`)
  **so the load validator at `people.py:552` keeps a saved `later_kind: "memory"`**; if
  it didn't, the open ask would be dropped on a restart. `_PERSON_KEYS` (`people.py:474`)
  gains `"memory_asked": bool`, `"memory_chosen_days"` and `"memory"`, each with a
  validator. `People.forget` (`people.py:246-254`) today writes `{"birthday_skipped":
  True}` only when set; it must keep **both** flags (a person with both keeps both) and
  `memory_chosen_days`.
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
- The erase runs from **two places and nowhere else** (FM Q-C, 2026-11-02): the options
  flow's save, and `async_remove_entry`. **Options save** (`PetOptionsFlow._topic_step`,
  just before `async_create_entry`, `config_flow.py:522`): only when this save **changes
  `CONF_MEMORY` from on to off** (old = `self.config_entry.options.get(CONF_MEMORY,
  True)`, new = the merged value) **and** every **other** entry of the domain
  (`hass.config_entries.async_entries(DOMAIN)`, whatever its state) has
  `options.get(CONF_MEMORY, True)` false. It compares **stored options**, never live
  coordinators.
- **Removing an entry** (`async_remove_entry`, `__init__.py:1065`; M1 S8, FM Q-C): the
  hole the review found is pets A (on) and B (off), the admin removes A. Memory is now
  allowed on no pet, nothing erased, and nobody can turn it off from the card (the
  settings row is hidden unless `memory_allowed`). So removal runs **the same comparison
  of stored options**: if **every other entry of the domain** (`async_entries(DOMAIN)`,
  filtered by `entry_id != removed.entry_id`, so it does not matter whether HA has already
  dropped the removed one from the list) has `options.get(CONF_MEMORY, True)` false, the
  erase runs. If the removed entry itself had memory off and the others are all off, it
  runs too (nothing allows it). Removing the **only** entry: there are no others, so
  "every other is off" is vacuously true and it erases; this replaces the earlier "removing
  the last pet leaves memory" (section 12).
- **Never** on unload, setup, reload or the daily prune. An unrelated option saved on the
  only pet leaves memory alone.
- **Failure modes** (M1 S8). The flow and `async_remove_entry` reach the people store as
  `hass.data.get(DOMAIN, {}).get("people")`, never `["people"]`: the store exists only
  while the integration is set up, and an options flow on an entry whose setup failed (or a
  removal after a failed setup) would otherwise hit a `KeyError` before
  `async_create_entry`. A missing store **skips the erase and saves the option** (the
  record is then not loaded anywhere, so nothing is shown; it is cleared by the next
  options save or "forget my data").
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
  no erase; flip back on -> nothing returns. **Removal:** A on, B off, remove A -> erased
  and saved; A on, B on, remove A -> nothing; A on, remove A (the only pet) -> erased; a
  disabled C with memory on blocks it. **No store:** the flow and the removal with no
  `people` in `hass.data` save the option (or finish) without an error.

## 6. The doors, by ship

All lines are DRAFT. Each is said only on that person's own non-shared screen, only with
the switch on and the option allowed, and once per door per its own spacing (`said`, in
`memory["said"]` only, M1 S2; "Door timing" below). The screen guard is the card's own
skip, since the `visit` service cannot see `shared` (R3).

| # | Door | Example (draft) | Ship |
|---|---|---|---|
| 2 | **Good-day echo:** morning after a "great" to how_day or big_how | "yesterday was a great one! more of that" | M1b |
| 4 | **Running joke:** 3 of the last 5 dream picks the same | "snacks again?! hehe, ok" | M1b |
| 5 | **Your habit:** the last 5 guesses all the same way | "you always say sun! my sunny friend" | M1b |
| 6 | **Since you told me:** the first time a favourite **weather or season** comes back after it was told (**one-shot per favourite**, FM Q-B). **Not** part of M0-b's rotation: its own short list, replacing that day's plain line | "it's snowing! you told me snow's the best" | M1b |
| 12 | **The game you picked:** 3 of the last 5 game picks the same. **No "lapsed" clause** (FM Q-B): no "played" signal exists | "your dig again? i'm ready" | M1b |
| 1 | **Week-later echo:** exactly 7 days after a tagged `big_day`'s own day, once; the six named tags and `exam` (section 4 table). The line does not say the day happened ("you told me", FM s2782 Q4) | "thinking of the show you told me about" | M2 |
| 3 | **Anniversary:** exactly a year after a tagged `big_day` (not `exam`, FM s2782 Q4/Q8). "you told me", not "you went" | "a year ago you told me about a trip ♥" | M2 (dormant until a year passes) |
| 9 | *(Dropped, FM Q4, 2026-11-02: not built. The number stays unused so the other doors keep theirs.)* | | |
| 10 | **Weekday pattern:** the same tag on the same weekday 3 times | "maybe a match tomorrow! go you ♥" | **M2, its own last commit** |
| 11 | **Friendship-year recap** on the 12-month friendship day only, by extending the `friends_for` note (FM s2782 Q6); **no numbers and no count words** (section 4 forbids counts shown as a score, and the sticker rule says the same) | "a whole year! you told me about a show" | M2 |
| 7 | **"Things you told me" page** | see section 9 | M3a |
| 8 | **Stickers** | see section 9 | M3b |

### Door timing (M1 S1, S5; FM Q-B)

The review found door 5 ("last 5 guesses all the same") and door 4 still true every day
after they first fire, so without a spacing they would fire daily. Each door gets one:

| Door | Trigger | Spacing (`said` key) | Window |
|---|---|---|---|
| 2 | `picks.great` has an entry for **yesterday** | once per such day (`door2` = the day it was said; it cannot fire twice for one great day) | the first look of the day, before 12:00 |
| 4 | 3 of the last 5 `picks.dream` entries the same | 7 days (`door4`) | a look, 11:00-20:00 |
| 5 | the last 5 `picks.guess` entries all the same | 7 days (`door5`) | a look, 11:00-20:00 |
| 6 | the favourite was told on an earlier day (`since_told[key]` < today) and its matching weather or season comes back | **one-shot per favourite** (`door6_fav_weather`, `door6_fav_season`); `ask_again` clears the key (section 4) | the day's existing fav-weather / season note |
| 12 | 3 of the last 5 `picks.game` entries the same | 7 days (`door12`) | a look, 11:00-20:00 |
| 3 | today's (month, day) equals the (month, day) of a `big_day` tag exactly 1 year back, tag not `exam`, `work_thing` or `something_else` (Feb 29 below) | once per such day (`door3` = the day it was said; it cannot fire twice on one day) | a look, 11:00-20:00 |
| 1 | a `big_day` tag whose own `day` is exactly **today minus 7**, tag not `work_thing` or `something_else` | once per such day (`door1` = the day it was said) | a look, 11:00-20:00 |
| 10 | tomorrow's weekday is the pattern's weekday (below) for `match`, `lesson` or `show` | **28 days across all patterns** (one `door10` key; saying the `match` line holds back the `show` line too) | a look, 11:00-20:00 |

(M2 S4: the rows for 3, 1 and 10 sit below door 12 in the table because they are M2's;
the order they fire in is the next bullet, not the row order.)

- **Day keys.** `picks.guess` is keyed on the day the answer was **given** (`today`), not
  the guessed day (`person["guess"]` stores `tomorrow`, `coordinator.py:2197`, for its own
  outcome line; `remember` is passed `today`). The other picks key on the answer day too.
- **One door per visit, in this order: 2, 3, 1, 10, 4, 5, 12** (M2 S4, FM s2782 Q5; door 6
  is the weather note and never counts). **This is an exception to door-number order, and
  it is on purpose:** doors 3, 1 and 2 are the ones that can be reached **only on one
  day** (an exact-day trigger), and 10 only on one eve. Door 4, 5 and 12 stay true for
  days (their 7-day spacing is what stops them), so they go last. In door-number order door
  1 would sort ahead of door 2 and take the single look door 2 can use, and door 2 is
  then gone for good. `memory_door` (`people.py`) returns the first due door in this
  order. The door goes **after** any birthday or celebration note and inside the
  `NOTES_PER_VISIT` room the look already has; a door that finds no room waits for the
  next look and is not marked said.
- **An exact-day trigger is lost when no look falls in its window (FM s2782 Q5).** Doors
  1, 2, 3 and 10 are tied to one day; if there is no look from 11:00 to 20:00 (door 2:
  before noon) that day, the door is gone for good, **accepted** as for a stale card (section
  12). No plus-or-minus-N-days window is added.
- **One `said` key per door (FM s2782 Q5): `door1`, `door3`, `door10`.** The regex
  `_MEMORY_SAID` (`people.py`) already matches them (`door(?:[1-8]|1[0-2])`) and takes no
  suffix, so it needs **no change**, and `said` grows by at most three keys (section 4
  budgets about 14). There is no per-tag or per-pattern key, so "door 1 once per tag" is
  kept by the exact-day rule and "door 10 once per pattern" by the 28 days across all
  patterns.
- **Feb 29 (FM s2782 Q5): a tag on Feb 29 uses Feb 28.** Door 3 compares (month, day) of
  today with (month, day) of the tag's day, and **a tag whose day is Feb 29 counts as Feb
  28** (`date.replace(year=...)` would raise on it, and a Feb 29 tag would otherwise match
  only every fourth year). Today is used as it is, so Feb 29 itself fires nothing and a
  tag fires on exactly one day a year (no double fire on Feb 28 and 29). The tag's year
  must be exactly one before today's. A tag on Feb 29, 2028 fires on Feb 28, 2029. If a Feb
  28 and a Feb 29 tag of the same year both map to Feb 28, the **later** day's tag goes
  (one door a visit). Door 1 is a plain `today - 7 days` date (no `replace`) and needs no
  rule.
- **Two tags on one day:** `tags` holds at most one `big_day` entry per day (the key rule),
  so doors 1 and 3 have at most one candidate per day; across years the year-back tag
  goes, not older ones.
- **Door 6's carrier.** The server's existing `fav_weather` and `season` /
  `season_holiday` notes (`coordinator.py:1898-1938`) gain a boolean `told` (e.g.
  `{"kind": "fav_weather", "weather": fav, "told": true}`), set only when memory is on, the
  pet's option allows it and `since_told` is an earlier day with no `door6_<kind>` mark;
  the visit marks `door6_<kind>` when that note goes out. It is **not** a `_mine` field
  (R3: `_mine` has only the two booleans); the note exists only on the `visit` reply. The
  card swaps in a door-6 line when `told` is set, else the M0-b rotation as today. A
  **visitor** favourite has no door in M1b, and a favourite told before memory was on has
  no `since_told`, so no door 6 (section 4).
- **Door 12 closes** scout 1.3 item 6 only in the narrow sense above: the "game picked and
  never played" case stays open (section 12).

**Door 10, now in scope (Q1 = C): M2, its own last commit.** It needs only the M2 tag
history; the weekday is computed from the saved date, so **no new data is kept** for it.
Because it is the most sensitive door, the plan limits it:

- Only for `big_day` tags `lesson`, `match` and `show` (a weekly activity). Never
  `exam`, `work thing`, `party`, `trip` or `something else`, and never a `weekend` tag
  (its day is the Saturday, section 4).
- Only after **3 of the last 5 entries for that tag fall on the same weekday**, said on
  the **eve** of that weekday, **at most once per 28 days across all patterns** (the one
  `door10` key, FM s2782 Q5), on a look from 11:00 to 20:00 (lost if there is none).
  "The last 5" are the last 5 `big_day` entries of that tag **by day**, as they stand now.
- The line never names the weekday's reason beyond the tag, and never says the pet
  "knows" or "has been watching" (no surveillance framing; first mate checks the copy).
- **A pattern is re-derived from the entries that remain (M2 S11).** The earlier claim
  "forgetting any one entry ends the pattern at once" was false in two cases: with 4 or 5 of
  the last 5 on the weekday, forgetting one leaves 3 and the pattern stands; and forgetting
  an entry that is *not* on the weekday moves the "last 5" window, so an older matching
  entry can enter it and start a pattern that was not there. Door 10 is a pure function of
  the remaining `tags` and nothing is stored for it, so it is always consistent with the
  page: forgetting a tag ends the pattern **exactly when fewer than 3 of the then-last 5
  of that tag share the weekday**. (How the M3a page lets a person forget a pattern item is
  M3a's call; it can only forget entries, and the pattern follows.) Turning memory off
  erases the history it came from.
- Separate commit so the first mate can drop it from the batch without touching the rest.

**Old stores.** A store holding `heard`, `door9` or a `visitor_*` since-told key (door 9's
leftovers, from before FM Q4) still loads; the loader drops them quietly (M1b audit,
finding 4).

**The "not chosen" list (review S10; M2 problem 10).** `docs/HANDOFF.md` (the line near
525) lists, as *not chosen, don't start unasked*, "learning household routines" and "pets
on the shelf noticing each other". Door 10 is a learned routine, but the owner chose it
(Q1 = C), so **the door-10 commit changes the routines clause only**: "learning household
routines" is reworded to say weekday patterns for three tagged kinds are chosen. **"Pets on
the shelf noticing each other" stays "not chosen"** (FM Q4 said no to door 9); a worker
must not delete it.

**Door 12 does not close** Part 1 item 6 of the scout (a game picked and never played):
FM Q-B dropped the "lapsed" clause because no "played" signal exists, and a new one is not
in this plan (M1 S5).

### 6a. Door 11's carrier, and the M2 draft copy (M2 S5, S6; FM s2782 Q3, Q4, Q6)

**Door 11's carrier (FM s2782 Q6).** The 12-month friendship day is the existing
`friends_for` note: `_notes` (`coordinator.py`, the celebrations block after
`model.friends_for(bond.get("since"), today)`) puts `{"kind": "friends_for", "months": n}`
into `celebrations`, and only `celebrations[:1]` goes out a look. (The old cite
`coordinator.py:1825-1837` has moved; names win.) `friends_for` fires on **every whole
month**; the card already says "we've been friends for a whole year!!" at 12 months
(`ui-copy.js`, `NOTES.friends_for`). M2 extends that note and nothing else:
- **Only when `months == 12`**, memory is on for this person, this pet's option allows it,
  and the visit came from a personal screen (the card's own skip, R3). **24 months and up:
  no recap**; the existing line stands.
- It gains **one fixed-list field: `tag`**, the key of the **most recent `big_day` tag**
  in the last 12 months, among `exam`, `match`, `show`, `trip`, `party`, `lesson`
  (section 4 table). No tag in the window, or only `work_thing`, `something_else` or a
  `weekend` tag: **no field, and the existing line is said unchanged.** No numbers, no
  count ("so many"), no dream or other pick (this is the content rule the review asked
  for: one tag, nothing else). The note keeps its existing `months` field (the friendship
  length, not a memory); the new field is the only memory in it.
- **It writes no `memory["said"]` key.** The celebration marks `noted["friends"]` on the
  bond, as today; that is not a memory trace (it exists with memory off, for the existing
  line). "Off leaves no trace" is therefore unchanged for door 11, and the test says so.
- **At 12 months `birthday_friends` cannot win** (M2 audit s2785 N6): the pet's first
  birthday is `{"years": 1}`, not a month count, so the `friends_for` note is not displaced.
  On the pet's first birthday the recap **waits a look** (the birthday note goes first); it
  is lost only if no second counted look comes that day (FM s2782 Q6). The card line is at
  most 40 characters.
- The card, given `n.tag` on a `friends_for` note at 12 months, says
  `MEMORY_TAG_DOORS.door11[tag]`; if the key is not there (an unknown tag from a newer
  server) it says the existing line. An **old cached card** ignores the field and says the
  existing line: no harm.

**The copy table.** APPROVED by the first mate 2026-11-03 ("told me of" changed to "told me about", every line still at most 40 characters); written by the plan's author. **The M2 ship worker writes no copy** and copies
this table as approved (or as the first mate edits it). Two tables go in the fresh block
of `src/card/lines-fresh.js` and in `COPY_TABLES` (`scripts/copy-scan.js`):
`MEMORY_TAG_CHIPS` (`asks: ["q"]`) and `MEMORY_TAG_DOORS` (no fill). Doors 1, 3, 10 and
11 are keyed by the tag; a door's note carries `kind` and `tag` (`{"kind": "door1",
"tag": "show"}`), and the card looks the line up. The same lines are the
`aria-label`/`textContent` of the chips; the chip row follows section 8.

| Table.key | Line | Chars |
|---|---|---|
| `MEMORY_TAG_CHIPS.q` (the chip prompt) | what kind of day is it? | 23 |
| `.labels.exam` | exam | 4 |
| `.labels.match` | match | 5 |
| `.labels.show` | show | 4 |
| `.labels.trip` | trip | 4 |
| `.labels.party` | party | 5 |
| `.labels.lesson` | lesson | 6 |
| `.labels.work_thing` | work thing | 10 |
| `.labels.something_else` | something else | 14 |
| `.none` (the "no tag" chip; the default) | no tag | 6 |
| `MEMORY_TAG_DOORS.door1.exam` | thinking of the exam you told me about | 38 |
| `.door1.match` | thinking of the match you told me about | 39 |
| `.door1.show` | thinking of the show you told me about | 38 |
| `.door1.trip` | thinking of the trip you told me about | 38 |
| `.door1.party` | thinking of the party you told me about | 39 |
| `.door1.lesson` | thinking of the lesson you told me about | 40 |
| `.door3.match` | a year ago you told me about a match ♥ | 38 |
| `.door3.show` | a year ago you told me about a show ♥ | 37 |
| `.door3.trip` | a year ago you told me about a trip ♥ | 37 |
| `.door3.party` | a year ago you told me about a party ♥ | 38 |
| `.door3.lesson` | a year ago you told me about a lesson ♥ | 39 |
| `.door10.match` | maybe a match tomorrow! go you ♥ | 32 |
| `.door10.show` | maybe a show tomorrow! break a leg ♥ | 36 |
| `.door10.lesson` | maybe a lesson tomorrow! have fun ♥ | 35 |
| `.door11.exam` | a whole year! you told me about an exam | 39 |
| `.door11.match` | a whole year! you told me about a match | 39 |
| `.door11.show` | a whole year! you told me about a show | 38 |
| `.door11.trip` | a whole year! you told me about a trip | 38 |
| `.door11.party` | a whole year! you told me about a party | 39 |
| `.door11.lesson` | a whole year! you told me about a lesson | 40 |

Notes on the wording, for the first mate:
- **Doors 1, 3 and 11 never say the day happened** ("you told me about", FM s2782 Q4): a big
  day picked ahead may not have taken place. Door 1 does not say "a week", since the line
  is said exactly 7 days after the tag's day and the person knows that. Door 3 has no
  `exam` line (it is not read by door 3) and none for `work thing` or `something else`;
  door 1 has no line for those two either; door 10 has `match`, `show` and `lesson` only.
- **Door 10 does not say the pet knows or watches** ("maybe a ... tomorrow"); it never
  names the weekday or a count.
- **A tag with no line in a door's table is a bug**, not a fallback: the server only sends
  the tags that table lists, and the card drops a note whose line is missing (an unknown
  tag from a newer server says nothing).
- The scout's lines are replaced because they failed the scan ("i still think about your
  show!" nags on "still"; "match tomorrow? i'll be cheering" asks outside `asks`; the
  recap was 56 characters and said "so many", a count).
- **Scan result** (`scripts/copy-scan.js` `scanFreshCopy`, the card's fresh block with both
  tables added and named in `COPY_TABLES`, run by the plan's author for s2783): **0 bad, 30
  new lines** (579 scanned against 549), longest 38 characters with the longest fill. The
  same run on the scout's three lines above reports the three failures named, so the
  scan was live. The M2 ship worker re-runs it on the real table; `types` in card-check
  runs it too.

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
  as the other day lines take turns (`world.js:252-296`, `lines-fresh.js`). **No line on two
  consecutive days** (M1 S1: that is all `turnPick` guarantees; with 3 or 4 lines a line can
  come back 2 days later, e.g. `a b c | b a c`, and `FAV_WEATHER_LINES` shipped with 4 per
  weather).
- The server stays as is: still one `fav_weather` note per day on a matching day
  (`coordinator.py:1898-1912`, guarded by `people.said`). The fix is only that the line
  varies.
- New lines go in `lines-fresh.js` and the `COPY_TABLES` entry in `scripts/copy-scan.js`,
  so the scan checks them (no nagging words, 40 characters with the longest fill, no `?`
  outside a question, no `!!!`, no digits). The scan's nag list includes **"still" and
  "again"**; M0-b's lines must avoid them, and so must M1b's table (section 12).
- M1b's door 6 lines are **not** in this list (M1 S1, FM Q-B): door 6 is a one-shot
  per favourite with its own short list, replacing that day's plain line (section 6), and a
  `turnPick` member would repeat on every matching day.

**Acceptance.** `tests/js/turn_pick.test.js` style test: for each of the four weathers,
over a month of days no line is the same on two consecutive days (across a cycle boundary
too; `turnPick` already guarantees this, so the test pins it for the shipped
`FAV_WEATHER_LINES`; it does **not** claim "different within 3 days", which `turnPick`
cannot give, M1 S1); the
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
  **`remember` enforces the caps itself on write** (M1 S7), not only the daily prune.
  **`People.memory_said(user, key)` / `mark_memory_said(user, key, day)`** (M1 S2) read
  and write `memory["said"]` with `.get`, **never `person()`** and never `person["noted"]`
  (`People.said` / `mark` write `noted`, which survives "off"). The visit's mark step
  (`coordinator.py:1724-1725`) calls them for door notes instead of `people.mark`, and the
  notes list drops door notes when `memory` is gone. **`People.forget`** keeps
  `birthday_skipped` and `memory_asked` (a person with both keeps both). `_PERSON_KEYS`
  and `QUESTION_KINDS` as section 5. Memory changes save with the usual delayed save, except **off, forget, per-item forget
  and the admin erase**, which save at once (`async_save_now`).
- **Locking and the race (review S6; M1 S7).** `remember` is a **sync** function, so "takes
  `people.lock(user)`" can only mean the **caller** holds it: `async_answer`'s non-LATER
  branches take no lock and the no-`await` rule below is their guard. **Do not add a lock
  there.** The code M1a copies does not all lock:
  `async_set_my_day` and `async_set_baby_talk` take no lock (`coordinator.py:2232,
  2215`) and `async_answer`'s dream, guess and favourite branches (`coordinator.py:
  ~2186-2200`) take none either; only the `LATER_CHECKED` branch does (`:2106`). The async
  new functions (`async_set_memory`, the erase) take `people.lock(user)` where they
  `await`, **and the real guard is the order**: `set_memory(off)`
  pops `person["memory"]` **before** its `await async_save_now()`, and `remember` checks
  that `memory` exists and writes with **no `await` between**, so an answer that lands
  during the save's `await` finds no memory and writes nothing. `remember` reads with
  `self.data["people"].get(user)` (as `_mine` does, `coordinator.py:2558`), **never
  `person()`**, whose `setdefault` (`people.py:256-257`) would re-create a forgotten record.
- `coordinator.py`: where an answer is stored today (`async_answer`: the dream pick, the
  guess, a favourite, the game pick, and the "great" below), add `remember(...)` **only
  when `memory_on`, the pet's option allows it **and `msg.get("shared") is False`** (R3,
  M1 B1; `websocket_answer` passes the flag down, `async_answer` gets a `private: bool`
  parameter, default `False`)**. `_mine` **and `_visit_prefs`** (M1 S7) get `memory_on`
  and `memory_allowed`, booleans only; the card's `reply` handler reads them from both.
  The door lines are `note` kinds in the existing notes list, with the `memory["said"]`
  guard (above, not `people.mark`). Acceptance: after "off" the stored person has no door
  key anywhere, `noted` included.
- `__init__.py`: WS `virtual_pet/memory` (switch) under the command rules of section 5;
  `async_ask_again` (shipped, M0-c) also pops `since_told[key]` (section 4).
  `diagnostics.py`: `REDACT_PEOPLE` gains `memory` (it guards nothing today, section 2).
- `const.py`, `config_flow.py`, `topics.py`, `strings.json`, `translations/en.json`: the
  option, with a description line saying what it does and that turning it off on every
  pet erases what people told their pets; the erase in `PetOptionsFlow._topic_step`
  (section 5), **and the same check in `async_remove_entry`** (FM Q-C), both reading the
  people store with `.get` (section 5).
- Card: the settings row and the forget-me reset (section 5).
- Docs: guide "Privacy: what the pets remember" gets the memory paragraph (what is kept,
  what is not, backups, the shared login and the localStorage flag, a family's children
  and baby talk, downgrade, **debug logging**: HA's `websocket_api` debug logging logs
  every message, so `memory_get` replies, tags and keys land in a debug log, as the
  fresh-expand table says for birthdays, `plan-2026-11-01-fresh-expand.md:485`; and that a
  disabled pet's option still counts), the settings table gets the switch and the option,
  `features.md` section 7 gets a row. **The `docs/HANDOFF.md:525` update belongs to the
  door-10 commit in M2** (section 6), not M1a (M1 N5). **The guide's existing "What the
  pets remember about you" paragraph changes too** (M1 S9): it says the dream pick is
  "kept for you alone, for every pet", but the pick is a per-pet field in the pet's save,
  not the people store, and `forget_me` reaches only loaded pets (`__init__.py:572-575`),
  so a disabled or unloaded pet's pick stays until its entry loads and the pick ages out
  (`R.DREAM_PICK_HOURS`). Carve it out: "the dream you picked for tonight is kept in each
  pet's own save, not the people store, and goes with 'forget my data' on every pet that
  is loaded". Add `memory_asked` to the "stays" list beside "forget my birthday" (a
  content-free boolean that survives). The guide also says the admin erase now also runs
  when a pet is removed (section 5). **M1a adds the docs test** the table in section 10
  relies on: no test greps the guide today. It greps **exact strings** so it can fail:
  "backups", "shared login", "downgrade", "debug logging", "children", "never typed",
  the dream-pick carve-out and `memory_asked`'s line.

**M1a shipped: notes for M1b** (s2747, 2026-11-02; branch
`crew/hatch-at-home-s2747-memory-m1a-record-switch-optio`).
- **Names as built** (`people.py`): `memory(user)`, `memory_on(user)`, `set_memory(user,
  on, today)`, `remember(user, kind, entry)` (`kind` is `"tags"` or a picks list),
  `forget_item(user, kind, day, tag_kind=None)` (async, saves at once), `forget_memory`,
  `forget_all_memory`, `memory_said` / `mark_memory_said`, and the module function
  `async_erase_unless_allowed(hass, leaving_entry_id)` used by the options flow and
  `async_remove_entry`. Tag keys are `work_thing` and `something_else` (underscores);
  `MEMORY_PICKS` maps each picks list to its field (`pick`, or `ask` for `great`).
- **Door notes**: `_notes` may yield `("memory", "<door key>", "<day>", note)`; the
  visit's mark step sends that scope to `mark_memory_said`, never `people.mark`
  (tested with a patched `_notes`). Door keys must match `door1`-`door12`, plus
  `door6_fav_weather` / `door6_fav_season`.
- **Picks are wired but dark**: `async_answer(..., private=)` remembers dream, guess and
  game picks only with `shared: false`, and no card sends that yet. M1b's
  `_keepAnswer` / `_sendFollow` change turns it on. `since_told` is not written yet
  (M1b); `async_ask_again` already pops it and `door6_<kind>`.
- **Already in M1a for the ask**: `"memory"` in `QUESTION_KINDS`; `memory_asked` and
  `memory_chosen_days` (at most 7 ISO days) in `_PERSON_KEYS`; `People.forget` keeps both
  with `birthday_skipped`.
- **Card**: the settings row "remember me" (first-mate copy, 2026-11-02) beside "my day",
  personal screens only and hidden unless `memory_allowed` or memory is on (audit
  finding 1: on a pet that disallows memory, an on row can only be turned off; the server
  always allows off); off is a two-tap confirm
  (`memory_off`). `memoryRow` (ui-copy) draws it, `_setMemory` (card-sheets) sends
  `virtual_pet/memory` with `shared: false`. Its two status lines sit in `SETTINGS_AGAIN`
  beside `forgotMe` (over the fresh block's 40 characters, and "forgotten"). The card
  reads `memory_on` and `memory_allowed` from the visit reply too, and the forget-me
  reset clears `memory_on`. The docs test's strings are `GUIDE_STRINGS` in
  `tests/test_memory.py`.
- **Remainder (erase race)**: the options-save erase runs just before
  `async_create_entry`. A "memory on" tapped during the erase's save `await`, before HA
  stores the new options, could leave one record on with no pet allowing it. Nothing
  can write to it (every write checks this pet's option), but only "forget my data" or
  another off-save clears it. Small window; not fixed in M1a.
- **Remainder (a future day)**: memory's days must be canonical ISO, but a day after
  today is kept. A clock set wrong at write time can leave one that sorts newest, so the
  cap evicts the real oldest first. Accepted (M1a audit finding 2; FM 2026-11-02): a
  load-time drop would erase real memory on a box that boots with a stale clock before
  NTP, and a clock-aware cap has the same flaw (a stale "today" would treat real days as
  future). Needs a clock wrong at write time; no honest write path produces it.
- **Remainder (two options saves at once)**: each flow's erase check reads the other pet
  entry's stored options before either has saved, so two admins (or two tabs) turning off
  two different pets' options at the same moment can each see the other "on", and neither
  erases. Known race, accepted (M1a audit finding 3): no pet allows memory, so nothing
  writes, and the next options save or "forget my data" clears it.

**M1b (tier 2): the ask and the doors.**
- The ask as section 5, with its three guards (not in `ONCE_KINDS`, the `shown` write,
  the 3-day stale-card bound) and the answer guards. **Held while `baby_talk` is on**
  (FM Q-D). The answer for the one-time ask is **not** added to
  `STASHED_QUESTIONS` (`prefs.js:378`): a failed send leaves nothing in localStorage.
- **"great" reaches the server only with memory on.** The card sends only "tough" today
  (`card-visit.js:439-441`, `ANSWERS["how_day"]` and `["big_how"]` are `("tough",)`) so a
  person who never opts in sends nothing new. M1b (FM Q-A: **kept**): the card also sends
  "great" **only when `mine.memory_on`** (`_visit_prefs` carries it too, so a card whose
  channel hasn't pushed yet reads the visit reply's flag), with `shared: false`; and the
  server accepts it only when memory is on, the pet's option allows it and `shared` is
  `False` (otherwise the fixed "not an answer" reply, and **no `set_mood`**), then
  `remember`s it under the same `asked_later` check as "tough".
- **"great" must not set the soft morning** (M1 B2). Today the LATER_CHECKED branch calls
  `set_mood` for **any** accepted `how_day` / `big_how` answer (`coordinator.py:2116-2117`),
  harmless while `ANSWERS` held only "tough". The branch becomes `if answer == "tough":
  set_mood(...)`; "great" only `remember`s. "great" **pops `later_kind`** like "tough" does
  (both are in `SLOT_CLOSED_BY_ANSWER`, `people.py:136`, `coordinator.py:2138`), so a
  second "great" send fails `asked_later` and cannot record twice. `ANSWERS["how_day"]` and
  `["big_how"]` become `("tough", "great")`; the `websocket_answer` check
  (`msg["answer"] not in ANSWERS[...]`) therefore passes "great" even with memory off, so
  the **handler** (`async_answer`) must refuse it then, with the same `ValueError` text.
  Acceptance (pytest): "great" with memory on leaves `_moods` empty and writes
  `picks.great`; "great" with memory off, with the pet's option off, or with `shared`
  absent gets the fixed refusal and no `set_mood`; "tough" is unchanged (sets the mood, no
  `picks`).
- The door lines in `lines-fresh.js` with `COPY_TABLES` entries (the copy scan, section 12).
- `since_told` is written where a favourite is answered, only while memory is on, the
  pet's option allows it and `shared` is `False`.
- Doors 2, 4, 5, 6 and 12 as section 6 "Door timing" (door 6 weather + season only, FM
  Q-B). **Card work:** `_keepAnswer`, `_sendFollow` and the "great" send pass
  `shared: false` (M1 B1).

**M2 (tier 2): the tag chips and doors 3, 1, 11, 10.** Read sections 4 (the tag table and
"Dates and keys"), 5 ("The `tag` field"), 6 ("Door timing", "6a") first; this section is the
build list. **M2 only wires `answer`, the card and the doors** (M2 N14): M1a already built
the tag plumbing (`MEMORY_TAGS`, `MEMORY_TAG_KINDS`, the tag validation in
`_memory_entry_ok`, `remember(user, "tags", ...)`, `forget_item(..., tag_kind)`, the cap,
`people.py`). M2 renames `test` to `exam` in `MEMORY_TAGS` and writes no copy.

*The card (the one ask, FM s2782 Q2).*
- **The chips sit inside the text-step box.** The text step is one `.askday asktext` box
  (`_askText`, `src/card/card-looks.js`): input, "ok", "skip". M2 adds the prompt and the
  chip row to **that same box** (prompt, chips, input, ok, skip), so a weekend is still
  two stages (yes -> the box) and a big day three (yes -> day options -> the box); there is
  **no fourth stage and no new timer** (each stage has its own `ASK_MS`, 60 s; the box keeps
  its one). The prompt is `MEMORY_TAG_CHIPS.q`; the chips are the eight labels and, first
  and selected by default, "no tag".
- **The tag lives on `step.tag`** (the object `_askTextStart` makes and `_askTextEnd`
  reads). A tap on a chip sets it (a second tap on the same chip, or "no tag", clears it).
  **Every end path sends the one `yes` with `step.tag` if set**: "ok", "skip", an empty
  input, the Enter key, the `ASK_MS` timer, a slide switch, the tab hiding. A path that ends
  with no chosen tag sends the `yes` with no `tag`, exactly as today. `_sendFollow` gains an
  optional `tag` argument and puts `tag` in the one `virtual_pet/answer` it sends, with
  `shared: false` (already there).
- **The row is built only when** `this._mineSwitch(s, "memory_on", this._memoryOn)` (what
  `card-status.js` reads, not `mine.memory_on` alone) **and**
  `this._mineSwitch(s, "memory_allowed", s.memoryAllowed)` **and** `!sharedScreen()`. With
  any of them false the box is exactly as today (input, ok, skip). A no-follow-support
  server or a shared screen takes the `_askTextStart` early path (one `yes` at once, no box,
  so no chips and no tag).
- **A tag that fails on the server costs nothing** (section 5, FM s2782 Q7): the `yes` and
  the typed words are kept; the card says nothing about the tag either way.
- All new strings are `textContent` (privacy table, "HTML").
- **The bench** (`dev/bench/README.md`, AGENTS.md "Screenshots"): the bench's `ask` option
  runs `_ask` only, so the text step cannot be pinned today. M2 adds a `textStep` option
  (`{kind, day}`, with `mine.memory_on` and `memory_allowed` from `mine`) that runs
  `_askTextStart` and shows the box with the chip row, a chip chosen, and a narrow
  (330 px) width; the README row is updated. The shots are the check for the row fitting;
  the real-phone tap is section 11, not a gate.

*The server (`answer`).*
- `websocket_answer` (`__init__.py`): `vol.Optional("tag"): object`, passed to `async_answer`
  as a parameter; **the validation is in `async_answer`** (section 5, M2 N15), not the
  schema. A value outside `MEMORY_TAGS`, or not a string, raises the fixed `ValueError`
  (nothing saved). A valid tag with `keep` false (memory off, this pet's option off,
  `shared` not `False`) is ignored: the `yes` goes through. A tag on a question other than
  `big_day` or `weekend` is refused (the same fixed error).
- In the `big_day` / `weekend` `yes` branches, after the open event, `remember(user, "tags",
  {"day": <the event's day>, "kind": question, "tag": tag})` when `keep` and a valid tag is
  there: `day` is the picked day for a big day, and the **Saturday** (`due` minus 2 days,
  section 4) for a weekend. The cap and the replace-on-key rule are `remember`'s.
- The guide (`docs/guide.md`, "Privacy: what the pets remember"): a line about tags (the
  eight kinds, `exam` among them, kept with the day, never typed words, shown on the page
  later and used by a few remarks, forgotten with the rest) and door 10 (weekday patterns
  for three kinds, one remark a month at most); a `GUIDE_STRINGS` entry for each in
  `tests/test_memory.py` (M2 S9). `docs/features.md` section 7's memory row gets the tag
  chips and doors 1, 3, 10, 11.

*The doors.* As section 6, in this order of commits: the tag chips and the write; doors 3,
1 and 11 (with the draft copy of 6a); **door 10 last, as its own commit**, with the
`docs/HANDOFF.md` routines clause (section 6, "The not chosen list"; reword only that
clause). `memory_door(mem, today, hour)` returns the first due door in the order 2, 3, 1,
10, 4, 5, 12 (section 6); door 3's and door 1's notes are `{"kind": "door3", "tag": ...}`;
door 11 is the `tag` field on the `friends_for` note (6a). `_MEMORY_SAID` needs no change.
The visit marks `door1`, `door3` and `door10` through `mark_memory_said`, never
`people.mark`, as the M1a notes say; door 11 marks nothing in memory (6a).

*Acceptance (M2 S9; the tests the review should be able to run).*
- **Pytest, tags** (`tests/test_memory.py`): `yes` with a valid `tag` leaves one tag
  (`(day, kind)` as keyed, with the Saturday for a weekend); `yes` with no tag leaves none;
  a repeat `yes` the same day with a different tag replaces the tag (and, as today, resets
  the event); an invalid tag (a string outside the list, an `object`, a number, a list) is
  refused with the one generic error and **nothing saved, the event included**; a valid tag
  with memory off, with this pet's option off, and with `shared` absent or `true`: the `yes`
  and the event are kept and **no tag and no error**; the typed words are in none of the
  stored data (the "Typed words" row); a tag on a `how_day` answer is refused; forgetting
  that one entry leaves no twin; a tag is not written without `asked_later`; `caplog` on the
  integration and `websocket_api` shows no tag value after a bad `tag` (section 10,
  "Logs"); the weekend tag's day is the Saturday; 130 tags in a day leave 120.
- **Pytest, doors** (the freezer): door 3 fires a year after (a `trip`), not for `exam`,
  `work_thing`, `something_else` or a `weekend` tag, not the day before or after, once per
  day, and **Feb 29** (a tag on Feb 29, 2028 fires on Feb 28, 2029 and never on a Feb 29);
  door 1 fires on tag day plus 7 and not on plus 6 or 8, not for `work_thing` or
  `something_else`, and is **lost** (no `said` write) when the look is before 11:00 or from
  20:00; door 10: 3 of the last 5 `match` on one weekday, said on the eve in the window,
  not twice in 28 days across `match` and `show` patterns, and the two forget cases of
  section 6 (4-of-5 survives one forget; forgetting a non-matching entry can start a
  pattern); **door order**: with doors 2, 3, 1 and 4 all due, one goes per visit, in the
  order 2, 3, 1, 10, 4, 5, 12, and the others are **not** marked said; with memory off, the
  pet's option off, or no record, no door note and no `said`; door 11: a 12-month
  `friends_for` carries `tag` when a `big_day` tag of the six exists in the window, carries
  nothing for `work_thing`, a `weekend` tag or none, waits a look when the pet's first
  birthday is that day (lost only with no second counted look), is not sent at 24 months, and writes no `memory["said"]` key. The `tags` cap
  interplay: a door reads the capped list.
- **Pytest, shape** (section 10, "`_mine`..." row): the door-notes test asserts
  `set(note) <= {"kind", "pick", "tag"}` (the existing assertion in `tests/test_memory.py`
  becomes this, FM s2782 Q1); a `friends_for` note's only added key is `tag`.
- **JS tests** (`tests/js`): the chip row exists only with `_memoryOn` and
  `memoryAllowed` and not `sharedScreen()`; a tap sets `step.tag`; **the single send carries
  `tag` and `shared: false`**, and every end path of the text step (ok, skip, empty,
  Enter, timer, slide switch, tab hide) sends **once** with the tag so far (or none);
  with memory off the box has no row and the send has no `tag` key; the card says
  `door11[tag]` for a 12-month `friends_for` with a tag and the existing line otherwise;
  `fresh_copy.test.js` (the scan) passes with the two new tables named in `COPY_TABLES`.
- **Card-check:** a new section `memorytags` (named in `SECTIONS`; it needs the same dev
  bond `restart` seeds, so list it in `NEEDS`): the chip row shows with memory on, sends
  once with the tag, and is absent without memory; **`sharedscreen` also gains "no chips on
  a shared screen"** (it opens the same flow with the shared flag set); a tag label with
  markup renders as text; `types` runs the copy scan. Run it through `scripts/gate --auto`
  (the picker names the sections), `scripts/ci-gate` if it picks `all`.
- **Copy scan:** the real table passes `scripts/copy-scan.js`; the M2 worker adds no
  line that is not in 6a.

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
| `_mine`, `_visit_prefs` and the channel | Only `memory_on` and `memory_allowed` booleans (R3; M1 S7) | Pytest: `_mine(user)`, `_visit_prefs(user)`, the `visit` reply and a channel snapshot hold no dates and no lists (**door notes hold at most one fixed-list pick or one fixed-list tag, nothing dated**, FM M1b Q1 and FM s2782 Q1: a door 4, 5 or 12 note is `kind` and `pick`, a door 1, 3 or 10 note is `kind` and `tag`, door 2's only `kind`), and exactly those two booleans about memory; `memory_get` is the only carrier. A door-6 note adds only the boolean `told` to its favourite's note; **a 12-month `friends_for` note adds only `tag`** (door 11; its `months` is the friendship length, not a memory). The door-notes test in `tests/test_memory.py` asserts `set(note) <= {"kind", "pick", "tag"}` |
| Bus, logbook, recorder | WS commands, not services | Pytest: a `MATCH_ALL` listener across `memory`, `memory_get`, `memory_forget`, `ask_again`, and the answer with a tag sees no event holding memory or the choice |
| Logs | No integration log with memory or answers; no schema failure echoing a value (all free-value fields typed `object`, section 5) | Pytest with `caplog` on the integration **and** `homeassistant.components.websocket_api`: a bad tag (a string outside the list, an `object`, a number), a bad `list`, a bad `key` **with a valid day and tag of a real entry**, a wrong type leave no record containing the value; and the handler's own error carries no value. This row can pass only with `object`-typed fields (review B1): with `vol.In` HA logs `humanize_error`'s message |
| Shared screens | The card never asks, shows, fetches or adds; the server refuses unless `shared` is `false` (fail closed, R3; a card-honesty guard, not authentication). **Every `remember` path** is covered (M1 B1) | Pytest: each memory command with `shared: true` **and with `shared` absent** is refused and saves nothing. **And an `answer` for dream / guess / game / fav / great / a favourite's `since_told` / a big day or weekend `yes` with a `tag`, with `shared` true or absent, leaves `person["memory"]` unchanged, while the ordinary answer still works** (the pick or like is stored; the `yes` opens its event and keeps the typed words; **no tag, no error**, FM s2782 Q7); the `memory` ask's answer with `shared` not `False` is refused with the generic error, and so is a `tag` outside the fixed list, whatever `shared` is. Card-check `sharedscreen`: no memory WS call, no row, no link, no page. JS test: `_keepAnswer`, `_sendFollow` and the "great" send pass `shared: false`. Doors and the ask come from `visit`, which cannot see `shared`: see "Doors" |
| WS shape | The memory commands copy `websocket_ask_again` (M1 N2) | Pytest: each command with `shared` absent is refused **before** the pet lookup (a bad `entity_id` with `shared` true gets `shared`, not `no_pet`); the only error codes are `shared`, `no_pet`, `not_asked`, one generic text each; `forget_me` still takes no `shared` |
| Other people | Only `connection.user.id` | Pytest: B's `memory_get` and `memory_forget` never see or touch A's entries; B turning memory on leaves A's record alone |
| WS fetch on demand | The page is fetched on open, held in no cache | Card-check: after closing the page, no memory text in the DOM; no `hatch-memory-*` localStorage key ever; `STASHED_QUESTIONS` doesn't include the memory ask |
| Erase: off | Pops `person["memory"]`, saved at once | Pytest: turn off, then read the store file (`hass_storage`) with no delay: no `memory` key, no entry. (That HA's `Store` flushes on stop is HA's, not tested here; `async_save_now` writing before the command returns is.) |
| Erase: forget me | `People.forget` takes memory with the record; `memory_asked` survives like `birthday_skipped` | Pytest: forget, then the store has no memory, no tags, no picks; `memory_asked` stays, so the ask isn't repeated; yes then off, and yes then forget-me, never ask again (review S2) |
| The ask | Counts only on the card's `shown` (M1 S3); asked once; held for baby talk (FM Q-D); `memory` not in `ONCE_KINDS` | Pytest: `_question` for `memory` writes no `likes_asked` and no `once_last` until `shown`; `shown` writes both only under `asked_later(..., "memory")` (a stray `shown` counts for nothing); a card that never sends `shown` is offered the ask on 3 days and gets `how_day` on day 4, and the ask returns after the weeks gap; "not now" and "yes" both set `memory_asked`; "yes" or "not_now" with no ask today, "yes" with the pet's option off, and either with `shared` not `False` are refused; `once_due` skips it after; with `baby_talk` on it is not asked; a saved `later_kind: "memory"` survives a reload; `forget` keeps `memory_asked` **and** `birthday_skipped` together |
| Great answer | "great" records, never a soft morning (M1 B2, FM Q-A) | Pytest: "great" with memory on leaves `_moods` empty and writes `picks.great`; with memory off, the pet's option off or `shared` absent it gets the fixed refusal and no `set_mood`; a second "great" send is refused (`later_kind` popped); "tough" still sets the mood |
| Off leaves no trace | Door guards live in `memory["said"]` only (M1 S2) | Pytest: fire a door note, turn memory off: the stored person has no door key anywhere (`noted` included); the visit's mark step for a door note never calls `people.mark`; `memory_said` on a forgotten person does not re-create the record |
| Erase: per item | One entry gone, saved at once; door 10 is re-derived from what remains (M2 S11) | Pytest: forget one tag; store and `memory_get` both lack it; a door 10 pattern of exactly 3 stops after one is forgotten; **a pattern of 4 (or 5) of the last 5 survives one forget**; forgetting an entry that is not on the weekday moves the last-5 window so an older matching entry **can start a pattern**, and the test says so |
| Erase: admin option off | Off on every pet erases every person's memory; the triggers are the options flow's save **and removing an entry** (FM Q-C), comparing **stored options** across the other entries (section 5; review B2; M1 S8) | Pytest through the options flow **and `async_remove_entry`**: removal: A on and B off, remove A erases and saves; A on and B on, remove A erases nothing; the only pet removed erases; a disabled third entry with memory on blocks it; with no `people` in `hass.data` the flow saves the option and the removal finishes, no `KeyError`. Options flow: an unrelated option saved on the only pet erases **nothing** (the reload that follows leaves memory alone, and so does unloading or setting up an entry with zero or one pet loaded); memory off on the only pet erases once, saved at once; two pets: off on one erases nothing, then off on the second erases; a disabled third entry with memory on blocks the erase; the daily prune never erases |
| Retention | Count caps only (Q4 = C), **enforced on write** (M1 S7); invalid entries dropped on load | Pytest: 130 tags saved **in one day, before any prune** -> 120 kept, oldest gone; a hand-edited store with an unknown tag, a bad date, a text-like value drops those entries and keeps the rest; a 13-month-old tag is **kept** (no time prune) |
| What may be stored | Fixed lists and dates only (R5) | Pytest: every key and value in `person["memory"]` after a full flow matches the fixed-list schema; no typed text is anywhere in the store after a big day with words |
| Typed words | Memory only, as today | Pytest: after a big day with text and memory on, the saved store, the pet state and `memory_get` hold none of the text |
| Backups | The store is in backups; the guide says so (R11); typed words never are | Guide text exists (the docs test M1a adds greps for the exact strings in section 8); pytest: the saved JSON is the full extent of memory, no second file |
| Diagnostics | `memory` is in `REDACT_PEOPLE` (R4), though no dump uses the set today (section 2). Nothing puts memory in a pet's save | Pytest (M1 B3, corrected): (a) memory filled, then the diagnostics dump JSON holds no tag, pick or date of one. This passes because the people store is **not dumped** and nothing writes memory into `_saved`; say so in the test's comment, and it is the real guard. (b) After `forget_me`, **on the store** (`hass_storage` / `pet.to_dict()`, **never the dump**), `dream_picks` has no entry for the user and `dream` has no `user` key. **No test claims "no user id" for the store or the dump**: the dump passes it vacuously (`REDACT_STATE` already holds `bonds`, `user`, `by`, `for`, `player`, `diagnostics.py:84-93`), and the store keeps bond and `care_log[].by` ids by decision. A test of `REDACT_PEOPLE` alone would pass vacuously |
| No new consumer | The people store has no reader outside coordinator, people and `__init__` | Pytest, structural: a source grep that fails when `People` or `data["people"]` appears in `sensor.py`, `intent.py`, `llm.py`, `diagnostics.py` or `notify.py` (true today, read by the review). The "grep after fill" rows above catch a leak; this catches a later change adding a consumer |
| Assist and LLM | Never (R9) | Pytest: the spoken status and the LLM tool JSON with memory filled hold no tag, no pick, no "remember" line |
| Notifications | Never | Pytest: `notify.message()` and send-offs hold no memory |
| Child users | Only the person turns it on; tags and picks only; admin option can hide it (R10) | Pytest: user A's `memory` command never changes user B's record; the option off removes `memory_allowed`; the guide paragraph for households with children exists |
| Migration up | Additive; `STORE_VERSION` 1; old stores load | Pytest: a pre-memory store loads with no `memory` key and every behaviour as before; the switch off is the default |
| Migration down | An older version keeps the key unread (R8) | **A read-the-code note, not a test**: today's `_person` validator is the only one a test can run, and the claim rests on `out = dict(record)` keeping unknown keys (`people.py:539-541`). The guide says what a downgrade leaves (review S12) |
| Damaged store | Memory goes with the record to the `.damaged` copy (R12) | Existing `test_damaged.py` style test with memory present; the guide's erase line names memory |
| Concurrency | An answer that lands during an off-switch's save can't re-add memory | Pytest: patch `async_save_now` to wait on an event, call `set_memory(off)`, send an answer while it waits, release: no memory in the store and in `memory_get`. Holding the lock is not the test; an `await` held open is (review S6). `remember` on a forgotten person does not re-create the record |
| Dream pick (M0-d) | forget_me leaves no dream pick and no dream asker in the pet's save | See M0-d acceptance and "Diagnostics" (the store, never the dump). The guide's carve-out (section 8, M1 S9) says it is per pet and reaches loaded pets only |
| HTML | `textContent` only | Card-check: a tag label, a pick value and an item key with markup render as text |
| Doors | One door per visit, **in the order 2, 3, 1, 10, 4, 5, 12** (section 6, an exception to door-number order); no door note and no `memory["said"]` write with memory off, the pet's option off or no memory record (M1 S6) | Pytest on `async_visit`: with memory off, with the pet's option off, and with the record missing, no door note and no `said` write; with two doors due, one goes, the first in that order, and the other is not marked said (2 before 3, 3 before 1, 1 before 4; a due door 1 does not take door 2's single look); door 1, 2, 3 and 10 are **lost, not marked said**, when no look falls in their window; door 5 does not fire on consecutive days (7-day spacing); door 6 fires once per favourite and `ask_again` re-arms it |
| Tags (M2) | The tag rides on the one `yes`; a valid tag that cannot be stored is dropped silently; a tag outside the list is refused (FM s2782 Q7); only the fixed list and the day are kept | Pytest: section 8 "Acceptance, tags" (valid, absent, invalid, memory off, option off, `shared` absent or true, wrong question, the Saturday, the cap). JS: the chip row only with `_memoryOn` and `memoryAllowed` and not `sharedScreen()`; one send carries `tag` and `shared: false`; every end path sends once. Card-check `memorytags` and `sharedscreen` (no chips). No typed word is in the stored data |
| Door screen guard | The shared-screen guard for doors is the card's (R3; M1 S6) | JS test (`tests/js`): the card does not call `virtual_pet.visit` when `sharedScreen()` (existing behaviour, `card-visit.js:216`). The server cannot test this: `visit` has no `shared`. The guide says so |
| Door order | (Concurrency and this row assert more than they test; neither counts as evidence alone) | Covered by "Doors" and "Door screen guard" above; the earlier "absent in the shared snapshot" wording is dropped (door lines come from the `visit` reply, not a snapshot) |
| Stale card | An old card burns no ask and sends no `great`/memory write | See "The ask" (3-day bound) and "Shared screens" (absent `shared` writes no memory); the `great` send only when `mine.memory_on` is a card-side test, and the server refuses it with memory off |

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
- **M2's doors are tied to a day and are lost with no look** (doors 1, 3, 10, and door 2
  before them; FM s2782 Q5): a day with no look from 11:00 to 20:00 (door 2: before noon)
  spends the door for good, accepted. **Door 11 waits a look on the pet's first birthday**
  (it cannot lose to `birthday_friends` at 12 months; it is lost only with no second counted
  look that day), and there is no recap at 24 months (FM s2782 Q6). Neither is a bug.
- **Good news has no callback besides door 2.** "great" to slept, or a weekend "yes"
  without words, still end at the reply. Out of scope here.
- **`slept: not really`** has no follow-up. Out of scope.
- **Weekend, game and trick lapse quietly** (scout 1.3 item 6, "no guilt" rule). Door 12
  no longer touches the "picked and never played" case (FM Q-B dropped "lapsed": no
  "played" signal exists); it only echoes a repeated pick. A new signal would be its own
  plan.
- **Door 6 has no visitor favourite** in M1b (FM Q-B), and none for a favourite told before
  memory was on (nothing is back-filled).
- **`back_from` and the guess outcome lines** are fixed lines and repeat. Out of scope;
  the same turn-rotation pass would fix them.
- **A downgrade** leaves memory on disk unread (R8); the guide says so.
- **M1b audit (s2765): player-impact 1, nits 5.** Fixed: the settings row, on or off,
  counts as answering the ask (`memory_asked`); "yes", "not now" and the row pop
  `memory_chosen_days`; the dead door-9 data is gone (above). Accepted as known limits:
  - **Door 6 is spent for good** when the card can't show it (an old cached card ignores
    `told`; `_visit` drops a reply after a slide change), until `ask_again` re-arms it.
  - **A mixed-option household** (one pet's option off) can starve the ask: the pet with
    the option off may take the one later slot first on a shared dashboard.
  - **A card that never sends "shown"** loses the later slot 3 days in every 14, for good
    (the sliding window; a card that does send it is capped by `likes_asked`).
- **Stale cards burn a door.** Door notes are marked said when the visit makes them; an
  old cached card drops a note kind it doesn't know, so that look's door is lost (door 2,
  once per great day, is gone for that day; doors 4, 5 and 12 wait a week). Accepted, as
  for the ask (R3); no code.
- **The admin erase's reach.** It runs from an options save and from removing an entry
  (section 5; FM Q-C), on stored options. A pet entry *disabled* does not erase, and a
  disabled entry's stored option counts. A pet added later defaults to on, so memory is
  allowed again with an empty record.
- **`shared` is a claim, not a proof** (R3): a wall tablet whose localStorage flag was
  cleared reads as personal. The guide says so; no server fix exists.
- **Pet removal** (FM Q-C): removing an entry erases memory when every **other** entry has
  it off, the only pet included (section 5). Removing a pet while another still allows
  memory leaves it, as the rest of the people store stays (guide "Privacy"). The guide says
  this next to the existing line about what stays.

## 13. Open questions

The two earlier questions are **decided** (first mate, 2026-11-02; section 1): the admin
option off on every pet erases all memory, and door 10 has no separate switch. A ship
worker must not treat them as open. What is left came out of the privacy review (s2719),
each with the default this plan already uses; none blocks M0 or M1a.

**1. Child accounts (review S7). DECIDED (FM Q-D, 2026-11-02):** hold the memory ask while
the person's `baby_talk` is on, as R10 and section 5 say. It delays Q3's "asks once at bond
4" for those people and changes nothing else; the settings row still works, and the
page's confirm tap is the guard for the rest. M1b's acceptance depends on it. Kept here
only so the numbering of 2 and 3 holds.

**2. The `appointment` tag (review S5).** **Default: dropped from the list** (section 4):
no door reads it and it would put a health-adjacent dated list in every backup. Keep it
only if the owner wants the chip for the page's sake. (`test` became `exam` for the same
reason, FM s2782 Q8.)

**3. Door 9, pets compare notes (review S10).** No owner answer names it and HANDOFF.md:525
lists "pets noticing each other" as not chosen. **Decided (FM Q4, 2026-11-02): no.** Not
built.

## 14. Adversarial review checklist

For the reviewer of each build ship. Try to break each; every item should have a test.

1. **Where can a memory value escape?** Search for every consumer of `person` in
   `coordinator.py`, `sensor.py`, `diagnostics.py`, `notify.py`, `intent.py`, `llm.py`,
   `debug`, `_house_view`, `_mine`, the channel snapshot, and the logs. Fill memory to the
   caps and grep every output for a tag, a pick and a date.
2. **Shared screens.** Open the card as a shared screen after memory is on. Is there a
   row, a link, a line from a door, a fetch, or a place where `shared` is ignored (a
   second WS call that forgot the flag)? What about a screen whose "shared" status
   changes while open? Does every `answer` path that calls `remember` (picks, "great",
   `since_told`, a tag) check `shared is False` on the server, and does an absent `shared`
   leave memory unchanged but the ordinary answer working (M1 B1)?
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
   door 10 stay inside its limits (three tags, 3 of 5, eve only, once per 28 days across
   all patterns)? Does a `work thing` or `something else` tag ever reach a door, a sticker,
   a count or the recap (the section 4 table says: the page only; the answer wanted is no)?
   Does a door 1, 3 or 11 line say the day happened, or is it "you told me"? Does `exam`
   reach door 3? Does a door repeat on consecutive days, or sooner than its spacing (section 6 "Door timing"; door
   6 is one-shot per favourite)? Do two doors ever fire on one visit? Does a door guard
   write `person["noted"]`? Do the new tables pass `scripts/copy-scan.js` or have an
   explicit, reviewed exception? Do the doors fire in the order 2, 3, 1, 10, 4, 5, 12
   (section 6)?
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
15. **Admin option** (also removal, FM Q-C). One option per pet entry: after two pets with different settings,
    what is `memory_allowed` for each, and what does "any pet allows" do on the daily
   prune and on an options change? The erase is decided to fire only from the options
    flow's save, from stored options (section 5): can an unrelated option save, a reload,
    an unload with zero pets loaded or a disabled entry ever erase? Does removing an entry
    erase exactly when every other entry has memory off, and does a missing people store
    break the flow or the removal? Can the erase fire twice or miss a person?
16. **The supersession.** The 2026-10-28 decline of journal memories is superseded for
    the private page only. Does nothing from memory appear in the public journal, the
    photos, the every-world page, or the finds page?
17. **The card.** Is every new string `textContent`? Is the memory ask absent from
    `STASHED_QUESTIONS`? Does the page leave the DOM when closed? Does the card build
    still pass `scripts/card-check` `sharedscreen` and `types`?
18. **`shared` fails closed.** Send every memory command with `shared` absent and with
    `true`: refused, nothing saved? (R3)
19. **Dedupe and keys.** The card sends **one** `yes` per ask and the tag rides on it
    (section 4; the earlier "answered twice" was false). Does every end path of the text
    step (ok, skip, empty, timer, slide switch, tab hide) send exactly once, with the tag so
    far? Does a repeated `yes` the same day replace the tag and not double it? Does a
    per-item forget remove exactly one entry with no twin? Which date does a weekend tag
    carry (the Saturday), and which doors read it (none, section 4)?
20. **An old card.** Does an old cached card burn the memory ask, starve the later slot
    for more than 3 days, or write memory with no `shared`? Does "great" ever set the soft
    morning (M1 B2)?
21. **The pet's own option, server side.** Pets A (off) and B (on), memory on: does
    `memory_get` or `memory_forget` through A work? Does a `tag` through A keep the `yes`
    and write no tag, with no error (FM s2782 Q7)?
22. **A tag the server cannot store.** Turn memory off on another device while the chip row
    is open, then tap "ok": is the big day kept, the typed words held, no tag stored and no
    error shown? Does a tag outside the list get one generic error and nothing saved, and
    leave no value in any log?
