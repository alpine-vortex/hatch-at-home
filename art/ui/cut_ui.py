#!/usr/bin/env python3
"""Cut the UI icon kit. usage: cut_ui.py SHEETDIR OUTDIR
Icons/stats: 24-art-px grid -> 96x96. Emblems/deco: 32 grid -> 128x128. Plus contact sheet on cream buttons.

Icon library (docs/art-icon-library.md): cut_ui.py --lib SET SHEETDIR [REPO]
  SET is a..e; SHEETDIR holds the set's 3 x 3 sheets (<sheet>.png, flat magenta background); REPO is the
  checkout (default: this file's). Each icon lands as 96 x 96 (24 art px at 4x) where LIB says, and the
  set's contact sheet (24 and 48 px on cream and on the game face, set A blocked and armed too) as
  art/ui/library/<set dir>/contact.png. The cut snaps to the sheet's own art-pixel grid (no resample) when an
  icon fits 23 art px, and says which icons it had to shrink. A hand-placed or redone icon is listed in
  HAND and kept: the cut never overwrites it."""

import importlib.util
import pathlib
import sys

from PIL import Image, ImageDraw

SHIP = "custom_components/virtual_pet/frontend/ui"
LIBDIR = "art/ui/library"
# set -> {sheet: [name per cell, reading order]}, and the dir each set's icons land in. Set A ships
# (frontend/ui, slice 4 of the shell modes); its alternates wait in the library for the owner's pick.
LIB = {
    "a": {
        "a1": [
            "icon_mode_left",
            "icon_mode_right",
            "icon_mode_up",
            "icon_mode_down",
            "icon_mode_keep",
            "icon_mode_dig",
            "icon_mode_special_v1",  # the first special; the owner signed special_v2 in its place (2026-11-05)
            "icon_mode_undo",
            "icon_mode_restart",
        ],
        "a2": [
            "icon_mode_quit",
            "icon_mode_lo",
            "icon_mode_hi",
            "icon_mode_special_star",
            "icon_mode_keep_full",
            "icon_mode_dig_paw",
            "icon_mode_undo_curl",
            "icon_mode_restart_circle",
            "icon_mode_quit_door",
        ],
        "a3": [
            "icon_mode_special",  # drawn as special_v2; the shipped special (owner, 2026-11-05)
            "icon_mode_special_coin",
            "icon_mode_undo_v2",
            "icon_mode_restart_v2",
            "icon_mode_dig_spade",
            "icon_mode_keep_v2",
            "icon_mode_special_twin",
            "icon_mode_special_wand",
            "icon_mode_quit_button",
        ],
    },
    "b": {
        "b1": [
            f"icon_{n}_v2"
            for n in [
                "feed",
                "snack",
                "play",
                "clean",
                "medicine",
                "scold",
                "praise",
                "lights_out",
                "lights_on",
            ]
        ],
        "b2": ["icon_status_v2", "icon_journal_v2"]
        + [
            f"stat_{n}_v2"
            for n in [
                "heart_full",
                "heart_half",
                "heart_empty",
                "energy",
                "health",
                "discipline",
                "care_miss",
            ]
        ],
    },
    "c": {
        "c1": [
            "icon_game_left_right_emblem",
            "icon_game_left_right_left",
            "icon_game_left_right_right",
            "icon_game_higher_lower_emblem",
            "icon_game_higher_lower_lo",
            "icon_game_higher_lower_hi",
            "icon_game_dig_emblem",
            "icon_game_dig_basket_empty",
            "icon_game_dig_basket_full",
        ],
        "c2": [
            "icon_game_dig_leaf",
            "icon_game_dig_trowel",
            "icon_game_hop_emblem",
            "icon_game_hop_nest",
            "icon_game_hop_hint",
            "icon_game_hop_solved",
            "icon_game_shared_win",
            "icon_game_shared_lose",
            "icon_game_shared_tie",
        ],
        "c3": [
            "icon_game_shared_streak",
            "icon_game_shared_best",
            "icon_game_shared_again",
            "icon_game_shared_trophy",
            "icon_game_hop_pad",
            "icon_game_hop_pad_sunk",
            "icon_game_hop_stone",
            "icon_game_dig_berry",
            "icon_game_dig_berry_shiny",
        ],
    },
    "d": {
        "d1": [
            f"icon_util_{n}"
            for n in [
                "close",
                "back",
                "check",
                "plus",
                "minus",
                "refresh",
                "help",
                "info",
                "share",
            ]
        ],
        "d2": [
            f"icon_util_{n}"
            for n in [
                "gear",
                "sound_on",
                "sound_off",
                "bell",
                "timer",
                "edit",
                "trash",
                "camera",
                "sleep",
            ]
        ],
        "d3": ["icon_util_wake"]
        + [
            f"glyph_{n}"
            for n in [
                "heart",
                "note",
                "star",
                "sparkle",
                "sun",
                "rain",
                "snow",
                "cloud",
            ]
        ],
        "d4": [
            f"glyph_{n}"
            for n in [
                "storm",
                "moon",
                "umbrella",
                "rainbow",
                "wind",
                "drop",
                "flower",
                "paw",
                "gift",
            ]
        ],
    },
    "e": {
        f"e{i}": [
            f"icon_{w}_{n}"
            for n in [
                "feed",
                "snack",
                "play",
                "clean",
                "medicine",
                "scold",
                "praise",
                "lights_out",
                "lights_on",
            ]
        ]
        for i, w in enumerate(
            [
                "woodland",
                "tidepool",
                "terrarium",
                "pond",
                "hearth",
                "nightsky",
                "ocean",
            ],
            1,
        )
    },
}
SETDIR = {"a": "a-modes", "b": "b-v2", "c": "c-games", "d": "d-util", "e": "e-worlds"}
A_SHIPS = {
    "icon_mode_left",
    "icon_mode_right",
    "icon_mode_up",
    "icon_mode_down",
    "icon_mode_keep",
    "icon_mode_dig",
    "icon_mode_special",
    "icon_mode_undo",
    "icon_mode_restart",
    "icon_mode_quit",
}  # the plan's ten (docs/plan-2026-11-04-shell-modes.md, 4A): lo and hi reuse down and up, so A2's lo/hi wait in the library
# Hand recolours after the cut, on the icon's own art-pixel rows (before centring): name -> [((row0, row1), from, to)].
FIX = {
    "glyph_rain": [
        ((14, 24), (188, 186, 182), (110, 170, 222)),
        ((14, 24), (107, 114, 127), (52, 98, 160)),
    ]
}  # Sol drew the drops grey
HAND = set()  # icons redone by hand or in code mode after the cut (the report names them); never re-cut over


