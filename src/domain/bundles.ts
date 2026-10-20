import { urgencyValue, type ComputedReminder } from './reminderEngine'
import { knownReminders } from './verdict'
import type { MaintenanceCategory } from '../types'

/** Quick jobs a shop can normally complete during an oil-change visit. */
export const SAME_VISIT: ReadonlySet<MaintenanceCategory> = new Set([
  'oil-change', 'tire-rotation', 'tire-inspection', 'tire-balancing',
  'engine-air-filter', 'cabin-air-filter', 'wiper-blades', 'multi-point-inspection',
  'battery-check', 'brake-inspection',
])
/** About 2,000 mi at the engine's 12k/yr, on the same urgencyValue scale. */
export const BUNDLE_WINDOW_DAYS = 60

/** Same-visit jobs due within BUNDLE_WINDOW_DAYS of the most urgent one, in
 * engine order, max 5. Empty unless at least 2 qualify. Fluid flushes, plugs,
 * belts, alignment and new tires stay out: bigger jobs, own visit. */
export function visitBundle(reminders: ComputedReminder[]): ComputedReminder[] {
  const candidates = knownReminders(reminders)
    .filter((r) => ['overdue', 'due-next', 'watch-next'].includes(r.status) && SAME_VISIT.has(r.rule.category) && Number.isFinite(urgencyValue(r)))
    .sort((a, b) => urgencyValue(a) - urgencyValue(b))
  const anchor = candidates[0]
  if (!anchor) return []
  const bundle = candidates.filter((r) => urgencyValue(r) <= urgencyValue(anchor) + BUNDLE_WINDOW_DAYS).slice(0, 5)
  return bundle.length >= 2 ? bundle : []
}
