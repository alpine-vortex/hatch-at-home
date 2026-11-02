"""Berry dig, the slower game (playtime plan §2 and §2a): the odds, the per-tap
contract, and the park on a person's ✕."""

from __future__ import annotations

from datetime import UTC, datetime
import random

import pytest

from custom_components.virtual_pet import model, rates as R

MIN = 60.0
SETTINGS = model.Settings(tz=UTC)  # bedtime 23:00, wake 07:00
LEAVES = model.DIG_BERRIES + model.DIG_BEES
HOME = model.PARK_HOUSEHOLD


def at(hour: int, minute: int = 0) -> float:
    return datetime(2026, 10, 1, hour, minute, tzinfo=UTC).timestamp()


def hatched(now: float, **stats: float) -> model.PetState:
    pet = model.PetState.new("Pip", now)
    pet.age_hours = 30.0
    for key, value in {"energy": 90.0, "happiness": 50.0, **stats}.items():
        setattr(pet, key, value)
    return pet


class Pile(random.Random):
    """Each dig turns up what it's told to: "berry" or "bee"."""

    def __init__(self, *finds: str) -> None:
        super().__init__(0)
        self.finds = list(finds)

    def randrange(self, n, *args, **kwargs):
        # A berry is any draw below the berries left; a bee is the last leaf.
        return 0 if self.finds.pop(0) == "berry" else n - 1


def dig(pet: model.PetState, guess: str, now: float, rng: random.Random):
    return model.play_game(pet, guess, now, rng, kind="dig")


# Best play's stop table (plan §2): keep when the basket holds this many, by
# round (1-5) and berries banked (0-4). It plays at exactly the best odds.
STOP = {
    1: [2, 2, 2, 1, 1],
    2: [2, 2, 2, 1, 1],
    3: [3, 2, 2, 2, 1],
    4: [3, 3, 3, 2, 1],
    5: [5, 4, 3, 2, 1],
}


def best(info: dict, rng: random.Random) -> str:
    stop = STOP[info["round"] + 1][info["wins"]]
    return "keep" if info["basket"] >= stop else "dig"


def coin(info: dict, rng: random.Random) -> str:
    # A coin flip at each choice; keep isn't offered on an empty basket.
    if info["basket"] == 0:
        return "dig"
    return rng.choice(("keep", "dig"))


def win_rate(policy, games: int, seed: int) -> float:
    rng = random.Random(seed)
    pick = random.Random(seed + 1)
    pet = hatched(at(9))
    won = 0
    for g in range(games):
        pet.energy, pet.happiness = 90.0, 50.0
        now = at(9) + g
        info, _ = model.start_game(pet, "dig", now, rng)
        while not info["done"]:
            info, _ = dig(pet, policy(info, pick), now, rng)
            assert info["result"] == model.OK
        won += info["won"]
    return won / games


def test_best_play_wins_70_to_80_percent_and_random_play_far_less():
    games = 20_000
    good = win_rate(best, games, seed=11)
    random_play = win_rate(coin, games, seed=12)
    assert 0.70 <= good <= 0.80, good
    assert random_play <= good - 0.20, (good, random_play)


def test_a_berry_isnt_a_round_and_a_bee_or_a_keep_ends_one():
    pet = hatched(at(9))
    rng = Pile("berry", "berry", "bee", "berry")
    info, _ = model.start_game(pet, "dig", at(9), rng)
    assert (info["round"], info["wins"], info["basket"]) == (0, 0, 0)
    assert info["leaves"] == LEAVES and info["win_at"] == R.DIG_WIN_AT
    info, _ = dig(pet, "dig", at(9), rng)
    assert info["found"] == "berry" and not info["round_over"]
    assert (info["round"], info["basket"], info["leaves"]) == (0, 1, LEAVES - 1)
    dig(pet, "dig", at(9), rng)
    info, _ = dig(pet, "dig", at(9), rng)  # a bee: the basket rolls away
    assert info["found"] == "bee" and info["round_over"]
    assert (info["round"], info["wins"], info["basket"]) == (1, 0, 0)
    assert info["leaves"] == LEAVES  # a fresh pile
    dig(pet, "dig", at(9), rng)
    info, _ = dig(pet, "keep", at(9), rng)
    assert info["found"] == "kept" and info["round_over"]
    assert (info["round"], info["wins"], info["basket"]) == (2, 1, 0)
    assert not info["done"] and pet.game is not None


