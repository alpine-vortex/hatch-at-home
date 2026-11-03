"""The device-alive signal bridge, server half (slices 3A, 4A and 4C): the sky and the room.

It tells the card two things, and keeps neither on disk:

* ``current``: what the house is now (``{"rain": bool, "snow": bool, ...}``), which
  rides in the house view that every screen gets, shared ones too;
* ``recent``: the transitions of the last 90 seconds (a bounded ring), which
  the card uses for one shortened "echo" when it is first looked at, and which
  also go out live, once each, as ``{"fx": entry}``.

Everything here is in memory. Nothing is added to ``PetState``, the debug
sensor, diagnostics or the event bus, and nothing here draws from the pet's
random generator (ids come from ``secrets``).

``DEVICE_SIGNAL_MAP`` is the one source (plan section 6.2, F9): one row per key
(the weather: ``rain``, ``snow``, ``fog``, ``storm``, ``wind``; the room:
``lights``, ``heating``, ``cooling``, ``fireplace``, ``tv``, ``music``) with its
type (a bool, or a closed enum), its two kinds (none for an ambient-only row:
``heating`` and ``cooling`` are a tint, their wash is a moment's), its block, and
its echo numbers. ``KINDS`` and the
``view()`` whitelist are derived from it, ``tests/js/device_signal_map.json`` is
its committed export, and ``current`` is rebuilt from it each time, never copied
from a reading. A value that is not of the row's type, or a kind outside the map,
is dropped, never sent.

A key is *known* or it is *unknown* (each row's ``read``; a plain-bool reading
cannot say it, so the row names the ``Watcher.known`` key that asks, section 6.5). Unknown is its own
state, not off: it adds no ring entry, sends no message, and the first known
reading after it is silent (``current`` takes the new value, ambience is truth,
and no onset is invented out of an outage or a restart). A key is present in
``current`` only once it has been known; until then it is missing, not false.

Chatter, per key: the first pass that sees a different known value accepts it at
once (the leading edge). From then on a reverse is blocked for the row's
``block_s``; a pass inside the block that sees the old value again changes
nothing. When the block ends that key's own timer asks for one more pass, which
compares the latest reading to the accepted value: equal sends nothing, different
is a new onset. The timers are cancelled on unload and are not persisted, so a
restart has no pending block.

One onset per pass: a condition that starts two keys at once (``lightning-rainy``)
sends the storm and not the rain (and likewise when both end); any other tie goes
to a start over a stop (rain ending as snow begins shows the snow), then the lower
echo rank (a fireplace beats a TV), then the row first in the map. An ambient-only
row never sends an onset. ``current`` still carries every key's
truth.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
import secrets
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from .const import (
    CONF_COOLING,
    CONF_FIREPLACE,
    CONF_HEATING,
    CONF_MUSIC,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_TV,
    CONF_WEATHER,
)
from .home import FOGGY, SNOWY, STORMY, Readings, is_raining, is_windy

VERSION = 1  # a new key is additive: no bump (an unknown version is ignored)
BLOCK_SECONDS = 45.0  # a reverse waits this long (FM8; tune on the device)
RAIN_BLOCK_SECONDS = BLOCK_SECONDS  # 3A's name, kept
RING_SIZE = 16
RING_SECONDS = 90.0  # how long a transition can still be echoed
LIGHTS_ON_LEVEL = 0.0  # a light is "on" above this (any brightness; no dim, Q1)
HEATING_BLOCK_SECONDS = 120.0  # a tint "while running", not a stale one (6.5)
MUSIC_BLOCK_SECONDS = 60.0  # a track gap or a pause is not "stopped" (owner: >= 45)
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


def _by_condition(states: set[str]) -> Callable[[Readings], bool | None]:
    """A reading of the weather entity's condition alone: a rain sensor does not
    make snow "dry", so without a condition it is unknown."""

    def read(readings: Readings) -> bool | None:
        if readings.condition is None:
            return None
        return readings.condition in states

    return read


def wind_reading(readings: Readings) -> bool | None:
    """Is it windy: known iff the condition or either wind speed is."""
    if (
        readings.condition is None
        and readings.wind_kmh is None
        and readings.gust_kmh is None
    ):
        return None
    return is_windy(readings)


def lights_reading(readings: Readings) -> str | None:
    """``on`` iff any mapped light is on at any brightness, else ``off``; None
    (unknown) when there is no light to ask (``room_light_level`` is Optional)."""
    if readings.room_light_level is None:
        return None
    return "on" if readings.room_light_level > LIGHTS_ON_LEVEL else "off"


_READINGS = {"heating": "heating_on", "cooling": "cooling_on"}  # else the key's name


def _plain(name: str) -> Callable[[Readings], bool]:
    """A plain-bool reading (``fireplace``, ``tv`` ...): it cannot say unknown,
    so the row's ``known`` key does (``Watcher.known``)."""

    def read(readings: Readings) -> bool:
        return bool(getattr(readings, name))

    return read


