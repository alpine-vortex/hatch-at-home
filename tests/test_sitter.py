"""The sitter visits the house (docs/plan-2026-11-04-sitter-visits.md, slice S1).

Nobody home for away_after: the sitter looks after the pet in the house. Its
needs decay as normal and the sitter's rounds top them up at set times (§3.2);
poop is tidied as it appears (§3.3); no calls, misses or pushes (§3.4); care and
play by anyone work as at home (§3.7). The numbers the 14-day bot checks are
re-derived here on the real model, not copied from dev/sitter_sim.py (§3.8).
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
import random
from typing import Any
from zoneinfo import ZoneInfo

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL, STATE_OFF, STATE_ON
from homeassistant.core import Context, HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import model, rates as R
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.coordinator import PetCoordinator

from .test_channel import pushed, subscribe
from .test_init import (
    STORE_KEY,
    game,
    hatched_pet,
    press,
    settle,
    setup,
    setup_with_house,
)
from .test_model import HOUR, MIN, SETTINGS, NoLuck, hatched, run, types

LA = ZoneInfo("America/Los_Angeles")


def at(hour: int, minute: int = 0, day: int = 2) -> float:
    """2 October 2026 (UTC) by default, so the day before is there too."""
    return datetime(2026, 10, day, hour, minute, tzinfo=UTC).timestamp()


def adult(now: float, **stats: Any) -> model.PetState:
    """The sim's pet (§3.2a): an adult bird left at 80 hunger and happiness, 90 energy."""
    pet = model.PetState.new("Pip", now)
    pet.age_hours = 400.0
    pet.species = "bird"
    pet.hatched_on = "2025-12-01"
    pet.hunger = pet.happiness = 80.0
    pet.energy = 90.0
    for key, value in stats.items():
        setattr(pet, key, value)
    return pet


def away(now: float, **stats: Any) -> model.PetState:
    return hatched(now, **{"away": True, **stats})


def local(tz: ZoneInfo, *args: int) -> float:
    return datetime(*args, tzinfo=tz).timestamp()


# --- sitter_due: when (§3.2) ---------------------------------------------------


@pytest.mark.parametrize(
    ("now", "served", "slot"),
    [
        (at(7, 30), 0.0, at(20, day=1)),  # before breakfast: yesterday's supper
        (at(8), 0.0, at(8)),  # on the dot
        (at(8), at(8), None),  # served
        (at(11, 59), at(8), None),
        (at(12, 5), at(8), at(12)),
        (at(17), at(8), at(16)),  # several missed: one, the latest
        (at(23, 30), at(20), None),
        (at(0, 30, day=3), at(16), at(20)),  # after midnight: yesterday's supper
        (at(9), at(9) + 1e9, None),  # a stamp in the future counts as now (§3.10)
    ],
)
def test_due_takes_the_latest_slot_at_or_before_now(now, served, slot) -> None:
    pet = away(now, sitter_served=served)
    assert model.sitter_due(pet, now, SETTINGS) == slot


def test_a_stamp_in_the_future_is_clamped_to_now_and_kept() -> None:
    pet = away(at(9), sitter_served=at(9) + 1e9)
    assert model.sitter_due(pet, at(9), SETTINGS) is None
    assert pet.sitter_served == at(9)
    assert model.sitter_due(pet, at(12, 5), SETTINGS) == at(12)


def test_nothing_is_due_asleep_resting_as_an_egg_or_at_home() -> None:
    now = at(12, 5)
    pet = away(now)
    assert model.sitter_due(pet, now, SETTINGS) == at(12)
    for key, value in (
        ("asleep", True),
        ("resting", True),
        ("age_hours", 0.1),
        ("away", False),
    ):
        other = away(now, **{key: value})
        assert model.sitter_due(other, now, SETTINGS) is None, key


def test_a_supper_slept_through_is_due_the_moment_it_wakes() -> None:
    # A nap through 20:00: the slot is still the latest, so it is served at wake.
    pet = away(at(19, 30), sitter_served=at(16), asleep=True, napping=True)
    assert model.sitter_due(pet, at(21), SETTINGS) is None
    pet.asleep = pet.napping = False
    assert model.sitter_due(pet, at(21), SETTINGS) == at(20)


