import { Eye, EyeOff } from 'lucide-react'

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

export default function FilterBar({
  boroughs,
  selectedBorough,
  onSelectBorough,
  activities,
  selectedActivity,
  onSelectActivity,
  showClosed,
  onToggleClosed,
  closedCount,
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PillRow
            options={['All', ...boroughs]}
            selected={selectedBorough}
            onSelect={onSelectBorough}
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
        {activities && activities.length > 0 && (
          <PillRow
            options={['All activities', ...activities]}
            selected={selectedActivity}
            onSelect={onSelectActivity}
            activeClass="bg-emerald-600 text-white shadow-sm"
          />
        )}
      </div>
    </div>
  )
}
