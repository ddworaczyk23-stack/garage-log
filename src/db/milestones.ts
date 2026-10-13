import { db } from './db'
import { getProjectedMileage } from './summary'
import { componentProfile } from '../domain/milestones'
import type { MilestoneRecord } from '../types'

// Writes for milestone checkup progress (domain/milestones.ts). Stored on the
// vehicle record (Vehicle.milestones), never on reminder rules: milestones are
// deliberately independent of the regular maintenance schedule.

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