@dataclass(frozen=True)
class Signal:
    """One row of ``DEVICE_SIGNAL_MAP``. The first six fields are the row the
    card sees (exported to ``tests/js/device_signal_map.json``); the rest are
    the server's alone."""

    type: str | tuple[str, ...]  # "bool", or the closed enum's members
    kinds: tuple[str, ...]  # (started, stopped); an enum's (on, off); () = ambient only
    block_s: float
    echo: bool
    echo_ttl_s: float | None  # None for an ambient-only row (no echo)
    echo_rank: int | None
    read: Callable[[Readings], bool | str | None]  # None = unknown
    sources: tuple[str, ...]  # the options that can tell it (any one is enough)
    supersedes: tuple[str, ...] = ()  # keys whose onset this one replaces
    known: str | None = None  # a plain-bool reading's ``Watcher.known`` key

    def export(self) -> dict[str, Any]:
        return {
            "type": list(self.type) if isinstance(self.type, tuple) else self.type,
            "kinds": list(self.kinds),
            "block_s": self.block_s,
            "echo": self.echo,
            "echo_ttl_s": self.echo_ttl_s,
            "echo_rank": self.echo_rank,
        }

    def clean(self, value: Any) -> bool | str | None:
        """The value if it is of this row's type, else None (dropped)."""
        if self.type == "bool":
            return value if isinstance(value, bool) else None
        if isinstance(self.type, tuple):
            return value if isinstance(value, str) and value in self.type else None
        return None


def _weather(key: str, read: Callable[[Readings], bool | None], **more: Any) -> Signal:
    return Signal(
        type="bool",
        kinds=(f"{key}_started", f"{key}_stopped"),
        block_s=BLOCK_SECONDS,
        echo=True,
        echo_ttl_s=RING_SECONDS,
        echo_rank=2,  # weather (plan section 6.7)
        read=read,
        sources=more.pop("sources", (CONF_WEATHER,)),
        **more,
    )


def _activity(key: str, rank: int, block_s: float, source: str) -> Signal:
    """A plain-bool room reading with an onset and an echo (``x_started`` and
    ``x_stopped``), known when ``Watcher.known(key)`` says so."""
    return Signal(
        type="bool",
        kinds=(f"{key}_started", f"{key}_stopped"),
        block_s=block_s,
        echo=True,
        echo_ttl_s=RING_SECONDS,
        echo_rank=rank,
        read=_plain(_READINGS.get(key, key)),
        sources=(source,),
        known=key,
    )


def _ambient(key: str, block_s: float, source: str) -> Signal:
    """A tint and nothing else: no kinds, no echo, no rank (F9)."""
    return Signal(
        type="bool",
        kinds=(),
        block_s=block_s,
        echo=False,
        echo_ttl_s=None,
        echo_rank=None,
        read=_plain(_READINGS.get(key, key)),
        sources=(source,),
        known=key,
    )


