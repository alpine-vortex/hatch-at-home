"""Wave 0 PR 0e: upbringing measures care; praise can't be farmed."""

from __future__ import annotations

from datetime import UTC, datetime
import importlib.util
from pathlib import Path
import random
from zoneinfo import ZoneInfo

import pytest

from custom_components.virtual_pet import model, rates as R

from .test_model import HOUR, MIN, SETTINGS, NoLuck, at, hatched

BABY = dict(R.STAGE_STARTS)["baby"]
ADULT = dict(R.STAGE_STARTS)["adult"]
NEW_KEYS = (
    "discipline_sum",
    "discipline_samples",
    "wellbeing_sum",
    "wellbeing_samples",
    "counted_misses",
    "miss_day_count",
    "upbringing_floor",
    "praise_count",
    "praise_day_count",
    *model.UPBRINGING_TIMES,
)


def old_save(pet: model.PetState) -> dict:
    """The pet as a save from before 0e: no upbringing samples, a last_praise."""
    data = pet.to_dict()
    for key in NEW_KEYS:
        del data[key]
    data["last_praise"] = pet.last_updated - HOUR
    return data


def old_grade(misses: int, discipline: float) -> str:
    score = 0.7 * max(0.0, 100.0 - 6.0 * misses) + 0.3 * discipline
    return model._grade(score)


def at_least(grade: str, low: str) -> bool:
    return model.UPBRINGINGS.index(grade) <= model.UPBRINGINGS.index(low)


