import { effectiveCategories, type MaintenanceCategory, type MaintenanceEvent } from '../types'

// Pure per-service history for the service detail page (#/service/<id>):
// every logged visit on one vehicle that covered one category, plus the
// summary numbers shown above the list. No DOM, no I/O — unit-tested in
// tests/serviceHistory.test.ts.
//
// Matching uses effectiveCategories (primary + "also performed"), the same
// rule the reminder engine uses, so this list always agrees with the
// schedule's "last done". Cost, though, counts only visits where this is the
// PRIMARY category — the same attribution as cost.ts — so an oil change that
// also rotated the tires never inflates tire-rotation spend.

export interface ServiceHistory {
  /** Matching visits, newest first (same-day ties: higher mileage first). */
  events: MaintenanceEvent[]
  count: number
  /** Spend on visits where this is the primary category. */
  totalCost: number
  /** totalCost / number of primary visits with a cost; null if none. */
  avgCost: number | null
  /** Average gap between consecutive visits; null with fewer than 2 visits. */
  avgMilesBetween: number | null
  avgDaysBetween: number | null
}

const MS_PER_DAY = 86_400_000

function dayNumber(iso: string): number {
  return Math.round(new Date(`${iso}T00:00:00`).getTime() / MS_PER_DAY)
}

export function buildServiceHistory(
  events: MaintenanceEvent[],
  vehicleId: string,
  category: MaintenanceCategory,
): ServiceHistory {
  const matching = events
    .filter((e) => e.vehicleId === vehicleId && effectiveCategories(e).includes(category))
    .sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.odometerMiles - a.odometerMiles,
    )

  const paid = matching.filter((e) => e.category === category && e.cost > 0)
  const totalCost = paid.reduce((sum, e) => sum + e.cost, 0)

  let avgMilesBetween: number | null = null
  let avgDaysBetween: number | null = null
  if (matching.length >= 2) {
    const newest = matching[0]
    const oldest = matching[matching.length - 1]
    const gaps = matching.length - 1
    const miles = newest.odometerMiles - oldest.odometerMiles
    avgMilesBetween = miles > 0 ? Math.round(miles / gaps) : null
    const days = dayNumber(newest.date) - dayNumber(oldest.date)
    avgDaysBetween = days > 0 ? Math.round(days / gaps) : null
  }

  return {
    events: matching,
    count: matching.length,
    totalCost,
    avgCost: paid.length ? totalCost / paid.length : null,
    avgMilesBetween,
    avgDaysBetween,
  }
}

/**
 * Splits a service route id (`<vehicleId>:<category>`, the same shape as a
 * ReminderRule id) into its parts. Splits on the LAST colon so a vehicle id
 * can never be truncated. Returns null for anything malformed.
 */
export function parseServiceId(
  id: string,
): { vehicleId: string; category: MaintenanceCategory } | null {
  const i = id.lastIndexOf(':')
  if (i <= 0 || i === id.length - 1) return null
  return { vehicleId: id.slice(0, i), category: id.slice(i + 1) as MaintenanceCategory }
}

export function serviceHref(vehicleId: string, category: MaintenanceCategory): string {
  return `#/service/${vehicleId}:${category}`
}
