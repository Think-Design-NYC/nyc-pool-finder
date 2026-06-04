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
  { key: 'Learn to Swim', match: (s) => /learn to swim/i.test(s) },
  {
    key: 'Water Exercise',
    match: (s) => /water (exercise|aerobics)|aqua(?!cades)/i.test(s),
  },
  { key: 'Swim Team', match: (s) => /swim team|aquacades/i.test(s) },
]

export function matchesActivity(sessionType, activityKey) {
  if (!activityKey || activityKey === 'All') return true
  const a = ACTIVITIES.find((x) => x.key === activityKey)
  return a ? a.match(sessionType) : false
}
