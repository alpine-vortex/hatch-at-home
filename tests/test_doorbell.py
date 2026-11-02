"""The doorbell (ha-signals H5, review s2651): a press startles the pet with a
chime and one line, live on the cards open at that moment, and is stored nowhere.

The press is judged by watcher.doorbell_rang on a state change's old and new
state (a table below), heard by the coordinator's own listener, and goes out as
doorbell_live: never the bus, the sensors, debug, diagnostics, a phone or a log.
"""

from __future__ import annotations

from datetime import timedelta
import json
import logging
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL
from homeassistant.core import Event, HomeAssistant, State
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    async_capture_events,
    async_mock_service,
)

from custom_components.virtual_pet import rates as R
from custom_components.virtual_pet.const import DOMAIN, LIVE_EVENTS
from custom_components.virtual_pet.react import is_native
from custom_components.virtual_pet.watcher import doorbell_rang

from .test_channel import pushed, subscribe
from .test_init import STORE_KEY, hatched_pet, settle, setup_with_house
from .test_react import everything, react

BELL = "event.front_door"
RING = {"device_class": "doorbell", "event_types": ["ring"], "event_type": "ring"}


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


def stamp(ago: float = 0.0) -> str:
    """An event entity's state: the time of its last event, as HA writes it."""
    when = dt_util.utcnow() - timedelta(seconds=ago)
    return when.isoformat(timespec="milliseconds")


def ring(hass: HomeAssistant, entity_id: str = BELL, ago: float = 0.0, **attrs: Any):
    hass.states.async_set(entity_id, stamp(ago), {**RING, **attrs})


def bell(hass: HomeAssistant, entity_id: str = BELL, state: str | None = None) -> None:
    """A doorbell in the house, last pressed an hour ago."""
    hass.states.async_set(entity_id, state or stamp(3600), RING)


async def watchers(hass: HomeAssistant, hass_ws_client: Any) -> tuple[Any, Any]:
    card, shared = await hass_ws_client(hass), await hass_ws_client(hass)
    await subscribe(card)
    await subscribe(shared, shared=True)
    return card, shared


async def said(client: Any) -> list[dict[str, Any]]:
    return [e["moment"] for e in await pushed(client) if "moment" in e]


# --- The edge rule: one row per change ---------------------------------------


def st(state: str, **attrs: Any) -> State:
    return State(BELL, state, {**RING, **attrs})


ROWS = [
    # name, old, new, rang
    ("a fresh press", st("2026-10-26T13:00:00.000+00:00"), st("NOW"), True),
    ("the first press ever (unknown -> time)", st("unknown"), st("NOW"), True),
    ("a restored time after unavailable", st("unavailable"), st("NOW"), False),
    ("no old state (just added)", None, st("NOW"), False),
    ("the entity went away", st("NOW"), None, False),
    ("going unavailable", st("NOW"), st("unavailable"), False),
    ("going unknown", st("NOW"), st("unknown"), False),
    ("the same time again", st("NOW"), st("NOW"), False),
    ("a time 2 h old", st("2026-10-26T11:00:00.000+00:00"), st("OLD"), False),
    ("a time 59 s old", st("2026-10-26T13:00:00.000+00:00"), st("AGO59"), True),
    ("a time 61 s old", st("2026-10-26T13:00:00.000+00:00"), st("AGO61"), False),
    ("a time 1 s ahead (clock jitter)", st("unknown"), st("AHEAD1"), True),
    ("a time 5 s ahead", st("unknown"), st("AHEAD5"), False),
    ("not a time", st("unknown"), st("ding"), False),
    ("no event type", st("unknown"), st("NOW", event_type=None), False),
    ("an empty event type", st("unknown"), st("NOW", event_type=""), False),
    (
        "another type where ring exists",
        st("unknown"),
        st("NOW", event_type="motion"),
        False,
    ),
    (
        "any type where the entity has no ring",
        st("unknown"),
        st("NOW", event_type="pressed", event_types=["pressed"]),
        True,
    ),
    (
        "any type where event_types is missing",
        st("unknown"),
        st("NOW", event_type="pressed", event_types=None),
        True,
    ),
]


