"""The pet a card opens on, the favourite (plan favourite-resting §5; tests 20-26).

Per person, in the people store, plus a household default for shared screens
that only an admin sets. It reaches a person only on their own channel, and it
picks which pet speaks for them on their phone (the birthday and the send-off)
only among the pets that may.
"""

from __future__ import annotations

import copy
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_mock_service,
)

from custom_components.virtual_pet import async_remove_entry, model
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.people import STORE_KEY as PEOPLE_KEY, People

from .test_channel import command, pushed, subscribe
from .test_forget import a_user, people_store, saved_people
from .test_init import hatched_pet

LEVELS = model.R.BOND_LEVELS
PIP, BO = "test_pet", "other_pet"


@pytest.fixture
def now() -> float:
    """The real clock: a websocket's token is issued now, not on a frozen day."""
    return dt_util.utcnow().timestamp()


def pet_store(now: float, name: str, entry_id: str, **stats: Any) -> dict[str, Any]:
    store = {**hatched_pet(now, **stats), "key": f"{DOMAIN}.{entry_id}"}
    store["data"]["name"] = name
    return store


async def add_pet(hass: HomeAssistant, entry_id: str, name: str) -> Any:
    config = MockConfigEntry(
        domain=DOMAIN,
        title=name,
        data={CONF_NAME: name, "new_pet": True},
        entry_id=entry_id,
    )
    config.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    return config.runtime_data


async def two_pets(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    now: float,
    pip: dict[str, Any] | None = None,
    bo: dict[str, Any] | None = None,
) -> tuple[Any, Any]:
    """Pip and Bo, loaded, with what each save is given."""
    await hass.config.async_set_time_zone("UTC")
    hass_storage[f"{DOMAIN}.{PIP}"] = pet_store(now, "Pip", PIP, **(pip or {}))
    hass_storage[f"{DOMAIN}.{BO}"] = pet_store(now, "Bo", BO, **(bo or {}))
    return await add_pet(hass, PIP, "Pip"), await add_pet(hass, BO, "Bo")


async def open_on(
    client: Any, entity: str, enabled: bool, scope: str = "me", **extra: Any
) -> Any:
    data = {"shared": False, **extra}
    return await command(
        client, "open_on", entity_id=entity, enabled=enabled, scope=scope, **data
    )


# --- 20: set, move, clear; one per person ------------------------------------------


async def test_set_move_and_clear_one_pet_per_person(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    now: float,
) -> None:
    await two_pets(hass, hass_storage, now)
    people = hass.data[DOMAIN]["people"]
    ada, token = await a_user(hass)
    me, them = await hass_ws_client(hass), await hass_ws_client(hass, token)
    assert (await open_on(me, "sensor.pip_life_stage", True))["success"]
    assert people.open_on(hass_admin_user.id) == PIP
    # Set on Bo: it moves there (one pet per person).
    assert (await open_on(me, "sensor.bo_life_stage", True))["success"]
    assert people.open_on(hass_admin_user.id) == BO
    # Off on Pip (not theirs) changes nothing; off on Bo clears it, saved at once.
    assert (await open_on(me, "sensor.pip_life_stage", False))["success"]
    assert people.open_on(hass_admin_user.id) == BO
    # A second person's is their own.
    assert (await open_on(them, "sensor.pip_life_stage", True))["success"]
    assert (await open_on(me, "sensor.bo_life_stage", False))["success"]
    assert people.open_on(hass_admin_user.id) is None
    assert "open_on" not in saved_people(hass_storage)[hass_admin_user.id]
    assert people.open_on(ada.id) == PIP
    # Setting is the person's only: the house default is untouched.
    assert people.house_open_on() is None
    # Fail-closed (FM, audit s2739): a shared screen, or a card that sends no
    # flag, changes no one's choice.
    reply = await open_on(me, "sensor.pip_life_stage", True, shared=True)
    assert reply["error"]["code"] == "shared"
    await me.send_json_auto_id(
        {
            "type": f"{DOMAIN}/open_on",
            "entity_id": "sensor.pip_life_stage",
            "enabled": True,
            "scope": "me",
        }
    )
    assert (await me.receive_json())["error"]["code"] == "invalid_format"
    assert people.open_on(hass_admin_user.id) is None
    # An entity no pet owns.
    reply = await open_on(me, "sensor.nobody", True)
    assert reply["error"]["code"] == "no_pet"


