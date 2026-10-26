"""Base entity for the pet's device."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import PetCoordinator
from .model import PetState


class PetEntity(CoordinatorEntity[PetCoordinator]):
    """An entity on the pet's device."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: PetCoordinator, key: str) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        self._attr_translation_key = key
        # Built from the entry ID and the key; never change these.
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Hatch at Home",
            model=coordinator.species_name,
        )

    @property
    def pet(self) -> PetState:
        """The pet's current state."""
        assert self.coordinator.state is not None
        return self.coordinator.state
