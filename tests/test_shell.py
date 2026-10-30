"""The pet's shell finish: the finish lists, the service, the card's command."""

from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import EVENT_STATE_CHANGED, MATCH_ALL
from homeassistant.core import Context, HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events
import voluptuous as vol

from custom_components.virtual_pet import rates as R
from custom_components.virtual_pet.const import DOMAIN

from .test_channel import command
from .test_forget import a_user, add_moss
from .test_init import STORE_KEY, hatched_pet, settle, setup

ROOT = Path(__file__).parent.parent
FRONTEND = ROOT / "custom_components" / "virtual_pet" / "frontend"
STAGE = "sensor.pip_life_stage"
TEEN = 130.0  # hours old


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


def top_level_keys(block: str) -> list[str]:
    """The keys of a JS object literal's body, in order: names before a colon
    at the outer level, skipping strings and anything nested."""
    keys, depth, i = [], 0, 0
    while i < len(block):
        c = block[i]
        if c in "\"'`":
            i = block.index(c, i + 1)
        elif c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        elif depth == 0 and (m := re.match(r"(\w+)\s*:", block[i:])):
            if i == 0 or not re.match(r"\w", block[i - 1]):
                keys.append(m.group(1))
                i += m.end()
                continue
        i += 1
    return keys


def test_the_server_knows_every_finish_the_card_and_bench_draw() -> None:
    card = (FRONTEND / "hatch-pet-card.js").read_text()
    body = re.search(r"\nconst FINISHES = \{\n(.*?)\n\};\n", card, re.S)
    assert body is not None
    assert tuple(top_level_keys(body.group(1))) == R.SHELL_FINISHES
    bench = (ROOT / "scripts" / "bench.js").read_text()
    listed = re.search(r"\nconst FINISHES = \[(.*?)\];", bench, re.S)
    assert listed is not None
    assert tuple(re.findall(r'"(\w+)"', listed.group(1))) == R.SHELL_FINISHES
    assert len(set(R.SHELL_FINISHES)) == len(R.SHELL_FINISHES)
    stages = [name for name, _ in R.STAGE_STARTS]
    assert all(
        f in R.SHELL_FINISHES and stage in stages
        for f, stage in R.SHELL_UNLOCKS.items()
    )
    # A world's own finish is never one to earn.
    worlds = json.loads((FRONTEND / "worlds.json").read_text())
    for name, world in worlds.items():
        if finish := world.get("shell", {}).get("finish"):
            assert finish in R.SHELL_FINISHES and finish not in R.SHELL_UNLOCKS, name


async def set_shell(hass: HomeAssistant, entity_id: str, **data: Any) -> None:
    await hass.services.async_call(
        DOMAIN, "set_shell", {"entity_id": entity_id, **data}, blocking=True
    )


async def test_the_service_dresses_the_pet_and_a_reload_keeps_it(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)  # a child
    config = await setup(hass)
    attrs = hass.states.get(STAGE).attributes
    assert attrs["shell_finish"] is None
    assert "glitter" not in attrs["shell_finish_options"]
    assert attrs["shell_finish_options"][:6] == list(R.SHELL_FINISHES[:6])
    await set_shell(hass, "sensor.pip_mood", finish="stripes")  # any of its entities
    assert hass.states.get(STAGE).attributes["shell_finish"] == "stripes"
    # A show-off it hasn't grown into: refused, and nothing changes.
    with pytest.raises(ServiceValidationError) as err:
        await set_shell(hass, STAGE, finish="glitter")
    assert err.value.translation_key == "shell_locked"
    assert err.value.translation_placeholders == {"finish": "glitter", "stage": "teen"}
    assert hass.states.get(STAGE).attributes["shell_finish"] == "stripes"
    with pytest.raises(vol.Invalid):  # not a finish at all
        await set_shell(hass, STAGE, finish="holo")
    assert await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(STAGE).attributes["shell_finish"] == "stripes"
    # Leaving the finish out (or null) is its world's own again.
    await set_shell(hass, STAGE)
    assert hass.states.get(STAGE).attributes["shell_finish"] is None
    assert await hass.config_entries.async_unload(config.entry_id)
    assert hass_storage[STORE_KEY]["data"]["shell_finish"] is None


