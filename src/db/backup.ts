import { db } from './db'
import {
  BACKUP_FORMAT,
  CURRENT_BACKUP_VERSION,
  type BackupData,
  type BackupFile,
  type BackupTable,
  type SerializedDocument,
} from '../domain/backup'
import type { VehicleDocument } from '../types'

// The impure half of Milestone 8: reads every table, turns document blobs into
// base64 for a single portable JSON file, and restores that file by wiping the
// database and re-inserting everything inside ONE transaction (so a failed
// restore can't leave a half-populated, relationship-broken DB). The static
// schedule templates are intentionally NOT exported — they're code, re-derived
// by seedIfEmpty() on the next boot, which also forward-fills any template items
// a newer app version added since the backup was made.

// --- blob <-> base64 (chunked so large blobs don't blow the call stack) -----

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

// --- export -----------------------------------------------------------------

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

function serializeDocument(d: VehicleDocument, blobBase64: string): SerializedDocument {
  const out: SerializedDocument = {
    id: d.id,
    mimeType: d.mimeType,
    filename: d.filename,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
    linkedTo: d.linkedTo,
    blobBase64,
  }
  if (d.optimized) {
    out.optimized = true
    out.originalSizeBytes = d.originalSizeBytes
  }
  if (d.tags && d.tags.length) out.tags = d.tags
  return out
}

/** Read the whole garage into a portable, deterministic backup object. Records
 * are sorted by stable id (documents/appMeta included) so re-exporting unchanged
 * data yields byte-identical JSON. */
export async function exportGarage(): Promise<BackupFile> {
  const [vehicles, odometerReadings, events, reminderRules, appMeta, documents] = await Promise.all([
    db.vehicles.toArray(),
    db.odometerReadings.toArray(),
    db.events.toArray(),
    db.reminderRules.toArray(),
    db.appMeta.toArray(),
    db.documents.toArray(),
  ])

  const sortedDocs = documents.sort(byId)
  const serializedDocs = await Promise.all(
    sortedDocs.map(async (d) => serializeDocument(d, await blobToBase64(d.blob))),
  )

  const data: BackupData = {
    vehicles: vehicles.sort(byId),
    odometerReadings: odometerReadings.sort(byId),
    events: events.sort(byId),
    reminderRules: reminderRules.sort(byId),
    appMeta: appMeta.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    documents: serializedDocs,
  }

  const counts = Object.fromEntries(
    (Object.keys(data) as BackupTable[]).map((t) => [t, data[t].length]),
  ) as Record<BackupTable, number>

  return {
    format: BACKUP_FORMAT,
    version: CURRENT_BACKUP_VERSION,
    appSchemaVersion: db.verno,
    exportedAt: new Date().toISOString(),
    counts,
    data,
  }
}

/** Pretty-printed JSON for the download (2-space indent = diffable + inspectable). */
export function serializeBackupToJson(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

// --- restore ----------------------------------------------------------------

function deserializeDocument(sd: SerializedDocument): VehicleDocument {
  const doc: VehicleDocument = {
    id: sd.id,
    blob: base64ToBlob(sd.blobBase64, sd.mimeType),
    mimeType: sd.mimeType,
    filename: sd.filename,
    sizeBytes: sd.sizeBytes,
    createdAt: sd.createdAt,
    linkedTo: sd.linkedTo,
  }
  if (sd.optimized) {
    doc.optimized = true
    doc.originalSizeBytes = sd.originalSizeBytes
  }
  if (sd.tags && sd.tags.length) doc.tags = sd.tags
  return doc
}

/**
 * REPLACE the entire local database with the backup's contents. This is a full
 * restore, not a merge: every table is cleared and repopulated inside one
 * read/write transaction, so either the whole garage is swapped atomically or —
 * if anything throws — nothing changes. Records keep their original ids, so all
 * relationships (event.documentIds ↔ document.id, document.linkedTo ↔ event/
 * vehicle id, reminderRule `${vehicleId}:${category}` ids) are preserved exactly.
 * Caller is responsible for validating the file first (validateBackup).
 */
export async function importGarage(backup: BackupFile): Promise<void> {
  const documents = backup.data.documents.map(deserializeDocument)

  await db.transaction(
    'rw',
    [db.vehicles, db.odometerReadings, db.events, db.documents, db.reminderRules, db.appMeta],
    async () => {
      await Promise.all([
        db.vehicles.clear(),
        db.odometerReadings.clear(),
        db.events.clear(),
        db.documents.clear(),
        db.reminderRules.clear(),
        db.appMeta.clear(),
      ])
      await db.vehicles.bulkPut(backup.data.vehicles)
      await db.odometerReadings.bulkPut(backup.data.odometerReadings)
      await db.events.bulkPut(backup.data.events)
      await db.reminderRules.bulkPut(backup.data.reminderRules)
      await db.appMeta.bulkPut(backup.data.appMeta)
      await db.documents.bulkPut(documents)
    },
  )
}

// --- browser file I/O (no-ops in the pure test env, exercised in the browser) --

/** Trigger a download of the JSON as a file. */
export function downloadBackup(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Read a picked file and JSON.parse it. Throws on unreadable/invalid JSON —
 * the caller catches and routes to validateBackup / an error message. */
export async function readBackupFile(file: File): Promise<unknown> {
  const text = await file.text()
  return JSON.parse(text)
}
