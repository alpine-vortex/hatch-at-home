"""The integration inside a test Home Assistant."""

from __future__ import annotations

from datetime import timedelta
import random
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant import config_entries
from homeassistant.const import (
    CONF_NAME,
    MATCH_ALL,
    STATE_OFF,
    STATE_ON,
    STATE_UNAVAILABLE,
)
from homeassistant.core import (
    Context,
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.virtual_pet import model, people as P
from custom_components.virtual_pet.const import DOMAIN

STORE_KEY = f"{DOMAIN}.test_pet"


def entry() -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "new_pet": True},
        entry_id="test_pet",
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
    assert [o["value"] for o in worlds] == [
        "woodland",
        "terrarium",
        "hearth",
        "tidepool",
        "pond",
        "nightsky",
    ]
    # The beetle isn't ready yet, so the terrarium lists the other four.
    assert worlds[1]["label"] == (
        "Terrarium: Leopard gecko, Mexican red-knee tarantula, Russian tortoise, "
        "Bearded dragon, Ball python"
    )
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
    species = hatched[0].data["species"]
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["roster"] == ["bird", "squirrel", "deer", "fox", "bananaslug"]
    assert species in attrs["roster"]
    assert attrs["species"] == species
    assert attrs["raised"] == [species]


async def test_fast_forwarded_hatch_keeps_the_real_birthday(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-10-26 23:50:00+00:00")
    await setup(hass)
    await hass.services.async_call(DOMAIN, "fast_forward", {"hours": 1}, blocking=True)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["hatched_on"] == "2026-10-26"  # not the simulated midnight's date


async def test_phase2_pet_becomes_a_woodland_bird(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await hass.config.async_set_time_zone("UTC")
    MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "species": "bird", "new_pet": True},
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


# --- Phase 3: the house -----------------------------------------------------


async def setup_with_house(hass: HomeAssistant, **options: Any) -> MockConfigEntry:
    await hass.config.async_set_time_zone("UTC")
    config = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "world": "woodland", "new_pet": True},
        entry_id="test_pet",
        options=options,
    )
    config.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    return config


async def settle(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory, seconds: float = 11
) -> None:
    freezer.tick(timedelta(seconds=seconds))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


async def test_options_flow_saves_a_flat_mapping(
    hass: HomeAssistant, now: float
) -> None:
    config = await setup_with_house(hass)
    result = await hass.config_entries.options.async_init(config.entry_id)
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "sleep": {
                "bedtime": "22:30:00",
                "wake_time": "06:45:00",
                "bedtime_lights": ["light.bed"],
            },
            "weather": {"weather": "weather.home"},
            "room": {},
            "activity": {"zone": "zone.home", "tv": ["media_player.tv"]},
            "sky": {},
            "privacy": {"privacy": True},
            "notifications": {},
        },
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config.options == {
        "bedtime": "22:30:00",
        "wake_time": "06:45:00",
        "bedtime_lights": ["light.bed"],
        "weather": "weather.home",
        "zone": "zone.home",
        "tv": ["media_player.tv"],
        "privacy": True,
        "comfort_low": 18.0,
        "comfort_high": 26.5,
        "away_after": 2.0,
        "sitter_settles": True,
    }


