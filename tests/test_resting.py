"""Resting (docs/plan-2026-11-02-favourite-resting.md, R1): the household's
per-pet switch. Its needs, aging, new calls, misses and new sickness hold;
its day and night, care, games, visitors and finds go on. The numbers in
the test names' comments are the plan's §8 rules."""

from __future__ import annotations

from datetime import date, timedelta
import json
from pathlib import Path
import random
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import model, notify, rates as R
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.coordinator import MOMENT_BARE, MOMENTS
from custom_components.virtual_pet.home import HomeEffect
from custom_components.virtual_pet.intent import mood_word

from .test_init import STORE_KEY, _notified, call_texts, hatched_pet, settle, setup
from .test_model import HOUR, MIN, SETTINGS, NoLuck, at, hatched, run, types

DAY = 24 * HOUR
COMPONENT = Path(__file__).parent.parent / "custom_components" / "virtual_pet"
HELD = (
    "hunger",
    "happiness",
    "health",
    "weight",
    "discipline",
    "age_hours",
    "care_misses",
    "discipline_misses",
    "counted_misses",
    "discipline_samples",
    "wellbeing_samples",
    "treats_waiting",
)


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


def rested(t: float, **stats: float) -> model.PetState:
    """A hatched pet, put to rest at t."""
    pet = hatched(t, **stats)
    result, events = model.set_resting(pet, True, t)
    assert result == "ok" and types(events) == ["rest_started"]
    return pet


def snapshot(pet: model.PetState) -> dict[str, Any]:
    return {key: getattr(pet, key) for key in HELD} | {
        "trait_hours": dict(pet.trait_hours),
        "recent_misses": list(pet.recent_misses),
        "sick": pet.sick,
        "stage": model.life_stage(pet),
    }


# --- 1. Nothing changes until someone switches it ---------------------------


def test_1_off_by_default_and_a_save_without_the_key_loads_awake():
    pet = model.PetState.new("Pip", at(9))
    assert pet.resting is False and pet.rest_since is None
    saved = hatched(at(9)).to_dict()
    del saved["resting"], saved["rest_since"]
    loaded = model.PetState.from_dict(saved)
    assert loaded.resting is False and loaded.rest_since is None
    # The save gains exactly the two keys (S9).
    assert {"resting": False, "rest_since": None}.items() <= pet.to_dict().items()


