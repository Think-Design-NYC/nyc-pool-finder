// Static HTML for one pool's own page, e.g. /pool/chelsea-pool/.
//
// Deliberately a complete document with no React mount and no app bundle: with
// nothing replacing the markup there is no rendered-vs-raw divergence to
// police, and the page needs no routing, no SPA rewrite and no hydration. It is
// the deepest content on the site — the full dated two-week timetable, which
// the homepage only ever shows a filtered slice of.
//
// Laid out after the Figma "Pool detail v4" mockup (2026-10-27): a navy header
// with a stats row, today's sessions as a timeline (desktop) and a list
// (mobile), "Lap swim this week", Up next, and a Getting there map. The page is
// complete without JavaScript. One small inline script (LIVE_SCRIPT) only adds
// what static HTML can't know — the reader's time: which of today's sessions
// are done or on now, the red now-line, the Up next pair and the lap swim stat.
// It switches to the next day's pre-rendered block if the reader is a day past
// the build, and fetches nothing.
//
// Styling is a scoped <style> block for the same reason as the SEO fallback:
// Tailwind has already scanned sources by the time this runs, so any class
// introduced here would be purged.

import { escapeHtml as esc, callAheadHtml } from './src/html.js'
import { callAheadDetail, NEWS } from './src/copy.js'
import { NYC_MAP, projectToMap } from './src/nycMap.js'
import { poolNode, parksUrl, NON_PUBLIC_SESSION } from './pool-schema.js'
import {
  ACTIVITIES,
  formatClock,
  formatDuration,
  getBorough,
  sessionWindow,
  statusLabel,
  parseISODate,
  firstSessionDate,
  poolPath,
  poolAnchorId,
  isNycParks,
  operatorName,
  officialPage,
} from './src/utils.js'
import {
  busList,
  busReach,
  formatMiles,
  isFarFromSubway,
  nearbyPools,
  placeLabel,
  stationLabel,
} from './src/poolMeta.js'
import {
  IDNYC_NOTE,
  MEMBERSHIP_CHECKED,
  MEMBERSHIP_SUMMARY,
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
  const hours = day.building_hours
    ? `<p class="pp-hours">Building hours: ${esc(day.building_hours)}</p>`
    : ''
  const body = rows
    ? `<table><tbody>${rows}</tbody></table>`
    : '<p class="pp-empty">No swim sessions scheduled.</p>'
  return `<div class="pp-day"><h4>${esc(dayHeading(day.date))}</h4>${hours}${body}</div>`
}

// "Adult Lap Swim 7:00 a - 11:00 a, 2:30 p - 3:45 p; General Open Swim …" —
// the sentence an answer engine can lift for "where can I swim today".
function sessionsSentence(sessions) {
  const byType = new Map()
  for (const s of sessions) {
    if (!byType.has(s.session_type)) byType.set(s.session_type, [])
    byType.get(s.session_type).push(s.time)
  }
  return [...byType].map(([type, times]) => `${type} ${times.join(', ')}`).join('; ')
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
  const heading = isNycParks(pool) ? 'Recreation center hours' : 'Park hours'
  return `<section class="pp-card"><h2>${heading}</h2><table><tbody>${rows}</tbody></table>
  <p class="pp-note">These are the building's hours. The pool is only open during the sessions listed above.</p></section>`
}

function metaDescription(pool) {
  const name = `${pool.pool_name} in ${placeLabel(pool, { skipIfNamed: true })}`
  if (pool.status === 'closed') {
    const back = firstSessionDate(pool)
    return `${name} is currently closed${
      pool.closure_reason ? ` ${pool.closure_reason}` : ''
    }.${back ? ` Sessions resume ${shortDay(back)}.` : ''} Address, phone and the latest status for this ${operatorName(pool)} indoor pool.`
  }
  const hours = isNycParks(pool) ? 'recreation center hours' : 'admission prices'
  return `${name}: indoor pool schedule — lap swim, open swim and family swim times for the next two weeks, plus address, ${hours} and phone number.`
}

