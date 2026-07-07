import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { formatInterval } from '../domain/format'
import { getVehicleReminders } from '../db/summary'
import { STATUS_LABELS } from '../types'
import { EventForm } from '../components/EventForm'
import { OdometerForm } from '../components/OdometerForm'
import { EventListItem } from '../components/EventListItem'
import { OdometerListItem } from '../components/OdometerListItem'
import { DocumentGrid } from '../components/DocumentGrid'
import { VehicleDocuments } from '../components/VehicleDocuments'
import { Loading } from '../components/ui'
import type { VehicleDocument } from '../types'

interface Props {
  id: string
}

async function loadVehicleDocuments(eventIds: string[]): Promise<VehicleDocument[]> {
  const allIds = eventIds.length
    ? (await db.events.bulkGet(eventIds)).flatMap((e) => e?.documentIds ?? [])
    : []
  if (!allIds.length) return []
  const docs = await db.documents.bulkGet(allIds)
  return docs.filter((d): d is VehicleDocument => !!d)
}

type ActiveForm = 'service' | 'repair' | 'odometer' | null

// Vehicle detail: identity + specs, the personalized maintenance schedule
// (reminders engine), quick-add for service/repair/odometer, full history for
// each with edit/delete, and attached documents. This is the main CRUD hub —
// the reminders engine itself is untouched here, only fed by what gets logged.
export function VehicleDetail({ id }: Props) {
  const [activeForm, setActiveForm] = useState<ActiveForm>(null)

  // `?? null` lets us tell "still loading" (undefined) apart from
  // "loaded, no such vehicle" (null) — get() alone returns undefined for both.
  const vehicle = useQuery(async () => (await db.vehicles.get(id)) ?? null, [id])
  const reminders = useQuery(() => getVehicleReminders(id), [id])
  const events = useQuery(
    () =>
      db.events
        .where('vehicleId')
        .equals(id)
        .toArray()
        .then((rs) => rs.sort((a, b) => (a.date < b.date ? 1 : -1))),
    [id],
  )
  const odometerReadings = useQuery(
    () =>
      db.odometerReadings
        .where('vehicleId')
        .equals(id)
        .toArray()
        .then((rs) => rs.sort((a, b) => (a.date < b.date ? 1 : -1))),
    [id],
  )
  const documents = useQuery(
    () => loadVehicleDocuments((events ?? []).map((e) => e.id)),
    [id, events?.map((e) => e.id).join(',')],
  )

  if (vehicle === undefined) return <Loading />
  if (vehicle === null) {
    return (
      <section class="page">
        <p class="muted">Vehicle not found.</p>
        <a class="btn" href="#/vehicles">
          Back to vehicles
        </a>
      </section>
    )
  }

  const maintenanceEvents = (events ?? []).filter((e) => e.kind === 'maintenance')
  const repairEvents = (events ?? []).filter((e) => e.kind === 'repair')

  function closeForm() {
    setActiveForm(null)
  }

  return (
    <section class="page">
      <a class="back-link" href="#/vehicles">
        ‹ Vehicles
      </a>

      <div class="detail-head">
        <span class="vehicle-emoji lg" aria-hidden="true">
          {vehicle.make === 'Ford' ? '🛻' : '🚙'}
        </span>
        <div>
          <h2 class="page-title">{vehicle.name}</h2>
          <p class="muted">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
        </div>
      </div>

      <dl class="spec-list card">
        <div>
          <dt>Engine</dt>
          <dd>{vehicle.engine}</dd>
        </div>
        <div>
          <dt>Drivetrain</dt>
          <dd>{vehicle.drivetrain}</dd>
        </div>
        <div>
          <dt>Trim</dt>
          <dd>{vehicle.trim}</dd>
        </div>
        <div>
          <dt>VIN</dt>
          <dd class="muted">{vehicle.vin ?? 'Not set'}</dd>
        </div>
      </dl>

      <div class="quick-add-bar">
        <button class="btn quick-add-btn" onClick={() => setActiveForm(activeForm === 'service' ? null : 'service')}>
          + Service
        </button>
        <button class="btn quick-add-btn" onClick={() => setActiveForm(activeForm === 'repair' ? null : 'repair')}>
          + Repair
        </button>
        <button
          class="btn quick-add-btn"
          onClick={() => setActiveForm(activeForm === 'odometer' ? null : 'odometer')}
        >
          + Odometer
        </button>
      </div>

      {activeForm === 'service' && (
        <EventForm vehicleId={id} kind="maintenance" onDone={closeForm} onCancel={closeForm} />
      )}
      {activeForm === 'repair' && (
        <EventForm vehicleId={id} kind="repair" onDone={closeForm} onCancel={closeForm} />
      )}
      {activeForm === 'odometer' && <OdometerForm vehicleId={id} onDone={closeForm} onCancel={closeForm} />}

      <section class="card">
        <h3 class="card-title">Maintenance schedule</h3>
        <p class="muted small">
          Personalized from mechanic-consensus intervals + this vehicle's logged
          history. Ranked most urgent first.
        </p>

        {!reminders ? (
          <Loading />
        ) : (
          <ul class="schedule-list">
            {reminders.map((r) => (
              <li key={r.rule.id} class="schedule-row">
                <div class="schedule-main">
                  <span class="schedule-label">{r.rule.label}</span>
                  <span class="muted small">
                    {formatInterval(r.interval.miles, r.interval.months, r.interval.conditionBased)}
                  </span>
                  <span class="muted small">
                    {r.reason}
                    {r.odometerStale ? ' ⚠️' : ''}
                  </span>
                </div>
                <span class={`status-pill status-${r.status}`}>{STATUS_LABELS[r.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="card">
        <h3 class="card-title">Maintenance history ({maintenanceEvents.length})</h3>
        {!events ? (
          <Loading />
        ) : maintenanceEvents.length === 0 ? (
          <p class="muted small">Nothing logged yet — tap "+ Service" above.</p>
        ) : (
          <ul class="list">
            {maintenanceEvents.map((e) => (
              <EventListItem key={e.id} vehicleId={id} event={e} />
            ))}
          </ul>
        )}
      </section>

      <section class="card">
        <h3 class="card-title">Repair history ({repairEvents.length})</h3>
        {!events ? (
          <Loading />
        ) : repairEvents.length === 0 ? (
          <p class="muted small">Nothing logged yet — tap "+ Repair" above.</p>
        ) : (
          <ul class="list">
            {repairEvents.map((e) => (
              <EventListItem key={e.id} vehicleId={id} event={e} />
            ))}
          </ul>
        )}
      </section>

      <section class="card">
        <h3 class="card-title">Odometer history ({odometerReadings?.length ?? 0})</h3>
        {!odometerReadings ? (
          <Loading />
        ) : odometerReadings.length === 0 ? (
          <p class="muted small">No readings logged yet — tap "+ Odometer" above.</p>
        ) : (
          <ul class="list">
            {odometerReadings.map((r) => (
              <OdometerListItem key={r.id} vehicleId={id} reading={r} />
            ))}
          </ul>
        )}
      </section>

      <VehicleDocuments vehicleId={id} />

      <section class="card">
        <div class="card-title-row">
          <h3 class="card-title">Service &amp; repair receipts ({documents?.length ?? 0})</h3>
          <a class="btn-link" href={`#/documents/${id}`}>
            Browse all →
          </a>
        </div>
        <p class="muted small">
          Files attached to a logged service or repair. Tag, preview, reassign, or
          remove them in the documents browser.
        </p>
        {!documents ? <Loading /> : <DocumentGrid documents={documents} />}
      </section>
    </section>
  )
}
