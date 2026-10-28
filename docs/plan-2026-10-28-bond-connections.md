# Bond connections, 2026-10-28 (built as revised after the audit)

The owner chose all twelve of these on 2026-10-28 ("These are wonderful"). They
build on the bond with each person (`docs/plan-2026-10-28-daily-checkins.md`, item
3, and its second and third passes), which is on the branch but not yet released.

## The rules (unchanged from the bond)

- **Flavour only.** Nothing here changes a stat, a mood, a trait or a care result.
- **Only to the person it's about.** Anything drawn from a person's phone or
  whereabouts reaches only them: through `virtual_pet.visit`'s response (`notes`)
  or their own phone. Nothing private goes into a state attribute, an event or a
  moment. The house's weather is not private; a person's zone, alarm, focus mode,
  steps and answers are.
- **Positive or quiet.** A line is said when there's something kind to say; otherwise
  nothing. Never a worry, a nag, a guilt trip or a streak.
- **Rare enough to stay special.** A cap on questions per person per day (below), and
  each kind of line at most once a day.
- **Opt-in where it reads a phone.** Everything that reads a person's phone or
  whereabouts sits behind their "my day" switch, except the quiet mode (6), which
  only ever sends less.

## Shared pieces

### Questions (the card asks, a person answers)

"How was your day?" (built) becomes one of several questions. The card asks; the
answer either stays on the card (a feeling) or goes to the server (something to
remember), by a new service:

- `virtual_pet.answer`: `entity_id`, `question` (`favourite_weather`,
  `favourite_season`, `dream`, `forecast_guess`), `answer` (validated per question).
  For the signed-in person only, like `notify_me`. Stored in their bond.

**How often.** Per person, across every pet and device: at most one question a
visit, at most **two a day** (a morning one and an evening one), and never two pets
asking the same person the same day (the card keeps the cap in `localStorage` per
user, not per pet; the server keeps it per person in the bond for the one-time
questions). One-time questions (3, 12) are asked once, in the quiet middle of the
day (11:00-16:00), only on a day nothing else was asked.

**Which one.** First look of a visit, by time of day:

| When | Question | Level |
| --- | --- | --- |
| morning, before 11 | "did you sleep well?" (11) | 2 |
| 11-16, once ever | "what's your favourite weather?" (3), then on a later day "favourite season?" (12) | 3 |
| a friend just came home | "how was your day?" (built) | 2 |
| from 16 | "how was your day?" | 2 |
| within 2 h of the pet's bedtime | "what should I dream about tonight?" (9), or "rain or sun tomorrow?" (10) when tomorrow's forecast is known | 2 |

Each question has a chance (about 60%) so it doesn't come every day.

### The weather of the day

The server keeps `weather_seen` (state: `{day, kinds}`; kinds `rain`, `snow`, `sun`)
from what the house senses while the pet is awake (`_sense_home`): any rain, any
snow, sun out in daytime. 4 and 10 read it. Saved, so a restart doesn't forget a
rainy morning.

### A person's phone signals

`wellbeing.find_sensors` learns three more, matched like the others by the end of the
mobile_app unique ID (companion docs names; unverified on a real phone):

- `focus` (iOS, `binary_sensor`, on while a focus mode is on);
- Android Do Not Disturb (`sensor.do_not_disturb`: `off`, `priority_only`,
  `total_silence`, `alarms_only`); unique ID end assumed `dnd_sensor` or
  `do_not_disturb`;
- Android next alarm (`sensor.next_alarm`, the time in UTC; `unavailable` with none).

## The twelve

### 1. Coming home in the weather (S)

The `friend_home` moment (level 3+) carries the house's weather at that moment:
`weather`: `wet` (raining), `snowy`, `cold` (outdoors at or under 5 °C), `hot` (28 °C
or more). The card's "you're home!" gains a second line: "you're all wet! come get
cozy ☔", "snow on your shoes! ❄", "brr, was it cold out there?", "you must be
thirsty after that heat!". Not private (the house's weather), so it rides the moment.

### 2. Send-off when you leave (S)

