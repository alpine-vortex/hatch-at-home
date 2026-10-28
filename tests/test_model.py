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


def test_downtime_overnight_still_wakes_it_in_the_morning():
    pet = hatched(at(22, 55), energy=40.0)
    model.set_lights_out(pet, True, at(22, 55), SETTINGS)
    run(pet, at(23, 30))
    # HA is off from 23:30 to 09:00: the morning's wake time doesn't move.
    model.catch_up(pet, at(9, day=2))
    events = run(pet, at(9, 5, day=2))
    assert "woke_up" in types(events) and not pet.asleep


def test_an_unfinished_game_ends_when_it_goes_away_or_to_sleep():
    pet = hatched(at(9))
    model.play_game(pet, "left", at(9), NoLuck())
    pet.away = True
    info, _ = model.play_game(pet, "left", at(9, 1), NoLuck())
    assert info == {"result": "away"} and pet.game is None


def test_laying_an_egg_keeps_the_days_chore_treats():
    pet = hatched(at(9))
    pet.age_hours = 30 * 24.0
    model.chores_done(pet, 2, at(9))
    egg, _ = model.lay_egg(pet, at(10), NoLuck())
    assert egg.treats_waiting == 2 and len(egg.chore_treats) == 2


def test_a_damaged_saved_call_is_dropped_not_fatal():
    pet = hatched(at(9))
    data = pet.to_dict()
    data["call"] = {"reason": "hunger", "started": at(9)}  # no deadline
    data["latched"] = ["fake", "hunger"]
    loaded = model.PetState.from_dict(data)
    assert loaded.call is None and loaded.latched == ["hunger"]
    run(loaded, at(9, 10))  # and it lives on


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


def test_the_owners_choice_decides_the_hatch_then_clears():
    start = at(9)
    settings = model.Settings(tz=UTC, roster=("bird", "squirrel"))
    pet = model.PetState.new("Pip", start)
    pet.egg_choice = "bird"  # already raised: a choice beats the fresh-first rule
    pet.raised = ["bird"]
    model.advance(pet, start + HOUR, settings, random.Random(1), max_gap=None)
    assert pet.species == "bird"
    assert pet.egg_choice is None


def test_a_choice_off_the_roster_is_a_surprise():
    start = at(9)
    settings = model.Settings(tz=UTC, roster=("bird", "squirrel"))
    pet = model.PetState.new("Pip", start)
    pet.egg_choice, pet.raised = "gecko", ["bird"]  # another world's creature
    model.advance(pet, start + HOUR, settings, random.Random(1), max_gap=None)
    assert pet.species == "squirrel"  # the usual surprise: not raised yet
    assert pet.egg_choice is None


def test_a_choice_made_before_laying_goes_with_the_egg():
    pet = hatched(at(12), age_hours=ADULT + R.LAY_EGG_AFTER_ADULT_HOURS + 5)
    pet.species, pet.raised, pet.egg_choice = "bird", ["bird"], "bird"
    egg, _ = model.lay_egg(pet, at(12), random.Random(1))
    assert egg.egg_choice == "bird"


def test_older_saves_have_no_choice():
    pet = model.PetState.new("Pip", at(9))
    data = pet.to_dict()
    del data["egg_choice"]
    assert model.PetState.from_dict(data).egg_choice is None
    data["egg_choice"] = 3  # nonsense from a broken file
    assert model.PetState.from_dict(data).egg_choice is None


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
            "upbringing": "steady",  # 3 misses and no discipline
            "games": {},
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


def test_a_pet_keeps_at_most_four_traits():
    pet = hatched(at(12))
    pet.traits = ["sun_lover", "fireside", "moon_child", "couch_potato"]
    pet.trait_hours = {"awake": 50.0, "snowy": R.TRAIT_FLAG_HOURS["snow_child"][1]}
    events = live(pet, at(12, 10), house("snowy"))
    assert len(pet.traits) == R.TRAIT_CAP and "snow_child" not in pet.traits
    assert "trait_learned" not in types(events)


def test_an_inherited_trait_counts_toward_the_cap():
    pet = hatched(at(12))
    pet.traits, pet.inherited = (
        ["sun_lover", "fireside", "moon_child"],
        {"sun_lover": 1},
    )
    flag, needed = R.TRAIT_FLAG_HOURS["snow_child"]
    pet.trait_hours = {"awake": 50.0, flag: needed, "windy": 20.0}
    live(pet, at(12, 10), house(flag, "windy"))
    assert len(pet.traits) == 4  # one of the two: dict order picks it, then it's full


def test_pets_from_before_the_cap_keep_their_traits():
    pet = hatched(at(12))
    pet.traits = ["sun_lover", "fireside", "moon_child", "couch_potato", "homebody"]
    again = model.PetState.from_dict(pet.to_dict())
    assert again.traits == pet.traits


def test_temperament_is_rolled_at_hatching_and_kept():
    start = at(9)
    pet = model.PetState.new("Pip", start)
    model.advance(
        pet,
        start + HOUR,
        model.Settings(tz=UTC, roster=("bird",)),
        random.Random(3),
        max_gap=None,
    )
    low, high = R.TEMPERAMENT_RANGE
    assert set(pet.temperament) == set(model.TRAITS)
    assert all(low <= f <= high for f in pet.temperament.values())
    assert model.PetState.from_dict(pet.to_dict()).temperament == pet.temperament
    other = model.PetState.new("Pip", start)
    model.advance(
        other,
        start + HOUR,
        model.Settings(tz=UTC, roster=("bird",)),
        random.Random(4),
        max_gap=None,
    )
    assert other.temperament != pet.temperament  # each pet its own