@pytest.mark.parametrize(
    ("bed", "wake", "last"),
    [
        (time(23), time(7), at(20)),  # wake + 13 h
        (time(21), time(7), at(20)),  # bed - 1 h is 20:00 too
        (time(20, 30), time(7), at(19, 30)),  # the clamp
        (time(19), time(7), at(18)),
        (time(0, 30), time(6), at(19)),  # a bedtime after midnight: wake + 13 h
        (time(21), time(5), at(18)),
    ],
)
def test_the_last_round_is_never_later_than_an_hour_before_bed(bed, wake, last):
    settings = model.Settings(tz=UTC, bedtime=bed, wake_time=wake)
    pet = away(at(23, 59), sitter_served=0.0)
    assert model.sitter_due(pet, at(23, 59), settings) == last


@pytest.mark.parametrize(
    ("day", "slot_hour"),
    [((2026, 3, 8), 16), ((2026, 11, 1), 16)],
)
def test_slots_are_wall_clock_on_a_dst_day(day, slot_hour) -> None:
    """LA's clocks change at 02:00: wake + 9 h is still 16:00 on the clock."""
    settings = model.Settings(tz=LA)
    now = local(LA, *day, 16, 1)
    pet = away(now, sitter_served=local(LA, *day, 12))
    assert model.sitter_due(pet, now, settings) == local(LA, *day, slot_hour)


def test_a_wake_before_three_follows_the_wall_clock_across_dst() -> None:
    # Wake 01:30: on the spring day 02:00-03:00 is skipped, so wake + 1 h is
    # 03:30 on the clock (only an hour of real time after 01:30).
    settings = model.Settings(tz=LA, wake_time=time(1, 30), bedtime=time(18))
    now = local(LA, 2026, 3, 8, 3, 35)
    pet = away(now, sitter_served=local(LA, 2026, 3, 7, 14, 30))
    assert model.sitter_due(pet, now, settings) == local(LA, 2026, 3, 8, 3, 30)
    assert local(LA, 2026, 3, 8, 3, 30) - local(LA, 2026, 3, 8, 1, 30) == HOUR


# --- sitter_round: what (§3.2) ---------------------------------------------------


def done(events: list[model.Event]) -> list[str]:
    rounds = [e for e in events if e["type"] == "sitter_round"]
    assert len(rounds) <= 1
    return rounds[0]["did"] if rounds else []


@pytest.mark.parametrize(
    ("stats", "did"),
    [
        ({"sick": True}, ["medicine"]),
        ({"poops": [at(9)]}, ["clean"]),
        ({"hunger": R.SITTER_FEED_BELOW - 0.1}, ["feed"]),
        ({"hunger": R.SITTER_FEED_BELOW}, []),
        ({"happiness": R.SITTER_PLAY_BELOW - 0.1}, ["play"]),
        ({"happiness": R.SITTER_PLAY_BELOW}, []),
        (
            {"sick": True, "poops": [at(9)], "hunger": 20.0, "happiness": 20.0},
            ["medicine", "clean", "feed", "play"],
        ),
        ({"happiness": 20.0, "energy": R.PLAY_MIN_ENERGY - 0.1}, []),  # too tired
        ({"happiness": 20.0, "energy": R.PLAY_MIN_ENERGY}, ["play"]),
    ],
)
def test_a_round_does_what_is_needed_and_nothing_else(stats, did) -> None:
    now = at(12, 5)
    pet = away(now, **stats)
    events = model.sitter_round(pet, now, SETTINGS)
    assert done(events) == did
    assert [r["action"] for r in pet.care_log] == [f"sitter_{d}" for d in did][::-1]
    assert all(r["by"] is None and r["result"] == model.OK for r in pet.care_log)
    assert pet.sitter_served == at(12)
    rounds = [e for e in events if e["type"] == "sitter_round"]
    assert [r["at"] for r in rounds] == ([now] if did else [])


