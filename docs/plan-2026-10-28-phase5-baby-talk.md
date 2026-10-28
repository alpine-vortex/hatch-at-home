# Phase 5: baby talk (build plan, DRAFT 2)

**Status (2026-10-28): built as 0.34.0b2** on crew branch
`crew/hatch-at-home-s2416-phase-5-of-the-voices-plan-bab` (the switch and card lines,
then `reason_key` in its own commit); the tier-2 audit of the built work is next.

Phase 5 of `plan-2026-10-28-voices-and-lines.md`: A8, plus the second audit's row 9
(kept by the owner as the last feature phase; the cache is keyed by user ID) and
A9.3 (no baby talk switch on a shared screen) and row 4 (the catchphrase is never
in baby talk). **Its own PR, built on `main` after phase 4 (0.34.0b1) has merged;
the version is decided at build time** (see Release). Docs only so far: nothing
here is built. **Draft 2:** folds in the audit of draft 1 and the owner's answers
of 2026-10-28; the table at the end ("The audit of draft 1") wins where it differs
from the sections above.

All baby, child and holiday lines are **a proposal for the owner**, not approved
copy. Every line lives in the table in "The line sets" and in the holiday table
at the end; none appears anywhere else.

## What the person gets

A switch on the status screen, "baby talk", off by default, theirs (it follows
them to every pet and every device they're signed in on; a change made on one
device reaches the others at their next visit, up to an hour later, so turning it
off on a phone can leave a tablet in baby talk for that long; the guide says so). On: while a pet is a
baby (about its first day) or a child (about its next four), its common lines are
simpler (see the table; examples: "hungy!", "hi hi, Sam!", "yay yay!"). Babies get the most
changes, children a few. Off: everyone hears the normal lines, as today. Teens and
adults never change. What a line *means* never changes: a need still names the
need (hungry, sleepy, play, stinky, medicine), so nobody has to decode it.

## How long it shows (the code differs from the parent plan)

