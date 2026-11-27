"""Two Woodland furnishings, saved with the current pet."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from . import activity_support, model
from .const import DOMAIN

if TYPE_CHECKING:
    from .coordinator import PetCoordinator

VERSION = 1
MAX_REVISION = 2**53 - 1
PROPS = ("hideout", "cup")
type Slots = tuple[str | None, str | None]
EMPTY: Slots = (None, None)


@dataclass(frozen=True, slots=True)
class Layout:
    """Validated assignments at one incarnation's revision."""

    revision: int = 0
    slots: Slots = EMPTY

    @classmethod
    def read(cls, saved: Any, ref: str) -> Layout:
        if (
            not isinstance(saved, dict)
            or saved.get("ref") != ref
            or not _version(saved.get("version"))
            or not _revision(saved.get("revision"))
        ):
            return cls()
        raw = saved.get("slots")
        if not isinstance(raw, list) or len(raw) != 2:
            return cls(revision=saved["revision"])
        left, right = (prop if prop in PROPS else None for prop in raw)
        return cls(saved["revision"], (left, right if right != left else None))

    def store(self, ref: str) -> dict[str, Any]:
        return {
            "version": VERSION,
            "ref": ref,
            "revision": self.revision,
            "slots": list(self.slots),
        }

    def view(self, cup: bool) -> dict[str, Any]:
        return {
            "version": VERSION,
            "revision": self.revision,
            "slots": [
                None if prop == "cup" and not cup else prop for prop in self.slots
            ],
            "cup": cup,
        }


def _version(value: Any) -> bool:
    return type(value) is int and value == VERSION


def _revision(value: Any) -> bool:
    return type(value) is int and 0 <= value <= MAX_REVISION


def _has_acorn(state: model.PetState) -> bool:
    return "acorn" in state.collection.get("woodland", {}).get("finds", {})


def _layout(state: model.PetState, ref: str) -> Layout:
    return Layout.read(getattr(state, "unknown", {}).get("habitat"), ref)


def view(pet: PetCoordinator) -> dict[str, Any] | None:
    """Publish the shared layout and the same device's collection unlock."""
    state = pet.state
    if state is None or pet.world != "woodland":
        return None
    ref = activity_support.incarnation(pet)
    return _layout(state, ref).view(_has_acorn(state))


async def confirm(
    pet: PetCoordinator, ref: str, version: int, revision: int, slots: list[Any]
) -> dict[str, Any]:
    """Compare and replace both slots in a single durable edit."""
    async with activity_support.gameplay_lock(pet):
        state = pet.state
        if (
            state is None
            or not pet._current()
            or activity_support.incarnation(pet) != ref
        ):
            return {"result": "pet_changed"}
        if pet.world != "woodland":
            return {"result": "not_now"}
        layout = _layout(state, ref)
        cup = _has_acorn(state)
        current = layout.view(cup)
        if not _version(version) or not _revision(revision):
            return {"result": "changed", **current}
        if revision == layout.revision - 1 and slots == current["slots"]:
            return {"result": "ok", **current}
        if (
            model.life_stage(state) == "egg"
            or state.asleep
            or state.sick
            or state.call is not None
            or (state.away and pet.privacy)
        ):
            return {"result": "not_now"}
        if revision != layout.revision or revision == MAX_REVISION:
            return {"result": "changed", **current}
        left, right = slots
        allowed = (None, *PROPS) if cup else (None, "hideout")
        if (
            left not in allowed
            or right not in allowed
            or (left is not None and left == right)
        ):
            return {"result": "illegal", **current}
        if slots == current["slots"]:
            return {"result": "ok", **current}
        updated = Layout(revision + 1, (left, right))
        saved = updated.store(ref)
        # Other care and subscriptions continue to see the committed slots
        # while this snapshot is being written.
        await pet.async_save_now(snapshot=lambda: state.to_dict() | {"habitat": saved})
        if not pet._current() or activity_support.incarnation(pet) != ref:
            return {"result": "pet_changed"}
        vars(state).setdefault("unknown", {})["habitat"] = saved
        pet._publish()
        return {"result": "ok", **updated.view(_has_acorn(state))}


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/habitat",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("pet_ref"): vol.All(str, vol.Length(min=1, max=96)),
        vol.Required("action"): vol.In(("confirm",)),
        vol.Required("version"): vol.All(int, vol.Range(min=1, max=MAX_REVISION)),
        vol.Required("revision"): vol.All(int, vol.Range(min=0, max=MAX_REVISION)),
        vol.Required("slots"): vol.All(
            [vol.In((None, *PROPS))], vol.Length(min=2, max=2)
        ),
    }
)
@websocket_api.async_response
async def websocket_habitat(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    pet = activity_support.pet_for(
        hass, connection, msg["entity_id"], control="button.play"
    )
    if pet is None:
        connection.send_error(msg["id"], "forbidden", "Furnishing is unavailable")
        return
    result = await confirm(
        pet, msg["pet_ref"], msg["version"], msg["revision"], msg["slots"]
    )
    connection.send_result(msg["id"], result)


@callback
def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_habitat)
