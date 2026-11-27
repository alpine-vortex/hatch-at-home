"""Tidepool checkpoints, durable endings and the household websocket."""

from __future__ import annotations

import asyncio
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.virtual_pet import activity_support, model, outing
from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet


@pytest.fixture
async def tidepool(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> MockConfigEntry:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    await hass.config.async_set_time_zone("UTC")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now, species="otter")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={"name": "Pip", "world": "tidepool", "new_pet": True},
        entry_id="test_pet",
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def send(client, ref: str, action: str, revision: int | None = None) -> dict:
    msg = {
        "type": "virtual_pet/outing",
        "entity_id": "sensor.pip_mood",
        "pet_ref": ref,
        "action": action,
    }
    if revision is not None:
        msg.update(version=1, revision=revision)
    await client.send_json_auto_id(msg)
    return await client.receive_json()


async def test_both_routes_resume_and_keep_one_memory_after_restart(
    hass, tidepool, hass_ws_client, hass_read_only_access_token, hass_storage
):
    pet = tidepool.runtime_data
    ref = activity_support.incarnation(pet)
    first = await hass_ws_client(hass)
    other = await hass_ws_client(hass)
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    assert (await send(first, ref, "view"))["result"]["node"] == "landing"
    assert (await send(reader, ref, "view"))["result"]["revision"] == 0
    assert (await send(reader, ref, "walk", 0))["success"] is False
    assert (await send(first, ref, "walk", 0))["result"]["node"] == "fork"
    assert (await send(other, ref, "view"))["result"]["node"] == "fork"
    assert (await send(other, ref, "pool", 1))["result"]["node"] == "pool_edge"
    assert (await send(first, ref, "ridge", 1))["result"]["result"] == "changed"
    assert (await send(first, ref, "look", 2))["result"]["node"] == "pool_early"
    assert (await send(first, ref, "wait", 3))["result"]["node"] == "pool_signal"

    assert await hass.config_entries.async_reload(tidepool.entry_id)
    await hass.async_block_till_done()
    pet = tidepool.runtime_data
    assert activity_support.incarnation(pet) == ref
    assert (await send(other, ref, "view"))["result"]["node"] == "pool_signal"
    assert (await send(other, ref, "look", 4))["result"]["node"] == "pool_ending"
    ending = (await send(other, ref, "return", 5))["result"]
    assert ending["completed"] == "pool" and ending["node"] == "landing"
    assert hass_storage[STORE_KEY]["data"]["outing"]["node"] is None

    assert await hass.config_entries.async_reload(tidepool.entry_id)
    await hass.async_block_till_done()
    pet = tidepool.runtime_data
    assert (await send(first, ref, "return", 5))["result"] == ending
    assert pet.state.memories[-1]["generation"] == pet.state.generation
    assert pet.state.memories[-1]["born"] == pet.state.born

    # A previously collected piece does not replace the story or its memory.
    page = pet.state.collection.setdefault("tidepool", {"visitors": {}, "finds": {}})
    page["finds"]["greenseaglass"] = "2026-10-22"
    before = list(pet.state.basket)
    for rev, action, node in (
        (6, "walk", "fork"),
        (7, "ridge", "ridge"),
        (8, "low", "ridge_empty"),
        (9, "high", "ridge_ending"),
        (10, "return", "landing"),
        (11, "walk", "fork"),
        (12, "ridge", "ridge"),
        (13, "high", "ridge_ending"),
        (14, "return", "landing"),
        (15, "walk", "fork"),
        (16, "pool", "pool_edge"),
        (17, "wait", "pool_signal"),
        (18, "look", "pool_ending"),
        (19, "return", "landing"),
    ):
        assert (await send(other, ref, action, rev))["result"]["node"] == node
    assert page["finds"]["greenseaglass"] == "2026-10-22"
    assert pet.state.basket == before
    memories = [m for m in pet.state.memories if m["kind"].startswith("outing_")]
    assert [m["kind"] for m in memories] == ["outing_pool", "outing_ridge"]

    assert (await send(first, ref, "walk", 20))["result"]["node"] == "fork"
    # A replacement save can use the same generation number.
    pet.state = model.PetState.from_dict(
        {**pet.state.to_dict(), "born": pet.state.born + 1}
    )
    newer = activity_support.incarnation(pet)
    assert newer != ref
    assert (await send(other, ref, "view"))["result"]["result"] == "pet_changed"
    assert (await send(other, newer, "view"))["result"]["node"] == "landing"
    assert [
        m for m in pet.state.memories if m["kind"].startswith("outing_")
    ] == memories


def test_unknown_graph_version_keeps_first_completions_and_ignores_bad_values():
    data = {
        "version": 19,
        "ref": "pet",
        "revision": 15,
        "node": ["pool_edge"],
        "seen": [None, "pool", "unknown"],
    }
    assert outing.Checkpoint.read(data, "pet") == outing.Checkpoint(
        revision=15, seen=("pool",)
    )
    assert outing.Checkpoint.read(data, "other") == outing.Checkpoint()
    data.update(version=1, revision=True, node="ridge_ending")
    assert outing.Checkpoint.read(data, "pet") == outing.Checkpoint(seen=("pool",))


async def test_slow_ending_waits_for_save_and_retries_once(tidepool, monkeypatch):
    pet = tidepool.runtime_data
    ref = activity_support.incarnation(pet)
    for rev, action in enumerate(("walk", "ridge", "high")):
        await outing.act(pet, ref, action, rev, 1)
    original = pet.async_save_now
    started = asyncio.Event()
    finish = asyncio.Event()
    writes = 0

    async def delayed():
        nonlocal writes
        writes += 1
        started.set()
        await finish.wait()
        await original()

    monkeypatch.setattr(pet, "async_save_now", delayed)
    async with asyncio.TaskGroup() as jobs:
        first = jobs.create_task(outing.act(pet, ref, "return", 3, 1))
        await started.wait()
        repeat = jobs.create_task(outing.act(pet, ref, "return", 3, 1))
        assert not first.done() and not repeat.done()
        finish.set()
    assert writes == 1
    assert first.result() == repeat.result()
    assert first.result()["completed"] == "ridge"
    assert [m["kind"] for m in pet.state.memories].count("outing_ridge") == 1
    assert pet.state.collection["tidepool"]["finds"]["greenseaglass"] == "2026-10-26"
    assert all(row["id"] != "greenseaglass" for row in pet.state.basket)


async def test_failed_write_keeps_ending_ready_to_retry(tidepool, monkeypatch):
    pet = tidepool.runtime_data
    ref = activity_support.incarnation(pet)
    for rev, action in enumerate(("walk", "ridge", "high")):
        await outing.act(pet, ref, action, rev, 1)

    async def failed():
        raise OSError("disk unavailable")

    with monkeypatch.context() as patch:
        patch.setattr(pet, "async_save_now", failed)
        with pytest.raises(OSError, match="disk unavailable"):
            await outing.act(pet, ref, "return", 3, 1)
    assert (await outing.act(pet, ref, "view"))["node"] == "ridge_ending"
    assert all(m["kind"] != "outing_ridge" for m in pet.state.memories)
    assert "greenseaglass" not in pet.state.collection.get("tidepool", {}).get(
        "finds", {}
    )
    assert (await outing.act(pet, ref, "return", 3, 1))["completed"] == "ridge"
