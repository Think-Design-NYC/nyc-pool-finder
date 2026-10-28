import { NYC_MAP, projectToMap } from '../nycMap'
import { formatClock, poolAnchorId, shortPoolName } from '../utils'

// The mockup's map pane. A flat SVG drawn from NYC Open Data borough outlines
// (scripts/make_map.py), so there are no tiles, no third-party requests and it
// works offline. No street detail or zoom controls — directions are a link
// away on each pool page.
//
// Pins carry the card's lead time ("6:30", or "Now") in the card's colours,
// and the view frames whichever pools are listed: pick Manhattan and it zooms
// to Manhattan. Hovering or focusing a card highlights its pin; clicking a pin
// selects the card (App scrolls to it and opens it).

const PIN = {
  on: { fill: '#10976a', text: '#fff' },
  soon: { fill: '#1668e3', text: '#fff' },
  later: { fill: '#0b2a4a', text: '#fff' },
  day: { fill: '#0b2a4a', text: '#fff' },
  done: { fill: '#fff', text: '#5a6e85', stroke: '#dce4ec' },
}

// A closed pool's marker says why at a glance: a cone for construction work
// (judged from NYC Parks' closure reason — "for reconstruction", "for
// construction"), a no-entry sign for any other closure. Not from the notice
// prose: Metropolitan's mentions repairs but it is shut for a mechanical fault.
const isWorks = (pool) => /construct|renovat/i.test(pool.closure_reason ?? '')

function ClosedIcon({ works, k }) {
  if (works) {
    return (
      <g>
        <path d={`M0 ${-6 * k}L${4.6 * k} ${5 * k}H${-4.6 * k}Z`} fill="#d97706" />
        <path d={`M${-2.5 * k} ${0}H${2.5 * k}`} stroke="#fff" strokeWidth={1.6 * k} />
        <rect x={-6 * k} y={4.6 * k} width={12 * k} height={1.8 * k} rx={0.6 * k} fill="#92400e" />
      </g>
    )
  }
  return (
    <g>
      <circle r={5.4 * k} fill="#b91c1c" />
      <rect x={-3.4 * k} y={-1 * k} width={6.8 * k} height={2 * k} rx={0.6 * k} fill="#fff" />
    </g>
  )
}

const PAD = 70 // view box units around the framed pins
const MIN_W = 320 // never zoom in further than this
const ASPECT = 1.1 // framed area: height / width (the pane is a tall rectangle)

function pinLabel(pool) {
  if (pool.lead.group === 'on') return 'Now'
  return formatClock(pool.lead.lead.window.start).replace(/ (am|pm)$/, '')
}

// A view box around the pins, padded, at least MIN_W wide, at the pane's
// aspect, and kept inside the drawn map.
function frame(points) {
  const { width, height } = NYC_MAP
  if (!points.length) return [0, 0, width, height]
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  let x0 = Math.min(...xs) - PAD
  let x1 = Math.max(...xs) + PAD
  let y0 = Math.min(...ys) - PAD
  let y1 = Math.max(...ys) + PAD
  let w = Math.max(x1 - x0, MIN_W, (y1 - y0) / ASPECT)
  let h = w * ASPECT
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  if (w > width) {
    w = width
    h = w * ASPECT
  }
  x0 = Math.min(Math.max(cx - w / 2, 0), width - w)
  y0 = Math.min(Math.max(cy - h / 2, 0), Math.max(height - h, 0))
  return [x0, y0, w, h]
}

