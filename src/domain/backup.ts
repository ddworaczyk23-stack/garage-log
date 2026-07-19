// Pure backup schema + validation (Milestone 8). No Dexie, no DOM — just the
// portable file shape and the checks a candidate file must pass before it's
// allowed anywhere near the database. The impure side (reading every table,
// blob<->base64, the wipe+restore transaction, file download) lives in
// db/backup.ts and depends on this.

import type {
  AppMetaRecord,
  Concern,
  MaintenanceEvent,
  OdometerReading,
  ReminderRule,
  Vehicle,
} from '../types'

/** Magic string identifying our backup files (guards against importing some
 * other JSON). */
export const BACKUP_FORMAT = 'garage-log-backup'
/** Backup FILE-FORMAT version — bump only if this envelope shape changes in a
 * breaking way. Independent of the Dexie schema version (`appSchemaVersion`).
 * v2: added the `concerns` table (Coast triage). v1 files (no concerns section)
 * still validate and restore — concerns default to empty. */
export const CURRENT_BACKUP_VERSION = 2

/** A VehicleDocument with its blob encoded as base64 so it survives JSON. The
 * blob itself is reconstructed on import; every other field is copied verbatim,
 * so `linkedTo`, tags, and the optimized/original-size metadata all round-trip. */
export interface SerializedDocument {
  id: string
  mimeType: string
  filename: string
  sizeBytes: number
  createdAt: string
  linkedTo: { type: 'event' | 'vehicle'; id: string }
  optimized?: boolean
  originalSizeBytes?: number
  tags?: string[]
  blobBase64: string
}

/** Every persisted table. reminderRules carries the user's overrides + cached
 * last-done; the static schedule templates are NOT included (they live in code
 * and are re-derived by seedIfEmpty on boot). */
export interface BackupData {
  vehicles: Vehicle[]
  odometerReadings: OdometerReading[]
  events: MaintenanceEvent[]
  reminderRules: ReminderRule[]
  appMeta: AppMetaRecord[]
  documents: SerializedDocument[]
  concerns: Concern[]
}

export type BackupTable = keyof BackupData

export const BACKUP_TABLES: BackupTable[] = [
  'vehicles',
  'odometerReadings',
  'events',
  'reminderRules',
  'appMeta',
  'documents',
  'concerns',
]

/** Human labels for the per-table counts shown in the UI summary. */
export const BACKUP_TABLE_LABELS: Record<BackupTable, string> = {
  vehicles: 'Vehicles',
  odometerReadings: 'Odometer readings',
  events: 'Service & repair events',
  reminderRules: 'Reminder rules & overrides',
  appMeta: 'App settings',
  documents: 'Documents',
  concerns: 'Triage concerns',
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number // backup format version (CURRENT_BACKUP_VERSION)
  appSchemaVersion: number // Dexie schema version at export time
  exportedAt: string // ISO timestamp
  counts: Record<BackupTable, number>
  data: BackupData
}

export type ValidationResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string }

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/**
 * Validate a parsed-JSON value before it's allowed to touch the DB. Returns a
 * typed result (never throws) so the UI can show a clear message. Checks, in
 * order: it's an object, it's our format, the format version isn't from the
 * future, the DB schema version isn't from the future, and every expected table
 * is present as an array (documents additionally need a base64 blob per row).
 */
export function validateBackup(raw: unknown, appSchemaVersion: number): ValidationResult {
  if (!isObject(raw)) return { ok: false, error: 'This file isn’t valid JSON or is empty.' }

  if (raw.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This isn’t a Coast backup file.' }
  }
  if (typeof raw.version !== 'number') {
    return { ok: false, error: 'Backup is missing a format version.' }
  }
  if (raw.version > CURRENT_BACKUP_VERSION) {
    return {
      ok: false,
      error: `This backup was made by a newer version of Coast (format v${raw.version}). Update the app, then restore.`,
    }
  }
  if (typeof raw.appSchemaVersion === 'number' && raw.appSchemaVersion > appSchemaVersion) {
    return {
      ok: false,
      error: `This backup uses a newer database schema (v${raw.appSchemaVersion}) than this app supports (v${appSchemaVersion}). Update the app, then restore.`,
    }
  }

  const data = raw.data
  if (!isObject(data)) return { ok: false, error: 'Backup is missing its data section.' }

  // v1 files predate the concerns table — normalize to empty so every consumer
  // downstream (summary, counts, import) can treat the section as always-present.
  if ((raw.version as number) < 2 && data.concerns === undefined) data.concerns = []

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(data[table])) {
      return { ok: false, error: `Backup is missing or has a malformed "${table}" section.` }
    }
  }

  const docs = data.documents as unknown[]
  for (const d of docs) {
    if (!isObject(d) || typeof d.id !== 'string' || typeof d.blobBase64 !== 'string') {
      return { ok: false, error: 'Backup has a malformed document entry (missing blob data).' }
    }
  }

  return { ok: true, backup: raw as unknown as BackupFile }
}

/** Ordered [label, count] pairs for the UI summary of a backup. */
export function summarizeBackup(backup: BackupFile): { label: string; count: number }[] {
  return BACKUP_TABLES.map((t) => ({
    label: BACKUP_TABLE_LABELS[t],
    count: backup.counts[t] ?? backup.data[t].length,
  }))
}

/** Deterministic download filename, e.g. garage-log-backup-2026-07-06.json. */
export function backupFilename(date: Date): string {
  return `garage-log-backup-${date.toISOString().slice(0, 10)}.json`
}
