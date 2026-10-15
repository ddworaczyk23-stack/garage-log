import { useMemo, useState } from 'preact/hooks'
import { formatInterval, formatMiles, formatShortDate, localDateISO, parseNumberInput } from '../domain/format'
import {
  blankScheduleEdit,
  intervalChanged,
  reviewItems,
  SCHEDULE_GROUPS,
  UNSURE_NOTE,
  validateEdit,
  type ScheduleEdit,
  type ScheduleReviewItem,
} from '../domain/scheduleReview'
import type { Interval, MaintenanceCategory, VehicleIdentity } from '../types'
import type { VehicleTraits } from '../db/traitTemplates'

type Edits = Partial<Record<MaintenanceCategory, ScheduleEdit>>

type Props = {
  identity: VehicleIdentity
  traits: VehicleTraits
  templateKey: string
  unsure: MaintenanceCategory[]
  edits: Edits
  currentMiles: number | null
  onChange: (edits: Edits, currentMiles: number | null) => void
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  error: string
}

const POWER_TEXT: Record<VehicleTraits['power'], string> = {
  gas: 'gas', turbo: 'turbo gas', diesel: 'diesel', hybrid: 'hybrid', ev: 'electric',
}
const TRANS_TEXT: Record<VehicleTraits['trans'], string | null> = {
  auto: 'automatic', cvt: 'CVT', dct: 'dual-clutch', manual: 'manual', none: null,
}

function traitText(traits: VehicleTraits, transUnsure: boolean): string {
  const parts = [POWER_TEXT[traits.power], transUnsure ? null : TRANS_TEXT[traits.trans], traits.drive === 'none' ? null : traits.drive.toUpperCase()]
  return parts.filter(Boolean).join(', ')
}

const sameInterval = (edit: ScheduleEdit, interval: Interval) =>
  edit.customMiles === interval.miles && edit.customMonths === interval.months

