import { useMemo, useState } from 'react'
import { Waves } from 'lucide-react'
import pools from '../nyc_pools_live.json'
import meta from '../nyc_pools_meta.json'
import FilterBar from './components/FilterBar'
import PoolCard from './components/PoolCard'
import { getBorough, ACTIVITIES, matchesActivity, matchesDay, isPastToday } from './utils'

export default function App() {
  const [selectedBorough, setSelectedBorough] = useState('Manhattan')
  const [selectedActivity, setSelectedActivity] = useState('Lap Swim')
  const [selectedDay, setSelectedDay] = useState('Today')
  const [showClosed, setShowClosed] = useState(true)

  const boroughs = useMemo(() => {
    const order = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Other']
    const present = new Set(pools.map(getBorough))
    return order.filter((b) => present.has(b))
  }, [])

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

  const closedCount = useMemo(
    () => pools.filter((p) => p.status === 'closed').length,
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

  const activityActive = selectedActivity && selectedActivity !== 'All activities'
  const dayActive = selectedDay && selectedDay !== 'Week'
  const hidePast = selectedDay === 'Today'

  const visiblePools = useMemo(() => {
    return pools
      .filter((p) => selectedBorough === 'All' || getBorough(p) === selectedBorough)
      .filter((p) => showClosed || p.status !== 'closed')
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
  }, [selectedBorough, showClosed, selectedActivity, activityActive, selectedDay, dayActive, hidePast])

  return (
    <div className="min-h-screen bg-slate-50 px-4 pb-12">
      <header className="mx-auto max-w-6xl pb-4 pt-6">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
          <Waves className="text-sky-600" size={26} />
          NYC Pool Finder
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Indoor public pools &amp; lap swim schedules
          {lastUpdated && (
            <span className="text-slate-400"> · Last updated: {lastUpdated}</span>
          )}
        </p>
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
        showClosed={showClosed}
        onToggleClosed={() => setShowClosed((v) => !v)}
        closedCount={closedCount}
      />

      <main className="mx-auto mt-5 max-w-6xl">
        {visiblePools.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
            No pools match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visiblePools.map((pool) => (
              <PoolCard key={pool.pool_name} pool={pool} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