@pytest.mark.parametrize(("name", "old", "new", "rang"), ROWS, ids=[r[0] for r in ROWS])
def test_the_edge_rule(
    now: float, name: str, old: State | None, new: State | None, rang: bool
) -> None:
    offsets = {
        "NOW": 0,
        "OLD": 7200,
        "AGO59": 59,
        "AGO61": 61,
        "AHEAD1": -1,
        "AHEAD5": -5,
    }
    if new is not None and new.state in offsets:
        new = State(BELL, stamp(offsets[new.state]), new.attributes)
    if old is not None and old.state == "NOW":
        old = State(BELL, stamp(5), old.attributes)  # an earlier press
    if new is not None and new.state == "NOW":
        new = State(BELL, stamp(), new.attributes)
    if name == "the same time again":
        old = new
    assert doorbell_rang(old, new, now) is rang


# --- Hearing it ---------------------------------------------------------------


async def test_a_press_is_said_live_to_every_watcher_and_kept_nowhere(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    caplog: pytest.LogCaptureFixture,
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, notify_users=["someone"])
    bell(hass)
    config = await setup_with_house(hass, privacy=False)
    assert "doorbell" in hass.states.get("sensor.pip_life_stage").attributes["senses"]
    phone = async_mock_service(hass, "notify", "mobile_app_phone")
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    card, shared = await watchers(hass, hass_ws_client)
    pressed = stamp(0.123)[:23]  # to the millisecond: nothing else has this time
    with caplog.at_level(logging.DEBUG):
        ring(hass, ago=0.123)
        await hass.async_block_till_done()
        for client in (card, shared):
            [moment] = await said(client)
            assert moment == {"type": "doorbell_live", "at": moment["at"]}
        await settle(hass, freezer)  # a re-read of the house
        assert await said(card) == []  # said once

    assert not [e for e in bus if e.event_type.startswith(f"{DOMAIN}_")]
    assert not phone
    coordinator = config.runtime_data
    assert coordinator.moments == []
    assert "doorbell" not in json.dumps(coordinator.debug.get("last_events", []))
    assert "doorbell_live" not in json.dumps(coordinator.debug, default=str)
    # Every pet state and the diagnostics (the bell's own event entity, which
    # holds the press, is HA's and left out).
    text = await everything(hass, config)
    own = json.dumps(
        [s for s in json.loads(text)[0] if not s[0].startswith("event.")]
        + json.loads(text)[1:]
    )
    for trace in ("doorbell_live", BELL, pressed):
        assert trace not in own
    assert BELL not in caplog.text and pressed not in caplog.text
    assert not [
        m for m in hass.states.get("sensor.pip_last_care").attributes["moments"]
    ]
    late = await subscribe(await hass_ws_client(hass))
    assert "doorbell_live" not in json.dumps(late)


async def rings(hass: HomeAssistant, hass_ws_client: Any) -> Any:
    """A watcher open now."""
    client = await hass_ws_client(hass)
    await subscribe(client)
    return client


