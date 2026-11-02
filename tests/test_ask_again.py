"""Ask me again (memory plan M0-c): a favourite dropped on request, its tries
started over, and nothing about it anywhere but the person's own channel."""

from __future__ import annotations

import copy
import json
import logging
from typing import Any

from homeassistant.const import MATCH_ALL
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import people as P
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.people import STORE_KEY as PEOPLE_KEY

from .test_forget import a_user, people_store, saved_people
from .test_init import STORE_KEY, hatched_pet, setup

WORLD_FAV = "chickadee"


def record(world: str) -> dict[str, Any]:
    return {
        "likes": {
            "fav_weather": "snow",
            "fav_season": "winter",
            P.fav_visitor_key(world): WORLD_FAV,
        },
        "likes_asked": {
            "fav_weather": ["2026-10-01", "2026-10-20"],
            "fav_season": ["2026-10-02"],
            f"fav_visitor_{world}": ["2026-10-03"],
        },
        "once_last": "2026-10-25",
        "noted": {"fav_weather": "2026-10-26"},
        "birthday": "07-01",
        "my_day": True,
        "baby_talk": True,
        "follow_asked": ["2026-10-30"],
    }


async def call(client: Any, kind: Any, **extra: Any) -> dict[str, Any]:
    await client.send_json_auto_id(
        {
            "type": f"{DOMAIN}/ask_again",
            "entity_id": "sensor.pip_mood",
            "kind": kind,
            **extra,
        }
    )
    return await client.receive_json()


async def start(hass: HomeAssistant, hass_storage: dict[str, Any], *users: Any):
    # The world is the pet's; read it after setup, then fill the records.
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    hass_storage[PEOPLE_KEY] = people_store({})
    pet = (await setup(hass)).runtime_data
    for user in users:
        pet.people.data["people"][user.id] = record(pet.world)
    return pet


@pytest.mark.parametrize("kind", P.ASK_AGAIN_KINDS)
async def test_ask_again_drops_the_favourite_and_restarts_its_tries(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    kind: str,
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, ada)
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, token)
    msg = await call(client, kind, shared=False)
    assert msg["success"]
    person = pet.people.data["people"][ada.id]
    key = P.fav_visitor_key(pet.world) if kind == "fav_visitor" else kind
    tries = f"fav_visitor_{pet.world}" if kind == "fav_visitor" else kind
    assert key not in person["likes"] and tries not in person["likes_asked"]
    # Nothing else about the person changes, the other favourites included.
    for name in before["likes"].keys() - {key}:
        assert person["likes"][name] == before["likes"][name]
    for name in before["likes_asked"].keys() - {tries}:
        assert person["likes_asked"][name] == before["likes_asked"][name]
    for name in (
        "once_last",
        "noted",
        "birthday",
        "my_day",
        "baby_talk",
        "follow_asked",
    ):
        assert person[name] == before[name], name
    # Written at once.
    assert saved_people(hass_storage)[ada.id]["likes"] == person["likes"]
    assert tries not in saved_people(hass_storage)[ada.id]["likes_asked"]


@pytest.mark.parametrize("kind", P.ASK_AGAIN_KINDS)
async def test_the_next_eligible_look_asks_it_again(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any, kind: str
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, ada)
    client = await hass_ws_client(hass, token)
    assert (await call(client, kind, shared=False))["success"]
    person = pet.people.data["people"][ada.id]
    world = pet.world
    # The 3-day gap since the last one-time ask still holds (once_last is kept).
    assert P.once_due(person, "2026-10-26", 12, 3, (), world) is None
    assert P.once_due(person, "2026-10-29", 12, 3, (), world) == kind
    # Level 3+, in the window only.
    assert P.once_due(person, "2026-10-29", 12, 2, (), world) is None
    assert P.once_due(person, "2026-10-29", 8, 3, (), world) is None
    # The tries start over: asked twice with no answer, then resting; ask-again
    # ahead of that gives two more.
    P.mark_once(person, kind, "2026-10-29", world)
    person["once_last"] = "2026-10-25"
    assert P.once_due(person, "2026-11-30", 12, 3, (), world) == kind


async def test_a_shared_screen_or_a_card_with_no_flag_changes_nothing(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, ada)
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, token)
    msg = await call(client, "fav_weather", shared=True)
    assert msg["error"]["code"] == "shared"
    msg = await call(client, "fav_weather")  # no flag: refused too
    assert not msg["success"]
    assert pet.people.data["people"][ada.id] == before


async def test_a_bad_kind_is_refused(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, ada)
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, token)
    for kind in ("birthday", "catchphrase", "likes", {"x": 1}, None):
        msg = await call(client, kind, shared=False)
        assert not msg["success"], kind
    assert pet.people.data["people"][ada.id] == before


async def test_b_never_touches_a(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, _ = await a_user(hass)
    bob, bob_token = await a_user(hass)
    pet = await start(hass, hass_storage, ada)  # Bob has no record
    before = copy.deepcopy(pet.people.data["people"][ada.id])
    client = await hass_ws_client(hass, bob_token)
    assert (await call(client, "fav_weather", shared=False))["success"]
    assert pet.people.data["people"][ada.id] == before
    # And no record was made for Bob by asking.
    assert bob.id not in pet.people.data["people"]


async def test_the_answer_is_on_no_bus_log_sensor_or_house_view(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    caplog.set_level(logging.INFO)
    caplog.set_level(logging.DEBUG, logger="custom_components.virtual_pet")
    bus = async_capture_events(hass, MATCH_ALL)
    ada, token = await a_user(hass)
    pet = await start(hass, hass_storage, ada)
    client = await hass_ws_client(hass, token)
    # The favourites are in the person's own channel, and only there.
    mine = pet._mine(ada.id)
    assert mine["fav_weather"] == "snow" and mine["fav_season"] == "winter"
    assert mine["fav_visitor"] == WORLD_FAV
    assert (await call(client, "fav_weather", shared=False))["success"]
    assert pet._mine(ada.id)["fav_weather"] is None
    await hass.async_block_till_done()
    states = json.dumps([s.as_dict() for s in hass.states.async_all()], default=str)
    house = json.dumps(pet._house_view(), default=str)
    diag = json.dumps(
        await async_get_config_entry_diagnostics(
            hass, hass.config_entries.async_entries(DOMAIN)[0]
        ),
        default=str,
    )
    for where in (states, house, diag, caplog.text, repr(bus)):
        assert WORLD_FAV not in where
        assert "fav_weather" not in where and "fav_season" not in where
