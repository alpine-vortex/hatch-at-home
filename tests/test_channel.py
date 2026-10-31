"""The private channel: virtual_pet/subscribe, and the commands beside it."""

from __future__ import annotations

from datetime import timedelta
import json
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL
from homeassistant.core import Context, HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_mock_service,
)

from custom_components.virtual_pet import model
from custom_components.virtual_pet.const import DOMAIN

from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, settle, setup

LEVELS = model.R.BOND_LEVELS


async def subscribe(
    client: Any, shared: bool = False, entity_id: str = "sensor.pip_life_stage"
) -> dict[str, Any]:
    """Subscribe; the snapshot that follows the result."""
    await client.send_json_auto_id(
        {"type": f"{DOMAIN}/subscribe", "entity_id": entity_id, "shared": shared}
    )
    result = await client.receive_json()
    assert result["success"], result
    snapshot = await client.receive_json()
    assert snapshot["type"] == "event" and snapshot["id"] == result["id"]
    return snapshot["event"]


# Pushes that came in while waiting for a command's result, by connection.
EARLY: dict[int, list[dict[str, Any]]] = {}


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


@pytest.fixture(autouse=True)
def no_early_pushes() -> None:
    EARLY.clear()


async def pushed(client: Any) -> list[dict[str, Any]]:
    """Everything pushed to this connection so far (up to a ping's pong)."""
    await client.send_json_auto_id({"type": "ping"})
    out = EARLY.pop(id(client), [])
    while (msg := await client.receive_json())["type"] != "pong":
        assert msg["type"] == "event", msg
        out.append(msg["event"])
    return out


async def command(client: Any, kind: str, **data: Any) -> dict[str, Any]:
    """A command's result (a push may come first: it's kept for pushed())."""
    await client.send_json_auto_id({"type": f"{DOMAIN}/{kind}", **data})
    while (msg := await client.receive_json())["type"] == "event":
        EARLY.setdefault(id(client), []).append(msg["event"])
    return msg


def today() -> str:
    return dt_util.now().date().isoformat()


async def test_each_person_hears_only_their_own_bond(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    hass_read_only_user: Any,
    hass_read_only_access_token: str,
) -> None:
    ada, ada_token = await a_user(hass)
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        bonds={
            me: {"points": LEVELS[4], "nickname": "sunbeam", "favourite": "simon"},
            ada.id: {"points": LEVELS[1]},
        },
        notify_users=[me],
    )
    await setup(hass)
    mine = await subscribe(await hass_ws_client(hass))
    assert mine["mine"] == {
        "bond": {"level": 5, "nickname": "sunbeam", "favourite": "simon"},
        "notify_me": True,
        "wish_for_you": False,
        "my_day": False,
        "baby_talk": False,
        "birthday_phone": False,
        "birthday_kept": False,
    }
    assert mine["house"] == {"media": None, "dream": None}
    assert mine["moments"] == []
    assert dt_util.parse_datetime(mine["now"]) == dt_util.utcnow()
    # A non-admin, and a read-only user: their own, or none, and nothing of mine.
    theirs = await subscribe(await hass_ws_client(hass, ada_token))
    assert theirs["mine"]["bond"] == {"level": 2}
    assert theirs["mine"]["notify_me"] is False
    read_only = await subscribe(await hass_ws_client(hass, hass_read_only_access_token))
    assert read_only["mine"]["bond"] is None
    for payload in (theirs, read_only):
        text = json.dumps(payload)
        assert me not in text and "sunbeam" not in text and "simon" not in text