def test_the_rounds_effects() -> None:
    now = at(12, 5)
    pet = away(now, sick=True, health=50.0, hunger=30.0, happiness=40.0, energy=60.0)
    pet.recent_misses = [now - HOUR]
    weight = pet.weight
    events = model.sitter_round(pet, now, SETTINGS)
    assert "recovered" in types(events) and not pet.sick and not pet.recent_misses
    assert pet.health == 50.0 + R.MEDICINE_HEALTH
    assert pet.hunger == 30.0 + R.FEED_HUNGER + R.SITTER_PLAY_HUNGER
    assert pet.happiness == 40.0 + R.MEDICINE_HAPPINESS + R.PLAY_HAPPINESS
    assert pet.energy == 60.0 + R.SITTER_PLAY_ENERGY
    assert pet.weight == pytest.approx(weight + R.WEIGHT_FEED + R.SITTER_PLAY_WEIGHT)
    assert pet.digesting == [now + R.DIGEST_MINUTES * MIN]  # no jitter
    # Not a person's care (§3.5): no praise window, no excitement, no discipline.
    assert pet.last_care_at == 0.0 and pet.last_excite == 0.0
    assert pet.discipline == 0.0


def test_supper_has_its_own_threshold() -> None:
    hunger = (R.SITTER_FEED_BELOW + R.SITTER_SUPPER_BELOW) / 2
    lunch = away(at(12, 5), hunger=hunger)
    assert done(model.sitter_round(lunch, at(12, 5), SETTINGS)) == []
    supper = away(at(20, 5), hunger=hunger)
    assert done(model.sitter_round(supper, at(20, 5), SETTINGS)) == ["feed"]


def test_a_fine_pet_gets_nothing_and_no_log() -> None:
    pet = away(at(12, 5))
    assert model.sitter_round(pet, at(12, 5), SETTINGS) == []
    assert pet.care_log == [] and pet.sitter_served == at(12)


@pytest.mark.parametrize("key", ["asleep", "resting", "egg"])
def test_no_round_for_a_sleeper_a_resting_pet_or_an_egg(key) -> None:
    stats = {"age_hours": 0.1} if key == "egg" else {key: True}
    pet = away(at(12, 5), hunger=10.0, **stats)
    assert model.sitter_round(pet, at(12, 5), SETTINGS) == []
    assert pet.hunger == 10.0 and pet.sitter_served == 0.0


def test_the_same_input_gives_the_same_round() -> None:
    a = away(at(12, 5), hunger=30.0, happiness=30.0, poops=[at(11)])
    b = model.PetState.from_dict(a.to_dict())
    assert model.sitter_round(a, at(12, 5), SETTINGS) == model.sitter_round(
        b, at(12, 5), SETTINGS
    )
    assert a.to_dict() == b.to_dict()


# --- Arrival (§3.2, §3.9) -----------------------------------------------------


def test_arrival_before_breakfast_feeds_and_stamps_yesterdays_supper() -> None:
    pet = hatched(at(7, 30), hunger=50.0)
    pet.away = True
    events = model.sitter_arrives(pet, at(7, 30), SETTINGS, settles=True)
    # Yesterday's supper is the latest slot, so its threshold applies.
    assert done(events) == ["feed"] and pet.sitter_served == at(20, day=1)
    assert model.sitter_due(pet, at(7, 59), SETTINGS) is None
    assert model.sitter_due(pet, at(8), SETTINGS) == at(8)


def test_arrival_while_asleep_does_nothing_and_stamps_nothing() -> None:
    pet = hatched(at(2), hunger=50.0, asleep=True)
    pet.wake_at = at(7)
    pet.away = True
    assert model.sitter_arrives(pet, at(2), SETTINGS, settles=True) == []
    assert pet.sitter_served == 0.0 and pet.hunger == 50.0
    events = run(pet, at(7, 5))  # served the moment it wakes
    assert "woke_up" in types(events) and done(events) == ["feed"]
    assert pet.sitter_served == at(20, day=1)


