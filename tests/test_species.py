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


def hat_problems(hat: dict, stages: list[str]) -> list[str]:
    """What is wrong with a species.json "hat" map; [] when it reads clean.

    A value is null (no hat fits the pose), [x, y] (the lower of y and the
    scanned head top) or [x, y, "exact"] (the brim top at exactly y). x and y are
    ints on the 256 sprite. A key is a stage or `<stage>_<mood>`.
    """
    out = []
    for key, val in hat.items():
        if key.split("_", 1)[0] not in stages:
            out.append(f"{key}: not a stage or <stage>_<mood>")
        if val is None:
            continue
        ok = (
            isinstance(val, list)
            and len(val) in (2, 3)
            and all(type(v) is int and 0 <= v <= 255 for v in val[:2])
            and (len(val) == 2 or val[2] == "exact")
        )
        if not ok:
            out.append(f'{key}: {val!r} is not null, [x, y] or [x, y, "exact"]')
    return out


@pytest.mark.parametrize("species", READY)
def test_hat_entries_are_null_points_or_exact_points(species: str) -> None:
    sp = json.loads((SPRITES / species / "species.json").read_text())
    assert hat_problems(sp.get("hat") or {}, sp["stages"]) == []


def test_the_hat_rule_takes_the_exact_form_and_rejects_the_rest() -> None:
    stages = ["baby", "child"]
    good = {"baby": [1, 2], "child_cozy": [182, 157, "exact"], "child_mask": None}
    assert hat_problems(good, stages) == []
    for bad in ([1], [1, 2, "snug"], [1, 2, 3], [1.5, 2], [256, 2], [1, -1], "exact"):
        assert hat_problems({"child": bad}, stages), bad
    assert hat_problems({"childe": [1, 2]}, stages)


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


# Species nature (plan-2026-11-02-species-nature.md section 4): clock, sky, company, habit.
# The table is the test's data, so changing one species is a deliberate diff here too.
NATURE = {
    "bird": ("day", "sun", "social", "performer"),
    "squirrel": ("day", "wind", "solo", "hoarder"),
    "deer": ("dusk", "fog", "social", "watcher"),
    "fox": ("dusk", "snow", "solo", "explorer"),
    "bananaslug": ("night", "rain", "solo", "explorer"),
    "gecko": ("night", "fire", "solo", "groomer"),
    "tarantula": ("night", "fire", "solo", "builder"),
    "tortoise": ("day", "sun", "solo", "basker"),
    "beardeddragon": ("day", "sun", "social", "basker"),
    "ballpython": ("night", "fire", "solo", "watcher"),
    "kitten": ("dusk", "fire", "solo", "groomer"),
    "bunny": ("dusk", "fire", "social", "groomer"),
    "corgi": ("day", "snow", "social", "explorer"),
    "hamster": ("night", "fire", "solo", "hoarder"),
    "ferret": ("dusk", "fire", "social", "hoarder"),
    "otter": ("day", "rain", "social", "groomer"),
    "octopus": ("night", "fog", "solo", "explorer"),
    "seal": ("day", "sun", "social", "basker"),
    "hermitcrab": ("night", "rain", "social", "hoarder"),
    "puffin": ("day", "wind", "social", "builder"),
    "treefrog": ("night", "rain", "social", "performer"),
    "axolotl": ("night", "fog", "solo", "watcher"),
    "pondturtle": ("day", "sun", "solo", "basker"),
    "duckling": ("day", "rain", "social", "explorer"),
    "beaver": ("night", "snow", "social", "builder"),
    "bat": ("night", "moon", "social", "performer"),
    "lunamoth": ("night", "moon", "solo", "performer"),
    "owl": ("night", "fog", "solo", "watcher"),
    "firefly": ("night", "rain", "social", "performer"),
    "opossum": ("night", "fire", "solo", "builder"),
}
NATURE_VALUES = {
    "clock": {"day", "dusk", "night"},
    "sky": {"sun", "rain", "snow", "fog", "wind", "fire", "moon"},
    "company": {"social", "solo"},
    "habit": {
        "hoarder",
        "builder",
        "basker",
        "groomer",
        "explorer",
        "watcher",
        "performer",
    },
}


def pace_of(pace: int) -> str:
    return "quick" if pace >= 40 else "slow" if pace <= 29 else "steady"


