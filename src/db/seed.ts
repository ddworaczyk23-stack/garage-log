import { db } from './db'
import { cloudConfigured } from './cloud'
import type { Vehicle } from '../types'
import { GENERIC_TEMPLATE_KEY, rulesForVehicle } from './scheduleTemplates'

// The two household vehicles. `templateKey` is the fixed logical key into
// SCHEDULE_TEMPLATES (db/scheduleTemplates.ts) — the vehicle *id* itself is a
// fresh crypto.randomUUID() per install (see seedIfEmpty below), because Dexie
// Cloud requires primary keys to be globally unique across every synced user,
// and a hardcoded id would collide the moment two different users both seed
// "F-150 STX". Drivetrain/engine can be edited from the app in a later
// milestone.
export const SEED_VEHICLES: Omit<Vehicle, 'id' | 'createdAt'>[] = [
  {
    name: 'F-150 STX',
    year: 2020,
    make: 'Ford',
    model: 'F-150 STX',
    trim: 'STX',
    engine: '2.7L EcoBoost V6',
    drivetrain: '4WD',
  },
  {
    name: 'Rogue SL',
    year: 2020,
    make: 'Nissan',
    model: 'Rogue SL',
    trim: 'SL',
    engine: '2.5L I4',
    drivetrain: 'FWD',
  },
]

// Fixed logical template keys, matched to SEED_VEHICLES by array position.
// Stable forever — SCHEDULE_TEMPLATES is keyed by these, not by any vehicle id.
const SEED_TEMPLATE_KEYS = ['f150-2020', 'rogue-2020']

// rulesForVehicle now lives in scheduleTemplates.ts (shared with the "Add Car"
// flow in db/vehicleOnboarding.ts).

// Seed the two vehicles and reconcile their reminder rules against the current
// templates. Reconciliation is ADDITIVE and idempotent: it inserts any template
// item missing from the DB (by stable id) but never overwrites an existing rule,
// so user edits — adjusted intervals, overrides, notes, logged history — are
// preserved, and new template items (e.g. wiper blades) show up on next boot
// without a reset. Safe to call every boot.
export async function seedIfEmpty(): Promise<void> {
  // Only auto-create the two demo vehicles in a pure local-only build (no
  // Dexie Cloud configured, e.g. `npm run dev` with no VITE_DEXIE_CLOUD_URL).
  // Once cloud sync IS configured (the deployed app), every fresh empty local
  // database — a brand new family member's own account, or the original
  // owner's own second device before its first sync — would otherwise
  // independently create its own random-id copy of "F-150 STX"/"Rogue SL".
  // Those get claimed into whichever account logs in on that device (Dexie
  // Cloud stamps owner/realmId onto pre-existing unowned rows on first sync),
  // which either hands a brand-new user two vehicles they never added, or
  // duplicates the pair once two independently-seeded devices sync under the
  // same account (the bug that motivated this guard). So a cloud-configured
  // build always starts genuinely empty — "Add Car" (db/vehicleOnboarding.ts)
  // is the only way in.
  if (!cloudConfigured && (await db.vehicles.count()) === 0) {
    const now = new Date().toISOString()
    const seeded = SEED_VEHICLES.map((v) => ({
      ...v,
      id: `veh-${crypto.randomUUID()}`,
      createdAt: now,
    }))
    await db.vehicles.bulkAdd(seeded)
    const expected = seeded.flatMap((v, i) => rulesForVehicle(v.id, SEED_TEMPLATE_KEYS[i]))
    await db.reminderRules.bulkAdd(expected)
    return
  }

  // Backfill `templateKey` for any rule from before this field existed. Those
  // rules can only be the original F-150/Rogue rows (only "Add Car" vehicles
  // ever had no matching SCHEDULE_TEMPLATES entry, and they never got rules
  // seeded for them at all) — for those, `templateKey` was always implicitly
  // equal to `vehicleId`, since SCHEDULE_TEMPLATES used to be keyed by vehicleId.
  await db.reminderRules
    .filter((r) => !('templateKey' in r))
    .modify((r) => {
      ;(r as unknown as Record<string, unknown>).templateKey = r.vehicleId
    })

  // Reconcile against the current templates for every vehicle that has rules
  // (hand-seeded vehicles use their model template; "Add Car" vehicles use the
  // generic one — either way, new template items forward-fill on next boot).
  // ADDITIVELY: never overwrites an existing rule, so user edits are preserved.
  const existingRules = await db.reminderRules.toArray()
  const templateKeyByVehicle = new Map(existingRules.map((r) => [r.vehicleId, r.templateKey]))
  const expected = [...templateKeyByVehicle.entries()].flatMap(([vehicleId, templateKey]) =>
    rulesForVehicle(vehicleId, templateKey),
  )
  const existingIds = new Set(existingRules.map((r) => r.id))
  const missing = expected.filter((r) => !existingIds.has(r.id))
  if (missing.length) await db.reminderRules.bulkAdd(missing)

  // Backfill: any vehicle with NO rules at all gets the generic schedule.
  // Covers vehicles added via "Add Car" before that flow created rules (it does
  // now — db/vehicleOnboarding.ts), so existing installs pick up a real
  // maintenance schedule on next boot instead of showing "No schedule items".
  const ruledVehicleIds = new Set(existingRules.map((r) => r.vehicleId))
  const allVehicles = await db.vehicles.toArray()
  const ruleless = allVehicles.filter((v) => !ruledVehicleIds.has(v.id))
  if (ruleless.length) {
    await db.reminderRules.bulkAdd(
      ruleless.flatMap((v) => rulesForVehicle(v.id, GENERIC_TEMPLATE_KEY)),
    )
  }

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
