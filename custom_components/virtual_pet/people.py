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
import random
import re
import statistics
from typing import Any
import unicodedata

from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import model, rates as R
from .backup import NOTHING, async_backup, async_clear_if_restored
from .const import CONF_MEMORY, DOMAIN, LOGGER

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
    # The phone question (top10 1a): the card says it showed it, and only then is
    # it asked for good (a question the card dropped comes again).
    "phone": ("shown",),
    # Follow-ups (fresh-expand F1): only the answers the pet comes back to reach the
    # server. how_day's "tough" is E13's soft morning; "great" reaches it only while the
    # person's memory is on (memory plan M1b: door 2, never a soft morning; the handler
    # refuses it otherwise); "ok" stays on the card.
    "how_day": ("tough", "great"),
    "big_day": ("yes", "no"),  # "anything big this week?" (owner Q3 A, opp #2)
    "big_how": ("tough", "great"),  # the big day's evening "how did it go?" (opp #1)
    "weekend": ("yes", "no"),  # F5; "no" is the card's "not really"
    "game": ("left_right", "higher_lower", "dig"),  # F6: the choice (model.GAMES)
    "trick": ("yes", "later"),  # F7; "later" is the card's "maybe later"
    # The one-time memory ask (memory plan M1b): "shown" as the phone's, then the
    # person's answer. Not in ONCE: it is counted only on "shown" (M1 S3).
    "memory": ("shown", "yes", "not_now"),
}
# One-time questions about the person, in the order they're asked, with the bond
# level each needs. (The pet's own one-time question, its catchphrase, comes from
# the coordinator: its tries live in the pet's bond.)
ONCE = (
    ("fav_weather", R.ASK_LIKES_LEVEL),
    ("fav_season", R.ASK_LIKES_LEVEL),
    # Per world (fresh-expand F4): done once likes has visitor_<world>; its tries are
    # keyed fav_visitor_<world>, so a pet in a new world asks again.
    ("fav_visitor", R.ASK_LIKES_LEVEL),
    ("birthday", R.BIRTHDAY_ASK_LEVEL),
)
ONCE_KINDS = {kind for kind, _ in ONCE} | {"catchphrase"}
# The memory ask: once_due tries it after ONCE (so after the birthday), and only where
# the pet allows memory (choose_question's memory_ask). Its own tuple, never in ONCE,
# so _question's mark_once never counts it before the card says it showed it.
MEMORY_ASK = ("memory", R.MEMORY_ASK_LEVEL)
# The favourites a person can have the pet ask again (memory plan M0-c).
ASK_AGAIN_KINDS = ("fav_weather", "fav_season", "fav_visitor")


def fav_visitor_key(world: str | None) -> str:
    """likes' key for a world's favourite visitor (an id from worlds.json)."""
    return f"visitor_{world}"


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

# --- Follow-ups (fresh-expand F1) ------------------------------------------------
# Retention by class, in one place. mood: memory only (People._moods), the next local
# day. event: saved without its text (person["follow"]["event"]), until its last beat,
# at most FOLLOW_EVENT_MAX_DAYS; its typed text memory only (People._texts). The
# preference class (a favourite visitor, F4) lives in likes.
FOLLOW_CLASSES: dict[str, tuple[str, ...]] = {
    "mood": ("soft",),
    "event": ("big_day", "weekend", "game", "trick"),
}
FOLLOW_EVENT_MAX_DAYS = 7
FOLLOW_ASK_PER_WEEK = 2  # follow-up asks per person per 7 days
# A kind asked this many times in a row without a "yes" (no answer, "no", "later") rests
# FOLLOW_REST_DAYS before it's asked again; a "yes" starts the count over (critique #6).
FOLLOW_MISSES = 2
FOLLOW_REST_DAYS = 14
FOLLOW_TEXT_MAX = 20  # code points of a typed answer ({it})
# Each kind's beats, in order; the last one said closes the event.
FOLLOW_BEATS: dict[str, tuple[str, ...]] = {
    "soft": ("morning",),
    "big_day": ("morning", "evening"),
    "weekend": ("monday",),  # F5: Monday's first look (or Tuesday's)
    "game": ("day",),  # F6: when the picker opens, the day after
    "trick": ("shown",),  # F7: a first look from day 3 to day 5
}
# A big day's morning beat before this hour, its evening beat from it: late enough that
# the day is likely over (a recital, a match, a late shift; critique s2632 #4).
FOLLOW_EVENING_HOUR = 19
# Questions whose one answer closes the later slot (the dated follow-ups answer twice:
# "yes", then their typed step; a trick says "later", then may say "yes").
SLOT_CLOSED_BY_ANSWER = ("how_day", "big_how", "game")
# The follow-up questions (asked in the later slot) in the order they're tried, those
# that take a typed text, and a pet's own (said only by the pet that asked).
FOLLOW_QUESTIONS = ("weekend", "big_day", "trick", "game")
# The house's dated asks: only these count against FOLLOW_ASK_PER_WEEK, so a pet's own
# game and trick asks can't use up the week before Friday or Sunday (audit s2635 M2).
FOLLOW_DATED = ("weekend", "big_day")
FOLLOW_TEXT_KINDS = {"big_day", "weekend"}
FOLLOW_PET_KINDS = {"game", "trick"}
# Where a beat is fetched: a first look (or a tab's return), or the game picker (F6).
FOLLOW_AT = {"look": ("soft", "big_day", "weekend", "trick"), "picker": ("game",)}
TRICK_DUE_DAYS = 3  # F7: shown from the 3rd day after the yes
TRICK_UNTIL_DAYS = 5  # to the 5th
# Questions whose answer the server checks against today's later ask.
LATER_CHECKED = {"how_day", "big_how", *FOLLOW_QUESTIONS}
# "memory": the one-time memory ask (memory plan M1b); kept as a saved later_kind.
QUESTION_KINDS = {*QUESTIONS, *ANSWERS, *FOLLOW_QUESTIONS, "phone", "memory"}
BIG_DAY_ASK_DAYS = (6, 0)  # "anything big this week?": Sunday or Monday (weekday())
BIG_DAY_AHEAD = 6  # its answer: one of the next 6 days
# Its weekly gap: a Monday's ask, then the next Sunday's (a 7-day gap would push every
# week after a Monday ask to Monday, lost when that's the rotation's how_day; audit M2).
BIG_DAY_GAP = 6
# --- Memory (memory plan 2026-11-02, M1a) -------------------------------------------
# person["memory"], only while the person has turned it on: picks and fixed tags with
# their dates, never words or names (owner Q1 C), kept until forgotten and capped by
# count only (Q4 C). Every value is from a fixed list or an ISO date; anything else is
# dropped on load, entry by entry (R5).
MEMORY_TAG_KINDS = ("big_day", "weekend")
# The big day and weekend tags (draft labels, M2): keys, never free text. No
# "appointment" (plan section 4).
MEMORY_TAGS = (
    "test",
    "match",
    "show",
    "trip",
    "party",
    "lesson",
    "work_thing",
    "something_else",
)
MEMORY_TAGS_CAP = 120
MEMORY_PICKS_CAP = 5
# Each picks list and what its entries hold beside their day.
MEMORY_PICKS: dict[str, tuple[str, tuple[str, ...]]] = {
    "dream": ("pick", ANSWERS["dream"]),
    "game": ("pick", ANSWERS["game"]),
    "guess": ("pick", ANSWERS["guess"]),
    "great": ("ask", ("how_day", "big_how")),
}
MEMORY_LISTS = ("tags", *MEMORY_PICKS)
# since_told keys: a favourite told while memory is on (weather, season, a world's
# visitor); said keys: the last day a door's line was said (door 6, one per favourite).
_SINCE_TOLD = re.compile(r"fav_weather|fav_season|visitor_[a-z0-9_]{1,32}")
_MEMORY_SAID = re.compile(r"door(?:[1-9]|1[0-2])(?:_fav_weather|_fav_season)?")
_PET_ID = re.compile(r"[A-Za-z0-9_]{1,64}")
_SPACES = re.compile(r"\s+")
# Said inside a line ("good luck with {it}! ♥"): no trailing punctuation or emoticon of
# their own (critique #8), as the card's cleanTyped.
_TAIL = re.compile(r"(?:\s*(?:[.!?,;:]+|[:;=]-?[()DPpOo/|\\\[\]]|<3))+$")


