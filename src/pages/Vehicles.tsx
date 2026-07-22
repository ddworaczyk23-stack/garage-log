import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getVehicleReminders } from '../db/summary'
import { vehicleEmoji, vehicleLabel } from '../domain/vehicle'
import { bandFromStatus, hasRealData, VERDICT_BAND_LABELS, type VerdictBand } from '../domain/verdict'
import { Skel } from '../components/ui'
import { Reveal } from '../components/motion/Reveal'

async function loadVehiclesWithStatus() {
  const vehicles = await db.vehicles.orderBy('name').toArray()
  return Promise.all(
    vehicles.map(async (v) => {
      const reminders = await getVehicleReminders(v.id)
      // Same band vocabulary and the same not-set-up honesty as every other
      // status readout in the app (Dashboard, VehicleDetail) — a vehicle with
      // no logged service history must never show a status pill implying it
      // does (see domain/verdict.ts hasRealData, the Earned Green Rule).
      const known = hasRealData(reminders)
      // rankReminders (via getVehicleReminders) already sorts worst-first, so
      // the first non-not-applicable entry is this vehicle's worst band.
      const top = known ? (reminders.find((r) => r.status !== 'not-applicable') ?? null) : null
      const band: VerdictBand = known ? (top ? (bandFromStatus(top.status) ?? 'all-clear') : 'all-clear') : 'not-set-up'
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
      <div class="card-title-row">
        <h2 class="page-title">Vehicles</h2>
        <a class="btn-link" href="#/add-vehicle">
          + Add car
        </a>
      </div>

      <Reveal>
        <ul class="list">
          {rows.map(({ vehicle: v, band }) => (
            <li key={v.id}>
              <a class="list-row" href={`#/vehicle/${v.id}`}>
                <span class="vehicle-emoji" aria-hidden="true">
                  {vehicleEmoji(v)}
                </span>
                <span class="list-row-main">
                  <span class="list-row-title">{vehicleLabel(v)}</span>
                  <span class="muted small">
                    {v.year} {v.make} {v.model}
                  </span>
                </span>
                <span class={`status-pill status-pill-${band}`}>{VERDICT_BAND_LABELS[band]}</span>
                <span class="chevron" aria-hidden="true">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
