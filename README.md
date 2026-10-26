# Hatch at Home

A Tamagotchi-style virtual pet that lives inside Home Assistant. Later phases
let the real house (weather, light, bedtime, who's home) shape its mood and
scenery. **The house can never hurt the pet**; it only changes how the pet
looks, what it says and what it asks for.

Status: **phase 2, the card**. The pet lives in HA (stats, calls, care misses,
poop, sleep, care buttons, restart catch-up, fast-forward), and every pet sits on
a pixel-art **device shelf** card. Home awareness comes in phase 3.

Each pet lives in a **device** themed for its **world**: an orange egg-shaped toy for
Woodland, and a sandstone tank for Terrarium. The egg decides which of that world's
creatures hatches. See `docs/design-worlds.md`.

## Install (phases 1–3: manual copy)

1. **Take a backup first**: Settings → System → Backups → Back up now.
2. Copy `custom_components/virtual_pet/` from this repo into your HA config
   folder, so you end up with `/config/custom_components/virtual_pet/manifest.json`.
   The Samba share, the SSH add-on or the Studio Code Server add-on all work.
3. Restart HA: Settings → System → power icon (top right) → Restart Home Assistant.
4. Settings → Devices & services → Add integration → search **Virtual Pet**,
   then name your pet and pick its world (only Woodland, with the bird, is ready so
   far). Add the integration again for each extra pet device.

### Add the card (once)

The integration serves the card itself; you only tell the dashboard about it.

1. Turn on Advanced mode: click your name (bottom left) → Advanced mode.
2. Settings → Dashboards → ⋮ (top right) → Resources → Add resource:
   - URL: `/virtual_pet/frontend/hatch-pet-card.js?v=0.3.1`
   - Type: JavaScript module
3. Reload the browser page. On a phone or wall tablet, pull to refresh, or
   clear the app's frontend cache if the card doesn't appear.
4. Edit a dashboard → Add card → search **Hatch at Home pet shelf**. With no
   settings it shows every pet. To show only some, pick any one entity of each.
   In YAML:

   ```yaml
   type: custom:hatch-pet-card
   # optional:
   entities:
     - sensor.pip_mood
   ```

**After each update**, bump the `?v=` number in the resource URL to the new
version (shown in `manifest.json`), so browsers fetch the new card instead of
a cached one.

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
`virtual_pet_stage_changed`, `virtual_pet_care`.

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
3. Home awareness: options flow (entity mapping, bedtime, privacy), weather, light, bedtime, presence, then activity, AQI and requests
4. Life: adult forms, traits, generations, journal, sky events (plus bird visits from BirdNET-Pi), notifications
5. HACS packaging, chores, minigames, more species
