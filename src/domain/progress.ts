import type { ComputedReminder } from './reminderEngine'
import type { MaintenanceStatus } from '../types'

// Pure helper that turns a ComputedReminder into the numbers the visual
// instruments need — the focal Gauge and the per-row BulletTrack introduced in
// the editorial-motion design system. It does NOT re-decide status (the reminder
// engine already did); it only expresses "how far through this interval are we"
// as a percentage, choosing the axis the engine itself would treat as more
// urgent. No DOM, no I/O — unit-tested in tests/progress.test.ts.

const AVG_DAYS_PER_MONTH = 30.44

export interface ReminderProgress {
  /**
   * Percent of the interval elapsed toward the due point. 100 = exactly due,
   * >100 = overdue (the bullet fill runs past the target tick), <100 = time/
   * miles still left. `null` when there is no fixed numeric target to measure
   * against (condition-based, not-applicable, or nothing logged yet).
   */
  pct: number | null
  /** Which axis the percentage came from — the more-urgent of the two. */
  axis: 'miles' | 'date' | null
  /** The engine's status, surfaced so the UI can pick the arc/fill color. */
  zone: MaintenanceStatus
}

function milesPct(r: ComputedReminder): number | null {
  const total = r.interval.miles
  if (total == null || total <= 0 || r.milesRemaining == null) return null
  return ((total - r.milesRemaining) / total) * 100
}

function datePct(r: ComputedReminder): number | null {
  const months = r.interval.months
  if (months == null || months <= 0 || r.daysRemaining == null) return null
  const totalDays = months * AVG_DAYS_PER_MONTH
  return ((totalDays - r.daysRemaining) / totalDays) * 100
}

/**
 * Progress of a reminder toward its due point. For hybrid rules (miles AND
 * months) the more-urgent axis wins — the one further along its interval —
 * matching how the engine already chose the binding constraint.
 */
export function reminderProgress(r: ComputedReminder): ReminderProgress {
  if (r.status === 'not-applicable' || r.interval.conditionBased) {
    return { pct: null, axis: null, zone: r.status }
  }
  const m = milesPct(r)
  const d = datePct(r)
  let pct: number | null = null
  let axis: 'miles' | 'date' | null = null
  if (m != null && d != null) {
    if (m >= d) { pct = m; axis = 'miles' } else { pct = d; axis = 'date' }
  } else if (m != null) {
    pct = m; axis = 'miles'
  } else if (d != null) {
    pct = d; axis = 'date'
  }
  if (pct != null && pct < 0) pct = 0
  return { pct, axis, zone: r.status }
}
