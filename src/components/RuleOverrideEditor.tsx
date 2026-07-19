import { useState } from 'preact/hooks'
import { applyRuleOverride } from '../db/events'
import { getTemplateEntry } from '../db/scheduleTemplates'
import { resolveInterval } from '../domain/reminderStatus'
import { formatInterval, parseNumberInput } from '../domain/format'
import { OVERRIDE_LABELS, type OverrideKind, type ReminderRule } from '../types'

const OVERRIDE_KINDS = Object.keys(OVERRIDE_LABELS) as OverrideKind[]

// Inline per-item editor for a schedule row (opened from VehicleDetail's
// ScheduleRow) — lets you set a custom interval and/or mark an item not
// needed / DIY'd / already handled for THIS vehicle, without touching the
// factory or consensus reference data. Writes via the same applyRuleOverride
// path EventForm's "next-due override" section uses, so the two stay in sync;
// the reminders liveQuery re-renders the row automatically on save.
export function RuleOverrideEditor({ rule, onDone }: { rule: ReminderRule; onDone: () => void }) {
  const [customMiles, setCustomMiles] = useState(rule.customIntervalMiles?.toString() ?? '')
  const [customMonths, setCustomMonths] = useState(rule.customIntervalMonths?.toString() ?? '')
  const [overrideKind, setOverrideKind] = useState<OverrideKind | ''>(rule.override?.kind ?? '')
  const [overrideNote, setOverrideNote] = useState(rule.override?.note ?? rule.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const tmpl = getTemplateEntry(rule.templateKey, rule.category)
  const factoryText = tmpl
    ? formatInterval(tmpl.factoryInterval.miles, tmpl.factoryInterval.months, tmpl.factoryInterval.conditionBased)
    : null
  const consensusText = tmpl?.mechanicConsensusInterval
    ? formatInterval(
        tmpl.mechanicConsensusInterval.miles,
        tmpl.mechanicConsensusInterval.months,
        tmpl.mechanicConsensusInterval.conditionBased,
      )
    : null
  const effective = resolveInterval(rule)
  const effectiveText = formatInterval(effective.miles, effective.months, effective.conditionBased)

  const hasOverride = rule.customIntervalMiles != null || rule.customIntervalMonths != null || rule.override != null

  async function save(e: Event) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await applyRuleOverride(rule.id, {
        overrideKind: overrideKind || null,
        overrideNote: overrideNote.trim() || null,
        customIntervalMiles: parseNumberInput(customMiles),
        customIntervalMonths: parseNumberInput(customMonths),
      })
      onDone()
    } catch (err) {
      console.error('[RuleOverrideEditor]', err)
      setError('Something went wrong saving this item. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function resetToDefault() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await applyRuleOverride(rule.id, {
        overrideKind: null,
        overrideNote: null,
        customIntervalMiles: null,
        customIntervalMonths: null,
      })
      onDone()
    } catch (err) {
      console.error('[RuleOverrideEditor]', err)
      setError('Something went wrong resetting this item. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form class="admin-form vd-rule-editor" onSubmit={save}>
      <h4 class="card-title">{rule.label}</h4>
      <dl class="admin-meta">
        {factoryText && (
          <div>
            <dt>Factory</dt>
            <dd class="muted">{factoryText}</dd>
          </div>
        )}
        {consensusText && (
          <div>
            <dt>Consensus</dt>
            <dd>{consensusText}</dd>
          </div>
        )}
        <div>
          <dt>Effective now</dt>
          <dd class={effective.source === 'custom' ? 'admin-effective-custom' : ''}>{effectiveText}</dd>
        </div>
      </dl>

      <div class="admin-when">
        <label class="admin-field">
          <span class="muted small">Custom interval (mi)</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={tmpl?.mechanicConsensusInterval?.miles?.toString() ?? tmpl?.factoryInterval.miles?.toString() ?? ''}
            value={customMiles}
            onInput={(e) => setCustomMiles((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="admin-field">
          <span class="muted small">Custom interval (mo)</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={tmpl?.mechanicConsensusInterval?.months?.toString() ?? tmpl?.factoryInterval.months?.toString() ?? ''}
            value={customMonths}
            onInput={(e) => setCustomMonths((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <label class="admin-field">
        <span class="muted small">Status for this vehicle</span>
        <select
          value={overrideKind}
          onChange={(e) => setOverrideKind((e.target as HTMLSelectElement).value as OverrideKind | '')}
        >
          <option value="">On schedule — no override</option>
          {OVERRIDE_KINDS.map((k) => (
            <option key={k} value={k}>
              {OVERRIDE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <label class="admin-field">
        <span class="muted small">Note (optional)</span>
        <input
          type="text"
          placeholder="e.g. dealer did this at last service"
          value={overrideNote}
          onInput={(e) => setOverrideNote((e.target as HTMLInputElement).value)}
        />
      </label>

      {error && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <div class="form-actions">
        <button class="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {hasOverride && (
          <button class="btn-link" type="button" onClick={resetToDefault} disabled={saving}>
            Reset to default
          </button>
        )}
        <button class="btn-link" type="button" onClick={onDone} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}
