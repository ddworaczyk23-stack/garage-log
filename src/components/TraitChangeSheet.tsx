import { useMemo, useState } from 'preact/hooks'
import { Sheet } from './ui'
import { TraitPickers } from './TraitPickers'
import { changeVehicleTraits } from '../db/traitChange'
import { answersFromRules, diffSchedules, sameAnswers, traitSummary } from '../domain/traitChange'
import type { TraitAnswers } from '../domain/scheduleReview'
import { CATEGORY_LABELS, type MaintenanceCategory, type ReminderRule } from '../types'

const DRIVE_FROM_LABEL: Record<string, TraitAnswers['drive']> = { FWD: 'fwd', RWD: 'rwd', AWD: 'awd', '4WD': '4wd' }

// "Change maintenance type" on the car page: the same trait pickers as "Add a
// car", plus a live preview of what the schedule change does before saving.
export function TraitChangeSheet({ vehicleId, eyebrow, rules, onClose, onSaved }: {
  vehicleId: string
  eyebrow: string
  rules: ReminderRule[]
  onClose: () => void
  onSaved: () => void
}) {
  const initial = useMemo(() => answersFromRules(rules), [])
  const [answers, setAnswers] = useState<TraitAnswers>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const diff = useMemo(() => diffSchedules(rules, answers), [rules, answers])
  const dirty = !sameAnswers(initial, answers)

  const labelOf = (category: MaintenanceCategory) =>
    rules.find((rule) => rule.category === category)?.label ?? CATEGORY_LABELS[category]
  const added = diff.added.filter((category) => !diff.unsure.includes(category))
  const offAsUnsure = diff.unsure.filter((category) => diff.added.includes(category) || !initialUnsure(rules).includes(category))

  async function save(e: Event) {
    e.preventDefault()
    if (saving || !dirty) return
    setSaving(true)
    setError('')
    try {
      await changeVehicleTraits(vehicleId, answers)
      onSaved()
    } catch (err) {
      console.error('[TraitChangeSheet]', err)
      setError('Something went wrong updating the schedule. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Sheet eyebrow={eyebrow} title="Maintenance type" onClose={onClose}>
      <form class="admin-form trait-change" onSubmit={save}>
        <p class="muted small trait-change-lead">
          The schedule is built from these answers. Change one and you see what happens before you save.
        </p>
        <TraitPickers
          power={answers.power}
          trans={answers.trans}
          belt={answers.belt}
          drivetrain={answers.drive === 'none' ? '' : answers.drive.toUpperCase()}
          onPower={(power) => setAnswers({ ...answers, power })}
          onTrans={(trans) => setAnswers({ ...answers, trans })}
          onBelt={(belt) => setAnswers({ ...answers, belt })}
          onDrive={(value) => setAnswers({ ...answers, drive: DRIVE_FROM_LABEL[value] ?? 'none' })}
        />

        <section class="trait-diff" aria-live="polite">
          <p class="trait-diff-title">{dirty ? traitSummary(answers) : 'Same schedule'}</p>
          {dirty && (
            <>
              <DiffList tone="add" title="Added" items={added.map(labelOf)} />
              <DiffList tone="add" title="Switched on" items={diff.turnedOn.map(labelOf)} />
              <DiffList tone="off" title="Switched off (not sure)" items={offAsUnsure.map(labelOf)} />
              <DiffList tone="remove" title="Removed" items={diff.removed.map((rule) => rule.label)} note="Your logged service stays in history." />
              <p class="trait-diff-kept">{diff.kept.length} items kept. Your settings and history on them stay.</p>
            </>
          )}
        </section>

        {error && <p class="notice notice-error" role="alert">{error}</p>}
        <div class="form-actions">
          <button class="btn" type="submit" disabled={saving || !dirty}>
            {saving ? 'Updating…' : 'Update schedule'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function initialUnsure(rules: ReminderRule[]): MaintenanceCategory[] {
  return diffSchedules(rules, answersFromRules(rules)).unsure
}

function DiffList({ tone, title, items, note }: { tone: 'add' | 'off' | 'remove'; title: string; items: string[]; note?: string }) {
  if (!items.length) return null
  return (
    <div class={`trait-diff-group is-${tone}`}>
      <p class="trait-diff-label">{title}</p>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {note && <p class="trait-diff-note">{note}</p>}
    </div>
  )
}
