"""The private channel: virtual_pet/subscribe, and the commands beside it."""

from __future__ import annotations

from dataclasses import dataclass, field
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
from custom_components.virtual_pet.device_fx import DEVICE_SIGNAL_MAP

from .test_forget import a_user
from .test_init import STORE_KEY, hatched_pet, settle, setup, setup_with_house

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
    # Audit 0.43.0 F-03: the server's day and evening, for the card's gate.
    assert isinstance(mine["mine"].pop("follow_day"), str)
    assert isinstance(mine["mine"].pop("follow_evening"), bool)
    assert mine["mine"] == {
        "bond": {"level": 5, "nickname": "sunbeam", "favourite": "simon"},
        "notify_me": True,
        "wish_for_you": False,
        "my_day": False,
        "baby_talk": False,
        "birthday_phone": False,
        "birthday_kept": False,
        "memory_on": False,  # memory plan M1a: two booleans, nothing kept
        "memory_allowed": True,
        "open_on": False,  # favourite §5.3: their card doesn't open on it
        "rest_offer": False,  # favourite §6.4: not answered yet
        "has_open_on": False,  # favourite R3 audit: a favourite on any pet, none yet
        "house_open_on": False,  # an admin's: shared screens don't either
        "gift": None,  # visitors v2 V-E: their waiting gift, none yet
        "fav_visitor": None,  # F4: their favourite of this world's visitors
        "fav_weather": None,  # M0-c: their favourites, for "ask me again"
        "fav_season": None,
        "follow_at": [],  # F1: no follow-up beat waiting
    }
    visit = mine["house"].pop("visit")  # today's visit (or none): no person in it
    assert visit is None or set(visit) == {"day", "id", "hours", "from", "until"}
    assert mine["house"] == {"media": None, "dream": None, "basket": 0}  # no ids
    assert mine["moments"] == []
    assert dt_util.parse_datetime(mine["now"]) == dt_util.utcnow()
    # A non-admin, and a read-only user: their own, or none, and nothing of mine.
    theirs = await subscribe(await hass_ws_client(hass, ada_token))
    assert theirs["mine"]["bond"] == {"level": 2}
    assert theirs["mine"]["notify_me"] is False
    assert "house_open_on" not in theirs["mine"]  # not an admin
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
    assert len(events) == 2 and "visit" in events[1]["house"]  # the day's, or None
    events[1]["house"].pop("visit")
    # A shared screen's house view also says whether it opens on this pet (§5.3).
    assert events[1:] == [
        {"house": {"media": media, "dream": None, "basket": 0, "house_open_on": False}}
    ]
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
    # No visit today: a window ending mid-test may leave a find (a house push).
    coordinator.state.visit = {"day": today(), "world": "woodland", "id": None}
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
    for user, shared, send, admin in watchers[config.entry_id].values():
        assert (user, shared, callable(send), admin) == (me, False, True, True)
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


async def test_became_sick_moment_is_bare(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
) -> None:
    """2b: the public moment is {type, at}; the bus keeps the cause; a
    fast-forward (simulated) tick adds none."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    fired = async_capture_events(hass, f"{DOMAIN}_became_sick")
    sick = {"type": "became_sick", "cause": "poop"}
    coordinator._fire([sick], simulated=True)
    assert not [m for m in coordinator.moments if m["type"] == "became_sick"]
    coordinator._fire([sick])
    moments = [m for m in coordinator.moments if m["type"] == "became_sick"]
    assert len(moments) == 1
    assert set(moments[0]) == {"type", "at"}
    assert [e.data["cause"] for e in fired] == ["poop", "poop"]


async def test_became_sick_moment_keeps_only_the_weight_cause(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
) -> None:
    """gaps-seams 2b (owner Q3): a sickness from weight keeps its cause in the
    public moment, for the card's "too many snacks"; every other cause stays bare."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    for cause in ("low_health", "neglect", "poop", "something_new", None):
        coordinator._fire([{"type": "became_sick", "cause": cause}])
        latest = next(m for m in coordinator.moments if m["type"] == "became_sick")
        assert set(latest) == {"type", "at"}, cause
    coordinator._fire([{"type": "became_sick", "cause": "weight"}])
    latest = next(m for m in coordinator.moments if m["type"] == "became_sick")
    assert set(latest) == {"type", "at", "cause"} and latest["cause"] == "weight"
    assert all(
        m.get("cause") in (None, "weight")
        for m in coordinator.moments
        if m["type"] == "became_sick"
    )


