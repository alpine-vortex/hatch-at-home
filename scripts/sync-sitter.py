#!/usr/bin/env python3
"""Copy the sitter's art into the served folder and write its manifest.

art/sitter/ stays the source (and the review page); the card serves
custom_components/virtual_pet/frontend/sitter/ (docs/plan-2026-11-04-sitter-visits.md, S3a).

    python3 scripts/sync-sitter.py          # write the copy and sitters.json
    python3 scripts/sync-sitter.py --check  # write nothing; exit 1 if they differ

A sitter is a folder of PNGs. Its poses are whatever the folder holds, so a new sitter is a
folder drop-in plus a row in sitters.json, and the card never asks for a file the manifest
does not list. S3a ships the base sitter only; S3b (looks) and S3c (full sitters) switch
their kind on in KINDS below.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "art" / "sitter"
OUT = ROOT / "custom_components" / "virtual_pet" / "frontend" / "sitter"

# Which kinds of sitter are served. S3b adds "look", S3c adds "full".
KINDS = ("base",)

FRAME = re.compile(r"^([a-z]+)_(\d+)$")


def poses_of(folder: Path) -> dict[str, list[str]]:
    """{pose: [stem, ...]} for a folder of <pose>_<n>.png (and lone <pose>.png) files."""
    poses: dict[str, list[tuple[int, str]]] = {}
    for png in sorted(folder.glob("*.png")):
        m = FRAME.match(png.stem)
        pose, n = (m.group(1), int(m.group(2))) if m else (png.stem, 1)
        if png.stem == "accessory":
            continue  # a look's prop, not a pose (S3b)
        poses.setdefault(pose, []).append((n, png.stem))
    return {
        pose: [stem for _, stem in sorted(frames)]
        for pose, frames in sorted(poses.items())
    }


def sources() -> dict[str, tuple[Path, str, dict]]:
    """id -> (source folder, served dir, manifest extras)."""
    found: dict[str, tuple[Path, str, dict]] = {}
    if "base" in KINDS:
        found["base"] = (ART / "frames", "base", {"kind": "base"})
    if "look" in KINDS:
        for folder in sorted((ART / "looks").glob("*/")):
            found[f"look-{folder.name}"] = (
                folder,
                f"looks/{folder.name}",
                {"kind": "look", "finish": folder.name},
            )
    if "full" in KINDS:
        for folder in sorted((ART / "sitters").glob("*/frames")):
            finish = folder.parent.name
            found[f"full-{finish}"] = (
                folder,
                f"full/{finish}",
                {"kind": "full", "finish": finish},
            )
    return found


def build() -> tuple[dict, dict[Path, Path]]:
    """The manifest and {destination: source} for every file served."""
    sitters: dict[str, dict] = {}
    files: dict[Path, Path] = {}
    for sid, (folder, dest, extra) in sources().items():
        poses = poses_of(folder)
        if not poses:
            raise SystemExit(f"{folder} holds no frames")
        sitters[sid] = {**extra, "dir": dest, "poses": poses}
        for png in sorted(folder.glob("*.png")):
            files[OUT / dest / png.name] = png
    # Which finish is drawn by which sitter: a full sitter beats a look. The base answers the rest.
    by_finish: dict[str, str] = {}
    for sid, row in sitters.items():
        if row["kind"] in ("look", "full") and (
            row["kind"] == "full" or row["finish"] not in by_finish
        ):
            by_finish[row["finish"]] = sid
    return {
        "version": 1,
        "base": "base",
        "sitters": sitters,
        "by_finish": by_finish,
    }, files


def render(manifest: dict) -> str:
    """The manifest as JSON, one pose to a line so a diff reads."""
    rows = []
    for sid, row in manifest["sitters"].items():
        head = ", ".join(
            f"{json.dumps(k)}: {json.dumps(v)}" for k, v in row.items() if k != "poses"
        )
        poses = ",\n".join(
            f"    {json.dumps(p)}: {json.dumps(f)}" for p, f in row["poses"].items()
        )
        rows.append(f'  {json.dumps(sid)}: {{{head}, "poses": {{\n{poses}\n  }}}}')
    return (
        "{\n"
        f'"version": {manifest["version"]},\n"base": {json.dumps(manifest["base"])},\n'
        f'"by_finish": {json.dumps(manifest["by_finish"])},\n'
        '"sitters": {\n' + ",\n".join(rows) + "\n}\n}\n"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    manifest, files = build()
    text = render(manifest)
    stale = []
    if (
        not (OUT / "sitters.json").exists()
        or (OUT / "sitters.json").read_text() != text
    ):
        stale.append(OUT / "sitters.json")
    for dest, src in files.items():
        if not dest.exists() or dest.read_bytes() != src.read_bytes():
            stale.append(dest)
    extra = [p for p in OUT.rglob("*.png") if p not in files] if OUT.exists() else []
    if args.check:
        for p in stale + extra:
            print(f"differs: {p.relative_to(ROOT)}")
        return 1 if stale or extra else 0
    for dest, src in files.items():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
    for p in extra:
        p.unlink()
    (OUT / "sitters.json").write_text(text)
    print(
        f"{len(files)} frames, {len(manifest['sitters'])} sitters -> {OUT.relative_to(ROOT)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
