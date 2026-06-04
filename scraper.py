import json
import re
import requests
from bs4 import BeautifulSoup, Comment
from pydantic import BaseModel
from typing import List, Optional

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


class Schedule(BaseModel):
    session_type: str
    days: str
    time: str


class Location(BaseModel):
    address: str
    city: str = "New York"
    state: str = "NY"


class PoolData(BaseModel):
    borough: str
    pool_name: str
    pool_code: str
    status: str
    location: Optional[Location] = None
    phone: Optional[str] = None
    schedules: List[Schedule] = []


def fetch(url: str) -> str:
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


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
            location = Location(address=address) if address else None

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
                schedules=schedules,
            ).model_dump())

    return all_pools


if __name__ == "__main__":
    extracted_data = scrape_nyc_pools()
    with open("nyc_pools_live.json", "w", encoding="utf-8") as f:
        json.dump(extracted_data, f, indent=4)
    print(f"Scraping complete! Saved {len(extracted_data)} pools to nyc_pools_live.json.")
