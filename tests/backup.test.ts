import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../src/db/db'
import {
  exportGarage,
  importGarage,
  serializeBackupToJson,
} from '../src/db/backup'
import { validateBackup, BACKUP_FORMAT } from '../src/domain/backup'
import type {
  AppMetaRecord,
  MaintenanceEvent,
  OdometerReading,
  ReminderRule,
  Vehicle,
  VehicleDocument,
} from '../src/types'

const IMG_BYTES = new Uint8Array([1, 2, 3, 4, 250, 128, 0, 99])

const vehicle: Vehicle = {
  id: 'veh-1',
  name: 'Test Truck',
  year: 2020,
  make: 'Ford',
  model: 'F-150',
  trim: 'STX',
  engine: '2.7L',
  drivetrain: '4WD',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const event: MaintenanceEvent = {
  id: 'evt-1',
  vehicleId: 'veh-1',
  kind: 'maintenance',
  date: '2026-03-01',
  odometerMiles: 40000,
  category: 'oil-change',
  title: 'Oil change',
  cost: 65,
  documentIds: ['doc-1'],
}

const reading: OdometerReading = {
  id: 'odo-1',
  vehicleId: 'veh-1',
  date: '2026-04-01',
  miles: 41000,
  source: 'quick-log',
}

const rule: ReminderRule = {
  id: 'veh-1:oil-change',
  vehicleId: 'veh-1',
  category: 'oil-change',
  label: 'Engine oil & filter',
  customIntervalMiles: 5000,
  customIntervalMonths: 6,
  lastDoneDate: '2026-03-01',
  lastDoneMiles: 40000,
  override: { kind: 'diy', note: 'I do this myself', atDate: null, atMiles: null },
  notes: 'I do this myself',
  source: 'manufacturer-default',
}

const meta: AppMetaRecord = { key: 'greeting', value: 'hello' }

function eventDoc(): VehicleDocument {
  return {
    id: 'doc-1',
    blob: new Blob([IMG_BYTES], { type: 'image/jpeg' }),
    mimeType: 'image/jpeg',
    filename: 'receipt.jpg',
    sizeBytes: IMG_BYTES.length,
    createdAt: '2026-03-01T12:00:00.000Z',
    linkedTo: { type: 'event', id: 'evt-1' },
    optimized: true,
    originalSizeBytes: 999999,
    tags: ['receipt', 'warranty'],
  }
}

function gloveboxDoc(): VehicleDocument {
  return {
    id: 'doc-2',
    blob: new Blob([new Uint8Array([9, 9, 9])], { type: 'application/pdf' }),
    mimeType: 'application/pdf',
    filename: 'registration.pdf',
    sizeBytes: 3,
    createdAt: '2026-02-01T00:00:00.000Z',
    linkedTo: { type: 'vehicle', id: 'veh-1' },
  }
}

async function clearAll() {
  await Promise.all([
    db.vehicles.clear(),
    db.odometerReadings.clear(),
    db.events.clear(),
    db.documents.clear(),
    db.reminderRules.clear(),
    db.appMeta.clear(),
  ])
}

async function seedFixture() {
  await clearAll()
  await db.vehicles.put(vehicle)
  await db.events.put(event)
  await db.odometerReadings.put(reading)
  await db.reminderRules.put(rule)
  await db.appMeta.put(meta)
  await db.documents.put(eventDoc())
  await db.documents.put(gloveboxDoc())
}

beforeEach(seedFixture)

describe('exportGarage', () => {
  it('captures every table with a versioned envelope', async () => {
    const backup = await exportGarage()
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(1)
    expect(backup.appSchemaVersion).toBe(db.verno)
    expect(backup.counts).toEqual({
      vehicles: 1,
      odometerReadings: 1,
      events: 1,
      reminderRules: 1,
      appMeta: 1,
      documents: 2,
    })
  })

  it('serializes document blobs as base64 strings', async () => {
    const backup = await exportGarage()
    const doc = backup.data.documents.find((d) => d.id === 'doc-1')!
    expect(typeof doc.blobBase64).toBe('string')
    expect(doc.blobBase64.length).toBeGreaterThan(0)
    expect(doc.tags).toEqual(['receipt', 'warranty'])
    expect(doc.optimized).toBe(true)
  })

  it('is deterministic — same data yields identical serialized data', async () => {
    const a = await exportGarage()
    const b = await exportGarage()
    // exportedAt differs by wall-clock; the DATA payload must be byte-identical.
    expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data))
  })

  it('produces a valid backup that passes validation', async () => {
    const backup = await exportGarage()
    const parsed = JSON.parse(serializeBackupToJson(backup))
    const result = validateBackup(parsed, db.verno)
    expect(result.ok).toBe(true)
  })
})

