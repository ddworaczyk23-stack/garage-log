import { describe, it, expect } from 'vitest'
import type { MaintenanceEvent, ReminderRule } from '../src/types'
import { computeVehicleReminders, type ReminderInputs } from '../src/domain/reminderEngine'
import { bandFromStatus, knownReminders, vehicleVerdict, BAND_LABELS, compactSign, garageTally, comingUp, recentWork } from '../src/domain/verdict'
import { localDateISO } from '../src/domain/format'

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
  return vehicleVerdict(computeVehicleReminders(rules, [], inputs), [], localDateISO(inputs.asOf))
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

function workEvent(id: string, date: string, title: string, cost = 0): MaintenanceEvent {
  return {
    id,
    vehicleId: 'veh',
    kind: 'maintenance',
    date,
    odometerMiles: 100,
    category: 'oil-change',
    title,
    cost,
    documentIds: [],
  }
}

describe('recentWork', () => {
  it('mixes cars newest-first, retains input order on a date tie, and caps rows', () => {
    const rows = recentWork([
      { vehicleId: 'truck', vehicleName: 'Truck', events: [workEvent('a', '2026-03-02', 'Oil change', 50), workEvent('b', '2026-02-01', 'Rotation')] },
      { vehicleId: 'rogue', vehicleName: 'Rogue', events: [workEvent('c', '2026-03-02', 'Wipers', 20), workEvent('d', '2026-03-03', 'Brakes', 300)] },
    ], 3)
    expect(rows.map((row) => `${row.vehicleName}: ${row.title}`)).toEqual(['Rogue: Brakes', 'Truck: Oil change', 'Rogue: Wipers'])
    expect(rows[1]).toMatchObject({ vehicleId: 'truck', cost: 50, date: '2026-03-02' })
  })
})

describe('knownReminders', () => {
  it('excludes a never-logged service even when its factory projection says it is due', () => {
    const reminders = computeVehicleReminders(
      [
        makeRule({ category: 'brake-inspection', label: 'Brake inspection', lastDoneDate: null, lastDoneMiles: null }),
        makeRule({ category: 'oil-change', label: 'Engine oil & filter' }),
      ],
      [],
      inputsAt('2026-07-01', 49_600),
    )

    expect(reminders.find((r) => r.rule.category === 'brake-inspection')?.status).toBe('due-next')
    expect(knownReminders(reminders).map((r) => r.rule.category)).toEqual(['oil-change'])
  })
})