@pytest.mark.parametrize("settles", [True, False])
def test_the_whine_option_on_arrival(settles: bool) -> None:
    pet = hatched(at(10))
    pet.call = model.Call("fake", at(10), at(10, 30))
    pet.away = True
    events = model.sitter_arrives(pet, at(10), SETTINGS, settles)
    assert ({"type": "call_settled"} in events) is settles
    assert (pet.call is None) is settles
    if not settles:
        # Kept open and paused: the deadline slides until someone is home.
        run(pet, at(13))
        assert pet.call is not None and pet.call.deadline == at(13, 30)


# --- Calls, misses and pushes (§3.4) -----------------------------------------


def test_a_hunger_call_open_on_arrival_is_fed_and_answered() -> None:
    pet = hatched(at(10), hunger=20.0)
    pet.call = model.Call("hunger", at(9, 50), at(10, 20))
    pet.away = True
    events = model.sitter_arrives(pet, at(10), SETTINGS, settles=True)
    assert {"type": "call_answered", "reason": "hunger"} in events
    assert pet.call is None


def test_a_call_whose_need_is_met_ends_on_the_next_step() -> None:
    pet = away(at(10), sitter_served=at(8), poops=[at(9)])
    pet.call = model.Call("dirty", at(9, 30), at(10, 0) + HOUR)
    pet.poops = []  # met (by a person on another screen, or the tidy)
    events = run(pet, at(10, 5))
    assert {"type": "call_answered", "reason": "dirty"} in events


def test_a_happiness_call_is_answered_by_the_sitters_play() -> None:
    pet = away(at(12), sitter_served=at(8), happiness=20.0)
    pet.call = model.Call("happiness", at(11, 50), at(12, 20))
    events = run(pet, at(12, 5))
    assert done(events) == ["play"]
    assert {"type": "call_answered", "reason": "happiness"} in events


def test_a_night_and_a_morning_with_a_call_kept_open_push_nothing() -> None:
    # The whine option off: the whine stays open across the night, and there is
    # still no call_started of any kind, resumed or not.
    pet = hatched(at(21), discipline=0.0)
    pet.call = model.Call("fake", at(21), at(21, 30))
    pet.away = True
    events = model.sitter_arrives(pet, at(21), SETTINGS, settles=False)
    events += run(pet, at(12, day=3))
    assert "woke_up" in types(events)
    assert "call_started" not in types(events)
    assert "care_miss" not in types(events) and "discipline_miss" not in types(events)
    assert pet.call is not None and pet.call.reason == "fake"


# --- The 14-day sitter bot (§3.8) ---------------------------------------------


def bot(
    settings: model.Settings, start: float, days: int = 14, people: int = 0
) -> dict[str, Any]:
    """Nobody home for `days`, no care at all; the pet left as the sim's."""
    pet = adult(start)
    for i in range(people):
        pet.care_log.append(
            {"at": start - i, "action": "feed", "by": f"P{i}", "result": "ok"}
        )
    pet.away = True
    events = model.sitter_arrives(pet, start, settings, settles=True)
    rng = random.Random(1)
    seen: dict[str, Any] = {
        "hunger": 100.0,
        "happiness": 100.0,
        "weight": (100.0, 0.0),
        "health": 100.0,
        "bands": set(),
        "old_poop": 0,
        "sick": 0,
        "flags": set(),
    }
    t = start
    while t < start + days * 24 * HOUR:
        t += R.MAX_STEP_SECONDS
        events += model.advance(pet, t, settings, rng)
        seen["hunger"] = min(seen["hunger"], pet.hunger)
        seen["happiness"] = min(seen["happiness"], pet.happiness)
        low, high = seen["weight"]
        seen["weight"] = (min(low, pet.weight), max(high, pet.weight))
        seen["health"] = min(seen["health"], pet.health)
        seen["bands"].add(model.weight_band(pet))
        seen["old_poop"] += model._old_poops(pet, t)
        seen["sick"] += pet.sick
        seen["flags"] |= set(model.mood(pet, t, settings)[1])
    seen["types"] = types(events)
    seen["pet"] = pet
    return seen


