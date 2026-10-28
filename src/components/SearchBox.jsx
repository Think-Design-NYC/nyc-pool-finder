import { Search, X } from 'lucide-react'

// The header search (mockup: "Search pools, neighborhoods or ZIP"). Matches
// the bundled pools by name, neighborhood, borough, address or ZIP — see
// matchesQuery() in utils.js. Rendered twice (desktop row, mobile under the
// headline) with one shared value, so only one is ever visible.
export default function SearchBox({ value, onChange }) {
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
        className="h-11 w-full rounded-full bg-white pl-11 pr-10 text-sm text-deep-end placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-tile-blue [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-deck hover:text-deep-end"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