class People:
    """The shared store (hass.data[DOMAIN]["people"])."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self.data: dict[str, Any] = {"people": {}, "weather": {}}
        self._locks: dict[str, asyncio.Lock] = {}
        # Memory only, never in self.data (so never on disk, in a backup or a
        # .corrupt copy, nor kept by an older version): a follow-up's typed text,
        # and a mood ({kind, day}). A restart drops both (fresh-expand F1, E13).
        self._texts: dict[str, str] = {}
        self._moods: dict[str, dict[str, str]] = {}
        self._pruned: str | None = None  # the local date prune last ran for

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
        if house := _house(loaded.get("house")):
            self.data["house"] = house
        raw = _mapping(loaded.get("people"))
        dropped = any(
            isinstance(r, dict)
            and (
                r.get("follow") != record.get("follow")
                or r.get("memory") != record.get("memory")
            )
            for u, record in self.data["people"].items()
            if isinstance(r := raw.get(u), dict)
        )
        if self.prune(model_today(self._hass)) or dropped:
            # An expired or bad follow-up isn't kept, nor a bad memory entry (R5).
            await self.async_save_now()

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
        ("forget my birthday") survives: they are not asked again. So does the
        memory ask's (memory plan M1, content-free): their memory goes with the rest."""
        old = self.data["people"].pop(user, None)
        kept = {k: old[k] for k in _FORGET_KEEPS if old and old.get(k)}
        if kept:
            self.data["people"][user] = kept
        self._texts.pop(user, None)  # memory only: gone with the record
        self._moods.pop(user, None)
        await self.async_save_now()

    def person(self, user: str) -> dict[str, Any]:
        return self.data["people"].setdefault(user, {})

    # --- The pet a card opens on (plan favourite-resting §5) ----------------------
    # A pet's config-entry id. Ranks nothing: it is only where this person's card
    # opens, and which pet speaks for them on their phone. A stale id (a removed
    # pet) matches no pet, so it is ignored on read; the next write replaces it.

    def open_on(self, user: str) -> str | None:
        pet = self.data["people"].get(user, {}).get("open_on")
        return pet if isinstance(pet, str) else None

    def house_open_on(self) -> str | None:
        """Where shared screens open: the household's, no person's."""
        pet = self.data.get("house", {}).get("open_on")
        return pet if isinstance(pet, str) else None

    def set_open_on(self, user: str | None, pet_id: str | None) -> None:
        """Set (or, with None, clear) one person's choice, or the house's (user
        None). Not saved: the caller saves."""
        if user is None:
            house = self.data.setdefault("house", {})
            target = house
        else:
            target = self.person(user)
        if pet_id is None:
            target.pop("open_on", None)
        else:
            target["open_on"] = pet_id
        if user is None and not self.data["house"]:
            del self.data["house"]  # an empty house isn't kept

    def drop_open_on(self, pet_id: str) -> bool:
        """A pet was removed: no person's choice and no house default names it
        any more. True if anything changed."""
        changed = False
        for person in self.data["people"].values():
            if person.get("open_on") == pet_id:
                del person["open_on"]
                changed = True
        if self.house_open_on() == pet_id:
            self.set_open_on(None, None)
            changed = True
        return changed

    def my_day(self, user: str) -> bool:
        return bool(self.data["people"].get(user, {}).get("my_day"))

    def baby_talk(self, user: str) -> bool:
        """Simpler words from babies and children, on this person's cards."""
        return self.data["people"].get(user, {}).get("baby_talk") is True

    # --- Memory (memory plan M1a) ----------------------------------------------------
    # Read with .get, never person(): its setdefault would bring back a forgotten
    # record. A writer checks memory is there and writes with no await between, so an
    # answer landing during an "off" save finds nothing and writes nothing (review S6).

    def memory(self, user: str) -> dict[str, Any] | None:
        """This person's memory, or None while it is off."""
        mem = self.data["people"].get(user, {}).get("memory")
        return mem if isinstance(mem, dict) else None

    def memory_on(self, user: str) -> bool:
        return self.memory(user) is not None

    def set_memory(self, user: str, on: bool, today: str) -> bool:
        """Turn this person's memory on (an empty record, dated) or off (popped:
        the caller saves at once). True if it changed."""
        if not on:
            person = self.data["people"].get(user)
            return bool(person) and person.pop("memory", None) is not None
        if self.memory_on(user):
            return False
        self.person(user)["memory"] = {"on": True, "since": today}
        return True

    def remember(self, user: str, kind: str, entry: dict[str, Any]) -> bool:
        """Keep one entry while their memory is on (sync: the caller's lock, or no
        await, is the guard). One per key: a second for the same day (and kind, for
        a tag) replaces it; the oldest goes past the cap, at once (M1 S7). An entry
        not of the fixed shape is refused. True if kept."""
        mem = self.memory(user)
        if mem is None or not _memory_entry_ok(kind, entry):
            return False
        entry = dict(entry)
        if kind == "tags":
            entries = mem.setdefault("tags", [])
        else:
            entries = mem.setdefault("picks", {}).setdefault(kind, [])
        key = _memory_key(kind, entry)
        entries[:] = [e for e in entries if _memory_key(kind, e) != key]
        entries.append(entry)
        _cap(kind, entries)
        self.save()
        return True

    async def forget_item(
        self, user: str, kind: str, day: str, tag_kind: str | None = None
    ) -> bool:
        """Forget one remembered entry, by its key (list and day; a tag's kind
        too), saved at once. True if one was there."""
        mem = self.memory(user)
        if mem is None or kind not in MEMORY_LISTS:
            return False
        entries = (
            mem.get("tags") if kind == "tags" else (mem.get("picks") or {}).get(kind)
        )
        if not entries:
            return False
        key = (day, tag_kind) if kind == "tags" else (day,)
        kept = [e for e in entries if _memory_key(kind, e) != key]
        if len(kept) == len(entries):
            return False
        entries[:] = kept
        await self.async_save_now()
        return True

    async def forget_memory(self, user: str) -> bool:
        """Memory off: popped first, then saved at once (R7). True if it was on."""
        gone = self.set_memory(user, False, "")
        if gone:
            await self.async_save_now()
        return gone

    async def forget_all_memory(self) -> int:
        """The admin erase (plan section 5): every person's memory, popped with no
        await between, then saved at once. How many records had one."""
        gone = sum(
            person.pop("memory", None) is not None
            for person in self.data["people"].values()
        )
        await self.async_save_now()
        return gone

    def memory_said(self, user: str, key: str) -> str | None:
        """The last day a door's line was said to them (M1 S2): in memory only,
        never `noted`, so "off" takes it."""
        return ((self.memory(user) or {}).get("said") or {}).get(key)

    def mark_memory_said(self, user: str, key: str, day: str) -> bool:
        """A door's line said today; nothing without a memory record."""
        mem = self.memory(user)
        if mem is None or not _MEMORY_SAID.fullmatch(key) or not _memory_day(day):
            return False
        mem.setdefault("said", {})[key] = day
        self.save()
        return True

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

    # --- Follow-ups (fresh-expand F1) --------------------------------------------

    def prune(self, today: str) -> bool:
        """Each class past its limit goes: an event after its until day (its text
        with it), a mood after the day it's for, follow-up asks older than a week.
        True if the saved data changed."""
        changed = False
        day = date.fromisoformat(today)
        for user, person in self.data["people"].items():
            event = (person.get("follow") or {}).get("event")
            if event and date.fromisoformat(event["until"]) < day:
                del person["follow"]["event"]
                if not person["follow"]:
                    del person["follow"]
                self._texts.pop(user, None)
                changed = True
            if (mem := person.get("memory")) and _cap_memory(mem):
                changed = True  # memory has no time limit (Q4 C): only the caps
            asked = person.get("follow_asked")
            if asked:
                kept = [d for d in asked if (day - date.fromisoformat(d)).days < 7]
                if kept != asked:
                    person["follow_asked"] = kept
                    changed = True
        for user, mood in list(self._moods.items()):
            if (day - date.fromisoformat(mood["day"])).days > 1:
                del self._moods[user]
        for user in list(self._texts):
            event = (self.data["people"].get(user, {}).get("follow") or {}).get("event")
            if not event or event["kind"] not in FOLLOW_TEXT_KINDS:
                del self._texts[user]
        self._pruned = today
        return changed

    def prune_daily(self, today: str) -> None:
        """Once per house per local date (the first tick that sees it)."""
        if self._pruned != today and self.prune(today):
            self.save()

    def open_event(self, user: str) -> dict[str, Any] | None:
        return (self.data["people"].get(user, {}).get("follow") or {}).get("event")

    def set_mood(self, user: str, today: str) -> None:
        """A tough day (E13): a softer morning tomorrow, kept in memory only, as
        a date: not the answer, not a time."""
        self._moods[user] = {"kind": "soft", "day": today}

    def open_follow(
        self, user: str, kind: str, today: str, text: Any = None, **extra: str
    ) -> None:
        """A "yes" to a follow-up question: the event, due by its kind (big day
        and game tomorrow, a weekend on Monday to Tuesday, a trick day 3 to 5). A
        second answer in a race replaces the open record (asks never come while one
        is open). The typed text, cleaned, is kept in memory only."""
        due, until = follow_dates(kind, today)
        if kind == "big_day" and (day := big_day_pick(today, extra.pop("day", None))):
            due = until = day  # the day they picked this week (opp #2)
        event = {"kind": kind, "asked": today, "due": due, "until": until, "said": []}
        event.update(extra)
        person = self.person(user)
        person.setdefault("follow", {})["event"] = event
        person.get("follow_miss", {}).pop(kind, None)  # answered: no rest
        self._texts.pop(user, None)
        if kind in FOLLOW_TEXT_KINDS and (cleaned := clean_text(text)):
            self._texts[user] = cleaned
        self.save()

    def follow_due(
        self,
        user: str,
        today: str,
        hour: int,
        pet: str | None = None,
        at: str = "look",
    ) -> dict[str, Any]:
        """The beat due for this person now, marked said (the caller holds their
        lock, with no await before this returns): {kind, beat, text?, choice?}, {} or
        {"deferred": True} (a big day's evening waiting on an open question). At a look an event's beat comes before a mood's (the next look gets the
        other); at the picker only a game's."""
        if self.prune(today):
            self.save()
        person = self.data["people"].get(user, {})
        event = (person.get("follow") or {}).get("event")
        kinds = FOLLOW_AT.get(at, ())
        if (
            event
            and event["kind"] in kinds
            and (beat := _event_beat(event, today, hour, pet))
        ):
            if (
                event["kind"] == "big_day"
                and beat == "evening"
                and (person.get("asked") or {}).get("day") == today
                and (person.get("asked") or {}).get("later_kind")
            ):
                # Audit 0.43.0 F-01: today's later slot still holds an unanswered
                # question; the evening's ask would take its answer. Leave the beat
                # unsaid, and say so ({"deferred": True}, no kind): the card tries again on
                # a later tick, once it is answered, not marking its day as tried.
                return {"deferred": True}
            event["said"].append(beat)
            out = {"kind": event["kind"], "beat": beat}
            if event["kind"] == "big_day" and beat == "evening":
                # Audit s2635 H1: the evening is "how did it go?" (opp #1), asked by the
                # card in this beat's place (the plain line only when it can't show).
                # Its later slot is taken for the answer, even if used earlier today.
                out["ask"] = "big_how"
                mark_asked(person, today, max(hour, 12), "big_how")
            if user in self._texts:
                out["text"] = self._texts[user]
            if "choice" in event:
                out["choice"] = event["choice"]
            if beat == FOLLOW_BEATS[event["kind"]][-1]:
                del person["follow"]["event"]  # its last beat: done
                if not person["follow"]:
                    del person["follow"]
                self._texts.pop(user, None)
            self.save()
            return out
        if self._mood_due(user, today, hour, kinds):
            del self._moods[user]
            return {"kind": "soft", "beat": "morning"}
        return {}

    @staticmethod
    def follow_clock(today: str, hour: int) -> dict[str, Any]:
        """The server's day and whether it is the evening here (audit 0.43.0 F-03):
        the card gates the evening fetch on this, not its browser's clock. No
        person, kind or text in it."""
        return {"follow_day": today, "follow_evening": hour >= FOLLOW_EVENING_HOUR}

    def _mood_due(
        self, user: str, today: str, hour: int, kinds: tuple[str, ...]
    ) -> bool:
        """A tough day's softer morning is due: the next day, from the morning
        hour (audit s2635 L1: not a night owl's 00:20 look)."""
        mood = self._moods.get(user)
        return bool(
            mood
            and mood["kind"] in kinds
            and hour >= R.ASK_MORNING_FROM
            and date.fromisoformat(mood["day"]) + timedelta(days=1)
            == date.fromisoformat(today)
        )

    def follow_at(self, user: str, today: str, hour: int, pet: str | None) -> list[str]:
        """Where a beat is waiting for this person now, from this pet ("look",
        "picker"): so their card keeps a first-look slot only then (audit s2635
        L2: a big day's evening waits for its hour, not all afternoon). The
        channel pushes it again when the hour brings one. No kind, no text: only
        that something is."""
        out = set()
        event = self.open_event(user)
        if event and _event_beat(event, today, hour, pet):
            out.add("picker" if event["kind"] == "game" else "look")
        if self._mood_due(user, today, hour, ("soft",)):
            out.add("look")
        return sorted(out)


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


