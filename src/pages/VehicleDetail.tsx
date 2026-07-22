import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { formatShortDate, localDateISO } from '../domain/format'
import { getVehicleReminders } from '../db/summary'
import { getCurrentMileageEstimate } from '../db/events'
import { getOpenConcerns } from '../db/concerns'
import { hasRealData, vehicleVerdict } from '../domain/verdict'
import { VerdictPanel, UrgencyRuler } from '../components/VerdictPanel'
import type { ComputedReminder } from '../domain/reminderEngine'
import { deleteVehicle } from '../db/vehicles'
import { EventForm } from '../components/EventForm'
import { OdometerForm } from '../components/OdometerForm'
import { EventListItem } from '../components/EventListItem'
import { ScheduleRow } from '../components/ScheduleRow'
import { MileageHistory } from '../components/MileageHistory'
import { DocumentGrid } from '../components/DocumentGrid'
import { VehicleDocuments } from '../components/VehicleDocuments'
import { NicknameEditor } from '../components/NicknameEditor'
import { VehicleSpecsEditor } from '../components/VehicleSpecsEditor'
import { AnnualMileageEditor } from '../components/AnnualMileageEditor'
import { Loading, Skel, ConfirmButton, InfoTip } from '../components/ui'
import { Reveal } from '../components/motion/Reveal'
import { Collapsible } from '../components/motion/Collapsible'
import { Instrument } from '../components/motion/Instrument'
import { useIntroGate, useReducedMotion } from '../motion/hooks'
import { vehicleLabel } from '../domain/vehicle'
import type { MaintenanceCategory, VehicleDocument } from '../types'

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