# --- 21 and 22: who hears it, and who sets the house's ------------------------------


async def test_mine_says_it_only_to_its_person_and_never_on_a_shared_screen(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    now: float,
) -> None:
    await two_pets(hass, hass_storage, now)
    ada, token = await a_user(hass)
    me, them = await hass_ws_client(hass), await hass_ws_client(hass, token)
    pip_me = await subscribe(me)
    bo_me = await subscribe(me, entity_id="sensor.bo_life_stage")
    pip_them = await subscribe(them)
    wall = await hass_ws_client(hass, token)
    pip_wall = await subscribe(wall, shared=True)
    assert pip_me["mine"]["open_on"] is False and bo_me["mine"]["open_on"] is False
    assert (
        pip_me["mine"]["has_open_on"] is False and bo_me["mine"]["has_open_on"] is False
    )
    # An admin's own view says where shared screens open (their row); no one
    # else's does, and a personal screen's house view never does.
    assert pip_me["mine"]["house_open_on"] is False
    assert "house_open_on" not in pip_them["mine"]
    assert "house_open_on" not in pip_me["house"]
    assert (
        "has_open_on" not in pip_me["house"] and "has_open_on" not in pip_wall["house"]
    )
    assert "has_open_on" not in pip_them["house"]
    assert pip_wall["mine"] is None and pip_wall["house"]["house_open_on"] is False
    await pushed(me), await pushed(them), await pushed(wall)

    assert (await open_on(me, "sensor.pip_life_stage", True))["success"]
    mine = [p["mine"] for p in await pushed(me) if "mine" in p]
    # Pip's says yes; Bo's hears only that they now have a favourite somewhere (R3
    # audit: the offer's edge), and not which.
    assert sorted((m["open_on"], m["has_open_on"]) for m in mine) == [
        (False, True),
        (True, True),
    ]
    assert all("mine" not in p for p in await pushed(them))  # not theirs
    assert all("mine" not in p and "house" not in p for p in await pushed(wall))

    # Moved to Bo: Pip's view says no, Bo's says yes.
    assert (await open_on(me, "sensor.bo_life_stage", True))["success"]
    assert sorted(m["mine"]["open_on"] for m in await pushed(me) if "mine" in m) == [
        False,
        True,
    ]

    # The house default: refused for a non-admin, set by an admin.
    reply = await open_on(them, "sensor.pip_life_stage", True, "house")
    assert reply["error"]["code"] == "unauthorized"
    assert hass.data[DOMAIN]["people"].house_open_on() is None
    assert all("house" not in p for p in await pushed(wall))
    assert (await open_on(me, "sensor.pip_life_stage", True, "house"))["success"]
    assert hass.data[DOMAIN]["people"].house_open_on() == PIP
    assert [p["house"]["house_open_on"] for p in await pushed(wall)] == [True]
    # It is no person's: their own choice stays where it was.
    assert hass.data[DOMAIN]["people"].open_on(hass_admin_user.id) == BO
    assert all("house" not in p for p in await pushed(them))
    admin = [p["mine"] for p in await pushed(me) if "mine" in p]
    assert [m["house_open_on"] for m in admin] == [True]  # Pip's view
    assert (await open_on(me, "sensor.pip_life_stage", False, "house"))["success"]
    assert hass.data[DOMAIN]["people"].house_open_on() is None
    assert "house" not in hass_storage[PEOPLE_KEY]["data"]  # an empty house isn't kept
    assert ada.id not in str(hass.data[DOMAIN]["people"].data.get("house"))


