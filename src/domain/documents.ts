// Pure, framework-free document helpers (Milestone 7). No Dexie, no canvas, no
// DOM — just the decisions and math around storing/compressing attachments plus
// the browse/filter/tag logic, so they're trivially unit-testable. The impure
// side (canvas re-encode, IndexedDB writes, the events↔documents join) lives in
// db/documents.ts and calls into these.

import type { VehicleDocument } from '../types'

/** Longest-edge cap for stored images. Phone receipt photos are commonly
 * 3000–4000 px; 1600 keeps text readable while shrinking the blob a lot. */
export const MAX_IMAGE_DIMENSION = 1600
/** JPEG quality used when re-encoding. */
export const IMAGE_QUALITY = 0.8
/** Below this we don't bother compressing — the re-encode overhead isn't worth
 * it and tiny thumbnails/PDF-less images stay pixel-perfect. */
export const MIN_COMPRESS_BYTES = 200 * 1024
/** Raster types we can safely re-encode to JPEG. (PDFs, SVGs, etc. pass through
 * untouched.) */
export const COMPRESSIBLE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Scale (w,h) down to fit within `max` on the longest edge, preserving aspect
 * ratio. Never upscales. Returns integer dimensions ≥ 1. */
export function fitWithin(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(w, h)
  if (longest <= max || longest === 0) return { width: w, height: h }
  const scale = max / longest
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

/** Whether we should attempt to compress this upload at all. */
export function shouldCompressImage(mimeType: string, sizeBytes: number): boolean {
  return COMPRESSIBLE_TYPES.includes(mimeType) && sizeBytes > MIN_COMPRESS_BYTES
}

/** Keep a re-encoded candidate only if it's meaningfully smaller (≥10%) than the
 * original — otherwise we'd trade a lossy re-encode for negligible savings. */
export function keptSmaller(originalBytes: number, candidateBytes: number): boolean {
  return candidateBytes > 0 && candidateBytes < originalBytes * 0.9
}

/** Swap a filename's extension to .jpg (used when an image is re-encoded to JPEG
 * so the stored name matches its new type). Leaves extension-less names alone
 * apart from appending. */
export function toJpegName(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  return `${base}.jpg`
}

/** Human-friendly byte size: 940 B, 4.2 KB, 3.1 MB. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const kb = n / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

// --- Browse / filter / tag (the documents view) ----------------------------

export type DocFileType = 'image' | 'pdf' | 'other'
/** Where a document is attached: to a maintenance event, a repair event, or the
 * vehicle itself ("glovebox"). Mirrors linkedTo + the event's kind. */
export type DocSource = 'maintenance' | 'repair' | 'glovebox'

/** One row of the documents browser: a stored document joined with the context
 * it belongs to (vehicle + event). Built impurely in db/documents.ts, filtered
 * purely here. */
export interface DocumentIndexEntry {
  doc: VehicleDocument
  vehicleId: string
  vehicleName: string
  source: DocSource
  eventId: string | null
  /** Human label of what it's attached to, e.g. "Oil change · 2026-03-01". */
  context: string
  /** ISO date used for sorting/filtering (event date, or upload date for glovebox). */
  date: string
  fileType: DocFileType
}

/** Coarse file-type bucket used for the "file type" filter and preview mode. */
export function fileTypeOf(mimeType: string): DocFileType {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'other'
}

export interface DocumentFilter {
  vehicleId?: string | null
  source?: DocSource | null
  fileType?: DocFileType | null
  query?: string
}

/** Apply the browse filters. A falsy/absent facet means "any". `query` matches
 * (case-insensitively) the filename, context, vehicle name, and tags. Pure —
 * the page owns the filter state and re-runs this on every keystroke. */
export function filterDocuments(
  entries: DocumentIndexEntry[],
  f: DocumentFilter,
): DocumentIndexEntry[] {
  const q = (f.query ?? '').trim().toLowerCase()
  return entries.filter((e) => {
    if (f.vehicleId && e.vehicleId !== f.vehicleId) return false
    if (f.source && e.source !== f.source) return false
    if (f.fileType && e.fileType !== f.fileType) return false
    if (q) {
      const hay = [e.doc.filename, e.context, e.vehicleName, ...(e.doc.tags ?? [])]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Newest first; ties (same date) keep input order stable. */
export function sortDocumentsByDateDesc(entries: DocumentIndexEntry[]): DocumentIndexEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** Parse a comma/space-separated tag input into a clean list: trimmed,
 * lowercased, de-duplicated, empties dropped. */
export function parseTags(input: string): string[] {
  const out: string[] = []
  for (const raw of input.split(',')) {
    const t = raw.trim().toLowerCase()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Distinct tags across a set of entries (sorted) — for tag suggestions/chips. */
export function collectTags(entries: DocumentIndexEntry[]): string[] {
  const set = new Set<string>()
  for (const e of entries) for (const t of e.doc.tags ?? []) set.add(t)
  return [...set].sort()
}
