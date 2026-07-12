import type { Vehicle, VehicleIdentity } from '../types'

// Pure helpers for the vehicle-onboarding flow: turning a resolved
// year/make/model/trim into a stable cache key, and deciding whether a
// newly-entered vehicle is the same car as one already in the garage.

export interface IdentityFields {
  year: number
  make: string
  model: string
  trim: string
}

/** Lowercases + collapses whitespace so minor formatting differences match. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Deterministic key for one year/make/model/trim, used to cache/reuse fetched
 * factory-maintenance and consensus data across any vehicle records that
 * share the same identity (see FactoryMaintenanceData/ConsensusData).
 */
export function canonicalVehicleId(identity: IdentityFields): string {
  return [identity.year, normalize(identity.make), normalize(identity.model), normalize(identity.trim)].join('|')
}

/**
 * Finds an existing vehicle that's the same physical car as the one being
 * added, so "Add Car" never creates a duplicate record. VIN is the strongest
 * signal (exact match, case-insensitive); without one, fall back to an exact
 * year/make/model/trim match.
 */
export function matchesExistingVehicle(
  input: { vin?: string } & IdentityFields,
  existing: Vehicle[],
): Vehicle | null {
  const vin = input.vin?.trim().toUpperCase()
  if (vin) {
    const byVin = existing.find((v) => v.vin?.trim().toUpperCase() === vin)
    if (byVin) return byVin
  }
  const key = canonicalVehicleId(input)
  return existing.find((v) => canonicalVehicleId(v) === key) ?? null
}

/**
 * Rebuilds a VehicleIdentity from a stored Vehicle row (which has no `style`)
 * — used to retry/re-hydrate external data for a vehicle that already exists,
 * without needing to re-decode its VIN.
 */
export function identityFromVehicle(
  vehicle: Pick<Vehicle, 'vin' | 'year' | 'make' | 'model' | 'trim' | 'canonicalVehicleId'>,
): VehicleIdentity {
  return {
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim,
    canonicalVehicleId: vehicle.canonicalVehicleId ?? canonicalVehicleId(vehicle),
  }
}