const STYLE = `
:root{color-scheme:light}
[hidden]{display:none!important}
body{margin:0;background:#f4f7fa;font-family:'Instrument Sans',ui-sans-serif,system-ui,sans-serif;color:#0b2a4a;line-height:1.55}
.pp a{color:#1668e3}
.pp-hero{background:#0b2a4a;color:#fff}
.pp-wrap{max-width:72rem;margin:0 auto;padding:0 1rem}
.pp-hero .pp-wrap{padding-top:1.1rem;padding-bottom:1.5rem}
.pp-back{display:inline-block;font-size:.85rem;color:rgba(255,255,255,.8)!important;text-decoration:none}
.pp-back:hover{text-decoration:underline}
.pp h1{font-family:'Bricolage Grotesque',ui-sans-serif,system-ui,sans-serif;font-size:clamp(1.9rem,5vw,3.1rem);line-height:1.05;margin:.6rem 0 .5rem;letter-spacing:-.025em}
.pp-sub{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .75rem;font-size:.9rem;color:rgba(255,255,255,.8);margin:0}
.pp-badge{display:inline-flex;align-items:center;gap:.4rem;border-radius:999px;background:rgba(255,255,255,.1);padding:.2rem .7rem;font-size:.78rem;color:rgba(255,255,255,.88)}
.pp-badge i{width:.4rem;height:.4rem;border-radius:50%;background:#10976a}
.pp-hero-top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1rem}
.pp-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:.6rem 1.2rem;font-size:.9rem;font-weight:600;text-decoration:none!important;white-space:nowrap}
.pp-btn-primary{background:#1668e3;color:#fff!important}
.pp-btn-ghost{background:#fff;color:#0b2a4a!important}
.pp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr));gap:.6rem;margin-top:1.25rem;padding-top:1.1rem;border-top:1px solid rgba(255,255,255,.12)}
.pp-stat{border-radius:.75rem;background:rgba(255,255,255,.06);padding:.65rem .8rem}
.pp-stat b{display:block;font-size:.68rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.65)}
.pp-stat .v{display:block;font-family:'DM Mono',ui-monospace,monospace;font-size:1.25rem;line-height:1.3;margin-top:.15rem}
.pp-stat .d{display:block;font-size:.78rem;color:rgba(255,255,255,.75)}
.pp-status{display:inline-block;border-radius:999px;padding:.2rem .65rem;font-size:.78rem;font-weight:600}
.pp-open{background:#d1fae5;color:#065f46}
.pp-closed{background:#fee2e2;color:#991b1b}
.pp-soon{background:#fef3c7;color:#92400e}
.pp-news{display:inline-flex;align-items:center;gap:.35rem;border-radius:999px;background:#d6f1fa;padding:.2rem .7rem;font-size:.78rem;font-weight:600;color:#1668e3!important;text-decoration:none}
.pp-body{display:grid;gap:1.25rem;padding-top:1.5rem;padding-bottom:2rem}
@media (min-width:960px){.pp-body{grid-template-columns:minmax(0,1fr) 22rem;align-items:start}.pp-only-sm{display:none!important}}
@media (max-width:959px){.pp-only-lg{display:none!important}}
.pp-col{display:grid;gap:1.25rem;min-width:0}
.pp-card{background:#fff;border:1px solid #dce4ec;border-radius:1rem;padding:1.1rem 1.25rem}
.pp-card h2{font-size:1.05rem;margin:0 0 .75rem;display:flex;justify-content:space-between;align-items:baseline;gap:1rem}
.pp-card h2 small{font-size:.78rem;font-weight:400;color:#5a6e85}
.pp-card h3{font-size:.95rem;margin:1.1rem 0 .4rem}
.pp-card h4{font-size:.85rem;margin:.9rem 0 .25rem}
.pp p{font-size:.92rem;color:#5a6e85;margin:.35rem 0}
.pp ul{color:#5a6e85;font-size:.92rem}
.pp table{border-collapse:collapse;width:100%;margin:.35rem 0}
.pp td,.pp th{border-bottom:1px solid #dce4ec;padding:.35rem .75rem .35rem 0;text-align:left;font-size:.88rem;color:#5a6e85}
.pp-time{font-family:'DM Mono',ui-monospace,monospace;font-weight:500;color:#1668e3;white-space:nowrap}
.pp-call{border-radius:.6rem;background:#fff7ed;padding:.7rem .9rem;font-size:.9rem;color:#9a3412!important;border:1px solid #fed7aa}
.pp .call-lead{text-transform:uppercase}
.pp-notice{border-radius:.6rem;background:#fef2f2;padding:.7rem .9rem;font-size:.9rem;color:#991b1b!important;border:1px solid #fecaca}
.pp-tl{position:relative;margin-top:.25rem}
.pp-tl-axis,.pp-tl-row{display:grid;grid-template-columns:8.5rem 1fr;align-items:center}
.pp-tl-axis span{position:relative;height:1.2rem}
.pp-tl-axis em{position:absolute;transform:translateX(-50%);font-style:normal;font-size:.68rem;font-weight:600;color:#5a6e85;white-space:nowrap}
.pp-tl-row{min-height:2.4rem}
.pp-tl-row > b{font-size:.85rem;font-weight:600}
.pp-tl-track{position:relative;height:2.4rem;background:repeating-linear-gradient(to right,#eef2f5 0,#eef2f5 1px,transparent 1px,transparent 12.5%)}
.pp-bar{position:absolute;top:.35rem;bottom:.35rem;border-radius:.4rem;padding:0 .4rem;font-family:'DM Mono',ui-monospace,monospace;font-size:.68rem;line-height:1.7rem;overflow:hidden;white-space:nowrap;color:#fff}
.pp-bar.is-done{opacity:.45}
.pp-now{position:absolute;top:1.2rem;bottom:0;width:2px;background:#f2542d;margin-left:calc(8.5rem - 1px)}
.pp-now span{position:absolute;bottom:0;left:50%;transform:translateX(-50%);border-radius:.3rem;background:#f2542d;color:#fff;font-family:'DM Mono',ui-monospace,monospace;font-size:.68rem;padding:0 .3rem;white-space:nowrap}
.pp-tl-wrap{position:relative;padding-bottom:1.6rem}
.pp-list{list-style:none;margin:0;padding:0}
.pp-list li{display:grid;grid-template-columns:.25rem 8.6rem 1fr auto;gap:.6rem;align-items:center;padding:.55rem .25rem;border-bottom:1px solid #eef2f5;color:#0b2a4a}
.pp-list li:last-child{border-bottom:0}
.pp-list i{align-self:stretch;border-radius:2px}
.pp-list .t{font-family:'DM Mono',ui-monospace,monospace;font-size:.8rem;white-space:nowrap}
.pp-list .k{font-size:.88rem;font-weight:600}
.pp-state{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5a6e85}
.pp-list li.is-done{color:#5a6e85}
.pp-list li.is-done .k{font-weight:500}
.pp-list li.is-on{background:#e3f6ee;border-radius:.4rem}
.pp-list li.is-on .pp-state{color:#10976a}
.pp-week-l{list-style:none;margin:0;padding:0}
.pp-week-l li{display:grid;grid-template-columns:3.2rem 1fr;gap:.5rem;align-items:center;padding:.45rem .5rem;border-radius:.5rem}
.pp-week-l li:first-child{background:#d6f1fa}
.pp-week-l b{font-size:.88rem}
.pp-chip{display:inline-block;margin:.15rem .3rem .15rem 0;border-radius:.4rem;background:#f4f7fa;border:1px solid #dce4ec;padding:.05rem .45rem;font-family:'DM Mono',ui-monospace,monospace;font-size:.8rem;color:#0b2a4a}
.pp-none{font-family:'DM Mono',ui-monospace,monospace;font-size:.8rem;color:#5a6e85}
.pp-un{list-style:none;margin:0;padding:0;display:grid;gap:.6rem}
.pp-un li{display:flex;gap:.75rem;border:1px solid #dce4ec;border-radius:.8rem;padding:.7rem .85rem}
.pp-un li[hidden]{display:none}
.pp-un i{width:.25rem;border-radius:2px;background:#1668e3}
.pp-un li.is-on i{background:#10976a}
.pp-un .t{font-family:'DM Mono',ui-monospace,monospace;font-size:1.15rem;line-height:1.2;min-width:4.6rem}
.pp-un .t small{display:block;font-size:.72rem;color:#5a6e85}
.pp-un .s{font-size:.66rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1668e3}
.pp-un li.is-on .s{color:#10976a}
.pp-un .k{font-weight:700;font-size:.92rem}
.pp-map{display:block;width:100%;height:auto;border-radius:.75rem;background:#c9ebf6}
.pp-good{margin:.25rem 0 0;padding-left:1.1rem}
.pp-good li{margin:.35rem 0}
.pp-day{margin-bottom:.5rem}
.pp-week{margin-bottom:1.25rem}
.pp-hours,.pp-empty,.pp-note{font-size:.8rem;color:#5a6e85;margin:.15rem 0}
.pp-near{list-style:none;padding:0;margin:.35rem 0}
.pp-near li{padding:.35rem 0;border-bottom:1px solid #dce4ec;font-size:.92rem;color:#5a6e85}
.pp-near a{font-weight:600}
.pp-foot{padding-top:1rem;border-top:1px solid #dce4ec;font-size:.78rem;color:#5a6e85}
.pp-foot p{font-size:.78rem}
.pp-foot a{color:#5a6e85}
.pp-qr{display:block;width:min(190px,50vw);height:auto;border:1px solid #dce4ec;border-radius:.5rem;margin:.75rem 0}
.pp-cta{position:sticky;bottom:0;display:flex;gap:.6rem;padding:.75rem 1rem;background:rgba(244,247,250,.95);border-top:1px solid #dce4ec}
.pp-cta .pp-btn{flex:1}
`

