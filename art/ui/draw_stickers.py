#!/usr/bin/env python3
"""Set F: the six memory sticker icons (plan-2026-11-02-memory.md section 9; owner Q1, 2026-11-05), drawn in
code, not cut from a sheet (the HAND route: no image-model run). usage: draw_stickers.py [REPO]
Two takes per tag (_v1, _v2) in art/ui/library/f-stickers/, 96 x 96, 4-bit palette, index 0 transparent: the
format of every library icon. Each is drawn at 24 art px, art 20 px at most with a 1-px outline (the live-size
rule: set B's v2live icons run 20-22), outline (65,22,4) like the live icons, 9 colours at most, and shaded
in bands that stay apart in the mono LCD's four tones (luma breaks .25 / .5 / .65)."""

import pathlib
import sys

from PIL import Image, ImageDraw

OUT = (65, 22, 4)
INK = {
    "paper": (255, 247, 236),
    "paper_s": (214, 190, 156),
    "red": (220, 81, 45),
    "red_d": (150, 40, 28),
    "gold": (253, 203, 88),
    "gold_d": (200, 130, 30),
    "blue": (92, 140, 210),
    "blue_d": (40, 66, 130),
    "green": (110, 180, 90),
    "green_d": (40, 100, 60),
    "brown": (176, 104, 56),
    "brown_d": (110, 60, 30),
    "black": (50, 40, 60),
}


class Cv:
    def __init__(self):
        self.im = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def c(self, k):
        return INK[k] + (255,)

    def rect(self, x0, y0, x1, y1, k):
        self.d.rectangle([x0, y0, x1, y1], fill=self.c(k))

    def ell(self, x0, y0, x1, y1, k):
        self.d.ellipse([x0, y0, x1, y1], fill=self.c(k))

    def poly(self, pts, k):
        self.d.polygon(pts, fill=self.c(k))

    def line(self, pts, k, w=1):
        self.d.line(pts, fill=self.c(k), width=w)

    def px(self, pts, k):
        for x, y in pts:
            self.im.putpixel((x, y), self.c(k))

    def done(self):
        """Outline every transparent pixel that touches art (4-neighbours), then drop it on the 24 grid."""
        a = self.im.load()
        out = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
        o = out.load()
        for y in range(24):
            for x in range(24):
                if a[x, y][3]:
                    o[x, y] = a[x, y]
        for y in range(24):
            for x in range(24):
                if not a[x, y][3] and any(
                    0 <= x + dx < 24 and 0 <= y + dy < 24 and a[x + dx, y + dy][3]
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                ):
                    o[x, y] = OUT + (255,)
        return out


def exam_v1():  # a test paper: ruled lines and a red tick
    v = Cv()
    v.rect(5, 2, 17, 20, "paper")
    v.rect(15, 2, 17, 20, "paper_s")
    v.rect(5, 18, 17, 20, "paper_s")
    v.rect(7, 5, 13, 5, "blue_d")
    v.rect(7, 8, 13, 8, "blue")
    v.rect(7, 11, 11, 11, "blue")
    v.px([(11, 17), (12, 16), (13, 15), (14, 14), (15, 13), (10, 16), (9, 15)], "red")
    v.px([(11, 16), (12, 15), (13, 14), (14, 13), (10, 15), (9, 14)], "red")
    v.px([(10, 17), (11, 18)], "red_d")
    return v.done()


def exam_v2():  # a pencil over a card
    v = Cv()
    v.rect(3, 4, 15, 19, "paper")
    v.rect(3, 17, 15, 19, "paper_s")
    v.rect(5, 7, 12, 7, "blue_d")
    v.rect(5, 10, 12, 10, "blue")
    v.rect(5, 13, 9, 13, "blue")
    # pencil, slanted: body gold, ferrule gray, point
    v.poly([(14, 15), (19, 3), (22, 5), (17, 17)], "gold")
    v.poly([(17, 11), (19, 3), (22, 5), (19, 12)], "gold_d")
    v.poly([(14, 15), (17, 17), (13, 20)], "paper_s")
    v.px([(13, 20), (14, 19)], "black")
    v.poly([(19, 3), (22, 5), (21, 2)], "red")
    return v.done()


