import { describe, it, expect } from 'vitest'
import type { ReminderRule } from '../src/types'
import { computeVehicleReminders, type ReminderInputs } from '../src/domain/reminderEngine'
import { vehicleHealth, type ConcernBandInput } from '../src/domain/health'

// Same fixture discipline as tests/verdict.test.ts: build health reads from
// REAL engine output rather than hand-assembled ComputedReminder literals.

let seq = 0
function makeRule(overrides: Partial<ReminderRule> = {}): ReminderRule {
  seq += 1
  return {
    id: `f150-2020:rule-${seq}`,
    vehicleId: 'f150-2020',
    templateKey: 'f150-2020',
    category: 'oil-change',
    label: 'Engine oil & filter',
    customIntervalMiles: 5000,
    customIntervalMonths: null,
    lastDoneDate: '2026-01-01',
    lastDoneMiles: 40000,
    override: null,
    notes: null,
    source: 'manufacturer-default',
    ...overrides,
  }
}

function inputsAt(date: string, currentMiles: number | null): ReminderInputs {
  return { currentMiles, odometerAsOfDate: currentMiles == null ? null : date, asOf: new Date(`${date}T00:00:00`) }
}

describe('vehicleHealth — worst-wins band', () => {
  it('all-clear when every reminder is completed and nothing else is pending', () => {
    // Just did the oil change; not due for another 5000mi — completed.
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const health = vehicleHealth(reminders, [], false)
    expect(health.band).toBe('all-clear')
    expect(health.score).toBe(100)
    expect(health.reasons).toEqual(['all caught up'])
  })

  it('an overdue reminder makes the band fix-now regardless of concerns', () => {
    // Way past the 5000mi interval -> overdue.
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 46000))
    const health = vehicleHealth(reminders, [], false)
    expect(health.band).toBe('fix-now')
    expect(health.reasons).toContain('1 overdue')
  })

  it('a fix-now open concern outranks an otherwise all-clear reminder set', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const concerns: ConcernBandInput[] = [{ band: 'fix-now' }]
    const health = vehicleHealth(reminders, concerns, false)
    expect(health.band).toBe('fix-now')
    expect(health.reasons).toContain('1 open concern')
  })

  it('worst-wins picks the more urgent of reminders vs concerns either direction', () => {
    // Reminders all-clear, concern is only book-soon -> band is book-soon (concern wins).
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const health = vehicleHealth(reminders, [{ band: 'book-soon' }], false)
    expect(health.band).toBe('book-soon')
  })
})

describe('vehicleHealth — score monotonicity', () => {
  it('never exceeds 100 or drops below 0', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const clean = vehicleHealth(reminders, [], false)
    expect(clean.score).toBeLessThanOrEqual(100)
    const manyConcerns: ConcernBandInput[] = Array.from({ length: 20 }, () => ({ band: 'fix-now' as const }))
    const worst = vehicleHealth(reminders, manyConcerns, true)
    expect(worst.score).toBeGreaterThanOrEqual(0)
  })

  it('an overdue reminder scores strictly lower than an all-clear one, all else equal', () => {
    const clean = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const overdue = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 46000))
    const cleanScore = vehicleHealth(clean, [], false).score
    const overdueScore = vehicleHealth(overdue, [], false).score
    expect(overdueScore).toBeLessThan(cleanScore)
  })

  it('adding an open concern never increases the score', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const without = vehicleHealth(reminders, [], false).score
    const withConcern = vehicleHealth(reminders, [{ band: 'coast' }], false).score
    expect(withConcern).toBeLessThanOrEqual(without)
  })

  it('a stale odometer never increases the score', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const fresh = vehicleHealth(reminders, [], false).score
    const stale = vehicleHealth(reminders, [], true).score
    expect(stale).toBeLessThanOrEqual(fresh)
  })

  it('more overdue items never scores higher than fewer', () => {
    const oneOverdue = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 46000))
    const twoOverdue = computeVehicleReminders(
      [makeRule(), makeRule({ category: 'brake-inspection', label: 'Brake inspection' })],
      [],
      inputsAt('2026-01-10', 46000),
    )
    const oneScore = vehicleHealth(oneOverdue, [], false).score
    const twoScore = vehicleHealth(twoOverdue, [], false).score
    expect(twoScore).toBeLessThanOrEqual(oneScore)
  })
})

describe('vehicleHealth — reasons explain the read', () => {
  it('mentions overdue count and open-concern count together', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 46000))
    const health = vehicleHealth(reminders, [{ band: 'fix-now' }], false)
    expect(health.reasons).toContain('1 overdue')
    expect(health.reasons).toContain('1 open concern')
  })

  it('mentions a stale odometer', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-01-10', 40100))
    const health = vehicleHealth(reminders, [], true)
    expect(health.reasons).toContain('mileage estimate is stale')
  })
})
