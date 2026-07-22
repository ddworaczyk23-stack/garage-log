import { describe, expect, it } from 'vitest'
import { canonicalVehicleId, matchesExistingVehicle } from '../src/domain/vehicleIdentity'
import type { Vehicle } from '../src/types'

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    name: 'Rogue SL',
    year: 2020,
    make: 'Nissan',
    model: 'Rogue',
    trim: 'SL',
    engine: '2.5L I4',
    drivetrain: 'FWD',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('canonicalVehicleId', () => {
  it('is stable for the same identity', () => {
    const a = canonicalVehicleId({ year: 2020, make: 'Nissan', model: 'Rogue', trim: 'SL' })
    const b = canonicalVehicleId({ year: 2020, make: 'Nissan', model: 'Rogue', trim: 'SL' })
    expect(a).toBe(b)
  })

  it('normalizes case and whitespace', () => {
    const a = canonicalVehicleId({ year: 2020, make: 'Nissan', model: 'Rogue', trim: 'SL' })
    const b = canonicalVehicleId({ year: 2020, make: ' nissan ', model: 'rogue', trim: 'sl' })
    expect(a).toBe(b)
  })

  it('differs when any field differs', () => {
    const base = canonicalVehicleId({ year: 2020, make: 'Nissan', model: 'Rogue', trim: 'SL' })
    expect(canonicalVehicleId({ year: 2021, make: 'Nissan', model: 'Rogue', trim: 'SL' })).not.toBe(base)
    expect(canonicalVehicleId({ year: 2020, make: 'Ford', model: 'Rogue', trim: 'SL' })).not.toBe(base)
    expect(canonicalVehicleId({ year: 2020, make: 'Nissan', model: 'Rogue', trim: 'SV' })).not.toBe(base)
  })
})

describe('matchesExistingVehicle', () => {
  it('matches by VIN, case-insensitively', () => {
    const existing = [vehicle({ vin: 'abc123' })]
    const match = matchesExistingVehicle(
      { vin: 'ABC123', year: 1999, make: 'Whatever', model: 'Whatever', trim: 'Whatever' },
      existing,
    )
    expect(match).toBe(existing[0])
  })

  it('falls back to exact year/make/model/trim when no VIN is given', () => {
    const existing = [vehicle()]
    const match = matchesExistingVehicle({ year: 2020, make: 'nissan', model: 'rogue', trim: 'sl' }, existing)
    expect(match).toBe(existing[0])
  })

  it('does not match a different vehicle', () => {
    const existing = [vehicle()]
    const match = matchesExistingVehicle({ year: 2021, make: 'Nissan', model: 'Rogue', trim: 'SL' }, existing)
    expect(match).toBeNull()
  })

  it('returns null when neither the VIN nor the identity match any existing vehicle', () => {
    const existing = [vehicle({ vin: 'ZZZ999' })]
    const match = matchesExistingVehicle(
      { vin: 'AAA111', year: 2018, make: 'Toyota', model: 'Camry', trim: 'LE' },
      existing,
    )
    expect(match).toBeNull()
  })

  it('falls back to an identity match when a given VIN does not match any existing vehicle', () => {
    // A mistyped/unset VIN shouldn't cause a duplicate when the rest of the
    // identity clearly matches an existing vehicle.
    const existing = [vehicle({ vin: 'ZZZ999' })]
    const match = matchesExistingVehicle(
      { vin: 'AAA111', year: 2020, make: 'Nissan', model: 'Rogue', trim: 'SL' },
      existing,
    )
    expect(match).toBe(existing[0])
  })
})