// `caption` names what the pins' times are for ("Lap swim · Thursday, Oct 29"),
// since a bare "6:30" means nothing without the activity and day.
export default function PoolMap({
  pools,
  closed = [],
  caption,
  highlightId,
  onSelectPool,
  you = null,
  className = '',
}) {
  const placed = pools
    .filter((p) => p.place?.lat != null && p.place?.lng != null && p.lead)
    .map((p) => ({ pool: p, id: poolAnchorId(p), at: projectToMap(p.place.lat, p.place.lng) }))
  const shut = closed
    .filter((p) => p.place?.lat != null && p.place?.lng != null)
    .map((p) => ({ pool: p, id: poolAnchorId(p), at: projectToMap(p.place.lat, p.place.lng) }))
  const youAt = you ? projectToMap(you.lat, you.lng) : null
  // Frame the reader and the closed pools too, so nothing listed is off the edge.
  const [vx, vy, vw, vh] = frame([
    ...placed.map((p) => p.at),
    ...shut.map((p) => p.at),
    ...(youAt ? [youAt] : []),
  ])
  // Pins and labels keep a constant on-screen size however far it zooms.
  const k = vw / 600

  // Highlighted pin drawn last, so it sits on top of its neighbours.
  const order = [...placed].sort((a, b) => (a.id === highlightId) - (b.id === highlightId))

  return (
    <div className={`relative overflow-hidden bg-[#c9ebf6] ${className}`}>
      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
        role="img"
        aria-label={`Map of ${placed.length} pools`}
      >
        {NYC_MAP.context.map((c) => (
          <path key={c.name} d={c.d} fill="#eef2f5" />
        ))}
        {NYC_MAP.boroughs.map((b) => (
          <path key={b.name} d={b.d} fill="#f4f7fa" stroke="#dce4ec" strokeWidth={k} />
        ))}
        {[...NYC_MAP.boroughs, ...NYC_MAP.context].map((b) => (
          <text
            key={`${b.name}-label`}
            x={b.label[0]}
            y={b.label[1]}
            textAnchor={NYC_MAP.context.includes(b) ? 'end' : 'middle'}
            fontSize={11 * k}
            letterSpacing={1.5 * k}
            fill="#5a6e85"
            fontWeight="600"
            style={{ textTransform: 'uppercase' }}
          >
            {b.name}
          </text>
        ))}
        {/* Closed pools first, so open pins sit on top where they crowd. */}
        {shut.map(({ pool, id, at: [x, y] }) => {
          const works = isWorks(pool)
          const name = shortPoolName(pool)
          const nameW = (name.length + 9) * 6.2 * k // name + " · closed"
          // Flip left at the frame's edge, or when an open pin (which wins the
          // space) sits where the label would run — Hansborough, just west of
          // St. Mary's.
          const blocked = placed.some(
            ({ at: [px, py] }) => px > x && px - x < nameW + 40 * k && Math.abs(py - y) < 34 * k,
          )
          const leftFits = x - 13 * k - nameW > vx
          const flip = leftFits && (x + 12 * k + nameW > vx + vw || blocked)
          return (
            <g
              key={id}
              role="button"
              tabIndex={0}
              aria-label={`${pool.pool_name}: closed${pool.closure_reason ? ` ${pool.closure_reason}` : ''}`}
              onClick={() => onSelectPool(id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPool(id)}
              className="cursor-pointer focus:outline-none"
            >
              <circle cx={x} cy={y} r={10 * k} fill="#fff" stroke="#dce4ec" strokeWidth={1.2 * k} />
              <g transform={`translate(${x} ${y})`}>
                <ClosedIcon works={works} k={k} />
              </g>
              <text
                x={flip ? x - 13 * k : x + 13 * k}
                y={y}
                dominantBaseline="central"
                textAnchor={flip ? 'end' : 'start'}
                fontSize={11 * k}
                fontWeight="600"
                fill="#5a6e85"
                stroke="#f4f7fa"
                strokeWidth={3.5 * k}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {name} · closed
              </text>
            </g>
          )
        })}
        {youAt && (
          <g aria-label="Your location">
            <circle cx={youAt[0]} cy={youAt[1]} r={14 * k} fill="#1668e3" opacity="0.18" />
            <circle
              cx={youAt[0]}
              cy={youAt[1]}
              r={6 * k}
              fill="#1668e3"
              stroke="#fff"
              strokeWidth={2 * k}
            />
            <text
              x={youAt[0] + 11 * k}
              y={youAt[1]}
              dominantBaseline="central"
              fontSize={11 * k}
              fontWeight="700"
              letterSpacing={1 * k}
              fill="#1668e3"
            >
              YOU
            </text>
          </g>
        )}
        {order.map(({ pool, id, at: [x, y] }) => {
          const tone = PIN[pool.lead.group] ?? PIN.day
          const label = pinLabel(pool)
          const on = id === highlightId
          const s = on ? 1.2 : 1
          const w = (label.length * 8 + 18) * k * s
          const h = 24 * k * s
          // Names run right of the pill unless that would cross the frame's
          // right edge (Roy Wilkins, far east in Queens) — then they flip left.
          const name = shortPoolName(pool)
          const nameW = name.length * 6.6 * k * s
          const flip = x + w / 2 + 4 * k + nameW > vx + vw
          return (
            <g
              key={id}
              role="button"
              tabIndex={0}
              aria-label={`${pool.pool_name}: ${pool.lead.status ?? label}`}
              onClick={() => onSelectPool(id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPool(id)}
              className="cursor-pointer focus:outline-none"
            >
              <circle cx={x} cy={y} r={3 * k} fill={tone.stroke ?? tone.fill} />
              <rect
                x={x - w / 2}
                y={y - h - 7 * k}
                width={w}
                height={h}
                rx={h / 2}
                fill={tone.fill}
                stroke={on ? '#f2542d' : (tone.stroke ?? '#fff')}
                strokeWidth={(on ? 2.5 : 1.5) * k}
              />
              <text
                x={x}
                y={y - 7 * k - h / 2}
                dominantBaseline="central"
                textAnchor="middle"
                fontSize={12 * k * s}
                fontWeight="600"
                fontFamily="'DM Mono', ui-monospace, monospace"
                fill={tone.text}
              >
                {label}
              </text>
              {/* The pool's name beside its pill, haloed so it reads over
                  shorelines and borough labels. */}
              <text
                x={flip ? x - w / 2 - 4 * k : x + w / 2 + 4 * k}
                y={y - 7 * k - h / 2}
                dominantBaseline="central"
                textAnchor={flip ? 'end' : 'start'}
                fontSize={11.5 * k * s}
                fontWeight={on ? '700' : '600'}
                fill="#0b2a4a"
                stroke="#f4f7fa"
                strokeWidth={3.5 * k}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {name}
              </text>
            </g>
          )
        })}
      </svg>
      {caption && (
        <p className="absolute left-3 right-3 top-3 w-fit rounded-full bg-deep-end px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
          {caption}
        </p>
      )}
      <ul className="absolute left-3 top-12 flex lg:bottom-3 lg:top-auto gap-3 rounded-full bg-white/95 px-3 py-1.5 text-xs text-deep-end shadow-sm ring-1 ring-line">
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-open" aria-hidden="true" />
          On now
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-tile-blue" aria-hidden="true" />
          Starts soon
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-deep-end" aria-hidden="true" />
          Later
        </li>
        {shut.some((p) => !isWorks(p.pool)) && (
          <li className="flex items-center gap-1.5">
            <svg viewBox="-7 -7 14 14" className="size-3" aria-hidden="true">
              <ClosedIcon works={false} k={1} />
            </svg>
            Closed
          </li>
        )}
        {shut.some((p) => isWorks(p.pool)) && (
          <li className="flex items-center gap-1.5">
            <svg viewBox="-7 -7 14 14" className="size-3" aria-hidden="true">
              <ClosedIcon works k={1} />
            </svg>
            Construction
          </li>
        )}
      </ul>
    </div>
  )
}