def test_temperament_scales_how_soon_a_trait_comes():
    pet = hatched(at(12))
    flag, needed = R.TRAIT_FLAG_HOURS["fireside"]
    pet.trait_hours = {"awake": 50.0, flag: needed}
    pet.temperament = {"fireside": 1.5}
    assert model.trait_progress(pet)["fireside"] == pytest.approx(1 / 1.5, abs=0.001)
    live(pet, at(12, 10), house(flag))
    assert "fireside" not in pet.traits  # slow to warm to it
    pet.trait_hours[flag] = needed * 1.5
    live(pet, at(12, 20), house(flag))
    assert "fireside" in pet.traits


def test_pets_from_before_temperament_learn_as_before():
    pet = hatched(at(12))
    data = pet.to_dict()
    del data["temperament"]
    again = model.PetState.from_dict(data)
    assert again.temperament == {}
    assert model.trait_progress(again) == dict.fromkeys(model.TRAITS, 0.0)


def test_an_early_rising_house_makes_an_early_bird():
    settings = model.Settings(tz=UTC)  # wake 07:00
    pet = hatched(at(12))
    model.morning_stir(pet, at(9), settings)  # two hours in: not early
    assert pet.trait_hours.get("early_mornings", 0.0) == 0.0
    # Once a day, even if the moment comes again (after a restart, say).
    model.morning_stir(pet, at(7, 10, day=20), settings)
    model.morning_stir(
        model.PetState.from_dict(pet.to_dict()), at(7, 30, day=20), settings
    )
    pet = model.PetState.from_dict(pet.to_dict())
    model.morning_stir(pet, at(7, 40, day=20), settings)
    assert pet.trait_hours["early_mornings"] == 1.0
    pet.trait_hours.clear()
    for day in range(R.TRAIT_EARLY_BIRD_MORNINGS):
        model.morning_stir(pet, at(7, 20, day=day + 1), settings)
    assert model.trait_progress(pet)["early_bird"] == 1.0
    events = live(pet, at(12, 10), house())
    assert {"type": "trait_learned", "trait": "early_bird", "level": 1} in events


def test_chores_make_a_helper_who_enjoys_treats_more():
    pet = hatched(at(12), happiness=10.0, hunger=10.0)
    for i in range(R.TRAIT_HELPER_CHORES):
        model.chores_done(pet, 1, at(12) + i)
        model.give_treats(pet, at(12) + i)
        pet.chore_treats = []  # past the daily limit: a test of counting only
    assert pet.trait_hours["chores"] == R.TRAIT_HELPER_CHORES
    live(pet, at(12, 10), house())
    assert "helper" in pet.traits
    pet.happiness = 10.0
    model.chores_done(pet, 1, at(12, 20))
    model.give_treats(pet, at(12, 20))
    assert pet.happiness == 10.0 + R.CHORE_TREAT_HAPPINESS + R.HELPER_TREAT_HAPPINESS


def test_games_make_a_player_who_enjoys_wins_more():
    start = at(9)
    pet = hatched(start)
    for g in range(R.TRAIT_PLAYER_GAMES):
        pet.energy = 100.0
        play_rounds(pet, ["left"] * 5, start + g * 60, Always("left"))
    assert model.games_played(pet) == R.TRAIT_PLAYER_GAMES
    live(pet, start + R.TRAIT_PLAYER_GAMES * 60 + 600, house())
    assert "player" in pet.traits
    pet.energy, pet.happiness = 100.0, 10.0
    play_rounds(pet, ["left"] * 5, start + 3 * HOUR, Always("left"))
    assert pet.happiness == 10.0 + R.GAME_WIN_HAPPINESS + R.PLAYER_WIN_HAPPINESS


def test_every_trait_has_notification_words():
    from custom_components.virtual_pet import notify

    assert set(notify.TRAITS) == set(model.TRAITS)


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


def test_discipline_fades_while_awake_but_not_asleep():
    start = at(9)
    pet = hatched(start, discipline=50.0)
    run(pet, start + 4 * HOUR)
    assert pet.discipline == pytest.approx(50 - 4 * R.DISCIPLINE_DECAY)
    night = hatched(at(23, 30), discipline=50.0)
    night.asleep = True
    night.wake_at = at(7, day=2)
    model.advance(night, at(6, day=2), SETTINGS, NoLuck(), max_gap=None)
    assert night.discipline == 50.0


def test_discipline_makes_whining_rarer_but_never_stops_it():
    pet = hatched(at(9))
    wild = model.whine_rate(pet)
    pet.discipline = 100.0
    tame = model.whine_rate(pet)
    assert wild == R.FAKE_CALL_RATE
    assert 0 < tame < wild
    pet.upbringing = "scrappy"
    assert model.whine_rate(pet) == pytest.approx(tame * R.SCRAPPY_WHINE_FACTOR)


@pytest.mark.parametrize(
    ("misses", "discipline", "grade"),
    [(0, 40.0, "devoted"), (2, 30.0, "steady"), (5, 0.0, "scrappy")],
)
def test_upbringing_is_decided_on_growing_up(misses, discipline, grade):
    adult = dict(R.STAGE_STARTS)["adult"]
    start = at(9)
    pet = hatched(start, age_hours=adult - 0.1, discipline=discipline)
    pet.care_misses = misses
    pet.hunger = pet.happiness = 99.0
    assert model.upbringing(pet) == grade  # on track before the day comes
    events = run(pet, start + 10 * MIN)
    grown = [e for e in events if e["type"] == "stage_changed"]
    assert grown == [
        {"type": "stage_changed", "stage": "adult", "from": "teen", "upbringing": grade}
    ]
    assert pet.upbringing == grade
    # Kept for life: later misses don't change it.
    pet.care_misses = 50
    assert model.upbringing(pet) == grade