# What "forget my data" keeps: refusals with no content, so nobody is asked again.
_FORGET_KEEPS = ("birthday_skipped", "memory_asked", "memory_chosen_days")


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
    "phone_asked": lambda v: isinstance(v, bool),  # the phone question (top10 1a)
    "open_on": lambda v: isinstance(v, str),  # a pet's entry id (favourite §5.2)
    # The memory ask (memory plan M1): answered, and the days it was offered unshown.
    "memory_asked": lambda v: isinstance(v, bool),
    "memory_chosen_days": lambda v: (
        isinstance(v, list)
        and len(v) <= R.MEMORY_CHOSEN_KEPT
        and all(_memory_day(d) for d in v)
    ),
}


def _house(v: Any) -> dict[str, Any]:
    """The house's own record: an optional `open_on` (a pet's entry id). The
    wrong shape is dropped quietly, as a person's keys are; keys this version
    doesn't know are kept."""
    house = dict(_mapping(v))
    if "open_on" in house and not isinstance(house["open_on"], str):
        del house["open_on"]
    return house


def _iso(v: Any) -> date | None:
    try:
        return date.fromisoformat(v) if isinstance(v, str) else None
    except ValueError:
        return None


def _memory_day(v: Any) -> bool:
    """A day in memory's records: the canonical YYYY-MM-DD only (`fromisoformat` also
    takes 20261101 and 2026-W44-1, which would twin a day and sort oddly). No test
    against today: a box that boots with a stale clock would erase real days."""
    d = _iso(v)
    return d is not None and d.isoformat() == v


