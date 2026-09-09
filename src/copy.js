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
