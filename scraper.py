import json
import re
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup, Comment
from pydantic import BaseModel
from typing import Dict, List, Optional

BASE_URL = "https://www.nycgovparks.org"
LISTING_URL = f"{BASE_URL}/facilities/indoor-pools"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

TAB_ID_TO_BOROUGH = {
    "M": "Manhattan",
    "B": "Brooklyn",
    "Q": "Queens",
    "X": "Bronx",
}

POOL_CODE_RE = re.compile(r"/parks/([A-Z0-9]+)/facilities/indoor-pools")
DAY_DATE_SUFFIX_RE = re.compile(r"\s+\d+/\d+\s*$")
PHONE_RE = re.compile(r"\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}")

# "Brooklyn, NY 11213" — the mailing city varies by borough (New York,
# Brooklyn, Flushing, Bronx…), so don't assume "New York". The state is
# usually "NY" but some pages spell it out ("Brooklyn, New York 11210").
CITY_STATE_ZIP_RE = re.compile(r"^(.+?),\s*(NY|New York)\s+(\d{5})\b", re.IGNORECASE)

# Site-wide promos that land in the same alert box as real closures. These are
# marketing, not "can I swim today" information.
NOTICE_NOISE_RE = re.compile(r"membership extension", re.IGNORECASE)

# The pool detail page states this when the pool sits inside a recreation
# center you have to join. True for nearly every indoor pool.
MEMBERSHIP_RE = re.compile(
    r"you must have a[^.]{0,60}?Recreation Center membership", re.IGNORECASE
)


class Schedule(BaseModel):
    session_type: str
    days: str
    time: str


class Location(BaseModel):
    address: str
    cross_streets: Optional[str] = None
    city: str = "New York"
    state: str = "NY"
    zip_code: Optional[str] = None
    # {"Monday_Friday": "7:00 AM - 8:00 PM", "Saturday": "8:00 AM - 4:00 PM"}
    building_hours: Optional[Dict[str, str]] = None


class PoolData(BaseModel):
    borough: str
    pool_name: str
    pool_code: str
    status: str
    location: Optional[Location] = None
    phone: Optional[str] = None
    url: Optional[str] = None
    membership_required: Optional[bool] = None
    notes: Optional[str] = None
    schedules: List[Schedule] = []


