"""The device-alive signal bridge, server half (slice 3A): rain, and only rain.

It tells the card two things, and keeps neither on disk:

* ``current``: what the house is now (``{"rain": bool}``), which rides in the
  house view that every screen gets, shared ones too;
* ``recent``: the transitions of the last 90 seconds (a bounded ring), which
  the card uses for one shortened "echo" when it is first looked at, and which
  also go out live, once each, as ``{"fx": entry}``.

Everything here is in memory. Nothing is added to ``PetState``, the debug
sensor, diagnostics or the event bus, and nothing here draws from the pet's
random generator (ids come from ``secrets``).

Rain is *known* or it is *unknown* (``rain_reading``). Unknown is its own
state, not dry: it adds no ring entry, sends no message, and the first known
reading after it is silent (``current`` takes the new value, ambience is
truth, and no onset is invented out of an outage or a restart).

Chatter: the first pass that sees a different known value accepts it at once
(the leading edge). From then on a reverse is blocked for ``RAIN_BLOCK_SECONDS``;
a pass inside the block that sees the old value again changes nothing. When the
block ends an explicit timer asks for one more pass, which compares the latest
reading to the accepted value: equal sends nothing, different is a new onset.
The timer is cancelled on unload and is not persisted, so a restart has no
pending block.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
import secrets
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .home import Readings, is_raining

VERSION = 1
RAIN_BLOCK_SECONDS = 45.0  # a reverse waits this long (FM8; tune on the device)
RING_SIZE = 16
RING_SECONDS = 90.0  # how long a transition can still be echoed

# The kinds the server can send. Slice 4 turns this into DEVICE_SIGNAL_MAP.
KINDS = ("rain_started", "rain_stopped")
SCOPE = "house"


def rain_reading(readings: Readings) -> bool | None:
    """Is it raining: True or False when known, None when it is not.

    Known iff there is a rain rate or a weather condition (the guard
    ``HouseMoments._weather`` uses): with neither, ``is_raining`` says dry,
    which an outage must not be taken for.
    """
    if readings.rain_rate is None and readings.condition is None:
        return None
    return is_raining(readings)


class DeviceFx:
    """One pet's device signals (each pet has its own coordinator)."""

    def __init__(
        self,
        hass: HomeAssistant,
        recheck: Callable[[], None],
        nonce: str | None = None,
    ) -> None:
        self._hass = hass
        self._recheck = recheck  # asks for one more home pass
        self.nonce = nonce or secrets.token_hex(4)  # this run's ids are its own
        self._seq = 0
        self._rain: bool | None = None  # the accepted value; None = never known
        self._lost = False  # unknown since the last known reading
        self._block_until: float | None = None
        self._timer: CALLBACK_TYPE | None = None
        self._ring: deque[tuple[float, dict[str, Any]]] = deque(maxlen=RING_SIZE)
        self._fresh: list[dict[str, Any]] = []  # accepted, not yet sent live

    # -- what the house is now ------------------------------------------------

    def view(self) -> dict[str, Any]:
        """The house view's ``device_fx``: whitelisted booleans only. ``rain``
        is missing (not false) while it has never been known."""
        current: dict[str, bool] = {}
        if self._rain is not None:
            current["rain"] = self._rain
        return {"version": VERSION, "current": current}

    def recent(self, now: float) -> list[dict[str, Any]]:
        """The transitions still inside the window, oldest first."""
        self._prune(now)
        return [dict(entry) for _, entry in self._ring]

    def take_fresh(self, now: float) -> list[dict[str, Any]]:
        """The entries accepted since the last call, for the live message (each
        one only if it can still be echoed)."""
        fresh, self._fresh = self._fresh, []
        live = {entry["id"] for expires, entry in self._ring if expires > now}
        return [dict(entry) for entry in fresh if entry["id"] in live]

    # -- the home pass --------------------------------------------------------

    def observe_rain(self, rain: bool | None, now: float) -> None:
        """One home pass's reading (``rain_reading``) at time ``now``."""
        if rain is None:  # unknown: hold the last accepted value, drop the block
            self._lost = True
            self._end_block()
            return
        if self._rain is None or self._lost:  # the first known reading: silent
            self._lost = False
            self._rain = rain
            self._end_block()
            return
        if rain == self._rain:
            return
        if self._block_until is not None and now < self._block_until:
            return  # a reverse inside the block: the timer will look again
        self._rain = rain
        self._block_until = now + RAIN_BLOCK_SECONDS
        self._arm()
        self._add("rain_started" if rain else "rain_stopped", now)

    def _add(self, kind: str, now: float) -> None:
        assert kind in KINDS
        self._seq += 1
        # occurred_at is this pass's time, not the sensor's (which is unknown).
        entry = {
            "id": f"{self.nonce}-{self._seq}",
            "kind": kind,
            "occurred_at": dt_util.utc_from_timestamp(now).isoformat(),
            "expires_at": dt_util.utc_from_timestamp(now + RING_SECONDS).isoformat(),
            "scope": SCOPE,
        }
        self._prune(now)
        self._ring.append((now + RING_SECONDS, entry))
        self._fresh.append(entry)

    def _prune(self, now: float) -> None:
        while self._ring and self._ring[0][0] <= now:
            self._ring.popleft()

    # -- the block's timer ----------------------------------------------------

    def _arm(self) -> None:
        self.cancel()
        self._timer = async_call_later(self._hass, RAIN_BLOCK_SECONDS, self._over)

    @callback
    def _over(self, _: Any) -> None:
        """The block ended: one more pass will compare the latest reading."""
        self._timer = None
        self._block_until = None
        self._recheck()

    def _end_block(self) -> None:
        self.cancel()
        self._block_until = None

    def cancel(self) -> None:
        """Stop the timer (on unload, or when the block is dropped)."""
        if self._timer is not None:
            self._timer()
            self._timer = None
