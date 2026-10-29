"""Phone notifications, opt-in per Home Assistant user.

Each user turns them on for a pet from the card (service virtual_pet.notify_me).
They go to that user's phones through the Home Assistant app (mobile_app).
The welcome when a pet is added goes to the sidebar, and to the phones of people
who get another pet's notifications.
Messages never name anyone; a person's own phones may get the nickname the pet
gave them.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import date, timedelta
import math
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import slugify

from . import rates as R
from .const import LOGGER

CALLS = {
    "hunger": "is hungry",
    "happiness": "wants to play",
    "energy": "is sleepy. Lights out?",
    "dirty": "needs a clean",
    "sick": "feels sick. Medicine?",
}


# How each trait reads in "Pip ... now" and "Pip's ... runs deep now".
TRAITS = {
    "night_owl": ("is a night owl", "night-owl side"),
    "music_lover": ("is a music lover", "love of music"),
    "homebody": ("is a homebody", "homebody heart"),
    "sun_lover": ("is a sun lover", "love of the sun"),
    "fireside": ("loves the fireside", "love of the fire"),
    "moon_child": ("is a moon child", "moon-child soul"),
    "storm_watcher": ("is a storm watcher", "love of storms"),
    "couch_potato": ("is a couch potato", "couch-potato side"),
    "social_butterfly": ("is a social butterfly", "social side"),
    "early_bird": ("is an early bird", "early-bird side"),
    "helper": ("is a little helper", "helpful side"),
    "player": ("loves a game", "love of games"),
    "snow_child": ("is a snow child", "love of snow"),
    "breeze_rider": ("rides the breeze", "love of the wind"),
    "fog_wanderer": ("is a fog wanderer", "love of the fog"),
    "thunder_heart": ("has a thunder heart", "thunder heart"),
}


# Holidays the pet greets on the phone in the morning (the card does the rest).
HOLIDAYS: dict[tuple[int, int], str] = {(10, 31): "halloween"}
HOLIDAY_MORNINGS = {
    "halloween": "Happy Halloween! {name} is dressed up and ready to trick or treat 🎃",
    "thanksgiving": "Happy Thanksgiving! {name} is thankful for you 🦃",
}


def thanksgiving(year: int) -> date:
    """US Thanksgiving: the fourth Thursday of November."""
    first = date(year, 11, 1)
    return first + timedelta(days=(3 - first.weekday()) % 7 + 21)


def holiday(day: date) -> str | None:
    """The holiday on this date, if the pet greets it."""
    if day == thanksgiving(day.year):
        return "thanksgiving"
    return HOLIDAYS.get((day.month, day.day))


# Buttons on a call's notification: what would answer it. A plea to play may be
# a fake call, so it offers scolding too (both always, so they give nothing away).
ACTION_PREFIX = "VIRTUAL_PET:"
ANSWERS: dict[str, list[tuple[str, str]]] = {
    "hunger": [("feed", "Feed")],
    "happiness": [("play", "Play"), ("scold", "Scold")],
    "dirty": [("clean", "Clean")],
    "energy": [("lights_out", "Lights out")],
    "sick": [("medicine", "Medicine")],
}
# Notifications about a call share one tag, so a newer one replaces the older
# and answering it clears it from the phone.
CALL_EVENTS = {"call_started", "became_sick"}
CALL_OVER_EVENTS = {
    "call_answered",
    "care_miss",
    "discipline_miss",  # a whine nobody answered
    "recovered",  # medicine (sickness notifies like a call)
    "call_settled",  # the sitter settled a whine
    "egg_laid",
    "fell_asleep",
}


def call_tag(pet_id: str) -> str:
    """The tag shared by a pet's call notifications."""
    return f"virtual_pet_{pet_id}_call"


def pushes(event: dict[str, Any], batch: list[dict[str, Any]]) -> bool:
    """Whether a call event goes to the pet's own call notification. A
    poop call stays on the card and the sensors (owner, Wave 0 Q4); a sick
    call that came with became_sick is already on the phone; a re-call goes
    in the house's bundle (Recalls)."""
    if event["type"] != "call_started":
        return True
    if event.get("recall") or event.get("reason") == "dirty":
        return False
    return not (
        event.get("reason") == "sick" and any(e["type"] == "became_sick" for e in batch)
    )


# Re-calls (a missed need asking again) go to each person in one bundled
# notification for every pet of theirs still asking (owner, Wave 0 Q1).
RECALL_TAG = "virtual_pet_recalls"


