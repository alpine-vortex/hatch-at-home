"""A virtual pet that lives in Home Assistant."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import persistent_notification, websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import ATTR_ENTITY_ID, Platform
from homeassistant.core import (
    Event,
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import (
    config_validation as cv,
    entity_registry as er,
    issue_registry as ir,
)
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util
import voluptuous as vol

from . import channel, notify, rates as R
from .const import (
    ATTR_CONFIG_ENTRY_ID,
    ATTR_ENABLED,
    ATTR_FINISH,
    ATTR_GAME,
    ATTR_GUESS,
    ATTR_HEADLINE,
    ATTR_HOURS,
    ATTR_TOPIC,
    CARD_FILENAME,
    DOMAIN,
    FRONTEND_URL,
    SERVICE_FAST_FORWARD,
    SERVICE_MY_DAY,
    SERVICE_NOTIFY_ME,
    SERVICE_PLAY_GAME,
    SERVICE_SET_SHELL,
    SERVICE_SHARE_NEWS,
    SERVICE_VISIT,
    STORE_VERSION,
    VERSION,
)
from .coordinator import PetConfigEntry, PetCoordinator, PetStore
from .home import news_text
from .model import GAMES
from .people import ANSWERS, People

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
# A finish the card draws, or None for the world's own. Whether the pet has
# grown into it is the coordinator's call.
SHELL_FINISH = vol.Any(None, vol.In(R.SHELL_FINISHES))
SET_SHELL_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_id,
        # Left out (as an automation's UI can't send null): the world's own.
        vol.Optional(ATTR_FINISH, default=None): SHELL_FINISH,
    }
)
VISIT_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_id,
        # Lines the card already queued at this look (an older card sends none).
        vol.Optional("queued", default=0): vol.All(vol.Coerce(int), vol.Range(0, 6)),
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
    # Long cache headers: every URL the card asks for carries ?v=VERSION, so an
    # update fetches new files and a reload doesn't re-ask for 1,400 sprites.
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(Path(__file__).parent / "frontend"), True)]
    )
    # The version in the URL makes browsers fetch the new card after an update.
    add_extra_js_url(hass, f"{FRONTEND_URL}/{CARD_FILENAME}?v={VERSION}")
    # What the pets know about each person, shared; the loaded pets; and the
    # re-call notification each person gets for all of them.
    people = People(hass)
    await people.async_load()
    # Who watches each pet on the private channel (virtual_pet/subscribe), by
    # config entry: in memory, and outliving a reload's coordinator.
    hass.data[DOMAIN] = {
        "people": people,
        "pets": {},
        "recalls": notify.Recalls(),
        "watchers": {},
    }
    websocket_api.async_register_command(hass, websocket_answer)
    websocket_api.async_register_command(hass, websocket_forget_birthday)
    websocket_api.async_register_command(hass, websocket_birthday_phone)
    websocket_api.async_register_command(hass, websocket_baby_talk)
    websocket_api.async_register_command(hass, websocket_photos)
    websocket_api.async_register_command(hass, websocket_forget_me)
    websocket_api.async_register_command(hass, websocket_subscribe)
    websocket_api.async_register_command(hass, websocket_notify_me)
    websocket_api.async_register_command(hass, websocket_my_day)
    websocket_api.async_register_command(hass, websocket_set_shell)

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
                translation_domain=DOMAIN, translation_key="not_signed_in"
            )
        await pet_of(call).async_set_notify(user_id, call.data[ATTR_ENABLED])

    async def signed_in(call: ServiceCall) -> str | None:
        """The person calling (None for a system user); nobody: an error."""
        user_id = call.context.user_id
        if user_id is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="not_signed_in"
            )
        user = await hass.auth.async_get_user(user_id)
        return user_id if user is not None and not user.system_generated else None

    async def visit(call: ServiceCall) -> ServiceResponse:
        # The card says who's looking in. What the pet tells them comes back
        # to them alone, in the response.
        if user_id := await signed_in(call):
            return await pet_of(call).async_visit(user_id, call.data["queued"])
        return {"notes": []}

    async def my_day(call: ServiceCall) -> None:
        # Each person opts themselves in or out; nobody else.
        if user_id := await signed_in(call):
            await pet_of(call).async_set_my_day(user_id, call.data[ATTR_ENABLED])

    async def set_shell(call: ServiceCall) -> None:
        # For automations. A service call is logged with whoever made it; the
        # card uses the websocket command, which isn't.
        await pet_of(call).async_set_shell(call.data[ATTR_FINISH])

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
        # One pet that isn't loaded doesn't keep the news from the others.
        pets: dict[str, PetCoordinator] = {}
        for entity_id in call.data[ATTR_ENTITY_ID]:
            try:
                pet = pet_for(entity_id)
            except ServiceValidationError:
                continue
            pets[pet.pet_id] = pet
        if not pets:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="no_pet"
            )
        return {
            pet_id: pet.share_news(call.data[ATTR_HEADLINE], call.data.get(ATTR_TOPIC))
            for pet_id, pet in pets.items()
        }

    hass.services.async_register(
        DOMAIN, SERVICE_NOTIFY_ME, notify_me, schema=NOTIFY_ME_SCHEMA
    )

    hass.services.async_register(
        DOMAIN,
        SERVICE_VISIT,
        visit,
        schema=VISIT_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_MY_DAY, my_day, schema=NOTIFY_ME_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SET_SHELL, set_shell, schema=SET_SHELL_SCHEMA
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/answer",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("question"): vol.In([*ANSWERS, "birthday"]),
        vol.Required("answer"): cv.string,
    }
)
@websocket_api.async_response
async def websocket_answer(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """An answer to a pet's question ("what's your favourite weather?").

    A websocket command, not a service: a service call is an event on the bus,
    and the recorder would keep the answer. Only for the person asking.
    """
    entity = er.async_get(hass).async_get(msg["entity_id"])
    # Only a loaded pet: a disabled entry may still hold its old coordinator.
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    if msg["question"] != "birthday" and msg["answer"] not in ANSWERS[msg["question"]]:
        connection.send_error(msg["id"], "invalid_answer", "Not an answer to that")
        return
    try:
        await pet.async_answer(connection.user.id, msg["question"], msg["answer"])
    except ValueError:
        connection.send_error(msg["id"], "not_asked", "It didn't ask that")
        return
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/forget_birthday",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def websocket_forget_birthday(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Forget the signed-in person's birthday (and don't ask again)."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    await pet.async_forget_birthday(connection.user.id)
    connection.send_result(msg["id"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/forget_me"})
@websocket_api.async_response
async def websocket_forget_me(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Forget my data: the signed-in person's record in the people store (their
    birthday, answers and settings for every pet), theirs only. Bonds stay. A
    websocket command, so nothing about it is on the event bus or recorded."""
    people: People = hass.data[DOMAIN]["people"]
    user = connection.user.id
    async with people.lock(user):  # a visit that's running finishes first
        await people.forget(user)
    for pet in hass.data[DOMAIN]["pets"].values():
        pet._moved.pop(user, None)  # today's moves go with the rest
        pet._private.pop(user, None)  # and their private moments
        if pet.state is not None:
            pet.async_set_updated_data(pet.state)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/birthday_phone",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def websocket_birthday_phone(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Whether the signed-in person's phone hears "happy birthday" (off by
    default). A websocket command, so the choice stays off the event bus."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    await pet.async_set_birthday_phone(connection.user.id, msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/baby_talk",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def websocket_baby_talk(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Simpler words from babies and children on the signed-in person's cards
    (off by default). A websocket command, so the choice stays off the event
    bus."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    await pet.async_set_baby_talk(connection.user.id, msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/photos",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@websocket_api.async_response
async def websocket_photos(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The signed-in person's photos from this pet's family, for their journal.
    A websocket command, so they reach only that person."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    connection.send_result(msg["id"], {"photos": pet.photos(connection.user.id)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/subscribe",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("shared"): bool,
    }
)
@callback
def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The private channel: the signed-in person's own view of a pet (their
    bond, their switches, their moments) and the house's, pushed to this
    connection alone as it changes. A shared screen gets the house's only."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:  # also mid-reload: the card asks again
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    user, shared = connection.user.id, msg["shared"]

    @callback
    def send(payload: dict) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    token, connection.subscriptions[msg["id"]] = channel.add(
        hass, pet.pet_id, user, shared, send
    )
    connection.send_result(msg["id"])
    send(pet.channel_snapshot(token, user, shared))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/notify_me",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def websocket_notify_me(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The signed-in person's phone hears this pet, or stops. A websocket
    command, so who opted in isn't recorded (the service stays, for
    automations)."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    await pet.async_set_notify(connection.user.id, msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/my_day",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("enabled"): bool,
    }
)
@websocket_api.async_response
async def websocket_my_day(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Let the pets notice the signed-in person's day, or stop. A websocket
    command, so who turned it on isn't recorded (the service stays, for
    automations)."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    await pet.async_set_my_day(connection.user.id, msg["enabled"])
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_shell",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("finish"): SHELL_FINISH,
    }
)
@websocket_api.async_response
async def websocket_set_shell(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Dress the pet in a shell finish, or its world's own (null). The card's
    only way to: a websocket command, so who picked it isn't recorded (the
    set_shell service is, and stays for automations)."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    try:
        await pet.async_set_shell(msg["finish"])
    except ServiceValidationError:
        connection.send_error(msg["id"], "shell_locked", "Not grown into that yet")
        return
    connection.send_result(msg["id"])


