"""The weather snapshot for one round of Pond Channel."""

from __future__ import annotations

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from .activity_support import incarnation, pet_for
from .const import CONF_RAIN, CONF_WEATHER, DOMAIN
from .device_fx import rain_reading
from .home import Readings
from .model import life_stage
from .watcher import BAD, Watcher


def pond_layout(watcher: Watcher) -> str:
    """Read only the mapped live inputs, without updating the watcher's history."""
    weather_id = next(iter(watcher._ids(CONF_WEATHER)), None)
    rain_id = next(iter(watcher._ids(CONF_RAIN)), None)
    live = {}
    for entity_id in dict.fromkeys((weather_id, rain_id)):
        if entity_id and (state := watcher.hass.states.get(entity_id)) is not None:
            if state.state not in BAD:
                live[entity_id] = state
    weather = live.get(weather_id)
    readings = Readings(
        night=False,
        condition=weather.state if weather else None,
        rain_rate=watcher._rain(live.get(rain_id)),
    )
    return "wet" if rain_reading(readings) is True else "dry"


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/pond_channel",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("pet_ref"): vol.All(str, vol.Length(min=1, max=160)),
    }
)
@callback
def websocket_pond_channel(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return a layout only. The round is played on the card."""
    pet = pet_for(hass, connection, msg["entity_id"])
    if pet is None:
        connection.send_error(msg["id"], "forbidden", "The companion is unavailable")
        return
    state = pet.state
    if state is None or msg["pet_ref"] != incarnation(pet) or pet.world != "pond":
        connection.send_error(msg["id"], "activity_changed", "The companion changed")
        return
    if life_stage(state) == "egg" or state.asleep or state.sick:
        connection.send_error(
            msg["id"], "activity_unavailable", "The companion is resting"
        )
        return
    connection.send_result(msg["id"], {"layout": pond_layout(pet.watcher)})


@callback
def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_pond_channel)