def test_the_sixth_berry_banks_itself():
    pet = hatched(at(9))
    rng = Pile(*["berry"] * model.DIG_BERRIES)
    model.start_game(pet, "dig", at(9), rng)
    for _ in range(model.DIG_BERRIES):
        info, _ = dig(pet, "dig", at(9), rng)
    assert info["found"] == "berry" and info["round_over"]
    assert info["wins"] == model.DIG_BERRIES and info["done"] and info["won"]


def test_a_win_pays_its_own_rate_and_records_berries_banked():
    pet = hatched(at(9))
    rng = Pile("berry", "berry", "berry", "berry", "berry", "bee")
    model.start_game(pet, "dig", at(9), rng)
    dig(pet, "dig", at(9), rng)
    dig(pet, "dig", at(9), rng)
    info, _ = dig(pet, "keep", at(9), rng)
    assert (info["wins"], info["done"]) == (2, False)
    dig(pet, "dig", at(9), rng)
    dig(pet, "dig", at(9), rng)
    dig(pet, "dig", at(9), rng)
    info, events = dig(pet, "keep", at(9), rng)
    assert info["done"] and info["won"] and info["wins"] == 5
    assert pet.happiness == pytest.approx(50.0 + R.DIG_WIN_HAPPINESS)
    assert pet.games == {"dig": {"played": 1, "won": 1}}
    assert pet.care_log[0]["score"] == "5 berries"
    finished = [e for e in events if e["type"] == "game_finished"]
    assert finished == [
        {"type": "game_finished", "game": "dig", "won": True, "wins": 5}
    ]
    assert pet.game is None


def test_five_rounds_without_five_banked_lose():
    pet = hatched(at(9))
    rng = Pile(*["bee"] * 5)
    model.start_game(pet, "dig", at(9), rng)
    for _ in range(5):
        info, _ = dig(pet, "dig", at(9), rng)
    assert info["done"] and not info["won"] and info["round"] == 5
    assert pet.happiness == pytest.approx(50.0 + R.GAME_LOSE_HAPPINESS)
    assert pet.care_log[0]["score"] == "0 berries"


def test_keep_on_an_empty_basket_is_refused_and_changes_nothing():
    pet = hatched(at(9))
    model.start_game(pet, "dig", at(9), Pile())
    before = pet.to_dict()
    info, events = dig(pet, "keep", at(9, 1), Pile())
    assert info["result"] == "empty_basket" and events == []
    assert (info["round"], info["basket"], info["yours"]) == (0, 0, True)
    assert pet.to_dict() == before  # not even last_at


def test_a_dig_needs_starting_first():
    pet = hatched(at(9))
    info, events = dig(pet, "dig", at(9), Pile("berry"))
    assert info == {"result": "no_game"} and events == []


def test_an_x_before_the_first_tap_ends_and_after_it_parks():
    pet = hatched(at(9))
    model.start_game(pet, "dig", at(9), Pile())
    assert model.end_game(pet, "dig", at(9)) == "ended"
    assert pet.game is None and pet.parked == {}
    rng = Pile("berry")
    model.start_game(pet, "dig", at(9), rng)
    dig(pet, "dig", at(9), rng)
    before = (pet.happiness, pet.energy, len(pet.care_log), dict(pet.games))
    assert model.end_game(pet, "dig", at(9)) == "parked"
    assert pet.game is None and pet.parked[HOME].basket == 1
    assert (pet.happiness, pet.energy, len(pet.care_log), dict(pet.games)) == before
    assert model.end_game(pet, "dig", at(9)) is None  # nothing in progress now


