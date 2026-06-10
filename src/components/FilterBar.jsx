import { Eye, EyeOff, ChevronDown } from 'lucide-react'

function PillRow({ options, selected, onSelect, activeClass = 'bg-sky-600 text-white shadow-sm' }) {
  return (
    <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onSelect(o)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selected === o ? activeClass : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function SelectMenu({ label, options, selected, onSelect, accentClass = 'text-sky-700 ring-sky-200' }) {
  const isDefault = selected === options[0]
  return (
    <label className="relative flex-1">
      <span className="sr-only">{label}</span>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        className={`w-full appearance-none rounded-full py-1.5 pl-4 pr-9 text-sm font-medium ring-1 ring-inset focus:outline-none focus:ring-2 ${
          isDefault
            ? 'bg-slate-100 text-slate-700 ring-slate-200'
            : `bg-white ${accentClass}`
        }`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
    </label>
  )
}

export default function FilterBar({
  boroughs,
  selectedBorough,
  onSelectBorough,
  activities,
  selectedActivity,
  onSelectActivity,
  selectedDay,
  onSelectDay,
  showClosed,
  onToggleClosed,
  closedCount,
}) {
  const hasActivities = activities && activities.length > 0
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        {/* Mobile: dropdowns for borough + activity */}
        <div className="flex items-center gap-2 md:hidden">
          <SelectMenu
            label="Borough"
            options={['All Boroughs', ...boroughs]}
            selected={selectedBorough}
            onSelect={onSelectBorough}
          />
          {hasActivities && (
            <SelectMenu
              label="Activity"
              options={['All activities', ...activities]}
              selected={selectedActivity}
              onSelect={onSelectActivity}
              accentClass="text-emerald-700 ring-emerald-200"
            />
          )}
        </div>

        {/* Desktop: pill rows */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <PillRow
            options={['All Boroughs', ...boroughs]}
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
              activeClass="bg-emerald-600 text-white shadow-sm"
            />
          </div>
        )}

        {/* Day filter + closed toggle: same on all sizes */}
        <div className="flex flex-wrap items-center gap-2">
          <PillRow
            options={['Today', 'Tomorrow', 'Week']}
            selected={selectedDay}
            onSelect={onSelectDay}
            activeClass="bg-orange-500 text-white shadow-sm"
          />
          <button
            onClick={onToggleClosed}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              showClosed
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100'
            }`}
            title={showClosed ? 'Hide closed pools' : 'Show closed pools'}
          >
            {showClosed ? <Eye size={15} /> : <EyeOff size={15} />}
            {showClosed ? 'Hiding none' : `Hiding closed${closedCount ? ` (${closedCount})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
