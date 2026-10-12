#!/usr/bin/env python3
"""Build data/pool_meta.json: coordinates, neighborhood and nearby transit.

Location data is stable — a pool does not move — so it lives in a committed,
hand-reviewed file merged onto the pools at build time (src/poolMeta.js), NOT
in scraper.py. See HANDOFF.md "Step 4" for why it must stay off the fragile
daily scrape path.

Run by hand when a pool is added or an address changes, then review the diff:
a wrong coordinate sends someone to the wrong borough and nothing downstream
can detect it.

    python3 scripts/make_pool_meta.py

Sources (no API keys needed):
  - NYC Planning Labs GeoSearch — coordinates and neighborhood
  - US Census geocoder — a second opinion on the coordinates; a disagreement
    over CROSSCHECK_MILES is printed for review, never silently accepted
  - MTA Subway Stations (data.ny.gov 39hk-dx4f) — station complexes and
    daytime routes
  - MTA GTFS feeds — LIRR stations, and the bus routes that actually stop
    near each pool (from stop_times, not route maps). The bus feeds are large
    (~60 MB) and are cached in /tmp between runs.

Distances are straight-line miles, and are labelled that way on the site.
Stdlib only, so system python3 runs it.
"""
import csv
import io
import json
import math
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "pool_meta.json"
CROSSCHECK_MILES = 0.1
SUBWAYS_PER_POOL = 3
# An LIRR station further than this isn't a sensible way to reach the pool.
LIRR_MILES = 1.0
# Bus stops within this of the pool — a few blocks' walk. Where none are
# (Flushing Meadows sits inside the park), widen to BUS_FALLBACK_MILES, about a
# 10-minute walk, and record the radius so the page can say which it is.
BUS_MILES = 0.25
BUS_FALLBACK_MILES = 0.5
# Express commuter buses (BM, QM, BxM, X…) run to Manhattan business districts
# at a premium fare; nobody takes one a few stops to a pool, and in Midtown
# they swamp the list. "+" routes are Select Bus Service and are kept.
EXPRESS_BUS = ("BM", "QM", "BXM", "X", "SIM")

GTFS_CACHE = Path("/tmp/nyc-pool-finder-gtfs")
LIRR_FEED = "https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip"
# NYCT bus by borough plus MTA Bus Company (which runs many Queens routes).
# No Staten Island feed: there is no indoor pool there.
BUS_FEEDS = [
    f"http://web.mta.info/developers/data/nyct/bus/google_transit_{b}.zip"
    for b in ("manhattan", "brooklyn", "queens", "bronx")
] + ["http://web.mta.info/developers/data/busco/google_transit.zip"]

# Parks lists some pools by intersection or inside a park; geocode these
# instead. Each was checked against the cross streets Parks publishes.
ADDRESS_OVERRIDES = {
    # "177th Street & Baisley Boulevard" — the rec center's street address.
    "Q448": "177-01 Baisley Boulevard, Queens, NY 11434",
}

# GeoSearch's neighborhood label, where it isn't what people search for.
NEIGHBORHOOD_OVERRIDES = {
    # GeoSearch says "Flushing Meadows"; the park's full name is the search term.
    "Q099": "Flushing Meadows–Corona Park",
}


