import { db } from './db'
import {
  IMAGE_QUALITY,
  MAX_IMAGE_DIMENSION,
  fileTypeOf,
  fitWithin,
  keptSmaller,
  parseTags,
  shouldCompressImage,
  toJpegName,
  type DocumentIndexEntry,
  type DocSource,
} from '../domain/documents'
import { formatShortDate } from '../domain/format'
import { CATEGORY_LABELS, type MaintenanceEvent, type VehicleDocument } from '../types'

// The single write path for attachments (Milestone 7). Both the event forms and
// the vehicle "glovebox" go through storeDocument(), so image compression and
// the linkedTo bookkeeping live in exactly one place. Compression is best-effort
// and browser-only: any failure (or a blob that didn't get smaller) falls back
// to storing the original file untouched.

type LinkTarget = VehicleDocument['linkedTo']

interface PreparedDoc {
  blob: Blob
  mimeType: string
  filename: string
  sizeBytes: number
  optimized: boolean
  originalSizeBytes?: number
}

/** Re-encode an image File to a downscaled JPEG via canvas. Returns null if the
 * environment can't do it (no createImageBitmap / canvas context) or anything
 * throws — callers then keep the original. */
async function canvasCompress(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_DIMENSION)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return null
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', IMAGE_QUALITY),
    )
  } catch {
    return null
  }
}

/** Decide the final stored form of an uploaded file: compressed JPEG when that
 * meaningfully shrinks it, otherwise the original bytes as-is. */
export async function prepareDocument(file: File): Promise<PreparedDoc> {
  const asIs: PreparedDoc = {
    blob: file,
    mimeType: file.type || 'application/octet-stream',
    filename: file.name,
    sizeBytes: file.size,
    optimized: false,
  }
  if (!shouldCompressImage(file.type, file.size)) return asIs

  const compressed = await canvasCompress(file)
  if (compressed && keptSmaller(file.size, compressed.size)) {
    return {
      blob: compressed,
      mimeType: 'image/jpeg',
      filename: toJpegName(file.name),
      sizeBytes: compressed.size,
      optimized: true,
      originalSizeBytes: file.size,
    }
  }
  return asIs
}

async function storeDocument(file: File, linkedTo: LinkTarget): Promise<string> {
  const prepared = await prepareDocument(file)
  const id = `doc-${crypto.randomUUID()}`
  const doc: VehicleDocument = {
    id,
    blob: prepared.blob,
    mimeType: prepared.mimeType,
    filename: prepared.filename,
    sizeBytes: prepared.sizeBytes,
    createdAt: new Date().toISOString(),
    linkedTo,
  }
  if (prepared.optimized) {
    doc.optimized = true
    doc.originalSizeBytes = prepared.originalSizeBytes
  }
  await db.documents.add(doc)
  return id
}

/** Store a file attached to a service/repair event, returning its id. Called
 * from db/events.ts as part of logging/editing an event. */
export function attachEventDocument(eventId: string, file: File): Promise<string> {
  return storeDocument(file, { type: 'event', id: eventId })
}

/** Store a file attached directly to a vehicle (registration, insurance card,
 * owner's manual…) — not tied to any event. */
export function attachVehicleDocument(vehicleId: string, file: File): Promise<string> {
  return storeDocument(file, { type: 'vehicle', id: vehicleId })
}

/** Delete a single document. If it's attached to an event, also drop its id from
 * that event's documentIds so the two never disagree. (Deleting a whole event
 * bulk-deletes its docs directly in events.ts and doesn't need this.) */
export async function deleteDocument(id: string): Promise<void> {
  const doc = await db.documents.get(id)
  if (!doc) return
  if (doc.linkedTo.type === 'event') {
    const event = await db.events.get(doc.linkedTo.id)
    if (event) {
      await db.events.update(event.id, {
        documentIds: event.documentIds.filter((d) => d !== id),
      })
    }
  }
  await db.documents.delete(id)
}

/** All documents attached directly to a vehicle (not via an event). */
export function getVehicleLevelDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  return db.documents
    .where('[linkedTo.type+linkedTo.id]')
    .equals(['vehicle', vehicleId])
    .toArray()
}

