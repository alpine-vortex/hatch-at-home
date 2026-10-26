"""Config flow. Phase 1 asks only for a name; settings come later as options."""

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

from .const import CONF_SPECIES, DEFAULT_NAME, DEFAULT_SPECIES, DOMAIN
from .species import load_species


class VirtualPetConfigFlow(ConfigFlow, domain=DOMAIN):
    """Hatch a new pet."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Name the pet and pick what it is."""
        if user_input is not None:
            name = user_input[CONF_NAME].strip() or DEFAULT_NAME
            return self.async_create_entry(
                title=name,
                data={CONF_NAME: name, CONF_SPECIES: user_input[CONF_SPECIES]},
            )
        species = await self.hass.async_add_executor_job(load_species)
        options = [
            SelectOptionDict(value=key, label=data.get("name", key))
            for key, data in species.items()
        ]
        default = DEFAULT_SPECIES if DEFAULT_SPECIES in species else options[0]["value"]
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_NAME, default=DEFAULT_NAME): str,
                    vol.Required(CONF_SPECIES, default=default): SelectSelector(
                        SelectSelectorConfig(options=options)
                    ),
                }
            ),
        )
