"""World visitor stand-ins for the card's visitors (VISITORS), drawn in code.

Usage: python art/visitors/make_visitors.py [out dir]
       (default custom_components/virtual_pet/frontend/ui)

The canvas (docs/plan-2026-10-31-visitors.md, "built"): every frame is 72 x 72
PNG, an 18 x 18 grid of world cells at 4 px a cell, the same grid as the props,
hats and seasonal pieces. The card shows it 18 cells wide (calc(var(--px) * 18),
about 13% of the screen), so one art pixel is one world cell, whole device
pixels. Transparent background, facing right (the card mirrors it). Walkers sit
on the canvas's bottom row; flyers are centred. Two frames: _1 and _2 (flap or
step). Under reduced motion only _1 shows.

Names: visitor_<world>_<id>_<1|2>.png. These are stand-ins so v1 can be felt on
the phone; the real batch keeps the names, canvas and anchoring.

This set is not the 256 px draft studies beside it (frames/, source/,
manifest.json: a different, older roster, not wired to the card).
"""

from __future__ import annotations

from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else ROOT / "custom_components" / "virtual_pet" / "frontend" / "ui"
)
GRID = 18  # world cells a side
PX = 4  # frame px a cell
OUTLINE = (34, 20, 10, 255)  # the 128 sprites' dark outline

