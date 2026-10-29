"""The private channel: each signed-in person's own view of a pet, pushed on
their websocket connection (virtual_pet/subscribe), never on a state or the
bus.

The watchers live in hass.data[DOMAIN]["watchers"], by config entry, not on a
coordinator: a reload makes a new coordinator, and a card open across it keeps
its subscription (the new one sends it a fresh snapshot)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback

from .const import DOMAIN

type Send = Callable[[dict[str, Any]], None]
type Watcher = tuple[str, bool, Send]  # (HA user ID, shared screen, send)


def of(hass: HomeAssistant, entry_id: str) -> dict[object, Watcher]:
    """One pet's watchers, by token (empty when it has none)."""
    return hass.data.get(DOMAIN, {}).get("watchers", {}).get(entry_id, {})


def add(
    hass: HomeAssistant, entry_id: str, user: str, shared: bool, send: Send
) -> tuple[object, CALLBACK_TYPE]:
    """Watch a pet: its token, and what stops it (when the socket closes)."""
    token = object()
    watchers: dict[str, dict[object, Watcher]] = hass.data[DOMAIN]["watchers"]
    watchers.setdefault(entry_id, {})[token] = (user, shared, send)

    @callback
    def remove() -> None:
        # The pet may be gone already, its watchers with it.
        watchers.get(entry_id, {}).pop(token, None)

    return token, remove


def gone(hass: HomeAssistant, entry_id: str) -> None:
    """The pet was removed: tell its watchers, and forget them."""
    watchers: dict[str, dict[object, Watcher]] = hass.data[DOMAIN]["watchers"]
    for _, _, send in watchers.pop(entry_id, {}).values():
        send({"gone": True})
