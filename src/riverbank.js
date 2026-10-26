// Hand-maintained NYS Parks overlay. Never written by scraper.py; never
// merged into nyc_pools_live.json (the mobile app reads that file raw).
//
// Templates in data/riverbank.json expand into dated schedule_weeks for this
// week and next, the same window the scraper gives NYC Parks pools. The next
// PDF is a data edit, not a scrape: nothing in here names a season.
//
// Everything is derived from `from`, never captured at import time. App.jsx
// passes the reader's clock, so a cached PWA bundle still drops Riverbank to
// closed on the day the season ends; the SEO plugin passes the scrape time,
// so the static output agrees with the pool pages' "today".

import source from '../data/riverbank.json'
import { parseISODate, toISODate } from './utils.js'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Building hours shown on a holiday. The PDF prints no holiday grid, so the
// day stays empty (spec: empty + call ahead) rather than inventing sessions.
// Deliberately not `holiday`: the homepage reads that as "recreation centers
// are closed", which is not what an unprinted holiday means here.
const HOLIDAY_HOURS = `Holiday — pool hours not posted; call aquatics at ${source.phone}`

export function nyTodayISO(from = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(from)
}

function inSeason(iso, season = source.season) {
  return iso >= season.start && iso <= season.end
}

function isHoliday(iso, season = source.season) {
  return (season.holidays ?? []).some((h) => h.date === iso)
}

function mondayOf(d) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const offset = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - offset)
  return day
}

function sessionsForWeekday(weekday, date) {
  const out = []
  for (const t of source.templates) {
    if (!t.days.includes(weekday)) continue
    out.push({
      session_type: t.session_type,
      days: weekday,
      time: t.time,
      date,
      notes: t.notes,
    })
  }
  return out
}

function buildDay(d, season) {
  const iso = toISODate(d)
  const weekday = WEEKDAYS[d.getDay()]
  const live = inSeason(iso, season) && !isHoliday(iso, season)
  let building_hours = null
  if (live) building_hours = source.location.building_hours.Daily
  else if (inSeason(iso, season)) building_hours = HOLIDAY_HOURS
  return {
    date: iso,
    weekday,
    building_hours,
    holiday: null,
    note: null,
    sessions: live ? sessionsForWeekday(weekday, iso) : [],
  }
}

// This week and next, Monday-based — the scraper's window for NYC Parks pools.
function buildWeeks(todayISO, season) {
  const today = parseISODate(todayISO)
  if (!today) return []
  const weeks = []
  const monday = mondayOf(today)
  for (let w = 0; w < 2; w++) {
    const days = []
    for (let i = 0; i < 7; i++) {
      days.push(
        buildDay(
          new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + w * 7 + i),
          season,
        ),
      )
    }
    weeks.push({ start: days[0].date, end: days[6].date, days })
  }
  return weeks
}

// "October 1" — the form statusLabel() abbreviates to "until Oct 1".
function longDate(iso) {
  const d = parseISODate(iso)
  return d ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null
}

export function buildRiverbankPool(from = new Date()) {
  const today = nyTodayISO(from)
  const { season } = source
  const schedule_weeks = buildWeeks(today, season)
  const open = inSeason(today, season)
  const beforeSeason = today < season.start
  return {
    borough: source.borough,
    pool_name: source.pool_name,
    pool_code: source.pool_code,
    operator: source.operator,
    status: open ? 'open' : 'closed',
    location: { ...source.location },
    phone: source.phone,
    park_phone: source.park_phone,
    url: source.url,
    schedule_pdf: source.schedule_pdf,
    membership_required: source.membership_required,
    price_range: source.price_range,
    price_summary: source.price_summary,
    card_place: source.card_place,
    card_tag: source.card_tag,
    notes: source.notes,
    reduced_hours: false,
    notice_links: [],
    closure_reason: open || beforeSeason ? null : `since the ${season.label} schedule ended`,
    reopens: beforeSeason ? longDate(season.start) : null,
    closures: [],
    geometry: source.geometry,
    admission: source.admission,
    lap_pass: source.lap_pass,
    season,
    // Cleared on closure, like the scraper does: the season's last week still
    // has dated sessions on the Sunday after it ends.
    schedules: open
      ? schedule_weeks
          .find((w) => today >= w.start && today <= w.end)
          ?.days.flatMap((day) => day.sessions) ?? []
      : [],
    schedule_weeks,
  }
}

export function withRiverbank(pools, from = new Date()) {
  const riverbank = buildRiverbankPool(from)
  if (pools.some((p) => p.pool_code === riverbank.pool_code)) return pools
  return [...pools, riverbank]
}
