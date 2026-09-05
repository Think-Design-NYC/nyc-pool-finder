import {
  MapPin,
  Phone,
  TrainFront,
  Clock,
  Waves,
  Info,
  ExternalLink,
  Building2,
} from 'lucide-react'
import {
  getBorough,
  getStatusStyle,
  statusLabel,
  statusBadgeLabel,
  fullAddress,
  poolAnchorId,
  dayStamp,
  parseISODate,
} from '../utils'

// "Reopens Tue 9/8" — a pool shut today whose timetable starts inside the
// selected week. It must never read as "Open": the badge is amber, not green,
// and names the date rather than the status.
function reopensLabel(iso) {
  const d = parseISODate(iso)
  return d ? `Reopens ${dayStamp({ date: iso })}` : 'Reopens later'
}

function StatusBadge({ pool }) {
  const reopening = Boolean(pool.reopens_on)
  const s = reopening ? getStatusStyle('transitioning') : getStatusStyle(pool.status)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${s.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {reopening ? reopensLabel(pool.reopens_on) : statusBadgeLabel(pool)}
    </span>
  )
}

function ScheduleRow({ schedule }) {
  return (
    <li className="rounded-lg bg-sky-50 p-3 ring-1 ring-inset ring-sky-100">
      <p className="text-sm font-semibold text-sky-900">{schedule.session_type}</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        {/* "Mon 9/7" once the data carries dates; bare weekday otherwise. */}
        <span className="text-xs text-slate-500">{dayStamp(schedule)}</span>
        {/* Lane swim times are the hero — big and bold */}
        <span className="text-base font-bold tabular-nums text-sky-700">
          {schedule.time}
        </span>
      </div>
      {schedule.notes && (
        <p className="mt-1 text-xs italic text-slate-500">{schedule.notes}</p>
      )}
    </li>
  )
}

export default function PoolCard({ pool, activityLabel = 'Swim' }) {
  const loc = pool.location ?? {}
  const address = fullAddress(loc)
  const mapsUrl = pool.pool_name
    ? `https://maps.google.com/?q=${encodeURIComponent(`${pool.pool_name} New York NY`)}`
    : null
  const hours = loc.building_hours
  // A reopening pool is closed *now* but has a real timetable in view, so it
  // renders its schedule and wears the amber closure note rather than the red.
  const reopening = Boolean(pool.reopens_on)
  const isClosed = pool.status === 'closed' && !reopening

  return (
    <article
      id={poolAnchorId(pool)}
      className="flex scroll-mt-4 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md"
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <h2 className="text-lg font-bold leading-snug text-slate-900">
            {pool.pool_name}
          </h2>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {getBorough(pool)}
          </p>
        </div>
        <StatusBadge pool={pool} />
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* NYC Parks repeats a ~400-character summer reduced-hours notice on
            every affected pool. The scraper strips it and sets this flag; the
            actual hours are in the schedule below. */}
        {pool.reduced_hours && !isClosed && (
          <p className="text-sm text-slate-500">Reduced summer hours</p>
        )}

        {/* Location & contact */}
        <div className="space-y-1.5 text-sm text-slate-600">
          {address && (
            <p className="flex items-start gap-2">
              <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <span>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-sky-700 hover:underline"
                  >
                    {loc.address}
                  </a>
                ) : (
                  loc.address
                )}
                {loc.cross_streets && (
                  <span className="text-slate-400"> ({loc.cross_streets})</span>
                )}
                {(loc.city || loc.zip_code) && (
                  <span className="block text-slate-400">
                    {[loc.city, loc.state].filter(Boolean).join(', ')} {loc.zip_code}
                  </span>
                )}
              </span>
            </p>
          )}
          {loc.nearest_subway && (
            <p className="flex items-start gap-2">
              <TrainFront size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <span>{loc.nearest_subway}</span>
            </p>
          )}
          {pool.phone && (
            <p className="flex items-center gap-2">
              <Phone size={16} className="shrink-0 text-slate-400" />
              <a
                href={`tel:${pool.phone.replace(/[^+\d]/g, '')}`}
                className="font-medium text-sky-700 hover:underline"
              >
                {pool.phone}
              </a>
            </p>
          )}
        </div>

        {/* Closed / transition notes */}
        {pool.notes && (
          <div
            className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
              isClosed
                ? 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-100'
                : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100'
            }`}
          >
            <Info size={16} className="mt-0.5 shrink-0" />
            <p>{pool.notes}</p>
          </div>
        )}

        {/* Swim schedules */}
        {!isClosed && pool.schedules?.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Waves size={14} className="text-sky-500" />
              {activityLabel} Times
              {reopening && (
                <span className="font-medium normal-case tracking-normal text-amber-700">
                  · from {dayStamp({ date: pool.reopens_on })}
                </span>
              )}
            </h3>
            <ul className="space-y-2">
              {pool.schedules.map((s, i) => (
                <ScheduleRow key={i} schedule={s} />
              ))}
            </ul>
          </section>
        )}

        {/* Building hours, when available */}
        {hours && (
          <details className="group text-sm">
            <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-slate-500 hover:text-slate-700">
              <Building2 size={15} />
              Building hours
            </summary>
            <ul className="mt-2 space-y-1 pl-6 text-slate-600">
              {Object.entries(hours).map(([day, time]) => (
                <li key={day} className="flex justify-between gap-4">
                  <span>{day.replaceAll('_', ' – ')}</span>
                  <span className="tabular-nums">{time}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Footer link */}
      {pool.url && (
        <footer className="border-t border-slate-100 px-4 py-2.5">
          <a
            href={pool.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-sky-700"
          >
            <Clock size={12} />
            Check latest schedule on nycgovparks.org
            <ExternalLink size={12} />
          </a>
        </footer>
      )}
    </article>
  )
}