async def test_a_shared_screen_hears_the_house_only(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(
        now, bonds={me: {"points": LEVELS[4], "nickname": "sunbeam"}}
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator._fire([{"type": "bond_up", "user": me, "level": 5}])
    shared = await hass_ws_client(hass)
    snapshot = await subscribe(shared, shared=True)
    assert snapshot["mine"] is None and snapshot["moments"] == []
    coordinator._fire([{"type": "bond_up", "user": me, "level": 6}])
    coordinator._fire([{"type": "watching", "title": "Bluey"}])
    events = await pushed(shared)
    media = events[0]["moment"]
    assert media == {"type": "watching", "title": "Bluey", "at": media["at"]}
    assert events[1:] == [{"house": {"media": media, "dream": None}}]
    assert "sunbeam" not in json.dumps(events) and me not in json.dumps(events)
    # Subscribing again replays the same media moment (the card dedupes by at).
    again = await subscribe(shared, shared=True)
    assert again["house"]["media"] == media and again["moments"] == [media]
    # A personal card's snapshot has its own moments, newest first, then the house's.
    personal = await subscribe(await hass_ws_client(hass))
    assert [m.get("level") for m in personal["moments"]] == [6, 5, None]
    assert all("user" not in m for m in personal["moments"])


async def test_pushes_go_to_their_person_only(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    ada, ada_token = await a_user(hass)
    me = hass_admin_user.id
    # One point short of level 2: a care press brings bond_up.
    hass_storage[STORE_KEY] = hatched_pet(
        now, happiness=50.0, bonds={me: {"points": LEVELS[1] - 1}}
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.wish = {"kind": "bath", "day": today(), "granted": False}
    mine_client = await hass_ws_client(hass)
    theirs_client = await hass_ws_client(hass, ada_token)
    await subscribe(mine_client)
    await subscribe(theirs_client)
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": "button.pip_praise"},
        blocking=True,
        context=Context(user_id=me),
    )
    events = await pushed(mine_client)
    moment = next(e["moment"] for e in events if "moment" in e)
    assert moment == {"type": "bond_up", "level": 2, "at": moment["at"]}
    assert [e["mine"]["bond"] for e in events if "mine" in e] == [{"level": 2}]
    assert await pushed(theirs_client) == []
    # My own switches, each pushed when it changes.
    entity = {"entity_id": "sensor.pip_life_stage"}
    for kind in ("notify_me", "my_day", "baby_talk", "birthday_phone"):
        assert (await command(mine_client, kind, **entity, enabled=True))["success"]
        events = await pushed(mine_client)
        assert [e["mine"][kind] for e in events] == [True], kind
        assert await pushed(theirs_client) == []
    # Answering the birthday question is pushed at once, to me alone.
    answer = {**entity, "question": "birthday", "answer": "07-01"}
    assert (await command(mine_client, "answer", **answer))["success"]
    events = await pushed(mine_client)
    assert [e["mine"]["birthday_kept"] for e in events] == [True]
    assert await pushed(theirs_client) == []
    # Forgetting my data turns them off, and an open card doesn't bring it back.
    assert (await command(mine_client, "forget_me"))["success"]
    (event,) = await pushed(mine_client)
    assert event["mine"]["my_day"] is False and event["mine"]["baby_talk"] is False
    assert me not in hass.data[DOMAIN]["people"].data["people"]
    # The tick pushes too: today's wish aimed at me, to me alone...
    coordinator.state.wish = {
        "kind": "bath",
        "day": today(),
        "granted": False,
        "for": me,
        "for_name": "Sam",
    }
    await settle(hass, freezer, model.R.TICK_MINUTES * 60)
    assert [e["mine"]["wish_for_you"] for e in await pushed(mine_client)] == [True]
    assert await pushed(theirs_client) == []
    # ...and this morning's dream of a show, to everyone.
    coordinator.state.dream = {"kind": "watching", "title": "Bluey", "day": today()}
    await settle(hass, freezer, model.R.TICK_MINUTES * 60)
    dream = {"kind": "watching", "title": "Bluey"}
    for client in (mine_client, theirs_client):
        assert [e["house"]["dream"] for e in await pushed(client)] == [dream]
    # A fast-forward's simulated moments stay off the channel.
    coordinator._fire([{"type": "bond_up", "user": me, "level": 3}], simulated=True)
    assert await pushed(mine_client) == []
    assert me not in coordinator._private  # forgotten earlier, and not refilled


async def test_the_channel_outlives_a_reload_and_hears_the_pet_go(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(now, bonds={me: {"points": LEVELS[4]}})
    config = await setup(hass)
    client = await hass_ws_client(hass)
    await subscribe(client)
    watchers = hass.data[DOMAIN]["watchers"]
    for user, shared, send in watchers[config.entry_id].values():
        assert (user, shared, callable(send)) == (me, False, True)
    # An options save reloads the pet: a fresh snapshot, without asking again.
    assert await hass.config_entries.async_reload(config.entry_id)
    await hass.async_block_till_done()
    (snapshot,) = await pushed(client)
    assert set(snapshot) == {"mine", "house", "moments", "now"}
    assert snapshot["mine"]["bond"] == {"level": 5}
    # Mid-reload (unloaded), a new subscribe is told there's no pet, for now.
    assert await hass.config_entries.async_unload(config.entry_id)
    await client.send_json_auto_id(
        {
            "type": f"{DOMAIN}/subscribe",
            "entity_id": "sensor.pip_life_stage",
            "shared": False,
        }
    )
    assert (await client.receive_json())["error"]["code"] == "no_pet"
    # Removed: the open subscription hears it's gone.
    await hass.config_entries.async_remove(config.entry_id)
    await hass.async_block_till_done()
    assert await pushed(client) == [{"gone": True}]
    assert config.entry_id not in watchers


async def test_the_commands_stay_off_the_bus(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
) -> None:
    ada, ada_token = await a_user(hass)
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    client = await hass_ws_client(hass, ada_token)
    events = async_capture_events(hass, MATCH_ALL)
    entity = {"entity_id": "sensor.pip_life_stage"}
    assert (await command(client, "notify_me", **entity, enabled=True))["success"]
    assert ada.id in coordinator.state.notify_users
    assert (await command(client, "my_day", **entity, enabled=True))["success"]
    assert hass.data[DOMAIN]["people"].my_day(ada.id)
    await hass.async_block_till_done()
    assert not [
        e
        for e in events
        if e.event_type == "call_service" or e.event_type.startswith(f"{DOMAIN}_")
    ]
    # Turning them off again.
    assert (await command(client, "notify_me", **entity, enabled=False))["success"]
    assert ada.id not in coordinator.state.notify_users
    assert (await command(client, "my_day", **entity, enabled=False))["success"]
    assert not hass.data[DOMAIN]["people"].my_day(ada.id)
    # No pet owns the entity: an error, for every channel command.
    hass.states.async_set("sensor.nobody", "1")
    for kind, data in (
        ("notify_me", {"enabled": True}),
        ("my_day", {"enabled": True}),
        ("set_shell", {"finish": None}),
        ("subscribe", {"shared": False}),
    ):
        reply = await command(client, kind, entity_id="sensor.nobody", **data)
        assert reply["error"]["code"] == "no_pet", kind


async def test_someone_home_names_nobody(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    me = await hass.auth.async_create_user("Me")
    stranger = await hass.auth.async_create_user("Stranger")
    hass.states.async_set("person.me", "not_home", {"user_id": me.id})
    hass.states.async_set("person.stranger", "not_home", {"user_id": stranger.id})
    hass_storage[STORE_KEY] = hatched_pet(
        now, bonds={me.id: {"points": LEVELS[4], "nickname": "sunbeam"}}
    )
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    MockConfigEntry(
        domain="mobile_app", data={"user_id": stranger.id, "device_name": "theirs"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_theirs")
    coordinator.state.notify_users = [stranger.id]
    fired = async_capture_events(hass, f"{DOMAIN}_someone_home")
    # Someone with no bond comes home: a nameless moment, and no phone hears it.
    hass.states.async_set("person.stranger", "home", {"user_id": stranger.id})
    await settle(hass, freezer)
    await hass.async_block_till_done(wait_background_tasks=True)
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert moments[0] == {"type": "someone_home", "at": moments[0]["at"]}
    assert [e.data for e in fired] == [{"pet_id": coordinator.pet_id}]
    assert phone == []
    # A close friend soon after: their own cheer, and no second "someone".
    freezer.tick(timedelta(minutes=5))
    hass.states.async_set("person.me", "home", {"user_id": me.id})
    await settle(hass, freezer)
    # Theirs (privacy P3b): not on the public list, in their own snapshot.
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert not any(m["type"] == "friend_home" for m in moments)
    snapshot = coordinator.channel_snapshot(object(), me.id, False)
    assert snapshot["moments"][0]["type"] == "friend_home"
    assert len(fired) == 1


async def test_a_moment_from_before_the_pet_is_live_reaches_the_snapshot(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_admin_user: Any,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(now, bonds={me: {"points": LEVELS[4]}})
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    # Not the live coordinator (a load in progress): it keeps the moment, sends none.
    del hass.data[DOMAIN]["pets"][coordinator.pet_id]
    coordinator._to_channel({"type": "bond_up", "user": me, "level": 6}, "t")
    coordinator._to_channel({"type": "watching", "title": "Bluey"}, "t")
    hass.data[DOMAIN]["pets"][coordinator.pet_id] = coordinator
    snapshot = coordinator.channel_snapshot(object(), me, False)
    assert {"type": "bond_up", "level": 6, "at": "t"} in snapshot["moments"]
    assert snapshot["house"]["media"]["title"] == "Bluey"


async def test_forget_my_data_clears_my_private_moments(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
) -> None:
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(now, bonds={me: {"points": LEVELS[4]}})
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator._to_channel({"type": "bond_up", "user": me, "level": 6}, "t")
    coordinator._to_channel({"type": "bond_up", "user": "other", "level": 2}, "t")
    client = await hass_ws_client(hass)
    assert (await command(client, "forget_me"))["success"]
    assert me not in coordinator._private
    assert len(coordinator._private["other"]) == 1
