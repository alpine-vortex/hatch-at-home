"""The Channel uses a fresh, read-only rain sample for each round."""

from __future__ import annotations

from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.virtual_pet.activity_support import incarnation
from custom_components.virtual_pet.const import CONF_RAIN, CONF_WEATHER, DOMAIN
from custom_components.virtual_pet.pond_channel import pond_layout
from custom_components.virtual_pet.watcher import Watcher

from .test_init import STORE_KEY, hatched_pet


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def test_live_rain_sensor_takes_precedence_and_reuses_watchers_units(
    hass: HomeAssistant,
) -> None:
    watcher = Watcher(
        hass, {CONF_WEATHER: "weather.home", CONF_RAIN: ["sensor.rain", "sensor.other"]}
    )
    assert pond_layout(watcher) == "dry"
    hass.states.async_set("weather.home", "rainy")
    hass.states.async_set("sensor.rain", "0", {"unit_of_measurement": "in/h"})
    hass.states.async_set("sensor.other", "10")
    assert pond_layout(watcher) == "dry"
    hass.states.async_set("sensor.rain", "unknown")
    assert pond_layout(watcher) == "wet"
    hass.states.async_set("weather.home", "sunny")
    assert pond_layout(watcher) == "dry"
    hass.states.async_set("sensor.rain", "0.25", {"unit_of_measurement": "in/h"})
    assert pond_layout(watcher) == "wet"
    hass.states.async_set("sensor.rain", "off")
    assert pond_layout(watcher) == "dry"
    hass.states.async_set("sensor.rain", "on")
    assert pond_layout(watcher) == "wet"
    assert not watcher._good


async def test_channel_checks_new_weather_while_the_watcher_holds_its_last_good_state(
    now: float,
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_read_only_access_token: str,
) -> None:
    await hass.config.async_set_time_zone("UTC")
    hass_storage[STORE_KEY] = hatched_pet(now, species="treefrog")
    hass.states.async_set("weather.home", "rainy")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={"name": "Pip", "world": "pond", "new_pet": True},
        entry_id="test_pet",
        options={CONF_WEATHER: "weather.home"},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    pet = entry.runtime_data
    ref = incarnation(pet)
    client = await hass_ws_client(hass, hass_read_only_access_token)

    async def start(pet_ref: str) -> dict:
        await client.send_json_auto_id(
            {
                "type": "virtual_pet/pond_channel",
                "entity_id": "sensor.pip_life_stage",
                "pet_ref": pet_ref,
            }
        )
        return await client.receive_json()

    assert (await start(ref))["result"] == {"layout": "wet"}
    hass.states.async_set("weather.home", "unavailable")
    assert pet.watcher.read(now + 1, night=False).condition == "rainy"
    assert (await start(ref))["result"] == {"layout": "dry"}
    assert (await start("old-incarnation"))["error"]["code"] == "activity_changed"
