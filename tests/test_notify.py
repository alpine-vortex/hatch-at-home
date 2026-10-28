"""What the phones are told, and how it gets there."""

from __future__ import annotations

import asyncio
import logging

from homeassistant.core import HomeAssistant, ServiceCall
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.virtual_pet import notify


def test_every_call_reads_as_one_sentence():
    for reason in notify.CALLS:
        text = notify.message({"type": "call_started", "reason": reason}, "Pip", {})
        assert text is not None and text.startswith("Pip ")
        assert not text.endswith("?!") and text[-1] in "!?"
    assert notify.message({"type": "call_started", "reason": "energy"}, "Pip", {}) == (
        "Pip is sleepy. Lights out?"
    )


def test_quiet_events_send_nothing():
    for kind in ("pooped", "care", "woke_up", "news", "call_settled"):
        assert notify.message({"type": kind}, "Pip", {}) is None


def test_every_way_a_call_ends_clears_it():
    # Each of these leaves no call standing, so its notification must go.
    for kind in ("call_answered", "care_miss", "discipline_miss", "recovered"):
        assert kind in notify.CALL_OVER_EVENTS
    assert {"call_settled", "egg_laid", "fell_asleep"} <= notify.CALL_OVER_EVENTS


async def test_phones_are_told_at_once_and_a_broken_one_stays_quiet(
    hass: HomeAssistant, caplog: pytest.LogCaptureFixture
) -> None:
    started: list[str] = []
    release = asyncio.Event()

    async def slow(call: ServiceCall) -> None:
        started.append(call.service)
        await release.wait()

    async def broken(call: ServiceCall) -> None:
        raise RuntimeError("phone gone")

    for name, handler in (("Alex Phone", slow), ("Sam Phone", slow), ("Old", broken)):
        MockConfigEntry(domain="mobile_app", data={"device_name": name}).add_to_hass(
            hass
        )
        hass.services.async_register(
            "notify", f"mobile_app_{name.lower().replace(' ', '_')}", handler
        )
    task = hass.async_create_task(notify.send(hass, None, "Pip is hungry!", "tag"))
    await asyncio.sleep(0.01)
    # Both slow phones were asked before either answered.
    assert sorted(started) == ["mobile_app_alex_phone", "mobile_app_sam_phone"]
    release.set()
    with caplog.at_level(logging.WARNING):
        await task
    # The failure is logged without the phone's (often its owner's) name.
    warnings = [r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING]
    assert warnings and not any("old" in w.lower() for w in warnings)


def test_halloween_morning_reads_well_and_only_on_the_day():
    assert notify.holiday(10, 31) == "halloween"
    assert notify.holiday(10, 30) is None and notify.holiday(11, 1) is None
    text = notify.message({"type": "holiday", "holiday": "halloween"}, "Pip", {})
    assert text == "Happy Halloween! Pip is dressed up and ready to trick or treat 🎃"
    assert notify.message({"type": "holiday", "holiday": "nope"}, "Pip", {}) is None