BOT_ROWS = [
    ("23:00", "07:00", UTC, (2026, 1, 5)),
    ("22:00", "07:00", UTC, (2026, 1, 5)),
    ("21:00", "07:00", UTC, (2026, 1, 5)),
    ("20:30", "07:00", UTC, (2026, 1, 5)),
    ("19:00", "07:00", UTC, (2026, 1, 5)),  # the clamp
    ("00:30", "06:00", UTC, (2026, 1, 5)),
    ("21:00", "05:00", UTC, (2026, 1, 5)),
    ("23:00", "07:00", LA, (2026, 3, 5)),  # across the spring DST night
    ("23:00", "07:00", LA, (2026, 10, 30)),  # across the autumn one
]


@pytest.mark.parametrize(("bed", "wake", "tz", "day"), BOT_ROWS)
def test_fourteen_days_with_the_sitter_keep_every_invariant(bed, wake, tz, day):
    settings = model.Settings(
        tz=tz,
        roster=("bird",),
        bedtime=model.parse_hhmm(bed),
        wake_time=model.parse_hhmm(wake),
    )
    start = local(tz, *day, 9)
    seen = bot(settings, start)
    kinds = seen["types"]
    assert kinds.count("care_miss") == 0 and kinds.count("call_started") == 0
    assert "discipline_miss" not in kinds and "became_sick" not in kinds
    assert seen["sick"] == 0 and seen["health"] == 100.0
    assert seen["old_poop"] == 0
    assert seen["hunger"] >= 36.0, seen["hunger"]
    assert seen["happiness"] >= 35.0, seen["happiness"]
    assert not {"hungry", "bored"} & seen["flags"]
    low, high = seen["weight"]
    assert 40.0 <= low and high <= 65.0, seen["weight"]
    assert seen["bands"] == {"healthy"}
    assert seen["pet"].age_hours == pytest.approx(400.0 + 14 * 24)
    assert kinds.count("pooped") == 0  # tidied the moment it appears
    assert "sitter_round" in kinds


def test_a_fortnight_away_keeps_the_peoples_rows_in_the_log() -> None:
    settings = model.Settings(tz=UTC, roster=("bird",))
    seen = bot(settings, local(UTC, 2026, 1, 5, 9), people=12)
    log = seen["pet"].care_log
    assert len(log) == R.CARE_LOG_SIZE
    assert [r["by"] for r in log if r["by"]] == [f"P{i}" for i in range(12)]
    sitter = [r for r in log if r["action"] in model.SITTER_ACTIONS]
    assert len(sitter) == R.SITTER_LOG_ROWS
    assert log[: R.SITTER_LOG_ROWS] == sitter  # the newest of them


def test_an_egg_with_the_sitter_hatches_and_gets_no_round_until_then() -> None:
    settings = model.Settings(tz=UTC, roster=("bird",))
    egg = model.PetState.new("Pip", at(12))
    egg.away = True
    assert model.sitter_arrives(egg, at(12), settings, settles=True) == []
    events = model.advance(egg, at(13), settings, random.Random(1), max_gap=None)
    assert "hatched" in types(events) and model.life_stage(egg) == "baby"
    assert events.index({"type": "hatched", "species": "bird"}) < len(events)


def test_learning_sampling_and_chore_treats_go_on_during_a_visit() -> None:
    # Plan sitter §3.4 (A3): all three run; settings.home says nobody is home.
    pet = away(at(9), sitter_served=at(8), age_hours=30.0)
    pet.treats_waiting = 2
    events = run(pet, at(11))
    assert types(events).count("chore_treat") == 2
    assert pet.discipline_samples > 0 and pet.wellbeing_samples > 0  # _sample
    assert pet.trait_hours  # _learn counted the awake hours


# --- Person's care during a visit (§3.5, §3.7) --------------------------------


def test_a_persons_care_with_the_sitter_is_theirs() -> None:
    pet = away(at(10), hunger=50.0, sitter_served=at(8))
    result, events = model.apply_action(pet, "feed", at(10), NoLuck(), by="Ada")
    assert result == model.OK and pet.care_log[0]["by"] == "Ada"
    assert pet.last_care_at == at(10)
    info, _ = model.start_game(pet, "higher_lower", at(10, 1), NoLuck(), by="Ada")
    assert info["result"] == model.OK and pet.game is not None
    run(pet, at(10, 3))
    assert pet.game is not None  # runs on (dropped only when idle, as at home)


