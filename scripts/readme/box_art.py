"""Draw the README toy-box panels from real shell shots and game sprites."""

from pathlib import Path
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

from art import (
    CREAM, PINK, PINK_DK, PINK_LT, PURPLE, WHITE, YELLOW,
    device, drop, pixel_text, rounded, scale_h, text_size,
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/readme/pack"
FRONT = ROOT / "custom_components/virtual_pet/frontend"
WORLDS = [
    ("Woodland", "bird", ["squirrel", "deer"]),
    ("Hearth", "kitten", ["bunny"]),
    ("Terrarium", "gecko", ["tarantula"]),
    ("Tidepool", "otter", ["octopus"]),
    ("Pond", "treefrog", ["axolotl"]),
    ("Night Sky", "bat", ["lunamoth"]),
]
NAMES = {
    "bird": "Bird", "squirrel": "Squirrel", "deer": "Deer",
    "kitten": "Kitten", "bunny": "Lop bunny", "gecko": "Gecko",
    "tarantula": "Tarantula", "otter": "Sea otter", "octopus": "Octopus",
    "treefrog": "Tree frog", "axolotl": "Axolotl", "bat": "Bat",
    "lunamoth": "Luna moth",
}


def label(im, center, y, text, px=7, fill=YELLOW):
    w, h = text_size(text, px)
    x = center - w // 2
    d = ImageDraw.Draw(im)
    d.rectangle((x - 14, y - 10, x + w + 14, y + h + 10), fill=PURPLE)
    d.rectangle((x - 8, y - 4, x + w + 20, y + h + 16), fill=PINK_DK)
    d.rectangle((x - 14, y - 10, x + w + 14, y + h + 10), fill=PURPLE)
    pixel_text(im, (center, y), text, px, fill, anchor="ma")


def first_sprite(species, size, frame="child_content_1"):
    path = FRONT / "sprites" / species / f"{frame}.png"
    if not path.exists():
        path = FRONT / "sprites" / species / "child_content_1.png"
    im = Image.open(path).convert("RGBA")
    return im.resize((size, size), Image.Resampling.NEAREST)


def silhouette(species, size):
    im = first_sprite(species, size)
    alpha = im.getchannel("A")
    wide = alpha.filter(ImageFilter.MaxFilter(9))
    outline = Image.new("RGBA", im.size, (0, 0, 0, 0))
    # An open black contour keeps the hidden creature a teaser rather than a reveal.
    contour = ImageChops.subtract(wide, alpha)
    outline.putalpha(contour)
    return outline


def filled_silhouette(species, size):
    im = first_sprite(species, size)
    mask = im.getchannel("A")
    fill = Image.new("RGBA", im.size, (16, 10, 26, 255))
    fill.putalpha(mask)
    return fill


def pixel_scene(world, species, frame, width=510, height=300):
    """Layered, busy pixel habitats around each world's actual starter sprite."""
    out_w, out_h = width, height
    width, height = 510, 300
    palettes = {
        "woodland": ((177, 224, 255), (91, 160, 83), (255, 221, 103)),
        "hearth": ((255, 220, 155), (160, 94, 65), (255, 238, 189)),
        "terrarium": ((255, 216, 135), (122, 126, 62), (249, 235, 176)),
        "tidepool": ((119, 208, 229), (43, 126, 157), (255, 218, 152)),
        "pond": ((164, 220, 183), (59, 133, 101), (255, 225, 117)),
        "nightsky": ((48, 53, 111), (38, 45, 83), (255, 226, 137)),
    }
    sky, ground, accent = palettes[world]
    scene = Image.new("RGBA", (width, height), sky)
    d = ImageDraw.Draw(scene)
    rnd = random.Random(40 + list(palettes).index(world))
    # Light texture runs through the whole screen, avoiding large empty fields.
    for _ in range(280):
        x, y = rnd.randrange(width), rnd.randrange(height)
        c = (255, 255, 255, 105) if rnd.random() < .55 else (*ground, 115)
        d.rectangle((x, y, x+rnd.randrange(2, 8), y+rnd.randrange(2, 5)), fill=c)

    def flower(x, y, petal=(255, 245, 204)):
        d.rectangle((x-5, y-2, x+5, y+2), fill=petal)
        d.rectangle((x-2, y-5, x+2, y+5), fill=petal)
        d.rectangle((x-2, y-2, x+2, y+2), fill=(255, 190, 69))

    if world == "woodland":
        d.polygon([(0, 157), (80, 91), (160, 151), (247, 79), (332, 155), (421, 92), (510, 149), (510, 300), (0, 300)], fill=(104, 176, 111))
        for x, top, color in ((18, 12, (49, 126, 83)), (86, 38, (69, 151, 82)), (419, 6, (47, 119, 79)), (483, 56, (75, 158, 87))):
            d.rectangle((x+17, top+68, x+34, 255), fill=(107, 70, 51))
            for k in range(4):
                ox = (k%2)*42
                oy = (k//2)*30
                d.ellipse((x-10+ox, top+oy, x+49+ox, top+70+oy), fill=color)
        d.rectangle((0, 230, width, height), fill=ground)
        for x in range(0, width, 18):
            d.line((x, 230, x-5, 214-rnd.randrange(4, 20)), fill=(50, 116, 72), width=3)
        for x, y in ((39, 251), (102, 226), (394, 255), (464, 232)): flower(x, y)
        for x, y in ((120, 64), (354, 90), (53, 130)):
            d.ellipse((x, y, x+16, y+10), fill=(255, 255, 242))
            d.ellipse((x+9, y-5, x+22, y+8), fill=(255, 255, 242))
    elif world == "hearth":
        d.rectangle((0, 198, width, height), fill=(184, 119, 73))
        d.rectangle((0, 191, width, 205), fill=(115, 68, 49))
        for y in range(211, height, 24):
            d.line((0, y, width, y), fill=(222, 156, 96), width=3)
            for x in range((y//24%2)*42, width, 84): d.line((x, y, x, y+24), fill=(137, 83, 58), width=2)
        d.rectangle((20, 35, 170, 166), fill=(255, 246, 195), outline=(125, 76, 57), width=9)
        d.line((94, 35, 94, 166), fill=(125, 76, 57), width=6)
        d.line((20, 105, 170, 105), fill=(125, 76, 57), width=6)
        d.rectangle((0, 35, 18, 181), fill=(216, 105, 98)); d.rectangle((171, 35, 190, 181), fill=(216, 105, 98))
        d.rectangle((360, 105, 472, 207), fill=(105, 63, 53)); d.rectangle((348, 97, 485, 115), fill=(79, 48, 44))
        d.polygon([(376, 200), (405, 143), (435, 200)], fill=(255, 135, 47)); d.polygon([(401, 200), (426, 161), (450, 200)], fill=(255, 202, 74))
        d.ellipse((173, 222, 340, 282), fill=(223, 155, 104), outline=(118, 69, 53), width=5)
        for x in (201, 250, 299): d.ellipse((x, 238, x+16, 254), fill=accent)
        d.rectangle((222, 42, 333, 58), fill=(112, 72, 50))
        for j, color in enumerate(((205, 86, 76), (57, 137, 149), (225, 175, 65))): d.rectangle((228+j*31, 20, 251+j*31, 42), fill=color)
    elif world == "terrarium":
        d.rectangle((0, 224, width, height), fill=(177, 127, 69))
        d.rectangle((0, 214, width, 232), fill=(111, 146, 76))
        d.polygon([(26, 216), (80, 127), (130, 216)], fill=(143, 119, 78))
        d.polygon([(364, 220), (427, 127), (491, 220)], fill=(152, 125, 79))
        for x, y in ((36, 82), (104, 162), (410, 68), (471, 157)):
            d.line((x, 252, x+18, y+50), fill=(53, 126, 76), width=9)
            for k in range(4):
                yy = y+k*15
                d.polygon([(x+5, yy+22), (x-23, yy+4), (x+3, yy+9)], fill=(79, 163, 91))
                d.polygon([(x+14, yy+22), (x+39, yy+3), (x+18, yy+11)], fill=(99, 178, 93))
        d.rectangle((40, 34, 78, 52), fill=(255, 237, 174)); d.line((59, 52, 120, 110), fill=(250, 202, 109), width=4)
        for _ in range(18):
            x, y = rnd.randrange(width), rnd.randrange(230, height)
            d.rectangle((x, y, x+4, y+3), fill=(233, 190, 103))
    elif world == "tidepool":
        d.rectangle((0, 185, width, height), fill=(49, 151, 183))
        d.rectangle((0, 185, width, 199), fill=(255, 226, 160))
        d.polygon([(0, 154), (67, 95), (123, 165), (200, 112), (270, 168), (351, 97), (435, 164), (510, 113), (510, 200), (0, 200)], fill=(93, 149, 143))
        for y in range(205, 289, 19):
            for x in range((y//19%2)*33, width, 68):
                d.arc((x, y, x+53, y+18), 185, 350, fill=(173, 237, 228), width=4)
        for x, y, color in ((16, 188, (241, 136, 98)), (82, 204, (242, 209, 113)), (395, 193, (231, 116, 123)), (457, 206, (255, 184, 98))):
            d.ellipse((x, y, x+42, y+34), fill=(76, 104, 111))
            for k in range(3): d.line((x+9+k*10, y+28, x+4+k*16, y-18), fill=color, width=6)
        for x, y in ((112, 72), (373, 111), (453, 54), (223, 48)):
            d.ellipse((x, y, x+8, y+8), outline=(245, 255, 245), width=3)
            d.ellipse((x+9, y-12, x+15, y-6), outline=(245, 255, 245), width=2)
    elif world == "pond":
        d.rectangle((0, 211, width, height), fill=(65, 151, 136))
        d.polygon([(0, 210), (72, 151), (130, 205), (194, 174), (245, 214), (327, 164), (385, 205), (462, 150), (510, 191), (510, 222), (0, 222)], fill=(117, 177, 116))
        for y in range(222, 290, 17):
            d.line((0, y, width, y), fill=(108, 194, 165), width=3)
            for x in range((y//17%2)*37, width, 74): d.line((x, y, x+28, y+4), fill=(197, 236, 168), width=2)
        for x, y in ((22, 209), (102, 238), (381, 219), (458, 246)):
            d.ellipse((x-27, y-13, x+27, y+13), fill=(136, 201, 111), outline=(54, 127, 82), width=3)
            d.line((x, y, x+9, y-7), fill=(255, 237, 156), width=3)
        for x in (18, 50, 467, 497):
            d.line((x, 260, x+5, 157-rnd.randrange(0, 40)), fill=(46, 124, 81), width=6)
            flower(x+8, 174, (255, 245, 209))
        d.ellipse((192, 260, 326, 293), fill=(55, 126, 117))
    else:
        d.rectangle((0, 215, width, height), fill=(53, 61, 112))
        d.polygon([(0, 223), (84, 153), (161, 224), (265, 133), (350, 226), (431, 162), (510, 222), (510, 300), (0, 300)], fill=(33, 43, 82))
        for x, y in ((36, 40), (107, 88), (185, 31), (295, 66), (375, 33), (462, 96), (68, 148), (427, 181), (217, 187), (331, 127)):
            d.rectangle((x, y, x+7, y+7), fill=(255, 244, 190))
            d.rectangle((x-4, y+2, x+11, y+4), fill=(255, 244, 190))
        d.ellipse((413, 22, 475, 84), fill=accent); d.ellipse((393, 7, 455, 69), fill=sky)
        for x in (72, 391):
            d.rectangle((x+12, 172, x+22, 245), fill=(73, 56, 87))
            d.ellipse((x-22, 137, x+55, 205), fill=(45, 57, 98))

    # Scale the habitat to each real LCD, then layer the undistorted game sprite.
    sx, sy = out_w/width, out_h/height
    scene = scene.resize((out_w, out_h), Image.Resampling.NEAREST)
    d = ImageDraw.Draw(scene)
    size = min(int(184*min(sx, sy)), int(out_h*.64))
    pet = first_sprite(species, size, frame)
    scene.alpha_composite(pet, ((out_w-size)//2, out_h-size-int(13*sy)))
    if world == "woodland": activity = "BIRD WATCH!"
    elif world == "hearth": activity = "KNEAD KNEAD!"
    elif world == "terrarium": activity = "NEW SKIN!"
    elif world == "tidepool": activity = "ROCK BALANCE!"
    elif world == "pond": activity = "LILY HOP!"
    else: activity = "UPSIDE DOWN!"
    d.rounded_rectangle((round(12*sx), round(12*sy), round(164*sx), round(47*sy)), radius=round(8*min(sx, sy)), fill=(255, 250, 230), outline=(59, 31, 74), width=max(2, round(4*min(sx, sy))))
    pixel_text(scene, (round(88*sx), round(19*sy)), activity, max(1, round(2*min(sx, sy))), PURPLE, anchor="ma")
    return scene


def device_scene(key, species, frame):
    shot = device(key)
    # LCD plus bezel positions measured from the actual shell captures.
    boxes = {
        "woodland": (38, 238, 622, 688), "hearth": (36, 334, 624, 785),
        "terrarium": (66, 212, 602, 602), "tidepool": (58, 278, 610, 684),
        "pond": (44, 258, 616, 677), "nightsky": (52, 326, 607, 743),
    }
    x1, y1, x2, y2 = boxes[key]
    sd = ImageDraw.Draw(shot)
    sd.rounded_rectangle((x1, y1, x2, y2), radius=38, fill=(245, 237, 215, 255))
    inset = 14
    scene = pixel_scene(key, species, frame, x2-x1-2*inset, y2-y1-2*inset)
    mask = Image.new("L", scene.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, scene.width-1, scene.height-1), 24, fill=255)
    scene.putalpha(mask)
    shot.alpha_composite(scene, (x1+inset, y1+inset))
    sd = ImageDraw.Draw(shot)
    sd.rounded_rectangle((x1, y1, x2, y2), radius=38, outline=(255, 250, 232, 255), width=7)
    return shot


def box_front():
    w, h = 1600, 1040
    im = Image.new("RGBA", (w, h), PINK)
    d = ImageDraw.Draw(im)
    cx, cy = 510, 410
    for i in range(32):
        if i % 2:
            continue
        import math
        t0, t1 = i * math.tau / 32, (i + 1) * math.tau / 32
        r = 1900
        d.polygon([(cx, cy), (cx + r*math.cos(t0), cy+r*math.sin(t0)),
                   (cx+r*math.cos(t1), cy+r*math.sin(t1))],
                  fill=PINK_LT)
    random.seed(13)
    for _ in range(46):
        x, y = random.randrange(35, 1560), random.randrange(30, 880)
        d.rectangle((x-3, y-15, x+3, y+15), fill=WHITE)
        d.rectangle((x-15, y-3, x+15, y+3), fill=WHITE)
    label(im, 500, 70, "HATCH AT HOME!", 13)
    # The left half is a proper toy-box feature panel, so the cover never reads empty.
    d.rounded_rectangle((58, 188, 862, 606), radius=34, fill=PURPLE)
    d.rounded_rectangle((72, 202, 848, 592), radius=28, outline=YELLOW, width=8)
    pixel_text(im, (460, 240), "YOUR HOME. THEIR WORLD.", 7, YELLOW, anchor="ma")
    pixel_text(im, (460, 326), "30 PETS  •  6 WORLDS", 7, WHITE, anchor="ma")
    pixel_text(im, (460, 393), "CARE!  PLAY!  GROW!", 7, YELLOW, anchor="ma")
    pixel_text(im, (460, 444), "THEY NOTICE YOUR REAL HOME", 5, WHITE, anchor="ma")
    for i, (world, first, _) in enumerate(WORLDS):
        pet = first_sprite(first, 100)
        im.alpha_composite(pet, (158 + i*100, 476))
    # Three actual in-game shell designs, each with its world's first pet in scene.
    shell_specs = [("hearth", "kitten", "child_knead_1"), ("tidepool", "otter", "child_rock_1"), ("pond", "treefrog", "child_lily_sit_1")]
    centers = [1010, 1250, 1490]
    for (key, title, frame), center in zip(shell_specs, centers):
        shot = device_scene(key, title, frame)
        tile = scale_h(shot, 530)
        tile = tile.resize((205, 332), Image.Resampling.LANCZOS)
        tile = rounded(tile, 28)
        drop(im, tile, (center-102, 236), radius=28, border=8, off=8)
        pixel_text(im, (center, 592), key.upper(), 4, PURPLE, anchor="ma")
    # Each starter stands alone on the shelf; no offset ghost behind it.
    d.rectangle((0, 664, w, h), fill=PURPLE)
    d.rectangle((0, 664, w, 676), fill=YELLOW)
    slot_w = w // 6
    for i, (world, first, extras) in enumerate(WORLDS):
        center = slot_w*i + slot_w//2
        pet = first_sprite(first, 166)
        im.alpha_composite(pet, (center-83, 686))
        pixel_text(im, (center, 846), NAMES[first].upper(), 4, YELLOW, anchor="ma")
        pixel_text(im, (center, 910), world.upper(), 4, WHITE, anchor="ma")
    pixel_text(im, (800, 982), "6 WORLDS  •  30 CREATURES  •  YOUR HOME, THEIR WORLD", 5, YELLOW, anchor="ma")
    im.convert("RGB").save(OUT / "box-front.png", optimize=True)


def shell_lineup():
    w, h = 1600, 1190
    im = Image.new("RGBA", (w, h), CREAM)
    d = ImageDraw.Draw(im)
    for y in range(0, h, 42):
        for x in range((y//42%2)*21, w, 42):
            d.rectangle((x, y, x+4, y+4), fill=(255, 222, 200))
    label(im, 800, 32, "SIX WORLDS. SIX LITTLE DEVICES!", 10)
    pixel_text(im, (800, 108), "LOOK IN AND SEE WHAT YOUR PAL IS UP TO!", 5, PURPLE, anchor="ma")
    cell_w, cell_h = 500, 478
    shell_keys = ("woodland", "hearth", "terrarium", "tidepool", "pond", "nightsky")
    world_washes = [
        (224, 241, 204), (255, 224, 193), (239, 223, 174),
        (199, 237, 246), (207, 238, 203), (216, 213, 249),
    ]
    for i, ((name, first, extras), key) in enumerate(zip(WORLDS, shell_keys)):
        col, row = i % 3, i // 3
        x = 54 + col*510
        y = 176 + row*490
        d.rounded_rectangle((x, y, x+cell_w-18, y+cell_h), radius=28, fill=WHITE, outline=PURPLE, width=8)
        d.rounded_rectangle((x+14, y+14, x+cell_w-32, y+cell_h-14), radius=22, fill=world_washes[i])
        # Fill both side gutters with this world's emblem and bold pixel sparkles.
        rnd = random.Random(90+i)
        for side_x in (x+32, x+cell_w-132):
            for k in range(9):
                px, py = side_x+rnd.randrange(0, 76), y+145+rnd.randrange(0, 210)
                color = YELLOW if k % 2 else WHITE
                d.rectangle((px-2, py-9, px+2, py+9), fill=color)
                d.rectangle((px-9, py-2, px+9, py+2), fill=color)
        emblem_path = FRONT / "ui" / f"emblem_{key}.png"
        if emblem_path.exists():
            emblem = Image.open(emblem_path).convert("RGBA").resize((84, 84), Image.Resampling.NEAREST)
            im.alpha_composite(emblem, (x+24, y+260))
        shot = device_scene(key, first, ("child_birdwatch", "child_knead_1", "child_shed_1", "child_rock_1", "child_lily_sit_1", "child_hang_1")[i])
        tile = scale_h(shot, 380)
        tile = rounded(tile, 22)
        drop(im, tile, (x+(cell_w-18-tile.width)//2, y+20), radius=22, border=6, off=7)
        label(im, x+(cell_w-18)//2, y+404, f"{name.upper()}  •  {NAMES[first].upper()}", 4, fill=YELLOW)
    im.convert("RGB").save(OUT / "shell-lineup.png", optimize=True)


def feature_cards():
    w, h = 1600, 720
    im = Image.new("RGBA", (w, h), CREAM)
    d = ImageDraw.Draw(im)
    for y in range(0, h, 44):
        for x in range((y//44%2)*22, w, 44):
            d.rectangle((x, y, x+4, y+4), fill=(255, 222, 200))
    label(im, 800, 35, "WHAT'S INSIDE THE BOX?", 12)
    cards = [
        ("CARE!", "icon_feed.png", "Feed • clean • tuck in"),
        ("THREE GAMES!", "icon_play.png", "Left/right • higher/lower • dig"),
        ("GROW & DISCOVER!", "egg", "30 creatures • 6 worlds"),
        ("HOUSE SIGNALS!", "icon_lights_out.png", "Moon • weather • robot • laundry"),
        ("DAILY STORIES!", "icon_journal.png", "Wishes • visitors • dreams"),
        ("FRIENDS!", "stat_heart_full.png", "Visitors • linked pets • bonds"),
    ]
    # Fall back to icons that exist in the card when a legacy alias has changed.
    icons_dir = FRONT / "ui"
    import glob
    available = {Path(p).name for p in glob.glob(str(icons_dir / "*.png"))}
    cards = [(title, icon if icon == "egg" or icon in available else "icon_status.png", copy) for title, icon, copy in cards]
    content_colors = [
        (255, 232, 177), (198, 237, 249), (255, 214, 165),
        (192, 236, 206), (223, 213, 255), (255, 207, 222),
    ]
    for i, (title, icon, copy) in enumerate(cards):
        col, row = i % 3, i // 3
        x, y = 54 + col*510, 190 + row*250
        d.rounded_rectangle((x+12, y+12, x+456, y+208), radius=24, fill=PINK_DK)
        d.rounded_rectangle((x, y, x+444, y+196), radius=24, fill=content_colors[i], outline=PURPLE, width=8)
        d.rectangle((x+18, y+18, x+426, y+72), fill=PURPLE)
        pixel_text(im, (x+222, y+30), title, 5 if len(title) > 12 else 6, YELLOW, anchor="ma")
        # Draw active little scenes and icon rows instead of leaving blank card centers.
        if i == 0:
            for j, name in enumerate(("icon_feed.png", "icon_snack.png", "icon_play.png", "icon_clean.png", "icon_sleep.png")):
                path = icons_dir / name
                if path.exists():
                    d.ellipse((x+43+j*76, y+84, x+103+j*76, y+144), fill=WHITE, outline=PURPLE, width=3)
                    small = Image.open(path).convert("RGBA").resize((43, 43), Image.Resampling.NEAREST)
                    im.alpha_composite(small, (x+53+j*76, y+91))
        elif i == 1:
            games = [("LEFT / RIGHT", (255, 226, 121)), ("HIGH / LOW", (255, 177, 174)), ("BERRY DIG", (155, 205, 132))]
            for j, (word, color) in enumerate(games):
                bx = x+22+j*134
                d.rounded_rectangle((bx, y+86, bx+124, y+145), radius=14, fill=color, outline=PURPLE, width=4)
                if j == 0:
                    d.polygon([(bx+23,y+115),(bx+44,y+98),(bx+44,y+132)], fill=PURPLE)
                    d.polygon([(bx+101,y+115),(bx+80,y+98),(bx+80,y+132)], fill=PURPLE)
                elif j == 1:
                    d.ellipse((bx+43, y+96, bx+81, y+134), fill=WHITE, outline=PURPLE, width=3)
                    pixel_text(im, (bx+62, y+101), "?", 3, PURPLE, anchor="ma")
                else:
                    d.ellipse((bx+47, y+97, bx+78, y+128), fill=(74, 104, 190), outline=PURPLE, width=3)
                    d.polygon([(bx+64,y+97),(bx+83,y+86),(bx+78,y+105)], fill=(74, 136, 76))
                pixel_text(im, (bx+62, y+134), word, 2, PURPLE, anchor="ma")
        elif i == 2:
            stages = [
                ("kitten", "egg_idle_1.png"), ("kitten", "baby_content_1.png"),
                ("kitten", "child_content_1.png"), ("kitten", "teen_content_1.png"),
                ("kitten", "adult_content_1.png"),
            ]
            for j, (species, fname) in enumerate(stages):
                path = FRONT / "sprites" / species / fname
                if path.exists():
                    sprite = Image.open(path).convert("RGBA").resize((55, 55), Image.Resampling.NEAREST)
                    d.ellipse((x+25+j*78, y+84, x+85+j*78, y+144), fill=(255, 246, 219), outline=PURPLE, width=3)
                    im.alpha_composite(sprite, (x+28+j*78, y+87))
        elif i == 3:
            # Four household cues: moon, weather, music and a busy appliance.
            d.ellipse((x+46, y+93, x+94, y+141), fill=(255, 215, 96), outline=PURPLE, width=3)
            d.ellipse((x+59, y+84, x+105, y+130), fill=content_colors[i])
            d.ellipse((x+134, y+108, x+177, y+139), fill=WHITE, outline=PURPLE, width=3)
            d.ellipse((x+155, y+93, x+194, y+139), fill=WHITE, outline=PURPLE, width=3)
            d.rectangle((x+140, y+125, x+193, y+143), fill=WHITE)
            d.line((x+238, y+93, x+238, y+139), fill=PURPLE, width=6)
            d.ellipse((x+223, y+126, x+253, y+151), fill=(255, 215, 96), outline=PURPLE, width=3)
            d.rectangle((x+311, y+94, x+365, y+145), fill=WHITE, outline=PURPLE, width=4)
            d.ellipse((x+324, y+103, x+352, y+131), fill=(115, 192, 218), outline=PURPLE, width=4)
            d.rectangle((x+319, y+138, x+330, y+146), fill=PURPLE)
            d.rectangle((x+347, y+138, x+358, y+146), fill=PURPLE)
        elif i == 4:
            for j, (species, frame) in enumerate((
                ("bird", "child_birdwatch"), ("kitten", "child_excited_1"),
                ("treefrog", "child_lily_sit_1"), ("bat", "child_hang_1"),
            )):
                sprite = first_sprite(species, 67, frame)
                im.alpha_composite(sprite, (x+14+j*98, y+82))
            for sx in (x+82, x+179, x+277, x+376):
                d.rectangle((sx, y+88, sx+7, y+95), fill=YELLOW)
                d.rectangle((sx-5, y+91, sx+12, y+93), fill=YELLOW)
        else:
            for xx in (x+64, x+324):
                d.ellipse((xx-5, y+92, xx+63, y+150), fill=(255, 244, 211), outline=PURPLE, width=4)
            im.alpha_composite(first_sprite("bird", 76, "child_content_1"), (x+62, y+83))
            heart = Image.open(icons_dir / "stat_heart_full.png").convert("RGBA").resize((72, 72), Image.Resampling.NEAREST)
            im.alpha_composite(heart, (x+185, y+83))
            im.alpha_composite(first_sprite("treefrog", 76, "child_content_1"), (x+318, y+83))
            d.line((x+137, y+120, x+189, y+120), fill=PURPLE, width=5)
            d.line((x+257, y+120, x+310, y+120), fill=PURPLE, width=5)
        pixel_text(im, (x+222, y+166), copy.upper(), 3, PURPLE, anchor="ma")
    pixel_text(im, (800, 680), "THE HOUSE CAN CHANGE THE SCENE. IT CAN NEVER HURT YOUR PET!", 4, PURPLE, anchor="ma")
    im.convert("RGB").save(OUT / "feature-cards.png", optimize=True)


def music_bridge():
    """Pair an actual pet shell with a real home speaker across a 45-degree cut."""
    w, h = 1600, 900
    photo = Image.open(OUT.parent / "src/music-speaker-home.jpg").convert("RGB")
    im = ImageOps.fit(photo, (w, h), method=Image.Resampling.LANCZOS, centering=(0.62, 0.49)).convert("RGBA")
    left = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(left)
    split = [(0, 0), (1260, 0), (360, h), (0, h)]
    d.polygon(split, fill=PURPLE)
    # Densely fill the digital side with the package palette and pixel confetti.
    for y in range(0, h, 48):
        for x in range((y//48%2)*24, 1180, 48):
            d.rectangle((x, y, x+5, y+5), fill=(92, 60, 113))
    random.seed(28)
    for _ in range(70):
        x, y = random.randrange(35, 1120), random.randrange(30, h-20)
        d.rectangle((x-3, y-13, x+3, y+13), fill=YELLOW)
        d.rectangle((x-13, y-3, x+13, y+3), fill=YELLOW)
    im.alpha_composite(left)
    # The diagonal seam is visible at a glance, with a bright toy-box edge.
    d = ImageDraw.Draw(im)
    d.line((1260, 0, 360, h), fill=PURPLE, width=34)
    d.line((1250, 0, 350, h), fill=YELLOW, width=15)
    d.line((1240, 0, 340, h), fill=WHITE, width=4)

    pixel_text(im, (70, 54), "HOME ASSISTANT", 7, YELLOW, box=PURPLE, shadow=PINK_DK, pad=2)
    pixel_text(im, (72, 159), "MUSIC ON!", 12, WHITE, box=PINK_DK, shadow=PURPLE, pad=2)
    pixel_text(im, (76, 238), "YOUR PAL", 7, YELLOW, box=PURPLE, shadow=PINK_DK, pad=2)
    pixel_text(im, (76, 298), "DANCES ALONG!", 7, YELLOW, box=PURPLE, shadow=PINK_DK, pad=2)
    # Actual Hearth shell capture, with the real kitten dance sprite in its LCD.
    shot = device_scene("hearth", "kitten", "child_dance")
    tile = scale_h(shot, 450)
    tile = rounded(tile, 30)
    drop(im, tile, (155, 380), radius=30, border=9, off=12)
    # Home signal tag and music marks close the visual loop.
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((110, 839, 670, 884), radius=16, fill=YELLOW, outline=PURPLE, width=5)
    pixel_text(im, (390, 850), "♫ MUSIC ON • PET DANCE PARTY!", 3, PURPLE, anchor="ma")
    for x, y in ((721, 200), (810, 268), (1032, 104)):
        d.ellipse((x, y+25, x+20, y+39), fill=YELLOW, outline=PURPLE, width=3)
        d.line((x+17, y+29, x+17, y-4), fill=YELLOW, width=6)
        d.line((x+17, y-4, x+39, y+2), fill=YELLOW, width=6)
    im.convert("RGB").save(OUT / "music-bridge.jpg", quality=91, optimize=True, progressive=True)


def retail_gecko_sprite():
    """Use the real one-tail gecko sprite in the photographed mono-screen pack."""
    path = OUT / "retail-terrarium-gecko-mono.jpg"
    im = Image.open(path).convert("RGBA")
    sprite = Image.open(FRONT / "sprites/gecko/child_content_1.png").convert("RGBA")
    sprite = sprite.crop(sprite.getchannel("A").getbbox())

    # Keep the sprite's exact silhouette and pixel placement while matching the
    # package's four-green LCD. This deliberately avoids redrawing the creature.
    width = 153
    height = round(sprite.height * width / sprite.width)
    sprite = sprite.resize((width, height), Image.Resampling.NEAREST)
    alpha = sprite.getchannel("A")
    mono = Image.new("RGBA", sprite.size, (0, 0, 0, 0))
    pixels = []
    for r, g, b, a in sprite.getdata():
        lum = (r * 299 + g * 587 + b * 114) // 1000
        if lum < 48:
            color = (24, 45, 29)
        elif lum < 112:
            color = (59, 83, 42)
        elif lum < 178:
            color = (118, 145, 74)
        else:
            color = (174, 198, 116)
        pixels.append((*color, a))
    mono.putdata(pixels)
    mono.putalpha(alpha)

    # The screen is nearly front-on in this product photograph. The pet sits
    # on its lower edge, matching the scale and placement of the other LCD art.
    im.alpha_composite(mono, ((im.width - width) // 2, 590))
    im.convert("RGB").save(path, quality=93, optimize=True, progressive=True)


def chapter_ribbons():
    w, h = 1600, 360
    im = Image.new("RGBA", (w, h), PURPLE)
    d = ImageDraw.Draw(im)
    rows = [
        (PINK, "CARE. PLAY. GROW.", "YOUR PAL HAS A LIFE OF ITS OWN", "kitten", "child_zoomies_1"),
        ((62, 166, 190), "THE HOUSE JOINS IN!", "WEATHER • MUSIC • ROBOT VACUUMS", "treefrog", "child_lily_sit_1"),
        ((125, 102, 222), "A NEW STORY EVERY DAY!", "WISHES • DREAMS • VISITORS • FRIENDS", "bat", "child_hang_1"),
    ]
    for i, (color, head, sub, species, frame) in enumerate(rows):
        y = i*120
        d.rectangle((0, y, w, y+112), fill=color)
        d.rectangle((0, y+104, w, y+112), fill=YELLOW)
        for x in range(28, w, 108):
            d.rectangle((x, y+24, x+7, y+31), fill=WHITE)
        pet = first_sprite(species, 112, frame)
        im.alpha_composite(pet, (95, y+2))
        d.rounded_rectangle((260, y+14, 1205, y+96), radius=18, fill=PURPLE, outline=YELLOW, width=5)
        pixel_text(im, (720, y+23), head, 7, YELLOW, anchor="ma")
        pixel_text(im, (720, y+62), sub, 4, WHITE, anchor="ma")
        for j in range(3):
            x = 1310+j*74
            d.rectangle((x, y+34, x+34, y+68), fill=WHITE, outline=PURPLE, width=4)
            d.rectangle((x+10, y+44, x+24, y+58), fill=color)
    im.convert("RGB").save(OUT / "chapter-ribbons.png", optimize=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    box_front()
    shell_lineup()
    feature_cards()
    music_bridge()
    chapter_ribbons()
    retail_gecko_sprite()
