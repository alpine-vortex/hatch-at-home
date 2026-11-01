"""Find and basket stand-ins (docs/plan-2026-11-01-visitors-v2.md §9), drawn in code.

Usage: python art/finds/make_finds.py [out dir]
       (default custom_components/virtual_pet/frontend/ui)

Finds: 60 (10 a world, worlds.json `finds`), one frame each, 64 x 64 PNG: a
16 x 16 grid of world cells at 4 px a cell (WORLD_GRID 64), centred, on a
transparent ground, with the 128 sprites' dark outline. The card shows a find
16 cells wide (reveal and collection), so one art cell is one world cell.
Names: find_<world>_<id>.png.

Baskets: 3, 48 x 48 PNG (12 cells): one shared wicker basket with 1, 2 or 3
generic things peeking out (not the actual finds). Names: basket_<n>.png.

These are simple shapes so V-B and V-C can ship and be felt on a phone; the
real batch (V-F) keeps the names, canvases and anchoring, and swaps them one
world per commit. Each shape is a mask of cells; the outline is every clear
cell beside a filled one.
"""

from __future__ import annotations

from collections.abc import Callable
import json
import math
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "custom_components" / "virtual_pet" / "frontend"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else FRONTEND / "ui"
PX = 4  # image px a world cell
OUTLINE = (34, 20, 10, 255)

Cell = tuple[int, int]
# A shape: (x, y) cell centre in -1..1 -> 0 clear, 1 body, 2 accent.
Shape = Callable[[float, float], int]


def _rgb(hex_colour: str) -> tuple[int, int, int, int]:
    h = hex_colour.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


# --- Shapes --------------------------------------------------------------------


def round_(r: float = 0.6, ring: float = 0.0) -> Shape:
    def f(x: float, y: float) -> int:
        d = math.hypot(x, y)
        if d > r:
            return 0
        return 2 if ring and d < ring else 1

    return f


def oval(rx: float, ry: float, tilt: float = 0.0, stripes: int = 0) -> Shape:
    c, s = math.cos(tilt), math.sin(tilt)

    def f(x: float, y: float) -> int:
        u, v = x * c + y * s, -x * s + y * c
        if (u / rx) ** 2 + (v / ry) ** 2 > 1:
            return 0
        if stripes and int((v / ry + 1) * stripes) % 2:
            return 2
        return 1

    return f


def leaf(tilt: float = -0.6, width: float = 0.35, spine: bool = True) -> Shape:
    """A pointed oval with a centre vein: leaves and feathers."""
    c, s = math.cos(tilt), math.sin(tilt)

    def f(x: float, y: float) -> int:
        u, v = x * c + y * s, -x * s + y * c
        if abs(u) > 0.85:
            return 0
        half = width * (1 - (u / 0.85) ** 2)
        if abs(v) > half:
            return 0
        return 2 if spine and abs(v) < 0.07 else 1

    return f


def star(points: int = 5, outer: float = 0.75, inner: float = 0.32) -> Shape:
    def f(x: float, y: float) -> int:
        a = math.atan2(y, x) + math.pi / 2
        seg = (a % (2 * math.pi / points)) / (2 * math.pi / points)
        r = inner + (outer - inner) * abs(1 - 2 * seg)
        return 1 if math.hypot(x, y) <= r else 0

    return f


def shell() -> Shape:
    """A scallop: a fan with ridges and a hinge."""

    def f(x: float, y: float) -> int:
        yy = y + 0.35
        d = math.hypot(x, yy)
        if yy < -0.05:
            return 1 if abs(x) < 0.2 and yy > -0.25 else 0
        if d > 0.8 or abs(math.atan2(x, yy)) > 1.1:
            return 0
        return 2 if int((math.atan2(x, yy) + 1.1) * 4.5) % 2 else 1

    return f


