"""The coordinator: the single owner of the pet's state."""

from __future__ import annotations

import asyncio
import copy
from datetime import datetime, timedelta
import random
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    EVENT_HOMEASSISTANT_STARTED,
    STATE_HOME,
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
    UnitOfTemperature,
)
from homeassistant.core import (
    Context,
    CoreState,
    Event,
    EventStateChangedData,
    HomeAssistant,
    State,
    callback,
)
from homeassistant.helpers import (
    device_registry as dr,
    entity_registry as er,
    issue_registry as ir,
)
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_conversion import TemperatureConverter

from . import model, notify, people as P, rates as R, wellbeing
from .backup import (
    NOTHING,
    async_backup,
    async_clear_if_restored,
    async_kept_backup,
)
from .const import (
    CONF_AWAY_AFTER,
    CONF_BEDTIME,
    CONF_CHORES,
    CONF_COMFORT_HIGH,
    CONF_COMFORT_LOW,
    CONF_DASHBOARD,
    CONF_MUSIC,
    CONF_NEW_PET,
    CONF_NEXT_WORLD,
    CONF_PRIVACY,
    CONF_SITTER_SETTLES,
    CONF_SPECIES,
    CONF_TV,
    CONF_WAKE_TIME,
    CONF_WEATHER,
    CONF_WORLD,
    DEFAULT_WORLD,
    DEFAULT_ZONE,
    DOMAIN,
    LOGGER,
    STORE_MINOR_VERSION,
    STORE_VERSION,
)
from .home import (
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
    forecast_moment,
    is_raining,
)
from .species import load_catalog
from .watcher import Watcher, daily_forecast

type PetConfigEntry = ConfigEntry[PetCoordinator]