async def test_rain_makes_a_blanket_request(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("weather.home", "sunny")
    await setup_with_house(hass, weather="weather.home")
    assert hass.states.get("button.pip_blanket").state == STATE_UNAVAILABLE

    hass.states.async_set("weather.home", "rainy")
    await settle(hass, freezer)
    mood = hass.states.get("sensor.pip_mood")
    assert mood.attributes["reason"] == "rainy day, blanket please?"
    assert mood.attributes["requests"] == ["blanket"]
    assert hass.states.get("button.pip_blanket").state != STATE_UNAVAILABLE

    await press(hass, "button.pip_blanket")
    assert hass.states.get("sensor.pip_mood").state == "cozy"


async def test_dropout_holds_then_counts_as_no_signal(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("weather.home", "rainy")
    await setup_with_house(hass, weather="weather.home")
    hass.states.async_set("weather.home", "unavailable")
    await settle(hass, freezer, 5 * 60)
    assert "rainy" in hass.states.get("sensor.pip_mood").attributes["flags"]
    await settle(hass, freezer, 6 * 60)
    assert "rainy" not in hass.states.get("sensor.pip_mood").attributes["flags"]


async def test_someone_coming_home_is_greeted_at_once(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # A short absence (not away mode): the greeting shows on the arrival itself.
    hass_storage[STORE_KEY] = hatched_pet(now, discipline=100.0)
    hass.states.async_set("zone.home", "1")
    await setup_with_house(hass)
    hass.states.async_set("zone.home", "0")
    await settle(hass, freezer)
    for _ in range(12):  # an hour out
        await settle(hass, freezer, 5 * 60)
    hass.states.async_set("zone.home", "1")
    await settle(hass, freezer)
    assert hass.states.get("sensor.pip_mood").attributes["reason"] == "you're back!!"


async def test_empty_house_goes_to_the_sitter_privately(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # Full discipline: no fake call while the house is empty, which would
    # outrank the greeting when the owner gets back.
    hass_storage[STORE_KEY] = hatched_pet(now, discipline=100.0)
    hass.states.async_set("zone.home", "1")
    await setup_with_house(hass)
    hass.states.async_set("zone.home", "0")
    await settle(hass, freezer)
    for _ in range(26):  # a bit over two hours of ticks
        await settle(hass, freezer, 5 * 60)
    # Privacy on: dashboards see a nap, not an empty house.
    assert hass.states.get("sensor.pip_mood").state == "asleep"
    hunger = hass.states.get("sensor.pip_hunger").state
    for _ in range(12):
        await settle(hass, freezer, 5 * 60)
    assert hass.states.get("sensor.pip_hunger").state == hunger  # frozen
    # Nothing ticks along while away (a frozen deadline moved every tick).
    assert hass.states.get("sensor.pip_mood").attributes["call_deadline"] is None
    calling = hass.states.get("binary_sensor.pip_calling")
    assert "deadline" not in calling.attributes

    hass.states.async_set("zone.home", "1")
    await settle(hass, freezer)
    mood = hass.states.get("sensor.pip_mood")
    assert mood.state == "excited"
    assert mood.attributes["reason"] == "you're back!!"


async def away_and_back(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    hass.states.async_set("zone.home", "0")
    await settle(hass, freezer)
    for _ in range(26):  # a bit over two hours: off to the sitter's
        await settle(hass, freezer, 5 * 60)
    hass.states.async_set("zone.home", "1")
    await settle(hass, freezer)


def whining_pet(now: float) -> dict[str, Any]:
    # Full discipline, so no new fake call starts; this one is already going.
    call = {"reason": "fake", "started": now, "deadline": now + 10 * 3600}
    return hatched_pet(now, discipline=100.0, call=call)


async def test_sitter_settles_a_whine_by_default(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = whining_pet(now)
    hass.states.async_set("zone.home", "1")
    await setup_with_house(hass)
    assert hass.states.get("binary_sensor.pip_calling").state == STATE_ON
    await away_and_back(hass, freezer)
    assert hass.states.get("sensor.pip_mood").state == "excited"
    assert hass.states.get("binary_sensor.pip_calling").state == STATE_OFF


async def test_whine_can_wait_for_the_owner(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = whining_pet(now)
    hass.states.async_set("zone.home", "1")
    await setup_with_house(hass, sitter_settles=False)
    await away_and_back(hass, freezer)
    mood = hass.states.get("sensor.pip_mood")
    assert mood.state == "calling"
    assert mood.attributes["reason"] == "play with me?"


async def test_on_off_rain_entity(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("input_boolean.raining", "off")
    hass.states.async_set("weather.home", "rainy")  # the gauge wins over this
    await setup_with_house(hass, rain="input_boolean.raining", weather="weather.home")
    assert "rainy" not in hass.states.get("sensor.pip_mood").attributes["flags"]
    hass.states.async_set("input_boolean.raining", "on")
    await settle(hass, freezer)
    assert "rainy" in hass.states.get("sensor.pip_mood").attributes["flags"]


async def test_dark_bedroom_puts_pet_to_bed_promptly(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-26 23:10:00+00:00")
    now = dt_util.utcnow().timestamp()
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("light.bed", "on")
    await setup_with_house(hass, bedtime_lights=["light.bed"])
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_OFF
    hass.states.async_set("light.bed", "off")
    await settle(hass, freezer)  # one debounce, no tick
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_ON
    hass.states.async_set("light.bed", "on")
    await settle(hass, freezer)
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_ON  # never woken


async def test_options_show_fahrenheit_and_store_celsius(
    hass: HomeAssistant, now: float
) -> None:
    from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM

    hass.config.units = US_CUSTOMARY_SYSTEM
    config = await setup_with_house(hass)
    result = await hass.config_entries.options.async_init(config.entry_id)
    weather = result["data_schema"].schema["weather"].schema.schema
    defaults = {
        str(k): k.default()
        for k in weather
        if hasattr(k, "default") and callable(k.default)
    }
    assert defaults["comfort_low"] == 64.5  # 18 °C, to the nearest half degree
    sections = {
        "sleep": {"bedtime": "23:00:00", "wake_time": "07:00:00"},
        "weather": {"comfort_low": 80, "comfort_high": 70},
        "room": {},
        "activity": {"zone": "zone.home", "away_after": 2},
        "sky": {},
        "privacy": {"privacy": True},
        "notifications": {},
    }
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], sections
    )
    assert result["errors"] == {"weather": "comfort_range"}
    # The form comes back with what was entered (in °F), not the saved options.
    weather = result["data_schema"].schema["weather"].schema.schema
    shown = {str(k): k.default() for k in weather if callable(getattr(k, "default", 0))}
    assert shown["comfort_low"] == 80 and shown["comfort_high"] == 70
    sections["weather"] = {"comfort_low": 64, "comfort_high": 80}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], sections
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert config.options["comfort_low"] == pytest.approx(17.78, abs=0.01)
    assert config.options["comfort_high"] == pytest.approx(26.67, abs=0.01)


async def test_new_pet_gets_a_free_default_name(
    hass: HomeAssistant, now: float
) -> None:
    await setup(hass)  # "Pip" exists
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    name_key = next(k for k in result["data_schema"].schema if str(k) == "name")
    assert name_key.default() == "Fern"


async def test_lay_egg_button_starts_the_next_generation(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    age = 14 * 24 + 7 * 24 + 1.0  # a week and an hour into adulthood
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        age_hours=age,
        born=now - age * 3600,
        species="bird",
        raised=["bird"],
        traits=["music_lover"],
    )
    laid = async_capture_events(hass, f"{DOMAIN}_egg_laid")
    await setup(hass)
    assert hass.states.get("button.pip_lay_egg").state != STATE_UNAVAILABLE
    assert "lay_egg" in hass.states.get("sensor.pip_mood").attributes["requests"]
    await press(hass, "button.pip_lay_egg")
    stage = hass.states.get("sensor.pip_life_stage")
    assert stage.state == "egg"
    assert stage.attributes["generation"] == 2
    assert stage.attributes["traits"] == ["music_lover"]
    assert [r["species"] for r in stage.attributes["journal"]] == ["bird"]
    assert hass.states.get("button.pip_lay_egg").state == STATE_UNAVAILABLE
    assert len(laid) == 1 and laid[0].data["inherited_trait"] == "music_lover"


async def test_lay_egg_button_is_unavailable_before_then(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    assert hass.states.get("button.pip_lay_egg").state == STATE_UNAVAILABLE


async def test_notifications_go_to_the_users_who_opted_in(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=26.0)
    await setup(hass)
    me = await hass.auth.async_create_user("Me")
    other = await hass.auth.async_create_user("Other")
    for user, phone in ((me, "My Phone"), (other, "Their Phone")):
        MockConfigEntry(
            domain="mobile_app", data={"user_id": user.id, "device_name": phone}
        ).add_to_hass(hass)
    mine = async_mock_service(hass, "notify", "mobile_app_my_phone")
    theirs = async_mock_service(hass, "notify", "mobile_app_their_phone")

    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": "sensor.pip_mood", "enabled": True},
        blocking=True,
        context=Context(user_id=me.id),
    )
    assert hass.states.get("sensor.pip_life_stage").attributes["notify_users"] == [
        me.id
    ]
    for _ in range(6):  # half an hour: hunger drops below 25 and it calls
        await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in mine] == ["Pip is hungry!"]
    assert mine[0].data["data"]["tag"] == "virtual_pet_test_pet_call"
    assert mine[0].data["data"]["actions"] == [
        {"action": "VIRTUAL_PET:test_pet:feed", "title": "Feed"}
    ]
    assert theirs == []

    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": "sensor.pip_mood", "enabled": False},
        blocking=True,
        context=Context(user_id=me.id),
    )
    assert hass.states.get("sensor.pip_life_stage").attributes["notify_users"] == []


async def test_fast_forward_never_notifies(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=26.0)
    await setup(hass)
    me = await hass.auth.async_create_user("Me")
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "My Phone"}
    ).add_to_hass(hass)
    mine = async_mock_service(hass, "notify", "mobile_app_my_phone")
    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": "sensor.pip_mood", "enabled": True},
        blocking=True,
        context=Context(user_id=me.id),
    )
    await hass.services.async_call(DOMAIN, "fast_forward", {"hours": 3}, blocking=True)
    await hass.async_block_till_done()
    assert mine == []


async def test_attributes_are_copies_of_the_pets_lists(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    # HA sends the frontend only attributes that changed. A live list changed
    # in place would compare equal to itself, and the dashboard would miss it.
    hass_storage[STORE_KEY] = hatched_pet(now, traits=["homebody"], raised=["bird"])
    config = await setup(hass)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    pet = config.runtime_data.state
    for key in ("traits", "raised", "journal", "notify_users"):
        assert attrs[key] is not getattr(pet, key), key


async def test_privacy_hides_away_behind_a_nap(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True)
    await setup(hass)
    assert hass.states.get("sensor.pip_mood").state == "asleep"
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_ON
    await press(hass, "button.pip_feed")
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["result"] == "asleep"  # not "away"


async def test_without_privacy_away_is_away(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True)
    await setup_with_house(hass, privacy=False)
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_OFF
    await press(hass, "button.pip_feed")
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["result"] == "away"


async def test_notifications_follow_a_rename(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    from homeassistant.helpers import device_registry as dr

    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup(hass)
    registry = dr.async_get(hass)
    device = registry.async_get_device_by_identifier(
        (DOMAIN, config.entry_id), config.entry_id
    )
    registry.async_update_device(device.id, name_by_user="Fern")
    await settle(hass, freezer, 5 * 60)
    assert config.runtime_data.state.name == "Fern"
    registry.async_update_device(device.id, name_by_user=None)
    hass.config_entries.async_update_entry(config, title="Mochi")
    await settle(hass, freezer, 5 * 60)
    assert config.runtime_data.state.name == "Mochi"


async def test_options_reject_impossible_settings(
    hass: HomeAssistant, now: float
) -> None:
    hass.states.async_set(
        "sensor.fire_temp",
        "21",
        {"device_class": "temperature", "unit_of_measurement": "°C"},
    )
    config = await setup_with_house(hass)
    result = await hass.config_entries.options.async_init(config.entry_id)
    sections = {
        "sleep": {"bedtime": "23:00:00", "wake_time": "23:00:00"},
        "weather": {},
        "room": {"fireplace": "sensor.fire_temp"},
        "activity": {"zone": "zone.home"},
        "sky": {},
        "privacy": {"privacy": True},
        "notifications": {},
    }
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], sections
    )
    assert result["errors"] == {
        "sleep": "same_times",
        "room": "fireplace_temperature",
    }
    sections["sleep"]["wake_time"] = "07:00:00"
    sections["room"] = {}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], sections
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_busy_attributes_stay_out_of_history(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.sensor import LifeStageSensor

    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    for key in ("journal", "trait_progress", "traits", "notify_users"):
        assert key in attrs
        assert key in LifeStageSensor._unrecorded_attributes, key
    assert attrs["upbringing"] == "steady"  # on track: no misses, no discipline
    from custom_components.virtual_pet.sensor import MoodSensor

    mood = hass.states.get("sensor.pip_mood").attributes
    assert mood["reason_key"] == "content" and mood["reason"] == "all good"
    assert "reason_key" in MoodSensor._unrecorded_attributes


async def test_the_personality_attribute_stays_out_of_history(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )
    from custom_components.virtual_pet.sensor import LifeStageSensor

    assert "personality" in LifeStageSensor._unrecorded_attributes
    # A teen saved before personalities: backfilled quietly at load.
    hass_storage[STORE_KEY] = hatched_pet(now, age_hours=130.0)
    config = await setup(hass)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["personality"] in model.PERSONALITIES
    assert attrs["personality"] == config.runtime_data.state.personality
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert diag["now"]["personality"] == attrs["personality"]
    assert diag["pet"]["personality"] == attrs["personality"]
    # ...and it reaches the store when the entry unloads.
    assert await hass.config_entries.async_unload(config.entry_id)
    await hass.async_block_till_done()
    assert hass_storage[STORE_KEY]["data"]["personality"] == attrs["personality"]


async def test_a_child_has_no_personality_attribute_value(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    assert hass.states.get("sensor.pip_life_stage").attributes["personality"] is None


async def test_the_reason_key_stays_off_assist_and_the_away_nap(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=20.0)
    config = await setup(hass)
    pet = config.runtime_data
    # Every other caller still gets (mood, flags, reason): the plain sentence.
    assert pet.current_mood() == ("hungry", ["hungry"], "a little peckish")
    assert pet.current_mood_keyed()[3] == "hungry"
    pet.state.away = True  # privacy on: away looks like a nap, key and all
    assert pet.current_mood_keyed() == ("asleep", ["asleep"], "zzz", "asleep")


async def test_play_game_service_plays_five_rounds(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0)
    await setup(hass)
    responses = []
    for _ in range(5):
        responses.append(
            await hass.services.async_call(
                DOMAIN,
                "play_game",
                {"entity_id": "button.pip_feed", "guess": "left"},
                blocking=True,
                return_response=True,
            )
        )
    assert [r["round"] for r in responses] == [1, 2, 3, 4, 5]
    assert responses[-1]["done"] is True
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["action"] == "game"
    assert log[0]["result"] in ("won", "lost")
    assert int(hass.states.get("sensor.pip_happiness").state) > 50
    assert hass.states.get("sensor.pip_weight") is not None


async def game(hass: HomeAssistant, **data: Any) -> dict[str, Any]:
    return await hass.services.async_call(
        DOMAIN,
        "play_game",
        {"entity_id": "button.pip_feed", **data},
        blocking=True,
        return_response=True,
    )


async def test_higher_or_lower_through_the_service(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0)
    await setup(hass)
    finished = async_capture_events(hass, f"{DOMAIN}_game_finished")
    # A guess before the game starts has nothing to go on.
    early = await game(hass, game="higher_lower", guess="higher")
    assert early == {"result": "no_game"}
    opening = await game(hass, game="higher_lower")
    assert opening["round"] == 0 and opening["number"] in range(1, 10)
    shown = opening["number"]
    for _ in range(5):
        info = await game(
            hass, game="higher_lower", guess="higher" if shown < 5 else "lower"
        )
        assert info["shown"] == shown and info["number"] != shown
        shown = info["number"]
    assert info["done"] is True
    assert finished[0].data["game"] == "higher_lower"
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["game"] == "higher_lower"
    stage = hass.states.get("sensor.pip_life_stage").attributes
    assert stage["games"]["higher_lower"]["played"] == 1  # the card's journal
    assert stage["trait_cap"] == 4  # the card's "traits n/4"
    # Whole percents: a finer value changed (and hit the database) every tick.
    assert all(p == round(p, 2) for p in stage["trait_progress"].values())
    counts = {"higher_lower": {"played": 1, "won": int(info["won"])}}
    registry = er.async_get(hass)
    registry.async_update_entity("sensor.pip_debug", disabled_by=None)
    await hass.config_entries.async_reload("test_pet")
    await hass.async_block_till_done()
    assert hass.states.get("sensor.pip_debug").attributes["games"] == counts


async def test_a_guess_from_another_game_is_refused(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    with pytest.raises(ServiceValidationError):
        await game(hass, game="higher_lower", guess="left")
    # Left/right still starts on its first guess, with or without game set.
    assert (await game(hass, guess="left"))["round"] == 1
    assert (await game(hass, game="left_right", guess="right"))["round"] == 2


async def test_ticking_off_a_chore_gives_the_pet_a_treat(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    from homeassistant.core import SupportsResponse

    done = [{"uid": "1", "summary": "Dishes", "status": "completed"}]

    async def get_items(call) -> ServiceResponse:
        return {"todo.chores": {"items": list(done)}}

    hass.services.async_register(
        "todo", "get_items", get_items, supports_response=SupportsResponse.ONLY
    )
    hass.states.async_set("todo.chores", "2")
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=50.0)
    treats = async_capture_events(hass, f"{DOMAIN}_chore_treat")
    await setup_with_house(hass, chores=["todo.chores"])
    await hass.async_block_till_done(wait_background_tasks=True)
    assert treats == []  # already done before: nothing

    done.append({"uid": "2", "summary": "Bins", "status": "completed"})
    hass.states.async_set("todo.chores", "1")
    await hass.async_block_till_done(wait_background_tasks=True)
    assert len(treats) == 1
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["action"] == "chore_treat"
    assert int(hass.states.get("sensor.pip_hunger").state) >= 59


async def test_chores_from_a_real_todo_list(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], tmp_path
) -> None:
    from homeassistant.setup import async_setup_component

    hass.config.config_dir = str(tmp_path)  # the shopping list saves a file there
    assert await async_setup_component(hass, "shopping_list", {})
    shopping = MockConfigEntry(domain="shopping_list")
    shopping.add_to_hass(hass)
    assert await hass.config_entries.async_setup(shopping.entry_id)
    await hass.async_block_till_done(wait_background_tasks=True)
    todo = next(s.entity_id for s in hass.states.async_all("todo"))
    await hass.services.async_call(
        "todo",
        "add_item",
        {"item": "Dishes"},
        target={"entity_id": todo},
        blocking=True,
    )
    hass_storage[STORE_KEY] = hatched_pet(now)
    treats = async_capture_events(hass, f"{DOMAIN}_chore_treat")
    await setup_with_house(hass, chores=[todo])
    await hass.async_block_till_done(wait_background_tasks=True)
    await hass.services.async_call(
        "todo",
        "update_item",
        {"item": "Dishes", "status": "completed"},
        target={"entity_id": todo},
        blocking=True,
    )
    await hass.async_block_till_done(wait_background_tasks=True)
    assert len(treats) == 1


async def test_moments_reach_the_card_but_not_from_fast_forward(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=26.0)
    config = await setup(hass)
    await hass.services.async_call(DOMAIN, "fast_forward", {"hours": 2}, blocking=True)
    attrs = hass.states.get("sensor.pip_last_care").attributes
    assert attrs["moments"] == []  # a fast-forward is not a moment
    config.runtime_data._fire([{"type": "care_miss", "reason": "hunger"}])
    config.runtime_data._fire([{"type": "care", "action": "feed", "result": "ok"}])
    config.runtime_data._publish()
    await hass.async_block_till_done()
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert [m["type"] for m in moments] == ["care_miss"]  # care has its own log
    assert "at" in moments[0]
    misses = hass.states.get("sensor.pip_care_misses")
    assert misses.attributes["discipline_misses"] == 0


async def test_notification_buttons_care_for_the_pet_and_clear_the_call(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=26.0)
    await setup(hass)
    me = await hass.auth.async_create_user("Me")
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "My Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_my_phone")
    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": "sensor.pip_mood", "enabled": True},
        blocking=True,
        context=Context(user_id=me.id),
    )
    for _ in range(6):  # hunger drops below 25 and it calls
        await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in phone] == ["Pip is hungry!"]

    hass.bus.async_fire(
        "mobile_app_notification_action",
        {"action": "VIRTUAL_PET:test_pet:feed"},
        context=Context(user_id=me.id),
    )
    await hass.async_block_till_done()
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["action"] == "feed" and log[0]["by"] == "Me"
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_test_pet_call"

    # A button on a notification left over from the call does nothing now
    # (a scold with nothing to scold would be unfair).
    hass.bus.async_fire(
        "mobile_app_notification_action",
        {"action": "VIRTUAL_PET:test_pet:scold"},
        context=Context(user_id=me.id),
    )
    await hass.async_block_till_done()
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["action"] == "feed"

    # Someone else's button, or a malformed one, does nothing.
    hass.bus.async_fire("mobile_app_notification_action", {"action": "OTHER"})
    hass.bus.async_fire(
        "mobile_app_notification_action", {"action": "VIRTUAL_PET:nope:feed"}
    )
    await hass.async_block_till_done()


