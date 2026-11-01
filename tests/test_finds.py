"""World visitors v2, slice V-B: finds and the basket, server
(docs/plan-2026-11-01-visitors-v2.md §2, §3, §6; the V-B review's #1-#21)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
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
from custom_components.virtual_pet.coordinator import MOMENTS
from custom_components.virtual_pet.home import (
    FIND_TOKENS,
    Readings,
    find_flags,
    full_moon_by_date,
)
from custom_components.virtual_pet.species import load_catalog, valid_when

from .test_channel import command, pushed, subscribe
from .test_init import STORE_KEY, hatched_pet, setup

CATALOG = load_catalog()
FINDS = CATALOG.finds
KNOWN = {w: {f["id"] for f in fs} for w, fs in FINDS.items()}
HOUR = 3600.0
ALL_TRUE = dict.fromkeys(FIND_TOKENS, True)


def find(world: str, find_id: str) -> dict[str, Any]:
    return next(f for f in FINDS[world] if f["id"] == find_id)


def awake_pet(now: float = 0.0) -> model.PetState:
    pet = model.PetState.new("Pip", now - 30 * HOUR)
    pet.age_hours = 30.0  # a baby: past the egg
    return pet


class Dice(random.Random):
    """An rng whose chance rolls always come up (random() is 0) and that
    records the weights of each weighted pick."""

    def __init__(self, seed: int = 0) -> None:
        super().__init__(seed)
        self.weights: list[list[float]] = []

    def random(self) -> float:
        return 0.0

    def choices(self, population, weights=None, **kw):  # type: ignore[override]
        self.weights.append(list(weights or []))
        return super().choices(population, weights, **kw)


# --- The lists (worlds.json) -------------------------------------------------

PLAN = {  # plan §2, with the owner's ⟲ picks (§13b #1)
    "woodland": "pine cone, acorn, maple seed, wild strawberry, jay feather, snail shell, "
    "chanterelle, frosted leaf, four-leaf clover, acorn-cap cup",
    "terrarium": "tiny mushroom, dried flower, curled bark, seed pod, shed skin, "
    "crystal cluster, dew drop, pressed moss, tiny fossil, pressed fern",
    "hearth": "button, ribbon, spool of thread, cookie, lost sock, toy mouse, thimble, "
    "pine sprig, brass key, tiny knitted heart",
    "tidepool": "green sea glass, scallop shell, periwinkle shell, sand dollar, "
    "blue sea glass, gull feather, sea urchin shell, red sea glass, "
    "message in a bottle, pearl",
    "pond": "lily flower, cattail fluff, cork float, water-snail shell, heron feather, "
    "willow leaf, reed whistle, frogbit leaf, golden koi scale, paper boat",
    "nightsky": "stardust, paper star, moonflower, constellation card, nighthawk feather, "
    "tiny rocket, moonstone, little lantern, fallen star, tiny telescope",
}


def test_each_world_has_the_plans_ten_finds() -> None:
    assert set(FINDS) == set(PLAN) == set(CATALOG.visitors)
    for world, names in PLAN.items():
        assert [f["name"] for f in FINDS[world]] == names.split(", "), world
        gift = [f["id"] for f in FINDS[world] if f.get("gift_only")]
        assert len(gift) == 1 and FINDS[world][-1]["id"] == gift[0]
        for f in FINDS[world]:
            assert f["weight"] in (10, 4, 1)
            assert f["a"].split(" ", 1)[0] in ("a", "an", "some")


def test_find_ids_are_unique_across_worlds() -> None:
    """Review #10: a basket entry names its world, but nothing may lean on it."""
    ids = [f["id"] for fs in FINDS.values() for f in fs]
    assert len(ids) == len(set(ids)) == 60


def test_every_when_token_is_a_known_flag() -> None:
    for fs in FINDS.values():
        for f in fs:
            assert valid_when(f["when"]), f
            for clause in f["when"] or []:
                assert all(t.removeprefix("!") in FIND_TOKENS for t in clause)
    # Review #19: [] and [[]] aren't conditions; null is always; typos fail.
    assert valid_when(None)
    for bad in (
        [],
        [[]],
        [["rainy"], []],
        [["raining"]],
        [["!sunny", "nite"]],
        "rainy",
    ):
        assert not valid_when(bad), bad


def test_a_bad_find_is_skipped_by_the_catalog(monkeypatch: pytest.MonkeyPatch) -> None:
    from custom_components.virtual_pet import species

    assert not species.valid_find({"id": "x", "a": "an x", "weight": 1, "when": []})
    assert not species.valid_find({"id": "x", "a": "an x", "weight": True})
    assert not species.valid_find({"id": "x", "weight": 1})
    # V-B audit #4: the tiles and captions read `name`.
    assert not species.valid_find({"id": "x", "a": "an x", "weight": 4, "when": None})
    named = {"id": "x", "name": "x", "a": "an x", "weight": 4, "when": None}
    assert species.valid_find(named)
    assert not species.valid_find({**named, "name": 3})


def test_a_visitors_leaves_names_a_find_of_its_world() -> None:
    for world, visitors in CATALOG.visitors.items():
        own = {f["id"] for f in FINDS[world] if not f.get("gift_only")}
        for v in visitors:
            if "leaves" in v:
                assert v["leaves"] in own, (world, v)


