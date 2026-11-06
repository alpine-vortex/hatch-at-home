"""Reads the owner's mapped entities into a home.Readings snapshot.

Bad inputs are treated as "no signal": unavailable and unknown keep the last
good value for HOME_HOLD_MINUTES, then count as unmapped, so a Zigbee dropout
never reads as "nobody home, pitch dark".
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import re
from typing import Any

from homeassistant.const import (
    ATTR_UNIT_OF_MEASUREMENT,
    PERCENTAGE,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    UnitOfSpeed,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant, State
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_conversion import SpeedConverter, TemperatureConverter

from . import rates as R
from .const import (
    CONF_APPLIANCE_WATTS,
    CONF_APPLIANCES,
    CONF_AQI,
    CONF_BEDTIME_LIGHTS,
    CONF_COMFORT_HIGH,
    CONF_COMFORT_LOW,
    CONF_COOLING,
    CONF_FIREPLACE,
    CONF_HEATING,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MOON_ALTITUDE,
    CONF_MOON_ILLUMINATION,
    CONF_MOON_PHASE,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_NOTICE_DOORBELL,
    CONF_NOTICE_ROBOT,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SOLAR,
    CONF_TV,
    CONF_WEATHER,
    CONF_ZONE,
    DEFAULT_ZONE,
)
from .home import DayForecast, Readings, moon_by_date, moon_phase

BAD = (STATE_UNAVAILABLE, STATE_UNKNOWN)
VIDEO = {"movie", "tvshow", "video", "episode", "channel"}

MULTI = (
    CONF_BEDTIME_LIGHTS,
    CONF_MOTION,
    CONF_ROOM_LIGHTS,
    CONF_LUX,
    CONF_MUSIC,
    CONF_TV,
    CONF_HEATING,
    CONF_COOLING,
    CONF_APPLIANCES,
)
SINGLE = (
    CONF_WEATHER,
    CONF_RAIN,
    CONF_SOLAR,
    CONF_INDOOR_TEMP,
    CONF_AQI,
    CONF_FIREPLACE,
    CONF_MOON_PHASE,
    CONF_MOON_ILLUMINATION,
    CONF_MOON_ALTITUDE,
)
# The plain-bool readings `known` can vouch for, by the option that maps them.
KNOWN_OPTIONS = {
    "fireplace": CONF_FIREPLACE,
    "tv": CONF_TV,
    "music": CONF_MUSIC,
    "heating": CONF_HEATING,
    "cooling": CONF_COOLING,
}
# A fireplace can be a switch, light, climate, fan or sensor: these mean lit.
LIT = {"on", "heat", "heating", "burning", "playing"}


def heating_on(state: State) -> bool:
    """Whether a mapped entity says the heating is on: a thermostat that is
    heating (with no hvac_action, set to heat and still below its target), or a
    switch or boolean that is on."""
    domain = state.domain
    if domain == "climate":
        action = state.attributes.get("hvac_action")
        if action is not None:
            return action == "heating"
        if state.state not in ("heat", "heat_cool"):
            return False
        current, target = (
            _number(state.attributes.get("current_temperature")),
            _number(state.attributes.get("temperature")),
        )
        return current is not None and target is not None and current < target
    return state.state == "on"


def cooling_on(state: State) -> bool:
    """Whether a mapped entity says cooling is on: a fan that is on, a
    thermostat that is cooling or running its fan (with no hvac_action, set to
    cool or fan only), or a switch or boolean that is on."""
    if state.domain == "climate":
        action = state.attributes.get("hvac_action")
        if action is not None:
            return action in ("cooling", "fan")
        return state.state in ("cool", "fan_only")
    return state.state == "on"


def _number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# Appliances (H6). An enum sensor (home_connect, smartthings, lg_thinq, miele) is
# "done" in a state with one of these words (case-folded; a word starting with
# one, so home_connect's "...OperationState.Finished" counts and "pending" doesn't
# count as "end"), and idle in one of these.
APPLIANCE_DONE = ("finish", "end", "complete", "done", "ready")
APPLIANCE_IDLE = {"idle", "off", "standby", "inactive", "none"}


def _words(text: str) -> list[str]:
    return [w for w in re.split(r"[^a-z]+", text.casefold()) if w]


def appliance_kind(entity_id: str, device_class: Any = None) -> str:
    """washer, dryer, dishwasher or machine, from the device class and the
    entity_id's words (dish before wash, so a dishwasher isn't a washer). Only
    this word leaves the watcher, never the entity."""
    words = _words(f"{device_class or ''} {entity_id.partition('.')[2]}")
    for start, kind in (("dish", "dishwasher"), ("wash", "washer"), ("dry", "dryer")):
        if any(w.startswith(start) for w in words):
            return kind
    return "machine"


def _watts(state: State) -> float | None:
    """A power sensor's draw, or a switch's current_power_w, in watts; None if
    the entity isn't one."""
    if state.domain == "switch":
        return _number(state.attributes.get("current_power_w"))
    if state.domain == "sensor" and state.attributes.get("device_class") == "power":
        watts = _number(state.state)
        if watts is not None and state.attributes.get(ATTR_UNIT_OF_MEASUREMENT) == "kW":
            watts *= 1000
        return watts
    return None


