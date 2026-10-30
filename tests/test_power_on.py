"""house.powered_on: HA itself starting, with a save that loaded normally."""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import patch

from homeassistant.core import CoreState, HomeAssistant
from homeassistant.util import dt as dt_util
import pytest

from custom_components.virtual_pet import model
from custom_components.virtual_pet.diagnostics import (
    async_get_config_entry_diagnostics,
)

from .test_channel import (
    now as now,  # noqa: PLC0414
    subscribe,
)
from .test_init import STORE_KEY, hatched_pet, setup


async def test_a_load_while_ha_starts_powers_on(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now - 3600)
    hass.set_state(CoreState.starting)
    config = await setup(hass)
    snapshot = await subscribe(await hass_ws_client(hass))
    assert snapshot["house"]["powered_on"] == {"at": dt_util.utcnow().isoformat()}
    assert "away_minutes" not in json.dumps(snapshot)
    # Never in a state attribute or in the diagnostics.
    for state in hass.states.async_all():
        assert "powered_on" not in json.dumps(dict(state.attributes), default=str)
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert "powered_on" not in json.dumps(diag, default=str)


async def test_a_reload_with_ha_running_gives_none(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now - 3600)
    await setup(hass)
    snapshot = await subscribe(await hass_ws_client(hass))
    assert "powered_on" not in snapshot["house"]


async def test_a_new_egg_gives_none(
    hass: HomeAssistant, now: float, hass_ws_client: Any
) -> None:
    hass.set_state(CoreState.starting)
    await setup(hass)
    snapshot = await subscribe(await hass_ws_client(hass))
    assert "powered_on" not in snapshot["house"]


@pytest.mark.parametrize("broken", ["from_dict", "catch_up"])
async def test_a_damaged_save_gives_none(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    broken: str,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.set_state(CoreState.starting)
    target = model.PetState if broken == "from_dict" else model
    with patch.object(target, broken, side_effect=RuntimeError("a bug")):
        await setup(hass)
    snapshot = await subscribe(await hass_ws_client(hass))
    assert "powered_on" not in snapshot["house"]
