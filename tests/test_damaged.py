"""Damaged save files: the pet always loads, and is never welcomed as new (F5)."""

from __future__ import annotations

from datetime import timedelta
import json
from pathlib import Path
from typing import Any
from unittest.mock import patch

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntryState
from homeassistant.const import CONF_NAME, STATE_UNAVAILABLE
from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.virtual_pet import backup, model, rates as R
from custom_components.virtual_pet.coordinator import PetCoordinator
from custom_components.virtual_pet.people import STORE_KEY as PEOPLE_KEY, People

from .test_init import STORE_KEY, hatched_pet

DOMAIN = "virtual_pet"


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


@pytest.fixture
def storage_dir(hass: HomeAssistant, tmp_path: Path) -> Path:
    """A config folder of its own, so backups land in tmp_path."""
    hass.config.config_dir = str(tmp_path)
    folder = tmp_path / ".storage"
    folder.mkdir()
    return folder


def pet_entry(
    hass: HomeAssistant, entry_id: str = "test_pet", **data: Any
) -> MockConfigEntry:
    name = "Pip" if entry_id == "test_pet" else entry_id.title()
    entry = MockConfigEntry(
        domain=DOMAIN,
        title=name,
        data={CONF_NAME: name, **data},
        entry_id=entry_id,
    )
    entry.add_to_hass(hass)
    return entry


async def load(hass: HomeAssistant, **data: Any) -> MockConfigEntry:
    """An existing pet (no new_pet marker) set up from whatever is stored."""
    await hass.config.async_set_time_zone("UTC")
    entry = pet_entry(hass, **data)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def wrapped(data: Any) -> dict[str, Any]:
    return {"version": 1, "minor_version": 1, "key": STORE_KEY, "data": data}


def issue(hass: HomeAssistant, key: str = "save_damaged_test_pet") -> Any:
    return ir.async_get(hass).async_get_issue(DOMAIN, key)


def welcomed(hass: HomeAssistant) -> bool:
    notes = persistent_notification._async_get_or_create_notifications(hass)
    return any(k.endswith("_welcome") for k in notes)


