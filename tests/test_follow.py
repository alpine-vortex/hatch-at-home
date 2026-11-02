"""Follow-ups (fresh-expand F1) and the softer morning (E13): the store, the
rules, and where a typed text and a mood may never go."""

from __future__ import annotations

from datetime import date, timedelta
import json
import logging
from pathlib import Path
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import async_capture_events

from custom_components.virtual_pet import people as P
from custom_components.virtual_pet.const import DOMAIN
from custom_components.virtual_pet.people import STORE_KEY as PEOPLE_KEY, People

from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, setup

SECRET = "my driving test"  # said back as "your driving test"
SAID = "your driving test"
COMPONENT = Path(__file__).parent.parent / "custom_components" / "virtual_pet"


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-11-01 19:00:00+00:00")  # a Sunday evening (UTC)
    return dt_util.utcnow().timestamp()


def event(**over: Any) -> dict[str, Any]:
    out = {
        "kind": "big_day",
        "asked": "2026-11-01",
        "due": "2026-11-02",
        "until": "2026-11-02",
        "said": [],
    }
    return out | over


# --- The pure rules ----------------------------------------------------------------


def test_a_typed_text_is_cleaned_and_cut():
    assert P.clean_text("  my​  exam\x07 \n") == "your exam"
    assert P.clean_text("a" * 21) == "a" * 20
    assert P.clean_text("My big day") == "your big day"
    # "my" stays when "your" wouldn't fit the 20.
    at_cap = "my " + "b" * 17
    assert P.clean_text(at_cap) == at_cap
    assert P.clean_text("‮⁦") is None
    assert P.clean_text(None) is None and P.clean_text(42) is None
    assert P.clean_text({"a": "b"}) is None


@pytest.mark.parametrize(
    ("today", "asked"),
    [
        ("2026-11-01", True),  # Sunday
        ("2026-11-02", True),
        ("2026-11-03", True),
        ("2026-11-04", True),
        ("2026-11-05", True),  # Thursday
        ("2026-11-06", False),  # Friday
        ("2026-11-07", False),  # Saturday
    ],
)
def test_a_big_day_is_asked_sunday_to_thursday(today: str, asked: bool):
    assert (P.follow_question({}, today) == "big_day") is asked


def test_a_big_day_ask_is_weekly_capped_and_never_while_open():
    person: dict[str, Any] = {}
    assert P.follow_question(person, "2026-11-01", early_tomorrow=True) is None
    P.mark_asked(person, "2026-11-01", 18, "big_day")
    assert person["asked"]["later_kind"] == "big_day"
    assert person["follow_asked"] == ["2026-11-01"]
    assert P.follow_question(person, "2026-11-03") is None  # once a week
    assert P.follow_question(person, "2026-11-08") == "big_day"  # a week on
    person["follow"] = {"event": event()}
    assert P.follow_question(person, "2026-11-08") is None  # one is open
    del person["follow"]
    person["follow_asked"] = ["2026-11-06", "2026-11-07"]
    person["follow_last"] = {}
    assert P.follow_question(person, "2026-11-08") is None  # 2 in 7 days


def ask(person: dict[str, Any], today: str, hour: int = 18, **kw: Any) -> Any:
    return P.choose_question(
        person,
        today,
        hour,
        level=5,
        to_bed_minutes=600,
        has_forecast=False,
        came_home=None,
        rested=False,
        **kw,
    )


def asked_all() -> dict[str, Any]:
    """Someone the one-time questions are done for."""
    return {
        "likes": {"fav_weather": "sun", "fav_season": "spring"},
        "birthday_skipped": True,
    }


def test_a_big_day_takes_the_fallback_slot_only():
    days = [date(2026, 11, 1) + timedelta(days=i) for i in range(14)]
    for day in days:
        today = day.isoformat()
        own = P.rotation(day)
        got = ask(asked_all(), today)
        if own == "how_day":
            assert got == "how_day", today  # the rotation's own keeps its evening
        elif day.weekday() in (6, 0, 1, 2, 3):
            assert got == "big_day", today  # a dream or guess that can't be asked now
        else:
            assert got in (None, "how_day"), today
        assert ask(asked_all(), today, early_tomorrow=True) != "big_day"
        assert ask(asked_all(), today, hour=15) != "big_day"


