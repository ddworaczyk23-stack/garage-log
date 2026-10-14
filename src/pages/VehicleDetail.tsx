import { useEffect, useMemo, useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { formatMiles, formatShortDate, localDateISO } from '../domain/format'
import { getProjectedMileage, getVehicleReminders } from '../db/summary'
import { milesThisYear } from '../domain/mileage'
import { STALE_ODOMETER_DAYS } from '../domain/reminderEngine'
import { getOpenConcerns } from '../db/concerns'
import { hasHistory, unknownReminders, vehicleVerdict } from '../domain/verdict'
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
import { ConcernList } from '../components/ConcernList'
import { Loading, Skel, ConfirmButton, InfoTip, PageHeader, Sheet, Toast } from '../components/ui'
import { PencilIcon } from '../components/icons'
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
  const garage = useQuery(() => db.vehicles.orderBy('name').toArray(), [])
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
  // Miles driven this calendar year — the same helper the dashboard uses, so
  // the two screens can never disagree.
  const ytdMiles = useMemo(() => {
    if (!odometerReadings || !events) return null
    return milesThisYear(
      [
        ...odometerReadings.map((r) => ({ date: r.date, miles: r.miles })),
        ...events.map((e) => ({ date: e.date, miles: e.odometerMiles })),
      ],
      new Date().getFullYear(),
    )
  }, [odometerReadings, events])

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

  // One-shot flag from Home's quick buttons ("Log service", "Update miles"):
  // open that form once the vehicle has loaded. Consumed at once, like
  // justAdded, so a reload doesn't reopen it.
  useEffect(() => {
    if (!vehicle) return
    let form: string | null = null
    try {
      const flag = sessionStorage.getItem('gl_open_log')
      if (flag?.startsWith(`${id}:`)) {
        sessionStorage.removeItem('gl_open_log')
        form = flag.slice(id.length + 1)
      }
    } catch {
      return
    }
    if (form !== 'service' && form !== 'odometer') return
    setActiveForm(form)
  }, [vehicle?.id])

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
  // On a set-up car, never-logged items get their own "Unknown" group: their
  // status is a factory projection, so they never sit in "needs attention".
  // (A not-set-up car has no history at all; every row there is "Estimated".)
  const unknownItems = notSetUp ? [] : unknownReminders(list)
  const isActionable = (r: ComputedReminder) => r.status === 'overdue' || r.status === 'due-next'
  const actionable = list.filter((r) => isActionable(r) && (notSetUp || hasHistory(r)))
  const onTrackAll = list.filter((r) => !actionable.includes(r) && !unknownItems.includes(r))
  // The 3 most urgent known jobs sit under the verdict so they show on the
  // first screen. The schedule below skips them, so no job is listed twice.
  const nextJobs = notSetUp ? [] : [...actionable, ...onTrackAll.filter(hasHistory)].slice(0, 3)
  const actionableRest = actionable.filter((r) => !nextJobs.includes(r))
  const onTrack = onTrackAll.filter((r) => !nextJobs.includes(r))

  function closeForm() {
    setActiveForm(null)
    setServiceCategory(undefined)
  }
  function openForm(form: Exclude<ActiveForm, null>, category?: MaintenanceCategory) {
    setLogSheetOpen(false)
    setServiceCategory(category)
    setActiveForm(form)
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
      <PageHeader
        title={
          <>
            {garage && garage.length > 2 ? (
              // 3+ cars: chips would not fit, so one menu.
              <select
                class="vd-picker-menu"
                aria-label="Switch car"
                value={id}
                onChange={(e) => {
                  location.hash = `#/vehicle/${(e.target as HTMLSelectElement).value}`
                }}
              >
                {garage.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </select>
            ) : garage && garage.length === 2 ? (
              <nav class="vd-picker" aria-label="Switch car">
                {garage.map((v) => (
                  <a
                    key={v.id}
                    href={`#/vehicle/${v.id}`}
                    class={v.id === id ? 'is-on' : undefined}
                    aria-current={v.id === id ? 'page' : undefined}
                  >
                    {vehicleLabel(v)}
                  </a>
                ))}
              </nav>
            ) : (
              vehicleLabel(vehicle)
            )}
            {!editingName && (
              <button
                type="button"
                class="vd-rename-icon"
                aria-label={vehicle.nickname ? 'Edit nickname' : 'Add nickname'}
                title={vehicle.nickname ? 'Edit nickname' : 'Add nickname'}
                onClick={() => setEditingName(true)}
              >
                <PencilIcon />
              </button>
            )}
          </>
        }
        class="vd-masthead"
      >
        {editingName ? (
          <NicknameEditor vehicle={vehicle} onDone={() => setEditingName(false)} />
        ) : (
          <>
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
          </>
        )}
      </PageHeader>

      <div class="vd-miles">
        <span class="vd-miles-num">{mileage ? `${formatMiles(mileage.miles)}` : 'No mileage yet'}</span>
        {mileage?.isProjected && <span class="vd-miles-note">estimated</span>}
        <button type="button" class="btn-link" onClick={() => openForm('odometer')}>
          {mileage ? 'Update' : 'Add reading'}
        </button>
      </div>

      {/* Coast verdict: the one-sentence answer for this vehicle (Stage 1,
          design/COAST-PLAN.md) — pure re-narration of the ranked reminders,
          merged with any open triage concerns (Stage 2). */}
      {verdict && reminders && reminders.length > 0 && (
        <>
          {justAdded && verdict.band === 'not-set-up' && (
            <Reveal class="cv-card">
              <div class="cv-panel cv-slate">
                <div class="cv-inner">
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
            <VerdictPanel verdict={verdict} />
            <UrgencyRuler verdict={verdict} />
            {openConcerns && <ConcernList vehicle={vehicle} concerns={openConcerns} />}
            {verdict.band === 'not-set-up' && !justAdded && (
              <div class="vd-setup fr-actions">
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
            )}
          </div>
        </>
      )}

      {nextJobs.length > 0 && (
        <section class="card vd-next">
          <h3 class="card-title">Next {nextJobs.length === 1 ? 'job' : `${nextJobs.length} jobs`}</h3>
          <ul class="vd-ledger">{nextJobs.map(renderRow)}</ul>
        </section>
      )}

      {/* odometer instrument + specifications, folded: the mileage is already
          in the line at the top */}
      <section class="card vd-cover">
        <Collapsible title="Odometer details">
        <Instrument
          label="Odometer"
          note={mileage?.isProjected ? 'estimated' : undefined}
          value={mileage ? mileage.miles : null}
          unit="mi"
          animate={intro}
          reduced={reduced}
          countFrom={mileage && ytdMiles != null ? mileage.miles - ytdMiles : undefined}
          facts={
            mileage
              ? [
                  {
                    label: 'Last reading',
                    value: (
                      <>
                        {mileage.isProjected && <span class="odo-fact-main">{formatMiles(mileage.lastActual.miles)}</span>}
                        <span class="odo-fact-sub">{formatShortDate(mileage.lastActual.asOfDate)}</span>
                        {stale && <span class="odo-fact-sub">Confirm mileage</span>}
                      </>
                    ),
                  },
                  ...(ytdMiles != null
                    ? [{ label: `In ${new Date().getFullYear()}`, value: <span class="odo-fact-main">+{formatMiles(ytdMiles)}</span> }]
                    : []),
                ]
              : []
          }
          action={
            <button type="button" class="btn-link odo-update" onClick={() => openForm('odometer')}>
              {mileage ? 'Update' : 'Add reading'}
            </button>
          }
        />
        </Collapsible>

        <Collapsible title="Specifications">
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
              Based on the factory schedule, adjusted when you set your own interval or log a service. Ranked
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
              actionableRest.length > 0 && <ul class="vd-ledger">{actionableRest.map(renderRow)}</ul>
            )}

            {unknownItems.length > 0 && (
              <>
                <Collapsible
                  title="Unknown"
                  count={`${unknownItems.length} item${unknownItems.length === 1 ? '' : 's'}`}
                >
                  <ul class="vd-ledger">{unknownItems.map(renderRow)}</ul>
                </Collapsible>
              </>
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
              <p class="muted small">Nothing logged yet.</p>
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
              <p class="muted small">No repairs yet.</p>
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

      </div>
      </div>

      {activeForm && (
        <Sheet
          eyebrow={vehicleLabel(vehicle)}
          title={activeForm === 'odometer' ? 'Update odometer' : `Log ${activeForm}`}
          onClose={closeForm}
        >
          <div class="sheet-seg" role="group" aria-label="What to log">
            {(['service', 'repair', 'odometer'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={activeForm === f}
                onClick={() => setActiveForm(f)}
              >
                {f === 'service' ? 'Service' : f === 'repair' ? 'Repair' : 'Odometer'}
              </button>
            ))}
          </div>
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
        </Sheet>
      )}
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
      <Toast message={toast?.message ?? ''} onDismiss={() => setToast(null)} />
    </section>
  )
}
