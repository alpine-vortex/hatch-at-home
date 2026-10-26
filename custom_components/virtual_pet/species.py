"""Species are folders of sprites with a species.json, see frontend/sprites/."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SPRITES_DIR = Path(__file__).parent / "frontend" / "sprites"


def load_species() -> dict[str, dict[str, Any]]:
    """Every ready species by id. Blocking: run in the executor."""
    found: dict[str, dict[str, Any]] = {}
    for path in sorted(SPRITES_DIR.glob("*/species.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("ready", True):
            found[path.parent.name] = data
    return found
