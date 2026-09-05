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
[src/membership.js](src/membership.js), and `poolAnchorId()` in
[src/utils.js](src/utils.js) (so JSON-LD `@id` fragments match the rendered card
`id`s). **If you change the `<h1>`, the headings or the body copy in
`SeoContent.jsx`, change the fallback in `vite-plugin-seo.js` to match.**

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

- Scrape membership pricing instead of hand-maintaining it — the URL is
  stable and the markup is a clean table.
- Geolocation / "pools near me" sort (needs lat/lng in the scraped data;
  currently only address + zip).
- Surface a clear empty-state when a borough/activity/day combo has no
  matches *because everything ended for today* vs. *no schedule at all*.
- Add a small banner if `meta.updated_at` is more than ~48h old (scraper
  silently failing).

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