// ── The mockup's blocks ────────────────────────────────────────────────────

// Activity buckets for the timeline rows and colours, most specific first:
// "Family Recreational Swim" is a family row, not lap swim, even though
// ACTIVITIES counts it as lap swim for filtering (lanes stay roped).
const BUCKET_ORDER = [
  'Family Swim',
  'Children/Teen Swim',
  'Learn to Swim',
  'Water Exercise',
  'Swim Team',
  'Water Polo',
  'Open Swim',
  'Lap Swim',
]
const ROW_ORDER = ['Lap Swim', 'Open Swim', ...BUCKET_ORDER.slice(0, 6), 'Other']
const BUCKET_STYLE = {
  'Lap Swim': ['#1668e3', '#fff'],
  'Open Swim': ['#0b2a4a', '#fff'],
  'Family Swim': ['#f5b83d', '#0b2a4a'],
  'Children/Teen Swim': ['#8ec5ff', '#0b2a4a'],
  'Learn to Swim': ['#7c8fd6', '#fff'],
  'Water Exercise': ['#10976a', '#fff'],
  'Swim Team': ['#5a6e85', '#fff'],
  'Water Polo': ['#5a6e85', '#fff'],
  Other: ['#b8c6d4', '#0b2a4a'],
}
const LAP = ACTIVITIES.find((a) => a.key === 'Lap Swim')

function bucketOf(type) {
  const key = BUCKET_ORDER.find((k) => ACTIVITIES.find((a) => a.key === k).match(type))
  return key ?? 'Other'
}

// NYC Parks' "Swim For Life" sessions are classes for named public schools
// ("Swim For Life at Asser Levy Class A Wednesday - PS 1") — nobody else can
// join, so they'd make a useless Up next.
const SCHOOL_CLASS = /swim for life/i

// A day's public sessions, timed and bucketed, in start order. School classes,
// sessions with an unreadable time, and am/pm typo starts before 5 am (Roy
// Wilkins "12:00 a") stay in the full timetable below — as NYC Parks posts
// them — but out of the timeline, the counts and the live blocks.
function publicSessions(pool, iso) {
  const day = (pool.schedule_weeks ?? []).flatMap((w) => w.days ?? []).find((d) => d.date === iso)
  return (day?.sessions ?? [])
    .filter((s) => !NON_PUBLIC_SESSION.test(s.session_type ?? ''))
    .filter((s) => !SCHOOL_CLASS.test(s.session_type ?? ''))
    .map((s) => ({ ...s, w: sessionWindow(s.time), bucket: bucketOf(s.session_type) }))
    .filter((s) => s.w && s.w.start >= 5 * 60)
    .sort((a, b) => a.w.start - b.w.start || a.w.end - b.w.end)
}

