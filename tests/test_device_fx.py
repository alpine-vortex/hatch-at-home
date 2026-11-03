"""The device-alive signal bridge, server half (slices 3A, 4A and 4C, plan section 6).

Every test of a key's behaviour runs once per key of DEVICE_SIGNAL_MAP (the weather:
rain, snow, fog, storm, wind; the room: lights, heating, cooling, fireplace, tv,
music): a new row of the map is tested by being in the map. Each key is turned on
and off through its rig (tests/test_channel.py), and what a change sends follows
the row: heating and cooling are ambient only (a house diff, no kind, no ring).

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

from .test_channel import (
    RIGS,
    WEATHER_ON as ON,
    fx_house,
    kind_of,
    pushed,
    subscribe,
    wire,
)
from .test_doorbell import bell, ring
from .test_init import STORE_KEY, hatched_pet, settle, setup_with_house

BLOCK = int(BLOCK_SECONDS)
KEYS = list(DEVICE_SIGNAL_MAP)
WEATHER_KEYS = list(ON)
FX_KEYS = [k for k in KEYS if DEVICE_SIGNAL_MAP[k].kinds]  # with an onset and an echo
AMBIENT_KEYS = [k for k in KEYS if not DEVICE_SIGNAL_MAP[k].kinds]  # a tint only

OFF = "sunny"
per_key = pytest.mark.parametrize("key", KEYS)
fx_key = pytest.mark.parametrize("key", FX_KEYS)
ambient_key = pytest.mark.parametrize("key", AMBIENT_KEYS)


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
    assert set(RIGS) == set(DEVICE_SIGNAL_MAP)


def test_the_kinds_are_derived_from_the_map() -> None:
    assert KINDS == tuple(
        kind for spec in DEVICE_SIGNAL_MAP.values() for kind in spec.kinds
    )
    assert device_fx.SCOPE == "house"
    for key in WEATHER_KEYS:
        spec = DEVICE_SIGNAL_MAP[key]
        assert spec.type == "bool" and spec.kinds == (
            f"{key}_started",
            f"{key}_stopped",
        )
        assert spec.block_s == 45  # one number to tune (FM8)
        assert (spec.echo, spec.echo_ttl_s, spec.echo_rank) == (True, RING_SECONDS, 2)
    # Every row with an echo has kinds; a row with none is ambient only (F9).
    for key, spec in DEVICE_SIGNAL_MAP.items():
        assert not spec.echo or spec.kinds, key
        assert not spec.kinds or len(spec.kinds) == 2, key
        assert bool(spec.kinds) == (key in FX_KEYS)


def test_the_room_rows_are_the_per_key_table_of_section_6_5() -> None:
    """block_s, echo, ttl and onset rank of each activity key, as the plan's table
    says them (lights/fireplace rank 3, tv/music 4, heating/cooling none)."""
    table = {
        # key: (type, kinds, block_s, echo, echo_ttl_s, echo_rank)
        "lights": (
            ("off", "on"),
            ("lights_on", "lights_off"),
            45,
            True,
            RING_SECONDS,
            3,
        ),
        "heating": ("bool", (), 120, False, None, None),
        "cooling": ("bool", (), 120, False, None, None),
        "fireplace": (
            "bool",
            ("fireplace_started", "fireplace_stopped"),
            45,
            True,
            RING_SECONDS,
            3,
        ),
        "tv": ("bool", ("tv_started", "tv_stopped"), 45, True, RING_SECONDS, 4),
        "music": (
            "bool",
            ("music_started", "music_stopped"),
            60,
            True,
            RING_SECONDS,
            4,
        ),
    }
    for key, row in table.items():
        spec = DEVICE_SIGNAL_MAP[key]
        assert (
            spec.type,
            spec.kinds,
            spec.block_s,
            spec.echo,
            spec.echo_ttl_s,
            spec.echo_rank,
        ) == row, key
    assert device_fx.LIGHTS_ON_LEVEL == 0.0
    assert {k: DEVICE_SIGNAL_MAP[k].sources for k in table} == {
        "lights": ("room_lights",),
        "heating": ("heating",),
        "cooling": ("cooling",),
        "fireplace": ("fireplace",),
        "tv": ("tv",),
        "music": ("music",),
    }
    # No key for what is client-only (FM10, FM11, FM15), whatever it is called.
    for name in ("doorbell", "appliance", "vacuum", "robot", "moon", "arrival"):
        assert not [k for k in KEYS if name in k], name
        assert not [kind for kind in KINDS if name in kind], name


def test_the_lights_reading_is_off_or_on_at_any_brightness_and_missing_with_no_light() -> (
    None
):
    read = DEVICE_SIGNAL_MAP["lights"].read
    assert read(Readings(night=False)) is None  # no light mapped, or none answers
    assert read(Readings(night=False, room_light_level=0.0)) == "off"
    assert read(Readings(night=False, room_light_level=0.004)) == "on"  # 1%: still on
    assert read(Readings(night=False, room_light_level=1.0)) == "on"


@pytest.mark.parametrize("key", ["fireplace", "tv", "music", "heating", "cooling"])
def test_a_plain_bool_reading_reads_its_field(key: str) -> None:
    field = {"heating": "heating_on", "cooling": "cooling_on"}.get(key, key)
    read = DEVICE_SIGNAL_MAP[key].read
    assert read(Readings(night=False)) is False
    assert read(Readings(night=False, **{field: True})) is True
    assert DEVICE_SIGNAL_MAP[key].known == key  # its guard is Watcher.known(key)


def test_a_condition_turns_on_its_key_and_only_its_key() -> None:
    for key, state in ON.items():
        readings = Readings(night=False, condition=state)
        got = {k: DEVICE_SIGNAL_MAP[k].read(readings) for k in WEATHER_KEYS}
        assert got == {k: k == key for k in WEATHER_KEYS}, state
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
    fx._keys["lights"].value = "on"  # a member of the lights enum passes...
    fx._keys["fireplace"].value = "on"  # ...but not a bool row's string
    fx._keys["tv"].value = "dim"
    assert fx.view() == {"version": 1, "current": {"fog": False, "lights": "on"}}
    lights = DEVICE_SIGNAL_MAP["lights"]
    for bad in ("dim", "ON", True, False, 1, None, "Zebulon"):
        assert lights.clean(bad) is None, bad


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
    assert mapped_keys({"weather": "weather.home"}) == tuple(WEATHER_KEYS)
    assert mapped_keys({"rain": "sensor.gauge"}) == ("rain",)
    for key, rig in RIGS.items():  # each rig's options tell that key
        assert key in mapped_keys(rig.options)
    assert mapped_keys({"tv": ["media_player.tv"]}) == ("tv",)
    assert mapped_keys({"fireplace": "switch.hearth"}) == ("fireplace",)
    assert mapped_keys({"room_lights": ["light.a"], "heating": []}) == ("lights",)


async def turn(
    hass: HomeAssistant,
    freezer: FrozenDateTimeFactory,
    key: str,
    state: str,
    wait: float = 11,
) -> None:
    """Turn the key's entity "on", "off", or to any other state (an outage); the
    home debouncer (10 s) runs the pass."""
    rig = RIGS[key]
    rig.put(hass, {"on": rig.on, "off": rig.off}.get(state, state))
    await settle(hass, freezer, wait)


def block_of(key: str) -> int:
    return int(DEVICE_SIGNAL_MAP[key].block_s)


def kinds(messages: list[dict[str, Any]]) -> list[str]:
    return [e["kind"] for e in fx_messages(messages)]


def current(pet: PetCoordinator, key: str) -> bool | str:
    return pet.device_fx.view()["current"][key]


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
    await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    # Every key this house tells is known and off.
    assert snapshot["house"]["device_fx"] == {
        "version": 1,
        "current": {k: wire(k, False) for k in RIGS[key].group},
    }
    assert snapshot["device_fx_recent"] == []
    await turn(hass, freezer, key, "on")
    got = await pushed(client)
    assert values(got, key) == [wire(key, True)]
    # The M1 order: the new ambience first, the onset second (an ambient-only key
    # has the house diff and nothing after it).
    order = [next(iter(e)) for e in got if "house" in e or "fx" in e]
    assert order == ["house", *(["fx"] if kind_of(key, True) else [])]
    assert kinds(got) == kind_of(key, True)
    assert not [e for e in got if "moment" in e and "fx" in json.dumps(e["moment"])]
    for entry in fx_messages(got):
        assert entry["scope"] == "house"
        assert set(entry) == {"id", "kind", "occurred_at", "expires_at", "scope"}
        # The entry is on no moment: the existing speech path is not used (case 1).
        assert entry["id"] not in json.dumps([e for e in got if "moment" in e])
        # occurred_at is the accepting pass, expires_at 90 s on (B1).
        at = dt_util.parse_datetime(entry["occurred_at"])
        assert at is not None and abs((at - dt_util.utcnow()).total_seconds()) < 1
        end = dt_util.parse_datetime(entry["expires_at"])
        assert end is not None and (end - at).total_seconds() == RING_SECONDS


@fx_key
async def test_a_card_opened_20_seconds_later_finds_the_transition_then_none_at_90(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    await fx_house(hass, hass_storage, now, key)
    watching = await hass_ws_client(hass)
    await subscribe(watching)
    await turn(hass, freezer, key, "on")
    (live,) = fx_messages(await pushed(watching))
    await settle(hass, freezer, 20)
    late = await subscribe(await hass_ws_client(hass))  # case 2
    assert late["house"]["device_fx"]["current"][key] == wire(key, True)
    # Case 7: the same event, once in the snapshot ring and once live, one id.
    assert [e["id"] for e in late["device_fx_recent"]] == [live["id"]]
    assert late["device_fx_recent"] == [live]
    await settle(hass, freezer, 70)  # 90 s after the pass
    later = await subscribe(await hass_ws_client(hass))  # case 3
    assert later["device_fx_recent"] == []
    assert later["house"]["device_fx"]["current"][key] == wire(key, True)  # stays


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
    plan says (case 7); the card keeps one by id. An ambient-only key has none."""
    pet = await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    pet._sent.clear()  # this watcher is new to the next push: it gets a snapshot
    await turn(hass, freezer, key, "on")
    got = await pushed(client)
    (snap,) = [e for e in got if "device_fx_recent" in e]
    assert [e["id"] for e in snap["device_fx_recent"]] == [
        e["id"] for e in fx_messages(got)
    ]
    assert len(snap["device_fx_recent"]) == len(kind_of(key, True))


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
    pet = await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, key, "on")
    await pushed(client)
    await settle(hass, freezer, 100)  # the ring empties on its own
    pet._push_watchers()
    pet._push_watchers()
    assert await pushed(client) == []


