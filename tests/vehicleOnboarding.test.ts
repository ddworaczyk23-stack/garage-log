import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/db'
import { addVehicle } from '../src/db/vehicleOnboarding'
import { GENERIC_TEMPLATE_KEY, SCHEDULE_TEMPLATES } from '../src/db/scheduleTemplates'
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
  await Promise.all([db.vehicles.clear(), db.reminderRules.clear()])
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
})
