"""Your birthday, the countdown (plan 2026-11-20 sections 1.1-1.6): the helper, the
prefs, the look note, the push name, the keepsake and the tip-off."""

from __future__ import annotations

import copy
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import ServiceValidationError, Unauthorized
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_mock_service,
)

from custom_components.virtual_pet import model, people as P
from custom_components.virtual_pet.const import DOMAIN

from .test_channel import command, pushed, subscribe
from .test_forget import PEOPLE_KEY, a_user, people_store, saved_people
from .test_init import STORE_KEY, friend, hatched_pet, look, settle, setup

LEVELS = model.R.BOND_LEVELS


@pytest.fixture(autouse=True)
async def utc(hass: HomeAssistant) -> None:
    await hass.config.async_set_time_zone("UTC")


@pytest.fixture
def late_on_the_23rd(freezer: FrozenDateTimeFactory) -> None:
    """Before any token is made (a token made later would be long expired)."""
    freezer.move_to("2026-11-23 23:55:00+00:00")


@pytest.fixture
def on_the_24th(freezer: FrozenDateTimeFactory) -> None:
    freezer.move_to("2026-11-24 12:00:00+00:00")


# --- 1.2 the helper ----------------------------------------------------------


def test_birthday_in_counts_across_month_and_year_ends() -> None:
    assert model.birthday_in("11-24", "2026-11-24") == 0
    assert model.birthday_in("11-24", "2026-11-19") == 5
    assert model.birthday_in("11-24", "2026-11-18") is None  # 6 days: not yet
    assert model.birthday_in("11-24", "2026-11-25") is None  # gone by
    assert model.birthday_in("01-02", "2026-12-30") == 3  # next year
    assert model.birthday_in("12-31", "2026-12-31") == 0
    assert model.birthday_in("03-01", "2026-02-24") == 5  # a common year's February
    assert model.birthday_in("03-01", "2028-02-24") is None  # 6 days: a leap year's
    assert model.birthday_in("11-24", "2026-11-23") == 1


def test_birthday_in_follows_birthday_today_for_29_february() -> None:
    assert model.birthday_in("02-29", "2027-02-28") == 0  # the 28th in a common year
    assert model.birthday_in("02-29", "2027-02-25") == 3
    assert model.birthday_in("02-29", "2028-02-28") == 1
    assert model.birthday_in("02-29", "2028-02-29") == 0
    assert model.birthday_in("02-29", "2028-03-01") is None
    assert model.birthday_in("02-29", "2027-12-30") is None


def test_birthday_in_is_none_for_nothing_or_nonsense() -> None:
    for bad in (None, "", "13-01", "02-30", "x"):
        assert model.birthday_in(bad, "2026-11-24") is None


# --- 1.1, 1.5 the person's keys ------------------------------------------------


def test_call_me_is_stripped_and_dropped_when_the_wrong_shape() -> None:
    assert P._person({"call_me": "  Bee "})["call_me"] == "Bee"
    assert P._person({"call_me": "x" * 16})["call_me"] == "x" * 16
    for bad in ("", "   ", "x" * 17, 5, ["a"], None):
        assert "call_me" not in P._person({"call_me": bad, "birthday": "01-01"}), bad
    assert P._person({"call_me": "x", "birthday": "01-01"})["birthday"] == "01-01"


def test_parties_keep_ten_years_and_drop_the_wrong_shape() -> None:
    years = [str(2000 + n) for n in range(12)]
    assert P._person({"parties": years})["parties"] == years[-10:]
    assert P._person({"parties": ["2026"]})["parties"] == ["2026"]
    for bad in (["26"], ["abcd"], [2026], "2026", {"a": 1}):
        assert "parties" not in P._person({"parties": bad}), bad


# --- 1.2 the prefs -------------------------------------------------------------


