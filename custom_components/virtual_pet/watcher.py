"""Reads the owner's mapped entities into a home.Readings snapshot.

Bad inputs are treated as "no signal": unavailable and unknown keep the last
good value for HOME_HOLD_MINUTES, then count as unmapped, so a Zigbee dropout
never reads as "nobody home, pitch dark".
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from homeassistant.const import (
    ATTR_UNIT_OF_MEASUREMENT,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant, State
from homeassistant.util.unit_conversion import TemperatureConverter

from . import rates as R
from .const import (
    CONF_AQI,
    CONF_BEDTIME_LIGHTS,
    CONF_FIREPLACE,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SOLAR,
    CONF_TV,
    CONF_WEATHER,
    CONF_ZONE,
    DEFAULT_ZONE,
)
from .home import Readings

BAD = (STATE_UNAVAILABLE, STATE_UNKNOWN)
VIDEO = {"movie", "tvshow", "video", "episode", "channel"}

MULTI = (
    CONF_BEDTIME_LIGHTS,
    CONF_MOTION,
    CONF_ROOM_LIGHTS,
    CONF_LUX,
    CONF_MUSIC,
    CONF_TV,
)
SINGLE = (
    CONF_WEATHER,
    CONF_RAIN,
    CONF_SOLAR,
    CONF_INDOOR_TEMP,
    CONF_AQI,
    CONF_FIREPLACE,
)
# A fireplace can be a switch, light, climate, fan or sensor: these mean lit.
LIT = {"on", "heat", "heating", "burning", "playing"}


def _float(state: State | None) -> float | None:
    try:
        return float(state.state) if state else None
    except ValueError:
        return None


class Watcher:
    """Holds the mapping and the last good value of each entity."""

    def __init__(self, hass: HomeAssistant, options: Mapping[str, Any]) -> None:
        self.hass = hass
        self.options = options
        self._good: dict[str, tuple[State, float]] = {}

    def _ids(self, key: str) -> list[str]:
        value = self.options.get(key) or []
        return [value] if isinstance(value, str) else list(value)

    @property
    def zone(self) -> str:
        return self.options.get(CONF_ZONE) or DEFAULT_ZONE

    def entity_ids(self) -> list[str]:
        """Everything worth listening to."""
        ids = [self.zone, "sun.sun"]
        for key in (*MULTI, *SINGLE):
            ids += self._ids(key)
        return sorted(set(ids))

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

    def people_home(self, now: float) -> int | None:
        """Persons in the home zone, or None without a signal."""
        value = _float(self._get(self.zone, now))
        return None if value is None else int(value)

    def read(self, now: float, night: bool) -> Readings:
        """A snapshot of the house."""
        sun = self._get("sun.sun", now)
        weather = self._one(CONF_WEATHER, now)
        return Readings(
            night=night,
            sun_up=None if sun is None else sun.state == "above_horizon",
            condition=weather.state if weather else None,
            rain_rate=_float(self._one(CONF_RAIN, now)),
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
        )

    @staticmethod
    def _lit(state: State | None) -> bool:
        if state is None:
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
