import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { getGarageSummary, type VehicleSummary } from '../db/summary'
import { formatMiles, formatMoney, formatShortDate, localDateISO } from '../domain/format'
import {
  compactSign,
  comingUp,
  garageTally,
  hasRealData,
  joinAnd,
  recentWork,
  vehicleVerdict,
  VERDICT_BAND_LABELS,
  type VerdictBand,
} from '../domain/verdict'
import { vehicleBody, vehicleLabel } from '../domain/vehicle'
import { visitBundle } from '../domain/bundles'
import { PageHeader, Skel } from '../components/ui'
import { BAND_CLASS } from '../components/VerdictPanel'
import { Reveal } from '../components/motion/Reveal'
import { useIntroGate, useReducedMotion, useReveal } from '../motion/hooks'
import { CalendarExport } from '../components/CalendarExport'
import { ChevronRightIcon, VehicleIcon } from '../components/icons'
import type { Vehicle } from '../types'

// Home: one line for the whole garage, three quick buttons, then one small
// card per vehicle (a one-line road sign, a label-free urgency ruler, one line
// for what else is behind it) and a "Coming up" list of can-coast items
// across every car. The full verdict lives on the car page, one tap away.
// Vehicles stay ranked most-urgent-first by compareVehicleUrgency
// (db/summary); this page only re-narrates the engine, it never re-decides.
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

  const yearSpend = summary.vehicles.reduce((sum, v) => sum + v.spendThisYear, 0)
  const tally = garageTally(summary.vehicles)
  const upcoming = comingUp(
    summary.vehicles.map((s) => ({ vehicleId: s.vehicle.id, vehicleName: vehicleLabel(s.vehicle), reminders: s.reminders })),
  )
  const recent = recentWork(summary.vehicles.map((s) => ({
    vehicleId: s.vehicle.id,
    vehicleName: vehicleLabel(s.vehicle),
    events: [...s.recentServices, ...s.recentRepairs],
  })))

  return (
    <section class="page gb">
      <PageHeader
        title="Your Garage"
        class="hm-head"
        meta={<GarageLine fixNow={tally.fixNow} bookSoon={tally.bookSoon} hasHistory={hasHistory} />}
      >
        <QuickActions vehicles={summary.vehicles.map((s) => s.vehicle)} />
      </PageHeader>

      {/* Stacks on mobile; a 2-up board on desktop (see .gb-today-grid, R2). */}
      <div class="gb-today-grid">
        {summary.vehicles.map((s) => (
          <TodayCard key={s.vehicle.id} summary={s} year={summary.year} />
        ))}
      </div>

      <div class="hm-grid">
        {/* Also shown with an empty list once history exists: it carries the
            Calendar button, which used to be its own card. */}
        {(upcoming.length > 0 || hasHistory) && (
          <Reveal>
            <section class="card box" aria-labelledby="hm-coming-title">
              <div class="box-head">
                <h3 id="hm-coming-title">Coming up</h3>
                <span class="box-key">{upcoming.length > 0 ? `${upcoming.length} coming up` : 'Nothing else yet'}</span>
              </div>
            {upcoming.map((item) => (
              <a key={`${item.vehicleId}:${item.label}`} class="box-row" href={`#/vehicle/${item.vehicleId}`}>
                <span class="cv-coast-dot" aria-hidden="true" />
                <b class="box-row-title">{item.label}</b>
                <span class="box-tag">{item.vehicleName}</span>
                <span class="box-row-value">{item.window}</span>
                <ChevronRightIcon />
              </a>
            ))}
              {hasHistory && <div class="box-footer"><CalendarExport /></div>}
            </section>
          </Reveal>
        )}

        <Reveal class="hm-spent">
          <SpentBox summaries={summary.vehicles} year={summary.year} total={yearSpend} />
        </Reveal>

        {recent.length > 0 && (
          <Reveal class="hm-recent">
            <section class="card box" aria-labelledby="hm-recent-title">
              <div class="box-head">
                <h3 id="hm-recent-title">Recent service</h3>
                <span class="box-key">Last: {formatShortDate(recent[0].date)}</span>
              </div>
              {recent.map((item) => (
                <a key={`${item.vehicleId}:${item.date}:${item.title}`} class="box-row" href={`#/vehicle/${item.vehicleId}`}>
                  <span class="cv-coast-dot is-all-clear" aria-hidden="true" />
                  <b class="box-row-title">{item.title}</b>
                  <span class="box-tag">{item.vehicleName}</span>
                  <span class="box-row-value">{formatMoney(item.cost)}<small>{formatShortDate(item.date)}</small></span>
                  <ChevronRightIcon />
                </a>
              ))}
            </section>
          </Reveal>
        )}
      </div>
    </section>
  )
}

