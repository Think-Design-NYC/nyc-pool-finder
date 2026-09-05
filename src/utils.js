// Helpers shared across components.

// The live JSON doesn't always include a `borough` field, so fall back to
// inferring it from the zip code (NYC zip prefixes are borough-specific).
const ZIP_PREFIX_TO_BOROUGH = {
  100: 'Manhattan',
  101: 'Manhattan',
  102: 'Manhattan',
  103: 'Staten Island',
  104: 'Bronx',
  110: 'Queens',
  111: 'Queens',
  112: 'Brooklyn',
  113: 'Queens',
  114: 'Queens',
  116: 'Queens',
}

export function getBorough(pool) {
  if (pool.borough) return pool.borough
  const zip = pool.location?.zip_code
  if (zip) {
    const borough = ZIP_PREFIX_TO_BOROUGH[Number(zip.slice(0, 3))]
    if (borough) return borough
  }
  return 'Other'
}

// Stable DOM id per pool. The build-time JSON-LD points each pool's `url` at
// `#<this>`, so the rendered card has to carry the matching id.
export function poolAnchorId(pool) {
  const base = pool.pool_code || pool.pool_name || ''
  return `pool-${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export const STATUS_STYLES = {
  open: {
    label: 'Open',
    badge: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
    dot: 'bg-emerald-500',
  },
  closed: {
    label: 'Closed',
    badge: 'bg-red-100 text-red-800 ring-red-600/20',
    dot: 'bg-red-500',
  },
  transitioning: {
    label: 'Transitioning',
    badge: 'bg-amber-100 text-amber-800 ring-amber-600/20',
    dot: 'bg-amber-500',
  },
}

export function getStatusStyle(status) {
  return (
    STATUS_STYLES[status] ?? {
      label: status ?? 'Unknown',
      badge: 'bg-gray-100 text-gray-700 ring-gray-500/20',
      dot: 'bg-gray-400',
    }
  )
}

const MONTH_ABBREV = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr',
  May: 'May', June: 'Jun', July: 'Jul', August: 'Aug',
  September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
}

// Says as much about a closure as NYC Parks actually stated: why, and until
// when. "Closed for repairs until Sep 8", "Closed for reconstruction",
// "Closed through mid-September". Each part is optional and omitted rather
// than guessed — an open-ended closure must not imply a return date.
//
// Shared by the React badge and the build-time SEO fallback so the two can't
// drift; see the fallback note in vite-plugin-seo.js.
// The pill itself stays short — one scannable word, and a 38-character pill
// would crush the pool name beside it. The full phrase goes on its own line;
// see statusLabel.
export function statusBadgeLabel(pool) {
  return getStatusStyle(pool.status).label
}

export function statusLabel(pool) {
  const base = getStatusStyle(pool.status).label
  if (pool.status !== 'closed') return base

  const parts = [base]
  if (pool.closure_reason) parts.push(pool.closure_reason)
  if (pool.reopens) {
    parts.push(`until ${String(pool.reopens).replace(/^(\w+)/, (m) => MONTH_ABBREV[m] ?? m)}`)
  } else if (pool.closed_through) {
    parts.push(`through ${pool.closed_through}`)
  }
  return parts.join(' ')
}

export function fullAddress(location = {}) {
  return [location.address, location.city, location.state, location.zip_code]
    .filter(Boolean)
    .join(', ')
}

// The scraper runs on a schedule on one Mac, and that schedule only fires while
// the machine is awake and logged in (see DEPLOY.md). When it misses, the site
// keeps serving the last-good schedules with no outward sign — so past this age
// the UI says so rather than presenting stale times as current.
export const STALE_AFTER_HOURS = 48

// Hours since `updatedAt`, or null when it's missing or unparseable. `now` is
// injectable so this is testable without faking the clock.
export function dataAgeHours(updatedAt, now = Date.now()) {
  if (!updatedAt) return null
  const t = new Date(updatedAt).getTime()
  if (Number.isNaN(t)) return null
  return (now - t) / 3600000
}

// "yesterday" / "3 days ago". Coarse on purpose: past the staleness threshold
// the exact hour doesn't change what the reader should do about it.
export function describeAge(hours) {
  if (hours == null) return null
  const days = Math.floor(hours / 24)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export const ACTIVITIES = [
  { key: 'Lap Swim', match: (s) => /lap swim/i.test(s) },
  {
    key: 'Open Swim',
    match: (s) => /open swim|general swim/i.test(s) && !/lap/i.test(s),
  },
  { key: 'Family Swim', match: (s) => /family swim/i.test(s) },
  { key: 'Children/Teen Swim', match: (s) => /children|teen/i.test(s) },
  { key: 'Learn to Swim', match: (s) => /learn to swim/i.test(s) },
  {
    key: 'Water Exercise',
    match: (s) => /water (exercise|aerobics)|aqua(?!cades)/i.test(s),
  },
  { key: 'Swim Team', match: (s) => /swim team|aquacades/i.test(s) },
  { key: 'Water Polo', match: (s) => /water polo/i.test(s) },
]

export function matchesActivity(sessionType, activityKey) {
  if (!activityKey) return true
  const a = ACTIVITIES.find((x) => x.key === activityKey)
  return a ? a.match(sessionType) : false
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Weeks run Monday–Sunday, matching how NYC Parks paginates its schedule
// pages (/schedule/<Monday>) and the labels the day filter shows.
const WEEK_STARTS_ON = 1

// The day filter's stable values. These are NOT the button labels: the two week
// options are labelled with their dates, which change every Monday, so using a
// label as the persisted value would invalidate the stored filter each week.
export const DAY_FILTERS = ['Today', 'Tomorrow', 'ThisWeek', 'NextWeek']

export function isWeekFilter(dayKey) {
  // 'Week' is the pre-dated-labels value that may still be in localStorage.
  return dayKey === 'ThisWeek' || dayKey === 'NextWeek' || dayKey === 'Week'
}

// "2026-09-07" -> local midnight. `new Date(iso)` would parse it as UTC and
// land on the previous day for anyone west of Greenwich.
export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

export function toISODate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Midnight on the Monday of the week containing `date`.
export function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() - WEEK_STARTS_ON + 7) % 7))
  return d
}

export function weekRange(weeksAhead = 0, from = new Date()) {
  const start = startOfWeek(from)
  start.setDate(start.getDate() + weeksAhead * 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { start, end }
}

const shortDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`
const longDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

// "9/7 – 9/13"
export function weekLabel(week) {
  const start = parseISODate(week?.start)
  const end = parseISODate(week?.end)
  return start && end ? `${shortDate(start)} – ${shortDate(end)}` : ''
}

// The two weeks the scrape actually covers, newest data wins. Labels come from
// the data rather than the reader's clock: if a refresh has been missed the
// buttons should name the weeks we have, not the weeks we wish we had — the
// staleness banner is what flags the gap.
export function scheduleWeeks(pools) {
  const seen = new Map()
  for (const p of pools ?? []) {
    for (const w of p.schedule_weeks ?? []) {
      if (w?.start && !seen.has(w.start)) seen.set(w.start, { start: w.start, end: w.end })
    }
  }
  return [...seen.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 2)
}

export function dayFilterOptions(weeks = [], from = new Date()) {
  const fallback = [0, 1].map((n) => {
    const { start, end } = weekRange(n, from)
    return { start: toISODate(start), end: toISODate(end) }
  })
  const [thisWeek, nextWeek] = weeks.length === 2 ? weeks : fallback
  return [
    { value: 'Today', label: 'Today' },
    { value: 'Tomorrow', label: 'Tomorrow' },
    ...[
      ['ThisWeek', thisWeek, 'This'],
      ['NextWeek', nextWeek, 'Next'],
    ].map(([value, week, which]) => {
      const start = parseISODate(week.start)
      const end = parseISODate(week.end)
      return {
        value,
        label: weekLabel(week),
        // "9/7 – 9/13" read aloud is not obviously a date range.
        ariaLabel: `${which} week, ${longDate(start)} to ${longDate(end)}`,
      }
    }),
  ]
}

// The ISO dates a filter selects. Today/Tomorrow resolve against the reader's
// clock; the week filters against the dates in the scraped data.
export function datesForFilter(dayKey, weeks = [], from = new Date()) {
  if (dayKey === 'Today' || dayKey === 'Tomorrow') {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    if (dayKey === 'Tomorrow') d.setDate(d.getDate() + 1)
    return new Set([toISODate(d)])
  }
  const week = weeks[dayKey === 'NextWeek' ? 1 : 0]
  if (!week) return null
  const out = new Set()
  const start = parseISODate(week.start)
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    out.add(toISODate(d))
  }
  return out
}

