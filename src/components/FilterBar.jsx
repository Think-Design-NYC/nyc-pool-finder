import { ChevronDown } from 'lucide-react'

function PillRow({ options, selected, onSelect, activeClass = 'bg-deep-end text-white shadow-sm' }) {
  return (
    <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
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

export default function FilterBar({
  boroughOptions,
  selectedBorough,
  onSelectBorough,
  activities,
  selectedActivity,
  onSelectActivity,
  dayOptions,
  selectedDay,
  onSelectDay,
}) {
  const hasActivities = activities && activities.length > 0
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-deck/90 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        {/* Mobile: dropdowns for borough + activity */}
        <div className="flex items-center gap-2 md:hidden">
          <SelectMenu
            label="Borough"
            options={boroughOptions}
            selected={selectedBorough}
            onSelect={onSelectBorough}
          />
          {hasActivities && (
            <SelectMenu
              label="Activity"
              options={['All activities', ...activities]}
              selected={selectedActivity}
              onSelect={onSelectActivity}
              accentClass="text-tile-blue ring-tile-blue/40"
            />
          )}
        </div>

        {/* Desktop: pill rows */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <PillRow
            options={boroughOptions}
            selected={selectedBorough}
            onSelect={onSelectBorough}
          />
        </div>
        {hasActivities && (
          <div className="hidden md:block">
            <PillRow
              options={['All activities', ...activities]}
              selected={selectedActivity}
              onSelect={onSelectActivity}
              activeClass="bg-tile-blue text-white shadow-sm"
            />
          </div>
        )}

        <PillRow
          options={dayOptions}
          selected={selectedDay}
          onSelect={onSelectDay}
          activeClass="bg-shallow text-deep-end ring-1 ring-inset ring-tile-blue"
        />
      </div>
    </div>
  )
}
