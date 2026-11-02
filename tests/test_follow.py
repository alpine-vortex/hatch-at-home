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
    # Said inside a line: no trailing punctuation or emoticon of their own (critique #8).
    assert P.clean_text("the dentist :(") == "the dentist"
    assert P.clean_text("exam!!") == "exam" and P.clean_text("party :D!") == "party"
    assert P.clean_text("a:b") == "a:b" and P.clean_text("?!") is None


@pytest.mark.parametrize(
    ("today", "asked"),
    [
        ("2026-11-01", True),  # Sunday
        ("2026-11-02", True),  # Monday
        ("2026-11-03", False),
        ("2026-11-04", False),
        ("2026-11-05", False),  # Thursday
        ("2026-11-06", False),  # Friday
        ("2026-11-07", False),  # Saturday
    ],
)
def test_anything_big_this_week_is_asked_sunday_and_monday(today: str, asked: bool):
    """Owner Q3 A, opp #2: the week ahead, asked as it starts."""
    assert (P.follow_question({}, today) == "big_day") is asked


def test_the_big_day_is_a_day_picked_this_week():
    assert P.big_day_pick("2026-11-01", "2026-11-05") == "2026-11-05"
    assert P.big_day_pick("2026-11-01", "2026-11-07") == "2026-11-07"  # 6 ahead
    for no in ("2026-11-01", "2026-11-08", "2026-10-31", "monday", None, 5):
        assert P.big_day_pick("2026-11-01", no) is None, no


def test_a_big_day_ask_is_weekly_capped_and_never_while_open():
    person: dict[str, Any] = {}
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
    args = {
        "level": 5,
        "to_bed_minutes": 600,
        "has_forecast": False,
        "came_home": None,
        "rested": False,
    } | kw
    return P.choose_question(person, today, hour, **args)


def asked_all() -> dict[str, Any]:
    """Someone the one-time questions are done for."""
    return {
        "likes": {"fav_weather": "sun", "fav_season": "spring"},
        "birthday_skipped": True,
    }


def test_a_follow_up_takes_the_slot_but_never_the_rotations_own_how_day():
    """FM Q1 A on the reconcile: a due follow-up takes the later slot from the
    fallback how_day and from the day's dream or guess, askable or not; never
    from the rotation's own how_day."""
    days = [date(2026, 11, 1) + timedelta(days=i) for i in range(14)]
    for day in days:
        today = day.isoformat()
        own = P.rotation(day)
        got = ask(asked_all(), today)
        near_bed = ask(asked_all(), today, to_bed_minutes=60)  # a dream askable now
        if own == "how_day":
            assert got == near_bed == "how_day", today  # keeps its evening
        elif day.weekday() in (6, 0):
            assert got == near_bed == "big_day", today
        elif day.weekday() == 4:
            assert got == near_bed == "weekend", today
        else:
            assert got in (None, "how_day"), today  # nothing of the house's to follow
            assert ask(asked_all(), today, pet_kinds=("game",)) == "game", today
        assert ask(asked_all(), today, hour=15) not in P.FOLLOW_QUESTIONS


def test_a_follow_up_left_unanswered_twice_rests_two_weeks():
    """Critique s2632 #6: two asks of a kind in a row with no "yes" (no answer,
    "no", "later") and it rests 14 days; a "yes" starts the count over."""
    person: dict[str, Any] = {}
    P.mark_asked(person, "2026-11-01", 18, "big_day")  # no answer
    assert P.follow_question(person, "2026-11-08") == "big_day"  # a week on
    P.mark_asked(person, "2026-11-08", 18, "big_day")  # "no"
    person["follow_asked"] = []  # the weekly cap aside
    assert person["follow_miss"] == {"big_day": 2}
    assert P.follow_question(person, "2026-11-15") is None  # resting
    assert P.follow_question(person, "2026-11-22") == "big_day"  # 14 days on
    person["follow_miss"] = {"big_day": 1}  # asked once more: then a "yes"
    record = P._person(person)
    assert record["follow_miss"] == {"big_day": 1}
    assert (
        P._person({"follow_miss": {"parade": 3, "weekend": "x"}})["follow_miss"] == {}
    )


async def test_a_yes_starts_the_rest_count_over(hass: HomeAssistant):
    people = People(hass)
    P.mark_asked(people.person("u1"), "2026-11-01", 18, "big_day")
    assert people.person("u1")["follow_miss"] == {"big_day": 1}
    people.open_follow("u1", "big_day", "2026-11-01")
    assert people.person("u1")["follow_miss"] == {}


