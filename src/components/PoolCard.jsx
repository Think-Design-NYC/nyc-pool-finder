import {
  MapPin,
  Phone,
  TrainFront,
  Clock,
  Waves,
  Info,
  ExternalLink,
  Building2,
  CalendarDays,
  ChevronDown,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
    <li className="rounded-lg bg-shallow/40 p-3 ring-1 ring-inset ring-shallow">
      <p className="text-sm font-semibold text-deep-end">{schedule.session_type}</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        {/* "Mon 9/7" once the data carries dates; bare weekday otherwise. */}
        <span className="text-xs text-muted">{dayStamp(schedule)}</span>
        {/* Lane swim times are the hero — big and bold */}
        <span className="font-mono text-base font-medium text-tile-blue">{schedule.time}</span>
      </div>
      {schedule.notes && <p className="mt-1 text-xs italic text-muted">{schedule.notes}</p>}
    </li>
  )
}

// Session times as compact chips for a collapsed card. The session type only
// shows when the list mixes types (activity filter off); otherwise the filter
// already says what they are.
function TimeChips({ schedules }) {
  const mixed = new Set(schedules.map((s) => s.session_type)).size > 1
  return (
    <ul className="flex flex-wrap gap-1.5">
      {schedules.map((s, i) => (
        <li key={i} className="rounded-md bg-shallow/40 px-2 py-1 ring-1 ring-inset ring-shallow">
          {mixed && (
            <span className="block text-[11px] leading-tight text-deep-end/70">
              {s.session_type}
            </span>
          )}
          <span className="font-mono text-sm font-medium text-tile-blue">{s.time}</span>
        </li>
      ))}
    </ul>
  )
}

// Cards start collapsed to the header and the session times; the pool name
// and the arrow open the rest. Open state lives in App (one "Expand all"
// control, and a #pool-m260 link opens its card). Collapsed content stays in
// the DOM (`hidden`), so the rendered page never says less than the crawlable
// fallback.
export default function PoolCard({ pool, href = null, activityLabel = 'Swim', open, onToggle }) {
  const id = poolAnchorId(pool)
  const bodyId = `${id}-details`
  const noticeRef = useRef(null)
  // Set when the Notice button opened the card, so the notice is scrolled to
  // once it's actually rendered.
  const [revealNotice, setRevealNotice] = useState(false)
  useEffect(() => {
    if (open && revealNotice) {
      noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      setRevealNotice(false)
    }
  }, [open, revealNotice])

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
  const schedules = !isClosed ? (pool.schedules ?? []) : []

  return (
    <article
      id={id}
      className="flex scroll-mt-4 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line transition-shadow hover:shadow-md"
    >
      {/* The whole header toggles, arrow included. The name is the real
          button (keyboard, screen readers); its clicks bubble up to here. */}
      <header
        onClick={onToggle}
        className={`group flex cursor-pointer items-start justify-between gap-3 p-4 ${
          open ? 'border-b border-line/60' : ''
        }`}
      >
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-snug text-deep-end">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              className="rounded text-left group-hover:text-tile-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-tile-blue"
            >
              {pool.pool_name}
            </button>
          </h2>
          <p className="text-xs font-medium uppercase tracking-wide text-muted/80">
            {getBorough(pool)}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          <StatusBadge pool={pool} />
          <span className="-mr-1 rounded-full p-0.5 text-muted/80 group-hover:bg-deck group-hover:text-tile-blue">
            <ChevronDown
              size={20}
              aria-hidden="true"
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </span>
        </div>
      </header>

      {!open && (schedules.length > 0 || pool.notes) && (
        <div className="-mt-1 flex flex-wrap items-center gap-2 px-4 pb-4">
          {schedules.length > 0 && <TimeChips schedules={schedules} />}
          {pool.notes && (
            <button
              type="button"
              aria-controls={bodyId}
              onClick={() => {
                setRevealNotice(true)
                onToggle()
              }}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                isClosed
                  ? 'bg-red-50 text-red-800 ring-red-200 hover:bg-red-100'
                  : 'bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100'
              }`}
            >
              <Info size={13} aria-hidden="true" />
              Notice
            </button>
          )}
        </div>
      )}

      <div id={bodyId} hidden={!open} className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3 p-4">
          {/* Closed / transition notes — first, since the Notice button on a
              collapsed card opens straight to them. */}
          {pool.notes && (
            <div
              ref={noticeRef}
              className={`flex scroll-mt-4 items-start gap-2 rounded-lg p-3 text-sm ${
                isClosed
                  ? 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-100'
                  : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100'
              }`}
            >
              <Info size={16} className="mt-0.5 shrink-0" />
              <p>{pool.notes}</p>
            </div>
          )}

          {/* NYC Parks repeats a ~400-character summer reduced-hours notice on
            every affected pool. The scraper strips it and sets this flag; the
            actual hours are in the schedule below. */}
          {pool.reduced_hours && !isClosed && (
            <p className="text-sm text-muted">Reduced summer hours</p>
          )}

          {/* Location & contact */}
          <div className="space-y-1.5 text-sm text-muted">
            {address && (
              <p className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-muted/80" />
                <span>
                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-tile-blue hover:underline"
                    >
                      {loc.address}
                    </a>
                  ) : (
                    loc.address
                  )}
                  {loc.cross_streets && (
                    <span className="text-muted/80"> ({loc.cross_streets})</span>
                  )}
                  {(loc.city || loc.zip_code) && (
                    <span className="block text-muted/80">
                      {[loc.city, loc.state].filter(Boolean).join(', ')} {loc.zip_code}
                    </span>
                  )}
                </span>
              </p>
            )}
            {loc.nearest_subway && (
              <p className="flex items-start gap-2">
                <TrainFront size={16} className="mt-0.5 shrink-0 text-muted/80" />
                <span>{loc.nearest_subway}</span>
              </p>
            )}
            {pool.phone && (
              <p className="flex items-center gap-2">
                <Phone size={16} className="shrink-0 text-muted/80" />
                <a
                  href={`tel:${pool.phone.replace(/[^+\d]/g, '')}`}
                  className="font-medium text-tile-blue hover:underline"
                >
                  {pool.phone}
                </a>
              </p>
            )}
            {href && (
              <p className="flex items-center gap-2">
                <CalendarDays size={16} className="shrink-0 text-muted/80" />
                <a href={href} className="font-medium text-tile-blue hover:underline">
                  Full schedule &amp; directions
                </a>
              </p>
            )}
          </div>

          {/* Swim schedules */}
          {schedules.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Waves size={14} className="text-tile-blue" />
                {activityLabel} Times
                {reopening && (
                  <span className="font-medium normal-case tracking-normal text-amber-700">
                    · from {dayStamp({ date: pool.reopens_on })}
                  </span>
                )}
              </h3>
              <ul className="space-y-2">
                {schedules.map((s, i) => (
                  <ScheduleRow key={i} schedule={s} />
                ))}
              </ul>
            </section>
          )}

          {/* Building hours, when available */}
          {hours && (
            <details className="group text-sm">
              <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-muted hover:text-deep-end">
                <Building2 size={15} />
                Building hours
              </summary>
              <ul className="mt-2 space-y-1 pl-6 text-muted">
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
          <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/60 px-4 py-2.5">
            <a
              href={pool.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted/80 hover:text-tile-blue"
            >
              <Clock size={12} />
              Check latest schedule on nycgovparks.org
              <ExternalLink size={12} />
            </a>
          </footer>
        )}
      </div>
    </article>
  )
}