# --- 23: forget my data ----------------------------------------------------------


async def test_forget_my_data_takes_mine_and_leaves_the_house_default(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    now: float,
) -> None:
    await two_pets(hass, hass_storage, now)
    people = hass.data[DOMAIN]["people"]
    client = await hass_ws_client(hass)
    assert (await open_on(client, "sensor.bo_life_stage", True))["success"]
    assert (await open_on(client, "sensor.pip_life_stage", True, "house"))["success"]
    assert (await command(client, "forget_me"))["success"]
    assert people.open_on(hass_admin_user.id) is None
    assert hass_admin_user.id not in saved_people(hass_storage)
    assert people.house_open_on() == PIP
    assert hass_storage[PEOPLE_KEY]["data"]["house"] == {"open_on": PIP}


# --- 24: a removed pet, a stale id, an entry never loaded ---------------------------


async def test_removing_the_chosen_pet_clears_every_reference(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    now: float,
) -> None:
    await two_pets(hass, hass_storage, now)
    people = hass.data[DOMAIN]["people"]
    ada, token = await a_user(hass)
    me, them = await hass_ws_client(hass), await hass_ws_client(hass, token)
    assert (await open_on(me, "sensor.bo_life_stage", True))["success"]
    assert (await open_on(them, "sensor.pip_life_stage", True))["success"]
    assert (await open_on(me, "sensor.bo_life_stage", True, "house"))["success"]
    assert await hass.config_entries.async_remove(BO)
    await hass.async_block_till_done()
    assert people.open_on(hass_admin_user.id) is None
    assert people.house_open_on() is None
    assert people.open_on(ada.id) == PIP  # another pet's choice stays
    saved = hass_storage[PEOPLE_KEY]["data"]
    assert "open_on" not in saved["people"][hass_admin_user.id]
    assert "house" not in saved


async def test_a_stale_choice_is_ignored_and_cleared_on_the_next_write(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    now: float,
) -> None:
    me = hass_admin_user.id
    hass_storage[PEOPLE_KEY] = people_store({me: {"open_on": "gone_pet"}})
    pip, bo = await two_pets(
        hass,
        hass_storage,
        now,
        pip={"notify_users": [me], "bonds": {me: {"points": LEVELS[2]}}},
        bo={"notify_users": [me], "bonds": {me: {"points": LEVELS[5]}}},
    )
    client = await hass_ws_client(hass)
    for entity in ("sensor.pip_life_stage", "sensor.bo_life_stage"):
        assert (await subscribe(client, entity_id=entity))["mine"]["open_on"] is False
    assert pip._voice_pet(me) is bo  # today's: the closest
    # Turning it off anywhere clears the stale one.
    assert (await open_on(client, "sensor.pip_life_stage", False))["success"]
    assert "open_on" not in saved_people(hass_storage)[me]


async def test_removing_an_entry_that_never_loaded_does_not_raise(
    hass: HomeAssistant,
) -> None:
    assert DOMAIN not in hass.data
    config = MockConfigEntry(domain=DOMAIN, title="Pip", entry_id=PIP)
    config.add_to_hass(hass)
    await async_remove_entry(hass, config)


# --- 25: the people store keeps the house's -----------------------------------------


