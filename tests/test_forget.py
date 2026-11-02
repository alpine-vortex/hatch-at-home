"""The people store outlives the pets, and "forget my data" erases one person's."""

from __future__ import annotations

import asyncio
import copy
import json
import random
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

from custom_components.virtual_pet import model
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


async def test_forget_me_drops_my_parked_dig_on_every_pet_and_saves(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """A parked Berry dig is keyed by the person's HA user id: forget my data
    takes it from every pet, and a dig in progress stops naming them."""
    ada, token = await a_user(hass)
    now = dt_util.utcnow().timestamp()
    dig = {"started": now, "last_at": now, "kind": "dig", "rounds": 1, "basket": 2}
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        parked={ada.id: dict(dig), "user-b": dict(dig), "household": dict(dig)},
        game={**dig, "player": ada.id},
    )
    config = await setup(hass)
    moss = await add_moss(hass)
    moss.runtime_data.state.parked[ada.id] = model.Game(
        started=now, last_at=now, kind="dig", rounds=1, player=ada.id
    )
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    pip = config.runtime_data.state
    assert set(pip.parked) == {"user-b", "household"}
    assert pip.game is not None and pip.game.player is None
    assert ada.id not in moss.runtime_data.state.parked
    # Written at once: the save on disk names them nowhere.
    for key in (STORE_KEY, MOSS_KEY):
        assert ada.id not in json.dumps(hass_storage[key]["data"]), key


async def test_diagnostics_hold_no_user_id_from_a_parked_dig(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    ada, _ = await a_user(hass)
    now = dt_util.utcnow().timestamp()
    dig = {"started": now, "last_at": now, "kind": "dig", "rounds": 1, "basket": 2}
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        parked={ada.id: dict(dig), "user-b": dict(dig), "household": dict(dig)},
        game={**dig, "player": ada.id},
    )
    config = await setup(hass)
    diag = await async_get_config_entry_diagnostics(hass, config)
    text = json.dumps(diag, default=str)
    assert ada.id not in text and "user-b" not in text
    # Still three digs, told apart, for debugging.
    parked = diag["pet"]["parked"]
    assert sorted(parked) == ["household", "person 1", "person 2"]
    assert all(g["basket"] == 2 for g in parked.values())


async def test_forget_me_drops_my_dream_pick_and_my_name_on_the_dream(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """Memory plan M0-d: a dream pick waiting for tonight and this morning's
    "your idea" both carry the person's HA user id; forget my data takes both,
    on every pet, and writes at once. The story and B's pick stay."""
    ada, token = await a_user(hass)
    now = dt_util.utcnow().timestamp()
    picks = [
        {"user": ada.id, "pick": "sea", "at": now},
        {"user": "user-b", "pick": "stars", "at": now},
    ]
    today = dt_util.now().date().isoformat()
    told = {"kind": "picked", "pick": "sea", "user": ada.id, "day": today}
    hass_storage[STORE_KEY] = hatched_pet(
        now, dream_picks=copy.deepcopy(picks), dream=dict(told)
    )
    config = await setup(hass)
    moss = await add_moss(hass)
    moss.runtime_data.state.dream_picks = copy.deepcopy(picks)
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    pip = config.runtime_data.state
    assert pip.dream_picks == [picks[1]]
    assert pip.dream == {
        "kind": "picked",
        "pick": "sea",
        "day": today,
    }  # a story to all
    assert moss.runtime_data.state.dream_picks == [picks[1]]
    # Written at once: the saves on disk name them nowhere.
    for key in (STORE_KEY, MOSS_KEY):
        assert ada.id not in json.dumps(hass_storage[key]["data"]), key
    # The morning dream still comes from B's pick.
    events = model.dream_on_waking(pip, now + 60, today, random.Random(1))
    assert events == [{"type": "dreamed", "kind": "picked"}]
    assert pip.dream["pick"] == "stars" and pip.dream["user"] == "user-b"


async def test_forget_me_leaves_other_peoples_dream_alone(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    ada, token = await a_user(hass)
    now = dt_util.utcnow().timestamp()
    today = dt_util.now().date().isoformat()
    told = {"kind": "picked", "pick": "sea", "user": "user-b", "day": today}
    picks = [{"user": "user-b", "pick": "stars", "at": now}]
    hass_storage[STORE_KEY] = hatched_pet(
        now, dream_picks=copy.deepcopy(picks), dream=dict(told)
    )
    config = await setup(hass)
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    pip = config.runtime_data.state
    assert pip.dream == told and pip.dream_picks == picks
    assert pip.dream is not None and ada.id not in json.dumps(pip.dream)


async def test_a_dream_without_its_asker_loads_and_is_nobodys_idea(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    """The loader takes a dream with no `user`; the asker note then says
    `yours` is false to everyone."""
    me, _ = await a_user(hass)
    now = dt_util.utcnow().timestamp()
    today = dt_util.now().date().isoformat()
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        dream={"kind": "picked", "pick": "sea", "day": today},
        bonds={me.id: {"points": model.R.BOND_LEVELS[2]}},
    )
    config = await setup(hass)
    assert config.runtime_data.state.dream == {
        "kind": "picked",
        "pick": "sea",
        "day": today,
    }
    notes = (await config.runtime_data.async_visit(me.id))["notes"]
    assert {"kind": "dream", "pick": "sea", "yours": False} in notes


async def test_diagnostics_hold_no_user_id_from_a_dream_pick_after_forget_me(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """The dump's `_saved` copy of the pet holds no user id after forget me. This
    alone does not discriminate: REDACT_STATE already redacts `user`, so it
    passes without the fix too; the saved-file check above is the one that does."""
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    ada, token = await a_user(hass)
    now = dt_util.utcnow().timestamp()
    today = dt_util.now().date().isoformat()
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        dream_picks=[{"user": ada.id, "pick": "sea", "at": now}],
        dream={"kind": "picked", "pick": "sea", "user": ada.id, "day": today},
    )
    config = await setup(hass)
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert ada.id not in json.dumps(diag, default=str)
