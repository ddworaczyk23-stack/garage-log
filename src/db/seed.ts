import { db } from './db'
import type { Vehicle, ReminderRule } from '../types'
import { CATEGORY_LABELS } from '../types'
import { SCHEDULE_TEMPLATES } from './scheduleTemplates'

// The two household vehicles. Stable string ids so re-imports/backups dedupe
// cleanly later. Drivetrain/engine can be edited from the app in a later
// milestone.
export const SEED_VEHICLES: Omit<Vehicle, 'createdAt'>[] = [
  {
    id: 'f150-2020',
    name: 'F-150 STX',
    year: 2020,
    make: 'Ford',
    model: 'F-150 STX',
    trim: 'STX',
    engine: '2.7L EcoBoost V6',
    drivetrain: '4WD',
  },
  {
    id: 'rogue-2020',
    name: 'Rogue SL',
    year: 2020,
    make: 'Nissan',
    model: 'Rogue SL',
    trim: 'SL',
    engine: '2.5L I4',
    drivetrain: 'FWD',
  },
]

// Build the initial ReminderRule set for one vehicle from its schedule template.
// Rule id is `${vehicleId}:${category}` so it's stable across re-seeds/imports.
// Rules store NO interval of their own by default — the effective interval is
// resolved from the template (consensus ?? factory) unless the user sets a
// custom override. lastDone* start null (never serviced yet).
function rulesForVehicle(vehicleId: string): ReminderRule[] {
  const entries = SCHEDULE_TEMPLATES[vehicleId] ?? []
  return entries.map((e) => ({
    id: `${vehicleId}:${e.category}`,
    vehicleId,
    category: e.category,
    label: e.label ?? CATEGORY_LABELS[e.category],
    customIntervalMiles: null,
    customIntervalMonths: null,
    lastDoneDate: null,
    lastDoneMiles: null,
    override: null,
    notes: null,
    source: 'manufacturer-default',
  }))
}

// Seed the two vehicles and reconcile their reminder rules against the current
// templates. Reconciliation is ADDITIVE and idempotent: it inserts any template
// item missing from the DB (by stable id) but never overwrites an existing rule,
// so user edits — adjusted intervals, overrides, notes, logged history — are
// preserved, and new template items (e.g. wiper blades) show up on next boot
// without a reset. Safe to call every boot.
export async function seedIfEmpty(): Promise<void> {
  if ((await db.vehicles.count()) === 0) {
    const now = new Date().toISOString()
    await db.vehicles.bulkAdd(SEED_VEHICLES.map((v) => ({ ...v, createdAt: now })))
  }

  const expected = SEED_VEHICLES.flatMap((v) => rulesForVehicle(v.id))
  const existingIds = new Set(await db.reminderRules.toCollection().primaryKeys())
  const missing = expected.filter((r) => !existingIds.has(r.id))
  if (missing.length) await db.reminderRules.bulkAdd(missing)

  // Migrate rules from earlier builds to the current shape (no index change, so
  // a plain data migration rather than a Dexie version bump). Older rules carried
  // a single effective interval (intervalMiles/Months) and no custom/override
  // fields. Those were seeded defaults, NOT user choices, so we drop them and let
  // the interval resolve from the template again — never inventing a custom
  // override. Any real user override lives in customInterval*, which we preserve.
  await db.reminderRules
    .filter((r) => !('customIntervalMiles' in r) || !('override' in r))
    .modify((r) => {
      const rec = r as unknown as Record<string, unknown>
      if (!('customIntervalMiles' in rec)) {
        rec.customIntervalMiles = null
        rec.customIntervalMonths = null
      }
      if (!('override' in rec)) {
        rec.override = null
        rec.notes = null
      }
      delete rec.intervalMiles
      delete rec.intervalMonths
    })
}
