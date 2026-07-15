// Pure annual-mileage helpers. No Dexie, no DOM — turns a vehicle's logged
// odometer points into an average miles/year, and projects a calendar date for
// a mileage-based reminder from that rate. Used to answer "when (roughly) will
// this be due?" for items tracked by mileage, and to let the user either accept
// the history-derived average or set their own.

import { localDateISO } from './format'

/** An odometer observation: a date and the reading on that date. */
export interface MileagePoint {
  date: string // YYYY-MM-DD
  miles: number
}

export interface AnnualMileageEstimate {
  /** Average miles per year, rounded. */
  annual: number
  /** Days spanned between the earliest and latest point (the basis). */
  spanDays: number
  /** Miles accrued across that span. */
  milesDelta: number
}

/** Below this span the history is too short to extrapolate a yearly rate from. */
export const MIN_ESTIMATE_DAYS = 60
const DAYS_PER_YEAR = 365.25

function parseDay(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime()
}

/**
 * Estimate average miles/year from logged points (odometer readings + service
 * events). Uses the earliest- and latest-dated points: miles accrued between
 * them, annualized over the elapsed time. Returns null when there aren't yet
 * two points at least MIN_ESTIMATE_DAYS apart with forward mileage — i.e. not
 * enough history to be meaningful (the caller then falls back to a default or a
 * user-set value). Pure.
 */
export function estimateAnnualMileage(points: MileagePoint[]): AnnualMileageEstimate | null {
  if (points.length < 2) return null

  let earliest = points[0]
  let latest = points[0]
  for (const p of points) {
    if (p.date < earliest.date) earliest = p
    if (p.date > latest.date) latest = p
  }

  const spanDays = Math.round((parseDay(latest.date) - parseDay(earliest.date)) / 86_400_000)
  const milesDelta = latest.miles - earliest.miles
  if (spanDays < MIN_ESTIMATE_DAYS || milesDelta <= 0) return null

  return {
    annual: Math.round((milesDelta / spanDays) * DAYS_PER_YEAR),
    spanDays,
    milesDelta,
  }
}

export type AnnualMileageSource = 'custom' | 'calculated' | 'default'

export interface ResolvedAnnualMileage {
  value: number
  source: AnnualMileageSource
}

/**
 * The effective miles/year to use: the user's manual override if set, else the
 * history-derived estimate, else a supplied fallback default. A non-positive or
 * missing value at any tier is skipped.
 */
export function resolveAnnualMileage(
  override: number | null | undefined,
  calculated: number | null | undefined,
  fallback: number,
): ResolvedAnnualMileage {
  if (override != null && override > 0) return { value: override, source: 'custom' }
  if (calculated != null && calculated > 0) return { value: calculated, source: 'calculated' }
  return { value: fallback, source: 'default' }
}

/**
 * Project the calendar date a mileage-based item will come due, from the miles
 * still remaining and an assumed yearly rate. Returns null when it's already due
 * (remaining <= 0), there's nothing to project (remaining null), or the rate is
 * non-positive. Informational only — it does not change due-status. Pure.
 */
export function projectDueDate(
  milesRemaining: number | null,
  annualMileage: number,
  asOf: Date,
): string | null {
  if (milesRemaining == null || milesRemaining <= 0 || annualMileage <= 0) return null
  const days = (milesRemaining / annualMileage) * DAYS_PER_YEAR
  const d = new Date(asOf)
  d.setDate(d.getDate() + Math.round(days))
  return localDateISO(d)
}
