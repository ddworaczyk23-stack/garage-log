import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import {
  completeMilestone,
  getMilestoneContext,
  reopenMilestone,
  setMilestoneItem,
  setMilestoneNotes,
  skipMilestone,
} from '../db/milestones'
import { formatMiles, formatShortDate, localDateISO, parseNumberInput } from '../domain/format'
import {
  ACTION_LABELS,
  buildMilestoneChecklist,
  milestoneName,
  milestoneOverview,
  type MilestoneAction,
} from '../domain/milestones'
import { vehicleLabel } from '../domain/vehicle'
import { MILESTONE_STATE_LABELS, MILESTONE_STATE_PILL } from '../components/MilestoneCard'
import { EmptyState, SkeletonPage } from '../components/ui'

// One milestone checkup (#/milestone/<vehicleId>/<miles>): the tailored
// checklist grouped by action, saved as you tick, plus mark done / skip.
// Independent of the service schedule by design (see domain/milestones.ts).

const ACTION_ORDER: MilestoneAction[] = ['inspect', 'replace', 'fluids', 'test']

export function MilestoneDetail({ vehicleId, miles }: { vehicleId: string; miles: number }) {
  const ctx = useQuery(() => getMilestoneContext(vehicleId), [vehicleId])
  const [completing, setCompleting] = useState(false)
  const [date, setDate] = useState(() => localDateISO(new Date()))
  const [odo, setOdo] = useState('')
  const [error, setError] = useState('')

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
  const items = buildMilestoneChecklist(miles, profile)
  const view = milestoneOverview(mileage?.miles ?? null, profile, vehicle.milestones).all.find(
    (m) => m.miles === miles,
  )
  const state = view?.state ?? 'upcoming'
  const done = items.filter((i) => checked.has(i.id)).length

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

      <header class="sd-head">
        <span class="eyebrow">Milestone · {vehicleLabel(vehicle)}</span>
        <h2 class="sd-title">{milestoneName(miles)}</h2>
      </header>

      <section class="card">
        <div class="sd-status-row">
          <span class={`status-pill ${MILESTONE_STATE_PILL[state]}`}>{MILESTONE_STATE_LABELS[state]}</span>
          <span class="muted small">
            {record?.completedDate
              ? `Done ${formatShortDate(record.completedDate)}${record.completedMiles != null ? ` at ${formatMiles(record.completedMiles)}` : ''}`
              : view?.milesAway != null
                ? view.milesAway > 0
                  ? `In ~${formatMiles(view.milesAway)}`
                  : `Passed ${formatMiles(-view.milesAway)} ago`
                : `At ${formatMiles(miles)}`}
            {` · ${done}/${items.length} checked`}
          </span>
        </div>
        <p class="muted small ms-disclaimer">
          General guidance tailored to this car's engine and drivetrain. Check your owner's manual for
          exact specs. Separate from your service schedule: ticking items here doesn't log a service.
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
              {group.map((item) => (
                <li key={item.id}>
                  <label class="ms-check">
                    <input
                      type="checkbox"
                      checked={checked.has(item.id)}
                      onChange={(e) =>
                        setMilestoneItem(vehicleId, miles, item.id, (e.target as HTMLInputElement).checked)
                      }
                    />
                    <span>
                      <span class="ms-check-label">{item.label}</span>
                      {item.hint && <span class="muted small ms-check-hint">{item.hint}</span>}
                    </span>
                  </label>
                </li>
              ))}
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
    </section>
  )
}