def match_v1():  # a ball: pale, dark patches, shaded low right
    v = Cv()
    v.ell(2, 2, 20, 20, "paper_s")
    v.ell(2, 2, 18, 18, "paper")
    v.poly([(10, 7), (14, 10), (13, 14), (7, 14), (6, 10)], "black")
    v.line([(10, 7), (10, 3)], "black")
    v.line([(14, 10), (19, 8)], "black")
    v.line([(13, 14), (16, 19)], "black")
    v.line([(7, 14), (4, 18)], "black")
    v.line([(6, 10), (3, 8)], "black")
    return v.done()


def match_v2():  # a pennant on a pole
    v = Cv()
    v.rect(4, 2, 5, 21, "brown")
    v.rect(5, 2, 5, 21, "brown_d")
    v.poly([(6, 3), (21, 8), (6, 14)], "red")
    v.poly([(6, 9), (21, 8), (6, 14)], "red_d")
    v.poly([(8, 7), (12, 8), (8, 10)], "paper")
    return v.done()


def show_v1():  # a ticket with a star
    v = Cv()
    v.poly([(2, 5), (21, 5), (21, 9), (19, 11), (21, 13), (21, 18), (2, 18), (2, 13), (4, 11), (2, 9)], "gold")
    v.rect(2, 15, 21, 18, "gold_d")
    v.rect(15, 5, 15, 18, "gold_d")
    v.px([(15, y) for y in range(6, 18, 2)], "gold")
    # star
    v.poly([(8, 7), (9, 10), (12, 10), (10, 12), (11, 15), (8, 13), (5, 15), (6, 12), (4, 10), (7, 10)], "red_d")
    v.px([(8, 9), (8, 10), (7, 10), (9, 10)], "gold")
    return v.done()


def show_v2():  # stage curtains, a star between
    v = Cv()
    v.rect(2, 2, 21, 4, "red_d")
    v.rect(2, 4, 21, 19, "blue_d")
    v.poly([(2, 4), (9, 4), (7, 19), (2, 19)], "red")
    v.poly([(21, 4), (14, 4), (16, 19), (21, 19)], "red")
    v.rect(4, 4, 4, 19, "red_d")
    v.rect(19, 4, 19, 19, "red_d")
    v.poly([(11, 6), (12, 10), (16, 10), (13, 13), (14, 17), (11, 14), (8, 17), (9, 13), (6, 10), (10, 10)], "gold")
    v.rect(2, 20, 21, 21, "brown")
    return v.done()


def trip_v1():  # a suitcase
    v = Cv()
    v.rect(9, 2, 14, 5, "brown_d")
    v.rect(11, 4, 12, 5, "brown")
    v.rect(2, 6, 21, 20, "red")
    v.rect(2, 16, 21, 20, "red_d")
    v.rect(2, 6, 21, 7, "red")
    v.rect(5, 6, 6, 20, "gold_d")
    v.rect(17, 6, 18, 20, "gold_d")
    v.rect(10, 11, 13, 14, "gold")
    v.rect(11, 12, 12, 13, "gold_d")
    return v.done()


def trip_v2():  # a map pin over a dotted road
    v = Cv()
    v.ell(5, 2, 18, 15, "red")
    v.poly([(6, 11), (17, 11), (11, 21)], "red")
    v.ell(5, 2, 18, 15, "red")
    v.poly([(13, 8), (18, 10), (16, 14), (11, 17), (12, 20), (11, 21), (6, 11), (9, 14)], "red_d")
    v.ell(5, 2, 18, 15, "red")
    v.ell(8, 5, 15, 12, "paper")
    v.ell(10, 7, 13, 10, "red_d")
    v.px([(7, 5), (6, 6), (6, 7)], "paper")
    return v.done()


