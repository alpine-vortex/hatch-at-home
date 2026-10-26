"""Every sprite a ready species.json points at exists, at the size the card expects."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image
import pytest

SPRITES = (
    Path(__file__).parent.parent / "custom_components/virtual_pet/frontend/sprites"
)
WORLDS = json.loads((SPRITES.parent / "worlds.json").read_text())
READY = sorted(
    p.parent.name
    for p in SPRITES.glob("*/species.json")
    if json.loads(p.read_text()).get("ready", True)
)


def png(species: str, name: str) -> Path:
    # "bird/medicine" borrows another species' sprite.
    path = name if "/" in name else f"{species}/{name}"
    return SPRITES / f"{path}.png"


@pytest.mark.parametrize("species", READY)
def test_every_referenced_sprite_exists(species: str) -> None:
    sp = json.loads((SPRITES / species / "species.json").read_text())
    names = [
        f"{stage}_{mood}_{i}"
        for stage in sp["stages"]
        for mood in sp["moods"]
        for i in range(1, sp.get("frames", 1) + 1)
    ]
    for frames in (sp.get("egg") or {}).values():
        names += frames
    for pose in (sp.get("extras") or {}).values():
        names += pose if isinstance(pose, list) else [pose]
    for prop in (sp.get("props") or {}).values():
        names += prop if isinstance(prop, list) else [prop]
    names += list((sp.get("backgrounds") or {}).values())
    if sp.get("murk"):
        names.append(sp["murk"])
    missing = [n for n in names if not png(species, n).exists()]
    assert missing == []
    for stage in sp["stages"]:
        for mood in sp["moods"]:
            assert Image.open(png(species, f"{stage}_{mood}_1")).size == (256, 256)
    for stage in sp.get("scale", {}):
        assert stage in sp["stages"]


@pytest.mark.parametrize("world", sorted(WORLDS))
def test_the_first_ready_creature_of_each_world_brings_the_egg_and_scenes(
    world: str,
) -> None:
    ready = [s for s in WORLDS[world]["roster"] if s in READY]
    if not ready:
        pytest.skip("no ready creature yet")
    sp = json.loads((SPRITES / ready[0] / "species.json").read_text())
    assert sp.get("egg") and sp.get("backgrounds", {}).get("day")
    for name in [WORLDS[world].get("emblem"), *WORLDS[world].get("deco", [])]:
        if name:
            assert (SPRITES.parent / "ui" / f"{name}.png").exists(), name


@pytest.mark.parametrize("species", READY)
def test_reactions_point_at_poses_the_species_has(species: str) -> None:
    sp = json.loads((SPRITES / species / "species.json").read_text())
    for action, pose in (sp.get("reactions") or {}).items():
        assert pose in (sp.get("extras") or {}), f"{species} {action} -> {pose}"
