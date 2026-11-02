"""The house moment (ha-signals H8): virtual_pet.react's categories and their rules.

A player's automation (or the "house moment" blueprint) says what an entity is, a
category, and passes the state change it saw. Whether that change counts is
decided here, in one pure function, so the blueprint stays a thin pass-through
and every rule is tested in Python. Nothing here reads HA.

The house rules hold (home.py): cosmetic only, nothing saved, no entity ever
leaves (the source is a service field only). Categories that tell a viewer
someone is home (a delivery, the coffee, the oven, the car charging) are the
channel's alone: said live on the card, never on a sensor, the bus, the journal
or diagnostics (const.CHANNEL_CATEGORIES). A garage door is refused: it's a
security signal, not a moment.
"""

from __future__ import annotations

from typing import Any

from .const import (
    CHANNEL_CATEGORIES,
    CONF_APPLIANCES,
    CONF_COOLING,
    CONF_HEATING,
    HOUSE_CATEGORIES,
)
from .watcher import APPLIANCE_DONE, APPLIANCE_IDLE

REACTIONS = ("hop", "cheer", "cozy", "dance", "startle")

# The states that are no reading at all: never a moment, either side.
NO_READING = {"unavailable", "unknown", "none", ""}
ON = {"on", "open"}  # a switch, boolean, binary sensor; a valve
OFF = {"off", "closed"}

# key: the domains it's meant for (the blueprint's help says which), the rule,
# how long the old state must have held (seconds) and, for H3 / H6's own
# entities, the option whose entities it steps aside for ("native").
CATEGORIES: dict[str, dict[str, Any]] = {
    "heater": {
        "domains": ("climate", "switch", "input_boolean"),
        "rule": "heat",
        "native": CONF_HEATING,
    },
    "ac": {
        "domains": ("climate", "switch", "input_boolean"),
        "rule": "cool",
        "native": CONF_COOLING,
    },
    "fan": {
        "domains": ("fan", "switch", "input_boolean"),
        "rule": "starts",
        "native": CONF_COOLING,
    },
    "washer": {
        "domains": ("binary_sensor", "switch", "input_boolean", "sensor"),
        "rule": "done",
        "held": 600,
        "native": CONF_APPLIANCES,
    },
    "dryer": {
        "domains": ("binary_sensor", "switch", "input_boolean", "sensor"),
        "rule": "done",
        "held": 600,
        "native": CONF_APPLIANCES,
    },
    "dishwasher": {
        "domains": ("binary_sensor", "switch", "input_boolean", "sensor"),
        "rule": "done",
        "held": 600,
        "native": CONF_APPLIANCES,
    },
    "oven": {
        "domains": ("switch", "input_boolean", "binary_sensor", "sensor"),
        "rule": "done",  # only when it's done: an oven coming on is never one
        "held": 600,
    },
    "coffee": {
        "domains": ("switch", "input_boolean", "binary_sensor", "sensor"),
        "rule": "done",
        "held": 60,
    },
    "printer": {
        "domains": ("binary_sensor", "switch", "input_boolean", "sensor"),
        "rule": "done",
        "held": 600,
        # OctoPrint-style: printing -> operational is a finished print, but
        # only from printing (operational after anything else is just idle).
        "done_after": {"operational": ("printing",)},
    },
    "ev": {
        "domains": ("binary_sensor", "switch", "input_boolean", "sensor"),
        "rule": "done",
        "held": 600,
        "done_words": ("charged", "full"),
    },
    "feeder": {
        "domains": ("button", "input_button", "event", "sensor", "switch"),
        "rule": "happened",
    },
    "plants": {
        "domains": ("switch", "valve", "input_boolean", "sensor"),
        "rule": "watered",
        "held": 60,
    },
    "delivery": {
        "domains": ("binary_sensor", "input_boolean", "event", "sensor"),
        "rule": "arrived",
    },
    "timer": {"domains": ("timer",), "rule": "timer"},
    "internet": {
        "domains": ("binary_sensor", "switch", "input_boolean"),
        "rule": "back",
        "held": 120,
    },
    "custom": {"domains": (), "rule": "custom"},
}
assert set(CATEGORIES) == set(HOUSE_CATEGORIES)
assert CHANNEL_CATEGORIES <= set(CATEGORIES)