def party_v1():  # a balloon on a string
    v = Cv()
    v.ell(4, 1, 17, 15, "red")
    v.poly([(9, 14), (13, 14), (11, 17)], "red")
    v.ell(8, 5, 17, 15, "red_d")
    v.ell(5, 1, 14, 12, "red")
    v.px([(7, 4), (6, 5), (6, 6), (7, 3), (8, 3)], "paper")
    v.px([(11, 17)], "red_d")
    v.line([(11, 17), (9, 18), (13, 20), (11, 22)], "black")
    return v.done()


def party_v2():  # a party hat with a pom
    v = Cv()
    v.poly([(11, 3), (3, 20), (19, 20)], "blue")
    v.poly([(11, 3), (19, 20), (13, 20)], "blue_d")
    v.poly([(8, 11), (15, 11), (16, 14), (6, 14)], "gold")
    v.poly([(4, 18), (18, 18), (19, 20), (3, 20)], "gold")
    v.px([(9, 8), (12, 8), (8, 16), (13, 16), (10, 12)], "paper")
    v.ell(9, 0, 13, 4, "red")
    v.px([(9, 1)], "paper")
    return v.done()


def lesson_v1():  # an open book
    v = Cv()
    v.poly([(2, 5), (11, 7), (11, 20), (2, 18)], "paper")
    v.poly([(21, 5), (12, 7), (12, 20), (21, 18)], "paper_s")
    v.rect(11, 7, 12, 20, "brown_d")
    v.rect(2, 18, 11, 18, "blue")
    for y in (10, 12, 14):
        v.line([(4, y), (9, y + 1)], "blue")
        v.line([(14, y + 1), (19, y)], "blue_d")
    v.poly([(2, 18), (11, 20), (12, 20), (21, 18), (21, 20), (12, 22), (11, 22), (2, 20)], "blue_d")
    return v.done()


def lesson_v2():  # a chalkboard with a note
    v = Cv()
    v.rect(2, 3, 21, 17, "brown")
    v.rect(4, 5, 19, 15, "green_d")
    v.px([(5, 6), (6, 5)], "green")
    v.rect(6, 8, 10, 8, "paper")
    v.rect(6, 11, 12, 11, "paper")
    v.rect(15, 7, 15, 11, "paper")
    v.ell(12, 10, 15, 12, "paper")
    v.rect(15, 7, 17, 8, "paper")
    v.rect(8, 18, 15, 19, "paper")
    v.rect(2, 17, 21, 17, "brown_d")
    v.rect(16, 18, 18, 19, "gold")
    return v.done()


TAGS = {
    "exam": (exam_v1, exam_v2),
    "match": (match_v1, match_v2),
    "show": (show_v1, show_v2),
    "trip": (trip_v1, trip_v2),
    "party": (party_v1, party_v2),
    "lesson": (lesson_v1, lesson_v2),
}
NAMES = [f"icon_sticker_{t}_v{i}" for t in TAGS for i in (1, 2)]


def draw_all():
    return {f"icon_sticker_{t}_v{i + 1}": f() for t, fs in TAGS.items() for i, f in enumerate(fs)}


if __name__ == "__main__":
    here = pathlib.Path(__file__).resolve().parent
    sys.path.insert(0, str(here))
    repo = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here.parents[1]
    import importlib.util

    spec = importlib.util.spec_from_file_location("cut_ui_lib", here / "cut_ui.py")
    # cut_ui.py runs its CLI at import; call its pieces through a plain re-read instead
    src = (here / "cut_ui.py").read_text().split("\nif len(sys.argv) > 1 and sys.argv[1]")[0]
    ns = {"__name__": "cut_ui_lib", "__file__": str(here / "cut_ui.py")}
    exec(compile(src, "cut_ui.py", "exec"), ns)
    for n, im in draw_all().items():
        ns["lib_dest"](repo, "f", n).parent.mkdir(parents=True, exist_ok=True)
        ns["save4"](im.resize((96, 96), Image.NEAREST), ns["lib_dest"](repo, "f", n))
    ns["lib_contact"]("f", repo)
