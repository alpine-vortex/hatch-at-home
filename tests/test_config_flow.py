"""The config flow: what setup offers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntryDisabler
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
import voluptuous as vol

from custom_components.virtual_pet import config_flow, rates as R
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.topics import TOPIC_LABELS, TOPICS, topics_text

# The worlds setup offers, in catalog order.
WORLDS = ["woodland", "terrarium", "hearth", "tidepool", "pond", "nightsky"]


def add_pet(
    hass: HomeAssistant, name: str, disabled: bool = False, **data: Any
) -> MockConfigEntry:
    config = MockConfigEntry(
        domain=DOMAIN,
        title=name,
        data={CONF_NAME: name, **data},
        entry_id=f"test_{name.lower()}",
        disabled_by=ConfigEntryDisabler.USER if disabled else None,
    )
    config.add_to_hass(hass)
    return config


async def default_world(hass: HomeAssistant) -> str:
    """The World the user step pre-selects."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    schema = result["data_schema"].schema
    assert [o["value"] for o in schema["world"].config["options"]] == WORLDS
    marker = next(k for k in schema if k == "world")
    return marker.default()


async def test_no_pets_pre_selects_woodland(hass: HomeAssistant) -> None:
    assert await default_world(hass) == "woodland"


async def test_woodland_pet_pre_selects_the_next_world(hass: HomeAssistant) -> None:
    add_pet(hass, "Pip", world="woodland")
    assert await default_world(hass) == "terrarium"


async def test_a_world_a_pet_is_moving_to_counts_as_used(hass: HomeAssistant) -> None:
    add_pet(hass, "Pip", world="woodland", next_world="terrarium")
    assert await default_world(hass) == "hearth"


async def test_every_world_taken_falls_back_to_woodland(hass: HomeAssistant) -> None:
    for world in WORLDS:
        add_pet(hass, world.title(), world=world)
    assert await default_world(hass) == "woodland"


async def test_a_gap_in_the_catalog_is_found(hass: HomeAssistant) -> None:
    add_pet(hass, "Pip", world="woodland")
    add_pet(hass, "Fern", world="hearth")
    assert await default_world(hass) == "terrarium"


async def test_an_unloaded_entry_without_a_world_counts_as_woodland(
    hass: HomeAssistant,
) -> None:
    add_pet(hass, "Pip")  # from before worlds existed, not loaded
    assert await default_world(hass) == "terrarium"


async def test_a_loaded_entry_counts_by_its_pets_world(hass: HomeAssistant) -> None:
    await hass.config.async_set_time_zone("UTC")
    config = add_pet(hass, "Pip", world="terrarium")
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    assert config.runtime_data.world == "terrarium"
    assert await default_world(hass) == "woodland"


async def test_a_disabled_entry_still_counts_as_used(hass: HomeAssistant) -> None:
    add_pet(hass, "Pip", disabled=True, world="woodland")
    assert await default_world(hass) == "terrarium"


async def test_any_world_can_still_be_picked(hass: HomeAssistant) -> None:
    add_pet(hass, "Pip", world="woodland")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_NAME: "Fern", "world": "woodland"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"]["world"] == "woodland"


# --- The options menu (S5) --------------------------------------------------

PACKAGE = Path(config_flow.__file__).parent

# Every option set, in °C. The comfort values are not on the 0.5 grid, so the
# form shows them rounded.
FULL = {
    "bedtime": "22:30:00",
    "wake_time": "06:45:00",
    "bedtime_lights": ["light.bed"],
    "motion": ["binary_sensor.hall_motion"],
    "zone": "zone.home",
    "away_after": 3.0,
    "sitter_settles": False,
    "privacy": True,
    "house_words_private": True,
    "rain": "sensor.rain",
    "weather": "weather.home",
    "indoor_temperature": "sensor.living_temp",
    "comfort_low": 18.3,
    "comfort_high": 26.5,
    "aqi": "sensor.aqi",
    "solar": "sensor.solar",
    "room_lights": ["light.lamp"],
    "fireplace": "switch.fire",
    "lux": ["sensor.lux"],
    "tv": ["media_player.tv"],
    "music": ["media_player.speaker"],
    "heating": ["climate.hall"],
    "cooling": ["fan.hall"],
    "notice_robot": False,
    "notice_doorbell": True,
    "appliances": ["switch.washer"],
    "appliance_watts": 7.0,
    "chores": ["todo.chores"],
    "moon_phase": "sensor.moon",
    "moon_illumination": "sensor.moon_lit",
    "moon_altitude": "sensor.moon_alt",
    "dashboard": "/lovelace/pets",
}


