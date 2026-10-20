import { describe, it, expect } from 'vitest'
import { buildCostBreakdown, costLooksOff, costPerMile, filterByYear, spendByMonth } from '../src/domain/cost'
import type { MaintenanceCategory, MaintenanceEvent } from '../src/types'

let seq = 0
function evt(
  over: {
    kind?: 'maintenance' | 'repair'
    category?: MaintenanceCategory
    cost?: number
    date?: string
    odometerMiles?: number
  } = {},
): MaintenanceEvent {
  return {
    id: `evt-${seq++}`,
    vehicleId: 'veh-1',
    kind: over.kind ?? 'maintenance',
    date: over.date ?? '2026-03-01',
    odometerMiles: over.odometerMiles ?? 40000,
    category: over.category ?? 'oil-change',
    title: 'x',
    cost: over.cost ?? 0,
    documentIds: [],
  }
}

describe('filterByYear', () => {
  const events = [evt({ date: '2025-12-31' }), evt({ date: '2026-01-01' }), evt({ date: '2026-11-30' })]

  it('keeps only events in the given calendar year', () => {
    expect(filterByYear(events, 2026)).toHaveLength(2)
    expect(filterByYear(events, 2025)).toHaveLength(1)
  })

  it('returns all events when year is null (all-time)', () => {
    expect(filterByYear(events, null)).toHaveLength(3)
  })
})

describe('spendByMonth', () => {
  it('filters by year, buckets each month, and sums to the year spend', () => {
    const events = [
      evt({ date: '2025-12-31', cost: 999 }),
      evt({ date: '2026-01-02', cost: 20 }),
      evt({ date: '2026-03-12', cost: 80 }),
      evt({ date: '2026-03-31', cost: 15 }),
    ]
    const months = spendByMonth(events, 2026)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe(20)
    expect(months[2]).toBe(95)
    expect(months.reduce((sum, cost) => sum + cost, 0)).toBe(buildCostBreakdown(filterByYear(events, 2026)).total)
  })
})

describe('buildCostBreakdown', () => {
  it('totals spend and splits maintenance vs repair', () => {
    const b = buildCostBreakdown([
      evt({ kind: 'maintenance', category: 'oil-change', cost: 65 }),
      evt({ kind: 'maintenance', category: 'tire-rotation', cost: 25 }),
      evt({ kind: 'repair', category: 'brake-inspection', cost: 300 }),
    ])
    expect(b.total).toBe(390)
    expect(b.maintenanceTotal).toBe(90)
    expect(b.repairTotal).toBe(300)
    expect(b.eventCount).toBe(3)
    expect(b.paidEventCount).toBe(3)
  })

  it('groups by category, sorts by spend desc, and computes share', () => {
    const b = buildCostBreakdown([
      evt({ category: 'oil-change', cost: 60 }),
      evt({ category: 'oil-change', cost: 40 }),
      evt({ category: 'tire-rotation', cost: 100 }),
    ])
    expect(b.byCategory.map((c) => c.category)).toEqual(['oil-change', 'tire-rotation'])
    const oil = b.byCategory[0]
    expect(oil.total).toBe(100)
    expect(oil.count).toBe(2)
    expect(oil.share).toBeCloseTo(0.5, 5)
  })

  it('excludes categories with zero spend but still counts the events', () => {
    const b = buildCostBreakdown([
      evt({ category: 'oil-change', cost: 50 }),
      evt({ category: 'multi-point-inspection', cost: 0 }),
    ])
    expect(b.byCategory).toHaveLength(1)
    expect(b.byCategory[0].category).toBe('oil-change')
    expect(b.eventCount).toBe(2)
    expect(b.paidEventCount).toBe(1)
  })

  it('tracks first and last dates', () => {
    const b = buildCostBreakdown([
      evt({ date: '2026-05-01', cost: 10 }),
      evt({ date: '2026-01-15', cost: 10 }),
      evt({ date: '2026-09-20', cost: 10 }),
    ])
    expect(b.firstDate).toBe('2026-01-15')
    expect(b.lastDate).toBe('2026-09-20')
  })

  it('is all-zero and empty for no events', () => {
    const b = buildCostBreakdown([])
    expect(b.total).toBe(0)
    expect(b.byCategory).toEqual([])
    expect(b.firstDate).toBeNull()
  })
})

describe('costPerMile', () => {
  it('divides total by the tracked span', () => {
    expect(costPerMile(400, 10000)).toBeCloseTo(0.04, 6)
  })

  it('returns null when the span is unknown or non-positive', () => {
    expect(costPerMile(400, null)).toBeNull()
    expect(costPerMile(400, 0)).toBeNull()
    expect(costPerMile(400, -50)).toBeNull()
  })
})

describe('costLooksOff', () => {
  it('warns only above three times the highest prior positive cost', () => {
    expect(costLooksOff(151, [25, 50])).toBe(true)
    expect(costLooksOff(150, [25, 50])).toBe(false)
  })

  it('never warns without usable prior history', () => {
    expect(costLooksOff(500, [])).toBe(false)
    expect(costLooksOff(500, [0, -20, Number.NaN])).toBe(false)
  })

  it('warns from a single prior cost', () => {
    expect(costLooksOff(76, [25])).toBe(true)
  })

  it('uses the highest prior cost rather than a lower outlier', () => {
    expect(costLooksOff(100, [5, 40, 10])).toBe(false)
  })

  it('ignores invalid current amounts', () => {
    expect(costLooksOff(0, [25])).toBe(false)
    expect(costLooksOff(Number.NaN, [25])).toBe(false)
  })
})
