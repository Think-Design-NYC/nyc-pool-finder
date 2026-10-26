# Riverbank State Park Indoor Pool — Design

**Date:** 2026-10-26
**Status:** Draft (awaiting review)
**Branch:** `riverbank`

## Problem

The finder lists NYC Parks recreation-center indoor pools only (scraped from
nycgovparks.org, Rec Center membership, frozen `schedules` for the mobile
app). Denny Farrell Riverbank State Park is a public indoor 50m pool in
Manhattan that people already treat as part of the same “where can I lap
swim?” question, but it is **NYS Parks**, walk-up priced, seasonally
PDF-scheduled, and geometrically different after 8:15am. Dropping it into
`scraper.py` or into `nyc_pools_live.json` would break the NYC-only
invariants (membership copy, “13 pools”, mobile-app JSON, daily scrape).

## Decision

Add Riverbank to the **same Manhattan grid** as Asser Levy and Chelsea, as a
**build-time overlay**. Do not scrape parks.ny.gov. Do not write Riverbank
into `nyc_pools_live.json`. Merge a hand-maintained record onto the pool
list the way `data/pool_meta.json` is merged today.

Default Manhattan / Lap Swim / Today includes the 6:30–8:15am 50m pass
session. Rec, youth, family, and Saturday morning appear under their own
activity pills. Saturday morning appears **both** under Swim Team and as a
standing note on the card.

## Operator and identity

- `operator: "nys_parks"` (existing pools stay `undefined` or
  `"nyc_parks"`; treat missing as NYC Parks so the scraper JSON is unchanged).
- Synthetic `pool_code`: `NYS-RBSP`. Do not invent an `M…` NYC Parks code.
- `pool_name`: `Riverbank State Park Pool` (page title / slug can mention
  Denny Farrell; the card name should be the name people search).
- Slug: `/pool/riverbank-state-park/` via existing `slugifyPoolName`.
- Address: 679 Riverside Drive, New York, NY 10031. Borough: Manhattan.
- Phones: park `(212) 694-3600`; aquatics `(212) 694-3660`.
- `url` / `sameAs`: the NYS Parks park page, not nycgovparks.org.
- `membership_required: false`.
- Status: `open` while today is inside the published season window; after
  the window, `closed` (or equivalent “schedule ended”) rather than repeating
  the fall grid forever.

## Data shape (build-time only)

New committed files, not rewritten by `scraper.py` or `refresh.sh`:

- `data/riverbank.json` — identity, fees, geometry, notes, season window,
  and the **recurring session templates** (weekday pattern, not dated rows).
- `data/pool_meta.json` — one new key `NYS-RBSP` (Hamilton Heights, lat/lng,
  1 at 145 St/Broadway, A/C/B/D at 145 St, buses M11 and Bx19). Generated
  with `scripts/make_pool_meta.py` if that path is easy; otherwise typed and
  reviewed by eye like the existing rows.

A small merge helper (next to `withPoolMeta`) expands the templates into
`schedule_weeks` for the season window, then concatenates the overlay pool
onto the scraped list **after** `withPoolMeta`. `App.jsx`, `vite-plugin-seo.js`,
and `pool-page.js` all consume the merged list. `nyc_pools_live.json` and
`nyc_pools_meta.json` stay NYC-only (`pool_count` remains the scrape count).

`schedules` on the overlay pool may be a current-week flattening of the same
templates so the homepage fallback and JSON-LD `openingHours` keep working.
That field is **not** published as part of the mobile-app JSON.

## Season window (Fall 2026)

