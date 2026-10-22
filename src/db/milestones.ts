import { db } from './db'
import { deleteEvent, recordCompletedEvent } from './events'
import { getProjectedMileage } from './summary'
import {
  INSPECTION_ITEMS,
  MILESTONE_ITEM_CATEGORY,
  componentProfile,
  milestoneName,
} from '../domain/milestones'
import { CATEGORY_LABELS, type MilestoneRecord } from '../types'

// Writes for milestone checkup progress (domain/milestones.ts). Stored on the
// vehicle record (Vehicle.milestones), never on reminder rules. Logging an
// item to the schedule goes through the normal event path (EventForm ->
// events.ts), not through here.

async function patchMilestone(
  vehicleId: string,
  miles: number,
  fn: (r: MilestoneRecord) => MilestoneRecord,
): Promise<void> {
  await db.transaction('rw', db.vehicles, async () => {
    const vehicle = await db.vehicles.get(vehicleId)
    if (!vehicle) throw new Error('Vehicle not found')
    const key = String(miles)
    const current = vehicle.milestones?.[key] ?? { checked: [] }
    await db.vehicles.update(vehicleId, {
      milestones: { ...vehicle.milestones, [key]: fn(current) },
    })
  })
}

export function setMilestoneItem(vehicleId: string, miles: number, itemId: string, checked: boolean) {
  return patchMilestone(vehicleId, miles, (r) => ({
    ...r,
    checked: checked
      ? [...new Set([...r.checked, itemId])]
      : r.checked.filter((id) => id !== itemId),
  }))
}

/**
 * "Checked, OK". For an inspection item (brakes, tires, battery) the car has
 * on its schedule, also logs that inspection at `when`, and undoing deletes
 * that same event. Other items only get the mark.
 */
export async function setMilestoneItemOk(
  vehicleId: string,
  miles: number,
  itemId: string,
  ok: boolean,
  when: { date: string; miles: number } | null,
): Promise<void> {
  const vehicle = await db.vehicles.get(vehicleId)
  const existing = vehicle?.milestones?.[String(miles)]?.inspectionEvents?.[itemId]
  let eventId: string | undefined
  if (ok && !existing && when && INSPECTION_ITEMS.has(itemId)) {
    const category = MILESTONE_ITEM_CATEGORY[itemId]
    const rule = category && (await db.reminderRules.get(`${vehicleId}:${category}`))
    if (category && rule) {
      eventId = await recordCompletedEvent({
        vehicleId,
        kind: 'maintenance',
        date: when.date,
        odometerMiles: when.miles,
        category,
        title: CATEGORY_LABELS[category],
        notes: `Checked OK at the ${milestoneName(miles)}`,
      })
    }
  }
  if (!ok && existing) await deleteEvent(existing)
  await patchMilestone(vehicleId, miles, (r) => {
    const events = { ...r.inspectionEvents }
    if (eventId) events[itemId] = eventId
    if (!ok) delete events[itemId]
    return {
      ...r,
      checked: ok ? [...new Set([...r.checked, itemId])] : r.checked.filter((id) => id !== itemId),
      inspectionEvents: Object.keys(events).length ? events : undefined,
    }
  })
}

/** Marks an item as logged to the schedule (the event itself is written by EventForm). */
export function setMilestoneItemServiced(vehicleId: string, miles: number, itemId: string) {
  return patchMilestone(vehicleId, miles, (r) => ({
    ...r,
    serviced: [...new Set([...(r.serviced ?? []), itemId])],
  }))
}

export function setMilestoneNotes(vehicleId: string, miles: number, notes: string) {
  return patchMilestone(vehicleId, miles, (r) => ({ ...r, notes: notes.trim() || undefined }))
}

export function completeMilestone(vehicleId: string, miles: number, date: string, odometerMiles: number | null) {
  return patchMilestone(vehicleId, miles, (r) => ({
    ...r,
    skipped: undefined,
    completedDate: date,
    completedMiles: odometerMiles ?? undefined,
  }))
}

export function skipMilestone(vehicleId: string, miles: number) {
  return patchMilestone(vehicleId, miles, (r) => ({
    ...r,
    skipped: true,
    completedDate: undefined,
    completedMiles: undefined,
  }))
}

/** Undo done/skipped; keeps the checked items. */
export function reopenMilestone(vehicleId: string, miles: number) {
  return patchMilestone(vehicleId, miles, (r) => ({
    ...r,
    skipped: undefined,
    completedDate: undefined,
    completedMiles: undefined,
  }))
}

/** Everything the milestone UI needs for one vehicle, read in one liveQuery. */
export async function getMilestoneContext(vehicleId: string) {
  const vehicle = await db.vehicles.get(vehicleId)
  if (!vehicle) return null
  const [rules, mileage] = await Promise.all([
    db.reminderRules.where('vehicleId').equals(vehicleId).toArray(),
    getProjectedMileage(vehicleId),
  ])
  return {
    vehicle,
    mileage,
    profile: componentProfile(vehicle, rules.map((r) => r.category)),
  }
}
