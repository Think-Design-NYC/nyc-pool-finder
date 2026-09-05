# Deployment

## Hosting — Netlify (pools.thinkdesign.com)

The site is a static Vite/React build published by **Netlify's Git integration**.

- **Live URL:** https://pools.thinkdesign.com/
- **Trigger:** Netlify watches `main` and builds on every push — including the
  automated "Refresh pool data" commits, since the pool JSON is imported at
  build time rather than fetched at runtime.
- **Config:** [netlify.toml](netlify.toml) — `npm run build`, publish `dist`,
  Node 22, plus cache headers and a 301 from any stray `/pools/*` path to `/`.
  There is deliberately **no SPA catch-all rewrite**: the app is one page with
  anchor-only navigation, so unknown paths should 404 rather than return 200.
- The Vite `base` is `/` — the site sits at the root of its own subdomain.
- The build copies `nyc_pools_live.json` + `nyc_pools_meta.json` into `dist/`,
  so the mobile app fetches them at
  https://pools.thinkdesign.com/nyc_pools_live.json (CORS-open, no-cache).
- **No deploy secrets live in GitHub.** Netlify authenticates to the repo
  through its own GitHub app.

### DNS

`pools.thinkdesign.com` is a CNAME to the Netlify site's `*.netlify.app`
hostname (or Netlify's ALIAS/A record if the DNS host doesn't allow a CNAME at
that label). Netlify provisions the Let's Encrypt certificate once the record
resolves. thinkdesign.com itself stays on WP Engine and is untouched.

### GitHub Actions

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) no longer deploys
anything. It keeps two jobs:

- `build-check` — runs the same `npm run build` so a broken build is visible in
  GitHub, not only in a Netlify email.
- `deploy-pages-redirect` — publishes a one-page meta-refresh/JS redirect at the
  old GitHub Pages URL (https://think-design-nyc.github.io/nyc-pool-finder/),
  preserving `#pool-…` anchors.

### Still to do on WP Engine — 301 the old subpath

The `deploy-wpe` job is gone, so **thinkdesign.com/pools/ is now a frozen copy
of the old build**. Until it is redirected it competes with the subdomain for
the same queries. Add a permanent redirect in WordPress/WP Engine:

    /pools/(.*)  →  https://pools.thinkdesign.com/$1   [301]

and, while there, edit the static robots.txt at the WordPress web root to drop
the now-dead `Sitemap: https://thinkdesign.com/pools/sitemap.xml` line (Yoast
SEO → Tools → File editor). The repo's own [public/robots.txt](public/robots.txt)
is finally served at a domain root and is now the effective one for this site.

Then, in Google Search Console, add `pools.thinkdesign.com` as a property and
submit https://pools.thinkdesign.com/sitemap.xml.

## Outstanding — needs a human, cannot be done from this repo

As of 2026-09-05, in rough priority order:

1. **301 `thinkdesign.com/pools/` → `https://pools.thinkdesign.com/$1`** in
   WordPress/WP Engine. That path still returns **200** and serves a frozen copy
   of the last WP Engine build, competing with the subdomain for the same
   queries. The stale copy's canonical points at the subdomain, which helps, but
   is not a substitute for the redirect.
2. **Repoint the mobile app's JSON URL** to
   `https://pools.thinkdesign.com/nyc_pools_live.json`. It still fetches the old
   path and works only for as long as that 301 exists. The new URL is served
   `max-age=0, must-revalidate` with open CORS, so the app's version-keyed
   cache-busting URLs (a workaround for Cloudflare's 600s JSON cache in front of
   thinkdesign.com) are no longer needed.
3. **Drop the dead `Sitemap: https://thinkdesign.com/pools/sitemap.xml` line**
   from the static robots.txt at the WordPress web root (Yoast SEO → Tools →
   File editor). `public/robots.txt` in this repo is now the effective one.
4. **Cloudflare Cache Rule bypassing `/sw.js`** — the edge overrides it to a 4h
   browser cache. Low impact (see the PWA section in HANDOFF.md), but the header
   is wrong.
5. **Google Search Console property for `pools.thinkdesign.com`**, then submit
   the sitemap. Still parked; see HANDOFF.md.
6. **Replace `public/og-image.png`** — a 548x289 placeholder; social cards want
   1200x630. The PWA icons are already square and generated separately.

Verify 1–3 with:

```bash
curl -sSI https://thinkdesign.com/pools/ | head -1        # want 301, currently 200
curl -sS https://thinkdesign.com/robots.txt | grep -i sitemap
```

The pool data is imported at build time (`import pools from '../nyc_pools_live.json'`),
so refreshing the data means committing the JSON — which triggers a rebuild + redeploy.

## Data refresh — runs locally (two Macs: primary + backup)

`nycgovparks.org` returns **403 Forbidden** to datacenter/cloud IPs, so the scraper
**cannot** run on GitHub-hosted runners. It runs on a machine with a residential IP
instead. [scripts/refresh.sh](scripts/refresh.sh) scrapes, sanity-checks the result,
commits `nyc_pools_live.json` + `nyc_pools_meta.json`, and pushes — which auto-deploys.

The header shows **"Last updated: <date>"** from `nyc_pools_meta.json`, which the
scraper rewrites on each run.

There is no Raspberry Pi. Only the primary Mac runs it on a schedule; the
secondary is a dev machine that can also refresh by hand (see below).

**The two Macs use differently-named checkouts** — check which machine you're on
before assuming a path:

| Machine | Repo path | Role |
| --- | --- | --- |
| Primary | `/Users/rshah/Claude/Projects/pool-finder/` | scheduled refresh, daily 06:00 |
| Secondary | `/Users/rshah/Claude/Projects/nyc-pool-finder/` | development, manual refresh |

### Primary — macOS launchd (daily at 06:00 local)

A LaunchAgent runs [scripts/refresh.sh](scripts/refresh.sh) every day:

- **Plist:** `~/Library/LaunchAgents/com.thinkdesign.poolfinder-refresh.plist`
- **Script path:** `/Users/rshah/Claude/Projects/pool-finder/scripts/refresh.sh`
  (the old "Local Sites" checkout is gone)
- **Log:** `~/Library/Logs/poolfinder-refresh.log`
- **Venv:** `.venv/` in the repo (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`)
- Push auth uses the existing `gh`/git credentials in the login keychain.

Manage it:

```bash
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.thinkdesign.poolfinder-refresh.plist  # enable
launchctl kickstart gui/$UID/com.thinkdesign.poolfinder-refresh                               # run now
launchctl bootout   gui/$UID/com.thinkdesign.poolfinder-refresh                               # disable
```

If the Mac is asleep at 06:00, launchd runs the job on the next wake. The job only
fires while the user is logged in (it needs the login keychain for `git push`).

### Manual fallback — `--if-stale`

The scheduled job only fires while the primary Mac is awake and logged in, so
the data can go stale without anyone noticing. Either Mac can cover the gap on
demand:

```bash
./scripts/refresh.sh --if-stale 36
```

`--if-stale <hours>` pulls, reads `updated_at` from `nyc_pools_meta.json`, and
exits 0 **without scraping** unless the published data is already older than
`<hours>`. It's safe to run any time — when the primary is healthy it does
nothing and says so:

```
Data is 29h old (< 36h) — primary runner is healthy, nothing to do.
```

This is deliberately manual: there is **no** second scheduled job. If you ever
want one, a LaunchAgent running that command on a `StartInterval` is all it
takes — but then give it its own clone rather than pointing it at a checkout
you develop in.

`refresh.sh` refuses to run anywhere but `main`, since it commits and pushes.
