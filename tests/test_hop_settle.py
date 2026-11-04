"""virtual_pet.hop, action settle, and the saved day (Hop of the Day ship 3a;
plan docs/plan-2026-11-02-hop-of-the-day.md §6-§8 and "Ship 3a", review s2855,
Decided 17-20): the replay and its codes, the pay once a day, the tidy find,
the races, the day's pin by `board`, and `hop_day` in the save, the sensor and
diagnostics."""

from __future__ import annotations

import asyncio
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import threading
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import Context, HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events
import voluptuous as vol

from custom_components.virtual_pet import hop as H, model, rates as R
from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet, setup, setup_with_house

PET = "button.pip_feed"
MONDAY = "2026-10-26"
REPLY = {"result", "won", "tidy", "paid", "found", "already"}


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to(f"{MONDAY} 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def hop_call(hass: HomeAssistant, **data: Any) -> dict[str, Any]:
    context = data.pop("context", None)
    return await hass.services.async_call(
        DOMAIN,
        "hop",
        {"entity_id": PET, **data},
        blocking=True,
        return_response=True,
        context=context,
    )


async def board(hass: HomeAssistant) -> dict[str, Any]:
    return await hop_call(hass, action="board")


async def settle(
    hass: HomeAssistant, board_id: str, moves: str, **extra: Any
) -> dict[str, Any]:
    return await hop_call(hass, action="settle", id=board_id, moves=moves, **extra)


def coordinator(hass: HomeAssistant):
    return hass.config_entries.async_get_entry("test_pet").runtime_data


async def ready(hass, now, hass_storage, privacy: bool | None = None, **stats):
    hass_storage[STORE_KEY] = hatched_pet(now, **stats)
    if privacy is None:
        await setup(hass)
    else:
        await setup_with_house(hass, privacy=privacy)


def tidy_list(reply: dict[str, Any]) -> str:
    got = H.solve(H.Board.from_dict(reply))
    assert got.tidy is not None
    return H.encode(got.tidy)


def plain_list(reply: dict[str, Any]) -> str:
    """A winning list that is not tidy (the solver's shortest may be)."""
    b = H.Board.from_dict(reply)

    def go(state: H.State, path: list[int]) -> list[int] | None:
        if state.done:
            return None if H.is_tidy(b, state) else path
        for cell in H.legal_targets(b, state):
            if (found := go(H.apply_move(b, state, cell), [*path, cell])) is not None:
                return found
        return None

    path = go(H.start_state(b), [])
    assert path is not None
    return H.encode(path)


async def today(hass, now, hass_storage, **kw) -> tuple[Any, dict[str, Any]]:
    await ready(hass, now, hass_storage, **kw)
    reply = await board(hass)
    assert reply["result"] == "ok"
    return coordinator(hass), reply


def own_saves(monkeypatch, pet) -> list[Any]:
    """The saves a call makes besides _advance's (every call's tick saves the
    pet; the plan's "writes nothing" is about Hop's own writes)."""
    saves: list[Any] = []
    inside = [False]
    real_save, real_advance = pet.store.async_delay_save, pet._advance

    def save(*args: Any, **kw: Any) -> None:
        if not inside[0]:
            saves.append(args)
        real_save(*args, **kw)

    def advance(*args: Any, **kw: Any) -> None:
        inside[0] = True
        try:
            real_advance(*args, **kw)
        finally:
            inside[0] = False

    monkeypatch.setattr(pet.store, "async_delay_save", save)
    monkeypatch.setattr(pet, "_advance", advance)
    return saves


def hop_counts(pet) -> dict[str, int]:
    return dict(pet.state.games.get("hop", {}))


def paid_nothing(info: dict[str, Any]) -> None:
    assert set(info) == REPLY
    assert info["result"] == "ok" and info["already"] is True
    assert not info["paid"] and not info["found"]


# --- The pay ---------------------------------------------------------------------


async def test_a_won_list_pays_23_the_bonus_and_the_costs_once(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage, happiness=40.0, weight=50.0)
    state = pet.state
    before = (state.happiness, state.energy, state.hunger, state.weight)
    bonus = R.PLAYER_WIN_HAPPINESS * model._scale(state, "player")
    info = await settle(hass, reply["id"], plain_list(reply))
    assert info == {
        "result": "ok",
        "won": True,
        "tidy": False,
        "paid": True,
        "found": False,
        "already": False,
    }
    assert state.happiness == pytest.approx(before[0] + R.HOP_WIN_HAPPINESS + bonus)
    assert state.energy == pytest.approx(before[1] + R.PLAY_ENERGY)
    assert state.hunger == pytest.approx(before[2] + R.PLAY_HUNGER)
    assert state.weight == pytest.approx(before[3] + R.WEIGHT_GAME)
    assert state.hop_day == {
        "day": MONDAY,
        "stage": "child",
        "done": True,
        "tidy": False,
    }
    after = (state.happiness, state.energy, state.hunger, state.weight)
    # Again: ok, already, nothing paid.
    paid_nothing(await settle(hass, reply["id"], plain_list(reply)))
    assert (state.happiness, state.energy, state.hunger, state.weight) == after


async def test_the_log_entry_and_the_event(hass, now, hass_storage, hass_admin_user):
    pet, reply = await today(hass, now, hass_storage)
    finished = async_capture_events(hass, f"{DOMAIN}_game_finished")
    await settle(
        hass,
        reply["id"],
        plain_list(reply),
        context=Context(user_id=hass_admin_user.id),
    )
    entry = pet.state.care_log[0]
    assert {k: entry[k] for k in ("action", "result", "score", "game")} == {
        "action": "game",
        "result": "won",
        "score": "win",
        "game": "hop",
    }
    assert entry["by"] == hass_admin_user.name
    await hass.async_block_till_done()
    assert [e.data["game"] for e in finished] == ["hop"]
    assert finished[0].data["won"] is True and finished[0].data["tidy"] is False


async def test_a_tidy_first_settle_logs_tidy(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)
    info = await settle(hass, reply["id"], tidy_list(reply))
    assert info["paid"] and info["tidy"] and not info["already"]
    assert pet.state.care_log[0]["score"] == "tidy"
    assert pet.state.hop_day["tidy"] is True


async def test_an_open_happiness_call_is_closed_by_a_win(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage, happiness=10.0)
    pet.state.call = model.Call("happiness", now, now + 3600)
    answered = async_capture_events(hass, f"{DOMAIN}_call_answered")
    await settle(hass, reply["id"], plain_list(reply))
    await hass.async_block_till_done()
    assert pet.state.call is None
    assert [e.data["reason"] for e in answered] == ["happiness"]


async def test_settle_never_refuses_too_tired(hass, now, hass_storage):
    """Decided 17: a board takes minutes; a won board is not lost to the
    energy falling meanwhile. The cost stops at 0."""
    pet, reply = await today(hass, now, hass_storage)
    pet.state.energy = 10.0
    assert (await board(hass))["result"] == "too_tired"  # board still refuses
    info = await settle(hass, reply["id"], plain_list(reply))
    assert info["result"] == "ok" and info["paid"]
    assert pet.state.energy == 0.0


async def test_a_new_day_resets_done_and_tidy_and_pays_again(
    hass, now, hass_storage, freezer
):
    pet, monday = await today(hass, now, hass_storage)
    await settle(hass, monday["id"], tidy_list(monday))
    assert pet.state.hop_day["done"] and pet.state.hop_day["tidy"]
    assert model.games_played(pet.state) == 1
    freezer.move_to("2026-10-27 14:00:00+00:00")
    tuesday = await board(hass)
    assert (tuesday["done"], tuesday["tidy"]) == (False, False)
    assert pet.state.hop_day == {
        "day": "2026-10-27",
        "stage": "child",
        "done": False,
        "tidy": False,
    }
    info = await settle(hass, tuesday["id"], plain_list(tuesday))
    assert info["paid"]
    assert model.games_played(pet.state) == 2


async def test_the_board_reply_reads_done_and_tidy(hass, now, hass_storage):
    _, reply = await today(hass, now, hass_storage)
    await settle(hass, reply["id"], plain_list(reply))
    assert ((again := await board(hass))["done"], again["tidy"]) == (True, False)
    await settle(hass, reply["id"], tidy_list(reply))
    assert ((again := await board(hass))["done"], again["tidy"]) == (True, True)
    assert again["id"] == reply["id"]


async def test_the_bond_goes_to_the_person_and_shared_is_the_households(
    hass, now, hass_storage, hass_admin_user, monkeypatch
):
    pet, reply = await today(hass, now, hass_storage)
    called = []
    monkeypatch.setattr(model, "game_record", lambda *a: called.append("record"))
    monkeypatch.setattr(model, "favourite_game", lambda *a: called.append("fav"))
    info = await settle(
        hass,
        reply["id"],
        plain_list(reply),
        shared=True,
        context=Context(user_id=hass_admin_user.id),
    )
    assert info["paid"]
    bond = pet.state.bonds[hass_admin_user.id]
    assert bond["points"] == R.BOND_GAME_POINTS
    assert bond["games"] == {"hop": 1}
    assert called == []  # no game_record, no favourite_game
    # The day is the pet's: no person in it.
    assert hass_admin_user.id not in json.dumps(pet.state.hop_day)
    # A later settle that pays nothing gives no bond.
    await settle(
        hass,
        reply["id"],
        plain_list(reply),
        context=Context(user_id=hass_admin_user.id),
    )
    assert pet.state.bonds[hass_admin_user.id]["points"] == R.BOND_GAME_POINTS


async def test_no_person_no_bond(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)
    assert (await settle(hass, reply["id"], plain_list(reply)))["paid"]
    assert pet.state.bonds == {}


# --- Tidy and the find -------------------------------------------------------------


async def test_a_tidy_after_a_plain_win_pays_the_find_and_no_second_23(
    hass, now, hass_storage
):
    pet, reply = await today(hass, now, hass_storage, happiness=40.0)
    pet.state.next_find_at = clock = now + 5000.0
    await settle(hass, reply["id"], plain_list(reply))
    happy, log = pet.state.happiness, list(pet.state.care_log)
    found = async_capture_events(hass, f"{DOMAIN}_found")
    info = await settle(hass, reply["id"], tidy_list(reply))
    await hass.async_block_till_done()
    assert info == {
        "result": "ok",
        "won": True,
        "tidy": True,
        "paid": False,
        "found": True,
        "already": False,
    }
    assert pet.state.happiness == happy  # no second 23
    assert pet.state.care_log == log
    assert len(pet.state.basket) == 1 and len(found) == 1
    assert pet.state.next_find_at == clock  # outside the find clock
    # And once: a third settle pays nothing.
    paid_nothing(await settle(hass, reply["id"], tidy_list(reply)))
    assert len(pet.state.basket) == 1


async def test_tidy_with_a_full_basket_sends_the_find_to_the_collection(
    hass, now, hass_storage
):
    pet, reply = await today(hass, now, hass_storage)
    finds = pet.finds
    pet.state.basket = [
        {"id": f["id"], "world": pet.world, "new": False}
        for f in finds[: R.BASKET_SIZE]
    ]
    pet.state.collection = {}
    basket = list(pet.state.basket)
    found = async_capture_events(hass, f"{DOMAIN}_found")
    info = await settle(hass, reply["id"], tidy_list(reply))
    await hass.async_block_till_done()
    assert info["found"] is True and info["tidy"] is True
    assert pet.state.basket == basket
    assert len(pet.state.collection[pet.world]["finds"]) == 1
    assert found == []  # no moment for a find nobody will see
    assert pet.state.hop_day["tidy"] is True


async def test_tidy_with_no_find_to_pick_still_sets_tidy(hass, now, hass_storage):
    """Decided 20: the restart for tidy must not become a loop."""
    pet, reply = await today(hass, now, hass_storage)
    pet.finds = []
    found = async_capture_events(hass, f"{DOMAIN}_found")
    info = await settle(hass, reply["id"], tidy_list(reply))
    await hass.async_block_till_done()
    assert info["found"] is False and info["tidy"] is True and info["paid"]
    assert pet.state.hop_day["tidy"] is True
    assert hop_counts(pet)["tidy"] == 1
    assert found == [] and pet.state.basket == []


async def test_a_tidy_after_a_plain_win_with_no_find_pays_nothing(
    hass, now, hass_storage
):
    pet, reply = await today(hass, now, hass_storage)
    await settle(hass, reply["id"], plain_list(reply))
    pet.finds = []
    info = await settle(hass, reply["id"], tidy_list(reply))
    paid_nothing(info)  # already: no 23 and no find
    assert info["tidy"] is True
    assert pet.state.hop_day["tidy"] is True  # but tidy is set (Decided 20)


async def test_tidy_before_the_house_is_read_uses_no_flags(hass, now, hass_storage):
    """Review s2855 P1: _find_flags is None until the house is read once."""
    pet, reply = await today(hass, now, hass_storage)
    pet._find_flags = None
    info = await settle(hass, reply["id"], tidy_list(reply))
    assert info["found"] is True
    assert len(pet.state.basket) == 1


# --- The codes ---------------------------------------------------------------------


async def test_every_ok_carries_the_four_flags(hass, now, hass_storage):
    _, reply = await today(hass, now, hass_storage)
    replies = [
        await settle(hass, reply["id"], plain_list(reply)),
        await settle(hass, reply["id"], plain_list(reply)),
        await settle(hass, reply["id"], tidy_list(reply)),
        await settle(hass, reply["id"], tidy_list(reply)),
    ]
    for info in replies:
        assert set(info) == REPLY and info["result"] == "ok" and info["won"]
        assert info["already"] is (not (info["paid"] or info["found"]))
    assert [i["already"] for i in replies] == [False, True, False, True]


async def bad_settle(hass, pet, board_id: str, moves: str) -> dict[str, Any]:
    before, log = pet.state.to_dict(), list(pet.state.care_log)
    info = await settle(hass, board_id, moves)
    assert pet.state.to_dict() == before and pet.state.care_log == log
    return info


async def test_an_illegal_list_names_its_first_bad_move(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)
    good = plain_list(reply)
    b = H.Board.from_dict(reply)
    state = H.apply_move(b, H.start_state(b), H.LETTERS.index(good[0]))
    wrong = next(c for c in range(b.w * b.h) if c not in H.legal_targets(b, state))
    moves = good[0] + H.LETTERS[wrong] + good[2:]
    info = await bad_settle(hass, pet, reply["id"], moves)
    assert info == {"result": "illegal", "bad_index": 1}
    assert (await bad_settle(hass, pet, reply["id"], ""))["bad_index"] == 0


async def test_a_list_that_stops_short_is_not_won(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)
    short = plain_list(reply)[:-1]
    assert await bad_settle(hass, pet, reply["id"], short) == {"result": "not_won"}


async def test_too_long_at_the_server_and_huge_at_the_schema(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)
    over = "a" * (R.HOP_MAX_MOVES + 1)
    assert await bad_settle(hass, pet, reply["id"], over) == {"result": "too_long"}
    with pytest.raises(vol.Invalid):
        await settle(hass, reply["id"], "a" * (R.HOP_MAX_MOVES + 2))
    with pytest.raises(vol.Invalid):
        await settle(hass, "x" * 33, "a")


async def test_another_pets_or_a_stale_generators_id_is_board_changed(
    hass, now, hass_storage, monkeypatch
):
    pet, reply = await today(hass, now, hass_storage)
    moves = plain_list(reply)
    args = (MONDAY, pet.world, reply["w"], reply["h"], reply["grid"])
    other = H.board_id("another_pet", *args, reply["family"], reply["specials"])
    monkeypatch.setattr(H, "GEN_VERSION", H.GEN_VERSION - 1)
    stale = H.board_id(pet.pet_id, *args, reply["family"], reply["specials"])
    monkeypatch.undo()
    assert (
        H.board_id(pet.pet_id, *args, reply["family"], reply["specials"])
        == (reply["id"])
    )
    for wrong in (other, stale, ""):
        assert wrong != reply["id"]
        info = await bad_settle(hass, pet, wrong, moves)
        assert info == {"result": "board_changed"}


@pytest.mark.parametrize(
    ("stats", "code"),
    [
        ({"age_hours": 0.0}, "egg"),
        ({"asleep": True}, "asleep"),
        ({"away": True}, "away"),
    ],
)
async def test_settle_refuses_and_writes_nothing(hass, now, hass_storage, stats, code):
    pet, reply = await today(hass, now, hass_storage, privacy=False)
    moves = plain_list(reply)
    for key, value in stats.items():
        setattr(pet.state, key, value)
    fired = async_capture_events(hass, f"{DOMAIN}_care")
    info = await bad_settle(hass, pet, reply["id"], moves)
    assert info == {"result": code}
    await hass.async_block_till_done()
    assert fired == []


async def test_a_private_pet_away_settles_asleep(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)  # privacy defaults on
    pet.state.away = True
    assert await settle(hass, reply["id"], plain_list(reply)) == {"result": "asleep"}
    assert not pet.state.hop_day["done"]


# --- The day: only board pins it --------------------------------------------------


@pytest.mark.parametrize("stored", [None, "2026-10-25"])
async def test_settle_on_an_empty_or_past_day_is_board_changed_and_builds_nothing(
    hass, now, hass_storage, monkeypatch, stored
):
    """Decided 18: settle never pins or rolls the day; the card asks `board`."""
    pet, reply = await today(hass, now, hass_storage)
    moves = plain_list(reply)
    pet.state.hop_day = (
        {}
        if stored is None
        else {"day": stored, "stage": "child", "done": False, "tidy": False}
    )
    pet._hop_boards.clear()
    built = []
    monkeypatch.setattr(H, "hop_board", lambda *a: built.append(a))
    saves = own_saves(monkeypatch, pet)
    hop_day = dict(pet.state.hop_day)
    info = await bad_settle(hass, pet, reply["id"], moves)
    assert info == {"result": "board_changed"}
    assert built == [] and saves == []
    assert pet.state.hop_day == hop_day


async def test_the_days_first_board_pins_saves_and_publishes(
    hass, now, hass_storage, monkeypatch
):
    await ready(hass, now, hass_storage)
    pet = coordinator(hass)
    assert pet.state.hop_day == {}
    saves, published = own_saves(monkeypatch, pet), []
    real_publish = pet.async_set_updated_data
    monkeypatch.setattr(
        pet, "async_set_updated_data", lambda d: published.append(d) or real_publish(d)
    )
    await board(hass)
    pinned = {"day": MONDAY, "stage": "child", "done": False, "tidy": False}
    assert pet.state.hop_day == pinned
    assert pet.state.to_dict()["hop_day"] == pinned
    assert saves and published
    await hass.async_block_till_done()
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["hop_day"] == pinned
    # The second board of the day writes nothing.
    saves.clear()
    published.clear()
    await board(hass)
    assert saves == [] and published == []


async def test_a_day_that_goes_back_keeps_the_stored_day(hass, now, hass_storage):
    """Decided 19: today < stored day is the same day (clock set back)."""
    await ready(hass, now, hass_storage)
    pet = coordinator(hass)
    ahead = {"day": "2026-10-27", "stage": "child", "done": True, "tidy": True}
    pet.state.hop_day = dict(ahead)
    reply = await board(hass)
    assert reply["day"] == "2026-10-27"
    assert (reply["done"], reply["tidy"]) == (True, True)
    assert pet.state.hop_day == ahead
    # It is that day's board, and a settle on it answers already.
    paid_nothing(await settle(hass, reply["id"], tidy_list(reply)))


async def test_a_day_that_goes_forward_rolls_and_resets(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    pet = coordinator(hass)
    pet.state.hop_day = {
        "day": "2026-10-25",
        "stage": "baby",
        "done": True,
        "tidy": True,
    }
    reply = await board(hass)
    assert reply["day"] == MONDAY and (reply["done"], reply["tidy"]) == (False, False)
    assert pet.state.hop_day == {
        "day": MONDAY,
        "stage": "child",
        "done": False,
        "tidy": False,
    }


async def test_growing_up_mid_day_keeps_todays_board(hass, now, hass_storage, freezer):
    pet, child = await today(hass, now, hass_storage)
    pet.state.age_hours = 130.0  # a teen now
    again = await board(hass)
    assert again["id"] == child["id"] and again["specials"] == 1
    # And a settle replays the pinned (child's) board.
    assert (await settle(hass, child["id"], plain_list(child)))["paid"]
    freezer.move_to("2026-10-27 14:00:00+00:00")
    teen = await board(hass)
    assert (teen["specials"], teen["w"]) == (2, 6)


# --- Races: everything awaited comes first, then one block pays -------------------


async def test_two_settles_at_once_pay_once(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage, happiness=40.0)
    moves = plain_list(reply)
    first, second = await asyncio.gather(
        settle(hass, reply["id"], moves), settle(hass, reply["id"], moves)
    )
    assert sorted([first["paid"], second["paid"]]) == [False, True]
    assert [first["already"], second["already"]].count(True) == 1
    assert hop_counts(pet) == {"played": 1, "won": 1}
    bonus = R.PLAYER_WIN_HAPPINESS * model._scale(pet.state, "player")
    assert pet.state.happiness == pytest.approx(40.0 + R.HOP_WIN_HAPPINESS + bonus)
    assert [e["game"] for e in pet.state.care_log if e["action"] == "game"] == ["hop"]


@contextlib.contextmanager
def slow_build(monkeypatch, day: str):
    """hop_board for `day` waits (in the executor) until released."""
    started, release = threading.Event(), threading.Event()
    real = H.hop_board

    def slow(*args):
        if args[1] == day:
            started.set()
            release.wait(10)
        return real(*args)

    monkeypatch.setattr(H, "hop_board", slow)
    try:
        yield started, release
    finally:
        release.set()


async def test_a_board_that_rolls_the_day_during_a_slow_rebuild(
    hass, now, hass_storage, monkeypatch, freezer
):
    pet, reply = await today(hass, now, hass_storage)
    moves = plain_list(reply)
    pet._hop_boards.clear()  # the settle has to build Monday's again
    with slow_build(monkeypatch, MONDAY) as (started, release):
        task = hass.async_create_task(settle(hass, reply["id"], moves))
        await hass.async_add_executor_job(started.wait, 10)
        freezer.move_to("2026-10-27 00:30:00+00:00")
        tuesday = await board(hass)  # another screen, after midnight
        assert tuesday["day"] == "2026-10-27"
        release.set()
        info = await task
    assert info == {"result": "board_changed"}
    assert pet.state.hop_day["day"] == "2026-10-27"
    assert pet.state.hop_day["done"] is False
    assert "hop" not in pet.state.games


async def test_the_pet_falls_asleep_during_the_await(
    hass, now, hass_storage, monkeypatch
):
    pet, reply = await today(hass, now, hass_storage)
    moves = plain_list(reply)
    pet._hop_boards.clear()
    happy = pet.state.happiness
    with slow_build(monkeypatch, MONDAY) as (started, release):
        task = hass.async_create_task(settle(hass, reply["id"], moves))
        await hass.async_add_executor_job(started.wait, 10)
        pet.state.asleep = True
        release.set()
        info = await task
    assert info == {"result": "asleep"}
    assert pet.state.hop_day["done"] is False
    assert pet.state.happiness == happy


# --- The counts ------------------------------------------------------------------


async def test_counts_a_first_tidy(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)
    await settle(hass, reply["id"], tidy_list(reply))
    assert hop_counts(pet) == {"played": 1, "won": 1, "tidy": 1}


async def test_counts_plain_then_plain_then_tidy(hass, now, hass_storage):
    pet, reply = await today(hass, now, hass_storage)
    played = model.games_played(pet.state)
    await settle(hass, reply["id"], plain_list(reply))
    assert hop_counts(pet) == {"played": 1, "won": 1}
    await settle(hass, reply["id"], plain_list(reply))
    assert hop_counts(pet) == {"played": 1, "won": 1}
    await settle(hass, reply["id"], tidy_list(reply))
    assert hop_counts(pet) == {"played": 1, "won": 1, "tidy": 1}
    await settle(hass, reply["id"], tidy_list(reply))
    assert hop_counts(pet) == {"played": 1, "won": 1, "tidy": 1}
    assert model.games_played(pet.state) == played + 1  # one a day


# --- The round trip ----------------------------------------------------------------


async def test_the_round_trip_with_the_scripts_solver(
    hass, now, hass_storage, monkeypatch, capsys
):
    """Review s2855 P16: the board from the service, solved by
    scripts/hop_solve.py, settled through the service."""
    path = Path(__file__).parent.parent / "scripts" / "hop_solve.py"
    spec = importlib.util.spec_from_file_location("hop_solve", path)
    assert spec and spec.loader
    solver = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(solver)
    pet, reply = await today(hass, now, hass_storage)
    monkeypatch.setattr(sys, "argv", ["hop_solve.py", "--json"])
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(reply)))
    capsys.readouterr()
    assert solver.main() == 0
    lists = json.loads(capsys.readouterr().out)
    info = await settle(hass, reply["id"], lists["tidy"])
    assert info["result"] == "ok" and info["paid"] and info["tidy"]
    assert pet.state.hop_day == {
        "day": MONDAY,
        "stage": "child",
        "done": True,
        "tidy": True,
    }
    await pet.async_shutdown()  # written to disk now
    saved = hass_storage[STORE_KEY]["data"]
    assert saved["hop_day"] == pet.state.hop_day
    assert saved["games"]["hop"] == {"played": 1, "won": 1, "tidy": 1}


