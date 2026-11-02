"""virtual_pet.react and its categories (ha-signals H8, review s2643 section B).

The rules (react.counts) are pure and tested as a table. The service is tested
in a test Home Assistant: its results, the waits, stepping aside for H3 / H6's
own entities, and where the words go: a public category is a moment on the
sensor and the bus, a channel-only one (delivery, coffee, oven, EV, timer) is said live
on the card and kept nowhere, and a Custom line's own words follow the pet's
house_words_private option (both states tested, with share_news's headline).
"""

from __future__ import annotations

from datetime import timedelta
import json
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL
from homeassistant.core import Event, HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import rates as R
from custom_components.virtual_pet.const import (
    CHANNEL_CATEGORIES,
    DOMAIN,
    HOUSE_CATEGORIES,
    PRIVATE_READINGS,
)
from custom_components.virtual_pet.react import CATEGORIES, REACTIONS, counts

from .test_channel import pushed, subscribe
from .test_init import STORE_KEY, hatched_pet, setup_with_house

WORDS = "the bread is ready, zanzibar"  # unlike any word the pet says


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


# --- The rules: one row per change -------------------------------------------

DONE = 900  # a cycle that ran 15 minutes
ROWS = [
    # category, domain, from, to, held -> counts
    ("washer", "binary_sensor", "on", "off", DONE, True),
    ("washer", "binary_sensor", "on", "off", 120, False),  # too short to be a cycle
    ("washer", "binary_sensor", "off", "on", DONE, False),  # starting isn't done
    ("washer", "sensor", "Run", "Finished", DONE, True),
    (
        "washer",
        "sensor",
        "BSH.Common.EnumType.OperationState.Run",
        "BSH.Common.EnumType.OperationState.Finished",
        DONE,
        True,
    ),
    ("washer", "sensor", "idle", "finished", DONE, False),  # never ran
    ("washer", "sensor", "run", "pending", DONE, False),
    ("dryer", "switch", "on", "off", DONE, True),
    ("dishwasher", "input_boolean", "on", "off", DONE, True),
    ("oven", "switch", "off", "on", DONE, False),  # an oven coming on: never
    ("oven", "switch", "on", "off", DONE, True),
    ("coffee", "switch", "on", "off", 90, True),
    ("coffee", "switch", "on", "off", 20, False),
    ("printer", "sensor", "printing", "complete", DONE, True),
    ("printer", "binary_sensor", "on", "off", DONE, True),
    ("printer", "sensor", "printing", "operational", DONE, True),
    ("printer", "sensor", "offline", "operational", DONE, False),  # only after printing
    ("printer", "sensor", "idle", "operational", DONE, False),
    ("washer", "sensor", "run", "operational", DONE, False),  # printer's word alone
    ("ev", "sensor", "charging", "charged", DONE, True),
    ("ev", "sensor", "charging", "fully_charged", DONE, True),
    ("ev", "binary_sensor", "on", "off", DONE, True),
    ("heater", "climate", "off", "heat", 30, True),
    ("heater", "climate", "off", "heat_cool", 30, True),
    ("heater", "climate", "heat", "off", 30, False),
    ("heater", "climate", "off", "cool", 30, False),
    ("heater", "switch", "off", "on", 30, True),
    ("ac", "climate", "off", "cool", 30, True),
    ("ac", "climate", "off", "dry", 30, True),
    ("ac", "climate", "off", "auto", 30, True),
    ("ac", "climate", "off", "heat_cool", 30, True),
    ("ac", "climate", "off", "heat", 30, False),
    ("ac", "input_boolean", "off", "on", 30, True),
    ("fan", "fan", "off", "on", 30, True),
    ("fan", "fan", "on", "off", 30, False),
    ("internet", "binary_sensor", "off", "on", 300, True),
    ("internet", "binary_sensor", "off", "on", 30, False),  # a blip
    ("internet", "binary_sensor", "on", "off", 300, False),  # never "down"
    ("plants", "sensor", "30", "45", 600, True),
    ("plants", "sensor", "30", "33", 600, False),
    ("plants", "valve", "open", "closed", 120, True),
    ("plants", "switch", "on", "off", 120, True),
    (
        "feeder",
        "sensor",
        "2026-10-26T07:00:00+00:00",
        "2026-10-26T18:00:00+00:00",
        9,
        True,
    ),
    ("feeder", "sensor", "2", "3", 9, True),
    ("feeder", "sensor", "3", "0", 9, False),  # a count reset at midnight
    ("feeder", "button", "unknown", "2026-10-26T18:00:00+00:00", 9, False),
    (
        "feeder",
        "button",
        "2026-10-26T07:00:00+00:00",
        "2026-10-26T18:00:00+00:00",
        9,
        True,
    ),
    ("feeder", "switch", "off", "on", 9, True),
    ("delivery", "binary_sensor", "off", "on", 9, True),
    ("delivery", "binary_sensor", "on", "off", 9, False),
    ("delivery", "sensor", "0", "1", 9, True),
    ("delivery", "sensor", "ordered", "shipped", 9, False),  # a step, not the parcel
    ("delivery", "sensor", "out for delivery", "delivered", 9, True),
    ("delivery", "sensor", "in transit", "Arrived at pickup", 9, True),
    ("delivery", "sensor", "delivered", "returned", 9, False),
    ("timer", "timer", "active", "finished", 0, True),
    ("timer", "timer", "active", "idle", 0, False),  # cancelled
    ("custom", "sensor", "a", "b", 0, True),
    # No reading, either side, is never a moment.
    ("washer", "binary_sensor", "unavailable", "off", DONE, False),
    ("washer", "binary_sensor", "on", "unknown", DONE, False),
    ("internet", "binary_sensor", "unavailable", "on", 300, False),
    ("custom", "sensor", "a", "a", 0, False),  # an attribute change only
    ("garage", "cover", "closed", "open", 9, False),  # no such category
]


