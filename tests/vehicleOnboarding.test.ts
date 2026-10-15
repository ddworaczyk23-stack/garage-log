import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/db'
import { addVehicle } from '../src/db/vehicleOnboarding'
import { GENERIC_TEMPLATE_KEY, SCHEDULE_TEMPLATES } from '../src/db/scheduleTemplates'
import { traitsKey, type VehicleTraits } from '../src/db/traitTemplates'
import { seedIfEmpty } from '../src/db/seed'
import { resolveInterval } from '../src/domain/reminderStatus'
import { canonicalVehicleId } from '../src/domain/vehicleIdentity'
import type { VehicleIdentity } from '../src/types'

const identity: VehicleIdentity = {
  year: 2022,
  make: 'Honda',
  model: 'CR-V',
  trim: 'EX',
  canonicalVehicleId: canonicalVehicleId({ year: 2022, make: 'Honda', model: 'CR-V', trim: 'EX' }),
}

beforeEach(async () => {
  await Promise.all([db.vehicles.clear(), db.reminderRules.clear(), db.odometerReadings.clear()])
})

describe('addVehicle', () => {
  it('creates a new vehicle record', async () => {
    const result = await addVehicle({ identity, engine: '1.5L turbo I4', drivetrain: 'AWD' })
    expect(result.created).toBe(true)
    expect(result.vehicle.year).toBe(2022)
    expect(result.vehicle.canonicalVehicleId).toBe(identity.canonicalVehicleId)
    expect(await db.vehicles.count()).toBe(1)
  })

  it('creates the generic maintenance schedule alongside the vehicle', async () => {
    const result = await addVehicle({ identity, engine: '1.5L turbo I4', drivetrain: 'AWD' })
    const rules = await db.reminderRules.where('vehicleId').equals(result.vehicle.id).toArray()
    expect(rules.length).toBe(SCHEDULE_TEMPLATES[GENERIC_TEMPLATE_KEY].length)
    expect(rules.every((r) => r.templateKey === GENERIC_TEMPLATE_KEY)).toBe(true)
    // Rules resolve real intervals from the generic template.
    const oil = rules.find((r) => r.category === 'oil-change')!
    expect(resolveInterval(oil).miles).toBe(5000)
    // Fresh rules carry no history and no custom overrides.
    expect(rules.every((r) => r.lastDoneDate == null && r.customIntervalMiles == null)).toBe(true)
  })

  it('creates a trait schedule when traits are supplied', async () => {
    const traits: VehicleTraits = { power: 'diesel', trans: 'auto', drive: '4wd', belt: 'no' }
    const result = await addVehicle({ identity, engine: '3.0L diesel', drivetrain: '4WD', traits })
    const rules = await db.reminderRules.where('vehicleId').equals(result.vehicle.id).toArray()
    expect(rules.every((rule) => rule.templateKey === traitsKey(traits))).toBe(true)
    expect(rules.map((rule) => rule.category)).toEqual(expect.arrayContaining(['fuel-filter', 'transfer-case-fluid']))
    expect(rules.map((rule) => rule.category)).not.toContain('spark-plugs')
    expect(resolveInterval(rules.find((rule) => rule.category === 'fuel-filter')!).miles).toBe(15000)
  })

  it('persists schedule-review edits and a current-mileage reading atomically', async () => {
    const traits: VehicleTraits = { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'no' }
    const result = await addVehicle({
      identity,
      engine: '2.0L',
      drivetrain: 'FWD',
      traits,
      currentMiles: 40000,
      edits: {
        'engine-air-filter': { enabled: false, customMiles: null, customMonths: null, lastDoneDate: null, lastDoneMiles: null },
        'oil-change': { enabled: true, customMiles: 4000, customMonths: 5, lastDoneDate: '2026-01-01', lastDoneMiles: 39000 },
      },
    })
    const air = await db.reminderRules.get(`${result.vehicle.id}:engine-air-filter`)
    const oil = await db.reminderRules.get(`${result.vehicle.id}:oil-change`)
    expect(air?.override?.kind).toBe('not-needed')
    expect(oil?.customIntervalMiles).toBe(4000)
    expect(oil?.override).toMatchObject({ kind: 'already-replaced', atMiles: 39000 })
    expect(await db.odometerReadings.where('vehicleId').equals(result.vehicle.id).first()).toMatchObject({ miles: 40000, source: 'quick-log' })
  })

  it('does not duplicate rules when an existing vehicle is reused', async () => {
    await addVehicle({ identity, engine: 'X', drivetrain: 'Y' })
    const before = await db.reminderRules.count()
    const second = await addVehicle({ identity, engine: 'X', drivetrain: 'Y' })
    expect(second.created).toBe(false)
    expect(await db.reminderRules.count()).toBe(before)
  })

  it('reuses an existing vehicle instead of creating a duplicate (same VIN)', async () => {
    const withVin = { ...identity, vin: '1HGCM82633A004352' }
    const first = await addVehicle({ identity: withVin, engine: 'X', drivetrain: 'Y' })
    const second = await addVehicle({ identity: withVin, engine: 'X', drivetrain: 'Y' })
    expect(second.created).toBe(false)
    expect(second.vehicle.id).toBe(first.vehicle.id)
    expect(await db.vehicles.count()).toBe(1)
  })

  it('reuses an existing vehicle instead of creating a duplicate (same year/make/model/trim, no VIN)', async () => {
    const first = await addVehicle({ identity, engine: 'X', drivetrain: 'Y' })
    const second = await addVehicle({ identity, engine: 'X', drivetrain: 'Y' })
    expect(second.created).toBe(false)
    expect(second.vehicle.id).toBe(first.vehicle.id)
    expect(await db.vehicles.count()).toBe(1)
  })
})

