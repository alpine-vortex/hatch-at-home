"""A virtual pet that lives in Home Assistant."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import persistent_notification
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
from homeassistant.helpers import (
    config_validation as cv,
    entity_registry as er,
    issue_registry as ir,
)
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.typing import ConfigType
import voluptuous as vol

from . import notify, rates as R
from .const import (
    ATTR_CONFIG_ENTRY_ID,
    ATTR_ENABLED,
    ATTR_GAME,
    ATTR_GUESS,
    ATTR_HEADLINE,
    ATTR_HOURS,
    ATTR_TOPIC,
    CARD_FILENAME,
    DOMAIN,
    FRONTEND_URL,
    SERVICE_FAST_FORWARD,
    SERVICE_NOTIFY_ME,
    SERVICE_PLAY_GAME,
    SERVICE_SHARE_NEWS,
    STORE_VERSION,
    VERSION,
)
from .coordinator import PetConfigEntry, PetCoordinator, PetStore
from .home import news_text
from .model import GAMES

PLATFORMS = [
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
]

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
        vol.Optional(ATTR_GAME, default="left_right"): vol.In(list(GAMES)),
        # Without a guess, the call starts a game and returns its opening.
        vol.Optional(ATTR_GUESS): vol.In(
            sorted({g for gs in GAMES.values() for g in gs})
        ),
    }
)
SHARE_NEWS_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Required(ATTR_HEADLINE): vol.All(
            cv.string,
            lambda v: news_text(v, R.NEWS_HEADLINE_MAX),
            vol.Length(min=1, msg="the headline is empty"),
        ),
        vol.Optional(ATTR_TOPIC): vol.All(
            cv.string, lambda v: news_text(v, R.NEWS_TOPIC_MAX)
        ),
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
        return pet_for(call.data[ATTR_ENTITY_ID])

    def pet_for(entity_id: str) -> PetCoordinator:
        """The loaded pet that owns this entity."""
        entity = er.async_get(hass).async_get(entity_id)
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
        kind = call.data[ATTR_GAME]
        guess = call.data.get(ATTR_GUESS)
        if guess is not None and guess not in GAMES[kind]:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="wrong_guess",
                translation_placeholders={
                    "guess": guess,
                    "guesses": " or ".join(GAMES[kind]),
                },
            )
        return await pet_of(call).async_play_game(guess, call.context, kind)

    async def share_news(call: ServiceCall) -> ServiceResponse:
        pets = {p.pet_id: p for p in map(pet_for, call.data[ATTR_ENTITY_ID])}
        return {
            pet_id: pet.share_news(call.data[ATTR_HEADLINE], call.data.get(ATTR_TOPIC))
            for pet_id, pet in pets.items()
        }

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

    hass.services.async_register(
        DOMAIN,
        SERVICE_SHARE_NEWS,
        share_news,
        schema=SHARE_NEWS_SCHEMA,
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
    for key in ("missing_entities", "world_not_ready"):
        ir.async_delete_issue(hass, DOMAIN, f"{key}_{entry.entry_id}")
    persistent_notification.async_dismiss(hass, f"{DOMAIN}_{entry.entry_id}_welcome")
    await PetStore(hass, STORE_VERSION, f"{DOMAIN}.{entry.entry_id}").async_remove()