@pytest.mark.parametrize(("category", "domain", "old", "new", "held", "expected"), ROWS)
def test_counts(
    category: str, domain: str, old: str, new: str, held: float, expected: bool
) -> None:
    assert counts(category, domain, old, new, held) is expected


def test_custom_counts_only_the_state_named() -> None:
    assert counts("custom", "vacuum", "cleaning", "docked", 9, "Docked")
    assert not counts("custom", "vacuum", "docked", "cleaning", 9, "docked")
    assert counts("custom", "vacuum", "docked", "cleaning", 9, "")


def test_an_automation_calling_with_no_states_has_decided() -> None:
    assert counts("washer", None, None, None, None)


def test_every_category_has_its_rule_and_no_garage() -> None:
    assert set(CATEGORIES) == set(HOUSE_CATEGORIES) and len(HOUSE_CATEGORIES) == 16
    assert CHANNEL_CATEGORIES == {"delivery", "coffee", "oven", "ev", "timer"}
    assert not any("garage" in c for c in HOUSE_CATEGORIES)
    for key, spec in CATEGORIES.items():
        assert spec["rule"] and (key == "custom" or spec["domains"]), key
    assert REACTIONS == ("hop", "cheer", "cozy", "dance", "startle")
    assert "text" in PRIVATE_READINGS


# --- The service --------------------------------------------------------------


async def react(hass: HomeAssistant, category: str, **fields: Any) -> str:
    response = await hass.services.async_call(
        DOMAIN,
        "react",
        {"entity_id": "button.pip_feed", "category": category, **fields},
        blocking=True,
        return_response=True,
    )
    return response["test_pet"]


def washer_done(source: str = "binary_sensor.washer") -> dict[str, Any]:
    return {"source": source, "from_state": "on", "to_state": "off", "held": DONE}


def house_moments(hass: HomeAssistant) -> list[dict[str, Any]]:
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    return [m for m in moments if m["type"] == "house_moment"]


async def test_a_public_moment_is_its_category_and_changes_nothing(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0)
    config = await setup_with_house(hass)
    bus = async_capture_events(hass, f"{DOMAIN}_house_moment")
    before = config.runtime_data.state.to_dict()
    assert await react(hass, "washer", **washer_done()) == "shared"
    [moment] = house_moments(hass)
    assert set(moment) == {"type", "category", "at"} and moment["category"] == "washer"
    assert [e.data for e in bus] == [{"category": "washer", "pet_id": "test_pet"}]
    assert config.runtime_data.state.to_dict() == before
    # The source entity is read, never kept or sent.
    assert "binary_sensor.washer" not in json.dumps(
        [moment, config.runtime_data.debug, [e.data for e in bus]], default=str
    )


