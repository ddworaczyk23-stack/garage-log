import { useEffect, useState } from 'preact/hooks'
import { addVehicle } from '../db/vehicleOnboarding'
import { db } from '../db/db'
import { decodeVin } from '../services/vinDecode'
import { canonicalVehicleId, matchesExistingVehicle } from '../domain/vehicleIdentity'
import { Reveal } from '../components/motion/Reveal'
import { PageHeader } from '../components/ui'
import type { VehicleIdentity } from '../types'
import type { VehicleTraits } from '../db/traitTemplates'
import { traitsKey } from '../db/traitTemplates'
import { ScheduleReview } from '../components/ScheduleReview'
import { resolveTraitAnswers, seedUnsureEdits, type ScheduleEdit } from '../domain/scheduleReview'
import type { MaintenanceCategory } from '../types'

type Mode = 'vin' | 'manual'
const CURRENT_YEAR = new Date().getFullYear()
// Next year's models go on sale in the fall, so the list starts one year ahead.
const VEHICLE_YEARS = Array.from({ length: 42 }, (_, index) => CURRENT_YEAR + 1 - index)
const DRIVETRAINS = ['FWD', 'RWD', 'AWD', '4WD'] as const
const POWER_OPTIONS = [['gas', 'Gas'], ['turbo', 'Turbo gas'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['ev', 'Electric']] as const
const TRANS_OPTIONS = [['auto', 'Automatic'], ['cvt', 'CVT'], ['dct', 'Dual-clutch'], ['manual', 'Manual'], ['none', 'Not sure']] as const
const BELT_OPTIONS = [['yes', 'Yes'], ['no', 'No'], ['not-sure', 'Not sure']] as const

function normalizeDrivetrain(value: string): string {
  const upper = value.toUpperCase()
  if (upper.includes('4WD') || upper.includes('4X4') || upper.includes('4-WHEEL')) return '4WD'
  if (upper.includes('AWD') || upper.includes('ALL-WHEEL')) return 'AWD'
  if (upper.includes('FWD') || upper.includes('FRONT-WHEEL')) return 'FWD'
  if (upper.includes('RWD') || upper.includes('REAR-WHEEL')) return 'RWD'
  return ''
}

// "Add Car" (route #/add-vehicle, linked from Vehicles). VIN decode (real
// NHTSA lookup) or manual entry resolve a VehicleIdentity, then addVehicle()
// creates the record (deduped) and its generic maintenance schedule.
export function AddVehicle() {
  const [step, setStep] = useState<'car' | 'schedule'>('car')
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
  const [power, setPower] = useState<VehicleTraits['power']>('gas')
  const [trans, setTrans] = useState<VehicleTraits['trans']>('none')
  const [belt, setBelt] = useState<'yes' | 'no' | 'not-sure'>('not-sure')
  const [edits, setEdits] = useState<Partial<Record<MaintenanceCategory, ScheduleEdit>>>({})
  const [currentMiles, setCurrentMiles] = useState<number | null>(null)

  // Each step starts at the top. Phones scroll the window; desktop scrolls
  // .app-main (see app.css), so reset both.
  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('.app-main')?.scrollTo(0, 0)
  }, [step])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [duplicate, setDuplicate] = useState<{ id: string; label: string } | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setDecoded(null)
    setDecodeError('')
    setSubmitError('')
    setStep('car')
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
      setDrivetrain(normalizeDrivetrain(result.suggestedDrivetrain ?? ''))
      setPower(result.suggestedTraits?.power ?? 'gas')
      changeTrans(result.suggestedTraits?.trans ?? 'none')
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
  const { traits, unsure } = resolveTraitAnswers({
    power,
    trans,
    drive: drivetrain === 'FWD' ? 'fwd' : drivetrain === 'RWD' ? 'rwd' : drivetrain === 'AWD' ? 'awd' : drivetrain === '4WD' ? '4wd' : 'none',
    belt,
  })

  // A new answer resets that row, so a "Not sure" seed can't outlive it.
  function clearEdit(category: MaintenanceCategory) {
    setEdits(({ [category]: _dropped, ...rest }) => rest)
  }
  function changeTrans(value: VehicleTraits['trans']) {
    if (value !== trans) clearEdit('transmission-fluid')
    setTrans(value)
  }
  function changeBelt(value: 'yes' | 'no' | 'not-sure') {
    if (value !== belt) clearEdit('timing-belt')
    setBelt(value)
  }

  async function beginReview(e: Event) {
    e.preventDefault()
    if (!identity) {
      setSubmitError('Enter the year, make, and model — the rest is optional.')
      return
    }
    setSubmitError('')
    setDuplicate(null)
    const existing = matchesExistingVehicle(identity, await db.vehicles.toArray())
    if (existing) {
      setDuplicate({ id: existing.id, label: `${existing.year} ${existing.make} ${existing.model}` })
      return
    }
    setEdits((prev) => seedUnsureEdits(prev, unsure))
    setStep('schedule')
  }

  async function submit() {
    if (submitting || !identity) return
    setSubmitting(true)
    try {
      const { vehicle, created } = await addVehicle({
        identity,
        engine: engine.trim(),
        drivetrain: drivetrain.trim(),
        traits,
        edits,
        currentMiles,
      })
      if (created) {
        try {
          sessionStorage.setItem('gl_just_added_vehicle', vehicle.id)
        } catch {
          // sessionStorage unavailable (private browsing) — banner just won't show
        }
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

  if (step === 'schedule' && identity) return <ScheduleReview identity={identity} traits={traits} templateKey={traitsKey(traits)} unsure={unsure} edits={edits} currentMiles={currentMiles} onChange={(nextEdits, nextMiles) => { setEdits(nextEdits); setCurrentMiles(nextMiles) }} onBack={() => setStep('car')} onSubmit={submit} submitting={submitting} error={submitError} />

  return (
    <section class="page">
      <a class="back-link" href="#/vehicles">
        ‹ Vehicles
      </a>

      <PageHeader title="Add a car" />

      <div class="seg" role="group" aria-label="Add a car mode">
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
        <Reveal>
        <form class="card admin-form add-vehicle-form" onSubmit={runDecode}>
          <label class="admin-field">
            <span class="muted small">VIN</span>
            <input
              type="text"
              value={vin}
              maxLength={17}
              onInput={(e) => setVin((e.target as HTMLInputElement).value.toUpperCase())}
              placeholder="17-character VIN"
            />
            <span class="field-hint">On the driver-side dashboard or insurance card.</span>
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
        </Reveal>
      )}

      {mode === 'manual' && (
        <Reveal>
        <form class="card admin-form add-vehicle-form" onSubmit={beginReview}>
          <label class="admin-field">
            <span class="muted small">Year</span>
            <select
              value={year}
              onChange={(e) => setYear((e.target as HTMLSelectElement).value)}
            >
              <option value="">Choose year</option>
              {VEHICLE_YEARS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
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
          <ScheduleTraitPickers power={power} trans={trans} belt={belt} drivetrain={drivetrain} onPower={setPower} onTrans={changeTrans} onBelt={changeBelt} onDrive={setDrivetrain} />
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
              Next: review schedule
            </button>
          </div>
        </form>
        </Reveal>
      )}

      {mode === 'vin' && identity && (
        <Reveal>
        <form class="card admin-form add-vehicle-form" onSubmit={beginReview}>
          <p class="muted small">
            {identity.year} {identity.make} {identity.model} {identity.trim}
            {identity.vin ? ` · VIN ${identity.vin}` : ''}
          </p>
          <label class="admin-field">
            <span class="muted small">Engine — optional</span>
            <input type="text" value={engine} onInput={(e) => setEngine((e.target as HTMLInputElement).value)} />
          </label>
          <ScheduleTraitPickers power={power} trans={trans} belt={belt} drivetrain={drivetrain} onPower={setPower} onTrans={changeTrans} onBelt={changeBelt} onDrive={setDrivetrain} />
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
              Next: review schedule
            </button>
          </div>
        </form>
        </Reveal>
      )}
    </section>
  )
}

function ScheduleTraitPickers({ power, trans, belt, drivetrain, onPower, onTrans, onBelt, onDrive }: {
  power: VehicleTraits['power']; trans: VehicleTraits['trans']; belt: 'yes' | 'no' | 'not-sure'; drivetrain: string
  onPower: (value: VehicleTraits['power']) => void; onTrans: (value: VehicleTraits['trans']) => void
  onBelt: (value: 'yes' | 'no' | 'not-sure') => void; onDrive: (value: string) => void
}) {
  return <>
    <ChipPicker legend="Engine type" value={power} options={POWER_OPTIONS} onChange={(value) => onPower(value as VehicleTraits['power'])} />
    {power !== 'hybrid' && power !== 'ev' && <ChipPicker legend="Transmission" value={trans} options={TRANS_OPTIONS} onChange={(value) => onTrans(value as VehicleTraits['trans'])} />}
    {power !== 'ev' && <ChipPicker legend="Timing belt?" value={belt} options={BELT_OPTIONS} onChange={(value) => onBelt(value as 'yes' | 'no' | 'not-sure')} hint="Not sure? Check your manual. Most newer cars have a chain." />}
    <ChipPicker legend="Drivetrain — optional" value={drivetrain} options={DRIVETRAINS.map((value) => [value, value] as const)} onChange={(value) => onDrive(value === drivetrain ? '' : value)} />
  </>
}

function ChipPicker({ legend, value, options, onChange, hint }: { legend: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; hint?: string }) {
  return (
    <fieldset class="admin-field chip-field">
      <legend class="muted small">{legend}</legend>
      <div class="choice-chips">
        {options.map(([option, label]) => (
          <button
            key={option}
            type="button"
            class={`choice-chip${value === option ? ' is-on' : ''}`}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {label}
          </button>
        ))}
      </div>
      {hint && <span class="field-hint">{hint}</span>}
    </fieldset>
  )
}
