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
Woodland (the bird), and a sandstone tank for Terrarium (the leopard gecko, with the
blue death-feigning beetle to come). The egg decides which of that world's
creatures hatches. See `docs/design-worlds.md`.

## Install (manual copy until HACS packaging)

1. **Take a backup first**: Settings → System → Backups → Back up now.
2. Copy `custom_components/virtual_pet/` from this repo into your HA config
   folder, so you end up with `/config/custom_components/virtual_pet/manifest.json`.
   The Samba share, the SSH add-on or the Studio Code Server add-on all work.
3. Restart HA: Settings → System → power icon (top right) → Restart Home Assistant.
4. Settings → Devices & services → Add integration → search **Virtual Pet**,
   then name your pet and pick its world: Woodland (bird) or Terrarium (leopard
   gecko). Add the integration again for each extra pet device.

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
- Tap the screen for the status page: hearts, meters, care misses and who did what
  recently. Tap again to go back.
- The toy buttons press the pet's button entities, so anything you do here works
  from automations and voice too. A button glows when the pet needs it, for example
  Feed when it's hungry. Medicine is greyed out unless it's sick.
- The scene follows the sun (`sun.sun`), and dims when the lights are out.

**Updating:** replace the folder with the new copy and restart. The pet's
save file lives in `/config/.storage/virtual_pet.<entry id>` and is kept.
Restoring an HA backup rewinds the pet to that point, which is fine.

## What you get

One device named after your pet, with:

| Entity | What it is |
| --- | --- |
| `sensor.<pet>_hunger`, `_happiness`, `_energy`, `_health`, `_discipline` | Stats, 0–100 whole numbers. Hunger is a fullness meter: 100 is stuffed. |
| `sensor.<pet>_mood` | `egg`, `away`, `sick`, `asleep`, `calling`, `hungry`, `dirty`, `sleepy`, `bored`, `excited`, `cozy` or `content`. Attributes: `flags`, `reason` (what the speech bubble will say), `call_deadline`. |
| `sensor.<pet>_life_stage` | `egg` → `baby` (30 min) → `child` (1 day) → `teen` (5 days) → `adult` (14 days). |
| `sensor.<pet>_poop`, `_care_misses` | Poop on screen (max 3) and care misses so far. |
| `sensor.<pet>_last_care` | When it was last cared for. Attribute `log`: the last 20 actions and who did them. |
| `binary_sensor.<pet>_asleep`, `_calling`, `_sick` | |
| `switch.<pet>_lights_out` | On puts it to bed, off wakes it. |
| `button.<pet>_feed`, `_snack`, `_play`, `_clean`, `_medicine`, `_scold`, `_praise` | Care. Medicine is unavailable unless the pet is sick. |
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

Settings → Devices & services → Virtual Pet → **Configure** on your pet. Every field is
optional; anything you leave empty is ignored. Changes apply straight away.

| Section | Field | Suggested for this house |
| --- | --- | --- |
| Sleep | Bedtime / wake time | 23:00 / 07:00 |
| | Bedtime lights | the **bedroom** lights: when they're all off at bedtime and the house is quiet, the pet goes to bed |
| | Motion sensors | indoor occupancy sensors (living room, office, dining room, kitchen) |
| Weather | Rain sensor | `input_boolean.raining` (your rain automations), or the Ambient station's `sensor.weather_hourly_rain`, which lingers about an hour after rain stops |
| | Solar radiation sensor | leave empty: this station doesn't report it, so sunny comes from the forecast |
| | Weather entity | `weather.forecast_home` (sunny, snow and fog) |
| | Indoor temperature | `sensor.indoor_temperature` |
| | Air quality | `sensor.air_quality_index` |
| The pet's room | Room lights | the **living room** lights |
| | Light sensors | optional |
| | Fireplace | `switch.fireplace` (your "Fireplace"): when it's on, the pet curls up by it |
| People and activity | Home zone | `zone.home` |
| | Music players | your speakers and displays |
| | TVs | `media_player.tv` |
| Privacy | Keep presence private | on |

**What the house does (it never hurts the pet):**
- **Rain** (rain gauge above 0): rainy scene and a **"blanket?"** request. **Too cold or
  warm indoors:** shivers or sweats and asks for a **blanket** or a **fan**. Tap the
  request bubble on the card, or press the Blanket or Fan button, for a happiness boost
  and a couple of cozy hours.
- **Sun** (solar radiation 300 W/m² or more), **music** and **TV**: small happiness
  bonuses. Sunny, music and TV can't add up to more than +3 an hour.
- **Bright living-room light late at night:** it squints and says so. Dim evening light
  makes it cozy. Daylight is never too bright.
- **Bedtime:** lights-out still wins. Otherwise, within an hour of bedtime, bedroom lights
  off and 10 quiet minutes put it to bed. A bedroom light left on late doesn't keep it
  up past its own bedtime, and the house never wakes it.
- **Arriving home:** an excited greeting (once per 30 minutes, so GPS jitter doesn't
  repeat it). **Nobody home for 2 hours:** it goes to the sitter's and time stops for it.
  With privacy on, dashboards show it napping, never an empty house.
- **Sensors dropping out:** a sensor that goes unavailable keeps its last value for 10
  minutes, then counts as unmapped. It never reads as dark or empty.
- After an HA restart, motion sensors all look freshly changed, so bedtime-by-darkness
  waits 10 minutes.

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
- **Poop:** a meal comes out about 2 hours later. Poop older than an hour slowly
  costs health and may make it sick. *Clean* flushes it.
- **Sleep:** bedtime 23:00, wake 07:00 (editable from phase 3). Lights-out puts it
  to bed; outside sleep hours that's a nap that ends when it's rested. Left up
  past bedtime, it dozes off on its own after an hour with no penalty. Turning
  lights-out off during sleep hours costs a little happiness. No calls while asleep.
- **Sickness:** health below 25, four care misses in a day, or old poop.
  Medicine cures it. **It never dies.**
- **Restarts never hurt it.** HA downtime freezes the pet: nothing decays,
  ages or expires while HA is off.

## Events

Fired on the HA event bus, each with `pet_id` (the config entry ID). No person
names are included.

`virtual_pet_call_started`, `virtual_pet_call_answered`, `virtual_pet_care_miss`,
`virtual_pet_discipline_miss`, `virtual_pet_pooped`, `virtual_pet_became_sick`,
`virtual_pet_recovered`, `virtual_pet_fell_asleep`, `virtual_pet_woke_up`,
`virtual_pet_stage_changed`, `virtual_pet_care`, `virtual_pet_hatched`,
`virtual_pet_request_answered`, `virtual_pet_went_away`, `virtual_pet_came_home`.

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

## Roadmap

0. ✅ Test bench
1. ✅ Living pet
2. ✅ The card: device shelf, sprites, speech bubble, poop, attention icon, status screen
3. ✅ Home awareness: options (entity mapping, bedtime, privacy), weather, light, bedtime, presence, activity, AQI and requests
4. Life: adult forms, traits, generations, journal, sky events (plus bird visits from BirdNET-Pi), notifications
5. HACS packaging, chores, minigames, more species
