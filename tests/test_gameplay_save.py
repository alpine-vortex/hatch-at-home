"""Required gameplay saves share the ordinary writer and surface IO failures."""

from __future__ import annotations

import asyncio
from typing import Any

from homeassistant.core import HomeAssistant
import pytest

from custom_components.virtual_pet import rates
from custom_components.virtual_pet.coordinator import PetStore
from custom_components.virtual_pet.saving import CappedSave


async def test_capped_save_reads_after_a_gameplay_commit(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = PetStore(hass, 1, "virtual_pet.gameplay")
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    writes = []
    current = {"move": 0, "hunger": 80}

    async def write(record: dict[str, Any]) -> None:
        writes.append(record["data"].copy())
        if len(writes) == 1:
            first_started.set()
            await release_first.wait()

    monkeypatch.setattr(store, "_async_write_data", write)
    monkeypatch.setattr(rates, "SAVE_MAX_DELAY", 0)

    async def move() -> None:
        await store.async_save_required(lambda: {**current, "move": 1})
        current["move"] = 1

    commit = asyncio.create_task(move())
    await first_started.wait()
    saver = CappedSave(hass, store, current.copy, flush=store.async_save_capped)
    saver.save()
    current["hunger"] = 65
    saver.save()
    assert writes == [{"move": 1, "hunger": 80}]
    release_first.set()
    await commit
    await hass.async_block_till_done()
    assert writes == [{"move": 1, "hunger": 80}, {"move": 1, "hunger": 65}]


async def test_required_save_surfaces_a_write_failure(
    hass: HomeAssistant, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = PetStore(hass, 1, "virtual_pet.gameplay")

    async def write(record: dict[str, Any]) -> None:
        raise OSError("write failed")

    monkeypatch.setattr(store, "_async_write_data", write)
    with pytest.raises(OSError, match="write failed"):
        await store.async_save_required(lambda: {"move": 1})
