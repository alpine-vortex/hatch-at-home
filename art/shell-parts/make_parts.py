#!/usr/bin/env python3
"""make_parts.py -> custom_components/virtual_pet/frontend/ui/: the shell hardware parts of REQUEST.md, one PNG pixel
per art pixel. The logo, power lights, plate and bulb stay as hand-reduced from the owner's
sheets (cut_marks.py); this draws the rest. Greyscale parts are drawn in the card's HW_GREY values: '#' outline 34, 'c' 72, 'd' 104, 'm' 128 (comes
out as the slot colour under hard-light), 'l' 176, 'w' 236, 'W' 255; '.' is transparent and a lower-case letter after
'/' in GLARE marks half-transparent white. Light comes from the top left."""
import pathlib
import numpy as np
from PIL import Image

UI = pathlib.Path(__file__).resolve().parents[2]/"custom_components/virtual_pet/frontend/ui"
GREY = {"#": 34, "c": 72, "d": 104, "m": 128, "l": 176, "w": 236, "W": 255}

PARTS = {
    # A round screw head, lit top left, its slot at a slight angle.
    "shell_screw": [".###.", "#wlc#", "#lcm#", "#cmd#", ".###."],
    # One grille slot: a dark recess with rounded ends and a lit lower lip, then a 1-cell gap.
    "shell_slot": ["c.", "#.", "#.", "#.", "l."],
    # Two printed lines with a gap.
    "shell_stripes": ["c", ".", "c"],
    # Battery door: an engraved rounded seam (dark line, lit lower and right lip) with a thumb notch at the bottom.
    "shell_battery": [
        "..cccccccccccccccccccc..",
        ".c....................cl",
        "c......................l",
        "c......................l",
        "c......................l",
        "c......................l",
        "c......................l",
        "c......................l",
        "c......................l",
        "c.........cccc.........l",
        ".c.......cddddc.......cl",
        "..ccccccclllllllccccccl.",
    ],
}
# A glitter fleck, three frames side by side (small, bright, fading); the card uses the alpha for now.
FLECK = [[".....", ".....", "..w..", ".....", "....."],
         ["..l..", "..w..", "lwWwl", "..w..", "..l.."],
         [".....", "..l..", ".lwl.", "..l..", "....."]]
# Clear-finish glare: a long streak and a short thin one, white with soft ends (alpha in the second map).
GLARE = ["......WW", ".....WW.", "....WW..", "...WW...", "..WW...W", ".WW...W.", "WW...W..", "W...W..."]
GLARE_A = ["......9F", ".....FF.", "....FF..", "...FF...", "..FF...6", ".FF...9.", "FF...9..", "9...6..."]

# World emblems, 9 x 9 full colour, hand-reduced from ui/emblem_<world>.png: the badge ring 'O', the world's ground 'B'
# and one simple icon. Colours are taken from each 32 px emblem.
EMBLEMS = {
    "hearth": ({"O": "49200f", "B": "d97062", "R": "5d3521", "W": "fde3bf", "D": "c15942"},
        ["..OOOOO..", ".OBBRBBO.", "OBBRRRBBO", "OBRRRRRBO", "OBBWWWBBO", "OBBWDWBBO", "OBBWDWBBO", ".OBBBBBO.", "..OOOOO.."]),
    "nightsky": ({"O": "431305", "B": "112d6d", "M": "faeac0", "S": "fdedc1"},
        ["..OOOOO..", ".OBBBBSO.", "OBBMMBBBO", "OBMMBBBBO", "OBMMBBSBO", "OBMMBBBBO", "OBBMMBBBO", ".OBBBBBO.", "..OOOOO.."]),
    "ocean": ({"O": "4a1b08", "B": "e4e1c9", "W": "3080ae", "D": "0d598a", "F": "fdeac4"},
        ["..OOOOO..", ".OBBBBBO.", "OBBWWWBBO", "OBWWDDWBO", "OWWDBFDWO", "OWDBBBWWO", "ODDDDDDDO", ".ODDDDDO.", "..OOOOO.."]),
    "pond": ({"O": "461401", "B": "43653e", "L": "90b64d", "F": "fae2e8", "P": "e8a0b0"},
        ["..OOOOO..", ".OBBBBBO.", "OBBBBFBBO", "OBBBFPFBO", "OBLLLFLBO", "OLLLBLLLO", "OBLLLLLBO", ".OBBBBBO.", "..OOOOO.."]),
    "terrarium": ({"O": "401705", "B": "f5ce93", "C": "5d4c1e", "S": "cf6526", "U": "b98840"},
        ["..OOOOO..", ".OBBBSSO.", "OBBCBBSBO", "OCBCBCBBO", "OCCCCCBBO", "OBBCBBUUO", "OUUCUUUUO", ".OUUUUUO.", "..OOOOO.."]),
    "tidepool": ({"O": "451402", "B": "4c8163", "K": "21410d", "S": "aeb750", "T": "62260f"},
        ["..OOOOO..", ".OBBKBBO.", "OBBKKBKBO", "OBKKBKKBO", "OBBKKKBBO", "OBBKBBSBO", "OBBKBSSSO", ".OBKBBSO.", "..OOOOO.."]),
    "woodland": ({"O": "451502", "B": "627e42", "L": "9eab52", "V": "2d2607", "P": "744421"},
        ["..OOOOO..", ".OBBBLLO.", "OBBBLLLBO", "OBBLLVLBO", "OBLLVLBBO", "OBLVLPPBO", "OBVBPPPBO", ".OBBPPBO.", "..OOOOO.."]),
}

def colour(pal, rows):
    a = np.zeros((9, 9, 4), np.uint8)
    for y, row in enumerate(rows):
        assert len(row) == 9 and len(rows) == 9
        for x, ch in enumerate(row):
            if ch != ".": h = pal[ch]; a[y, x] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
    return a

def grey(rows):
    a = np.zeros((len(rows), len(rows[0]), 4), np.uint8)
    for y, row in enumerate(rows):
        assert len(row) == len(rows[0]), (rows, y)
        for x, ch in enumerate(row):
            if ch != ".": a[y, x] = (GREY[ch],) * 3 + (255,)
    return a

def main():
    for name, rows in PARTS.items(): Image.fromarray(grey(rows)).save(UI/f"{name}.png")
    Image.fromarray(grey(FLECK[1])).save(UI/"shell_fleck.png")
    Image.fromarray(np.hstack([grey(f) for f in FLECK])).save(UI/"shell_fleck_strip.png")
    g = grey(GLARE)
    for y, row in enumerate(GLARE_A):
        for x, ch in enumerate(row):
            if ch != ".": g[y, x, 3] = int(ch, 16) * 17
    Image.fromarray(g).save(UI/"shell_glare.png")
    for world, (pal, rows) in EMBLEMS.items(): Image.fromarray(colour(pal, rows)).save(UI/f"emblem9_{world}.png")
    print("wrote", len(PARTS) + 3, "parts and", len(EMBLEMS), "emblems to", UI)

if __name__ == "__main__":
    main()
