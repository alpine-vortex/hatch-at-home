"""The Woodland layout belongs to the device's current pet."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
import random
from typing import Any
from unittest.mock import AsyncMock

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest

from custom_components.virtual_pet import habitat, model
from custom_components.virtual_pet.activity_support import incarnation

from .test_channel import command, pushed, subscribe
from .test_init import STORE_KEY, hatched_pet, setup


@pytest.fixture
async def companion(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> Any:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    age_hours = dict(model.R.STAGE_STARTS)["adult"] + model.R.LAY_EGG_AFTER_ADULT_HOURS
    stored = hatched_pet(
        dt_util.utcnow().timestamp(), species="bird", age_hours=age_hours
    )
    stored["data"]["bonds"] = {"viewer": {"gifts": ["acorncup"]}}
    hass_storage[STORE_KEY] = stored
    return (await setup(hass)).runtime_data


def roll_acorn(pet: Any) -> None:
    path = Path(habitat.__file__).parent / "frontend" / "worlds.json"
    finds = json.loads(path.read_text())["woodland"]["finds"]
    acorn = next(find for find in finds if find["id"] == "acorn")
    state = pet.state
    now = pet._now()
    state.next_find_at = now

    class Lucky(random.Random):
        def random(self) -> float:
            return 0.0

    assert model.roll_find(
        state,
        now,
        "2026-10-26",
        "woodland",
        [acorn],
        {},
        {"woodland": {"acorn"}},
        Lucky(),
    ) == [{"type": "found", "id": "acorn", "world": "woodland"}]


async def test_furnish_permissions_shared_updates_retry_and_reload(
    companion: Any,
    hass: HomeAssistant,
    hass_ws_client: Any,
    hass_admin_user: Any,
    hass_read_only_access_token: str,
    hass_storage: dict[str, Any],
) -> None:
    admin = await hass_ws_client(hass)
    shared = await hass_ws_client(hass, hass_read_only_access_token)
    ref = incarnation(companion)

    def layout(message: dict[str, Any]) -> dict[str, Any]:
        return message["house"]["gameplay"]["habitat"]

    async def furnish(client: Any, revision: int, *slots: str | None, **changes: Any):
        data = {
            "entity_id": "sensor.pip_life_stage",
            "pet_ref": ref,
            "action": "confirm",
            "version": 1,
            "revision": revision,
            "slots": list(slots),
        }
        return await command(client, "habitat", **(data | changes))

    empty = {"version": 1, "revision": 0, "cup": False, "slots": [None, None]}
    assert layout(await subscribe(admin)) == empty
    assert layout(await subscribe(shared, shared=True)) == empty
    assert companion.state.bonds["viewer"]["gifts"] == ["acorncup"]
    assert (await furnish(shared, 0, "hideout", None))["error"]["code"] == "forbidden"
    assert (await furnish(admin, 0, "cup", None))["result"]["result"] == "illegal"

    saved = await furnish(admin, 0, "hideout", None)
    starter = {"version": 1, "revision": 1, "cup": False, "slots": ["hideout", None]}
    assert saved["result"] == {"result": "ok", **starter}
    assert any(layout(event) == starter for event in await pushed(shared))
    assert (await furnish(admin, 0, "hideout", None))["result"] == saved["result"]
    assert (await furnish(admin, 0, None, "hideout"))["result"] == {
        "result": "changed",
        **starter,
    }

    roll_acorn(companion)
    assert (await furnish(admin, 1, "hideout", "hideout"))["result"][
        "result"
    ] == "illegal"
    for revision, slots in enumerate(
        [("hideout", "cup"), ("cup", "hideout"), ("cup", None), (None, None)], 1
    ):
        assert (await furnish(admin, revision, *slots))["result"] == {
            "result": "ok",
            "version": 1,
            "revision": revision + 1,
            "cup": True,
            "slots": list(slots),
        }
    placed = (await furnish(admin, 5, None, "cup"))["result"]
    assert placed["result"] == "ok"
    stored = hass_storage[STORE_KEY]["data"]
    assert stored["collection"]["woodland"]["finds"] == {"acorn": "2026-10-26"}
    assert stored["habitat"]["slots"] == [None, "cup"]

    entry = companion.config_entry
    assert await hass.config_entries.async_reload(entry.entry_id)
    assert habitat.view(entry.runtime_data) == {
        "version": 1,
        "revision": 6,
        "cup": True,
        "slots": [None, "cup"],
    }
    assert incarnation(entry.runtime_data) == ref


async def test_retirement_resets_slots_and_rejects_an_old_editor(
    companion: Any,
) -> None:
    roll_acorn(companion)
    ref = incarnation(companion)
    await habitat.confirm(companion, ref, 1, 0, ["cup", "hideout"])
    assert await companion.async_lay_egg()
    assert "habitat" not in companion.state.unknown
    assert await habitat.confirm(companion, ref, 1, 1, [None, None]) == {
        "result": "pet_changed"
    }
    assert habitat.view(companion) == {
        "version": 1,
        "revision": 0,
        "cup": True,
        "slots": [None, None],
    }


async def test_uncommitted_slots_are_hidden_and_failure_restores_state(
    companion: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    reached_disk = asyncio.Event()
    finish = asyncio.Event()

    async def write(*, snapshot) -> None:
        assert snapshot()["habitat"]["slots"] == ["hideout", None]
        reached_disk.set()
        await finish.wait()
        raise OSError("disk")

    save = AsyncMock(side_effect=write)
    monkeypatch.setattr(companion, "async_save_now", save)
    ref = incarnation(companion)
    original = habitat.view(companion)
    pending = asyncio.create_task(
        habitat.confirm(companion, ref, 1, 0, ["hideout", None])
    )
    await reached_disk.wait()
    assert habitat.view(companion) == original
    finish.set()
    with pytest.raises(OSError, match="disk"):
        await pending
    assert habitat.view(companion) == original
    assert "habitat" not in companion.state.unknown


def test_malformed_slots_hide_unknown_props_and_drop_duplicates() -> None:
    base = {"version": 1, "revision": 6, "ref": "life", "slots": [["cup"], "hideout"]}
    assert habitat.Layout.read(base, "life").slots == (None, "hideout")
    duplicate = base | {"slots": ["cup", "cup"]}
    assert habitat.Layout.read(duplicate, "life").view(True)["slots"] == ["cup", None]
    assert habitat.Layout.read(duplicate, "life").view(False)["slots"] == [None, None]
    assert habitat.Layout.read(base, "new").revision == 0
