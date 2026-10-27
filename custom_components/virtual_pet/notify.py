"""Phone notifications, opt-in per Home Assistant user.

Each user turns them on for a pet from the card (service virtual_pet.notify_me).
They go to that user's phones through the Home Assistant app (mobile_app).
The one exception is the welcome when a pet is added, which goes to every phone.
Messages never name anyone.
"""

from __future__ import annotations

import asyncio
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import slugify

from .const import LOGGER

CALLS = {
    "hunger": "is hungry",
    "happiness": "wants to play",
    "energy": "is sleepy. Lights out?",
    "dirty": "needs a clean",
    "sick": "feels sick and is calling",
}


# How each trait reads in "Pip ... now" and "Pip's ... runs deep now".
TRAITS = {
    "night_owl": ("is a night owl", "night-owl streak"),
    "music_lover": ("is a music lover", "love of music"),
    "homebody": ("is a homebody", "homebody heart"),
    "sun_lover": ("is a sun lover", "love of the sun"),
    "fireside": ("loves the fireside", "love of the fire"),
    "moon_child": ("is a moon child", "moon-child soul"),
    "storm_watcher": ("is a storm watcher", "love of storms"),
    "couch_potato": ("is a couch potato", "couch-potato streak"),
    "social_butterfly": ("is a social butterfly", "social streak"),
    "early_bird": ("is an early bird", "early-bird streak"),
    "helper": ("is a little helper", "helpful streak"),
    "player": ("loves a game", "love of games"),
    "snow_child": ("is a snow child", "love of snow"),
    "breeze_rider": ("rides the breeze", "love of the wind"),
    "fog_wanderer": ("is a fog wanderer", "love of the fog"),
    "thunder_heart": ("has a thunder heart", "thunder heart"),
}


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
        return f"{name} is feeling sick. Medicine?"
    if kind == "hatched":
        found = species.get(event.get("species", ""), "new friend")
        return f"{name} hatched: it's {_a(found.lower())}!"
    if kind == "stage_changed" and event.get("upbringing"):
        return f"{name} is all grown up: {_a(event['upbringing'])} adult."
    if kind == "trait_learned":
        return f"{name} {_trait(event['trait'])[0]} now."
    if kind == "trait_deepened":
        stars = "★" * event["level"]
        return f"{name}'s {_trait(event['trait'])[1]} runs deep now: {stars}"
    if kind == "first_snow":
        return f"{name} saw the first snow of the season!"
    if kind == "first_frost":
        return f"{name} noticed the first frost of the season."
    if kind == "egg_laid":
        return f"{name} laid an egg: generation {event['generation']} is on its way."
    return None


def welcome(name: str) -> str:
    """The message when a pet is added to the house."""
    return f"{name} has been welcomed into the home."


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
) -> None:
    """Send to every phone of every subscribed user (None: every phone in the
    house); a failure only logs. A url is what tapping the notification opens.

    The text "clear_notification" removes the tagged notification instead.
    """
    data: dict[str, Any] = {"tag": tag, "group": "virtual_pet"}
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