def test_a_devoted_adult_gets_hungry_and_bored_more_slowly():
    start = at(9)
    steady = hatched(start, age_hours=400.0, upbringing="steady")
    devoted = hatched(start, age_hours=400.0, upbringing="devoted")
    for pet in (steady, devoted):
        run(pet, start + 2 * HOUR)
    assert devoted.hunger == pytest.approx(
        90 - 2 * R.HUNGER_DECAY * R.DEVOTED_DECAY_FACTOR
    )
    assert devoted.happiness > steady.happiness
    assert devoted.energy == steady.energy


def test_a_devoted_parent_hands_its_trait_down_deeper():
    age = 14 * 24 + 7 * 24 + 1.0
    pet = hatched(at(12), age_hours=age, upbringing="devoted")
    pet.traits = ["homebody"]
    pet.trait_levels = {"homebody": 2}
    egg, events = model.lay_egg(pet, at(12), random.Random(1))
    assert egg.trait_levels == {"homebody": 3}
    assert events[0]["level"] == 3
    assert egg.journal[-1]["upbringing"] == "devoted"
    assert egg.upbringing is None


def test_old_adult_saves_get_an_upbringing_and_bad_ones_are_dropped():
    pet = hatched(at(9), age_hours=400.0)
    data = pet.to_dict()
    del data["upbringing"]
    assert model.PetState.from_dict(data).upbringing == "steady"  # 0 misses, 0 disc.
    young = hatched(at(9)).to_dict()
    young["upbringing"] = "legendary"
    assert model.PetState.from_dict(young).upbringing is None


def test_lights_out_while_away_is_applied_on_return():
    start = at(14)
    pet = hatched(start)
    pet.away = True
    model.set_lights_out(pet, True, start, SETTINGS)
    assert pet.lights_out and not pet.asleep
    events = model.come_home(pet, start + HOUR, SETTINGS)
    assert types(events) == ["fell_asleep"]
    assert pet.asleep and pet.napping


def test_lights_flipped_on_and_off_while_away_change_nothing():
    pet = hatched(at(23, 30))
    pet.asleep = True  # dozed off on its own
    pet.wake_at = at(7, day=2)
    pet.away = True
    model.set_lights_out(pet, True, at(23, 40), SETTINGS)
    model.set_lights_out(pet, False, at(23, 45), SETTINGS)
    assert model.come_home(pet, at(23, 50), SETTINGS) == []
    assert pet.asleep


@pytest.mark.parametrize(
    ("event", "text"),
    [
        ({"type": "hatched", "species": "axolotl"}, "Pip hatched: it's an axolotl!"),
        ({"type": "hatched", "species": "bird"}, "Pip hatched: it's a bird!"),
        ({"type": "hatched"}, "Pip hatched: it's a new friend!"),
        ({"type": "trait_learned", "trait": "fireside"}, "Pip loves the fireside now."),
        ({"type": "trait_learned", "trait": "night_owl"}, "Pip is a night owl now."),
        (
            {"type": "trait_deepened", "trait": "fireside", "level": 2},
            "Pip's love of the fire runs deep now: ★★",
        ),
        (
            {"type": "stage_changed", "stage": "adult", "upbringing": "devoted"},
            "Pip is all grown up!",
        ),
        ({"type": "stage_changed", "stage": "child"}, None),
    ],
)
def test_notification_wording(event, text):
    from custom_components.virtual_pet import notify

    names = {"axolotl": "Axolotl", "bird": "Bird"}
    assert notify.message(event, "Pip", names) == text


class Lucky(NoLuck):
    """Every chance fires."""

    def random(self) -> float:
        return 0.0


def test_weight_burns_while_awake_and_care_moves_it():
    start = at(9)
    pet = hatched(start, hunger=50.0)
    run(pet, start + 2 * HOUR)
    assert pet.weight == pytest.approx(R.WEIGHT_START - 2 * R.WEIGHT_BURN)
    before = pet.weight
    model.apply_action(pet, "feed", start + 2 * HOUR, NoLuck())
    model.apply_action(pet, "snack", start + 2 * HOUR, NoLuck())
    model.apply_action(pet, "play", start + 2 * HOUR, NoLuck())
    assert pet.weight == pytest.approx(
        before + R.WEIGHT_FEED + R.WEIGHT_SNACK + R.WEIGHT_PLAY
    )


def test_a_heavy_pet_stops_healing_and_can_get_sick():
    start = at(9)
    heavy = hatched(start, health=50.0, weight=90.0)
    run(heavy, start + HOUR)
    assert heavy.health == 50.0  # no regen
    assert "heavy" in model.mood(heavy, start + HOUR, SETTINGS)[1]
    sick = hatched(start, weight=90.0)
    events = model.advance(sick, start + 10 * MIN, SETTINGS, Lucky(), max_gap=None)
    assert {"type": "became_sick", "cause": "weight"} in events


def test_a_light_pet_stops_healing():
    start = at(9)
    pet = hatched(start, health=50.0, weight=10.0)
    run(pet, start + HOUR)
    assert pet.health == 50.0
    assert "light" in model.mood(pet, start + HOUR, SETTINGS)[1]


def play_rounds(pet, guesses, t, rng):
    results = []
    for i, guess in enumerate(guesses):
        info, events = model.play_game(pet, guess, t + i * 10, rng)
        results.append((info, events))
    return results


