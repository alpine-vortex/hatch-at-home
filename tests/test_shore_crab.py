"""Scheduled shore crab invitations follow the HA local calendar."""

from datetime import UTC, datetime
import random
from typing import Any
from zoneinfo import ZoneInfo

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.virtual_pet import model, rates, shore_crab
from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet


async def test_startup_captures_the_previous_visit_before_replacing_it(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    zone = ZoneInfo("America/Los_Angeles")
    await hass.config.async_set_time_zone(zone.key)
    # The following day is 25 hours long. Its end is Sunday night local time.
    starts = datetime(2029, 11, 3, 11, tzinfo=zone).timestamp()
    expires = datetime(2029, 11, 5, tzinfo=zone).timestamp()
    freezer.move_to(datetime.fromtimestamp(starts - 1, UTC))
    visit = {
        "day": "2029-11-03",
        "id": "shorecrab",
        "world": "tidepool",
        "hours": "day",
        "from": starts,
        "until": starts + rates.VISIT_HOURS * 3600,
        "credited": False,
    }
    hass_storage[STORE_KEY] = hatched_pet(starts - 1, species="otter", visit=visit)
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={"name": "Pip", "world": "tidepool", "new_pet": True},
        entry_id="test_pet",
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    pet = entry.runtime_data
    assert "shore_crab" not in pet._house_view()["gameplay"]

    # A view at the start can use the saved schedule before its next tick.
    freezer.move_to(datetime.fromtimestamp(starts, UTC))
    offer = pet._house_view()["gameplay"]["shore_crab"]
    assert offer["starts_at"] == starts
    assert offer["expires_at"] == expires
    assert shore_crab.KEY not in getattr(pet.state, "unknown", {})
    assert await hass.config_entries.async_unload(entry.entry_id)

    # No visit tick or greeting ran before shutdown. Startup credits and
    # overwrites the schedule, retaining the invitation in the same pet save.
    freezer.move_to(datetime(2029, 11, 4, 8, tzinfo=zone))
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    pet = entry.runtime_data
    assert pet.state.visit["day"] == "2029-11-04"
    assert pet._house_view()["gameplay"]["shore_crab"] == offer
    assert pet.state.collection["tidepool"]["visitors"] == {"shorecrab": "2029-11-03"}

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    pet = entry.runtime_data
    assert pet._house_view()["gameplay"]["shore_crab"] == offer
    assert pet.state.collection["tidepool"]["visitors"] == {"shorecrab": "2029-11-03"}

    freezer.move_to(datetime.fromtimestamp(expires, UTC))
    assert shore_crab.view(pet) is None
    assert shore_crab.capture_offer(pet)
    assert shore_crab.KEY not in pet.state.unknown


@pytest.mark.parametrize("malformed", [None, True, "crab", {"version": 1}])
def test_malformed_retained_offer_is_ignored_and_pruned(malformed: Any) -> None:
    class Pet:
        state = model.PetState.new("Pip", 1.0)
        world = "tidepool"
        known_visitors = {"tidepool": {"shorecrab"}}
        pet_id = "test"
        _now = staticmethod(lambda: 200000.0)

    pet = Pet()
    pet.state.age_hours = 30
    pet.state.unknown = {shore_crab.KEY: malformed}
    assert shore_crab.view(pet) is None
    assert shore_crab.capture_offer(pet)
    assert pet.state.unknown == {}


async def test_a_new_generation_and_other_world_cannot_reuse_the_invitation(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
) -> None:
    await hass.config.async_set_time_zone("UTC")
    current = datetime(2026, 10, 31, 12, tzinfo=UTC).timestamp()
    freezer.move_to(datetime.fromtimestamp(current, UTC))
    visit = {
        "day": "2026-10-31",
        "id": "shorecrab",
        "world": "tidepool",
        "hours": "day",
        "from": current - 3600,
        "until": current + (rates.VISIT_HOURS - 1) * 3600,
        "credited": False,
    }
    hass_storage[STORE_KEY] = hatched_pet(current, species="otter", visit=visit)
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Pip",
        data={"name": "Pip", "world": "tidepool"},
        entry_id="test_pet",
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    pet = entry.runtime_data
    assert shore_crab.view(pet)
    assert shore_crab.KEY in pet.state.unknown
    pet.world = "pond"
    assert shore_crab.view(pet) is None
    pet.world = "tidepool"
    pet.state.age_hours = (
        dict(rates.STAGE_STARTS)["adult"] + rates.LAY_EGG_AFTER_ADULT_HOURS
    )
    pet.state, _ = model.lay_egg(pet.state, current, random.Random(1))
    assert model.life_stage(pet.state) == "egg"
    assert shore_crab.view(pet) is None
    pet.state.age_hours = 30
    assert shore_crab.view(pet) is None
