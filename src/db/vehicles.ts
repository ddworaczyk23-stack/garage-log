import { db } from './db'

// Persist a vehicle's nickname. Stored trimmed; a blank value clears it, and the
// display label (domain/vehicle.ts vehicleLabel) then falls back to the seeded
// name. The change flows through liveQuery, so every screen relabels reactively.
export async function setVehicleNickname(id: string, nickname: string): Promise<void> {
  await db.vehicles.update(id, { nickname: nickname.trim() || undefined })
}

/**
 * Delete a vehicle and everything scoped to it: events (+ their attached
 * documents), odometer readings, reminder rules, and glovebox documents — all
 * inside one transaction, so a failure partway through leaves nothing
 * half-deleted. Deliberately does NOT touch factoryMaintenanceData/
 * consensusData: those are cached by canonicalVehicleId (see
 * db/vehicleOnboarding.ts), not vehicle id, and another vehicle sharing the
 * same year/make/model/trim may still be relying on that cached fetch.
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
