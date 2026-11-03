"""The device-alive signal bridge, server half (slices 3A and 4A, plan section 6).

Every test of a key's behaviour runs once per key of DEVICE_SIGNAL_MAP (rain, snow,
fog, storm, wind): a new row of the map is tested by being in the map.

`current` rides in the house view, `recent` beside the house on the snapshot, and
each transition goes out once as `{"fx": entry}` after the house change it belongs
to. Everything is in memory: nothing here may reach a save, the bus or a sensor.
"""

from __future__ import annotations

from dataclasses import replace
import json
import os
from pathlib import Path
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL
from homeassistant.core import Event, HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import device_fx
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.coordinator import PetCoordinator
from custom_components.virtual_pet.device_fx import (
    BLOCK_SECONDS,
    DEVICE_SIGNAL_MAP,
    KINDS,
    RING_SECONDS,
    DeviceFx,
    export_signal_map,
    mapped_keys,
    rain_reading,
    wind_reading,
)
from custom_components.virtual_pet.home import Readings

from .test_channel import FX_ON as ON, pushed, subscribe
from .test_init import STORE_KEY, hatched_pet, settle, setup_with_house

BLOCK = int(BLOCK_SECONDS)
KEYS = list(DEVICE_SIGNAL_MAP)

OFF = "sunny"
per_key = pytest.mark.parametrize("key", KEYS)


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


@pytest.fixture(autouse=True)
def an_admin(now: float, hass_admin_user: Any) -> None:
    """The websocket client signs in as the admin (the private channel's user);
    the clock moves first, or the token's issue time is in the future."""