@pytest.mark.parametrize(
    "bad",
    [
        {"kind": "soft"},  # a mood isn't an event
        {"kind": "parade"},
        {"asked": "2026-13-45"},
        {"due": "2026-10-31"},  # before it was asked
        {"until": "2026-11-09"},  # more than 7 days
        {"said": ["noon"]},
        {"said": "morning"},
        {"choice": "dig"},  # only a game's
        {"pet": "abc"},  # only a game's or a trick's
        {"text": SECRET},  # memory only
        {"extra": 1},
    ],
)
def test_a_bad_saved_event_is_dropped(bad: dict[str, Any]):
    record = P._person({"follow": {"event": event(**bad)}, "my_day": True})
    assert "follow" not in record and record["my_day"] is True


def test_only_events_are_saved_and_the_ask_record_is_checked():
    record = P._person(
        {
            "follow": {"event": event(), "mood": {"kind": "soft", "day": "x"}},
            "asked": {"day": "2026-11-01", "later": True, "later_kind": "<b>"},
            "follow_asked": ["2026-11-01", "nope", 3],
            "follow_last": {"big_day": "2026-11-01", "parade": "2026-11-01"},
        }
    )
    assert record["follow"] == {"event": event()}
    assert record["asked"] == {"day": "2026-11-01", "later": True}
    assert record["follow_asked"] == ["2026-11-01"]
    assert record["follow_last"] == {"big_day": "2026-11-01"}


# --- The store -------------------------------------------------------------------


async def test_text_and_mood_live_in_memory_only(hass: HomeAssistant):
    people = People(hass)
    people.person("u1")["asked"] = {"day": "2026-11-01", "later_kind": "big_day"}
    people.open_follow("u1", "big_day", "2026-11-01", SECRET)
    people.set_mood("u2", "2026-11-01")
    saved = json.dumps(people.data)
    assert "driving" not in saved and "soft" not in saved and "u2" not in saved
    assert people._texts == {"u1": SAID}
    assert people.data["people"]["u1"]["follow"]["event"] == event()
    # A reload (a restart) has the event, without its text; the mood is gone.
    await people.async_save_now()
    again = People(hass)
    await again.async_load()
    assert again.open_event("u1") == event()
    assert again._texts == {} and again._moods == {}
    assert again.follow_due("u1", "2026-11-02", 9) == {
        "kind": "big_day",
        "beat": "morning",
    }
    # forget_me takes the record, the text and the mood.
    people.set_mood("u1", "2026-11-01")
    await people.forget("u1")
    assert "u1" not in people._texts and "u1" not in people._moods
    assert people.follow_due("u1", "2026-11-02", 9) == {}


async def test_an_expired_event_is_dropped_on_load(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
):
    stale = event(asked="2026-10-29", due="2026-10-30", until="2026-10-31")
    bad = event(asked="2026-10-01", due="2026-10-30", until="2026-10-31")  # 30 days
    hass_storage[PEOPLE_KEY] = {
        "version": 1,
        "minor_version": 1,
        "key": PEOPLE_KEY,
        "data": {
            "people": {
                "u1": {"follow": {"event": stale}},
                "u2": {"follow": {"event": bad}},
            },
            "weather": {},
        },
    }
    people = People(hass)
    await people.async_load()
    await hass.async_block_till_done()
    assert people.data["people"] == {"u1": {}, "u2": {}}
    assert "follow" not in json.dumps(hass_storage[PEOPLE_KEY]["data"])


async def test_a_big_days_beats_once_each_then_gone(hass: HomeAssistant):
    people = People(hass)
    people.open_follow("u1", "big_day", "2026-11-01", SECRET)
    assert people.follow_due("u1", "2026-11-01", 20) == {}  # not until tomorrow
    assert people.follow_due("u1", "2026-11-02", 8) == {
        "kind": "big_day",
        "beat": "morning",
        "text": SAID,
    }
    assert people.follow_due("u1", "2026-11-02", 9) == {}  # once
    assert people.follow_due("u2", "2026-11-02", 9) == {}  # theirs only
    assert people.follow_due("u1", "2026-11-02", 17) == {
        "kind": "big_day",
        "beat": "evening",
        "text": SAID,
    }
    assert people.follow_due("u1", "2026-11-02", 18) == {}
    assert people.open_event("u1") is None and people._texts == {}
    # An evening seen first: the morning is skipped. Past its day: pruned.
    people.open_follow("u1", "big_day", "2026-11-03", None)
    assert people.follow_due("u1", "2026-11-04", 19)["beat"] == "evening"
    people.open_follow("u1", "big_day", "2026-11-05", "x")
    assert people.follow_due("u1", "2026-11-07", 9) == {}
    assert people.open_event("u1") is None and people._texts == {}