def spiral() -> Shape:
    """A snail shell: a round with a spiral line."""

    def f(x: float, y: float) -> int:
        d = math.hypot(x, y)
        if d > 0.65:
            return 0
        a = (math.atan2(y, x) + math.pi) / (2 * math.pi)
        return 2 if abs((d / 0.65 * 3 + a) % 1 - 0.5) < 0.14 else 1

    return f


def drop() -> Shape:
    def f(x: float, y: float) -> int:
        if y > 0.15:
            return 1 if math.hypot(x, y - 0.2) < 0.5 else 0
        return 1 if y > -0.75 and abs(x) < (y + 0.75) * 0.58 else 0

    return f


def box(w: float = 0.6, h: float = 0.45, band: bool = True) -> Shape:
    def f(x: float, y: float) -> int:
        if abs(x) > w or abs(y) > h:
            return 0
        return 2 if band and abs(y) < 0.1 else 1

    return f


def heart() -> Shape:
    def f(x: float, y: float) -> int:
        x, y = x * 1.7, -y * 1.7 + 0.3
        return 1 if (x * x + y * y - 1) ** 3 - x * x * y**3 <= 0 else 0

    return f


def mushroom() -> Shape:
    def f(x: float, y: float) -> int:
        if y < 0.05 and math.hypot(x, (y + 0.05) * 1.4) < 0.7:
            return 2 if math.hypot(x + 0.25, y + 0.35) < 0.12 else 1
        return 2 if 0.05 <= y < 0.7 and abs(x) < 0.18 else 0

    return f


def bottle() -> Shape:
    def f(x: float, y: float) -> int:
        u, v = (x + y) / math.sqrt(2), (y - x) / math.sqrt(2)  # tilted
        if abs(v) < 0.32 and -0.25 < u < 0.7:
            return 2 if abs(v) < 0.12 and 0 < u < 0.5 else 1
        return 1 if abs(v) < 0.13 and -0.65 < u <= -0.25 else 0

    return f


def key() -> Shape:
    def f(x: float, y: float) -> int:
        if math.hypot(x + 0.45, y) < 0.32:
            return 0 if math.hypot(x + 0.45, y) < 0.14 else 1
        if -0.15 < x < 0.75 and abs(y) < 0.09:
            return 1
        return 1 if x > 0.45 and 0 < y < 0.3 and int(x * 10) % 2 else 0

    return f


def sock() -> Shape:
    def f(x: float, y: float) -> int:
        leg = -0.15 < x < 0.3 and -0.75 < y < 0.35
        foot = -0.6 < x < 0.3 and 0.15 < y < 0.55
        if not (leg or foot):
            return 0
        return 2 if y < -0.5 else 1

    return f


def cone() -> Shape:
    """A pine cone: an oval with scales."""

    def f(x: float, y: float) -> int:
        if (x / 0.42) ** 2 + (y / 0.72) ** 2 > 1:
            return 0
        return 2 if (int((x + y) * 5) + int((x - y) * 5)) % 2 else 1

    return f


def acorn() -> Shape:
    def f(x: float, y: float) -> int:
        if y < -0.15:
            return (
                2
                if math.hypot(x, (y + 0.15) * 1.6) < 0.55
                or (abs(x) < 0.06 and y > -0.7)
                else 0
            )
        return 1 if (x / 0.42) ** 2 + ((y + 0.1) / 0.68) ** 2 <= 1 else 0

    return f


def crystal() -> Shape:
    def f(x: float, y: float) -> int:
        for cx, h in ((-0.3, 0.45), (0.0, 0.75), (0.3, 0.55)):
            if (
                abs(x - cx) < 0.14
                and -h < y < 0.6 - abs(x - cx) * 0
                and y > -h + abs(x - cx)
            ):
                return 2 if x - cx > 0.03 else 1
        return 0

    return f


def rocket() -> Shape:
    def f(x: float, y: float) -> int:
        if abs(x) < 0.22 and -0.45 < y < 0.45:
            return 2 if math.hypot(x, y + 0.1) < 0.1 else 1
        if y <= -0.45 and abs(x) < (y + 0.8) * 0.65:
            return 1
        return 2 if 0.2 < y < 0.65 and abs(x) < 0.45 and abs(x) > 0.18 else 0

    return f