# --- The save, the sensor, diagnostics ----------------------------------------------


def pre_3a_save(now: float) -> dict[str, Any]:
    """A save as the version before ship 3a wrote it: no hop_day, games with
    no hop entry."""
    data = model.PetState.new("Pip", now - 30 * 3600).to_dict()
    data.update(
        age_hours=30.0,
        last_updated=now,
        games={"dig": {"played": 4, "won": 3, "dropped": 1}},
    )
    del data["hop_day"]
    return data


def test_an_old_save_loads_unchanged_and_round_trips(now):
    old = pre_3a_save(now)
    state = model.PetState.from_dict(old, now=now)
    assert state.hop_day == {}
    assert state.games == {"dig": {"played": 4, "won": 3, "dropped": 1}}
    saved = state.to_dict()
    assert saved == {**old, "hop_day": {}}
    assert model.PetState.from_dict(saved, now=now).to_dict() == saved


def test_a_new_save_round_trips(now):
    data = pre_3a_save(now)
    data["hop_day"] = {"day": MONDAY, "stage": "teen", "done": True, "tidy": False}
    data["games"]["hop"] = {"played": 2, "won": 2, "tidy": 1}
    state = model.PetState.from_dict(data, now=now)
    assert state.hop_day == data["hop_day"]
    assert state.games["hop"] == {"played": 2, "won": 2, "tidy": 1}
    assert state.to_dict() == data


