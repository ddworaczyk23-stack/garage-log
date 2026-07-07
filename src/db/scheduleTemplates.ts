import type { Interval, MaintenanceCategory } from '../types'

// Static, code-versioned maintenance schedules used to seed each vehicle's
// ReminderRule set and to supply interval references. Not a DB table, not
// user-edited here — users set custom overrides per rule in the app.
//
// Each item carries TWO reference intervals:
//   • factoryInterval          — the manufacturer's published schedule value.
//   • mechanicConsensusInterval — a practical, longevity-focused default from
//     independent-mechanic consensus (what the app recommends by default).
// The per-vehicle rule may add a customOverrideInterval on top. The effective
// interval is: custom ?? consensus ?? factory (see resolveInterval()).
//
// Guiding principle for consensus values: longevity-focused but NOT excessive —
// avoid the shortest-possible interval for everything. Where consensus is a
// range, we store one representative number and explain the range in the note.
//
// CAVEAT: consensus values are compiled from common independent-mechanic
// guidance for long-term ownership, not from your specific vehicles. Verify
// against the owner's manual and adjust with custom overrides as needed.

export interface ScheduleTemplateEntry {
  category: MaintenanceCategory
  /** Overrides CATEGORY_LABELS when a more specific name is wanted. */
  label?: string
  /** Manufacturer's published interval (kept purely as a reference). */
  factoryInterval: Interval
  /** Practical longevity default; when null, the factory interval is used. */
  mechanicConsensusInterval?: Interval | null
  /** Why the consensus differs from factory / what a stated range means. */
  consensusNote?: string
  /** General note about the item (conditions, scope). */
  note?: string
}

