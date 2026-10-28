"""What the pets know about each person, shared by every pet in the house.

A bond is a pet's own (its points, the nickname it picked, a tuck-in). What
belongs to the person is kept once, here, so three pets don't ask the same
question three times or send three umbrella reminders: their likes, the
questions asked today, the lines said today, the zone they were last in, their
usual alarm, a guess about tomorrow's weather, and their "my day" switch. Also
the house's weather of the last few days (rain, snow, sun), which the pets
sense together.

Nothing here goes on a state attribute or the event bus: it reaches a person
only through the visit's response, or their own phone. Diagnostics leave it out.
"""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
import statistics
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from . import rates as R
from .const import DOMAIN

STORE_KEY = f"{DOMAIN}.people"
STORE_VERSION = 1
SAVE_DELAY = 60

# Questions a pet may ask, and the answers that are remembered (the rest are
# answered on the card and kept nowhere).
QUESTIONS = (
    "slept",
    "how_day",
    "fav_weather",
    "fav_season",
    "dream",
    "guess",
    "birthday",
    "catchphrase",
)
ANSWERS: dict[str, tuple[str, ...]] = {
    "fav_weather": ("sun", "rain", "snow", "storms"),
    "fav_season": ("spring", "summer", "autumn", "winter"),
    "dream": ("stars", "sea", "snacks", "you"),
    "guess": ("rain", "sun"),
    # The pet's, not the person's: what it says at the end of things.
    "catchphrase": ("hehe", "yay", "and stuff", "la la", "keep"),
}
# One-time questions about the person, in the order they're asked, with the bond
# level each needs. (The pet's own one-time question, its catchphrase, comes from
# the coordinator: its tries live in the pet's bond.)
ONCE = (
    ("fav_weather", R.ASK_LIKES_LEVEL),
    ("fav_season", R.ASK_LIKES_LEVEL),
    ("birthday", R.BIRTHDAY_ASK_LEVEL),
)
ONCE_KINDS = {kind for kind, _ in ONCE} | {"catchphrase"}
# The later slot's rotation by date, so no question crowds out the others.
ROTATION = ("how_day", "dream", "guess")
# Zones worth a word when someone comes back from one (by a word in its name).
ZONE_WORDS = {
    "gym": "gym",
    "fitness": "gym",
    "work": "work",
    "office": "work",
    "school": "school",
    "college": "school",
    "university": "school",
    "park": "park",
}
# Zones after which "how was your day?" is the question.
DAY_ZONES = {"work", "school"}


class People:
    """The shared store (hass.data[DOMAIN]["people"])."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self.data: dict[str, Any] = {"people": {}, "weather": {}}
        self._locks: dict[str, asyncio.Lock] = {}

    def lock(self, user: str) -> asyncio.Lock:
        """One look at a time per person, across every pet."""
        return self._locks.setdefault(user, asyncio.Lock())

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict):
            self.data = {
                "people": dict(loaded.get("people") or {}),
                "weather": dict(loaded.get("weather") or {}),
            }

    def save(self) -> None:
        self._store.async_delay_save(lambda: self.data, SAVE_DELAY)

    async def async_save_now(self) -> None:
        await self._store.async_save(self.data)

    def person(self, user: str) -> dict[str, Any]:
        return self.data["people"].setdefault(user, {})

    def my_day(self, user: str) -> bool:
        return bool(self.data["people"].get(user, {}).get("my_day"))

    def baby_talk(self, user: str) -> bool:
        """Simpler words from babies and children, on this person's cards."""
        return bool(self.data["people"].get(user, {}).get("baby_talk"))

    def said(self, user: str, kind: str, key: str) -> bool:
        """Whether this line was already said (today, or for this key)."""
        return self.person(user).get("noted", {}).get(kind) == key

    def mark(self, user: str, kind: str, key: str) -> None:
        self.person(user).setdefault("noted", {})[kind] = key
        self.save()

    def saw_weather(self, today: str, kinds: set[str]) -> None:
        """The house's weather today (rain, snow, sun), kept for a few days."""
        seen = self.data["weather"]
        known = set(seen.get(today, []))
        if kinds - known:
            seen[today] = sorted(known | kinds)
            for day in sorted(seen)[: -R.PEOPLE_WEATHER_DAYS]:
                del seen[day]
            self.save()

    def weather_on(self, day: str) -> set[str]:
        return set(self.data["weather"].get(day, []))


# --- Pure rules ------------------------------------------------------------------


def season(day: date, latitude: float) -> str | None:
    """The season by the equinoxes and solstices, for the hemisphere; None in
    the tropics, where the four seasons mean little."""
    if abs(latitude) < R.SEASON_TROPICS_LATITUDE:
        return None
    md = (day.month, day.day)
    if (3, 20) <= md < (6, 21):
        north = "spring"
    elif (6, 21) <= md < (9, 22):
        north = "summer"
    elif (9, 22) <= md < (12, 21):
        north = "autumn"
    else:
        north = "winter"
    if latitude > 0:
        return north
    return {"spring": "autumn", "summer": "winter", "autumn": "spring"}.get(
        north, "summer"
    )