def test_finds_load_from_every_world_ready_or_not(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Review #14: a world whose species all go not-ready keeps its finds known."""
    from custom_components.virtual_pet import species

    real = species.json.loads

    def not_ready(text: str, *a: Any, **kw: Any) -> Any:
        data = real(text, *a, **kw)
        if isinstance(data, dict) and "stages" in data:
            data["ready"] = False
        return data

    monkeypatch.setattr(species.json, "loads", not_ready)
    catalog = species.load_catalog()
    assert catalog.worlds == {}
    assert {w: len(fs) for w, fs in catalog.finds.items()} == dict.fromkeys(PLAN, 10)


# --- The flags (home.find_flags) ---------------------------------------------


def flags(
    configured: set[str] = frozenset(),  # type: ignore[assignment]
    hour: int = 12,
    season: str | None = "summer",
    now: float = 0.0,
    **readings: Any,
) -> dict[str, bool | None]:
    return find_flags(Readings(night=False, **readings), now, hour, season, configured)


def test_a_missing_signal_comes_from_the_configuration() -> None:
    """Review #3: missing means nothing is set up for it, not a reading that is
    None for now (a restart's first ticks, an entity briefly unavailable)."""
    none = flags()
    assert {k: none[k] for k in ("rainy", "snowy", "sunny", "foggy")} == dict.fromkeys(
        ("rainy", "snowy", "sunny", "foggy")
    )
    # A weather entity mapped but unavailable: false, not missing.
    gone = flags({"weather"}, condition=None)
    assert gone["rainy"] is gone["snowy"] is gone["sunny"] is gone["foggy"] is False
    # A rain gauge alone gives rain; a solar sensor alone gives sun.
    gauge = flags({"rain"}, rain_rate=1.2)
    assert gauge["rainy"] is True and gauge["snowy"] is None and gauge["sunny"] is None
    assert flags({"rain"}, rain_rate=None)["rainy"] is False
    solar = flags({"solar"}, solar=R.HOME_SUNNY_SOLAR + 1)
    assert solar["sunny"] is True and solar["rainy"] is None
    weather = flags({"weather"}, condition="fog", sun_up=True)
    assert weather["foggy"] is True and weather["rainy"] is False
    assert flags({"weather"}, condition="snowy")["snowy"] is True
    assert flags({"weather"}, condition="pouring")["rainy"] is True


def test_night_is_the_sun_down_not_the_sleep_hours() -> None:
    assert flags(sun_up=False, hour=12)["night"] is True
    assert flags(sun_up=True, hour=23)["night"] is False
    # No sun entity: 20:00-06:00 local.
    assert [flags(hour=h)["night"] for h in (5, 6, 19, 20)] == [
        True,
        False,
        False,
        True,
    ]


def test_the_season_comes_from_the_hemisphere_and_is_missing_in_the_tropics() -> None:
    assert flags(season="autumn")["autumn"] is True
    assert flags(season="autumn")["winter"] is False
    assert flags(season="winter")["winter"] is True
    tropics = flags(season=None)
    assert tropics["autumn"] is None and tropics["winter"] is None


FULL = datetime(2026, 10, 26, 4, 12, tzinfo=UTC).timestamp()  # a full moon
NEW = datetime(2026, 11, 9, 7, 2, tzinfo=UTC).timestamp()  # a new moon


def test_the_moon_comes_from_the_date_with_no_moon_entity() -> None:
    """Review #4 (a), owner Q3: moonstone happens everywhere; 3 nights a month
    (V-B audit #1)."""
    assert R.FIND_FULL_MOON_DAYS == 1.5
    assert full_moon_by_date(FULL) and not full_moon_by_date(NEW)
    assert full_moon_by_date(FULL + 1.4 * 86400) and not full_moon_by_date(
        FULL + 1.7 * 86400
    )
    assert full_moon_by_date(FULL - 1.4 * 86400)
    year = datetime(2026, 1, 1, tzinfo=UTC).timestamp()
    days = sum(full_moon_by_date(year + d * 86400) for d in range(365))
    assert 12 * 3 <= days <= 13 * 3 + 1
    # With the sun down only.
    assert flags(sun_up=False, now=FULL)["full_moon"] is True
    assert flags(sun_up=True, now=FULL)["full_moon"] is False
    assert flags(sun_up=False, now=NEW)["full_moon"] is False


def test_a_moon_entity_or_the_date_says_full() -> None:
    """V-B audit #1 (first mate): for finds, a mapped entity saying full OR the
    date's 3-night window. HA's phase sensor says full for about a day only."""
    mapped = {"moon"}
    assert flags(mapped, sun_up=False, now=NEW, moon_phase="Full Moon")["full_moon"]
    assert flags(mapped, sun_up=False, now=NEW, moon_illumination=0.99)["full_moon"]
    # The sensor has moved on (or is unavailable): the date's window still counts.
    assert flags(mapped, sun_up=False, now=FULL, moon_phase="waning_gibbous")[
        "full_moon"
    ]
    assert flags(mapped, sun_up=False, now=FULL)["full_moon"]
    assert not flags(mapped, sun_up=False, now=NEW, moon_phase="new_moon")["full_moon"]
    assert not flags(mapped, sun_up=True, now=NEW, moon_phase="Full Moon")["full_moon"]


# --- The weight (the per-token rule, review #2) ------------------------------

MISSING: dict[str, bool | None] = {
    **ALL_TRUE,
    "rainy": None,
    "snowy": None,
    "sunny": None,
    "foggy": None,
}


@pytest.mark.parametrize(
    ("world", "find_id", "flag_values", "weight"),
    [
        # Plain finds: their tier, always.
        ("woodland", "pinecone", {}, 10),
        ("woodland", "jayfeather", {}, 4),
        # Chanterelle: autumn and (rainy or foggy).
        ("woodland", "chanterelle", {"autumn": True, "rainy": True}, 4),
        ("woodland", "chanterelle", {"autumn": True, "foggy": True}, 4),
        ("woodland", "chanterelle", {"autumn": False, "rainy": True}, 0),
        (
            "woodland",
            "chanterelle",
            {"autumn": True, "rainy": False, "foggy": False},
            0,
        ),
        ("woodland", "chanterelle", {"autumn": None, "rainy": True}, 1),  # tropics
        (
            "woodland",
            "chanterelle",
            {"autumn": None, "rainy": False, "foggy": False},
            0,
        ),
        ("woodland", "chanterelle", {"autumn": True, "rainy": None, "foggy": None}, 1),
        ("woodland", "chanterelle", {"autumn": None, "rainy": None, "foggy": None}, 1),
        ("woodland", "chanterelle", {"autumn": False, "rainy": None}, 0),
        # Four-leaf clover (rare, sunny): no "already rare keeps its condition".
        ("woodland", "fourleafclover", {"sunny": True}, 1),
        ("woodland", "fourleafclover", {"sunny": False}, 0),
        ("woodland", "fourleafclover", {"sunny": None}, 1),
        ("woodland", "snailshell", {"rainy": None}, 1),
        ("woodland", "frostedleaf", {"snowy": True}, 4),
        ("terrarium", "dewdrop", {"foggy": None}, 1),
        # Pine sprig: snowy or winter; the best clause wins.
        ("hearth", "pinesprig", {"snowy": None, "winter": True}, 4),
        ("hearth", "pinesprig", {"snowy": None, "winter": False}, 1),
        ("hearth", "pinesprig", {"snowy": False, "winter": None}, 1),
        ("hearth", "pinesprig", {"snowy": False, "winter": False}, 0),
        ("hearth", "pinesprig", {"snowy": True, "winter": None}, 4),
        ("tidepool", "bottle", {"rainy": True}, 1),
        ("tidepool", "bottle", {"rainy": None}, 1),
        ("tidepool", "bottle", {"rainy": False}, 0),
        ("pond", "frogbit", {"sunny": None}, 1),
        # Night Sky.
        ("nightsky", "moonflower", {"night": True}, 10),
        ("nightsky", "moonflower", {"night": False}, 0),
        ("nightsky", "moonstone", {"full_moon": True}, 4),
        ("nightsky", "moonstone", {"full_moon": False}, 0),
        # Fallen star: night and not rainy; a missing !rainy drops out.
        ("nightsky", "fallenstar", {"night": True, "rainy": False}, 1),
        ("nightsky", "fallenstar", {"night": True, "rainy": True}, 0),
        ("nightsky", "fallenstar", {"night": True, "rainy": None}, 1),
        ("nightsky", "fallenstar", {"night": False, "rainy": None}, 0),
    ],
)
def test_the_weight_per_token(
    world: str, find_id: str, flag_values: dict[str, Any], weight: float
) -> None:
    assert model.find_weight(find(world, find_id), flag_values) == weight


def test_a_flag_that_is_truthy_but_not_a_bool_still_counts() -> None:
    """V-B audit #3: compared by value, not identity."""
    clover, star = find("woodland", "fourleafclover"), find("nightsky", "fallenstar")
    assert model.find_weight(clover, {"sunny": 1}) == 1
    assert model.find_weight(clover, {"sunny": 0}) == 0
    assert model.find_weight(star, {"night": 1, "rainy": 0}) == 1
    assert model.find_weight(star, {"night": 1, "rainy": 1}) == 0


def test_an_uncommon_true_only_for_want_of_a_signal_falls_to_weight_1() -> None:
    uncommon = {"id": "x", "weight": 4, "when": [["rainy", "night"]]}
    assert model.find_weight(uncommon, {"rainy": None, "night": True}) == 1
    assert model.find_weight(uncommon, {"rainy": True, "night": True}) == 4
    assert model.find_weight(uncommon, {}) == 1  # every token missing


# --- The roll ----------------------------------------------------------------


def roll(
    pet: model.PetState,
    now: float,
    world: str = "woodland",
    rng: random.Random | None = None,
    flag_values: dict[str, bool | None] | None = None,
) -> list[model.Event]:
    return model.roll_find(
        pet,
        now,
        "2026-10-26",
        world,
        FINDS.get(world, []),
        ALL_TRUE if flag_values is None else flag_values,
        KNOWN,
        rng or Dice(),
    )


def test_the_clock_schedules_first_then_rolls_once_when_due() -> None:
    pet, t = awake_pet(), 1_000_000.0
    assert roll(pet, t) == [] and pet.basket == []  # scheduled, no roll
    due = pet.next_find_at
    assert due is not None and t + 3 * HOUR <= due <= t + 5 * HOUR
    assert roll(pet, due - 1) == [] and pet.next_find_at == due
    events = roll(pet, due)
    assert events == [{"type": "found", "id": pet.basket[0]["id"], "world": "woodland"}]
    assert due + 3 * HOUR <= pet.next_find_at <= due + 5 * HOUR


def test_a_clock_that_went_back_reschedules_from_now() -> None:
    """V-B audit #2: a next roll further ahead than any gap (an RTC ahead
    before NTP, a restored snapshot) is scheduled again from now, no roll."""
    pet, t = awake_pet(), 1_000_000.0
    pet.next_find_at = t + 30 * 86400
    assert roll(pet, t) == [] and pet.basket == []
    assert t + 3 * HOUR <= pet.next_find_at <= t + 5 * HOUR
    pet.next_find_at = t + 5 * HOUR  # at the edge: kept
    assert roll(pet, t) == [] and pet.next_find_at == t + 5 * HOUR
    # Paused (asleep), it is left alone until the pet can roll.
    pet.next_find_at, pet.asleep = t + 30 * 86400, True
    assert roll(pet, t) == [] and pet.next_find_at == t + 30 * 86400


def test_a_long_wait_is_one_roll_never_caught_up() -> None:
    """Review #8 (b): HA down for days, an upgrade back, fast_forward."""
    pet, t = awake_pet(), 1_000_000.0
    pet.next_find_at = t - 5 * 86400
    assert len(roll(pet, t)) == 1 and len(pet.basket) == 1
    assert pet.next_find_at > t and roll(pet, t + 60) == []


def test_the_chance_can_miss() -> None:
    pet, t = awake_pet(), 1_000_000.0
    pet.next_find_at = t - 1

    class Miss(Dice):
        def random(self) -> float:
            return R.FIND_CHANCE

    assert roll(pet, t, rng=Miss()) == [] and pet.basket == []
    assert pet.next_find_at > t  # the roll happened: rescheduled


@pytest.mark.parametrize("why", ["away", "egg", "asleep", "napping"])
def test_no_roll_away_as_an_egg_or_asleep_and_the_clock_pauses(why: str) -> None:
    """R2, owner Q2: the clock is paused, not reset (left as it was)."""
    pet, t = awake_pet(), 1_000_000.0
    pet.next_find_at = t - 1
    if why == "away":
        pet.away = True
    elif why == "egg":
        pet.age_hours = 0.1
    else:
        pet.asleep = True
        pet.napping = why == "napping"
    assert roll(pet, t) == [] and pet.next_find_at == t - 1 and pet.basket == []
    unset = awake_pet()
    unset.away, unset.asleep = pet.away, pet.asleep
    unset.age_hours = pet.age_hours
    assert roll(unset, t) == [] and unset.next_find_at is None


def test_a_roll_due_during_a_nap_comes_once_on_waking() -> None:
    pet, t = awake_pet(), 1_000_000.0
    assert roll(pet, t) == []
    due = pet.next_find_at
    assert due is not None
    pet.asleep = pet.napping = True
    for tick in range(int((due - t) // 300) + 30):  # the nap runs past the due time
        assert roll(pet, t + tick * 300) == []
    assert pet.next_find_at == due
    pet.asleep = pet.napping = False
    woke = due + 2 * HOUR
    assert len(roll(pet, woke)) == 1
    assert roll(pet, woke + 300) == [] and pet.next_find_at > woke + 3 * HOUR - 1


def test_a_deadline_after_the_nap_is_untouched() -> None:
    pet, t = awake_pet(), 1_000_000.0
    pet.next_find_at = t + 4 * HOUR
    pet.asleep = pet.napping = True
    roll(pet, t + HOUR)
    pet.asleep = pet.napping = False
    assert roll(pet, t + 2 * HOUR) == [] and pet.next_find_at == t + 4 * HOUR


def test_only_night_sky_rolls_asleep() -> None:
    pet, t = awake_pet(), 1_000_000.0
    pet.asleep, pet.next_find_at = True, t - 1
    assert len(roll(pet, t, world="nightsky")) == 1
    assert pet.basket[0]["world"] == "nightsky"
    pet.away, pet.next_find_at = True, t - 1  # away: not even Night Sky
    assert roll(pet, t, world="nightsky") == [] and pet.next_find_at == t - 1


def test_a_world_with_no_finds_rolls_nothing() -> None:
    pet = awake_pet()
    pet.next_find_at = 1.0
    assert roll(pet, 10.0, world="atlantis") == [] and pet.next_find_at == 1.0


def test_a_find_is_credited_when_rolled_and_remembers_it_was_new() -> None:
    """Review #1, owner Q1: credited at roll time, tapped or not; the basket
    entry keeps `new` for the reveal."""
    pet, t = awake_pet(), 1_000_000.0
    pet.next_find_at = t - 1
    roll(pet, t)
    first = pet.basket[0]
    assert first["new"] is True
    assert pet.collection["woodland"]["finds"] == {first["id"]: "2026-10-26"}
    # The same find again: not new, and its first day is kept.
    model.add_find(pet, "2026-10-27", "woodland", first["id"], KNOWN)
    assert pet.basket[1] == {"id": first["id"], "world": "woodland", "new": False}
    assert pet.collection["woodland"]["finds"][first["id"]] == "2026-10-26"


def test_a_full_basket_still_rolls_and_the_extra_goes_to_the_collection() -> None:
    """R1: no found moment, no line, and nothing waits on a tap."""
    pet, t = awake_pet(), 1_000_000.0
    pet.basket = [{"id": "acorn", "world": "woodland", "new": True}] * 2 + [
        {"id": "pearl", "world": "tidepool", "new": True}  # another world counts
    ]
    pet.next_find_at = t - 1
    assert roll(pet, t) == [] and len(pet.basket) == 3
    assert len(pet.collection["woodland"]["finds"]) == 1
    # Unknown entries (a later version's) don't take room (review #9).
    pet.basket[2] = {"id": "nonesuch", "world": "tidepool", "new": True}
    pet.next_find_at = t + 5 * HOUR
    assert len(roll(pet, t + 5 * HOUR)) == 1 and len(pet.basket) == 4


def test_a_met_find_counts_half_and_gift_only_never_comes() -> None:
    """Review #15 (moved to V-B): gift-only finds are never rolled."""
    pet = awake_pet()
    pet.collection = {"woodland": {"visitors": {}, "finds": {"acorn": "2026-10-01"}}}
    dice = Dice()
    picked = model.pick_find(pet, "woodland", FINDS["woodland"], ALL_TRUE, dice)
    assert picked is not None
    pool = [f for f in FINDS["woodland"] if not f.get("gift_only")]
    assert dice.weights == [
        [f["weight"] * (0.5 if f["id"] == "acorn" else 1) for f in pool]
    ]
    rng = random.Random(3)
    for _ in range(2000):
        f = model.pick_find(pet, "woodland", FINDS["woodland"], ALL_TRUE, rng)
        assert f is not None and not f.get("gift_only")


def test_a_false_condition_means_no_chance() -> None:
    no = {**ALL_TRUE, "night": False, "full_moon": False}
    rng = random.Random(5)
    seen = {
        f["id"]
        for _ in range(3000)
        if (f := model.pick_find(awake_pet(), "nightsky", FINDS["nightsky"], no, rng))
    }
    assert seen.isdisjoint({"moonflower", "moonstone", "lantern", "fallenstar"})
    assert "stardust" in seen


# --- The visitor's left find (§1, review #6) -----------------------------------


def credited_visit(world: str, guest: str, day: str = "2026-10-26") -> dict[str, Any]:
    return {
        "day": day,
        "world": world,
        "id": guest,
        "hours": "day",
        "from": 0.0,
        "until": 10.0,
        "credited": False,
    }


def leave(
    pet: model.PetState, world: str, guest: str, rng: random.Random | None = None
) -> bool:
    pet.visit = credited_visit(world, guest)
    return model.daily_visit(
        pet,
        20.0,
        "2026-10-26",
        world,
        CATALOG.visitors[world],
        "p",
        rng or Dice(),
        UTC,
        finds=FINDS[world],
        known=KNOWN,
    )


def test_a_visitor_leaves_its_own_find() -> None:
    pet = awake_pet()
    assert leave(pet, "woodland", "stellersjay")
    assert pet.collection["woodland"]["visitors"] == {"stellersjay": "2026-10-26"}
    assert pet.basket == [
        {"id": "jayfeather", "world": "woodland", "new": True, "from": "stellersjay"}
    ]
    assert pet.collection["woodland"]["finds"] == {"jayfeather": "2026-10-26"}


def test_any_other_visitor_leaves_a_plain_common(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    commons = {
        f["id"]
        for f in FINDS["nightsky"]
        if f["weight"] == 10 and f["when"] is None and not f.get("gift_only")
    }
    assert commons == {"stardust", "paperstar", "constellation"}  # not moonflower
    monkeypatch.setattr(R, "VISIT_LEAVES_FIND", 1.0)
    left = set()
    for seed in range(40):
        pet = awake_pet()
        leave(pet, "nightsky", "raccoon", random.Random(seed))
        (entry,) = pet.basket
        assert entry["from"] == "raccoon"
        left.add(entry["id"])
    assert left == commons


def test_a_full_basket_sends_the_left_find_to_the_collection() -> None:
    pet = awake_pet()
    pet.basket = [{"id": "acorn", "world": "woodland", "new": True}] * 3
    leave(pet, "woodland", "stellersjay")
    assert len(pet.basket) == 3 and all(e["id"] == "acorn" for e in pet.basket)
    assert "jayfeather" in pet.collection["woodland"]["finds"]


def test_about_one_visit_in_three_leaves_a_find_and_none_fires_found() -> None:
    """Owner Q4: daily_visit returns no events; a left find is never `found`."""
    rng, left = random.Random(11), 0
    for _ in range(3000):
        pet = awake_pet()
        leave(pet, "woodland", "chickadee", rng)
        left += len(pet.basket)
    assert abs(left / 3000 - R.VISIT_LEAVES_FIND) < 0.03


def test_credit_visit_is_unchanged_and_leaves_nothing() -> None:
    pet = awake_pet()
    pet.visit = credited_visit("woodland", "stellersjay")
    assert model.credit_visit(pet, 20.0, "woodland") and pet.basket == []


def test_a_visit_credited_on_the_next_days_rollover_still_leaves_one() -> None:
    """Review #6 with V-A #10: credit first, the left find, then today's pick."""
    pet = awake_pet()
    pet.visit = credited_visit("woodland", "stellersjay", "2026-10-25")
    model.daily_visit(
        pet,
        20.0,
        "2026-10-26",
        "woodland",
        CATALOG.visitors["woodland"],
        "p",
        Dice(),
        UTC,
        finds=FINDS["woodland"],
        known=KNOWN,
    )
    assert pet.visit["day"] == "2026-10-26"
    assert pet.basket[0]["id"] == "jayfeather"
    assert pet.collection["woodland"]["finds"] == {"jayfeather": "2026-10-25"}


# --- The basket in the save (§6) ---------------------------------------------


def test_basket_and_clock_round_trip() -> None:
    pet = awake_pet()
    pet.basket = [
        {"id": "acorn", "world": "woodland", "new": True},
        {"id": "jayfeather", "world": "woodland", "new": False, "from": "stellersjay"},
    ]
    pet.next_find_at = 12345.5
    back = model.PetState.from_dict(pet.to_dict(), "Pip", 0)
    assert back.basket == pet.basket and back.next_find_at == 12345.5


def test_an_old_save_loads_with_an_empty_basket_and_no_clock() -> None:
    data = awake_pet().to_dict()
    del data["basket"], data["next_find_at"]
    pet = model.PetState.from_dict(data, "Pip", 0)
    assert pet.basket == [] and pet.next_find_at is None


def test_damaged_baskets_and_clocks_load_with_the_rest_kept() -> None:
    basket = [
        "x",
        {"id": 3, "world": "woodland"},
        {"id": "acorn"},
        {"id": "acorn", "world": "woodland", "new": "yes", "from": 7},
        {"id": "jayfeather", "world": "woodland", "new": True, "from": "stellersjay"},
        {"id": "nonesuch", "world": "atlantis", "new": True, "later": [1]},
    ]
    for bad in (basket, "junk", {"a": 1}, None):
        data = {**awake_pet().to_dict(), "basket": bad, "name": "Bean"}
        data["next_find_at"] = "soon"
        pet = model.PetState.from_dict(data, "Pip", 0)
        assert pet.name == "Bean" and pet.next_find_at is None
        if bad is basket:
            assert pet.basket == [
                {"id": "acorn", "world": "woodland", "new": False},
                basket[4],
                basket[5],
            ]
        else:
            assert pet.basket == []


def test_at_load_the_first_three_known_and_every_unknown_are_kept() -> None:
    """Review #9: a basket back from a later version can't be full of things
    this version can't show."""
    pet = awake_pet()
    unknown = [{"id": f"later{i}", "world": "woodland", "new": True} for i in range(4)]
    known = [{"id": "acorn", "world": "woodland", "new": i == 0} for i in range(5)]
    pet.basket = [unknown[0], *known[:2], unknown[1], *known[2:], *unknown[2:]]
    model.trim_basket(pet, KNOWN)
    assert pet.basket == [unknown[0], *known[:2], unknown[1], known[2], *unknown[2:]]
    assert len(model.basket_known(pet, KNOWN)) == 3


def test_collect_takes_the_known_finds_and_leaves_the_rest() -> None:
    pet = awake_pet()
    later = {"id": "later", "world": "atlantis", "new": True, "x": 1}
    pet.basket = [
        {"id": "acorn", "world": "woodland", "new": True, "x": 2},
        later,
        {"id": "pearl", "world": "tidepool", "new": False, "from": "gull"},
    ]
    assert model.collect_basket(pet, KNOWN) == [
        {"id": "acorn", "world": "woodland", "new": True},
        {"id": "pearl", "world": "tidepool", "new": False, "from": "gull"},
    ]
    assert pet.basket == [later]
    assert model.collect_basket(pet, KNOWN) == []  # a second tap: nothing


def test_salvage_keeps_the_basket() -> None:
    entry = {"id": "acorn", "world": "woodland", "new": True}
    pet = model.PetState.salvage(
        {"basket": [entry, "junk"], "next_find_at": 5.0, "hunger": "x"}, "Pip", 0
    )
    assert pet.basket == [entry] and pet.next_find_at is None
    assert model.PetState.salvage({"basket": 7}, "Pip", 0).basket == []


def test_lay_egg_carries_the_basket_and_starts_the_clock_again() -> None:
    """Review #8 (e): the egg can't roll; the hatchling's clock starts fresh."""
    pet = awake_pet()
    pet.age_hours = dict(R.STAGE_STARTS)["adult"] + R.LAY_EGG_AFTER_ADULT_HOURS + 5
    pet.species, pet.raised = "bird", ["bird"]
    pet.basket = [{"id": "acorn", "world": "woodland", "new": True}]
    pet.next_find_at = 99.0
    egg, events = model.lay_egg(pet, 100.0, random.Random(1))
    assert events and egg.basket == pet.basket and egg.basket is not pet.basket
    assert egg.next_find_at is None


def test_a_v_a_save_round_trips_through_v_b() -> None:
    """Review #21: a V-A save (finds already kept in the collection, a basket
    and clock in its unknown keys if it came back from V-B) loads in V-B and
    saves back with nothing lost. The other way (V-B → V-A) is V-A's
    from_dict/to_dict: basket and next_find_at land in its `unknown`, and
    collection_from keeps every page's `finds` (checked by hand against
    0.40.0's model.py; see the plan's "V-B as built")."""
    data = model.PetState.new("Pip", 0).to_dict()
    del data["basket"], data["next_find_at"]
    data["collection"] = {
        "woodland": {"visitors": {"snail": "2026-10-01"}, "finds": {"acorn": "x"}}
    }
    data["later"] = {"kept": True}
    pet = model.PetState.from_dict(data, "Pip", 0)
    saved = pet.to_dict()
    assert saved["collection"] == data["collection"] and saved["later"] == {
        "kept": True
    }
    assert saved["basket"] == [] and saved["next_find_at"] is None
    back = {**data, "basket": [{"id": "acorn", "world": "woodland", "new": True}]}
    back["next_find_at"] = 7.0
    pet = model.PetState.from_dict(back, "Pip", 0)
    assert pet.basket == back["basket"] and pet.next_find_at == 7.0


# --- How rare (§2: the analytic bound, review #7) -------------------------------

FINDS_A_DAY = 2.4  # awake ~16 h, a roll every 4 h, a 0.6 chance
# The stated condition frequencies (share of rolls the token is true on).
FREQUENCY = {
    "sunny": 1 / 3,
    "rainy": 1 / 4,
    "foggy": 1 / 10,
    "snowy": 1 / 10,
    "night": 1 / 2,  # Night Sky rolls asleep too
    "autumn": 1 / 4,
    "winter": 1 / 4,
    # The date's window (V-B audit #1: from the constant, so the bound tracks
    # it), the sun down.
    "full_moon": 2 * R.FIND_FULL_MOON_DAYS / 29.53 / 2,
}
NIGHTSKY_FINDS_A_DAY = 24 / 4 * R.FIND_CHANCE  # asleep too


def clause_chance(clause: list[str]) -> float:
    """The chance a clause holds on a roll, tokens taken as independent (and
    full_moon already counting the night)."""
    p = 1.0
    for token in clause:
        name = token.removeprefix("!")
        if name == "night" and "full_moon" in clause:
            continue
        f = FREQUENCY[name]
        p *= 1 - f if token.startswith("!") else f
    return p


def chance(f: dict[str, Any]) -> float:
    """A find's condition is true on this share of rolls (at most the sum of
    its clauses)."""
    if f["when"] is None:
        return 1.0
    return min(1.0, sum(clause_chance(c) for c in f["when"]))


def expected_wait_days(world: str, f: dict[str, Any], worst: bool) -> float:
    """From a fresh collection: days until a find, at FINDS_A_DAY. The pool's
    total weight counts every condition find as true (worst) or at its
    stated frequency; the ×0.5 on met finds only shortens the wait."""
    pool = [g for g in FINDS[world] if not g.get("gift_only")]
    total = sum(g["weight"] * (1.0 if worst else chance(g)) for g in pool)
    rate = NIGHTSKY_FINDS_A_DAY if world in model.FINDS_ASLEEP else FINDS_A_DAY
    return total / (f["weight"] * chance(f) * rate)


def test_the_rarest_unconditional_find_comes_within_30_days() -> None:
    """The acceptance bound (§2): every world's rarest unconditional find,
    with every condition find in the pool (the worst case), at 2.4 a day."""
    for world in FINDS:
        plain = [
            f for f in FINDS[world] if f["when"] is None and not f.get("gift_only")
        ]
        worst = max(expected_wait_days(world, f, worst=True) for f in plain)
        assert worst <= 30, (world, worst)


def test_conditional_finds_come_within_100_days_at_the_stated_weather() -> None:
    """Conditional ★ finds included, at FREQUENCY (sunny 1 day in 3, rain 1 in
    4, fog and snow 1 in 10, a season 1 in 4). Their tiles are hidden until
    met (§13b #2), so a long wait is never a silhouette."""
    waits = {
        f["id"]: round(expected_wait_days(world, f, worst=False))
        for world in FINDS
        for f in FINDS[world]
        if f["when"] is not None
    }
    assert max(waits.values()) <= 100, waits


# --- The coverage run (a regression snapshot, review #7) --------------------
# Not the guarantee (the analytic waits above are): a fixed seed, start date and
# weather schedule, so it can't flake, but a change in what the rng is asked for
# moves it. Over seeds 0-19 (2026-11-01) every world sees all nine in 90 days
# except, with weather, Tidepool in 10 of 20 (a message in a bottle: ~89 days)
# and Woodland in 2; Night Sky in 6 (weather) and 7 (none) of 20 (moonstone:
# ~62 days). If it fails after such a change, check the waits, then re-pin.

START = date(2026, 10, 15)  # crosses into winter
DAYS = 90
LATITUDE = 45.0


def sun_up(day: date, hour: float, latitude: float) -> bool:
    """The sun above the horizon, by the real day length (noon at 12:00)."""
    doy = day.timetuple().tm_yday
    decl = math.radians(-23.44) * math.cos(2 * math.pi * (doy + 10) / 365)
    x = -math.tan(math.radians(latitude)) * math.tan(decl)
    half = math.degrees(math.acos(max(-1.0, min(1.0, x)))) / 15
    return abs(hour - 12) < half


# A fixed condition per day, from a stated 10-day cycle; snow replaces rain
# from mid-November.
WEATHER_CYCLE = ("sunny", "cloudy", "rainy", "sunny", "fog", "cloudy", "rainy")
WEATHER_CYCLE += ("sunny", "partlycloudy", "snowy")


def condition(day: date) -> str:
    weather = WEATHER_CYCLE[(day - START).days % len(WEATHER_CYCLE)]
    if weather == "rainy" and day >= date(2026, 11, 15) and day.day % 2:
        return "snowy"
    return weather


def coverage_run(world: str, weather: bool, latitude: float, seed: int) -> set[str]:
    """90 days of 5-minute ticks: a pet that sleeps 22:00-07:00, never taps."""
    from custom_components.virtual_pet import people as P

    rng, pet = random.Random(seed), awake_pet()
    configured = {"weather"} if weather else set()
    seen: set[str] = set()
    start = datetime(START.year, START.month, START.day, tzinfo=UTC).timestamp()
    for tick in range(DAYS * 288):
        now = start + tick * 300
        local = datetime.fromtimestamp(now, UTC)
        hour = local.hour + local.minute / 60
        pet.asleep = hour >= 22 or hour < 7
        readings = Readings(
            night=pet.asleep,
            sun_up=sun_up(local.date(), hour, latitude),
            condition=condition(local.date()) if weather else None,
        )
        found = find_flags(
            readings, now, local.hour, P.season(local.date(), latitude), configured
        )
        model.roll_find(
            pet, now, local.date().isoformat(), world, FINDS[world], found, KNOWN, rng
        )
        pet.basket = []  # tapped or not, the collection is credited at once
    seen = set(pet.collection.get(world, {}).get("finds", {}))
    return seen


@pytest.mark.parametrize("world", sorted(PLAN))
def test_ninety_days_see_every_find_with_weather_and_seasons(world: str) -> None:
    every = {f["id"] for f in FINDS[world] if not f.get("gift_only")}
    assert coverage_run(world, True, LATITUDE, seed=2026) == every


@pytest.mark.parametrize("world", sorted(PLAN))
def test_ninety_days_see_every_find_with_no_weather_in_the_tropics(world: str) -> None:
    """The fallback (R5): every weather and season find still comes."""
    every = {f["id"] for f in FINDS[world] if not f.get("gift_only")}
    assert coverage_run(world, False, 10.0, seed=2026) == every


def test_about_two_or_three_finds_a_day() -> None:
    rng, pet = random.Random(1), awake_pet()
    t = 0.0
    for tick in range(30 * 288):
        hour = (tick * 5 / 60) % 24
        pet.asleep = hour >= 22 or hour < 7
        model.roll_find(
            pet, t + tick * 300, "d", "woodland", FINDS["woodland"], ALL_TRUE, {}, rng
        )
    # Every roll goes in the basket (an empty `known`: never full).
    assert 1.8 <= len(pet.basket) / 30 <= 3.0


# --- In Home Assistant -------------------------------------------------------


def basket_pet(now: float, **stats: Any) -> dict[str, Any]:
    return hatched_pet(
        now,
        basket=[
            {"id": "acorn", "world": "woodland", "new": True},
            {"id": "nonesuch", "world": "woodland", "new": True},  # a later version's
            {
                "id": "jayfeather",
                "world": "woodland",
                "new": False,
                "from": "stellersjay",
            },
        ],
        next_find_at=now + 4 * HOUR,
        **stats,
    )


async def test_the_house_view_counts_the_known_finds_and_names_none(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    freezer.move_to("2026-10-26 10:00:00+00:00")
    hass_storage[STORE_KEY] = basket_pet(dt_util.utcnow().timestamp())
    pet = (await setup(hass)).runtime_data
    assert pet._house_view()["basket"] == 2  # review #12: an int, no ids
    for state in hass.states.async_all():  # not on any sensor
        assert "basket" not in state.attributes
        assert "jayfeather" not in str(state.attributes)


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    """Before the access tokens are made (a token from the future is refused)."""
    freezer.move_to("2026-10-26 10:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def test_collect_reads_and_clears_once_for_every_screen(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_read_only_access_token: str,
) -> None:
    """Review #11, #13, #18: two taps back to back get the finds and [], the
    other screen's basket goes at once, and the save is written at once. A
    read-only login may tap (§8: the basket is the household's)."""
    hass_storage[STORE_KEY] = basket_pet(now)
    pet = (await setup(hass)).runtime_data
    other = await hass_ws_client(hass)
    snapshot = await subscribe(other, shared=True)
    assert snapshot["house"]["basket"] == 2
    tapper = await hass_ws_client(hass, hass_read_only_access_token)
    entity = "sensor.pip_life_stage"
    await tapper.send_json_auto_id({"type": f"{DOMAIN}/collect", "entity_id": entity})
    await tapper.send_json_auto_id({"type": f"{DOMAIN}/collect", "entity_id": entity})
    first, second = await tapper.receive_json(), await tapper.receive_json()
    assert first["success"] and second["success"]
    assert first["result"] == {
        "finds": [
            {"id": "acorn", "world": "woodland", "new": True},
            {
                "id": "jayfeather",
                "world": "woodland",
                "new": False,
                "from": "stellersjay",
            },
        ]
    }
    assert second["result"] == {"finds": []}
    assert pet.state.basket == [{"id": "nonesuch", "world": "woodland", "new": True}]
    await hass.async_block_till_done()
    saved = hass_storage[STORE_KEY]["data"]  # no tick: written at once
    assert saved["basket"] == pet.state.basket
    houses = [e["house"] for e in await pushed(other) if "house" in e]
    assert houses and houses[-1]["basket"] == 0
    missing = await command(tapper, "collect", entity_id="sensor.nobody")
    assert not missing["success"] and missing["error"]["code"] == "no_pet"


COLLECTION = {
    "woodland": {
        "visitors": {"stellersjay": "2026-10-20", "ghostvisitor": "2026-10-21"},
        "finds": {
            "acorn": "2026-10-22",
            "acorncup": "2026-10-23",  # gift-only: never in the house page
            "pearl": "2026-10-24",  # tidepool's, not this world's
            "nonesuch": "2026-10-25",  # a later version's
        },
    },
    "tidepool": {"visitors": {}, "finds": {"pearl": "2026-10-24"}},
    "atlantis": {"visitors": {"x": "2026-10-01"}, "finds": {"y": "2026-10-02"}},
}


async def test_collection_reads_this_worlds_known_page_only(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_read_only_user: Any,
    hass_read_only_access_token: str,
) -> None:
    """V-D0: unknown, wrong-world and gift-only ids are skipped, never dropped
    from the save; a read-only login may read; nothing is saved or pushed.
    V-E (review #17) rewrote the "shared true and false get the same reply"
    half: a shared screen gets no `gifts` key; the caller's own screen gets
    their gifts of this world that worlds.json knows (the gift-only one
    included), and nobody else's."""
    me = hass_read_only_user.id
    bonds = {
        me: {"points": 30, "gifts": ["acorncup", "pinecone", "pearl", "nonesuch"]},
        "someone-else": {"points": 30, "gifts": ["acorn", "snailshell"]},
    }
    hass_storage[STORE_KEY] = hatched_pet(
        now, collection=COLLECTION, next_find_at=now + 4 * HOUR, bonds=bonds
    )
    pet = (await setup(hass)).runtime_data
    await hass.async_block_till_done()
    assert "acorncup" in pet.known_finds["woodland"]  # known, so filtered by flag
    watcher = await hass_ws_client(hass)
    await subscribe(watcher, shared=True)
    before = dict(hass_storage[STORE_KEY]["data"]["collection"])
    client = await hass_ws_client(hass, hass_read_only_access_token)
    entity = "sensor.pip_life_stage"
    want = {
        "world": "woodland",
        "visitors": ["stellersjay"],
        "finds": {"acorn": "2026-10-22"},
    }
    reply = await command(client, "collection", entity_id=entity, shared=True)
    assert reply["success"] and reply["result"] == want  # no `gifts` key
    reply = await command(client, "collection", entity_id=entity, shared=False)
    assert reply["success"]
    assert reply["result"] == {**want, "gifts": ["acorncup", "pinecone"]}
    assert "acorncup" not in reply["result"]["finds"]  # never the house page
    assert pet.state.collection == COLLECTION  # nothing dropped
    assert await pushed(watcher) == []  # no publish
    await hass.async_block_till_done()
    data = hass_storage[STORE_KEY]["data"]
    assert data["collection"] == before  # no save written by the read
    missing = await command(
        client, "collection", entity_id="sensor.nobody", shared=True
    )
    assert not missing["success"] and missing["error"]["code"] == "no_pet"
    bad = await command(client, "collection", entity_id=entity)  # shared required
    assert not bad["success"]


async def test_collection_empty_reads_as_empty(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    """V-D0: a pet with no collection reads as an empty page."""
    hass_storage[STORE_KEY] = hatched_pet(now, next_find_at=now + 4 * HOUR)
    await setup(hass)
    client = await hass_ws_client(hass)
    entity = "sensor.pip_life_stage"
    reply = await command(client, "collection", entity_id=entity, shared=False)
    want = {"world": "woodland", "visitors": [], "finds": {}}
    assert reply["result"] == {**want, "gifts": []}  # no bond: none (V-E)
    reply = await command(client, "collection", entity_id=entity, shared=True)
    assert reply["result"] == want


async def test_collection_of_an_egg_still_reads(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    """V-D0: an egg (what a world with no ready species stays) still reads its
    page."""
    egg = hatched_pet(now, collection=COLLECTION, age_hours=0.0, born=now)
    hass_storage[STORE_KEY] = egg
    pet = (await setup(hass)).runtime_data
    assert pet.state.age_hours < 1
    client = await hass_ws_client(hass)
    reply = await command(
        client, "collection", entity_id="sensor.pip_life_stage", shared=True
    )
    assert reply["result"]["visitors"] == ["stellersjay"]
    assert reply["result"]["finds"] == {"acorn": "2026-10-22"}


async def test_a_found_moment_is_public_and_names_nobody(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """Review #13: `found` is in MOMENTS (the away note's), and on the bus with
    only {id, world, pet_id}."""
    assert "found" in MOMENTS
    freezer.move_to("2026-10-26 10:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now, next_find_at=now - 60)
    bus = async_capture_events(hass, MATCH_ALL)
    pet = (await setup(hass)).runtime_data
    pet.rng = Dice()
    pet.state.next_find_at = now - 60
    await pet.async_refresh()
    found = [e for e in bus if e.event_type == f"{DOMAIN}_found"]
    assert len(found) == 1
    assert set(found[0].data) == {"id", "world", "pet_id"}
    assert found[0].data["world"] == "woodland"
    assert pet.moments[0]["type"] == "found"
    assert set(pet.moments[0]) == {"type", "id", "world", "at"}
    assert pet._house_view()["basket"] == 1


async def test_nothing_rolls_before_the_house_is_read(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    """Review #3: before _home_started and a first reading, no roll."""
    freezer.move_to("2026-10-26 10:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now)
    pet = (await setup(hass)).runtime_data
    assert pet._find_flags is not None  # the house was read on the first tick
    pet._home_started, pet._find_flags = False, None
    pet.rng = Dice()
    pet.state.next_find_at = now - 60
    await pet.async_refresh()
    assert pet.state.next_find_at == now - 60 and pet.state.basket == []


async def test_the_first_tick_schedules_the_clock_and_saves_it(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, hass_storage: dict[str, Any]
) -> None:
    freezer.move_to("2026-10-26 10:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now)
    pet = (await setup(hass)).runtime_data
    await pet.async_refresh()  # the first tick with the house read
    due = pet.state.next_find_at
    assert due is not None and now + 3 * HOUR <= due <= now + 5 * HOUR
    freezer.tick(timedelta(minutes=10))
    await pet.async_refresh()
    await hass.async_block_till_done()
    assert pet.state.next_find_at == due  # not re-rolled on the next tick