async def test_the_visit_prefs_carry_the_countdown_to_this_person_only(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-12-30 12:00:00+00:00")
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    pet.people.person(me.id).update(birthday="01-02", call_me="Bee")
    reply = await pet.async_visit(me.id)
    assert reply["birthday_in"] == 3
    assert reply["birthday_year"] == "2027"  # the occurrence counted to
    assert reply["call_me"] == "Bee"
    assert "01-02" not in str(reply)  # the date never leaves
    # Out of the window: no count, no year (call_me still rides).
    pet.people.person(me.id)["birthday"] = "06-01"
    reply = await pet.async_visit(me.id)
    assert "birthday_in" not in reply and "birthday_year" not in reply
    assert reply["call_me"] == "Bee"
    # Someone with neither gets neither.
    other = await hass.auth.async_create_user("O", group_ids=["system-admin"])
    bare = await pet.async_visit(other.id)
    assert not {"birthday_in", "birthday_year", "call_me", "parties"} & set(bare)
    # Today is 0, in this year.
    pet.people.person(me.id)["birthday"] = "12-30"
    reply = await pet.async_visit(me.id)
    assert (reply["birthday_in"], reply["birthday_year"]) == (0, "2026")


async def test_an_open_card_gets_the_new_day_without_a_visit_and_not_a_shared_one(
    late_on_the_23rd: None,
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    config.runtime_data.people.person(me).update(birthday="11-24", call_me="Bee")
    mine_client = await hass_ws_client(hass)
    snapshot = await subscribe(mine_client)
    assert snapshot["mine"]["birthday_in"] == 1
    assert snapshot["mine"]["birthday_year"] == "2026"
    assert snapshot["mine"]["call_me"] == "Bee"
    shared = await hass_ws_client(hass)
    assert (await subscribe(shared, shared=True))["mine"] is None
    await pushed(mine_client)
    await pushed(shared)
    # Midnight passes; no visit, no reload: the next tick tells the open card.
    await settle(hass, freezer, model.R.TICK_MINUTES * 60 * 2)
    assert dt_util.now().date().isoformat() == "2026-11-24"
    events = await pushed(mine_client)
    assert [e["mine"]["birthday_in"] for e in events if "mine" in e] == [0]
    assert all("mine" not in e for e in await pushed(shared))
    # And the day after it is gone from the card's prefs.
    await settle(hass, freezer, 24 * 3600)
    events = await pushed(mine_client)
    assert "birthday_in" not in [e["mine"] for e in events if "mine" in e][-1]


# --- 7.4 the day after ----------------------------------------------------------


def test_birthday_after_is_the_day_after_across_month_and_year_ends() -> None:
    assert model.birthday_after("11-24", "2026-11-25") == "2026"
    assert model.birthday_after("11-24", "2026-11-24") is None  # the day itself
    assert model.birthday_after("11-24", "2026-11-26") is None  # two days on
    assert model.birthday_after("11-24", "2026-11-23") is None
    assert model.birthday_after("01-31", "2026-02-01") == "2026"  # a month end
    assert model.birthday_after("04-30", "2026-05-01") == "2026"
    assert model.birthday_after("12-31", "2027-01-01") == "2026"  # the birthday's year
    assert model.birthday_after("12-31", "2026-12-31") is None
    assert model.birthday_after("01-01", "2026-01-02") == "2026"


def test_birthday_after_follows_birthday_today_for_29_february() -> None:
    # A common year: the party is on the 28th, so the day after is 1 March.
    assert model.birthday_after("02-29", "2027-03-01") == "2027"
    assert model.birthday_after("02-29", "2027-02-28") is None  # the party itself
    # A leap year: the party is on the 29th; the 29th is not the day after.
    assert model.birthday_after("02-29", "2028-02-29") is None
    assert model.birthday_after("02-29", "2028-03-01") == "2028"
    # A 28 February birthday: its day after is the 29th in a leap year, else 1 March.
    assert model.birthday_after("02-28", "2028-02-29") == "2028"
    assert model.birthday_after("02-28", "2028-03-01") is None
    assert model.birthday_after("02-28", "2027-03-01") == "2027"


def test_birthday_after_is_none_for_nothing_or_nonsense() -> None:
    for bad in (None, "", "13-01", "02-30", "x"):
        assert model.birthday_after(bad, "2026-11-25") is None


async def test_the_visit_prefs_carry_the_day_after_to_this_person_only(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2027-01-01 12:00:00+00:00")
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    pet.people.person(me.id).update(birthday="12-31", call_me="Bee")
    reply = await pet.async_visit(me.id)
    assert reply["birthday_after"] is True
    assert reply["birthday_after_year"] == "2026"  # the party's year, not today's
    assert "birthday_in" not in reply and "birthday_year" not in reply
    assert "12-31" not in str(reply)  # the date never leaves
    # Not the day after: neither key.
    pet.people.person(me.id)["birthday"] = "12-30"
    reply = await pet.async_visit(me.id)
    assert not {"birthday_after", "birthday_after_year"} & set(reply)
    # No birthday at all: neither key.
    other = await hass.auth.async_create_user("O", group_ids=["system-admin"])
    bare = await pet.async_visit(other.id)
    assert not {"birthday_after", "birthday_after_year"} & set(bare)
    # Someone else's day after is not in my reply.
    pet.people.person(other.id)["birthday"] = "12-31"
    reply = await pet.async_visit(me.id)
    assert "birthday_after" not in reply


@pytest.fixture
def late_on_the_24th(freezer: FrozenDateTimeFactory) -> None:
    """Before any token is made (a token made later would be long expired)."""
    freezer.move_to("2026-11-24 23:55:00+00:00")


async def test_an_open_card_gets_the_day_after_at_midnight_and_not_a_shared_one(
    late_on_the_24th: None,
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    config.runtime_data.people.person(me).update(birthday="11-24", call_me="Bee")
    mine_client = await hass_ws_client(hass)
    snapshot = await subscribe(mine_client)
    assert snapshot["mine"]["birthday_in"] == 0
    assert "birthday_after" not in snapshot["mine"]
    shared = await hass_ws_client(hass)
    shared_snap = await subscribe(shared, shared=True)
    assert shared_snap["mine"] is None
    await pushed(mine_client)
    seen_shared = [shared_snap, *await pushed(shared)]
    # Midnight passes; no visit, no reload: the next tick tells the open card.
    await settle(hass, freezer, model.R.TICK_MINUTES * 60 * 2)
    assert dt_util.now().date().isoformat() == "2026-11-25"
    mines = [e["mine"] for e in await pushed(mine_client) if "mine" in e]
    assert mines and mines[-1]["birthday_after"] is True
    assert mines[-1]["birthday_after_year"] == "2026"
    assert "birthday_in" not in mines[-1]
    after_shared = await pushed(shared)
    assert all("mine" not in e for e in after_shared)
    seen_shared += after_shared
    # And the day after that it is gone.
    await settle(hass, freezer, 24 * 3600)
    mines = [e["mine"] for e in await pushed(mine_client) if "mine" in e]
    assert mines and "birthday_after" not in mines[-1]
    assert "birthday_after_year" not in mines[-1]
    seen_shared += await pushed(shared)
    assert "birthday_after" not in str(seen_shared)


# --- 1.3 the look note ---------------------------------------------------------


async def soon_pet(
    hass: HomeAssistant, hass_storage: dict[str, Any], **pet: Any
) -> tuple[Any, Any]:
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": LEVELS[3], "since": "2026-01-01"}},
        **pet,
    )
    config = await setup(hass)
    return me, config.runtime_data


async def test_birthday_soon_is_said_once_a_day_for_one_to_five_days(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-19 12:00:00+00:00")
    me, pet = await soon_pet(hass, hass_storage)
    pet.people.person(me.id)["birthday"] = "11-24"
    first = await look(hass, me.id)
    assert {"kind": "birthday_soon", "days": 5} in first["notes"]
    await settle(hass, freezer, 3601)
    again = await look(hass, me.id)
    assert "birthday_soon" not in [n["kind"] for n in again["notes"]]  # once a day
    freezer.move_to("2026-11-20 12:00:00+00:00")
    await settle(hass, freezer, 1)
    notes = (await look(hass, me.id))["notes"]
    assert {"kind": "birthday_soon", "days": 4} in notes
    # Six days out: nothing.
    pet.people.person(me.id)["birthday"] = "11-26"
    freezer.move_to("2026-11-21 12:00:00+00:00")
    await settle(hass, freezer, 1)
    pet.people.person(me.id)["birthday"] = "11-27"
    assert "birthday_soon" not in [
        n["kind"] for n in (await look(hass, me.id))["notes"]
    ]


async def test_birthday_soon_waits_for_a_pet_that_is_up_and_not_resting(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-23 12:00:00+00:00")
    me, pet = await soon_pet(hass, hass_storage)
    pet.people.person(me.id)["birthday"] = "11-24"
    pet.state.resting = True
    pet._visits.clear()
    notes = (await look(hass, me.id))["notes"]
    assert "birthday_soon" not in [n["kind"] for n in notes]
    pet.state.resting = False
    pet._visits.clear()
    assert {"kind": "birthday_soon", "days": 1} in (await look(hass, me.id))["notes"]


async def test_birthday_soon_never_displaces_a_celebration(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-10-28 13:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        hatched_on="2026-07-28",  # 3 months old today: a pet birthday
        bonds={me.id: {"points": LEVELS[3], "since": "2026-01-01"}},
    )
    config = await setup(hass)
    config.runtime_data.people.person(me.id)["birthday"] = "11-01"  # 4 days off
    # A full look has room for one line: the pet's birthday takes it.
    first = await look(hass, me.id, queued=3)
    assert [n["kind"] for n in first["notes"]] == ["pet_birthday"]
    # The countdown was not used up: it comes on a later look today.
    await settle(hass, freezer, 3601)
    later = await look(hass, me.id)
    assert {"kind": "birthday_soon", "days": 4} in later["notes"]
    # With room for both, the celebration is first.
    config.runtime_data.people.person(me.id)["noted"] = {}
    config.runtime_data.state.bonds[me.id]["noted"] = {}
    await settle(hass, freezer, 3601)
    both = (await look(hass, me.id))["notes"]
    kinds = [n["kind"] for n in both]
    assert kinds.index("pet_birthday") < kinds.index("birthday_soon")


async def test_your_birthday_today_is_not_a_countdown(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-24 12:00:00+00:00")
    me, pet = await soon_pet(hass, hass_storage)
    pet.people.person(me.id)["birthday"] = "11-24"
    kinds = [n["kind"] for n in (await look(hass, me.id))["notes"]]
    assert "your_birthday" in kinds and "birthday_soon" not in kinds


# --- 1.4 the push name ---------------------------------------------------------


async def push_text(
    hass: HomeAssistant, hass_storage: dict[str, Any], **person: Any
) -> list[str]:
    me = await friend(hass, 0)
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "Sams Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_sams_phone")
    nick = person.pop("nickname", None)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        notify_users=[me.id],
        bonds={me.id: {"points": LEVELS[4], **({"nickname": nick} if nick else {})}},
    )
    config = await setup(hass)
    await hass.async_block_till_done()
    phone.clear()
    config.runtime_data.people.person(me.id).update(
        birthday="10-28", birthday_phone=True, **person
    )
    config.runtime_data._birthday_morning()
    await hass.async_block_till_done(wait_background_tasks=True)
    return [c.data["message"] for c in phone]


async def test_the_push_says_call_me_then_the_nickname_then_no_name(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-10-28 08:00:00+00:00")
    assert await push_text(hass, hass_storage, call_me="Bee", nickname="sunbeam") == [
        "Pip says: happy birthday, Bee! ♥"
    ]


async def test_the_push_falls_back_to_the_nickname(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-10-28 08:00:00+00:00")
    assert await push_text(hass, hass_storage, nickname="sunbeam") == [
        "Pip says: happy birthday, sunbeam! ♥"
    ]


async def test_the_push_without_either_names_no_one(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-10-28 08:00:00+00:00")
    assert await push_text(hass, hass_storage) == ["Pip says: happy birthday! ♥"]


# --- 1.5 the keepsake ----------------------------------------------------------


async def test_saying_your_birthday_keeps_the_year_and_the_list_is_capped(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-24 12:00:00+00:00")
    me, pet = await soon_pet(hass, hass_storage)
    person = pet.people.person(me.id)
    person["birthday"] = "11-24"
    person["parties"] = [str(2010 + n) for n in range(10)]  # a full list
    reply = await look(hass, me.id)
    assert "your_birthday" in [n["kind"] for n in reply["notes"]]
    assert person["parties"][-1] == "2026" and len(person["parties"]) == 10
    assert reply["parties"] == person["parties"]  # the journal reads it (4.3)
    # Said once: no second entry.
    await settle(hass, freezer, 3601)
    await look(hass, me.id)
    assert person["parties"].count("2026") == 1


async def test_changing_the_birthday_keeps_the_parties(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-24 12:00:00+00:00")
    me, pet = await soon_pet(hass, hass_storage)
    person = pet.people.person(me.id)
    person.update(birthday="11-24", parties=["2025"])
    person["birthday"] = "03-14"  # an answer to the question only sets this key
    assert person["parties"] == ["2025"]


async def test_forget_my_birthday_clears_the_parties_and_the_open_card_hears(
    on_the_24th: None,
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    person = config.runtime_data.people.person(me)
    person.update(birthday="11-24", parties=["2025", "2026"])
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["mine"]["parties"] == ["2025", "2026"]
    await pushed(client)
    assert (
        await command(client, "forget_birthday", entity_id="sensor.pip_life_stage")
    )["success"]
    events = await pushed(client)
    last = [e["mine"] for e in events if "mine" in e][-1]
    assert "parties" not in last and "birthday_in" not in last
    assert "parties" not in person


async def test_forget_my_data_clears_the_parties_and_a_reload_keeps_them(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    ada, _ = await a_user(hass)
    records = {ada.id: {"birthday": "03-14", "parties": ["2025"], "call_me": "Bee"}}
    hass_storage[PEOPLE_KEY] = people_store(copy.deepcopy(records))
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    people = config.runtime_data.people
    assert people.data["people"][ada.id] == records[ada.id]  # a store reload
    await people.forget(ada.id)
    assert ada.id not in people.data["people"]
    assert ada.id not in saved_people(hass_storage)


# --- 1.6 the tip-off -----------------------------------------------------------


async def test_the_house_tip_off_is_the_nearest_of_the_others_one_to_three_days(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-11-20 12:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    people = pet.people.data["people"]
    people[me.id] = {"birthday": "11-21"}  # mine, tomorrow: never my own tip-off
    people["user-b"] = {"birthday": "11-24"}  # 4 days: out of the window
    reply = await pet.async_visit(me.id)
    assert "house_birthday_in" not in reply
    people["user-c"] = {"birthday": "11-23"}  # 3
    people["user-d"] = {"birthday": "11-22"}  # 2
    reply = await pet.async_visit(me.id)
    assert reply["house_birthday_in"] == 2  # the smallest
    # Names no one: nothing of theirs is in the reply.
    assert "user-d" not in str(reply) and "11-22" not in str(reply)
    # Today's (0) is never a tip-off.
    people["user-d"] = {"birthday": "11-20"}
    people["user-c"] = {"birthday": "12-25"}
    assert "house_birthday_in" not in await pet.async_visit(me.id)
    # Someone with no birthday of their own still hears about the others'.
    people["user-d"] = {"birthday": "11-22"}
    other = await hass.auth.async_create_user("O", group_ids=["system-admin"])
    assert (await pet.async_visit(other.id))["house_birthday_in"] == 1  # mine: 11-21
    # The private channel's prefs carry no tip-off (a visit reply only).
    assert "house_birthday_in" not in pet._mine(me.id)


# --- 1.7 the admin service -------------------------------------------------------


async def set_birthday(hass: HomeAssistant, caller: str | None, **data: Any) -> None:
    await hass.services.async_call(
        DOMAIN,
        "set_person_birthday",
        data,
        blocking=True,
        context=Context(user_id=caller),
    )


async def test_set_person_birthday_sets_validates_clears_and_tells_open_cards(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-11-20 12:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    ada, _ = await a_user(hass)
    pet.people.person(ada.id)["birthday_skipped"] = True
    # Set all three: the skip is lifted, the store is saved at once.
    await set_birthday(
        hass,
        hass_admin_user.id,
        user_id=ada.id,
        birthday="11-22",
        birthday_phone=True,
        call_me="  Bee ",
    )
    person = pet.people.data["people"][ada.id]
    assert person == {
        "birthday": "11-22",
        "birthday_phone": True,
        "call_me": "Bee",
    }
    assert saved_people(hass_storage)[ada.id] == person
    assert pet._mine(ada.id)["birthday_in"] == 2
    # A field left out is left alone; an empty call_me clears it.
    await set_birthday(hass, hass_admin_user.id, user_id=ada.id, call_me="")
    assert "call_me" not in person and person["birthday"] == "11-22"
    await set_birthday(hass, hass_admin_user.id, user_id=ada.id, birthday_phone=False)
    assert person["birthday_phone"] is False and person["birthday"] == "11-22"


async def test_set_person_birthday_refuses_bad_values_and_unknown_users(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_admin_user: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    people = config.runtime_data.people
    ada, _ = await a_user(hass)
    admin = hass_admin_user.id
    before = copy.deepcopy(people.data)
    for bad in (
        {"user_id": "no-such-user", "birthday": "03-14"},  # unknown id
        {"user_id": ada.id, "birthday": "02-30"},
        {"user_id": ada.id, "birthday": "3-14"},
        {"user_id": ada.id, "call_me": "x" * 17},
    ):
        with pytest.raises(ServiceValidationError):
            await set_birthday(hass, admin, **bad)
    # Nothing was made or changed, not even for an unknown user.
    assert people.data == before
    assert "no-such-user" not in people.data["people"]
    # 16 characters is fine; 29 February too.
    await set_birthday(hass, admin, user_id=ada.id, birthday="02-29", call_me="x" * 16)
    assert people.data["people"][ada.id]["birthday"] == "02-29"


async def test_set_person_birthday_is_admin_only(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_read_only_user: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    people = config.runtime_data.people
    ada, _ = await a_user(hass)
    before = copy.deepcopy(people.data)
    with pytest.raises(Unauthorized):
        await set_birthday(
            hass, hass_read_only_user.id, user_id=ada.id, birthday="03-14"
        )
    with pytest.raises(Unauthorized):
        await set_birthday(hass, ada.id, user_id=ada.id, birthday="03-14")
    assert people.data == before


async def test_set_person_birthday_pushes_to_an_open_card(
    on_the_24th: None,
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert "call_me" not in snapshot["mine"]
    await pushed(client)
    await set_birthday(
        hass, hass_admin_user.id, user_id=hass_admin_user.id, call_me="Bee"
    )
    events = await pushed(client)
    assert [e["mine"]["call_me"] for e in events if "mine" in e] == ["Bee"]
