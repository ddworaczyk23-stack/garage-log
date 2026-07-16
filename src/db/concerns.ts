import { db } from './db'
import type { Concern } from '../types'
import type { Playbook, PlaybookOutcome, Answers } from '../domain/playbooks'
import { localDateISO } from '../domain/format'

// ---------------------------------------------------------------------------
// Coast triage concerns — the only place concern rows are written (Stage 2).
//
// A concern is a snapshot of a triage verdict the driver chose to keep on their
// list. It is USER DATA and syncs across devices, so ids are globally unique
// `concern-<uuid>` (the same rule vehicle ids follow for Dexie Cloud — see
// db/seed.ts). Concerns live ALONGSIDE the reminder engine, never inside it:
// nothing here touches ReminderRule or recomputes a schedule status.
// ---------------------------------------------------------------------------

/** Open a new concern from a resolved triage verdict. Returns the new id. */
export async function openConcern(
  vehicleId: string,
  playbook: Playbook,
  outcome: PlaybookOutcome,
  answers: Answers,
): Promise<string> {
  const concern: Concern = {
    id: `concern-${crypto.randomUUID()}`,
    vehicleId,
    createdDate: localDateISO(new Date()),
    playbookId: playbook.id,
    outcomeId: outcome.id,
    answers: { ...answers },
    band: outcome.band,
    title: outcome.title,
    category: outcome.category ?? null,
    status: 'open',
    resolvedDate: null,
  }
  await db.concerns.add(concern)
  return concern.id
}

/** Mark a concern handled. Optionally record the event that resolved it. */
export async function resolveConcern(id: string, resolvedEventId?: string): Promise<void> {
  await db.concerns.update(id, {
    status: 'resolved',
    resolvedDate: localDateISO(new Date()),
    ...(resolvedEventId ? { resolvedEventId } : {}),
  })
}

/** Re-open a concern that was resolved by mistake. */
export async function reopenConcern(id: string): Promise<void> {
  await db.concerns.update(id, { status: 'open', resolvedDate: null, resolvedEventId: undefined })
}

export async function deleteConcern(id: string): Promise<void> {
  await db.concerns.delete(id)
}

/** A vehicle's OPEN concerns, newest first. Uses the compound index. */
export async function getOpenConcerns(vehicleId: string): Promise<Concern[]> {
  const rows = await db.concerns.where({ vehicleId, status: 'open' }).toArray()
  return rows.sort((a, b) => b.createdDate.localeCompare(a.createdDate))
}

/** All open concerns across every vehicle (for the dashboard verdict merge). */
export async function getAllOpenConcerns(): Promise<Concern[]> {
  return db.concerns.where('status').equals('open').toArray()
}