`rates.STAGE_STARTS`: baby from 0.5 h of age, child from 24 h, teen from 120 h.
So babies talk for about 23.5 hours and children for 4 days: **about 4.5 days per
pet**, not "the first week" (the parent plan's audit row 9 already says 4.5).
Age pauses while the pet is away (the card reads `sensor.life_stage` state), so
wall-clock time can be longer. The guide and the switch's label say "while it's a
baby or child", never "a week".

## Where it lives: the card

Every line in A8's scope is already built in the card, from a kind and parameters
(`NOTES`, `_moment`, `_greet`, `_idle`, `WISHES`, `REFUSALS`). The server sends
kinds, not sentences, so baby talk is **card-side**: the server stores one boolean
and returns it. Nothing about it reaches a sensor, an event, a notification,
Assist, the LLM prompt or diagnostics.

### The viewer decides, per browser

The card runs in each person's browser, so "two people look at one pet" is two
cards, each choosing its own lines from its own switch: Sam (on) reads "hungy!"
while Alex (off) reads "tummy rumbling!" on another screen, at the same moment.
No server state mixes them. Cases:

- **One device, two people** (a wall tablet): that is a **shared screen**. The
  baby talk switch is not shown, and `babyTalk()` is false whatever the cache says
  (it checks `sharedScreen()` first, as `_bond` does): normal lines, so nobody
  gets a version meant for someone else. Same row as A9.3, so no new rule.
- **A signed-in tablet that isn't marked shared** follows its signed-in person, as
  it already does for names and bonds.
- **Two pets on a dashboard:** per pet, by that pet's stage; a baby and an adult
  side by side talk differently, as they should.

### One helper

`_lines(s, key, normal)` beside `pick`: returns the normal line, or if
`babyTalk()` and the pet's stage (`sensor.life_stage` state; `s.drawn` is the
*drawn* stage and falls back, so it isn't used) is `baby` or `child`, a pick from
`BABY[key][stage]`. A missing entry returns the normal line, so an unlisted line
is never broken. **The call site forces `catch: false`** whenever `_lines`
returned a baby or child line (the catchphrase section below). Names and nicknames are inserted after the choice
(`withName`, as now): baby lines never rewrite a name ("Sam", never "Sammy" or
"Sam-sam"). The lines that carry a title, headline, number, food or
place (`watching`, `listening`, `news`, `weather`, `forecast`, `steps`...) take no
baby version: they are about the world, and a baby cutting them short would lose
the information.

## The line sets

"Same" means no change. Lines the audit (A9) already rewrote are the starting
point. Lines not listed stay normal (`_lines` already does that). The next-visit
note `NOTES.tucked_in` ("thanks for tucking me in last night ♥") is a different
line from the `tucked_in` moment and stays normal.

### Gets a baby (and child) version

| Set | Where | Normal (today) | Baby (proposal) | Child (proposal) |
| --- | --- | --- | --- | --- |
| **Call lines** (the only lines that may ask) | | | | |
| Call: hungry | `call_hunger` | tummy rumbling! | hungy! | tummy rumbly! |
| Call: sick (**the exception**, see below) | `call_sick` | feeling sick, medicine please? | owie... medicine? | feeling icky, medicine? |
| Call: dirty | `call_dirty` | it's getting stinky in here | stinky! clean? | it's getting stinky! |
| Call: tired | `call_energy` | so tired... sleep time? | sleepy... bedtime? | so sleepy... bedtime? |
| Call: play | `call_happiness`, `call_fake` | play with me? | play play? | same |
| **Ambient mood lines** (statements, never asks) | | | | |
| Mood: sleepy | `sleepy_drowsy`, `sleepy_low` | getting late, eyes drooping / running low on energy | sleepy... | same as normal |
| Mood: hungry | `hungry` | a little peckish | a little hungy | a little hungry |
| Mood: dirty | `dirty` | a bit messy in here... | messy... | same |
| Mood: bored | `bored` | nothing to do | la la la | same |
| Mood: excited | `excited` | that was fun! | yay yay! | that was fun! yay! |
| Mood: cozy | `cozy` | nice and cozy | cozy cozy | same |
| Mood: content | `content` | all good | happy! | all good! |
| **Card lines** | | | | |
| Greeting, named | `_greet` | hi, Sam! / Sam!! hi! | hi hi, Sam! / Sam!! hi hi! | hi, Sam! / Sam!! hi! |
| Greeting, bond 2+ | `_greet` | Sam! I missed you ♥ / yay, Sam's here! | Sam!! ♥ / yay yay, Sam! | same |
| Greeting, nickname | `_greet` | hi, X! / X!! ♥ / there's my X! | hi hi, X! / X!! ♥ / my X!! yay yay | same |
| Idle, sleepy | `_idle` | *yawn* / mm... sleepy | *yawn* / sleepy... / nap time... | same |
| Idle, bored | `_idle` | hmm... / anyone wanna play? | hmm... / la la la | same |
| Idle, excited | `_idle` | hehe! / wheee | hehe! / yay yay! | same |
| Idle, hungry | `_idle` | *tummy rumbles* / is it snack time? | *tummy rumbles* / snack time... | same |
| Idle, default | `_idle` | ♪ hm hm hm ♪ / la la la | ♪ la la ♪ / *looks around* | same |
| Snack eaten | `_react` | yum, hazelnuts! | yum yum, hazelnuts! | same |
| Favourite snack | `favourite_snack` | hazelnuts, my favourite!! | hazelnuts! yay yay! | same |
| Wish granted | `wish_granted` | yay, my wish! ♥ | yay yay! ♥ | same |
| Friend home | `friend_home` | you're home!! ♥ / yay, you're back! ♥ | you're home! yay yay ♥ | same |
| Missed care | `care_miss` | ...oh, there you are ♥ | oh! hi hi ♥ | same |
| Tucked in (the moment) | `tucked_in` moment | thank you for tucking me in ♥ | night night ♥ (with a name: night night, Sam ♥) | same |
| Bond up | `bond_up`, generic pick only | you're the best ♥ / we're getting close! ♥ | yay, you! ♥ | same |
| Wish (first look) | `WISHES` | I wish we could play a game today! | wish... play today | same |
| Wish | `WISHES.snack` | I'd love a snack after lunch! | wish... snack after lunch | same |
| Wish | `WISHES.bath` | I wish I could have a bubble bath! | wish... bubble bath! | same |
| Wish | `WISHES.tuck_in` | will you tuck me in tonight? | wish... tuck me in tonight | same |
| Refusals | `REFUSALS.full` | I'm full! | tummy full! | same |
| Refusals | `REFUSALS.too_tired` | too tired to play | too sleepy to play | same |

`withName` appends `, Name` before the trailing marks, so every baby line that
takes a name is written to survive it: `night night ♥` becomes `night night, Sam ♥`.

**The explicit exception.** Decision-carrying lines stay normal (below), with one
exception the owner chose on 2026-10-28: the sick call. It reads "owie...
medicine?" for a baby and "feeling icky, medicine?" for a child. It still names
the need (medicine), so it carries its decision in plain words either way. No
other decision-carrying line gets a baby version.

**Asks only on call lines.** The ambient mood line is redrawn every tick for as
long as the mood lasts, so it is a statement ("la la la", "messy..."), never a
request. The wishes are statements too ("wish... snack after lunch"). A `?` appears
only in the `call_*` keys.

Child changes are deliberately few: the call lines, the excited and content mood
lines, the named greeting. "A little", as the owner said.

### Stays normal for everyone

- **Server texts that aren't line sets:** the phone notifications (`notify.py`),
  Assist replies (`intent.py`), the LLM prompt (`llm.py`), the journal, the
  status screen's labels (including `WISHES` short text and the upbringing).
- **Information from the world:** news, TV and music titles, weather and forecast
  lines, steps and trips (`NOTES.steps`, `back_from`...), dreams that carry a title.
- **Questions and their answers** (`QUESTIONS`): they have buttons and real
  consequences (a birthday, a catchphrase); a baby asking "when's your birthday?"
  is funny once and confusing twice. A baby's bond may be inherited from an older
  pet (bonds carry over), so a level-7 question can reach a baby; it stays normal.
- **Celebrations:** birthdays, "friends for a month", the party, the first look's
  away note (long, with data), the Thanksgiving thanks. Holiday costume and visitor
  lines (`SEASONS`) stay normal except the small baby set proposed in "Holiday
  lines" below.
- **Aimed wishes** (`WISHES_FOR`): they name a person; they keep their words.
- **Games** prompts (the game box owns the bubble), `stage_changed`, "hello!" at
  hatching, trait notifications, and the other lines that carry a decision (the
  sick call is the one owner-chosen exception, above).
- **The weight mood lines** (`_WEIGHT_REASONS`: "feeling a bit round..."): not a
  baby line anywhere; no body talk made cuter.

### The no-nagging check (each baby line)

The parent plan's rule: positive or quiet, never guilt or nagging. For each line:

- A need is said **once**, plain and soft ("hungy!", "stinky! clean?"), never a
  chain ("hungy hungy hungy"). One word repeated twice at most ("yay yay", "play
  play", "hi hi", "yum yum", "cozy cozy"), and no call line repeats a word except
  "play play?" (so "night night" is gone from the tired call).
- No "why didn't you", no "still", no "again", no pleading ("pleeease"), no
  baby-sad faces. `oh! hi hi ♥` for a missed care is a *perk*, as A9.1 says.
- Ambient lines are statements. A `?` is allowed only in the `call_*` keys.
- The mood line is redrawn each tick and never voiced, typed or babbled. It does
  not repeat as a new line; it is the same line the whole time the need lasts, as
  today.
- A card check scans the whole `BABY` table and the holiday set: no "!!!", no
  repeated word more than twice in a row, none of "still", "again", "why", "never",
  "pleas", "sad", "cry", "alone", "forgot"; **no `?` in any key that is not a
  `call_*` key**; **no repeated word in a `call_*` line except `call_happiness` and
  `call_fake`**; and each line within the fit budget below.

## Interactions

- **The creature's sound** (phase 2, `_speak`, `_soundFor`): baby lines don't
  contain it; `_soundFor` prefixes it as for any line, in the mood of the first
  mark. So the named greeting "Sam!! hi hi!" becomes "tweet tweet!! Sam!! hi hi!"
  and "hi hi, Sam!" becomes "tweet! hi hi, Sam!". The parent plan's "tweet tweet!
  hi hi!" needs "!!" on the line (`!!` is what makes the sound double). The
  greeting with no name only runs on a shared screen, where there is no baby talk,
  so it has no baby row. `OPENERS` already stops a sound before "yay", "ooh", "zzz", "la
  la": "yay yay!" stays unprefixed, which reads fine. Fit: sound plus the longest
  baby line stays under `VOICE_MAX` (60); baby lines are mostly shorter than
  their normal, so the budget is easier.
- **Typing and babble:** unchanged: they follow `_speak` (pace per creature;
  babble only if "babble" is on, on voiced lines). Shorter lines type faster; a
  baby's "hi hi!" is a very short babble, which is fine. The mood line and idle
  lines never type.
- **Catchphrase** (parent row 4/9): never in baby talk. Three call sites pass
  `catch: true` today: `wish_granted` and `favourite_snack` (queued with
  `{catch: true}`, passed straight through by `_sayQueued`) and `_moment`'s local
  `speak` helper. So the rule is not a default: **wherever `_lines` returns a baby
  or child line, the call site forces `catch: false`** (`_lines` returns the line
  and whether it was swapped; the three sites use that). Since `catchCount` only
  increments for `catchy` calls, a baby line doesn't advance the "every third
  line" count either. A card check drives `wish_granted`, `favourite_snack` and a
  `_moment` line as a baby and asserts no catchphrase.
- **Nicknames and names:** unchanged text, inserted after the choice. A baby who
  has been given a nickname by a level-4 friend (an inherited bond) says "hi hi,
  Sunbeam!". A shared screen has neither names nor baby talk.
- **Notifications and phones (decided by the owner, 2026-10-28):** no baby talk;
  the card only. A phone message carries information
  and sometimes a button (Feed); it is built on the server from the pet's name and
  event, and the server doesn't know (or need to know) the person's card choice.
  Phones also keep the A1 rule "never a sound". The pet's name and "Pip is all
  grown up!" are unchanged.
- **Assist** (`intent.py`): no baby talk. Spoken replies and screen readers read
  the sentence aloud; "hungy" read by a voice assistant is a worse experience than
  the plain sentence, and Assist is outside the card's choice.
- **Live region** (`.status-feedback`, `s.live`): `_speak` announces `spoken(text)`
  once per line, after sounds are removed. **Screen readers announce baby lines as
  shown** ("hungy!"), because the live region should say what's on screen and the
  lines are spelled to be said aloud (first-mate default, owner may overrule). The
  **mood line is not announced at all**, as today: the bubble's observer announces
  only when `s.sayUntil` is set, and the mood line is written without a timeout
  (`_write(s, text)`, only when `!s.sayUntil`). So this concerns only `_speak` and
  timed `_write` lines (greeting, moments, first look). Babble and typing add
  nothing. Reduced motion: no typing, no babble (parent A2).
- **The status screen:** the switch row only; no baby words in the status text,
  the journal or the log.
- **Shared screen:** nothing: the row is hidden and `babyTalk()` is false (above).
  The switch is shown on every other screen, whether or not a baby is around
  (first-mate default).
  The pet's own mood line on a shared screen is therefore always the normal one.
- **Questions queued from the visit** (`_note`, `s.queue`): texts are chosen at
  the moment they're queued, so the switch changes new lines only; turning it on
  or off doesn't rewrite what's already waiting, and doesn't need to.
- **Egg and hatching:** unchanged ("hatching in about 5 min" etc. from `_say`).
  `stage_changed` to child says "I'm a child now!" in the normal words.
- **Switching it on:** the toggle says one line so the person sees it: baby or child
  pet on screen: its baby greeting ("hi hi!") through `_speak`; otherwise only
  "OK, baby talk for babies and children ♥" in `.status-feedback`.

## Server

- `people.py`: `person["baby_talk"]` (bool; absent = off), beside `my_day` and
  `birthday_phone`; a helper `baby_talk(user)` like `my_day(user)`. The People
  store is shared by every pet (`hass.data[DOMAIN]["people"]`), so one switch
  follows the person to every pet and the next generation, with no migration.
- `coordinator.py`: `async_set_baby_talk(user, enabled)`: sets it, saves
  (`people.save()`), and republishes nothing (no entity shows it). Added to every
  return of `async_visit` (`"baby_talk": ...`), **including the early
  `counted: False` replies** (asleep, too soon), which today return no flags at
  all: a card that reloads at night would otherwise not learn the switch.
- `__init__.py`: a websocket command `virtual_pet/baby_talk`
  `{entity_id, enabled}`, registered beside `websocket_birthday_phone` (line 128 today) and
  written the same way (not a service: the choice stays off the event bus; no
  `services.yaml`). Nothing is echoed in an error.
- No model change (`PetState` is untouched; a baby's stage is already in
  `life_stage`). No sensor attribute. Diagnostics: the people store is already
  kept out; nothing new.
- `reason_key` (see "Needs a key" below): one small sensor attribute, in its own
  commit.

### Needs a key: the mood line is a server sentence

The hunger/sick/dirty lines are the only large set that is *not* a card table:
`sensor.mood` carries `reason` as English text and the card shows
`mood.attributes.reason` (`_say`, redrawn each tick, `_tick`). The card can't swap
text it doesn't know the key of, and matching on the English string would break
the day a reason is reworded. So the mood sensor gains `reason_key`, unrecorded
(beside `reason` in `_unrecorded_attributes`).

**There are four sources of the sentence, not two** (`model.current_mood`, around
line 1760): `_CALL_REASONS` and `_MOOD_REASONS` (and `_reason`'s two sleepy
sentences), then **`HomeEffect.reason()`** (`home.REASONS`, the house-weather
sentences) whenever the mood is content, cozy, excited, sleepy or bored, then
`_WEIGHT_REASONS`, which overrides that. The key follows whichever branch won:

| Source | Key |
| --- | --- |
| `_CALL_REASONS[call.reason]` | `call_<reason>` (`call_hunger`, `call_sick`...) |
| `_reason` sleepy | `sleepy_drowsy`, `sleepy_low` |
| `_MOOD_REASONS[mood]` | the mood (`hungry`, `bored`, `content`...) |
| `home.REASONS[flag]` | `home_<flag>` (`home_storm`, `home_cozy`...) |
| `_WEIGHT_REASONS[band]` | `weight_<band>` |

`BABY.reason` lists the call and mood keys; the `home_*` and `weight_*` keys are
listed as "stays normal" (the house sentences carry information; the weight lines
are never made cuter), so a shadowed mood line shows its sentence, unchanged.

**`current_mood()` keeps its 3-tuple** `(mood, flags, reason)`: it is unpacked at
`intent.py:176` (Assist already reads `reason`), at `sensor.py:117` (via
`_resolve()`) and `sensor.py:329`, and defined at `coordinator.py:256`. The key is
computed by the same branch code but returned through a separate function (an
internal 4-tuple that `current_mood()` trims, used only by the mood sensor's
attributes), so no caller changes. A test asserts Assist still gets the plain
sentence. The card keys `BABY.reason` by `reason_key`; an unknown or missing key
(an older integration) shows the sentence as it is. Pure additive.

## Card

- `BABY` table (the proposal above) and `_lines(s, key, normal)`.
- `babyTalk()` (module function, like `sharedScreen()`, `soundsOn()`): false on a
  shared screen; else `localStorage["hatch-baby-talk-<userId>"] === "on"`.
- **The cache, keyed by user ID.** Written when the person taps the switch and
  after every visit reply that carries `baby_talk` (so another device's change
  arrives at the next visit, an hour at most, as `my_day` does); never read on a
  shared screen. The key has the user ID because one browser may serve several
  people (a family laptop) and the switch is theirs. `_greet` runs before the
  visit, which is why the cache exists: the first greeting of a page load already
  knows. **A device that has never seen the person gets normal lines until its
  first visit reply** (decided: no extra call at load) (a few seconds after the first look), then baby lines; no
  extra call at load. No storage (private window): the server value from the
  visit holds in memory (`this._babyTalk`) for the page; first greeting normal.
- **The status row** after "my day": `row(null, "baby talk", <button class="bell
  babytalk" aria-pressed>)`, not on a shared screen, shown whether or not a baby
  is around (it's the person's, and a pet may hatch tomorrow). The button writes
  the cache and calls the websocket command with the same `callWS(...).then(...)
  .catch(...)` pattern as `bdayphone`; on failure the button goes back and says
  "That didn't work. Try again." (pending class while it waits).
  `aria-label="baby talk: simpler words while a pet is a baby or child"`.
- `_greet` (named and nickname), `_idle`, `_moment` (care_miss, wish_granted,
  friend_home, bond_up, favourite_snack, tucked_in), `_react`'s yum,
  `_firstLook`'s wish and the `REFUSALS` lookup each call `_lines`, and force
  `catch: false` on a swapped line. `_say` swaps the reason by `reason_key`.
- `_seasonTick`: the costume lines (`season.lines`) take the holiday set below
  when `_lines` says so.
- The shared-screen switch (A9.3) turning on already clears queues; it also makes
  `babyTalk()` false. Nothing else to clean.

## Tests

- people/coordinator: `baby_talk` off by default; `async_set_baby_talk` stores it
  per person; two people independent; across two pets one store; every return of
  `async_visit` carries it, including the asleep and too-soon replies; it is in no
  state attribute, no bus event, not in diagnostics or the integration's log;
  the websocket command stores it and rejects an unknown entity.
- model: `reason_key` for each mood and call reason; always present; matches the
  sentence's source: table-driven over `_CALL_REASONS`, `_MOOD_REASONS`, the two
  sleepy sentences, **`home.REASONS` and `_WEIGHT_REASONS`**, including the cases
  where the house or the weight branch shadows the mood. `current_mood()` still
  returns the 3-tuple and Assist still gets the plain sentence.
- Card checks (`scripts/card-check`, the injected-state style of the others). The
  dev HA has one user ("Dev") and two pets that drift to sick, so: `_hass.user` is
  stubbed in-page for the "two users" checks (as the other checks stub `_moment`,
  e.g. card-check.js:377); the stage is injected by `inject` of the
  `sensor.life_stage` state; and the mood is injected too, so a drifted sick pet
  doesn't change the line under test.
  - off: a baby's mood line, greeting and idle line are the normal ones;
  - on, baby: hunger call reads "hungy!", the greeting is a `BABY.greet` line with
    the sound in front, the idle line is from the baby set; on, child: the child
    set; on, teen/adult: normal;
  - two cards, same pet, one signed in as on and one as off: different lines;
  - shared screen on: normal lines, no baby talk row, even with the cache "on";
  - the cache: set before load, the first greeting is already baby talk; keyed by
    user (another user ID on the same browser reads normal); a visit reply that
    says off turns the cache off;
  - the catchphrase is not on a baby line and doesn't advance the count; this is
    driven through `wish_granted`, `favourite_snack` and a `_moment` line;
  - the live region gets a baby `_speak` line once, as shown, no sound; the mood
    line is not announced; reduced motion: no typing;
  - the cache turned off by a visit reply that is `counted: false` (asleep): the
    pet is asleep, the reply carries the flag, the cache follows;
  - the holiday set: on, baby, in season (the season forced by `config.seasonal`):
    a baby line from the holiday set; child, teen and off: the normal ones;
  - a table scan of `BABY` and the holiday set for the no-nagging words, the repeat
    limit, **no `?` outside `call_*` keys**, `VOICE_MAX` fit with the longest sound,
    and that every key exists in the normal tables;
  - an unknown `reason_key` and an older integration (no `reason_key`) show the
    sentence;
  - the status row: a tap calls the command once, button state follows, a failed
    call restores it.
- **Acceptance** (what "done" is, beyond the tests): the owner turns the switch on
  and a baby's hunger call reads "hungy!"; off, "tummy rumbling!"; the same pet on
  a shared screen reads the normal line; a phone message is unchanged; the guide
  states the real stage lengths and the up-to-an-hour lag between devices.
- A sample sheet for the owner: no tool builds "the 13 creatures as babies" (the
  dev HA has two pets and `inject` only patches states). Deferred: the sheet is two
  or three creatures through `inject` of the stage and species, switch on and off
  (greeting, hungry, sleepy, happy, favourite snack), at 330 px and compact.

## Release and cost

**Phase 5 is its own PR, after phase 4.** Build order (first-mate default): phase 5
is built on `main` **after phase 4 (0.34.0b1) has merged**; the version is decided
at build time (it must not skip a final 0.34.0: if phase 4 is still only the beta, this is
numbered on top of it; the plan no longer says "0.35.0").
Not a beta for companion-app reasons (nothing here depends on the apps).

Inside the PR, **the `reason_key` work (audit 2-4) is its own commit**: the
card-only lines (switch, flag, websocket command, `BABY` for the card tables, the
holiday set) first, and the `reason_key` half, the riskier one and independent of
the rest, as a separate commit after it, so it can be reverted alone.

Cost: S-M, **about 4.5 days is fine** for the stage length (decided, owner may
overrule). One table, one helper, one row, one websocket command, one attribute.
Version/changelog/guide: the guide's line-sets section gets "baby talk", the real
stage lengths, and the lag between devices.

## Overlap with phase 4 (the photo)

Phase 4 (`plan-2026-10-28-phase4-photo.md`) merges first (above), so these are
conflicts to expect only if the build starts before it; building on `main` after
the merge removes them. In order of risk:

1. `coordinator.async_visit`'s return dicts (`coordinator.py:1059`, `1066`, `1103`):
   this phase adds `baby_talk` to every return.
2. `__init__.py`: both register a websocket command next to `birthday_phone`
   (`async_register_command` list, line 128).
3. `hatch-pet-card.js`: `_renderStatus` rows, `VERSION`, `_clearAsk`/`_forget`.
4. `people.py` / the bond: this phase adds a person flag; phase 4 changes the bond
   (`bond["photos"]`). No shared keys.
5. The version bump goes last.

Phase 6 (moths) changes `_MOOD_REASONS` and hunger lines; `reason_key` is built to
survive that (the key, not the sentence, is what the card sees); say so in phase 6.

## Decided (2026-10-28) and still open

Owner's answers: the sick call uses the baby version; ambient mood lines are
statements; no baby talk in notifications; a few baby holiday lines (proposed
below). First-mate defaults, recorded as decided (the owner may overrule): the
switch is always shown (not on a shared screen); screen readers announce baby lines
as shown; the first greeting on a never-seen device is normal until the first visit
reply; about 4.5 days is fine; build order and version as in Release.

Still for the owner: **the lines**, in the table above and the holiday table below.
Are they the right kind of cute? Any word you want cut or added?

### Holiday lines (a proposal for the owner)

A baby gets a small set per holiday, in place of `season.lines` (the costume
bubble); the treat-day lines ("trick or treat!", "happy Thanksgiving! ♥") and the
countdown stay normal. Children keep the normal lines. Same no-nagging and no-`?`
rules as the other lines.

| Holiday | Normal (`season.lines`) | Baby (proposal) |
| --- | --- | --- |
| Halloween | boo! / happy Halloween! / spooky~ / trick or treat? / do I look spooky? | boo! / boo! hehe / spooky~ / yay, costume! |
| Thanksgiving | gobble gobble! / happy Thanksgiving! / I'm thankful for you ♥ / smells like pie... / so cozy~ / look at all the leaves! | gobble gobble! / pie! yum yum / thank you ♥ / cozy cozy~ / leaves! |
| Birthday party (`PARTY.lines`) | party hat on! ♪ / do you like my party hat? / best birthday ever! ♪ | none: it has lines, but they can't reach a baby or child. The yearly party is a birthday on the pet's calendar date, monthly in its first year (`model.pet_birthday`), and a pet is a baby or child for about 4.5 days of age. Only a pet that was away for most of a month could hit one; those lines stay normal |

## What in the parent plan the code contradicts

- "About the first week": baby plus child is 120 h of age, about 4.5 days
  (`rates.STAGE_STARTS`).
- "Simpler versions of the pet's common lines" assumes lines in the card; the most
  common one on screen, the mood line ("hungry", "stinky"), is a server sentence
  (`model._CALL_REASONS`, `_MOOD_REASONS`), so it needs a `reason_key`.
- The example "tweet tweet! hi hi!": the doubled sound comes from the voice
  (`_soundFor`, on `!!`), not the line; a line "hi hi!" gets "tweet! hi hi!".
- "Saved in the people store and cached in the browser (so the first greeting
  already knows it)": the only path from the server to the card is the visit reply,
  which is hourly, absent on a shared screen, and today missing from the
  `counted: False` replies; those need the flag too, or a night reload forgets it.
- "The switch... on the status screen" next to A9.3 ("no 'my day' or 'baby talk'
  switches" on a shared screen): `my_day` is shown only with a bond; baby talk is
  proposed to show without one.

## The audit of draft 1 (13 findings) and what changed

This table wins where it differs from the sections above. Every finding was
checked against the code before it was folded in; all 13 held, with the small
corrections noted in their rows.

| # | Finding | Change |
| --- | --- | --- |
| 1 | The catchphrase claim was false: `wish_granted` (card:2702) and `favourite_snack` (card:2759) are queued with `{catch: true}`, `_sayQueued` passes the opts to `_speak`, and `_moment`'s local `speak` helper hard-codes `catch: true` (card:2563). Verified | The call site forces `catch: false` whenever `_lines` swapped the line. A card check drives `wish_granted`, `favourite_snack` and a `_moment` line as a baby |
| 2 | `reason_key` missed a third source: `current_mood` replaces the sentence with `HomeEffect.reason()` (`home.REASONS`) for content/cozy/excited/sleepy/bored, then `_WEIGHT_REASONS` overrides. Verified (`model.py:1760-1766`) | Keys `home_<flag>` and `weight_<band>`; the key follows whichever branch won; both listed in `BABY.reason` as "stays normal"; the table test covers all four sources |
| 3 | `current_mood()` has other consumers of its 3-tuple. Verified: `intent.py:176`, `coordinator.py:256`, `sensor.py:329`, and `sensor.py` via `_resolve()` (the unpack is in the attributes, one step from the coordinator; the audit's "117" is that line) | `current_mood()` keeps its 3-tuple; the key comes from a separate function (an internal 4-tuple the mood sensor's attributes use). A test: Assist still gets the plain sentence |
| 4 | The live-region claim was false: the observer announces only when `s.sayUntil` is set, and the mood line is `_write(...)` without `ms`. Verified | The sentence is corrected: the mood line is never announced. Screen readers announce baby lines as shown on `_speak` and timed `_write` lines (first-mate default). Old question 4 is closed |
| 5 | The "Greeting, no name" row was dead: `_greet` returns early when `!first && !shared`, so the no-name branch only runs on a shared screen; "hi hi!" is also already a normal no-name line. Verified | Row deleted. The sound-doubling example uses a named greeting: "Sam!! hi hi!" gives "tweet tweet!! Sam!! hi hi!" |
| 6 | (a) The sick call carries a decision yet got a baby line. (b) "sleepy... night night?" repeats a word in a need line. (c) The scan couldn't enforce (b). Verified | (a) **Owner, 2026-10-28:** the sick call uses the baby version ("owie... medicine?", child "feeling icky, medicine?"); written down as the one explicit exception to "decision-carrying lines stay normal". (b) The tired call is "sleepy... bedtime?" (child "so sleepy... bedtime?"). (c) The scan: no repeated word in a `call_*` line except `call_happiness` and `call_fake` |
| 7 | Ambient baby mood lines read as asks, redrawn all day ("play?", "stinky! clean?"). Verified (the mood line is redrawn every tick) | **Owner, 2026-10-28:** ambient mood lines are statements: bored "la la la", dirty "messy...". Asks only on the `call_*` lines. The wishes became statements ("wish... snack after lunch") and the idle lines lost their `?`. The scan: no `?` outside `call_*` keys |
| 8 | The line list was incomplete: nickname greetings, `bond_up` (generic only), `friend_home`, and which `tucked_in`. Verified (card:2354, 2712-2716, 511, 2743) | Nickname rows added. The `tucked_in` moment is the baby row; the next-visit `NOTES.tucked_in` stays normal. Lines not listed stay normal |
| 9 | `withName` makes "night night, thank you, Sam ♥" | The line is "night night ♥", so a name gives "night night, Sam ♥"; written so every named line survives `withName` |
| 10 | Test gaps: one dev user; drifting sick pets; no 13-species tool; no asleep `counted:false` check; no acceptance line. Verified | Tests say how: `_hass.user` stubbed in-page, stage and mood injected, an asleep-reply check, an acceptance list. The 13-creature sheet is deferred to two or three creatures through `inject` |
| 11 | Merge risk with phase 4, and the version; the websocket line is 128, not 126. Verified | **Build order (first-mate default):** phase 5 is built on `main` after phase 4 (0.34.0b1) merges; the version is decided at build time and must not skip a final 0.34.0; the version bump goes last; "line 128" |
| 12 | Scope: three server changes, ~30 rows; `reason_key` is the risky, independent half | Phase 5 is its own PR after phase 4; the `reason_key` work (findings 2-4) is its own commit inside it, after the card-only lines |
| 13 | Another device's change shows at the next visit, up to an hour later (`VISIT_EVERY_MS`) | One sentence in "What the person gets" and the guide |

### The owner's other answers (2026-10-28), folded in

| Topic | Change |
| --- | --- |
| Phones | No baby talk in notifications; the card only. Recorded as decided |
| Holidays | **Yes, a few baby seasonal lines.** The proposal (Halloween, Thanksgiving) is in "Holiday lines" above, marked as a proposal for the owner. The birthday party has lines but they can't reach a baby or child (a birthday is monthly in the first year), so it gets none |
| Switch | Always shown, not on a shared screen (first-mate default) |
| First greeting on a new device | Normal until the first visit reply; no extra call at load (first-mate default) |
| Stage length | About 4.5 days is fine (first-mate default) |
