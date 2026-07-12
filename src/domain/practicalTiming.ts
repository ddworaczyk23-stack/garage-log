import type { Interval, MaintenanceCategory } from '../types'

// Heuristic "real-world timing" layer, independent of any specific vehicle or
// provider. Distinct from FactoryMaintenanceData (manufacturer-published) and
// ConsensusData (crowd-sourced issue text) — this is app-internal reasoning
// applied uniformly by category, used only for the onboarded-vehicle cost/
// timing reference card (db/vehicleOnboarding.ts's hydrateCostEstimates).
// Never written into ReminderRule/the reminders engine — same scope boundary
// as the rest of the onboarding external-data cards. Mirrors the same
// longevity-focused reasoning as the two curated SCHEDULE_TEMPLATES entries
// (db/scheduleTemplates.ts's mechanicConsensusInterval) but as a general
// per-category formula so it applies to any vehicle, not just the two
// hand-curated ones.

interface TimingHeuristic {
  milesFactor?: number // multiplies the factory miles interval when set
  monthsFactor?: number
  rationale: string
}

const TIMING_HEURISTICS: Partial<Record<MaintenanceCategory, TimingHeuristic>> = {
  'oil-change': {
    milesFactor: 0.6,
    monthsFactor: 0.6,
    rationale:
      'Short trips, heat, and stop-and-go driving degrade oil well before the factory max — a shorter interval is the durable-ownership default.',
  },
  'tire-rotation': {
    milesFactor: 0.6,
    rationale: 'Rotating roughly every other oil change evens tread wear better than stretching to the factory interval.',
  },
  'transmission-fluid': {
    milesFactor: 0.5,
    rationale: '"Lifetime" fluid claims assume mild use — a proactive change well before that point is common consensus guidance.',
  },
  'cvt-fluid': {
    milesFactor: 0.4,
    rationale: 'CVTs are especially sensitive to fluid condition; consensus guidance runs meaningfully shorter than most factory schedules.',
  },
  coolant: {
    milesFactor: 0.75,
    rationale: 'Long-life coolant still benefits from an earlier check/change than the factory maximum in most ownership patterns.',
  },
  'brake-fluid': {
    monthsFactor: 0.65,
    rationale: 'Brake fluid absorbs moisture over time regardless of mileage — a time-based change earlier than factory is common guidance.',
  },
}

const DEFAULT_RATIONALE = 'No category-specific adjustment — using the factory interval as the practical default.'

/**
 * Applies the heuristic timing adjustment to a factory interval. Rounds miles
 * to the nearest 500 so results read like a real schedule, not raw math.
 */
export function practicalInterval(factory: Interval, category: MaintenanceCategory): { interval: Interval; note: string } {
  if (factory.conditionBased) {
    return { interval: factory, note: 'Condition-based — inspect and service as needed rather than on a fixed schedule.' }
  }
  const h = TIMING_HEURISTICS[category]
  if (!h) return { interval: factory, note: DEFAULT_RATIONALE }

  const miles =
    factory.miles != null && h.milesFactor != null ? Math.round((factory.miles * h.milesFactor) / 500) * 500 : factory.miles
  const months =
    factory.months != null && h.monthsFactor != null ? Math.max(1, Math.round(factory.months * h.monthsFactor)) : factory.months

  return { interval: { miles, months }, note: h.rationale }
}
