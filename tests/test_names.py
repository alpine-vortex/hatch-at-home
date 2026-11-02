"""One name for the pet: the device page, Reconfigure, setup and the texts agree."""
# ruff: noqa: F811

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from homeassistant import config_entries
from homeassistant.components import persistent_notification
from homeassistant.const import CONF_NAME, STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import (
    device_registry as dr,
    issue_registry as ir,
)
from homeassistant.helpers.selector import SelectSelector, SelectSelectorMode

import custom_components.virtual_pet as pkg
from custom_components.virtual_pet.const import DOMAIN

from .test_init import (  # noqa: F401
    STORE_KEY,
    hatched_pet,
    now,
    setup,
    setup_with_house,
)

PACKAGE = Path(pkg.__file__).parent


def rename_on_device_page(hass: HomeAssistant, entry_id: str, name: str) -> None:
    """What HA's pencil and its "Name and assign" step do."""
    registry = dr.async_get(hass)
    device = registry.async_get_device_by_identifier((DOMAIN, entry_id), entry_id)
    assert device is not None
    registry.async_update_device(device.id, name_by_user=name)


def device_name(hass: HomeAssistant, entry_id: str) -> str | None:
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, entry_id), entry_id
    )
    assert device is not None
    return device.name_by_user


def schema_default(result: Any, key: str) -> Any:
    marker = next(k for k in result["data_schema"].schema if k == key)
    return marker.default()


async def test_reconfigure_shows_the_name_from_the_device_page(
    hass: HomeAssistant,
    now: float,
) -> None:
    config = await setup(hass)
    rename_on_device_page(hass, config.entry_id, "Mochi")
    result = await config.start_reconfigure_flow(hass)
    assert schema_default(result, CONF_NAME) == "Mochi"
    assert result["description_placeholders"] == {"name": "Mochi"}


async def test_a_reconfigure_rename_replaces_the_device_page_name(
    hass: HomeAssistant,
    now: float,
) -> None:
    config = await setup(hass)
    rename_on_device_page(hass, config.entry_id, "Mochi")
    result = await config.start_reconfigure_flow(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Fern", "world": "woodland"}
    )
    assert result["reason"] == "reconfigure_successful"
    await hass.async_block_till_done()
    assert config.title == "Fern"
    assert device_name(hass, config.entry_id) is None
    # The card, notifications and the journal follow the new name.
    assert config.runtime_data.state.name == "Fern"


async def test_saving_reconfigure_unchanged_keeps_the_device_page_name(
    hass: HomeAssistant,
    now: float,
) -> None:
    config = await setup(hass)
    rename_on_device_page(hass, config.entry_id, "Mochi")
    result = await config.start_reconfigure_flow(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Mochi", "world": "pond"}
    )
    await hass.async_block_till_done()
    assert device_name(hass, config.entry_id) == "Mochi"
    assert config.title == "Pip"  # nothing was renamed
    assert config.runtime_data.state.name == "Mochi"


async def test_options_and_repairs_use_the_device_page_name(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(hass, tv=["media_player.gone"])
    rename_on_device_page(hass, config.entry_id, "Mochi")
    result = await hass.config_entries.options.async_init(config.entry_id)
    assert result["description_placeholders"] == {"name": "Mochi"}
    await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    issue = ir.async_get(hass).async_get_issue(DOMAIN, "missing_entities_test_pet")
    assert issue is not None and issue.translation_placeholders["pet"] == "Mochi"


async def start_add(hass: HomeAssistant, name: str, **extra: Any) -> Any:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    return await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_NAME: name, "world": "woodland", **extra}
    )


