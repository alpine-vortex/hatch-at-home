"""Sensors: stats, mood, life stage, care history and debug detail."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
import math
from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import model, rates as R
from .const import PRIVATE_READINGS
from .coordinator import PetConfigEntry, PetCoordinator
from .entity import PetEntity


@dataclass(frozen=True, kw_only=True)
class StatDescription(SensorEntityDescription):
    """A whole-number stat."""

    value_fn: Callable[[model.PetState], float]
    attrs_fn: Callable[[model.PetState], dict[str, Any]] | None = None


STAT_SENSORS = [
    StatDescription(
        key=stat,
        translation_key=stat,
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda pet, stat=stat: getattr(pet, stat),
    )
    for stat in model.STATS
] + [
    StatDescription(
        key="poop",
        translation_key="poop",
        value_fn=lambda pet: len(pet.poops),
    ),
    StatDescription(
        key="care_misses",
        translation_key="care_misses",
        value_fn=lambda pet: pet.care_misses,
        attrs_fn=lambda pet: {"discipline_misses": pet.discipline_misses},
    ),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the pet's sensors."""
    coordinator = entry.runtime_data
    entities: list[SensorEntity] = [
        StatSensor(coordinator, desc) for desc in STAT_SENSORS
    ]
    entities += [
        MoodSensor(coordinator),
        LifeStageSensor(coordinator),
        LastCareSensor(coordinator),
        DebugSensor(coordinator),
    ]
    async_add_entities(entities)


class StatSensor(PetEntity, SensorEntity):
    """A stat, rounded. HA only records a change when the integer changes."""

    entity_description: StatDescription

    def __init__(self, coordinator: PetCoordinator, desc: StatDescription) -> None:
        super().__init__(coordinator, desc.key)
        self.entity_description = desc

    @property
    def native_value(self) -> int:
        return round(self.entity_description.value_fn(self.pet))

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        attrs_fn = self.entity_description.attrs_fn
        return attrs_fn(self.pet) if attrs_fn else None


