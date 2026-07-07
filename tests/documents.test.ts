import { describe, it, expect } from 'vitest'
import {
  MAX_IMAGE_DIMENSION,
  MIN_COMPRESS_BYTES,
  collectTags,
  fileTypeOf,
  filterDocuments,
  fitWithin,
  formatBytes,
  keptSmaller,
  parseTags,
  shouldCompressImage,
  sortDocumentsByDateDesc,
  toJpegName,
  type DocumentIndexEntry,
} from '../src/domain/documents'
import type { VehicleDocument } from '../src/types'

// Minimal index-entry factory for the browse/filter tests.
function entry(over: {
  id?: string
  vehicleId?: string
  vehicleName?: string
  source?: DocumentIndexEntry['source']
  fileType?: DocumentIndexEntry['fileType']
  filename?: string
  context?: string
  date?: string
  tags?: string[]
} = {}): DocumentIndexEntry {
  const doc = {
    id: over.id ?? 'doc-1',
    filename: over.filename ?? 'receipt.jpg',
    tags: over.tags,
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
    linkedTo: { type: 'event', id: 'evt-1' },
  } as unknown as VehicleDocument
  return {
    doc,
    vehicleId: over.vehicleId ?? 'f150',
    vehicleName: over.vehicleName ?? 'F-150 STX',
    source: over.source ?? 'maintenance',
    eventId: 'evt-1',
    context: over.context ?? 'Oil change · 2026-03-01',
    date: over.date ?? '2026-03-01',
    fileType: over.fileType ?? 'image',
  }
}

describe('fitWithin', () => {
  it('leaves images already within the cap untouched (no upscaling)', () => {
    expect(fitWithin(800, 600, MAX_IMAGE_DIMENSION)).toEqual({ width: 800, height: 600 })
  })

  it('scales the longest edge down to the cap, preserving aspect ratio', () => {
    // 4000x3000 -> longest 4000 -> scale 1600/4000 = 0.4
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('handles portrait orientation (height is the longest edge)', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('never returns a zero dimension', () => {
    const { width, height } = fitWithin(4000, 1, 1600)
    expect(width).toBeGreaterThanOrEqual(1)
    expect(height).toBeGreaterThanOrEqual(1)
  })

  it('is a no-op for zero-size input', () => {
    expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 })
  })
})

describe('shouldCompressImage', () => {
  it('compresses large raster images', () => {
    expect(shouldCompressImage('image/jpeg', MIN_COMPRESS_BYTES + 1)).toBe(true)
    expect(shouldCompressImage('image/png', 5_000_000)).toBe(true)
  })

  it('skips small images (not worth a lossy re-encode)', () => {
    expect(shouldCompressImage('image/jpeg', 50_000)).toBe(false)
  })

  it('skips non-raster types like PDF', () => {
    expect(shouldCompressImage('application/pdf', 9_000_000)).toBe(false)
  })
})

describe('keptSmaller', () => {
  it('keeps a candidate that is at least 10% smaller', () => {
    expect(keptSmaller(1000, 800)).toBe(true)
  })

  it('rejects a candidate that barely shrank', () => {
    expect(keptSmaller(1000, 950)).toBe(false)
  })

  it('rejects a candidate that grew', () => {
    expect(keptSmaller(1000, 1200)).toBe(false)
  })

  it('rejects an empty candidate', () => {
    expect(keptSmaller(1000, 0)).toBe(false)
  })
})

describe('toJpegName', () => {
  it('swaps a known extension for .jpg', () => {
    expect(toJpegName('receipt.png')).toBe('receipt.jpg')
    expect(toJpegName('IMG_1234.HEIC')).toBe('IMG_1234.jpg')
  })

  it('appends .jpg when there is no extension', () => {
    expect(toJpegName('scan')).toBe('scan.jpg')
  })

  it('only replaces the final extension', () => {
    expect(toJpegName('my.photo.png')).toBe('my.photo.jpg')
  })
})

describe('formatBytes', () => {
  it('formats bytes, KB, and MB with sensible precision', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(4300)).toBe('4.2 KB')
    expect(formatBytes(3_200_000)).toBe('3.1 MB')
  })

  it('drops the decimal once past 10 units', () => {
    expect(formatBytes(50_000)).toBe('49 KB')
  })
})

describe('fileTypeOf', () => {
  it('buckets images, PDFs, and everything else', () => {
    expect(fileTypeOf('image/jpeg')).toBe('image')
    expect(fileTypeOf('image/png')).toBe('image')
    expect(fileTypeOf('application/pdf')).toBe('pdf')
    expect(fileTypeOf('text/plain')).toBe('other')
    expect(fileTypeOf('')).toBe('other')
  })
})

describe('parseTags', () => {
  it('trims, lowercases, dedupes, and drops empties', () => {
    expect(parseTags(' Warranty , receipt ,, WARRANTY ')).toEqual(['warranty', 'receipt'])
  })

  it('returns an empty list for blank input', () => {
    expect(parseTags('   ')).toEqual([])
  })
})

describe('filterDocuments', () => {
  const entries = [
    entry({ id: 'a', vehicleId: 'f150', source: 'maintenance', fileType: 'image', filename: 'oil.jpg', tags: ['receipt'] }),
    entry({ id: 'b', vehicleId: 'f150', source: 'repair', fileType: 'pdf', filename: 'brakes.pdf', context: 'Brake job · 2026-02-01' }),
    entry({ id: 'c', vehicleId: 'rogue', source: 'glovebox', fileType: 'image', filename: 'registration.jpg', context: 'Glovebox', tags: ['insurance'] }),
  ]

  it('returns everything when no facets are set', () => {
    expect(filterDocuments(entries, {}).length).toBe(3)
  })

  it('filters by vehicle', () => {
    expect(filterDocuments(entries, { vehicleId: 'rogue' }).map((e) => e.doc.id)).toEqual(['c'])
  })

  it('filters by source and file type together', () => {
    expect(filterDocuments(entries, { source: 'repair', fileType: 'pdf' }).map((e) => e.doc.id)).toEqual(['b'])
    expect(filterDocuments(entries, { source: 'repair', fileType: 'image' })).toEqual([])
  })

  it('searches filename, context, and tags case-insensitively', () => {
    expect(filterDocuments(entries, { query: 'BRAKE' }).map((e) => e.doc.id)).toEqual(['b'])
    expect(filterDocuments(entries, { query: 'insurance' }).map((e) => e.doc.id)).toEqual(['c'])
    expect(filterDocuments(entries, { query: 'registration' }).map((e) => e.doc.id)).toEqual(['c'])
  })

  it('treats empty-string facets as "any"', () => {
    expect(filterDocuments(entries, { vehicleId: '', source: '' as never, query: '' }).length).toBe(3)
  })
})

describe('sortDocumentsByDateDesc', () => {
  it('orders newest first without mutating the input', () => {
    const input = [entry({ id: 'old', date: '2026-01-01' }), entry({ id: 'new', date: '2026-05-01' })]
    const sorted = sortDocumentsByDateDesc(input)
    expect(sorted.map((e) => e.doc.id)).toEqual(['new', 'old'])
    expect(input.map((e) => e.doc.id)).toEqual(['old', 'new']) // original untouched
  })
})

describe('collectTags', () => {
  it('returns the sorted distinct tag set', () => {
    const entries = [entry({ tags: ['b', 'a'] }), entry({ tags: ['a', 'c'] }), entry({ tags: undefined })]
    expect(collectTags(entries)).toEqual(['a', 'b', 'c'])
  })
})