async def test_the_evening_reaches_an_open_card_with_nothing_else_changing(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
) -> None:
    """Audit 0.43.0 F-03: mine.follow_evening is pushed by the coordinator's own
    5-minute tick (its listener is _push_watchers) when Home Assistant's hour
    reaches 19, to a card already open, with no care or other change."""
    me = hass_admin_user.id
    hass_storage[STORE_KEY] = hatched_pet(now, bonds={me: {"points": LEVELS[1]}})
    await setup(hass)
    coordinator = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    coordinator.state.visit = {"day": today(), "world": "woodland", "id": None}
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)  # at 14:00
    assert snapshot["mine"]["follow_evening"] is False
    freezer.move_to("2026-10-26 18:52:00+00:00")
    heard: list[bool] = []
    for _ in range(4):  # the ticks to 19:12; nothing else is touched
        await settle(hass, freezer, model.R.TICK_MINUTES * 60)
        heard += [
            e["mine"]["follow_evening"] for e in await pushed(client) if "mine" in e
        ]
    assert heard == [True]  # once, when the hour came


WEATHER_ON = {
    "rain": "rainy",
    "snow": "snowy",
    "fog": "fog",
    "storm": "lightning",
    "wind": "windy",
}


@dataclass(frozen=True)
class Rig:
    """What turns one key of DEVICE_SIGNAL_MAP on and off in a test house: the
    options that map it, the entity, its two states, and the keys that one house
    tells (the five weather keys all come from the one weather entity)."""

    options: dict[str, Any]
    entity: str
    on: str
    off: str
    on_attrs: dict[str, Any] = field(default_factory=dict)
    group: tuple[str, ...] = ()

    def put(self, hass: HomeAssistant, state: str, entity: str | None = None) -> None:
        attrs = self.on_attrs if state == self.on else {}
        hass.states.async_set(entity or self.entity, state, attrs)


def _rig(key: str, option: str, entity: str, on: str, off: str, **attrs: Any) -> Rig:
    return Rig({option: entity}, entity, on, off, attrs, (key,))


# One rig per key: a key cannot join the map without a row here (test_device_fx
# checks), and every test over the map turns its key on and off through it.
RIGS: dict[str, Rig] = {
    **{
        key: Rig(
            {"weather": "weather.home"},
            "weather.home",
            condition,
            "sunny",
            group=tuple(WEATHER_ON),
        )
        for key, condition in WEATHER_ON.items()
    },
    "lights": _rig("lights", "room_lights", "light.lamp", "on", "off"),
    "heating": _rig("heating", "heating", "switch.furnace", "on", "off"),
    "cooling": _rig("cooling", "cooling", "switch.fan", "on", "off"),
    "fireplace": _rig("fireplace", "fireplace", "switch.hearth", "on", "off"),
    "tv": _rig("tv", "tv", "media_player.tv", "playing", "off"),
    "music": _rig("music", "music", "media_player.speaker", "playing", "paused"),
}
fx_key = pytest.mark.parametrize("key", list(DEVICE_SIGNAL_MAP))


def wire(key: str, on: bool) -> bool | str:
    """The value `current[key]` carries for on or off (a bool, or the enum's)."""
    return ("on" if on else "off") if DEVICE_SIGNAL_MAP[key].type != "bool" else on


def kind_of(key: str, on: bool) -> list[str]:
    """The kind a change of `key` sends, as a list: none for an ambient-only key."""
    kinds = DEVICE_SIGNAL_MAP[key].kinds
    return [kinds[0 if on else 1]] if kinds else []


