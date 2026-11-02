"""The card's rename (virtual_pet/rename): naming the new generation in its first day."""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from homeassistant.config_entries import ConfigEntryDisabler, ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.util import dt as dt_util
import pytest

from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.coordinator import RenameError, clean_name

from .test_channel import command
from .test_forget import a_user, add_moss
from .test_init import STORE_KEY, hatched_pet, press, setup

STAGE = "sensor.pip_life_stage"
EGG = {"entity_id": STAGE}


@pytest.fixture
def now(freezer: Any) -> float:
    freezer.move_to("2026-11-02 09:00:00+00:00")
    return dt_util.utcnow().timestamp()


def device(hass: HomeAssistant, entry_id: str = "test_pet") -> dr.DeviceEntry:
    found = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, entry_id), entry_id
    )
    assert found is not None
    return found


async def rename(client: Any, name: Any, entity: str = STAGE) -> dict[str, Any]:
    return await command(client, "rename", entity_id=entity, name=name)


async def test_a_rename_writes_the_title_device_and_state_with_no_reload(
    hass: HomeAssistant, now: float, hass_ws_client: Any
) -> None:
    config = await setup(hass)  # a fresh egg
    dr.async_get(hass).async_update_device(device(hass).id, name_by_user="Admin's pet")
    await hass.async_block_till_done()
    assert hass.states.get(STAGE).attributes["friendly_name"].startswith("Admin's pet")
    pet = config.runtime_data
    client = await hass_ws_client(hass)
    with (
        patch.object(hass.config_entries, "async_reload") as reload,
        patch.object(hass.config_entries, "async_schedule_reload") as schedule,
        patch.object(pet.store, "async_delay_save") as save,
    ):
        reply = await rename(client, "  Fern \t".strip())
        await hass.async_block_till_done()
    assert reply["success"] and reply["result"] == {"name": "Fern"}
    assert not reload.called and not schedule.called
    assert save.called  # saved
    assert config.runtime_data is pet and config.state is ConfigEntryState.LOADED
    assert config.title == "Fern" and config.data["name"] == "Fern"
    assert device(hass).name == "Fern" and device(hass).name_by_user is None
    assert pet.state.name == "Fern"
    # Entity IDs stay; the state's name (what the card shows) follows at once.
    assert hass.states.get(STAGE).attributes["friendly_name"].startswith("Fern")
    assert hass.states.get("sensor.pip_mood") is not None


async def test_a_name_is_made_tidy(
    hass: HomeAssistant, now: float, hass_ws_client: Any
) -> None:
    await setup(hass)
    client = await hass_ws_client(hass)
    reply = await rename(client, "  Mo   sś  ")  # inner spaces, a combining mark
    assert reply["result"] == {"name": "Mo sś".replace("ś", "ś")}
    assert clean_name("x" * 20) == "x" * 20


@pytest.mark.parametrize(
    "bad",
    ["x" * 21, "", "   ", "a\x00b", "a\nb", "a\tb", "a b", 12, None, ["Fern"]],
)
async def test_a_bad_name_is_refused(
    hass: HomeAssistant, now: float, hass_ws_client: Any, bad: Any
) -> None:
    config = await setup(hass)
    client = await hass_ws_client(hass)
    reply = await rename(client, bad)
    assert reply["error"]["code"] == "bad_name"
    assert config.title == "Pip"
    with pytest.raises(RenameError):
        clean_name(bad)


async def test_another_pets_name_is_taken_in_any_case(
    hass: HomeAssistant, now: float, hass_ws_client: Any
) -> None:
    config = await setup(hass)
    moss = await add_moss(hass)
    client = await hass_ws_client(hass)
    reply = await rename(client, "mOsS")
    assert reply["error"]["code"] == "taken"
    # A pet titled "Moss" that an admin shows as "Bog" goes by "Bog" (names.py,
    # UX fix 5): that is taken, and the title it was renamed from is free again.
    dr.async_get(hass).async_update_device(
        device(hass, moss.entry_id).id, name_by_user="Bog"
    )
    await hass.async_block_till_done()
    moss.runtime_data._sync_name()  # the next tick would
    assert moss.runtime_data.state.name == "Bog"
    assert (await rename(client, "bog"))["error"]["code"] == "taken"
    assert config.title == "Pip"
    # Its own current name is fine, and so is a case change of it.
    assert (await rename(client, "Pip"))["result"] == {"name": "Pip"}
    assert (await rename(client, "pip"))["result"] == {"name": "pip"}
    assert config.title == "pip"


