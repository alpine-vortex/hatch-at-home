# Personality types, 2026-10-28 (plan; DRAFT 2)

The owner's starting point (`plan-2026-10-28-voices-and-lines.md`, "Related"):
**"Personality types (AC's eight, made gentle, independent of the creature; lines
shaped by upbringing and traits)."** Touchstones: Animal Crossing's villager
personalities and The Sims' traits, emotions and wants.

Draft 1 was written for an adversarial audit by a separate scout. **Draft 2** folds
in that audit (18 findings) and the owner's answers of 2026-10-28; the table at the
end ("The audit of draft 1") wins where it differs from the sections above. Docs
only: nothing here is built. **Every line in this file is a proposal for the owner, not approved
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

- **Traits**: adult Sims have three personality traits and younger Sims fewer (per
  the cited source; not checked further); an aspiration adds one more. Traits shape behaviour and emotions. A 2021 update added
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
| AC | Personality separate from hobbies | **Borrow, loosely.** Our traits sit where hobbies sit (what the pet is into), but unlike AC's one fixed hobby they are learned, deepen, and a pet holds up to four (`TRAIT_CAP`); the type is the voice |
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
| Sims | Wants | **Already built** as the daily wish; no per-type leaning (decided, Q7) |

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

## The eight types (names decided, Q4)

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
| `breeze_rider` | plucky, fancy (a breeze ruffles feathers) |
| `fog_wanderer` | old soul, mellow |
| `thunder_heart` | plucky, charming |

Each type is leaned toward by exactly four traits (16 traits × 2 leanings = 32; draft
1 had bouncy at five and fancy at three, so `breeze_rider` moved from bouncy to
fancy), and a test checks every type has the same count. **An equal count is not an
equal share:** a type's routes are only as common as its traits, and fancy's (sun,
full moon, snow, wind) depend on weather and sky entities a house may not have. In a
quiet house all eight are equally likely; in a house with weather, the spread follows
the weather. That is accepted: the type is a nudge, not a quota.

**Upbringing never picks the type.** The upbringing is decided at adult, after the
type, and at teen it is only "on track". More importantly, a type that followed
from care misses would make the type a grade: a "scrappy" pet turning gruff is a
guilt trip. So `personality_for` reads no `care_misses`, `discipline` or
`upbringing_score`, and a test proves it. The owner's "lines shaped by upbringing"
is answered by three adult upbringing lines instead, all happy (decided, Q2).

**Inheritance.** The egg starts with none (`PetState.new`, as today). There is no
direct inheritance (AC fixes personality per villager, and a family of identical
pets is less fun), but the inherited trait leans like any other trait, so a
music-loving line of pets runs a little starry. Family resemblance, never a copy
(decided, Q3).

**It never changes once saved.** Not by bond, not by later traits, not by
upbringing. Same inputs (same `born`, same traits and levels) always give the same
type; but the inputs depend on *when* it is picked (below, "Determinism").

**Where in the code:** `model._step`, next to the adult branch that sets
`state.upbringing`:

```python
if stage in ("teen", "adult") and state.personality is None:
    state.personality = personality_for(state)
    changed["personality"] = state.personality
```

(`teen` or `adult` so a pet that somehow skips a stage still gets one.) This block
runs in the stage-change part of `_step`, **before** that step's `_learn`, so the
pick reads the traits the pet had at the start of the step that crossed 120 h. The
`stage_changed` event carries it for the card's reveal line. It goes out on the HA
bus with every other event field (`coordinator._fire`), which is fine: the bus is
not history, and `notify` keys off `upbringing`, so a teen still sends nothing.

## What it changes (and what it never does)

**Changes (flavour):**

1. **Lines** (P2a and P2b): per-type versions of the common ambient lines, picked
   alongside the normal ones (below).