@pytest.mark.parametrize("species", READY)
def test_nature_block_is_valid(species: str) -> None:
    sp = json.loads((SPRITES / species / "species.json").read_text())
    nature = sp["nature"]
    assert set(nature) == set(NATURE_VALUES), species
    for key, allowed in NATURE_VALUES.items():
        assert nature[key] in allowed, f"{species} nature.{key}={nature[key]!r}"
    assert "pace" not in nature  # derived from voice.pace
    pace = sp["voice"]["pace"]
    assert isinstance(pace, int) and 20 <= pace <= 50, species
    assert (
        tuple(nature[k] for k in ("clock", "sky", "company", "habit"))
        == NATURE[species]
    )


def test_nature_table_covers_every_ready_species() -> None:
    assert sorted(NATURE) == READY


def test_nature_counts_do_not_drift() -> None:
    from collections import Counter

    def count(i: int) -> dict[str, int]:
        return dict(Counter(row[i] for row in NATURE.values()))

    assert count(0) == {"day": 10, "dusk": 5, "night": 15}
    assert count(1) == {
        "fire": 8,
        "rain": 6,
        "sun": 5,
        "fog": 4,
        "snow": 3,
        "wind": 2,
        "moon": 2,
    }
    assert count(2) == {"social": 15, "solo": 15}
    assert count(3) == {
        "explorer": 5,
        "performer": 5,
        "hoarder": 4,
        "builder": 4,
        "basker": 4,
        "groomer": 4,
        "watcher": 4,
    }
    paces = Counter(
        pace_of(json.loads((SPRITES / s / "species.json").read_text())["voice"]["pace"])
        for s in READY
    )
    assert dict(paces) == {"quick": 10, "steady": 12, "slow": 8}


# The bowl clip (card-care.js bowlCuts; plan care-reactions 5.1): a species with "bowl_rim"
# has a feed bowl whose food reads when clipped from the top in three steps. The same maths
# as the card: the last cut at the rim (on the 4 px art grid), the two before it where the
# three bites are most even. Each bite takes at least 8% of the sprite's opaque pixels.
BOWL_GRID = 4
BOWL_STEP_MIN = 0.08


def bowl_cuts(rows: list[int], rim: float) -> list[int] | None:
    rim_row = round(rim * len(rows) / BOWL_GRID) * BOWL_GRID
    up_to = [0]
    for r in range(rim_row):
        up_to.append(up_to[-1] + rows[r])
    best = None
    for a in range(BOWL_GRID, rim_row, BOWL_GRID):
        for b in range(a + BOWL_GRID, rim_row, BOWL_GRID):
            least = min(up_to[a], up_to[b] - up_to[a], up_to[rim_row] - up_to[b])
            if best is None or least > best[0]:
                best = (least, [a, b, rim_row])
    return best[1] if best else None


@pytest.mark.parametrize("species", READY)
def test_bowl_rim_is_where_the_clip_reads(species: str) -> None:
    sp = json.loads((SPRITES / species / "species.json").read_text())
    rim = sp.get("bowl_rim")
    if rim is None:
        return
    assert isinstance(rim, (int, float)) and 0 < rim < 1, f"{species} bowl_rim {rim}"
    feed = sp["props"]["feed"]
    alpha = np.asarray(Image.open(png(species, feed)).convert("RGBA"))[:, :, 3]
    rows = [int(n) for n in (alpha > 0).sum(axis=1)]
    cuts = bowl_cuts(rows, rim)
    assert cuts, f"{species}: no food above the rim"
    total = sum(rows)
    gone = [sum(rows[:c]) for c in cuts]
    steps = [gone[0] / total, (gone[1] - gone[0]) / total, (gone[2] - gone[1]) / total]
    assert min(steps) >= BOWL_STEP_MIN, (
        f"{species} bites {[round(x, 3) for x in steps]}"
    )


def test_bowl_cuts_balance_the_bites() -> None:
    rows = [0] * 8 + [10] * 24 + [50] * 96  # food rows 8-31, the bowl from 32
    assert bowl_cuts(rows, 0.25) == [16, 24, 32]


