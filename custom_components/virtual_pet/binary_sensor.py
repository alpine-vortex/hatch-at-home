"""Binary sensors: asleep, calling, sick."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import model
from .coordinator import PetConfigEntry, PetCoordinator
from .entity import PetEntity


@dataclass(frozen=True, kw_only=True)
class PetBinaryDescription(BinarySensorEntityDescription):
    """A yes/no fact about the pet."""

    is_on_fn: Callable[[model.PetState], bool]


BINARY_SENSORS = [
    PetBinaryDescription(
        key="asleep", translation_key="asleep", is_on_fn=lambda pet: pet.asleep
    ),
    PetBinaryDescription(
        key="calling",
        translation_key="calling",
        is_on_fn=lambda pet: pet.call is not None,
    ),
    PetBinaryDescription(
        key="sick", translation_key="sick", is_on_fn=lambda pet: pet.sick
    ),
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the pet's binary sensors."""
    async_add_entities(
        PetBinarySensor(entry.runtime_data, desc) for desc in BINARY_SENSORS
    )


class PetBinarySensor(PetEntity, BinarySensorEntity):
    """A yes/no fact about the pet."""

    entity_description: PetBinaryDescription
    _unrecorded_attributes = frozenset({"deadline"})

    def __init__(self, coordinator: PetCoordinator, desc: PetBinaryDescription) -> None:
        super().__init__(coordinator, desc.key)
        self.entity_description = desc

    @property
    def is_on(self) -> bool:
        return self.entity_description.is_on_fn(self.pet)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.key != "calling" or self.pet.call is None:
            return None
        # The reason stays off this sensor so a fake call looks real here.
        return {
            "deadline": dt_util.utc_from_timestamp(self.pet.call.deadline).isoformat()
        }