def visit(names: list[str]) -> str:
    """The bundle's text for two or more pets (copy W4)."""
    return f"{', '.join(names[:-1])} and {names[-1]} would like a visit"


@dataclass
class Asking:
    """A pet still asking (a need it missed still holds), as the bundle
    names it."""

    pet_id: str
    name: str
    text: str  # its usual call text, for what it asks about now
    users: list[str]  # who get its notifications
    nickname: Callable[[str], str | None]  # its nickname for a person


Send = Callable[[list[str], str], Coroutine[Any, Any, None]]


@dataclass
class Recalls:
    """The house's re-call bundle, keyed by person: at most one push per
    RECALL_HOURS each, sent when one of their pets re-calls, a normal one
    with no buttons, naming every pet of theirs still asking. Answering one
    pet doesn't rewrite it (that would buzz again); it is cleared once none
    of its pets is still asking. Memory only: a restart clears it once per
    person (fresh)."""

    last_sent: dict[str, float] = field(default_factory=dict)
    shown: dict[str, set[str]] = field(default_factory=dict)  # pet IDs named
    fresh: set[str] = field(default_factory=set)  # cleared or sent since start

    def clear_stale(
        self, users: list[str], send: Send
    ) -> list[Coroutine[Any, Any, None]]:
        """Clear a bundle left on these people's phones from before a
        restart, once each (never one sent since)."""
        stale = [user for user in users if user not in self.fresh]
        self.fresh.update(stale)
        return [send(stale, "clear_notification")] if stale else []

    def update(
        self, asking: list[Asking], started: str | None, now: float, send: Send
    ) -> list[Coroutine[Any, Any, None]]:
        """The sends for the house as it is now. started: the pet whose
        re-call just began, if any."""
        open_ids = {a.pet_id for a in asking}
        sends = []
        for user, pets in list(self.shown.items()):
            if not pets & open_ids:
                del self.shown[user]
                sends.append(send([user], "clear_notification"))
        new = next((a for a in asking if a.pet_id == started), None)
        if new is None:
            return sends
        for user in new.users:
            if now - self.last_sent.get(user, -math.inf) < R.RECALL_HOURS * 3600:
                continue  # it stays on the card until the next bundle
            theirs = sorted(
                (a for a in asking if user in a.users), key=lambda a: a.name
            )
            if len(theirs) == 1:
                nickname = new.nickname(user)
                text = to_friend(new.text, nickname) if nickname else new.text
            else:
                text = visit([a.name for a in theirs])
            self.last_sent[user] = now
            self.fresh.add(user)
            self.shown[user] = {a.pet_id for a in theirs}
            sends.append(send([user], text))
        return sends


def actions(event: dict[str, Any], pet_id: str) -> list[dict[str, str]]:
    """Notification buttons that answer the event's call, if any."""
    reason = "sick" if event["type"] == "became_sick" else event.get("reason", "")
    if event["type"] not in CALL_EVENTS:
        return []
    return [
        {"action": f"{ACTION_PREFIX}{pet_id}:{key}", "title": title}
        for key, title in ANSWERS.get(reason, [])
    ]


def parse_action(action: str) -> tuple[str, str] | None:
    """(pet_id, care action) from a pressed notification button, or None."""
    if not action.startswith(ACTION_PREFIX):
        return None
    pet_id, _, key = action[len(ACTION_PREFIX) :].rpartition(":")
    return (pet_id, key) if pet_id and key else None


def _a(noun: str) -> str:
    """'a' or 'an', by the first letter."""
    return f"{'an' if noun[:1].lower() in 'aeiou' else 'a'} {noun}"


def _trait(trait: str) -> tuple[str, str]:
    words = trait.replace("_", " ")
    return TRAITS.get(trait, (f"is {_a(words)}", words))


