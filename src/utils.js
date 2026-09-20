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

// Borough display order. Shared so the filter pills, the prose in `SeoContent`
// and the build-time SEO fallback all order and name boroughs identically.
// URL slug for a pool's own page. Name-based, not code-based: `/pool/chelsea-pool/`
// is worth having where `/pool/m260/` is not, and `poolAnchorId()` prefers the
// facility code — so the two are deliberately derived separately rather than one
// from the other. Anchor ids stay as they are so existing `#pool-…` links live on.
export function slugifyPoolName(name) {
  return String(name ?? '')
    .toLowerCase()
    // Drop apostrophes rather than turning them into separators, so
    // "St. John's Pool" is st-johns-pool and not st-john-s-pool.
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Slugs for a whole set of pools, keyed by `poolAnchorId(pool)` — the identity
// that is already unique. Two pools that slugify the same both get the Parks
// facility code appended, so a future "Chelsea Pool" in another borough can't
// silently take over an existing URL.
export function poolSlugs(pools) {
  const counts = new Map()
  for (const p of pools ?? []) {
    const base = slugifyPoolName(p.pool_name)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  const out = new Map()
  for (const p of pools ?? []) {
    const base = slugifyPoolName(p.pool_name)
    const unique = counts.get(base) > 1 && p.pool_code
      ? `${base}-${p.pool_code.toLowerCase()}`
      : base
    out.set(poolAnchorId(p), unique)
  }
  return out
}

// Site-root-relative path to a pool page. Singular `/pool/` on purpose: the
// plural `/pools/*` is claimed by a forced legacy 301 in netlify.toml.
export const poolPath = (slug) => `/pool/${slug}/`

export function poolHref(pool, slugs) {
  const slug = slugs?.get(poolAnchorId(pool))
  return slug ? poolPath(slug) : null
}

// The first date this pool has any session, across every scraped week, or null.
// A closed pool with a future timetable must read as "reopens <date>", never as
// open — same invariant the cards hold, applied to the whole scrape window
// rather than a selected filter range.
export function firstSessionDate(pool) {
  const dates = (pool?.schedule_weeks ?? [])
    .flatMap((w) => w.days ?? [])
    .filter((d) => (d.sessions?.length ?? 0) > 0)
    .map((d) => d.date)
    .sort()
  return dates[0] ?? null
}

export const BOROUGH_ORDER = [
  'Manhattan',
  'Brooklyn',
  'Queens',
  'Bronx',
  'Staten Island',
  'Other',
]

export const isOpen = (pool) => pool?.status === 'open'

// Boroughs with at least one pool matching `predicate`, in BOROUGH_ORDER.
//
// Copy that names boroughs has to derive them from the data. The subhead used
// to hardcode "Manhattan, Brooklyn, Queens & the Bronx" and went on claiming
// the Bronx for months after St. Mary's closed, while the SEO fallback — which
// did derive its list — said something different on the same line.
export function boroughsPresent(pools, predicate = () => true) {
  const present = new Set()
  for (const p of pools ?? []) {
    if (predicate(p)) present.add(getBorough(p))
  }
  return BOROUGH_ORDER.filter((b) => present.has(b))
}

// The Bronx is the one borough that takes an article in running prose.
const withArticle = (b) => (b === 'Bronx' ? 'the Bronx' : b)

// "Manhattan, Brooklyn & the Bronx". `conjunction` is the word before the last
// item — "&" in a statement, "or" when offering a choice.
export function joinBoroughs(names, conjunction = '&') {
  const list = names.map(withArticle)
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} ${conjunction} ${list[list.length - 1]}`
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

// The full option lists the filters accept, defaults included. Shared so the
// persisted value, the URL parameter and the pill list can't disagree about
// what a valid filter is.
export const BOROUGH_FILTERS = ['All Boroughs', ...BOROUGH_ORDER]
export const ACTIVITY_FILTERS = ['All activities', ...ACTIVITIES.map((a) => a.key)]

// Filter values as URL slugs: "All Boroughs" -> all-boroughs, "Children/Teen
// Swim" -> children-teen-swim, "Plus2" -> plus-2. The camel-case split runs
// first so compound values don't collapse to a single run of characters.
export function filterSlug(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Slug back to the canonical value, or null when it matches nothing. Unknown
// slugs are dropped rather than guessed — a hand-edited URL falls back to the
// stored filter instead of rendering an empty page.
export function filterFromSlug(slug, allowed) {
  if (!slug) return null
  return allowed.find((v) => filterSlug(v) === slug) ?? null
}

export function matchesActivity(sessionType, activityKey) {
  if (!activityKey) return true
  const a = ACTIVITIES.find((x) => x.key === activityKey)
  return a ? a.match(sessionType) : false
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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
// 'today'/'tomorrow' URL slug from an old bookmark. Anything unrecognised
// returns null — callers fall through to their stored/default value, so old
// links (including old week-filter bookmarks) land on Today.
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

const shortDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`
const longDate = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

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

// The single ISO date a filter selects, resolved against the reader's clock.
export function datesForFilter(dayKey, from = new Date()) {
  return new Set([dateForDayFilter(dayKey, from)])
}

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

// A pool NYC Parks lists as closed can still have a timetable later in the
// window — Chelsea is shut on 2026-09-05 and reopens 9/8. Returns the first
// date in the selected range that actually has sessions, or null. The caller
// uses it both to decide whether to surface the pool and to label when it
// comes back, so the date is never guessed from the closure prose.
export function reopeningDate(pool, dayKey, from = new Date()) {
  if (pool?.status !== 'closed') return null
  const dates = datesForFilter(dayKey, from)
  const days = (pool.schedule_weeks ?? []).flatMap((w) => w.days ?? [])
  const withSessions = days
    .filter((d) => (d.sessions?.length ?? 0) > 0 && dates.has(d.date))
    .map((d) => d.date)
    .sort()
  return withSessions[0] ?? null
}

// Named holiday closures falling inside the selected range, e.g. Labor Day.
// Only `holiday` is surfaced, never `note` — "There are no programs at this
// pool today" restates an empty list, while "Recreation Centers will be closed"
// explains it.
export function holidaysForFilter(pool, dayKey, from = new Date()) {
  const dates = datesForFilter(dayKey, from)
  const out = []
  const seen = new Set()
  for (const w of pool?.schedule_weeks ?? []) {
    for (const day of w.days ?? []) {
      if (!day.holiday) continue
      if (!dates.has(day.date)) continue
      if (seen.has(day.date)) continue
      seen.add(day.date)
      out.push({ date: day.date, holiday: day.holiday })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// The same, across every pool — for the case where a holiday empties the grid
// entirely and there is no card left to carry the explanation.
export function holidaysInRange(pools, dayKey, from = new Date()) {
  const seen = new Map()
  for (const p of pools ?? []) {
    for (const h of holidaysForFilter(p, dayKey, from)) {
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
  if (!dayKey) return true
  const now = new Date()
  const target = DAY_NAMES[(now.getDay() + (DAY_OFFSETS[dayKey] ?? 0)) % 7]
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
