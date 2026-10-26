"""The integration inside a test Home Assistant."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant import config_entries
from homeassistant.const import CONF_NAME, STATE_OFF, STATE_ON, STATE_UNAVAILABLE
from homeassistant.core import Context, HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
)

from custom_components.virtual_pet.const import DOMAIN

STORE_KEY = f"{DOMAIN}.test_pet"


def entry() -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN, title="Pip", data={CONF_NAME: "Pip"}, entry_id="test_pet"
    )


async def setup(hass: HomeAssistant) -> MockConfigEntry:
    await hass.config.async_set_time_zone("UTC")
    config = entry()
    config.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    return config


def hatched_pet(now: float, **stats: Any) -> dict[str, Any]:
    pet = {
        "name": "Pip",
        "born": now - 30 * 3600,
        "last_updated": now,
        "age_hours": 30.0,
        "hunger": 90.0,
        "happiness": 90.0,
        "energy": 90.0,
    }
    pet.update(stats)
    return {"version": 1, "minor_version": 1, "key": STORE_KEY, "data": pet}


async def press(hass: HomeAssistant, entity_id: str) -> None:
    await hass.services.async_call(
        "button", "press", {"entity_id": entity_id}, blocking=True
    )


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def test_config_flow_names_the_pet(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    assert result["type"] is FlowResultType.FORM
    # Only worlds with a ready species are offered.
    worlds = result["data_schema"].schema["world"].config["options"]
    assert [o["value"] for o in worlds] == ["woodland", "terrarium"]
    # The beetle isn't ready yet, so the terrarium lists only the gecko.
    assert worlds[1]["label"] == "Terrarium: Leopard gecko"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_NAME: "Juniper", "world": "woodland"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Juniper"
    assert result["data"]["world"] == "woodland"


async def test_new_pet_is_an_egg(hass: HomeAssistant, now: float) -> None:
    await setup(hass)
    assert hass.states.get("sensor.pip_life_stage").state == "egg"
    assert hass.states.get("sensor.pip_mood").state == "egg"
    assert hass.states.get("sensor.pip_hunger").state == "80"
    assert hass.states.get("switch.pip_lights_out").state == STATE_OFF


async def test_entities_and_defaults(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    registry = er.async_get(hass)
    debug = registry.async_get("sensor.pip_debug")
    assert debug.disabled_by is er.RegistryEntryDisabler.INTEGRATION
    for entity_id in (
        "sensor.pip_happiness",
        "sensor.pip_energy",
        "sensor.pip_health",
        "sensor.pip_discipline",
        "sensor.pip_poop",
        "sensor.pip_care_misses",
        "sensor.pip_last_care",
        "binary_sensor.pip_asleep",
        "binary_sensor.pip_calling",
        "binary_sensor.pip_sick",
        "button.pip_feed",
        "button.pip_snack",
        "button.pip_play",
        "button.pip_clean",
        "button.pip_scold",
        "button.pip_praise",
    ):
        assert hass.states.get(entity_id) is not None, entity_id
    assert registry.async_get("button.pip_feed").unique_id == "test_pet_feed"
    # Medicine only works on a sick pet.
    assert hass.states.get("button.pip_medicine").state == STATE_UNAVAILABLE


async def test_feed_button_and_log(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_admin_user
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=40.0)
    await setup(hass)
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": "button.pip_feed"},
        blocking=True,
        context=Context(user_id=hass_admin_user.id),
    )
    assert hass.states.get("sensor.pip_hunger").state == "75"
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["action"] == "feed"
    assert log[0]["by"] == hass_admin_user.name


async def test_lights_out_switch(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, energy=40.0)
    await setup(hass)
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": "switch.pip_lights_out"}, blocking=True
    )
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_ON
    assert hass.states.get("sensor.pip_mood").state == "asleep"
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": "switch.pip_lights_out"}, blocking=True
    )
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_OFF


async def test_tick_decays_over_time(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    for _ in range(12):  # an hour of five-minute ticks
        freezer.tick(timedelta(minutes=5))
        async_fire_time_changed(hass)
        await hass.async_block_till_done()
    assert hass.states.get("sensor.pip_hunger").state == "85"


async def test_fast_forward_service(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=30.0)
    await setup(hass)
    calls = async_capture_events(hass, f"{DOMAIN}_call_started")
    misses = async_capture_events(hass, f"{DOMAIN}_care_miss")
    response = await hass.services.async_call(
        DOMAIN, "fast_forward", {"hours": 2}, blocking=True, return_response=True
    )
    assert "call_started" in response["test_pet"]["events"]
    assert calls and calls[0].data["pet_id"] == "test_pet"
    assert calls[0].data["simulated"] is True
    assert misses
    assert hass.states.get("sensor.pip_hunger").state == "20"
    assert hass.states.get("sensor.pip_care_misses").state == "1"


async def test_restart_does_not_hurt(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    # Saved 10 hours ago with a call about to expire; HA was down since.
    stored = hatched_pet(now - 10 * 3600, hunger=24.0)
    stored["data"]["call"] = {
        "reason": "hunger",
        "started": now - 10 * 3600 - 60,
        "deadline": now - 10 * 3600 + 60,
    }
    stored["data"]["latched"] = ["hunger"]
    hass_storage[STORE_KEY] = stored
    await setup(hass)
    assert hass.states.get("sensor.pip_hunger").state == "24"
    assert hass.states.get("sensor.pip_care_misses").state == "0"
    assert hass.states.get("binary_sensor.pip_calling").state == STATE_ON


async def test_state_survives_reload(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=40.0)
    config = await setup(hass)
    await press(hass, "button.pip_feed")
    assert await hass.config_entries.async_unload(config.entry_id)
    await hass.async_block_till_done()
    assert hass_storage[STORE_KEY]["data"]["hunger"] == pytest.approx(75.0)
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.pip_hunger").state == "75"


async def test_card_and_sprites_are_served(
    hass: HomeAssistant, now: float, hass_client
) -> None:
    await setup(hass)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["world"] == "woodland"
    assert attrs["species"] is None  # still an egg
    client = await hass_client()
    resp = await client.get("/virtual_pet/frontend/hatch-pet-card.js")
    assert resp.status == 200
    assert "hatch-pet-card" in await resp.text()
    for path in (
        "worlds.json",
        "sprites/bird/species.json",
        "fonts/Tiny5.woff2",
    ):
        resp = await client.get(f"/virtual_pet/frontend/{path}")
        assert resp.status == 200, path
    resp = await client.get("/virtual_pet/frontend/sprites/bird/child_content_1.png")
    assert resp.status == 200


async def test_egg_hatches_into_a_roster_species(
    hass: HomeAssistant, now: float
) -> None:
    await setup(hass)
    hatched = async_capture_events(hass, f"{DOMAIN}_hatched")
    await hass.services.async_call(DOMAIN, "fast_forward", {"hours": 1}, blocking=True)
    assert hatched[0].data["species"] == "bird"
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["species"] == "bird"
    assert attrs["raised"] == ["bird"]


async def test_phase2_pet_becomes_a_woodland_bird(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await hass.config.async_set_time_zone("UTC")
    MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "species": "bird"},
        entry_id="test_pet",
    ).add_to_hass(hass)
    assert await hass.config_entries.async_setup("test_pet")
    await hass.async_block_till_done()
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["world"] == "woodland"
    assert attrs["species"] == "bird"


async def test_egg_reports_when_it_hatches(hass: HomeAssistant, now: float) -> None:
    await setup(hass)
    hatches = hass.states.get("sensor.pip_life_stage").attributes["hatches_at"]
    assert dt_util.parse_datetime(hatches).timestamp() == pytest.approx(
        now + 1800, abs=2
    )


def test_broken_species_files_are_skipped(tmp_path, monkeypatch) -> None:
    from custom_components.virtual_pet import species

    (tmp_path / "sprites" / "good").mkdir(parents=True)
    (tmp_path / "sprites" / "bad").mkdir()
    (tmp_path / "sprites" / "good" / "species.json").write_text(
        '{"name": "Good", "stages": ["baby"], "moods": ["content"]}'
    )
    (tmp_path / "sprites" / "bad" / "species.json").write_text('{"name": "Bad"}')
    (tmp_path / "worlds.json").write_text(
        '{"w": {"name": "W", "roster": ["bad", "good"]}}'
    )
    monkeypatch.setattr(species, "FRONTEND_DIR", tmp_path)
    catalog = species.load_catalog()
    assert list(catalog.species) == ["good"]
    assert catalog.roster("w") == ["good"]


async def test_card_is_loaded_on_every_dashboard(
    hass: HomeAssistant, now: float
) -> None:
    import json
    from pathlib import Path

    from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL

    from custom_components.virtual_pet.const import VERSION

    await setup(hass)
    manifest = Path(__file__).parents[1] / "custom_components/virtual_pet/manifest.json"
    assert json.loads(manifest.read_text())["version"] == VERSION
    assert (
        f"/virtual_pet/frontend/hatch-pet-card.js?v={VERSION}"
        in hass.data[DATA_EXTRA_MODULE_URL].urls
    )
