import { useMemo, useState } from 'preact/hooks'
import { formatInterval, formatMiles, localDateISO, parseNumberInput } from '../domain/format'
import { blankScheduleEdit, reviewItems, validateEdit, type ScheduleEdit } from '../domain/scheduleReview'
import type { MaintenanceCategory, VehicleIdentity } from '../types'
import type { VehicleTraits } from '../db/traitTemplates'

type Props = {
  identity: VehicleIdentity
  traits: VehicleTraits
  templateKey: string
  edits: Partial<Record<MaintenanceCategory, ScheduleEdit>>
  currentMiles: number | null
  onChange: (edits: Partial<Record<MaintenanceCategory, ScheduleEdit>>, currentMiles: number | null) => void
  onBack: () => void
  onSubmit: () => void
  submitting: boolean
  error: string
}

const traitText = (traits: VehicleTraits) => `${traits.power === 'turbo' ? 'turbo gas' : traits.power}, ${traits.trans === 'none' ? 'no transmission service' : traits.trans}, ${traits.drive === 'none' ? 'standard drive' : traits.drive.toUpperCase()}`

export function ScheduleReview({ identity, traits, templateKey, edits, currentMiles, onChange, onBack, onSubmit, submitting, error }: Props) {
  const [open, setOpen] = useState<MaintenanceCategory | null>(null)
  const items = useMemo(() => reviewItems(templateKey), [templateKey])
  const today = localDateISO(new Date())
  const allErrors = items.flatMap((item) => Object.entries(validateEdit(edits[item.category] ?? blankScheduleEdit(), currentMiles, today)).map(([field, message]) => ({ category: item.category, field, message })))
  const tracked = items.filter((item) => (edits[item.category] ?? blankScheduleEdit()).enabled).length
  const changed = items.filter((item) => {
    const edit = edits[item.category]
    return !!edit && (!edit.enabled || edit.customMiles != null || edit.customMonths != null)
  }).length
  const withHistory = items.filter((item) => {
    const edit = edits[item.category]
    return edit?.lastDoneDate != null || edit?.lastDoneMiles != null
  }).length
  const groups = ['Engine', 'Tires and brakes', 'Fluids', 'Other']

  function update(category: MaintenanceCategory, patch: Partial<ScheduleEdit>) {
    onChange({ ...edits, [category]: { ...(edits[category] ?? blankScheduleEdit()), ...patch } }, currentMiles)
  }
  function useInterval(category: MaintenanceCategory, miles: number | null, months: number | null, suggested: boolean) {
    update(category, { customMiles: suggested ? null : miles, customMonths: suggested ? null : months })
  }

  return <section class="schedule-review">
    <header class="schedule-review-head">
      <div class="schedule-progress"><i /><i class="is-on" /><i /></div>
      <p class="eyebrow">STEP 2 OF 3 · SCHEDULE</p>
      <h1>Here’s the plan for your {identity.year} {identity.make} {identity.model}</h1>
      <p>Built for {traitText(traits)}. Turn off anything you don’t track, or tune the interval and history.</p>
    </header>
    <label class="schedule-current admin-field"><span class="muted small">Current miles — optional</span><input type="number" inputMode="numeric" value={currentMiles ?? ''} onInput={(e) => onChange(edits, parseNumberInput((e.target as HTMLInputElement).value))} /><span class="field-hint">Helps us work out what’s due.</span></label>
    {groups.map((group) => {
      const groupItems = items.filter((item) => item.group === group)
      if (!groupItems.length) return null
      return <section class="schedule-group" key={group}><h2>{group}</h2><div class="schedule-card">{groupItems.map((item) => {
        const edit = edits[item.category] ?? blankScheduleEdit()
        const expanded = open === item.category
        const itemErrors = allErrors.filter((entry) => entry.category === item.category)
        return <article class={`schedule-item${edit.enabled ? '' : ' is-off'}${expanded ? ' is-open' : ''}`} key={item.category}>
          <div class="schedule-row">
            <button class="schedule-row-open" type="button" onClick={() => setOpen(expanded ? null : item.category)}>
            <span><strong>{item.label}</strong><small>{edit.enabled ? formatInterval(edit.customMiles ?? item.suggested.miles, edit.customMonths ?? item.suggested.months, item.suggested.conditionBased) : 'Not tracked'}</small>{(edit.lastDoneDate || edit.lastDoneMiles != null) && <em>Last done {edit.lastDoneDate ?? '—'}{edit.lastDoneMiles != null ? ` · ${formatMiles(edit.lastDoneMiles)}` : ''}</em>}</span>
            </button><button type="button" role="switch" aria-checked={edit.enabled} class="schedule-switch" onClick={() => update(item.category, { enabled: !edit.enabled })}><i /></button>
          </div>
          {expanded && <div class="schedule-edit">
            {edit.enabled && <><div class="schedule-chips"><button type="button" class={`choice-chip${edit.customMiles == null && edit.customMonths == null ? ' is-on' : ''}`} onClick={() => useInterval(item.category, null, null, true)}>Suggested · {formatInterval(item.suggested.miles, item.suggested.months, item.suggested.conditionBased)}</button>{(item.maker.miles !== item.suggested.miles || item.maker.months !== item.suggested.months) && <button type="button" class={`choice-chip${edit.customMiles === item.maker.miles && edit.customMonths === item.maker.months ? ' is-on' : ''}`} onClick={() => useInterval(item.category, item.maker.miles, item.maker.months, false)}>Maker · {formatInterval(item.maker.miles, item.maker.months, item.maker.conditionBased)}</button>}<button type="button" class="choice-chip" onClick={() => update(item.category, { customMiles: item.suggested.miles, customMonths: item.suggested.months })}>Custom</button></div>
            {(edit.customMiles != null || edit.customMonths != null) && <div class="admin-when"><label class="admin-field"><span class="muted small">Miles</span><input type="number" value={edit.customMiles ?? ''} onInput={(e) => update(item.category, { customMiles: parseNumberInput((e.target as HTMLInputElement).value) })} /></label><label class="admin-field"><span class="muted small">Months</span><input type="number" value={edit.customMonths ?? ''} onInput={(e) => update(item.category, { customMonths: parseNumberInput((e.target as HTMLInputElement).value) })} /></label></div>}</>}
            {item.note && <p class="muted small">{item.note}</p>}<div class="admin-when"><label class="admin-field"><span class="muted small">Last done</span><input type="date" max={today} value={edit.lastDoneDate ?? ''} onInput={(e) => update(item.category, { lastDoneDate: (e.target as HTMLInputElement).value || null })} /></label><label class="admin-field"><span class="muted small">Miles</span><input type="number" value={edit.lastDoneMiles ?? ''} onInput={(e) => update(item.category, { lastDoneMiles: parseNumberInput((e.target as HTMLInputElement).value) })} /></label></div>
            {itemErrors.map((entry) => <p class="notice notice-error" key={entry.field}>{entry.message}</p>)}{(edit.customMiles != null || edit.customMonths != null || edit.lastDoneDate || edit.lastDoneMiles != null || !edit.enabled) && <button class="link-btn" type="button" onClick={() => update(item.category, blankScheduleEdit())}>Reset to suggested</button>}
          </div>}
        </article>
      })}</div></section>
    })}
    {error && <p class="notice notice-error">{error}</p>}
    <footer class="schedule-footer"><p>{tracked} OF {items.length} TRACKED · {changed} CHANGED · {withHistory} WITH HISTORY</p><button class="btn" type="button" disabled={submitting || allErrors.length > 0} onClick={onSubmit}>{submitting ? 'Adding…' : 'Add car'}</button><button class="link-btn" type="button" onClick={onBack}>‹ Back to car details</button><small>You can still change any item later from the car’s schedule.</small></footer>
  </section>
}