def _title(state: State, *keys: str, fallback: bool = True) -> str | None:
    """A media player's show or song title (a series beats an episode)."""
    for key in (*keys, "media_title") if fallback else keys:
        if isinstance(value := state.attributes.get(key), str) and value.strip():
            return value.strip()[:60]
    return None


def _float(state: State | None) -> float | None:
    try:
        return float(state.state) if state else None
    except ValueError:
        return None


def _to_celsius(value: Any, unit: Any) -> float | None:
    """A temperature in the weather entity's unit, as °C."""
    if unit not in (UnitOfTemperature.CELSIUS, UnitOfTemperature.FAHRENHEIT):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return TemperatureConverter.convert(value, unit, UnitOfTemperature.CELSIUS)


def _kmh(weather: State | None, key: str) -> float | None:
    """A weather entity's wind (or gust) speed, in km/h."""
    if weather is None:
        return None
    unit = weather.attributes.get("wind_speed_unit", UnitOfSpeed.KILOMETERS_PER_HOUR)
    if unit not in SpeedConverter.VALID_UNITS:
        return None
    try:
        value = float(weather.attributes[key])
    except (KeyError, TypeError, ValueError):
        return None
    return SpeedConverter.convert(value, unit, UnitOfSpeed.KILOMETERS_PER_HOUR)


def daily_forecast(
    items: list[dict[str, Any]], temperature_unit: str | None
) -> dict[str, DayForecast]:
    """weather.get_forecasts' daily list as {local date: DayForecast}. The first
    entry for a day wins; entries without a readable date are skipped."""
    unit = temperature_unit or UnitOfTemperature.CELSIUS
    days: dict[str, DayForecast] = {}
    for item in items:
        when = dt_util.parse_datetime(str(item.get("datetime") or ""))
        if when is None:
            continue
        day = dt_util.as_local(when).date().isoformat()
        if day in days:
            continue
        condition = item.get("condition")
        days[day] = DayForecast(
            condition=condition if isinstance(condition, str) else None,
            high_c=_to_celsius(item.get("temperature"), unit),
            low_c=_to_celsius(item.get("templow"), unit),
        )
    return days


def is_temperature(state: State | None) -> bool:
    """A thermometer: always above 0, so it can't say whether a fire is lit."""
    return state is not None and (
        state.attributes.get("device_class") == "temperature"
        or state.attributes.get(ATTR_UNIT_OF_MEASUREMENT)
        in (UnitOfTemperature.CELSIUS, UnitOfTemperature.FAHRENHEIT)
    )


def doorbell_rang(old: State | None, new: State | None, now: float) -> bool:
    """Whether this state change is a doorbell press (H5). An event entity's
    state is the time of its last event, so only a change counts, and not a
    restore or a reconnect:
    - no old state (just added) or an old state of unavailable (a restart or
      reconnect restoring the last time) never counts; unknown does (the first
      press ever),
    - the new state is a time that differs from the old, at most 60 s old and
      not in the future (a 2 s allowance),
    - the event is a ring, or, for an entity with no ring type, any event."""
    if old is None or new is None or old.state == STATE_UNAVAILABLE:
        return False
    if new.state == old.state or new.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
        return False
    when = dt_util.parse_datetime(new.state)
    if when is None:
        return False
    age = now - when.timestamp()
    if not -2 <= age <= R.HOME_DOORBELL_FRESH_SECONDS:
        return False
    kind = new.attributes.get("event_type")
    if not kind:
        return False
    return kind == "ring" or "ring" not in (new.attributes.get("event_types") or ())


# A level in a Signature: (name, value, share, floor). It has moved when it
# changed by at least max(floor, share * |the value it is compared with|).
type Level = tuple[str, float, float, float]


