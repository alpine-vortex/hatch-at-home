"""Constants for the Virtual Pet integration."""

from __future__ import annotations

import logging

DOMAIN = "virtual_pet"
VERSION = "0.37.0"  # keep in step with manifest.json (a test checks)
LOGGER = logging.getLogger(__package__)

CONF_BEDTIME = "bedtime"
CONF_WAKE_TIME = "wake_time"

DEFAULT_NAME = "Pip"

STORE_VERSION = 1
STORE_MINOR_VERSION = 1

SERVICE_NOTIFY_ME = "notify_me"
ATTR_ENABLED = "enabled"
SERVICE_FAST_FORWARD = "fast_forward"
SERVICE_PLAY_GAME = "play_game"
ATTR_GUESS = "guess"
ATTR_GAME = "game"
SERVICE_SHARE_NEWS = "share_news"
SERVICE_VISIT = "visit"
SERVICE_MY_DAY = "my_day"
SERVICE_SET_SHELL = "set_shell"
ATTR_FINISH = "finish"
ATTR_HEADLINE = "headline"
ATTR_TOPIC = "topic"
ATTR_HOURS = "hours"
ATTR_CONFIG_ENTRY_ID = "config_entry_id"

CONF_WORLD = "world"
# Set by the config flow on a new pet, removed once its first save is made: an
# empty save without it is a damaged pet, never welcomed as a new one.
CONF_NEW_PET = "new_pet"
CONF_NEXT_WORLD = "next_world"  # chosen after hatching: the next egg's world
DEFAULT_WORLD = "woodland"
# Phase 2 entries stored a species instead of a world.
CONF_SPECIES = "species"

# The card and sprites are served from here, see frontend/.
FRONTEND_URL = "/virtual_pet/frontend"
CARD_FILENAME = "hatch-pet-card.js"

# Options (phase 3): what in the house the pet listens to.
CONF_BEDTIME_LIGHTS = "bedtime_lights"
CONF_MOTION = "motion"
CONF_WEATHER = "weather"
CONF_RAIN = "rain"
CONF_SOLAR = "solar"
CONF_INDOOR_TEMP = "indoor_temperature"
CONF_AQI = "aqi"
CONF_ROOM_LIGHTS = "room_lights"
CONF_LUX = "lux"
CONF_MUSIC = "music"
CONF_TV = "tv"
CONF_ZONE = "zone"
CONF_PRIVACY = "privacy"
# What the house was doing, not how the pet is: what's on and who's home.
PRIVATE_READINGS = {
    "company",
    "motion_recent",
    "tv_title",
    "music_title",
    "music_artist",
    "title",
    "artist",
    "headline",
}
DEFAULT_ZONE = "zone.home"
CONF_FIREPLACE = "fireplace"
CONF_COMFORT_LOW = "comfort_low"  # stored in °C, shown in the owner's unit
CONF_COMFORT_HIGH = "comfort_high"
CONF_AWAY_AFTER = "away_after"  # hours
CONF_SITTER_SETTLES = "sitter_settles"  # the sitter answers a whine
CONF_MOON_PHASE = "moon_phase"
CONF_MOON_ILLUMINATION = "moon_illumination"  # 0-1 or %
CONF_MOON_ALTITUDE = "moon_altitude"  # degrees; above 0 means up
CONF_CHORES = "chores"  # to-do lists; a done item earns the pet a treat
CONF_DASHBOARD = "dashboard"  # the path a tap on the pet's notifications opens

# The private channel (virtual_pet/subscribe). Bond moments are one person's:
# each goes to that person's own channel only, never the bus or the public
# moments. Media moments, with their titles, go to every channel, shared
# screens too (the house's, not anyone's).
PERSONAL_EVENTS = {
    "bond_up",
    "bond_record",
    "bond_favourite",
    "friend_home",
    "tucked_in",
}
# What a public event never carries (the bus and the public moments): whose it
# is, what the pet calls them, and the show or song (those stay on the channel).
# The last line of defence after the gate.
PRIVATE_EVENT_FIELDS = {
    "user",
    "for",
    "for_name",
    "nickname",
    "favourite",
    "title",
    "artist",
}
MEDIA_EVENTS = {"watching", "listening"}
# A media moment's public stand-in: the recap's "watched TV", with no title.
PUBLIC_AS = {"watching": "tv_on", "listening": "music_on"}
