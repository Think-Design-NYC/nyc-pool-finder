import { LocateFixed, Search, X } from 'lucide-react'

// The header search (mockup: "Search pools, neighborhoods or ZIP"). Matches
// the bundled pools by name, neighborhood, borough, address or ZIP — see
// matchesQuery() in utils.js. Rendered twice (desktop row, mobile under the
// headline) with one shared value, so only one is ever visible.
//
// "Near me" sits where the mockup has its "New York, NY" pill. Location is
// opt-in: nothing asks for it until the reader taps this, and it never leaves
// the device (see the privacy page).
export default function SearchBox({ value, onChange, near, onNear }) {
  const nearLabel =
    near.status === 'on'
      ? 'Near you'
      : near.status === 'locating'
        ? 'Locating…'
        : near.status === 'denied'
          ? 'Location off'
          : near.status === 'far'
            ? 'Not in NYC'
            : 'Near me'
  return (
    <div role="search" className="relative">
      <Search
        size={18}
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tile-blue"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder="Search pools, neighborhoods or ZIP"
        aria-label="Search pools by name, neighborhood or ZIP code"
        className="h-11 w-full rounded-full bg-white pl-11 pr-36 text-sm text-deep-end placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-tile-blue [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="rounded-full p-1.5 text-muted hover:bg-deck hover:text-deep-end"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onNear}
          aria-pressed={near.status === 'on'}
          title={
            near.status === 'on'
              ? 'Sorted by distance from you. Tap to stop.'
              : near.status === 'denied'
                ? 'Your browser blocked location for this site.'
                : near.status === 'far'
                  ? "You don't seem to be in New York City, so distances are hidden."
                  : 'Show how far each pool is (asks your browser for your location)'
          }
          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
            near.status === 'on'
              ? 'bg-tile-blue text-white'
              : 'border-l border-line text-deep-end hover:bg-deck'
          }`}
        >
          <LocateFixed size={15} aria-hidden="true" />
          {nearLabel}
        </button>
      </div>
    </div>
  )
}
