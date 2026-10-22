import type { MaintenanceCategory, MilestoneRecord, Vehicle } from '../types'

// Milestone checkups (30k / 60k / 90k / 100k / 120k / 150k, then every 30k):
// vehicle-wide inspect / replace / fluid / test checklists, tailored to the
// car's components. Pure: no DOM, no Dexie. Unit-tested in tests/milestones.test.ts.
//
// These are GENERAL industry guidance, not a manufacturer schedule. Checking
// an item here never updates a ReminderRule's lastDone by itself; items that
// match a schedule category (MILESTONE_ITEM_CATEGORY) get a "Log to schedule"
// button that logs a real service through the normal event path. The UI
// points to the owner's manual. Components are inferred only from data the app already
// holds (engine/drivetrain text + which schedule categories the vehicle has),
// never guessed from the model name.

export type MilestoneAction = 'inspect' | 'replace' | 'fluids' | 'test'

export const ACTION_LABELS: Record<MilestoneAction, string> = {
  inspect: 'Inspect',
  replace: 'Replace',
  fluids: 'Fluids',
  test: 'Test & adjust',
}

export interface MilestoneItem {
  /** Stable id (persisted in MilestoneRecord.checked). Never rename one. */
  id: string
  action: MilestoneAction
  label: string
  /** Optional one-line context shown under the label. */
  hint?: string
}

export interface ComponentProfile {
  turbo: boolean
  /** Has a transfer case and/or front+rear differentials (4WD/AWD). */
  fourWheel: boolean
  /** Front-wheel drive or AWD: CV axles/boots. */
  cvAxles: boolean
  /** RWD or 4WD: a driveshaft with U-joints. */
  driveshaft: boolean
  cvt: boolean
  /** Conventional automatic (has a transmission-fluid schedule item). */
  automatic: boolean
}

/**
 * Infer the components that change a checklist. Engine/drivetrain are free
 * text (seeded or VIN-decoded); schedule categories come from the vehicle's
 * reminder rules, which are curated per vehicle in scheduleTemplates.ts.
 */
export function componentProfile(
  vehicle: Pick<Vehicle, 'engine' | 'drivetrain'>,
  categories: Iterable<MaintenanceCategory>,
): ComponentProfile {
  const cats = new Set(categories)
  const engine = (vehicle.engine ?? '').toLowerCase()
  const drive = (vehicle.drivetrain ?? '').toLowerCase()
  const is4wd = /\b(4wd|4x4)\b/.test(drive)
  const isAwd = /\bawd\b/.test(drive)
  const isFwd = /\bfwd\b/.test(drive)
  const isRwd = /\b(rwd|2wd|4x2)\b/.test(drive)
  const fourWheel = is4wd || isAwd || cats.has('transfer-case-fluid')
  return {
    turbo: /turbo|ecoboost|\btsi\b|\bt-gdi\b/.test(engine),
    fourWheel,
    cvAxles: isFwd || isAwd,
    driveshaft: is4wd || isRwd || (fourWheel && !isAwd),
    cvt: cats.has('cvt-fluid') || /\bcvt\b/.test(drive),
    automatic: cats.has('transmission-fluid'),
  }
}

/**
 * Checklist items that match a schedule category, so the checkup page can
 * offer "Log to schedule". Only items whose work resets that schedule item:
 * an inspect-only item maps to an inspection category, never to a
 * replacement (the timing check is not a timing-belt job).
 */
export const MILESTONE_ITEM_CATEGORY: Partial<Record<string, MaintenanceCategory>> = {
  brakes: 'brake-inspection',
  'tires-suspension': 'tire-inspection',
  'oil-filter': 'oil-change',
  'engine-air-filter': 'engine-air-filter',
  'cabin-air-filter': 'cabin-air-filter',
  battery: 'battery-check',
  'tire-rotation': 'tire-rotation',
  'brake-fluid': 'brake-fluid',
  'cvt-fluid': 'cvt-fluid',
  'transmission-fluid': 'transmission-fluid',
  'transfer-case': 'transfer-case-fluid',
  differentials: 'differential-fluid',
  'spark-plugs-turbo': 'spark-plugs',
  'spark-plugs': 'spark-plugs',
  alignment: 'wheel-alignment',
  'serpentine-belt': 'serpentine-belt',
}

/**
 * How much an item matters, so people who do the minimum still do these.
 * Shown as a word label only: red/amber stay reserved for status.
 */
export type MilestoneLevel = 'safety' | 'important'

