import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { formatMiles, formatShortDate } from '../domain/format'
import { OdometerListItem } from './OdometerListItem'
import { Collapsible } from './motion/Collapsible'
import { Loading } from './ui'
import { CATEGORY_LABELS, type MaintenanceEvent, type OdometerReading } from '../types'

type Item =
  | { kind: 'reading'; date: string; miles: number; reading: OdometerReading }
  | { kind: 'event'; date: string; miles: number; event: MaintenanceEvent }

// Merge standalone odometer readings with the odometer point on every logged
// service/repair, newest first. Same-day ties break to the higher mileage (the
// odometer only moves forward), matching getCurrentMileageEstimate. An event
// whose (date, miles) exactly matches a reading is dropped so an imported visit
// and a manual reading of the same point don't show as a duplicate — the
// editable reading wins.
function mergeItems(readings: OdometerReading[], events: MaintenanceEvent[]): Item[] {
  const readingKeys = new Set(readings.map((r) => `${r.date}|${r.miles}`))
  const items: Item[] = [
    ...readings.map((r): Item => ({ kind: 'reading', date: r.date, miles: r.miles, reading: r })),
    ...events
      .filter((e) => !readingKeys.has(`${e.date}|${e.odometerMiles}`))
      .map((e): Item => ({ kind: 'event', date: e.date, miles: e.odometerMiles, event: e })),
  ]
  return items.sort((a, b) => (a.date === b.date ? b.miles - a.miles : a.date < b.date ? 1 : -1))
}

// Unified, read-only-ish mileage timeline for a vehicle. Manual readings stay
// editable (they toggle into OdometerForm via OdometerListItem); service-derived
// points are shown read-only and are edited from the service log instead. This
// is a view over existing data — nothing is duplicated into the readings table,
// so imported history (which lands as events) shows up here automatically and
// feeds the average-mileage estimate.
export function MileageHistory({ vehicleId }: { vehicleId: string }) {
  const readings = useQuery(
    () => db.odometerReadings.where('vehicleId').equals(vehicleId).toArray(),
    [vehicleId],
  )
  const events = useQuery(() => db.events.where('vehicleId').equals(vehicleId).toArray(), [vehicleId])

  const loading = !readings || !events
  const items = loading ? [] : mergeItems(readings, events)

  return (
    <section class="card">
      <Collapsible
        title="Mileage history"
        count={`${items.length} ${items.length === 1 ? 'point' : 'points'}`}
      >
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <p class="muted small">No mileage yet — tap "+ Odometer" above, or log a service.</p>
        ) : (
          <ul class="list">
            {items.map((it) =>
              it.kind === 'reading' ? (
                <OdometerListItem key={`r-${it.reading.id}`} vehicleId={vehicleId} reading={it.reading} />
              ) : (
                <li key={`e-${it.event.id}`} class="list-row">
                  <span class="list-row-main">
                    <span class="list-row-title">{formatMiles(it.miles)}</span>
                    <span class="muted small">
                      {formatShortDate(it.date)} · via{' '}
                      {it.event.title || CATEGORY_LABELS[it.event.category]}
                    </span>
                  </span>
                  <span class="muted small mileage-src">service log</span>
                </li>
              ),
            )}
          </ul>
        )}
      </Collapsible>
    </section>
  )
}