def sim():
    """scripts/balance_sim.py, for its strategies."""
    path = Path(__file__).resolve().parent.parent / "scripts" / "balance_sim.py"
    spec = importlib.util.spec_from_file_location("balance_sim", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def grow_up(pet: model.PetState, t: float, policy) -> float:
    """Five-minute looks with a sim strategy until it is an adult."""
    rng = random.Random(1)
    while model.life_stage(pet) != "adult":
        t += 5 * MIN
        model.advance(pet, t, SETTINGS, rng)
        policy(pet, t, rng)
    return t


# --- The score ---------------------------------------------------------------


def test_the_score_weighs_care_and_averaged_discipline():
    pet = hatched(at(9))
    pet.discipline = 0.0  # today's: the average is what counts
    pet.discipline_sum, pet.discipline_samples = 40.0 * 100, 100
    pet.wellbeing_sum, pet.wellbeing_samples = 80.0, 100
    pet.counted_misses = 4
    care = 0.8 * 80 + 0.2 * (100 - 2 * 4)
    assert model.upbringing_score(pet) == pytest.approx(0.75 * care + 0.25 * 40)


def test_an_hour_awake_is_sampled_once():
    start = at(9)
    pet = hatched(start, discipline=30.0)
    model.advance(pet, start + 5 * MIN, SETTINGS, NoLuck(), max_gap=None)
    assert pet.discipline_samples == pet.wellbeing_samples == 1
    assert pet.wellbeing_sum == 1  # every meter at 10 or more, not sick
    model.advance(pet, start + 65 * MIN, SETTINGS, NoLuck(), max_gap=None)
    assert pet.discipline_samples == 2
    pet.happiness = 5.0  # under UPBRINGING_WELL_MIN: not well
    model.advance(pet, start + 125 * MIN, SETTINGS, NoLuck(), max_gap=None)
    assert (pet.wellbeing_samples, pet.wellbeing_sum) == (3, 2)


def test_three_misses_on_one_local_day_count_two():
    tz = ZoneInfo("America/Los_Angeles")
    # 09:00, 15:00 and 23:30 local on 1 Oct, then 00:30 local on 2 Oct.
    day = datetime(2026, 10, 1, tzinfo=tz)
    times = [day.replace(hour=h, minute=m).timestamp() for h, m in ((9, 0), (15, 0))]
    times.append(day.replace(hour=23, minute=30).timestamp())
    pet = hatched(times[0], hunger=10.0)
    pet.upbringing_floor = "steady"
    for t in times:
        pet.call = model.Call("hunger", t - 20 * MIN, t)
        pet.latched = []
        model._calls(pet, t, 0.0, NoLuck(), [], tz)
    assert pet.care_misses == 3
    assert pet.counted_misses == 2
    assert pet.upbringing_floor is None  # lapsed at the first counted miss
    # 23:30 local on 1 Oct is 2 Oct in UTC: local days decide.
    assert datetime.fromtimestamp(times[2], UTC).day == 2
    nxt = datetime(2026, 10, 2, 0, 30, tzinfo=tz).timestamp()
    pet.call = model.Call("hunger", nxt - 20 * MIN, nxt)
    pet.latched = []
    model._calls(pet, nxt, 0.0, NoLuck(), [], tz)
    assert pet.counted_misses == 3  # a new local day


# --- Praise ------------------------------------------------------------------


def test_praise_five_times_in_a_minute_gives_14_and_no_discipline():
    now = at(9)
    pet = hatched(now, happiness=50.0, discipline=20.0)
    for n in range(5):
        model.apply_action(pet, "praise", now + n * 10, NoLuck(), settings=SETTINGS)
    assert pet.happiness == 50 + 8 + 4 + 2
    assert pet.discipline == 20.0


def test_the_fourth_praise_window_of_a_day_gives_at_most_one():
    now = at(9)
    pet = hatched(now, happiness=10.0)
    for n in range(3):
        model.apply_action(pet, "praise", now + n * 31 * MIN, NoLuck())
    assert pet.happiness == 10 + 3 * 8
    model.apply_action(pet, "praise", now + 3 * 31 * MIN, NoLuck())
    assert pet.happiness == 10 + 3 * 8 + R.PRAISE_TIRED_HAPPINESS
    # A new day starts fresh.
    model.apply_action(pet, "praise", at(9, day=2), NoLuck())
    assert pet.happiness == 10 + 3 * 8 + R.PRAISE_TIRED_HAPPINESS + 8


def test_praise_teaches_once_after_a_meal_that_met_a_need():
    now = at(9)
    hungry = hatched(now, hunger=40.0, discipline=0.0)
    model.apply_action(hungry, "feed", now, NoLuck())
    model.apply_action(hungry, "praise", now + 5 * MIN, NoLuck())
    assert hungry.discipline == R.PRAISE_DISCIPLINE
    model.apply_action(hungry, "praise", now + 6 * MIN, NoLuck())
    assert hungry.discipline == R.PRAISE_DISCIPLINE  # once per action

    fed = hatched(now, hunger=80.0, discipline=0.0)
    model.apply_action(fed, "feed", now, NoLuck())
    model.apply_action(fed, "praise", now + 5 * MIN, NoLuck())
    assert fed.discipline == 0.0  # not hungry: no need met

    late = hatched(now, hunger=40.0, discipline=0.0)
    model.apply_action(late, "feed", now, NoLuck())
    model.apply_action(late, "praise", now + 11 * MIN, NoLuck())
    assert late.discipline == 0.0  # too long after


def test_a_finished_game_when_bored_is_care_to_praise():
    now = at(9)
    pet = hatched(now, happiness=40.0, discipline=0.0)
    rng = random.Random(1)
    info = {}
    while not info.get("done"):
        info, _ = model.play_game(pet, "left", now, rng)
    assert pet.last_care_at == now
    model.apply_action(pet, "praise", now + MIN, NoLuck())
    assert pet.discipline == R.PRAISE_DISCIPLINE


def test_away_three_days_takes_no_sample_and_keeps_the_praise_window():
    start = at(9)
    pet = hatched(start, happiness=50.0)
    model.advance(pet, start + 5 * MIN, SETTINGS, NoLuck(), max_gap=None)
    model.apply_action(pet, "praise", start + 5 * MIN, NoLuck())
    samples = pet.discipline_samples
    pet.away = True
    back = start + 5 * MIN + 72 * HOUR
    model.advance(pet, back, SETTINGS, NoLuck(), max_gap=None)
    pet.away = False
    model.advance(pet, back + MIN, SETTINGS, NoLuck(), max_gap=None)
    assert pet.discipline_samples == samples  # no catch-up sample
    before = pet.happiness
    model.apply_action(pet, "praise", back + MIN, NoLuck())
    assert pet.happiness == pytest.approx(before + 4)  # the same window


# --- Old saves -----------------------------------------------------------------


def test_an_old_egg_starts_fresh():
    egg = model.PetState.new("Pip", at(9))
    data = old_save(egg)
    pet = model.PetState.from_dict(data)
    assert (pet.discipline_samples, pet.counted_misses) == (0, 0)
    assert pet.upbringing_floor is None
    assert "last_praise" not in pet.to_dict()


def test_a_child_with_10_misses_on_day_3_counts_6_at_half_weight():
    pet = hatched(at(9), age_hours=BABY + 60, discipline=30.0)
    pet.care_misses = 10
    loaded = model.PetState.from_dict(old_save(pet))
    assert loaded.counted_misses == 6
    assert loaded.discipline_samples == loaded.wellbeing_samples == 20  # 60 h
    assert loaded.discipline_sum == pytest.approx(30.0 * 20)
    assert loaded.wellbeing_sum == pytest.approx(20 * (1 - 0.06 * 10 / 3))
    assert loaded.upbringing_floor == "scrappy"  # the old score: 0.7 * 40 + 9
    # Saved and loaded again, it isn't migrated twice.
    again = model.PetState.from_dict(loaded.to_dict())
    assert again.discipline_samples == 20 and again.counted_misses == 6


def test_a_careful_child_mid_childhood_keeps_its_grade():
    start = at(9)
    pet = hatched(start, age_hours=72.0, discipline=50.0)
    assert old_grade(0, 50.0) == "devoted"
    loaded = model.PetState.from_dict(old_save(pet))
    assert model.upbringing(loaded) == "devoted"
    grow_up(loaded, start, sim().careful)
    assert loaded.upbringing == "devoted"


def test_a_laundered_child_with_an_old_100_ends_scrappy():
    start = at(9)
    pet = hatched(start, age_hours=72.0, discipline=100.0)
    assert 0.7 * 100 + 0.3 * pet.discipline == 100  # devoted on the old rule
    loaded = model.PetState.from_dict(old_save(pet))
    assert loaded.upbringing_floor == "steady"  # capped
    grow_up(loaded, start, sim().launder_praise)
    assert loaded.upbringing_floor is None  # lapsed at its first counted miss
    assert loaded.upbringing == "scrappy"


def test_an_old_adult_keeps_its_upbringing():
    pet = hatched(at(9), age_hours=400.0, upbringing="devoted")
    pet.care_misses = 30
    loaded = model.PetState.from_dict(old_save(pet))
    assert loaded.upbringing == "devoted"
    assert loaded.discipline_samples == 0


def test_an_old_adult_with_no_upbringing_gets_one():
    pet = hatched(at(9), age_hours=400.0, discipline=60.0)
    pet.care_misses = 3
    data = old_save(pet)
    del data["upbringing"]
    loaded = model.PetState.from_dict(data)
    assert loaded.upbringing == "devoted"  # today's discipline, estimated care
    assert loaded.upbringing_floor is None
    assert loaded.discipline_samples == 0


@pytest.mark.parametrize("age", [BABY + 1, 3.0, 30.0, 72.0, 200.0, 330.0, 400.0])
def test_no_old_pet_loads_a_grade_lower_than_before(age):
    """Babies, children, teens and adults with no upbringing, across misses
    and discipline: the grade at load is the old rule's or better."""
    for misses in range(11):
        for discipline in (0.0, 20.0, 35.0, 50.0, 80.0, 100.0):
            pet = hatched(at(9), age_hours=age, discipline=discipline)
            pet.care_misses = misses
            data = old_save(pet)
            data["upbringing"] = None
            loaded = model.PetState.from_dict(data)
            before = old_grade(misses, discipline)
            assert at_least(model.upbringing(loaded), before), (misses, discipline)


def test_retired_journal_records_keep_their_grade_and_drop_damage():
    pet = hatched(at(9))
    data = old_save(pet)
    data["journal"] = [
        {"generation": 1, "name": "Old", "upbringing": "devoted"},
        {"generation": 2, "name": "Odd", "upbringing": "legendary"},
    ]
    loaded = model.PetState.from_dict(data)
    assert [r.get("upbringing") for r in loaded.journal] == ["devoted", None]
    assert "upbringing" not in loaded.journal[1]


def test_damaged_upbringing_values_are_dropped():
    now = at(9)
    data = hatched(now).to_dict()
    data.update(
        discipline_sum="lots",
        discipline_samples=10,
        wellbeing_sum=50.0,  # more than 10 samples can hold
        wellbeing_samples=10,
        counted_misses=-3,
        last_sample_at=now + 100 * HOUR,  # later than the save
        praise_window_at=True,
        upbringing_floor="devoted",
    )
    pet = model.PetState.from_dict(data)
    assert pet.discipline_sum == 0.0 and pet.discipline_samples == 10
    assert (pet.wellbeing_sum, pet.wellbeing_samples) == (0.0, 0)
    assert pet.counted_misses == 0
    assert pet.last_sample_at == now
    assert pet.praise_window_at == 0.0
    assert pet.upbringing_floor == "steady"  # a floor is never devoted
    data["upbringing_floor"] = "legendary"
    assert model.PetState.from_dict(data).upbringing_floor is None


def test_shift_times_moves_every_new_timestamp():
    pet = hatched(at(9))
    for n, key in enumerate(model.UPBRINGING_TIMES):
        setattr(pet, key, 1000.0 + n)
    model.shift_times(pet, 50.0)
    for n, key in enumerate(model.UPBRINGING_TIMES):
        assert getattr(pet, key) == 1050.0 + n
