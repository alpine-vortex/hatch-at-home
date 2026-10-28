"""The integration inside a test Home Assistant."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant import config_entries
from homeassistant.const import CONF_NAME, STATE_OFF, STATE_ON, STATE_UNAVAILABLE
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

from custom_components.virtual_pet import model
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
    assert [o["value"] for o in worlds] == [
        "woodland",
        "terrarium",
        "hearth",
        "tidepool",
        "pond",
        "nightsky",
    ]
    # The beetle isn't ready yet, so the terrarium lists the gecko and tarantula.
    assert worlds[1]["label"] == "Terrarium: Leopard gecko, Mexican red-knee tarantula"
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
    assert species in attrs["roster"] == ["bird", "squirrel", "deer"]
    assert attrs["species"] == species
    assert attrs["raised"] == [species]


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


# --- Phase 3: the house -----------------------------------------------------


async def setup_with_house(hass: HomeAssistant, **options: Any) -> MockConfigEntry:
    await hass.config.async_set_time_zone("UTC")
    config = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "world": "woodland"},
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
    )
    config = await setup_with_house(
        hass, weather="weather.home", tv=["media_player.tv"]
    )
    diag = await async_get_config_entry_diagnostics(hass, config)
    assert diag["options"]["weather"] == "**REDACTED**"
    assert diag["options"]["tv"] == "**REDACTED**"
    assert diag["pet"]["notify_users"] == "**REDACTED**"
    assert diag["pet"]["care_log"][0]["by"] == "**REDACTED**"
    assert diag["now"]["stage"] == "child"
    assert "Alex" not in str(diag) and "user-1" not in str(diag)

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
        data={CONF_NAME: "Pip", "world": "atlantis"},
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
        data={CONF_NAME: "Pip", "species": "treefrog"},  # no world stored
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
    bonds = hass.states.get("sensor.pip_life_stage").attributes["bonds"]
    assert bonds[me.id]["my_day"] is True
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