def parked_mid_game(now: float) -> model.PetState:
    """A dig in round 2 with 1 banked and 2 in the basket, parked."""
    pet = hatched(now)
    rng = Pile("berry", "berry", "berry")
    model.start_game(pet, "dig", now, rng)
    dig(pet, "dig", now, rng)
    dig(pet, "keep", now, rng)
    dig(pet, "dig", now, rng)
    dig(pet, "dig", now, rng)
    assert model.end_game(pet, "dig", now) == "parked"
    return pet


def resumed(info: dict) -> tuple[int, int, int]:
    return info["round"], info["wins"], info["basket"]


def test_a_parked_dig_carries_on_after_ten_minutes():
    pet = parked_mid_game(at(9))
    later = at(9, 10)
    model.advance(pet, later, SETTINGS, random.Random(1))
    assert HOME in pet.parked and pet.games == {}  # the idle drop spares it
    info, _ = model.start_game(pet, "dig", later, Pile())
    assert resumed(info) == (1, 1, 2) and info["leaves"] == LEAVES - 2
    assert pet.parked == {} and pet.game.last_at == later


def test_a_parked_dig_survives_a_save_and_load():
    pet = parked_mid_game(at(9))
    loaded = model.PetState.from_dict(pet.to_dict())
    assert loaded.parked == pet.parked and HOME in loaded.parked
    info, _ = model.start_game(loaded, "dig", at(9, 1), Pile())
    assert resumed(info) == (1, 1, 2)


def test_a_parked_dig_survives_sleep_and_another_game():
    pet = parked_mid_game(at(9))
    # Lights out drops the game in progress, but never the parked dig.
    model.play_game(pet, "left", at(9, 1), random.Random(1))
    model.set_lights_out(pet, True, at(9, 2), SETTINGS)
    assert pet.asleep and pet.game is None and HOME in pet.parked
    model.set_lights_out(pet, False, at(9, 30), SETTINGS)
    assert not pet.asleep
    info, _ = model.start_game(pet, "dig", at(9, 31), Pile())
    assert resumed(info) == (1, 1, 2)


def test_starting_another_kind_leaves_the_parked_dig():
    pet = parked_mid_game(at(9))
    model.start_game(pet, "higher_lower", at(9), random.Random(1))
    assert HOME in pet.parked and pet.game.kind == "higher_lower"


def test_shift_times_moves_the_parked_dig():
    pet = parked_mid_game(at(9))
    model.shift_times(pet, 100.0)
    parked = pet.parked[HOME]
    assert parked.started == at(9) + 100.0 and parked.last_at == at(9) + 100.0


def test_a_server_drop_of_a_dig_is_free_until_a_round_ends():
    pet = hatched(at(9))
    rng = Pile("berry", "bee")
    model.start_game(pet, "dig", at(9), rng)
    dig(pet, "dig", at(9), rng)
    assert model.drop_game(pet, at(9)) == [] and pet.games == {}
    model.start_game(pet, "dig", at(9), rng)
    dig(pet, "dig", at(9), rng)  # a bee ends round 1
    events = model.drop_game(pet, at(9), by="u", switched=True)
    assert events[0]["dropped"] and pet.games["dig"]["dropped"] == 1
    assert pet.care_log[0]["score"] == "0 berries"


