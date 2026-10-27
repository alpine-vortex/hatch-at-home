"""Head points for trait flair: where the top of each creature's head is.

Usage: heads.py <sprites folder> <out.png> [species=stage:x,y ...]

For every ready species and stage it reads `{stage}_content_1.png`, estimates
the head point (the middle of the topmost run of solid rows, ignoring thin
bits like a tail tip or antennae), and draws a contact sheet with that point
marked (red cross) so it can be checked by eye. Overrides from the command line
(`squirrel=child:120,60`) replace an estimate. Prints the "head" maps to paste
into each species.json, in 256 px frame coordinates; a point is the middle of
the head, x across, y at its top.
"""

import json
import os
import sys

from PIL import Image, ImageDraw

STAGES = ("baby", "child", "teen", "adult")
MIN_RUN = 18  # a row needs this many solid pixels in a run to count as body


def estimate(im: Image.Image) -> tuple[int, int]:
    a = im.getchannel("A")
    w, h = im.size
    for y in range(h):
        runs, run, start = [], 0, 0
        for x in range(w):
            if a.getpixel((x, y)) > 40:
                if not run:
                    start = x
                run += 1
            else:
                if run:
                    runs.append((run, start))
                run = 0
        if run:
            runs.append((run, start))
        wide = [r for r in runs if r[0] >= MIN_RUN]
        if wide:
            # The highest row with a solid run: the crown of the head, unless a
            # tail rises higher, which the override handles.
            length, start = max(wide)
            return start + length // 2, y
    return w // 2, 0


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    overrides: dict[tuple[str, str], tuple[int, int]] = {}
    for arg in sys.argv[3:]:
        sp, rest = arg.split("=")
        stage, xy = rest.split(":")
        x, y = (int(v) for v in xy.split(","))
        overrides[(sp, stage)] = (x, y)
    species = sorted(
        d
        for d in os.listdir(src)
        if os.path.isfile(os.path.join(src, d, "species.json"))
        and json.load(open(os.path.join(src, d, "species.json"))).get("ready")
    )
    cell = 160
    sheet = Image.new("RGB", (cell * len(STAGES), (cell + 14) * len(species)), (58, 40, 56))
    draw = ImageDraw.Draw(sheet)
    result: dict[str, dict[str, list[int]]] = {}
    for row, sp in enumerate(species):
        meta = json.load(open(os.path.join(src, sp, "species.json")))
        for col, stage in enumerate(STAGES):
            drawn = stage if stage in meta.get("stages", []) else None
            path = os.path.join(src, sp, f"{drawn}_content_1.png") if drawn else None
            if not path or not os.path.exists(path):
                continue
            im = Image.open(path).convert("RGBA")
            x, y = overrides.get((sp, stage), estimate(im))
            result.setdefault(sp, {})[stage] = [x, y]
            s = cell / im.size[0]
            tile = im.resize((cell, cell), Image.NEAREST)
            ox, oy = col * cell, row * (cell + 14)
            sheet.paste((90, 70, 88), (ox, oy, ox + cell, oy + cell))
            sheet.paste(tile, (ox, oy), tile)
            cx, cy = ox + x * s, oy + y * s
            draw.line((cx - 6, cy, cx + 6, cy), fill=(255, 40, 40), width=2)
            draw.line((cx, cy - 6, cx, cy + 6), fill=(255, 40, 40), width=2)
            draw.text((ox + 3, oy + cell + 1), f"{sp} {stage} {x},{y}", fill=(230, 230, 230))
    sheet.save(out)
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
