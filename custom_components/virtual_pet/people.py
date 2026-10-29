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
from pathlib import Path
import statistics
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.storage import Store

from . import model, rates as R
from .backup import NOTHING, async_backup, async_clear_if_restored
from .const import DOMAIN, LOGGER

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
        self._hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self.data: dict[str, Any] = {"people": {}, "weather": {}}
        self._locks: dict[str, asyncio.Lock] = {}

    def lock(self, user: str) -> asyncio.Lock:
        """One look at a time per person, across every pet."""
        return self._locks.setdefault(user, asyncio.Lock())

    async def async_load(self) -> None:
        """Load what can be read. A damaged file never stops a pet: it's backed
        up, the pets start fresh with everyone, and a repair says how to restore
        it. Damage inside a readable file is dropped quietly, key by key."""
        try:
            loaded = await self._store.async_load()
        except Exception as err:  # noqa: BLE001 - a wrapper Store can't read
            LOGGER.warning("The people store couldn't be read: %s", type(err).__name__)
            LOGGER.debug("The people store couldn't be read", exc_info=err)
            await self._damaged(NOTHING)
            return
        if loaded is None:
            path = Path(self._hass.config.path(".storage", STORE_KEY))
            if await self._hass.async_add_executor_job(path.is_file):
                await self._damaged(NOTHING)  # "data": null, or an outer {}
            return  # otherwise none yet
        if not isinstance(loaded, dict):
            await self._damaged(loaded)
            return
        await async_clear_if_restored(self._hass, "people_damaged")
        weather = loaded.get("weather")
        self.data = {
            "people": {
                user: _person(record)
                for user, record in _mapping(loaded.get("people")).items()
                if isinstance(user, str) and isinstance(record, dict)
            },
            "weather": {
                day: [k for k in kinds if isinstance(k, str)]
                for day, kinds in _mapping(weather).items()
                if isinstance(day, str) and isinstance(kinds, list)
            },
        }

    async def _damaged(self, data: Any) -> None:
        backup = await async_backup(self._hass, STORE_KEY, STORE_VERSION, data)
        ir.async_create_issue(
            self._hass,
            DOMAIN,
            "people_damaged",
            is_fixable=False,
            is_persistent=True,
            severity=ir.IssueSeverity.WARNING,
            translation_key="people_damaged",
            translation_placeholders={
                "backup": backup or f"{STORE_KEY}.corrupt.<time>"
            },
        )
        await self.async_save_now()  # an empty store from now on, over the damage

    def save(self) -> None:
        self._store.async_delay_save(lambda: self.data, SAVE_DELAY)

    async def async_save_now(self) -> None:
        await self._store.async_save(self.data)

    async def forget(self, user: str) -> None:
        """Erase one person's record ("forget my data"), saved at once: a
        restart inside the save delay must not bring it back. Their lock stays
        (a visit may hold it); the household's weather is no one's. A refusal
        ("forget my birthday") survives: they are not asked again."""
        old = self.data["people"].pop(user, None)
        if old and old.get("birthday_skipped"):
            self.data["people"][user] = {"birthday_skipped": True}
        await self.async_save_now()

    def person(self, user: str) -> dict[str, Any]:
        return self.data["people"].setdefault(user, {})

    def my_day(self, user: str) -> bool:
        return bool(self.data["people"].get(user, {}).get("my_day"))

    def baby_talk(self, user: str) -> bool:
        """Simpler words from babies and children, on this person's cards."""
        return self.data["people"].get(user, {}).get("baby_talk") is True

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


def _mapping(v: Any) -> dict[Any, Any]:
    return v if isinstance(v, dict) else {}


def _num(v: Any) -> bool:
    return isinstance(v, int | float) and not isinstance(v, bool)


def _day_lists(v: Any) -> dict[str, list[str]]:
    return {
        k: [d for d in days if isinstance(d, str)]
        for k, days in _mapping(v).items()
        if isinstance(k, str) and isinstance(days, list)
    }


def _str_dict(v: Any) -> dict[str, str]:
    return {
        k: x
        for k, x in _mapping(v).items()
        if isinstance(k, str) and isinstance(x, str)
    }


# Each key a person's record uses, and the shape its readers expect. A key that
# doesn't match is dropped (the pets ask, or note it, again); keys this version
# doesn't know are kept as they are.
_PERSON_KEYS: dict[str, Any] = {
    "arrived": _num,
    "left": _num,
    "zone": lambda v: (
        isinstance(v, dict) and isinstance(v.get("name"), str) and _num(v.get("at"))
    ),
    "guess": lambda v: (
        isinstance(v, dict)
        and isinstance(v.get("day"), str)
        and isinstance(v.get("guess"), str)
    ),
    "my_day": lambda v: isinstance(v, bool),
    "baby_talk": lambda v: isinstance(v, bool),
    "birthday_phone": lambda v: isinstance(v, bool),
    "birthday_skipped": lambda v: isinstance(v, bool),
    "birthday": lambda v: isinstance(v, str) and model.valid_birthday(v),
    "birthday_sent": lambda v: isinstance(v, str),  # the year, "2026"
    "once_last": lambda v: isinstance(v, str),  # a day
    "asked": lambda v: isinstance(v, dict) and isinstance(v.get("day"), str),
}


def _person(record: dict[str, Any]) -> dict[str, Any]:
    """One person's record as loaded, with the shapes its readers expect."""
    out = dict(record)
    for key, ok in _PERSON_KEYS.items():
        if key in out and not ok(out[key]):
            del out[key]
    for key in ("noted", "likes"):
        if key in out:
            out[key] = _str_dict(out[key])
    if "likes_asked" in out:
        out["likes_asked"] = _day_lists(out["likes_asked"])
    if "sendoffs" in out:
        sendoffs = out["sendoffs"]
        out["sendoffs"] = (
            [d for d in sendoffs if isinstance(d, str)]
            if isinstance(sendoffs, list)
            else []
        )
    if "alarms" in out:
        alarms = out["alarms"]
        out["alarms"] = [
            [a[0], int(a[1])]
            for a in (alarms if isinstance(alarms, list) else [])
            if isinstance(a, list)
            and len(a) == 2
            and isinstance(a[0], str)
            and _num(a[1])
        ]
    return out


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
