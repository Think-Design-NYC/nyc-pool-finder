import { useEffect, useMemo, useState } from 'react'
import { Waves } from 'lucide-react'
import pools from '../nyc_pools_live.json'
import meta from '../nyc_pools_meta.json'
import thinkDesignLogo from '../think-design-logo-2026.png'
import FilterBar from './components/FilterBar'
import PoolCard from './components/PoolCard'
import SeoContent from './components/SeoContent'
import ClosedPoolList from './components/ClosedPoolList'
import UpdatePrompt from './components/UpdatePrompt'
import {
  getBorough,
  ACTIVITIES,
  matchesActivity,
  DAY_FILTERS,
  dayFilterOptions,
  scheduleWeeks,
  sessionsForFilter,
  reopeningDate,
  holidaysForFilter,
  holidaysInRange,
  dayStamp,
  isPastToday,
  dataAgeHours,
  describeAge,
  STALE_AFTER_HOURS,
} from './utils'

const BOROUGH_ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Other']

// localStorage can throw (private mode, storage disabled); on failure this
// degrades to plain useState.
function usePersistedFilter(key, defaultValue, validValues, migrations = {}) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      const migrated = migrations[stored] ?? stored
      if (validValues.includes(migrated)) return migrated
    } catch {
      // fall through to default
    }
    return defaultValue
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // ignore
    }
  }, [key, value])
  return [value, setValue]
}

