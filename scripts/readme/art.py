"""Draw the README's box-art images into docs/readme/.

Inputs: the card's own sprites, UI icons and Tiny5 font, plus screenshots:
  dev/readme-shots/   from `node scripts/readme/shots.js shoot` (one per world)
  dev/card-check/     from `SCALE=2 scripts/card-check`
Needs Pillow and fontTools (with brotli) to read the woff2 font.
Run from the repo root: python3 scripts/readme/art.py
"""

import io
import math
from pathlib import Path
import random

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FRONT = ROOT / "custom_components/virtual_pet/frontend"
SPRITES = FRONT / "sprites"
UI = FRONT / "ui"
SHOTS = ROOT / "dev/readme-shots"
CHECK = ROOT / "dev/card-check"
OUT = ROOT / "docs/readme"

PINK = (255, 111, 170)
PINK_LT = (255, 150, 196)
PINK_DK = (214, 51, 122)
YELLOW = (255, 214, 64)
YELLOW_DK = (245, 166, 35)
CYAN = (62, 198, 224)
PURPLE = (59, 31, 74)
CREAM = (255, 246, 224)
WHITE = (255, 255, 255)
RED = (232, 52, 60)

WORLDS = [
    ("Woodland", "woodland", "0-Checkpip", ["bird", "squirrel", "deer"]),
    ("Hearth", "hearth", "1-Checkmew", ["kitten", "bunny"]),
    ("Terrarium", "terrarium", "2-Pebble", ["gecko", "tarantula"]),
    ("Tidepool", "tidepool", "3-Ripple", ["otter", "octopus"]),
    ("Pond", "pond", "4-Lily", ["treefrog", "axolotl"]),
    ("Night Sky", "nightsky", "5-Luna", ["bat", "lunamoth"]),
]
NAMES = {
    "bird": "Robin",
    "squirrel": "Squirrel",
    "deer": "Fawn",
    "kitten": "Kitten",
    "bunny": "Lop bunny",
    "gecko": "Gecko",
    "tarantula": "Tarantula",
    "otter": "Sea otter",
    "octopus": "Octopus",
    "treefrog": "Tree frog",
    "axolotl": "Axolotl",
    "bat": "Bat",
    "lunamoth": "Luna moth",
}


def font_file() -> io.BytesIO:
    tt = TTFont(FRONT / "fonts/Tiny5.woff2")
    tt.flavor = None
    buf = io.BytesIO()
    tt.save(buf)
    buf.seek(0)
    return buf


FONT_BYTES = font_file().getvalue()


def font(px: int) -> ImageFont.FreeTypeFont:
    """Tiny5 with one font pixel drawn as px screen pixels."""
    return ImageFont.truetype(io.BytesIO(FONT_BYTES), px * 8)


def text_size(text: str, px: int) -> tuple[int, int]:
    box = ImageDraw.Draw(Image.new("L", (1, 1))).textbbox((0, 0), text, font=font(px))
    return box[2] - box[0], box[3] - box[1]


