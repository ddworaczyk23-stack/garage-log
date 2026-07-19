import { effectiveCategories, type MaintenanceEvent, type MaintenanceStatus, type ReminderRule } from '../types'
import {
  resolveInterval,
  resolveLastDone,
  isNotApplicable,
  type ResolvedInterval,
} from './reminderStatus'
import { projectDueDate } from './mileage'
import { localDateISO } from './format'

// ---------------------------------------------------------------------------
// Pure reminders engine: turns a ReminderRule (template-resolved interval +
// any manual override) plus real-world inputs (current odometer, today's
// date) into a personalized due-status. No DOM, no Dexie, no I/O — everything
// here is a plain function over plain data, so it's cheap to unit test.
//
// Status vocabulary reuses the 5 states already defined in types.ts
// (MaintenanceStatus). The two closeness tiers each map to a pair of the terms
// requested for this milestone:
//   'watch-next' <- "watch next" / "due soon"  (outer heads-up window)
//   'due-next'   <- "due next"   / "due now"   (inner, about-to-be-due window)
// Kept as one 5-state enum rather than 7 near-synonyms so the ranking logic
// stays simple (one ordered ladder) — see STATUS_LABELS in types.ts for the
// user-facing copy.
// ---------------------------------------------------------------------------

/** Inner lead window: within this many mi/days of due -> 'due-next'. */
export const DUE_LEAD_MILES = 500
export const DUE_LEAD_DAYS = 30

/** Outer lead window: within this many mi/days of due -> 'watch-next'. */
export const WATCH_LEAD_MILES = 1500
export const WATCH_LEAD_DAYS = 90

/** An odometer reading older than this many days is flagged as stale. */
export const STALE_ODOMETER_DAYS = 45

/**
 * Assumed annual mileage, used ONLY to convert a mileage-remaining figure into
 * an equivalent day count so mixed mileage-based and date-based reminders can
 * be ranked on one urgency axis (see rankReminders). It does not affect status
 * computation, which always compares each axis to its own threshold.
 */
export const DEFAULT_ANNUAL_MILEAGE = 12000

export interface ReminderInputs {
  /** Best current odometer estimate for the vehicle (latest reading/event). */
  currentMiles: number | null
  /** ISO date the `currentMiles` estimate was taken, for staleness checks. */
  odometerAsOfDate: string | null
  /** Evaluation date — pass a fixed Date in tests for determinism. */
  asOf: Date
  /** Effective average miles/year for date projection; defaults to
   * DEFAULT_ANNUAL_MILEAGE when omitted. Does NOT affect due-status. */
  annualMileage?: number
}

export interface ComputedReminder {
  rule: ReminderRule
  status: MaintenanceStatus
  interval: ResolvedInterval
  lastDone: { date: string | null; miles: number | null }
  dueAtMiles: number | null
  dueAtDate: string | null
  milesRemaining: number | null
  daysRemaining: number | null
  /** True when the odometer estimate is missing or older than STALE_ODOMETER_DAYS. */
  odometerStale: boolean
  /** Estimated calendar date a mileage-based item comes due, projected from the
   * effective average miles/year. Informational (does not drive status); null
   * for date-based, condition-based, already-due, or unprojectable items. */
  projectedDueDate?: string | null
  reason: string
}

function toDateOnly(d: Date): string {
  return localDateISO(d)
}

function parseDateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/**
 * Adds `months` to an ISO date, clamping into the target month's last day
 * instead of overflowing into the month after (native `setMonth` on day
 * 29-31 rolls e.g. 2026-01-31 + 1mo into 2026-03-03, not Feb 28).
 */
function addMonths(iso: string, months: number): string {
  const d = parseDateOnly(iso)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDayOfTargetMonth))
  return toDateOnly(target)
}

function daysBetween(a: Date, isoB: string): number {
  const MS_PER_DAY = 86_400_000
  return Math.round((parseDateOnly(isoB).getTime() - a.getTime()) / MS_PER_DAY)
}

