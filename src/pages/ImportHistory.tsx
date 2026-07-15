import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { importServiceRecords, type ImportableRecord } from '../db/importHistory'
import {
  baselineCategories,
  isImportable,
  parseHistoryText,
  type ParsedServiceRow,
} from '../domain/importHistory'
import { formatMiles, formatShortDate } from '../domain/format'
import { vehicleLabel } from '../domain/vehicle'
import { Loading } from '../components/ui'
import { Reveal } from '../components/motion/Reveal'
import { Collapsible } from '../components/motion/Collapsible'
import {
  CATEGORY_LABELS,
  MAINTENANCE_CATEGORIES,
  type MaintenanceCategory,
} from '../types'

interface Props {
  vehicleId: string
}

interface ReviewRow extends ParsedServiceRow {
  included: boolean
}

// Import past service history (route #/import/<vehicleId>). Paste text (e.g. a
// Carfax Car Care service history), auto-map each line to a maintenance
// category, review/adjust in a table, then create the events — which establish
// the reminder baselines through the normal logging path. Nothing is written
// until "Import" is pressed.
export function ImportHistory({ vehicleId }: Props) {
  const vehicle = useQuery(async () => (await db.vehicles.get(vehicleId)) ?? null, [vehicleId])
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState<{ count: number; rows: number; categories: string[] } | null>(null)

  if (vehicle === undefined) return <Loading />
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

  function parse() {
    const parsed = parseHistoryText(text).map((r) => ({ ...r, included: isImportable(r) }))
    setRows(parsed)
    setDone(null)
  }

  function updateRow(i: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev && prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const included = (rows ?? []).filter(
    (r) => r.included && r.date && r.miles != null && r.category,
  )

  async function runImport() {
    if (!included.length || importing) return
    setImporting(true)
    const records: ImportableRecord[] = included.map((r) => ({
      date: r.date!,
      miles: r.miles!,
      category: r.category!,
      service: r.service,
    }))
    const count = await importServiceRecords(vehicleId, records)
    setImporting(false)
    setDone({ count, rows: records.length, categories: baselineCategories(included) })
    setRows(null)
    setText('')
  }

  return (
    <section class="page">
      <a class="back-link" href={`#/vehicle/${vehicleId}`}>
        ‹ {vehicleLabel(vehicle)}
      </a>
      <h2 class="page-title">Import service history</h2>
      <p class="muted">
        Have your past services on Carfax? Paste them in and each becomes a logged
        service for {vehicleLabel(vehicle)} that sets its maintenance baseline.
      </p>

      {!done && (
        <section class="card">
          <Collapsible title="How to get your history from Carfax">
            <p class="muted small">
              Paste the whole thing — registration, title, and inspection lines are
              ignored automatically, and you review everything before it's saved.
            </p>

            <h3 class="guide-h">On a computer (easiest)</h3>
            <ol class="guide-steps">
              <li>
                Sign in at <code>carfax.com</code> and open{' '}
                <strong>My Garage → your vehicle → Service History</strong>.
              </li>
              <li>
                Select the whole list — drag from the first record to the last, or press{' '}
                <strong>Ctrl/⌘ + A</strong> — and copy it (<strong>Ctrl/⌘ + C</strong>).
              </li>
              <li>
                Come back here, paste into the box below, and press <strong>Preview</strong>.
              </li>
            </ol>

            <h3 class="guide-h">On your phone</h3>
            <ol class="guide-steps">
              <li>
                Open the <strong>Carfax Car Care</strong> app (or <code>carfax.com</code> in
                your browser) → your vehicle → <strong>Service History</strong>.
              </li>
              <li>
                Press and hold a record, choose <strong>Select All</strong>, then{' '}
                <strong>Copy</strong>.
              </li>
              <li>
                Open Garage Log, tap the box below, <strong>Paste</strong>, then{' '}
                <strong>Preview</strong>.
              </li>
            </ol>

            <p class="muted small">
              Fewer taps: import on a computer, then use <strong>Backup → Export</strong>{' '}
              there and <strong>Restore</strong> on your phone to copy everything over.
            </p>
          </Collapsible>
        </section>
      )}

      {done ? (
        <Reveal>
          <section class="card">
            <p class="notice notice-success" role="status">
              Imported {done.count} visit{done.count === 1 ? '' : 's'}
              {done.rows > done.count ? ` from ${done.rows} service records` : ''}.
            </p>
            {done.rows > done.count && (
              <p class="muted small">
                Services done on the same day at the same mileage were combined into a single
                entry tagged with everything performed.
              </p>
            )}
            {done.categories.length > 0 && (
              <p class="muted small">Baselines set for: {done.categories.join(', ')}.</p>
            )}
            <div class="form-actions">
              <a class="btn" href={`#/vehicle/${vehicleId}`}>
                Back to {vehicleLabel(vehicle)}
              </a>
              <button class="btn-link" type="button" onClick={() => setDone(null)}>
                Import more
              </button>
            </div>
          </section>
        </Reveal>
      ) : (
        <>
          <section class="card">
            <label class="admin-field">
              <span class="muted small">
                Paste your copied Carfax service history here, or type one service per line as{' '}
                <code>06/23/2026, 95170, Oil and filter changed</code>. Either works.
              </span>
              <textarea
                class="import-textarea"
                rows={8}
                placeholder={'06/23/2026, 95170, Oil and filter changed\n12/02/2025, 90179, Tires rotated\n06/22/2024, 69284, Cabin air filter replaced'}
                value={text}
                onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
              />
            </label>
            <button class="btn" type="button" onClick={parse} disabled={!text.trim()}>
              Preview
            </button>
          </section>

          {rows && (
            <Reveal>
            <section class="card">
              <h3 class="card-title">
                Review ({included.length} of {rows.length} will import)
              </h3>
              {rows.length === 0 ? (
                <p class="muted small">
                  No dated records found. Make sure each line has a date like 06/23/2026.
                </p>
              ) : (
                <>
                  <p class="muted small">
                    Uncheck anything you don't want, or fix a category. Rows without a date,
                    mileage, or category can't be imported. Services from the same day and
                    mileage are combined into one entry tagged with everything performed.
                  </p>
                  <ul class="import-list">
                    {rows.map((r, i) => {
                      const ready = r.date && r.miles != null && r.category
                      return (
                        <li key={i} class={`import-row${ready ? '' : ' is-blocked'}`}>
                          <input
                            type="checkbox"
                            checked={r.included && !!ready}
                            disabled={!ready}
                            aria-label={`Include ${r.service}`}
                            onChange={(e) =>
                              updateRow(i, { included: (e.target as HTMLInputElement).checked })
                            }
                          />
                          <div class="import-row-main">
                            <span class="import-row-service">{r.service}</span>
                            <span class="muted small">
                              {r.date ? formatShortDate(r.date) : 'no date'} ·{' '}
                              {r.miles != null ? formatMiles(r.miles) : 'no mileage'}
                            </span>
                          </div>
                          <select
                            class="import-row-cat"
                            value={r.category ?? ''}
                            onChange={(e) => {
                              const v = (e.target as HTMLSelectElement).value
                              updateRow(i, {
                                category: (v || null) as MaintenanceCategory | null,
                                included: !!v,
                              })
                            }}
                          >
                            <option value="">— skip —</option>
                            {MAINTENANCE_CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {CATEGORY_LABELS[c]}
                              </option>
                            ))}
                          </select>
                        </li>
                      )
                    })}
                  </ul>
                  <button
                    class="btn full"
                    type="button"
                    onClick={runImport}
                    disabled={!included.length || importing}
                  >
                    {importing
                      ? 'Importing…'
                      : `Import ${included.length} service${included.length === 1 ? '' : 's'}`}
                  </button>
                </>
              )}
            </section>
            </Reveal>
          )}
        </>
      )}
    </section>
  )
}