class MoodSensor(PetEntity, SensorEntity):
    """The mood the card draws, with the reason it says."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = list(model.MOODS)
    _unrecorded_attributes = frozenset(
        {"flags", "reason", "reason_key", "call_deadline", "requests"}
    )

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "mood")

    def _resolve(self) -> tuple[str, list[str], str, str]:
        return self.coordinator.current_mood_keyed()

    @property
    def native_value(self) -> str:
        return self._resolve()[0]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        _, flags, reason, reason_key = self._resolve()
        call = self.pet.call
        return {
            "flags": flags,
            "reason": reason,
            # Which sentence the reason is, for the card's own words (baby talk).
            "reason_key": reason_key,
            "requests": model.requests(
                self.pet, dt_util.utcnow().timestamp(), self.coordinator.settings
            ),
            # Not while away or asleep: paused, it would move on every tick.
            "call_deadline": (
                dt_util.utc_from_timestamp(call.deadline).isoformat()
                if call and not self.pet.away and not self.pet.asleep
                else None
            ),
        }


class LifeStageSensor(PetEntity, SensorEntity):
    """Egg, baby, child, teen or adult."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = list(model.LIFE_STAGES)
    # Only the stage itself and small, slow-changing facts go to history.
    # trait_progress changes almost every tick and the journal only grows.
    _unrecorded_attributes = frozenset(
        {
            "raised",
            "roster",
            "hatches_at",
            "traits",
            "trait_levels",
            "trait_progress",
            "journal",
            "memories",
            "upbringing_score",
            "games",
            "wish",
            "dream",
            "favourites",
            "catchphrase",
            "personality",
            "hatched_on",
            "birthday",
            "shell_finish_options",
            "shell_locked",
        }
    )

    @staticmethod
    def _today_only(
        record: dict[str, Any] | None, keys: tuple[str, ...]
    ) -> dict[str, Any] | None:
        """Today's wish or dream (by the house's date), with only what the card
        needs."""
        if not record or record.get("day") != dt_util.now().date().isoformat():
            return None
        return {k: record[k] for k in keys if k in record}

    def _wish(self) -> dict[str, Any] | None:
        """Today's wish; "open" while it can still come true, so the card stops
        mentioning it: "say hi this afternoon" and "a snack after lunch" close
        at bedtime ("tuck me in" is granted then, so it stays open)."""
        wish = self._today_only(self.pet.wish, ("kind", "granted"))
        if wish is not None:
            late = wish.get("kind") in model.DAYTIME_WISHES and model.in_sleep_hours(
                dt_util.utcnow().timestamp(), self.coordinator.settings
            )
            wish["open"] = not wish.get("granted") and not late
        return wish

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "life_stage")

    @property
    def native_value(self) -> str:
        return model.life_stage(self.pet)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        # Copies: the model changes its lists in place, and HA only sends the
        # frontend attributes that differ from the last state, which would
        # otherwise be the same (already changed) list.
        return {
            "age_days": round(self.pet.age_hours / 24, 1),
            "species": self.pet.species,
            "world": self.coordinator.world,
            # Its shell finish (None: the world's own; a key this version
            # doesn't draw shows as None) and those it may wear now: a show-off
            # opens once it grows into it (shell_locked: the rest, each with its
            # stage). Changes on a pick or a stage, not on a tick.
            "shell_finish": (
                self.pet.shell_finish
                if self.pet.shell_finish in R.SHELL_FINISHES
                else None
            ),
            "shell_finish_options": model.shell_options(self.pet),
            "shell_locked": model.shell_locked(self.pet),
            "raised": list(self.pet.raised),
            "traits": list(self.pet.traits),
            "trait_levels": {
                t: model.trait_level(self.pet, t) for t in self.pet.traits
            },
            "inherited_trait": self.pet.inherited_from,
            "trait_cap": R.TRAIT_CAP,  # new learning stops here
            "generation": self.pet.generation,
            "journal": [dict(r) for r in self.pet.journal],
            # Whole percents, rounded down: a finer value changed on every tick,
            # and each change is a new database row.
            "trait_progress": {
                t: math.floor(p * 100) / 100
                for t, p in model.trait_progress(self.pet).items()
            },
            "roster": list(self.coordinator.roster),
            # Daily check-ins: today's wish and this morning's dream, for the card
            # (who granted it, and whom it's for, stay on the server: the
            # viewer's own card hears "for you" on its private channel).
            "wish": self._wish(),
            "dream": self._today_only(self.pet.dream, ("kind", "title")),
            # Its own favourites ({"snack": ...}): the pet's, not anyone's secret.
            "favourites": dict(self.pet.favourites),
            # What it says at the end of things: a friend's pick, or its own.
            "catchphrase": self.pet.catchphrase
            or self.coordinator.catchphrases.get(self.pet.species or ""),
            # Its birthday (the house's date): {"years": n} on the day, for the
            # card's party; monthly ones in its first year are lines, not parties.
            "hatched_on": self.pet.hatched_on,
            "birthday": (
                b
                if (
                    b := model.pet_birthday(
                        self.pet.hatched_on, dt_util.now().date().isoformat()
                    )
                )
                and "years" in b
                else None
            ),
            "hatches_at": self._hatches_at(),
            "next_world": self.coordinator.next_world_name,
            # The creature picked for the next hatch, by name; None: a surprise.
            "next_egg": self.coordinator.egg_species_names.get(
                self.pet.egg_choice or ""
            ),
            "memories": [dict(m) for m in self.pet.memories],
            "games": model.game_counts(self.pet),
            # Final once adult; before that, what it's on track for.
            "upbringing": (
                model.upbringing(self.pet)
                if model.life_stage(self.pet) != "egg"
                else None
            ),
            "upbringing_score": round(model.upbringing_score(self.pet)),
            # Settled at teen; None before.
            "personality": self.pet.personality,
        }

    def _hatches_at(self) -> str | None:
        """When the egg hatches at the current pace (aging pauses while away)."""
        pet = self.pet
        if model.life_stage(pet) != "egg" or not self.coordinator.roster:
            return None
        left = model.R.STAGE_STARTS[1][1] - pet.age_hours
        return dt_util.utc_from_timestamp(
            round(pet.last_updated + left * 3600)
        ).isoformat()


class LastCareSensor(PetEntity, SensorEntity):
    """When the pet was last cared for, with the who-did-what log."""

    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _unrecorded_attributes = frozenset({"log", "moments"})

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "last_care")

    @property
    def native_value(self) -> datetime | None:
        log = self.pet.care_log
        return dt_util.utc_from_timestamp(log[0]["at"]) if log else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "log": [
                {
                    **entry,
                    "at": dt_util.utc_from_timestamp(entry["at"]).isoformat(),
                }
                for entry in self.pet.care_log
            ],
            # What just happened, for the card to react to (newest first).
            "moments": [dict(m) for m in self.coordinator.moments],
        }


class DebugSensor(PetEntity, SensorEntity):
    """Everything under the hood. Disabled by default."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default = False
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _unrecorded_attributes = frozenset(
        {"flags", "state", "calculation", "latched", "digesting", "poops", "games"}
    )

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "debug")

    @property
    def native_value(self) -> datetime:
        return dt_util.utc_from_timestamp(self.pet.last_updated)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        pet = self.pet
        # As private as the mood sensor: no "away", nor what the house was up to.
        _, flags, _ = self.coordinator.current_mood()
        calculation = dict(self.coordinator.debug)
        if self.coordinator.privacy:
            calculation = async_redact_data(calculation, PRIVATE_READINGS)
        stamp = dt_util.utc_from_timestamp
        return {
            "flags": flags,
            "state": {stat: round(getattr(pet, stat), 2) for stat in model.STATS},
            "poops": [stamp(t).isoformat() for t in pet.poops],
            "digesting": [stamp(t).isoformat() for t in pet.digesting],
            "latched": list(pet.latched),
            "games": model.game_counts(pet),
            "calculation": calculation,
        }
