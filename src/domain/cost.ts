// Pure cost aggregation (Milestone 11). No Dexie, no DOM — turns a vehicle's
// logged events into spend breakdowns for the Costs page, so the math is
// trivially unit-testable. The impure composition (loading events + mileage per
// vehicle) lives in db/summary.ts. Reminder/CRUD/ranking logic is untouched;
// this only reads the `cost`/`kind`/`category`/`date` fields already on events.

import { CATEGORY_LABELS, type MaintenanceCategory, type MaintenanceEvent } from '../types'

export interface CategoryCost {
  category: MaintenanceCategory
  label: string
  total: number
  count: number
  /** Fraction of the breakdown's grand total (0–1); 0 when total is 0. */
  share: number
}

export interface CostBreakdown {
  total: number
  maintenanceTotal: number
  repairTotal: number
  /** Every event considered (including free / $0 ones). */
  eventCount: number
  /** Events that actually carried a cost > 0. */
  paidEventCount: number
  /** Categories with spend, highest first (ties broken by label). */
  byCategory: CategoryCost[]
  firstDate: string | null
  lastDate: string | null
}

/** Events within a calendar year, or all events when `year` is null (all-time).
 * Dates are `YYYY-MM-DD`, so a string prefix match is exact and TZ-free. */
export function filterByYear(events: MaintenanceEvent[], year: number | null): MaintenanceEvent[] {
  if (year == null) return events
  const prefix = `${year}-`
  return events.filter((e) => e.date.startsWith(prefix))
}

/** Aggregate events into a spend breakdown: grand total, maintenance vs repair
 * split, and per-category totals sorted by spend. */
export function buildCostBreakdown(events: MaintenanceEvent[]): CostBreakdown {
  let total = 0
  let maintenanceTotal = 0
  let repairTotal = 0
  let paidEventCount = 0
  let firstDate: string | null = null
  let lastDate: string | null = null
  const byCat = new Map<MaintenanceCategory, { total: number; count: number }>()

  for (const e of events) {
    const cost = e.cost || 0
    total += cost
    if (e.kind === 'repair') repairTotal += cost
    else maintenanceTotal += cost
    if (cost > 0) paidEventCount += 1

    const cur = byCat.get(e.category) ?? { total: 0, count: 0 }
    cur.total += cost
    cur.count += 1
    byCat.set(e.category, cur)

    if (firstDate === null || e.date < firstDate) firstDate = e.date
    if (lastDate === null || e.date > lastDate) lastDate = e.date
  }

  const byCategory: CategoryCost[] = [...byCat.entries()]
    .filter(([, v]) => v.total > 0)
    .map(([category, v]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      total: v.total,
      count: v.count,
      share: total > 0 ? v.total / total : 0,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))

  return {
    total,
    maintenanceTotal,
    repairTotal,
    eventCount: events.length,
    paidEventCount,
    byCategory,
    firstDate,
    lastDate,
  }
}

/** Cost per mile over a tracked span. null when the mileage span is unknown or
 * non-positive (so the UI shows "—" instead of a divide-by-zero / Infinity). */
export function costPerMile(total: number, milesTracked: number | null): number | null {
  if (milesTracked == null || milesTracked <= 0) return null
  return total / milesTracked
}
