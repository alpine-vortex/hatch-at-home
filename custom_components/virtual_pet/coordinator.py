"""The coordinator: the single owner of the pet's state."""

from __future__ import annotations

from datetime import timedelta
import random
from typing import Any

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
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

from . import model, notify, rates as R
from .const import (
    CONF_AWAY_AFTER,
    CONF_BEDTIME,
    CONF_CHORES,
    CONF_COMFORT_HIGH,
    CONF_COMFORT_LOW,
    CONF_DASHBOARD,
    CONF_NEXT_WORLD,
    CONF_PRIVACY,
    CONF_SITTER_SETTLES,
    CONF_SPECIES,
    CONF_WAKE_TIME,
    CONF_WORLD,
    DEFAULT_WORLD,
    DEFAULT_ZONE,
    DOMAIN,
    LOGGER,
    STORE_MINOR_VERSION,
    STORE_VERSION,
)
from .home import SNOWY, HomeEffect, HouseMoments, Presence, Readings, evaluate
from .species import load_catalog
from .watcher import Watcher

type PetConfigEntry = ConfigEntry[PetCoordinator]

SAVE_DELAY = 10  # seconds; the Store also writes once more on shutdown

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
}
MOMENTS_KEPT = 10


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
        self.state: model.PetState | None = None
        # Last calculation, for the diagnostic sensor.
        self.debug: dict[str, Any] = {}
        # Recent events for the card to react to, newest first (not saved).
        self.moments: list[dict[str, Any]] = []
        # A call notification is on the phones (cleared when the call is over).
        self._call_notified = False
        # The house: nothing is read until HA has fully started.
        self.home = HomeEffect()
        self.house_moments = HouseMoments()
        self.presence = Presence(
            entry.options.get(CONF_AWAY_AFTER, R.HOME_AWAY_AFTER_HOURS)
        )
        self.watcher = Watcher(hass, entry.options)
        self._home_started = False
        # Completed to-do items per list, to spot newly done chores.
        self._chores_done: dict[str, set[str]] = {}
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
        assert self.state is not None
        mood, flags, reason = model.mood(self.state, self._now(), self.settings)
        if mood == "away" and self.privacy:
            # Privacy: an empty house looks like a nap on any dashboard.
            return "asleep", ["asleep"], "zzz"
        return mood, flags, reason

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
        data = await self.store.async_load()
        if data is None:
            # Only adding the integration makes a save file; laying an egg
            # reuses this one, so this is a new pet in the house.
            self.state = model.PetState.new(self.config_entry.title, now)
            LOGGER.debug("New egg for %s", self.pet_id)
            await self.store.async_save(self.state.to_dict())  # welcome once only
            self._welcome()
        else:
            self.state = model.PetState.from_dict(data)
            downtime = now - self.state.last_updated
            model.catch_up(self.state, now)
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
        self._save()

    async def _async_update_data(self) -> model.PetState:
        """The regular tick."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        self._sense_home(now)  # time-based signals: motion going quiet, away
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

    def _issue(self, key: str, active: bool, placeholders: dict[str, str]) -> None:
        """Raise or clear one of this pet's repair issues (Settings → Repairs)."""
        issue_id = f"{key}_{self.pet_id}"
        if not active:
            ir.async_delete_issue(self.hass, DOMAIN, issue_id)
            return
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            issue_id,
            is_fixable=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key=key,
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
        self.hass.async_create_task(self._async_home_changed())

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
        if self.presence.greeting(now):
            effect.flags.insert(0, "greeting")
        self.home = effect

        away = self.presence.update(self.watcher.people_home(now), now, self.state.away)
        if away != self.state.away:
            self.state.away = away
            if away and self.config_entry.options.get(CONF_SITTER_SETTLES, True):
                model.sitter_settles(self.state)
            self._fire([{"type": "went_away" if away else "came_home"}])
            if not away:
                self.home.flags.insert(0, "greeting")
                self._fire(model.come_home(self.state, now, settings))
        self._fire(self._passing_moments(readings, now))
        self.debug["home"] = {
            "readings": {k: v for k, v in vars(readings).items() if v is not None},
            "flags": effect.flags,
            "requests": effect.requests,
            "bonus": effect.bonus,
            "dark_and_quiet": effect.dark_and_quiet,
        }

    def _passing_moments(self, readings: Readings, now: float) -> list[model.Event]:
        """Sunsets, the morning stir, the TV, the season's first snow or frost."""
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
        if awake and readings.condition in SNOWY:
            events += model.season_first(state, "snow", now, settings.tz)
        if awake and readings.outdoor_c is not None and readings.outdoor_c <= 0:
            events += model.season_first(state, "frost", now, settings.tz)
        return events

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
        self._save()

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
        self._send(users, text, tag, notify.actions(event, self.pet_id))

    def _send(
        self,
        users: list[str] | None,
        text: str,
        tag: str,
        buttons: list[dict[str, str]] | None = None,
    ) -> None:
        self.config_entry.async_create_background_task(
            self.hass,
            notify.send(self.hass, users, text, tag, buttons, self.dashboard),
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
        if key == "lights_out":
            await self.async_set_lights_out(True)
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
        self._fire(events)
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
        self._fire(events)
        self._save()
        self._publish()
        return info

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

    async def async_set_lights_out(self, on: bool) -> None:
        """Flip the lights-out switch."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        self._fire(model.set_lights_out(self.state, on, now, self.settings))
        self._save()
        self._publish()

    async def async_fast_forward(self, hours: float) -> dict[str, Any]:
        """Debug: live through N hours right now, at normal rates."""
        assert self.state is not None
        now = self._now()
        self._advance(now)
        seconds = hours * 3600
        events = model.advance(
            self.state, now + seconds, self.settings, self.rng, max_gap=None
        )
        # Pull the simulated future back to the real present.
        model.shift_times(self.state, -seconds)
        self._fire(events, simulated=True)
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

    async def async_shutdown(self) -> None:
        """Write the pet to disk now."""
        await super().async_shutdown()
        if self.state is not None:
            await self.store.async_save(self.state.to_dict())
