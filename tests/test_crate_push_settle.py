"""virtual_pet.hop with game "crate-push", action settle (crate-push plan slice 4,
docs/plan-2026-11-08-crate-push.md §5): every solved round pays by its level; only
the next round of a level can settle; the replay is the only trust; neat pays one
find a day on normal and hard; `crate_day` in the save and the sensor."""

from __future__ import annotations

from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest

from custom_components.virtual_pet import crate_push as S, model, rates as R
from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet, setup

PET = "button.pip_feed"
MONDAY = "2026-10-26"


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to(f"{MONDAY} 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def call(hass: HomeAssistant, action: str, **data: Any) -> dict[str, Any]:
    return await hass.services.async_call(
        DOMAIN,
        "hop",
        {"entity_id": PET, "action": action, "game": "crate-push", **data},
        blocking=True,
        return_response=True,
    )


def pet_of(hass):
    return hass.config_entries.async_get_entry("test_pet").runtime_data


async def ready(hass, now, hass_storage, **stats):
    hass_storage[STORE_KEY] = hatched_pet(now, **stats)
    await setup(hass)


def solution(reply: dict[str, Any]) -> str:
    sol = S.solve(S.Board.from_dict(reply))
    assert sol is not None
    return sol.moves


def slow_solution(reply: dict[str, Any]) -> str:
    """A legal winning list over par: the fewest-moves list with two wasted
    step-and-back pairs put in (so, not neat)."""
    b = S.Board.from_dict(reply)
    sol = solution(reply)
    pads = ("ud", "du", "lr", "rl")
    for p1 in pads:
        for p2 in pads:
            for i in range(len(sol) + 1):
                for j in range(i, len(sol) + 1):
                    moves = sol[:i] + p1 + sol[i:j] + p2 + sol[j:]
                    run = S.replay(b, moves)
                    if run["legal"] and run["solved"] and not run["neat"]:
                        return moves
    raise AssertionError("no slow solution found")


async def settle_ok(hass, level, rnd=None, moves=None):
    reply = await call(hass, "board", level=level, **({"round": rnd} if rnd else {}))
    assert reply["result"] == "ok"
    return reply, await call(
        hass,
        "settle",
        level=level,
        round=reply["round"],
        id=reply["id"],
        moves=moves if moves is not None else solution(reply),
    )


@pytest.mark.parametrize("level", ["easy", "normal", "hard"])
async def test_a_solved_round_pays_its_level(hass, now, hass_storage, level):
    await ready(hass, now, hass_storage, happiness=10.0, energy=90.0, hunger=10.0)
    pet = pet_of(hass)
    before = pet.state.happiness
    _, info = await settle_ok(hass, level)
    assert info["result"] == "ok" and info["paid"] and info["round"] == 1
    assert info["next_round"] == 2 and info["level"] == level
    assert pet.state.happiness - before >= R.CRATE_PUSH_WIN_HAPPINESS[level]
    assert pet.state.games["crate-push"]["played"] == 1
    assert pet.state.crate_day["rounds"][level] == 1


async def test_every_round_pays_and_the_board_moves_on(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    pet = pet_of(hass)
    r1, a = await settle_ok(hass, "normal")
    r2, b = await settle_ok(hass, "normal")
    assert (a["round"], b["round"]) == (1, 2) and r1["id"] != r2["id"]
    assert pet.state.games["crate-push"]["played"] == 2
    # With no round asked for, the board is the next one to pay.
    assert (await call(hass, "board", level="normal"))["round"] == 3
    assert (await call(hass, "board", level="easy"))["round"] == 1


async def test_a_round_pays_once_and_none_can_be_skipped(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    reply, info = await settle_ok(hass, "easy")
    assert info["paid"]
    again = await call(
        hass, "settle", level="easy", round=1, id=reply["id"], moves=solution(reply)
    )
    assert again == {"result": "board_changed"}
    skip = await call(hass, "board", level="easy", round=3)
    assert await call(
        hass, "settle", level="easy", round=3, id=skip["id"], moves=solution(skip)
    ) == {"result": "board_changed"}
    assert pet_of(hass).state.games["crate-push"]["played"] == 1


async def test_the_replay_is_the_only_trust(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    reply = await call(hass, "board", level="normal")
    ok = {"level": "normal", "round": 1}
    bad_id = await call(hass, "settle", id="nope", moves="u", **ok)
    assert bad_id == {"result": "board_changed"}
    illegal = await call(hass, "settle", id=reply["id"], moves="", **ok)
    assert illegal["result"] == "illegal"
    junk = await call(hass, "settle", id=reply["id"], moves="zz", **ok)
    assert junk["result"] == "illegal" and junk["bad_index"] == 0
    sol = solution(reply)
    short = await call(hass, "settle", id=reply["id"], moves=sol[:-1], **ok)
    assert short["result"] in ("not_won", "illegal")
    long = await call(
        hass, "settle", id=reply["id"], moves="u" * (S.MAX_MOVES + 1), **ok
    )
    assert long == {"result": "too_long"}
    assert pet_of(hass).state.games.get("crate-push") is None  # nothing paid
    assert pet_of(hass).state.crate_day == {}


async def test_a_settle_with_no_round_is_not_a_board(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    reply = await call(hass, "board", level="easy")
    info = await call(
        hass, "settle", level="easy", id=reply["id"], moves=solution(reply)
    )
    assert info == {"result": "board_changed"}


async def test_neat_pays_one_find_a_day_on_normal_and_hard(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    pet = pet_of(hass)
    _, easy = await settle_ok(hass, "easy")
    assert easy["neat"] and not easy["found"]  # easy is neat, but pays no find
    assert pet.state.crate_day["neat"] is False
    _, normal = await settle_ok(hass, "normal")
    assert normal["neat"]
    assert pet.state.crate_day["neat"] is True
    assert pet.state.games["crate-push"]["neat"] == 1
    _, hard = await settle_ok(hass, "hard")
    assert hard["neat"] and not hard["found"]  # the day's find is spent
    assert pet.state.games["crate-push"]["neat"] == 1


async def test_a_slow_solution_pays_but_is_not_neat(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    reply = await call(hass, "board", level="normal")
    info = await call(
        hass,
        "settle",
        level="normal",
        round=1,
        id=reply["id"],
        moves=slow_solution(reply),
    )
    assert info["result"] == "ok" and info["paid"] and info["neat"] is False
    assert info["found"] is False
    assert pet_of(hass).state.crate_day["neat"] is False  # no find spent


@pytest.mark.parametrize(
    ("stats", "code"),
    [({"age_hours": 0.0}, "egg"), ({"asleep": True}, "asleep")],
)
async def test_a_refusal_pays_nothing(hass, now, hass_storage, stats, code):
    await ready(hass, now, hass_storage, **stats)
    info = await call(hass, "settle", level="easy", round=1, id="x", moves="u")
    assert info == {"result": code}
    assert pet_of(hass).state.crate_day == {}


async def test_a_tired_pet_still_settles_a_won_round(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    reply = await call(hass, "board", level="easy")
    pet = pet_of(hass)
    pet.state.energy = 1.0  # fell below PLAY_MIN_ENERGY while it played
    info = await call(
        hass, "settle", level="easy", round=1, id=reply["id"], moves=solution(reply)
    )
    assert info["result"] == "ok" and info["paid"]
    assert pet.state.energy == 0.0  # the cost stops at 0


async def test_a_new_day_starts_the_rounds_again(
    hass, now, hass_storage, freezer: FrozenDateTimeFactory
):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    await settle_ok(hass, "easy")
    freezer.move_to("2026-10-27 14:00:00+00:00")
    reply = await call(hass, "board", level="easy")
    assert reply["round"] == 1 and reply["day"] == "2026-10-27"
    assert reply["rounds"] == {"easy": 0, "normal": 0, "hard": 0}


async def test_crate_day_is_on_the_sensor_and_saved(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    await settle_ok(hass, "hard")
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["crate_day"]["rounds"]["hard"] == 1
    assert attrs["crate_day"]["day"] == MONDAY
    saved = model.PetState.from_dict(pet_of(hass).state.to_dict())
    assert saved.crate_day == pet_of(hass).state.crate_day
