import { canonicalVehicleId } from '../domain/vehicleIdentity'
import type { VehicleIdentity } from '../types'
import type { VehicleTraits } from '../db/traitTemplates'

// VIN -> vehicle identity, via NHTSA's free vPIC "decodevinvalues" API. Real
// network call (no key, CORS-enabled). NOTE: this endpoint's `Results` is a
// single flat object with named fields (Make/Model/ModelYear/Trim/...) — not
// the `{Variable, Value}[]` shape used by vPIC's plain `/decodevin/` endpoint.
interface VpicDecodedVehicle {
  ModelYear?: string
  Make?: string
  Model?: string
  Trim?: string
  Series?: string
  BodyClass?: string
  DisplacementL?: string
  EngineCylinders?: string
  FuelTypePrimary?: string
  DriveType?: string
  Turbo?: string
  ElectrificationLevel?: string
  TransmissionStyle?: string
}

export interface VinDecodeError {
  ok: false
  error: string
}

export interface VinDecodeSuccess {
  ok: true
  identity: VehicleIdentity
  // Best-effort prefill only — vPIC's free-text fields vary in completeness
  // and phrasing, so the Add Car form still shows these as editable, not final.
  suggestedEngine?: string
  suggestedDrivetrain?: string
  suggestedTraits?: Partial<VehicleTraits>
}

export type VinDecodeResult = VinDecodeSuccess | VinDecodeError

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const trimmed = vin.trim().toUpperCase()
  if (trimmed.length !== 17) {
    return { ok: false, error: 'A VIN is 17 characters.' }
  }

  let res: Response
  try {
    res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(trimmed)}?format=json`,
    )
  } catch {
    return { ok: false, error: 'Could not reach the VIN decode service. Check your connection and try again.' }
  }
  if (!res.ok) {
    return { ok: false, error: `VIN decode service returned an error (${res.status}).` }
  }

  const body = (await res.json()) as { Results?: VpicDecodedVehicle[] }
  const result = body.Results?.[0]
  const year = Number(result?.ModelYear)
  const make = result?.Make?.trim() || ''
  const model = result?.Model?.trim() || ''
  const trim = result?.Trim?.trim() || result?.Series?.trim() || 'Base'
  const style = result?.BodyClass?.trim() || undefined

  if (!year || !make || !model) {
    return { ok: false, error: "That VIN didn't decode to a recognizable vehicle. Try entering details manually." }
  }

  const identity: VehicleIdentity = {
    vin: trimmed,
    year,
    make,
    model,
    trim,
    style,
    canonicalVehicleId: canonicalVehicleId({ year, make, model, trim }),
  }

  const displacement = result?.DisplacementL?.trim()
  const cylinders = result?.EngineCylinders?.trim()
  const fuelType = result?.FuelTypePrimary?.trim()
  const suggestedEngine =
    [displacement && `${Number(displacement).toFixed(1)}L`, cylinders && `${cylinders}-cyl`, fuelType]
      .filter(Boolean)
      .join(' ') || undefined
  const suggestedDrivetrain = result?.DriveType?.trim() || undefined
  const electrification = result?.ElectrificationLevel?.toLowerCase() ?? ''
  const turbo = result?.Turbo?.toLowerCase() ?? ''
  const transmission = result?.TransmissionStyle?.toLowerCase() ?? ''
  const drive = suggestedDrivetrain?.toLowerCase() ?? ''
  const suggestedTraits: Partial<VehicleTraits> = {}
  // Hybrid first: vPIC hybrids read "HEV (Strong Hybrid Electric Vehicle)",
  // which also contains "electric".
  if (electrification.includes('hybrid')) suggestedTraits.power = 'hybrid'
  else if (electrification.includes('bev') || fuelType?.toLowerCase() === 'electric') suggestedTraits.power = 'ev'
  else if (fuelType?.toLowerCase().includes('diesel')) suggestedTraits.power = 'diesel'
  else if (turbo === 'yes' || turbo === 'true') suggestedTraits.power = 'turbo'
  else if (fuelType) suggestedTraits.power = 'gas'
  if (transmission.includes('cvt')) suggestedTraits.trans = 'cvt'
  else if (transmission.includes('dual') || transmission.includes('dct') || transmission.includes('dsg')) suggestedTraits.trans = 'dct'
  else if (transmission.includes('manual')) suggestedTraits.trans = 'manual'
  else if (transmission.includes('automatic')) suggestedTraits.trans = 'auto'
  if (drive.includes('4wd') || drive.includes('4x4') || drive.includes('4-wheel')) suggestedTraits.drive = '4wd'
  else if (drive.includes('awd') || drive.includes('all-wheel')) suggestedTraits.drive = 'awd'
  else if (drive.includes('fwd') || drive.includes('front-wheel')) suggestedTraits.drive = 'fwd'
  else if (drive.includes('rwd') || drive.includes('rear-wheel')) suggestedTraits.drive = 'rwd'

  return { ok: true, identity, suggestedEngine, suggestedDrivetrain, suggestedTraits }
}
