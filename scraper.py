import json
import re
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup, Comment
from pydantic import BaseModel
from typing import Dict, List, Optional, Tuple

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

# One alert box often concatenates several unrelated notices: the site-wide
# membership promo, the site-wide holiday note, and a real closure, all in one
# div. Dropping a whole notice because it mentions a promo therefore threw away
# real closures (Flushing Meadows' three-week shutdown was lost this way), so
# strip the boilerplate blocks and keep whatever is left.
NOTICE_BOILERPLATE_RES = [
    # The membership-extension promo, from its heading to the opt-in deadline.
    re.compile(
        r"Membership Extensions\b.*?opt-in for the extension is [^.]*\.\s*",
        re.IGNORECASE | re.DOTALL,
    ),
    # Holiday note, repeated on every center's page.
    re.compile(r"In observance of [^.]*\.\s*", re.IGNORECASE),
    # Per-slot filler on the schedule page.
    re.compile(r"There are no (?:public )?programs at this [^.]*\.\s*", re.IGNORECASE),
    # The summer reduced-hours block, carried verbatim by five pools. It runs
    # ~400 characters and restates hours the schedule table already shows, so
    # it's stripped here and surfaced as the `reduced_hours` flag instead.
    # Stripping it also removes "The pool is closed on Sundays", which is the
    # sentence that makes closure detection hardest.
    re.compile(
        # `.` not `[^.]` for the facility name: "St. John's Recreation Center"
        # contains a period, and a period-free span never reaches it.
        r"The indoor pool at .{0,80}?will operate at reduced hours.*?"
        r"(?:in the coming weeks\.|$)",
        re.IGNORECASE | re.DOTALL,
    ),
]

# Set when the stripped block above was present, so the UI can say "Reduced
# summer hours" in four words instead of four hundred characters.
REDUCED_HOURS_RE = re.compile(r"will operate at reduced hours", re.IGNORECASE)

# A facility-level closure, as opposed to a recurring weekly one. The trailing
# lookahead is load-bearing: "The pool is closed on Sundays" appears in the
# reduced-hours notice of pools that are very much open, and without it every
# such pool gets marked closed.
CLOSURE_RE = re.compile(
    r"\b(?:recreation center|aquatics center|indoor pool|the pool|center|pool)s?\b[^.]{0,80}?"
    r"\b(?:is|are|will be)\b[^.]{0,20}?\bclosed\b"
    r"(?!\s+on\s+(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day)",
    re.IGNORECASE,
)


_MONTHS = (
    r"(?:January|February|March|April|May|June|July|August|September|October"
    r"|November|December)"
)

# "The center will reopen to the public on Tuesday, September 8." Months are
# spelled out explicitly rather than matched as a generic capitalised word,
# because IGNORECASE would otherwise let any word through.
REOPEN_RE = re.compile(
    rf"\breopen\w*\b[^.]{{0,40}}?\bon\s+(?:\w+day,\s*)?"
    rf"({_MONTHS}\s+\d{{1,2}}(?:,\s*\d{{4}})?)",
    re.IGNORECASE,
)


# Why a facility is shut, in NYC Parks' own terms. Ordered so the specific cause
# wins over the generic capital-works word that often appears later in the same
# notice — Metropolitan cites a mechanical issue *and* a planned renovation, and
# the mechanical issue is the reason it's shut today. Each value is the whole
# prepositional phrase, because "for repairs" and "due to a mechanical issue"
# don't take the same preposition.
CLOSURE_REASONS = [
    (re.compile(r"\bmechanical issue\b", re.IGNORECASE), "due to a mechanical issue"),
    (re.compile(r"\bstructural condition\b", re.IGNORECASE), "due to the building's condition"),
    (re.compile(r"\breconstruction\b", re.IGNORECASE), "for reconstruction"),
    (re.compile(r"\brenovation\b", re.IGNORECASE), "for renovation"),
    (re.compile(r"\brepairs?\b", re.IGNORECASE), "for repairs"),
    (re.compile(r"\bmaintenance\b", re.IGNORECASE), "for maintenance"),
    (re.compile(r"\bconstruction\b", re.IGNORECASE), "for construction"),
]

