import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { formatMiles, formatShortDate, localDateISO } from '../domain/format'
import { getProjectedMileage, getVehicleReminders } from '../db/summary'
import { STALE_ODOMETER_DAYS } from '../domain/reminderEngine'
import { getOpenConcerns } from '../db/concerns'
import { vehicleVerdict } from '../domain/verdict'
import { VerdictPanel, UrgencyRuler } from '../components/VerdictPanel'
import type { ComputedReminder } from '../domain/reminderEngine'
import { deleteVehicle } from '../db/vehicles'
import { EventForm, type EventFormSaveResult } from '../components/EventForm'
import { OdometerForm, type OdometerFormSaveResult } from '../components/OdometerForm'
import { EventListItem } from '../components/EventListItem'
import { ScheduleRow } from '../components/ScheduleRow'
import { MilestoneCard } from '../components/MilestoneCard'
import { CalendarExport } from '../components/CalendarExport'
import { MileageHistory } from '../components/MileageHistory'
import { VehicleDocuments } from '../components/VehicleDocuments'
import { NicknameEditor } from '../components/NicknameEditor'
import { VehicleSpecsEditor } from '../components/VehicleSpecsEditor'
import { AnnualMileageEditor } from '../components/AnnualMileageEditor'
import { Loading, Skel, ConfirmButton, InfoTip, Toast } from '../components/ui'
import { Reveal } from '../components/motion/Reveal'
import { Collapsible } from '../components/motion/Collapsible'
import { Instrument } from '../components/motion/Instrument'
import { useIntroGate, useReducedMotion } from '../motion/hooks'
import { vehicleLabel } from '../domain/vehicle'
import { CATEGORY_LABELS, type MaintenanceCategory, type VehicleDocument } from '../types'

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

