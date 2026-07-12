import { describe, it, expect } from 'vitest'
import { reminderProgress } from '../src/domain/progress'
import type { ComputedReminder } from '../src/domain/reminderEngine'
import type { ReminderRule, MaintenanceStatus } from '../src/types'

const rule: ReminderRule = {
  id: 'f150-2020:oil-change',
  vehicleId: 'f150-2020',
  templateKey: 'f150-2020',
  category: 'oil-change',
  label: 'Engine oil & filter',
  customIntervalMiles: 5000,
  customIntervalMonths: 6,
  lastDoneDate: null,
  lastDoneMiles: null,
  override: null,
  notes: null,
  source: 'manufacturer-default',
}

// Build a fully-controlled ComputedReminder; the pure helper never re-derives
// status or interval, so hand-built fixtures are the clearest way to test it.
function mk(overrides: Partial<ComputedReminder> = {}): ComputedReminder {
  return {
    rule,
    status: 'due-next' as MaintenanceStatus,
    interval: { miles: 5000, months: 6, conditionBased: false, source: 'custom' },
    lastDone: { date: null, miles: null },
    dueAtMiles: null,
    dueAtDate: null,
    milesRemaining: null,
    daysRemaining: null,
    odometerStale: false,
    reason: '',
    ...overrides,
  }
}

describe('reminderProgress', () => {
  it('mileage-only: overdue reads past 100%', () => {
    // interval 5000, 1231 mi past due → 6231/5000 = 124.6%
    const p = reminderProgress(mk({ status: 'overdue', interval: { miles: 5000, months: null, conditionBased: false, source: 'custom' }, milesRemaining: -1231 }))
    expect(p.axis).toBe('miles')
    expect(p.zone).toBe('overdue')
    expect(Math.round(p.pct!)).toBe(125)
  })

  it('mileage-only: mid-interval reads under 100%', () => {
    const p = reminderProgress(mk({ status: 'watch-next', interval: { miles: 5000, months: null, conditionBased: false, source: 'custom' }, milesRemaining: 2200 }))
    expect(p.axis).toBe('miles')
    expect(Math.round(p.pct!)).toBe(56) // (5000-2200)/5000
  })

  it('date-only: uses the date axis', () => {
    // interval 6 months ≈ 182.6 days; 90 days remaining → ~50.7%
    const p = reminderProgress(mk({ interval: { miles: null, months: 6, conditionBased: false, source: 'custom' }, daysRemaining: 90 }))
    expect(p.axis).toBe('date')
    expect(p.pct!).toBeGreaterThan(48)
    expect(p.pct!).toBeLessThan(54)
  })

  it('hybrid: the more-urgent axis wins', () => {
    // miles axis 40% vs date axis 80% → date wins
    const p = reminderProgress(mk({
      interval: { miles: 5000, months: 6, conditionBased: false, source: 'custom' },
      milesRemaining: 3000, // 40%
      daysRemaining: 36, // ~80%
    }))
    expect(p.axis).toBe('date')
    expect(p.pct!).toBeGreaterThan(75)
  })

  it('condition-based: no numeric target', () => {
    const p = reminderProgress(mk({ interval: { miles: null, months: null, conditionBased: true, source: 'factory' }, milesRemaining: 100 }))
    expect(p.pct).toBeNull()
    expect(p.axis).toBeNull()
  })

  it('not-applicable: no gauge', () => {
    const p = reminderProgress(mk({ status: 'not-applicable', milesRemaining: -500 }))
    expect(p.pct).toBeNull()
    expect(p.zone).toBe('not-applicable')
  })

  it('nothing to measure: null when neither axis has data', () => {
    const p = reminderProgress(mk({ milesRemaining: null, daysRemaining: null }))
    expect(p.pct).toBeNull()
    expect(p.axis).toBeNull()
  })

  it('never negative: clamps a far-future reading to 0', () => {
    const p = reminderProgress(mk({ interval: { miles: 5000, months: null, conditionBased: false, source: 'custom' }, milesRemaining: 6000 }))
    expect(p.pct).toBe(0)
  })
})
