# NYC Indoor Pool Finder — Hand-off

A static React/Vite site that lists NYC indoor public pools and their
lap-swim / open-swim / etc. schedules, sourced from `nycgovparks.org`.

- **Live:** https://pools.thinkdesign.com/ (Netlify, built from `main` by Netlify's
  Git integration; the old GitHub Pages URL redirects here, and thinkdesign.com/pools/
  should too — see Hosting)
- **Repo:** `Think-Design-NYC/nyc-pool-finder` (default branch `main`)

## How the pieces fit

```
scraper.py            → writes nyc_pools_live.json + nyc_pools_meta.json
                        (4 requests per pool: facility page, pool detail page, and
                        the schedule page twice — this week and next)
scripts/refresh.sh    → runs scraper, sanity-checks, commits, pushes (launchd)
src/App.jsx           → imports the JSON at build time, renders the UI
src/faq.js            → FAQ copy, shared by the UI and the build-time SEO output
src/membership.js     → membership prices (hand-maintained, NOT scraped)
vite-plugin-seo.js    → build-time JSON-LD, no-JS fallback HTML, sitemap.xml
netlify.toml          → Netlify build command, publish dir, cache headers, redirects
.github/workflows/    → deploy.yml: build check + a GitHub Pages job that publishes
                        only a redirect page. It no longer deploys the site.
```

Data is baked in at build time (`import pools from '../nyc_pools_live.json'`),
so a data refresh = a commit = an auto-deploy. There is no runtime fetch on the
website; the mobile app fetches the published JSON (see Hosting below).

## Hosting (Netlify)

Netlify's Git integration watches `main` and runs `npm run build` itself; the
config lives in [netlify.toml](netlify.toml) (see [DEPLOY.md](DEPLOY.md)).
Nothing in GitHub Actions deploys the site any more, and there are no deploy
secrets in the repo.

- **The site is at the root of its own subdomain**, so Vite `base` is `/` and
  `SITE_URL` in `vite-plugin-seo.js` is `https://pools.thinkdesign.com/`.
- **No SPA catch-all rewrite.** The app is one page with anchor-only navigation
  (`#pool-…`); a `/* → /index.html 200` rule would turn every typo into a 200
  and let crawlers index infinite duplicates. Unknown paths 404 on purpose.
  There *is* a 301 from `/pools/*` to `/` for stray links to the old shape.
- **`public/robots.txt` is finally the real one.** At `/pools/` it was inert —
  robots.txt is only honoured at a domain root. Now it is served at
  `https://pools.thinkdesign.com/robots.txt` and advertises this site's sitemap
  directly, so the WP Engine root robots.txt no longer has to carry that line.
- **The mobile app's JSON moved.** The build copies `nyc_pools_live.json` +
  `nyc_pools_meta.json` into `dist/`, now published at
  `https://pools.thinkdesign.com/nyc_pools_live.json`, served with
  `Cache-Control: max-age=0, must-revalidate` and `Access-Control-Allow-Origin: *`.
  That removes the WP Engine caching quirk the app worked around with
  version-keyed URLs (Cloudflare in front of thinkdesign.com cached JSON for
  600s with the query string in the cache key). **The app still points at the
  old URL** — update it, or keep the WP Engine 301 in place indefinitely.

### thinkdesign.com/pools/ is now stale

The WP Engine deploy job was removed, so that path serves a frozen copy of the
last build. It needs a 301 to `https://pools.thinkdesign.com/$1` added in
WordPress/WP Engine (not deployable from this repo), and the root robots.txt
should drop its `Sitemap: https://thinkdesign.com/pools/sitemap.xml` line.
Until that happens the two copies compete for the same queries — the stale one
now carries a canonical pointing at the subdomain, which helps but is not a
substitute for the redirect.

## Local development

```bash
npm install
npm run dev      # vite dev server
npm run build    # outputs to dist/
```

Node 20, React 18, Vite 6, Tailwind v4 (via `@tailwindcss/vite`), `lucide-react`
for icons. No test suite, no linter configured.

## Where each field comes from

The listing page (`/facilities/indoor-pools`) only has name, rough location and a
phone number hidden in an HTML comment. Everything else needs two more fetches
per pool:

| Field | Source |
| --- | --- |
| `pool_name`, `phone`, rough address | listing page |
| `address`, `cross_streets`, `city`, `zip_code`, `building_hours` | `/facilities/recreationcenters/{code}` |
| `membership_required` | `/parks/{code}/facilities/indoor-pools` |
| `schedules`, closure notices | `/facilities/recreationcenters/{code}/schedule` |
| `notes` | `alert-error` boxes on **both** the recreation-center page and the schedule page |
| `status` | listing page, **overridden** by a closure notice — see below |

Parsing notes, all learned the hard way from real pages:

- The address block is unlabelled text nodes, so `parse_address_block` anchors on
  the "Cross Streets:" `<strong>` and reads backwards.
- Most pages say `Brooklyn, NY 11213`, but some spell the state out
  (`Brooklyn, New York 11210`) — the regex accepts both and normalises to `NY`.
- `building_hours` keys use underscores (`Monday_Friday`) because the UI renders
  `day.replaceAll('_', ' – ')`.
- Only `div.alert-error` becomes `notes`, from the recreation-center page *and*
  the schedule page. `alert-success` is general news and a bare `alert` is the
  membership-login promo.