async def house(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    now: float,
    weather: str | None = "sunny",
    mapped: bool = True,
    **options: Any,
) -> PetCoordinator:
    """A hatched pet with a weather entity mapped (in this state, or absent)."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    if weather is not None:
        hass.states.async_set("weather.home", weather)
    if mapped:
        options = {"weather": "weather.home"} | options
    await setup_with_house(hass, **options)
    return hass.config_entries.async_entries(DOMAIN)[0].runtime_data


def fx_messages(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [e["fx"] for e in events if "fx" in e]


def values(events: list[dict[str, Any]], key: str) -> list[bool]:
    """The `key` value of every house message that carries one."""
    return [
        e["house"]["device_fx"]["current"][key]
        for e in events
        if key in e.get("house", {}).get("device_fx", {}).get("current", {})
    ]


async def flip(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, state: str, wait: float = 11
) -> None:
    """The weather changes; the home debouncer (10 s) runs the pass."""
    hass.states.async_set("weather.home", state)
    await settle(hass, freezer, wait)


# -- the module itself -----------------------------------------------------------


def test_every_key_of_the_map_has_a_row_in_this_file() -> None:
    assert set(ON) == set(DEVICE_SIGNAL_MAP)


def test_the_kinds_are_derived_from_the_map() -> None:
    assert KINDS == tuple(f"{k}_{e}" for k in KEYS for e in ("started", "stopped"))
    assert device_fx.SCOPE == "house"
    for key, spec in DEVICE_SIGNAL_MAP.items():
        assert spec.type == "bool" and spec.kinds == (
            f"{key}_started",
            f"{key}_stopped",
        )
        assert spec.block_s == 45  # one number to tune (FM8)
        assert (spec.echo, spec.echo_ttl_s, spec.echo_rank) == (True, RING_SECONDS, 2)


def test_a_condition_turns_on_its_key_and_only_its_key() -> None:
    for key, state in ON.items():
        readings = Readings(night=False, condition=state)
        got = {k: spec.read(readings) for k, spec in DEVICE_SIGNAL_MAP.items()}
        assert got == {k: k == key for k in KEYS}, state
    # Compound weather is several keys at once (plan 6.2a, F7).
    both = Readings(night=False, condition="lightning-rainy")
    assert DEVICE_SIGNAL_MAP["rain"].read(both) and DEVICE_SIGNAL_MAP["storm"].read(
        both
    )
    gusty = Readings(night=False, condition="snowy", wind_kmh=45.0)
    assert DEVICE_SIGNAL_MAP["snow"].read(gusty) and DEVICE_SIGNAL_MAP["wind"].read(
        gusty
    )


def test_rain_is_known_or_it_is_unknown() -> None:
    assert rain_reading(Readings(night=False)) is None  # not "dry"
    assert rain_reading(Readings(night=False, condition="rainy")) is True
    assert rain_reading(Readings(night=False, condition="sunny")) is False
    # A rain gauge beats the forecast, and alone it is enough to know.
    assert rain_reading(Readings(night=False, rain_rate=0.4)) is True
    assert (
        rain_reading(Readings(night=False, rain_rate=0.0, condition="rainy")) is False
    )


@pytest.mark.parametrize("key", ["snow", "fog", "storm"])
def test_a_rain_gauge_alone_does_not_make_the_condition_keys_dry(key: str) -> None:
    gauge = Readings(night=False, rain_rate=0.0)
    assert DEVICE_SIGNAL_MAP[key].read(gauge) is None
    assert DEVICE_SIGNAL_MAP[key].read(Readings(night=False)) is None
    assert (
        DEVICE_SIGNAL_MAP[key].read(Readings(night=False, condition="sunny")) is False
    )


def test_wind_is_known_by_the_condition_or_either_speed() -> None:
    assert wind_reading(Readings(night=False)) is None
    assert wind_reading(Readings(night=False, rain_rate=0.0)) is None
    assert wind_reading(Readings(night=False, condition="sunny")) is False
    assert wind_reading(Readings(night=False, wind_kmh=5.0)) is False
    assert wind_reading(Readings(night=False, wind_kmh=35.0)) is True
    assert wind_reading(Readings(night=False, gust_kmh=60.0)) is True
    assert wind_reading(Readings(night=False, condition="windy")) is True


def test_the_map_is_exported_to_the_json_the_card_tests_read() -> None:
    """tests/js/device_signal_map.json is the map, committed: a new row, a changed
    number or a renamed kind must be a visible diff for the card's parity test.
    To accept a change: UPDATE_DEVICE_SIGNAL_MAP=1 pytest tests/test_device_fx.py"""
    path = Path(__file__).parent / "js" / "device_signal_map.json"
    text = json.dumps(export_signal_map(), indent=2) + "\n"
    if os.environ.get("UPDATE_DEVICE_SIGNAL_MAP"):
        path.write_text(text)
    assert path.read_text() == text, (
        "DEVICE_SIGNAL_MAP and tests/js/device_signal_map.json differ; if the map "
        "is right, run: UPDATE_DEVICE_SIGNAL_MAP=1 pytest tests/test_device_fx.py"
    )


def test_a_value_outside_a_rows_type_is_never_on_the_wire() -> None:
    """6.2a rule 1: `current` is rebuilt from the map and only a bool of a bool row
    (or a member of an enum row) passes; anything else is dropped."""
    bool_row = DEVICE_SIGNAL_MAP["rain"]
    for bad in ("Zebulon", "on", 1, 0, 1.5, None, [True], {"rain": True}):
        assert bool_row.clean(bad) is None, bad
    assert bool_row.clean(True) is True and bool_row.clean(False) is False
    enum_row = replace(bool_row, type=("low", "high"))
    assert enum_row.clean("low") == "low"
    for bad in ("Zebulon", "LOW", True, 1, None):
        assert enum_row.clean(bad) is None, bad
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    fx._keys["rain"].value = "Zebulon"  # even a bad value in the state is not sent
    fx._keys["snow"].value = 1
    fx._keys["fog"].value = False
    assert fx.view() == {"version": 1, "current": {"fog": False}}


def test_a_kind_outside_the_map_never_reaches_the_ring() -> None:
    """Not an `assert` (python -O strips those): the entry is dropped."""
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    spec = DEVICE_SIGNAL_MAP["rain"]
    odd = replace(spec, kinds=("hail_started", "hail_stopped"))
    with patch.dict(DEVICE_SIGNAL_MAP, {"rain": odd}):
        fx._keys["rain"].value = True
        fx._add("rain", 1000.0)
    assert fx.recent(1000.0) == [] and fx.take_fresh(1000.0) == []


def test_mapped_keys_follow_the_sources() -> None:
    assert mapped_keys({}) == ()
    assert mapped_keys({"weather": ""}) == ()
    assert mapped_keys({"weather": "weather.home"}) == tuple(KEYS)
    assert mapped_keys({"rain": "sensor.gauge"}) == ("rain",)
    assert mapped_keys({"tv": ["media_player.tv"]}) == ()


# -- case 1, 2, 3, 7: the leading edge, the echo window, the same id twice ---------


@per_key
async def test_a_key_starts_the_house_first_then_one_fx_and_no_speech(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    # Every key of the map is known and off; the rain wire is as 3A shipped it.
    assert snapshot["house"]["device_fx"] == {
        "version": 1,
        "current": {k: False for k in KEYS},
    }
    assert snapshot["device_fx_recent"] == []
    await flip(hass, freezer, ON[key])
    got = await pushed(client)
    assert values(got, key) == [True]
    (entry,) = fx_messages(got)
    assert entry["kind"] == f"{key}_started" and entry["scope"] == "house"
    assert set(entry) == {"id", "kind", "occurred_at", "expires_at", "scope"}
    # The M1 order: the new ambience first, the onset second.
    order = [next(iter(e)) for e in got if "house" in e or "fx" in e]
    assert order == ["house", "fx"]
    # The entry is on no moment: the existing speech path is not used (case 1).
    assert entry["id"] not in json.dumps([e for e in got if "moment" in e])
    # occurred_at is the accepting pass, expires_at 90 s on (B1).
    at = dt_util.parse_datetime(entry["occurred_at"])
    assert at is not None and abs((at - dt_util.utcnow()).total_seconds()) < 1
    end = dt_util.parse_datetime(entry["expires_at"])
    assert end is not None and (end - at).total_seconds() == RING_SECONDS


@per_key
async def test_a_card_opened_20_seconds_later_finds_the_transition_then_none_at_90(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    await house(hass, hass_storage, now)
    watching = await hass_ws_client(hass)
    await subscribe(watching)
    await flip(hass, freezer, ON[key])
    (live,) = fx_messages(await pushed(watching))
    await settle(hass, freezer, 20)
    late = await subscribe(await hass_ws_client(hass))  # case 2
    assert late["house"]["device_fx"]["current"][key] is True
    # Case 7: the same event, once in the snapshot ring and once live, one id.
    assert [e["id"] for e in late["device_fx_recent"]] == [live["id"]]
    assert late["device_fx_recent"] == [live]
    await settle(hass, freezer, 70)  # 90 s after the pass
    later = await subscribe(await hass_ws_client(hass))  # case 3
    assert later["device_fx_recent"] == []
    assert later["house"]["device_fx"]["current"][key] is True  # ambience stays


@per_key
async def test_a_snapshot_sent_with_the_pass_and_the_live_message_share_an_id(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """A watcher that connects in the same instant gets the entry twice, as the
    plan says (case 7); the card keeps one by id."""
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    pet._sent.clear()  # this watcher is new to the next push: it gets a snapshot
    await flip(hass, freezer, ON[key])
    got = await pushed(client)
    (snap,) = [e for e in got if "device_fx_recent" in e]
    (live,) = fx_messages(got)
    assert [e["id"] for e in snap["device_fx_recent"]] == [live["id"]]


@per_key
async def test_a_push_with_no_change_sends_nothing(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """B4: `recent` expiring between pushes must not look like a house change."""
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, ON[key])
    await pushed(client)
    await settle(hass, freezer, 100)  # the ring empties on its own
    pet._push_watchers()
    pet._push_watchers()
    assert await pushed(client) == []


# -- case 5: a restart in the weather ----------------------------------------------


@per_key
async def test_a_restart_in_the_weather_has_it_and_no_fake_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await house(hass, hass_storage, now, weather=ON[key])
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"]["current"][key] is True
    assert snapshot["device_fx_recent"] == []
    await settle(hass, freezer, 11)
    assert fx_messages(await pushed(client)) == []
    # The reload variant: a card open across it is sent a fresh snapshot, and an
    # empty ring, and no live message.
    pet.async_start_channel()
    got = await pushed(client)
    (fresh,) = [e for e in got if "device_fx_recent" in e]
    assert fresh["house"]["device_fx"]["current"][key] is True
    assert fresh["device_fx_recent"] == [] and fx_messages(got) == []


# -- case 6: unavailable and back; never known; the first reading --------------------


@per_key
async def test_a_short_outage_holds_the_value_and_a_return_is_no_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    await house(hass, hass_storage, now, weather=ON[key])
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "unavailable")  # inside the 10 min hold: still on
    await settle(hass, freezer, 240)
    await flip(hass, freezer, OFF)  # back, and changed: a true later change
    got = await pushed(client)
    assert values(got, key) == [False]
    assert [e["kind"] for e in fx_messages(got)] == [f"{key}_stopped"]


@per_key
@pytest.mark.parametrize("back", ["same", "changed"])
async def test_an_outage_past_the_hold_comes_back_silently(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
    back: str,
) -> None:
    pet = await house(hass, hass_storage, now, weather=ON[key])
    client = await hass_ws_client(hass)
    await subscribe(client)
    hass.states.async_set("weather.home", "unavailable")
    got = []
    for _ in range(3):  # 15 min of ticks: past the hold, then unknown
        await settle(hass, freezer, 300)
        got += await pushed(client)
    assert fx_messages(got) == [] and values(got, key) == []  # unknown sends nothing
    assert pet.device_fx.view()["current"][key] is True  # the last accepted
    returned = ON[key] if back == "same" else OFF
    await flip(hass, freezer, returned)  # the first known reading after unknown
    got = await pushed(client)
    assert fx_messages(got) == []  # no onset out of unknown
    assert pet.device_fx.recent(pet._now()) == []
    assert pet.device_fx.view()["current"][key] is (back == "same")  # truth
    # ...and a true later change after that is an onset again.
    await settle(hass, freezer, BLOCK)
    await flip(hass, freezer, OFF if back == "same" else ON[key])
    assert len(fx_messages(await pushed(client))) == 1


@per_key
async def test_a_key_that_was_never_known_is_missing_not_off(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await house(hass, hass_storage, now, weather=None)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"] == {"version": 1, "current": {}}
    assert pet.device_fx.recent(pet._now()) == []
    await flip(hass, freezer, ON[key])  # the first known reading: silent
    got = await pushed(client)
    assert values(got, key) == [True] and fx_messages(got) == []
    assert pet.device_fx.recent(pet._now()) == []


# -- case 11: the leading edge, the block, the timer, the unload ---------------------


@per_key
async def test_a_flap_inside_the_block_sends_nothing_more(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, ON[key])  # the leading edge, at once (0-10 s)
    assert [e["kind"] for e in fx_messages(await pushed(client))] == [f"{key}_started"]
    await flip(hass, freezer, OFF)  # a reverse inside the block: held
    await flip(hass, freezer, ON[key])  # and back: the flap undid itself
    await settle(hass, freezer, BLOCK)  # the timer fires, one more pass looks
    assert await pushed(client) == []
    assert pet.device_fx.view()["current"][key] is True


@per_key
async def test_a_flap_that_settles_on_the_reverse_is_one_onset_after_the_block(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, ON[key])
    await pushed(client)
    start = dt_util.utcnow()
    await flip(hass, freezer, OFF)  # held: the glass stays as it was
    assert await pushed(client) == []
    assert pet.device_fx.view()["current"][key] is True
    # N + 0 to 10 s after the first accepted change (45-55 s), then one onset.
    while pet.device_fx.view()["current"][key]:
        await settle(hass, freezer, 5)
        assert (dt_util.utcnow() - start).total_seconds() <= BLOCK + 10 + 5
    held = (dt_util.utcnow() - start).total_seconds()
    assert BLOCK <= held <= BLOCK + 10 + 5
    got = await pushed(client)
    assert values(got, key) == [False]
    assert [e["kind"] for e in fx_messages(got)] == [f"{key}_stopped"]
    assert len(pet.device_fx.recent(pet._now())) == 2  # started, then stopped


@per_key
async def test_a_reverse_after_the_block_is_accepted_like_any_first_change(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, ON[key])
    await settle(hass, freezer, BLOCK + 10)  # the block is over, nothing pending
    await pushed(client)
    await flip(hass, freezer, OFF)  # 0-10 s, not another 45
    assert [e["kind"] for e in fx_messages(await pushed(client))] == [f"{key}_stopped"]


@per_key
async def test_unload_cancels_the_block_timer(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await house(hass, hass_storage, now)
    await flip(hass, freezer, ON[key])
    assert pet.device_fx._keys[key].timer is not None  # a block is running
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert all(k.timer is None for k in pet.device_fx._keys.values())  # not persisted


@per_key
async def test_unknown_during_a_block_drops_the_block(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, ON[key])
    state = pet.device_fx._keys[key]
    assert state.timer is not None
    # Unknown arrives (the entity is gone, past the hold): the block is dropped.
    hass.states.async_remove("weather.home")
    pet.watcher._good.clear()
    pet._sense_home(pet._now())
    assert state.timer is None and state.block_until is None
    assert pet.device_fx.view()["current"][key] is True  # the last accepted
    await pushed(client)
    hass.states.async_set("weather.home", OFF)  # a changed value: still silent
    pet._sense_home(pet._now())
    pet._push_watchers()
    got = await pushed(client)
    assert fx_messages(got) == [] and values(got, key) == [False]


async def test_two_keys_blocked_at_once_both_deliver_their_held_reverses(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    """F6: one timer per key. With one shared timer the second block's arm would
    cancel the first's re-check, and rain's held reverse would wait for the next
    5-minute tick, outside the 90 s ring. (Held reverses that land in one pass
    are one onset, as for any pass; these two are apart.)"""
    hass.states.async_set("sensor.gauge", "0.0", {"unit_of_measurement": "mm/h"})
    pet = await house(hass, hass_storage, now, rain="sensor.gauge")
    client = await hass_ws_client(hass)
    await subscribe(client)
    hass.states.async_set("sensor.gauge", "1.5", {"unit_of_measurement": "mm/h"})
    await settle(hass, freezer, 11)  # rain starts, its block runs
    await settle(hass, freezer, 20)
    await flip(hass, freezer, "snowy", 11)  # snow starts, its block ends much later
    assert pet.device_fx._keys["rain"].timer and pet.device_fx._keys["snow"].timer
    hass.states.async_set("sensor.gauge", "0.0", {"unit_of_measurement": "mm/h"})
    await flip(hass, freezer, OFF, 11)  # both reverses are held
    got = await pushed(client)
    assert [e["kind"] for e in fx_messages(got)] == ["rain_started", "snow_started"]
    assert pet.device_fx.view()["current"]["rain"] is True
    assert pet.device_fx.view()["current"]["snow"] is True
    kinds = []
    for _ in range(20):  # up to 100 s: both blocks end, a pass for each
        await settle(hass, freezer, 5)
        kinds += [e["kind"] for e in fx_messages(await pushed(client))]
    assert kinds == ["rain_stopped", "snow_stopped"]
    assert pet.device_fx.view()["current"]["rain"] is False
    assert pet.device_fx.view()["current"]["snow"] is False


async def test_a_rain_sensor_alone_is_enough_to_know_rain_and_only_rain(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    hass.states.async_set("sensor.gauge", "0.0", {"unit_of_measurement": "mm/h"})
    pet = await house(hass, hass_storage, now, weather=None, rain="sensor.gauge")
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    # The gauge says nothing of snow, fog, storm or wind: they are missing, not off.
    assert snapshot["house"]["device_fx"]["current"] == {"rain": False}
    hass.states.async_set("sensor.gauge", "1.5", {"unit_of_measurement": "mm/h"})
    await settle(hass, freezer, 11)
    got = await pushed(client)
    assert values(got, "rain") == [True]
    assert [e["kind"] for e in fx_messages(got)] == ["rain_started"]
    assert pet.device_fx.view()["current"] == {"rain": True}


async def test_the_wind_speed_alone_makes_wind(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    hass.states.async_set("weather.home", OFF, {"wind_speed": 45.0})
    await settle(hass, freezer, 11)
    got = await pushed(client)
    assert values(got, "wind") == [True]
    assert [e["kind"] for e in fx_messages(got)] == ["wind_started"]


# -- one onset per pass (plan 6.2a, F7) ------------------------------------------------


async def test_a_storm_with_rain_sends_the_storm_and_not_the_rain(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "lightning-rainy")
    got = await pushed(client)
    # `current` still tells the truth for both; the echo shows one kind.
    assert pet.device_fx.view()["current"]["rain"] is True
    assert pet.device_fx.view()["current"]["storm"] is True
    assert [e["kind"] for e in fx_messages(got)] == ["storm_started"]
    assert [e["kind"] for e in pet.device_fx.recent(pet._now())] == ["storm_started"]
    assert [next(iter(e)) for e in got] == ["house", "fx"]


@pytest.mark.parametrize(
    ("before", "after", "kind"),
    [
        ("rainy", "snowy", "snow_started"),  # a start beats a stop
        ("lightning", "rainy", "rain_started"),  # even the storm's own stop
        ("lightning-rainy", "sunny", "storm_stopped"),  # both end: the storm
        ("lightning-rainy", "rainy", "storm_stopped"),
        ("rainy", "lightning-rainy", "storm_started"),
    ],
)
async def test_one_onset_per_pass_when_the_weather_changes_over(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    before: str,
    after: str,
    kind: str,
) -> None:
    pet = await house(hass, hass_storage, now, weather=before)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, after)
    got = await pushed(client)
    assert [e["kind"] for e in fx_messages(got)] == [kind]
    expected = Readings(night=False, condition=after)
    current = pet.device_fx.view()["current"]
    assert current == {k: s.read(expected) for k, s in DEVICE_SIGNAL_MAP.items()}


def test_any_other_tie_goes_to_the_lower_rank_then_the_map_order() -> None:
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    fx._arm = lambda key: None  # type: ignore[method-assign]
    calm = Readings(night=False, condition="sunny", wind_kmh=0.0)
    gusty = Readings(night=False, condition="snowy", wind_kmh=45.0)
    fx.observe(calm, 1000.0)
    fx.observe(gusty, 2000.0)  # snow and wind begin together: the map's order
    assert [e["kind"] for e in fx.recent(2000.0)] == ["snow_started"]
    assert fx.view()["current"]["wind"] is True  # still told
    # A lower rank number wins over the map's order.
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    fx._arm = lambda key: None  # type: ignore[method-assign]
    louder = replace(DEVICE_SIGNAL_MAP["wind"], echo_rank=1)
    with patch.dict(DEVICE_SIGNAL_MAP, {"wind": louder}):
        fx.observe(calm, 1000.0)
        fx.observe(gusty, 2000.0)
    assert [e["kind"] for e in fx.recent(2000.0)] == ["wind_started"]


def test_17_entries_in_one_pass_all_go_out_live_though_the_ring_keeps_16() -> None:
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    for _ in range(17):
        fx._keys["rain"].value = True
        fx._add("rain", 5000.0)
    assert len(fx.recent(5000.0)) == 16
    assert [e["id"] for e in fx.take_fresh(5000.0)] == [f"n-{i}" for i in range(1, 18)]
    assert fx.take_fresh(5000.0) == []  # once each
    fx._add("rain", 5000.0)
    assert fx.take_fresh(5000.0 + RING_SECONDS) == []  # too old to echo: not sent


def test_the_ring_is_bounded_and_ids_carry_a_nonce_and_a_sequence() -> None:
    fx = DeviceFx(None, lambda: None, nonce="abc")  # type: ignore[arg-type]
    fx._arm = lambda key: None  # type: ignore[method-assign]
    t = 1_000_000.0
    keys = ("rain",)
    fx.observe(Readings(night=False, condition="sunny"), t, keys)  # first: silent
    for i in range(1, 40):
        t += 1000  # past every block
        fx.observe(
            Readings(night=False, condition=ON["rain"] if i % 2 else OFF), t, keys
        )
        fx._keys["rain"].block_until = None
    recent = fx.recent(t)
    assert len(recent) == 1  # only the last 90 s
    assert recent[0]["id"] == "abc-39"
    ring = DeviceFx(None, lambda: None, nonce="abc")  # type: ignore[arg-type]
    ring._arm = lambda key: None  # type: ignore[method-assign]
    ring.observe(Readings(night=False, condition="sunny"), t, keys)
    for i in range(1, 40):  # all inside 90 s: the ring keeps 16
        ring._keys["rain"].block_until = None
        ring.observe(
            Readings(night=False, condition=ON["rain"] if i % 2 else OFF), t + i, keys
        )
    assert len(ring.recent(t + 40)) == 16
    assert [e["id"] for e in ring.recent(t + 40)][-1] == "abc-39"


# -- case 16: nothing is stored; a key is present only if mapped and known -----------


async def test_a_house_with_nothing_to_tell_the_weather_by_has_no_device_fx(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    now: float,
) -> None:
    pet = await house(
        hass, hass_storage, now, weather=None, mapped=False, tv=["media_player.tv"]
    )
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert "device_fx" not in snapshot["house"]
    assert "device_fx" not in pet._house_view()
    assert "device_fx_recent" not in snapshot


async def test_a_house_with_only_a_rain_gauge_can_only_ever_have_rain(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    hass.states.async_set("sensor.gauge", "0.0", {"unit_of_measurement": "mm/h"})
    pet = await house(
        hass, hass_storage, now, weather=None, mapped=False, rain="sensor.gauge"
    )
    assert pet._fx_keys() == ("rain",)
    # A condition appearing on an unmapped weather entity changes nothing.
    hass.states.async_set("weather.home", "snowy")
    await settle(hass, freezer, 11)
    assert pet._house_view()["device_fx"]["current"] == {"rain": False}


async def _week(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    monkeypatch: pytest.MonkeyPatch,
    bridge: bool,
) -> tuple[dict[str, Any], list[tuple[str, str]], object]:
    """A day of weather and ticks; the saved pet, the bus, and the next random."""
    if not bridge:  # stubbed out: nothing observed, nothing in the house view
        monkeypatch.setattr(DeviceFx, "observe", lambda *_: None)
        monkeypatch.setattr(PetCoordinator, "_fx_keys", lambda _: ())
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    pet = await house(hass, hass_storage, now)
    pet.rng.seed(7)
    for step in (*ON.values(), OFF, *ON.values(), "unavailable", OFF, "rainy"):
        hass.states.async_set("weather.home", step)
        await settle(hass, freezer, 11)
        await settle(hass, freezer, 300)
    for _ in range(12):
        await settle(hass, freezer, 3600)
    assert pet.state is not None
    events = [
        (e.event_type, json.dumps(e.data, sort_keys=True, default=str))
        for e in bus
        if e.event_type.startswith(f"{DOMAIN}_")
    ]
    return pet.state.to_dict(), events, pet.rng.random()


async def test_a_week_with_the_bridge_on_equals_the_week_without_it(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Case 16: equal state, equal bus events, and no draw from the pet's rng,
    through every key of the map."""
    on = await _week(hass, hass_storage, freezer, now, monkeypatch, True)
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.config_entries.async_remove(entry.entry_id)
    hass.states.async_remove("weather.home")
    freezer.move_to("2026-10-26 14:00:00+00:00")
    hass_storage.clear()
    with monkeypatch.context() as m:
        off = await _week(hass, hass_storage, freezer, now, m, False)
    assert on[0] == off[0] and on[1] == off[1] and on[2] == off[2]


async def test_nothing_of_it_is_saved_or_on_a_sensor_or_the_bus(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    pet = await house(hass, hass_storage, now)
    for key in KEYS:  # every key leaves an entry to leak
        await flip(hass, freezer, ON[key])
        await settle(hass, freezer, BLOCK + 10)
    assert pet.device_fx.recent(pet._now())
    # (The kind's own name is no mark: the existing house moment says it.)
    marks = ("device_fx", pet.device_fx.nonce, "occurred_at", "expires_at")
    saved = json.dumps(pet.state.to_dict(), default=str)
    debug = json.dumps(pet.debug, default=str)
    on_bus = json.dumps([(e.event_type, e.data) for e in bus], default=str)
    states = json.dumps(
        [(s.entity_id, s.state, dict(s.attributes)) for s in hass.states.async_all()],
        default=str,
    )
    for text in (saved, debug, on_bus, states):
        for mark in marks:
            assert mark not in text, mark
