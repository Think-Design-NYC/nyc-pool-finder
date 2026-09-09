import { getBorough, statusLabel, poolHref } from '../utils'

// The pools the active filters excluded — links only, no schedules.
//
// Exists because the rendered DOM used to be a strict subset of what the
// crawlable fallback contained: React filters the grid to borough / activity /
// day, so a pool that didn't match today simply vanished from the page
// Googlebot indexes. Now every pool is reachable from every filter state, and
// the depth lives on its own page rather than being duplicated here.
//
// There is deliberately no counterpart in the SEO fallback: that markup doesn't
// filter anything, so its "excluded" set is always empty. The two agree on the
// union — every pool appears in both — which is what the parity invariant is
// actually about. See the note in vite-plugin-seo.js.
export default function PoolDirectory({ pools, slugs }) {
  if (!pools.length) return null

  return (
    <section className="mx-auto mt-10 max-w-6xl">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Other NYC indoor pools ({pools.length})
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        These don&apos;t match the filters above right now. Each has its own page with
        the full two-week schedule, address and phone number.
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {pools.map((pool) => {
          const href = poolHref(pool, slugs)
          return (
            <li key={pool.pool_name} className="text-sm">
              {href ? (
                <a href={href} className="font-medium text-sky-700 hover:underline">
                  {pool.pool_name}
                </a>
              ) : (
                <span className="font-medium text-slate-700">{pool.pool_name}</span>
              )}
              <span className="text-slate-400">
                {' '}
                · {getBorough(pool)} · {statusLabel(pool)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