async def test_a_teen_may_wear_a_show_off_and_another_pet_keeps_its_own(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, age_hours=TEEN)
    await setup(hass)
    await add_moss(hass)  # a new egg
    assert hass.states.get(STAGE).attributes["shell_finish_options"] == list(
        R.SHELL_FINISHES
    )
    await set_shell(hass, STAGE, finish="glitter")
    await set_shell(hass, "sensor.moss_life_stage", finish="camo")
    assert hass.states.get(STAGE).attributes["shell_finish"] == "glitter"
    assert hass.states.get("sensor.moss_life_stage").attributes["shell_finish"] == (
        "camo"
    )
    await set_shell(hass, "sensor.moss_life_stage", finish=None)
    assert hass.states.get(STAGE).attributes["shell_finish"] == "glitter"


async def test_a_shell_this_version_doesnt_draw_loads_and_shows_as_none(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, shell_finish="holo")  # a later one's
    config = await setup(hass)
    assert hass.states.get(STAGE).attributes["shell_finish"] is None
    assert config.runtime_data.state.shell_finish == "holo"
    assert await hass.config_entries.async_unload(config.entry_id)
    assert hass_storage[STORE_KEY]["data"]["shell_finish"] == "holo"


async def test_the_shell_attributes_hold_still_between_picks(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    from custom_components.virtual_pet.sensor import LifeStageSensor

    hass_storage[STORE_KEY] = hatched_pet(now, shell_finish="dots")
    await setup(hass)
    before = hass.states.get(STAGE).attributes
    assert "shell_finish" not in LifeStageSensor._unrecorded_attributes  # one word
    await settle(hass, freezer, 5 * 60)  # a tick, no pick
    after = hass.states.get(STAGE).attributes
    for key in ("shell_finish", "shell_finish_options"):
        assert after[key] == before[key], key
    assert after["shell_finish"] == "dots"


async def test_the_card_picks_a_shell_without_saying_who(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    _, ada_token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)  # a child
    await setup(hass)
    client = await hass_ws_client(hass, ada_token)
    events = async_capture_events(hass, MATCH_ALL)
    entity = {"entity_id": STAGE}
    assert (await command(client, "set_shell", **entity, finish="hearts"))["success"]
    await hass.async_block_till_done()
    assert hass.states.get(STAGE).attributes["shell_finish"] == "hearts"
    assert not [
        e
        for e in events
        if e.event_type == "call_service" or e.event_type.startswith(f"{DOMAIN}_")
    ]
    changed = [
        e
        for e in events
        if e.event_type == EVENT_STATE_CHANGED and e.data["entity_id"] == STAGE
    ]
    assert changed and all(e.context.user_id is None for e in changed)
    reply = await command(client, "set_shell", **entity, finish="glow")
    assert reply["error"]["code"] == "shell_locked"
    reply = await command(client, "set_shell", **entity, finish="holo")
    assert reply["error"]["code"] == "invalid_format"
    assert hass.states.get(STAGE).attributes["shell_finish"] == "hearts"
    assert (await command(client, "set_shell", **entity, finish=None))["success"]
    assert hass.states.get(STAGE).attributes["shell_finish"] is None


async def test_an_automation_setting_the_shell_is_logged(
    hass: HomeAssistant, now: float, hass_storage: dict[str, Any]
) -> None:
    ada, _ = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    events = async_capture_events(hass, "call_service")
    await hass.services.async_call(
        DOMAIN,
        "set_shell",
        {"entity_id": STAGE, "finish": "waves"},
        blocking=True,
        context=Context(user_id=ada.id),
    )
    assert [e.context.user_id for e in events] == [ada.id]  # as its help says
