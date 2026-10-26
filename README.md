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
Woodland (the bird and the Douglas squirrel), and a sandstone tank for Terrarium (the
leopard gecko, with the red-knee tarantula to come). The egg decides which of that world's
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
   then name your pet and pick its world: Woodland (bird) or Terrarium (leopard
   gecko). Add the integration again for each extra pet device.

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
- Tap the screen for the status page: hearts, meters, care misses and who did what
  recently. Tap again to go back.
- Every tap answers straight away: the button sinks, a ring pops out, the pet perks up
  and phones give a tiny vibration. Then the real reaction follows (a food bowl, a
  sparkle, or a refusal like "I'm full!"). If HA rejects the press, the button shakes
  and the pet says so.
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
never wakes the pet.

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
| Fireplace | none | Any entity that's on, heating or above 0 when lit. Curls up by it and gets a little happier. | `switch.fireplace` |
| Light sensors | none | 100 lx or more at night also counts as too bright. | optional |

### People and activity

| Field | Default | What it does | This house |
| --- | --- | --- | --- |
| Home zone | `zone.home` | Counts the people in it. Someone arriving gets an excited greeting, at most once every 30 minutes. | `zone.home` |
| Go to the sitter's after | 2 h | With nobody home this long, the pet is frozen: no hunger, no aging, no calls. | 2 h |
| TVs | none | On or playing: watches along (small bonus). | `media_player.tv` |
| Music players | none | Playing anything but video: dances (small bonus). | your speakers |

### Privacy

| Field | Default | What it does |
| --- | --- | --- |
| Keep presence private | on | An empty house shows the pet napping, never at the sitter's, and the pet never names anyone. Turn it off to see "at the sitter's". |

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
4. Life: adult forms, traits, generations, journal, sky events (plus bird visits from BirdNET-Pi), notifications
5. ✅ HACS packaging
6. Chores, minigames, more species
