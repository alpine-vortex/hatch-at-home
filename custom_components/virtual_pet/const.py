"""Constants for the Virtual Pet integration."""

from __future__ import annotations

import logging

DOMAIN = "virtual_pet"
LOGGER = logging.getLogger(__package__)

CONF_BEDTIME = "bedtime"
CONF_WAKE_TIME = "wake_time"

DEFAULT_NAME = "Pip"

STORE_VERSION = 1
STORE_MINOR_VERSION = 1

SERVICE_FAST_FORWARD = "fast_forward"
ATTR_HOURS = "hours"
ATTR_CONFIG_ENTRY_ID = "config_entry_id"

CONF_SPECIES = "species"
DEFAULT_SPECIES = "bird"

# The card and sprites are served from here, see frontend/.
FRONTEND_URL = "/virtual_pet/frontend"
CARD_FILENAME = "hatch-pet-card.js"
