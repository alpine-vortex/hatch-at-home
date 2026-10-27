"""A virtual pet that lives in Home Assistant."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import ATTR_ENTITY_ID, Platform
from homeassistant.core import (
    Event,
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv, entity_registry as er
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.typing import ConfigType
import voluptuous as vol

from . import notify
from .const import (
    ATTR_CONFIG_ENTRY_ID,
    ATTR_ENABLED,
    ATTR_GUESS,
    ATTR_HOURS,
    CARD_FILENAME,
    DOMAIN,
    FRONTEND_URL,
    SERVICE_FAST_FORWARD,
    SERVICE_NOTIFY_ME,
    SERVICE_PLAY_GAME,
    STORE_VERSION,
    VERSION,
)
from .coordinator import PetConfigEntry, PetCoordinator, PetStore
from .model import SIDES

PLATFORMS = [Platform.BINARY_SENSOR, Platform.BUTTON, Platform.SENSOR, Platform.SWITCH]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# Fired by the Home Assistant app when a notification button is pressed.
EVENT_NOTIFICATION_ACTION = "mobile_app_notification_action"

NOTIFY_ME_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_id,
        vol.Required(ATTR_ENABLED): cv.boolean,
    }
)
PLAY_GAME_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_id,
        vol.Required(ATTR_GUESS): vol.In(SIDES),
    }
)
FAST_FORWARD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_HOURS): vol.All(
            vol.Coerce(float), vol.Range(min=0.1, max=168)
        ),
        vol.Optional(ATTR_CONFIG_ENTRY_ID): cv.string,
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the card, load it on every dashboard, register the debug service."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(Path(__file__).parent / "frontend"), False)]
    )
    # The version in the URL makes browsers fetch the new card after an update.
    add_extra_js_url(hass, f"{FRONTEND_URL}/{CARD_FILENAME}?v={VERSION}")

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

    def pet_of(call: ServiceCall) -> PetCoordinator:
        """The loaded pet that owns the call's entity."""
        entity = er.async_get(hass).async_get(call.data[ATTR_ENTITY_ID])
        entry = (
            hass.config_entries.async_get_entry(entity.config_entry_id)
            if entity and entity.config_entry_id
            else None
        )
        if (
            entry is None
            or entry.domain != DOMAIN
            or getattr(entry, "runtime_data", None) is None
        ):
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="no_pet"
            )
        return entry.runtime_data

    async def notify_me(call: ServiceCall) -> None:
        # Anyone signed in may opt themselves in or out; nobody else.
        user_id = call.context.user_id
        if user_id is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="no_pet"
            )
        await pet_of(call).async_set_notify(user_id, call.data[ATTR_ENABLED])

    async def play_game(call: ServiceCall) -> ServiceResponse:
        return await pet_of(call).async_play_game(call.data[ATTR_GUESS], call.context)

    hass.services.async_register(
        DOMAIN, SERVICE_NOTIFY_ME, notify_me, schema=NOTIFY_ME_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_PLAY_GAME,
        play_game,
        schema=PLAY_GAME_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )

    async def notification_button(event: Event) -> None:
        """A button on a pet's phone notification (mobile_app) was pressed."""
        parsed = notify.parse_action(str(event.data.get("action", "")))
        if parsed is None:
            return
        entry = hass.config_entries.async_get_entry(parsed[0])
        if entry is None or entry.domain != DOMAIN:
            return
        coordinator: PetCoordinator | None = getattr(entry, "runtime_data", None)
        if coordinator is not None:
            await coordinator.async_notification_button(parsed[1], event.context)

    hass.bus.async_listen(EVENT_NOTIFICATION_ACTION, notification_button)

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
    coordinator.async_start_home()
    return True


async def async_unload_entry(hass: HomeAssistant, entry: PetConfigEntry) -> bool:
    """Put the pet away. The coordinator saves itself on shutdown."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: PetConfigEntry) -> None:
    """Delete the pet's save file when the integration is removed."""
    await PetStore(hass, STORE_VERSION, f"{DOMAIN}.{entry.entry_id}").async_remove()
