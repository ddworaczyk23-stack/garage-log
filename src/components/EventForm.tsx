import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { recordCompletedEvent, updateEvent, type RuleOverrideInput } from '../db/events'
import { localDateISO, parseNumberInput } from '../domain/format'
import { parseQuickEntry } from '../domain/quickEntry'
import {
  CATEGORY_LABELS,
  MAINTENANCE_CATEGORIES,
  OVERRIDE_LABELS,
  PERFORMED_BY_LABELS,
  type MaintenanceCategory,
  type MaintenanceEvent,
  type OverrideKind,
  type PerformedBy,
} from '../types'

const OVERRIDE_KINDS = Object.keys(OVERRIDE_LABELS) as OverrideKind[]
const PERFORMED_BY_KINDS = Object.keys(PERFORMED_BY_LABELS) as PerformedBy[]

interface Props {
  vehicleId: string
  kind: 'maintenance' | 'repair'
  /** Present when editing; omitted when adding. */
  existing?: MaintenanceEvent
  /** Pre-selects the category when adding (e.g. "Log" from a schedule row). */
  initialCategory?: MaintenanceCategory
  /** Prefills odometer with the vehicle's current mileage estimate on a fresh add. */
  defaultOdometer?: number
  existingDocs?: { id: string; filename: string }[]
  onDone: () => void
  onCancel: () => void
}

const todayISO = () => localDateISO(new Date())