def add_pet_with(hass: HomeAssistant, **options: Any) -> MockConfigEntry:
    config = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "world": "woodland"},
        entry_id="test_pet",
        options=options,
    )
    config.add_to_hass(hass)
    return config


async def open_topic(hass: HomeAssistant, entry_id: str, topic: str) -> dict[str, Any]:
    """The menu, then the topic's form."""
    result = await hass.config_entries.options.async_init(entry_id)
    assert result["type"] is FlowResultType.MENU
    return await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": topic}
    )


def shown(form: dict[str, Any]) -> dict[str, Any]:
    """What the form shows for each field: its default or suggested value."""
    values = {}
    for marker in form["data_schema"].schema:
        if marker.default is not vol.UNDEFINED:
            values[str(marker)] = marker.default()
        elif (marker.description or {}).get("suggested_value") is not None:
            values[str(marker)] = marker.description["suggested_value"]
    return values


async def save_topic(
    hass: HomeAssistant, entry_id: str, topic: str, user_input: dict[str, Any]
) -> dict[str, Any]:
    """Open a topic and submit these values for it."""
    form = await open_topic(hass, entry_id, topic)
    assert form["type"] is FlowResultType.FORM and form["step_id"] == topic
    return await hass.config_entries.options.async_configure(
        form["flow_id"], user_input
    )


async def test_options_open_on_a_menu_of_topics(hass: HomeAssistant) -> None:
    config = add_pet_with(hass)
    result = await hass.config_entries.options.async_init(config.entry_id)
    assert result["type"] is FlowResultType.MENU
    assert result["step_id"] == "init"
    assert result["menu_options"] == list(TOPICS)
    assert result["description_placeholders"] == {"name": "Pip"}


def test_every_option_key_is_in_exactly_one_topic() -> None:
    keys = [k for topic in TOPICS.values() for k in topic]
    assert len(keys) == len(set(keys))
    assert set(keys) == set(FULL)


async def test_each_topic_shows_only_its_fields_with_todays_values(
    hass: HomeAssistant,
) -> None:
    config = add_pet_with(hass, **FULL)
    for topic, keys in TOPICS.items():
        form = await open_topic(hass, config.entry_id, topic)
        assert [str(k) for k in form["data_schema"].schema] == list(keys)
        assert form["description_placeholders"] == {"name": "Pip"}
        values = shown(form)
        for key in keys:
            if key in ("comfort_low", "comfort_high"):
                continue  # shown rounded, below
            assert values[key] == FULL[key], key
        hass.config_entries.options.async_abort(form["flow_id"])
    form = await open_topic(hass, config.entry_id, "weather")
    assert shown(form)["comfort_low"] == 18.5 and shown(form)["comfort_high"] == 26.5