describe('vehicleVerdict — band selection', () => {
  it('an overdue SAFETY item makes the vehicle fix-now, naming the item and the overshoot', () => {
    const v = verdictFor([makeRule({ label: 'Brake inspection', category: 'brake-inspection' })], inputsAt('2026-07-01', 46200))
    expect(v.band).toBe('fix-now')
    expect(v.headline).toBe('One thing needs attention now.')
    expect(v.sentence).toContain('Brake inspection')
    expect(v.sentence).toContain('1,200 mi past due')
    expect(v.safeWindow).toContain('this week')
  })

  it('an overdue ROUTINE item is amber book-soon, not red (calm on money)', () => {
    const v = verdictFor([makeRule({ label: 'Engine oil & filter' })], inputsAt('2026-07-01', 46200))
    expect(v.band).toBe('book-soon')
    expect(v.headline).toBe('One thing to book soon.')
    expect(v.sentence).toContain('1,200 mi past due')
    expect(v.sentence).toContain('routine')
    expect(v.rulerPin).toBeGreaterThanOrEqual(25)
    expect(v.rulerPin).toBeLessThan(50)
    expect(v.actionItems[0].window).toBe('1,200 mi past due')
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
      makeRule({ label: 'Brake inspection', category: 'brake-inspection' }),
      makeRule({ label: 'Brake fluid', category: 'brake-fluid', customIntervalMiles: 5100 }),
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

  it('an empty schedule is not-set-up, never all-clear', () => {
    const v = vehicleVerdict([], [], '2026-07-01')
    expect(v.band).toBe('not-set-up')
    expect(v.headline).toBe('Not set up yet.')
    expect(v.sentence).toBe(
      "Coast doesn't know this car yet. Log your last oil change (or import your service history) and real verdicts start.",
    )
    expect(v.rulerPin).toBeNull()
    expect(v.coastItems).toEqual([])
  })

  it('rules with no history AND no odometer are not-set-up — baseline statuses are not knowledge', () => {
    const rules = [
      makeRule({ lastDoneDate: null, lastDoneMiles: null }),
      makeRule({ lastDoneDate: null, lastDoneMiles: null, category: 'tire-rotation' }),
    ]
    const v = verdictFor(rules, inputsAt('2026-07-01', null))
    expect(v.band).toBe('not-set-up')
    expect(v.rulerPin).toBeNull()
  })

  it('an odometer reading alone is NOT real data — stays not-set-up (Earned Green Rule)', () => {
    // A bare odometer reading tells us where the car is, not what's been done
    // to it. Counting it as "real data" here is exactly how a car with zero
    // logged service history used to earn a green all-clear verdict.
    const rules = [makeRule({ lastDoneDate: null, lastDoneMiles: null })]
    const v = verdictFor(rules, inputsAt('2026-07-01', 46200))
    expect(v.band).toBe('not-set-up')
    expect(v.rulerPin).toBeNull()
  })

  it('a real logged history entry on at least one rule IS real data — not not-set-up', () => {
    const rules = [
      makeRule(), // has lastDoneDate/lastDoneMiles from the default fixture
      makeRule({ lastDoneDate: null, lastDoneMiles: null, category: 'tire-rotation' }),
    ]
    const v = verdictFor(rules, inputsAt('2026-07-01', 46200))
    expect(v.band).not.toBe('not-set-up')
  })

  it('a never-serviced item never projects to all-clear/completed, however far out', () => {
    // Regression for the Earned Green Rule violation: a never-serviced item
    // whose projected next occurrence is far in the future used to classify
    // as 'completed', which could make an entire never-serviced vehicle read
    // as green "all clear". It must read as watch-next ("can coast") at most.
    const rules = [makeRule({ lastDoneDate: null, lastDoneMiles: null, customIntervalMiles: 105000 })]
    const reminders = computeVehicleReminders(rules, [], inputsAt('2026-07-01', 200))
    expect(reminders[0].status).toBe('watch-next')
    expect(reminders[0].status).not.toBe('completed')
  })

  it('a concern on an unknown vehicle drives the verdict; baseline reminders stay excluded', () => {
    const rules = [
      makeRule({ lastDoneDate: null, lastDoneMiles: null }),
      makeRule({ lastDoneDate: null, lastDoneMiles: null, category: 'tire-rotation' }),
    ]
    const reminders = computeVehicleReminders(rules, [], inputsAt('2026-07-01', null))
    const v = vehicleVerdict(
      reminders,
      [{ title: 'Brake pads worn to the metal', band: 'fix-now', createdDate: '2026-06-30' }],
      '2026-07-01',
    )
    expect(v.band).toBe('fix-now')
    expect(v.headline).toBe('One thing needs attention now.')
    expect(v.sentence).toContain('Brake pads worn to the metal')
    // Exactly the concern — the two data-free baseline reminders don't count.
    expect(v.coastItems).toEqual([])
  })

  it('an all-clear concern alone cannot rescue an unknown vehicle from not-set-up', () => {
    const v = vehicleVerdict(
      [],
      [{ title: 'Probably just condensation', band: 'all-clear', createdDate: '2026-06-30' }],
      '2026-07-01',
    )
    expect(v.band).toBe('not-set-up')
  })
})

describe('vehicleVerdict — ruler, coast list, confidence', () => {
  it('pins land inside their band zones and deeper overdue pins further left', () => {
    const mild = verdictFor([makeRule({ label: 'Brake inspection', category: 'brake-inspection' })], inputsAt('2026-07-01', 45200))
    const deep = verdictFor([makeRule({ label: 'Brake inspection', category: 'brake-inspection' })], inputsAt('2026-07-01', 48500))
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
    const v = vehicleVerdict(
      reminders,
      [{ title: 'Front brakes — worn to the metal', band: 'fix-now', createdDate: '2026-07-15' }],
      '2026-07-15', // same day it was flagged — still fresh, so the date shows
    )
    expect(v.band).toBe('fix-now')
    expect(v.headline).toBe('One thing needs attention now.')
    expect(v.sentence).toContain('You flagged “Front brakes — worn to the metal” on Jul 15, 2026')
    expect(v.rulerPin).toBe(12)
    expect(v.safeWindow).toContain('this week')
  })

  it('a fix-now concern open 14+ days states its age instead of a now-stale-looking date', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 44000))
    const v = vehicleVerdict(
      reminders,
      [{ title: 'Front brakes — worn to the metal', band: 'fix-now', createdDate: '2026-03-01' }],
      '2026-07-15', // ~19 weeks after createdDate
    )
    expect(v.sentence).toContain('19 weeks ago')
    expect(v.sentence).not.toContain('on Mar 1, 2026')
  })

  it('a fix-now concern just under the age threshold still shows the date', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 44000))
    const v = vehicleVerdict(
      reminders,
      [{ title: 'Front brakes — worn to the metal', band: 'fix-now', createdDate: '2026-07-05' }],
      '2026-07-15', // 10 days later — under the 14-day threshold
    )
    expect(v.sentence).toContain('on Jul 5, 2026')
    expect(v.sentence).not.toContain('weeks ago')
  })

  it('on a band tie the schedule keeps the sentence; band concerns still count in the headline', () => {
    // Both the schedule (due-next) and a concern are book-soon.
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 44600))
    const v = vehicleVerdict(
      reminders,
      [{ title: 'Squeal on first stops', band: 'book-soon', createdDate: '2026-07-10' }],
      '2026-07-15',
    )
    expect(v.band).toBe('book-soon')
    expect(v.headline).toBe('2 things to book soon.')
    expect(v.sentence).toContain('in ~400 mi') // schedule sentence, not the concern's
  })

  it('coast-band concerns join the coast list without changing an all-clear band sentence source', () => {
    const reminders = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 44000))
    const v = vehicleVerdict(
      reminders,
      [{ title: 'Faint hum at highway speed', band: 'coast', createdDate: '2026-07-12' }],
      '2026-07-15',
    )
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