def get_json(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def miles(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 2 * 3958.8 * math.asin(math.sqrt(h))


def geosearch(text):
    url = "https://geosearch.planninglabs.nyc/v2/search?" + urllib.parse.urlencode(
        {"text": text, "size": 1}
    )
    f = get_json(url)["features"][0]
    lon, lat = f["geometry"]["coordinates"]
    return (lat, lon), f["properties"].get("neighbourhood")


def census(text):
    url = (
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?"
        + urllib.parse.urlencode(
            {"address": text, "benchmark": "Public_AR_Current", "format": "json"}
        )
    )
    m = get_json(url)["result"]["addressMatches"]
    return (m[0]["coordinates"]["y"], m[0]["coordinates"]["x"]) if m else None


def station_complexes():
    rows = get_json("https://data.ny.gov/resource/39hk-dx4f.json?$limit=1000")
    complexes = {}
    for s in rows:
        c = complexes.setdefault(s["complex_id"], {"stops": [], "routes": []})
        c["stops"].append(
            (s["stop_name"], (float(s["gtfs_latitude"]), float(s["gtfs_longitude"])))
        )
        for r in s["daytime_routes"].split():
            if r not in c["routes"]:
                c["routes"].append(r)
    return list(complexes.values())


def gtfs(url):
    GTFS_CACHE.mkdir(exist_ok=True)
    path = GTFS_CACHE / url.replace("://", "_").replace("/", "_")
    if not path.exists():
        urllib.request.urlretrieve(url, path)
    return zipfile.ZipFile(path)


def gtfs_rows(feed, name):
    return csv.DictReader(io.TextIOWrapper(feed.open(name), encoding="utf-8-sig"))


def stop_point(s):
    return (float(s["stop_lat"]), float(s["stop_lon"]))


# Stations in the feed that shouldn't be offered as a way to reach a pool.
LIRR_EXCLUDE = {
    # A rail yard, not somewhere a passenger can board.
    "Hillside Facility",
    # Not excluded: Mets-Willets Point. It used to be served mainly on Mets /
    # US Open event days, but the Oct 2026 timetable stops ~87 trains there
    # every weekday and ~81 a day at weekends, same as its neighbours.
}


def lirr_stations():
    feed = gtfs(LIRR_FEED)
    return [
        (s["stop_name"], stop_point(s))
        for s in gtfs_rows(feed, "stops.txt")
        if s["stop_name"] not in LIRR_EXCLUDE
    ]


def nearest_lirr(point, stations, subway_miles):
    """The nearest LIRR station, but only where it beats the subway.

    Penn Station and Grand Central are LIRR stations within a mile of several
    Manhattan pools, but a subway stop is always closer there; listing them
    would read as advice to take the railroad across town."""
    d, name = min((miles(point, p), n) for n, p in stations)
    if d > LIRR_MILES or d >= subway_miles:
        return None
    return {"station": name, "miles": round(d, 2)}


def bus_routes_near(points):
    """{pool_code: {route: miles}} for routes stopping within BUS_FALLBACK_MILES."""
    found = {code: {} for code in points}
    for url in BUS_FEEDS:
        feed = gtfs(url)
        near = {}  # stop_id -> [(pool_code, miles)]
        for s in gtfs_rows(feed, "stops.txt"):
            sp = stop_point(s)
            for code, pt in points.items():
                d = miles(pt, sp)
                if d <= BUS_FALLBACK_MILES:
                    near.setdefault(s["stop_id"], []).append((code, d))
        route_of = {t["trip_id"]: t["route_id"] for t in gtfs_rows(feed, "trips.txt")}
        for st in gtfs_rows(feed, "stop_times.txt"):
            for code, d in near.get(st["stop_id"], ()):
                route = route_of.get(st["trip_id"])
                if not route or route.upper().startswith(EXPRESS_BUS):
                    continue
                if d < found[code].get(route, math.inf):
                    found[code][route] = d
    return found


def pick_buses(routes):
    """The routes to show, nearest stop first, and the radius they came from."""
    for radius in (BUS_MILES, BUS_FALLBACK_MILES):
        within = {r: d for r, d in routes.items() if d <= radius}
        if within:
            ordered = sorted(within.items(), key=lambda x: (round(x[1], 2), x[0]))
            return [r for r, _ in ordered], radius
    return [], None


def nearest_subways(point, complexes):
    ranked = []
    for c in complexes:
        stops = sorted(c["stops"], key=lambda s: miles(point, s[1]))
        # Name a complex by its stops nearest-first, e.g. "Lexington Av/53 St – 51 St".
        names = list(dict.fromkeys(name for name, _ in stops))
        ranked.append((miles(point, stops[0][1]), " – ".join(names), c["routes"]))
    ranked.sort(key=lambda x: x[0])
    return [
        {"station": name, "routes": routes, "miles": round(d, 2)}
        for d, name, routes in ranked[:SUBWAYS_PER_POOL]
    ]


def main():
    pools = json.loads((ROOT / "nyc_pools_live.json").read_text())
    complexes = station_complexes()
    lirr = lirr_stations()
    out = {}
    for p in sorted(pools, key=lambda p: p["pool_code"]):
        code, loc = p["pool_code"], p["location"]
        text = ADDRESS_OVERRIDES.get(
            code, f"{loc['address']}, {p['borough']}, NY {loc['zip_code']}"
        )
        point, hood = geosearch(text)
        second = census(text)
        if second and miles(point, second) > CROSSCHECK_MILES:
            print(f"REVIEW {code}: GeoSearch {point} vs Census {second}")
        elif not second:
            print(f"note {code}: no Census match, GeoSearch only — check by eye")
        out[code] = {
            "pool_name": p["pool_name"],
            "neighborhood": NEIGHBORHOOD_OVERRIDES.get(code, hood),
            "lat": round(point[0], 5),
            "lng": round(point[1], 5),
            "subway": nearest_subways(point, complexes),
        }
        out[code]["lirr"] = nearest_lirr(point, lirr, out[code]["subway"][0]["miles"])
    buses = bus_routes_near({code: (m["lat"], m["lng"]) for code, m in out.items()})
    for code, routes in buses.items():
        out[code]["buses"], out[code]["bus_miles"] = pick_buses(routes)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(out)} pools)")


if __name__ == "__main__":
    main()
