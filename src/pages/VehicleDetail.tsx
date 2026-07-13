import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { formatInterval, formatMiles, formatShortDate } from '../domain/format'
import { getVehicleReminders } from '../db/summary'
import { getCurrentMileageEstimate } from '../db/events'
import { reminderProgress } from '../domain/progress'
import type { ComputedReminder } from '../domain/reminderEngine'
import { identityFromVehicle } from '../domain/vehicleIdentity'
import { hydrateFactoryMaintenance, hydrateConsensusData, hydrateCostEstimates } from '../db/vehicleOnboarding'
import { deleteVehicle } from '../db/vehicles'
import { STATUS_LABELS } from '../types'
import { EventForm } from '../components/EventForm'
import { OdometerForm } from '../components/OdometerForm'
import { EventListItem } from '../components/EventListItem'
import { OdometerListItem } from '../components/OdometerListItem'
import { DocumentGrid } from '../components/DocumentGrid'
import { VehicleDocuments } from '../components/VehicleDocuments'
import { NicknameEditor } from '../components/NicknameEditor'
import { Loading, EmptyState, ConfirmButton } from '../components/ui'
import { Reveal } from '../components/motion/Reveal'
import { Collapsible } from '../components/motion/Collapsible'
import { Gauge } from '../components/motion/Gauge'
import { BulletTrack } from '../components/motion/BulletTrack'
import { Instrument } from '../components/motion/Instrument'
import { useIntroGate, useReducedMotion } from '../motion/hooks'
import { vehicleLabel } from '../domain/vehicle'
import type {
  ConsensusData,
  CostEstimateData,
  FactoryMaintenanceData,
  MaintenanceCategory,
  MaintenanceStatus,
  VehicleDocument,
} from '../types'

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

const LAMP_CLASS: Record<MaintenanceStatus, string> = {
  overdue: 'is-overdue',
  'due-next': 'is-due',
  'watch-next': 'is-watch',
  completed: 'is-ok',
  'not-applicable': 'is-na',
}

// The focal instrument's headline: eyebrow + one honest sentence, driven by the
// worst reminder that has a numeric target.
function focalCopy(r: ComputedReminder): { eye: string; big: ComponentChildren; tone: string } {
  const miles = r.milesRemaining
  const pct = reminderProgress(r).pct
  const pctText = pct != null ? `${Math.round(pct)}% of interval` : ''
  if (r.status === 'overdue') {
    const over = miles != null ? `${formatMiles(Math.abs(miles))} past due` : 'Past due'
    return { eye: 'Most urgent', tone: 'tone-overdue', big: <>{over}{pctText ? <> · <b>{pctText}</b></> : null}</> }
  }
  if (r.status === 'due-next') {
    const left = miles != null ? `${formatMiles(miles)} left` : 'Due now'
    return { eye: 'Due now', tone: 'tone-due', big: <>{left}{pctText ? <> · <b>{pctText}</b></> : null}</> }
  }
  if (r.status === 'watch-next') {
    const left = miles != null ? `${formatMiles(miles)} left` : 'Coming up'
    return { eye: 'Coming up', tone: 'tone-watch', big: <>{left}{pctText ? <> · <b>{pctText}</b></> : null}</> }
  }
  const next = r.dueAtMiles != null ? `next at ${formatMiles(r.dueAtMiles)}` : 'on schedule'
  return { eye: 'All on track', tone: 'tone-ok', big: <>On track · <b>{next}</b></> }
}

