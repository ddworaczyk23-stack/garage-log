import type { Vehicle } from '../types'

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
 * Deterministic key for one year/make/model/trim — lets `matchesExistingVehicle`
 * recognize two records as the same physical car without a VIN.
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
