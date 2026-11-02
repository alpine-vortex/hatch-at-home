"""The lights-out switch (the top authority on sleep), and resting."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .const import LOGGER
from .coordinator import PetConfigEntry, PetCoordinator
from .entity import PetEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the lights-out and resting switches."""
    async_add_entities(
        [LightsOutSwitch(entry.runtime_data), RestingSwitch(entry.runtime_data)]
    )


class LightsOutSwitch(PetEntity, SwitchEntity):
    """On puts the pet to bed, off wakes it up."""

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "lights_out")

    @property
    def is_on(self) -> bool:
        return self.pet.asleep

    async def async_turn_on(self, **kwargs: Any) -> None:
        await self.coordinator.async_set_lights_out(True, self._context)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.async_set_lights_out(False)


class RestingSwitch(PetEntity, SwitchEntity):
    """On rests the pet: content, no calls, no aging, still there to visit
    (plan favourite-resting §4.1). An egg can't rest: turning it on is a
    quiet no-op, so an automation that rests every pet never errors."""

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "resting")

    @property
    def is_on(self) -> bool:
        return self.pet.resting

    async def async_turn_on(self, **kwargs: Any) -> None:
        if await self.coordinator.async_set_resting(True) != "ok":
            LOGGER.debug("%s hasn't hatched yet: it can't rest", self.pet.name)

    async def async_turn_off(self, **kwargs: Any) -> None:
        await self.coordinator.async_set_resting(False)