# Seconds; the Store also writes once more on shutdown, so only a crash loses
# up to this much. Every tick and house change saves, so this also caps writes.
SAVE_DELAY = 60

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
    "watching",
    "listening",
    "tv_off_late",
    "first_snow",
    "first_frost",
    "news",
    "weather",
    "forecast",
    "wish_granted",
    "bond_up",
    "bond_favourite",
    "friend_home",
    "bond_record",
    "tucked_in",
    "favourite_snack",
}
MOMENTS_KEPT = 10
# The visit's celebration lines (one a look, and always a place for it).
CELEBRATIONS = {"your_birthday", "pet_birthday", "birthday_friends", "friends_for"}
# Moments a dream can be about, by the dream's kind. (Not news: it stays
# cosmetic, and changes nothing that's saved.)
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
        # Filled in by async_load from the files in frontend/.
        self.world: str = entry.data.get(CONF_WORLD, DEFAULT_WORLD)
        self.world_name = self.world
        self.roster: tuple[str, ...] = ()
        self.species_names: dict[str, str] = {}
        # What the next egg can hatch into: the next world's roster while a
        # world change waits for the egg, otherwise this world's.
        self.egg_roster: tuple[str, ...] = ()
        self.egg_species_names: dict[str, str] = {}
        self.rng = random.Random()
        # Each ready creature's favourite-snack choices, and the stages with
        # food words of their own (a moth: no snacks there).
        self.likes: dict[str, list[str]] = {}
        self.own_food_stages: dict[str, set[str]] = {}
        self.catchphrases: dict[str, str] = {}  # each creature's own
        self.state: model.PetState | None = None
        self._ticked = False  # the first tick after a load can't fail setup
        self._damage_backup: str | None = None  # a damaged save's copy, once
        # Last calculation, for the diagnostic sensor.
        self.debug: dict[str, Any] = {}
        # Recent events for the card to react to, newest first (not saved).
        self.moments: list[dict[str, Any]] = []
        # A call notification is on the phones (cleared when the call is over).
        self._call_notified = False
        # The house: nothing is read until HA has fully started.
        self.home = HomeEffect()
        self.house_moments = HouseMoments()
        # virtual_pet.share_news: no news before this time (in memory only).
        self.next_news = 0.0
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
        self._visits: dict[str, float] = {}
        # People (HA user IDs) whose person entity just came home, and when the
        # pet last cheered for each (in memory).
        self._arrivals: list[str] = []
        self._cheered: dict[str, float] = {}
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
        self._chores_locks: dict[str, asyncio.Lock] = {}
        self._home_debouncer = Debouncer(
            hass,
            LOGGER,
            cooldown=R.HOME_DEBOUNCE_SECONDS,
            immediate=False,
            function=self._async_home_changed,
        )

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
    def privacy(self) -> bool:
        """Keep presence out of what the pet shows (default on)."""
        return self.config_entry.options.get(CONF_PRIVACY, True)

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
            # Privacy: an empty house looks like a nap on any dashboard.
            return "asleep", ["asleep"], "zzz", "asleep"
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
                self.config_entry.title,
            )
        self._issue(
            "world_not_ready",
            not self.roster,
            {"pet": self.config_entry.title, "world": self.world_name},
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
        placeholders = {"pet": self.config_entry.title, "entry_id": self.pet_id}
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
        self._fire(self._daily_wish(now))
        return self.state

    # --- The house ----------------------------------------------------------

    def async_start_home(self) -> None:
        """Start listening to the house once HA is fully up."""
        if self.hass.state is CoreState.running:
            self._listen()
            return

        async def started(_: Event) -> None:
            self._listen()

        self.config_entry.async_on_unload(
            self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, started)
        )

    def _issue(
        self,
        key: str,
        active: bool,
        placeholders: dict[str, str],
        translation_key: str | None = None,
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
            is_fixable=False,
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
        registry = er.async_get(self.hass)
        # sun.sun and the default zone are always watched, not picked by the owner.
        mapped = [
            e for e in self.watcher.entity_ids() if e not in ("sun.sun", DEFAULT_ZONE)
        ]
        mapped += self.config_entry.options.get(CONF_CHORES) or []
        missing = sorted(
            e
            for e in set(mapped)
            if self.hass.states.get(e) is None and registry.async_get(e) is None
        )
        self._issue(
            "missing_entities",
            bool(missing),
            {"pet": self.config_entry.title, "entities": ", ".join(missing)},
        )

    def _listen(self) -> None:
        self._home_started = True
        self._check_mapped_entities()
        ids = self.watcher.entity_ids()

        @callback
        def changed(_: Event[EventStateChangedData]) -> None:
            self._home_debouncer.async_schedule_call()

        self.config_entry.async_on_unload(
            async_track_state_change_event(self.hass, ids, changed)
        )
        self.config_entry.async_on_unload(self._home_debouncer.async_shutdown)

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
                # A zone they made (work, the gym): remembered, privately.
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
        if known is None or not (new := len(done - known)):
            return
        now = self._now()
        self._advance(now)
        if model.chores_done(self.state, new, now):
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
        effect = evaluate(
            readings,
            options.get(CONF_COMFORT_LOW, R.HOME_COMFORT_LOW_C),
            options.get(CONF_COMFORT_HIGH, R.HOME_COMFORT_HIGH_C),
        )
        self.home = effect

        away = self.presence.update(self.watcher.people_home(now), now, self.state.away)
        if away != self.state.away:
            self.state.away = away
            if (
                away
                and self.config_entry.options.get(CONF_SITTER_SETTLES, True)
                and model.sitter_settles(self.state)
            ):
                self._fire([{"type": "call_settled"}])
            self._fire([{"type": "went_away" if away else "came_home"}])
            if not away:
                self._fire(model.come_home(self.state, now, settings))
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
        arrivals, self._arrivals = self._arrivals, []
        if self._awake():
            self._fire(self._friends_home(arrivals, now))
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
        season's first snow or frost."""
        assert self.state is not None
        state = self.state
        settings = self.settings
        awake = not state.away and not state.asleep and model.life_stage(state) != "egg"
        local = dt_util.as_local(dt_util.utc_from_timestamp(now))
        minute = local.hour * 60 + local.minute
        wake = settings.wake_time.hour * 60 + settings.wake_time.minute
        events = self.house_moments.update(
            readings,
            now,
            awake,
            morning=wake <= minute < 12 * 60,
            today=local.date().isoformat(),
        )
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
        if not self._home_started or not self.config_entry.options.get(CONF_WEATHER):
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
        device = dr.async_get(self.hass).async_get_device_by_identifier(
            (DOMAIN, self.pet_id), self.pet_id
        )
        name = (device and device.name_by_user) or self.config_entry.title
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
        self._save()

    def _pick_favourite(self) -> None:
        """A hatched pet without a favourite snack picks one (at hatching, or
        at load for a pet from before favourites)."""
        state = self.state
        if state is not None and state.species:
            model.pick_favourite(state, self.likes.get(state.species, []), self.rng)

    def _fire(self, events: list[model.Event], simulated: bool = False) -> None:
        for event in events:
            data = {k: v for k, v in event.items() if k != "type"}
            data["pet_id"] = self.pet_id
            if simulated:
                data["simulated"] = True
            self.hass.bus.async_fire(f"{DOMAIN}_{event['type']}", data)
            self._notify(event, simulated)
            if not simulated and event["type"] in MOMENTS:
                self.moments.insert(0, {**event, "at": dt_util.utcnow().isoformat()})
                del self.moments[MOMENTS_KEPT:]
        if events:
            self.debug["last_events"] = [e["type"] for e in events][-10:]
        if simulated or self.state is None:
            return
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
            and not state.away
            and not state.asleep
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
        if model.dream_on_waking(self.state, now, self._today(now)[0], self.rng):
            self._save()

    def _check_ins(self, events: list[model.Event]) -> None:
        """Care, games and moments: they may grant the wish, and are things to
        dream about."""
        state = self.state
        assert state is not None
        now = self._now()
        granted: list[model.Event] = []
        by = state.care_log[0].get("by") if state.care_log else None
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
            elif kind == "game_finished":
                granted += self._grant("play", by, now)
                if e.get("won"):
                    model.dream_seed(state, {"kind": "game"}, now)
            elif kind == "chore_treat":
                granted += self._grant("chore", None, now)
                model.dream_seed(state, {"kind": "chore"}, now)
            elif kind == "fell_asleep" and e.get("how") == "lights":
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

    def friends(self) -> dict[str, str]:
        """Its close friends who have a person entity: {user ID: first name}."""
        return {
            user: name
            for user, name in self._person_names().items()
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

    def _closest_pet(self, user: str) -> PetCoordinator:
        """Of the loaded pets that notify this person, the one they're closest
        to (it speaks for all of them on their phone)."""
        pets: dict[str, PetCoordinator] = self.hass.data[DOMAIN]["pets"]
        return max(
            (
                p
                for p in pets.values()
                if p.state is not None and user in p.state.notify_users
            ),
            key=lambda p: (p.bond_for(user)[0], p.pet_id),
            default=self,
        )

    def _send_off(self, user: str, now: float) -> None:
        """Someone with "my day" on heads out on a notable morning: one line on
        their phone ("rain later today, take an umbrella ☂"), a few times a week
        at most, from the pet they're closest to."""
        if self._closest_pet(user) is not self or self.state is None:
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
        person = self.people.person(user)
        last = self._visits.get(user, -1e12)
        just_home = person.get("arrived", 0) > last
        if now - last < R.BOND_VISIT_EVERY_MINUTES * 60 and not just_home:
            return {
                "notes": [],
                "ask": None,
                "counted": False,
                "baby_talk": self.people.baby_talk(user),
            }
        self._advance(now)
        if not self._awake():
            # Asleep (or away): only the sleepy hello. The visit isn't counted,
            # so the lines it has wait for the next look once it's up.
            notes = self._up_early(user, now)
            self._publish()
            return {
                "notes": notes,
                "ask": None,
                "counted": False,
                "baby_talk": self.people.baby_talk(user),
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
                else:
                    self.people.mark(user, kind, key)
                if kind == "guess":
                    person.pop("guess", None)  # said: used up
                notes.append(note)
        # A question only when the look has room for one more line.
        fits = queued + len(notes) < R.LOOK_LINES
        ask = self._question(user, now, came_home, notes) if fits else None
        self._save()
        self._publish()
        # "my day" goes to this person only (a state attribute is everyone's).
        return {
            "notes": notes,
            "ask": ask,
            "counted": True,
            "my_day": self.people.my_day(user),
            "birthday_kept": bool(person.get("birthday")),
            "birthday_phone": bool(person.get("birthday_phone")),
            "made_room": made_room,
            "baby_talk": self.people.baby_talk(user),
        }

    def _up_early(self, user: str, now: float) -> list[dict[str, Any]]:
        """Looking in on the sleeping pet before sunrise: a sleepy hello."""
        state = self.state
        assert state is not None
        today, hour = self._today(now)
        sun = self.hass.states.get("sun.sun")
        if (
            state.away
            or not state.asleep
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
        born = model.pet_birthday(state.hatched_on, today)
        if born and noted.get("birthday") != today:
            if friends and born.get("months") == months:
                note = {"kind": "birthday_friends", "months": months}
            else:
                note = {"kind": "pet_birthday", **born}
            celebrations.append(("pet", "birthday", today, note))
        if friends:
            celebrations.append(
                ("pet", "friends", today, {"kind": "friends_for", "months": months})
            )
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
        fav = likes.get("fav_weather")
        if (
            fav
            and {"sun": "sun", "rain": "rain", "snow": "snow", "storms": "storm"}[fav]
            in self._weather_now
            and not self.people.said(user, "fav_weather", today)
        ):
            out.append(
                (
                    "person",
                    "fav_weather",
                    today,
                    {"kind": "fav_weather", "weather": fav},
                )
            )
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
                out.append(
                    (
                        "person",
                        "season",
                        key,
                        {"kind": "season", "season": likes["fav_season"]},
                    )
                )
        if (
            my_day
            and level >= R.ALARM_LEVEL
            and hour >= R.ALARM_EVENING_FROM
            and not self.people.said(user, "alarm", today)
            and (minute := self._tomorrows_alarm(user, local)) is not None
            and P.early_alarm(minute, [m for _, m in person.get("alarms", [])[:-1]])
        ):
            out.append(("person", "alarm", today, {"kind": "early_alarm"}))
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
        )
        if kind is None:
            return None
        P.mark_asked(person, today, hour)
        if kind in P.ONCE_KINDS:
            P.mark_once(person, kind, today)
        if kind == "catchphrase":
            self._catch_ask(user)["asked"].append(today)
            self._save()
        self.people.save()
        return kind

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

    async def async_answer(self, user: str, question: str, answer: str) -> None:
        """A remembered answer: a favourite, tonight's dream, a guess, its
        catchphrase."""
        assert self.state is not None
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
            return
        if answer not in P.ANSWERS.get(question, ()):
            raise ValueError(f"{answer} isn't an answer to {question}")
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
            person.setdefault("likes", {})[question] = answer
        elif question == "guess":
            person["guess"] = {"day": P.tomorrow(today), "guess": answer}
        elif question == "dream":
            model.pick_dream(self.state, user, answer, self._now())
            self._save()
        self.people.save()

    async def async_set_birthday_phone(self, user: str, enabled: bool) -> None:
        """Whether this person's phone hears "happy birthday" on the day."""
        self.people.person(user)["birthday_phone"] = enabled
        self.people.save()

    async def async_set_baby_talk(self, user: str, enabled: bool) -> None:
        """Simpler words from babies and children on this person's cards. One
        switch per person, for every pet; no entity shows it, so nothing to
        republish (the card learns it from the visit reply)."""
        self.people.person(user)["baby_talk"] = enabled
        self.people.save()

    async def async_forget_birthday(self, user: str) -> None:
        """Forget someone's birthday, and don't ask again."""
        person = self.people.person(user)
        person.pop("birthday", None)
        person.pop("birthday_phone", None)
        person["birthday_skipped"] = True
        self.people.save()

    async def async_set_my_day(self, user: str, enabled: bool) -> None:
        """Let the pets notice this person's day (steps, sleep, where they've
        been...), or stop. One switch per person, for every pet."""
        self.people.person(user)["my_day"] = enabled
        self.people.save()
        for pet in self.hass.data[DOMAIN]["pets"].values():
            if pet.state is not None:
                pet.async_set_updated_data(pet.state)

    def _birthday_morning(self) -> None:
        """A friend's birthday: their phone hears it with the first morning of
        any hatched pet at home that notifies them, from the one they're
        closest to, once a year. Their nickname, never their name. Only if
        they turned "birthday on my phone" on (off by default: the message is
        in HA's history, which admins can read)."""
        state = self.state
        if state is None or state.away or model.life_stage(state) == "egg":
            return
        local = dt_util.now().date()
        today, year = local.isoformat(), str(local.year)
        pets: dict[str, PetCoordinator] = self.hass.data[DOMAIN]["pets"]
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
            here = [
                p
                for p in pets.values()
                if p.state is not None
                and user in p.state.notify_users
                and not p.state.away
                and model.life_stage(p.state) != "egg"
            ]
            closest = max(
                here, key=lambda p: (p.bond_for(user)[0], p.pet_id), default=self
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
        kind = notify.holiday(local.date())
        if kind is None or self._holiday_on == today:
            return
        self._holiday_on = today
        self._fire([{"type": "holiday", "holiday": kind}])

    def _notify(self, event: model.Event, simulated: bool) -> None:
        """Tell the users who opted in, on their phones. Never for fast-forward."""
        if simulated or self.state is None or not self.state.notify_users:
            return
        users = list(self.state.notify_users)
        if event["type"] in notify.CALL_OVER_EVENTS and self._call_notified:
            # The call is over: take its notification off the phones.
            self._call_notified = False
            self._send(users, "clear_notification", notify.call_tag(self.pet_id))
        text = notify.message(event, self.state.name, self.species_names)
        if text is None:
            return
        if event["type"] in notify.CALL_EVENTS:
            self._call_notified = True
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
        level = "time-sensitive" if event["type"] in notify.CALL_EVENTS else None
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
        """A new pet: tell the whole house, on every phone and in the sidebar."""
        text = notify.welcome(self.config_entry.title)
        link = f"\n\n[Open the pet shelf]({self.dashboard})" if self.dashboard else ""
        persistent_notification.async_create(
            self.hass,
            text + link,
            title="Virtual Pet",
            notification_id=f"{DOMAIN}_{self.pet_id}_welcome",
        )
        self._send(None, text, f"{DOMAIN}_{self.pet_id}_welcome")
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

    def _save(self) -> None:
        state = self.state
        assert state is not None
        self.store.async_delay_save(state.to_dict, SAVE_DELAY)

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
        if result == "away" and self.privacy:
            # Privacy: an empty house looks like a nap, so the refusal does too.
            result = "asleep"
            self.state.care_log[0]["result"] = result
            for event in events:
                if event["type"] == "care":
                    event["result"] = result
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

    async def async_play_game(
        self, guess: str | None, context: Context | None, kind: str = "left_right"
    ) -> dict[str, Any]:
        """One round of a game, or with no guess, the start of one."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        by = await self._who(context)
        person = await self._person(context)
        if guess is None:
            info, events = model.start_game(self.state, kind, now, self.rng, by)
        else:
            info, events = model.play_game(
                self.state, guess, now, self.rng, by, kind=kind
            )
        if info["result"] == "away" and self.privacy:
            info["result"] = self.state.care_log[0]["result"] = "asleep"
            for event in events:
                event["result"] = "asleep"
        for event in list(events):
            if event["type"] == "game_finished" and person is not None:
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

    async def async_set_egg_choice(self, species: str | None) -> None:
        """Pick the species the next egg hatches into; None leaves it a surprise."""
        assert self.state is not None
        if species is not None and species not in self.egg_roster:
            raise ValueError(f"{species} can't hatch from this device's next egg")
        self.state.egg_choice = species
        self._save()
        self._publish()

    async def async_set_lights_out(
        self, on: bool, context: Context | None = None
    ) -> None:
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

    async def async_fast_forward(self, hours: float) -> dict[str, Any]:
        """Debug: live through N hours right now, at normal rates."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        seconds = hours * 3600
        was_egg = model.life_stage(self.state) == "egg"
        events = model.advance(
            self.state, now + seconds, self.settings, self.rng, max_gap=None
        )
        # Pull the simulated future back to the real present.
        model.shift_times(self.state, -seconds)
        if was_egg and self.state.hatched_on is not None:
            # hatched_on is a date, so shift_times can't move it: redo it from
            # the rebased hatch time, in the configured time zone.
            hatch = self.state.born + dict(R.STAGE_STARTS)["baby"] * 3600 - seconds
            self.state.hatched_on = (
                datetime.fromtimestamp(hatch, self.settings.tz).date().isoformat()
            )
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
