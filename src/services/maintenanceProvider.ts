import { CATEGORY_LABELS, MAINTENANCE_CATEGORIES } from '../types'
import type { ConsensusIssue, FactoryMaintenanceItem, VehicleIdentity } from '../types'

// Adapter layer for the two "hydrate a new vehicle" data sources. There is no
// free public API for factory maintenance schedules or crowd-sourced
// common-issues data (unlike VIN decoding — see services/vinDecode.ts), so
// `mockMaintenanceProvider` below is sample data, clearly labeled as such via
// its `source` string. Swapping in a real provider later means implementing
// `MaintenanceProvider` and changing the one export at the bottom of this
// file — no other module (DB layer or UI) needs to change.

export interface FactoryMaintenanceFetchResult {
  items: FactoryMaintenanceItem[]
  source: string
}

export interface ConsensusFetchResult {
  summary: string
  commonIssues: ConsensusIssue[]
  source: string
}

export interface MaintenanceProvider {
  fetchFactoryMaintenance(identity: VehicleIdentity): Promise<FactoryMaintenanceFetchResult>
  fetchConsensusInfo(identity: VehicleIdentity): Promise<ConsensusFetchResult>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A handful of representative categories with generic intervals, reusing the
// app's own MAINTENANCE_CATEGORIES vocabulary rather than inventing a second
// one. Real factory schedules vary by vehicle; this is a placeholder shape.
const SAMPLE_CATEGORIES = MAINTENANCE_CATEGORIES.filter((c) =>
  ['oil-change', 'tire-rotation', 'brake-inspection', 'cabin-air-filter', 'engine-air-filter'].includes(c),
)

export const mockMaintenanceProvider: MaintenanceProvider = {
  async fetchFactoryMaintenance(identity) {
    await delay(600)
    const items: FactoryMaintenanceItem[] = SAMPLE_CATEGORIES.map((category, i) => ({
      category,
      label: CATEGORY_LABELS[category],
      interval: { miles: 5000 * (i + 1), months: null },
    }))
    return {
      items,
      source: `Sample data (no live provider connected) — ${identity.year} ${identity.make} ${identity.model}`,
    }
  },

  async fetchConsensusInfo(identity) {
    await delay(900)
    return {
      summary:
        `Placeholder consensus summary for the ${identity.year} ${identity.make} ${identity.model} ${identity.trim}. ` +
        'No real aggregation source is connected yet — this is sample text standing in for that dataset.',
      commonIssues: [
        {
          title: 'Sample issue A',
          description: 'Example of the kind of pattern a real consensus provider would surface.',
        },
        {
          title: 'Sample issue B',
          description: 'A second example entry, standing in until a real data source is wired up.',
        },
      ],
      source: 'Sample data (no live provider connected)',
    }
  },
}

// Single swap point: point this at a real implementation of MaintenanceProvider
// once one exists.
export const activeMaintenanceProvider: MaintenanceProvider = mockMaintenanceProvider
