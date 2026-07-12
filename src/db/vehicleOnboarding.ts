import { db } from './db'
import { matchesExistingVehicle } from '../domain/vehicleIdentity'
import { activeMaintenanceProvider } from '../services/maintenanceProvider'
import { activeCostProvider, SAMPLE_COST_CATEGORIES } from '../services/costProvider'
import { practicalInterval } from '../domain/practicalTiming'
import { estimateCostRange, deriveCostConfidence, DEFAULT_LABOR_RATE_PER_HOUR } from '../domain/costHeuristics'
import type { ConsensusData, CostEstimateData, CostEstimateItem, FactoryMaintenanceData, Vehicle, VehicleIdentity } from '../types'

// New-vehicle onboarding: create the Vehicle record immediately, then hydrate
// two external, cache-by-canonicalVehicleId datasets (factory maintenance +
// consensus/common-issues) independently of each other and of vehicle
// creation. This data is READ-ONLY reference info shown on Vehicle Detail —
// it is deliberately NOT wired into ReminderRule or the reminders engine
// (scheduleTemplates.ts/reminderEngine.ts), since the current provider
// (services/maintenanceProvider.ts) is sample data, not a real source, and
// mixing sample data into the real due/overdue tracking would be misleading.

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
  await db.vehicles.add(vehicle)
  return { vehicle, created: true }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

/**
 * Fetches + stores the factory maintenance dataset for one canonical vehicle
 * id, reusing an already-cached successful fetch instead of re-fetching.
 * Writes a 'loading' row up front so the UI (via liveQuery) reacts instantly,
 * and retries the network call once before recording an error — safe to call
 * again later as a manual retry after a failure.
 */
export async function hydrateFactoryMaintenance(identity: VehicleIdentity): Promise<void> {
  const key = identity.canonicalVehicleId
  const cached = await db.factoryMaintenanceData.get(key)
  if (cached?.status === 'ok') return

  await db.factoryMaintenanceData.put({ canonicalVehicleId: key, status: 'loading', items: [], source: '', fetchedAt: null })
  try {
    const { items, source } = await withRetry(() => activeMaintenanceProvider.fetchFactoryMaintenance(identity))
    const row: FactoryMaintenanceData = {
      canonicalVehicleId: key,
      status: 'ok',
      items,
      source,
      fetchedAt: new Date().toISOString(),
    }
    await db.factoryMaintenanceData.put(row)
  } catch (err) {
    await db.factoryMaintenanceData.put({
      canonicalVehicleId: key,
      status: 'error',
      items: [],
      source: '',
      fetchedAt: null,
      error: err instanceof Error ? err.message : 'Could not fetch factory maintenance data.',
    })
  }
}

/** Same as hydrateFactoryMaintenance, for the consensus/common-issues dataset. */
export async function hydrateConsensusData(identity: VehicleIdentity): Promise<void> {
  const key = identity.canonicalVehicleId
  const cached = await db.consensusData.get(key)
  if (cached?.status === 'ok') return

  await db.consensusData.put({
    canonicalVehicleId: key,
    status: 'loading',
    summary: '',
    commonIssues: [],
    source: '',
    fetchedAt: null,
  })
  try {
    const { summary, commonIssues, source } = await withRetry(() =>
      activeMaintenanceProvider.fetchConsensusInfo(identity),
    )
    const row: ConsensusData = {
      canonicalVehicleId: key,
      status: 'ok',
      summary,
      commonIssues,
      source,
      fetchedAt: new Date().toISOString(),
    }
    await db.consensusData.put(row)
  } catch (err) {
    await db.consensusData.put({
      canonicalVehicleId: key,
      status: 'error',
      summary: '',
      commonIssues: [],
      source: '',
      fetchedAt: null,
      error: err instanceof Error ? err.message : 'Could not fetch consensus data.',
    })
  }
}

/**
 * Fetches + stores cost/timing estimates for one canonical vehicle id.
 * Combines the factory schedule (for the practical-timing heuristic input)
 * with provider labor-hour/parts-range data, then applies the local rate math
 * (domain/costHeuristics.ts) — same loading/cache/retry shape as the other
 * two hydrate functions above. Deliberately NOT wired into ReminderRule/the
 * reminders engine, same scope boundary as factory/consensus data.
 */
export async function hydrateCostEstimates(identity: VehicleIdentity): Promise<void> {
  const key = identity.canonicalVehicleId
  const cached = await db.costEstimateData.get(key)
  if (cached?.status === 'ok') return

  await db.costEstimateData.put({ canonicalVehicleId: key, status: 'loading', items: [], laborRateNote: '', source: '', fetchedAt: null })
  try {
    const [{ items: factoryItems }, { items: laborItems, source }] = await withRetry(() =>
      Promise.all([
        activeMaintenanceProvider.fetchFactoryMaintenance(identity),
        activeCostProvider.fetchLaborEstimates(identity, SAMPLE_COST_CATEGORIES),
      ]),
    )
    const factoryByCategory = new Map(factoryItems.map((i) => [i.category, i]))
    const items: CostEstimateItem[] = laborItems.map((li) => {
      const factory = factoryByCategory.get(li.category)
      const { interval, note } = factory
        ? practicalInterval(factory.interval, li.category)
        : { interval: { miles: null, months: null }, note: 'No factory interval available for this item.' }
      const { totalLow, totalHigh } = estimateCostRange(li.laborHours, li.partsCostLow, li.partsCostHigh)
      return {
        category: li.category,
        label: li.label,
        practicalInterval: interval,
        timingNote: note,
        laborHours: li.laborHours,
        laborRatePerHour: DEFAULT_LABOR_RATE_PER_HOUR,
        partsCostLow: li.partsCostLow,
        partsCostHigh: li.partsCostHigh,
        totalLow,
        totalHigh,
        // Sample provider only, for now — see deriveCostConfidence's doc comment.
        confidence: deriveCostConfidence(false, false),
      }
    })
    const row: CostEstimateData = {
      canonicalVehicleId: key,
      status: 'ok',
      items,
      laborRateNote: `Estimated at $${DEFAULT_LABOR_RATE_PER_HOUR}/hr (rough national average) plus a typical parts-cost range — actual local rates vary.`,
      source,
      fetchedAt: new Date().toISOString(),
    }
    await db.costEstimateData.put(row)
  } catch (err) {
    await db.costEstimateData.put({
      canonicalVehicleId: key,
      status: 'error',
      items: [],
      laborRateNote: '',
      source: '',
      fetchedAt: null,
      error: err instanceof Error ? err.message : 'Could not fetch cost estimate data.',
    })
  }
}

/**
 * Fetches all three external datasets for a vehicle's identity independently
 * — `Promise.allSettled` means one source failing never blocks or rolls back
 * the others. Call without awaiting from the UI so vehicle creation itself
 * stays instant; each dataset's own 'loading' row makes the in-progress state
 * visible via liveQuery regardless.
 */
export async function hydrateVehicleExternalData(identity: VehicleIdentity): Promise<void> {
  await Promise.allSettled([hydrateFactoryMaintenance(identity), hydrateConsensusData(identity), hydrateCostEstimates(identity)])
}
