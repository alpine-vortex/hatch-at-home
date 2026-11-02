"""Defaults picked from the house when a pet is made (ha-signals H2)."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

MET = "met"
MET_HOME = "weather.forecast_home"


def default_weather(hass: HomeAssistant, *, from_states: bool = False) -> str | None:
    """The weather entity to start a pet on, or None unless it is clear.

    Clear means the met "home" entry's entity (the config entry that tracks
    home, else the usual `weather.forecast_home`), or else exactly ONE weather
    entity that is neither disabled nor hidden. Two or more is a choice for the
    player, so nothing is filled.

    Reads the entity registry, because the met integration may not have loaded
    yet when a migration runs at startup. `from_states` (a new pet, made while
    the house is running) adds the live states as a last look, for a YAML
    weather that has no registry entry; a migration never passes it.
    """
    registry = er.async_get(hass)
    usable = [
        e
        for e in registry.entities.values()
        if e.domain == "weather" and not e.disabled_by and not e.hidden_by
    ]
    met = [e for e in usable if e.platform == MET]
    tracking_home = {
        entry.entry_id
        for entry in hass.config_entries.async_entries(MET)
        if entry.data.get("track_home")
    }
    for found in (
        [e for e in met if e.config_entry_id in tracking_home],
        [e for e in met if e.entity_id == MET_HOME],
    ):
        if len(found) == 1:
            return found[0].entity_id
    if len(usable) == 1:
        return usable[0].entity_id
    if not usable and from_states:
        ids = sorted(hass.states.async_entity_ids("weather"))
        if len(ids) == 1:
            return ids[0]
    return None
