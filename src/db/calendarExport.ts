import { db } from './db'
import { getVehicleReminders } from './summary'
import { getMilestoneContext } from './milestones'
import {
  milestoneCalendarItem,
  reminderCalendarItems,
  type CalendarItem,
} from '../domain/calendar'
import { milestoneOverview } from '../domain/milestones'
import { vehicleLabel } from '../domain/vehicle'

/**
 * Gather the current device's upcoming calendar items. Kept outside the UI so
 * the future live feed can reuse the exact same selection and projection.
 */
export async function collectCalendarItems(vehicleId: string | undefined, asOf: Date): Promise<CalendarItem[]> {
  const vehicles = vehicleId
    ? [await db.vehicles.get(vehicleId)].filter((v) => !!v)
    : await db.vehicles.toArray()
  const appUrl = `${location.origin}${location.pathname}`
  const out: CalendarItem[] = []
  for (const v of vehicles) {
    if (!v) continue
    const name = vehicleLabel(v)
    const [reminders, ctx] = await Promise.all([getVehicleReminders(v.id), getMilestoneContext(v.id)])
    out.push(...reminderCalendarItems(name, reminders, asOf, appUrl))
    if (ctx?.mileage) {
      const { next } = milestoneOverview(ctx.mileage.miles, ctx.profile, v.milestones)
      const item = milestoneCalendarItem(name, v.id, next, ctx.mileage.annualMileage, asOf, appUrl)
      if (item) out.push(item)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}
