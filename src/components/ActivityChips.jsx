// The activity filter as the mockup's chips: a pill track with the active chip
// filled. Lives in the pinned filter bar; scrolls sideways on narrow screens.
export default function ActivityChips({ activities, selected, onSelect }) {
  return (
    <div
      role="group"
      aria-label="Activity"
      className="flex gap-1 overflow-x-auto rounded-full bg-white p-1 ring-1 ring-inset ring-line [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-wrap lg:rounded-2xl"
    >
      {activities.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={selected === a}
          onClick={() => onSelect(a)}
          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            selected === a ? 'bg-tile-blue text-white shadow-sm' : 'text-deep-end hover:bg-deck'
          }`}
        >
          {a === 'All activities' ? 'All' : a}
        </button>
      ))}
    </div>
  )
}
