// Make/model lists for "Add a car" manual entry, for when the VIN isn't handy.
// Makes are a bundled list (works offline). Models come from NHTSA's free vPIC
// API, the same no-key, CORS-enabled service vinDecode.ts uses. The form keeps
// a "type it in" fallback, so a failed lookup never blocks adding a car.

// Common US-market makes, spelled the way vPIC names them (case aside) so the
// model lookup matches.
export const COMMON_MAKES = [
  'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler',
  'Dodge', 'Fiat', 'Ford', 'Genesis', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jaguar',
  'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Lucid', 'Maserati', 'Mazda',
  'Mercedes-Benz', 'Mercury', 'MINI', 'Mitsubishi', 'Nissan', 'Polestar', 'Pontiac',
  'Porsche', 'Ram', 'Rivian', 'Saab', 'Saturn', 'Scion', 'Subaru', 'Suzuki', 'Tesla',
  'Toyota', 'Volkswagen', 'Volvo',
] as const

// vPIC filters by one vehicle type per call. Cars, trucks (incl. pickups) and
// MPVs (SUVs, minivans) cover household vehicles and leave out motorcycles.
const VEHICLE_TYPES = ['car', 'truck', 'mpv'] as const

interface VpicModel {
  Make_Name?: string
  Model_Name?: string
}

export type ModelListResult = { ok: true; models: string[] } | { ok: false }

// vPIC's make match is partial ("Ram" also hits other makes starting with
// "RAM"), so keep only the exact make, then de-dupe and sort for the dropdown.
export function modelNamesFor(make: string, results: VpicModel[]): string[] {
  const wanted = make.trim().toUpperCase()
  const names = new Set<string>()
  for (const row of results) {
    const name = row.Model_Name?.trim()
    if (name && row.Make_Name?.trim().toUpperCase() === wanted) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

const cache = new Map<string, string[]>()

export async function fetchModels(make: string, year: number): Promise<ModelListResult> {
  const key = `${make.toUpperCase()}|${year}`
  const cached = cache.get(key)
  if (cached) return { ok: true, models: cached }

  const base = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}`
  const responses = await Promise.allSettled(
    VEHICLE_TYPES.map(async (type) => {
      const res = await fetch(`${base}/vehicletype/${type}?format=json`)
      if (!res.ok) throw new Error(`vPIC ${res.status}`)
      const body = (await res.json()) as { Results?: VpicModel[] }
      return body.Results ?? []
    }),
  )
  const rows = responses.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  // Every call failed: offline or service down. One type failing is fine.
  if (responses.every((r) => r.status === 'rejected')) return { ok: false }

  const models = modelNamesFor(make, rows)
  if (models.length) cache.set(key, models)
  return { ok: true, models }
}
