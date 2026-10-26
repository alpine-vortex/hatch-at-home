# Hatch at Home

A Tamagotchi-style virtual pet that lives inside Home Assistant. Later phases
let the real house (weather, light, bedtime, who's home) shape its mood and
scenery. **The house can never hurt the pet**; it only changes how the pet
looks, what it says and what it asks for.

Status: **phase 3, home awareness**. The pet lives in HA (stats, calls, care misses,
poop, sleep, care buttons, restart catch-up, fast-forward), sits on a pixel-art
**device shelf** card, and now reacts to your house: weather, indoor temperature,
lights, bedtime, people coming and going, and the TV and music.

Each pet lives in a **device** themed for its **world**: an orange egg-shaped toy for
Woodland (the bird and the Douglas squirrel), a sandstone tank for Terrarium (the
leopard gecko, with the red-knee tarantula to come), a little red house for Hearth
(the tabby kitten and the lop bunny), and a riveted porthole for Tidepool (the sea otter and the giant Pacific octopus,
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
   then name your pet and pick its world: Woodland (bird, squirrel), Terrarium
   (leopard gecko), Hearth (kitten, bunny), Tidepool (sea otter, octopus) Pond (tree frog, axolotl) or Night Sky (bat, luna moth). Add the integration again for each extra pet device.

### Updating

With HACS, new versions appear under Settings → Updates. Install, restart HA,
then reload the browser page. By hand, copy the folder over the old one and do the
same. Either way your pets are safe: they live in HA's own storage, not in the
integration folder.

Moving a manual install to HACS needs nothing special: add the custom repository,
download, restart. HACS replaces the folder you copied.

### Add the card

The integration loads the card on every dashboard by itself; there's no resource
to add and no Advanced mode needed. After installing or updating, restart HA and
reload the browser page. On a phone or wall tablet, pull to refresh.

Edit a dashboard → Add card → search **Hatch at Home pet shelf**. With no settings
it shows every pet. To show only some, pick any one entity of each. In YAML:

```yaml
type: custom:hatch-pet-card
# optional:
entities:
  - sensor.pip_mood
```

**Upgrading from 0.3.x:** you added the card as a dashboard resource back then.
Remove it now (Settings → Dashboards → ⋮ → Resources → delete the
`hatch-pet-card.js` row), or an old cached copy may load first.

### Using the card

- Each pet stands in its device on its world's backdrop. Use the arrows, the dots or a
  swipe to move to the next device.
- The screen shows the pet, its scene and a speech bubble. The bubble says what's on
  its mind, or why it refused something ("I'm full!").
- **Play** starts the left/right game: the pet hides on one side and you guess with the
  arrows. Five rounds; three right guesses win, and a win cheers it up more than plain
  play. ✕ stops the game. (The `play` button entity is still plain play, for
  automations and voice.)
- Tap the screen for the status page: hearts, meters, care misses and who did what
  recently. Tap again to go back.
- Every tap answers straight away: the button sinks, a ring pops out, the pet perks up
  and phones give a tiny vibration. Then the real reaction follows (a food bowl, a
  sparkle, or a refusal like "I'm full!"). If HA rejects the press, the button shakes
  and the pet says so.
- The toy buttons press the pet's button entities, so anything you do here works
  from automations and voice too. A button glows when the pet needs it, for example
  Feed when it's hungry. Medicine is greyed out unless it's sick.
- The pet reacts to what happens to it, even when nobody pressed anything: a missed
  call ("...nobody came"), hatching ("hello!"), growing up, a new trait, a good
  morning, a fair scolding. In its child stage, each creature also has its own
  reactions, like the squirrel stuffing its cheeks with a snack or the kitten's
  zoomies after play.
- The scene follows the sun (`sun.sun`), and dims when the lights are out. Creatures
  without their own rain scene get rain drawn over theirs.
- The sleep button turns into "wake" whenever the pet is asleep, even if it dozed off
  by itself; one tap wakes it.

**Updating:** replace the folder with the new copy and restart. The pet's
save file lives in `/config/.storage/virtual_pet.<entry id>` and is kept.
Restoring an HA backup rewinds the pet to that point, which is fine.

## What you get

One device named after your pet (rename the device to rename the pet; its
notifications and journal follow), with:

| Entity | What it is |
| --- | --- |
| `sensor.<pet>_hunger`, `_happiness`, `_energy`, `_health`, `_discipline`, `_weight` | Stats, 0–100 whole numbers. Hunger is a fullness meter: 100 is stuffed. Weight is healthy between 25 and 75. |
| `sensor.<pet>_mood` | `egg`, `away`, `sick`, `asleep`, `calling`, `hungry`, `dirty`, `sleepy`, `bored`, `excited`, `cozy` or `content`. Attributes: `flags`, `reason` (what the speech bubble will say), `call_deadline`. |
| `sensor.<pet>_life_stage` | `egg` → `baby` (30 min) → `child` (1 day) → `teen` (5 days) → `adult` (14 days). Attributes include `species`, `traits`, `trait_levels`, `inherited_trait`, `trait_progress` (0–1 per trait), `generation`, `upbringing` (final once adult, what it's on track for before) and `journal` (the device's retired pets). |
| `sensor.<pet>_poop`, `_care_misses` | Poop on screen (max 3) and care misses so far (attribute `discipline_misses`: fake calls nobody answered). |
| `sensor.<pet>_last_care` | When it was last cared for. Attribute `log`: the last 20 actions and who did them; `moments`: the last 10 things that happened to it, for the card to react to. |
| `binary_sensor.<pet>_asleep`, `_calling`, `_sick` | |
| `switch.<pet>_lights_out` | On puts it to bed, off wakes it. |
| `button.<pet>_feed`, `_snack`, `_play`, `_clean`, `_medicine`, `_scold`, `_praise` | Care. Medicine is unavailable unless the pet is sick. |
| `button.<pet>_lay_egg` | Starts the next generation. Available from a week into adulthood (day 21), while the pet is well and home. |
| `button.<pet>_blanket`, `_fan` | Answers to what the house makes the pet ask for. Unavailable unless it's asking. |
| `sensor.<pet>_debug` | Diagnostic, **disabled by default**. Enable it on the entity's settings page to see the raw numbers. |

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

| Field | Default | What it does | This house |
| --- | --- | --- | --- |
| Bedtime | 23:00 | Drowsy 30 minutes before. If nobody puts it to bed, it dozes off an hour after. Turning lights-out off after bedtime costs a little happiness. | 23:00 |
| Wake time | 07:00 | It wakes up on its own. | 07:00 |
| Bedtime lights | none | All off (from an hour before bedtime) plus a quiet house means bed. A light left on late doesn't keep it up past its bedtime. | bedroom lights |
| Motion sensors | none | Movement in the last 10 minutes means the house isn't quiet yet. | indoor occupancy sensors |

Lights-out (the switch, or the sleep button on the card) always wins, and the house
never wakes the pet. Flipped while the pet is at the sitter's, it takes effect when
the pet comes home.

### Weather and air

| Field | Default | What it does | This house |
| --- | --- | --- | --- |
| Rain sensor | none | On/off "it's raining", or a rain rate where anything above 0 means rain. Beats the forecast. Rain brings a rainy scene and a **blanket?** request. | `input_boolean.raining` |
| Weather forecast | none | Sunny, snow and fog, and rain when there's no rain sensor. | `weather.forecast_home` |
| Indoor temperature | none | Outside the comfort range: shivers or sweats and asks for a **blanket** or a **fan**. | `sensor.indoor_temperature` |
| Too cold below | 18 °C / 64.5 °F | Shown in your unit system. No blanket request while the fireplace is lit. | default |
| Too warm above | 26.5 °C / 79.5 °F | | default |
| Air quality index | none | Above 100: a little mask, staying in. Cosmetic only. | `sensor.air_quality_index` |
| Solar radiation | none | Only if your weather station reports W/m². 300 or more counts as sunny. | leave empty |

### The pet's room

| Field | Default | What it does | This house |
| --- | --- | --- | --- |
| Room lights | none | At half brightness or more, from an hour before bedtime: squints, "too bright, it's late!". Dim evening light makes it cozy. Daylight never counts. | living room lights |
| Fireplace | none | Any entity that's on, heating or above 0 when lit (not a thermometer: that's always above 0). Curls up by it and gets a little happier. | `switch.fireplace` |
| Light sensors | none | 100 lx or more at night also counts as too bright. | optional |

### People and activity

| Field | Default | What it does | This house |
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
| Keep presence private | on | An empty house shows the pet napping, never at the sitter's (care while it's away is refused as "asleep"), and the pet never names anyone. Turn it off to see "at the sitter's". |

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
- **Sleep:** bedtime 23:00, wake 07:00 (editable from phase 3). Lights-out puts it
  to bed; outside sleep hours that's a nap that ends when it's rested. Left up
  past bedtime, it dozes off on its own after an hour with no penalty. Turning
  lights-out off during sleep hours costs a little happiness. No calls while asleep.
