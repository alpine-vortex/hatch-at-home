"""A busy watched sensor: the pet's save is never put off for long, and only a
change the pet can notice wakes it."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import EVENT_HOMEASSISTANT_FINAL_WRITE
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
import pytest
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.virtual_pet import rates as R
from tests.test_init import STORE_KEY, hatched_pet, now, setup_with_house  # noqa: F401


@pytest.fixture
def loop_clock(hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch) -> list[float]:
    """hass.loop.time() under the test's hand: the Store's delayed write is
    timed by the loop clock, which freezer does not move. Advance with tick()."""
    clock = [hass.loop.time()]
    monkeypatch.setattr(hass.loop, "time", lambda: clock[0])
    # asyncio's slow-callback warning reads the same clock: keep it quiet.
    monkeypatch.setattr(hass.loop, "slow_callback_duration", 1e9)
    return clock


async def tick(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    clock: list[float],
    seconds: float,
) -> None:
    clock[0] += seconds
    freezer.tick(timedelta(seconds=seconds))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


def count_writes(clock: list[float]) -> list[float]:
    """The loop time of every real write of the pet's store (forced or delayed),
    from hass_storage's mock of Store._async_write_data (this test's only)."""
    when: list[float] = []
    mock = Store._async_write_data
    write = mock.side_effect

    async def counting(store: Store, data: dict[str, Any]) -> None:
        if store.key == STORE_KEY:
            when.append(clock[0])
        await write(store, data)

    mock.side_effect = counting
    return when


def count_reacts(hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Runs of the house reaction (the debounced _async_home_changed)."""
    runs = [0]
    coordinator = hass.config_entries.async_entries("virtual_pet")[0].runtime_data
    debouncer = coordinator._home_debouncer
    orig = debouncer.function

    async def counted() -> None:
        runs[0] += 1
        await orig()

    monkeypatch.setattr(debouncer, "function", counted)
    return runs


