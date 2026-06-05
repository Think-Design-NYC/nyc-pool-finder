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

## Data refresh — runs locally (currently on Ray's Mac)

`nycgovparks.org` returns **403 Forbidden** to datacenter/cloud IPs, so the scraper
**cannot** run on GitHub-hosted runners. It runs on a machine with a residential IP
instead. [scripts/refresh.sh](scripts/refresh.sh) scrapes, sanity-checks the result,
commits `nyc_pools_live.json` + `nyc_pools_meta.json`, and pushes — which auto-deploys.

The header shows **"Last updated: <date>"** from `nyc_pools_meta.json`, which the
scraper rewrites on each run.

### Current setup — macOS launchd (daily at 06:00 local)

A LaunchAgent runs [scripts/refresh.sh](scripts/refresh.sh) every day:

- **Plist:** `~/Library/LaunchAgents/com.thinkdesign.poolfinder-refresh.plist`
- **Log:** `~/Library/Logs/poolfinder-refresh.log`
- **Venv:** `.venv/` in the repo (`python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`)
- Push auth uses the existing `gh`/git credentials in the login keychain.

Manage it:

```bash
launchctl load   ~/Library/LaunchAgents/com.thinkdesign.poolfinder-refresh.plist   # enable
launchctl start  com.thinkdesign.poolfinder-refresh                                # run now
launchctl unload ~/Library/LaunchAgents/com.thinkdesign.poolfinder-refresh.plist   # disable
```

If the Mac is asleep at 06:00, launchd runs the job on the next wake. The job only
fires while the user is logged in (it needs the login keychain for `git push`).

### Future option — move to the Raspberry Pi (always-on)

To move the refresh to the Pi instead:

```bash
git clone git@github.com:Think-Design-NYC/nyc-pool-finder.git
cd nyc-pool-finder
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Give the Pi push access with an SSH **deploy key** (write-enabled):

```bash
ssh-keygen -t ed25519 -C "pi-pool-refresh" -f ~/.ssh/pool_finder
cat ~/.ssh/pool_finder.pub
# → add at: repo Settings → Deploy keys → Add deploy key → check "Allow write access"
git remote set-url origin git@github.com:Think-Design-NYC/nyc-pool-finder.git
```

Schedule with cron — `crontab -e`:

```
0 6 * * * /home/pi/nyc-pool-finder/scripts/refresh.sh >> /home/pi/pool-refresh.log 2>&1
```
