import type { Vehicle } from '../types'

// Pure display helper: the label shown for a vehicle is its user nickname when
// set (non-blank), otherwise the seeded name. Used everywhere a vehicle is named
// so a nickname propagates consistently across the app.
export function vehicleLabel(vehicle: Pick<Vehicle, 'name' | 'nickname'>): string {
  return vehicle.nickname?.trim() || vehicle.name
}

const TRUCK_MODELS = [
  'f-150',
  'f150',
  'f-250',
  'f250',
  'silverado',
  'sierra',
  'ram 1500',
  'ram 2500',
  'tacoma',
  'tundra',
  'ridgeline',
  'colorado',
  'frontier',
  'titan',
]

const SUV_MODELS = [
  'rogue',
  'cr-v',
  'crv',
  'rav4',
  'rav-4',
  'explorer',
  'highlander',
  'pilot',
  'tahoe',
  'suburban',
  'escape',
  'equinox',
  '4runner',
  'wrangler',
  'grand cherokee',
  'cherokee',
  'pathfinder',
  'murano',
  'traverse',
  'trailblazer',
  'blazer',
  'edge',
  'santa fe',
  'tucson',
  'cx-5',
  'outback',
  'forester',
]

const VAN_MODELS = ['odyssey', 'sienna', 'pacifica', 'transit', 'sprinter', 'grand caravan']

// Best-effort body-style guess from the model name alone (no dedicated
// bodyStyle field on Vehicle). Unknown models (sedans/coupes/hatchbacks, or
// anything not in the keyword lists above) fall back to a generic car — this
// deliberately never guesses wrong toward "truck"/"SUV" for an unrecognized
// model.
export function vehicleEmoji(vehicle: Pick<Vehicle, 'model'>): string {
  const model = vehicle.model.toLowerCase()
  if (TRUCK_MODELS.some(m => model.includes(m))) return '🛻'
  if (SUV_MODELS.some(m => model.includes(m))) return '🚙'
  if (VAN_MODELS.some(m => model.includes(m))) return '🚐'
  return '🚗'
}