async def test_a_chatty_sensor_never_starves_the_save(
    hass: HomeAssistant,
    now: float,  # noqa: F811
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    monkeypatch: pytest.MonkeyPatch,
    loop_clock: list[float],
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("sensor.lux", "100")
    await setup_with_house(hass, lux=["sensor.lux"])
    writes = count_writes(loop_clock)
    runs = count_reacts(hass, monkeypatch)
    start = loop_clock[0]
    for i in range(1800):  # every 2 s for an hour, dark and bright: each wakes
        hass.states.async_set("sensor.lux", "150" if i % 2 else "50")
        await tick(hass, freezer, loop_clock, 2)
    gaps = [b - a for a, b in zip([start, *writes], writes, strict=False)]
    gaps.append(loop_clock[0] - writes[-1])
    print(f"chatty: reacts={runs[0]} writes={len(writes)} max gap={max(gaps)}")
    assert runs[0] >= 300  # the pet did wake for each change, every 10 s
    assert len(writes) >= 10
    assert max(gaps) <= R.SAVE_MAX_DELAY + R.SAVE_DELAY


async def test_the_final_write_after_chatter_keeps_the_newest_pet(
    hass: HomeAssistant,
    now: float,  # noqa: F811
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    loop_clock: list[float],
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("sensor.lux", "100")
    await setup_with_house(hass, lux=["sensor.lux"])
    coordinator = hass.config_entries.async_entries("virtual_pet")[0].runtime_data
    for i in range(200):  # past the ceiling, then a little more
        hass.states.async_set("sensor.lux", "150" if i % 2 else "50")
        await tick(hass, freezer, loop_clock, 2)
    coordinator.state.hunger = 42.5  # a change the next write must carry
    coordinator._save()
    hass.bus.async_fire(EVENT_HOMEASSISTANT_FINAL_WRITE)
    await hass.async_block_till_done()
    assert hass_storage[STORE_KEY]["data"] == coordinator.state.to_dict()
    assert hass_storage[STORE_KEY]["data"]["hunger"] == 42.5


async def test_lux_drift_does_not_wake_the_pet(
    hass: HomeAssistant,
    now: float,  # noqa: F811
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    monkeypatch: pytest.MonkeyPatch,
    loop_clock: list[float],
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("sensor.lux", "50")
    await setup_with_house(hass, lux=["sensor.lux"])
    runs = count_reacts(hass, monkeypatch)
    writes = count_writes(loop_clock)
    for i in range(1800):  # ±3 lux around 50, every 2 s for an hour
        hass.states.async_set("sensor.lux", str(50 + (i % 7) - 3))
        await tick(hass, freezer, loop_clock, 2)
    print(f"drift: reacts={runs[0]} writes={len(writes)}")
    assert runs[0] == 0
    assert len(writes) >= 10  # the tick still saves


async def test_the_sun_s_elevation_alone_does_not_wake_the_pet(
    hass: HomeAssistant,
    now: float,  # noqa: F811
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    monkeypatch: pytest.MonkeyPatch,
    loop_clock: list[float],
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("sun.sun", "above_horizon", {"elevation": 30.0})
    await setup_with_house(hass)
    runs = count_reacts(hass, monkeypatch)
    for i in range(60):  # the sun's minutely update, for an hour
        hass.states.async_set("sun.sun", "above_horizon", {"elevation": 30.0 - i / 4})
        await tick(hass, freezer, loop_clock, 60)
    print(f"sun: reacts={runs[0]}")
    assert runs[0] == 0
    hass.states.async_set("sun.sun", "below_horizon", {"elevation": -1.0})
    await tick(hass, freezer, loop_clock, 11)
    assert runs[0] == 1


S = Callable[[HomeAssistant], None]


def _set(entity_id: str, value: str, **attrs: Any) -> S:
    return lambda hass: hass.states.async_set(entity_id, value, attrs)


WEATHER = {"temperature": 12, "temperature_unit": "°C", "wind_speed": 5}

# (options, the state before, the change the pet must notice)
NOTICED = {
    "lux crossing the night cutoff": (
        {"lux": ["sensor.lux"]},
        _set("sensor.lux", "95"),
        _set("sensor.lux", "101"),
    ),
    "dimmer brightness, still on": (
        {"room_lights": ["light.lamp"]},
        _set("light.lamp", "on", brightness=50),
        _set("light.lamp", "on", brightness=230),
    ),
    "hvac_action flip": (
        {"heating": ["climate.hall"]},
        _set("climate.hall", "heat", hvac_action="idle"),
        _set("climate.hall", "heat", hvac_action="heating"),
    ),
    "weather condition": (
        {"weather": "weather.home"},
        _set("weather.home", "cloudy", **WEATHER),
        _set("weather.home", "rainy", **WEATHER),
    ),
    "rain starts": (
        {"rain": "sensor.rain"},
        _set("sensor.rain", "0"),
        _set("sensor.rain", "0.1"),
    ),
    "fireplace lit": (
        {"fireplace": "sensor.fire_power"},
        _set("sensor.fire_power", "0"),
        _set("sensor.fire_power", "1"),
    ),
    "sun sets": (
        {},
        _set("sun.sun", "above_horizon", elevation=1.0),
        _set("sun.sun", "below_horizon", elevation=-0.5),
    ),
    "motion on": (
        {"motion": ["binary_sensor.hall"]},
        _set("binary_sensor.hall", "off"),
        _set("binary_sensor.hall", "on"),
    ),
    "motion off": (
        {"motion": ["binary_sensor.hall"]},
        _set("binary_sensor.hall", "on"),
        _set("binary_sensor.hall", "off"),
    ),
    "tv paused": (
        {"tv": ["media_player.tv"]},
        _set("media_player.tv", "playing", media_title="Show"),
        _set("media_player.tv", "paused", media_title="Show"),
    ),
    "track change": (
        {"music": ["media_player.radio"]},
        _set("media_player.radio", "playing", media_title="One", media_artist="A"),
        _set("media_player.radio", "playing", media_title="Two", media_artist="A"),
    ),
    "unavailable comes back": (
        {"lux": ["sensor.lux"]},
        _set("sensor.lux", "unavailable"),
        _set("sensor.lux", "50"),
    ),
}


@pytest.mark.parametrize("case", list(NOTICED))
async def test_a_change_the_pet_can_notice_wakes_it(
    hass: HomeAssistant,
    now: float,  # noqa: F811
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    monkeypatch: pytest.MonkeyPatch,
    loop_clock: list[float],
    case: str,
) -> None:
    options, before, after = NOTICED[case]
    hass_storage[STORE_KEY] = hatched_pet(now)
    before(hass)
    await setup_with_house(hass, **options)
    await tick(hass, freezer, loop_clock, 11)  # anything from the setup is done
    runs = count_reacts(hass, monkeypatch)
    after(hass)
    await tick(hass, freezer, loop_clock, R.HOME_DEBOUNCE_SECONDS)
    assert runs[0] == 1