_EVENT_KEYS = {"kind", "asked", "due", "until", "said", "choice", "pet"}


def _event_ok(v: Any) -> bool:
    """A saved follow-up event (F1): known kind, dates in order and at most a
    week, beats of its kind, no text (memory only), no other key."""
    if not isinstance(v, dict) or not set(v) <= _EVENT_KEYS:
        return False
    kind = v.get("kind")
    if kind not in FOLLOW_CLASSES["event"]:
        return False
    asked, due, until = (_iso(v.get(k)) for k in ("asked", "due", "until"))
    if asked is None or due is None or until is None:
        return False
    if not asked <= due <= until or (until - asked).days > FOLLOW_EVENT_MAX_DAYS:
        return False
    said = v.get("said")
    if not isinstance(said, list) or not all(b in FOLLOW_BEATS[kind] for b in said):
        return False
    if ("choice" in v) != (kind == "game") or (
        kind == "game" and v["choice"] not in ANSWERS["game"]
    ):
        return False
    if kind in FOLLOW_PET_KINDS:
        return isinstance(v.get("pet"), str)
    return "pet" not in v


def _follow(v: Any) -> dict[str, Any]:
    """The saved follow-up classes, each dropped on its own if bad. Only events
    are saved: a mood (or anything else) in the store is dropped."""
    out = {}
    if isinstance(v, dict) and _event_ok(v.get("event")):
        out["event"] = v["event"]
    return out


