import { useEffect, useMemo, useState } from 'preact/hooks'
import { addVehicle } from '../db/vehicleOnboarding'
import { db } from '../db/db'
import { decodeVin } from '../services/vinDecode'
import { COMMON_MAKES, fetchModels } from '../services/vehicleCatalog'
import { fetchTrims, type TrimVersion } from '../services/trimCatalog'
import { bundleModels, bundleTrims, loadMakeBundle, mergeModelNames, sameModel, type MakeBundle } from '../services/catalogBundle'
import { canonicalVehicleId, matchesExistingVehicle } from '../domain/vehicleIdentity'
import { Reveal } from '../components/motion/Reveal'
import { PageHeader } from '../components/ui'
import type { VehicleIdentity } from '../types'
import type { VehicleTraits } from '../db/traitTemplates'
import { traitsKey } from '../db/traitTemplates'
import { ScheduleReview } from '../components/ScheduleReview'
import { TraitPickers } from '../components/TraitPickers'
import { resolveTraitAnswers, seedUnsureEdits, type ScheduleEdit } from '../domain/scheduleReview'
import type { MaintenanceCategory } from '../types'

type Mode = 'vin' | 'manual'
const CURRENT_YEAR = new Date().getFullYear()
// Next year's models go on sale in the fall, so the list starts one year ahead.
const VEHICLE_YEARS = Array.from({ length: 42 }, (_, index) => CURRENT_YEAR + 1 - index)
// Select value for "my make/model isn't listed": swaps in a text input.
const OTHER = '__other'
type ModelList = { status: 'idle' | 'loading' | 'ready' | 'failed'; models: string[] }
type TrimList = { status: 'idle' | 'loading' | 'ready' | 'failed'; versions: TrimVersion[] }

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
  const [makeOther, setMakeOther] = useState(false)
  const [modelOther, setModelOther] = useState(false)
  // undefined while the make's bundled catalog loads; null when it has none.
  const [bundle, setBundle] = useState<MakeBundle | null | undefined>(null)
  const [liveModels, setLiveModels] = useState<ModelList>({ status: 'idle', models: [] })
  const [trimOther, setTrimOther] = useState(false)
  const [trimId, setTrimId] = useState('')
  const [liveTrims, setLiveTrims] = useState<TrimList>({ status: 'idle', versions: [] })

  // The bundled catalog (catalogBundle.ts) fills the pickers instantly. The
  // live lookups run alongside for what it lacks, and a typed-in make, or a
  // failed/empty lookup, falls back to typing, so nothing here blocks adding
  // a car.
  useEffect(() => {
    if (!make || makeOther) {
      setBundle(null)
      return
    }
    let cancelled = false
    setBundle(undefined)
    loadMakeBundle(make).then((loaded) => {
      if (!cancelled) setBundle(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [make, makeOther])

  // NHTSA models: the whole list when the year isn't bundled, otherwise the
  // models EPA doesn't rate (heavy-duty pickups), merged in when they arrive.
  useEffect(() => {
    const y = Number(year)
    if (!y || !make || makeOther) {
      setLiveModels({ status: 'idle', models: [] })
      return
    }
    let cancelled = false
    setLiveModels({ status: 'loading', models: [] })
    fetchModels(make, y).then((result) => {
      if (cancelled) return
      const models = result.ok ? result.models : []
      setLiveModels({ status: result.ok && models.length ? 'ready' : 'failed', models })
    })
    return () => {
      cancelled = true
    }
  }, [year, make, makeOther])

  const bundledModels = useMemo(() => (bundle && Number(year) ? bundleModels(bundle, Number(year)) : []), [bundle, year])
  const modelList = useMemo<ModelList>(() => {
    if (bundledModels.length) return { status: 'ready', models: mergeModelNames(bundledModels, liveModels.models) }
    if (bundle === undefined && liveModels.status !== 'idle') return { status: 'loading', models: [] }
    return liveModels
  }, [bundle, bundledModels, liveModels])

  // When NHTSA's list lands, a picked "F150" becomes its "F-150" (same model,
  // same trims). A year change can drop the picked model from the list; wait
  // for the live list, which may still add it back.
  useEffect(() => {
    if (modelOther || !model || modelList.status !== 'ready' || modelList.models.includes(model)) return
    const respelled = modelList.models.find((name) => sameModel(name, model))
    if (respelled) setModel(respelled)
    else if (liveModels.status !== 'loading') setModel('')
  }, [model, modelOther, modelList, liveModels.status])

  // Trims show once a model is picked from the list (a typed model has no
  // reliable EPA match). Bundled ones are instant; when the year isn't
  // bundled, they load live. Same fallback: type the trim, or leave it blank.
  const pickedModel = Number(year) && make && model && !modelOther && modelList.status === 'ready' ? model : ''
  const bundledTrims = useMemo(() => (bundle && pickedModel ? bundleTrims(bundle, Number(year), pickedModel) : []), [bundle, year, pickedModel])
  const trimsLive = pickedModel !== '' && bundle !== undefined && !bundledModels.length
  useEffect(() => {
    if (!trimsLive) {
      setLiveTrims({ status: 'idle', versions: [] })
      return
    }
    let cancelled = false
    setLiveTrims({ status: 'loading', versions: [] })
    fetchTrims(make, pickedModel, Number(year), liveModels.models).then((result) => {
      if (cancelled) return
      const versions = result.ok ? result.versions : []
      setLiveTrims({ status: versions.length ? 'ready' : 'failed', versions })
    })
    return () => {
      cancelled = true
    }
  }, [trimsLive, year, make, pickedModel, liveModels.models])

  const trimList: TrimList = !pickedModel
    ? { status: 'idle', versions: [] }
    : bundledTrims.length
      ? { status: 'ready', versions: bundledTrims }
      : trimsLive
        ? liveTrims
        : // Bundled year, but EPA doesn't rate this model (e.g. a heavy-duty pickup).
          { status: 'failed', versions: [] }

  function resetTrim() {
    setTrim('')
    setTrimId('')
    setTrimOther(false)
  }
  function chooseMake(value: string) {
    setMakeOther(value === OTHER)
    setMake(value === OTHER ? '' : value)
    setModel('')
    setModelOther(false)
    resetTrim()
  }
  function chooseModel(value: string) {
    setModelOther(value === OTHER)
    setModel(value === OTHER ? '' : value)
    resetTrim()
  }
  // A picked version also answers engine, transmission and drivetrain; the
  // pickers below stay editable.
  function chooseTrim(value: string) {
    setTrimOther(value === OTHER)
    setTrimId(value === OTHER ? '' : value)
    const version = trimList.versions.find((v) => v.id === value)
    setTrim(version?.trim ?? '')
    if (!version) return
    setEngine(version.engine)
    if (version.power) setPower(version.power)
    if (version.trans) changeTrans(version.trans)
    if (version.drive) setDrivetrain(version.drive)
  }

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
            <select value={makeOther ? OTHER : make} onChange={(e) => chooseMake((e.target as HTMLSelectElement).value)}>
              <option value="">Choose make</option>
              {COMMON_MAKES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value={OTHER}>Other (type it in)</option>
            </select>
            {makeOther && (
              <input type="text" value={make} placeholder="e.g. Toyota" aria-label="Make" onInput={(e) => setMake((e.target as HTMLInputElement).value)} />
            )}
          </label>
          <label class="admin-field">
            <span class="muted small">Model</span>
            {modelList.status === 'ready' ? (
              <select value={modelOther ? OTHER : model} onChange={(e) => chooseModel((e.target as HTMLSelectElement).value)}>
                <option value="">Choose model</option>
                {modelList.models.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value={OTHER}>Not listed (type it in)</option>
              </select>
            ) : modelList.status === 'failed' || makeOther ? null : (
              <select disabled>
                <option>{modelList.status === 'loading' ? 'Loading models…' : 'Choose year and make first'}</option>
              </select>
            )}
            {(modelOther || makeOther || modelList.status === 'failed') && (
              <input type="text" value={model} placeholder="e.g. Camry" aria-label="Model" onInput={(e) => setModel((e.target as HTMLInputElement).value)} />
            )}
            {modelList.status === 'failed' && (
              <span class="field-hint">Couldn't load the model list (offline?). Type the model instead.</span>
            )}
          </label>
          <label class="admin-field">
            <span class="muted small">Trim — optional</span>
            {trimList.status === 'ready' && (
              <select value={trimOther ? OTHER : trimId} onChange={(e) => chooseTrim((e.target as HTMLSelectElement).value)}>
                <option value="">Not sure (skip)</option>
                {trimList.versions.map((version) => (
                  <option key={version.id} value={version.id}>{version.label}</option>
                ))}
                <option value={OTHER}>Other (type it in)</option>
              </select>
            )}
            {trimList.status === 'loading' && (
              <select disabled>
                <option>Loading trims…</option>
              </select>
            )}
            {(trimOther || trimList.status === 'idle' || trimList.status === 'failed') && (
              <input
                type="text"
                value={trim}
                placeholder="Not sure? Leave it blank"
                aria-label="Trim"
                onInput={(e) => setTrim((e.target as HTMLInputElement).value)}
              />
            )}
            {trimList.status === 'ready' && !trimOther && (
              <span class="field-hint">Engine and drive versions from EPA data. Picking one fills in the questions below.</span>
            )}
            {trimList.status === 'failed' && (
              <span class="field-hint">No trim list for this model. Type it in or leave it blank.</span>
            )}
          </label>
          <label class="admin-field">
            <span class="muted small">Engine — optional</span>
            <input type="text" value={engine} onInput={(e) => setEngine((e.target as HTMLInputElement).value)} />
          </label>
          <TraitPickers power={power} trans={trans} belt={belt} drivetrain={drivetrain} onPower={setPower} onTrans={changeTrans} onBelt={changeBelt} onDrive={setDrivetrain} />
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
          <TraitPickers power={power} trans={trans} belt={belt} drivetrain={drivetrain} onPower={setPower} onTrans={changeTrans} onBelt={changeBelt} onDrive={setDrivetrain} />
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