export default function App() {
  const [selectedBorough, setSelectedBorough] = usePersistedFilter(
    'poolfinder.borough',
    'Manhattan',
    ['All Boroughs', ...BOROUGH_ORDER],
  )
  const [selectedActivity, setSelectedActivity] = usePersistedFilter(
    'poolfinder.activity',
    'Lap Swim',
    ['All activities', ...ACTIVITIES.map((a) => a.key)],
  )
  const [selectedDay, setSelectedDay] = usePersistedFilter(
    'poolfinder.day',
    'Today',
    DAY_FILTERS,
    // Anyone who had the old undated "Week" pill selected lands on this week.
    { Week: 'ThisWeek' },
  )

  // The two weeks the scrape covers. Both the button labels and the date
  // filtering come from these, so the UI can't claim a week the data lacks.
  const weeks = useMemo(() => scheduleWeeks(pools), [])
  const dayOptions = useMemo(() => dayFilterOptions(weeks), [weeks])

  const activityActive = selectedActivity && selectedActivity !== 'All activities'
  const hidePast = selectedDay === 'Today'

  const boroughs = useMemo(() => {
    const present = new Set()
    for (const p of pools) {
      const hasMatch = sessionsForFilter(p, selectedDay, weeks).some(
        (s) =>
          (!activityActive || matchesActivity(s.session_type, selectedActivity)) &&
          (!hidePast || !isPastToday(s.time)),
      )
      if (!hasMatch) continue
      present.add(getBorough(p))
    }
    return BOROUGH_ORDER.filter((b) => present.has(b))
  }, [activityActive, hidePast, selectedActivity, selectedDay, weeks])

  useEffect(() => {
    if (selectedBorough !== 'All Boroughs' && !boroughs.includes(selectedBorough)) {
      setSelectedBorough('All Boroughs')
    }
  }, [boroughs, selectedBorough])

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
    () => holidaysInRange(pools, selectedDay, weeks),
    [selectedDay, weeks],
  )

  const openNames = useMemo(
    () => pools.filter((p) => p.status === 'open').map((p) => p.pool_name),
    [],
  )

  const lastUpdated = useMemo(() => {
    if (!meta.updated_at) return null
    return new Date(meta.updated_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }, [])

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
      const date = reopeningDate(p, selectedDay, weeks)
      if (date) out.set(p.pool_name, date)
    }
    return out
  }, [selectedDay, weeks])

  // Every closed pool, always — they're listed at the bottom rather than in the
  // grid. Filtering by activity or day used to hide them completely (a closed
  // pool has no schedules to match), so the pools people most need to know
  // about were the ones that disappeared.
  const closedPools = useMemo(
    () => pools.filter((p) => p.status === 'closed' && !reopening.has(p.pool_name)),
    [reopening],
  )

  const visiblePools = useMemo(() => {
    return pools
      // A closed pool joins the grid only for a range it actually reopens in;
      // the rest of the time it stays in the closed list below.
      .filter((p) => p.status !== 'closed' || reopening.has(p.pool_name))
      .filter((p) => selectedBorough === 'All Boroughs' || getBorough(p) === selectedBorough)
      .map((p) => {
        // Always resolve through the dated weeks: "Today" now means this
        // calendar date, so a holiday closure genuinely empties the day
        // instead of showing that weekday's usual sessions.
        const filtered = sessionsForFilter(p, selectedDay, weeks).filter(
          (s) =>
            (!activityActive || matchesActivity(s.session_type, selectedActivity)) &&
            (!hidePast || !isPastToday(s.time)),
        )
        return { ...p, schedules: filtered, reopens_on: reopening.get(p.pool_name) ?? null }
      })
      .filter((p) => (p.schedules?.length ?? 0) > 0)
      .sort((a, b) => {
        // Open first, then transitioning. Closed pools aren't in this list.
        const rank = { open: 0, transitioning: 1 }
        return (rank[a.status] ?? 2) - (rank[b.status] ?? 2)
      })
  }, [selectedBorough, selectedActivity, activityActive, selectedDay, hidePast, weeks, reopening])

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-12">
      <header className="mx-auto flex max-w-6xl items-start justify-between gap-4 pb-4 pt-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
            <Waves className="text-sky-600" size={26} />
            NYC Indoor Pool Finder
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Public pools open now — lap swim &amp; open swim schedules
            {lastUpdated && (
              <span className="text-slate-400"> · Last updated: {lastUpdated}</span>
            )}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {openNames.length} of {pools.length} NYC indoor pools open today across
            Manhattan, Brooklyn, Queens &amp; the Bronx
          </p>
        </div>
        <a
          href="https://thinkdesign.com"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 opacity-80 transition-opacity hover:opacity-100"
          aria-label="Think Design"
        >
          <img
            src={thinkDesignLogo}
            alt="Think Design"
            className="h-10 w-auto"
          />
        </a>
      </header>

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

      <FilterBar
        boroughs={boroughs}
        selectedBorough={selectedBorough}
        onSelectBorough={setSelectedBorough}
        activities={activities}
        selectedActivity={selectedActivity}
        onSelectActivity={setSelectedActivity}
        dayOptions={dayOptions}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <main className="mx-auto mt-5 max-w-6xl">
        {visiblePools.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
            {rangeHolidays.length > 0 ? (
              <>
                <p className="font-medium text-slate-700">
                  {rangeHolidays.map((h) => h.holiday.split(':')[0]).join(', ')} —
                  recreation centers are closed.
                </p>
                <p className="mt-1 text-sm">
                  No pools have sessions on{' '}
                  {rangeHolidays.map((h) => dayStamp({ date: h.date })).join(', ')}.
                </p>
              </>
            ) : (
              'No pools match your filters.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visiblePools.map((pool) => (
              <PoolCard
                key={pool.pool_name}
                pool={pool}
                activityLabel={activityActive ? selectedActivity : 'Swim'}
                holidays={holidaysForFilter(pool, selectedDay, weeks)}
              />
            ))}
          </div>
        )}
      </main>

      <ClosedPoolList pools={closedPools} />

      <SeoContent pools={pools} openNames={openNames} />

      {/* Mirrored in the SEO fallback (vite-plugin-seo.js) — if this changes,
          change it there too or crawlers see different markup than visitors. */}
      <footer className="mx-auto mt-10 max-w-6xl border-t border-slate-200 pt-4 text-xs text-slate-400">
        <a href="/privacy/" className="underline hover:text-sky-700">
          Privacy
        </a>
        <span className="mx-2" aria-hidden="true">
          ·
        </span>
        <a
          href="https://thinkdesign.com"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-sky-700"
        >
          Think Design
        </a>
      </footer>

      <UpdatePrompt />
    </div>
  )
}