# Templates: rows of role letters (space = clear). o outline, a body, b belly,
# c head, d wing, e eye, f beak/legs, g accent. Each visitor maps roles to colours.
BIRD_FLY = (
    [
        "   oo",
        "  oddo",
        "  odddo     ooo",
        "   oddo    occco",
        "    oddo  occecoff",
        "oo   oddoooccco",
        "oaoo oaaaaaacco",
        " oaaaabbbbbaao",
        "  oaabbbbbbao",
        "   ooaaaaaoo",
        "     ooooo",
    ],
    [
        "",
        "",
        "            ooo",
        "           occco",
        "          occecoff",
        "oo    ooooocccco",
        "oaoo oaaaaaaacco",
        " oaaaadddbbbbao",
        "  oaaoddddbbao",
        "   ooaoddddoo",
        "     o oddo",
        "        oo",
    ],
)
BIRD_STAND = (
    [
        "         ooo",
        "        occco",
        "       occecoff",
        "  oo  oacccco",
        " oaaooaaaacco",
        " oaaaaddddbbo",
        "  oaaddddbbbo",
        "   oaddddbbo",
        "    ooooooo",
        "      f  f",
        "     ff  ff",
    ],
    [
        "",
        "         ooo",
        "        occco",
        "  oo   occecoff",
        " oaaooaaaacco",
        " oaaaaddddbbo",
        "  oaaddddbbbo",
        "   oaddddbbo",
        "    ooooooo",
        "      f f",
        "     ff ff",
    ],
)
HERON = (
    [
        "       ooo",
        "      occeo",
        "      occcoffff",
        "       oco",
        "       oco",
        "      oaco",
        "    ooaaaoo",
        "  ooaaddddao",
        " oaaaddddddo",
        "  ooaaaaaaao",
        "    ooooooo",
        "      f  f",
        "      f  f",
        "      f  f",
        "      f  f",
        "     ff  ff",
    ],
    [
        "       ooo",
        "      occeo",
        "      occcoffff",
        "       oco",
        "       oco",
        "      oaco",
        "    ooaaaoo",
        "  ooaaddddao",
        " oaaaddddddo",
        "  ooaaaaaaao",
        "    ooooooo",
        "      f  f",
        "      f   f",
        "      f    ff",
        "      f",
        "     ff",
    ],
)
CRAWLER = (  # a pill bug, a cricket: a low body, legs that step
    [
        "             g",
        "    oooooo  g",
        "  ooabababoog",
        " oabababababco",
        "oabababababacceo",
        " ooooooooooooooo",
        "  f  f  f  f  f",
    ],
    [
        "            g",
        "    oooooo   g",
        "  ooabababoog",
        " oabababababco",
        "oabababababacceo",
        " ooooooooooooooo",
        " f  f  f  f  f",
    ],
)
CRICKET = (
    [
        "               g",
        "              g",
        "     ooooooo g",
        "   ooaaaaaaaoo",
        "  oddddddddacco",
        " oddddddddaacceo",
        "  oooffoooooooo",
        "   ff  f f  f",
        "  ff",
    ],
    [
        "",
        "               g",
        "     ooooooo  g",
        "   ooaaaaaaaoog",
        "  oddddddddacco",
        " oddddddddaacceo",
        "  oooffoooooooo",
        "    f f f  f",
        "    ff",
    ],
)
LADYBIRD = (
    [
        "      g   g",
        "       g g",
        "    oooocoo",
        "  ooaaaaccco",
        " oaagaaaacceo",
        " oaaaagaacco",
        "oagaaaaagao",
        " oaaagaaaao",
        "  ooaaaaoo",
        "    oooo",
    ],
    [
        "  dd  g   g",
        " dddd  g g",
        " ddddoooocoo",
        "  ddaaaaccco",
        " oaagaaaacceo",
        " oaaaagaacco",
        "oagaaaaagao",
        " oaaagaaaao",
        "  ooaaaaoo",
        "    oooo",
    ],
)
MOTH = (
    [
        " oooo",
        "oddddoo",
        "odgdddddo   g",
        " oddddddo  g",
        "  oddddddoocoo",
        "   ooaaaaaaceo",
        "  oddddooocoo",
        " odgddo",
        "  oooo",
    ],
    [
        "",
        "",
        "            g",
        "  ooooooo  g",
        " oddgddddoocoo",
        "oaaaaaaaaaaceo",
        " odddgdddoocoo",
        "  ooooooo",
        "",
    ],
)
DRAGONFLY = (
    [
        "     oo  oo",
        "    odd oddo",
        "    oddooddo",
        "     oddoddo",
        "oooooooaaaaoco",
        "aaaaaaaaaaaacceo",
        "oooooooaaaaoco",
        "      ooo",
    ],
    [
        "",
        "",
        "",
        "  oooo   oooo",
        "ooddddoooddddoco",
        "aaaaaaaaaaaaacceo",
        "ooddddoooddddoco",
        "  oooo   oooo",
    ],
)
STRIDER = (
    [
        "f              f",
        " f    oooo    f",
        "  f  oaaaaoo f",
        "   ffaaaaaacceo",
        "  f  oooooooo f",
        " f     f  f    f",
        "f     f    f",
        "gggggggggggggggg",
    ],
    [
        " f            f",
        "  f   oooo   f",
        "   f oaaaaoof",
        "    faaaaaacceo",
        "   f oooooooof",
        "  f    f  f   f",
        " f    f    f",
        "gggggggggggggggg",
    ],
)
SNAIL = (
    [
        "     oooo",
        "   ooaaaaoo",
        "  oaabbbbaao",
        " oaabaaaabao   g g",
        " oabaabbabao   g g",
        " oabaaabaao   occ",
        " oaabbbbaao  occeo",
        "ooooooooooooocco",
        "occccccccccccco",
        " oooooooooooooo",
    ],
    [
        "      oooo",
        "    ooaaaaoo",
        "   oaabbbbaao",
        "  oaabaaaabao   gg",
        "  oabaabbabao   gg",
        "  oabaaabaao  occ",
        "  oaabbbbaao occeo",
        "oooooooooooooocco",
        "occcccccccccccco",
        " ooooooooooooooo",
    ],
)
MOUSE = (
    [
        "           oo",
        "          ogdo",
        "    oooooooddoo",
        "  ooaaaaaaaaacco",
        " oaaaaaaaaaaaceof",
        "faaaaaabbbbaacco",
        "f ooaaaaaaaaaoo",
        " f  ooffooffo",
    ],
    [
        "           oo",
        "          ogdo",
        "    oooooooddoo",
        "  ooaaaaaaaaacco",
        " oaaaaaaaaaaaceof",
        " faaaaabbbbaacco",
        "f ooaaaaaaaaaoo",
        "f   oof  ooffo",
    ],
)
RACCOON = (
    [
        "             o o",
        "            ogogo",
        "  oo  ooooooocccco",
        " oago oaaaaaaccceo",
        "oaggaoaaaaaaacgggf",
        "oaago aaaaaaaaccco",
        " oggo oaaaaaaaaoo",
        "  oo   ooffooffo",
        "        ff  ff",
    ],
    [
        "             o o",
        "            ogogo",
        "   oo ooooooocccco",
        "  oagooaaaaaaccceo",
        " oaggaaaaaaaacgggf",
        " oaagoaaaaaaaaccco",
        "  oggo oaaaaaaaaoo",
        "   oo   offooffoo",
        "        ff   ff",
    ],
)
CRAB = (
    [
        " oo          oo",
        "oddo  e  e  oddo",
        "odo   o  o   odo",
        " oo ooooooooo oo",
        "  ooaaaaaaaaaoo",
        " oaaaaaaaaaaaaao",
        "  ooooooooooooo",
        "  f f f   f f f",
        " f f f     f f f",
    ],
    [
        "  oo        oo",
        " oddo e  e oddo",
        " odo  o  o  odo",
        "  oooooooooooo",
        "  ooaaaaaaaaaoo",
        " oaaaaaaaaaaaaao",
        "  ooooooooooooo",
        "   f f f f f f",
        "  f f f   f f f",
    ],
)
SEASTAR = (
    [
        "       oo",
        "      oaao",
        "      oaao",
        "  oooooabaoooooo",
        " oaaaaabbbaaaaao",
        "  ooaaabgbaaaoo",
        "    oaabbbaao",
        "   oaaaoooaaao",
        "  oaaoo   ooaao",
        "  ooo       ooo",
    ],
    [
        "",
        "       oo",
        "      oaao",
        "  oooooabaoooooo",
        " oaaaaabbbaaaaao",
        "  ooaaabgbaaaoo",
        "    oaabbbaao",
        "   oaaaoooaaao",
        "  oaaoo   ooaao",
        "  ooo       ooo",
    ],
)
SHOOTINGSTAR = (
    [
        "",
        "             o",
        "            oao",
        "gg       oooabaooo",
        " dggg    oabbbbbao",
        "   ddggg  oabbbao",
        "      ddgoabaaabao",
        "         ooo   ooo",
    ],
    [
        "",
        "             o",
        "            oao",
        " g       oooabaooo",
        "  gggg   oabbbbbao",
        "  ddddggg oabbbao",
        "      ddgoabaaabao",
        "         ooo   ooo",
    ],
)