class Always(random.Random):
    """The pet always hides on one side."""

    def __init__(self, side: str) -> None:
        super().__init__(0)
        self.side = side

    def choice(self, seq):
        return self.side


def test_winning_the_game_cheers_it_up_more_than_losing():
    start = at(9)
    winner = hatched(start, happiness=50.0)
    rounds = play_rounds(winner, ["left"] * 5, start, Always("left"))
    assert [r[0]["round"] for r in rounds] == [1, 2, 3, 4, 5]
    last, events = rounds[-1]
    assert last["done"] and last["won"] and last["wins"] == 5
    assert winner.happiness == 50.0 + R.GAME_WIN_HAPPINESS
    assert winner.weight == R.WEIGHT_START + R.WEIGHT_GAME
    assert winner.game is None
    assert winner.care_log[0]["result"] == "won"
    assert {
        "type": "game_finished",
        "game": "left_right",
        "won": True,
        "wins": 5,
    } in events

    loser = hatched(start, happiness=50.0)
    rounds = play_rounds(loser, ["right"] * 5, start, Always("left"))
    assert rounds[-1][0]["won"] is False
    assert loser.happiness == 50.0 + R.GAME_LOSE_HAPPINESS
    assert loser.care_log[0] == {
        "at": start + 40,
        "action": "game",
        "by": None,
        "result": "lost",
        "score": "0/5",
        "game": "left_right",
    }


class Deal(random.Random):
    """Higher or Lower's numbers, dealt in this order."""

    def __init__(self, *numbers: int) -> None:
        super().__init__(0)
        self.numbers = list(numbers)

    def choice(self, seq):
        n = self.numbers.pop(0)
        assert n in seq, f"{n} can't come up from {list(seq)}"
        return n


def test_higher_or_lower_starts_with_a_number_then_plays_five_rounds():
    start = at(9)
    pet = hatched(start, happiness=50.0)
    rng = Deal(5, 7, 2, 9, 1, 3)
    info, events = model.start_game(pet, "higher_lower", start, rng)
    assert info == {
        "result": "ok",
        "game": "higher_lower",
        "round": 0,
        "rounds": R.GAME_ROUNDS,
        "wins": 0,
        "done": False,
        "number": 5,
    }
    assert events == []
    guesses = ["higher", "lower", "higher", "lower", "higher"]
    for i, guess in enumerate(guesses):
        info, events = model.play_game(
            pet, guess, start + 10 * (i + 1), rng, kind="higher_lower"
        )
        assert info["correct"]
    assert (info["shown"], info["number"]) == (1, 3)
    assert info["done"] and info["won"] and info["wins"] == 5
    assert pet.happiness == 50.0 + R.SKILL_GAME_WIN_HAPPINESS
    assert pet.games == {"higher_lower": {"played": 1, "won": 1}}
    assert pet.care_log[0]["game"] == "higher_lower"
    assert {
        "type": "game_finished",
        "game": "higher_lower",
        "won": True,
        "wins": 5,
    } in events


def test_a_skill_win_pays_like_plain_play_and_less_than_luck():
    assert R.SKILL_GAME_WIN_HAPPINESS == R.PLAY_HAPPINESS < R.GAME_WIN_HAPPINESS


def test_losing_higher_or_lower_still_counts():
    start = at(9)
    pet = hatched(start, happiness=50.0)
    rng = Deal(5, 7, 2, 9, 1, 3)
    model.start_game(pet, "higher_lower", start, rng)
    for i, guess in enumerate(["lower", "higher", "lower", "higher", "lower"]):
        info, _ = model.play_game(pet, guess, start + 10 * i, rng, kind="higher_lower")
    assert info["wins"] == 0 and info["won"] is False
    assert pet.happiness == 50.0 + R.GAME_LOSE_HAPPINESS
    assert pet.games == {"higher_lower": {"played": 1, "won": 0}}


def test_higher_or_lower_never_shows_the_same_number_twice():
    pet = hatched(at(9))
    rng = random.Random(7)
    for g in range(100):
        pet.energy = 100.0
        info, _ = model.start_game(pet, "higher_lower", at(9) + g, rng)
        shown = info["number"]
        for _ in range(R.GAME_ROUNDS):
            info, _ = model.play_game(
                pet, "higher", at(9) + g, rng, kind="higher_lower"
            )
            assert info["number"] != shown and info["number"] in model.NUMBERS
            shown = info["number"]


def test_higher_or_lower_needs_starting_first():
    pet = hatched(at(9))
    info, events = model.play_game(pet, "higher", at(9), Deal(), kind="higher_lower")
    assert info == {"result": "no_game"} and events == []
    assert pet.game is None


def test_starting_over_before_a_guess_keeps_the_number():
    pet = hatched(at(9))
    deal = Deal(5, 1, 7)
    info, _ = model.start_game(pet, "higher_lower", at(9), deal)
    assert info["number"] == 5
    # Starting again can't fish for an easy first number (1 or 9)...
    again, _ = model.start_game(pet, "higher_lower", at(9, 1), deal)
    assert again["number"] == 5 and pet.game.last_at == at(9, 1)
    # ...but after a guess, or from another game, it's a new game.
    model.play_game(pet, "higher", at(9, 2), deal, kind="higher_lower")
    fresh, _ = model.start_game(pet, "higher_lower", at(9, 3), deal)
    assert fresh["number"] == 7 and pet.game.rounds == 0