def test_a_sitter_feed_sets_no_praise_window() -> None:
    pet = away(at(12, 5), hunger=40.0)
    model.sitter_round(pet, at(12, 5), SETTINGS)
    assert pet.last_care_at == 0.0
    model.apply_action(pet, "praise", at(12, 6), NoLuck())
    assert pet.discipline == 0.0  # no praise after care: the sitter's isn't care


# --- Save, load, fast-forward (§3.10) -----------------------------------------


def test_fast_forward_leaves_no_stamp_in_the_future() -> None:
    settings = model.Settings(tz=UTC, roster=("bird",))
    pet = away(at(9), hunger=50.0)
    model.fast_forward(pet, at(9), 30.0, settings, NoLuck())
    assert 0.0 < pet.sitter_served <= at(9)
    at_home = hatched(at(9))
    model.fast_forward(at_home, at(9), 30.0, settings, NoLuck())
    assert at_home.sitter_served == 0.0


def test_an_old_away_save_loads_and_replays_nothing() -> None:
    """A save from the main branch: away true, last_updated kept current by the
    freeze, no sitter_served."""
    old = hatched(at(10), hunger=50.0).to_dict()
    old.update(away=True)
    del old["sitter_served"]
    pet = model.PetState.from_dict(old, now=at(10))
    assert pet.away and pet.sitter_served == 0.0
    model.catch_up(pet, at(10))
    events = model.settle_legacy_lights(pet, at(10), SETTINGS, settles=True)
    assert done(events) == ["feed"] and pet.sitter_served == at(8)  # an arrival
    events = run(pet, at(10, 5))
    assert done(events) == [] and pet.age_hours == pytest.approx(30.0 + 5 / 60)
    assert model.PetState.from_dict(pet.to_dict()).sitter_served == at(8)


@pytest.mark.parametrize("stamp", ["x", None, -5.0, float("nan")])
def test_a_damaged_stamp_loads_as_never(stamp) -> None:
    data = hatched(at(10)).to_dict()
    data["sitter_served"] = stamp
    assert model.PetState.from_dict(data).sitter_served == 0.0


def test_salvage_starts_with_no_stamp() -> None:
    data = hatched(at(10), sitter_served=at(8)).to_dict()
    data["hunger"] = {"broken": True}
    assert model.PetState.salvage(data, "Pip", at(10)).sitter_served == 0.0


# --- The gates (R1, §3.7): one row per gate dropped, and the kept ones ----------


def _gate_pet() -> model.PetState:
    return away(at(12), age_hours=dict(R.STAGE_STARTS)["adult"] + 24 * 30)


MODEL_GATES = {
    "_do_action": lambda p: (
        model.apply_action(p, "praise", at(12), NoLuck())[0] == model.OK
    ),
    "_refuse_play": lambda p: model._refuse_play(p) is None,
    "play_game (drop_game)": lambda p: (
        model.start_game(p, "higher_lower", at(12), NoLuck())[0]["result"] == "ok"
        and model.play_game(p, "higher", at(12, 1), NoLuck(), kind="higher_lower")[0][
            "result"
        ]
        == "ok"
    ),
    "requests": lambda p: "lay_egg" in model.requests(p, at(12), SETTINGS),
    "give_treats": lambda p: (
        setattr(p, "treats_waiting", 1) or model.give_treats(p, at(12)) != []
    ),
    "can_lay_egg": model.can_lay_egg,
    "house_answer": lambda p: model.house_answer(p, "blanket", at(12)) != [],
    "can_find": lambda p: model.can_find(p, "woodland"),
    "react": lambda p: (
        model.react(
            p,
            at(23, 30),
            model.Settings(tz=UTC, home=model.HomeEffect(dark_and_quiet=True)),
        )
        != []
    ),
    "set_lights_out": lambda p: (
        (
            p.__setattr__("energy", 20.0)
            or model.set_lights_out(p, True, at(12), SETTINGS)
        )
        and p.asleep
    ),
}


