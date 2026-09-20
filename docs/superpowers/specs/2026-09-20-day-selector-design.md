# Day Selector: Named Weekdays Instead of Week Ranges — Design

**Date:** 2026-09-20
**Status:** Approved

## Problem

The day filter currently offers `Today · Tomorrow · 9/14 – 9/20 · 9/21 – 9/27`.
The two week options render a 7-day grid of sessions that is too dense to be
useful, and two relative days next to two date ranges makes the four pills
feel mismatched.

## Decision

Replace the two week pills with the next two single days, named by weekday.
On a Sunday the selector reads `Today · Tomorrow · Tuesday · Wednesday`.
All four pills are **relative** — they mean "N days from when you look"
(offsets 0–3) and roll forward each day. Whole-week filtering is removed from
the homepage; the per-pool pages' full two-week tables become the only
whole-week view.

## Pills and labels

- Labels: `Today`, `Tomorrow`, then the weekday names at offsets 2 and 3,
  derived from the reader's clock — as Today/Tomorrow already are.
- The old rule that pill labels come from the scraped data existed because the
  week labels contained dates. A weekday name cannot claim data we lack; if a
  selected day has no data, the existing empty-grid message and staleness
  banner cover it. No new failure mode.
- The named pills carry aria-labels with the full date ("Tuesday,
  September 22"), replacing the week pills' spoken-date `ariaLabel`.

## State and persistence

- Internal tokens: `Today`, `Tomorrow`, `Plus2`, `Plus3` (replacing
  `ThisWeek`/`NextWeek` in `DAY_FILTERS`). Tokens are stable; labels roll.
- **Serialization is the resolved ISO date**, in both the URL and
  localStorage: clicking the +2 pill on 2026-09-20 writes `?day=2026-09-22`.
  A copied link therefore pins the actual day the sharer meant.
- **Deserialization maps the date back by offset from the reader's today:**
  offsets 0–3 select the matching pill (a "Tuesday" link shared on Sunday,
  opened on Monday, arrives with the *Tomorrow* pill active — still showing
  Tuesday). A past date, or one beyond offset 3, falls through: URL → stored
  value → the `Today` default. No state where a day renders without a pill lit.
- localStorage self-cleans: a stored date from last week is stale on read and
  falls back to Today. A day pick is not treated as a durable preference the
  way borough/activity are.
- Legacy values: `?day=today` / `?day=tomorrow` slugs (old bookmarks) and raw
  `Today`/`Tomorrow` tokens (current visitors' localStorage) are still
  accepted as aliases for offsets 0/1. `thisweek`, `nextweek`, `ThisWeek`,
  `NextWeek`, and the pre-dated-labels `Week` have no single-day equivalent
  and resolve to Today via the existing `migrations` map / fall-through.

## Filtering internals

- `datesForFilter` returns a single-date Set for all four tokens; the 7-day
  week branch is deleted.
- Deleted as dead: `isWeekFilter`, `weekLabel`, and the week-option half of
  `dayFilterOptions`. `dayFilterOptions` no longer needs the scraped weeks;
  the `weeks` plumbing (`scheduleWeeks` → props → helper params) is removed
  wherever it only fed the deleted branches. (Confirm actual deadness during
  implementation — remove only what nothing else consumes.)
- The legacy fallback for data without `schedule_weeks` (`matchesDay`,
  weekday-name matching on the flat `schedules` list) extends its offset set
  from {0, 1} to {0–3}.
- Data coverage: the scrape holds this week + next (Mon–Sun), so offset 3 is
  always inside the window when data is fresh. Stale data yields an empty
  grid plus the staleness banner — the same behavior Today has now.

## Deliberately unchanged

- `hidePast` (sessions already ended are hidden) still applies only to Today.
- The per-row "Tue 9/22" `dayStamp` on cards stays.
- Pool pages keep their full two-week tables.
- The SEO fallback filters nothing, so there is no parity work; verify during
  implementation that no fallback copy names the week pills.
- `PoolDirectory` and the mobile-app JSON (`schedules`) are untouched.

## Verification

No test suite exists. Checks:

- Node-level sanity runs of the date helpers via their `from` parameter:
  labels and serialized dates on boundary days (Saturday/Sunday spilling into
  next week, month rollover).
- Browser: pill labels correct for today's date; clicking a named pill writes
  `?day=<ISO date>`; reload and Back restore the view; a hand-edited stale
  date falls to Today; legacy `?day=thisweek` falls to Today.

## Out of scope

- Any whole-week view on the homepage.
- More than four day options or a date picker.
- Changes to pool pages, the SEO fallback, or the scraper.
