import type { Vehicle } from '../types'

// Pure display helper: the label shown for a vehicle is its user nickname when
// set (non-blank), otherwise the seeded name. Used everywhere a vehicle is named
// so a nickname propagates consistently across the app.
export function vehicleLabel(vehicle: Pick<Vehicle, 'name' | 'nickname'>): string {
  return vehicle.nickname?.trim() || vehicle.name
}

export type VehicleBody = 'car' | 'pickup' | 'suv'

// Model-name stems, matched against the start of `model` (case-insensitive).
// The Vehicle record has no body-style field, so the icon is a best guess;
// anything unknown falls back to a plain car.
const PICKUPS = ['f-150', 'f-250', 'f-350', 'f150', 'ranger', 'maverick', 'silverado', 'sierra', 'colorado', 'canyon', 'ram', 'tacoma', 'tundra', 'titan', 'frontier', 'ridgeline', 'gladiator', 'santa cruz', 'cybertruck']
const SUVS = ['rogue', 'murano', 'pathfinder', 'kicks', 'armada', 'rav4', 'highlander', '4runner', 'sequoia', 'cr-v', 'hr-v', 'pilot', 'passport', 'explorer', 'escape', 'edge', 'expedition', 'bronco', 'equinox', 'traverse', 'tahoe', 'suburban', 'blazer', 'trailblazer', 'yukon', 'acadia', 'terrain', 'wrangler', 'cherokee', 'grand cherokee', 'compass', 'tucson', 'santa fe', 'palisade', 'kona', 'sorento', 'sportage', 'telluride', 'forester', 'outback', 'ascent', 'crosstrek', 'cx-5', 'cx-50', 'cx-9', 'cx-90', 'model y', 'model x', 'atlas', 'tiguan']

export function vehicleBody(v: Pick<Vehicle, 'make' | 'model'>): VehicleBody {
  // Ram sells only trucks under that make; its model is just "1500" etc.
  if (v.make.trim().toLowerCase() === 'ram') return 'pickup'
  const model = v.model.trim().toLowerCase()
  const starts = (stem: string) => model === stem || model.startsWith(`${stem} `)
  if (PICKUPS.some(starts)) return 'pickup'
  if (SUVS.some(starts)) return 'suv'
  return 'car'
}