When a person entity (level 3+, "notify me" on) goes from home to away, and today
is notable, their phones get one line: rain or snow in today's forecast or falling
now ("rain later today, take an umbrella, sunbeam ☂"), a hot day ("it's a hot one,
stay cool, sunbeam!"), a cold one ("bundle up, it's cold out! ❄"). Once a day per
person, between wake time and the pet's bedtime, never in quiet mode (6), never at
the sitter's (the pet is away when the house is empty, so: only when someone else
is still home, or the pet was home just before). Through `notify.send` with its own
tag.

### 3. Your favourite weather (S-M)

A one-time question (level 3): "what's your favourite weather?" sun / rain / snow /
storms. Stored in the bond's `likes`. Then, when the house's weather is that (rain
falling, snow, sun out, a storm) and they look in: a note, once a day, "it's
raining, your favourite! ☔". A note, not a moment, so nobody else learns it.

### 4. My day and the weather (S)

"My day" (level 4+) adds two notices, above "more than usual": `rain_walk` ("you
walked in the rain?! so brave!") and `snow_walk`, when `weather_seen` has rain or
snow today and their steps are at least their usual (or 5,000 without a usual).

### 5. Up before the sun (S)

A visit (level 2+) between 3:00 and sunrise (`sun.sun` below the horizon, before
noon): a note, once a day, "you're up before the sun! good morning, sunbeam ☀".
From the visit's own time, not a phone, so it needs no "my day".

### 6. Quiet mode (S)

While a person's phone has a focus mode on (iOS) or Do Not Disturb not `off`
(Android), the pet holds their non-urgent notifications (traits, firsts, holidays,
send-offs). Calls, sickness and clearing a call still go: those are the reason to
have notifications at all. Held ones are counted in the bond (`held`), not queued
or sent later. At their next visit: "you were busy, so I waited quietly ♥", once,
and the count resets. On for everyone with "notify me"; it only ever sends less.

### 7. Where you've been (S)

With "my day" on (level 3+): coming home from a zone they made in HA (the person
entity's old state is a zone name, not `not_home`), the bond remembers it (`from`,
private). At the next visit within 6 h, a note: "back from the gym?! so strong!",
"long day at work? ♥" (work, office), "how was school?" (school), "did you have fun
at the park?" (park), else "back from <zone>! ♥". From work or school, "how was your
day?" is asked right after (it's the evening question then).

### 8. An early alarm (S, Android)

With "my day" on (level 3+): a visit after 19:00 when their phone's next alarm is
tomorrow before 07:00: "early start tomorrow? sleep well, sunbeam ♥", once a day.

### 9. "What should I dream about tonight?" (S)

An evening question (level 2): stars / the sea / snacks / you. Stored as the bond's
`dream_pick` `{day, pick}`. At the morning wake, the newest pick from last night
becomes the dream (`dream_on_waking` prefers it over the day's moments):
`{kind: "picked", pick, by}`. The card says it at the first look: to the picker "I
dreamed about the sea, like you said! ♥" (or "I dreamed about you! ♥"), to anyone
else "I dreamed about the sea...". The dream's `by` is a user ID on the life stage
sensor, like `notify_users`.

### 10. "Rain or sun tomorrow?" (S)

An evening question (level 2) when tomorrow's forecast is known (a weather entity
mapped): rain / sun. Stored as `guess` `{day: tomorrow, guess}`. On that day, at
their first visit from 15:00 (or later), from `weather_seen`: right ("you were
right!! it rained ☔"), or not ("ha, sunny after all! good guess though ♥"). A day
with both or neither gets "a bit of everything today!". No score, nothing kept.

### 11. "Did you sleep well?" (S)

A morning question (level 2, before 11:00), card only: great / ok / not really,
answered kindly ("yay! ♥", "a cozy morning then ♥", "aww, take it easy today ♥").
Not asked when "my day" just said they look well rested.

### 12. "What's your favourite season?" (S)

A one-time question (level 3, on a later day than 3): spring / summer / autumn /
winter, stored in `likes`. At the first look in a new season (by month and the
hemisphere from HA's latitude, so the card needs nothing new), once per season: "it's
autumn, your favourite! 🍂". When a holiday season (Halloween, Thanksgiving) falls in
their favourite season, its first look says so too ("Thanksgiving in autumn, your
favourite time ♥").

## Building it

- **Server:** `virtual_pet.answer`; bond `likes`, `dream_pick`, `guess`, `from`,
  `held`, `asked`; state `weather_seen`; `friend_home` gets `weather`; `person_moved`
  learns leaving (2) and the zone left (7); `_notify` checks quiet mode; `_notes`
  grows (3, 4 via `wellbeing.notice`, 5, 6, 7, 8, 10); `dream_on_waking` takes picks
  (9). Sensor `bonds` gains `likes` (the card needs them for 12, and for 9 and 10 to
  know what's been answered). Diagnostics already redact `bonds`.
- **Card:** the question scheduler (`_question`), a general `_ask(s, question,
  options, answer)`, the lines for every note and moment, the season greeting (12).
- **Docs:** the guide's bond section, events, services; the handoff.
- **Tests:** each note and its gate; quiet mode holding and the note; the send-off
  once a day and never in quiet mode; the dream pick at the wake; the guess resolved;
  `answer` validated and per person; card checks for the question scheduler (caps)
  and one screenshot per new question.
- **Cost:** about L in total, each piece S.

## Open questions

- Should the send-off (2) have its own switch, or ride "notify me"?
- Quiet mode (6) on by default for everyone with "notify me"?
- Are the dream choices right (stars / the sea / snacks / you), or per world?

## The audit (2026-10-28) and what changed

An adversarial review of draft 1 found 14 problems. All but one are taken; the
revised design below replaces draft 1 wherever they differ.

| # | Finding | Change |
| --- | --- | --- |
| 1 | Person-level lines, caps and send-offs were per pet: three pets, three umbrella pushes | A **people store** shared by all pets (`people.py`, its own `Store`): likes, questions asked, lines said, send-offs, zones, alarms, guesses, the day's weather. Pet-level things (points, nickname, tuck-in, dream picks) stay in the pet's bond. A person line is said once a day by whichever pet they look at first. Send-offs come from the pet they're closest to. |
| 2 | The question cap was per browser | The **server picks the question**: `visit` answers `{notes, ask}`, and the cap (a morning and a later slot a day) lives in the people store. |
| 3 | `likes` and dream pickers would be on a state attribute every user can read | Nothing new on attributes. The season greeting and the dream "like you said" come as notes. |
| 4 | One morning look could queue nine lines | At most **two notes** per visit, by priority; the rest wait for a later visit (not dropped). The question comes after them, decided by the server knowing what it just said. |
| 5 | Reading focus/DND fights iOS's automatic Sleep and Driving focus; a dead phone holds everything | **Don't read focus or DND.** Calls and sickness go out time-sensitive (they may break through a focus the person allows); everything else is an ordinary notification, which the phone already holds during focus or DND; send-offs are passive (never a buzz). No "I waited" line. This is item 6 now. |
| 6 | Zones are lost (`Work → not_home → home`); a fallback says "back from Hospital!" | Remember the **last zone entered** (saved, with its time); only an allowlist of words (gym, fitness, work, office, school, college, university, park), no fallback. |
| 7 | "Up before the sun" can't fire: the pet is asleep before sunrise | A **sleepy** version while it sleeps: "mmh... you're up before the sun... zzz ♥". |
| 8 | The hourly throttle ate notes when the pet was asleep; the guess was judged at 15:00 | The throttle only counts visits that got the pet awake. The guess is judged **from 18:00 or the next day**; a cloudy day gets its own line. |
| 9 | The send-off leaned on "notify me", had a sitter clause that never applies, could nag on every rainy day, and used a nickname at level 3 | Behind **"my day"** (whereabouts), mornings only (6-12), notable days only, at most **3 a week** (saved), never on `unknown`/`unavailable` changes; the nickname only when there is one. |
| 10 | The newest dream pick won; others were told "like you said" wrongly | A **random** pick among last night's (by time, not date); "like you said!" only to the chosen picker; others hear the plain dream. |
| 11 | Next alarm is UTC, may be any app's, and "early" for an always-early riser is every day | Converted to HA's time zone; only clock apps (package with "clock" or "alarm"); "early" means at least 45 min before their own usual (median of the last 10 seen), or before 5:30 with no usual. One season helper on the server, by date and latitude, and **no season talk within the tropics**. |
| 12 | Caps in memory repeat after a restart | Everything capped is in the people store. |
| 13 | Answers sent as a service call land in HA's event history (`call_service`) | Answers go through a **websocket command** (`virtual_pet/answer`), which fires no event. No bus event carries a zone, an answer or an alarm. |
| 14 | 60% rolls let "how was your day?" crowd out the dream and the guess | The later slot follows a **fixed rotation** by date: how was your day, the dream, the guess (each when its time comes). Coming home from work or school, or a friend just home, asks "how was your day?" that day instead. |

Not taken: none. The audit's point about the browser's clock for the card's own
first-look lines (dream, wish) stands for those older lines; everything new is timed
on the server.

## Revised design (overrides draft 1)

- **People store** (`people.py`): `{"people": {user: {likes, asked, noted, zone,
  arrived, sendoffs, alarms, guess, my_day}}, "weather": {day: [kinds]}}`, saved
  with a delay like the pets. "My day" moves here (one switch per person, shown on
  every pet). Loaded pets register in `hass.data` so one can find the pet a person
  is closest to.
- **Visit:** `{notes: [...] (≤2), ask: {kind, options} | null}`. Throttle counts only
  awake visits. A person who just came home bypasses it (the card calls again when
  it sees them arrive).
- **Questions** (server-chosen, card-drawn; card-only answers aren't sent):
  morning slot (before 12): "did you sleep well?" (11), not on a day it said
  "well rested". Later slot (from 12): coming home from work/school or just home →
  "how was your day?"; else on a one-time day (11-16, no question yet today and
  none answered yet) "favourite weather?" (3), then later "favourite season?" (12);
  else the day's rotation: "how was your day?" (from 16), "what should I dream
  about?" (within 3 h of bedtime), "rain or sun tomorrow?" (from 17, with a
  forecast). One question a visit; the slot is used when it's asked.
- **Answers:** websocket `virtual_pet/answer` (`entity_id`, `question`, `answer`)
  for favourite weather, favourite season, the dream pick (stored on that pet),
  the guess.
- **Notes**, by priority: friendship month, last night's dream pick, tuck-in
  thanks, the guess result, back from a zone, "my day" (with rain and snow walks),
  your favourite weather now, the season, an early alarm. "Up before the sun" is
  the one note while asleep.
- **Phones:** calls and sickness `time-sensitive` (iOS `push.interruption-level`;
  Android channel "Pet calls", high importance); send-offs `passive` and Android
  channel "Pet news", low importance.

## Built (2026-10-28)

As revised above. Checked: 358 tests (people.py's rules, each note and its gate,
the send-off limits, the answer command putting nothing on the bus, the dream pick
at the wake, the guess, the alarm's package filter, no zone name on any state) and
61 card checks (the question widget, a kept answer sent by websocket, every new
line). Not yet seen on real phones: the sensors, the zone and alarm paths, and the
iOS/Android urgency fields.

## Code audit before the PR (2026-10-28)

A second subagent audited the whole branch. Fixed, each with a test that fails
without the fix (but 6's, which needed the test to yield where the recorder would):

1. Coming home without having been in a zone crashed the visit for two hours.
2. A zone from yesterday explained today's errand: a zone now counts only if
   entered after the person last left home.
3. The guess result was used up even when the two-line limit held it back.
4. An unanswered favourite was asked every day: now once more two weeks later, then
   never.
5. Diagnostics showed a wish's `for` and `for_name`, and moments' nicknames.
6. Two pets visited at once could both say a person line: one look at a time per
   person (`People.lock`).
7. "My day" was on the life stage sensor for every user to read: now only in the
   visit's response.
8. The card's question box sat over a game, and a slide given to another pet kept
   the last pet's lines, question and dream answer.
9. A daily step count not updated since midnight was taken for today's.
10. The card waited an hour after a visit that didn't count (the pet asleep): it
    tries again after 5 minutes.
11. The send-off now comes from the closest pet that notifies them.
12. A walk in the rain needs 5,000 steps.
13. The house's weather is noted while the pet is out too.
15. Two pets reporting one arrival gave two welcomes.
16. Tucking it in now grants the "tuck me in" wish to whoever did it.
17. The answer command only reaches a loaded pet.
18. The phone sensor's choice follows its priority, not the registry's order.

Left as is: person entities and phone activity sensors added after a pet starts
are noticed after its next reload (14).