@pytest.mark.parametrize(
    ("house", "kept"),
    [
        ({"open_on": PIP}, {"open_on": PIP}),
        ({"open_on": 7}, None),  # the wrong shape: dropped quietly
        ({"open_on": PIP, "later": 1}, {"open_on": PIP, "later": 1}),
        ("a string", None),
        (None, None),
    ],
)
async def test_the_people_store_keeps_the_house_and_drops_a_bad_one(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    now: float,
    house: Any,
    kept: Any,
) -> None:
    records = {"u1": {"open_on": PIP, "my_day": True}, "u2": {"open_on": 3}}
    store = people_store(copy.deepcopy(records))
    store["data"]["house"] = house
    hass_storage[PEOPLE_KEY] = store
    await two_pets(hass, hass_storage, now)
    people = hass.data[DOMAIN]["people"]
    assert people.data.get("house") == kept
    assert people.data["people"]["u1"] == records["u1"]
    assert people.data["people"]["u2"] == {}  # a person's bad open_on goes too
    assert people.data["weather"] == {"2026-10-27": ["rain"]}
    assert people.house_open_on() == (PIP if kept else None)


# --- 26: the pet that speaks for a person on their phone ----------------------------


async def test_the_chosen_pet_speaks_only_where_it_may(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_admin_user: Any,
    now: float,
) -> None:
    me = hass_admin_user.id
    pip, bo = await two_pets(
        hass,
        hass_storage,
        now,
        pip={"notify_users": [me], "bonds": {me: {"points": LEVELS[1]}}},
        bo={"notify_users": [me], "bonds": {me: {"points": LEVELS[5]}}},
    )
    people = hass.data[DOMAIN]["people"]
    sendoff = {"eligible": lambda p: p.bond_for(me)[0] >= model.R.SENDOFF_LEVEL}
    birthday = {"among": lambda p: model.life_stage(p.state) != "egg"}
    # None set: today's selection, the closest.
    assert pip._voice_pet(me) is bo and bo._voice_pet(me, **sendoff) is bo
    assert pip._voice_pet(me, **birthday) is bo
    # Pip chosen: it speaks for the birthday, but its bond is under the
    # send-off's level, so the send-off is still the closest's (not lost).
    assert pip.bond_for(me)[0] < model.R.SENDOFF_LEVEL
    people.set_open_on(me, PIP)
    assert pip._voice_pet(me, **birthday) is pip
    assert pip._voice_pet(me, **sendoff) is bo
    pip.state.bonds[me]["points"] = LEVELS[model.R.SENDOFF_LEVEL - 1]
    assert pip._voice_pet(me, **sendoff) is pip
    # With the sitter it still speaks (plan sitter §3.7); an egg is skipped
    # for both messages.
    pip.state.away = True
    assert pip._voice_pet(me, **birthday) is pip
    assert pip._voice_pet(me, **sendoff) is pip
    pip.state.away = False
    hatched = pip.state.age_hours
    pip.state.age_hours = 0.0
    assert model.life_stage(pip.state) == "egg"
    assert pip._voice_pet(me, **birthday) is bo and pip._voice_pet(me) is bo
    pip.state.age_hours = hatched
    # A chosen pet that doesn't notify them is ignored.
    pip.state.notify_users.remove(me)
    assert bo._voice_pet(me, **birthday) is bo
    # With none set again, today's filter and all: Bo an egg leaves the birthday
    # to Pip only if Pip notifies them; otherwise the pet itself (as before).
    people.set_open_on(me, None)
    pip.state.notify_users.append(me)
    bo.state.age_hours = 0.0
    assert pip._voice_pet(me, **birthday) is pip
    assert pip._voice_pet(me) is bo  # the send-off's: no egg filter, as before


async def test_the_birthday_comes_from_the_chosen_pet(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 08:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    me = hass_admin_user.id
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me, "device_name": "Sams Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_sams_phone")
    pip, bo = await two_pets(
        hass,
        hass_storage,
        now,
        pip={
            "notify_users": [me],
            "bonds": {me: {"points": LEVELS[2], "nickname": "pal"}},
        },
        bo={
            "notify_users": [me],
            "bonds": {me: {"points": LEVELS[5], "nickname": "sunbeam"}},
        },
    )
    phone.clear()
    people = hass.data[DOMAIN]["people"]
    people.person(me).update(birthday="10-28", birthday_phone=True, open_on=PIP)
    for pet in (pip, bo):
        pet._birthday_morning()
    await hass.async_block_till_done(wait_background_tasks=True)
    assert [c.data["message"] for c in phone] == ["Pip says: happy birthday, pal! ♥"]


