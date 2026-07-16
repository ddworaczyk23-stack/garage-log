import { describe, it, expect } from 'vitest'
import type { ReminderRule } from '../src/types'
import { computeVehicleReminders, type ReminderInputs } from '../src/domain/reminderEngine'
import { bandFromStatus, vehicleVerdict, BAND_LABELS } from '../src/domain/verdict'

// Verdicts are built from REAL engine output (computeVehicleReminders) rather
// than hand-assembled ComputedReminder literals, so these tests break if the
// engine's shape/ranking and the verdict layer ever drift apart.

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

function verdictFor(rules: ReminderRule[], inputs: ReminderInputs) {
  return vehicleVerdict(computeVehicleReminders(rules, [], inputs))
}

describe('bandFromStatus', () => {
  it('maps the five engine statuses onto the four signals', () => {
    expect(bandFromStatus('overdue')).toBe('fix-now')
    expect(bandFromStatus('due-next')).toBe('book-soon')
    expect(bandFromStatus('watch-next')).toBe('coast')
    expect(bandFromStatus('completed')).toBe('all-clear')
    expect(bandFromStatus('not-applicable')).toBeNull()
  })

  it('every band has a label', () => {
    for (const band of ['fix-now', 'book-soon', 'coast', 'all-clear'] as const) {
      expect(BAND_LABELS[band]).toBeTruthy()
    }
  })
})

describe('vehicleVerdict — band selection', () => {
  it('an overdue item makes the vehicle fix-now, naming the item and the overshoot', () => {
    const v = verdictFor([makeRule({ label: 'Engine oil & filter' })], inputsAt('2026-07-01', 46200))
    expect(v.band).toBe('fix-now')
    expect(v.headline).toBe('One thing needs attention now.')
    expect(v.sentence).toContain('Engine oil & filter')
    expect(v.sentence).toContain('1,200 mi past due')
    expect(v.safeWindow).toContain('this week')
  })

  it('due-next without any overdue reads book-soon with a mileage window', () => {
    const v = verdictFor([makeRule()], inputsAt('2026-07-01', 44600))
    expect(v.band).toBe('book-soon')
    expect(v.headline).toBe('One thing to book soon.')
    expect(v.sentence).toContain('in ~400 mi')
    expect(v.safeWindow).toContain('400 mi')
  })

  it('watch-next only reads coast, and all-clear when nothing is close', () => {
    const coast = verdictFor([makeRule()], inputsAt('2026-07-01', 44000))
    expect(coast.band).toBe('coast')
    expect(coast.headline).toBe('Nothing urgent. You can coast.')
    expect(coast.sentence).toContain('engine oil & filter')

    const clear = verdictFor([makeRule()], inputsAt('2026-07-01', 41000))
    expect(clear.band).toBe('all-clear')
    expect(clear.headline).toBe('All clear. Just drive.')
    // Even all-clear names what's next so the screen answers "what's coming".
    expect(clear.sentence).toContain('engine oil & filter')
    expect(clear.sentence).toContain('in ~4,000 mi')
  })

  it('counts plural actionable items in the headline and flags the runner-up', () => {
    const rules = [
      makeRule({ label: 'Engine oil & filter', category: 'oil-change' }),
      makeRule({ label: 'Tire rotation', category: 'tire-rotation', customIntervalMiles: 5100 }),
    ]
    const v = verdictFor(rules, inputsAt('2026-07-01', 46200))
    expect(v.band).toBe('fix-now')
    expect(v.headline).toBe('2 things need attention now.')
    expect(v.sentence).toContain('past due too')
  })

  it('not-applicable rules are invisible to the verdict', () => {
    const rules = [
      makeRule(),
      makeRule({ label: 'CVT fluid', category: 'cvt-fluid', override: { kind: 'not-needed' } }),
    ]
    const v = verdictFor(rules, inputsAt('2026-07-01', 41000))
    expect(v.band).toBe('all-clear')
    expect(v.sentence).not.toContain('CVT')
  })

  it('an empty schedule is all-clear with a generic sentence', () => {
    const v = vehicleVerdict([])
    expect(v.band).toBe('all-clear')
    expect(v.sentence).toBe('Nothing on the schedule needs you.')
  })
})

