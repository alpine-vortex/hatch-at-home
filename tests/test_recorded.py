"""Nothing personal in the recorder's database (privacy P3b; plan test 6).

The bus capture (test_public) shows what was fired; this shows what reached
the database Home Assistant keeps. Phone messages may call someone by their
nickname: those are the notify service's own calls (kept and disclosed, by
the owner's decision), never a pet's event or a state.
"""

from __future__ import annotations

from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.db_schema import (
    EventData,
    Events,
    EventTypes,
    StateAttributes,
    States,
    StatesMeta,
)
from homeassistant.components.recorder.util import session_scope
from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.components.recorder.common import (
    async_wait_recording_done,
)

from .test_public import NICKNAME, now, scripted_day  # noqa: F401 (now: a fixture)


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(recorder_db_url, enable_custom_integrations):
    """The recorder's database has to be ready before Home Assistant starts."""
    yield


def recorded(
    hass: HomeAssistant,
) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """Every recorded event (type, data) and state's (entity, attributes)."""
    with session_scope(hass=hass, read_only=True) as session:
        events = [
            (event_type or "", data or "")
            for event_type, data in session.query(
                EventTypes.event_type, EventData.shared_data
            )
            .select_from(Events)
            .outerjoin(EventTypes, Events.event_type_id == EventTypes.event_type_id)
            .outerjoin(EventData, Events.data_id == EventData.data_id)
        ]
        attrs = [
            (entity_id or "", shared or "")
            for entity_id, shared in session.query(
                StatesMeta.entity_id, StateAttributes.shared_attrs
            )
            .select_from(States)
            .outerjoin(StatesMeta, States.metadata_id == StatesMeta.metadata_id)
            .outerjoin(
                StateAttributes, States.attributes_id == StateAttributes.attributes_id
            )
        ]
    return events, attrs


async def test_nothing_personal_is_recorded(
    recorder_mock: Any,
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = await scripted_day(hass, hass_storage, freezer, now, monkeypatch)
    await async_wait_recording_done(hass)
    events, attrs = await get_instance(hass).async_add_executor_job(recorded, hass)
    ours = [(t, d) for t, d in events if t.startswith("virtual_pet_")]
    assert any(t == "virtual_pet_wish_made" for t, _ in ours)  # the day was recorded
    for secret in day["secrets"]:
        for event_type, data in ours:
            assert secret not in data, (event_type, secret)
    # The nickname, anywhere at all: only in a notify call (the phone message,
    # which is recorded: kept by the owner's decision, and disclosed).
    named = [(t, d) for t, d in events if NICKNAME in d]
    assert named
    for event_type, data in named:
        assert event_type == "call_service" and '"domain":"notify"' in data, event_type
    # The pet's states: the care log's "by" is the only person's name kept, and
    # it is the HA user's display name ("Zeb Owner"), not a secret searched for.
    pets = [(e, a) for e, a in attrs if e.startswith(("sensor.pip_", "switch.pip_"))]
    assert any(e == "sensor.pip_life_stage" for e, _ in pets)
    for secret in day["secrets"]:
        for entity_id, shared in pets:
            assert secret not in shared, (entity_id, secret)
