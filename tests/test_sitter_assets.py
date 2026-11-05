"""The sitter's art as the card gets it (sitter plan S3a, F4).

art/sitter/ is the source; custom_components/virtual_pet/frontend/sitter/ is what is served, with
a manifest (sitters.json) that lists every file the card may ask for. These tests fail when the
two drift, when a listed file is missing, when a file is served but unlisted, when the folder
goes over its size budget, and (once looks are switched on in S3b) when a shell finish has no look.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from custom_components.virtual_pet import rates as R

ROOT = Path(__file__).resolve().parent.parent
SERVED = ROOT / "custom_components" / "virtual_pet" / "frontend" / "sitter"
BUDGET_BYTES = 8 * 1024 * 1024
POSES_BASE = {
    "walk",
    "stand",
    "wave",
    "read",
    "doze",
    "chair",
    "feed",
    "play",
    "clean",
    "medicine",
    "tuck",
    "pat",
    "cheer",
    "shoo",
    "stretch",
    "tea",
    "laugh",
    "water",
    "window",
    "tidy",
}


def _sync():
    spec = importlib.util.spec_from_file_location(
        "sync_sitter", ROOT / "scripts" / "sync-sitter.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _manifest():
    return json.loads((SERVED / "sitters.json").read_text())


def test_served_copy_matches_the_source():
    """`python3 scripts/sync-sitter.py` writes the copy and the manifest; it is up to date."""
    sync = _sync()
    manifest, files = sync.build()
    assert (SERVED / "sitters.json").read_text() == sync.render(manifest), (
        "run scripts/sync-sitter.py"
    )
    for dest, src in files.items():
        assert dest.exists(), (
            f"{dest.relative_to(ROOT)} missing: run scripts/sync-sitter.py"
        )
        assert dest.read_bytes() == src.read_bytes(), (
            f"{dest.relative_to(ROOT)} differs from art/sitter"
        )


def test_every_listed_frame_exists_and_nothing_else_is_served():
    manifest = _manifest()
    listed = set()
    for sid, row in manifest["sitters"].items():
        assert row["poses"], sid
        for pose, stems in row["poses"].items():
            assert stems, f"{sid}/{pose} lists no frame"
            for stem in stems:
                path = SERVED / row["dir"] / f"{stem}.png"
                assert path.is_file(), f"{sid}/{pose}: {path.relative_to(ROOT)} missing"
                listed.add(path)
        for extra in row.get("files", []):  # a look's accessory, S3b
            path = SERVED / row["dir"] / f"{extra}.png"
            assert path.is_file(), path
            listed.add(path)
    served = set(SERVED.rglob("*.png"))
    assert served == listed, (
        f"served but not listed: {sorted(p.name for p in served - listed)}"
    )


def test_the_base_sitter_has_every_pose_with_its_stand_by_frames():
    manifest = _manifest()
    assert manifest["base"] in manifest["sitters"]
    poses = manifest["sitters"][manifest["base"]]["poses"]
    assert POSES_BASE <= set(poses)
    for pose in POSES_BASE - {"chair"}:
        assert len(poses[pose]) == 2, pose
    assert len(poses["chair"]) == 1


def test_by_finish_names_real_sitters_and_finishes():
    manifest = _manifest()
    for finish, sid in manifest["by_finish"].items():
        assert finish in R.SHELL_FINISHES, finish
        assert sid in manifest["sitters"], sid
    # S3b switches looks on: from then on every finish has a sitter of its own.
    if any(row["kind"] == "look" for row in manifest["sitters"].values()):
        assert set(manifest["by_finish"]) == set(R.SHELL_FINISHES)


def test_the_folder_stays_under_its_budget():
    size = sum(p.stat().st_size for p in SERVED.rglob("*") if p.is_file())
    assert size < BUDGET_BYTES, (
        f"frontend/sitter is {size / 1e6:.1f} MB; the budget is 8 MB"
    )
