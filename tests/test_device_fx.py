"""The device-alive signal bridge, server half (slice 3A, plan section 6): rain.

`current` rides in the house view, `recent` beside the house on the snapshot, and
each transition goes out once as `{"fx": entry}` after the house change it belongs
to. Everything is in memory: nothing here may reach a save, the bus or a sensor.
"""

from __future__ import annotations

import json
from typing import Any

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
    KINDS,
    RAIN_BLOCK_SECONDS,
    RING_SECONDS,
    DeviceFx,
    rain_reading,
)
from custom_components.virtual_pet.home import Readings

from .test_channel import pushed, subscribe
from .test_init import STORE_KEY, hatched_pet, settle, setup_with_house

BLOCK = int(RAIN_BLOCK_SECONDS)


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


def rain_now(events: list[dict[str, Any]]) -> list[bool]:
    """The `rain` value of every house message that carries one."""
    return [
        e["house"]["device_fx"]["current"]["rain"]
        for e in events
        if "rain" in e.get("house", {}).get("device_fx", {}).get("current", {})
    ]


async def flip(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, state: str, wait: float = 11
) -> None:
    """The weather changes; the home debouncer (10 s) runs the pass."""
    hass.states.async_set("weather.home", state)
    await settle(hass, freezer, wait)


# -- the module itself -----------------------------------------------------------


def test_rain_is_known_or_it_is_unknown() -> None:
    assert rain_reading(Readings(night=False)) is None  # not "dry"
    assert rain_reading(Readings(night=False, condition="rainy")) is True
    assert rain_reading(Readings(night=False, condition="sunny")) is False
    # A rain gauge beats the forecast, and alone it is enough to know.
    assert rain_reading(Readings(night=False, rain_rate=0.4)) is True
    assert (
        rain_reading(Readings(night=False, rain_rate=0.0, condition="rainy")) is False
    )


def test_every_kind_the_server_can_send_is_a_rain_kind() -> None:
    """Slice 4 turns this into DEVICE_SIGNAL_MAP; until then rain and only rain."""
    assert KINDS == ("rain_started", "rain_stopped")
    assert device_fx.SCOPE == "house"


# -- case 1, 2, 3, 7: the leading edge, the echo window, the same id twice ---------


