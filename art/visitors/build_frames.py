"""Cut 4x4 world visitor atlases into transparent, centered 256 px frames."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
SOURCE = ROOT / "source"
FRAMES = ROOT / "frames"
VISITORS = {
    "woodland": ["raccoon", "hedgehog", "chipmunk", "blue_jay"],
    "terrarium": ["horned_lizard", "desert_mouse", "scorpion", "cricket"],
    "hearth": ["house_sparrow", "ladybug", "painted_lady", "house_mouse"],
    "tidepool": ["sea_turtle", "moon_jellyfish", "seahorse", "shrimp"],
    "pond": ["blue_darner", "water_strider", "koi", "tadpole"],
    "nightsky": ["flying_squirrel", "striped_skunk", "nightjar", "stag_beetle"],
}
POSES = ["idle", "walk_a", "walk_b", "interact"]
# These two atlas rows contain a few stray pixels well above the drawn sprite.
TOP_CLEANUP = {"chipmunk": 80, "water_strider": 64}


def edge(n: int, i: int) -> int:
    return round(n * i / 4)


def clear_edge_fragments(cell: Image.Image) -> Image.Image:
    """Remove stray atlas pixels that cross a grid cell boundary."""
    alpha = cell.getchannel("A")
    width, height = cell.size
    pixels = alpha.load()
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y] == 0 or (x, y) in visited:
                continue
            component = []
            stack = [(x, y)]
            visited.add((x, y))
            while stack:
                px, py = stack.pop()
                component.append((px, py))
                for ny in range(max(0, py - 1), min(height, py + 2)):
                    for nx in range(max(0, px - 1), min(width, px + 2)):
                        if pixels[nx, ny] and (nx, ny) not in visited:
                            visited.add((nx, ny))
                            stack.append((nx, ny))
            components.append(component)
    if components:
        # Image generation can leave isolated marks from a neighboring cell.
        # Drop tiny components above the main sprite while retaining feet,
        # wings, splashes, and other detached details around/below it.
        main = max(components, key=len)
        main_top = min(y for _, y in main)
        remove = [
            point
            for component in components
            if component is not main
            and len(component) < 1000
            and max(y for _, y in component) < main_top
            for point in component
        ]
    else:
        remove = []
    if remove:
        rgba = cell.load()
        for x, y in remove:
            rgba[x, y] = (0, 0, 0, 0)
    return cell


def main() -> None:
    manifest: dict[str, dict[str, object]] = {}
    for world, species in VISITORS.items():
        atlas = Image.open(SOURCE / f"{world}.png").convert("RGBA")
        for row, name in enumerate(species):
            y0, y1 = edge(atlas.height, row), edge(atlas.height, row + 1)
            frame_files = {}
            for col, pose in enumerate(POSES):
                x0, x1 = edge(atlas.width, col), edge(atlas.width, col + 1)
                cell = clear_edge_fragments(atlas.crop((x0, y0, x1, y1)))
                scale = 224 / max(cell.size)
                size = (max(1, round(cell.width * scale)), max(1, round(cell.height * scale)))
                cell = cell.resize(size, Image.Resampling.NEAREST)
                canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
                canvas.alpha_composite(cell, ((256 - size[0]) // 2, (256 - size[1]) // 2))
                if name in TOP_CLEANUP:
                    alpha = canvas.getchannel("A")
                    alpha.paste(0, (0, 0, 256, TOP_CLEANUP[name]))
                    canvas.putalpha(alpha)
                path = FRAMES / world / f"{name}_{pose}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                canvas.save(path, optimize=True)
                frame_files[pose] = f"frames/{world}/{path.name}"
            manifest[name] = {"world": world, "poses": frame_files, "source": f"source/{world}.png", "row": row + 1}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