// Vehicle detail: identity + verdict, quiet odometer row, personalized service
// schedule, one log menu, consolidated history/documents, and delete. The
// reminders engine is untouched — it's only fed by what gets logged, and
// logging updates the page live via Dexie liveQuery.
export function VehicleDetail({ id }: Props) {
  const reduced = useReducedMotion()
  const intro = useIntroGate(`gl_intro_vehicle_${id}`) && !reduced

  const [activeForm, setActiveForm] = useState<ActiveForm>(null)
  const [editingName, setEditingName] = useState(false)
  const [editingSpecs, setEditingSpecs] = useState(false)
  const [serviceCategory, setServiceCategory] = useState<MaintenanceCategory | undefined>(undefined)
  const [logSheetOpen, setLogSheetOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  // One-shot flag set by AddVehicle right before redirecting here on a fresh
  // creation. Consumed (removed) immediately so the welcome banner below can
  // only ever show once, even across a reload of this same page.
  const [justAdded] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false
    try {
      if (sessionStorage.getItem('gl_just_added_vehicle') !== id) return false
      sessionStorage.removeItem('gl_just_added_vehicle')
      return true
    } catch {
      return false
    }
  })

  const vehicle = useQuery(async () => (await db.vehicles.get(id)) ?? null, [id])
  const reminders = useQuery(() => getVehicleReminders(id), [id])
  const openConcerns = useQuery(() => getOpenConcerns(id), [id])
  const mileage = useQuery(() => getProjectedMileage(id), [id])
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

  // The log menu closes on Escape or a tap anywhere outside it (or its button).
  useEffect(() => {
    if (!logSheetOpen) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Element | null
      if (!t?.closest('.vd-log-sheet, .vd-sticky')) setLogSheetOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLogSheetOpen(false)
    }
    document.addEventListener('click', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [logSheetOpen])

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
  const verdict = reminders
    ? vehicleVerdict(reminders, openConcerns ?? [], localDateISO(new Date()))
    : null
  const notSetUp = verdict?.band === 'not-set-up'
  const hasCalendarDates = list.some(
    (r) =>
      (r.lastDone.date != null || r.lastDone.miles != null) &&
      (r.dueAtDate != null || r.projectedDueDate != null),
  )
  const stale = mileage
    ? (Date.now() - new Date(`${mileage.lastActual.asOfDate}T00:00:00`).getTime()) / 86_400_000 >
      STALE_ODOMETER_DAYS
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
    setLogSheetOpen(false)
    setServiceCategory(category)
    setActiveForm(form)
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        formRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }),
      ),
    )
  }
  async function handleEventSaved(result: EventFormSaveResult) {
    closeForm()
    let message =
      result.kind === 'maintenance'
        ? `${CATEGORY_LABELS[result.category]} ${result.editing ? 'updated' : 'logged'}`
        : `Repair ${result.editing ? 'updated' : 'logged'}`

    if (result.kind === 'maintenance') {
      try {
        const updated = await getVehicleReminders(id)
        const item = updated.find((r) => r.rule.category === result.category)
        if (item?.dueAtMiles != null) message += ` · next due ${formatMiles(item.dueAtMiles)}`
      } catch (err) {
        console.error('[VehicleDetail toast]', err)
      }
    }
    setToast({ id: Date.now(), message })
  }

  function handleOdometerSaved(result: OdometerFormSaveResult) {
    closeForm()
    setToast({
      id: Date.now(),
      message: `Odometer ${result.editing ? 'updated' : 'logged'} · ${formatMiles(result.miles)}`,
    })
  }

  function renderRow(r: ComputedReminder) {
    return (
      <ScheduleRow
        key={r.rule.id}
        reminder={r}
        animate={intro}
        reduced={reduced}
        estimated={notSetUp}
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
        <span class="eyebrow">Vehicle</span>
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
      {verdict && reminders && reminders.length > 0 && (
        <>
          {justAdded && verdict.band === 'not-set-up' && (
            <Reveal class="cv-card">
              <div class="cv-panel cv-slate">
                <div class="cv-inner">
                  <div class="cv-tag">You're in</div>
                  <h3 class="cv-headline">{vehicleLabel(vehicle)} is in your garage.</h3>
                  <p class="cv-sentence">
                    When was its last oil change? That one entry gives you a real verdict.
                  </p>
                  <div class="fr-actions">
                    <button
                      type="button"
                      class="btn btn-primary"
                      onClick={() => openForm('service', 'oil-change')}
                    >
                      Log last oil change
                    </button>
                    <a class="btn-link" href={`#/import/${id}`}>
                      Import service history
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          )}
          <div class="cv-card">
            <VerdictPanel verdict={verdict} tag="This vehicle" />
            <UrgencyRuler verdict={verdict} />
            {verdict.band === 'not-set-up' && !justAdded && (
              <div class="vd-setup">
                <a class="btn-link" href={`#/import/${id}`}>
                  Import service history →
                </a>
              </div>
            )}
          </div>
        </>
      )}

      {/* odometer instrument + specifications */}
      <section class="card vd-cover">
        {mileage ? (
          <Instrument
            label={mileage.isProjected ? 'Odometer · estimated' : 'Odometer'}
            value={mileage.miles}
            unit="MI"
            animate={intro}
            reduced={reduced}
            countFrom={ytdMiles != null ? mileage.miles - ytdMiles : undefined}
            footer={
              <>
                <span class="live-dot" aria-hidden="true" />
                {mileage.isProjected
                  ? `Last read ${formatMiles(mileage.lastActual.miles)} · ${formatShortDate(mileage.lastActual.asOfDate)}`
                  : `Last reading ${formatShortDate(mileage.lastActual.asOfDate)}`}
                {stale ? ' · confirm mileage' : ''}
              </>
            }
            ytd={
              ytdMiles != null
                ? { delta: ytdMiles, deltaCaption: `in ${new Date().getFullYear()}`, bars: [] }
                : undefined
            }
            action={
              <button type="button" class="btn-link odo-update" onClick={() => openForm('odometer')}>
                Update
              </button>
            }
          />
        ) : (
          <div class="instrument">
            <div class="instr-top">
              <div>
                <span class="kicker">Odometer</span>
                <div class="odo"><span class="num">—</span><span class="unit">MI</span></div>
                <div class="odo-foot">No readings yet.</div>
              </div>
              <div class="instr-side">
                <button type="button" class="btn-link odo-update" onClick={() => openForm('odometer')}>
                  Add reading
                </button>
              </div>
            </div>
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

      <div ref={formRef}>
        {activeForm === 'service' && (
          <EventForm
            key={`service-${serviceCategory ?? 'generic'}`}
            vehicleId={id}
            kind="maintenance"
            initialCategory={serviceCategory}
            defaultOdometer={mileage?.lastActual.miles}
            onDone={handleEventSaved}
            onCancel={closeForm}
          />
        )}
        {activeForm === 'repair' && (
          <EventForm
            vehicleId={id}
            kind="repair"
            defaultOdometer={mileage?.lastActual.miles}
            onDone={handleEventSaved}
            onCancel={closeForm}
          />
        )}
        {activeForm === 'odometer' && (
          <OdometerForm vehicleId={id} onDone={handleOdometerSaved} onCancel={closeForm} />
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

        {notSetUp && (
          <p class="muted small vd-schedule-note">
            No history yet — estimates use the factory schedule. Log your last service to personalize them.
          </p>
        )}

        {!reminders ? (
          <Loading />
        ) : list.length === 0 ? (
          <p class="muted small">No schedule items.</p>
        ) : (
          <>
            {actionable.length === 0 ? (
              // Never reassure about a car Coast doesn't know yet (PRODUCT.md
              // principle 1); the not-set-up note above already explains it.
              !notSetUp && <p class="muted small">Nothing needs attention right now — nice.</p>
            ) : (
              <ul class="vd-ledger">{actionable.map(renderRow)}</ul>
            )}

            {onTrack.length > 0 && (
              <Collapsible
                // Never call an unknown car "on track" (PRODUCT.md principle 1).
                title={notSetUp ? 'Estimated schedule' : 'On track'}
                count={`${onTrack.length} item${onTrack.length === 1 ? '' : 's'}`}
              >
                <ul class="vd-ledger">{onTrack.map(renderRow)}</ul>
              </Collapsible>
            )}
          </>
        )}

        {hasCalendarDates && <CalendarExport vehicleId={id} />}
      </section>

      <Reveal>
        <MilestoneCard vehicleId={id} />
      </Reveal>

      <Reveal>
        <section class="card vd-history">
          <h3 class="card-title">History &amp; documents</h3>
          <Collapsible title="Maintenance log" count={`${maintenanceEvents.length} ${maintenanceEvents.length === 1 ? 'entry' : 'entries'}`}>
            {!events ? (
              <Loading />
            ) : maintenanceEvents.length === 0 ? (
              <p class="muted small">Nothing logged yet — use + Log to add service.</p>
            ) : (
              <ul class="list">
                {maintenanceEvents.map((e) => (
                  <EventListItem key={e.id} vehicleId={id} event={e} />
                ))}
              </ul>
            )}
            <MileageHistory vehicleId={id} embedded />
          </Collapsible>
          <Collapsible title="Repair log" count={`${repairEvents.length} ${repairEvents.length === 1 ? 'entry' : 'entries'}`}>
            {!events ? (
              <Loading />
            ) : repairEvents.length === 0 ? (
              <p class="muted small">Nothing logged yet — use + Log to add a repair.</p>
            ) : (
              <ul class="list">
                {repairEvents.map((e) => (
                  <EventListItem key={e.id} vehicleId={id} event={e} />
                ))}
              </ul>
            )}
          </Collapsible>
          <VehicleDocuments vehicleId={id} eventDocuments={documents ?? []} embedded />
        </section>
      </Reveal>

      <Reveal>
        <div class="vd-delete">
          <ConfirmButton
            class="btn-link btn-link-danger"
            label="Delete vehicle"
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

      {!activeForm && logSheetOpen && (
        <div class="vd-log-sheet" id="vd-log-sheet" role="group" aria-label="Choose what to log">
          <button type="button" onClick={() => openForm('service')}>Service</button>
          <button type="button" onClick={() => openForm('repair')}>Repair</button>
          <button type="button" onClick={() => openForm('odometer')}>Odometer</button>
        </div>
      )}
      {!activeForm && (
        <button
          type="button"
          class="vd-sticky"
          aria-expanded={logSheetOpen}
          aria-controls={logSheetOpen ? 'vd-log-sheet' : undefined}
          onClick={() => setLogSheetOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Log
        </button>
      )}
      {toast && <Toast key={toast.id} message={toast.message} onDismiss={() => setToast(null)} />}
    </section>
  )
}
