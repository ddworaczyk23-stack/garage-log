import type { ScheduleTemplateEntry } from './scheduleTemplates'

export type VehicleTraits = {
  power: 'gas' | 'turbo' | 'diesel' | 'hybrid' | 'ev'
  trans: 'auto' | 'cvt' | 'dct' | 'manual' | 'none'
  drive: 'fwd' | 'rwd' | 'awd' | '4wd' | 'none'
  belt: 'yes' | 'no'
}

const PREFIX = 'traits:v1:'

export function traitsKey(traits: VehicleTraits): string {
  return `${PREFIX}${traits.power}.${traits.trans}.${traits.drive}.${traits.belt}`
}

export function parseTraitsKey(key: string): VehicleTraits | null {
  if (!key.startsWith(PREFIX)) return null
  const [power, trans, drive, belt, extra] = key.slice(PREFIX.length).split('.')
  if (
    extra !== undefined ||
    !['gas', 'turbo', 'diesel', 'hybrid', 'ev'].includes(power) ||
    !['auto', 'cvt', 'dct', 'manual', 'none'].includes(trans) ||
    !['fwd', 'rwd', 'awd', '4wd', 'none'].includes(drive) ||
    !['yes', 'no'].includes(belt)
  ) return null
  return {
    power: power as VehicleTraits['power'],
    trans: trans as VehicleTraits['trans'],
    drive: drive as VehicleTraits['drive'],
    belt: belt as VehicleTraits['belt'],
  }
}

// The generic, broadly-applicable modern gas schedule. Trait schedules copy
// this list before adding/removing only what their declared equipment needs.
export const GENERIC_BASE_TEMPLATE: ScheduleTemplateEntry[] = [
  {
    category: 'oil-change',
    factoryInterval: { miles: 7500, months: 12 },
    mechanicConsensusInterval: { miles: 5000, months: 6 },
    consensusNote: 'General default — most manufacturers publish 5,000–10,000 mi. Short trips, heat, and stop-and-go wear oil faster; check your manual.',
  },
  {
    category: 'tire-rotation',
    factoryInterval: { miles: 7500, months: null },
    mechanicConsensusInterval: { miles: 5000, months: null },
    consensusNote: 'Rotate roughly every oil change to even out tread wear. Check your manual.',
  },
  {
    category: 'brake-inspection',
    factoryInterval: { miles: 10000, months: 12 },
    mechanicConsensusInterval: { miles: 10000, months: null },
    consensusNote: 'Pads/rotors also get eyeballed at each tire rotation in between. Check your manual.',
  },
  {
    category: 'engine-air-filter',
    factoryInterval: { miles: 30000, months: 36 },
    mechanicConsensusInterval: { miles: 30000, months: 36 },
    consensusNote: 'Dusty roads or heavy city traffic: about 15k. Check your manual.',
  },
  {
    category: 'cabin-air-filter',
    factoryInterval: { miles: 30000, months: 36 },
    mechanicConsensusInterval: { miles: 20000, months: 24 },
    consensusNote: 'Dusty roads or heavy city traffic: about 15k. Check your manual.',
  },
  {
    category: 'brake-fluid',
    factoryInterval: { miles: null, months: 36 },
    mechanicConsensusInterval: { miles: null, months: 36 },
    consensusNote: 'Use the fluid type printed on the reservoir cap (DOT 3, DOT 4...). Do not mix types. Check your manual.',
  },
  {
    category: 'coolant',
    factoryInterval: { miles: 100000, months: 120 },
    mechanicConsensusInterval: { miles: 60000, months: 60 },
    consensusNote: 'Use the coolant type in your manual. Don’t go by color. Don’t mix types. Check your manual.',
  },
  {
    category: 'spark-plugs',
    factoryInterval: { miles: 100000, months: null },
    mechanicConsensusInterval: { miles: 100000, months: null },
    consensusNote: 'Iridium/platinum plugs typically last 100k; some turbo engines use a shorter interval. Check your manual.',
  },
  {
    category: 'battery-check',
    factoryInterval: { miles: null, months: 12 },
    mechanicConsensusInterval: { miles: null, months: 12 },
    consensusNote: 'Annual load/charge test — most batteries last 3–5 years. Check your manual.',
  },
  {
    category: 'wheel-alignment',
    factoryInterval: { miles: null, months: 24 },
    mechanicConsensusInterval: { miles: null, months: null, conditionBased: true },
    consensusNote: 'Condition-based: check when tires wear unevenly, the car pulls, or after curb/pothole impacts. Check your manual.',
  },
  { category: 'wiper-blades', factoryInterval: { miles: null, months: 12 }, note: 'Replace ~annually; sooner if streaking/chattering. Check your manual.' },
]

function replace(entries: ScheduleTemplateEntry[], entry: ScheduleTemplateEntry): void {
  const index = entries.findIndex((item) => item.category === entry.category)
  if (index >= 0) entries[index] = entry
  else entries.push(entry)
}

function remove(entries: ScheduleTemplateEntry[], ...categories: ScheduleTemplateEntry['category'][]): void {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (categories.includes(entries[index].category)) entries.splice(index, 1)
  }
}

