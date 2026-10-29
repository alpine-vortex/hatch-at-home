"""The people store outlives the pets, and "forget my data" erases one person's."""

from __future__ import annotations

import asyncio
import copy
from typing import Any

from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.const import CONF_NAME, MATCH_ALL
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    CLIENT_ID,
    MockConfigEntry,
    MockUser,
    async_capture_events,
)

from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.people import STORE_KEY as PEOPLE_KEY

from .test_init import STORE_KEY, hatched_pet, look, setup

MOSS_KEY = f"{DOMAIN}.moss"


def people_store(records: dict[str, Any]) -> dict[str, Any]:
    data = {"people": records, "weather": {"2026-10-27": ["rain"]}}
    return {"version": 1, "minor_version": 1, "key": PEOPLE_KEY, "data": data}


def saved_people(hass_storage: dict[str, Any]) -> dict[str, Any]:
    return hass_storage[PEOPLE_KEY]["data"]["people"]


async def add_moss(hass: HomeAssistant) -> MockConfigEntry:
    moss = MockConfigEntry(
        domain=DOMAIN, title="Moss", data={CONF_NAME: "Moss"}, entry_id="moss"
    )
    moss.add_to_hass(hass)
    assert await hass.config_entries.async_setup(moss.entry_id)
    await hass.async_block_till_done()
    return moss


async def a_user(hass: HomeAssistant) -> tuple[MockUser, str]:
    """A signed-in person who isn't an admin, and their websocket token."""
    group = await hass.auth.async_get_group(GROUP_ID_USER)
    user = MockUser(name="Ada", groups=[group]).add_to_hass(hass)
    refresh = await hass.auth.async_create_refresh_token(user, CLIENT_ID)
    return user, hass.auth.async_create_access_token(refresh)


RECORD = {
    "birthday": "03-14",
    "baby_talk": True,
    "my_day": True,
    "zone": {"name": "Work", "at": 1.0},
}


