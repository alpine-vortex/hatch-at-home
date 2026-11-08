"""virtual_pet.hop with game "crate-push", action hint (crate-push plan slice 6a,
docs/plan-2026-11-08-crate-push.md): the next step for the moves played so far,
checked as the settle is; a hinted round is not neat, pay is unchanged; the mark
lives in memory only."""

from __future__ import annotations

from collections import deque
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.util import dt as dt_util
import pytest
import voluptuous as vol

from custom_components.virtual_pet import crate_push as S, model

from .test_crate_push_settle import (
    PET,
    call,
    pet_of,
    ready,
    solution,
)

MONDAY = "2026-10-26"


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to(f"{MONDAY} 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def board_of(hass, level="normal"):
    reply = await call(hass, "board", level=level)
    assert reply["result"] == "ok"
    return reply


async def hint(hass, reply, moves="", **over):
    data = {"level": reply["level"], "round": reply["round"], "id": reply["id"]}
    data.update(over)
    return await call(hass, "hint", moves=moves, **data)


def dead_path(reply: dict[str, Any]) -> str:
    """Moves from the start to a state that can no longer be solved."""
    board = S.Board.from_dict(reply)
    start = S.start_state(board)
    seen = {start: ""}
    queue = deque([start])
    while queue:
        state = queue.popleft()
        for m in S.MOVES:
            nxt = S.apply_move(board, state, m)
            if nxt is None or nxt in seen:
                continue
            seen[nxt] = seen[state] + m
            if S.solve_from(board, nxt) is None:
                return seen[nxt]
            queue.append(nxt)
    raise AssertionError("no dead state on this board")


async def test_a_hint_is_the_next_step_only(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=100.0)
    reply = await board_of(hass)
    answer = await hint(hass, reply)
    sol = solution(reply)
    assert answer["result"] == "ok" and answer["kind"] == "step"
    assert answer["letter"] == sol[0] and isinstance(answer["push"], bool)
    assert set(answer) == {"result", "kind", "letter", "push"}
    again = await hint(hass, reply, sol[:3])
    assert again["kind"] == "step"


async def test_a_hint_after_undo_is_the_same_as_the_shorter_list(
    hass, now, hass_storage
):
    await ready(hass, now, hass_storage, energy=100.0)
    reply = await board_of(hass)
    sol = solution(reply)
    assert await hint(hass, reply, sol[:2]) == await hint(hass, reply, sol[:2])
    assert (await hint(hass, reply, sol[:2]))["letter"] == sol[2]


async def test_a_stuck_board_says_how_far_to_take_back(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=100.0)
    reply = await board_of(hass, "hard")
    dead = dead_path(reply)
    answer = await hint(hass, reply, dead)
    assert answer["kind"] == "stuck" and 1 <= answer["back"] <= len(dead)
    board = S.Board.from_dict(reply)
    after = dead[: len(dead) - answer["back"]]
    assert S.solve_from(board, _state(board, after)) is not None
    assert "letter" not in answer


def _state(board, moves):
    state = S.start_state(board)
    for m in moves:
        state = S.apply_move(board, state, m)
    return state


async def test_a_solved_board_has_no_hint(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=100.0)
    reply = await board_of(hass)
    answer = await hint(hass, reply, solution(reply))
    assert answer == {"result": "ok", "kind": "solved"}


async def test_the_replay_checks_are_the_settles(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=100.0)
    reply = await board_of(hass)
    assert await hint(hass, reply, id="nope") == {"result": "board_changed"}
    assert await hint(hass, reply, round=2) == {"result": "board_changed"}
    bad = await hint(hass, reply, "zz")
    assert bad["result"] == "illegal" and bad["bad_index"] == 0
    long = await hint(hass, reply, "u" * (S.MAX_MOVES + 1))
    assert long == {"result": "too_long"}
    assert pet_of(hass)._crate_hinted == set()  # none of them marks the round


@pytest.mark.parametrize(
    ("stats", "code"),
    [({"age_hours": 0.0}, "egg"), ({"asleep": True}, "asleep")],
)
async def test_refusals_are_the_settles(hass, now, hass_storage, stats, code):
    await ready(hass, now, hass_storage, **stats)
    assert await call(hass, "hint", level="easy", round=1, id="x", moves="") == {
        "result": code
    }


async def test_a_tired_pet_keeps_its_hints(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=100.0)
    reply = await board_of(hass)
    pet_of(hass).state.energy = 1.0
    assert (await hint(hass, reply))["kind"] == "step"


async def test_a_hinted_round_is_not_neat_but_pays_the_same(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    pet = pet_of(hass)
    reply = await board_of(hass)
    assert reply["hinted"] is False and reply["neat_open"] is True
    await hint(hass, reply)
    again = await call(hass, "board", level="normal")
    assert again["hinted"] is True
    before = pet.state.happiness
    info = await call(
        hass,
        "settle",
        level="normal",
        round=1,
        id=reply["id"],
        moves=solution(reply),
    )
    assert info["result"] == "ok" and info["paid"] and info["neat"] is False
    assert info["found"] is False and pet.state.crate_day["neat"] is False
    assert pet.state.happiness - before >= model.R.CRATE_PUSH_WIN_HAPPINESS["normal"]
    # the next round is a new, unhinted board; the day's find is still open
    nxt = await call(hass, "board", level="normal")
    assert nxt["hinted"] is False and nxt["neat_open"] is True


async def test_a_restart_forgets_the_hint(hass, now, hass_storage):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    reply = await board_of(hass)
    await hint(hass, reply)
    pet_of(hass)._crate_hinted.clear()  # what a restart does: memory only
    info = await call(
        hass,
        "settle",
        level="normal",
        round=1,
        id=reply["id"],
        moves=solution(reply),
    )
    assert info["neat"] is True


async def test_a_hint_writes_nothing_and_runs_off_the_loop(hass, now, hass_storage):
    await ready(hass, now, hass_storage, energy=100.0)
    pet = pet_of(hass)
    reply = await board_of(hass)
    before = (dict(pet.state.crate_day), pet.state.hop_day)
    jobs: list[Any] = []
    real = hass.async_add_executor_job

    def spy(func, *args):
        jobs.append(func)
        return real(func, *args)

    with patch.object(hass, "async_add_executor_job", spy):
        await hint(hass, reply)
    assert S.hint in jobs
    assert (dict(pet.state.crate_day), pet.state.hop_day) == before


async def test_neat_open_is_false_on_easy_and_once_the_find_is_spent(
    hass, now, hass_storage
):
    await ready(hass, now, hass_storage, happiness=5.0, energy=100.0)
    assert (await board_of(hass, "easy"))["neat_open"] is False
    reply = await board_of(hass)
    await call(
        hass, "settle", level="normal", round=1, id=reply["id"], moves=solution(reply)
    )
    assert pet_of(hass).state.crate_day["neat"] is True
    assert (await board_of(hass, "hard"))["neat_open"] is False


async def test_hint_is_not_a_hop_action(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    pet = pet_of(hass)
    before = pet.state.hop_day
    with pytest.raises(vol.Invalid):
        await hass.services.async_call(
            "virtual_pet",
            "hop",
            {"entity_id": PET, "action": "hint"},
            blocking=True,
            return_response=True,
        )
    assert pet.state.hop_day == before
