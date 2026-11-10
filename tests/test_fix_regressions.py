"""Small regressions for loader and clock fixes: each input here once raised or corrupted a save."""

from __future__ import annotations

import json
import math
import random
from types import SimpleNamespace

import pytest

from custom_components.virtual_pet import model, people, species, wellbeing

from .test_model import HOUR, at, hatched


def test_catch_up_with_the_clock_set_back_moves_the_timers_back():
    start = at(9)
    pet = hatched(start)
    pet.poops = [start - 600]
    pet.last_updated = start
    model.catch_up(pet, start - HOUR)  # elapsed is negative
    assert pet.last_updated == start - HOUR
    assert pet.poops == [start - 600 - HOUR]
    model.catch_up(pet, pet.last_updated)  # no time at all: nothing moves
    assert pet.poops == [start - 600 - HOUR]


def test_bond_since_must_be_an_iso_day():
    data = hatched(at(9)).to_dict()
    data["bonds"] = {
        "a": {"points": 1, "since": "last tuesday"},
        "b": {"points": 1, "since": "2026-09-28"},
        "c": {"points": 1, "since": 5},
    }
    bonds = model.PetState.from_dict(data).bonds
    assert "since" not in bonds["a"]
    assert bonds["b"]["since"] == "2026-09-28"
    assert "since" not in bonds["c"]


def test_add_bond_fills_counters_a_damaged_record_lacks():
    pet = hatched(at(9))
    # A day that matches today but no counters (what loading a damaged bond can leave).
    pet.bonds = {"u": {"points": 0, "day": "2026-10-01"}}
    model.add_bond(pet, "u", "visit", "2026-10-01", random.Random(1))
    bond = pet.bonds["u"]
    assert bond["visited"] is True
    assert bond["points"] > 0
    assert bond["since"] == "2026-10-01"


def test_temperament_factor_zero_or_negative_is_dropped():
    data = hatched(at(9)).to_dict()
    trait, other = sorted(model.TRAITS)[:2]
    data["temperament"] = {trait: 0, other: -1.0, "bogus": 1.0}
    assert model.PetState.from_dict(data).temperament == {}
    data["temperament"] = {trait: 1.25}
    assert model.PetState.from_dict(data).temperament == {trait: 1.25}


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
def test_game_counts_that_are_not_finite_numbers_load_as_zero(bad):
    data = hatched(at(9)).to_dict()
    data["games"] = {"higher_lower": {"played": bad, "won": 2}}
    games = model.PetState.from_dict(data).games["higher_lower"]
    assert games["played"] == 0
    assert games["won"] == 2


def test_people_num_rejects_nan_and_inf():
    assert people._num(1) and people._num(2.5)
    assert not people._num(math.nan)
    assert not people._num(math.inf)
    assert not people._num(-math.inf)
    assert not people._num(True)


def _hass_with(state: str):
    return SimpleNamespace(
        states=SimpleNamespace(get=lambda _id: SimpleNamespace(state=state))
    )


@pytest.mark.parametrize("text", ["inf", "-inf", "nan", "Infinity", "NaN"])
def test_wellbeing_number_rejects_non_finite(text):
    assert wellbeing._number(_hass_with(text), "sensor.x") is None


def test_wellbeing_number_still_reads_a_plain_number():
    assert wellbeing._number(_hass_with("12.5"), "sensor.x") == 12.5
    assert wellbeing._number(_hass_with("abc"), "sensor.x") is None


def _frontend(tmp_path, monkeypatch, *, worlds, species_files):
    sprites = tmp_path / "sprites"
    for name, text in species_files.items():
        (sprites / name).mkdir(parents=True)
        (sprites / name / "species.json").write_text(text, encoding="utf-8")
    if worlds is not None:
        (tmp_path / "worlds.json").write_text(worlds, encoding="utf-8")
    monkeypatch.setattr(species, "FRONTEND_DIR", tmp_path)


def test_load_catalog_skips_a_species_file_that_is_not_an_object(tmp_path, monkeypatch):
    _frontend(
        tmp_path,
        monkeypatch,
        worlds="{}",
        species_files={"list": "[1, 2]", "number": "3", "broken": "{nope"},
    )
    assert species.load_catalog().species == {}


def test_load_catalog_skips_an_unreadable_species_file(tmp_path, monkeypatch):
    _frontend(tmp_path, monkeypatch, worlds="{}", species_files={"bad": "x"})
    (tmp_path / "sprites" / "bad" / "species.json").write_bytes(b"\xff\xfe\x00{")
    assert species.load_catalog().species == {}


@pytest.mark.parametrize(
    "worlds", [None, "{broken", json.dumps([1, 2]), json.dumps("text")]
)
def test_load_catalog_tolerates_a_bad_or_missing_worlds_file(
    tmp_path, monkeypatch, worlds
):
    _frontend(tmp_path, monkeypatch, worlds=worlds, species_files={})
    catalog = species.load_catalog()
    assert catalog.worlds == {}
    assert catalog.visitors == {}
    assert catalog.finds == {}