# The blanket drape (care reactions D, plan 5.3; card shell-data.js DRAPE). Three shared sizes, each a
# whole 256 px frame (ui/drape_<s|m|l>_<1|2|3>.png, ground line y=224), chosen by the width of the pet's
# asleep_1 body, not its stage (FM, 2026-11-02): S up to 160 px, M 161-210, L the rest. The entry is
# [size, y]: y moves the drape lower in whole art pixels (4 px); bat and otter have none (null).
DRAPE_SIZES = {"s": 160, "m": 210}  # the widest body each size takes; larger is L
DRAPE_OPT_OUT = {"bat", "otter"}
DRAPE_GROUND = 224
DRAPE_UI = SPRITES.parent / "ui"


def drape_table() -> dict[str, dict[str, tuple[str, int]] | None]:
    src = (ROOT / "src/card/shell-data.js").read_text()
    body = re.search(r"const DRAPE = \{\n(.*?)\n\};", src, re.S).group(1)
    table: dict[str, dict[str, tuple[str, int]] | None] = {}
    for line in body.splitlines():
        m = re.match(r"\s+(\w+): (null|\{(.*)\}),$", line)
        assert m, f"DRAPE line not understood: {line!r}"
        table[m.group(1)] = (
            None
            if m.group(2) == "null"
            else {
                st: (size, int(y))
                for st, size, y in re.findall(r'(\w+): \["(\w)", (\d+)\]', m.group(3))
            }
        )
    return table


def asleep_box(species: str, stage: str) -> tuple[int, int, int, int]:
    alpha = np.asarray(Image.open(png(species, f"{stage}_asleep_1")).convert("RGBA"))[
        :, :, 3
    ]
    ys, xs = np.nonzero(alpha)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def drape_box(size: str, frame: int) -> tuple[int, int, int, int]:
    im = Image.open(DRAPE_UI / f"drape_{size}_{frame}.png").convert("RGBA")
    assert im.size == (256, 256), f"drape_{size}_{frame} is {im.size}"
    box = im.split()[-1].getbbox()
    assert box, f"drape_{size}_{frame} is empty"
    return box


def test_the_drape_table_names_every_species() -> None:
    assert sorted(drape_table()) == READY
    assert {s for s, v in drape_table().items() if v is None} == DRAPE_OPT_OUT


def test_the_drape_art_is_three_frames_of_three_sizes_on_the_ground_line() -> None:
    heights = {"s": 100, "m": 112, "l": 120}
    for size, height in heights.items():
        boxes = [drape_box(size, n) for n in (1, 2, 3)]
        assert all(b[3] == DRAPE_GROUND for b in boxes), (size, boxes)
        assert boxes[2][3] - boxes[2][1] == height, (size, boxes[2])
        # Each step is taller than the one before: the blanket falls over the body.
        assert boxes[0][1] > boxes[1][1] > boxes[2][1], (size, boxes)


@pytest.mark.parametrize("species", READY)
def test_every_drape_entry_fits_its_sprite(species: str) -> None:
    entry = drape_table()[species]
    sp = json.loads((SPRITES / species / "species.json").read_text())
    stages = [s for s in sp["stages"] if s != "egg"]
    if species in DRAPE_OPT_OUT:
        assert entry is None
        return
    assert entry is not None and sorted(entry) == sorted(stages), (species, entry)
    for stage in stages:
        size, y = entry[stage]
        left, top, right, bottom = asleep_box(species, stage)
        width, height = right - left, bottom - top
        want = (
            "s"
            if width <= DRAPE_SIZES["s"]
            else "m"
            if width <= DRAPE_SIZES["m"]
            else "l"
        )
        assert size == want, (
            f"{species} {stage}: body {width} px wide wants {want}, has {size}"
        )
        assert y % 4 == 0 and 0 <= y <= 120, (
            f"{species} {stage}: y {y} is not a whole art pixel"
        )
        # The drape is wide enough for the body (a hair of slack), reaches the ground the body stands on,
        # and on its last frame covers the lower part of the body only: the face stays clear.
        dl, dt, dr, db = drape_box(size, 3)
        assert width <= (dr - dl) + 4, (
            f"{species} {stage}: body {width} px, drape {dr - dl}"
        )
        assert db + y >= bottom, (
            f"{species} {stage}: the drape stops above the body's feet"
        )
        cover = bottom - max(dt + y, top)
        assert 20 <= cover <= 0.55 * height + 4, (
            f"{species} {stage}: covers {cover} of {height} px"
        )
        assert cover >= 0.25 * height, (
            f"{species} {stage}: covers only {cover} of {height} px"
        )