def test_games_hop_loads_with_and_without_tidy(now):
    data = pre_3a_save(now)
    data["games"]["hop"] = {"played": 1, "won": 1}
    state = model.PetState.from_dict(data, now=now)
    assert state.games["hop"] == {"played": 1, "won": 1}
    data["games"]["hop"] = {"played": 1, "won": 1, "tidy": "x"}
    assert model.PetState.from_dict(data, now=now).games["hop"]["tidy"] == 0


GOOD = {"day": MONDAY, "stage": "child", "done": False, "tidy": False}


@pytest.mark.parametrize(
    "hop_day",
    [
        "x",
        [],
        None,
        {**GOOD, "day": 5},
        {**GOOD, "day": "2026-13-01"},
        {**GOOD, "day": "20261026"},
        {**GOOD, "day": "yesterday"},
        {**GOOD, "stage": "elder"},
        {**GOOD, "stage": "egg"},
        {**GOOD, "done": 1},
        {**GOOD, "tidy": "yes"},
        {k: v for k, v in GOOD.items() if k != "stage"},
    ],
)
def test_a_damaged_hop_day_is_dropped(now, hop_day):
    data = pre_3a_save(now)
    data["hop_day"] = hop_day
    state = model.PetState.from_dict(data, now=now)
    assert state.hop_day == {}
    assert state.name == "Pip" and state.age_hours == 30.0