describe('vehicleVerdict — never-logged items are Unknown, not urgent', () => {
  // One real oil change, plus a never-logged item whose factory projection
  // lands inside the due window (45,000 mi with the car at 44,800).
  const logged = () => makeRule({ label: 'Engine oil & filter', lastDoneDate: '2026-06-20', lastDoneMiles: 44700 })
  const unknown = () =>
    makeRule({ label: 'Tire rotation', category: 'tire-rotation', lastDoneDate: null, lastDoneMiles: null })

  it('a projected-due item with no history never drives the band or the headline', () => {
    const v = verdictFor([logged(), unknown()], inputsAt('2026-07-01', 44800))
    expect(v.band).toBe('all-clear')
    expect(v.actionItems).toEqual([])
    expect(v.unknownCount).toBe(1)
    expect(v.headline).toBe('All clear on what’s logged.')
    expect(v.sentence).toMatch(/^Nothing you’ve logged is due\./)
  })

  it('actionItems lists the logged items behind the headline, worst first', () => {
    const overdue = makeRule({ label: 'Brake inspection', category: 'brake-inspection', lastDoneMiles: 39000, lastDoneDate: '2026-01-01' })
    const v = verdictFor([overdue, unknown()], inputsAt('2026-07-01', 44800))
    expect(v.band).toBe('fix-now')
    expect(v.actionItems.map((i) => i.label)).toEqual(['Brake inspection'])
    expect(v.unknownCount).toBe(1)
  })

  it('a car with no history at all stays not-set-up with unknownCount 0', () => {
    const v = verdictFor([unknown()], inputsAt('2026-07-01', 44800))
    expect(v.band).toBe('not-set-up')
    expect(v.unknownCount).toBe(0)
  })
})

