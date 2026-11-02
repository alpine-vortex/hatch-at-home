"""The missing-entities repair: "Forget them" removes only what is gone."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import issue_registry as ir
from homeassistant.setup import async_setup_component

from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.repairs import forget

from .test_config_flow import add_pet_with

ISSUE = "missing_entities_test_pet"


async def start(hass: HomeAssistant, **options: Any) -> Any:
    """A pet with these options, set up, and its repair flow's first form."""
    await hass.config.async_set_time_zone("UTC")
    assert await async_setup_component(hass, "repairs", {})
    config = add_pet_with(hass, **options)
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    return config


async def open_fix(hass: HomeAssistant) -> dict[str, Any]:
    issue = ir.async_get(hass).async_get_issue(DOMAIN, ISSUE)
    assert issue is not None and issue.is_fixable
    return await hass.data["repairs"]["flow_manager"].async_init(
        DOMAIN, context={"issue_id": ISSUE}
    )


async def test_forgetting_removes_only_the_missing_ids(hass: HomeAssistant) -> None:
    hass.states.async_set("media_player.tv", "off")
    hass.states.async_set("sensor.indoor", "20")
    others = {
        "bedtime": "22:30:00",
        "comfort_low": 18.3,
        "privacy": False,
        "indoor_temp": "sensor.indoor",
    }
    config = await start(
        hass,
        **others,
        tv=["media_player.tv", "media_player.gone"],  # list: drop the one item
        weather="weather.gone",  # single value: drop the key
        chores=["todo.gone"],  # list that empties: drop the key
    )
    before = dict(config.options)
    form = await open_fix(hass)
    assert form["type"] is FlowResultType.FORM and form["step_id"] == "confirm"
    assert form["data_schema"].schema == {}
    assert form["description_placeholders"]["entities"] == (
        "media_player.gone, todo.gone, weather.gone"
    )
    first_coordinator = config.runtime_data
    result = await hass.data["repairs"]["flow_manager"].async_configure(
        form["flow_id"], {}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    expected = {k: v for k, v in before.items() if k not in ("weather", "chores")}
    expected["tv"] = ["media_player.tv"]
    assert dict(config.options) == expected
    assert config.runtime_data is not first_coordinator  # the pet was reloaded
    assert ir.async_get(hass).async_get_issue(DOMAIN, ISSUE) is None


async def test_an_entity_that_came_back_is_kept(hass: HomeAssistant) -> None:
    config = await start(hass, tv=["media_player.a", "media_player.b"])
    form = await open_fix(hass)
    assert form["description_placeholders"]["entities"] == (
        "media_player.a, media_player.b"
    )
    hass.states.async_set("media_player.a", "off")  # back, while the form was open
    await hass.data["repairs"]["flow_manager"].async_configure(form["flow_id"], {})
    await hass.async_block_till_done()
    assert config.options["tv"] == ["media_player.a"]


async def test_a_removed_entry_aborts_the_fix(hass: HomeAssistant) -> None:
    config = await start(hass, tv=["media_player.gone"])
    form = await open_fix(hass)
    await hass.config_entries.async_remove(config.entry_id)
    await hass.async_block_till_done()
    result = await hass.data["repairs"]["flow_manager"].async_configure(
        form["flow_id"], {}
    )
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "entry_gone"


def test_forget_leaves_every_other_option_untouched() -> None:
    options = {
        "bedtime": "22:00:00",
        "tv": ["media_player.gone", "media_player.ok"],
        "weather": "weather.gone",
        "rain": "sensor.ok",
        "comfort_low": 18.0,
        "privacy": False,
    }
    assert forget(options, ["media_player.gone", "weather.gone"]) == {
        "bedtime": "22:00:00",
        "tv": ["media_player.ok"],
        "rain": "sensor.ok",
        "comfort_low": 18.0,
        "privacy": False,
    }
    assert forget(options, []) == options
