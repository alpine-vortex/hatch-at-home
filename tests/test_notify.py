"""What the phones are told, and how it gets there."""

from __future__ import annotations

import asyncio
from datetime import date
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
    assert notify.holiday(date(2026, 10, 31)) == "halloween"
    assert (
        notify.holiday(date(2026, 10, 30)) is None
        and notify.holiday(date(2026, 11, 1)) is None
    )
    text = notify.message({"type": "holiday", "holiday": "halloween"}, "Pip", {})
    assert text == "Happy Halloween! Pip is dressed up and ready to trick or treat 🎃"
    assert notify.message({"type": "holiday", "holiday": "nope"}, "Pip", {}) is None


def test_thanksgiving_is_the_fourth_thursday_of_november():
    # 1 November on a Sunday, a Thursday and a Friday: the earliest and latest dates.
    assert notify.thanksgiving(2026) == date(2026, 11, 26)
    assert notify.thanksgiving(2029) == date(2029, 11, 22)
    assert notify.thanksgiving(2024) == date(2024, 11, 28)
    assert notify.holiday(date(2026, 11, 26)) == "thanksgiving"
    assert (
        notify.holiday(date(2026, 11, 19)) is None
        and notify.holiday(date(2026, 11, 27)) is None
    )
    text = notify.message({"type": "holiday", "holiday": "thanksgiving"}, "Pip", {})
    assert text == "Happy Thanksgiving! Pip is thankful for you 🦃"


def test_a_friend_is_told_by_nickname():
    assert notify.to_friend("Pip is hungry!", "sunbeam") == "Pip is hungry, sunbeam!"
    assert (
        notify.to_friend("Pip is sleepy. Lights out?", "bean")
        == "Pip is sleepy. Lights out, bean?"
    )
    holiday = notify.HOLIDAY_MORNINGS["thanksgiving"].format(name="Pip")
    assert notify.to_friend(holiday, "bean") == holiday


def test_send_offs_read_well():
    assert (
        notify.send_off("rain", "Pip", "sunbeam")
        == "Pip says: rain today, take an umbrella, sunbeam ☂"
    )
    assert (
        notify.send_off("hot", "Pip", None) == "Pip says: it's a hot one, stay cool! ☀"
    )


def test_poop_calls_recalls_and_a_sickness_told_already_send_no_call_push():
    def call(reason: str, **extra: object) -> dict:
        return {"type": "call_started", "reason": reason, **extra}

    sick = {"type": "became_sick", "cause": "poop"}
    assert notify.pushes(call("hunger"), [call("hunger")])
    assert not notify.pushes(call("dirty"), [call("dirty")])
    assert not notify.pushes(call("hunger", recall=True), [])
    assert notify.pushes(sick, [sick, call("sick")])
    assert not notify.pushes(call("sick"), [sick, call("sick")])
    assert notify.pushes(call("sick"), [call("sick")])
    assert notify.pushes({"type": "care_miss"}, [])


def _asking(pet_id: str, name: str, users: list[str], nick: str | None = None):
    return notify.Asking(pet_id, name, f"{name} is hungry!", users, lambda user: nick)


class _Phone:
    def __init__(self) -> None:
        self.sent: list[tuple[list[str], str]] = []

    def send(self, users: list[str], text: str):
        self.sent.append((users, text))
        return asyncio.sleep(0)


def _run(sends: list) -> None:
    async def all_of() -> None:
        await asyncio.gather(*sends)

    asyncio.run(all_of())


def test_a_recall_bundle_names_every_pet_still_asking():
    recalls, phone = notify.Recalls(), _Phone()
    pip = _asking("pip", "Pip", ["me"], nick="sunbeam")
    _run(recalls.update([pip], "pip", 0.0, phone.send))
    assert phone.sent == [(["me"], "Pip is hungry, sunbeam!")]  # one pet: its call
    mochi, bo = _asking("mochi", "Mochi", ["me"]), _asking("bo", "Bo", ["me", "you"])
    later = notify.R.RECALL_HOURS * 3600
    _run(recalls.update([pip, mochi], "mochi", later, phone.send))
    assert phone.sent[-1] == (["me"], "Mochi and Pip would like a visit")
    _run(recalls.update([pip, mochi, bo], "bo", 2 * later, phone.send))
    assert phone.sent[-2:] == [
        (["me"], "Bo, Mochi and Pip would like a visit"),
        (["you"], "Bo is hungry!"),
    ]


def test_a_recall_bundle_waits_4_hours_and_clears_once_nobody_asks():
    recalls, phone = notify.Recalls(), _Phone()
    pip, mochi = _asking("pip", "Pip", ["me"]), _asking("mochi", "Mochi", ["me"])
    _run(recalls.update([pip], "pip", 0.0, phone.send))
    # Another pet asks within 4 h: it stays on the card, no new buzz.
    _run(recalls.update([pip, mochi], "mochi", 3600.0, phone.send))
    assert len(phone.sent) == 1
    # Pip was the only pet the bundle named: answered, the bundle clears.
    _run(recalls.update([mochi], None, 3700.0, phone.send))
    assert phone.sent[-1] == (["me"], "clear_notification")
    assert recalls.shown == {}


def test_answering_one_pet_doesnt_rewrite_the_bundle():
    recalls, phone = notify.Recalls(), _Phone()
    pip, mochi = _asking("pip", "Pip", ["me"]), _asking("mochi", "Mochi", ["me"])
    _run(recalls.update([pip, mochi], "pip", 0.0, phone.send))
    assert phone.sent == [(["me"], "Mochi and Pip would like a visit")]
    _run(recalls.update([mochi], None, 60.0, phone.send))
    assert len(phone.sent) == 1  # no rewrite, no buzz
    _run(recalls.update([], None, 120.0, phone.send))
    assert phone.sent[-1] == (["me"], "clear_notification")
