"""How the house shapes the pet. Pure Python, no Home Assistant imports.

The coordinator turns the owner's mapped entities into a Readings snapshot,
with None meaning "no signal": unmapped, or unavailable for longer than the
hold time. evaluate() turns that into a HomeEffect: mood flags, requests the
player can answer, small positive per-hour bonuses, and whether the house is
dark and quiet enough for bed.

Rule: the house never hurts the pet. Nothing here lowers a stat.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import rates as R

# Home flags, and what the pet says about them, highest priority first.
REASONS: dict[str, str] = {
    "greeting": "you're back!!",
    "storm": "eek, thunder!",
    "too_bright": "too bright, it's late!",
    "chilly": "brr... a blanket?",
    "warm": "so warm... a fan?",
    "rainy": "rainy day... a blanket would be nice",
    "snowy": "snow!! snow!!",
    "masked": "air's yucky today, staying in",
    "dancing": "♪ dancing ♪",
    "watching_tv": "ooh, something good's on!",
    "fireside": "toasty by the fire~",
    "vroom": "a robot's zooming around!",
    "cozy": "nice and cozy",
    "cool": "ahh, that breeze",
    "sunny": "sunny day!",
    "foggy": "all misty out there",
    "windy": "so windy out there!",
    "full_moon": "the moon is so big tonight!",
    "new_moon": "so many stars without the moon...",
    "dim": "nice and dim in here...",
}

# Flags that mean the pet is excited or cozy, for the mood sensor.
EXCITED_FLAGS = {"greeting", "snowy", "dancing"}
COZY_FLAGS = {"cozy", "dim", "fireside"}


@dataclass
class Readings:
    """Clean inputs from the house. None means no signal."""

    night: bool  # sleep hours, or within an hour of bedtime
    late: bool = False  # sleep hours: past bedtime
    sun_up: bool | None = None
    condition: str | None = None  # a weather entity's state, e.g. "rainy"
    rain_rate: float | None = None  # rain sensor, any unit: above 0 means raining
    solar: float | None = None  # W/m², from a weather station
    indoor_c: float | None = None
    room_light_level: float | None = (
        None  # 0-1 of the brightest room light, 0 if all off
    )
    lux: float | None = None
    bedtime_lights_on: bool | None = None
    motion_recent: bool | None = None
    fireplace: bool = False  # lit
    music: bool = False
    tv: bool = False
    aqi: float | None = None
    heating_on: bool = False  # a mapped heater, or thermostat heating, is on
    cooling_on: bool = False  # a mapped fan, or thermostat cooling, is on
    robot_cleaning: bool = False  # a vacuum is cleaning
    robot_docked: bool = False  # a vacuum is returning to its dock, or docked
    appliances_done: tuple[str, ...] = ()  # kinds that finished a cycle just now
    company: bool | None = None  # someone is home
    moon_phase: str | None = None  # normalized: "full_moon", "new_moon", ...
    moon_illumination: float | None = None  # lit fraction, 0-1
    moon_date: str | None = None  # "full_moon" / "new_moon" from the date alone
    moon_up: bool | None = None
    outdoor_c: float | None = None  # from the weather entity
    wind_kmh: float | None = None  # from the weather entity
    gust_kmh: float | None = None
    tv_title: str | None = None  # what's on, if the TV says
    music_title: str | None = None
    music_artist: str | None = None


@dataclass
class HomeEffect:
    """What the house is doing to the pet right now."""

    flags: list[str] = field(default_factory=list)
    requests: list[str] = field(default_factory=list)  # "blanket", "fan"
    bonus: dict[str, float] = field(default_factory=dict)  # per hour, positive
    dark_and_quiet: bool = False
    company: bool = False  # someone is home (not shown; traits learn from it)

    def reason(self) -> str | None:
        """The highest-priority thing the pet would say about the house."""
        flag = self.reason_flag()
        return REASONS[flag] if flag else None

    def reason_flag(self) -> str | None:
        """The flag behind reason() (the card's key for the sentence)."""
        return next((f for f in REASONS if f in self.flags), None)


RAINY = {"rainy", "pouring", "lightning-rainy", "hail"}
SNOWY = {"snowy", "snowy-rainy"}
SUNNY = {"sunny"}
FOGGY = {"fog"}
STORMY = {"lightning", "lightning-rainy"}
WINDY = {"windy", "windy-variant"}


def is_raining(r: Readings) -> bool:
    """A local rain gauge beats the forecast."""
    return r.rain_rate > 0 if r.rain_rate is not None else r.condition in RAINY


def is_sunny(r: Readings) -> bool:
    """A solar sensor beats the forecast; a sunny night isn't sunny."""
    if r.solar is not None:
        return r.solar >= R.HOME_SUNNY_SOLAR
    return r.condition in SUNNY and r.sun_up is not False


def is_windy(r: Readings) -> bool:
    """The condition says so, or the wind speed does."""
    return (
        r.condition in WINDY
        or (r.wind_kmh is not None and r.wind_kmh >= R.HOME_WINDY_KMH)
        or (r.gust_kmh is not None and r.gust_kmh >= R.HOME_GUSTY_KMH)
    )


def moon_phase(phase: str | None, illumination: float | None) -> str | None:
    """Full or new from a phase name ("Full Moon", "full_moon", "full") or the lit
    fraction; any other phase is passed through, normalized."""
    if phase:
        name = phase.strip().lower().replace(" ", "_").replace("-", "_")
        if name.startswith("full"):
            return "full_moon"
        if name.startswith("new"):
            return "new_moon"
        return name
    if illumination is not None:
        if illumination >= R.HOME_FULL_MOON_ILLUMINATION:
            return "full_moon"
        if illumination <= R.HOME_NEW_MOON_ILLUMINATION:
            return "new_moon"
    return None


# Finds (plan visitors v2 §2): the tokens a find's `when` may name.
FIND_TOKENS = frozenset(
    {"rainy", "snowy", "sunny", "foggy", "night", "full_moon", "autumn", "winter"}
)
# A new moon to start the count from (2000-01-06 18:14 UTC), and the mean
# synodic month in days.
_NEW_MOON_EPOCH = 947182440.0
_SYNODIC_DAYS = 29.530588853


def full_moon_by_date(now: float) -> bool:
    """The moon is full for finds within FIND_FULL_MOON_DAYS of the middle of
    its cycle (a mean month: good to well under a day), 3 nights a month."""
    age = ((now - _NEW_MOON_EPOCH) / 86400) % _SYNODIC_DAYS
    return abs(age - _SYNODIC_DAYS / 2) <= R.FIND_FULL_MOON_DAYS


def moon_by_date(now: float) -> str | None:
    """Full or new from the date alone, for a pet with no moon entity: the same
    window as the finds' full moon (FIND_FULL_MOON_DAYS), and the same width
    around age 0 for the new moon (the window wraps the month's end)."""
    age = ((now - _NEW_MOON_EPOCH) / 86400) % _SYNODIC_DAYS
    if abs(age - _SYNODIC_DAYS / 2) <= R.FIND_FULL_MOON_DAYS:
        return "full_moon"
    if min(age, _SYNODIC_DAYS - age) <= R.FIND_FULL_MOON_DAYS:
        return "new_moon"
    return None


def find_flags(
    r: Readings,
    now: float,
    local_hour: int,
    season: str | None,
    configured: frozenset[str] | set[str],
) -> dict[str, bool | None]:
    """Each find token true, false or None (missing: no signal for it is set
    up; review V-B #3). Missing comes from the configuration (`configured`
    holds "weather", "rain", "solar" and "moon" for what is mapped), so a
    mapped entity that is briefly unavailable reads false, not missing.

    - `night` is the sun being down (no sun entity: 20:00-06:00 local), not
      the sleep hours.
    - `full_moon` is the sun down and the moon full: a mapped phase or
      illumination entity says so, or the date's 3-night window does (HA's
      phase sensor says full for only about a day, which would make moonstone
      a half-year wait; V-B audit #1).
    - `autumn` / `winter` come from the season (None in the tropics).
    - Weather tokens are read on their own, not as the house's one flag."""
    weather = "weather" in configured
    if r.sun_up is not None:
        night = not r.sun_up
    else:
        start, end = R.FIND_NIGHT_HOURS
        night = local_hour >= start or local_hour < end
    full = full_moon_by_date(now) or (
        "moon" in configured
        and moon_phase(r.moon_phase, r.moon_illumination) == "full_moon"
    )
    return {
        "rainy": is_raining(r) if weather or "rain" in configured else None,
        "snowy": r.condition in SNOWY if weather else None,
        "sunny": is_sunny(r) if weather or "solar" in configured else None,
        "foggy": r.condition in FOGGY if weather else None,
        "night": night,
        "full_moon": night and full,
        "autumn": None if season is None else season == "autumn",
        "winter": None if season is None else season == "winter",
    }


def evaluate(
    r: Readings,
    comfort_low_c: float = R.HOME_COMFORT_LOW_C,
    comfort_high_c: float = R.HOME_COMFORT_HIGH_C,
) -> HomeEffect:
    """Turn a snapshot of the house into flags, requests and bonuses."""
    e = HomeEffect()
    bonus: dict[str, float] = {}

    def add(stat: str, rate: float) -> None:
        bonus[stat] = bonus.get(stat, 0.0) + rate

    # Weather. A local rain gauge beats a forecast; a solar sensor beats both
    # for "sunny".
    raining = is_raining(r)
    if r.condition in STORMY:
        # Thunder: it hides and wants its blanket, rain or not.
        e.flags.append("storm")
        e.requests.append("blanket")
    if raining:
        e.flags.append("rainy")
        if "blanket" not in e.requests:
            e.requests.append("blanket")
    elif r.condition in SNOWY:
        e.flags.append("snowy")
        add("happiness", R.HOME_SNOW_HAPPINESS)
    elif is_sunny(r):
        e.flags.append("sunny")
        add("happiness", R.HOME_SUN_HAPPINESS)
    elif r.condition in FOGGY:
        e.flags.append("foggy")
    # Wind goes with any weather: rain or sun can be windy too.
    if is_windy(r):
        e.flags.append("windy")

    # A lit fireplace: cozy, and nobody shivers next to it.
    if r.fireplace:
        e.flags.append("fireside")
        add("happiness", R.HOME_FIRE_HAPPINESS)

    # A robot vacuum at work: something to watch, nothing to gain.
    if r.robot_cleaning:
        e.flags.append("vroom")

    # Indoor temperature: a request, never a drain.
    if r.indoor_c is not None:
        if r.indoor_c < comfort_low_c and not r.fireplace:
            if r.heating_on:
                # The house is answering already: no ask, and nothing to shiver
                # about. (A blanket for rain or thunder stays the player's.)
                e.flags.append("cozy")
            else:
                e.flags.append("chilly")
                if "blanket" not in e.requests:
                    e.requests.append("blanket")
        elif r.indoor_c > comfort_high_c:
            if r.cooling_on:
                e.flags.append("cool")
            else:
                e.flags.append("warm")
                e.requests.append("fan")

    # Light, read against the clock: only past bedtime is a light "too bright".
    # (Many homes keep lights at full or off, so brightness alone in the evening
    # says nothing; still being on after bedtime does.)
    level = r.room_light_level
    if r.late:
        bright = (level is not None and level >= R.HOME_BRIGHT_LEVEL) or (
            r.lux is not None and r.lux >= R.HOME_BRIGHT_LUX_AT_NIGHT
        )
        if bright:
            e.flags.append("too_bright")
    elif r.sun_up is False and level is not None and 0 < level <= R.HOME_DIM_LEVEL:
        e.flags.append("dim")

    # Bed: the bedtime lights are off and nothing has moved for a while.
    # Unknown motion counts as quiet; unknown lights don't count as off.
    e.dark_and_quiet = (
        r.night and r.bedtime_lights_on is False and r.motion_recent is not True
    )

    # Activity. Quiet costs nothing.
    if r.music:
        e.flags.append("dancing")
        add("happiness", R.HOME_MUSIC_HAPPINESS)
    elif r.tv:
        e.flags.append("watching_tv")
        add("happiness", R.HOME_TV_HAPPINESS)

    # Air quality is cosmetic only.
    if r.aqi is not None and r.aqi > R.HOME_BAD_AQI:
        e.flags.append("masked")

    e.company = r.company is True

    # The moon, at night while it's up (unknown altitude counts as up).
    phase = moon_phase(r.moon_phase, r.moon_illumination) or r.moon_date
    if r.night and r.sun_up is not True and r.moon_up is not False:
        if phase == "full_moon":
            e.flags.append("full_moon")
            add("happiness", R.HOME_MOON_HAPPINESS)
        elif phase == "new_moon":
            e.flags.append("new_moon")

    # Signals pointing the same way never add up past the cap.
    e.bonus = {s: min(v, R.HOME_BONUS_CAP) for s, v in bonus.items()}
    return e


class Presence:
    """People coming and going: greetings, and away mode ("at the sitter's").

    Fed the home zone's person count. Keeps only what it needs in memory; a
    restart starts the empty timer over, which only delays away mode.
    """

    def __init__(self, away_after_hours: float = R.HOME_AWAY_AFTER_HOURS) -> None:
        self.away_after = away_after_hours * 3600
        self.count: int | None = None
        self.empty_since: float | None = None
        self.last_greeting = -1e12
        self.greeting_until = 0.0

    def update(self, count: int | None, now: float, away: bool) -> bool:
        """Take a new count; return whether the pet should be away now."""
        if count is None:
            return away  # no signal: change nothing
        was = self.count
        self.count = count
        if count > 0:
            self.empty_since = None
            if (
                was == 0
                and not away
                and now - self.last_greeting >= R.HOME_GREETING_COOLDOWN_MINUTES * 60
            ):
                self.last_greeting = now
                self.greeting_until = now + R.HOME_GREETING_MINUTES * 60
            elif was == 0 and away:
                # Back from the sitter's: always a greeting.
                self.last_greeting = now
                self.greeting_until = now + R.HOME_GREETING_MINUTES * 60
            return False
        if self.empty_since is None:
            self.empty_since = now
        return away or now - self.empty_since >= self.away_after

    def greeting(self, now: float) -> bool:
        """Whether the pet is still excited about someone arriving."""
        return now < self.greeting_until


class HouseMoments:
    """Passing moments in the house the pet comments on: sunrise and sunset, the
    first stir of the morning, what's on TV or playing, the TV going off late,
    the weather changing.

    Cosmetic only. Keeps what it needs in memory; a restart only means the
    pet may comment on the same show again.
    """

    def __init__(self) -> None:
        self.sun_up: bool | None = None
        self.greeted_on: str | None = None
        self.tv_title: str | None = None
        self.music_title: str | None = None
        self.tv_on = False
        self.next_media = 0.0
        # Weather: what it was doing, to remark on changes.
        self.raining: bool | None = None
        self.snowing: bool | None = None
        self.gloom_since: float | None = None  # daytime without sun, since
        self.next_weather = 0.0
        self.weather_again: dict[str, float] = {}
        self.said_on: dict[str, str] = {}  # "hot" / "cold": the day it was said
        # The house answering: whether heating / cooling was on at the last
        # reading (None before the first), and the answers given today.
        self.heating_on: bool | None = None
        self.cooling_on: bool | None = None
        self.answers: tuple[str, int] = ("", 0)
        # The robot vacuum: whether one was cleaning at the last reading (None
        # before the first), whether the pet saw this run start, and the runs
        # it has seen today.
        self.robot_cleaning: bool | None = None
        self.robot_seen = False
        self.robots: tuple[str, int] = ("", 0)

    def update(
        self,
        r: Readings,
        now: float,
        awake: bool,
        morning: bool,
        today: str,
        comfort: tuple[float, float] = (R.HOME_COMFORT_LOW_C, R.HOME_COMFORT_HIGH_C),
        satisfied: frozenset[str] | set[str] = frozenset(),
    ) -> list[dict[str, Any]]:
        """Events for what just happened. awake: awake, home and hatched.
        morning: between wake time and noon, local. comfort: the (low, high)
        indoor temperatures in °C. satisfied: requests already answered
        ("blanket" / "fan")."""
        events: list[dict[str, Any]] = []
        events += self._house_answered(r, awake, today, comfort, satisfied)
        events += self._robot(r, awake, today)
        events += self._appliances(r, awake)
        if r.sun_up is not None and self.sun_up is not None and r.sun_up != self.sun_up:
            if awake:
                events.append({"type": "sunrise" if r.sun_up else "sunset"})
        if r.sun_up is not None:
            self.sun_up = r.sun_up

        if awake and morning and r.motion_recent and self.greeted_on != today:
            self.greeted_on = today
            events.append({"type": "good_morning"})

        if r.tv_title and r.tv_title != self.tv_title and now >= self.next_media:
            if awake:
                events.append({"type": "watching", "title": r.tv_title})
                self.next_media = now + R.HOME_MEDIA_COOLDOWN_MINUTES * 60
        self.tv_title = r.tv_title or self.tv_title if r.tv else None
        if (
            r.music_title
            and r.music_title != self.music_title
            and now >= self.next_media
        ):
            if awake:
                event = {"type": "listening", "title": r.music_title}
                if r.music_artist:
                    event["artist"] = r.music_artist
                events.append(event)
                self.next_media = now + R.HOME_MEDIA_COOLDOWN_MINUTES * 60
        self.music_title = r.music_title

        if self.tv_on and not r.tv and r.night and awake:
            events.append({"type": "tv_off_late"})
        self.tv_on = r.tv
        events += self._weather(r, now, awake, today)
        return events

    def _house_answered(
        self,
        r: Readings,
        awake: bool,
        today: str,
        comfort: tuple[float, float],
        satisfied: frozenset[str] | set[str],
    ) -> list[dict[str, Any]]:
        """The heating (cooling) turning on while the pet is chilly (warm) and
        hasn't been tucked in (fanned): the house heard it. A real off to on
        change only: heating that was on already, or on at the first reading,
        says nothing. At most HOUSE_ANSWERS_PER_DAY a local day."""
        was_heating, was_cooling = self.heating_on, self.cooling_on
        self.heating_on, self.cooling_on = r.heating_on, r.cooling_on
        low, high = comfort
        asks = (
            (
                "blanket",
                was_heating is False and r.heating_on,
                r.indoor_c is not None and r.indoor_c < low and not r.fireplace,
            ),
            (
                "fan",
                was_cooling is False and r.cooling_on,
                r.indoor_c is not None and r.indoor_c > high,
            ),
        )
        day, count = self.answers
        events: list[dict[str, Any]] = []
        for request, turned_on, open_ in asks:
            if not (turned_on and open_ and awake) or request in satisfied:
                continue
            if day == today and count >= R.HOUSE_ANSWERS_PER_DAY:
                break
            day, count = today, (count if day == today else 0) + 1
            events.append({"type": "house_answered", "request": request})
        self.answers = (day, count)
        return events

    def _robot(self, r: Readings, awake: bool, today: str) -> list[dict[str, Any]]:
        """A vacuum starting to clean (robot_out), and heading home after a run
        the pet saw (robot_home, once per run). Dropped while the pet is asleep,
        away or an egg; a run already going at the first reading says nothing;
        at most ROBOT_MOMENTS_PER_DAY starts a local day."""
        was = self.robot_cleaning
        self.robot_cleaning = r.robot_cleaning
        if r.robot_cleaning and was is False:
            self.robot_seen = False
            day, count = self.robots
            if awake and not (day == today and count >= R.ROBOT_MOMENTS_PER_DAY):
                self.robots = (today, (count if day == today else 0) + 1)
                self.robot_seen = True
                return [{"type": "robot_out"}]
        elif was and not r.robot_cleaning:
            seen, self.robot_seen = self.robot_seen, False
            if seen and awake and r.robot_docked:
                return [{"type": "robot_home"}]
        return []

    def _appliances(self, r: Readings, awake: bool) -> list[dict[str, Any]]:
        """A washer, dryer or dishwasher finishing (appliance_done {kind}): the
        watcher keeps each machine's cycle and cooldown and passes only the
        kinds. Said once, never repeated; dropped while the pet is asleep, away
        or an egg."""
        if not awake:
            return []
        return [{"type": "appliance_done", "kind": kind} for kind in r.appliances_done]

    def _weather(
        self, r: Readings, now: float, awake: bool, today: str
    ) -> list[dict[str, Any]]:
        """At most one remark on the weather changing: rain starting or
        stopping (a rainbow, if the sun is out), snow, the sun breaking through,
        a hot or freezing day. Changes while asleep are noted, not remarked on."""
        changes: list[str] = []
        if r.rain_rate is not None or r.condition is not None:
            raining = is_raining(r)
            if self.raining is not None and raining != self.raining:
                if raining:
                    changes.append("rain_started")
                elif r.sun_up and is_sunny(r):
                    changes.append("rainbow")
                else:
                    changes.append("rain_stopped")
            self.raining = raining
        if r.condition is not None:
            snowing = r.condition in SNOWY
            if self.snowing is False and snowing:
                changes.append("snow_started")
            self.snowing = snowing
        if r.solar is not None or r.condition is not None:
            if r.sun_up is not True or is_raining(r):
                self.gloom_since = None  # night, or rain: that's not "cloud"
            elif not is_sunny(r):
                if self.gloom_since is None:
                    self.gloom_since = now
            else:
                gloom = self.gloom_since
                self.gloom_since = None
                if (
                    gloom is not None
                    and now - gloom >= R.HOME_SUN_OUT_AFTER_HOURS * 3600
                ):
                    changes.append("sun_out")
        temp_c = r.outdoor_c
        if temp_c is not None:
            if temp_c >= R.HOME_HOT_DAY_C and self.said_on.get("hot") != today:
                changes.append("hot")
            elif temp_c <= R.HOME_COLD_SNAP_C and self.said_on.get("cold") != today:
                changes.append("cold")

        if not awake or now < self.next_weather:
            return []
        for change in changes:
            if now < self.weather_again.get(change, 0.0):
                continue
            self.next_weather = now + R.HOME_WEATHER_GAP_MINUTES * 60
            self.weather_again[change] = now + R.HOME_WEATHER_COOLDOWN_MINUTES * 60
            event: dict[str, Any] = {"type": "weather", "change": change}
            if change in ("hot", "cold"):
                self.said_on[change] = today
                event["temp_c"] = temp_c
            return [event]
        return []


@dataclass
class DayForecast:
    """One day of a weather entity's daily forecast, in °C."""

    condition: str | None = None
    high_c: float | None = None
    low_c: float | None = None


def forecast_moment(
    day: DayForecast | None, before: DayForecast | None, when: str
) -> dict[str, Any] | None:
    """Something worth saying about a day's forecast, or None for an ordinary
    day (the pet isn't a weather report). before: the day before it, if known.
    when: "today" or "tomorrow"."""
    if day is None:
        return None
    high, low = day.high_c, day.low_c
    kind: str | None = None
    if day.condition in STORMY:
        kind = "storm"
    elif day.condition in SNOWY:
        kind = "snow"
    elif high is not None and high >= R.HOME_HOT_DAY_C:
        kind = "hot"
    elif (high is not None and high <= R.HOME_COLD_DAY_HIGH_C) or (
        low is not None and low <= R.HOME_COLD_SNAP_C
    ):
        kind = "cold"
    elif (
        high is not None
        and before is not None
        and before.high_c is not None
        and abs(high - before.high_c) >= R.HOME_FORECAST_SWING_C
    ):
        kind = "warmer" if high > before.high_c else "colder"
    elif day.condition in RAINY:
        kind = "rain"
    elif (
        day.condition in SUNNY
        and before is not None
        and (before.condition in RAINY or before.condition in SNOWY)
    ):
        kind = "sunny"
    if kind is None:
        return None
    event: dict[str, Any] = {"type": "forecast", "when": when, "kind": kind}
    if high is not None:
        event["high_c"] = high
    if low is not None:
        event["low_c"] = low
    return event


def news_text(text: str | None, limit: int) -> str:
    """A headline or topic tidied for the speech bubble: whitespace collapsed
    (feed titles often carry newlines) and anything past `limit` characters cut
    at a word, with an ellipsis."""
    text = " ".join(str(text or "").split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut[limit // 2 :]:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:-–—") + "…"
