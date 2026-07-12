import { describe, it, expect } from 'vitest'
import type { MaintenanceEvent, ReminderRule } from '../src/types'
import {
  computeReminder,
  computeVehicleReminders,
  matchesRule,
  latestMatchingEvent,
  applyEventToRule,
  rankReminders,
  DUE_LEAD_MILES,
  WATCH_LEAD_MILES,
  STALE_ODOMETER_DAYS,
  type ReminderInputs,
} from '../src/domain/reminderEngine'

// Minimal, fully-controlled rule fixture. Using a customInterval means
// resolveInterval() returns exactly what the test sets, independent of the
// real (and evolving) SCHEDULE_TEMPLATES content — except for the
// condition-based test, which intentionally reads the real Rogue wheel
// alignment template entry to prove conditionBased flows through end to end.
function makeRule(overrides: Partial<ReminderRule> = {}): ReminderRule {
  return {
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
    ...overrides,
  }
}

function makeEvent(overrides: Partial<MaintenanceEvent> = {}): MaintenanceEvent {
  return {
    id: 'evt-1',
    vehicleId: 'f150-2020',
    date: '2026-01-01',
    odometerMiles: 40000,
    category: 'oil-change',
    title: 'Oil change',
    cost: 60,
    documentIds: [],
    ...overrides,
  }
}

function inputsAt(date: string, currentMiles: number | null, odometerAsOfDate: string | null = date): ReminderInputs {
  return { currentMiles, odometerAsOfDate, asOf: new Date(`${date}T00:00:00`) }
}

describe('computeReminder — mileage-only rules', () => {
  it('is completed well before the mileage threshold', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneDate: null, lastDoneMiles: 40000 })
    // lastDoneMiles alone (no lastDoneDate) still counts as "serviced" for resolveLastDone.
    const r = computeReminder(rule, inputsAt('2026-01-01', 42000))
    expect(r.dueAtMiles).toBe(45000)
    expect(r.milesRemaining).toBe(3000)
    expect(r.status).toBe('completed')
  })

  it('is due-next inside the inner lead window', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 40000 })
    const r = computeReminder(rule, inputsAt('2026-01-01', 45000 - DUE_LEAD_MILES + 100))
    expect(r.status).toBe('due-next')
  })

  it('is watch-next inside the outer lead window but outside the inner one', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 40000 })
    const r = computeReminder(rule, inputsAt('2026-01-01', 45000 - WATCH_LEAD_MILES + 100))
    expect(r.status).toBe('watch-next')
  })
})

describe('computeReminder — date-only rules', () => {
  it('computes days remaining from lastDoneDate + interval months', () => {
    const rule = makeRule({ customIntervalMiles: null, customIntervalMonths: 6, lastDoneDate: '2026-01-01' })
    const r = computeReminder(rule, inputsAt('2026-01-15', null, null))
    expect(r.dueAtDate).toBe('2026-07-01')
    expect(r.status).toBe('completed')
  })

  it('is overdue once the date threshold has passed', () => {
    const rule = makeRule({ customIntervalMiles: null, customIntervalMonths: 6, lastDoneDate: '2026-01-01' })
    const r = computeReminder(rule, inputsAt('2026-08-01', null, null))
    expect(r.status).toBe('overdue')
    expect(r.daysRemaining).toBeLessThan(0)
  })

  it('clamps a month-end anchor into the target month instead of overflowing', () => {
    // 2026-01-31 + 1mo: naive Date#setMonth rolls into March (Feb only has
    // 28 days in 2026), silently shifting the due date two days later.
    const rule = makeRule({ customIntervalMiles: null, customIntervalMonths: 1, lastDoneDate: '2026-01-31' })
    const r = computeReminder(rule, inputsAt('2026-02-01', null, null))
    expect(r.dueAtDate).toBe('2026-02-28')
  })
})

describe('computeReminder — combined (hybrid) rules', () => {
  it('uses whichever axis is more urgent (mileage crosses first)', () => {
    const rule = makeRule({ lastDoneDate: '2026-01-01', lastDoneMiles: 40000 })
    // Far from the 6-month date threshold, but mileage is right at due-next.
    const r = computeReminder(rule, inputsAt('2026-01-05', 45000 - 100))
    expect(r.status).toBe('due-next')
  })

  it('uses whichever axis is more urgent (date crosses first)', () => {
    const rule = makeRule({ lastDoneDate: '2026-01-01', lastDoneMiles: 40000 })
    // Mileage barely moved, but the 6-month date mark has passed.
    const r = computeReminder(rule, inputsAt('2026-08-01', 40500))
    expect(r.status).toBe('overdue')
  })

  it('anchors next-due to the actual completion event, not the original schedule slot', () => {
    // Serviced early at 44,000 (interval is 5,000 mi) instead of waiting for 45,000.
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 44000 })
    const r = computeReminder(rule, inputsAt('2026-01-01', 44000))
    expect(r.dueAtMiles).toBe(49000) // 44000 + 5000, not 45000 + 5000
  })
})