describe('seedIfEmpty backfill', () => {
  it('gives a rule-less vehicle (pre-fix "Add Car" install) the generic schedule on next boot', async () => {
    // A vehicle that existed before addVehicle created rules: row only, no rules.
    await db.vehicles.add({
      id: 'veh-legacy-1',
      name: 'CR-V EX',
      year: 2022,
      make: 'Honda',
      model: 'CR-V',
      trim: 'EX',
      engine: '1.5L turbo I4',
      drivetrain: 'AWD',
      createdAt: new Date().toISOString(),
    })
    await seedIfEmpty()
    const rules = await db.reminderRules.where('vehicleId').equals('veh-legacy-1').toArray()
    expect(rules.length).toBe(SCHEDULE_TEMPLATES[GENERIC_TEMPLATE_KEY].length)
    expect(rules.every((r) => r.templateKey === GENERIC_TEMPLATE_KEY)).toBe(true)

    // Idempotent: a second boot adds nothing.
    const before = await db.reminderRules.count()
    await seedIfEmpty()
    expect(await db.reminderRules.count()).toBe(before)
  })

  it('never overwrites existing rules or user edits during backfill', async () => {
    const added = await addVehicle({ identity, engine: 'X', drivetrain: 'Y' })
    const oilId = `${added.vehicle.id}:oil-change`
    await db.reminderRules.update(oilId, { customIntervalMiles: 3000, lastDoneDate: '2026-01-01' })
    await seedIfEmpty()
    const oil = await db.reminderRules.get(oilId)
    expect(oil?.customIntervalMiles).toBe(3000)
    expect(oil?.lastDoneDate).toBe('2026-01-01')
  })

  it('reconciles a trait vehicle additively without adding or dropping rules', async () => {
    const traits: VehicleTraits = { power: 'hybrid', trans: 'none', drive: 'awd', belt: 'no' }
    const added = await addVehicle({ identity, engine: '2.5L hybrid', drivetrain: 'AWD', traits })
    const before = await db.reminderRules.where('vehicleId').equals(added.vehicle.id).toArray()
    await seedIfEmpty()
    const after = await db.reminderRules.where('vehicleId').equals(added.vehicle.id).toArray()
    expect(after.map((rule) => rule.id).sort()).toEqual(before.map((rule) => rule.id).sort())
  })
})
