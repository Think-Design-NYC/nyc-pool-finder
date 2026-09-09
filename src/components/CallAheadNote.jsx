import { CALL_AHEAD_LEAD, CALL_AHEAD_DETAIL } from '../copy'

// The one sentence on this site that changes what someone does before leaving
// the house. NYC Parks can publish a full timetable for a drained pool — that
// is how Chelsea was found on 2026-09-08 — so the building is the only real
// authority on whether there is water in it.
//
// Mirrored in the build-time output by callAheadHtml() in src/html.js; the
// emphasis has to match there too.
export default function CallAheadNote({ className = '' }) {
  return (
    <span className={className}>
      <strong className="font-bold uppercase">{CALL_AHEAD_LEAD}</strong>{' '}
      {CALL_AHEAD_DETAIL}
    </span>
  )
}
