# Real-time connections, 2026-10-27 (a review, nothing built yet)

The owner liked the pet commenting on news (`virtual_pet.share_news`, 0.25.0) and
asked what else could connect the pet to the outside world in real time. This is a
list of options for the owner to choose from. Nothing here is started.

The rules stay the same for everything below: **cosmetic only** (no stat or mood
change, like news), **never hurts the pet**, nothing that feels like surveillance,
and the owner's past calls hold (calendar celebrations and learning household
routines not chosen, BirdNET deferred).

## What the pet already senses

Weather is already the deepest connection, but almost all of it is **ambient
state**, not commentary. A flag (`rainy`, `sunny`, `windy`...) sets the pet's mood
line while it lasts; only a few things are *passing moments* the pet remarks on
once, the way it does with news:

| Passing moments today | Ambient flags today |
| --- | --- |
| sunrise, sunset, good morning, good night | storm, rainy, snowy, sunny, foggy, windy |
| TV and music titles, the TV going off late | chilly, warm, too bright, dim, fireside |
| the season's first snow and first frost (kept in the journal) | dancing, watching TV, full and new moon, bad air |
| news (`share_news`) | greeting when someone comes home |

News works because it is **new**, **specific** and **brief**. The weather side
lacks exactly that: the pet says "rainy day, blanket please?" for as long as it
rains, but never "oh! it started raining" or "it stopped!", and it never looks
ahead.

## Tier 1: weather commentary (no new setup; one release)

All of this reads the weather entity the owner has already mapped.

1. **Weather changes as moments (S).** `HouseMoments` already tracks sunrise and
   sunset as transitions; the same for weather:
   - rain starts ("ooh, it's raining!") and stops ("the rain stopped!");
   - rain stops while the sun is up: "is there a rainbow?";
   - the sun comes out after cloud or rain; snow starts falling.
   - A cooldown per kind, like `HOME_MEDIA_COOLDOWN_MINUTES`, so showery days
     don't chatter. The local rain gauge (`CONF_RAIN`) decides start and stop when
     mapped, as it does for the flag.
2. **Forecast talk (M), the best match for news.** HA's
   `weather.get_forecasts` (daily and hourly) gives the pet something to look
   forward to:
   - in the morning, folded into the good-morning moment: "high of 24 today!",
     "rain later...";
   - in the evening, before bed: "snow tomorrow!!", "sunny tomorrow~";
   - only notable things (snow, a storm, a big jump in temperature, the first
     sunny day after rain), so it stays a surprise rather than a weather report.
   - Fetched at most hourly and cached in memory; a provider without forecasts
     simply gives no forecast talk.
3. **Wind from the wind speed (S, a fidelity fix).** `windy` comes only from the
   condition string, which many providers seldom report, so the flag and the
   breeze rider trait may hardly ever fire. Reading the weather entity's
   `wind_speed` (and gusts, where present) above a threshold would fix both.
   Worth checking on the owner's HA first: how often the debug sensor shows
   `windy` today.
4. **Outdoor temperature (S).** `outdoor_c` is read but used only for first frost.
   Passing moments for a hot day or a cold snap ("−5 out there, brr!"), using the
   forecast high and low where available.

Card work: new moment types need phrasing in the card's moment switch (next to
`news`), checked at 420 and 330 px like news was.

## Tier 2: new optional mappings (each small, each opt-in)

Each adds an optional entity in the options flow and a passing moment or flag.

| Source | What the pet does | Notes |
| --- | --- | --- |
| **Robot vacuum** (`vacuum` cleaning) | hides or chases it: "the vroom-vroom is back!" | High charm for little work; a flag while it runs plus a moment when it starts. Art could come later; a CSS hop does for a start. |
| **Doorbell** (an `event` or binary sensor) | "someone's at the door!" | Moment only, never a camera or a name. Cooldown. |
| **Appliance done** (washer, dishwasher) | "the washer's finished!" | Mildly useful as well as cute. Could equally be a blueprint on `share_news` (Tier 3). |
| **Pollen** | sneezes, like `masked` for bad air | Cosmetic; integrations vary, so a numeric entity and a threshold. |
| **Lightning distance** (e.g. Blitzortung) | hears the storm coming before the forecast says so | Feeds the existing `storm` flag earlier. |
| **Season** (HA's `season` sensor) | first day of spring, the longest night, kept in the journal like first snow | Astronomical, not a calendar celebration; the owner should still say whether it's too close to what was declined. Fits Night Sky especially. |
| **The space station overhead** (an ISS sensor, if the owner has one) | Night Sky pets: "a star is moving!" | Fun but niche. |

## Tier 3: no integration code (blueprints on `share_news`)

`share_news` takes any headline, so many real-time sources need only an
automation. Today the owner has to write that automation by hand. Blueprints,
like the call-response one, make each a one-click import:

- **News from a feed:** HA's `feedreader` event → `share_news` with a topic. The
  most direct follow-up to what the owner liked. Strips feed titles already
  (`home.news_text`), and the 30-minute cooldown keeps a busy feed calm.
- **Say it when something changes:** pick an entity and a template, e.g. a sports
  score (TeamTracker), a package tracker, an appliance finishing. One general
  blueprint covers many sources.

A blueprint ships without a release (it's imported from `main`), as the call
response did.

## Not recommended

- **Severe weather alerts through the pet.** A cute bubble downplays a real
  warning, and a frightened pet goes against the spirit of "the house never
  hurts it". The storm flag is enough; alerts belong to real notifications.
- **Who exactly is arriving, phone locations, cameras.** Surveillance feel, and
  the privacy rule.
- **Calendar events and birthdays, household routines.** Declined by the owner.
- **Prices, stocks, crypto.** Mostly bad news, and nothing for the pet to enjoy.
- **BirdNET visits** stay deferred; they're the natural next "outside world"
  piece when the owner revives them.

## Suggested order

1. Tier 1 as one release: weather changes, forecast talk, wind from wind speed,
   outdoor temperature. Tests in `tests/` like the house-moment ones; card
   phrasing checked in the browser.
2. The news-feed blueprint (and the general "say it" blueprint), no release.
3. Whichever Tier 2 sources the owner actually has; the vacuum first if they have
   one.

Open questions for the owner: which of these they want, whether their weather
provider gives forecasts and wind speed (the debug sensor or a diagnostics
download would tell), and whether the season moments are too close to the
declined calendar celebrations.
