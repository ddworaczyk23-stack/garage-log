import { recordCompletedEvent } from './events'
import { groupIntoVisits, mapServiceToCategories, type VisitRow } from '../domain/importHistory'
import { CATEGORY_LABELS, type MaintenanceCategory } from '../types'

export interface ImportableRecord {
  date: string
  miles: number
  category: MaintenanceCategory
  service: string
}

/**
 * Import reviewed records as maintenance events. Records sharing the same date
 * AND mileage are grouped into ONE multi-category event (a real shop visit =
 * one entry — e.g. a Valvoline oil change that also did a multi-point
 * inspection + battery check), with the reviewed category plus any others the
 * line's text names folded in as additionalCategories. Reuses
 * recordCompletedEvent so every touched rule's cached last-done syncs the same
 * way manual logging does (adopt-if-newer); processing oldest-first leaves each
 * rule on its most recent matching visit. Returns the number of EVENTS created
 * (i.e. visits), which can be fewer than the number of input rows.
 */
export async function importServiceRecords(
  vehicleId: string,
  records: ImportableRecord[],
): Promise<number> {
  // Each row contributes its reviewed category plus any additional services its
  // text names (so a single "oil change + battery test" line isn't reduced to
  // one category before grouping).
  const rows: VisitRow[] = records.map((r) => ({
    date: r.date,
    miles: r.miles,
    categories: dedupe([r.category, ...mapServiceToCategories(r.service)]),
    service: r.service,
  }))

  const visits = groupIntoVisits(rows).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )

  for (const v of visits) {
    await recordCompletedEvent({
      vehicleId,
      kind: 'maintenance',
      date: v.date,
      odometerMiles: v.miles,
      category: v.category,
      additionalCategories: v.additionalCategories,
      title: v.service || CATEGORY_LABELS[v.category],
      notes: 'Imported from Carfax service history',
    })
  }
  return visits.length
}

function dedupe(cats: MaintenanceCategory[]): MaintenanceCategory[] {
  return [...new Set(cats)]
}
