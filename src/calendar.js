// "Add to calendar" for one session: an .ics file built on the spot, shared by
// the homepage cards (React) and the static pool pages (build time). Nothing is
// sent anywhere — the link carries the whole event as a data: URI, so it works
// offline and without a server.

const pad = (n) => String(n).padStart(2, '0')

// '2026-10-28', 1020 -> '20261028T170000' (local New York time; see TZID).
function stamp(iso, mins) {
  return `${iso.replaceAll('-', '')}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`
}

// RFC 5545 text escaping, and folding at 75 octets (approximated in chars —
// every field here is ASCII apart from the occasional curly apostrophe).
const text = (s) => String(s ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
function fold(line) {
  const out = []
  for (let i = 0; i < line.length; i += 73) out.push((i ? ' ' : '') + line.slice(i, i + 73))
  return out.join('\r\n')
}

// Events name their zone (TZID=America/New_York) without embedding a VTIMEZONE
// block: Google, Apple and Outlook calendars all resolve the IANA name, and on
// the pool pages a VTIMEZONE in every link more than doubled the page weight.

// { title, date: 'YYYY-MM-DD', start, end (minutes), location, description, url }
export function icsEvent({ title, date, start, end, location, description, url }) {
  const uid = `${stamp(date, start)}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@pools.thinkdesign.com`
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Think Design//NYC Indoor Pool Finder//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;TZID=America/New_York:${stamp(date, start)}`,
    `DTEND;TZID=America/New_York:${stamp(date, end)}`,
    `SUMMARY:${text(title)}`,
    location && `LOCATION:${text(location)}`,
    description && `DESCRIPTION:${text(description)}`,
    url && `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .map(fold)
    .join('\r\n')
}

export const icsHref = (event) =>
  `data:text/calendar;charset=utf-8,${encodeURIComponent(icsEvent(event))}`

// "asser-levy-pool-adult-lap-swim-2026-10-28.ics"
export const icsFilename = ({ title, date }) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${date}.ics`

// The event for one scraped session at one pool. Says "check before you go"
// because NYC Parks changes times without notice.
export function sessionEvent(pool, session, window, url = 'https://pools.thinkdesign.com/') {
  const loc = pool.location ?? {}
  const address = [loc.address, [loc.city || 'New York', loc.state || 'NY'].join(', '), loc.zip_code]
    .filter(Boolean)
    .join(', ')
  return {
    title: `${session.session_type} at ${pool.pool_name}`,
    date: session.date,
    start: window.start,
    end: window.end,
    location: address ? `${pool.pool_name}, ${address}` : pool.pool_name,
    description: [
      'Times can change without notice — call ahead before you go.',
      pool.phone && `Phone: ${pool.phone}`,
    ]
      .filter(Boolean)
      .join('\n'),
    url,
  }
}