- **Weight:** 0–100, healthy between 25 and 75. Meals (+4) and snacks (+6) add to it;
  being awake (−0.7 an hour), play (−3) and the game (−4) burn it off. Three meals a
  day roughly balance out, so snacks are what tip it. Too heavy or too light, it
  stops healing; too heavy, it can also get sick. Starving loses weight.
- **The game:** five rounds of left or right from the card (or `virtual_pet.play_game`,
  which answers with where the pet went). It costs energy like play, and an
  unfinished game is dropped after 3 minutes.
- **Chores:** map a to-do list in the options, and every item ticked off earns a treat.
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
- **Traits:** the pet picks up habits from your house and keeps them for life.
  Only hours it spends awake count, and traits only ever add a little happiness
  (all house bonuses together stay under the cap of +3 an hour).

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
- **The journal:** on the status screen, tap "journal". It shows the world's
  creatures (ones nobody in this home has raised yet are silhouettes) and this
  device's family line: each generation with its traits, stars and upbringing.
- **Notifications:** opt in per person. On the status screen, tap "notify me" to get
  this pet's calls, sickness, hatching, growing up, new traits and eggs on your phone, through
  the Home Assistant app. It only changes them for whoever is signed in; each person
  chooses for themselves. Automations can use `virtual_pet.notify_me` the same way.
  Fast-forward never notifies.