# The one source of what the server may send (plan section 6.2, F9, and the
# per-key table of 6.5). The weather's state is already in `flags`; the room's
# keys are the owner's own rule of 2026-11-03 (6.6a). A bool or a closed enum,
# nothing else may ever cross (6.2a rule 1). The doorbell, the appliance tick,
# the vacuum, the moon and arrival are not keys (FM10, FM11, FM15).
DEVICE_SIGNAL_MAP: dict[str, Signal] = {
    "rain": _weather("rain", rain_reading, sources=(CONF_WEATHER, CONF_RAIN)),
    "snow": _weather("snow", _by_condition(SNOWY)),
    "fog": _weather("fog", _by_condition(FOGGY)),
    "storm": _weather("storm", _by_condition(STORMY), supersedes=("rain",)),
    "wind": _weather("wind", wind_reading),
    # The room. Rank 3: fireplace and lights; 4: TV and music (section 6.7).
    "lights": Signal(
        type=("off", "on"),
        kinds=("lights_on", "lights_off"),  # kinds[0] is the "on" edge
        block_s=BLOCK_SECONDS,
        echo=True,
        echo_ttl_s=RING_SECONDS,
        echo_rank=3,
        read=lights_reading,
        sources=(CONF_ROOM_LIGHTS,),
    ),
    # Ambient only: no kinds, no echo. Their wash is the `house_answered` moment.
    "heating": _ambient("heating", HEATING_BLOCK_SECONDS, CONF_HEATING),
    "cooling": _ambient("cooling", HEATING_BLOCK_SECONDS, CONF_COOLING),
    "fireplace": _activity("fireplace", 3, BLOCK_SECONDS, CONF_FIREPLACE),
    "tv": _activity("tv", 4, BLOCK_SECONDS, CONF_TV),
    "music": _activity("music", 4, MUSIC_BLOCK_SECONDS, CONF_MUSIC),
}

# Every kind the server can send, derived from the map.
KINDS = tuple(kind for spec in DEVICE_SIGNAL_MAP.values() for kind in spec.kinds)
_KEY_OF = {kind: key for key, spec in DEVICE_SIGNAL_MAP.items() for kind in spec.kinds}


def export_signal_map() -> dict[str, Any]:
    """The map as the card's tests read it (``tests/js/device_signal_map.json``)."""
    return {
        "version": VERSION,
        "scope": SCOPE,
        "keys": {key: spec.export() for key, spec in DEVICE_SIGNAL_MAP.items()},
    }


def mapped_keys(options: Any) -> tuple[str, ...]:
    """The keys whose source is mapped in this house's options."""
    return tuple(
        key
        for key, spec in DEVICE_SIGNAL_MAP.items()
        if any(options.get(source) for source in spec.sources)
    )