def _memory_key(kind: str, entry: dict[str, Any]) -> tuple[Any, ...]:
    """One entry per key: (day, kind) for a tag, the day for a pick."""
    return (
        (entry.get("day"), entry.get("kind")) if kind == "tags" else (entry.get("day"),)
    )


def _memory_entry_ok(kind: str, v: Any) -> bool:
    """A remembered entry: exactly its keys, a real date, a fixed-list value."""
    if not isinstance(v, dict) or not _memory_day(v.get("day")):
        return False
    if kind == "tags":
        return (
            set(v) == {"day", "kind", "tag"}
            and v["kind"] in MEMORY_TAG_KINDS
            and v["tag"] in MEMORY_TAGS
        )
    if kind not in MEMORY_PICKS:
        return False
    field, values = MEMORY_PICKS[kind]
    return set(v) == {"day", field} and v[field] in values


def _cap(kind: str, entries: list[dict[str, Any]]) -> bool:
    """Oldest first (by day, a tag's kind after); the oldest go past the cap."""
    cap = MEMORY_TAGS_CAP if kind == "tags" else MEMORY_PICKS_CAP
    before = list(entries)
    entries.sort(key=lambda e: _memory_key(kind, e))
    del entries[: max(0, len(entries) - cap)]
    return entries != before


def _cap_memory(mem: dict[str, Any]) -> bool:
    """The caps over a whole memory record (the daily prune's step). True if changed."""
    changed = False
    if isinstance(mem.get("tags"), list):
        changed |= _cap("tags", mem["tags"])
    for kind, entries in (mem.get("picks") or {}).items():
        if isinstance(entries, list):
            changed |= _cap(kind, entries)
    return changed


def _memory(v: Any) -> dict[str, Any] | None:
    """A saved memory record as loaded (R5, R6): only while on; each entry kept
    or dropped on its own; one per key (the later wins); the caps applied. None:
    no memory (missing, off, or not a record)."""
    if not isinstance(v, dict) or v.get("on") is not True:
        return None
    out: dict[str, Any] = {"on": True}
    if _memory_day(v.get("since")):
        out["since"] = v["since"]
    lists: dict[str, list[dict[str, Any]]] = {}
    raw_picks = _mapping(v.get("picks"))
    for kind in MEMORY_LISTS:
        raw = v.get("tags") if kind == "tags" else raw_picks.get(kind)
        seen: dict[tuple[Any, ...], dict[str, Any]] = {}
        for entry in raw if isinstance(raw, list) else []:
            if _memory_entry_ok(kind, entry):
                key = _memory_key(kind, entry)
                seen.pop(key, None)
                seen[key] = dict(entry)
        if seen:
            lists[kind] = list(seen.values())
            _cap(kind, lists[kind])
    if "tags" in lists:
        out["tags"] = lists.pop("tags")
    if lists:
        out["picks"] = lists
    since_told = {
        k: d
        for k, d in _str_dict(v.get("since_told")).items()
        if _SINCE_TOLD.fullmatch(k) and _memory_day(d)
    }
    if since_told:
        out["since_told"] = since_told
    said = {
        k: d
        for k, d in _str_dict(v.get("said")).items()
        if _MEMORY_SAID.fullmatch(k) and _memory_day(d)
    }
    if said:
        out["said"] = said
    heard = v.get("heard")
    if (
        isinstance(heard, dict)
        and set(heard) == {"day", "pet"}
        and _memory_day(heard["day"])
        and isinstance(heard["pet"], str)
        and _PET_ID.fullmatch(heard["pet"])
    ):
        out["heard"] = dict(heard)
    return out


