"""The coordinator: the single owner of the pet's state."""

from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import Callable
import copy
from datetime import date, datetime, timedelta
import math
import random
from typing import Any
import unicodedata

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    CONF_NAME,
    EVENT_HOMEASSISTANT_STARTED,
    STATE_HOME,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    UnitOfTemperature,
)
from homeassistant.core import (
    CALLBACK_TYPE,
    Context,
    CoreState,
    Event,
    EventStateChangedData,
    HomeAssistant,
    State,
    callback,
)
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import (
    device_registry as dr,
    issue_registry as ir,
)
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_conversion import TemperatureConverter

from . import (
    channel,
    crate_push,
    hop,
    model,
    notify,
    people as P,
    rates as R,
    wellbeing,
)
from .backup import (
    NOTHING,
    async_backup,
    async_clear_if_restored,
    async_kept_backup,
)
from .const import (
    CHANNEL_CATEGORIES,
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
    CONF_MUSIC,
    CONF_NEW_PET,
    CONF_NEXT_WORLD,
    CONF_PRIVACY,
    CONF_RAIN,
    CONF_ROOM_LIGHTS,
    CONF_SITTER_SETTLES,
    CONF_SOLAR,
    CONF_SPECIES,
    CONF_TV,
    CONF_WAKE_TIME,
    CONF_WEATHER,
    CONF_WORLD,
    DEFAULT_WORLD,
    DOMAIN,
    LIVE_EVENTS,
    LOGGER,
    MEDIA_EVENTS,
    PERSONAL_EVENTS,
    PRIVATE_EVENT_FIELDS,
    PUBLIC_AS,
    STORE_MINOR_VERSION,
    STORE_VERSION,
)
from .device_fx import DeviceFx, mapped_keys
from .home import (
    FOGGY,
    RAINY,
    SNOWY,
    STORMY,
    SUNNY,
    DayForecast,
    HomeEffect,
    HouseMoments,
    Presence,
    Readings,
    evaluate,
    find_flags,
    forecast_moment,
    is_raining,
)
from .names import name_taken, pet_name
from .react import counts as react_counts, is_native as react_native
from .repairs import missing_entity_ids, placeholders
from .saving import CappedSave
from .species import load_catalog
from .watcher import BAD, Signature, Watcher, daily_forecast, doorbell_rang, moved

type PetConfigEntry = ConfigEntry[PetCoordinator]

# Events the card reacts to on screen. The card only sees state, so these are
# published as a short list (the last_care sensor's "moments").
MOMENTS = {
    "care_miss",
    "discipline_miss",
    "hatched",
    "stage_changed",
    "trait_learned",
    "trait_deepened",
    "egg_laid",
    "call_answered",
    "woke_up",
    "fell_asleep",
    "pooped",
    "sunrise",
    "sunset",
    "good_morning",
    "tv_on",
    "music_on",
    "tv_off_late",
    "first_snow",
    "first_frost",
    "first_warm",
    "first_fog",
    "season_start",  # with its season: the first day of spring, summer... (H7)
    "news",
    "weather",
    "forecast",
    "house_answered",  # {request}: the heating or the fan came on for the pet
    "robot_out",  # a robot vacuum started a run
    "robot_home",  # ... and went home
    "appliance_done",  # {kind}: a washer, dryer or dishwasher finished
    "house_moment",  # {category[, reaction, text]}: virtual_pet.react (H8)
    "wish_granted",
    "bond_up",
    "bond_favourite",
    "friend_home",
    "bond_record",
    "tucked_in",
    "favourite_snack",
    "someone_home",
    "became_sick",
    "found",  # {id, world}: a find went in the basket (no user)
    "rest_started",  # the resting switch (plan favourite-resting §4.5): no user
    "rest_ended",
}
# Care-log rows no person writes (by None by design): the wish credit for a
# game skips them (plan sitter §3.5).
NOBODY_ROWS = {*model.SITTER_ACTIONS, "chore_treat"}
# A public moment of these types keeps only {type, at}: the bus and the phones
# still get the cause.
MOMENT_BARE = {"became_sick"}
# ...except these causes, which the card says ("too many snacks"): weight only
# (gaps-seams 2b, owner Q3). Neglect and the rest never reach the public list.
MOMENT_CAUSES_SHOWN = {"weight"}
MOMENTS_KEPT = 10
# The house's own words, by moment: what house_words_private keeps off the
# sensor (said live on the channel instead, as news_live / house_live).
HOUSE_WORDS = {"news": ("headline", "topic"), "house_moment": ("text",)}
# The visit's celebration lines (one a look, and always a place for it).
CELEBRATIONS = {"your_birthday", "pet_birthday", "birthday_friends", "friends_for"}
# Door 6 (memory plan M1b, FM Q-B): the favourite's note that may carry "told", and
# the one-shot key in memory["said"] it marks.
DOOR6 = {"fav_weather": "door6_fav_weather", "season": "door6_fav_season"}
# Moments a dream can be about, by the dream's kind. (Not news: it stays
# cosmetic, and changes nothing that's saved.)
# What the pet notices, as the card's "notices" row names it (top10 2a): a kind
# shows once any of its options is mapped. Kinds only, never an entity: no
# presence (zone) or motion, so the row never hints at who's home, and no bedtime
# (it always has one).
SENSES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("weather", (CONF_WEATHER, CONF_RAIN, CONF_SOLAR, CONF_INDOOR_TEMP, CONF_AQI)),
    ("lights", (CONF_ROOM_LIGHTS, CONF_LUX, CONF_BEDTIME_LIGHTS)),
    ("tv", (CONF_TV,)),
    ("music", (CONF_MUSIC,)),
    ("chores", (CONF_CHORES,)),
    ("fireplace", (CONF_FIREPLACE,)),
    ("heater", (CONF_HEATING,)),
    ("fan", (CONF_COOLING,)),
    ("robot", ()),  # every vacuum in the house, unless notice_robot is off
    ("doorbell", ()),  # every doorbell event entity, unless notice_doorbell is off
    ("machines", (CONF_APPLIANCES,)),
    ("moon", (CONF_MOON_PHASE, CONF_MOON_ILLUMINATION, CONF_MOON_ALTITUDE)),
)

DREAM_OF = {
    "first_snow": "snow_started",
    "wish_granted": "wish",
    "trait_learned": "trait",
}


def _log_damage(message: str, title: str, err: BaseException) -> None:
    """A load or first-tick failure: the error's type at warning, since its
    text can carry a key such as a user ID; the traceback only at debug."""
    LOGGER.warning(message + ": %s", title, type(err).__name__)
    LOGGER.debug(message, title, exc_info=err)


class PetStore(Store[dict[str, Any]]):
    """The pet's JSON file, with a hook for future schema migrations."""

    async def _async_migrate_func(
        self,
        old_major_version: int,
        old_minor_version: int,
        old_data: dict[str, Any],
    ) -> dict[str, Any]:
        # No migrations yet. PetState.from_dict already ignores unknown keys
        # and defaults missing ones, so minor bumps need nothing here.
        return old_data


