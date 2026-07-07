import { describe, it, expect } from 'vitest'
import type { ComputedReminder } from '../src/domain/reminderEngine'
import type { MaintenanceStatus } from '../src/types'
import {
  countByStatus,
  compareVehicleUrgency,
  vehicleBadges,
  type VehicleUrgency,
} from '../src/domain/vehicleRanking'

// Only `status` matters to the ranking layer; cast a minimal object.
function rem(status: MaintenanceStatus): ComputedReminder {
  return { status } as ComputedReminder
}

function urgency(overrides: Partial<VehicleUrgency> = {}): VehicleUrgency {
  return {
    counts: { overdue: 0, dueNext: 0, watchNext: 0, completed: 0, notApplicable: 0 },
    odometerStale: false,
    recentRepairCost: 0,
    daysSinceLastActivity: 1,
    ...overrides,
  }
}

describe('countByStatus', () => {
  it('tallies each status', () => {
    const counts = countByStatus([
      rem('overdue'),
      rem('overdue'),
      rem('due-next'),
      rem('watch-next'),
      rem('completed'),
      rem('completed'),
      rem('completed'),
      rem('not-applicable'),
    ])
    expect(counts).toEqual({ overdue: 2, dueNext: 1, watchNext: 1, completed: 3, notApplicable: 1 })
  })
})

describe('compareVehicleUrgency', () => {
  it('ranks an overdue vehicle before a watch-next-only vehicle (the spec example)', () => {
    const overdueVehicle = urgency({ counts: { overdue: 1, dueNext: 0, watchNext: 0, completed: 12, notApplicable: 0 } })
    const watchVehicle = urgency({ counts: { overdue: 0, dueNext: 0, watchNext: 1, completed: 12, notApplicable: 0 } })
    expect(compareVehicleUrgency(overdueVehicle, watchVehicle)).toBeLessThan(0)
    expect(compareVehicleUrgency(watchVehicle, overdueVehicle)).toBeGreaterThan(0)
  })

  it('overdue dominates even when the other vehicle has many due-next items', () => {
    const oneOverdue = urgency({ counts: { overdue: 1, dueNext: 0, watchNext: 0, completed: 0, notApplicable: 0 } })
    const manyDue = urgency({ counts: { overdue: 0, dueNext: 12, watchNext: 0, completed: 0, notApplicable: 0 } })
    expect(compareVehicleUrgency(oneOverdue, manyDue)).toBeLessThan(0)
  })

  it('breaks a count tie by more overdue first', () => {
    const two = urgency({ counts: { overdue: 2, dueNext: 0, watchNext: 0, completed: 0, notApplicable: 0 } })
    const one = urgency({ counts: { overdue: 1, dueNext: 5, watchNext: 5, completed: 0, notApplicable: 0 } })
    expect(compareVehicleUrgency(two, one)).toBeLessThan(0)
  })

  it('uses stale odometer as a tiebreak when urgency counts are equal', () => {
    const stale = urgency({ odometerStale: true })
    const fresh = urgency({ odometerStale: false })
    expect(compareVehicleUrgency(stale, fresh)).toBeLessThan(0)
  })

  it('uses recent repair cost as a tiebreak below stale odometer', () => {
    const pricey = urgency({ recentRepairCost: 800 })
    const cheap = urgency({ recentRepairCost: 0 })
    expect(compareVehicleUrgency(pricey, cheap)).toBeLessThan(0)
  })

  it('treats a never-logged vehicle (null activity) as most neglected in the final tiebreak', () => {
    const never = urgency({ daysSinceLastActivity: null })
    const recent = urgency({ daysSinceLastActivity: 3 })
    expect(compareVehicleUrgency(never, recent)).toBeLessThan(0)
  })

  it('is symmetric and returns 0 for identical urgency', () => {
    const a = urgency({ counts: { overdue: 1, dueNext: 2, watchNext: 3, completed: 4, notApplicable: 0 } })
    const b = urgency({ counts: { overdue: 1, dueNext: 2, watchNext: 3, completed: 4, notApplicable: 0 } })
    expect(compareVehicleUrgency(a, b)).toBe(0)
  })

  it('does not produce NaN when both vehicles have never been logged', () => {
    const a = urgency({ daysSinceLastActivity: null })
    const b = urgency({ daysSinceLastActivity: null })
    expect(compareVehicleUrgency(a, b)).toBe(0)
  })
})

describe('vehicleBadges', () => {
  it('summarizes counts, stale mileage, and a recent big repair', () => {
    const badges = vehicleBadges(
      urgency({
        counts: { overdue: 2, dueNext: 1, watchNext: 3, completed: 0, notApplicable: 0 },
        odometerStale: true,
        recentRepairCost: 640,
      }),
    )
    const labels = badges.map((b) => b.label)
    expect(labels).toContain('2 overdue')
    expect(labels).toContain('1 due next')
    expect(labels).toContain('3 watch')
    expect(labels).toContain('stale mileage')
    expect(labels).toContain('recent $640 repair')
  })

  it('shows "on track" when there is nothing to flag', () => {
    expect(vehicleBadges(urgency()).map((b) => b.label)).toEqual(['on track'])
  })

  it('ignores a sub-threshold repair cost', () => {
    const badges = vehicleBadges(urgency({ recentRepairCost: 100 }))
    expect(badges.some((b) => b.tone === 'cost')).toBe(false)
  })
})
