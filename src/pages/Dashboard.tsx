import { useQuery } from '../db/useQuery'
import { getGarageSummary, type VehicleSummary } from '../db/summary'
import { formatMiles, formatMoney } from '../domain/format'
import { vehicleVerdict } from '../domain/verdict'
import { vehicleLabel } from '../domain/vehicle'
import { Loading } from '../components/ui'
import { VerdictPanel, UrgencyRuler, HealthMeter } from '../components/VerdictPanel'
import { Reveal } from '../components/motion/Reveal'

// Home dashboard: Coast "Today" (Stage 1, design/COAST-PLAN.md). One verdict
// per vehicle — a road-sign panel with a single plain-English sentence — with
// the urgency ruler and the "can coast" deferred list beneath it. Vehicles
// stay ranked most-urgent-first by compareVehicleUrgency (db/summary); the
// verdict layer only re-narrates each vehicle's engine output, it never
// re-decides anything. Comparison table + utility tiles remain below.
export function Dashboard() {
  const summary = useQuery(getGarageSummary)

  if (!summary) return <Loading />

  const documentCount = summary.vehicles.reduce((n, s) => n + s.documentCount, 0)
  const spendThisYear = summary.vehicles.reduce((n, s) => n + s.spendThisYear, 0)
  // Health band (worst-wins across reminders AND open concerns) drives the
  // garage lamp, so a fix-now concern can't sit under a green "All caught up"
  // header. Not-set-up vehicles are neither: they get their own neutral line.
  const needsAttention = summary.vehicles.filter(
    (s) => s.health.band === 'fix-now' || s.health.band === 'book-soon',
  ).length
  const notSetUp = summary.vehicles.filter((s) => s.health.band === 'not-set-up').length

  return (
    <section class="page gb">
      <header class="gb-top">
        <span class="eyebrow">The Garage · Today</span>
        <div class="gb-top-row">
          <h2 class="gb-name">Your Garage</h2>
          <span class="gb-status">
            <span
              class={`vd-lamp ${needsAttention > 0 ? 'is-overdue' : notSetUp > 0 ? 'is-na' : 'is-ok'}`}
            />
            {needsAttention > 0 ? (
              <b>
                {needsAttention} vehicle{needsAttention === 1 ? '' : 's'} need{needsAttention === 1 ? 's' : ''} attention
              </b>
            ) : notSetUp > 0 ? (
              <b>{notSetUp === summary.vehicles.length ? 'Not set up yet' : `${notSetUp} not set up yet`}</b>
            ) : (
              <b class="tone-ok">All caught up</b>
            )}{' '}
            · {summary.vehicles.length} vehicle{summary.vehicles.length === 1 ? '' : 's'}
          </span>
        </div>
        <hr class="rule-double" />
      </header>

      {summary.vehicles.length === 0 ? (
        <p class="muted small">No vehicles yet — add one to get started.</p>
      ) : (
        // Stacks on mobile; a 2-up board on desktop (see .gb-today-grid, R2).
        <div class="gb-today-grid">
          {summary.vehicles.map((s) => (
            <TodayCard key={s.vehicle.id} summary={s} year={summary.year} />
          ))}
        </div>
      )}

      <Reveal>
        <ComparisonCard vehicles={summary.vehicles} year={summary.year} />
      </Reveal>

      <div class="gb-util">
        <Reveal class="gb-u-wrap">
          <a class="card gb-u-tile" href="#/costs">
            <span class="kicker">Spent this year</span>
            <span class="gb-u-big">{formatMoney(spendThisYear)}</span>
            <span class="gb-u-cta">
              Cost summary
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
            </span>
          </a>
        </Reveal>
        <Reveal class="gb-u-wrap">
          <a class="card gb-u-tile" href="#/backup">
            <span class="kicker">Backup</span>
            <span class="gb-u-big">{summary.vehicles.length} · {documentCount}</span>
            <span class="gb-u-cta">
              Back up garage
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
            </span>
          </a>
        </Reveal>
        <Reveal class="gb-u-wrap">
          <a class="card gb-u-tile gb-u-add" href="#/add-vehicle">
            <span class="gb-u-plus" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <span class="gb-u-cta" style="color:var(--text)">Add a vehicle</span>
          </a>
        </Reveal>
      </div>
    </section>
  )
}

function TodayCard({ summary: s, year }: { summary: VehicleSummary; year: number }) {
  const v = s.vehicle
  const verdict = vehicleVerdict(s.reminders, s.openConcerns)

  return (
    <Reveal class="cv-card">
      <a class="card gb-tile" href={`#/vehicle/${v.id}`}>
        {/* Groups the variable-length content (verdict sentence, optional ruler
            note, coast list) so it can flex-grow on the desktop 2-up grid —
            that pins the footer link to the same bottom edge on both cards
            regardless of which vehicle's verdict text is longer. */}
        <div class="cv-body">
          <div class="cv-veh-row">
            <h3 class="cv-veh-name">{vehicleLabel(v)}</h3>
            <span class="cv-veh-meta">
              {s.mileage ? formatMiles(s.mileage.miles) : '— mi'}
              {s.spendThisYear > 0 && <> · {formatMoney(s.spendThisYear)} in {year}</>}
            </span>
          </div>
          <HealthMeter health={s.health} />

          <VerdictPanel verdict={verdict} />
          <UrgencyRuler verdict={verdict} />

          {verdict.coastItems.length > 0 && (
            <div class="cv-coast-list">
              {verdict.coastItems.map((item) => (
                <div key={item.label} class="cv-coast-item">
                  <span class="cv-coast-dot" />
                  <span>
                    <b>{item.label}</b>
                    <span class="cv-win">{item.window}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <span class="open-link cv-open-row">
          Open Service Record
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
        </span>
      </a>
    </Reveal>
  )
}

function ComparisonCard({ vehicles, year }: { vehicles: VehicleSummary[]; year: number }) {
  const rows: { label: string; value: (s: VehicleSummary) => string }[] = [
    {
      label: `Miles driven (${year})`,
      value: (s) => (s.milesThisYear != null ? formatMiles(s.milesThisYear) : '—'),
    },
    { label: `Spent this year`, value: (s) => (s.spendThisYear > 0 ? formatMoney(s.spendThisYear) : '—') },
    { label: 'Overdue items', value: (s) => String(s.counts.overdue) },
    { label: 'Completed items', value: (s) => String(s.counts.completed) },
    { label: 'Documents', value: (s) => String(s.documentCount) },
  ]

  return (
    <section class="card">
      <h3 class="card-title">Side-by-side</h3>
      <table class="compare-table">
        <thead>
          <tr>
            <th></th>
            {vehicles.map((s) => (
              <th key={s.vehicle.id}>{vehicleLabel(s.vehicle)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td class="muted">{row.label}</td>
              {vehicles.map((s) => (
                <td key={s.vehicle.id}>{row.value(s)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