# -- heating and cooling: a tint, and nothing else -------------------------------------


@ambient_key
async def test_an_ambient_only_key_is_a_bool_in_current_and_no_kind_no_ring_no_fx(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """F9: their wash is the `house_answered` moment, client-side; the server's side
    is `current.heating`/`cooling` and a house diff, never a second edge."""
    pet = await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    spec = DEVICE_SIGNAL_MAP[key]
    assert spec.kinds == () and not spec.echo
    assert [k for k in KINDS if k.startswith(key)] == []
    await turn(hass, freezer, key, "on")
    got = await pushed(client)
    assert [next(iter(e)) for e in got] == ["house"]  # only a house diff
    assert got[0]["house"]["device_fx"]["current"] == {key: True}
    assert type(got[0]["house"]["device_fx"]["current"][key]) is bool
    assert pet.device_fx.recent(pet._now()) == []
    assert pet.device_fx.take_fresh(pet._now()) == []
    await settle(hass, freezer, block_of(key) + 10)  # the block over, then the reverse
    await pushed(client)
    await turn(hass, freezer, key, "off")
    got = await pushed(client)
    assert [next(iter(e)) for e in got] == ["house"]
    assert got[0]["house"]["device_fx"]["current"] == {key: False}
    assert pet.device_fx.recent(pet._now()) == []
    late = await subscribe(await hass_ws_client(hass))
    assert late["device_fx_recent"] == []


@ambient_key
async def test_an_ambient_only_key_is_never_on_a_moment_or_the_bus_and_makes_no_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """`observe` picks onsets only from rows with kinds: the block is armed and
    `current` updated, `_add` is never reached (it must not index an empty kinds)."""
    pet = await fx_house(hass, hass_storage, now, key)
    with patch.object(DeviceFx, "_add") as add:
        await turn(hass, freezer, key, "on")
        assert pet.device_fx._keys[key].timer is not None  # a block is running
        assert current(pet, key) is True
    add.assert_not_called()


# -- case 5: a restart in the state --------------------------------------------------


@per_key
async def test_a_restart_in_the_state_has_it_and_no_fake_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await fx_house(hass, hass_storage, now, key, on=True)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"]["current"][key] == wire(key, True)
    assert snapshot["device_fx_recent"] == []
    await settle(hass, freezer, 11)
    assert fx_messages(await pushed(client)) == []
    # The reload variant: a card open across it is sent a fresh snapshot, and an
    # empty ring, and no live message.
    pet.async_start_channel()
    got = await pushed(client)
    (fresh,) = [e for e in got if "device_fx_recent" in e]
    assert fresh["house"]["device_fx"]["current"][key] == wire(key, True)
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
    pet = await fx_house(hass, hass_storage, now, key, on=True)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, key, "unavailable")  # inside the 10 min hold: still on
    assert current(pet, key) == wire(key, True)
    await settle(hass, freezer, 240)
    await turn(hass, freezer, key, "off")  # back, and changed: a true later change
    got = await pushed(client)
    assert values(got, key) == [wire(key, False)]
    assert kinds(got) == kind_of(key, False)


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
    pet = await fx_house(hass, hass_storage, now, key, on=True)
    client = await hass_ws_client(hass)
    await subscribe(client)
    RIGS[key].put(hass, "unavailable")
    got = []
    for _ in range(3):  # 15 min of ticks: past the hold, then unknown
        await settle(hass, freezer, 300)
        got += await pushed(client)
    assert fx_messages(got) == [] and values(got, key) == []  # unknown sends nothing
    assert current(pet, key) == wire(key, True)  # the last accepted: not "off"
    await turn(hass, freezer, key, "on" if back == "same" else "off")
    got = await pushed(client)  # the first known reading after unknown
    assert fx_messages(got) == []  # no onset out of unknown
    assert pet.device_fx.recent(pet._now()) == []
    assert current(pet, key) == wire(key, back == "same")  # truth
    # ...and a true later change after that is an onset again (none for a tint).
    await settle(hass, freezer, block_of(key))
    await turn(hass, freezer, key, "off" if back == "same" else "on")
    assert len(fx_messages(await pushed(client))) == len(kind_of(key, True))