// Flattens the dated weeks down to the sessions a filter selects. Falls back to
// the undated `schedules` list (weekday-name matching) for data scraped before
// schedule_weeks existed, so an old JSON still renders.
export function sessionsForFilter(pool, dayKey, weeks = [], from = new Date()) {
  const dated = pool?.schedule_weeks ?? []
  if (!dated.length) {
    return (pool?.schedules ?? []).filter((s) => matchesDay(s.days, dayKey))
  }
  const dates = datesForFilter(dayKey, weeks, from)
  const out = []
  for (const w of dated) {
    for (const day of w.days ?? []) {
      if (dates && !dates.has(day.date)) continue
      for (const s of day.sessions ?? []) out.push({ ...s, date: day.date, days: day.weekday })
    }
  }
  return out
}

// A pool NYC Parks lists as closed can still have a timetable later in the
// window — Chelsea is shut on 2026-09-05 and reopens 9/8. Returns the first
// date in the selected range that actually has sessions, or null. The caller
// uses it both to decide whether to surface the pool and to label when it
// comes back, so the date is never guessed from the closure prose.
export function reopeningDate(pool, dayKey, weeks = [], from = new Date()) {
  if (pool?.status !== 'closed') return null
  const dates = datesForFilter(dayKey, weeks, from)
  const days = (pool.schedule_weeks ?? []).flatMap((w) => w.days ?? [])
  const withSessions = days
    .filter((d) => (d.sessions?.length ?? 0) > 0 && (!dates || dates.has(d.date)))
    .map((d) => d.date)
    .sort()
  return withSessions[0] ?? null
}