def test_dig_saves_load_from_older_and_newer_versions():
    pet = hatched(at(9))
    data = pet.to_dict()
    # An older save: no parked slot, a game with no basket.
    del data["parked"]
    data["game"] = {"started": at(9), "last_at": at(9), "rounds": 1, "wins": 0}
    old = model.PetState.from_dict(data)
    assert old.parked == {} and old.game.kind == "left_right" and old.game.basket == 0
    good = {"started": at(9), "last_at": at(9), "kind": "dig", "rounds": 2}
    # This branch's first cut saved one parked dig: it goes to the household.
    data["game"] = data["parked"] = {**good, "wins": 3, "basket": 4}
    single = model.PetState.from_dict(data)
    assert single.game.basket == 4 and single.parked[HOME].wins == 3
    assert single.parked[HOME].player is None
    # Per person: each slot keeps its own; the slot is the player.
    data["parked"] = {HOME: {**good, "basket": 1}, "u1": {**good, "basket": 2}}
    new = model.PetState.from_dict(data)
    assert {s: g.basket for s, g in new.parked.items()} == {HOME: 1, "u1": 2}
    assert new.parked["u1"].player == "u1"
    # Damaged: a pile too full, a game already over, the wrong kind parked.
    for bad in (
        {**good, "basket": model.DIG_BERRIES},
        {**good, "basket": -1},
        {**good, "basket": "x"},
        {**good, "wins": R.DIG_WIN_AT},
        {**good, "rounds": R.GAME_ROUNDS},
        "x",
    ):
        data["game"] = bad
        data["parked"] = {"u1": bad, HOME: {**good}}
        damaged = model.PetState.from_dict(data)
        assert damaged.game is None and list(damaged.parked) == [HOME], bad
    data["game"] = None
    for bad in (
        {"started": at(9), "last_at": at(9), "kind": "left_right"},
        {"u1": {"started": at(9), "last_at": at(9), "kind": "left_right"}},
        [1, 2],
        "x",
        None,
    ):
        data["parked"] = bad
        assert model.PetState.from_dict(data).parked == {}, bad


def test_a_parked_dig_older_than_the_pet_is_dropped():
    """A downgraded version lays an egg and keeps the unknown `parked` key;
    back on this version, the old pet's dig doesn't turn up on the egg."""
    pet = hatched(at(9))
    data = pet.to_dict()
    old = {"started": at(9) - 60, "last_at": at(9) - 60, "kind": "dig", "rounds": 1}
    data["parked"] = {HOME: old, "u1": {**old, "started": at(9)}}
    assert list(model.PetState.from_dict(data).parked) == ["u1"]


def test_an_older_version_keeps_a_newer_dig_save_safe():
    """A version without the dig: its _game drops the unknown kind, and the
    parked slot rides along in the unknown keys for the next save."""
    pet = parked_mid_game(at(9))
    data = pet.to_dict()
    parked = data["parked"]
    data["future_slot"] = {"x": 1}
    loaded = model.PetState.from_dict(data)
    assert loaded.to_dict()["future_slot"] == {"x": 1}
    data["game"] = {**parked, "kind": "spade"}  # a kind this version doesn't know
    assert model.PetState.from_dict(data).game is None


def test_a_new_egg_has_no_parked_dig():
    pet = parked_mid_game(at(9))
    pet.age_hours = dict(R.STAGE_STARTS)["adult"] + R.LAY_EGG_AFTER_ADULT_HOURS + 5
    egg, _ = model.lay_egg(pet, at(9, 1), random.Random(1))
    assert egg is not pet and egg.parked == {}


def parked_by(pet: model.PetState, player: str | None, finds: list[str], now: float):
    rng = Pile(*finds)
    model.start_game(pet, "dig", now, rng, player=player)
    for _ in finds:
        dig_as(pet, "dig", now, rng, player)
    return model.end_game(pet, "dig", now, player)


def dig_as(pet, guess, now, rng, player):
    return model.play_game(pet, guess, now, rng, kind="dig", player=player)


