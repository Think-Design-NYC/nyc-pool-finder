// HTML escaping for the build-time generators (the SEO fallback and the static
// pool pages). Never used by React, which escapes on its own.
//
// Scraped copy is untrusted input — NYC Parks notices land in the markup
// verbatim — so everything interpolated into generated HTML goes through this.
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

import { CALL_AHEAD_LEAD, CALL_AHEAD_DETAIL } from './copy.js'

// The call-ahead note as markup: uppercase bold lead, plain detail. Mirrors
// what <CallAheadNote> renders in React — both sides need the same emphasis or
// the fallback and the rendered DOM disagree on the page's most important
// sentence. Callers style `.call-lead` in their own scoped block.
export function callAheadHtml() {
  return `<strong class="call-lead">${escapeHtml(CALL_AHEAD_LEAD)}</strong> ${escapeHtml(
    CALL_AHEAD_DETAIL,
  )}`
}