# "closed for the duration of summer through mid-September". Deliberately only
# matches an early/mid/late + month phrase: a bare "through <weekday>" would
# also match the closure *start* range ("Beginning Sunday ... through Sunday").
CLOSED_THROUGH_RE = re.compile(
    rf"\bthrough\s+((?:early|mid|late)[-\s]?{_MONTHS})", re.IGNORECASE
)


def find_closure_reason(notes: Optional[str]) -> Optional[str]:
    """NYC Parks' stated reason for the closure, as a prepositional phrase."""
    if not notes:
        return None
    return next((phrase for rx, phrase in CLOSURE_REASONS if rx.search(notes)), None)


def find_closed_through(notes: Optional[str]) -> Optional[str]:
    """An open-ended end point ("mid-September") when no hard date is given."""
    if not notes:
        return None
    m = CLOSED_THROUGH_RE.search(notes)
    return m.group(1) if m else None


def find_reopen_date(notes: Optional[str]) -> Optional[str]:
    """The date a closed facility says it reopens, when it states one.

    Plenty of closures don't: "through mid-September" and "closed due to the
    building's structural condition" give nothing to promise a reader, so this
    returns None and the UI just says Closed.
    """
    if not notes:
        return None
    m = REOPEN_RE.search(notes)
    return m.group(1) if m else None


# Links inside a closure notice are the only route to the detail — a capital
# project page, a community input portal. Excluded: the membership-extension
# promo, whose link text is a bare "webpage" and which explains nothing about
# why the pool is shut.
NOTICE_LINK_SKIP_RE = re.compile(r"membership", re.IGNORECASE)


# The tracker index, and its filter views — useful to nobody asking "when does
# my pool come back". Superseded when a specific project is known below.
GENERIC_TRACKER_RE = re.compile(
    r"^https://www\.nycgovparks\.org/planning-and-building/capital-project-tracker"
    r"(?:/(?:partner|completed))?(?:[#?].*)?$",
    re.IGNORECASE,
)

# Some closure notices link only the tracker index, not the project actually
# responsible for the closure. Where the specific project is known it's named
# here, by pool code.
#
# HAND-MAINTAINED, like the membership prices. A recreation center can have
# several unrelated capital projects — Metropolitan's park page lists three,
# and only 10796 is the dehumidification work its closure notice describes — so
# check a project actually matches the stated reason before adding it here.
CAPITAL_PROJECT_OVERRIDES = {
    # "must remain closed until we are able to install a full dehumidification
    # system in the natatorium" -> Dehumidification System Reconstruction.
    "B085": {
        "text": "Dehumidification System Reconstruction",
        "url": (
            "https://www.nycgovparks.org/planning-and-building"
            "/capital-project-tracker/project/10796"
        ),
    },
}


def apply_capital_override(pool_code: str, links: List[dict]) -> List[dict]:
    """Swap a bare tracker-index link for the specific project, when known."""
    override = CAPITAL_PROJECT_OVERRIDES.get(pool_code)
    if not override:
        return links
    kept = [l for l in links if not GENERIC_TRACKER_RE.match(l["url"])]
    if override["url"] not in {l["url"] for l in kept}:
        kept.insert(0, dict(override))
    return kept


def extract_notice_links(divs) -> List[dict]:
    """(text, url) for each informative link in a set of notice divs."""
    links: List[dict] = []
    seen = set()
    for d in divs:
        for a in d.find_all("a", href=True):
            href = a["href"].strip()
            text = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
            if not href or not text or NOTICE_LINK_SKIP_RE.search(href):
                continue
            if href.startswith("/"):
                href = BASE_URL + href
            if not href.startswith("http") or href in seen:
                continue
            seen.add(href)
            links.append({"text": text, "url": href})
    return links