async def test_a_pet_titled_fern_shown_as_bog_blocks_bog_only(
    hass: HomeAssistant, now: float, hass_ws_client: Any
) -> None:
    await setup(hass)
    fern = await add_moss(hass)
    hass.config_entries.async_update_entry(fern, title="Fern")
    dr.async_get(hass).async_update_device(
        device(hass, fern.entry_id).id, name_by_user="Bog"
    )
    await hass.async_block_till_done()
    fern.runtime_data._sync_name()
    assert fern.runtime_data.state.name == "Bog"
    client = await hass_ws_client(hass)
    assert (await rename(client, "Bog"))["error"]["code"] == "taken"
    # The title it was renamed from is free (UX fix 5): nobody calls it that now.
    assert (await rename(client, "Fern"))["success"]
    # Its own name is its own: it may keep it (a no-op) while still an egg.
    reply = await rename(client, "Bog", "sensor.moss_life_stage")
    assert reply["success"] and fern.title == "Bog"


async def test_only_a_new_egg_or_baby_can_be_named(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)  # 30 hours: a child
    config = await setup(hass)
    client = await hass_ws_client(hass)
    reply = await rename(client, "Fern")
    assert reply["error"]["code"] == "not_now"
    assert config.title == "Pip" and device(hass).name == "Pip"


async def test_a_baby_can_be_named(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(
        now, age_hours=5.0, born=now - 5 * 3600, species="bird"
    )
    config = await setup(hass)
    assert hass.states.get(STAGE).state == "baby"
    client = await hass_ws_client(hass)
    assert (await rename(client, "Fern"))["success"]
    assert config.title == "Fern"


async def test_an_unknown_or_foreign_entity_is_no_pet(
    hass: HomeAssistant, now: float, hass_ws_client: Any
) -> None:
    await setup(hass)
    hass.states.async_set("light.lamp", "on")
    client = await hass_ws_client(hass)
    for entity in ("sensor.nobody_life_stage", "light.lamp"):
        assert (await rename(client, "Fern", entity))["error"]["code"] == "no_pet"


async def test_a_read_only_login_cannot_name_the_pet(
    hass: HomeAssistant,
    now: float,
    hass_ws_client: Any,
    hass_read_only_user: Any,
    hass_read_only_access_token: str,
) -> None:
    config = await setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    reply = await rename(client, "Fern")
    assert reply["error"]["code"] == "read_only"
    assert config.title == "Pip" and device(hass).name == "Pip"
    # Any other logged-in person may.
    _, token = await a_user(hass)
    assert (await rename(await hass_ws_client(hass, token), "Fern"))["success"]


async def test_a_disabled_entry_is_no_pet_and_a_reloading_one_is_not_ready(
    hass: HomeAssistant, now: float, hass_ws_client: Any
) -> None:
    config = await setup(hass)
    client = await hass_ws_client(hass)
    assert await hass.config_entries.async_unload(config.entry_id)
    await hass.async_block_till_done()
    reply = await rename(client, "Fern")
    assert reply["error"]["code"] == "not_ready"  # retryable
    assert config.title == "Pip"
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    assert (await rename(client, "Fern"))["success"]
    await hass.config_entries.async_set_disabled_by(
        config.entry_id, ConfigEntryDisabler.USER
    )
    await hass.async_block_till_done()
    assert (await rename(client, "Rowan"))["error"]["code"] == "no_pet"


async def test_a_rename_after_a_lay_that_moves_the_world_waits_then_sticks(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    age = 14 * 24 + 7 * 24 + 1.0
    hass_storage[STORE_KEY] = hatched_pet(
        now, age_hours=age, born=now - age * 3600, species="bird", raised=["bird"]
    )
    config = await setup(hass)
    hass.config_entries.async_update_entry(
        config, data={**config.data, "next_world": "pond"}
    )
    await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass)

    await press(hass, "button.pip_lay_egg")
    # The reload is scheduled, not yet run: the entities are on their way out.
    reply = await rename(client, "Fern")
    assert reply["error"]["code"] == "not_ready"
    await hass.async_block_till_done()
    assert config.data["world"] == "pond" and config.state is ConfigEntryState.LOADED
    assert hass.states.get(STAGE).state == "egg"
    assert (await rename(client, "Fern"))["success"]
    await hass.async_block_till_done()
    assert config.title == "Fern" and config.data["name"] == "Fern"
    assert config.data["world"] == "pond"
    # A save keeps it, and the journal keeps the old generation's name.
    pet = config.runtime_data
    await pet.async_save_now()
    saved = hass_storage[STORE_KEY]["data"]
    assert saved["name"] == "Fern"
    assert [r["name"] for r in saved["journal"]] == ["Pip"]
    assert hass.states.get(STAGE).attributes["journal"][0]["name"] == "Pip"