def test_a_guess_from_the_other_game_is_an_error():
    pet = hatched(at(9))
    with pytest.raises(ValueError):
        model.play_game(pet, "left", at(9), Deal(), kind="higher_lower")
    with pytest.raises(ValueError):
        model.start_game(pet, "catch", at(9), Deal())


def test_switching_games_drops_the_old_one():
    pet = hatched(at(9))
    model.start_game(pet, "higher_lower", at(9), Deal(5))
    info, _ = model.play_game(pet, "left", at(9) + 10, Always("left"))
    assert info["game"] == "left_right" and info["round"] == 1
    assert pet.game is not None and pet.game.kind == "left_right"


def test_an_idle_higher_or_lower_game_is_dropped():
    start = at(9)
    pet = hatched(start)
    model.start_game(pet, "higher_lower", start, Deal(5))
    model.advance(pet, start + (R.GAME_IDLE_MINUTES + 1) * MIN, SETTINGS, NoLuck())
    assert pet.game is None and pet.games == {}


def test_saved_games_load_from_older_and_newer_versions():
    pet = hatched(at(9))
    data = pet.to_dict()
    data["game"] = {"started": at(9), "last_at": at(9), "rounds": 2, "wins": 1}
    loaded = model.PetState.from_dict(data)
    assert loaded.game is not None and loaded.game.kind == "left_right"
    data["game"] = {"started": at(9), "last_at": at(9), "kind": "catch"}
    assert model.PetState.from_dict(data).game is None  # not this version's
    data["games"] = {"higher_lower": {"played": 3, "won": 2, "best": 5}, "x": 1}
    assert model.PetState.from_dict(data).games == {
        "higher_lower": {"played": 3, "won": 2}
    }
    # A damaged entry still loads, with what's missing counted as 0.
    data["games"] = {"left_right": {"won": 2}, "higher_lower": {"played": "x"}}
    damaged = model.PetState.from_dict(data)
    assert damaged.games == {
        "left_right": {"played": 0, "won": 2},
        "higher_lower": {"played": 0, "won": 0},
    }
    assert model.games_played(damaged) == 0
    del data["games"]
    assert model.PetState.from_dict(data).games == {}


def test_the_game_is_refused_when_it_cant_play():
    pet = hatched(at(9), energy=5.0)
    info, events = model.play_game(pet, "left", at(9), NoLuck())
    assert info == {"result": "too_tired"}
    assert pet.game is None and pet.care_log[0]["result"] == "too_tired"
    asleep = hatched(at(9))
    asleep.asleep = True
    assert model.play_game(asleep, "left", at(9), NoLuck())[0]["result"] == "asleep"


def test_an_unfinished_game_is_dropped():
    start = at(9)
    pet = hatched(start)
    model.play_game(pet, "left", start, NoLuck())
    assert pet.game is not None
    run(pet, start + (R.GAME_IDLE_MINUTES + 1) * MIN)
    assert pet.game is None
    info, _ = model.play_game(pet, "left", start + HOUR, NoLuck())
    assert info["round"] == 1  # a fresh game


def test_chores_earn_treats_up_to_a_daily_limit():
    start = at(9)
    pet = hatched(start, hunger=50.0, happiness=50.0)
    assert model.chores_done(pet, 2, start) == 2
    events = model.give_treats(pet, start)
    assert types(events) == ["chore_treat", "chore_treat"]
    assert pet.hunger == 50.0 + 2 * R.CHORE_TREAT_HUNGER
    assert pet.care_log[0]["action"] == "chore_treat"
    assert model.chores_done(pet, 10, start + HOUR) == R.CHORE_TREATS_PER_DAY - 2
    assert pet.treats_waiting == R.CHORE_TREATS_WAITING  # the rest are capped
    model.give_treats(pet, start + HOUR)
    assert model.chores_done(pet, 1, start + 2 * HOUR) == 0  # the day's limit
    assert model.chores_done(pet, 1, start + 25 * HOUR) == 1  # a new day


def test_chore_treats_wait_for_it_to_wake_up():
    pet = hatched(at(23, 30))
    pet.asleep = True
    pet.wake_at = at(7, day=2)
    model.chores_done(pet, 1, at(23, 40))
    assert model.give_treats(pet, at(23, 40)) == []
    events = model.advance(pet, at(7, 10, day=2), SETTINGS, NoLuck(), max_gap=None)
    assert "chore_treat" in types(events)
    assert pet.treats_waiting == 0


def test_old_saves_without_weight_start_in_the_middle():
    data = hatched(at(9)).to_dict()
    del data["weight"], data["game"]
    pet = model.PetState.from_dict(data)
    assert pet.weight == R.WEIGHT_START and pet.game is None
    data["game"] = {"started": 1.0, "last_at": 2.0, "rounds": 2, "wins": 1, "x": 0}
    assert model.PetState.from_dict(data).game == model.Game(1.0, 2.0, 2, 1)


def test_waking_says_how():
    pet = hatched(at(23, 30))
    pet.asleep = True
    pet.wake_at = at(7, day=2)
    events = model.advance(pet, at(7, 5, day=2), SETTINGS, NoLuck(), max_gap=None)
    assert {"type": "woke_up", "how": "morning"} in events
    night = hatched(at(23, 30))
    model.set_lights_out(night, True, at(23, 30), SETTINGS)
    assert model.set_lights_out(night, False, at(23, 40), SETTINGS) == [
        {"type": "woke_up", "how": "night"}
    ]


