import type { MaintenanceStatus, ReminderRule } from '../types'
import { getTemplateEntry } from '../db/scheduleTemplates'

// ---------------------------------------------------------------------------
// Interval + last-done resolution — the inputs the reminders engine builds on.
// The actual due-status computation, ranking, and event-history handling live
// in domain/reminderEngine.ts. Kept separate so the template-resolution layer
// (this file) stays a small, stable dependency of the engine.
// ---------------------------------------------------------------------------

export type IntervalSource = 'custom' | 'consensus' | 'factory'

export interface ResolvedInterval {
  miles: number | null
  months: number | null
  conditionBased: boolean
  /** Which of the three tiers supplied the effective value. */
  source: IntervalSource
}

/**
 * The EFFECTIVE maintenance interval for a rule, and where it came from:
 *   custom override  ??  mechanic-consensus  ??  factory.
 * The reminder engine (M4) uses this interval; the admin view uses `source` and
 * the template to show factory-vs-consensus-vs-custom. Pure + easy to test.
 */
export function resolveInterval(rule: ReminderRule): ResolvedInterval {
  if (rule.customIntervalMiles != null || rule.customIntervalMonths != null) {
    return {
      miles: rule.customIntervalMiles,
      months: rule.customIntervalMonths,
      conditionBased: false,
      source: 'custom',
    }
  }
  const tmpl = getTemplateEntry(rule.templateKey, rule.category)
  const consensus = tmpl?.mechanicConsensusInterval
  if (consensus) {
    return {
      miles: consensus.miles,
      months: consensus.months,
      conditionBased: !!consensus.conditionBased,
      source: 'consensus',
    }
  }
  const factory = tmpl?.factoryInterval
  return {
    miles: factory?.miles ?? null,
    months: factory?.months ?? null,
    conditionBased: !!factory?.conditionBased,
    source: 'factory',
  }
}

/**
 * Effective "last done" point for a rule: the MORE RECENT (by date) of the
 * rule's cached last-completed fields (kept in sync with event history by
 * reminderEngine's applyEventToRule) and an `already-replaced` override's
 * recorded date/mileage. An override can supply pre-app history; a logged
 * event should supersede it once one exists. Pure — safe to unit test.
 */
export function resolveLastDone(rule: ReminderRule): {
  date: string | null
  miles: number | null
} {
  const fromCache =
    rule.lastDoneDate != null || rule.lastDoneMiles != null
      ? { date: rule.lastDoneDate, miles: rule.lastDoneMiles }
      : null
  const fromOverride =
    rule.override?.kind === 'already-replaced'
      ? { date: rule.override.atDate, miles: rule.override.atMiles }
      : null

  if (fromCache && fromOverride) {
    if (fromCache.date && fromOverride.date) {
      return fromCache.date >= fromOverride.date ? fromCache : fromOverride
    }
    return fromCache.date ? fromCache : fromOverride
  }
  return fromCache ?? fromOverride ?? { date: null, miles: null }
}

/** A rule the user has marked as not applicable to this vehicle. */
export function isNotApplicable(rule: ReminderRule): boolean {
  return rule.override?.kind === 'not-needed'
}

// Re-export so UI code can import the status vocabulary from one place.
export type { MaintenanceStatus }
