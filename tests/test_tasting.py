"""Tasting uses ordinary Snack rules with incarnation-bound durable attempts."""

from __future__ import annotations

import asyncio

from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
)

from custom_components.virtual_pet import activity_support, model, tasting
from custom_components.virtual_pet.const import DOMAIN

from .test_channel import command, subscribe
from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, press


@pytest.fixture(autouse=True)
def afternoon(freezer):
    freezer.move_to("2026-11-27 14:00:00+00:00")


@pytest.fixture
async def kitchen(hass, hass_storage, hass_ws_client):
    await hass.config.async_set_time_zone("UTC")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now, species="corgi", hunger=50)
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={"name": "Pip", "world": "hearth", "new_pet": True},
        entry_id="test_pet",
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, await hass_ws_client(hass)


async def send(client, pet, action, *, recipe="apple", key="a", raw=False, **kwargs):
    response = await command(
        client,
        "tasting",
        **{
            "entity_id": "sensor.pip_life_stage",
            "pet_ref": activity_support.incarnation(pet),
            "version": tasting.VERSION,
            "action": action,
            "recipe": recipe,
            "serve_id": key * 32,
            **kwargs,
        },
    )
    if raw:
        return response
    assert response["success"], response
    return response["result"]


async def issue(client, pet, **kwargs):
    ready = await send(client, pet, "issue", **kwargs)
    assert ready["result"] == "ready"
    return ready["token"]


async def test_two_recipes_restart_retry_and_make_again(
    hass, kitchen, hass_storage, hass_ws_client, hass_admin_user, monkeypatch
):
    entry, first = kitchen
    pet = entry.runtime_data
    ref = activity_support.incarnation(pet)
    preferred = tasting._favourite(ref)
    ordinary = next(recipe for recipe in tasting.RECIPES if recipe != preferred)
    pet.state.wish = {"kind": "snack", "day": pet._today(pet._now())[0]}
    monkeypatch.setattr(model.R, "FAVOURITE_SNACK_CHANCE", 1.0)
    favourites = async_capture_events(hass, f"{DOMAIN}_favourite_snack")
    snapshot = await subscribe(first, shared=True)
    assert snapshot["house"]["gameplay"]["tasting"] == {
        "version": 1,
        "tasted": [],
        "preferred": None,
    }
    assert tasting.KEY not in getattr(pet.state, "unknown", {})
    token = await issue(first, pet, recipe=preferred)
    assert await issue(first, pet, recipe=preferred) == token
    assert tasting.view(pet)["tasted"] == []
    initial_hunger = pet.state.hunger
    result = await send(first, pet, "serve", recipe=preferred, token=token)
    assert result == {
        "recipe": preferred,
        "serve_id": "a" * 32,
        "result": "ok",
        "preferred": True,
        "recognized": False,
    }
    saved = hass_storage[STORE_KEY]["data"]
    assert saved["hunger"] == initial_hunger + model.R.SNACK_HUNGER
    assert saved["care_log"][0]["action"] == "snack"
    assert saved["wish"]["granted"] is True
    assert saved["bonds"][hass_admin_user.id]["points"] == (
        model.BOND_POINTS["care"] + model.BOND_POINTS["wish"]
    )
    assert not favourites
    # A lost response and reconnect, then a restart with the same token.
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    pet = entry.runtime_data
    second = await hass_ws_client(hass)
    assert await send(second, pet, "serve", recipe=preferred, token=token) == result
    assert pet.state.hunger == saved["hunger"]
    assert len(pet.state.care_log) == 1
    assert tasting.view(pet)["preferred"] == preferred
    token = await issue(second, pet, recipe=preferred, key="b")
    assert (await send(second, pet, "serve", recipe=preferred, key="b", token=token))[
        "recognized"
    ]
    token = await issue(second, pet, recipe=ordinary, key="c")
    result = await send(second, pet, "serve", recipe=ordinary, key="c", token=token)
    assert result["result"] == "ok"
    assert result["preferred"] is False
    assert tasting.view(pet)["tasted"] == list(tasting.RECIPES)
    await press(hass, "button.pip_snack")
    assert pet.state.hunger == initial_hunger + 4 * model.R.SNACK_HUNGER
    assert len(pet.state.care_log) == 4


