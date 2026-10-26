"""Config flow. Phase 1 asks only for a name; settings come later as options."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_NAME
import voluptuous as vol

from .const import DEFAULT_NAME, DOMAIN


class VirtualPetConfigFlow(ConfigFlow, domain=DOMAIN):
    """Hatch a new pet."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Name the pet."""
        if user_input is not None:
            name = user_input[CONF_NAME].strip() or DEFAULT_NAME
            return self.async_create_entry(title=name, data={CONF_NAME: name})
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {vol.Required(CONF_NAME, default=DEFAULT_NAME): str}
            ),
        )
