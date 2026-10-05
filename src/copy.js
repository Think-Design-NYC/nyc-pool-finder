// Prose shown in both the rendered UI and the build-time SEO fallback.
//
// Same reason as faq.js and membership.js: anything the two render has to come
// from one place, or the raw HTML and the rendered DOM end up making different
// claims. See the fallback-parity invariant in CLAUDE.md.

// Added 2026-09-08, after Chelsea was found drained while both this site and
// nycgovparks.org still listed a full lap-swim schedule. The data is only ever
// as good as what NYC Parks has published; the building itself is not.
// Split so the lead can be set uppercase and bold while the rest stays in
// running case. The casing is CSS (text-transform), not baked into the string:
// screen readers then still read a normal sentence rather than spelling out
// shouted capitals, and the plain-text CALL_AHEAD_NOTE stays usable as prose.
export const CALL_AHEAD_LEAD = 'Please call ahead before planning your swim:'
export const CALL_AHEAD_DETAIL =
  'the Rec Center will have the most up-to-date information.'

export const CALL_AHEAD_NOTE = `${CALL_AHEAD_LEAD} ${CALL_AHEAD_DETAIL}`

// The announcement banner at the top of the page, shared by <NewsBanner> and
// the fallback's newsHtml() for the same parity reason as the call-ahead note.
// Hand-written from the cited story, never scraped. There is no expiry on
// purpose: React and the build-time fallback would judge it at different times
// and disagree. Delete it (and its two render sites) once it stops being news.
// Added 2026-10-04 when St. Mary's reopened (the scraper picked it up on 9/30).
export const NEWS = {
  headline: "St. Mary's Recreation Center pool has reopened in the Bronx",
  summary:
    "After nearly four years closed, St. Mary's Recreation Center in Mott Haven reopened on " +
    'September 30, 2026, following a $20.7 million renovation. The work repaired the indoor ' +
    'pool and added a new pool deck, lobby and an elevator to every floor. It is the only ' +
    'indoor pool NYC Parks runs in the Bronx.',
  source: 'Bronx Times',
  sourceUrl: 'https://www.bxtimes.com/st-marys-recreation-center-reopens-after-renovation/',
  // Our own write-up of a first visit, a static page in public/news/.
  postUrl: '/news/st-marys-reopening/',
  postLabel: 'Read our visit report, with photos',
}
