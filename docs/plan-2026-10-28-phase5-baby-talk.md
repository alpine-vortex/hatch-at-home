# Phase 5: baby talk (build plan, DRAFT 1)

Phase 5 of `plan-2026-10-28-voices-and-lines.md`: A8, plus the second audit's row 9
(kept by the owner as the last feature phase; the cache is keyed by user ID) and
A9.3 (no baby talk switch on a shared screen) and row 4 (the catchphrase is never
in baby talk). Next version after the photo (0.34.0), so **0.35.0**, its own PR.
Docs only so far: nothing here is built. **Draft 1: an adversarial audit by a
separate scout follows; the owner has not seen the proposed lines.**

All baby and child lines below are **a proposal for the owner**, not approved copy.

## What the person gets

A switch on the status screen, "baby talk", off by default, theirs (it follows
them to every pet and every device they're signed in on). On: while a pet is a
baby (about its first day) or a child (about its next four), its common lines are
simpler: "hungy!", "sleepy...", "hi hi, Sam!", "yay yay!". Babies get the most
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
is never broken. Names and nicknames are inserted after the choice
(`withName`, as now): baby lines never rewrite a name ("Sam", never "Sammy" or
"Sam-sam"). The lines that carry a title, headline, number, food or
place (`watching`, `listening`, `news`, `weather`, `forecast`, `steps`...) take no
baby version: they are about the world, and a baby cutting them short would lose
the information.

## The line sets

The "(card)" names are today's code. `B` = baby, `C` = child; "same" means no
change. Lines the audit (A9) already rewrote are the starting point.

### Gets a baby (and child) version

| Set | Where | Normal (today) | Baby (proposal) | Child (proposal) |
| --- | --- | --- | --- | --- |
| Mood line: hungry call | `_CALL_REASONS["hunger"]` | tummy rumbling! | hungy! | tummy rumbly! |
| Mood line: sick call | `_CALL_REASONS["sick"]` | feeling sick, medicine please? | owie... medicine? | feeling icky, medicine? |
| Mood line: dirty call | `_CALL_REASONS["dirty"]` | it's getting stinky in here | stinky! clean? | it's getting stinky! |
| Mood line: tired call | `_CALL_REASONS["energy"]` | so tired... sleep time? | sleepy... night night? | so sleepy... bedtime? |
| Mood line: play call | `_CALL_REASONS["happiness"]`, `"fake"` | play with me? | play play? | same |
| Mood line: sleepy | `_reason` | getting late, eyes drooping / running low on energy | sleepy... | same as normal |
| Mood line: hungry | `_MOOD_REASONS["hungry"]` | a little peckish | a little hungy | a little hungry |
| Mood line: dirty | `_MOOD_REASONS["dirty"]` | a bit messy in here... | messy... | same |
| Mood line: bored | `_MOOD_REASONS["bored"]` | nothing to do | play? | same |
| Mood line: excited | `_MOOD_REASONS["excited"]` | that was fun! | yay yay! | that was fun! yay! |
| Mood line: cozy | `_MOOD_REASONS["cozy"]` | nice and cozy | cozy cozy | same |
| Mood line: content | `_MOOD_REASONS["content"]` | all good | happy! | all good! |
| Greeting | `_greet`, no name | morning! / hi! / evening! / hi hi! | hi hi! / hi hi!! | same |
| Greeting | `_greet`, named | hi, Sam! / Sam!! hi! | hi hi, Sam! / Sam!! hi hi! | hi, Sam! hi! |
| Greeting, bond 2+ | `_greet` | Sam! I missed you ♥ / yay, Sam's here! | Sam!! ♥ / yay yay, Sam! | same |
| Idle, sleepy | `_idle` | *yawn* / mm... sleepy | *yawn* / sleepy... / nap? | same |
| Idle, bored | `_idle` | hmm... / anyone wanna play? | hmm... / play? | same |
| Idle, excited | `_idle` | hehe! / wheee | hehe! / yay yay! | same |
| Idle, hungry | `_idle` | *tummy rumbles* / is it snack time? | *tummy rumbles* / snack? | same |
| Idle, default | `_idle` | ♪ hm hm hm ♪ / la la la | ♪ la la ♪ / hi? / *looks around* | same |
| Snack eaten | `_react` | yum, hazelnuts! | yum yum, hazelnuts! | same |
| Favourite snack | `favourite_snack` | hazelnuts, my favourite!! | hazelnuts! yay yay! | same |
| Wish granted | `wish_granted` | yay, my wish! ♥ | yay yay! ♥ | same |
| Friend home | `friend_home` | you're home!! ♥ / yay, you're back! ♥ | you're home! yay yay ♥ | same |
| Missed care | `care_miss` | ...oh, there you are ♥ | oh! hi hi ♥ | same |
| Tucked in | `tucked_in` | thank you for tucking me in ♥ | night night, thank you ♥ | same |
| Bond up | `bond_up`, generic only | you're the best ♥ / we're getting close! ♥ | yay, you! ♥ | same |
| Wish (first look) | `WISHES` | I wish we could play a game today! | play with me today? | same |
| Wish | `WISHES.snack` | I'd love a snack after lunch! | snack after lunch? | same |
| Wish | `WISHES.bath` | I wish I could have a bubble bath! | bubbles? bubble bath! | same |
| Wish | `WISHES.tuck_in` | will you tuck me in tonight? | tuck me in? | same |
| Refusals | `REFUSALS.full` | I'm full! | tummy full! | same |
| Refusals | `REFUSALS.too_tired` | too tired to play | too sleepy to play | same |

Child changes are deliberately few: the mood line's calls, the named greeting,
the snack lines. "A little", as the owner said.

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
  lines (`SEASONS`) stay normal; a long table for a few days a year.
- **Aimed wishes** (`WISHES_FOR`): they name a person; they keep their words.
- **Games** prompts (the game box owns the bubble), `stage_changed`, "hello!" at
  hatching, trait notifications, the sick/sad lines that carry a decision.
- **The weight mood lines** (`_WEIGHT_REASONS`: "feeling a bit round..."): not a
  baby line anywhere; no body talk made cuter.

### The no-nagging check (each baby line)

The parent plan's rule: positive or quiet, never guilt or nagging. For each line:

- A need is said **once**, plain and soft ("hungy!", "stinky! clean?"), never a
  chain ("hungy hungy hungy"). One word repeated twice at most ("yay yay", "play
  play", "hi hi", "yum yum", "cozy cozy"), and never in a need line except
  "play play?".
- No "why didn't you", no "still", no "again", no pleading ("pleeease"), no
  baby-sad faces. `oh! hi hi ♥` for a missed care is a *perk*, as A9.1 says.
- The mood line is redrawn each tick and never voiced, typed or babbled. It does
  not repeat as a new line; it is the same line the whole time the need lasts, as
  today.
- A card check scans the whole `BABY` table: no "!!!" , no repeated word more than
  twice in a row, none of "still", "again", "why", "never", "pleas", "sad", "cry",
  "alone", "forgot", and each line within the fit budget below.

## Interactions

- **The creature's sound** (phase 2, `_speak`, `_soundFor`): baby lines don't
  contain it; `_soundFor` prefixes it as for any line, in the mood of the first
  sentence. So "hi hi!!" becomes "tweet tweet!! hi hi!!" and "hi hi!" becomes
  "tweet! hi hi!". The parent plan's "tweet tweet! hi hi!" needs "!!" on the line
  (`!!` is what makes the sound double); the baby greetings above use `!!` where
  that is wanted. `OPENERS` already stops a sound before "yay", "ooh", "zzz", "la
  la": "yay yay!" stays unprefixed, which reads fine. Fit: sound plus the longest
  baby line stays under `VOICE_MAX` (60); baby lines are mostly shorter than
  their normal, so the budget is easier.
- **Typing and babble:** unchanged: they follow `_speak` (pace per creature;
  babble only if "babble" is on, on voiced lines). Shorter lines type faster; a
  baby's "hi hi!" is a very short babble, which is fine. The mood line and idle
  lines never type.
- **Catchphrase** (parent row 4/9): never in baby talk. Baby-talk lines go through
  `_speak` with `catch: false`, and since `catchCount` only increments for
  `catchy` calls, a baby line doesn't advance the "every third line" count either.
  A pet that is a baby has the creature's own catchphrase anyway (a new egg
  starts with it).
- **Nicknames and names:** unchanged text, inserted after the choice. A baby who
  has been given a nickname by a level-4 friend (an inherited bond) says "hi hi,
  Sunbeam!". A shared screen has neither names nor baby talk.
- **Notifications and phones:** no baby talk. A phone message carries information
  and sometimes a button (Feed); it is built on the server from the pet's name and
  event, and the server doesn't know (or need to know) the person's card choice.
  Phones also keep the A1 rule "never a sound". The pet's name and "Pip is all
  grown up!" are unchanged. (Open question 3.)
- **Assist** (`intent.py`): no baby talk. Spoken replies and screen readers read
  the sentence aloud; "hungy" read by a voice assistant is a worse experience than
  the plain sentence, and Assist is outside the card's choice.
- **Live region** (`.status-feedback`, `s.live`): `_speak` announces `spoken(text)`
  once per line, after sounds are removed. A baby line is announced as shown
  ("hungy!"), because the live region should say what's on screen and the lines
  are spelled to be said aloud. The mood line is announced through the bubble's
  observer as today (`s.plain`). Babble and typing add nothing. Reduced motion:
  no typing, no babble (parent A2). (Open question 4 asks whether need lines
  should be announced in plain words instead.)
- **The status screen:** the switch row only; no baby words in the status text,
  the journal or the log.
- **Shared screen:** nothing: the row is hidden and `babyTalk()` is false (above).
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
  `{entity_id, enabled}`, registered beside `websocket_birthday_phone` and
  written the same way (not a service: the choice stays off the event bus; no
  `services.yaml`). Nothing is echoed in an error.
- No model change (`PetState` is untouched; a baby's stage is already in
  `life_stage`). No sensor attribute. Diagnostics: the people store is already
  kept out; nothing new.
- `reason_key` (see "Needs a key" below): one small sensor attribute.

### Needs a key: the mood line is a server sentence

The hunger/sick/dirty lines are the only large set that is *not* a card table:
`sensor.mood` carries `reason` as English text (`_CALL_REASONS`, `_MOOD_REASONS`,
`_WEIGHT_REASONS` in `model.py`), and the card shows `mood.attributes.reason`
(`_say`, redrawn each tick, `_tick`). The card can't swap text it doesn't know the
key of, and matching on the English string would break the day a reason is
reworded. So the mood sensor gains `reason_key` (`"call_hunger"`, `"hungry"`,
`"sleepy_drowsy"`, `"weight_heavy"`..., unrecorded, beside `reason` in
`_unrecorded_attributes`), produced by the same `_reason` code that picks the
sentence. The card keys `BABY.reason` by it; an unknown or missing key (an older
integration) shows the sentence as it is. This is the one server change outside
the switch, and it is pure additive.

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
  first visit reply** (a few seconds after the first look), then baby lines; no
  extra call at load. No storage (private window): the server value from the
  visit holds in memory (`this._babyTalk`) for the page; first greeting normal.
- **The status row** after "my day": `row(null, "baby talk", <button class="bell
  babytalk" aria-pressed>)`, not on a shared screen, shown whether or not a baby
  is around (it's the person's, and a pet may hatch tomorrow). The button writes
  the cache and calls the websocket command with the same `callWS(...).then(...)
  .catch(...)` pattern as `bdayphone`; on failure the button goes back and says
  "That didn't work. Try again." (pending class while it waits).
  `aria-label="baby talk: simpler words while a pet is a baby or child"`.
- `_greet`, `_idle`, `_moment` (care_miss, wish_granted, friend_home, bond_up,
  favourite_snack, tucked_in), `_react`'s yum, `_firstLook`'s wish and the
  `REFUSALS` lookup each call `_lines`. `_say` swaps the reason by `reason_key`.
- The shared-screen switch (A9.3) turning on already clears queues; it also makes
  `babyTalk()` false. Nothing else to clean.

## Tests

- people/coordinator: `baby_talk` off by default; `async_set_baby_talk` stores it
  per person; two people independent; across two pets one store; every return of
  `async_visit` carries it, including the asleep and too-soon replies; it is in no
  state attribute, no bus event, not in diagnostics or the integration's log;
  the websocket command stores it and rejects an unknown entity.
- model: `reason_key` for each mood and call reason; always present; matches the
  sentence's source (a table-driven test over `_CALL_REASONS`/`_MOOD_REASONS`).
- Card checks (`scripts/card-check`, the injected-state style of the others):
  - off: a baby's mood line, greeting and idle line are the normal ones;
  - on, baby: hunger call reads "hungy!", the greeting is a `BABY.greet` line with
    the sound in front, the idle line is from the baby set; on, child: the child
    set; on, teen/adult: normal;
  - two cards, same pet, one signed in as on and one as off: different lines;
  - shared screen on: normal lines, no baby talk row, even with the cache "on";
  - the cache: set before load, the first greeting is already baby talk; keyed by
    user (another user ID on the same browser reads normal); a visit reply that
    says off turns the cache off;
  - the catchphrase is not on a baby line and doesn't advance the count;
  - the live region gets the baby line once, plain, no sound; reduced motion: no
    typing;
  - a table scan of `BABY` for the no-nagging words, the repeat limit, `VOICE_MAX`
    fit with the longest sound, and that every key exists in the normal tables;
  - an unknown `reason_key` and an older integration (no `reason_key`) show the
    sentence;
  - the status row: a tap calls the command once, button state follows, a failed
    call restores it.
- A sample sheet for the owner: the 13 creatures as babies, with the switch on and
  off (greeting, hungry, sleepy, happy, favourite snack), as screenshots at 330 px
  and compact. (The parent plan's sample sheet.)

## Release and cost

0.35.0, its own PR (not a beta: nothing here depends on a companion app).
Cost S-M: one table, one helper, one row, one websocket command, one attribute.
Version/changelog/guide: the guide's line-sets section gets "baby talk" and the
real stage lengths.

## Overlap with phase 4 (the photo), built in parallel

Phase 4 (`plan-2026-10-28-phase4-photo.md`) is unmerged and touches the same
files; nothing here is designed around its code. Likely conflicts to resolve at
merge, in order of risk:

1. `coordinator.async_visit`'s return dicts: phase 4 adds photo data to a reply
   (draft 2 moves it to a websocket `virtual_pet/photos`, but the note `photo` is
   still in `_notes`); this phase adds `baby_talk` to every return. A textual
   conflict, not a design one.
2. `__init__.py`: both register a websocket command next to `birthday_phone`
   (`async_register_command` list, near line 126).
3. `hatch-pet-card.js`: `_renderStatus` rows (this adds a row; phase 4 changes the
   journal), `VERSION`, and `_clearAsk`/`_forget` (phase 4 clears photos there).
4. `people.py` / the bond: this phase adds a person flag; phase 4 changes the bond
   (`bond["photos"]`). No shared keys.
5. Release numbering: 0.34.0 (photo) before 0.35.0; if phase 4 slips, this one is
   0.34.0 and the beta is 0.35.0b1.

Phase 6 (moths) changes `_MOOD_REASONS` and hunger lines; `reason_key` is built to
survive that (the key, not the sentence, is what the card sees); say so in phase 6.

## Open questions for the owner

1. **The lines.** Are the proposed baby and child lines the right kind of cute? In
   particular "owie... medicine?", "hungy!", "stinky! clean?" for needs, and "play
   play?". Any word you want cut or added?
2. **Where the switch shows.** Always (my proposal: pets hatch later), or only when
   a baby or child is on the dashboard?
3. **Phones.** Baby talk on a baby's phone messages ("Pip is hungy!")? My proposal
   is no (information, a Feed button, a history record, and the server doesn't know
   your choice). Say if you want it as a later add-on.
4. **Screen readers.** Announce a baby line as shown ("hungy!"), or for need lines
   (hungry, sick, dirty, sleepy) the plain words? I lean to as shown, for one
   thing less to build, and since the lines are spelled to be said.
5. **A first greeting on a new device.** It's normal until the first visit reply
   (seconds), because nothing is cached yet. Fine, or add a websocket read at load
   (one call per page load)?
6. **Holiday lines.** Leave all seasonal costume and visitor lines normal
   (proposed), or give babies a few ("boo!" for Halloween)?
7. **Length.** Baby talk lasts about 4.5 days per pet, not a week. OK, or should
   "child" stay in baby talk longer by being a sparser set (as proposed)?

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
