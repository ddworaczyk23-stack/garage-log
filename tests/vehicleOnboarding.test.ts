import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../src/db/db'
import { addVehicle, hydrateFactoryMaintenance, hydrateConsensusData } from '../src/db/vehicleOnboarding'
import { canonicalVehicleId } from '../src/domain/vehicleIdentity'
import type { VehicleIdentity } from '../src/types'

vi.mock('../src/services/maintenanceProvider', () => ({
  activeMaintenanceProvider: {
    fetchFactoryMaintenance: vi.fn(),
    fetchConsensusInfo: vi.fn(),
  },
}))

import { activeMaintenanceProvider } from '../src/services/maintenanceProvider'

const identity: VehicleIdentity = {
  year: 2022,
  make: 'Honda',
  model: 'CR-V',
  trim: 'EX',
  canonicalVehicleId: canonicalVehicleId({ year: 2022, make: 'Honda', model: 'CR-V', trim: 'EX' }),
}

beforeEach(async () => {
  await Promise.all([
    db.vehicles.clear(),
    db.factoryMaintenanceData.clear(),
    db.consensusData.clear(),
  ])
  vi.clearAllMocks()
})

describe('addVehicle', () => {
  it('creates a new vehicle record', async () => {
    const result = await addVehicle({ identity, engine: '1.5L turbo I4', drivetrain: 'AWD' })
    expect(result.created).toBe(true)
    expect(result.vehicle.year).toBe(2022)
    expect(result.vehicle.canonicalVehicleId).toBe(identity.canonicalVehicleId)
    expect(await db.vehicles.count()).toBe(1)
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

describe('hydrateFactoryMaintenance / hydrateConsensusData', () => {
  it('stores an ok row on success, with source and fetchedAt set', async () => {
    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockResolvedValue({
      items: [{ category: 'oil-change', label: 'Engine oil & filter', interval: { miles: 5000, months: null } }],
      source: 'test-provider',
    })
    await hydrateFactoryMaintenance(identity)
    const row = await db.factoryMaintenanceData.get(identity.canonicalVehicleId)
    expect(row?.status).toBe('ok')
    expect(row?.items).toHaveLength(1)
    expect(row?.source).toBe('test-provider')
    expect(row?.fetchedAt).not.toBeNull()
  })

  it('stores an error row when every retry attempt fails, and does not throw', async () => {
    vi.mocked(activeMaintenanceProvider.fetchConsensusInfo).mockRejectedValue(new Error('boom'))
    await expect(hydrateConsensusData(identity)).resolves.toBeUndefined()
    const row = await db.consensusData.get(identity.canonicalVehicleId)
    expect(row?.status).toBe('error')
    expect(row?.error).toBe('boom')
    expect(activeMaintenanceProvider.fetchConsensusInfo).toHaveBeenCalledTimes(2) // 2 retry attempts
  })

  it('does not re-fetch when a successful result is already cached', async () => {
    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockResolvedValue({
      items: [],
      source: 'test-provider',
    })
    await hydrateFactoryMaintenance(identity)
    await hydrateFactoryMaintenance(identity)
    expect(activeMaintenanceProvider.fetchFactoryMaintenance).toHaveBeenCalledTimes(1)
  })

  it('retries after a previous error (does not treat an error row as cached)', async () => {
    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockRejectedValueOnce(new Error('first fails'))
    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockRejectedValueOnce(new Error('first fails'))
    await hydrateFactoryMaintenance(identity)
    expect((await db.factoryMaintenanceData.get(identity.canonicalVehicleId))?.status).toBe('error')

    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockResolvedValue({
      items: [],
      source: 'test-provider',
    })
    await hydrateFactoryMaintenance(identity)
    expect((await db.factoryMaintenanceData.get(identity.canonicalVehicleId))?.status).toBe('ok')
  })
})
