"""Nothing personal on the bus or on a state (privacy P3b; plan tests 4 and 5).

A scripted day of one person's bond with the pet: a visit, care, a game
record, a favourite game, a level-up, a tuck-in, coming home, a day's wish
aimed at them, the show it watched and the song it heard, and a dream of the
show. Their user ID, first name and nickname reach their own channel and their
phone, never the event bus or a state; the show and song reach every channel
(P3c), never the bus or a state either. The care log's "by" (the HA user's
display name) stays, by the owner's decision.
"""

from __future__ import annotations

from datetime import timedelta
import json
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.config_entries import RELOAD_AFTER_UPDATE_DELAY
from homeassistant.const import MATCH_ALL
from homeassistant.core import Context, Event, HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_mock_service,
)

from custom_components.virtual_pet import model
from custom_components.virtual_pet.const import (
    DOMAIN,
    PERSONAL_EVENTS,
    PRIVATE_EVENT_FIELDS,
)

from .test_init import STORE_KEY, hatched_pet, settle, setup, setup_with_house

LEVELS = model.R.BOND_LEVELS
NICKNAME = "sunbeam"
FIRST_NAME = "Zebulon"  # the person entity's; unlike any word the pet says
# The show, the song and its artist (P3c): the channel's, not the bus's.
SHOW = "Bluey"
SONG = "Clair de lune"
ARTIST = "Debussy"
TITLES: tuple[str, ...] = (SHOW, SONG, ARTIST)


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")
    return dt_util.utcnow().timestamp()


async def scripted_day(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, Any]:
    """Run the day; what to search for, the coordinator and the phone's calls."""
    me = await hass.auth.async_create_user("Zeb Owner", group_ids=["system-admin"])
    stranger = await hass.auth.async_create_user("Stranger")
    hass.states.async_set(
        "person.zeb", "not_home", {"user_id": me.id, "friendly_name": FIRST_NAME}
    )
    hass.states.async_set("person.stranger", "not_home", {"user_id": stranger.id})
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        happiness=50.0,
        bonds={
            me.id: {
                "points": LEVELS[4],
                "nickname": NICKNAME,
                "favourite": "left_right",
                "best": {"left_right": -1},
            }
        },
    )
    await setup_with_house(hass, tv=["media_player.tv"])
    # The debug sensor too (disabled by default): it is scanned with the rest.
    # Enabling it reloads the pet after the registry's delay: wait it out here,
    # not mid-day.
    er.async_get(hass).async_update_entity("sensor.pip_debug", disabled_by=None)
    await settle(hass, freezer, RELOAD_AFTER_UPDATE_DELAY + 1)
    assert hass.states.get("sensor.pip_debug") is not None
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    MockConfigEntry(
        domain="mobile_app", data={"user_id": me.id, "device_name": "zeb"}
    ).add_to_hass(hass)
    phone = async_mock_service(hass, "notify", "mobile_app_zeb")
    as_me = Context(user_id=me.id)
    await hass.services.async_call(
        DOMAIN,
        "notify_me",
        {"entity_id": "sensor.pip_mood", "enabled": True},
        blocking=True,
        context=as_me,
    )
    # A day's wish aimed at them (the pet's close friend with a person entity).
    monkeypatch.setattr(model.R, "WISH_FOR_CHANCE", 1.0)
    monkeypatch.setattr(pet, "wish_options", lambda: {"play"})
    pet.state.wish = {}
    pet._fire(pet._daily_wish(now))
    assert pet.state.wish["for"] == me.id
    # A visit, care and a game: the game beats their best (a bond_record).
    await hass.services.async_call(
        DOMAIN, "visit", {"entity_id": "sensor.pip_mood"}, blocking=True, context=as_me
    )
    await hass.services.async_call(
        "button",
        "press",
        {"entity_id": "button.pip_praise"},
        blocking=True,
        context=as_me,
    )
    for _ in range(5):
        await hass.services.async_call(
            DOMAIN,
            "play_game",
            {"entity_id": "button.pip_feed", "guess": "left"},
            blocking=True,
            return_response=True,
            context=as_me,
        )
    # They come home (a friend_home); someone with no bond does (someone_home).
    hass.states.async_set("person.zeb", "home", {"user_id": me.id})
    await settle(hass, freezer)
    freezer.tick(timedelta(minutes=model.R.FRIEND_HOME_EVERY_MINUTES + 1))
    hass.states.async_set("person.stranger", "home", {"user_id": stranger.id})
    await settle(hass, freezer)
    # The rest of the bond's moments, as the model makes them (with who).
    told = len(phone)
    pet._fire(
        [
            {"type": "bond_up", "user": me.id, "level": 5, "nickname": NICKNAME},
            {"type": "bond_favourite", "user": me.id, "game": "left_right"},
            {"type": "bond_record", "user": me.id, "game": "left_right", "wins": 5},
            {"type": "friend_home", "user": me.id},
            {"type": "tucked_in", "user": me.id},
        ]
    )
    # A fast-forward's moments are simulated: never on the bus either.
    pet._fire([{"type": "bond_up", "user": me.id, "level": 6}], simulated=True)
    await hass.async_block_till_done(wait_background_tasks=True)
    bond_phone = phone[told:]
    # A phone message by nickname: theirs, and kept (the owner's decision).
    pet._fire([{"type": "first_frost"}])
    await hass.async_block_till_done(wait_background_tasks=True)
    # The show it watched, from the house's TV: still a dream to have (the
    # scrub copies); then a song, as the model makes it.
    hass.states.async_set(
        "media_player.tv",
        "playing",
        {"media_content_type": "tvshow", "media_series_title": SHOW},
    )
    await settle(hass, freezer)
    pet._fire([{"type": "listening", "title": SONG, "artist": ARTIST}])
    # This morning it dreamed of the show.
    today = dt_util.now().date().isoformat()
    pet.state.dream = {"kind": "watching", "title": SHOW, "day": today}
    pet._publish()
    await hass.async_block_till_done(wait_background_tasks=True)
    return {
        "me": me,
        "pet": pet,
        "phone": phone,
        "bond_phone": bond_phone,
        "secrets": (me.id, FIRST_NAME, NICKNAME, *TITLES),
    }