async def fx_house(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    now: float,
    key: str,
    on: bool | None = False,
    **options: Any,
) -> Any:
    """A pet whose house can tell `key` (and nothing else), the entity in the state
    `on` says (None: no entity yet), for the device bridge."""
    hass_storage[STORE_KEY] = hatched_pet(now)
    rig = RIGS[key]
    if on is not None:
        rig.put(hass, rig.on if on else rig.off)
    await setup_with_house(hass, **(rig.options | options))
    return hass.config_entries.async_entries(DOMAIN)[0].runtime_data


@fx_key
async def test_the_house_goes_out_before_the_device_onset_that_belongs_to_it(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
    key: str,
) -> None:
    """Plan 6.3 (M1): _sense_home only collects; the new `current` reaches the
    card first and the `fx` message second, one per transition, top level (never
    under `moment`, where an old card would keep it or say it). An ambient-only key
    has the house and no `fx`."""
    await fx_house(hass, hass_storage, now, key)
    rig = RIGS[key]
    client = await hass_ws_client(hass)
    snapshot = await subscribe(client)
    assert snapshot["house"]["device_fx"]["current"] == {
        k: wire(k, False) for k in rig.group
    }
    rig.put(hass, rig.on)
    await settle(hass, freezer)
    got = await pushed(client)
    onset = ["fx"] if kind_of(key, True) else []
    assert [next(iter(e)) for e in got] == ["house", *onset]
    assert got[0]["house"]["device_fx"]["current"][key] == wire(key, True)
    assert [e["fx"]["kind"] for e in got if "fx" in e] == kind_of(key, True)
    assert all(set(e) == {"fx"} for e in got[1:])
    assert not [e for e in got if "moment" in e and "fx" in json.dumps(e["moment"])]


@fx_key
async def test_a_push_with_nothing_new_sends_nothing_with_the_bridge_on(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
    key: str,
) -> None:
    """B4: `recent` is never in the diffed house, so it expiring is no change."""
    coordinator = await fx_house(hass, hass_storage, now, key)
    client = await hass_ws_client(hass)
    await subscribe(client)
    RIGS[key].put(hass, RIGS[key].on)
    await settle(hass, freezer)
    await pushed(client)
    assert bool(coordinator.device_fx.recent(coordinator._now())) == bool(
        kind_of(key, True)
    )
    freezer.tick(timedelta(seconds=120))  # the ring empties between pushes
    coordinator._push_watchers()
    coordinator._push_watchers()
    assert await pushed(client) == []
    assert "device_fx_recent" not in json.dumps(coordinator._house_view())


@fx_key
async def test_the_onset_reaches_every_watcher_once_the_shared_screen_too(
    hass: HomeAssistant,
    now: float,
    hass_storage: dict[str, Any],
    hass_ws_client: Any,
    hass_admin_user: Any,
    freezer: FrozenDateTimeFactory,
    key: str,
) -> None:
    await fx_house(hass, hass_storage, now, key)
    mine = await hass_ws_client(hass)
    shared = await hass_ws_client(hass)
    await subscribe(mine)
    await subscribe(shared, shared=True)
    RIGS[key].put(hass, RIGS[key].on)
    await settle(hass, freezer)
    onset = ["fx"] if kind_of(key, True) else []
    for client in (mine, shared):
        got = await pushed(client)
        assert [e["fx"]["kind"] for e in got if "fx" in e] == kind_of(key, True)
        assert [next(iter(e)) for e in got] == ["house", *onset]
    # A shared screen's snapshot: the same whitelist as a personal one.
    again = await subscribe(await hass_ws_client(hass), shared=True)
    assert again["house"]["device_fx"]["version"] == 1
    assert again["house"]["device_fx"]["current"][key] == wire(key, True)
    assert [e["kind"] for e in again["device_fx_recent"]] == kind_of(key, True)