async def async_setup_entry(hass: HomeAssistant, entry: PetConfigEntry) -> bool:
    """Wake the pet up."""
    coordinator = PetCoordinator(hass, entry)
    await coordinator.async_load()
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator
    hass.data[DOMAIN]["pets"][entry.entry_id] = coordinator
    coordinator.async_start_channel()  # a card open across a reload: a snapshot
    recalls: notify.Recalls = hass.data[DOMAIN]["recalls"]
    for send in recalls.clear_stale(
        list(coordinator.state.notify_users) if coordinator.state else [],
        _recall_sender(hass),
    ):
        hass.async_create_background_task(send, f"{DOMAIN} notify")
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    coordinator.async_start_home()
    return True


def _recall_sender(hass: HomeAssistant) -> notify.Send:
    """Clears the re-call notification with no pet to send it."""

    async def send(users: list[str], text: str) -> None:
        await notify.send(hass, users, text, notify.RECALL_TAG)

    return send


def _refresh_recalls(hass: HomeAssistant) -> None:
    """A removed pet no longer asks in anyone's re-call notification (the
    last one too: no pet left to send it)."""
    data = hass.data.get(DOMAIN, {})
    recalls: notify.Recalls | None = data.get("recalls")
    if recalls is None:
        return
    pets: dict[str, PetCoordinator] = data["pets"]
    asking = [a for pet in pets.values() if (a := pet.asking()) is not None]
    for send in recalls.update(
        asking, None, dt_util.utcnow().timestamp(), _recall_sender(hass)
    ):
        hass.async_create_background_task(send, f"{DOMAIN} notify")


async def async_unload_entry(hass: HomeAssistant, entry: PetConfigEntry) -> bool:
    """Put the pet away. The coordinator saves itself on shutdown."""
    pets: dict[str, PetCoordinator] = hass.data[DOMAIN]["pets"]
    pets.pop(entry.entry_id, None)
    if pets:  # a reload of the only pet (options) keeps its bundle
        _refresh_recalls(hass)
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: PetConfigEntry) -> None:
    """Delete the pet's save file when the integration is removed. Backups of a
    damaged one (.damaged.*) are the owner's to delete: its repair named them."""
    for key in ("missing_entities", "world_not_ready", "save_damaged"):
        ir.async_delete_issue(hass, DOMAIN, f"{key}_{entry.entry_id}")
    persistent_notification.async_dismiss(hass, f"{DOMAIN}_{entry.entry_id}_welcome")
    if DOMAIN in hass.data:
        channel.gone(hass, entry.entry_id)
    _refresh_recalls(hass)
    await PetStore(hass, STORE_VERSION, f"{DOMAIN}.{entry.entry_id}").async_remove()
