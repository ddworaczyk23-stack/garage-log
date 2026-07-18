import Dexie, { type Table } from 'dexie'
import dexieCloud from 'dexie-cloud-addon'
import type {
  Vehicle,
  OdometerReading,
  MaintenanceEvent,
  VehicleDocument,
  ReminderRule,
  AppMetaRecord,
  FactoryMaintenanceData,
  ConsensusData,
  Concern,
} from '../types'

// Single IndexedDB database for the whole app.
//
// Index strings below list ONLY the indexed keys (Dexie stores the full object
// regardless). Add indexes in a new `.version(n)` block later — never edit
// version 1 once real data exists on a device.
export class GarageDB extends Dexie {
  vehicles!: Table<Vehicle, string>
  odometerReadings!: Table<OdometerReading, string>
  events!: Table<MaintenanceEvent, string>
  documents!: Table<VehicleDocument, string>
  reminderRules!: Table<ReminderRule, string>
  appMeta!: Table<AppMetaRecord, string>
  // Keyed by Vehicle.canonicalVehicleId (NOT vehicle id) so two vehicle
  // records that resolve to the same year/make/model/trim share one cached
  // fetch instead of duplicating it. See db/vehicleOnboarding.ts.
  factoryMaintenanceData!: Table<FactoryMaintenanceData, string>
  consensusData!: Table<ConsensusData, string>
  // Coast triage concerns (Stage 2). USER DATA — synced, globally-unique
  // `concern-<uuid>` primary keys (see db/concerns.ts).
  concerns!: Table<Concern, string>

  constructor() {
    super('garage-log', { addons: [dexieCloud] })
    this.version(1).stores({
      // `name` is indexed so vehicle lists can use `.orderBy('name')`.
      vehicles: 'id, name',
      odometerReadings: 'id, vehicleId, date',
      events: 'id, vehicleId, date, category',
      documents: 'id, [linkedTo.type+linkedTo.id]',
      reminderRules: 'id, vehicleId, category',
      appMeta: 'key',
    })
    // Added for the vehicle-onboarding flow: `vin` indexed so a new vehicle
    // can be deduped against an existing VIN, plus the two external-data
    // cache tables (see FactoryMaintenanceData/ConsensusData in types.ts).
    this.version(2).stores({
      vehicles: 'id, name, vin',
      factoryMaintenanceData: 'canonicalVehicleId',
      consensusData: 'canonicalVehicleId',
    })
    // ReminderRule.templateKey (see types.ts) was added here — like
    // VehicleDocument.optimized/tags in an earlier milestone, it's a
    // non-indexed field, so per this project's existing convention that
    // doesn't need its own .version() block; db/seed.ts backfills it for any
    // pre-existing local row.

    // Cost/timing-estimate cache table for the onboarding hydration flow
    // (db/vehicleOnboarding.ts's hydrateCostEstimates) — same reuse rationale
    // as factoryMaintenanceData/consensusData above.
    this.version(3).stores({
      costEstimateData: 'canonicalVehicleId',
    })

    // Coast Stage 2: triage concerns. `[vehicleId+status]` compound index so a
    // vehicle's OPEN concerns can be queried directly (mirrors the documents
    // `[linkedTo.type+linkedTo.id]` pattern). Synced like the core user tables
    // (NOT in unsyncedTables) — its primary keys are globally-unique uuids.
    this.version(4).stores({
      concerns: 'id, vehicleId, status, [vehicleId+status]',
    })

    // The cost/timing-estimate feature was removed (see git history) — drop its
    // table (`null` deletes it in Dexie). It only ever held a refetchable local
    // cache of sample data, so no user data is lost. The version(3) block above
    // is kept intact as history, per this file's "never edit an existing
    // version" rule.
    this.version(5).stores({
      costEstimateData: null,
    })

    // Dexie Cloud: every table above still works with its existing plain
    // string primary keys (no '@id' rewrite needed — see db/cloud.ts for why
    // seed.ts now generates random ids instead of the old hardcoded
    // 'f150-2020'/'rogue-2020', which Dexie Cloud requires to be globally
    // unique). `appMeta`/`factoryMaintenanceData`/`consensusData` are kept
    // local-only (unsyncedTables in db/cloud.ts) since their primary keys are
    // deterministic, not globally unique, and none of them hold user-entered
    // data worth syncing.
  }
}

export const db = new GarageDB()
