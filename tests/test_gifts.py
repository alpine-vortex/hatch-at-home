"""World visitors v2, slice V-E1: gifts, server
(docs/plan-2026-11-01-visitors-v2.md §5, §6, §8; the V-E review's #1-#4, #8,
#9, #11-#14, #17, #18, #21).

Every absence check uses a gift-only id (acorncup): nothing but a gift ever
names one, so finding it anywhere public would be a gift leaking (review
#11). The scripted day's set-aside and take are in test_public.
"""

from __future__ import annotations

import copy
import json
import math
import random
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import model, rates as R
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.home import FIND_TOKENS
from custom_components.virtual_pet.species import load_catalog

from .test_channel import command, pushed, subscribe
from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, setup

CATALOG = load_catalog()
FINDS = CATALOG.finds
WOOD = FINDS["woodland"]
KNOWN = {w: {f["id"] for f in fs} for w, fs in FINDS.items()}
DAY = 86400.0
ALL_TRUE = dict.fromkeys(FIND_TOKENS, True)
NONE_SET: dict[str, bool | None] = dict.fromkeys(FIND_TOKENS)
FRIEND = R.BOND_LEVELS[R.BOND_FRIEND_LEVEL - 1]  # the points for level 3
ONLY = "acorncup"  # woodland's gift-only find: nothing else ever names it
ENTITY = "sensor.pip_life_stage"


def find(find_id: str) -> dict[str, Any]:
    return next(f for f in WOOD if f["id"] == find_id)


def pet_with(bonds: dict[str, Any], now: float = 0.0) -> model.PetState:
    pet = model.PetState.new("Pip", now - 30 * 3600)
    pet.age_hours = 30.0  # past the egg
    pet.bonds = bonds
    return pet


class Dice(random.Random):
    """random() always 0 (every chance comes up) and the weights of each
    weighted pick recorded."""

    def __init__(self, seed: int = 0, roll: float = 0.0) -> None:
        super().__init__(seed)
        self.roll = roll
        self.weights: list[list[float]] = []

    def random(self) -> float:
        return self.roll

    def choices(self, population, weights=None, **kw):  # type: ignore[override]
        self.weights.append(list(weights or []))
        return super().choices(population, weights, **kw)


# --- The save (review #3, #4, #14) --------------------------------------------


def test_a_bad_gift_field_is_dropped_alone_and_the_bond_kept() -> None:
    """Review #3: a check that raised would drop the whole bond (bonds_from);
    each bad value is dropped and points, nickname and photos stay."""
    photo = {"day": "2026-10-01", "scene": "picnic"}
    base = {"points": 52, "nickname": "sunbeam", "photos": [photo]}
    bad_values = {
        "gift": ["acorn"],  # not a dict
        "gifts": 7,  # not a list
        "next_gift_at": "soon",
    }
    for key, value in bad_values.items():
        bonds = model.bonds_from({"u": {**base, key: value}})
        assert key not in bonds["u"], key
        assert bonds["u"]["points"] == 52 and bonds["u"]["nickname"] == "sunbeam"
        assert bonds["u"]["photos"] == model.bonds_from({"u": base})["u"]["photos"]
    for gift in ({"id": 3, "world": "woodland"}, {"id": "acorn"}, {"world": "x"}):
        assert "gift" not in model.bonds_from({"u": {**base, "gift": gift}})["u"]
    bond = model.bonds_from(
        {"u": {**base, "gifts": [1, "acorn", None, "acorn", "pearl"]}}
    )["u"]
    assert bond["gifts"] == ["acorn", "pearl"]  # str only, once each
    nan = model.bonds_from({"u": {**base, "next_gift_at": math.nan}})["u"]
    assert "next_gift_at" not in nan


