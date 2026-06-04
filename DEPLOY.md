# Deployment

## Hosting — GitHub Pages (free)

The site is a static Vite/React build deployed by GitHub Actions.

- **Live URL:** https://think-design-nyc.github.io/nyc-pool-finder/
- **Workflow:** [.github/workflows/deploy.yml](.github/workflows/deploy.yml) — builds and
  deploys on every push to `main`.
- Pages is configured with the **Actions** build source (no branch/folder setting).
- The Vite `base` is `/nyc-pool-finder/` so assets resolve at the project subpath.

The pool data is imported at build time (`import pools from '../nyc_pools_live.json'`),
so refreshing the data means committing the JSON — which triggers a rebuild + redeploy.

## Data refresh — runs on the Raspberry Pi

`nycgovparks.org` returns **403 Forbidden** to datacenter/cloud IPs, so the scraper
**cannot** run on GitHub-hosted runners. It runs on the Pi (residential IP) instead.
[scripts/refresh.sh](scripts/refresh.sh) scrapes, sanity-checks the result, commits
`nyc_pools_live.json` + `nyc_pools_meta.json`, and pushes — which auto-deploys.

### One-time Pi setup

```bash
git clone git@github.com:Think-Design-NYC/nyc-pool-finder.git
cd nyc-pool-finder
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Give the Pi push access with an SSH **deploy key** (write-enabled):

```bash
ssh-keygen -t ed25519 -C "pi-pool-refresh" -f ~/.ssh/pool_finder
cat ~/.ssh/pool_finder.pub
# → add at: repo Settings → Deploy keys → Add deploy key → check "Allow write access"
```

Point the repo's remote at SSH and tell git which key to use (or add a Host entry in
`~/.ssh/config`):

```bash
git remote set-url origin git@github.com:Think-Design-NYC/nyc-pool-finder.git
```

### Schedule it (daily at 06:00 local)

`crontab -e`, then add:

```
0 6 * * * /home/pi/nyc-pool-finder/scripts/refresh.sh >> /home/pi/pool-refresh.log 2>&1
```

Test it once by hand first: `./scripts/refresh.sh`.

The header shows **"Last updated: <date>"** from `nyc_pools_meta.json`, which the
scraper rewrites on each run.
