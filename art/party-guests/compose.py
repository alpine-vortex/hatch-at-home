"""Party guests (birthday plan 7.3): the party hat on the guests' frames, written as *_party_<n>.png.

Each entry: the source frame, the hat's bottom-centre (the head top) in source px, and a tilt-free
seat. The canvas gains PAD px on top so a hat over a head near the edge isn't cut; the card lifts
the art by the same amount (style.js `.party`). Run from the repo root: python3 art/party-guests/compose.py
"""

from pathlib import Path
import sys

from PIL import Image

UI = Path("custom_components/virtual_pet/frontend/ui")
PAD = 24  # 6 world cells of 4 px
SCALE = 2  # the hat at half size: 2 px blocks
# frame stem: (x, y) of the hat's bottom centre in the source frame
SEATS = {
    "visitor_woodland_chickadee_1": (57, 28),
    "visitor_woodland_chickadee_2": (56, 18),
    "visitor_woodland_stellersjay_1": (55, 22),
    "visitor_woodland_stellersjay_2": (61, 20),
    "visitor_woodland_snail_1": (63, 52),
    "visitor_woodland_snail_2": (66, 52),
    "season_thanksgiving_turkey_1": (64, 27),
    "season_thanksgiving_turkey_2": (64, 27),
}


def hat(scale=SCALE):
    h = Image.open(UI / "season_party_hat.png").convert("RGBA")
    h = h.crop(h.getchannel("A").getbbox())
    return h.resize((h.width // scale, h.height // scale), Image.NEAREST)


def compose(stem, seat, out_dir=UI, scale=SCALE):
    src = Image.open(UI / f"{stem}.png").convert("RGBA")
    h = hat(scale)
    out = Image.new("RGBA", (src.width, src.height + PAD))
    out.alpha_composite(src, (0, PAD))
    x, y = seat
    out.alpha_composite(h, (x - h.width // 2, y + PAD - h.height))
    name = stem[:-2] + "_party" + stem[-2:]
    out.save(out_dir / f"{name}.png", optimize=True)
    return out_dir / f"{name}.png"


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else UI
    for stem, seat in SEATS.items():
        print(compose(stem, seat, out))
