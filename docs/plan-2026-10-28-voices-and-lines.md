# Voices and lines, 2026-10-28 (plan; draft 2, revised after the first audit)

The owner chose all of this on 2026-10-28, after an audit of every line the pet says
(24 findings) and the question "Do all pets talk identically?" (they did). Animal
Crossing is the touchstone ("a powerful touchstone for us"): each villager has its
own sound, babble and catchphrase, and a birthday; close friends get a photo.

Related, planned elsewhere:
- **Personality types** (AC's eight, made gentle, independent of the creature; lines
  shaped by upbringing and traits): the next plan, after this PR.
- **Gifts** (a pet saves a find for its closest friend, with good variety): in
  `plan-2026-10-28-daily-checkins.md` item 1, finds and visitors.
- **Neighbours talking** ("have you met Mochi? she's so nice!"): item 5 there, pets
  visiting each other.
- **Moths don't eat** (part B below): its own PR and its own audited plan, after this
  one, because it changes the rules, not just lines.

## Rules (unchanged)

Flavour only; positive or quiet, never guilt or nagging; private things only to
their person; short (a 330 px card). The pet's voice: small, cute, mostly lowercase;
names and holidays capitalised.

## A. This PR

### A1. Each creature's sound

| World | Creature | Sound | From |
| --- | --- | --- | --- |
| Woodland | Bird | tweet | its song |
| Woodland | Douglas squirrel | chirr | its chattering call |
| Woodland | Black-tailed deer | mew | a fawn's mewing bleat |
| Terrarium | Leopard gecko | tik | its clicks |
| Terrarium | Red-knee tarantula | tip | silent; tiptoeing legs |
| Hearth | Tabby kitten | mrrp | a kitten's trill |
| Hearth | Lop bunny | snuf | a rabbit's snuffling nose |
| Tidepool | Sea otter | squeak | its squeaks |
| Tidepool | Giant Pacific octopus | blub | silent; bubbles |
| Pond | Pacific tree frog | ribbit | the movie "ribbit" is this frog |
| Pond | Axolotl | blep | silent; gulping air |
| Night Sky | Little brown bat | squee | its squeaks |
| Night Sky | Luna moth | fwip | silent; a wingbeat |

Changed from draft 1 after the audit: "chk" can't be read aloud, "tap tap" breaks
the one-word rule, "flit" reads as narration, the bat's "eep" is the Halloween
startle line and too close to the deer's "meep", and "honk" reads as a goose (geese
fly by at Thanksgiving). The owner and the player may change any of these.

- **Stored** in `species.json` as `voice: {"sound": ..., "pitch": ..., "pace": ...}`
  (pitch and pace for the babble, A2), documented in `sprites/README.md`. No voice:
  plain lines, a default babble.
- **Moods by punctuation and repetition:** "tweet! hi Sam!", "tweet tweet!! you're
  home!", "tweet... night night", "tweet? how was your day?". One word repeated, so
  never "tip tip tip tip".
- **One place to speak.** A new `_speak(s, text, {voice, ms})` takes over the lines
  that may carry a sound: greetings, welcomes, questions and answers, wish and bond
  lines, notes, house moments, seasonal and idle lines. The other direct bubble
  writes (53 today) stay as they are and are never voiced: refusals, sick and sad
  lines, the mood line redrawn each tick, games.
- **When the sound comes: predictably, once per burst.** A line gets the sound when
  it's the first line after a quiet spell (no line for 2 minutes), or a greeting, a
  welcome or a question; never twice within one burst of queued lines, never on a
  line that already starts with a sound-like opener (a list: "*", "♪", "...", "hmm",
  "hehe", "boo", "gobble", "crack", "eep", "news!"). No random one-in-three: it
  would flicker and break exact-text card checks.
- **Never** on phones, in Assist, on the status screen, in the journal, or in the
  live region (screen readers would spell "chirr"): `_speak` sends the line without
  the sound to the live region.
- **Fit:** the longest sound plus the longest line it can open stays under 60
  characters, or the sound is left off that line (card check).

### A2. Animalese: text that types out, and a babble

- **Typing:** a line types out in the bubble at the creature's pace (about 25-45
  characters a second), unless the viewer prefers reduced motion. The live region
  gets the whole line at once.
- **Babble:** with "sounds here" on (the existing per-browser switch, off by
  default), each letter typed plays a tiny syllable through the existing WebAudio
  chirp code, at the creature's pitch (a high quick bird, a low slow octopus; spaces
  and punctuation are pauses). Quiet hours and an asleep pet stay silent, as chirps
  do now. Never louder than the chirps.
