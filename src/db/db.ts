import Dexie, { type Table } from 'dexie'
import type {
  Vehicle,
  OdometerReading,
  MaintenanceEvent,
  VehicleDocument,
  ReminderRule,
  AppMetaRecord,
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

  constructor() {
    super('garage-log')
    this.version(1).stores({
      // `name` is indexed so vehicle lists can use `.orderBy('name')`.
      vehicles: 'id, name',
      odometerReadings: 'id, vehicleId, date',
      events: 'id, vehicleId, date, category',
      documents: 'id, [linkedTo.type+linkedTo.id]',
      reminderRules: 'id, vehicleId, category',
      appMeta: 'key',
    })
  }
}

export const db = new GarageDB()