describe('vehicleVerdict — ruler, coast list, confidence', () => {
  it('pins land inside their band zones and deeper overdue pins further left', () => {
    const mild = verdictFor([makeRule()], inputsAt('2026-07-01', 45200))
    const deep = verdictFor([makeRule()], inputsAt('2026-07-01', 48500))
    expect(mild.rulerPin).toBeGreaterThan(deep.rulerPin)
    expect(deep.rulerPin).toBeLessThan(25)

    const soon = verdictFor([makeRule()], inputsAt('2026-07-01', 44600))
    expect(soon.rulerPin).toBeGreaterThanOrEqual(25)
    expect(soon.rulerPin).toBeLessThan(50)

    const coast = verdictFor([makeRule()], inputsAt('2026-07-01', 44000))
    expect(coast.rulerPin).toBeGreaterThanOrEqual(50)
    expect(coast.rulerPin).toBeLessThan(75)

    const clear = verdictFor([makeRule()], inputsAt('2026-07-01', 41000))
    expect(clear.rulerPin).toBeGreaterThanOrEqual(75)
  })

  it('extra watch-next items become coast items; the sentence-carrier is not duplicated', () => {
    const rules = [
      makeRule({ label: 'Engine oil & filter', category: 'oil-change' }),
      makeRule({ label: 'Engine air filter', category: 'engine-air-filter', customIntervalMiles: 5200 }),
    ]
    const v = verdictFor(rules, inputsAt('2026-07-01', 44000))
    expect(v.band).toBe('coast')
    expect(v.sentence).toContain('engine oil & filter')
    expect(v.coastItems).toHaveLength(1)
    expect(v.coastItems[0].label).toBe('Engine air filter')
    expect(v.coastItems[0].window).toContain('mi')
  })

  it('date-only reminders speak in weeks and months, not raw day counts', () => {
    const rules = [makeRule({ customIntervalMiles: null, customIntervalMonths: 12, lastDoneDate: '2025-08-01' })]
    const v = verdictFor(rules, inputsAt('2026-07-15', null))
    expect(v.band).toBe('book-soon')
    expect(v.sentence).toContain('by Aug 2026')
    expect(v.safeWindow).toMatch(/weeks|days/)
  })

  it('an open concern that outranks the schedule takes over band, sentence, and pin', () => {
    // Schedule says coast (watch-next), but the driver flagged grinding brakes.
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 44000))
    const v = vehicleVerdict(reminders, [
      { title: 'Front brakes — worn to the metal', band: 'fix-now', createdDate: '2026-07-15' },
    ])
    expect(v.band).toBe('fix-now')
    expect(v.headline).toBe('One thing needs attention now.')
    expect(v.sentence).toContain('You flagged “Front brakes — worn to the metal” on Jul 15, 2026')
    expect(v.rulerPin).toBe(12)
    expect(v.safeWindow).toContain('this week')
  })

  it('on a band tie the schedule keeps the sentence; band concerns still count in the headline', () => {
    // Both the schedule (due-next) and a concern are book-soon.
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 44600))
    const v = vehicleVerdict(reminders, [
      { title: 'Squeal on first stops', band: 'book-soon', createdDate: '2026-07-10' },
    ])
    expect(v.band).toBe('book-soon')
    expect(v.headline).toBe('2 things to book soon.')
    expect(v.sentence).toContain('in ~400 mi') // schedule sentence, not the concern's
  })

  it('coast-band concerns join the coast list without changing an all-clear band sentence source', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 44000))
    const v = vehicleVerdict(reminders, [
      { title: 'Faint hum at highway speed', band: 'coast', createdDate: '2026-07-12' },
    ])
    expect(v.band).toBe('coast')
    // Tie on coast: the schedule's watch-next item keeps the sentence...
    expect(v.sentence).toContain('engine oil & filter')
    // ...and the concern shows on the list with its provenance.
    expect(v.coastItems.some((i) => i.label === 'Faint hum at highway speed' && i.window.includes('on your list'))).toBe(true)
  })

  it('a stale or missing odometer surfaces a confidence note, never a scarier band', () => {
    const withOdo = verdictFor([makeRule()], inputsAt('2026-07-01', 44600))
    expect(withOdo.confidenceNote).toBeNull()

    const noOdo = verdictFor(
      [makeRule({ customIntervalMiles: null, customIntervalMonths: 12, lastDoneDate: '2026-01-01' })],
      inputsAt('2026-07-01', null),
    )
    expect(noOdo.band).toBe('all-clear')
    expect(noOdo.confidenceNote).toContain('No odometer on file')
  })
})