- **One alert box can hold several unrelated notices concatenated.** A single
  `alert-error` routinely contains the site-wide "Membership Extensions" promo,
  the site-wide Labor Day note, and a real closure, in that order. Filtering by
  "does this notice mention the promo" therefore discarded real closures — that
  is how Flushing Meadows' three-week shutdown went missing. `NOTICE_BOILERPLATE_RES`
  now strips the boilerplate *blocks* and keeps whatever survives.
- **`status` cannot be read off the listing page alone.** It only says "currently
  closed" for long-term closures; a center shut for a week of repairs still reads
  as open there. `CLOSURE_RE` re-derives it from the cleaned notices, and a pool
  closed that way has its `schedules` cleared — a posted timetable for a closed
  building would still satisfy the day/activity filters and send someone to a
  locked door.
- **`CLOSURE_RE`'s trailing lookahead is load-bearing.** "The pool is closed on
  Sundays" appears in the reduced-hours notice carried by five pools that are
  very much open; without the day-of-week exclusion every one of them gets
  marked closed. If you touch that regex, re-check it against all 13 pools —
  reduced-hours pools and genuinely-closed ones both mention "closed".
- **Closure notices carry links, and they matter.** `extract_notice_links`
  keeps the anchors inside `alert-error` boxes — capital project pages, the
  Clarkson Street input portal. Hrefs are sometimes site-relative or
  whitespace-padded, so they're absolutised and stripped. Links whose href
  mentions `membership` are skipped: on Chelsea and Flushing the only anchor is
  the membership-extension promo, labelled "webpage", which says nothing about
  the closure.
- **`CLOSURE_INFO_OVERRIDES` is hand-maintained**, like the membership prices.
  Some notices link only the tracker index — a filter view that tells a visitor
  nothing — so naming the real page here also drops the generic link. It can't
  be derived safely: a center can have several unrelated capital projects
  (Metropolitan's park page lists three, and only 10796 is the dehumidification
  work its notice describes), and the right page isn't always a capital project
  at all — Tony Dapolito has none, and the Clarkson Street Corridor planning
  page is where the replacement facility and its indoor pool are described.
  Confirm a page matches the stated closure reason before adding it.
- **Nearest subway is not published anywhere on nycgovparks.org** — `PoolCard`
  still renders `location.nearest_subway` if it ever appears, but nothing fills
  it. Populating it would need an external MTA station dataset.

Known source gaps (not bugs): B250 has an empty `<p></p>` for cross streets, and
M103 has no Building Hours block because it's closed for reconstruction.

## Membership pricing (the one thing that isn't scraped)

**All 13 pools require a Recreation Center membership.** Don't let "free" creep
back into the copy — only the city's *outdoor* pools are free.

Prices live in [src/membership.js](src/membership.js), imported by the FAQ, the
rendered pricing table and the no-JS fallback so the three can't drift:

| Who | Cost |
| --- | --- |
| 24 and under | Free |
| 25–61 | $150/year, or $75 for six months |
| 62+, veterans, people with disabilities | $25/year |

Two things that are easy to get wrong, and are called out in the copy for that
reason:

- The senior tier starts at **62 with no upper limit**, and it covers veterans
  and people with disabilities **at any age**.
- NYC Parks also sells a **$100/year package that excludes every center with a
  pool**. Quoting that number on a pool finder sends people to buy the wrong
  membership — always name the "Access to All Centers" tier.

These figures are typed in by hand, so unlike everything else on the site they
can go stale silently. `MEMBERSHIP_CHECKED` is the date they were last verified
against NYC Parks and is rendered on the page as "As of …". It is deliberately
**not** derived from the build date — an auto-updating date would vouch for
numbers nobody had looked at. Bump it by hand when you re-check.

Source of truth: <https://www.nycgovparks.org/programs/recreation-centers/membership>

## SEO

The app is client-rendered, so the HTML the host serves would otherwise be an empty
`<div id="root">`. [vite-plugin-seo.js](vite-plugin-seo.js) fixes that at build
time — it reads `nyc_pools_live.json` and:

- injects JSON-LD (`ItemList` of `PublicSwimmingPool`, plus `WebSite`/`WebPage`/
  `FAQPage`), with opening hours merged from each pool's session times;
- injects a static mirror of the UI into `#root` for crawlers that don't run JS.
  React's `createRoot()` wipes it on mount, so users never see it;
- emits `sitemap.xml` with `lastmod` from the scrape timestamp.

**The fallback markup must keep saying what React says.** If the two diverge a
crawler comparing raw vs. rendered HTML reads it as cloaking. Anything shared is
shared through a module for exactly this reason — [src/faq.js](src/faq.js),
[src/membership.js](src/membership.js), [src/copy.js](src/copy.js), and `poolAnchorId()` in
[src/utils.js](src/utils.js) (so JSON-LD `@id` fragments match the rendered card
`id`s).

**Borough names in prose are derived, never typed** (`boroughsPresent()` +
`joinBoroughs()` in [src/utils.js](src/utils.js), used by `App.jsx`,
`SeoContent.jsx` and the fallback). Fixed 2026-09-08: the React subhead
hardcoded "Manhattan, Brooklyn, Queens & the Bronx" and had gone on claiming the
Bronx after St. Mary's closed, while the fallback computed its own list — the
two disagreed on the same sentence. `boroughsPresent(pools, isOpen)` is the
open-pool list for the subhead; `boroughsPresent(pools)` is every borough with a
pool, for the "NYC Parks operates 13 pools across …" copy. **If you change the `<h1>`, the headings or the body copy in
`SeoContent.jsx`, change the fallback in `vite-plugin-seo.js` to match.**