# --- 30: the rest offer's answer (plan favourite-resting §6.4, R3) -------------------


async def rest_offer(client: Any, entity: str, **extra: Any) -> Any:
    return await command(
        client, "rest_offer", entity_id=entity, **{"shared": False, **extra}
    )


async def test_the_rest_offer_answer_is_the_persons_saved_at_once(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    now: float,
) -> None:
    await two_pets(hass, hass_storage, now)
    people = hass.data[DOMAIN]["people"]
    ada, token = await a_user(hass)
    me, them = await hass_ws_client(hass), await hass_ws_client(hass, token)
    pip_me = await subscribe(me)
    bo_me = await subscribe(me, entity_id="sensor.bo_life_stage")
    pip_them = await subscribe(them)
    wall = await hass_ws_client(hass, token)
    pip_wall = await subscribe(wall, shared=True)
    assert (
        pip_me["mine"]["rest_offer"] is False and bo_me["mine"]["rest_offer"] is False
    )
    assert pip_them["mine"]["rest_offer"] is False
    assert pip_wall["mine"] is None and "rest_offer" not in pip_wall["house"]
    assert "rest_offer" not in pip_me["house"]
    await pushed(me), await pushed(them), await pushed(wall)
    # 30a: a shared screen answers for no one; nor a card that sends no flag; nor
    # one that sends `enabled` (it only ever sets true); an entity no pet owns.
    assert (await rest_offer(me, "sensor.pip_life_stage", shared=True))["error"][
        "code"
    ] == "shared"
    await me.send_json_auto_id(
        {"type": f"{DOMAIN}/rest_offer", "entity_id": "sensor.pip_life_stage"}
    )
    assert (await me.receive_json())["error"]["code"] == "invalid_format"
    reply = await rest_offer(me, "sensor.pip_life_stage", enabled=False)
    assert reply["error"]["code"] == "invalid_format"
    assert (await rest_offer(me, "sensor.nobody"))["error"]["code"] == "no_pet"
    assert "rest_offer" not in people.data["people"].get(hass_admin_user.id, {})
    # 30b: set, saved at once (no 60 s wait: the store already has it, and a
    # reload, as a restart, reads it), and every pet's channel says so.
    assert (await rest_offer(me, "sensor.pip_life_stage"))["success"]
    assert people.data["people"][hass_admin_user.id]["rest_offer"] is True
    assert saved_people(hass_storage)[hass_admin_user.id]["rest_offer"] is True
    again = People(hass)
    await again.async_load()
    assert again.data["people"][hass_admin_user.id]["rest_offer"] is True
    mine = [p["mine"]["rest_offer"] for p in await pushed(me) if "mine" in p]
    assert mine == [True, True]  # Pip's and Bo's: a second slide won't offer again
    assert all(
        p.get("mine", {}).get("rest_offer") is not True for p in await pushed(them)
    )
    assert all("mine" not in p and "house" not in p for p in await pushed(wall))
    assert "rest_offer" not in people.data["people"].get(ada.id, {})
    # It flips no switch and touches no choice.
    assert people.open_on(hass_admin_user.id) is None
    assert hass.states.get("switch.pip_resting").state == "off"
    assert hass.states.get("switch.bo_resting").state == "off"
    # 30d: "forget my data" erases it (the offer may come once more), and a
    # restart then has none.
    assert (await command(me, "forget_me"))["success"]
    assert "rest_offer" not in people.data["people"].get(hass_admin_user.id, {})
    assert hass_admin_user.id not in saved_people(hass_storage)
    after = People(hass)
    await after.async_load()
    assert "rest_offer" not in after.data["people"].get(hass_admin_user.id, {})
