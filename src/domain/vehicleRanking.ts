import type { ComputedReminder } from './reminderEngine'

// ---------------------------------------------------------------------------
// Cross-vehicle ranking — a small, PURE layer on top of the reminders engine.
// It never recomputes a reminder; it only counts/compares the engine's output
// so the dashboard can decide which vehicle needs attention first. Deterministic
// and framework-free, so it's trivially unit-testable.
// ---------------------------------------------------------------------------

export interface ReminderCounts {
  overdue: number
  dueNext: number
  watchNext: number
  completed: number
  notApplicable: number
}

export function countByStatus(reminders: ComputedReminder[]): ReminderCounts {
  const c: ReminderCounts = { overdue: 0, dueNext: 0, watchNext: 0, completed: 0, notApplicable: 0 }
  for (const r of reminders) {
    if (r.status === 'overdue') c.overdue++
    else if (r.status === 'due-next') c.dueNext++
    else if (r.status === 'watch-next') c.watchNext++
    else if (r.status === 'completed') c.completed++
    else if (r.status === 'not-applicable') c.notApplicable++
  }
  return c
}

/** A single repair counts as "recent high-cost" if it cost at least this much
 *  and was logged within RECENT_REPAIR_DAYS. */
export const HIGH_COST_REPAIR = 300
export const RECENT_REPAIR_DAYS = 90
/** A vehicle with no logged activity for this long gets a small nudge up the
 *  ranking (as a low-priority tiebreak) — it may simply be neglected. */
export const STALE_UPDATE_DAYS = 60

export interface VehicleUrgency {
  counts: ReminderCounts
  odometerStale: boolean
  /** Highest single repair cost logged within RECENT_REPAIR_DAYS; 0 if none. */
  recentRepairCost: number
  /** Days since the most recent logged activity; null if nothing logged yet. */
  daysSinceLastActivity: number | null
}

// null (never logged) is treated as maximally stale so untouched vehicles bubble
// up. Kept as its own function so the ±Infinity math can't produce a NaN inside
// the comparator's `||` chain (NaN is falsy and would be silently skipped).
function recencyCompare(a: number | null, b: number | null): number {
  const da = a == null ? Number.POSITIVE_INFINITY : a
  const dbv = b == null ? Number.POSITIVE_INFINITY : b
  if (da === dbv) return 0
  return dbv - da // more days since activity ranks first (more neglected)
}

/**
 * Lexicographic urgency comparator: returns < 0 if `a` should rank BEFORE `b`
 * (needs attention first). It compares ONE factor at a time in strict priority
 * order, only moving on when a factor ties — which is what makes the ranking
 * both deterministic and easy to explain in a sentence. Priority order:
 *   1. overdue count      2. due-next count     3. watch-next count
 *   4. stale odometer     5. recent repair cost 6. neglect (days since activity)
 * Because urgency counts come first, any vehicle with an overdue item always
 * outranks one whose worst item is only watch-next, regardless of the rest.
 */
export function compareVehicleUrgency(a: VehicleUrgency, b: VehicleUrgency): number {
  return (
    b.counts.overdue - a.counts.overdue ||
    b.counts.dueNext - a.counts.dueNext ||
    b.counts.watchNext - a.counts.watchNext ||
    (a.odometerStale === b.odometerStale ? 0 : a.odometerStale ? -1 : 1) ||
    b.recentRepairCost - a.recentRepairCost ||
    recencyCompare(a.daysSinceLastActivity, b.daysSinceLastActivity)
  )
}

export type BadgeTone = 'overdue' | 'due' | 'watch' | 'stale' | 'cost' | 'ok'
export interface AttentionBadge {
  label: string
  tone: BadgeTone
}

/** Short chips that explain, at a glance, why a vehicle is ranked where it is. */
export function vehicleBadges(u: VehicleUrgency): AttentionBadge[] {
  const badges: AttentionBadge[] = []
  if (u.counts.overdue) badges.push({ label: `${u.counts.overdue} overdue`, tone: 'overdue' })
  if (u.counts.dueNext) badges.push({ label: `${u.counts.dueNext} due next`, tone: 'due' })
  if (u.counts.watchNext) badges.push({ label: `${u.counts.watchNext} watch`, tone: 'watch' })
  if (u.odometerStale) badges.push({ label: 'stale mileage', tone: 'stale' })
  if (u.recentRepairCost >= HIGH_COST_REPAIR) {
    badges.push({ label: `recent $${Math.round(u.recentRepairCost)} repair`, tone: 'cost' })
  }
  if (!badges.length) badges.push({ label: 'on track', tone: 'ok' })
  return badges
}
