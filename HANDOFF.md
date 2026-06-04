# NYC Pool Finder — Hand-off

A static React/Vite site that lists NYC indoor public pools and their
lap-swim / open-swim / etc. schedules, sourced from `nycgovparks.org`.

- **Live:** https://think-design-nyc.github.io/nyc-pool-finder/
- **Repo:** `Think-Design-NYC/nyc-pool-finder` (default branch `main`)

## How the pieces fit

```
scraper.py            → writes nyc_pools_live.json + nyc_pools_meta.json
scripts/refresh.sh    → runs scraper, sanity-checks, commits, pushes (Pi cron)
src/App.jsx           → imports the JSON at build time, renders the UI
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
