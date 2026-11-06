"""Per-person memory, M1a (docs/plan-2026-11-02-memory.md): the record, the switch,
the household option and its erase. The privacy table of the plan's section 10, the
rows M1a can run; M1b, M2 and M3 add theirs here."""

from __future__ import annotations

import asyncio
import copy
from datetime import date, timedelta
import json
import logging
from pathlib import Path
import re
from typing import Any
from unittest.mock import patch

from homeassistant.config_entries import ConfigEntryDisabler
from homeassistant.const import CONF_NAME, MATCH_ALL
from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import intent, llm
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
)

from custom_components.virtual_pet import async_remove_entry, people as P, rates as R
from custom_components.virtual_pet.const import CONF_MEMORY, DOMAIN
from custom_components.virtual_pet.diagnostics import (
    async_get_config_entry_diagnostics,
)
from custom_components.virtual_pet.people import STORE_KEY as PEOPLE_KEY

from .test_config_flow import open_topic, shown
from .test_damaged import storage_dir  # noqa: F401 - a fixture

# The fixture above is a test argument below.
# ruff: noqa: F811
from .test_forget import a_user, people_store, saved_people
from .test_init import STORE_KEY, hatched_pet

ROOT = Path(__file__).parent.parent
SRC = ROOT / "custom_components" / DOMAIN

# Old, odd dates: no other part of the pet ever says them, so any sight of one in
# an output is memory leaking.
MARK = "2011-0"


def full_memory() -> dict[str, Any]:
    """A memory record at its caps, every date in 2011 (MARK)."""
    tags = [
        {"day": f"2011-{1 + i // 28:02d}-{1 + i % 28:02d}", "kind": kind, "tag": tag}
        for i in range(P.MEMORY_TAGS_CAP // 2)
        for kind, tag in (("big_day", "work_thing"), ("weekend", "something_else"))
    ]
    picks = {
        kind: [
            {"day": f"2011-09-{10 + i:02d}", field: values[i % len(values)]}
            for i in range(P.MEMORY_PICKS_CAP)
        ]
        for kind, (field, values) in P.MEMORY_PICKS.items()
    }
    return {
        "on": True,
        "since": "2011-01-01",
        "tags": tags,
        "picks": picks,
        "since_told": {"fav_weather": "2011-02-02"},
        "said": {"door2": "2011-03-03", "door6_fav_weather": "2011-03-04"},
    }


async def start(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    records: dict[str, Any] | None = None,
    **options: Any,
) -> Any:
    """Pip, hatched, with these people records and these options."""
    await hass.config.async_set_time_zone("UTC")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    if records is not None or PEOPLE_KEY not in hass_storage:
        hass_storage[PEOPLE_KEY] = people_store(records or {})
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "world": "woodland"},
        entry_id="test_pet",
        options=options,
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry.runtime_data


def a_pet(hass: HomeAssistant, entry_id: str, **options: Any) -> MockConfigEntry:
    entry = MockConfigEntry(
        domain=DOMAIN,
        title=entry_id.title(),
        data={CONF_NAME: entry_id.title(), "world": "woodland"},
        entry_id=entry_id,
        options=options,
    )
    entry.add_to_hass(hass)
    return entry


async def ws(client: Any, command: str, **fields: Any) -> dict[str, Any]:
    await client.send_json_auto_id({"type": f"{DOMAIN}/{command}", **fields})
    return await client.receive_json()


async def switch(client: Any, enabled: bool, **extra: Any) -> dict[str, Any]:
    fields = {"entity_id": "sensor.pip_mood", "enabled": enabled, **extra}
    return await ws(client, "memory", **fields)


async def answer(client: Any, question: str, value: str, **extra: Any) -> dict:
    fields = {"entity_id": "sensor.pip_mood", "question": question, "answer": value}
    return await ws(client, "answer", **fields, **extra)


def today() -> str:
    return dt_util.now().date().isoformat()


# --- The record (R5, R6, R8) -----------------------------------------------------------


async def test_an_old_store_loads_unchanged_and_memory_reads_as_off(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """Migration up: additive, STORE_VERSION 1, no memory key means off."""
    old = {
        "u": {
            "likes": {"fav_weather": "snow"},
            "birthday": "07-01",
            "my_day": True,
            "noted": {"day": "2026-10-01"},
            "birthday_skipped": True,
        }
    }
    pet = await start(hass, hass_storage, copy.deepcopy(old))
    assert P.STORE_VERSION == 1
    assert pet.people.data["people"] == old
    assert not pet.people.memory_on("u")
    assert pet.people.memory("u") is None
    assert pet._mine("u")["memory_on"] is False
    assert pet._visit_prefs("u")["memory_on"] is False


def test_a_hand_edited_record_drops_bad_entries_one_by_one() -> None:
    """Retention and R5: an unknown tag, a bad date, a text value go; the rest stay.
    A 13-month-old tag is kept (no time prune)."""
    old_day = "2025-09-01"
    record = {
        "on": True,
        "since": "not a date",
        "tags": [
            {"day": old_day, "kind": "big_day", "tag": "show"},
            {"day": "2026-10-01", "kind": "big_day", "tag": "appointment"},
            {"day": "2026-13-01", "kind": "weekend", "tag": "trip"},
            {"day": "2026-10-02", "kind": "big_day", "tag": "my sister's recital"},
            {"day": "2026-10-03", "kind": "big_day", "tag": "exam", "text": "maths"},
            "x",
        ],
        "picks": {
            "dream": [
                {"day": "2026-10-04", "pick": "snacks"},
                {"day": 3, "pick": "sea"},
            ],
            "guess": [{"day": "2026-10-05", "pick": "hail"}],
            "great": [{"day": "2026-10-06", "ask": "how_day"}],
            "names": [{"day": "2026-10-07", "pick": "Ada"}],
        },
        "since_told": {
            "fav_weather": "2026-10-08",
            "Ada": "2026-10-08",
            "visitor_woodland": "2026-10-08",
        },
        "said": {
            "door2": "2026-10-09",
            "door9": "2026-10-09",
            "door99": "2026-10-09",
            "noted": "x",
        },
        # Door 9's old bookkeeping, dropped quietly (M1b audit finding 4).
        "heard": {"day": "2026-10-10", "pet": "pip"},
        "words": "my sister's recital",
    }
    out = P._person({"memory": record})["memory"]
    assert out == {
        "on": True,
        "tags": [{"day": old_day, "kind": "big_day", "tag": "show"}],
        "picks": {
            "dream": [{"day": "2026-10-04", "pick": "snacks"}],
            "great": [{"day": "2026-10-06", "ask": "how_day"}],
        },
        "since_told": {"fav_weather": "2026-10-08"},
        "said": {"door2": "2026-10-09"},
    }
    # Kept through a prune more than a year later: count caps only (Q4 C).
    people = P.People.__new__(P.People)
    people.data = {"people": {"u": {"memory": out}}, "weather": {}}
    people._moods, people._texts = {}, {}
    people.prune("2026-11-02")
    assert people.data["people"]["u"]["memory"]["tags"][0]["day"] == old_day
    # Off, or not a record: no memory at all.
    for bad in ({"on": False, "tags": []}, {"tags": []}, "on", None, []):
        assert "memory" not in P._person({"memory": bad})


def test_a_saved_record_over_its_caps_or_with_twins_is_cut_on_load() -> None:
    tags = [
        {
            "day": f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}",
            "kind": "big_day",
            "tag": "show",
        }
        for i in range(130)
    ]
    twin = {"day": tags[-1]["day"], "kind": "big_day", "tag": "match"}
    picks = [{"day": f"2026-10-{10 + i}", "pick": "sea"} for i in range(8)]
    out = P._person(
        {"memory": {"on": True, "tags": [*tags, twin], "picks": {"dream": picks}}}
    )["memory"]
    assert len(out["tags"]) == P.MEMORY_TAGS_CAP
    assert out["tags"][0] == tags[10]  # the oldest went
    assert out["tags"][-1] == twin  # one per (day, kind), the later wins
    assert out["picks"]["dream"] == picks[-5:]


def test_memory_days_are_canonical_iso() -> None:
    """Audit finding 2: `fromisoformat` takes 20261101 and 2026-W44-1, which would twin a
    day. Memory only: a bad entry goes. A day after today is kept (no clock test at load:
    a stale clock at boot would erase real days)."""
    for bad in ("20261101", "2026-W44-1", "2026-11-1", "9999-12-31 ", " 2026-11-01"):
        assert not P._memory_entry_ok(
            "tags", {"day": bad, "kind": "big_day", "tag": "show"}
        ), bad
        assert not P._memory_entry_ok("dream", {"day": bad, "pick": "sea"}), bad
        assert P._person({"memory": {"on": True, "since": bad}})["memory"] == {
            "on": True
        }, bad
    twin = [
        {"day": "20261101", "kind": "big_day", "tag": "show"},
        {"day": "2026-11-01", "kind": "big_day", "tag": "show"},
    ]
    out = P._person({"memory": {"on": True, "tags": twin}})["memory"]
    assert out["tags"] == [twin[1]]
    out = P._person(
        {
            "memory": {
                "on": True,
                "since": "20261101",
                "since_told": {"fav_weather": "2026-W44-1"},
                "said": {"door2": "20261101"},
                "heard": {"day": "20261101", "pet": "pip"},
            }
        }
    )["memory"]
    assert out == {"on": True}
    assert not P._person({"memory_chosen_days": ["20261101"]}).get("memory_chosen_days")
    assert P._person({"memory_chosen_days": ["2026-11-01"]})["memory_chosen_days"]
    # A day after today is kept, whatever "today" is.
    future = {"day": "9999-12-31", "pick": "sea"}
    today = {"day": "2026-11-02", "pick": "sea"}
    record = {"memory": {"on": True, "picks": {"dream": [today, future]}}}
    assert P._person(record)["memory"]["picks"]["dream"] == [today, future]


