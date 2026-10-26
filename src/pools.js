// The pool list the website actually renders: scraped NYC Parks records,
// plus the hand-maintained Riverbank overlay, plus location meta.
//
// Shared by App.jsx and the build-time SEO plugin so the homepage, fallback
// and pool pages cannot disagree about who is listed. `from` is the clock the
// overlay is judged against — the reader's in the browser, the scrape's at
// build time (see the header of riverbank.js).

import rawPools from '../nyc_pools_live.json'
import { withPoolMeta } from './poolMeta.js'
import { withRiverbank } from './riverbank.js'

export function loadPools(from = new Date()) {
  return withPoolMeta(withRiverbank(rawPools, from))
}