@pytest.mark.parametrize("fahrenheit", [False, True])
async def test_saving_each_topic_unchanged_leaves_the_options_equal(
    hass: HomeAssistant, fahrenheit: bool
) -> None:
    if fahrenheit:
        hass.config.units = US_CUSTOMARY_SYSTEM
    config = add_pet_with(hass, **FULL)
    for topic in TOPICS:
        form = await open_topic(hass, config.entry_id, topic)
        result = await hass.config_entries.options.async_configure(
            form["flow_id"], shown(form)
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY, topic
        assert dict(config.options) == FULL, topic


async def test_a_fahrenheit_house_round_trips_26_5_celsius(
    hass: HomeAssistant,
) -> None:
    hass.config.units = US_CUSTOMARY_SYSTEM
    config = add_pet_with(hass, **FULL)
    form = await open_topic(hass, config.entry_id, "weather")
    assert shown(form)["comfort_high"] == 79.5  # 26.5 °C, to the half degree
    await hass.config_entries.options.async_configure(form["flow_id"], shown(form))
    assert config.options["comfort_high"] == 26.5  # not 26.39
    # A changed value is converted, and the other one keeps its stored value.
    result = await save_topic(
        hass, config.entry_id, "weather", {**shown(form), "comfort_low": 60}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config.options["comfort_low"] == pytest.approx(15.56, abs=0.01)
    assert config.options["comfort_high"] == 26.5


async def test_clearing_tv_removes_only_tv(hass: HomeAssistant) -> None:
    config = add_pet_with(hass, **FULL)
    form = await open_topic(hass, config.entry_id, "room")
    result = await hass.config_entries.options.async_configure(
        form["flow_id"], {**shown(form), "tv": []}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert dict(config.options) == {k: v for k, v in FULL.items() if k != "tv"}


async def test_saving_a_topic_keeps_other_topics_options_exactly(
    hass: HomeAssistant,
) -> None:
    config = add_pet_with(hass, **FULL)
    result = await save_topic(
        hass,
        config.entry_id,
        "bedtime",
        {"bedtime": "21:00:00", "wake_time": "07:00:00"},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    expected = {k: v for k, v in FULL.items() if k not in TOPICS["bedtime"]}
    expected |= {
        "bedtime": "21:00:00",
        "wake_time": "07:00:00",
    }  # lights, motion cleared
    assert dict(config.options) == expected


async def test_an_entry_with_empty_options_gets_only_the_opened_topics_defaults(
    hass: HomeAssistant,
) -> None:
    config = add_pet_with(hass)
    form = await open_topic(hass, config.entry_id, "people")
    result = await hass.config_entries.options.async_configure(
        form["flow_id"], shown(form)
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert dict(config.options) == {
        "zone": "zone.home",
        "away_after": 2.0,
        "sitter_settles": True,
        "privacy": True,
        "house_words_private": False,
    }


async def test_comfort_low_not_below_high_errors_on_weather_and_saves_nothing(
    hass: HomeAssistant,
) -> None:
    config = add_pet_with(hass, **FULL)
    result = await save_topic(
        hass, config.entry_id, "weather", {"comfort_low": 27, "comfort_high": 20}
    )
    assert result["type"] is FlowResultType.FORM and result["step_id"] == "weather"
    assert result["errors"] == {"comfort_low": "comfort_range"}
    assert dict(config.options) == FULL
    # The form comes back with what was entered.
    assert shown(result)["comfort_low"] == 27


async def test_same_bedtime_and_wake_time_errors_on_bedtime(
    hass: HomeAssistant,
) -> None:
    config = add_pet_with(hass, **FULL)
    result = await save_topic(
        hass,
        config.entry_id,
        "bedtime",
        {"bedtime": "23:00:00", "wake_time": "23:00:00"},
    )
    assert result["errors"] == {"wake_time": "same_times"}
    assert dict(config.options) == FULL


async def test_a_temperature_sensor_as_fireplace_errors_on_room(
    hass: HomeAssistant,
) -> None:
    hass.states.async_set(
        "sensor.fire_temp",
        "21",
        {"device_class": "temperature", "unit_of_measurement": "°C"},
    )
    config = add_pet_with(hass, **FULL)
    result = await save_topic(
        hass, config.entry_id, "room", {"fireplace": "sensor.fire_temp"}
    )
    assert result["errors"] == {"fireplace": "fireplace_temperature"}
    assert dict(config.options) == FULL


async def test_every_error_is_on_a_field_of_its_own_topic(
    hass: HomeAssistant,
) -> None:
    hass.states.async_set("sensor.fire_temp", "21", {"device_class": "temperature"})
    config = add_pet_with(hass, **FULL)
    bad = {
        "bedtime": {"bedtime": "23:00:00", "wake_time": "23:00:00"},
        "weather": {"comfort_low": 27, "comfort_high": 20},
        "room": {"fireplace": "sensor.fire_temp"},
    }
    for topic in TOPICS:
        result = await save_topic(hass, config.entry_id, topic, bad.get(topic, {}))
        if topic in bad:
            assert result["type"] is FlowResultType.FORM, topic
            fields = {str(k) for k in result["data_schema"].schema}
            assert result["errors"], topic
            assert set(result["errors"]) <= fields | {"base"}, topic
        else:
            assert result["type"] is FlowResultType.CREATE_ENTRY, topic


def _strings() -> dict[str, Any]:
    return json.loads((PACKAGE / "strings.json").read_text())


def test_strings_and_english_translation_are_identical() -> None:
    assert (PACKAGE / "strings.json").read_text() == (
        PACKAGE / "translations" / "en.json"
    ).read_text()


def test_every_menu_option_and_step_has_its_strings() -> None:
    steps = _strings()["options"]["step"]
    menu = steps["init"]
    assert {"title", "description"} <= set(menu)
    assert list(menu["menu_options"]) == list(TOPICS)
    assert list(menu["menu_option_descriptions"]) == list(TOPICS)
    assert menu["menu_options"] == TOPIC_LABELS
    assert "sections" not in menu
    for topic, keys in TOPICS.items():
        step = steps[topic]
        assert step["title"] and step["description"], topic
        assert list(step["data"]) == list(keys), topic
        assert list(step["data_description"]) == list(keys), topic
        assert all(step["data"].values()) and all(step["data_description"].values())
    errors = _strings()["options"]["error"]
    assert {"comfort_range", "same_times", "fireplace_temperature"} <= set(errors)


def test_the_titles_that_name_the_pet_carry_name() -> None:
    steps = _strings()["options"]["step"]
    assert steps["bedtime"]["title"] == "{name}'s bedtime"
    assert steps["room"]["title"] == "{name}'s room"


async def test_the_missing_entities_repair_names_the_topics(
    hass: HomeAssistant,
) -> None:
    await hass.config.async_set_time_zone("UTC")
    config = add_pet_with(
        hass, tv=["media_player.gone"], weather="weather.gone", chores=["todo.gone"]
    )
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    issue = ir.async_get(hass).async_get_issue(DOMAIN, "missing_entities_test_pet")
    assert issue is not None
    assert issue.translation_placeholders["topics"] == (
        '"Weather and air", "The pet\'s room" and "The house helps"'
    )
    text = _strings()["issues"]["missing_entities"]["description"]
    assert "then {topics}, and pick" in text


def test_topics_text_names_one_topic_alone() -> None:
    assert topics_text({"tv": ["media_player.a"]}, ["media_player.a"]) == (
        '"The pet\'s room"'
    )


async def test_a_fahrenheit_house_stores_the_default_comfort_exactly(
    hass: HomeAssistant,
) -> None:
    hass.config.units = US_CUSTOMARY_SYSTEM
    config = add_pet_with(hass)  # no comfort values stored yet
    form = await open_topic(hass, config.entry_id, "weather")
    assert shown(form)["comfort_low"] == 64.5  # 18.0 °C, to the half degree
    await hass.config_entries.options.async_configure(form["flow_id"], shown(form))
    # Exactly the defaults, not 18.06 / 26.39 from a round trip through °F.
    assert config.options["comfort_low"] == R.HOME_COMFORT_LOW_C
    assert config.options["comfort_high"] == R.HOME_COMFORT_HIGH_C
    # A value the owner changed is still converted.
    await save_topic(
        hass, config.entry_id, "weather", {**shown(form), "comfort_low": 60}
    )
    assert config.options["comfort_low"] == pytest.approx(15.56, abs=0.01)


def test_the_missing_entities_fix_flow_has_its_words() -> None:
    confirm = _strings()["issues"]["missing_entities"]["fix_flow"]["step"]["confirm"]
    assert confirm["title"] == "{pet} is listening for entities that are gone"
    for placeholder in ("{pet}", "{entities}", "{topics}"):
        assert placeholder in confirm["description"]
    assert "Submit to forget them" in confirm["description"]
    abort = _strings()["issues"]["missing_entities"]["fix_flow"]["abort"]
    assert abort["entry_gone"] == (
        "This pet has been removed, so there is nothing to forget."
    )