def message(event: dict[str, Any], name: str, species: dict[str, str]) -> str | None:
    """The notification for a pet event, or None for events that don't notify."""
    kind = event["type"]
    if kind == "call_started":
        text = f"{name} {CALLS.get(event.get('reason', ''), 'is calling')}"
        return text if text.endswith("?") else f"{text}!"
    if kind == "became_sick":
        return f"{name} feels sick. Medicine?"
    if kind == "hatched":
        found = species.get(event.get("species", ""), "new friend")
        return f"{name} hatched: it's {_a(found.lower())}!"
    if kind == "stage_changed" and event.get("upbringing"):
        return f"{name} is all grown up!"  # the upbringing isn't a grade to announce
    if kind == "trait_learned":
        return f"{name} {_trait(event['trait'])[0]} now."
    if kind == "trait_deepened":
        stars = "★" * event["level"]
        return f"{name}'s {_trait(event['trait'])[1]} runs deep now: {stars}"
    if kind == "first_snow":
        return f"{name} saw the first snow of the season!"
    if kind == "first_frost":
        return f"{name} noticed the first frost of the season."
    if kind == "holiday" and event.get("holiday") in HOLIDAY_MORNINGS:
        return HOLIDAY_MORNINGS[event["holiday"]].format(name=name)
    if kind == "egg_laid":
        return f"{name} laid an egg: generation {event['generation']} is on its way."
    return None


def to_friend(text: str, nickname: str) -> str:
    """The message for someone the pet has a nickname for: "Pip is hungry,
    sunbeam!". One that doesn't end in . ! or ? (a holiday's emoji) stays."""
    if text[-1:] in ("!", "?", "."):
        return f"{text[:-1]}, {nickname}{text[-1]}"
    return text


# A morning send-off, by what the day holds ("my day" on; a few times a week).
SEND_OFFS = {
    "rain": "{name} says: rain today, take an umbrella{to} ☂",
    "snow": "{name} says: snow today! bundle up{to} ❄",
    "hot": "{name} says: it's a hot one, stay cool{to}! ☀",
    "cold": "{name} says: it's cold out, wrap up warm{to}!",
}


def send_off(kind: str, name: str, nickname: str | None) -> str:
    """The send-off for someone heading out."""
    return SEND_OFFS[kind].format(name=name, to=f", {nickname}" if nickname else "")


def birthday(name: str, nickname: str | None) -> str:
    """A friend's birthday, on their own phone (a nickname, never a name)."""
    return f"{name} says: happy birthday{f', {nickname}' if nickname else ''}! ♥"


def welcome(name: str) -> str:
    """The message when a pet is added to the house."""
    return f"{name}, a new virtual pet, just moved in! Say hi ♥"


def dashboard_path(value: str | None) -> str | None:
    """A dashboard path as notifications want it: "/name/view", or None."""
    value = (value or "").strip().strip("/")
    return f"/{value}" if value else None


def phones(hass: HomeAssistant, user_id: str | None) -> list[str]:
    """notify services of the mobile app devices this user signed in with.

    With no user, every mobile app device in the house.
    """
    services = []
    for entry in hass.config_entries.async_entries("mobile_app"):
        if user_id is not None and entry.data.get("user_id") != user_id:
            continue
        service = f"mobile_app_{slugify(entry.data.get('device_name', ''))}"
        if hass.services.has_service("notify", service):
            services.append(service)
    return services


async def send(
    hass: HomeAssistant,
    user_ids: list[str] | None,
    text: str,
    tag: str,
    buttons: list[dict[str, str]] | None = None,
    url: str | None = None,
    level: str | None = None,
) -> None:
    """Send to every phone of every subscribed user (None: every phone in the
    house); a failure only logs. A url is what tapping the notification opens.
    A level: "time-sensitive" (a call: may break through a focus the person
    allows) or "passive" (a send-off: no sound); none is an ordinary one, which
    the phone holds during focus or do not disturb like any other.

    The text "clear_notification" removes the tagged notification instead.
    """
    data: dict[str, Any] = {"tag": tag, "group": "virtual_pet"}
    if level:
        data["push"] = {"interruption-level": level}  # iOS
        urgent = level == "time-sensitive"
        data["channel"] = "Pet calls" if urgent else "Pet news"  # Android
        data["importance"] = "high" if urgent else "low"
    if buttons:
        data["actions"] = buttons
    if url:
        data["url"] = url  # iOS
        data["clickAction"] = url  # Android
    if user_ids is None:
        services = phones(hass, None)
    else:
        services = [s for user_id in user_ids for s in phones(hass, user_id)]

    async def one(service: str) -> None:
        try:
            await hass.services.async_call(
                "notify",
                service,
                {"message": text, "data": data},
                blocking=True,
            )
        except Exception:  # noqa: BLE001 - a phone being gone must not break the pet
            # The service is named after the phone (often its owner): debug only.
            LOGGER.warning("Couldn't send a pet notification to a phone")
            LOGGER.debug("Couldn't notify %s", service, exc_info=True)

    # All phones at once: a slow push doesn't hold up the others.
    await asyncio.gather(*(one(service) for service in services))
