// Structured-data helpers shared by the homepage graph (vite-plugin-seo.js) and
// the static per-pool pages (pool-page.js).
//
// Lives outside src/ because it is build-time only — React never imports it.
// It was inside the plugin until the pool pages needed the same node; two
// copies of a schema.org builder is exactly the drift the SEO invariants warn
// about, so it moved here rather than being duplicated.

import { ACTIVITIES } from './src/utils.js'

// Each NYC borough is coextensive with a New York State county. The county is
// the formally correct AdministrativeArea for structured data; the borough name
// rides along as alternateName since that's what people actually search.
export const BOROUGH_TO_COUNTY = {
  Manhattan: 'New York County',
  Brooklyn: 'Kings County',
  Queens: 'Queens County',
  Bronx: 'Bronx County',
  'Staten Island': 'Richmond County',
}

// Sessions that don't represent the pool being usable by the public.
export const NON_PUBLIC_SESSION =
  /closed for cleaning|lifeguard training|summer camp|youth employment/i

// "11:00 a" -> "11:00", "1:00 p" -> "13:00". Null when unparseable.
function to24h(part) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap])/i.exec(part ?? '')
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === 'p') h += 12
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

function parseRange(time) {
  const [open, close] = String(time ?? '').split('-')
  const opens = to24h(open)
  const closes = to24h(close)
  return opens && closes ? { opens, closes } : null
}

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

// Collapse a day's sessions into the fewest non-overlapping open windows, so
// the structured data says "open 10:00–19:00" rather than listing 12 sessions.
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => minutes(a.opens) - minutes(b.opens))
  const out = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && minutes(r.opens) <= minutes(last.closes)) {
      if (minutes(r.closes) > minutes(last.closes)) last.closes = r.closes
    } else {
      out.push({ ...r })
    }
  }
  return out
}

export function openingHours(pool) {
  if (pool.status !== 'open') return []
  const byDay = new Map()
  for (const s of pool.schedules ?? []) {
    if (NON_PUBLIC_SESSION.test(s.session_type ?? '')) continue
    const range = parseRange(s.time)
    if (!range || !s.days) continue
    if (!byDay.has(s.days)) byDay.set(s.days, [])
    byDay.get(s.days).push(range)
  }
  const specs = []
  for (const [day, ranges] of byDay) {
    for (const r of mergeRanges(ranges)) {
      specs.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: day,
        opens: r.opens,
        closes: r.closes,
      })
    }
  }
  return specs
}

export const parksUrl = (pool) =>
  pool.pool_code
    ? `https://www.nycgovparks.org/parks/${pool.pool_code}/facilities/indoor-pools`
    : undefined

// Distinct swim programs offered, e.g. "Adult Lap Swim" -> "Lap Swim".
//
// Derived from the same ACTIVITIES table the UI filters on, so a new program
// type is classified identically in the pills and in the JSON-LD.
export function activityTags(pool) {
  const tags = new Set()
  for (const s of pool.schedules ?? []) {
    const t = s.session_type ?? ''
    for (const a of ACTIVITIES) {
      if (a.match(t)) tags.add(a.key)
    }
  }
  return ACTIVITIES.map((a) => a.key).filter((k) => tags.has(k))
}

// The PublicSwimmingPool node. `url` is passed in because the same pool is
// addressed two ways: as a homepage fragment before its page existed, and as
// its own document now. Both point at the pool page so there is one canonical
// identity per facility.
export function poolNode(pool, url) {
  const loc = pool.location ?? {}
  const hours = openingHours(pool)
  const node = {
    '@type': ['PublicSwimmingPool', 'SportsActivityLocation'],
    '@id': url,
    name: pool.pool_name,
    url,
    // Nearly every NYC indoor pool sits inside a recreation center you have to
    // join, so these are not free-access facilities.
    isAccessibleForFree: pool.membership_required === true ? false : undefined,
    // Cost is the rec center membership, not a per-swim fee.
    priceRange:
      pool.membership_required === true
        ? '$0–$150 per year (Recreation Center membership)'
        : undefined,
    publicAccess: true,
    areaServed: {
      '@type': 'AdministrativeArea',
      name: BOROUGH_TO_COUNTY[pool.borough] ?? pool.borough,
      alternateName: pool.borough,
      containedInPlace: { '@type': 'City', name: 'New York' },
    },
  }
  if (loc.address) {
    node.address = {
      '@type': 'PostalAddress',
      streetAddress: loc.address,
      // Postal locality stays the mailing city ("Brooklyn"), not the county —
      // a PostalAddress has to be a deliverable address.
      addressLocality: loc.city || 'New York',
      addressRegion: loc.state || 'NY',
      addressCountry: 'US',
    }
    if (loc.zip_code) node.address.postalCode = loc.zip_code
  }
  if (pool.phone) node.telephone = pool.phone
  if (parksUrl(pool)) node.sameAs = parksUrl(pool)
  if (hours.length) node.openingHoursSpecification = hours
  const tags = activityTags(pool)
  if (tags.length)
    node.amenityFeature = tags.map((t) => ({
      '@type': 'LocationFeatureSpecification',
      name: t,
      value: true,
    }))
  // Facilities the Parks Dept lists as closed stay in the graph (people search
  // for them by name) but are marked so results don't send anyone on a wasted trip.
  if (pool.status === 'closed') node.temporarilyClosed = true
  return node
}