def test_a_parked_dig_is_its_persons_own():
    pet = hatched(at(9))
    assert parked_by(pet, "ann", ["berry", "berry"], at(9)) == "parked"
    assert pet.parked["ann"].basket == 2 and pet.parked["ann"].player == "ann"
    # Bob starts fresh; Ann's stays put.
    info, _ = model.start_game(pet, "dig", at(9, 1), Pile(), player="bob")
    assert (info["round"], info["basket"]) == (0, 0) and pet.game.player == "bob"
    assert pet.parked["ann"].basket == 2
    # A call with no person (an automation) has the household's own slot.
    model.end_game(pet, "dig", at(9, 1), "bob")  # nothing shown: just ends
    info, _ = model.start_game(pet, "dig", at(9, 2), Pile())
    assert info["basket"] == 0 and pet.game.player is None
    # Ann carries on hers.
    model.end_game(pet, "dig", at(9, 2))
    info, _ = model.start_game(pet, "dig", at(9, 3), Pile(), player="ann")
    assert info["basket"] == 2 and "ann" not in pet.parked


def test_starting_a_dig_puts_another_persons_live_dig_aside_for_them():
    pet = hatched(at(9))
    rng = Pile("berry")
    model.start_game(pet, "dig", at(9), rng, player="ann")
    dig_as(pet, "dig", at(9), rng, "ann")
    before = (pet.happiness, len(pet.care_log), dict(pet.games))
    info, events = model.start_game(pet, "dig", at(9, 1), Pile(), player="bob")
    assert info["basket"] == 0 and pet.game.player == "bob"
    assert pet.parked["ann"].basket == 1  # free: nothing counted or logged
    assert (pet.happiness, len(pet.care_log), dict(pet.games)) == before
    assert not [e for e in events if e["type"] == "game_finished"]


def test_a_dig_with_no_game_says_when_theirs_is_parked():
    pet = hatched(at(9))
    parked_by(pet, "ann", ["berry"], at(9))
    assert dig_as(pet, "dig", at(9), Pile(), "ann")[0] == {
        "result": "no_game",
        "parked": True,
    }
    assert dig_as(pet, "dig", at(9), Pile(), "bob")[0] == {"result": "no_game"}


def test_whoever_finishes_a_dig_gets_its_record():
    pet = hatched(at(9))
    rng = Pile("berry", "berry", "berry", "berry", "berry")
    model.start_game(pet, "dig", at(9), rng, player="ann")
    for _ in range(5):
        dig_as(pet, "dig", at(9), rng, "ann")
    info, events = dig_as(pet, "keep", at(9), rng, "ann")
    assert info["won"] and pet.parked == {}
    finished = [e for e in events if e["type"] == "game_finished"]
    assert finished[0]["wins"] == 5


def test_a_dig_reply_says_whether_the_dig_is_the_callers_own():
    """UX6 F16: a bool, never an id, so a person's second screen can adopt the
    server's round and another person's can't."""
    pet = hatched(at(9))
    model.start_game(pet, "dig", at(9), Pile(), player="ann")
    info, _ = dig_as(pet, "dig", at(9, 1), Pile("berry"), "ann")
    assert info["yours"] is True and info["basket"] == 1
    info, _ = dig_as(pet, "dig", at(9, 2), Pile("berry"), "bob")
    assert info["yours"] is False and info["basket"] == 2
    info, _ = dig_as(pet, "keep", at(9, 3), Pile(), "ann")
    assert info["yours"] is True and info["found"] == "kept"
    # An empty-basket keep says it too (the basket is empty after the keep).
    info, _ = dig_as(pet, "keep", at(9, 4), Pile(), "ann")
    assert info["result"] == "empty_basket" and info["yours"] is True
    assert (info["round"], info["wins"], info["basket"]) == (1, 2, 0)
    info, _ = dig_as(pet, "keep", at(9, 5), Pile(), "bob")
    assert info["result"] == "empty_basket" and info["yours"] is False
    assert "ann" not in str(info) and "bob" not in str(info)
    # A shared screen's (household) dig is its own for another shared screen.
    pet = hatched(at(9))
    model.start_game(pet, "dig", at(9), Pile())
    info, _ = dig_as(pet, "dig", at(9, 1), Pile("berry"), None)
    assert info["yours"] is True