def _person(record: dict[str, Any]) -> dict[str, Any]:
    """One person's record as loaded, with the shapes its readers expect."""
    out = dict(record)
    for key, ok in _PERSON_KEYS.items():
        if key in out and not ok(out[key]):
            del out[key]
    if "memory" in out:
        memory = _memory(out["memory"])
        if memory is None:
            del out["memory"]
        else:
            out["memory"] = memory
    if "follow" in out:
        out["follow"] = _follow(out["follow"])
        if not out["follow"]:
            del out["follow"]
    asked = out.get("asked")
    if asked and "later_kind" in asked and asked["later_kind"] not in QUESTION_KINDS:
        out["asked"] = {k: x for k, x in asked.items() if k != "later_kind"}
    if "follow_asked" in out:
        days = out["follow_asked"]
        out["follow_asked"] = [
            d for d in (days if isinstance(days, list) else []) if _iso(d)
        ]
    if "follow_last" in out:
        out["follow_last"] = {
            k: d
            for k, d in _str_dict(out["follow_last"]).items()
            if k in FOLLOW_QUESTIONS and _iso(d)
        }
    if "follow_miss" in out:
        out["follow_miss"] = {
            k: n
            for k, n in _mapping(out["follow_miss"]).items()
            if k in FOLLOW_QUESTIONS and isinstance(n, int) and 0 < n < 100
        }
    if out.get("my_day") is not True:
        out.pop("zone", None)  # older saves: kept only while "my day" is on
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


def season_start(day: date, latitude: float) -> tuple[str, str] | None:
    """The season begun within R.SEASON_START_DAYS (its first day or the next
    two), as (season_key, name); None later in a season and in the tropics. A
    pet away for those days misses it quietly: no late "it's spring!" in May."""
    name = season(day, latitude)
    if name is None:
        return None
    if all(
        season(day - timedelta(days=k), latitude) == name
        for k in range(1, R.SEASON_START_DAYS + 1)
    ):
        return None
    key = season_key(day, latitude)
    assert key is not None
    return key, name


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
    dreamed: bool = False,
    world: str | None = None,
    pet_kinds: tuple[str, ...] = (),
    memory_ask: bool = False,
) -> str | None:
    """The question to ask on this visit, or None: at most one in the morning
    (before noon) and one later, per person per day, across every pet. A
    one-time question that's due comes first in the later slot; pet_once are
    the pet's own still open for this person. dreamed: the pet has a dream to
    tell this morning, which is its morning's say instead of "did you sleep
    well?" on alternate days (by the day), so that's still asked about half
    the mornings. memory_ask: the pet allows memory (its option), so the memory
    ask may be due."""
    if level < R.ASK_LEVEL:
        return None
    asked = person.get("asked") or {}
    if asked.get("day") != today:
        asked = {"day": today}
    if hour < 12:
        # A dream to tell is the morning's say on alternate days only (by the day), so
        # "did you sleep well?" still comes about half the mornings (FM, 5b review).
        dream_says = dreamed and date.fromisoformat(today).toordinal() % 2 == 0
        if "morning" in asked or rested or dream_says or hour < R.ASK_MORNING_FROM:
            return None
        return "slept"
    if "later" in asked:
        return None
    if once := once_due(person, today, hour, level, pet_once, world, memory_ask):
        return once
    if came_home in DAY_ZONES or came_home == "home":
        # Back from work or school, or a friend just home. A due dated follow-up (weekend,
        # big day) goes first, at any hour: it takes the place of the how_day asked at
        # this same hour, because the 16:00 floor would close the later slot on a 15:00
        # arrival and lose the ask for the day (memory plan M0-a, first mate 2026-11-02,
        # re-deciding FM Q1 A on the reconcile). Trick and game stay after (dated_only).
        return follow_question(person, today, dated_only=True) or "how_day"
    kind = rotation(date.fromisoformat(today))
    if kind == "how_day" and hour >= R.ASK_DAY_FROM:
        return "how_day"
    # A due follow-up (F1, FM Q1 A on the reconcile) takes the place of the day's dream
    # or guess, asked now or not, or of the fallback how_day; never of the rotation's
    # own how_day or a one-time question; a due dated one also goes before a came-home
    # how_day (above, M0-a). Capped by the week.
    if hour >= R.ASK_DAY_FROM and (
        follow := follow_question(person, today, pet_kinds=pet_kinds)
    ):
        return follow
    if kind == "dream" and 0 < to_bed_minutes <= R.ASK_DREAM_BEFORE_BED_MINUTES:
        return "dream"
    if kind == "guess" and has_forecast and hour >= R.ASK_GUESS_FROM:
        return "guess"
    # Today's dream or guess can't be asked now (the dream before its window, a guess
    # with no forecast or too early): how_day stands in on ASK_FALLBACK_DAYS of every 7
    # (fresh-moment 5b), so most evenings get a question but it isn't nightly.
    # The rotation's own how_day days, above, aren't capped.
    # Still one later question a day: "later" is marked either way.
    if fallback_day(date.fromisoformat(today)) and hour >= R.ASK_DAY_FROM:
        return "how_day"
    return None


def fallback_day(day: date) -> bool:
    """One of the ASK_FALLBACK_DAYS weekdays of its ISO week that how_day may
    stand in on, drawn per week (audit 2026-11-01b B4), so it isn't always the
    same evenings of the week."""
    year, week, _ = day.isocalendar()
    days = random.Random(f"ask|{year}-{week}").sample(range(7), R.ASK_FALLBACK_DAYS)
    return day.weekday() in days


def once_due(
    person: dict[str, Any],
    today: str,
    hour: int,
    level: int,
    pet_once: tuple[str, ...] = (),
    world: str | None = None,
    memory_ask: bool = False,
) -> str | None:
    """A one-time question due now: each has its own tries, so one left
    unanswered never holds up the next; a few days apart per person. The
    favourite visitor is asked per world (the pet's; none without one). The
    memory ask comes after ONCE, where the pet allows it (memory_ask)."""
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
    if world is None or fav_visitor_key(world) in likes:
        done.add("fav_visitor")
    for kind, need in ONCE:
        key = f"fav_visitor_{world}" if kind == "fav_visitor" else kind
        if (
            level >= need
            and kind not in done
            and may_ask_again(tries.get(key, []), today)
        ):
            return kind
    if memory_ask and memory_ask_due(person, today, level):
        return MEMORY_ASK[0]
    return pet_once[0] if pet_once else None


