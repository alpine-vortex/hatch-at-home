"""Reading the house: units, on/off entities, people, and holding through dropouts."""

from __future__ import annotations

from homeassistant.core import HomeAssistant, State
import pytest

from custom_components.virtual_pet import rates as R
from custom_components.virtual_pet.const import CONF_ZONE
from custom_components.virtual_pet.home import DayForecast
from custom_components.virtual_pet.watcher import Watcher, daily_forecast


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


def test_wind_comes_out_in_kmh(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {"weather": "weather.home"})
    hass.states.async_set(
        "weather.home",
        "cloudy",
        {"wind_speed": 10, "wind_gust_speed": 20, "wind_speed_unit": "m/s"},
    )
    r = watcher.read(0, night=False)
    assert r.wind_kmh == pytest.approx(36)
    assert r.gust_kmh == pytest.approx(72)
    hass.states.async_set("weather.home", "cloudy", {"wind_speed": 12})
    r = watcher.read(0, night=False)
    assert r.wind_kmh == 12 and r.gust_kmh is None  # no unit: km/h


async def test_daily_forecast_by_local_day_in_celsius(hass: HomeAssistant) -> None:
    await hass.config.async_set_time_zone("America/Los_Angeles")
    days = daily_forecast(
        [
            # 06:00 UTC is still the day before in Los Angeles (PDT).
            {
                "datetime": "2026-10-28T06:00:00+00:00",
                "condition": "rainy",
                "temperature": 59,
                "templow": 50,
            },
            {
                "datetime": "2026-10-28T19:00:00+00:00",
                "condition": "snowy",
                "temperature": 32,
            },
            {"datetime": "2026-10-28T20:00:00+00:00", "condition": "sunny"},
            {"datetime": "not a date", "condition": "sunny"},
        ],
        "°F",
    )
    assert list(days) == ["2026-10-27", "2026-10-28"]
    assert days["2026-10-27"].condition == "rainy"
    assert days["2026-10-27"].high_c == pytest.approx(15)
    assert days["2026-10-27"].low_c == pytest.approx(10)
    assert days["2026-10-28"] == DayForecast("snowy", pytest.approx(0), None)


def test_the_moon_comes_from_the_date_only_when_no_moon_option_is_mapped(
    hass: HomeAssistant,
) -> None:
    from custom_components.virtual_pet.home import moon_by_date

    full = 1795478400.0  # 2026-11-24 00:00 UTC
    assert moon_by_date(full) == "full_moon"
    assert Watcher(hass, {}).read(full, night=True).moon_date == "full_moon"
    mapped = Watcher(hass, {"moon_phase": "sensor.moon"})
    # Mapped, even if the sensor is briefly gone: the sensor's word is the only one.
    assert mapped.read(full, night=True).moon_date is None
    lit = Watcher(hass, {"moon_illumination": "sensor.lit"})
    assert lit.read(full, night=True).moon_date is None


def test_heating_and_cooling_read_from_climates_switches_and_fans(
    hass: HomeAssistant,
) -> None:
    watcher = Watcher(
        hass,
        {
            "heating": ["climate.hall", "switch.heater"],
            "cooling": ["fan.bedroom", "climate.hall"],
        },
    )

    def read(climate: str, attrs: dict, fan: str = "off", heater: str = "off"):
        hass.states.async_set("climate.hall", climate, attrs)
        hass.states.async_set("switch.heater", heater)
        hass.states.async_set("fan.bedroom", fan)
        return watcher.read(0, night=False)

    r = read("heat", {"hvac_action": "heating"})
    assert r.heating_on and not r.cooling_on
    r = read("heat", {"hvac_action": "idle"})
    assert not r.heating_on  # set to heat, but not heating now
    # No hvac_action: set to heat and below the target counts.
    r = read("heat", {"current_temperature": 18, "temperature": 21})
    assert r.heating_on
    r = read("heat", {"current_temperature": 22, "temperature": 21})
    assert not r.heating_on
    r = read("heat_cool", {"current_temperature": 18, "temperature": 21})
    assert r.heating_on
    r = read("heat", {})
    assert not r.heating_on  # no target to compare with
    r = read("off", {}, heater="on")
    assert r.heating_on
    # Cooling: a fan on, a climate cooling or running its fan.
    r = read("cool", {"hvac_action": "cooling"})
    assert r.cooling_on and not r.heating_on
    r = read("off", {"hvac_action": "fan"})
    assert r.cooling_on
    r = read("cool", {})
    assert r.cooling_on
    r = read("fan_only", {})
    assert r.cooling_on
    r = read("off", {}, fan="on")
    assert r.cooling_on
    r = read("off", {})
    assert not r.cooling_on and not r.heating_on


def test_heating_and_cooling_are_off_when_unmapped(hass: HomeAssistant) -> None:
    hass.states.async_set("climate.hall", "heat", {"hvac_action": "heating"})
    r = Watcher(hass, {}).read(0, night=False)
    assert not r.heating_on and not r.cooling_on
    assert "climate.hall" in Watcher(hass, {"heating": "climate.hall"}).entity_ids()
