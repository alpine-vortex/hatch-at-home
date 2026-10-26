"""The pet's time math, without Home Assistant."""

from __future__ import annotations

from datetime import UTC, datetime
import random

import pytest

from custom_components.virtual_pet import model, rates as R
from custom_components.virtual_pet.home import HomeEffect

HOUR = 3600.0
MIN = 60.0


class NoLuck(random.Random):
    """Chance never fires; digestion takes exactly the base time."""

    def random(self) -> float:
        return 0.999999

    def uniform(self, a: float, b: float) -> float:
        return (a + b) / 2


SETTINGS = model.Settings(tz=UTC)  # bedtime 23:00, wake 07:00


def at(hour: int, minute: int = 0, day: int = 1) -> float:
    return datetime(2026, 10, day, hour, minute, tzinfo=UTC).timestamp()


def hatched(now: float, **stats: float) -> model.PetState:
    """A pet past the egg stage with the given stats."""
    pet = model.PetState.new("Pip", now)
    pet.age_hours = 30.0
    pet.hunger = pet.happiness = pet.energy = 90.0
    for key, value in stats.items():
        setattr(pet, key, value)
    return pet


def run(pet: model.PetState, until: float) -> list[model.Event]:
    """Live through every minute, as the coordinator's 5-minute ticks do."""
    return model.advance(pet, until, SETTINGS, NoLuck(), max_gap=None)


def types(events: list[model.Event]) -> list[str]:
    return [e["type"] for e in events]


def test_decay_is_per_hour_of_real_time():
    start = at(9)
    pet = hatched(start)
    run(pet, start + 2 * HOUR)
    assert pet.hunger == pytest.approx(90 - 2 * R.HUNGER_DECAY)
    assert pet.happiness == pytest.approx(90 - 2 * R.HAPPINESS_DECAY)
    assert pet.energy == pytest.approx(90 - 2 * R.ENERGY_DECAY)
    assert pet.age_hours == pytest.approx(32.0)


def test_one_big_advance_equals_many_small_ones():
    start = at(9)
    a, b = hatched(start), hatched(start)
    run(a, start + 3 * HOUR)
    t = start
    while t < start + 3 * HOUR:
        t += 7 * MIN
        run(b, min(t, start + 3 * HOUR))
    for stat in model.STATS:
        assert getattr(a, stat) == pytest.approx(getattr(b, stat))


def test_downtime_is_frozen():
    start = at(9)
    pet = hatched(start, hunger=26.0)
    pet.poops = [start - 20 * MIN]
    run(pet, start + 10 * MIN)
    before = pet.to_dict()

    # HA is off for 12 hours.
    model.catch_up(pet, start + 10 * MIN + 12 * HOUR)
    after = pet.to_dict()
    for stat in model.STATS:
        assert after[stat] == before[stat]
    assert after["age_hours"] == before["age_hours"]
    # The poop is still only 30 minutes old.
    assert pet.last_updated - pet.poops[0] == pytest.approx(30 * MIN)

    events = run(pet, pet.last_updated + 5 * MIN)
    assert "care_miss" not in types(events)
    assert not pet.sick


def test_away_freezes_everything():
    start = at(9)
    pet = hatched(start)
    pet.away = True
    events = run(pet, start + 10 * HOUR)
    assert events == []
    assert pet.hunger == 90.0
    assert pet.age_hours == 30.0
    assert pet.last_updated == start + 10 * HOUR


def test_hunger_call_missed_once_then_latched():
    start = at(9)
    pet = hatched(start, hunger=25.5)
    events = run(pet, start + 10 * MIN)
    assert {"type": "call_started", "reason": "hunger"} in events

    events = run(pet, start + 40 * MIN)
    assert "care_miss" in types(events)
    assert pet.care_misses == 1
    assert pet.call is None

    # Still hungry, but it doesn't call again until fed back above 40.
    events = run(pet, start + 3 * HOUR)
    assert "call_started" not in types(events)
    assert pet.care_misses == 1
    assert "hunger" in pet.latched


def test_feeding_answers_the_call():
    start = at(9)
    pet = hatched(start, hunger=24.0)
    run(pet, start + 5 * MIN)
    assert pet.call and pet.call.reason == "hunger"
    result, events = model.apply_action(pet, "feed", start + 5 * MIN, NoLuck(), "T")
    assert result == model.OK
    assert {"type": "call_answered", "reason": "hunger"} in events
    assert pet.call is None
    run(pet, start + 1 * HOUR)
    assert pet.care_misses == 0
    assert "hunger" not in pet.latched  # 59 > 40, re-armed
    assert pet.care_log[0]["by"] == "T"


