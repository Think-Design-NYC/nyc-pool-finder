#!/usr/bin/env python3
"""Generate the PWA icon set.

Committed rather than hand-made so the icons can be regenerated at any size
without hunting for a source file. Draws the Figma "Logo/App icon" — a white
map pin with two tile-blue waves and a lane-red dot on tile blue — from the
Figma path data. src/components/LogoMark.jsx is the header variant (blue pin,
white waves). `og-image.png` is a placeholder of the Think Design logo and
squashes badly into a square, so it is not used here.

    python3 scripts/make_icons.py

Requires Pillow (system python3 has it; it is NOT in requirements.txt because
the scraper does not need it and refresh.sh must stay lean).
"""
from pathlib import Path

from PIL import Image, ImageDraw

TILE_BLUE = (22, 104, 227)  # #1668e3
LANE_RED = (242, 84, 45)  # #f2542d
WHITE = (255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SS = 4  # supersample factor, for antialiasing

# Path data from the Figma app icon, on its 96x96 artboard. Each entry is a
# cubic Bezier segment: (start, control 1, control 2, end).
PIN = [
    ((48, 18), (35.4667, 18), (25.3333, 27.8667), (25.3333, 40.1333)),
    ((25.3333, 40.1333), (25.3333, 56.1333), (48, 74), (48, 74)),
    ((48, 74), (48, 74), (70.6667, 56.1333), (70.6667, 40.1333)),
    ((70.6667, 40.1333), (70.6667, 27.8667), (60.5333, 18), (48, 18)),
]
WAVES = [
    [
        ((34, 38.6667), (37.4667, 38.6667), (37.4667, 35.4667), (41, 35.4667)),
        ((41, 35.4667), (44.5333, 35.4667), (44.4667, 38.6667), (48, 38.6667)),
        ((48, 38.6667), (51.5333, 38.6667), (51.4667, 35.4667), (55, 35.4667)),
        ((55, 35.4667), (58.5333, 35.4667), (58.4667, 38.6667), (62, 38.6667)),
    ],
    [
        ((36.6667, 48.6667), (39.4667, 48.6667), (39.4667, 45.7333), (42.2667, 45.7333)),
        ((42.2667, 45.7333), (45.0667, 45.7333), (45.0667, 48.6667), (48, 48.6667)),
        ((48, 48.6667), (50.9333, 48.6667), (50.8, 45.7333), (53.6, 45.7333)),
        ((53.6, 45.7333), (56.4, 45.7333), (56.4, 48.6667), (59.3333, 48.6667)),
    ],
]
DOT = ((48, 26.6667), 3.4667)
WAVE_STROKE = 3


def bezier(seg, steps=200):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = seg
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        yield (
            u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3,
            u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3,
        )


def draw_icon(size, inset=0.0, rounded=False):
    """inset shrinks the glyph toward the centre, for maskable safe zones."""
    s = size * SS
    img = Image.new("RGB", (s, s), TILE_BLUE)
    d = ImageDraw.Draw(img)

    # Artboard units -> pixels, scaled about the centre for the inset.
    k = s / 96 * (1.0 - 2 * inset)
    off = s * inset

    def pt(x, y):
        return (off + x * k, off + y * k)

    d.polygon([pt(x, y) for seg in PIN for x, y in bezier(seg)], fill=WHITE)

    # Stamp overlapping discs along the path rather than calling line() with a
    # thick width: PIL seams each segment of a dense polyline, which shows up as
    # a comb/hatched edge on a stroke this heavy. Stamping also gives round caps
    # and joins for free.
    r = WAVE_STROKE * k / 2
    for wave in WAVES:
        for seg in wave:
            for x, y in bezier(seg):
                cx, cy = pt(x, y)
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TILE_BLUE)

    (dx, dy), dr = DOT
    cx, cy = pt(dx, dy)
    d.ellipse([cx - dr * k, cy - dr * k, cx + dr * k, cy + dr * k], fill=LANE_RED)

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
