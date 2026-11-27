"""The Hearth corgi's tasting discoveries and retryable Snack attempts."""

from __future__ import annotations

from collections.abc import Callable
import hashlib
from itertools import islice
import math
import secrets
from typing import TYPE_CHECKING, Any
from weakref import WeakKeyDictionary

from homeassistant.components import websocket_api
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from . import activity_support, model
from .const import DOMAIN

if TYPE_CHECKING:
    from .coordinator import PetCoordinator

KEY = "tasting"
VERSION = 1
RECIPES = ("apple", "pumpkin")
EATEN = (model.OK, "spoiled")
OUTCOMES = (*EATEN, "full", "asleep", "not_now")
RETRY_SECONDS = 10 * 60
MAX_ATTEMPTS = 64
HEX_ID = vol.Match(r"[a-f0-9]{32}\Z")
# Care events are sent after the durable write. If it fails in this process,
# the same attempt can retry the write without applying care a second time.
_PENDING: WeakKeyDictionary[
    PetCoordinator, dict[str, tuple[list[model.Event], str | None]]
] = WeakKeyDictionary()


def _eligible(pet: PetCoordinator) -> bool:
    state = pet.state
    return (
        state is not None
        and pet.world == "hearth"
        and state.species == "corgi"
        and model.life_stage(state) != "egg"
    )


def _favourite(ref: str) -> str:
    return RECIPES[int(ref[-1], 16) % len(RECIPES)]


def _saved(state: model.PetState, ref: str) -> dict[str, Any]:
    record = getattr(state, "unknown", {}).get(KEY)
    if (
        isinstance(record, dict)
        and record.get("ref") == ref
        and type(record.get("version")) is int
        and record["version"] == VERSION
    ):
        return record
    return {}


def _tasted(saved: dict[str, Any]) -> list[str]:
    tasted = saved.get("tasted")
    return [
        recipe for recipe in RECIPES if isinstance(tasted, list) and recipe in tasted
    ]


def view(pet: PetCoordinator) -> dict[str, Any] | None:
    """Share recipe discoveries, without exposing an unknown preference or receipts."""
    state = pet.state
    if state is None or not _eligible(pet):
        return None
    ref = activity_support.incarnation(pet)
    tasted = _tasted(_saved(state, ref))
    preferred = _favourite(ref)
    return {
        "version": VERSION,
        "tasted": tasted,
        "preferred": preferred if preferred in tasted else None,
    }


def _active(saved: dict[str, Any], now: float) -> dict[str, dict[str, Any]]:
    attempts = saved.get("attempts")
    if not isinstance(attempts, dict):
        return {}
    kept = {}
    for serve_id, attempt in islice(attempts.items(), MAX_ATTEMPTS):
        if not isinstance(attempt, dict):
            continue
        expires = attempt.get("expires")
        if (
            type(expires) not in (float, int)
            or not now < expires < math.inf
            or attempt.get("recipe") not in RECIPES
            or not isinstance(attempt.get("token"), str)
            or not isinstance(attempt.get("caller"), str)
            or attempt.get("result") not in (None, *OUTCOMES)
        ):
            continue
        kept[serve_id] = attempt
    return kept


def _record(
    state: model.PetState,
    ref: str,
    tasted: list[str],
    attempts: dict[str, dict[str, Any]],
) -> None:
    vars(state).setdefault("unknown", {})[KEY] = {
        "ref": ref,
        "version": VERSION,
        "tasted": tasted,
        "attempts": attempts,
    }


def _reply(serve_id: str, recipe: str, result: str, **details: Any) -> dict[str, Any]:
    return {"serve_id": serve_id, "recipe": recipe, "result": result, **details}


def _same_pet(pet: PetCoordinator, ref: str) -> bool:
    return (
        pet.state is not None
        and pet._current()
        and activity_support.incarnation(pet) == ref
    )


async def _flush(
    pet: PetCoordinator, ref: str, serve_id: str, recipe: str
) -> dict[str, Any] | None:
    await pet.async_save_now()
    if not _same_pet(pet, ref):
        return _reply(serve_id, recipe, "pet_changed")
    pending = _PENDING.get(pet)
    if pending is not None and (effects := pending.pop(serve_id, None)) is not None:
        events, person = effects
        pet._fire_care(events, person, tasting=True)
        pet._publish()
    return None