### Call ahead (added 2026-09-08)

`CALL_AHEAD_NOTE` in [src/copy.js](src/copy.js) — *"Please call ahead before
planning your swim: the Rec Center will have the most up-to-date information."*
— renders under the open-count line in the header and again in the closing
source disclaimer, in both React and the fallback.

It exists because on 2026-09-08 Chelsea Pool was found drained while NYC Parks
still published a full lap-swim timetable for it; the site faithfully repeated
that. The scrape can only ever be as good as what Parks has posted, and the
building itself is the only authority on whether there is water in the pool.
Don't remove it to save vertical space.

### Naming

The site is **NYC Indoor Pool Finder**. "Indoor" is load-bearing: NYC's ~50
*outdoor* pools are a separate system with different hours, no membership and a
late-June-to-Labor-Day season, and people arriving from an outdoor-pool search
need to see the distinction in the SERP title before they click. The name appears
in `index.html` (`<title>`, `og:site_name`, `og:title`, `twitter:title`), the
`<h1>` in `App.jsx`, the fallback `<h1>`, and the JSON-LD `WebSite`/`WebPage`
nodes. Keep them in sync.

### Keyword targeting

Aimed at the **indoor + lap swim + open now** cluster, deliberately *not* at bare
"NYC pools open now" — in summer that query wants the free outdoor pools this
site doesn't cover, so ranking for it would earn traffic that bounces.

### Counties vs. boroughs

JSON-LD `areaServed` uses **county** names (New York, Kings, Queens, Bronx,
Richmond) with the borough as `alternateName`. `addressLocality` stays the
**mailing city** ("Brooklyn", "Flushing", "Jamaica") because a `PostalAddress`
has to be deliverable. Visible copy and the filter buttons stay boroughs — that's
what people actually search.

Fallback styling uses a scoped `<style>` block, not Tailwind classes — the plugin
runs in `transformIndexHtml`, after Tailwind has scanned sources, so classes
introduced there would be purged.

`public/robots.txt` is now the effective robots.txt: on the subdomain it is
served at the domain root, where crawlers actually honour it, and it carries

```
Sitemap: https://pools.thinkdesign.com/sitemap.xml
```

Before the move it landed at `/pools/robots.txt` and was ignored; the real one
was a hand-edited static file at the WordPress web root on WP Engine, which was
given a second `Sitemap:` line on 2026-09-01 because the Yoast
`sitemap_index.xml` didn't include `/pools/`. That line is now dead and should
be removed via **Yoast SEO → Tools → File editor → robots.txt** (or SFTP/SSH).
It was never deployable from this repo.

## SEO roadmap — per-pool pages, planned 2026-09-08

From an outside SEO consultation on 2026-09-08, then checked against the repo
by a Codex review the same day (corrections folded in below). **Nothing in this
section is built yet.** It records which recommendations are real for *this*
site, which were already done, which to ignore, and the order to build the rest
in.

### Partly satisfied already — read this before re-doing anything

The consultation's "make schedules readable page content, not just React filter
output" and "show last-updated times" are **already handled for crawlers that
don't run JS, but less completely than the SEO section above implies.** The
fallback in `buildFallbackHtml()` renders `pool.schedules` — the legacy flat,
undated, current-week list — not `schedule_weeks`. So it carries this week's
sessions for open pools, addresses, cross streets, phone, membership table, FAQ
and the scrape date, and it omits **next week, per-day building hours and
holiday lines** entirely. Closed pools appear in it by name and closure
sentence only, since their flat list is deliberately empty.

Structured data, `robots.txt` and `sitemap.xml` do already exist. See the SEO
section above.

### The four gaps that are real

1. **Googlebot renders JS, and the rendered DOM loses the schedule tables the
   raw HTML has.** This is the sharp version of the consultation's headline
   concern, and the static fallback does *not* fix it. `createRoot()` wipes the
   mirror on mount. What replaces it is *not* strictly a subset — React always
   renders `ClosedPoolList` and all of `SeoContent` (membership, FAQ, boilerplate)
   — but the pool cards are filtered to the defaults, Manhattan / Lap Swim /
   Today. So the timetables are the part that vanishes: on a Tuesday afternoon
   in September that's three Manhattan pools' remaining lap-swim slots, against
   a raw page carrying every open pool's current week.

   Two caveats worth keeping straight. The count is **clock-dependent**, not a
   fixed property — `isPastToday()` reads the live clock and drops sessions that
   have already ended, so late in the day the rendered page can be nearly empty.
   And the raw page is not the richer one in every respect either: it lacks next
   week and building hours, per the note above. The two representations differ in
   *both* directions, which is precisely the drift the fallback invariant exists
   to prevent.

2. **No per-pool URLs.** All 13 pools share one URL and a `#pool-…` anchor. The
   hypothesis — and it is a hypothesis, not something this repo can verify — is
   that thirteen documents can each rank for their own "\<pool name\> schedule"
   long tail, where one document with thirteen anchors realistically competes
   for one. Worth testing; don't write it down as arithmetic.

3. **No shareable filtered URLs.** Filter state lives only in `localStorage` —
   no query params, no history entries, nothing to link to or share. UX debt as
   much as SEO: the back button does nothing and "here's family swim on
   Saturday" cannot be sent to anyone.

