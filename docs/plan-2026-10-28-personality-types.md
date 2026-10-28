# Personality types, 2026-10-28 (plan; DRAFT 1)

The owner's starting point (`plan-2026-10-28-voices-and-lines.md`, "Related"):
**"Personality types (AC's eight, made gentle, independent of the creature; lines
shaped by upbringing and traits)."** Touchstones: Animal Crossing's villager
personalities and The Sims' traits, emotions and wants.

Draft 1, written for an adversarial audit by a separate scout. Docs only: nothing
here is built. **Every line in this file is a proposal for the owner, not approved
copy.** All lines are in the tables under "The lines"; none appears anywhere else.
The phases are separate PRs, each with its own audit, as the owner works.

## In one paragraph

From the day a pet becomes a teen, it has one of eight personalities. Its
personality is how it talks and how it idles: which hello it picks, what it says at
sunset, how it fidgets when nothing is going on. It is settled once and kept for
life, it is not tied to the creature (a tarantula can be sweet, a bird can be an old
soul), and the house's influence on it is a gentle nudge from the traits the pet has
picked up. **It is flavour only.** It never changes a stat, a rate, a call, a care
result, a wish's reward or a bond. No type is better than another, none is a
consequence of how the pet was cared for, and none is ever unkind to a person.

## Research: what the touchstones do

### Animal Crossing

