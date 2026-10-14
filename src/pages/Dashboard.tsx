import { useQuery } from '../db/useQuery'
import { getGarageSummary, type VehicleSummary } from '../db/summary'
import { formatMiles, formatMoney, localDateISO } from '../domain/format'
import { hasRealData, vehicleVerdict } from '../domain/verdict'
import { vehicleLabel } from '../domain/vehicle'
import { PageHeader, Skel } from '../components/ui'
import { VerdictPanel, UrgencyRuler } from '../components/VerdictPanel'
import { Reveal } from '../components/motion/Reveal'
import { CalendarExport } from '../components/CalendarExport'
import { ArrowRightIcon } from '../components/icons'

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
  const hasHistory = summary.vehicles.some((s) => hasRealData(s.reminders))

  // First run (deployed builds start genuinely empty — see db/seed.ts): one
  // clear invitation instead of an empty dashboard shell. The comparison
  // table, spend/backup tiles, and garage lamp all describe vehicles that
  // don't exist yet, so none of them render until the first car is in.
  if (summary.vehicles.length === 0) {
    return (
      <section class="page gb">
        <PageHeader title="Plain-English answers about your car." />

        <div class="fr-actions">
          <a class="btn btn-primary" href="#/add-vehicle">Add a car</a>
          <span class="fr-note">Takes about a minute.</span>
        </div>
      </section>
    )
  }

  return (
    <section class="page gb">
      <PageHeader title="Your Garage" />

      {/* Stacks on mobile; a 2-up board on desktop (see .gb-today-grid, R2). */}
      <div class="gb-today-grid">
        {summary.vehicles.map((s) => (
          <TodayCard key={s.vehicle.id} summary={s} year={summary.year} />
        ))}
      </div>

      {hasHistory && (
        <Reveal>
          <section class="card">
            <CalendarExport />
          </section>
        </Reveal>
      )}

      <div class="gb-links">
        <a class="gb-link" href="#/costs">
          Cost summary
          <ArrowRightIcon />
        </a>
      </div>
    </section>
  )
}

function TodayCard({ summary: s, year }: { summary: VehicleSummary; year: number }) {
  const v = s.vehicle
  const verdict = vehicleVerdict(s.reminders, s.openConcerns, localDateISO(new Date()))
  const coastShown = verdict.coastItems.slice(0, Math.max(0, 4 - verdict.actionItems.length))
  const showActionItems = verdict.actionItems.length !== 1
  const cardVerdict = verdict.band === 'not-set-up'
    ? { ...verdict, sentence: 'Log your last oil change to start.' }
    : verdict

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
          <VerdictPanel verdict={cardVerdict} headingLevel="h4" />
          <UrgencyRuler verdict={verdict} />

          {/* The items behind the headline come first, so the list explains
              the sign above it; "can coast" items follow under their label. */}
          {(showActionItems && verdict.actionItems.length > 0 || coastShown.length > 0) && (
            <div class="cv-coast-list">
              {showActionItems && verdict.actionItems.map((item) => (
                <div key={item.label} class={`cv-coast-item is-${verdict.band}`}>
                  <span class="cv-coast-dot" />
                  <span>
                    <b>{item.label}</b>
                    <span class="cv-win">{item.window}</span>
                  </span>
                </div>
              ))}
              {coastShown.length > 0 && showActionItems && verdict.actionItems.length > 0 && (
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
          {verdict.band === 'not-set-up' ? 'Set it up' : 'Open'}
          <ArrowRightIcon />
        </span>
      </a>
    </Reveal>
  )
}
