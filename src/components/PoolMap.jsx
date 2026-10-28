import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { NYC_MAP, projectToMap } from '../nycMap'
import { formatClock, poolAnchorId, shortPoolName } from '../utils'

// The mockup's map pane. A flat SVG drawn from NYC Open Data borough outlines
// (scripts/make_map.py), so there are no tiles, no third-party requests and it
// works offline. No street detail — directions are a link away on each pool
// page.
//
// It always covers the whole city: every pool is on it whatever borough the
// list is filtered to. The borough only decides where it starts (`focus`);
// drag to pan, wheel or pinch to zoom, or use the buttons, to reach St.
// John's or Flushing from a Manhattan view. Pins carry the card's lead time
// ("6:30", or "Now") in the card's colours. Hovering or focusing a card
// highlights its pin; clicking a pin selects the card (App scrolls to it and
// opens it).

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
const MIN_W = 320 // the starting frame never zooms in further than this
const ZOOM_MIN_W = 110 // how far the reader can zoom in
const ZOOM_MAX_W = 1300 // ...and out
const SLACK = 250 // how far past the drawn map the view may pan

function pinLabel(pool) {
  if (pool.lead.group === 'on') return 'Now'
  return formatClock(pool.lead.lead.window.start).replace(/ (am|pm)$/, '')
}

// A view box around the pins, padded, at least MIN_W wide, at the pane's
// aspect (height / width, so nothing is letterboxed), and kept inside the
// drawn map.
function frame(points, ASPECT) {
  const { width, height } = NYC_MAP
  if (!points.length) points = [[0, 0], [width, height]]
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
  // Kept inside the drawn map where it fits; centred on the pins where it
  // doesn't (a tall phone showing the whole city is taller than the map).
  x0 = w >= width ? cx - w / 2 : Math.min(Math.max(cx - w / 2, 0), width - w)
  y0 = h >= height ? cy - h / 2 : Math.min(Math.max(cy - h / 2, 0), height - h)
  return [x0, y0, w, h]
}

