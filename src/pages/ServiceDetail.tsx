import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getProjectedMileage, getVehicleReminders } from '../db/summary'
import { serviceVerdict } from '../domain/verdict'
import { formatInterval, formatMiles, formatMoney, formatShortDate } from '../domain/format'
import { reminderProgress } from '../domain/progress'
import { buildServiceHistory, parseServiceId } from '../domain/serviceHistory'
import { vehicleLabel } from '../domain/vehicle'
import { BulletTrack } from '../components/motion/BulletTrack'
import { EventForm } from '../components/EventForm'
import { EventListItem } from '../components/EventListItem'
import { RuleOverrideEditor } from '../components/RuleOverrideEditor'
import { EmptyState, PageHeader, SkeletonPage } from '../components/ui'
import { VerdictPanel } from '../components/VerdictPanel'
import { WarningIcon } from '../components/icons'
import { useReducedMotion } from '../motion/hooks'
import { CATEGORY_LABELS, OVERRIDE_LABELS } from '../types'

// Service detail: one maintenance item on one vehicle (#/service/<vehicleId>:<category>,
// the same id shape as its ReminderRule). The overview re-reads the shared
// getVehicleReminders composition (never re-derives status), and the history
// is every logged visit covering this category, via domain/serviceHistory.
// Works without a rule too (e.g. a repair category), showing history only.

async function loadService(id: string) {
  const parsed = parseServiceId(id)
  if (!parsed) return null
  const vehicle = await db.vehicles.get(parsed.vehicleId)
  if (!vehicle) return null
  const [reminders, events, mileage] = await Promise.all([
    getVehicleReminders(vehicle.id),
    db.events.where('vehicleId').equals(vehicle.id).toArray(),
    getProjectedMileage(vehicle.id),
  ])
  return {
    vehicle,
    category: parsed.category,
    reminder: reminders.find((r) => r.rule.category === parsed.category) ?? null,
    history: buildServiceHistory(events, vehicle.id, parsed.category),
    mileage,
  }
}

function formatGapDays(days: number): string {
  if (days < 60) return `${days} days`
  return `${Math.round(days / 30.44)} months`
}

