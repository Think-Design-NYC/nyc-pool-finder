#!/usr/bin/env python3
"""Generate src/nycMap.js — the flat borough map behind the homepage map pane
and the pool pages' "Getting there" map.

Source: NYC Open Data "Borough Boundaries" (gthc-hcne), the shoreline-clipped
version, so land is land and the rivers come out as gaps. The map is drawn
once here and committed; nothing fetches tiles or geodata at runtime, which is
why the map works offline and makes no third-party requests.

    python3 scripts/make_map.py                    # download, then generate
    python3 scripts/make_map.py boroughs.geojson   # use a file you already have

Standard library only (like make_icons.py, it is not part of the scraper's
requirements). Rerun it only if the view box or simplification changes —
borough outlines don't move.
"""

import json
import math
import sys
import tempfile
import urllib.request
from pathlib import Path

SOURCE = "https://data.cityofnewyork.us/resource/gthc-hcne.geojson"
OUT = Path(__file__).resolve().parent.parent / "src" / "nycMap.js"

# The view: every pool with room to spare. Staten Island has no indoor pool,
# so it is only the corner of the frame.
WEST, EAST = -74.04, -73.73
SOUTH, NORTH = 40.615, 40.885
WIDTH = 1000  # view box units; height follows from the projection

# Equirectangular, corrected for latitude — at city scale this is
# indistinguishable from Web Mercator and keeps the maths in one line.
LAT0 = (SOUTH + NORTH) / 2
KX = math.cos(math.radians(LAT0))
SCALE = WIDTH / ((EAST - WEST) * KX)
HEIGHT = round((NORTH - SOUTH) * SCALE)

TOLERANCE = 0.9  # view box units for Douglas–Peucker (~25 m)
MIN_AREA = 12.0  # drop islets smaller than this many square units

# New Jersey isn't in a dataset of NYC boroughs, but without it everything west
# of the Hudson reads as open sea. This is a rough, hand-traced line along the
# Hudson's west bank (lat, lng), closed off beyond the frame — context only,
# drawn fainter than the boroughs and never used to place anything.
NEW_JERSEY = [
    (40.900, -73.918), (40.870, -73.935), (40.845, -73.951), (40.820, -73.966),
    (40.800, -73.982), (40.780, -73.998), (40.760, -74.012), (40.745, -74.022),
    (40.728, -74.028), (40.712, -74.032), (40.700, -74.038), (40.690, -74.046),
    (40.660, -74.060), (40.640, -74.080), (40.600, -74.100), (40.600, -74.200),
    (40.900, -74.200),
]

# Where each borough's name sits, in lat/lng.
LABELS = {
    "Manhattan": (40.7835, -73.9665),
    "Brooklyn": (40.6505, -73.9480),
    "Queens": (40.7280, -73.8130),
    "Bronx": (40.8550, -73.8750),
    "Staten Island": (40.6230, -74.0300),
}


def project(lat, lng):
    return ((lng - WEST) * KX * SCALE, (NORTH - lat) * SCALE)


def perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(x - x1, y - y1)
    return abs(dy * x - dx * y + x2 * y1 - y2 * x1) / math.hypot(dx, dy)


def simplify(pts, tol):
    """Douglas–Peucker, iterative so long shorelines don't hit the recursion limit."""
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, idx = 0.0, None
        for k in range(i + 1, j):
            d = perp(pts[k], pts[i], pts[j])
            if d > best:
                best, idx = d, k
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def area(pts):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2


def ring_path(pts):
    head = f"M{pts[0][0]:.1f} {pts[0][1]:.1f}"
    return head + "".join(f"L{x:.1f} {y:.1f}" for x, y in pts[1:]) + "Z"


def main():
    if len(sys.argv) > 1:
        src = Path(sys.argv[1])
    else:
        src = Path(tempfile.mkdtemp()) / "boroughs.geojson"
        urllib.request.urlretrieve(SOURCE, src)
    data = json.loads(src.read_text())

    boroughs = []
    for f in sorted(data["features"], key=lambda f: f["properties"]["boroname"]):
        name = f["properties"]["boroname"]
        parts = []
        for polygon in f["geometry"]["coordinates"]:
            for ring in polygon:
                pts = simplify([project(lat, lng) for lng, lat in ring], TOLERANCE)
                if len(pts) >= 4 and area(pts) >= MIN_AREA:
                    parts.append(ring_path(pts[:-1]))
        lx, ly = project(*LABELS[name])
        boroughs.append({"name": name, "d": "".join(parts), "label": [round(lx), round(ly)]})

    nj = [project(lat, lng) for lat, lng in NEW_JERSEY]
    # Right-aligned against the shore (the component anchors context labels at
    # their end), so it stays readable however tightly the view frames Manhattan.
    nj_label = [round(v) for v in project(40.805, -73.992)]

    projection = {
        "west": WEST,
        "north": NORTH,
        "kx": round(KX, 6),
        "scale": round(SCALE, 3),
    }
    body = json.dumps(
        {
            "width": WIDTH,
            "height": HEIGHT,
            "projection": projection,
            "boroughs": boroughs,
            "context": [{"name": "New Jersey", "d": ring_path(nj), "label": nj_label}],
        },
        separators=(",", ":"),
    )
    OUT.write_text(
        "// Generated by scripts/make_map.py from NYC Open Data \"Borough Boundaries\"\n"
        "// (gthc-hcne). Do not edit by hand — rerun the script.\n"
        f"export const NYC_MAP = {body}\n\n"
        "// lat/lng -> [x, y] in the map's view box (same projection the outlines used).\n"
        "export function projectToMap(lat, lng) {\n"
        "  const { west, north, kx, scale } = NYC_MAP.projection\n"
        "  return [(lng - west) * kx * scale, (north - lat) * scale]\n"
        "}\n"
    )
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
