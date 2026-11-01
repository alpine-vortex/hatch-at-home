"""World visitors v2, slice V-A: the server owns the day's visit
(docs/plan-2026-11-01-visitors-v2.md §1 and §6)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
import random
from typing import Any
from zoneinfo import ZoneInfo

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.virtual_pet import model, rates as R
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.species import load_catalog

from .test_init import STORE_KEY, hatched_pet, setup

PET = "01JB5Z3Q6M8K2V4X7N9P0R1S2T"  # an entry_id
WOODLAND = load_catalog().visitors["woodland"]
NIGHTSKY = load_catalog().visitors["nightsky"]
HOUR = 3600.0


def days(start: date, n: int) -> list[str]:
    return [(start + timedelta(days=i)).isoformat() for i in range(n)]


def stamp(day: str, hour: int, tz: Any = UTC) -> float:
    d = date.fromisoformat(day)
    return datetime(d.year, d.month, d.day, hour, tzinfo=tz).timestamp()


def first_visit_day(start: str, pet: str = PET) -> str:
    """The first day from start with a visit for this pet."""
    for day in days(date.fromisoformat(start), 7):
        if model.visit_turn(day, pet) is not None:
            return day
    raise AssertionError("no visit in 7 days")


def plan(day: str, world: str = "woodland", visitors: Any = WOODLAND, **kw: Any):
    pet = model.PetState.new("Pip", stamp(day, 0))
    rng = kw.pop("rng", random.Random())
    model.daily_visit(
        pet, stamp(day, 1), day, world, visitors, PET, rng, kw.pop("tz", UTC)
    )
    return pet


# --- The pick ---------------------------------------------------------------


def test_the_roster_moved_to_worlds_json() -> None:
    visitors = load_catalog().visitors
    assert len(visitors) == 6 and all(len(v) == 3 for v in visitors.values())
    assert [v["id"] for v in WOODLAND] == ["chickadee", "stellersjay", "snail"]
    leaves = {
        v["id"]: v["leaves"] for vs in visitors.values() for v in vs if "leaves" in v
    }
    assert leaves == {
        "stellersjay": "jayfeather",
        "gull": "gullfeather",
        "heron": "heronfeather",
        "nighthawk": "nighthawkfeather",
    }


def test_four_visit_days_in_seven_and_any_21_days_hold_every_visitor() -> None:
    """Over a year, with an unseeded rng (finding #11): the guarantees come
    from the day index and the pet's id alone."""
    for pet_id in (PET, "test_pet", "a1b2c3", "x"):
        year = days(date(2026, 1, 1), 365 + 21)
        turns = [model.visit_turn(day, pet_id) for day in year]
        for i in range(365):
            assert sum(t is not None for t in turns[i : i + 7]) == R.VISIT_DAYS
            assert {t for t in turns[i : i + 21] if t is not None} == {0, 1, 2}


def test_the_pick_is_the_same_whatever_the_rng_and_only_the_hour_is_random() -> None:
    for day in days(date(2026, 3, 1), 60):
        a = plan(day, rng=random.Random()).visit
        b = plan(day, rng=random.Random()).visit
        assert a is not None and b is not None
        assert a["id"] == b["id"] and a["world"] == "woodland" and a["day"] == day
        if a["id"] is None:
            assert a == {"day": day, "world": "woodland", "id": None}
            continue
        start = datetime.fromtimestamp(a["from"], UTC)
        assert R.VISIT_DAY_STARTS[0] <= start.hour <= R.VISIT_DAY_STARTS[1]
        assert start.date().isoformat() == day
        assert a["until"] - a["from"] == R.VISIT_HOURS * HOUR
        assert a["hours"] == "day" and a["credited"] is False


def test_night_visitors_start_at_19_or_20() -> None:
    hours = set()
    for day in days(date(2026, 3, 1), 60):
        visit = plan(day, "nightsky", NIGHTSKY).visit
        assert visit is not None
        if visit["id"]:
            assert visit["hours"] == "night"
            hours.add(datetime.fromtimestamp(visit["from"], UTC).hour)
    assert hours <= set(R.VISIT_NIGHT_STARTS) and hours


def test_the_window_is_in_ha_local_time_even_on_a_dst_day() -> None:
    """2026-11-01 is the US's fall-back day: the window is still 3 real hours
    from a local start hour."""
    tz = ZoneInfo("America/Los_Angeles")
    for day in days(date(2026, 10, 28), 10):
        visit = plan(day, tz=tz).visit
        assert visit is not None
        if visit["id"]:
            local = datetime.fromtimestamp(visit["from"], tz)
            assert local.date().isoformat() == day
            assert R.VISIT_DAY_STARTS[0] <= local.hour <= R.VISIT_DAY_STARTS[1]
            assert visit["until"] - visit["from"] == R.VISIT_HOURS * HOUR


def test_once_picked_the_day_is_kept() -> None:
    day = first_visit_day("2026-03-01")
    pet = plan(day)
    before = dict(pet.visit or {})
    for hour in (2, 9, 11):  # before the window can end (15 + 3 at the latest)
        changed = model.daily_visit(
            pet, stamp(day, hour), day, "woodland", WOODLAND, PET,
            random.Random(), UTC,
        )  # fmt: skip
        assert pet.visit is not None and not changed
        assert pet.visit == before


def test_a_world_without_visitors_has_none() -> None:
    day = first_visit_day("2026-03-01")
    assert plan(day, "atlantis", []).visit == {
        "day": day,
        "world": "atlantis",
        "id": None,
    }


# --- Crediting ---------------------------------------------------------------


def test_credited_at_the_window_end_seen_or_not_as_an_egg_and_away() -> None:
    day = first_visit_day("2026-03-01")
    for egg, away in ((True, False), (True, True), (False, True)):
        pet = plan(day)
        if not egg:
            pet.age_hours = 30.0
        pet.away = away
        assert (model.life_stage(pet) == "egg") is egg
        visit = pet.visit
        assert visit is not None and visit["id"]
        assert not model.credit_visit(pet, visit["until"] - 1, "woodland")
        assert pet.collection == {}
        assert model.credit_visit(pet, visit["until"], "woodland")
        assert pet.collection == {
            "woodland": {"visitors": {visit["id"]: day}, "finds": {}}
        }
        assert visit["credited"] is True
        assert not model.credit_visit(pet, visit["until"] + HOUR, "woodland")


def test_a_visitor_met_before_keeps_its_first_day() -> None:
    day = first_visit_day("2026-03-01")
    pet = plan(day)
    visit = pet.visit
    assert visit is not None
    pet.collection = {"woodland": {"visitors": {visit["id"]: "2025-01-01"}}}
    assert model.credit_visit(pet, visit["until"], "woodland")
    assert pet.collection["woodland"]["visitors"][visit["id"]] == "2025-01-01"


def test_ha_down_22_to_08_credits_yesterday_then_picks_today() -> None:
    """Finding #10: the night visitor's window (19-23) ends while HA is down;
    the morning's first tick credits it, then picks the new day."""
    day = next(
        d
        for d in days(date(2026, 3, 1), 14)
        if model.visit_turn(d, PET) is not None
        and model.visit_turn((date.fromisoformat(d) + timedelta(1)).isoformat(), PET)
        is not None
    )
    pet = plan(day, "nightsky", NIGHTSKY)
    yesterday = pet.visit
    assert yesterday is not None and yesterday["id"]
    # HA stops at 22:00, before any tick past the window's end.
    today = (date.fromisoformat(day) + timedelta(1)).isoformat()
    assert model.daily_visit(
        pet, stamp(today, 8), today, "nightsky", NIGHTSKY, PET, random.Random(), UTC
    )
    assert pet.collection["nightsky"]["visitors"] == {yesterday["id"]: day}
    assert pet.visit is not None and pet.visit["day"] == today
    assert pet.visit["id"] and pet.visit["credited"] is False


def test_a_pick_never_overwrites_a_visit_waiting_for_its_credit() -> None:
    day = first_visit_day("2026-03-01")
    pet = plan(day)
    visit = pet.visit
    assert visit is not None
    tomorrow = (date.fromisoformat(day) + timedelta(1)).isoformat()
    # A clock set back (or a zone change): the new day comes before the window ends.
    assert not model.daily_visit(
        pet, visit["until"] - 1, tomorrow, "woodland", WOODLAND, PET,
        random.Random(), UTC,
    )  # fmt: skip
    assert pet.visit is visit and pet.collection == {}
    assert model.daily_visit(
        pet, visit["until"], tomorrow, "woodland", WOODLAND, PET, random.Random(), UTC
    )
    assert pet.collection["woodland"]["visitors"] == {visit["id"]: day}
    assert pet.visit["day"] == tomorrow


def test_a_visit_picked_by_a_clock_running_ahead_doesnt_block_later_picks() -> None:
    """V-A audit #2: a visit picked while the clock ran a year ahead (a bad RTC
    before NTP) is dropped, not credited, once the clock is right, and every
    later day gets its plan."""
    tz = ZoneInfo("Europe/London")
    ahead = first_visit_day("2027-11-01")
    pet = model.PetState.new("Pip", 0)
    model.daily_visit(
        pet, stamp(ahead, 8, tz), ahead, "woodland", WOODLAND, PET,
        random.Random(1), tz,
    )  # fmt: skip
    assert pet.visit is not None and pet.visit["id"] and pet.visit["day"] == ahead
    for day in days(date(2026, 11, 1), 29):
        model.daily_visit(
            pet, stamp(day, 23, tz), day, "woodland", WOODLAND, PET,
            random.Random(), tz,
        )  # fmt: skip
        assert pet.visit is not None and pet.visit["day"] == day
    seen = pet.collection.get("woodland", {}).get("visitors", {}).values()
    assert seen and all(d.startswith("2026-11") for d in seen)


def test_a_live_window_on_a_later_day_still_waits_for_its_credit() -> None:
    """A zone moving west: the saved visit's day is after HA's new today, its
    window still open (about 2 hours left). It isn't overwritten."""
    day = first_visit_day("2026-03-02")
    pet = plan(day)
    visit = pet.visit
    assert visit is not None and visit["id"]
    yesterday = (date.fromisoformat(day) - timedelta(1)).isoformat()
    now = visit["until"] - 2 * HOUR
    assert not model.daily_visit(
        pet, now, yesterday, "woodland", WOODLAND, PET, random.Random(), UTC
    )
    assert pet.visit is visit
    # More than a day off is a clock that ran ahead, not a zone: picked afresh.
    now = visit["until"] - R.VISIT_HOURS * HOUR - 86400 - 1
    assert model.daily_visit(
        pet, now, yesterday, "woodland", WOODLAND, PET, random.Random(), UTC
    )
    assert pet.visit is not visit and pet.visit["day"] == yesterday
    assert pet.collection == {}


def test_a_visit_from_another_world_is_no_visit() -> None:
    """Finding #9: the egg moved worlds; the old world's visit isn't credited
    and isn't shown."""
    day = first_visit_day("2026-03-01")
    pet = plan(day)
    visit = pet.visit
    assert visit is not None
    assert model.live_visit(pet, "pond") is None
    assert not model.credit_visit(pet, visit["until"], "pond")
    assert pet.collection == {}


# --- The save ----------------------------------------------------------------


def test_visit_and_collection_round_trip() -> None:
    day = first_visit_day("2026-03-01")
    pet = plan(day)
    pet.collection = {
        "woodland": {"visitors": {"chickadee": day}, "finds": {"pinecone": day}}
    }
    back = model.PetState.from_dict(pet.to_dict(), "Pip", stamp(day, 2))
    assert back.visit == pet.visit and back.collection == pet.collection
    none = model.PetState.new("Pip", 0)
    none.visit = {"day": day, "world": "woodland", "id": None}
    back = model.PetState.from_dict(none.to_dict(), "Pip", 0)
    assert back.visit == none.visit


def test_an_old_save_loads_with_no_visit_and_an_empty_collection() -> None:
    data = model.PetState.new("Pip", 0).to_dict()
    del data["visit"], data["collection"]
    pet = model.PetState.from_dict(data, "Pip", 0)
    assert pet.visit is None and pet.collection == {}


def test_damaged_visits_and_collections_load_with_the_rest_kept() -> None:
    good = {
        "day": "2026-03-02",
        "world": "woodland",
        "id": "snail",
        "hours": "day",
        "from": 1.0,
        "until": 2.0,
        "credited": "yes",
    }
    bad_visits: list[Any] = [
        "x",
        [],
        {"day": "2026-03-02"},
        {"day": 5, "world": "woodland", "id": None},
        {"day": "Monday", "world": "woodland", "id": None},
        {**good, "hours": "noon"},
        {**good, "from": "9"},
        {**good, "until": None},
        {**good, "id": 3},
    ]
    for visit in bad_visits:
        data = {**model.PetState.new("Pip", 0).to_dict(), "visit": visit}
        data["name"] = "Bean"
        pet = model.PetState.from_dict(data, "Pip", 0)
        assert pet.visit is None and pet.name == "Bean"
    pet = model.PetState.from_dict(
        {**model.PetState.new("Pip", 0).to_dict(), "visit": good}, "Pip", 0
    )
    assert pet.visit == {**good, "credited": False}
    collection = {
        "woodland": {
            "visitors": {"chickadee": "2026-03-02", "snail": 4, 5: "x"},
            "finds": "junk",
        },
        "pond": "junk",
        "tidepool": {"finds": {"pearl": "2026-03-01"}},
    }
    data = {**model.PetState.new("Pip", 0).to_dict(), "collection": collection}
    pet = model.PetState.from_dict(data, "Pip", 0)
    assert pet.collection == {
        "woodland": {"visitors": {"chickadee": "2026-03-02"}, "finds": {}},
        "tidepool": {"visitors": {}, "finds": {"pearl": "2026-03-01"}},
    }
    data["collection"] = ["junk"]
    assert model.PetState.from_dict(data, "Pip", 0).collection == {}


def test_a_downgrade_keeps_a_later_versions_keys() -> None:
    data = model.PetState.new("Pip", 0).to_dict()
    data["basket"] = [{"id": "pinecone", "world": "woodland", "new": False, "x": 1}]
    data["collection"] = {"woodland": {"visitors": {}, "finds": {}, "later": [1]}}
    data["visit"] = {"day": "2026-03-02", "world": "woodland", "id": None, "x": 1}
    saved = model.PetState.from_dict(data, "Pip", 0).to_dict()
    assert saved["basket"] == data["basket"]
    assert saved["collection"]["woodland"]["later"] == [1]
    assert saved["visit"]["x"] == 1


def test_salvage_keeps_the_collection() -> None:
    """Finding #8: a damaged save doesn't wipe the device's lifelong collection."""
    data = {
        "name": "Bean",
        "hunger": "junk",
        "collection": {"woodland": {"visitors": {"snail": "2026-03-02"}}},
        "visit": {"day": "2026-03-02", "world": "woodland", "id": None},
    }
    pet = model.PetState.salvage(data, "Pip", 0)
    assert pet.collection == {
        "woodland": {"visitors": {"snail": "2026-03-02"}, "finds": {}}
    }
    assert pet.visit == data["visit"]  # kept (V-A audit #4)
    assert model.PetState.salvage({"collection": 7}, "Pip", 0).collection == {}


def test_salvage_keeps_the_days_visit() -> None:
    """V-A audit #4: an uncredited visit survives a salvage, so it is still
    credited and the day's window hour isn't re-rolled."""
    day = first_visit_day("2026-03-01")
    visit = plan(day).visit
    assert visit is not None
    pet = model.PetState.salvage({"visit": dict(visit), "hunger": "junk"}, "Pip", 0)
    assert pet.visit == visit
    assert model.credit_visit(pet, visit["until"], "woodland")
    assert model.PetState.salvage({"visit": 7}, "Pip", 0).visit is None


def test_lay_egg_carries_the_visit_and_the_collection() -> None:
    day = first_visit_day("2026-03-01")
    pet = plan(day)
    adult = dict(R.STAGE_STARTS)["adult"]
    pet.age_hours = adult + R.LAY_EGG_AFTER_ADULT_HOURS + 5
    pet.species, pet.raised = "bird", ["bird"]
    pet.collection = {"woodland": {"visitors": {"snail": day}, "finds": {}}}
    egg, events = model.lay_egg(pet, stamp(day, 2), random.Random(1))
    assert events and egg.visit == pet.visit and egg.collection == pet.collection
    assert egg.visit is not pet.visit and egg.collection is not pet.collection


# --- In Home Assistant -------------------------------------------------------


def today_visit(day: str, now: float, world: str = "woodland") -> dict[str, Any]:
    """A saved visit for today with an hour no seeded rng would pick (12:17)."""
    who = model.visit_turn(day, "test_pet")
    assert who is not None
    start = now - 2 * HOUR + 17 * 60
    return {
        "day": day,
        "world": world,
        "id": load_catalog().visitors[world][who]["id"],
        "hours": "day",
        "from": start,
        "until": start + R.VISIT_HOURS * HOUR,
        "credited": False,
    }


async def test_ha_picks_the_day_and_publishes_it_to_every_screen(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    day = first_visit_day("2026-10-26", "test_pet")
    freezer.move_to(f"{day} 08:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    visit = pet.state.visit
    assert visit["day"] == day and visit["world"] == "woodland" and visit["id"]
    assert pet._house_view()["visit"] == {
        k: visit[k] for k in ("day", "id", "hours", "from", "until")
    }
    # Not on any sensor.
    for state in hass.states.async_all():
        assert "visit" not in state.attributes
        assert visit["id"] not in str(state.attributes)


async def test_a_restart_keeps_the_days_pick(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    day = first_visit_day("2026-10-26", "test_pet")
    freezer.move_to(f"{day} 14:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    saved = today_visit(day, now)
    hass_storage[STORE_KEY] = hatched_pet(now, visit=saved)
    config = await setup(hass)
    pet = config.runtime_data
    assert pet.state.visit == saved
    assert await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    assert config.runtime_data.state.visit == saved
    # Its window ends: credited, and still today's on show (for the catch-up).
    freezer.move_to(datetime.fromtimestamp(saved["until"] + 60, UTC))
    await config.runtime_data.async_refresh()
    pet = config.runtime_data
    assert pet.state.visit["credited"] is True
    assert pet.state.collection["woodland"]["visitors"] == {saved["id"]: day}
    assert pet._house_view()["visit"]["id"] == saved["id"]


async def test_a_no_visit_day_publishes_none(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    day = next(
        d
        for d in days(date(2026, 10, 26), 7)
        if model.visit_turn(d, "test_pet") is None
    )
    freezer.move_to(f"{day} 10:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    assert pet.state.visit == {"day": day, "world": "woodland", "id": None}
    view = pet._house_view()
    assert "visit" in view and view["visit"] is None


async def test_on_load_another_worlds_visit_is_no_visit_today(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    day = first_visit_day("2026-10-26", "test_pet")
    freezer.move_to(f"{day} 14:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    old = today_visit(day, now, "pond")
    old["until"] = now - 60  # over, and not credited: still not credited
    hass_storage[STORE_KEY] = hatched_pet(now, visit=old)
    config = await setup(hass)
    pet = config.runtime_data
    assert pet.state.visit == {"day": day, "world": "woodland", "id": None}
    assert pet._house_view()["visit"] is None
    assert pet.state.collection == {}


async def test_unknown_ids_are_kept_in_the_save_after_load(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """V-A audit #1 (owner, 2026-11-01): a world or visitor no worlds.json knows
    (a later version's, before a downgrade) stays in the save for the upgrade
    back; only the saved visit by an unknown visitor becomes no visit."""
    freezer.move_to("2026-10-26 14:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    collection = {
        "woodland": {
            "visitors": {"chickadee": "2026-10-01", "dodo": "2026-10-02"},
            "finds": {"pinecone": "2026-10-03", "nonesuch": "2026-10-04"},
        },
        "nightsky": {"visitors": {"raccoon": "2026-10-05"}, "finds": {}},
        "atlantis": {"visitors": {"mermaid": "2026-10-06"}, "finds": {}},
    }
    visit = {"day": "2026-10-26", "world": "woodland", "id": "dodo"}
    visit.update(hours="day", **{"from": now, "until": now + 3 * HOUR})
    hass_storage[STORE_KEY] = hatched_pet(now, collection=collection, visit=visit)
    pet = (await setup(hass)).runtime_data
    assert pet.state.collection == collection
    assert pet.state.visit == {"day": "2026-10-26", "world": "woodland", "id": None}
    freezer.tick(timedelta(minutes=10))  # past the save's delay
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    saved = hass_storage[STORE_KEY]["data"]
    assert saved["visit"]["id"] is None  # the save after load did happen
    assert saved["collection"] == collection


async def test_a_live_window_from_yesterday_is_on_show_after_a_zone_moves_east(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """V-A audit #5 (with #2's wait): HA's zone moves east across midnight inside
    the window; the visit, still yesterday's, waits for its credit and is on show
    until its window ends."""
    day = first_visit_day("2026-10-26", "test_pet")
    freezer.move_to(f"{day} 14:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    saved = today_visit(day, now)  # 12:17 to 15:17 UTC
    hass_storage[STORE_KEY] = hatched_pet(now, visit=saved)
    config = await setup(hass)
    await hass.config.async_set_time_zone("Pacific/Kiritimati")  # UTC+14: tomorrow
    pet = config.runtime_data
    await pet.async_refresh()
    assert pet._today(now)[0] > day
    assert pet.state.visit == saved
    assert pet._house_view()["visit"] == {
        k: saved[k] for k in ("day", "id", "hours", "from", "until")
    }
    freezer.move_to(datetime.fromtimestamp(saved["until"] + 60, UTC))
    await pet.async_refresh()
    assert pet.state.collection["woodland"]["visitors"] == {saved["id"]: day}
    assert pet.state.visit["day"] == pet._today(saved["until"] + 60)[0]


async def test_the_day_turns_over_at_ha_local_midnight(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """HA moves to Tokyo (UTC+9): 20:30 UTC is already the next local day there
    (and the UTC day's woodland window, 18:00 at the latest, is over)."""
    freezer.move_to("2026-10-26 20:30:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    await hass.config.async_set_time_zone("Asia/Tokyo")
    pet = config.runtime_data
    await pet.async_refresh()
    assert pet.state.visit["day"] == "2026-10-27"
    if pet.state.visit["id"]:
        local = datetime.fromtimestamp(pet.state.visit["from"], ZoneInfo("Asia/Tokyo"))
        assert local.date().isoformat() == "2026-10-27"


# --- The visitor dream (top10 6d) --------------------------------------------


def test_a_credited_visitor_seeds_a_dream_that_other_seeds_beat() -> None:
    day = first_visit_day("2026-11-02")
    pet = plan(day)
    visit = pet.visit
    assert visit["id"] and not pet.dream_seeds
    end = visit["until"] + 60
    model.daily_visit(pet, end, day, "woodland", WOODLAND, PET, random.Random(), UTC)
    assert pet.dream_seeds[-1]["kind"] == "visitor"
    assert pet.dream_seeds[-1]["id"] == visit["id"]
    assert pet.dream_seeds[-1]["world"] == "woodland"
    # Credited once: no second seed.
    model.daily_visit(
        pet, end + 60, day, "woodland", WOODLAND, PET, random.Random(), UTC
    )
    assert sum(s["kind"] == "visitor" for s in pet.dream_seeds) == 1
    # Alone, the next morning dreams of it ...
    morning = end + 10 * HOUR
    alone = model.PetState.from_dict(pet.to_dict())
    events = model.dream_on_waking(alone, morning, "d2", random.Random(0))
    assert events == [{"type": "dreamed", "kind": "visitor"}]
    assert alone.dream == {
        "kind": "visitor",
        "id": visit["id"],
        "world": "woodland",
        "day": "d2",
    }
    # ... but any other moment of the day comes first.
    model.dream_seed(pet, {"kind": "snow_started"}, end + 120)
    for seed in range(20):
        again = model.PetState.from_dict(pet.to_dict())
        model.dream_on_waking(again, morning, "d2", random.Random(seed))
        assert again.dream["kind"] == "snow_started"
