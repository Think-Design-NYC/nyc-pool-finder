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
