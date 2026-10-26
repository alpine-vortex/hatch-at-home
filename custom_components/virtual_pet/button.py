"""Care buttons. Each is an entity so automations and voice can use it."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import model
from .coordinator import PetConfigEntry, PetCoordinator
from .entity import PetEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: PetConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Add a button per care action."""
    async_add_entities(
        CareButton(entry.runtime_data, action)
        for action in (*model.ACTIONS, *model.REQUEST_ACTIONS)
    )


class CareButton(PetEntity, ButtonEntity):
    """A care action, or an answer to what the house makes the pet ask for."""

    def __init__(self, coordinator: PetCoordinator, action: str) -> None:
        super().__init__(coordinator, action)
        self.action = action

    @property
    def available(self) -> bool:
        return super().available and model.action_available(
            self.pet,
            self.action,
            dt_util.utcnow().timestamp(),
            self.coordinator.settings,
        )

    async def async_press(self) -> None:
        await self.coordinator.async_action(self.action, self._context)