def test_a_good_gift_and_an_unknown_one_are_kept() -> None:
    """Review #4: {id, world}; review #14: unknown ≠ bad, and a later
    version's keys in the gift stay."""
    gift = {"id": "laterfind", "world": "atlantis", "shiny": True}
    bond = {"points": 30, "gift": gift, "gifts": ["laterthing"], "next_gift_at": 9.5}
    assert model.bonds_from({"u": bond})["u"] == bond
    pet = pet_with({"u": bond})
    again = model.PetState.from_dict(json.loads(json.dumps(pet.to_dict())))
    assert again.bonds["u"] == bond


def test_salvage_and_lay_egg_keep_the_gifts() -> None:
    """Bonds carry: a waiting gift, the list and the clock survive a damaged
    save and the next generation (its world is its own, review #4)."""
    bond = {
        "points": 30,
        "gift": {"id": "acorn", "world": "woodland"},
        "gifts": [ONLY],
        "next_gift_at": 5.0,
    }
    salvaged = model.PetState.salvage({"bonds": {"u": bond}, "hunger": "x"}, "Pip", 0)
    assert salvaged.bonds["u"] == bond
    pet = pet_with({"u": copy.deepcopy(bond)})
    pet.age_hours = dict(R.STAGE_STARTS)["adult"] + R.LAY_EGG_AFTER_ADULT_HOURS + 5
    pet.species, pet.raised = "bird", ["bird"]
    egg, events = model.lay_egg(pet, 100.0, random.Random(1))
    assert events and egg.bonds["u"] == bond


def test_shift_times_leaves_the_gift_clock_alone() -> None:
    """Review #8 (g): calendar days on the wall clock, not shifted."""
    pet = pet_with({"u": {"points": 30, "next_gift_at": 1000.0}})
    model.shift_times(pet, 5000.0)
    assert pet.bonds["u"]["next_gift_at"] == 1000.0


# --- The clock (review #8) ---------------------------------------------------


def test_the_clock_starts_with_no_gift_and_only_from_level_3() -> None:
    """(c): None on a level-3+ bond schedules 6-8 days on, with no gift, so
    an upgrade or reaching the level brings no burst; below level 3 nothing."""
    pet = pet_with({"friend": {"points": FRIEND}, "newer": {"points": FRIEND - 1}})
    assert model.gift_tick(pet, 0.0, "woodland", WOOD, ALL_TRUE, random.Random(1))
    due = pet.bonds["friend"]["next_gift_at"]
    assert 6 * DAY <= due <= 8 * DAY
    assert "gift" not in pet.bonds["friend"]
    assert pet.bonds["newer"] == {"points": FRIEND - 1}
    assert not model.gift_tick(pet, 1.0, "woodland", WOOD, ALL_TRUE, random.Random(1))
    assert pet.bonds["friend"]["next_gift_at"] == due


def test_a_due_clock_sets_aside_one_gift_never_caught_up() -> None:
    """(f): once due, however long ago, one gift; (d): while it waits the
    clock is left alone, so no second one."""
    pet = pet_with({"u": {"points": FRIEND, "next_gift_at": -60 * DAY}})
    assert model.gift_tick(pet, 0.0, "woodland", WOOD, ALL_TRUE, random.Random(3))
    gift = pet.bonds["u"]["gift"]
    assert set(gift) == {"id", "world"} and gift["world"] == "woodland"
    assert pet.bonds["u"]["next_gift_at"] == -60 * DAY  # left alone
    for later in (1.0, 30 * DAY, 400 * DAY):
        assert not model.gift_tick(
            pet, later, "woodland", WOOD, ALL_TRUE, random.Random(3)
        )
    assert pet.bonds["u"]["gift"] == gift


def test_a_clock_too_far_ahead_is_scheduled_again_with_no_gift() -> None:
    """(e): more than 8 days ahead means the clock went back."""
    pet = pet_with({"u": {"points": FRIEND, "next_gift_at": 30 * DAY}})
    assert model.gift_tick(pet, 0.0, "woodland", WOOD, ALL_TRUE, random.Random(1))
    assert 6 * DAY <= pet.bonds["u"]["next_gift_at"] <= 8 * DAY
    assert "gift" not in pet.bonds["u"]


