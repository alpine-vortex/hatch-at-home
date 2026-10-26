"""Config flow: name the pet and pick its device's world.

Settings come later as options.
"""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers.selector import (
    BooleanSelector,
    EntitySelector,
    EntitySelectorConfig,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    TimeSelector,
)
import voluptuous as vol

from . import rates as R
from .const import (
    CONF_AQI,
    CONF_BEDTIME,
    CONF_BEDTIME_LIGHTS,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_PRIVACY,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SOLAR,
    CONF_TV,
    CONF_WAKE_TIME,
    CONF_WEATHER,
    CONF_WORLD,
    CONF_ZONE,
    DEFAULT_NAME,
    DEFAULT_WORLD,
    DEFAULT_ZONE,
    DOMAIN,
)
from .species import load_catalog


class VirtualPetConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up a new device with an egg in it."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> PetOptionsFlow:
        """Bedtime, the house and privacy, editable any time."""
        return PetOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Name the pet and pick a world."""
        if user_input is not None:
            name = user_input[CONF_NAME].strip() or DEFAULT_NAME
            return self.async_create_entry(
                title=name,
                data={CONF_NAME: name, CONF_WORLD: user_input[CONF_WORLD]},
            )
        catalog = await self.hass.async_add_executor_job(load_catalog)
        if not catalog.worlds:
            return self.async_abort(reason="no_worlds")
        options = [
            SelectOptionDict(
                value=key,
                label=f"{world['name']}: "
                + ", ".join(catalog.species[s]["name"] for s in catalog.roster(key)),
            )
            for key, world in catalog.worlds.items()
        ]
        default = (
            DEFAULT_WORLD if DEFAULT_WORLD in catalog.worlds else options[0]["value"]
        )
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_NAME, default=DEFAULT_NAME): str,
                    vol.Required(CONF_WORLD, default=default): SelectSelector(
                        SelectSelectorConfig(options=options)
                    ),
                }
            ),
        )


def _entities(
    domain: str, multiple: bool = False, device_class: Any = None
) -> EntitySelector:
    config = EntitySelectorConfig(domain=domain, multiple=multiple)
    if device_class:
        config["device_class"] = device_class
    return EntitySelector(config)


# section -> [(key, selector, default)]. Defaults apply to required fields only.
SECTIONS: dict[str, list[tuple[str, Any, Any]]] = {
    "sleep": [
        (CONF_BEDTIME, TimeSelector(), R.DEFAULT_BEDTIME + ":00"),
        (CONF_WAKE_TIME, TimeSelector(), R.DEFAULT_WAKE_TIME + ":00"),
        (CONF_BEDTIME_LIGHTS, _entities("light", True), None),
        (
            CONF_MOTION,
            _entities("binary_sensor", True, ["motion", "occupancy", "presence"]),
            None,
        ),
    ],
    "weather": [
        (CONF_WEATHER, _entities("weather"), None),
        (CONF_RAIN, _entities("sensor"), None),
        (CONF_SOLAR, _entities("sensor"), None),
        (CONF_INDOOR_TEMP, _entities("sensor", device_class="temperature"), None),
        (CONF_AQI, _entities("sensor"), None),
    ],
    "room": [
        (CONF_ROOM_LIGHTS, _entities("light", True), None),
        (CONF_LUX, _entities("sensor", True, "illuminance"), None),
    ],
    "activity": [
        (CONF_ZONE, _entities("zone"), DEFAULT_ZONE),
        (CONF_MUSIC, _entities("media_player", True), None),
        (CONF_TV, _entities("media_player", True), None),
    ],
    "privacy": [
        (CONF_PRIVACY, BooleanSelector(), True),
    ],
}


class PetOptionsFlow(OptionsFlowWithReload):
    """Map the house to the pet. Every field is optional; unmapped is skipped."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            flat: dict[str, Any] = {}
            for group in user_input.values():
                flat.update({k: v for k, v in group.items() if v not in (None, "", [])})
            return self.async_create_entry(data=flat)

        current = self.config_entry.options
        schema: dict[Any, Any] = {}
        for name, fields in SECTIONS.items():
            inner: dict[Any, Any] = {}
            for key, selector, default in fields:
                if default is not None:
                    inner[vol.Required(key, default=current.get(key, default))] = (
                        selector
                    )
                else:
                    inner[
                        vol.Optional(
                            key, description={"suggested_value": current.get(key)}
                        )
                    ] = selector
            schema[vol.Required(name)] = section(
                vol.Schema(inner), {"collapsed": name not in ("sleep", "weather")}
            )
        return self.async_show_form(step_id="init", data_schema=vol.Schema(schema))