// One form, two modes (maintenance/repair) via `kind`, and two flows (add/edit)
// via `existing`. Kept as a single component since the persistence path,
// attachment handling, and layout are identical — only the field subset and
// the submit label change.
export function EventForm({
  vehicleId,
  kind,
  existing,
  initialCategory,
  defaultOdometer,
  existingDocs = [],
  onDone,
  onCancel,
}: Props) {
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [odometerMiles, setOdometerMiles] = useState(
    existing?.odometerMiles?.toString() ?? (defaultOdometer != null ? String(defaultOdometer) : ''),
  )
  const [quickEntryText, setQuickEntryText] = useState('')
  const [quickEntryHint, setQuickEntryHint] = useState('')
  const [category, setCategory] = useState<MaintenanceCategory>(
    existing?.category ?? initialCategory ?? (kind === 'maintenance' ? 'oil-change' : 'other'),
  )
  // "Also performed": extra categories this one visit covered (multi-point
  // inspection, battery check, fluid top-off…). Collapsed unless editing an
  // entry that already has some, so single-category logging stays fast.
  const [additionalCategories, setAdditionalCategories] = useState<MaintenanceCategory[]>(
    existing?.additionalCategories ?? [],
  )
  const [showAlso, setShowAlso] = useState((existing?.additionalCategories?.length ?? 0) > 0)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [cost, setCost] = useState(existing?.cost?.toString() ?? '')
  const [vendor, setVendor] = useState(existing?.vendor ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')

  // Maintenance-only fields.
  const [servicePerformed, setServicePerformed] = useState(existing?.servicePerformed ?? '')
  const [parts, setParts] = useState(existing?.parts ?? '')
  const [fluids, setFluids] = useState(existing?.fluids ?? '')
  const [performedBy, setPerformedBy] = useState<PerformedBy | ''>(existing?.performedBy ?? '')

  // Repair-only fields.
  const [symptom, setSymptom] = useState(existing?.symptom ?? '')
  const [diagnosis, setDiagnosis] = useState(existing?.diagnosis ?? '')
  const [fix, setFix] = useState(existing?.fix ?? '')
  const [labor, setLabor] = useState(existing?.labor ?? '')

  // Maintenance-only: optional rule override, collapsed by default.
  const [showOverride, setShowOverride] = useState(false)
  const [overrideKind, setOverrideKind] = useState<OverrideKind | ''>('')
  const [overrideNote, setOverrideNote] = useState('')
  const [customMiles, setCustomMiles] = useState('')
  const [customMonths, setCustomMonths] = useState('')

  // Secondary fields (label/parts/fluids/vendor/notes/etc.) are collapsed by
  // default on a fresh add — a routine oil change only needs date/odometer/
  // category/cost/attach to log fast. Editing an existing entry starts
  // expanded so none of its already-filled detail is hidden from view.
  const [showMore, setShowMore] = useState(!!existing)

  const [newFiles, setNewFiles] = useState<File[]>([])
  const [removedDocIds, setRemovedDocIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const remainingDocs = existingDocs.filter((d) => !removedDocIds.includes(d.id))

  function handleQuickFill() {
    const result = parseQuickEntry(quickEntryText)
    let expandMore = false

    if (result.category) {
      setCategory(result.category)
      setAdditionalCategories(result.additionalCategories)
      if (result.additionalCategories.length > 0) setShowAlso(true)
    }
    if (result.cost != null && !cost.trim()) {
      setCost(String(result.cost))
    }
    if (result.vendor && !vendor.trim()) {
      setVendor(result.vendor)
      expandMore = true
    }
    if (!title.trim() && quickEntryText.trim()) {
      setTitle(quickEntryText.trim())
      expandMore = true
    }
    if (expandMore) setShowMore(true)
    setQuickEntryHint(result.hadMatch ? '' : 'Couldn’t detect a category — pick one below.')
  }

  async function submit(e: Event) {
    e.preventDefault()
    if (saving) return
    const parsedOdometerMiles = parseNumberInput(odometerMiles)
    if (parsedOdometerMiles == null || parsedOdometerMiles < 0) {
      setError('Enter the odometer reading (miles) for this entry.')
      return
    }
    if (customMiles.trim() && parseNumberInput(customMiles) == null) {
      setError('Custom interval (mi) must be a number.')
      return
    }
    if (customMonths.trim() && parseNumberInput(customMonths) == null) {
      setError('Custom interval (mo) must be a number.')
      return
    }
    setError('')
    setSaving(true)

    const base = {
      vehicleId,
      kind,
      date,
      odometerMiles: parsedOdometerMiles,
      category,
      additionalCategories: additionalCategories.filter((c) => c !== category),
      title: title.trim() || (kind === 'maintenance' ? CATEGORY_LABELS[category] : symptom || 'Repair'),
      cost: cost.trim() ? (parseNumberInput(cost) ?? 0) : 0,
      vendor: vendor.trim() || undefined,
      notes: notes.trim() || undefined,
      servicePerformed: kind === 'maintenance' ? servicePerformed.trim() || undefined : undefined,
      parts: parts.trim() || undefined,
      fluids: kind === 'maintenance' ? fluids.trim() || undefined : undefined,
      performedBy: kind === 'maintenance' && performedBy ? performedBy : undefined,
      symptom: kind === 'repair' ? symptom.trim() || undefined : undefined,
      diagnosis: kind === 'repair' ? diagnosis.trim() || undefined : undefined,
      fix: kind === 'repair' ? fix.trim() || undefined : undefined,
      labor: kind === 'repair' ? labor.trim() || undefined : undefined,
    }

    const ruleOverride: RuleOverrideInput | undefined =
      kind === 'maintenance' && showOverride && (overrideKind || customMiles || customMonths)
        ? {
            overrideKind: overrideKind || null,
            overrideNote: overrideNote.trim() || null,
            customIntervalMiles: parseNumberInput(customMiles),
            customIntervalMonths: parseNumberInput(customMonths),
          }
        : undefined

    try {
      if (existing) {
        await updateEvent(existing.id, base, newFiles, removedDocIds, ruleOverride)
      } else {
        await recordCompletedEvent(base, newFiles, ruleOverride)
      }
      onDone()
    } catch (err) {
      console.error('[EventForm]', err)
      setError('Something went wrong saving this entry. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form class="card event-form" onSubmit={submit}>
      <h3 class="card-title">
        {existing ? 'Edit' : 'Log'} {kind === 'maintenance' ? 'service' : 'repair'}
      </h3>

      <div class="admin-field quick-entry">
        <span class="muted small">Quick fill (optional)</span>
        <div class="quick-entry-row">
          <input
            type="text"
            placeholder="e.g. Oil change at Jiffy Lube, $45.99"
            value={quickEntryText}
            onInput={(e) => setQuickEntryText((e.target as HTMLInputElement).value)}
          />
          <button type="button" class="btn-link" onClick={handleQuickFill}>
            Fill in ↓
          </button>
        </div>
        {quickEntryHint && <p class="muted small quick-entry-hint">{quickEntryHint}</p>}
      </div>

      <div class="admin-when">
        <label class="admin-field">
          <span class="muted small">Date</span>
          <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </label>
        <label class="admin-field">
          <span class="muted small">Odometer (mi)</span>
          <input
            type="number"
            inputMode="numeric"
            value={odometerMiles}
            onInput={(e) => setOdometerMiles((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <label class="admin-field">
        <span class="muted small">Category</span>
        <select
          value={category}
          onChange={(e) => setCategory((e.target as HTMLSelectElement).value as MaintenanceCategory)}
        >
          {MAINTENANCE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>

      <div class="also-section">
        <button type="button" class="btn-link" onClick={() => setShowAlso((s) => !s)}>
          {showAlso ? '▾' : '▸'} Also performed{' '}
          {additionalCategories.filter((c) => c !== category).length > 0
            ? `(${additionalCategories.filter((c) => c !== category).length})`
            : '(optional)'}
        </button>
        {showAlso && (
          <>
            <p class="muted small" style="margin:2px 0 6px">
              Tag anything else done in this same visit — each also updates its own reminder.
            </p>
            <div class="also-chips">
              {MAINTENANCE_CATEGORIES.filter((c) => c !== 'other' && c !== category).map((c) => {
                const on = additionalCategories.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    class={`also-chip${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() =>
                      setAdditionalCategories((prev) =>
                        prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                      )
                    }
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {kind === 'repair' && (
        <label class="admin-field">
          <span class="muted small">Symptom</span>
          <input
            type="text"
            value={symptom}
            onInput={(e) => setSymptom((e.target as HTMLInputElement).value)}
          />
        </label>
      )}

      <label class="admin-field">
        <span class="muted small">Cost ($)</span>
        <input
          type="number"
          inputMode="decimal"
          value={cost}
          onInput={(e) => setCost((e.target as HTMLInputElement).value)}
        />
      </label>

      <div class="override-section">
        <button type="button" class="btn-link" onClick={() => setShowMore((s) => !s)}>
          {showMore ? '▾' : '▸'} More details (label, vendor, parts, notes…)
        </button>
        {showMore && (
          <div class="admin-form">
            <label class="admin-field">
              <span class="muted small">Label (optional, shown in history)</span>
              <input
                type="text"
                placeholder={kind === 'maintenance' ? CATEGORY_LABELS[category] : symptom || 'Repair'}
                value={title}
                onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
              />
            </label>

            {kind === 'maintenance' ? (
              <>
                <label class="admin-field">
                  <span class="muted small">Service performed</span>
                  <input
                    type="text"
                    placeholder={CATEGORY_LABELS[category]}
                    value={servicePerformed}
                    onInput={(e) => setServicePerformed((e.target as HTMLInputElement).value)}
                  />
                </label>
                <div class="admin-when">
                  <label class="admin-field">
                    <span class="muted small">Parts</span>
                    <input
                      type="text"
                      value={parts}
                      onInput={(e) => setParts((e.target as HTMLInputElement).value)}
                    />
                  </label>
                  <label class="admin-field">
                    <span class="muted small">Fluids</span>
                    <input
                      type="text"
                      value={fluids}
                      onInput={(e) => setFluids((e.target as HTMLInputElement).value)}
                    />
                  </label>
                </div>
                <label class="admin-field">
                  <span class="muted small">Performed by</span>
                  <select
                    value={performedBy}
                    onChange={(e) => setPerformedBy((e.target as HTMLSelectElement).value as PerformedBy)}
                  >
                    <option value="">— not set —</option>
                    {PERFORMED_BY_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PERFORMED_BY_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label class="admin-field">
                  <span class="muted small">Diagnosis</span>
                  <input
                    type="text"
                    value={diagnosis}
                    onInput={(e) => setDiagnosis((e.target as HTMLInputElement).value)}
                  />
                </label>
                <label class="admin-field">
                  <span class="muted small">Fix</span>
                  <input type="text" value={fix} onInput={(e) => setFix((e.target as HTMLInputElement).value)} />
                </label>
                <div class="admin-when">
                  <label class="admin-field">
                    <span class="muted small">Parts</span>
                    <input
                      type="text"
                      value={parts}
                      onInput={(e) => setParts((e.target as HTMLInputElement).value)}
                    />
                  </label>
                  <label class="admin-field">
                    <span class="muted small">Labor</span>
                    <input
                      type="text"
                      value={labor}
                      onInput={(e) => setLabor((e.target as HTMLInputElement).value)}
                    />
                  </label>
                </div>
              </>
            )}

            <label class="admin-field">
              <span class="muted small">Vendor / shop</span>
              <input
                type="text"
                value={vendor}
                onInput={(e) => setVendor((e.target as HTMLInputElement).value)}
              />
            </label>

            <label class="admin-field">
              <span class="muted small">Notes</span>
              <input type="text" value={notes} onInput={(e) => setNotes((e.target as HTMLInputElement).value)} />
            </label>
          </div>
        )}
      </div>

      <label class="admin-field">
        <span class="muted small">Attach photos / receipts / PDFs</span>
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={(e) => setNewFiles(Array.from((e.target as HTMLInputElement).files ?? []))}
        />
      </label>
      {remainingDocs.length > 0 && (
        <ul class="doc-remove-list">
          {remainingDocs.map((d) => (
            <li key={d.id}>
              <span class="muted small">📎 {d.filename}</span>
              <button
                type="button"
                class="btn-link"
                onClick={() => setRemovedDocIds((ids) => [...ids, d.id])}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {kind === 'maintenance' && (
        <div class="override-section">
          <button type="button" class="btn-link" onClick={() => setShowOverride((s) => !s)}>
            {showOverride ? '▾' : '▸'} Next-due override (optional)
          </button>
          {showOverride && (
            <div class="admin-form">
              <label class="admin-field">
                <span class="muted small">Status override</span>
                <select
                  value={overrideKind}
                  onChange={(e) => setOverrideKind((e.target as HTMLSelectElement).value as OverrideKind | '')}
                >
                  <option value="">— none —</option>
                  {OVERRIDE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {OVERRIDE_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <div class="admin-when">
                <label class="admin-field">
                  <span class="muted small">Custom interval (mi)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customMiles}
                    onInput={(e) => setCustomMiles((e.target as HTMLInputElement).value)}
                  />
                </label>
                <label class="admin-field">
                  <span class="muted small">Custom interval (mo)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={customMonths}
                    onInput={(e) => setCustomMonths((e.target as HTMLInputElement).value)}
                  />
                </label>
              </div>
              <label class="admin-field">
                <span class="muted small">Override note</span>
                <input
                  type="text"
                  value={overrideNote}
                  onInput={(e) => setOverrideNote((e.target as HTMLInputElement).value)}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {error && <p class="notice notice-error" role="alert">{error}</p>}
      <div class="form-actions">
        <button class="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Log entry'}
        </button>
        <button class="btn-link" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export async function loadEventDocs(event: MaintenanceEvent) {
  if (!event.documentIds.length) return []
  const docs = await db.documents.bulkGet(event.documentIds)
  return docs.filter((d): d is NonNullable<typeof d> => !!d).map((d) => ({ id: d.id, filename: d.filename }))
}
