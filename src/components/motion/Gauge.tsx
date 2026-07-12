import { useEffect, useRef, useState } from 'preact/hooks'

// Focal threshold gauge — the hero instrument on VehicleDetail (and the
// dashboard). A thin "workshop" hairline track, a sharp tick at the 100%-due
// mark, and a single tapered needle whose COLOR carries the status
// (olive → ochre → brick). Minimal and mechanical, not a chunky tachometer.
// On first view the needle sweeps up from rest (rAF — CSS can't animate SVG
// geometry). A null pct (condition-based / not-applicable / never logged)
// draws the track + tick with no needle.

const CX = 50
const CY = 50
const R = 35
const NEEDLE_LEN = 32
const START = -80 // needle angle (deg) at 0%

// 0–100% spreads across the -80°..82° sweep; past 100% the needle pushes just
// beyond the redline tick so "overdue" reads distinctly from "due".
function needleAngle(pct: number): number {
  const p = Math.max(0, pct)
  if (p <= 100) return START + p * 1.62
  return 82 + ((Math.min(p, 125) - 100) / 25) * 8 // 100–125% → 82°..90°
}
const TICK_ANGLE = START + 100 * 1.62 // 82° — the "due" mark

function needleColor(pct: number): string {
  if (pct >= 100) return '#a83232' // brick
  if (pct >= 85) return '#c58327' // ochre
  return '#5e6b34' // olive
}

function polar(angleDeg: number, r: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)]
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
  const target = hasData ? needleAngle(pct as number) : START
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

  const [tx0, ty0] = polar(TICK_ANGLE, R)
  const [tx1, ty1] = polar(TICK_ANGLE, R + 5)
  const [nx, ny] = polar(angle, NEEDLE_LEN)

  return (
    <svg class="gauge" viewBox="0 0 100 56" role="img" aria-label={ariaLabel} style="overflow:visible">
      {/* hairline track */}
      <path d="M15 50 A35 35 0 0 1 85 50" fill="none" stroke="var(--bg-inset)" stroke-width="3" stroke-linecap="round" />
      {/* 100%-due tick */}
      <line x1={tx0.toFixed(2)} y1={ty0.toFixed(2)} x2={tx1.toFixed(2)} y2={ty1.toFixed(2)} stroke="var(--text)" stroke-width="1.5" />
      {/* needle (color = status) */}
      {hasData && (
        <line
          x1={CX}
          y1={CY}
          x2={nx.toFixed(2)}
          y2={ny.toFixed(2)}
          stroke={needleColor(pct as number)}
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
