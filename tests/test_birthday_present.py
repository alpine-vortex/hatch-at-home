"""Your birthday, a present from the pet (plan 2026-11-20 section 8.3): set aside
through the gift path on the person's birthday, by the server's date, once a year."""

from __future__ import annotations

import json
import random
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest

from custom_components.virtual_pet import model
from custom_components.virtual_pet.home import FIND_TOKENS
from custom_components.virtual_pet.species import load_catalog

from .test_channel import command, pushed, subscribe
from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, setup

WOOD = load_catalog().finds["woodland"]
ALL_TRUE = dict.fromkeys(FIND_TOKENS, True)
ONLY = "acorncup"  # woodland's gift-only find
CROWN = "flowercrown"  # woodland's birthday keepsake (plan 8.4)
ENTITY = "sensor.pip_life_stage"


def pet_with(bonds: dict[str, Any]) -> model.PetState:
    pet = model.PetState.new("Pip", 0.0)
    pet.age_hours = 30.0  # past the egg
    pet.bonds = bonds
    return pet


def present(
    pet: model.PetState, birthday: str | None, today: str, user: str = "me"
) -> bool:
    return model.birthday_present(
        pet, user, birthday, today, "woodland", WOOD, ALL_TRUE, random.Random(1)
    )


@pytest.mark.parametrize(
    ("birthday", "today", "given"),
    [
        ("11-24", "2026-11-24", True),
        ("11-24", "2026-11-23", False),
        ("11-24", "2026-11-25", False),
        ("01-31", "2027-01-31", True),
        ("02-01", "2027-01-31", False),
        ("12-31", "2026-12-31", True),
        ("01-01", "2026-12-31", False),
        ("02-29", "2027-02-28", True),  # a common year: the 28th
        ("02-29", "2028-02-28", False),  # a leap year: the 29th
        ("02-29", "2028-02-29", True),
        (None, "2026-11-24", False),
        ("nonsense", "2026-11-24", False),
    ],
)
def test_the_present_comes_on_the_birthday_by_the_server_date(
    birthday: str | None, today: str, given: bool
) -> None:
    pet = pet_with({"me": {"points": 1}})
    assert present(pet, birthday, today) is given
    assert ("gift" in pet.bonds["me"]) is given
    assert pet.bonds["me"].get("present_year") == (today[:4] if given else None)


def test_once_a_year_and_again_the_next() -> None:
    pet = pet_with({"me": {"points": 1}})
    assert present(pet, "11-24", "2026-11-24")
    first = pet.bonds["me"]["gift"]
    assert first == {"id": CROWN, "world": "woodland"}, "the birthday crown first"
    del pet.bonds["me"]["gift"]  # taken
    pet.bonds["me"]["gifts"] = [CROWN]
    assert not present(pet, "11-24", "2026-11-24"), (
        "once a year: a later tick that day gives nothing"
    )
    assert "gift" not in pet.bonds["me"]
    assert present(pet, "11-24", "2027-11-24")
    assert pet.bonds["me"]["gift"] == {"id": ONLY, "world": "woodland"}, (
        "had the crown: the gift-only find they don't have"
    )
    del pet.bonds["me"]["gift"]
    pet.bonds["me"]["gifts"] = [CROWN, ONLY]
    assert present(pet, "11-24", "2028-11-24")
    gift = pet.bonds["me"]["gift"]
    assert gift["id"] not in (CROWN, ONLY) and gift["world"] == "woodland", (
        "had both: an ordinary find"
    )
    assert pet.bonds["me"]["present_year"] == "2028"


def test_the_crown_takes_a_waiting_gifts_place() -> None:
    pet = pet_with(
        {"me": {"points": 1, "gift": {"id": "pinecone", "world": "woodland"}}}
    )
    assert present(pet, "11-24", "2026-11-24")
    assert pet.bonds["me"]["gift"] == {"id": CROWN, "world": "woodland"}, (
        "the crown, not a second pine cone (that one is dropped: a random pick)"
    )
    assert pet.bonds["me"]["present_year"] == "2026"


def test_after_the_crown_the_gift_clock_brings_the_next_gift() -> None:
    """Luna (8.4): the dropped gift isn't queued; the clock brings another."""
    pet = pet_with(
        {"me": {"points": 999, "gift": {"id": "pinecone", "world": "woodland"}}}
    )
    assert present(pet, "11-24", "2026-11-24")
    known = {"woodland": {f["id"] for f in WOOD}}
    taken = model.take_gift(pet, "me", 1000.0, known, random.Random(2))
    assert taken == {"id": CROWN, "world": "woodland"}
    assert pet.bonds["me"]["gifts"] == [CROWN]
    due = pet.bonds["me"]["next_gift_at"]
    assert model.gift_tick(pet, due, "woodland", WOOD, ALL_TRUE, random.Random(3))
    nxt = pet.bonds["me"]["gift"]
    assert nxt["world"] == "woodland" and nxt["id"] != CROWN