async def test_a_soft_morning_the_next_day_only(hass: HomeAssistant):
    people = People(hass)
    people.set_mood("u1", "2026-11-01")
    assert people.follow_due("u1", "2026-11-01", 20) == {}
    assert people.follow_due("u1", "2026-11-02", 15) == {
        "kind": "soft",
        "beat": "morning",
    }
    assert people.follow_due("u1", "2026-11-02", 16) == {}
    people.set_mood("u1", "2026-11-01")
    people.prune("2026-11-03")  # a day missed: gone
    assert people._moods == {}


# --- Through the websocket ----------------------------------------------------------


async def answer(client: Any, question: str, ans: str, **extra: Any) -> dict[str, Any]:
    await client.send_json_auto_id(
        {
            "type": f"{DOMAIN}/answer",
            "entity_id": "sensor.pip_life_stage",
            "question": question,
            "answer": ans,
            **extra,
        }
    )
    return await client.receive_json()


async def follow(client: Any) -> dict[str, Any]:
    await client.send_json_auto_id(
        {"type": f"{DOMAIN}/follow", "entity_id": "sensor.pip_life_stage"}
    )
    msg = await client.receive_json()
    assert msg["success"], msg
    return msg["result"]


async def test_a_big_day_end_to_end_keeps_its_words_to_itself(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
    caplog: pytest.LogCaptureFixture,
):
    from custom_components.virtual_pet.diagnostics import (
        async_get_config_entry_diagnostics,
    )

    # Our own records at every level; websocket_api at INFO, where a schema failure
    # logs (at ERROR, with the value). Its DEBUG logs every message: said in the guide.
    caplog.set_level(logging.INFO)
    caplog.set_level(logging.DEBUG, logger="custom_components.virtual_pet")
    bus = async_capture_events(hass, MATCH_ALL)
    ada, token = await a_user(hass)
    other, other_token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup(hass)
    pet = config.runtime_data
    people = pet.people
    client = await hass_ws_client(hass, token)
    theirs = await hass_ws_client(hass, other_token)
    # Not asked today: refused, and nothing kept.
    msg = await answer(client, "big_day", "yes", text=SECRET)
    assert msg["error"]["code"] == "not_asked"
    assert people._texts == {}
    people.person(ada.id)["asked"] = {"day": "2026-11-01", "later": True}
    P.mark_asked(people.person(ada.id), "2026-11-01", 19, "big_day")
    # A wrong-typed and an over-long text: no log record holds them.
    msg = await answer(client, "big_day", "yes", text={"secret": "zebra-kite"})
    assert msg["success"] and people._texts == {}
    msg = await answer(client, "big_day", "yes", text="quokka" * 40)
    assert msg["success"] and people._texts == {ada.id: "quokka" * 3 + "qu"}
    msg = await answer(client, "big_day", "yes", text=SECRET)
    assert msg["success"] and people._texts == {ada.id: SAID}
    # A shared screen's text is refused (the yes stands).
    msg = await answer(theirs, "big_day", "yes", text="pelican", shared=True)
    assert msg["error"]["code"] == "not_asked"  # nobody asked them
    # Nowhere but the reply to them.
    await hass.async_block_till_done()
    await people.async_save_now()
    state_text = json.dumps([s.as_dict() for s in hass.states.async_all()], default=str)
    diag = json.dumps(
        await async_get_config_entry_diagnostics(hass, config), default=str
    )
    stored = json.dumps(hass_storage, default=str)
    mine = json.dumps([pet._mine(ada.id), pet._house_view()], default=str)
    for where in (state_text, diag, stored, mine, caplog.text, repr(bus)):
        for secret in ("driving", "zebra", "quokka", "pelican"):
            assert secret not in where
    assert '"follow"' not in diag and "soft" not in diag
    # The next morning: the beat with its text, to Ada once; others get {}.
    freezer.move_to("2026-11-02 09:00:00+00:00")
    assert await follow(theirs) == {}
    assert await follow(client) == {"kind": "big_day", "beat": "morning", "text": SAID}
    assert await follow(client) == {}
    # forget_me: nothing left to say.
    await client.send_json_auto_id({"type": f"{DOMAIN}/forget_me"})
    assert (await client.receive_json())["success"]
    freezer.move_to("2026-11-02 18:00:00+00:00")
    assert await follow(client) == {}
    for secret in ("driving", "zebra", "quokka", "pelican"):
        assert secret not in caplog.text and secret not in repr(bus)


