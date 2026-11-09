"""virtual_pet.hop with game "crate-push", practice true (crate-push plan slice 6b):
a tiny one-crate board, unpaid, no count, never settled, nothing kept."""

from __future__ import annotations

from freezegun.api import FrozenDateTimeFactory
from homeassistant.util import dt as dt_util
import pytest
import voluptuous as vol

from custom_components.virtual_pet import crate_push as S

from .test_crate_push_settle import PET, call, pet_of, ready, solution

MONDAY = "2026-10-26"


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to(f"{MONDAY} 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


def test_a_practice_board_is_tiny_and_never_a_paid_id():
    seen = set()
    for rnd in range(1, 40):
        b = S.practice_board("p", MONDAY, None, rnd)
        assert not b.fallback and (b.w, b.h) in S.PRACTICE_SIZES
        assert b.cells.count("b") + b.cells.count("B") == 1
        sol = S.solve(b)
        assert sol is not None and len(sol.moves) >= 6 and sol.pushes >= 2
        seen.add(b.id)
        for level in S.LEVELS:
            assert S.crate_push_board("p", MONDAY, None, level, rnd).id != b.id
    assert len(seen) > 30
    assert "practice" not in S.LEVELS


async def test_practice_flow_changes_nothing(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    pet = pet_of(hass)
    before = (
        dict(pet.state.crate_day),
        {k: dict(v) for k, v in pet.state.games.items()},
        pet.state.energy,
        pet.state.hunger,
        pet.state.happiness,
    )
    reply = await call(hass, "board", practice=True, round=1)
    assert reply["result"] == "ok" and reply["practice"] is True
    assert reply["round"] == 1 and "rounds" not in reply
    hint = await call(hass, "hint", practice=True, round=1, id=reply["id"], moves="")
    assert hint["result"] == "ok" and hint["kind"] == "step"
    assert (await call(hass, "hint", practice=True, round=1, id="nope", moves=""))[
        "result"
    ] == "board_changed"
    assert solution(reply)
    again = await call(hass, "board", practice=True, round=2)
    assert again["id"] != reply["id"]
    assert (
        dict(pet.state.crate_day),
        {k: dict(v) for k, v in pet.state.games.items()},
        pet.state.energy,
        pet.state.hunger,
        pet.state.happiness,
    ) == before
    assert not pet._crate_hinted


async def test_practice_is_refused_for_settle_hop_and_no_round(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=100.0)
    with pytest.raises(vol.Invalid):
        await call(hass, "settle", practice=True, round=1, id="x", moves="r")
    with pytest.raises(vol.Invalid):
        await call(hass, "board", practice=True)
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(
            "virtual_pet",
            "hop",
            {"entity_id": PET, "action": "board", "practice": True, "round": 1},
            blocking=True,
            return_response=True,
        )


@pytest.mark.parametrize(
    ("stats", "result"),
    [({"age_hours": 0.0}, "egg"), ({"asleep": True}, "asleep")],
)
async def test_practice_refused_for_egg_and_asleep(
    hass, now, hass_storage, stats, result
):
    await ready(hass, now, hass_storage, **stats)
    assert (await call(hass, "board", practice=True, round=1))["result"] == result


async def test_a_tired_pet_can_practise(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=1.0)
    assert (await call(hass, "board", practice=True, round=1))["result"] == "ok"
