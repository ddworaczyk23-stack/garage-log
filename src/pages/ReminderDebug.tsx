import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getVehicleReminders } from '../db/summary'
import { getCurrentMileageEstimate } from '../db/events'
import { STATUS_LABELS } from '../types'

async function loadReminders(vehicleId: string) {
  const [reminders, mileage] = await Promise.all([
    getVehicleReminders(vehicleId),
    getCurrentMileageEstimate(vehicleId),
  ])
  return { reminders, mileage }
}

// Dev panel (route #/reminders-debug, linked from Debug) — raw inspection of
// the reminders-engine output per rule. Data entry now happens on the real
// Vehicle Detail page (+ Service / + Repair / + Odometer); this view is purely
// for verifying the math against whatever's actually logged.
export function ReminderDebug() {
  const vehicles = useQuery(() => db.vehicles.orderBy('name').toArray())
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const activeVehicleId = vehicleId ?? vehicles?.[0]?.id ?? null

  const data = useQuery(
    () => (activeVehicleId ? loadReminders(activeVehicleId) : Promise.resolve(null)),
    [activeVehicleId],
  )

  if (!vehicles) return <p class="muted pad">Loading…</p>

  return (
    <section class="page">
      <a class="back-link" href="#/debug">
        ‹ Debug
      </a>
      <h2 class="page-title">Reminders engine</h2>
      <p class="muted small">
        Raw computed status per rule, for whatever history is actually logged on
        the vehicle's detail page.
      </p>

      <label class="admin-field card">
        <span class="muted small">Vehicle</span>
        <select
          value={activeVehicleId ?? ''}
          onChange={(e) => setVehicleId((e.target as HTMLSelectElement).value)}
        >
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      <div class="card">
        <h3 class="card-title">Current mileage estimate</h3>
        <p class="muted small">
          {data?.mileage
            ? `${data.mileage.miles.toLocaleString()} mi as of ${data.mileage.asOfDate}`
            : 'No odometer data yet.'}
        </p>
      </div>

      {!data ? (
        <p class="muted small">Loading…</p>
      ) : (
        <div class="card">
          <h3 class="card-title">Computed reminders ({data.reminders.length})</h3>
          <table class="debug-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Status</th>
                <th>Interval</th>
                <th>Last done</th>
                <th>Due @ mi</th>
                <th>Due @ date</th>
                <th>Mi left</th>
                <th>Days left</th>
                <th>Stale?</th>
              </tr>
            </thead>
            <tbody>
              {data.reminders.map((r) => (
                <tr key={r.rule.id}>
                  <td>{r.rule.label}</td>
                  <td>
                    <span class={`status-pill status-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                  </td>
                  <td class="muted">{r.interval.source}</td>
                  <td class="muted">
                    {r.lastDone.date ?? '—'}
                    {r.lastDone.miles != null ? ` / ${r.lastDone.miles.toLocaleString()}mi` : ''}
                  </td>
                  <td class="muted">{r.dueAtMiles?.toLocaleString() ?? '—'}</td>
                  <td class="muted">{r.dueAtDate ?? '—'}</td>
                  <td class="muted">{r.milesRemaining?.toLocaleString() ?? '—'}</td>
                  <td class="muted">{r.daysRemaining ?? '—'}</td>
                  <td class="muted">{r.odometerStale ? '⚠️' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
