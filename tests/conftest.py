"""Shared fixtures."""

import os
import random
from types import SimpleNamespace

import pytest

from custom_components.virtual_pet import coordinator


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Let HA load custom_components/virtual_pet."""
    yield


@pytest.fixture(autouse=True)
def seeded_rng(monkeypatch):
    """Seed the pet's dice so random fakes and sickness rolls repeat run to run.

    PET_SEED picks another seed, to check that no test leans on a lucky roll.
    """
    seed = int(os.environ.get("PET_SEED", "0"))
    monkeypatch.setattr(
        coordinator, "random", SimpleNamespace(Random=lambda: random.Random(seed))
    )