def pet_attributes(hass: HomeAssistant) -> dict[str, Any]:
    """Every pet entity's attributes, without the care log's "by"."""
    registry = er.async_get(hass)
    out = {}
    for entry in registry.entities.values():
        if entry.platform != DOMAIN or not (state := hass.states.get(entry.entity_id)):
            continue
        attrs = dict(state.attributes)
        if isinstance(attrs.get("log"), list):
            attrs["log"] = [
                {k: v for k, v in r.items() if k != "by"} for r in attrs["log"]
            ]
        out[entry.entity_id] = attrs
    return out


async def test_nothing_personal_on_the_bus(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bus: list[Event] = async_capture_events(hass, MATCH_ALL)
    day = await scripted_day(hass, hass_storage, freezer, now, monkeypatch)
    pet = day["pet"]
    ours = [e for e in bus if e.event_type.startswith(f"{DOMAIN}_")]
    types = {e.event_type.removeprefix(f"{DOMAIN}_") for e in ours}
    # The day happened: the wish, care, the game, both arrivals.
    assert {
        "wish_made",
        "care",
        "someone_home",
        "watching",
        "listening",
    } <= types
    assert not types & PERSONAL_EVENTS
    for e in ours:
        assert not set(e.data) & PRIVATE_EVENT_FIELDS, (e.event_type, e.data)
        text = json.dumps(e.data, default=str)
        # Nor who cared (the care log's "by", kept on its sensor only).
        for secret in (*day["secrets"], "Zeb Owner"):
            assert secret not in text, (e.event_type, secret)
        assert e.context.user_id is None, e.event_type
    made = [e for e in ours if e.event_type == f"{DOMAIN}_wish_made"]
    assert made[-1].data == {"kind": "play", "pet_id": pet.pet_id}  # the aimed one
    # Each of the bond's moments reached their own channel, without who...
    private = [m["type"] for m in pet._private[day["me"].id]]
    assert {
        "bond_up",
        "bond_record",
        "bond_favourite",
        "friend_home",
        "tucked_in",
    } <= set(private)
    assert all("user" not in m for m in pet._private[day["me"].id])
    # ...not the public list; someone_home there names nobody.
    moments = hass.states.get("sensor.pip_last_care").attributes["moments"]
    assert not {m["type"] for m in moments} & PERSONAL_EVENTS
    home = [m for m in moments if m["type"] == "someone_home"]
    assert home and all(set(m) == {"type", "at"} for m in home)
    # A bond moment sends nothing to a phone, opted in or not; the phone's own
    # messages may still use the nickname (disclosed in the guide).
    assert day["bond_phone"] == []
    assert any(NICKNAME in c.data["message"] for c in day["phone"])
    # The show and song: on the bus with no title or artist, and on the
    # public list only as the TV or music being on.
    media = [
        e for e in ours if e.event_type in (f"{DOMAIN}_watching", f"{DOMAIN}_listening")
    ]
    assert media and all(set(e.data) == {"pet_id"} for e in media)
    assert not {m["type"] for m in moments} & {"watching", "listening"}
    stand_ins = [m for m in moments if m["type"] in ("tv_on", "music_on")]
    assert {m["type"] for m in stand_ins} == {"tv_on", "music_on"}
    assert all(set(m) == {"type", "at"} for m in stand_ins)
    # The scrub copied the show's event: the title still seeds a dream, and
    # every channel hears it.
    assert any(s.get("title") == SHOW for s in pet.state.dream_seeds)
    assert pet._house["media"]["title"] == SONG


async def test_a_simulated_bond_moment_is_never_fired(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    fired = async_capture_events(hass, f"{DOMAIN}_bond_up")
    pet._fire([{"type": "bond_up", "user": "u1", "level": 3}], simulated=True)
    pet._fire([{"type": "bond_up", "user": "u1", "level": 4}])
    await hass.async_block_till_done()
    assert fired == []


async def test_the_debug_sensor_lists_no_bond_moment(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
) -> None:
    hass_storage[STORE_KEY] = hatched_pet(now)
    await setup(hass)
    pet = hass.config_entries.async_entries(DOMAIN)[0].runtime_data
    pet._fire([{"type": "first_frost"}, {"type": "bond_up", "user": "u1", "level": 3}])
    assert pet.debug["last_events"] == ["first_frost"]
    pet._fire([{"type": "tucked_in", "user": "u1"}])  # nothing to list: kept
    assert pet.debug["last_events"] == ["first_frost"]


async def test_nothing_personal_on_a_state(
    hass: HomeAssistant,
    hass_storage: dict[str, Any],
    freezer: FrozenDateTimeFactory,
    now: float,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = await scripted_day(hass, hass_storage, freezer, now, monkeypatch)
    attrs = pet_attributes(hass)
    assert {"sensor.pip_life_stage", "sensor.pip_last_care", "sensor.pip_debug"} <= set(
        attrs
    )
    text = json.dumps(attrs, default=str)
    for secret in day["secrets"]:
        assert secret not in text, secret
    stage = attrs["sensor.pip_life_stage"]
    assert "bonds" not in stage and "notify_users" not in stage
    assert set(stage["wish"]) == {"kind", "granted", "open"}
    # This morning's dream was of a show: none on the sensor, the title on the
    # channel's house view.
    assert stage["dream"] is None
    assert day["pet"]._house_view()["dream"] == {"kind": "watching", "title": SHOW}
    # The debug sensor lists what just happened, but never a bond moment.
    debug = attrs["sensor.pip_debug"]["calculation"]
    assert debug["last_events"]
    assert not set(debug["last_events"]) & PERSONAL_EVENTS
    # The care log keeps who cared (the owner kept it), and only there.
    log = hass.states.get("sensor.pip_last_care").attributes["log"]
    assert any(r.get("by") == "Zeb Owner" for r in log)


async def test_an_old_saves_wish_name_stays_off_the_sensor(
    hass: HomeAssistant, hass_storage: dict[str, Any], now: float
) -> None:
    # A save from before P3b still has "for_name": it stays there, unread.
    hass_storage[STORE_KEY] = hatched_pet(
        now,
        wish={
            "kind": "play",
            "day": "2026-10-26",
            "granted": False,
            "for": "user-9",
            "for_name": "Samwise",
        },
    )
    await setup(hass)
    wish = hass.states.get("sensor.pip_life_stage").attributes["wish"]
    assert wish == {"kind": "play", "granted": False, "open": True}
