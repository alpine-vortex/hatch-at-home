"""The linked egg, the ordinary tuck and its live child-only echo."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.const import STATE_ON
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import activity_support, family_bedtime, model
from custom_components.virtual_pet.const import CONF_EGG_SEED, DOMAIN

from .test_channel import command, pushed, subscribe
from .test_init import STORE_KEY, hatched_pet, setup


@pytest.fixture(autouse=True)
def evening_clock(freezer):
    freezer.move_to("2026-11-26 23:00:00+00:00")


@pytest.fixture
async def linked(hass, hass_storage, hass_ws_client):
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now, species="bird", age_hours=505)
    parent_entry = await setup(hass)
    client = await hass_ws_client(hass)
    response = await command(
        client,
        "lay_egg",
        entity_id="sensor.pip_life_stage",
        generation=1,
        species="fox",
        request_id="a" * 32,
    )
    assert response["success"], response
    child_entry = next(
        e
        for e in hass.config_entries.async_entries(DOMAIN)
        if e.entry_id != parent_entry.entry_id
    )
    assert CONF_EGG_SEED not in child_entry.data
    assert child_entry.runtime_data.state.age_hours == 0
    key = f"{DOMAIN}.{child_entry.entry_id}"
    row = hass_storage[key]["data"]["family_bedtime"]
    assert row["parent"] == family_bedtime.parent_seed(parent_entry.runtime_data)
    assert await hass.config_entries.async_reload(child_entry.entry_id)
    await hass.async_block_till_done()
    child = child_entry.runtime_data
    assert family_bedtime.record(child) == row
    assert family_bedtime.view(child) is None
    await child.async_fast_forward(0.51)
    assert model.life_stage(child.state) == "baby" and child.state.species == "fox"
    return parent_entry, child_entry, client, key


async def send(client, child, action, request="b", **overrides):
    return await command(
        client,
        "family_bedtime",
        **{
            "entity_id": "sensor.fern_life_stage",
            "pet_ref": activity_support.incarnation(child),
            "request_id": request * 32,
            "action": action,
            **overrides,
        },
    )


async def test_link_survives_egg_reload_and_sleep_and_echo_are_saved(
    hass,
    linked,
    hass_ws_client,
    hass_read_only_access_token,
    hass_storage,
    hass_admin_user,
):
    parent_entry, child_entry, first, key = linked
    child = child_entry.runtime_data
    parent = parent_entry.runtime_data
    assert await parent.async_set_lights_out(True) == "ok"
    before = parent.state.to_dict()
    second = await hass_ws_client(hass)
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    snapshot = await subscribe(second, shared=True, entity_id="sensor.fern_life_stage")
    assert snapshot["house"]["gameplay"]["family_bedtime"] == {"offer": True}
    assert (await send(reader, child, "invite"))["error"]["code"] == "forbidden"
    art = await send(first, child, "invite")
    assert art["result"] == {
        "result": "ok",
        "parent": {"species": "bird", "asleep": True},
    }

    child.state.wish = {"kind": "tuck_in", "day": child._today(child._now())[0]}
    fell_asleep = async_capture_events(hass, f"{DOMAIN}_fell_asleep")
    assert (await send(first, child, "tuck"))["result"] == {"result": "ok"}
    assert hass.states.get("binary_sensor.fern_asleep").state == STATE_ON
    saved = hass_storage[key]["data"]
    assert saved["asleep"] is True and saved["lights_out"] is True
    assert saved["family_bedtime"]["completed"] == "b" * 32
    assert saved["bonds"][hass_admin_user.id]["tucked_at"] == child._now()
    assert saved["wish"]["granted"] is True
    assert parent.state.to_dict() == before
    assert any(
        "family_bedtime" not in msg["house"]["gameplay"]
        for msg in await pushed(second)
        if "house" in msg
    )
    assert (await send(first, child, "tuck"))["result"] == {"result": "ok"}
    assert (await send(second, child, "tuck", "c"))["result"] == {"result": "completed"}
    assert len(fell_asleep) == 1

    await child.async_set_lights_out(False)
    assert await child.async_set_lights_out(True) == "ok"
    messages = await pushed(second)
    echoes = [
        msg["moment"]
        for msg in messages
        if msg.get("moment", {}).get("type") == "family_bedtime_echo"
    ]
    assert len(echoes) == 1
    assert echoes[0]["id"] == activity_support.incarnation(child)
    assert hass_storage[key]["data"]["family_bedtime"]["echoed"] is True
    await child.async_set_lights_out(False)
    await child.async_set_lights_out(True)
    assert not any(
        msg.get("moment", {}).get("type") == "family_bedtime_echo"
        for msg in await pushed(second)
    )
    assert await hass.config_entries.async_reload(child_entry.entry_id)
    await hass.async_block_till_done()
    snapshot = (await pushed(second))[-1]
    assert all(m.get("type") != "family_bedtime_echo" for m in snapshot["moments"])


async def test_cancel_refusal_and_ordinary_tuck_preserve_invite(linked, freezer):
    _, child_entry, client, _ = linked
    child = child_entry.runtime_data
    # Merely inviting makes no lasting change, as though the window was closed.
    freezer.move_to("2026-11-26 18:30:00+00:00")
    child.state.last_updated = child._now()
    child.state.energy = 100
    await send(client, child, "invite", "b")
    assert (await send(client, child, "invite", "c"))["result"]["result"] == "ok"
    assert (await send(client, child, "tuck", "c"))["result"] == {
        "result": "not_sleepy"
    }
    assert "completed" not in family_bedtime.record(child)
    assert not child.state.asleep
    freezer.move_to("2026-11-26 23:00:00+00:00")
    child.state.last_updated = child._now()
    await child.async_set_lights_out(True)
    assert (await send(client, child, "tuck"))["result"] == {"result": "not_now"}
    assert "completed" not in family_bedtime.record(child)
    await child.async_set_lights_out(False)
    assert (await send(client, child, "tuck"))["result"] == {"result": "ok"}


@pytest.mark.parametrize("change", ("retire", "replace", "remove", "permission"))
async def test_parent_must_still_be_readable_and_same_adult(
    hass, linked, change, hass_admin_user
):
    parent_entry, child_entry, client, _ = linked
    parent = parent_entry.runtime_data
    child = child_entry.runtime_data
    ref = activity_support.incarnation(parent)
    assert (await send(client, child, "invite"))["result"]["result"] == "ok"
    if change == "retire":
        assert await parent.async_lay_egg()
    elif change == "replace":
        parent.state = model.PetState.from_dict(
            {**parent.state.to_dict(), "born": parent.state.born + 1}
        )
        assert parent.state.generation == 1
        assert activity_support.incarnation(parent) != ref
    elif change == "remove":
        await hass.config_entries.async_remove(parent_entry.entry_id)
    else:
        permissions = SimpleNamespace(
            check_entity=lambda entity, policy: (
                (entity, policy) != ("sensor.pip_life_stage", POLICY_READ)
            )
        )
        connection = SimpleNamespace(
            user=SimpleNamespace(id=hass_admin_user.id, permissions=permissions)
        )
        result = await family_bedtime._act(
            hass,
            connection,
            {
                "entity_id": "sensor.fern_life_stage",
                "pet_ref": activity_support.incarnation(child),
                "request_id": "b" * 32,
                "action": "tuck",
            },
            child,
        )
        assert result == {"result": "unavailable"}
        assert not child.state.asleep
        return
    assert family_bedtime.view(child) is None
    assert (await send(client, child, "tuck"))["result"] == {"result": "unavailable"}
    assert not child.state.asleep


async def test_tuck_waits_for_save_and_serializes_ordinary_lights(
    hass, linked, hass_ws_client, monkeypatch
):
    _, child_entry, first, _ = linked
    child = child_entry.runtime_data
    second = await hass_ws_client(hass)
    original = child.async_save_now
    started = asyncio.Event()
    finish = asyncio.Event()
    writes = 0

    async def delayed():
        nonlocal writes
        writes += 1
        started.set()
        await finish.wait()
        await original()

    monkeypatch.setattr(child, "async_save_now", delayed)
    async with asyncio.TaskGroup() as jobs:
        first_tuck = jobs.create_task(send(first, child, "tuck"))
        await started.wait()
        same_tuck = jobs.create_task(send(second, child, "tuck"))
        wake = jobs.create_task(child.async_set_lights_out(False))
        assert not first_tuck.done() and not same_tuck.done() and not wake.done()
        assert hass.states.get("binary_sensor.fern_asleep").state != STATE_ON
        finish.set()
    assert (
        first_tuck.result()["result"]
        == same_tuck.result()["result"]
        == {"result": "ok"}
    )
    assert writes == 1
    assert not child.state.asleep


async def test_parent_identity_is_rechecked_after_looking_up_actor(linked, monkeypatch):
    parent_entry, child_entry, client, _ = linked
    parent = parent_entry.runtime_data
    child = child_entry.runtime_data
    assert (await send(client, child, "invite"))["result"]["result"] == "ok"
    original = child._person

    async def swapped(context):
        assert await parent.async_lay_egg()
        return await original(context)

    monkeypatch.setattr(child, "_person", swapped)
    assert (await send(client, child, "tuck"))["result"] == {"result": "not_now"}
    assert not child.state.asleep
    assert "completed" not in family_bedtime.record(child)


async def test_offer_uses_the_first_seven_simulated_days_and_evening_hours(
    linked, freezer
):
    _, child_entry, client, _ = linked
    child = child_entry.runtime_data
    child.state.age_hours = 24 * 7 + 0.49
    assert family_bedtime.view(child) == {"offer": True}
    child.state.age_hours = 24 * 7 + 0.5
    assert family_bedtime.view(child) is None
    child.state.age_hours = 1
    freezer.move_to("2026-11-26 17:59:00+00:00")
    assert (await send(client, child, "invite"))["result"] == {"result": "not_now"}
    freezer.move_to("2026-11-26 18:00:00+00:00")
    assert (await send(client, child, "invite"))["result"]["result"] == "ok"


async def test_failed_save_restores_the_hatchling_and_can_retry(
    hass, linked, monkeypatch
):
    _, child_entry, client, _ = linked
    child = child_entry.runtime_data
    fell_asleep = async_capture_events(hass, f"{DOMAIN}_fell_asleep")

    async def failed():
        raise OSError("disk unavailable")

    with monkeypatch.context() as patch:
        patch.setattr(child, "async_save_now", failed)
        rejected = await send(client, child, "tuck")
    assert rejected["success"] is False
    assert not child.state.asleep and not child.state.lights_out
    assert "completed" not in family_bedtime.record(child)
    assert fell_asleep == []
    assert (await send(client, child, "tuck"))["result"] == {"result": "ok"}
    assert len(fell_asleep) == 1
