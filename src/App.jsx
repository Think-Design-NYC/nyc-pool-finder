import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown, List, Map as MapIcon, Phone } from 'lucide-react'
import CallAheadNote from './components/CallAheadNote'
import LogoMark from './components/LogoMark'
import NewsBanner from './components/NewsBanner'
import meta from '../nyc_pools_meta.json'
import thinkDesignLogo from '../think-design-logo-2026.png'
import FilterBar from './components/FilterBar'
import SearchBox from './components/SearchBox'
import ActivityChips from './components/ActivityChips'
import PoolCard from './components/PoolCard'
import SeoContent from './components/SeoContent'
import ClosedPoolList from './components/ClosedPoolList'
import PoolDirectory from './components/PoolDirectory'
import UpdatePrompt from './components/UpdatePrompt'
import PoolMap from './components/PoolMap'
import {
  getBorough,
  BOROUGH_ORDER,
  BOROUGH_FILTERS,
  ACTIVITY_FILTERS,
  filtersToSearch,
  filtersFromSearch,
  boroughsPresent,
  joinBoroughs,
  isOpen,
  poolSlugs,
  poolAnchorId,
  poolHref,
  ACTIVITIES,
  matchesActivity,
  availableDates,
  sessionsForFilter,
  reopeningDate,
  holidaysInRange,
  dayStamp,
  isPastToday,
  dataAgeHours,
  describeAge,
  STALE_AFTER_HOURS,
  dayFilterValue,
  dateForDayFilter,
  liveSummary,
  formatClock,
  checkedLabel,
  nextMatchingSession,
  relativeDay,
  boroughInProse,
  leadSession,
  matchesQuery,
  RESULT_GROUPS,
  longDayLabel,
} from './utils'
import { loadPools } from './pools'
import { milesBetween } from './poolMeta'

// Scraped pools + the Riverbank overlay + location meta (data/pool_meta.json).
// Built from the reader's clock, not the build's, so a cached bundle still
// closes Riverbank on the day its posted season ends.
const pools = loadPools(new Date())

// Filter state lives in three places, in this precedence order:
//
//   1. the query string  — so a view can be linked, shared and bookmarked;
//   2. localStorage      — so a bare visit resumes where you left off;
//   3. the defaults      — Manhattan / Lap Swim / Today.
//
// A URL parameter always wins, because someone who followed a link asked for
// that view specifically. Missing or unrecognised parameters fall through to
// the stored value rather than resetting the whole page, so a hand-trimmed URL
// still works. The `day` parameter is the resolved ISO date, not a token — see
// `filtersToSearch` in utils.js.
const FILTERS = {
  borough: { key: 'poolfinder.borough', allowed: BOROUGH_FILTERS, fallback: 'Manhattan' },
  activity: { key: 'poolfinder.activity', allowed: ACTIVITY_FILTERS, fallback: 'Lap Swim' },
  day: {
    key: 'poolfinder.day',
    fallback: 'Today',
    // Persisted as the resolved ISO date, not the token — see filtersToSearch.
    // A stale stored date parses to null and self-cleans to Today; a day pick
    // is not a durable preference the way borough/activity are. dayFilterValue
    // also still reads the legacy 'Today'/'Tomorrow' tokens, and retires any
    // unrecognised value (including old week keys) to the fallback.
    parse: dayFilterValue,
    serialize: dateForDayFilter,
  },
}

// localStorage can throw (private mode, storage disabled); every access here
// degrades to the defaults rather than taking the page down with it.
function storedFilters() {
  const out = {}
  for (const [name, cfg] of Object.entries(FILTERS)) {
    out[name] = cfg.fallback
    try {
      const raw = localStorage.getItem(cfg.key)
      const value = cfg.parse ? cfg.parse(raw) : cfg.allowed.includes(raw) ? raw : null
      if (value) out[name] = value
    } catch {
      // keep the fallback
    }
  }
  return out
}

function persistFilters(filters) {
  try {
    for (const [name, cfg] of Object.entries(FILTERS)) {
      localStorage.setItem(cfg.key, cfg.serialize ? cfg.serialize(filters[name]) : filters[name])
    }
  } catch {
    // ignore — the URL still carries the state
  }
}

