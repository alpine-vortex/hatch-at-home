"""virtual_pet.hop with game "crate-push", action board (crate-push plan slice 2,
docs/plan-2026-11-08-crate-push.md): a pure, read-only board per (pet, day,
world, level, round). The reply, the rounds, the refusals, the schema, and that
nothing is written. Settle is slice 4."""

from __future__ import annotations

from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
import voluptuous as vol

from custom_components.virtual_pet import crate_push as S
from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet, setup

PET = "button.pip_feed"


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def call(hass: HomeAssistant, **data: Any) -> dict[str, Any]:
    return await hass.services.async_call(
        DOMAIN,
        "hop",
        {"entity_id": PET, "action": "board", "game": "crate-push", **data},
        blocking=True,
        return_response=True,
    )


async def ready(hass, now, hass_storage, **stats):
    hass_storage[STORE_KEY] = hatched_pet(now, **stats)
    await setup(hass)


async def test_reply_shape_and_no_pet_id(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    reply = await call(hass, level="easy")
    assert reply["result"] == "ok" and reply["game"] == "crate-push"
    assert (reply["level"], reply["round"], reply["day"]) == ("easy", 1, "2026-10-26")
    assert {"w", "h", "grid", "par", "id"} <= set(reply)
    assert "test_pet" not in str(reply)


async def test_same_everywhere_and_rounds_differ(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    a, b = await call(hass, level="normal"), await call(hass, level="normal")
    assert a == b
    r2 = await call(hass, level="normal", round=2)
    assert r2["id"] != a["id"] and r2["round"] == 2
    assert (await call(hass, level="hard"))["id"] != a["id"]


async def test_writes_nothing(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    before = str(hass_storage[STORE_KEY])
    await call(hass, level="hard", round=3)
    assert str(hass_storage[STORE_KEY]) == before


async def test_schema_refuses_bad_level_and_round(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    for bad in ({"level": "egg"}, {"round": 0}, {"round": S.MAX_ROUND + 1}):
        with pytest.raises(vol.Invalid):
            await call(hass, **bad)


async def test_settle_is_not_built_yet(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    reply = await call(hass, action="settle", id="x", moves="u")
    assert reply == {"result": "unsupported"}


async def test_hop_is_the_default_game(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    reply = await hass.services.async_call(
        DOMAIN,
        "hop",
        {"entity_id": PET, "action": "board"},
        blocking=True,
        return_response=True,
    )
    assert "game" not in reply


@pytest.mark.parametrize(
    ("stats", "code"),
    [
        ({"age_hours": 0.0}, "egg"),
        ({"asleep": True}, "asleep"),
        ({"energy": 5.0}, "too_tired"),
    ],
)
async def test_a_refusal_names_why_and_writes_nothing(
    hass, now, hass_storage, stats, code
):
    await ready(hass, now, hass_storage, **stats)
    before = str(hass_storage[STORE_KEY])
    assert (await call(hass, level="easy"))["result"] == code
    assert str(hass_storage[STORE_KEY]) == before