/** Classify a single axis's remaining amount against its lead thresholds. */
function classify(
  remaining: number,
  dueLead: number,
  watchLead: number,
): Exclude<MaintenanceStatus, 'not-applicable'> {
  if (remaining <= 0) return 'overdue'
  if (remaining <= dueLead) return 'due-next'
  if (remaining <= watchLead) return 'watch-next'
  return 'completed'
}

/** Urgency ordering: lower index = more urgent. Used to combine axes/rank. */
const TIER_ORDER: MaintenanceStatus[] = [
  'overdue',
  'due-next',
  'watch-next',
  'completed',
  'not-applicable',
]

function moreUrgent(a: MaintenanceStatus, b: MaintenanceStatus): MaintenanceStatus {
  return TIER_ORDER.indexOf(a) <= TIER_ORDER.indexOf(b) ? a : b
}

/** True if the event (same vehicle) covers the rule's category — either as its
 * primary category or one of its additionalCategories. So a single multi-service
 * visit updates every rule it touched, not just the primary one. */
export function matchesRule(event: MaintenanceEvent, rule: ReminderRule): boolean {
  return event.vehicleId === rule.vehicleId && effectiveCategories(event).includes(rule.category)
}

/** The most recent logged event matching a rule, or null if none exist yet. */
export function latestMatchingEvent(
  events: MaintenanceEvent[],
  rule: ReminderRule,
): MaintenanceEvent | null {
  let latest: MaintenanceEvent | null = null
  for (const e of events) {
    if (!matchesRule(e, rule)) continue
    if (!latest || e.date > latest.date) latest = e
  }
  return latest
}

/**
 * How a newly logged event should update a rule's cached "last completed"
 * fields. Returns the unchanged values if the event is not newer than what's
 * already cached (so an out-of-order/backdated import can't regress the due
 * calculation) or doesn't match the rule's category. Pure — the caller is
 * responsible for persisting the result; this never touches the DB or the
 * static schedule template.
 */
export function applyEventToRule(
  rule: ReminderRule,
  event: MaintenanceEvent,
): Pick<ReminderRule, 'lastDoneDate' | 'lastDoneMiles'> {
  if (!matchesRule(event, rule)) {
    return { lastDoneDate: rule.lastDoneDate, lastDoneMiles: rule.lastDoneMiles }
  }
  if (rule.lastDoneDate != null && rule.lastDoneDate >= event.date) {
    return { lastDoneDate: rule.lastDoneDate, lastDoneMiles: rule.lastDoneMiles }
  }
  return { lastDoneDate: event.date, lastDoneMiles: event.odometerMiles }
}

/**
 * Compute the personalized due-status for one rule. Pure: same inputs always
 * produce the same output, no reads from Dexie or the template beyond
 * resolveInterval/resolveLastDone (both pure). Assumes `rule` already reflects
 * any completed event history — see applyEventToRule / computeVehicleReminders.
 */