class PetCoordinator(DataUpdateCoordinator[model.PetState]):
    """Advances the pet on a coarse tick and applies care actions."""

    config_entry: PetConfigEntry

    def __init__(self, hass: HomeAssistant, entry: PetConfigEntry) -> None:
        super().__init__(
            hass,
            LOGGER,
            config_entry=entry,
            name=f"{DOMAIN} {entry.title}",
            update_interval=timedelta(minutes=R.TICK_MINUTES),
            always_update=True,
        )
        self.pet_id = entry.entry_id
        self.store = PetStore(
            hass,
            STORE_VERSION,
            f"{DOMAIN}.{entry.entry_id}",
            minor_version=STORE_MINOR_VERSION,
        )
        # Late-bound: self.state is replaced on load and recovery.
        self._saver = CappedSave(hass, self.store, lambda: self._state_dict())
        # Filled in by async_load from the files in frontend/.
        self.world: str = entry.data.get(CONF_WORLD, DEFAULT_WORLD)
        self.world_name = self.world
        self.roster: tuple[str, ...] = ()
        self.species_names: dict[str, str] = {}
        # What the next egg can hatch into: the next world's roster while a
        # world change waits for the egg, otherwise this world's.
        self.egg_roster: tuple[str, ...] = ()
        self.egg_species_names: dict[str, str] = {}
        # World visitors (worlds.json): this world's, in roster order, and the
        # ids every world knows (the saved visit's check after load; what
        # counts or shows the collection skips the rest).
        self.visitors: list[dict[str, Any]] = []
        self.known_visitors: dict[str, set[str]] = {}
        # Finds (worlds.json): this world's, and the ids every world knows (the
        # basket and the collection keep the rest, never counted or shown).
        # The find flags are None until the house has been read once
        # (review V-B #3): no roll before.
        self.finds: list[dict[str, Any]] = []
        self.known_finds: dict[str, set[str]] = {}
        self._find_flags: dict[str, bool | None] | None = None
        self.rng = random.Random()
        # Each ready creature's favourite-snack choices, and the stages with
        # food words of their own (a moth: no snacks there).
        self.likes: dict[str, list[str]] = {}
        # How each kind of creature is built (species.json `field_note`), a
        # derived copy for the Assist status; any species in the catalog, not
        # only this world's roster.
        self.species_notes: dict[str, str] = {}
        self.own_food_stages: dict[str, set[str]] = {}
        self.catchphrases: dict[str, str] = {}  # each creature's own
        self.state: model.PetState | None = None
        self._ticked = False  # the first tick after a load can't fail setup
        self._damage_backup: str | None = None  # a damaged save's copy, once
        # Last calculation, for the diagnostic sensor.
        self.debug: dict[str, Any] = {}
        self._bells: tuple[str, ...] = ()  # snapshot taken in _listen
        # Recent events for the card to react to, newest first (not saved).
        self.moments: list[dict[str, Any]] = []
        # The private channel (virtual_pet/subscribe), in memory only: each
        # person's own recent moments (bonds), the house's latest media moment
        # (with its title), and what each watcher was last sent, by token.
        self._private: dict[str, deque[dict[str, Any]]] = {}
        self._house: dict[str, dict[str, Any]] = {}
        # Set once per HA start, when a save loaded normally (memory only).
        self._powered_on: str | None = None
        self._sent: dict[object, tuple[dict[str, Any] | None, dict[str, Any]]] = {}
        # The sitter's last round this visit ({at, did}), for the channel's
        # house.sitter.last (plan sitter §3.6, §5.3). In memory; never on the bus.
        self._sitter_last: dict[str, Any] | None = None
        # A call notification is on the phones (cleared when the call is over).
        self._call_notified = False
        # This sickness is on the phones already (became_sick, until it
        # recovers or sleeps): its sick call, even a tick later after a hand
        # wake, sends nothing more.
        self._sick_told = False
        # The house: nothing is read until HA has fully started.
        self.home = HomeEffect()
        self.house_moments = HouseMoments()
        # virtual_pet.share_news: no news before this time (in memory only).
        self.next_news = 0.0
        # virtual_pet.react: each category's next time, and the gap across all
        # of them (in memory only).
        self.next_react: dict[str, float] = {}
        self.next_react_any = 0.0
        # The weather entity's daily forecast by local date (in memory only),
        # and when the pet next talks about it.
        self.forecast: dict[str, DayForecast] = {}
        self._forecast_at = -1e12
        self._forecast_due: float | None = None  # today's, after good morning
        self._forecast_evening: str | None = None  # the day last talked about
        # The day the holiday morning was last sent (in memory; a restart that
        # morning may send it again, and the phone's tag replaces the first).
        self._holiday_on: str | None = None
        # The person behind the care being applied (bonds), and when each person
        # last looked in (virtual_pet.visit; in memory).
        self._actor: str | None = None
        # Games dropped unfinished (idle, asleep, switched from): the
        # next guess of that kind starts a new game, and its reply says so.
        self._dropped_games: set[str] = set()
        # Hop of the Day's boards, today's only, in memory: one shared build per
        # (day, world, family, specials, w, h), so two screens calling at once
        # run the generator once (ship 3a's settle reads the same cache).
        self._hop_boards: dict[tuple, asyncio.Future[hop.Board]] = {}
        self._crate_boards: dict[tuple, asyncio.Future[crate_push.Board]] = {}
        # Rounds the player took a hint on (day, world, level, round): kept in
        # memory only, swept with the boards; a restart forgets (plan 6a).
        self._crate_hinted: set[tuple] = set()
        self._crate_hint_lock = asyncio.Lock()
        self._visits: dict[str, float] = {}
        # People (HA user IDs) whose person entity just came home, and when the
        # pet last cheered for each (in memory).
        self._arrivals: list[str] = []
        self._cheered: dict[str, float] = {}
        self._someone_cheered = -1e12  # anyone at all, for shared screens
        # "My day": a bike ride or a run today, per person (in memory).
        self._moved: dict[str, tuple[str, set[str]]] = {}
        # The house's weather now (rain, snow, sun, storm) and outdoors in °C.
        self._weather_now: set[str] = set()
        self._outdoor_c: float | None = None
        self.presence = Presence(
            entry.options.get(CONF_AWAY_AFTER, R.HOME_AWAY_AFTER_HOURS)
        )
        self.watcher = Watcher(hass, entry.options)
        self._home_started = False
        # Completed to-do items per list, to spot newly done chores.
        self._chores_done: dict[str, set[str]] = {}
        # Items paid for today, per list: ticking one again pays nothing.
        self._chores_paid: dict[str, tuple[str, set[str]]] = {}
        self._chores_locks: dict[str, asyncio.Lock] = {}
        self._home_debouncer = Debouncer(
            hass,
            LOGGER,
            cooldown=R.HOME_DEBOUNCE_SECONDS,
            immediate=False,
            function=self._async_home_changed,
        )
        # The device-alive signal bridge (slice 3A): in memory only, never saved.
        self.device_fx = DeviceFx(hass, self._home_debouncer.async_schedule_call)

    @property
    def settings(self) -> model.Settings:
        """Settings from the entry options, with defaults."""
        options = self.config_entry.options
        return model.Settings(
            tz=dt_util.get_default_time_zone(),
            roster=self.roster,
            home=self.home,
            bedtime=model.parse_hhmm(options.get(CONF_BEDTIME, R.DEFAULT_BEDTIME)),
            wake_time=model.parse_hhmm(
                options.get(CONF_WAKE_TIME, R.DEFAULT_WAKE_TIME)
            ),
        )

    @property
    def dashboard(self) -> str | None:
        """The dashboard a tap on this pet's notifications opens, if one is set."""
        return notify.dashboard_path(self.config_entry.options.get(CONF_DASHBOARD))

    @property
    def week(self) -> list[dict[str, Any]]:
        """The journal's week strip (E14): the days that hold something."""
        assert self.state is not None
        return model.week_strip(self.state, self._today(self._now())[0])

    @property
    def social_level(self) -> int:
        """The social meter, 0-10 over the last week (top10 §6)."""
        assert self.state is not None
        return model.social_level(self.state, self._today(self._now())[0])

    def social_link(self, other: str) -> None:
        """The infrared link brought another pet of this house today."""
        assert self.state is not None
        if model.social_link(self.state, self._today(self._now())[0], other):
            self._save()
            self._publish()

    def social_greet(self) -> None:
        """The card played the day's visitor to someone (any screen, shared ones
        too): the day counts a greeted visitor, inside the visit's window only.
        Nothing about who was looking is kept."""
        assert self.state is not None
        now = self._now()
        if self._awake() and model.social_greet(
            self.state, now, self._today(now)[0], self.world
        ):
            self._save()
            self._publish()

    @property
    def senses(self) -> list[str]:
        """The kinds of house signal mapped in the options (SENSES), never
        which entities: for the card's "notices" row (top10 2a)."""
        options = self.config_entry.options
        # The moon always shows: every pet reads it from the date at least.
        return [
            kind
            for kind, keys in SENSES
            if kind == "moon"
            or any(options.get(k) for k in keys)
            or (kind == "robot" and self.watcher.robot_ids())
            or (kind == "doorbell" and self._bells)
        ]

    @property
    def privacy(self) -> bool:
        """Keep presence out of what the pet shows (default on)."""
        return self.config_entry.options.get(CONF_PRIVACY, True)

    @property
    def _sitter_settles(self) -> bool:
        """The option "the sitter calms a fussy pet" (default on)."""
        return bool(self.config_entry.options.get(CONF_SITTER_SETTLES, True))

    @property
    def house_words_private(self) -> bool:
        """Keep the house's words (news headlines, react's custom text) off the
        sensor: said live on the card only (default off; owner Q-A)."""
        return bool(self.config_entry.options.get(CONF_HOUSE_WORDS_PRIVATE, False))

    @property
    def memory_allowed(self) -> bool:
        """This pet may keep, say and ask for people's memory (memory plan M1a;
        the household's option, per pet, default on). Read live: an options save
        reloads the pet."""
        return bool(self.config_entry.options.get(CONF_MEMORY, True))

    def current_mood(self) -> tuple[str, list[str], str]:
        """(mood, flags, reason) as shown anywhere outside the pet's own file."""
        mood, flags, reason, _ = self.current_mood_keyed()
        return mood, flags, reason

    def current_mood_keyed(self) -> tuple[str, list[str], str, str]:
        """current_mood() and the reason's key (the mood sensor's attributes)."""
        assert self.state is not None
        mood, flags, reason, key = model.mood_keyed(
            self.state, self._now(), self.settings
        )
        if mood == "away" and self.privacy:
            # Privacy: an empty house looks like a nap on any dashboard. A
            # resting pet keeps its flag (its switch says so anyway), so the
            # flag's absence can't tell that it is away.
            rest = ["resting"] if "resting" in flags else []
            return "asleep", ["asleep", *rest], "zzz", "asleep"
        return mood, flags, reason, key

    @staticmethod
    def _now() -> float:
        return dt_util.utcnow().timestamp()

    async def async_load(self) -> None:
        """Load the pet, or lay a new egg, and catch up on downtime."""
        catalog = await self.hass.async_add_executor_job(load_catalog)
        old_species = self.config_entry.data.get(CONF_SPECIES)
        if CONF_WORLD not in self.config_entry.data and old_species:
            self.world = catalog.world_of(old_species) or DEFAULT_WORLD
        self.world_name = catalog.worlds.get(self.world, {}).get("name", self.world)
        next_world = self.config_entry.data.get(CONF_NEXT_WORLD)
        self.next_world_name: str | None = (
            catalog.worlds.get(next_world, {}).get("name", next_world)
            if next_world
            else None
        )
        self.roster = tuple(catalog.roster(self.world))
        self.visitors = list(catalog.visitors.get(self.world, []))
        self.known_visitors = {
            world: {v["id"] for v in visitors}
            for world, visitors in catalog.visitors.items()
        }
        self.finds = list(catalog.finds.get(self.world, []))
        self.known_finds = {
            world: {f["id"] for f in finds} for world, finds in catalog.finds.items()
        }
        self.species_names = {s: catalog.species[s].get("name", s) for s in self.roster}
        self.egg_roster = (
            tuple(catalog.roster(next_world)) if next_world else self.roster
        )
        self.egg_species_names = {
            s: catalog.species[s].get("name", s) for s in self.egg_roster
        }
        for key, data in catalog.species.items():
            voice = data.get("voice") if isinstance(data.get("voice"), dict) else {}
            if isinstance(voice.get("catchphrase"), str):
                self.catchphrases[key] = voice["catchphrase"]
            likes = voice.get("likes")
            self.likes[key] = (
                [x for x in likes if isinstance(x, str) and x]
                if isinstance(likes, list)
                else []
            )
            note = data.get("field_note")
            if isinstance(note, str) and note:
                self.species_notes[key] = note
            words = data.get("words") if isinstance(data.get("words"), dict) else {}
            self.own_food_stages[key] = {
                stage
                for stage, w in words.items()
                if isinstance(w, dict) and "food" in w
            }
        if not self.roster:
            LOGGER.warning(
                "World %s has no ready species yet; %s stays an egg until it does",
                self.world,
                pet_name(self.hass, self.config_entry),
            )
        self._issue(
            "world_not_ready",
            not self.roster,
            {"pet": pet_name(self.hass, self.config_entry), "world": self.world_name},
        )
        now = self._now()
        title = self.config_entry.title
        data: Any = NOTHING
        try:
            data = await self.store.async_load()
        except Exception as err:  # noqa: BLE001 - a wrapper Store can't read
            _log_damage("%s's save file couldn't be read", title, err)
        if data is None and self.config_entry.data.get(CONF_NEW_PET):
            # Only adding the integration makes a save file; laying an egg
            # reuses this one, so this is a new pet in the house.
            self.state = model.PetState.new(title, now)
            LOGGER.debug("New egg for %s", self.pet_id)
            await self.store.async_save(self.state.to_dict())  # welcome once only
            self._first_saved()
            self._welcome()
        elif data is None or data is NOTHING:
            # A pet whose save is gone or unreadable: an egg again, never
            # welcomed as a new pet, and a repair that says where the file went.
            self.state = model.PetState.new(title, now)
            await self._damaged(NOTHING, salvaged=False)
        else:
            try:
                self.state = model.PetState.from_dict(data, title, now)
            except Exception as err:  # noqa: BLE001 - salvage, never fail setup
                _log_damage("%s's save file is damaged", title, err)
                self.state = model.PetState.salvage(data, title, now)
                downtime = 0.0
                # Nothing of a pet in a non-object root: the egg's wording.
                await self._damaged(data, salvaged=model.is_pet_root(data))
            else:
                downtime = now - self.state.last_updated
                before = copy.deepcopy(self.state)
                try:
                    model.catch_up(self.state, now)
                except Exception as err:  # noqa: BLE001 - keep all that was read
                    _log_damage("%s couldn't catch up", title, err)
                    self.state = before
                    self.state.last_updated = now  # the time away is skipped
                    downtime = 0.0
                    await self._damaged(data, salvaged=True, again=True)
                else:
                    await async_clear_if_restored(
                        self.hass, f"save_damaged_{self.pet_id}"
                    )
                    if self.hass.state is not CoreState.running:
                        # HA itself is starting: the card plays the power-on
                        # gag. Not a reload, a new egg, or a damaged save.
                        self._powered_on = dt_util.utcnow().isoformat()
            LOGGER.debug("Caught up %.1f min of downtime (frozen)", downtime / 60)
            self.debug["last_catch_up_minutes"] = round(downtime / 60, 1)
            if self.state.species is None and old_species:
                # Set up before worlds existed (phase 2): keep the species it
                # was created as, whether it has hatched yet or not.
                self.state.species = old_species
                if model.life_stage(self.state) != "egg":
                    self.state.raised.append(old_species)
        if self.state.egg_choice not in self.egg_roster:
            # The world changed under the choice (reconfigure): back to a surprise.
            self.state.egg_choice = None
        if self.state.hatched_on is None and model.life_stage(self.state) != "egg":
            # From before birthdays: it hatched half an hour after it was laid
            # (an egg's age only counts while the house runs, so this is exact
            # unless the house was down then).
            hatch = self.state.born + dict(R.STAGE_STARTS)["baby"] * 3600
            self.state.hatched_on = (
                dt_util.as_local(dt_util.utc_from_timestamp(hatch)).date().isoformat()
            )
        # An old save's lights flip made while away, and a save that is away:
        # the sitter arrives (plan sitter §3.10).
        self._fire(
            model.settle_legacy_lights(
                self.state, now, self.settings, self._sitter_settles
            )
        )
        self._check_visits()
        model.trim_basket(self.state, self.known_finds)  # review V-B #9
        self._pick_favourite()
        self._save()
        self._first_saved()

    async def _damaged(self, data: Any, *, salvaged: bool, again: bool = False) -> None:
        """Back the damaged file up, save what was kept over it at once, and
        raise the repair (salvaged, started again as an egg, or the file was
        missing). With again (a catch-up or first tick failing, as it may on
        every restart), a repair whose backup is still there is left as it is."""
        assert self.state is not None
        issue_id = f"save_damaged_{self.pet_id}"
        if again and self._damage_backup is None:
            self._damage_backup = await async_kept_backup(self.hass, issue_id)
            if self._damage_backup is not None:
                await self.store.async_save(self.state.to_dict())
                return
        if self._damage_backup is None:
            self._damage_backup = await async_backup(
                self.hass, self.store.key, STORE_VERSION, data
            )
        await self.store.async_save(self.state.to_dict())
        placeholders = {
            "pet": pet_name(self.hass, self.config_entry),
            "entry_id": self.pet_id,
        }
        if self._damage_backup is None:  # no file, nothing read, no .corrupt copy
            key = "save_damaged_missing"
        else:
            placeholders["backup"] = self._damage_backup
            key = "save_damaged" if salvaged else "save_damaged_egg"
        self._issue("save_damaged", True, placeholders, translation_key=key)

    def _first_saved(self) -> None:
        """The pet has a save file now: no longer a new pet to welcome."""
        if CONF_NEW_PET in self.config_entry.data:
            data = dict(self.config_entry.data)
            data.pop(CONF_NEW_PET)
            self.hass.config_entries.async_update_entry(self.config_entry, data=data)

    async def _async_update_data(self) -> model.PetState:
        """The regular tick. The first one after a load can't fail setup: a
        save that loaded but can't be ticked keeps the pet as loaded, with the
        repair, rather than retrying setup for ever."""
        if not self._ticked:
            self._ticked = True
            before = copy.deepcopy(self.state)
            try:
                return self._tick()
            except Exception as err:  # noqa: BLE001 - keep the pet as loaded
                _log_damage("%s couldn't be woken up", self.config_entry.title, err)
                self.state = before
                assert before is not None
                await self._damaged(before.to_dict(), salvaged=True, again=True)
                return before
        return self._tick()

    def _tick(self) -> model.PetState:
        assert self.state is not None
        now = self._now()
        self._advance(now)
        self._sense_home(now)  # time-based signals: motion going quiet, away
        self._want_forecast(now)
        self._daily_visit(now)
        self._roll_find(now)
        self._gift_tick(now)
        self._fire(self._daily_wish(now))
        return self.state

    # --- The house ----------------------------------------------------------

    def async_start_home(self) -> None:
        """Start listening to the house once HA is fully up."""
        if self.hass.state is CoreState.running:
            self._listen()
            return

        unsub: CALLBACK_TYPE | None = None

        async def started(_: Event) -> None:
            nonlocal unsub
            unsub = None  # a fired listen_once is gone; removing it again raises
            self._listen()

        def stop() -> None:
            if unsub is not None:
                unsub()

        unsub = self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started)
        self.config_entry.async_on_unload(stop)

    def _issue(
        self,
        key: str,
        active: bool,
        placeholders: dict[str, str],
        translation_key: str | None = None,
        data: dict[str, str] | None = None,
        fixable: bool = False,
    ) -> None:
        """Raise or clear one of this pet's repair issues (Settings → Repairs).
        A damaged save's stays across restarts until it's dismissed, the pet
        is removed, or its backup is renamed back and the save loads cleanly."""
        issue_id = f"{key}_{self.pet_id}"
        if not active:
            ir.async_delete_issue(self.hass, DOMAIN, issue_id)
            return
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            issue_id,
            is_fixable=fixable,
            data=data,
            is_persistent=key == "save_damaged",
            severity=ir.IssueSeverity.WARNING,
            translation_key=translation_key or key,
            translation_placeholders=placeholders,
        )

    def _check_mapped_entities(self) -> None:
        """Warn about mapped entities that no longer exist (renamed or removed).

        An entity that exists but is unavailable is fine: the watcher holds its
        last value for a while and then ignores it.
        """
        missing = missing_entity_ids(self.hass, self.config_entry.options)
        self._issue(
            "missing_entities",
            bool(missing),
            placeholders(self.hass, self.config_entry, missing),
            data={"entry_id": self.config_entry.entry_id},
            fixable=True,
        )

    def _listen(self) -> None:
        self._home_started = True
        self._check_mapped_entities()
        ids = self.watcher.entity_ids()

        # Per entity, the signature last let through: the pet wakes only for a
        # change it can notice, so a chatty sensor (lux every 2 s, the sun's
        # elevation every minute) waits for the tick. Memory only.
        seen: dict[str, Signature] = {}

        @callback
        def changed(event: Event[EventStateChangedData]) -> None:
            eid = event.data["entity_id"]
            old, new = event.data["old_state"], event.data["new_state"]
            if new is None or new.state in BAD:
                seen.pop(eid, None)
                self._home_debouncer.async_schedule_call()
                return
            sig = self.watcher.signature(eid, new)
            last = seen.get(eid)
            if last is None and old is not None and old.state not in BAD:
                # The anchor: a first-seen entity is compared with where it was,
                # and stays so until a change passes, so a slow drift adds up.
                last = seen[eid] = self.watcher.signature(eid, old)
            if last is not None and not moved(last, sig):
                return
            seen[eid] = sig
            self._home_debouncer.async_schedule_call()

        self.config_entry.async_on_unload(
            async_track_state_change_event(self.hass, ids, changed)
        )
        self.config_entry.async_on_unload(self._home_debouncer.async_shutdown)
        self.config_entry.async_on_unload(self.device_fx.cancel)  # every key's block

        @callback
        def person_moved(event: Event[EventStateChangedData]) -> None:
            old, new = event.data["old_state"], event.data["new_state"]
            unknown = (STATE_UNAVAILABLE, STATE_UNKNOWN)
            if old is None or new is None or old.state in unknown:
                return
            user = new.attributes.get("user_id")
            if not user or new.state in unknown or new.state == old.state:
                return
            now = self._now()
            person = self.people.person(user)
            if new.state == STATE_HOME:
                person["arrived"] = now
                self.people.save()
                self._arrivals.append(user)
                self._home_debouncer.async_schedule_call()
            elif new.state != "not_home":
                # A zone they made (work, the gym): remembered, privately, and
                # only while "my day" is on (the one place it is ever used).
                if self.people.my_day(user):
                    person["zone"] = {"name": new.state, "at": now}
                    self.people.save()
            if old.state == STATE_HOME:
                person["left"] = now  # a zone counts only if entered after this
                self.people.save()
                self._send_off(user, now)

        movers = wellbeing.activity_sensors(self.hass)

        @callback
        def phone_moved(event: Event[EventStateChangedData]) -> None:
            new = event.data["new_state"]
            move = wellbeing.MOVES.get((new.state if new else "").lower())
            user = movers.get(event.data["entity_id"])
            if move and user:
                today = self._today(self._now())[0]
                day, moves = self._moved.get(user, ("", set()))
                if day != today:
                    moves = set()
                moves.add(move)
                self._moved[user] = (today, moves)

        if movers:
            self.config_entry.async_on_unload(
                async_track_state_change_event(self.hass, list(movers), phone_moved)
            )

        # One snapshot: the listener, the senses and react's "native" all use
        # it, so a bell added after start is unheard everywhere until a reload.
        self._bells = tuple(self.watcher.doorbell_ids())
        if self._bells:
            self.config_entry.async_on_unload(
                async_track_state_change_event(
                    self.hass, list(self._bells), self._doorbell_pressed
                )
            )

        if persons := self.hass.states.async_entity_ids("person"):
            self.config_entry.async_on_unload(
                async_track_state_change_event(self.hass, persons, person_moved)
            )
        self.hass.async_create_task(self._async_home_changed())
        self._want_forecast(self._now())

        chores = self.config_entry.options.get(CONF_CHORES) or []
        if chores:

            @callback
            def chore_list_changed(event: Event[EventStateChangedData]) -> None:
                self.config_entry.async_create_background_task(
                    self.hass,
                    self._async_chores_changed(event.data["entity_id"]),
                    f"{DOMAIN} chores",
                )

            self.config_entry.async_on_unload(
                async_track_state_change_event(self.hass, chores, chore_list_changed)
            )
            for entity_id in chores:  # what's already done earns nothing
                self.config_entry.async_create_background_task(
                    self.hass, self._async_chores_changed(entity_id), f"{DOMAIN} chores"
                )

    @callback
    def _doorbell_pressed(self, event: Event[EventStateChangedData]) -> None:
        """A doorbell's own state change (H5): the press is judged here, on the
        old and new state, and goes no further than the live channel. It is
        never read into Readings, saved, put in debug or diagnostics, or logged."""
        if self.state is None or not doorbell_rang(
            event.data["old_state"], event.data["new_state"], self._now()
        ):
            return
        # No _advance, _save or _publish: each would stamp the press instant
        # (last_updated, last_tick, a sensor rewrite) where diagnostics and the
        # recorder can read it. The tick stays on its own 5-minute grid.
        self._fire(self.house_moments.doorbell(self._now(), self._awake()))

    async def _completed_chores(self, entity_id: str) -> set[str] | None:
        """IDs of the list's completed items, or None if it can't be read."""
        state: State | None = self.hass.states.get(entity_id)
        if state is None or state.state in ("unavailable", "unknown"):
            return None
        try:
            response = await self.hass.services.async_call(
                "todo",
                "get_items",
                {"entity_id": entity_id, "status": ["completed"]},
                blocking=True,
                return_response=True,
            )
        except Exception:  # noqa: BLE001 - a broken list must not break the pet
            LOGGER.debug("Couldn't read the chores on %s", entity_id, exc_info=True)
            return None
        items = (response or {}).get(entity_id, {}).get("items", [])
        return {str(i.get("uid") or i.get("summary")) for i in items}

    async def _async_chores_changed(self, entity_id: str) -> None:
        """A to-do list changed: newly completed items earn treats."""
        # One read at a time per list: an older read finishing last would
        # forget items and count them again.
        async with self._chores_locks.setdefault(entity_id, asyncio.Lock()):
            await self._async_chores_read(entity_id)

    async def _async_chores_read(self, entity_id: str) -> None:
        done = await self._completed_chores(entity_id)
        if done is None or self.state is None:
            return
        known = self._chores_done.get(entity_id)
        self._chores_done[entity_id] = done
        if known is None or not (fresh := done - known):
            return
        now = self._now()
        day = self._today(now)[0]
        paid_day, paid = self._chores_paid.get(entity_id, (day, set()))
        if paid_day != day:
            paid = set()
        unpaid = sorted(fresh - paid)
        self._chores_paid[entity_id] = (day, paid)
        if not unpaid:
            return
        self._advance(now)
        earned = model.chores_done(self.state, len(unpaid), now)
        paid.update(unpaid[:earned])
        if earned:
            self._fire(model.give_treats(self.state, now))
            self._save()
            self._publish()

    async def _async_home_changed(self) -> None:
        assert self.state is not None
        now = self._now()
        self._advance(now)  # the past was lived under the old house state
        self._sense_home(now)
        self._fire(model.react(self.state, now, self.settings))
        self._save()
        self._publish()

    def _sense_home(self, now: float) -> None:
        """Re-read the house and apply presence (away mode)."""
        if not self._home_started or self.state is None:
            return
        settings = self.settings
        late = model.in_sleep_hours(now, settings)
        night = (
            late
            or model.minutes_to_bedtime(now, settings) <= R.HOME_BEDTIME_WINDOW_MINUTES
        )
        readings = self.watcher.read(now, night, late)
        options = self.config_entry.options
        if keys := self._fx_keys():  # only collected here: _push_watchers sends it
            self.device_fx.observe(
                readings, now, keys, lambda key: self.watcher.known(key, now)
            )
        local = dt_util.as_local(dt_util.utc_from_timestamp(now))
        self._find_flags = find_flags(
            readings,
            now,
            local.hour,
            P.season(local.date(), self.hass.config.latitude),
            {
                name
                for name, keys in (
                    ("weather", (CONF_WEATHER,)),
                    ("rain", (CONF_RAIN,)),
                    ("solar", (CONF_SOLAR,)),
                    ("moon", (CONF_MOON_PHASE, CONF_MOON_ILLUMINATION)),
                )
                if any(options.get(k) for k in keys)
            },
        )
        effect = evaluate(
            readings,
            options.get(CONF_COMFORT_LOW, R.HOME_COMFORT_LOW_C),
            options.get(CONF_COMFORT_HIGH, R.HOME_COMFORT_HIGH_C),
        )
        self.home = effect

        away = self.presence.update(self.watcher.people_home(now), now, self.state.away)
        if away != self.state.away:
            # Nobody home: the sitter comes to the house (plan sitter §3). A
            # game runs on, the lights apply at once; the visit's rounds are
            # in model.advance.
            self.state.away = away
            self._sitter_last = None
            if away:
                self._fire(
                    model.sitter_arrives(
                        self.state, now, settings, self._sitter_settles
                    )
                )
            self._fire([{"type": "went_away" if away else "came_home"}])
        # After the update: an arrival just now starts the greeting.
        if self.presence.greeting(now):
            effect.flags.insert(0, "greeting")
        kinds = set()
        if is_raining(readings):
            kinds.add("rain")
        if readings.condition in SNOWY:
            kinds.add("snow")
        if readings.condition in SUNNY and readings.sun_up:
            kinds.add("sun")
        self._outdoor_c = readings.outdoor_c
        self._weather_now = kinds | (
            {"storm"} if readings.condition in STORMY else set()
        )
        if kinds:  # the house's weather, while the pet is out too
            self.people.saw_weather(self._today(now)[0], kinds)
        # The journal's week strip: the day's first notable weather (E14).
        strip = self._weather_now | ({"fog"} if readings.condition in FOGGY else set())
        if model.week_weather(self.state, self._today(now)[0], strip):
            self._save()
        arrivals, self._arrivals = self._arrivals, []
        if self._awake():
            self._fire(
                self._someone_home(arrivals, now) + self._friends_home(arrivals, now)
            )
        self._fire(self._passing_moments(readings, now))
        if self._awake():
            # The house can grant the day's wish, and give the pet things to dream of.
            for trigger, on in (
                ("music", readings.music),
                ("tv", readings.tv),
                ("rain", is_raining(readings)),
            ):
                if on:
                    self._fire(self._grant(trigger, None, now))
            if "full_moon" in effect.flags and not any(
                s["kind"] == "moon" for s in self.state.dream_seeds
            ):
                model.dream_seed(self.state, {"kind": "moon"}, now)
        self.debug["home"] = {
            "readings": {k: v for k, v in vars(readings).items() if v is not None},
            "flags": effect.flags,
            "requests": effect.requests,
            "bonus": effect.bonus,
            "dark_and_quiet": effect.dark_and_quiet,
        }

    def _passing_moments(self, readings: Readings, now: float) -> list[model.Event]:
        """Sunsets, the morning stir, the TV, the weather and its forecast, the
        season's first snow, frost or fog, the year's first warm day, and the
        first day of a season."""
        assert self.state is not None
        state = self.state
        settings = self.settings
        awake = not state.asleep and model.life_stage(state) != "egg"
        local = dt_util.as_local(dt_util.utc_from_timestamp(now))
        minute = local.hour * 60 + local.minute
        wake = settings.wake_time.hour * 60 + settings.wake_time.minute
        events = self.house_moments.update(
            readings,
            now,
            awake,
            morning=wake <= minute < 12 * 60,
            today=local.date().isoformat(),
            comfort=(
                self.config_entry.options.get(CONF_COMFORT_LOW, R.HOME_COMFORT_LOW_C),
                self.config_entry.options.get(CONF_COMFORT_HIGH, R.HOME_COMFORT_HIGH_C),
            ),
            satisfied={
                request
                for request, until in (
                    ("blanket", state.cozy_until),
                    ("fan", state.cool_until),
                )
                if now < until
            },
        )
        # The house answering: it is the model that tucks the pet in.
        events = [
            answer
            for e in events
            for answer in (
                model.house_answer(state, e["request"], now)
                if e["type"] == "house_answered"
                else [e]
            )
        ]
        if any(e["type"] == "good_morning" for e in events):
            model.morning_stir(state, now, settings)
            self._forecast_due = now + R.HOME_FORECAST_DELAY_MINUTES * 60
        if awake and readings.condition in SNOWY:
            first = model.season_first(state, "snow", now, settings.tz)
            if first:  # the first snow says it all
                events = [e for e in events if e.get("change") != "snow_started"]
            events += first
        if awake and readings.outdoor_c is not None and readings.outdoor_c <= 0:
            events += model.season_first(state, "frost", now, settings.tz)
        if awake:  # the year's first warm day (E12)
            events += model.warm_first(
                state, readings.outdoor_c, now, settings.tz, self.hass.config.latitude
            )
        if awake and readings.condition in FOGGY:
            events += model.season_first(state, "fog", now, settings.tz)
        if awake and (start := P.season_start(local.date(), self.hass.config.latitude)):
            events += model.season_start(state, *start, now)  # H7
        events += self._forecast_talk(readings, now, awake, minute >= wake)
        if readings.company and any(e["type"] == "sunset" for e in events):
            events += self._grant("sunset", None, now)  # watched it together
        return [self._degrees(e) for e in events]

    def _forecast_talk(
        self, readings: Readings, now: float, awake: bool, after_wake: bool
    ) -> list[model.Event]:
        """Today's forecast a few minutes after good morning (until noon), and
        tomorrow's in the evening before bed: only if it's worth a word."""
        local = dt_util.as_local(dt_util.utc_from_timestamp(now))
        events: list[model.Event] = []
        if self._forecast_due is not None and now >= self._forecast_due:
            self._forecast_due = None
            today = local.date()
            talk = forecast_moment(
                self.forecast.get(today.isoformat()),
                self.forecast.get((today - timedelta(days=1)).isoformat()),
                "today",
            )
            # Rain already falling needs no forecast.
            raining = talk and talk["kind"] == "rain" and is_raining(readings)
            if talk and awake and local.hour < 12 and not raining:
                events.append(talk)
        to_bed = model.minutes_to_bedtime(now, self.settings)
        # Past midnight but before waking, "tomorrow" is the coming day.
        target = local.date() + timedelta(days=1 if after_wake else 0)
        key = target.isoformat()
        if (
            awake
            and R.HOME_BEDTIME_WINDOW_MINUTES
            < to_bed
            <= R.HOME_FORECAST_EVENING_HOURS * 60
            and self._forecast_evening != key
            and key in self.forecast
        ):
            self._forecast_evening = key
            talk = forecast_moment(
                self.forecast[key],
                self.forecast.get((target - timedelta(days=1)).isoformat()),
                "tomorrow",
            )
            if talk:
                events.append(talk)
        return events

    def _degrees(self, event: model.Event) -> model.Event:
        """Temperatures in the owner's unit, as whole degrees."""
        unit = self.hass.config.units.temperature_unit
        for key, name in (
            ("temp_c", "temperature"),
            ("high_c", "high"),
            ("low_c", "low"),
        ):
            if key in event:
                celsius = event.pop(key)
                event[name] = round(
                    TemperatureConverter.convert(
                        celsius, UnitOfTemperature.CELSIUS, unit
                    )
                )
        return event

    def _want_forecast(self, now: float) -> None:
        """Refresh the daily forecast in the background, at most hourly."""
        # The watcher's options, not the entry's: a save lands before the reload.
        if not self._home_started or not self.watcher._ids(CONF_WEATHER):
            return
        if now - self._forecast_at < R.HOME_FORECAST_REFRESH_MINUTES * 60:
            return
        self._forecast_at = now
        self.config_entry.async_create_background_task(
            self.hass, self._async_forecast(), f"{DOMAIN} forecast"
        )

    async def _async_forecast(self) -> None:
        entity_id = self.watcher._ids(CONF_WEATHER)[0]
        try:
            response = await self.hass.services.async_call(
                "weather",
                "get_forecasts",
                {"entity_id": entity_id, "type": "daily"},
                blocking=True,
                return_response=True,
            )
        except Exception:  # noqa: BLE001 - no forecast just means no forecast talk
            LOGGER.debug("No daily forecast from %s", entity_id, exc_info=True)
            return
        items = (response or {}).get(entity_id, {}).get("forecast")
        if not isinstance(items, list):
            return
        state = self.hass.states.get(entity_id)
        unit = state.attributes.get("temperature_unit") if state else None
        self.forecast.update(daily_forecast(items, unit))
        # Keep yesterday (today's forecast is compared with it) and later.
        yesterday = (dt_util.now().date() - timedelta(days=1)).isoformat()
        self.forecast = {d: f for d, f in self.forecast.items() if d >= yesterday}

    def _sync_name(self) -> None:
        """Follow renames: the device's own name if the owner set one, else the
        entry's title. Notifications and the journal use it."""
        assert self.state is not None
        name = pet_name(self.hass, self.config_entry)
        if name != self.state.name:
            self.state.name = name

    def _advance(self, now: float, simulated: bool = False) -> None:
        assert self.state is not None
        self._sync_name()
        before = self.state.last_updated
        events = model.advance(self.state, now, self.settings, self.rng)
        self.debug["last_tick"] = dt_util.utc_from_timestamp(now).isoformat()
        self.debug["last_step_minutes"] = round((now - before) / 60, 2)
        self._fire(events, simulated)
        self._pick_favourite()
        # Follow-ups past their day (F1); then the memory of removed HA users (M3a).
        if self.people.prune_daily(self._today(now)[0]):
            # On hass, not the entry: a reload of this pet's entry must not cancel
            # the house's once-a-day prune (it is not retried that day).
            self.hass.async_create_background_task(
                self.people.async_prune_users(), "virtual_pet prune users"
            )
        self._save()

    def _pick_favourite(self) -> None:
        """A hatched pet without a favourite snack picks one (at hatching, or
        at load for a pet from before favourites)."""
        state = self.state
        if state is not None and state.species:
            model.pick_favourite(state, self.likes.get(state.species, []), self.rng)

    def _fire(self, events: list[model.Event], simulated: bool = False) -> None:
        if rounds := [e for e in events if e["type"] == "sitter_round"]:
            # The sitter's rounds never reach the bus or the moments (plan sitter
            # §5.4): the last one goes to the cards' house.sitter only.
            if not simulated:
                self._sitter_last = {"at": rounds[-1]["at"], "did": rounds[-1]["did"]}
            events = [e for e in events if e["type"] != "sitter_round"]
        for event in events:
            if event["type"] == "game_finished" and event.get("dropped"):
                self._dropped_games.add(event["game"])
            # The bus and the public moments get a scrubbed copy, and a bond
            # moment not even that: it is its person's alone (the channel). A
            # channel-only house moment is the channel's too (it says someone's
            # home). _notify and _to_channel read the event itself (who, the
            # nickname).
            public = not self._channel_only(event)
            scrubbed = {k: v for k, v in event.items() if k not in PRIVATE_EVENT_FIELDS}
            # house_words_private: the headline (text) stays off the sensor; the
            # bus keeps a headline (the automation's own words), never the text.
            hushed = self._hushed(event)
            if public:
                data = {k: v for k, v in scrubbed.items() if k != "type"}
                if hushed and event["type"] == "house_moment":
                    data.pop("text", None)
                data["pet_id"] = self.pet_id
                if simulated:
                    data["simulated"] = True
                self.hass.bus.async_fire(f"{DOMAIN}_{event['type']}", data)
            self._notify(event, simulated, events)
            if simulated:
                continue
            at = dt_util.utcnow().isoformat()
            # A show or song is the house's, on the channel; the public list
            # only hears that the TV or music was on.
            if (as_type := PUBLIC_AS.get(event["type"])) is not None:
                moment: dict[str, Any] | None = {"type": as_type, "at": at}
            elif public and event["type"] in MOMENT_BARE:
                moment = {"type": event["type"], "at": at}
                if event.get("cause") in MOMENT_CAUSES_SHOWN:
                    moment["cause"] = event["cause"]
            elif public and event["type"] in MOMENTS:
                moment = {**scrubbed, "at": at}
                if hushed:
                    for key in HOUSE_WORDS[event["type"]]:
                        moment.pop(key, None)
                    # Custom words said live: the public copy would say the
                    # reaction's line as well (one bubble a moment, review F4).
                    if event["type"] == "house_moment":
                        moment = None
            else:
                moment = None
            if moment is not None:
                self._keep_moment(moment)
            self._to_channel(event, at, hushed)
        if shown := [e["type"] for e in events if not self._channel_only(e)]:
            self.debug["last_events"] = shown[-10:]
        if simulated or self.state is None:
            return
        started = any(
            e["type"] == "call_started"
            and e.get("recall")
            and e.get("reason") != "dirty"  # poop calls send no push (Wave 0 Q4)
            for e in events
        )
        self.update_recalls(self.pet_id if started else None)
        morning = any(
            e["type"] == "good_morning"
            or (e["type"] == "woke_up" and e.get("how") == "morning")
            for e in events
        )
        if any(e["type"] == "woke_up" and e.get("how") == "morning" for e in events):
            self._dream()
        if morning:
            self._holiday_morning()
            self._birthday_morning()
            self._fire(self._daily_wish(self._now()))
        self._check_ins(events)

    # --- Daily check-ins: the wish of the day, and dreams ----------------------

    def _awake(self) -> bool:
        state = self.state
        return (
            state is not None
            and not state.asleep  # with the sitter too: it is up and living
            and model.life_stage(state) != "egg"
        )

    def _today(self, now: float) -> tuple[str, int]:
        local = dt_util.as_local(dt_util.utc_from_timestamp(now))
        return local.date().isoformat(), local.hour

    def wish_options(self) -> set[str]:
        """The wishes this house can grant."""
        options = self.config_entry.options
        wishes = set(model.ALWAYS_WISHES)
        if options.get(CONF_MUSIC):
            wishes.add("music")
        if options.get(CONF_TV):
            wishes.add("tv")
        if options.get(CONF_CHORES):
            wishes.add("chore")
        today = self._today(self._now())[0]
        if (forecast := self.forecast.get(today)) and forecast.condition in RAINY:
            wishes.add("rain")  # only on a day the forecast says it will rain
        return wishes

    def _check_visits(self) -> None:
        """After load (finding #9, #12): a visit from another world, or by a
        visitor this world no longer has, becomes no visit that day (the next
        day picks from this world). The collection is left as saved: a world or
        id this worlds.json doesn't know (a later version's, before a downgrade)
        stays for the upgrade back, and whatever counts or shows the collection
        skips it (owner, 2026-11-01)."""
        state = self.state
        assert state is not None
        visit = state.visit
        if visit and (
            visit["world"] != self.world
            or (
                visit["id"]
                and visit["id"] not in self.known_visitors.get(self.world, set())
            )
        ):
            state.visit = {"day": visit["day"], "world": self.world, "id": None}

    def _daily_visit(self, now: float) -> None:
        """The day's visit (plan visitors v2 §1): credit the last one once its
        window is over, then pick today's on the first tick of the local day.
        In every stage, asleep, away or an egg: it is the server's, not the
        pet's."""
        assert self.state is not None
        if model.daily_visit(
            self.state,
            now,
            self._today(now)[0],
            self.world,
            self.visitors,
            self.pet_id,
            self.rng,
            dt_util.get_default_time_zone(),
            finds=self.finds,
            known=self.known_finds,
        ):
            self._save()

    def _roll_find(self, now: float) -> None:
        """The find clock (plan visitors v2 §2): after the house is read, outside
        advance, so nothing is caught up. Nothing rolls until the house has
        been read once (review V-B #3)."""
        state = self.state
        if state is None or self._find_flags is None:
            return
        before = state.next_find_at
        events = model.roll_find(
            state,
            now,
            self._today(now)[0],
            self.world,
            self.finds,
            self._find_flags,
            self.known_finds,
            self.rng,
        )
        if state.next_find_at != before:
            self._save()
        self._fire(events)

    def _gift_tick(self, now: float) -> None:
        """Each friend's gift clock (plan visitors v2 §5), after the find
        roll, outside advance; not until the house has been read once (a
        gift's conditions need the flags). Saved, never fired: a gift is on
        no bus, sensor, push or debug list. The tick's update then pushes the
        person's own `mine.gift`."""
        state = self.state
        if state is None or self._find_flags is None:
            return
        if model.gift_tick(
            state, now, self.world, self.finds, self._find_flags, self.rng
        ):
            self._save()

    def take_gift(self, user: str) -> dict[str, Any] | None:
        """The gift's take (virtual_pet/collect {gift: true}): read and clear
        with no await (two screens: the first gets it, the second None), then
        only the watchers' `mine` changes, so only this person's screens are
        sent anything: no advance, no publish, no event (V-E review #2). The
        caller saves at once."""
        assert self.state is not None
        gift = model.take_gift(
            self.state, user, self._now(), self.known_finds, self.rng
        )
        if gift is not None:
            self._push_watchers()
        return gift

    def collect(self) -> list[dict[str, Any]]:
        """The basket tap (virtual_pet/collect): read and clear the known finds
        waiting, with no await in between (two screens: the first gets them,
        the second []), and publish, so every screen's basket goes at once.
        Pure: no advance. The caller saves at once (review V-B #18)."""
        assert self.state is not None
        taken = model.collect_basket(self.state, self.known_finds)
        if taken:
            self._publish()
        return taken

    def collection_view(self, user: str, shared: bool) -> dict[str, Any]:
        """The collection page (virtual_pet/collection, plan visitors v2 §4):
        {world, visitors: [id], finds: {id: day}} for this world's page of
        state.collection, only ids worlds.json knows for this world, and no
        gift-only find (known_finds includes them; V-E puts gifts on the
        receiver's own page, as `gifts`). Pure read: no advance, no save, no
        publish. Ids it skips stay in the save (V-A's rule).

        `gifts` (V-E review #17): absent on a shared screen; otherwise the ids
        of this world's known finds in this person's own `gifts`, [] for none
        or no bond."""
        assert self.state is not None
        page = self.state.collection.get(self.world, {})
        known_visitors = self.known_visitors.get(self.world, set())
        known_finds = self.known_finds.get(self.world, set())
        gift_only = {f["id"] for f in self.finds if f.get("gift_only")}
        visitors = page.get("visitors", {})
        finds = page.get("finds", {})
        view: dict[str, Any] = {
            "world": self.world,
            "visitors": [v for v in visitors if v in known_visitors],
            "finds": {
                f: day
                for f, day in finds.items()
                if f in known_finds and f not in gift_only
            },
        }
        if not shared:
            bond = self.state.bonds.get(user) or {}
            view["gifts"] = [g for g in bond.get("gifts", ()) if g in known_finds]
        return view

    async def async_save_now(self) -> None:
        """Write the save at once (after a collect: a crash can't bring the
        basket back)."""
        assert self.state is not None
        await self.store.async_save(self.state.to_dict())

    def _visit_view(self) -> dict[str, Any] | None:
        """Today's visit for every screen: {day, id, hours, from, until} (epoch
        seconds), only with a visitor, only this world's, and only today's or
        one inside its window whatever its day (HA's zone moved east across
        midnight mid-window). It names nobody."""
        if self.state is None:
            return None
        visit = model.live_visit(self.state, self.world)
        if not visit or not visit.get("id"):
            return None
        now = self._now()
        live = visit["from"] <= now < visit["until"]
        if visit["day"] != self._today(now)[0] and not live:
            return None
        return {k: visit[k] for k in ("day", "id", "hours", "from", "until")}

    def _daily_wish(self, now: float) -> list[model.Event]:
        """Today's wish, once the pet is up for the day (a morning moment, or the
        first tick after wake time)."""
        if not self._awake() or self.state is None:
            return []
        settings = self.settings
        if model.in_sleep_hours(now, settings):
            return []
        today, _ = self._today(now)
        events = model.pick_wish(
            self.state, today, self.rng, self.wish_options(), self.friends()
        )
        if events:
            self._save()
        return events

    def _grant(self, trigger: str, by: str | None, now: float) -> list[model.Event]:
        assert self.state is not None
        today, hour = self._today(now)
        events = model.grant_wish(self.state, trigger, now, today, hour, by)
        if events:
            self._save()
        return events

    def _dream(self) -> None:
        """Waking in the morning: what it dreamed of (shown at the first look)."""
        assert self.state is not None
        now = self._now()
        if model.life_stage(self.state) == "egg":
            return
        if model.dream_on_waking(
            self.state, now, self._today(now)[0], self.rng, self.pet_id
        ):
            self._save()

    def _check_ins(self, events: list[model.Event]) -> None:
        """Care, games and moments: they may grant the wish, and are things to
        dream about."""
        state = self.state
        assert state is not None
        now = self._now()
        granted: list[model.Event] = []
        # The newest row a person could have written: the sitter's and a chore
        # treat's are nobody's, so a game won after them is still its player's
        # (plan sitter §3.5).
        by = next(
            (
                row.get("by")
                for row in state.care_log
                if row.get("action") not in NOBODY_ROWS
            ),
            None,
        )
        care = {"play": "play", "snack": "snack", "clean": "bath", "praise": "praise"}
        for e in events:
            kind = e["type"]
            if kind == "care" and e.get("result") == model.OK and e["action"] in care:
                granted += self._grant(care[e["action"]], by, now)
                if e["action"] == "snack":
                    own = model.life_stage(state) in self.own_food_stages.get(
                        state.species or "", set()
                    )
                    granted += model.favourite_snack(
                        state, self._today(now)[0], self.rng, own
                    )
            elif kind == "game_finished" and not e.get("dropped"):
                granted += self._grant("play", by, now)
                if e.get("won"):
                    model.dream_seed(state, {"kind": "game"}, now)
            elif kind == "chore_treat":
                granted += self._grant("chore", None, now)
                model.dream_seed(state, {"kind": "chore"}, now)
            elif kind == "fell_asleep" and e.get("how") == "lights":
                # Only tucking in: lights out from 18:00 to 03:00 local.
                hour = self._today(now)[1]
                if hour >= R.TUCK_IN_EVENING_HOUR or hour < 3:
                    granted += self._grant("tuck_in", None, now)
            elif kind in ("watching", "listening") and e.get("title"):
                model.dream_seed(state, {"kind": kind, "title": e["title"]}, now)
            elif kind == "weather" and e.get("change") in (
                "rain_started",
                "rainbow",
                "snow_started",
            ):
                model.dream_seed(state, {"kind": e["change"]}, now)
            elif kind in DREAM_OF:
                model.dream_seed(state, {"kind": DREAM_OF[kind]}, now)
        if granted:
            self._fire(granted)
            if self._actor and any(e["type"] == "wish_granted" for e in granted):
                self._fire(self._bond(self._actor, "wish"))

    # --- Bonds: the pet knows each person -------------------------------------

    def _bond(
        self, user: str | None, kind: str, game: str | None = None
    ) -> list[model.Event]:
        """Bond points for whoever did something (never for automations)."""
        if user is None or self.state is None:
            return []
        events = model.add_bond(
            self.state, user, kind, self._today(self._now())[0], self.rng, game
        )
        self._save()
        return events

    def photos(self, user: str) -> list[dict[str, Any]]:
        """One person's photos from this device's pets, oldest first: theirs
        only (the websocket command; never on a sensor or the bus)."""
        if self.state is None:
            return []
        photos = self.state.bonds.get(user, {}).get("photos", {})
        return [
            {"generation": int(gen), **photos[gen]} for gen in sorted(photos, key=int)
        ]

    def bond_for(self, user: str | None) -> tuple[int, str | None]:
        """(level, nickname once it has picked one) for a person; 0 for none."""
        bond = self.state.bonds.get(user or "") if self.state else None
        if not bond:
            return 0, None
        return model.bond_level(bond["points"]), bond.get("nickname")

    def _person_names(self) -> dict[str, str]:
        """First names of the people with a person entity, by HA user ID."""
        names = {}
        for state in self.hass.states.async_all("person"):
            if user := state.attributes.get("user_id"):
                first = (state.name or "").split()
                if first:
                    names[user] = first[0]
        return names

    def friends(self) -> set[str]:
        """Its close friends who have a person entity (HA user IDs)."""
        return {
            user
            for user in self._person_names()
            if self.bond_for(user)[0] >= R.BOND_FRIEND_LEVEL
        }

    def _friends_home(self, arrivals: list[str], now: float) -> list[model.Event]:
        """A close friend just came home: the pet cheers for them by name."""
        events: list[model.Event] = []
        for user in dict.fromkeys(arrivals):
            if self.bond_for(user)[0] < R.BOND_FRIEND_LEVEL:
                continue
            if now - self._cheered.get(user, -1e12) < R.FRIEND_HOME_EVERY_MINUTES * 60:
                continue
            self._cheered[user] = now
            event: model.Event = {"type": "friend_home", "user": user}
            if weather := self._home_weather():
                event["weather"] = weather
            events.append(event)
        return events

    def _someone_home(self, arrivals: list[str], now: float) -> list[model.Event]:
        """Someone signed in came home, whoever they are: a moment with no name,
        for shared screens (one timer for everyone)."""
        if not arrivals:
            return []
        if now - self._someone_cheered < R.FRIEND_HOME_EVERY_MINUTES * 60:
            return []
        self._someone_cheered = now
        return [{"type": "someone_home"}]

    def _home_weather(self) -> str | None:
        """What it's like out there, for someone coming in (the house's
        weather, not private): wet, snowy, cold or hot."""
        if "rain" in self._weather_now:
            return "wet"
        if "snow" in self._weather_now:
            return "snowy"
        if self._outdoor_c is not None and self._outdoor_c <= R.HOME_COLD_C:
            return "cold"
        if self._outdoor_c is not None and self._outdoor_c >= R.HOME_HOT_C:
            return "hot"
        return None

    @property
    def people(self) -> P.People:
        return self.hass.data[DOMAIN]["people"]

    def _voice_pet(
        self,
        user: str,
        eligible: Callable[[PetCoordinator], bool] = lambda p: True,
        among: Callable[[PetCoordinator], bool] = lambda p: True,
    ) -> PetCoordinator:
        """The pet that speaks for this person on their phone (the birthday and
        the send-off; plan favourite-resting §5.3). Their card's pet (`open_on`)
        is a preference among the pets that pass the message's gate, never a
        replacement for it: it speaks if it is loaded, notifies them, is
        hatched and `eligible` (with the sitter too, plan sitter §3.7). Otherwise, exactly as before: of the loaded pets
        that notify them (and pass `among`), the one they're closest to."""
        pets: dict[str, PetCoordinator] = self.hass.data[DOMAIN]["pets"]
        mine = [
            p
            for p in pets.values()
            if p.state is not None and user in p.state.notify_users
        ]
        chosen = pets.get(self.people.open_on(user) or "")
        if (
            chosen in mine
            and chosen.state is not None
            and model.life_stage(chosen.state) != "egg"
            and eligible(chosen)
        ):
            return chosen
        return max(
            (p for p in mine if among(p)),
            key=lambda p: (p.bond_for(user)[0], p.pet_id),
            default=self,
        )

    def _send_off(self, user: str, now: float) -> None:
        """Someone with "my day" on heads out on a notable morning: one line on
        their phone ("rain later today, take an umbrella ☂"), a few times a week
        at most, from the pet they're closest to (or their card's pet, if it may
        send one: its bond is close enough, and it's hatched)."""
        voice = self._voice_pet(
            user, eligible=lambda p: p.bond_for(user)[0] >= R.SENDOFF_LEVEL
        )
        if voice is not self or self.state is None:
            return
        level, nickname = self.bond_for(user)
        if (
            level < R.SENDOFF_LEVEL
            or not self.people.my_day(user)
            or user not in self.state.notify_users
        ):
            return
        today, hour = self._today(now)
        if not R.SENDOFF_HOURS[0] <= hour < R.SENDOFF_HOURS[1]:
            return
        person = self.people.person(user)
        week = (dt_util.now().date() - timedelta(days=6)).isoformat()
        days = [d for d in person.get("sendoffs", []) if d >= week]
        if today in days or len(days) >= R.SENDOFF_PER_WEEK:
            return
        kind = self._send_off_kind(today)
        if kind is None:
            return
        person["sendoffs"] = [*days, today]
        self.people.save()
        self._send(
            [user],
            notify.send_off(kind, self.state.name, nickname),
            f"{DOMAIN}_send_off",
            level="passive",
        )

    def _send_off_kind(self, today: str) -> str | None:
        """rain, snow, hot or cold: today, by the forecast or the sky now."""
        day = self.forecast.get(today)
        if "rain" in self._weather_now or (day and day.condition in RAINY):
            return "rain"
        if "snow" in self._weather_now or (day and day.condition in SNOWY):
            return "snow"
        if day and day.high_c is not None and day.high_c >= R.HOME_HOT_DAY_C:
            return "hot"
        if day and (
            (day.low_c is not None and day.low_c <= R.HOME_COLD_SNAP_C)
            or (day.high_c is not None and day.high_c <= R.HOME_COLD_DAY_HIGH_C)
        ):
            return "cold"
        return None

    async def async_visit(self, user: str, queued: int = 0) -> dict[str, Any]:
        """Someone opened the card on this pet (the card calls this, at most
        hourly per person, and again when they come home): a visit counts for
        their bond once a day, and may be today's "come say hi" wish. Returns
        what the pet has to tell only them, {"notes": [...], "ask": kind or
        None}: at most NOTES_PER_VISIT lines, the rest kept for a later look,
        and a question chosen here so the daily limit holds across pets and
        devices."""
        assert self.state is not None
        now = self._now()
        # Someone looked in while the day's visitor was here: a greeted visitor
        # for the social meter (top10 §6), whatever else this look counts for.
        if self._awake() and model.social_greet(
            self.state, now, self._today(now)[0], self.world
        ):
            self._save()
            self._publish()
        person = self.people.person(user)
        last = self._visits.get(user, -1e12)
        just_home = person.get("arrived", 0) > last
        if now - last < R.BOND_VISIT_EVERY_MINUTES * 60 and not just_home:
            return {
                "notes": [],
                "ask": None,
                "counted": False,
                **self._visit_prefs(user),
            }
        self._advance(now)
        if not self._awake():
            # Asleep: only the sleepy hello. The visit isn't counted,
            # so the lines it has wait for the next look once it's up.
            notes = self._up_early(user, now)
            self._publish()
            return {
                "notes": notes,
                "ask": None,
                "counted": False,
                **self._visit_prefs(user),
            }
        self._visits[user] = now
        events = self._bond(user, "visit")
        # Best friends get a photo (once a generation); _notes says so.
        if model.take_photo(self.state, user, self._today(now)[0]):
            self._save()
        if granted := self._grant("say_hi", await self._who_id(user), now):
            events += granted + self._bond(user, "wish")
        self._fire(events)
        came_home = self._came_home(user, now)
        notes: list[dict[str, Any]] = []
        # One look at a time per person: two pets on one dashboard visited
        # together must not both say the same person line.
        async with self.people.lock(user):
            # Read again under the lock: a "forget my data" may have run while
            # the auth lookup above was awaited, and must not be undone here.
            person = self.people.data["people"].get(user, {})
            # At most NOTES_PER_VISIT, and no more than the look has room for
            # (FIRST_LOOK_LINES, minus what the card already queued).
            room = min(R.NOTES_PER_VISIT, max(0, R.LOOK_LINES - queued))
            found = await self._notes(user, now)
            made_room = bool(found and found[0][3]["kind"] in CELEBRATIONS and not room)
            if made_room:
                room = 1  # a celebration takes the away note's place on the card
            for scope, kind, key, note in found:
                if len(notes) >= room:
                    break  # the rest wait for a later look
                if scope == "pet":
                    noted = model.bond_of(self.state, user).setdefault("noted", {})
                    noted[kind] = key
                    if note["kind"] == "birthday_friends":
                        noted["friends"] = key
                elif scope == "memory":
                    # A memory door's line (memory plan M1 S2): marked in their
                    # memory only, never `noted`, so "off" leaves no trace.
                    self.people.mark_memory_said(user, kind, key)
                else:
                    self.people.mark(user, kind, key)
                    if note.get("told"):
                        # Door 6 (memory plan M1b): the favourite's note, said once a
                        # day as ever, and its one-shot in their memory too.
                        self.people.mark_memory_said(
                            user, DOOR6[note["kind"]], self._today(now)[0]
                        )
                if kind == "guess":
                    person.pop("guess", None)  # said: used up
                notes.append(note)
        # A question only when the look has room for one more line.
        fits = queued + len(notes) < R.LOOK_LINES
        ask = self._question(user, now, came_home, notes) if fits else None
        self._save()
        self._publish()
        return {
            "notes": notes,
            "ask": ask,
            "counted": True,
            "made_room": made_room,
            **self._visit_prefs(user),
        }

    def _visit_prefs(self, user: str) -> dict[str, Any]:
        """The person's own settings, on every visit reply (counted or not), so a
        second device never shows a default. They go to this person only (a state
        attribute is everyone's)."""
        fresh = self.people.data["people"].get(user, {})
        return {
            "my_day": self.people.my_day(user),
            "birthday_kept": bool(fresh.get("birthday")),
            "birthday_phone": bool(fresh.get("birthday_phone")),
            "baby_talk": self.people.baby_talk(user),
            # Memory (plan M1a, S7): two booleans, never what is kept.
            "memory_on": self.people.memory_on(user),
            "memory_allowed": self.memory_allowed,
            "follow": 1,  # follow-ups (F1): the card may send a typed text, and fetch
        }

    def _up_early(self, user: str, now: float) -> list[dict[str, Any]]:
        """Looking in on the sleeping pet before sunrise: a sleepy hello."""
        state = self.state
        assert state is not None
        today, hour = self._today(now)
        sun = self.hass.states.get("sun.sun")
        if (
            not state.asleep
            or model.life_stage(state) == "egg"
            or not R.UP_EARLY_FROM <= hour < 12
            or sun is None
            or sun.state != "below_horizon"
            or self.bond_for(user)[0] < R.ASK_LEVEL
            or self.people.said(user, "up_early", today)
        ):
            return []
        self.people.mark(user, "up_early", today)
        return [{"kind": "up_early"}]

    def _came_home(self, user: str, now: float) -> str | None:
        """ "work", "school", "gym", "park" or "home" if they came home lately."""
        person = self.people.person(user)
        arrived = person.get("arrived", 0)
        if now - arrived > R.JUST_HOME_HOURS * 3600:
            return None
        return P.zone_word(self._trip_zone(person)) or "home"

    @staticmethod
    def _trip_zone(person: dict[str, Any]) -> str | None:
        """The zone this trip was to: entered after they last left home and
        before they came back (a stale zone never explains a later errand)."""
        zone = person.get("zone")
        arrived = person.get("arrived", 0)
        if not zone or not person.get("left", 0) < zone.get("at", 0) < arrived:
            return None
        return zone.get("name")

    async def _notes(
        self, user: str, now: float
    ) -> list[tuple[str, str, str, dict[str, Any]]]:
        """Private lines for one person, best first: (scope, kind, key, note).
        "pet" lines are this pet's own (said once each by this pet); "person"
        lines are said once by whichever pet they look at first."""
        state = self.state
        assert state is not None
        bond = model.bond_of(state, user)
        noted = bond.get("noted", {})
        person = self.people.person(user)
        likes = person.get("likes") or {}
        level = model.bond_level(bond["points"])
        my_day = self.people.my_day(user)
        local = dt_util.now()
        today, hour = local.date().isoformat(), local.hour
        out: list[tuple[str, str, str, dict[str, Any]]] = []

        # A celebration first, one a look: your birthday, else the pet's
        # (with the friendship month when it's the same number of months),
        # else the friendship month. The rest wait for a later look today.
        celebrations: list[tuple[str, str, str, dict[str, Any]]] = []
        year = str(local.year)
        if model.birthday_today(person.get("birthday"), today) and not (
            self.people.said(user, "your_birthday", year)
        ):
            # Unwell or unhappy: a quiet "happy birthday ♥", no tune.
            quiet = state.sick or state.happiness < R.BIRTHDAY_QUIET_BELOW
            celebrations.append(
                (
                    "person",
                    "your_birthday",
                    year,
                    {"kind": "your_birthday", "quiet": quiet},
                )
            )
        months = model.friends_for(bond.get("since"), today)
        friends = months and noted.get("friends") != today
        # No birthday while resting: aging is paused (plan §3.3, S4).
        born = None if state.resting else model.pet_birthday(state.hatched_on, today)
        if born and noted.get("birthday") != today:
            if friends and born.get("months") == months:
                note = {"kind": "birthday_friends", "months": months}
            else:
                note = {"kind": "pet_birthday", **born}
            celebrations.append(("pet", "birthday", today, note))
        # Memory (plan M1b): doors only while it is on and this pet allows it. Read
        # with .get (memory()), never person(), so nothing here re-creates a record.
        mem = self.people.memory(user) if self.memory_allowed else None
        if friends:
            note = {"kind": "friends_for", "months": months}
            # Door 11 (plan M2, 6a): the 12-month day only, one fixed-list tag and
            # nothing else; no memory mark (the bond's `noted` is the line's own).
            if months == 12 and mem is not None and (tag := P.memory_recap(mem, today)):
                note["tag"] = tag
            celebrations.append(("pet", "friends", today, note))
        out += celebrations[:1]
        gen = str(state.generation)
        if gen in bond.get("photos", {}) and noted.get("photo") != gen:
            out.append(("pet", "photo", gen, {"kind": "photo"}))
        dream = state.dream or {}
        if dream.get("kind") == "picked" and dream.get("day") == today:
            if noted.get("dream") != today:
                note = {"kind": "dream", "pick": dream["pick"]}
                note["yours"] = dream.get("user") == user
                out.append(("pet", "dream", today, note))
        tucked = bond.get("tucked_at")
        low, high = R.TUCK_IN_THANKS_HOURS
        if (
            tucked
            and noted.get("tucked") != tucked
            and hour < 12
            and low * 3600 <= now - tucked <= high * 3600
        ):
            out.append(("pet", "tucked", tucked, {"kind": "tucked_in"}))
        guess = person.get("guess") or {}
        if guess.get("day") and (
            guess["day"] < today
            or (guess["day"] == today and hour >= R.GUESS_FROM_HOUR)
        ):
            outcome = P.guess_outcome(
                guess["guess"], self.people.weather_on(guess["day"])
            )
            if guess["day"] < (local.date() - timedelta(days=2)).isoformat():
                person.pop("guess")  # too long ago to bring up
                self.people.save()
            else:
                out.append(
                    (
                        "person",
                        "guess",
                        today,
                        {"kind": "guess", "guess": guess["guess"], "outcome": outcome},
                    )
                )
        arrived = person.get("arrived", 0)
        if (
            my_day
            and level >= R.ZONE_LEVEL
            and now - arrived <= R.ZONE_REMEMBER_HOURS * 3600
            and (place := P.zone_word(self._trip_zone(person)))
            and not self.people.said(user, "zone", str(arrived))
        ):
            out.append(
                ("person", "zone", str(arrived), {"kind": "back_from", "place": place})
            )
        if my_day and not self.people.said(user, "day", today):
            day, moves = self._moved.get(user, ("", set()))
            seen = await wellbeing.read_day(
                self.hass,
                wellbeing.find_sensors(self.hass, user),
                moves if day == today else set(),
                self.people.weather_on(today),
            )
            if note := wellbeing.notice(seen, level, hour):
                out.append(("person", "day", today, note))

        def told(kind: str) -> bool:
            """Door 6: a favourite told on an earlier day while memory was on, and
            its one-shot not yet said (`ask_again` re-arms it)."""
            day = ((mem or {}).get("since_told") or {}).get(f"fav_{kind}")
            return bool(
                mem is not None
                and day
                and day < today
                and not self.people.memory_said(user, f"door6_fav_{kind}")
            )

        fav = likes.get("fav_weather")
        if (
            fav
            and {"sun": "sun", "rain": "rain", "snow": "snow", "storms": "storm"}[fav]
            in self._weather_now
            and not self.people.said(user, "fav_weather", today)
        ):
            note = {"kind": "fav_weather", "weather": fav}
            if told("weather"):
                note["told"] = True
            out.append(("person", "fav_weather", today, note))
        key = P.season_key(local.date(), self.hass.config.latitude)
        if likes.get("fav_season") and key and key.split("-")[0] == likes["fav_season"]:
            holiday = notify.holiday(local.date())
            if holiday and not self.people.said(user, "season_holiday", today):
                out.append(
                    (
                        "person",
                        "season_holiday",
                        today,
                        {
                            "kind": "season",
                            "season": likes["fav_season"],
                            "holiday": holiday,
                        },
                    )
                )
            elif not self.people.said(user, "season", key):
                # Door 6's season rides only this plain note, not a holiday's: told
                # during the favourite season it comes the next day, else at the next
                # start of that season (up to a year).
                note = {"kind": "season", "season": likes["fav_season"]}
                if told("season"):
                    note["told"] = True
                out.append(("person", "season", key, note))
        if (
            my_day
            and level >= R.ALARM_LEVEL
            and hour >= R.ALARM_EVENING_FROM
            and not self.people.said(user, "alarm", today)
            and (minute := self._tomorrows_alarm(user, local)) is not None
            and P.early_alarm(minute, [m for _, m in person.get("alarms", [])[:-1]])
        ):
            out.append(("person", "alarm", today, {"kind": "early_alarm"}))
        # A memory door (plan section 6), one a look and last, so a busy look's own
        # lines go first and the door waits (unmarked) for a later one.
        if mem is not None and (door := P.memory_door(mem, today, hour)):
            out.append(("memory", door[0], today, door[1]))
        return out

    def _tomorrows_alarm(self, user: str, local: datetime) -> int | None:
        """Tomorrow's clock alarm on their Android phone, in minutes after
        midnight (HA's time zone), remembered for their usual."""
        found = wellbeing.find_sensors(self.hass, user).found.get("alarm")
        state = self.hass.states.get(found[0]) if found else None
        if state is None:
            return None
        package = str(state.attributes.get("Package") or "").casefold()
        if package and "clock" not in package and "alarm" not in package:
            return None  # another app's reminder, not a wake-up alarm
        when = dt_util.parse_datetime(state.state)
        if when is None:
            return None
        when = dt_util.as_local(when)
        if when.date() != local.date() + timedelta(days=1):
            return None
        minute = when.hour * 60 + when.minute
        person = self.people.person(user)
        alarms = [
            a for a in person.get("alarms", []) if a[0] != when.date().isoformat()
        ]
        person["alarms"] = [*alarms, [when.date().isoformat(), minute]][-R.ALARM_KEPT :]
        self.people.save()
        return minute

    def _question(
        self, user: str, now: float, came_home: str | None, notes: list[dict[str, Any]]
    ) -> str | None:
        """The question for this look, if it's time for one (people.py)."""
        assert self.state is not None
        person = self.people.person(user)
        today, hour = self._today(now)
        if self._phone_ask_due(user, person, today):
            # Ahead of the day's questions: it matters now. It is the day's
            # question, and asked for good only once the card says it showed it
            # (async_answer "phone"): one the card dropped comes on a later day.
            P.mark_asked(person, today, hour, "phone")
            self.people.save()
            return "phone"
        kind = P.choose_question(
            person,
            today,
            hour,
            level=self.bond_for(user)[0],
            to_bed_minutes=model.minutes_to_bedtime(now, self.settings),
            has_forecast=P.tomorrow(today) in self.forecast,
            came_home=came_home,
            rested=any(n["kind"] == "rested" for n in notes),
            pet_once=self._pet_once(user, today),
            dreamed=bool(self.state.dream and self.state.dream.get("day") == today),
            world=self.world if self.visitors else None,
            pet_kinds=self._follow_kinds(user),
            memory_ask=self.memory_allowed,
        )
        if kind is None:
            return None
        P.mark_asked(person, today, hour, kind)
        if kind in P.ONCE_KINDS:
            P.mark_once(person, kind, today, self.world)
        if kind == "memory":
            # Counted only on the card's "shown" (memory plan M1 S3); until then only
            # the day it was chosen, so an old card can't hold the later slot.
            P.memory_chosen(person, today)
        if kind == "catchphrase":
            self._catch_ask(user)["asked"].append(today)
            self._save()
        if kind == "trick":
            # Once a generation-month per person, in this pet's bond (F7).
            if (bond := self.state.bonds.get(user)) is not None:
                bond["trick_asked"] = self._trick_key()
            self._save()
        self.people.save()
        return kind

    def _trick_key(self) -> str:
        """This pet's generation and trick month (an adult's month from its 14th
        day, as the card's trickMonth; a teen's is 0)."""
        assert self.state is not None
        adult = dict(R.STAGE_STARTS)["adult"]
        months = max(0, int((self.state.age_hours - adult) // (30 * 24)))
        return f"{self.state.generation}-{months}"

    def _follow_kinds(self, user: str) -> tuple[str, ...]:
        """The follow-ups only this pet asks (F6, F7): a game always; a trick
        only with one left to learn (a teen, or an adult before its 3rd trick
        month), at most once a generation-month for this person."""
        assert self.state is not None
        kinds = ["game"]
        stage = model.life_stage(self.state)
        months = int(self._trick_key().rsplit("-", 1)[1])
        left = stage == "teen" or (stage == "adult" and months < R.TRICKS_COUNT)
        bond = self.state.bonds.get(user) or {}
        if left and bond.get("trick_asked") != self._trick_key():
            kinds.insert(0, "trick")
        return tuple(kinds)

    def _phone_ask_due(self, user: str, person: dict[str, Any], today: str) -> bool:
        """Whether the pet asks this person "can I call your phone?" (top10 1a):
        once ever, house-wide (`phone_asked` in the people store; "forget my
        data" clears it); only with the Home Assistant app signed in as them
        (their own phones, never anyone else's); not if they already get this
        pet's calls; and only after a missed call, or while a real call is open."""
        state = self.state
        assert state is not None
        if (
            person.get("phone_asked")
            or (person.get("asked") or {}).get("day")
            == today  # a question today already
            or user in state.notify_users
            or model.life_stage(state) == "egg"
        ):
            return False
        call = state.call
        if not state.recent_misses and (call is None or call.reason == "fake"):
            return False
        return bool(notify.phones(self.hass, user))

    def _pet_once(self, user: str, today: str) -> tuple[str, ...]:
        """The pet's own one-time questions still open for this person: its
        catchphrase, from a close friend, once per generation (a hatchling
        waits until it's a child, though the bond it inherits is close)."""
        state = self.state
        assert state is not None
        if self.bond_for(user)[0] < R.CATCHPHRASE_LEVEL or model.life_stage(state) in (
            "egg",
            "baby",
        ):
            return ()
        ask = self._catch_ask(user)
        if ask.get("answered") or not P.may_ask_again(ask["asked"], today):
            return ()
        return ("catchphrase",)

    def _catch_ask(self, user: str) -> dict[str, Any]:
        """This generation's catchphrase question in a close friend's bond."""
        assert self.state is not None
        bond = self.state.bonds[user]
        ask = bond.get("catchphrase")
        if not isinstance(ask, dict) or ask.get("generation") != self.state.generation:
            ask = bond["catchphrase"] = {
                "generation": self.state.generation,
                "asked": [],
            }
        return ask

    async def async_answer(
        self,
        user: str,
        question: str,
        answer: str,
        text: Any = None,
        day: Any = None,
        private: bool = False,
        tag: Any = None,
    ) -> dict[str, Any] | None:
        """A remembered answer: a favourite, tonight's dream, a guess, its
        catchphrase, or a follow-up's (F1: a tough day's softer morning, a big
        day's "yes" with its optional text). Nothing here is logged.

        private: the card said it isn't a shared screen (`shared: false`). Only
        then may a pick also go to the person's memory (memory plan R3, M1 B1),
        if it's on and this pet allows it; else the answer is kept as ever.

        tag: a big day's or weekend's "yes" may carry one fixed-list tag (memory
        plan M2). One outside the list, not a string, or on any other answer is
        refused before anything is kept; a good one that can't be kept here
        (memory off, this pet's option off, a shared or old card) is dropped and
        the "yes" kept (FM s2782 Q7)."""
        assert self.state is not None
        keep = private and self.memory_allowed
        if tag is not None and not (
            question in P.MEMORY_TAG_KINDS
            and answer == "yes"
            and isinstance(tag, str)
            and tag in P.MEMORY_TAGS
        ):
            raise ValueError("It didn't ask that")
        if question in P.LATER_CHECKED:
            if answer not in P.ANSWERS.get(question, ()):
                raise ValueError("Not an answer the pet keeps")
            today = self._today(self._now())[0]
            kept: dict[str, Any] | None = None
            async with self.people.lock(user):
                person = self.people.data["people"].get(user, {})
                if not P.asked_later(person, today, question):
                    raise ValueError("It didn't ask that")
                if question in ("how_day", "big_how") and answer == "great":
                    # Door 2's (memory plan M1b, FM Q-A): kept only while their memory
                    # is on, this pet allows it and the screen is their own; never a
                    # soft morning (M1 B2). Else refused, with the slot left open.
                    if not (keep and self.people.memory_on(user)):
                        raise ValueError("Not an answer the pet keeps")
                    self.people.remember(user, "great", {"day": today, "ask": question})
                elif question in ("how_day", "big_how"):
                    self.people.set_mood(user, today)  # memory only (E13)
                elif question == "game":
                    # The choice, said back by this pet tomorrow (F6).
                    self.people.open_follow(
                        user, "game", today, choice=answer, pet=self.pet_id
                    )
                    if keep:
                        self.people.remember(
                            user, "game", {"day": today, "pick": answer}
                        )
                elif question == "trick" and answer == "yes":
                    self.people.open_follow(user, "trick", today, pet=self.pet_id)
                elif question == "big_day" and answer == "yes":
                    # The day they picked this week (opp #2); none: nothing kept.
                    if not P.big_day_pick(today, day):
                        raise ValueError("Not a day this week")
                    self.people.open_follow(user, question, today, text, day=day)
                    event = self.people.open_event(user)
                    kept = {"until": event["until"]}
                    if tag and keep:  # the day they picked (memory plan M2)
                        self.people.remember(
                            user,
                            "tags",
                            {"day": event["due"], "kind": question, "tag": tag},
                        )
                elif answer == "yes":  # weekend: with their words, if any
                    self.people.open_follow(user, question, today, text)
                    event = self.people.open_event(user)
                    kept = {"until": event["until"]}
                    if tag and keep:  # its Saturday: due is the Monday (plan M2 N12)
                        saturday = date.fromisoformat(event["due"]) - timedelta(days=2)
                        self.people.remember(
                            user,
                            "tags",
                            {"day": saturday.isoformat(), "kind": question, "tag": tag},
                        )
                # Audit 0.43.0 F-01: answered, the later slot holds no open question
                # (the evening's ask may then take it). The dated follow-ups keep it:
                # their typed step answers the same ask again.
                asked = person.get("asked")
                if question in P.SLOT_CLOSED_BY_ANSWER and isinstance(asked, dict):
                    if asked.pop("later_kind", None):
                        self.people.save()
            self._push_everywhere()  # their follow_at
            return kept
        if question == "birthday":
            # Theirs, kept only in the people store; "skip" sticks. Never echoed.
            person = self.people.person(user)
            if answer == "skip":
                person["birthday_skipped"] = True
            elif model.valid_birthday(answer):
                person["birthday"] = answer
            else:
                raise ValueError("Not a birthday")
            self.people.save()
            self._push_everywhere()  # birthday_kept changed
            return
        if question == "fav_visitor":
            # This pet's world's visitors only (F4); asked again in a new world.
            if answer not in {v.get("id") for v in self.visitors}:
                raise ValueError("Not a visitor of this world")
            self.people.person(user).setdefault("likes", {})[
                P.fav_visitor_key(self.world)
            ] = answer
            self.people.save()
            self._push_everywhere()  # their mine.fav_visitor
            return
        if answer not in P.ANSWERS.get(question, ()):
            raise ValueError(f"{answer} isn't an answer to {question}")
        if question == "phone":
            # Shown on their card: asked for good ("yes" also turns notify me on,
            # from the card). Kept in the people store; "forget my data" clears it.
            self.people.person(user)["phone_asked"] = True
            self.people.save()
            return
        if question == "memory":
            await self._answer_memory(user, answer, private)
            return
        if question == "catchphrase":
            # Only from the close friend it asked, while the question is open:
            # it's the pet's, and everyone hears it.
            bond = self.state.bonds.get(user)
            ask = bond.get("catchphrase") if bond else None
            if (
                self.bond_for(user)[0] < R.CATCHPHRASE_LEVEL
                or not isinstance(ask, dict)
                or ask.get("generation") != self.state.generation
                or not ask.get("asked")
                or ask.get("answered")
            ):
                raise ValueError("It didn't ask that")
            ask["answered"] = True
            if answer != "keep":
                self.state.catchphrase = answer
            self._save()
            self._publish()
            return
        person = self.people.person(user)
        today = self._today(self._now())[0]
        if question in ("fav_weather", "fav_season"):
            likes = person.setdefault("likes", {})
            same = likes.get(question) == answer
            likes[question] = answer
            # The day it was told, for door 6 (memory plan M1b): only from their own
            # screen while memory is on here. Told any other way, an older day would be
            # stale, so it goes. Not for a visitor (FM Q-B: no visitor door).
            mem = self.people.memory(user)
            told = (mem or {}).get("since_told") or {}
            if mem is not None and keep:
                if not (same and question in told):
                    mem.setdefault("since_told", {})[question] = today
            else:
                told.pop(question, None)
        elif question == "guess":
            person["guess"] = {"day": P.tomorrow(today), "guess": answer}
            if keep:
                self.people.remember(user, "guess", {"day": today, "pick": answer})
        elif question == "dream":
            model.pick_dream(self.state, user, answer, self._now())
            self._save()
            if keep:
                self.people.remember(user, "dream", {"day": today, "pick": answer})
        self.people.save()
        self._push_everywhere()  # a birthday kept

    async def _answer_memory(self, user: str, answer: str, private: bool) -> None:
        """The one-time memory ask's answer (memory plan section 5, M1b), each only
        under today's ask and from their own screen (R3), read with .get. "shown":
        the card showed it, so it counts (its tries, the gap) and the unshown days
        go. "yes": memory on, where this pet allows it, as the settings row does.
        "not_now" or "yes": answered for good (`memory_asked`), the slot closed."""
        today = self._today(self._now())[0]
        if not private:
            raise ValueError("It didn't ask that")
        async with self.people.lock(user):
            person = self.people.data["people"].get(user)
            if person is None or not P.asked_later(person, today, "memory"):
                raise ValueError("It didn't ask that")
            if answer == "shown":
                if today not in (person.get("likes_asked") or {}).get("memory", []):
                    P.mark_once(person, "memory", today)
                person.pop("memory_chosen_days", None)
                self.people.save()
                return
            if answer == "yes":
                if not self.memory_allowed:
                    raise ValueError("Not on this pet")
                self.people.set_memory(user, True, today)
            person["memory_asked"] = True
            person.pop("memory_chosen_days", None)
            person["asked"].pop("later_kind", None)
            self.people.save()
        self._push_everywhere()  # their mine.memory_on

    async def async_follow(self, user: str, at: str = "look") -> dict[str, Any]:
        """The follow-up beat due for this person now (virtual_pet/follow), marked
        said under their lock with no await in between: their other screens and
        pets get {}. at: "look" (a first look, a tab's return) or "picker" (F6)."""
        today, hour = self._today(self._now())
        async with self.people.lock(user):
            beat = self.people.follow_due(user, today, hour, self.pet_id, at)
        if beat and not beat.get("deferred"):
            self._push_everywhere()  # their follow_at
        return beat

    async def async_set_birthday_phone(self, user: str, enabled: bool) -> None:
        """Whether this person's phone hears "happy birthday" on the day."""
        self.people.person(user)["birthday_phone"] = enabled
        self.people.save()
        self._push_everywhere()

    async def async_set_baby_talk(self, user: str, enabled: bool) -> None:
        """Simpler words from babies and children on this person's cards. One
        switch per person, for every pet; no entity shows it (the card learns
        it from the visit reply and from its private channel)."""
        self.people.person(user)["baby_talk"] = enabled
        self.people.save()
        self._push_everywhere()

    async def async_forget_birthday(self, user: str) -> None:
        """Forget someone's birthday, and don't ask again."""
        person = self.people.person(user)
        person.pop("birthday", None)
        person.pop("birthday_phone", None)
        person["birthday_skipped"] = True
        self.people.save()
        self._push_everywhere()

    async def async_ask_again(self, user: str, kind: str) -> None:
        """Ask me again (memory plan M0-c): drop this person's favourite of this
        kind (the visitor: this world's) and start its tries over, so the next
        eligible look asks it again. Nothing else changes: the 3-day gap
        (once_last), `noted`, the birthday, the switches stay. Saved at once, as
        a forget is. A record that isn't there is not made."""
        if kind not in P.ASK_AGAIN_KINDS:
            return
        async with self.people.lock(user):
            person = self.people.data["people"].get(user)
            if person is None:
                return
            key = P.fav_visitor_key(self.world) if kind == "fav_visitor" else kind
            tries = f"fav_visitor_{self.world}" if kind == "fav_visitor" else kind
            gone = (person.get("likes") or {}).pop(key, None)
            (person.get("likes_asked") or {}).pop(tries, None)
            # Un-told, so its memory goes too, this pet's option or not (an erase):
            # the day it was told, and door 6's one-shot, re-armed for a new answer.
            memory = person.get("memory")
            if isinstance(memory, dict):
                told = (memory.get("since_told") or {}).pop(key, None)
                said = (memory.get("said") or {}).pop(f"door6_{kind}", None)
                gone = gone if gone is not None else told or said
            if gone is not None:
                await self.people.async_save_now()
        self._push_everywhere()  # their mine

    async def async_set_memory(self, user: str, enabled: bool) -> None:
        """Memory on or off for this person (memory plan M1a), one switch for every
        pet. On only where this pet allows it (ValueError); off always, and it
        erases: popped first, then saved at once, so an answer landing during the
        save finds no memory (R7, review S6). Either way the person has answered the
        ask (`memory_asked`, kept through "forget my data"), so it never comes."""
        if enabled and not self.memory_allowed:
            raise ValueError("Not on this pet")
        async with self.people.lock(user):
            # Using the row is an answer: the pet doesn't ask later (M1b audit).
            person = self.people.person(user)
            person["memory_asked"] = True
            person.pop("memory_chosen_days", None)
            if enabled:
                if self.people.set_memory(user, True, self._today(self._now())[0]):
                    self.people.save()
            else:
                await self.people.forget_memory(user)
        self._push_everywhere()  # their mine.memory_on

    def memory_get(self, user: str) -> dict[str, Any]:
        """The "things you told me" page (memory plan M3a): this person's memory as
        `People.memory_view` builds it. Refused (ValueError) where this pet's option
        is off or their memory is off: reads are not exempt, erases are (FM
        2026-11-05). Reads only."""
        view = (
            self.people.memory_view(user, self._today(self._now())[0])
            if self.memory_allowed
            else None
        )
        if view is None:
            raise ValueError("Not on this pet")
        return view

    async def async_memory_forget(
        self,
        user: str,
        kind: str,
        *,
        day: str = "",
        tag_kind: str | None = None,
        tag: str = "",
        weekday: int = 0,
    ) -> int:
        """Forget one entry from the page (memory plan M3a: a list, its day, a
        tag's kind), or a weekday pattern (`kind` "pattern": its tag and weekday).
        An erase, so this pet's option is not asked (FM 2026-11-05). How many
        entries went; none without a memory record. Nothing on the bus, nothing
        pushed: the page refetches."""
        async with self.people.lock(user):
            if kind == "pattern":
                return await self.people.forget_pattern(user, tag, weekday)
            return int(await self.people.forget_item(user, kind, day, tag_kind))

    async def async_set_my_day(self, user: str, enabled: bool) -> None:
        """Let the pets notice this person's day (steps, sleep, where they've
        been...), or stop. One switch per person, for every pet."""
        person = self.people.person(user)
        person["my_day"] = enabled
        if enabled:
            self.people.save()
        else:
            person.pop("zone", None)  # kept only while "my day" is on
            await self.people.async_save_now()
        for pet in self.hass.data[DOMAIN]["pets"].values():
            if pet.state is not None:
                pet.async_set_updated_data(pet.state)

    async def async_set_open_on(
        self, user: str, enabled: bool, house: bool = False
    ) -> None:
        """Open this person's card on this pet, or stop (plan favourite-resting
        §5.4): one pet per person, so setting it moves it here from any other.
        With `house`, the household default for shared screens instead (the
        websocket lets only admins). Every pet's channel hears it: the old
        pet's view changed too."""
        who = None if house else user
        async with self.people.lock(user):
            now = self.people.house_open_on() if house else self.people.open_on(user)
            if enabled:
                self.people.set_open_on(who, self.pet_id)
                self.people.save()
            elif now is not None and (
                now == self.pet_id or now not in self.hass.data[DOMAIN]["pets"]
            ):
                self.people.set_open_on(who, None)  # a stale one goes too
                await self.people.async_save_now()
        self._push_everywhere()

    async def async_set_rest_offer(self, user: str) -> None:
        """This person answered the offer to rest the others ("rest them" or
        "not now", plan favourite-resting §6.4): it doesn't come again until
        they forget their data. Saved at once, unlike `async_set_open_on`'s on:
        a once-only answer mustn't come back after a crash. Every pet's channel
        hears it, so a second slide's sheet doesn't offer again."""
        async with self.people.lock(user):
            self.people.person(user)["rest_offer"] = True
            await self.people.async_save_now()
        self._push_everywhere()

    def _birthday_morning(self) -> None:
        """A friend's birthday: their phone hears it with the first morning of
        any hatched pet at home that notifies them, from the one they're
        closest to (or their card's pet, if it's home and hatched), once a
        year. Their nickname, never their name. Only if they turned "birthday
        on my phone" on (off by default: the message is in HA's history, which
        admins can read)."""
        state = self.state
        if state is None or model.life_stage(state) == "egg":
            return
        local = dt_util.now().date()
        today, year = local.isoformat(), str(local.year)
        for user in state.notify_users:
            person = self.people.data["people"].get(user) or {}
            if not person.get("birthday_phone") or not model.birthday_today(
                person.get("birthday"), today
            ):
                continue
            if person.get("birthday_sent") == year:
                continue
            person["birthday_sent"] = year
            self.people.save()
            closest = self._voice_pet(
                user,
                among=lambda p: (
                    p.state is not None and model.life_stage(p.state) != "egg"
                ),
            )
            assert closest.state is not None
            self._send(
                [user],
                notify.birthday(closest.state.name, closest.bond_for(user)[1]),
                f"{DOMAIN}_birthday",
                level="passive",
            )

    def _holiday_morning(self) -> None:
        """On a holiday, the pet's first morning moment greets it on the phones
        of the people who get its notifications (once a day)."""
        if self.state is None or model.life_stage(self.state) == "egg":
            return
        local = dt_util.now()
        today = local.date().isoformat()
        kind = notify.holiday_morning(local.date())
        if kind is None or self._holiday_on == today:
            return
        self._holiday_on = today
        self._fire([{"type": "holiday", "holiday": kind}])

    def asking(self) -> notify.Asking | None:
        """This pet in the house's re-call bundle, if a need it missed still
        holds (it keeps asking on the card). Poop calls send no push (Wave 0
        Q4), so a pet asking only for a clean isn't named."""
        state = self.state
        if state is None or state.asleep or not state.notify_users:
            return None
        reasons = [r for r in model.still_asking(state, self._now()) if r != "dirty"]
        if not reasons:
            return None
        call = state.call
        # One pet named alone reads as its re-call: what it asks about now.
        reason = (
            call.reason
            if call and call.recall and call.reason in reasons
            else reasons[0]
        )
        return notify.Asking(
            self.pet_id,
            state.name,
            notify.message(
                {"type": "call_started", "reason": reason},
                state.name,
                self.species_names,
                self._call_day(),
            )
            or state.name,
            list(state.notify_users),
            lambda user: self.bond_for(user)[1],
        )

    def _call_day(self, event_type: str = "call_started") -> date:
        """The local day a notification's phrasing uses. A call's is the day the
        standing call started (so a re-call after midnight reads as the call did);
        any other event, even with an older call still open (a pet that fell sick
        asleep and woke by hand next day), speaks today. No call: today."""
        call = self.state.call if self.state else None
        when = call.started if call and event_type == "call_started" else self._now()
        return dt_util.as_local(dt_util.utc_from_timestamp(when)).date()

    def update_recalls(self, started: str | None = None) -> None:
        """Bring the house's re-call bundle up to date with every pet."""
        recalls: notify.Recalls | None = self.hass.data[DOMAIN].get("recalls")
        pets: dict[str, PetCoordinator] = self.hass.data[DOMAIN]["pets"]
        if recalls is None or pets.get(self.config_entry.entry_id) is not self:
            return  # loading (a reload's first tick would see an empty house)
        asking = [a for p in pets.values() if (a := p.asking()) is not None]
        for send in recalls.update(asking, started, self._now(), self._send_recall):
            self.config_entry.async_create_background_task(
                self.hass, send, f"{DOMAIN} notify"
            )

    async def _send_recall(self, users: list[str], text: str) -> None:
        # A normal push with no buttons (several pets); a tap opens the dashboard.
        await notify.send(self.hass, users, text, notify.RECALL_TAG, url=self.dashboard)

    def _notify(
        self,
        event: model.Event,
        simulated: bool,
        batch: list[model.Event] | None = None,
    ) -> None:
        """Tell the users who opted in, on their phones. Never for fast-forward."""
        if event["type"] in (
            "recovered",
            "fell_asleep",
            "rest_started",
        ):  # off the phones
            self._sick_told = False
        if simulated or self.state is None or not self.state.notify_users:
            return
        users = list(self.state.notify_users)
        told = (
            self._sick_told
            and event["type"] == "call_started"
            and event.get("reason") == "sick"
            and not event.get("resumed")
        )
        if told or not notify.pushes(event, batch or [event]):
            if (
                event["type"] == "call_started"
                and event.get("reason") != "sick"  # became_sick told it just now
                and self._call_notified
            ):
                # A poop call or re-call took over from a call on the phones
                # (a more urgent need ends a call with no event): clear it.
                self._call_notified = False
                self._send(users, "clear_notification", notify.call_tag(self.pet_id))
            return
        if event["type"] in notify.CALL_OVER_EVENTS and self._call_notified:
            # The call is over: take its notification off the phones.
            self._call_notified = False
            self._send(users, "clear_notification", notify.call_tag(self.pet_id))
        text = notify.message(
            event, self.state.name, self.species_names, self._call_day(event["type"])
        )
        if text is None:
            return
        if event["type"] in notify.CALL_EVENTS:
            self._call_notified = True
            if event["type"] == "became_sick":
                self._sick_told = True
            tag = notify.call_tag(self.pet_id)
        else:
            tag = f"{DOMAIN}_{self.pet_id}_{event['type']}"
        # Each person's phones get the nickname the pet gave them, if any.
        by_nickname: dict[str | None, list[str]] = {}
        for user in users:
            by_nickname.setdefault(self.bond_for(user)[1], []).append(user)
        buttons = notify.actions(event, self.pet_id)
        # A call may break through a focus mode the person allows; the rest wait
        # like any notification while their phone is in focus or do not disturb.
        level = (
            "time-sensitive"
            if event["type"] in notify.CALL_EVENTS and not event.get("resumed")
            else None
        )
        for nickname, group in by_nickname.items():
            personal = notify.to_friend(text, nickname) if nickname else text
            self._send(group, personal, tag, buttons, level)

    def _send(
        self,
        users: list[str] | None,
        text: str,
        tag: str,
        buttons: list[dict[str, str]] | None = None,
        level: str | None = None,
    ) -> None:
        self.config_entry.async_create_background_task(
            self.hass,
            notify.send(self.hass, users, text, tag, buttons, self.dashboard, level),
            f"{DOMAIN} notify",
        )

    def _welcome(self) -> None:
        """A new pet: a note in the sidebar, and on the phones of people who
        turned "notify me" on for another pet here (the first pet in a house
        welcomes in the sidebar only). The event names nobody."""
        name = pet_name(self.hass, self.config_entry)
        text = notify.welcome(name)
        # The shelf card shows every pet, so a household needs it on one dashboard once.
        # "Named" = this pet's setup or another pet's (a second pet carries the first's).
        own = self.dashboard
        elsewhere = next(
            (
                path
                for other in self.hass.config_entries.async_entries(DOMAIN)
                if other.entry_id != self.config_entry.entry_id
                and (path := notify.dashboard_path(other.options.get(CONF_DASHBOARD)))
            ),
            None,
        )
        if not (own or elsewhere):
            link = f"\n\n{notify.welcome_no_dashboard(name)}"
        else:
            link = f"\n\n[Open the pet shelf]({own or elsewhere})"
            if (
                not elsewhere
            ):  # the first pet: its dashboard may be an auto-generated one
                link += f"\n\n{notify.WELCOME_IF_MISSING}"
        persistent_notification.async_create(
            self.hass,
            text + link,
            title=f"{name} moved in ♥",
            notification_id=f"{DOMAIN}_{self.pet_id}_welcome",
        )
        pets: dict[str, PetCoordinator] = self.hass.data[DOMAIN]["pets"]
        users = sorted(
            {
                user
                for pet in pets.values()
                if pet is not self and pet.state is not None
                for user in pet.state.notify_users
            }
        )
        if users:  # never None: that's every phone in the house
            self._send(users, text, f"{DOMAIN}_{self.pet_id}_welcome")
        self.hass.bus.async_fire(f"{DOMAIN}_welcomed", {"pet_id": self.pet_id})

    async def async_notification_button(self, key: str, context: Context) -> None:
        """Someone pressed a button on one of this pet's notifications."""
        state = self.state
        if state is None or (state.call is None and not state.sick):
            return  # a stale notification: the call is over (a scold would be unfair)
        if key == "lights_out":
            await self.async_set_lights_out(True, context)
        elif key in model.ACTIONS:
            await self.async_action(key, context)

    async def async_set_notify(self, user_id: str, enabled: bool) -> None:
        """Opt a user in or out of this pet's notifications."""
        assert self.state is not None
        users = [u for u in self.state.notify_users if u != user_id]
        if enabled:
            users.append(user_id)
        self.state.notify_users = users
        self._save()
        self._publish()

    async def async_set_shell(self, finish: str | None) -> None:
        """Dress the pet in a shell finish (R.SHELL_FINISHES), or its world's
        own (None). A show-off it hasn't grown into yet is refused. Nobody is
        recorded as the one who picked it."""
        assert self.state is not None
        if finish is not None and not model.shell_unlocked(self.state, finish):
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="shell_locked",
                translation_placeholders={
                    "finish": finish,
                    "stage": R.SHELL_UNLOCKS[finish],
                },
            )
        self.state.shell_finish = finish
        self._save()
        self._publish()

    # --- The private channel: each person's own view (virtual_pet/subscribe) ---

    def _watchers(self) -> dict[object, channel.Watcher]:
        return channel.of(self.hass, self.pet_id)

    def _open_wish(self) -> dict[str, Any] | None:
        """Today's wish (the house's date) while it can still come true, as the
        life-stage sensor judges it."""
        wish = self.state.wish if self.state else None
        if not wish or wish.get("day") != dt_util.now().date().isoformat():
            return None
        if wish.get("granted"):
            return None
        if wish.get("kind") in model.DAYTIME_WISHES and model.in_sleep_hours(
            self._now(), self.settings
        ):
            return None
        return wish

    def spoken_wish(self) -> dict[str, Any] | None:
        """Today's wish for Assist (gaps-seams 6a): open, or granted today. Only
        its kind and whether it came true: never who it's for."""
        wish = self.state.wish if self.state else None
        if (
            wish
            and wish.get("granted")
            and wish.get("day") == dt_util.now().date().isoformat()
        ):
            return {"kind": wish.get("kind"), "granted": True}
        open_wish = self._open_wish()
        return {"kind": open_wish.get("kind")} if open_wish else None

    def spoken_visitor(self) -> str | None:
        """Today's visitor's name for Assist (gaps-seams 6a), once its window is
        over (credited); None before then, so the surprise isn't spoiled."""
        visit = model.live_visit(self.state, self.world) if self.state else None
        if not visit or not visit.get("id") or not visit.get("credited"):
            return None
        if visit.get("day") != self._today(self._now())[0]:
            return None
        return next(
            (v.get("name") for v in self.visitors if v.get("id") == visit["id"]), None
        )

    def _mine(self, user: str, admin: bool = False) -> dict[str, Any]:
        """What only this person sees: their bond, and their own switches. Read,
        never created: an open card mustn't bring back a forgotten record. An
        admin's also says whether shared screens open on this pet (their row to
        change it); no one else's does."""
        state = self.state
        bond = state.bonds.get(user) if state else None
        person = self.people.data["people"].get(user, {})
        wish = self._open_wish()
        return {
            "bond": {
                "level": model.bond_level(bond["points"]),
                **{k: bond[k] for k in ("nickname", "favourite") if bond.get(k)},
            }
            if bond
            else None,
            "notify_me": state is not None and user in state.notify_users,
            "wish_for_you": wish is not None and wish.get("for") == user,
            "my_day": self.people.my_day(user),
            "baby_talk": self.people.baby_talk(user),
            # Memory (plan M1a, R3): whether it is on, and whether this pet allows
            # it; never what is kept (only a memory command fetches that).
            "memory_on": self.people.memory_on(user),
            "memory_allowed": self.memory_allowed,
            "birthday_phone": bool(person.get("birthday_phone")),
            "birthday_kept": bool(person.get("birthday")),
            # Their card opens on this pet (the favourite, §5.3): only theirs, never
            # anyone else's choice.
            "open_on": self.people.open_on(user) == self.pet_id,
            # They answered the offer to rest the others (§6.4); never "show it now".
            "rest_offer": person.get("rest_offer") is True,
            # They have a favourite somewhere, on any pet, shown on this card or not (the
            # offer's edge: a move is not a first pick). A yes/no, never which pet.
            "has_open_on": self.people.open_on(user) is not None,
            **(
                {"house_open_on": self.people.house_open_on() == self.pet_id}
                if admin
                else {}
            ),
            # Their waiting gift, {id, world}, or None (plan visitors v2 §5).
            "gift": model.known_gift(bond, self.known_finds),
            # Their favourite of this world's visitors (an id), or None (F4), and of
            # the weather and the season, so the settings sheet can show them and
            # offer "ask me again" (memory plan M0-c). Their own channel only.
            "fav_visitor": (person.get("likes") or {}).get(
                P.fav_visitor_key(self.world)
            ),
            "fav_weather": (person.get("likes") or {}).get("fav_weather"),
            "fav_season": (person.get("likes") or {}).get("fav_season"),
            # Where a follow-up beat may wait for them today ("look", "picker"), so
            # their card keeps a first-look slot only then (F1); never what it is.
            "follow_at": self.people.follow_at(
                user, *self._today(self._now()), self.pet_id
            ),
            # Home Assistant's day and evening, which decide the beats (audit 0.43.0
            # F-03): the card's evening gate and daily marker follow these.
            **P.People.follow_clock(*self._today(self._now())),
        }

    def _shared_house(self, house: dict[str, Any]) -> dict[str, Any]:
        """A shared screen's house view also says whether it opens on this pet
        (the admin-set household default, favourite §5.3). It names nobody, and
        only shared screens get it."""
        return {**house, "house_open_on": self.people.house_open_on() == self.pet_id}

    def _fx_keys(self) -> tuple[str, ...]:
        """The device_fx keys this house can tell: those whose source is mapped
        (rain: a weather entity or a rain sensor; the other weather keys: the
        weather entity; each room key: its own mapping)."""
        return mapped_keys(self.config_entry.options)

    def _fx_mapped(self) -> bool:
        """Some key could be present; with none, there is no device_fx at all."""
        return bool(self._fx_keys())

    def _house_view(self) -> dict[str, Any]:
        """What every screen sees, shared ones too: the latest show or song,
        this morning's dream of one (other dreams are on the sensor), and
        today's world visit (it names nobody)."""
        dream = self.state.dream if self.state else None
        if (
            dream
            and dream.get("day") == dt_util.now().date().isoformat()
            and dream.get("kind") in MEDIA_EVENTS
            and dream.get("title")
        ):
            seen = {"kind": dream["kind"], "title": dream["title"]}
        else:
            seen = None
        view: dict[str, Any] = {"media": self._house.get("media"), "dream": seen}
        # Always present (None on a day with no visit), so a card can tell a
        # no-visit day from an older server that sends none (v1's fallback).
        view["visit"] = self._visit_view()
        # Always present: how many known finds wait (0-3), never which; a card
        # picks basket_<n>.png from it (review V-B #12).
        view["basket"] = (
            len(model.basket_known(self.state, self.known_finds)) if self.state else 0
        )
        if self._powered_on:
            view["powered_on"] = {"at": self._powered_on}
        # What the house is now, for the device's ambience: whitelisted booleans
        # only (slice 3A). The transitions (recent) are never here: they expire
        # between pushes and would make a spurious house diff.
        if self._fx_mapped():
            view["device_fx"] = self.device_fx.view()
        # Always present (None: nobody's away), so a card can tell no visit from
        # an older server that sends none.
        view["sitter"] = self._sitter_view()
        return view

    def _sitter_view(self) -> dict[str, Any] | None:
        """The sitter's visit, for every card (shared screens too, owner D1):
        the real mood without the privacy mask, the away flag but not the away
        mood (plan sitter §5.3). No name, no `by`, no free text; the call's
        deadline stays hidden (it slides)."""
        state = self.state
        if state is None or not state.away:
            return None
        mood, flags, reason, key = model.real_mood(state, self._now(), self.settings)
        return {
            "mood": mood,
            "key": mood,
            "reason": reason,
            "reason_key": key,
            "flags": flags,
            "asleep": state.asleep,
            "lights_out": state.lights_out,
            "last": self._sitter_last,
        }

    def channel_snapshot(
        self, token: object, user: str, shared: bool, admin: bool = False
    ) -> dict[str, Any]:
        """Everything a watcher sees, at once (on subscribe, and after a reload).
        A shared screen gets no one's own view."""
        mine = None if shared else self._mine(user, admin)
        house = self._house_view()
        if shared:
            house = self._shared_house(house)
        self._sent[token] = (mine, house)
        moments = [] if shared else list(self._private.get(user, ()))
        if house["media"]:
            moments.append(house["media"])
        snapshot: dict[str, Any] = {
            "mine": mine,
            "house": house,
            "moments": moments,
            "now": dt_util.utcnow().isoformat(),
        }
        if self._fx_mapped():
            # Beside the house, built after _sent is stored and never diffed.
            snapshot["device_fx_recent"] = self.device_fx.recent(self._now())
        return snapshot

    def async_start_channel(self) -> None:
        """Push on every update, and send the watchers already open (a card
        open across a reload) a fresh snapshot."""
        self.config_entry.async_on_unload(self.async_add_listener(self._push_watchers))
        for token, (user, shared, send, admin) in list(self._watchers().items()):
            send(self.channel_snapshot(token, user, shared, admin))

    def _current(self) -> bool:
        """This is the pet's live coordinator (not one a reload replaced)."""
        return self.hass.data.get(DOMAIN, {}).get("pets", {}).get(self.pet_id) is self

    @callback
    def _push_watchers(self) -> None:
        """Each watcher gets what changed since its last send: its own view, the
        house's, or both."""
        if self.state is None or not self._current():
            return
        watchers = self._watchers()
        for token in [t for t in self._sent if t not in watchers]:
            del self._sent[token]
        house = self._house_view()
        for token, (user, shared, send, admin) in list(watchers.items()):
            if token not in self._sent:
                send(self.channel_snapshot(token, user, shared, admin))
                continue
            mine = None if shared else self._mine(user, admin)
            seen = self._shared_house(house) if shared else house
            sent_mine, sent_house = self._sent[token]
            changed: dict[str, Any] = {}
            if mine != sent_mine:
                changed["mine"] = mine
            if seen != sent_house:
                changed["house"] = seen
            if changed:
                self._sent[token] = (mine, seen)
                send(changed)
        # The device's transitions go last, after any house change they belong
        # to (the card must see the new ambience before the onset). One flush,
        # shared by both callers of _sense_home. A watcher whose snapshot just
        # went out sees the same id twice; the card keeps one.
        for entry in self.device_fx.take_fresh(self._now()):
            for _, _, send, _ in list(watchers.values()):
                send({"fx": entry})

    def _push_everywhere(self) -> None:
        """A person's own switch changed (one for every pet): every pet's
        channel tells them."""
        pets: dict[str, PetCoordinator] = self.hass.data[DOMAIN]["pets"]
        for pet in pets.values():
            pet._push_watchers()

    def _channel_only(self, event: model.Event) -> bool:
        """A bond moment (its person's), or a house moment that would say
        someone's home: never on the bus, the public list or debug."""
        kind = event["type"]
        return (
            kind in PERSONAL_EVENTS
            or kind in LIVE_EVENTS
            or (kind == "house_moment" and event.get("category") in CHANNEL_CATEGORIES)
        )

    def _hushed(self, event: model.Event) -> bool:
        """This moment carries house words, and house_words_private is on."""
        words = HOUSE_WORDS.get(event["type"], ())
        return any(event.get(k) for k in words) and self.house_words_private

    def _keep_moment(self, moment: dict[str, Any]) -> None:
        """Newest first, MOMENTS_KEPT at most. House moments can come often, so
        only the newest few stay: they never push a hatching out (review F17)."""
        self.moments.insert(0, moment)
        house = [i for i, m in enumerate(self.moments) if m["type"] == "house_moment"]
        for i in reversed(house[R.HOUSE_MOMENTS_KEPT :]):
            del self.moments[i]
        del self.moments[MOMENTS_KEPT:]

    def _to_channel(self, event: model.Event, at: str, hushed: bool = False) -> None:
        """A bond moment goes to its person's own channel (without who), and a
        titled media moment to every channel. A channel-only house moment, and
        house words kept off the sensor (hushed), are said live on every
        channel, shared screens too, and kept nowhere: a later watcher never
        gets them."""
        kind = event["type"]
        live = self._current()
        if kind == "house_moment" and (
            hushed or event.get("category") in CHANNEL_CATEGORIES
        ):
            keys = ("category", "reaction", "text")
            self._say_live({"type": "house_live"} | _pick(event, keys) | {"at": at})
            return
        if kind == "doorbell_live":
            self._say_live({"type": kind, "at": at})
            return
        if kind == "news" and hushed:
            keys = ("headline", "topic")
            self._say_live({"type": "news_live"} | _pick(event, keys) | {"at": at})
            return
        if kind in PERSONAL_EVENTS and (user := event.get("user")):
            moment = {k: v for k, v in event.items() if k != "user"} | {"at": at}
            private = self._private.setdefault(user, deque(maxlen=MOMENTS_KEPT))
            private.appendleft(moment)
            if live:
                for who, shared, send, _ in list(self._watchers().values()):
                    if who == user and not shared:
                        send({"moment": moment})
        elif kind in MEDIA_EVENTS and event.get("title"):
            moment = {k: event[k] for k in ("type", "title", "artist") if k in event}
            self._house["media"] = moment | {"at": at}
            if live:
                for _, _, send, _ in list(self._watchers().values()):
                    send({"moment": self._house["media"]})
                self._push_watchers()

    def _say_live(self, moment: dict[str, Any]) -> None:
        """Every watcher open now, once; nothing is kept."""
        if not self._current():
            return
        for _, _, send, _ in list(self._watchers().values()):
            send({"moment": moment})

    def _state_dict(self) -> dict[str, Any]:
        assert self.state is not None
        return self.state.to_dict()

    def _save(self) -> None:
        assert self.state is not None
        self._saver.save()

    def _publish(self) -> None:
        assert self.state is not None
        self.async_set_updated_data(self.state)

    async def async_action(self, action: str, context: Context | None) -> str:
        """Apply a care action from a button."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        by = await self._who(context)
        person = await self._person(context)
        result, events = model.apply_action(
            self.state, action, now, self.rng, by, self.settings
        )
        if result == model.OK:
            events += self._bond(person, "care")
        self._actor = person
        try:
            self._fire(events)
        finally:
            self._actor = None
        self._save()
        self._publish()
        return result

    async def async_forget_games(self, user: str) -> None:
        """Forget my data: this person's parked dig goes, and a dig in progress
        no longer names them (it's the household's now). So does their dream
        pick, waiting for tonight, and their name on this morning's dream (the
        story stays, "your idea" does not; memory plan M0-d). Written at once,
        as the people store is."""
        assert self.state is not None
        dropped = self.state.parked.pop(user, None) is not None
        game = self.state.game
        if game is not None and game.player == user:
            game.player = None
            dropped = True
        picks = [p for p in self.state.dream_picks if p["user"] != user]
        if len(picks) != len(self.state.dream_picks):
            self.state.dream_picks = picks
            dropped = True
        if (self.state.dream or {}).get("user") == user:
            del self.state.dream["user"]
            dropped = True
        if dropped:
            await self.store.async_save(self.state.to_dict())

    async def async_end_game(
        self, kind: str, context: Context | None = None, shared: bool = False
    ) -> dict[str, Any]:
        """A person ends the game in progress. Harmless with none. It isn't a
        drop: nothing is counted and the kind isn't marked, so the next game
        is simply new, except a Berry dig that has shown something: that one
        is parked for the person ending it (the household with no person),
        and their next dig carries on from it."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        # A shared screen's dig is the household's (PARK_HOUSEHOLD).
        person = None if shared else await self._person(context)
        how = model.end_game(self.state, kind, now, person)
        self._dropped_games.discard(kind)
        if how:
            self._save()
            self._publish()
        return {"result": model.OK, "ended": how is not None, "parked": how == "parked"}

    async def async_play_game(
        self,
        guess: str | None,
        context: Context | None,
        kind: str = "left_right",
        shared: bool = False,
    ) -> dict[str, Any]:
        """One round of a game, or with no guess, the start of one."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        by = await self._who(context)
        person = await self._person(context)
        dropped = kind in self._dropped_games
        self._dropped_games.discard(kind)
        # Whose dig it is: a shared screen's is the household's. The bond,
        # best and record still go to the person who finishes it.
        player = None if shared else person
        if guess is None:
            info, events = model.start_game(
                self.state, kind, now, self.rng, by, player=player
            )
        else:
            info, events = model.play_game(
                self.state, guess, now, self.rng, by, kind=kind, player=player
            )
            if dropped and info["result"] == model.OK and info["round"] == 1:
                # The game the guess was for was dropped (idle, asleep): this
                # one is new, so the card adopts it instead of blaming a player.
                info["restarted"] = True
        for event in list(events):
            if (
                event["type"] == "game_finished"
                and person is not None
                and not event.get("dropped")
            ):
                events += self._bond(person, "game", event["game"])
                events += model.favourite_game(
                    self.state, person, event["game"], self._today(now)[0]
                )
                events += model.game_record(
                    self.state, person, event["game"], event["wins"]
                )
        self._actor = person
        try:
            self._fire(events)
        finally:
            self._actor = None
        self._save()
        self._publish()
        return info

    async def async_hop_board(self) -> dict[str, Any]:
        """Today's Hop board for this pet, or why there is none. No care log
        (so not start_game), no event and no person (the board is the pet's,
        the same on every screen). It writes only the day's pin: on the day's
        first ask `hop_day` becomes today's with the stage now, which fixes
        the board for the day (plan §8); saved and published then, never
        otherwise. A refusal writes nothing."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        refusal = model._refuse_play(self.state)
        if refusal is not None:
            return {"result": refusal}
        if model.pin_hop_day(self.state, self._today(now)[0]):
            self._save()  # a delayed write: a restart must keep the pin
            self._publish()
        pinned = dict(self.state.hop_day)
        # The stored day: today, or a day ahead after a clock set back.
        day = pinned["day"]
        specials, w, h = hop.params_for(pinned["stage"], day)
        board = await self.async_hop_day_board(
            day, hop.family_of(self.state.species), specials, w, h
        )
        paid = self.state.hop_day  # read again: a settle may have paid meanwhile
        same = paid.get("day") == day
        return {
            "result": model.OK,
            "day": day,
            **board.to_dict(),
            "twist": hop.twist_of(board),  # copy and the bench only; no rule reads it
            "done": same and paid["done"],
            "tidy": same and paid["tidy"],
        }

    async def async_hop_settle(
        self,
        board_id: str,
        moves: str,
        context: Context | None,
        shared: bool = False,
    ) -> dict[str, Any]:
        """A Hop board the card played to the nest: replay its move list on
        the board `hop_day` pins and pay (plan §6-§7). The card's claim is
        never trusted, only the replay. Never pins or rolls `hop_day`: an
        empty or past one is `board_changed`, with nothing built or written
        (Decided 18). Everything that awaits comes first; then one block
        with no await re-checks with a fresh now and pays, so two screens
        settling at once pay once.

        `shared` is accepted as play_game's is: the day and its pay are the
        pet's (the household's) either way, and the bond goes to the person
        who settled. Nothing of Hop is kept per person."""
        state = self.state
        assert state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(state)
        if refusal is not None:
            return {"result": refusal}
        pinned = dict(state.hop_day)
        if not pinned or self._today(now)[0] > pinned["day"]:
            return {"result": "board_changed"}
        by = await self._who(context)
        person = await self._person(context)
        day, stage = pinned["day"], pinned["stage"]
        specials, w, h = hop.params_for(stage, day)
        board = await self.async_hop_day_board(
            day, hop.family_of(state.species), specials, w, h
        )
        if board.id != board_id:
            return {"result": "board_changed"}
        replay = hop.replay(board, moves)
        if replay["too_long"]:
            return {"result": "too_long"}
        if not replay["legal"]:
            return {"result": "illegal", "bad_index": replay["bad_index"]}
        if not replay["won"]:
            return {"result": "not_won"}
        # No await from here: what the awaits could have changed is checked
        # again (the build can take most of a second: the pet may have
        # fallen asleep, or the day turned and a `board` rolled it).
        state = self.state
        assert state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(state)
        if refusal is not None:
            return {"result": refusal}
        current = state.hop_day
        if (
            current.get("day") != day
            or current.get("stage") != stage
            or self._today(now)[0] > day
        ):
            return {"result": "board_changed"}
        info, events = model.settle_hop(
            state,
            now,
            replay["tidy"],
            by,
            self.world,
            self.finds,
            self._find_flags,
            self.known_finds,
            self.rng,
        )
        if info["paid"]:
            # Not game_record (no "beat your best" for a daily board) and not
            # favourite_game (Hop is not in GAMES): the bond only.
            events += self._bond(person, "game", "hop")
        self._actor = person
        try:
            self._fire(events)
        finally:
            self._actor = None
        self._save()
        self._publish()
        return info

    async def async_crate_push_board(
        self, level: str, rnd: int | None = None
    ) -> dict[str, Any]:
        """A crate-push round's board for this pet: a pure function of (pet,
        day, world, level, round), the same on every screen, with no pin, no
        write, no person and no care log. With no round asked for, the next
        one to pay today (the rounds paid so far, plus one). Built off the
        loop (hard can take most of a second). Refused as a game is when the
        pet could not play now; "enough" once the day's rounds are all paid."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        refusal = model._refuse_play(self.state)
        if refusal is not None:
            return {"result": refusal}
        day = self._today(now)[0]
        paid = model.crate_rounds(self.state, day)
        if rnd is None:
            rnd = paid[level] + 1
        if rnd > model.CRATE_MAX_ROUND:
            return {"result": "enough"}
        board = await self._crate_round_board(day, level, rnd)
        return {
            "result": model.OK,
            "game": "crate-push",
            "day": day,
            "level": level,
            "round": rnd,
            "rounds": paid,
            "hinted": (day, self.world, level, rnd) in self._crate_hinted,
            "neat_open": level != "easy"
            and not (
                self.state.crate_day.get("day") == day
                and self.state.crate_day.get("neat")
            ),
            **board.to_dict(),
        }

    async def async_crate_practice_board(self, rnd: int) -> dict[str, Any]:
        """A practice board (plan 6b): tiny, one crate, unpaid, no cost, no
        count, nothing kept. Refused as a settle is (egg, asleep), never
        too_tired. The card's own counter is the round."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(self.state)
        if refusal is not None:
            return {"result": refusal}
        day = self._today(now)[0]
        board = await self.hass.async_add_executor_job(
            crate_push.practice_board, self.pet_id, day, self.world, rnd
        )
        return {
            "result": model.OK,
            "game": "crate-push",
            "practice": True,
            "day": day,
            "level": crate_push.PRACTICE,
            "round": rnd,
            "hinted": False,
            "neat_open": False,
            **board.to_dict(),
        }

    async def async_crate_practice_hint(
        self, rnd: int, board_id: str, moves: str
    ) -> dict[str, Any]:
        """A hint on a practice board: the same answer, recorded nowhere."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(self.state)
        if refusal is not None:
            return {"result": refusal}
        day = self._today(now)[0]
        board = await self.hass.async_add_executor_job(
            crate_push.practice_board, self.pet_id, day, self.world, rnd
        )
        if board.id != board_id:
            return {"result": "board_changed"}
        async with self._crate_hint_lock:
            return await self.hass.async_add_executor_job(crate_push.hint, board, moves)

    async def _crate_round_board(
        self, day: str, level: str, rnd: int
    ) -> crate_push.Board:
        """A round's board, built once off the loop and kept for the day."""
        key = (day, self.world, level, rnd)
        for old in [k for k in self._crate_boards if k[0] != day]:
            del self._crate_boards[old]
        self._crate_hinted = {k for k in self._crate_hinted if k[0] == day}
        future = self._crate_boards.get(key)
        if future is None:
            future = self.hass.async_add_executor_job(
                crate_push.crate_push_board, self.pet_id, day, self.world, level, rnd
            )
            self._crate_boards[key] = future

            def failed(done: asyncio.Future[crate_push.Board]) -> None:
                if done.cancelled() or done.exception() is not None:
                    if self._crate_boards.get(key) is done:
                        del self._crate_boards[key]

            future.add_done_callback(failed)
        try:
            return await asyncio.shield(future)
        except Exception:
            if self._crate_boards.get(key) is future:
                del self._crate_boards[key]
            raise

    async def async_crate_push_settle(
        self,
        level: str,
        rnd: int | None,
        board_id: str,
        moves: str,
        context: Context | None,
    ) -> dict[str, Any]:
        """A crate-push round the card played to the end: replay its letters
        on the round's board and pay (plan 2026-11-08-crate-push §5). The
        card's claim is never trusted, only the replay. Only the next round
        of a level can be settled (the rounds paid so far, plus one), so a
        round pays once and a stale screen is `board_changed`. Everything that
        awaits comes first; then one block with no await re-checks and pays,
        so two screens settling at once pay once."""
        state = self.state
        assert state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(state)  # a game's, never too_tired
        if refusal is not None:
            return {"result": refusal}
        day = self._today(now)[0]
        if rnd is None or rnd != model.crate_rounds(state, day)[level] + 1:
            return {"result": "board_changed"}
        if rnd > model.CRATE_MAX_ROUND:
            return {"result": "enough"}
        by = await self._who(context)
        person = await self._person(context)
        board = await self._crate_round_board(day, level, rnd)
        if board.id != board_id:
            return {"result": "board_changed"}
        replay = crate_push.replay(board, moves)
        if replay["too_long"]:
            return {"result": "too_long"}
        if not replay["legal"]:
            return {"result": "illegal", "bad_index": replay["bad_index"]}
        if not replay["solved"]:
            return {"result": "not_won"}
        # No await from here: what the awaits could have changed is checked
        # again (the build can take most of a second).
        state = self.state
        assert state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(state)
        if refusal is not None:
            return {"result": refusal}
        today = self._today(now)[0]
        if today != day or model.crate_rounds(state, today)[level] + 1 != rnd:
            return {"result": "board_changed"}
        info, events = model.settle_crate_push(
            state,
            now,
            day,
            level,
            replay["neat"],
            by,
            self.world,
            self.finds,
            self._find_flags,
            self.known_finds,
            self.rng,
            (day, self.world, level, rnd) in self._crate_hinted,
        )
        events += self._bond(person, "game", "crate-push")
        self._actor = person
        try:
            self._fire(events)
        finally:
            self._actor = None
        self._save()
        self._publish()
        return info

    async def async_crate_push_hint(
        self, level: str, rnd: int | None, board_id: str, moves: str
    ) -> dict[str, Any]:
        """A hint for the round in play: checked as the settle is (the round
        is the next to pay, the id matches), solved off the loop from where the
        moves stand, one at a time. Answers the next step only, never the
        solution. Refusals are the settle's, so a tiring pet keeps its hints.
        An `ok` answer marks the round hinted (this round's neat find is
        given up; pay is unchanged)."""
        state = self.state
        assert state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(state)
        if refusal is not None:
            return {"result": refusal}
        day = self._today(now)[0]
        if rnd is None or rnd != model.crate_rounds(state, day)[level] + 1:
            return {"result": "board_changed"}
        if rnd > model.CRATE_MAX_ROUND:
            return {"result": "enough"}
        board = await self._crate_round_board(day, level, rnd)
        if board.id != board_id:
            return {"result": "board_changed"}
        async with self._crate_hint_lock:
            answer = await self.hass.async_add_executor_job(
                crate_push.hint, board, moves
            )
        if answer["result"] != model.OK:
            return answer
        # What the awaits could have changed is checked again.
        state = self.state
        assert state is not None
        now = self._now()
        self._advance(now)
        refusal = model.refuse_hop_settle(state)
        if refusal is not None:
            return {"result": refusal}
        today = self._today(now)[0]
        if today != day or model.crate_rounds(state, today)[level] + 1 != rnd:
            return {"result": "board_changed"}
        if answer["kind"] != "solved":
            self._crate_hinted.add((day, self.world, level, rnd))
        return answer

    async def async_hop_day_board(
        self, day: str, family: str, specials: int, w: int, h: int
    ) -> hop.Board:
        """The day's board, built once off the loop and kept for the day. Calls
        with the same arguments at once share one build. The settle calls
        this too, so it replays the board the screen was shown."""
        key = (day, self.world, family, specials, w, h)
        for old in [k for k in self._hop_boards if k[0] != day]:
            del self._hop_boards[old]
        future = self._hop_boards.get(key)
        if future is None:
            future = self.hass.async_add_executor_job(
                hop.hop_board, self.pet_id, day, self.world, family, specials, w, h
            )
            self._hop_boards[key] = future

            def failed(done: asyncio.Future[hop.Board]) -> None:
                # A build that died is not kept: the next call tries again.
                if done.cancelled() or done.exception() is not None:
                    if self._hop_boards.get(key) is done:
                        del self._hop_boards[key]

            future.add_done_callback(failed)
        try:
            # Shielded: one caller giving up must not cancel the build the
            # others wait on.
            return await asyncio.shield(future)
        except Exception:
            # Dropped here as well as in the callback, which may run after
            # this caller has already raised.
            if self._hop_boards.get(key) is future:
                del self._hop_boards[key]
            raise

    def share_news(self, headline: str, topic: str | None = None) -> str:
        """An automation brings news: the pet says it in its bubble, a passing
        moment like a TV title. Cosmetic only: no stat changes, nothing saved.

        Like the house moments it's dropped, not queued, while the pet is
        asleep, away or still an egg, and at most one bit of news shows every
        NEWS_COOLDOWN_MINUTES. Returns "shared", "asleep", "away", "egg" or
        "too_soon"."""
        assert self.state is not None
        now = self._now()
        self._advance(now)  # bedtime or hatching may have come since the last tick
        if model.life_stage(self.state) == "egg":
            result = "egg"
        elif self.state.away:
            result = "asleep" if self.privacy else "away"
        elif self.state.asleep:
            result = "asleep"
        elif now < self.next_news:
            result = "too_soon"
        else:
            result = "shared"
        if result != "shared":
            self._publish()
            return result
        self.next_news = now + R.NEWS_COOLDOWN_MINUTES * 60
        event: model.Event = {"type": "news", "headline": headline}
        if topic:
            event["topic"] = topic
        self._fire([event])
        self._publish()
        return result

    def react(
        self,
        category: str,
        *,
        source: str | None = None,
        from_state: str | None = None,
        to_state: str | None = None,
        held: float | None = None,
        match: str | None = None,
        reaction: str | None = None,
        text: str | None = None,
    ) -> str:
        """Something in the house happened (virtual_pet.react, the house moment
        blueprint): the pet says a line and reacts. Cosmetic only, like
        share_news: no stat changes, nothing saved, no notification.

        Returns "ignored" (the change isn't the category's moment), "native" (H3
        or H6 watches this entity already and says it), "egg", "away" (privacy
        off), "asleep", "too_soon" (the category's own wait, or a short gap
        after any house moment) or "shared". Only a shared one starts a wait.
        The source entity is read here and kept nowhere."""
        assert self.state is not None
        domain = source.partition(".")[0] if source else None
        if not react_counts(category, domain, from_state, to_state, held, match):
            # The blueprint calls on every change (a washer's power sensor moves
            # each second): an ignored one costs no advance, save or publish.
            return "ignored"
        now = self._now()
        self._advance(now)
        if react_native(
            category,
            source,
            dict(self.config_entry.options),
            list(self._bells),
        ):
            result = "native"
        elif model.life_stage(self.state) == "egg":
            result = "egg"
        elif self.state.away:
            result = "asleep" if self.privacy else "away"
        elif self.state.asleep:
            result = "asleep"
        elif now < self.next_react_any or now < self.next_react.get(category, 0):
            result = "too_soon"
        else:
            result = "shared"
        if result != "shared":
            self._publish()
            return result
        self.next_react[category] = now + R.REACT_COOLDOWN_MINUTES * 60
        self.next_react_any = now + R.REACT_GAP_SECONDS
        event: model.Event = {"type": "house_moment", "category": category}
        if category == "custom":
            event["reaction"] = reaction or "hop"
            if text:
                event["text"] = text
        self._fire([event])
        self._publish()
        return result

    async def async_lay_egg(self) -> None:
        """Start the next generation: the adult retires, an egg takes its place."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        self.state, events = model.lay_egg(self.state, now, self.rng)
        self._fire(events)
        self._save()
        self._publish()
        if events and (next_world := self.config_entry.data.get(CONF_NEXT_WORLD)):
            # The owner chose a new world for the next egg: this is that egg.
            data = dict(self.config_entry.data)
            data[CONF_WORLD] = data.pop(CONF_NEXT_WORLD)
            LOGGER.debug(
                "%s's new egg moves to %s", self.config_entry.title, next_world
            )
            self.hass.config_entries.async_update_entry(self.config_entry, data=data)
            self.hass.config_entries.async_schedule_reload(self.config_entry.entry_id)

    async def async_rename(self, name: str) -> None:
        """Name the new generation (the card's rename, only the first day: egg and
        baby). `name` is already clean (clean_name) and free (name_taken). Writes the
        entry's title, the device's name (clearing an admin's own, so this one shows)
        and the state's name, with no reload. Entity IDs, and the journal's record of
        the old generation, keep what they had."""
        assert self.state is not None
        self._advance(self._now())  # the age is the minute's, not the last tick's
        if model.life_stage(self.state) not in ("egg", "baby"):
            raise RenameError("not_now")
        if name == self.config_entry.title and name == self.state.name:
            return
        data = {**self.config_entry.data, CONF_NAME: name}
        self.hass.config_entries.async_update_entry(
            self.config_entry, title=name, data=data
        )
        registry = dr.async_get(self.hass)
        if device := registry.async_get_device_by_identifier(
            (DOMAIN, self.pet_id), self.pet_id
        ):
            registry.async_update_device(device.id, name=name, name_by_user=None)
        self._sync_name()
        self._save()
        self._publish()

    async def async_set_egg_choice(self, species: str | None) -> None:
        """Pick the species the next egg hatches into; None leaves it a surprise."""
        assert self.state is not None
        if species is not None and species not in self.egg_roster:
            raise ValueError(f"{species} can't hatch from this device's next egg")
        self.state.egg_choice = species
        self._save()
        self._publish()

    async def async_set_resting(self, on: bool) -> str:
        """Flip the resting switch (plan favourite-resting §4.1). Returns the
        model's result: "ok", or "egg" when an egg was asked to rest."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        result, events = model.set_resting(self.state, on, now)
        self._fire(events)
        self._save()
        self._publish()
        return result

    async def async_set_lights_out(
        self, on: bool, context: Context | None = None
    ) -> str:
        """Flip the lights-out switch. Someone putting it to bed in the evening
        tucked it in: it says goodnight to them, and thanks them in the morning."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        events = model.set_lights_out(self.state, on, now, self.settings)
        hour = self._today(now)[1]
        evening = hour >= R.TUCK_IN_EVENING_HOUR or hour < 3
        person = await self._person(context) if on and evening else None
        if person and any(
            e["type"] == "fell_asleep" and e.get("how") == "lights" for e in events
        ):
            model.bond_of(self.state, person)["tucked_at"] = now
            events.append({"type": "tucked_in", "user": person})
        self._actor = person or await self._person(context)
        try:
            self._fire(events)  # may grant the "tuck me in" wish: theirs
        finally:
            self._actor = None
        self._save()
        self._publish()
        return next(
            (
                e["result"]
                for e in events
                if e["type"] == "care" and e["action"] == model.LIGHTS_OUT
            ),
            model.OK,
        )

    async def async_fast_forward(self, hours: float) -> dict[str, Any]:
        """Debug: live through N hours right now, at normal rates."""
        assert self.state is not None
        if not math.isfinite(hours) or hours <= 0:
            return {"hours": hours, "events": []}
        now = self._now()
        self._advance(now)
        events = model.fast_forward(self.state, now, hours, self.settings, self.rng)
        self._fire(events, simulated=True)
        self._pick_favourite()
        self._save()
        self._publish()
        return {
            "hours": hours,
            "events": [e["type"] for e in events],
        }

    async def _who(self, context: Context | None) -> str | None:
        """Name of the HA user behind an action, for the who-fed log."""
        if context is None or context.user_id is None:
            return None
        user = await self.hass.auth.async_get_user(context.user_id)
        return user.name if user else None

    async def _who_id(self, user_id: str) -> str | None:
        user = await self.hass.auth.async_get_user(user_id)
        return user.name if user else None

    async def _person(self, context: Context | None) -> str | None:
        """The HA user behind an action, for their bond: a person, not a
        system user (an automation or the app's own calls)."""
        if context is None or context.user_id is None:
            return None
        user = await self.hass.auth.async_get_user(context.user_id)
        return user.id if user and not user.system_generated else None

    async def async_shutdown(self) -> None:
        """Write the pet to disk now."""
        await super().async_shutdown()
        if self.state is not None:
            await self.store.async_save(self.state.to_dict())
        await self.people.async_save_now()


class RenameError(Exception):
    """Why a rename was refused; `code` is the websocket error key."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


NAME_MAX = 20  # characters; the card's field and Reconfigure's old habit
# Letters and symbols that draw nothing (Hangul fillers, the blank braille cell).
_NAME_FILLERS = frozenset("\u3164\u115f\u1160\u2800")


def clean_name(raw: object) -> str:
    """A pet's name as typed, made tidy: NFC, edges stripped, inner spaces
    collapsed, 1-NAME_MAX characters, no control characters. Else bad_name."""
    if not isinstance(raw, str) or len(raw) > 10 * NAME_MAX:
        raise RenameError("bad_name")
    if any(unicodedata.category(c) in ("Cc", "Zl", "Zp") for c in raw):
        raise RenameError("bad_name")
    name = " ".join(unicodedata.normalize("NFC", raw).split())
    if not 1 <= len(name) <= NAME_MAX:
        raise RenameError("bad_name")
    # At least one character you can see: not only zero-width, format or filler characters.
    if not any(
        unicodedata.category(c)[0] in "LNPS" and c not in _NAME_FILLERS for c in name
    ):
        raise RenameError("bad_name")
    return name


async def async_rename(hass: HomeAssistant, entry_id: str, raw_name: object) -> str:
    """The card's rename (virtual_pet/rename) for the pet of this entry; returns
    the name kept. Raises RenameError: bad_name, no_pet, not_ready (the entry is
    reloading: retry), not_now (past the first day) or taken."""
    name = clean_name(raw_name)
    # Taken from the pets at call time: an entry that is reloading has none, and
    # writing to a coordinator being torn down would be lost.
    pet: PetCoordinator | None = hass.data.get(DOMAIN, {}).get("pets", {}).get(entry_id)
    if pet is None or pet.state is None:
        entry = hass.config_entries.async_get_entry(entry_id)
        if entry is not None and entry.domain == DOMAIN and not entry.disabled_by:
            raise RenameError("not_ready")
        raise RenameError("no_pet")
    if name_taken(hass, name, entry_id):
        raise RenameError("taken")
    await pet.async_rename(name)
    return name


def _pick(event: model.Event, keys: tuple[str, ...]) -> dict[str, Any]:
    return {k: event[k] for k in keys if event.get(k)}