def test_a_good_hop_day_keeps_only_its_four_keys(now):
    data = pre_3a_save(now)
    data["hop_day"] = {**GOOD, "extra": 1}
    assert model.PetState.from_dict(data, now=now).hop_day == GOOD


def test_a_new_egg_starts_with_no_hop_day(now):
    import random

    state = model.PetState.from_dict(pre_3a_save(now), now=now)
    state.age_hours = 2000.0  # long an adult
    state.hop_day = {**GOOD, "stage": "adult", "done": True, "tidy": True}
    state.games["hop"] = {"played": 3, "won": 3, "tidy": 1}
    assert model.can_lay_egg(state)
    egg, _ = model.lay_egg(state, now, random.Random(1))
    assert egg is not state
    assert egg.hop_day == {}
    assert egg.journal[-1]["games"]["hop"] == {"played": 3, "won": 3, "tidy": 1}


async def test_hop_day_is_on_the_stage_sensor_unrecorded(hass, now, hass_storage):
    from custom_components.virtual_pet.sensor import LifeStageSensor

    assert "hop_day" in LifeStageSensor._unrecorded_attributes
    await ready(hass, now, hass_storage)
    assert hass.states.get("sensor.pip_life_stage").attributes["hop_day"] == {}


async def test_hop_day_is_in_diagnostics_and_not_redacted(hass, now, hass_storage):
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    hass_storage[STORE_KEY] = hatched_pet(now, hop_day=dict(GOOD))
    config = await setup(hass)
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert diag["pet"]["hop_day"] == GOOD
