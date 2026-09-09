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
import { callAheadHtml } from './src/html.js'
import {
  boroughsPresent,
  joinBoroughs,
  isOpen,
  statusLabel,
  statusBadgeLabel,
  poolAnchorId as anchorId,
  poolSlugs,
  poolPath,
} from './src/utils.js'
import { escapeHtml as esc } from './src/html.js'
import { NON_PUBLIC_SESSION, parksUrl, poolNode } from './pool-schema.js'
import { renderPoolPage } from './pool-page.js'
import {
  IDNYC_NOTE,
  MEMBERSHIP_CHECKED,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_URL,
} from './src/membership.js'

export const SITE_URL = 'https://pools.thinkdesign.com/'

// One slug table for the whole build: the JSON-LD, the fallback links, the
// emitted pages and the sitemap must all agree on a pool's URL.
const SLUGS = poolSlugs(pools)
const poolUrl = (pool) => `${SITE_URL.replace(/\/$/, '')}${poolPath(SLUGS.get(anchorId(pool)))}`

const BOROUGH_ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']

// Each NYC borough is coextensive with a New York State county. The county is
// the formally correct AdministrativeArea for structured data; the borough name
// rides along as alternateName since that's what people actually search.
// Each pool's canonical identity is now its own page, not a homepage fragment.
// The rendered card keeps its `#pool-…` id so old links still land somewhere,
// but the graph points at the document that actually holds the full timetable.
function poolLd(pool, position) {
  const url = `${SITE_URL.replace(/\/$/, '')}${poolPath(SLUGS.get(anchorId(pool)))}`
  return { '@type': 'ListItem', position, item: poolNode(pool, url) }
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

// The scrape date, formatted as the React header formats it. Pinned to New York
// so a CI build (UTC) and a local build don't disagree about the day.
function lastUpdatedLabel() {
  if (!meta.updated_at) return null
  const t = new Date(meta.updated_at)
  if (Number.isNaN(t.getTime())) return null
  return t.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
}

// Static mirror of the React UI for non-JS crawlers. Replaced on mount.
//
// NOTE: App.jsx also renders <PoolDirectory> — the pools its filters excluded.
// There is deliberately no counterpart here, and that is not drift. This markup
// filters nothing, so its "excluded" set is always empty; the directory exists
// precisely so the *rendered* DOM ends up listing every pool the way this
// fallback already does. The two agree on the union, which is what parity means
// here.
//
// NOTE: App.jsx also renders a "schedules may be out of date" banner past
// STALE_AFTER_HOURS. There is deliberately no counterpart here, and that is not
// drift. This HTML is regenerated only by a deploy, and deploys are triggered by
// data-refresh commits — so at build time the data is always fresh, and a stale
// site is serving a fallback built back when it wasn't. Build-time staleness
// detection is impossible by construction. The scrape date below is the honest
// static equivalent: a crawler can read it and judge freshness itself.
function buildFallbackHtml() {
  const openCount = pools.filter((p) => p.status === 'open').length
  // Mirrors App.jsx: closed pools leave the borough grid and get their own list
  // at the bottom, so they stay visible under every filter combination.
  const closed = pools.filter((p) => p.status === 'closed')
  const byBorough = BOROUGH_ORDER.map((b) => [
    b,
    pools.filter((p) => p.borough === b && p.status !== 'closed'),
  ]).filter(([, list]) => list.length)

  const sections = byBorough
    .map(([borough, list]) => {
      const cards = list
        .map((pool) => {
          const loc = pool.location ?? {}
          const sessions = (pool.schedules ?? [])
            .filter((s) => !NON_PUBLIC_SESSION.test(s.session_type ?? ''))
            .map((s) => `<li>${esc(s.days)} — ${esc(s.session_type)}: ${esc(s.time)}</li>`)
            .join('')
          return `
<article id="${esc(anchorId(pool))}" class="sf-card">
  <h3><a href="${esc(poolPath(SLUGS.get(anchorId(pool))))}">${esc(pool.pool_name)}</a> <span class="sf-badge">${esc(statusBadgeLabel(pool))}</span></h3>
  ${pool.reduced_hours ? '<p>Reduced summer hours</p>' : ''}
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
  <p><a href="${esc(poolPath(SLUGS.get(anchorId(pool))))}">Full ${esc(pool.pool_name)} schedule, hours &amp; directions</a>${
    parksUrl(pool)
      ? ` · <a href="${esc(parksUrl(pool))}" rel="nofollow">Official NYC Parks page</a>`
      : ''
  }</p>
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

  // Two different lists, on purpose: the subhead counts boroughs with an OPEN
  // pool, the "Indoor swimming in New York City" paragraph describes the whole
  // system. Both come from the same helpers React uses, so the wording matches.
  const openBoroughList = joinBoroughs(boroughsPresent(pools, isOpen))
  const allBoroughList = joinBoroughs(boroughsPresent(pools))

  // Mirrors what React renders once it mounts — same headings, same claims.
  // Divergence here would read as cloaking to a crawler that checks both.
  return `
<div id="seo-fallback">
  <h1>NYC Indoor Pool Finder</h1>
  <p>Public pools open now — lap swim &amp; open swim schedules</p>
  <p>${openCount} of ${pools.length} NYC indoor pools open today across ${esc(openBoroughList)}</p>
  <p>${callAheadHtml()}</p>
  ${lastUpdatedLabel() ? `<p>Schedules last updated ${esc(lastUpdatedLabel())}.</p>` : ''}
  ${sections}
  <section>
    <h2>Indoor swimming in New York City</h2>
    <p>NYC Parks operates ${pools.length} indoor public pools across ${esc(allBoroughList)}. Every one of
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
    indoor pools are open year-round. Filter by borough to find a pool near you in
    ${esc(joinBoroughs(boroughsPresent(pools), 'or'))}.</p>
  </section>
  ${
    closed.length
      ? `<section><h2>Currently closed (${closed.length})</h2><ul>${closed
          .map((pool) => {
            // Mirrors ClosedPoolList.jsx: closure sentence, a number to call,
            // and whatever project page the notice linked to.
            const links = [
              ...(pool.notice_links ?? []).map(
                (l) => `<a href="${esc(l.url)}" rel="nofollow">${esc(l.text)}</a>`,
              ),
              pool.url
                ? `<a href="${esc(pool.url)}" rel="nofollow">NYC Parks page</a>`
                : null,
            ].filter(Boolean)
            const contact = [
              pool.phone
                ? `<a href="tel:${esc(pool.phone.replace(/[^+\d]/g, ''))}">${esc(pool.phone)}</a>`
                : null,
              ...links,
            ].filter(Boolean)
            return (
              `<li id="${esc(anchorId(pool))}"><strong><a href="${esc(
                poolPath(SLUGS.get(anchorId(pool))),
              )}">${esc(pool.pool_name)}</a></strong>` +
              ` — ${esc(statusLabel(pool))}` +
              (contact.length ? `<br />${contact.join(' · ')}` : '') +
              `</li>`
            )
          })
          .join('')}</ul></section>`
      : ''
  }
  <section><h2>Frequently asked questions</h2>${faq}</section>
  <p>Schedules are scraped from <a href="https://www.nycgovparks.org/facilities/indoor-pools" rel="nofollow">nycgovparks.org</a> and can change without notice. ${callAheadHtml()}</p>
  <footer><a href="/privacy/">Privacy</a> &middot; <a href="https://thinkdesign.com">Think Design</a></footer>
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
#seo-fallback .sf-closure{font-weight:600;color:#92400e}
#seo-fallback ul{margin:.4rem 0 0;padding-left:1.1rem;font-size:.85rem;color:#475569}
#seo-fallback table{border-collapse:collapse;margin:.5rem 0;font-size:.85rem}
#seo-fallback th,#seo-fallback td{border-bottom:1px solid #e2e8f0;padding:.35rem .9rem .35rem 0;text-align:left}
#seo-fallback p{margin:.25rem 0;font-size:.9rem;color:#475569}
#seo-fallback .call-lead{text-transform:uppercase}
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
      // One static document per pool. No React mount, no app bundle — see the
      // header of pool-page.js for why these are deliberately not SPA routes.
      const updatedLabel = lastUpdatedLabel()
      for (const pool of pools) {
        const slug = SLUGS.get(anchorId(pool))
        this.emitFile({
          type: 'asset',
          fileName: `pool/${slug}/index.html`,
          source: renderPoolPage({ pool, slug, siteUrl: SITE_URL, updatedLabel }),
        })
      }

      // lastmod comes from the scrape timestamp, not the build date, so it
      // stays truthful: a rebuild that changed no data must not claim the
      // content is newer than it is.
      const lastmod = (meta.updated_at || '').slice(0, 10)
      // Only genuinely indexable pages belong here. Each pool now has a real
      // document at /pool/<slug>/ rather than a homepage fragment, so all 13
      // are listed. Anything listed here must NOT carry a noindex, or Search
      // Console reports the contradiction as "Submitted URL marked 'noindex'".
      const pages = [
        { loc: SITE_URL, lastmod, changefreq: 'daily', priority: '1.0' },
        // Every pool page, in the same order the homepage lists them.
        ...pools.map((pool) => ({
          loc: poolUrl(pool),
          lastmod,
          changefreq: 'daily',
          priority: '0.8',
        })),
        // The privacy page changes on its own schedule and has no scrape date
        // to point at, so it carries no lastmod rather than a guessed one.
        { loc: `${SITE_URL}privacy/`, changefreq: 'yearly', priority: '0.3' },
      ]
      const urls = pages
        .map(
          (p) => `  <url>
    <loc>${p.loc}</loc>${p.lastmod ? `\n    <lastmod>${p.lastmod}</lastmod>` : ''}
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
        )
        .join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
      })
    },
  }
}
