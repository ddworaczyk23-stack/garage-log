import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getVehicleReminders } from '../db/summary'
import { STATUS_LABELS } from '../types'

async function loadVehiclesWithStatus() {
  const vehicles = await db.vehicles.orderBy('name').toArray()
  return Promise.all(
    vehicles.map(async (v) => ({
      vehicle: v,
      top: (await getVehicleReminders(v.id))[0] ?? null,
    })),
  )
}

// Vehicle list. Each row links to detail and shows its most urgent reminder
// status as a quick at-a-glance badge.
export function Vehicles() {
  const rows = useQuery(loadVehiclesWithStatus)

  if (!rows) return <p class="muted pad">Loading…</p>

  return (
    <section class="page">
      <h2 class="page-title">Vehicles</h2>

      <ul class="list">
        {rows.map(({ vehicle: v, top }) => (
          <li key={v.id}>
            <a class="list-row" href={`#/vehicle/${v.id}`}>
              <span class="vehicle-emoji" aria-hidden="true">
                {v.make === 'Ford' ? '🛻' : '🚙'}
              </span>
              <span class="list-row-main">
                <span class="list-row-title">{v.name}</span>
                <span class="muted small">
                  {v.year} {v.make} {v.model}
                </span>
              </span>
              {top && (
                <span class={`status-pill status-${top.status}`}>{STATUS_LABELS[top.status]}</span>
              )}
              <span class="chevron" aria-hidden="true">
                ›
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
