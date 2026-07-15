import { useState } from 'preact/hooks'
import { setVehicleSpecs } from '../db/vehicles'
import { parseNumberInput } from '../domain/format'
import type { Vehicle } from '../types'

// Inline editor for a vehicle's specifications (year/make/model/trim/engine/
// drivetrain/VIN), opened from the Specifications card on VehicleDetail. Writes
// via setVehicleSpecs; the vehicle liveQuery re-renders the header, masthead,
// and spec table reactively. Nickname has its own editor and isn't touched here.
export function VehicleSpecsEditor({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const [year, setYear] = useState(String(vehicle.year))
  const [make, setMake] = useState(vehicle.make)
  const [model, setModel] = useState(vehicle.model)
  const [trim, setTrim] = useState(vehicle.trim)
  const [engine, setEngine] = useState(vehicle.engine)
  const [drivetrain, setDrivetrain] = useState(vehicle.drivetrain)
  const [vin, setVin] = useState(vehicle.vin ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(e: Event) {
    e.preventDefault()
    if (saving) return
    const parsedYear = parseNumberInput(year)
    if (parsedYear == null || parsedYear < 1900 || parsedYear > 2100) {
      setError('Enter a valid year (1900–2100).')
      return
    }
    if (!make.trim() || !model.trim()) {
      setError('Make and model are required.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await setVehicleSpecs(vehicle.id, {
        year: parsedYear,
        make,
        model,
        trim,
        engine,
        drivetrain,
        vin,
      })
      onDone()
    } catch (err) {
      console.error('[VehicleSpecsEditor]', err)
      setError('Something went wrong saving these specs. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form class="card admin-form" onSubmit={save}>
      <h3 class="card-title">Edit specifications</h3>
      <div class="admin-when">
        <label class="admin-field">
          <span class="muted small">Year</span>
          <input
            type="number"
            inputMode="numeric"
            value={year}
            onInput={(e) => setYear((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="admin-field">
          <span class="muted small">Make</span>
          <input type="text" value={make} onInput={(e) => setMake((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="admin-when">
        <label class="admin-field">
          <span class="muted small">Model</span>
          <input type="text" value={model} onInput={(e) => setModel((e.target as HTMLInputElement).value)} />
        </label>
        <label class="admin-field">
          <span class="muted small">Trim</span>
          <input type="text" value={trim} onInput={(e) => setTrim((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="admin-when">
        <label class="admin-field">
          <span class="muted small">Engine</span>
          <input
            type="text"
            value={engine}
            onInput={(e) => setEngine((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="admin-field">
          <span class="muted small">Drivetrain</span>
          <input
            type="text"
            value={drivetrain}
            onInput={(e) => setDrivetrain((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>
      <label class="admin-field">
        <span class="muted small">VIN (optional)</span>
        <input type="text" value={vin} onInput={(e) => setVin((e.target as HTMLInputElement).value)} />
      </label>

      {error && <p class="notice notice-error" role="alert">{error}</p>}
      <div class="form-actions">
        <button class="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save specs'}
        </button>
        <button class="btn-link" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
