// Build-time SEO plugin.
//
// The app is a client-rendered SPA, so the HTML the host serves would
// otherwise be an empty <div id="root">. Crawlers that don't execute JS (and
// several LLM/social crawlers don't) would see no content at all. This plugin:
//
//   1. injects a static, crawlable rendering of the pool data into #root —
//      React's createRoot() replaces it on mount, so users never see it;
//   2. injects JSON-LD describing each pool as a PublicSwimmingPool;
//   3. emits sitemap.xml with lastmod taken from the scrape timestamp.
//
// The fallback markup is styled with a scoped <style> block rather than
// Tailwind classes: this runs in transformIndexHtml, after Tailwind has already
// scanned sources and built the stylesheet, so classes introduced here would be
// purged.

import pools from './nyc_pools_live.json'
import meta from './nyc_pools_meta.json'
import { FAQ } from './src/faq.js'
import { ACTIVITIES, poolAnchorId as anchorId } from './src/utils.js'
import {
  IDNYC_NOTE,
  MEMBERSHIP_CHECKED,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_URL,
} from './src/membership.js'

export const SITE_URL = 'https://thinkdesign.com/pools/'

const BOROUGH_ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']

// Each NYC borough is coextensive with a New York State county. The county is
// the formally correct AdministrativeArea for structured data; the borough name
// rides along as alternateName since that's what people actually search.
const BOROUGH_TO_COUNTY = {
  Manhattan: 'New York County',
  Brooklyn: 'Kings County',
  Queens: 'Queens County',
  Bronx: 'Bronx County',
  'Staten Island': 'Richmond County',
}

// Sessions that don't represent the pool being usable by the public.
const NON_PUBLIC_SESSION = /closed for cleaning|lifeguard training|summer camp|youth employment/i

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

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

function openingHours(pool) {
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

const parksUrl = (pool) =>
  pool.pool_code
    ? `https://www.nycgovparks.org/parks/${pool.pool_code}/facilities/indoor-pools`
    : undefined

// Distinct swim programs offered, e.g. "Adult Lap Swim" -> "Lap Swim".
//
// Derived from the same ACTIVITIES table the UI filters on, so a new program
// type is classified identically in the pills and in the JSON-LD. This used to
// be a hand-maintained copy of those regexes and had already drifted: it never
// emitted Swim Team at all.
function activityTags(pool) {
  const tags = new Set()
  for (const s of pool.schedules ?? []) {
    const t = s.session_type ?? ''
    for (const a of ACTIVITIES) {
      if (a.match(t)) tags.add(a.key)
    }
  }
  return ACTIVITIES.map((a) => a.key).filter((k) => tags.has(k))
}

function poolLd(pool, position) {
  const loc = pool.location ?? {}
  const hours = openingHours(pool)
  const node = {
    '@type': ['PublicSwimmingPool', 'SportsActivityLocation'],
    '@id': `${SITE_URL}#${anchorId(pool)}`,
    name: pool.pool_name,
    url: `${SITE_URL}#${anchorId(pool)}`,
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
  if (tags.length) node.amenityFeature = tags.map((t) => ({
    '@type': 'LocationFeatureSpecification',
    name: t,
    value: true,
  }))
  // Facilities the Parks Dept lists as closed stay in the graph (people search
  // for them by name) but are marked so results don't send anyone on a wasted trip.
  if (pool.status === 'closed') node.temporarilyClosed = true
  return { '@type': 'ListItem', position, item: node }
}

function buildJsonLd() {
  const open = pools.filter((p) => p.status === 'open')
  const openNames = open.map((p) => p.pool_name)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}#organization`,
        name: 'Think Design',
        url: 'https://thinkdesign.com',
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#website`,
        url: SITE_URL,
        name: 'NYC Indoor Pool Finder',
        description:
          'Live schedules for every NYC Parks indoor public pool — lap swim, open swim and family swim.',
        publisher: { '@id': `${SITE_URL}#organization` },
        inLanguage: 'en-US',
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}#webpage`,
        url: SITE_URL,
        name: 'NYC Indoor Pool Finder — Open Now & Lap Swim Schedules',
        isPartOf: { '@id': `${SITE_URL}#website` },
        about: { '@id': `${SITE_URL}#itemlist` },
        dateModified: meta.updated_at,
        inLanguage: 'en-US',
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}#itemlist`,
        name: 'NYC indoor public pools',
        numberOfItems: pools.length,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: pools.map((p, i) => poolLd(p, i + 1)),
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}#faq`,
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a(openNames) },
        })),
      },
    ],
  }
}

