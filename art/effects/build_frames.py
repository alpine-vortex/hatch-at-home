"""Cut the reviewed four-by-four effect atlases into centered 256 px frames."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).parent
SOURCE = ROOT / "source"
FRAMES = ROOT / "frames"
# Sheet order is row-major. weather-02 row four is intentionally unused: it
# combined heat and frost in one cell, so separate loops come from weather-03.
SHEETS = {
    "emotion-01": ["calm", "happy", "sad", "scared"],
    "emotion-02": ["hungry", "surprised", "tired", "stressed"],
    "emotion-03": ["proud", "frustrated", "sparkle", "shimmer"],
    "weather-motion": ["swirl", "sunny", "drizzle", "rain"],
    "care-01": ["feed", "snack", "play", "clean"],
    "care-02": ["medicine", "praise", "scold", "tuck_in"],
    "weather-01": ["heavy_rain", "thunderstorm", "hail", "snow"],
    "weather-02": ["sleet", "fog", "wind"],
    "weather-03": ["hot", "cold", "overcast", "rainbow"],
}


def bounds(total: int, index: int, count: int) -> tuple[int, int]:
    """Integer split that uses every source pixel, including odd dimensions."""
    return round(total * index / count), round(total * (index + 1) / count)


def main() -> None:
    FRAMES.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, object]] = {}
    for sheet, effects in SHEETS.items():
        atlas = Image.open(SOURCE / f"{sheet}.png").convert("RGBA")
        for row, effect in enumerate(effects):
            frame_paths = []
            y0, y1 = bounds(atlas.height, row, 4)
            for col in range(4):
                x0, x1 = bounds(atlas.width, col, 4)
                cell = atlas.crop((x0, y0, x1, y1))
                # Preserve the cell's aspect ratio and center it on a shared
                # transparent canvas; nearest-neighbour keeps the pixel edges.
                scale = 224 / max(cell.size)
                size = (max(1, round(cell.width * scale)), max(1, round(cell.height * scale)))
                cell = cell.resize(size, Image.Resampling.NEAREST)
                canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
                canvas.alpha_composite(cell, ((256 - size[0]) // 2, (256 - size[1]) // 2))
                name = f"{effect}_{col + 1}.png"
                canvas.save(FRAMES / name, optimize=True)
                frame_paths.append(f"frames/{name}")
            manifest[effect] = {"frames": frame_paths, "source": f"source/{sheet}.png", "row": row + 1}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
