"""The integration inside a test Home Assistant."""

from __future__ import annotations

from datetime import timedelta
import hashlib
import json
import random
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import (
    CONF_NAME,
    EVENT_HOMEASSISTANT_STARTED,
    MATCH_ALL,
    STATE_OFF,
    STATE_ON,
    STATE_UNAVAILABLE,
)
from homeassistant.core import (
    Context,
    CoreState,
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

from custom_components.virtual_pet import model, notify, people as P
from custom_components.virtual_pet.const import DOMAIN

from .test_config_flow import open_topic, save_topic, shown

STORE_KEY = f"{DOMAIN}.test_pet"

# The one-time likes, all answered (the favourite visitor in every world, F4).
ASKED_LIKES = {
    "fav_weather": "sun",
    "fav_season": "autumn",
    **{
        P.fav_visitor_key(w): "x"
        for w in ("woodland", "terrarium", "hearth", "tidepool", "pond", "nightsky")
    },
}


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


def call_texts(reason: str, name: str = "Pip") -> list[list[str]]:
    """A call's phone message as one of its phrasings (E11: one a day by the
    call's start day): each as the one-message list a test compares with."""
    return [[t.format(name=name)] for t in notify.CALLS[reason]]


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
    card = (
        Path(__file__).parents[1]
        / "custom_components/virtual_pet/frontend/hatch-pet-card.js"
    )
    digest = hashlib.sha256(card.read_bytes()).hexdigest()[:8]
    assert (
        f"/virtual_pet/frontend/hatch-pet-card.js?v={VERSION}-{digest}"
        in hass.data[DATA_EXTRA_MODULE_URL].urls
    )


async def _card_url(hass: HomeAssistant) -> str:
    from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL

    await setup(hass)
    (url,) = [u for u in hass.data[DATA_EXTRA_MODULE_URL].urls if "hatch-pet-card" in u]
    return url


async def test_card_url_changes_with_the_card_file(
    hass: HomeAssistant, now: float, tmp_path, monkeypatch
) -> None:
    import custom_components.virtual_pet as vp

    card = tmp_path / "hatch-pet-card.js"
    card.write_text("// one")
    monkeypatch.setattr(vp, "CARD_PATH", card)
    one = vp._card_hash()
    card.write_text("// two")
    assert one and vp._card_hash() and vp._card_hash() != one
    card.write_text("// one")
    assert vp._card_hash() == one
    assert await _card_url(hass) == (
        f"/virtual_pet/frontend/hatch-pet-card.js?v={vp.VERSION}-{one}"
    )


async def test_card_url_falls_back_to_version_without_the_file(
    hass: HomeAssistant, now: float, tmp_path, monkeypatch
) -> None:
    import custom_components.virtual_pet as vp

    monkeypatch.setattr(vp, "CARD_PATH", tmp_path / "missing.js")
    assert (
        await _card_url(hass)
        == f"/virtual_pet/frontend/hatch-pet-card.js?v={vp.VERSION}"
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
    assert result["type"] is FlowResultType.MENU
    for topic, entered in {
        "bedtime": {
            "bedtime": "22:30:00",
            "wake_time": "06:45:00",
            "bedtime_lights": ["light.bed"],
        },
        "weather": {"weather": "weather.home"},
        "people": {"zone": "zone.home"},
        "room": {"tv": ["media_player.tv"]},
    }.items():
        result = await save_topic(hass, config.entry_id, topic, entered)
        assert result["type"] is FlowResultType.CREATE_ENTRY
    # Only the topics that were opened and saved wrote their defaults.
    assert config.options == {
        "bedtime": "22:30:00",
        "wake_time": "06:45:00",
        "bedtime_lights": ["light.bed"],
        "weather": "weather.home",
        "zone": "zone.home",
        "tv": ["media_player.tv"],
        "privacy": True,
        "house_words_private": False,  # H8: house words on the sensor by default
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
    assert mood.attributes["reason"] == "rainy day... a blanket would be nice"
    assert mood.attributes["requests"] == ["blanket"]
    assert hass.states.get("button.pip_blanket").state != STATE_UNAVAILABLE

    await press(hass, "button.pip_blanket")
    assert hass.states.get("sensor.pip_mood").state == "cozy"


async def test_the_house_answers_a_chilly_pet_when_the_heating_comes_on(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("sensor.indoor", "21", {"unit_of_measurement": "°C"})
    hass.states.async_set("input_boolean.fake_heater", "off")
    await setup_with_house(
        hass, indoor_temperature="sensor.indoor", heating="input_boolean.fake_heater"
    )
    heard = async_capture_events(hass, f"{DOMAIN}_house_answered")
    asked = async_capture_events(hass, f"{DOMAIN}_request_answered")
    hass.states.async_set("sensor.indoor", "15", {"unit_of_measurement": "°C"})
    await settle(hass, freezer)
    mood = hass.states.get("sensor.pip_mood")
    assert mood.attributes["requests"] == ["blanket"]

    for cycle in range(3):
        hass.states.async_set("input_boolean.fake_heater", "on")
        await settle(hass, freezer)
        mood = hass.states.get("sensor.pip_mood")
        # Heating on stops the ask for as long as it is on: the pet is cozy.
        assert mood.attributes["requests"] == []
        assert mood.attributes["reason"] == "nice and cozy"
        assert len(heard) == min(cycle + 1, 2)  # two a day, then none
        hass.states.async_set("input_boolean.fake_heater", "off")
        for _ in range(25):  # the comfort runs out
            await settle(hass, freezer, 5 * 60)
    assert [e.data["request"] for e in heard] == ["blanket", "blanket"]
    assert not asked  # nobody pressed anything
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    answered = [m for m in moments if m["type"] == "house_answered"]
    assert len(answered) == 2
    assert set(answered[0]) == {"type", "request", "at"}  # no entity, no more


async def test_a_vacuum_nobody_mapped_is_heard_and_moves_the_pet(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    """H4: every vacuum.* counts. Its state change alone, with nothing else
    changing, reaches the pet within the debounce."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("vacuum.robo", "docked")
    await setup_with_house(hass)
    assert "robot" in hass.states.get("sensor.pip_life_stage").attributes["senses"]
    out = async_capture_events(hass, f"{DOMAIN}_robot_out")
    home = async_capture_events(hass, f"{DOMAIN}_robot_home")
    assert "vroom" not in hass.states.get("sensor.pip_mood").attributes["flags"]

    hass.states.async_set("vacuum.robo", "cleaning")
    await settle(hass, freezer)
    mood = hass.states.get("sensor.pip_mood")
    assert "vroom" in mood.attributes["flags"]
    assert mood.attributes["reason"] == "a robot's zooming around!"
    assert len(out) == 1 and set(out[0].data) == {"pet_id"}  # no vacuum named

    hass.states.async_set("vacuum.robo", "returning")
    await settle(hass, freezer)
    assert "vroom" not in hass.states.get("sensor.pip_mood").attributes["flags"]
    assert len(home) == 1
    types = [
        m["type"] for m in hass.states.get("sensor.pip_last_care").attributes["moments"]
    ]
    assert types[:2] == ["robot_home", "robot_out"]


async def test_notice_robot_off_gives_no_vroom(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    hass.states.async_set("vacuum.robo", "docked")
    await setup_with_house(hass, notice_robot=False)
    out = async_capture_events(hass, f"{DOMAIN}_robot_out")
    assert "robot" not in hass.states.get("sensor.pip_life_stage").attributes["senses"]
    hass.states.async_set("vacuum.robo", "cleaning")
    await settle(hass, freezer)
    assert "vroom" not in hass.states.get("sensor.pip_mood").attributes["flags"]
    assert not out


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
    form = await open_topic(hass, config.entry_id, "weather")
    assert shown(form)["comfort_low"] == 64.5  # 18 °C, to the nearest half degree
    result = await hass.config_entries.options.async_configure(
        form["flow_id"], {"comfort_low": 80, "comfort_high": 70}
    )
    await hass.async_block_till_done()  # the save's reload
    assert result["errors"] == {"comfort_low": "comfort_range"}
    # The form comes back with what was entered (in °F), not the saved options.
    again = shown(result)
    assert again["comfort_low"] == 80 and again["comfort_high"] == 70
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"comfort_low": 64, "comfort_high": 80}
    )
    await hass.async_block_till_done()  # the save's reload
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
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    assert pet.state.notify_users == [me.id]
    # Who gets notified is theirs: on no sensor (privacy P3b).
    assert "notify_users" not in hass.states.get("sensor.pip_life_stage").attributes
    for _ in range(6):  # half an hour: hunger drops below 25 and it calls
        await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in mine] in call_texts("hunger")
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
    assert pet.state.notify_users == []


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
    for key in ("traits", "raised", "journal"):
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
    result = await save_topic(
        hass,
        config.entry_id,
        "bedtime",
        {"bedtime": "23:00:00", "wake_time": "23:00:00"},
    )
    assert result["errors"] == {"wake_time": "same_times"}
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"bedtime": "23:00:00", "wake_time": "07:00:00"}
    )
    await hass.async_block_till_done()  # the save's reload
    assert result["type"] is FlowResultType.CREATE_ENTRY
    result = await save_topic(
        hass, config.entry_id, "room", {"fireplace": "sensor.fire_temp"}
    )
    assert result["errors"] == {"fireplace": "fireplace_temperature"}
    result = await hass.config_entries.options.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()  # the save's reload
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_growing_up_shows_the_new_score_and_the_bar_today(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    # Disciplined today, but kept poorly while growing up: the bar shows
    # today, "growing up" the upbringing score (devoted on the old rule).
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        discipline=100.0,
        discipline_sum=0.0,
        discipline_samples=20,
        wellbeing_sum=4.0,
        wellbeing_samples=20,
    )
    await setup(hass)
    assert float(hass.states.get("sensor.pip_discipline").state) == 100.0
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["upbringing"] == "scrappy"
    assert attrs["upbringing_score"] == 27  # 0.75 x (0.8 x 20 + 0.2 x 100)


async def test_busy_attributes_stay_out_of_history(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from custom_components.virtual_pet.sensor import LifeStageSensor

    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    for key in (
        "journal",
        "trait_progress",
        "traits",
        "shell_finish_options",
        "shell_locked",
        "senses",
        "egg_roster",
    ):
        assert key in attrs
        assert key in LifeStageSensor._unrecorded_attributes, key
    assert "notify_users" not in attrs  # privacy P3b
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


async def test_ending_a_game_is_free_and_the_next_one_is_new(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    """The card's "maybe later": no reward, penalty, count, log line or event,
    and not a drop, so the next guess is a plain round 1."""
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0, energy=90.0)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    state = coordinator.state
    finished = async_capture_events(hass, f"{DOMAIN}_game_finished")
    # No game: harmless.
    reply = await game(hass, end=True)
    assert reply == {"result": "ok", "ended": False, "parked": False}
    # Mid Left/Right.
    await game(hass, guess="left")
    await game(hass, guess="left")
    before = (state.happiness, state.energy, state.hunger, state.weight)
    log = len(state.care_log)
    assert (await game(hass, end=True))["ended"] is True
    assert state.game is None
    assert (state.happiness, state.energy, state.hunger, state.weight) == before
    assert len(state.care_log) == log and not state.games
    assert not finished and not coordinator._dropped_games
    again = await game(hass, guess="left")
    assert again["round"] == 1 and "restarted" not in again
    await game(hass, end=True)
    # Mid Higher/Lower; another kind's end leaves the game alone.
    await game(hass, game="higher_lower")
    await game(hass, game="higher_lower", guess="higher")
    await game(hass, game="left_right", end=True)  # not this kind: no-op
    assert state.game is not None and state.game.kind == "higher_lower"
    await game(hass, game="higher_lower", end=True)
    assert state.game is None and not coordinator._dropped_games
    assert not finished and not state.games
    # A guess has no game now; starting then guessing is a fresh round 1.
    assert (await game(hass, game="higher_lower", guess="higher")) == {
        "result": "no_game"
    }
    await game(hass, game="higher_lower")
    fresh = await game(hass, game="higher_lower", guess="higher")
    assert fresh["round"] == 1 and "restarted" not in fresh


async def test_a_parked_berry_dig_carries_on_across_a_restart(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    """✕ on a dig that has shown something parks it (free); a restart keeps
    it; the next dig start carries on. Keep on an empty basket is refused."""
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0, energy=90.0)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    started = await game(hass, game="dig")
    assert (started["round"], started["basket"], started["leaves"]) == (0, 0, 8)
    refused = await game(hass, game="dig", guess="keep")
    assert refused["result"] == "empty_basket" and refused["basket"] == 0
    # Dig until something is shown, then ✕.
    tap = await game(hass, game="dig", guess="dig")
    shown = (tap["round"], tap["wins"], tap["basket"])
    log = len(coordinator.state.care_log)
    assert await game(hass, game="dig", end=True) == {
        "result": "ok",
        "ended": True,
        "parked": True,
    }
    assert coordinator.state.game is None
    assert list(coordinator.state.parked) == [
        model.PARK_HOUSEHOLD
    ]  # no person: the household's
    assert len(coordinator.state.care_log) == log and not coordinator.state.games
    await hass.config_entries.async_reload("test_pet")
    await hass.async_block_till_done()
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    assert list(coordinator.state.parked) == [model.PARK_HOUSEHOLD]
    back = await game(hass, game="dig")
    assert (back["round"], back["wins"], back["basket"]) == shown
    assert coordinator.state.parked == {} and coordinator.state.game.kind == "dig"


async def test_a_parked_berry_dig_is_the_person_who_parked_it(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0, energy=90.0)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    ann = await hass.auth.async_create_user("Ann")
    bob = await hass.auth.async_create_user("Bob")

    async def as_(user, **data: Any) -> dict[str, Any]:
        return await hass.services.async_call(
            DOMAIN,
            "play_game",
            {"entity_id": "button.pip_feed", "game": "dig", **data},
            blocking=True,
            return_response=True,
            context=Context(user_id=user.id),
        )

    await as_(ann)
    tap = await as_(ann, guess="dig")
    assert (await as_(ann, end=True))["parked"] is True
    assert list(coordinator.state.parked) == [ann.id]
    fresh = await as_(bob)
    assert (fresh["round"], fresh["wins"], fresh["basket"]) == (0, 0, 0)
    assert await as_(bob, end=True) == {"result": "ok", "ended": True, "parked": False}
    back = await as_(ann)
    assert (back["round"], back["wins"], back["basket"]) == (
        tap["round"],
        tap["wins"],
        tap["basket"],
    )
    # A shared screen (Ann signed in on the kitchen tablet): the household's slot.
    await as_(ann, end=True)
    await as_(ann, shared=True)
    shared_tap = await as_(ann, shared=True, guess="dig")
    assert (await as_(ann, shared=True, end=True))["parked"] is True
    assert set(coordinator.state.parked) == {ann.id, model.PARK_HOUSEHOLD}
    home = await game(hass, game="dig")  # an automation carries on the same one
    assert (
        home["basket"] == shared_tap["basket"] and home["round"] == shared_tap["round"]
    )


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


async def test_a_chore_ticked_again_pays_once_a_day(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    from homeassistant.core import SupportsResponse

    done: list[dict[str, str]] = []

    async def get_items(call) -> ServiceResponse:
        return {"todo.chores": {"items": list(done)}}

    hass.services.async_register(
        "todo", "get_items", get_items, supports_response=SupportsResponse.ONLY
    )
    hass.states.async_set("todo.chores", "1")
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=50.0)
    treats = async_capture_events(hass, f"{DOMAIN}_chore_treat")
    await setup_with_house(hass, chores=["todo.chores"])
    await hass.async_block_till_done(wait_background_tasks=True)
    for n in range(3):  # tick, un-tick, tick again
        done[:] = [{"uid": "1", "summary": "Dishes", "status": "completed"}]
        hass.states.async_set("todo.chores", f"a{n}")
        await hass.async_block_till_done(wait_background_tasks=True)
        done.clear()
        hass.states.async_set("todo.chores", f"b{n}")
        await hass.async_block_till_done(wait_background_tasks=True)
    assert len(treats) == 1


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
    assert [c.data["message"] for c in phone] in call_texts("hunger")

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


async def test_the_debug_sensor_never_shows_a_title(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # Privacy off: the house's readings are still redacted (F2, Q1).
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup_with_house(hass, tv=["media_player.tv"], privacy=False)
    er.async_get(hass).async_update_entity("sensor.pip_debug", disabled_by=None)
    await hass.config_entries.async_reload("test_pet")
    await hass.async_block_till_done()
    hass.states.async_set(
        "media_player.tv",
        "playing",
        {"media_content_type": "tvshow", "media_series_title": "Bluey"},
    )
    await settle(hass, freezer)
    calculation = hass.states.get("sensor.pip_debug").attributes["calculation"]
    assert calculation["home"]["readings"]["tv_title"] == "**REDACTED**"
    assert "Bluey" not in json.dumps(calculation, default=str)


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
        "topics": '"The pet\'s room"',
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


async def test_reconfigure_labels_follow_the_pet_stage(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    """An egg moves now (reconfigure); a hatched pet and an unloaded entry wait
    for the next egg (reconfigure_hatched), and the form says so."""
    config = await setup(hass)  # a fresh egg
    egg = await config.start_reconfigure_flow(hass)
    assert egg["step_id"] == "reconfigure"
    # Unloaded, it may have hatched: its move waits, so the label matches.
    assert await hass.config_entries.async_unload(config.entry_id)
    unloaded = await config.start_reconfigure_flow(hass)
    assert unloaded["step_id"] == "reconfigure_hatched"
    result = await hass.config_entries.flow.async_configure(
        unloaded["flow_id"], {"name": "Pip", "world": "pond"}
    )
    await hass.async_block_till_done()
    assert result["reason"] == "reconfigure_successful"
    assert config.data["next_world"] == "pond"


async def test_reconfigure_labels_a_hatched_pet_for_the_next_egg(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    age = 14 * 24 + 7 * 24 + 1.0
    hass_storage[STORE_KEY] = hatched_pet(
        now, age_hours=age, born=now - age * 3600, species="bird", raised=["bird"]
    )
    config = await setup(hass)
    result = await config.start_reconfigure_flow(hass)
    assert result["step_id"] == "reconfigure_hatched"
    assert result["description_placeholders"] == {"name": "Pip"}
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Pip", "world": "pond"}
    )
    await hass.async_block_till_done()
    assert config.data["world"] == "woodland" and config.data["next_world"] == "pond"


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
    # The public list hears only that the TV was on; the show is the channel's.
    assert not [m for m in moments if m["type"] in ("watching", "listening")]
    tv_on = [m for m in moments if m["type"] == "tv_on"]
    assert tv_on and set(tv_on[0]) == {"type", "at"}
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    assert pet._house["media"]["title"] == "Bluey"
    for entity_id in ("sensor.pip_life_stage", "sensor.pip_last_care"):
        attrs = hass.states.get(entity_id).attributes
        assert "Bluey" not in json.dumps(dict(attrs), default=str), entity_id


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


async def test_egg_roster_names_match_the_selects_options(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    # The card's lay sheet names its offer from egg_roster and sends the name
    # back to the select, so the names are the select's options minus the
    # surprise, in order, with and without a move waiting.
    age = 14 * 24 + 7 * 24 + 1.0
    hass_storage[STORE_KEY] = hatched_pet(
        now, age_hours=age, born=now - age * 3600, species="bird", raised=["bird"]
    )
    config = await setup(hass)

    def roster() -> list[dict[str, str]]:
        return hass.states.get("sensor.pip_life_stage").attributes["egg_roster"]

    options = hass.states.get("select.pip_next_egg").attributes["options"]
    assert [r["name"] for r in roster()] == options[1:]
    assert [r["id"] for r in roster()][:2] == ["bird", "squirrel"]
    assert all(set(r) == {"id", "name"} for r in roster())
    result = await config.start_reconfigure_flow(hass)
    await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Pip", "world": "pond"}
    )
    await hass.async_block_till_done()
    options = hass.states.get("select.pip_next_egg").attributes["options"]
    assert options[1] == "Pacific tree frog"
    assert [r["name"] for r in roster()] == options[1:]
    assert hass.states.get("sensor.pip_life_stage").attributes["next_world"] == "Pond"


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
    # A show's dream is the house's: on the channel, not the sensor.
    assert hass.states.get("sensor.pip_life_stage").attributes["dream"] is None
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    assert pet._house_view()["dream"] == {"kind": "watching", "title": "Bluey"}
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
    # Each person's bond is theirs: on no sensor (privacy P3b).
    assert "bonds" not in hass.states.get("sensor.pip_life_stage").attributes
    assert coordinator.bond_for(me.id)[0] == 1
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
    # The level-up is theirs alone: on their channel, not the public list.
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert not any(m["type"] == "bond_up" for m in moments)
    private = coordinator._private[me.id]
    assert {"type": "bond_up", "level": 2}.items() <= private[0].items()
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
    assert coordinator.friends() == {me.id}
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
    # Theirs alone (privacy P3b): on their own channel, not the public list.
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert not any(m["type"] == "friend_home" for m in moments)
    home = [m for m in coordinator._private[me.id] if m["type"] == "friend_home"]
    assert len(home) == 1 and "user" not in home[0]
    assert other.id not in coordinator._private


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
    states = json.dumps([s.attributes for s in hass.states.async_all()], default=str)
    assert "my_day" not in states
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
    # Theirs alone (privacy P3b): on their own channel, not the public list.
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert not any(m["type"] == "tucked_in" for m in moments)
    assert any(m["type"] == "tucked_in" for m in coordinator._private[me.id])
    # The morning after, awake: a thank-you, once.
    freezer.move_to("2026-10-29 08:00:00+00:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
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
    # Theirs alone (privacy P3b): on their own channel, not the public list.
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert not any(m["type"] == "bond_record" for m in moments)
    record = next(m for m in coordinator._private[me.id] if m["type"] == "bond_record")
    assert "user" not in record and record["game"] == "left_right"


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
        likes=ASKED_LIKES, birthday_skipped=True
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


async def test_the_last_zone_is_kept_only_while_my_day_is_on(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 17:00:00+00:00")
    me = await friend(hass, 0)
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    person = coordinator.people.person(me.id)

    async def go(place: str) -> None:
        hass.states.async_set("person.sam", place, {"user_id": me.id})
        await settle(hass, freezer, 60)

    async def my_day(enabled: bool) -> None:
        await hass.services.async_call(
            DOMAIN,
            "my_day",
            {"entity_id": "sensor.pip_mood", "enabled": enabled},
            blocking=True,
            context=Context(user_id=me.id),
        )

    # Off (the default): the zone is not kept.
    for place in ("not_home", "Gym"):
        await go(place)
    assert "zone" not in person
    # On: it is.
    await my_day(True)
    await go("not_home")
    await go("Gym")
    assert person["zone"]["name"] == "Gym"
    # Turning it off drops it, saved at once.
    await my_day(False)
    assert "zone" not in person
    stored = hass_storage["virtual_pet.people"]["data"]["people"][me.id]
    assert "zone" not in stored and stored["my_day"] is False


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
    await hass.async_block_till_done()
    phone.clear()  # the setup's clear of an old re-call notification
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
    sendoffs = [c for c in phone if "umbrella" in c.data["message"]]
    assert len(sendoffs) == model.R.SENDOFF_PER_WEEK  # a call may come too (rng)


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
        "kind": "picked",
        "pick": "sea",  # what, never who (fresh-expand F2)
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
        likes=ASKED_LIKES, birthday_skipped=True
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
        likes=ASKED_LIKES, birthday_skipped=True
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


async def test_lights_out_by_day_grants_no_tuck_in_wish(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 13:00:00+00:00")
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
    assert not coordinator.state.wish["granted"]


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
    # No follow-up due this week (one would take the dream's slot, F1).
    coordinator.people.person(me.id)["follow_last"] = dict.fromkeys(
        P.FOLLOW_QUESTIONS, "2026-10-29"
    )
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


async def test_a_late_answer_lands_for_a_like_but_not_for_a_spent_catchphrase(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_admin_user: Any,
) -> None:
    # The card resends a kept answer on a later visit: the first send may have
    # arrived and only its reply been lost.
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(
        dt_util.utcnow().timestamp(),
        species="squirrel",
        bonds={me: {"points": model.R.BOND_LEVELS[model.R.CATCHPHRASE_LEVEL - 1]}},
    )
    coordinator = (await setup(hass)).runtime_data
    # A like has no open-ask check: late or twice, it is stored.
    await coordinator.async_answer(me, "fav_weather", "snow")
    await coordinator.async_answer(me, "fav_weather", "snow")
    assert coordinator.people.person(me)["likes"] == {"fav_weather": "snow"}
    # A catchphrase answered once is spent: a late copy is refused.
    coordinator._catch_ask(me)["asked"].append("2026-10-28")
    await coordinator.async_answer(me, "catchphrase", "yay")
    with pytest.raises(ValueError):
        await coordinator.async_answer(me, "catchphrase", "yay")


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
    await hass.async_block_till_done()
    phone.clear()  # the setup's clear of an old re-call notification
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
    # A re-call notification from before the restart is cleared, once.
    assert [c.data["message"] for c in phone] == ["clear_notification"]
    assert phone[0].data["data"]["tag"] == "virtual_pet_recalls"
    phone.clear()
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
    states = str([s.attributes for s in hass.states.async_all()])
    assert "photos" not in states and "photos" not in str(bus)
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


async def test_too_soon_and_asleep_visits_carry_the_persons_settings(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    freezer.move_to("2026-10-28 12:00:00+00:00")
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    config = await setup(hass)
    pet = config.runtime_data
    await pet.async_set_my_day(me.id, True)
    await pet.async_set_birthday_phone(me.id, True)
    pet.people.person(me.id)["birthday"] = "05-17"
    mine = {"my_day": True, "birthday_kept": True, "birthday_phone": True}
    counted = await pet.async_visit(me.id)
    assert counted["counted"] and mine.items() <= counted.items()
    too_soon = await pet.async_visit(me.id)
    assert not too_soon["counted"] and mine.items() <= too_soon.items()
    await pet.async_set_lights_out(True)
    pet._visits.clear()
    asleep = await pet.async_visit(me.id)
    assert not asleep["counted"] and mine.items() <= asleep.items()
    # Someone with nothing set gets explicit false, not a missing field.
    other = await hass.auth.async_create_user("Other", group_ids=["system-admin"])
    bare = await pet.async_visit(other.id)
    assert (bare["my_day"], bare["birthday_kept"], bare["birthday_phone"]) == (
        False,
    ) * 3


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


async def _notified(
    hass: HomeAssistant, pets: tuple[str, ...] = ("sensor.pip_mood",)
) -> list[ServiceCall]:
    me = await hass.auth.async_create_user("Me")
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "My Phone"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_my_phone")
    for pet in pets:
        await hass.services.async_call(
            DOMAIN,
            "notify_me",
            {"entity_id": pet, "enabled": True},
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
    assert [c.data["message"] for c in phone] in call_texts("hunger")
    data = phone[0].data["data"]
    assert data["tag"] == "virtual_pet_recalls"
    assert "push" not in data and "actions" not in data  # normal, no buttons
    # Fed: the bundle names no pet still asking, so it goes.
    await press(hass, "button.pip_feed")
    await hass.async_block_till_done()
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_recalls"


async def test_a_call_keeps_its_start_days_phrasing_past_midnight(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    # Review #24: the recall bundle re-sends the open call in the words it was
    # sent with, so the day is the call's start day, not today.
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    started = now - 15 * 3600  # 23:00 the day before
    coordinator.state.call = model.Call("hunger", started, started + 3600)
    day = dt_util.as_local(dt_util.utc_from_timestamp(started)).date()
    assert coordinator._call_day() == day != dt_util.now().date()
    said = notify.message({"type": "call_started", "reason": "hunger"}, "Pip", {}, day)
    assert said == notify.call_line("hunger", "Pip", day)
    coordinator.state.call = None
    assert coordinator._call_day() == dt_util.now().date()


async def test_became_sick_speaks_today_not_an_older_open_calls_day(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    # Audit 0.43.0 F-04: a pet sick while asleep across midnight, woken by hand
    # next day, still holds its paused call from the day before; the sickness
    # message is today's phrase, while that call's own re-call keeps its day.
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    phone = await _notified(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    started = now - 15 * 3600  # 23:00 the day before
    coordinator.state.call = model.Call("hunger", started, started + 3600)
    today = dt_util.now().date()
    before = coordinator._call_day()
    assert before != today
    assert notify.call_line("sick", "Pip", before) != notify.call_line(
        "sick", "Pip", today
    )
    coordinator._notify({"type": "became_sick", "cause": "poop"}, False)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in phone] == [
        notify.call_line("sick", "Pip", today)
    ]
    assert coordinator._call_day("became_sick") == today
    assert coordinator._call_day() == before  # call_started keeps the call's day


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
    assert [c.data["message"] for c in phone] in call_texts("sick")


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
    assert [c.data["message"] for c in phone] in call_texts("happiness")
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_test_pet_call"
    assert len(phone) == 2


async def test_a_sickness_woken_by_hand_sends_one_push(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # Fell ill asleep: told at the wake. A hand wake tells it in its own
    # batch, and the sick call follows on the next tick (the 0b audit's probe3).
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        lights_out=True,
        asleep=True,
        napping=True,
        sick=True,
        sick_unannounced="poop",
    )
    await setup(hass)
    phone = await _notified(hass)
    await hass.services.async_call(
        "switch", "turn_off", {"entity_id": "switch.pip_lights_out"}, blocking=True
    )
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.pip_calling").state == "on"
    assert [c.data["message"] for c in phone] in call_texts("sick")


async def test_removing_the_last_pet_clears_its_recall_bundle(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(
        now, hunger=20.0, latched=["hunger"], latched_at={"hunger": now - 5 * 3600}
    )
    config = await setup(hass)
    phone = await _notified(hass)
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in phone] in call_texts("hunger")
    # A reload (an options change) keeps it: the pet still asks.
    assert await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    assert len(phone) == 1
    assert await hass.config_entries.async_remove(config.entry_id)
    await hass.async_block_till_done()
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_recalls"


async def test_two_pets_left_unfed_are_named_together(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    # Mochi's need was missed an hour after Pip's. Pip re-calls first, and
    # the bundle names Mochi too: it is still asking on the card.
    await hass.config.async_set_time_zone("UTC")
    for entry_id, name, missed in (
        ("test_pet", "Pip", now - 5 * 3600),
        ("other_pet", "Mochi", now - 4 * 3600 + 30 * 60),
    ):
        hass_storage[f"{DOMAIN}.{entry_id}"] = {
            **hatched_pet(
                now, hunger=20.0, latched=["hunger"], latched_at={"hunger": missed}
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
    phone = await _notified(hass, ("sensor.pip_mood", "sensor.mochi_mood"))
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert [c.data["message"] for c in phone] == ["Mochi and Pip would like a visit"]
    # Mochi's own re-call opens within the 4 hours: no second buzz.
    for _ in range(12):
        await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert len(phone) == 1
    # Past both re-calls' 20 minutes they still ask on the card, so it stays
    # until neither does.
    for _ in range(3):
        await settle(hass, freezer, 5 * 60)
    assert hass.states.get("binary_sensor.pip_calling").state == "off"
    await press(hass, "button.pip_feed")
    await settle(hass, freezer, 5 * 60)
    assert len(phone) == 1
    await press(hass, "button.mochi_feed")
    await settle(hass, freezer, 5 * 60)
    await hass.async_block_till_done()
    assert phone[-1].data["message"] == "clear_notification"
    assert phone[-1].data["data"]["tag"] == "virtual_pet_recalls"
    assert len(phone) == 2


# --- Dropped games (Wave 0 PR 0f) ---------------------------------------------------


async def test_a_switch_drop_grants_no_wish_bond_record_or_favourite(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    me = await hass.auth.async_create_user("Me", group_ids=["system-admin"])
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish = {"kind": "play", "granted": False}
    finished = async_capture_events(hass, f"{DOMAIN}_game_finished")
    # One guess, then walk off to the other game.
    await hass.services.async_call(
        DOMAIN,
        "play_game",
        {"entity_id": "button.pip_feed", "guess": "left"},
        blocking=True,
        return_response=True,
        context=Context(user_id=me.id),
    )
    await hass.services.async_call(
        DOMAIN,
        "play_game",
        {"entity_id": "button.pip_feed", "game": "higher_lower"},
        blocking=True,
        return_response=True,
        context=Context(user_id=me.id),
    )
    state = coordinator.state
    assert [e.data.get("dropped") for e in finished] == [True]
    assert state.games["left_right"]["played"] == 1
    assert state.wish["granted"] is False
    assert not state.bonds.get(me.id, {}).get("games")
    assert not state.bonds.get(me.id, {}).get("best")
    assert not state.favourites
    assert state.care_log[0]["by"] == "Me" and state.care_log[0]["result"] == "lost"


async def test_going_away_mid_game_drops_it_as_a_loss(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, happiness=50.0)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish = {"kind": "play", "granted": False}
    await game(hass, guess="left")
    finished = async_capture_events(hass, f"{DOMAIN}_game_finished")
    coordinator.presence.update = lambda *args, **kwargs: True  # everyone left
    coordinator._sense_home(coordinator._now())
    await hass.async_block_till_done()
    state = coordinator.state
    assert state.away and state.game is None
    assert [e.data.get("dropped") for e in finished] == [True]
    assert state.games["left_right"]["played"] == 1
    assert state.wish["granted"] is False and not state.favourites
    assert not state.care_log  # nobody caused the drop, so nothing to react to


async def test_a_guess_after_an_idle_drop_says_the_game_restarted(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    """The card's game was dropped for idling: the next guess starts a new one,
    and the reply says so, so the card adopts it rather than blame a player."""
    from custom_components.virtual_pet import rates as R

    hass_storage[STORE_KEY] = hatched_pet(now, happiness=80.0, energy=90.0)
    await setup(hass)
    first = await game(hass, guess="left")
    second = await game(hass, guess="left")
    assert first["round"] == 1 and second["round"] == 2
    assert "restarted" not in first and "restarted" not in second
    await settle(hass, freezer, (R.GAME_IDLE_MINUTES + 1) * 60)
    again = await game(hass, guess="left")
    assert again["round"] == 1 and again["restarted"] is True
    after = await game(hass, guess="left")
    assert after["round"] == 2 and "restarted" not in after
    # Higher or Lower has nothing to guess against once dropped.
    await game(hass, game="higher_lower")
    await game(hass, game="higher_lower", guess="higher")
    await settle(hass, freezer, (R.GAME_IDLE_MINUTES + 1) * 60)
    assert await game(hass, game="higher_lower", guess="higher") == {
        "result": "no_game"
    }


async def test_unload_after_startup_does_not_remove_a_spent_listener(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Set up before HA is running: the started listener fires once and is gone,
    so unloading the entry must not try to remove it again (ValueError)."""
    hass.set_state(CoreState.starting)
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup(hass)
    hass.set_state(CoreState.running)
    hass.bus.async_fire(EVENT_HOMEASSISTANT_STARTED)
    await hass.async_block_till_done()
    assert await hass.config_entries.async_unload(config.entry_id)
    await hass.async_block_till_done()
    assert "Unable to remove unknown job listener" not in caplog.text


async def test_phone_question_once_after_a_miss_with_the_app_only(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    """top10 1a: after a missed call the pet asks "can I call your phone?" once
    ever, only someone signed in to the HA app on a phone of their own, never
    someone already getting its calls; "forget my data" clears the flag."""
    freezer.move_to("2026-10-28 17:00:00+00:00")
    now = dt_util.utcnow().timestamp()
    me = await friend(hass, 0)
    other = await hass.auth.async_create_user("Other")
    hass_storage[STORE_KEY] = hatched_pet(now, recent_misses=[now - 600])
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    # Another person's phone is not mine: no question for me yet.
    MockConfigEntry(
        domain="mobile_app", data={"user_id": other.id, "device_name": "Their Phone"}
    ).add_to_hass(hass)
    async_mock_service(hass, "notify", "mobile_app_their_phone")
    assert (await look(hass, me.id))["ask"] != "phone"
    assert "phone_asked" not in coordinator.people.person(me.id)
    # With my own phone: asked, once.
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "My Phone"}
    ).add_to_hass(hass)
    async_mock_service(hass, "notify", "mobile_app_my_phone")
    coordinator._visits.clear()
    # Today's question already asked: not today (audit #2).
    coordinator.people.person(me.id)["asked"] = {"day": "2026-10-28"}
    assert (await look(hass, me.id))["ask"] != "phone"
    coordinator._visits.clear()
    coordinator.people.person(me.id).pop("asked", None)
    assert (await look(hass, me.id))["ask"] == "phone"
    # Sent, but the card never showed it: not asked for good, so it comes again
    # (another day: it was the day's question) (audit #1).
    assert "phone_asked" not in coordinator.people.person(me.id)
    coordinator._visits.clear()
    assert (await look(hass, me.id))["ask"] != "phone"  # once a day
    coordinator._visits.clear()
    coordinator.people.person(me.id).pop("asked", None)  # the next day
    assert (await look(hass, me.id))["ask"] == "phone"
    # The card says it showed it: asked for good.
    await coordinator.async_answer(me.id, "phone", "shown")
    assert coordinator.people.person(me.id)["phone_asked"] is True
    with pytest.raises(ValueError):
        await coordinator.async_answer(me.id, "phone", "yes")  # only "shown"
    coordinator._visits.clear()
    coordinator.people.person(me.id).pop("asked", None)
    assert (await look(hass, me.id))["ask"] != "phone"
    # Forget my data: the flag goes with the rest (asked again, once).
    await coordinator.people.forget(me.id)
    assert "phone_asked" not in coordinator.people.person(me.id)
    # Already getting this pet's calls: never asked.
    coordinator.state.notify_users.append(me.id)
    coordinator._visits.clear()
    assert (await look(hass, me.id))["ask"] != "phone"
    # And no miss, no open call: not asked either.
    coordinator.state.notify_users.remove(me.id)
    coordinator.state.recent_misses.clear()
    coordinator._visits.clear()
    coordinator.people.person(me.id).pop("asked", None)
    assert (await look(hass, me.id))["ask"] != "phone"
    # Nothing about it on any state.
    for state in hass.states.async_all():
        assert "phone_asked" not in json.dumps(dict(state.attributes))


async def test_senses_are_kinds_never_entities(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    """top10 2a: the life stage's `senses` lists only the kinds mapped (weather,
    tv...), in a fixed order; never an entity id or name, never presence, motion or
    bedtime; out of history."""
    from custom_components.virtual_pet.sensor import LifeStageSensor

    hass_storage[STORE_KEY] = hatched_pet(now)
    entities = {
        "weather": "weather.secret_garden",
        "tv": "media_player.den_tv_xyz",
        "chores": ["todo.kitchen_jobs"],
        "moon_phase": "sensor.moon_phase_abc",
        "zone": "zone.hidden_place",
        "motion": ["binary_sensor.hall_motion_q"],
        "bedtime": "21:30:00",
    }
    config = await setup_with_house(hass, **entities)
    attrs = hass.states.get("sensor.pip_life_stage").attributes
    assert attrs["senses"] == ["weather", "tv", "chores", "moon"]
    assert "senses" in LifeStageSensor._unrecorded_attributes
    text = json.dumps(dict(attrs))
    for value in (
        "secret_garden",
        "den_tv",
        "kitchen_jobs",
        "moon_phase_abc",
        "hidden_place",
        "hall_motion",
        "motion",
        "zone",
    ):
        assert value not in text, value
    # Bedtime is the pet's own `sleep_times` target (owner-approved, settings Q-G),
    # never a sense: the kinds list never names it.
    assert "bedtime" not in json.dumps(attrs["senses"])
    assert attrs["sleep_times"] == {"bedtime": "21:30", "wake": "07:00"}
    # Nothing mapped: only the moon, which every pet reads from the date.
    hass.config_entries.async_update_entry(config, options={})
    await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.pip_life_stage").attributes["senses"] == ["moon"]


async def test_social_meter_links_and_a_greeted_visitor(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    """top10 §6: the card's virtual_pet/linked counts each pet once a day for the
    other; a look during the day's visit counts a greeted visitor; social_level
    is on the life stage, out of history, and the days are redacted in
    diagnostics."""
    from custom_components.virtual_pet import diagnostics
    from custom_components.virtual_pet.sensor import LifeStageSensor

    await hass.config.async_set_time_zone("UTC")
    now = dt_util.utcnow().timestamp()
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

    def level(pet: str) -> int:
        return hass.states.get(f"sensor.{pet}_life_stage").attributes["social_level"]

    assert level("pip") == 0 and level("bo") == 0
    assert "social_level" in LifeStageSensor._unrecorded_attributes
    client = await hass_ws_client(hass)
    for _ in range(2):  # twice the same day: once
        await client.send_json_auto_id(
            {
                "type": "virtual_pet/linked",
                "entity_id": "sensor.pip_mood",
                "other": "sensor.bo_mood",
            }
        )
        assert (await client.receive_json())["success"]
        await hass.async_block_till_done()
    assert level("pip") == model.R.SOCIAL_LINK and level("bo") == model.R.SOCIAL_LINK
    assert pets[0].state.social[pets[0]._today(now)[0]]["links"] == ["other_pet"]
    # One pet linked with itself: refused.
    await client.send_json_auto_id(
        {
            "type": "virtual_pet/linked",
            "entity_id": "sensor.pip_mood",
            "other": "sensor.pip_life_stage",
        }
    )
    assert not (await client.receive_json())["success"]
    # A look while the day's visitor is here: a greeted visitor (two pets: 2 halves).
    me = await friend(hass, 0)
    pets[0].state.visit = {
        "day": pets[0]._today(now)[0],
        "world": pets[0].world,
        "id": "hedgehog",
        "hours": "day",
        "from": now - 600,
        "until": now + 3600,
        "credited": False,
    }
    # Asleep (or an egg, or away): a look doesn't greet it (audit #8).
    pets[0].state.asleep = True
    await look(hass, me.id)
    await hass.async_block_till_done()
    assert not pets[0].state.social[pets[0]._today(now)[0]]["visitor"]
    pets[0].state.asleep = False
    pets[0]._visits.clear()
    await look(hass, me.id)
    await hass.async_block_till_done()
    # Linked this week: the plain visitor credit (two pets on separate cards, never
    # linked, would each get the solo credit: test_model).
    assert level("pip") == model.R.SOCIAL_LINK + model.R.SOCIAL_VISITOR
    # Diagnostics: the days are redacted.
    diag = await diagnostics.async_get_config_entry_diagnostics(
        hass, hass.config_entries.async_get_entry("test_pet")
    )
    assert diag["pet"]["social"] == "**REDACTED**"


async def test_greeted_credits_the_visitor_the_card_played_inside_its_window(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], hass_ws_client: Any
) -> None:
    """UX8 F4: the card's virtual_pet/greeted counts the day's greeted visitor on any
    screen (no `visit` call, no person), once, and only inside the visit's window; an
    unknown entity is refused; the hourly `visit` credit still stands."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    today = pet._today(now)[0]

    def visit(start: float, end: float) -> None:
        pet.state.visit = {
            "day": today,
            "world": pet.world,
            "id": "hedgehog",
            "hours": "day",
            "from": start,
            "until": end,
            "credited": False,
        }

    def greeted() -> bool:
        return bool(pet.state.social.get(today, {}).get("visitor"))

    client = await hass_ws_client(hass)

    async def send(entity_id: str = "sensor.pip_mood") -> dict[str, Any]:
        await client.send_json_auto_id(
            {"type": "virtual_pet/greeted", "entity_id": entity_id}
        )
        reply = await client.receive_json()
        await hass.async_block_till_done()
        return reply

    # Outside the window (later today, or already over): nothing.
    visit(now + 3600, now + 7200)
    assert (await send())["success"]
    assert not greeted()
    visit(now - 7200, now - 3600)
    assert (await send())["success"]
    assert not greeted()
    # Inside it: the day counts a greeted visitor, once.
    visit(now - 600, now + 3600)
    assert (await send())["success"]
    assert greeted()
    assert (await send())["success"]
    assert hass.states.get("sensor.pip_life_stage").attributes["social_level"] == (
        model.R.SOCIAL_VISITOR_SOLO
    )
    # Asleep: the visitor isn't greeted.
    pet.state.social.clear()
    pet.state.asleep = True
    assert (await send())["success"]
    assert not greeted()
    # Not a pet's entity: refused.
    assert not (await send("sensor.nobody"))["success"]


async def test_a_visitor_dream_names_its_visitor_and_no_other_dream_grows(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    """top10 6d: the life stage's dream carries a visitor's id and world (nobody's);
    every other dream stays its kind only."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    today = dt_util.now().date().isoformat()

    def shown(dream: dict[str, Any]) -> Any:
        coordinator.state.dream = {**dream, "day": today}
        coordinator.async_set_updated_data(coordinator.state)
        return hass.states.get("sensor.pip_life_stage").attributes["dream"]

    assert shown({"kind": "visitor", "id": "chickadee", "world": "woodland"}) == {
        "kind": "visitor",
        "id": "chickadee",
        "world": "woodland",
    }
    assert shown({"kind": "picked", "pick": "sea", "user": "abc", "id": "x"}) == {
        "kind": "picked",
        "pick": "sea",
    }
    # An unknown pick (a hand-edited save) is left out; the user never shows.
    assert shown({"kind": "picked", "pick": "<b>", "user": "abc"}) == {"kind": "picked"}


# --- ha-signals H2: the weather default and its one-time migration ---------------


def _weather(
    hass: HomeAssistant,
    object_id: str,
    platform: str = "met",
    *,
    track_home: bool | None = None,
    **kwargs: Any,
) -> str:
    """Register a weather entity (for met, under a config entry that may track home)."""
    config = None
    if track_home is not None:
        config = MockConfigEntry(domain=platform, data={"track_home": track_home})
        config.add_to_hass(hass)
    return (
        er.async_get(hass)
        .async_get_or_create(
            "weather",
            platform,
            f"uid_{object_id}",
            suggested_object_id=object_id,
            config_entry=config,
            **kwargs,
        )
        .entity_id
    )


def _old_pet(
    minor: int = 1, options: dict[str, Any] | None = None, version: int = 1
) -> MockConfigEntry:
    return MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={CONF_NAME: "Pip", "new_pet": True},
        options=options or {},
        entry_id="test_pet",
        minor_version=minor,
        version=version,
    )


async def _load(hass: HomeAssistant, config: MockConfigEntry) -> MockConfigEntry:
    await hass.config.async_set_time_zone("UTC")
    config.add_to_hass(hass)
    await hass.config_entries.async_setup(config.entry_id)
    await hass.async_block_till_done()
    return config


async def _new_pet_options(
    hass: HomeAssistant, name: str = "Juniper"
) -> dict[str, Any]:
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_NAME: name, "world": "woodland"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    return dict(result["options"])


async def test_a_new_pet_starts_on_the_met_home_weather(hass: HomeAssistant) -> None:
    home = _weather(hass, "forecast_home", track_home=True)
    _weather(hass, "zz_other", "other")
    assert home == "weather.forecast_home"
    assert (await _new_pet_options(hass))["weather"] == "weather.forecast_home"


async def test_a_new_pet_uses_a_yaml_weather_without_a_registry_entry(
    hass: HomeAssistant,
) -> None:
    hass.states.async_set("weather.yaml_one", "sunny")
    assert (await _new_pet_options(hass))["weather"] == "weather.yaml_one"
    hass.states.async_set("weather.yaml_two", "rainy")
    assert "weather" not in await _new_pet_options(hass, "Fern")  # two: not clear


async def test_a_new_pet_with_no_weather_has_none(hass: HomeAssistant) -> None:
    assert "weather" not in await _new_pet_options(hass)


async def test_migration_fills_an_empty_weather_field_once(
    hass: HomeAssistant,
) -> None:
    _weather(hass, "forecast_home", track_home=True)
    config = await _load(hass, _old_pet())
    assert config.state is ConfigEntryState.LOADED
    assert config.options["weather"] == "weather.forecast_home"
    assert config.minor_version == 2
    assert config.version == 1


async def test_migration_leaves_a_chosen_weather_alone(hass: HomeAssistant) -> None:
    _weather(hass, "forecast_home", track_home=True)
    config = await _load(hass, _old_pet(options={"weather": "weather.mine"}))
    assert config.options["weather"] == "weather.mine"
    assert config.minor_version == 2


async def test_migration_with_no_weather_entity_still_bumps_the_version(
    hass: HomeAssistant,
) -> None:
    config = await _load(hass, _old_pet())
    assert "weather" not in config.options
    assert config.minor_version == 2


async def test_a_cleared_weather_field_stays_clear_after_a_reload(
    hass: HomeAssistant,
) -> None:
    _weather(hass, "forecast_home", track_home=True)
    config = await _load(hass, _old_pet(minor=2))
    assert "weather" not in config.options
    await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    assert config.state is ConfigEntryState.LOADED
    assert "weather" not in config.options


async def test_migration_ignores_states_and_reads_only_the_registry(
    hass: HomeAssistant,
) -> None:
    hass.states.async_set("weather.yaml_one", "sunny")
    config = await _load(hass, _old_pet())
    assert "weather" not in config.options
    assert config.minor_version == 2


async def test_the_weather_default_log_names_no_entity(
    hass: HomeAssistant, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("DEBUG", logger="custom_components.virtual_pet")
    _weather(hass, "forecast_home", track_home=True)
    await _load(hass, _old_pet())
    records = [r for r in caplog.records if "weather default set" in r.getMessage()]
    assert len(records) == 1
    assert "forecast_home" not in records[0].getMessage()
    assert "weather." not in records[0].getMessage()
    assert not records[0].args


@pytest.mark.parametrize(
    ("entities", "expected"),
    [
        # Two or more and no met home entry: the player chooses.
        ([("aa", "other"), ("bb", "other")], None),
        # Exactly one of any kind is clear.
        ([("only_one", "other")], "weather.only_one"),
        # Disabled and hidden ones don't count, so the one left is clear.
        (
            [
                ("off", "other", {"disabled_by": er.RegistryEntryDisabler.USER}),
                ("hid", "other", {"hidden_by": er.RegistryEntryHider.USER}),
                ("fine", "other"),
            ],
            "weather.fine",
        ),
        # All of them disabled or hidden: none.
        ([("off", "other", {"disabled_by": er.RegistryEntryDisabler.USER})], None),
    ],
)
async def test_migration_fills_only_when_the_weather_is_clear(
    hass: HomeAssistant, entities: list[tuple], expected: str | None
) -> None:
    for object_id, platform, *extra in entities:
        _weather(hass, object_id, platform, **(extra[0] if extra else {}))
    config = await _load(hass, _old_pet())
    assert config.options.get("weather") == expected


async def test_migration_prefers_the_entry_that_tracks_home(
    hass: HomeAssistant,
) -> None:
    # A literal weather.forecast_home from a met entry that does not track home
    # loses to the one that does.
    _weather(hass, "forecast_home", track_home=False)
    _weather(hass, "my_town", track_home=True)
    config = await _load(hass, _old_pet())
    assert config.options["weather"] == "weather.my_town"


async def test_migration_skips_a_disabled_met_home_entity(
    hass: HomeAssistant,
) -> None:
    _weather(
        hass,
        "forecast_home",
        track_home=True,
        disabled_by=er.RegistryEntryDisabler.USER,
    )
    _weather(hass, "elsewhere", track_home=False)
    config = await _load(hass, _old_pet())
    assert config.options["weather"] == "weather.elsewhere"  # the one left


@pytest.mark.parametrize("key", ["rain", "indoor_temperature", "aqi", "solar"])
async def test_migration_leaves_a_pet_with_any_weather_section_option(
    hass: HomeAssistant, key: str
) -> None:
    _weather(hass, "forecast_home", track_home=True)
    config = await _load(hass, _old_pet(options={key: "sensor.mine"}))
    assert "weather" not in config.options
    assert config.options[key] == "sensor.mine"
    assert config.minor_version == 2


async def test_migration_never_lowers_a_newer_minor_and_still_loads(
    hass: HomeAssistant,
) -> None:
    _weather(hass, "forecast_home", track_home=True)
    config = await _load(hass, _old_pet(minor=3))
    assert config.state is ConfigEntryState.LOADED
    assert config.minor_version == 3
    assert "weather" not in config.options


async def test_a_newer_major_version_is_not_migrated(hass: HomeAssistant) -> None:
    config = await _load(hass, _old_pet(version=2))
    assert config.state is ConfigEntryState.MIGRATION_ERROR


async def test_the_forecast_guard_reads_the_watchers_weather_not_the_entrys(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
) -> None:
    """A save lands in entry.options before the reload: the coordinator must go
    by the weather ids its watcher has, so no IndexError when options gained one."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    calls = forecast_service(hass, [])
    config = await setup_with_house(hass)  # no weather mapped
    pet = config.runtime_data
    await hass.async_block_till_done(wait_background_tasks=True)
    assert pet._home_started and not calls
    hass.config_entries.async_update_entry(config, options={"weather": "weather.new"})
    pet._want_forecast(now + 99 * 3600)  # the entry has weather, the watcher none
    await hass.async_block_till_done(wait_background_tasks=True)
    assert not calls
    # And the other way round: the watcher's weather still counts.
    pet.watcher.options = {"weather": "weather.home"}
    pet._want_forecast(now + 99 * 3600)
    await hass.async_block_till_done(wait_background_tasks=True)
    assert len(calls) == 1
