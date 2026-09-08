#!/usr/bin/env bash
#
# Refresh NYC pool data and push it. Must run on a machine with a residential
# IP — nycgovparks.org returns 403 to datacenter/cloud IPs, so this cannot run
# on GitHub-hosted runners.
#
# On push, Netlify rebuilds and publishes the site
# (pools.thinkdesign.com).
#
# Scheduled on the primary Mac only (daily via launchd — see DEPLOY.md).
#
# `refresh.sh --if-stale <hours>` is a manual fallback for when that Mac has
# been off: it exits 0 without scraping unless the *published* data is already
# older than the given hours, so it's safe to run any time. Deliberately not
# on a second schedule — run it by hand from either Mac.
#
# One-time setup on a new machine:
#   git clone git@github.com:Think-Design-NYC/nyc-pool-finder.git
#   cd nyc-pool-finder
#   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
#   # push auth comes from the login keychain, so the job only runs while
#   # logged in; see DEPLOY.md for the launchd plists.

set -euo pipefail

# --if-stale <hours>: only scrape if the committed data is older than <hours>.
MAX_AGE_HOURS=""
if [ "${1:-}" = "--if-stale" ]; then
  MAX_AGE_HOURS="${2:?--if-stale requires an hour count, e.g. --if-stale 36}"
elif [ -n "${1:-}" ]; then
  echo "usage: $(basename "$0") [--if-stale <hours>]" >&2
  exit 2
fi

# Resolve repo root regardless of where cron/launchd invokes this from.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) refreshing pool data ==="

# Guard: this script commits and pushes, so it must never run off main. Without
# this, a scheduled run that fires while a checkout sits on a feature branch
# lands the refresh commit on that branch and pushes it.
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "ERROR: on branch '$branch', not main — refusing to scrape or push."
  exit 1
fi

# Use the project venv if present, else fall back to system python3.
PYTHON="$REPO_DIR/.venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="python3"

# Stay current so the push is a clean fast-forward, and so the staleness check
# below reads what the primary runner has actually published, not a stale local.
git pull --ff-only

# Staleness gate. Runs after the pull so it judges what the primary actually
# published, not a stale local checkout — a healthy primary always wins.
if [ -n "$MAX_AGE_HOURS" ]; then
  age_min="$("$PYTHON" -c "
import datetime, json
u = json.load(open('nyc_pools_meta.json'))['updated_at']
t = datetime.datetime.fromisoformat(u.replace('Z', '+00:00'))
print(int((datetime.datetime.now(datetime.timezone.utc) - t).total_seconds() // 60))
")"
  if [ "$age_min" -lt "$(( MAX_AGE_HOURS * 60 ))" ]; then
    echo "Data is $(( age_min / 60 ))h old (< ${MAX_AGE_HOURS}h) — primary runner is healthy, nothing to do."
    exit 0
  fi
  echo "Data is $(( age_min / 60 ))h old (>= ${MAX_AGE_HOURS}h) — primary runner looks stalled, scraping."
fi

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
  echo "Pushed updated data — Netlify rebuilds and publishes (pools.thinkdesign.com)."
fi
