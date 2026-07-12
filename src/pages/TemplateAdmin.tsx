import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { getTemplateEntry } from '../db/scheduleTemplates'
import { resolveLastDone, resolveInterval, isNotApplicable } from '../domain/reminderStatus'
import { formatInterval, parseNumberInput } from '../domain/format'
import { OVERRIDE_LABELS } from '../types'
import { Loading } from '../components/ui'
import type { ReminderRule, OverrideKind } from '../types'

const OVERRIDE_KINDS = Object.keys(OVERRIDE_LABELS) as OverrideKind[]
const SOURCE_LABELS = { custom: 'Custom', consensus: 'Consensus', factory: 'Factory' } as const

// Admin / verification view (route #/template, linked from Debug). Lets you
// confirm the seeded template data (factory reference + mechanic-consensus
// default) and exercise the override/custom-interval plumbing the reminder
// engine will later consume. Intentionally minimal — not the product UI.
export function TemplateAdmin() {
  const vehicles = useQuery(() => db.vehicles.orderBy('name').toArray())
  const rules = useQuery(() => db.reminderRules.toArray())

  if (!vehicles || !rules) return <Loading />

  return (
    <section class="page">
      <a class="back-link" href="#/debug">
        ‹ Debug
      </a>
      <h2 class="page-title">Template data</h2>
      <p class="muted small">
        Every item shows the factory schedule (reference), the mechanic-consensus
        default (what's actually recommended), and the effective interval used by
        the app — custom override, else consensus, else factory. The factory and
        consensus values are fixed in code and never change; only the effective
        interval can be overridden per vehicle below.
      </p>

      {vehicles.map((v) => {
        const vr = rules
          .filter((r) => r.vehicleId === v.id)
          .sort(
            (a, b) => (resolveInterval(a).miles ?? Infinity) - (resolveInterval(b).miles ?? Infinity),
          )
        return (
          <div key={v.id}>
            <h3 class="admin-vehicle">
              {v.name} · {vr.length} items
            </h3>
            {vr.map((r) => (
              <RuleRow key={r.id} rule={r} />
            ))}
          </div>
        )
      })}
    </section>
  )
}

function RuleRow({ rule }: { rule: ReminderRule }) {
  const tmpl = getTemplateEntry(rule.templateKey, rule.category)
  const [kind, setKind] = useState<OverrideKind | ''>(rule.override?.kind ?? '')
  const [note, setNote] = useState(rule.override?.note ?? rule.notes ?? '')
  const [atMiles, setAtMiles] = useState(rule.override?.atMiles?.toString() ?? '')
  const [atDate, setAtDate] = useState(rule.override?.atDate ?? '')
  const [customMiles, setCustomMiles] = useState(rule.customIntervalMiles?.toString() ?? '')
  const [customMonths, setCustomMonths] = useState(rule.customIntervalMonths?.toString() ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const lastDone = resolveLastDone(rule)
  const effective = resolveInterval(rule)

  const factoryText = tmpl
    ? formatInterval(
        tmpl.factoryInterval.miles,
        tmpl.factoryInterval.months,
        tmpl.factoryInterval.conditionBased,
      )
    : '—'
  const consensusText = tmpl?.mechanicConsensusInterval
    ? formatInterval(
        tmpl.mechanicConsensusInterval.miles,
        tmpl.mechanicConsensusInterval.months,
        tmpl.mechanicConsensusInterval.conditionBased,
      )
    : 'Same as factory'
  const effectiveText = formatInterval(effective.miles, effective.months, effective.conditionBased)

  async function save() {
    setError('')
    const override =
      kind === ''
        ? null
        : {
            kind,
            note: note.trim() || null,
            atMiles: parseNumberInput(atMiles),
            atDate: atDate || null,
          }
    try {
      await db.reminderRules.update(rule.id, {
        override,
        notes: note.trim() || null,
        customIntervalMiles: parseNumberInput(customMiles),
        customIntervalMonths: parseNumberInput(customMonths),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      console.error('[TemplateAdmin]', err)
      setError('Something went wrong saving this rule. Please try again.')
    }
  }

  async function clearCustomInterval() {
    setError('')
    try {
      await db.reminderRules.update(rule.id, {
        customIntervalMiles: null,
        customIntervalMonths: null,
      })
      setCustomMiles('')
      setCustomMonths('')
    } catch (err) {
      console.error('[TemplateAdmin]', err)
      setError('Something went wrong clearing the custom interval. Please try again.')
    }
  }

  return (
    <div class={`card admin-row${isNotApplicable(rule) ? ' is-na' : ''}`}>
      <div class="admin-head">
        <span class="schedule-label">{rule.label}</span>
        <code class="admin-cat">{rule.category}</code>
      </div>

      <dl class="admin-meta">
        <div>
          <dt>Factory</dt>
          <dd class="muted">{factoryText}</dd>
        </div>
        <div>
          <dt>Consensus</dt>
          <dd>{consensusText}</dd>
        </div>
        <div>
          <dt>Effective ({SOURCE_LABELS[effective.source]})</dt>
          <dd class={effective.source === 'custom' ? 'admin-effective-custom' : ''}>
            {effectiveText}
          </dd>
        </div>
        <div>
          <dt>Last done</dt>
          <dd class="muted">
            {lastDone.date || lastDone.miles != null
              ? `${lastDone.date ?? '—'}${lastDone.miles != null ? ` · ${lastDone.miles.toLocaleString()} mi` : ''}`
              : 'Not yet logged'}
          </dd>
        </div>
      </dl>

      {tmpl?.consensusNote && <p class="muted small admin-note">💡 {tmpl.consensusNote}</p>}
      {tmpl?.note && <p class="muted small admin-note">ℹ️ {tmpl.note}</p>}

      <div class="admin-form">
        <div class="admin-when">
          <label class="admin-field">
            <span class="muted small">Custom interval (mi)</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder={tmpl?.mechanicConsensusInterval?.miles?.toString() ?? ''}
              value={customMiles}
              onInput={(e) => setCustomMiles((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="admin-field">
            <span class="muted small">Custom interval (mo)</span>
            <input
              type="number"
              inputMode="numeric"
              placeholder={tmpl?.mechanicConsensusInterval?.months?.toString() ?? ''}
              value={customMonths}
              onInput={(e) => setCustomMonths((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        {(rule.customIntervalMiles != null || rule.customIntervalMonths != null) && (
          <button class="btn-link" onClick={clearCustomInterval}>
            Clear custom interval (use consensus/factory)
          </button>
        )}

        <label class="admin-field">
          <span class="muted small">Status override</span>
          <select
            value={kind}
            onChange={(e) => setKind((e.target as HTMLSelectElement).value as OverrideKind | '')}
          >
            <option value="">— none —</option>
            {OVERRIDE_KINDS.map((k) => (
              <option key={k} value={k}>
                {OVERRIDE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        {kind === 'already-replaced' && (
          <div class="admin-when">
            <label class="admin-field">
              <span class="muted small">At date</span>
              <input
                type="date"
                value={atDate}
                onInput={(e) => setAtDate((e.target as HTMLInputElement).value)}
              />
            </label>
            <label class="admin-field">
              <span class="muted small">At miles</span>
              <input
                type="number"
                inputMode="numeric"
                value={atMiles}
                onInput={(e) => setAtMiles((e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
        )}

        <label class="admin-field">
          <span class="muted small">Note</span>
          <input
            type="text"
            placeholder="e.g. dealer did this at last service"
            value={note}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
          />
        </label>

        {error && (
          <p class="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <button class="btn" onClick={save}>
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  )
}
