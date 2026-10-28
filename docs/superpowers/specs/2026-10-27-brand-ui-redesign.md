# Pool Finder Brand + UI Redesign — Design

**Date:** 2026-10-27
**Status:** Agreed, in progress
**Branch:** `rayrshah/pool-finder-brand-ui`

## Source

Figma "Pool Finder — Brand & UI" v4, exported as four SVGs (Desktop and
Mobile × "Search v4" and "Pool detail v4"). The exports are not in the repo;
they live on the designer's machine under `Downloads/Pool Finder — Brand & UI/`.

The palette in those mockups (`#0B2A4A`, `#1668E3`, `#F4F7FA`, …) is exactly
the v4 token set already applied in commit `19c0568` on `boston/v4-redesign`
(colours, self-hosted fonts, pin mark, PWA icons). That commit is the
foundation; the mockups add the new layouts on top.

## Decisions

1. **Name — lockup carries the full name.** The header shows the pin mark with
   a live-text wordmark: a small "NYC · Indoor" line over "Pool Finder", so it
   reads as "NYC Indoor Pool Finder". `<h1>`, `<title>`, meta, fallback and
   JSON-LD stay "NYC Indoor Pool Finder" (the "Indoor" invariant is unchanged).
   The mockup's dynamic headline ("Lap swim is on at 3 pools right now") is a
   subheading, never the `<h1>`. Rationale: Google picks a site name most
   reliably when every signal agrees, and "Pool Finder" alone is generic and
   drops the "indoor pool NYC" query terms.
2. **No "Free" entry box.** The mockup's "ENTRY: Free" becomes
   "ENTRY: Membership — from $25/yr · free 24 & under", from `membership.js`,
   linked to the membership details. Riverbank shows its own NYS entry terms.
3. **Features without data or a backend:**
   - Build: search (name / neighborhood / ZIP over the bundled pools),
     opt-in distance ("Use my location" — no geolocation prompt on load;
     unsorted-by-distance otherwise), per-session Add to calendar (`.ics`
     generated client-side), and the "Schedules checked today, 6:02 am · NYC
     Parks" badge from `meta.updated_at`.
   - Later: Saved pools (localStorage).
   - Swap: "Report a schedule change" → link to NYC Parks / mailto.
   - Drop: Sign in, "Remind me", outdoor-pool status (separate system the site
     doesn't track; blurs the "Indoor" distinction).
4. **Live status on pool pages via a small inline script.** Pool pages stay
   build-time static HTML with the complete timetable (what crawlers and no-JS
   readers get). An inline script adds only the live layer: now-line on the
   desktop timeline, DONE / ON NOW on the mobile list, "ends in …", and the
   "Up next" card. No external script, no app bundle. CLAUDE.md's pool-page
   invariant changes from "no JavaScript" to "complete without JavaScript; the
   script only adds live status".
5. **Map — SVG generated from real geodata.** A script turns NYC Open Data
   borough boundaries / shoreline (and major parks) into a flat, on-brand SVG,
   committed to the repo. Pins are positioned from `pool_meta.json` lat/lng
   with the same projection. No tiles, no third-party requests, works offline.
   No street detail or zoom; pool pages link out to Google / Apple Maps for
   directions. Desktop homepage: map pane with next-start-time pins
   (green = now, blue = soon, navy = later). Mobile: floating "Map" button.
   Pool page: small "Getting there" map beside the transit details.

## Phases

1. **Foundation.** Cherry-pick `19c0568`; resolve conflicts in `pool-page.js`,
   `PoolCard.jsx`, `SeoContent.jsx`; repaint styling that landed on `main`
   since (pool-page nearby list, Riverbank, closure links).
2. **Homepage ("Search").** Navy header band with lockup, checked-at badge,
   live headline and activity chips; search box; time chips (Now / Later
   today / Tomorrow morning / Pick a day) mapped onto the existing `day` URL
   filter; results grouped On now / Starting soon / Later tonight; new result
   cards (monospace times, status bar, neighborhood · borough); map pane.
   Borough filtering and `PoolDirectory` reachability must survive.
3. **Pool pages ("Pool detail").** Navy header with stats row (status / today's
   sessions / entry / pool size); desktop timeline, mobile today list; "Lap
   swim this week" chip rows from `schedule_weeks`; Getting there (map +
   `pool_meta` transit); Good to know (membership, call-ahead note with its
   existing emphasis); live-status script.
4. **Parity and checks.** Mirror every React heading/copy change in the
   `vite-plugin-seo.js` fallback; build; screenshots at 390 and 1440 wide;
   `npm run preview` for the service worker (pool pages still in both
   `globIgnores` and `navigateFallbackDenylist`); update HANDOFF.md and
   CLAUDE.md.