export function computeReminder(rule: ReminderRule, inputs: ReminderInputs): ComputedReminder {
  const interval = resolveInterval(rule)
  const lastDone = resolveLastDone(rule)

  const odometerStale =
    inputs.currentMiles == null ||
    inputs.odometerAsOfDate == null ||
    daysBetween(parseDateOnly(inputs.odometerAsOfDate), toDateOnly(inputs.asOf)) > STALE_ODOMETER_DAYS

  // Manual override: not applicable to this vehicle short-circuits everything.
  if (isNotApplicable(rule)) {
    return {
      rule,
      status: 'not-applicable',
      interval,
      lastDone,
      dueAtMiles: null,
      dueAtDate: null,
      milesRemaining: null,
      daysRemaining: null,
      odometerStale,
      reason: 'Marked not needed for this vehicle.',
    }
  }

  const neverServiced = lastDone.date == null && lastDone.miles == null

  // Condition-based items (e.g. wheel alignment) have no fixed due point —
  // they're inspected/replaced by observed condition, never "overdue".
  if (interval.conditionBased) {
    return {
      rule,
      status: neverServiced ? 'watch-next' : 'completed',
      interval,
      lastDone,
      dueAtMiles: null,
      dueAtDate: null,
      milesRemaining: null,
      daysRemaining: null,
      odometerStale,
      reason: neverServiced
        ? 'Condition-based — inspect periodically; nothing logged yet.'
        : `Condition-based — last checked ${lastDone.date ?? 'at ' + lastDone.miles?.toLocaleString() + ' mi'}.`,
    }
  }

  // Never serviced: there's no logged last-done to anchor a due point. Rather
  // than blanket-flag it 'due-next' (which surfaced far-future items — e.g. a
  // 105k-mi service on a 70k-mi vehicle — as if they were due now), PROJECT the
  // next occurrence from the factory/consensus mileage interval as if the item
  // were kept on schedule from new: the next interval boundary at or after the
  // current odometer. That projection is always ahead of the current mileage,
  // so a never-serviced item is never 'overdue' and a genuinely-future one
  // reads as watch-next/completed (upcoming), not due now. Items we can't
  // project (no mileage interval, or no odometer reading) fall back to a gentle
  // 'watch-next' nudge — never an alarming 'overdue'/'due-next'.
  if (neverServiced) {
    const canProjectMiles = interval.miles != null && inputs.currentMiles != null
    const projectedDueMiles = canProjectMiles
      ? (Math.floor(inputs.currentMiles! / interval.miles!) + 1) * interval.miles!
      : null
    const projMilesRemaining =
      projectedDueMiles != null && inputs.currentMiles != null
        ? projectedDueMiles - inputs.currentMiles
        : null
    // classify() never returns 'overdue' here since projMilesRemaining > 0.
    // It CAN return 'completed' for a far-out projection, but 'completed'
    // means "this was done" — never true for an item with no logged history.
    // Clamp that case to 'watch-next' so a never-serviced item can never
    // read as done, however comfortably far its projection sits.
    const projStatus: MaintenanceStatus =
      projMilesRemaining != null
        ? classify(projMilesRemaining, DUE_LEAD_MILES, WATCH_LEAD_MILES)
        : 'watch-next'
    const status: MaintenanceStatus = projStatus === 'completed' ? 'watch-next' : projStatus
    return {
      rule,
      status,
      interval,
      lastDone,
      dueAtMiles: projectedDueMiles,
      dueAtDate: null,
      milesRemaining: projMilesRemaining,
      daysRemaining: null,
      odometerStale,
      projectedDueDate: projectDueDate(
        projMilesRemaining,
        inputs.annualMileage ?? DEFAULT_ANNUAL_MILEAGE,
        inputs.asOf,
      ),
      reason:
        projectedDueMiles != null
          ? `No history yet — projected next at ~${projectedDueMiles.toLocaleString()} mi from the factory schedule. Log your last service to personalize.`
          : 'No history yet — log a service to start tracking this item.',
    }
  }

  const dueAtMiles =
    interval.miles != null && lastDone.miles != null ? lastDone.miles + interval.miles : null
  const dueAtDate =
    interval.months != null && lastDone.date != null
      ? addMonths(lastDone.date, interval.months)
      : null

  const milesRemaining =
    dueAtMiles != null && inputs.currentMiles != null ? dueAtMiles - inputs.currentMiles : null
  const daysRemaining = dueAtDate != null ? daysBetween(inputs.asOf, dueAtDate) : null

  const milesStatus =
    milesRemaining != null ? classify(milesRemaining, DUE_LEAD_MILES, WATCH_LEAD_MILES) : null
  const daysStatus =
    daysRemaining != null ? classify(daysRemaining, DUE_LEAD_DAYS, WATCH_LEAD_DAYS) : null

  // Hybrid intervals: whichever axis is crossed first wins (most urgent tier).
  const status: MaintenanceStatus =
    milesStatus && daysStatus
      ? moreUrgent(milesStatus, daysStatus)
      : (milesStatus ?? daysStatus ?? 'completed')

  const reasonParts: string[] = []
  if (milesRemaining != null) {
    reasonParts.push(
      milesRemaining <= 0
        ? `${Math.abs(milesRemaining).toLocaleString()} mi overdue`
        : `${milesRemaining.toLocaleString()} mi remaining`,
    )
  }
  if (daysRemaining != null) {
    reasonParts.push(
      daysRemaining <= 0
        ? `${Math.abs(daysRemaining)} days overdue`
        : `${daysRemaining} days remaining`,
    )
  }
  // Flag staleness whenever this item is mileage-tracked, even if milesRemaining
  // itself couldn't be computed (no odometer reading at all) — that's precisely
  // the case a reader most needs the caveat, since status silently falls back
  // to a non-alarming default without it.
  if (odometerStale && interval.miles != null) {
    reasonParts.push(
      inputs.currentMiles == null
        ? 'no odometer reading logged — mileage-based due status unknown'
        : 'odometer reading is stale — mileage estimate may be off',
    )
  }
  if (rule.override?.kind === 'dealer-performed') reasonParts.push('dealer performed')
  if (rule.override?.kind === 'diy') reasonParts.push('DIY')
  if (rule.override?.kind === 'replace-at-next-interval') {
    reasonParts.push('flagged to replace at next interval')
  }

  return {
    rule,
    status,
    interval,
    lastDone,
    dueAtMiles,
    dueAtDate,
    milesRemaining,
    daysRemaining,
    odometerStale,
    projectedDueDate: projectDueDate(
      milesRemaining,
      inputs.annualMileage ?? DEFAULT_ANNUAL_MILEAGE,
      inputs.asOf,
    ),
    reason: reasonParts.join(' · ') || 'On track.',
  }
}

