import { useState } from 'preact/hooks'
import { addVehicle } from '../db/vehicleOnboarding'
import { decodeVin } from '../services/vinDecode'
import { canonicalVehicleId } from '../domain/vehicleIdentity'
import { Reveal } from '../components/motion/Reveal'
import type { VehicleIdentity } from '../types'

type Mode = 'vin' | 'manual'

// "Add Car" (route #/add-vehicle, linked from Vehicles). VIN decode (real
// NHTSA lookup) or manual entry resolve a VehicleIdentity, then addVehicle()
// creates the record (deduped) and its generic maintenance schedule.
export function AddVehicle() {
  const [mode, setMode] = useState<Mode>('vin')

  const [vin, setVin] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState('')
  const [decoded, setDecoded] = useState<VehicleIdentity | null>(null)

  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [trim, setTrim] = useState('')

  const [engine, setEngine] = useState('')
  const [drivetrain, setDrivetrain] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [duplicate, setDuplicate] = useState<{ id: string; label: string } | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setDecoded(null)
    setDecodeError('')
    setSubmitError('')
  }

  async function runDecode(e: Event) {
    e.preventDefault()
    setDecoding(true)
    setDecodeError('')
    setDecoded(null)
    try {
      const result = await decodeVin(vin)
      if (!result.ok) {
        setDecodeError(result.error)
        return
      }
      setDecoded(result.identity)
      setEngine(result.suggestedEngine ?? '')
      setDrivetrain(result.suggestedDrivetrain ?? '')
    } finally {
      setDecoding(false)
    }
  }

  // Year, make, and model are the only true requirements — trim (and engine/
  // drivetrain below) are optional metadata a non-car-person often doesn't
  // know. canonicalVehicleId normalizes an empty trim deterministically, and
  // the vehicle name falls back to the model, so nothing downstream needs them.
  function manualIdentity(): VehicleIdentity | null {
    const y = Number(year)
    if (!y || !make.trim() || !model.trim()) return null
    return {
      year: y,
      make: make.trim(),
      model: model.trim(),
      trim: trim.trim(),
      canonicalVehicleId: canonicalVehicleId({ year: y, make, model, trim }),
    }
  }

  const identity = mode === 'vin' ? decoded : manualIdentity()

  async function submit(e: Event) {
    e.preventDefault()
    if (submitting) return
    if (!identity) {
      setSubmitError('Enter the year, make, and model — the rest is optional.')
      return
    }
    setSubmitError('')
    setDuplicate(null)
    setSubmitting(true)
    try {
      const { vehicle, created } = await addVehicle({
        identity,
        engine: engine.trim(),
        drivetrain: drivetrain.trim(),
      })
      if (created) {
        window.location.hash = `#/vehicle/${vehicle.id}`
      } else {
        setDuplicate({ id: vehicle.id, label: `${vehicle.year} ${vehicle.make} ${vehicle.model}` })
      }
    } catch (err) {
      console.error('[AddVehicle]', err)
      setSubmitError('Something went wrong adding this vehicle. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section class="page">
      <a class="back-link" href="#/vehicles">
        ‹ Vehicles
      </a>
      <h2 class="page-title">Add a car</h2>
      <p class="muted small">
        Enter a VIN to decode its identity, or fill in the details manually.
      </p>

      <div class="seg" role="group" aria-label="Add car mode">
        <button
          type="button"
          class={`seg-btn${mode === 'vin' ? ' is-active' : ''}`}
          onClick={() => switchMode('vin')}
        >
          By VIN
        </button>
        <button
          type="button"
          class={`seg-btn${mode === 'manual' ? ' is-active' : ''}`}
          onClick={() => switchMode('manual')}
        >
          Manual entry
        </button>
      </div>

      {mode === 'vin' && (
        <form class="card admin-form" onSubmit={runDecode}>
          <label class="admin-field">
            <span class="muted small">VIN</span>
            <input
              type="text"
              value={vin}
              maxLength={17}
              onInput={(e) => setVin((e.target as HTMLInputElement).value.toUpperCase())}
              placeholder="17-character VIN"
            />
          </label>
          {decodeError && (
            <p class="notice notice-error" role="alert">
              {decodeError}
            </p>
          )}
          <div class="form-actions">
            <button class="btn" type="submit" disabled={decoding || vin.trim().length !== 17}>
              {decoding ? 'Decoding…' : 'Decode VIN'}
            </button>
          </div>
        </form>
      )}

      {mode === 'manual' && (
        <form class="card admin-form" onSubmit={submit}>
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
            <input type="text" value={make} placeholder="e.g. Toyota" onInput={(e) => setMake((e.target as HTMLInputElement).value)} />
          </label>
          <label class="admin-field">
            <span class="muted small">Model</span>
            <input type="text" value={model} placeholder="e.g. Camry" onInput={(e) => setModel((e.target as HTMLInputElement).value)} />
          </label>
          <label class="admin-field">
            <span class="muted small">Trim — optional</span>
            <input
              type="text"
              value={trim}
              placeholder="Not sure? Leave it blank"
              onInput={(e) => setTrim((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="admin-field">
            <span class="muted small">Engine — optional</span>
            <input type="text" value={engine} onInput={(e) => setEngine((e.target as HTMLInputElement).value)} />
          </label>
          <label class="admin-field">
            <span class="muted small">Drivetrain — optional</span>
            <input
              type="text"
              value={drivetrain}
              placeholder="e.g. FWD, AWD"
              onInput={(e) => setDrivetrain((e.target as HTMLInputElement).value)}
            />
          </label>
          {submitError && (
            <p class="notice notice-error" role="alert">
              {submitError}
            </p>
          )}
          {duplicate && (
            <p class="notice" role="status">
              {duplicate.label} is already in your garage — no duplicate was created.{' '}
              <a href={`#/vehicle/${duplicate.id}`}>View it →</a>
            </p>
          )}
          <div class="form-actions">
            <button class="btn" type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add car'}
            </button>
          </div>
        </form>
      )}

      {mode === 'vin' && identity && (
        <Reveal>
        <form class="card admin-form" onSubmit={submit}>
          <p class="muted small">
            {identity.year} {identity.make} {identity.model} {identity.trim}
            {identity.vin ? ` · VIN ${identity.vin}` : ''}
          </p>
          <label class="admin-field">
            <span class="muted small">Engine — optional</span>
            <input type="text" value={engine} onInput={(e) => setEngine((e.target as HTMLInputElement).value)} />
          </label>
          <label class="admin-field">
            <span class="muted small">Drivetrain — optional</span>
            <input
              type="text"
              value={drivetrain}
              onInput={(e) => setDrivetrain((e.target as HTMLInputElement).value)}
            />
          </label>
          {submitError && (
            <p class="notice notice-error" role="alert">
              {submitError}
            </p>
          )}
          {duplicate && (
            <p class="notice" role="status">
              {duplicate.label} is already in your garage — no duplicate was created.{' '}
              <a href={`#/vehicle/${duplicate.id}`}>View it →</a>
            </p>
          )}
          <div class="form-actions">
            <button class="btn" type="submit" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add car'}
            </button>
          </div>
        </form>
        </Reveal>
      )}
    </section>
  )
}