// --- Browse index + organization (documents view) --------------------------

/** Join every stored document with its vehicle + (for event-linked docs) its
 * event, producing the rows the documents browser filters/sorts over. Reads all
 * three tables inside the caller's liveQuery, so the view is fully reactive.
 * `linkedTo` stays the source of truth — nothing is denormalized onto the doc. */
export async function buildDocumentIndex(): Promise<DocumentIndexEntry[]> {
  const [documents, vehicles, events] = await Promise.all([
    db.documents.toArray(),
    db.vehicles.toArray(),
    db.events.toArray(),
  ])
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]))
  const eventById = new Map(events.map((e) => [e.id, e]))

  const entries: DocumentIndexEntry[] = []
  for (const doc of documents) {
    if (doc.linkedTo.type === 'vehicle') {
      const vid = doc.linkedTo.id
      entries.push({
        doc,
        vehicleId: vid,
        vehicleName: vehicleName.get(vid) ?? 'Unknown vehicle',
        source: 'glovebox',
        eventId: null,
        context: 'Glovebox',
        date: doc.createdAt.slice(0, 10),
        fileType: fileTypeOf(doc.mimeType),
      })
      continue
    }
    const event = eventById.get(doc.linkedTo.id)
    if (!event) continue // orphan (shouldn't happen — deleteEvent bulk-deletes docs)
    entries.push({
      doc,
      vehicleId: event.vehicleId,
      vehicleName: vehicleName.get(event.vehicleId) ?? 'Unknown vehicle',
      source: event.kind as DocSource, // 'maintenance' | 'repair'
      eventId: event.id,
      context: `${event.title || CATEGORY_LABELS[event.category]} · ${formatShortDate(event.date)}`,
      date: event.date,
      fileType: fileTypeOf(doc.mimeType),
    })
  }
  return entries
}

/** Events on a vehicle, newest first — the candidate targets for reassigning a
 * document (used to populate the reassign picker). */
export function getVehicleEvents(vehicleId: string): Promise<MaintenanceEvent[]> {
  return db.events
    .where('vehicleId')
    .equals(vehicleId)
    .toArray()
    .then((rs) => rs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)))
}

/** Move a document to a different attachment target (another event on the SAME
 * vehicle, or the vehicle's glovebox). Only the attachment pointers move: the
 * doc's `linkedTo` and the two events' `documentIds` arrays. Event dates,
 * mileage, categories, and every other history field are untouched, so no
 * reminder recomputation is triggered and older history is preserved intact.
 * Cross-vehicle moves are rejected (the picker only offers same-vehicle targets,
 * this is the defensive backstop). */
export async function reassignDocument(
  docId: string,
  target: LinkTarget,
): Promise<void> {
  const doc = await db.documents.get(docId)
  if (!doc) return

  const currentVehicleId =
    doc.linkedTo.type === 'vehicle'
      ? doc.linkedTo.id
      : (await db.events.get(doc.linkedTo.id))?.vehicleId ?? null
  const targetVehicleId =
    target.type === 'vehicle' ? target.id : (await db.events.get(target.id))?.vehicleId ?? null

  if (!targetVehicleId || (currentVehicleId && currentVehicleId !== targetVehicleId)) return
  if (doc.linkedTo.type === target.type && doc.linkedTo.id === target.id) return // no-op

  // Detach from the old event (glovebox has no documentIds array to update).
  if (doc.linkedTo.type === 'event') {
    const prev = await db.events.get(doc.linkedTo.id)
    if (prev) {
      await db.events.update(prev.id, {
        documentIds: prev.documentIds.filter((d) => d !== docId),
      })
    }
  }
  // Attach to the new event.
  if (target.type === 'event') {
    const next = await db.events.get(target.id)
    if (!next) return
    if (!next.documentIds.includes(docId)) {
      await db.events.update(next.id, { documentIds: [...next.documentIds, docId] })
    }
  }
  await db.documents.update(docId, { linkedTo: target })
}

/** Replace a document's tags (parsed/cleaned from raw input). */
export async function setDocumentTags(docId: string, rawInput: string): Promise<void> {
  await db.documents.update(docId, { tags: parseTags(rawInput) })
}
