"""The coordinator: the single owner of the pet's state."""

from __future__ import annotations

from datetime import timedelta
import random
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from . import model, rates as R
from .const import (
    CONF_BEDTIME,
    CONF_SPECIES,
    CONF_WAKE_TIME,
    CONF_WORLD,
    DEFAULT_WORLD,
    DOMAIN,
    LOGGER,
    STORE_MINOR_VERSION,
    STORE_VERSION,
)
from .species import load_catalog

type PetConfigEntry = ConfigEntry[PetCoordinator]

SAVE_DELAY = 10  # seconds; the Store also writes once more on shutdown


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
        self.rng = random.Random()
        self.state: model.PetState | None = None
        # Last calculation, for the diagnostic sensor.
        self.debug: dict[str, Any] = {}

    @property
    def settings(self) -> model.Settings:
        """Settings from the entry options, with defaults."""
        options = self.config_entry.options
        return model.Settings(
            tz=dt_util.get_default_time_zone(),
            roster=self.roster,
            bedtime=model.parse_hhmm(options.get(CONF_BEDTIME, R.DEFAULT_BEDTIME)),
            wake_time=model.parse_hhmm(
                options.get(CONF_WAKE_TIME, R.DEFAULT_WAKE_TIME)
            ),
        )

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
        self.roster = tuple(catalog.roster(self.world)) or tuple(catalog.species)
        now = self._now()
        data = await self.store.async_load()
        if data is None:
            self.state = model.PetState.new(self.config_entry.title, now)
            LOGGER.debug("New egg for %s", self.pet_id)
        else:
            self.state = model.PetState.from_dict(data)
            downtime = now - self.state.last_updated
            model.catch_up(self.state, now)
            LOGGER.debug("Caught up %.1f min of downtime (frozen)", downtime / 60)
            self.debug["last_catch_up_minutes"] = round(downtime / 60, 1)
            if self.state.species is None and model.life_stage(self.state) != "egg":
                # Hatched before species existed (phase 2): it was a bird.
                self.state.species = old_species or self.roster[0]
                self.state.raised.append(self.state.species)
        self._save()

    async def _async_update_data(self) -> model.PetState:
        """The regular tick."""
        assert self.state is not None
        self._advance(self._now())
        return self.state

    def _advance(self, now: float, simulated: bool = False) -> None:
        assert self.state is not None
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
        if events:
            self.debug["last_events"] = [e["type"] for e in events][-10:]

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
        result, events = model.apply_action(self.state, action, now, self.rng, by)
        self._fire(events)
        self._save()
        self._publish()
        return result

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
        events = model.advance(self.state, now + seconds, self.settings, self.rng)
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