def test_1_a_week_with_no_pet_resting_never_takes_the_rest_path(monkeypatch):
    def boom(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("rest path taken")

    monkeypatch.setattr(model, "_rest_step", boom)
    monkeypatch.setattr(model, "_hold_times", boom)
    pet = hatched(at(9))
    model.advance(pet, at(9, day=8), SETTINGS, random.Random(4), max_gap=None)
    assert pet.age_hours == pytest.approx(30 + 7 * 24)


@pytest.mark.parametrize("bad", ["yes", 1, None, [True]])
def test_1_a_damaged_resting_key_is_false(bad: Any):
    saved = hatched(at(9)).to_dict() | {"resting": bad, "rest_since": "x"}
    loaded = model.PetState.from_dict(saved)
    assert loaded.resting is False and loaded.rest_since is None


# --- 2-4. The settling and the freeze ---------------------------------------


def test_2_entering_floors_the_needs_to_55_and_leaves_health():
    pet = rested(at(9), hunger=10.0, happiness=30.0, energy=70.0, health=30.0)
    assert (pet.hunger, pet.happiness, pet.energy) == (R.REST_FLOOR, 55.0, 70.0)
    assert pet.health == 30.0
    assert R.REST_FLOOR > max(hi for _, hi in R.CALL_THRESHOLDS.values())


def test_3_a_day_without_a_visit_holds_everything_but_its_night():
    pet = rested(at(9), discipline=40.0)
    pet.treats_waiting = 2
    pet.trait_hours = {"chores": 3.0}
    pet.poops = [at(8, 50)]
    before = snapshot(pet)
    energy = pet.energy
    events = run(pet, at(9, day=2))
    assert snapshot(pet) == before
    assert pet.poops == [at(8, 50) + DAY]  # held: still 10 minutes old
    assert pet.energy >= energy  # sleep is free
    assert set(types(events)) == {"fell_asleep", "woke_up"}
    assert not pet.asleep and pet.last_updated == at(9, day=2)


@pytest.mark.parametrize("seed", range(12))
def test_4_no_need_or_fake_call_over_a_week(seed: int):
    pet = rested(at(9), discipline=0.0)
    events = model.advance(
        pet, at(9, day=8), SETTINGS, random.Random(seed), max_gap=None
    )
    assert not {"call_started", "care_miss", "became_sick", "discipline_miss"} & set(
        types(events)
    )
    assert pet.call is None and not pet.sick


# --- 5. Calls: settled on entry, honest on waking ---------------------------


@pytest.mark.parametrize(
    "call",
    [
        model.Call("hunger", 0, 0),
        model.Call("fake", 0, 0),
        model.Call("happiness", 0, 0, recall=True),
    ],
)
def test_5_an_open_call_is_settled_with_no_answer_and_no_miss(call: model.Call):
    t = at(12)
    pet = hatched(t, hunger=20.0, happiness=20.0)
    pet.latched, pet.latched_at = ["hunger"], {"hunger": t - 5 * HOUR}
    pet.call = model.Call(call.reason, t - MIN, t + 10 * MIN, call.recall)
    _, events = model.set_resting(pet, True, t)
    assert pet.call is None and types(events) == ["rest_started"]
    assert pet.latched == ["hunger"]  # latches stay: they re-arm after waking
    assert pet.care_misses == pet.discipline_misses == 0
    run(pet, t + 2 * HOUR)
    _, events = model.set_resting(pet, False, t + 2 * HOUR)
    assert types(events) == ["rest_ended"]
    later = run(pet, t + 4 * HOUR)
    assert "call_started" not in types(later)
    assert pet.latched == []  # re-armed at 55


def test_5_sick_and_dirty_ask_on_the_first_step_after_waking():
    t = at(12)
    sick = rested(t, sick=True, health=40.0)
    dirty = rested(t)
    dirty.poops = [t - 31 * MIN]
    for pet, reason in ((sick, "sick"), (dirty, "dirty")):
        assert "call_started" not in types(run(pet, t + 3 * HOUR))
        model.set_resting(pet, False, t + 3 * HOUR)
        started = [
            e for e in run(pet, t + 3 * HOUR + MIN) if e["type"] == "call_started"
        ]
        assert [e["reason"] for e in started] == [reason]


# --- 6. A sick pet may rest -------------------------------------------------


def test_6_sick_holds_medicine_cures_and_health_regens_after():
    t = at(10)
    pet = rested(t, sick=True, health=30.0)
    run(pet, t + 6 * HOUR)
    assert pet.sick and pet.health == 30.0
    result, events = model.apply_action(pet, "medicine", t + 6 * HOUR, NoLuck())
    assert result == "ok" and "recovered" in types(events)
    healed = pet.health
    assert healed == 30.0 + R.MEDICINE_HEALTH
    run(pet, t + 8 * HOUR)
    assert pet.health == healed  # held while resting
    model.set_resting(pet, False, t + 8 * HOUR)
    run(pet, t + 10 * HOUR)
    assert pet.health > healed


# --- 7. Care works, on the real clock ---------------------------------------


def test_7_praise_window_and_day_roll_on_the_real_clock():
    t = at(10)
    pet = rested(t, happiness=0.0)
    gains = []
    for when in (t, t, t, t + 5 * MIN, t + HOUR, t + 25 * HOUR):
        run(pet, when)
        before = pet.happiness
        model.apply_action(pet, "praise", when, NoLuck(), settings=SETTINGS)
        gains.append(pet.happiness - before)
    assert gains == [8.0, 4.0, 2.0, 0.0, R.PRAISE_TIRED_HAPPINESS, 8.0]


def test_7_excitement_games_kept_up_and_chore_treats_expire():
    t = at(10)
    pet = rested(t)
    model.apply_action(pet, "play", t, NoLuck())
    assert model.mood(pet, t, SETTINGS)[0] == "excited"
    run(pet, t + (R.EXCITED_MINUTES + 1) * MIN)
    assert model.mood(pet, t + (R.EXCITED_MINUTES + 1) * MIN, SETTINGS)[0] != "excited"
    # A game started while resting is dropped once nobody plays.
    g = t + HOUR
    run(pet, g)
    model.play_game(pet, "left", g, NoLuck())
    assert pet.game is not None
    run(pet, g + (R.GAME_IDLE_MINUTES + 1) * MIN)
    assert pet.game is None
    # The day's chore treats open again 24 hours on.
    assert model.chores_done(pet, R.CHORE_TREATS_PER_DAY, g) == R.CHORE_TREATS_PER_DAY
    assert model.chores_done(pet, 1, g + HOUR) == 0
    run(pet, g + 25 * HOUR)
    assert model.chores_done(pet, 1, g + 25 * HOUR) == 1
    assert pet.treats_waiting == R.CHORE_TREATS_WAITING  # banked, not given
    assert model.give_treats(pet, g + 25 * HOUR) == []


def test_7_woken_by_hand_at_night_the_house_puts_it_back_to_bed():
    house = model.Settings(tz=SETTINGS.tz, home=HomeEffect(dark_and_quiet=True))
    t = at(23, 30)
    pet = rested(t)
    model.set_lights_out(pet, True, t, house)
    assert pet.asleep
    woke = at(1, day=2)
    model.advance(pet, woke, house, NoLuck(), max_gap=None)
    model.set_lights_out(pet, False, woke, house)
    assert not pet.asleep and pet.kept_up_until == woke + 60 * MIN
    model.advance(pet, woke + 30 * MIN, house, NoLuck(), max_gap=None)
    assert not pet.asleep
    events = model.advance(pet, woke + 62 * MIN, house, NoLuck(), max_gap=None)
    assert (
        pet.asleep
        and {"type": "fell_asleep", "napping": False, "how": "house"} in events
    )


def test_7_the_bond_still_grows_within_the_daily_limit():
    pet = rested(at(10))
    for _ in range(20):
        model.add_bond(pet, "u1", "care", "2026-10-01", NoLuck())
    assert pet.bonds["u1"]["points"] == R.BOND_DAILY_LIMIT


def test_feeding_a_resting_pet_soon_fills_it_and_weight_holds_after():
    t = at(10)
    pet = rested(t)
    results = []
    for i in range(6):
        results.append(model.apply_action(pet, "feed", t + i * MIN, NoLuck())[0])
    assert "full" in results
    weight = pet.weight
    run(pet, t + DAY)
    assert pet.weight == weight and not pet.sick


# --- 8. Aging, the next generation, the birthday ----------------------------


def test_8_no_growing_up_and_no_laying_while_resting():
    t = at(10)
    pet = rested(t)
    pet.age_hours = dict(R.STAGE_STARTS)["adult"] + R.LAY_EGG_AFTER_ADULT_HOURS + 1
    child = rested(t)
    stage = model.life_stage(child)
    run(child, t + 30 * DAY)
    assert model.life_stage(child) == stage and child.age_hours == 30.0
    assert not model.can_lay_egg(pet)
    assert "lay_egg" not in model.requests(pet, t, SETTINGS)
    assert model.requests(pet, t, SETTINGS) == []
    same, events = model.lay_egg(pet, t, NoLuck())
    assert same is pet and events == []
    model.set_resting(pet, False, t)
    egg, _ = model.lay_egg(pet, t, NoLuck())
    assert egg is not pet and egg.resting is False and egg.rest_since is None


def test_8_leaving_moves_the_birthday_by_the_whole_days_rested():
    t = at(10)
    pet = rested(t)
    pet.hatched_on = "2025-10-03"
    model.set_resting(pet, False, t + 3 * DAY + 20 * HOUR)
    assert pet.hatched_on == "2025-10-06"
    assert pet.rest_since is None
    short = rested(t)
    short.hatched_on = "2025-10-03"
    model.set_resting(short, False, t + 20 * HOUR)
    assert short.hatched_on == "2025-10-03"


# --- 9. An egg can't rest ---------------------------------------------------


def test_9_an_egg_refuses_and_can_always_be_woken():
    egg = model.PetState.new("Pip", at(9))
    result, events = model.set_resting(egg, True, at(9))
    assert (result, events, egg.resting) == ("egg", [], False)
    egg.resting = True  # slipped through (a downgrade): off still works
    result, events = model.set_resting(egg, False, at(9))
    assert result == "ok" and types(events) == ["rest_ended"] and not egg.resting


# --- 10. Its day and night ---------------------------------------------------


def test_10_a_daytime_nap_ends_rested_and_it_never_collapses():
    t = at(13)
    pet = rested(t, energy=60.0)
    model.set_lights_out(pet, True, t, SETTINGS)
    assert pet.asleep and pet.napping
    events = run(pet, t + 4 * HOUR)
    assert {"type": "woke_up", "how": "rested"} in events
    assert pet.energy >= R.NAP_WAKE_ENERGY
    assert not any(e.get("how") == "collapsed" for e in events)


def test_10_lights_out_and_the_morning_work_while_resting():
    pet = rested(at(22))
    events = model.set_lights_out(pet, True, at(23, 30), SETTINGS)
    assert pet.asleep and not pet.napping and "fell_asleep" in types(events)
    events = run(pet, at(8, day=2))
    assert {"type": "woke_up", "how": "morning"} in events
    assert pet.energy == 100.0


# --- 11. Away wins -----------------------------------------------------------


def test_11_away_wins_and_resting_resumes_on_coming_home():
    t = at(10)
    pet = rested(t)
    pet.away = True
    assert model.apply_action(pet, "feed", t, NoLuck())[0] == "away"
    run(pet, t + 3 * HOUR)
    assert pet.resting and pet.last_updated == t + 3 * HOUR
    pet.away = False
    run(pet, t + 5 * HOUR)
    assert pet.age_hours == 30.0 and pet.hunger == 90.0


def test_11_set_and_cleared_while_away():
    t = at(10)
    pet = hatched(t, hunger=20.0)
    pet.away = True
    model.set_resting(pet, True, t)
    assert pet.resting and pet.hunger == R.REST_FLOOR
    model.set_resting(pet, False, t + HOUR)
    assert not pet.resting
    run(pet, t + 2 * HOUR)
    assert pet.hunger == R.REST_FLOOR  # still away: frozen
    assert "resting" not in model.mood(pet, t + 2 * HOUR, SETTINGS)[1]


# --- 12. Time: restarts, gaps, pending poops --------------------------------


def test_12_a_restart_and_a_long_gap_while_resting_change_nothing():
    t = at(10)
    pet = rested(t)
    pet.digesting = [t + 30 * MIN]
    before = snapshot(pet)
    model.catch_up(pet, t + 2 * DAY)
    model.advance(pet, t + 5 * DAY, SETTINGS, NoLuck())  # past max_gap
    assert snapshot(pet) == before
    # The meal's remaining 30 minutes are still to come after waking.
    model.set_resting(pet, False, t + 5 * DAY)
    assert "pooped" not in types(run(pet, t + 5 * DAY + 25 * MIN))
    assert "pooped" in types(run(pet, t + 5 * DAY + 35 * MIN))


# --- 13. Visitors and finds go on --------------------------------------------


def test_13_a_resting_pet_can_still_find_things():
    pet = rested(at(10))
    assert model.can_find(pet, "woodland")


# --- 16. Assist's words; care isn't refused -----------------------------------


@pytest.mark.parametrize(
    ("mood", "flags", "word"),
    [
        ("content", ["resting"], "taking it easy"),
        ("cozy", ["resting", "cozy"], "taking it easy"),
        ("sick", ["resting", "sick"], "sick and resting"),
        ("hungry", ["resting", "hungry"], "hungry and resting"),
        ("asleep", ["resting", "asleep"], "asleep"),
        ("content", [], "content"),
    ],
)
def test_16_assist_folds_resting_into_the_mood(mood: str, flags: list[str], word: str):
    assert mood_word(mood, flags) == word


def test_16_feed_and_play_are_not_refused_and_resting_is_a_flag_not_a_mood():
    t = at(10)
    pet = rested(t, hunger=40.0)
    mood, flags, _ = model.mood(pet, t, SETTINGS)
    assert "resting" in flags and mood != "resting" and "resting" not in model.MOODS
    assert model.apply_action(pet, "feed", t, NoLuck())[0] == "ok"
    assert model.apply_action(pet, "play", t + MIN, NoLuck())[0] == "ok"


# --- 17. Save and downgrade --------------------------------------------------


def test_17_round_trip_and_an_older_build_keeps_the_key():
    t = at(10)
    pet = rested(t)
    saved = json.loads(json.dumps(pet.to_dict()))
    again = model.PetState.from_dict(saved)
    assert again.resting and again.rest_since == t
    # An older build keeps keys it doesn't know (the unknown dict) and saves them.
    old = model.PetState.from_dict({**saved, "a_later_key": 1})
    assert old.to_dict()["a_later_key"] == 1


def test_17_downgrade_lay_upgrade_leaves_no_resting_egg():
    # An older build lets a resting adult lay, and its egg carries the key
    # over in its unknown keys: this build loads that egg awake.
    t = at(10)
    egg = model.PetState.new("Pip", t).to_dict() | {"resting": True, "rest_since": t}
    loaded = model.PetState.from_dict(egg)
    assert loaded.resting is False and loaded.rest_since is None


def test_17_a_resting_save_with_no_start_gets_one():
    pet = hatched(at(10)).to_dict() | {"resting": True}
    loaded = model.PetState.from_dict(pet)
    assert loaded.resting and loaded.rest_since == loaded.last_updated


# --- 18. Care that spends what rest settled ----------------------------------


def test_18_play_spends_energy_and_a_tired_pet_calls_on_waking():
    t = at(10)
    pet = rested(t, energy=55.0)
    i = 0
    while model.apply_action(pet, "play", t + i * MIN, NoLuck())[0] == "ok":
        i += 1
    assert pet.energy < R.CALL_THRESHOLDS["energy"][0]
    run(pet, t + HOUR)
    assert pet.call is None
    model.set_resting(pet, False, t + HOUR)
    started = [e for e in run(pet, t + HOUR + MIN) if e["type"] == "call_started"]
    assert [e["reason"] for e in started] == ["energy"]


def test_18_a_meal_while_resting_poops_only_after_waking():
    t = at(10)
    pet = rested(t, hunger=55.0)
    assert model.apply_action(pet, "feed", t, NoLuck())[0] == "ok"
    assert "pooped" not in types(run(pet, t + 6 * HOUR))
    assert pet.poops == []
    model.set_resting(pet, False, t + 6 * HOUR)
    assert "pooped" in types(run(pet, t + 6 * HOUR + R.DIGEST_MINUTES * MIN + MIN))


# --- 14. The bus, the phones, the moments (Home Assistant) --------------------


def test_14_both_events_are_moments_and_rest_started_ends_a_call_push():
    assert {"rest_started", "rest_ended"} <= MOMENTS
    assert not {"rest_started", "rest_ended"} & MOMENT_BARE
    assert "rest_started" in notify.CALL_OVER_EVENTS
    for kind in ("rest_started", "rest_ended"):
        assert notify.message({"type": kind}, "Pip", {}) is None


async def test_14_the_switch_fires_once_each_with_only_the_pet(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    started = async_capture_events(hass, f"{DOMAIN}_rest_started")
    ended = async_capture_events(hass, f"{DOMAIN}_rest_ended")
    for service in ("turn_on", "turn_on", "turn_off", "turn_off"):
        await hass.services.async_call(
            "switch", service, {"entity_id": "switch.pip_resting"}, blocking=True
        )
    assert [e.data for e in started] == [{"pet_id": "test_pet"}]
    assert [e.data for e in ended] == [{"pet_id": "test_pet"}]
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert [m["type"] for m in moments][:2] == ["rest_ended", "rest_started"]


async def test_14_resting_clears_a_call_on_the_phone(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=20.0)
    await setup(hass)
    phone = await _notified(hass)
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in phone] in call_texts("hunger")
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": "switch.pip_resting"}, blocking=True
    )
    await hass.async_block_till_done()
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_test_pet_call"
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    assert coordinator.asking() is None  # out of the re-call bundle
    count = len(phone)
    for _ in range(12):
        await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert len(phone) == count
    assert hass.states.get("binary_sensor.pip_calling").state == "off"