2. **Idle manner** (P3): the weights of the moves `_idle` already has.
3. **How it greets people** (P2a): its own hellos, with a few more unlocked at the
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
2. **Personality** (teen or adult, a type set, a `PERSONA[type][key]` entry):
   **the half rule.** A fair coin first: heads, one of the type's 2-3 lines for that
   key; tails, today's normal pick, unchanged. So **a type's voice is about half of
   the lines at every key, whatever the number of normal lines**, and the familiar
   ones still turn up. (Draft 1's "counted twice" gave 2/(N+2): 40% for sunset or
   `wish_granted`, 22-40% for `_greet`, all from one repeated line.)
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
(`_speak` with `catch: true` where the normal line does). Phase 5's call site forces
`catch: false` when `_lines` swapped the line; **that forcing is for the baby layer
only**, or persona lines would lose the catchphrase too. Fit: the longest sound plus
space is 7 ("squeak "), the longest catchphrase plus space 12 (" tippy-toes",
" click click"), and `VOICE_MAX` is 60, so **every personality line is at most 40
characters**, names counted at **16** (what `_greet` does: `short(first, 16)`;
`short()`'s own default is 30, and the pet's nicknames are at most 9, "starlight")
and the favourite food at 15 ("sunflower seeds", the longest `likes` entry). Every line in the tables below was
checked against that budget and the scan that follows when this draft was written. `_speak` already drops a catchphrase
that won't fit, so a long name only costs the phrase.

**The no-nagging check**, extended from phase 5's to the `PERSONA` table: no "!!!",
no word repeated more than twice in a row, none of "still", "again", "why",
"never", "pleas", "sad", "cry", "alone", "forgot", and **no `?` at all** (none of
these lines asks for anything). Nothing about a person's body, looks, weight, sleep
or steps. No sarcasm or I-told-you-so. **Wish lines never credit a person** (a wish
can be granted by the weather or the TV, and "you remembered" turns a missed wish
into a duty). **Hellos never rank a person:** no "favourite" or "best" aimed at
someone (two people at bond 8 would both hear it), and no time-of-day words
(`_greet` fires at any hour).

### How the hellos are built

`_greet` today builds its `lines` array with `first` already interpolated into each
template, then calls `pick(lines)` once (card:2344-2350). The persona hellos follow
the same shape: the type's templates are filled with `first` and put in a second
array, and the half rule picks between that array and today's `lines`. The gates:

- **Named hellos** need `first` non-null (a signed-in person, not a shared screen).
- **Bond lines** (2+ and 8+) join the type's array only when **`_bond(s)` is
  non-null** and its level is high enough. Never gate on `level` alone: `level` is
  `bond?.level || 0`, which is safe today only by accident.
- **Shared screen** (`sharedScreen()`, `first` null, `_bond` null): the type's
  nameless hellos, half the time, against today's "morning!/hi!/evening!" and
  "hi hi!". No name, no bond line, ever. (`_greet` returns early when there's no
  name and no shared screen, so the nameless lines run only on a shared screen.)
- Nicknames stay where they are, in today's array.

### The lines (proposal)

Every line is **a proposal for the owner**: 2-3 per type per moment (owner,
2026-10-28), 307 lines in all (the three upbringing lines are one each, as decided).
`{n}` is the person's first name, capped at 16 as `_greet` does, or their nickname;
`{food}` is the favourite snack. Keys follow phase 5's where they exist. All of them
pass the scan above (checked by script: longest 40 characters with `{n}` at 16 and
`{food}` at 15; no `?`, no banned word, no triple word, no person-credit in the wish
lines, no superlative or time word in the hellos).

**Reveal (`stage_changed` teen, queued after "I'm a teen now!")** (`reveal`)

| Type | Line 1 | Line 2 |
| --- | --- | --- |
| mellow | I think I'm the mellow kind ♪ | mellow, that's me... ♪ |
| sweet | I think I'm the sweet kind ♥ | sweet, that's me ♥ |
| bouncy | I think I'm the bouncy kind! | bouncy! that's me! hup! |
| starry | I think I'm the starry kind ★ | a star is born! that's me ★ |
| old soul | hm. an old soul, I think. | an old soul. suits me. |
| fancy | I think I'm the fancy kind ♥ | fancy, that's me. how lovely ♥ |
| charming | I'm the charming kind, I think ♥ | charming, that's me ♥ |
| plucky | I'm the plucky kind! hmph ♥ | plucky, that's me! ♥ |

