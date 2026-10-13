import type { Vehicle } from '../types'

// Pure display helper: the label shown for a vehicle is its user nickname when
// set (non-blank), otherwise the seeded name. Used everywhere a vehicle is named
// so a nickname propagates consistently across the app.
export function vehicleLabel(vehicle: Pick<Vehicle, 'name' | 'nickname'>): string {
  return vehicle.nickname?.trim() || vehicle.name
}