async def test_a_stored_future_day_is_kept_on_load_even_with_a_stale_clock(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """A box booting with a clock before NTP must not erase real days. (A real user:
    the stale load date makes the first tick a new day, whose prune drops the memory
    of an id HA doesn't know, M3a.)"""
    ada, _ = await a_user(hass)
    far = {"day": "9999-12-31", "pick": "sea"}
    old = {"day": "2011-03-03", "pick": "sea"}
    stale = {"memory": {"on": True, "picks": {"dream": [old, far]}}}
    with patch(
        "custom_components.virtual_pet.people.model_today", return_value="2001-01-01"
    ):
        pet = await start(hass, hass_storage, {ada.id: stale})
    await hass.async_block_till_done()
    assert pet.people.memory(ada.id)["picks"]["dream"] == [old, far]


async def test_remember_keeps_one_per_key_and_its_caps_at_once(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """Retention (M1 S7): 130 tags in one day, before any prune, leave 120; a second
    write for the same key replaces it; a bad entry is refused."""
    pet = await start(hass, hass_storage, {"u": {"memory": {"on": True}}})
    people = pet.people
    with patch.object(people, "prune", side_effect=AssertionError("no prune")):
        for i in range(130):
            day = (date(2027, 1, 1) + timedelta(days=i)).isoformat()
            assert people.remember(
                "u", "tags", {"day": day, "kind": "big_day", "tag": "show"}
            )
    tags = people.memory("u")["tags"]
    assert len(tags) == P.MEMORY_TAGS_CAP
    assert tags[0]["day"] == "2027-01-11"  # the ten oldest went
    same = {"day": tags[0]["day"], "kind": "big_day", "tag": "match"}
    assert people.remember("u", "tags", same)
    assert [t for t in people.memory("u")["tags"] if t["day"] == same["day"]] == [same]
    for i in range(7):
        people.remember("u", "dream", {"day": f"2026-10-1{i}", "pick": "sea"})
    people.remember("u", "dream", {"day": "2026-10-16", "pick": "you"})
    dream = people.memory("u")["picks"]["dream"]
    assert len(dream) == 5 and dream[-1] == {"day": "2026-10-16", "pick": "you"}
    for kind, entry in (
        ("tags", {"day": "2026-10-01", "kind": "big_day", "tag": "dentist"}),
        ("tags", {"day": "2026-10-01", "kind": "big_day", "tag": "show", "x": 1}),
        ("dream", {"day": "2026-10-01", "pick": "my sister"}),
        ("dream", {"day": "yesterday", "pick": "sea"}),
        ("names", {"day": "2026-10-01", "pick": "sea"}),
    ):
        assert not people.remember("u", kind, entry), entry


async def test_remember_and_said_never_make_a_record(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """Concurrency and "off leaves no trace": with memory off (or no person at all),
    nothing is written and no record is made."""
    pet = await start(hass, hass_storage, {"off": {"my_day": True}})
    people = pet.people
    for user in ("off", "nobody"):
        assert not people.remember(user, "dream", {"day": today(), "pick": "sea"})
        assert not people.mark_memory_said(user, "door2", today())
        assert people.memory_said(user, "door2") is None
    assert "nobody" not in people.data["people"]
    assert people.data["people"]["off"] == {"my_day": True}


async def test_forget_item_removes_exactly_one_entry_saved_at_once(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    pet = await start(hass, hass_storage, {"u": {"memory": full_memory()}})
    people = pet.people
    tags = people.memory("u")["tags"]
    day = tags[0]["day"]
    assert {t["kind"] for t in tags if t["day"] == day} == {"big_day", "weekend"}
    assert await people.forget_item("u", "tags", day, "big_day")
    left = [t for t in people.memory("u")["tags"] if t["day"] == day]
    assert left == [{"day": day, "kind": "weekend", "tag": "something_else"}]
    stored = saved_people(hass_storage)["u"]["memory"]["tags"]
    assert len(stored) == P.MEMORY_TAGS_CAP - 1  # saved at once
    pick = people.memory("u")["picks"]["guess"][0]["day"]
    assert await people.forget_item("u", "guess", pick)
    assert len(saved_people(hass_storage)["u"]["memory"]["picks"]["guess"]) == 4
    assert not await people.forget_item("u", "guess", pick)  # gone: no twin
    assert not await people.forget_item("u", "names", pick)


# --- The switch (R2, R3, R7) -------------------------------------------------------------


async def test_the_switch_turns_memory_on_and_off_for_the_person(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage)
    client = await hass_ws_client(hass, token)
    assert (await switch(client, True, shared=False))["success"]
    assert pet.people.memory(ada.id) == {"on": True, "since": today()}
    assert pet._mine(ada.id)["memory_on"] is True
    assert pet._visit_prefs(ada.id)["memory_on"] is True
    # On again keeps what is there.
    pet.people.remember(ada.id, "dream", {"day": today(), "pick": "sea"})
    assert (await switch(client, True, shared=False))["success"]
    assert pet.people.memory(ada.id)["picks"]["dream"]
    # Erase, off: popped and written at once, with no delay (R7).
    assert (await switch(client, False, shared=False))["success"]
    assert "memory" not in pet.people.data["people"][ada.id]
    assert "memory" not in saved_people(hass_storage)[ada.id]
    assert pet._mine(ada.id)["memory_on"] is False


async def test_a_shared_screen_or_no_flag_is_refused_before_the_pet_lookup(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Shared screens and WS shape: refused first, with `shared`; then `no_pet`."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {})
    client = await hass_ws_client(hass, token)
    for enabled in (True, False):
        msg = await switch(client, enabled, shared=True)
        assert msg["error"]["code"] == "shared"
        msg = await switch(client, enabled)  # no flag
        assert not msg["success"]
        assert msg["error"]["code"] == "invalid_format"
    msg = await ws(
        client, "memory", entity_id="sensor.nobody", enabled=True, shared=True
    )
    assert msg["error"]["code"] == "shared"
    msg = await ws(
        client, "memory", entity_id="sensor.nobody", enabled=True, shared=False
    )
    assert msg["error"]["code"] == "no_pet"
    assert ada.id not in pet.people.data["people"]
    # forget_me is not a memory command: still no shared field (M1 N4).
    assert (await ws(client, "forget_me"))["success"]


async def test_turning_on_is_refused_where_the_pet_does_not_allow_it(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Off is exempt from the option (an erase); on is not. Child users (R10): the
    option off shows `memory_allowed` false."""
    ada, token = await a_user(hass)
    pet = await start(
        hass, hass_storage, {"x": {"memory": {"on": True}}}, **{CONF_MEMORY: False}
    )
    client = await hass_ws_client(hass, token)
    msg = await switch(client, True, shared=False)
    assert msg["error"] == {"code": "not_asked", "message": "Not on this pet"}
    assert ada.id not in pet.people.data["people"]
    assert pet._mine(ada.id)["memory_allowed"] is False
    assert pet._visit_prefs(ada.id)["memory_allowed"] is False
    pet.people.data["people"][ada.id] = {"memory": {"on": True}}
    assert (await switch(client, False, shared=False))["success"]
    assert "memory" not in pet.people.data["people"][ada.id]
    assert pet.people.memory_on("x")  # someone else's stays


async def test_one_person_never_touches_anothers_memory(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Other people and child users: B's switch, either way, leaves A's record."""
    ada, _ = await a_user(hass)
    bob, bob_token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": full_memory()}})
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, bob_token)
    assert (await switch(client, True, shared=False))["success"]
    assert (await switch(client, False, shared=False))["success"]
    assert pet.people.data["people"][ada.id] == before
    assert "memory" not in pet.people.data["people"][bob.id]


# --- What reaches memory (R3, M1 B1) --------------------------------------------------


async def test_a_pick_is_remembered_only_from_a_private_screen(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Shared screens: an answer with `shared` true or absent keeps the pick as ever
    and leaves memory unchanged; with `shared: false` it is also remembered."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {})
    client = await hass_ws_client(hass, token)
    assert (await switch(client, True, shared=False))["success"]
    for extra in ({"shared": True}, {}):
        assert (await answer(client, "dream", "snacks", **extra))["success"]
        assert (await answer(client, "guess", "rain", **extra))["success"]
        assert [p["pick"] for p in pet.state.dream_picks] == ["snacks"]  # kept as ever
        assert pet.people.data["people"][ada.id]["guess"]["guess"] == "rain"
        assert pet.people.memory(ada.id) == {"on": True, "since": today()}
    assert (await answer(client, "dream", "sea", shared=False))["success"]
    assert (await answer(client, "guess", "sun", shared=False))["success"]
    assert pet.people.memory(ada.id)["picks"] == {
        "dream": [{"day": today(), "pick": "sea"}],
        "guess": [{"day": today(), "pick": "sun"}],
    }
    # The game pick, under today's later ask (F6).
    person = pet.people.data["people"][ada.id]
    person["asked"] = {"day": today(), "later_kind": "game"}
    assert (await answer(client, "game", "dig", shared=True))["success"]
    assert "game" not in pet.people.memory(ada.id)["picks"]
    person.pop("follow", None)
    person["asked"] = {"day": today(), "later_kind": "game"}
    assert (await answer(client, "game", "dig", shared=False))["success"]
    assert pet.people.memory(ada.id)["picks"]["game"] == [
        {"day": today(), "pick": "dig"}
    ]


async def test_a_pet_whose_option_is_off_adds_nothing(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """The pet's own option, server side (review S8): memory on through another pet,
    this one keeps nothing."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {}, **{CONF_MEMORY: False})
    pet.people.data["people"][ada.id] = {"memory": {"on": True}}
    client = await hass_ws_client(hass, token)
    assert (await answer(client, "dream", "sea", shared=False))["success"]
    assert pet.people.memory(ada.id) == {"on": True}


async def test_an_answer_during_the_off_save_does_not_bring_memory_back(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """Concurrency (review S6): the save's await held open, an answer lands; the
    erase wins, and nothing re-creates the record."""
    pet = await start(hass, hass_storage, {"u": {"memory": {"on": True}}})
    people = pet.people
    real = people.async_save_now
    hold = asyncio.Event()

    async def held() -> None:
        await hold.wait()
        await real()

    with patch.object(people, "async_save_now", held):
        off = hass.async_create_task(pet.async_set_memory("u", False))
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert not off.done()
        await pet.async_answer("u", "dream", "sea", private=True)
        assert not people.remember("u", "guess", {"day": today(), "pick": "sun"})
        hold.set()
        await off
    assert "memory" not in people.data["people"]["u"]
    assert "memory" not in saved_people(hass_storage)["u"]


# --- Erase: forget me, doors, ask again ---------------------------------------------


async def test_forget_me_takes_memory_and_keeps_the_content_free_refusals(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(
        hass,
        hass_storage,
        {
            ada.id: {
                "memory": full_memory(),
                "memory_asked": True,
                "birthday_skipped": True,
                "memory_chosen_days": ["2026-10-01"],
                "birthday": "07-01",
            }
        },
    )
    client = await hass_ws_client(hass, token)
    assert (await ws(client, "forget_me"))["success"]
    kept = {
        "memory_asked": True,
        "birthday_skipped": True,
        "memory_chosen_days": ["2026-10-01"],
    }
    assert pet.people.data["people"][ada.id] == kept
    assert saved_people(hass_storage)[ada.id] == kept
    assert MARK not in json.dumps(hass_storage[PEOPLE_KEY])


async def test_a_door_is_marked_in_memory_only_and_off_leaves_no_trace(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Off leaves no trace (M1 S2): the visit marks a door's note in memory["said"],
    never `people.mark` / `noted`; after "off" no door key is anywhere."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": {"on": True}}})
    door = ("memory", "door2", today(), {"kind": "door2"})

    async def notes(user: str, now: float) -> list[Any]:
        return [door]

    with (
        patch.object(pet, "_notes", notes),
        patch.object(pet.people, "mark", side_effect=AssertionError("noted")),
    ):
        reply = await pet.async_visit(ada.id)
    assert reply["notes"] == [{"kind": "door2"}]
    assert pet.people.memory_said(ada.id, "door2") == today()
    client = await hass_ws_client(hass, token)
    assert (await switch(client, False, shared=False))["success"]
    stored = json.dumps(saved_people(hass_storage)[ada.id])
    assert "door" not in stored and "door" not in json.dumps(
        pet.people.data["people"][ada.id]
    )


@pytest.mark.parametrize("kind", ["fav_weather", "fav_season"])
async def test_ask_again_takes_the_favourites_memory_too(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, kind: str
) -> None:
    """Un-told (M0-c, section 4): its since_told day and door 6's one-shot go, this
    pet's option or not (an erase), saved at once."""
    ada, token = await a_user(hass)
    memory = full_memory()
    memory["since_told"][kind] = "2011-05-05"
    memory["said"][f"door6_{kind}"] = "2011-05-06"
    await start(
        hass,
        hass_storage,
        {ada.id: {"likes": {kind: "snow"}, "memory": memory}},
        **{CONF_MEMORY: False},
    )
    client = await hass_ws_client(hass, token)
    msg = await ws(
        client, "ask_again", entity_id="sensor.pip_mood", kind=kind, shared=False
    )
    assert msg["success"]
    stored = saved_people(hass_storage)[ada.id]["memory"]
    assert kind not in stored.get("since_told", {})
    assert f"door6_{kind}" not in stored["said"]
    assert stored["said"]["door2"] == "2011-03-03"  # the rest stays


# --- The household option and its erase (section 5, FM Q-C) -------------------------


async def turn_memory(hass: HomeAssistant, entry_id: str, on: bool) -> None:
    form = await open_topic(hass, entry_id, "people")
    values = shown(form) | {CONF_MEMORY: on}
    result = await hass.config_entries.options.async_configure(form["flow_id"], values)
    assert result["type"] == "create_entry"
    await hass.async_block_till_done()


async def test_an_unrelated_option_on_the_only_pet_erases_nothing(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    pet = await start(hass, hass_storage, {"u": {"memory": full_memory()}})
    await turn_memory(hass, "test_pet", True)  # saves the topic, reloads the pet
    form = await open_topic(hass, "test_pet", "bedtime")
    await hass.config_entries.options.async_configure(form["flow_id"], shown(form))
    await hass.async_block_till_done()
    assert await hass.config_entries.async_reload("test_pet")
    await hass.async_block_till_done()
    people = hass.data[DOMAIN]["people"]
    assert people is pet.people and people.memory_on("u")
    # The daily prune never erases, allowed or not.
    people.prune_daily("2030-01-01")
    assert people.memory_on("u")


async def test_memory_off_on_the_only_pet_erases_once_and_saves(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    pet = await start(
        hass, hass_storage, {"u": {"memory": full_memory()}, "v": {"my_day": True}}
    )
    people = pet.people
    with patch.object(
        people, "forget_all_memory", wraps=people.forget_all_memory
    ) as erase:
        await turn_memory(hass, "test_pet", False)
        assert erase.call_count == 1
    assert "memory" not in people.data["people"]["u"]
    assert MARK not in json.dumps(hass_storage[PEOPLE_KEY])
    assert people.data["people"]["v"] == {"my_day": True}
    # Back on: nothing returns.
    await turn_memory(hass, "test_pet", True)
    assert not hass.data[DOMAIN]["people"].memory_on("u")


async def test_two_pets_erase_only_when_the_second_goes_off(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    pet = await start(hass, hass_storage, {"u": {"memory": full_memory()}})
    moss = a_pet(hass, "moss")
    assert await hass.config_entries.async_setup(moss.entry_id)
    await hass.async_block_till_done()
    await turn_memory(hass, "test_pet", False)
    assert pet.people.memory_on("u")
    await turn_memory(hass, "moss", False)
    assert not pet.people.memory_on("u")
    assert "memory" not in saved_people(hass_storage)["u"]


async def test_the_admin_erase_tells_every_loaded_pets_watchers(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Audit finding 5: the erase pushes to the pets that stay loaded, so a card on
    another pet never keeps a stale memory_on (the row shows while on)."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": full_memory()}})
    moss = a_pet(hass, "moss")
    assert await hass.config_entries.async_setup(moss.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id(
        {"type": f"{DOMAIN}/subscribe", "entity_id": "sensor.pip_mood", "shared": False}
    )
    assert (await client.receive_json())["success"]
    assert (await client.receive_json())["event"]["mine"]["memory_on"] is True
    await turn_memory(hass, "test_pet", False)  # moss still allows it: no erase
    assert pet.people.memory_on(ada.id)
    await turn_memory(hass, "moss", False)  # the last one: erased, and Pip's card hears
    assert not pet.people.memory_on(ada.id)
    seen = []
    while True:
        try:
            msg = await asyncio.wait_for(client.receive_json(), 0.2)
        except TimeoutError:
            break
        seen.append(msg["event"])
    assert any(e.get("mine", {}).get("memory_on") is False for e in seen), seen


async def test_a_disabled_pet_that_allows_memory_blocks_the_erase(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    pet = await start(hass, hass_storage, {"u": {"memory": full_memory()}})
    fern = a_pet(hass, "fern")
    await hass.config_entries.async_set_disabled_by(
        fern.entry_id, ConfigEntryDisabler.USER
    )
    await turn_memory(hass, "test_pet", False)
    assert pet.people.memory_on("u")


async def test_removing_a_pet_erases_when_no_other_allows_it(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """Removal (FM Q-C): A on and B off, remove A -> erased and saved."""
    pet = await start(hass, hass_storage, {"u": {"memory": full_memory()}})
    a_pet(hass, "moss", **{CONF_MEMORY: False})
    people = pet.people
    assert await hass.config_entries.async_remove("test_pet")
    await hass.async_block_till_done()
    assert not people.memory_on("u")
    assert "memory" not in saved_people(hass_storage)["u"]


async def test_removing_a_pet_keeps_memory_while_another_allows_it(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """A on and B on, remove A -> nothing; a disabled C that allows it blocks it too."""
    pet = await start(hass, hass_storage, {"u": {"memory": full_memory()}})
    a_pet(hass, "moss")
    assert await hass.config_entries.async_remove("test_pet")
    await hass.async_block_till_done()
    assert pet.people.memory_on("u")
    # Moss now goes off; a disabled Fern still allows it.
    fern = a_pet(hass, "fern")
    await hass.config_entries.async_set_disabled_by(
        fern.entry_id, ConfigEntryDisabler.USER
    )
    hass.config_entries.async_update_entry(
        hass.config_entries.async_get_entry("moss"), options={CONF_MEMORY: False}
    )
    assert await hass.config_entries.async_remove("moss")
    await hass.async_block_till_done()
    assert pet.people.memory_on("u")


async def test_removing_the_only_pet_erases(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    pet = await start(hass, hass_storage, {"u": {"memory": full_memory()}})
    people = pet.people
    assert await hass.config_entries.async_remove("test_pet")
    await hass.async_block_till_done()
    assert not people.memory_on("u")
    assert "memory" not in saved_people(hass_storage)["u"]


async def test_no_people_store_saves_the_option_and_finishes_the_removal(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """Failure modes (M1 S8): `.get`, never `["people"]`."""
    await hass.config.async_set_time_zone("UTC")
    lone = a_pet(hass, "lone", **{CONF_MEMORY: False})
    assert DOMAIN not in hass.data  # never set up: no people store
    await async_remove_entry(hass, lone)
    entry = a_pet(hass, "test_pet")
    assert DOMAIN not in hass.data
    await turn_memory(hass, "test_pet", False)  # the reload sets the pet up after
    assert entry.options[CONF_MEMORY] is False


async def test_a_damaged_store_takes_memory_into_its_damaged_copy(
    hass: HomeAssistant, hass_storage: dict[str, Any], storage_dir: Path
) -> None:
    """R12: memory goes with the record into the `.damaged` copy, and the store the
    pets start with has none."""
    record = {"people": {"u": {"memory": full_memory()}}}
    hass_storage[PEOPLE_KEY] = {
        "version": 1,
        "minor_version": 1,
        "key": PEOPLE_KEY,
        "data": [record],  # readable, but not a store
    }
    pet = await start(hass, hass_storage, None)
    assert pet.people.data == {"people": {}, "weather": {}}
    [damaged] = storage_dir.glob(f"{PEOPLE_KEY}.damaged.*")
    assert MARK in damaged.read_text()
    assert MARK not in json.dumps(hass_storage[PEOPLE_KEY])


# --- Never off the private path (R4, R9) ---------------------------------------------


async def test_full_memory_is_on_no_sensor_view_log_bus_dump_or_assist(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Sensors and attributes, `_house_view`, debug, bus, logs, diagnostics, Assist
    and the LLM tools: with memory at its caps none holds a remembered date or tag.

    Diagnostics (M1 B3): this passes because the people store is not dumped and
    nothing writes memory into the pet's save; that is the real guard. No test here
    claims "no user id" for the dump or the store (bonds keep ids by decision)."""
    caplog.set_level(logging.DEBUG, logger="custom_components.virtual_pet")
    caplog.set_level(logging.DEBUG, logger="homeassistant.components.websocket_api")
    bus = async_capture_events(hass, MATCH_ALL)
    me = hass_admin_user.id
    pet = await start(hass, hass_storage, {me: {"memory": full_memory()}})
    # Set up everything that registers an HTTP view before hass_ws_client starts the
    # HTTP app: after that the router is frozen and a late view fails the test at random.
    assert await async_setup_component(hass, "homeassistant", {})
    assert await async_setup_component(hass, "intent", {})
    assert await async_setup_component(hass, "llm", {})
    client = await hass_ws_client(hass)
    assert (await switch(client, True, shared=False))["success"]
    assert (await answer(client, "dream", "snacks", shared=False))["success"]
    assert (await switch(client, True, shared=True))["error"]["code"] == "shared"
    await pet.async_visit(me)
    await hass.async_block_till_done()
    assert pet.people.memory(me)["picks"]["dream"][-1]["day"] == today()
    spoken = await intent.async_handle(
        hass, "test", "VirtualPetStatus", {}, context=Context(user_id=me)
    )
    api = await llm.async_get_api(
        hass,
        llm.LLM_API_ASSIST,
        llm.LLMContext(
            platform="test",
            context=Context(user_id=me),
            language="en",
            assistant="conversation",
            device_id=None,
        ),
    )
    tool = await api.async_call_tool(llm.ToolInput("virtual_pet__status", {}))
    outputs = {
        "states": [s.as_dict() for s in hass.states.async_all()],
        "house": pet._house_view(),
        "debug": pet.debug,
        "save": pet.state.to_dict(),
        "diagnostics": await async_get_config_entry_diagnostics(
            hass, hass.config_entries.async_get_entry("test_pet")
        ),
        "spoken": spoken.as_dict(),
        "tool": tool,
        "prompt": api.api_prompt,
        "bus": [(e.event_type, e.data) for e in bus],
        # Ours and HA's websocket log; the test harness's own "Loading data" line
        # (pytest_homeassistant_custom_component) echoes the seeded store.
        "log": [
            r.getMessage()
            for r in caplog.records
            if not r.name.startswith("pytest_homeassistant_custom_component")
        ],
    }
    for name, out in outputs.items():
        text = json.dumps(out, default=str)
        assert MARK not in text, name
        assert "work_thing" not in text and "something_else" not in text, name
        # A log line holds Python reprs ('memory_on'), json.dumps escapes a quote: both
        # forms are read as one, or the log half could never match (M3a).
        plain = text.replace('\\"', '"').replace("'", '"')
        assert '"memory_on"' not in plain and "since_told" not in plain, name


async def test_mine_and_the_visit_carry_two_booleans_and_nothing_kept(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """`_mine`, `_visit_prefs`, the visit reply and the channel snapshot."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": full_memory()}})
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id(
        {"type": f"{DOMAIN}/subscribe", "entity_id": "sensor.pip_mood", "shared": False}
    )
    assert (await client.receive_json())["success"]
    snapshot = (await client.receive_json())["event"]
    reply = await pet.async_visit(ada.id)
    for out in (pet._mine(ada.id), pet._visit_prefs(ada.id), reply, snapshot):
        found = {k: v for k, v in _walk(out) if "memory" in k}
        assert found == {"memory_on": True, "memory_allowed": True}, found
        text = json.dumps(out, default=str)
        assert MARK not in text and "work_thing" not in text


def _walk(value: Any) -> list[tuple[str, Any]]:
    if isinstance(value, dict):
        return [pair for k, v in value.items() for pair in [(k, v), *_walk(v)]]
    if isinstance(value, list):
        return [pair for v in value for pair in _walk(v)]
    return []


READS_PEOPLE = (
    r"import[^\n]*\bPeople\b|\bPeople\(|: People\b|data\[\"people\"\]|\.people\."
)


def test_no_new_reader_of_the_people_store() -> None:
    """No new consumer: sensors, Assist, the LLM tools, diagnostics and phone
    messages never read the people store (they are the outputs R4 rules out)."""
    for name in ("sensor.py", "intent.py", "llm.py", "diagnostics.py", "notify.py"):
        source = (SRC / name).read_text()
        assert not re.search(READS_PEOPLE, source), name


def test_the_store_is_the_only_place_memory_is_kept() -> None:
    """Backups: one file, the people store; no new store key, no localStorage."""
    sources = "".join(p.read_text() for p in SRC.glob("*.py"))
    assert "virtual_pet.memory" not in sources
    card = "".join(p.read_text() for p in (ROOT / "src" / "card").glob("*.js"))
    assert "hatch-memory" not in card


# --- The guide (section 8, M1a's docs test) -------------------------------------------


GUIDE_STRINGS = (
    "**Memory (off unless you turn it on).**",
    "never typed words",
    "Home Assistant's backups",
    "a shared login",
    "a downgrade",
    "debug logging",
    "children",
    "baby talk",
    "disabled pet's option still counts",
    "kept in each pet's own save, not the people store",
    'goes with "forget my data" on every pet that is loaded',
    "the pets still won't ask whether to remember",
    "and memory",
    "removing a pet",
    '"remember me" in settings',
    # M1b: the ask, the doors, "great".
    '"can i remember what you tell me?"',
    "**What the pets say from memory.**",
    "the card's own check",
    '"great" is kept only while memory is on',
    # M2: the tags.
    "**Tags.**",
    "exam, match, show, trip, party, lesson, work thing or something else",
    "the Saturday for a weekend; never what you typed",
    '"work thing" and "something else" are never said back',
    "a week after that day",
    "not for an exam",
    "between 11:00 and 20:00",
    "friends for a whole year",
    'They say "you told me", never that the day happened, and never count.',
    "maybe a match tomorrow! go you ♥",
    "one such remark a month at most across all three",
    "the pattern has ended",
    # M3a: removed users (owner Q4).
    "memory of a person whose Home Assistant user has been removed is erased by the next"
    " daily clean-up",
)


def test_the_guide_says_what_memory_keeps_and_where() -> None:
    """Backups, child users, downgrade, debug logging, the shared login, the dream
    pick carve-out (M1 S9) and memory_asked's line: exact strings, so this can fail."""
    guide = (ROOT / "docs" / "guide.md").read_text()
    section = guide.split("### Privacy: what the pets remember", 1)[1].split("\n### ")[
        0
    ]
    section = " ".join(section.split())
    for text in GUIDE_STRINGS:
        assert text in section, text
    assert "isn't on the card yet" not in section  # the row shipped


# --- M1b: the ask, "great", the doors (plan sections 5, 6, 8, 10) ---------------------

# Asked everything that comes before it: the favourites (this world's visitor too) and
# the birthday (skipped), so the memory ask is next in once_due.
READY = {
    "likes": {"fav_weather": "snow", "fav_season": "winter", "visitor_woodland": "x"},
    "birthday_skipped": True,
}
ASK_DAY = "2026-11-02"  # a Monday: its day 4 is a plain Thursday


def ask_pure(person: dict[str, Any], today: str = ASK_DAY, **kw: Any) -> str | None:
    args = {
        "level": 4,
        "to_bed_minutes": 400,
        "has_forecast": True,
        "came_home": "home",
        "rested": False,
        "world": "woodland",
        "memory_ask": True,
    } | kw
    return P.choose_question(person, today, kw.pop("hour", 14), **args)


def test_the_memory_ask_comes_after_the_birthday_where_allowed_and_held() -> None:
    """Level 4, after the birthday; only where the pet allows it; never once
    answered, while memory is on, or while baby talk is on (FM Q-D)."""
    assert ask_pure(copy.deepcopy(READY)) == "memory"
    assert ask_pure({"likes": READY["likes"]}) == "birthday"  # the birthday first
    assert ask_pure(copy.deepcopy(READY), memory_ask=False) == "big_day"  # Monday's
    assert ask_pure(copy.deepcopy(READY), level=3) == "big_day"
    for held in ({"memory_asked": True}, {"baby_talk": True}, {"memory": {"on": True}}):
        assert ask_pure({**copy.deepcopy(READY), **held}) == "big_day", held
    assert "memory" not in P.ONCE_KINDS and "memory" not in dict(P.ONCE)


def test_an_unshown_ask_is_chosen_three_days_in_fourteen_then_again() -> None:
    """Stale card (M1 S3, FM Q5): chosen with no "shown" on 3 days, then the later
    slot is how_day's on day 4; within the 14 days it rests, then it is tried again.
    The list is cut to the loader's 7, so a restart never resets the bound."""
    person = copy.deepcopy(READY)
    first = date.fromisoformat(ASK_DAY)
    for n in range(3):
        day = (first + timedelta(days=n)).isoformat()
        assert ask_pure(person, day) == "memory", day
        P.mark_asked(person, day, 14, "memory")
        P.memory_chosen(person, day)
    assert ask_pure(person, (first + timedelta(days=3)).isoformat()) == "how_day"
    for n in range(
        4, 14
    ):  # resting (a Friday's is the weekend ask, a Sunday's big day)
        assert ask_pure(person, (first + timedelta(days=n)).isoformat()) != "memory"
    assert ask_pure(person, (first + timedelta(days=14)).isoformat()) == "memory"
    # Never more than 7 days kept, the newest, and the loader keeps them.
    for n in range(20):
        P.memory_chosen(person, (first + timedelta(days=30 + n)).isoformat())
    days = person["memory_chosen_days"]
    assert len(days) == 7 and days[-1] == (first + timedelta(days=49)).isoformat()
    assert P._person(person)["memory_chosen_days"] == days
    P.memory_chosen(person, days[-1])  # twice on one day counts once
    assert person["memory_chosen_days"] == days


def test_a_saved_memory_ask_survives_a_reload() -> None:
    asked = {"day": ASK_DAY, "later": True, "later_kind": "memory"}
    assert P._person({"asked": asked})["asked"] == asked


async def ready_pet(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: Any,
    user: str,
    record: dict[str, Any] | None = None,
    **options: Any,
) -> Any:
    """Pip, `user` at bond level 4 and asked all before memory. The test freezes the
    time first (before a_user: a token made earlier would have run out)."""
    pet = await start(
        hass, hass_storage, {user: record or copy.deepcopy(READY)}, **options
    )
    pet.state.bonds.setdefault(user, {})["points"] = 25
    assert pet.bond_for(user)[0] == 4
    return pet


async def test_the_ask_counts_only_once_the_card_says_it_showed_it(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    """The ask (M1 S3): chosen, it writes no likes_asked and no once_last, only the
    day; "shown" from their own screen counts it and clears the days; a stray one,
    or one from a shared screen, counts for nothing."""
    freezer.move_to("2026-11-02 14:00:00+00:00")
    ada, token = await a_user(hass)
    pet = await ready_pet(hass, hass_storage, freezer, ada.id)
    client = await hass_ws_client(hass, token)
    person = pet.people.data["people"][ada.id]
    # A stray "shown", nothing asked today.
    assert not (await answer(client, "memory", "shown", shared=False))["success"]
    assert pet._question(ada.id, pet._now(), "home", []) == "memory"
    assert "likes_asked" not in person and "once_last" not in person
    assert person["memory_chosen_days"] == [ASK_DAY]
    for extra in ({}, {"shared": True}):
        msg = await answer(client, "memory", "shown", **extra)
        assert msg["error"]["code"] == "not_asked", extra
    assert "likes_asked" not in person and person["memory_chosen_days"] == [ASK_DAY]
    assert (await answer(client, "memory", "shown", shared=False))["success"]
    assert person["likes_asked"] == {"memory": [ASK_DAY]}
    assert person["once_last"] == ASK_DAY
    assert "memory_chosen_days" not in person
    assert (await answer(client, "memory", "shown", shared=False))["success"]
    assert person["likes_asked"] == {"memory": [ASK_DAY]}  # one try a day


async def test_a_card_that_never_says_shown_gets_how_day_on_day_four(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    freezer.move_to("2026-11-02 14:00:00+00:00")
    ada, _ = await a_user(hass)
    pet = await ready_pet(hass, hass_storage, freezer, ada.id)
    got = []
    for n in range(4):
        freezer.move_to(f"2026-11-{2 + n:02d} 14:00:00+00:00")
        got.append(pet._question(ada.id, pet._now(), "home", []))
    assert got == ["memory", "memory", "memory", "how_day"]
    freezer.move_to("2026-11-16 14:00:00+00:00")  # 14 days after the first
    assert pet._question(ada.id, pet._now(), "home", []) == "memory"


async def ask_memory(pet: Any, user: str) -> None:
    assert pet._question(user, pet._now(), "home", []) == "memory"


async def test_yes_turns_memory_on_and_not_now_ends_the_ask(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    """Both set memory_asked, close the slot and are not asked again; yes is the
    switch's effect. Refused: no ask today, shared true or absent."""
    freezer.move_to("2026-11-02 14:00:00+00:00")
    ada, token = await a_user(hass)
    pet = await ready_pet(hass, hass_storage, freezer, ada.id)
    client = await hass_ws_client(hass, token)
    assert not (await answer(client, "memory", "yes", shared=False))["success"]
    await ask_memory(pet, ada.id)
    for extra in ({}, {"shared": True}):
        msg = await answer(client, "memory", "yes", **extra)
        assert msg["error"] == {"code": "not_asked", "message": "It didn't ask that"}
    assert not pet.people.memory_on(ada.id)
    assert (await answer(client, "memory", "yes", shared=False))["success"]
    assert pet.people.memory(ada.id) == {"on": True, "since": ASK_DAY}
    person = pet.people.data["people"][ada.id]
    assert person["memory_asked"] is True
    assert "memory_chosen_days" not in person  # the unshown days mean nothing now
    assert "later_kind" not in person["asked"]
    assert not (await answer(client, "memory", "not_now", shared=False))["success"]
    # Yes, then off: never asked again (the settings row is the way back).
    assert (await switch(client, False, shared=False))["success"]
    assert ask_pure(person, "2026-12-20") != "memory"
    # Not now.
    bob, bob_token = await a_user(hass)
    pet.people.data["people"][bob.id] = copy.deepcopy(READY)
    pet.state.bonds.setdefault(bob.id, {})["points"] = 25
    await ask_memory(pet, bob.id)
    bob_client = await hass_ws_client(hass, bob_token)
    assert (await answer(bob_client, "memory", "not_now", shared=False))["success"]
    bob_person = pet.people.data["people"][bob.id]
    assert bob_person["memory_asked"] is True and not pet.people.memory_on(bob.id)
    assert "memory_chosen_days" not in bob_person
    assert ask_pure(bob_person, "2026-12-20") != "memory"
    # Forget me keeps the refusal: still not asked.
    assert (await ws(bob_client, "forget_me"))["success"]
    assert pet.people.data["people"][bob.id]["memory_asked"] is True


async def test_the_settings_row_counts_as_answering_the_ask(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    """Using the row, on or off, is an answer (M1b audit finding 1): the ask is not
    due, the unshown days go, and "forget my data" keeps it."""
    freezer.move_to("2026-11-02 14:00:00+00:00")
    ada, token = await a_user(hass)
    pet = await ready_pet(hass, hass_storage, freezer, ada.id)
    client = await hass_ws_client(hass, token)
    person = pet.people.data["people"][ada.id]
    await ask_memory(pet, ada.id)  # due, with a chosen day
    assert person["memory_chosen_days"] == [ASK_DAY]
    # On.
    assert (await switch(client, True, shared=False))["success"]
    assert person["memory_asked"] is True and "memory_chosen_days" not in person
    assert ask_pure(person, "2026-12-20") != "memory"
    # Then off.
    assert (await switch(client, False, shared=False))["success"]
    assert not pet.people.memory_on(ada.id)
    assert person["memory_asked"] is True
    assert ask_pure(person, "2026-12-20") != "memory"
    # Off alone, on someone who never turned it on and was never asked.
    bob, bob_token = await a_user(hass)
    pet.people.data["people"][bob.id] = copy.deepcopy(READY)
    pet.state.bonds.setdefault(bob.id, {})["points"] = 25
    await ask_memory(pet, bob.id)
    bob_client = await hass_ws_client(hass, bob_token)
    assert (await switch(bob_client, False, shared=False))["success"]
    bob_person = pet.people.data["people"][bob.id]
    assert bob_person["memory_asked"] is True
    assert ask_pure(bob_person, "2026-12-20") != "memory"
    # Forget me keeps it.
    assert (await ws(bob_client, "forget_me"))["success"]
    assert pet.people.data["people"][bob.id]["memory_asked"] is True


async def test_yes_is_refused_where_the_pet_does_not_allow_memory(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    freezer.move_to("2026-11-02 14:00:00+00:00")
    ada, token = await a_user(hass)
    pet = await ready_pet(hass, hass_storage, freezer, ada.id, **{CONF_MEMORY: False})
    assert pet._question(ada.id, pet._now(), "home", []) == "big_day"  # not asked
    person = pet.people.data["people"][ada.id]
    person["asked"] = {"day": ASK_DAY, "later": True, "later_kind": "memory"}
    client = await hass_ws_client(hass, token)
    assert not (await answer(client, "memory", "yes", shared=False))["success"]
    assert not pet.people.memory_on(ada.id) and "memory_asked" not in person


# --- "great" (M1 B2, FM Q-A) -----------------------------------------------------------


async def test_great_is_kept_only_with_memory_on_and_never_sets_a_soft_morning(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {}})
    client = await hass_ws_client(hass, token)
    person = pet.people.data["people"][ada.id]

    def asked(kind: str = "how_day") -> None:
        person["asked"] = {"day": today(), "later": True, "later_kind": kind}

    # Memory off: the fixed refusal, no mood, the slot left for "tough".
    asked()
    msg = await answer(client, "how_day", "great", shared=False)
    assert msg["error"] == {"code": "not_asked", "message": "It didn't ask that"}
    assert pet.people._moods == {} and person["asked"]["later_kind"] == "how_day"
    assert (await switch(client, True, shared=False))["success"]
    for extra in ({}, {"shared": True}):  # not their own screen
        assert not (await answer(client, "how_day", "great", **extra))["success"]
    assert pet.people._moods == {} and "picks" not in pet.people.memory(ada.id)
    assert (await answer(client, "how_day", "great", shared=False))["success"]
    assert pet.people._moods == {}
    assert pet.people.memory(ada.id)["picks"]["great"] == [
        {"day": today(), "ask": "how_day"}
    ]
    assert "later_kind" not in person["asked"]
    assert not (await answer(client, "how_day", "great", shared=False))["success"]
    # big_how's evening too; "tough" as ever: the mood, nothing kept.
    asked("big_how")
    assert (await answer(client, "big_how", "tough", shared=False))["success"]
    assert ada.id in pet.people._moods
    assert pet.people.memory(ada.id)["picks"]["great"] == [
        {"day": today(), "ask": "how_day"}
    ]


async def test_great_is_refused_where_the_pet_does_not_allow_memory(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    record = {
        "memory": {"on": True},
        "asked": {"day": today(), "later_kind": "how_day"},
    }
    pet = await start(hass, hass_storage, {ada.id: record}, **{CONF_MEMORY: False})
    client = await hass_ws_client(hass, token)
    assert not (await answer(client, "how_day", "great", shared=False))["success"]
    assert pet.people._moods == {} and pet.people.memory(ada.id) == {"on": True}


# --- The doors (section 6, "Door timing") ----------------------------------------------


def picks(kind: str, values: list[str], start: str = "2026-10-20") -> list[dict]:
    first = date.fromisoformat(start)
    field = P.MEMORY_PICKS[kind][0]
    return [
        {"day": (first + timedelta(days=i)).isoformat(), field: v}
        for i, v in enumerate(values)
    ]


def door_memory() -> dict[str, Any]:
    """Every pick door due on 2026-11-03, and door 2 (a great day on the 2nd)."""
    return {
        "on": True,
        "since": "2026-10-01",
        "picks": {
            "great": [{"day": "2026-11-02", "ask": "how_day"}],
            "dream": picks("dream", ["snacks", "sea", "snacks", "stars", "snacks"]),
            "guess": picks("guess", ["sun"] * 5),
            "game": picks("game", ["dig", "dig", "left_right", "dig", "dig"]),
        },
    }


def test_the_doors_by_their_timing() -> None:
    mem = door_memory()
    day = "2026-11-03"
    assert P.memory_door(mem, day, 9) == ("door2", {"kind": "door2"})
    assert P.memory_door(mem, day, 12) == ("door4", {"kind": "door4", "pick": "snacks"})
    assert P.memory_door(mem, day, 10) == ("door2", {"kind": "door2"})
    mem["said"] = {"door2": day}
    assert P.memory_door(mem, day, 9) is None  # once for one great day
    assert P.memory_door(mem, day, 10) is None  # door 4 waits for 11
    mem["said"]["door4"] = day
    assert P.memory_door(mem, day, 12) == ("door5", {"kind": "door5", "pick": "sun"})
    mem["said"]["door5"] = day
    assert P.memory_door(mem, day, 12) == ("door12", {"kind": "door12", "pick": "dig"})
    mem["said"]["door12"] = day
    assert P.memory_door(mem, day, 12) is None
    assert P.memory_door(mem, day, 20) is None
    # Door 5 not the next day (7 days apart), nor a week on with no new guess.
    assert P.memory_door(mem, "2026-11-04", 12) is None
    assert P.memory_door(mem, "2026-11-10", 12) is None
    mem["picks"]["guess"] = picks("guess", ["sun"] * 5, start="2026-11-05")
    assert P.memory_door(mem, "2026-11-10", 12) == (
        "door5",
        {"kind": "door5", "pick": "sun"},
    )
    # Two of five the same is no door; four suns and a rain is no door 5.
    mem = door_memory()
    mem["picks"]["dream"] = picks("dream", ["snacks", "sea", "snacks", "stars", "you"])
    mem["picks"]["guess"] = picks("guess", ["sun"] * 4 + ["rain"])
    mem["picks"]["game"] = []
    assert P.memory_door(mem, day, 12) is None


async def door_visit(pet: Any, user: str, **kw: Any) -> dict[str, Any]:
    pet._visits.clear()
    return await pet.async_visit(user, **kw)


def door_notes(reply: dict[str, Any]) -> list[dict[str, Any]]:
    return [n for n in reply["notes"] if n["kind"].startswith("door")]


@pytest.mark.parametrize(
    ("record", "options"),
    [
        ({}, {}),  # memory off, never on
        ({"memory": door_memory()}, {CONF_MEMORY: False}),  # this pet's option off
    ],
)
async def test_no_door_without_memory_on_here(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer,
    record: dict[str, Any],
    options: dict[str, Any],
) -> None:
    freezer.move_to("2026-11-03 12:00:00+00:00")
    ada, _ = await a_user(hass)
    pet = await ready_pet(
        hass,
        hass_storage,
        freezer,
        ada.id,
        record=record,
        **options,
    )
    with patch.object(pet.people, "mark_memory_said", side_effect=AssertionError):
        reply = await door_visit(pet, ada.id)
    assert door_notes(reply) == []
    assert "said" not in (pet.people.data["people"][ada.id].get("memory") or {})


async def test_one_door_a_look_in_order_and_a_door_with_no_room_waits(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    """Doors 4 and 5 due: the lower goes and the other is not marked; no room, none
    is marked; the next look brings door 5. A note holds its kind and at most one
    fixed-list pick, nothing dated (FM Q1)."""
    freezer.move_to("2026-11-03 12:00:00+00:00")
    ada, _ = await a_user(hass)
    pet = await ready_pet(
        hass,
        hass_storage,
        freezer,
        ada.id,
        record={"memory": door_memory()},
    )
    reply = await door_visit(pet, ada.id, queued=3)  # a full look
    assert door_notes(reply) == [] and pet.people.memory_said(ada.id, "door4") is None
    reply = await door_visit(pet, ada.id)
    assert door_notes(reply) == [{"kind": "door4", "pick": "snacks"}]
    assert pet.people.memory_said(ada.id, "door4") == "2026-11-03"
    assert pet.people.memory_said(ada.id, "door5") is None
    reply = await door_visit(pet, ada.id)
    assert door_notes(reply) == [{"kind": "door5", "pick": "sun"}]
    for note in door_notes(reply):
        assert set(note) <= {"kind", "pick", "tag"}
    noted = pet.people.data["people"][ada.id].get("noted") or {}
    assert not any(k.startswith("door") for k in noted)


@pytest.mark.parametrize(
    ("kind", "carrier"), [("fav_weather", "fav_weather"), ("fav_season", "season")]
)
async def test_door_six_rides_the_favourites_note_once_and_marks_both(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer, kind: str, carrier: str
) -> None:
    """Door 6 (FM Q-B, problem 4): the note gains only `told`; when it goes out it is
    marked once a day as ever (`noted`) and its one-shot in memory; with no room
    neither; the next time, no `told`."""
    freezer.move_to("2026-11-03 10:00:00+00:00")
    ada, _ = await a_user(hass)
    memory = {"on": True, "since": "2026-10-01", "since_told": {kind: "2026-11-01"}}
    record = {**copy.deepcopy(READY), "memory": memory}
    pet = await ready_pet(
        hass,
        hass_storage,
        freezer,
        ada.id,
        at="2026-11-03 10:00:00+00:00",
        record=record,
    )
    pet._weather_now = {"snow"}

    def ours(reply: dict[str, Any]) -> list[dict[str, Any]]:
        return [n for n in reply["notes"] if n["kind"] == carrier]

    with (
        patch.object(P, "season_key", return_value="winter-2026"),
        patch("custom_components.virtual_pet.notify.holiday", return_value=None),
    ):
        assert ours(await door_visit(pet, ada.id, queued=3)) == []
        assert pet.people.memory_said(ada.id, f"door6_{kind}") is None
        got = ours(await door_visit(pet, ada.id))
        value = (
            {"weather": "snow"} if carrier == "fav_weather" else {"season": "winter"}
        )
        assert got == [{"kind": carrier, **value, "told": True}]
        assert pet.people.memory_said(ada.id, f"door6_{kind}") == "2026-11-03"
        noted = pet.people.data["people"][ada.id]["noted"]
        assert carrier in noted
        # The next time the favourite comes back: its plain note, no told.
        freezer.move_to("2026-11-04 10:00:00+00:00")
        pet.people.data["people"][ada.id]["noted"] = {}
        assert ours(await door_visit(pet, ada.id)) == [{"kind": carrier, **value}]


async def test_door_six_waits_for_a_later_day_than_the_telling(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    freezer.move_to("2026-11-03 10:00:00+00:00")
    ada, _ = await a_user(hass)
    memory = {
        "on": True,
        "since": "2026-10-01",
        "since_told": {"fav_weather": "2026-11-03"},
    }
    record = {**copy.deepcopy(READY), "memory": memory}
    pet = await ready_pet(
        hass,
        hass_storage,
        freezer,
        ada.id,
        at="2026-11-03 10:00:00+00:00",
        record=record,
    )
    pet._weather_now = {"snow"}
    notes = (await door_visit(pet, ada.id))["notes"]
    assert {"kind": "fav_weather", "weather": "snow"} in notes


# --- since_told (section 4; problem 5) -------------------------------------------------


async def test_since_told_is_written_only_from_their_screen_for_weather_and_season(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {}})
    client = await hass_ws_client(hass, token)
    assert (await switch(client, True, shared=False))["success"]
    assert (await answer(client, "fav_weather", "rain", shared=False))["success"]
    assert (await answer(client, "fav_season", "spring", shared=False))["success"]
    told = pet.people.memory(ada.id)["since_told"]
    assert told == {"fav_weather": today(), "fav_season": today()}
    # Told again the same: its day stays. Told from a shared screen: the day goes.
    told["fav_weather"] = "2026-01-01"
    assert (await answer(client, "fav_weather", "rain", shared=False))["success"]
    assert told["fav_weather"] == "2026-01-01"
    assert (await answer(client, "fav_weather", "sun", shared=True))["success"]
    assert pet.people.data["people"][ada.id]["likes"]["fav_weather"] == "sun"
    assert "fav_weather" not in pet.people.memory(ada.id)["since_told"]
    # No visitor door (FM Q-B): a visitor's favourite has no since_told.
    visitor = pet.visitors[0]["id"]
    assert (await answer(client, "fav_visitor", visitor, shared=False))["success"]
    assert set(pet.people.memory(ada.id)["since_told"]) == {"fav_season"}


async def test_since_told_goes_where_the_pet_does_not_allow_memory(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    memory = {"on": True, "since_told": {"fav_season": "2026-01-01"}}
    pet = await start(
        hass, hass_storage, {ada.id: {"memory": memory}}, **{CONF_MEMORY: False}
    )
    client = await hass_ws_client(hass, token)
    assert (await answer(client, "fav_season", "summer", shared=False))["success"]
    assert pet.people.memory(ada.id).get("since_told", {}) == {}


# --- M2: the tags (plan sections 4, 5, 8 "Acceptance, tags", 10 "Tags") -----------------

MONDAY = "2026-11-02"  # a big day's ask; the day picked is the Thursday
THURSDAY = "2026-11-05"
FRIDAY = (
    "2026-11-06"  # a weekend's ask; its Saturday is the 7th, its due the Monday 9th
)


async def tag_pet(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: Any,
    day: str = MONDAY,
    on: bool = True,
    **options: Any,
) -> tuple[Any, Any, Any]:
    """Pip, and Ada asked a dated question today (big day or weekend), memory on."""
    freezer.move_to(f"{day} 17:00:00+00:00")
    ada, token = await a_user(hass)
    record = {"memory": {"on": True, "since": "2026-10-01"}} if on else {}
    pet = await start(hass, hass_storage, {ada.id: record}, **options)
    client = await hass_ws_client(hass, token)
    return pet, ada, client


def ask(pet: Any, user: str, kind: str = "big_day") -> None:
    pet.people.data["people"][user]["asked"] = {
        "day": today(),
        "later": True,
        "later_kind": kind,
    }


async def big_day_yes(client: Any, **extra: Any) -> dict[str, Any]:
    return await answer(client, "big_day", "yes", day=THURSDAY, **extra)


async def test_a_tag_rides_on_the_one_yes_keyed_by_the_events_day(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    """The big day's tag is kept on the day they picked; a "yes" with no tag keeps
    none; a repeated "yes" the same day replaces it (and the event, as ever)."""
    pet, ada, client = await tag_pet(hass, hass_storage, hass_ws_client, freezer)
    ask(pet, ada.id)
    assert (await big_day_yes(client, shared=False))["success"]
    assert "tags" not in pet.people.memory(ada.id)  # no tag: none kept
    assert pet.people.open_event(ada.id)["due"] == THURSDAY
    msg = await big_day_yes(client, shared=False, tag="show", text="the school play")
    assert msg["success"]
    assert pet.people.memory(ada.id)["tags"] == [
        {"day": THURSDAY, "kind": "big_day", "tag": "show"}
    ]
    # The dated ask keeps its slot after a "yes", so a hand-made repeat is answered
    # again: the one (day, kind) entry is replaced, not doubled.
    assert (await big_day_yes(client, shared=False, tag="match"))["success"]
    assert pet.people.memory(ada.id)["tags"] == [
        {"day": THURSDAY, "kind": "big_day", "tag": "match"}
    ]
    stored = saved_people(hass_storage)[ada.id]
    assert "school play" not in json.dumps(stored)  # typed words: memory only
    # Forgetting it leaves no twin.
    assert await pet.people.forget_item(ada.id, "tags", THURSDAY, "big_day")
    assert pet.people.memory(ada.id).get("tags") == []
    assert saved_people(hass_storage)[ada.id]["memory"]["tags"] == []


async def test_a_weekend_tag_is_kept_on_its_saturday(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    pet, ada, client = await tag_pet(
        hass, hass_storage, hass_ws_client, freezer, day=FRIDAY
    )
    ask(pet, ada.id, "weekend")
    msg = await answer(client, "weekend", "yes", shared=False, tag="trip")
    assert msg["success"]
    assert pet.people.open_event(ada.id)["due"] == "2026-11-09"  # the Monday
    assert pet.people.memory(ada.id)["tags"] == [
        {"day": "2026-11-07", "kind": "weekend", "tag": "trip"}
    ]


@pytest.mark.parametrize(
    "bad", ["dentist", "test", "", "SHOW", {"tag": "show"}, 3, ["show"], True, 1.5]
)
async def test_a_tag_outside_the_list_is_refused_and_nothing_is_kept(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer,
    caplog: pytest.LogCaptureFixture,
    bad: Any,
) -> None:
    """The one generic error, nothing saved (not the "yes", not the event), whatever
    the memory state; no log line holds the value (the field is `object`-typed, so no
    schema failure logs it). The websocket API's own DEBUG wire log ("Received {...}")
    logs every message whole, the guide says so; INFO and up is what it logs unasked."""
    caplog.set_level(logging.DEBUG, logger="custom_components.virtual_pet")
    caplog.set_level(logging.INFO, logger="homeassistant.components.websocket_api")
    pet, ada, client = await tag_pet(hass, hass_storage, hass_ws_client, freezer)
    ask(pet, ada.id)
    for extra in ({"shared": False}, {"shared": True}, {}):
        msg = await big_day_yes(client, tag=bad, **extra)
        assert msg["error"] == {"code": "not_asked", "message": "It didn't ask that"}
    assert pet.people.open_event(ada.id) is None
    assert "tags" not in pet.people.memory(ada.id)
    assert pet.people.data["people"][ada.id]["asked"]["later_kind"] == "big_day"
    # And with memory off: refused all the same (the list check comes first).
    await pet.people.forget_memory(ada.id)
    assert not (await big_day_yes(client, shared=False, tag=bad))["success"]
    assert pet.people.open_event(ada.id) is None
    log = " ".join(
        r.getMessage()
        for r in caplog.records
        if not r.name.startswith("pytest_homeassistant_custom_component")
    )
    if isinstance(bad, str) and bad:
        assert repr(bad) not in log and f'"{bad}"' not in log  # "test": test_pet's id
        assert bad == "test" or bad not in log
    assert "'tag'" not in log and '"tag"' not in log


async def test_a_tag_on_any_other_answer_is_refused(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    pet, ada, client = await tag_pet(hass, hass_storage, hass_ws_client, freezer)
    person = pet.people.data["people"][ada.id]
    ask(pet, ada.id, "how_day")
    msg = await answer(client, "how_day", "tough", shared=False, tag="exam")
    assert msg["error"]["code"] == "not_asked"
    assert pet.people._moods == {}  # nothing kept: not the soft morning either
    ask(pet, ada.id)
    msg = await answer(client, "big_day", "no", shared=False, tag="exam")
    assert msg["error"]["code"] == "not_asked"
    for question, value in (("dream", "sea"), ("guess", "sun")):
        msg = await answer(client, question, value, shared=False, tag="exam")
        assert msg["error"]["code"] == "not_asked"
    assert "guess" not in person and "tags" not in pet.people.memory(ada.id)
    assert "picks" not in pet.people.memory(ada.id)


async def test_a_tag_is_not_kept_without_todays_ask(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    pet, ada, client = await tag_pet(hass, hass_storage, hass_ws_client, freezer)
    assert not (await big_day_yes(client, shared=False, tag="show"))["success"]
    ask(pet, ada.id, "weekend")  # asked, but another kind
    assert not (await big_day_yes(client, shared=False, tag="show"))["success"]
    assert pet.people.open_event(ada.id) is None
    assert "tags" not in pet.people.memory(ada.id)


@pytest.mark.parametrize(
    ("memory", "options", "extra"),
    [
        (False, {}, {"shared": False}),  # memory off for this person
        (True, {CONF_MEMORY: False}, {"shared": False}),  # this pet's option off
        (True, {}, {}),  # an old card: no shared flag
        (True, {}, {"shared": True}),  # a shared screen
    ],
)
async def test_a_good_tag_that_cannot_be_kept_keeps_the_yes_silently(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer,
    memory: bool,
    options: dict[str, Any],
    extra: dict[str, Any],
) -> None:
    """FM s2782 Q7: no error, the big day and its words kept, no tag anywhere."""
    pet, ada, client = await tag_pet(
        hass, hass_storage, hass_ws_client, freezer, on=memory, **options
    )
    ask(pet, ada.id)
    bus = async_capture_events(hass, MATCH_ALL)
    msg = await big_day_yes(client, tag="party", text="nan's party", **extra)
    await hass.async_block_till_done()
    assert msg["success"] and msg["result"] == {"until": THURSDAY}
    assert pet.people.open_event(ada.id)["due"] == THURSDAY
    if not extra.get("shared"):  # a shared screen's words are never kept
        assert pet.people._texts[ada.id] == "nan's party"
    mem = pet.people.memory(ada.id)
    assert mem is None if not memory else "tags" not in mem
    text = json.dumps(saved_people(hass_storage), default=str)
    assert "party" not in text
    assert "party" not in json.dumps([(e.event_type, e.data) for e in bus], default=str)


async def test_the_bus_never_sees_a_kept_tag(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    pet, ada, client = await tag_pet(hass, hass_storage, hass_ws_client, freezer)
    ask(pet, ada.id)
    bus = async_capture_events(hass, MATCH_ALL)
    assert (await big_day_yes(client, shared=False, tag="lesson"))["success"]
    await hass.async_block_till_done()
    assert pet.people.memory(ada.id)["tags"][0]["tag"] == "lesson"
    text = json.dumps([(e.event_type, e.data) for e in bus], default=str)
    assert "lesson" not in text and THURSDAY not in text


# --- M2: doors 3, 1 and 11 (plan sections 6 "Door timing", 6a, 8 "Acceptance, doors") ---


def tag(day: str, name: str, kind: str = "big_day") -> dict[str, str]:
    return {"day": day, "kind": kind, "tag": name}


def tag_memory(*tags: dict[str, str], **said: str) -> dict[str, Any]:
    mem: dict[str, Any] = {"on": True, "since": "2025-01-01", "tags": list(tags)}
    if said:
        mem["said"] = dict(said)
    return mem


def test_door_three_a_year_after_once_and_not_for_exam() -> None:
    mem = tag_memory(tag("2025-11-03", "trip"))
    assert P.memory_door(mem, "2026-11-03", 12) == (
        "door3",
        {"kind": "door3", "tag": "trip"},
    )
    for day in ("2026-11-02", "2026-11-04", "2027-11-03", "2025-11-03"):
        assert P.memory_door(mem, day, 12) is None, day
    for hour in (10, 20, 23):  # outside the window: lost, not marked
        assert P.memory_door(mem, "2026-11-03", hour) is None
    assert (
        P.memory_door({**mem, "said": {"door3": "2026-11-03"}}, "2026-11-03", 12)
        is None
    )
    for name in ("exam", "work_thing", "something_else"):
        assert (
            P.memory_door(tag_memory(tag("2025-11-03", name)), "2026-11-03", 12) is None
        )
    weekend = tag_memory(tag("2025-11-03", "trip", "weekend"))
    assert P.memory_door(weekend, "2026-11-03", 12) is None


def test_door_three_takes_feb_29_as_feb_28() -> None:
    mem = tag_memory(tag("2028-02-29", "show"))
    assert P.memory_door(mem, "2029-02-28", 12) == (
        "door3",
        {"kind": "door3", "tag": "show"},
    )
    assert P.memory_door(mem, "2029-03-01", 12) is None
    # A Feb 28 tag never fires on a Feb 29, and Feb 29 itself fires nothing.
    mem = tag_memory(tag("2027-02-28", "show"))
    assert P.memory_door(mem, "2028-02-29", 12) is None
    assert P.memory_door(mem, "2028-02-28", 12) == (
        "door3",
        {"kind": "door3", "tag": "show"},
    )
    # A Feb 28 and a Feb 29 tag of one year: the later day's goes.
    mem = tag_memory(tag("2028-02-28", "match"), tag("2028-02-29", "party"))
    assert P.memory_door(mem, "2029-02-28", 12) == (
        "door3",
        {"kind": "door3", "tag": "party"},
    )


def test_door_one_a_week_after_once() -> None:
    mem = tag_memory(tag("2026-10-27", "exam"))
    assert P.memory_door(mem, "2026-11-03", 11) == (
        "door1",
        {"kind": "door1", "tag": "exam"},
    )
    assert P.memory_door(mem, "2026-11-03", 19) == (
        "door1",
        {"kind": "door1", "tag": "exam"},
    )
    for day in ("2026-11-02", "2026-11-04"):  # plus 6, plus 8
        assert P.memory_door(mem, day, 12) is None, day
    for hour in (10, 20):
        assert P.memory_door(mem, "2026-11-03", hour) is None
    said = {**mem, "said": {"door1": "2026-11-03"}}
    assert P.memory_door(said, "2026-11-03", 12) is None
    for name in ("work_thing", "something_else"):
        assert (
            P.memory_door(tag_memory(tag("2026-10-27", name)), "2026-11-03", 12) is None
        )
    weekend = tag_memory(tag("2026-10-27", "trip", "weekend"))
    assert P.memory_door(weekend, "2026-11-03", 12) is None


def test_the_doors_go_in_the_order_two_three_one_then_the_picks() -> None:
    """FM s2782 Q5: 2, 3, 1, 10, 4, 5, 12; a due door 1 does not take door 2's look."""
    mem = door_memory()  # doors 2, 4, 5, 12 due on 2026-11-03
    mem["tags"] = [tag("2025-11-03", "show"), tag("2026-10-27", "match")]
    day = "2026-11-03"
    assert P.memory_door(mem, day, 11)[0] == "door2"
    mem["said"] = {"door2": day}
    assert P.memory_door(mem, day, 11) == ("door3", {"kind": "door3", "tag": "show"})
    mem["said"]["door3"] = day
    assert P.memory_door(mem, day, 11) == ("door1", {"kind": "door1", "tag": "match"})
    mem["said"]["door1"] = day
    assert P.memory_door(mem, day, 11)[0] == "door4"


def test_door_eleven_reads_one_recent_named_tag() -> None:
    day = "2026-11-03"
    assert P.memory_recap(tag_memory(), day) is None
    mem = tag_memory(
        tag("2025-11-01", "party"),  # over a year ago
        tag("2026-03-01", "trip"),
        tag("2026-06-01", "exam"),
        tag("2026-09-01", "work_thing"),
        tag("2026-10-31", "something_else", "weekend"),
        tag("2026-11-05", "show"),  # ahead: not yet
    )
    assert P.memory_recap(mem, day) == "exam"
    only = tag_memory(
        tag("2026-09-01", "work_thing"), tag("2026-10-01", "show", "weekend")
    )
    assert P.memory_recap(only, day) is None
    # A year back to the day counts (M2 audit s2785 N2); a day older does not.
    assert P.memory_recap(tag_memory(tag("2025-11-03", "party")), day) == "party"
    assert P.memory_recap(tag_memory(tag("2025-11-02", "party")), day) is None


async def friends_pet(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: Any,
    record: dict[str, Any],
    months: int = 12,
    **options: Any,
) -> tuple[Any, str]:
    """Pip on 2026-11-03 at noon, Ada its friend for `months` whole months."""
    freezer.move_to("2026-11-03 12:00:00+00:00")
    ada, _ = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: record}, **options)
    since = f"{2026 - months // 12}-11-03"  # whole years only, as the tests use
    pet.state.bonds.setdefault(ada.id, {})["since"] = since
    pet.state.bonds[ada.id]["points"] = 25
    return pet, ada.id


def friends_note(reply: dict[str, Any]) -> dict[str, Any] | None:
    return next(
        (n for n in reply["notes"] if n["kind"] in ("friends_for", "birthday_friends")),
        None,
    )


async def test_door_eleven_rides_the_twelve_month_friends_note(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    mem = tag_memory(tag("2026-06-01", "lesson"), tag("2026-09-01", "work_thing"))
    pet, ada = await friends_pet(hass, hass_storage, freezer, {"memory": mem})
    with patch.object(pet.people, "mark_memory_said", side_effect=AssertionError):
        reply = await door_visit(pet, ada)
    note = friends_note(reply)
    assert note == {"kind": "friends_for", "months": 12, "tag": "lesson"}
    assert "said" not in pet.people.memory(ada)  # no memory mark for door 11
    assert set(note) - {"kind", "months"} == {"tag"}


@pytest.mark.parametrize(
    ("record", "options"),
    [
        ({"memory": tag_memory(tag("2026-09-01", "work_thing"))}, {}),
        ({"memory": tag_memory(tag("2026-09-01", "show", "weekend"))}, {}),
        ({"memory": tag_memory()}, {}),
        ({}, {}),  # memory off
        ({"memory": tag_memory(tag("2026-06-01", "show"))}, {CONF_MEMORY: False}),
    ],
)
async def test_door_eleven_carries_nothing_without_a_named_tag_here(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer,
    record: dict[str, Any],
    options: dict[str, Any],
) -> None:
    pet, ada = await friends_pet(hass, hass_storage, freezer, record, **options)
    reply = await door_visit(pet, ada)
    assert friends_note(reply) == {"kind": "friends_for", "months": 12}


async def test_door_eleven_not_at_twenty_four_months(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    mem = tag_memory(tag("2026-06-01", "show"))
    pet, ada = await friends_pet(hass, hass_storage, freezer, {"memory": mem}, 24)
    reply = await door_visit(pet, ada)
    assert friends_note(reply) == {"kind": "friends_for", "months": 24}


async def test_door_eleven_waits_a_look_when_the_pets_first_birthday_is_today(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    """At 12 months the pet's own first birthday is {"years": 1}, never
    birthday_friends (that is a first-year month only, model.pet_birthday), so the
    birthday takes the first look and the recap comes on the next, as the plain
    friends line does today (plan 6a's "lost when birthday_friends wins" cannot
    happen at 12 months: a question in the M2 report)."""
    mem = tag_memory(tag("2026-06-01", "show"))
    pet, ada = await friends_pet(hass, hass_storage, freezer, {"memory": mem})
    pet.state.hatched_on = "2025-11-03"  # a year old today
    reply = await door_visit(pet, ada)
    assert [n for n in reply["notes"] if n["kind"] == "pet_birthday"] == [
        {"kind": "pet_birthday", "years": 1}
    ]
    assert friends_note(reply) is None
    reply = await door_visit(pet, ada)
    assert friends_note(reply) == {"kind": "friends_for", "months": 12, "tag": "show"}


async def test_door_eleven_is_lost_when_birthday_friends_wins(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    """The one note birthday_friends carries no tag (it is never 12 months, above;
    checked here with a patched pet birthday that says it is)."""
    mem = tag_memory(tag("2026-06-01", "show"))
    pet, ada = await friends_pet(hass, hass_storage, freezer, {"memory": mem})
    pet.state.hatched_on = "2025-11-03"
    with patch(
        "custom_components.virtual_pet.model.pet_birthday",
        return_value={"months": 12},
    ):
        reply = await door_visit(pet, ada)
    assert friends_note(reply) == {"kind": "birthday_friends", "months": 12}


async def test_doors_one_and_three_go_out_one_a_look_marked_in_memory(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    """Off leaves no trace: the marks are in memory's said only; turning it off takes
    them, and `noted` never holds a door key."""
    freezer.move_to("2026-11-03 12:00:00+00:00")
    ada, token = await a_user(hass)
    mem = tag_memory(tag("2025-11-03", "trip"), tag("2026-10-27", "show"))
    pet = await ready_pet(hass, hass_storage, freezer, ada.id, record={"memory": mem})
    reply = await door_visit(pet, ada.id)
    assert door_notes(reply) == [{"kind": "door3", "tag": "trip"}]
    assert pet.people.memory_said(ada.id, "door3") == "2026-11-03"
    assert pet.people.memory_said(ada.id, "door1") is None
    reply = await door_visit(pet, ada.id)
    assert door_notes(reply) == [{"kind": "door1", "tag": "show"}]
    reply = await door_visit(pet, ada.id)
    assert door_notes(reply) == []
    for note in door_notes(reply):
        assert set(note) <= {"kind", "pick", "tag"}
    person = pet.people.data["people"][ada.id]
    assert not any(k.startswith("door") for k in person.get("noted") or {})
    await pet.people.forget_memory(ada.id)
    assert "door" not in json.dumps(saved_people(hass_storage)[ada.id])


async def test_a_door_reads_the_capped_tags(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """The cap holds on write: a year-old tag pushed out by 120 newer ones is no door."""
    hass_storage[PEOPLE_KEY] = people_store(
        {"u": {"memory": {"on": True, "tags": [tag("2025-11-03", "trip")]}}}
    )
    people = P.People(hass)
    await people.async_load()
    first = date(2026, 1, 1)
    for i in range(P.MEMORY_TAGS_CAP):
        day = (first + timedelta(days=i)).isoformat()
        assert people.remember("u", "tags", tag(day, "work_thing"))
    mem = people.memory("u")
    assert len(mem["tags"]) == P.MEMORY_TAGS_CAP
    assert P.memory_door(mem, "2026-11-03", 12) is None


# --- M2: door 10, the weekday pattern (plan section 6, its own commit) ------------------

# Saturdays in October 2026 (weekday 5); 2026-11-06 is a Friday, the eve of one.
SATURDAYS = ["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]
FRI = "2026-11-06"


def test_door_ten_on_the_eve_of_a_weekday_pattern() -> None:
    mem = tag_memory(*(tag(d, "match") for d in SATURDAYS[:3]))
    assert P.memory_door(mem, FRI, 12) == ("door10", {"kind": "door10", "tag": "match"})
    assert P.memory_door(mem, "2026-11-05", 12) is None  # not the eve
    assert P.memory_door(mem, "2026-11-07", 12) is None  # the day itself
    for hour in (10, 20):  # outside the window: lost, nothing kept for it
        assert P.memory_door(mem, FRI, hour) is None
    # Two of five is no pattern; nor a weekend tag, nor a kind that isn't weekly.
    assert (
        P.memory_door(tag_memory(*(tag(d, "match") for d in SATURDAYS[:2])), FRI, 12)
        is None
    )
    for name, kind in (
        ("match", "weekend"),
        ("trip", "big_day"),
        ("exam", "big_day"),
        ("party", "big_day"),
    ):
        mem = tag_memory(*(tag(d, name, kind) for d in SATURDAYS[:3]))
        assert P.memory_door(mem, FRI, 12) is None, name


def test_door_ten_once_in_twenty_eight_days_across_every_pattern() -> None:
    mem = tag_memory(
        *(tag(d, "match") for d in SATURDAYS[:3]),
        # And show on Sundays: its eve is Saturday the 7th.
        *(tag(d, "show") for d in ("2026-10-04", "2026-10-11", "2026-10-18")),
        door10=FRI,
    )
    assert P.memory_door(mem, "2026-11-07", 12) is None  # match's said holds show back
    assert P.memory_door(mem, "2026-11-13", 12) is None  # 7 days on
    assert P.memory_door(mem, "2026-11-28", 12) is None  # 22 days on: a Saturday's eve
    mem["said"]["door10"] = "2026-10-09"  # 28 days before the 6th
    assert P.memory_door(mem, FRI, 12) == ("door10", {"kind": "door10", "tag": "match"})


def test_door_ten_is_re_derived_from_what_remains() -> None:
    """M2 S11: exactly 3 stops after one is forgotten; 4 of 5 survives one forget;
    forgetting an entry off the weekday moves the last-5 window and can start one."""
    three = [tag(d, "lesson") for d in SATURDAYS[:3]]
    mem = tag_memory(*three)
    assert P.memory_door(mem, FRI, 12)[0] == "door10"
    mem["tags"] = three[1:]
    assert P.memory_door(mem, FRI, 12) is None
    four = [tag(d, "lesson") for d in SATURDAYS[:4]] + [tag("2026-11-02", "lesson")]
    mem = tag_memory(*four)
    mem["tags"].remove(four[0])
    assert P.memory_door(mem, FRI, 12)[0] == "door10"  # 3 Saturdays of the last 5 left
    # Saturdays the 3rd and 10th, then three Mondays: no pattern in the last 5 is a
    # Saturday's (2 of 5); forgetting one Monday brings the oldest Saturday (Sep 26)
    # into the window: 3 of the then-last 5 are Saturdays.
    older = [tag("2026-09-26", "lesson")]
    sats = [tag(d, "lesson") for d in SATURDAYS[:2]]
    mondays = [tag(d, "lesson") for d in ("2026-10-19", "2026-10-26", "2026-11-02")]
    mem = tag_memory(*older, *sats, *mondays)
    assert P.memory_door(mem, FRI, 12) is None
    mem["tags"].remove(mondays[0])
    assert P.memory_door(mem, FRI, 12) == (
        "door10",
        {"kind": "door10", "tag": "lesson"},
    )


def test_door_ten_only_while_the_pattern_is_eight_weeks_fresh() -> None:
    """FM s2784 Q2: the pattern's latest entry on its weekday at most 56 days old. From a
    Friday a Saturday is 55 or 62 days back, never 56."""
    fresh = tag_memory(
        *(tag(d, "lesson") for d in ("2026-08-29", "2026-09-05", "2026-09-12"))
    )
    assert P.memory_door(fresh, FRI, 12) == (
        "door10",
        {"kind": "door10", "tag": "lesson"},
    )
    stale = tag_memory(
        *(tag(d, "lesson") for d in ("2026-08-22", "2026-08-29", "2026-09-05"))
    )
    assert P.memory_door(stale, FRI, 12) is None
    # A newer entry on another weekday does not keep it going; one on the weekday does.
    stale["tags"] += [tag("2026-10-26", "lesson"), tag("2026-11-02", "lesson")]
    assert P.memory_door(stale, FRI, 12) is None
    stale["tags"].remove(tag("2026-10-26", "lesson"))
    stale["tags"].append(tag("2026-10-31", "lesson"))
    assert P.memory_door(stale, FRI, 12) == (
        "door10",
        {"kind": "door10", "tag": "lesson"},
    )
    assert R.MEMORY_DOOR10_STALE_DAYS == 56


def test_door_ten_goes_after_one_and_before_the_picks() -> None:
    mem = door_memory()
    mem["tags"] = [tag(d, "match") for d in SATURDAYS[:3]]
    mem["tags"].append(tag("2026-10-30", "show"))  # door 1 on the 6th
    mem["said"] = {"door2": FRI}
    assert P.memory_door(mem, FRI, 12)[0] == "door1"
    mem["said"]["door1"] = FRI
    assert P.memory_door(mem, FRI, 12)[0] == "door10"
    mem["said"]["door10"] = FRI
    assert P.memory_door(mem, FRI, 12)[0] == "door4"


async def test_door_ten_through_the_visit_marks_memory_only(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    freezer.move_to(f"{FRI} 12:00:00+00:00")
    ada, _ = await a_user(hass)
    mem = tag_memory(*(tag(d, "show") for d in SATURDAYS[2:]))
    pet = await ready_pet(hass, hass_storage, freezer, ada.id, record={"memory": mem})
    reply = await door_visit(pet, ada.id)
    assert door_notes(reply) == [{"kind": "door10", "tag": "show"}]
    assert pet.people.memory_said(ada.id, "door10") == FRI
    assert door_notes(await door_visit(pet, ada.id)) == []
    noted = pet.people.data["people"][ada.id].get("noted") or {}
    assert not any(k.startswith("door") for k in noted)


# --- M3a: the "things you told me" page (plan sections 8, 9, 10) ----------------------

FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "memory_get.json").read_text())
VIEW_KEYS = {"today", "since", "tags", "picks", "since_told", "patterns"}


def fixture_memory() -> dict[str, Any]:
    """The record the shared fixture's reply is built from, with the bookkeeping the
    reply must never carry."""
    return {
        "on": True,
        "since": FIXTURE["since"],
        "tags": copy.deepcopy(FIXTURE["tags"]),
        "picks": copy.deepcopy(FIXTURE["picks"]),
        "since_told": dict(FIXTURE["since_told"]),
        "said": {"door10": "2026-10-02", "door6_fav_weather": "2026-09-20"},
    }


async def memory_get(client: Any, entity: str = "sensor.pip_mood", **extra: Any):
    return await ws(client, "memory_get", entity_id=entity, **extra)


def assert_view_shape(view: dict[str, Any]) -> None:
    """The key-set test (M3 P1-1, the door-notes test's style)."""
    assert set(view) <= VIEW_KEYS
    assert set(view["picks"]) == set(P.MEMORY_PICKS)
    for e in view["tags"]:
        assert set(e) <= {"day", "kind", "tag"}
    for kind, entries in view["picks"].items():
        for e in entries:
            assert set(e) <= ({"day", "ask"} if kind == "great" else {"day", "pick"})
    assert set(view["since_told"]) <= {"fav_weather", "fav_season"}
    for e in view["patterns"]:
        assert set(e) == {"tag", "weekday"}
    text = json.dumps(view)
    for word in ('"said"', '"on"', "memory_chosen_days", "door"):
        assert word not in text, word


async def test_memory_get_replies_with_the_shared_fixture(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    """One fixture (M3 P2-6): the card's JS test and the bench read it too, so a renamed
    field fails on one side. `great` is listed (FM 2026-11-05)."""
    freezer.move_to(f"{FIXTURE['today']} 12:00:00+00:00")
    ada, token = await a_user(hass)
    record = {"memory": fixture_memory(), "memory_chosen_days": ["2026-10-01"]}
    await start(hass, hass_storage, {ada.id: record})
    client = await hass_ws_client(hass, token)
    msg = await memory_get(client, shared=False)
    assert msg["success"], msg
    assert set(msg["result"]) == set(FIXTURE)
    assert msg["result"] == FIXTURE
    assert_view_shape(msg["result"])
    assert ada.id not in json.dumps(msg["result"])


async def test_memory_get_of_an_empty_record_keeps_every_key(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """An empty list is [], an empty picks key is kept; `since` only when there."""
    ada, token = await a_user(hass)
    await start(hass, hass_storage, {ada.id: {"memory": {"on": True}}})
    client = await hass_ws_client(hass, token)
    view = (await memory_get(client, shared=False))["result"]
    assert view == {
        "today": today(),
        "tags": [],
        "picks": {kind: [] for kind in P.MEMORY_PICKS},
        "since_told": {},
        "patterns": [],
    }


async def test_memory_get_shows_only_the_askers_own_items(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Other people: B sees none of A's; B with memory off is refused."""
    ada, _ = await a_user(hass)
    bob, bob_token = await a_user(hass)
    await start(hass, hass_storage, {ada.id: {"memory": full_memory()}})
    client = await hass_ws_client(hass, bob_token)
    msg = await memory_get(client, shared=False)
    assert msg["error"] == {"code": "not_asked", "message": "Not on this pet"}
    assert (await switch(client, True, shared=False))["success"]
    view = (await memory_get(client, shared=False))["result"]
    assert MARK not in json.dumps(view)
    assert view["tags"] == [] and view["since"] == today()


async def test_memory_get_is_refused_on_a_shared_screen_before_the_pet_lookup(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    await start(hass, hass_storage, {ada.id: {"memory": full_memory()}})
    client = await hass_ws_client(hass, token)
    for shared in (True, None, 0, "false"):
        msg = await memory_get(client, shared=shared)
        assert msg["error"] == {
            "code": "shared",
            "message": "That is changed on its person's own screen",
        }
        msg = await memory_get(client, "sensor.nobody", shared=shared)
        assert msg["error"]["code"] == "shared"
    msg = await memory_get(client)  # no flag
    assert msg["error"]["code"] == "invalid_format"
    msg = await memory_get(client, "sensor.nobody", shared=False)
    assert msg["error"]["code"] == "no_pet"


async def test_memory_get_needs_this_pets_option(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Reads are not exempt (FM 2026-11-05): through Pip (option off) it is refused,
    through Moss it works."""
    ada, token = await a_user(hass)
    await start(
        hass,
        hass_storage,
        {ada.id: {"memory": full_memory()}},
        **{CONF_MEMORY: False},
    )
    moss = a_pet(hass, "moss")
    assert await hass.config_entries.async_setup(moss.entry_id)
    await hass.async_block_till_done()
    client = await hass_ws_client(hass, token)
    msg = await memory_get(client, shared=False)
    assert msg["error"] == {"code": "not_asked", "message": "Not on this pet"}
    msg = await memory_get(client, "sensor.moss_mood", shared=False)
    assert msg["success"] and len(msg["result"]["tags"]) == P.MEMORY_TAGS_CAP


async def test_memory_get_makes_no_record_and_writes_nothing(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {"x": {"memory": full_memory()}})
    people = pet.people
    client = await hass_ws_client(hass, token)
    before = copy.deepcopy(hass_storage[PEOPLE_KEY])
    with (
        patch.object(people, "save") as save,
        patch.object(people, "async_save_now") as save_now,
    ):
        msg = await memory_get(client, shared=False)
        assert msg["error"]["code"] == "not_asked"
        people.data["people"][ada.id] = {"memory": full_memory()}
        assert (await memory_get(client, shared=False))["success"]
        del people.data["people"][ada.id]
        assert save.call_count == 0 and save_now.call_count == 0
    assert ada.id not in people.data["people"]
    assert hass_storage[PEOPLE_KEY] == before


@pytest.mark.parametrize("name", P.MEMORY_DOOR10_TAGS)
@pytest.mark.parametrize("weekday", range(7))
def test_the_pages_patterns_are_what_door_ten_would_fire_for(
    name: str, weekday: int
) -> None:
    """Door 10's own function (owner Q3, M3 P1-2): three entries on one weekday are
    listed, and door 10 fires on that weekday's eve and for no other pair."""
    start_day = date(2026, 10, 5) + timedelta(days=weekday)  # 5 Oct is a Monday
    days = [(start_day + timedelta(weeks=w)).isoformat() for w in range(3)]
    mem = tag_memory(*(tag(d, name) for d in days))
    now = start_day + timedelta(weeks=3)
    assert P.memory_patterns(mem, now) == [(name, weekday)]
    for back in range(14):
        day = now - timedelta(days=back)
        mem["said"] = {"door1": day.isoformat()}  # door 1 (a week on) is said today
        door = P.memory_door(mem, day.isoformat(), 12)
        tomorrow = (day + timedelta(days=1)).weekday()
        if door is not None:
            assert door == ("door10", {"kind": "door10", "tag": name})
            assert (name, tomorrow) in P.memory_patterns(mem, day)
        else:
            assert (name, tomorrow) not in P.memory_patterns(mem, day)


def test_door_ten_fires_only_for_a_pair_the_page_lists() -> None:
    mem = tag_memory(
        *(tag(d, "match") for d in SATURDAYS[:3]),
        *(tag(d, "show") for d in ("2026-10-04", "2026-10-11", "2026-10-18")),
        tag("2026-10-20", "lesson"),
        tag("2026-10-27", "lesson"),
    )
    now = date(2026, 9, 1)
    fired = set()
    for _ in range(120):
        mem["said"] = {"door1": now.isoformat(), "door3": now.isoformat()}
        door = P.memory_door(mem, now.isoformat(), 12)
        if door is not None and door[0] == "door10":
            tomorrow = (now + timedelta(days=1)).weekday()
            assert (door[1]["tag"], tomorrow) in P.memory_patterns(mem, now)
            fired.add(door[1]["tag"])
        now += timedelta(days=1)
    assert fired == {"match", "show"}  # lesson's two Tuesdays are no pattern


def test_a_stale_pattern_is_not_listed_and_the_gap_hides_none() -> None:
    stale = tag_memory(
        *(tag(d, "lesson") for d in ("2026-08-22", "2026-08-29", "2026-09-05"))
    )
    assert P.memory_patterns(stale, date.fromisoformat(FRI)) == []
    fresh = tag_memory(
        *(tag(d, "lesson") for d in ("2026-08-29", "2026-09-05", "2026-09-12")),
        door10="2026-11-01",  # said 5 days ago: door 10 holds back, the page does not
    )
    assert P.memory_door(fresh, FRI, 12) is None
    assert P.memory_patterns(fresh, date.fromisoformat(FRI)) == [("lesson", 5)]


async def memory_forget(client: Any, entity: str = "sensor.pip_mood", **fields: Any):
    return await ws(client, "memory_forget", entity_id=entity, **fields)


async def test_forget_this_removes_one_entry_saved_at_once(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Erase, per item: one entry gone from the store (no delay) and from memory_get;
    a key that is not there is {forgot: 0}, not an error; great is forgettable."""
    ada, token = await a_user(hass)
    await start(hass, hass_storage, {ada.id: {"memory": fixture_memory()}})
    client = await hass_ws_client(hass, token)
    gone = {"day": "2026-10-24", "kind": "weekend", "tag": "trip"}
    msg = await memory_forget(
        client, shared=False, list="tags", day=gone["day"], kind="weekend"
    )
    assert msg["result"] == {"forgot": 1}
    stored = saved_people(hass_storage)[ada.id]["memory"]
    assert gone not in stored["tags"] and len(stored["tags"]) == 4
    view = (await memory_get(client, shared=False))["result"]
    assert gone not in view["tags"] and len(view["tags"]) == 4
    msg = await memory_forget(
        client, shared=False, list="tags", day=gone["day"], kind="weekend"
    )
    assert msg["result"] == {"forgot": 0}
    msg = await memory_forget(  # the right day, the wrong kind: nothing there
        client, shared=False, list="tags", day="2026-10-29", kind="weekend"
    )
    assert msg["result"] == {"forgot": 0}
    msg = await memory_forget(client, shared=False, list="great", day="2026-11-02")
    assert msg["result"] == {"forgot": 1}
    assert saved_people(hass_storage)[ada.id]["memory"]["picks"]["great"] == []
    view = (await memory_get(client, shared=False))["result"]
    assert view["picks"]["great"] == []


async def test_forget_this_with_no_memory_is_nothing_and_makes_no_record(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {})
    client = await hass_ws_client(hass, token)
    msg = await memory_forget(client, shared=False, list="dream", day="2026-10-30")
    assert msg["result"] == {"forgot": 0}
    msg = await memory_forget(
        client, shared=False, list="pattern", tag="match", weekday=5
    )
    assert msg["result"] == {"forgot": 0}
    assert ada.id not in pet.people.data["people"]


async def test_forgetting_a_dream_entry_leaves_the_pets_own_pick(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """M3 P2-2: the page's .kept_note is true. The pet's own copy (dream_picks, the
    morning's dream) goes only with "forget my data"."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": fixture_memory()}})
    pet.state.dream_picks = [{"user": ada.id, "pick": "sea", "at": 1.0}]
    client = await hass_ws_client(hass, token)
    msg = await memory_forget(client, shared=False, list="dream", day="2026-10-30")
    assert msg["result"] == {"forgot": 1}
    assert pet.people.memory(ada.id)["picks"]["dream"] == []
    assert pet.state.dream_picks == [{"user": ada.id, "pick": "sea", "at": 1.0}]


async def test_forget_this_works_where_the_pets_option_is_off(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Erases are exempt, reads and writes are not (FM 2026-11-05, M3 P3-1)."""
    ada, token = await a_user(hass)
    await start(
        hass,
        hass_storage,
        {ada.id: {"memory": fixture_memory()}},
        **{CONF_MEMORY: False},
    )
    client = await hass_ws_client(hass, token)
    assert (await memory_get(client, shared=False))["error"]["code"] == "not_asked"
    msg = await memory_forget(client, shared=False, list="game", day="2026-10-31")
    assert msg["result"] == {"forgot": 1}
    assert saved_people(hass_storage)[ada.id]["memory"]["picks"]["game"] == []


async def test_forget_this_never_touches_another_persons_memory(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, _ = await a_user(hass)
    _, bob_token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": fixture_memory()}})
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, bob_token)
    assert (await switch(client, True, shared=False))["success"]
    for fields in (
        {"list": "tags", "day": "2026-10-29", "kind": "big_day"},
        {"list": "dream", "day": "2026-10-30"},
        {"list": "pattern", "tag": "match", "weekday": 5},
    ):
        msg = await memory_forget(client, shared=False, **fields)
        assert msg["result"] == {"forgot": 0}, fields
    assert pet.people.data["people"][ada.id] == before


async def test_forget_this_is_refused_on_a_shared_screen_before_the_pet_lookup(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """WS shape: shared first; then no_pet; then invalid. One fixed text each."""
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": fixture_memory()}})
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, token)
    entry = {"list": "dream", "day": "2026-10-30"}
    for shared in (True, None, "false"):
        for entity in ("sensor.pip_mood", "sensor.nobody"):
            msg = await memory_forget(client, entity, shared=shared, **entry)
            assert msg["error"] == {
                "code": "shared",
                "message": "That is changed on its person's own screen",
            }
    assert (await memory_forget(client, **entry))["error"]["code"] == "invalid_format"
    msg = await memory_forget(client, "sensor.nobody", shared=False, list="names")
    assert msg["error"] == {"code": "no_pet", "message": "No pet owns that entity"}
    assert pet.people.data["people"][ada.id] == before


BAD_FORGETS = [
    {"list": "names", "day": "2026-10-30"},
    {"list": ["dream"], "day": "2026-10-30"},
    {"list": {"x": 1}, "day": "2026-10-30"},
    {"list": "dream"},
    {"list": "dream", "day": "20261030"},
    {"list": "dream", "day": "2026-W44-5"},
    {"list": "dream", "day": 20261030},
    {"list": "dream", "day": ["2026-10-30"]},
    {"list": "tags", "day": "2026-10-29"},
    {"list": "tags", "day": "2026-10-29", "kind": "trip"},
    {"list": "tags", "day": "2026-10-29", "kind": ["big_day"]},
    {"list": "pattern", "tag": "match", "weekday": True},
    {"list": "pattern", "tag": "match", "weekday": 7},
    {"list": "pattern", "tag": "match", "weekday": -1},
    {"list": "pattern", "tag": "match", "weekday": "1"},
    {"list": "pattern", "tag": "match", "weekday": 5.0},
    {"list": "pattern", "tag": "match"},
    {"list": "pattern", "tag": "exam", "weekday": 5},
    {"list": "pattern", "tag": "trip", "weekday": 5},
    {"list": "pattern", "tag": ["match"], "weekday": 5},
    {"list": "pattern", "weekday": 5},
]


@pytest.mark.parametrize("fields", BAD_FORGETS)
async def test_not_something_to_forget_is_invalid_and_changes_nothing(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    fields: dict[str, Any],
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": fixture_memory()}})
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, token)
    msg = await memory_forget(client, shared=False, **fields)
    assert msg["error"] == {"code": "invalid", "message": "Not something to forget"}
    assert pet.people.data["people"][ada.id] == before


SUNDAYS = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"]


async def forget_pattern_view(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    tags: list[dict[str, str]],
) -> tuple[Any, Any, str]:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, {ada.id: {"memory": tag_memory(*tags)}})
    return pet, await hass_ws_client(hass, token), ada.id


async def test_forgetting_a_pattern_of_three_ends_it(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    freezer.move_to(f"{FRI} 12:00:00+00:00")
    tags = [tag(d, "show") for d in SUNDAYS[:3]] + [tag("2026-10-20", "exam")]
    pet, client, ada = await forget_pattern_view(
        hass, hass_storage, hass_ws_client, tags
    )
    view = (await memory_get(client, shared=False))["result"]
    assert view["patterns"] == [{"tag": "show", "weekday": 6}]
    msg = await memory_forget(
        client, shared=False, list="pattern", tag="show", weekday=6
    )
    assert msg["result"] == {"forgot": 3}
    assert saved_people(hass_storage)[ada]["memory"]["tags"] == [
        tag("2026-10-20", "exam")
    ]
    view = (await memory_get(client, shared=False))["result"]
    assert view["patterns"] == [] and view["tags"] == [tag("2026-10-20", "exam")]


async def test_forgetting_a_pattern_of_four_takes_all_four(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    """Owner Q3: all that tag's entries on that weekday in the last-5 window, not just
    enough to end it. A weekend entry and another tag's on the day stay."""
    freezer.move_to(f"{FRI} 12:00:00+00:00")
    keep = [
        tag("2026-10-21", "match"),  # a Wednesday, inside the window
        tag(SUNDAYS[0], "match", "weekend"),
        tag(SUNDAYS[0], "show"),  # (day, kind) is a tag's key: not on a match's day
    ]
    tags = [tag(d, "match") for d in SUNDAYS[1:]] + keep
    pet, client, ada = await forget_pattern_view(
        hass, hass_storage, hass_ws_client, tags
    )
    msg = await memory_forget(
        client, shared=False, list="pattern", tag="match", weekday=6
    )
    assert msg["result"] == {"forgot": 4}
    left = saved_people(hass_storage)[ada]["memory"]["tags"]
    assert sorted(left, key=str) == sorted(keep, key=str)


async def test_forgetting_a_pattern_can_reveal_an_older_run(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, freezer
) -> None:
    """The window slides onto entries it did not read before: an older run of 3 on
    the weekday shows on the next memory_get. That is door 10's own rule (it reads
    the last 5 as they stand), not a forget that failed; the page refetches."""
    freezer.move_to("2026-11-20 12:00:00+00:00")
    older = [tag(d, "lesson") for d in ("2026-09-15", "2026-09-22", "2026-09-29")]
    newer = [tag(d, "lesson") for d in ("2026-10-31", "2026-11-07", "2026-11-14")]
    pet, client, ada = await forget_pattern_view(
        hass, hass_storage, hass_ws_client, older + newer
    )
    view = (await memory_get(client, shared=False))["result"]
    assert view["patterns"] == [{"tag": "lesson", "weekday": 5}]  # 3 of the last 5
    msg = await memory_forget(
        client, shared=False, list="pattern", tag="lesson", weekday=5
    )
    assert msg["result"] == {"forgot": 3}
    view = (await memory_get(client, shared=False))["result"]
    assert view["patterns"] == [{"tag": "lesson", "weekday": 1}]  # the Tuesdays


async def test_forget_pattern_saves_with_no_await_after_the_pop(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """The forget_item rule: the store is written before the call returns."""
    pet = await start(
        hass,
        hass_storage,
        {"u": {"memory": tag_memory(*(tag(d, "show") for d in SUNDAYS[:3]))}},
    )
    assert await pet.people.forget_pattern("u", "show", 6) == 3
    assert saved_people(hass_storage)["u"]["memory"]["tags"] == []
    assert await pet.people.forget_pattern("u", "show", 6) == 0


async def test_the_page_commands_leave_no_value_in_the_log_at_the_default_level(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Logs, (a) at the default level (M3 P1-5): only the integration's logger is
    raised, HA's websocket logger is left as it is. A bad list, bad key fields with
    a valid day and tag of a real entry, a wrong type, a bad weekday and a schema
    failure leave no record with the value. Bus: no event holds memory. This passes
    only because every field is typed object (review B1).

    The harness's caplog puts the root logger at DEBUG; HA's own default is INFO
    (bootstrap's basicConfig), so the root goes back to that and websocket_api is
    given no level of its own."""
    caplog.set_level(logging.INFO)
    caplog.set_level(logging.DEBUG, logger="custom_components.virtual_pet")
    bus = async_capture_events(hass, MATCH_ALL)
    ada, token = await a_user(hass)
    mem = fixture_memory()
    await start(hass, hass_storage, {ada.id: {"memory": mem}})
    client = await hass_ws_client(hass, token)
    secret = "zz-secret-value"
    for fields in (
        {"list": secret, "day": "2026-10-29"},
        {"list": "tags", "day": "2026-10-29", "kind": secret},
        {"list": "pattern", "tag": secret, "weekday": 5},
        {"list": "pattern", "tag": "match", "weekday": [secret]},
        {"list": "dream", "day": {"x": secret}},
    ):
        msg = await memory_forget(client, shared=False, **fields)
        assert msg["error"]["code"] == "invalid"
        assert secret not in json.dumps(msg)
    msg = await memory_forget(client, list=secret, day="2026-10-29")  # no shared
    assert msg["error"]["code"] == "invalid_format"
    assert (await memory_get(client, shared=False))["success"]
    msg = await memory_forget(
        client, shared=False, list="tags", day="2026-10-29", kind="big_day"
    )
    assert msg["result"] == {"forgot": 1}
    text = "\n".join(
        r.getMessage()
        for r in caplog.records
        if not r.name.startswith("pytest_homeassistant_custom_component")
    )
    assert secret not in text
    for e in FIXTURE["tags"]:
        assert e["day"] not in text, e
    events = json.dumps([(e.event_type, e.data) for e in bus], default=str)
    assert secret not in events and "2026-10-29" not in events and "exam" not in events


async def test_debug_logging_on_websocket_api_shows_the_page_by_design(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Logs, (b) at DEBUG on homeassistant.components.websocket_api (M3 P1-5): HA
    logs "Received <whole message>" and "Sending <whole reply>" for every message
    (websocket_api/http.py), so memory_get's reply and memory_forget's fields ARE in
    that log. That is HA's by design; the guide's "debug logging" line is the guard.
    The integration's own logger holds none of them."""
    caplog.set_level(logging.DEBUG, logger="custom_components.virtual_pet")
    caplog.set_level(logging.DEBUG, logger="homeassistant.components.websocket_api")
    ada, token = await a_user(hass)
    await start(hass, hass_storage, {ada.id: {"memory": fixture_memory()}})
    client = await hass_ws_client(hass, token)
    assert (await memory_get(client, shared=False))["success"]
    msg = await memory_forget(
        client, shared=False, list="tags", day="2026-10-29", kind="big_day"
    )
    assert msg["result"] == {"forgot": 1}
    ws_log = "\n".join(
        r.getMessage()
        for r in caplog.records
        if r.name.startswith("homeassistant.components.websocket_api")
    )
    assert "2026-10-03" in ws_log  # a tag's day, in the reply HA logged
    assert "2026-10-29" in ws_log  # the forget's day, in the message HA logged
    ours = "\n".join(
        r.getMessage()
        for r in caplog.records
        if r.name.startswith("custom_components.virtual_pet")
    )
    assert "2026-10-03" not in ours and "2026-10-29" not in ours


async def test_the_daily_prune_drops_a_removed_users_memory_only(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer
) -> None:
    """Owner Q4: a removed HA user's memory goes on the next daily clean-up, memory
    only; a live user's stays; it runs once a local date."""
    freezer.move_to("2026-11-05 12:00:00+00:00")
    ada, _ = await a_user(hass)
    bob, _ = await a_user(hass)
    pet = await start(
        hass,
        hass_storage,
        {
            ada.id: {"memory": full_memory(), "baby_talk": True, "birthday": "03-14"},
            bob.id: {"memory": full_memory()},
        },
    )
    people = pet.people
    await hass.auth.async_remove_user(ada)
    await hass.async_block_till_done()
    assert people.memory_on(ada.id)  # not before the next day's prune
    with patch.object(
        people, "async_prune_users", wraps=people.async_prune_users
    ) as prune:
        freezer.move_to("2026-11-06 00:30:00+00:00")
        pet._advance(dt_util.utcnow().timestamp())
        await hass.async_block_till_done()
        assert prune.call_count == 1
        assert people.data["people"][ada.id] == {"baby_talk": True, "birthday": "03-14"}
        assert saved_people(hass_storage)[ada.id] == {
            "baby_talk": True,
            "birthday": "03-14",
        }
        assert people.memory(bob.id) == full_memory()
        freezer.move_to("2026-11-06 18:00:00+00:00")
        pet._advance(dt_util.utcnow().timestamp())
        await hass.async_block_till_done()
        assert prune.call_count == 1  # once a day
    assert await people.async_prune_users() == 0  # nothing left to drop


async def test_the_users_prune_takes_each_persons_lock(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """A look that holds the person's lock finishes before their memory goes."""
    pet = await start(hass, hass_storage, {"gone": {"memory": full_memory()}})
    people = pet.people
    looked = asyncio.Event()

    async def get_user(user_id: str) -> None:
        looked.set()

    with patch.object(hass.auth, "async_get_user", side_effect=get_user):
        async with people.lock("gone"):
            task = hass.async_create_task(people.async_prune_users())
            await looked.wait()  # the id is looked up, then it waits on the lock
            for _ in range(20):
                await asyncio.sleep(0)
            assert not task.done() and people.memory_on("gone")
        assert await task == 1
    assert "memory" not in saved_people(hass_storage)["gone"]