async def test_rain_starts_the_house_first_then_one_fx_and_no_speech(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"] == {"version": 1, "current": {"rain": False}}
    assert snapshot["device_fx_recent"] == []
    await flip(hass, freezer, "rainy")
    got = await pushed(client)
    assert rain_now(got) == [True]
    (entry,) = fx_messages(got)
    assert entry["kind"] == "rain_started" and entry["scope"] == "house"
    assert set(entry) == {"id", "kind", "occurred_at", "expires_at", "scope"}
    # The M1 order: the new ambience first, the onset second.
    keys = [next(iter(e)) for e in got if "house" in e or "fx" in e]
    assert keys == ["house", "fx"]
    # No moment: the existing speech path is not used (case 1, no duplicate speech).
    assert not [
        e for e in got if "moment" in e and e["moment"]["type"].startswith("rain")
    ]
    # occurred_at is the accepting pass, expires_at 90 s on (B1).
    at = dt_util.parse_datetime(entry["occurred_at"])
    assert at is not None and abs((at - dt_util.utcnow()).total_seconds()) < 1
    end = dt_util.parse_datetime(entry["expires_at"])
    assert end is not None and (end - at).total_seconds() == RING_SECONDS


async def test_a_card_opened_20_seconds_later_finds_the_transition_then_none_at_90(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    await house(hass, hass_storage, now)
    watching = await hass_ws_client(hass)
    await subscribe(watching)
    await flip(hass, freezer, "rainy")
    (live,) = fx_messages(await pushed(watching))
    await settle(hass, freezer, 20)
    late = await subscribe(await hass_ws_client(hass))  # case 2
    assert late["house"]["device_fx"]["current"] == {"rain": True}
    # Case 7: the same event, once in the snapshot ring and once live, one id.
    assert [e["id"] for e in late["device_fx_recent"]] == [live["id"]]
    assert late["device_fx_recent"] == [live]
    await settle(hass, freezer, 70)  # 90 s after the pass
    later = await subscribe(await hass_ws_client(hass))  # case 3
    assert later["device_fx_recent"] == []
    assert later["house"]["device_fx"]["current"] == {"rain": True}  # ambience stays


async def test_a_snapshot_sent_with_the_pass_and_the_live_message_share_an_id(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    """A watcher that connects in the same instant gets the entry twice, as the
    plan says (case 7); the card keeps one by id."""
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    pet._sent.clear()  # this watcher is new to the next push: it gets a snapshot
    await flip(hass, freezer, "rainy")
    got = await pushed(client)
    (snap,) = [e for e in got if "device_fx_recent" in e]
    (live,) = fx_messages(got)
    assert [e["id"] for e in snap["device_fx_recent"]] == [live["id"]]


async def test_a_push_with_no_change_sends_nothing(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    """B4: `recent` expiring between pushes must not look like a house change."""
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "rainy")
    await pushed(client)
    await settle(hass, freezer, 100)  # the ring empties on its own
    pet._push_watchers()
    pet._push_watchers()
    assert await pushed(client) == []


# -- case 5: a restart in rain ------------------------------------------------------


async def test_a_restart_in_rain_has_rain_and_no_fake_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await house(hass, hass_storage, now, weather="rainy")
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"]["current"] == {"rain": True}
    assert snapshot["device_fx_recent"] == []
    await settle(hass, freezer, 11)
    assert fx_messages(await pushed(client)) == []
    # The reload variant: a card open across it is sent a fresh snapshot, and an
    # empty ring, and no live message.
    pet.async_start_channel()
    got = await pushed(client)
    (fresh,) = [e for e in got if "device_fx_recent" in e]
    assert fresh["house"]["device_fx"]["current"] == {"rain": True}
    assert fresh["device_fx_recent"] == [] and fx_messages(got) == []


# -- case 6: unavailable and back; never known; the first reading --------------------


async def test_a_short_outage_holds_the_value_and_a_return_is_no_onset(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    await house(hass, hass_storage, now, weather="rainy")
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "unavailable")  # inside the 10 min hold: still rain
    await settle(hass, freezer, 240)
    await flip(hass, freezer, "sunny")  # back, and changed: a true later change
    got = await pushed(client)
    assert rain_now(got) == [False]
    assert [e["kind"] for e in fx_messages(got)] == ["rain_stopped"]


@pytest.mark.parametrize("back", ["rainy", "sunny"], ids=["same", "changed"])
async def test_an_outage_past_the_hold_comes_back_silently(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    back: str,
) -> None:
    pet = await house(hass, hass_storage, now, weather="rainy")
    client = await hass_ws_client(hass)
    await subscribe(client)
    hass.states.async_set("weather.home", "unavailable")
    got = []
    for _ in range(3):  # 15 min of ticks: past the hold, then unknown
        await settle(hass, freezer, 300)
        got += await pushed(client)
    assert fx_messages(got) == [] and rain_now(got) == []  # unknown sends nothing
    assert pet.device_fx.view()["current"] == {"rain": True}  # the last accepted
    await flip(hass, freezer, back)  # the first known reading after unknown
    got = await pushed(client)
    assert fx_messages(got) == []  # no onset out of unknown
    assert pet.device_fx.recent(pet._now()) == []
    assert pet.device_fx.view()["current"] == {"rain": back == "rainy"}  # truth
    # ...and a true later change after that is an onset again.
    await settle(hass, freezer, BLOCK)
    await flip(hass, freezer, "sunny" if back == "rainy" else "rainy")
    assert len(fx_messages(await pushed(client))) == 1


async def test_rain_that_was_never_known_is_missing_not_dry(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await house(hass, hass_storage, now, weather=None)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"] == {"version": 1, "current": {}}
    assert pet.device_fx.recent(pet._now()) == []
    await flip(hass, freezer, "rainy")  # the first known reading: silent
    got = await pushed(client)
    assert rain_now(got) == [True] and fx_messages(got) == []
    assert pet.device_fx.recent(pet._now()) == []


# -- case 11: the leading edge, the block, the timer, the unload ---------------------


async def test_a_flap_inside_the_block_sends_nothing_more(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "rainy")  # the leading edge, at once (0-10 s)
    assert [e["kind"] for e in fx_messages(await pushed(client))] == ["rain_started"]
    await flip(hass, freezer, "sunny")  # a reverse inside the block: held
    await flip(hass, freezer, "rainy")  # and back: the flap undid itself
    await settle(hass, freezer, BLOCK)  # the timer fires, one more pass looks
    assert await pushed(client) == []
    assert pet.device_fx.view()["current"] == {"rain": True}


async def test_a_flap_that_settles_on_the_reverse_is_one_onset_after_the_block(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "rainy")
    await pushed(client)
    start = dt_util.utcnow()
    await flip(hass, freezer, "sunny")  # held: the glass stays wet
    assert await pushed(client) == []
    assert pet.device_fx.view()["current"] == {"rain": True}
    # N + 0 to 10 s after the first accepted change (45-55 s), then one onset.
    while pet.device_fx.view()["current"]["rain"]:
        await settle(hass, freezer, 5)
        assert (dt_util.utcnow() - start).total_seconds() <= BLOCK + 10 + 5
    held = (dt_util.utcnow() - start).total_seconds()
    assert BLOCK <= held <= BLOCK + 10 + 5
    got = await pushed(client)
    assert rain_now(got) == [False]
    assert [e["kind"] for e in fx_messages(got)] == ["rain_stopped"]
    assert len(pet.device_fx.recent(pet._now())) == 2  # started, then stopped


async def test_a_reverse_after_the_block_is_accepted_like_any_first_change(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "rainy")
    await settle(hass, freezer, BLOCK + 10)  # the block is over, nothing pending
    await pushed(client)
    await flip(hass, freezer, "sunny")  # 0-10 s, not another 45
    assert [e["kind"] for e in fx_messages(await pushed(client))] == ["rain_stopped"]


async def test_unload_cancels_the_block_timer(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await house(hass, hass_storage, now)
    await flip(hass, freezer, "rainy")
    assert pet.device_fx._timer is not None  # a block is running
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert pet.device_fx._timer is None  # cancelled with the entry, not persisted


async def test_unknown_during_a_block_drops_the_block(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
) -> None:
    pet = await house(hass, hass_storage, now)
    client = await hass_ws_client(hass)
    await subscribe(client)
    await flip(hass, freezer, "rainy")
    assert pet.device_fx._timer is not None
    # Unknown arrives (the entity is gone, past the hold): the block is dropped.
    hass.states.async_remove("weather.home")
    pet.watcher._good.clear()
    pet._sense_home(pet._now())
    assert pet.device_fx._timer is None and pet.device_fx._block_until is None
    assert pet.device_fx.view()["current"] == {"rain": True}  # the last accepted
    await pushed(client)
    hass.states.async_set("weather.home", "sunny")  # a changed value: still silent
    pet._sense_home(pet._now())
    pet._push_watchers()
    got = await pushed(client)
    assert fx_messages(got) == [] and rain_now(got) == [False]


async def test_a_rain_sensor_alone_is_enough_to_know(
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
    assert snapshot["house"]["device_fx"]["current"] == {"rain": False}
    hass.states.async_set("sensor.gauge", "1.5", {"unit_of_measurement": "mm/h"})
    await settle(hass, freezer, 11)
    got = await pushed(client)
    assert rain_now(got) == [True]
    assert [e["kind"] for e in fx_messages(got)] == ["rain_started"]
    assert pet.device_fx.view()["current"] == {"rain": True}


# -- the ring ---------------------------------------------------------------------


def test_the_ring_is_bounded_and_ids_carry_a_nonce_and_a_sequence() -> None:
    class Hass:  # the timer is not needed for this: only observe's ring
        pass

    fx = DeviceFx(Hass(), lambda: None, nonce="abc")  # type: ignore[arg-type]
    fx._arm = lambda: None  # type: ignore[method-assign]
    t = 1_000_000.0
    fx.observe_rain(False, t)  # first known: silent
    for i in range(1, 40):
        t += 1000  # past every block
        fx.observe_rain(bool(i % 2), t)
        fx._block_until = None
    recent = fx.recent(t)
    assert len(recent) == 1  # only the last 90 s
    assert recent[0]["id"] == "abc-39"
    ring = DeviceFx(Hass(), lambda: None, nonce="abc")  # type: ignore[arg-type]
    ring._arm = lambda: None  # type: ignore[method-assign]
    ring.observe_rain(False, t)
    for i in range(1, 40):  # all inside 90 s: the ring keeps 16
        ring._block_until = None
        ring.observe_rain(bool(i % 2), t + i)
    assert len(ring.recent(t + 40)) == 16
    assert [e["id"] for e in ring.recent(t + 40)][-1] == "abc-39"


# -- case 16: nothing is stored ------------------------------------------------------


async def test_a_house_with_nothing_to_tell_rain_by_has_no_device_fx(
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
        monkeypatch.setattr(DeviceFx, "observe_rain", lambda *_: None)
        monkeypatch.setattr(PetCoordinator, "_fx_mapped", lambda _: False)
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    pet = await house(hass, hass_storage, now)
    pet.rng.seed(7)
    for step in ("rainy", "sunny", "rainy", "unavailable", "sunny", "rainy"):
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
    """Case 16: equal state, equal bus events, and no draw from the pet's rng."""
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
    await flip(hass, freezer, "rainy")
    assert pet.device_fx.recent(pet._now())  # something to leak
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