def lantern() -> Shape:
    def f(x: float, y: float) -> int:
        if abs(x) < 0.4 and -0.35 < y < 0.5:
            return 2 if abs(x) < 0.22 and -0.2 < y < 0.35 else 1
        return 1 if abs(x) < 0.15 and -0.6 < y <= -0.35 else 0

    return f


def card() -> Shape:
    dots = [(-0.3, -0.25), (0.05, -0.4), (0.25, 0.0), (-0.1, 0.25), (0.3, 0.35)]

    def f(x: float, y: float) -> int:
        if abs(x) > 0.5 or abs(y) > 0.65:
            return 0
        return 2 if any(math.hypot(x - a, y - b) < 0.08 for a, b in dots) else 1

    return f


def dust() -> Shape:
    sparks = [
        (-0.4, -0.3, 0.2),
        (0.3, -0.4, 0.14),
        (0.15, 0.25, 0.25),
        (-0.35, 0.4, 0.12),
    ]

    def f(x: float, y: float) -> int:
        for a, b, r in sparks:
            if abs(x - a) + abs(y - b) < r:
                return 1
        return 0

    return f


def thread() -> Shape:
    def f(x: float, y: float) -> int:
        if abs(x) < 0.5 and 0.45 < abs(y) < 0.62:
            return 1
        return (
            (2 if int((y + 1) * 9) % 2 else 1)
            if abs(x) < 0.38 and abs(y) <= 0.45
            else 0
        )

    return f


def boat() -> Shape:
    def f(x: float, y: float) -> int:
        if 0.1 < y < 0.45 and abs(x) < 0.75 - (y - 0.1):
            return 1
        return 2 if -0.6 < y <= 0.1 and abs(x) < (y + 0.6) * 0.7 else 0

    return f


def scope() -> Shape:
    def f(x: float, y: float) -> int:
        u, v = (x - y) / math.sqrt(2), (x + y) / math.sqrt(2)
        if -0.6 < u < 0.6 and abs(v) < 0.12 + (u + 0.6) * 0.1:
            return 2 if abs(u - 0.2) < 0.06 else 1
        return (
            1
            if (abs(x + 0.1 - (y - 0.3)) < 0.07 or abs(x - 0.1 + (y - 0.3)) < 0.07)
            and y > 0.2
            and y < 0.75
            else 0
        )

    return f


def cup() -> Shape:
    def f(x: float, y: float) -> int:
        if y > -0.2 and math.hypot(x, (y + 0.2) * 1.2) < 0.6:
            return 2 if y < 0.0 else 1
        return 1 if abs(x) < 0.08 and -0.5 < y <= -0.2 else 0

    return f


# --- The finds ---------------------------------------------------------------