describe('computeReminder — manual overrides', () => {
  it('not-needed short-circuits to not-applicable regardless of history', () => {
    const rule = makeRule({
      lastDoneMiles: 1000,
      override: { kind: 'not-needed', note: null, atDate: null, atMiles: null },
    })
    const r = computeReminder(rule, inputsAt('2026-01-01', 99999))
    expect(r.status).toBe('not-applicable')
  })

  it('already-replaced supplies a last-done point when no history exists', () => {
    const rule = makeRule({
      override: { kind: 'already-replaced', note: 'prior owner', atDate: '2025-12-01', atMiles: 39000 },
    })
    const r = computeReminder(rule, inputsAt('2025-12-01', 39000))
    expect(r.lastDone).toEqual({ date: '2025-12-01', miles: 39000 })
    expect(r.status).toBe('completed')
  })

  it('a newer logged event supersedes an older already-replaced override', () => {
    const rule = makeRule({
      lastDoneDate: '2026-03-01',
      lastDoneMiles: 44000,
      override: { kind: 'already-replaced', note: null, atDate: '2025-01-01', atMiles: 30000 },
    })
    const r = computeReminder(rule, inputsAt('2026-03-01', 44000))
    expect(r.lastDone).toEqual({ date: '2026-03-01', miles: 44000 })
  })

  it('condition-based items (e.g. wheel alignment) never become overdue', () => {
    // Uses the real Rogue template entry, which is intentionally condition-based.
    const rule: ReminderRule = {
      id: 'rogue-2020:wheel-alignment',
      vehicleId: 'rogue-2020',
      templateKey: 'rogue-2020',
      category: 'wheel-alignment',
      label: 'Wheel alignment',
      customIntervalMiles: null,
      customIntervalMonths: null,
      lastDoneDate: '2020-01-01',
      lastDoneMiles: 0,
      override: null,
      notes: null,
      source: 'manufacturer-default',
    }
    const r = computeReminder(rule, inputsAt('2026-01-01', 90000))
    expect(r.interval.conditionBased).toBe(true)
    expect(r.status).not.toBe('overdue')
    expect(r.status).toBe('completed')
  })
})

describe('computeReminder — stale odometer', () => {
  it('flags a reading older than STALE_ODOMETER_DAYS', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 40000 })
    const oldReadingDate = '2025-01-01' // far more than STALE_ODOMETER_DAYS before asOf
    const r = computeReminder(rule, {
      currentMiles: 42000,
      odometerAsOfDate: oldReadingDate,
      asOf: new Date('2026-01-01T00:00:00'),
    })
    expect(r.odometerStale).toBe(true)
    expect(r.reason).toMatch(/stale/)
  })

  it('does not flag a recent reading', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 40000 })
    const r = computeReminder(rule, {
      currentMiles: 42000,
      odometerAsOfDate: '2025-12-20',
      asOf: new Date('2026-01-01T00:00:00'),
    })
    expect(r.odometerStale).toBe(false)
  })

  it('flags a missing odometer reading entirely', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 40000 })
    const r = computeReminder(rule, { currentMiles: null, odometerAsOfDate: null, asOf: new Date('2026-01-01T00:00:00') })
    expect(r.odometerStale).toBe(true)
  })

  it('surfaces the missing-odometer caveat even when milesRemaining cannot be computed', () => {
    // A mileage-only, already-serviced rule with NO current odometer at all: the
    // status still has to fall back to something (completed, the least-alarming
    // default), but the reason must say the mileage status is unknown rather
    // than silently implying "on track" with no caveat.
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 48000 })
    const r = computeReminder(rule, { currentMiles: null, odometerAsOfDate: null, asOf: new Date('2026-01-01T00:00:00') })
    expect(r.milesRemaining).toBeNull()
    expect(r.odometerStale).toBe(true)
    expect(r.reason).toMatch(/mileage-based due status unknown/)
  })

  it('respects the STALE_ODOMETER_DAYS boundary', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 40000 })
    const asOf = new Date('2026-03-01T00:00:00')
    const justUnder = new Date(asOf)
    justUnder.setDate(justUnder.getDate() - (STALE_ODOMETER_DAYS - 1))
    const r = computeReminder(rule, {
      currentMiles: 41000,
      odometerAsOfDate: justUnder.toISOString().slice(0, 10),
      asOf,
    })
    expect(r.odometerStale).toBe(false)
  })
})

