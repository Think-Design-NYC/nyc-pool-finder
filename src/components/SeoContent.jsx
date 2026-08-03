import { FAQ } from '../faq'
import {
  IDNYC_NOTE,
  MEMBERSHIP_CHECKED,
  MEMBERSHIP_TIERS,
  MEMBERSHIP_URL,
} from '../membership'

// Crawlable, genuinely useful page copy. Googlebot executes JS and indexes the
// *rendered* DOM, which means the static fallback in vite-plugin-seo.js is gone
// by the time it looks — the keyword-bearing content has to live here too.
export default function SeoContent({ pools, openNames }) {
  const boroughs = [...new Set(pools.map((p) => p.borough).filter(Boolean))]

  return (
    <section className="mx-auto mt-12 max-w-6xl border-t border-slate-200 pt-8">
      <h2 className="text-lg font-bold text-slate-900">
        Indoor swimming in New York City
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
        NYC Parks operates {pools.length} indoor public pools across{' '}
        {boroughs.join(', ')}. Every one of them sits inside a recreation center, so
        you need a Recreation Center membership to swim. This page pulls the current
        lap swim, open swim, family swim and water exercise schedules straight from
        nycgovparks.org each morning, so you can see which pools are open now and when
        the next session starts without clicking through a dozen recreation-center
        pages.
      </p>

      <h3 className="mt-6 text-sm font-bold text-slate-900">
        What a Recreation Center membership costs
      </h3>
      <p className="mt-1 text-xs text-slate-400">As of {MEMBERSHIP_CHECKED}</p>
      <div className="mt-2 max-w-2xl overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th scope="col" className="py-2 pr-4 font-semibold">Who</th>
              <th scope="col" className="py-2 font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {MEMBERSHIP_TIERS.map((tier) => (
              <tr key={tier.who} className="border-b border-slate-100 align-top">
                <td className="py-2 pr-4 text-slate-600">{tier.who}</td>
                <td className="py-2">
                  <span className="font-semibold text-slate-800">{tier.price}</span>
                  {tier.note && (
                    <span className="block text-xs text-slate-400">{tier.note}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
        Prices are for the &ldquo;Access to All Centers&rdquo; package — the cheaper
        $100/year tier excludes every center with a pool. {IDNYC_NOTE}{' '}
        <a
          href={MEMBERSHIP_URL}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-sky-700"
        >
          Full membership details
        </a>
        .
      </p>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
        Unlike the city&apos;s outdoor pools — which run only from late June through
        Labor Day — indoor pools are open year-round. Filter by borough to find a
        pool near you in Manhattan, Brooklyn, Queens or the Bronx.
      </p>

      <h2 className="mt-8 text-lg font-bold text-slate-900">
        Frequently asked questions
      </h2>
      <dl className="mt-3 max-w-3xl space-y-4">
        {FAQ.map((item) => (
          <div key={item.q}>
            <dt className="text-sm font-semibold text-slate-800">{item.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-slate-600">
              {item.a(openNames)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-xs text-slate-400">
        Schedules are scraped from{' '}
        <a
          href="https://www.nycgovparks.org/facilities/indoor-pools"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-sky-700"
        >
          nycgovparks.org
        </a>{' '}
        and can change without notice. Call the pool before making a trip.
      </p>
    </section>
  )
}