def test_the_clock_runs_asleep_and_away_but_not_in_the_egg() -> None:
    """(b): calendar days; a nap, the night and away don't pause it."""
    for kind in ("asleep", "away"):
        pet = pet_with({"u": {"points": FRIEND, "next_gift_at": -1.0}})
        setattr(pet, kind, True)
        assert model.gift_tick(pet, 0.0, "woodland", WOOD, ALL_TRUE, random.Random(1))
        assert "gift" in pet.bonds["u"], kind
    egg = pet_with({"u": {"points": FRIEND, "next_gift_at": -1.0}})
    egg.age_hours = 0.0
    assert not model.gift_tick(egg, 0.0, "woodland", WOOD, ALL_TRUE, random.Random(1))
    assert egg.bonds["u"] == {"points": FRIEND, "next_gift_at": -1.0}


def test_each_friend_on_their_own_clock_and_the_rate_is_never_ranked() -> None:
    """(a)-(f) over a year: level 3 and level 10 get gifts at the same rate,
    about one a week, each taken at once."""
    pet = pet_with(
        {"three": {"points": FRIEND}, "ten": {"points": R.BOND_LEVELS[-1] + 500}}
    )
    rng = random.Random(7)
    got = {"three": 0, "ten": 0}
    now = 0.0
    while now < 365 * DAY:
        model.gift_tick(pet, now, "woodland", WOOD, ALL_TRUE, rng)
        for user in got:
            if model.take_gift(pet, user, now, KNOWN, rng):
                got[user] += 1
        now += 3600.0
    assert 365 / 8 - 2 <= got["three"] <= 365 / 6 + 2
    assert abs(got["three"] - got["ten"]) <= 3, got


# --- What (review #9) --------------------------------------------------------


def test_the_gift_only_find_comes_first_one_in_six_and_once() -> None:
    bond: dict[str, Any] = {"points": FRIEND}
    assert model.pick_gift(bond, WOOD, ALL_TRUE, Dice(roll=0.0))["id"] == ONLY
    high = Dice(roll=R.GIFT_ONLY_CHANCE)
    assert model.pick_gift(bond, WOOD, ALL_TRUE, high)["id"] != ONLY
    had = {"points": FRIEND, "gifts": [ONLY]}
    dice = Dice(roll=0.0)
    for _ in range(50):
        assert model.pick_gift(had, WOOD, ALL_TRUE, dice)["id"] != ONLY


def test_the_weights_rarer_doubled_given_ones_less_no_house_halving() -> None:
    """Tiers 10/4/1 become 10/8/2; ×0.2 for one this person was given; the
    house collection plays no part; conditions apply with the R5 fallback."""
    usable = [f for f in WOOD if not f.get("gift_only")]
    bond = {"points": FRIEND, "gifts": [ONLY, "pinecone"]}  # gift-only had
    dice = Dice(roll=1.0)
    model.pick_gift(bond, WOOD, ALL_TRUE, dice)
    want = [
        R.GIFT_TIER_WEIGHTS.get(f["weight"], f["weight"])
        * (R.GIFT_HAD_WEIGHT if f["id"] == "pinecone" else 1.0)
        for f in usable
    ]
    assert dice.weights == [pytest.approx(want)]
    assert R.GIFT_TIER_WEIGHTS == {10: 10, 4: 8, 1: 2}
    # A condition false: weight 0. No signal at all: the rare fallback (1).
    conditional = [f for f in usable if f.get("when")]
    assert conditional
    falsy = dict.fromkeys(FIND_TOKENS, False)
    dice = Dice(roll=1.0)
    model.pick_gift({"points": FRIEND, "gifts": [ONLY]}, WOOD, NONE_SET, dice)
    by_id = dict(zip([f["id"] for f in usable], dice.weights[0], strict=True))
    for f in conditional:
        assert by_id[f["id"]] == pytest.approx(
            min(
                R.GIFT_TIER_WEIGHTS.get(f["weight"], f["weight"]), R.FIND_MISSING_WEIGHT
            )
        )
    dice = Dice(roll=1.0)
    model.pick_gift({"points": FRIEND, "gifts": [ONLY]}, WOOD, falsy, dice)
    # Every condition false: those finds leave the pool (weight 0).
    assert len(dice.weights[0]) == len(usable) - len(conditional)