def memory_ask_due(person: dict[str, Any], today: str, level: int) -> bool:
    """Whether the memory ask may be chosen (plan section 5, M1b): from its level,
    not once answered (`memory_asked`, which survives off and forget-me), not while
    memory is on or baby talk is (FM Q-D), within its tries (counted on "shown"),
    and chosen unshown on fewer than MEMORY_ASK_CHOSEN of the last
    ASK_LIKES_AGAIN_DAYS days (an old card that never says "shown", M1 S3)."""
    if (
        level < MEMORY_ASK[1]
        or person.get("memory_asked")
        or person.get("baby_talk")
        or isinstance(person.get("memory"), dict)
        or not may_ask_again((person.get("likes_asked") or {}).get("memory", []), today)
    ):
        return False
    now = date.fromisoformat(today)
    recent = [
        d
        for d in person.get("memory_chosen_days") or []
        if 0 <= (now - date.fromisoformat(d)).days < R.ASK_LIKES_AGAIN_DAYS
    ]
    return len(recent) < R.MEMORY_ASK_CHOSEN


# The pick doors (plan section 6): door, picks list, how many of its newest
# MEMORY_PICKS_CAP must be the same pick. In door-number order.
MEMORY_PICK_DOORS = (
    ("door4", "dream", 3),
    ("door5", "guess", 5),
    ("door12", "game", 3),
)


def memory_door(
    mem: dict[str, Any], today: str, hour: int
) -> tuple[str, dict[str, Any]] | None:
    """The memory door due on this look, the lowest-numbered first (plan section 6,
    "Door timing"; door 6 rides the favourite's own note): (its said key, its note).
    A note holds its kind and at most one fixed-list pick, never a day (FM Q1). Door
    2: a great day yesterday, before noon, once for it. Doors 4, 5, 12: a repeated
    pick, in the day's window, at most once a week and only with a pick made since
    it was last said (so a habit long over isn't said week after week)."""
    said = mem.get("said") or {}
    picks = mem.get("picks") or {}
    now = date.fromisoformat(today)
    yesterday = (now - timedelta(days=1)).isoformat()
    if (
        hour < R.MEMORY_DOOR2_UNTIL
        and said.get("door2") != today
        and any(e.get("day") == yesterday for e in picks.get("great") or [])
    ):
        return "door2", {"kind": "door2"}
    if not R.MEMORY_DOORS_FROM <= hour < R.MEMORY_DOORS_UNTIL:
        return None
    for door, kind, need in MEMORY_PICK_DOORS:
        entries = sorted(picks.get(kind) or [], key=lambda e: e["day"])
        entries = entries[-MEMORY_PICKS_CAP:]
        last = said.get(door)
        if last and (
            (now - date.fromisoformat(last)).days < R.MEMORY_DOOR_GAP_DAYS
            or not entries
            or entries[-1]["day"] <= last
        ):
            continue
        field = MEMORY_PICKS[kind][0]
        counts: dict[str, int] = {}
        for e in entries:
            counts[e[field]] = counts.get(e[field], 0) + 1
        for pick, n in counts.items():
            if n >= need:
                return door, {"kind": door, "pick": pick}
    return None


def memory_chosen(person: dict[str, Any], today: str) -> None:
    """The memory ask was chosen today, not yet shown: its day kept (one a day, the
    newest MEMORY_CHOSEN_KEPT, so the loader's bound never drops the list)."""
    days = [d for d in person.get("memory_chosen_days") or [] if d != today]
    person["memory_chosen_days"] = [*days, today][-R.MEMORY_CHOSEN_KEPT :]


def mark_once(
    person: dict[str, Any], kind: str, today: str, world: str | None = None
) -> None:
    """A one-time question was asked today (its tries; the gap to the next). The
    memory ask is marked so only on the card's "shown" (async_answer)."""
    if kind in dict(ONCE) or kind == MEMORY_ASK[0]:
        key = f"fav_visitor_{world}" if kind == "fav_visitor" else kind
        person.setdefault("likes_asked", {}).setdefault(key, []).append(today)
    person["once_last"] = today


def may_ask_again(days: list[str], today: str) -> bool:
    """A one-time question left unanswered is asked again once, weeks later."""
    if len(days) >= R.ASK_LIKES_TRIES:
        return False
    if not days:
        return True
    gap = date.fromisoformat(today) - date.fromisoformat(days[-1])
    return gap.days >= R.ASK_LIKES_AGAIN_DAYS


def mark_asked(
    person: dict[str, Any], today: str, hour: int, kind: str | None = None
) -> None:
    """A question was asked today. The later slot keeps its kind, so an answer
    the server acts on is taken only for today's ask (F1, review #2); a
    follow-up ask is counted for the week."""
    asked = person.get("asked") or {}
    if asked.get("day") != today:
        asked = {"day": today}
    asked["morning" if hour < 12 else "later"] = True
    if hour >= 12 and kind is not None:
        asked["later_kind"] = kind
    person["asked"] = asked
    if kind in FOLLOW_QUESTIONS:
        if kind in FOLLOW_DATED:  # only these count against the week (audit M2)
            person.setdefault("follow_asked", []).append(today)
        person.setdefault("follow_last", {})[kind] = today
        # A miss until its "yes" comes (open_follow starts the count over).
        misses = person.setdefault("follow_miss", {})
        misses[kind] = misses.get(kind, 0) + 1


