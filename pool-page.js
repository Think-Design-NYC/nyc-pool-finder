// Static HTML for one pool's own page, e.g. /pool/chelsea-pool/.
//
// Deliberately a complete document with no React mount and no app bundle: with
// nothing replacing the markup there is no rendered-vs-raw divergence to
// police, and the page needs no routing, no SPA rewrite and no hydration. It is
// the deepest content on the site — the full dated two-week timetable, which
// the homepage only ever shows a filtered slice of.
//
// Styling is a scoped <style> block for the same reason as the SEO fallback:
// Tailwind has already scanned sources by the time this runs, so any class
// introduced here would be purged.

import { escapeHtml as esc } from './src/html.js'
import { poolNode, parksUrl, NON_PUBLIC_SESSION } from './pool-schema.js'
import {
  getBorough,
  statusLabel,
  parseISODate,
  firstSessionDate,
  poolPath,
} from './src/utils.js'
import { CALL_AHEAD_NOTE } from './src/copy.js'
import {
  IDNYC_NOTE,
  MEMBERSHIP_CHECKED,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_URL,
} from './src/membership.js'

const telHref = (phone) => `tel:${String(phone).replace(/[^+\d]/g, '')}`

// "Monday, Sep 8"
function dayHeading(iso) {
  const d = parseISODate(iso)
  if (!d) return iso
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

// "Sep 8" — for prose and the reopening line.
function shortDay(iso) {
  const d = parseISODate(iso)
  if (!d) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function weekHeading(week) {
  return `Week of ${shortDay(week.start)}`
}

// The status sentence at the top of the page.
//
// A closed pool whose timetable resumes inside the scrape window says so with
// the date, and never reads as open — same invariant the cards hold.
function statusSentence(pool) {
  if (pool.status !== 'closed') return statusLabel(pool)
  const back = firstSessionDate(pool)
  return back
    ? `${statusLabel(pool)} — sessions resume ${shortDay(back)}`
    : statusLabel(pool)
}

function renderDay(day) {
  const sessions = (day.sessions ?? []).filter(
    (s) => !NON_PUBLIC_SESSION.test(s.session_type ?? ''),
  )
  const rows = sessions
    .map(
      (s) =>
        `<tr><td>${esc(s.session_type)}</td><td class="pp-time">${esc(s.time)}</td></tr>`,
    )
    .join('')
  // `holiday` explains an empty day and is shown; `note` ("There are no
  // programs at this pool today") merely restates an empty list and is not.
  const holiday = day.holiday ? `<p class="pp-holiday">${esc(day.holiday)}</p>` : ''
  const hours = day.building_hours
    ? `<p class="pp-hours">Building hours: ${esc(day.building_hours)}</p>`
    : ''
  const body = rows
    ? `<table><tbody>${rows}</tbody></table>`
    : holiday
      ? ''
      : '<p class="pp-empty">No swim sessions scheduled.</p>'
  return `<div class="pp-day"><h4>${esc(dayHeading(day.date))}</h4>${hours}${holiday}${body}</div>`
}

function renderWeeks(pool) {
  const weeks = pool.schedule_weeks ?? []
  if (!weeks.length) return '<p>No schedule has been published for this pool.</p>'
  return weeks
    .map(
      (w) =>
        `<section class="pp-week"><h3>${esc(weekHeading(w))}</h3>${(w.days ?? [])
          .map(renderDay)
          .join('')}</section>`,
    )
    .join('')
}

function buildingHours(pool) {
  const hours = pool.location?.building_hours
  if (!hours || !Object.keys(hours).length) return ''
  const rows = Object.entries(hours)
    .map(
      ([day, time]) =>
        `<tr><td>${esc(day.replaceAll('_', ' – '))}</td><td class="pp-time">${esc(time)}</td></tr>`,
    )
    .join('')
  return `<section><h2>Recreation center hours</h2><table><tbody>${rows}</tbody></table>
  <p class="pp-note">These are the building's hours. The pool is only open during the sessions listed above.</p></section>`
}

function metaDescription(pool) {
  const name = pool.pool_name
  if (pool.status === 'closed') {
    const back = firstSessionDate(pool)
    return `${name} is currently closed${
      pool.closure_reason ? ` ${pool.closure_reason}` : ''
    }.${back ? ` Sessions resume ${shortDay(back)}.` : ''} Address, phone and the latest status for this NYC Parks indoor pool.`
  }
  return `${name} indoor pool schedule — lap swim, open swim and family swim times for the next two weeks, plus address, recreation center hours and phone number.`
}

const STYLE = `
:root{color-scheme:light}
body{margin:0;background:#f8fafc}
.pp{max-width:52rem;margin:0 auto;padding:1.5rem 1rem 3rem;font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;line-height:1.55}
.pp a{color:#0369a1}
.pp-back{display:inline-block;margin-bottom:1rem;font-size:.85rem;text-decoration:none}
.pp-back:hover{text-decoration:underline}
.pp h1{font-size:1.75rem;margin:0 0 .25rem;letter-spacing:-.02em}
.pp h2{font-size:1.15rem;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid #e2e8f0}
.pp h3{font-size:1rem;margin:1.25rem 0 .5rem;color:#0f172a}
.pp h4{font-size:.85rem;margin:.9rem 0 .25rem;color:#334155}
.pp-borough{margin:0 0 .75rem;font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8}
.pp-status{display:inline-block;border-radius:999px;padding:.25rem .7rem;font-size:.8rem;font-weight:600}
.pp-open{background:#d1fae5;color:#065f46}
.pp-closed{background:#fee2e2;color:#991b1b}
.pp-soon{background:#fef3c7;color:#92400e}
.pp-call{margin:1rem 0;border-radius:.6rem;background:#fff7ed;padding:.7rem .9rem;font-size:.9rem;color:#9a3412;border:1px solid #fed7aa}
.pp-notice{margin:1rem 0;border-radius:.6rem;background:#fef2f2;padding:.7rem .9rem;font-size:.9rem;color:#991b1b;border:1px solid #fecaca}
.pp p{font-size:.92rem;color:#475569}
.pp table{border-collapse:collapse;width:100%;max-width:34rem;margin:.35rem 0}
.pp td,.pp th{border-bottom:1px solid #e2e8f0;padding:.35rem .75rem .35rem 0;text-align:left;font-size:.88rem;color:#475569}
.pp-time{font-variant-numeric:tabular-nums;font-weight:600;color:#0369a1;white-space:nowrap}
.pp-day{margin-bottom:.5rem}
.pp-week{margin-bottom:1.5rem}
.pp-hours,.pp-empty,.pp-note{font-size:.8rem;color:#94a3b8;margin:.15rem 0}
.pp-holiday{font-size:.82rem;color:#92400e;margin:.15rem 0;font-weight:500}
.pp-foot{margin-top:2rem;padding-top:1rem;border-top:1px solid #e2e8f0;font-size:.78rem;color:#94a3b8}
.pp-foot a{color:#64748b}
`

export function renderPoolPage({ pool, slug, siteUrl, updatedLabel }) {
  const url = `${siteUrl.replace(/\/$/, '')}${poolPath(slug)}`
  const loc = pool.location ?? {}
  const borough = getBorough(pool)
  const back = firstSessionDate(pool)
  const statusClass =
    pool.status === 'closed' ? (back ? 'pp-soon' : 'pp-closed') : 'pp-open'

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      poolNode(pool, url),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: `${pool.pool_name} — Schedule & Hours`,
        about: { '@id': url },
        isPartOf: { '@id': `${siteUrl}#website` },
        inLanguage: 'en-US',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'NYC Indoor Pool Finder',
            item: siteUrl,
          },
          { '@type': 'ListItem', position: 2, name: pool.pool_name, item: url },
        ],
      },
    ],
  }

  const address = [
    loc.address,
    loc.cross_streets ? `(${loc.cross_streets})` : null,
    [loc.city || 'New York', loc.state || 'NY'].filter(Boolean).join(', '),
    loc.zip_code,
  ]
    .filter(Boolean)
    .join(' ')

  const noticeLinks = (pool.notice_links ?? [])
    .map((l) => `<a href="${esc(l.url)}" rel="nofollow">${esc(l.text)}</a>`)
    .join(' · ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(pool.pool_name)} — Schedule &amp; Hours | NYC Indoor Pool Finder</title>
<meta name="description" content="${esc(metaDescription(pool))}" />
<link rel="canonical" href="${esc(url)}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="theme-color" content="#0284c7" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="NYC Indoor Pool Finder" />
<meta property="og:title" content="${esc(pool.pool_name)} — Schedule &amp; Hours" />
<meta property="og:description" content="${esc(metaDescription(pool))}" />
<meta property="og:url" content="${esc(url)}" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
</head>
<body>
<main class="pp">
  <a class="pp-back" href="/">&larr; All NYC indoor pools</a>
  <h1>${esc(pool.pool_name)}</h1>
  <p class="pp-borough">${esc(borough)} · NYC Parks indoor pool</p>
  <p><span class="pp-status ${statusClass}">${esc(statusSentence(pool))}</span></p>

  ${pool.notes ? `<p class="pp-notice">${esc(pool.notes)}</p>` : ''}
  <p class="pp-call">${esc(CALL_AHEAD_NOTE)}</p>

  <section>
    <h2>Where it is</h2>
    <p>${esc(address || `${borough}, New York, NY`)}</p>
    ${pool.phone ? `<p>Phone: <a href="${esc(telHref(pool.phone))}">${esc(pool.phone)}</a></p>` : ''}
    <p><a href="https://maps.google.com/?q=${encodeURIComponent(`${pool.pool_name} New York NY`)}" rel="nofollow">Directions on Google Maps</a></p>
  </section>

  <section>
    <h2>Swim schedule</h2>
    ${
      pool.reduced_hours
        ? '<p class="pp-note">NYC Parks lists reduced summer hours for this pool.</p>'
        : ''
    }
    ${renderWeeks(pool)}
  </section>

  ${buildingHours(pool)}

  <section>
    <h2>What it costs</h2>
    <p>${esc(pool.pool_name)} sits inside a recreation center, so swimming here needs a
    Recreation Center membership — it is not a free drop-in pool.</p>
    <p class="pp-note">Prices as of ${esc(MEMBERSHIP_CHECKED)}</p>
    <table><thead><tr><th>Who</th><th>Cost</th></tr></thead><tbody>${MEMBERSHIP_TIERS.map(
      (t) =>
        `<tr><td>${esc(t.who)}</td><td>${esc(t.price)}${t.note ? ` (${esc(t.note)})` : ''}</td></tr>`,
    ).join('')}</tbody></table>
    <p>Prices are for the &ldquo;Access to All Centers&rdquo; package — the cheaper $100/year
    tier excludes every center with a pool. ${esc(IDNYC_NOTE)}
    <a href="${esc(MEMBERSHIP_URL)}" rel="nofollow">Full membership details</a>.</p>
  </section>

  <footer class="pp-foot">
    <p>Schedules are scraped from
    <a href="${esc(parksUrl(pool) ?? 'https://www.nycgovparks.org/facilities/indoor-pools')}" rel="nofollow">nycgovparks.org</a>
    and can change without notice.${updatedLabel ? ` Last updated ${esc(updatedLabel)}.` : ''}
    ${esc(CALL_AHEAD_NOTE)}</p>
    ${noticeLinks ? `<p>${noticeLinks}</p>` : ''}
    <p><a href="/">NYC Indoor Pool Finder</a> &middot; <a href="/privacy/">Privacy</a></p>
  </footer>
</main>
</body>
</html>
`
}
