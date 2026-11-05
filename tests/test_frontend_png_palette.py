"""Every frontend PNG is stored as an exact palette (mode "P") unless it truly needs more colours.

Pixel art arrives as RGBA; scripts/art/palette.py rewrites it losslessly, about a third smaller.
Backgrounds are already 256-colour (lossy, owner-approved), so they pass too.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

FRONTEND = (
    Path(__file__).resolve().parent.parent
    / "custom_components"
    / "virtual_pet"
    / "frontend"
)


def _needs_palette(path: Path) -> bool:
    with Image.open(path) as img:
        if img.mode == "P":
            return False
        rgba = np.array(img.convert("RGBA"))
    rgba[rgba[..., 3] == 0] = 0  # hidden colour of a clear pixel never shows
    return len(np.unique(rgba.reshape(-1, 4), axis=0)) <= 256


def test_frontend_pngs_are_palettised():
    bad = sorted(p for p in FRONTEND.rglob("*.png") if _needs_palette(p))
    assert not bad, (
        f"{len(bad)} frontend PNGs have <= 256 colours but are not palette PNGs, e.g. "
        + ", ".join(str(p.relative_to(FRONTEND)) for p in bad[:10])
        + "\nFix: python3 scripts/art/palette.py custom_components/virtual_pet/frontend/<folder>"
    )
