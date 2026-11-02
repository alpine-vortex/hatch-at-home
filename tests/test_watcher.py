"""Reading the house: units, on/off entities, people, and holding through dropouts."""

from __future__ import annotations

from homeassistant.core import HomeAssistant, State
import pytest

from custom_components.virtual_pet import rates as R
from custom_components.virtual_pet.const import CONF_ZONE
from custom_components.virtual_pet.home import DayForecast
from custom_components.virtual_pet.watcher import (
    Watcher,
    appliance_kind,
    daily_forecast,
)


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


def test_a_cleaning_vacuum_sets_robot_cleaning(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {})
    hass.states.async_set("vacuum.x", "docked")
    assert not watcher.read(0, night=False).robot_cleaning
    hass.states.async_set("vacuum.x", "cleaning")
    r = watcher.read(0, night=False)
    assert r.robot_cleaning and not r.robot_docked
    hass.states.async_set("vacuum.x", "returning")
    r = watcher.read(0, night=False)
    assert not r.robot_cleaning and r.robot_docked
    hass.states.async_set("vacuum.x", "docked")
    assert watcher.read(0, night=False).robot_docked
    # notice_robot off: vacuums are neither read nor listened to.
    hass.states.async_set("vacuum.x", "cleaning")
    off = Watcher(hass, {"notice_robot": False})
    assert not off.read(0, night=False).robot_cleaning
    assert "vacuum.x" not in off.entity_ids()


def test_vacuums_are_found_by_domain_and_listened_to(hass: HomeAssistant) -> None:
    hass.states.async_set("vacuum.b", "docked")
    hass.states.async_set("vacuum.a", "docked")
    hass.states.async_set("lawn_mower.m", "mowing")
    watcher = Watcher(hass, {})
    assert watcher.robot_ids() == ["vacuum.a", "vacuum.b"]
    assert {"vacuum.a", "vacuum.b"} <= set(watcher.entity_ids())
    assert "lawn_mower.m" not in watcher.entity_ids()


def test_heating_and_cooling_are_off_when_unmapped(hass: HomeAssistant) -> None:
    hass.states.async_set("climate.hall", "heat", {"hvac_action": "heating"})
    r = Watcher(hass, {}).read(0, night=False)
    assert not r.heating_on and not r.cooling_on
    assert "climate.hall" in Watcher(hass, {"heating": "climate.hall"}).entity_ids()


# --- ha-signals H6: appliance done ---


def _kinds(watcher: Watcher, minute: float) -> tuple[str, ...]:
    return watcher.read(minute * 60, night=False).appliances_done


def test_a_binary_running_15_minutes_then_off_fires_once(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {"appliances": ["binary_sensor.washing_machine"]})
    hass.states.async_set("binary_sensor.washing_machine", "on")
    for minute in (0, 5, 10, 15):
        assert _kinds(watcher, minute) == ()
    hass.states.async_set("binary_sensor.washing_machine", "off")
    assert _kinds(watcher, 16) == ("washer",)
    assert _kinds(watcher, 21) == ()  # once per cycle


def test_a_five_minute_binary_run_does_not_fire(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {"appliances": ["binary_sensor.thing"]})
    hass.states.async_set("binary_sensor.thing", "on")
    assert _kinds(watcher, 0) == ()
    assert _kinds(watcher, 5) == ()
    hass.states.async_set("binary_sensor.thing", "off")
    assert _kinds(watcher, 6) == ()
    # ...and the short run isn't remembered as part of the next one.
    hass.states.async_set("binary_sensor.thing", "on")
    assert _kinds(watcher, 7) == ()
    hass.states.async_set("binary_sensor.thing", "off")
    assert _kinds(watcher, 8) == ()


def test_an_enum_run_then_finished_fires(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {"appliances": ["sensor.dryer_program"]})
    hass.states.async_set("sensor.dryer_program", "idle")
    assert _kinds(watcher, 0) == ()
    hass.states.async_set("sensor.dryer_program", "Run")
    assert _kinds(watcher, 1) == ()
    hass.states.async_set(
        "sensor.dryer_program", "BSH.Common.EnumType.OperationState.Finished"
    )
    assert _kinds(watcher, 2) == ("dryer",)
    assert _kinds(watcher, 7) == ()


def test_an_enum_already_finished_at_the_start_says_nothing(
    hass: HomeAssistant,
) -> None:
    watcher = Watcher(hass, {"appliances": ["sensor.machine_state"]})
    hass.states.async_set("sensor.machine_state", "finished")
    assert _kinds(watcher, 0) == ()
    # "pending" is a state of its own, not an "end".
    hass.states.async_set("sensor.machine_state", "running")
    assert _kinds(watcher, 1) == ()
    hass.states.async_set("sensor.machine_state", "pending")
    assert _kinds(watcher, 2) == ()
    hass.states.async_set("sensor.machine_state", "Ended")
    assert _kinds(watcher, 3) == ("machine",)


def _power(hass: HomeAssistant, entity_id: str, watts: float) -> None:
    hass.states.async_set(
        entity_id, str(watts), {"device_class": "power", "unit_of_measurement": "W"}
    )