export function composeTraitTemplate(traits: VehicleTraits): ScheduleTemplateEntry[] {
  const entries = GENERIC_BASE_TEMPLATE.map((entry) => ({ ...entry, factoryInterval: { ...entry.factoryInterval }, mechanicConsensusInterval: entry.mechanicConsensusInterval && { ...entry.mechanicConsensusInterval } }))
  const isElectrified = traits.power === 'hybrid' || traits.power === 'ev'

  if (traits.power === 'turbo') {
    const oil = entries.find((entry) => entry.category === 'oil-change')!
    oil.note = 'Turbo: use the exact oil spec in your manual. Check your manual.'
  }
  if (traits.power === 'diesel') {
    remove(entries, 'spark-plugs')
    replace(entries, { category: 'oil-change', factoryInterval: { miles: 10000, months: 12 }, mechanicConsensusInterval: { miles: 7500, months: 6 }, note: 'Use diesel-rated oil (the spec in your manual). Check your manual.' })
    entries.push({ category: 'fuel-filter', factoryInterval: { miles: 15000, months: 12 }, mechanicConsensusInterval: { miles: 15000, months: 12 }, note: '10k if you idle a lot, tow heavy, or drive in dust. Drain the water separator when the light comes on. Check your manual.' })
  }
  if (traits.power === 'hybrid') {
    replace(entries, { ...entries.find((entry) => entry.category === 'battery-check')!, label: '12V battery check', note: 'Toyota hybrids: clean the battery cooling vent filter about every 20k. Check your manual.' })
    replace(entries, { ...entries.find((entry) => entry.category === 'brake-inspection')!, note: 'Regen braking means the pads wear slowly, but rotors rust and calipers stick. Check yearly. Check your manual.' })
  }
  if (traits.power === 'ev') {
    remove(entries, 'oil-change', 'engine-air-filter', 'spark-plugs', 'fuel-filter', 'serpentine-belt')
    replace(entries, { ...entries.find((entry) => entry.category === 'battery-check')!, label: '12V battery check' })
    replace(entries, { ...entries.find((entry) => entry.category === 'brake-inspection')!, note: 'Regen braking means the pads wear slowly, but rotors rust and calipers stick. Check yearly. Check your manual.' })
    replace(entries, { category: 'coolant', factoryInterval: { miles: 120000, months: 60 }, mechanicConsensusInterval: { miles: 120000, months: 60 }, note: 'Dealer job. Never open the high-voltage cooling system yourself. Check your manual.' })
  }

  const trans = isElectrified ? 'none' : traits.trans
  if (trans === 'auto') entries.push({ category: 'transmission-fluid', factoryInterval: { miles: 60000, months: 72 }, mechanicConsensusInterval: { miles: 60000, months: 72 }, note: "Preventive long-ownership interval. Many makers say ‘lifetime’ or list it for severe use only. Use the fluid in your manual. 45k if towing, heat, or lots of stop-and-go. Check your manual." })
  if (trans === 'cvt') entries.push({ category: 'cvt-fluid', factoryInterval: { miles: 60000, months: 72 }, mechanicConsensusInterval: { miles: 40000, months: 48 }, note: 'OEM fluid only; drain-and-fill, no flush. 30k if towing, short trips, heat, or dust. Check your manual.' })
  if (trans === 'dct') entries.push({ category: 'transmission-fluid', label: 'Dual-clutch fluid (and filter)', factoryInterval: { miles: 40000, months: 48 }, mechanicConsensusInterval: { miles: 40000, months: 48 }, note: 'Many dual-clutch boxes need fluid and a filter together. Some (VW 7-speed) go 80k. Use the exact fluid; no flush. Check your manual.' })
  if (trans === 'manual') {
    entries.push({ category: 'transmission-fluid', label: 'Manual gearbox oil', factoryInterval: { miles: 60000, months: 48 }, mechanicConsensusInterval: { miles: 60000, months: 48 }, note: 'Use the exact gear oil in your manual. The wrong type can harm the shifting parts. On many FWD cars this oil also serves the front differential. Check your manual.' })
    const brakeFluid = entries.find((entry) => entry.category === 'brake-fluid')!
    brakeFluid.note = 'Also covers clutch fluid.'
  }

  if (traits.power !== 'ev' && traits.drive === 'awd') entries.push({ category: 'differential-fluid', label: 'Rear differential / AWD unit fluid', factoryInterval: { miles: 60000, months: 48 }, mechanicConsensusInterval: { miles: 60000, months: 48 }, note: 'Many AWD cars have a rear differential and a transfer unit up front (PTU). Some use special fluid. Toyota/Lexus can be 30k. Keep all four tires the same size and similar wear. Check your manual.' })
  if (traits.power !== 'ev' && traits.drive === '4wd') {
    entries.push({ category: 'transfer-case-fluid', factoryInterval: { miles: 50000, months: 60 }, mechanicConsensusInterval: { miles: 50000, months: 60 }, note: 'Sooner if you tow, plow, go off-road, or drive through deep water. Milky gear oil means water got in: service it now. Check your manual.' })
    entries.push({ category: 'differential-fluid', label: 'Front & rear axle fluid', factoryInterval: { miles: 50000, months: 60 }, mechanicConsensusInterval: { miles: 50000, months: 60 }, note: 'Sooner if you tow, plow, go off-road, or drive through deep water. Milky gear oil means water got in: service it now. Check your manual.' })
  }
  if (traits.power !== 'ev' && traits.belt === 'yes') entries.push({ category: 'timing-belt', factoryInterval: { miles: 100000, months: 96 }, mechanicConsensusInterval: { miles: 90000, months: 84 }, note: 'Water pump, tensioner and idlers are often done in the same job. Check your manual.' })
  return entries
}