// `caption` names what the pins' times are for ("Lap swim · Thursday, Oct 29"),
// since a bare "6:30" means nothing without the activity and day.
export default function PoolMap({
  pools,
  focus = null,
  closed = [],
  idle = [],
  idleLabel = 'none today',
  caption,
  highlightId,
  onSelectPool,
  you = null,
  youLabel = 'YOU',
  className = '',
}) {
  const placed = pools
    .filter((p) => p.place?.lat != null && p.place?.lng != null && p.lead)
    .map((p) => ({ pool: p, id: poolAnchorId(p), at: projectToMap(p.place.lat, p.place.lng) }))
  // Secondary markers: closed pools, and open pools with nothing matching the
  // filters ("Asser Levy · no lap swim"). Every pool is on the map, as every
  // pool is on the page — a missing pin reads as a missing pool.
  const shut = [
    ...closed.map((p) => ({ pool: p, kind: 'closed' })),
    ...idle.map((p) => ({ pool: p, kind: 'idle' })),
  ]
    .filter(({ pool: p }) => p.place?.lat != null && p.place?.lng != null)
    .map((m) => ({ ...m, id: poolAnchorId(m.pool), at: projectToMap(m.pool.place.lat, m.pool.place.lng) }))
  const youAt = you ? projectToMap(you.lat, you.lng) : null
  // Frame the reader and the closed pools too, so nothing listed is off the edge.
  // The pane's size, so the view matches its shape (a tall phone screen gets a
  // tall view, not a letterboxed square) and pins can be sized in pixels.
  const boxRef = useRef(null)
  const [size, setSize] = useState({ w: 600, h: 660 })
  useEffect(() => {
    const el = boxRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const aspect = size.h / size.w

  // Where it starts: the focused borough's pools (or everything), and "You".
  const all = [...placed, ...shut]
  const focusPts = [
    ...(focus ? all.filter((m) => focus.includes(m.id)) : all).map((m) => m.at),
    ...(youAt ? [youAt] : []),
  ]
  const fit = frame(focusPts, aspect)
  const whole = frame([...all.map((m) => m.at), ...(youAt ? [youAt] : [])], aspect)
  const fitKey = fit.map((v) => Math.round(v)).join(',')

  // The reader's pan/zoom, reset whenever the starting frame changes (a new
  // borough, a ZIP, the pane resizing).
  const [view, setView] = useState(null)
  useEffect(() => setView(null), [fitKey])
  const [vx, vy, vw, vh] = view ?? fit
  // View box units per screen pixel. Pins and labels are drawn in multiples of
  // it, so they stay the same size on screen however far it zooms.
  const k = vw / size.w

  const clamp = useCallback(
    ([x, y, w]) => {
      const cw = Math.min(Math.max(w, ZOOM_MIN_W), ZOOM_MAX_W)
      const ch = cw * aspect
      return [
        Math.min(Math.max(x, -SLACK), NYC_MAP.width + SLACK - cw),
        Math.min(Math.max(y, -SLACK), NYC_MAP.height + SLACK - ch),
        cw,
        ch,
      ]
    },
    [aspect],
  )
  // The live view, updated synchronously as well as through state, so a burst
  // of pointer moves between renders each builds on the last.
  const current = useRef([vx, vy, vw, vh])
  current.current = [vx, vy, vw, vh]
  const apply = useCallback((v) => {
    current.current = v
    setView(v)
  }, [])

  // Zoom by `f` (<1 zooms in) about a point given in screen pixels within the
  // pane; the centre when none is given.
  const zoomAt = useCallback(
    (f, px = size.w / 2, py = size.h / 2) => {
      const [x, y, w] = current.current
      const ux = x + (px / size.w) * w
      const uy = y + (py / size.w) * w
      const nw = Math.min(Math.max(w * f, ZOOM_MIN_W), ZOOM_MAX_W)
      const r = nw / w
      apply(clamp([ux - (ux - x) * r, uy - (uy - y) * r, nw]))
    },
    [apply, clamp, size],
  )

  // Pointer drag pans; two pointers pinch-zoom. `moved` swallows the click that
  // ends a drag, so dragging across a pin doesn't select it.
  const svgRef = useRef(null)
  const drag = useRef({ pts: new Map(), moved: false, dist: 0 })
  const onPointerDown = (e) => {
    drag.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    drag.current.moved = false
    if (drag.current.pts.size === 2) {
      const [a, b] = [...drag.current.pts.values()]
      drag.current.dist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }
  useEffect(() => {
    const move = (e) => {
      const d = drag.current
      const prev = d.pts.get(e.pointerId)
      if (!prev) return
      const box = svgRef.current?.getBoundingClientRect()
      if (!box) return
      if (d.pts.size === 1) {
        const dx = e.clientX - prev.x
        const dy = e.clientY - prev.y
        if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
        if (d.moved) {
          const [x, y, w] = current.current
          const upp = w / box.width
          apply(clamp([x - dx * upp, y - dy * upp, w]))
        }
      } else if (d.pts.size === 2) {
        d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const [a, b] = [...d.pts.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (d.dist > 0 && dist > 0) {
          d.moved = true
          zoomAt(d.dist / dist, (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top)
        }
        d.dist = dist
        return
      }
      d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const up = (e) => {
      drag.current.pts.delete(e.pointerId)
      drag.current.dist = 0
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [apply, clamp, zoomAt])
  // Wheel / trackpad zoom, about the cursor. Non-passive so the page doesn't
  // scroll underneath.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const wheel = (e) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [zoomAt])
  const select = (id) => {
    if (!drag.current.moved) onSelectPool(id)
  }

  // Highlighted pin drawn last, so it sits on top of its neighbours.
  const order = [...placed].sort((a, b) => (a.id === highlightId) - (b.id === highlightId))

  return (
    <div ref={boxRef} className={`relative overflow-hidden bg-[#c9ebf6] ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        style={{ touchAction: 'none' }}
        className="block h-full w-full cursor-grab select-none active:cursor-grabbing"
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
        {shut.map(({ pool, kind, id, at: [x, y] }) => {
          const works = kind === 'closed' && isWorks(pool)
          const name = shortPoolName(pool)
          const suffix = kind === 'closed' ? 'closed' : idleLabel
          const nameW = (name.length + suffix.length + 3) * 6.2 * k
          // Flip left at the frame's edge, or when an open pin (which wins the
          // space) sits where the label would run — Hansborough, just west of
          // St. Mary's.
          // Open pins and the "You"/ZIP dot both count as in the way.
          const others = [...placed.map((p) => p.at), ...(youAt ? [youAt] : [])]
          const near = (side) =>
            others.some(
              ([px, py]) =>
                (side > 0 ? px > x : px < x) &&
                Math.abs(px - x) < nameW + 40 * k &&
                Math.abs(py - y) < 34 * k,
            )
          const rightOk = x + 12 * k + nameW <= vx + vw && !near(1)
          const leftOk = x - 13 * k - nameW > vx && !near(-1)
          // Right by default, else left, else under the icon.
          const side = rightOk ? 'right' : leftOk ? 'left' : 'below'
          return (
            <g
              key={id}
              role="button"
              tabIndex={0}
              aria-label={
                kind === 'closed'
                  ? `${pool.pool_name}: closed${pool.closure_reason ? ` ${pool.closure_reason}` : ''}`
                  : `${pool.pool_name}: ${idleLabel}`
              }
              onClick={() => select(id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectPool(id)}
              className="cursor-pointer focus:outline-none"
            >
              {kind === 'closed' ? (
                <>
                  <circle cx={x} cy={y} r={10 * k} fill="#fff" stroke="#dce4ec" strokeWidth={1.2 * k} />
                  <g transform={`translate(${x} ${y})`}>
                    <ClosedIcon works={works} k={k} />
                  </g>
                </>
              ) : (
                <circle cx={x} cy={y} r={5.5 * k} fill="#fff" stroke="#8a9bb0" strokeWidth={2 * k} />
              )}
              <text
                x={
                  side === 'right'
                    ? x + 13 * k
                    : side === 'left'
                      ? x - 13 * k
                      : // Under the icon, nudged inside the frame at either edge.
                        Math.min(Math.max(x - nameW / 2, vx + 4 * k), vx + vw - nameW - 4 * k)
                }
                y={side === 'below' ? y + 20 * k : y}
                dominantBaseline="central"
                textAnchor={side === 'left' ? 'end' : 'start'}
                fontSize={11 * k}
                fontWeight="600"
                fill="#5a6e85"
                stroke="#f4f7fa"
                strokeWidth={3.5 * k}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {name} · {suffix}
              </text>
            </g>
          )
        })}
        {youAt && (
          <g aria-label={youLabel === 'YOU' ? 'Your location' : `Centre of ZIP ${youLabel}`}>
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
              x={youAt[0]}
              y={youAt[1] - 17 * k}
              dominantBaseline="central"
              textAnchor="middle"
              stroke="#f4f7fa"
              strokeWidth={3.5 * k}
              strokeLinejoin="round"
              paintOrder="stroke"
              fontSize={11 * k}
              fontWeight="700"
              letterSpacing={1 * k}
              fill="#1668e3"
            >
              {youLabel}
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
              onClick={() => select(id)}
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
      <div className="absolute bottom-24 right-3 flex flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-line lg:bottom-3">
        <button
          type="button"
          onClick={() => zoomAt(0.7)}
          aria-label="Zoom in"
          className="p-2 text-deep-end hover:bg-deck"
        >
          <Plus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => zoomAt(1 / 0.7)}
          aria-label="Zoom out"
          className="border-t border-line p-2 text-deep-end hover:bg-deck"
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => apply(whole)}
          aria-label="Show the whole city"
          title="Whole city"
          className="border-t border-line p-2 text-deep-end hover:bg-deck"
        >
          <Maximize2 size={16} aria-hidden="true" />
        </button>
      </div>
      {caption && (
        <p className="absolute left-3 right-3 top-3 w-fit rounded-full bg-deep-end px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
          {caption}
        </p>
      )}
      <ul className="absolute left-3 right-3 top-12 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap gap-x-3 gap-y-1 rounded-2xl bg-white/95 px-3 py-1.5 text-xs text-deep-end shadow-sm ring-1 ring-line lg:bottom-3 lg:top-auto [&>li]:whitespace-nowrap">
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
        {shut.some((p) => p.kind === 'idle') && (
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-[#8a9bb0] bg-white" aria-hidden="true" />
            {idleLabel.charAt(0).toUpperCase() + idleLabel.slice(1)}
          </li>
        )}
        {shut.some((p) => p.kind === 'closed' && !isWorks(p.pool)) && (
          <li className="flex items-center gap-1.5">
            <svg viewBox="-7 -7 14 14" className="size-3" aria-hidden="true">
              <ClosedIcon works={false} k={1} />
            </svg>
            Closed
          </li>
        )}
        {shut.some((p) => p.kind === 'closed' && isWorks(p.pool)) && (
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