- **Cheap:** synthesised, no audio files; one `babble(text, voice)` beside
  `playChirp`.

### A3. Its own words

`words` (food, home) is used in the lines that name food or home ("yum, hazelnuts!",
"back to my drey..."). Words may vary by stage (`words: {"food": ..., "adult":
{...}}`): the luna moth's caterpillar eats leaves and lives on a branch; the moth
says "moonlight" and "the trees" (no cocoon line from a moth).

### A4. Its favourite snack

At hatching each pet picks a favourite snack from its creature's `voice.likes` (2-3
foods that suit it; the squirrel: hazelnuts, pine seeds, mushrooms). Saved on the
pet (`favourites`), picked in the coordinator (the model doesn't see species data),
at hatching and once for existing pets at load (never re-picked). Used where it
belongs: when it gets a snack, now and then the snack is its favourite ("chirr!
hazelnuts, my favourite!!"), at most once a day (server-side, so not per device). The
favourite weather from draft 1 is dropped: it clashed with each person's favourite
weather. `favourites` is on the life stage sensor (the pet's, not private;
unrecorded). A moth's favourite: see part B.

### A5. A catchphrase a friend gives it

At bond level 7, once per person, a question: "what should I say at the end of
things?", with six choices (`hehe`, `yay`, `and stuff`, `ok?`, `toodles`, `la la`)
and "keep mine". The latest answer is the pet's catchphrase (on the pet; the
pet's, not private). It ends about every fourth voiced line ("tweet! hi Sam!
toodles"), never a sad one, never twice in a burst. No free text (no moderation, no
length or markup problems).

### A6. Birthdays

- **The pet's.** `hatched_on` (local date) is set at hatching; existing pets get it
  from `born` and the egg time at load. On its day each month: "I'm 3 months old
  today!" at the first look; once a year a party (a party hat as a seasonal-style
  costume, confetti at the first look, "it's my birthday!!"). Not a notification.
- **Yours.** A one-time question in the bond question system, level 4: "when's your
  birthday?", answered with month and day pickers in the question box (or "skip").
  Private, in the people store. On the day: the first pet you look at sings (a
  short babble tune if sounds are on) "happy birthday, sunbeam!! ♥", once; your
  phone (with "notify me") gets "Pip says: happy birthday, sunbeam! ♥" at your wake
  time. Leap-day birthdays fall on 28 February.

### A7. A photo, for best friends

At bond level 10 the pet gives that person a photo, once: a framed portrait drawn
by the card from what was true that day (the creature and stage, its content pose,
the flair of its active traits around it, its world's backdrop, its name and "best
friends since <date>"). Stored on the pet's bond (the snapshot's details, not an
image). Shown only to that person, in their journal ("photos"), with a "save"
button that downloads it as a PNG.

### A8. Baby talk (a per-person switch, off by default)

Baby and child stages (about the first week). With the switch on, the pet's common
lines have simpler versions, babies most: "tweet tweet! hi hi!", "hungy!",
"sleepy...", "yay yay!"; children a little. Each baby line is checked against the
no-nagging rule like any other. The switch is on the status screen, saved in the
people store (it follows the person) and cached in the browser (so the first
greeting already knows it). Off: everyone hears the normal lines.

### A9. Line fixes (the lines audit; owner approved, revised by the plan audit)

1. Missed care: "...oh, there you are ♥" with a perk (no sulk); a missed whine:
   "ok, ok... ♪"; collapsing asleep: "so... sleepy... zzz", no sulk.
2. Wish reminders: one after the first look, not every 10-15 minutes. A wish's
   window is the server's (`grant_wish`): say hi and a snack after lunch close at
   bedtime, and the life stage sensor says so (`wish.open`), so the card never
   mentions a wish that can't come true. "I'd love a snack after lunch!" (no
   "..."). An aimed wish is seen by everyone, as built (owner, 2026-10-28).
3. Shared screens: a per-browser switch "shared screen" on the status screen
   (saved like "sounds here"). On: no visit call, no private notes, no questions, no
   names or nicknames, no "you two" row, no "my day" or "baby talk" switches, no
   photo; plain greetings ("hi!").
4. Seasonal lines: the costume moment every 10-15 minutes.
5. The Thanksgiving thanks: "thank you all for taking care of me ♥" (no names).
6. Growing up: "all grown up! ♥"; the phone "Pip is all grown up!"; the upbringing
   on the status screen (its test updated).
