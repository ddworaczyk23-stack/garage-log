import { useEffect, useState } from 'preact/hooks'
import type { MaintenanceStatus } from '../../types'

// Progress-vs-target bar under a schedule row. The track carries the three
// threshold zones; the fill's width is the percent-of-interval (mapped so the
// due point sits at the 82% tick and an overdue item fills past it), colored by
// the reminder's status. Renders nothing when there is no numeric target.

const ZONE_CLASS: Partial<Record<MaintenanceStatus, string>> = {
  overdue: 'z-overdue',
  'due-next': 'z-due',
  'watch-next': 'z-watch',
  completed: 'z-ok',
}

export function BulletTrack({
  pct,
  zone,
  animate = false,
  reduced = false,
}: {
  pct: number | null
  zone: MaintenanceStatus
  animate?: boolean
  reduced?: boolean
}) {
  const targetW = pct == null ? 0 : (Math.min(pct, 122) / 122) * 100
  const [w, setW] = useState(reduced || !animate ? targetW : 0)
  useEffect(() => {
    if (reduced || !animate) {
      setW(targetW)
      return
    }
    // next frame so the width transition runs from 0 → target
    const id = requestAnimationFrame(() => setW(targetW))
    return () => cancelAnimationFrame(id)
  }, [targetW, animate, reduced])

  if (pct == null) return null
  return (
    <div class="bullet" aria-hidden="true">
      <div class="bullet-track">
        <span class={`bullet-fill ${ZONE_CLASS[zone] ?? 'z-ok'}`} style={`width:${w}%`} />
      </div>
      <i class="bullet-tick" style="left:82%" />
    </div>
  )
}
