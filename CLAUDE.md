# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**NYC Indoor Pool Finder** — a static React/Vite site listing NYC's 13 indoor public pools and their schedules, scraped from nycgovparks.org. Live at https://pools.thinkdesign.com/ on Netlify (repo `Think-Design-NYC/nyc-pool-finder`, Netlify's Git integration builds from `main`; the old GitHub Pages URL and thinkdesign.com/pools/ now redirect here).

**[HANDOFF.md](HANDOFF.md) is the authoritative deep-dive** — scraper field sources, SEO rationale, gotchas, open follow-ups. Read it before non-trivial work, and keep it current when you change how things work.

## Commands

```bash
npm run dev          # vite dev server
npm run build        # build to dist/ (also runs the SEO plugin: JSON-LD, fallback HTML, sitemap)
npm run preview      # serve the built dist/

# Scraper (Python; needs the venv — see below)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # one-time setup
.venv/bin/python scraper.py    # rewrites nyc_pools_live.json + nyc_pools_meta.json
./scripts/refresh.sh           # scrape + sanity-check + commit + push (used by launchd/cron)
```

No test suite, no linter.

## Architecture

**Data is baked in at build time** — `App.jsx` imports `nyc_pools_live.json` directly; there is no runtime fetch. A data refresh is therefore a commit, which triggers a Netlify build (config in `netlify.toml`). `.github/workflows/deploy.yml` deploys nothing any more — it only runs a build check and publishes the GitHub Pages redirect page.

```
scraper.py            → nyc_pools_live.json + nyc_pools_meta.json (4 requests/pool:
                        facility, detail, and the schedule page twice — this week + next)
scripts/refresh.sh    → runs scraper, refuses to commit if <8 pools scraped
netlify.toml          → Netlify build command, publish dir, headers, /pools/* → / 301
src/App.jsx           → filter state, imports the JSON, renders the UI
src/utils.js          → borough inference (zip prefix), activity regexes, day/time matching, poolAnchorId()
src/faq.js            → FAQ copy shared by UI and build-time SEO output
src/membership.js     → membership prices, hand-maintained (NOT scraped)
vite-plugin-seo.js    → build-time JSON-LD, no-JS fallback HTML injected into #root, sitemap.xml
```

**The scraper cannot run in CI.** nycgovparks.org returns 403 to datacenter IPs; it runs on a residential IP. The primary Mac runs `refresh.sh` daily at 06:00 via launchd (no Raspberry Pi); the secondary Mac has no scheduled job, but `refresh.sh --if-stale 36` can be run there by hand and no-ops unless the published data is already >36h old. `refresh.sh` refuses to run off `main`. See DEPLOY.md. `refresh.sh` silently falls back to system `python3` if `.venv/` is missing, and then fails on imports — the venv is required.

## Invariants (violating these breaks things quietly)

- **Fallback HTML must say what React says.** `vite-plugin-seo.js` injects a static mirror of the UI for no-JS crawlers; if it diverges from `SeoContent.jsx` / `App.jsx`, crawlers read it as cloaking. Anything shared between the two goes through a module (`faq.js`, `membership.js`, `poolAnchorId()`). If you change the `<h1>`, headings, or body copy in React, change the plugin's fallback to match. Nothing in the build catches drift.
- **The site name is "NYC Indoor Pool Finder" — "Indoor" is load-bearing** (NYC's ~50 outdoor pools are a separate free system). The name appears in `index.html` meta tags, the `App.jsx` `<h1>`, the fallback `<h1>`, and the JSON-LD `WebSite`/`WebPage` nodes; keep them in sync.
- **All 13 pools require a paid Recreation Center membership — never let "free" into the copy.** Prices in `src/membership.js` are hand-typed; `MEMBERSHIP_CHECKED` is the date they were last verified and must be bumped by hand, never derived from the build date. Never quote the $100/yr tier — it excludes every center with a pool (name the "Access to All Centers" tier instead).
- **Fallback markup can't use Tailwind classes** — the SEO plugin runs after Tailwind scans sources, so classes introduced there get purged. It uses a scoped `<style>` block.
- **`schedules` is frozen for the mobile app; `schedule_weeks` is the real source.** NYC Parks serves any week at `/facilities/recreationcenters/<code>/schedule/<Monday>`, so the scraper pulls this week and next with real dates, per-day building hours and holiday notices. `schedules` stays a flat, undated, current-week list because the mobile app reads it — the site itself must use `schedule_weeks`. Adding dated rows to `schedules` would make Monday appear twice and break the app.
- **`schedule_weeks` is populated for closed pools too, and `schedules` is not.** A pool shut this week can have a full timetable next week (Chelsea reopens 9/8). The flat list is still cleared on closure so nothing renders a timetable for a locked building.
- **A closed pool is promoted into the grid only for a range it actually reopens in**, and then it must leave the closed list — appearing in both would state two different things about the same pool. `reopeningDate()` derives the return date from the first day in range that has sessions, never from the closure prose, and the card wears an amber "Reopens Tue 9/8" badge rather than a green "Open".
- **Vite `base` is `/`, matching the subdomain root.** If the site ever moves back to a subpath, `base` in `vite.config.js` *and* `SITE_URL` in `vite-plugin-seo.js` must both change — they are separate constants and nothing checks they agree.

## UI behavior worth knowing

- Filter defaults: Manhattan / Lap Swim / Today. Borough pills are dynamic (a borough hides when nothing matches the active filters).
- There is no "show closed" toggle: closed pools have no schedules, so any activity/day filter drops them naturally; unfiltered they show and sort last (open → transitioning → closed).
- Activity matching is regex-based (`ACTIVITIES` in `utils.js`); a new session-type string from the scraper that matches no bucket becomes invisible under activity filters.
