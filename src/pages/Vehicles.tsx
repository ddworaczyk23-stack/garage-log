import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getVehicleReminders } from '../db/summary'
import { vehicleVerdict, VERDICT_BAND_LABELS } from '../domain/verdict'
import { getOpenConcerns } from '../db/concerns'
import { localDateISO } from '../domain/format'
import { PageHeader, Skel } from '../components/ui'
import { VehicleRow } from '../components/VehicleRow'
import { Reveal } from '../components/motion/Reveal'

async function loadVehiclesWithStatus() {
  const vehicles = await db.vehicles.orderBy('name').toArray()
  return Promise.all(
    vehicles.map(async (v) => {
      const [reminders, concerns] = await Promise.all([getVehicleReminders(v.id), getOpenConcerns(v.id)])
      const band = vehicleVerdict(reminders, concerns, localDateISO(new Date())).band
      return { vehicle: v, band }
    }),
  )
}

// Vehicle list. Each row links to detail and shows its most urgent reminder
// status as a quick at-a-glance badge.
export function Vehicles() {
  const rows = useQuery(loadVehiclesWithStatus)

  if (!rows) {
    return (
      <section class="page" role="status" aria-live="polite" aria-label="Loading vehicles">
        <Skel class="skel-title" />
        <div class="skel-list">
          <Skel class="skel-row" />
          <Skel class="skel-row" />
        </div>
      </section>
    )
  }

  return (
    <section class="page">
      <PageHeader
        title="Vehicles"
        meta={<a class="btn btn-on-frame" href="#/add-vehicle">+ Add a car</a>}
      />

      <Reveal>
        <ul class="list">
          {rows.map(({ vehicle: v, band }) => (
            <li key={v.id}>
              <VehicleRow
                vehicle={v}
                href={`#/vehicle/${v.id}`}
                status={<span class={`status-pill status-pill-${band}`}>{VERDICT_BAND_LABELS[band]}</span>}
              />
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
