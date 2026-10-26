"""Phone notifications, opt-in per Home Assistant user.

Each user turns them on for a pet from the card (service virtual_pet.notify_me).
They go to that user's phones through the Home Assistant app (mobile_app).
Messages never name anyone.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import slugify

from .const import LOGGER

CALLS = {
    "hunger": "is hungry",
    "happiness": "wants to play",
    "energy": "is sleepy, lights out?",
    "dirty": "needs a clean",
    "sick": "is calling, it feels sick",
}


# How each trait reads in "Pip ... now" and "Pip's ... runs deep now".
TRAITS = {
    "night_owl": ("is a night owl", "night-owl streak"),
    "music_lover": ("is a music lover", "love of music"),
    "homebody": ("is a homebody", "homebody heart"),
    "sun_lover": ("is a sun lover", "love of the sun"),
    "fireside": ("loves the fireside", "love of the fire"),
    "moon_child": ("is a moon child", "moonchild soul"),
    "storm_watcher": ("is a storm watcher", "love of storms"),
    "couch_potato": ("is a couch potato", "couch-potato streak"),
    "social_butterfly": ("is a social butterfly", "social streak"),
}


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
        return f"{name} {CALLS.get(event.get('reason', ''), 'is calling')}!"
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
    if kind == "egg_laid":
        return f"{name} laid an egg: generation {event['generation']} is on its way."
    return None


def phones(hass: HomeAssistant, user_id: str) -> list[str]:
    """notify services of the mobile app devices this user signed in with."""
    services = []
    for entry in hass.config_entries.async_entries("mobile_app"):
        if entry.data.get("user_id") != user_id:
            continue
        service = f"mobile_app_{slugify(entry.data.get('device_name', ''))}"
        if hass.services.has_service("notify", service):
            services.append(service)
    return services


async def send(hass: HomeAssistant, user_ids: list[str], text: str, tag: str) -> None:
    """Send to every phone of every subscribed user; a failure only logs."""
    for user_id in user_ids:
        for service in phones(hass, user_id):
            try:
                await hass.services.async_call(
                    "notify",
                    service,
                    {"message": text, "data": {"tag": tag, "group": "virtual_pet"}},
                    blocking=True,
                )
            except Exception:  # noqa: BLE001 - a phone being gone must not break the pet
                LOGGER.warning("Couldn't notify %s", service, exc_info=True)
