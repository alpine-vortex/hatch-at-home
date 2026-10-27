"""The next egg: a surprise, or a creature the owner picks from the egg's world."""

from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .coordinator import PetConfigEntry, PetCoordinator
from .entity import PetEntity

SURPRISE = "Surprise me"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add the next-egg choice."""
    async_add_entities([NextEggSelect(entry.runtime_data)])


class NextEggSelect(PetEntity, SelectEntity):
    """Which creature the next egg hatches into. It applies to one hatch, then
    goes back to a surprise. The options are creature names; the pet stores
    the species ID."""

    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, coordinator: PetCoordinator) -> None:
        super().__init__(coordinator, "next_egg")

    @property
    def options(self) -> list[str]:
        return [SURPRISE, *self.coordinator.egg_species_names.values()]

    @property
    def current_option(self) -> str:
        names = self.coordinator.egg_species_names
        return names.get(self.pet.egg_choice or "", SURPRISE)

    async def async_select_option(self, option: str) -> None:
        names = self.coordinator.egg_species_names
        species = next((s for s, name in names.items() if name == option), None)
        await self.coordinator.async_set_egg_choice(species)
