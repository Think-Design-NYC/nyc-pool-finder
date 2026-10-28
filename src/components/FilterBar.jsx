import { useEffect, useRef, useState } from 'react'
import ActivityChips from './ActivityChips'
import { CalendarDays, ChevronDown } from 'lucide-react'
import {
  DAY_FILTERS,
  dateForDayFilter,
  longDayLabel,
  parseISODate,
  shortDayLabel,
  toISODate,
} from '../utils'

function PillRow({ options, selected, onSelect, activeClass = 'bg-deep-end text-white shadow-sm' }) {
  // Wraps rather than scrolls: in the desktop list column a scrolled row hid
  // the last borough off the edge.
  return (
    <div className="flex flex-1 flex-wrap gap-2 pb-1">
      {options.map((o) => {
        // Activity pills are plain strings; the day pills carry a label that
        // differs from the stored token (weekday names that roll daily), and a
        // borough with nothing matching is `muted` — greyed, still pickable,
        // with the reason in `title`.
        const { value, label, ariaLabel, title, muted } =
          typeof o === 'string' ? { value: o, label: o } : o
        return (
          <button
            key={value}
            onClick={() => onSelect(value)}
            aria-label={ariaLabel}
            title={title}
            aria-pressed={selected === value}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium tabular-nums transition-colors ${
              selected === value
                ? activeClass
                : muted
                  ? 'bg-white/50 text-muted/60 ring-1 ring-inset ring-line/60 hover:bg-white'
                  : 'bg-white text-deep-end ring-1 ring-inset ring-line hover:bg-deck'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function SelectMenu({ label, options, selected, onSelect, accentClass = 'text-deep-end ring-deep-end/40' }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  const isDefault = selected === opts[0].value
  return (
    <label className="relative flex-1">
      <span className="sr-only">{label}</span>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className={`w-full appearance-none rounded-full py-1.5 pl-4 pr-9 text-sm font-medium ring-1 ring-inset focus:outline-none focus:ring-2 ${
          isDefault
            ? 'bg-white text-deep-end ring-line'
            : `bg-shallow ${accentClass}`
        }`}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.mutedLabel ?? o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
      />
    </label>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Today · Tomorrow · Pick a day. The calendar lists every date the scraped
// weeks cover, Monday-first like NYC Parks' own weeks, and sits in the flow
// under the chips rather than floating, so it can't be clipped by the sticky
// bar. Once a later day is picked, the third chip shows it ("Thu 10/29").
function DayPicker({ selected, onSelect, dates }) {
  const [open, setOpen] = useState(false)
  const picked = !DAY_FILTERS.includes(selected)
  const available = new Set(dates)
  const selectedISO = dateForDayFilter(selected)

  // Pad from the Monday of the first week to the Sunday of the last.
  const cells = []
  if (dates.length) {
    const first = parseISODate(dates[0])
    const last = parseISODate(dates[dates.length - 1])
    const d = new Date(first)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const end = new Date(last)
    end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)))
    for (; d <= end; d.setDate(d.getDate() + 1)) cells.push(toISODate(d))
  }

  const chip = (active) =>
    `shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium tabular-nums transition-colors ${
      active
        ? 'bg-shallow text-deep-end ring-1 ring-inset ring-tile-blue'
        : 'bg-white text-deep-end ring-1 ring-inset ring-line hover:bg-deck'
    }`

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
        {DAY_FILTERS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={selected === v}
            onClick={() => {
              setOpen(false)
              onSelect(v)
            }}
            className={chip(selected === v)}
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-pressed={picked}
          aria-label={picked ? `Pick a day: ${longDayLabel(selected)}` : 'Pick a day'}
          onClick={() => setOpen((o) => !o)}
          className={`${chip(picked)} inline-flex items-center gap-1.5`}
        >
          <CalendarDays size={14} aria-hidden="true" />
          {picked ? shortDayLabel(selected) : 'Pick a day'}
        </button>
      </div>
      {open && (
        <div className="mt-2 w-full max-w-xs rounded-2xl bg-white p-3 shadow-sm ring-1 ring-line">
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="pb-1 text-[11px] font-medium uppercase text-muted">
                {w}
              </span>
            ))}
            {cells.map((iso) => {
              const ok = available.has(iso)
              const on = iso === selectedISO
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!ok}
                  aria-label={longDayLabel(iso)}
                  aria-pressed={on}
                  onClick={() => {
                    setOpen(false)
                    // Today and Tomorrow stay relative; any later date is itself.
                    const v = iso === dateForDayFilter('Today')
                      ? 'Today'
                      : iso === dateForDayFilter('Tomorrow')
                        ? 'Tomorrow'
                        : iso
                    onSelect(v)
                  }}
                  className={`rounded-lg py-1.5 text-sm tabular-nums ${
                    on
                      ? 'bg-tile-blue font-semibold text-white'
                      : ok
                        ? 'text-deep-end hover:bg-shallow/60'
                        : 'text-muted/40'
                  }`}
                >
                  {parseISODate(iso).getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FilterBar({
  activities,
  selectedActivity,
  onSelectActivity,
  boroughOptions,
  selectedBorough,
  onSelectBorough,
  searching,
  searchNote,
  dates,
  selectedDay,
  onSelectDay,
}) {
  // Publishes the bar's height as --filters-h, so the sticky map pane can sit
  // just below it whatever the bar wraps to (or while the calendar is open).
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) =>
      document.documentElement.style.setProperty('--filters-h', `${e.target.offsetHeight}px`),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="sticky top-0 z-20 -mx-4 border-b border-line bg-deck/95 px-4 py-2.5 backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        {activities.length > 0 && (
          <ActivityChips
            activities={activities}
            selected={selectedActivity}
            onSelect={onSelectActivity}
          />
        )}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          {/* The header search spans every borough, so the borough choice steps
              aside while it has text rather than silently narrowing it. */}
          {searching ? (
            <p className="py-1.5 text-sm text-muted">{searchNote}</p>
          ) : (
            <>
              <div className="md:hidden">
                <SelectMenu
                  label="Borough"
                  options={boroughOptions}
                  selected={selectedBorough}
                  onSelect={onSelectBorough}
                />
              </div>
              <div className="hidden md:flex">
                <PillRow
                  options={boroughOptions}
                  selected={selectedBorough}
                  onSelect={onSelectBorough}
                />
              </div>
            </>
          )}
          <DayPicker selected={selectedDay} onSelect={onSelectDay} dates={dates} />
        </div>
      </div>
    </div>
  )
}
