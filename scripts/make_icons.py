#!/usr/bin/env python3
"""Generate the PWA icon set.

Committed rather than hand-made so the icons can be regenerated at any size
without hunting for a source file. Draws the same motif as the site header —
lucide's `Waves` glyph on sky-600 — because `og-image.png` is a 548x289
placeholder of the Think Design logo and squashes badly into a square.

    python3 scripts/make_icons.py

Requires Pillow (system python3 has it; it is NOT in requirements.txt because
the scraper does not need it and refresh.sh must stay lean).
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

SKY_600 = (2, 132, 199)
WHITE = (255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SS = 4  # supersample factor, for antialiasing


def wave_points(size, cy, amp, periods=1.5, phase=0.0, x0=0.0, x1=1.0):
    pts = []
    steps = 900
    for i in range(steps + 1):
        t = x0 + (x1 - x0) * i / steps
        x = t * size
        y = cy + amp * math.sin(2 * math.pi * periods * t + phase)
        pts.append((x, y))
    return pts


def draw_icon(size, inset=0.0, rounded=False):
    """inset shrinks the glyph toward the centre, for maskable safe zones."""
    s = size * SS
    img = Image.new("RGB", (s, s), SKY_600)
    d = ImageDraw.Draw(img)

    scale = 1.0 - 2 * inset
    stroke = max(2, int(s * 0.085 * scale))
    amp = s * 0.052 * scale
    span = 0.74 * scale
    x0, x1 = 0.5 - span / 2, 0.5 + span / 2

    # Stamp overlapping discs along the path rather than calling line() with a
    # thick width: PIL seams each segment of a dense polyline, which shows up as
    # a comb/hatched edge on a stroke this heavy. Stamping also gives round caps
    # and joins for free.
    r = stroke / 2
    for dy in (-0.145, 0.0, 0.145):
        cy = s * (0.5 + dy * scale)
        for cx, cyy in wave_points(s, cy, amp, periods=1.5, x0=x0, x1=x1):
            d.ellipse([cx - r, cyy - r, cx + r, cyy + r], fill=WHITE)

    if rounded:
        mask = Image.new("L", (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=255)
        out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        out.paste(img, mask=mask)
        img = out

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    written = []
    for name, size, kw in [
        ("icon-192.png", 192, {}),
        ("icon-512.png", 512, {}),
        # Maskable icons get cropped to a circle by the launcher; keep the
        # glyph inside the middle 80% so nothing important is shaved off.
        ("icon-maskable-192.png", 192, {"inset": 0.10}),
        ("icon-maskable-512.png", 512, {"inset": 0.10}),
        # iOS does not apply a mask and shows the image as-is on the home
        # screen, so this one is pre-rounded and must stay opaque.
        ("apple-touch-icon.png", 180, {}),
        ("favicon-32.png", 32, {}),
    ]:
        p = OUT / name
        draw_icon(size, **kw).save(p)
        written.append(f"{name} ({size}x{size})")
    print("wrote " + str(OUT))
    for w in written:
        print("  " + w)


if __name__ == "__main__":
    main()
