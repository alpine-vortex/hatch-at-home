"""The topics the options menu is split into, and which option keys each holds."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from .const import (
    CONF_APPLIANCE_WATTS,
    CONF_APPLIANCES,
    CONF_AQI,
    CONF_AWAY_AFTER,
    CONF_BEDTIME,
    CONF_BEDTIME_LIGHTS,
    CONF_CHORES,
    CONF_COMFORT_HIGH,
    CONF_COMFORT_LOW,
    CONF_COOLING,
    CONF_DASHBOARD,
    CONF_FIREPLACE,
    CONF_HEATING,
    CONF_HOUSE_WORDS_PRIVATE,
    CONF_INDOOR_TEMP,
    CONF_LUX,
    CONF_MEMORY,
    CONF_MOON_ALTITUDE,
    CONF_MOON_ILLUMINATION,
    CONF_MOON_PHASE,
    CONF_MOTION,
    CONF_MUSIC,
    CONF_NOTICE_DOORBELL,
    CONF_NOTICE_ROBOT,
    CONF_PRIVACY,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SITTER_SETTLES,
    CONF_SOLAR,
    CONF_TV,
    CONF_WAKE_TIME,
    CONF_WEATHER,
    CONF_ZONE,
)

# Step id -> option keys, in menu order. Keys never change names, so there is
# nothing to migrate when a key moves between topics.
TOPICS: dict[str, tuple[str, ...]] = {
    "bedtime": (CONF_BEDTIME, CONF_WAKE_TIME, CONF_BEDTIME_LIGHTS, CONF_MOTION),
    "people": (
        CONF_ZONE,
        CONF_AWAY_AFTER,
        CONF_SITTER_SETTLES,
        CONF_PRIVACY,
        CONF_HOUSE_WORDS_PRIVATE,
        CONF_MEMORY,
    ),
    "weather": (
        CONF_RAIN,
        CONF_WEATHER,
        CONF_INDOOR_TEMP,
        CONF_COMFORT_LOW,
        CONF_COMFORT_HIGH,
        CONF_AQI,
        CONF_SOLAR,
    ),
    "room": (CONF_ROOM_LIGHTS, CONF_FIREPLACE, CONF_LUX, CONF_TV, CONF_MUSIC),
    "house": (
        CONF_HEATING,
        CONF_COOLING,
        CONF_NOTICE_ROBOT,
        CONF_NOTICE_DOORBELL,
        CONF_APPLIANCES,
        CONF_APPLIANCE_WATTS,
        CONF_CHORES,
    ),
    "sky": (CONF_MOON_PHASE, CONF_MOON_ILLUMINATION, CONF_MOON_ALTITUDE),
    "notifications": (CONF_DASHBOARD,),
}

# The menu labels (English, as in strings.json; a test keeps them equal), for
# the repair that names where to look.
TOPIC_LABELS: dict[str, str] = {
    "bedtime": "Bedtime",
    "people": "People and privacy",
    "weather": "Weather and air",
    "room": "The pet's room",
    "house": "The house helps",
    "sky": "Moon and sky",
    "notifications": "Where notifications open",
}


def topics_text(options: Mapping[str, Any], entity_ids: Iterable[str]) -> str:
    """The topics whose saved options name any of these entities, for the repair.

    Quoted menu labels, "A", "A and B" or "A, B and C".
    """
    wanted = set(entity_ids)
    found = []
    for topic, keys in TOPICS.items():
        for key in keys:
            value = options.get(key)
            values = value if isinstance(value, list) else [value]
            if wanted.intersection(v for v in values if isinstance(v, str)):
                found.append(f'"{TOPIC_LABELS[topic]}"')
                break
    if not found:  # a key outside every topic: point at the menu itself
        return "the topic that holds them"
    return " and ".join([", ".join(found[:-1]), found[-1]] if found[1:] else found)
