import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import {
  completeMilestone,
  getMilestoneContext,
  reopenMilestone,
  setMilestoneItemOk,
  setMilestoneItemServiced,
  setMilestoneNotes,
  skipMilestone,
} from '../db/milestones'
import { formatMiles, formatShortDate, localDateISO, parseNumberInput } from '../domain/format'
import {
  ACTION_LABELS,
  MILESTONE_ITEM_CATEGORY,
  MILESTONE_ITEM_LEVEL,
  buildMilestoneChecklist,
  milestoneName,
  milestoneOverview,
  sortByLevel,
  type MilestoneAction,
  type MilestoneItem,
} from '../domain/milestones'
import { vehicleLabel } from '../domain/vehicle'
import { MILESTONE_STATE_PILL, milestoneStateLabel } from '../components/MilestoneCard'
import { EventForm } from '../components/EventForm'
import { ShieldIcon } from '../components/icons'
import { EmptyState, PageHeader, Sheet, SkeletonPage } from '../components/ui'
import { CATEGORY_LABELS } from '../types'

// One milestone checkup (#/milestone/<vehicleId>/<miles>): the tailored
// checklist grouped by action, plus mark done / skip. Each item has
// "Checked, OK" (looked at, found good; for brakes/tires/battery this also
// logs that inspection) and "Log service" (the normal log form, prefilled).
// Safety and Important items are labeled and listed first.

const ACTION_ORDER: MilestoneAction[] = ['inspect', 'replace', 'fluids', 'test']