// Vehicle detail: the editorial "Service Record" — identity, the odometer
// instrument, the personalized maintenance schedule scored by the reminders
// engine (now with a focal gauge + per-row progress), quick-add for service/
// repair/odometer, collapsible history, documents, and delete. The reminders
// engine is untouched — it's only fed by what gets logged, and logging updates
// the gauge/tally live via Dexie liveQuery.
export function VehicleDetail({ id }: Props) {
  const reduced = useReducedMotion()
  const intro = useIntroGate(`gl_intro_vehicle_${id}`) && !reduced

  const [activeForm, setActiveForm] = useState<ActiveForm>(null)
  const [editingName, setEditingName] = useState(false)
  const [serviceCategory, setServiceCategory] = useState<MaintenanceCategory | undefined>(undefined)
  const formRef = useRef<HTMLDivElement>(null)
  const quickAddRef = useRef<HTMLDivElement>(null)
  const [showSticky, setShowSticky] = useState(false)

  const vehicle = useQuery(async () => (await db.vehicles.get(id)) ?? null, [id])
  const reminders = useQuery(() => getVehicleReminders(id), [id])
  const mileage = useQuery(() => getCurrentMileageEstimate(id), [id])
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
  const canonicalId = vehicle ? vehicle.canonicalVehicleId : undefined
  const factoryData = useQuery<FactoryMaintenanceData | null>(
    () => (canonicalId ? db.factoryMaintenanceData.get(canonicalId).then((r) => r ?? null) : Promise.resolve(null)),
    [canonicalId],
  )
  const consensusData = useQuery<ConsensusData | null>(
    () => (canonicalId ? db.consensusData.get(canonicalId).then((r) => r ?? null) : Promise.resolve(null)),
    [canonicalId],
  )
  const costData = useQuery<CostEstimateData | null>(
    () => (canonicalId ? db.costEstimateData.get(canonicalId).then((r) => r ?? null) : Promise.resolve(null)),
    [canonicalId],
  )

  // Miles driven this calendar year: current estimate minus the odometer at the
  // first data point of the year ("miles since the first entry this year").
  const ytdMiles = useMemo(() => {
    const current = mileage?.miles
    if (current == null) return null
    const year = new Date().getFullYear()
    const points = [
      ...(odometerReadings ?? []).map((r) => ({ date: r.date, miles: r.miles })),
      ...(events ?? []).map((e) => ({ date: e.date, miles: e.odometerMiles })),
    ]
      .filter((p) => p.date >= `${year}-01-01`)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    if (!points.length) return null
    return Math.max(0, current - points[0].miles)
  }, [mileage?.miles, odometerReadings, events])

  // Sticky "+ Log" appears once the quick-add bar scrolls above the viewport.
  // Re-run when the vehicle finishes loading: on the first mount the page is
  // still showing <Loading/>, so quickAddRef isn't attached yet.
  const vehicleReady = !!vehicle
  useEffect(() => {
    const el = quickAddRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => setShowSticky(!e.isIntersecting && e.boundingClientRect.top < 0),
      { threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [vehicleReady])

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

  const list = reminders ?? []
  const counts = list.reduce(
    (a, r) => {
      if (r.status === 'overdue') a.overdue++
      else if (r.status === 'due-next') a.due++
      else if (r.status !== 'not-applicable') a.ok++
      return a
    },
    { overdue: 0, due: 0, ok: 0 },
  )
  // getVehicleReminders() already returns the list ranked by urgency (overdue
  // → due-next → watch-next → completed → not-applicable), so the top item is
  // always the right one to feature — even before it has a numeric target
  // (nothing logged yet), in which case Gauge/focalCopy render their "no data
  // yet" state instead of the block disappearing entirely.
  const focal = list[0] ?? null
  const stale = mileage
    ? (Date.now() - new Date(`${mileage.asOfDate}T00:00:00`).getTime()) / 86_400_000 > 45
    : false

  function closeForm() {
    setActiveForm(null)
    setServiceCategory(undefined)
  }
  function openForm(form: Exclude<ActiveForm, null>, category?: MaintenanceCategory) {
    setServiceCategory(category)
    setActiveForm(form)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        formRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }),
      ),
    )
  }
  function toggleForm(form: Exclude<ActiveForm, null>) {
    if (activeForm === form) closeForm()
    else openForm(form)
  }

  return (
    <section class="page vd">
      <a class="back-link" href="#/vehicles">
        ‹ Vehicles
      </a>

      {/* masthead */}
      <header class="vd-masthead">
        <span class="eyebrow">Service Record · {vehicle.year} {vehicle.make}</span>
        {editingName ? (
          <NicknameEditor vehicle={vehicle} onDone={() => setEditingName(false)} />
        ) : (
          <>
            <div class="vd-title-row">
              <div>
                <span class="vd-year num">{vehicle.year}</span>
                <h2 class="vd-name">{vehicleLabel(vehicle)}</h2>
              </div>
              {vehicle.trim && <span class="vd-plate">{vehicle.trim}</span>}
            </div>
            <p class="vd-spec">
              {[vehicle.engine, vehicle.drivetrain].filter(Boolean).join(' · ').toUpperCase()}
            </p>
            <button type="button" class="btn-link vd-rename" onClick={() => setEditingName(true)}>
              {vehicle.nickname ? 'Edit nickname' : 'Add nickname'}
            </button>
          </>
        )}
        <hr class="rule-double" />
      </header>

      {/* odometer instrument + specifications */}
      <section class="card vd-cover">
        {mileage ? (
          <Instrument
            label="Odometer"
            value={mileage.miles}
            unit="MI"
            animate={intro}
            reduced={reduced}
            countFrom={ytdMiles != null ? mileage.miles - ytdMiles : undefined}
            footer={
              <>
                <span class="live-dot" aria-hidden="true" />
                Last reading {formatShortDate(mileage.asOfDate)} · confidence {stale ? 'low' : 'high'}
              </>
            }
            ytd={
              ytdMiles != null
                ? { delta: ytdMiles, deltaCaption: `in ${new Date().getFullYear()}`, bars: [] }
                : undefined
            }
          />
        ) : (
          <div class="instrument">
            <span class="kicker">Odometer</span>
            <div class="odo">
              <span class="num">—</span>
            </div>
            <div class="odo-foot">No readings yet — tap “+ Odometer”.</div>
          </div>
        )}

        <Collapsible title="Specifications" count="4 fields">
          <dl class="vd-spec-table">
            <div class="vd-spec-row"><dt>Engine</dt><dd>{vehicle.engine}</dd></div>
            <div class="vd-spec-row"><dt>Drivetrain</dt><dd>{vehicle.drivetrain}</dd></div>
            <div class="vd-spec-row"><dt>Trim</dt><dd>{vehicle.trim}</dd></div>
            <div class="vd-spec-row"><dt>VIN</dt><dd class="muted">{vehicle.vin ?? 'Not set'}</dd></div>
          </dl>
        </Collapsible>
      </section>

      {/* quick-add */}
      <div class="quick-add-bar" ref={quickAddRef}>
        <button class="btn quick-add-btn" onClick={() => toggleForm('service')}>
          + Service
        </button>
        <button class="btn quick-add-btn" onClick={() => toggleForm('repair')}>
          + Repair
        </button>
        <button class="btn quick-add-btn" onClick={() => toggleForm('odometer')}>
          + Odometer
        </button>
      </div>

      <div ref={formRef}>
        {activeForm === 'service' && (
          <EventForm
            key={`service-${serviceCategory ?? 'generic'}`}
            vehicleId={id}
            kind="maintenance"
            initialCategory={serviceCategory}
            defaultOdometer={mileage?.miles}
            onDone={closeForm}
            onCancel={closeForm}
          />
        )}
        {activeForm === 'repair' && (
          <EventForm vehicleId={id} kind="repair" defaultOdometer={mileage?.miles} onDone={closeForm} onCancel={closeForm} />
        )}
        {activeForm === 'odometer' && (
          <OdometerForm vehicleId={id} onDone={closeForm} onCancel={closeForm} />
        )}
      </div>

      {/* service schedule: focal gauge + bullet ledger */}
      <section class="card vd-schedule">
        <div class="card-title-row">
          <h3 class="card-title">Service schedule</h3>
          <a class="btn-link" href={`#/import/${id}`}>
            Import history →
          </a>
        </div>
        <p class="muted small">
          Personalized from mechanic-consensus intervals + this vehicle's logged history. Ranked most
          urgent first.
        </p>

        {!reminders ? (
          <Loading />
        ) : list.length === 0 ? (
          <p class="muted small">No schedule items.</p>
        ) : (
          <>
            {focal &&
              (() => {
                const c = focalCopy(focal)
                const prog = reminderProgress(focal)
                return (
                  <div class="vd-focus">
                    <Gauge
                      pct={prog.pct}
                      animate={intro}
                      reduced={reduced}
                      ariaLabel={`${focal.rule.label}: ${prog.pct != null ? Math.round(prog.pct) + '% of interval' : 'no fixed interval'}`}
                    />
                    <div class="vd-focus-read">
                      <div class={`vd-focus-eye ${c.tone}`}>
                        <span class="dot" />
                        {c.eye}
                      </div>
                      <div class="vd-focus-svc">{focal.rule.label}</div>
                      <div class={`vd-focus-big ${c.tone}`}>{c.big}</div>
                      <div class="vd-focus-meta">
                        {focal.dueAtMiles != null && <>due at <b>{formatMiles(focal.dueAtMiles)}</b> · </>}
                        every{' '}
                        <b>{formatInterval(focal.interval.miles, focal.interval.months, focal.interval.conditionBased)}</b>
                      </div>
                    </div>
                  </div>
                )
              })()}

            <div class="vd-tally">
              <span class="tally"><span class="vd-lamp is-overdue" />{counts.overdue} overdue</span>
              <span class="tally"><span class="vd-lamp is-due" />{counts.due} due now</span>
              <span class="tally"><span class="vd-lamp is-ok" />{counts.ok} on track</span>
            </div>

            <ul class="vd-ledger">
              {list.map((r) => {
                const prog = reminderProgress(r)
                return (
                  <li key={r.rule.id} class={`vd-row${r.status === 'overdue' ? ' is-overdue' : ''}`}>
                    <span class={`vd-lamp ${LAMP_CLASS[r.status]}`} />
                    <div class="vd-row-main">
                      <div class="vd-svc">{r.rule.label}</div>
                      <div class="vd-svc-meta">
                        <span class="interval">
                          {formatInterval(r.interval.miles, r.interval.months, r.interval.conditionBased)}
                        </span>
                        <span class="sep">·</span>
                        <span>
                          {r.reason}
                          {r.odometerStale ? ' ⚠️' : ''}
                        </span>
                      </div>
                    </div>
                    <div class="vd-row-end">
                      <span class={`status-pill status-${r.status}`}>{STATUS_LABELS[r.status]}</span>
                      {r.status !== 'not-applicable' && (
                        <button
                          type="button"
                          class="btn-link vd-log-btn"
                          onClick={() => openForm('service', r.rule.category)}
                        >
                          {r.rule.lastDoneDate ? 'Log' : 'Log first'}
                        </button>
                      )}
                    </div>
                    <BulletTrack pct={prog.pct} zone={prog.zone} animate={intro} reduced={reduced} />
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      {vehicle.canonicalVehicleId && (
        <>
          <Reveal>
            <ExternalDataCard
              title="Factory maintenance (reference)"
              data={factoryData}
              onRetry={() => hydrateFactoryMaintenance(identityFromVehicle(vehicle))}
              renderOk={(d) =>
                d.items.length === 0 ? (
                  <p class="muted small">No items returned.</p>
                ) : (
                  <ul class="schedule-list">
                    {d.items.map((item) => (
                      <li key={item.category} class="schedule-row">
                        <div class="schedule-main">
                          <span class="schedule-label">{item.label}</span>
                          <span class="muted small">
                            {formatInterval(item.interval.miles, item.interval.months, item.interval.conditionBased)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              }
            />
          </Reveal>

          <Reveal>
            <ExternalDataCard
              title="Consensus & common issues"
              data={consensusData}
              onRetry={() => hydrateConsensusData(identityFromVehicle(vehicle))}
              renderOk={(d) => (
                <>
                  <p class="small">{d.summary}</p>
                  {d.commonIssues.length > 0 && (
                    <ul class="list">
                      {d.commonIssues.map((issue) => (
                        <li key={issue.title}>
                          <strong>{issue.title}</strong>
                          <p class="muted small">{issue.description}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            />
          </Reveal>

          <Reveal>
            <ExternalDataCard
              title="Estimated costs (reference)"
              data={costData}
              onRetry={() => hydrateCostEstimates(identityFromVehicle(vehicle))}
              renderOk={(d) =>
                d.items.length === 0 ? (
                  <p class="muted small">No estimates returned.</p>
                ) : (
                  <>
                    <ul class="schedule-list">
                      {d.items.map((item) => (
                        <li key={item.category} class="schedule-row">
                          <div class="schedule-main">
                            <span class="schedule-label">{item.label}</span>
                            <span class="muted small">
                              ${item.totalLow}–${item.totalHigh} ·{' '}
                              {formatInterval(item.practicalInterval.miles, item.practicalInterval.months)} ·{' '}
                              {item.confidence} confidence
                            </span>
                          </div>
                          <p class="muted small">{item.timingNote}</p>
                        </li>
                      ))}
                    </ul>
                    <p class="muted small">{d.laborRateNote} Estimates only — not a quote.</p>
                  </>
                )
              }
            />
          </Reveal>
        </>
      )}

      <Reveal>
        <section class="card">
          <Collapsible title="Maintenance log" count={`${maintenanceEvents.length} ${maintenanceEvents.length === 1 ? 'entry' : 'entries'}`}>
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
          </Collapsible>
        </section>
      </Reveal>

      <Reveal>
        <section class="card">
          <Collapsible title="Repair log" count={`${repairEvents.length} ${repairEvents.length === 1 ? 'entry' : 'entries'}`}>
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
          </Collapsible>
        </section>
      </Reveal>

      <Reveal>
        <section class="card">
          <Collapsible title="Odometer log" count={`${odometerReadings?.length ?? 0} ${odometerReadings?.length === 1 ? 'reading' : 'readings'}`}>
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
          </Collapsible>
        </section>
      </Reveal>

      <Reveal>
        <VehicleDocuments vehicleId={id} />
      </Reveal>

      <Reveal>
        <section class="card">
          <Collapsible
            title="Service & repair receipts"
            count={`${documents?.length ?? 0} ${documents?.length === 1 ? 'file' : 'files'}`}
          >
            <div class="card-title-row" style="margin-bottom:6px">
              <p class="muted small" style="margin:0">
                Files attached to a logged service or repair.
              </p>
              <a class="btn-link" href={`#/documents/${id}`}>
                Browse all →
              </a>
            </div>
            {!documents ? <Loading /> : <DocumentGrid documents={documents} />}
          </Collapsible>
        </section>
      </Reveal>

      <Reveal>
        <div class="card danger">
          <h3 class="card-title">Delete vehicle</h3>
          <p class="muted small">
            Permanently deletes {vehicleLabel(vehicle)} and all of its logged service, repair,
            odometer, and document history. This can't be undone.
          </p>
          <ConfirmButton
            class="btn btn-danger"
            label="Delete this vehicle"
            confirmLabel="Yes, delete everything"
            busyLabel="Deleting…"
            onConfirm={async () => {
              await deleteVehicle(id)
              window.location.hash = '#/vehicles'
            }}
          />
        </div>
      </Reveal>

      <p class="colophon">Garage Log · The glovebox, kept honest</p>

      {showSticky && !activeForm && (
        <button type="button" class="vd-sticky" onClick={() => openForm('service')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Log service
        </button>
      )}
    </section>
  )
}

interface ExternalDatasetShape {
  status: 'loading' | 'ok' | 'error'
  source: string
  fetchedAt: string | null
  error?: string
}

// Shared shell for the two "hydrated after Add Car" cards: loading, retry-able
// error, and — once loaded — the caller's rendering plus a source/updated line.
function ExternalDataCard<T extends ExternalDatasetShape>({
  title,
  data,
  onRetry,
  renderOk,
}: {
  title: string
  data: T | null | undefined
  onRetry: () => void
  renderOk: (data: T) => ComponentChildren
}) {
  return (
    <section class="card">
      <h3 class="card-title">{title}</h3>
      {!data || data.status === 'loading' ? (
        <Loading label="Fetching…" />
      ) : data.status === 'error' ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load this data"
          hint={data.error ?? 'Something went wrong.'}
          action={
            <button type="button" class="btn-link" onClick={onRetry}>
              Retry
            </button>
          }
        />
      ) : (
        <>
          {renderOk(data)}
          <p class="muted small">
            {data.source} · Updated {formatShortDate(data.fetchedAt)}
          </p>
        </>
      )}
    </section>
  )
}
