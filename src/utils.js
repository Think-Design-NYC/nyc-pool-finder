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

// The header search: every word must appear somewhere in the pool's name,
// neighborhood, borough, address or ZIP. "kips bay", "11206", "riverside" and
// "chelsea pool" all work; it searches the bundled pools, nothing remote.
export function matchesQuery(pool, query) {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const loc = pool.location ?? {}
  const hay = [
    pool.pool_name,
    pool.card_place,
    pool.place?.neighborhood,
    getBorough(pool),
    getBorough(pool) === 'Bronx' ? 'the bronx' : '',
    loc.address,
    loc.cross_streets,
    loc.city,
    loc.zip_code,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[’']/g, "'")
  return words.every((w) => hay.includes(w.replace(/[’']/g, "'")))
}

// "Riverbank State Park", "Flushing Meadows", "Asser Levy" — a pool's name
// with the generic tail dropped, for tight spots like map pins.
export function shortPoolName(pool) {
  return (pool?.pool_name ?? '')
    .replace(/ Corona Park Pool & Rink$/, '')
    .replace(/ (Recreation Center )?Pool( & Rink)?$/, '')
}

// "the Bronx" mid-sentence; every other borough takes no article.
export const boroughInProse = (b) => (b === 'Bronx' ? 'the Bronx' : b)

export const isOpen = (pool) => pool?.status === 'open'

// Scraped pools carry no `operator`; only the Riverbank overlay sets one. Copy
// that counts "NYC Parks pools" or promises a Recreation Center membership
// must filter on this — pools.length stopped being the NYC Parks count when
// Riverbank joined the list.
export const isNycParks = (pool) => (pool?.operator ?? 'nyc_parks') === 'nyc_parks'

export const operatorName = (pool) => (isNycParks(pool) ? 'NYC Parks' : 'NYS Parks')

// The line under a pool's name on its card, e.g. "Kips Bay · Manhattan".
// Riverbank swaps in a landmark people navigate by and a short operator/price
// tag ("145 + Riverside · Manhattan · NYS Parks · $2+ Call first"); the pool
// page and JSON-LD keep the real neighborhood. Shared with the SEO fallback.
export function cardSubtitle(pool) {
  return [pool.card_place ?? pool.place?.neighborhood, getBorough(pool), pool.card_tag]
    .filter(Boolean)
    .join(' · ')
}

// The operator's own page for a pool, and the words to link it with.
export function officialPage(pool) {
  return isNycParks(pool)
    ? { url: pool.url, label: 'NYC Parks page', host: 'nycgovparks.org' }
    : { url: pool.url, label: 'NYS Parks page', host: 'parks.ny.gov' }
}

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
    badge: 'bg-open/10 text-emerald-800 ring-open/25',
    dot: 'bg-open',
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

// "Recreational Swim" is Riverbank's wording (data/riverbank.json); no NYC
// Parks title uses it. Adult and Saturday-morning rec are Open Swim, youth rec
// is Children/Teen, family rec is Family Swim — so Open Swim excludes the two
// that belong elsewhere. Adult and family rec also count as Lap Swim: 2–3
// lanes stay roped for 25-yard laps (the session notes say so). Youth and
// Saturday-morning rec don't.
export const ACTIVITIES = [
  {
    key: 'Lap Swim',
    match: (s) => /lap swim|(adult|family) recreational swim/i.test(s),
  },
  {
    key: 'Open Swim',
    match: (s) =>
      /open swim|general swim|recreational swim/i.test(s) && !/lap|family|youth/i.test(s),
  },
  { key: 'Family Swim', match: (s) => /family (recreational )?swim/i.test(s) },
  {
    key: 'Children/Teen Swim',
    match: (s) => /children|teen|youth recreational swim/i.test(s),
  },
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
// Swim" -> children-teen-swim. The camel-case split runs first so compound
// values ("WaterPolo") don't collapse to a single run of characters.
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

// The day filter's values: 'Today' and 'Tomorrow' stay relative to the
// reader's clock, so a tab left open past midnight keeps meaning "today"; any
// other day is the picked ISO date itself ('2026-10-29'), from the Pick a day
// calendar. Neither form is what the URL carries — the persisted form is always
// the resolved ISO date (see filtersToSearch), so a copied link pins the
// calendar day the sharer meant.
export const DAY_FILTERS = ['Today', 'Tomorrow']

const DAY_OFFSETS = { Today: 0, Tomorrow: 1 }

const isISODate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')

// 'Tomorrow' on 2026-09-20 -> '2026-09-21'; a picked ISO date is itself.
export function dateForDayFilter(dayKey, from = new Date()) {
  if (isISODate(dayKey)) return dayKey
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + (DAY_OFFSETS[dayKey] ?? 0))
  return toISODate(d)
}

// How far ahead a picked day may be. The scraper covers this week and next;
// a little slack lets a link shared late on a Sunday still resolve.
const MAX_DAYS_AHEAD = 21

// '2026-09-22' back to the filter value it means for this reader today:
// 'Today', 'Tomorrow', or the date itself for a later day. Null when the date
// is past, too far out, or not a date at all — callers fall through to their
// stored/default value. Math.round absorbs the off-by-an-hour a DST boundary
// introduces into the millisecond difference.
export function dayFilterFromDate(iso, from = new Date()) {
  const d = parseISODate(iso)
  if (!d) return null
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const offset = Math.round((d - today) / 86400000)
  if (offset < 0 || offset > MAX_DAYS_AHEAD) return null
  return DAY_FILTERS[offset] ?? iso
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

// Every date from today on that the scraped weeks cover, for the Pick a day
// calendar. A date with no matching sessions still appears — choosing it shows
// the explained empty state rather than leaving the reader to guess.
export function availableDates(pools, from = new Date()) {
  const today = toISODate(from)
  const out = new Set()
  for (const p of pools ?? []) {
    for (const w of p.schedule_weeks ?? []) {
      for (const d of w.days ?? []) if (d.date >= today) out.add(d.date)
    }
  }
  return [...out].sort()
}

// "Thu 10/29" for the Pick a day chip once a date is chosen.
export function shortDayLabel(iso) {
  const d = parseISODate(iso)
  return d ? `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${shortDate(d)}` : iso
}

// "Thursday, October 29" — what a screen reader hears for a picked day.
export function longDayLabel(iso) {
  const d = parseISODate(iso)
  return d ? `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${longDate(d)}` : iso
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
  const target = DAY_NAMES[parseISODate(dateForDayFilter(dayKey)).getDay()]
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

// "6:30 a - 8:15 a" -> { start: 390, end: 495 }, or null if either end is
// unreadable.
export function sessionWindow(timeRange) {
  const [a, b] = (timeRange ?? '').split('-')
  const start = parseClockTime(a)
  const end = parseClockTime(b)
  return start == null || end == null ? null : { start, end }
}

// 1080 -> "6:00 pm"
export function formatClock(mins) {
  const h = Math.floor(mins / 60) % 24
  const m = String(mins % 60).padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`
}

const minutesNow = (now) => now.getHours() * 60 + now.getMinutes()

// The header's live line: how many pools are in the chosen activity right now,
// and where the next session starts. Reads today's and tomorrow's dated
// sessions against the reader's clock, so it is React-only — the build-time
// fallback can't know what "now" is and says nothing time-relative.
export function liveSummary(pools, { activity, borough }, now = new Date()) {
  const matches = (s) =>
    !activity || activity === 'All activities' || matchesActivity(s.session_type, activity)
  const inBorough = (p) =>
    !borough || borough === 'All Boroughs' || getBorough(p) === borough
  const t = minutesNow(now)
  // No recreation center opens before 6 am, so a session "starting" earlier is
  // an am/pm typo on the NYC Parks page (Roy Wilkins listed lap swim as
  // "12:00 a - 2:45 a" in Oct 2026). The cards still show what NYC Parks
  // posted; the headline just doesn't promote it.
  const plausible = (w) => w && w.start >= 5 * 60
  let onNow = 0
  let next = null
  let tomorrow = null
  for (const p of pools) {
    if (p.status === 'closed' && !p.schedule_weeks?.length) continue
    if (!inBorough(p)) continue
    let live = false
    for (const s of sessionsForFilter(p, 'Today', now).filter(matches)) {
      const w = sessionWindow(s.time)
      if (!plausible(w)) continue
      if (w.start <= t && t < w.end) live = true
      else if (w.start > t && (!next || w.start < next.start)) next = { start: w.start, pool: p }
    }
    if (live) onNow++
    for (const s of sessionsForFilter(p, 'Tomorrow', now).filter(matches)) {
      const w = sessionWindow(s.time)
      if (plausible(w) && (!tomorrow || w.start < tomorrow.start)) tomorrow = { start: w.start, pool: p }
    }
  }
  return { onNow, next, tomorrow }
}

// "1 h 25 min", "25 min", "2 h"
export function formatDuration(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

// How soon "Starting soon" means.
export const SOON_MINUTES = 60

// Result groups, in display order. Today uses the first four; any other day
// lists every pool in one 'day' group.
export const RESULT_GROUPS = ['on', 'soon', 'later', 'done', 'day']

// Picks the session a pool's card leads with and the group it belongs in.
//
// Today: a session in progress wins ('on'), else the next one to start
// ('soon' within SOON_MINUTES, otherwise 'later'), else the last one that ran
// ('done' — the pool stays on the page instead of silently dropping out).
// Any other day: the first session ('day'). `others` is everything else, in
// time order, for the card's chips. `status` is the card's small caps line.
// Returns null when the pool has no readable sessions.
export function leadSession(sessions, { today, now = new Date() } = {}) {
  const timed = sessions
    .map((s) => ({ ...s, window: sessionWindow(s.time) }))
    .filter((s) => s.window)
    .sort((a, b) => a.window.start - b.window.start || a.window.end - b.window.end)
  if (!timed.length) return null
  // Never lead with an am/pm typo (a "12:00 a" session — see liveSummary);
  // it still shows among the chips as NYC Parks posted it.
  const leadable = timed.some((s) => s.window.start >= 5 * 60)
    ? timed.filter((s) => s.window.start >= 5 * 60)
    : timed
  const t = minutesNow(now)
  let lead
  let group
  let status
  if (!today) {
    lead = leadable[0]
    group = 'day'
    status = null
  } else {
    const on = leadable.find((s) => s.window.start <= t && t < s.window.end)
    const next = leadable.find((s) => s.window.start > t)
    if (on) {
      lead = on
      group = 'on'
      status = `On now · ends in ${formatDuration(on.window.end - t)}`
    } else if (next) {
      lead = next
      const wait = next.window.start - t
      group = wait <= SOON_MINUTES ? 'soon' : 'later'
      status =
        group === 'soon'
          ? `Starts in ${formatDuration(wait)}`
          : next.window.start >= 17 * 60
            ? 'Tonight'
            : `Later today`
    } else {
      lead = leadable[leadable.length - 1]
      group = 'done'
      status = `Ended at ${formatClock(lead.window.end)}`
    }
  }
  return { lead, group, status, others: timed.filter((s) => s !== lead) }
}

// The first matching session after the selected day's — or, for Today, after
// the reader's clock — across the scraped weeks. Feeds the empty state's
// "Next: Thursday 5:15 pm at St. Mary's Pool". Null when nothing in the data
// window matches.
export function nextMatchingSession(pools, { activity, borough, day }, now = new Date()) {
  const matches = (s) =>
    !activity || activity === 'All activities' || matchesActivity(s.session_type, activity)
  const inBorough = (p) =>
    !borough || borough === 'All Boroughs' || getBorough(p) === borough
  const today = toISODate(now)
  const selected = dateForDayFilter(day, now)
  const t = minutesNow(now)
  let best = null
  for (const p of pools) {
    if (!inBorough(p)) continue
    for (const w of p.schedule_weeks ?? []) {
      for (const d of w.days ?? []) {
        if (d.date < selected || (d.date === selected && selected !== today)) continue
        for (const s of (d.sessions ?? []).filter(matches)) {
          const win = sessionWindow(s.time)
          if (!win || win.start < 5 * 60) continue
          if (d.date === today && win.start <= t) continue
          const key = `${d.date} ${String(win.start).padStart(4, '0')}`
          if (!best || key < best.key) best = { key, date: d.date, start: win.start, pool: p }
        }
      }
    }
  }
  return best
}

// "today", "tomorrow" or "Thursday", relative to the reader's day.
export function relativeDay(iso, now = new Date()) {
  if (iso === toISODate(now)) return 'today'
  if (iso === dateForDayFilter('Tomorrow', now)) return 'tomorrow'
  return parseISODate(iso)?.toLocaleDateString('en-US', { weekday: 'long' }) ?? iso
}

// "Schedules checked today, 6:02 am" — the scrape time in New York, relative
// to the reader's day. Null when there is no timestamp.
export function checkedLabel(updatedAt, now = new Date()) {
  if (!updatedAt) return null
  const at = new Date(updatedAt)
  const tz = { timeZone: 'America/New_York' }
  const day = (d) => d.toLocaleDateString('en-CA', tz)
  const time = at
    .toLocaleTimeString('en-US', { ...tz, hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (day(at) === day(now)) return `today, ${time}`
  if (day(at) === day(yesterday)) return `yesterday, ${time}`
  return `${at.toLocaleDateString('en-US', { ...tz, month: 'short', day: 'numeric' })}, ${time}`
}