def test_full_pet_refuses_food():
    pet = hatched(at(9), hunger=97.0)
    result, _ = model.apply_action(pet, "feed", at(9), NoLuck())
    assert result == "full"


def test_meal_becomes_poop_then_clean():
    start = at(9)
    pet = hatched(start, hunger=50.0)
    model.apply_action(pet, "feed", start, NoLuck())
    events = run(pet, start + R.DIGEST_MINUTES * MIN + 5 * MIN)
    assert "pooped" in types(events)
    assert len(pet.poops) == 1
    model.apply_action(pet, "clean", pet.last_updated, NoLuck())
    assert pet.poops == []


def test_old_poop_makes_a_dirty_call():
    start = at(9)
    pet = hatched(start)
    pet.poops = [start]
    events = run(pet, start + 35 * MIN)
    assert {"type": "call_started", "reason": "dirty"} in events


def test_poop_caps_at_three():
    start = at(9)
    pet = hatched(start)
    pet.digesting = [start + i * MIN for i in range(1, 6)]
    run(pet, start + 10 * MIN)
    assert len(pet.poops) == R.MAX_POOPS


def test_lights_out_naps_and_wakes_rested():
    start = at(13)
    pet = hatched(start, energy=50.0)
    events = model.set_lights_out(pet, True, start, SETTINGS)
    assert "fell_asleep" in types(events)
    assert pet.asleep and pet.napping
    # 50 -> 95 at 12/h takes 3.75 h.
    assert "woke_up" not in types(run(pet, start + 3.5 * HOUR))
    events = run(pet, start + 4 * HOUR)
    assert "woke_up" in types(events)
    assert not pet.lights_out
    assert pet.energy >= R.NAP_WAKE_ENERGY - 2


def test_night_sleep_until_wake_time():
    pet = hatched(at(22, 55), energy=40.0)
    model.set_lights_out(pet, True, at(22, 55), SETTINGS)
    run(pet, at(6, 55, day=2))
    assert pet.asleep
    events = run(pet, at(7, 5, day=2))
    assert "woke_up" in types(events)
    assert not pet.asleep and not pet.lights_out


def test_waking_it_at_night_costs_happiness():
    pet = hatched(at(23, 30), happiness=80.0)
    model.set_lights_out(pet, True, at(23, 30), SETTINGS)
    model.set_lights_out(pet, False, at(23, 40), SETTINGS)
    assert not pet.asleep
    assert pet.happiness == pytest.approx(80.0 + R.WAKE_IN_NIGHT_HAPPINESS)


def test_dozes_off_anyway_without_penalty():
    pet = hatched(at(22, 30), happiness=80.0)
    events = run(pet, at(0, 10, day=2))
    assert "fell_asleep" in types(events)
    assert pet.asleep and not pet.lights_out
    assert pet.care_misses == 0


def test_no_calls_while_asleep():
    start = at(13)
    pet = hatched(start, hunger=30.0, energy=20.5)
    model.set_lights_out(pet, True, start, SETTINGS)
    events = run(pet, start + 2 * HOUR)
    assert "call_started" not in types(events)


def test_energy_call_answered_by_lights_out():
    start = at(13)
    pet = hatched(start, energy=19.0)
    run(pet, start + 5 * MIN)
    assert pet.call and pet.call.reason == "energy"
    events = model.set_lights_out(pet, True, start + 5 * MIN, SETTINGS)
    assert {"type": "call_answered", "reason": "energy"} in events
    assert pet.call is None


def test_neglect_makes_it_sick_and_medicine_cures():
    start = at(9)
    pet = hatched(start)
    pet.recent_misses = [start - i * HOUR for i in range(R.SICK_MISSES)]
    events = run(pet, start + 5 * MIN)
    assert {"type": "became_sick", "cause": "neglect"} in events
    assert model.action_available(pet, "medicine")
    result, events = model.apply_action(pet, "medicine", pet.last_updated, NoLuck())
    assert result == model.OK and not pet.sick
    assert not model.action_available(pet, "medicine")


