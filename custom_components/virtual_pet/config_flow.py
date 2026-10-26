"""Config flow: name the pet and pick its device's world.

Settings come later as options.
"""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_NAME
from homeassistant.helpers.selector import (
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
)
import voluptuous as vol

from .const import CONF_WORLD, DEFAULT_NAME, DEFAULT_WORLD, DOMAIN
from .species import load_catalog


class VirtualPetConfigFlow(ConfigFlow, domain=DOMAIN):
    """Set up a new device with an egg in it."""

    VERSION = 1

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