// Static mirror of the React UI for non-JS crawlers. Replaced on mount.
function buildFallbackHtml() {
  const openCount = pools.filter((p) => p.status === 'open').length
  const byBorough = BOROUGH_ORDER.map((b) => [b, pools.filter((p) => p.borough === b)]).filter(
    ([, list]) => list.length,
  )

  const sections = byBorough
    .map(([borough, list]) => {
      const cards = list
        .map((pool) => {
          const loc = pool.location ?? {}
          const isOpen = pool.status === 'open'
          const sessions = (pool.schedules ?? [])
            .filter((s) => !NON_PUBLIC_SESSION.test(s.session_type ?? ''))
            .map((s) => `<li>${esc(s.days)} — ${esc(s.session_type)}: ${esc(s.time)}</li>`)
            .join('')
          return `
<article id="${esc(anchorId(pool))}" class="sf-card">
  <h3>${esc(pool.pool_name)} <span class="sf-badge">${isOpen ? 'Open' : 'Closed'}</span></h3>
  <p>${esc(
    [
      loc.address,
      loc.cross_streets ? `(${loc.cross_streets})` : null,
      [loc.city || 'New York', loc.state || 'NY'].join(', '),
      loc.zip_code,
    ]
      .filter(Boolean)
      .join(' ') || `${borough}, New York, NY`,
  )}${pool.phone ? ` · <a href="tel:${esc(pool.phone.replace(/[^+\d]/g, ''))}">${esc(pool.phone)}</a>` : ''}</p>
  ${pool.notes ? `<p>${esc(pool.notes)}</p>` : ''}
  ${sessions ? `<ul>${sessions}</ul>` : ''}
  ${parksUrl(pool) ? `<p><a href="${esc(parksUrl(pool))}" rel="nofollow">Official NYC Parks page for ${esc(pool.pool_name)}</a></p>` : ''}
</article>`
        })
        .join('')
      return `<section><h2>Indoor pools in ${esc(borough)}</h2>${cards}</section>`
    })
    .join('')

  const faq = FAQ.map(
    (f) =>
      `<section><h3>${esc(f.q)}</h3><p>${esc(f.a(pools.filter((p) => p.status === 'open').map((p) => p.pool_name)))}</p></section>`,
  ).join('')

  const boroughs = byBorough.map(([b]) => b).join(', ')

  // Mirrors what React renders once it mounts — same headings, same claims.
  // Divergence here would read as cloaking to a crawler that checks both.
  return `
<div id="seo-fallback">
  <h1>NYC Indoor Pool Finder</h1>
  <p>Public pools open now — lap swim &amp; open swim schedules</p>
  <p>${openCount} of ${pools.length} NYC indoor pools open today across ${esc(boroughs)}.</p>
  ${sections}
  <section>
    <h2>Indoor swimming in New York City</h2>
    <p>NYC Parks operates ${pools.length} indoor public pools across ${esc(boroughs)}. Every one of
    them sits inside a recreation center, so you need a Recreation Center membership to swim. This
    page pulls the current lap swim, open swim, family swim and water exercise schedules straight
    from nycgovparks.org each morning, so you can see which pools are open now and when the next
    session starts without clicking through a dozen recreation-center pages.</p>
    <h3>What a Recreation Center membership costs</h3>
    <p>As of ${esc(MEMBERSHIP_CHECKED)}</p>
    <table>
      <thead><tr><th>Who</th><th>Cost</th></tr></thead>
      <tbody>${MEMBERSHIP_TIERS.map(
        (t) =>
          `<tr><td>${esc(t.who)}</td><td>${esc(t.price)}${
            t.note ? ` (${esc(t.note)})` : ''
          }</td></tr>`,
      ).join('')}</tbody>
    </table>
    <p>Prices are for the &ldquo;Access to All Centers&rdquo; package — the cheaper $100/year tier
    excludes every center with a pool. ${esc(IDNYC_NOTE)}
    <a href="${esc(MEMBERSHIP_URL)}" rel="nofollow">Full membership details</a>.</p>
    <p>Unlike the city&apos;s outdoor pools — which run only from late June through Labor Day —
    indoor pools are open year-round.</p>
  </section>
  <section><h2>Frequently asked questions</h2>${faq}</section>
</div>`
}

const FALLBACK_STYLE = `
<style id="seo-fallback-style">
#seo-fallback{max-width:72rem;margin:0 auto;padding:1.5rem 1rem;font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;line-height:1.5}
#seo-fallback h1{font-size:1.6rem;margin:0 0 .5rem}
#seo-fallback h2{font-size:1.15rem;margin:1.75rem 0 .5rem}
#seo-fallback h3{font-size:1rem;margin:0 0 .25rem}
#seo-fallback .sf-card{border:1px solid #e2e8f0;border-radius:.75rem;padding:.85rem;margin:.6rem 0}
#seo-fallback .sf-badge{font-size:.7rem;font-weight:600;color:#475569}
#seo-fallback ul{margin:.4rem 0 0;padding-left:1.1rem;font-size:.85rem;color:#475569}
#seo-fallback table{border-collapse:collapse;margin:.5rem 0;font-size:.85rem}
#seo-fallback th,#seo-fallback td{border-bottom:1px solid #e2e8f0;padding:.35rem .9rem .35rem 0;text-align:left}
#seo-fallback p{margin:.25rem 0;font-size:.9rem;color:#475569}
</style>`

export default function seoPlugin() {
  return {
    name: 'nyc-pool-finder-seo',

    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const jsonLd = JSON.stringify(buildJsonLd())
        const openCount = pools.filter((p) => p.status === 'open').length

        return html
          // replaceAll: both counts appear in the OG *and* Twitter tags.
          .replaceAll('%OPEN_COUNT%', String(openCount))
          .replaceAll('%POOL_COUNT%', String(pools.length))
          .replace(
            '</head>',
            `  ${FALLBACK_STYLE}\n    <script type="application/ld+json">${jsonLd.replace(/</g, '\\u003c')}</script>\n  </head>`,
          )
          .replace('<div id="root"></div>', `<div id="root">${buildFallbackHtml()}</div>`)
      },
    },

    generateBundle() {
      const lastmod = (meta.updated_at || '').slice(0, 10)
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
      })
    },
  }
}
