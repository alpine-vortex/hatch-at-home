"""Store PNGs with an exact colour palette, losslessly (smaller downloads).

Usage: palette.py <folder> [...]   (recursive; --check only reports)
       palette.py --lossy <file.png> [...]   (backgrounds: 256 colours)
Pixel art uses few colours but arrives as full-colour RGBA. A file with 256
colours or fewer is rewritten as a palette PNG with per-colour alpha, and kept
only if it decodes to exactly the same pixels (fully clear pixels count as
equal whatever their hidden colour) and is smaller. Anything else is left as is.

--lossy is for the painted backgrounds (thousands of colours): it reduces each
named file to its 256 best colours, without dithering (dither speckles pixel
art). The owner approved this for the backgrounds on 2026-10-27 after a
side-by-side; a new background should get the same look before it's reduced.
"""

import io
import os
import sys

import numpy as np
from PIL import Image


def visible(img: Image.Image) -> np.ndarray:
    a = np.array(img.convert("RGBA"))
    a[a[..., 3] == 0] = 0  # a fully clear pixel's colour never shows
    return a


def palette_png(path: str) -> bytes | None:
    img = Image.open(path)
    rgba = img.convert("RGBA")
    pixels = visible(rgba)
    colours = np.unique(pixels.reshape(-1, 4), axis=0)
    if len(colours) > 256:
        return None
    # Build the palette by hand so it is exact (no quantizer rounding).
    index = {tuple(c): i for i, c in enumerate(colours)}
    flat = pixels.reshape(-1, 4)
    idx = np.fromiter((index[tuple(c)] for c in flat), np.uint8, len(flat))
    out = Image.frombytes("P", rgba.size, idx.tobytes())
    out.putpalette(colours[:, :3].flatten().tolist(), rawmode="RGB")
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True, transparency=bytes(colours[:, 3].tolist()))
    data = buf.getvalue()
    if not np.array_equal(visible(Image.open(io.BytesIO(data))), pixels):
        return None  # not exact: keep the original
    return data


def lossy_png(path: str) -> bytes:
    img = Image.open(path).convert("RGB")
    out = img.quantize(
        colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    )
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    if "--lossy" in sys.argv:
        before = after = 0
        for path in (a for a in sys.argv[1:] if a != "--lossy"):
            data, size = lossy_png(path), os.path.getsize(path)
            before += size
            if len(data) < size:
                with open(path, "wb") as f:
                    f.write(data)
                size = len(data)
            after += size
        print(f"backgrounds: {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB")
        return
    check = "--check" in sys.argv
    folders = [a for a in sys.argv[1:] if a != "--check"]
    before = after = done = 0
    for folder in folders:
        for root, _, files in os.walk(folder):
            for name in sorted(files):
                if not name.endswith(".png"):
                    continue
                path = os.path.join(root, name)
                size = os.path.getsize(path)
                data = palette_png(path)
                before += size
                if data is None or len(data) >= size:
                    after += size
                    continue
                after += len(data)
                done += 1
                if not check:
                    with open(path, "wb") as f:
                        f.write(data)
    verb = "would shrink" if check else "shrank"
    print(f"{verb} {done} files: {before / 1048576:.2f} MB -> {after / 1048576:.2f} MB")


if __name__ == "__main__":
    main()
