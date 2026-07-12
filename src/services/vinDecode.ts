import { canonicalVehicleId } from '../domain/vehicleIdentity'
import type { VehicleIdentity } from '../types'

// VIN -> vehicle identity, via NHTSA's free vPIC "decodevinvalues" API. Real
// network call (no key, CORS-enabled), unlike the maintenance/consensus
// providers below which have no free public equivalent — see
// services/maintenanceProvider.ts. NOTE: this endpoint's `Results` is a
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

  return { ok: true, identity, suggestedEngine, suggestedDrivetrain }
}