Source: [DFRBSP Fall Swimming Pool Schedule PDF](https://parks.ny.gov/sites/default/files/2026-09/DFRBSP_Fall_SwimmingPoolSchedule.pdf)
(effective **Thursday October 1, 2026 through Saturday December 12, 2026**)
and the [park hours page](https://parks.ny.gov/visit/state-parks/riverbank-state-park-denny-farrell-riverbank-state-park#overview).

The PDF does not include holidays. The park page hours match the PDF’s
weekday pattern. Local knowledge below **overrides** the PDF where they
disagree (Saturday morning is a public session; course length after 8:15).

Expand templates onto every calendar day in `[2026-10-01, 2026-12-12]`.
Outside that window, do not emit sessions. The next season is a data edit
(new PDF + window), not a scraper job.

## Geometry (load-bearing)

The tank is **4 feet throughout**, six lanes, indoor 50m.

| When | Course | What it means |
| --- | --- | --- |
| Daily 6:30–8:15am | **50m × 6 lanes** | Dedicated public lap. All six lanes. Advance pass required. |
| After 8:15am, weekdays and Saturdays | **Two 25-yard pools** (bulkhead in); different activities on each half | Rec / senior / youth / family / Saturday morning run here. Lap swimming in rec is 25 yards, 2–3 lanes, not 50m. |
| Sundays and public holidays | **50m all day** (bulkhead out) | Sunday family/adult rec is 50m. Holidays stay 50m even though the PDF prints no holiday grid. |

Session rows must carry course length (`50m` vs `25yd`) so the card does not
imply afternoon rec is the same swim as morning lap.

## Fees (two products)

Walk-up aquatics ticket (rec, youth, family/adult; **not** morning lap):

- Ages 4–15: $1.00
- Ages 16+: $2.00
- Seniors: $1.00
- Pool rental available for groups

Morning Adult Lap Swim (6:30–8:15):

- Lap swim pass required, purchased **in advance**, ages 18+
- Pass: **$3 per swim to $30 / 30 days** (hand-typed; show an “as of”
  date the same way `MEMBERSHIP_CHECKED` works — do not derive it from the
  build clock)
- This is not the $1–$2 daily ticket

JSON-LD: `isAccessibleForFree: false`; `priceRange` is visit/pass fees
(`$1–$2 daily; lap pass $3–$30/30 days`), never Rec Center membership.

## Sessions and activity matching

Lap Swim means **dedicated 50m pass sessions only** (morning adult lap, and
the weekday 9:00–11:00 senior lap/classes block). Recreational swim is
**not** tagged Lap Swim; reserved 25-yard lap lanes are a note on those
rows.

| Template | Days | Time | Course | Activity pills | Notes |
| --- | --- | --- | --- | --- | --- |
| Adult Lap Swim | Daily | 6:30–8:15am | 50m, 6 lanes | **Lap Swim** | Pass required, $3–$30/30 days, 18+ |
| Senior Lap Swim / senior classes / special populations | Mon–Fri | 9:00–11:00am | 25yd split | **Lap Swim** | 62+ or pre-authorized; not the $1 senior rec ticket |
| Adult Recreational Swim | Mon–Fri | 11:00am–2:30pm | 25yd split, 4 ft | **Open Swim** | 18+; 2–3 lanes laps (25yd), rest unstructured / walking |
| Youth Recreational Swim | Mon–Fri | 3:30–5:30pm | 25yd split, 4 ft | **Children/Teen Swim** | Ages 11–15 only; same mixed-lane note |
| Family / Adult Rec Swim | Mon–Fri | 6:30–8:00pm | 25yd split, 4 ft | **Family Swim** | Ages 16+; mixed-lane note |
| Saturday morning mixed | Saturday | 9:00am–2:00pm | 25yd split, 4 ft | **Open Swim**, **Swim Team** | Public session. Aquatic classes and swim team often take ~half the lanes; remaining lanes are swimable. PDF “classes only” is overridden. The card note says the same thing. |
| Family / Adult Rec Swim | Saturday | 3:00–6:00pm | 25yd split, 4 ft | **Family Swim** | Ages 16+ |
| Family / Adult Rec Swim | Sunday | 9:00am–1:00pm and 2:00–6:00pm | **50m** all day | **Family Swim** | Ages 16+ |

Extend `ACTIVITIES` regexes so these titles match (today, `recreational swim`
and `Family / Adult Rec Swim` match nothing). Saturday morning must match
**Open Swim and Swim Team**. If one title cannot hit both regexes, emit two
sibling rows for the same slot (public rec + swim team) rather than stretching
Learn to Swim onto this block.

Ticket booth closes 30 minutes before session end; padlock required; youth
10 and under with an adult. These are card/page notes, not extra sessions.

### Saturday morning: both filter and note

- It **is** a session on the public grid (Open Swim / Swim Team / Learn to
  Swim).
- The card and pool page **also** carry a standing note: Saturday mornings
  are mixed; swim team frequently uses about half the lanes.

## Card, pool page, and homepage copy

Same `PoolCard` in the Manhattan grid. Extra signals, not a second list:

- Operator badge: **NYS Parks · walk-up $1–$2**
- Depth: **4 ft throughout**
- Course: morning **50m lap**; after 8:15 **25-yard split** except Sunday
  and holidays (**50m all day**)
- Saturday morning mixed-use note
- Aquatics phone; call-ahead must **not** say “the Rec Center” on this
  operator (phrase it as the aquatics complex / park)

Pool page (`/pool/riverbank-state-park/`): walk-up table + lap-pass table
instead of Rec Center membership. “NYC Parks indoor pool” line becomes
operator-specific. JSON-LD `sameAs` is parks.ny.gov.

Homepage / FAQ / SEO fallback: every sentence that says “NYC Parks operates
N pools” or “every pool needs a Recreation Center membership” must count
**NYC Parks pools only**. Add one sentence that Riverbank State Park is also
listed (Manhattan, NYS Parks, daily admission). Do not let “free” describe
Riverbank. `pools.length` is no longer a safe proxy for “NYC Parks count.”

Call-ahead detail stays rec-center-specific for NYC pools; Riverbank uses
aquatics `(212) 694-3660` and the park page.

## Deliberately unchanged

- `scraper.py`, `refresh.sh`, the 8-pool scrape guard, `nyc_pools_live.json`
  (mobile app).
- Filter pills, URL state, collapsible cards, day offsets 0–3.
- NYC membership tables and `MEMBERSHIP_CHECKED`.
- Outdoor 25m summer pool, spray ground, skating, fitness room — out of
  scope. Indoor pool only.
- Daily scrape of the PDF. Next season is a hand edit of `data/riverbank.json`.

## Public holidays

PDF: schedule does not include holidays. Local rule: **bulkhead out, 50m all
day**. Until a holiday hours table exists, emit the Sunday-style 50m family
pattern on dated public holidays inside the window **or** leave those dates
empty and rely on call-ahead — pick empty+call-ahead in v1 so we do not
invent hours the PDF refused to print. The 50m-all-day fact still belongs on
the card as a standing rule.

## Verification

- Manhattan + Lap Swim + Today: Riverbank’s 6:30–8:15am session appears
  (hidden after 8:15 via existing `isPastToday`).
- Manhattan + Open Swim: weekday adult rec and Saturday 9:00am–2:00pm.
- Swim Team: Saturday 9:00am–2:00pm, plus the card note.
- Family Swim: weekday evening, Saturday 3–6, Sunday blocks.
- Children/Teen: weekday 3:30–5:30 only.
- After Dec 12, 2026: no Riverbank sessions; it must not keep showing fall
  hours.
- NYC pool cards still say Rec Center membership; Riverbank does not.
- FAQ / fallback / pool page agree on operator split (cloaking invariant).
- `https://pools.thinkdesign.com/nyc_pools_live.json` still has 13 NYC
  pools and no `NYS-RBSP`.
- `npm run build` emits `/pool/riverbank-state-park/` and sitemap entry.
- Browser: default filters, Saturday Swim Team, expand card, pool page.
