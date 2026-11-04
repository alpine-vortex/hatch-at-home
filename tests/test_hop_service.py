"""virtual_pet.hop, action board (Hop of the Day ship 2a; plan
docs/plan-2026-11-02-hop-of-the-day.md): the reply, the day's cache, the
refusals that write nothing, and the build off the event loop. The settle,
and the day's pin `board` writes since ship 3a, are tests/test_hop_settle.py."""

from __future__ import annotations

import asyncio
import json
import threading
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.const import MATCH_ALL
from homeassistant.core import Context, HomeAssistant
from homeassistant.util import dt as dt_util
import pytest
import voluptuous as vol

from custom_components.virtual_pet import hop as H
from custom_components.virtual_pet.const import DOMAIN

from .test_init import STORE_KEY, hatched_pet, setup, setup_with_house

PET = "button.pip_feed"
CHILD = 30.0  # hours: child, 1 special, 5 x 4
TEEN = 130.0


@pytest.fixture
def now(freezer: FrozenDateTimeFactory) -> float:
    freezer.move_to("2026-10-26 14:00:00+00:00")  # a Monday
    return dt_util.utcnow().timestamp()


async def board(hass: HomeAssistant, **extra: Any) -> dict[str, Any]:
    return await hass.services.async_call(
        DOMAIN,
        "hop",
        {"entity_id": PET, "action": "board"},
        blocking=True,
        return_response=True,
        **extra,
    )


def coordinator(hass: HomeAssistant):
    return hass.config_entries.async_get_entry("test_pet").runtime_data


async def ready(hass, now, hass_storage, **stats):
    hass_storage[STORE_KEY] = hatched_pet(now, **stats)
    await setup(hass)