@per_key
async def test_a_key_that_was_never_known_is_missing_not_off(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await fx_house(hass, hass_storage, now, key, on=None)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"] == {"version": 1, "current": {}}
    assert pet.device_fx.recent(pet._now()) == []
    await turn(hass, freezer, key, "on")  # the first known reading: silent
    got = await pushed(client)
    assert values(got, key) == [wire(key, True)] and fx_messages(got) == []
    assert pet.device_fx.recent(pet._now()) == []


@pytest.mark.parametrize("key", ["fireplace", "tv", "music", "heating", "cooling"])
async def test_an_outage_is_unknown_not_off_for_a_plain_bool_reading(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """The bug B3 fixed for rain: `any([])` is False, so without `Watcher.known` an
    11 minute outage would read as "ended" and the recovery as "started"."""
    pet = await fx_house(hass, hass_storage, now, key, on=True)
    client = await hass_ws_client(hass)
    await subscribe(client)
    assert pet.watcher.known(key, pet._now())
    RIGS[key].put(hass, "unavailable")
    got = []
    for _ in range(3):  # 15 minutes of ticks
        await settle(hass, freezer, 300)
        got += await pushed(client)
    assert not pet.watcher.known(key, pet._now())  # past the hold: nothing answers
    assert current(pet, key) is True  # not off
    assert fx_messages(got) == [] and values(got, key) == []
    RIGS[key].put(hass, RIGS[key].on)  # and the recovery is not a start either
    await settle(hass, freezer, 11)
    assert fx_messages(await pushed(client)) == []
    assert current(pet, key) is True


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
    pet = await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, key, "on")  # the leading edge, at once (0-10 s)
    assert kinds(await pushed(client)) == kind_of(key, True)
    await turn(hass, freezer, key, "off")  # a reverse inside the block: held
    await turn(hass, freezer, key, "on")  # and back: the flap undid itself
    await settle(hass, freezer, block_of(key))  # the timer fires, one more pass looks
    assert await pushed(client) == []
    assert current(pet, key) == wire(key, True)


@per_key
async def test_a_flap_that_settles_on_the_reverse_is_one_onset_after_the_block(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, key, "on")
    await pushed(client)
    start = dt_util.utcnow()
    block = block_of(key)
    await turn(hass, freezer, key, "off")  # held: the glass stays as it was
    assert await pushed(client) == []
    assert current(pet, key) == wire(key, True)
    # N + 0 to 10 s after the first accepted change, then one onset.
    got: list[dict[str, Any]] = []
    while current(pet, key) == wire(key, True):
        await settle(hass, freezer, 5)
        got += await pushed(client)  # (a connection nobody reads goes stale)
        assert (dt_util.utcnow() - start).total_seconds() <= block + 10 + 5
    held = (dt_util.utcnow() - start).total_seconds()
    assert block <= held <= block + 10 + 5
    assert values(got, key) == [wire(key, False)]
    assert kinds(got) == kind_of(key, False)
    # started, then stopped (a tint has no ring entry)
    assert len(pet.device_fx.recent(pet._now())) == 2 * len(kind_of(key, True))


@per_key
async def test_a_reverse_after_the_block_is_accepted_like_any_first_change(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, key, "on")
    await settle(hass, freezer, block_of(key) + 10)  # the block is over, no timer
    await pushed(client)
    await turn(hass, freezer, key, "off")  # 0-10 s, not another block
    got = await pushed(client)
    assert kinds(got) == kind_of(key, False)
    assert values(got, key) == [wire(key, False)]


@per_key
async def test_unload_cancels_the_block_timer(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    pet = await fx_house(hass, hass_storage, now, key)
    await turn(hass, freezer, key, "on")
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
    pet = await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, key, "on")
    state = pet.device_fx._keys[key]
    assert state.timer is not None
    # Unknown arrives (the entity is gone, past the hold): the block is dropped.
    hass.states.async_remove(RIGS[key].entity)
    pet.watcher._good.clear()
    pet._sense_home(pet._now())
    assert state.timer is None and state.block_until is None
    assert current(pet, key) == wire(key, True)  # the last accepted
    await pushed(client)
    RIGS[key].put(hass, RIGS[key].off)  # a changed value: still silent
    pet._sense_home(pet._now())
    pet._push_watchers()
    got = await pushed(client)
    assert fx_messages(got) == [] and values(got, key) == [wire(key, False)]


# -- the activity keys, one by one -----------------------------------------------------


async def test_lights_are_off_or_on_and_dimming_to_one_percent_stays_on(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await fx_house(hass, hass_storage, now, "lights")
    client = await hass_ws_client(hass)
    await subscribe(client)
    hass.states.async_set("light.lamp", "on", {"brightness": 255})
    await settle(hass, freezer, 11)
    got = await pushed(client)
    assert values(got, "lights") == ["on"] and kinds(got) == ["lights_on"]
    # 100% down to 1%: still on, so no diff and no onset (and no `dim` member).
    for brightness in (128, 25, 3):
        hass.states.async_set("light.lamp", "on", {"brightness": brightness})
        await settle(hass, freezer, 11)
        assert await pushed(client) == []
    assert current(pet, "lights") == "on"
    assert set(DEVICE_SIGNAL_MAP["lights"].type) == {"off", "on"}
    # A light with no brightness at all (an on/off lamp) is on too.
    hass.states.async_set("light.lamp", "on")
    await settle(hass, freezer, 11)
    assert await pushed(client) == []
    await settle(hass, freezer, 60)
    hass.states.async_set("light.lamp", "off")
    await settle(hass, freezer, 11)
    got = await pushed(client)
    assert values(got, "lights") == ["off"] and kinds(got) == ["lights_off"]


async def test_lights_one_flip_inside_45_seconds_is_one_diff_and_one_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    """A fade that crosses 0 and back inside the block sends one diff and at most
    one onset (the second, held, finds the reading unchanged)."""
    pet = await fx_house(hass, hass_storage, now, "lights")
    client = await hass_ws_client(hass)
    await subscribe(client)
    hass.states.async_set("light.lamp", "on", {"brightness": 200})
    await settle(hass, freezer, 11)
    hass.states.async_set("light.lamp", "off")  # crosses 0 ...
    await settle(hass, freezer, 11)
    hass.states.async_set("light.lamp", "on", {"brightness": 100})  # ... and back
    await settle(hass, freezer, 11)
    await settle(hass, freezer, 60)
    got = await pushed(client)
    assert [
        e["house"]["device_fx"]["current"]["lights"] for e in got if "house" in e
    ] == ["on"]
    assert kinds(got) == ["lights_on"]
    assert current(pet, "lights") == "on"


async def test_lights_unavailable_11_minutes_then_back_is_no_diff_and_no_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await fx_house(hass, hass_storage, now, "lights", on=True)
    client = await hass_ws_client(hass)
    await subscribe(client)
    hass.states.async_set("light.lamp", "unavailable")
    got = []
    for _ in range(3):  # 15 minutes of ticks
        await settle(hass, freezer, 300)
        got += await pushed(client)
    assert got == []
    hass.states.async_set("light.lamp", "on")
    await settle(hass, freezer, 11)
    assert await pushed(client) == []  # same value, silent, no diff
    assert pet.device_fx.recent(pet._now()) == []


async def test_lights_echo_stays_in_the_ring_for_90_seconds(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await fx_house(hass, hass_storage, now, "lights")
    RIGS["lights"].put(hass, "on")
    await settle(hass, freezer, 11)
    (entry,) = pet.device_fx.recent(pet._now())
    assert entry["kind"] == "lights_on"
    await settle(hass, freezer, 60)
    assert pet.device_fx.recent(pet._now()) == [entry]  # still echoable
    await settle(hass, freezer, 30)
    assert pet.device_fx.recent(pet._now()) == []


async def test_music_pause_30_seconds_then_play_sends_nothing(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await fx_house(hass, hass_storage, now, "music")
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, "music", "on")
    assert kinds(await pushed(client)) == ["music_started"]
    hass.states.async_set("media_player.speaker", "paused")  # a track gap
    await settle(hass, freezer, 20)
    hass.states.async_set("media_player.speaker", "playing")
    await settle(hass, freezer, 70)  # the 60 s block ends, one more pass looks
    assert await pushed(client) == []
    assert current(pet, "music") is True


async def test_music_pause_90_seconds_then_play_sends_one_music_started(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await fx_house(hass, hass_storage, now, "music")
    client = await hass_ws_client(hass)
    await subscribe(client)
    await turn(hass, freezer, "music", "on")
    await pushed(client)
    hass.states.async_set("media_player.speaker", "paused")
    got: list[dict[str, Any]] = []
    for _ in range(18):  # 90 s: past the 60 s block, the stop is accepted
        await settle(hass, freezer, 5)
        got += await pushed(client)
    assert kinds(got) == ["music_stopped"] and current(pet, "music") is False
    hass.states.async_set("media_player.speaker", "playing")
    got = []
    for _ in range(16):  # the stop's own block holds the start up to 60 s more
        await settle(hass, freezer, 5)
        got += await pushed(client)
    assert kinds(got) == ["music_started"]
    assert current(pet, "music") is True


async def test_music_counts_playing_only_not_video_or_idle(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await fx_house(hass, hass_storage, now, "music")
    for state in ("idle", "buffering", "paused", "on"):
        hass.states.async_set("media_player.speaker", state)
        pet._sense_home(pet._now())
        assert current(pet, "music") is False, state
    hass.states.async_set(
        "media_player.speaker", "playing", {"media_content_type": "movie"}
    )
    pet._sense_home(pet._now())
    assert current(pet, "music") is False  # a video is the TV's
    hass.states.async_set(
        "media_player.speaker", "playing", {"media_content_type": "music"}
    )
    pet._sense_home(pet._now())
    assert current(pet, "music") is True


@fx_key
async def test_the_ring_and_the_snapshot_carry_no_title_no_name_no_count(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """6.2a rule 2: nothing but the kind, the times, the id and the scope."""
    rig = RIGS[key]
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set(rig.entity, rig.off)
    await setup_with_house(hass, **rig.options)
    hass.states.async_set(
        rig.entity,
        rig.on,
        {
            **rig.on_attrs,
            "media_title": "Zebulon",
            "media_artist": "Zeb",
            "friendly_name": "Zebulon's",
            "brightness": 77,
        },
    )
    await settle(hass, freezer, 11)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    text = json.dumps(snapshot["device_fx_recent"]) + json.dumps(
        snapshot["house"]["device_fx"]
    )
    for leak in ("Zeb", "brightness", rig.entity, "media_"):
        assert leak not in text, leak


# -- two keys blocked at once, one of them ambient only ----------------------------


async def test_two_keys_blocked_at_once_one_of_them_heating_both_deliver_reverses(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    """F6 again, with an ambient-only key in the pair: the fireplace's held reverse
    is delivered as `fireplace_stopped` at about 45 s, long before heating's 120 s
    block ends, and the heating tint then flips with a house diff and no `fx`. With
    one shared timer the second arm would have cancelled the first re-check."""
    heating, fireplace = RIGS["heating"], RIGS["fireplace"]
    hass_storage[STORE_KEY] = hatched_pet(now)
    heating.put(hass, heating.off)
    fireplace.put(hass, fireplace.off)
    await setup_with_house(hass, **(heating.options | fireplace.options))
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"]["current"] == {
        "heating": False,
        "fireplace": False,
    }
    await turn(hass, freezer, "heating", "on")  # accepted: its 120 s block runs
    await settle(hass, freezer, 20)
    await turn(hass, freezer, "fireplace", "on")  # accepted: its 45 s block runs
    assert (
        pet.device_fx._keys["heating"].timer and pet.device_fx._keys["fireplace"].timer
    )
    heating.put(hass, heating.off)
    await turn(hass, freezer, "fireplace", "off")  # both reverses are held
    got = await pushed(client)
    assert kinds(got) == ["fireplace_started"]
    assert current(pet, "heating") is True and current(pet, "fireplace") is True
    delivered: list[str] = []
    seen: list[bool] = []
    for _ in range(30):  # up to 150 s: both blocks end, a pass for each
        await settle(hass, freezer, 5)
        got = await pushed(client)
        delivered += kinds(got)
        seen += values(got, "heating")
    assert delivered == ["fireplace_stopped"]  # heating never sends a kind
    # (every house message carries the whole `current`; the tint flipped once)
    assert seen[-1] is False and seen.count(False) >= 1 and seen.index(False) > 0
    assert current(pet, "heating") is False and current(pet, "fireplace") is False


# -- one onset per pass, by rank (6.5) -----------------------------------------------


async def test_a_fireplace_and_a_tv_in_one_pass_send_the_fireplace(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    """Rank 3 (fireplace, lights) beats rank 4 (tv, music); `current` tells both."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    for key in ("fireplace", "tv"):
        RIGS[key].put(hass, RIGS[key].off)
    await setup_with_house(hass, **(RIGS["fireplace"].options | RIGS["tv"].options))
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    client = await hass_ws_client(hass)
    await subscribe(client)
    for key in ("tv", "fireplace"):  # (the TV is first in time and in the pass)
        RIGS[key].put(hass, RIGS[key].on)
    await settle(hass, freezer, 11)
    got = await pushed(client)
    assert kinds(got) == ["fireplace_started"]
    assert current(pet, "tv") is True and current(pet, "fireplace") is True
    assert [e["kind"] for e in pet.device_fx.recent(pet._now())] == [
        "fireplace_started"
    ]


def test_the_onset_rank_decides_a_tie_of_the_room_keys() -> None:
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    fx._arm = lambda key: None  # type: ignore[method-assign]
    keys = ("lights", "heating", "fireplace", "tv", "music")
    quiet = Readings(night=False, room_light_level=0.0)
    fx.observe(quiet, 1000.0, keys)  # the first known reading: silent
    loud = Readings(
        night=False,
        room_light_level=0.5,
        heating_on=True,
        fireplace=True,
        tv=True,
        music=True,
    )
    fx.observe(loud, 2000.0, keys)
    # lights and the fireplace share rank 3: the map's order, lights first; the
    # tint has no onset to lose to anyone.
    assert [e["kind"] for e in fx.recent(2000.0)] == ["lights_on"]
    assert fx.view()["current"] == {
        "lights": "on",
        "heating": True,
        "fireplace": True,
        "tv": True,
        "music": True,
    }
    # Without the lights: the fireplace (3) beats the TV and the music (4).
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    fx._arm = lambda key: None  # type: ignore[method-assign]
    rest = ("heating", "fireplace", "tv", "music")
    fx.observe(quiet, 1000.0, rest)
    fx.observe(loud, 2000.0, rest)
    assert [e["kind"] for e in fx.recent(2000.0)] == ["fireplace_started"]
    # A start beats a stop: the TV going off as the music starts shows the music.
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    fx._arm = lambda key: None  # type: ignore[method-assign]
    fx.observe(Readings(night=False, tv=True), 1000.0, ("tv", "music"))
    fx.observe(Readings(night=False, music=True), 2000.0, ("tv", "music"))
    assert [e["kind"] for e in fx.recent(2000.0)] == ["music_started"]


def test_known_guards_a_plain_bool_reading_in_the_module() -> None:
    """`observe` asks the guard: a reading with nothing answering is unknown (a
    held value, no onset), not off."""
    fx = DeviceFx(None, lambda: None, nonce="n")  # type: ignore[arg-type]
    fx._arm = lambda key: None  # type: ignore[method-assign]
    answering = {"tv": True}
    on = Readings(night=False, tv=True)
    off = Readings(night=False, tv=False)
    fx.observe(on, 1000.0, ("tv",), lambda key: answering[key])
    assert fx.view()["current"] == {"tv": True}
    answering["tv"] = False  # nothing answers: the reading's False is no news
    fx.observe(off, 2000.0, ("tv",), lambda key: answering[key])
    assert fx.view()["current"] == {"tv": True} and fx.recent(2000.0) == []
    answering["tv"] = True  # back, changed: the first known reading is silent
    fx.observe(off, 3000.0, ("tv",), lambda key: answering[key])
    assert fx.view()["current"] == {"tv": False} and fx.recent(3000.0) == []


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
    assert current == {k: DEVICE_SIGNAL_MAP[k].read(expected) for k in WEATHER_KEYS}


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
        hass, hass_storage, now, weather=None, mapped=False, aqi="sensor.aqi"
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


@per_key
async def test_a_house_with_only_one_key_mapped_has_only_what_that_key_tells(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """Case 16: a house with only a fireplace has only `fireplace`, and so on; the
    other rigs' entities, present in HA but not mapped, change nothing."""
    pet = await fx_house(hass, hass_storage, now, key)
    for other, rig in RIGS.items():  # every other entity is there, and flips
        if other not in RIGS[key].group:
            rig.put(hass, rig.on)
    await settle(hass, freezer, 11)
    assert pet._fx_keys() == tuple(RIGS[key].group)
    assert set(pet._house_view()["device_fx"]["current"]) == set(RIGS[key].group)
    await turn(hass, freezer, key, "on")
    assert set(pet._house_view()["device_fx"]["current"]) == set(RIGS[key].group)


@per_key
async def test_an_unmapped_source_makes_no_device_fx_at_all(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    key: str,
) -> None:
    """Case 16: no source, no `device_fx` (the entity exists, nothing maps it)."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    rig = RIGS[key]
    rig.put(hass, rig.off)
    await setup_with_house(hass, aqi="sensor.aqi")
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    rig.put(hass, rig.on)
    await settle(hass, freezer, 11)
    assert "device_fx" not in snapshot["house"] and "device_fx_recent" not in snapshot
    assert "device_fx" not in pet._house_view()
    assert fx_messages(await pushed(client)) == []


async def test_a_doorbell_press_makes_no_fx_no_ring_entry_and_no_push(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    """The doorbell is a house moment, client-side only (FM10): the press goes out
    as `doorbell_live` and touches nothing of the bridge."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    bell(hass)
    rig = RIGS["fireplace"]
    rig.put(hass, rig.off)
    await setup_with_house(hass, **rig.options)  # a bridge that could send
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    client = await hass_ws_client(hass)
    await subscribe(client)
    assert pet._fx_mapped()
    with (
        patch.object(PetCoordinator, "_push_watchers") as push,
        patch.object(DeviceFx, "observe") as observe,
    ):
        ring(hass)
        await hass.async_block_till_done()
        push.assert_not_called()
        observe.assert_not_called()
    got = await pushed(client)
    assert [e["moment"]["type"] for e in got if "moment" in e] == ["doorbell_live"]
    assert fx_messages(got) == []
    assert pet.device_fx.recent(pet._now()) == [] and pet.device_fx._seq == 0
    assert not [k for k in KEYS if "doorbell" in k]


async def _week(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    monkeypatch: pytest.MonkeyPatch,
    bridge: bool,
    key: str = "rain",
) -> tuple[dict[str, Any], list[tuple[str, str]], object]:
    """A day of changes to one key and ticks; the saved pet, the bus, and the next
    random. A weather key gets the whole sky; the others, their own on and off."""
    if not bridge:  # stubbed out: nothing observed, nothing in the house view
        monkeypatch.setattr(DeviceFx, "observe", lambda *_: None)
        monkeypatch.setattr(PetCoordinator, "_fx_keys", lambda _: ())
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    rig = RIGS[key]
    pet = await fx_house(hass, hass_storage, now, key)
    pet.rng.seed(7)
    if key in ON:
        steps = (*ON.values(), OFF, *ON.values(), "unavailable", OFF, "rainy")
    else:
        steps = (rig.on, rig.off, rig.on, "unavailable", rig.off, rig.on)
    for step in steps:
        rig.put(hass, step)
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


@per_key
async def test_a_week_with_the_bridge_on_equals_the_week_without_it(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    monkeypatch: pytest.MonkeyPatch,
    key: str,
) -> None:
    """Case 16, per key: equal state, equal bus events, and no draw from the pet's
    rng, through every key of the map."""
    on = await _week(hass, hass_storage, freezer, now, monkeypatch, True, key)
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.config_entries.async_remove(entry.entry_id)
    hass.states.async_remove(RIGS[key].entity)
    freezer.move_to("2026-10-26 14:00:00+00:00")
    hass_storage.clear()
    with monkeypatch.context() as m:
        off = await _week(hass, hass_storage, freezer, now, m, False, key)
    assert on[0] == off[0] and on[1] == off[1] and on[2] == off[2]


async def test_nothing_of_it_is_saved_or_on_a_sensor_or_the_bus(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    options: dict[str, Any] = {}
    hass_storage[STORE_KEY] = hatched_pet(now)
    for rig in RIGS.values():  # a house that can tell every key of the map
        rig.put(hass, rig.off)
        options |= rig.options
    await setup_with_house(hass, **options)
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    for key in KEYS:  # every key leaves an entry to leak
        await turn(hass, freezer, key, "on")
        assert bool(pet.device_fx.recent(pet._now())) == bool(kind_of(key, True))
        await settle(hass, freezer, 130)  # (past the longest block, heating's)
    assert pet.device_fx._seq == len(FX_KEYS)
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
