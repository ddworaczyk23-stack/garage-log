import { db } from './db'
import { matchesExistingVehicle } from '../domain/vehicleIdentity'
import { GENERIC_TEMPLATE_KEY, rulesForVehicle } from './scheduleTemplates'
import type { Vehicle, VehicleIdentity } from '../types'

// New-vehicle onboarding: create the Vehicle record (+ its generic maintenance
// schedule) in one transaction. This used to also hydrate two sample-data
// "reference" datasets (factory maintenance + consensus/common-issues) — both
// were removed (see git history): the real thing would need real manufacturer
// schedules and crowd-sourced issue data, and there's no feasible source for
// either, so showing fabricated-looking placeholders instead was misleading
// rather than useful.

export interface AddVehicleInput {
  identity: VehicleIdentity
  engine: string
  drivetrain: string
}

export interface AddVehicleResult {
  vehicle: Vehicle
  created: boolean // false when an existing matching vehicle was reused instead
}

function vehicleNameFor(identity: VehicleIdentity): string {
  const trim = identity.trim.trim()
  if (!trim || trim.toLowerCase() === 'base') return identity.model
  return identity.model.includes(trim) ? identity.model : `${identity.model} ${trim}`
}

/**
 * Creates a vehicle record unless one already matches by VIN or exact
 * year/make/model/trim (domain/vehicleIdentity.ts), in which case the
 * existing record is returned instead — "Add Car" never duplicates the same
 * physical car.
 */
export async function addVehicle(input: AddVehicleInput): Promise<AddVehicleResult> {
  const existing = await db.vehicles.toArray()
  const dup = matchesExistingVehicle(input.identity, existing)
  if (dup) return { vehicle: dup, created: false }

  const vehicle: Vehicle = {
    id: `veh-${crypto.randomUUID()}`,
    name: vehicleNameFor(input.identity),
    year: input.identity.year,
    make: input.identity.make,
    model: input.identity.model,
    trim: input.identity.trim,
    engine: input.engine,
    drivetrain: input.drivetrain,
    vin: input.identity.vin,
    canonicalVehicleId: input.identity.canonicalVehicleId,
    createdAt: new Date().toISOString(),
  }
  // Vehicle + its generic maintenance schedule land together (one transaction:
  // a half-created vehicle with no rules would read "not set up" forever). The
  // generic template is the fallback for any car we don't have a curated
  // model schedule for — intervals personalize via custom overrides + logged
  // history from here. See GENERIC_TEMPLATE_KEY in scheduleTemplates.ts.
  await db.transaction('rw', db.vehicles, db.reminderRules, async () => {
    await db.vehicles.add(vehicle)
    await db.reminderRules.bulkAdd(rulesForVehicle(vehicle.id, GENERIC_TEMPLATE_KEY))
  })
  return { vehicle, created: true }
}
