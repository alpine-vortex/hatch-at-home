"""The scheduled Tidepool crab's calling card survives the visit rollover."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
import hashlib
from typing import TYPE_CHECKING, Any

from homeassistant.util import dt as dt_util

from . import activity_support, model, rates

if TYPE_CHECKING:
    from .coordinator import PetCoordinator

WORLD = "tidepool"
VISITOR = "shorecrab"
KEY = "shore_crab"
VERSION = 1
WINDOW_SECONDS = rates.VISIT_HOURS * 3600


def _window(record: Any) -> tuple[str, int, int] | None:
    """Validate the same bounded window for the schedule and retained record."""
    if not isinstance(record, dict):
        return None
    if record.get("world") != WORLD or record.get("id") != VISITOR:
        return None
    day, start, end = (record.get(key) for key in ("day", "from", "until"))
    if not isinstance(day, str) or len(day) != 10:
        return None
    if (
        type(start) not in (float, int)
        or type(end) not in (float, int)
        or not 0 < start < end <= 253402300799
        or end - start != WINDOW_SECONDS
        or start != int(start)
    ):
        return None
    return day, int(start), int(end)


def _available(
    window: tuple[str, int, int] | None, now: float, born: float
) -> int | None:
    if window is None:
        return None
    day, start, end = window
    if born > start or now < start:
        return None
    try:
        # Calendar arithmetic keeps the whole following HA day on a DST change.
        local_day = date.fromisoformat(day)
        if local_day.isoformat() != day:
            return None
        midnight = local_day + timedelta(days=2)
        expiry = int(
            datetime.combine(
                midnight, time.min, dt_util.get_default_time_zone()
            ).timestamp()
        )
    except (ValueError, OverflowError, OSError):
        return None
    if end <= expiry and expiry - start <= 3 * 86400 and now < expiry:
        return expiry
    return None


def _live_windows(
    pet: PetCoordinator, now: float
) -> tuple[tuple[str, int, int], int] | None:
    state = pet.state
    if (
        state is None
        or pet.world != WORLD
        or VISITOR not in pet.known_visitors.get(WORLD, ())
    ):
        return None
    current = _window(state.visit)
    expires = _available(current, now, state.born)
    if current is not None and expires is not None:
        return current, expires
    saved = getattr(state, "unknown", {}).get(KEY)
    if (
        not isinstance(saved, dict)
        or saved.get("version") != VERSION
        or saved.get("pet_ref") != activity_support.incarnation(pet)
    ):
        return None
    retained = _window(saved)
    expires = _available(retained, now, state.born)
    return (retained, expires) if retained is not None and expires is not None else None


def capture_offer(pet: PetCoordinator, now: float | None = None) -> bool:
    """Remember an open window before the ordinary visit clock replaces it."""
    state = pet.state
    if state is None:
        return False
    live = _live_windows(pet, pet._now() if now is None else now)
    unknown = getattr(state, "unknown", {})
    if live is None:
        if KEY not in unknown:
            return False
        del unknown[KEY]
        return True
    (day, start, end), _ = live
    record = {
        "version": VERSION,
        "pet_ref": activity_support.incarnation(pet),
        "day": day,
        "world": WORLD,
        "id": VISITOR,
        "from": start,
        "until": end,
    }
    if unknown.get(KEY) == record:
        return False
    unknown[KEY] = record
    state.unknown = unknown
    return True


def view(pet: PetCoordinator) -> dict[str, str | int] | None:
    """Expose an eligible offer, independent of whether the greeting played."""
    state = pet.state
    if state is None or model.life_stage(state) == "egg":
        return None
    live = _live_windows(pet, pet._now())
    if live is None:
        return None
    (day, start, end), expires = live
    ref = activity_support.incarnation(pet)
    offer_id = hashlib.sha256(
        f"{ref}|{WORLD}|{VISITOR}|{day}|{start}|{end}".encode()
    ).hexdigest()[:32]
    return {"id": offer_id, "starts_at": start, "expires_at": expires}