async def test_a_tough_day_is_a_softer_morning_and_nothing_else(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
):
    ada, token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup(hass)
    people = config.runtime_data.people
    client = await hass_ws_client(hass, token)
    # Without today's how_day: refused. "great" and "ok" never reach the server.
    assert (await answer(client, "how_day", "tough"))["error"]["code"] == "not_asked"
    for kept_on_the_card in ("great", "ok"):
        msg = await answer(client, "how_day", kept_on_the_card)
        assert msg["error"]["code"] == "invalid_answer"
    P.mark_asked(people.person(ada.id), "2026-11-01", 19, "how_day")
    assert (await answer(client, "how_day", "tough"))["success"]
    assert people._moods == {ada.id: {"kind": "soft", "day": "2026-11-01"}}
    assert "soft" not in json.dumps(people.data)
    assert await follow(client) == {}  # not today
    freezer.move_to("2026-11-02 07:30:00+00:00")
    assert await follow(client) == {"kind": "soft", "beat": "morning"}
    assert await follow(client) == {}


def test_no_reader_outside_the_people_store_and_its_commands_touches_follow_ups():
    # Notifications, Assist and the LLM API never read a follow-up, a text or a mood.
    for name in ("notify.py", "intent.py", "llm.py", "sensor.py"):
        path = COMPONENT / name
        if not path.exists():
            continue
        source = path.read_text()
        for word in ("follow", "_texts", "_moods", "clean_text"):
            assert word not in source, (name, word)


# --- The favourite visitor (F4): a preference, per world ----------------------------


def test_the_favourite_visitor_is_asked_per_world():
    person = {"likes": {"fav_weather": "sun", "fav_season": "spring"}}
    assert P.once_due(person, "2026-11-01", 15, 5, world="woodland") == "fav_visitor"
    assert P.once_due(person, "2026-11-01", 15, 5) != "fav_visitor"  # no world, no ask
    P.mark_once(person, "fav_visitor", "2026-11-01", "woodland")
    assert person["likes_asked"] == {"fav_visitor_woodland": ["2026-11-01"]}
    person["likes"][P.fav_visitor_key("woodland")] = "chickadee"
    later = (date(2026, 11, 1) + timedelta(days=30)).isoformat()
    assert P.once_due(person, later, 15, 5, world="woodland") != "fav_visitor"
    assert (
        P.once_due(person, later, 15, 5, world="pond") == "fav_visitor"
    )  # a new world


async def test_a_favourite_visitor_is_one_of_its_worlds_and_theirs_alone(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    now: float,
):
    ada, token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup(hass)
    pet = config.runtime_data
    ids = [v["id"] for v in pet.visitors]
    client = await hass_ws_client(hass, token)
    msg = await answer(client, "fav_visitor", "not-a-visitor")
    assert not msg["success"]
    assert pet._mine(ada.id)["fav_visitor"] is None
    msg = await answer(client, "fav_visitor", ids[0])
    assert msg["success"], msg
    assert pet._mine(ada.id)["fav_visitor"] == ids[0]
    assert pet.people.data["people"][ada.id]["likes"] == {
        P.fav_visitor_key(pet.world): ids[0]
    }
    other, _ = await a_user(hass)
    assert pet._mine(other.id)["fav_visitor"] is None
    await client.send_json_auto_id({"type": f"{DOMAIN}/forget_me"})
    assert (await client.receive_json())["success"]
    assert pet._mine(ada.id)["fav_visitor"] is None