async def test_reply_shape_and_round_trip(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    reply = await board(hass)
    assert set(reply) == {
        "result",
        "day",
        "id",
        "w",
        "h",
        "grid",
        "family",
        "specials",
        "world",
        "twist",
        "done",
        "tidy",
    }
    assert reply["result"] == "ok"
    assert reply["day"] == "2026-10-26"
    # A woodland child's board: the stumps (ship 4a), named from its glyphs.
    assert (reply["twist"], reply["done"], reply["tidy"]) == ("stumps", False, False)
    assert (reply["w"], reply["h"], reply["specials"]) == (5, 4, 1)
    parsed = H.Board.from_dict(reply)
    assert H.twist_of(parsed) == reply["twist"]
    assert parsed.id == reply["id"]
    assert parsed.to_dict() == {
        k: reply[k] for k in ("id", "w", "h", "grid", "family", "specials", "world")
    }
    json.dumps(reply)  # a service response is JSON


async def test_same_pet_and_day_same_board(hass, now, hass_storage, monkeypatch):
    await ready(hass, now, hass_storage)
    first = await board(hass)
    second = await board(hass)
    assert first == second
    # And it is the generator's own answer, not just a remembered one.
    pet = coordinator(hass)
    again = H.hop_board(
        "test_pet", first["day"], pet.world, first["family"], 1, 5, 4
    ).to_dict()
    assert again == {k: first[k] for k in again}


async def test_the_second_call_is_the_cache(hass, now, hass_storage, monkeypatch):
    await ready(hass, now, hass_storage)
    calls = []
    real = H.hop_board
    monkeypatch.setattr(H, "hop_board", lambda *a: calls.append(a) or real(*a))
    await board(hass)
    await board(hass)
    assert len(calls) == 1


async def test_a_new_day_changes_the_board_and_drops_yesterdays(
    hass, now, hass_storage, freezer
):
    await ready(hass, now, hass_storage)
    monday = await board(hass)
    pet = coordinator(hass)
    assert {k[0] for k in pet._hop_boards} == {"2026-10-26"}
    freezer.move_to("2026-10-27 14:00:00+00:00")  # Tuesday
    tuesday = await board(hass)
    assert tuesday["day"] == "2026-10-27"
    assert tuesday["id"] != monday["id"]
    assert {k[0] for k in pet._hop_boards} == {"2026-10-27"}


async def test_wednesday_is_a_column_narrower(hass, now, hass_storage, freezer):
    await ready(hass, now, hass_storage)
    monday = await board(hass)
    freezer.move_to("2026-10-28 14:00:00+00:00")  # Wednesday
    wednesday = await board(hass)
    assert (monday["w"], wednesday["w"]) == (5, 4)
    assert wednesday["id"] != monday["id"]


async def test_a_stage_change_changes_tomorrows_board(hass, now, hass_storage, freezer):
    # Ship 3a: the day's first board pins the stage (hop_day), so growing up
    # mid-day changes tomorrow's board, not today's.
    await ready(hass, now, hass_storage)
    child = await board(hass)
    coordinator(hass).state.age_hours = TEEN
    assert await board(hass) == child
    freezer.move_to("2026-10-27 14:00:00+00:00")  # Tuesday
    teen = await board(hass)
    assert (child["specials"], child["w"]) == (1, 5)
    assert (teen["specials"], teen["w"]) == (2, 6)
    assert teen["id"] != child["id"]


async def test_a_world_change_changes_the_board(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    first = await board(hass)
    pet = coordinator(hass)
    pet.world = "pond" if pet.world != "pond" else "woodland"
    second = await board(hass)
    assert second["world"] == pet.world != first["world"]
    assert second["id"] != first["id"]
    assert (first["twist"], second["twist"]) == ("stumps", "ripple")


async def test_the_twist_follows_the_world_and_the_stage(hass, now, hass_storage):
    """Each world's twist from child up (hearth's rug, ship 4b's four); a
    baby's board has no twist in any world (Decided 26)."""
    await ready(hass, now, hass_storage)
    pet = coordinator(hass)
    for world, twist, glyph in (
        ("hearth", "rug", "="),
        ("terrarium", "crackle", "c"),
        ("tidepool", "pool", "%"),
        ("pond", "ripple", "r"),
        ("nightsky", "lantern", "*"),
    ):
        pet.world = world
        reply = await board(hass)
        assert reply["twist"] == twist and glyph in "".join(reply["grid"]), world
    pet.state.hop_day = {}
    pet.state.age_hours = 10.0  # a baby
    baby = await board(hass)
    assert (baby["specials"], baby["twist"]) == (0, None)


async def test_an_unknown_species_gets_the_hop_family(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    coordinator(hass).state.species = "no_such_species"
    assert (await board(hass))["family"] == "hop"


async def test_the_family_follows_the_species(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    species = next(s for s, f in H.FAMILY_OF.items() if f == "swim")
    coordinator(hass).state.species = species
    assert (await board(hass))["family"] == "swim"


@pytest.mark.parametrize(
    ("stats", "code"),
    [
        ({"age_hours": 0.0}, "egg"),
        ({"asleep": True}, "asleep"),
        ({"away": True}, "away"),
        ({"energy": 5.0}, "too_tired"),
    ],
)
async def test_a_refusal_writes_nothing(hass, now, hass_storage, stats, code):
    # Privacy off, so "away" is told as it is (the private case is below).
    hass_storage[STORE_KEY] = hatched_pet(now, **stats)
    await setup_with_house(hass, privacy=False)
    pet = coordinator(hass)
    fired = []
    hass.bus.async_listen(MATCH_ALL, lambda e: fired.append(e.event_type))
    log = list(pet.state.care_log)
    before = pet.state.to_dict()
    assert await board(hass) == {"result": code}
    await hass.async_block_till_done()
    assert pet.state.care_log == log
    assert pet.state.to_dict() == before
    assert not [t for t in fired if t.startswith(DOMAIN)]
    assert pet._hop_boards == {}  # nothing built for a pet that can't play


async def test_a_private_pet_away_looks_asleep(hass, now, hass_storage):
    await ready(hass, now, hass_storage)  # privacy defaults on
    coordinator(hass).state.away = True
    assert await board(hass) == {"result": "asleep"}


async def test_the_board_runs_off_the_loop(hass, now, hass_storage, monkeypatch):
    await ready(hass, now, hass_storage)
    loop_thread = threading.get_ident()
    threads = []
    real = H.hop_board

    def spy(*args):
        threads.append(threading.get_ident())
        return real(*args)

    monkeypatch.setattr(H, "hop_board", spy)
    await board(hass)
    assert len(threads) == 1
    assert threads[0] != loop_thread


async def test_two_calls_at_once_build_once(hass, now, hass_storage, monkeypatch):
    await ready(hass, now, hass_storage)
    calls = []
    real = H.hop_board
    monkeypatch.setattr(H, "hop_board", lambda *a: calls.append(a) or real(*a))
    first, second, third = await asyncio.gather(board(hass), board(hass), board(hass))
    assert len(calls) == 1
    assert first == second == third


async def test_a_failed_build_is_not_kept(hass, now, hass_storage, monkeypatch):
    await ready(hass, now, hass_storage)
    real = H.hop_board
    calls = []

    def flaky(*args):
        calls.append(args)
        if len(calls) == 1:
            raise RuntimeError("boom")
        return real(*args)

    monkeypatch.setattr(H, "hop_board", flaky)
    with pytest.raises(RuntimeError):
        await board(hass)
    assert coordinator(hass)._hop_boards == {}
    assert (await board(hass))["result"] == "ok"
    assert len(calls) == 2


async def test_the_reply_holds_no_user_or_entry_id(
    hass, now, hass_storage, hass_admin_user
):
    await ready(hass, now, hass_storage)
    reply = await board(hass, context=Context(user_id=hass_admin_user.id))
    text = json.dumps(reply)
    assert hass_admin_user.id not in text
    assert "test_pet" not in text
    assert coordinator(hass).pet_id not in text


async def test_only_board_and_settle_are_actions(hass, now, hass_storage):
    await ready(hass, now, hass_storage)
    for data in ({"entity_id": PET, "action": "hint"}, {"entity_id": PET}):
        with pytest.raises(vol.Invalid):
            await hass.services.async_call(
                DOMAIN, "hop", data, blocking=True, return_response=True
            )


def test_the_service_has_its_text_and_fields():
    """What hassfest checks: services.yaml, strings.json and translations/en.json
    agree on the service and its fields."""
    from pathlib import Path

    import yaml

    package = Path(H.__file__).parent
    fields = set(
        yaml.safe_load((package / "services.yaml").read_text())["hop"]["fields"]
    )
    assert fields == {"entity_id", "action", "id", "moves", "shared"}
    for name in ("strings.json", "translations/en.json"):
        service = json.loads((package / name).read_text())["services"]["hop"]
        assert service["name"] and service["description"]
        assert set(service["fields"]) == fields
        assert all(f["name"] and f["description"] for f in service["fields"].values())