def test_a_set_aside_and_a_take_leave_the_house_collection_alone() -> None:
    """Review #9 (a), R3: add_find is never on the gift path."""
    pet = pet_with({"u": {"points": FRIEND, "next_gift_at": -1.0}})
    pet.collection = {"woodland": {"visitors": {}, "finds": {"acorn": "2026-10-01"}}}
    before = copy.deepcopy(pet.collection)
    model.gift_tick(pet, 0.0, "woodland", WOOD, ALL_TRUE, Dice(roll=0.0))
    assert pet.bonds["u"]["gift"] == {"id": ONLY, "world": "woodland"}
    assert model.take_gift(pet, "u", 10.0, KNOWN, random.Random(1)) == {
        "id": ONLY,
        "world": "woodland",
    }
    assert pet.collection == before and pet.basket == []


# --- The take ----------------------------------------------------------------


def test_the_take_reads_and_clears_once_and_restarts_the_clock() -> None:
    """(d) on the take; `gifts` holds ids only, once each (R6)."""
    gift = {"id": "acorn", "world": "woodland"}
    pet = pet_with({"u": {"points": FRIEND, "gift": dict(gift), "gifts": ["acorn"]}})
    rng = random.Random(2)
    assert model.take_gift(pet, "u", 100.0, KNOWN, rng) == gift
    assert model.take_gift(pet, "u", 100.0, KNOWN, rng) is None
    bond = pet.bonds["u"]
    assert "gift" not in bond and bond["gifts"] == ["acorn"]
    assert 100.0 + 6 * DAY <= bond["next_gift_at"] <= 100.0 + 8 * DAY
    assert bond["points"] == FRIEND  # Q7: no points for a gift


def test_an_unknown_gift_is_never_shown_or_taken_and_blocks_the_next() -> None:
    """Review #14: kept for the later version; mine.gift None, the take None."""
    gift = {"id": "laterfind", "world": "woodland"}
    pet = pet_with({"u": {"points": FRIEND, "gift": dict(gift), "next_gift_at": -1.0}})
    assert model.known_gift(pet.bonds["u"], KNOWN) is None
    assert model.take_gift(pet, "u", 0.0, KNOWN, random.Random(1)) is None
    assert pet.bonds["u"]["gift"] == gift
    assert not model.gift_tick(pet, 0.0, "woodland", WOOD, ALL_TRUE, random.Random(1))


def test_the_take_never_creates_a_bond() -> None:
    pet = pet_with({})
    assert model.take_gift(pet, "nobody", 0.0, KNOWN, random.Random(1)) is None
    assert pet.bonds == {}


# --- The coordinator and the websocket (review #1, #2, #11, #12, #17, #18) ---


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    """Before the access tokens are made (a token from the future is refused)."""
    freezer.move_to("2026-10-26 10:00:00+00:00")
    return dt_util.utcnow().timestamp()


def gift_pet(now: float, me: str, other: str, **stats: Any) -> dict[str, Any]:
    """Me with the gift-only find waiting, another friend with a gift of
    their own, and a basket of one."""
    return hatched_pet(
        now,
        bonds={
            me: {
                "points": FRIEND,
                "gift": {"id": ONLY, "world": "woodland"},
                "next_gift_at": now - DAY,
            },
            other: {
                "points": FRIEND,
                "gift": {"id": "pinecone", "world": "woodland"},
                "next_gift_at": now - DAY,
            },
        },
        basket=[{"id": "acorn", "world": "woodland", "new": True}],
        collection={"woodland": {"visitors": {}, "finds": {"acorn": "2026-10-25"}}},
        next_find_at=now + 4 * 3600,
        **stats,
    )


