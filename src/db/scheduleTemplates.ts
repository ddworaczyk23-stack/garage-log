import type { Interval, MaintenanceCategory, ReminderRule } from '../types'
import { CATEGORY_LABELS } from '../types'

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

/** Template key for vehicles added via "Add Car" — see the generic entry below. */
export const GENERIC_TEMPLATE_KEY = 'generic-gas-vehicle'

// Keyed by the fixed logical template key (ReminderRule.templateKey, set in
// seed.ts) — NOT by Vehicle.id, which is per-user-unique.
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

  // Generic fallback for vehicles added via "Add Car" (db/vehicleOnboarding.ts)
  // — broadly-applicable items for a modern gas vehicle, deliberately excluding
  // drivetrain-specific services (CVT vs. automatic, transfer case, diffs) that
  // can't be assumed without knowing the car. Intervals are honest general
  // defaults, not model data; every note says to verify against the owner's
  // manual, and per-rule custom overrides personalize from there.
  [GENERIC_TEMPLATE_KEY]: [
    {
      category: 'oil-change',
      factoryInterval: { miles: 7500, months: 12 },
      mechanicConsensusInterval: { miles: 5000, months: 6 },
      consensusNote:
        'General default — most manufacturers publish 5,000–10,000 mi. Short trips, heat, and stop-and-go wear oil faster; verify your manual and oil spec.',
    },
    {
      category: 'tire-rotation',
      factoryInterval: { miles: 7500, months: null },
      mechanicConsensusInterval: { miles: 5000, months: null },
      consensusNote: 'Rotate roughly every oil change to even out tread wear.',
    },
    {
      category: 'brake-inspection',
      factoryInterval: { miles: 10000, months: 12 },
      mechanicConsensusInterval: { miles: 10000, months: null },
      consensusNote: 'Pads/rotors also get eyeballed at each tire rotation in between.',
    },
    {
      category: 'engine-air-filter',
      factoryInterval: { miles: 30000, months: null },
      mechanicConsensusInterval: { miles: 30000, months: null },
      consensusNote: 'Inspect sooner in dusty conditions.',
    },
    {
      category: 'cabin-air-filter',
      factoryInterval: { miles: 25000, months: null },
      mechanicConsensusInterval: { miles: 25000, months: null },
      consensusNote: 'Comfort item — sooner with heavy pollen/dust exposure.',
    },
    {
      category: 'brake-fluid',
      factoryInterval: { miles: null, months: 36 },
      mechanicConsensusInterval: { miles: null, months: 36 },
      consensusNote: 'Hygroscopic — absorbs moisture over time regardless of miles.',
    },
    {
      category: 'coolant',
      factoryInterval: { miles: 100000, months: 120 },
      mechanicConsensusInterval: { miles: 60000, months: 60 },
      consensusNote:
        'Varies widely by coolant type (60k–150k factory claims). 60k/5yr is a safe general default — verify the spec for your engine.',
    },
    {
      category: 'spark-plugs',
      factoryInterval: { miles: 100000, months: null },
      mechanicConsensusInterval: { miles: 90000, months: null },
      consensusNote:
        'Iridium/platinum plugs typically 90–100k; copper plugs and turbo engines wear much sooner — check your manual.',
    },
    {
      category: 'battery-check',
      factoryInterval: { miles: null, months: 12 },
      mechanicConsensusInterval: { miles: null, months: 12 },
      consensusNote: 'Annual load/charge test — most batteries last 3–5 years.',
    },
    {
      category: 'wheel-alignment',
      factoryInterval: { miles: null, months: 24 },
      mechanicConsensusInterval: { miles: null, months: null, conditionBased: true },
      consensusNote:
        'Condition-based, not a fixed interval: check when tires wear unevenly, the car pulls, or after curb/pothole impacts.',
    },
    {
      category: 'wiper-blades',
      factoryInterval: { miles: null, months: 12 },
      note: 'Replace ~annually; sooner if streaking/chattering.',
    },
  ],
}

// Look up the pristine, factory + consensus template entry for a
// templateKey+category (ReminderRule.templateKey — one of the fixed logical
// keys above, NOT the per-vehicle id). The template lives here in code and is
// NEVER mutated, so this always returns the reference values even after the
// user sets a custom override or logs completed services. Used by
// resolveInterval(), the admin view, and later the reminder engine.
export function getTemplateEntry(
  templateKey: string,
  category: MaintenanceCategory,
): ScheduleTemplateEntry | undefined {
  return SCHEDULE_TEMPLATES[templateKey]?.find((e) => e.category === category)
}

// Build the initial ReminderRule set for one vehicle from a schedule template.
// Rule id is `${vehicleId}:${category}` so it's stable across re-seeds/imports
// and globally unique (vehicleId is). `templateKey` is what actually looks up
// the template — see the ReminderRule.templateKey doc comment in types.ts.
// Rules store NO interval of their own by default — the effective interval is
// resolved from the template (consensus ?? factory) unless the user sets a
// custom override. lastDone* start null (never serviced yet). Used by seed.ts
// (the two hand-seeded vehicles + backfill) and db/vehicleOnboarding.ts
// ("Add Car" vehicles, with GENERIC_TEMPLATE_KEY).
export function rulesForVehicle(vehicleId: string, templateKey: string): ReminderRule[] {
  const entries = SCHEDULE_TEMPLATES[templateKey] ?? []
  return entries.map((e) => ({
    id: `${vehicleId}:${e.category}`,
    vehicleId,
    templateKey,
    category: e.category,
    label: e.label ?? CATEGORY_LABELS[e.category],
    customIntervalMiles: null,
    customIntervalMonths: null,
    lastDoneDate: null,
    lastDoneMiles: null,
    override: null,
    notes: null,
    source: 'manufacturer-default',
  }))
}