def lib_dest(repo, s, name):
    if s == "a" and name in A_SHIPS:
        return repo / SHIP / f"{name}.png"
    return repo / LIBDIR / SETDIR[s] / f"{name}.png"


def save4(im, dest):
    """A 4-bit palette PNG, index 0 transparent: the format of every live frontend/ui icon (4A: 16 colours at most)."""
    import numpy as np

    a = np.asarray(im.convert("RGBA"))
    op = a[..., 3] > 0
    cols = np.unique(a[op][:, :3], axis=0)
    if len(cols) > 15:
        raise SystemExit(f"{dest.name}: {len(cols)} colours, more than 15")
    idx = np.zeros(a.shape[:2], np.uint8)
    for k, c in enumerate(cols, 1):
        idx[op & (a[..., :3] == c).all(-1)] = k
    out = Image.fromarray(idx, "P")
    out.putpalette(
        [0, 0, 0] + [int(v) for c in cols for v in c] + [0, 0, 0] * (15 - len(cols))
    )
    out.save(dest, transparency=0, bits=4, optimize=True)


def lib_cut(s, src, repo):
    import numpy as np
    from PIL import Image
    from scipy import ndimage

    shrunk, made = [], []
    for sheet, names in LIB[s].items():
        p = src / f"{sheet}.png"
        if not p.exists():
            print("missing", p)
            continue
        a = np.asarray(Image.open(p).convert("RGB")).astype(np.int32)
        h, w, _ = a.shape
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        fg = ~(
            (np.minimum(r, b) - g > 60) & (r > 90) & (b > 90)
        )  # magenta and its fringe are background
        fg = ndimage.binary_opening(fg, iterations=2)
        # the sheet's art-pixel pitch: edge spacing (the strongest period between 6 and 30 px)
        edge = (np.abs(np.diff(a, axis=1)).sum(-1) > 60) & fg[:, 1:]
        sx = edge.sum(0).astype(float)
        idx = np.arange(len(sx))
        sy = (np.abs(np.diff(a, axis=0)).sum(-1) > 60) & fg[1:, :]
        sy = sy.sum(1).astype(float)
        idy = np.arange(len(sy))
        ps = np.arange(6.0, 30.0, 0.05)
        sc = np.array(
            [
                abs((sx * np.exp(2j * np.pi * idx / q)).sum()) / sx.sum()
                + abs((sy * np.exp(2j * np.pi * idy / q)).sum()) / sy.sum()
                for q in ps
            ]
        )
        pitch = ps[
            np.nonzero(sc >= 0.8 * sc.max())[0].max()
        ]  # the largest strong period: its harmonics (p/2, p/3) score high too
        lab, n = ndimage.label(fg)
        cells = {}
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            m = lab[sl] == i
            if m.sum() < 120:
                continue
            cy, cx = ndimage.center_of_mass(lab == i)
            cells.setdefault(
                (min(int(cy * 3 / h), 2), min(int(cx * 3 / w), 2)), []
            ).append(i)
        for k, name in enumerate(names):
            ids = cells.get((k // 3, k % 3))
            dest = lib_dest(repo, s, name)
            if not ids:
                print("empty cell", sheet, k + 1, name)
                continue
            if name in HAND and dest.exists():
                continue
            m = np.isin(lab, ids)
            ys, xs = np.nonzero(m)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            nw, nh = max(1, round((x1 - x0) / pitch)), max(1, round((y1 - y0) / pitch))
            if (
                max(nw, nh) > 23
            ):  # drawn bigger than the grid: shrink to 22 (the old cut's fit), and say so
                f = 22 / max(nw, nh)
                nw, nh = max(1, round(nw * f)), max(1, round(nh * f))
                shrunk.append(name)
            gx = np.linspace(x0, x1, nw + 1)
            gy = np.linspace(y0, y1, nh + 1)
            out = np.zeros((nh, nw, 4), np.uint8)
            for j in range(nh):
                for i in range(nw):
                    ya, yb, xa, xb = (
                        int(gy[j]),
                        int(gy[j + 1]),
                        int(gx[i]),
                        int(gx[i + 1]),
                    )
                    bm = m[ya:yb, xa:xb]
                    if bm.mean() < 0.5:
                        continue
                    # the block's centre half decides its colour (Sol's blocks bleed at their edges)
                    qy, qx = max(1, (yb - ya) // 4), max(1, (xb - xa) // 4)
                    core = a[ya + qy : yb - qy, xa + qx : xb - qx].reshape(-1, 3)
                    cm = m[ya + qy : yb - qy, xa + qx : xb - qx].reshape(-1)
                    px = core[cm] if cm.any() else a[ya:yb, xa:xb][bm]
                    out[j, i, :3] = np.median(px, axis=0)
                    out[j, i, 3] = 255
            ic = Image.fromarray(out, "RGBA")
            rgb = (
                ic.convert("RGB")
                .quantize(
                    colors=10, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
                )
                .convert("RGB")
            )
            ic = Image.merge("RGBA", (*rgb.split(), ic.split()[3]))
            px = np.asarray(ic).copy()
            op = px[..., 3] > 0
            cols, cnt = np.unique(px[op][:, :3], axis=0, return_counts=True)
            keep = []  # merge near-duplicate colours (median cut leaves pairs a few levels apart) into the commoner one
            for ci in np.argsort(-cnt):
                k = next(
                    (
                        k
                        for k in keep
                        if np.abs(cols[k].astype(int) - cols[ci]).sum() < 12
                    ),
                    None,
                )
                if k is None:
                    keep.append(ci)
                else:
                    px[op & (px[..., :3] == cols[ci]).all(-1), :3] = cols[k]
            for (ya, yb), frm, to in FIX.get(
                name, []
            ):  # hand recolours (named in the report)
                reg = px[ya:yb]
                hit = (reg[..., 3] > 0) & (
                    np.abs(reg[..., :3].astype(int) - frm).sum(-1) < 40
                )
                reg[hit, :3] = to
            ic = Image.fromarray(px, "RGBA")
            c = Image.new("RGBA", (24, 24))
            c.alpha_composite(ic, ((24 - nw) // 2, (24 - nh) // 2))
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists() and dest.parent == repo / SHIP and name not in A_SHIPS:
                raise SystemExit(f"refusing to overwrite live {dest}")
            save4(c.resize((96, 96), Image.NEAREST), dest)
            made.append(name)
        print(f"{sheet}: pitch {pitch:.2f} px")
    print(len(made), "icons;", "shrunk to fit:", ", ".join(shrunk) or "none")
    lib_contact(s, repo)


def lib_contact(s, repo, out=None):
    """The set on caps: 24 and 48 px on cream (care caps) and the game face #c4e2f2 (mode caps); set A also
    blocked (the cap at 0.6 over the shell) and armed (held down: no lip, two px lower)."""
    from PIL import Image, ImageDraw

    names = [n for sh in LIB[s].values() for n in sh if lib_dest(repo, s, n).exists()]
    CREAM, FACE, SHELL = (255, 247, 236), (0xC4, 0xE2, 0xF2), (150, 138, 124)
    rows = [
        ("cream 24", CREAM, 24, ""),
        ("face 24", FACE, 24, ""),
        ("cream 48", CREAM, 48, ""),
        ("face 48", FACE, 48, ""),
    ]
    if s == "a":
        rows += [
            ("blocked 24", FACE, 24, "blocked"),
            ("armed 24", FACE, 24, "armed"),
            ("blocked 48", FACE, 48, "blocked"),
            ("armed 48", FACE, 48, "armed"),
        ]
    rows += [("96", CREAM, 96, "")]
    colw, lab = 108, 92
    heights = [max(44, sz + 22) for _, _, sz, _ in rows]
    W, H = lab + colw * len(names), 30 + sum(heights)
    c = Image.new("RGBA", (W, H), SHELL + (255,))
    d = ImageDraw.Draw(c)
    for i, n in enumerate(names):
        short = (
            n.replace("icon_mode_", "")
            .replace("icon_game_", "")
            .replace("icon_util_", "")
            .replace("icon_", "")
        )
        d.text((lab + i * colw + 4, 4), short[:17], fill=(255, 255, 255))
        d.text((lab + i * colw + 4, 15), short[17:34], fill=(255, 255, 255))
    y = 30
    for (title, face, sz, look), rh in zip(rows, heights, strict=True):
        d.text((4, y + rh // 2 - 5), title, fill=(255, 255, 255))
        for i, n in enumerate(names):
            ic = (
                Image.open(lib_dest(repo, s, n))
                .convert("RGBA")
                .resize((sz, sz), Image.NEAREST if 96 % sz == 0 else Image.BOX)
            )
            cw, ch = sz + 10, sz + 8
            drop = 2 if look == "armed" else 0
            cap = Image.new("RGBA", (cw, ch + 3))
            cd = ImageDraw.Draw(cap)
            cd.rounded_rectangle(
                [0, 3, cw - 1, ch + 2],
                5,
                fill=tuple(int(v * 0.72) for v in face) + (255,),
            )  # the lip
            cd.rounded_rectangle(
                [0, drop, cw - 1, ch - 1 + drop], 5, fill=face + (255,)
            )  # armed: held down onto it
            cap.alpha_composite(ic, (5, 4 + drop))
            if look == "blocked":
                cap.putalpha(cap.split()[3].point(lambda v: int(v * 0.6)))
            c.alpha_composite(
                cap, (lab + i * colw + (colw - cw) // 2, y + (rh - ch) // 2)
            )
        y += rh
    dest = out or (repo / LIBDIR / SETDIR[s] / "contact.png")
    dest.parent.mkdir(parents=True, exist_ok=True)
    c.save(dest)
    print("contact:", dest)


if len(sys.argv) > 1 and sys.argv[1] == "--lib":
    s, src = sys.argv[2], pathlib.Path(sys.argv[3])
    repo = (
        pathlib.Path(sys.argv[4])
        if len(sys.argv) > 4
        else pathlib.Path(__file__).resolve().parents[2]
    )
    lib_cut(s, src, repo)
    sys.exit(0)


spec = importlib.util.spec_from_file_location(
    "cut", pathlib.Path(__file__).with_name("cut.py")
)
src, out = map(pathlib.Path, sys.argv[1:3])
out.mkdir(parents=True, exist_ok=True)
sys.argv = [sys.argv[0], str(src), str(out / "_unused")]
cut = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cut)
(out / "_unused").rmdir() if (out / "_unused").exists() and not any(
    (out / "_unused").iterdir()
) else None
ICONS = {
    "icons_1": [
        "icon_feed",
        "icon_snack",
        "icon_play",
        "icon_clean",
        "icon_medicine",
        "icon_scold",
        "icon_praise",
        "icon_lights_out",
        "icon_lights_on",
    ],
    "icons_2": [
        "icon_status",
        "icon_journal",
        "stat_heart_full",
        "stat_heart_half",
        "stat_heart_empty",
        "stat_energy",
        "stat_health",
        "stat_discipline",
        "stat_care_miss",
    ],
}
BIG = {
    "emblems": ["emblem_woodland", "emblem_terrarium", "emblem_ocean", None],
    "deco": ["deco_moss", "deco_mushroom", "deco_pebbles", "deco_succulent"],
}


def emit(im, grid, art, name):
    sc = art / max(im.width, im.height)
    sm = cut.pixelize(im, sc, cut.make_palette([im], 12))
    c = Image.new("RGBA", (grid, grid))
    c.alpha_composite(sm, ((grid - sm.width) // 2, (grid - sm.height) // 2))
    c.resize((grid * 4, grid * 4), Image.NEAREST).save(out / f"{name}.png")


for sheet, names in ICONS.items():
    p = src / f"{sheet}.png"
    if not p.exists():
        continue
    cs = cut.cells(p, 3, 3)
    for i, n in enumerate(names):
        if (i // 3, i % 3) in cs:
            emit(cs[(i // 3, i % 3)], 24, 22, n)
for sheet, names in BIG.items():
    p = src / f"{sheet}.png"
    if not p.exists():
        continue
    cs = cut.cells(p, 2, 2)
    for i, n in enumerate(names):
        if n and (i // 2, i % 2) in cs:
            emit(cs[(i // 2, i % 2)], 32, 30, n)
# contact: icons on cream buttons (26 px on screen -> shown at 1x and 2x), light + dark
fs = sorted(out.glob("icon_*.png")) + sorted(out.glob("stat_*.png"))
CREAM, SHADOW = (0xFF, 0xF7, 0xEC, 255), (0xD9, 0xC8, 0xAE, 255)
c = Image.new("RGBA", (len(fs) * 80 + 20, 4 * 80), (255, 255, 255, 255))
d = ImageDraw.Draw(c)
for row, (bg, size) in enumerate(
    [
        ((238, 238, 232, 255), 26),
        ((30, 30, 40, 255), 26),
        ((238, 238, 232, 255), 52),
        ((30, 30, 40, 255), 52),
    ]
):
    d.rectangle([0, row * 80, c.width, row * 80 + 79], fill=bg)
    for i, p in enumerate(fs):
        cx, cy, r = 20 + i * 80 + 30, row * 80 + 40, size * 0.85
        d.ellipse([cx - r, cy - r + 3, cx + r, cy + r + 3], fill=SHADOW)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=CREAM)
        ic = Image.open(p).resize(
            (size, size), Image.NEAREST if size % 24 == 0 else Image.BOX
        )
        c.alpha_composite(ic, (int(cx - size / 2), int(cy - size / 2)))
c.save(out / "contact_buttons.png")
big = sorted(out.glob("emblem_*.png")) + sorted(out.glob("deco_*.png"))
c2 = Image.new("RGBA", (max(1, len(big)) * 136, 272), (238, 238, 232, 255))
ImageDraw.Draw(c2).rectangle([0, 136, c2.width, 272], fill=(30, 30, 40, 255))
for i, p in enumerate(big):
    im = Image.open(p)
    c2.alpha_composite(im, (i * 136 + 4, 4))
    c2.alpha_composite(im, (i * 136 + 4, 140))
c2.save(out / "contact_emblems_deco.png")
print(len(fs), "icons,", len(big), "emblems/deco")
