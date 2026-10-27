"""Reading the house: units, on/off entities, people, and holding through dropouts."""

from __future__ import annotations

from homeassistant.core import HomeAssistant, State
import pytest

from custom_components.virtual_pet import rates as R
from custom_components.virtual_pet.const import CONF_ZONE
from custom_components.virtual_pet.watcher import Watcher


def state(value: str, **attrs: str) -> State:
    return State("sensor.thing", value, attrs)


def test_temperatures_come_out_in_celsius():
    assert Watcher._celsius(state("20", unit_of_measurement="°C")) == 20
    assert Watcher._celsius(state("68", unit_of_measurement="°F")) == pytest.approx(20)
    # A unit it doesn't know reads as no signal.
    assert Watcher._celsius(state("20", unit_of_measurement="K")) is None
    assert Watcher._celsius(state("warm")) is None


def test_rain_is_a_rate_or_an_on_off_switch():
    assert Watcher._rain(state("on")) == 1.0
    assert Watcher._rain(state("off")) == 0.0
    assert Watcher._rain(state("2.5")) == 2.5
    assert Watcher._rain(None) is None


def test_lit_reads_a_number_or_on_but_never_a_temperature():
    assert Watcher._lit(State("light.fire", "on"))
    assert not Watcher._lit(State("light.fire", "off"))
    assert Watcher._lit(state("12"))  # a power sensor drawing something
    # A fireplace's temperature sensor isn't "lit" just for being warm.
    assert not Watcher._lit(
        state("40", unit_of_measurement="°C", device_class="temperature")
    )


def test_light_level_is_the_brightest_light_on():
    on = State("light.a", "on", {"brightness": 128})
    full = State("light.b", "on")
    off = State("light.c", "off", {"brightness": 255})
    assert Watcher._light_level([on, off]) == pytest.approx(128 / 255)
    assert Watcher._light_level([on, full]) == 1.0
    assert Watcher._light_level([]) is None


async def test_people_home_holds_through_a_dropout(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {CONF_ZONE: "zone.home"})
    hass.states.async_set("zone.home", "2")
    assert watcher.people_home(0) == 2
    hass.states.async_set("zone.home", "unavailable")
    # The last good count holds for a while, then means "no signal".
    assert watcher.people_home(60) == 2
    assert watcher.people_home(R.HOME_HOLD_MINUTES * 60 + 1) is None
