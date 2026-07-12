import { CATEGORY_LABELS, MAINTENANCE_CATEGORIES } from '../types'
import type { MaintenanceCategory, VehicleIdentity } from '../types'

// Adapter for OEM/provider labor-time + parts-cost data. Like
// services/maintenanceProvider.ts, there is no free public API for this (real
// options are commercial: Vehicle Databases, MOTOR, CarsXE/CarAPI), so
// mockCostProvider below returns clearly-labeled sample data. Swapping in a
// real provider later means implementing CostProvider and changing the one
// export at the bottom — no other module needs to change. The actual dollar
// math lives in domain/costHeuristics.ts, not here — this only supplies raw
// hours/ranges.

export interface LaborEstimateItem {
  category: MaintenanceCategory
  label: string
  laborHours: number
  partsCostLow: number
  partsCostHigh: number
}

export interface LaborEstimateFetchResult {
  items: LaborEstimateItem[]
  source: string
}

export interface CostProvider {
  fetchLaborEstimates(identity: VehicleIdentity, categories: MaintenanceCategory[]): Promise<LaborEstimateFetchResult>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Rough, generic per-category placeholders — NOT vehicle-specific OEM labor
// times. A real provider would vary these by engine/trim/labor-op.
const SAMPLE_LABOR: Partial<Record<MaintenanceCategory, { hours: number; partsLow: number; partsHigh: number }>> = {
  'oil-change': { hours: 0.5, partsLow: 40, partsHigh: 90 },
  'tire-rotation': { hours: 0.4, partsLow: 0, partsHigh: 0 },
  'brake-inspection': { hours: 0.5, partsLow: 0, partsHigh: 250 },
  'cabin-air-filter': { hours: 0.3, partsLow: 15, partsHigh: 35 },
  'engine-air-filter': { hours: 0.3, partsLow: 15, partsHigh: 40 },
}

export const mockCostProvider: CostProvider = {
  async fetchLaborEstimates(identity, categories) {
    await delay(700)
    const items: LaborEstimateItem[] = categories
      .filter((c) => SAMPLE_LABOR[c])
      .map((category) => {
        const s = SAMPLE_LABOR[category]!
        return {
          category,
          label: CATEGORY_LABELS[category],
          laborHours: s.hours,
          partsCostLow: s.partsLow,
          partsCostHigh: s.partsHigh,
        }
      })
    return {
      items,
      source: `Sample data (no live provider connected) — ${identity.year} ${identity.make} ${identity.model}`,
    }
  },
}

// Single swap point: point this at a real implementation of CostProvider once
// one exists.
export const activeCostProvider: CostProvider = mockCostProvider

// Same 5-category subset services/maintenanceProvider.ts's mock uses, kept as
// its own literal (not imported) so this adapter has no hard dependency on
// that one — they only need to agree by convention while both are sample data.
export const SAMPLE_COST_CATEGORIES: MaintenanceCategory[] = MAINTENANCE_CATEGORIES.filter((c) =>
  ['oil-change', 'tire-rotation', 'brake-inspection', 'cabin-air-filter', 'engine-air-filter'].includes(c),
)