@pytest.mark.parametrize("gate", sorted(MODEL_GATES))
def test_model_gates_dropped_for_the_sitter(gate: str) -> None:
    assert MODEL_GATES[gate](_gate_pet()), gate


def test_the_mood_names_the_sitter_and_real_mood_does_not() -> None:
    pet = away(at(12), hunger=20.0)
    mood, flags, reason, key = model.mood_keyed(pet, at(12), SETTINGS)
    assert (mood, reason, key) == ("away", "the sitter's here", "away")
    mood, flags, reason, key = model.real_mood(pet, at(12), SETTINGS)
    assert mood == "hungry" and "away" in flags and key == "hungry"


# --- In Home Assistant ----------------------------------------------------------


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return datetime.now(UTC).timestamp()


def pet_of(hass: HomeAssistant) -> PetCoordinator:
    return hass.config_entries.async_entries(DOMAIN)[0].runtime_data


async def test_coordinator_gates_dropped_for_the_sitter(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True)
    await setup(hass)
    pet = pet_of(hass)
    pet.state.away = True
    assert pet._awake()  # the daily wish, moments, the doorbell, a look's lines
    # The news and react services stay: the house talking to an empty room
    # (the keep list, §3.7). Privacy on: "asleep".
    assert pet.share_news("hello") == "asleep"


async def test_coordinator_kept_gates_without_privacy(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True)
    await setup_with_house(hass, privacy=False)
    assert pet_of(hass).share_news("hello") == "away"


async def test_a_round_never_reaches_the_bus_and_reaches_every_card(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    hass_ws_client: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True, happiness=40.0)
    fired: list[str] = []
    hass.bus.async_listen(MATCH_ALL, lambda e: fired.append(e.event_type))
    await setup(hass)
    pet = pet_of(hass)
    # Loaded away: the sitter arrived and played (§3.10).
    assert pet._sitter_last is not None and pet._sitter_last["did"] == ["play"]
    shared = await hass_ws_client(hass)
    snapshot = await subscribe(shared, shared=True)
    sitter = snapshot["house"]["sitter"]
    assert sitter["last"]["did"] == ["play"] and "away" in sitter["flags"]
    assert sitter["mood"] != "away" and sitter["asleep"] is False
    assert set(sitter) == {
        "mood",
        "key",
        "reason",
        "reason_key",
        "flags",
        "asleep",
        "lights_out",
        "last",
    }
    # 16:00's round, by ticks.
    pet.state.happiness = 30.0
    freezer.move_to("2026-10-26 16:00:30+00:00")
    await settle(hass, freezer, 5 * 60)
    assert pet._sitter_last["did"] == ["play"] and pet._sitter_last["at"] > now
    house = [e["house"] for e in await pushed(shared) if "house" in e]
    assert house and house[-1]["sitter"]["last"] == pet._sitter_last
    await hass.async_block_till_done()
    assert f"{DOMAIN}_sitter_round" not in fired
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert not any(m["type"] == "sitter_round" for m in moments)


async def test_a_game_won_after_a_sitter_row_grants_the_wish_to_its_player(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    pet = pet_of(hass)
    today = datetime.now(UTC).date().isoformat()
    pet.state.wish = {"kind": "play", "day": today, "granted": False}
    pet.state.care_log = [
        {"at": now, "action": "sitter_clean", "by": None, "result": "ok"},
        {"at": now - 1, "action": "chore_treat", "by": None, "result": "ok"},
        {"at": now - 2, "action": "feed", "by": "Ada", "result": "ok"},
    ]
    pet._check_ins([{"type": "game_finished", "game": "left_right", "won": True}])
    assert pet.state.wish["granted"] and pet.state.wish["by"] == "Ada"


async def test_care_by_a_person_during_a_visit_earns_their_bond(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True, hunger=20.0)
    await setup(hass)
    me = await hass.auth.async_create_user("Ada")
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": "button.pip_feed"},
        blocking=True,
        context=Context(user_id=me.id),
    )
    pet = pet_of(hass)
    assert pet.state.care_log[0]["by"] == "Ada"
    assert pet.state.bonds[me.id]["points"] > 0
    assert (await game(hass, guess="left"))["result"] == "ok"


