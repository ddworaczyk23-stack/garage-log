import { describe, it, expect } from 'vitest'
import type { ReminderRule, Vehicle } from '../src/types'
import { computeVehicleReminders, type ReminderInputs } from '../src/domain/reminderEngine'
import { composeBrief, briefFromReminder, briefToText, type BriefFacts } from '../src/domain/shopBrief'

// Like tests/verdict.test.ts, the reminder-driven briefs are built from REAL
// engine output so this layer can't drift from the engine's shape.

const vehicle: Vehicle = {
  id: 'veh-test',
  name: 'F-150 STX',
  nickname: 'The truck',
  year: 2020,
  make: 'Ford',
  model: 'F-150',
  trim: 'STX',
  engine: '2.7L EcoBoost V6',
  drivetrain: '4WD',
}

function makeRule(overrides: Partial<ReminderRule> = {}): ReminderRule {
  return {
    id: 'veh-test:oil-change',
    vehicleId: 'veh-test',
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

const triageFacts: BriefFacts = {
  title: 'Front brakes — grinding',
  band: 'fix-now',
  symptom: 'Grinding noise from the front while braking, worse on the first stops of the day.',
  request: 'Please measure pad thickness and inspect rotor scoring before quoting only pads.',
  likelyCause: 'Pads fully worn through',
  costLow: 300,
  costHigh: 700,
  diyLow: 100,
  diyHigh: 300,
  escalationTriggers: ['The pedal pulses when braking', 'The truck pulls to one side'],
  fineToDecline: ['Engine or injection “flush” services'],
}

describe('composeBrief (triage-shaped facts)', () => {
  it('assembles vehicle, mileage, ranges, and copy verbatim', () => {
    const b = composeBrief(vehicle, 84231, triageFacts, { known: false }, '2026-07-15')
    expect(b.vehicleLine).toBe('2020 Ford F-150 STX') // canonical car, never the nickname
    expect(b.metaLine).toBe('84,231 mi · prepared Jul 15, 2026')
    expect(b.symptom).toContain('Grinding noise')
    expect(b.request).toContain('pad thickness')
    expect(b.fairRange).toBe('$300–700 at an independent shop')
    expect(b.diyNote).toBe('Doing it yourself: roughly $100–300 in parts.')
    expect(b.escalationTriggers).toHaveLength(2)
    expect(b.footerNote).toContain('written explanation')
  })

  it('does not duplicate a trim already baked into the model (seeded vehicles)', () => {
    const seeded = { ...vehicle, model: 'F-150 STX' } // seed.ts style: trim inside model AND in trim
    const b = composeBrief(seeded, 84231, triageFacts, { known: false }, '2026-07-15')
    expect(b.vehicleLine).toBe('2020 Ford F-150 STX')
  })

  it('unknown history adds the verify-before-replacing note; known history cites last-done', () => {
    const unknown = composeBrief(vehicle, 84231, triageFacts, { known: false }, '2026-07-15')
    expect(unknown.historyNotes[0]).toContain('history for this item is unknown')

    const known = composeBrief(
      vehicle,
      84231,
      triageFacts,
      { known: true, lastDoneDate: '2026-01-05', lastDoneMiles: 41800 },
      '2026-07-15',
    )
    expect(known.historyNotes[0]).toBe('Last done Jan 5, 2026 at 41,800 mi.')
  })

  it('degrades gracefully with minimal facts and missing mileage', () => {
    const b = composeBrief(vehicle, null, { title: 'Something', band: 'book-soon' }, { known: false }, '2026-07-15')
    expect(b.metaLine).toContain('mileage not on file')
    expect(b.symptom).toBe('No symptom — scheduled maintenance.')
    expect(b.request).toContain('confirm this service is actually needed')
    expect(b.fairRange).toBeNull()
    expect(b.diyNote).toBeNull()
    expect(b.footerNote).toBe('Please provide a written estimate before starting work.')
    // The generic decline line is always present so the section never renders empty.
    expect(b.fineToDecline.length).toBeGreaterThan(0)
  })
})

describe('briefToText', () => {
  it('mirrors every rendered field into shareable plain text', () => {
    const b = composeBrief(vehicle, 84231, triageFacts, { known: false }, '2026-07-15')
    const text = briefToText(b)
    expect(text).toContain('SHOP BRIEF — 2020 Ford F-150 STX')
    expect(text).toContain('84,231 mi · prepared Jul 15, 2026')
    expect(text).toContain('Symptom: Grinding noise')
    expect(text).toContain('Fair range: $300–700 at an independent shop')
    expect(text).toContain('Fine to decline today:')
    expect(text).toContain('- Engine or injection “flush” services')
    expect(text).toContain('history for this item is unknown')
  })
})

describe('briefFromReminder (schedule-driven, real engine output)', () => {
  it('an overdue oil change produces a curated brief with past-due framing', () => {
    const [r] = computeVehicleReminders([makeRule()], [], inputsAt('2026-07-01', 46200))
    expect(r.status).toBe('overdue')
    const b = briefFromReminder(vehicle, 46200, r, '2026-07-01')
    expect(b.band).toBe('fix-now')
    expect(b.title).toBe('Engine oil & filter')
    expect(b.symptom).toBe('Scheduled maintenance — 1,200 mi past due.')
    expect(b.request).toContain('factory spec') // curated oil-change request
    expect(b.fineToDecline.join(' ')).toContain('flush')
    expect(b.historyNotes[0]).toContain('Last done Jan 1, 2026')
  })

  it('a never-serviced rule flags unknown history', () => {
    const rule = makeRule({ lastDoneDate: null, lastDoneMiles: null, category: 'brake-fluid', label: 'Brake fluid' })
    const [r] = computeVehicleReminders([rule], [], inputsAt('2026-07-01', 46200))
    const b = briefFromReminder(vehicle, 46200, r, '2026-07-01')
    expect(b.historyNotes[0]).toContain('unknown')
  })

  it('a category without curated content falls back to the generic request', () => {
    const rule = makeRule({ category: 'wiper-blades', label: 'Wiper blades' })
    const [r] = computeVehicleReminders([rule], [], inputsAt('2026-07-01', 46200))
    const b = briefFromReminder(vehicle, 46200, r, '2026-07-01')
    expect(b.request).toContain('confirm this service is actually needed')
  })
})