export const MILESTONE_ITEM_LEVEL: Partial<Record<string, MilestoneLevel>> = {
  brakes: 'safety',
  'tires-suspension': 'safety',
  'brake-fluid': 'safety',
  timing: 'safety',
  'lights-wipers': 'safety',
  'oil-filter': 'important',
  coolant: 'important',
  'transmission-fluid': 'important',
  'cvt-fluid': 'important',
  battery: 'important',
  'serpentine-belt': 'important',
  'tire-rotation': 'important',
}

const LEVEL_RANK: Record<MilestoneLevel | 'none', number> = { safety: 0, important: 1, none: 2 }

/** Safety items first, then important, then the rest; stable within a level. */
export function sortByLevel(items: MilestoneItem[]): MilestoneItem[] {
  const rank = (i: MilestoneItem) => LEVEL_RANK[MILESTONE_ITEM_LEVEL[i.id] ?? 'none']
  return [...items].sort((a, b) => rank(a) - rank(b))
}

/**
 * Items whose "Checked, OK" is itself the scheduled job: the schedule item
 * is an inspection, so a shop looking and finding it good resets it.
 */
export const INSPECTION_ITEMS = new Set(['brakes', 'tires-suspension', 'battery'])

/** The milestone mileages up to `upTo`: 30k steps, plus the 100k major service. */
export function milestoneMileages(upTo: number): number[] {
  const out: number[] = []
  for (let m = 30_000; m <= Math.max(upTo, 150_000); m += 30_000) out.push(m)
  out.push(100_000)
  return out.sort((a, b) => a - b)
}

/** "100k checkup" style short name. */
export function milestoneName(miles: number): string {
  return `${Math.round(miles / 1000)}k checkup`
}

/**
 * Tier of a milestone: every one gets the base checkup; every 60k adds the
 * drivetrain fluid services; 100k (and every 100k after) is the major
 * service; 150k adds high-mileage wear items. 90k adds a timing-belt check.
 */
function tiers(miles: number) {
  return {
    sixty: miles % 60_000 === 0,
    ninety: miles % 90_000 === 0,
    major: miles % 100_000 === 0,
    high: miles >= 150_000 && miles % 150_000 === 0,
  }
}