// Step 2 of "Add a car": the whole trait schedule on one screen. Each row can
// be switched off, given a Suggested / Maker / Custom interval, and a
// "last done" point. Nothing is written until onSubmit (addVehicle applies the
// edits in the same transaction that creates the car).
export function ScheduleReview({ identity, traits, templateKey, unsure, edits, currentMiles, onChange, onBack, onSubmit, submitting, error }: Props) {
  const [open, setOpen] = useState<MaintenanceCategory | null>(null)
  // Rows in Custom mode. Kept apart from the values so clearing both inputs
  // while typing doesn't silently flip the row back to Suggested.
  const [customRows, setCustomRows] = useState<Set<MaintenanceCategory>>(
    () => new Set((Object.keys(edits) as MaintenanceCategory[]).filter((c) => edits[c]?.customMiles != null || edits[c]?.customMonths != null)),
  )
  const items = useMemo(() => reviewItems(templateKey), [templateKey])
  const today = localDateISO(new Date())

  const editFor = (category: MaintenanceCategory) => edits[category] ?? blankScheduleEdit()
  const errorsFor = (item: ScheduleReviewItem) =>
    Object.values(validateEdit(editFor(item.category), currentMiles, today, customRows.has(item.category)))

  const tracked = items.filter((item) => editFor(item.category).enabled).length
  const changed = items.filter((item) => {
    const edit = editFor(item.category)
    // An unsure row starts off, so off is not a change there.
    return (!edit.enabled && !unsure.includes(item.category)) || intervalChanged(edit, item)
  }).length
  const withHistory = items.filter((item) => {
    const edit = editFor(item.category)
    return edit.enabled && (edit.lastDoneDate != null || edit.lastDoneMiles != null)
  }).length
  const errorCount = items.filter((item) => errorsFor(item).length > 0).length

  function update(category: MaintenanceCategory, patch: Partial<ScheduleEdit>) {
    onChange({ ...edits, [category]: { ...editFor(category), ...patch } }, currentMiles)
  }
  function setCustom(category: MaintenanceCategory, on: boolean) {
    setCustomRows((prev) => {
      const next = new Set(prev)
      if (on) next.add(category)
      else next.delete(category)
      return next
    })
  }
  function pickInterval(item: ScheduleReviewItem, choice: 'suggested' | 'maker' | 'custom') {
    setCustom(item.category, choice === 'custom')
    if (choice === 'suggested') update(item.category, { customMiles: null, customMonths: null })
    if (choice === 'maker') update(item.category, { customMiles: item.maker.miles, customMonths: item.maker.months })
    if (choice === 'custom') update(item.category, { customMiles: item.suggested.miles, customMonths: item.suggested.months })
  }
  function reset(category: MaintenanceCategory) {
    setCustom(category, false)
    update(category, { ...blankScheduleEdit(), enabled: !unsure.includes(category) })
  }

  return (
    <section class="schedule-review">
      <a
        class="back-link"
        href="#/add-vehicle"
        onClick={(e) => {
          e.preventDefault()
          onBack()
        }}
      >
        ‹ Car details
      </a>

      <header class="schedule-review-head">
        <div class="schedule-progress" aria-hidden="true"><i class="is-on" /><i class="is-on" /><i /></div>
        <p class="eyebrow">Step 2 of 3 · Schedule</p>
        <h1>Here’s the plan for your {identity.year} {identity.make} {identity.model}</h1>
        <p>Built for {traitText(traits, unsure.includes('transmission-fluid'))}. Tap a row to change it. Switch off what you don’t need.</p>
      </header>

      <label class="schedule-current admin-field">
        <span class="muted small">Current miles — optional</span>
        <input
          type="number"
          inputMode="numeric"
          value={currentMiles ?? ''}
          placeholder="e.g. 48,000"
          onInput={(e) => onChange(edits, parseNumberInput((e.target as HTMLInputElement).value))}
        />
        <span class="field-hint">Helps us work out what’s due.</span>
      </label>

      {SCHEDULE_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group)
        if (!groupItems.length) return null
        return (
          <section class="schedule-group" key={group}>
            <h2>{group}</h2>
            <div class="schedule-card">
              {groupItems.map((item) => {
                const edit = editFor(item.category)
                const expanded = open === item.category
                const errors = errorsFor(item)
                const isCustom = customRows.has(item.category)
                const makerDiffers = item.maker.miles !== item.suggested.miles || item.maker.months !== item.suggested.months
                const choice = isCustom ? 'custom' : makerDiffers && sameInterval(edit, item.maker) ? 'maker' : 'suggested'
                const effective = choice === 'suggested' ? item.suggested : { ...item.suggested, miles: edit.customMiles, months: edit.customMonths }
                const hasLastDone = edit.lastDoneDate != null || edit.lastDoneMiles != null
                const dirty = edit.enabled === unsure.includes(item.category) || intervalChanged(edit, item) || hasLastDone || isCustom
                return (
                  <article class={`schedule-item${edit.enabled ? '' : ' is-off'}${expanded ? ' is-open' : ''}`} key={item.category}>
                    <div class="schedule-row">
                      <button
                        class="schedule-row-open"
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : item.category)}
                      >
                        <strong>
                          {item.label}
                          {edit.enabled && intervalChanged(edit, item) && <span class="schedule-tag">Changed</span>}
                        </strong>
                        <small>
                          {edit.enabled ? formatInterval(effective.miles, effective.months, effective.conditionBased) : 'Not tracked'}
                        </small>
                        {edit.enabled && hasLastDone && (
                          <em>
                            Last done {edit.lastDoneDate ? formatShortDate(edit.lastDoneDate) : ''}
                            {edit.lastDoneDate && edit.lastDoneMiles != null ? ' · ' : ''}
                            {edit.lastDoneMiles != null ? formatMiles(edit.lastDoneMiles) : ''}
                          </em>
                        )}
                        {unsure.includes(item.category) && <em class="schedule-row-unsure">{UNSURE_NOTE}</em>}
                        {!expanded && errors.length > 0 && <em class="schedule-row-error">Check this item</em>}
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={edit.enabled}
                        aria-label={`Track ${item.label}`}
                        class="schedule-switch"
                        onClick={() => update(item.category, { enabled: !edit.enabled })}
                      >
                        <i />
                      </button>
                    </div>

                    {expanded && (
                      <div class="schedule-edit">
                        {edit.enabled && (
                          <>
                            <div class="schedule-chips" role="group" aria-label="Interval">
                              <button type="button" class={`choice-chip${choice === 'suggested' ? ' is-on' : ''}`} aria-pressed={choice === 'suggested'} onClick={() => pickInterval(item, 'suggested')}>
                                Suggested · {formatInterval(item.suggested.miles, item.suggested.months, item.suggested.conditionBased)}
                              </button>
                              {makerDiffers && (
                                <button type="button" class={`choice-chip${choice === 'maker' ? ' is-on' : ''}`} aria-pressed={choice === 'maker'} onClick={() => pickInterval(item, 'maker')}>
                                  Maker · {formatInterval(item.maker.miles, item.maker.months, item.maker.conditionBased)}
                                </button>
                              )}
                              <button type="button" class={`choice-chip${choice === 'custom' ? ' is-on' : ''}`} aria-pressed={choice === 'custom'} onClick={() => pickInterval(item, 'custom')}>
                                Custom
                              </button>
                            </div>
                            {isCustom && (
                              <div class="admin-when">
                                <label class="admin-field">
                                  <span class="muted small">Every … miles</span>
                                  <input type="number" inputMode="numeric" value={edit.customMiles ?? ''} onInput={(e) => update(item.category, { customMiles: parseNumberInput((e.target as HTMLInputElement).value) })} />
                                </label>
                                <label class="admin-field">
                                  <span class="muted small">or … months</span>
                                  <input type="number" inputMode="numeric" value={edit.customMonths ?? ''} onInput={(e) => update(item.category, { customMonths: parseNumberInput((e.target as HTMLInputElement).value) })} />
                                </label>
                              </div>
                            )}
                            {item.note && <p class="schedule-note">{item.note}</p>}
                            <div class="admin-when">
                              <label class="admin-field">
                                <span class="muted small">Last done</span>
                                <input type="date" max={today} value={edit.lastDoneDate ?? ''} onInput={(e) => update(item.category, { lastDoneDate: (e.target as HTMLInputElement).value || null })} />
                              </label>
                              <label class="admin-field">
                                <span class="muted small">At miles</span>
                                <input type="number" inputMode="numeric" value={edit.lastDoneMiles ?? ''} onInput={(e) => update(item.category, { lastDoneMiles: parseNumberInput((e.target as HTMLInputElement).value) })} />
                              </label>
                            </div>
                            <span class="field-hint">Don’t know? Leave it blank.</span>
                          </>
                        )}
                        {!edit.enabled && <p class="schedule-note">Not tracked for this car. Switch it on to set it up.</p>}
                        {errors.map((message) => (
                          <p class="notice notice-error" role="alert" key={message}>{message}</p>
                        ))}
                        {dirty && (
                          <button class="btn-link" type="button" onClick={() => reset(item.category)}>
                            Reset this item
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      <p class="schedule-footnote">You can still change any item later from the car’s schedule.</p>
      {error && <p class="notice notice-error" role="alert">{error}</p>}

      <footer class="schedule-footer">
        <p class={errorCount ? 'is-error' : undefined}>
          {errorCount
            ? `Fix ${errorCount} item${errorCount === 1 ? '' : 's'} before adding the car`
            : `${tracked} of ${items.length} tracked${changed ? ` · ${changed} changed` : ''}${withHistory ? ` · ${withHistory} with history` : ''}`}
        </p>
        <button class="btn" type="button" disabled={submitting || errorCount > 0} onClick={onSubmit}>
          {submitting ? 'Adding…' : 'Add car'}
        </button>
      </footer>
    </section>
  )
}
