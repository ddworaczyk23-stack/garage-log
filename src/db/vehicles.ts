import { db } from './db'

// Persist a vehicle's nickname. Stored trimmed; a blank value clears it, and the
// display label (domain/vehicle.ts vehicleLabel) then falls back to the seeded
// name. The change flows through liveQuery, so every screen relabels reactively.
export async function setVehicleNickname(id: string, nickname: string): Promise<void> {
  await db.vehicles.update(id, { nickname: nickname.trim() || undefined })
}
