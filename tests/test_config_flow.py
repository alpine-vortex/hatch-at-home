"""The config flow: what setup offers."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntryDisabler
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.virtual_pet.const import DOMAIN

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
