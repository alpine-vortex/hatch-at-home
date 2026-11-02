"""The pet's name, in one place.

Three things can hold it: the entry's title (Reconfigure writes it), the
device's own name (HA's pencil and its "Name and assign" step write
name_by_user) and the pet's saved state. The device's own name wins, as the
card and notifications already do; every text that names the pet asks here.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from .const import DOMAIN


def pet_name(hass: HomeAssistant, entry: ConfigEntry) -> str:
    """What the household calls this pet right now."""
    device = dr.async_get(hass).async_get_device_by_identifier(
        (DOMAIN, entry.entry_id), entry.entry_id
    )
    if device and device.name_by_user:
        return device.name_by_user
    return entry.title


def clear_device_name(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Drop the device's own name so a new title shows everywhere."""
    registry = dr.async_get(hass)
    device = registry.async_get_device_by_identifier(
        (DOMAIN, entry.entry_id), entry.entry_id
    )
    if device and device.name_by_user:
        registry.async_update_device(device.id, name_by_user=None)


def name_taken(
    hass: HomeAssistant, name: str, except_entry_id: str | None = None
) -> bool:
    """Does another pet here already go by this name (case aside)?

    Compares with what the household sees (the device's own name wins over the
    title), so a pet renamed on its device page still counts.
    """
    wanted = name.strip().casefold()
    return any(
        pet_name(hass, e).casefold() == wanted
        for e in hass.config_entries.async_entries(DOMAIN)
        if e.entry_id != except_entry_id
    )
