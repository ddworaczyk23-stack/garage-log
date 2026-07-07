import { db } from './db'
import { attachEventDocument } from './documents'
import { applyEventToRule, matchesRule } from '../domain/reminderEngine'
import type {
  MaintenanceCategory,
  MaintenanceEvent,
  OdometerReading,
  OverrideKind,
  ReminderRule,
} from '../types'

// Thin imperative wrapper around the pure reminder-engine helpers: this is
// where a logged service actually gets persisted and where the matching
// ReminderRule's cached "last completed" fields get synced. The engine itself
// (reminderEngine.ts) never touches Dexie — this module is the only place that
// writes as a result of completing a service, keeping the pure/impure boundary
// clean and the engine trivially unit-testable.

export interface EventInput {
  vehicleId: string
  kind: MaintenanceEvent['kind']
  date: string
  odometerMiles: number
  category: MaintenanceCategory
  title: string
  cost?: number
  vendor?: string
  notes?: string
  servicePerformed?: string
  parts?: string
  fluids?: string
  performedBy?: MaintenanceEvent['performedBy']
  symptom?: string
  diagnosis?: string
  fix?: string
  labor?: string
}

/** Optional rule-level change to apply alongside a logged event (service form's
 * "next due override" section). Reuses the same ReminderRule fields the
 * template admin view writes — no new override concept, just another writer. */
