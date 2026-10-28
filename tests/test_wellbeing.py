"""Noticing someone's day: what's worth a word, and finding their phones."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.recorder.models import StatisticMeanType
from homeassistant.components.recorder.statistics import async_import_statistics
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
)

from custom_components.virtual_pet import rates as R
from custom_components.virtual_pet.wellbeing import (
    Day,
    Sensors,
    find_sensors,
    notice,
    read_day,
)


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(recorder_db_url, enable_custom_integrations):
    """The recorder's database has to be ready before Home Assistant starts."""
    yield


def test_a_quiet_day_says_nothing():
    assert notice(Day(steps=3000, steps_usual=6000), 10, 15) is None
    assert notice(Day(sleep_hours=5.0, sleep_usual=7.5), 10, 8) is None
    assert notice(Day(), 10, 15) is None


def test_the_closer_the_bond_the_more_it_notices():
    busy = Day(steps=12500, steps_usual=6000, steps_best=11000, steps_days=20)
    assert notice(busy, 1, 15) is None
    assert notice(busy, 2, 15) == {"kind": "steps", "steps": 12000}
    assert notice(busy, 4, 15) == {"kind": "more_than_usual", "steps": 12500}
    assert notice(busy, 7, 15) == {"kind": "best_day", "steps": 12500}
    rested = Day(sleep_hours=8.2, sleep_usual=7.0)
    assert notice(rested, 7, 8) is None
    assert notice(rested, 8, 8) == {"kind": "rested", "hours": 8.2}
    assert notice(rested, 8, 15) is None  # a morning thing
    assert notice(Day(moved={"bike"}), 5, 15) == {"kind": "bike"}
    assert notice(Day(floors=14), 5, 15) == {"kind": "stairs", "floors": 14}
    assert notice(Day(floors=14, floors_usual=12), 5, 15) is None


def test_more_than_usual_needs_a_real_difference():
    assert notice(Day(steps=1600, steps_usual=1100), 4, 15) is None
    assert notice(Day(steps=900, steps_usual=500), 4, 15) is None


async def test_it_finds_each_persons_own_phone_sensors(hass: HomeAssistant) -> None:
    registry = er.async_get(hass)
    for user, webhook in (("u1", "abc"), ("u2", "def")):
        phone = MockConfigEntry(domain="mobile_app", data={"user_id": user})
        phone.add_to_hass(hass)
        for key in ("health_connect_daily_steps", "steps_sensor", "detected_activity"):
            registry.async_get_or_create(
                "sensor",
                "mobile_app",
                f"{webhook}_{key}",
                config_entry=phone,
                suggested_object_id=f"{user}_{key}",
            )
    found = find_sensors(hass, "u1").found
    assert found == {
        "steps": ("sensor.u1_health_connect_daily_steps", True),
        "activity": ("sensor.u1_detected_activity", False),
    }
    assert find_sensors(hass, "nobody").found == {}


async def test_usual_comes_from_their_own_history(
    recorder_mock: Any, hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-10-26 15:30:00+00:00")
    await hass.config.async_set_time_zone("UTC")
    now = dt_util.now()
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    rows: list[dict[str, Any]] = []
    total = 0.0
    # Two weeks of 400 steps an hour from 8 to 20, and today so far.
    for day in range(14, -1, -1):
        for hour in range(24):
            start = midnight - timedelta(days=day) + timedelta(hours=hour)
            if start >= now.replace(minute=0):
                break
            total += (900 if day == 0 else 400) if 8 <= hour < 20 else 0
            rows.append({"start": start, "state": total, "sum": total})
    async_import_statistics(
        hass,
        {
            "mean_type": StatisticMeanType.NONE,
            "has_sum": True,
            "name": None,
            "source": "recorder",
            "statistic_id": "sensor.steps",
            "unit_class": None,
            "unit_of_measurement": "steps",
        },
        rows,
    )
    await async_wait_recording_done(hass)
    day = await read_day(hass, Sensors({"steps": ("sensor.steps", False)}), set())
    # 8:00-15:00 (the hour before now): 7 hours.
    assert day.steps_usual == 7 * 400
    assert day.steps == 7 * 900
    assert day.steps_best == 12 * 400 and day.steps_days == 14
    assert notice(day, R.MY_DAY_USUAL_LEVEL, 15) == {
        "kind": "more_than_usual",
        "steps": 6300,
    }