- **Eight personalities, fixed per villager**, each with its own shared dialogue
  pool, split by gender: four for male villagers (lazy, jock, cranky, smug) and four
  for female villagers (normal, peppy, snooty, big sister / "uchi")
  ([Nookipedia: Personality](https://nookipedia.com/wiki/Personality)).
- **What each is like** ([Nookipedia](https://nookipedia.com/wiki/Personality),
  [Thonky](https://www.thonky.com/animal-crossing-new-horizons/list-of-villager-personalities),
  [iMore](https://www.imore.com/animal-crossing-new-horizions-all-villager-personalities),
  [TechRaptor](https://techraptor.net/gaming/guides/animal-crossing-new-horizons-personality-guide)):
  - *Lazy*: calm, kind, easy to befriend; talks about food and a laid-back life.
  - *Normal*: calm, kind, sweet; easy to befriend.
  - *Jock*: energetic, enthusiastic, a little overbearing, means well; talks about
    training and encourages the player to exercise.
  - *Peppy*: energetic, cheerful, a little overbearing; dreams of fame.
  - *Cranky*: rude and annoyed at first, wise and caring once you know them;
    old-fashioned.
  - *Snooty*: sophisticated, can seem arrogant or rude at first, caring once known.
  - *Smug*: sophisticated, cares about being cool, self-regarding but never directly
    rude.
  - *Big sister*: laid-back, acts tough, no filter, kind at heart, protective of the
    player.
- **Counterparts**: lazy/normal, jock/peppy, cranky/snooty are each other's
  opposite-gender versions; smug and big sister came later (*New Leaf*) without one.
  Fan guides also describe types that clash (cranky with peppy, for one)
  ([iMore](https://www.imore.com/animal-crossing-new-horizions-all-villager-personalities)).
- **Subtypes at high friendship**: in *New Horizons* each personality has two
  subtypes whose distinct lines appear now and then at high friendship
  ([Nookipedia](https://nookipedia.com/wiki/Personality)).
- **Hobbies are separate from personality**: each villager has one of six hobbies
  (education, fashion, fitness, music, nature, play), fixed for life, spread across
  personalities, and the hobby shows in what they do around town (reading, lifting
  dumbbells, singing) ([Nookipedia: Hobby](https://nookipedia.com/wiki/Hobby)).

### The Sims

- **Traits**: adult Sims have three personality traits, children and teens two; an
  aspiration adds one more. Traits shape behaviour and emotions. A 2021 update added
  likes and dislikes ([Wikipedia: The Sims 4](https://en.wikipedia.org/wiki/The_Sims_4)).
  Trait categories include emotional, hobby, lifestyle and social traits
  ([Gamepressure](https://www.gamepressure.com/thesims4/the-traits-of-the-sim/z268d0)).
- **Emotions and moodlets**: 16 emotions (fine, happy, sad, angry, tense, playful,
  bored, inspired, ...), driven by moodlets. Emotions change what a Sim will do: a
  sad Sim avoids some activities, an angry one may lash out
  ([SimsCommunity emotions guide](https://simscommunity.info/2022/10/08/the-sims-4-emotions-guide/)).
  Some traits bring random moodlets of their own; *Gloomy* Sims randomly feel sad
  ([The Sims Wiki: Gloomy](https://sims.fandom.com/wiki/Gloomy)).
- **Aspirations, wants and fears**: lifelong goals made of tasks, with a reward trait
  at the end; wants and fears are generated from what is going on and can be pursued
  or ignored ([Wikipedia](https://en.wikipedia.org/wiki/The_Sims_4)).

(Sources are mostly fan wikis and guides; they agree on the broad strokes, which is
all this plan borrows.)

### What we borrow, soften and refuse

| From | What | Here |
| --- | --- | --- |
| AC | A small fixed set of personalities, each with its own pool of lines | **Borrow.** Eight types, each a table of lines |
| AC | Personality fixed for life | **Borrow.** Settled once, at teen, kept |
| AC | Personality separate from hobbies | **Borrow.** Our traits are the hobbies; the type is the voice |
| AC | Extra lines at high friendship (NH subtypes) | **Borrow.** A few lines unlock at existing bond levels (`BOND.warm`, `BOND.hearts`) |
| AC | Cranky and snooty "rude at first, warm later" | **Soften.** Reserved and few words at low bond, never rude; warmer as the bond grows |
| AC | Jock "encourages the player to exercise" | **Refuse.** Nothing about the person's body, fitness or activity. The existing `my_day` notes (`NOTES.steps`...) keep their own words for every type |
| AC | Peppy's fame, smug's vanity | **Soften.** "Loves an audience", "has grand words for everything"; nobody is looked down on |
| AC | Big sister's lack of filter | **Soften.** Tough-talking and protective; never teasing a person |
| AC | Gendered pools (four per gender) | **Refuse.** Any type for any pet; the pet stays "it" |
| AC | Types that dislike each other | **Refuse.** Every pair gets along; some pairs get along *extra* well (later, with visits) |
| Sims | Traits from what a Sim does | **Already built** (house traits, `model._learn`); the type reads them as a nudge |
| Sims | Personality shapes autonomous behaviour | **Borrow.** Idle moves (`_idle`) weighted per type |
| Sims | Likes and dislikes | **Already built** as `favourites` (snack); no dislikes |
| Sims | Emotions change what a Sim will do; trait-driven sad or angry moodlets | **Refuse.** A type never changes the mood, a refusal or a care result |
| Sims | Aspirations, fears, rewards for goals | **Refuse.** No goals, no pressure, no streaks |
| Sims | Wants | **Already built** as the daily wish; a gentle per-type leaning is an open question (Q7) |

## What it is, next to what exists

| | Traits | Temperament | Upbringing | **Personality** |
| --- | --- | --- | --- | --- |
| What it is | Habits from the house (≈ AC hobbies) | Hidden learning speed per trait | How it was raised | How it talks and idles |
| Code | `traits`, `trait_levels`, `_learn` | `temperament`, `_hatch` | `upbringing`, `_step` at adult | new `personality`, `_step` at teen |
| When | Learned while awake, up to 4 | Rolled at hatching | Decided at adult | Settled at teen |
| Changes | Grow, deepen, one inherited | Never | Never | Never |
| Touches rates | Yes (small happiness) | Yes (thresholds) | Yes (decay, whining) | **No, never** |
| Shown | Flair, status, journal | Not shown | Status, journal | Status, journal, lines, idling |

It doesn't duplicate any of them: a sweet pet can be a night owl or a homebody;
temperament stays hidden mechanics; upbringing stays the only grade-like thing, and
the type never reads it (below).

## The eight types (names are a proposal)

Our own words, short enough for a status row, not mood words (no "sleepy", "cozy"
or "excited", which are moods already), and each one a word a person would be glad
to hear said of their pet.

| Key | Name | From AC | In one line |
| --- | --- | --- | --- |
| `mellow` | mellow | lazy | Snacks, naps and easy days; slow, warm, never in a hurry |
| `sweet` | sweet | normal | Kind and homey; notices you and keeps its corner tidy |
| `bouncy` | bouncy | jock | Full of beans, loves games and moving about, cheers everything on |
| `starry` | starry | peppy | Loves an audience: sings, bows, dreams big |
| `old_soul` | old soul | cranky | Few words, dry and old-fashioned; quietly fond, warmer as it knows you |
| `fancy` | fancy | snooty | Loves pretty things: colours, dressing up, the party hat |
| `charming` | charming | smug | Grand words and compliments; makes every moment an occasion |
| `plucky` | plucky | big sister | Tough-talking and protective: "I've got your back" |

`fancy` is about *things* (colours, costumes, a pretty day); `charming` is about
*people and moments* (compliments, sunsets). That's how the two "sophisticated" AC
types stay apart once gender is gone.

## How a pet gets its personality

**Settled when it becomes a teen** (120 h, `rates.STAGE_STARTS`), never before.
Babies and children have none: they are still finding out, and their lines are
phase 5's baby talk anyway, so the two never collide. By 120 h the pet has lived
in the house for five days, so its traits (the house's influence, which the owner
asked to shape it) have had time to appear.

**`model.personality_for(state) -> str`**, pure:

1. Every type starts at weight 1.
2. Each trait the pet holds (`state.traits`, the inherited one included) adds its
   level (`trait_level`, 1-3) to its leanings below.
3. One weighted pick, from a generator seeded by the pet itself:
   `random.Random(f"personality-{state.born}")` (never `hash()`, which changes per
   process). **It does not draw from the shared `rng`** in `_step`: one extra draw
   would shift every later one and change existing seeded tests (species,
   temperament, sickness, wishes).

**Most pets get the plain pick.** A quiet house (no media, weather or presence
entities) often has no traits at 120 h; then all eight are equally likely. Traits
are a nudge: a pet with one ★ trait has 2-in-10 odds of each of that trait's two
leanings, not a certainty.

| Trait (`model.TRAITS`) | Leans toward |
| --- | --- |
| `night_owl` | mellow, old soul |
| `music_lover` | starry, charming |
| `homebody` | sweet, mellow |
| `early_bird` | bouncy, sweet |
| `helper` | sweet, plucky |
| `player` | bouncy, starry |
| `sun_lover` | bouncy, fancy |
| `fireside` | old soul, sweet |
| `moon_child` | charming, fancy |
| `storm_watcher` | plucky, old soul |
| `couch_potato` | mellow, starry |
| `social_butterfly` | starry, charming |
| `snow_child` | fancy, bouncy |
| `breeze_rider` | plucky, bouncy |
| `fog_wanderer` | old soul, mellow |
| `thunder_heart` | plucky, charming |

Each type is leaned toward by four traits, so no type is rare by construction.

**Upbringing never picks the type.** The upbringing is decided at adult, after the
type, and at teen it is only "on track". More importantly, a type that followed
from care misses would make the type a grade: a "scrappy" pet turning gruff is a
guilt trip. So `personality_for` reads no `care_misses`, `discipline` or
`upbringing_score`, and a test proves it. The owner's "lines shaped by upbringing"
is answered by Q2 instead: a few adult lines, positive for every grade.

**Inheritance.** The egg starts with none (`PetState.new`, as today). There is no
direct inheritance (AC fixes personality per villager, and a family of identical
pets is less fun), but the inherited trait leans like any other trait, so a
music-loving line of pets runs a little starry. Family resemblance, never a copy.
Q3 asks the owner.

**It never changes.** Not by bond, not by later traits, not by upbringing.

**Where in the code:** `model._step`, next to the adult branch that sets
`state.upbringing`:

```python
if stage in ("teen", "adult") and state.personality is None:
    state.personality = personality_for(state)
    changed["personality"] = state.personality
```

(`teen` or `adult` so a pet that somehow skips a stage still gets one.) The
`stage_changed` event carries it for the card's reveal line.

## What it changes (and what it never does)

**Changes (flavour):**

1. **Lines** (phase P2): per-type versions of the common ambient lines, picked
   alongside the normal ones (below).
2. **Idle manner** (P3): the weights of the moves `_idle` already has.
3. **How it greets people** (P2): its own hellos, with a few more unlocked at the
   existing bond levels (AC's high-friendship lines).
4. **Assist and the LLM voice** (P4): the status reply carries the type, and the
   LLM prompt says how each type sounds.
5. **Later:** pets meeting each other (with check-ins item 5).

**Never:** stats, rates, decay, calls, whining, refusals, sickness, care results,
games, wishes' rewards, bond points, trait learning, notifications, the journal's
care record. Default and only setting: flavour.

### The lines: how they're picked

Phase 5 adds `_lines(s, key, normal)` to the card for baby talk. Personality is a
second layer in the same helper, with a fixed order:

1. **Baby talk** (baby or child, the viewer's switch on): `BABY[key][stage]`.
2. **Personality** (teen or adult, a type set, a `PERSONA[type][key]` entry): one
   pick from the normal lines plus the type's lines counted twice, so about two in
   three lines are in its own voice and the familiar ones still turn up.
3. **Normal.**

The two layers can't meet: a pet with a type is a teen or adult, and baby talk is
only for babies and children. A missing entry falls through to the normal line.

**Stays normal for every type** (as phase 5 decided, for the same reasons): the
call lines and every other line that carries a decision, refusals, the `care_miss`
"...oh, there you are ♥" (never guilt, one wording for all), the weight lines,
lines carrying information (TV, music, news, weather, forecast, steps, trips),
questions and their answers, celebrations, games, notifications, Assist's spoken
sentence, the journal and the status screen's labels.

**Catchphrase and sound:** unlike baby lines, personality lines may carry both
(`_speak` with `catch: true` where the normal line does). Fit: the longest sound
plus space is 7 ("squeak "), the longest catchphrase plus space 12 (" tippy-toes",
" click click"), and `VOICE_MAX` is 60, so **every personality line is at most 40
characters**, names counted at 12 (`short()`) and the favourite food at 15
("sunflower seeds", the longest `likes` entry). Every line in the tables below was
checked against that budget and the scan that follows when this draft was written. `_speak` already drops a catchphrase
that won't fit, so a long name only costs the phrase.

**The no-nagging check**, extended from phase 5's to the `PERSONA` table: no "!!!",
no word repeated more than twice in a row, none of "still", "again", "why",
"never", "pleas", "sad", "cry", "alone", "forgot", and **no `?` at all** (none of
these lines asks for anything). Nothing about a person's body, weight, sleep or
steps.

### The lines (proposal)

`{n}` is the person's first name or nickname (inserted after the choice, as
`_greet` does now); `{food}` is the favourite snack. Keys follow phase 5's where
they exist.

**Reveal and hellos**

| Type | Reveal (`stage_changed` teen, after "I'm a teen now!") | Hello (`_greet`, named) | Hello at bond 2+ (`BOND.warm`) | Hello at bond 8+ (`BOND.hearts`) |
| --- | --- | --- | --- | --- |
| mellow | I think I'm the mellow kind ♪ | oh hey, {n}... ♪ | {n}! comfy day, huh ♥ | {n}... my favourite nap buddy ♥ |
| sweet | I think I'm the sweet kind ♥ | hi, {n}! I'm glad you're here | {n}! you made my day ♥ | {n}, I saved you a hug ♥ |
| bouncy | I think I'm the bouncy kind! | {n}!! hup hup! | {n}! best day ever! ♥ | {n}!! you're the best! ♥ |
| starry | I think I'm the starry kind ★ | {n}! you're here! ★ | hi hi, superstar {n} ★ | {n}! my front-row friend ★ |
| old soul | hm. an old soul, I think. | hello, {n}. | ah, {n}. good to see you ♥ | {n}. glad it's you ♥ |
| fancy | I think I'm the fancy kind ♥ | {n}! what a lovely surprise | {n}, darling! ♥ | {n}! you brighten the room ♥ |
| charming | I'm the charming kind, I think ♥ | ah, {n}! a delight | {n}! my dear friend ♥ | {n}, the best of company ♥ |
| plucky | I'm the plucky kind! hmph ♥ | yo, {n}! | {n}! I've got your back ♥ | {n}! my favourite partner ♥ |

The old soul is AC's cranky arc made gentle: plain and polite at first, warmer
with the bond, never cold. "my favourite" lines go only to the person looking, at
bond 8, and the card says them to no one else, so nobody is ranked in front of
anyone.

**Idle lines** (`_idle`'s mumble; never typed, never read out, as now)

| Type | Default | Bored | Excited |
| --- | --- | --- | --- |
| mellow | mmm... what's for lunch... | a nap sounds nice... | hehe! ok, nap now |
| sweet | ♪ tidy tidy ♪ | *tidies up a little* | hehe, so happy! |
| bouncy | *hops in place* | *bounces around* | wheee! hup hup! |
| starry | ♪ la la laaa ♪ | *practises a bow* | ta-da! ★ |
| old soul | hm, hm. | *watches the clouds* | heh. not bad at all. |
| fancy | *fluffs up* | *picks a pretty spot* | oh, how lovely! |
| charming | *strikes a pose* | *hums something grand* | simply splendid! |
| plucky | *stands guard* | *kicks a pebble* | hah! told you! |

(The sleepy, hungry and dirty idle lines stay normal: they're the pet's body, not
its manner.)

**Moments**

| Type | Good morning | Sunset | Good night (`fell_asleep`, house or lights) | Wish granted | Favourite snack |
| --- | --- | --- | --- | --- | --- |
| mellow | mmh... morning already... | sunset... perfect nap light | best part of the day... zzz | my wish! that's so nice ♥ | {food}... my favourite... ♥ |
| sweet | good morning! hope you slept well | the sky's all pink ♥ | sweet dreams ♥ | you remembered my wish ♥ | {food}! my favourite ♥ |
| bouncy | morning!! let's go! | the sun's racing down! | big day! night night | my wish!! yes yes! | {food}! power snack!! |
| starry | morning! a brand new show ★ | the sky's putting on a show! | and... curtain! night ★ | a wish come true! ★ | {food}! a snack for a star ★ |
| old soul | morning. the kettle's on | they don't make sunsets like this | night, now. sleep well. | well, now. thank you ♥ | ah, {food}. the good stuff |
| fancy | morning! what a pretty day | pink and gold, my colours | beauty sleep time ♥ | a wish, granted! lovely ♥ | {food}, how elegant ♥ |
| charming | good morning, sunshine! | a sunset, just for us | goodnight, dear friends ♥ | my wish! you're too kind ♥ | {food}! exquisite ♥ |
| plucky | up and at 'em! | nice sky. I'll keep watch | I'll keep watch. night ♥ | you came through! ♥ | {food}! now we're talking |

"hope you slept well" is a wish, not a question about the person's sleep (no `?`,
reads no sensor).

**Mood line** (needs phase 5's `reason_key`; `content` and `excited` only, the two
calm-and-happy moods; the needs keep their plain sentences)

| Type | `content` (today "all good") | `excited` (today "that was fun!") |
| --- | --- | --- |
| mellow | taking it easy | hehe, that was nice |
| sweet | all warm and happy | that was lovely! |
| bouncy | full of beans | that was great! |
| starry | humming a little tune | what a show! |
| old soul | all's well | heh. that was nice |
| fancy | looking my best | oh, how lovely! |
| charming | life is splendid | simply splendid! |
| plucky | all under control | hah! that was great |

The mood line is one sentence for as long as the mood lasts, so it is the type's
line (not a mix with the normal one) and chosen per pet, not per tick: the card
keys it by `reason_key` and the type. Assist keeps the plain sentence (phase 5's
test stays).

**Upbringing lines** (only if the owner says yes to Q2; adults; any type; at most
once a week per pet, at the first look of the day, after everything else in
`_firstLook`)

| Upbringing | Line |
| --- | --- |
| devoted | you always looked after me ♥ |
| steady | I turned out just right ♪ |
| scrappy | I'm a bit of a rascal, hehe ♥ |

All three are happy: "rascal" owns the extra whining (a real scrappy effect) as a
joke the pet enjoys, never as a fault.

### Idle manner (P3)

`_idle` picks from `moves` (mumble, pose, look, wander, perk, speck; hop when
excited). The type adds copies of moves it likes; the reduced-motion rule is
unchanged (with `calm`, only mumble and pose, whatever the type).

| Type | Adds | Feels like |
| --- | --- | --- |
| mellow | mumble ×2 | stays put, chats about lunch |
| sweet | nothing | as today |
| bouncy | hop ×1 even when content | bounces about |
| starry | mumble ×1, perk ×1 | sings, takes a bow |
| old soul | look ×2 | watches the world go by |
| fancy | perk ×2 | preens |
| charming | look ×1, perk ×1 | strikes poses |
| plucky | wander ×1, perk ×1 | patrols |

No new art, no new animation: only the existing moves, reweighted.

### Assist and the LLM (P4)

- `intent.py` status handler: the response data gains `"personality"` (the key, or
  none before teen). `spoken_status` (the plain spoken reply) is unchanged: it says
  how the pet is, and the type is not news.
- `llm.PROMPT`: the sentence about traits becomes "its 'traits' are habits it
  learned from the house; its 'personality' is how it talks: let it colour the
  voice lightly", plus one short voice note per type, in the prompt:

| Type | Voice note for the LLM |
| --- | --- |
| mellow | relaxed and slow, fond of snacks and naps |
| sweet | kind and warm, notices the person |
| bouncy | lively, lots of exclamation marks |
| starry | theatrical, loves a little song |
| old soul | few words, dry, quietly fond |
| fancy | delighted by pretty things |
| charming | grand words and compliments |
| plucky | tough-talking and protective, kind at heart |

The prompt's existing "never guilt, nag or worry the person" stays last.

### Pets meeting each other (later)

When visits (`plan-2026-10-28-daily-checkins.md` item 5) are built: every pair gets
along. AC's counterpart pairs become **kindred pairs** that get one extra line
when they meet ("Mochi gets me ♥"): mellow and sweet, bouncy and starry, old soul
and fancy (cranky and snooty), charming and plucky (AC's two later types, paired
here). No pair dislikes another. Planned there, not here.

## Where it shows

- **Status screen:** a row "personality: sweet" for a teen or adult, beside
  upbringing. Nothing before teen (Q6).
- **Journal:** each generation's line shows its type with its traits and upbringing.
- **`sensor.life_stage`** attribute `personality` (the key, `null` before teen),
  added to `_unrecorded_attributes` beside `catchphrase` and `favourites`: no trace
  in HA's history unless the owner records it on purpose (the "history is opt-in"
  rule). The sensor's state doesn't change.
- **Diagnostics:** `personality`, beside `upbringing` (it's the pet's, not a
  person's).
- **The guide:** a "Personality" bullet in "How the pet works", after Upbringing;
  the README's feature list one line.
- **Not:** notifications (the teen stage isn't notified today, and stays so), the
  welcome, events beyond `stage_changed`'s field, flair or art.

## Saves and migration

- `PetState.personality: str | None = None`; `PERSONALITIES` tuple in `model.py`.
- `PetState.from_dict`: an unknown or non-string value becomes `None` (as
  `upbringing` is validated today). Then, like the upbringing backfill: **a teen or
  adult loaded without one gets `personality_for(state)`** at load. It reads the
  pet's current traits (not the ones it had at 120 h); that's the best record
  there is, and it's deterministic, so every load gives the same answer.
- Migrated pets get no reveal line (no event fires from a load); the status row and
  attribute just appear. The release notes say so (Q9).
- `lay_egg`: the journal record gains `"personality"`; the egg starts with `None`.
  Older journal records have no key; the card shows nothing for them.
- **Determinism:** the same pet (same `born`, same traits) always settles the same
  type, in `_step`, in `from_dict`, in fast-forward and across restarts. Nothing
  draws from the shared rng, so no existing seeded test moves.

## Tests (`scripts/test`, pytest + ruff)

P1:
- No type for an egg, baby or child; a type at the step that crosses into teen,
  and `stage_changed` carries it.
- `personality_for` is deterministic (same state, same type) and in `PERSONALITIES`.
- A seeded run of the existing scenarios gives the same species, temperament and
  sickness draws as before (the shared rng is untouched).
- **Flavour only:** two copies of one pet with different types, advanced seven days
  through the same house, end with identical stats, calls, care log and traits.
- **Not a grade:** `personality_for` gives the same type for a pet with 0 and with
  10 care misses, and with 0 and 100 discipline.
- Every type is reachable (a sweep over `born` values gives all eight); with no
  traits the spread is roughly even; a ★★★ trait shifts it toward its leanings.
- `from_dict`: a bad value is dropped; a teen or adult without one is backfilled
  with the same type on every load; a baby stays `None`.
- `lay_egg`: the record has the type; the egg has none.
- Sensor attribute present and unrecorded; diagnostics include it.

P4: the status intent's data carries `personality`; `spoken_status` is unchanged;
the LLM prompt names the types.

## Card checks (`scripts/card-check`, Playwright against the dev HA)

P1: the status row (teen and adult; absent for a baby), the journal line, an old
record without a type.
P2:
- A `PERSONA` table lint: all eight types, every key, at most 40 characters with
  `{n}` at 12, the banned-word and no-`?` scan.
- Precedence: a baby with baby talk on gets the `BABY` line; a teen with a type gets
  a pool that includes its own lines; a pet with no type gets only normal lines.
- The reveal line follows "I'm a teen now!" (`hush()` for the sound, `bubble()` to
  wait for typing, `sayUntil` held, as the handoff's tips say).
- The mood line swaps by `reason_key` for `content`, and stays plain for `hungry`.
P3: with `Math.random` stubbed, a bouncy pet's move list contains a hop while
content; with reduced motion, only mumble and pose for every type.

**What the builder can verify:** the server rules fully in pytest; the card's table,
lookup order, reveal and status row in card-check with screenshots. **What they
can't:** how the lines feel over days on a real dashboard, or whether the
distribution feels right in a real house (only the owner's house can say). Dev pets
drift after many card-check runs; reset them as the handoff says before P1's
checks.

## Phases (each its own PR, audited before and after building)

| Phase | What | Size | Needs | Done when |
| --- | --- | --- | --- | --- |
| **P1. The type** | `PetState.personality`, `PERSONALITIES`, `personality_for`, `_step` at teen, `from_dict` validation and backfill, `lay_egg` record, sensor attribute (unrecorded), diagnostics, status row, journal, guide | M | nothing (can build any time; the handoff's order puts it after phases 5 and 6) | pytest green with the P1 tests; card-check green with the status and journal checks; screenshots of both |
| **P2. Its voice** | `PERSONA` table, the personality layer in `_lines`, the reveal line, hellos with bond lines, idle lines, moments, the `content`/`excited` mood line; upbringing lines if Q2 is yes | M | P1, and phase 5 merged (`_lines`, `reason_key`) | the lint, precedence, reveal and mood checks green; screenshots of a few types side by side |
| **P3. Its manner** | per-type move weights in `_idle` | S | P1 | the stubbed-random and reduced-motion checks green |
| **P4. Assist** | `personality` in the status intent's data, the LLM prompt's voice notes | S | P1 | P4 pytest green |
| Later | Kindred pairs when pets visit each other | with item 5 | visits built | planned with item 5 |

P3 and P4 are small enough to ride with P2 if the owner prefers fewer releases
(Q10).

## Open questions for the owner (each with a recommendation)

1. **When is it settled?** At hatching, at teen, or at adult. *Recommended: teen.*
   Babies keep baby talk, traits have five days to nudge it, and adults (two weeks)
   are a long wait to meet it.
2. **"Shaped by upbringing":** should the upbringing play a part? *Recommended:
   never in the choice of type (a type from care misses is a grade), but yes to the
   three adult upbringing lines above, all happy, at most weekly.*
3. **Inherited across generations?** *Recommended: no direct inheritance; the
   inherited trait's leaning gives a family resemblance on its own.*
4. **The names:** mellow, sweet, bouncy, starry, old soul, fancy, charming, plucky.
   *Recommended as listed; any can be swapped (the key stays the same if a name
   changes after P1).*
5. **Can a person pick or change it?** *Recommended: no. It's a surprise, like the
   egg, and fixed, as in AC.* (If yes later: a select like `next_egg`, before teen.)
6. **Shown before teen?** *Recommended: nothing, so the reveal is a moment.*
   Alternative: "finding its way ♥" on the status screen.
7. **A per-type leaning in the daily wish** (The Sims' wants: a starry pet wishes
   for music a little more often)? *Recommended: not now.* It changes the shared rng's
   draws (seeded tests move), and wishes already vary well.
8. **Assist saying the type out loud** in the plain spoken reply? *Recommended: no;
   data and LLM voice only.*
9. **Existing teens and adults** get a type at the update, silently? *Recommended:
   yes, silently, with a line in the release notes.* Alternative: a one-time reveal
   at the next look (needs a "revealed" flag).
10. **Release shape:** P2-P4 in one release or three? *Recommended: P1 alone (it
    changes the save), then P2 with P3 and P4.*
11. **The lines:** all of them are a proposal. *Recommended: the owner marks the
    ones to change; the builder doesn't improvise new ones.*
