// The activity filter as the mockup's header chips: a translucent track on the
// navy band, the active chip in white. Scrolls sideways on narrow screens.
export default function ActivityChips({ activities, selected, onSelect }) {
  return (
    <div
      role="group"
      aria-label="Activity"
      className="mt-4 flex shrink-0 gap-1 overflow-x-auto rounded-full bg-white/10 p-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:mt-0 lg:max-w-[40rem] lg:flex-wrap lg:rounded-3xl"
    >
      {activities.map((a) => (
        <button
          key={a}
          type="button"
          aria-pressed={selected === a}
          onClick={() => onSelect(a)}
          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
            selected === a ? 'bg-white text-deep-end' : 'text-white/85 hover:bg-white/10'
          }`}
        >
          {a === 'All activities' ? 'All' : a}
        </button>
      ))}
    </div>
  )
}