def test_pick_gift_never_gives_the_crown() -> None:
    bond: dict[str, Any] = {"points": 9}
    for seed in range(3000):
        find = model.pick_gift(bond, WOOD, ALL_TRUE, random.Random(seed))
        assert find is not None and not find.get("birthday"), seed
    bond["gifts"] = [ONLY]  # the gift-only branch has nothing left but the crown
    for seed in range(3000):
        find = model.pick_gift(bond, WOOD, ALL_TRUE, random.Random(seed))
        assert find is not None and find["id"] not in (CROWN, ONLY), seed


def test_a_crown_must_be_gift_only_to_load() -> None:
    from custom_components.virtual_pet import species

    crown = {"id": "x", "name": "x", "a": "an x", "weight": 1, "when": None}
    assert not species.valid_find({**crown, "birthday": True})
    assert species.valid_find({**crown, "birthday": True, "gift_only": True})


def test_a_waiting_gift_is_the_present() -> None:
    waiting = {"id": "pinecone", "world": "woodland"}
    pet = pet_with({"me": {"points": 1, "gift": dict(waiting), "gifts": [CROWN]}})
    assert present(pet, "11-24", "2026-11-24")
    assert pet.bonds["me"]["gift"] == waiting, "never a second gift over the first"
    assert pet.bonds["me"]["present_year"] == "2026"


def test_no_level_or_clock_needed_but_never_a_new_bond_or_an_egg() -> None:
    pet = pet_with({"me": {"points": 0, "next_gift_at": 9e12}})
    assert present(pet, "11-24", "2026-11-24"), "no level, no gift clock"
    pet = pet_with({})
    assert not present(pet, "11-24", "2026-11-24")
    assert pet.bonds == {}, "a bond is read, never created"
    egg = model.PetState.new("Pip", 0.0)
    egg.bonds = {"me": {"points": 1}}
    assert not present(egg, "11-24", "2026-11-24")
    assert egg.bonds["me"] == {"points": 1}
    assert not model.birthday_present(
        pet_with({"me": {"points": 1}}),
        "me",
        "11-24",
        "2026-11-24",
        "woodland",
        [],
        ALL_TRUE,
        random.Random(1),
    ), "a world with no finds"


def test_nothing_to_give_keeps_the_year_open() -> None:
    only_had = [f for f in WOOD if f.get("gift_only")]  # all they have: nothing to pick
    pet = pet_with({"me": {"points": 1, "gifts": [ONLY, CROWN]}})
    assert not model.birthday_present(
        pet,
        "me",
        "11-24",
        "2026-11-24",
        "woodland",
        only_had,
        ALL_TRUE,
        random.Random(1),
    )
    assert "present_year" not in pet.bonds["me"], "a later tick may still give one"
    assert "gift" not in pet.bonds["me"]
    assert present(pet, "11-24", "2026-11-24"), "with something to give: the present"
    assert pet.bonds["me"]["present_year"] == "2026"


def test_present_year_is_type_checked_on_load() -> None:
    bonds = model.bonds_from(
        {
            "me": {"points": 1, "present_year": 2026},
            "you": {"points": 1, "present_year": "2026"},
        }
    )
    assert "present_year" not in bonds["me"]
    assert bonds["you"]["present_year"] == "2026"


@pytest.fixture
def on_the_24th(freezer: Any) -> None:
    """Before any token is made (a token from the future is refused)."""
    freezer.move_to("2026-11-24 10:00:00+00:00")


async def test_the_tick_sets_the_present_aside_for_its_person_only(
    on_the_24th: None,
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    await hass.config.async_set_time_zone("UTC")
    now = dt_util.utcnow().timestamp()
    me = hass_admin_user.id
    ada, ada_token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        bonds={
            me: {"points": 1, "next_gift_at": now + 5 * 86400},
            ada.id: {"points": 1},
        },
    )
    pet = (await setup(hass)).runtime_data
    pet.people.person(me).update(birthday="11-24")
    pet.people.person(ada.id).update(birthday="11-25")
    mine = await hass_ws_client(hass)
    await subscribe(mine)
    theirs = await hass_ws_client(hass, ada_token)
    await subscribe(theirs)
    shared = await hass_ws_client(hass)
    await subscribe(shared, shared=True)
    await pet.async_refresh()
    await hass.async_block_till_done()
    assert pet.state.bonds[me]["gift"] == {"id": CROWN, "world": "woodland"}
    assert pet.state.bonds[me]["present_year"] == "2026"
    assert "gift" not in pet.state.bonds[ada.id], "not their birthday"
    gifts = [e["mine"]["gift"] for e in await pushed(mine) if "mine" in e]
    assert gifts and gifts[-1] == {"id": CROWN, "world": "woodland"}
    for client in (theirs, shared):
        assert CROWN not in json.dumps(await pushed(client))
    taker = await hass_ws_client(hass)
    reply = await command(taker, "collect", entity_id=ENTITY, gift=True, shared=False)
    assert reply["result"]["gift"] == {"id": CROWN, "world": "woodland"}
    await pet.async_refresh()
    await hass.async_block_till_done()
    assert "gift" not in pet.state.bonds[me], (
        "once a year: taken, not given again that day"
    )
