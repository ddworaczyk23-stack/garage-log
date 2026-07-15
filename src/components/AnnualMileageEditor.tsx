import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { getVehicleAnnualMileage } from '../db/summary'
import { setAnnualMileageOverride } from '../db/vehicles'
import { formatMiles, parseNumberInput } from '../domain/format'
import { Loading } from './ui'

const SOURCE_NOTE: Record<'custom' | 'calculated' | 'default', string> = {
  custom: 'Using your custom average.',
  calculated: 'Calculated from your logged history.',
  default: 'Default estimate — log a couple of odometer readings a few months apart to personalize.',
}

// "Average mileage" control on Vehicle Detail: shows the effective miles/year
// used to project when mileage-based items come due, and lets the user either
// keep the history-calculated average or set their own. Self-contained — reads
// its own query and writes via setAnnualMileageOverride; the schedule's
// projected dates recompute reactively through liveQuery.
export function AnnualMileageEditor({ vehicleId }: { vehicleId: string }) {
  const info = useQuery(() => getVehicleAnnualMileage(vehicleId), [vehicleId])
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!info) return <Loading />

  function startEdit() {
    setValue(info!.override != null ? String(info!.override) : info!.calculated != null ? String(info!.calculated) : '')
    setError('')
    setEditing(true)
  }

  async function save(e: Event) {
    e.preventDefault()
    if (saving) return
    const parsed = parseNumberInput(value)
    if (parsed == null || parsed <= 0) {
      setError('Enter a positive number of miles per year.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await setAnnualMileageOverride(vehicleId, parsed)
      setEditing(false)
    } catch (err) {
      console.error('[AnnualMileageEditor]', err)
      setError('Something went wrong saving that. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function useCalculated() {
    setSaving(true)
    try {
      await setAnnualMileageOverride(vehicleId, null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div class="annual-mileage">
      <div class="annual-mileage-head">
        <span class="kicker">Average mileage</span>
        <span class="annual-mileage-value num">{formatMiles(info.value)}/yr</span>
      </div>

      {editing ? (
        <form class="admin-form" onSubmit={save}>
          <label class="admin-field">
            <span class="muted small">Miles per year</span>
            <input
              type="number"
              inputMode="numeric"
              value={value}
              onInput={(e) => setValue((e.target as HTMLInputElement).value)}
            />
          </label>
          {info.calculated != null && (
            <p class="muted small">Calculated from your history: {formatMiles(info.calculated)}/yr.</p>
          )}
          {error && <p class="notice notice-error" role="alert">{error}</p>}
          <div class="form-actions">
            <button class="btn" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save average'}
            </button>
            {info.override != null && (
              <button class="btn-link" type="button" onClick={useCalculated} disabled={saving}>
                Use calculated
              </button>
            )}
            <button class="btn-link" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p class="muted small">{SOURCE_NOTE[info.source]}</p>
          <button type="button" class="btn-link" onClick={startEdit}>
            {info.override != null ? 'Edit average' : 'Set your own'}
          </button>
        </>
      )}
    </div>
  )
}