**Hello, named (`_greet`, `first` non-null)** (`hello`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | oh hey, {n}... ♪ | {n}... hi hi ♥ | mm, {n}! comfy day ♪ |
| sweet | hi, {n}! glad you're here ♥ | hello hello, {n} ♥ | {n}! hi! ♥ |
| bouncy | {n}!! hup hup! | {n}! let's go! ♥ | hiya, {n}! *bounce* |
| starry | {n}! you're here! ★ | ah, {n}! my audience ★ | {n}! cue the music ★ |
| old soul | hello, {n}. | hello there, {n}. | {n}. come in, come in. |
| fancy | {n}! what a lovely surprise | oh, {n}! how lovely ♥ | {n}! welcome, welcome ♥ |
| charming | ah, {n}! a delight | {n}! what an honour ♥ | {n}! the room lights up |
| plucky | yo, {n}! | hey, {n}! all clear here | {n}! reporting for duty |

**Hello, shared screen (no name, no bond; `first` null and `shared`)** (`hello_shared`)

| Type | Line 1 | Line 2 |
| --- | --- | --- |
| mellow | oh hey, everyone... ♪ | mm... hi, all ♥ |
| sweet | hi, everyone! ♥ | hello, hello ♥ |
| bouncy | hiya, everyone! hup! | hup hup! hi! |
| starry | hello, everyone! ★ | welcome, welcome! ★ |
| old soul | hello, all. | hm. hello there. |
| fancy | oh, how lovely! hello ♥ | welcome, darlings ♥ |
| charming | ah, everyone! a delight ♥ | welcome, dear friends ♥ |
| plucky | yo, everyone! | hey hey! all clear here |

**Hello at bond 2+ (`_bond(s)` non-null, level >= `BOND.warm`)** (`hello_warm`)

| Type | Line 1 | Line 2 |
| --- | --- | --- |
| mellow | {n}! comfy day, huh ♥ | {n}... come sit a while ♥ |
| sweet | {n}! you made my day ♥ | {n}! I'm so glad you came ♥ |
| bouncy | {n}! yay yay! ♥ | {n}! I'm all bouncy now ♥ |
| starry | hi hi, superstar {n} ★ | {n}! take a bow with me ★ |
| old soul | ah, {n}. good to see you ♥ | {n}. sit, sit. ♥ |
| fancy | {n}, darling! ♥ | {n}! come see my corner ♥ |
| charming | {n}! my dear friend ♥ | {n}! what a treat ♥ |
| plucky | {n}! I've got your back ♥ | {n}! you and me, team ♥ |

**Hello at bond 8+ (`_bond(s)` non-null, level >= `BOND.hearts`)** (`hello_hearts`)

| Type | Line 1 | Line 2 |
| --- | --- | --- |
| mellow | {n}... come nap with me ♥ | {n}, my nap buddy ♥ |
| sweet | {n}, I saved you a hug ♥ | {n}! you feel like home ♥ |
| bouncy | {n}!! my heart's hopping! ♥ | {n}! my hup-hup pal ♥ |
| starry | {n}! my front-row friend ★ | {n}! my stage lights up ★ |
| old soul | {n}. glad it's you ♥ | ah, {n}. my old friend ♥ |
| fancy | {n}! you brighten my day ♥ | {n}! darling, it's you ♥ |
| charming | {n}, my dear, dear friend ♥ | {n}! how grand, it's you ♥ |
| plucky | {n}! my partner ♥ | {n}! partners for life ♥ |

**Idle, default (`_idle`'s mumble)** (`idle`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | mmm... what's for lunch... | *yawns* | la... la... ♪ |
| sweet | ♪ tidy tidy ♪ | *smooths its corner* | hmm hmm ♪ |
| bouncy | *hops in place* | hup! hup! | *jogs on the spot* |
| starry | ♪ la la laaa ♪ | *hums a tune* | *twirls* |
| old soul | hm, hm. | *settles in* | in my day... hm. |
| fancy | *fluffs up* | *admires its reflection* | la la, lovely ♪ |
| charming | *strikes a pose* | *bows to no one* | splendid, splendid ♪ |
| plucky | *stands guard* | *looks around, alert* | all clear ♪ |

**Idle, bored** (`idle_bored`)

| Type | Line 1 | Line 2 |
| --- | --- | --- |
| mellow | a nap sounds nice... | *stretches out* |
| sweet | *tidies up a little* | *hums softly* |
| bouncy | *bounces around* | *does a little spin* |
| starry | *practises a bow* | *sings to itself* |
| old soul | *watches the clouds* | *sits quietly* |
| fancy | *picks a pretty spot* | *rearranges a ribbon* |
| charming | *hums something grand* | *practises a grand bow* |
| plucky | *kicks a pebble* | *paces a little* |

**Idle, excited** (`idle_excited`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | hehe! ok, nap now | mm! that was fun ♪ | hehe, nice ♥ |
| sweet | hehe, so happy! | yay! ♥ | that was lovely ♥ |
| bouncy | wheee! hup hup! | woo! yes! | *bounce bounce* |
| starry | ta-da! ★ | what a show! ★ | ♪ tra la la! ♪ |
| old soul | heh. not bad at all. | heh. well, well. | ha. that was fun. |
| fancy | oh, how lovely! | divine! ♥ | *twirls prettily* |
| charming | simply splendid! | marvellous! ♥ | what an occasion! |
| plucky | hah! nailed it! | yes! heck yes! | hah! go team! |

**Good morning** (`good_morning`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | mmh... morning already... | five more minutes... ♪ | morning... slow and easy |
| sweet | good morning! hope you slept well | morning! ♥ a fresh new day | morning! I tidied up ♥ |
| bouncy | morning!! let's go! | up and hopping! | morning! ready, set, go! |
| starry | morning! a brand new show ★ | rise and shine! ★ | morning! ♪ la la ♪ |
| old soul | morning. the kettle's on | morning. a fine day for it | hm. morning, then. |
| fancy | morning! what a pretty day | morning! time to fluff up ♥ | good morning, darling ♥ |
| charming | good morning, sunshine! | a splendid morning to you | morning! what an occasion |
| plucky | up and at 'em! | morning! all clear | rise and shine, team! |

**Sunset** (`sunset`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | sunset... perfect nap light | mm, warm and orange... | a lazy sky tonight ♪ |
| sweet | the sky's all pink ♥ | what a soft sky ♥ | sunset already, how nice |
| bouncy | the sun's racing down! | zoom, there goes the sun! | the sky's going orange! |
| starry | the sky's putting on a show! | what a finale! ★ | bravo, sky! bravo! ★ |
| old soul | they don't make sunsets like this | a fine sunset, that. | hm. lovely, that sky. |
| fancy | pink and gold, my colours | what a pretty sky ♥ | ooh, so elegant tonight |
| charming | a sunset, just for us | how grand, this sky ♥ | a splendid sunset ♥ |
| plucky | nice sky. I'll keep watch | sun's down. all quiet | not bad, sky. not bad |

**Good night (`fell_asleep`, house or lights)** (`fell_asleep`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | best part of the day... zzz | comfy... zzz | night... ♪ zzz |
| sweet | sweet dreams ♥ | night night ♥ | all tucked in ♥ |
| bouncy | big day! night night | phew! night night | all hopped out... zzz |
| starry | and... curtain! night ★ | that's a wrap! night ★ | lights down... zzz ★ |
| old soul | night, now. sleep well. | off to bed. night. | a good day. night ♥ |
| fancy | beauty sleep time ♥ | night night, darlings ♥ | off to my silk pillow ♥ |
| charming | goodnight, dear friends ♥ | until tomorrow, friends ♥ | a splendid day. night ♥ |
| plucky | I'll keep watch. night ♥ | night, team ♥ | all safe. sleep tight ♥ |

**Wish granted (credits nobody)** (`wish_granted`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | my wish! that's so nice ♥ | mm, my wish came true ♥ | a wish come true... nice ♪ |
| sweet | my wish came true ♥ | a wish come true! ♥ | my wish! so happy ♥ |
| bouncy | my wish!! yes yes! | wish come true! woo! | my wish! hup hup! ♥ |
| starry | a wish come true! ★ | my wish! encore! ★ | dreams do come true ★ |
| old soul | well, now. a wish come true ♥ | hm. my wish. how nice ♥ | well. that's a fine thing ♥ |
| fancy | a wish, granted! lovely ♥ | my wish! how divine ♥ | a wish come true, darling ♥ |
| charming | my wish! how splendid ♥ | a wish come true! grand ♥ | what a marvellous wish ♥ |
| plucky | my wish! heck yes! ♥ | a wish come true! hah ♥ | wish granted! nice ♥ |

**Favourite snack** (`favourite_snack`)

| Type | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| mellow | {food}... my favourite... ♥ | mm, {food}... yum ♥ | {food}! snack time ♪ |
| sweet | {food}! my favourite ♥ | ooh, {food}! ♥ | {food}! yum yum ♥ |
| bouncy | {food}! power snack!! | {food}! yes! | {food}! hup hup! |
| starry | {food}! a snack for a star ★ | {food}! bravo! ★ | ooh, {food}! ★ |
| old soul | ah, {food}. the good stuff | {food}. now that's proper | hm. {food}. very nice |
| fancy | {food}, how elegant ♥ | {food}! simply divine ♥ | ooh, {food}! fancy ♥ |
| charming | {food}! exquisite ♥ | ah, {food}! splendid ♥ | {food}, what a treat ♥ |
| plucky | {food}! now we're talking | {food}! that's the stuff | {food}! fuel up ♥ |

**Mood line, `content` (today "all good")** (`mood_content`)

| Type | Line 1 | Line 2 |
| --- | --- | --- |
| mellow | taking it easy | comfy and calm |
| sweet | all warm and happy | nice and homey ♥ |
| bouncy | full of beans | ready for anything |
| starry | humming a little tune | ready for my close-up ★ |
| old soul | all's well | a fine day |
| fancy | looking my best | all pretty and calm ♥ |
| charming | life is splendid | all quite marvellous |
| plucky | all under control | all clear here |

**Mood line, `excited` (today "that was fun!")** (`mood_excited`)

| Type | Line 1 | Line 2 |
| --- | --- | --- |
| mellow | hehe, that was nice | mm, that was fun |
| sweet | that was lovely! | hehe, that was fun ♥ |
| bouncy | that was great! | woo! so much fun! |
| starry | what a show! | bravo! that was fun ★ |
| old soul | heh. that was nice | well, that was fun |
| fancy | oh, how lovely! | that was divine ♥ |
| charming | simply splendid! | what a marvellous time |
| plucky | hah! that was great | heck yes, that was fun |

**Upbringing lines** (adults, any type; at most weekly)

| Upbringing | Line |
| --- | --- |
| devoted | you always looked after me ♥ |
| steady | I turned out just right ♪ |
| scrappy | I'm a bit of a rascal, hehe ♥ |


Notes on the lines:

- **Reveal:** one line per teen pet, so two lines per type is plenty. Today
  `stage_changed` says "I'm a teen now!" through `say()` in one bubble
  (card:2584-2590); the reveal is a second bubble, **`_queue(s, line, 4500,
  {catch: true})` right after it**, as `wish_granted` and `favourite_snack` already
  queue, so neither line is lost.
- **Bond 8:** warm, never superlative. Only old soul says "glad it's you ♥"; the
  owner asked for the others to vary (2026-10-28). The owner approved the lines on
  2026-10-28, with sweet's "hope you slept well" and the "sleep well" / "sleep tight"
  good-night lines kept.
- **Wish granted:** today's normal pool includes "my wish came true! thank you ♥",
  which still shows on the other half of the coin. It thanks nobody in particular,
  so it is left as it is; the owner may want to look at it.
- **Good morning:** "hope you slept well" is a wish, not a question about the
  person's sleep (no `?`, reads no sensor).
- **Idle:** the sleepy, hungry and dirty idle lines stay normal: they're the pet's
  body, not its manner.
- **Mood line** (P2b): only for the `content` and `excited` reason keys (the two
  calm-and-happy moods; the needs keep their plain sentences). **Accepted as rare**
  (first-mate default): `current_mood` replaces content/cozy/excited/sleepy/bored
  with the house's sentence (`home_<flag>`) whenever the house adds something, and
  the weight band overrides that, so these lines show only when the house is quiet
  ("all good") or just after a game ("that was fun!"). The mood line is one sentence
  for as long as the mood lasts, so its pick is **deterministic, never
  `Math.random`**: a hash of the pet's `born`, the `reason_key` and the local date,
  modulo 4: 0 or 1 the normal sentence, 2 or 3 one of the type's two lines. Half the
  days, same sentence all day. Assist keeps the plain sentence (phase 5's test stays).
- **Upbringing lines** (their own small PR): adults, any type, at most once a week
  per pet, at the first look of the day, after everything else in `_firstLook`. All
  are happy: "rascal" owns the extra whining (a real scrappy effect) as a joke the
  pet enjoys, never as a fault.

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
  none before teen). `spoken_status` (the plain spoken reply) is unchanged (decided,
  Q8). It already reads the traits out ("Traits: ..."); the type stays out because
  it is the pet's *voice*, which the LLM shows by talking in it, not a fact to
  recite.
- `PROMPT` goes through `.format(names=...)` (llm.py:69), so the added notes must
  contain no braces; a test checks the formatted prompt has no `{`.
- `llm.PROMPT`: the sentence about traits becomes "its 'traits' are habits it
  learned from the house; its 'personality' is how it talks: let it colour the
  voice lightly", plus one short voice note per type, in the prompt:

| Type | Voice note for the LLM |
| --- | --- |
| mellow | relaxed and slow, fond of snacks and naps |
| sweet | kind and warm, notices the person |
| bouncy | lively and cheerful |
| starry | theatrical, loves a little song |
| old soul | few words, warm underneath |
| fancy | delighted by pretty things |
| charming | grand words and compliments |
| plucky | protective and cheerful |

The notes are softened from draft 1 ("lots of exclamation marks", "dry",
"tough-talking" invited a model to roast or be sarcastic). The prompt's existing
"never guilt, nag or worry the person" stays last.

### Pets meeting each other (later)

When visits (`plan-2026-10-28-daily-checkins.md` item 5) are built: every pair gets
along. AC's counterpart pairs become **kindred pairs** that get one extra line
when they meet (written with item 5, not here): mellow and sweet, bouncy and starry, old soul
and fancy (cranky and snooty), charming and plucky (AC's two later types, paired
here). No pair dislikes another. Planned there, not here.

## Where it shows

- **Status screen:** a row "personality: sweet" for a teen or adult, beside
  upbringing. Nothing before teen (decided, Q6).
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
  attribute just appear, quietly (decided, Q9). The backfill runs only when the key
  is absent or bad, and the result is saved at the next store write, so it is
  settled from then on. A pet loaded mid-teen takes the same branch. Older journal
  records (earlier generations) have no key and need none.
- **P1 ships alone** (decided, Q10), so for one release the status row shows a type
  with no lines behind it. The P1 release note says so: "your teen and adult pets
  now have a personality; how it talks comes in the next update".
- `lay_egg`: the journal record gains `"personality"`; the egg starts with `None`.
  Older journal records have no key; the card shows nothing for them.
- **Determinism:** same inputs, same type: `personality_for` on the same `born`,
  traits and levels gives the same answer in `_step`, in `from_dict`, in
  fast-forward and across restarts, and nothing draws from the shared rng
  (`Random(f"personality-{born}")`; `_step`'s rng is untouched). But it is **not**
  "same pet, same type" in every history: a pet that crossed 120 h live is picked
  with the traits it had then (before that step's `_learn`); one backfilled later
  is picked with its current traits. And a downgrade then upgrade drops the field
  (`from_dict` keeps only known keys, model.py:152-155) and re-backfills from later
  traits. Both are accepted: rare, harmless (flavour only), and saved once picked.

## Tests (`scripts/test`, pytest + ruff)

P1:
- No type for an egg, baby or child; a type at the step that crosses into teen,
  and `stage_changed` carries it.
- `personality_for` is deterministic (same state, same type) and in `PERSONALITIES`.
- Every type has the same number of leaning traits (four).
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
- Sensor attribute present and unrecorded (`test_init.py:839` is the model);
  diagnostics include it.
- **Before writing P1's tests**, run `scripts/test` on the P1 code and list what
  fails in the PR. The rng claim holds, but tests that compare whole `to_dict()`
  output or build pets at `age_hours=400` (test_model.py:909-933) may now meet the
  new field; each failure is either expected (the field) or a bug.

P4: the status intent's data carries `personality`; `spoken_status` is unchanged;
the LLM prompt names the types; the formatted prompt contains no `{`.

## Card checks (`scripts/card-check`, Playwright against the dev HA)

**Getting a teen, an adult and an old record into the check.** `scripts/card-check`
can't advance time, and the dev pets are babies or whatever they drifted to. The
checks **stub the sensor attributes in-page** (`stage`, `personality`, the journal
list), as phase 5's checks inject stage and mood; the alternative, editing
`dev/config/.storage/virtual_pet.0*` with HA stopped (HANDOFF, "Dev pets drift"),
is for a manual look only. The reveal can't be checked live (nothing crosses 120 h
in a check): it is checked with a **synthetic `stage_changed` moment** fed to
`_moment`.

P1: the status row (teen and adult; absent for a baby), the journal line, an old
record without a type.
P2a:
- A `PERSONA` table lint: all eight types, every key, 2-3 lines each, at most 40
  characters with `{n}` at 16 and `{food}` at 15, the banned-word, no-`?`,
  no-triple-word scan, no "thank"/"you remembered"/"too kind" in `wish_granted`,
  no "favourite"/"best" or time word in the hellos.
- Precedence: a baby with baby talk on gets the `BABY` line; a teen with a type gets
  a pool that includes its own lines; a pet with no type gets only normal lines.
- The half rule: with `Math.random` stubbed below and above 0.5, a teen gets the
  type's line and the normal line.
- **Shared screen:** with `sharedScreen()` true, the hello has no name and is never
  a bond line, for every type; signed in at bond 0, no bond line; at bond 8, a bond
  line can appear.
- The reveal: a synthetic `stage_changed` (teen) shows "I'm a teen now!" and then
  the type's reveal line; neither is lost (`hush()` for the sound, `bubble()` to
  wait for typing, `sayUntil` held, as the handoff's tips say).
P2b:
- The mood line swaps by `reason_key` for `content`, stays plain for `hungry` and
  for a `home_*` key, and **doesn't flicker**: across many ticks on one day it is
  the same sentence.
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
| **P2a. Its voice** | `PERSONA` table, the personality layer in `_lines` (the half rule), the reveal line, hellos (named, shared-screen, bond lines), the five moments. Card only | M | P1, and phase 5's `_lines` merged | the lint, precedence, half-rule, shared-screen and reveal checks green; screenshots of a few types side by side |
| **P2b. Idle and mood lines** | the idle lines in `_idle`'s mumble, the `content`/`excited` mood line keyed by `reason_key` | S | P2a, and phase 5's `reason_key` merged | the mood checks (swap, plain, no flicker) green |
| **Upbringing lines** | the three upbringings' lines at the first look, at most weekly | S | P1 | a check that an adult gets one at most once a week, and a baby never |
| **P3. Its manner** | per-type move weights in `_idle` | S | P1 | the stubbed-random and reduced-motion checks green |
| **P4. Assist** | `personality` in the status intent's data, the LLM prompt's voice notes | S | P1 | P4 pytest green |
| Later | Kindred pairs when pets visit each other | with item 5 | visits built | planned with item 5 |

**PRs vs releases** (decided, Q10): each row above is its own PR. Releases: P1
alone (it changes the save), then the rest together or as they're ready.

**Acceptance, every phase:** pytest and card-check green with the phase's checks;
an old card with a new server ignores the new attribute (nothing reads it), and a
new card with an old server (no `personality`) shows normal lines and no status
row; `manifest.json`/`hacs.json` version bumped last; a status label that needs
translation goes in `strings.json` and `translations/`; the lines are only those
the owner approved in this file (the builder never improvises, Q11).

## Decided (2026-10-28) and still open

The plan's own eleven questions: **the owner accepted every recommendation as
drafted.** Recorded as decided:

| # | Question | Decided |
| --- | --- | --- |
| 1 | When is it settled? | At teen |
| 2 | "Shaped by upbringing" | Upbringing never picks the type; yes to the three happy adult upbringing lines, at most weekly |
| 3 | Inherited? | No; the inherited trait's leaning gives the family resemblance |
| 4 | The names | mellow, sweet, bouncy, starry, old soul, fancy, charming, plucky |
| 5 | Pick or change it? | No: a surprise, fixed |
| 6 | Shown before teen? | Nothing, so the reveal is a moment |
| 7 | Per-type wish leaning? | No |
| 8 | Assist says it aloud? | No; data and LLM voice only |
| 9 | Existing teens and adults | Backfilled quietly, with a release note |
| 10 | Release shape | P1 alone, then the rest |
| 11 | The lines | The owner marks the ones to change; the builder never improvises |

The owner's answers to the audit's questions:

- **Lines per moment:** 2-3 per type per moment, and the share fixed so a type's
  voice shows about half the time (the half rule).
- **Shared screen:** yes, nameless type hellos; bond lines only for a signed-in
  person (`_bond` non-null); a card check.
- **Wish lines never credit a person** ("my wish came true ♥" style); plucky's
  "told you!" is gone.

First-mate defaults, recorded as decided (the owner may overrule): the mood line is
limited to the `content` and `excited` keys and accepted as rare; P2 splits into
P2a (hellos, reveal, moments; card only) and P2b (idle lines, mood line); the
upbringing lines are their own small PR; fancy gets a fourth leaning
(`breeze_rider`) and a test keeps the counts equal; names are capped at 16 as
`_greet` does; the LLM voice notes are softened; bond-8 lines are warm and never
superlative ("glad it's you ♥").

**Still for the owner: the lines.** All 307 are in "The lines (proposal)". Mark
the ones to change.

## The audit of draft 1 (18 findings) and what changed

This table wins where it differs from the sections above. Every finding was
checked against the code before it was folded in. All 18 held; the small
corrections are in their rows, and none was rejected.

| # | Finding | Change |
| --- | --- | --- |
| 1 | Shared screen unhandled: `_greet` drops the name there and `_bond()` returns null (card:2326-2376); every hello used `{n}`. Verified | **Owner:** nameless type hellos on a shared screen (a table of their own); bond lines need `_bond(s)` non-null, never `level` alone; a card check (no name, no bond line). "How the hellos are built" |
| 2 | "Two in three" was false: 2/(N+2), 22-40%, and one repeated line per cell. Verified (sunset 3 lines, `wish_granted` 3, `_greet` 3-7) | **Owner:** 2-3 lines per type per moment. **The half rule:** a fair coin, the type's lines or today's normal pick, so about half at every key. A card check stubs the coin |
| 3 | "No existing seeded tests change" only half-checked. Verified: the rng claim holds; whole-`to_dict()` tests and `age_hours=400` pets (test_model.py:909-933; the audit's 932 is 933) may meet the new field | The absolute claim is gone; P1 runs `scripts/test` before writing its tests and lists the fallout |
| 4 | "Four traits each" was false: bouncy 5, fancy 3. Verified by counting the table | `breeze_rider` moves to fancy (4 each); a test checks equal counts. The "not rare" claim is reworded: equal counts aren't equal shares, and fancy's routes follow the weather |
| 5 | Determinism overreached: the `_step` pick is before that step's `_learn`; backfill uses current traits; a downgrade drops the field. Verified (model.py:152-155, 395-412) | "Same inputs, same type"; the live/backfill difference and the downgrade case are stated and accepted; backfill only when the key is absent or bad, then saved |
| 6 | Backfill is silent and P1 alone shows a row with no lines | **Owner:** backfilled quietly, with a release note; the note says the lines come next |
| 7 | P2 too big for one PR | **First-mate default:** P2a (hellos, reveal, moments; card only), P2b (idle and mood lines, needs `reason_key`), upbringing lines their own small PR |
| 8 | Mood line value overstated: `home_<flag>` and the weight band replace content/excited whenever the house adds something. Verified (model.py:1760-1766) | **First-mate default:** `content` and `excited` only, accepted as rare, said so. The pick is deterministic per pet, key and day, half the days the type's line; a no-flicker check |
| 9 | Wish lines credited a person ("you remembered", "you came through", "you're too kind"); plucky's "told you!" read as I-told-you-so. Verified (`wish_granted` fires from care, a game or the house) | **Owner:** wish lines never credit a person; old soul's "thank you ♥" went too. Plucky's excited idle is "hah! nailed it!". The scan checks both |
| 10 | No way to get a teen, adult or old record into card-check | The checks stub sensor attributes in-page; storage editing (HANDOFF "Dev pets drift") only for a manual look; the reveal is checked with a synthetic `stage_changed` |
| 11 | The reveal needed a second bubble; the plan named `_speak`. Verified (card:2584-2590; `_queue` with `{catch: true}` at card:2702) | The reveal is `_queue`d after the stage line; a check that both show |
| 12 | Name budget: `short()` defaults to 30, `_greet` caps at 16. Verified (card:436, 2335). Nicknames are at most 9 (`NICKNAMES`, "starlight") | Budget is 16. At 16, draft 1's "hi, {n}! I'm glad you're here" was 42; it is now "hi, {n}! glad you're here ♥", the longest line, at 40 |
| 13 | `_greet` interpolates before `pick`, not after. Verified (card:2344-2350) | "How the hellos are built" describes the real shape: a second filled array, the coin between them |
| 14 | Assist rationale inconsistent (traits are spoken); `PROMPT` is `.format`ted; notes invited sarcasm. Verified (intent.py:100-101, llm.py:69) | The rationale is restated (the type is a voice, not a fact); notes softened; a no-`{` test |
| 15 | Bond-8 "my favourite"/"the best" lines rank people | **First-mate default:** bond-8 lines are warm, never superlative ("glad it's you ♥"); the scan bans "favourite"/"best" in hellos |
| 16 | The AC hobbies borrow overstated the fit; the Sims trait count was unverified | The row says "loosely" (traits are learned, deepen, up to `TRAIT_CAP`=4); the Sims count is softened to "younger Sims fewer, per the cited source" |
| 17 | `stage_changed` carries `personality` on the bus. Verified (coordinator.py:777-785; notify.py:141 keys off `upbringing`) | A sentence where the event is described; no change |
| 18 | Missing acceptance criteria (old/new card and server, version, translations) | An "Acceptance, every phase" paragraph under the phases |

Also changed while writing draft 2 (not in the audit): the kindred-pairs example
line was removed (lines for visits are written with item 5); the scan also keeps
time-of-day words out of the hellos (`_greet` fires at any hour).
