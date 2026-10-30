"""Every sprite a ready species.json points at exists, at the size the card expects."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image
import pytest

ROOT = Path(__file__).parent.parent
SPRITES = ROOT / "custom_components/virtual_pet/frontend/sprites"
_spec = importlib.util.spec_from_file_location("grid", ROOT / "scripts/art/grid.py")
grid = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(grid)
CHARACTER = ("baby_", "child_", "teen_", "adult_", "egg_")
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
    for stage, frames in (sp.get("waves") or {}).items():
        assert stage in sp["stages"] and stage != "child", f"{species} waves.{stage}"
        names += frames
    for prop in (sp.get("props") or {}).values():
        names += prop if isinstance(prop, list) else [prop]
    names += list((sp.get("backgrounds") or {}).values())
    # Care-scene frames (the card's _sceneFrames): {"eat": [stages] or true}.
    for act, stages in (sp.get("acts") or {}).items():
        drawn = sp["stages"] if stages is True else stages
        names += [f"{stage}_{act}_{i}" for stage in drawn for i in (1, 2)]
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


@pytest.mark.parametrize("species", READY)
def test_every_stage_has_a_head_point_on_the_creature(species: str) -> None:
    """Trait flair over the head needs it; a point must sit on the drawn pet."""
    sp = json.loads((SPRITES / species / "species.json").read_text())
    for stage in sp["stages"]:
        x, y = sp["head"][stage]
        assert 0 <= x < 256 and 0 <= y < 224, f"{species} {stage}"
        alpha = (
            Image.open(SPRITES / species / f"{stage}_content_1.png")
            .convert("RGBA")
            .getchannel("A")
        )
        # Something of the pet within a few art pixels below the point.
        assert any(
            alpha.getpixel((min(255, max(0, x + dx)), y + dy)) > 40
            for dx in range(-24, 25, 2)
            for dy in range(0, 33, 2)
        ), f"{species} {stage} {x},{y} isn't on the creature"


def grid_problems(frames: dict[str, Image.Image]) -> list[str]:
    """What breaks one species' grid rule; [] when its frames pass.

    Every creature frame is 256 x 256 and coarsest on 2 px (the 128 art-pixel
    grid). Coarsest, because a 4 px frame also fits 2 px: a frame that is not
    coarsest on 2 px is a leftover 64 grid cut, or finer than the grid allows.
    """
    out = [f"{n} is {im.size}" for n, im in frames.items() if im.size != (256, 256)]
    out += [
        f"{n} on {g} px, species on 2 px"
        for n, im in frames.items()
        if (g := grid.coarsest(im)) != 2
    ]
    return out


@pytest.mark.parametrize("species", READY)
def test_every_creature_frame_is_on_the_species_art_grid(species: str) -> None:
    """Stage moods, _2 frames, extras, waves, care scenes and eggs alike."""
    frames = {
        p.stem: Image.open(p)
        for p in sorted((SPRITES / species).glob("*.png"))
        if p.name.startswith(CHARACTER)
    }
    assert frames
    assert grid_problems(frames) == []


def test_the_grid_rule_fails_a_64_frame_in_a_128_species() -> None:
    """The gate can fail: one leftover 4 px frame among 2 px ones."""
    rng = np.random.default_rng(0)

    def noise(px: int) -> Image.Image:
        cells = rng.integers(0, 256, (256 // px, 256 // px, 4), np.uint8)
        cells[..., 3] = 255
        return Image.fromarray(cells.repeat(px, 0).repeat(px, 1), "RGBA")

    frames = {f"adult_content_{i}": noise(2) for i in (1, 2)}
    frames["egg_idle_1"] = noise(2)
    assert grid_problems(frames) == []
    frames["adult_content_2"] = noise(4)
    assert grid_problems(frames) == ["adult_content_2 on 4 px, species on 2 px"]
    frames["adult_content_2"] = noise(2).crop((0, 0, 128, 128))
    assert grid_problems(frames) == ["adult_content_2 is (128, 128)"]
    frames["adult_content_2"] = noise(1)
    assert grid_problems(frames) == ["adult_content_2 on 1 px, species on 2 px"]


def test_the_grid_rule_fails_a_species_wholly_on_64() -> None:
    """No 4 px escape: a species with every frame on 4 px fails too."""
    rng = np.random.default_rng(1)
    cells = rng.integers(0, 256, (64, 64, 4), np.uint8)
    cells[..., 3] = 255
    im = Image.fromarray(cells.repeat(4, 0).repeat(4, 1), "RGBA")
    frames = {"adult_content_1": im, "egg_idle_1": im}
    assert grid_problems(frames) == [
        "adult_content_1 on 4 px, species on 2 px",
        "egg_idle_1 on 4 px, species on 2 px",
    ]


def test_every_trait_has_flair_art() -> None:
    from custom_components.virtual_pet.model import TRAITS

    ui = SPRITES.parent / "ui"
    for trait in TRAITS:
        assert (ui / f"flair_{trait}.png").exists() or (
            ui / f"flair_{trait}_1.png"
        ).exists(), trait


@pytest.mark.parametrize("species", READY)
def test_every_creature_has_a_voice(species: str) -> None:
    """Its own sound (one word), a babble's pitch and pace, and 2-3 foods it likes."""
    voice = json.loads((SPRITES / species / "species.json").read_text())["voice"]
    assert re.fullmatch(r"[a-z]+", voice["sound"]), voice["sound"]
    assert 330 <= voice["pitch"] <= 1200
    assert 25 <= voice["pace"] <= 45
    likes = voice["likes"]
    assert 2 <= len(likes) <= 3 and len(set(likes)) == len(likes)
    assert all(isinstance(x, str) and 0 < len(x) <= 16 for x in likes)


def test_creatures_in_one_world_sound_different() -> None:
    for key, world in WORLDS.items():
        sounds = [
            json.loads((SPRITES / s / "species.json").read_text())["voice"]["sound"]
            for s in world.get("roster", [])
            if s in READY
        ]
        assert len(set(sounds)) == len(sounds), key
