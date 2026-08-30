#!/usr/bin/env bash
#
# Refresh NYC pool data and push it. Designed to run from cron on a machine
# with a residential IP (e.g. a Raspberry Pi) — nycgovparks.org returns 403
# to datacenter/cloud IPs, so this cannot run on GitHub-hosted runners.
#
# On push, the deploy workflow rebuilds and publishes the site to WP Engine
# (thinkdesign.com/pools).
#
# One-time setup on the Pi:
#   git clone git@github.com:Think-Design-NYC/nyc-pool-finder.git
#   cd nyc-pool-finder
#   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
#   # add a write-enabled SSH deploy key so `git push` works non-interactively
#
# Cron (daily at 06:00 local), via `crontab -e`:
#   0 6 * * * /home/pi/nyc-pool-finder/scripts/refresh.sh >> /home/pi/pool-refresh.log 2>&1

set -euo pipefail

# Resolve repo root regardless of where cron invokes this from.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) refreshing pool data ==="

# Stay current so the push is a clean fast-forward.
git pull --ff-only

# Use the project venv if present, else fall back to system python3.
PYTHON="$REPO_DIR/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="python3"

"$PYTHON" scraper.py

# Guard: a broken scrape (site HTML changed, network blip) can produce an
# empty/short file. Don't let it overwrite good data and blank the site.
# NYC has ~12 indoor pools across 4 boroughs, so anything under 8 is suspect.
count="$("$PYTHON" -c "import json; print(len(json.load(open('nyc_pools_live.json'))))")"
echo "Scraped $count pools"
if [ "$count" -lt 8 ]; then
  echo "ERROR: only $count pools (<8) — refusing to commit, keeping last-good data."
  git checkout -- nyc_pools_live.json nyc_pools_meta.json
  exit 1
fi

if git diff --quiet -- nyc_pools_live.json nyc_pools_meta.json; then
  echo "No data changes."
else
  git add nyc_pools_live.json nyc_pools_meta.json
  git commit -m "Refresh pool data [automated]"
  git push
  echo "Pushed updated data — the deploy workflow publishes to WP Engine (thinkdesign.com/pools)."
fi
