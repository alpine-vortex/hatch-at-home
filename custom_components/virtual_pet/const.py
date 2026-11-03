"""Constants for the Hatch at Home integration."""

from __future__ import annotations

import logging

DOMAIN = "virtual_pet"
VERSION = "0.45.0"  # keep in step with manifest.json (a test checks)
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
ATTR_END = "end"
SERVICE_SHARE_NEWS = "share_news"
SERVICE_VISIT = "visit"
SERVICE_MY_DAY = "my_day"
SERVICE_SET_SHELL = "set_shell"
SERVICE_REACT = "react"
ATTR_CATEGORY = "category"
ATTR_SOURCE = "source"
ATTR_FROM_STATE = "from_state"
ATTR_TO_STATE = "to_state"
ATTR_HELD = "held"
ATTR_MATCH = "match"
ATTR_REACTION = "reaction"
ATTR_TEXT = "text"
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
# Keep house words (share_news's headline, react's custom text) off the sensor:
# on, they're said live on the card only (ha-signals H8, owner Q-A). Per pet.
CONF_HOUSE_WORDS_PRIVATE = "house_words_private"
# Pets may remember what people tell them (memory plan M1a): the household's allow,
# per pet entry, default on; each person still turns it on for themselves. Off on
# every pet erases everyone's memory.
CONF_MEMORY = "memory"
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
    "text",  # react's custom words (diagnostics and the debug sensor drop them)
}
DEFAULT_ZONE = "zone.home"
CONF_FIREPLACE = "fireplace"
# The house answering the pet's requests (ha-signals H3): what counts as the
# heating being on, and as cooling (a fan, air conditioning).
CONF_HEATING = "heating"
CONF_COOLING = "cooling"
# Robot vacuums (ha-signals H4): every vacuum.* counts; this turns it off.
CONF_NOTICE_ROBOT = "notice_robot"
# Doorbells (ha-signals H5): every event.* with device class doorbell counts;
# this turns it off.
CONF_NOTICE_DOORBELL = "notice_doorbell"
# Appliances that finish a cycle (ha-signals H6): washer, dryer, dishwasher.
# appliance_watts: at or under this a power reading means "not running" (W).
CONF_APPLIANCES = "appliances"
CONF_APPLIANCE_WATTS = "appliance_watts"
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

# The house moment's categories (virtual_pet.react, ha-signals H8; rules in
# react.py, the card's lines in HOUSE_MOMENT_LINES). No garage door: a security
# signal, refused (owner, 2026-11-01).
HOUSE_CATEGORIES = (
    "heater",
    "ac",
    "fan",
    "washer",
    "dryer",
    "dishwasher",
    "oven",
    "coffee",
    "printer",
    "ev",
    "feeder",
    "plants",
    "delivery",
    "timer",
    "internet",
    "custom",
)
# Categories that say someone is home (a visitor at the door, someone up making
# coffee or cooking, the car home charging, a kitchen timer going off): said live on the channel only, never
# on a sensor, the bus, the journal, debug or diagnostics (owner, 2026-11-01).
CHANNEL_CATEGORIES = {"delivery", "coffee", "oven", "ev", "timer"}
# Channel moments that are said live and kept nowhere (not for a later
# subscriber, not in the public list): a channel-only house moment, and house
# words while house_words_private is on. Their own types, so a card never says
# one twice (once from the sensor, once from the channel).
# doorbell_live (H5): a doorbell press, heard by the cards open at that moment.
LIVE_EVENTS = {"house_live", "news_live", "doorbell_live"}
