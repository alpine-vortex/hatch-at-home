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

from custom_components.virtual_pet import async_remove_entry, people as P
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
        "since_told": {"fav_weather": "2011-02-02", "visitor_woodland": "2011-02-03"},
        "said": {"door2": "2011-03-03", "door6_fav_weather": "2011-03-04"},
        "heard": {"day": "2011-04-04", "pet": "test_pet"},
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
            {"day": "2026-10-03", "kind": "big_day", "tag": "test", "text": "maths"},
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
        "since_told": {"fav_weather": "2026-10-08", "Ada": "2026-10-08"},
        "said": {"door2": "2026-10-09", "door99": "2026-10-09", "noted": "x"},
        "heard": {"day": "2026-10-10", "pet": "Ada's pet!"},
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
    client = await hass_ws_client(hass)
    assert (await switch(client, True, shared=False))["success"]
    assert (await answer(client, "dream", "snacks", shared=False))["success"]
    assert (await switch(client, True, shared=True))["error"]["code"] == "shared"
    await pet.async_visit(me)
    await hass.async_block_till_done()
    assert pet.people.memory(me)["picks"]["dream"][-1]["day"] == today()
    assert await async_setup_component(hass, "homeassistant", {})
    assert await async_setup_component(hass, "intent", {})
    assert await async_setup_component(hass, "llm", {})
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
        assert '"memory_on"' not in text and "since_told" not in text, name


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