class _Key:
    """One key's state: the accepted value and its own block."""

    def __init__(self) -> None:
        self.value: bool | str | None = None  # the accepted value; None = never known
        self.lost = False  # unknown since the last known reading
        self.block_until: float | None = None
        self.timer: CALLBACK_TYPE | None = None


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
        self._keys: dict[str, _Key] = {key: _Key() for key in DEVICE_SIGNAL_MAP}
        self._ring: deque[tuple[float, dict[str, Any]]] = deque(maxlen=RING_SIZE)
        # Accepted, not yet sent live, each with the time it stops being news.
        self._fresh: list[tuple[float, dict[str, Any]]] = []

    # -- what the house is now ------------------------------------------------

    def view(self) -> dict[str, Any]:
        """The house view's ``device_fx``: rebuilt from the map, each value of its
        row's type, nothing else. A key is missing (not false) while it has never
        been known."""
        current: dict[str, bool | str] = {}
        for key, spec in DEVICE_SIGNAL_MAP.items():
            value = spec.clean(self._keys[key].value)
            if value is not None:
                current[key] = value
        return {"version": VERSION, "current": current}

    def recent(self, now: float) -> list[dict[str, Any]]:
        """The transitions still inside the window, oldest first."""
        self._prune(now)
        return [dict(entry) for _, entry in self._ring]

    def take_fresh(self, now: float) -> list[dict[str, Any]]:
        """The entries accepted since the last call, for the live message (each
        one only if it can still be echoed)."""
        fresh, self._fresh = self._fresh, []
        return [dict(entry) for expires, entry in fresh if expires > now]

    # -- the home pass --------------------------------------------------------

    def observe(
        self,
        readings: Readings,
        now: float,
        keys: tuple[str, ...] | None = None,
        known: Callable[[str], bool] | None = None,
    ) -> None:
        """One home pass at time ``now``: every mapped key looks at its reading
        (``known`` answers for a plain-bool one: ``Watcher.known``), and at most
        one onset (the strongest) is sent."""
        onsets = [
            key
            for key in (DEVICE_SIGNAL_MAP if keys is None else keys)
            if self._observe_key(key, self._reading(key, readings, known), now)
            and DEVICE_SIGNAL_MAP[key].kinds  # an ambient-only row sends no onset
        ]

        # One onset per pass. A key beaten by another of the same direction is
        # silent (its state is accepted, `current` says so); then a start beats a
        # stop (rain ending as snow begins shows the snow), then the lower echo
        # rank, then the map's order.
        def starts(key: str) -> bool:
            return self._keys[key].value in (True, "on")  # an enum's `on`, not "off"

        onsets = [
            key
            for key in onsets
            if not any(
                key in DEVICE_SIGNAL_MAP[other].supersedes
                and starts(other) == starts(key)
                for other in onsets
            )
        ]
        if onsets:
            order = list(DEVICE_SIGNAL_MAP)
            key = min(
                onsets,
                key=lambda k: (
                    not starts(k),
                    DEVICE_SIGNAL_MAP[k].echo_rank,
                    order.index(k),
                ),
            )
            self._add(key, now)

    @staticmethod
    def _reading(
        key: str, readings: Readings, known: Callable[[str], bool] | None
    ) -> bool | str | None:
        """The row's reading, or None (unknown) when its guard says nothing
        answers: a plain bool reads "off" in an outage, which is not off."""
        spec = DEVICE_SIGNAL_MAP[key]
        if spec.known is not None and known is not None and not known(spec.known):
            return None
        return spec.read(readings)

    def _observe_key(self, key: str, value: Any, now: float) -> bool:
        """One key's reading (None = unknown). True when it is an accepted change
        that wants an onset."""
        spec, state = DEVICE_SIGNAL_MAP[key], self._keys[key]
        if value is not None:
            value = spec.clean(value)
        if value is None:  # unknown: hold the last accepted value, drop the block
            state.lost = True
            self._end_block(key)
            return False
        if state.value is None or state.lost:  # the first known reading: silent
            state.lost = False
            state.value = value
            self._end_block(key)
            return False
        if value == state.value:
            return False
        if state.block_until is not None and now < state.block_until:
            return False  # a reverse inside the block: the timer will look again
        state.value = value
        state.block_until = now + spec.block_s
        self._arm(key)
        return True

    def _add(self, key: str, now: float) -> None:
        spec, state = DEVICE_SIGNAL_MAP[key], self._keys[key]
        if len(spec.kinds) != 2 or spec.echo_ttl_s is None:  # ambient only
            return
        kind = spec.kinds[0] if state.value in (True, "on") else spec.kinds[1]
        if kind not in KINDS:  # a kind outside the map never reaches the ring
            return
        self._seq += 1
        expires = now + spec.echo_ttl_s
        # occurred_at is this pass's time, not the sensor's (which is unknown).
        entry = {
            "id": f"{self.nonce}-{self._seq}",
            "kind": kind,
            "occurred_at": dt_util.utc_from_timestamp(now).isoformat(),
            "expires_at": dt_util.utc_from_timestamp(expires).isoformat(),
            "scope": SCOPE,
        }
        self._prune(now)
        if spec.echo:
            self._ring.append((expires, entry))
        self._fresh.append((expires, entry))

    def _prune(self, now: float) -> None:
        live = [item for item in self._ring if item[0] > now]
        if len(live) != len(self._ring):
            self._ring = deque(live, maxlen=RING_SIZE)

    # -- each key's block and its timer ---------------------------------------

    def _arm(self, key: str) -> None:
        self._cancel(key)

        @callback
        def over(_: Any) -> None:
            """The block ended: one more pass will compare the latest reading."""
            self._keys[key].timer = None
            self._keys[key].block_until = None
            self._recheck()

        self._keys[key].timer = async_call_later(
            self._hass, DEVICE_SIGNAL_MAP[key].block_s, over
        )

    def _end_block(self, key: str) -> None:
        self._cancel(key)
        self._keys[key].block_until = None

    def _cancel(self, key: str) -> None:
        state = self._keys[key]
        if state.timer is not None:
            state.timer()
            state.timer = None

    def cancel(self) -> None:
        """Stop every timer (on unload)."""
        for key in self._keys:
            self._cancel(key)
