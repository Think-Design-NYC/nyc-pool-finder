import { NYC_MAP, projectToMap } from '../nycMap'
import { formatClock, poolAnchorId } from '../utils'

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

export default function PoolMap({ pools, highlightId, onSelectPool, className = '' }) {
  const placed = pools
    .filter((p) => p.place?.lat != null && p.place?.lng != null && p.lead)
    .map((p) => ({ pool: p, id: poolAnchorId(p), at: projectToMap(p.place.lat, p.place.lng) }))
  const [vx, vy, vw, vh] = frame(placed.map((p) => p.at))
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
        {order.map(({ pool, id, at: [x, y] }) => {
          const tone = PIN[pool.lead.group] ?? PIN.day
          const label = pinLabel(pool)
          const on = id === highlightId
          const s = on ? 1.2 : 1
          const w = (label.length * 8 + 18) * k * s
          const h = 24 * k * s
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
            </g>
          )
        })}
      </svg>
      <ul className="absolute left-3 top-3 flex lg:bottom-3 lg:top-auto gap-3 rounded-full bg-white/95 px-3 py-1.5 text-xs text-deep-end shadow-sm ring-1 ring-line">
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
      </ul>
    </div>
  )
}
