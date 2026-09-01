import { getBorough, statusLabel, poolAnchorId } from '../utils'

// Closed pools, always shown, below the grid.
//
// They deliberately sit outside the filtered list: a closed pool has no
// schedules, so any activity or day filter dropped it entirely and the pools
// people most need to know about were the ones that vanished. Keeping them in
// their own section means they're visible under every filter combination
// without ever matching a "when can I swim" query.
//
// Each row carries the things someone would go looking for once they learn a
// pool is shut: a number to call, and the project page explaining why. The
// links come from the closure notice itself, so a pool only gets one if NYC
// Parks published one.
//
// The anchor id stays on each row so /pools/#pool-m260 and the JSON-LD `url`
// for a closed pool still resolve.
export default function ClosedPoolList({ pools }) {
  if (!pools.length) return null

  return (
    <section className="mx-auto mt-10 max-w-6xl">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Currently closed ({pools.length})
      </h2>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
        {pools.map((pool) => (
          <li
            key={pool.pool_name}
            id={poolAnchorId(pool)}
            className="scroll-mt-4 px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-semibold text-slate-900">{pool.pool_name}</span>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {getBorough(pool)}
              </span>
            </div>

            <p className="mt-0.5 text-sm text-amber-800">{statusLabel(pool)}</p>

            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              {pool.phone && (
                <a
                  className="font-medium text-sky-700 hover:underline"
                  href={`tel:${pool.phone.replace(/[^+\d]/g, '')}`}
                >
                  {pool.phone}
                </a>
              )}
              {(pool.notice_links ?? []).map((link) => (
                <span key={link.url} className="flex items-center gap-2">
                  <span aria-hidden="true">·</span>
                  <a
                    className="text-sky-700 hover:underline"
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.text}
                  </a>
                </span>
              ))}
              {pool.url && (
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">·</span>
                  <a
                    className="text-sky-700 hover:underline"
                    href={pool.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    NYC Parks page
                  </a>
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