def test_medicine_does_nothing_when_well():
    pet = hatched(at(9))
    assert model.apply_action(pet, "medicine", at(9), NoLuck())[0] == "not_sick"


def test_never_dies_by_default():
    start = at(9)
    pet = hatched(start, hunger=0.0, health=10.0)
    pet.poops = [start - 2 * HOUR] * 3
    run(pet, start + 72 * HOUR)
    assert pet.health >= R.HEALTH_FLOOR


def test_scold_fake_call_raises_discipline():
    start = at(9)
    pet = hatched(start)
    pet.call = model.Call("fake", start, start + 20 * MIN)
    result, _ = model.apply_action(pet, "scold", start + MIN, NoLuck())
    assert result == model.OK
    assert pet.discipline == R.SCOLD_DISCIPLINE
    assert pet.call is None


def test_scolding_for_nothing_is_unfair():
    pet = hatched(at(9), happiness=50.0)
    result, _ = model.apply_action(pet, "scold", at(9), NoLuck())
    assert result == "unfair"
    assert pet.happiness == 50.0 + R.SCOLD_UNFAIR_HAPPINESS


def test_ignored_fake_call_is_not_a_care_miss():
    start = at(9)
    pet = hatched(start)
    pet.call = model.Call("fake", start, start + 20 * MIN)
    run(pet, start + 30 * MIN)
    assert pet.care_misses == 0
    assert pet.discipline_misses == 1


def test_egg_hatches():
    start = at(9)
    pet = model.PetState.new("Pip", start)
    assert model.life_stage(pet) == "egg"
    assert model.apply_action(pet, "feed", start, NoLuck())[0] == "egg"
    events = run(pet, start + HOUR)
    assert {"type": "stage_changed", "stage": "baby", "from": "egg"} in events


def test_mood_priority():
    now = at(14)
    pet = hatched(now, hunger=20.0)
    pet.poops = [now]
    assert model.mood(pet, now, SETTINGS)[0] == "hungry"
    pet.call = model.Call("hunger", now, now + 20 * MIN)
    current, flags, reason = model.mood(pet, now, SETTINGS)
    assert current == "calling"
    assert {"hungry", "dirty", "calling"} <= set(flags)
    assert reason == "tummy rumbling!"
    pet.sick = True
    assert model.mood(pet, now, SETTINGS)[0] == "sick"


def test_drowsy_near_bedtime():
    pet = hatched(at(22, 40))
    assert model.mood(pet, at(22, 40), SETTINGS)[0] == "sleepy"
    assert model.mood(pet, at(20, 0), SETTINGS)[0] == "content"


def test_round_trip_through_store_dict():
    pet = hatched(at(9))
    pet.call = model.Call("hunger", 1.0, 2.0)
    data = pet.to_dict()
    data["from_the_future"] = 1
    assert model.PetState.from_dict(data) == pet


def test_hatching_prefers_a_species_not_raised_yet():
    start = at(9)
    settings = model.Settings(tz=UTC, roster=("bird", "squirrel"))
    pet = model.PetState.new("Pip", start)
    pet.raised = ["bird"]
    events = model.advance(pet, start + HOUR, settings, random.Random(1), max_gap=None)
    assert pet.species == "squirrel"
    assert pet.raised == ["bird", "squirrel"]
    assert {"type": "hatched", "species": "squirrel"} in events


# --- Regressions from the 2026-10-26 audit ---------------------------------


def test_small_answer_does_not_silence_the_next_call():
    start = at(9)
    pet = hatched(start, hunger=25.2)
    run(pet, start + 5 * MIN)
    assert pet.call and pet.call.reason == "hunger"
    model.apply_action(pet, "snack", start + 5 * MIN, NoLuck())  # only to ~35
    assert pet.call is None
    events = run(pet, start + 5 * HOUR)
    assert {"type": "call_started", "reason": "hunger"} in events


def test_clock_jump_while_running_is_frozen():
    start = at(9)
    pet = hatched(start)
    events = model.advance(pet, start + 60 * 24 * HOUR, SETTINGS, NoLuck())
    assert "care_miss" not in types(events)
    assert pet.age_hours == pytest.approx(30 + R.MAX_LIVE_GAP_MINUTES / 60)
    assert pet.last_updated == start + 60 * 24 * HOUR


def test_clock_going_back_moves_timers_back():
    start = at(9)
    pet = hatched(start)
    pet.call = model.Call("hunger", start, start + 20 * MIN)
    model.advance(pet, start - HOUR, SETTINGS, NoLuck())
    assert pet.call.deadline == start - HOUR + 20 * MIN


