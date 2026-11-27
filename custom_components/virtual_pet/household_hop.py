"""One durable Hop puzzle shared by the people who care for a pet."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date
import re
from typing import TYPE_CHECKING, Any

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from . import activity_support, hop, model, rates
from .const import DOMAIN

if TYPE_CHECKING:
    from .coordinator import PetCoordinator

RULE_VERSION = 1
MAX_REVISION = 2**53 - 1
KEY = "household_hop"
CONTROL = "button.play"
ACTIONS = {"start", "move", "undo", "handoff", "restart"}
TOKEN = re.compile(r"[0-9a-f]{32}\Z")
BOARD_ID = re.compile(r"[0-9a-f]{10}\Z")


def _revision(value: Any) -> bool:
    return type(value) is int and 0 <= value <= MAX_REVISION


def _day(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) != 10:
        return None
    try:
        return value if date.fromisoformat(value).isoformat() == value else None
    except ValueError:
        return None


@dataclass(frozen=True, slots=True)
class Mutation:
    """The exact request that a client may send again after a lost response."""

    id: str
    action: str
    revision: int
    cell: int | None = None

    def valid(self) -> bool:
        return (
            isinstance(self.id, str)
            and TOKEN.fullmatch(self.id) is not None
            and isinstance(self.action, str)
            and self.action in ACTIONS
            and _revision(self.revision)
            and (
                type(self.cell) is int and 0 <= self.cell < len(hop.LETTERS)
                if self.action == "move"
                else self.cell is None
            )
        )

    @classmethod
    def read(cls, data: Any, revision: int) -> Mutation | None:
        if not isinstance(data, dict):
            return None
        request = cls(
            data.get("id"), data.get("action"), data.get("revision"), data.get("cell")
        )
        return request if request.valid() and request.revision == revision - 1 else None

    def store(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "action": self.action,
            "revision": self.revision,
            "cell": self.cell,
        }


def _board(data: Any) -> hop.Board | None:
    if not isinstance(data, dict):
        return None
    board_id, world, rows = data.get("id"), data.get("world"), data.get("grid")
    if (
        not isinstance(board_id, str)
        or BOARD_ID.fullmatch(board_id) is None
        or not isinstance(world, str)
        or world not in hop.WORLD_TWIST
        or not isinstance(rows, list)
        or not 1 <= len(rows) <= 4
        or any(not isinstance(row, str) or not 1 <= len(row) <= 6 for row in rows)
        or any(type(data.get(key)) is not int for key in ("w", "h", "specials"))
    ):
        return None
    try:
        return hop.Board.from_dict(data)
    except (KeyError, TypeError, ValueError):
        return None


@dataclass(frozen=True, slots=True)
class Progress:
    revision: int = 0
    day: str | None = None
    board: hop.Board | None = None
    moves: str = ""
    handoff: bool = False
    finished: bool = False
    unsupported: bool = False
    receipt: Mutation | None = None

    @classmethod
    def read(cls, data: Any, ref: str) -> Progress:
        if not isinstance(data, dict) or data.get("ref") != ref:
            return cls()
        rev = data.get("revision")
        day = _day(data.get("day"))
        unavailable = cls(
            revision=rev if _revision(rev) else 0, day=day, unsupported=True
        )
        if (
            type(data.get("rule_version")) is not int
            or data["rule_version"] != RULE_VERSION
        ):
            return unavailable
        board = _board(data.get("board"))
        moves = data.get("moves")
        if (
            board is None
            or day is None
            or not _revision(rev)
            or rev == 0
            or not isinstance(moves, str)
            or len(moves) > rates.HOP_MAX_MOVES
        ):
            return unavailable
        replay = hop.replay(board, moves) if moves else None
        if replay is not None and not replay["legal"]:
            return unavailable
        finished = replay["won"] if replay else False
        return cls(
            revision=rev,
            day=day,
            board=board,
            moves=moves,
            handoff=bool(moves) and not finished and data.get("handoff") is True,
            finished=finished,
            receipt=Mutation.read(data.get("receipt"), rev),
        )

    def can_start(self, day: str) -> bool:
        return (
            self.unsupported
            or self.board is None
            or (self.finished and self.day is not None and self.day < day)
        )

    def view(self, today: str) -> dict[str, Any]:
        status = (
            "unsupported"
            if self.unsupported
            else "empty"
            if self.board is None
            else "complete"
            if self.finished
            else "active"
        )
        view = {
            "status": status,
            "revision": self.revision,
            "can_start": self.can_start(today) and self.revision < MAX_REVISION,
        }
        if self.board is not None:
            view.update(
                day=self.day,
                board=self.board.to_dict(),
                moves=self.moves,
                handoff=self.handoff,
                rule_version=RULE_VERSION,
            )
        return view

    def store(self, ref: str) -> dict[str, Any]:
        assert self.board is not None and self.receipt is not None
        return {
            "ref": ref,
            "rule_version": RULE_VERSION,
            "revision": self.revision,
            "day": self.day,
            "board": self.board.to_dict(),
            "moves": self.moves,
            "handoff": self.handoff,
            "finished": self.finished,
            "receipt": self.receipt.store(),
        }

    def advance(self, request: Mutation) -> Progress | None:
        board = self.board
        if board is None or self.finished:
            return None
        next_step = replace(self, revision=self.revision + 1, receipt=request)
        if request.action == "move" and len(self.moves) < rates.HOP_MAX_MOVES:
            state = (
                hop.State.from_dict(hop.replay(board, self.moves)["final"])
                if self.moves
                else hop.start_state(board)
            )
            assert request.cell is not None
            landing = hop.apply_move(board, state, request.cell)
            if landing is not None:
                return replace(
                    next_step,
                    moves=self.moves + hop.LETTERS[request.cell],
                    handoff=False,
                    finished=landing.done,
                )
        if self.moves:
            if request.action == "undo":
                return replace(next_step, moves=self.moves[:-1], handoff=False)
            if request.action == "restart":
                return replace(next_step, moves="", handoff=False)
            if request.action == "handoff" and not self.handoff:
                return replace(next_step, handoff=True)
        return None


def _progress(pet: PetCoordinator, ref: str) -> Progress:
    return Progress.read(getattr(pet.state, "unknown", {}).get(KEY), ref)


def _today(pet: PetCoordinator) -> str:
    return pet._today(pet._now())[0]


def view(pet: PetCoordinator) -> dict[str, Any]:
    """The committed, anonymous puzzle for the permission-checked channel."""
    return _progress(pet, activity_support.incarnation(pet)).view(_today(pet))


def _generate(
    pet_id: str,
    ref: str,
    day: str,
    world: str,
    species: str,
    stage: str,
    solo_stage: str,
) -> hop.Board:
    family = hop.family_of(species)
    specials, w, h = hop.params_for(stage, day)
    solo = hop.hop_board(pet_id, day, world, family, *hop.params_for(solo_stage, day))
    namespace = f"household|{ref}"
    for round_no in range(4):
        candidate = hop.hop_board(
            namespace, day, world, family, specials, w, h, n=round_no
        )
        if candidate.grid != solo.grid:
            return candidate
    if candidate.fallback:
        # Fallbacks have no directional twist. A turn preserves all moves and
        # makes a different board even when both seeds reach the same fallback.
        turned = tuple(row[::-1] for row in reversed(candidate.grid))
        return replace(
            candidate,
            grid=turned,
            id=hop.board_id(namespace, day, world, w, h, turned, family, specials),
        )
    return candidate


def _inputs(pet: PetCoordinator, today: str) -> tuple[str, str, str, str]:
    state = pet.state
    assert state is not None and state.species
    stage = model.life_stage(state)
    solo = state.hop_day
    solo_stage = solo.get("stage") if solo.get("day") == today else stage
    if not isinstance(solo_stage, str) or solo_stage not in hop.STAGES:
        solo_stage = stage
    return pet.world, state.species, stage, solo_stage


def _available(pet: PetCoordinator) -> bool:
    state = pet.state
    return bool(
        state is not None
        and state.species
        and model.life_stage(state) != "egg"
        and not (
            state.asleep or state.sick or state.call or (state.away and pet.privacy)
        )
    )


def _current_pet(pet: PetCoordinator, ref: str) -> bool:
    return (
        pet.state is not None
        and pet._current()
        and activity_support.incarnation(pet) == ref
    )


async def act(
    pet: PetCoordinator,
    ref: str,
    request: Mutation,
    is_allowed: Callable[[], bool],
) -> dict[str, Any]:
    """Apply a move to the current revision, or return the canonical board."""

    def check() -> tuple[Progress, str, str | None]:
        today = _today(pet)
        current = _progress(pet, ref)
        if not _current_pet(pet, ref):
            return current, today, "pet_changed"
        if not is_allowed():
            return current, today, "read_only"
        if not request.valid():
            return current, today, "illegal"
        if request == current.receipt:
            return current, today, "ok"
        if request.revision != current.revision:
            return current, today, "changed"
        if current.revision == MAX_REVISION or (
            current.receipt and request.id == current.receipt.id
        ):
            return current, today, "illegal"
        # Ordinary care uses the live companion clock. This step is only for a
        # fresh mutation. Viewing or retrying a committed action never advances it.
        pet._advance(pet._now())
        return current, today, None if _available(pet) else "not_now"

    def reply(progress: Progress, today: str, result: str) -> dict[str, Any]:
        if result in {"pet_changed", "read_only"}:
            return {"result": result}
        return {"result": result, "state": progress.view(today)}

    lock = activity_support.gameplay_lock(pet)
    async with lock:
        current, today, result = check()
        if result is not None:
            return reply(current, today, result)
        if request.action != "start":
            candidate = current.advance(request)
            if candidate is None:
                return reply(current, today, "illegal")
            result = await _commit(pet, ref, candidate, is_allowed)
            return reply(candidate if result == "ok" else current, today, result)
        if not current.can_start(today):
            return reply(current, today, "illegal")
        inputs = _inputs(pet, today)
        key = (ref, today, *inputs)
        pending = getattr(pet, "_household_hop_generation", None)
        if pending and pending[0] == key and not pending[1].done():
            job = pending[1]
        else:
            job = pet.hass.async_add_executor_job(
                _generate, pet.pet_id, ref, today, *inputs
            )
            pet._household_hop_generation = (key, job)

    board = await asyncio.shield(job)
    async with lock:
        current, now, result = check()
        if result is not None:
            return reply(current, now, result)
        if now != today or _inputs(pet, now) != inputs:
            return reply(current, now, "changed")
        candidate = Progress(current.revision + 1, today, board, receipt=request)
        result = await _commit(pet, ref, candidate, is_allowed)
        return reply(candidate if result == "ok" else current, now, result)


class _CommitRefused(Exception):
    """The queued write lost access to the companion before it could start."""


async def _commit(
    pet: PetCoordinator, ref: str, progress: Progress, is_allowed: Callable[[], bool]
) -> str:
    state = pet.state
    assert state is not None
    record = progress.store(ref)

    def snapshot() -> dict[str, Any]:
        if not _current_pet(pet, ref):
            raise _CommitRefused("pet_changed")
        if not is_allowed():
            raise _CommitRefused("read_only")
        if not _available(pet):
            raise _CommitRefused("not_now")
        return {**state.to_dict(), KEY: record}

    try:
        await pet.async_save_now(snapshot=snapshot)
    except _CommitRefused as err:
        return str(err)
    vars(state).setdefault("unknown", {})[KEY] = record
    if not _current_pet(pet, ref):
        return "pet_changed"
    pet._publish()
    return "ok"


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/{KEY}",
        vol.Required("entity_id"): cv.entity_id,
        vol.Required("pet_ref"): vol.Match(TOKEN),
        vol.Required("action"): vol.In({"view", *ACTIONS}),
        vol.Optional("request_id"): vol.Match(TOKEN),
        vol.Optional("revision"): vol.All(int, vol.Range(min=0, max=MAX_REVISION)),
        vol.Optional("cell"): vol.All(int, vol.Range(min=0, max=len(hop.LETTERS) - 1)),
    }
)
@websocket_api.async_response
async def websocket_household_hop(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    entity_id, ref, action = msg["entity_id"], msg["pet_ref"], msg["action"]
    pet = activity_support.pet_for(hass, connection, entity_id)
    if pet is None:
        connection.send_error(msg["id"], "forbidden", "The companion is unavailable")
        return
    if activity_support.incarnation(pet) != ref:
        connection.send_result(msg["id"], {"result": "pet_changed"})
        return

    def is_allowed() -> bool:
        return (
            activity_support.pet_for(hass, connection, entity_id, control=CONTROL)
            is pet
        )

    if action == "view":
        result = {"result": "ok", "state": view(pet), "can_edit": is_allowed()}
    else:
        result = await act(
            pet,
            ref,
            Mutation(
                msg.get("request_id"), action, msg.get("revision"), msg.get("cell")
            ),
            is_allowed,
        )
    connection.send_result(msg["id"], result)


@callback
def register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_household_hop)
