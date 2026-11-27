"""The authored Tidepool walk and its household checkpoint."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from . import activity_support, model
from .const import DOMAIN

if TYPE_CHECKING:
    from .coordinator import PetCoordinator

VERSION = 1
MAX_REVISION = 2**53 - 1  # exact on the card too

GRAPH = {
    "landing": {"walk": "fork"},
    "fork": {"pool": "pool_edge", "ridge": "ridge"},
    "pool_edge": {"wait": "pool_signal", "look": "pool_early"},
    "pool_early": {"wait": "pool_signal", "look": "pool_early"},
    "pool_signal": {"look": "pool_ending"},
    "pool_ending": {"return": None},
    "ridge": {"low": "ridge_empty", "high": "ridge_ending"},
    "ridge_empty": {"low": "ridge_empty", "high": "ridge_ending"},
    "ridge_ending": {"return": None},
}
ENDINGS = {"pool_ending": "pool", "ridge_ending": "ridge"}
ACTIONS = {action for choices in GRAPH.values() for action in choices}


def valid_revision(value: Any) -> bool:
    return type(value) is int and 0 <= value <= MAX_REVISION


def _current_version(version: Any) -> bool:
    return type(version) is int and version == VERSION


@dataclass(frozen=True, slots=True)
class Checkpoint:
    """A cleared node starts at the landing while retaining the revision."""

    revision: int = 0
    node: str | None = None
    seen: tuple[str, ...] = ()
    last_action: str | None = None
    last_completion: str | None = None

    @property
    def place(self) -> str:
        return self.node or "landing"

    @classmethod
    def read(cls, saved: Any, ref: str) -> Checkpoint:
        if not isinstance(saved, dict) or saved.get("ref") != ref:
            return cls()
        rev = saved.get("revision")
        seen = saved.get("seen")
        checkpoint = cls(
            revision=rev if valid_revision(rev) else 0,
            seen=tuple(
                route
                for route in ENDINGS.values()
                if isinstance(seen, list) and route in seen
            ),
        )
        # A graph change clears its unfinished node and receipt. First-route
        # discoveries and the revision still belong to this pet.
        if not _current_version(saved.get("version")):
            return checkpoint
        node = saved.get("node")
        if node is not None and (not isinstance(node, str) or node not in GRAPH):
            return checkpoint
        if not valid_revision(rev) or rev == 0:
            return checkpoint
        action = saved.get("last_action")
        completion = saved.get("last_completion")
        if action == "return" and node is None and completion in checkpoint.seen:
            return replace(checkpoint, last_action="return", last_completion=completion)
        if isinstance(action, str) and any(
            action in choices and choices[action] == node for choices in GRAPH.values()
        ):
            return replace(checkpoint, node=node, last_action=action)
        return replace(checkpoint, node=node)

    def view(self, result: str = "ok", completed: str | None = None) -> dict[str, Any]:
        return {
            "result": result,
            "version": VERSION,
            "revision": self.revision,
            "node": self.place,
            "completed": completed,
        }

    def store(self, ref: str) -> dict[str, Any]:
        return {
            "version": VERSION,
            "ref": ref,
            "revision": self.revision,
            "node": self.node,
            "seen": list(self.seen),
            "last_action": self.last_action,
            "last_completion": self.last_completion,
        }

    def move(self, action: str) -> Checkpoint | None:
        choices = GRAPH[self.place]
        if action not in choices or self.revision == MAX_REVISION:
            return None
        completion = ENDINGS[self.place] if action == "return" else None
        seen = (
            (*self.seen, completion)
            if completion and completion not in self.seen
            else self.seen
        )
        return Checkpoint(self.revision + 1, choices[action], seen, action, completion)


async def _save(
    pet: PetCoordinator,
    old: Checkpoint,
    next_step: Checkpoint,
    ref: str,
) -> None:
    """Save the move, first memory, and collection credit together."""
    state = pet.state
    assert state is not None
    unknown = vars(state).setdefault("unknown", {})
    previous = unknown.get("outing")
    had_previous = "outing" in unknown
    unknown["outing"] = next_step.store(ref)
    memory = None
    trimmed = []
    glass = None
    route = next_step.last_completion
    if route:
        now = pet._now()
        if route not in old.seen:
            memory = {
                "kind": f"outing_{route}",
                "at": now,
                "generation": state.generation,
                "born": state.born,
            }
            state.memories.append(memory)
            trimmed = state.memories[: -model.MEMORIES_KEPT]
            del state.memories[: -model.MEMORIES_KEPT]
        if route == "ridge":
            page = state.collection.setdefault(
                "tidepool", {"visitors": {}, "finds": {}}
            )
            finds = page.setdefault("finds", {})
            if "greenseaglass" not in finds:
                glass = pet._today(now)[0]
                finds["greenseaglass"] = glass
    try:
        await pet.async_save_now()
    except BaseException:
        if had_previous:
            unknown["outing"] = previous
        else:
            unknown.pop("outing", None)
        if memory is not None:
            kept = [row for row in state.memories if row is not memory]
            state.memories[:] = [*trimmed, *kept][-model.MEMORIES_KEPT :]
        if glass is not None and finds.get("greenseaglass") == glass:
            finds.pop("greenseaglass")
        raise


async def act(
    pet: PetCoordinator,
    ref: str,
    action: str,
    revision: int | None = None,
    version: int | None = None,
) -> dict[str, Any]:
    async with activity_support.gameplay_lock(pet):
        state = pet.state
        if (
            state is None
            or not pet._current()
            or activity_support.incarnation(pet) != ref
        ):
            return {"result": "pet_changed"}
        checkpoint = Checkpoint.read(getattr(state, "unknown", {}).get("outing"), ref)
        if (
            action != "view"
            and _current_version(version)
            and valid_revision(revision)
            and revision == checkpoint.revision - 1
            and action == checkpoint.last_action
        ):
            return checkpoint.view(completed=checkpoint.last_completion)
        if (
            pet.world != "tidepool"
            or model.life_stage(state) == "egg"
            or state.asleep
            or state.sick
            or state.call is not None
            or (state.away and pet.privacy)
        ):
            return {"result": "not_now"}
        if action == "view":
            return checkpoint.view()
        if (
            not _current_version(version)
            or not valid_revision(revision)
            or revision != checkpoint.revision
        ):
            return checkpoint.view("changed")
        next_step = checkpoint.move(action)
        if next_step is None:
            return checkpoint.view("illegal")
        await _save(pet, checkpoint, next_step, ref)
        if not pet._current() or activity_support.incarnation(pet) != ref:
            return {"result": "pet_changed"}
        if next_step.last_completion:
            pet._publish()
        return next_step.view(completed=next_step.last_completion)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/outing",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("pet_ref"): vol.All(str, vol.Length(min=1, max=96)),
        vol.Required("action"): vol.In({"view", *ACTIONS}),
        vol.Optional("version"): vol.All(int, vol.Range(min=1, max=MAX_REVISION)),
        vol.Optional("revision"): vol.All(int, vol.Range(min=0, max=MAX_REVISION)),
    }
)
@websocket_api.async_response
async def websocket_outing(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    # A view only reads the checkpoint. Every move requires the Play entity.
    action = msg["action"]
    pet = activity_support.pet_for(
        hass,
        connection,
        msg["entity_id"],
        control=None if action == "view" else "button.play",
    )
    if pet is None:
        connection.send_error(msg["id"], "unavailable", "The outing is unavailable")
        return
    result = await act(
        pet, msg["pet_ref"], action, msg.get("revision"), msg.get("version")
    )
    connection.send_result(msg["id"], result)


def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_outing)