def pixel_text(img, xy, text, px, fill, box=None, shadow=None, anchor="la", pad=2):
    """Pixel text, optionally on a label box (pad font pixels around) with a hard shadow."""
    d = ImageDraw.Draw(img)
    f = font(px)
    x, y = xy
    w, h = text_size(text, px)
    if anchor == "ma":
        x -= w // 2
    left, top = d.textbbox((0, 0), text, font=f)[:2]
    if box:
        p = pad * px
        rect = [x - p, y - p, x + w + p, y + h + p]
        if shadow:
            d.rectangle([c + px * pad // 2 + 4 for c in rect], fill=shadow)
        d.rectangle(rect, fill=box)
    d.text((x - left, y - top), text, font=f, fill=fill)


def pill(img, xy, text, px, fill=WHITE, box=PURPLE):
    """A centred caption on a rounded pill."""
    d = ImageDraw.Draw(img)
    w, h = text_size(text, px)
    x, y = xy[0] - w // 2, xy[1]
    d.rounded_rectangle(
        [x - 22, y - 14, x + w + 22, y + h + 14], (h + 28) // 2, fill=box
    )
    pixel_text(img, (x, y), text, px, fill)


def sprite(species: str, name: str, size: int) -> Image.Image:
    im = Image.open(SPRITES / species / f"{name}.png").convert("RGBA")
    return im.resize((size, size), Image.NEAREST)


def sunburst(w, h, cx, cy, a, b, rays=28):
    img = Image.new("RGBA", (w, h), a)
    d = ImageDraw.Draw(img)
    r = math.hypot(w, h)
    for i in range(rays):
        if i % 2:
            continue
        t0, t1 = 2 * math.pi * i / rays, 2 * math.pi * (i + 1) / rays
        d.polygon(
            [
                (cx, cy),
                (cx + r * math.cos(t0), cy + r * math.sin(t0)),
                (cx + r * math.cos(t1), cy + r * math.sin(t1)),
            ],
            fill=b,
        )
    return img


def sparkle(img, x, y, s, color=WHITE):
    """A four-point pixel star, s pixels per step."""
    d = ImageDraw.Draw(img)
    d.rectangle([x - s // 2, y - 3 * s, x + s // 2, y + 3 * s], fill=color)
    d.rectangle([x - 3 * s, y - s // 2, x + 3 * s, y + s // 2], fill=color)
    d.rectangle([x - s, y - s, x + s, y + s], fill=color)


def sparkles(img, n, seed, box, size=(3, 6), color=WHITE):
    rnd = random.Random(seed)
    for _ in range(n):
        sparkle(
            img,
            rnd.randint(box[0], box[2]),
            rnd.randint(box[1], box[3]),
            rnd.randint(*size),
            color,
        )


def burst(img, cx, cy, r, lines, fill=YELLOW, ink=RED, points=18, px=7):
    """A jagged starburst badge with centred lines of text."""
    d = ImageDraw.Draw(img)
    pts = []
    for i in range(points * 2):
        t = math.pi * i / points
        rr = r if i % 2 == 0 else r * 0.80
        pts.append((cx + rr * math.cos(t), cy + rr * math.sin(t)))
    d.polygon([(x + 8, y + 8) for x, y in pts], fill=PURPLE)
    d.polygon(pts, fill=fill, outline=PURPLE, width=6)
    total = sum(text_size(t, p)[1] + p * 3 for t, p in lines) - lines[-1][1] * 3
    y = cy - total // 2
    for t, p in lines:
        pixel_text(img, (cx, y), t, p, ink, anchor="ma")
        y += text_size(t, p)[1] + p * 3


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, im.width - 1, im.height - 1], radius, fill=255
    )
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def drop(img, tile, xy, radius=24, border=8, border_color=WHITE, shadow=PURPLE, off=10):
    """Paste a tile with a rounded border and a hard drop shadow."""
    x, y = xy
    w, h = tile.size
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        [
            x - border + off,
            y - border + off,
            x + w + border + off,
            y + h + border + off,
        ],
        radius + border,
        fill=shadow,
    )
    d.rounded_rectangle(
        [x - border, y - border, x + w + border, y + h + border],
        radius + border,
        fill=border_color,
    )
    img.alpha_composite(rounded(tile, radius), (x, y))


def ribbon(img, cx, y, text, px, fill=PURPLE, ink=WHITE, pad=28):
    w, h = text_size(text, px)
    d = ImageDraw.Draw(img)
    x0, x1 = cx - w // 2 - pad, cx + w // 2 + pad
    y1 = y + h + pad
    # Swallowtail ends behind the band.
    for side in (-1, 1):
        ex = x0 if side < 0 else x1
        d.polygon(
            [
                (ex - side * 10, y + 14),
                (ex + side * 60, y + 14),
                (ex + side * 40, (y + 14 + y1 + 14) // 2),
                (ex + side * 60, y1 + 14),
                (ex - side * 10, y1 + 14),
            ],
            fill=PINK_DK,
        )
    d.rectangle([x0, y, x1, y1], fill=fill)
    pixel_text(img, (cx, y + pad // 2), text, px, ink, anchor="ma")
    return y1


def device(name: str) -> Image.Image:
    return Image.open(SHOTS / f"{name}.png").convert("RGBA")


def screen(name: str) -> Image.Image:
    """The LCD and its bezel, cut from a 2x card-check shot of the Woodland egg."""
    return Image.open(CHECK / f"{name}.png").convert("RGBA").crop((38, 238, 622, 688))


def scale_h(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def scale_w(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def save(img, name):
    OUT.mkdir(parents=True, exist_ok=True)
    img = img.convert("RGB").quantize(
        colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    )
    img.save(OUT / name, optimize=True)
    print(OUT / name, (OUT / name).stat().st_size // 1024, "KB")


def hero():
    w, h = 1600, 860
    img = sunburst(w, h, 520, 330, PINK, PINK_LT, rays=32)
    sparkles(img, 26, 1, (30, 30, w - 30, 560))
    # Two devices, tilted like toys in a blister pack.
    for name, angle, xy in [
        ("1-Checkmew", 7, (1060, 70)),
        ("0-Checkpip", -6, (1190, 150)),
    ]:
        dev = scale_h(device(name), 560)
        card = Image.new("RGBA", (dev.width + 36, dev.height + 36), (0, 0, 0, 0))
        drop(card, dev, (12, 12), radius=28, border=10, off=0)
        shadow = Image.new("RGBA", card.size, (*PURPLE, 0))
        shadow.putalpha(card.getchannel("A"))
        for im, off in ((shadow, 14), (card, 0)):
            rot = im.rotate(angle, resample=Image.BICUBIC, expand=True)
            img.alpha_composite(rot, (xy[0] - rot.width // 2 + off + 200, xy[1] + off))
    pixel_text(img, (90, 90), "HATCH", 30, YELLOW, PURPLE, shadow=PINK_DK)
    pixel_text(img, (110, 330), "AT HOME!", 17, WHITE, PURPLE, shadow=PINK_DK)
    y = ribbon(img, 470, 500, "a virtual pet that lives in your house", 5)
    pixel_text(img, (470, y + 34), "for Home Assistant", 5, PURPLE, anchor="ma")
    burst(img, 140, 690, 120, [("NEW!", 8), ("6 worlds", 4)], fill=YELLOW)
    # Ground strip with the whole cast.
    d = ImageDraw.Draw(img)
    d.rectangle([0, 760, w, h], fill=PURPLE)
    d.rectangle([0, 752, w, 760], fill=YELLOW)
    cast = [s for _, _, _, roster in WORLDS for s in roster]
    step = (w - 400) / (len(cast) - 1)
    for i, s in enumerate(cast):
        sp = sprite(s, "child_content_1", 136)
        img.alpha_composite(sp, (round(330 + i * step - 68), 646))
    pixel_text(
        img,
        (w // 2, 790),
        "feed it!  play with it!  tuck it in!",
        5,
        YELLOW,
        anchor="ma",
    )
    save(img, "hero.png")


def worlds():
    w, h = 1600, 780
    img = Image.new("RGBA", (w, h), CREAM)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 40):
        for y in range(0, h, 40):
            if (x + y) // 40 % 2 == 0:
                d.rectangle([x + 18, y + 18, x + 22, y + 22], fill=(255, 222, 200))
    pixel_text(
        img,
        (w // 2, 36),
        "CHOOSE YOUR WORLD!",
        10,
        YELLOW,
        PURPLE,
        shadow=PINK,
        anchor="ma",
    )
    col = w / 6
    for i, (title, _key, shot, roster) in enumerate(WORLDS):
        dev = scale_w(device(shot), 214)
        cx = round(col * i + col / 2)
        top = 170
        drop(img, dev, (cx - dev.width // 2, top), radius=18, border=6)
        y = top + 392 + 30
        pixel_text(img, (cx, y), title.upper(), 5, PINK_DK, anchor="ma")
        y += 56
        for s in roster:
            pixel_text(img, (cx, y), NAMES[s], 3, PURPLE, anchor="ma")
            y += 34
    save(img, "worlds.png")


def grow():
    w, h = 1600, 560
    img = sunburst(w, h, w // 2, h + 200, YELLOW, (255, 226, 110), rays=40)
    sparkles(img, 14, 3, (30, 130, w - 30, 220))
    pixel_text(
        img,
        (w // 2, 30),
        "WATCH IT GROW!",
        10,
        WHITE,
        PURPLE,
        shadow=PINK_DK,
        anchor="ma",
    )
    stages = [
        ("egg_idle_1", "EGG", "day 0"),
        ("baby_content_1", "BABY", "30 min"),
        ("child_content_1", "CHILD", "1 day"),
        ("teen_content_1", "TEEN", "5 days"),
        ("adult_content_1", "ADULT", "14 days"),
    ]
    step = w / len(stages)
    for i, (name, label, when) in enumerate(stages):
        cx = round(step * i + step / 2)
        d = ImageDraw.Draw(img)
        d.ellipse([cx - 110, 400, cx + 110, 440], fill=(*YELLOW_DK, 255))
        img.alpha_composite(sprite("kitten", name, 256), (cx - 128, 200))
        pixel_text(img, (cx, 456), label, 6, PURPLE, anchor="ma")
        pixel_text(img, (cx, 512), when, 3, PINK_DK, anchor="ma")
        if i < len(stages) - 1:
            ax = round(cx + step / 2)
            d.polygon(
                [(ax - 22, 300), (ax + 22, 330), (ax - 22, 360)],
                fill=PINK_DK,
                outline=PURPLE,
                width=4,
            )
    save(img, "grow.png")


def collect():
    w, h = 1600, 900
    img = sunburst(w, h, w // 2, h // 2, CYAN, (110, 214, 236), rays=36)
    sparkles(img, 30, 5, (20, 20, w - 20, h - 20))
    pixel_text(
        img,
        (w // 2, 30),
        "COLLECT ALL 13!",
        10,
        YELLOW,
        PURPLE,
        shadow=PINK_DK,
        anchor="ma",
    )
    col = w / 6
    for i, (title, key, _, roster) in enumerate(WORLDS):
        cx = round(col * i + col / 2)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([cx - 120 + 8, 158, cx + 120 + 8, h - 22], 26, fill=PURPLE)
        d.rounded_rectangle(
            [cx - 120, 150, cx + 120, h - 30], 26, fill=CREAM, outline=PURPLE, width=5
        )
        emblem = (
            Image.open(UI / f"emblem_{key}.png")
            .convert("RGBA")
            .resize((80, 80), Image.NEAREST)
        )
        img.alpha_composite(emblem, (cx - 40, 166))
        pixel_text(img, (cx, 254), title.upper(), 4, PINK_DK, anchor="ma")
        slot = (h - 30 - 300) / 3
        for j, s in enumerate(roster):
            y = round(300 + j * slot)
            img.alpha_composite(sprite(s, "adult_content_1", 168), (cx - 84, y - 20))
            pixel_text(img, (cx, y + 140), NAMES[s], 3, PURPLE, anchor="ma")
        if len(roster) == 2:
            y = round(300 + 2 * slot)
            egg_src = next(
                (s for s in roster if (SPRITES / s / "egg_idle_1.png").exists()), None
            )
            if egg_src:
                img.alpha_composite(
                    sprite(egg_src, "egg_idle_1", 168), (cx - 84, y - 20)
                )
                pixel_text(img, (cx, y + 140), "which one?", 3, PINK_DK, anchor="ma")
    save(img, "collect.png")


def screens(name, title, items, bg, bg2, seed):
    w, h = 1600, 980
    img = sunburst(w, h, w // 2, h // 2, bg, bg2, rays=36)
    sparkles(img, 18, seed, (20, 20, w - 20, h - 20))
    pixel_text(
        img, (w // 2, 30), title, 10, YELLOW, PURPLE, shadow=PINK_DK, anchor="ma"
    )
    col = w / 3
    for i, (shot, caption) in enumerate(items):
        cx = round(col * (i % 3) + col / 2)
        top = 160 + (i // 3) * 410
        tile = scale_w(screen(shot), 420)
        drop(img, tile, (cx - 210, top), radius=22, border=8)
        pill(img, (cx, top + tile.height + 30), caption, 4)
    save(img, name)


def footer():
    w, h = 1600, 300
    img = Image.new("RGBA", (w, h), WHITE)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline=PURPLE, width=6)
    # Barcode: one bar per bit of the project's name.
    x = 60
    bits = "".join(f"{ord(c):08b}" for c in "HATCH AT HOME")
    d.rectangle([40, 40, 420, 220], fill=WHITE)
    for b in "101" + bits + "101":
        wid = 6 if b == "1" else 3
        d.rectangle([x, 50, x + wid - 1, 200], fill=PURPLE if b == "1" else WHITE)
        x += wid + 2
    pixel_text(img, (60, 214), "0 26 10 28 HATCH 9", 3, PURPLE)
    lines = [
        ("AGES 8 TO 108", 6, PINK_DK),
        ("Requires Home Assistant. Egg included, pet hatches inside.", 3, PURPLE),
        ("No real animals were fed, cleaned or scolded.", 3, PURPLE),
        ("Free & open source, MIT licensed. Made with love.", 3, PURPLE),
    ]
    y = 56
    for t, p, c in lines:
        pixel_text(img, (x + 60, y), t, p, c)
        y += text_size(t, p)[1] + 28
    egg = sprite("bird", "egg_idle_1", 200)
    img.alpha_composite(egg, (w - 200, 40))
    save(img, "footer.png")


if __name__ == "__main__":
    hero()
    worlds()
    grow()
    collect()
    screens(
        "play.png",
        "A LIFE OF ITS OWN!",
        [
            ("04a-greeting", "says hi by name"),
            ("04a-pick", "mini-games!"),
            ("04c-higher-lower", "higher or lower?"),
            ("02-status", "hearts & meters"),
            ("05-wish-granted", "a wish every day"),
            ("03-journal", "the family journal"),
        ],
        PINK,
        PINK_LT,
        7,
    )
    screens(
        "house.png",
        "IT KNOWS YOUR HOUSE!",
        [
            ("05-forecast", "reads the forecast"),
            ("05-watching", "watches TV with you"),
            ("05-first_snow", "the first snow!"),
            ("05-sunset", "sunsets together"),
            ("05-trait_learned", "learns your habits"),
            ("05-halloween-extras", "spooky seasons"),
        ],
        (126, 104, 222),
        (150, 130, 236),
        9,
    )
    footer()