async def test_the_people_store_outlives_the_last_pet(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    ada, _ = await a_user(hass)
    records = {ada.id: dict(RECORD), "user-b": {"birthday": "07-01"}}
    hass_storage[PEOPLE_KEY] = people_store(copy.deepcopy(records))
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    assert await hass.config_entries.async_remove(config.entry_id)
    await hass.async_block_till_done()
    assert STORE_KEY not in hass_storage  # the pet's own save goes
    assert saved_people(hass_storage) == records  # its friends' records stay
    # Set up again: the pets still know them.
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    assert (await look(hass, ada.id))["birthday_kept"]


async def test_removing_one_of_two_pets_keeps_the_people_store(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    records = {"user-a": dict(RECORD), "user-b": {"birthday": "07-01"}}
    hass_storage[PEOPLE_KEY] = people_store(copy.deepcopy(records))
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    await add_moss(hass)
    people = hass.data[DOMAIN]["people"]
    before = copy.deepcopy(people.data)
    assert await hass.config_entries.async_remove("moss")
    await hass.async_block_till_done()
    assert MOSS_KEY not in hass_storage and STORE_KEY in hass_storage
    assert people.data == before
    assert saved_people(hass_storage) == records
    assert config.runtime_data.people is people


async def test_forget_my_data_erases_only_mine(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    bob = {"birthday": "07-01", "likes": {"fav_season": "winter"}}
    hass_storage[PEOPLE_KEY] = people_store(
        {ada.id: dict(RECORD), "user-b": copy.deepcopy(bob)}
    )
    bond = {"points": 400, "nickname": "sunbeam", "since": "2026-10-01"}
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={ada.id: dict(bond)},
        notify_users=[ada.id],
    )
    config = await setup(hass)
    await add_moss(hass)
    people = hass.data[DOMAIN]["people"]
    pets = list(hass.data[DOMAIN]["pets"].values())
    bonds = [copy.deepcopy(p.state.bonds.get(ada.id)) for p in pets]
    notify = [list(p.state.notify_users) for p in pets]
    weather = copy.deepcopy(people.data["weather"])
    client = await hass_ws_client(hass, token)
    bus = async_capture_events(hass, MATCH_ALL)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    # Gone at once, in memory and on disk, with no tick in between.
    assert ada.id not in people.data["people"]
    assert ada.id not in saved_people(hass_storage)
    assert people.data["people"]["user-b"] == bob
    assert saved_people(hass_storage)["user-b"] == bob
    assert people.data["weather"] == weather
    # Bonds and notifications are the pets', not the people store's.
    assert [p.state.bonds.get(ada.id) for p in pets] == bonds
    assert [p.state.notify_users for p in pets] == notify
    assert config.runtime_data.state.bonds[ada.id]["nickname"] == "sunbeam"
    # Nothing about it on the bus (so nothing in the recorder).
    assert not [e for e in bus if e.event_type == "call_service"]
    assert ada.id not in str([e.data for e in bus])
    assert "forget" not in str([(e.event_type, e.data) for e in bus])
    reply = await look(hass, ada.id)
    assert (reply["birthday_kept"], reply["my_day"], reply["baby_talk"]) == (
        False,
        False,
        False,
    )


async def test_a_read_only_user_can_forget_their_own(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_read_only_user: Any,
    hass_read_only_access_token: str,
) -> None:
    hass_storage[PEOPLE_KEY] = people_store(
        {hass_read_only_user.id: dict(RECORD), "user-b": {"birthday": "07-01"}}
    )
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    people = hass.data[DOMAIN]["people"]
    assert list(people.data["people"]) == ["user-b"]


async def test_a_visit_finishes_before_its_person_is_forgotten(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    hass_storage[PEOPLE_KEY] = people_store({ada.id: dict(RECORD)})
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    people = hass.data[DOMAIN]["people"]
    entered, release = asyncio.Event(), asyncio.Event()
    notes = pet._notes

    async def held(user: str, now: float) -> list:
        entered.set()
        await release.wait()  # still holding people.lock(user)
        people.person(user)["half"] = True  # a write the visit makes mid-look
        return await notes(user, now)

    pet._notes = held
    visit = hass.async_create_task(look(hass, ada.id))
    await entered.wait()
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    for _ in range(20):
        await asyncio.sleep(0)
    assert ada.id in people.data["people"]  # forget_me waits on the lock
    assert people.lock(ada.id).locked()
    release.set()
    assert (await visit)["counted"]
    assert (await client.receive_json())["success"]
    assert ada.id not in people.data["people"]  # nothing half-written survives
    assert ada.id not in hass_storage[PEOPLE_KEY]["data"]["people"]


async def test_a_forget_during_the_auth_lookup_is_not_undone_by_the_visit(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    hass_storage[PEOPLE_KEY] = people_store(
        {ada.id: {**RECORD, "birthday_phone": True}}
    )
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    people = hass.data[DOMAIN]["people"]
    entered, release = asyncio.Event(), asyncio.Event()
    who = pet._who_id

    async def held(user: str) -> Any:
        entered.set()
        await release.wait()  # before the visit takes people.lock
        return await who(user)

    pet._who_id = held
    visit = hass.async_create_task(look(hass, ada.id))
    await entered.wait()
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    assert ada.id not in people.data["people"]
    release.set()
    reply = await visit
    assert reply["counted"]
    assert not reply["birthday_kept"]
    assert not reply["birthday_phone"]
    assert not people.data["people"].get(ada.id, {}).get("birthday")


async def test_a_birthday_refusal_survives_forget_my_data(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    hass_storage[PEOPLE_KEY] = people_store(
        {ada.id: {**RECORD, "birthday_skipped": True}}
    )
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    assert hass.data[DOMAIN]["people"].data["people"][ada.id] == {
        "birthday_skipped": True
    }
    assert saved_people(hass_storage)[ada.id] == {"birthday_skipped": True}