function dayOf(pool, iso) {
  return (pool.schedule_weeks ?? []).flatMap((w) => w.days ?? []).find((d) => d.date === iso)
}

function addDays(iso, n) {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  const pad = (v) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// "7:00–9:45 am", "11:00 am–2:30 pm"
function range(w) {
  const [a, am] = formatClock(w.start).split(' ')
  const [b, bm] = formatClock(w.end).split(' ')
  return am === bm ? `${a}–${b} ${bm}` : `${a} ${am}–${b} ${bm}`
}

// "7–9:45" for a timeline bar.
const barTime = (w) =>
  [w.start, w.end].map((m) => formatClock(m).split(' ')[0].replace(/:00$/, '')).join('–')

const DAY_START = 6 * 60
const DAY_SPAN = 16 * 60 // 6 am to 10 pm
const pct = (m) => ((Math.min(Math.max(m, DAY_START), DAY_START + DAY_SPAN) - DAY_START) / DAY_SPAN) * 100

// Desktop: one row per activity, bars across 6 am–10 pm. Decorative — the
// list and the sentence carry the same facts for screen readers.
function timelineHtml(sessions) {
  const rows = ROW_ORDER.filter((k) => sessions.some((s) => s.bucket === k))
  const ticks = [6, 8, 10, 12, 14, 16, 18, 20, 22]
    .map((h) => `<em style="left:${((h - 6) / 16) * 100}%">${h === 12 ? 'NOON' : `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`}</em>`)
    .join('')
  const body = rows
    .map((k) => {
      const [bg, fg] = BUCKET_STYLE[k]
      const bars = sessions
        .filter((s) => s.bucket === k && s.w.end > DAY_START && s.w.start < DAY_START + DAY_SPAN)
        .map((s) => {
          const left = pct(s.w.start)
          return `<span class="pp-bar" data-s="${s.w.start}" data-e="${s.w.end}" title="${esc(`${s.session_type}, ${range(s.w)}`)}" style="left:${left}%;width:${pct(s.w.end) - left}%;background:${bg};color:${fg}">${esc(barTime(s.w))}</span>`
        })
        .join('')
      return `<div class="pp-tl-row"><b>${esc(k === 'Other' ? 'Other' : k.replace(' Swim', ' swim'))}</b><div class="pp-tl-track">${bars}</div></div>`
    })
    .join('')
  return `<div class="pp-tl-wrap pp-only-lg" aria-hidden="true"><div class="pp-tl"><div class="pp-tl-axis"><span></span><span>${ticks}</span></div>${body}</div><div class="pp-now" hidden><span></span></div></div>`
}

function listHtml(sessions) {
  return `<ul class="pp-list pp-only-sm">${sessions
    .map(
      (s) =>
        `<li data-s="${s.w.start}" data-e="${s.w.end}"${LAP.match(s.session_type) ? ' data-lap' : ''}><i style="background:${BUCKET_STYLE[s.bucket][0]}"></i><span class="t">${esc(range(s.w))}</span><span class="k">${esc(s.session_type)}</span><span class="pp-state"></span></li>`,
    )
    .join('')}</ul>`
}

// One "Today" card per pre-rendered day; only `visible` shows without script.
function todayCard(pool, iso, visible) {
  const sessions = publicSessions(pool, iso)
  if (!sessions.length && pool.status === 'closed' && !visible) return ''
  const sentence = sessions.length
    ? `<p>${esc(pool.pool_name)} swim sessions on ${esc(dayHeading(iso))}: ${esc(sessionsSentence(sessions))}.</p>`
    : `<p>No swim sessions are scheduled at ${esc(pool.pool_name)} on ${esc(dayHeading(iso))}.</p>`
  return `<section class="pp-card" data-pp-day="${iso}"${visible ? '' : ' hidden'}>
    <h2>Today, ${esc(dayHeading(iso))}<small>${sessions.length} session${sessions.length === 1 ? '' : 's'}</small></h2>
    ${sessions.length ? `${timelineHtml(sessions)}${listHtml(sessions)}` : ''}
    ${sentence}
  </section>`
}

// Up next: every session of the day, the first two shown. The script keeps
// whichever is on now plus the next one, and labels them.
function upNextCard(pool, iso, visible, cls) {
  const sessions = publicSessions(pool, iso)
  if (!sessions.length) return ''
  const items = sessions
    .map((s, i) => {
      const [start, startMer] = formatClock(s.w.start).split(' ')
      const [end, endMer] = formatClock(s.w.end).split(' ')
      // "6:00 am" over "to 9:30 pm": the start's am/pm only when it differs.
      const startTxt = startMer === endMer ? start : `${start}<small style="display:inline"> ${startMer}</small>`
      return `<li data-s="${s.w.start}" data-e="${s.w.end}"${i > 1 ? ' hidden' : ''}><i></i><span class="t">${startTxt}<small>to ${end} ${endMer}</small></span><span><span class="s">${s.w.start >= 17 * 60 ? 'Tonight' : 'Today'}</span><span class="k" style="display:block">${esc(s.session_type)}</span></span></li>`
    })
    .join('')
  return `<section class="pp-card ${cls}" data-pp-day="${iso}"${visible ? '' : ' hidden'}>
    <h2>Up next</h2>
    <ul class="pp-un">${items}</ul>
    <p class="pp-un-none" hidden>Nothing else today. <a href="#pp-week">See this week</a>.</p>
  </section>`
}

// "from $25/yr · free 24 & under", from the hand-typed tiers.
function membershipShort() {
  const dollars = MEMBERSHIP_TIERS.map((t) => /\$(\d+)/.exec(t.price)?.[1]).filter(Boolean).map(Number)
  const free = MEMBERSHIP_TIERS.find((t) => /free/i.test(t.price))
  return [`from $${Math.min(...dollars)}/yr`, free && `free ${free.who.replace(' and ', ' & ')}`]
    .filter(Boolean)
    .join(' · ')
}

function statsHtml(pool, iso, visible, weekISO) {
  const sessions = publicSessions(pool, iso)
  const lap = sessions.filter((s) => LAP.match(s.session_type))
  let lapV
  let lapD
  if (lap.length) {
    lapV = formatClock(lap[0].w.start)
    lapD = lap.length === 1 ? 'today' : `first of ${lap.length} today`
  } else {
    const next = weekISO
      .slice(1)
      .map((d) => ({ d, s: publicSessions(pool, d).find((x) => LAP.match(x.session_type)) }))
      .find((x) => x.s)
    lapV = 'None today'
    lapD = next ? `next ${shortWeekday(next.d)} ${formatClock(next.s.w.start)}` : 'none this week'
  }
  const kinds = [...new Set(sessions.map((s) => s.bucket))]
    .slice(0, 3)
    .map((k) => (k === 'Other' ? 'other' : k.replace(' Swim', '').toLowerCase()))
    .join(', ')
  const entry = isNycParks(pool)
    ? ['Membership', membershipShort()]
    : ['Per visit', `${(pool.admission?.tiers ?? []).map((t) => t.price).sort()[0] ?? ''}+ · lap pass extra`]
  const stations = pool.place?.subway ?? []
  const transit = stations.length
    ? [formatMiles(stations[0].miles), `to ${stationLabel(stations[0])}`]
    : null
  const stat = (label, v, d, attr = '') =>
    `<div class="pp-stat"${attr}><b>${esc(label)}</b><span class="v">${esc(v)}</span><span class="d">${esc(d)}</span></div>`
  // A closed pool with nothing today leads with the closure, not "None today".
  const first =
    pool.status === 'closed' && !sessions.length
      ? stat('Status', 'Closed', pool.closure_reason ?? statusSentence(pool))
      : stat('Lap swim', lapV, lapD, ' data-pp-lap')
  return `<div class="pp-stats" data-pp-day="${iso}"${visible ? '' : ' hidden'}>
    ${first}
    ${stat('Today', `${sessions.length} session${sessions.length === 1 ? '' : 's'}`, kinds || 'no sessions')}
    ${stat('Entry', entry[0], entry[1])}
    ${transit ? stat('Nearest subway', transit[0], transit[1]) : ''}
  </div>`
}

const shortWeekday = (iso) => parseISODate(iso).toLocaleDateString('en-US', { weekday: 'short' })

// The next seven days of lap swim as time chips — the mockup's week card. One
// per pre-rendered day, so "Today" is the reader's today.
function weekCard(pool, startISO, visible) {
  const weekISO = Array.from({ length: 7 }, (_, i) => addDays(startISO, i))
  const rows = weekISO
    .map((iso, i) => {
      const day = dayOf(pool, iso)
      if (!day) return ''
      const lap = publicSessions(pool, iso).filter((s) => LAP.match(s.session_type))
      const closed = /closed/i.test(day.building_hours ?? '')
      const cells = lap.length
        ? lap.map((s) => `<span class="pp-chip">${esc(range(s.w))}</span>`).join('')
        : `<span class="pp-none">${closed ? 'Closed' : 'No lap swim'}</span>`
      return `<li><b>${i === 0 ? 'Today' : shortWeekday(iso)}</b><span>${cells}</span></li>`
    })
    .join('')
  if (!rows) return ''
  return `<section class="pp-card" data-pp-day="${startISO}"${visible ? '' : ' hidden'}><h2>Lap swim this week<small>next 7 days</small></h2><ul class="pp-week-l">${rows}</ul></section>`
}

function goodToKnow(pool) {
  const items = []
  items.push(
    isNycParks(pool)
      ? `Swimming here needs a Recreation Center membership: ${esc(MEMBERSHIP_SUMMARY)}. <a href="#pp-cost">Prices</a>.`
      : `Run by New York State Parks: no membership, you pay per visit. <a href="#pp-cost">Prices</a>.`,
  )
  if (pool.reduced_hours) items.push('NYC Parks lists reduced summer hours for this pool.')
  if (NEWS.poolName === pool.pool_name) {
    items.push(`<a href="${esc(NEWS.postUrl)}">${esc(NEWS.headline)}</a> — ${esc(NEWS.tag.toLowerCase())}.`)
  }
  const links = (pool.notice_links ?? [])
    .map((l) => `<a href="${esc(l.url)}" rel="nofollow">${esc(l.text)}</a>`)
    .join(' · ')
  return `<section class="pp-card"><h2>Good to know</h2>
    ${pool.notes ? `<p class="pp-notice">${esc(pool.notes)}</p>` : ''}
    ${links ? `<p>${links}</p>` : ''}
    <p class="pp-call">${callAheadHtml(callAheadDetail(pool))}</p>
    <ul class="pp-good">${items.map((t) => `<li>${t}</li>`).join('')}</ul>
  </section>`
}

const directionsUrl = (pool) =>
  `https://maps.google.com/?q=${encodeURIComponent(`${pool.pool_name} New York NY`)}`

// A crop of the shared /nyc-map.svg around the pool (scripts/make_map.py).
function mapHtml(pool) {
  if (pool.place?.lat == null) return ''
  const [x, y] = projectToMap(pool.place.lat, pool.place.lng)
  const w = 150
  const h = 95
  const label = pool.pool_name.replace(/ (Pool|Pool & Rink|Recreation Center Pool)$/, '')
  const lw = label.length * 3.3 + 8
  return `<svg class="pp-map" viewBox="${(x - w / 2).toFixed(1)} ${(y - h / 2).toFixed(1)} ${w} ${h}" role="img" aria-label="${esc(`Map of the area around ${pool.pool_name}`)}">
    <image href="/nyc-map.svg" x="0" y="0" width="${NYC_MAP.width}" height="${NYC_MAP.height}" />
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="#f2542d" />
    <rect x="${(x - lw / 2).toFixed(1)}" y="${(y - 13).toFixed(1)}" width="${lw.toFixed(1)}" height="9" rx="4.5" fill="#f2542d" stroke="#fff" stroke-width=".8" />
    <text x="${x.toFixed(1)}" y="${(y - 8.5).toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="5.2" font-weight="700" fill="#fff" font-family="'Instrument Sans',sans-serif">${esc(label)}</text>
  </svg>`
}

function gettingThere(pool, address) {
  return `<section class="pp-card"><h2>Getting there</h2>
    ${mapHtml(pool)}
    <p>${esc(address)}</p>
    ${pool.phone ? `<p>Phone: <a href="${esc(telHref(pool.phone))}">${esc(pool.phone)}</a></p>` : ''}
    ${transitHtml(pool)}
    <p><a class="pp-btn pp-btn-primary" style="width:100%;box-sizing:border-box;margin-top:.5rem" href="${esc(directionsUrl(pool))}" rel="nofollow">Get directions</a></p>
  </section>`
}

function aboutCard(pool, updatedLabel, checkedAt) {
  const page = officialPage(pool)
  return `<section class="pp-card"><h2>About this schedule</h2>
    ${checkedAt && isNycParks(pool) ? `<p><span class="pp-badge" style="background:#e3f6ee;color:#065f46"><i></i>Schedules checked ${esc(checkedAt)} · NYC Parks</span></p>` : ''}
    <p>${sourceLine(pool, updatedLabel)}</p>
    <p>Spot a change? <a href="${esc(page.url)}" rel="nofollow">Check ${esc(page.host)}</a>.</p>
  </section>`
}

// Reads the reader's New York clock and marks up what's live. Hand-minified
// ES2015, no dependencies, nothing fetched. Kept tiny on purpose: the page must
// read correctly without it.
const LIVE_SCRIPT = `(function(){
var p={};new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).forEach(function(x){p[x.type]=x.value});
var iso=p.year+'-'+p.month+'-'+p.day,t=+p.hour*60+ +p.minute;
function fm(m){var h=Math.floor(m/60);return(h%12||12)+':'+('0'+m%60).slice(-2)+(h<12?' am':' pm')}
function du(m){var h=Math.floor(m/60),r=m%60;return h?(r?h+' h '+r+' min':h+' h'):r+' min'}
var all=document.querySelectorAll('[data-pp-day]'),any=false;
all.forEach(function(b){var on=b.getAttribute('data-pp-day')===iso;b.hidden=!on;if(on)any=true});
if(!any){all.forEach(function(b){b.hidden=true});var st=document.getElementById('pp-stale');if(st)st.hidden=false;return}
var day='[data-pp-day="'+iso+'"] ';
document.querySelectorAll(day+'[data-s]').forEach(function(el){var s=+el.dataset.s,e=+el.dataset.e,k=t>=e?'done':t>=s?'on':'next';el.classList.add('is-'+k);var l=el.querySelector('.pp-state');if(l)l.textContent=k==='done'?'Done':k==='on'?'On now':''});
document.querySelectorAll(day+'.pp-now').forEach(function(n){if(t<360||t>1320)return;n.style.left='calc((100% - 8.5rem) * '+(t-360)/960+')';n.firstChild.textContent=fm(t);n.hidden=false});
document.querySelectorAll(day+'.pp-un').forEach(function(u){var li=[].slice.call(u.children),k=li.filter(function(x){return t<+x.dataset.e}).slice(0,2);li.forEach(function(x){x.hidden=k.indexOf(x)<0});k.forEach(function(x){var s=+x.dataset.s,e=+x.dataset.e,lab=x.querySelector('.s');if(t>=s){x.classList.add('is-on');lab.textContent='On now \\u00b7 ends in '+du(e-t)}else lab.textContent=s-t<=60?'Starts in '+du(s-t):s>=1020?'Tonight':'Later today'});var none=u.nextElementSibling;if(none&&!k.length)none.hidden=false});
var lap=[].slice.call(document.querySelectorAll(day+'li[data-lap]')).map(function(x){return[+x.dataset.s,+x.dataset.e]});
document.querySelectorAll(day+'[data-pp-lap]').forEach(function(c){if(!lap.length)return;var on=lap.filter(function(w){return w[0]<=t&&t<w[1]})[0],nx=lap.filter(function(w){return w[0]>t})[0],v=c.querySelector('.v'),d=c.querySelector('.d');if(on){v.textContent='On now';d.textContent=fm(on[0])+' to '+fm(on[1])+', ends in '+du(on[1]-t)}else if(nx){v.textContent=fm(nx[0]);d.textContent=nx[0]-t<=60?'starts in '+du(nx[0]-t):'next today'}else{v.textContent='Done today';d.textContent='see this week below'}});
})()`

// Links to the other pools, nearest first, with the distance and whether each
// is open — a closed pool must say so before anyone sets off for it. Gives
// every pool page a path to every other, rather than only back to the
// homepage.
function nearbyList(rows, slugs) {
  return `<ul class="pp-near">${rows
    .map(({ pool: p, miles }) => {
      const href = poolPath(slugs.get(poolAnchorId(p)))
      return `<li><a href="${esc(href)}">${esc(p.pool_name)}</a> — ${esc(placeLabel(p))}${
        miles == null ? '' : ` · ${esc(formatMiles(miles))}`
      } · ${esc(statusSentence(p))}</li>`
    })
    .join('')}</ul>`
}

function nearbySection(pool, pools, slugs) {
  if (!slugs) return ''
  const { sameBorough, otherBoroughs } = nearbyPools(pool, pools)
  const borough = getBorough(pool)
  const parts = []
  if (sameBorough.length) {
    parts.push(`<h2>Other indoor pools in ${esc(borough)}</h2>${nearbyList(sameBorough, slugs)}`)
  }
  if (otherBoroughs.length) {
    parts.push(
      `<h${sameBorough.length ? 3 : 2}>Nearest indoor pools in other boroughs</h${sameBorough.length ? 3 : 2}>${nearbyList(otherBoroughs, slugs)}`,
    )
  }
  if (!parts.length) return ''
  return `<section class="pp-card">${parts.join('')}<p class="pp-note">Distances are straight-line miles from ${esc(pool.pool_name)}.</p></section>`
}

function transitHtml(pool) {
  const place = pool.place
  const stations = place?.subway ?? []
  if (!stations.length) return ''
  const parts = []
  if (isFarFromSubway(place)) {
    // Listing three stations two miles off would read as directions.
    parts.push(
      `<p>No subway station within a mile — the closest is ${esc(stationLabel(stations[0]))}, ${esc(formatMiles(stations[0].miles))} away.</p>`,
    )
  } else {
    parts.push(
      `<p>Nearest subway stations:</p><ul>${stations
        .map((s) => `<li>${esc(stationLabel(s))} — ${esc(formatMiles(s.miles))}</li>`)
        .join('')}</ul>`,
    )
  }
  if (place.lirr) {
    parts.push(
      `<p>LIRR: ${esc(place.lirr.station)} station — ${esc(formatMiles(place.lirr.miles))}</p>`,
    )
  }
  if (place.buses?.length) {
    parts.push(`<p>Buses stopping ${esc(busReach(place))}: ${esc(busList(place))}</p>`)
  }
  return parts.join('\n    ')
}

function priceTable(rows) {
  return `<table><thead><tr><th>Who</th><th>Cost</th></tr></thead><tbody>${rows
    .map(
      (t) =>
        `<tr><td>${esc(t.who)}</td><td>${esc(t.price)}${t.note ? ` (${esc(t.note)})` : ''}</td></tr>`,
    )
    .join('')}</tbody></table>`
}

// NYC Parks pools: the Rec Center membership. Riverbank: its walk-up ticket
// and the separate advance lap pass — never the membership, which it doesn't
// take. Both price sets are hand-typed with their own "as of" date.
function costSection(pool) {
  if (!isNycParks(pool)) {
    const adm = pool.admission
    const lap = pool.lap_pass
    return `<section class="pp-card" id="pp-cost">
    <h2>What it costs</h2>
    <p>No membership — ${esc(pool.pool_name)} is run by New York State Parks and charges per visit.</p>
    ${adm ? `<h3>Walk-up ticket</h3><p class="pp-note">Prices as of ${esc(adm.checked)}</p>${priceTable(adm.tiers)}<p>${esc(adm.notes)}</p>` : ''}
    ${lap ? `<h3>Morning lap swim pass</h3><p class="pp-note">Prices as of ${esc(lap.checked)}</p>${priceTable([{ who: lap.who, price: lap.price }])}<p>${esc(lap.notes)}</p>` : ''}
  </section>`
  }
  return `<section class="pp-card" id="pp-cost">
    <h2>What it costs</h2>
    <p>${esc(pool.pool_name)} sits inside a recreation center, so swimming here needs a
    Recreation Center membership — it is not a free drop-in pool.</p>
    <p class="pp-note">Prices as of ${esc(MEMBERSHIP_CHECKED)}</p>
    ${priceTable(MEMBERSHIP_TIERS)}
    <p>Prices are for the &ldquo;Access to All Centers&rdquo; package — the cheaper $100/year
    tier excludes every center with a pool. ${esc(IDNYC_NOTE)}
    <a href="${esc(MEMBERSHIP_URL)}" rel="nofollow">Full membership details</a>.</p>
  </section>`
}

// Where the timetable came from. Riverbank's is typed from a PDF, not scraped,
// so it has no scrape date to vouch for.
function sourceLine(pool, updatedLabel) {
  if (!isNycParks(pool)) {
    const href = pool.schedule_pdf || officialPage(pool).url
    return `Schedule typed by hand from the
    <a href="${esc(href)}" rel="nofollow">${esc(pool.season?.label ?? '')} NYS Parks schedule</a>
    (${esc(officialPage(pool).host)}) and can change without notice.`
  }
  return `Schedules are scraped from
    <a href="${esc(parksUrl(pool) ?? 'https://www.nycgovparks.org/facilities/indoor-pools')}" rel="nofollow">nycgovparks.org</a>
    and can change without notice.${updatedLabel ? ` Last updated ${esc(updatedLabel)}.` : ''}`
}

export function renderPoolPage({
  pool,
  slug,
  siteUrl,
  updatedLabel,
  checkedAt,
  todayISO,
  pools = [],
  slugs,
}) {
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
        name: `${pool.pool_name}, ${placeLabel(pool, { skipIfNamed: true })} — Schedule & Hours`,
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

  // The build day and the one after it are pre-rendered; the live script shows
  // whichever is the reader's today. Without a scrape date (old data) there is
  // no "today" to speak of, and the page is just the timetable.
  const days = todayISO ? [todayISO, addDays(todayISO, 1)] : []
  const weekISO = todayISO ? Array.from({ length: 7 }, (_, i) => addDays(todayISO, i)) : []
  const placeLine = [placeLabel(pool), loc.address, loc.cross_streets && `at ${loc.cross_streets}`]
    .filter(Boolean)
    .join(' · ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(pool.pool_name)}, ${esc(placeLabel(pool, { skipIfNamed: true }))} — Schedule &amp; Hours | NYC Indoor Pool Finder</title>
<meta name="description" content="${esc(metaDescription(pool))}" />
<link rel="canonical" href="${esc(url)}" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="theme-color" content="#0b2a4a" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="NYC Indoor Pool Finder" />
<meta property="og:title" content="${esc(pool.pool_name)}, ${esc(placeLabel(pool, { skipIfNamed: true }))} — Schedule &amp; Hours" />
<meta property="og:description" content="${esc(metaDescription(pool))}" />
<meta property="og:url" content="${esc(url)}" />
<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="stylesheet" href="/fonts/fonts.css" />
<style>${STYLE}</style>
<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
</head>
<body>
<div class="pp">
<header class="pp-hero">
  <div class="pp-wrap">
    <a class="pp-back" href="/">&larr; All NYC indoor pools</a>
    <div class="pp-hero-top">
      <div>
        <h1>${esc(pool.pool_name)}</h1>
        <p class="pp-sub">
          <span>${esc(placeLine)}</span>
          <span class="pp-status ${statusClass}">${esc(statusSentence(pool))}</span>
          ${checkedAt && isNycParks(pool) ? `<span class="pp-badge"><i></i>Schedules checked ${esc(checkedAt)} · NYC Parks</span>` : ''}
          ${NEWS.poolName === pool.pool_name ? `<a class="pp-news" href="${esc(NEWS.postUrl)}">${esc(NEWS.tag)} · Read report</a>` : ''}
        </p>
      </div>
      <a class="pp-btn pp-btn-primary pp-only-lg" href="${esc(directionsUrl(pool))}" rel="nofollow">Get directions</a>
    </div>
    ${days.map((d, i) => statsHtml(pool, d, i === 0, i === 0 ? weekISO : weekISO.slice(1).concat(addDays(todayISO, 7)))).join('')}
    <p id="pp-stale" class="pp-sub" style="margin-top:1rem" hidden>This page was built on ${esc(todayISO ? dayHeading(todayISO) : '')}; see the full schedule below for later days.</p>
  </div>
</header>

<main class="pp-wrap pp-body">
  <div class="pp-col">
    ${days.map((d, i) => upNextCard(pool, d, i === 0, 'pp-only-sm')).join('')}
    ${days.map((d, i) => todayCard(pool, d, i === 0)).join('')}
    <div id="pp-week" class="pp-col">${days.map((d, i) => weekCard(pool, d, i === 0)).join('')}</div>
    ${goodToKnow(pool)}

    <section class="pp-card">
      <h2>Full schedule<small>two weeks, every session</small></h2>
      ${renderWeeks(pool)}
    </section>

    ${buildingHours(pool)}
    ${costSection(pool)}
    ${nearbySection(pool, pools, slugs)}
  </div>

  <aside class="pp-col">
    ${days.map((d, i) => upNextCard(pool, d, i === 0, 'pp-only-lg')).join('')}
    ${gettingThere(pool, address || `${borough}, New York, NY`)}
    ${aboutCard(pool, updatedLabel, checkedAt)}
  </aside>

  <footer class="pp-foot">
    <p>${sourceLine(pool, updatedLabel)}
    ${callAheadHtml(callAheadDetail(pool))}</p>
    <img class="pp-qr" src="/qr-code.svg" alt="QR code for pools.thinkdesign.com" />
    <p><a href="/">NYC Indoor Pool Finder</a> &middot; <a href="/privacy/">Privacy</a></p>
  </footer>
</main>

<nav class="pp-cta pp-only-sm" aria-label="Directions">
  <a class="pp-btn pp-btn-primary" href="${esc(directionsUrl(pool))}" rel="nofollow">Get directions</a>
  ${pool.phone ? `<a class="pp-btn pp-btn-ghost" style="border:1px solid #dce4ec" href="${esc(telHref(pool.phone))}">Call</a>` : ''}
</nav>
</div>
${todayISO ? `<script>${LIVE_SCRIPT}</script>` : ''}
</body>
</html>
`
}