def test_the_follow_ups_are_tried_in_order_each_weekly():
    person: dict[str, Any] = {}
    kinds = ("trick", "game")
    assert P.follow_question(person, "2026-11-06", pet_kinds=kinds) == "weekend"
    assert P.follow_question(person, "2026-11-02", pet_kinds=kinds) == "big_day"
    assert P.follow_question(person, "2026-11-05", pet_kinds=kinds) == "trick"
    assert P.follow_question(person, "2026-11-07", pet_kinds=kinds) == "trick"
    assert P.follow_question(person, "2026-11-07", pet_kinds=("game",)) == "game"
    assert P.follow_question(person, "2026-11-07") is None  # no pet's own
    P.mark_asked(person, "2026-11-07", 18, "trick")
    assert P.follow_question(person, "2026-11-09", pet_kinds=kinds) == "big_day"
    P.mark_asked(person, "2026-11-09", 18, "big_day")
    # A pet's own ask doesn't count against the week (audit s2635 M2): only the dated.
    assert person["follow_asked"] == ["2026-11-09"]
    assert P.follow_question(person, "2026-11-10", pet_kinds=kinds) == "game"
    person["follow_asked"] = ["2026-11-06", "2026-11-09"]
    assert P.follow_question(person, "2026-11-12") is None  # 2 dated in 7 days


def test_each_kinds_dates_and_beat():
    assert P.follow_dates("weekend", "2026-11-06") == ("2026-11-09", "2026-11-10")
    assert P.follow_dates("trick", "2026-11-06") == ("2026-11-09", "2026-11-11")
    assert P.follow_dates("game", "2026-11-06") == ("2026-11-07", "2026-11-07")
    assert P.follow_dates("big_day", "2026-11-06") == ("2026-11-07", "2026-11-07")
    weekend = event(kind="weekend", asked="2026-11-06", due="2026-11-09")
    weekend["until"] = "2026-11-10"
    assert P._event_beat(weekend, "2026-11-08", 9, "pet") is None  # Sunday: not yet
    assert P._event_beat(weekend, "2026-11-10", 20, "pet") == "monday"  # Tuesday too
    weekend["said"] = ["monday"]
    assert P._event_beat(weekend, "2026-11-10", 9, "pet") is None  # once
    trick = event(kind="trick", asked="2026-11-06", due="2026-11-09", pet="a")
    trick["until"] = "2026-11-11"
    assert P._event_beat(trick, "2026-11-09", 9, "a") == "shown"
    assert P._event_beat(trick, "2026-11-09", 9, "b") is None  # another pet
    assert P._event_beat(trick, "2026-11-12", 9, "a") is None  # past day 5


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
        {"kind": "game", "pet": "a"},  # a game needs its choice
        {"kind": "game", "pet": "a", "choice": "chess"},
        {"kind": "trick"},  # a trick needs its pet
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
    assert people.follow_due("u1", "2026-11-02", 18) == {}  # the morning's, said
    assert P.FOLLOW_EVENING_HOUR == 19  # late enough that the day is likely over
    assert people.follow_due("u1", "2026-11-02", 19) == {
        "kind": "big_day",
        "beat": "evening",
        "text": SAID,
        "ask": "big_how",  # audit s2635 H1: the card asks how it went
    }
    assert P.asked_later(people.person("u1"), "2026-11-02", "big_how")
    assert people.follow_due("u1", "2026-11-02", 20) == {}
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
    # The big day is a day picked this week (opp #2): none, or not this week, refused.
    for day in ({}, {"day": "2026-11-01"}, {"day": "2026-11-09"}):
        msg = await answer(client, "big_day", "yes", text="quokka", **day)
        assert msg["error"]["code"] == "not_asked" and people._texts == {}
    tomorrow = {"day": "2026-11-02"}
    msg = await answer(
        client, "big_day", "yes", text={"secret": "zebra-kite"}, **tomorrow
    )
    assert msg["success"] and people._texts == {}
    msg = await answer(client, "big_day", "yes", text="quokka" * 40, **tomorrow)
    assert msg["success"] and people._texts == {ada.id: "quokka" * 3 + "qu"}
    msg = await answer(client, "big_day", "yes", text=SECRET, **tomorrow)
    assert msg["success"] and people._texts == {ada.id: SAID}
    # The typing browser learns how long to keep its own copy (owner Q1 A), never more.
    assert msg["result"] == {"until": people.open_event(ada.id)["until"]}
    # A shared screen's text is refused (the yes stands).
    msg = await answer(
        theirs, "big_day", "yes", text="pelican", shared=True, **tomorrow
    )
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


