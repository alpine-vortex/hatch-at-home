"""A virtual pet that lives in Home Assistant."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from homeassistant.auth.permissions.const import POLICY_CONTROL
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
    ATTR_CATEGORY,
    ATTR_CONFIG_ENTRY_ID,
    ATTR_ENABLED,
    ATTR_END,
    ATTR_FINISH,
    ATTR_FROM_STATE,
    ATTR_GAME,
    ATTR_GUESS,
    ATTR_HEADLINE,
    ATTR_HELD,
    ATTR_HOURS,
    ATTR_MATCH,
    ATTR_REACTION,
    ATTR_SOURCE,
    ATTR_TEXT,
    ATTR_TO_STATE,
    ATTR_TOPIC,
    CARD_FILENAME,
    CONF_AQI,
    CONF_INDOOR_TEMP,
    CONF_RAIN,
    CONF_SOLAR,
    CONF_WEATHER,
    DOMAIN,
    FRONTEND_URL,
    HOUSE_CATEGORIES,
    SERVICE_FAST_FORWARD,
    SERVICE_MY_DAY,
    SERVICE_NOTIFY_ME,
    SERVICE_PLAY_GAME,
    SERVICE_REACT,
    SERVICE_SET_SHELL,
    SERVICE_SHARE_NEWS,
    SERVICE_VISIT,
    STORE_VERSION,
    VERSION,
)
from .coordinator import (
    PetConfigEntry,
    PetCoordinator,
    PetStore,
    RenameError,
    async_rename,
)
from .defaults import default_weather
from .home import news_text
from .model import GAMES
from .people import ANSWERS, ASK_AGAIN_KINDS, People
from .react import REACTIONS

_LOGGER = logging.getLogger(__name__)

# The options of the weather section: the migration fills the field only when
# none of them is set (the player has already chosen how the pet sees the sky).
WEATHER_SECTION = (CONF_RAIN, CONF_INDOOR_TEMP, CONF_AQI, CONF_SOLAR, CONF_WEATHER)

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
        # End the game in progress instead (the card's "maybe later").
        vol.Optional(ATTR_END, default=False): cv.boolean,
        # The card on a shared screen: a berry dig is the household's, not the
        # signed-in user's (the screen's own claim, as on the channel).
        vol.Optional("shared", default=False): cv.boolean,
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
# virtual_pet.react (ha-signals H8). The text never raises (a blank one is no
# text, a long one is cut), so no player's words reach a log in an error.
REACT_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_ids,
        vol.Required(ATTR_CATEGORY): vol.In(HOUSE_CATEGORIES),
        # The entity that changed: read for its domain and H3 / H6's options,
        # kept nowhere.
        vol.Optional(ATTR_SOURCE): vol.Any(None, cv.entity_id),
        vol.Optional(ATTR_FROM_STATE): vol.Any(None, cv.string),
        vol.Optional(ATTR_TO_STATE): vol.Any(None, cv.string),
        vol.Optional(ATTR_HELD): vol.Any(None, vol.Coerce(float)),
        vol.Optional(ATTR_MATCH): vol.Any(None, cv.string),
        vol.Optional(ATTR_REACTION): vol.In(REACTIONS),
        vol.Optional(ATTR_TEXT): lambda v: news_text(v, R.REACT_TEXT_MAX) or None,
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


CARD_PATH = Path(__file__).parent / "frontend" / CARD_FILENAME


def _card_hash() -> str | None:
    """First 8 hex of the card file's sha256, or None if it can't be read."""
    try:
        return hashlib.sha256(CARD_PATH.read_bytes()).hexdigest()[:8]
    except FileNotFoundError:
        # The card is built from src/card/ and gitignored: a copy of
        # custom_components/ from a branch or a git clone has none.
        _LOGGER.error(
            "The card file %s is missing: run `node scripts/build-card.js` in "
            "the repo, or install the release zip through HACS",
            CARD_PATH,
        )
        return None
    except OSError as err:
        _LOGGER.debug("card hash unavailable, using plain version: %s", err)
        return None


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the card, load it on every dashboard, register the debug service."""
    # Long cache headers: every URL the card asks for carries ?v=VERSION, so an
    # update fetches new files and a reload doesn't re-ask for 1,400 sprites.
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_URL, str(Path(__file__).parent / "frontend"), True)]
    )
    # The card's URL carries the version and a hash of the card file, so
    # browsers fetch a changed card even when VERSION was not bumped (dev, a
    # forgotten bump). The hash is taken once, here: a dev edit to the card
    # needs an HA restart to show up, as before.
    card_hash = await hass.async_add_executor_job(_card_hash)
    version = f"{VERSION}-{card_hash}" if card_hash else VERSION
    add_extra_js_url(hass, f"{FRONTEND_URL}/{CARD_FILENAME}?v={version}")
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
    websocket_api.async_register_command(hass, websocket_follow)
    websocket_api.async_register_command(hass, websocket_forget_birthday)
    websocket_api.async_register_command(hass, websocket_birthday_phone)
    websocket_api.async_register_command(hass, websocket_baby_talk)
    websocket_api.async_register_command(hass, websocket_photos)
    websocket_api.async_register_command(hass, websocket_forget_me)
    websocket_api.async_register_command(hass, websocket_ask_again)
    websocket_api.async_register_command(hass, websocket_subscribe)
    websocket_api.async_register_command(hass, websocket_notify_me)
    websocket_api.async_register_command(hass, websocket_linked)
    websocket_api.async_register_command(hass, websocket_greeted)
    websocket_api.async_register_command(hass, websocket_my_day)
    websocket_api.async_register_command(hass, websocket_set_shell)
    websocket_api.async_register_command(hass, websocket_rename)
    websocket_api.async_register_command(hass, websocket_collect)
    websocket_api.async_register_command(hass, websocket_collection)

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
        if call.data[ATTR_END]:
            return await pet_of(call).async_end_game(
                kind, call.context, call.data["shared"]
            )
        if guess is not None and guess not in GAMES[kind]:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="wrong_guess",
                translation_placeholders={
                    "guess": guess,
                    "guesses": " or ".join(GAMES[kind]),
                },
            )
        return await pet_of(call).async_play_game(
            guess, call.context, kind, call.data["shared"]
        )

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

    async def react(call: ServiceCall) -> ServiceResponse:
        category = call.data[ATTR_CATEGORY]
        custom = category == "custom"
        if custom and ATTR_REACTION not in call.data:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="no_reaction"
            )
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
            pet_id: pet.react(
                category,
                source=call.data.get(ATTR_SOURCE),
                from_state=call.data.get(ATTR_FROM_STATE),
                to_state=call.data.get(ATTR_TO_STATE),
                held=call.data.get(ATTR_HELD),
                match=call.data.get(ATTR_MATCH),
                reaction=call.data.get(ATTR_REACTION) if custom else None,
                # Words only with Custom; with a category, its own lines.
                text=call.data.get(ATTR_TEXT) if custom else None,
            )
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
    hass.services.async_register(
        DOMAIN,
        SERVICE_REACT,
        react,
        schema=REACT_SCHEMA,
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
        vol.Required("question"): vol.In([*ANSWERS, "birthday", "fav_visitor"]),
        vol.Required("answer"): cv.string,
        # A follow-up's typed text (F1): any value passes the schema, so a schema
        # failure (logged at ERROR with the value) can never echo it; the handler
        # takes only a string, cleans and cuts it (people.clean_text).
        vol.Optional("text"): object,
        # "anything big this week?": the day they picked (opp #2), an ISO date.
        vol.Optional("day"): cv.string,
        vol.Optional("shared"): bool,
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
    free = (
        "birthday",
        "fav_visitor",
    )  # checked by the pet (a date; its world's visitors)
    if msg["question"] not in free and msg["answer"] not in ANSWERS[msg["question"]]:
        connection.send_error(msg["id"], "invalid_answer", "Not an answer to that")
        return
    # Never a shared screen's text: it's one person's, said back only to them.
    text = None if msg.get("shared") else msg.get("text")
    try:
        kept = await pet.async_answer(
            connection.user.id, msg["question"], msg["answer"], text, msg.get("day")
        )
    except ValueError:
        connection.send_error(msg["id"], "not_asked", "It didn't ask that")
        return
    # A follow-up's yes: {"until": its last day}, so the typing browser keeps its own copy
    # of the words that long (owner Q1 A on critique s2632); else nothing.
    connection.send_result(msg["id"], kept)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/follow",
        vol.Required("entity_id"): cv.entity_id,
        # A first look or a tab's return, or the game picker (F6).
        vol.Optional("at", default="look"): vol.In(["look", "picker"]),
    }
)
@websocket_api.async_response
async def websocket_follow(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """A follow-up beat due for the person asking (F1): {kind, beat, text?} or
    {}. Theirs only (connection.user.id), and said once across their screens. A
    websocket command, so nothing of it is on the event bus or recorded."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None or pet.state is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    connection.send_result(
        msg["id"], await pet.async_follow(connection.user.id, msg["at"])
    )


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
            await pet.async_forget_games(user)  # their parked Berry dig names them
            pet.async_set_updated_data(pet.state)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/ask_again",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("kind"): vol.In(ASK_AGAIN_KINDS),
        # No default, and refused unless False: a card that forgets the flag, or a
        # shared screen, changes nothing (a card-honesty guard, as the gift path).
        vol.Required("shared"): bool,
    }
)
@websocket_api.async_response
async def websocket_ask_again(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Ask me again (memory plan M0-c): the signed-in person's favourite of this
    kind is dropped and the pet asks it afresh on a later look. Only on their own
    screen. A websocket command, so the choice stays off the event bus."""
    if msg["shared"] is not False:
        connection.send_error(
            msg["id"], "shared", "That is asked again on its person's own screen"
        )
        return
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    await pet.async_ask_again(connection.user.id, msg["kind"])
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
        vol.Required("type"): f"{DOMAIN}/linked",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("other"): cv.entity_id,
    }
)
@callback
def websocket_linked(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The card played the infrared link between two of the house's pets: each
    counts the other once today, for the social meter (top10 §6). Nothing about
    who was looking is kept."""
    registry = er.async_get(hass)
    pets = hass.data[DOMAIN]["pets"]
    found = []
    for key in ("entity_id", "other"):
        entity = registry.async_get(msg[key])
        found.append(pets.get(entity.config_entry_id) if entity else None)
    one, two = found
    if one is None or two is None or one is two:
        connection.send_error(msg["id"], "no_pet", "Two different pets are needed")
        return
    one.social_link(two.pet_id)
    two.social_link(one.pet_id)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/greeted",
        vol.Required("entity_id"): cv.entity_id,
    }
)
@callback
def websocket_greeted(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The card played the day's visitor to someone, on any screen (a shared
    one too, which the hourly `visit` call never credits): the pet counts a
    greeted visitor for the social meter, once a day and only while the visit
    is on. It carries nobody's name, and nothing about who was looking is kept."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    pet.social_greet()
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/rename",
        vol.Required("entity_id"): cv.entity_id,
        # Any value passes the schema (a schema failure is logged with it); the
        # handler takes only a clean string of 1-20 characters (bad_name).
        vol.Required("name"): object,
    }
)
@websocket_api.async_response
async def websocket_rename(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Name the new generation, in its first day (egg or baby), for any login that
    may control the pet. A websocket command is not covered by the service layer's
    permission check, so this one asks for POLICY_CONTROL itself. Like set_shell,
    who renamed isn't recorded. A not_ready answer is retryable: the entry is
    reloading (a lay that moved the world)."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    if entity is None or entity.platform != DOMAIN or not entity.config_entry_id:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    if not connection.user.permissions.check_entity(msg["entity_id"], POLICY_CONTROL):
        connection.send_error(msg["id"], "read_only", "This login can't name the pet")
        return
    try:
        name = await async_rename(hass, entity.config_entry_id, msg["name"])
    except RenameError as err:
        connection.send_error(msg["id"], err.code, "The pet was not renamed")
        return
    connection.send_result(msg["id"], {"name": name})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/collect",
        vol.Required("entity_id"): cv.entity_id,
        # V-E review #1: optional, so V-C's {type, entity_id} tap still works;
        # `shared` has no default, so the gift path can't fail open.
        vol.Optional("gift", default=False): bool,
        vol.Optional("shared"): bool,
    }
)
@websocket_api.async_response
async def websocket_collect(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The basket tap (plan visitors v2 §3): the finds waiting, in order, as
    {id, world, new, from?}, and the basket empties for every screen. Any
    login, shared and read-only too (the basket is the household's). A
    websocket command, so who tapped isn't recorded. Nothing is awaited
    before the read-and-clear: a second tap gets [].

    With `gift: true` it is instead the caller's own gift (plan visitors v2
    §5): {gift: {id, world}} or {gift: null}, never the basket. Only when the
    screen says `shared: false` outright; absent or true is refused with
    `shared` (a card bug's guard: `shared` is the client's own claim, as on
    subscribe). Without `gift` the basket path is unchanged and `shared`
    ignored."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None or pet.state is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    if msg["gift"]:
        if msg.get("shared") is not False:
            connection.send_error(
                msg["id"], "shared", "A gift is taken on its person's own screen"
            )
            return
        gift = pet.take_gift(connection.user.id)
        connection.send_result(msg["id"], {"gift": gift})
        if gift is not None:
            await pet.async_save_now()  # never given twice
        return
    finds = pet.collect()
    connection.send_result(msg["id"], {"finds": finds})
    if finds:
        await pet.async_save_now()  # review V-B #18: never revealed twice


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/collection",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("shared"): bool,
    }
)
@websocket_api.async_response
async def websocket_collection(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The collection page's read (plan visitors v2 §4): {world, visitors:
    [id], finds: {id: day}} for the pet's current world. Any login, read-only
    too. `shared` is required like subscribe's: an unshared screen also gets
    `gifts`, the caller's own given finds of this world (V-E). Pure: no
    advance, no save, no publish."""
    entity = er.async_get(hass).async_get(msg["entity_id"])
    pet: PetCoordinator | None = (
        hass.data[DOMAIN]["pets"].get(entity.config_entry_id) if entity else None
    )
    if pet is None or pet.state is None:
        connection.send_error(msg["id"], "no_pet", "No pet owns that entity")
        return
    connection.send_result(
        msg["id"], pet.collection_view(connection.user.id, msg["shared"])
    )


async def async_migrate_entry(hass: HomeAssistant, entry: PetConfigEntry) -> bool:
    """Bring an old entry up to date.

    Minor 2 (ha-signals H2): a pet with nothing set in the weather section
    starts on the house's weather, once. After that the options are the
    player's: clearing the field keeps it clear. Only a lower minor is touched,
    and a minor is never lowered."""
    if entry.version > 1:
        return False
    if entry.minor_version < 2:
        options = dict(entry.options)
        weather = (
            None
            if any(options.get(k) for k in WEATHER_SECTION)
            else default_weather(hass)
        )
        if weather:
            options[CONF_WEATHER] = weather
            _LOGGER.debug("weather default set")
        hass.config_entries.async_update_entry(entry, options=options, minor_version=2)
    return True


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
