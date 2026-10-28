"""Noticing someone's day: their steps, stairs, a bike ride, a good night's sleep.

Opt-in per person ("my day" on the status screen), and only ever positive: the
pet says something when a day stands out for that person, and nothing at all
otherwise. Never a quiet day, a short night, a heart rate or a weight. The
closer the bond, the more it notices.

Signals come from the phones each person signed in to the Home Assistant app
with (mobile_app config entries carry the user ID), so nothing is mapped per
pet. "Usual" is that person's own median over the last two weeks, at the same
time of day, from Home Assistant's long-term statistics; nothing new is stored.
What the pet noticed goes back only to that person (the visit call's response).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
import statistics
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from . import rates as R
from .const import LOGGER

# The companion app's sensors by the end of their unique ID, and whether the
# value starts again at midnight (Android's plain step counter counts since the
# phone last restarted, so only its statistics' changes are any use).
SENSORS: dict[str, dict[str, bool]] = {
    "steps": {"health_connect_daily_steps": True, "steps": True, "steps_sensor": False},
    "floors": {"health_connect_daily_floors": True, "floors_ascended": True},
    "sleep": {"health_connect_sleep_duration": False},
    "activity": {"detected_activity": False, "activity": False},
    "alarm": {"next_alarm": False},  # Android
}
# Activity states worth a word, as the two apps name them.
MOVES = {"running": "run", "cycling": "bike", "on_bicycle": "bike"}
SLEEP_HOURS = {"min": 1 / 60, "h": 1.0, "s": 1 / 3600}


@dataclass
class Sensors:
    """One person's phone sensors: kind -> (entity ID, resets daily)."""

    found: dict[str, tuple[str, bool]] = field(default_factory=dict)


@dataclass
class Day:
    """How one person's day is going, as far as their phones tell."""

    steps: float | None = None
    steps_usual: float | None = None  # by this time of day
    steps_best: float | None = None  # their best whole day of the last month
    steps_days: int = 0  # days of history behind the best
    floors: float | None = None
    floors_usual: float | None = None
    sleep_hours: float | None = None
    sleep_usual: float | None = None
    moved: set[str] = field(default_factory=set)  # "run", "bike" today
    weather: set[str] = field(default_factory=set)  # the house's: rain, snow, sun


def find_sensors(hass: HomeAssistant, user_id: str) -> Sensors:
    """The companion app sensors on this person's phones (the first of each)."""
    entries = {
        e.entry_id
        for e in hass.config_entries.async_entries("mobile_app")
        if e.data.get("user_id") == user_id
    }
    # Per kind, the best match by SENSORS' order (Health Connect's daily count
    # over a step counter since the phone restarted), whatever the registry's.
    best: dict[str, tuple[int, str, bool]] = {}
    for entity in er.async_get(hass).entities.values():
        if entity.platform != "mobile_app" or entity.config_entry_id not in entries:
            continue
        if entity.disabled:
            continue
        unique = (entity.unique_id or "").lower()
        for kind, keys in SENSORS.items():
            for rank, (key, daily) in enumerate(keys.items()):
                if unique == key or unique.endswith(f"_{key}"):
                    if kind not in best or rank < best[kind][0]:
                        best[kind] = (rank, entity.entity_id, daily)
                    break
    found = {kind: (entity_id, daily) for kind, (_, entity_id, daily) in best.items()}
    return Sensors(found)


def activity_sensors(hass: HomeAssistant) -> dict[str, str]:
    """Every phone's activity sensor: entity ID -> its person's user ID."""
    users = {
        e.entry_id: e.data.get("user_id")
        for e in hass.config_entries.async_entries("mobile_app")
    }
    out = {}
    for entity in er.async_get(hass).entities.values():
        if entity.platform != "mobile_app" or not users.get(entity.config_entry_id):
            continue
        unique = (entity.unique_id or "").lower()
        if any(unique == k or unique.endswith(f"_{k}") for k in SENSORS["activity"]):
            out[entity.entity_id] = users[entity.config_entry_id]
    return out


