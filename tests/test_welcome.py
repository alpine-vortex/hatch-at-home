"""Welcoming a new pet into the house, and the dashboard its notifications open."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries
from homeassistant.components import persistent_notification
from homeassistant.const import CONF_NAME
from homeassistant.core import Context, HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_mock_service,
)

from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet, now, settle, setup  # noqa: F401

WELCOME = "Pip, a new virtual pet, just moved in! Say hi ♥"


@pytest.fixture
async def phones(hass: HomeAssistant) -> dict[str, list]:
    """Two people, each with the Home Assistant app on a phone; nobody opted in."""
    calls = {}
    for name, phone in (("Me", "My Phone"), ("Other", "Their Phone")):
        user = await hass.auth.async_create_user(name)
        MockConfigEntry(
            domain="mobile_app", data={"user_id": user.id, "device_name": phone}
        ).add_to_hass(hass)
        service = f"mobile_app_{phone.lower().replace(' ', '_')}"
        calls[name] = async_mock_service(hass, "notify", service)
    return calls


async def add_pet(hass: HomeAssistant, **extra: Any) -> config_entries.ConfigEntry:
    """Add a pet the way a person does: through the integration's setup form."""
    await hass.config.async_set_time_zone("UTC")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": config_entries.SOURCE_USER}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_NAME: "Pip", "world": "woodland", **extra}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    return result["result"]


def sidebar(hass: HomeAssistant) -> dict[str, Any]:
    return persistent_notification._async_get_or_create_notifications(hass)


def welcome(name: str) -> str:
    return WELCOME.replace("Pip", name)


async def notify_me(hass: HomeAssistant, name: str, entity_id: str) -> None:
    """A person turns "notify me" on for a pet."""
    user = next(u for u in await hass.auth.async_get_users() if u.name == name)
    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": entity_id, "enabled": True},
        blocking=True,
        context=Context(user_id=user.id),
    )
    await hass.async_block_till_done()


async def test_the_first_pet_is_welcomed_in_the_sidebar_only(
    hass: HomeAssistant, phones: dict[str, list]
) -> None:
    welcomed = async_capture_events(hass, f"{DOMAIN}_welcomed")
    entry = await add_pet(hass, dashboard="lovelace-pets/shelf/")
    assert entry.options == {"dashboard": "/lovelace-pets/shelf"}
    assert phones["Me"] == phones["Other"] == []  # nobody asked to hear yet
    note = sidebar(hass)[f"{DOMAIN}_{entry.entry_id}_welcome"]
    assert note["message"].startswith(WELCOME)
    assert "(/lovelace-pets/shelf)" in note["message"]
    assert [e.data for e in welcomed] == [{"pet_id": entry.entry_id}]  # no names

    # Removing the pet takes its welcome out of the sidebar.
    assert await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    assert f"{DOMAIN}_{entry.entry_id}_welcome" not in sidebar(hass)


async def test_a_new_pet_is_welcomed_on_the_phones_that_asked(
    hass: HomeAssistant, phones: dict[str, list]
) -> None:
    """Only people with "notify me" on for another pet here hear of a new one."""
    welcomed = async_capture_events(hass, f"{DOMAIN}_welcomed")
    await add_pet(hass)
    await notify_me(hass, "Me", "sensor.pip_mood")
    for calls in phones.values():
        calls.clear()
    moss = await add_pet(hass, name="Moss", dashboard="lovelace-pets/shelf/")
    assert [c.data["message"] for c in phones["Me"]] == [welcome("Moss")]
    assert phones["Other"] == []
    data = phones["Me"][0].data["data"]
    assert data["url"] == data["clickAction"] == "/lovelace-pets/shelf"
    assert data["tag"] == f"{DOMAIN}_{moss.entry_id}_welcome"
    assert f"{DOMAIN}_{moss.entry_id}_welcome" in sidebar(hass)
    assert [e.data for e in welcomed][-1] == {"pet_id": moss.entry_id}
    assert all(set(e.data) == {"pet_id"} for e in welcomed)


async def test_without_a_dashboard_the_welcome_has_no_link(
    hass: HomeAssistant, phones: dict[str, list]
) -> None:
    entry = await add_pet(hass)
    assert entry.options == {}
    note = sidebar(hass)[f"{DOMAIN}_{entry.entry_id}_welcome"]
    assert note["message"] == WELCOME
    await notify_me(hass, "Me", "sensor.pip_mood")
    phones["Me"].clear()
    await add_pet(hass, name="Moss")
    assert "url" not in phones["Me"][0].data["data"]


async def test_restarts_and_reloads_never_welcome_again(
    hass: HomeAssistant, phones: dict[str, list]
) -> None:
    await add_pet(hass)
    await notify_me(hass, "Me", "sensor.pip_mood")
    phones["Me"].clear()
    moss = await add_pet(hass, name="Moss")
    assert await hass.config_entries.async_reload(moss.entry_id)
    await hass.async_block_till_done()
    assert len(phones["Me"]) == 1


async def test_an_existing_pet_is_not_new(
    hass: HomeAssistant,
    now: float,  # noqa: F811
    hass_storage: dict[str, Any],
    phones: dict[str, list],
) -> None:
    """A pet with a save file (after an upgrade, or a new generation) isn't new."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    assert phones["Me"] == phones["Other"] == []
    assert not [k for k in sidebar(hass) if k.endswith("_welcome")]


async def test_the_dashboard_opens_from_every_notification(
    hass: HomeAssistant,
    now: float,  # noqa: F811
    hass_storage: dict[str, Any],
    phones: dict[str, list],
    freezer,
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now, hunger=26.0)
    entry = await setup(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "sleep": {"bedtime": "21:00:00", "wake_time": "07:00:00"},
            "weather": {"comfort_low": 18, "comfort_high": 26},
            "room": {},
            "activity": {
                "zone": "zone.home",
                "away_after": 2,
                "sitter_settles": True,
            },
            "sky": {},
            "privacy": {"privacy": True},
            "notifications": {"dashboard": "/pets"},
        },
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert entry.options["dashboard"] == "/pets"
    await hass.async_block_till_done()
    me = next(u for u in await hass.auth.async_get_users() if u.name == "Me")
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
    assert [c.data["message"] for c in phones["Me"]] == ["Pip is hungry!"]
    assert phones["Me"][0].data["data"]["clickAction"] == "/pets"
    assert phones["Other"] == []