def test_lights_out_on_the_egg_puts_the_hatchling_to_bed():
    start = at(22, 40)
    pet = model.PetState.new("Pip", start)
    model.set_lights_out(pet, True, start, SETTINGS)
    run(pet, start + HOUR)
    assert pet.asleep and pet.lights_out


def test_nap_just_before_bedtime_lasts_the_night():
    pet = hatched(at(22), energy=88.0)
    model.set_lights_out(pet, True, at(22), SETTINGS)
    run(pet, at(23, 30))
    assert pet.asleep and pet.lights_out
    run(pet, at(7, 5, day=2))
    assert not pet.asleep


def test_sleep_survives_dst_fall_back():
    from zoneinfo import ZoneInfo

    london = model.Settings(
        tz=ZoneInfo("Europe/London"),
        bedtime=model.parse_hhmm("01:30"),
        wake_time=model.parse_hhmm("07:00"),
    )
    # Clocks go back at 02:00 BST on 2026-10-25.
    start = datetime(2026, 10, 25, 1, 40, tzinfo=ZoneInfo("Europe/London")).timestamp()
    pet = hatched(start, hunger=40.0)
    model.set_lights_out(pet, True, start, london)
    events = model.advance(pet, start + 3 * HOUR, london, NoLuck(), max_gap=None)
    assert pet.asleep
    assert "woke_up" not in types(events)
    assert "care_miss" not in types(events)


def test_empty_roster_keeps_the_egg():
    start = at(9)
    pet = model.PetState.new("Pip", start)
    events = model.advance(
        pet, start + 3 * HOUR, model.Settings(tz=UTC, roster=()), NoLuck(), max_gap=None
    )
    assert model.life_stage(pet) == "egg"
    assert "hatched" not in types(events)


def test_unknown_saved_reasons_are_dropped():
    data = hatched(at(9)).to_dict()
    data["latched"] = ["boredom", "hunger"]
    data["call"] = {"reason": "boredom", "started": 1.0, "deadline": 2.0, "extra": 1}
    pet = model.PetState.from_dict(data)
    assert pet.latched == ["hunger"]
    assert pet.call is None
    run(pet, at(10))  # must not raise


def test_fake_call_looks_like_a_plea_to_play():
    start = at(9)
    pet = hatched(start)

    class Lucky(NoLuck):
        def random(self):
            return 0.0

    events = model.advance(pet, start + 5 * MIN, SETTINGS, Lucky())
    assert pet.call and pet.call.reason == "fake"
    assert {"type": "call_started", "reason": "happiness"} in events
    assert model.mood(pet, start + 5 * MIN, SETTINGS)[2] == "play with me?"


# --- Traits ------------------------------------------------------------------


def house(*flags: str, company: bool = False) -> model.Settings:
    return model.Settings(tz=UTC, home=HomeEffect(flags=list(flags), company=company))


def live(pet: model.PetState, until: float, settings: model.Settings) -> list:
    return model.advance(pet, until, settings, NoLuck(), max_gap=None)


def test_music_lover_is_learned_from_music():
    pet = hatched(at(12))
    pet.trait_hours = {"awake": 20.0, "dancing": R.TRAIT_MUSIC_LOVER_HOURS - 0.25}
    events = live(pet, at(12, 10), house("dancing"))
    assert "trait_learned" not in types(events)
    events = live(pet, at(12, 30), house("dancing"))
    assert [e for e in events if e["type"] == "trait_learned"] == [
        {"type": "trait_learned", "trait": "music_lover", "level": 1}
    ]
    assert pet.traits == ["music_lover"]
    assert live(pet, at(13), house("dancing")) == []  # learned once


def test_quiet_hours_teach_nothing():
    pet = hatched(at(12))
    live(pet, at(14), house())
    assert pet.trait_hours.get("dancing", 0.0) == 0.0
    assert pet.trait_hours["awake"] == pytest.approx(2.0)
    assert model.trait_progress(pet) == dict.fromkeys(model.TRAITS, 0.0)


def test_sleeping_through_music_teaches_nothing():
    pet = hatched(at(12), asleep=True, napping=True, energy=10.0)
    live(pet, at(12, 30), house("dancing"))
    assert pet.trait_hours == {}


