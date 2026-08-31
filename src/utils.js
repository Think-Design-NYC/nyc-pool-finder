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

export function fullAddress(location = {}) {
  return [location.address, location.city, location.state, location.zip_code]
    .filter(Boolean)
    .join(', ')
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

export function matchesDay(scheduleDays, dayKey) {
  if (!dayKey || dayKey === 'Week') return true
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
