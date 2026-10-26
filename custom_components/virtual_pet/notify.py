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


def message(event: dict[str, Any], name: str, species: dict[str, str]) -> str | None:
    """The notification for a pet event, or None for events that don't notify."""
    kind = event["type"]
    if kind == "call_started":
        return f"{name} {CALLS.get(event.get('reason', ''), 'is calling')}!"
    if kind == "became_sick":
        return f"{name} is feeling sick. Medicine?"
    if kind == "hatched":
        found = species.get(event.get("species", ""), "a new friend")
        return f"{name} hatched: it's a {found.lower()}!"
    if kind == "trait_learned":
        return f"{name} is a {event['trait'].replace('_', ' ')} now."
    if kind == "trait_deepened":
        stars = "★" * event["level"]
        return f"{name}'s {event['trait'].replace('_', ' ')} runs deep now: {stars}"
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