# id -> (shape, body, accent)
FINDS: dict[str, tuple[Shape, str, str]] = {
    # Woodland
    "pinecone": (cone(), "#8a5a2b", "#5e3a1a"),
    "acorn": (acorn(), "#c08a3e", "#6b4a26"),
    "mapleseed": (leaf(-0.9, 0.22), "#c9a15a", "#8a6a33"),
    "wildstrawberry": (heart(), "#d8323f", "#f6e27a"),
    "jayfeather": (leaf(-0.7, 0.2), "#2f6fd0", "#14306b"),
    "snailshell": (spiral(), "#d9a066", "#8a5a2b"),
    "chanterelle": (mushroom(), "#f0a830", "#c07818"),
    "frostedleaf": (leaf(-0.3, 0.38), "#b9d7e8", "#ffffff"),
    "fourleafclover": (star(4, 0.7, 0.4), "#3e9e3e", "#2b6e2b"),
    "acorncup": (cup(), "#a7743c", "#6b4a26"),
    # Terrarium
    "tinymushroom": (mushroom(), "#c84a3c", "#f4efe2"),
    "driedflower": (star(6, 0.6, 0.35), "#c7a0b8", "#8a6a33"),
    "curledbark": (spiral(), "#7a5537", "#4d3320"),
    "seedpod": (oval(0.3, 0.7, 0.5, 3), "#9aa35a", "#6b7034"),
    "shedskin": (leaf(0.4, 0.3, False), "#e8dcc0", "#c9b88f"),
    "crystalcluster": (crystal(), "#a98be0", "#e2d4ff"),
    "dewdrop": (drop(), "#8ed0f0", "#e8f8ff"),
    "pressedmoss": (oval(0.65, 0.45, 0.0, 4), "#5f8f3a", "#3f6a26"),
    "tinyfossil": (spiral(), "#cfc3a6", "#8f8166"),
    "pressedfern": (leaf(-0.5, 0.4), "#4f9a52", "#2f6a33"),
    # Hearth
    "button": (round_(0.55, 0.2), "#d9534f", "#8a2e2b"),
    "ribbon": (star(2, 0.75, 0.2), "#e86aa0", "#b03a70"),
    "spool": (thread(), "#c49a6c", "#4f7fd0"),
    "cookie": (round_(0.62, 0.0), "#d9a35a", "#6b4a26"),
    "lostsock": (sock(), "#7fb0e0", "#e05050"),
    "toymouse": (oval(0.65, 0.4), "#9a9a9a", "#e8a0b0"),
    "thimble": (box(0.35, 0.55, True), "#c0c4cc", "#8a8e96"),
    "pinesprig": (leaf(-0.8, 0.3), "#2f7a4a", "#1d4f30"),
    "brasskey": (key(), "#d4a83a", "#8a6a20"),
    "knittedheart": (heart(), "#e04a6a", "#a02a4a"),
    # Tidepool
    "greenseaglass": (oval(0.5, 0.35, 0.4), "#7ed0a0", "#c8f0d8"),
    "scallopshell": (shell(), "#f0b090", "#c07a5a"),
    "periwinkle": (spiral(), "#6a7a9a", "#3a4a6a"),
    "sanddollar": (round_(0.62, 0.0), "#e8dcc0", "#b0a080"),
    "blueseaglass": (round_(0.45, 0.0), "#5a9ae0", "#c0e0ff"),
    "gullfeather": (leaf(-0.7, 0.22), "#e8ecf0", "#8a96a0"),
    "urchinshell": (star(10, 0.7, 0.5), "#8a5aa0", "#5a3a70"),
    "redseaglass": (crystal(), "#d04a4a", "#ffb0b0"),
    "bottle": (bottle(), "#7ab08a", "#f4efe2"),
    "pearl": (round_(0.4, 0.0), "#f4f0ec", "#d8d0e0"),
    # Pond
    "lilyflower": (star(6, 0.7, 0.3), "#f4c0d8", "#f6e27a"),
    "cattailfluff": (dust(), "#e8dcc8", "#c0b090"),
    "corkfloat": (oval(0.35, 0.6, 0.0, 2), "#e05040", "#f4efe2"),
    "watersnailshell": (spiral(), "#6a5a3a", "#3a3020"),
    "heronfeather": (leaf(-0.7, 0.2), "#9aa8b8", "#5a6878"),
    "willowleaf": (leaf(-1.0, 0.18), "#9ac05a", "#6a8a33"),
    "reedwhistle": (box(0.7, 0.14, False), "#c0a060", "#8a6a33"),
    "frogbit": (round_(0.6, 0.0), "#5ab04a", "#3a7a2a"),
    "koiscale": (shell(), "#f0b030", "#ffe080"),
    "paperboat": (boat(), "#f4efe2", "#c0c8d0"),
    # Night Sky
    "stardust": (dust(), "#f6e27a", "#ffffff"),
    "paperstar": (star(5, 0.7, 0.32), "#f0d060", "#c0a030"),
    "moonflower": (star(5, 0.65, 0.45), "#e8ecff", "#b0b8e0"),
    "constellation": (card(), "#2a3a6a", "#f6e27a"),
    "nighthawkfeather": (leaf(-0.7, 0.2), "#5a4a3a", "#e8e0d0"),
    "tinyrocket": (rocket(), "#e0e4ec", "#d04a4a"),
    "moonstone": (oval(0.5, 0.42), "#c8d0f0", "#ffffff"),
    "lantern": (lantern(), "#3a3a4a", "#f6c040"),
    "fallenstar": (star(5, 0.8, 0.35), "#ffe060", "#fff8c0"),
    "telescope": (scope(), "#7a5a3a", "#d4a83a"),
}


