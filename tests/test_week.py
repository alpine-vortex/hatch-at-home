"""The journal's week strip (fresh-expand E14): kept on the social meter's days,
only the days that hold something, a dream's kind only, no person."""

from __future__ import annotations

import json
import random
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from custom_components.virtual_pet import model

from .test_init import STORE_KEY, hatched_pet, setup
from .test_visit import first_visit_day, plan, stamp


def test_the_week_rides_on_the_social_days_and_drops_bad_entries() -> None:
    raw = {
        "2026-11-01": {
            "visitor": True,
            "links": [],
            "dream": "stars",
            "weather": "rain",
        },
        "2026-11-02": {"visit": "chickadee", "weather": "hail", "dream": "My Show!"},
        "2026-11-03": {"dream": 5, "visit": "x" * 40},
        "monday": {"dream": "stars"},
    }
    got = model.social_from(raw)
    assert got == {
        "2026-11-01": {
            "visitor": True,
            "links": [],
            "dream": "stars",
            "weather": "rain",
        },
        "2026-11-02": {"visitor": False, "links": [], "visit": "chickadee"},
        "2026-11-03": {"visitor": False, "links": []},
    }


def test_the_days_first_notable_weather_sticks() -> None:
    pet = model.PetState.new("Pip", stamp("2026-11-01", 0))
    assert not model.week_weather(pet, "2026-11-01", set())
    assert model.week_weather(pet, "2026-11-01", {"rain", "storm"})
    assert pet.social["2026-11-01"]["weather"] == "storm"  # the most notable at once
    assert not model.week_weather(pet, "2026-11-01", {"snow"})  # the first stays
    assert model.week_weather(pet, "2026-11-02", {"fog"})


def test_the_strip_shows_only_filled_days_of_the_last_seven() -> None:
    pet = model.PetState.new("Pip", stamp("2026-11-01", 0))
    pet.social = model.social_from(
        {
            "2026-10-25": {"dream": "stars"},  # 8 days back: gone
            "2026-10-27": {"visitor": True, "links": ["a"]},  # nothing for the strip
            "2026-10-28": {"dream": "show", "weather": "sun"},
            "2026-10-30": {"visit": "chickadee"},
            "2026-11-01": {"weather": "snow"},
        }
    )
    assert model.week_strip(pet, "2026-11-01") == [
        {"day": "2026-10-28", "dream": True, "weather": "sun"},  # a show's title: never
        {"day": "2026-10-30", "visit": "chickadee"},
        {"day": "2026-11-01", "weather": "snow"},
    ]
    blob = json.dumps(model.week_strip(pet, "2026-11-01"))
    assert "show" not in blob and "user" not in blob


def test_a_credited_visit_and_a_dream_mark_their_day() -> None:
    day = first_visit_day("2026-03-01")
    pet = plan(day)
    visit = pet.visit
    assert visit is not None and visit["id"]
    assert model.credit_visit(pet, visit["until"], "woodland")
    assert pet.social[day]["visit"] == visit["id"]
    pet.dream_picks = [{"pick": "sea", "user": "u1", "at": visit["until"]}]
    model.dream_on_waking(pet, visit["until"] + 3600, day, random.Random(0))
    assert pet.social[day]["dream"] == "picked"
    assert "u1" not in json.dumps(pet.social)


async def test_the_week_is_on_the_sensor_and_never_recorded(
    hass: HomeAssistant, hass_storage: dict[str, Any]
) -> None:
    now = dt_util.utcnow().timestamp()
    today = dt_util.now().date().isoformat()
    stored = hatched_pet(now)
    stored["data"]["social"] = {
        today: {"visitor": False, "links": [], "weather": "rain"}
    }
    hass_storage[STORE_KEY] = stored
    await setup(hass)
    state = hass.states.get("sensor.pip_life_stage")
    assert state.attributes["week"] == [{"day": today, "weather": "rain"}]
    from custom_components.virtual_pet.sensor import LifeStageSensor

    assert "week" in LifeStageSensor._unrecorded_attributes
