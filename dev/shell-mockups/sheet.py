"""Contact sheet: python3 sheet.py out.png cols height file... (each tile scaled to height)."""
import pathlib, sys
from PIL import Image, ImageDraw

out, cols, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
files = [pathlib.Path(f) for f in sys.argv[4:]]
tiles = []
for f in files:
    im = Image.open(f).convert("RGB")
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    tiles.append((f.stem, im))
w = max(t.width for _, t in tiles)
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 8), rows * (h + 22)), "#ece6da")
d = ImageDraw.Draw(sheet)
for i, (name, im) in enumerate(tiles):
    x, y = (i % cols) * (w + 8), (i // cols) * (h + 22)
    sheet.paste(im, (x + (w - im.width) // 2, y))
    d.text((x + 2, y + h + 4), name, fill="#30291f")
sheet.save(out)
