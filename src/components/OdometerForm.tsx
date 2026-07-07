import { useState } from 'preact/hooks'
import { recordOdometerReading, updateOdometerReading } from '../db/events'
import type { OdometerReading } from '../types'

interface Props {
  vehicleId: string
  existing?: OdometerReading
  onDone: () => void
  onCancel: () => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function OdometerForm({ vehicleId, existing, onDone, onCancel }: Props) {
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [miles, setMiles] = useState(existing?.miles?.toString() ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: Event) {
    e.preventDefault()
    if (saving) return
    if (!miles.trim() || Number(miles) < 0) {
      setError('Enter the current odometer reading in miles.')
      return
    }
    setError('')
    setSaving(true)
    if (existing) {
      await updateOdometerReading(existing.id, { date, miles: Number(miles) })
    } else {
      await recordOdometerReading(vehicleId, Number(miles), date)
    }
    setSaving(false)
    onDone()
  }

  return (
    <form class="card event-form" onSubmit={submit}>
      <h3 class="card-title">{existing ? 'Edit' : 'Log'} odometer reading</h3>
      <div class="admin-when">
        <label class="admin-field">
          <span class="muted small">Date</span>
          <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
        </label>
        <label class="admin-field">
          <span class="muted small">Miles</span>
          <input
            type="number"
            inputMode="numeric"
            value={miles}
            onInput={(e) => setMiles((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      {error && <p class="notice notice-error" role="alert">{error}</p>}
      <div class="form-actions">
        <button class="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Log reading'}
        </button>
        <button class="btn-link" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