# --- 15. The switch entity, its words, privacy --------------------------------


async def test_15_the_switch_shows_the_pet_and_has_its_words(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, resting=True, rest_since=now - HOUR)
    await setup(hass)
    assert hass.states.get("switch.pip_resting").state == "on"
    mood = hass.states.get("sensor.pip_mood")
    assert "resting" in mood.attributes["flags"]
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": "switch.pip_resting"}, blocking=True
    )
    assert hass.states.get("switch.pip_resting").state == "off"
    for name in ("strings.json", "translations/en.json"):
        words = json.loads((COMPONENT / name).read_text())
        assert words["entity"]["switch"]["resting"]["name"] == "Resting"
    icons = json.loads((COMPONENT / "icons.json").read_text())
    assert icons["entity"]["switch"]["resting"]["default"] == "mdi:sofa"


async def test_15_privacy_still_shows_an_away_pet_as_asleep(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(
        now, away=True, resting=True, rest_since=now - HOUR
    )
    await setup(hass)
    mood = hass.states.get("sensor.pip_mood")
    assert mood.state == "asleep"
    # The flag stays (the switch shows it anyway): its absence can't say "away".
    assert mood.attributes["flags"] == ["asleep", "resting"]
    assert hass.states.get("switch.pip_resting").state == "on"


# --- 8, 9 in Home Assistant: the party, the egg, the websocket ---------------


async def test_8_no_birthday_party_while_resting(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    year_ago = (dt_util.now().date() - timedelta(days=365)).isoformat()
    assert date.fromisoformat(year_ago).replace(year=2026) == dt_util.now().date()
    hass_storage[STORE_KEY] = hatched_pet(
        now, age_hours=400 * 24.0, hatched_on=year_ago
    )
    await setup(hass)
    assert hass.states.get("sensor.pip_life_stage").attributes["birthday"] == {
        "years": 1
    }
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": "switch.pip_resting"}, blocking=True
    )
    assert hass.states.get("sensor.pip_life_stage").attributes["birthday"] is None


async def test_9_the_switch_is_a_quiet_no_op_on_an_egg(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, age_hours=0.0)
    await setup(hass)
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": "switch.pip_resting"}, blocking=True
    )
    assert hass.states.get("switch.pip_resting").state == "off"
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": "switch.pip_resting"}, blocking=True
    )


async def test_9_the_websocket_refuses_an_egg_and_rests_a_pet(
    hass: HomeAssistant, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    # The real clock: the websocket's token is issued now.
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    client = await hass_ws_client(hass)

    async def rest(enabled: bool) -> dict[str, Any]:
        await client.send_json_auto_id(
            {
                "type": "virtual_pet/rest",
                "entity_id": "sensor.pip_mood",
                "enabled": enabled,
            }
        )
        return await client.receive_json()

    reply = await rest(True)
    assert reply["success"] and reply["result"] == {"resting": True}
    assert coordinator.state.resting
    assert (await rest(False))["success"] and not coordinator.state.resting
    coordinator.state.age_hours = 0.0  # an egg
    reply = await rest(True)
    assert not reply["success"] and reply["error"]["code"] == "egg"
    coordinator.state.resting = True  # slipped through: off still works
    assert (await rest(False))["success"] and not coordinator.state.resting