/** Smaller = more urgent within the same status tier. See DEFAULT_ANNUAL_MILEAGE. */
function urgencyValue(r: ComputedReminder): number {
  const milesAsDays =
    r.milesRemaining != null ? (r.milesRemaining / DEFAULT_ANNUAL_MILEAGE) * 365 : null
  const candidates = [r.daysRemaining, milesAsDays].filter((v): v is number => v != null)
  return candidates.length ? Math.min(...candidates) : Infinity
}

/** Sort computed reminders by urgency: overdue first, then due-next, etc. */
export function rankReminders(reminders: ComputedReminder[]): ComputedReminder[] {
  return [...reminders].sort((a, b) => {
    const tierDiff = TIER_ORDER.indexOf(a.status) - TIER_ORDER.indexOf(b.status)
    if (tierDiff !== 0) return tierDiff
    return urgencyValue(a) - urgencyValue(b)
  })
}

/**
 * Compute + rank every rule for one vehicle, personalizing each rule against
 * its actual completed event history before scoring it. Two extra behaviors
 * live here rather than in computeReminder because they're cross-rule:
 *   1. Each rule is first "replayed" against matching events via
 *      applyEventToRule, so lastDone reflects real history even if the DB
 *      cache (rule.lastDoneDate/Miles) hasn't been persisted/synced yet.
 *   2. `inspect-next-oil-change` borrows the oil-change rule's computed due
 *      info, since that override means "check this whenever oil is changed"
 *      rather than tracking its own independent interval.
 */
export function computeVehicleReminders(
  rules: ReminderRule[],
  events: MaintenanceEvent[],
  inputs: ReminderInputs,
): ComputedReminder[] {
  const personalized = rules.map((rule) => {
    const event = latestMatchingEvent(events, rule)
    return event ? { ...rule, ...applyEventToRule(rule, event) } : rule
  })

  const computed = personalized.map((rule) => computeReminder(rule, inputs))
  const oilChange = computed.find((c) => c.rule.category === 'oil-change') ?? null

  const withInspectTieIn = computed.map((c) => {
    if (c.rule.override?.kind !== 'inspect-next-oil-change' || !oilChange) return c
    return {
      ...c,
      status: oilChange.status,
      dueAtMiles: oilChange.dueAtMiles,
      dueAtDate: oilChange.dueAtDate,
      milesRemaining: oilChange.milesRemaining,
      daysRemaining: oilChange.daysRemaining,
      reason: `Tied to oil-change schedule — ${oilChange.reason}`,
    }
  })

  return rankReminders(withInspectTieIn)
}