export function MilestoneDetail({ vehicleId, miles }: { vehicleId: string; miles: number }) {
  const ctx = useQuery(() => getMilestoneContext(vehicleId), [vehicleId])
  const [completing, setCompleting] = useState(false)
  const [date, setDate] = useState(() => localDateISO(new Date()))
  const [odo, setOdo] = useState('')
  const [error, setError] = useState('')
  const [logging, setLogging] = useState<MilestoneItem | null>(null)

  if (ctx === undefined) return <SkeletonPage rows={5} />
  const valid = Number.isInteger(miles) && miles > 0 && miles % 10_000 === 0
  if (ctx === null || !valid) {
    return (
      <section class="page">
        <EmptyState
          title="Checkup not found"
          action={<a class="btn" href="#/vehicles">Back to vehicles</a>}
        />
      </section>
    )
  }

  const { vehicle, mileage, profile } = ctx
  const record = vehicle.milestones?.[String(miles)]
  const checked = new Set(record?.checked ?? [])
  const serviced = new Set(record?.serviced ?? [])
  const items = buildMilestoneChecklist(miles, profile)
  const view = milestoneOverview(mileage?.miles ?? null, profile, vehicle.milestones).all.find(
    (m) => m.miles === miles,
  )
  const state = view?.state ?? 'upcoming'
  const done = items.filter((i) => checked.has(i.id) || serviced.has(i.id)).length
  // When a "Checked, OK" inspection is logged: the checkup's done date, else today.
  const lastMiles = mileage?.lastActual.miles
  const okWhen = record?.completedDate
    ? { date: record.completedDate, miles: record.completedMiles ?? lastMiles ?? miles }
    : lastMiles != null
      ? { date: localDateISO(new Date()), miles: lastMiles }
      : null
  const loggingCategory = logging ? MILESTONE_ITEM_CATEGORY[logging.id] : undefined

  async function save() {
    const parsed = odo.trim() === '' ? null : parseNumberInput(odo)
    if (odo.trim() !== '' && (parsed == null || parsed < 0)) {
      setError('Enter the odometer as a number, or leave it blank.')
      return
    }
    await completeMilestone(vehicleId, miles, date, parsed)
    setCompleting(false)
    setError('')
  }

  return (
    <section class="page sd ms">
      <a class="back-link" href={`#/vehicle/${vehicleId}`}>
        ‹ {vehicleLabel(vehicle)}
      </a>

      <PageHeader eyebrow="Milestone" title={milestoneName(miles)} />

      <section class="card">
        <div class="sd-status-row">
          <span class={`status-pill ${MILESTONE_STATE_PILL[state]}`}>{milestoneStateLabel(state, view?.milesAway ?? null)}</span>
          <span class="muted small">
            {record?.completedDate
              ? `Done ${formatShortDate(record.completedDate)}${record.completedMiles != null ? ` at ${formatMiles(record.completedMiles)}` : ''}`
              : view?.milesAway != null
                ? view.milesAway > 0
                  ? `In ~${formatMiles(view.milesAway)}`
                  : `Passed ${formatMiles(-view.milesAway)} ago`
                : `At ${formatMiles(miles)}`}
            {` · ${done}/${items.length} done`}
          </span>
        </div>
        <p class="muted small ms-disclaimer">
          General guidance tailored to this car's engine and drivetrain. Check your owner's manual for
          exact specs. Safety and Important items are the ones not to skip. Mark each one "Checked, OK" if
          the shop looked and it was good, or log the service or repair if work was done.
        </p>

        {completing ? (
          <div class="admin-form">
            <div class="admin-when">
              <label class="admin-field">
                <span class="muted small">Date done</span>
                <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
              </label>
              <label class="admin-field">
                <span class="muted small">Odometer (optional)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={odo}
                  placeholder={mileage ? String(mileage.lastActual.miles) : ''}
                  onInput={(e) => setOdo((e.target as HTMLInputElement).value)}
                />
              </label>
            </div>
            {error && <p class="notice notice-error" role="alert">{error}</p>}
            <div class="form-actions">
              <button type="button" class="btn btn-primary" onClick={save}>
                Save as done
              </button>
              <button type="button" class="btn-link" onClick={() => setCompleting(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div class="sd-actions ms-actions">
            {state === 'done' || state === 'skipped' ? (
              <button type="button" class="btn btn-secondary" onClick={() => reopenMilestone(vehicleId, miles)}>
                Reopen
              </button>
            ) : (
              <>
                <button type="button" class="btn btn-primary" onClick={() => setCompleting(true)}>
                  Mark done
                </button>
                <button type="button" class="btn btn-secondary" onClick={() => skipMilestone(vehicleId, miles)}>
                  Skip
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {ACTION_ORDER.map((action) => {
        const group = items.filter((i) => i.action === action)
        if (!group.length) return null
        return (
          <section class="card" key={action}>
            <h3 class="card-title">{ACTION_LABELS[action]}</h3>
            <ul class="ms-checklist">
              {sortByLevel(group).map((item) => {
                const level = MILESTONE_ITEM_LEVEL[item.id]
                const ok = checked.has(item.id)
                return (
                  <li key={item.id} class="ms-item">
                    <div class="ms-item-text">
                      {level && (
                        <span class={`ms-level ms-level-${level}`}>
                          {level === 'safety' && <ShieldIcon class="ms-level-icon" />}
                          {level === 'safety' ? 'Safety' : 'Important'}
                        </span>
                      )}
                      <span class="ms-check-label">{item.label}</span>
                      {item.hint && <span class="muted small ms-check-hint">{item.hint}</span>}
                    </div>
                    <div class="ms-item-actions">
                      <button
                        type="button"
                        class={`ms-chip${ok ? ' is-on' : ''}`}
                        aria-pressed={ok}
                        onClick={() => setMilestoneItemOk(vehicleId, miles, item.id, !ok, okWhen)}
                      >
                        {ok ? '✓ ' : ''}Checked, OK
                      </button>
                      {serviced.has(item.id) ? (
                        <span class="ms-chip is-on">✓ Serviced</span>
                      ) : (
                        <button type="button" class="ms-chip" onClick={() => setLogging(item)}>
                          Log service
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      <section class="card">
        <label class="admin-field">
          <span class="card-title">Notes</span>
          <textarea
            rows={3}
            placeholder="Shop, findings, quotes…"
            defaultValue={record?.notes ?? ''}
            onBlur={(e) => setMilestoneNotes(vehicleId, miles, (e.target as HTMLTextAreaElement).value)}
          />
        </label>
      </section>

      {logging && (
        <Sheet
          eyebrow={vehicleLabel(vehicle)}
          title={`Log ${(loggingCategory ? CATEGORY_LABELS[loggingCategory] : logging.label).toLowerCase()}`}
          onClose={() => setLogging(null)}
        >
          <EventForm
            vehicleId={vehicle.id}
            kind="maintenance"
            initialCategory={loggingCategory ?? 'other'}
            defaultTitle={loggingCategory ? undefined : logging.label}
            defaultDate={record?.completedDate}
            defaultOdometer={record?.completedMiles ?? lastMiles}
            onDone={() => {
              setMilestoneItemServiced(vehicleId, miles, logging.id)
              setLogging(null)
            }}
            onCancel={() => setLogging(null)}
          />
        </Sheet>
      )}
    </section>
  )
}