async def test_add_a_pet_refuses_a_name_another_pet_has(
    hass: HomeAssistant,
    now: float,
) -> None:
    await hass.config.async_set_time_zone("UTC")
    first = await start_add(hass, "Pip")
    assert first["type"] is FlowResultType.CREATE_ENTRY
    again = await start_add(hass, " pip ")
    assert again["type"] is FlowResultType.FORM
    assert again["errors"] == {"name": "name_taken"}
    # What they typed stays in the form.
    assert schema_default(again, CONF_NAME) == " pip "
    # A free name goes through on the same form.
    ok = await hass.config_entries.flow.async_configure(
        again["flow_id"], {CONF_NAME: "Fern", "world": "pond"}
    )
    assert ok["type"] is FlowResultType.CREATE_ENTRY
    assert ok["title"] == "Fern"


async def test_add_a_pet_counts_the_name_from_the_device_page(
    hass: HomeAssistant,
    now: float,
) -> None:
    config = await setup(hass)
    rename_on_device_page(hass, config.entry_id, "Mochi")
    taken = await start_add(hass, "mochi")
    assert taken["errors"] == {"name": "name_taken"}
    # The title it was renamed from is free again: nobody calls it that now.
    free = await start_add(hass, "Pip")
    assert free["type"] is FlowResultType.CREATE_ENTRY


async def test_the_name_field_is_filled_with_a_free_name(
    hass: HomeAssistant,
    now: float,
) -> None:
    config = await setup(hass)
    rename_on_device_page(hass, config.entry_id, "Fern")  # Pip is the first default
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert schema_default(result, CONF_NAME) not in ("Fern",)


async def test_the_world_list_is_rows_not_a_dropdown(
    hass: HomeAssistant,
    now: float,
) -> None:
    """Rows wrap on a phone; a dropdown cuts the creatures off (UX review 5, F3)."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    selector = result["data_schema"].schema["world"]
    assert isinstance(selector, SelectSelector)
    assert selector.config["mode"] == SelectSelectorMode.LIST
    config = await setup(hass)
    result = await config.start_reconfigure_flow(hass)
    selector = result["data_schema"].schema["world"]
    assert selector.config["mode"] == SelectSelectorMode.LIST


async def test_an_egg_cannot_be_cared_for_on_the_device_page(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    await setup(hass)  # a fresh egg
    care = ("feed", "snack", "play", "clean", "scold", "praise")
    for action in care:
        assert hass.states.get(f"button.pip_{action}").state == STATE_UNAVAILABLE


async def test_a_hatched_pet_can_be_cared_for(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    for action in ("feed", "snack", "play", "clean", "scold", "praise"):
        assert hass.states.get(f"button.pip_{action}").state != STATE_UNAVAILABLE


async def test_the_welcome_is_titled_with_the_pets_name(
    hass: HomeAssistant,
    now: float,
) -> None:
    await hass.config.async_set_time_zone("UTC")
    result = await start_add(hass, "Nutmeg")
    await hass.async_block_till_done()
    notes = persistent_notification._async_get_or_create_notifications(hass)
    note = notes[f"{DOMAIN}_{result['result'].entry_id}_welcome"]
    assert note["title"] == "Nutmeg moved in ♥"


def test_strings_and_english_translation_are_identical() -> None:
    strings = (PACKAGE / "strings.json").read_text()
    assert strings == (PACKAGE / "translations" / "en.json").read_text()
    assert (
        json.loads(strings)["config"]["error"]["name_taken"]
        == "Another pet here already has that name."
    )


def test_every_mood_and_stage_has_an_icon() -> None:
    from custom_components.virtual_pet import model

    icons = json.loads((PACKAGE / "icons.json").read_text())["entity"]["sensor"]
    assert set(icons["mood"]["state"]) == set(model.MOODS)
    assert set(icons["life_stage"]["state"]) == set(model.LIFE_STAGES)


def test_the_flow_text_has_no_stale_wording() -> None:
    text = (PACKAGE / "strings.json").read_text()
    assert "needs the integration reloaded" not in text
    assert "a fake call" not in text
    assert "Fast forward (testing)" in text
    assert "to tell only you (notes)" not in text
