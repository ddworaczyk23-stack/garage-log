import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/db'
import {
  recordCompletedEvent,
  updateEvent,
  deleteEvent,
  recordOdometerReading,
  updateOdometerReading,
  deleteOdometerReading,
  getCurrentMileageEstimate,
} from '../src/db/events'
import type { ReminderRule } from '../src/types'

const VEHICLE_ID = 'test-vehicle'

function makeRule(overrides: Partial<ReminderRule> = {}): ReminderRule {
  return {
    id: `${VEHICLE_ID}:oil-change`,
    vehicleId: VEHICLE_ID,
    category: 'oil-change',
    label: 'Engine oil & filter',
    customIntervalMiles: 5000,
    customIntervalMonths: 6,
    lastDoneDate: null,
    lastDoneMiles: null,
    override: null,
    notes: null,
    source: 'manufacturer-default',
    ...overrides,
  }
}

// Clear every table before each test so the shared Dexie singleton (backed by
// fake-indexeddb) doesn't leak state between cases.
beforeEach(async () => {
  await Promise.all([
    db.vehicles.clear(),
    db.odometerReadings.clear(),
    db.events.clear(),
    db.documents.clear(),
    db.reminderRules.clear(),
  ])
  await db.reminderRules.add(makeRule())
})

describe('recordCompletedEvent', () => {
  it('syncs the matching rule cache to the new event', async () => {
    await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-01-01',
      odometerMiles: 40000,
      category: 'oil-change',
      title: 'Oil change',
    })
    const rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.lastDoneDate).toBe('2026-01-01')
    expect(rule?.lastDoneMiles).toBe(40000)
  })

  it('does not create/sync a rule for a non-matching category (e.g. a repair with no tracked rule)', async () => {
    const id = await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'repair',
      date: '2026-01-01',
      odometerMiles: 40000,
      category: 'other',
      title: 'Fixed a rattle',
    })
    expect(id).toBeTruthy()
    const rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.lastDoneDate).toBeNull()
  })

  it('applies a rule override supplied alongside the event', async () => {
    await recordCompletedEvent(
      {
        vehicleId: VEHICLE_ID,
        kind: 'maintenance',
        date: '2026-01-01',
        odometerMiles: 40000,
        category: 'oil-change',
        title: 'Oil change',
      },
      [],
      { overrideKind: 'dealer-performed', overrideNote: 'Jiffy Lube', customIntervalMiles: 7500, customIntervalMonths: null },
    )
    const rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.override?.kind).toBe('dealer-performed')
    expect(rule?.customIntervalMiles).toBe(7500)
  })
})

describe('updateEvent', () => {
  it('resyncs the rule cache when the edited event is still the latest', async () => {
    const id = await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-01-01',
      odometerMiles: 40000,
      category: 'oil-change',
      title: 'Oil change',
    })
    await updateEvent(id, { date: '2026-02-01', odometerMiles: 41000 })
    const rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.lastDoneDate).toBe('2026-02-01')
    expect(rule?.lastDoneMiles).toBe(41000)
  })

  it('regresses the cache when correcting a mis-entered future date to an earlier one', async () => {
    // Two events; the second was mistakenly logged with a date far in the future.
    await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-01-01',
      odometerMiles: 40000,
      category: 'oil-change',
      title: 'Oil change #1',
    })
    const secondId = await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2027-01-01', // mis-typed, should have been 2026-06-01
      odometerMiles: 45000,
      category: 'oil-change',
      title: 'Oil change #2',
    })
    let rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.lastDoneDate).toBe('2027-01-01')

    // Correct it — applyEventToRule alone would never regress an already-newer
    // cache, so this only works because updateEvent does a full history resync.
    await updateEvent(secondId, { date: '2026-06-01' })
    rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.lastDoneDate).toBe('2026-06-01')
    expect(rule?.lastDoneMiles).toBe(45000)
  })
})

describe('deleteEvent', () => {
  it('regresses the rule cache to the prior event when the latest is deleted', async () => {
    await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-01-01',
      odometerMiles: 40000,
      category: 'oil-change',
      title: 'Oil change #1',
    })
    const secondId = await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-06-01',
      odometerMiles: 45000,
      category: 'oil-change',
      title: 'Oil change #2',
    })

    await deleteEvent(secondId)
    const rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.lastDoneDate).toBe('2026-01-01')
    expect(rule?.lastDoneMiles).toBe(40000)
  })

  it('clears the rule cache to null when the only event is deleted', async () => {
    const id = await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-01-01',
      odometerMiles: 40000,
      category: 'oil-change',
      title: 'Oil change',
    })
    await deleteEvent(id)
    const rule = await db.reminderRules.get(`${VEHICLE_ID}:oil-change`)
    expect(rule?.lastDoneDate).toBeNull()
    expect(rule?.lastDoneMiles).toBeNull()
  })

  it('preserves history for OTHER events when one is deleted', async () => {
    const keepId = await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-01-01',
      odometerMiles: 40000,
      category: 'tire-rotation',
      title: 'Rotation',
    })
    const deleteId = await recordCompletedEvent({
      vehicleId: VEHICLE_ID,
      kind: 'maintenance',
      date: '2026-02-01',
      odometerMiles: 41000,
      category: 'oil-change',
      title: 'Oil change',
    })
    await deleteEvent(deleteId)
    const kept = await db.events.get(keepId)
    expect(kept).toBeTruthy()
    expect((await db.events.toArray())).toHaveLength(1)
  })

  it('deletes documents attached to the deleted event', async () => {
    const id = await recordCompletedEvent(
      {
        vehicleId: VEHICLE_ID,
        kind: 'maintenance',
        date: '2026-01-01',
        odometerMiles: 40000,
        category: 'oil-change',
        title: 'Oil change',
      },
      [new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' })],
    )
    const eventBefore = await db.events.get(id)
    expect(eventBefore?.documentIds).toHaveLength(1)
    expect(await db.documents.count()).toBe(1)

    await deleteEvent(id)
    expect(await db.documents.count()).toBe(0)
  })
})

describe('odometer readings CRUD', () => {
  it('adds, edits, and deletes a reading', async () => {
    await recordOdometerReading(VEHICLE_ID, 40000, '2026-01-01')
    let readings = await db.odometerReadings.where('vehicleId').equals(VEHICLE_ID).toArray()
    expect(readings).toHaveLength(1)

    await updateOdometerReading(readings[0].id, { miles: 40500 })
    readings = await db.odometerReadings.where('vehicleId').equals(VEHICLE_ID).toArray()
    expect(readings[0].miles).toBe(40500)

    await deleteOdometerReading(readings[0].id)
    readings = await db.odometerReadings.where('vehicleId').equals(VEHICLE_ID).toArray()
    expect(readings).toHaveLength(0)
  })
})

describe('getCurrentMileageEstimate', () => {
  it('prefers the higher mileage on a same-day tie between readings', async () => {
    await recordOdometerReading(VEHICLE_ID, 44500, '2026-07-06')
    await recordOdometerReading(VEHICLE_ID, 49200, '2026-07-06')
    await recordOdometerReading(VEHICLE_ID, 48700, '2026-07-06')

    const estimate = await getCurrentMileageEstimate(VEHICLE_ID)
    expect(estimate?.miles).toBe(49200)
  })

  it('returns null when there is no mileage data at all', async () => {
    expect(await getCurrentMileageEstimate(VEHICLE_ID)).toBeNull()
  })
})
