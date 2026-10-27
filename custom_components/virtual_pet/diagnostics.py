"""Diagnostics download: the pet's state and what it senses, for tuning and bugs.

Entity IDs from the options and people's names are redacted, so the file can be
shared in an issue without giving the house away.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from . import model
from .const import (
    CONF_AQI,
    CONF_BEDTIME_LIGHTS,
    CONF_CHORES,
    CONF_DASHBOARD,
    CONF_FIREPLACE,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MOON_ALTITUDE,
    CONF_MOON_ILLUMINATION,
    CONF_MOON_PHASE,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SOLAR,
    CONF_TV,
    CONF_WEATHER,
    CONF_ZONE,
)
from .coordinator import PetConfigEntry

# Which entities the owner mapped says a lot about their house.
REDACT_OPTIONS = {
    CONF_AQI,
    CONF_BEDTIME_LIGHTS,
    CONF_CHORES,
    CONF_DASHBOARD,  # the house's dashboard paths
    CONF_FIREPLACE,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MOON_ALTITUDE,
    CONF_MOON_ILLUMINATION,
    CONF_MOON_PHASE,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SOLAR,
    CONF_TV,
    CONF_WEATHER,
    CONF_ZONE,
}
# People: who cared for the pet, and who gets its notifications.
REDACT_STATE = {"by", "notify_users"}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: PetConfigEntry
) -> dict[str, Any]:
    """Everything needed to see how the pet is living, minus the house."""
    coordinator = entry.runtime_data
    pet = coordinator.state
    assert pet is not None
    now = dt_util.utcnow().timestamp()
    settings = coordinator.settings
    mood, flags, reason = model.mood(pet, now, settings)
    return {
        "world": coordinator.world,
        "roster": list(coordinator.roster),
        "options": async_redact_data(dict(entry.options), REDACT_OPTIONS),
        "pet": async_redact_data(pet.to_dict(), REDACT_STATE),
        "now": {
            "stage": model.life_stage(pet),
            "mood": mood,
            "flags": flags,
            "says": reason,
            "requests": model.requests(pet, now, settings),
            "weight_band": model.weight_band(pet),
            "whine_rate_per_hour": round(model.whine_rate(pet), 4),
            "upbringing": model.upbringing(pet),
            "upbringing_score": round(model.upbringing_score(pet), 1),
            "trait_progress": model.trait_progress(pet),
        },
        "calculation": async_redact_data(dict(coordinator.debug), REDACT_OPTIONS),
        "moments": list(coordinator.moments),
    }