def notice(day: Day, level: int, hour: int) -> dict[str, Any] | None:
    """The one thing worth a word today, best first, or None. Positive only."""
    if (
        hour < 12
        and level >= R.MY_DAY_SLEEP_LEVEL
        and day.sleep_hours is not None
        and day.sleep_usual is not None
        and day.sleep_hours >= max(R.MY_DAY_RESTED_HOURS, day.sleep_usual)
    ):
        return {"kind": "rested", "hours": round(day.sleep_hours, 1)}
    steps = day.steps or 0
    if (
        level >= R.MY_DAY_BEST_LEVEL
        and day.steps_best is not None
        and day.steps_days >= R.MY_DAY_BEST_MIN_DAYS
        and steps >= R.MY_DAY_BEST_MIN_STEPS
        and steps > day.steps_best
    ):
        return {"kind": "best_day", "steps": int(steps)}
    if level >= R.MY_DAY_ACTIVE_LEVEL:
        for move in ("bike", "run"):
            if move in day.moved:
                return {"kind": move}
        floors = day.floors or 0
        if floors >= R.MY_DAY_STAIRS and (
            not day.floors_usual or floors >= day.floors_usual * R.MY_DAY_MORE
        ):
            return {"kind": "stairs", "floors": int(floors)}
    usual = day.steps_usual
    walked = steps >= R.MY_DAY_WEATHER_WALK_STEPS and (not usual or steps >= usual)
    if level >= R.MY_DAY_USUAL_LEVEL and walked:
        for kind in ("snow", "rain"):  # out in it anyway
            if kind in day.weather:
                return {"kind": f"{kind}_walk", "steps": int(steps)}
    if (
        level >= R.MY_DAY_USUAL_LEVEL
        and usual is not None
        and usual >= R.MY_DAY_USUAL_MIN_STEPS
        and steps >= usual * R.MY_DAY_MORE
        and steps - usual >= R.MY_DAY_MORE_MIN_STEPS
    ):
        return {"kind": "more_than_usual", "steps": int(steps)}
    if level >= R.MY_DAY_STEPS_LEVEL and steps >= R.MY_DAY_STEPS:
        return {"kind": "steps", "steps": int(steps // 1000 * 1000)}
    return None


async def _stats(
    hass: HomeAssistant,
    entity_id: str,
    start: datetime,
    end: datetime,
    period: str,
    kind: str,
) -> list[tuple[datetime, float]]:
    """(local start, value) rows of the long-term statistics, or none."""
    if "recorder" not in hass.config.components:
        return []
    from homeassistant.components.recorder import get_instance  # noqa: PLC0415
    from homeassistant.components.recorder.statistics import (  # noqa: PLC0415
        statistics_during_period,
    )

    try:
        rows = await get_instance(hass).async_add_executor_job(
            statistics_during_period,
            hass,
            start,
            end,
            {entity_id},
            period,
            None,
            {kind},
        )
    except Exception:  # noqa: BLE001 - no history only means less to notice
        LOGGER.debug("No statistics for %s", entity_id, exc_info=True)
        return []
    out = []
    for row in rows.get(entity_id, []):
        value = row.get(kind)
        if value is None:
            continue
        begin = row["start"]
        when = (
            dt_util.utc_from_timestamp(begin)
            if isinstance(begin, int | float)
            else begin
        )
        out.append((dt_util.as_local(when), float(value)))
    return out


def _number(
    hass: HomeAssistant, entity_id: str, since: datetime | None = None
) -> float | None:
    """The sensor's value, if it has one (and was updated since `since`)."""
    state = hass.states.get(entity_id)
    if state is None or (since is not None and state.last_updated < since):
        return None
    try:
        return float(state.state)
    except ValueError:
        return None


async def _counter(
    hass: HomeAssistant, entity_id: str, daily: bool, now: datetime
) -> tuple[float | None, float | None, float | None, int]:
    """(today, usual by now, best whole day, days of history) for a counter."""
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hourly = await _stats(
        hass,
        entity_id,
        midnight - timedelta(days=R.MY_DAY_USUAL_DAYS),
        now,
        "hour",
        "change",
    )
    # Today from the sensor itself where it starts again at midnight (it's up to
    # the minute), else from the statistics, which stop at the last whole hour.
    # Either way, compare it with the same part of the day before.
    # A daily count not updated since midnight is still yesterday's.
    today = _number(hass, entity_id, midnight) if daily else None
    until = now.hour + 1 if today is not None else now.hour
    by_day: dict[str, float] = {}
    for when, change in hourly:
        if when.hour < until:
            key = when.date().isoformat()
            by_day[key] = by_day.get(key, 0.0) + max(change, 0.0)
    today_key = now.date().isoformat()
    if today is None:
        today = by_day.get(today_key)
    past = [v for k, v in by_day.items() if k != today_key]
    usual = statistics.median(past) if len(past) >= R.MY_DAY_USUAL_MIN_DAYS else None
    daily_rows = await _stats(
        hass,
        entity_id,
        midnight - timedelta(days=R.MY_DAY_BEST_DAYS),
        midnight,
        "day",
        "change",
    )
    whole = [v for when, v in daily_rows if v > 0 and when.date() < now.date()]
    return today, usual, (max(whole) if whole else None), len(whole)


async def read_day(
    hass: HomeAssistant,
    sensors: Sensors,
    moved: set[str],
    weather: set[str] | None = None,
) -> Day:
    """Today so far for one person, from their phones and their history."""
    now = dt_util.now()
    day = Day(moved=set(moved), weather=set(weather or ()))
    if found := sensors.found.get("steps"):
        day.steps, day.steps_usual, day.steps_best, day.steps_days = await _counter(
            hass, found[0], found[1], now
        )
    if found := sensors.found.get("floors"):
        day.floors, day.floors_usual, _, _ = await _counter(
            hass, found[0], found[1], now
        )
    if found := sensors.found.get("sleep"):
        state = hass.states.get(found[0])
        factor = SLEEP_HOURS.get(
            (state.attributes.get("unit_of_measurement") if state else None) or "min",
            1 / 60,
        )
        if (minutes := _number(hass, found[0])) is not None:
            day.sleep_hours = minutes * factor
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        nights = [
            v * factor
            for _, v in await _stats(
                hass,
                found[0],
                midnight - timedelta(days=R.MY_DAY_USUAL_DAYS),
                midnight,
                "day",
                "mean",
            )
        ]
        if len(nights) >= R.MY_DAY_USUAL_MIN_DAYS:
            day.sleep_usual = statistics.median(nights)
    return day