def test_a_power_sensor_900w_12_min_then_2w_4_min_fires(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {"appliances": ["sensor.washer_power"]})
    _power(hass, "sensor.washer_power", 900)
    for minute in (0, 4, 8, 12):
        assert _kinds(watcher, minute) == ()
    _power(hass, "sensor.washer_power", 2)
    assert _kinds(watcher, 12.5) == ()  # low for no time yet
    assert _kinds(watcher, 14) == ()
    assert _kinds(watcher, 16.5) == ("washer",)
    assert _kinds(watcher, 20) == ()


def test_a_power_sensor_at_2w_for_2_min_does_not_fire_yet(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {"appliances": ["sensor.washer_power"]})
    _power(hass, "sensor.washer_power", 900)
    for minute in (0, 5, 10, 12):
        assert _kinds(watcher, minute) == ()
    _power(hass, "sensor.washer_power", 2)
    assert _kinds(watcher, 13) == ()
    assert _kinds(watcher, 15) == ()
    # A burst of power in between starts the wait again.
    _power(hass, "sensor.washer_power", 400)
    assert _kinds(watcher, 16) == ()
    _power(hass, "sensor.washer_power", 2)
    assert _kinds(watcher, 17) == ()
    assert _kinds(watcher, 19) == ()


def test_a_power_reading_never_idle_for_the_run_does_not_fire(
    hass: HomeAssistant,
) -> None:
    watcher = Watcher(hass, {"appliances": ["sensor.p"]})
    _power(hass, "sensor.p", 900)
    assert _kinds(watcher, 0) == ()
    assert _kinds(watcher, 5) == ()
    _power(hass, "sensor.p", 1)  # a 5-minute rinse, not a cycle
    assert _kinds(watcher, 6) == ()
    assert _kinds(watcher, 12) == ()


def test_appliance_watts_sets_the_idle_line(hass: HomeAssistant) -> None:
    hass.states.async_set("sensor.p", "20", {"device_class": "power"})
    low = Watcher(hass, {"appliances": ["sensor.p"], "appliance_watts": 30})
    high = Watcher(hass, {"appliances": ["sensor.p"]})  # the default, 5 W
    for watcher, want in ((low, ()), (high, ())):
        assert _kinds(watcher, 0) == ()
        assert _kinds(watcher, 11) == want
    # 20 W counts as running at the default, and as idle (not running) at 30 W.
    assert high._cycles["sensor.p"].running
    assert not low._cycles["sensor.p"].running


def test_a_switch_with_current_power_w_reads_like_a_power_sensor(
    hass: HomeAssistant,
) -> None:
    watcher = Watcher(hass, {"appliances": ["switch.dishwasher_plug"]})
    hass.states.async_set("switch.dishwasher_plug", "on", {"current_power_w": 1500})
    for minute in (0, 6, 11):
        assert _kinds(watcher, minute) == ()
    hass.states.async_set("switch.dishwasher_plug", "on", {"current_power_w": 0.4})
    assert _kinds(watcher, 12) == ()
    assert _kinds(watcher, 16) == ("dishwasher",)
    # A switch that reports no power says nothing.
    hass.states.async_set("switch.plain", "on")
    plain = Watcher(hass, {"appliances": ["switch.plain"]})
    assert _kinds(plain, 0) == ()


def test_one_done_an_hour_per_entity(hass: HomeAssistant) -> None:
    watcher = Watcher(hass, {"appliances": ["binary_sensor.washer"]})

    def cycle(start: float) -> tuple[str, ...]:
        hass.states.async_set("binary_sensor.washer", "on")
        _kinds(watcher, start)
        _kinds(watcher, start + 10)
        hass.states.async_set("binary_sensor.washer", "off")
        return _kinds(watcher, start + 11)

    assert cycle(0) == ("washer",)
    assert cycle(20) == ()  # 31 minutes after the first
    assert cycle(100) == ("washer",)  # an hour on


def test_the_kind_comes_from_the_class_or_the_entity_words() -> None:
    kind = appliance_kind
    assert kind("sensor.kitchen_dishwasher_state") == "dishwasher"
    assert kind("binary_sensor.dish_machine_running") == "dishwasher"
    assert kind("sensor.washing_machine") == "washer"
    assert kind("switch.wash_plug") == "washer"
    assert kind("sensor.tumble_dryer_program") == "dryer"
    assert kind("sensor.dry_cycle") == "dryer"
    assert kind("sensor.laundry_done") == "machine"  # "laundry" isn't "dry"
    assert kind("sensor.oven_state") == "machine"
    assert kind("sensor.thing", "washer") == "washer"  # the device class's word


def test_appliances_are_listened_to_and_no_entity_leaves_the_watcher(
    hass: HomeAssistant,
) -> None:
    watcher = Watcher(hass, {"appliances": ["binary_sensor.dishwasher"]})
    assert "binary_sensor.dishwasher" in watcher.entity_ids()
    hass.states.async_set("binary_sensor.dishwasher", "on")
    _kinds(watcher, 0)
    _kinds(watcher, 10)
    hass.states.async_set("binary_sensor.dishwasher", "off")
    r = watcher.read(11 * 60, night=False)
    assert r.appliances_done == ("dishwasher",)
    assert "dishwasher" in str(r) and "binary_sensor" not in str(r)