// Vehicle detail: the editorial "Service Record" — identity, the odometer
// instrument, the personalized maintenance schedule scored by the reminders
// engine (with per-row progress), quick-add for service/
// repair/odometer, collapsible history, documents, and delete. The reminders
// engine is untouched — it's only fed by what gets logged, and logging updates
// the gauge/tally live via Dexie liveQuery.
export function VehicleDetail({ id }: Props) {
  const reduced = useReducedMotion()
  const intro = useIntroGate(`gl_intro_vehicle_${id}`) && !reduced

  const [activeForm, setActiveForm] = useState<ActiveForm>(null)
  const [editingName, setEditingName] = useState(false)
  const [editingSpecs, setEditingSpecs] = useState(false)
  const [serviceCategory, setServiceCategory] = useState<MaintenanceCategory | undefined>(undefined)
  const formRef = useRef<HTMLDivElement>(null)
  const quickAddRef = useRef<HTMLDivElement>(null)
  const [showSticky, setShowSticky] = useState(false)

  const vehicle = useQuery(async () => (await db.vehicles.get(id)) ?? null, [id])
  const reminders = useQuery(() => getVehicleReminders(id), [id])
  const openConcerns = useQuery(() => getOpenConcerns(id), [id])
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

  if (vehicle === undefined) {
    return (
      <section class="page" role="status" aria-live="polite" aria-label="Loading vehicle">
        <Skel class="skel-title" />
        <Skel class="skel-row" style="height: 140px; margin-bottom: 16px" />
        <div class="skel-list">
          <Skel class="skel-row" />
          <Skel class="skel-row" />
          <Skel class="skel-row" />
        </div>
      </section>
    )
  }
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
  // False while the vehicle has no logged history and no odometer estimate —
  // the schedule's baseline statuses aren't knowledge yet (see domain/verdict).
  const known = reminders ? hasRealData(reminders) : true
  const stale = mileage
    ? (Date.now() - new Date(`${mileage.asOfDate}T00:00:00`).getTime()) / 86_400_000 > 45
    : false

  // Split the ranked ledger so only what actually needs attention is expanded
  // by default; everything on-track or not-applicable folds behind a single
  // Collapsible — the full list was previously always shown in one long
  // stack, forcing a scroll past everything just to reach history below it.
  const actionable = list.filter((r) => r.status === 'overdue' || r.status === 'due-next')
  const onTrack = list.filter((r) => r.status !== 'overdue' && r.status !== 'due-next')

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

  function renderRow(r: ComputedReminder) {
    return (
      <ScheduleRow
        key={r.rule.id}
        reminder={r}
        onLog={(category) => openForm('service', category)}
        animate={intro}
        reduced={reduced}
      />
    )
  }

  return (
    <section class="page vd">
      <a class="back-link" href="#/vehicles">
        ‹ Vehicles
      </a>

      <div class="vd-layout">
      <div class="vd-rail">
      {/* masthead */}
      <header class="vd-masthead">
        <span class="eyebrow">Service Record · {vehicle.year} {vehicle.make}</span>
        {editingName ? (
          <NicknameEditor vehicle={vehicle} onDone={() => setEditingName(false)} />
        ) : (
          <>
            <h2 class="vd-name">{vehicleLabel(vehicle)}</h2>
            <p class="vd-spec">
              {/* The name appears here only when the h2 is showing a nickname
                  instead — otherwise the h2 IS the name and repeating it reads
                  as a stutter ("Camry LE" over "2019 TOYOTA CAMRY LE"). */}
              {[
                vehicle.nickname
                  ? `${vehicle.year} ${vehicle.make} ${vehicle.name}`
                  : `${vehicle.year} ${vehicle.make}`,
                vehicle.engine,
                vehicle.drivetrain,
              ]
                .filter(Boolean)
                .join(' · ')
                .toUpperCase()}
            </p>
            <button type="button" class="btn-link vd-rename" onClick={() => setEditingName(true)}>
              {vehicle.nickname ? 'Edit nickname' : 'Add nickname'}
            </button>
          </>
        )}
        <hr class="rule-double" />
      </header>

      {/* Coast verdict: the one-sentence answer for this vehicle (Stage 1,
          design/COAST-PLAN.md) — pure re-narration of the ranked reminders,
          merged with any open triage concerns (Stage 2). */}
      {reminders && reminders.length > 0 && (
        <div class="cv-card">
          {(() => {
            const verdict = vehicleVerdict(reminders, openConcerns ?? [], localDateISO(new Date()))
            return (
              <>
                <VerdictPanel verdict={verdict} tag="This vehicle" />
                <UrgencyRuler verdict={verdict} />
                {verdict.band === 'not-set-up' && (
                  <div class="vd-setup">
                    <a class="btn-link" href={`#/import/${id}`}>
                      Import service history →
                    </a>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}

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
            <button type="button" class="btn odo-cta" onClick={() => openForm('odometer')}>
              + Add odometer reading
            </button>
            <div class="odo-foot">No readings yet.</div>
          </div>
        )}

        <Collapsible title="Specifications" count="4 fields">
          {editingSpecs ? (
            <VehicleSpecsEditor vehicle={vehicle} onDone={() => setEditingSpecs(false)} />
          ) : (
            <>
              <dl class="vd-spec-table">
                <div class="vd-spec-row"><dt>Engine</dt><dd>{vehicle.engine || 'Not set'}</dd></div>
                <div class="vd-spec-row"><dt>Drivetrain</dt><dd>{vehicle.drivetrain || 'Not set'}</dd></div>
                <div class="vd-spec-row"><dt>Trim</dt><dd>{vehicle.trim || 'Not set'}</dd></div>
                <div class="vd-spec-row"><dt>VIN</dt><dd class="muted">{vehicle.vin ?? 'Not set'}</dd></div>
              </dl>
              <button type="button" class="btn-link" onClick={() => setEditingSpecs(true)}>
                Edit specifications
              </button>
            </>
          )}
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
      </div>

      <div class="vd-main">
      {/* service schedule: bullet ledger, actionable items expanded, the rest
          folded behind a Collapsible so the common case (most items on
          track) doesn't force a long scroll to reach history below it */}
      <section class="card vd-schedule">
        <div class="card-title-row">
          <h3 class="card-title">
            Service schedule
            <InfoTip label="About this schedule">
              Personalized from mechanic-consensus intervals + this vehicle's logged history. Ranked
              most urgent first. Dates below are estimated from your average mileage.
            </InfoTip>
          </h3>
          <a class="btn-link" href={`#/import/${id}`}>
            Import history →
          </a>
        </div>

        <AnnualMileageEditor vehicleId={id} />

        {!reminders ? (
          <Loading />
        ) : list.length === 0 ? (
          <p class="muted small">No schedule items.</p>
        ) : (
          <>
            {actionable.length === 0 ? (
              <p class="muted small">
                {known
                  ? 'Nothing needs attention right now — nice.'
                  : 'These are general starting intervals. Add an odometer reading or log a service, and they start tracking this car for real.'}
              </p>
            ) : (
              <ul class="vd-ledger">{actionable.map(renderRow)}</ul>
            )}

            {onTrack.length > 0 && (
              <Collapsible
                title="On track"
                count={`${onTrack.length} item${onTrack.length === 1 ? '' : 's'}`}
              >
                <ul class="vd-ledger">{onTrack.map(renderRow)}</ul>
              </Collapsible>
            )}
          </>
        )}
      </section>

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
        <MileageHistory vehicleId={id} />
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

      <p class="colophon">Coast · The service record, kept honest</p>
      </div>
      </div>

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
