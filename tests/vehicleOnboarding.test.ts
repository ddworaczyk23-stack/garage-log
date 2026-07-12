import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../src/db/db'
import { addVehicle, hydrateFactoryMaintenance, hydrateConsensusData, hydrateCostEstimates } from '../src/db/vehicleOnboarding'
import { canonicalVehicleId } from '../src/domain/vehicleIdentity'
import type { VehicleIdentity } from '../src/types'

vi.mock('../src/services/maintenanceProvider', () => ({
  activeMaintenanceProvider: {
    fetchFactoryMaintenance: vi.fn(),
    fetchConsensusInfo: vi.fn(),
  },
}))
vi.mock('../src/services/costProvider', () => ({
  activeCostProvider: { fetchLaborEstimates: vi.fn() },
  SAMPLE_COST_CATEGORIES: ['oil-change'],
}))

import { activeMaintenanceProvider } from '../src/services/maintenanceProvider'
import { activeCostProvider } from '../src/services/costProvider'

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
    db.costEstimateData.clear(),
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

describe('hydrateCostEstimates', () => {
  it('stores an ok row combining factory + labor data into cost/timing items', async () => {
    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockResolvedValue({
      items: [{ category: 'oil-change', label: 'Engine oil & filter', interval: { miles: 10000, months: 12 } }],
      source: 'test-schedule-provider',
    })
    vi.mocked(activeCostProvider.fetchLaborEstimates).mockResolvedValue({
      items: [{ category: 'oil-change', label: 'Engine oil & filter', laborHours: 0.5, partsCostLow: 40, partsCostHigh: 90 }],
      source: 'test-cost-provider',
    })
    await hydrateCostEstimates(identity)
    const row = await db.costEstimateData.get(identity.canonicalVehicleId)
    expect(row?.status).toBe('ok')
    expect(row?.items).toHaveLength(1)
    expect(row?.items[0].practicalInterval.miles).toBeLessThan(10000)
    expect(row?.items[0].totalLow).toBeLessThanOrEqual(row!.items[0].totalHigh)
    expect(row?.source).toBe('test-cost-provider')
  })

  it('stores an error row when every retry attempt fails', async () => {
    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockRejectedValue(new Error('boom'))
    vi.mocked(activeCostProvider.fetchLaborEstimates).mockResolvedValue({ items: [], source: 'x' })
    await expect(hydrateCostEstimates(identity)).resolves.toBeUndefined()
    const row = await db.costEstimateData.get(identity.canonicalVehicleId)
    expect(row?.status).toBe('error')
  })

  it('does not re-fetch when a successful result is already cached', async () => {
    vi.mocked(activeMaintenanceProvider.fetchFactoryMaintenance).mockResolvedValue({ items: [], source: 'x' })
    vi.mocked(activeCostProvider.fetchLaborEstimates).mockResolvedValue({ items: [], source: 'x' })
    await hydrateCostEstimates(identity)
    await hydrateCostEstimates(identity)
    expect(activeCostProvider.fetchLaborEstimates).toHaveBeenCalledTimes(1)
  })
})