async def test_an_old_away_save_with_a_whine_is_settled_at_load(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    call = {"reason": "fake", "started": now, "deadline": now + 600}
    hass_storage[STORE_KEY] = hatched_pet(now, away=True, call=call)
    settled = async_capture_events(hass, f"{DOMAIN}_call_settled")
    await setup(hass)
    await hass.async_block_till_done()
    assert pet_of(hass).state.call is None and len(settled) == 1


async def test_an_old_away_save_loads_runs_and_cares(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], freezer
) -> None:
    """The brief's load test: a main-branch save, away and frozen, loads as the
    sitter's visit, ticks live and takes a feed."""
    data = hatched_pet(now, away=True, hunger=70.0)
    data["data"].pop("sitter_served", None)
    hass_storage[STORE_KEY] = data
    await setup(hass)
    pet = pet_of(hass)
    assert (
        pet.state.away
        and pet.state.sitter_served == model._sitter_slot(now, pet.settings)[0]
    )
    age = pet.state.age_hours
    await settle(hass, freezer, 30 * 60)
    assert pet.state.age_hours > age  # lives on
    await press(hass, "button.pip_feed")
    assert pet.state.care_log[0]["result"] == "ok"


# --- Privacy (§5.1): one test, privacy ON and OFF, per row a test can reach ------


@pytest.mark.parametrize("private", [True, False])
async def test_the_privacy_table(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    private: bool,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True, hunger=20.0)
    fired: list[str] = []
    hass.bus.async_listen(MATCH_ALL, lambda e: fired.append(e.event_type))
    await setup_with_house(hass, privacy=private)
    mood = hass.states.get("sensor.pip_mood")
    asleep = hass.states.get("binary_sensor.pip_asleep")
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    debug = pet_of(hass).current_mood()[1]
    if private:
        assert (mood.state, mood.attributes["reason"]) == ("asleep", "zzz")
        assert mood.attributes["flags"] == ["asleep"] and asleep.state == STATE_ON
        assert log[0]["action"] == "feed" and log[0]["by"] is None
        assert "away" not in debug
    else:
        assert (mood.state, mood.attributes["reason"]) == ("away", "the sitter's here")
        assert "away" in mood.attributes["flags"] and asleep.state == STATE_OFF
        assert log[0]["action"] == "sitter_feed" and log[0]["by"] is None
        assert "away" in debug
    # Either way: the numbers are real, the last care moved, no round on the bus,
    # and the card's view has the sitter with the real mood.
    assert int(float(hass.states.get("sensor.pip_hunger").state)) > 20
    assert hass.states.get("sensor.pip_last_care").state != "unknown"
    assert f"{DOMAIN}_sitter_round" not in fired
    client = await hass_ws_client(hass)
    sitter = (await subscribe(client, shared=True))["house"]["sitter"]
    assert sitter is not None and sitter["mood"] != "away"
    assert pet_of(hass).share_news("hi") == ("asleep" if private else "away")


def test_the_sitters_constants_are_the_planned_ones() -> None:
    """dev/sitter_sim.py measured these (§3.2a); change them with the sim."""
    assert R.SITTER_ROUNDS_HOURS == (1.0, 5.0, 9.0, 13.0)
    assert R.SITTER_SUPPER_BEFORE_BED_HOURS == 1.0
    assert (R.SITTER_FEED_BELOW, R.SITTER_SUPPER_BELOW, R.SITTER_PLAY_BELOW) == (
        65.0,
        80.0,
        65.0,
    )
    assert (R.SITTER_PLAY_ENERGY, R.SITTER_PLAY_HUNGER, R.SITTER_PLAY_WEIGHT) == (
        -5.0,
        -2.5,
        -1.5,
    )
    assert R.SITTER_LOG_ROWS == 8
    assert timedelta(hours=R.SITTER_ROUNDS_HOURS[-1]) == timedelta(hours=13)