export function buildMilestoneChecklist(miles: number, p: ComponentProfile): MilestoneItem[] {
  const t = tiers(miles)
  const items: MilestoneItem[] = []
  const add = (id: string, action: MilestoneAction, label: string, hint?: string) =>
    items.push({ id, action, label, hint })

  // --- every milestone ----------------------------------------------------
  add('brakes', 'inspect', 'Brake pads, rotors, lines & hoses')
  add('tires-suspension', 'inspect', 'Tires, suspension & steering components', 'Tread depth, wear pattern, ball joints, tie rods')
  add('belts-hoses', 'inspect', 'Drive belt & coolant hoses', 'Cracks, glazing, soft or swollen hoses')
  add('exhaust', 'inspect', 'Exhaust system & heat shields')
  add('lights-wipers', 'inspect', 'Lights, horn, wipers & washer')
  if (p.cvAxles) add('cv-boots', 'inspect', 'CV axle boots', 'Torn boots let grease out and grit in')
  if (p.driveshaft) add('driveshaft', 'inspect', 'Driveshaft & U-joints')
  if (p.turbo) add('turbo-intake', 'inspect', 'Turbo intake & intercooler hoses', 'Look for oil residue or loose clamps')
  add('oil-filter', 'replace', 'Engine oil & filter')
  add('engine-air-filter', 'replace', 'Engine air filter')
  add('cabin-air-filter', 'replace', 'Cabin air filter')
  add('fluid-levels', 'fluids', 'Top off & check condition of all fluids', 'Coolant, brake, washer, power steering if equipped')
  add('battery', 'test', 'Battery & charging system test')
  add('tire-rotation', 'test', 'Rotate tires & set pressures')

  // --- 60k: drivetrain fluids --------------------------------------------
  if (t.sixty || t.major) {
    add('brake-fluid', 'fluids', 'Brake fluid flush', 'Brake fluid absorbs water over time')
    if (p.cvt) add('cvt-fluid', 'fluids', 'CVT fluid change', 'Many shops recommend 30k–60k even when the maker says "lifetime"')
    else if (p.automatic) add('transmission-fluid', 'fluids', 'Automatic transmission fluid service')
    if (p.fourWheel) {
      add('transfer-case', 'fluids', 'Transfer case fluid')
      add('differentials', 'fluids', 'Front & rear differential fluid')
    }
    if (p.turbo) add('spark-plugs-turbo', 'replace', 'Spark plugs', 'Turbocharged engines are often due by ~60k')
    add('alignment', 'test', 'Wheel alignment check')
  }

  // --- 90k: timing check ---------------------------------------------------
  if (t.ninety) {
    add('timing', 'inspect', 'Timing belt or chain', 'Belt engines: replacement window is often 90k–105k')
  }

  // --- 100k major ------------------------------------------------------------
  if (t.major) {
    if (!p.turbo) add('spark-plugs', 'replace', 'Spark plugs', 'Long-life iridium plugs are usually ~100k')
    add('coolant', 'fluids', 'Engine coolant replacement')
    add('serpentine-belt', 'replace', 'Serpentine / drive belt')
    add('pcv', 'replace', 'PCV valve', 'Cheap part; a clogged one causes oil leaks')
    add('throttle-body', 'test', 'Clean throttle body & check idle')
    add('shocks-struts', 'inspect', 'Shocks & struts', 'Bouncing, nose-dive under braking, leaks')
    add('engine-mounts', 'inspect', 'Engine & transmission mounts')
    add('oil-leaks', 'inspect', 'Oil & fluid leaks (valve cover, pan, seals)')
    if (!t.ninety) add('timing', 'inspect', 'Timing belt or chain', 'Belt engines: replacement window is often 90k–105k')
  }

  // --- 150k high-mileage -----------------------------------------------------
  if (t.high) {
    add('o2-sensors', 'test', 'Oxygen sensors & check-engine codes')
    add('fuel-system', 'inspect', 'Fuel pump, lines & injectors', 'Hard starts or hesitation are early signs')
    add('cooling-system', 'test', 'Cooling system pressure test, water pump & radiator')
    add('suspension-bushings', 'inspect', 'Suspension bushings & control arms')
  }

  return items
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type MilestoneState = 'done' | 'skipped' | 'due' | 'upcoming' | 'missed'

/** Within this many miles of a milestone (either side) it reads as "due". */
export const MILESTONE_DUE_WINDOW = 3_000
/** Passed by more than this and never recorded: "missed" (earlier history). */
export const MILESTONE_MISSED_AFTER = 10_000

export function milestoneState(
  miles: number,
  currentMiles: number | null,
  record: MilestoneRecord | undefined,
): MilestoneState {
  if (record?.completedDate) return 'done'
  if (record?.skipped) return 'skipped'
  if (currentMiles == null) return 'upcoming'
  if (currentMiles > miles + MILESTONE_MISSED_AFTER) return 'missed'
  if (currentMiles >= miles - MILESTONE_DUE_WINDOW) return 'due'
  return 'upcoming'
}

export interface MilestoneView {
  miles: number
  name: string
  state: MilestoneState
  /** Miles until the milestone (negative once passed); null without mileage. */
  milesAway: number | null
  checkedCount: number
  totalCount: number
}

/**
 * Every milestone for a vehicle with its state, oldest first, plus the one to
 * surface ("next"): the due one, else the first upcoming one. When a later
 * milestone is due, done or skipped, any earlier still-due one becomes
 * "missed" (the newer checkup supersedes it). Missed, skipped and done never become "next".
 */
export function milestoneOverview(
  currentMiles: number | null,
  profile: ComponentProfile,
  records: Record<string, MilestoneRecord> | undefined,
): { all: MilestoneView[]; next: MilestoneView | null } {
  const all: MilestoneView[] = milestoneMileages((currentMiles ?? 0) + 30_000).map((miles) => {
    const record = records?.[String(miles)]
    const items = buildMilestoneChecklist(miles, profile)
    const ids = new Set(items.map((i) => i.id))
    return {
      miles,
      name: milestoneName(miles),
      state: milestoneState(miles, currentMiles, record),
      milesAway: currentMiles == null ? null : miles - currentMiles,
      checkedCount: new Set([...(record?.checked ?? []), ...(record?.serviced ?? [])].filter((id) => ids.has(id))).size,
      totalCount: items.length,
    }
  })
  // A later milestone that is due, done or skipped supersedes earlier ones.
  let latestReached = -1
  all.forEach((m, i) => {
    if (m.state === 'due' || m.state === 'done' || m.state === 'skipped') latestReached = i
  })
  all.forEach((m, i) => {
    if (m.state === 'due' && i < latestReached) m.state = 'missed'
  })
  const next = all.find((m) => m.state === 'due') ?? all.find((m) => m.state === 'upcoming') ?? null
  return { all, next }
}

export function milestoneHref(vehicleId: string, miles: number): string {
  return `#/milestone/${vehicleId}/${miles}`
}