def draw(shape: Shape, body: str, accent: str, grid: int) -> Image.Image:
    cells: dict[Cell, int] = {}
    for y in range(grid):
        for x in range(grid):
            u = (x + 0.5) / grid * 2 - 1
            v = (y + 0.5) / grid * 2 - 1
            if (k := shape(u, v)) > 0:
                cells[(x, y)] = k
    img = Image.new("RGBA", (grid * PX, grid * PX), (0, 0, 0, 0))
    colours = {1: _rgb(body), 2: _rgb(accent)}

    def paint(cell: Cell, rgba: tuple[int, int, int, int]) -> None:
        x0, y0 = cell[0] * PX, cell[1] * PX
        for dy in range(PX):
            for dx in range(PX):
                img.putpixel((x0 + dx, y0 + dy), rgba)

    for (x, y), k in cells.items():
        paint((x, y), colours[k])
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) not in cells and 0 <= nx < grid and 0 <= ny < grid:
                paint((nx, ny), OUTLINE)
    return img


def basket_shape(n: int) -> Shape:
    """A wicker basket, with n round things peeking over its rim."""
    peeks = [(-0.35, -0.2, "a"), (0.3, -0.25, "b"), (0.0, -0.45, "c")][:n]

    def f(x: float, y: float) -> int:
        if -0.05 < y < 0.75 and abs(x) < 0.8 - (y + 0.05) * 0.25:
            return 2 if (int((x + 1) * 6) + int((y + 1) * 6)) % 2 else 1
        for cx, cy, _ in peeks:
            if math.hypot(x - cx, y - cy) < 0.28:
                return 3
        return 0

    return f


def draw_basket(n: int) -> Image.Image:
    grid, peek = 12, ("#e86a5a", "#f6e27a", "#7ec07a")
    shape = basket_shape(n)
    img = Image.new("RGBA", (grid * PX, grid * PX), (0, 0, 0, 0))
    cells: dict[Cell, int] = {}
    for y in range(grid):
        for x in range(grid):
            u = (x + 0.5) / grid * 2 - 1
            v = (y + 0.5) / grid * 2 - 1
            if (k := shape(u, v)) > 0:
                cells[(x, y)] = k
    for (x, y), k in cells.items():
        if k == 3:
            rgba = _rgb(peek[0 if x < 5 else 1 if x > 6 else 2])
        else:
            rgba = _rgb("#c08a4a" if k == 1 else "#8a5a2b")
        for dy in range(PX):
            for dx in range(PX):
                img.putpixel((x * PX + dx, y * PX + dy), rgba)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) not in cells and 0 <= nx < grid and 0 <= ny < grid:
                for dy in range(PX):
                    for dx in range(PX):
                        img.putpixel((nx * PX + dx, ny * PX + dy), OUTLINE)
    return img


def main() -> None:
    worlds = json.loads((FRONTEND / "worlds.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for world, data in worlds.items():
        for find in data["finds"]:
            shape, body, accent = FINDS[find["id"]]
            draw(shape, body, accent, 16).save(
                OUT / f"find_{world}_{find['id']}.png", optimize=True
            )
            n += 1
    for count in (1, 2, 3):
        draw_basket(count).save(OUT / f"basket_{count}.png", optimize=True)
    print(f"{n} finds + 3 baskets -> {OUT}")


if __name__ == "__main__":
    main()