describe('Home helpers', () => {
  const at = inputsAt('2026-10-14', 50000)
  // Oil every 5,000 mi from 40,000 -> 5,000 mi overdue (book soon: not safety).
  const oil = () => makeRule({ category: 'oil-change', label: 'Engine oil & filter' })
  // Brakes every 10,000 mi from 30,000 -> overdue and safety -> fix now.
  const brakes = () => makeRule({ category: 'brake-inspection', label: 'Brake inspection', customIntervalMiles: 10000, lastDoneMiles: 30000 })
  // Rotation every 15,000 from 36,000 -> due at 51,000: 1,000 mi out -> watch-next.
  const rotation = () => makeRule({ category: 'tire-rotation', label: 'Tire rotation', customIntervalMiles: 15000, lastDoneMiles: 36000 })

  it('compactSign names the single item behind a fix-now sign and lists the rest', () => {
    const sign = compactSign(verdictFor([brakes(), oil()], at))
    expect(sign.headline).toBe('Brake inspection is overdue')
    expect(sign.also).toEqual({ text: 'Also: Engine oil & filter, book soon', band: 'book-soon' })
  })

  it('compactSign keeps the counted headline when several items share the band', () => {
    const sign = compactSign(verdictFor([oil(), makeRule({ category: 'cabin-air-filter', label: 'Cabin air filter', customIntervalMiles: 5000 })], at))
    expect(sign.headline).toBe('2 things to book soon')
    expect(sign.also?.text).toBe('Engine oil & filter and cabin air filter')
  })

  it('compactSign on a car with no history says so', () => {
    const sign = compactSign(verdictFor([makeRule({ lastDoneDate: null, lastDoneMiles: null })], at))
    expect(sign.headline).toBe('Not set up yet')
    expect(sign.also?.band).toBe('not-set-up')
  })

  it('garageTally counts every fix-now and book-soon item plus open concerns', () => {
    const reminders = computeVehicleReminders([brakes(), oil()], [], at)
    const tally = garageTally([
      { reminders, openConcerns: [] },
      { reminders: computeVehicleReminders([oil()], [], at), openConcerns: [{ title: 'Squeal', band: 'book-soon', createdDate: '2026-10-01' }] },
    ])
    expect(tally).toEqual({ fixNow: 1, bookSoon: 3 })
  })

  it('comingUp lists only can-coast items, across cars', () => {
    const items = comingUp([
      { vehicleId: 'a', vehicleName: 'F-150', reminders: computeVehicleReminders([brakes(), rotation()], [], at) },
      { vehicleId: 'b', vehicleName: 'Rogue', reminders: computeVehicleReminders([oil()], [], at) },
    ])
    expect(items.map((i) => `${i.vehicleName}: ${i.label}`)).toEqual(['F-150: Tire rotation'])
  })

  // Air filter every 15,000 from 36,400 -> 1,400 mi out: watch-next, after rotation.
  const airFilter = () => makeRule({ category: 'engine-air-filter', label: 'Engine air filter', customIntervalMiles: 15000, lastDoneMiles: 36400 })

  it('compactSign on a coast car names the most urgent item as Next', () => {
    const sign = compactSign(verdictFor([airFilter(), rotation()], at))
    expect(sign.also?.text).toMatch(/^Next: Tire rotation/)
  })

  it('comingUp ranks like the engine, so its first item matches the car card', () => {
    const items = comingUp([
      { vehicleId: 'a', vehicleName: 'F-150', reminders: computeVehicleReminders([airFilter(), rotation()], [], at) },
    ])
    expect(items.map((i) => i.label)).toEqual(['Tire rotation', 'Engine air filter'])
  })

  it('a mileage-bound item names the date the miles arrive, not the far calendar date', () => {
    // Cabin filter every 20,000 mi or 24 months, done 2025-06-01 at 30,600:
    // 600 mi left (~18 days at 12k/yr) while the 24-month date is Jun 2027.
    const cabin = makeRule({ category: 'cabin-air-filter', label: 'Cabin air filter', customIntervalMiles: 20000, customIntervalMonths: 24, lastDoneDate: '2025-06-01', lastDoneMiles: 30600 })
    expect(compactSign(verdictFor([cabin], at)).also?.text).toBe('Next: Cabin air filter in ~600 mi (around Nov 2026)')
  })

  it('comingUp shows the date when the calendar comes due before the miles', () => {
    // Oil every 5,000 mi or 6 months, done 2026-06-14 at 48,000: 3,000 mi left
    // (~91 days at 12k/yr) but the 6-month date (Dec 14) is ~61 days out.
    const oilByDate = makeRule({ label: 'Engine oil & filter', customIntervalMonths: 6, lastDoneDate: '2026-06-14', lastDoneMiles: 48000 })
    const items = comingUp([{ vehicleId: 'a', vehicleName: 'F-150', reminders: computeVehicleReminders([oilByDate], [], at) }])
    expect(items[0]?.window).toBe('by Dec 2026')
  })
})
