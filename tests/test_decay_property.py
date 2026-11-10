"""Property probe: random and extreme time steps never break the stat bounds."""

from __future__ import annotations

from datetime import UTC, datetime
import math
import random

import pytest

from custom_components.virtual_pet import model

SETTINGS = model.Settings(tz=UTC)
T0 = datetime(2026, 10, 1, 9, tzinfo=UTC).timestamp()
STATS = ("hunger", "happiness", "energy", "health", "discipline")
DTS = [
    0.0,
    -1.0,
    -1e6,
    1.0,
    59.9,
    300.0,
    301.0,
    1800.0,
    1801.0,
    3600.0,
    86400.0,
    1e7,
    1e9,
]


def _check(pet: model.PetState) -> None:
    for name in STATS:
        value = getattr(pet, name)
        assert math.isfinite(value), name
        assert 0.0 <= value <= 100.0, (name, value)
    assert math.isfinite(pet.age_hours)
    assert pet.age_hours >= 0
    assert math.isfinite(pet.last_updated)
    assert math.isfinite(pet.weight)


@pytest.mark.parametrize("seed", range(6))
@pytest.mark.parametrize("max_gap", [None, 1800.0])
def test_random_steps_keep_stats_in_bounds(seed: int, max_gap: float | None) -> None:
    rng = random.Random(seed)
    pet = model.PetState.new("Pip", T0)
    now = T0
    steps = 300 if max_gap else 120  # max_gap=None lives every 5 minutes
    for _ in range(steps):
        dt = rng.choice(DTS) if rng.random() < 0.5 else rng.uniform(-100, 4000)
        if max_gap is None:
            dt = min(dt, 86400.0)
        now += dt
        if rng.random() < 0.2:
            model.catch_up(pet, now)
        else:
            model.advance(pet, now, SETTINGS, rng, max_gap=max_gap)
        _check(pet)


@pytest.mark.parametrize("seed", range(6))
def test_care_rest_and_away_mixed_in_keep_stats_in_bounds(seed: int) -> None:
    rng = random.Random(100 + seed)
    pet = model.PetState.new("Pip", T0)
    pet.age_hours = 40.0
    now = T0
    for _ in range(300):
        now += rng.choice([0.0, -50.0, 120.0, 900.0, 4000.0, 40000.0])
        model.advance(
            pet, now, SETTINGS, rng, max_gap=None if rng.random() < 0.3 else 1800.0
        )
        roll = rng.random()
        if roll < 0.5:
            action = rng.choice(model.ACTIONS)
            model.apply_action(pet, action, now, rng, "me", SETTINGS)
        elif roll < 0.6:
            model.set_resting(pet, not pet.resting, now)
        elif roll < 0.7:
            pet.away = not pet.away
        _check(pet)
