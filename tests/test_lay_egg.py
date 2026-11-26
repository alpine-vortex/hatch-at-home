"""The card's egg choices through the Home Assistant websocket."""

import asyncio
from typing import Any

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest

from custom_components.virtual_pet.const import CONF_EGG_SEED, CONF_NEXT_WORLD, DOMAIN

from .test_channel import command
from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, setup

STAGE = "sensor.pip_life_stage"
REQUEST = "a" * 32


@pytest.fixture
async def parent(hass: HomeAssistant, freezer: Any, hass_storage: dict) -> Any:
    freezer.move_to("2026-11-02 09:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    age = 21 * 24 + 1
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        age_hours=age,
        born=now - age * 3600,
        species="bird",
        raised=["bird"],
        traits=["music_lover"],
        egg_choice="bird",
    )
    return await setup(hass)


async def lay(client: Any, *, generation: int = 1, **data: Any) -> dict:
    return await command(
        client, "lay_egg", entity_id=STAGE, generation=generation, **data
    )


async def test_separate_shell_keeps_the_parent_and_survives_reload(
    hass: HomeAssistant, parent: Any, hass_ws_client: Any
) -> None:
    pet = parent.runtime_data
    state = pet.state
    parent_data = dict(parent.data)
    client = await hass_ws_client(hass)
    second_client = await hass_ws_client(hass)
    replies = await asyncio.gather(
        lay(client, request_id=REQUEST, species="squirrel"),
        lay(second_client, request_id=REQUEST, species="squirrel"),
    )
    assert any(r["success"] for r in replies), replies
    assert all(r["success"] or r["error"]["code"] == "egg_pending" for r in replies)
    reply = next(r for r in replies if r["success"])
    await hass.async_block_till_done()
    child = next(
        e for e in hass.config_entries.async_entries(DOMAIN) if e is not parent
    )
    assert child.state is ConfigEntryState.LOADED
    assert reply["result"] == {"name": child.title}
    assert child.title != parent.title
    assert CONF_EGG_SEED not in child.data
    assert pet.state is state and hass.states.get(STAGE).state == "adult"
    assert state.generation == 1 and state.egg_choice == "bird" and not state.journal
    assert dict(parent.data) == parent_data

    def check_egg() -> None:
        egg = child.runtime_data.state
        assert egg.species is None and egg.generation == 1 and not egg.journal
        assert egg.egg_choice == "squirrel"
        assert egg.inherited_from == "music_lover"

    check_egg()
    assert await hass.config_entries.async_reload(child.entry_id)
    await hass.async_block_till_done()
    check_egg()
    assert (await lay(client, request_id=REQUEST, species="squirrel"))[
        "result"
    ] == reply["result"]
    assert len(hass.config_entries.async_entries(DOMAIN)) == 2


async def test_retirement_checks_generation_and_persists_the_chosen_egg(
    hass: HomeAssistant, parent: Any, hass_ws_client: Any
) -> None:
    client = await hass_ws_client(hass)
    assert (await lay(client, generation=2))["error"]["code"] == "not_now"
    assert (await lay(client, species="not-a-species"))["error"][
        "code"
    ] == "bad_species"
    assert parent.runtime_data.state.egg_choice == "bird"
    assert (await lay(client, species=None))["success"]
    egg = parent.runtime_data.state
    assert egg.species is None and egg.egg_choice is None and egg.generation == 2
    assert [r["species"] for r in egg.journal] == ["bird"]
    assert (await lay(client))["error"]["code"] == "not_now"
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1


async def test_separate_shell_uses_a_waiting_world_and_requires_an_admin(
    hass: HomeAssistant, parent: Any, hass_ws_client: Any
) -> None:
    _, token = await a_user(hass)
    client = await hass_ws_client(hass, token)
    assert (await lay(client, request_id=REQUEST))["error"]["code"] == "admin_required"
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1

    hass.config_entries.async_update_entry(
        parent, data={**parent.data, CONF_NEXT_WORLD: "tidepool"}
    )
    assert await hass.config_entries.async_reload(parent.entry_id)
    client = await hass_ws_client(hass)
    reply = await lay(client, request_id=REQUEST)
    assert reply["success"], reply
    child = next(
        e for e in hass.config_entries.async_entries(DOMAIN) if e is not parent
    )
    assert child.runtime_data.world == "tidepool"
    assert parent.runtime_data.world == "woodland"
    assert parent.data[CONF_NEXT_WORLD] == "tidepool"