// Boroughs that have at least one pool — the borough bar's fixed set.
const POOL_BOROUGHS = BOROUGH_ORDER.filter((b) => pools.some((p) => getBorough(p) === b))

// "for the rest of today", "tomorrow", "on Thursday" — the selected day as it
// reads after "No lap swim in the Bronx …".
function dayPhrase(dayKey) {
  if (dayKey === 'Today') return 'for the rest of today'
  const rel = relativeDay(dateForDayFilter(dayKey))
  return rel === 'tomorrow' ? rel : `on ${rel}`
}

function readFilters() {
  return { ...storedFilters(), ...filtersFromSearch(window.location.search) }
}

export default function App() {
  const [filters, setFilters] = useState(readFilters)
  // Which pool cards are expanded, by anchor id. Cards start collapsed; a
  // #pool-m260 link (on load or later) opens its card.
  const [openCards, setOpenCards] = useState(() => {
    const id = window.location.hash.slice(1)
    return new Set(id ? [id] : [])
  })
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.slice(1)
      if (id) setOpenCards((prev) => new Set(prev).add(id))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // Map <-> list: a hovered or focused card highlights its pin; a clicked pin
  // selects its card — opened, outlined and scrolled into view (closing the
  // full-screen map first on small screens).
  const [hoverId, setHoverId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [mapOpen, setMapOpen] = useState(false)
  const selectPool = useCallback((id) => {
    setSelectedId(id)
    setMapOpen(false)
    setOpenCards((prev) => new Set(prev).add(id))
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }, [])
  const toggleCard = useCallback((id) => {
    setOpenCards((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])
  const { borough: selectedBorough, activity: selectedActivity, day: selectedDay } = filters
  // The header search. Not persisted: it's a quick lookup, not a view to
  // bookmark. While it has text it searches every borough.
  const [query, setQuery] = useState('')
  const searching = query.trim().length > 0

  // "Near me": the reader's position, only after they ask, only in memory —
  // never persisted or sent anywhere. Sorts each group by distance and puts a
  // "You" dot on the map. Someone far outside the city gets no distances
  // (sorting by "312 mi" helps no one).
  const [near, setNear] = useState({ status: 'off', at: null })
  const toggleNear = useCallback(() => {
    if (near.status === 'on' || near.status === 'locating') {
      setNear({ status: 'off', at: null })
      return
    }
    if (!navigator.geolocation) {
      setNear({ status: 'denied', at: null })
      return
    }
    setNear({ status: 'locating', at: null })
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const at = { lat: coords.latitude, lng: coords.longitude }
        const fromMidtown = milesBetween({ place: at }, { place: { lat: 40.754, lng: -73.984 } })
        setNear(fromMidtown > 30 ? { status: 'far', at: null } : { status: 'on', at })
      },
      () => setNear({ status: 'denied', at: null }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    )
  }, [near.status])

  // A filter the reader chose: push a history entry so Back returns to the
  // previous view, and write all three parameters so the URL is shareable
  // whole. The mount-time normalisation below uses replace instead.
  const commitFilters = useCallback((next, { push = true } = {}) => {
    setFilters(next)
    persistFilters(next)
    const url = `${window.location.pathname}${filtersToSearch(next)}`
    if (push) window.history.pushState(next, '', url)
    else window.history.replaceState(next, '', url)
  }, [])

  const setFilter = useCallback(
    (name, value) => commitFilters({ ...filters, [name]: value }),
    [commitFilters, filters],
  )

  const setSelectedBorough = useCallback((v) => setFilter('borough', v), [setFilter])
  const setSelectedActivity = useCallback((v) => setFilter('activity', v), [setFilter])
  const setSelectedDay = useCallback((v) => setFilter('day', v), [setFilter])

  // Normalise the first history entry so it carries explicit parameters.
  //
  // Without this, Back out of a filter change lands on the bare URL, which
  // re-reads localStorage — and that change just wrote to it — so the reader
  // gets the view they were trying to leave. Replace, never push: this is the
  // app describing the state it's already in, not a navigation. Mount only.
  useEffect(() => {
    const initial = readFilters()
    window.history.replaceState(
      initial,
      '',
      `${window.location.pathname}${filtersToSearch(initial)}`,
    )
  }, [])

  // Back/forward: re-read the URL rather than trusting the state we pushed, so
  // a hand-edited or externally-shared URL is handled the same way.
  useEffect(() => {
    const onPopState = () => setFilters(readFilters())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const dates = useMemo(() => availableDates(pools), [])

  const activityActive = selectedActivity && selectedActivity !== 'All activities'
  const hidePast = selectedDay === 'Today'

  const boroughs = useMemo(() => {
    const present = new Set()
    for (const p of pools) {
      const hasMatch = sessionsForFilter(p, selectedDay).some(
        (s) =>
          (!activityActive || matchesActivity(s.session_type, selectedActivity)) &&
          (!hidePast || !isPastToday(s.time)),
      )
      if (!hasMatch) continue
      present.add(getBorough(p))
    }
    return BOROUGH_ORDER.filter((b) => present.has(b))
  }, [activityActive, hidePast, selectedActivity, selectedDay])

  // Every borough that has a pool at all stays on the bar. One with nothing
  // matching the other filters is greyed but still pickable, and says why —
  // a hidden pill read as a missing borough (the Bronx vanished on Wednesdays,
  // when St. Mary's runs no open swim, while the header still named it).
  // Picking one lands on an explained empty state, not a silent reset.
  const boroughOptions = useMemo(() => {
    const noun = activityActive ? selectedActivity.toLowerCase() : 'sessions'
    const when = dayPhrase(selectedDay)
    return [
      'All Boroughs',
      ...POOL_BOROUGHS.map((b) => {
        if (boroughs.includes(b)) return b
        const why = `No ${noun} in ${boroughInProse(b)} ${when}`
        return { value: b, label: b, muted: true, title: why, ariaLabel: `${b} — ${why.charAt(0).toLowerCase()}${why.slice(1)}`, mutedLabel: `${b} (none)` }
      }),
    ]
  }, [boroughs, activityActive, selectedActivity, selectedDay])

  const activities = useMemo(() => {
    const present = new Set()
    for (const p of pools) {
      for (const s of p.schedules ?? []) {
        for (const a of ACTIVITIES) {
          if (a.match(s.session_type)) present.add(a.key)
        }
      }
    }
    return ACTIVITIES.map((a) => a.key).filter((k) => present.has(k))
  }, [])

  // Named holiday closures inside the selected range. Cards carry their own,
  // but they're also needed page-level: on a day every centre is shut, no card
  // renders at all and the empty state would otherwise blame the filters.
  const rangeHolidays = useMemo(
    () => holidaysInRange(pools, selectedDay),
    [selectedDay],
  )

  const openNames = useMemo(() => pools.filter(isOpen).map((p) => p.pool_name), [])

  // Derived, never hardcoded: this line claimed the Bronx long after St. Mary's
  // closed. Mirrored in the SEO fallback through the same helper.
  const openBoroughList = useMemo(() => joinBoroughs(boroughsPresent(pools, isOpen)), [])

  // Every pool has its own static page at /pool/<slug>/ (emitted by
  // vite-plugin-seo.js). Linking to them from here is what makes them
  // crawlable — a page reachable only from sitemap.xml is an orphan.
  const slugs = useMemo(() => poolSlugs(pools), [])

  const lastUpdated = useMemo(() => {
    if (!meta.updated_at) return null
    return new Date(meta.updated_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }, [])

  // The reader's clock, ticking once a minute so "right now" stays true while
  // the page sits open.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const checked = useMemo(() => checkedLabel(meta.updated_at, now), [now])

  const headline = useMemo(() => {
    const { onNow, next, tomorrow } = liveSummary(
      pools,
      { activity: selectedActivity, borough: selectedBorough },
      now,
    )
    const noun = activityActive
      ? selectedActivity.charAt(0) + selectedActivity.slice(1).toLowerCase()
      : 'Swimming'
    const where = selectedBorough === 'All Boroughs' ? '' : `${selectedBorough} `
    const at = (n) => `${formatClock(n.start)} at ${n.pool.pool_name}`
    if (onNow > 0) {
      return {
        title: `${noun} is on at ${onNow} ${where}pool${onNow === 1 ? '' : 's'} right now.`,
        next: next ? `Next one starts at ${at(next)}.` : null,
      }
    }
    if (next) {
      return {
        title: `No ${noun.toLowerCase()} on right now${where ? ` in ${boroughInProse(selectedBorough)}` : ''}.`,
        next: `Next one starts at ${at(next)}.`,
      }
    }
    return {
      title: `${noun} is done for today${where ? ` in ${boroughInProse(selectedBorough)}` : ''}.`,
      next: tomorrow ? `Next one starts tomorrow at ${at(tomorrow)}.` : null,
    }
  }, [now, selectedActivity, selectedBorough, activityActive])

  // Says what was asked for and when it next happens, instead of "No pools
  // match your filters" — the reader may have picked a greyed borough on
  // purpose to find out.
  const emptyState = useMemo(() => {
    const noun = activityActive ? selectedActivity.toLowerCase() : 'sessions'
    const found = searching ? pools.filter((p) => matchesQuery(p, query)) : pools
    if (searching && !found.length) {
      return { title: `No pools match “${query.trim()}”.`, next: 'Try a pool name, neighborhood or ZIP code.' }
    }
    const where = searching
      ? found.length === 1
        ? ` at ${found[0].pool_name}`
        : ` at pools matching “${query.trim()}”`
      : selectedBorough === 'All Boroughs'
        ? ''
        : ` in ${boroughInProse(selectedBorough)}`
    const next = nextMatchingSession(
      found,
      {
        activity: selectedActivity,
        borough: searching ? 'All Boroughs' : selectedBorough,
        day: selectedDay,
      },
      now,
    )
    const day = next && relativeDay(next.date, now)
    return {
      title: `No ${noun}${where} ${dayPhrase(selectedDay)}.`,
      next: next
        ? `Next: ${day.charAt(0).toUpperCase() + day.slice(1)}, ${formatClock(next.start)} at ${next.pool.pool_name}.`
        : null,
    }
  }, [now, activityActive, selectedActivity, selectedBorough, selectedDay, query, searching])

  // Null unless the data has actually gone stale, so the banner is absent in the
  // normal case rather than rendered-and-hidden. Deliberately has no counterpart
  // in the build-time SEO fallback — see the note in vite-plugin-seo.js.
  const staleFor = useMemo(() => {
    const hours = dataAgeHours(meta.updated_at)
    return hours != null && hours >= STALE_AFTER_HOURS ? describeAge(hours) : null
  }, [])

  // Closed pools that have a real timetable inside the selected range, keyed by
  // name to the date they come back. These are promoted into the grid, so they
  // must also leave the closed list — otherwise the same pool appears twice
  // saying two different things.
  const reopening = useMemo(() => {
    const out = new Map()
    for (const p of pools) {
      const date = reopeningDate(p, selectedDay)
      if (date) out.set(p.pool_name, date)
    }
    return out
  }, [selectedDay])

  // Every closed pool, always — they're listed at the bottom rather than in the
  // grid. Filtering by activity or day used to hide them completely (a closed
  // pool has no schedules to match), so the pools people most need to know
  // about were the ones that disappeared.
  const closedPools = useMemo(
    () =>
      pools.filter(
        (p) => p.status === 'closed' && !reopening.has(p.pool_name) && matchesQuery(p, query),
      ),
    [reopening, query],
  )

  const visiblePools = useMemo(() => {
    return pools
      // A closed pool joins the grid only for a range it actually reopens in;
      // the rest of the time it stays in the closed list below.
      .filter((p) => p.status !== 'closed' || reopening.has(p.pool_name))
      .filter((p) =>
        searching
          ? matchesQuery(p, query)
          : selectedBorough === 'All Boroughs' || getBorough(p) === selectedBorough,
      )
      .map((p) => {
        // Always resolve through the dated weeks: "Today" now means this
        // calendar date, so a holiday closure genuinely empties the day
        // instead of showing that weekday's usual sessions.
        const matching = sessionsForFilter(p, selectedDay).filter(
          (s) => !activityActive || matchesActivity(s.session_type, selectedActivity),
        )
        const lead = leadSession(matching, { today: hidePast, now })
        if (!lead) return null
        // A pool whose sessions have all ended today stays on the page under
        // "Done for today" with what it ran; otherwise past sessions drop off.
        const upcoming = matching.filter((s) => !hidePast || !isPastToday(s.time))
        return {
          ...p,
          schedules: lead.group === 'done' ? matching : upcoming,
          lead,
          miles: near.at ? milesBetween({ place: near.at }, p) : null,
          reopens_on: reopening.get(p.pool_name) ?? null,
        }
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          RESULT_GROUPS.indexOf(a.lead.group) - RESULT_GROUPS.indexOf(b.lead.group) ||
          // Near me: nearest first within each group.
          (a.miles ?? 0) - (b.miles ?? 0) ||
          a.lead.lead.window.start - b.lead.lead.window.start ||
          a.lead.lead.window.end - b.lead.lead.window.end ||
          a.pool_name.localeCompare(b.pool_name),
      )
  }, [
    selectedBorough,
    selectedActivity,
    activityActive,
    selectedDay,
    hidePast,
    reopening,
    now,
    query,
    searching,
    near.at,
  ])

  // The grid's sections, in RESULT_GROUPS order, skipping empty ones.
  const groupedPools = useMemo(() => {
    const byGroup = new Map()
    for (const p of visiblePools) {
      const g = p.lead.group
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g).push(p)
    }
    const dayTitle = longDayLabel(dateForDayFilter(selectedDay))
    const titles = {
      on: 'On now',
      soon: 'Starting soon',
      later: 'Later today',
      done: 'Done for today',
      day: selectedDay === 'Tomorrow' ? `Tomorrow, ${dayTitle.split(', ')[1]}` : dayTitle,
    }
    return RESULT_GROUPS.filter((g) => byGroup.has(g)).map((g) => ({
      key: g,
      title: titles[g],
      pools: byGroup.get(g),
    }))
  }, [visiblePools, selectedDay])

  // On a day other than today the live "right now" line would talk past the
  // list, so the headline describes the chosen day instead.
  const shownHeadline = useMemo(() => {
    if (selectedDay === 'Today') return headline
    const noun = activityActive
      ? selectedActivity.charAt(0) + selectedActivity.slice(1).toLowerCase()
      : 'Swimming'
    const day = dayPhrase(selectedDay)
    const n = visiblePools.length
    if (!n) return { title: `No ${noun.toLowerCase()} ${day}.`, next: null }
    // The earliest session, not the first card — Near me sorts by distance.
    const first = visiblePools.reduce((a, b) =>
      b.lead.lead.window.start < a.lead.lead.window.start ? b : a,
    )
    return {
      title: `${noun} at ${n} pool${n === 1 ? '' : 's'} ${day}.`,
      next: `First session starts at ${formatClock(first.lead.lead.window.start)} at ${first.pool_name}.`,
    }
  }, [selectedDay, headline, activityActive, selectedActivity, visiblePools])

  // The complement of what's already on screen. Computed from the rendered
  // lists rather than by re-deriving the filters, so it can't fall out of step
  // with them: whatever the grid and the closed list don't show, this does.
  const otherPools = useMemo(() => {
    const shown = new Set([
      ...visiblePools.map((p) => p.pool_name),
      ...closedPools.map((p) => p.pool_name),
    ])
    return pools.filter((p) => !shown.has(p.pool_name))
  }, [visiblePools, closedPools])

  // One control for the grid: "Expand all" until every visible card is open.
  const visibleIds = visiblePools.map(poolAnchorId)
  const allCardsOpen = visibleIds.length > 0 && visibleIds.every((id) => openCards.has(id))
  const toggleAllCards = () =>
    setOpenCards((prev) => {
      const next = new Set(prev)
      for (const id of visibleIds) {
        if (allCardsOpen) next.delete(id)
        else next.add(id)
      }
      return next
    })

  return (
    <div className="min-h-screen bg-deck px-4 pb-12">
      <header className="-mx-4 bg-deep-end px-4 text-white">
        <div className="mx-auto max-w-6xl pb-5 pt-5">
          <div className="flex items-center gap-4">
            {/* The Figma lockup, as live text: "NYC Indoor" over "Pool Finder".
                textContent reads "NYC Indoor Pool Finder" — the site name, which
                must keep "Indoor" (CLAUDE.md). The dot is CSS so it isn't part
                of the name. */}
            <h1 className="flex shrink-0 items-center gap-2.5">
              <LogoMark className="size-10 shrink-0" />
              <span className="flex flex-col">
                <span className="text-[0.68rem] font-semibold uppercase leading-none tracking-[0.16em] text-white/70">
                  <span className="after:ml-1 after:content-['·']">NYC</span> Indoor
                </span>{' '}
                <span className="font-display text-2xl font-bold leading-tight tracking-tight">
                  Pool Finder
                </span>
              </span>
            </h1>
            <div className="hidden max-w-md flex-1 md:block">
              <SearchBox value={query} onChange={setQuery} near={near} onNear={toggleNear} />
            </div>
            <a
              href="https://thinkdesign.com"
              target="_blank"
              rel="noreferrer"
              className="ml-auto shrink-0 opacity-80 transition-opacity hover:opacity-100"
              aria-label="Think Design"
            >
              {/* The logo is purple artwork; knocked out to white on the navy band. */}
              <img
                src={thinkDesignLogo}
                alt="Think Design"
                className="h-8 w-auto brightness-0 invert"
              />
            </a>
          </div>

          {checked && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/85">
              <span className="size-1.5 rounded-full bg-open" aria-hidden="true" />
              Schedules checked {checked} · NYC Parks
            </p>
          )}
          <div className="lg:flex lg:items-end lg:justify-between lg:gap-6">
            <div className="min-w-0">
              {/* Time-relative, so React-only: the fallback can't know "now". */}
              <h2 className="mt-3 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {shownHeadline.title}
              </h2>
              {shownHeadline.next && (
                <p className="mt-1 text-sm text-white/75">{shownHeadline.next}</p>
              )}
            </div>
            <div className="mt-4 md:hidden">
              <SearchBox value={query} onChange={setQuery} near={near} onNear={toggleNear} />
            </div>
            {activities.length > 0 && (
              <ActivityChips
                activities={['All activities', ...activities]}
                selected={selectedActivity}
                onSelect={setSelectedActivity}
              />
            )}
          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="text-sm font-medium text-white/90">
              {openNames.length} of {pools.length} NYC indoor pools open today across{' '}
              {openBoroughList}
            </p>
            <p className="mt-0.5 text-sm text-white/70">
              Public pools open now — lap swim &amp; open swim schedules
            </p>
            {/* Mirrored in the SEO fallback via CALL_AHEAD_NOTE. */}
            <p className="mt-2 flex items-start gap-1.5 text-sm text-white/90">
              <Phone className="mt-0.5 shrink-0 text-lane-red" size={14} aria-hidden="true" />
              <CallAheadNote />
            </p>
          </div>
        </div>
      </header>

      {/* Mirrored in the SEO fallback via newsHtml(). */}
      <NewsBanner />
      <div className="h-4" aria-hidden="true" />

      {staleFor && (
        <div
          role="status"
          className="mx-auto mb-4 max-w-6xl rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20"
        >
          <strong className="font-semibold">These schedules may be out of date.</strong>{' '}
          The last update was {lastUpdated} ({staleFor}). NYC Parks may have changed times
          since —{' '}
          <a
            href="https://www.nycgovparks.org/facilities/indoor-pools"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2"
          >
            check the official listing
          </a>{' '}
          before heading out.
        </div>
      )}

      {/* Desktop: list column + the map, sticky beside it. Below lg the map
          is a full-screen view behind the floating Map button. */}
      <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          <FilterBar
            boroughOptions={boroughOptions}
            selectedBorough={selectedBorough}
            onSelectBorough={setSelectedBorough}
            searching={searching}
            dates={dates}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />

          <main className="mt-5">
            {visiblePools.length === 0 ? (
              <div className="rounded-2xl bg-white p-10 text-center text-muted ring-1 ring-line">
                {rangeHolidays.length > 0 ? (
                  <>
                    <p className="font-medium text-deep-end">
                      {rangeHolidays.map((h) => h.holiday.split(':')[0]).join(', ')} —
                      recreation centers are closed.
                    </p>
                    <p className="mt-1 text-sm">
                      No pools have sessions on{' '}
                      {rangeHolidays.map((h) => dayStamp({ date: h.date })).join(', ')}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-deep-end">{emptyState.title}</p>
                    {emptyState.next && <p className="mt-1 text-sm">{emptyState.next}</p>}
                  </>
                )}
              </div>
            ) : (
              <>
                {visiblePools.length > 1 && (
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={toggleAllCards}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-tile-blue hover:bg-shallow/40"
                    >
                      {allCardsOpen ? (
                        <ChevronsDownUp size={14} aria-hidden="true" />
                      ) : (
                        <ChevronsUpDown size={14} aria-hidden="true" />
                      )}
                      {allCardsOpen ? 'Collapse all' : 'Expand all'}
                    </button>
                  </div>
                )}
                {groupedPools.map((group) => (
                  <section key={group.key} className="mb-5" aria-labelledby={`group-${group.key}`}>
                    <h2
                      id={`group-${group.key}`}
                      className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                    >
                      {group.title} ({group.pools.length})
                    </h2>
                    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 lg:grid-cols-1">
                      {group.pools.map((pool) => {
                        const id = poolAnchorId(pool)
                        return (
                          <div
                            key={pool.pool_name}
                            onMouseEnter={() => setHoverId(id)}
                            onMouseLeave={() => setHoverId(null)}
                            onFocusCapture={() => setHoverId(id)}
                            onBlurCapture={() => setHoverId(null)}
                            className={`rounded-2xl transition-shadow ${
                              selectedId === id ? 'ring-2 ring-tile-blue ring-offset-2 ring-offset-deck' : ''
                            }`}
                          >
                            <PoolCard
                              pool={pool}
                              href={poolHref(pool, slugs)}
                              activityLabel={activityActive ? selectedActivity : 'Swim'}
                              showSessionType={!activityActive}
                              open={openCards.has(id)}
                              onToggle={() => toggleCard(id)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </>
            )}
          </main>
        </div>

        <aside className="hidden lg:block" aria-label="Map">
          <div className="sticky top-4 mt-3 h-[calc(100vh-2rem)] max-h-[56rem] overflow-hidden rounded-2xl ring-1 ring-line">
            <PoolMap
              pools={visiblePools}
              highlightId={hoverId ?? selectedId}
              onSelectPool={selectPool}
              you={near.at}
              className="h-full"
            />
          </div>
        </aside>
      </div>

      {/* Below lg: the mockup's floating Map button, and the map full screen. */}
      {visiblePools.length > 0 && !mapOpen && (
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="fixed bottom-5 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-deep-end px-6 py-3 text-sm font-semibold text-white shadow-lg lg:hidden"
        >
          <MapIcon size={16} aria-hidden="true" />
          Map
        </button>
      )}
      {mapOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-label="Map of pools">
          <PoolMap
            pools={visiblePools}
            highlightId={selectedId}
            onSelectPool={selectPool}
            you={near.at}
            className="h-full"
          />
          <button
            type="button"
            onClick={() => setMapOpen(false)}
            className="absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-deep-end px-6 py-3 text-sm font-semibold text-white shadow-lg"
          >
            <List size={16} aria-hidden="true" />
            List
          </button>
        </div>
      )}

      <ClosedPoolList pools={closedPools} slugs={slugs} />

      <PoolDirectory pools={otherPools} slugs={slugs} />

      <SeoContent pools={pools} openNames={openNames} />

      {/* Mirrored in the SEO fallback (vite-plugin-seo.js) — if this changes,
          change it there too or crawlers see different markup than visitors. */}
      <footer className="mx-auto mt-10 max-w-6xl border-t border-line pt-4 text-xs text-muted/80">
        <img
          src="/qr-code.svg"
          alt="QR code for pools.thinkdesign.com"
          className="mb-3 w-[min(190px,50vw)] rounded-lg border border-line"
        />
        <a href="/privacy/" className="underline hover:text-tile-blue">
          Privacy
        </a>
        <span className="mx-2" aria-hidden="true">
          ·
        </span>
        <a
          href="https://thinkdesign.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-tile-blue"
        >
          Think Design
        </a>
      </footer>

      <UpdatePrompt />
    </div>
  )
}