async def test_diagnostics_hide_the_house_and_the_people(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    hass_storage[STORE_KEY] = hatched_pet(
        now,
        notify_users=["user-1"],
        care_log=[{"at": now, "action": "feed", "by": "Alex", "result": "ok"}],
        from_later={"friend": "user-2"},  # a later version's key, after a downgrade
    )
    config = await setup_with_house(
        hass, weather="weather.home", tv=["media_player.tv"]
    )
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert diag["pet"]["from_later"] == "**REDACTED**"
    assert diag["options"]["weather"] == "**REDACTED**"
    assert diag["options"]["tv"] == "**REDACTED**"
    assert diag["pet"]["notify_users"] == "**REDACTED**"
    assert diag["pet"]["care_log"][0]["by"] == "**REDACTED**"
    assert diag["now"]["stage"] == "child"
    assert "Alex" not in str(diag) and "user-1" not in str(diag)
    assert "user-2" not in str(diag)

    # Nor what the house was doing: what's on, the news, who's home.
    pet = config.runtime_data
    pet.debug["home"] = {"readings": {"tv_title": "Secret Show", "company": 2}}
    pet.moments.append({"type": "watching", "title": "Secret Show", "at": now})
    pet.moments.append({"type": "news", "headline": "Local news", "at": now})
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert "Secret Show" not in str(diag) and "Local news" not in str(diag)
    assert diag["calculation"]["home"]["readings"]["company"] == "**REDACTED**"


async def test_repairs_warn_about_entities_that_are_gone(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from homeassistant.helpers import issue_registry as ir

    hass.states.async_set("weather.home", "sunny")
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup_with_house(
        hass, weather="weather.home", tv=["media_player.gone"]
    )
    issue = ir.async_get(hass).async_get_issue(DOMAIN, "missing_entities_test_pet")
    assert issue is not None
    assert issue.translation_placeholders == {
        "pet": "Pip",
        "entities": "media_player.gone",
    }
    # Fixing the options clears it (the entry reloads).
    hass.config_entries.async_update_entry(config, options={"weather": "weather.home"})
    await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    assert (
        ir.async_get(hass).async_get_issue(DOMAIN, "missing_entities_test_pet") is None
    )


async def test_repairs_warn_about_a_world_without_creatures(
    hass: HomeAssistant, now: float
) -> None:
    from homeassistant.helpers import issue_registry as ir

    await hass.config.async_set_time_zone("UTC")
    config = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "world": "atlantis", "new_pet": True},
        entry_id="test_pet",
    )
    config.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    assert ir.async_get(hass).async_get_issue(DOMAIN, "world_not_ready_test_pet")
    await hass.config_entries.async_remove(config.entry_id)
    assert not ir.async_get(hass).async_get_issue(DOMAIN, "world_not_ready_test_pet")


async def test_reconfigure_renames_and_moves_an_egg_now(
    hass: HomeAssistant, now: float
) -> None:
    config = await setup(hass)  # a fresh egg
    result = await config.start_reconfigure_flow(hass)
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Fern", "world": "tidepool"}
    )
    assert result["reason"] == "reconfigure_successful"
    await hass.async_block_till_done()
    assert config.title == "Fern"
    assert config.data["world"] == "tidepool" and "next_world" not in config.data
    # Entity IDs stay; the pet answers to its new name.
    assert hass.states.get("sensor.pip_life_stage").attributes["world"] == "tidepool"


async def test_reconfigure_moves_a_hatched_pet_with_its_next_egg(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    age = 14 * 24 + 7 * 24 + 1.0
    hass_storage[STORE_KEY] = hatched_pet(
        now, age_hours=age, born=now - age * 3600, species="bird", raised=["bird"]
    )
    config = await setup(hass)
    result = await config.start_reconfigure_flow(hass)
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Pip", "world": "pond"}
    )
    await hass.async_block_till_done()
    assert config.data["world"] == "woodland" and config.data["next_world"] == "pond"
    stage = hass.states.get("sensor.pip_life_stage")
    assert stage.attributes["world"] == "woodland"
    assert stage.attributes["next_world"] == "Pond"

    await press(hass, "button.pip_lay_egg")
    await hass.async_block_till_done()
    assert config.data["world"] == "pond" and "next_world" not in config.data
    stage = hass.states.get("sensor.pip_life_stage")
    assert stage.state == "egg"
    assert stage.attributes["world"] == "pond"
    assert stage.attributes["next_world"] is None
    assert stage.attributes["generation"] == 2


async def test_renaming_a_pet_from_before_worlds_keeps_its_world(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, species="treefrog", raised=["treefrog"])
    await hass.config.async_set_time_zone("UTC")
    config = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={
            CONF_NAME: "Pip",
            "species": "treefrog",
            "new_pet": True,
        },  # no world stored
        entry_id="test_pet",
    )
    config.add_to_hass(hass)
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    result = await config.start_reconfigure_flow(hass)
    shown = {str(k): k.default() for k in result["data_schema"].schema}
    assert shown["world"] == "pond"
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Fern", "world": shown["world"]}
    )
    await hass.async_block_till_done()
    assert config.title == "Fern" and "next_world" not in config.data


async def test_the_pet_comments_on_whats_on_tv(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass, tv=["media_player.tv"])
    hass.states.async_set(
        "media_player.tv",
        "playing",
        {"media_content_type": "tvshow", "media_series_title": "Bluey"},
    )
    await settle(hass, freezer)
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    # (The day's wish may be "watch TV together": then it comes true just after.)
    watching = [m for m in moments if m["type"] == "watching"]
    assert watching and watching[0]["title"] == "Bluey"


async def pick(hass: HomeAssistant, option: str) -> None:
    await hass.services.async_call(
        "select",
        "select_option",
        {"entity_id": "select.pip_next_egg", "option": option},
        blocking=True,
    )


async def test_next_egg_choice_decides_the_hatch(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    config = await setup(hass)
    choice = hass.states.get("select.pip_next_egg")
    assert choice.state == "Surprise me"
    assert choice.attributes["options"] == [
        "Surprise me",
        "Bird",
        "Douglas squirrel",
        "Black-tailed deer",
        "Red fox",
        "Banana slug",
    ]
    entry = er.async_get(hass).async_get("select.pip_next_egg")
    assert entry.entity_category is er.EntityCategory.CONFIG
    await pick(hass, "Black-tailed deer")
    assert hass.states.get("sensor.pip_life_stage").attributes["next_egg"] == (
        "Black-tailed deer"
    )
    # The choice is saved with the pet.
    assert await hass.config_entries.async_unload(config.entry_id)
    await hass.async_block_till_done()
    assert hass_storage[STORE_KEY]["data"]["egg_choice"] == "deer"
    assert await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("select.pip_next_egg").state == "Black-tailed deer"

    hatched = async_capture_events(hass, f"{DOMAIN}_hatched")
    await hass.services.async_call(DOMAIN, "fast_forward", {"hours": 1}, blocking=True)
    assert hatched[0].data["species"] == "deer"
    # One choice, one egg: the next one is a surprise again.
    assert hass.states.get("select.pip_next_egg").state == "Surprise me"
    assert hass.states.get("sensor.pip_life_stage").attributes["next_egg"] is None


async def test_next_egg_offers_the_new_world_while_a_move_waits(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    age = 14 * 24 + 7 * 24 + 1.0
    hass_storage[STORE_KEY] = hatched_pet(
        now, age_hours=age, born=now - age * 3600, species="bird", raised=["bird"]
    )
    config = await setup(hass)
    result = await config.start_reconfigure_flow(hass)
    await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Pip", "world": "pond"}
    )
    await hass.async_block_till_done()
    choice = hass.states.get("select.pip_next_egg")
    assert choice.attributes["options"] == [
        "Surprise me",
        "Pacific tree frog",
        "Axolotl",
        "Western pond turtle",
        "Mallard duckling",
        "Beaver",
    ]
    await pick(hass, "Axolotl")
    await press(hass, "button.pip_lay_egg")
    await hass.async_block_till_done()
    assert config.data["world"] == "pond"
    assert hass.states.get("select.pip_next_egg").state == "Axolotl"
    hatched = async_capture_events(hass, f"{DOMAIN}_hatched")
    await hass.services.async_call(DOMAIN, "fast_forward", {"hours": 1}, blocking=True)
    assert hatched[0].data["species"] == "axolotl"


async def test_a_world_change_drops_a_choice_from_the_old_world(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, species="bird", raised=["bird"])
    config = await setup(hass)
    await pick(hass, "Douglas squirrel")
    result = await config.start_reconfigure_flow(hass)
    await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Pip", "world": "pond"}
    )
    await hass.async_block_till_done()
    assert hass.states.get("select.pip_next_egg").state == "Surprise me"