def test_dozing_off_is_told_apart_from_lights_out():
    start = at(23, 0)
    pet = hatched(start, energy=90.0)
    events = run(pet, start + 2 * HOUR)
    asleep = [e for e in events if e["type"] == "fell_asleep"]
    assert asleep and asleep[0]["how"] == "dozed"
    # One "off" wakes a pet that dozed off with the switch already off.
    assert not pet.lights_out
    assert types(model.set_lights_out(pet, False, start + 2 * HOUR, SETTINGS)) == [
        "woke_up"
    ]


def test_weight_shows_in_what_it_says():
    pet = hatched(at(9), weight=90.0)
    assert model.mood(pet, at(9), SETTINGS)[2] == "feeling a bit round..."
    pet.weight = 10.0
    assert model.mood(pet, at(9), SETTINGS)[2] == "could use a proper meal"


def test_call_notifications_offer_the_answer_as_a_button():
    from custom_components.virtual_pet import notify

    assert notify.actions({"type": "call_started", "reason": "happiness"}, "p1") == [
        {"action": "VIRTUAL_PET:p1:play", "title": "Play"},
        {"action": "VIRTUAL_PET:p1:scold", "title": "Scold"},
    ]
    assert notify.actions({"type": "became_sick"}, "p1")[0]["title"] == "Medicine"
    assert notify.actions({"type": "hatched"}, "p1") == []
    assert notify.parse_action("VIRTUAL_PET:01ABC:lights_out") == (
        "01ABC",
        "lights_out",
    )
    assert notify.parse_action("VIRTUAL_PET:x_y:feed") == ("x_y", "feed")
    assert notify.parse_action("SOMETHING_ELSE") is None


def test_out_of_energy_it_drops_off_for_a_nap():
    start = at(13)
    pet = hatched(start, energy=1.0)
    events = run(pet, start + HOUR)
    asleep = [e for e in events if e["type"] == "fell_asleep"]
    assert asleep == [{"type": "fell_asleep", "napping": True, "how": "collapsed"}]
    assert pet.asleep and pet.napping
    assert pet.happiness == pytest.approx(90 - 0.2 * R.HAPPINESS_DECAY, abs=0.6)


def test_the_first_snow_of_the_season_is_a_memory_once_per_winter():
    pet = hatched(at(9))
    assert model.season_first(pet, "snow", at(9, day=3), UTC) == [
        {"type": "first_snow"}
    ]
    assert model.season_first(pet, "snow", at(9, day=4), UTC) == []
    assert [m["kind"] for m in pet.memories] == ["first_snow"]
    next_winter = datetime(2027, 11, 2, 9, tzinfo=UTC).timestamp()
    assert model.season_first(pet, "snow", next_winter, UTC) == [{"type": "first_snow"}]
    # The memories stay with the device's family line.
    pet.age_hours = 14 * 24 + 7 * 24 + 1.0
    egg, _ = model.lay_egg(pet, next_winter, random.Random(1))
    assert len(egg.memories) == 2 and egg.firsts == pet.firsts


# --- Daily check-ins --------------------------------------------------------


def test_a_wish_a_day_from_what_the_house_can_grant():
    pet = hatched(at(9))
    rng = random.Random(1)
    events = model.pick_wish(pet, "d1", rng, {"play", "snack"})
    assert events == [{"type": "wish_made", "kind": pet.wish["kind"]}]
    assert pet.wish["kind"] in {"play", "snack"} and not pet.wish["granted"]
    assert model.pick_wish(pet, "d1", rng, {"play", "snack"}) == []  # once a day
    first = pet.wish["kind"]
    model.pick_wish(pet, "d2", rng, {"play", "snack"})
    assert pet.wish["kind"] != first  # never yesterday's again
    # Only one option left: that one, even if it was yesterday's.
    model.pick_wish(pet, "d3", rng, {pet.wish["kind"]})
    assert pet.wish["day"] == "d3"
    assert model.pick_wish(hatched(at(9)), "d1", rng, set()) == []


def test_a_wish_comes_true_once_and_only_today():
    pet = hatched(at(9), happiness=50.0)
    pet.wish = {"kind": "snack", "day": "d1", "granted": False}
    assert model.grant_wish(pet, "play", at(13), "d1", 13, None) == []  # not this
    assert model.grant_wish(pet, "snack", at(10), "d1", 10, None) == []  # not yet lunch
    assert model.grant_wish(pet, "snack", at(13), "d2", 13, None) == []  # yesterday's
    assert model.grant_wish(pet, "snack", at(13), "d1", 13, "Alex") == [
        {"type": "wish_granted", "kind": "snack"}
    ]
    assert pet.wish["granted"] and pet.wish["by"] == "Alex"
    assert pet.happiness == 50.0 + R.WISH_HAPPINESS
    assert model.grant_wish(pet, "snack", at(14), "d1", 14, None) == []  # once


def test_it_dreams_of_yesterday_and_forgets_old_seeds():
    pet = hatched(at(20))
    model.dream_seed(pet, {"kind": "watching", "title": "Bluey"}, at(20))
    model.dream_seed(pet, {"kind": "moon"}, at(20) - 40 * HOUR)  # too old
    events = model.dream_on_waking(pet, at(7, day=2), "d2", random.Random(0))
    assert pet.dream == {"kind": "watching", "title": "Bluey", "day": "d2"}
    assert events == [{"type": "dreamed", **pet.dream}]
    assert pet.dream_seeds == []
    # Nothing to dream of: a plain dream, or none.
    kinds = set()
    for seed in range(20):
        pet.dream = None
        model.dream_on_waking(pet, at(7, day=3), "d3", random.Random(seed))
        kinds.add(pet.dream and pet.dream["kind"])
    assert None in kinds and kinds - {None} <= {"flying", "clouds", "feast"}