describe('event-history helpers', () => {
  it('matchesRule checks both vehicle and category', () => {
    const rule = makeRule()
    expect(matchesRule(makeEvent(), rule)).toBe(true)
    expect(matchesRule(makeEvent({ vehicleId: 'rogue-2020' }), rule)).toBe(false)
    expect(matchesRule(makeEvent({ category: 'tire-rotation' }), rule)).toBe(false)
  })

  it('latestMatchingEvent picks the most recent matching event', () => {
    const rule = makeRule()
    const events = [
      makeEvent({ id: 'a', date: '2025-01-01', odometerMiles: 30000 }),
      makeEvent({ id: 'b', date: '2026-01-01', odometerMiles: 44000 }),
      makeEvent({ id: 'c', date: '2025-06-01', odometerMiles: 37000 }),
    ]
    expect(latestMatchingEvent(events, rule)?.id).toBe('b')
  })

  it('latestMatchingEvent returns null when nothing matches', () => {
    const rule = makeRule()
    expect(latestMatchingEvent([makeEvent({ category: 'tire-rotation' })], rule)).toBeNull()
  })

  it('applyEventToRule adopts a newer event', () => {
    const rule = makeRule({ lastDoneDate: '2025-01-01', lastDoneMiles: 30000 })
    const patch = applyEventToRule(rule, makeEvent({ date: '2026-01-01', odometerMiles: 44000 }))
    expect(patch).toEqual({ lastDoneDate: '2026-01-01', lastDoneMiles: 44000 })
  })

  it('applyEventToRule ignores an older/backdated event', () => {
    const rule = makeRule({ lastDoneDate: '2026-01-01', lastDoneMiles: 44000 })
    const patch = applyEventToRule(rule, makeEvent({ date: '2025-01-01', odometerMiles: 30000 }))
    expect(patch).toEqual({ lastDoneDate: '2026-01-01', lastDoneMiles: 44000 })
  })

  it('applyEventToRule ignores a non-matching event', () => {
    const rule = makeRule({ lastDoneDate: '2025-01-01', lastDoneMiles: 30000 })
    const patch = applyEventToRule(rule, makeEvent({ category: 'tire-rotation', date: '2026-01-01' }))
    expect(patch).toEqual({ lastDoneDate: '2025-01-01', lastDoneMiles: 30000 })
  })
})

describe('rankReminders', () => {
  it('sorts overdue before due-next, watch-next, completed, not-applicable', () => {
    const inputs = inputsAt('2026-01-01', 46000)
    const overdue = computeReminder(makeRule({ id: 'r1', customIntervalMonths: null, lastDoneMiles: 30000 }), inputs)
    const completed = computeReminder(makeRule({ id: 'r2', customIntervalMonths: null, lastDoneMiles: 45900 }), inputs)
    const na = computeReminder(
      makeRule({
        id: 'r3',
        override: { kind: 'not-needed', note: null, atDate: null, atMiles: null },
      }),
      inputs,
    )
    const ranked = rankReminders([completed, na, overdue])
    expect(ranked.map((r) => r.rule.id)).toEqual(['r1', 'r2', 'r3'])
  })
})

describe('computeVehicleReminders — event personalization + inspect-next-oil-change', () => {
  it('personalizes lastDone from event history even when the rule cache is stale', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 30000 })
    const events = [makeEvent({ date: '2026-01-01', odometerMiles: 44000 })]
    const [computed] = computeVehicleReminders([rule], events, inputsAt('2026-01-01', 44500))
    expect(computed.lastDone.miles).toBe(44000)
    expect(computed.dueAtMiles).toBe(49000)
  })

  it('ties an inspect-next-oil-change rule to the oil-change rule status', () => {
    const oilRule = makeRule({ id: 'f150-2020:oil-change', customIntervalMonths: null, lastDoneMiles: 30000 })
    const brakeRule = makeRule({
      id: 'f150-2020:brake-inspection',
      category: 'brake-inspection',
      label: 'Brake inspection',
      customIntervalMiles: 50000,
      customIntervalMonths: null,
      lastDoneMiles: 0,
      override: { kind: 'inspect-next-oil-change', note: null, atDate: null, atMiles: null },
    })
    const inputs = inputsAt('2026-01-01', 34900) // just inside oil change's due-next window (35,000)
    const results = computeVehicleReminders([oilRule, brakeRule], [], inputs)
    const brake = results.find((r) => r.rule.id === 'f150-2020:brake-inspection')!
    const oil = results.find((r) => r.rule.id === 'f150-2020:oil-change')!
    expect(brake.status).toBe(oil.status)
    expect(brake.reason).toMatch(/Tied to oil-change/)
  })

  it('never mutates the rules passed in', () => {
    const rule = makeRule({ customIntervalMonths: null, lastDoneMiles: 30000 })
    const original = { ...rule }
    computeVehicleReminders([rule], [makeEvent({ date: '2026-01-01', odometerMiles: 44000 })], inputsAt('2026-01-01', 44500))
    expect(rule).toEqual(original)
  })
})
