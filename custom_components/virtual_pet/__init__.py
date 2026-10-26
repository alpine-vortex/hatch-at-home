"""A virtual pet that lives in Home Assistant."""

from __future__ import annotations

from homeassistant.const import Platform
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.typing import ConfigType
import voluptuous as vol

from .const import (
    ATTR_CONFIG_ENTRY_ID,
    ATTR_HOURS,
    DOMAIN,
    SERVICE_FAST_FORWARD,
    STORE_VERSION,
)
from .coordinator import PetConfigEntry, PetCoordinator, PetStore

PLATFORMS = [Platform.BINARY_SENSOR, Platform.BUTTON, Platform.SENSOR, Platform.SWITCH]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

FAST_FORWARD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_HOURS): vol.All(
            vol.Coerce(float), vol.Range(min=0.01, max=168)
        ),
        vol.Optional(ATTR_CONFIG_ENTRY_ID): cv.string,
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the debug service."""

    async def fast_forward(call: ServiceCall) -> ServiceResponse:
        entries: list[PetConfigEntry] = hass.config_entries.async_loaded_entries(DOMAIN)
        if entry_id := call.data.get(ATTR_CONFIG_ENTRY_ID):
            entries = [e for e in entries if e.entry_id == entry_id]
        if not entries:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="no_pet"
            )
        results = {}
        for entry in entries:
            results[entry.entry_id] = await entry.runtime_data.async_fast_forward(
                call.data[ATTR_HOURS]
            )
        return results

    async_register_admin_service(
        hass,
        DOMAIN,
        SERVICE_FAST_FORWARD,
        fast_forward,
        schema=FAST_FORWARD_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: PetConfigEntry) -> bool:
    """Wake the pet up."""
    coordinator = PetCoordinator(hass, entry)
    await coordinator.async_load()
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PetConfigEntry) -> bool:
    """Put the pet away. The coordinator saves itself on shutdown."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: PetConfigEntry) -> None:
    """Delete the pet's save file when the integration is removed."""
    await PetStore(hass, STORE_VERSION, f"{DOMAIN}.{entry.entry_id}").async_remove()