T = {
    "bird_fly": BIRD_FLY,
    "bird_stand": BIRD_STAND,
    "heron": HERON,
    "crawler": CRAWLER,
    "cricket": CRICKET,
    "ladybird": LADYBIRD,
    "moth": MOTH,
    "dragonfly": DRAGONFLY,
    "strider": STRIDER,
    "snail": SNAIL,
    "mouse": MOUSE,
    "raccoon": RACCOON,
    "crab": CRAB,
    "seastar": SEASTAR,
    "shootingstar": SHOOTINGSTAR,
}


def rgb(h: str) -> tuple[int, int, int, int]:
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


# world -> id -> (template, walker, roles). Colours: the world's own tones.
VISITORS = {
    "woodland": {
        "chickadee": (
            "bird_fly",
            False,
            dict(
                a="8c8f8a", b="e8d6b0", c="2a2622", d="6d706c", e="f4f1e6", f="3a3430"
            ),
        ),
        "stellersjay": (
            "bird_fly",
            False,
            dict(
                a="2f5fa8", b="4b7ec4", c="1e1c24", d="23467e", e="e8e8f0", f="1e1c24"
            ),
        ),
        "snail": (
            "snail",
            True,
            dict(a="b07a44", b="7a4e2a", c="c9b48a", e="2a2018", g="8a7a5a"),
        ),
    },
    "terrarium": {
        "pillbug": (
            "crawler",
            True,
            dict(
                a="6a6e78", b="878c96", c="565a62", e="1c1c20", f="3c3c44", g="565a62"
            ),
        ),
        "ladybird": (
            "ladybird",
            False,
            dict(a="d6362c", c="1e1c20", d="e8e2d0", e="f4f0e0", g="1e1c20"),
        ),
        "moth": (
            "moth",
            False,
            dict(a="9c8a6e", c="b8a888", d="c6b493", e="1e1810", g="7a6a52"),
        ),
    },
    "hearth": {
        "robin": (
            "bird_stand",
            True,
            dict(
                a="6e5a4a", b="d8682e", c="3e342c", d="58483a", e="f4ecdc", f="e0a03c"
            ),
        ),
        "mouse": (
            "mouse",
            True,
            dict(
                a="9a8c80",
                b="d8ccbe",
                c="a89a8e",
                d="e6a8a8",
                e="1c1410",
                f="d89a94",
                g="7a6c62",
            ),
        ),
        "cricket": (
            "cricket",
            True,
            dict(
                a="5a4028", c="6e5032", d="3e2c1c", e="e8d8a0", f="3e2c1c", g="5a4028"
            ),
        ),
    },
    "tidepool": {
        "gull": (
            "bird_fly",
            False,
            dict(
                a="eef0f2", b="ffffff", c="f4f6f8", d="9aa6b0", e="1c1c20", f="e8b830"
            ),
        ),
        "shorecrab": (
            "crab",
            True,
            dict(a="d0582c", d="e8763c", e="1c1410", f="a8401c"),
        ),
        "seastar": ("seastar", True, dict(a="e8823c", b="f4a868", g="c45a2a")),
    },
    "pond": {
        "dragonfly": (
            "dragonfly",
            False,
            dict(a="2a9ab0", c="2a7a90", d="cfeef4", e="1c2a30"),
        ),
        "strider": (
            "strider",
            True,
            dict(a="4a4034", c="5a5044", e="e8e0c8", f="3a3228", g="9ad0dc"),
        ),
        "heron": (
            "heron",
            True,
            dict(a="8c98a8", c="e8ecf0", d="6a7688", e="1c1c20", f="d8b040"),
        ),
    },
    "nightsky": {
        "shootingstar": (
            "shootingstar",
            False,
            dict(a="fff0a0", b="ffe060", d="8a8ac8", g="c8c8f4"),
        ),
        "nighthawk": (
            "bird_fly",
            False,
            dict(
                a="6a5a50", b="a89480", c="584a42", d="f0ece4", e="f4e8c0", f="3a302a"
            ),
        ),
        "raccoon": (
            "raccoon",
            True,
            dict(
                a="8a8a90", b="bcbcc4", c="a8a8b0", e="f4f4f8", f="4a4a50", g="2a2a30"
            ),
        ),
    },
}


def frames(template: str, roles: dict[str, str], walker: bool) -> list[Image.Image]:
    """Both frames in one box (as authored, top-aligned): walkers stand on the
    canvas's bottom row, flyers are centred. One anchor, so _1 and _2 line up."""
    pair = T[template]
    h = max(len(f) for f in pair)
    w = max(len(r) for f in pair for r in f)
    assert w <= GRID and h <= GRID, (template, w, h)
    x0 = (GRID - w) // 2
    y0 = GRID - h if walker else (GRID - h) // 2
    out = []
    for f in pair:
        img = Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))
        for y, row in enumerate(f):
            for x, ch in enumerate(row):
                if ch != " ":
                    img.putpixel(
                        (x0 + x, y0 + y), OUTLINE if ch == "o" else rgb(roles[ch])
                    )
        out.append(img.resize((GRID * PX, GRID * PX), Image.NEAREST))
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for world, vs in VISITORS.items():
        for vid, (template, walker, roles) in vs.items():
            for i, img in enumerate(frames(template, roles, walker), 1):
                img.save(OUT / f"visitor_{world}_{vid}_{i}.png", optimize=True)
                n += 1
    print(f"{n} frames -> {OUT}")


if __name__ == "__main__":
    main()