async def test_collect_gift_schema_and_refusals(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    """Review #1: V-C's {type, entity_id} still opens the basket and leaves
    the gift; `gift` with `shared` absent or true is refused `shared` and
    takes nothing; `gift` with `shared: false` gets {gift} only (#18)."""
    ada, _ = await a_user(hass)
    hass_storage[STORE_KEY] = gift_pet(now, hass_admin_user.id, ada.id)
    pet = (await setup(hass)).runtime_data
    client = await hass_ws_client(hass)
    for extra in ({"gift": True}, {"gift": True, "shared": True}):
        reply = await command(client, "collect", entity_id=ENTITY, **extra)
        assert not reply["success"] and reply["error"]["code"] == "shared", extra
    assert pet.state.bonds[hass_admin_user.id]["gift"]["id"] == ONLY
    basket = await command(client, "collect", entity_id=ENTITY)
    assert basket["result"] == {
        "finds": [{"id": "acorn", "world": "woodland", "new": True}]
    }
    assert pet.state.bonds[hass_admin_user.id]["gift"]["id"] == ONLY
    pet.state.basket = [{"id": "acorn", "world": "woodland", "new": False}]
    shared_basket = await command(client, "collect", entity_id=ENTITY, shared=True)
    assert shared_basket["result"]["finds"]  # `shared` alone: the basket path
    reply = await command(client, "collect", entity_id=ENTITY, gift=True, shared=False)
    assert reply["success"] and reply["result"] == {
        "gift": {"id": ONLY, "world": "woodland"}
    }
    reply = await command(client, "collect", entity_id=ENTITY, gift=True, shared=False)
    assert reply["result"] == {"gift": None}
    assert pet.state.basket == []  # the gift path never touched the basket
    bad = await command(client, "collect", entity_id=ENTITY, gift="yes", shared=False)
    assert not bad["success"]


async def test_the_take_pushes_only_my_mine_and_saves_at_once(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    """Review #2: my other screen's mine.gift goes to null at once; nobody
    else is sent anything, the house view is unchanged (no publish), no
    event fires, and the save is written with no tick."""
    me = hass_admin_user.id
    ada, ada_token = await a_user(hass)
    hass_storage[STORE_KEY] = gift_pet(now, me, ada.id)
    pet = (await setup(hass)).runtime_data
    bus = async_capture_events(hass, MATCH_ALL)
    mine_too = await hass_ws_client(hass)
    snap = await subscribe(mine_too)
    assert snap["mine"]["gift"] == {"id": ONLY, "world": "woodland"}
    shared = await hass_ws_client(hass)
    shared_snap = await subscribe(shared, shared=True)
    assert shared_snap["mine"] is None and ONLY not in json.dumps(shared_snap)
    theirs = await hass_ws_client(hass, ada_token)
    their_snap = await subscribe(theirs)
    assert their_snap["mine"]["gift"] == {"id": "pinecone", "world": "woodland"}
    assert ONLY not in json.dumps(their_snap)
    taker = await hass_ws_client(hass)
    published = []
    pet.async_add_listener(lambda: published.append(1))
    reply = await command(taker, "collect", entity_id=ENTITY, gift=True, shared=False)
    assert reply["result"]["gift"]["id"] == ONLY
    await hass.async_block_till_done()
    assert [e["mine"]["gift"] for e in await pushed(mine_too)] == [None]
    assert await pushed(shared) == []
    assert await pushed(theirs) == []
    assert published == []  # no _publish
    assert [e for e in bus if e.event_type.startswith(DOMAIN)] == []
    saved = hass_storage[STORE_KEY]["data"]["bonds"][me]
    assert "gift" not in saved and saved["gifts"] == [ONLY]
    assert saved["next_gift_at"] >= now + 6 * DAY


async def test_a_tick_sets_a_gift_aside_and_tells_only_its_person(
    hass: HomeAssistant,
    now: float,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Review #11, #12, #21: the set-aside fires nothing (no found, no
    notify, no debug, no private moment); it reaches my channel only."""
    me = hass_admin_user.id
    ada, ada_token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        bonds={
            me: {"points": FRIEND, "next_gift_at": now + DAY},
            ada.id: {"points": 1},
        },
        next_find_at=now + 4 * 3600,
    )
    pet = (await setup(hass)).runtime_data
    mine = await hass_ws_client(hass)
    await subscribe(mine)
    theirs = await hass_ws_client(hass, ada_token)
    await subscribe(theirs)
    shared = await hass_ws_client(hass)
    await subscribe(shared, shared=True)
    bus = async_capture_events(hass, MATCH_ALL)
    monkeypatch.setattr(R, "GIFT_ONLY_CHANCE", 1.0)
    pet.state.bonds[me]["next_gift_at"] = now - 60
    events_before = list(pet.debug.get("last_events", []))
    moments_before = list(pet.moments)
    await pet.async_refresh()
    await hass.async_block_till_done()
    assert pet.state.bonds[me]["gift"] == {"id": ONLY, "world": "woodland"}
    gifts = [e["mine"]["gift"] for e in await pushed(mine) if "mine" in e]
    assert gifts == [{"id": ONLY, "world": "woodland"}]
    for client in (theirs, shared):
        assert ONLY not in json.dumps(await pushed(client))
    assert ONLY not in json.dumps([e.data for e in bus], default=str)
    assert not [e for e in bus if e.event_type.startswith(f"{DOMAIN}_")]
    assert pet.debug.get("last_events", []) == events_before
    assert pet.moments == moments_before
    assert not pet._private.get(me)
    for state in hass.states.async_all():
        assert ONLY not in json.dumps(dict(state.attributes), default=str)
    assert pet.bond_for(me) == (R.BOND_FRIEND_LEVEL, None)  # level, nickname only
    assert ONLY not in json.dumps(pet._house_view(), default=str)
    view = pet.collection_view(me, True)
    assert "gifts" not in view and ONLY not in json.dumps(view)
    # Saved (by the tick's delayed save): the clock is left while it waits.
    freezer.tick(60)
    assert pet.state.bonds[me]["next_gift_at"] == now - 60


async def test_no_gift_before_the_house_is_read(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    """(a), review #9: the conditions need the flags; until then no tick."""
    hass_storage[STORE_KEY] = hatched_pet(
        now, bonds={"u": {"points": FRIEND, "next_gift_at": now + DAY}}
    )
    pet = (await setup(hass)).runtime_data
    pet._home_started, pet._find_flags = False, None
    pet.state.bonds["u"]["next_gift_at"] = now - 60
    await pet.async_refresh()
    assert "gift" not in pet.state.bonds["u"]


async def test_diagnostics_and_forget_me_and_the_gift(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    """Diagnostics redact bonds whole (no gift id); forget_me leaves the bond
    and its gifts (FB as decided, §5)."""
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    ada, token = await a_user(hass)
    bond = {
        "points": FRIEND,
        "gift": {"id": ONLY, "world": "woodland"},
        "gifts": ["paperboat"],
        "next_gift_at": now + DAY,
    }
    hass_storage[STORE_KEY] = hatched_pet(now, bonds={ada.id: copy.deepcopy(bond)})
    config = await setup(hass)
    pet = config.runtime_data
    diag = await async_get_config_entry_diagnostics(hass, config)
    text = json.dumps(diag, default=str)
    assert ONLY not in text and "paperboat" not in text and "next_gift_at" not in text
    client = await hass_ws_client(hass, token)
    await client.send_json_auto_id({"type": "virtual_pet/forget_me"})
    assert (await client.receive_json())["success"]
    assert pet.state.bonds[ada.id] == bond