def test_dream_seeds_are_capped():
    pet = hatched(at(9))
    for i in range(R.DREAM_SEEDS_KEPT + 5):
        model.dream_seed(pet, {"kind": "game"}, at(9) + i)
    assert len(pet.dream_seeds) == R.DREAM_SEEDS_KEPT


def test_a_save_from_before_check_ins_loads():
    data = hatched(at(9)).to_dict()
    for key in ("wish", "dream_seeds", "dream"):
        data.pop(key)
    pet = model.PetState.from_dict(data)
    assert pet.wish is None and pet.dream_seeds == [] and pet.dream is None


# --- Bonds -------------------------------------------------------------------


def test_bond_levels_are_slow_at_the_top():
    assert model.bond_level(0) == 1
    assert model.bond_level(R.BOND_LEVELS[1]) == 2
    assert model.bond_level(10**6) == 10
    steps = [b - a for a, b in zip(R.BOND_LEVELS, R.BOND_LEVELS[1:], strict=False)]
    assert steps == sorted(steps)


def test_care_and_games_have_a_daily_limit_and_a_visit_counts_once():
    pet = hatched(at(9))
    rng = random.Random(1)
    for _ in range(20):
        model.add_bond(pet, "u1", "care", "2026-10-01", rng)
    model.add_bond(pet, "u1", "visit", "2026-10-01", rng)
    model.add_bond(pet, "u1", "visit", "2026-10-01", rng)
    assert pet.bonds["u1"]["points"] == R.BOND_DAILY_LIMIT + R.BOND_VISIT_POINTS
    # A new day, a new allowance; points never go down.
    model.add_bond(pet, "u1", "care", "2026-10-02", rng)
    assert pet.bonds["u1"]["points"] == R.BOND_DAILY_LIMIT + R.BOND_VISIT_POINTS + 1


def test_a_close_bond_brings_a_nickname_then_a_favourite_game():
    pet = hatched(at(9))
    rng = random.Random(1)
    pet.bonds["u1"] = {"points": R.BOND_LEVELS[3] - 1, "games": {"higher_lower": 3}}
    pet.bonds["u2"] = {"points": 0, "nickname": "sunbeam"}
    events = model.add_bond(pet, "u1", "wish", "2026-10-01", rng)
    assert events[0]["level"] == R.BOND_NICKNAME_LEVEL
    nickname = pet.bonds["u1"]["nickname"]
    assert nickname in model.NICKNAMES and nickname != "sunbeam"  # not someone else's
    pet.bonds["u1"]["points"] = R.BOND_LEVELS[R.BOND_FAVOURITE_LEVEL - 1] - 1
    events = model.add_bond(pet, "u1", "game", "2026-10-02", rng, "left_right")
    assert events[0]["favourite"] == "higher_lower"  # the one they play most
    assert pet.bonds["u1"]["nickname"] == nickname  # kept
    pet.happiness = 50.0
    assert model.favourite_game(pet, "u2", "higher_lower", "2026-10-02") == []
    assert types(model.favourite_game(pet, "u1", "higher_lower", "2026-10-02")) == [
        "bond_favourite"
    ]
    assert (
        model.favourite_game(pet, "u1", "higher_lower", "2026-10-02") == []
    )  # once a day
    assert pet.happiness == 50.0  # flavour only: a bond never changes the stats


def test_bonds_carry_into_the_next_generation_and_survive_a_bad_save():
    pet = hatched(at(9))
    pet.age_hours = 10_000.0
    pet.bonds = {"u1": {"points": 30, "nickname": "bean"}}
    egg, _ = model.lay_egg(pet, at(10), random.Random(1))
    assert egg.bonds == pet.bonds and egg.bonds is not pet.bonds
    data = pet.to_dict()
    data["bonds"] = {"u1": {"points": "12"}, "u2": "junk"}
    assert model.PetState.from_dict(data).bonds == {"u1": {"points": 12}}


def test_a_wish_may_be_aimed_at_a_close_friend():
    pet = hatched(at(9))
    model.pick_wish(pet, "2026-10-01", Lucky(1), {"play"}, {"u1": "Sam"})
    assert pet.wish == {
        "kind": "play",
        "day": "2026-10-01",
        "granted": False,
        "for": "u1",
        "for_name": "Sam",
    }
    # Anyone may grant it.
    assert model.grant_wish(pet, "play", at(10), "2026-10-01", 10, "Alex")
    # Not one the house grants, nor without friends.
    model.pick_wish(pet, "2026-10-02", Lucky(1), {"tuck_in"}, {"u1": "Sam"})
    assert "for" not in pet.wish
    model.pick_wish(pet, "2026-10-03", Lucky(1), {"play"}, {})
    assert "for" not in pet.wish


def test_friendship_days_fall_monthly_and_on_short_months():
    assert model.friends_for("2026-09-28", "2026-10-28") == 1
    assert model.friends_for("2026-09-28", "2026-10-27") is None
    assert model.friends_for("2026-10-01", "2026-10-28") is None  # not a month yet
    assert model.friends_for("2026-01-31", "2026-02-28") == 1
    assert model.friends_for("2025-10-28", "2026-10-28") == 12
    assert model.friends_for(None, "2026-10-28") is None


def test_a_game_record_is_each_persons_own():
    pet = hatched(at(9))
    assert model.game_record(pet, "u1", "left_right", 3) == []  # sets the mark
    assert model.game_record(pet, "u1", "left_right", 3) == []
    assert types(model.game_record(pet, "u1", "left_right", 4)) == ["bond_record"]
    assert model.game_record(pet, "u2", "left_right", 2) == []  # their first
    assert pet.bonds["u1"]["best"] == {"left_right": 4}


