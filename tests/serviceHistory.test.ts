import { describe, it, expect } from 'vitest'
import { buildServiceHistory, parseServiceId, serviceHref } from '../src/domain/serviceHistory'
import type { MaintenanceCategory, MaintenanceEvent } from '../src/types'

let seq = 0
function evt(
  over: {
    vehicleId?: string
    category?: MaintenanceCategory
    additionalCategories?: MaintenanceCategory[]
    cost?: number
    date?: string
    odometerMiles?: number
  } = {},
): MaintenanceEvent {
  return {
    id: `evt-${seq++}`,
    vehicleId: over.vehicleId ?? 'veh-1',
    kind: 'maintenance',
    date: over.date ?? '2026-03-01',
    odometerMiles: over.odometerMiles ?? 40000,
    category: over.category ?? 'oil-change',
    additionalCategories: over.additionalCategories,
    title: 'x',
    cost: over.cost ?? 0,
    documentIds: [],
  }
}

describe('buildServiceHistory', () => {
  it('matches primary and "also performed" visits for one vehicle only, newest first', () => {
    const a = evt({ date: '2025-01-10', odometerMiles: 30000 })
    const b = evt({ date: '2026-02-01', category: 'tire-rotation', additionalCategories: ['oil-change'] })
    const otherCat = evt({ category: 'brake-fluid' })
    const otherCar = evt({ vehicleId: 'veh-2' })
    const h = buildServiceHistory([a, otherCat, b, otherCar], 'veh-1', 'oil-change')
    expect(h.events.map((e) => e.id)).toEqual([b.id, a.id])
    expect(h.count).toBe(2)
  })

  it('breaks same-day ties by higher mileage first', () => {
    const lo = evt({ date: '2026-01-01', odometerMiles: 100 })
    const hi = evt({ date: '2026-01-01', odometerMiles: 200 })
    expect(buildServiceHistory([lo, hi], 'veh-1', 'oil-change').events[0].id).toBe(hi.id)
  })

  it('counts cost only where this is the primary category', () => {
    const primary = evt({ cost: 60 })
    const freeOne = evt({ cost: 0 })
    const tagAlong = evt({ category: 'tire-rotation', additionalCategories: ['oil-change'], cost: 200 })
    const h = buildServiceHistory([primary, freeOne, tagAlong], 'veh-1', 'oil-change')
    expect(h.totalCost).toBe(60)
    expect(h.avgCost).toBe(60)
  })

  it('averages the gap between visits; null with fewer than two', () => {
    const one = buildServiceHistory([evt()], 'veh-1', 'oil-change')
    expect(one.avgMilesBetween).toBeNull()
    expect(one.avgDaysBetween).toBeNull()

    const h = buildServiceHistory(
      [
        evt({ date: '2026-01-01', odometerMiles: 30000 }),
        evt({ date: '2026-03-02', odometerMiles: 35000 }),
        evt({ date: '2026-05-01', odometerMiles: 40000 }),
      ],
      'veh-1',
      'oil-change',
    )
    expect(h.avgMilesBetween).toBe(5000)
    expect(h.avgDaysBetween).toBe(60)
  })

  it('is empty for a service never logged', () => {
    const h = buildServiceHistory([evt()], 'veh-1', 'spark-plugs')
    expect(h).toMatchObject({ count: 0, totalCost: 0, avgCost: null, events: [] })
  })
})

describe('parseServiceId / serviceHref', () => {
  it('round-trips a rule-shaped id', () => {
    const href = serviceHref('veh-abc-123', 'oil-change')
    expect(href).toBe('#/service/veh-abc-123:oil-change')
    expect(parseServiceId('veh-abc-123:oil-change')).toEqual({
      vehicleId: 'veh-abc-123',
      category: 'oil-change',
    })
  })

  it('rejects malformed ids', () => {
    expect(parseServiceId('no-colon')).toBeNull()
    expect(parseServiceId(':oil-change')).toBeNull()
    expect(parseServiceId('veh-1:')).toBeNull()
  })
})
