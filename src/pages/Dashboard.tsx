import { useQuery } from '../db/useQuery'
import { getGarageSummary, type VehicleSummary } from '../db/summary'
import { formatMiles, formatMoney, localDateISO } from '../domain/format'
import { hasRealData, vehicleVerdict } from '../domain/verdict'
import { vehicleLabel } from '../domain/vehicle'
import { PageHeader, Skel } from '../components/ui'
import { VerdictPanel, UrgencyRuler } from '../components/VerdictPanel'
import { Reveal } from '../components/motion/Reveal'
import { CalendarExport } from '../components/CalendarExport'

// Home dashboard: Coast "Today" (Stage 1, design/COAST-PLAN.md). One verdict
// per vehicle — a road-sign panel with a single plain-English sentence — with
// the urgency ruler and the "can coast" deferred list beneath it. Vehicles
// stay ranked most-urgent-first by compareVehicleUrgency (db/summary); the
// verdict layer only re-narrates each vehicle's engine output, it never
// re-decides anything. Comparison table + utility tiles remain below.
export function Dashboard() {
  const summary = useQuery(getGarageSummary)

  if (!summary) {
    return (
      <section class="page gb" role="status" aria-live="polite" aria-label="Loading your garage">
        <header class="gb-top">
          <Skel class="skel-title" />
        </header>
        <div class="gb-today-grid">
          <Skel class="skel-row" style="height: 220px" />
          <Skel class="skel-row" style="height: 220px" />
        </div>
      </section>
    )
  }

  // Health band (worst-wins across reminders AND open concerns) drives the
  // garage lamp, so a fix-now concern can't sit under a green "All caught up"
  // header. Not-set-up vehicles are neither: they get their own neutral line.
  const needsAttention = summary.vehicles.filter(
    (s) => s.health.band === 'fix-now' || s.health.band === 'book-soon',
  ).length
  const notSetUp = summary.vehicles.filter((s) => s.health.band === 'not-set-up').length
  const fixNowCount = summary.vehicles.filter((s) => s.health.band === 'fix-now').length
  const hasHistory = summary.vehicles.some((s) => hasRealData(s.reminders))

  // First run (deployed builds start genuinely empty — see db/seed.ts): one
  // clear invitation instead of an empty dashboard shell. The comparison
  // table, spend/backup tiles, and garage lamp all describe vehicles that
  // don't exist yet, so none of them render until the first car is in.
  if (summary.vehicles.length === 0) {
    return (
      <section class="page gb">
        <PageHeader eyebrow="The Garage · Today" title="Your Garage" />

        <div class="cv-card">
          <div class="cv-panel cv-slate fr-hero">
            <div class="cv-inner">
              <div class="cv-tag">Welcome to Coast</div>
              <h3 class="cv-headline">Plain-English answers about your car.</h3>
              <p class="cv-sentence">
                Add a car and Coast turns its maintenance schedule into verdicts you can act on —
                what needs attention, what can wait, and what to say at the shop counter.
              </p>
            </div>
          </div>

          {/* A real 3-step sequence — this is the activation path, in order. */}
          <ol class="fr-steps">
            <li><b>Add a car</b> — year, make, and model is enough.</li>
            <li><b>Log your last oil change</b>: the date and mileage are enough.</li>
            <li><b>Get your verdict</b> — and a shop brief whenever something's up.</li>
          </ol>

          <div class="fr-actions">
            <a class="btn btn-primary" href="#/add-vehicle">Add a car</a>
            <span class="fr-note">Takes about a minute. Everything stays on this device unless you sign in to sync.</span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section class="page gb">
      <PageHeader
        eyebrow="The Garage · Today"
        title="Your Garage"
        meta={
          <span class="gb-status">
            <span
              class={`vd-lamp ${
                fixNowCount > 0 ? 'is-overdue' : needsAttention > 0 ? 'is-due' : notSetUp > 0 ? 'is-na' : 'is-ok'
              }`}
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
        }
      />

      {/* Stacks on mobile; a 2-up board on desktop (see .gb-today-grid, R2). */}
      <div class="gb-today-grid">
        {summary.vehicles.map((s) => (
          <TodayCard key={s.vehicle.id} summary={s} year={summary.year} />
        ))}
      </div>

      {/* A comparison of one vehicle compares nothing — needs at least two. */}
      {hasHistory && summary.vehicles.length >= 2 && (
        <Reveal>
          <ComparisonCard vehicles={summary.vehicles} year={summary.year} />
        </Reveal>
      )}

      {hasHistory && (
        <Reveal>
          <section class="card">
            <h3 class="card-title">Reminders</h3>
            <p class="muted small cal-export-lead">
              Get alerts for every vehicle in your phone's Calendar, dated from each car's estimated mileage.
            </p>
            <CalendarExport />
          </section>
        </Reveal>
      )}

      <div class="gb-links">
        <a class="gb-link" href="#/costs">
          Cost summary
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
        </a>
        <a class="gb-link" href="#/backup">
          Back up your garage
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M8 7h9v9" /></svg>
        </a>
        <a class="gb-link" href="#/add-vehicle">
          Add a car
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14" /></svg>
        </a>
      </div>
    </section>
  )
}

function TodayCard({ summary: s, year }: { summary: VehicleSummary; year: number }) {
  const v = s.vehicle
  const verdict = vehicleVerdict(s.reminders, s.openConcerns, localDateISO(new Date()))
  const coastShown = verdict.coastItems.slice(0, Math.max(0, 4 - verdict.actionItems.length))

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
              {s.mileage ? `${s.mileage.projected ? '~' : ''}${formatMiles(s.mileage.miles)}` : '— mi'}
              {s.spendThisYear > 0 && <> · {formatMoney(s.spendThisYear)} in {year}</>}
            </span>
          </div>
          <VerdictPanel verdict={verdict} headingLevel="h4" />
          <UrgencyRuler verdict={verdict} />

          {verdict.unknownCount > 0 && (
            <p class="cv-unknown-note">
              {verdict.unknownCount} {verdict.unknownCount === 1 ? 'service' : 'services'} not tracked yet.
            </p>
          )}

          {/* The items behind the headline come first, so the list explains
              the sign above it; "can coast" items follow under their label. */}
          {(verdict.actionItems.length > 0 || coastShown.length > 0) && (
            <div class="cv-coast-list">
              {verdict.actionItems.map((item) => (
                <div key={item.label} class={`cv-coast-item is-${verdict.band}`}>
                  <span class="cv-coast-dot" />
                  <span>
                    <b>{item.label}</b>
                    <span class="cv-win">{item.window}</span>
                  </span>
                </div>
              ))}
              {coastShown.length > 0 && verdict.actionItems.length > 0 && (
                <div class="cv-coast-label">Can coast</div>
              )}
              {coastShown.map((item) => (
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
          {/* A not-set-up card's next step is setup, not reading a record. */}
          {verdict.band === 'not-set-up' ? 'Set it up' : 'Open Service Record'}
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
    { label: 'Overdue items', value: (s) => (hasRealData(s.reminders) ? String(s.counts.overdue) : '—') },
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