# The blueprint sends this for a timer's timer.finished event (a timer goes
# active -> idle when cancelled too, so its state never says it finished).
TIMER_FINISHED = "finished"
PLANTS_RISE = 10  # moisture points (a sensor) that mean they had a drink
# A parcel-tracking sensor's words that mean it came (not "ordered", "shipped").
DELIVERED = ("delivered", "arrived", "received")


def _number(text: str) -> float | None:
    try:
        return float(text)
    except ValueError:
        return None


def _words(text: str) -> list[str]:
    return [w for w in "".join(c if c.isalpha() else " " for c in text).split() if w]


def _says_done(text: str, extra: tuple[str, ...] = ()) -> bool:
    """An enum sensor's state means "finished" (watcher.APPLIANCE_DONE, so H6
    and the house moment agree)."""
    return any(w.startswith(APPLIANCE_DONE + extra) for w in _words(text))


def _says_delivered(text: str) -> bool:
    return any(w.startswith(DELIVERED) for w in _words(text))


def _idle(text: str) -> bool:
    return text in APPLIANCE_IDLE


def counts(
    category: str,
    domain: str | None,
    from_state: str | None,
    to_state: str | None,
    held: float | None,
    match: str | None = None,
) -> bool:
    """Whether this state change is the category's moment.

    domain is the source entity's (None when the call names none); held is how long from_state held, in seconds (None: not known, so not
    held against it). With neither state (an automation calling react from its
    own trigger) the automation has decided, and it counts. match: Custom's
    "the state that counts" (any change when empty).
    """
    spec = CATEGORIES.get(category)
    if spec is None:
        return False
    if from_state is None and to_state is None:
        return True
    old = str(from_state or "").strip().casefold()
    new = str(to_state or "").strip().casefold()
    if old in NO_READING or new in NO_READING or old == new:
        return False
    if held is not None and held < spec.get("held", 0):
        return False
    rule = spec["rule"]
    onoff = old in ON | OFF and new in ON | OFF
    if rule == "custom":
        return not match or new == match.strip().casefold()
    if rule == "timer":
        return new == TIMER_FINISHED
    if rule in ("heat", "cool"):
        if domain == "climate":
            modes = (
                ("heat", "heat_cool")
                if rule == "heat"
                else ("cool", "dry", "fan_only", "auto", "heat_cool")
            )
            return old == "off" and new in modes
        return old in OFF and new in ON
    if rule in ("starts", "back"):
        return old in OFF and new in ON
    if rule == "done":
        if onoff:
            return old in ON and new in OFF
        # An enum sensor: to a "done" word, from a state that was running.
        extra = spec.get("done_words", ())
        if _says_done(new, extra) and not _idle(old) and not _says_done(old, extra):
            return True
        # A word that finishes only from one state (printing -> operational).
        for word, froms in spec.get("done_after", {}).items():
            if new.startswith(word) and any(w.startswith(froms) for w in _words(old)):
                return True
        return False
    if rule == "watered":
        if onoff:
            return old in ON and new in OFF
        a, b = _number(old), _number(new)
        return a is not None and b is not None and b - a >= PLANTS_RISE
    if rule in ("happened", "arrived"):
        if rule == "arrived" and onoff:
            return old in OFF and new in ON
        if rule == "happened" and domain == "switch":
            return old in OFF and new in ON
        if onoff:
            return False
        a, b = _number(old), _number(new)
        if a is not None and b is not None:
            return b > a  # a count rose (one that resets at midnight falls)
        if rule == "arrived":
            # A status text: only the parcel arriving counts, not every step.
            return _says_delivered(new) and not _says_delivered(old)
        return True  # a button, an event or a timestamp: a new press
    return False


def is_native(category: str, source: str | None, options: dict[str, Any]) -> bool:
    """H3 (heating, cooling) or H6 (appliances) already watches this entity: its
    own moment says it, so the house moment steps aside (no double bubble)."""
    option = CATEGORIES.get(category, {}).get("native")
    if not option or not source:
        return False
    mapped = options.get(option) or []
    if isinstance(mapped, str):
        mapped = [mapped]
    return source in mapped