async def test_an_ignored_call_does_no_work(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A power sensor calls react every second; counts() turns them all away
    before anything advances, saves or publishes."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(hass)
    coordinator = config.runtime_data
    calls: list[str] = []
    for name in ("_advance", "_save", "_publish"):
        original = getattr(coordinator, name)

        def spy(*args: Any, _name: str = name, _original: Any = original, **kw: Any):
            calls.append(_name)
            return _original(*args, **kw)

        monkeypatch.setattr(coordinator, name, spy)
    ignored = {"source": "sensor.washer_power", "from_state": "3", "to_state": "4"}
    assert await react(hass, "washer", **ignored) == "ignored"
    assert calls == []
    assert await react(hass, "washer", **washer_done()) == "shared"
    assert "_advance" in calls and "_publish" in calls


async def test_each_result(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(
        hass, privacy=False, appliances=["binary_sensor.mapped"]
    )
    state = config.runtime_data.state
    short = washer_done() | {"held": 60}
    assert await react(hass, "washer", **short) == "ignored"
    assert (
        await react(hass, "washer", **washer_done("binary_sensor.mapped")) == "native"
    )
    state.away = True
    assert await react(hass, "washer", **washer_done()) == "away"  # privacy off
    state.away = False
    state.asleep = True
    assert await react(hass, "washer", **washer_done()) == "asleep"
    state.asleep = False
    state.age_hours = 0.0
    assert await react(hass, "washer", **washer_done()) == "egg"
    state.age_hours = 30.0
    assert await react(hass, "washer", **washer_done()) == "shared"
    assert await react(hass, "washer", **washer_done()) == "too_soon"
    assert len(house_moments(hass)) == 1


async def test_away_says_asleep_with_privacy_on(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True)
    await setup_with_house(hass)
    assert await react(hass, "timer") == "asleep"


async def test_each_category_waits_on_its_own(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass)
    assert await react(hass, "washer", **washer_done()) == "shared"
    # A dishwasher a few seconds on: the short gap across them all.
    assert await react(hass, "dishwasher", **washer_done()) == "too_soon"
    freezer.tick(timedelta(minutes=5))
    assert await react(hass, "dishwasher", **washer_done()) == "shared"
    # The washer's own wait, not started again by the dropped call.
    assert await react(hass, "washer", **washer_done()) == "too_soon"
    freezer.tick(timedelta(minutes=R.REACT_COOLDOWN_MINUTES - 5))
    assert await react(hass, "washer", **washer_done()) == "shared"


async def test_reacting_and_news_wait_apart(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass)
    assert await react(hass, "timer") == "shared"
    news = await hass.services.async_call(
        DOMAIN,
        "share_news",
        {"entity_id": "button.pip_feed", "headline": "Hi"},
        blocking=True,
        return_response=True,
    )
    assert news == {"test_pet": "shared"}


async def test_native_steps_aside_for_the_pets_own_settings(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass, heating=["switch.heater"], cooling=["fan.desk"])
    on = {"from_state": "off", "to_state": "on", "held": 60}
    assert await react(hass, "heater", source="switch.heater", **on) == "native"
    assert await react(hass, "fan", source="fan.desk", **on) == "native"
    assert await react(hass, "ac", source="fan.desk", **on) == "native"  # cooling
    assert await react(hass, "heater", source="switch.other_heater", **on) == "shared"
    assert [m["category"] for m in house_moments(hass)] == ["heater"]


async def test_validation(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from homeassistant.exceptions import HomeAssistantError
    import voluptuous as vol

    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass)
    with pytest.raises((vol.Invalid, HomeAssistantError)):
        await react(hass, "garage_door")
    with pytest.raises((vol.Invalid, HomeAssistantError)):
        await react(hass, "custom", reaction="wiggle")
    with pytest.raises(ServiceValidationError):
        await react(hass, "custom")  # Custom needs a reaction
    # Words never raise: long ones are cut, blank ones are none.
    assert await react(hass, "custom", reaction="cheer", text="x " * 80) == "shared"
    [moment] = house_moments(hass)
    assert len(moment["text"]) <= R.REACT_TEXT_MAX and moment["text"].endswith("…")


async def test_blank_words_are_no_words(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass)
    assert await react(hass, "custom", reaction="dance", text="   ") == "shared"
    [moment] = house_moments(hass)
    assert moment["reaction"] == "dance" and "text" not in moment


async def test_words_only_with_custom(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass)
    bus = async_capture_events(hass, f"{DOMAIN}_house_moment")
    assert (
        await react(hass, "washer", text=WORDS, reaction="dance", **washer_done())
        == "shared"
    )
    [moment] = house_moments(hass)
    assert set(moment) == {"type", "category", "at"}
    assert WORDS not in json.dumps([e.data for e in bus])


async def test_house_moments_never_push_a_hatching_out(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(hass)
    config.runtime_data._fire([{"type": "hatched", "species": "x"}])
    for _ in range(10):
        freezer.tick(timedelta(minutes=R.REACT_COOLDOWN_MINUTES + 1))
        assert await react(hass, "feeder") == "shared"
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert [m["type"] for m in moments].count("house_moment") == R.HOUSE_MOMENTS_KEPT
    assert any(m["type"] == "hatched" for m in moments)


# --- Privacy: where the words go ---------------------------------------------


async def everything(hass: HomeAssistant, config: Any) -> str:
    """Every state, the diagnostics and the debug sensor's calculation, as text."""
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    states = [
        (s.entity_id, s.state, dict(s.attributes)) for s in hass.states.async_all()
    ]
    diagnostics = await async_get_config_entry_diagnostics(hass, config)
    return json.dumps([states, diagnostics], default=str)


async def test_words_on_the_sensor_by_default_never_in_diagnostics(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(hass)
    bus = async_capture_events(hass, f"{DOMAIN}_house_moment")
    assert await react(hass, "custom", reaction="cheer", text=WORDS) == "shared"
    [moment] = house_moments(hass)
    assert moment["text"] == WORDS and moment["reaction"] == "cheer"
    # The bus keeps the automation's own words (like the news headline).
    assert bus[0].data["text"] == WORDS
    diagnostics = await async_get_config_entry_diagnostics(hass, config)
    assert WORDS not in json.dumps(diagnostics, default=str)
    debug = hass.states.get("sensor.pip_debug")
    assert debug is None or WORDS not in json.dumps(dict(debug.attributes), default=str)


async def test_house_words_private_keeps_them_off_every_state(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(hass, house_words_private=True)
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    card = await hass_ws_client(hass)
    shared = await hass_ws_client(hass)
    await subscribe(card)
    await subscribe(shared, shared=True)
    assert await react(hass, "custom", reaction="cozy", text=WORDS) == "shared"
    # Said live, once, on each card, shared screens too...
    for client in (card, shared):
        said = [e["moment"] for e in await pushed(client) if "moment" in e]
        assert said == [
            {
                "type": "house_live",
                "category": "custom",
                "reaction": "cozy",
                "text": WORDS,
                "at": said[0]["at"],
            }
        ]
    # ...and nowhere else: no state, no diagnostics, no virtual_pet_* event.
    assert WORDS not in await everything(hass, config)
    ours = [e.data for e in bus if e.event_type.startswith(f"{DOMAIN}_")]
    assert ours == [{"category": "custom", "reaction": "cozy", "pet_id": "test_pet"}]
    # No public copy to say it twice; a later card gets nothing.
    assert house_moments(hass) == []
    late = await subscribe(await hass_ws_client(hass))
    assert WORDS not in json.dumps(late)


async def test_house_words_private_and_the_news(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    headline = "Zanzibar turns thirty"
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(hass, house_words_private=True)
    bus = async_capture_events(hass, f"{DOMAIN}_news")
    card = await hass_ws_client(hass)
    await subscribe(card)
    await hass.services.async_call(
        DOMAIN,
        "share_news",
        {"entity_id": "button.pip_feed", "headline": headline, "topic": "Zanzibar"},
        blocking=True,
        return_response=True,
    )
    said = [e["moment"] for e in await pushed(card) if "moment" in e]
    assert said == [
        {
            "type": "news_live",
            "headline": headline,
            "topic": "Zanzibar",
            "at": said[0]["at"],
        }
    ]
    # The public moment is bare (the evening's "heard some news" still has it),
    # the bus keeps the headline (the automation's own words).
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert [set(m) for m in moments if m["type"] == "news"] == [{"type", "at"}]
    assert bus[0].data["headline"] == headline
    assert headline not in await everything(hass, config)
    assert "Zanzibar" not in await everything(hass, config)


async def test_news_stays_on_the_sensor_with_the_option_off(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass)
    card = await hass_ws_client(hass)
    await subscribe(card)
    await hass.services.async_call(
        DOMAIN,
        "share_news",
        {"entity_id": "button.pip_feed", "headline": "Hi there"},
        blocking=True,
        return_response=True,
    )
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert [m["headline"] for m in moments if m["type"] == "news"] == ["Hi there"]
    assert not [e for e in await pushed(card) if "moment" in e]  # once: the sensor's


@pytest.mark.parametrize("category", sorted(CHANNEL_CATEGORIES))
async def test_a_channel_only_category_is_said_live_and_kept_nowhere(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    category: str,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(hass, privacy=False)
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    card = await hass_ws_client(hass)
    shared = await hass_ws_client(hass)
    await subscribe(card)
    await subscribe(shared, shared=True)
    assert await react(hass, category) == "shared"
    for client in (card, shared):
        said = [e["moment"] for e in await pushed(client) if "moment" in e]
        assert said == [
            {"type": "house_live", "category": category, "at": said[0]["at"]}
        ]
    assert not [e for e in bus if e.event_type.startswith(f"{DOMAIN}_")]
    assert house_moments(hass) == []
    assert "house" not in json.dumps(config.runtime_data.debug.get("last_events", []))
    assert category not in json.dumps(
        [m for m in config.runtime_data.moments], default=str
    )
    text = await everything(hass, config)
    assert '"house_live"' not in text and '"house_moment"' not in text
    late = await subscribe(await hass_ws_client(hass))
    assert "house_live" not in json.dumps(late)


async def test_the_blueprint_end_to_end(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    tmp_path: Any,
) -> None:
    """The real service behind the blueprint: its call passes the schema."""
    import shutil

    from homeassistant.setup import async_setup_component

    from .test_blueprint import HOUSE

    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass)
    target = tmp_path / "blueprints/automation/virtual_pet"
    target.mkdir(parents=True)
    shutil.copy(HOUSE, target / "house_moment.yaml")
    hass.config.config_dir = str(tmp_path)
    hass.states.async_set("input_boolean.washer", "on")
    hass.states.async_set("input_boolean.thing", "off")
    blueprint = "virtual_pet/house_moment.yaml"
    automations = [
        {
            "id": "w",
            "use_blueprint": {
                "path": blueprint,
                "input": {
                    "pet": "button.pip_feed",
                    "entity": "input_boolean.washer",
                    "category": "washer",
                },
            },
        },
        {
            "id": "c",
            "use_blueprint": {
                "path": blueprint,
                "input": {
                    "pet": "button.pip_feed",
                    "entity": "input_boolean.thing",
                    "category": "custom",
                    "reaction": "cheer",
                    "custom_text": WORDS,
                },
            },
        },
    ]
    assert await async_setup_component(hass, "automation", {"automation": automations})
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=15))
    hass.states.async_set("input_boolean.washer", "off")
    await hass.async_block_till_done()
    freezer.tick(timedelta(minutes=1))
    hass.states.async_set("input_boolean.thing", "on")
    await hass.async_block_till_done()
    moments = house_moments(hass)
    assert [m["category"] for m in moments] == ["custom", "washer"]
    assert moments[0]["text"] == WORDS and moments[0]["reaction"] == "cheer"
