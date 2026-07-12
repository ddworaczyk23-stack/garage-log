import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/db'
import { deleteVehicle } from '../src/db/vehicles'
import { recordCompletedEvent, recordOdometerReading } from '../src/db/events'
import { attachVehicleDocument } from '../src/db/documents'
import type { ReminderRule, Vehicle } from '../src/types'

const VEHICLE_ID = 'test-vehicle'
const OTHER_VEHICLE_ID = 'other-vehicle'

function makeVehicle(id: string): Vehicle {
  return {
    id,
    name: 'Test Car',
    year: 2020,
    make: 'Test',
    model: 'Car',
    trim: 'Base',
    engine: 'I4',
    drivetrain: 'FWD',
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeRule(vehicleId: string): ReminderRule {
  return {
    id: `${vehicleId}:oil-change`,
    vehicleId,
    category: 'oil-change',
    label: 'Engine oil & filter',
    customIntervalMiles: 5000,
    customIntervalMonths: 6,
    lastDoneDate: null,
    lastDoneMiles: null,
    override: null,
    notes: null,
    source: 'manufacturer-default',
  }
}

beforeEach(async () => {
  await Promise.all([
    db.vehicles.clear(),
    db.odometerReadings.clear(),
    db.events.clear(),
    db.documents.clear(),
    db.reminderRules.clear(),
  ])
})

describe('deleteVehicle', () => {
  it('removes the vehicle row', async () => {
    await db.vehicles.add(makeVehicle(VEHICLE_ID))
    await deleteVehicle(VEHICLE_ID)
    expect(await db.vehicles.get(VEHICLE_ID)).toBeUndefined()
  })

  it('cascades events (+ their attached documents), odometer readings, reminder rules, and glovebox docs', async () => {
    await db.vehicles.add(makeVehicle(VEHICLE_ID))
    await db.reminderRules.add(makeRule(VEHICLE_ID))
    await recordOdometerReading(VEHICLE_ID, 10000, '2026-01-01')

    const eventFile = new File(['x'], 'receipt.txt', { type: 'text/plain' })
    const eventId = await recordCompletedEvent(
      {
        vehicleId: VEHICLE_ID,
        kind: 'maintenance',
        date: '2026-01-01',
        odometerMiles: 10000,
        category: 'oil-change',
        title: 'Oil change',
      },
      [eventFile],
    )
    const gloveboxDocId = await attachVehicleDocument(
      VEHICLE_ID,
      new File(['x'], 'insurance.txt', { type: 'text/plain' }),
    )
    const event = await db.events.get(eventId)
    const eventDocId = event!.documentIds[0]

    await deleteVehicle(VEHICLE_ID)

    expect(await db.events.where('vehicleId').equals(VEHICLE_ID).count()).toBe(0)
    expect(await db.odometerReadings.where('vehicleId').equals(VEHICLE_ID).count()).toBe(0)
    expect(await db.reminderRules.where('vehicleId').equals(VEHICLE_ID).count()).toBe(0)
    expect(await db.documents.get(eventDocId)).toBeUndefined()
    expect(await db.documents.get(gloveboxDocId)).toBeUndefined()
  })

  it('does not touch another vehicle\'s data', async () => {
    await db.vehicles.add(makeVehicle(VEHICLE_ID))
    await db.vehicles.add(makeVehicle(OTHER_VEHICLE_ID))
    await db.reminderRules.add(makeRule(OTHER_VEHICLE_ID))
    await recordOdometerReading(OTHER_VEHICLE_ID, 5000, '2026-01-01')

    await deleteVehicle(VEHICLE_ID)

    expect(await db.vehicles.get(OTHER_VEHICLE_ID)).toBeDefined()
    expect(await db.reminderRules.where('vehicleId').equals(OTHER_VEHICLE_ID).count()).toBe(1)
    expect(await db.odometerReadings.where('vehicleId').equals(OTHER_VEHICLE_ID).count()).toBe(1)
  })

  it('is a no-op for a vehicle id that does not exist', async () => {
    await expect(deleteVehicle('does-not-exist')).resolves.toBeUndefined()
  })
})
