# NYC Indoor Pool Finder — Hand-off

A static React/Vite site that lists NYC indoor public pools and their
lap-swim / open-swim / etc. schedules, sourced from `nycgovparks.org`.

- **Live:** https://thinkdesign.com/pools/ (WP Engine, env `thinkdesignprd`; the old
  GitHub Pages URL now serves only a redirect here)
- **Repo:** `Think-Design-NYC/nyc-pool-finder` (default branch `main`)

## How the pieces fit

```
scraper.py            → writes nyc_pools_live.json + nyc_pools_meta.json
                        (3 requests per pool: listing, rec center page, detail page)
scripts/refresh.sh    → runs scraper, sanity-checks, commits, pushes (launchd)
src/App.jsx           → imports the JSON at build time, renders the UI
src/faq.js            → FAQ copy, shared by the UI and the build-time SEO output
src/membership.js     → membership prices (hand-maintained, NOT scraped)
vite-plugin-seo.js    → build-time JSON-LD, no-JS fallback HTML, sitemap.xml
.github/workflows/    → deploy.yml: build + publish to WP Engine on push to main
                        (plus a GitHub Pages job that publishes only a redirect page)
mobile/               → React Native (Expo) app; bundles the root JSON as a
                        snapshot and fetches the published JSON at launch
```

Data is baked in at build time (`import pools from '../nyc_pools_live.json'`),
so a data refresh = a commit = an auto-deploy. There is no runtime fetch on the
website; the mobile app fetches the published JSON (see Hosting below).

## Hosting (WP Engine)

The deploy workflow pushes `dist/` to the `thinkdesignprd` environment under
`pools/` (see [DEPLOY.md](DEPLOY.md)). Quirks of that host worth knowing:

- **thinkdesign.com is behind Cloudflare.** HTML responses get a Cloudflare
  bot-management script injected on the way out; JSON is served clean.
- **JSON is cached with `max-age=600`, and query strings are part of the cache
  key.** The build copies `nyc_pools_live.json` + `nyc_pools_meta.json` into
  `dist/`, so they're published at `https://thinkdesign.com/pools/nyc_pools_live.json`
  for the mobile app — which uses version-keyed URLs to bust that cache.

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

Note `public/robots.txt` is still inert for crawlers: it lands at
`/pools/robots.txt`, and robots.txt is only honoured at the domain root. The
root-domain robots.txt and sitemap for thinkdesign.com must be configured in
WordPress — a manual follow-up for Ray. Submit the sitemap in Search Console
regardless.

## Data refresh (runs locally, not on GitHub)

`nycgovparks.org` returns **403 Forbidden** to datacenter IPs, so the scraper
cannot run on GitHub-hosted runners. It needs a residential IP.

**It currently runs on Ray's Mac**, daily at 06:00 local, via a launchd agent —
not the Raspberry Pi. Moving it to the Pi is still an option; both setups are
written up in [DEPLOY.md](DEPLOY.md).

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

## Mobile app (`mobile/`)

React Native + Expo (SDK 57, managed workflow, plain JavaScript). Single
screen, no navigation lib; RN `StyleSheet` with tokens in
`mobile/src/lib/theme.js` (no NativeWind). Own `package.json` — nothing in the
website build touches it. Developed on branch `expo-app`.

```bash
cd mobile
npm install
npx expo start      # Expo Go on simulator/device
npm test            # jest-expo
```

### Data flow (offline-first)

`usePoolData()` in `mobile/src/lib/hooks.js`:

1. Seeds synchronously from the **bundled snapshot** — the repo-root
   `nyc_pools_live.json` is `require`d directly (Metro resolves outside
   `mobile/` without extra config), so a fresh install renders offline.
2. Overlays the **AsyncStorage cache** (`poolfinder.dataCache`) only if its
   `updated_at` is newer than what's displayed.
3. Fetches `nyc_pools_meta.json?t=<now>`, then `nyc_pools_live.json?v=<updated_at>`
   from `https://thinkdesign.com/pools` — version-keyed URLs so the host's
   600s CDN cache can't pin a stale copy. Validation is strict (JSON
   content-type to reject a WordPress HTML fallback, array of ≥8 pools,
   count matching meta). Any failure is **silent by design**: keep
   cached/bundled data. Success writes pools+meta as one atomic cache record.

Filters persist in AsyncStorage under the same `poolfinder.borough/activity/day`
keys the website uses in localStorage; first render is gated on hydration so a
stored selection isn't clobbered by the defaults. `StalenessBanner` appears when
`updated_at` is >48h old, but only after the fetch settles — the bundled
snapshot is always stale on a fresh install, so flagging it pre-fetch would
show the banner on every first launch.

### Kept in sync with the website by hand

- `mobile/src/lib/{utils,faq,membership}.js` are ports of `src/*`. `faq.js`
  and `membership.js` should stay **byte-identical** to the website's;
  `utils.js` differs only in theme tokens replacing Tailwind class strings
  (and drops the SEO-only `poolAnchorId`). Nothing catches drift — when you
  change the website copy, change the app's copy.
- Unlike the website, `pools` changes at runtime (the fetch replaces the
  snapshot), so **every `useMemo` in `mobile/App.js` depends on `pools`**.
  Copying a memo from `App.jsx` without adding that dependency silently
  freezes the UI on the bundled data.
- All the copy rules apply: "Indoor" in the name, never "free" for pool
  access, never the $100/yr tier.

### Test-suite quirks (all learned the hard way)

- Testing Library RN v14 + React 19: `render`, `renderHook` **and**
  `fireEvent` are all async — `await` every one, or state doesn't flush and
  you get overlapping-`act()` warnings.
