"""An invited parent and the hatchling's first bedtime together."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from homeassistant.auth.permissions.const import POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.helpers import (
    config_validation as cv,
    device_registry as dr,
    entity_registry as er,
)
import voluptuous as vol

from . import activity_support, model, rates as R
from .const import DOMAIN

if TYPE_CHECKING:
    from .coordinator import PetCoordinator

KEY = "family_bedtime"
_TOKEN = r"[0-9a-f]{32}\Z"
_LAST_HOUR = dict(R.STAGE_STARTS)["baby"] + 7 * 24


def evening(hour: int) -> bool:
    """Use the same hours as the ordinary tuck-in."""
    return hour >= R.TUCK_IN_EVENING_HOUR or hour < 3


def parent_seed(pet: PetCoordinator) -> dict[str, str] | None:
    """The adult that was kept in its own shell."""
    device = dr.async_get(pet.hass).async_get_device_by_identifier(
        (DOMAIN, pet.pet_id), pet.pet_id
    )
    if device:
        return {"device": device.id, "ref": activity_support.incarnation(pet)}
    return None


def _link(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("device"), str)
        and 0 < len(value["device"]) <= 96
        and isinstance(value.get("ref"), str)
        and re.fullmatch(_TOKEN, value["ref"]) is not None
    )


def save_seed(pet: PetCoordinator, link: Any) -> bool:
    """Put a separate egg's link in its first saved state."""
    if not _link(link):
        return False
    assert pet.state is not None
    vars(pet.state).setdefault("unknown", {})[KEY] = {
        "child": activity_support.incarnation(pet),
        "parent": link,
    }
    return True


def record(pet: PetCoordinator) -> dict[str, Any] | None:
    state = pet.state
    if state is None:
        return None
    row = getattr(state, "unknown", {}).get(KEY)
    if (
        isinstance(row, dict)
        and row.get("child") == activity_support.incarnation(pet)
        and _link(row.get("parent"))
    ):
        return row
    return None


def _parent(pet: PetCoordinator, row: dict[str, Any]) -> PetCoordinator | None:
    link = row["parent"]
    device = dr.async_get(pet.hass).async_get(link["device"])
    if device is None:
        return None
    pets = pet.hass.data[DOMAIN]["pets"]
    for domain, key in device.identifiers:
        parent = pets.get(key) if domain == DOMAIN else None
        state = parent.state if parent is not None and parent is not pet else None
        if (
            state is not None
            and activity_support.incarnation(parent) == link["ref"]
            and model.life_stage(state) == "adult"
            and state.species in parent.species_names
        ):
            return parent
    return None


def eligible(pet: PetCoordinator, now: float) -> bool:
    """Whether a linked hatchling may start or confirm a bedtime."""
    state = pet.state
    return (
        state is not None
        and not state.asleep
        and not state.lights_out
        and not state.sick
        and state.call is None
        and not (state.away and pet.privacy)
        and model.life_stage(state) != "egg"
        and state.age_hours < _LAST_HOUR
        and evening(pet._today(now)[1])
    )


def view(pet: PetCoordinator) -> dict[str, bool] | None:
    """Share the offer only. The parent's art is a separate permission check."""
    row = record(pet)
    if (
        row
        and "completed" not in row
        and eligible(pet, pet._now())
        and _parent(pet, row) is not None
    ):
        return {"offer": True}
    return None


def consume_echo(pet: PetCoordinator) -> str | None:
    """Mark the next ordinary evening sleep for a live, child-only echo."""
    row = record(pet)
    if not row or row.get("echoed") or not isinstance(row.get("completed"), str):
        return None
    row["echoed"] = True
    return row["child"]


def _art(
    pet: PetCoordinator, connection: websocket_api.ActiveConnection, row: dict[str, Any]
) -> dict[str, Any] | None:
    parent = _parent(pet, row)
    if parent is None:
        return None
    registry = er.async_get(pet.hass)
    stage = registry.async_get_entity_id(
        "sensor", DOMAIN, f"{parent.pet_id}_life_stage"
    )
    permissions = connection.user.permissions
    if not stage or not permissions.check_entity(stage, POLICY_READ):
        return None
    asleep = registry.async_get_entity_id(
        "binary_sensor", DOMAIN, f"{parent.pet_id}_asleep"
    )
    # Use the parent's normal public sleep state, including its privacy setting.
    asleep_visible = bool(asleep and permissions.check_entity(asleep, POLICY_READ))
    sleeping = pet.hass.states.get(asleep) if asleep_visible else None
    assert parent.state is not None
    return {
        "species": parent.state.species,
        "asleep": bool(sleeping and sleeping.state == "on"),
    }


async def _act(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
    pet: PetCoordinator,
) -> dict[str, Any]:
    """Resolve both identities under the child's gameplay lock."""
    entity = msg["entity_id"]
    ref = msg["pet_ref"]
    request = msg["request_id"]

    def current() -> bool:
        return (
            activity_support.pet_for(
                hass, connection, entity, control="switch.lights_out"
            )
            is pet
            and pet._current()
            and activity_support.incarnation(pet) == ref
        )

    async with activity_support.gameplay_lock(pet):
        if not current():
            return {"result": "pet_changed"}
        row = record(pet)
        if row is None or (art := _art(pet, connection, row)) is None:
            return {"result": "unavailable"}
        if "completed" in row:
            result = (
                "ok"
                if msg["action"] == "tuck" and row["completed"] == request
                else "completed"
            )
            return {"result": result}
        if not eligible(pet, pet._now()):
            return {"result": "not_now"}
        if msg["action"] == "invite":
            return {"result": "ok", "parent": art}

        def can_tuck(now: float) -> bool:
            live = record(pet)
            return (
                current()
                and live is row
                and _art(pet, connection, live) is not None
                and eligible(pet, now)
            )

        result = await pet._set_lights_out(
            True,
            Context(user_id=connection.user.id),
            family_request=request,
            can_tuck=can_tuck,
        )
        return {"result": result if current() else "pet_changed"}


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/family_bedtime",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("pet_ref"): vol.Match(_TOKEN),
        vol.Required("request_id"): vol.Match(_TOKEN),
        vol.Required("action"): vol.In(("invite", "tuck")),
    }
)
@websocket_api.async_response
async def websocket_family_bedtime(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    pet = activity_support.pet_for(
        hass, connection, msg["entity_id"], control="switch.lights_out"
    )
    if pet is None:
        connection.send_error(msg["id"], "forbidden", "Bedtime is unavailable")
        return
    connection.send_result(msg["id"], await _act(hass, connection, msg, pet))


@callback
def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_family_bedtime)