async def test_next_egg_rejects_a_creature_it_cannot_hatch(
    hass: HomeAssistant, now: float
) -> None:
    await setup(hass)
    with pytest.raises(ServiceValidationError):
        await pick(hass, "Axolotl")  # another world's creature
    assert hass.states.get("select.pip_next_egg").state == "Surprise me"


async def share_news(
    hass: HomeAssistant, headline: str, **fields: Any
) -> dict[str, Any]:
    return await hass.services.async_call(
        DOMAIN,
        "share_news",
        {"entity_id": "button.pip_feed", "headline": headline, **fields},
        blocking=True,
        return_response=True,
    )


def news_moments(hass: HomeAssistant) -> list[dict[str, Any]]:
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    return [m for m in moments if m["type"] == "news"]


async def test_news_is_a_passing_moment_that_changes_nothing(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0)
    config = await setup(hass)
    assert hass.services.has_service(DOMAIN, "share_news")
    events = async_capture_events(hass, f"{DOMAIN}_news")
    before = config.runtime_data.state.to_dict()

    response = await share_news(hass, "  Tamagotchi\nturns 30! ", topic="Tamagotchi")
    assert response == {"test_pet": "shared"}
    [moment] = news_moments(hass)
    assert moment["headline"] == "Tamagotchi turns 30!"
    assert moment["topic"] == "Tamagotchi"
    assert events[0].data["headline"] == "Tamagotchi turns 30!"
    # The house never hurts the pet, and news doesn't help it either.
    assert config.runtime_data.state.to_dict() == before
    assert hass.states.get("sensor.pip_mood").state != "excited"


