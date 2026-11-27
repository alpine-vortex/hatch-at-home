"""Shared authorization and identity for gameplay commands."""

from __future__ import annotations

import asyncio
import hashlib
from typing import TYPE_CHECKING

from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN

if TYPE_CHECKING:
    from .coordinator import PetCoordinator


def pet_for(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    entity_id: str,
    *,
    control: str | None = None,
) -> PetCoordinator | None:
    """Resolve a readable pet and, when requested, a controllable action."""
    registry = er.async_get(hass)
    entity = registry.async_get(entity_id)
    permissions = connection.user.permissions
    if (
        entity is None
        or entity.platform != DOMAIN
        or not permissions.check_entity(entity_id, POLICY_READ)
    ):
        return None
    pet = hass.data[DOMAIN]["pets"].get(entity.config_entry_id)
    if pet is None or pet.state is None:
        return None
    if control:
        domain, key = control.split(".", 1)
        action = registry.async_get_entity_id(domain, DOMAIN, f"{pet.pet_id}_{key}")
        if not action or not permissions.check_entity(action, POLICY_CONTROL):
            return None
    return pet


def incarnation(pet: PetCoordinator) -> str:
    """An opaque reference that survives reloads and changes for a fresh pet."""
    state = pet.state
    assert state is not None
    return hashlib.sha256(
        f"{pet.pet_id}|{state.generation}|{float(state.born)!r}".encode()
    ).hexdigest()[:32]


def gameplay_lock(pet: PetCoordinator) -> asyncio.Lock:
    """Serialise durable gameplay writes with relevant ordinary care."""
    return pet.gameplay_lock


def view(pet: PetCoordinator) -> dict:
    """Public capability flags, keyed to the current companion."""
    return {
        "pet_ref": incarnation(pet),
        "pond_channel": pet.world == "pond",
        "outing": pet.world == "tidepool",
    }
