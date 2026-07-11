import { recordCompletedEvent } from './events'
import { CATEGORY_LABELS, type MaintenanceCategory } from '../types'

export interface ImportableRecord {
  date: string
  miles: number
  category: MaintenanceCategory
  service: string
}

// Create a maintenance event per imported record, reusing recordCompletedEvent so
// each one syncs its rule's cached last-done the same way manual logging does
// (adopt-if-newer). Processing oldest-first means the rule cache ends on the most
// recent record per category, establishing correct baselines. Events are tagged
// in notes so they're easy to spot or remove later.
export async function importServiceRecords(
  vehicleId: string,
  records: ImportableRecord[],
): Promise<number> {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const r of sorted) {
    await recordCompletedEvent({
      vehicleId,
      kind: 'maintenance',
      date: r.date,
      odometerMiles: r.miles,
      category: r.category,
      title: r.service || CATEGORY_LABELS[r.category],
      notes: 'Imported from Carfax service history',
    })
  }
  return sorted.length
}