def test_last_nights_dream_pick_comes_true():
    pet = hatched(at(9))
    model.dream_seed(pet, {"kind": "game"}, at(20))
    model.pick_dream(pet, "u1", "sea", at(21))
    model.pick_dream(pet, "u1", "stars", at(21, 30))  # their latest choice
    model.dream_on_waking(pet, at(7, day=2), "2026-10-02", random.Random(1))
    assert pet.dream == {
        "kind": "picked",
        "pick": "stars",
        "user": "u1",
        "day": "2026-10-02",
    }
    assert pet.dream_picks == [] and pet.dream_seeds == []


# --- Its favourite snack ------------------------------------------------------


class Luck(random.Random):
    """Chance always fires."""

    def random(self) -> float:
        return 0.0


def test_it_picks_a_favourite_snack_once_from_its_likes():
    egg = model.PetState.new("Pip", at(12))
    assert not model.pick_favourite(egg, ["hazelnuts"], random.Random(1))  # an egg
    pet = hatched(at(12))
    assert not model.pick_favourite(pet, [], random.Random(1))  # nothing it likes
    assert pet.favourites == {}
    assert model.pick_favourite(pet, ["hazelnuts", "fir cones"], random.Random(1))
    first = pet.favourites["snack"]
    assert first in ("hazelnuts", "fir cones")
    assert not model.pick_favourite(pet, ["mushrooms"], random.Random(2))  # for good
    assert pet.favourites == {"snack": first}


def test_its_favourite_snack_is_said_at_most_once_a_day():
    pet = hatched(at(12))
    assert model.favourite_snack(pet, "2026-10-01", Luck()) == []  # none picked yet
    pet.favourites = {"snack": "hazelnuts"}
    assert model.favourite_snack(pet, "2026-10-01", NoLuck()) == []  # not this time
    assert pet.favourite_said is None
    assert model.favourite_snack(pet, "2026-10-01", Luck()) == [
        {"type": "favourite_snack", "food": "hazelnuts"}
    ]
    assert model.favourite_snack(pet, "2026-10-01", Luck()) == []
    assert model.favourite_snack(pet, "2026-10-02", Luck(), own_food=True) == []
    assert len(model.favourite_snack(pet, "2026-10-02", Luck())) == 1


def test_a_new_egg_has_no_favourites_and_old_saves_load():
    pet = hatched(at(12), age_hours=ADULT + R.LAY_EGG_AFTER_ADULT_HOURS + 5)
    pet.species, pet.favourites = "squirrel", {"snack": "hazelnuts"}
    pet.favourite_said = "2026-10-01"
    egg, _ = model.lay_egg(pet, at(12), random.Random(1))
    assert egg.favourites == {} and egg.favourite_said is None
    data = pet.to_dict()
    assert model.PetState.from_dict(data).favourites == {"snack": "hazelnuts"}
    del data["favourites"], data["favourite_said"]
    old = model.PetState.from_dict(data)
    assert old.favourites == {} and old.favourite_said is None
    data["favourites"], data["favourite_said"] = {"snack": 3, "x": "y"}, 5
    damaged = model.PetState.from_dict(data)
    assert damaged.favourites == {"x": "y"} and damaged.favourite_said is None
    data["favourites"] = ["hazelnuts"]  # not even a dict
    assert model.PetState.from_dict(data).favourites == {}


# --- Birthdays ---------------------------------------------------------------


def test_its_birthday_is_monthly_in_its_first_year_then_yearly():
    assert model.pet_birthday("2026-01-31", "2026-02-28") == {
        "months": 1
    }  # short month
    assert model.pet_birthday("2026-01-31", "2026-03-31") == {"months": 2}
    assert model.pet_birthday("2026-01-31", "2026-03-30") is None
    assert model.pet_birthday("2026-01-31", "2026-12-31") == {"months": 11}
    assert model.pet_birthday("2026-01-31", "2027-01-31") == {"years": 1}
    assert model.pet_birthday("2026-01-31", "2027-02-28") is None  # 13 months: no
    assert model.pet_birthday(None, "2027-01-31") is None


def test_a_birthday_is_a_real_day_and_29_february_comes_every_year():
    assert model.valid_birthday("02-29") and model.valid_birthday("12-31")
    for bad in ("02-30", "13-01", "1-01", "aa-bb", "04-31", "0229", ""):
        assert not model.valid_birthday(bad), bad
    assert model.birthday_today("03-14", "2027-03-14")
    assert not model.birthday_today("03-14", "2027-03-15")
    assert model.birthday_today("02-29", "2027-02-28")  # not a leap year
    assert not model.birthday_today("02-29", "2028-02-28")
    assert model.birthday_today("02-29", "2028-02-29")
    assert not model.birthday_today(None, "2028-02-29")


def test_hatching_dates_its_birthday_and_a_new_egg_has_none():
    egg = model.PetState.new("Pip", at(23, 50))
    run(egg, at(23, 50) + 40 * MIN)  # hatches at 00:20 the next day (UTC)
    assert model.life_stage(egg) == "baby"
    assert egg.hatched_on == "2026-10-02"
    pet = hatched(at(12), age_hours=ADULT + R.LAY_EGG_AFTER_ADULT_HOURS + 5)
    pet.hatched_on, pet.catchphrase = "2026-09-01", "yay"
    new, _ = model.lay_egg(pet, at(12), random.Random(1))
    assert new.hatched_on is None and new.catchphrase is None
