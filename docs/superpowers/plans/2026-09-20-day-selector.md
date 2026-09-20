# Day Selector: Named Weekdays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ThisWeek/NextWeek day-filter pills with two single-day pills named by weekday (offsets +2/+3 from today), serializing the day filter as a resolved ISO date in the URL and localStorage.

**Architecture:** Internal filter state keeps four stable tokens (`Today`, `Tomorrow`, `Plus2`, `Plus3`); a token↔date mapping pair at the persistence boundary writes the resolved date out and maps dates back by offset from the reader's today, falling through to the default for stale/legacy values. All week-filter machinery in `src/utils.js` and the `weeks` plumbing in `src/App.jsx` become dead and are deleted. Spec: `docs/superpowers/specs/2026-09-20-day-selector-design.md`.

**Tech Stack:** React 18 + Vite. `src/utils.js` is dependency-free ESM — `node -e "import('./src/utils.js')…"` works directly (package.json has `"type": "module"`).

## Global Constraints

- **No test suite, no linter exists in this repo** (per CLAUDE.md). Verification is `node -e` sanity checks of the pure date helpers (they all take a `from` parameter), plus `npm run build` and browser checks.
- **Do NOT commit until the user has verified on a local dev server** (user's standing workflow rule). No per-task commits: all changes land in ONE commit, proposed to the user at the end of Task 6.
- The SEO fallback (`vite-plugin-seo.js`) renders no filter UI, so there is no parity work — but Task 6 verifies no fallback copy names the week pills.
- The mobile-app JSON (`schedules` field), pool pages, and the scraper are untouched.
- Every date is constructed via local-midnight constructors (`new Date(y, m, d)`) or `parseISODate`/`toISODate` from utils — never `new Date('YYYY-MM-DD')`, which parses as UTC.

---

### Task 1: Token↔date mapping in utils.js

**Files:**
- Modify: `src/utils.js:278-281` (the `DAY_FILTERS` declaration and its comment)

**Interfaces:**
- Consumes: existing `toISODate(d)`, `parseISODate(iso)` (defined lower in the file at ~line 315 — fine, they're only invoked at runtime).
- Produces: `DAY_FILTERS: string[]` = `['Today','Tomorrow','Plus2','Plus3']`; `DAY_OFFSETS` (module-private); `dateForDayFilter(dayKey, from?) -> string` (ISO date); `dayFilterFromDate(iso, from?) -> string|null` (token or null). Tasks 2–4 use all three names exactly as spelled here.

- [ ] **Step 1: Replace the DAY_FILTERS block**

In `src/utils.js`, replace this:

```js
// The day filter's stable values. These are NOT the button labels: the two week
// options are labelled with their dates, which change every Monday, so using a
// label as the persisted value would invalidate the stored filter each week.
export const DAY_FILTERS = ['Today', 'Tomorrow', 'ThisWeek', 'NextWeek']
```

with this:

```js
// The day filter's stable values — offsets from the reader's today, so a tab
// left open past midnight keeps meaning "+2 days from now". These are NOT
// what the URL or localStorage carry: the persisted form is the resolved ISO
// date (see filtersToSearch), so a copied link pins the calendar day the
// sharer meant. Labels roll forward daily.
export const DAY_FILTERS = ['Today', 'Tomorrow', 'Plus2', 'Plus3']

const DAY_OFFSETS = { Today: 0, Tomorrow: 1, Plus2: 2, Plus3: 3 }

// 'Plus2' on 2026-09-20 -> '2026-09-22'.
export function dateForDayFilter(dayKey, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + (DAY_OFFSETS[dayKey] ?? 0))
  return toISODate(d)
}

// '2026-09-22' back to the token it means for this reader today, or null
// when the date is past, beyond the four-pill window, or not a date at all —
// callers fall through to their stored/default value. Math.round absorbs the
// off-by-an-hour a DST boundary introduces into the millisecond difference.
export function dayFilterFromDate(iso, from = new Date()) {
  const d = parseISODate(iso)
  if (!d) return null
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const offset = Math.round((d - today) / 86400000)
  return DAY_FILTERS[offset] ?? null
}
```

Note `DAY_FILTERS[offset]` is the whole range check: offsets 0–3 index a token, anything negative or ≥4 yields `undefined` → `null`.

- [ ] **Step 2: Sanity-check the mapping**

Run:

```bash
node -e "import('./src/utils.js').then(u => {
  const sun = new Date(2026, 8, 20)  // Sunday 2026-09-20
  console.log(u.dateForDayFilter('Today', sun))                       // 2026-09-20
  console.log(u.dateForDayFilter('Plus3', sun))                      // 2026-09-23
  console.log(u.dateForDayFilter('Plus3', new Date(2026, 8, 30)))    // 2026-10-03 (month rollover)
  console.log(u.dayFilterFromDate('2026-09-22', sun))                // Plus2
  console.log(u.dayFilterFromDate('2026-09-22', new Date(2026, 8, 21))) // Tomorrow (same link, next day)
  console.log(u.dayFilterFromDate('2026-09-19', sun))                // null (past)
  console.log(u.dayFilterFromDate('2026-09-24', sun))                // null (beyond window)
  console.log(u.dayFilterFromDate('thisweek', sun))                  // null (not a date)
})"
```

Expected output, in order: `2026-09-20`, `2026-09-23`, `2026-10-03`, `Plus2`, `Tomorrow`, `null`, `null`, `null`. Fix before proceeding if any line differs.

---

### Task 2: Serialize the day filter as a date (URL + localStorage)

**Files:**
- Modify: `src/utils.js:283-306` (`filtersToSearch`, `filtersFromSearch`, plus a new `dayFilterValue` beside them)
- Modify: `src/App.jsx:40-91` (`FILTERS` config, `storedFilters`, `persistFilters`) and the import list at `src/App.jsx:14-35`

**Interfaces:**
- Consumes: `dateForDayFilter`, `dayFilterFromDate` from Task 1; existing `filterSlug`, `filterFromSlug`, `BOROUGH_FILTERS`, `ACTIVITY_FILTERS`.
- Produces: `dayFilterValue(raw, from?) -> string|null` exported from utils.js — the one parser for a persisted day, shared by the URL and localStorage paths. `FILTERS` entries gain optional `parse`/`serialize`; `allowed`/`migrations` remain only where used (borough/activity keep `allowed`; day drops both).

- [ ] **Step 1: Rewrite the serialization pair in utils.js**

Replace `filtersToSearch` and `filtersFromSearch` (currently `src/utils.js:283-306`) with:

```js
// Filter state <-> query string. Deliberately writes all three parameters at
// once: a shared link should pin the whole view, not inherit two thirds of it
// from whatever the recipient happened to have in localStorage. The day is
// written as the date it currently resolves to — sharing "Tuesday" shares
// that Tuesday, not "whatever is two days out when you open this".
export function filtersToSearch({ borough, activity, day }) {
  const params = new URLSearchParams()
  params.set('borough', filterSlug(borough))
  params.set('activity', filterSlug(activity))
  params.set('day', dateForDayFilter(day))
  return `?${params.toString()}`
}

// A persisted day value back to a token: an ISO date (the normal case), a
// legacy raw 'Today'/'Tomorrow' from pre-2026-09-20 localStorage, or a legacy
// 'today'/'tomorrow' URL slug from an old bookmark. Retired week values
// ('thisweek', 'ThisWeek', 'Week', …) return null — callers fall through to
// their stored/default value, so old links land on Today.
export function dayFilterValue(raw, from = new Date()) {
  if (raw === 'Today' || raw === 'Tomorrow') return raw
  return dayFilterFromDate(raw, from) ?? filterFromSlug(raw, ['Today', 'Tomorrow'])
}

// Only the parameters that are present AND valid. Missing ones are left to the
// caller's stored/default value, so a partial URL still works.
export function filtersFromSearch(search) {
  const params = new URLSearchParams(search ?? '')
  const out = {}
  const borough = filterFromSlug(params.get('borough'), BOROUGH_FILTERS)
  const activity = filterFromSlug(params.get('activity'), ACTIVITY_FILTERS)
  const day = dayFilterValue(params.get('day'))
  if (borough) out.borough = borough
  if (activity) out.activity = activity
  if (day) out.day = day
  return out
}
```

- [ ] **Step 2: Teach the App.jsx persistence layer parse/serialize**

In `src/App.jsx`, update the imports from `'./utils'`: remove `DAY_FILTERS` (its only use was the day config's `allowed`), add `dayFilterValue` and `dateForDayFilter`.

Replace the `FILTERS` block and the two helpers (`src/App.jsx:50-87`) with:

```js
const FILTERS = {
  borough: { key: 'poolfinder.borough', allowed: BOROUGH_FILTERS, fallback: 'Manhattan' },
  activity: { key: 'poolfinder.activity', allowed: ACTIVITY_FILTERS, fallback: 'Lap Swim' },
  day: {
    key: 'poolfinder.day',
    fallback: 'Today',
    // Persisted as the resolved ISO date, not the token — see filtersToSearch.
    // A stale stored date parses to null and self-cleans to Today; a day pick
    // is not a durable preference the way borough/activity are. dayFilterValue
    // also still reads the legacy 'Today'/'Tomorrow' tokens, and retires the
    // week values ('ThisWeek'/'NextWeek'/'Week') to the fallback.
    parse: dayFilterValue,
    serialize: dateForDayFilter,
  },
}

// localStorage can throw (private mode, storage disabled); every access here
// degrades to the defaults rather than taking the page down with it.
function storedFilters() {
  const out = {}
  for (const [name, cfg] of Object.entries(FILTERS)) {
    out[name] = cfg.fallback
    try {
      const raw = localStorage.getItem(cfg.key)
      const value = cfg.parse ? cfg.parse(raw) : cfg.allowed.includes(raw) ? raw : null
      if (value) out[name] = value
    } catch {
      // keep the fallback
    }
  }
  return out
}

function persistFilters(filters) {
  try {
    for (const [name, cfg] of Object.entries(FILTERS)) {
      localStorage.setItem(cfg.key, cfg.serialize ? cfg.serialize(filters[name]) : filters[name])
    }
  } catch {
    // ignore — the URL still carries the state
  }
}
```

This removes the `migrations` mechanism entirely — its one entry (`Week: 'ThisWeek'`) is superseded by `parse` returning null for every retired value. Keep the explanatory comment block above `FILTERS` (lines 40–49) but amend its last sentence to note the day parameter is a date: after "so a hand-trimmed URL still works." add "The `day` parameter is the resolved ISO date, not a token — see `filtersToSearch` in utils.js."

- [ ] **Step 3: Sanity-check the round-trip**

Run:

```bash
node -e "import('./src/utils.js').then(u => {
  const s = u.filtersToSearch({ borough: 'Manhattan', activity: 'Lap Swim', day: 'Plus2' })
  console.log(s)                                   // ?borough=manhattan&activity=lap-swim&day=<ISO date 2 days out>
  console.log(u.filtersFromSearch(s).day)          // Plus2
  console.log(u.filtersFromSearch('?day=today'))   // { day: 'Today' }   (legacy bookmark)
  console.log(u.filtersFromSearch('?day=thisweek')) // {}                (retired -> fall through)
  console.log(u.dayFilterValue('Tomorrow'))        // Tomorrow           (legacy localStorage)
  console.log(u.dayFilterValue('Week'))            // null
  console.log(u.dayFilterValue(null))              // null
})"
```

Expected: the day param is a real date, `Plus2` round-trips, legacy slugs/tokens resolve, retired values drop out. Fix before proceeding if any line differs.

---

### Task 3: Weekday-named pills

**Files:**
- Modify: `src/utils.js:364-387` (`dayFilterOptions`)
- Modify: `src/App.jsx:143` (the `dayOptions` memo)
- Modify: `src/components/FilterBar.jsx:7-8` (comment only)

**Interfaces:**
- Consumes: `DAY_FILTERS`, `dateForDayFilter` (Task 1), existing `parseISODate` and the module-private `longDate`.
- Produces: `dayFilterOptions(from?) -> [{value, label, ariaLabel?}]` — the `weeks` parameter is GONE. FilterBar's consumption (`{value, label, ariaLabel}` objects) is unchanged.

- [ ] **Step 1: Rewrite dayFilterOptions**

Replace `dayFilterOptions` (currently `src/utils.js:364-387`) with:

```js
// The four day pills. Labels derive from the reader's clock — Today/Tomorrow
// always did, and a weekday name can't claim data we lack the way a dated
// week label could. A day with no data falls through to the empty-grid
// message and the staleness banner, same as Today does now.
export function dayFilterOptions(from = new Date()) {
  const weekday = (d) => d.toLocaleDateString('en-US', { weekday: 'long' })
  return DAY_FILTERS.map((value) => {
    if (value === 'Today' || value === 'Tomorrow') return { value, label: value }
    const d = parseISODate(dateForDayFilter(value, from))
    return {
      value,
      label: weekday(d),
      // A bare weekday name read aloud doesn't say which one; the date does.
      ariaLabel: `${weekday(d)}, ${longDate(d)}`,
    }
  })
}
```

- [ ] **Step 2: Update the App.jsx call site**

`src/App.jsx:143` currently reads:

```js
  const dayOptions = useMemo(() => dayFilterOptions(weeks), [weeks])
```

Replace with:

```js
  const dayOptions = useMemo(() => dayFilterOptions(), [])
```

(The `weeks` memo on line 142 stays for now — Task 4 removes it with the rest of the plumbing.) Also update the now-wrong comment above line 142: it claims "Both the button labels and the date filtering come from these"; labels no longer do. Task 4 deletes the whole block, so only fix it here if you run Task 3 standalone.

- [ ] **Step 3: Update the FilterBar comment**

`src/components/FilterBar.jsx:7-8`, replace:

```js
        // Borough/activity pills are plain strings; the day pills carry a label
        // that differs from the stored value (dates, which change weekly).
```

with:

```js
        // Borough/activity pills are plain strings; the day pills carry a label
        // that differs from the stored token (weekday names that roll daily).
```

- [ ] **Step 4: Sanity-check labels on boundary days**

Run:

```bash
node -e "import('./src/utils.js').then(u => {
  console.log(u.dayFilterOptions(new Date(2026, 8, 20)))                     // Sunday
  console.log(u.dayFilterOptions(new Date(2026, 8, 25)).map(o => o.label))  // Friday
  console.log(u.dayFilterOptions(new Date(2026, 11, 30)).map(o => o.label)) // year rollover
})"
```

Expected: Sunday → labels `Today, Tomorrow, Tuesday, Wednesday` with ariaLabels `Tuesday, September 22` / `Wednesday, September 23`; Friday → `Today, Tomorrow, Sunday, Monday`; Dec 30 → `Today, Tomorrow, Friday, Saturday` (Jan 1–2). Fix before proceeding if any differ.

---

### Task 4: Single-date filtering + delete the week machinery

**Files:**
- Modify: `src/utils.js` — `datesForFilter`, `sessionsForFilter`, `reopeningDate`, `holidaysForFilter`, `holidaysInRange`, `matchesDay`; delete `isWeekFilter`, `weekLabel`, `scheduleWeeks`, `weekRange`, `startOfWeek`, `WEEK_STARTS_ON`
- Modify: `src/App.jsx` — remove the `weeks` memo and the `scheduleWeeks` import; drop the `weeks` argument at four call sites (lines 151, 187, 226, 251) and from three dependency arrays

**Interfaces:**
- Consumes: `dateForDayFilter`, `DAY_OFFSETS` (Task 1).
- Produces: new signatures — `datesForFilter(dayKey, from?)`, `sessionsForFilter(pool, dayKey, from?)`, `reopeningDate(pool, dayKey, from?)`, `holidaysForFilter(pool, dayKey, from?)`, `holidaysInRange(pools, dayKey, from?)`. `datesForFilter` now always returns a non-null single-element Set, so the `!dates ||`/`dates &&` null guards in its callers go away.

- [ ] **Step 1: Rewrite the filtering helpers in utils.js**

Replace `datesForFilter` (currently ~line 389-407) with:

```js
// The single ISO date a filter selects, resolved against the reader's clock.
export function datesForFilter(dayKey, from = new Date()) {
  return new Set([dateForDayFilter(dayKey, from)])
}
```

Replace `sessionsForFilter` with (same logic, `weeks` param gone, null guard gone):

```js
// Flattens the dated weeks down to the sessions a filter selects. Falls back to
// the undated `schedules` list (weekday-name matching) for data scraped before
// schedule_weeks existed, so an old JSON still renders.
export function sessionsForFilter(pool, dayKey, from = new Date()) {
  const dated = pool?.schedule_weeks ?? []
  if (!dated.length) {
    return (pool?.schedules ?? []).filter((s) => matchesDay(s.days, dayKey))
  }
  const dates = datesForFilter(dayKey, from)
  const out = []
  for (const w of dated) {
    for (const day of w.days ?? []) {
      if (!dates.has(day.date)) continue
      for (const s of day.sessions ?? []) out.push({ ...s, date: day.date, days: day.weekday })
    }
  }
  return out
}
```

In `reopeningDate`, change the signature to `(pool, dayKey, from = new Date())`, the `datesForFilter` call to `datesForFilter(dayKey, from)`, and the filter line to:

```js
    .filter((d) => (d.sessions?.length ?? 0) > 0 && dates.has(d.date))
```

(keep its existing comment block — still accurate).

In `holidaysForFilter`, change the signature to `(pool, dayKey, from = new Date())`, the `datesForFilter` call to `datesForFilter(dayKey, from)`, and the guard `if (dates && !dates.has(day.date)) continue` to `if (!dates.has(day.date)) continue`.

In `holidaysInRange`, change the signature to `(pools, dayKey, from = new Date())` and the inner call to `holidaysForFilter(p, dayKey, from)`.

Replace `matchesDay` (currently ~line 483-490) with:

```js
// Legacy weekday-name matching, kept for data without schedule_weeks.
export function matchesDay(scheduleDays, dayKey) {
  if (!dayKey) return true
  const now = new Date()
  const target = DAY_NAMES[(now.getDay() + (DAY_OFFSETS[dayKey] ?? 0)) % 7]
  return new RegExp(`\\b${target}\\b`, 'i').test(scheduleDays ?? '')
}
```

- [ ] **Step 2: Delete the dead machinery in utils.js**

Delete, with their comment blocks:
- `isWeekFilter` (~line 308-311)
- `WEEK_STARTS_ON` and its comment (~line 274-276)
- `startOfWeek` (~line 325-330)
- `weekRange` (~line 332-338)
- `weekLabel` (~line 343-348)
- `scheduleWeeks` (~line 350-362)

Keep `shortDate` (used by `dayStamp`) and `longDate` (used by `dayFilterOptions`).

- [ ] **Step 3: Remove the weeks plumbing in App.jsx**

- Remove `scheduleWeeks` from the `'./utils'` import list.
- Delete lines 140–142 (the comment and `const weeks = useMemo(() => scheduleWeeks(pools), [])`).
- Line 151: `sessionsForFilter(p, selectedDay, weeks)` → `sessionsForFilter(p, selectedDay)`; drop `weeks` from that memo's dependency array (line 160).
- Line 187: `holidaysInRange(pools, selectedDay, weeks)` → `holidaysInRange(pools, selectedDay)`; deps `[selectedDay, weeks]` → `[selectedDay]`.
- Line 226: `reopeningDate(p, selectedDay, weeks)` → `reopeningDate(p, selectedDay)`; deps `[selectedDay, weeks]` → `[selectedDay]` (line 230).
- Line 251: `sessionsForFilter(p, selectedDay, weeks)` → `sessionsForFilter(p, selectedDay)`; drop `weeks` from the `visiblePools` dependency array (line 264).

- [ ] **Step 4: Verify nothing references the deleted names**

Run:

```bash
grep -rn 'isWeekFilter\|weekLabel\|scheduleWeeks\|weekRange\|startOfWeek\|WEEK_STARTS_ON\|ThisWeek\|NextWeek' src/ *.js
```

Expected: no matches (pool-page.js and vite-plugin-seo.js never used them — verified during planning). Any hit is a missed call site; fix it.

- [ ] **Step 5: Sanity-check filtering across the week boundary**

Run:

```bash
node -e "import('./src/utils.js').then(u => {
  const pool = { status: 'open', schedule_weeks: [
    { start: '2026-09-14', end: '2026-09-20', days: [
      { date: '2026-09-20', weekday: 'Sunday', sessions: [{ session_type: 'Lap Swim', time: '7:00 a-9:00 a' }] } ] },
    { start: '2026-09-21', end: '2026-09-27', days: [
      { date: '2026-09-22', weekday: 'Tuesday', sessions: [{ session_type: 'Lap Swim', time: '7:00 a-9:00 a' }] },
      { date: '2026-09-23', weekday: 'Wednesday', sessions: [] } ] } ] }
  const sun = new Date(2026, 8, 20)
  console.log(u.sessionsForFilter(pool, 'Today', sun).length)    // 1
  console.log(u.sessionsForFilter(pool, 'Tomorrow', sun).length) // 0 (no 9/21 entry)
  console.log(u.sessionsForFilter(pool, 'Plus2', sun).length)    // 1 (Tuesday, next scraped week)
  console.log(u.sessionsForFilter(pool, 'Plus3', sun).length)    // 0 (Wednesday empty)
  console.log(u.matchesDay('Tuesday', 'Plus2'))                  // true only if today+2 is a Tuesday — just confirm it returns a boolean
})"
```

Expected: `1, 0, 1, 0`, then a boolean. The Plus2 case is the important one — a single-day filter reaching into the second scraped week.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: completes with no errors (the SEO plugin imports utils transitively via `pool-schema.js`/`SeoContent` paths that don't touch the deleted names, but the build is the proof).

---

### Task 5: Documentation

**Files:**
- Modify: `HANDOFF.md:651-652, 817, 842-844, 854, 856-866, 891, 898`
- Modify: `CLAUDE.md` (the "UI behavior worth knowing" bullet about filter state)

**Interfaces:** none — prose only. HANDOFF.md is the authoritative deep-dive and must stay current (CLAUDE.md's own rule).

- [ ] **Step 1: HANDOFF.md — matchesDay bullet (lines 651-652)**

Replace:

```markdown
- `matchesDay` — "Today" / "Tomorrow" / "Week" against the schedule's
  `days` string.
```

with:

```markdown
- `matchesDay` — legacy weekday-name matching against the flat schedule's
  `days` string, for data scraped before `schedule_weeks` existed. Maps all
  four day tokens (offsets 0–3 from today) to a weekday name.
```

- [ ] **Step 2: HANDOFF.md — reopeningDate signature (line 817) and the promotion note (lines 842-844)**

Line 817: change `` `reopeningDate(pool, dayKey, weeks)` `` to `` `reopeningDate(pool, dayKey)` ``.

Replace lines 842-844:

```markdown
Under Today / Tomorrow / this-week nothing is promoted (verified), so the
default view is byte-identical to before and the build-time SEO fallback — which
mirrors the *unfiltered* view — needs no matching change.
```

with:

```markdown
Since 2026-09-20 the day filters are single days (Today / Tomorrow / +2 / +3),
so promotion is per-day: a closed pool joins the grid only when the selected
day itself has sessions. The build-time SEO fallback mirrors the *unfiltered*
view and needs no matching change.
```

- [ ] **Step 3: HANDOFF.md — the "two week buttons" sentence (line 854)**

Replace:

```markdown
Wilkins 16→13. The two week buttons are not cosmetic.
```

with:

```markdown
Wilkins 16→13. (The week pills these numbers justified were replaced by
single-day pills on 2026-09-20; the dated filtering they proved remains.)
```

- [ ] **Step 4: HANDOFF.md — rewrite "Filter values vs. labels" (lines 856-866)**

Replace the whole section body:

```markdown
### Filter values vs. labels

The day pills persist to `localStorage`. Their **values** are stable
(`Today` / `Tomorrow` / `ThisWeek` / `NextWeek`); only the **labels** carry
dates. Storing a label would invalidate everyone's saved filter every Monday.
The pre-dated value `Week` migrates to `ThisWeek` (`usePersistedFilter`'s
`migrations` argument).

Labels are derived from `schedule_weeks` rather than the reader's clock
(`scheduleWeeks()` in `utils.js`), so if a refresh is missed the buttons name
the weeks we actually have. The staleness banner is what flags the gap.
```

with:

```markdown
### Filter values vs. labels (redesigned 2026-09-20)

The four day pills are **relative**: internal tokens `Today` / `Tomorrow` /
`Plus2` / `Plus3` mean offsets 0–3 from the reader's today, and the +2/+3
labels are weekday names that roll forward daily (on a Sunday:
`Today · Tomorrow · Tuesday · Wednesday`).

What persists — in the URL *and* localStorage — is the **resolved ISO date**
(`?day=2026-09-22`), not the token, so a copied link pins the calendar day the
sharer meant. Reading maps the date back by offset from the reader's today:
0–3 selects the matching pill (a "Tuesday" link shared Sunday, opened Monday,
arrives as the *Tomorrow* pill — still Tuesday's schedule); anything past or
beyond the window falls through URL → stored → the Today default. That
fall-through is also the migration story: stale stored dates self-clean, the
legacy raw `Today`/`Tomorrow` tokens still read, and the retired week values
(`ThisWeek` / `NextWeek` / `Week`, plus old `?day=thisweek` links) land on
Today. The token↔date pair is `dateForDayFilter` / `dayFilterValue` in
`utils.js`.

Labels come from the clock, not the scraped weeks — a weekday name can't claim
data we lack the way a dated week label could. If a refresh is missed, the
selected day is simply empty and the staleness banner flags the gap. The old
week pills (7-day session grids) were removed as too dense to be useful; the
pool pages' two-week tables are now the only whole-week view.
```

- [ ] **Step 5: HANDOFF.md — holiday helper signatures (lines 891, 898)**

Line 891: `` `holidaysForFilter(pool, dayKey, weeks)` `` → `` `holidaysForFilter(pool, dayKey)` ``; in the same sentence change "inside the selected range" to "on the selected day". Line 898 (`holidaysInRange(pools, …)`) needs no signature change — the `…` still holds.

- [ ] **Step 6: CLAUDE.md — the filter-state bullet**

In the "UI behavior worth knowing" section, the first bullet begins:

```markdown
- **Filter state lives in the URL** (`?borough=&activity=&day=`), with `localStorage` as the fallback
```

Change the parenthetical to `(`?borough=&activity=&day=`, where `day` is a resolved ISO date — see HANDOFF.md "Filter values vs. labels")` and leave the rest of the bullet untouched.

---

### Task 6: Verify in the browser, hand off, commit on approval

**Files:** none (verification + commit)

- [ ] **Step 1: Confirm no fallback copy names the pills**

Run: `grep -in 'week\|tomorrow' vite-plugin-seo.js pool-page.js src/components/SeoContent.jsx`
Expected: only `schedule_weeks` field references and prose like "This week's schedules" that doesn't name the pill set. If any copy enumerates the old four pills, update it to match.

- [ ] **Step 2: Build and serve**

Run: `npm run build` (expect success), then start `npm run dev` (or reuse a running dev server) for interactive checks.

- [ ] **Step 3: Browser checks**

On the dev server:
1. Pills read `Today · Tomorrow · <weekday+2> · <weekday+3>` for the real current date; the +2/+3 pills' aria-labels (inspect) carry "Weekday, Month D".
2. Click the +2 pill → URL becomes `?borough=…&activity=…&day=<ISO date two days out>`; the grid shows that day's sessions (spot-check one pool against its `/pool/<slug>/` page table).
3. Reload the dated URL → same pill selected. Back button → previous view returns.
4. Hand-edit the URL to yesterday's date → Today pill selected (fall-through).
5. Hand-edit to `?day=thisweek` → Today pill selected.
6. DevTools → Application → Local Storage: `poolfinder.day` holds an ISO date after any pill click.
7. In the console: `localStorage.setItem('poolfinder.day', 'Tomorrow')`, reload a bare URL → Tomorrow pill selected (legacy token still reads).

- [ ] **Step 4: Hand the dev URL to the user and STOP**

Per the user's standing rule: no commit until they verify. Report what to look at; wait.

- [ ] **Step 5: Commit (only after user approval)**

```bash
git add src/utils.js src/App.jsx src/components/FilterBar.jsx HANDOFF.md CLAUDE.md \
  docs/superpowers/specs/2026-09-20-day-selector-design.md \
  docs/superpowers/plans/2026-09-20-day-selector.md
git commit -m "Replace week filter pills with named single-day pills

The two week options rendered 7-day session grids too dense to read, and
two date ranges beside Today/Tomorrow made the pills mismatched. All four
pills are now relative single days (offsets 0-3, labelled by weekday); the
URL and localStorage persist the resolved ISO date so a shared link pins
the calendar day the sharer meant, and stale or retired values fall back
to Today."
```

Expected: clean `git status` afterwards.