async def runs(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    """Loaded, ticked once, and every sensor renders."""
    assert entry.state is ConfigEntryState.LOADED
    freezer.tick(timedelta(minutes=R.TICK_MINUTES + 1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    sensors = [s for s in hass.states.async_all("sensor") if "pip_" in s.entity_id]
    assert len(sensors) >= 8
    assert all(s.state != STATE_UNAVAILABLE for s in sensors), sensors


def damage(now: float, key: str, value: Any) -> dict[str, Any]:
    pet = hatched_pet(now)
    if value is DELETE:
        del pet["data"][key]
    else:
        pet["data"][key] = value
    return pet


DELETE = object()


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("call", "bad"),
        ("latched", None),
        ("name", DELETE),
        ("born", DELETE),
        ("last_updated", DELETE),
        ("hunger", "x"),
        ("care_log", [{}]),
        ("journal", ["x"]),
        ("bonds", []),
        ("bonds", {"u": {"points": "x"}}),
        ("dream_seeds", [{}]),
        ("trait_hours", 3),
        ("wish", "x"),
        ("game", {"kind": "left_right", "started": "x"}),
        ("poops", "x"),
        ("sick_unannounced", 3),
    ],
)
async def test_a_damaged_field_never_stops_a_pet_loading(
    hass: HomeAssistant,
    now: float,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    storage_dir: Path,
    key: str,
    value: Any,
) -> None:
    hass_storage[STORE_KEY] = damage(now, key, value)
    entry = await load(hass)
    await runs(hass, entry, freezer)
    assert hass.states.get("sensor.pip_life_stage").state != "egg"
    assert not welcomed(hass)


async def test_a_root_that_isnt_a_pet_is_backed_up_and_repaired(
    hass: HomeAssistant,
    now: float,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    hass_storage[STORE_KEY] = wrapped("junk")
    phone = async_mock_service(hass, "notify", "mobile_app_phone")
    entry = await load(hass)
    await runs(hass, entry, freezer)
    assert hass.states.get("sensor.pip_life_stage").state == "egg"
    backups = list(storage_dir.glob(f"{STORE_KEY}.damaged.*"))
    assert len(backups) == 1
    assert json.loads(backups[0].read_text())["data"] == "junk"
    found = issue(hass)
    assert found.translation_key == "save_damaged_egg"  # nothing could be kept
    assert found.translation_placeholders == {
        "pet": "Pip",
        "backup": backups[0].name,
        "entry_id": "test_pet",
    }
    assert found.is_persistent
    assert not welcomed(hass) and phone == []
    # Saved over at once: the next load is clean.
    assert hass_storage[STORE_KEY]["data"]["name"] == "Pip"


async def test_the_raw_file_is_what_gets_backed_up(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    (storage_dir / STORE_KEY).write_text('{"version": 1, "data": "raw bytes"}')
    hass_storage[STORE_KEY] = wrapped("junk")
    await load(hass)
    [copy] = storage_dir.glob(f"{STORE_KEY}.damaged.*")
    assert copy.read_text() == '{"version": 1, "data": "raw bytes"}'


@pytest.mark.parametrize(
    "stored",
    [
        None,  # undecodable: HA moved it to .corrupt.<time>, the store is empty
        wrapped(None),  # "data": null
        {},  # an outer {}
        {"version": 1},  # a wrapper missing "data"
    ],
)
async def test_an_unreadable_save_is_an_egg_never_welcomed(
    hass: HomeAssistant,
    now: float,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    storage_dir: Path,
    stored: Any,
) -> None:
    corrupt = storage_dir / f"{STORE_KEY}.corrupt.2026-10-26T14:00:00"
    corrupt.write_text("{not json")
    if stored is not None:
        hass_storage[STORE_KEY] = stored
    phone = async_mock_service(hass, "notify", "mobile_app_phone")
    entry = await load(hass)
    await runs(hass, entry, freezer)
    assert hass.states.get("sensor.pip_life_stage").state == "egg"
    assert not welcomed(hass) and phone == []
    found = issue(hass)
    assert found.translation_key == "save_damaged_egg"
    assert found.translation_placeholders["backup"] == corrupt.name


async def test_only_a_new_pet_is_welcomed_and_only_once(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    entry = await load(hass, new_pet=True)
    assert welcomed(hass)
    assert issue(hass) is None
    assert "new_pet" not in entry.data  # gone after the first save
    persistent_notification.async_dismiss(hass, "virtual_pet_test_pet_welcome")
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert not welcomed(hass)


async def test_an_existing_pet_loses_its_marker_on_load(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    entry = await load(hass, new_pet=True)
    assert "new_pet" not in entry.data
    assert not welcomed(hass)


async def test_what_matters_is_salvaged_when_loading_fails(
    hass: HomeAssistant,
    now: float,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    photo = {"name": "Old", "species": "bird", "stage": "adult", "on": "2026-01-02"}
    journal = [{"generation": 1, "name": "Old", "species": "bird", "traits": []}]
    hass_storage[STORE_KEY] = damage(now, "hunger", 5.0)
    hass_storage[STORE_KEY]["data"].update(
        name="Bean",
        generation=2,
        species="deer",
        raised=["bird", "deer"],
        journal=journal,
        memories=[{"kind": "first_snow", "at": now}],
        bonds={"u1": {"points": 40, "nickname": "bean", "photos": {"1": photo}}},
    )
    with patch.object(
        model.PetState, "from_dict", side_effect=RuntimeError("a bug in the checks")
    ):
        entry = await load(hass)
    await runs(hass, entry, freezer)
    coordinator: PetCoordinator = entry.runtime_data
    state = coordinator.state
    # (Its name follows the device's, as on every load.)
    assert (state.generation, state.species) == (2, "deer")
    assert state.raised == ["bird", "deer"]
    assert state.journal[0]["name"] == "Old"
    assert state.memories[0]["kind"] == "first_snow"
    assert state.bonds["u1"]["photos"]["1"]["name"] == "Old"
    assert state.hunger == 80.0  # the rest starts fresh
    assert issue(hass).translation_key == "save_damaged"
    assert not welcomed(hass)


async def test_unknown_keys_survive_a_load_and_a_save(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, from_later={"x": 1})
    hass_storage[STORE_KEY]["data"]["bonds"] = {"u1": {"points": 3, "later": True}}
    entry = await load(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    saved = hass_storage[STORE_KEY]["data"]
    assert saved["from_later"] == {"x": 1}
    assert saved["bonds"]["u1"]["later"] is True


async def test_two_incidents_leave_two_backups(
    hass: HomeAssistant, storage_dir: Path
) -> None:
    first = await backup.async_backup(hass, STORE_KEY, 1, "one")
    second = await backup.async_backup(hass, STORE_KEY, 1, "two")
    assert first != second
    assert len(list(storage_dir.glob(f"{STORE_KEY}.damaged.*"))) == 2


async def test_a_first_tick_that_fails_still_loads_the_pet(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=40.0)
    with patch.object(PetCoordinator, "_tick", side_effect=RuntimeError("boom")):
        entry = await load(hass)
    assert entry.state is ConfigEntryState.LOADED  # not SETUP_RETRY
    assert issue(hass).translation_key == "save_damaged"
    assert hass.states.get("sensor.pip_hunger").state == "40"  # as loaded


async def test_removing_the_pet_clears_its_repair(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], storage_dir: Path
) -> None:
    hass_storage[STORE_KEY] = wrapped("junk")
    entry = await load(hass)
    assert issue(hass) is not None
    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    assert issue(hass) is None
    assert list(storage_dir.glob(f"{STORE_KEY}.damaged.*"))  # the owner's to delete


def people(data: Any) -> dict[str, Any]:
    return {"version": 1, "minor_version": 1, "key": PEOPLE_KEY, "data": data}


@pytest.mark.parametrize(
    "stored",
    [
        {"people": "x"},
        {"people": {"u": "x"}},
        {"people": {"u": {"zone": 3, "noted": [], "alarms": "x", "asked": 1}}},
        {"weather": []},
    ],
)
async def test_a_damaged_people_record_is_dropped_key_by_key(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    storage_dir: Path,
    stored: dict[str, Any],
) -> None:
    hass_storage[PEOPLE_KEY] = people(stored)
    hass_storage[STORE_KEY] = hatched_pet(now)
    user = await hass.auth.async_create_user("U")
    hass_storage[PEOPLE_KEY]["data"] = json.loads(
        json.dumps(stored).replace('"u"', json.dumps(user.id))
    )
    entry = await load(hass)
    assert entry.state is ConfigEntryState.LOADED
    await hass.services.async_call(
        DOMAIN,
        "visit",
        {"entity_id": "sensor.pip_mood"},
        blocking=True,
        return_response=True,
        context=Context(user_id=user.id),
    )
    assert issue(hass, "people_damaged") is None


async def test_a_damaged_people_file_stops_no_pet(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], storage_dir: Path
) -> None:
    (storage_dir / PEOPLE_KEY).write_text('{"version": 1}')
    hass_storage[PEOPLE_KEY] = {"version": 1}  # Store can't read it
    await hass.config.async_set_time_zone("UTC")
    entries = [pet_entry(hass, e, new_pet=True) for e in ("test_pet", "moss")]
    await hass.config_entries.async_setup(entries[0].entry_id)  # sets up both
    await hass.async_block_till_done()
    assert all(e.state is ConfigEntryState.LOADED for e in entries)
    assert hass.data[DOMAIN]["people"].data == {"people": {}, "weather": {}}
    [copy] = storage_dir.glob(f"{PEOPLE_KEY}.damaged.*")
    assert copy.read_text() == '{"version": 1}'
    found = issue(hass, "people_damaged")
    assert found.translation_placeholders == {"backup": copy.name}


async def test_a_save_simply_missing_says_so(
    hass: HomeAssistant,
    now: float,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    """No file, no .corrupt copy, no new_pet marker: the third wording."""
    entry = await load(hass)
    await runs(hass, entry, freezer)
    assert hass.states.get("sensor.pip_life_stage").state == "egg"
    assert not welcomed(hass)
    found = issue(hass)
    assert found.translation_key == "save_damaged_missing"
    assert found.translation_placeholders == {"pet": "Pip", "entry_id": "test_pet"}
    assert not list(storage_dir.glob(f"{STORE_KEY}.damaged.*"))
    strings = json.loads((Path(backup.__file__).parent / "strings.json").read_text())[
        "issues"
    ]["save_damaged_missing"]
    assert strings == {
        "title": "{pet}'s save file was damaged",
        "description": "{pet}'s save file is missing, so {pet} started again as an "
        "egg. No copy of the old file was left to restore.",
    }
    # Nothing to restore, so a clean load later keeps it until it's dismissed.
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert issue(hass).translation_key == "save_damaged_missing"


async def test_a_catch_up_that_fails_keeps_the_pet_as_read(
    hass: HomeAssistant,
    now: float,
    freezer: FrozenDateTimeFactory,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(
        now - 3600, hunger=40.0, generation=3, care_misses=4
    )
    with patch.object(model, "catch_up", side_effect=RuntimeError("a bug")):
        entry = await load(hass)
    state = entry.runtime_data.state
    assert (state.generation, state.care_misses, state.hunger) == (3, 4, 40.0)
    assert state.last_updated == now  # the time away skipped, not caught up
    assert issue(hass).translation_key == "save_damaged"
    assert list(storage_dir.glob(f"{STORE_KEY}.damaged.*"))
    await runs(hass, entry, freezer)
    assert hass.states.get("sensor.pip_life_stage").state != "egg"


async def test_a_restored_save_clears_its_repair(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any], storage_dir: Path
) -> None:
    hass_storage[STORE_KEY] = damage(now, "hunger", "x")
    with patch.object(model.PetState, "from_dict", side_effect=RuntimeError("bug")):
        entry = await load(hass)
    [copy] = storage_dir.glob(f"{STORE_KEY}.damaged.*")
    # A clean load with the backup still there: a salvaged pet, still told.
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert issue(hass).translation_placeholders["backup"] == copy.name
    # Renamed back over the save, as the steps say: the repair goes.
    assert await hass.config_entries.async_unload(entry.entry_id)
    copy.unlink()
    hass_storage[STORE_KEY] = hatched_pet(now)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert issue(hass) is None


async def test_a_first_tick_failing_every_restart_backs_up_once(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=40.0)
    with patch.object(PetCoordinator, "_tick", side_effect=RuntimeError("boom")):
        entry = await load(hass)
        [first] = storage_dir.glob(f"{STORE_KEY}.damaged.*")
        for _ in range(2):
            assert await hass.config_entries.async_reload(entry.entry_id)
            await hass.async_block_till_done()
    assert list(storage_dir.glob(f"{STORE_KEY}.damaged.*")) == [first]
    assert issue(hass).translation_placeholders["backup"] == first.name


async def test_the_log_names_no_user(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    storage_dir: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    secret = "user-id-0123456789abcdef"
    with patch.object(model.PetState, "from_dict", side_effect=KeyError(secret)):
        await load(hass)
    warnings = [r for r in caplog.records if r.levelname == "WARNING"]
    assert any("KeyError" in r.getMessage() for r in warnings)
    assert not any(secret in r.getMessage() for r in warnings)
    assert all(r.exc_info is None for r in warnings)


async def test_an_empty_people_wrapper_is_damage_but_no_file_is_none_yet(
    hass: HomeAssistant, hass_storage: dict[str, Any], storage_dir: Path
) -> None:
    await People(hass).async_load()
    assert issue(hass, "people_damaged") is None  # no file: none yet
    raw = '{"version": 1, "key": "virtual_pet.people", "data": null}'
    (storage_dir / PEOPLE_KEY).write_text(raw)
    hass_storage[PEOPLE_KEY] = {"version": 1, "key": PEOPLE_KEY, "data": None}
    await People(hass).async_load()
    [copy] = storage_dir.glob(f"{PEOPLE_KEY}.damaged.*")
    assert copy.read_text() == raw
    assert issue(hass, "people_damaged").translation_placeholders == {
        "backup": copy.name
    }


async def test_a_restored_people_file_clears_its_repair(
    hass: HomeAssistant, hass_storage: dict[str, Any], storage_dir: Path
) -> None:
    (storage_dir / PEOPLE_KEY).write_text('{"version": 1}')
    hass_storage[PEOPLE_KEY] = {"version": 1}  # Store can't read it
    await People(hass).async_load()
    [copy] = storage_dir.glob(f"{PEOPLE_KEY}.damaged.*")
    hass_storage[PEOPLE_KEY] = people({"people": {}, "weather": {}})
    await People(hass).async_load()  # the backup still there: still told
    assert issue(hass, "people_damaged") is not None
    copy.unlink()  # renamed back
    await People(hass).async_load()
    assert issue(hass, "people_damaged") is None


async def test_a_catch_up_failing_every_restart_backs_up_once(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    storage_dir: Path,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now - 3600, hunger=40.0)
    with patch.object(model, "catch_up", side_effect=RuntimeError("a bug")):
        entry = await load(hass)
        [first] = storage_dir.glob(f"{STORE_KEY}.damaged.*")
        for _ in range(2):
            assert await hass.config_entries.async_reload(entry.entry_id)
            await hass.async_block_till_done()
    assert list(storage_dir.glob(f"{STORE_KEY}.damaged.*")) == [first]
    assert issue(hass).translation_placeholders["backup"] == first.name