@dataclass(frozen=True)
class Signature:
    """What the pet can notice of one entity's state: the bands and words the
    readings use (marks, compared exactly) and the numbers they read (levels,
    compared with a coarse step). Built from the same extraction as read(),
    so a change that leaves the signature alone changes nothing the pet sees
    until the next tick."""

    marks: tuple[Any, ...]
    levels: tuple[Level, ...] = ()


def moved(old: Signature, new: Signature) -> bool:
    """Whether new differs from old in a way worth waking the pet for."""
    if old.marks != new.marks or len(old.levels) != len(new.levels):
        return True
    for (name, was, share, floor), (other, now, _, _) in zip(
        old.levels, new.levels, strict=True
    ):
        if name != other or abs(now - was) >= max(floor, share * abs(was)):
            return True
    return False


def _band(value: float, edges: tuple[tuple[float, bool], ...]) -> int:
    """How many of the (ascending) edges value is past. An edge is (mark,
    below): below means the pet tests "value <= mark", so value is past it only
    when above it; otherwise the pet tests "value >= mark" and at it is past."""
    return sum(value > edge if below else value >= edge for edge, below in edges)


# Outdoor °C the pet or the card has a word for, each on the side the pet tests
# it: snow talk at 0, coming home cold, and a cold snap read "<=" (True); the
# first warm day, coming home hot and a hot day read ">=".
OUTDOOR_EDGES = tuple(
    sorted(
        {
            (R.HOME_COLD_SNAP_C, True),
            (0.0, True),
            (R.HOME_COLD_C, True),
            (R.HOME_WARM_FIRST_C, False),
            (R.HOME_HOT_C, False),
            (R.HOME_HOT_DAY_C, False),
        }
    )
)


@dataclass
class _Cycle:
    """One appliance entity's cycle so far (memory only; never leaves the watcher)."""

    since: float | None = None  # busy (on, or drawing power) since
    running: bool = False  # busy long enough to count as a cycle
    low: float | None = None  # a power reading at or under the watts, since

    def reset(self) -> None:
        self.since = self.low = None
        self.running = False


