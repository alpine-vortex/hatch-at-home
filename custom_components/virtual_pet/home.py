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

from . import rates as R

# Home flags, and what the pet says about them, highest priority first.
REASONS: dict[str, str] = {
    "greeting": "you're back!!",
    "too_bright": "too bright, it's late!",
    "chilly": "brr... blanket please?",
    "warm": "so warm... a fan?",
    "rainy": "rainy day, blanket please?",
    "snowy": "snow!! snow!!",
    "masked": "air's yucky today, staying in",
    "dancing": "♪ dancing ♪",
    "watching_tv": "ooh, what's on?",
    "fireside": "toasty by the fire~",
    "cozy": "nice and cozy",
    "cool": "ahh, that breeze",
    "sunny": "sunny day!",
    "foggy": "all misty out there",
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
    company: bool | None = None  # someone is home
    moon_phase: str | None = None  # normalized: "full_moon", "new_moon", ...
    moon_illumination: float | None = None  # lit fraction, 0-1
    moon_up: bool | None = None


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
        return next((REASONS[f] for f in REASONS if f in self.flags), None)


RAINY = {"rainy", "pouring", "lightning-rainy", "hail"}
SNOWY = {"snowy", "snowy-rainy"}
SUNNY = {"sunny"}
FOGGY = {"fog"}


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
    raining = r.rain_rate > 0 if r.rain_rate is not None else r.condition in RAINY
    if raining:
        e.flags.append("rainy")
        e.requests.append("blanket")
    elif r.condition in SNOWY:
        e.flags.append("snowy")
        add("happiness", R.HOME_SNOW_HAPPINESS)
    else:
        sunny = (
            r.solar >= R.HOME_SUNNY_SOLAR
            if r.solar is not None
            else r.condition in SUNNY and r.sun_up is not False
        )
        if sunny:
            e.flags.append("sunny")
            add("happiness", R.HOME_SUN_HAPPINESS)
        elif r.condition in FOGGY:
            e.flags.append("foggy")

    # A lit fireplace: cozy, and nobody shivers next to it.
    if r.fireplace:
        e.flags.append("fireside")
        add("happiness", R.HOME_FIRE_HAPPINESS)

    # Indoor temperature: a request, never a drain.
    if r.indoor_c is not None:
        if r.indoor_c < comfort_low_c and not r.fireplace:
            e.flags.append("chilly")
            if "blanket" not in e.requests:
                e.requests.append("blanket")
        elif r.indoor_c > comfort_high_c:
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
    phase = moon_phase(r.moon_phase, r.moon_illumination)
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