export function ServiceDetail({ id }: { id: string }) {
  const reduced = useReducedMotion()
  const data = useQuery(() => loadService(id), [id])
  const [logging, setLogging] = useState(false)
  const [editingInterval, setEditingInterval] = useState(false)

  if (data === undefined) return <SkeletonPage rows={4} />
  if (data === null) {
    return (
      <section class="page">
        <EmptyState
          title="Service not found"
          hint="The vehicle or item it belonged to may have been removed."
          action={<a class="btn" href="#/vehicles">Back to vehicles</a>}
        />
      </section>
    )
  }

  const { vehicle, category, reminder: r, history, mileage } = data
  const label = r?.rule.label ?? CATEGORY_LABELS[category] ?? category
  const isKnown = r != null && (r.lastDone.date != null || r.lastDone.miles != null)
  const prog = r && isKnown ? reminderProgress(r) : null
  const actionable = r && (r.status === 'overdue' || r.status === 'due-next')
  const kind = history.events[0]?.kind ?? 'maintenance'

  return (
    <section class="page sd">
      <a class="back-link" href={`#/vehicle/${vehicle.id}`}>
        ‹ {vehicleLabel(vehicle)}
      </a>

      <PageHeader eyebrow={`Service · ${vehicleLabel(vehicle)}`} title={label} />

      {r && (
        // The same road sign as the vehicle verdict, for this one service.
        <div class="cv-card sd-sign">
          <VerdictPanel verdict={serviceVerdict(r)} />
        </div>
      )}

      {r && (
        <section class="card sd-overview">
          {prog && <BulletTrack pct={prog.pct} zone={prog.zone} reduced={reduced} />}
          {r.odometerStale && (
            <p class="muted small sd-stale">
              <span class="warning-mark" aria-hidden="true">
                <WarningIcon />
              </span>
              Odometer reading may be out of date. Update it for a sharper estimate.
            </p>
          )}

          {editingInterval ? (
            <RuleOverrideEditor rule={r.rule} onDone={() => setEditingInterval(false)} />
          ) : (
            <dl class="sd-facts">
              <div>
                <dt>Interval</dt>
                <dd>
                  {formatInterval(r.interval.miles, r.interval.months, r.interval.conditionBased)}
                  <button type="button" class="btn-link sd-inline-edit" onClick={() => setEditingInterval(true)}>
                    Edit
                  </button>
                </dd>
              </div>
              <div>
                <dt>Last done</dt>
                <dd>
                  {r.lastDone.date
                    ? `${formatShortDate(r.lastDone.date)} · ${formatMiles(r.lastDone.miles)}`
                    : 'Not logged yet'}
                </dd>
              </div>
              {isKnown ? (
                <>
                  <div>
                    <dt>Next due</dt>
                    <dd>
                      {[
                        r.dueAtMiles != null ? `at ${formatMiles(r.dueAtMiles)}` : null,
                        r.dueAtDate ? `by ${formatShortDate(r.dueAtDate)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' or ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Estimated</dt>
                    <dd>{r.projectedDueDate ? `~${formatShortDate(r.projectedDueDate)}` : '—'}</dd>
                  </div>
                </>
              ) : (
                <div class="sd-facts-wide">
                  <dd class="muted small">Log the last time this was done and Coast can tell you when it’s next due.</dd>
                </div>
              )}
              {r.rule.override && (
                <div class="sd-facts-wide">
                  <dt>Override</dt>
                  <dd>
                    {OVERRIDE_LABELS[r.rule.override.kind]}
                    {r.rule.override.note ? ` · ${r.rule.override.note}` : ''}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {mileage && (
            <p class="muted small sd-odo">
              {mileage.isProjected
                ? `Odometer ~${formatMiles(mileage.miles)} (estimated) · last reading ${formatMiles(mileage.lastActual.miles)} on ${formatShortDate(mileage.lastActual.asOfDate)}`
                : `Odometer ${formatMiles(mileage.miles)} as of ${formatShortDate(mileage.asOfDate)}`}
            </p>
          )}
        </section>
      )}

      <div class="sd-actions">
        <button type="button" class="btn btn-primary" onClick={() => setLogging((v) => !v)}>
          {logging ? 'Close' : `Log ${label.toLowerCase()}`}
        </button>
        {actionable && (
          <a class="btn btn-secondary" href={`#/brief/${r.rule.id}`}>
            Shop brief
          </a>
        )}
      </div>
      {logging && (
        <EventForm
          vehicleId={vehicle.id}
          kind={kind}
          initialCategory={category}
          defaultOdometer={mileage?.lastActual.miles}
          onDone={() => setLogging(false)}
          onCancel={() => setLogging(false)}
        />
      )}

      <section class="card">
        <h3 class="card-title">History</h3>
        {/* One data line instead of a tile grid (PRODUCT.md anti-reference). */}
        {history.count > 0 && (
          <p class="sd-stats-line">
            {[
              `${history.count} ${history.count === 1 ? 'time' : 'times'}`,
              history.totalCost > 0 ? `${formatMoney(history.totalCost)} total` : null,
              history.count > 1 && history.avgCost != null ? `avg ${formatMoney(history.avgCost)}` : null,
              history.avgMilesBetween != null ? `every ~${formatMiles(history.avgMilesBetween)}` : null,
              history.avgMilesBetween == null && history.avgDaysBetween != null
                ? `every ${formatGapDays(history.avgDaysBetween)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {history.count === 0 ? (
          <p class="muted small">Nothing logged for this service yet.</p>
        ) : (
          <ul class="list">
            {history.events.map((e) => (
              <EventListItem key={e.id} vehicleId={vehicle.id} event={e} linkToService={false} />
            ))}
          </ul>
        )}
        {history.events.some((e) => e.category !== category) && (
          <p class="muted small sd-note">
            Includes visits where this was done alongside another service. Their cost counts toward
            that other service, not this one.
          </p>
        )}
      </section>
    </section>
  )
}
