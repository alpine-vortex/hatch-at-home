"""The call-response blueprint, loaded into a real automation."""

from __future__ import annotations

import asyncio
from datetime import timedelta
from pathlib import Path
import shutil
from typing import Any

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    async_fire_time_changed,
    async_mock_service,
)

BLUEPRINT = (
    Path(__file__).parent.parent
    / "blueprints/automation/virtual_pet/call_response.yaml"
)
PET = "pet-entry-id"
EVENT = "virtual_pet_call_started"


@pytest.fixture
def calls(hass: HomeAssistant) -> dict[str, list]:
    """Stand-in services, so the test sees what the blueprint asks for."""
    return {
        name: async_mock_service(hass, *name.split("."))
        for name in (
            "light.turn_on",
            "scene.create",
            "scene.turn_on",
            "media_player.play_media",
        )
    }


async def setup(hass: HomeAssistant, tmp_path: Path, **inputs: Any) -> None:
    """Copy the blueprint in, as importing it would, and use it."""
    target = tmp_path / "blueprints/automation/virtual_pet"
    target.mkdir(parents=True)
    shutil.copy(BLUEPRINT, target / "call_response.yaml")
    hass.config.config_dir = str(tmp_path)
    hass.states.async_set("light.lamp", "on", {"brightness": 120})
    hass.states.async_set("light.dark", "off")
    hass.states.async_set("media_player.speaker", "idle")
    config = {
        "id": "pet_calls",
        "alias": "pet calls",
        "use_blueprint": {
            "path": "virtual_pet/call_response.yaml",
            "input": {"pet": PET, "lights": ["light.lamp", "light.dark"], **inputs},
        },
    }
    assert await async_setup_component(hass, "automation", {"automation": config})
    await hass.async_block_till_done()


async def settle() -> None:
    """Let the automation run up to its next wait.

    Not async_block_till_done: that waits for the run to end, and the run ends
    with the cooldown's delay.
    """
    for _ in range(50):
        await asyncio.sleep(0)


async def call(hass: HomeAssistant, **data: Any) -> None:
    hass.bus.async_fire(EVENT, {"pet_id": PET, "reason": "hungry", **data})
    await settle()


async def later(hass: HomeAssistant, **delta: float) -> None:
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(**delta))
    await settle()


def quiet_now(hours: int) -> dict[str, str]:
    """Quiet hours from an hour ago until `hours` from now."""
    now = dt_util.now()
    return {
        "quiet_start": (now - timedelta(hours=1)).strftime("%H:%M:%S"),
        "quiet_end": (now + timedelta(hours=hours)).strftime("%H:%M:%S"),
    }


async def test_flash_touches_only_lamps_that_are_on(hass, tmp_path, calls):
    await setup(hass, tmp_path)
    await call(hass)
    [flash] = calls["light.turn_on"]
    assert flash.data["entity_id"] == ["light.lamp"]
    assert flash.data["flash"] == "short"
    assert "brightness" not in flash.data
    assert not calls["scene.create"]


async def test_colour_pulse_restores_the_lamps(hass, tmp_path, calls):
    await setup(hass, tmp_path, pulse="colour", colour=[0, 128, 255], pulse_seconds=3)
    await call(hass)
    [snapshot] = calls["scene.create"]
    assert snapshot.data["snapshot_entities"] == ["light.lamp"]
    [pulse] = calls["light.turn_on"]
    assert pulse.data["rgb_color"] == [0, 128, 255]
    assert "brightness" not in pulse.data
    assert not calls["scene.turn_on"]
    await later(hass, seconds=4)
    [restore] = calls["scene.turn_on"]
    assert restore.data["entity_id"] == [f"scene.{snapshot.data['scene_id']}"]


async def test_no_lamps_on_means_no_light_calls(hass, tmp_path, calls):
    await setup(hass, tmp_path)
    hass.states.async_set("light.lamp", "off")
    await call(hass)
    assert not calls["light.turn_on"]


async def test_another_pet_or_fast_forward_is_ignored(hass, tmp_path, calls):
    await setup(hass, tmp_path)
    await call(hass, pet_id="another-pet")
    await call(hass, simulated=True)
    assert not calls["light.turn_on"]


async def test_cooldown_drops_repeated_calls(hass, tmp_path, calls):
    await setup(hass, tmp_path, cooldown=30)
    await call(hass)
    await call(hass)
    assert len(calls["light.turn_on"]) == 1
    await later(hass, minutes=31)
    await call(hass)
    assert len(calls["light.turn_on"]) == 2


async def test_sound_plays_outside_quiet_hours(hass, tmp_path, calls):
    # Quiet hours that ended an hour ago: from three hours ago until one ago.
    now = dt_util.now()
    await setup(
        hass,
        tmp_path,
        speaker="media_player.speaker",
        sound="media-source://media_source/local/chirp.mp3",
        quiet_start=(now - timedelta(hours=3)).strftime("%H:%M:%S"),
        quiet_end=(now - timedelta(hours=1)).strftime("%H:%M:%S"),
    )
    await call(hass)
    [play] = calls["media_player.play_media"]
    assert play.data["entity_id"] == ["media_player.speaker"]
    assert play.data["media_content_id"].endswith("chirp.mp3")


async def test_quiet_hours_mute_the_sound_but_not_the_lamps(hass, tmp_path, calls):
    await setup(
        hass,
        tmp_path,
        speaker="media_player.speaker",
        sound="media-source://media_source/local/chirp.mp3",
        **quiet_now(2),
    )
    await call(hass)
    assert not calls["media_player.play_media"]
    assert len(calls["light.turn_on"]) == 1


async def test_quiet_hours_can_be_switched_off(hass, tmp_path, calls):
    await setup(
        hass,
        tmp_path,
        speaker="media_player.speaker",
        sound="media-source://media_source/local/chirp.mp3",
        quiet_hours=False,
        **quiet_now(2),
    )
    await call(hass)
    assert len(calls["media_player.play_media"]) == 1


async def test_no_speaker_means_no_sound(hass, tmp_path, calls):
    await setup(hass, tmp_path, sound="media-source://media_source/local/chirp.mp3")
    await call(hass)
    assert not calls["media_player.play_media"]


async def test_a_broken_speaker_keeps_the_lamps_and_cooldown(hass, tmp_path, calls):
    def broken(call: ServiceCall) -> None:
        raise HomeAssistantError("speaker offline")

    hass.services.async_register("media_player", "play_media", broken)
    await setup(
        hass,
        tmp_path,
        speaker="media_player.speaker",
        sound="media-source://media_source/local/chirp.mp3",
        quiet_hours=False,
    )
    await call(hass)
    await call(hass)
    assert len(calls["light.turn_on"]) == 1