async def test_false_call_begins_during_actor_lookup(
    hass, kitchen, hass_storage, monkeypatch
):
    entry, client = kitchen
    pet = entry.runtime_data
    pet.state.wish = {"kind": "snack", "day": pet._today(pet._now())[0]}
    token = await issue(client, pet)
    resolve = pet._person

    async def interrupt(context):
        person = await resolve(context)
        pet.state.call = model.Call("fake", pet._now(), pet._now() + 60)
        return person

    monkeypatch.setattr(pet, "_person", interrupt)
    care = async_capture_events(hass, f"{DOMAIN}_care")
    result = await send(client, pet, "serve", token=token)
    assert result["result"] == "spoiled"
    assert tasting.view(pet)["tasted"] == ["apple"]
    assert pet.state.call is None
    saved = hass_storage[STORE_KEY]["data"]
    assert saved["hunger"] == 50 + model.R.SNACK_HUNGER
    assert saved["care_log"][0]["result"] == "spoiled"
    assert saved["bonds"] == {}
    assert not saved["wish"].get("granted")
    assert [event.data["result"] for event in care] == ["spoiled"]


@pytest.mark.parametrize("refusal", ["full", "asleep"])
async def test_refusals_leave_the_recipe_undiscovered(kitchen, refusal):
    entry, client = kitchen
    pet = entry.runtime_data
    token = await issue(client, pet)
    if refusal == "full":
        pet.state.hunger = model.R.FEED_FULL_AT
    else:
        pet.state.asleep = True
    assert (await send(client, pet, "serve", token=token))["result"] == refusal
    assert tasting.view(pet)["tasted"] == []
    assert pet.state.care_log[0]["result"] == refusal
    pet.state.hunger = 50
    pet.state.asleep = False
    assert (await send(client, pet, "serve", token=token))["result"] == refusal
    assert len(pet.state.care_log) == 1


async def test_authorization_expiry_and_bound_receipts(
    hass, kitchen, hass_ws_client, hass_read_only_access_token, monkeypatch, freezer
):
    entry, client = kitchen
    pet = entry.runtime_data
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    assert (await send(reader, pet, "issue", raw=True))["error"]["code"] == "forbidden"
    _, token = await a_user(hass)
    other = await hass_ws_client(hass, token)
    monkeypatch.setattr(tasting, "MAX_ATTEMPTS", 1)
    token = await issue(client, pet)
    assert (await send(other, pet, "serve", token=token))["result"] == "not_now"
    assert (await send(client, pet, "serve", recipe="pumpkin", token=token))[
        "result"
    ] == "not_now"
    assert (await send(client, pet, "issue", key="b"))["result"] == "busy"
    assert (await send(client, pet, "serve", token="0" * 32))["result"] == "expired"
    freezer.tick(tasting.RETRY_SECONDS)
    assert (await send(client, pet, "serve", token=token))["result"] == "expired"
    assert not pet.state.care_log
    assert await issue(client, pet, key="b") != token
    assert (await send(client, pet, "serve", pet_ref="0" * 32, token=token))[
        "result"
    ] == "pet_changed"


async def test_pending_write_blocks_snack_and_failed_write_reflushes_once(
    hass, kitchen, hass_storage, hass_admin_user, monkeypatch
):
    entry, client = kitchen
    pet = entry.runtime_data
    token = await issue(client, pet)
    write = pet.async_save_now
    entered = asyncio.Event()
    release = asyncio.Event()
    writes = 0

    async def fail_once():
        nonlocal writes
        writes += 1
        if writes == 1:
            entered.set()
            await release.wait()
            raise OSError("writes interrupted")
        await write()

    monkeypatch.setattr(pet, "async_save_now", fail_once)
    care = async_capture_events(hass, f"{DOMAIN}_care")

    async def accepted():
        return await tasting.act(
            pet,
            activity_support.incarnation(pet),
            "serve",
            "apple",
            "a" * 32,
            hass_admin_user.id,
            token,
            lambda: True,
        )

    serve = asyncio.create_task(accepted())
    await entered.wait()
    ordinary = asyncio.create_task(pet.async_action("snack", None))
    await asyncio.sleep(0)
    assert not ordinary.done()
    assert care == []
    assert hass_storage[STORE_KEY]["data"]["hunger"] == 50
    release.set()
    with pytest.raises(OSError):
        await serve
    assert await ordinary == "ok"
    assert (await accepted())["result"] == "ok"
    assert (await accepted())["result"] == "ok"
    assert writes == 2
    assert pet.state.hunger == 50 + 2 * model.R.SNACK_HUNGER
    assert hass_storage[STORE_KEY]["data"]["hunger"] == pet.state.hunger
    assert len(pet.state.care_log) == 2
    await hass.async_block_till_done()
    assert [event.data["result"] for event in care] == ["ok", "ok"]
