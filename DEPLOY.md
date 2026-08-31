# Deployment

## Hosting — WP Engine (thinkdesign.com/pools)

The site is a static Vite/React build deployed by GitHub Actions to WP Engine.

- **Live URL:** https://thinkdesign.com/pools/
- **Workflow:** [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — builds and
  deploys on every push to `main`. The `deploy-wpe` job pushes `dist/` to the
  `thinkdesignprd` environment via `wpengine/github-action-wpe-site-deploy@v3`,
  authenticated by the repo secret `WPE_SSHG_KEY_PRIVATE` (an SSH private key whose
  public half is registered in the WP Engine SSH Gateway).
- The Vite `base` is `/pools/` so assets resolve at the subpath.
- The build also copies `nyc_pools_live.json` + `nyc_pools_meta.json` into `dist/`,
  so the mobile app can fetch them at https://thinkdesign.com/pools/nyc_pools_live.json.

**GitHub Pages now only serves a redirect.** The old URL
(https://think-design-nyc.github.io/nyc-pool-finder/) still gets a deploy on every
push — the `deploy-pages-redirect` job publishes a one-page meta-refresh/JS redirect
to thinkdesign.com/pools/ (preserving `#pool-…` anchors) so indexed URLs don't 404.

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