def test_music_lover_enjoys_music_more():
    fan, other = hatched(at(12), happiness=50.0), hatched(at(12), happiness=50.0)
    fan.traits = ["music_lover"]
    live(fan, at(13), house("dancing"))
    live(other, at(13), house("dancing"))
    assert fan.happiness - other.happiness == pytest.approx(R.HOME_MUSIC_HAPPINESS)


def test_homebody_needs_company_most_of_the_time():
    pet = hatched(at(12))
    pet.trait_hours = {"awake": 60.0, "company": 30.0}  # half the time: not yet
    live(pet, at(13), house(company=True))
    assert pet.traits == []
    pet.trait_hours = {"awake": 47.5, "company": 47.5}  # not long enough yet
    live(pet, at(13, 10), house(company=True))
    assert pet.traits == []
    live(pet, at(14), house(company=True))
    assert pet.traits == ["homebody"]
    before = pet.happiness
    alone = hatched(at(14), happiness=before)
    live(pet, at(15), house(company=True))
    live(alone, at(15), house(company=True))
    assert pet.happiness - alone.happiness == pytest.approx(R.TRAIT_HAPPINESS)


def test_night_owl_stays_up_longer():
    pet = hatched(at(22, 50), energy=100.0)
    pet.trait_hours = {"awake": 30.0, "night": R.TRAIT_NIGHT_OWL_HOURS - 0.1}
    live(pet, at(23, 30), house())
    assert pet.traits == ["night_owl"]
    assert not pet.asleep
    # An ordinary pet dozes off after FALL_ASLEEP_ANYWAY_MINUTES; the owl lasts twice that.
    normal = hatched(at(23), energy=100.0)
    end = at(23) + R.FALL_ASLEEP_ANYWAY_MINUTES * 1.5 * MIN
    live(normal, end, house())
    live(pet, end, house())
    assert normal.asleep and not pet.asleep


def test_traits_survive_a_save():
    pet = hatched(at(12))
    pet.traits = ["homebody"]
    pet.trait_hours = {"awake": 50.0, "company": 45.0}
    again = model.PetState.from_dict(pet.to_dict())
    assert again.traits == ["homebody"]
    assert again.trait_hours == {"awake": 50.0, "company": 45.0}


# --- Generations -----------------------------------------------------------------

ADULT = dict(R.STAGE_STARTS)["adult"]


def test_lay_egg_waits_a_week_into_adulthood():
    pet = hatched(at(12), age_hours=ADULT + 24.0)
    assert model.life_stage(pet) == "adult"
    assert not model.can_lay_egg(pet)
    assert model.lay_egg(pet, at(12), random.Random(1)) == (pet, [])
    pet.age_hours = ADULT + R.LAY_EGG_AFTER_ADULT_HOURS
    assert model.can_lay_egg(pet)
    assert "lay_egg" in model.requests(pet, at(12), SETTINGS)
    pet.away = True
    assert not model.can_lay_egg(pet)
    pet.away, pet.sick = False, True  # get well first
    assert not model.can_lay_egg(pet)
    assert model.lay_egg(pet, at(12), random.Random(1)) == (pet, [])


def test_laying_an_egg_retires_the_parent_to_the_journal():
    pet = hatched(at(12), age_hours=ADULT + R.LAY_EGG_AFTER_ADULT_HOURS + 5)
    pet.species, pet.raised = "squirrel", ["bird", "squirrel"]
    pet.traits = ["night_owl", "homebody"]
    pet.care_misses = 3
    egg, events = model.lay_egg(pet, at(12), random.Random(1))
    assert model.life_stage(egg) == "egg"
    assert egg.name == "Pip" and egg.born == at(12)
    assert egg.generation == 2
    assert egg.species is None and egg.raised == ["bird", "squirrel"]
    assert egg.care_misses == 0 and egg.trait_hours == {}
    assert len(egg.traits) == 1 and egg.traits[0] in pet.traits  # inherited
    assert egg.journal == [
        {
            "generation": 1,
            "name": "Pip",
            "species": "squirrel",
            "traits": ["night_owl", "homebody"],
            "levels": {"night_owl": 1, "homebody": 1},
            "inherited": None,
            "born": pet.born,
            "retired": at(12),
            "age_days": round(pet.age_hours / 24, 1),
            "care_misses": 3,
        }
    ]
    assert events == [
        {
            "type": "egg_laid",
            "generation": 2,
            "parent_species": "squirrel",
            "inherited_trait": egg.traits[0],
            "level": 1,
        }
    ]
    # Inherited at the parent's level, but not yet learned in its own life.
    assert egg.inherited == {egg.traits[0]: 1}
    assert model.trait_progress(egg)[egg.traits[0]] == 0.0


