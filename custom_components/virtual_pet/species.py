"""Worlds and species, read from the files in frontend/.

A species is a sprite folder with a species.json (see frontend/sprites/). A
world (frontend/worlds.json) is a themed device with a roster of species. Only
species marked ready count, and a world with none ready is hidden.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

FRONTEND_DIR = Path(__file__).parent / "frontend"


@dataclass
class Catalog:
    """Ready species and the worlds that have at least one of them."""

    species: dict[str, dict[str, Any]]
    worlds: dict[str, dict[str, Any]]

    def roster(self, world: str) -> list[str]:
        """Ready species of a world, in roster order."""
        return [
            s for s in self.worlds.get(world, {}).get("roster", []) if s in self.species
        ]

    def world_of(self, species: str) -> str | None:
        """The world whose roster includes a species."""
        return next(
            (key for key, w in self.worlds.items() if species in w.get("roster", [])),
            None,
        )


def load_catalog() -> Catalog:
    """Read every world and ready species. Blocking: run in the executor."""
    species: dict[str, dict[str, Any]] = {}
    for path in sorted((FRONTEND_DIR / "sprites").glob("*/species.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("ready", True):
            species[path.parent.name] = data
    all_worlds = json.loads((FRONTEND_DIR / "worlds.json").read_text(encoding="utf-8"))
    worlds = {
        key: world
        for key, world in all_worlds.items()
        if any(s in species for s in world.get("roster", []))
    }
    return Catalog(species, worlds)