class Watcher:
    """Holds the mapping and the last good value of each entity."""

    def __init__(self, hass: HomeAssistant, options: Mapping[str, Any]) -> None:
        self.hass = hass
        self.options = options
        self._good: dict[str, tuple[State, float]] = {}
        # Appliances (H6): each entity's cycle, and when it last said done.
        self._cycles: dict[str, _Cycle] = {}
        self._done_at: dict[str, float] = {}

    def _ids(self, key: str) -> list[str]:
        value = self.options.get(key) or []
        return [value] if isinstance(value, str) else list(value)

    @property
    def zone(self) -> str:
        return self.options.get(CONF_ZONE) or DEFAULT_ZONE

    def robot_ids(self) -> list[str]:
        """Every vacuum in the house, found by domain (no mapping), unless the
        owner turned notice_robot off. Listed when the pet starts listening: a
        vacuum added later is heard after the integration reloads."""
        if not self.options.get(CONF_NOTICE_ROBOT, True):
            return []
        return sorted(self.hass.states.async_entity_ids("vacuum"))

    def doorbell_ids(self) -> list[str]:
        """Every doorbell in the house: an event entity whose device class is
        doorbell (no other guess: a door contact must never count), unless the
        owner turned notice_doorbell off. Not part of entity_ids(): a press is
        heard by the coordinator's own listener and never read as a state.
        Listed when the pet starts listening; one added later is heard after the
        integration reloads."""
        if not self.options.get(CONF_NOTICE_DOORBELL, True):
            return []
        return sorted(
            s.entity_id
            for s in self.hass.states.async_all("event")
            if s.attributes.get("device_class") == "doorbell"
        )

    def entity_ids(self) -> list[str]:
        """Everything worth listening to."""
        ids = [self.zone, "sun.sun", *self.robot_ids()]
        for key in (*MULTI, *SINGLE):
            ids += self._ids(key)
        return sorted(set(ids))

    def signature(self, entity_id: str, state: State) -> Signature:
        """What the pet can notice of this state of entity_id, for every key it
        is mapped to (pure: reads nothing else and changes nothing). The caller
        handles unavailable, unknown and a removed entity itself."""
        marks: list[Any] = []
        levels: list[Level] = []
        if entity_id == self.zone:
            marks.append(("zone", state.state))
        if entity_id == "sun.sun" or state.domain == "vacuum":
            marks.append(("state", state.state))
        for key in (*MULTI, *SINGLE):
            if entity_id in self._ids(key):
                self._sign(key, state, marks, levels)
        return Signature(tuple(marks), tuple(levels))

    def _sign(
        self, key: str, state: State, marks: list[Any], levels: list[Level]
    ) -> None:
        """One key's share of a signature, from the same reads as read()."""
        mark = marks.append

        def level(name: str, value: float | None, share: float, floor: float) -> None:
            if value is not None:
                levels.append((f"{key}.{name}", value, share, floor))

        share = R.HOME_REACT_SHARE
        if key == CONF_WEATHER:
            mark((key, state.state))
            outdoor = self._outdoor_c(state)
            mark((key, None if outdoor is None else _band(outdoor, OUTDOOR_EDGES)))
            level("c", outdoor, 0.0, R.HOME_REACT_OUTDOOR_C)
            for attr, edge in (
                ("wind_speed", R.HOME_WINDY_KMH),
                ("wind_gust_speed", R.HOME_GUSTY_KMH),
            ):
                kmh = _kmh(state, attr)
                mark((attr, None if kmh is None else kmh >= edge))
                level(attr, kmh, share, R.HOME_REACT_KMH)
        elif key == CONF_RAIN:
            rain = self._rain(state)
            mark((key, None if rain is None else rain > 0))
            level("rate", rain, share, R.HOME_REACT_RAIN)
        elif key == CONF_SOLAR:
            solar = _float(state)
            mark((key, None if solar is None else solar >= R.HOME_SUNNY_SOLAR))
            level("w", solar, share, R.HOME_REACT_SOLAR)
        elif key == CONF_INDOOR_TEMP:
            indoor = self._celsius(state)
            low = _number(self.options.get(CONF_COMFORT_LOW))
            high = _number(self.options.get(CONF_COMFORT_HIGH))
            low = R.HOME_COMFORT_LOW_C if low is None else low
            high = R.HOME_COMFORT_HIGH_C if high is None else high
            mark((key, None if indoor is None else (indoor < low, indoor > high)))
            level("c", indoor, 0.0, R.HOME_REACT_INDOOR_C)
        elif key == CONF_AQI:
            aqi = _float(state)
            mark((key, None if aqi is None else aqi > R.HOME_BAD_AQI))
            level("aqi", aqi, share, R.HOME_REACT_AQI)
        elif key == CONF_FIREPLACE:
            mark((key, self._lit(state)))
        elif key == CONF_MOON_PHASE:
            mark((key, state.state))
        elif key == CONF_MOON_ILLUMINATION:
            lit = self._fraction(state)
            mark((key, None if lit is None else moon_phase(None, lit)))
            level("lit", lit, 0.0, R.HOME_REACT_MOON)
        elif key == CONF_MOON_ALTITUDE:
            alt = _float(state)
            mark((key, None if alt is None else alt > 0))
        elif key == CONF_LUX:
            lux = _float(state)
            mark((key, None if lux is None else lux >= R.HOME_BRIGHT_LUX_AT_NIGHT))
            level("lux", lux, share, R.HOME_REACT_LUX)
        elif key == CONF_ROOM_LIGHTS:
            light = self._light_level([state]) or 0.0
            mark(
                (
                    key,
                    light > 0,
                    light >= R.HOME_BRIGHT_LEVEL,
                    light <= R.HOME_DIM_LEVEL,
                )
            )
            level("level", light, 0.0, R.HOME_REACT_LIGHT)
        elif key in (CONF_BEDTIME_LIGHTS, CONF_MOTION):
            mark((key, state.state == "on"))
        elif key in (CONF_TV, CONF_MUSIC):
            mark((key, state.state, state.attributes.get("media_content_type")))
            mark(
                tuple(
                    _title(state, attr, fallback=False)
                    for attr in ("media_series_title", "media_title", "media_artist")
                )
            )
        elif key == CONF_HEATING:
            mark((key, heating_on(state)))
        elif key == CONF_COOLING:
            mark((key, cooling_on(state)))
        elif key == CONF_APPLIANCES:
            watts = _watts(state)
            if watts is None:
                mark((key, state.state))
            else:
                watts_max = _number(self.options.get(CONF_APPLIANCE_WATTS))
                if watts_max is None:
                    watts_max = R.APPLIANCE_WATTS
                mark((key, watts > watts_max))

    def _get(self, entity_id: str, now: float) -> State | None:
        state = self.hass.states.get(entity_id)
        if state is not None and state.state not in BAD:
            self._good[entity_id] = (state, now)
            return state
        held = self._good.get(entity_id)
        if held and now - held[1] < R.HOME_HOLD_MINUTES * 60:
            return held[0]
        return None

    def _all(self, key: str, now: float) -> list[State]:
        return [s for eid in self._ids(key) if (s := self._get(eid, now)) is not None]

    def _one(self, key: str, now: float) -> State | None:
        ids = self._ids(key)
        return self._get(ids[0], now) if ids else None

    def known(self, key: str, now: float) -> bool:
        """Whether some mapped entity of this key answers now (the last good state
        is held 10 minutes). A plain-bool reading (``fireplace``, ``tv``, ``music``,
        ``heating``, ``cooling``) is ``False`` both when off and when nothing
        answers; this tells them apart. A pure read: it changes nothing."""
        option = KNOWN_OPTIONS.get(key)
        if option is None:
            return False
        if option in SINGLE:
            return self._one(option, now) is not None
        return bool(self._all(option, now))

    def _cycle_done(self, eid: str, state: State, now: float, watts_max: float) -> bool:
        """Whether this reading ends a cycle the watcher saw run. Called on every
        read (a state change, and the 5-minute tick), so "for 10 min" and "for 3
        min" are only checked then: in practice a minute count can run up to
        about 5 minutes long. No timer of its own."""
        cycle = self._cycles.setdefault(eid, _Cycle())
        watts = _watts(state)
        if state.domain == "binary_sensor" or watts is not None:
            busy = state.state == "on" if watts is None else watts > watts_max
            if busy:
                cycle.low = None
                if cycle.since is None:
                    cycle.since = now
                if now - cycle.since >= R.APPLIANCE_RUN_MINUTES * 60:
                    cycle.running = True
                return False
            if watts is None:  # a binary sensor going off ends the cycle at once
                done = cycle.running
            else:  # a power reading has to stay low a while
                if cycle.low is None:
                    cycle.low = now
                done = (
                    cycle.running and now - cycle.low >= R.APPLIANCE_IDLE_MINUTES * 60
                )
            if done or not cycle.running:
                cycle.reset()
            return done
        if state.domain != "sensor":  # a switch with no power reading
            return False
        words = _words(state.state)
        if any(w.startswith(APPLIANCE_DONE) for w in words):
            done = cycle.running
            cycle.reset()
            return done
        cycle.running = not APPLIANCE_IDLE.intersection(words)
        return False

    def appliances_done(self, now: float) -> tuple[str, ...]:
        """The kinds of appliance that finished a cycle since the last read, at
        most one "done" an hour per entity. Only the kinds, never an entity."""
        watts_max = _number(self.options.get(CONF_APPLIANCE_WATTS))
        if watts_max is None:
            watts_max = R.APPLIANCE_WATTS
        kinds: set[str] = set()
        for eid in self._ids(CONF_APPLIANCES):
            state = self._get(eid, now)
            if state is None or not self._cycle_done(eid, state, now, watts_max):
                continue
            if now - self._done_at.get(eid, -1e12) >= R.APPLIANCE_COOLDOWN_MINUTES * 60:
                self._done_at[eid] = now
                kinds.add(appliance_kind(eid, state.attributes.get("device_class")))
        return tuple(sorted(kinds))

    def people_home(self, now: float) -> int | None:
        """Persons in the home zone, or None without a signal."""
        value = _float(self._get(self.zone, now))
        return None if value is None else int(value)

    def read(self, now: float, night: bool, late: bool = False) -> Readings:
        """A snapshot of the house."""
        sun = self._get("sun.sun", now)
        weather = self._one(CONF_WEATHER, now)
        robots = [s for eid in self.robot_ids() if (s := self._get(eid, now))]
        playing_tv = [s for s in self._all(CONF_TV, now) if s.state == "playing"]
        playing_music = [
            s
            for s in self._all(CONF_MUSIC, now)
            if s.state == "playing"
            and s.attributes.get("media_content_type") not in VIDEO
        ]
        return Readings(
            night=night,
            late=late,
            sun_up=None if sun is None else sun.state == "above_horizon",
            condition=weather.state if weather else None,
            rain_rate=self._rain(self._one(CONF_RAIN, now)),
            solar=_float(self._one(CONF_SOLAR, now)),
            indoor_c=self._celsius(self._one(CONF_INDOOR_TEMP, now)),
            room_light_level=self._light_level(self._all(CONF_ROOM_LIGHTS, now)),
            lux=max(
                (v for s in self._all(CONF_LUX, now) if (v := _float(s)) is not None),
                default=None,
            ),
            bedtime_lights_on=self._any_on(self._all(CONF_BEDTIME_LIGHTS, now)),
            motion_recent=self._motion(self._all(CONF_MOTION, now), now),
            music=any(
                s.state == "playing"
                and s.attributes.get("media_content_type") not in VIDEO
                for s in self._all(CONF_MUSIC, now)
            ),
            tv=any(s.state in ("on", "playing") for s in self._all(CONF_TV, now)),
            aqi=_float(self._one(CONF_AQI, now)),
            fireplace=self._lit(self._one(CONF_FIREPLACE, now)),
            heating_on=any(heating_on(s) for s in self._all(CONF_HEATING, now)),
            cooling_on=any(cooling_on(s) for s in self._all(CONF_COOLING, now)),
            robot_cleaning=any(s.state == "cleaning" for s in robots),
            robot_docked=any(s.state in ("returning", "docked") for s in robots),
            appliances_done=self.appliances_done(now),
            company=None if (people := self.people_home(now)) is None else people > 0,
            moon_phase=(
                moon.state if (moon := self._one(CONF_MOON_PHASE, now)) else None
            ),
            moon_illumination=self._fraction(self._one(CONF_MOON_ILLUMINATION, now)),
            moon_date=(
                None
                if self._ids(CONF_MOON_PHASE) or self._ids(CONF_MOON_ILLUMINATION)
                else moon_by_date(now)
            ),
            moon_up=(
                None
                if (alt := _float(self._one(CONF_MOON_ALTITUDE, now))) is None
                else alt > 0
            ),
            outdoor_c=self._outdoor_c(weather),
            wind_kmh=_kmh(weather, "wind_speed"),
            gust_kmh=_kmh(weather, "wind_gust_speed"),
            tv_title=next(
                (t for s in playing_tv if (t := _title(s, "media_series_title"))),
                None,
            ),
            music_title=next(
                (t for s in playing_music if (t := _title(s, "media_title"))), None
            ),
            music_artist=next(
                (
                    t
                    for s in playing_music
                    if (t := _title(s, "media_artist", fallback=False))
                ),
                None,
            ),
        )

    @staticmethod
    def _outdoor_c(weather: State | None) -> float | None:
        """The weather entity's current temperature, in °C."""
        if weather is None:
            return None
        return _to_celsius(
            weather.attributes.get("temperature"),
            weather.attributes.get("temperature_unit", UnitOfTemperature.CELSIUS),
        )

    @staticmethod
    def _fraction(state: State | None) -> float | None:
        """0-1 from a fraction or a percentage (by its unit, else by size)."""
        value = _float(state)
        if value is None or state is None:
            return None
        percent = state.attributes.get(ATTR_UNIT_OF_MEASUREMENT) == PERCENTAGE
        return value / 100 if percent or value > 1 else value

    @staticmethod
    def _rain(state: State | None) -> float | None:
        """A rain rate, or an on/off "it's raining" entity read as 1 or 0."""
        if state is None:
            return None
        if state.state in ("on", "off"):
            return 1.0 if state.state == "on" else 0.0
        return _float(state)

    @staticmethod
    def _lit(state: State | None) -> bool:
        if state is None or is_temperature(state):
            return False
        value = _float(state)
        return value > 0 if value is not None else state.state in LIT

    @staticmethod
    def _celsius(state: State | None) -> float | None:
        value = _float(state)
        if value is None or state is None:
            return None
        unit = state.attributes.get(ATTR_UNIT_OF_MEASUREMENT, UnitOfTemperature.CELSIUS)
        if unit not in (UnitOfTemperature.CELSIUS, UnitOfTemperature.FAHRENHEIT):
            return None
        return TemperatureConverter.convert(value, unit, UnitOfTemperature.CELSIUS)

    @staticmethod
    def _light_level(states: list[State]) -> float | None:
        if not states:
            return None
        level = 0.0
        for s in states:
            if s.state == "on":
                brightness = s.attributes.get("brightness")
                level = max(level, 1.0 if brightness is None else brightness / 255)
        return level

    @staticmethod
    def _any_on(states: list[State]) -> bool | None:
        return any(s.state == "on" for s in states) if states else None

    @staticmethod
    def _motion(states: list[State], now: float) -> bool | None:
        if not states:
            return None
        quiet = R.HOME_QUIET_MINUTES * 60
        return any(
            s.state == "on" or now - s.last_changed.timestamp() < quiet for s in states
        )