- `jest.setup.js` sets `IS_REACT_ACT_ENVIRONMENT` and mocks
  `@react-native-async-storage/async-storage` and
  `react-native-safe-area-context` (without the latter, `SafeAreaView`
  renders nothing and every App-level test silently sees an empty tree).
- `workerIdleMemoryLimit: "1GB"` in the jest config works around a Node 26
  heap crash.
- `lucide-react-native` ships raw ESM `.mjs` that jest-expo's transform
  regex doesn't cover; it's `moduleNameMapper`'d to its CJS build by
  absolute `<rootDir>` path because the package `exports` map blocks the
  subpath import. Don't replace jest-expo's `transformIgnorePatterns`
  wholesale trying to fix this — that breaks `expo-modules-core`.

### Store readiness

Configured in `mobile/app.json` / `mobile/eas.json`:

- Name **"NYC Indoor Pool Finder"**, slug `nyc-pool-finder`, bundle ID /
  package `com.thinkdesign.nycpoolfinder` on both platforms.
  `ITSAppUsesNonExemptEncryption: false` (no custom crypto) skips Apple's
  export-compliance question on every submission.
- Icon and splash PNGs in `mobile/assets/` are **exported from the SVG
  sources in `mobile/assets/src/`** — edit the SVGs and re-export; don't
  touch the PNGs directly. Splash/adaptive-icon background is `#0284c7`
  (the theme's sky-600).
- `eas.json`: `preview` = internal distribution, Android builds an APK
  (sideloadable without Play Console); `production` = auto-incremented
  build numbers, version source `remote`.
- **Expo Go ignores all of this** — icon, splash, and bundle ID only take
  effect in a real (EAS) build, so "it looks right in Expo Go" verifies
  none of it.

Still to do: `eas login` + `eas init` (attaches the Expo `projectId` to
`app.json`), `eas build --profile preview` on both platforms, then the
**offline test of that preview build** (fresh install, airplane mode —
proves Metro bundled the root JSON into a production bundle, not just the
dev server). Store privacy declarations ("no data collected"; policy is
live at <https://thinkdesign.com/pools/privacy/>), then `eas submit` once
the Apple Developer / Play Console accounts exist.

## Known gotchas

- **`.venv/` is required and gitignored.** A fresh clone can't run
  `refresh.sh` until you create it — see the data refresh section above.
- **Push auth.** On the Mac this uses the login keychain, so the job only
  fires while logged in. On the Pi it needs a write-enabled SSH deploy key;
  HTTPS push won't work non-interactively from cron. See DEPLOY.md.
- **Fallback HTML and React must agree.** See the SEO section — divergence
  reads as cloaking, and nothing in the build catches it automatically.
- **Membership prices are hand-typed.** They have a "checked on" date, not a
  scrape. See the membership section.
- **Vite `base` is `/pools/`.** If the site's path on thinkdesign.com ever
  changes, update `vite.config.js` (and `REMOTE_PATH` in the deploy workflow)
  or assets 404.
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
- **Configure root-domain robots.txt/sitemap in WordPress** — `/pools/robots.txt`
  is inert (see the SEO section), so thinkdesign.com's own robots.txt is what
  crawlers actually read.

### Search Console — parked, and why it's fiddly

**Submitting the sitemap is the easy part. Getting a verified property is not.**
Search Console won't accept a sitemap until the property exists and is verified.
The WP Engine move makes this easier than it was on github.io:

- Either a **Domain property** for `thinkdesign.com` (DNS TXT record — we control
  the domain now) or a **URL-prefix** property for exactly
  `https://thinkdesign.com/pools/` (with the trailing slash) works.
- For a URL-prefix property, verification is easiest via the **HTML tag** method.
  Google issues a token; add `<meta name="google-site-verification" content="…">`
  to `index.html`, push, and the deploy has it live at the property URL within
  minutes. Then click Verify. The HTML-file method also works — drop the file in
  `public/` and it lands at `/pools/<file>.html` — but the meta tag is one line
  and can't be forgotten during a rebuild.
- Once verified, the sitemap field wants just `sitemap.xml` (it's relative to
  the property URL).
- You must be signed into the Google account that should own the property.

Blocked on 2026-08-03 because the Claude in Chrome extension had
`search.google.com` in its blocked-sites list. Granting the extension access to
that host is the first step next time.

The move to thinkdesign.com collapsed the old blockers (no more shared
`github.io` subdomain), but the root-domain robots.txt/sitemap still need to be
configured in WordPress — see the SEO section.

Code:

- Scrape membership pricing instead of hand-maintaining it — the URL is
  stable and the markup is a clean table.
- Geolocation / "pools near me" sort (needs lat/lng in the scraped data;
  currently only address + zip).
- Surface a clear empty-state when a borough/activity/day combo has no
  matches *because everything ended for today* vs. *no schedule at all*.
- Add a small banner if `meta.updated_at` is more than ~48h old (scraper
  silently failing). Done in the mobile app (`StalenessBanner`); still open
  for the website.

## Operational checks

- **Site looks empty / blanked out:** check the most recent commit on
  `main` — if `refresh.sh`'s 8-pool guard tripped, the log on the Pi
  (`/home/pi/pool-refresh.log`) will say so.
- **Deploy didn't run:** Actions tab → "Deploy". The `deploy-wpe` job needs
  the `WPE_SSHG_KEY_PRIVATE` secret; the Pages redirect job needs the Pages
  source set to **Actions** (not a branch), under repo Settings → Pages.
- **Manual refresh from the Pi:** `./scripts/refresh.sh` from the repo
  root. Safe to run by hand; it pulls, scrapes, sanity-checks, and only
  pushes if the data actually changed.