def fetch(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_address_block(soup: BeautifulSoup) -> dict:
    """Street address, city/state/zip and cross streets from a rec center page.

    The block is unlabelled markup — bare text nodes followed by a
    "Cross Streets:" <strong> — so anchor on that <strong> and read backwards:

        430 West 25th Street<br>
        New York, NY 10001<br />
        <strong>Cross Streets:</strong> <p>9th & 10th avenues</p>
    """
    marker = next(
        (
            s for s in soup.find_all("strong")
            if s.get_text(strip=True).lower().startswith("cross streets")
        ),
        None,
    )
    if not marker or not marker.parent:
        return {}

    lines = []
    for child in marker.parent.children:
        if child is marker:
            break
        if isinstance(child, str) and child.strip():
            lines.append(child.strip())

    out = {}
    if lines:
        out["address"] = lines[0]
    if len(lines) > 1:
        m = CITY_STATE_ZIP_RE.match(lines[1])
        if m:
            out["city"] = m.group(1).strip()
            out["state"] = "NY"
            out["zip_code"] = m.group(3)

    cross = marker.find_next("p")
    if cross:
        text = cross.get_text(" ", strip=True)
        if text:
            out["cross_streets"] = text
    return out


def parse_building_hours(soup: BeautifulSoup) -> Optional[Dict[str, str]]:
    """Building hours, keyed so the UI can render "Monday – Friday".

        <h2>Building Hours</h2>
        <p><strong>Monday - Friday: </strong><br /> 7:00 AM - 8:00 PM <br />…
    """
    heading = next(
        (
            h for h in soup.find_all(["h2", "h3"])
            if h.get_text(strip=True).lower() == "building hours"
        ),
        None,
    )
    if not heading:
        return None
    block = heading.find_next("p")
    if not block:
        return None

    hours: Dict[str, str] = {}
    label: Optional[str] = None
    parts: List[str] = []

    def flush():
        if label and parts:
            hours[label] = " ".join(parts).strip()

    for child in block.children:
        name = getattr(child, "name", None)
        if name == "strong":
            # The trailing "Holiday Hours" <strong> wraps a link, not a day.
            if child.find("a"):
                break
            flush()
            label = (
                child.get_text(" ", strip=True)
                .rstrip(":")
                .strip()
                .replace(" - ", "_")
            )
            parts = []
        elif name == "br":
            continue
        elif isinstance(child, str) and child.strip():
            parts.append(child.strip())
    flush()

    return hours or None


def parse_facility(pool_code: str) -> dict:
    """Location + hours + closure notices from the recreation center page."""
    url = f"{BASE_URL}/facilities/recreationcenters/{pool_code}"
    try:
        html = fetch(url)
    except requests.RequestException as e:
        print(f"  Could not fetch facility page for {pool_code}: {e}")
        return {}

    soup = BeautifulSoup(html, "html.parser")
    details = parse_address_block(soup)

    hours = parse_building_hours(soup)
    if hours:
        details["building_hours"] = hours

    # `alert-error` carries closures and access restrictions. `alert-success`
    # is general news and a bare `alert` is the membership-login promo — both
    # are noise on a "can I swim today" page.
    notices = [
        re.sub(r"\s+", " ", d.get_text(" ", strip=True))
        for d in soup.find_all("div", class_="alert-error")
    ]
    notices = [n for n in notices if n and not NOTICE_NOISE_RE.search(n)]
    if notices:
        details["notes"] = " ".join(notices)[:400]

    return details


def parse_pool_detail(pool_code: str) -> dict:
    """Membership requirement, from the pool's own detail page."""
    url = f"{BASE_URL}/parks/{pool_code}/facilities/indoor-pools"
    try:
        html = fetch(url)
    except requests.RequestException as e:
        print(f"  Could not fetch detail page for {pool_code}: {e}")
        return {}

    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    return {"membership_required": bool(MEMBERSHIP_RE.search(text))}


def parse_schedule(pool_code: str) -> List[Schedule]:
    url = f"{BASE_URL}/facilities/recreationcenters/{pool_code}/schedule"
    try:
        html = fetch(url)
    except requests.RequestException as e:
        print(f"  Could not fetch schedule for {pool_code}: {e}")
        return []

    soup = BeautifulSoup(html, "html.parser")
    pool_heading = next(
        (
            h for h in soup.find_all(["h2", "h3"])
            if "pool" in h.get_text().lower() and "schedule" in h.get_text().lower()
        ),
        None,
    )
    if not pool_heading:
        return []

    table = pool_heading.find_next("table", class_="schedule-table")
    if not table:
        return []

    rows = table.find_all("tr")
    if len(rows) < 2:
        return []

    day_headers = [c.get_text(" ", strip=True) for c in rows[0].find_all(["th", "td"])]
    day_columns = rows[1].find_all("td")

    schedules: List[Schedule] = []
    for day_label, cell in zip(day_headers, day_columns):
        day = DAY_DATE_SUFFIX_RE.sub("", day_label).strip()
        for program in cell.find_all("p", class_="program"):
            link = program.find("a", class_="program-popup")
            if not link:
                continue
            session_type = link.get_text(" ", strip=True)
            # Time sits as direct text in the <p> before the <a>
            time_text = ""
            for child in program.children:
                if getattr(child, "name", None) == "a":
                    break
                if isinstance(child, str):
                    time_text += child
                elif child.name == "br":
                    continue
                else:
                    time_text += child.get_text(" ", strip=True)
            time_text = time_text.strip()
            schedules.append(Schedule(
                session_type=session_type,
                days=day,
                time=time_text,
            ))
    return schedules


def scrape_nyc_pools() -> List[dict]:
    print(f"Fetching listing: {LISTING_URL}")
    html = fetch(LISTING_URL)
    soup = BeautifulSoup(html, "html.parser")

    all_pools: List[dict] = []

    for pane in soup.find_all("div", class_="tab-pane"):
        pane_id = pane.get("id")
        borough = TAB_ID_TO_BOROUGH.get(pane_id)
        if not borough:
            continue

        poolboxes = pane.find_all("div", class_="poolbox")
        print(f"{borough}: found {len(poolboxes)} pools")

        for box in poolboxes:
            name_tag = box.find("h4")
            if not name_tag:
                continue
            pool_name = name_tag.get_text(strip=True)

            details_link = box.find("a", href=POOL_CODE_RE)
            pool_code = ""
            if details_link:
                m = POOL_CODE_RE.search(details_link["href"])
                if m:
                    pool_code = m.group(1)

            # Address sits as a text node between the h4 and the first <br>.
            address_parts: List[str] = []
            for sib in name_tag.next_siblings:
                if getattr(sib, "name", None) == "br":
                    break
                if isinstance(sib, str):
                    address_parts.append(sib.strip())
            address = " ".join(p for p in address_parts if p)

            # The listing only gives a rough location ("West 25th St. between
            # 9th & 10th Aves"). The recreation center page has the real
            # street address, zip, cross streets and building hours — worth
            # the extra request per pool, including for closed ones.
            details = parse_facility(pool_code) if pool_code else {}
            details.update(parse_pool_detail(pool_code) if pool_code else {})

            street = details.get("address") or address
            location = (
                Location(
                    address=street,
                    cross_streets=details.get("cross_streets"),
                    city=details.get("city", "New York"),
                    state=details.get("state", "NY"),
                    zip_code=details.get("zip_code"),
                    building_hours=details.get("building_hours"),
                )
                if street
                else None
            )

            # Phone numbers are tucked inside HTML comments.
            phone = None
            for c in box.find_all(string=lambda t: isinstance(t, Comment)):
                m = PHONE_RE.search(c)
                if m:
                    phone = m.group()
                    break

            status = "closed" if "currently closed" in box.get_text().lower() else "open"

            schedules: List[Schedule] = []
            if status == "open" and pool_code:
                print(f"  Fetching schedule for {pool_name} ({pool_code})...")
                schedules = parse_schedule(pool_code)

            all_pools.append(PoolData(
                borough=borough,
                pool_name=pool_name,
                pool_code=pool_code,
                status=status,
                location=location,
                phone=phone,
                url=(
                    f"{BASE_URL}/parks/{pool_code}/facilities/indoor-pools"
                    if pool_code
                    else None
                ),
                membership_required=details.get("membership_required"),
                notes=details.get("notes"),
                schedules=schedules,
            ).model_dump())

    return all_pools


if __name__ == "__main__":
    extracted_data = scrape_nyc_pools()
    with open("nyc_pools_live.json", "w", encoding="utf-8") as f:
        json.dump(extracted_data, f, indent=4)

    meta = {
        "updated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "pool_count": len(extracted_data),
    }
    with open("nyc_pools_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=4)

    print(f"Scraping complete! Saved {len(extracted_data)} pools to nyc_pools_live.json.")