7. The first look: the card tells `visit` how many lines it already has queued
   (`queued`); the server sends at most `3 - queued` notes (at least 0) and the
   question only if there's room, and marks only what it sends, so nothing is lost.
   Order: welcome home first, then the away note, the dream, the wish, then notes,
   then a question. `good_morning` says "morning! ♪".
8. The away note: plain parts, at most two, one "!" at the end.
9. Dreams picked: "I dreamed about snacks, like you said! ♥".
10. Assist: "Hi, sunbeam! Pip is cozy: toasty by the fire." (greeting first; `*`,
    `~`, `♪` stripped; no reason repeating the mood); no thanks after a scold; the
    two refusals reworded.
11. "you got a good sleep! ♥", "home from work! ♥", "back from class? ♥", "it's wet
    out there! come get cozy ☂", "a bit messy in here...", "sunny today! yay", "oh,
    sunny after all! good guess though ♥", "*rolls around*".
12. "Thanksgiving in your favourite season! ♥".
13. "happy Halloween!", "happy Thanksgiving! ♥", "happy Thanksgiving, turkey ♪",
    "hi, Alex!".
14. Titles, artists and names cut at 30 characters with "…"; hatching over an hour
    in hours.
15. "our favourite game! ♥" once a day (server); "new best at left or right! 4/5 ♥".
16. Bedtime: one line; nothing said from the queue while asleep (card check
    updated).
17. No 🌊 🌸 🍂 ✨ ⚡; ☂ for rain.
18. Bond levels 8, 9, 10 each their own line; whines as a number; "side", not
    "streak", in trait notifications.
19. A question is announced in the live region and its buttons stay 60 s; focus
    stays where it was (it wasn't asked for). The live region leaves out ♥ ♪ ★ and
    emoji; praise is announced "thank you!". The "my day" label says what it reads.
20. "Pip, a new virtual pet, just moved in! Say hi ♥"; "Pip feels sick. Medicine?".
21. The LLM prompt: "Keep it light and kind: never guilt, nag or worry the person."

Three of the lines audit's 24 findings are folded into others here: the morning's
three "good morning"s (7), Thanksgiving capitals (13), and repeated bond lines (18).

## B. Moths don't eat (its own PR, after this one)

Owner's choice: the full rule, fixed. Its own plan and audit, before building, must
answer the audit's points:

- Hunger can't fall at all: held full after every step and action and at load
  (existing moths too); no hunger call, open or latched; nothing digesting; play
  and games don't cost hunger.
- Weight eases to the healthy middle, so a heavy or light caterpillar isn't stuck.
- No poop, so cleaning and the bath wish need a moth version (e.g. "brush my wings":
  a small happiness, and a bath wish that's "a wing brush"), so no button goes dead.
- The snack button becomes "a flower" for a moth (happiness, no hunger, weight or
  health cost); feed is greyed with "moths don't eat! ♥" (the card uses
  `aria-disabled` so a tap can explain).
- Balance: without hunger calls a moth misses less; the upbringing grade and trait
  learning are checked against the bat's.
- "I'm a moth now!" when it changes, and on the phone; a hunger notification sent just
  before has its Feed button refused gently.
- The species flag reaches the model through `Settings`; button entities' availability;
  Assist; the status screen ("doesn't eat"); holiday snack props and lines; dreams
  ("feast"), and the dream question's "snacks".

## Building part A

- **Data:** `voice` (sound, pitch, pace, likes) and stage `words` in 13 files.
- **Server:** `species.py` (voice, likes, words); `model` (`hatched_on`, birthday
  and favourite helpers, wish `open`); coordinator (favourites, catchphrase,
  birthdays, the photo snapshot, `queued` in visit, baby talk); `people` (birthday,
  `baby_talk`, catchphrase asked); the websocket answer grows (catchphrase, birthday
  as `MM-DD`); `intent.py`, `notify.py`, `llm.py` texts.
- **Card:** `_speak`, typing and babble, words and favourites, the catchphrase, the
  birthday party and picker, the photo (canvas render, save), baby lines, shared
  screen, every line fix.
- **Tests:** model and coordinator for each piece; card checks: a voiced greeting and
  an unvoiced sad line, once per burst, typing done and the live region plain, baby
  talk on/off, the first-look budget, shared screen hides everything private, the
  photo renders with flair; a sample sheet (13 creatures: greeting, happy, sleepy,
  baby talk, the photo) for the owner.
- **Cost:** L. Split into two commits at least: lines and voices first, then
  birthdays, catchphrase and photo.
