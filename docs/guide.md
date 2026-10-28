# Hatch at Home: the full guide

Everything the [README](../README.md) leaves out: setup step by step, every
entity, option and rule, Assist, events and development.

A Tamagotchi-style virtual pet that lives inside Home Assistant. Later phases
let the real house (weather, light, bedtime, who's home) shape its mood and
scenery. **The house can never hurt the pet**; it only changes how the pet
looks, what it says and what it asks for.

Status: **phase 4, life**, nearly done (bird visits from BirdNET-Pi are still to
come). The pet lives in HA: stats, calls, care misses, poop, sleep, weight,
discipline, two games (left or right, higher or lower) and chore treats. It sits on a pixel-art **device
shelf** card and reacts to your house: weather, indoor temperature, lights,
bedtime, people coming and going, the TV and music, and the moon. It learns traits,
grows up with an upbringing, and starts new generations that you can follow in its
journal.

Each pet lives in a **device** themed for its **world**: an orange egg-shaped toy for
Woodland (the bird, the Douglas squirrel and the black-tailed deer), a sandstone tank for Terrarium (the
leopard gecko and the Mexican red-knee tarantula), a little red house for Hearth
(the tabby kitten and the lop bunny), a riveted porthole for Tidepool (the sea otter and the giant Pacific octopus,
whose water clouds over instead of collecting poop), a lily pad for Pond (the
Pacific tree frog and the axolotl), and a crescent moon for Night Sky (the little
brown bat and the luna moth). The egg decides which of that world's
creatures hatches. See `docs/design-worlds.md`.

## Install

1. **Take a backup first**: Settings → System → Backups → Back up now.
2. Get the files, through HACS (recommended) or by hand:
   - **HACS:** HACS → ⋮ (top right) → Custom repositories. Paste
     `https://github.com/alpine-vortex/hatch-at-home`, pick type **Integration**
     and press Add. Then search HACS for **Virtual Pet** and press Download.
   - **By hand:** copy `custom_components/virtual_pet/` from this repo into your
     HA config folder, so you end up with
     `/config/custom_components/virtual_pet/manifest.json`. The Samba share, the
     SSH add-on or the Studio Code Server add-on all work.
3. Restart HA: Settings → System → power icon (top right) → Restart Home Assistant.
4. Settings → Devices & services → Add integration → search **Virtual Pet**,
   then name your pet and pick its world: Woodland (bird, squirrel, deer), Terrarium
   (leopard gecko, tarantula), Hearth (kitten, bunny), Tidepool (sea otter, octopus), Pond (tree frog, axolotl) or Night Sky (bat, luna moth). Add the integration again for each extra pet device.

### Updating

With HACS, new versions appear under Settings → Updates. Install, restart HA,
then reload the browser page. By hand, copy the folder over the old one and do the
same. Either way your pets are safe: they live in HA's own storage
(`/config/.storage/virtual_pet.<entry id>`), not in the integration folder. Restoring
an HA backup rewinds the pet to that point, which is fine.

Moving a manual install to HACS needs nothing special: add the custom repository,
download, restart. HACS replaces the folder you copied.

### Add the card

The integration loads the card on every dashboard by itself; there's no resource
to add and no Advanced mode needed. After installing or updating, restart HA and
reload the browser page. On a phone or wall tablet, pull to refresh.

Edit a dashboard → Add card → search **Hatch at Home pet shelf**. With no settings
it shows every pet. To show only some, pick them in the card's editor. In YAML:

```yaml
type: custom:hatch-pet-card
# optional: the pets' device IDs (the editor fills these in)
devices:
  - 0123456789abcdef0123456789abcdef
# or, as before, any one entity of each pet:
entities:
  - sensor.pip_mood
experimental_catch: true  # optional prototype: adds Catch to the game picker
seasonal: false  # optional: no seasonal touches (on by default; "halloween" or "thanksgiving" previews one)
```

**Upgrading from 0.3.x:** you added the card as a dashboard resource back then.
Remove it now (Settings → Dashboards → ⋮ → Resources → delete the
`hatch-pet-card.js` row), or an old cached copy may load first.

### Using the card

- Each pet stands in its device on its world's backdrop. Use the arrows, the dots or a
  swipe to move to the next device.
- The screen shows the pet, its scene and a speech bubble. The bubble says what's on
  its mind, or why it refused something ("I'm full!").
- **Play** offers two games (three with Catch). It opens a picker that starts on the
  last game you picked. **Left or right:**
  the pet hides on one side and you guess with the arrows; a win cheers it up more than
  plain play. **Higher or lower:** the pet shows a number from 1 to 9 and you guess
  whether the next is lower (lo) or higher (hi); it's mostly skill, so a win pays like
  plain play. Five rounds each; three right guesses win. ✕ stops a game. (The `play`
  button entity is still plain play, for automations and voice.)
- **Catch** (prototype, card option `experimental_catch: true`): a toy rolls in from
  one side; tap that side as it reaches the pet, but let the bee go by. Five rounds,
  three catches win; the best score stays in this browser. No reward, nothing is sent
  to Home Assistant.
- **Every day** there's something new when you look in:
  - **A wish of the day**, picked when it wakes up, only from what your house can grant: play
    a game together, a snack after lunch, a bubble bath, "good job!", being tucked in
    tonight, watching the sunset together (someone home at sunset), someone coming to
    say hi in the afternoon (opening the card after noon), and, when you have
    them mapped, some music, TV together, a chore treat, or seeing the rain on a day the
    forecast says rain. It's on the status screen and the pet mentions it once more later
    (never again after bedtime, when it can't come true);
    granting it brings a sparkle and a little happiness. A missed wish costs nothing:
    tomorrow brings a new one.
  - **A dream**: it may dream about something from the day before (a show it watched,
    the rain, a game it won, its wish coming true) and tells the first person who
    looks in that morning.
  - **While you were out**: open the card after a few hours away and it tells you what
    happened ("while you were out, I napped, watched the rain and played a game!").
- **A bond with each person.** The pet gets to know everyone who signs in to Home
  Assistant with their own login, separately (a shared wall-tablet login counts as one
  person). Looking in once a day, caring for it, playing games and granting its wish
  bring you closer; care and games count up to a daily limit, so there's no need to
  rush, and a bond never goes down, even after days away. Ten levels, slow near the
  top (about a week to level 5, a month or so to 10). Closer, it greets you more
  warmly (level 2), hops when you look in (3), picks a nickname for you ("hi,
  sunbeam!", 4), has a favourite game with you and says so when you play it (6), and
  floats hearts just for you (8). Once it has a nickname for you, your phone
  notifications and Assist use it too ("Pip is hungry, sunbeam!", "Thanks,
  sunbeam!"). From level 3 it cheers when you come home ("Sam's home!!", and "welcome
  home!" when you next look in; this needs your person entity linked to your login),
  and some days its wish is for you ("I hope Sam plays a game with me today!"; anyone
  can still grant it). It also:
  - remembers when you met, and says so each month ("we've been friends for a
    month! ♥");
  - cheers when you beat your own best at a game, which it keeps for each person;
  - says goodnight when you tuck it in in the evening (lights out by hand from 6 pm),
    and thanks you the next morning;
  - asks you things now and then (from level 2), at most one question in the morning
    and one later, per person, however many pets and screens you have: "did you
    sleep well?", "how was your day?" (always after you come back from work or
    school), "what should I dream about tonight?" (and the next morning it dreamed
    it: "I dreamed about the sea, like you said! ♥"), "rain or sun tomorrow?" (judged
    the next evening, no score), and once each "what's your favourite weather?" and
    "...season?". It remembers favourites, tonight's dream and your guess; the rest
    of your answers stay on your screen;
  - remembers your favourites: "it's snowing, your favourite!! ❄", "it's autumn, your
    favourite! ♥" once a season (no season talk in the tropics), "Thanksgiving in
    your favourite season! ♥";
  - says what it's like out there when you come home ("it's wet out there! come
    get cozy ☂", "brr, was it cold out there?");
  - greets you sleepily if you look in before sunrise ("mmh... you're up before the
    sun... zzz ♥").

  At most two of these lines at one look; the rest wait for your next one.

  A bond never changes the pet's stats: it's flavour. The status screen shows "you
  two" in five hearts.
- **My day** (opt in on the status screen, for yourself only): the pet notices your
  good days from the phones you signed in to the Home Assistant app with. It only
  ever says something when a day stands out for the better, and only to you, at most
  once a day; never a quiet day, a short night, a heart rate or a weight. The closer
  your bond, the more it notices: a 10,000-step day (level 2), more steps than your
  own usual by this time of day (4), a bike ride, a run or lots of stairs (5), your
  most active day in weeks (7), and a good night's sleep, at least your usual (8).
  It reads the companion app's steps, floors and activity sensors (iOS) and Health
  Connect's daily steps, floors and sleep (Android); Android's plain step counter
  works through Home Assistant's long-term statistics. "Usual" is your own median
  over the last two weeks, from that history; the pet stores none of it. With "my
  day" on, it also notices:
  - a walk in the rain or snow ("you walked in the rain?! so brave!", level 4);
  - coming back from a zone you made, when its name has gym, work, office, school,
    college, university or park in it ("back from the gym?! so strong!", level 3;
    other zones are never named);
  - an early alarm tomorrow on an Android phone (the Next alarm sensor, which is
    off by default in the app): "early start tomorrow? sleep well ♥", from 19:00,
    when it's at least 45 minutes before your usual (level 3);
  - a send-off on your phone on a notable morning as you leave ("Pip says: rain
    today, take an umbrella, sunbeam ☂"), with "notify me" on, at most three times a
    week, from the pet you're closest to, and silent (level 3).

  "My day" is one switch per person, for every pet. Phone focus modes and Do Not
  Disturb are left to your phone: the pet's calls and sickness are time-sensitive
  (they may come through a focus you allow), everything else waits like any other
  notification. Each person only ever sees their own bond. Care through Assist counts for
  whoever is signed in; automations build no bond. A new generation keeps the household's bonds. (The card tells the pet who
  looked in with `virtual_pet.visit`, counted at most hourly.)
- **Seasons** (by the viewing device's date; card option `seasonal: false` turns them
  off): from 20 to 31 October it's **Halloween**. Bunting hangs across the scene, a
  jack-o'-lantern with a new carved face each day sits by the pet and glows at night (it
  floats in Tidepool and Pond), cobwebs hang in the corner (both corners of the
  Terrarium), a sweet waits by the door in Hearth, a pumpkin joins the device's
  decorations, mist curls along the ground at night, bats flit across at night (in Night
  Sky by day too, where a witch crosses the sky). Each pet has a costume of the day (a
  witch hat, a pumpkin cap, cat ears or little horns) that it puts on every couple of
  minutes with something spooky to say; a friendly ghost floats by now and then and
  makes it jump; snacks are candy; the first visit of each day counts down ("3 sleeps
  till Halloween!"); and on the 31st the first visit gets "trick or treat!" and a
  sweet.
  **Thanksgiving** (US; the fourth Thursday of November) runs from 12 days before it to
  the Sunday after. A leaf garland hangs across the scene, autumn leaves drift down, a
  harvest piece of the day sits by the pet (a horn of plenty, gourds or a basket of
  apples), leaves gather in the corner (both corners of the Terrarium), a plate waits by
  the door in Hearth, a sheaf of wheat joins the device's decorations, and geese fly
  over in a V. The costume of the day is a pilgrim hat, a leaf crown, a feather band or
  an acorn cap; a turkey wanders by now and then ("gobble?!"); snacks are pumpkin pie;
  the countdown runs ("3 sleeps till Thanksgiving!"); and on the day the first visit
  gets "happy Thanksgiving! ♥", a plate, and a thank-you to everyone who looks after
  it ("thank you all for taking care of me ♥"). All cosmetic.
- Tap the screen for the status page: hearts and meters, weight, care misses and
  ignored whines, traits (n/4) and the one it's learning next, upbringing, the next
  egg, the notify-me and sounds switches, recent care, and a link to the journal. Tap
  again to go back.
- Every tap answers straight away: the button sinks, a ring pops out, the pet perks up
  and phones give a tiny vibration. Then the real reaction follows (a food bowl, a
  sparkle, or a refusal like "I'm full!"). If HA rejects the press, the button shakes
  and the pet says so.
- The toy buttons press the pet's button entities, so anything you do here works
  from automations and voice too. A button glows when the pet needs it, for example
  Feed when it's hungry. Medicine is greyed out unless it's sick.
- The pet reacts to what happens to it, even when nobody pressed anything: a missed
  call (gently: "...oh, there you are ♥"), hatching ("hello!"), growing up, a new trait, a good
  morning, a fair scolding. In its child stage, each creature also has its own
  reactions, like the squirrel stuffing its cheeks with a snack or the kitten's
  zoomies after play.
- The scene follows the sun (`sun.sun`), and dims when the lights are out. Creatures
  without their own rain scene get rain drawn over theirs.
- The sleep button turns into "wake" whenever the pet is asleep, even if it dozed off
  by itself; one tap wakes it.
- Between events it has a life of its own: it looks around, wanders, chases a speck of
  light, mutters to itself and, as a child, strikes its own poses. A treat sets it
  bouncing for a few seconds, then it hops now and then while it's still excited.
- It says hi to whoever is looking, by first name ("morning, Alex!"), at most every few
  hours. The name comes from your Home Assistant account and stays in your browser.

## What you get

One device named after your pet, with the entities below. To rename the pet or move
it to another world, open Settings → Devices & services → Virtual Pet → ⋮ next to the
pet → **Reconfigure**. Entity IDs stay the same, and notifications and the journal
follow the new name. A pet that has hatched stays in its world; its next egg starts
in the new one (the status screen says "next egg in …"). To name a new generation,
lay the egg, then rename it.

| Entity | What it is |
| --- | --- |
| `sensor.<pet>_hunger`, `_happiness`, `_energy`, `_health`, `_discipline`, `_weight` | Stats, 0–100 whole numbers. Hunger is a fullness meter: 100 is stuffed. Weight is healthy between 25 and 75. |
| `sensor.<pet>_mood` | `egg`, `away`, `sick`, `asleep`, `calling`, `hungry`, `dirty`, `sleepy`, `bored`, `excited`, `cozy` or `content`. Attributes: `flags`, `reason` (what the speech bubble will say), `call_deadline`. |
| `sensor.<pet>_life_stage` | `egg` → `baby` (30 min) → `child` (1 day) → `teen` (5 days) → `adult` (14 days). Attributes include `species`, `traits`, `trait_levels`, `inherited_trait`, `trait_progress` (0–1 per trait), `trait_cap`, `age_days`, `world`, `generation`, `upbringing` (final once adult, what it's on track for before), `upbringing_score`, `games` (played and won per game), `memories` (first snow and frost), `hatches_at` (while an egg), `next_world`, `next_egg` and `journal` (the device's retired pets). |
| `sensor.<pet>_poop`, `_care_misses` | Poop on screen (max 3) and care misses so far (attribute `discipline_misses`: fake calls nobody answered). |
| `sensor.<pet>_last_care` | When it was last cared for. Attribute `log`: the last 20 actions and who did them; `moments`: the last 10 things that happened to it, for the card to react to. |
| `binary_sensor.<pet>_asleep`, `_calling`, `_sick` | |
| `switch.<pet>_lights_out` | On puts it to bed, off wakes it. |
| `button.<pet>_feed`, `_snack`, `_play`, `_clean`, `_medicine`, `_scold`, `_praise` | Care. Medicine is unavailable unless the pet is sick. |
| `select.<pet>_next_egg` | `Surprise me` (the default) or a creature of the egg's world, for the next hatch only. Attribute `next_egg` on the life stage sensor shows the choice too. |
| `button.<pet>_lay_egg` | Starts the next generation. Available from a week into adulthood (day 21), while the pet is well and home. |
| `button.<pet>_blanket`, `_fan` | Answers to what the house makes the pet ask for. Unavailable unless it's asking. |
| `sensor.<pet>_debug` | Diagnostic, **disabled by default**. Enable it on the entity's settings page to see the raw numbers. For a file to share, use **Download diagnostics** on the pet's device page instead: it leaves out your entity IDs and people's names. |

### Quick dashboard card

```yaml
type: entities
title: Pip
entities:
  - sensor.pip_mood
  - type: attribute
    entity: sensor.pip_mood
    attribute: reason
    name: Says
  - sensor.pip_life_stage
  - sensor.pip_hunger
  - sensor.pip_happiness
  - sensor.pip_energy
  - sensor.pip_health
  - sensor.pip_discipline
  - sensor.pip_poop
  - sensor.pip_care_misses
  - binary_sensor.pip_calling
  - switch.pip_lights_out
  - button.pip_feed
  - button.pip_snack
  - button.pip_play
  - button.pip_clean
  - button.pip_medicine
  - button.pip_scold
  - button.pip_praise
```

## Connect it to your house (options)

Settings → Devices & services → **Virtual Pet** → the gear (⚙) next to your pet. The
dialog is titled **"What <name> notices"**. Every field is optional except the ones
with defaults, and anything left empty is ignored. Saving applies the changes straight
away. Each pet has its own settings.

The house never hurts the pet. It changes its mood, its scene and what it asks for,
and it adds at most +3 happiness an hour.

### Sleep

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Bedtime | 23:00 | Drowsy 30 minutes before. If nobody puts it to bed, it dozes off an hour after. Turning lights-out off after bedtime costs a little happiness. | 23:00 |
| Wake time | 07:00 | It wakes up on its own. | 07:00 |
| Bedtime lights | none | All off (from an hour before bedtime) plus a quiet house means bed. A light left on late doesn't keep it up past its bedtime. | bedroom lights |
| Motion sensors | none | Movement in the last 10 minutes means the house isn't quiet yet. | indoor occupancy sensors |

Lights-out (the switch, or the sleep button on the card) always wins, and the house
never wakes the pet. Flipped while the pet is at the sitter's, it takes effect when
the pet comes home.

### Weather and air

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Rain sensor | none | On/off "it's raining", or a rain rate where anything above 0 means rain. Beats the forecast. Rain brings a rainy scene and a **blanket?** request. | `input_boolean.raining` |
| Weather forecast | none | Sunny, snow and fog, and rain when there's no rain sensor. Wind from the condition or the wind speed (30 km/h, or gusts of 50). Its daily forecast, if it has one, gives the pet something to talk about (see Passing moments). | `weather.forecast_home` |
| Indoor temperature | none | Outside the comfort range: shivers or sweats and asks for a **blanket** or a **fan**. | `sensor.indoor_temperature` |
| Too cold below | 18 °C / 64.5 °F | Shown in your unit system. No blanket request while the fireplace is lit. | default |
| Too warm above | 26.5 °C / 79.5 °F | | default |
| Air quality index | none | Above 100: a little mask, staying in. Cosmetic only. | `sensor.air_quality_index` |
| Solar radiation | none | Only if your weather station reports W/m². 300 or more counts as sunny. | leave empty |

### The pet's room

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Room lights | none | Still on at half brightness or more after bedtime: squints, "too bright, it's late!". Dim evening light makes it cozy. Daylight and the evening before bedtime never count, so lights kept at full until bed are fine. | living room lights |
| Fireplace | none | Any entity that's on, heating or above 0 when lit (not a thermometer: that's always above 0). Curls up by it and gets a little happier. | `switch.fireplace` |
| Light sensors | none | 100 lx or more after bedtime also counts as too bright. | optional |

### People and activity

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Home zone | `zone.home` | Counts the people in it. Someone arriving gets an excited greeting, at most once every 30 minutes. | `zone.home` |
| Go to the sitter's after | 2 h | With nobody home this long, the pet is frozen: no hunger, no aging, no calls. | 2 h |
| The sitter settles whining | on | If the pet was whining for attention (a fake call) when it left, the sitter settles it and it comes home happy. Off: the whine waits for you. Real needs always wait. | on |
| TVs | none | On or playing: watches along (small bonus). | `media_player.tv` |
| Music players | none | Playing anything but video: dances (small bonus). | your speakers |
| Chore lists | none | To-do lists. Each item someone ticks off earns the pet a treat (a little food and happiness, up to 5 a day). Treats wait if it's asleep or away. | your chores list |

### Sky

| Field | Default | What it does |
| --- | --- | --- |
| Moon phase | none | Any phase sensor, such as `sensor.moon_phase` from HA's Moon integration. Full moon at night: "the moon is so big tonight!" and a little happiness (+1 an hour) if it's awake. New moon: a starry night, cosmetic only. |
| Moon illumination | none | Optional, the lit fraction (0–1 or %). Used when there's no phase sensor: 97% or more is full, 3% or less is new. |
| Moon altitude | none | Optional, degrees. The moon only counts while it's above the horizon. |

### Privacy

| Field | Default | What it does |
| --- | --- | --- |
| Keep presence private | on | An empty house shows the pet napping, never at the sitter's (care while it's away is refused as "asleep"), and the pet never says who came or went. Turn it off to see "at the sitter's". |

If an entity named in these settings is later renamed or removed, Settings →
**Repairs** says which ones, so you can pick the new ones here.

### Fixed rules (not settings)

- **Sensor dropouts:** a sensor that goes unavailable keeps its last value for 10 minutes, then counts as unmapped. It never reads as dark or empty.
- **After a restart:** motion sensors all look freshly changed, so bedtime-by-darkness waits 10 minutes.
- **Requests:** the blanket and fan buttons are unavailable unless the pet is asking. Answering gives a happiness boost and two cozy (or cool) hours.
- **The numbers:** every one of them is in `custom_components/virtual_pet/rates.py`.

## How the pet works

All numbers live in `custom_components/virtual_pet/rates.py`, in units per hour.

- **Calls:** when hunger or happiness drops below 25, energy below 20, a poop
  sits for 30 minutes, or it gets sick, the pet calls. You have 20 minutes to
  answer (feed, play, lights out, clean, medicine). A missed call is a
  **care miss**. After a miss, it won't call about the same thing again until
  that stat recovers above 40, so one forgotten meal is one miss, not twenty.
- **Fake calls:** now and then it whines while everything is fine. *Scold*
  raises discipline. *Praise* during a fake call spoils it. Scolding for
  nothing makes it sad. Ignoring a fake call is not a care miss.
- **Discipline:** the more of it, the less the pet whines: at 100 it whines a
  quarter as often (never not at all). It fades slowly while the pet is awake,
  about 4 points a day, so the habit needs a reminder now and then.
- **Poop:** a meal comes out about 2 hours later. Poop older than an hour slowly
  costs health and may make it sick. *Clean* flushes it.
- **Sleep:** bedtime 23:00, wake 07:00 (change both in the options). Lights-out puts it
  to bed; outside sleep hours that's a nap that ends when it's rested. Left up
  past bedtime, it dozes off on its own after an hour with no penalty. Turning
  lights-out off during sleep hours costs a little happiness. No calls while asleep.
  If its energy runs out, it falls asleep where it is (no penalty: the energy call
  before that was the warning).
- **Weight:** 0–100, healthy between 25 and 75. Meals (+4) and snacks (+6) add to it;
  being awake (−0.7 an hour), play (−3) and a game (−4) burn it off. Three meals a
  day roughly balance out, so snacks are what tip it. Too heavy or too light, it
  stops healing; too heavy, it can also get sick. Starving loses weight.
- **The games:** five rounds from the card, or `virtual_pet.play_game`: `guess`
  `left`/`right` plays left or right (the first guess starts it; the answer says where
  the pet went). For higher or lower, call it with `game: higher_lower` and no guess to
  start and see the first number, then `guess` `lower`/`higher`. A game costs energy
  like play, and an unfinished one is dropped after 3 minutes. Each pet counts games
  played and won per game (attribute `games` on the life stage and debug sensors,
  diagnostics, and the journal).
- **Chores:** map a to-do list in the options, and every item ticked off earns a treat.
- **Passing moments** (cosmetic, while it's awake and home):
  - It watches the sunset, greets the sunrise, and says good morning at the first
    movement in the house after wake time. It says good night when it's put to bed or
    the house goes dark and quiet.
  - It comments on what's on TV or playing ("ooh, Bluey!"), at most every 20 minutes,
    and yawns when the TV goes off late.
  - Thunder makes it hide and ask for its blanket, and the screen flashes; wind blows
    across the scene.
  - It remarks on the weather changing: rain starting or stopping (a rainbow, if the
    sun is out), snow starting, the sun coming out after two hours of cloud, a hot day
    (30 °C or more) or a freezing one (−10 °C or less), in your unit. At most one remark
    every 20 minutes, and the same one not again for 90 minutes.
  - If the weather entity has a daily forecast, it mentions today's a few minutes after
    good morning and tomorrow's in the evening, one to three hours before bedtime, but
    only when the day is worth a word: a storm, snow, a hot or cold day, a jump of 8 °C
    from the day before, rain, or sun after rain ("snow tomorrow!!").
  - The season's first snow and first frost (from the weather entity's temperature) are
    a moment once each winter, kept as memories in the journal. They notify too.
  - It passes on news an automation tells it ("did you hear? Tamagotchi turns 30!"),
    at most every 30 minutes. See [Sharing news with the pet](#sharing-news-with-the-pet).
- **Sickness:** health below 25, four care misses in a day, old poop, or being too heavy.
  Medicine cures it. **It never dies.**
- **Upbringing:** on reaching adulthood, how it was raised sets its upbringing for
  life. Each care miss while growing up costs 6 of 100 care points; the score is
  70% care and 30% discipline. The status screen shows what it's on track for.

  | Upbringing | Score | As an adult |
  | --- | --- | --- |
  | Devoted | 80+ | Gets hungry and bored 20% more slowly; hands its trait down one star deeper |
  | Steady | 50+ | As usual |
  | Scrappy | below 50 | Whines half as often again (it never hurts it) |

  A pet with no care misses and a little discipline (35 or more) grows up devoted;
  it takes about five misses, with no scolding, to grow up scrappy.
- **Traits:** the pet picks up habits from your house and keeps them for life, up
  to **four** (an inherited one counts; once it has four it learns no more). Only
  time it spends awake counts, and traits only ever add a little happiness (all
  house bonuses together stay under the cap of +3 an hour). Each pet has its own
  **temperament**, rolled when it hatches: it takes to some things sooner than
  others (each threshold below ×0.6 to ×1.6), so pets raised in the same house
  can still turn out differently.

  | Trait | Learned from | While it happens |
  | --- | --- | --- |
  | Night owl | 10 h up during sleep hours | Stays up twice as long before dozing off; +0.5 an hour up late |
  | Music lover | 12 h of music | +1.5 an hour on top of the music bonus |
  | Homebody | someone home ≥ 75% of 48+ awake hours (needs the home zone) | +0.5 an hour with company |
  | Sun lover | 20 h of sunshine | +1 an hour on sunny days |
  | Fireside | 10 h by a lit fireplace | +1 an hour by the fire |
  | Moon child | 3 h awake under a full moon | +1 an hour under a full moon |
  | Storm watcher | 15 h of rain | +0.5 an hour while it rains |
  | Couch potato | 12 h of TV | +0.5 an hour watching TV |
  | Social butterfly | 2.5 h of greetings (about 15 arrivals) | +1 an hour while greeting |
  | Snow child | 6 h of snow | +0.5 an hour while it snows |
  | Breeze rider | 10 h of wind | +0.5 an hour while it's windy |
  | Fog wanderer | 8 h of fog | +0.5 an hour while it's foggy |
  | Thunder heart | 2 h of thunderstorms | +0.5 an hour during a storm |
  | Early bird | 7 mornings the house stirred within an hour of wake time (needs motion sensors) | +0.5 an hour for two hours after wake time |
  | Helper | 10 chore treats | +4 more happiness per chore treat |
  | Player | 15 games finished | +4 more happiness per game won |

  **On the card**, a pet's traits show as little flair around it (never drawn on it)
  about once a minute: above its head (a rain cloud, a thunder flicker, a sunrise,
  the moon), in the air around it (notes, a butterfly, snowflakes, leaves,
  fireflies, sun glints) or at its feet (embers, mist, a broom, a ball, a cushion,
  popcorn). One trait per place at a time, so a pet's mix shows as one picture;
  deeper traits show a little more. Not during games, sleep or the status screen;
  with reduced motion it stands still.

  Traits have levels, ★ to ★★★: effects are ×1, ×1.5 and ×2. A new egg
  inherits one of its parent's traits at the parent's level (shown with ↓). If
  the child also learns it for itself, it goes up a level, so a trait kept in the
  family deepens over the generations. Seasonal traits (sun lover, fireside) carry
  through the seasons this way.
- **Generations:** a week into adulthood the card offers "lay an egg?" (two taps,
  so it can't happen by accident), as long as the pet isn't sick. Nothing ends until you choose it, so a favourite
  pet can stay forever. The adult retires to the journal and a new egg takes its
  place; it inherits one of the parent's traits and, as always, prefers a creature
  this device hasn't raised yet.
- **Choosing the next egg:** to pick the creature instead of a surprise, set
  `select.<pet>_next_egg` (on the pet's device page, under Configuration) before the
  egg hatches, for example before laying it. It lists the egg's world, the new one if
  a world change is waiting. The choice is for one egg; the next is a surprise again.
- **The journal:** on the status screen, tap "journal". It shows the world's
  creatures (ones nobody in this home has raised yet are silhouettes) and this
  device's family line: each generation with its traits, stars and upbringing.
- **Notifications:** opt in per person. On the status screen, tap "notify me" to get
  this pet's calls, sickness, hatching, growing up, new or deeper traits, the season's
  first snow and frost, new eggs, and a holiday greeting on the morning of Halloween
  ("Happy Halloween! Pip is dressed up and ready to trick or treat 🎃") and of
  Thanksgiving ("Happy Thanksgiving! Pip is thankful for you 🦃") on your phone, through
  the Home Assistant app. It only changes them for whoever is signed in; each person
  chooses for themselves. Automations can use `virtual_pet.notify_me` the same way.
  A call's notification has buttons that answer it (Feed, Clean, Medicine, Lights
  out; Play or Scold for a plea to play), and it clears itself once the call is
  answered or missed. Fast-forward never notifies.
- **Sounds:** off until you turn them on. On the status screen, tap "sounds here"
  for little chirps when the pet calls, hatches, learns a trait or wins a game. It
  only changes this browser, and the pet stays quiet while it sleeps and from 21:00
  to 08:00.
- **A welcome for every new pet.** Adding a pet through the integration tells the
  whole house: "Pip, a new virtual pet, just moved in! Say hi ♥" It goes to every phone with
  the Home Assistant app, whether or not anyone tapped "notify me", and to the
  notifications in the sidebar. A new generation laid as an egg isn't a new pet,
  and restarts never welcome again.
- **Dashboard to open:** when you add a pet (or later, in its options under
  Notifications), pick the dashboard that tapping its notifications opens, the
  welcome included, or type a path like `/lovelace/pets`.
- **Restarts never hurt it.** HA downtime freezes the pet: nothing decays,
  ages or expires while HA is off.

## Talking to it through Assist

Ask "how's Pip?" and the pet answers in its own words ("Pip is hungry: a little
peckish."), and names its traits if it has learned any. Ask "feed Pip" and it's the same as pressing the button, logged under
your name.

- **LLM agents** (Claude, OpenAI, Ollama and others set to control Home Assistant)
  get two tools, `virtual_pet__status` and `virtual_pet__care`, with nothing to set
  up. The fast-forward debug action is never offered.
- **The built-in agent** needs sentences: copy
  [`docs/custom_sentences/en/virtual_pet.yaml`](custom_sentences/en/virtual_pet.yaml)
  to `<config>/custom_sentences/en/`, put your pets' names in its list, and restart.
  It covers "how's Pip doing", "feed Pip", "give Pip a treat", "play with Pip",
  "clean up after Pip", "give Pip medicine", "scold Pip", "praise Pip", "tuck Pip in",
  "give Pip a fan", "lights out, Pip" and, with one pet, "how's my pet" and "feed my pet". English only.
- A pet answers only if at least one of its entities is exposed to that assistant
  (Settings → Voice assistants → Expose). Its lights-out switch is exposed by default.
- The intents are `VirtualPetStatus` (slot `pet`, optional with one pet) and
  `VirtualPetCare` (slots `pet` and `action`: `feed`, `snack`, `play`, `clean`,
  `medicine`, `scold`, `praise`, `blanket`, `fan`, `lights_out`), for your own
  sentences.

## Sharing news with the pet

`virtual_pet.share_news` hands the pet a headline, and it says it in its speech bubble
on the card for a few seconds, like a TV title: "did you hear? …", "guess what? …",
"ooh, news! …", or "<topic> news! …" when you give a topic.

| Field | | |
| --- | --- | --- |
| `entity_id` | required | Any entity of the pet; a list for several pets. |
| `headline` | required | What the pet says. Spaces and line breaks are tidied, and anything past 60 characters is cut at a word with "…". |
| `topic` | optional | A short label such as the feed's name (up to 20 characters). |

- **Cosmetic only.** No stat changes, no excited mood, nothing saved, no notification.
- **Not while it's asleep, away or still an egg:** the news is dropped, not saved for
  later, like the other passing moments. It never wakes the pet.
- **At most one bit of news every 30 minutes per pet.** Anything sooner is dropped, so a
  burst of stories shows only the first. Dropped news doesn't start the wait.
- With "return response" it answers per pet (by config entry ID) with `shared`,
  `asleep`, `away` (only with privacy off; otherwise `asleep`), `egg` or `too_soon`.

For example, when a news sensor's latest headline changes:

```yaml
triggers:
  - trigger: state
    entity_id: sensor.example_pet_news
    attribute: title
conditions:
  - condition: template
    value_template: "{{ trigger.to_state.attributes.title not in [None, ''] }}"
actions:
  - action: virtual_pet.share_news
    data:
      entity_id: button.pip_feed
      headline: "{{ trigger.to_state.attributes.title }}"
      topic: "{{ trigger.to_state.attributes.source | default('') }}"
```

## Events

Fired on the HA event bus, each with `pet_id` (the config entry ID). No person
names are included.

`virtual_pet_call_started`, `virtual_pet_call_answered`, `virtual_pet_care_miss`,
`virtual_pet_discipline_miss`, `virtual_pet_pooped`, `virtual_pet_became_sick`,
`virtual_pet_recovered`, `virtual_pet_fell_asleep`, `virtual_pet_woke_up`,
`virtual_pet_stage_changed` (with `upbringing` on reaching adulthood), `virtual_pet_care`, `virtual_pet_hatched`,
`virtual_pet_request_answered`, `virtual_pet_went_away`, `virtual_pet_came_home`,
`virtual_pet_game_finished` (with `game`, `won`, `wins`), `virtual_pet_chore_treat`,
`virtual_pet_sunrise`, `virtual_pet_sunset`, `virtual_pet_good_morning`,
`virtual_pet_watching` and `virtual_pet_listening` (with `title`, and `artist` for music),
`virtual_pet_tv_off_late`, `virtual_pet_news` (with `headline`, and `topic` if given),
`virtual_pet_first_snow`, `virtual_pet_first_frost`,
`virtual_pet_trait_learned` and `virtual_pet_trait_deepened` (with `trait`, `level`), `virtual_pet_egg_laid` (with `generation`,
`parent_species`, `inherited_trait`), `virtual_pet_welcomed` (once, when the pet is added),
`virtual_pet_wish_made` and `virtual_pet_wish_granted` (with `kind`),
`virtual_pet_bond_up` (with `user`, the HA user ID, `level`, and `nickname` or
`favourite` when the level brings one), `virtual_pet_bond_favourite` (with `user` and
`game`), `virtual_pet_friend_home` (with `user`: a close friend came home),
`virtual_pet_bond_record` (with `user`, `game`, `wins`: a new personal best),
`virtual_pet_tucked_in` (with `user`). What it notices about someone's day, where
they've been, their alarm and their answers are never an event: they go only to
that person, in `virtual_pet.visit`'s response, and answers come in through the
websocket command `virtual_pet/answer`, which (unlike a service call) puts nothing
on the event bus.

Events fired during a fast-forward carry `simulated: true`.

### Let the house answer a call (blueprint)

[![Import the blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Falpine-vortex%2Fhatch-at-home%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fvirtual_pet%2Fcall_response.yaml)

An optional automation blueprint: when the pet calls, lamps you pick blink or glow a
colour for a moment, and a speaker can play a short sound. Nothing happens until you
make an automation from it. HACS doesn't install blueprints, so import it with the
button, or under Settings → Automations & scenes → Blueprints → Import, from
`https://github.com/alpine-vortex/hatch-at-home/blob/main/blueprints/automation/virtual_pet/call_response.yaml`.

- Only lamps that are already on are touched, and never their brightness, so a dark
  room stays dark and the pet doesn't sense a brighter room. A colour pulse puts the
  lamps back as they were.
- Quiet hours (22:00–07:00 by default) mute the sound, not the lamps.
- After a response, further calls are ignored for the cooldown (30 minutes by
  default). Fast-forward calls are ignored.
- A fake call (see "How the pet works") looks the same as a real one, here too.

## Testing with fast-forward

Developer Tools → Actions → **Virtual Pet: Fast forward**, with `hours: 6`. The
pet lives those hours instantly at normal rates, with nobody caring for it, so
unanswered calls become care misses. Tick "return response" to see the
events. Admin only.

## Recorder

Long attributes (the care log, mood flags, debug detail) are already kept out
of the history database. Optionally drop the debug sensor completely:

```yaml
recorder:
  exclude:
    entity_globs:
      - sensor.*_debug
```

## Development

Never develop against your live HA. This repo includes a throwaway instance.

```sh
scripts/setup     # .venv with HA 2026.10 + test tools (needs uv, Python 3.14)
scripts/test      # ruff + pytest
scripts/develop   # throwaway HA at http://localhost:8123, config in dev/config
scripts/card-check  # with develop running: drives the card in Chromium (Playwright)
```

`scripts/card-check` onboards a fresh instance (user `dev`, password `devdevdev`) and
creates two pets if there are none. It then checks the shelf, status and journal
screens, a full game, the reactions to moments, the egg's frames and the card editor,
and saves screenshots to `dev/card-check/`.

`dev/config/configuration.yaml` has stand-in entities (fake weather, lux,
indoor temperature, AQI, motion, presence and music) for the home-awareness
phases.

To release: bump the version in `const.py`, `manifest.json` and
`frontend/hatch-pet-card.js` and push. Then on GitHub open Actions → Release →
Run workflow. It tags that commit with the manifest's version and publishes a
GitHub release, which is what HACS offers as an update. (Pushing a tag like
`v0.6.1` does the same.) The Validate workflow runs
HACS's and Home Assistant's checks and the tests on every push.

## Roadmap

0. ✅ Test bench
1. ✅ Living pet
2. ✅ The card: device shelf, sprites, speech bubble, poop, attention icon, status screen
3. ✅ Home awareness: options (entity mapping, bedtime, privacy), weather, light, bedtime, presence, activity, AQI and requests
4. Life (in progress): ✅ traits, ✅ generations and journal, ✅ moon, ✅ notifications, ✅ adult forms, ✅ upbringing, ✅ weight; still to come: bird visits from BirdNET-Pi
5. ✅ HACS packaging
6. Play (in progress): ✅ chore treats, ✅ the left or right game, ✅ higher or lower, ✅ talking to it through Assist; still to come: more species

## License

MIT, see `LICENSE`. The bundled Tiny5 font is under the SIL Open Font License
(`custom_components/virtual_pet/frontend/fonts/OFL.txt`).