def clean_notices(raw: List[str]) -> List[str]:
    """Strip site-wide boilerplate; drop notices that were nothing but it."""
    out: List[str] = []
    for notice in raw:
        for rx in NOTICE_BOILERPLATE_RES:
            notice = rx.sub(" ", notice)
        notice = re.sub(r"\s+", " ", notice).strip()
        if notice and notice not in out:
            out.append(notice)
    return out

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
    reduced_hours: bool = False
    notice_links: List[dict] = []
    closure_reason: Optional[str] = None
    closed_through: Optional[str] = None
    reopens: Optional[str] = None
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
    details["notice_links"] = extract_notice_links(soup.find_all("div", class_="alert-error"))
    details["raw_notices"] = notices
    details["notices"] = clean_notices(notices)

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


def parse_schedule(pool_code: str) -> Tuple[List[Schedule], List[str], List[str], List[dict]]:
    """Schedules plus any closure notices posted on the schedule page.

    The notices matter as much as the table: a center shut for repairs simply
    has no schedule rows, and the only statement that it is shut lives in an
    alert box on this page. Returning both keeps it to one request.
    """
    url = f"{BASE_URL}/facilities/recreationcenters/{pool_code}/schedule"
    try:
        html = fetch(url)
    except requests.RequestException as e:
        print(f"  Could not fetch schedule for {pool_code}: {e}")
        return [], [], [], []

    soup = BeautifulSoup(html, "html.parser")
    raw_notices = [
        re.sub(r"\s+", " ", d.get_text(" ", strip=True))
        for d in soup.find_all("div", class_="alert-error")
    ]
    notices = clean_notices(raw_notices)
    links = extract_notice_links(soup.find_all("div", class_="alert-error"))
    pool_heading = next(
        (
            h for h in soup.find_all(["h2", "h3"])
            if "pool" in h.get_text().lower() and "schedule" in h.get_text().lower()
        ),
        None,
    )
    if not pool_heading:
        return [], notices, raw_notices, links

    table = pool_heading.find_next("table", class_="schedule-table")
    if not table:
        return [], notices, raw_notices, links

    rows = table.find_all("tr")
    if len(rows) < 2:
        return [], notices, raw_notices, links

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
    return schedules, notices, raw_notices, links


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

            notices = list(details.get("notices") or [])
            reduced_hours = any(REDUCED_HOURS_RE.search(n) for n in details.get("raw_notices") or [])
            notice_links = list(details.get("notice_links") or [])

            schedules: List[Schedule] = []
            if status == "open" and pool_code:
                print(f"  Fetching schedule for {pool_name} ({pool_code})...")
                schedules, schedule_notices, schedule_raw, schedule_links = parse_schedule(pool_code)
                for link in schedule_links:
                    if link["url"] not in {l["url"] for l in notice_links}:
                        notice_links.append(link)
                for n in schedule_notices:
                    if n not in notices:
                        notices.append(n)
                reduced_hours = reduced_hours or any(
                    REDUCED_HOURS_RE.search(n) for n in schedule_raw
                )

            # The listing page only says "currently closed" for long-term
            # closures. A center shut for a week of repairs still reads as open
            # there, and the only statement otherwise is the notice — so trust
            # the notice. Its schedule goes with it: a posted timetable for a
            # closed building would still match the day/activity filters and
            # send someone to a locked door.
            notes = " ".join(notices)[:400] or None
            if status == "open" and notes and CLOSURE_RE.search(notes):
                print(f"  {pool_name}: closure notice found — marking closed")
                status = "closed"
                schedules = []

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
                notes=notes,
                reduced_hours=reduced_hours,
                notice_links=(
                    apply_capital_override(pool_code, notice_links)
                    if status == "closed"
                    else []
                ),
                closure_reason=find_closure_reason(notes) if status == "closed" else None,
                closed_through=find_closed_through(notes) if status == "closed" else None,
                reopens=find_reopen_date(notes) if status == "closed" else None,
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
