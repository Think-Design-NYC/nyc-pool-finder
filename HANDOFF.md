# NYC Pool Finder — Hand-off

A static React/Vite site that lists NYC indoor public pools and their
lap-swim / open-swim / etc. schedules, sourced from `nycgovparks.org`.

- **Live:** https://think-design-nyc.github.io/nyc-pool-finder/
- **Repo:** `Think-Design-NYC/nyc-pool-finder` (default branch `main`)

## How the pieces fit

```
scraper.py            → writes nyc_pools_live.json + nyc_pools_meta.json
                        (3 requests per pool: listing, rec center page, detail page)
scripts/refresh.sh    → runs scraper, sanity-checks, commits, pushes (Pi cron)
src/App.jsx           → imports the JSON at build time, renders the UI
vite-plugin-seo.js    → build-time JSON-LD, no-JS fallback HTML, sitemap.xml
.github/workflows/    → deploy.yml: build + publish to GitHub Pages on push to main
```

Data is baked in at build time (`import pools from '../nyc_pools_live.json'`),
so a data refresh = a commit = an auto-deploy. There is no runtime fetch.

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
| `address`, `cross_streets`, `city`, `zip_code`, `building_hours`, `notes` | `/facilities/recreationcenters/{code}` |
| `membership_required` | `/parks/{code}/facilities/indoor-pools` |
| `schedules` | `/facilities/recreationcenters/{code}/schedule` |

Parsing notes, all learned the hard way from real pages:

- The address block is unlabelled text nodes, so `parse_address_block` anchors on
  the "Cross Streets:" `<strong>` and reads backwards.
- Most pages say `Brooklyn, NY 11213`, but some spell the state out
  (`Brooklyn, New York 11210`) — the regex accepts both and normalises to `NY`.
- `building_hours` keys use underscores (`Monday_Friday`) because the UI renders
  `day.replaceAll('_', ' – ')`.
- Only `div.alert-error` becomes `notes`. `alert-success` is general news and a
  bare `alert` is the membership-login promo. A site-wide "Membership Extensions"
  promo *is* classed `alert-error` on some pages, so it's filtered by text.
- **Nearest subway is not published anywhere on nycgovparks.org** — `PoolCard`
  still renders `location.nearest_subway` if it ever appears, but nothing fills
  it. Populating it would need an external MTA station dataset.

Known source gaps (not bugs): B250 has an empty `<p></p>` for cross streets, and
M103 has no Building Hours block because it's closed for reconstruction.

**All 13 pools require a Recreation Center membership** (free under 25, $25
seniors/veterans/disabled, $150 otherwise). Don't let "free" creep back into the
copy — only the outdoor pools are free.

## SEO

The app is client-rendered, so the HTML Pages serves would otherwise be an empty
`<div id="root">`. [vite-plugin-seo.js](vite-plugin-seo.js) fixes that at build
time — it reads `nyc_pools_live.json` and:

- injects JSON-LD (`ItemList` of `PublicSwimmingPool`, plus `WebSite`/`WebPage`/
  `FAQPage`), with opening hours merged from each pool's session times;
- injects a static mirror of the UI into `#root` for crawlers that don't run JS.
  React's `createRoot()` wipes it on mount, so users never see it;
- emits `sitemap.xml` with `lastmod` from the scrape timestamp.

**The fallback markup must keep saying what React says.** If the two diverge a
crawler comparing raw vs. rendered HTML reads it as cloaking. The FAQ copy lives
in [src/faq.js](src/faq.js) and is imported by both sides for exactly this reason;
`poolAnchorId()` in [src/utils.js](src/utils.js) is shared so JSON-LD `@id`
fragments match the rendered card `id`s.

Fallback styling uses a scoped `<style>` block, not Tailwind classes — the plugin
runs in `transformIndexHtml`, after Tailwind has scanned sources, so classes
introduced there would be purged.

Note `public/robots.txt` is inert on a github.io *project* page (robots.txt is
only honoured at the domain root, which this repo doesn't control). Submit the
sitemap in Search Console instead, or move to a custom domain.

## Data refresh (runs on the Pi, not GitHub)

`nycgovparks.org` returns **403 Forbidden** to datacenter IPs, so the scraper
cannot run on GitHub-hosted runners. It runs daily at 06:00 local on a
Raspberry Pi (residential IP), via `scripts/refresh.sh` in cron. Full setup
is in [DEPLOY.md](DEPLOY.md).

Safety net: `refresh.sh` refuses to commit if the scrape returns fewer than 8
pools — guards against site HTML changes or network blips blanking the site.
NYC has ~12 indoor pools, so <8 means something went wrong.

The "Last updated: …" line in the header comes from `nyc_pools_meta.json`
(`updated_at`), which the scraper rewrites on each run.

## UI state (App.jsx)

Defaults are opinionated for the most common use case:

- Borough: **Manhattan**
- Activity: **Lap Swim**
- Day: **Today**
- Show closed pools: on

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

- **Pi must have write-enabled SSH deploy key.** HTTPS push won't work
  non-interactively from cron. See DEPLOY.md.
- **Vite `base` is `/nyc-pool-finder/`.** If the repo is ever renamed or
  moved off project-pages hosting, update `vite.config.js` or assets 404.
- **Borough inference relies on zip prefix.** If NYC ever assigns a new
  zip prefix outside the table in `utils.js`, those pools will fall into
  the "Other" bucket.
- **Activity regexes are heuristic.** New session-type strings from the
  scraper may not match any of the six buckets and will be invisible
  while a specific activity is selected. Check `ACTIVITIES` if a real
  session goes missing.

## Likely next steps

- Geolocation / "pools near me" sort (needs lat/lng in the scraped data;
  currently only address + zip).
- Persist filter selections to `localStorage` so reloads keep state.
- Surface a clear empty-state when a borough/activity/day combo has no
  matches *because everything ended for today* vs. *no schedule at all*.
- Add a small banner if `meta.updated_at` is more than ~48h old (scraper
  silently failing).

## Operational checks

- **Site looks empty / blanked out:** check the most recent commit on
  `main` — if `refresh.sh`'s 8-pool guard tripped, the log on the Pi
  (`/home/pi/pool-refresh.log`) will say so.
- **Deploy didn't run:** Actions tab → "Deploy to GitHub Pages". Pages
  source must be **Actions** (not a branch), under repo Settings → Pages.
- **Manual refresh from the Pi:** `./scripts/refresh.sh` from the repo
  root. Safe to run by hand; it pulls, scrapes, sanity-checks, and only
  pushes if the data actually changed.