// Keyed by Vehicle.id (see seed.ts).
export const SCHEDULE_TEMPLATES: Record<string, ScheduleTemplateEntry[]> = {
  // 2020 Ford F-150 STX, 2.7L EcoBoost V6, 4WD
  'f150-2020': [
    {
      category: 'oil-change',
      factoryInterval: { miles: 10000, months: 12 },
      mechanicConsensusInterval: { miles: 5000, months: 6 },
      consensusNote:
        'Turbocharged EcoBoost running short trips, heat, or towing degrades oil well before the 10k factory max; 5k/6mo is the durable-ownership default.',
    },
    {
      category: 'tire-rotation',
      factoryInterval: { miles: 10000, months: null },
      mechanicConsensusInterval: { miles: 5000, months: null },
      consensusNote: 'Rotate every oil change; evens tread wear, especially on 4WD.',
    },
    {
      category: 'brake-inspection',
      factoryInterval: { miles: 10000, months: 12 },
      mechanicConsensusInterval: { miles: 10000, months: null },
      consensusNote:
        'Consensus 5,000–10,000 mi. Set at 10k as a standalone reminder; pads/rotors also get eyeballed at each tire rotation in between.',
    },
    {
      category: 'cabin-air-filter',
      factoryInterval: { miles: 20000, months: null },
      mechanicConsensusInterval: { miles: 25000, months: null },
      consensusNote:
        'Consensus 20,000–25,000 mi. Comfort item — set toward 25k unless heavy pollen/dust exposure.',
    },
    {
      category: 'engine-air-filter',
      factoryInterval: { miles: 30000, months: null },
      mechanicConsensusInterval: { miles: 30000, months: null },
      consensusNote: 'Inspect sooner in dusty/off-road conditions.',
    },
    {
      category: 'spark-plugs',
      factoryInterval: { miles: 60000, months: null },
      mechanicConsensusInterval: { miles: 60000, months: null },
      consensusNote: '2.7L EcoBoost (turbocharged) — plugs wear faster than an NA engine.',
    },
    {
      category: 'transmission-fluid',
      factoryInterval: { miles: 150000, months: null },
      mechanicConsensusInterval: { miles: 60000, months: null },
      consensusNote:
        'Far shorter than the ~150k "fill-for-life" factory guidance. 60k default; 30,000–40,000 mi if towing or severe use.',
    },
    {
      category: 'transfer-case-fluid',
      label: 'Transfer case fluid (4WD)',
      factoryInterval: { miles: 60000, months: null },
      mechanicConsensusInterval: { miles: 60000, months: null },
      consensusNote: '60k default; sooner with frequent 4WD engagement or severe/dusty use.',
    },
    {
      category: 'differential-fluid',
      label: 'Front & rear axle fluid',
      factoryInterval: { miles: 60000, months: null },
      mechanicConsensusInterval: { miles: 60000, months: null },
      consensusNote: '60k for a truck that tows or hauls; both front and rear axles.',
    },
    {
      category: 'coolant',
      factoryInterval: { miles: 100000, months: 72 },
      mechanicConsensusInterval: { miles: 100000, months: 60 },
      consensusNote: '~100k mi / 5 yr — tightens the time cap slightly vs the 6-yr factory figure.',
    },
    {
      category: 'brake-fluid',
      factoryInterval: { miles: null, months: 36 },
      mechanicConsensusInterval: { miles: null, months: 36 },
      consensusNote:
        'Every 2–3 years. Brake fluid is hygroscopic (absorbs moisture); 3-yr default, sooner in humid climates.',
    },
    {
      category: 'battery-check',
      factoryInterval: { miles: null, months: 12 },
      mechanicConsensusInterval: { miles: null, months: 12 },
      consensusNote: 'Annual load/charge test, ideally before winter.',
    },
    // Items without a user-specified consensus fall back to the factory value.
    {
      category: 'multi-point-inspection',
      factoryInterval: { miles: 10000, months: 12 },
      note: 'Brakes, suspension, fluids, hoses at each service.',
    },
    {
      category: 'wiper-blades',
      factoryInterval: { miles: null, months: 12 },
      note: 'Replace ~annually; sooner if streaking/chattering.',
    },
  ],

  // 2020 Nissan Rogue SL, 2.5L I4, FWD
  'rogue-2020': [
    {
      category: 'oil-change',
      factoryInterval: { miles: 5000, months: 6 },
      mechanicConsensusInterval: { miles: 5000, months: 6 },
      consensusNote: '0W-20 synthetic; 5k/6mo protects against short-trip/severe use.',
    },
    {
      category: 'tire-rotation',
      factoryInterval: { miles: 5000, months: null },
      mechanicConsensusInterval: { miles: 5000, months: null },
      consensusNote: 'Rotate every oil change.',
    },
    {
      category: 'brake-inspection',
      factoryInterval: { miles: 7500, months: null },
      mechanicConsensusInterval: { miles: 10000, months: null },
      consensusNote:
        'Consensus 5,000–10,000 mi; set at 10k as a standalone reminder (also checked at each rotation).',
    },
    {
      category: 'cabin-air-filter',
      label: 'In-cabin microfilter',
      factoryInterval: { miles: 15000, months: null },
      mechanicConsensusInterval: { miles: 20000, months: null },
      consensusNote: '~20k mi; extend unless heavy pollen/dust.',
    },
    {
      category: 'engine-air-filter',
      factoryInterval: { miles: 30000, months: null },
      mechanicConsensusInterval: { miles: 30000, months: null },
      consensusNote: 'Inspect sooner in dusty conditions.',
    },
    {
      category: 'cvt-fluid',
      label: 'CVT fluid (Xtronic)',
      factoryInterval: { miles: 30000, months: null },
      mechanicConsensusInterval: { miles: 30000, months: null },
      consensusNote:
        'Nissan lists no scheduled change ("lifetime"), but independent consensus is 30,000–40,000 mi to protect the Xtronic CVT — a vehicle-specific reason to service it. 30k for heat/severe use; 40k is acceptable for gentle use.',
    },
    {
      category: 'coolant',
      factoryInterval: { miles: 105000, months: 84 },
      mechanicConsensusInterval: { miles: 100000, months: 84 },
      consensusNote:
        '~90,000–100,000 mi, keeping the factory ~7-yr time cap — whichever comes first on a low-mileage car.',
    },
    {
      category: 'spark-plugs',
      factoryInterval: { miles: 105000, months: null },
      mechanicConsensusInterval: null,
      consensusNote: 'Kept at the factory ~105k iridium-plug interval by owner preference.',
    },
    {
      category: 'brake-fluid',
      factoryInterval: { miles: null, months: 24 },
      mechanicConsensusInterval: { miles: null, months: 36 },
      consensusNote: 'Every 2–3 years; 3-yr default, sooner in humid climates.',
    },
    {
      category: 'battery-check',
      factoryInterval: { miles: null, months: 12 },
      mechanicConsensusInterval: { miles: null, months: 12 },
      consensusNote: 'Annual load/charge test.',
    },
    {
      category: 'wheel-alignment',
      factoryInterval: { miles: null, months: 24 },
      mechanicConsensusInterval: { miles: null, months: null, conditionBased: true },
      consensusNote:
        'Condition-based, not a fixed interval: check when tires wear unevenly, the car pulls, or after curb/pothole impacts.',
    },
    // Items without a user-specified consensus fall back to the factory value.
    {
      category: 'multi-point-inspection',
      factoryInterval: { miles: 7500, months: null },
      note: 'Brakes, suspension, fluids at each service.',
    },
    {
      category: 'wiper-blades',
      factoryInterval: { miles: null, months: 12 },
      note: 'Replace ~annually; sooner if streaking/chattering.',
    },
  ],
}

// Look up the pristine, factory + consensus template entry for a vehicle+
// category. The template lives here in code and is NEVER mutated, so this always
// returns the reference values even after the user sets a custom override or
// logs completed services. Used by resolveInterval(), the admin view, and later
// the reminder engine.
export function getTemplateEntry(
  vehicleId: string,
  category: MaintenanceCategory,
): ScheduleTemplateEntry | undefined {
  return SCHEDULE_TEMPLATES[vehicleId]?.find((e) => e.category === category)
}
