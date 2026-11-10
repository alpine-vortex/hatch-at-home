"""Worlds and species, read from the files in frontend/.

A species is a sprite folder with a species.json (see frontend/sprites/). A
world (frontend/worlds.json) is a themed device with a roster of species. Only
species marked ready count, and a world with none ready is hidden.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import logging
from pathlib import Path
from typing import Any

from .home import FIND_TOKENS

_LOGGER = logging.getLogger(__package__)

# "egg" is optional: the egg belongs to the device's world, and the card draws
# it from the first species on the world's roster that has one.
REQUIRED = {"name": str, "stages": list, "moods": list}

FRONTEND_DIR = Path(__file__).parent / "frontend"


@dataclass
class Catalog:
    """Ready species and the worlds that have at least one of them."""

    species: dict[str, dict[str, Any]]
    worlds: dict[str, dict[str, Any]]
    # Every world's visitors ({id, name, hours, leaves?}, in roster order), from
    # all of worlds.json, ready or not: a saved collection is checked against it.
    visitors: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    # Every world's finds ({id, name, a, weight, when, gift_only?}), from all
    # of worlds.json, ready or not (plan visitors v2 §2): a find of a world
    # gone not-ready is still known in the basket and the collection.
    finds: dict[str, list[dict[str, Any]]] = field(default_factory=dict)

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
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as err:
            _LOGGER.warning("Skipping %s: not valid JSON (%s)", path, err)
            continue
        if not isinstance(data, dict):
            _LOGGER.warning("Skipping %s: not a JSON object", path)
            continue
        missing = [
            k for k, kind in REQUIRED.items() if not isinstance(data.get(k), kind)
        ]
        if missing or not data["stages"] or not data["moods"]:
            _LOGGER.warning(
                "Skipping %s: missing %s", path, ", ".join(missing) or "stages/moods"
            )
            continue
        if data.get("ready", True):
            species[path.parent.name] = data
    try:
        all_worlds = json.loads(
            (FRONTEND_DIR / "worlds.json").read_text(encoding="utf-8")
        )
    except (OSError, ValueError) as err:
        _LOGGER.warning("Ignoring worlds.json (%s)", err)
        all_worlds = {}
    if not isinstance(all_worlds, dict):
        all_worlds = {}
    worlds = {
        key: world
        for key, world in all_worlds.items()
        if any(s in species for s in world.get("roster", []))
    }
    visitors = {
        key: [
            v
            for v in world.get("visitors", [])
            if isinstance(v, dict)
            and isinstance(v.get("id"), str)
            and v.get("hours") in ("day", "night")
        ]
        for key, world in all_worlds.items()
    }
    finds = {
        key: [f for f in world.get("finds", []) if valid_find(f)]
        for key, world in all_worlds.items()
    }
    return Catalog(species, worlds, visitors, finds)


def valid_when(when: Any) -> bool:
    """A find's condition: null (always), or an OR of ANDs, a non-empty list of
    non-empty lists of known tokens, each maybe "!"-negated ([] and [[]] are
    not valid: a typo would be a find that never comes)."""
    if when is None:
        return True
    return (
        isinstance(when, list)
        and bool(when)
        and all(
            isinstance(clause, list)
            and bool(clause)
            and all(
                isinstance(t, str) and t.removeprefix("!") in FIND_TOKENS
                for t in clause
            )
            for clause in when
        )
    )


def valid_find(find: Any) -> bool:
    """A find the server can roll and the card can name."""
    ok = (
        isinstance(find, dict)
        and isinstance(find.get("id"), str)
        and isinstance(find.get("name"), str)
        and isinstance(find.get("a"), str)
        and isinstance(find.get("weight"), int | float)
        and not isinstance(find.get("weight"), bool)
        and find["weight"] > 0
        and valid_when(find.get("when"))
    )
    if not ok:
        _LOGGER.warning("Skipping a find in worlds.json: %s", find)
    return ok
