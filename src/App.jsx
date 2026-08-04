import { useEffect, useMemo, useState } from 'react'
import { Waves } from 'lucide-react'
import pools from '../nyc_pools_live.json'
import meta from '../nyc_pools_meta.json'
import thinkDesignLogo from '../think-design-logo-2026.png'
import FilterBar from './components/FilterBar'
import PoolCard from './components/PoolCard'
import SeoContent from './components/SeoContent'
import { getBorough, ACTIVITIES, matchesActivity, matchesDay, isPastToday } from './utils'

const BOROUGH_ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Other']

// localStorage can throw (private mode, storage disabled); on failure this
// degrades to plain useState.
function usePersistedFilter(key, defaultValue, validValues) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      if (validValues.includes(stored)) return stored
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
  const [selectedDay, setSelectedDay] = usePersistedFilter('poolfinder.day', 'Today', [
    'Today',
    'Tomorrow',
    'Week',
  ])

  const activityActive = selectedActivity && selectedActivity !== 'All activities'
  const dayActive = selectedDay && selectedDay !== 'Week'
  const hidePast = selectedDay === 'Today'

  const boroughs = useMemo(() => {
    const present = new Set()
    for (const p of pools) {
      if (activityActive || dayActive) {
        const hasMatch = (p.schedules ?? []).some(
          (s) =>
            (!activityActive || matchesActivity(s.session_type, selectedActivity)) &&
            (!dayActive || matchesDay(s.days, selectedDay)) &&
            (!hidePast || !isPastToday(s.time)),
        )
        if (!hasMatch) continue
      }
      present.add(getBorough(p))
    }
    return BOROUGH_ORDER.filter((b) => present.has(b))
  }, [activityActive, dayActive, hidePast, selectedActivity, selectedDay])

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

  const visiblePools = useMemo(() => {
    return pools
      .filter((p) => selectedBorough === 'All Boroughs' || getBorough(p) === selectedBorough)
      .map((p) => {
        if (!activityActive && !dayActive) return p
        const filtered = (p.schedules ?? []).filter(
          (s) =>
            (!activityActive || matchesActivity(s.session_type, selectedActivity)) &&
            (!dayActive || matchesDay(s.days, selectedDay)) &&
            (!hidePast || !isPastToday(s.time)),
        )
        return { ...p, schedules: filtered }
      })
      .filter(
        (p) => (!activityActive && !dayActive) || (p.schedules?.length ?? 0) > 0,
      )
      .sort((a, b) => {
        // Open pools first, then transitioning, then closed
        const rank = { open: 0, transitioning: 1, closed: 2 }
        return (rank[a.status] ?? 3) - (rank[b.status] ?? 3)
      })
  }, [selectedBorough, selectedActivity, activityActive, selectedDay, dayActive, hidePast])

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

      <FilterBar
        boroughs={boroughs}
        selectedBorough={selectedBorough}
        onSelectBorough={setSelectedBorough}
        activities={activities}
        selectedActivity={selectedActivity}
        onSelectActivity={setSelectedActivity}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <main className="mx-auto mt-5 max-w-6xl">
        {visiblePools.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
            No pools match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visiblePools.map((pool) => (
              <PoolCard
                key={pool.pool_name}
                pool={pool}
                activityLabel={activityActive ? selectedActivity : 'Swim'}
              />
            ))}
          </div>
        )}
      </main>

      <SeoContent pools={pools} openNames={openNames} />
    </div>
  )
}