/** Own component so the in-view watcher starts when the bars first mount. */
function SpendBars({ summaries, totals, high }: { summaries: VehicleSummary[]; totals: number[]; high: number }) {
  const reduced = useReducedMotion()
  const intro = useIntroGate('gl_intro_home_spent') && !reduced
  const { ref, inView } = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} class={`hm-bars${intro ? ' is-intro' : ''}${inView ? ' in-view' : ''}`}>
      {totals.map((monthTotal, month) => (
        <div class="hm-bar" role="img" key={MONTHS[month]} style={`height:${(monthTotal / high) * 100}%;--i:${month}`} aria-label={`${MONTHS[month]}: ${formatMoney(monthTotal)}`}>
          {summaries.map((s, index) => s.spendByMonth[month] > 0 && (
            <i key={s.vehicle.id} style={`height:${(s.spendByMonth[month] / monthTotal) * 100}%;background:${BAR_COLORS[index % BAR_COLORS.length]}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// Guide blue, a lighter blue, then slate: solid enough to read as bars on white.
const BAR_COLORS = ['var(--accent)', '#8fb3dc', 'var(--c-stale)']

function SpentBox({ summaries, year, total }: { summaries: VehicleSummary[]; year: number; total: number }) {
  const monthCount = new Date().getMonth() + 1
  const totals = Array.from({ length: monthCount }, (_, month) => summaries.reduce((sum, s) => sum + s.spendByMonth[month], 0))
  const high = Math.max(...totals, 0) || 1 // all spend dated after this month
  return (
    <section class="card box" aria-labelledby="hm-spent-title">
      <div class="box-head">
        <h3 id="hm-spent-title">Spent</h3>
        <span class="box-key">{formatMoney(total)} in {year}</span>
        <a href="#/costs">All costs</a>
      </div>
      {total === 0 ? <p class="hm-empty">No costs logged in {year} yet.</p> : (
        <div class="hm-spend">
          <SpendBars summaries={summaries} totals={totals} high={high} />
          <div class="hm-months">{MONTHS.slice(0, monthCount).map((month) => <span key={month}>{month[0]}</span>)}</div>
          <div class="hm-legend">
            {summaries.map((s, index) => <span key={s.vehicle.id}><i style={`background:${BAR_COLORS[index % BAR_COLORS.length]}`} />{vehicleLabel(s.vehicle)} <b>{formatMoney(s.spendThisYear)}</b></span>)}
          </div>
        </div>
      )}
    </section>
  )
}

/** The whole garage in one line, under the page title. */
function GarageLine({ fixNow, bookSoon, hasHistory }: { fixNow: number; bookSoon: number; hasHistory: boolean }) {
  if (!hasHistory) return <p class="hm-line">Log a service to get your first verdict.</p>
  if (fixNow + bookSoon === 0) return <p class="hm-line">Nothing due on what you’ve logged.</p>
  return (
    <p class="hm-line">
      {fixNow > 0 && (
        <span><i class="hm-sq is-fix-now" aria-hidden="true" /><b>{fixNow}</b> to fix now</span>
      )}
      {bookSoon > 0 && (
        <span><i class="hm-sq is-book-soon" aria-hidden="true" /><b>{bookSoon}</b> to book soon</span>
      )}
    </p>
  )
}

type QuickLog = 'service' | 'odometer'

/** Three thumb-sized shortcuts. With more than one car, the two log buttons
 * first ask which car; the Check flow already has its own car picker. */
function QuickActions({ vehicles }: { vehicles: Vehicle[] }) {
  const [pick, setPick] = useState<QuickLog | null>(null)

  function go(form: QuickLog, vehicleId: string) {
    try {
      sessionStorage.setItem('gl_open_log', `${vehicleId}:${form}`)
    } catch {
      // No storage: the car page still opens, just without the form.
    }
    window.location.hash = `#/vehicle/${vehicleId}`
  }

  function tap(form: QuickLog) {
    if (vehicles.length === 1) go(form, vehicles[0].id)
    else setPick((p) => (p === form ? null : form))
  }

  return (
    <>
      <div class="hm-quick">
        <button type="button" class={pick === 'service' ? 'is-on' : ''} aria-expanded={vehicles.length > 1 ? pick === 'service' : undefined} onClick={() => tap('service')}>
          <WrenchIcon />Log service
        </button>
        <button type="button" class={pick === 'odometer' ? 'is-on' : ''} aria-expanded={vehicles.length > 1 ? pick === 'odometer' : undefined} onClick={() => tap('odometer')}>
          <GaugeIcon />Update miles
        </button>
      </div>
      {pick && (
        <div class="hm-pick" role="group" aria-label="Which car?">
          <span class="hm-pick-q">Which car?</span>
          {vehicles.map((v) => (
            <button key={v.id} type="button" onClick={() => go(pick, v.id)}>{vehicleLabel(v)}</button>
          ))}
        </div>
      )}
    </>
  )
}

function TodayCard({ summary: s, year }: { summary: VehicleSummary; year: number }) {
  const v = s.vehicle
  const verdict = vehicleVerdict(s.reminders, s.openConcerns, localDateISO(new Date()))
  const sign = compactSign(verdict)
  const bundle = visitBundle(s.reminders)

  return (
    <Reveal class="cv-card">
      <a class="card gb-tile hm-car" href={`#/vehicle/${v.id}`}>
        <div class="hm-car-row">
          <span class="vehicle-emoji" aria-hidden="true"><VehicleIcon body={vehicleBody(v)} /></span>
          <span class="hm-car-id">
            <h3 class="cv-veh-name">{vehicleLabel(v)}</h3>
            <span class="cv-veh-meta">
              {s.mileage ? `${s.mileage.projected ? '~' : ''}${formatMiles(s.mileage.miles)}` : '— mi'}
              {s.spendThisYear > 0 && <> · {formatMoney(s.spendThisYear)} in {year}</>}
            </span>
          </span>
          <ChevronRightIcon />
        </div>
        <div class={`cv-panel hm-sign ${BAND_CLASS[verdict.band]}`}>
          <div class="cv-inner">
            <h4 class="hm-sign-head">{sign.headline}</h4>
            <span class="hm-sign-tag">{VERDICT_BAND_LABELS[verdict.band]}</span>
          </div>
        </div>
        {verdict.rulerPin != null && <MiniRuler pin={verdict.rulerPin} band={verdict.band} />}
        {sign.also && (
          <p class="hm-also">
            <span class={`cv-coast-dot is-${sign.also.band}`} aria-hidden="true" />
            {sign.also.text}
          </p>
        )}
        {bundle.length >= 2 && <p class="hm-also"><span class="cv-coast-dot" aria-hidden="true" />Save a trip: {joinAnd(bundle.map((r) => r.rule.label))} at one visit</p>}
      </a>
    </Reveal>
  )
}

const ZONES = ['fix-now', 'book-soon', 'coast', 'all-clear'] as const

/** The urgency ruler without its labels — the sign right above names the band. */
function MiniRuler({ pin, band }: { pin: number; band: VerdictBand }) {
  return (
    <div class="hm-ruler" role="img" aria-label={`Urgency: ${VERDICT_BAND_LABELS[band]}`}>
      {ZONES.map((z) => <i key={z} class={BAND_CLASS[z]} />)}
      <span class="hm-ruler-pin" style={`left:${pin}%`} />
    </div>
  )
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
    </svg>
  )
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4-5" />
      <circle cx="12" cy="16" r="1.2" fill="currentColor" />
    </svg>
  )
}