async def test_the_big_days_evening_beat_is_its_how_did_it_go(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
):
    """Opp #1, audit s2635 H1, L1, L2: on the picked day the morning beat comes from
    the morning hour, the evening waits for 19 (no slot kept all afternoon), and the
    evening beat carries "how did it go?", taking the later slot even if used today;
    "tough" is how_day's; the event closes with it."""
    ada, token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    config = await setup(hass)
    pet = config.runtime_data
    people = pet.people
    client = await hass_ws_client(hass, token)
    P.mark_asked(people.person(ada.id), "2026-11-01", 19, "big_day")
    msg = await answer(client, "big_day", "yes", text=SECRET, day="2026-11-04")
    assert msg["result"] == {"until": "2026-11-04"}
    event = people.open_event(ada.id)
    assert (event["due"], event["until"]) == ("2026-11-04", "2026-11-04")
    freezer.move_to("2026-11-04 00:20:00+00:00")  # a night owl's look
    assert pet._mine(ada.id)["follow_at"] == []
    assert await follow(client) == {}
    freezer.move_to("2026-11-04 08:00:00+00:00")
    assert pet._mine(ada.id)["follow_at"] == ["look"]
    assert await follow(client) == {"kind": "big_day", "beat": "morning", "text": SAID}
    freezer.move_to("2026-11-04 15:00:00+00:00")
    assert pet._mine(ada.id)["follow_at"] == []  # the evening waits for its hour
    P.mark_asked(people.person(ada.id), "2026-11-04", 15, "how_day")  # slot used
    freezer.move_to("2026-11-04 19:30:00+00:00")
    assert pet._mine(ada.id)["follow_at"] == ["look"]
    assert await follow(client) == {
        "kind": "big_day",
        "beat": "evening",
        "text": SAID,
        "ask": "big_how",
    }
    assert people.open_event(ada.id) is None and people._texts == {}
    assert await follow(client) == {}
    for kept_on_the_card in ("great", "ok"):
        msg = await answer(client, "big_how", kept_on_the_card)
        assert msg["error"]["code"] == "invalid_answer"
    assert (await answer(client, "big_how", "tough"))["success"]
    assert people._moods == {ada.id: {"kind": "soft", "day": "2026-11-04"}}
    # Its softer morning from the morning hour too (L1).
    freezer.move_to("2026-11-05 01:00:00+00:00")
    assert pet._mine(ada.id)["follow_at"] == []
    assert await follow(client) == {}
    freezer.move_to("2026-11-05 07:00:00+00:00")
    assert await follow(client) == {"kind": "soft", "beat": "morning"}


def test_twelve_weeks_of_evenings_ask_the_dated_follow_ups_weekly():
    """Audit s2635 M2: a pet's own game and trick asks don't use up the week, so
    someone who looks in every evening (and says yes) is asked "anything big this
    week?" and "anything fun this weekend?" about once a week each."""
    person = asked_all()
    counts: dict[str, int] = {}
    trick_month = None
    for i in range(84):
        day = date(2026, 11, 1) + timedelta(days=i)
        today = day.isoformat()
        kinds = ("game",) + (("trick",) if trick_month != day.month else ())
        kind = ask(person, today, hour=20, pet_kinds=kinds)
        if kind is None:
            continue
        P.mark_asked(person, today, 20, kind)
        if kind == "trick":
            trick_month = day.month
        if kind in P.FOLLOW_QUESTIONS:
            counts[kind] = counts.get(kind, 0) + 1
            person["follow_miss"].pop(kind, None)  # a "yes" (no event kept here)
    assert counts.get("big_day", 0) >= 11, counts
    # Fridays that are the rotation's own how_day keep it (FM Q1 A on the reconcile).
    assert counts.get("weekend", 0) >= 8, counts
    assert counts.get("game", 0) >= 1, counts


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


# --- Weekend, game, trick (F5-F7) --------------------------------------------------


async def test_a_game_and_a_trick_are_this_pets_own(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    freezer: FrozenDateTimeFactory,
    now: float,
):
    ada, token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    pet = (await setup(hass)).runtime_data
    people = pet.people
    today = pet._today(pet._now())[0]
    person = people.person(ada.id)
    client = await hass_ws_client(hass, token)
    # Asked tonight: the choice is the answer, kept with this pet's id.
    P.mark_asked(person, today, 19, "game")
    await pet.async_answer(ada.id, "game", "dig")
    game = people.open_event(ada.id)
    assert game["choice"] == "dig" and game["pet"] == pet.pet_id
    assert game["due"] == game["until"] == P.tomorrow(today)
    assert pet._mine(ada.id)["follow_at"] == []  # not today
    freezer.tick(timedelta(days=1))
    assert pet._mine(ada.id)["follow_at"] == ["picker"]
    assert await pet.async_follow(ada.id) == {}  # a look never takes a game's beat
    await client.send_json_auto_id(
        {
            "type": f"{DOMAIN}/follow",
            "entity_id": "sensor.pip_life_stage",
            "at": "picker",
        }
    )
    msg = await client.receive_json()
    assert msg["result"] == {"kind": "game", "beat": "day", "choice": "dig"}
    assert (
        people.open_event(ada.id) is None
        and await pet.async_follow(ada.id, "picker") == {}
    )
    # A trick: "maybe later" keeps nothing; "yes" is shown from day 3 to day 5, here.
    today = pet._today(pet._now())[0]
    P.mark_asked(person, today, 19, "trick")
    await pet.async_answer(ada.id, "trick", "later")
    assert people.open_event(ada.id) is None
    await pet.async_answer(ada.id, "trick", "yes")
    assert people.open_event(ada.id)["pet"] == pet.pet_id
    freezer.tick(timedelta(days=2))
    assert await pet.async_follow(ada.id) == {}  # day 2: not yet
    assert await pet.async_follow(ada.id, "picker") == {}
    freezer.tick(timedelta(days=1))
    assert pet._mine(ada.id)["follow_at"] == ["look"]
    assert await pet.async_follow(ada.id) == {"kind": "trick", "beat": "shown"}
    assert people.open_event(ada.id) is None


