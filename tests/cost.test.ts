import { describe, it, expect } from 'vitest'
import { buildCostBreakdown, costPerMile, filterByYear } from '../src/domain/cost'
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
