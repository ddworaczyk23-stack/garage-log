import { db } from './db'
import { canonicalVehicleId } from '../domain/vehicleIdentity'
import type { Vehicle } from '../types'

// Persist a vehicle's nickname. Stored trimmed; a blank value clears it, and the
// display label (domain/vehicle.ts vehicleLabel) then falls back to the seeded
// name. The change flows through liveQuery, so every screen relabels reactively.
export async function setVehicleNickname(id: string, nickname: string): Promise<void> {
  await db.vehicles.update(id, { nickname: nickname.trim() || undefined })
}

// Set (or clear) a vehicle's manual average miles/year. Pass null to clear and
// fall back to the history-calculated average. A non-positive value is treated
// as "clear". Flows through liveQuery so projected due dates recompute.
export async function setAnnualMileageOverride(id: string, value: number | null): Promise<void> {
  await db.vehicles.update(id, {
    annualMileageOverride: value != null && value > 0 ? value : undefined,
  })
}

// Editable subset of a vehicle's specifications. Deliberately excludes id,
// createdAt, nickname (its own editor), and templateKey-linked identity used by
// the reminder rules — rules key off vehicleId + a fixed templateKey, so editing
// these display/identity fields never disturbs the schedule or logged history.
export interface VehicleSpecsPatch {
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  vin?: string
}

/**
 * Update a vehicle's specs after creation. For a vehicle onboarded via "Add
 * Car" (one with a canonicalVehicleId), if the identity fields change we
 * recompute that key so future dedup checks (matchesExistingVehicle) still
 * treat it as the same car. The two hand-seeded vehicles have no
 * canonicalVehicleId and are left without one. Reminder rules are untouched
 * — they reference vehicleId + a fixed templateKey.
 */
export async function setVehicleSpecs(id: string, patch: VehicleSpecsPatch): Promise<void> {
  const existing = await db.vehicles.get(id)
  if (!existing) return

  const update: Partial<Vehicle> = {
    year: patch.year,
    make: patch.make.trim(),
    model: patch.model.trim(),
    trim: patch.trim.trim(),
    engine: patch.engine.trim(),
    drivetrain: patch.drivetrain.trim(),
    vin: patch.vin?.trim() || undefined,
  }

  if (existing.canonicalVehicleId) {
    update.canonicalVehicleId = canonicalVehicleId({
      year: patch.year,
      make: patch.make,
      model: patch.model,
      trim: patch.trim,
    })
  }

  await db.vehicles.update(id, update)
}

/**
 * Delete a vehicle and everything scoped to it: events (+ their attached
 * documents), odometer readings, reminder rules, and glovebox documents — all
 * inside one transaction, so a failure partway through leaves nothing
 * half-deleted.
 */
export async function deleteVehicle(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.vehicles, db.events, db.odometerReadings, db.documents, db.reminderRules],
    async () => {
      const events = await db.events.where('vehicleId').equals(id).toArray()
      const eventDocIds = events.flatMap((e) => e.documentIds)
      const gloveboxDocIds = await db.documents
        .where('[linkedTo.type+linkedTo.id]')
        .equals(['vehicle', id])
        .primaryKeys()

      await Promise.all([
        db.documents.bulkDelete([...eventDocIds, ...gloveboxDocIds]),
        db.events.where('vehicleId').equals(id).delete(),
        db.odometerReadings.where('vehicleId').equals(id).delete(),
        db.reminderRules.where('vehicleId').equals(id).delete(),
      ])
      await db.vehicles.delete(id)
    },
  )
}