async def test_news_waits_its_turn(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    from custom_components.virtual_pet import rates as R

    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    assert await share_news(hass, "Neopets is back") == {"test_pet": "shared"}
    assert await share_news(hass, "Digimon news") == {"test_pet": "too_soon"}
    freezer.tick(timedelta(minutes=R.NEWS_COOLDOWN_MINUTES - 1))
    assert await share_news(hass, "Digimon news") == {"test_pet": "too_soon"}
    freezer.tick(timedelta(minutes=2))
    assert await share_news(hass, "Digimon news") == {"test_pet": "shared"}
    assert [m["headline"] for m in news_moments(hass)] == [
        "Digimon news",
        "Neopets is back",
    ]


async def test_news_never_wakes_the_pet(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, asleep=True)
    config = await setup(hass)
    before = config.runtime_data.state.to_dict()
    assert await share_news(hass, "Tamagotchi turns 30!") == {"test_pet": "asleep"}
    assert news_moments(hass) == []
    assert config.runtime_data.state.to_dict() == before
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_ON
    # Dropped, not queued, and it doesn't use up the cooldown either.
    config.runtime_data.state.asleep = False
    assert await share_news(hass, "Later news") == {"test_pet": "shared"}
    assert [m["headline"] for m in news_moments(hass)] == ["Later news"]


async def test_news_sees_sleep_that_came_since_the_last_tick(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # It drops off between ticks: news a few minutes later finds it asleep,
    # even before the next tick has run.
    hass_storage[STORE_KEY] = hatched_pet(now, energy=0.1)
    await setup(hass)
    freezer.tick(timedelta(minutes=7))  # worn out, it drops off (no tick yet)
    assert await share_news(hass, "Late news") == {"test_pet": "asleep"}
    assert news_moments(hass) == []


async def test_news_reaches_the_pets_that_are_there(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    response = await hass.services.async_call(
        DOMAIN,
        "share_news",
        {"entity_id": ["sensor.gone", "button.pip_feed"], "headline": "Hi"},
        blocking=True,
        return_response=True,
    )
    assert response == {"test_pet": "shared"}
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            "share_news",
            {"entity_id": ["sensor.gone"], "headline": "Hi"},
            blocking=True,
            return_response=True,
        )


async def test_news_skips_eggs_and_keeps_away_private(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, away=True)
    config = await setup(hass)
    assert await share_news(hass, "News") == {"test_pet": "asleep"}  # privacy
    config.runtime_data.state.away = False
    config.runtime_data.state.age_hours = 0.0
    assert await share_news(hass, "News") == {"test_pet": "egg"}
    assert news_moments(hass) == []


async def test_news_headline_is_capped_and_required(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from homeassistant.exceptions import HomeAssistantError
    import voluptuous as vol

    from custom_components.virtual_pet import rates as R

    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    await share_news(hass, "Tamagotchi " * 30, topic="Virtual pets everywhere")
    [moment] = news_moments(hass)
    assert len(moment["headline"]) <= R.NEWS_HEADLINE_MAX
    assert moment["headline"].endswith("…")
    assert len(moment["topic"]) <= R.NEWS_TOPIC_MAX
    with pytest.raises((vol.Invalid, HomeAssistantError)):
        await share_news(hass, "   ")


# --- Weather talk -----------------------------------------------------------


def forecast_service(hass: HomeAssistant, days: list[dict[str, Any]]) -> list[Any]:
    """A stand-in weather.get_forecasts; returns the list of calls."""
    calls: list[Any] = []

    async def get_forecasts(call: ServiceCall) -> ServiceResponse:
        calls.append(call)
        return {"weather.home": {"forecast": days}}

    hass.services.async_register(
        "weather",
        "get_forecasts",
        get_forecasts,
        supports_response=SupportsResponse.ONLY,
    )
    return calls


def moments(hass: HomeAssistant) -> list[dict[str, Any]]:
    return hass.states.get("sensor.pip_last_care").attributes["moments"]


async def test_tomorrows_forecast_before_bed_in_the_owners_unit(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-26 19:50:00+00:00")  # just over 3 h before bedtime
    now = dt_util.utcnow().timestamp()
    hass.config.units = US_CUSTOMARY_SYSTEM
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("weather.home", "cloudy", {"temperature_unit": "°F"})
    calls = forecast_service(
        hass,
        [
            {
                "datetime": "2026-10-26T12:00:00+00:00",
                "condition": "cloudy",
                "temperature": 50,
            },
            {
                "datetime": "2026-10-27T12:00:00+00:00",
                "condition": "snowy",
                "temperature": 30,
                "templow": 20,
            },
        ],
    )
    await setup_with_house(hass, weather="weather.home")
    await hass.async_block_till_done(wait_background_tasks=True)
    assert len(calls) == 1

    # Not yet: too early in the evening for tomorrow's forecast.
    await settle(hass, freezer, 5 * 60)
    assert not [m for m in moments(hass) if m["type"] == "forecast"]
    await settle(hass, freezer, 6 * 60)
    talk = [m for m in moments(hass) if m["type"] == "forecast"]
    assert len(talk) == 1
    assert talk[0]["when"] == "tomorrow" and talk[0]["kind"] == "snow"
    assert talk[0]["high"] == 30 and talk[0]["low"] == 20  # °F, as the owner sees
    # Once an evening, and the forecast is fetched at most hourly.
    for _ in range(6):
        await settle(hass, freezer, 5 * 60)
    assert len([m for m in moments(hass) if m["type"] == "forecast"]) == 1
    assert len(calls) == 1


async def test_no_forecast_service_means_no_forecast_talk(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-26 21:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    hass.states.async_set("weather.home", "cloudy")
    await setup_with_house(hass, weather="weather.home")
    await hass.async_block_till_done(wait_background_tasks=True)
    await settle(hass, freezer, 5 * 60)
    assert not [m for m in moments(hass) if m["type"] == "forecast"]


async def test_todays_forecast_follows_good_morning(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-26 08:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    hass.states.async_set("weather.home", "cloudy")
    hass.states.async_set("binary_sensor.hall", "off")
    forecast_service(
        hass,
        [
            {
                "datetime": "2026-10-26T12:00:00+00:00",
                "condition": "sunny",
                "temperature": 33,
            }
        ],
    )
    await setup_with_house(hass, weather="weather.home", motion=["binary_sensor.hall"])
    await hass.async_block_till_done(wait_background_tasks=True)
    hass.states.async_set("binary_sensor.hall", "on")
    await settle(hass, freezer)
    assert [m["type"] for m in moments(hass)][:1] == ["good_morning"]
    await settle(hass, freezer, 5 * 60)
    talk = moments(hass)[0]
    assert talk["type"] == "forecast" and talk["kind"] == "hot"
    assert talk["when"] == "today" and talk["high"] == 33


async def test_wind_speed_reaches_the_mood(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("weather.home", "cloudy", {"wind_speed": 45})
    await setup_with_house(hass, weather="weather.home")
    await settle(hass, freezer)
    assert "windy" in hass.states.get("sensor.pip_mood").attributes["flags"]


async def opted_in_phone(hass: HomeAssistant) -> list[Any]:
    me = await hass.auth.async_create_user("Me")
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "My Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_my_phone")
    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": "sensor.pip_mood", "enabled": True},
        blocking=True,
        context=Context(user_id=me.id),
    )
    return phone


@pytest.mark.parametrize(("day", "expected"), [(31, 1), (30, 0)])
async def test_halloween_morning_greets_the_phones_once(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    day: int,
    expected: int,
) -> None:
    # The hall has been still for an hour, so nobody has stirred yet.
    freezer.move_to(f"2026-10-{day} 07:00:00+00:00")
    hass.states.async_set("binary_sensor.hall", "off")
    freezer.move_to(f"2026-10-{day} 08:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup_with_house(hass, motion=["binary_sensor.hall"])
    phone = await opted_in_phone(hass)
    hass.states.async_set("binary_sensor.hall", "on")
    await settle(hass, freezer)
    await hass.async_block_till_done(wait_background_tasks=True)
    texts = [c.data["message"] for c in phone if "Halloween" in c.data["message"]]
    assert len(texts) == expected
    if expected:
        assert texts[0].startswith("Happy Halloween! Pip is dressed up")
    # Another morning moment the same day sends nothing more.
    hass.states.async_set("binary_sensor.hall", "off")
    await settle(hass, freezer, 20 * 60)
    hass.states.async_set("binary_sensor.hall", "on")
    await settle(hass, freezer)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert len([c for c in phone if "Halloween" in c.data["message"]]) == expected


# --- Daily check-ins --------------------------------------------------------


async def test_the_days_wish_comes_true_when_someone_plays(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=60.0)
    await setup(hass)
    await settle(hass, freezer, 5 * 60)  # the tick picks today's wish
    wish = hass.states.get("sensor.pip_life_stage").attributes["wish"]
    assert wish["kind"] in model.ALWAYS_WISHES
    assert wish["granted"] is False and "by" not in wish
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish["kind"] = "play"  # make it one a button can grant
    await press(hass, "button.pip_play")
    await hass.async_block_till_done()
    assert hass.states.get("sensor.pip_life_stage").attributes["wish"]["granted"]
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert moments[0]["type"] == "wish_granted" and moments[0]["kind"] == "play"


async def test_it_dreams_of_last_nights_show(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-26 20:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup_with_house(hass, tv=["media_player.tv"])
    hass.states.async_set(
        "media_player.tv",
        "playing",
        {"media_content_type": "tvshow", "media_series_title": "Bluey"},
    )
    await settle(hass, freezer)
    hass.states.async_set("media_player.tv", "off")
    # Through the night (it goes to bed at 23:00) to the morning (wake 07:00).
    for _ in range(12 * 12):
        await settle(hass, freezer, 5 * 60)
    dream = hass.states.get("sensor.pip_life_stage").attributes["dream"]
    assert dream == {"kind": "watching", "title": "Bluey"}
    # The title is the house's business: diagnostics leave it out.
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    diag = await async_get_config_entry_diagnostics(hass, entry)
    assert "Bluey" not in str(diag)


# --- Bonds ------------------------------------------------------------------


async def visit(hass: HomeAssistant, user_id: str) -> None:
    await hass.services.async_call(
        DOMAIN,
        "visit",
        {"entity_id": "sensor.pip_mood"},
        blocking=True,
        context=Context(user_id=user_id),
    )


async def test_each_person_has_their_own_bond(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0)
    await setup(hass)
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    other = await hass.auth.async_create_user("Other", group_ids=["system-admin"])
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish["kind"] = "bath"  # a wish nobody here grants
    await visit(hass, me.id)
    await visit(hass, me.id)  # again within the hour: nothing more
    bonds = hass.states.get("sensor.pip_life_stage").attributes["bonds"]
    assert bonds == {me.id: {"level": 1}}
    assert coordinator.state.bonds[me.id]["points"] == model.R.BOND_VISIT_POINTS
    # Care by the other person counts for them alone.
    for _ in range(2):
        await hass.services.async_call(
            "button",
            "press",
            {"entity_id": "button.pip_praise"},
            blocking=True,
            context=Context(user_id=other.id),
        )
    assert coordinator.state.bonds[other.id]["points"] == 2 * model.R.BOND_CARE_POINTS
    assert coordinator.state.bonds[me.id]["points"] == model.R.BOND_VISIT_POINTS
    # A game played together.
    for _ in range(5):
        await hass.services.async_call(
            DOMAIN,
            "play_game",
            {"entity_id": "button.pip_feed", "guess": "left"},
            blocking=True,
            return_response=True,
            context=Context(user_id=me.id),
        )
    bond = coordinator.state.bonds[me.id]
    assert bond["points"] == model.R.BOND_VISIT_POINTS + model.R.BOND_GAME_POINTS
    assert bond["games"] == {"left_right": 1}
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert {"type": "bond_up", "user": me.id, "level": 2}.items() <= moments[0].items()
    # Automations and system users build no bond.
    await press(hass, "button.pip_snack")
    system = await hass.auth.async_create_system_user("Automation")
    await visit(hass, system.id)
    assert set(coordinator.state.bonds) == {me.id, other.id}


async def test_an_afternoon_visit_grants_the_say_hi_wish(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=60.0)
    await setup(hass)
    await settle(hass, freezer, 5 * 60)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish["kind"] = "say_hi"
    me = await hass.auth.async_create_user("Me")
    await visit(hass, me.id)  # 14:00, the afternoon
    assert coordinator.state.wish["granted"] and coordinator.state.wish["by"] == "Me"
    assert coordinator.state.bonds[me.id]["points"] == (
        model.R.BOND_VISIT_POINTS + model.R.BOND_WISH_POINTS
    )


async def test_the_visit_needs_someone_signed_in(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "visit", {"entity_id": "sensor.pip_mood"}, blocking=True
        )


async def test_diagnostics_hide_whose_bond_it_is(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    hass_storage[STORE_KEY] = hatched_pet(
        now, bonds={"user-1": {"points": 40, "nickname": "sunbeam"}}
    )
    config = await setup(hass)
    config.runtime_data.moments.append(
        {"type": "bond_up", "user": "user-1", "level": 5, "at": now}
    )
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert "user-1" not in str(diag) and "sunbeam" not in str(diag)
    assert diag["bond_points"] == [40]


async def test_the_pet_knows_its_friends_on_their_phones_and_at_the_door(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    me = await hass.auth.async_create_user("Me")
    other = await hass.auth.async_create_user("Other")
    hass.states.async_set(
        "person.me", "not_home", {"user_id": me.id, "friendly_name": "Sam Smith"}
    )
    hass.states.async_set("person.other", "not_home", {"user_id": other.id})
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        bonds={
            me.id: {"points": model.R.BOND_LEVELS[4], "nickname": "sunbeam"},
            other.id: {"points": 0},
        },
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    assert coordinator.friends() == {me.id: "Sam"}
    # Phones: the nickname for the friend, plain for everyone else.
    for user, phone in ((me, "mine"), (other, "theirs")):
        MockConfigEntry(
            domain="mobile_app", data={"user_id": user.id, "device_name": phone}
        ).add_to_hass(hass)
    mine = async_mock_service(hass, "notify", "mobile_app_mine")
    theirs = async_mock_service(hass, "notify", "mobile_app_theirs")
    coordinator.state.notify_users = [me.id, other.id]
    coordinator._fire([{"type": "first_frost"}])
    await hass.async_block_till_done(wait_background_tasks=True)
    assert mine[0].data["message"].endswith("of the season, sunbeam.")
    assert theirs[0].data["message"].endswith("of the season.")
    # At the door: a close friend coming home is cheered, once in a while.
    for _ in range(2):
        hass.states.async_set("person.me", "home", {"user_id": me.id})
        hass.states.async_set("person.other", "home", {"user_id": other.id})
        await settle(hass, freezer)
        hass.states.async_set("person.me", "not_home", {"user_id": me.id})
        hass.states.async_set("person.other", "not_home", {"user_id": other.id})
        await settle(hass, freezer)
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert [m["user"] for m in moments if m["type"] == "friend_home"] == [me.id]


async def test_the_visit_tells_only_its_person_what_it_noticed(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 15:00:00+00:00")
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    phone = MockConfigEntry(domain="mobile_app", data={"user_id": me.id})
    phone.add_to_hass(hass)
    er.async_get(hass).async_get_or_create(
        "sensor",
        "mobile_app",
        "hook_steps",
        config_entry=phone,
        suggested_object_id="my_steps",
    )
    hass.states.async_set("sensor.my_steps", "11234")
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[2], "since": "2026-09-28"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish["kind"] = "bath"

    async def look() -> list[dict[str, Any]]:
        response = await hass.services.async_call(
            DOMAIN,
            "visit",
            {"entity_id": "sensor.pip_mood"},
            blocking=True,
            return_response=True,
            context=Context(user_id=me.id),
        )
        return response["notes"]

    # A month of friendship today; "my day" is off until they turn it on.
    assert await look() == [{"kind": "friends_for", "months": 1}]
    await hass.services.async_call(
        DOMAIN,
        "my_day",
        {"entity_id": "sensor.pip_mood", "enabled": True},
        blocking=True,
        context=Context(user_id=me.id),
    )
    # The switch is theirs alone: on the visit's response, not on a state.
    bonds = hass.states.get("sensor.pip_life_stage").attributes["bonds"]
    assert "my_day" not in bonds[me.id]
    freezer.tick(timedelta(hours=1))
    assert await look() == [{"kind": "steps", "steps": 11000}]
    freezer.tick(timedelta(hours=1))
    assert await look() == []  # each once a day


async def test_tucked_in_says_goodnight_and_thanks_in_the_morning(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 21:00:00+00:00")
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    await hass.services.async_call(
        "switch",
        "turn_on",
        {"entity_id": "switch.pip_lights_out"},
        blocking=True,
        context=Context(user_id=me.id),
    )
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert any(m["type"] == "tucked_in" and m["user"] == me.id for m in moments)
    # The morning after, awake: a thank-you, once.
    freezer.move_to("2026-10-29 08:00:00+00:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    await coordinator.async_set_lights_out(False)
    assert coordinator._awake()
    notes = await coordinator.async_visit(me.id)
    assert {"kind": "tucked_in"} in notes["notes"]
    coordinator._visits.clear()
    assert {"kind": "tucked_in"} not in (await coordinator.async_visit(me.id))["notes"]


async def test_beating_your_own_best_game_is_noticed(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(
        now, bonds={me.id: {"points": 0, "best": {"left_right": -1}}}
    )
    await setup(hass)
    for _ in range(5):
        await hass.services.async_call(
            DOMAIN,
            "play_game",
            {"entity_id": "button.pip_feed", "guess": "left"},
            blocking=True,
            return_response=True,
            context=Context(user_id=me.id),
        )
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    record = next(m for m in moments if m["type"] == "bond_record")
    assert record["user"] == me.id and record["game"] == "left_right"


# --- Bond connections (people.py) ------------------------------------------------


async def friend(hass: HomeAssistant, points: int, **person: Any) -> Any:
    """A signed-in person with a person entity, a phone and a close bond."""
    me = await hass.auth.async_create_user("Sam Smith", group_ids=["system-admin"])
    hass.states.async_set(
        "person.sam", "home", {"user_id": me.id, "friendly_name": "Sam Smith"}
    )
    return me


async def look(hass: HomeAssistant, user_id: str, queued: int = 0) -> dict[str, Any]:
    return await hass.services.async_call(
        DOMAIN,
        "visit",
        {"entity_id": "sensor.pip_mood", "queued": queued},
        blocking=True,
        return_response=True,
        context=Context(user_id=user_id),
    )


async def test_back_from_the_gym_then_how_was_your_day(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 17:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[3], "since": "2026-10-28"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish["kind"] = "bath"
    coordinator.people.person(me.id)["my_day"] = True
    coordinator.people.person(me.id).update(
        likes={"fav_weather": "sun", "fav_season": "autumn"}, birthday_skipped=True
    )  # asked before
    for place in ("not_home", "Gym", "not_home", "home"):
        hass.states.async_set("person.sam", place, {"user_id": me.id})
        await settle(hass, freezer, 60)
    response = await look(hass, me.id)
    assert {"kind": "back_from", "place": "gym"} in response["notes"]
    assert response["ask"] == "how_day"
    # Said once; asked once; nothing private on any state.
    coordinator._visits.clear()
    again = await look(hass, me.id)
    assert again["notes"] == [] and again["ask"] is None
    for state in hass.states.async_all():
        assert "Gym" not in str(state.attributes), state.entity_id


async def test_a_hospital_is_never_named(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 17:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[3], "since": "2026-10-28"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.people.person(me.id)["my_day"] = True
    for place in ("not_home", "Hospital", "not_home", "home"):
        hass.states.async_set("person.sam", place, {"user_id": me.id})
        await settle(hass, freezer, 60)
    response = await look(hass, me.id)
    assert not any(n["kind"] == "back_from" for n in response["notes"])


async def test_a_send_off_on_a_rainy_morning_a_few_times_a_week(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    from custom_components.virtual_pet.home import DayForecast

    freezer.move_to("2026-10-26 08:00:00+00:00")
    me = await friend(hass, 0)
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "Sams Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_sams_phone")
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        notify_users=[me.id],
        bonds={me.id: {"points": model.R.BOND_LEVELS[4], "nickname": "sunbeam"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data

    async def leave_and_return() -> None:
        hass.states.async_set("person.sam", "not_home", {"user_id": me.id})
        await settle(hass, freezer, 60)
        hass.states.async_set("person.sam", "home", {"user_id": me.id})
        await settle(hass, freezer, 60)
        await hass.async_block_till_done(wait_background_tasks=True)

    def rainy() -> None:
        today = dt_util.now().date().isoformat()
        coordinator.forecast[today] = DayForecast(condition="rainy")

    rainy()
    await leave_and_return()
    assert phone == []  # "my day" is off
    coordinator.people.person(me.id)["my_day"] = True
    await leave_and_return()
    assert [c.data["message"] for c in phone] == [
        "Pip says: rain today, take an umbrella, sunbeam ☂"
    ]
    assert phone[0].data["data"]["push"] == {"interruption-level": "passive"}
    await leave_and_return()
    assert len(phone) == 1  # once a day
    for day in range(1, 5):
        freezer.move_to(f"2026-10-{26 + day} 08:00:00+00:00")
        rainy()
        await leave_and_return()
    assert len(phone) == model.R.SENDOFF_PER_WEEK


async def test_answers_are_kept_per_person_and_checked(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    # The real clock: the websocket's token is issued now, not on a frozen day.
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    client = await hass_ws_client(hass)
    bus = async_capture_events(hass, "call_service")
    await client.send_json_auto_id(
        {
            "type": "virtual_pet/answer",
            "entity_id": "sensor.pip_mood",
            "question": "fav_weather",
            "answer": "snow",
        }
    )
    assert (await client.receive_json())["success"]
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    person = coordinator.people.person(hass_admin_user.id)
    assert person["likes"] == {"fav_weather": "snow"}
    await client.send_json_auto_id(
        {
            "type": "virtual_pet/answer",
            "entity_id": "sensor.pip_mood",
            "question": "fav_weather",
            "answer": "hail",
        }
    )
    assert not (await client.receive_json())["success"]
    # Not on the bus (the recorder never sees an answer), nor on any state.
    assert bus == []
    assert "fav_weather" not in str(hass.states.get("sensor.pip_life_stage").attributes)


async def test_a_guess_about_tomorrow_is_judged_the_next_evening(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 20:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[2], "since": "2026-10-28"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    await coordinator.async_answer(me.id, "guess", "rain")
    coordinator.people.saw_weather("2026-10-29", {"rain"})
    freezer.move_to("2026-10-29 19:00:00+00:00")
    coordinator._visits.clear()
    notes = (await coordinator.async_visit(me.id))["notes"]
    assert {"kind": "guess", "guess": "rain", "outcome": "right"} in notes


async def test_tonights_dream_is_the_one_they_picked(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 21:00:00+00:00")
    me = await friend(hass, 0)
    other = await hass.auth.async_create_user("Other", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    await coordinator.async_answer(me.id, "dream", "sea")
    # Through the night to the morning.
    for _ in range(11 * 12):
        await settle(hass, freezer, 5 * 60)
    assert hass.states.get("sensor.pip_life_stage").attributes["dream"] == {
        "kind": "picked"
    }
    notes = (await coordinator.async_visit(me.id))["notes"]
    assert {"kind": "dream", "pick": "sea", "yours": True} in notes
    notes = (await coordinator.async_visit(other.id))["notes"]
    assert {"kind": "dream", "pick": "sea", "yours": False} in notes


async def test_up_before_the_sun_while_it_sleeps(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 05:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        asleep=True,
        bonds={me.id: {"points": model.R.BOND_LEVELS[2]}},
    )
    await setup(hass)
    hass.states.async_set("sun.sun", "below_horizon")
    assert (await look(hass, me.id))["notes"] == [{"kind": "up_early"}]
    assert (await look(hass, me.id))["notes"] == []  # once


async def test_an_early_alarm_gets_a_sleep_well(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 20:00:00+00:00")
    me = await friend(hass, 0)
    phone = MockConfigEntry(domain="mobile_app", data={"user_id": me.id})
    phone.add_to_hass(hass)
    er.async_get(hass).async_get_or_create(
        "sensor",
        "mobile_app",
        "hook_next_alarm",
        config_entry=phone,
        suggested_object_id="sams_next_alarm",
    )
    hass.states.async_set(
        "sensor.sams_next_alarm",
        "2026-10-29T04:45:00+00:00",
        {"Package": "com.google.android.deskclock"},
    )
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[2]}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.people.person(me.id)["my_day"] = True
    notes = (await look(hass, me.id))["notes"]
    assert {"kind": "early_alarm"} in notes
    # Another app's reminder isn't an alarm.
    hass.states.async_set(
        "sensor.sams_next_alarm",
        "2026-10-29T04:45:00+00:00",
        {"Package": "com.example.calendar"},
    )
    coordinator.people.person(me.id)["noted"] = {}
    coordinator._visits.clear()
    assert {"kind": "early_alarm"} not in (await look(hass, me.id))["notes"]


async def test_coming_home_in_the_rain(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.bonds["u1"] = {"points": model.R.BOND_LEVELS[3]}
    coordinator._weather_now = {"rain"}
    events = coordinator._friends_home(["u1"], now)
    assert events == [{"type": "friend_home", "user": "u1", "weather": "wet"}]
    coordinator._weather_now, coordinator._outdoor_c = set(), -2.0
    coordinator._cheered.clear()
    assert coordinator._friends_home(["u1"], now)[0]["weather"] == "cold"


async def test_coming_home_from_anywhere_still_counts_the_visit(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    """Audit: no zone at all used to crash the visit for two hours."""
    freezer.move_to("2026-10-28 17:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[3], "since": "2026-10-28"}},
    )
    config = await setup(hass)
    config.runtime_data.people.person(me.id).update(
        likes={"fav_weather": "sun", "fav_season": "autumn"}, birthday_skipped=True
    )  # asked before
    hass.states.async_set("person.sam", "not_home", {"user_id": me.id})
    await settle(hass, freezer, 60)
    hass.states.async_set("person.sam", "home", {"user_id": me.id})
    await settle(hass, freezer, 60)
    response = await look(hass, me.id)
    assert response["counted"] and response["ask"] == "how_day"


async def test_yesterdays_gym_doesnt_explain_todays_errand(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 17:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[3], "since": "2026-10-28"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.people.person(me.id)["my_day"] = True
    for place in ("not_home", "Gym", "not_home", "home"):
        hass.states.async_set("person.sam", place, {"user_id": me.id})
        await settle(hass, freezer, 60)
    assert {"kind": "back_from", "place": "gym"} in (await look(hass, me.id))["notes"]
    freezer.move_to("2026-10-29 12:00:00+00:00")
    for place in ("not_home", "home"):  # to the shop and back
        hass.states.async_set("person.sam", place, {"user_id": me.id})
        await settle(hass, freezer, 60)
    response = await look(hass, me.id)
    assert not any(n["kind"] == "back_from" for n in response["notes"])


async def test_a_guess_waits_when_two_lines_came_first(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 20:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[2], "since": "2026-09-29"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    await coordinator.async_answer(me.id, "guess", "rain")
    coordinator.people.saw_weather("2026-10-29", {"rain"})
    freezer.move_to("2026-10-29 19:00:00+00:00")
    coordinator.state.dream = {
        "kind": "picked",
        "pick": "sea",
        "user": me.id,
        "day": "2026-10-29",
    }
    coordinator._visits.clear()
    first = (await coordinator.async_visit(me.id))["notes"]
    assert [n["kind"] for n in first] == ["friends_for", "dream"]
    coordinator._visits.clear()
    second = (await coordinator.async_visit(me.id))["notes"]
    assert second == [{"kind": "guess", "guess": "rain", "outcome": "right"}]


async def test_two_pets_looked_at_together_say_a_person_line_once(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio

    freezer.move_to("2026-10-28 17:00:00+00:00")
    await hass.config.async_set_time_zone("UTC")
    me = await friend(hass, 0)
    pets = []
    for entry_id, name in (("test_pet", "Pip"), ("other_pet", "Bo")):
        hass_storage[f"{DOMAIN}.{entry_id}"] = {
            **hatched_pet(
                dt_util.utcnow().timestamp(),
                bonds={me.id: {"points": model.R.BOND_LEVELS[3]}},
            ),
            "key": f"{DOMAIN}.{entry_id}",
        }
        hass_storage[f"{DOMAIN}.{entry_id}"]["data"]["name"] = name
        config = MockConfigEntry(
            domain=DOMAIN,
            title=name,
            data={CONF_NAME: name, "new_pet": True},
            entry_id=entry_id,
        )
        config.add_to_hass(hass)
        assert await hass.config_entries.async_setup(config.entry_id)
        await hass.async_block_till_done()
        pets.append(config.runtime_data)
        pets[-1].state.wish = None
    pets[0].people.person(me.id)["my_day"] = True
    pets[0].people.person(me.id).update(
        likes={"fav_weather": "sun", "fav_season": "autumn"}, birthday_skipped=True
    )  # asked before
    # Reading the phones' history awaits the recorder: let the other pet run then.
    from custom_components.virtual_pet import wellbeing

    async def slow_read_day(*args: Any) -> Any:
        await asyncio.sleep(0)
        return wellbeing.Day()

    monkeypatch.setattr(wellbeing, "read_day", slow_read_day)
    for place in ("not_home", "Gym", "not_home", "home"):
        hass.states.async_set("person.sam", place, {"user_id": me.id})
        await settle(hass, freezer, 60)
    both = await asyncio.gather(*(p.async_visit(me.id) for p in pets))
    zone_lines = [n for r in both for n in r["notes"] if n["kind"] == "back_from"]
    assert len(zone_lines) == 1
    assert [r["ask"] for r in both].count("how_day") == 1  # one question, one pet


async def test_diagnostics_hide_a_wish_aimed_at_someone(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup(hass)
    config.runtime_data.state.wish = {
        "kind": "play",
        "day": "2026-10-26",
        "granted": False,
        "for": "user-9",
        "for_name": "Samwise",
    }
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert "user-9" not in str(diag) and "Samwise" not in str(diag)


async def test_a_non_admin_answers_for_themselves(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_read_only_user: Any,
    hass_read_only_access_token: str,
    hass_admin_user: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json_auto_id(
        {
            "type": "virtual_pet/answer",
            "entity_id": "sensor.pip_mood",
            "question": "fav_season",
            "answer": "winter",
        }
    )
    assert (await client.receive_json())["success"]
    people = hass.data[DOMAIN]["people"]
    assert people.person(hass_read_only_user.id)["likes"] == {"fav_season": "winter"}
    assert "likes" not in people.person(hass_admin_user.id)


async def test_tucking_it_in_grants_the_tuck_in_wish_to_them(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 21:00:00+00:00")
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish = {"kind": "tuck_in", "day": "2026-10-28", "granted": False}
    await hass.services.async_call(
        "switch",
        "turn_on",
        {"entity_id": "switch.pip_lights_out"},
        blocking=True,
        context=Context(user_id=me.id),
    )
    assert coordinator.state.wish["granted"]
    assert coordinator.state.bonds[me.id]["points"] == model.R.BOND_WISH_POINTS


async def test_a_look_has_room_for_three_lines(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    """The card says how many lines it queued; the notes fill what's left, and
    the question comes only with room for it."""
    # 20:30 on a dream day of the rotation, near bedtime: that question is due.
    freezer.move_to("2026-10-29 20:30:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        bonds={me.id: {"points": model.R.BOND_LEVELS[2], "since": "2026-09-29"}},
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish = None
    picked = {"kind": "picked", "pick": "sea", "user": me.id, "day": "2026-10-29"}
    coordinator.state.dream = dict(picked)
    first = await coordinator.async_visit(me.id, queued=2)
    assert len(first["notes"]) == 1 and first["ask"] is None  # 2 + 1 = 3: no room
    coordinator._visits.clear()
    second = await coordinator.async_visit(me.id, queued=3)
    assert second["notes"] == [] and second["ask"] is None  # nothing fits: it waits
    coordinator._visits.clear()
    third = await coordinator.async_visit(me.id)
    assert [n["kind"] for n in third["notes"]] == ["dream"]  # nothing was lost
    assert third["ask"] == "dream"  # 0 + 1 < 3: room for the question


async def test_a_wish_is_open_only_while_it_can_come_true(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 15:00:00+00:00")
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish = {"kind": "say_hi", "day": "2026-10-28", "granted": False}
    coordinator.async_set_updated_data(coordinator.state)
    assert hass.states.get("sensor.pip_life_stage").attributes["wish"]["open"] is True
    freezer.move_to("2026-10-28 23:30:00+00:00")  # past bedtime
    coordinator.async_set_updated_data(coordinator.state)
    assert hass.states.get("sensor.pip_life_stage").attributes["wish"]["open"] is False
    # "Tuck me in" comes true at bedtime: it stays open.
    coordinator.state.wish = {"kind": "tuck_in", "day": "2026-10-28", "granted": False}
    coordinator.async_set_updated_data(coordinator.state)
    assert hass.states.get("sensor.pip_life_stage").attributes["wish"]["open"] is True


async def test_a_hatched_pet_picks_a_favourite_snack_and_says_so(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
) -> None:
    # A pet from before favourites picks one at load.
    hass_storage[STORE_KEY] = hatched_pet(now, species="squirrel", hunger=40.0)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    likes = ["hazelnuts", "fir cones", "mushrooms"]
    food = coordinator.state.favourites["snack"]
    assert food in likes
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["favourites"] == {"snack": food}
    coordinator.rng = random.Random()
    coordinator.rng.random = lambda: 0.0  # this snack is its favourite
    await press(hass, "button.pip_snack")
    assert {"type": "favourite_snack", "food": food}.items() <= moments(hass)[0].items()
    await press(hass, "button.pip_snack")  # once a day
    assert [m["type"] for m in moments(hass)].count("favourite_snack") == 1


async def test_an_egg_hatched_by_fast_forward_picks_its_favourite(
    hass: HomeAssistant, now: float
) -> None:
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    assert coordinator.state.favourites == {}
    await hass.services.async_call(DOMAIN, "fast_forward", {"hours": 1}, blocking=True)
    species = coordinator.state.species
    assert coordinator.state.favourites["snack"] in coordinator.likes[species]


async def test_no_favourite_snack_from_a_refused_snack(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, species="squirrel", asleep=True)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.rng.random = lambda: 0.0
    await press(hass, "button.pip_snack")  # asleep: refused
    assert "favourite_snack" not in [m["type"] for m in moments(hass)]
    assert coordinator.state.favourite_said is None


async def test_an_egg_for_the_next_world_picks_from_its_own_likes(
    hass: HomeAssistant, now: float
) -> None:
    config = await setup(hass)
    coordinator = config.runtime_data
    # Likes come from every ready creature, not only this world's roster.
    assert "lunamoth" not in coordinator.roster
    assert coordinator.likes["lunamoth"][0] == "walnut leaves"
    coordinator.state.species = "lunamoth"
    coordinator.state.age_hours = 30.0
    coordinator._pick_favourite()
    assert coordinator.state.favourites["snack"] in coordinator.likes["lunamoth"]


async def test_a_close_friend_gives_it_a_catchphrase_once_a_generation(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        species="squirrel",
        bonds={me: {"points": model.R.BOND_LEVELS[model.R.CATCHPHRASE_LEVEL - 1]}},
    )
    config = await setup(hass)
    coordinator = config.runtime_data
    stage = "sensor.pip_life_stage"
    assert hass.states.get(stage).attributes["catchphrase"] == "acorn"  # its own
    client = await hass_ws_client(hass)

    async def answer(value: str) -> bool:
        await client.send_json_auto_id(
            {
                "type": "virtual_pet/answer",
                "entity_id": "sensor.pip_mood",
                "question": "catchphrase",
                "answer": value,
            }
        )
        return (await client.receive_json())["success"]

    assert not await answer("yay")  # it didn't ask
    assert coordinator._pet_once(me, "2026-10-28") == ("catchphrase",)
    coordinator._catch_ask(me)["asked"].append("2026-10-28")  # asked on a look
    assert await answer("yay")
    await hass.async_block_till_done()
    assert hass.states.get(stage).attributes["catchphrase"] == "yay"
    assert coordinator._pet_once(me, "2026-12-28") == ()  # answered
    assert not await answer("hehe")  # once
    # A new generation asks again; "keep" keeps what it says.
    coordinator.state.generation += 1
    assert coordinator._pet_once(me, "2026-12-28") == ("catchphrase",)
    coordinator._catch_ask(me)["asked"].append("2026-12-28")
    assert await answer("keep")
    assert coordinator.state.catchphrase == "yay"
    # Someone not close enough can't set it, and gets no bond for trying.
    coordinator.state.bonds = {}
    assert not await answer("hehe")
    assert coordinator.state.bonds == {}


async def test_a_hatchling_waits_to_ask_for_a_catchphrase(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        age_hours=2.0,
        bonds={me.id: {"points": model.R.BOND_LEVELS[9]}},  # an inherited bond
    )
    config = await setup(hass)
    assert config.runtime_data._pet_once(me.id, "2026-10-26") == ()


async def test_an_old_pet_learns_its_birthday_at_load(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)  # born 30 hours ago, no birthday yet
    await setup(hass)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["hatched_on"] == "2026-10-25"  # laid 08:00 on the 25th (UTC)
    assert attrs["birthday"] is None


async def test_your_birthday_stays_yours(
    hass: HomeAssistant,
    caplog: pytest.LogCaptureFixture,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    client = await hass_ws_client(hass)
    bus = async_capture_events(hass, MATCH_ALL)

    async def send(msg: dict[str, Any]) -> dict[str, Any]:
        await client.send_json_auto_id({"entity_id": "sensor.pip_mood", **msg})
        return await client.receive_json()

    answer = {"type": "virtual_pet/answer", "question": "birthday"}
    bad = await send({**answer, "answer": "02-30"})
    assert not bad["success"] and "02-30" not in str(bad)  # never echoed
    assert (await send({**answer, "answer": "03-14"}))["success"]
    person = config.runtime_data.people.person(hass_admin_user.id)
    assert person["birthday"] == "03-14"
    # On no state, the bus, the log or in diagnostics.
    assert "03-14" not in str([e.data for e in bus])
    # Our own log (HA's websocket debug log, off by default, prints every message).
    ours = [r.getMessage() for r in caplog.records if "virtual_pet" in r.name]
    assert "03-14" not in str(ours)
    for state in hass.states.async_all():
        assert "03-14" not in str(state.attributes)
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    assert "03-14" not in str(await async_get_config_entry_diagnostics(hass, config))
    toggle = {"type": "virtual_pet/birthday_phone", "enabled": True}
    assert (await send(toggle))["success"]
    assert person["birthday_phone"] is True
    assert (await send({"type": "virtual_pet/forget_birthday"}))["success"]
    assert "birthday" not in person and person["birthday_skipped"]
    assert "birthday_phone" not in person
    assert P.once_due(person, "2026-10-28", 12, 10) != "birthday"  # never again


async def test_one_celebration_a_look_your_birthday_first(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 13:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        hatched_on="2026-07-28",  # 3 months old today
        bonds={me.id: {"points": model.R.BOND_LEVELS[3], "since": "2026-07-28"}},
    )
    config = await setup(hass)
    config.runtime_data.people.person(me.id).update(
        birthday="10-28",
        likes={"fav_weather": "sun", "fav_season": "autumn"},
    )
    response = await look(hass, me.id, queued=3)  # a full look still has room
    assert response["notes"][:1] == [{"kind": "your_birthday", "quiet": False}]
    assert response["made_room"]  # the card drops its away note for it
    assert response["birthday_kept"]
    await settle(hass, freezer, 3601)
    response = await look(hass, me.id)
    # The same number of months: one line for both.
    assert response["notes"][0] == {"kind": "birthday_friends", "months": 3}
    await settle(hass, freezer, 3601)
    kinds = [n["kind"] for n in (await look(hass, me.id))["notes"]]
    assert not {"your_birthday", "birthday_friends", "friends_for"} & set(kinds)


async def test_a_second_generation_says_its_own_age(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 13:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        hatched_on="2026-09-28",  # a month old; friends for longer (a bond inherited)
        bonds={me.id: {"points": model.R.BOND_LEVELS[3], "since": "2026-04-28"}},
    )
    await setup(hass)
    response = await look(hass, me.id)
    assert response["notes"][0] == {"kind": "pet_birthday", "months": 1}


async def test_a_birthday_on_the_phone_once_by_nickname(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 08:00:00+00:00")
    me = await friend(hass, 0)
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "Sams Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_sams_phone")
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        notify_users=[me.id],
        bonds={me.id: {"points": model.R.BOND_LEVELS[4], "nickname": "sunbeam"}},
    )
    config = await setup(hass)
    coordinator = config.runtime_data
    person = coordinator.people.person(me.id)
    person["birthday"] = "10-28"
    coordinator._birthday_morning()  # the phone switch is off by default
    await hass.async_block_till_done(wait_background_tasks=True)
    assert phone == []
    person["birthday_phone"] = True
    coordinator._birthday_morning()
    coordinator._birthday_morning()  # a second morning moment: no second message
    await hass.async_block_till_done(wait_background_tasks=True)
    assert [c.data["message"] for c in phone] == [
        "Pip says: happy birthday, sunbeam! ♥"
    ]


async def test_one_birthday_message_across_pets_from_the_closest(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 08:00:00+00:00")
    await hass.config.async_set_time_zone("UTC")
    me = await friend(hass, 0)
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "Sams Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_sams_phone")
    pets = []
    for entry_id, name, level, nickname in (
        ("test_pet", "Pip", 3, "pal"),
        ("other_pet", "Bo", 6, "sunbeam"),
    ):
        hass_storage[f"{DOMAIN}.{entry_id}"] = {
            **hatched_pet(
                dt_util.utcnow().timestamp(),
                notify_users=[me.id],
                bonds={
                    me.id: {"points": model.R.BOND_LEVELS[level], "nickname": nickname}
                },
            ),
            "key": f"{DOMAIN}.{entry_id}",
        }
        hass_storage[f"{DOMAIN}.{entry_id}"]["data"]["name"] = name
        config = MockConfigEntry(
            domain=DOMAIN,
            title=name,
            data={CONF_NAME: name, "new_pet": True},
            entry_id=entry_id,
        )
        config.add_to_hass(hass)
        assert await hass.config_entries.async_setup(config.entry_id)
        await hass.async_block_till_done()
        pets.append(config.runtime_data)
    pets[0].people.person(me.id).update(birthday="10-28", birthday_phone=True)
    for pet in pets:  # each pet's own morning
        pet._birthday_morning()
    await hass.async_block_till_done(wait_background_tasks=True)
    # Once, from Bo (the closest), by Bo's nickname.
    assert [c.data["message"] for c in phone] == ["Bo says: happy birthday, sunbeam! ♥"]


async def test_a_best_friends_photo_is_theirs_alone(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    me = hass_admin_user.id
    best = model.R.BOND_LEVELS[model.R.BOND_PHOTO_LEVEL - 1]
    theirs = {"name": "Old", "species": "bird", "stage": "adult", "on": "2026-01-02"}
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        species="otter",
        age_hours=130.0,
        generation=2,
        traits=["helper"],
        bonds={
            me: {"points": best},
            "other": {"points": best, "photos": {"1": theirs}},
        },
    )
    config = await setup(hass)
    coordinator = config.runtime_data
    bus = async_capture_events(hass, MATCH_ALL)
    reply = await look(hass, me)
    assert {"kind": "photo"} in reply["notes"]
    assert "photos" not in reply  # only through the photos command
    coordinator._visits.clear()
    assert {"kind": "photo"} not in (await look(hass, me))["notes"]  # said once
    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {"type": "virtual_pet/photos", "entity_id": "sensor.pip_mood"}
    )
    result = (await client.receive_json())["result"]
    assert result == {
        "photos": [
            {
                "generation": 2,
                "name": "Pip",
                "species": "otter",
                "stage": "teen",
                "traits": ["helper"],
                "on": "2026-10-26",
            }
        ]
    }
    # Never on a sensor, the bus or in diagnostics.
    await hass.async_block_till_done()
    bonds = hass.states.get("sensor.pip_life_stage").attributes["bonds"]
    assert "photos" not in str(bonds) and "photos" not in str(bus)
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert "photos" not in str(diag) and "Old" not in str(diag)
    # A new generation's photo is said again, and the first is kept.
    coordinator.state.generation = 3
    coordinator._visits.clear()
    assert {"kind": "photo"} in (await look(hass, me))["notes"]
    assert [p["generation"] for p in coordinator.photos(me)] == [2, 3]


# --- Baby talk (phase 5) ---------------------------------------------------------


async def test_baby_talk_is_each_persons_and_stays_off_the_record(
    hass: HomeAssistant,
    caplog: pytest.LogCaptureFixture,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    other = await hass.auth.async_create_user("Alex", group_ids=["system-admin"])
    assert (await pet.async_visit(hass_admin_user.id))["baby_talk"] is False  # off
    client = await hass_ws_client(hass)
    bus = async_capture_events(hass, MATCH_ALL)

    async def send(entity_id: str, enabled: bool) -> dict[str, Any]:
        await client.send_json_auto_id(
            {
                "type": "virtual_pet/baby_talk",
                "entity_id": entity_id,
                "enabled": enabled,
            }
        )
        return await client.receive_json()

    bad = await send("sensor.nobody_mood", True)
    assert not bad["success"] and "nobody" not in str(bad["error"])  # never echoed
    assert (await send("sensor.pip_mood", True))["success"]
    assert pet.people.person(hass_admin_user.id)["baby_talk"] is True
    assert pet.people.baby_talk(other.id) is False  # two people, independent
    pet.people.person(other.id)["baby_talk"] = "off"  # a hand-edited string is not on
    assert pet.people.baby_talk(other.id) is False
    del pet.people.person(other.id)["baby_talk"]
    pet._visits.clear()
    assert (await pet.async_visit(hass_admin_user.id))["baby_talk"] is True
    assert (await pet.async_visit(other.id))["baby_talk"] is False
    # On no state, the bus, our log or in diagnostics.
    assert "baby_talk" not in str([e.data for e in bus])
    ours = [r.getMessage() for r in caplog.records if "virtual_pet" in r.name]
    assert "baby_talk" not in str(ours)
    for state in hass.states.async_all():
        assert "baby_talk" not in str(state.attributes)
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    assert "baby_talk" not in str(
        await async_get_config_entry_diagnostics(hass, config)
    )
    assert (await send("sensor.pip_mood", False))["success"]
    assert pet.people.baby_talk(hass_admin_user.id) is False


async def test_every_visit_reply_carries_baby_talk(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 12:00:00+00:00")
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    await pet.async_set_baby_talk(me.id, True)
    counted = await pet.async_visit(me.id)
    assert counted["counted"] and counted["baby_talk"] is True
    too_soon = await pet.async_visit(me.id)  # the second look within the hour
    assert not too_soon["counted"] and too_soon["baby_talk"] is True
    await pet.async_set_lights_out(True)
    pet._visits.clear()
    asleep = await pet.async_visit(me.id)  # a reload at night
    assert not asleep["counted"] and asleep["baby_talk"] is True


async def test_one_baby_talk_switch_for_every_pet(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
) -> None:
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    pets = []
    for entry_id, name in (("test_pet", "Pip"), ("other_pet", "Bo")):
        hass_storage[f"{DOMAIN}.{entry_id}"] = {
            **hatched_pet(now),
            "key": f"{DOMAIN}.{entry_id}",
        }
        hass_storage[f"{DOMAIN}.{entry_id}"]["data"]["name"] = name
        config = MockConfigEntry(
            domain=DOMAIN,
            title=name,
            data={CONF_NAME: name, "new_pet": True},
            entry_id=entry_id,
        )
        config.add_to_hass(hass)
        assert await hass.config_entries.async_setup(config.entry_id)
        await hass.async_block_till_done()
        pets.append(config.runtime_data)
    await pets[0].async_set_baby_talk(me.id, True)
    assert (await pets[1].async_visit(me.id))["baby_talk"] is True  # one store


async def test_calling_is_off_while_asleep_and_the_switch_shows_sleep(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    stored = hatched_pet(now, hunger=24.0, energy=60.0, asleep=True, napping=True)
    stored["data"]["call"] = {
        "reason": "hunger",
        "started": now - 60,
        "deadline": now + 600,
    }
    stored["data"]["latched"] = []
    hass_storage[STORE_KEY] = stored
    await setup(hass)
    calling = hass.states.get("binary_sensor.pip_calling")
    assert calling.state == STATE_OFF
    assert "deadline" not in calling.attributes
    mood = hass.states.get("sensor.pip_mood")
    assert "calling" not in mood.attributes["flags"]
    # Dozed, collapsed or put to bed by the house: the switch shows it asleep.
    assert hass.states.get("switch.pip_lights_out").state == STATE_ON


async def test_lights_out_refused_when_rested(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, energy=100.0)
    await setup(hass)
    await hass.services.async_call(
        "switch", "turn_on", {"entity_id": "switch.pip_lights_out"}, blocking=True
    )
    assert hass.states.get("binary_sensor.pip_asleep").state == STATE_OFF
    assert hass.states.get("switch.pip_lights_out").state == STATE_OFF
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert log[0]["action"] == "lights_out" and log[0]["result"] == "not_sleepy"


async def _notified(hass: HomeAssistant) -> list[ServiceCall]:
    me = await hass.auth.async_create_user("Me")
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "My Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_my_phone")
    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": "sensor.pip_mood", "enabled": True},
        blocking=True,
        context=Context(user_id=me.id),
    )
    return phone


async def test_an_old_latch_recalls_once_in_the_bundle_as_a_normal_push(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # A save from before re-calls: missed and latched, no latched_at.
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=20.0, latched=["hunger"])
    await setup(hass)
    phone = await _notified(hass)
    for _ in range(47):  # nearly 4 hours: nothing yet
        await settle(hass, freezer, 5 * 60)
    assert phone == []
    for _ in range(3):
        await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in phone] == ["Pip is hungry!"]
    data = phone[0].data["data"]
    assert data["tag"] == "virtual_pet_recalls"
    assert "push" not in data and "actions" not in data  # normal, no buttons
    # Fed: the bundle names no pet still asking, so it goes.
    await press(hass, "button.pip_feed")
    await hass.async_block_till_done()
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_recalls"


async def test_a_poop_call_sends_no_push(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, poops=[now - 25 * 60])
    await setup(hass)
    phone = await _notified(hass)
    for _ in range(3):
        await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.pip_calling").state == "on"
    assert phone == []


async def test_falling_ill_sends_one_push(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    from custom_components.virtual_pet import rates as R

    misses = [now - i * 3600 for i in range(R.SICK_MISSES)]
    hass_storage[STORE_KEY] = hatched_pet(now, recent_misses=misses)
    await setup(hass)
    phone = await _notified(hass)
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.pip_calling").state == "on"
    assert [c.data["message"] for c in phone] == ["Pip feels sick. Medicine?"]


async def test_a_poop_call_taking_over_clears_the_call_on_the_phone(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # A plea to play is on the phone (with Scold); a poop call, more urgent,
    # replaces it with no event of its own and sends no push.
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=20.0, poops=[now - 24 * 60])
    await setup(hass)
    phone = await _notified(hass)
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in phone] == ["Pip wants to play!"]
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_test_pet_call"
    assert len(phone) == 2
