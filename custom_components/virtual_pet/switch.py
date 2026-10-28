"""The lights-out switch: the top authority on sleep."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import PetConfigEntry, PetCoordinator
from .entity import PetEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the lights-out switch."""
    async_add_entities([LightsOutSwitch(entry.runtime_data)])


class LightsOutSwitch(PetEntity, SwitchEntity):
    """On puts the pet to bed, off wakes it up."""

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "lights_out")

    @property
    def is_on(self) -> bool:
        return self.pet.lights_out

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.async_set_lights_out(True, self._context)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.async_set_lights_out(False)