async def test_another_pets_trick_stays_with_it(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
):
    ada, _ = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    pet = (await setup(hass)).runtime_data
    today = pet._today(pet._now())[0]
    pet.people.open_follow(ada.id, "trick", today, pet="another-pet")
    for _ in range(3):
        today = P.tomorrow(today)
    assert pet.people.follow_at(ada.id, today, 9, pet.pet_id) == []
    assert pet.people.follow_due(ada.id, today, 9, pet.pet_id) == {}
    assert pet.people.follow_due(ada.id, today, 9, "another-pet")["kind"] == "trick"


async def test_a_weekend_comes_back_on_monday_with_its_words(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
):
    freezer.move_to("2026-11-06 20:00:00+00:00")  # a Friday evening
    ada, _ = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    pet = (await setup(hass)).runtime_data
    people = pet.people
    today = pet._today(pet._now())[0]
    assert today == "2026-11-06"
    P.mark_asked(people.person(ada.id), today, 20, "weekend")
    await pet.async_answer(ada.id, "weekend", "no")
    assert people.open_event(ada.id) is None and people._texts == {}
    await pet.async_answer(ada.id, "weekend", "yes", "my parade")
    assert people.open_event(ada.id)["due"] == "2026-11-09"
    assert "text" not in people.open_event(ada.id) and people._texts == {
        ada.id: "your parade"
    }
    freezer.move_to("2026-11-08 09:00:00+00:00")  # Sunday: not yet
    assert await pet.async_follow(ada.id) == {}
    freezer.move_to("2026-11-09 08:00:00+00:00")
    assert await pet.async_follow(ada.id) == {
        "kind": "weekend",
        "beat": "monday",
        "text": "your parade",
    }
    assert people.open_event(ada.id) is None and people._texts == {}


async def test_a_trick_is_asked_only_with_one_left_once_a_month(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
):
    ada, _ = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now, bonds={"x": {"points": 0}})
    pet = (await setup(hass)).runtime_data
    pet.state.bonds[ada.id] = {"points": 0}
    assert pet._follow_kinds(ada.id) == ("game",)  # a child has no tricks to learn
    pet.state.age_hours = 130.0  # a teen: the first
    assert pet._follow_kinds(ada.id) == ("trick", "game")
    pet.state.age_hours = 336.0 + 30 * 24 * 2 + 1  # an adult in its 2nd trick month
    assert pet._follow_kinds(ada.id) == ("trick", "game")
    assert pet._trick_key() == f"{pet.state.generation}-2"
    pet.state.bonds[ada.id]["trick_asked"] = pet._trick_key()
    assert pet._follow_kinds(ada.id) == ("game",)  # asked this month
    pet.state.age_hours = 336.0 + 30 * 24 * 3 + 1  # all three learned
    assert pet._follow_kinds(ada.id) == ("game",)


async def test_a_full_look_still_has_room_for_the_question(
    hass: HomeAssistant, hass_storage: dict[str, Any], freezer: FrozenDateTimeFactory
):
    """Reconcile #2: a first look of 2 card lines and no notes still asks."""
    freezer.move_to("2026-11-01 18:00:00+00:00")  # a Sunday evening: a big day's eve
    ada, _ = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(dt_util.utcnow().timestamp())
    pet = (await setup(hass)).runtime_data
    pet.state.bonds[ada.id] = {"points": P.R.BOND_LEVELS[5], "since": "2026-10-20"}
    pet.state.wish = None
    pet.people.person(ada.id).update(asked_all())
    pet.people.person(ada.id)["likes"][P.fav_visitor_key(pet.world)] = "x"
    visit = await pet.async_visit(ada.id, queued=2)
    assert visit["notes"] == [] and visit["ask"] is not None, visit