async def test_it_startles_with_the_pet_awake_only_then_cooldown_for_all_bells(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    bell(hass)
    bell(hass, "event.back_door")
    config = await setup_with_house(hass)
    client = await rings(hass, hass_ws_client)
    state = config.runtime_data.state

    state.asleep = True  # dropped, and it does not start the wait
    ring(hass)
    await hass.async_block_till_done()
    assert await said(client) == []
    state.asleep = False
    state.away = True
    freezer.tick(timedelta(seconds=1))
    ring(hass)
    await hass.async_block_till_done()
    assert await said(client) == []
    state.away = False

    freezer.tick(timedelta(seconds=1))
    ring(hass, "event.back_door")  # heard at once: nothing started a wait
    await hass.async_block_till_done()
    assert len(await said(client)) == 1

    freezer.tick(timedelta(minutes=R.HOME_DOORBELL_COOLDOWN_MINUTES - 1))
    ring(hass)  # the other bell, 29 minutes on: still one visit
    await hass.async_block_till_done()
    assert await said(client) == []
    freezer.tick(timedelta(minutes=2))
    ring(hass)
    await hass.async_block_till_done()
    assert len(await said(client)) == 1


async def test_restores_unavailable_and_old_presses_are_not_rings(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    bell(hass)
    await setup_with_house(hass)
    client = await rings(hass, hass_ws_client)

    ring(hass, ago=7200)  # a restored state 2 h old
    hass.states.async_set(BELL, "unavailable", RING)  # a restart ...
    ring(hass, ago=5)  # ... restoring a press from seconds ago
    hass.states.async_set("event.new_door", stamp(), RING)  # just added
    await hass.async_block_till_done()
    assert await said(client) == []

    freezer.tick(timedelta(minutes=1))
    hass.states.async_set(BELL, "unknown", RING)  # never pressed ...
    ring(hass)  # ... and now the first press ever
    await hass.async_block_till_done()
    assert len(await said(client)) == 1


async def test_a_reload_replays_nothing_and_the_next_press_is_heard(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    bell(hass)
    config = await setup_with_house(hass)
    ring(hass)
    await hass.async_block_till_done()
    assert await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    client = await rings(hass, hass_ws_client)
    await settle(hass, freezer, 20)
    assert await said(client) == []  # the fresh press was not re-read

    freezer.tick(timedelta(minutes=1))
    ring(hass)
    await hass.async_block_till_done()
    assert len(await said(client)) == 1  # the wait is memory: a reload loses it


async def test_only_doorbells_are_heard(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("event.remote", stamp(3600), {"event_type": "x"})
    hass.states.async_set(
        "event.motion", stamp(3600), RING | {"device_class": "motion"}
    )
    hass.states.async_set("binary_sensor.door", "off", {"device_class": "door"})
    await setup_with_house(hass)
    assert (
        "doorbell" not in hass.states.get("sensor.pip_life_stage").attributes["senses"]
    )
    client = await rings(hass, hass_ws_client)
    hass.states.async_set("event.remote", stamp(), {"event_type": "ring"})
    hass.states.async_set("event.motion", stamp(), RING | {"device_class": "motion"})
    hass.states.async_set("binary_sensor.door", "on", {"device_class": "door"})
    await hass.async_block_till_done()
    assert await said(client) == []


async def test_notice_doorbell_off_hears_nothing_and_senses_nothing(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    bell(hass)
    await setup_with_house(hass, notice_doorbell=False)
    assert (
        "doorbell" not in hass.states.get("sensor.pip_life_stage").attributes["senses"]
    )
    client = await rings(hass, hass_ws_client)
    ring(hass)
    await hass.async_block_till_done()
    assert await said(client) == []


# --- The overlap with virtual_pet.react ---------------------------------------


def test_a_watched_doorbell_is_native_to_react() -> None:
    assert is_native("feeder", BELL, {}, [BELL])
    assert is_native("delivery", BELL, {}, [BELL])
    assert not is_native("feeder", BELL, {})  # not watched (the switch is off)
    assert not is_native("feeder", "event.other", {}, [BELL])


async def test_react_on_a_watched_doorbell_steps_aside(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    bell(hass)
    fields = {"source": BELL, "from_state": stamp(3600), "to_state": stamp()}
    await setup_with_house(hass)
    assert await react(hass, "feeder", **fields) == "native"
    assert await react(hass, "feeder", **{**fields, "source": "event.x"}) == "shared"


async def test_react_on_a_doorbell_with_the_switch_off_is_heard_as_before(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    bell(hass)
    fields = {"source": BELL, "from_state": stamp(3600), "to_state": stamp()}
    await setup_with_house(hass, notice_doorbell=False)
    assert await react(hass, "feeder", **fields) == "shared"


def test_the_doorbell_is_live_only() -> None:
    assert "doorbell_live" in LIVE_EVENTS