def season_key(day: date, latitude: float) -> str | None:
    """The season and the year it began, so each season is greeted once."""
    name = season(day, latitude)
    if name is None:
        return None
    # Winter in the north spans New Year: it belongs to the year it began.
    year = day.year - 1 if day.month <= 3 and name in ("winter", "summer") else day.year
    return f"{name}-{year}"


def zone_word(zone: str | None) -> str | None:
    """gym, work, school or park, from a zone's name; None for anything else."""
    words = (zone or "").casefold().replace("-", " ").replace("_", " ").split()
    for word in words:
        if word in ZONE_WORDS:
            return ZONE_WORDS[word]
    return None


def guess_outcome(guess: str, seen: set[str]) -> str:
    """right, wrong or cloudy, from the day's weather."""
    rained = bool(seen & {"rain", "snow"})
    if guess == "rain":
        if rained:
            return "right"
        return "wrong" if "sun" in seen else "cloudy"
    if rained:
        return "wrong"
    return "right" if "sun" in seen else "cloudy"


def early_alarm(alarm_minute: int, usual: list[int]) -> bool:
    """Whether tomorrow's alarm (minutes after midnight) is early for them."""
    if len(usual) >= R.ALARM_USUAL_MIN:
        return alarm_minute <= statistics.median(usual) - R.ALARM_EARLY_MINUTES
    return alarm_minute < R.ALARM_EARLY_WITHOUT_USUAL


def rotation(day: date) -> str:
    """The later slot's question today."""
    return ROTATION[day.toordinal() % len(ROTATION)]


def choose_question(
    person: dict[str, Any],
    today: str,
    hour: int,
    *,
    level: int,
    to_bed_minutes: int,
    has_forecast: bool,
    came_home: str | None,
    rested: bool,
    pet_once: tuple[str, ...] = (),
) -> str | None:
    """The question to ask on this visit, or None: at most one in the morning
    (before noon) and one later, per person per day, across every pet. A
    one-time question that's due comes first in the later slot; pet_once are
    the pet's own still open for this person."""
    if level < R.ASK_LEVEL:
        return None
    asked = person.get("asked") or {}
    if asked.get("day") != today:
        asked = {"day": today}
    if hour < 12:
        if "morning" in asked or rested or hour < R.ASK_MORNING_FROM:
            return None
        return "slept"
    if "later" in asked:
        return None
    if once := once_due(person, today, hour, level, pet_once):
        return once
    if came_home in DAY_ZONES or came_home == "home":
        return "how_day"  # back from work or school, or a friend just home
    kind = rotation(date.fromisoformat(today))
    if kind == "how_day" and hour >= R.ASK_DAY_FROM:
        return "how_day"
    if kind == "dream" and 0 < to_bed_minutes <= R.ASK_DREAM_BEFORE_BED_MINUTES:
        return "dream"
    if kind == "guess" and has_forecast and hour >= R.ASK_GUESS_FROM:
        return "guess"
    return None


def once_due(
    person: dict[str, Any],
    today: str,
    hour: int,
    level: int,
    pet_once: tuple[str, ...] = (),
) -> str | None:
    """A one-time question due now: each has its own tries, so one left
    unanswered never holds up the next; a few days apart per person."""
    if not R.ASK_LIKES_FROM <= hour < R.ASK_LIKES_UNTIL:
        return None
    last = person.get("once_last")
    if last and (date.fromisoformat(today) - date.fromisoformat(last)).days < (
        R.ASK_ONCE_GAP_DAYS
    ):
        return None
    likes = person.get("likes") or {}
    tries = person.get("likes_asked") or {}
    done = {*likes, *(["birthday"] if person.get("birthday") else [])}
    if person.get("birthday_skipped"):
        done.add("birthday")
    for kind, need in ONCE:
        if (
            level >= need
            and kind not in done
            and may_ask_again(tries.get(kind, []), today)
        ):
            return kind
    return pet_once[0] if pet_once else None


def mark_once(person: dict[str, Any], kind: str, today: str) -> None:
    """A one-time question was asked today (its tries; the gap to the next)."""
    if kind in dict(ONCE):
        person.setdefault("likes_asked", {}).setdefault(kind, []).append(today)
    person["once_last"] = today


def may_ask_again(days: list[str], today: str) -> bool:
    """A one-time question left unanswered is asked again once, weeks later."""
    if len(days) >= R.ASK_LIKES_TRIES:
        return False
    if not days:
        return True
    gap = date.fromisoformat(today) - date.fromisoformat(days[-1])
    return gap.days >= R.ASK_LIKES_AGAIN_DAYS


def mark_asked(person: dict[str, Any], today: str, hour: int) -> None:
    asked = person.get("asked") or {}
    if asked.get("day") != today:
        asked = {"day": today}
    asked["morning" if hour < 12 else "later"] = True
    person["asked"] = asked


def tomorrow(today: str) -> str:
    return (date.fromisoformat(today) + timedelta(days=1)).isoformat()