describe('validateBackup', () => {
  it('rejects non-objects and non-backup JSON', () => {
    expect(validateBackup(null, 1)).toMatchObject({ ok: false })
    expect(validateBackup('nope', 1)).toMatchObject({ ok: false })
    expect(validateBackup({ format: 'something-else' }, 1)).toMatchObject({ ok: false })
  })

  it('rejects a backup from a newer format version', () => {
    const res = validateBackup({ format: BACKUP_FORMAT, version: 999, data: {} }, 1)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/newer version/i)
  })

  it('rejects a backup made against a newer DB schema', () => {
    const res = validateBackup(
      { format: BACKUP_FORMAT, version: 1, appSchemaVersion: 5, data: {} },
      1,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/schema/i)
  })

  it('rejects a backup missing a table', () => {
    const res = validateBackup(
      {
        format: BACKUP_FORMAT,
        version: 1,
        data: { vehicles: [], odometerReadings: [], events: [], reminderRules: [], appMeta: [] },
      },
      1,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/documents/i)
  })

  it('rejects a document entry without blob data', () => {
    const res = validateBackup(
      {
        format: BACKUP_FORMAT,
        version: 1,
        data: {
          vehicles: [],
          odometerReadings: [],
          events: [],
          reminderRules: [],
          appMeta: [],
          documents: [{ id: 'doc-x' }],
        },
      },
      1,
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/blob/i)
  })
})

describe('importGarage (restore)', () => {
  it('restores into an empty database cleanly', async () => {
    const backup = await exportGarage()
    await clearAll()
    expect(await db.vehicles.count()).toBe(0)

    await importGarage(backup)

    expect(await db.vehicles.count()).toBe(1)
    expect(await db.events.count()).toBe(1)
    expect(await db.documents.count()).toBe(2)
    expect(await db.reminderRules.count()).toBe(1)
    expect(await db.appMeta.count()).toBe(1)
  })

  it('preserves event↔document relationships and overrides', async () => {
    const backup = await exportGarage()
    await clearAll()
    await importGarage(backup)

    const restoredEvent = await db.events.get('evt-1')
    expect(restoredEvent?.documentIds).toEqual(['doc-1'])

    const restoredDoc = await db.documents.get('doc-1')
    expect(restoredDoc?.linkedTo).toEqual({ type: 'event', id: 'evt-1' })
    expect(restoredDoc?.tags).toEqual(['receipt', 'warranty'])

    const glovebox = await db.documents.get('doc-2')
    expect(glovebox?.linkedTo).toEqual({ type: 'vehicle', id: 'veh-1' })

    const restoredRule = await db.reminderRules.get('veh-1:oil-change')
    expect(restoredRule?.override).toEqual({
      kind: 'diy',
      note: 'I do this myself',
      atDate: null,
      atMiles: null,
    })
    expect(restoredRule?.customIntervalMiles).toBe(5000)
  })

  it('round-trips document blob bytes intact', async () => {
    const backup = await exportGarage()
    await clearAll()
    await importGarage(backup)

    const restoredDoc = await db.documents.get('doc-1')
    const bytes = new Uint8Array(await restoredDoc!.blob.arrayBuffer())
    expect(Array.from(bytes)).toEqual(Array.from(IMG_BYTES))
    expect(restoredDoc!.blob.type).toBe('image/jpeg')
  })

  it('fully replaces existing data (no leftovers from before)', async () => {
    // Put an extra vehicle that is NOT in the backup, then restore.
    await db.vehicles.put({ ...vehicle, id: 'veh-stale', name: 'Stale' })
    expect(await db.vehicles.count()).toBe(2)

    const backup = await exportGarage() // includes both veh-1 and veh-stale now
    await db.vehicles.put({ ...vehicle, id: 'veh-another', name: 'Another' })

    await importGarage(backup) // backup had 2 vehicles, not the 3rd
    const ids = (await db.vehicles.toArray()).map((v) => v.id).sort()
    expect(ids).toEqual(['veh-1', 'veh-stale'])
  })
})
