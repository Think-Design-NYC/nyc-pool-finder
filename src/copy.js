// Prose shown in both the rendered UI and the build-time SEO fallback.
//
// Same reason as faq.js and membership.js: anything the two render has to come
// from one place, or the raw HTML and the rendered DOM end up making different
// claims. See the fallback-parity invariant in CLAUDE.md.

// Added 2026-09-08, after Chelsea was found drained while both this site and
// nycgovparks.org still listed a full lap-swim schedule. The data is only ever
// as good as what NYC Parks has published; the building itself is not.
export const CALL_AHEAD_NOTE =
  'Please call ahead before planning your swim: the Rec Center will have the most up-to-date information.'