// Named holiday closures falling inside the selected range, e.g. Labor Day.
// Only `holiday` is surfaced, never `note` — "There are no programs at this
// pool today" restates an empty list, while "Recreation Centers will be closed"
// explains it.
export function holidaysForFilter(pool, dayKey, weeks = [], from = new Date()) {
  const dates = datesForFilter(dayKey, weeks, from)
  const out = []
  const seen = new Set()
  for (const w of pool?.schedule_weeks ?? []) {
    for (const day of w.days ?? []) {
      if (!day.holiday) continue
      if (dates && !dates.has(day.date)) continue
      if (seen.has(day.date)) continue
      seen.add(day.date)
      out.push({ date: day.date, holiday: day.holiday })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// The same, across every pool — for the case where a holiday empties the grid
// entirely and there is no card left to carry the explanation.
export function holidaysInRange(pools, dayKey, weeks = [], from = new Date()) {
  const seen = new Map()
  for (const p of pools ?? []) {
    for (const h of holidaysForFilter(p, dayKey, weeks, from)) {
      if (!seen.has(h.date)) seen.set(h.date, h)
    }
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// "Mon 9/7"
export function dayStamp(session) {
  const d = parseISODate(session?.date)
  if (!d) return session?.days ?? ''
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${shortDate(d)}`
}

// Legacy weekday-name matching, kept for data without schedule_weeks.
export function matchesDay(scheduleDays, dayKey) {
  if (!dayKey || isWeekFilter(dayKey)) return true
  const now = new Date()
  const offset = dayKey === 'Tomorrow' ? 1 : 0
  const target = DAY_NAMES[(now.getDay() + offset) % 7]
  return new RegExp(`\\b${target}\\b`, 'i').test(scheduleDays ?? '')
}

// Parses "9:45 a" / "1:00 p" → minutes since midnight, or null on failure.
function parseClockTime(s) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap])/i.exec(s ?? '')
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'p') h += 12
  return h * 60 + Number(m[2])
}

// True when the schedule's end time has already passed today.
export function isPastToday(timeRange) {
  const end = (timeRange ?? '').split('-')[1]
  const mins = parseClockTime(end)
  if (mins == null) return false
  const now = new Date()
  return mins <= now.getHours() * 60 + now.getMinutes()
}
