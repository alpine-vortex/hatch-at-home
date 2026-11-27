"""Shared Hop can be resumed, replayed, and advanced by one person at a time."""

from __future__ import annotations

import asyncio

from homeassistant.util import dt as dt_util
import pytest

from custom_components.virtual_pet import activity_support, hop, household_hop, rates

from .test_channel import command, pushed, subscribe
from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, setup

HOP = household_hop


@pytest.fixture
async def companion(hass, hass_storage, freezer):
    freezer.move_to("2026-10-26 16:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now, species="otter")
    return await setup(hass)


def request(action, revision, serial, cell=None):
    return HOP.Mutation(f"{serial:032x}", action, revision, cell)


async def send(client, ref, mutation=None):
    data = {
        "entity_id": "sensor.pip_life_stage",
        "pet_ref": ref,
        "action": mutation.action if mutation else "view",
    }
    if mutation:
        data.update(request_id=mutation.id, revision=mutation.revision)
        if mutation.cell is not None:
            data["cell"] = mutation.cell
    return (await command(client, "household_hop", **data))["result"]


async def test_handoff_across_reload_and_local_midnight_with_anonymous_pushes(
    hass, companion, hass_ws_client, hass_read_only_access_token, hass_storage, freezer
):
    pet = companion.runtime_data
    ref = activity_support.incarnation(pet)
    first = await hass_ws_client(hass)
    second_user, token = await a_user(hass)
    second = await hass_ws_client(hass, token)
    reader = await hass_ws_client(hass, hass_read_only_access_token)
    snapshot = await subscribe(second, shared=True)
    assert snapshot["house"]["gameplay"][HOP.KEY] == {
        "status": "empty",
        "revision": 0,
        "can_start": True,
    }
    assert (await send(reader, ref))["can_edit"] is False
    assert (await send(reader, ref, request("start", 0, 90)))["result"] == "read_only"
    assert (await send(first, "f" * 32, request("start", 0, 90)))[
        "result"
    ] == "pet_changed"

    # This is HA midnight in Asia/Tokyo, where a UTC date would still be yesterday.
    await hass.config.async_set_time_zone("Asia/Tokyo")
    start = await send(first, ref, request("start", 0, 1))
    assert start["result"] == "ok"
    active = start["state"]
    assert active["day"] == "2026-10-27"
    assert active["moves"] == "" and active["revision"] == 1
    assert pet.state.hop_day == {}
    board = hop.Board.from_dict(active["board"])
    solve = hop.solve(board)
    assert solve.win and len(solve.win) > 1

    moved = request("move", 1, 2, solve.win[0])
    first_move = await send(first, ref, moved)
    assert first_move["state"]["moves"] == hop.encode(solve.win[:1])
    saved = await send(first, ref, request("handoff", 2, 3))
    assert saved["state"]["handoff"] is True
    changes = await pushed(second)
    shared = changes[-1]["house"]["gameplay"][HOP.KEY]
    assert shared == saved["state"]
    assert second_user.id not in str(shared) and "receipt" not in shared
    assert hass_storage[STORE_KEY]["data"][HOP.KEY]["receipt"]["id"] == f"{3:032x}"

    freezer.move_to("2026-10-27 16:00:00+00:00")
    pet.state.last_updated = dt_util.utcnow().timestamp()
    await pet.async_save_now()
    assert await hass.config_entries.async_reload(companion.entry_id)
    await hass.async_block_till_done()
    pet = companion.runtime_data
    assert activity_support.incarnation(pet) == ref
    assert (await send(second, ref))["state"] == shared
    assert (await send(second, ref, moved))["state"] == shared
    for serial, cell in enumerate(solve.win[1:], start=4):
        result = await send(second, ref, request("move", serial - 1, serial, cell))
        assert result["result"] == "ok"
    done = result["state"]
    assert done["status"] == "complete" and done["handoff"] is False
    assert done["can_start"] and done["board"] == active["board"]
    assert (await send(reader, ref))["state"] == done
    assert pet.state.hop_day == {}
    replacement = await send(second, ref, request("start", done["revision"], 20))
    assert replacement["state"]["board"]["id"] != board.id
    assert replacement["state"]["revision"] == done["revision"] + 1
    assert replacement["state"]["day"] == "2026-10-28"
    assert (await send(first, ref, moved))["result"] == "changed"


async def test_one_turn_commits_and_exact_retry_survives_reload(
    hass, companion, hass_ws_client, monkeypatch
):
    pet = companion.runtime_data
    ref = activity_support.incarnation(pet)
    client = await hass_ws_client(hass)

    def generated(*args):
        return hop.Board(3, 2, ("PoN", "..."), "hop", 0, "woodland", "0000000000")

    monkeypatch.setattr(HOP, "_generate", generated)
    assert (await send(client, ref, request("start", 0, 1)))["result"] == "ok"
    original_save = pet.async_save_now
    writing = asyncio.Event()
    release = asyncio.Event()

    async def blocked_write(*, snapshot=None):
        writing.set()
        await release.wait()
        await original_save(snapshot=snapshot)

    monkeypatch.setattr(pet, "async_save_now", blocked_write)
    original = request("move", 1, 2, 1)
    conflict = request("move", 1, 3, 3)

    first = asyncio.create_task(HOP.act(pet, ref, original, lambda: True))
    await writing.wait()
    second = asyncio.create_task(HOP.act(pet, ref, conflict, lambda: True))
    await asyncio.sleep(0)
    assert HOP.view(pet)["revision"] == 1
    release.set()
    one, two = await asyncio.gather(first, second)
    assert one["result"] == "ok"
    assert two == {"result": "changed", "state": one["state"]}

    assert await hass.config_entries.async_reload(companion.entry_id)
    await hass.async_block_till_done()
    pet = companion.runtime_data
    assert await send(client, ref, original) == one
    changed_same_id = request("move", 1, 2, 3)
    assert (await send(client, ref, changed_same_id))["result"] == "changed"
    assert (await send(client, ref, request("move", 2, 2, 2)))["result"] == "illegal"
    undone = await send(client, ref, request("undo", 2, 4))
    assert undone["state"]["moves"] == ""
    assert (await send(client, ref, request("move", 3, 5, 1)))["result"] == "ok"
    restarted = await send(client, ref, request("restart", 4, 6))
    assert restarted["state"]["moves"] == "" and restarted["state"]["revision"] == 5
    assert restarted["state"]["board"] == one["state"]["board"]
    assert pet.state.hop_day == {}


async def test_failed_save_does_not_change_board_and_unsupported_revision_is_retained(
    companion, monkeypatch
):
    pet = companion.runtime_data
    ref = activity_support.incarnation(pet)
    pet.state.unknown[HOP.KEY] = {"ref": ref, "rule_version": 70, "revision": 19}
    assert HOP.view(pet) == {"status": "unsupported", "revision": 19, "can_start": True}
    start = request("start", 19, 1)
    monkeypatch.setattr(
        HOP,
        "_generate",
        lambda *args: hop.Board(3, 1, ("PoN",), "hop", 0, "woodland", "0000000000"),
    )
    original_save = pet.async_save_now

    async def fails(*, snapshot=None):
        assert snapshot()[HOP.KEY]["revision"] == 20
        raise OSError("no write")

    monkeypatch.setattr(pet, "async_save_now", fails)
    with pytest.raises(OSError, match="no write"):
        await HOP.act(pet, ref, start, lambda: True)
    assert HOP.view(pet)["revision"] == 19
    monkeypatch.setattr(pet, "async_save_now", original_save)
    fresh = await HOP.act(pet, ref, start, lambda: True)
    assert fresh["state"]["revision"] == 20
    assert fresh["state"]["status"] == "active"
    pet.state.asleep = True
    assert (await HOP.act(pet, ref, request("move", 20, 2, 1), lambda: True))[
        "result"
    ] == "not_now"
    assert await HOP.act(pet, ref, start, lambda: True) == fresh


def test_move_limit_allows_undo_and_restart():
    board = hop.Board(4, 1, ("PooN",), "hop", 0, "woodland", "0000000000")
    moves = ("bc" * (rates.HOP_MAX_MOVES // 2))[: rates.HOP_MAX_MOVES]
    progress = HOP.Progress(300, "2026-10-26", board, moves)
    assert hop.replay(board, moves)["legal"]
    assert progress.advance(request("move", 300, 1, 3)) is None
    assert progress.advance(request("undo", 300, 2)).moves == moves[:-1]
    assert progress.advance(request("restart", 300, 3)).moves == ""


def test_shared_generator_uses_a_distinct_puzzle_even_if_both_get_a_fallback(
    monkeypatch,
):
    generate = hop.hop_board
    monkeypatch.setattr(
        hop, "hop_board", lambda *a, **kw: generate(*a, **kw, candidates=0)
    )
    day = "2026-10-26"
    solo = hop.hop_board("test_pet", day, "pond", "swim", *hop.params_for("child", day))
    shared = HOP._generate("test_pet", "a" * 32, day, "pond", "otter", "child", "child")
    assert shared.grid != solo.grid and shared.id != solo.id
    assert shared.fallback and hop.solve(shared).win


async def test_concurrent_start_shares_generation_and_rechecks_permissions(
    companion, monkeypatch
):
    pet = companion.runtime_data
    ref = activity_support.incarnation(pet)
    finished = pet.hass.loop.create_future()
    execute = pet.hass.async_add_executor_job
    generations = []
    can_edit = True

    def executor(job, *args):
        if job is HOP._generate:
            generations.append(args)
            return finished
        return execute(job, *args)

    monkeypatch.setattr(pet.hass, "async_add_executor_job", executor)
    first = asyncio.create_task(
        HOP.act(pet, ref, request("start", 0, 1), lambda: can_edit)
    )
    second = asyncio.create_task(
        HOP.act(pet, ref, request("start", 0, 2), lambda: True)
    )
    await asyncio.sleep(0)
    assert len(generations) == 1 and HOP.view(pet)["status"] == "empty"
    can_edit = False
    finished.set_result(hop.Board(3, 1, ("PoN",), "hop", 0, "woodland", "0000000000"))
    one, two = await asyncio.gather(first, second)
    assert one["result"] == "read_only"
    assert two["result"] == "ok"
    assert HOP.view(pet)["revision"] == 1