- **Restarts never hurt it.** HA downtime freezes the pet: nothing decays,
  ages or expires while HA is off.

## Events

Fired on the HA event bus, each with `pet_id` (the config entry ID). No person
names are included.

`virtual_pet_call_started`, `virtual_pet_call_answered`, `virtual_pet_care_miss`,
`virtual_pet_discipline_miss`, `virtual_pet_pooped`, `virtual_pet_became_sick`,
`virtual_pet_recovered`, `virtual_pet_fell_asleep`, `virtual_pet_woke_up`,
`virtual_pet_stage_changed` (with `upbringing` on reaching adulthood), `virtual_pet_care`, `virtual_pet_hatched`,
`virtual_pet_request_answered`, `virtual_pet_went_away`, `virtual_pet_came_home`,
`virtual_pet_game_finished` (with `won`, `wins`), `virtual_pet_chore_treat`,
`virtual_pet_trait_learned` and `virtual_pet_trait_deepened` (with `trait`, `level`), `virtual_pet_egg_laid` (with `generation`,
`parent_species`, `inherited_trait`).

Events fired during a fast-forward carry `simulated: true`.

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
```

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
4. Life (in progress): ✅ traits, ✅ generations and journal, ✅ moon, ✅ notifications, ✅ adult forms; still to come: bird visits from BirdNET-Pi
5. ✅ HACS packaging
6. Chores, minigames, more species

## License

MIT, see `LICENSE`. The bundled Tiny5 font is under the SIL Open Font License
(`custom_components/virtual_pet/frontend/fonts/OFL.txt`).