def test_a_parent_without_traits_passes_none_on():
    pet = hatched(at(12), age_hours=ADULT + R.LAY_EGG_AFTER_ADULT_HOURS)
    egg, events = model.lay_egg(pet, at(12), random.Random(1))
    assert egg.traits == []
    assert events[0]["inherited_trait"] is None


def test_the_journal_survives_a_save():
    pet = hatched(at(12), age_hours=ADULT + R.LAY_EGG_AFTER_ADULT_HOURS)
    egg, _ = model.lay_egg(pet, at(12), random.Random(1))
    again = model.PetState.from_dict(egg.to_dict())
    assert again.generation == 2 and again.journal == egg.journal


# --- Trait levels and the new traits -------------------------------------------


def test_new_flag_traits_are_learned_from_their_flags():
    for trait, (flag, needed) in R.TRAIT_FLAG_HOURS.items():
        pet = hatched(at(12))
        pet.trait_hours = {"awake": 50.0, flag: needed - 0.1}
        events = live(pet, at(12, 10), house(flag))
        assert pet.traits == [trait], trait
        assert {"type": "trait_learned", "trait": trait, "level": 1} in events


def test_relearning_an_inherited_trait_deepens_it_to_at_most_three_stars():
    pet = hatched(at(12))
    pet.traits, pet.trait_levels, pet.inherited = (
        ["sun_lover"],
        {"sun_lover": 2},
        {"sun_lover": 2},
    )
    pet.trait_hours = {"awake": 50.0, "sunny": R.TRAIT_FLAG_HOURS["sun_lover"][1] - 0.1}
    events = live(pet, at(12, 10), house("sunny"))
    assert {"type": "trait_deepened", "trait": "sun_lover", "level": 3} in events
    assert model.trait_level(pet, "sun_lover") == 3 and pet.inherited == {}
    capped = hatched(at(12))
    capped.traits, capped.trait_levels, capped.inherited = (
        ["sun_lover"],
        {"sun_lover": 3},
        {"sun_lover": 3},
    )
    capped.trait_hours = dict(pet.trait_hours)
    live(capped, at(12, 10), house("sunny"))
    assert model.trait_level(capped, "sun_lover") == 3


def test_effects_grow_with_the_level():
    one, two = hatched(at(12), happiness=40.0), hatched(at(12), happiness=40.0)
    for pet, level in ((one, 1), (two, 2)):
        pet.traits, pet.trait_levels = ["music_lover"], {"music_lover": level}
    live(one, at(13), house("dancing"))
    live(two, at(13), house("dancing"))
    extra = R.HOME_MUSIC_HAPPINESS * (R.TRAIT_LEVEL_SCALE[2] - 1)
    assert two.happiness - one.happiness == pytest.approx(extra)
    owl = hatched(at(23), energy=100.0)
    owl.traits, owl.trait_levels = ["night_owl"], {"night_owl": 2}
    assert model._stay_up_minutes(owl) == R.FALL_ASLEEP_ANYWAY_MINUTES * 2.5


def test_the_egg_inherits_at_the_parents_level_and_the_journal_keeps_levels():
    pet = hatched(at(12), age_hours=ADULT + R.LAY_EGG_AFTER_ADULT_HOURS)
    pet.traits, pet.trait_levels = ["fireside"], {"fireside": 2}
    pet.inherited_from = "fireside"
    egg, events = model.lay_egg(pet, at(12), random.Random(1))
    assert egg.trait_levels == {"fireside": 2} and egg.inherited == {"fireside": 2}
    assert egg.inherited_from == "fireside"
    assert egg.journal[-1]["levels"] == {"fireside": 2}
    assert egg.journal[-1]["inherited"] == "fireside"
    assert events[0]["level"] == 2


def test_old_saves_keep_their_music_hours():
    data = hatched(at(12)).to_dict()
    data["trait_hours"] = {"awake": 5.0, "music": 4.0}
    pet = model.PetState.from_dict(data)
    assert pet.trait_hours == {"awake": 5.0, "dancing": 4.0}