export interface RuleOverrideInput {
  overrideKind: OverrideKind | null
  overrideNote: string | null
  customIntervalMiles: number | null
  customIntervalMonths: number | null
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

/**
 * Log a completed maintenance/repair event, optionally attach files, and sync
 * the matching rule's cached last-done fields (only if this event is newer
 * than what's cached, so backfilling old history never regresses the current
 * due calculation). The event row itself is permanent history — later
 * interval/template edits never touch it. Returns the new event's id.
 */
export async function recordCompletedEvent(
  input: EventInput,
  files: File[] = [],
  ruleOverride?: RuleOverrideInput,
): Promise<string> {
  const event: MaintenanceEvent = stripUndefined({
    id: `evt-${crypto.randomUUID()}`,
    vehicleId: input.vehicleId,
    kind: input.kind,
    date: input.date,
    odometerMiles: input.odometerMiles,
    category: input.category,
    title: input.title,
    cost: input.cost ?? 0,
    vendor: input.vendor,
    notes: input.notes,
    servicePerformed: input.servicePerformed,
    parts: input.parts,
    fluids: input.fluids,
    performedBy: input.performedBy,
    symptom: input.symptom,
    diagnosis: input.diagnosis,
    fix: input.fix,
    labor: input.labor,
    documentIds: [],
  })

  await db.events.add(event)

  if (files.length) {
    const ids = await Promise.all(files.map((f) => attachEventDocument(event.id, f)))
    await db.events.update(event.id, { documentIds: ids })
  }

  const rule = await db.reminderRules.get(`${input.vehicleId}:${input.category}`)
  if (rule) {
    const patch = applyEventToRule(rule, event)
    await applyRulePatch(rule, patch, ruleOverride)
  }

  return event.id
}

/**
 * Edit an existing event. Because editing can change the date/mileage/category
 * that determined which event was "latest" for a rule, the affected rule(s)
 * are fully recomputed from remaining history afterward (syncRuleFromHistory)
 * rather than just adopted-if-newer — an edit can just as easily make a rule's
 * cached last-done regress (e.g. correcting a mis-typed future date) as advance.
 */
export async function updateEvent(
  id: string,
  patch: Partial<EventInput>,
  newFiles: File[] = [],
  removedDocumentIds: string[] = [],
  ruleOverride?: RuleOverrideInput,
): Promise<void> {
  const existing = await db.events.get(id)
  if (!existing) return

  if (removedDocumentIds.length) {
    await db.documents.bulkDelete(removedDocumentIds)
  }
  const keptDocIds = existing.documentIds.filter((docId) => !removedDocumentIds.includes(docId))
  const newDocIds = await Promise.all(newFiles.map((f) => attachEventDocument(id, f)))

  await db.events.update(id, stripUndefined({ ...patch, documentIds: [...keptDocIds, ...newDocIds] }))

  await syncRuleFromHistory(existing.vehicleId, existing.category)
  if (patch.category && patch.category !== existing.category) {
    await syncRuleFromHistory(existing.vehicleId, patch.category)
  }

  if (ruleOverride) {
    const category = patch.category ?? existing.category
    const rule = await db.reminderRules.get(`${existing.vehicleId}:${category}`)
    if (rule) await applyRuleOverride(rule.id, ruleOverride)
  }
}

/** Delete an event, its attached documents, and resync the matching rule's
 * cached last-done from whatever history remains (may regress to an earlier
 * event, or to null if this was the only one). */
export async function deleteEvent(id: string): Promise<void> {
  const event = await db.events.get(id)
  if (!event) return

  if (event.documentIds.length) await db.documents.bulkDelete(event.documentIds)
  await db.events.delete(id)
  await syncRuleFromHistory(event.vehicleId, event.category)
}

/** Recompute a rule's cached lastDoneDate/lastDoneMiles from ALL of a vehicle's
 * events in that category (not just "is this new event newer than cache"),
 * needed after an edit or delete that could change which event is latest. */
async function syncRuleFromHistory(vehicleId: string, category: MaintenanceCategory): Promise<void> {
  const rule = await db.reminderRules.get(`${vehicleId}:${category}`)
  if (!rule) return

  const events = await db.events.where('vehicleId').equals(vehicleId).toArray()
  let latest: MaintenanceEvent | null = null
  for (const e of events) {
    if (!matchesRule(e, rule)) continue
    if (!latest || e.date > latest.date) latest = e
  }

  await db.reminderRules.update(rule.id, {
    lastDoneDate: latest?.date ?? null,
    lastDoneMiles: latest?.odometerMiles ?? null,
  })
}

async function applyRulePatch(
  rule: ReminderRule,
  patch: Pick<ReminderRule, 'lastDoneDate' | 'lastDoneMiles'>,
  ruleOverride?: RuleOverrideInput,
): Promise<void> {
  await db.reminderRules.update(rule.id, patch)
  if (ruleOverride) await applyRuleOverride(rule.id, ruleOverride)
}

/** Apply a manual status override / custom interval to a rule — the same
 * shape TemplateAdmin writes, just reachable from the event-logging forms too. */
export async function applyRuleOverride(ruleId: string, input: RuleOverrideInput): Promise<void> {
  const override = input.overrideKind
    ? { kind: input.overrideKind, note: input.overrideNote, atDate: null, atMiles: null }
    : null
  await db.reminderRules.update(ruleId, {
    override,
    notes: input.overrideNote,
    customIntervalMiles: input.customIntervalMiles,
    customIntervalMonths: input.customIntervalMonths,
  })
}

/** Log a standalone odometer reading (not tied to a service event). */
export async function recordOdometerReading(
  vehicleId: string,
  miles: number,
  date: string,
): Promise<void> {
  const reading: OdometerReading = {
    id: `odo-${crypto.randomUUID()}`,
    vehicleId,
    date,
    miles,
    source: 'quick-log',
  }
  await db.odometerReadings.add(reading)
}

export async function updateOdometerReading(
  id: string,
  patch: { miles?: number; date?: string },
): Promise<void> {
  await db.odometerReadings.update(id, stripUndefined(patch))
}

export async function deleteOdometerReading(id: string): Promise<void> {
  await db.odometerReadings.delete(id)
}

/**
 * Best current mileage estimate for a vehicle: the most recent of its logged
 * odometer readings and its logged service events (whichever is newer), plus
 * the date it's as-of (used by the engine's stale-odometer check). Null if the
 * vehicle has no mileage data at all yet.
 */
export async function getCurrentMileageEstimate(
  vehicleId: string,
): Promise<{ miles: number; asOfDate: string } | null> {
  const [readings, events] = await Promise.all([
    db.odometerReadings.where('vehicleId').equals(vehicleId).toArray(),
    db.events.where('vehicleId').equals(vehicleId).toArray(),
  ])

  const candidates = [
    ...readings.map((r) => ({ miles: r.miles, asOfDate: r.date })),
    ...events.map((e) => ({ miles: e.odometerMiles, asOfDate: e.date })),
  ]
  if (!candidates.length) return null

  // Dates are day-only (no time component), so multiple readings logged the
  // same day are indistinguishable by date alone. Break ties by higher
  // mileage — the odometer only moves forward, so it's the more recent (and
  // more conservative for urgency) of same-day entries.
  return candidates.reduce((latest, c) =>
    c.asOfDate > latest.asOfDate || (c.asOfDate === latest.asOfDate && c.miles > latest.miles)
      ? c
      : latest,
  )
}
