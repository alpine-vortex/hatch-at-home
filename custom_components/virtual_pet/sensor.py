"""Sensors: stats, mood, life stage, care history and debug detail."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

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

from . import model
from .coordinator import PetConfigEntry, PetCoordinator
from .entity import PetEntity


@dataclass(frozen=True, kw_only=True)
class StatDescription(SensorEntityDescription):
    """A whole-number stat."""

    value_fn: Callable[[model.PetState], float]


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


class MoodSensor(PetEntity, SensorEntity):
    """The mood the card draws, with the reason it says."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = list(model.MOODS)
    _unrecorded_attributes = frozenset({"flags", "reason", "call_deadline", "requests"})

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "mood")

    def _resolve(self) -> tuple[str, list[str], str]:
        mood, flags, reason = model.mood(
            self.pet, dt_util.utcnow().timestamp(), self.coordinator.settings
        )
        if mood == "away" and self.coordinator.privacy:
            # Privacy: an empty house looks like a nap on any dashboard.
            return "asleep", ["asleep"], "zzz"
        return mood, flags, reason

    @property
    def native_value(self) -> str:
        return self._resolve()[0]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        _, flags, reason = self._resolve()
        call = self.pet.call
        return {
            "flags": flags,
            "reason": reason,
            "requests": model.requests(
                self.pet, dt_util.utcnow().timestamp(), self.coordinator.settings
            ),
            "call_deadline": (
                dt_util.utc_from_timestamp(call.deadline).isoformat() if call else None
            ),
        }


class LifeStageSensor(PetEntity, SensorEntity):
    """Egg, baby, child, teen or adult."""

    _attr_device_class = SensorDeviceClass.ENUM
    _attr_options = list(model.LIFE_STAGES)
    _unrecorded_attributes = frozenset({"raised", "roster", "hatches_at"})

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "life_stage")

    @property
    def native_value(self) -> str:
        return model.life_stage(self.pet)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "age_days": round(self.pet.age_hours / 24, 1),
            "species": self.pet.species,
            "world": self.coordinator.world,
            "raised": self.pet.raised,
            "traits": self.pet.traits,
            "generation": self.pet.generation,
            "journal": self.pet.journal,
            "trait_progress": model.trait_progress(self.pet),
            "roster": list(self.coordinator.roster),
            "hatches_at": self._hatches_at(),
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
    _unrecorded_attributes = frozenset({"log"})

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
            ]
        }


class DebugSensor(PetEntity, SensorEntity):
    """Everything under the hood. Disabled by default."""

    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default = False
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _unrecorded_attributes = frozenset(
        {"flags", "state", "calculation", "latched", "digesting", "poops"}
    )

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "debug")

    @property
    def native_value(self) -> datetime:
        return dt_util.utc_from_timestamp(self.pet.last_updated)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        pet = self.pet
        now = dt_util.utcnow().timestamp()
        _, flags, _ = model.mood(pet, now, self.coordinator.settings)
        stamp = dt_util.utc_from_timestamp
        return {
            "flags": flags,
            "state": {stat: round(getattr(pet, stat), 2) for stat in model.STATS},
            "poops": [stamp(t).isoformat() for t in pet.poops],
            "digesting": [stamp(t).isoformat() for t in pet.digesting],
            "latched": pet.latched,
            "calculation": dict(self.coordinator.debug),
        }