4. **Missing fields.** No lat/lng (so no "near me" sort and no geo coordinates
   in the JSON-LD), no accessibility, transit or parking data. lat/lng most
   likely comes from NYC Open Data rather than the Parks facility HTML, which
   doesn't carry it — see Step 4 on why that shouldn't necessarily become
   scraper work.

### What to ignore, and why

- **"Municipal pools"** — not a phrase New Yorkers search. The proposed
  homepage line ("Search municipal indoor pools by location, activity, date and
  time") also drops **Indoor**, which is load-bearing here; see Naming above.
  The current `<h1>` and subhead are better targeted than the suggested
  replacement, and changing them means syncing four places.
- **Generic `[city] indoor pool schedule` targeting** — template advice.
  Avoiding bare "NYC pools open now" was a deliberate call: in summer that
  query wants the free *outdoor* pools this site doesn't cover, and the traffic
  would bounce. See Keyword targeting above.
- **"Seek links from the municipality"** — NYC Parks will not link to a
  third-party scraper of its own pages. Realistic link targets are neighborhood
  blogs, r/nyc, swim clubs and Masters teams.

### Build order

**Step 1 — static per-pool pages at `/pool/<slug>/`. — BUILT 2026-09-08.**
All 13 pages ship: [pool-page.js](pool-page.js) renders one static document per
pool, [pool-schema.js](pool-schema.js) holds the shared `PublicSwimmingPool`
node (moved out of the plugin so the homepage graph and the pages can't
disagree), and `poolSlugs()` / `poolPath()` in [src/utils.js](src/utils.js) own
the URLs. The homepage JSON-LD now points at those pages instead of `#pool-…`
fragments, the sitemap carries 15 URLs, `/pool/*` gets `max-age=0` in
`netlify.toml`, and the pages are excluded from the precache. Cards and the
closed list link to them, so they are not orphans. The original plan follows,
for the reasoning:

Emit them in
`generateBundle` via `this.emitFile`, as **fully static HTML with no React
mount**. That is the point: with no JS replacing the markup there is no
rendered-vs-raw divergence to police, and the pages need no routing, no SPA
rewrite and no hydration. Each carries its own `<title>`, description,
canonical, `PublicSwimmingPool` JSON-LD, the full dated two-week timetable from
`schedule_weeks` (not the flat `schedules` list — closed pools have an empty
flat list but often a real timetable next week), per-day building hours,
holiday notices, phone, cross streets, membership copy, and a link back to the
finder.

Don't bolt thirteen more templates onto `vite-plugin-seo.js` as it stands. The
plugin already hand-builds the fallback while React separately renders the same
claims; a third renderer in the same file makes drift likelier. Factor the
shared view-model (status phrase, dated week, holiday lines, membership block)
into helpers and put the page template in its own module the plugin consumes.

Gotchas for this step:

- **The `/pools/*` redirect does not do what you'd assume.** It is
  `to = "/:splat"`, forced 301 — so `/pools/chelsea-pool/` redirects to
  `/chelsea-pool/`, which then 404s (there is deliberately no SPA catch-all).
  The plural namespace is still unusable without changing that rule; it just
  fails differently than "everything lands on the homepage".
- **Don't derive the slug from `poolAnchorId()`.** That helper prefers
  `pool.pool_code`, so stripping the `pool-` prefix yields `/pool/m164/`, not
  `/pool/asser-levy-pool/`. Write a name-based slug helper with collision
  handling (fall back to appending the code), and keep the anchor ids as they
  are so existing `#pool-…` links survive.
- **Escaping is not optional.** The existing fallback runs every interpolated
  value through `esc()` and escapes `<` inside the JSON-LD block. Any new page
  generator must do both — scraped copy is untrusted input.
- **`holiday` and `note` are different things** — show the holiday line,
  never promote the generic "no programs scheduled" note. Same invariant as
  the cards.
- **A closed pool with a future timetable must not read as open.** The
  homepage derives the return date from the first day with sessions and wears
  an amber "Reopens …" badge rather than a green "Open". Pool pages need the
  same current-status / future-timetable distinction, or a page will state a
  timetable for a locked building.
- **Static pages have no staleness banner.** React warns past
  `STALE_AFTER_HOURS`; a static page printing the scrape date does not warn
  anyone when the residential-Mac refresh has silently stopped. Decide
  deliberately: either render a build-time-honest date only, or give the pages
  a tiny inline script that does the same 48h comparison the app does.
- **Reconsider precaching these pages.** `workbox.globPatterns` matches
  `**/*.html`, so they'd be picked up automatically — but the bundle already
  contains every schedule and is the intended offline source, so this
  duplicates the same data across 13 documents, and a precached *static* page
  has no update prompt (that UI lives in React). Leaning toward adding
  `/pool/**` to `globIgnores` and keeping offline on the app shell.
- **Cache headers.** Only `/index.html` currently gets
  `max-age=0, must-revalidate`. Add the equivalent for `/pool/*/index.html` —
  these change daily.
- JSON-LD `@id` and `url` for each pool currently point at `${SITE_URL}#pool-…`.
  Once a real page exists they should point at it instead, with the homepage
  anchors still resolving.
- Styling must stay in a scoped `<style>` block, same reason as the fallback:
  the plugin runs after Tailwind has scanned sources.
- Add every page to `sitemap.xml` (15 URLs total with the homepage and
  `/privacy/`), `lastmod` from the scrape timestamp as the homepage already does.
- **7 of 13 pools are closed as of 2026-09-08** (summer closures ending
  mid-September). Their pages will be thin until they reopen. Build them
  anyway — people search closed pools by name, and the page is the right place
  to say "closed through mid-September, here's when it's back" — but expect
  nothing from them until the timetables return.

**Step 2 — make the rendered DOM stop dropping pools. — BUILT 2026-09-08.**
Cards and the closed list link to pool pages, and
[PoolDirectory](src/components/PoolDirectory.jsx) lists whatever the active
filters excluded, computed as the complement of the two rendered lists rather
than by re-deriving the filters — so it cannot fall out of step with them. Every
filter state now totals 13 pools on the page. Worth knowing how bad this was:
with the default Manhattan / Lap Swim / Today filters late in the day,
`isPastToday()` empties the grid completely, so the rendered DOM contained no
open pool at all while the fallback listed five. The original reasoning follows: Closes gap 1, but
*not* by bolting a second full pool index under the grid: React already renders
filtered cards, the closed list and the SEO section, so a thirteen-row status
table duplicating all of it earns its space only if a reader wants it. Better
shape: link each card and each `ClosedPoolList` entry to its pool page, then add
one compact semantic directory covering only the pools the active filters
excluded, so every pool is reachable from the rendered DOM under any filter
state. The depth then lives on the pool pages, and the fallback can be trimmed
toward what React renders rather than the reverse — noting that this adds a
third representation to keep in sync, and nothing tests drift.

**Step 3 — filter state in the URL.** `?borough=&activity=&day=`, read on
mount, written on change. Use **`pushState` for user-initiated filter changes**
— that's what makes Back traverse them — and reserve `replaceState` for the
initial normalization of a bare or legacy URL. `localStorage` stays the
fallback for a visit with no query string. Gives shareable links and the "pools
open now" / "family swim Saturday" URLs the consultation asked for. No Netlify
change needed — query strings don't touch routing, and the deliberate absence
of an SPA catch-all still holds.

**Step 4 — location and facility metadata.** lat/lng, accessibility, nearest
subway lines; unlocks "near me" sorting and `geo` in the JSON-LD. **Probably
not scraper work.** This data is stable, while `scraper.py` is the fragile
daily path — four requests per pool, residential IP only — and coupling a
second source's schema to it means an outage there can break the daily refresh.
Prefer a hand-reviewed enrichment file keyed by `pool_code`, merged at build
time. Either way the fields land on the pool object in `nyc_pools_live.json`
only: `nyc_pools_meta.json` holds nothing but `updated_at` and `pool_count`,
and `schedules` is frozen for the mobile app.

**Step 5 — human-only, unchanged.** Search Console property + sitemap
submission (still parked, see below), the og-image replacement, and link
outreach to neighborhood blogs and swim clubs.

## Data refresh (runs locally, not on GitHub)

`nycgovparks.org` returns **403 Forbidden** to datacenter IPs, so the scraper
cannot run on GitHub-hosted runners. It needs a residential IP.

**It runs on the primary Mac** (there is no Raspberry Pi), daily at 06:00 local
via a launchd agent. The secondary Mac is a dev machine with no scheduled job;
when the primary has been off, run `refresh.sh --if-stale 36` there by hand — it
exits without scraping unless the published data is already older than 36h. See
[DEPLOY.md](DEPLOY.md).

`refresh.sh` needs `.venv/` in the repo root. If it's missing the script falls
back to system `python3`, which doesn't have `requests`/`bs4`/`pydantic`, and
every run dies with `ModuleNotFoundError: No module named 'requests'`. Fix:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Safety net: `refresh.sh` refuses to commit if the scrape returns fewer than 8
pools — guards against site HTML changes or network blips blanking the site.
There are currently 13 indoor pools, so <8 means something went wrong.

The "Last updated: …" line in the header comes from `nyc_pools_meta.json`
(`updated_at`), which the scraper rewrites on each run.

## UI state (App.jsx)

Defaults are opinionated for the most common use case:

- Borough: **Manhattan**
- Activity: **Lap Swim**
- Day: **Today**

Selections persist across reloads via `localStorage` (`poolfinder.borough` /
`.activity` / `.day`, no expiry) — the defaults above only apply on first
visit or when a stored value fails validation against the known filter
values (`usePersistedFilter` in `App.jsx`).

There is no "show closed pools" toggle. Closed pools have no schedules, so
whenever an activity or day filter is active they drop out on their own; with
filters off they show and sort last. Worth knowing when a pool you expect to
see isn't there — and why closure `notes` are invisible in the default view.

Filter helpers live in `src/utils.js`:

- `getBorough(pool)` — falls back to zip-prefix lookup when the scraped
  record has no `borough` field.
- `ACTIVITIES` + `matchesActivity` — regex-based session-type matching
  (Lap Swim, Open Swim, Family Swim, Learn to Swim, Water Exercise, Swim
  Team). Open Swim explicitly excludes "lap" to avoid double-matching.
- `matchesDay` — "Today" / "Tomorrow" / "Week" against the schedule's
  `days` string.
- `isPastToday` — when "Today" is active, hides schedules whose end time
  has already passed (parses `"9:45 a-11:15 a"` style ranges).

Pool sort order: open → transitioning → closed.

## Known gotchas

- **`.venv/` is required and gitignored.** A fresh clone can't run
  `refresh.sh` until you create it — see the data refresh section above.
- **Push auth.** Uses the login keychain, so the job only fires while that Mac
  is awake and logged in. That gap is what `refresh.sh --if-stale 36` covers,
  run by hand from either Mac. See DEPLOY.md.
- **Fallback HTML and React must agree.** See the SEO section — divergence
  reads as cloaking, and nothing in the build catches it automatically.
- **Membership prices are hand-typed.** They have a "checked on" date, not a
  scrape. See the membership section.
- **Vite `base` (`vite.config.js`) and `SITE_URL` (`vite-plugin-seo.js`) are
  independent constants that must describe the same URL.** Both say the site is
  at the root of `pools.thinkdesign.com`. Change one without the other and you
  get either 404'd assets or canonical/JSON-LD/sitemap URLs pointing at the
  wrong place — silently, since nothing in the build compares them.
- **Borough inference relies on zip prefix.** If NYC ever assigns a new
  zip prefix outside the table in `utils.js`, those pools will fall into
  the "Other" bucket.
- **Activity regexes are heuristic.** New session-type strings from the
  scraper may not match any of the six buckets and will be invisible
  while a specific activity is selected. Check `ACTIVITIES` if a real
  session goes missing.

## Open follow-ups

Needs a human (can't be done from the repo):

- **Submit `sitemap.xml` in Google Search Console** — see below, it's more
  involved than it sounds. Started 2026-08-03, parked before completion.
- **Replace `public/og-image.png`.** It's a placeholder copy of the Think
  Design logo at 548×289; social cards want 1200×630.
- ~~Add the pool sitemap to the root robots.txt~~ — **done 2026-09-01.**
  Search Console submission is still parked (see below); the robots.txt line
  covers Bing and other crawlers in the meantime.

### Search Console — parked, and why it's fiddly

**Submitting the sitemap is the easy part. Getting a verified property is not.**
Search Console won't accept a sitemap until the property exists and is verified.
The move to its own subdomain makes this simpler still:

- Either a **Domain property** for `thinkdesign.com` (a DNS TXT record, which
  also covers the subdomain) or a **URL-prefix** property for exactly
  `https://pools.thinkdesign.com/` works.
- For a URL-prefix property, verification is easiest via the **HTML tag** method.
  Google issues a token; add `<meta name="google-site-verification" content="…">`
  to `index.html`, push, and Netlify has it live within a minute or two. Then
  click Verify. The HTML-file method also works — drop the file in `public/` and
  it lands at `/<file>.html` — but the meta tag is one line and can't be
  forgotten during a rebuild.
- Once verified, the sitemap field wants just `sitemap.xml` (it's relative to
  the property URL).
- You must be signed into the Google account that should own the property.

Blocked on 2026-08-03 because the Claude in Chrome extension had
`search.google.com` in its blocked-sites list. Granting the extension access to
that host is the first step next time.

The move to `pools.thinkdesign.com` collapsed the last of the old blockers: the
site owns a domain root, so its own `robots.txt` advertises the sitemap and a
URL-prefix property covers the whole site. Search Console still needs a verified
property before Google will take a submission. Add the new property when you do
— the old `thinkdesign.com/pools/` prefix, if it was ever created, should be
left to age out behind the 301.

Code:

- **Per-pool pages, homepage pool index, filter state in the URL** — planned
  but not built; the reasoning, build order and gotchas are in
  [SEO roadmap](#seo-roadmap--per-pool-pages-planned-2026-09-08) above. Start
  there before touching SEO, and note the `/pools/*` redirect trap.
- Scrape membership pricing instead of hand-maintaining it — the URL is
  stable and the markup is a clean table.
- Geolocation / "pools near me" sort (needs lat/lng in the scraped data;
  currently only address + zip). Step 4 of the SEO roadmap.
- Surface a clear empty-state when a borough/activity/day combo has no
  matches *because everything ended for today* vs. *no schedule at all*.
- ~~Add a small banner if `meta.updated_at` is more than ~48h old~~ — **done**;
  `STALE_AFTER_HOURS` in `src/utils.js` and the banner in `App.jsx`.

## Operational checks

- **Site looks empty / blanked out:** check the most recent commit on
  `main` — if `refresh.sh`'s 8-pool guard tripped,
  `~/Library/Logs/poolfinder-refresh.log` on the primary Mac will say so.
- **Deploy didn't run:** Actions tab → "Deploy". The `deploy-wpe` job needs
  the `WPE_SSHG_KEY_PRIVATE` secret; the Pages redirect job needs the Pages
  source set to **Actions** (not a branch), under repo Settings → Pages.
- **Manual refresh:** `./scripts/refresh.sh` from the repo root on either
  Mac. Safe to run by hand; it pulls, scrapes, sanity-checks, and only
  pushes if the data actually changed. It refuses to run off `main`.
- **Data going stale:** if `meta.updated_at` is drifting past ~36h, the primary
  Mac has been off. Either wake it and `launchctl kickstart` the agent (label
  in DEPLOY.md), or run `./scripts/refresh.sh --if-stale 36` from the other Mac.

## Dated schedules (this week / next week)

NYC Parks serves **any** week of a rec center's schedule at

```
/facilities/recreationcenters/<POOL_CODE>/schedule/<YYYY-MM-DD>   # a Monday
```

The undated `/schedule` is just that endpoint defaulting to the current week.
The scraper passes an explicit Monday for both weeks, so a run that straddles
midnight can't produce a half-shifted result.

The day-column headers read `Monday 9/7`. The scraper used to strip that date
(`DAY_DATE_SUFFIX_RE`) and keep only the weekday, which is why the schedule data
was an undated recurring grid and why a "next week" filter had nothing to filter
on. It now keeps the date, and cross-checks each column's `m/d` against the date
requested — if the site ever ignores the date in the URL, the week is dropped
rather than silently mislabelled.

Each day cell also carries things the old parser discarded:

| Markup | Meaning |
| --- | --- |
| `div.center-hrs` | that day's building hours, or `Closed` |
| `div.alert` + `h3` | holiday notice — "Labor Day: Recreation Centers will be closed." |
| `div.alert-error` | "There are no programs at this pool today." |

These land in **separate fields**, `holiday` and `note`, because only one of
them is worth showing. "There are no programs at this pool today" restates an
empty list; "Labor Day: Recreation Centers will be closed" explains it. Any
front-end that wants to surface a closure reason should read `holiday` and
ignore `note` — do not re-derive the distinction with a regex over the prose,
the markup already draws it.
| `p.program` | a session: time, `a.program-popup` name, `span.room` |

**A week with no programs at all collapses the body row into one `colspan`
cell** ("There are no programs scheduled at this time") instead of seven. Zip
that against seven headers and you pair it with Monday and lose Tuesday–Sunday,
leaving a one-day week. `parse_schedule` detects the mismatch, and emits seven
empty days carrying the week-level note. Any other header/cell count mismatch
drops the week rather than guessing.

**Page-level notices are now scoped to alerts outside the schedule table.**
`div.alert-error` is used both for real closure banners and for the per-day
"no programs" line inside the grid; the old page-wide `find_all` swept up both.

### Two shapes, on purpose

- `schedules` — flat, undated, **current week only**, cleared when the pool is
  closed. This is what the **mobile app** reads; leave its shape alone. Adding
  dated rows here would list Monday twice.
- `schedule_weeks` — `[{start, end, days: [{date, weekday, building_hours,
  note, sessions}]}]`, both weeks, populated even for closed pools. The website
  uses this.

Why closed pools still get weeks: Chelsea (M260) is closed as of 2026-09-05 and
reopens 9/8 with 17 sessions in the 9/7–9/13 week.

### Reopening pools surface in the week they reopen

`reopeningDate(pool, dayKey, weeks)` returns the first date **inside the
selected range** on which a closed pool actually has sessions, or null. A pool
it returns a date for is promoted into the grid for that range and removed from
the closed list — being in both would have the same pool saying two different
things.

The date comes from the timetable, never from the closure prose. For Chelsea
three independent sources agree on 2026-09-08, which is the check worth
repeating if this logic is ever touched:

| Source | Value |
| --- | --- |
| Notice text | "The center will reopen to the public on Tuesday, September 8." |
| `reopens` (regex over the notice) | `September 8` |
| First day in range with sessions | `2026-09-08` |

Note it correctly skips Monday 9/7 — Labor Day, zero sessions — rather than
taking the first day of the week.

The card does **not** read as open: `StatusBadge` swaps to the amber
`transitioning` style and reads "Reopens Tue 9/8", and the schedule heading
gains "· from Tue 9/8". `isClosed` in `PoolCard` becomes
`status === 'closed' && !reopening`, which is what lets the timetable render at
all — so if you add another closed-pool branch there, check both flags.

Under Today / Tomorrow / this-week nothing is promoted (verified), so the
default view is byte-identical to before and the build-time SEO fallback — which
mirrors the *unfiltered* view — needs no matching change.

### What the dates fixed

Filtering is now by calendar date, not weekday name, so **Today on a holiday is
genuinely empty**. Before this change, selecting Today on Labor Day (9/7) would
have shown every pool's usual Monday sessions — all 13 centers are closed.

Verified 2026-09-05, this week vs next: Chelsea 0→17, Constance Baker Motley
19→0, Shirley Chisholm 23→9, St. John's 37→30, Gertrude Ederle 17→14, Roy
Wilkins 16→13. The two week buttons are not cosmetic.

### Filter values vs. labels

The day pills persist to `localStorage`. Their **values** are stable
(`Today` / `Tomorrow` / `ThisWeek` / `NextWeek`); only the **labels** carry
dates. Storing a label would invalidate everyone's saved filter every Monday.
The pre-dated value `Week` migrates to `ThisWeek` (`usePersistedFilter`'s
`migrations` argument).

Labels are derived from `schedule_weeks` rather than the reader's clock
(`scheduleWeeks()` in `utils.js`), so if a refresh is missed the buttons name
the weeks we actually have. The staleness banner is what flags the gap.

## The privacy page is indexable (changed 2026-09-05)

`public/privacy/index.html` used to carry `<meta name="robots" content="noindex">`,
which is why the sitemap listed only the homepage — a noindex page in a sitemap
is a contradiction Search Console reports as *"Submitted URL marked 'noindex'"*.
The noindex is gone, it now has a canonical and a description, and the sitemap
lists it.

`vite-plugin-seo.js` builds the sitemap from a `pages` array now rather than
hardcoding one URL. Two rules for anything added to it: it must not carry a
noindex, and it only gets a `lastmod` if there is a real date to point at — the
privacy page has none, so it carries none rather than a guessed one. Pool
anchors stay out; they are fragments, not URLs.

It is linked from a footer at the bottom of the page, so crawlers reach it by
following a link rather than only through the sitemap. **That footer exists
twice** — in `App.jsx` and again in `buildFallbackHtml()` in
`vite-plugin-seo.js` — and the two must keep saying the same thing, same links
in the same order. Nothing in the build catches drift; see the cloaking note in
the SEO section.

## Holiday closures on the cards

`holidaysForFilter(pool, dayKey, weeks)` returns the named closures inside the
selected range; `PoolCard` renders each as an amber line above the session list,
so a missing weekday reads as "the centers are shut" rather than "this pool has
nothing on". Verified 2026-09-05: nothing renders under Today or this week, and
every card under 9/7–9/13 carries "Mon 9/7 Labor Day: Recreation Centers will be
closed."

`holidaysInRange(pools, …)` is the page-level counterpart, and exists for the
case the per-card version cannot cover: **when a holiday empties the grid there
is no card left to carry the explanation.** Selecting Today on Labor Day used to
render "No pools match your filters", blaming the reader's filters for a
citywide closure. It now reads:

```
Labor Day — recreation centers are closed.
No pools have sessions on Mon 9/7.
```

This is filter-dependent and so has no counterpart in the build-time SEO
fallback, which mirrors the *unfiltered* view — the same reasoning as the
staleness banner. See the note in `vite-plugin-seo.js`.

## PWA (installable + offline)

Added with `vite-plugin-pwa` (`generateSW` mode). What ships: a
`manifest.webmanifest`, a Workbox service worker precaching the app shell, and
an icon set under `public/icons/`.

### Why offline actually works here

`App.jsx` imports `nyc_pools_live.json` **at build time**, so the JS bundle *is*
the data. Precaching the shell therefore precaches every schedule — which is the
whole point at a pool door with no signal. There is no runtime fetch to make
resilient.

`dist/nyc_pools_*.json` is excluded from the precache (`globIgnores`): it exists
only for the mobile app, the website never reads it, and precaching 150KB nobody
fetches is pure waste.

### Staleness still works, and that is not an accident

The obvious worry with offline caching is serving month-old schedules silently.
It doesn't happen: `meta.updated_at` is baked into the cached bundle and
`dataAgeHours()` compares it against the **live** clock, so a stale cache
reports itself stale and the 48h banner fires normally.

### Update flow

`registerType: 'prompt'`. A new build waits rather than replacing the page a
reader is looking at; `UpdatePrompt.jsx` shows a toast with a Refresh button and
re-checks hourly for long-lived installed sessions. If the reader ignores it,
the staleness banner is the backstop.

**`sw.js` and `manifest.webmanifest` are configured `max-age=0, must-revalidate`**
(see `netlify.toml`). This is the one piece that must not be got wrong: a cached
service worker pins returning visitors to an old build forever and no prompt can
fire. `workbox-*.js` is content-hashed and stays immutable.

**Cloudflare currently overrides that**, verified 2026-09-05: `/sw.js` comes back
`max-age=14400` (4h). It is the edge, not Netlify — `/assets/*` and
`/workbox-*.js` both keep the repo's `immutable` rule, and a cache-busting
request that reached origin (`cf-cache-status: MISS`) still returned 14400.
Cloudflare's Browser Cache TTL raises short max-ages on extensions it caches:
`.js` yes, `.webmanifest` no, which is exactly the split seen live.

The practical impact is small — browsers do not serve the service worker script
from the HTTP cache anyway (`updateViaCache` defaults to `'imports'`, plus the
spec's 24h bypass) — so update prompts still fire. To make it correct, add a
Cloudflare Cache Rule bypassing `/sw.js`. That is a dashboard change, not a repo
one.

### Icons

`scripts/make_icons.py` draws them — sky-600 ground, the same waves motif as the
header — and is committed so any size can be regenerated. It needs Pillow, which
system `python3` has; it is deliberately **not** in `requirements.txt`, because
that file is the scraper's and `refresh.sh` must stay lean.

`og-image.png` is untouched and remains the social card. It is a 548x289
placeholder that squashes badly into a square, which is why the favicon now
points at `icons/favicon-32.png` instead.

Maskable icons inset the glyph to the middle 80% so Android's circular crop
doesn't shave it. iOS ignores the manifest for the home-screen label and uses
`apple-mobile-web-app-title` ("Pool Finder") — `<title>` is far too long to fit.

### Gotchas

- **`npm run dev` has no service worker** (`devOptions.enabled: false`). Test
  with `npm run build && npm run preview`, never the dev server.
- `directoryIndex: 'index.html'` is set so an offline visit to `/privacy/`
  resolves to the precached `privacy/index.html` rather than falling through to
  the app shell.
- The SEO plugin is listed **before** `VitePWA` in `vite.config.js` so the
  service worker hashes the final index.html — the one carrying the injected
  JSON-LD and no-JS fallback. Reversing them would precache a pre-injection
  shell and quietly serve crawlers different HTML than visitors.
- `UpdatePrompt` is filter-independent UI with no counterpart in the build-time
  SEO fallback, same as the staleness banner.

### Open question: overlap with the mobile app

There is already a mobile app consuming `nyc_pools_live.json`. An installable
PWA covers overlapping ground; worth deciding whether they complement each other
or whether one should be retired, before investing further in either.
