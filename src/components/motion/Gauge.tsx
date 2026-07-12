import { useEffect, useRef, useState } from 'preact/hooks'

// Focal threshold gauge — the hero instrument on VehicleDetail (and the
// dashboard). A seamless three-zone band (olive → ochre → brick — this app's
// green/amber/red) the needle points into, a sharp tick marking the 100%-due
// boundary, and a tapered needle whose color matches the zone it's in. On
// first view the needle sweeps up from rest (rAF — CSS can't animate SVG
// geometry). A null pct (condition-based / not-applicable / never logged)
// draws the band + tick with no needle — never an empty dial.

const CX = 50
const CY = 50
const R = 35
const BAND_W = 7
const NEEDLE_LEN = 33
const START = -80 // angle (deg) at 0%
const AMBER_AT = 85 // pct where the band turns from green to amber
const RED_AT = 100 // the "due" boundary — also where the tick sits
const MAX_PCT = 125 // dial caps here; further overdue still reads as "past the end"

const GREEN = '#5e6b34' // olive
const AMBER = '#c58327' // ochre
const RED = '#a83232' // brick

// 0–100% spreads across the -80°..82° sweep; past 100% the needle (and the red
// zone) continue into a compressed tail so "overdue" reads distinctly further.
function angleFor(pct: number): number {
  const p = Math.max(0, Math.min(pct, MAX_PCT))
  if (p <= RED_AT) return START + p * 1.62
  return 82 + ((p - RED_AT) / (MAX_PCT - RED_AT)) * 8 // 100–125% → 82°..90°
}
const A0 = START
const A_AMBER = angleFor(AMBER_AT)
const A_RED = angleFor(RED_AT)
const A_END = angleFor(MAX_PCT)

function zoneColor(pct: number): string {
  if (pct >= RED_AT) return RED
  if (pct >= AMBER_AT) return AMBER
  return GREEN
}

function polar(angleDeg: number, r: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
}
function arcPath(a0: number, a1: number, r: number): string {
  const [x0, y0] = polar(a0, r)
  const [x1, y1] = polar(a1, r)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

export function Gauge({
  pct,
  animate = false,
  reduced = false,
  ariaLabel,
}: {
  pct: number | null
  animate?: boolean
  reduced?: boolean
  ariaLabel?: string
}) {
  const hasData = pct !== null
  const target = hasData ? angleFor(pct as number) : START
  const [angle, setAngle] = useState(() => (reduced || !animate ? target : START))
  const rafRef = useRef(0)
  useEffect(() => {
    if (!hasData) return
    if (reduced || !animate) {
      setAngle(target)
      return
    }
    const from = START
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      const eased = 1 - Math.pow(1 - t, 3)
      setAngle(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, animate, reduced, hasData])

  const [tx0, ty0] = polar(A_RED, R - BAND_W / 2 - 1.5)
  const [tx1, ty1] = polar(A_RED, R + BAND_W / 2 + 3)
  const [nx, ny] = polar(angle, NEEDLE_LEN)
  const [e0x, e0y] = polar(A0, R)
  const [e1x, e1y] = polar(A_END, R)

  return (
    <svg class="gauge" viewBox="0 0 100 58" role="img" aria-label={ariaLabel} style="overflow:visible">
      <g style="filter:drop-shadow(0 1px 1.5px rgba(42,39,31,.16))">
        {/* seamless three-zone band — butt-cap segments sharing exact endpoints,
            with a rounded cap circle at each outer end only */}
        <path d={arcPath(A0, A_AMBER, R)} fill="none" stroke={GREEN} stroke-width={BAND_W} />
        <path d={arcPath(A_AMBER, A_RED, R)} fill="none" stroke={AMBER} stroke-width={BAND_W} />
        <path d={arcPath(A_RED, A_END, R)} fill="none" stroke={RED} stroke-width={BAND_W} />
        <circle cx={e0x} cy={e0y} r={BAND_W / 2} fill={GREEN} />
        <circle cx={e1x} cy={e1y} r={BAND_W / 2} fill={RED} />
      </g>
      {/* 100%-due tick, crossing the amber/red boundary */}
      <line x1={tx0.toFixed(2)} y1={ty0.toFixed(2)} x2={tx1.toFixed(2)} y2={ty1.toFixed(2)} stroke="var(--text)" stroke-width="1.5" opacity="0.75" />
      {/* needle (color = current zone) */}
      {hasData && (
        <line
          x1={CX}
          y1={CY}
          x2={nx.toFixed(2)}
          y2={ny.toFixed(2)}
          stroke={zoneColor(pct as number)}
          stroke-width="2.5"
          stroke-linecap="round"
        />
      )}
      {/* mechanical hub */}
      <circle cx={CX} cy={CY} r="3.5" fill="var(--text)" />
      <circle cx={CX} cy={CY} r="1" fill="var(--bg)" />
    </svg>
  )
}