async def act(
    pet: PetCoordinator,
    ref: str,
    action: str,
    recipe: str,
    serve_id: str,
    user: str,
    token: str | None,
    authorized: Callable[[], bool],
) -> dict[str, Any]:
    """Issue or settle one attempt. The issued token remains valid across reloads."""
    async with activity_support.gameplay_lock(pet):
        if not _same_pet(pet, ref):
            return _reply(serve_id, recipe, "pet_changed")
        if not _eligible(pet) or not authorized():
            return _reply(serve_id, recipe, "not_now")
        state = pet.state
        assert state is not None
        if recipe not in RECIPES:
            return _reply(serve_id, recipe, "not_now")
        caller = hashlib.sha256(f"{ref}:{user}".encode()).hexdigest()
        saved = _saved(state, ref)
        tasted = _tasted(saved)
        attempts = _active(saved, pet._now())
        pending = _PENDING.get(pet)
        if pending is not None:
            for dropped in pending.keys() - attempts.keys():
                del pending[dropped]

        attempt = attempts.get(serve_id)
        if attempt and (attempt["caller"] != caller or attempt["recipe"] != recipe):
            return _reply(serve_id, recipe, "not_now")
        if action == "issue":
            if token is not None:
                return _reply(serve_id, recipe, "not_now")
            if attempt is None:
                if len(attempts) >= MAX_ATTEMPTS:
                    return _reply(serve_id, recipe, "busy")
                attempt = {
                    "caller": caller,
                    "recipe": recipe,
                    "token": secrets.token_hex(16),
                    "expires": pet._now() + RETRY_SECONDS,
                }
                attempts[serve_id] = attempt
                _record(state, ref, tasted, attempts)
            changed = await _flush(pet, ref, serve_id, recipe)
            return changed or _reply(serve_id, recipe, "ready", token=attempt["token"])

        if (
            attempt is None
            or not token
            or not secrets.compare_digest(token, attempt["token"])
        ):
            return _reply(serve_id, recipe, "expired")
        if (result := attempt.get("result")) is None:
            context = Context(user_id=user)
            by = await pet._who(context)
            person = await pet._person(context)
            if not _same_pet(pet, ref):
                return _reply(serve_id, recipe, "pet_changed")
            if not authorized():
                return _reply(serve_id, recipe, "not_now")
            now = pet._now()
            if now >= attempt["expires"]:
                return _reply(serve_id, recipe, "expired")
            pet._advance(now)
            if not _eligible(pet) or state.sick or (state.away and pet.privacy):
                result, events = "not_now", []
            else:
                # Calls can begin after the click. Let the ordinary Snack
                # rules decide what happens, including eating a spoiled snack.
                result, events = pet._apply_care_action(
                    "snack", now, by, person, tasting=True
                )
            preferred = result in EATEN and recipe == _favourite(ref)
            attempt = {
                **attempt,
                "result": result,
                "preferred": preferred,
                "recognized": preferred and recipe in tasted,
            }
            if result in EATEN and recipe not in tasted:
                tasted.append(recipe)
            attempts[serve_id] = attempt
            _record(state, ref, tasted, attempts)
            _PENDING.setdefault(pet, {})[serve_id] = (events, person)
        if serve_id in _PENDING.get(pet, {}):
            changed = await _flush(pet, ref, serve_id, recipe)
            if changed:
                return changed
        return _reply(
            serve_id,
            recipe,
            result,
            preferred=attempt.get("preferred") is True,
            recognized=attempt.get("recognized") is True,
        )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/tasting",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("pet_ref"): HEX_ID,
        vol.Required("version"): vol.In((VERSION,)),
        vol.Required("action"): vol.In(("issue", "serve")),
        vol.Required("recipe"): vol.In(RECIPES),
        vol.Required("serve_id"): HEX_ID,
        vol.Optional("token"): HEX_ID,
    }
)
@websocket_api.async_response
async def websocket_tasting(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    def resolve() -> PetCoordinator | None:
        return activity_support.pet_for(
            hass, connection, msg["entity_id"], control="button.snack"
        )

    pet = resolve()
    if pet is None:
        connection.send_error(msg["id"], "forbidden", "Snack is unavailable")
        return
    try:
        result = await act(
            pet,
            msg["pet_ref"],
            msg["action"],
            msg["recipe"],
            msg["serve_id"],
            connection.user.id,
            msg.get("token"),
            lambda: resolve() is pet,
        )
    except OSError:
        connection.send_error(msg["id"], "save_failed", "Could not save the serving")
        return
    connection.send_result(msg["id"], result)


@callback
def register(hass: HomeAssistant) -> None:
    """Register the tasting command."""
    websocket_api.async_register_command(hass, websocket_tasting)