def asked_later(person: dict[str, Any], today: str, kind: str) -> bool:
    """Whether today's later question for this person was this kind."""
    asked = person.get("asked") or {}
    return asked.get("day") == today and asked.get("later_kind") == kind


def follow_question(
    person: dict[str, Any],
    today: str,
    *,
    pet_kinds: tuple[str, ...] = (),
    dated_only: bool = False,
) -> str | None:
    """A follow-up question due today, or None: never while an event is open,
    at most FOLLOW_ASK_PER_WEEK dated ones (FOLLOW_DATED) a week, each kind at
    most once a week, tried in
    FOLLOW_QUESTIONS' order. Weekend: Fridays. Big day ("anything big this
    week?"): Sundays and Mondays. Trick and game: only from a pet that can ask
    them (pet_kinds: a trick left, not asked this month). dated_only: the dated
    kinds only (a came-home ask goes before trick and game, M0-a)."""
    if (person.get("follow") or {}).get("event"):
        return None
    day = date.fromisoformat(today)
    recent = [
        d
        for d in person.get("follow_asked", [])
        if (day - date.fromisoformat(d)).days < 7
    ]
    if len(recent) >= FOLLOW_ASK_PER_WEEK:
        return None
    lasts = person.get("follow_last") or {}
    misses = person.get("follow_miss") or {}
    for kind in FOLLOW_QUESTIONS:
        last = lasts.get(kind)
        gap = BIG_DAY_GAP if kind == "big_day" else 7
        rest = FOLLOW_REST_DAYS if misses.get(kind, 0) >= FOLLOW_MISSES else gap
        if last is not None and (day - date.fromisoformat(last)).days < rest:
            continue
        if kind == "weekend" and day.weekday() == 4:
            return kind
        if kind == "big_day" and day.weekday() in BIG_DAY_ASK_DAYS:
            return kind
        if kind in pet_kinds and not dated_only:
            return kind
    return None


def big_day_pick(today: str, day: Any) -> str | None:
    """The day picked for "anything big this week?": one of the next
    BIG_DAY_AHEAD days, else None (a stale or hand-made answer)."""
    picked = _iso(day)
    ahead = picked and (picked - date.fromisoformat(today)).days
    return picked.isoformat() if picked and 1 <= ahead <= BIG_DAY_AHEAD else None


def follow_dates(kind: str, today: str) -> tuple[str, str]:
    """An event's due and until days from the day of its yes."""
    day = date.fromisoformat(today)
    if kind == "weekend":
        monday = day + timedelta(days=7 - day.weekday())
        return monday.isoformat(), (monday + timedelta(days=1)).isoformat()
    if kind == "trick":
        return (
            (day + timedelta(days=TRICK_DUE_DAYS)).isoformat(),
            (day + timedelta(days=TRICK_UNTIL_DAYS)).isoformat(),
        )
    return tomorrow(today), tomorrow(today)


def clean_text(text: Any) -> str | None:
    """A typed answer as kept: control and format characters (Unicode C*) gone,
    whitespace collapsed, cut to FOLLOW_TEXT_MAX code points; a leading "my "
    becomes "your " only if that still fits. None if nothing is left."""
    if not isinstance(text, str):
        return None
    kept = "".join(c for c in text if not unicodedata.category(c).startswith("C"))
    kept = _TAIL.sub("", _SPACES.sub(" ", kept).strip())[:FOLLOW_TEXT_MAX]
    kept = _TAIL.sub("", kept.strip())
    if kept[:3] in ("my ", "My "):
        yours = "your " + kept[3:]
        if len(yours) <= FOLLOW_TEXT_MAX:
            kept = yours
    return kept or None


def _event_beat(
    event: dict[str, Any], today: str, hour: int, pet: str | None
) -> str | None:
    """The beat of an open event due now, not yet said."""
    if event.get("pet") is not None and event["pet"] != pet:
        return None  # a pet's own follow-up (game, trick) is that pet's
    said = event["said"]
    if event["kind"] == "big_day":
        if today != event["due"]:
            return None
        beat = "morning" if hour < FOLLOW_EVENING_HOUR else "evening"
        if beat == "morning" and hour < R.ASK_MORNING_FROM:
            return None  # audit s2635 L1: a night owl's look keeps the real morning's
        return None if beat in said or "evening" in said else beat
    if not event["due"] <= today <= event["until"] or said:
        return None
    if event["kind"] == "weekend" and hour < R.ASK_MORNING_FROM:
        return None  # Monday's line from the morning too (L1)
    return FOLLOW_BEATS[event["kind"]][0]


def model_today(hass: HomeAssistant) -> str:
    """The house's local date (prune's day at load)."""
    return dt_util.now().date().isoformat()


def tomorrow(today: str) -> str:
    return (date.fromisoformat(today) + timedelta(days=1)).isoformat()


async def async_erase_unless_allowed(hass: HomeAssistant, leaving: str) -> int:
    """The admin erase (memory plan section 5, FM Q-C): when no pet entry but the one
    leaving (an options save turning memory off on it, or its removal) allows
    memory, every person's memory goes, saved at once. Stored options, never live
    pets (a reload has none loaded), and disabled entries count; an ignored
    discovery is no pet. A store that isn't set up skips it. How many records had
    memory."""
    if any(
        entry.options.get(CONF_MEMORY, True)
        for entry in hass.config_entries.async_entries(DOMAIN, include_ignore=False)
        if entry.entry_id != leaving
    ):
        return 0
    people: People | None = hass.data.get(DOMAIN, {}).get("people")
    if people is None:
        return 0
    gone = await people.forget_all_memory()
    # Every loaded pet tells its watchers, so a card's memory_on is never stale (it shows
    # on any pet while on, whatever that pet allows).
    for pet in hass.data.get(DOMAIN, {}).get("pets", {}).values():
        pet._push_watchers()
    return gone
