import { describe, expect, it } from 'vitest'
import type { MaintenanceCategory, ReminderRule } from '../src/types'
import { computeVehicleReminders, type ReminderInputs } from '../src/domain/reminderEngine'
import { visitBundle } from '../src/domain/bundles'

// Built from REAL engine output (computeVehicleReminders), like verdict.test.ts,
// so a change to statuses or urgencyValue shows up here. Odometer 50,000 on
// 2026-10-14; urgency in days = min(days left, miles left / 12,000 * 365).

let seq = 0
function rule(category: MaintenanceCategory, overrides: Partial<ReminderRule> = {}): ReminderRule {
  seq += 1
  return {
    id: `car:rule-${seq}`,
    vehicleId: 'car',
    templateKey: 'car',
    category,
    label: category,
    customIntervalMiles: null,
    customIntervalMonths: null,
    lastDoneDate: '2026-01-01',
    lastDoneMiles: 40000,
    override: null,
    notes: null,
    source: 'manufacturer-default',
    ...overrides,
  }
}
const miles = (category: MaintenanceCategory, every: number, lastDoneMiles: number) =>
  rule(category, { customIntervalMiles: every, lastDoneMiles })
const months = (category: MaintenanceCategory, every: number, lastDoneDate: string) =>
  rule(category, { customIntervalMonths: every, lastDoneDate })

const at: ReminderInputs = { currentMiles: 50000, odometerAsOfDate: '2026-10-14', asOf: new Date('2026-10-14T00:00:00') }
const bundleOf = (rules: ReminderRule[]) => visitBundle(computeVehicleReminders(rules, [], at)).map((r) => r.rule.category)

const multiPoint = () => miles('multi-point-inspection', 10000, 40800) // 800 mi left, ~24 days
const oil = () => miles('oil-change', 5000, 46000) // 1,000 mi left, ~30 days
const airFilter = () => miles('engine-air-filter', 15000, 36400) // 1,400 mi left, ~43 days

describe('visitBundle', () => {
  it('groups near same-visit jobs, most urgent first', () => {
    expect(bundleOf([airFilter(), oil(), multiPoint()])).toEqual(['multi-point-inspection', 'oil-change', 'engine-air-filter'])
  })

  it('leaves out a near job that needs its own visit', () => {
    const plugs = miles('spark-plugs', 30000, 20900) // 900 mi left, but a bigger job
    expect(bundleOf([oil(), multiPoint(), plugs])).toEqual(['multi-point-inspection', 'oil-change'])
  })

  it('leaves out a same-visit job more than 60 days after the most urgent one', () => {
    const cabin = months('cabin-air-filter', 12, '2026-01-10') // due 2027-01-10, ~88 days
    expect(bundleOf([multiPoint(), oil(), cabin])).toEqual(['multi-point-inspection', 'oil-change'])
  })

  it('needs at least two jobs', () => {
    expect(bundleOf([oil()])).toEqual([])
  })

  it('ignores jobs with no logged history', () => {
    expect(bundleOf([oil(), rule('engine-air-filter', { customIntervalMiles: 15000, lastDoneDate: null, lastDoneMiles: null })])).toEqual([])
  })

  it('caps the group at five', () => {
    const rotation = miles('tire-rotation', 5000, 45500) // 500 mi left, ~15 days
    const tires = miles('tire-inspection', 10000, 40900) // 900 mi left, ~27 days
    const wipers = months('wiper-blades', 12, '2025-11-20') // due 2026-11-20, ~37 days
    expect(bundleOf([airFilter(), wipers, oil(), tires, multiPoint(), rotation])).toEqual([
      'tire-rotation',
      'multi-point-inspection',
      'tire-inspection',
      'oil-change',
      'wiper-blades',
    ])
  })

  it('an overdue job leads the group and still pulls in jobs due soon after', () => {
    const brakes = miles('brake-inspection', 10000, 39800) // 200 mi overdue
    expect(bundleOf([oil(), brakes, multiPoint()])).toEqual(['brake-inspection', 'multi-point-inspection', 'oil-change'])
  })
})
