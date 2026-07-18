// Shared data model for Garage Log.
//
// Milestone 1 only stores Vehicles. The other interfaces + tables are defined
// now so the Dexie schema is stable and later milestones (events, reminders,
// documents, backup) can start writing without a schema migration.

export interface Vehicle {
  id: string
  name: string // short label, e.g. "F-150 STX" (the seeded identity)
  nickname?: string // optional user label shown instead of `name` when set
  year: number
  make: string
  model: string
  trim: string
  engine: string
  drivetrain: string
  vin?: string
  // Stable key for this exact year/make/model/trim, shared by every vehicle
  // record with the same identity -> lets fetched factory/consensus data be
  // cached and reused instead of re-fetched per vehicle. See
  // domain/vehicleIdentity.ts. Unset for the two hand-seeded vehicles.
  canonicalVehicleId?: string
  // Optional user-set average miles/year. When present it overrides the value
  // calculated from logged history for due-date projections (see
  // domain/mileage.ts). Non-indexed/optional — no schema bump. Null/undefined =
  // use the calculated average (or a default when there isn't enough history).
  annualMileageOverride?: number
  photoId?: string // -> VehicleDocument.id (set in a later milestone)
  createdAt: string // ISO timestamp
}

// The resolved identity of a specific year/make/model/trim, either decoded
// from a VIN (services/vinDecode.ts) or entered manually. `canonicalVehicleId`
// is a deterministic key (domain/vehicleIdentity.ts) used to key the cached
// external datasets below, independent of which physical vehicle/VIN it came
// from.
export interface VehicleIdentity {
  vin?: string
  year: number
  make: string
  model: string
  trim: string
  style?: string
  canonicalVehicleId: string
}

// Settled fetch outcome for one external dataset. 'loading' is written to the
// DB immediately (before the network call resolves) so the UI reacts without
// any extra in-memory reactive plumbing on top of Dexie's liveQuery.
export type ExternalDataStatus = 'loading' | 'ok' | 'error'

export interface FactoryMaintenanceItem {
  category: MaintenanceCategory
  label: string
  interval: Interval
}

// Cached per canonicalVehicleId (primary key) — NOT per vehicle row, so two
// vehicles that resolve to the same identity reuse one fetch. This is
// reference/sample data only; it is never wired into ReminderRule/the
// reminders engine (see db/vehicleOnboarding.ts header).
export interface FactoryMaintenanceData {
  canonicalVehicleId: string
  status: ExternalDataStatus
  items: FactoryMaintenanceItem[]
  source: string
  fetchedAt: string | null // ISO timestamp of last successful fetch
  error?: string
}

export interface ConsensusIssue {
  title: string
  description: string
}

// Cached per canonicalVehicleId, same reuse rationale as FactoryMaintenanceData.
export interface ConsensusData {
  canonicalVehicleId: string
  status: ExternalDataStatus
  summary: string
  commonIssues: ConsensusIssue[]
  source: string
  fetchedAt: string | null
  error?: string
}

export interface OdometerReading {
  id: string
  vehicleId: string
  date: string // ISO date
  miles: number
  source: 'quick-log' | 'event'
}

// 'maintenance' = routine scheduled service (ties into the reminders engine via
// category); 'repair' = unscheduled fix. Both share one table/type — same
// history list, same document attachments, same category-matching for the
// reminder rules — only the form fields shown to the user differ by kind.
export type EventKind = 'maintenance' | 'repair'

export type PerformedBy = 'dealer' | 'independent-shop' | 'diy' | 'other'

export const PERFORMED_BY_LABELS: Record<PerformedBy, string> = {
  dealer: 'Dealer',
  'independent-shop': 'Independent shop',
  diy: 'DIY',
  other: 'Other',
}

export interface MaintenanceEvent {
  id: string
  vehicleId: string
  kind: EventKind
  date: string // ISO date
  odometerMiles: number
  category: MaintenanceCategory // PRIMARY category — drives title, cost attribution, display
  // Other categories this same visit also covered (e.g. a Valvoline oil change
  // that also did a multi-point inspection + battery check + fluid top-off).
  // Optional/non-indexed (no schema bump); missing = just [category]. Cost stays
  // on the primary `category` only, so these never double-count spend — but they
  // DO refresh their matching reminder rules' "last done" (see matchesRule /
  // effectiveCategories). Never includes `category` itself; deduped.
  additionalCategories?: MaintenanceCategory[]
  title: string
  cost: number
  vendor?: string
  notes?: string
  documentIds: string[] // -> VehicleDocument.id[]

  // Maintenance-specific (optional; populated by the service form).
  servicePerformed?: string
  parts?: string
  fluids?: string
  performedBy?: PerformedBy

  // Repair-specific (optional; populated by the repair form). `parts` above is
  // shared between both forms.
  symptom?: string
  diagnosis?: string
  fix?: string
  labor?: string
}

export interface VehicleDocument {
  id: string
  blob: Blob // stored natively in IndexedDB, no base64 at rest
  mimeType: string
  filename: string
  sizeBytes: number // size of the stored blob (post-compression when optimized)
  createdAt: string
  linkedTo: { type: 'event' | 'vehicle'; id: string }
  // Set when the upload was re-encoded/downscaled to save space (Milestone 7).
  // `sizeBytes` is then the compressed size and `originalSizeBytes` the pre-
  // compression size, so the UI can show how much was saved.
  optimized?: boolean
  originalSizeBytes?: number
  // Free-form organizational labels (Milestone 7). Lowercased, deduped. Optional
  // and non-indexed — searched/filtered in memory by the documents browser.
  tags?: string[]
}

// A mileage/time interval. Either bound may be null; whichever threshold is
// reached first makes an item due. `conditionBased` marks items with no fixed
// interval (e.g. wheel alignment) — inspect/replace by condition instead.
export interface Interval {
  miles: number | null
  months: number | null
  conditionBased?: boolean
}

// A per-vehicle instance of a maintenance item. Seeded from the static schedule
// template (see db/scheduleTemplates.ts) but holds all the MUTABLE per-vehicle
// state: an optional custom interval override, the last-done point, and any
// manual status override/notes. The template (factory + mechanic-consensus
// intervals) stays untouched in code, so both references are always recoverable.
//
// Effective interval = custom override ?? mechanic-consensus ?? factory
// (computed by resolveInterval() in domain/reminderStatus.ts).
export interface ReminderRule {
  id: string // `${vehicleId}:${category}` — stable across re-seed/import
  vehicleId: string
  // Key into SCHEDULE_TEMPLATES/getTemplateEntry() (db/scheduleTemplates.ts).
  // Decoupled from `vehicleId` because vehicle ids are per-user-unique
  // (required for Dexie Cloud sync), while the schedule template a vehicle
  // draws from is one of the fixed logical templates ('f150-2020',
  // 'rogue-2020') shared across every user who owns that model.
  templateKey: string
  category: MaintenanceCategory // matches MaintenanceEvent.category for auto-linking
  label: string
  // The user's custom interval override ("customOverrideInterval"). Both null =
  // no override; effective interval then falls back to consensus, then factory.
  // The template's factory & consensus values are never overwritten.
  customIntervalMiles: number | null
  customIntervalMonths: number | null
  // Last time this item was performed. Populated from service history / the
  // "already-replaced" override; drives the future due-date calculation.
  lastDoneDate: string | null
  lastDoneMiles: number | null
  // Manual status override + free-text note (see RuleOverride). null = none.
  override: RuleOverride | null
  notes: string | null
  source: 'manufacturer-default' | 'user-added'
}

// Manual overrides a user can place on a rule. These are inputs the reminder
// engine (Milestone 4) will read; they are NOT the computed status.
//   already-replaced        -> counts as done (usually with a date/mileage)
//   dealer-performed / diy   -> informational tag on how it's serviced
//   inspect-next-oil-change  -> surface as a "check" item at next oil change
//   replace-at-next-interval -> user intends to replace at the next due point
//   not-needed               -> not applicable to this vehicle (status: N/A)
export type OverrideKind =
  | 'already-replaced'
  | 'dealer-performed'
  | 'diy'
  | 'inspect-next-oil-change'
  | 'replace-at-next-interval'
  | 'not-needed'

export interface RuleOverride {
  kind: OverrideKind
  note: string | null
  // Optional "when last done" for already-replaced (feeds lastDone*).
  atDate: string | null
  atMiles: number | null
}

export const OVERRIDE_LABELS: Record<OverrideKind, string> = {
  'already-replaced': 'Already replaced',
  'dealer-performed': 'Dealer performed',
  diy: 'DIY',
  'inspect-next-oil-change': 'Inspect at next oil change',
  'replace-at-next-interval': 'Replace at next interval',
  'not-needed': 'Not needed for this vehicle',
}

// The five display states the reminder engine (Milestone 4) will compute per
// rule by comparing lastDone* + interval + override against the current date and
// odometer. Defined here now so the UI and engine share one vocabulary; nothing
// computes these yet.
export type MaintenanceStatus =
  | 'completed' // done within its interval (already completed)
  | 'watch-next' // approaching due within the lead window
  | 'due-next' // at/near due now
  | 'overdue' // past due
  | 'not-applicable' // override: not-needed

export const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  completed: 'Completed',
  'watch-next': 'Watch next',
  'due-next': 'Due next',
  overdue: 'Overdue',
  'not-applicable': 'Not applicable',
}

// A triage concern raised via the Coast "Start a check" flow (Stage 2 of the
// Coast migration — see design/COAST-PLAN.md). Captures the verdict a driver
// reached so it can sit on their list until it's handled. This is USER DATA and
// syncs across devices, so `id` must be globally unique (concern-<uuid>), like
// vehicle ids — see db/concerns.ts. Deliberately NOT wired into the reminder
// engine: concerns are reactive triage items, kept alongside (not merged into)
// the schedule-driven ReminderRule state.
export interface Concern {
  id: string // `concern-<uuid>` — globally unique for Dexie Cloud sync
  vehicleId: string
  createdDate: string // ISO date
  playbookId: string // -> domain/playbooks.ts Playbook.id
  outcomeId: string // -> the resolved PlaybookOutcome.id
  answers: Record<string, string> // the triage answers that produced the verdict
  band: MaintenanceSignalBand // snapshot of the verdict band at creation
  title: string // snapshot of the outcome title (survives playbook edits)
  category: MaintenanceCategory | null // best-guess category, for display/linking
  status: 'open' | 'resolved'
  resolvedDate: string | null
  // If resolved by logging a repair, the event it was resolved with (optional).
  resolvedEventId?: string
}

// The four-signal verdict vocabulary, defined here so types.ts stays the single
// source of the data model. domain/verdict.ts re-exports it as `SignalBand`.
export type MaintenanceSignalBand = 'fix-now' | 'book-soon' | 'coast' | 'all-clear'

// Simple key/value bag for app-level state (last backup date, schema version, etc.)
export interface AppMetaRecord {
  key: string
  value: unknown
}

// Controlled maintenance-category vocabulary shared by MaintenanceEvent.category
// and ReminderRule.category. Logging an event with one of these categories will
// (in a later milestone) auto-update the matching rule's "last done" fields.
// `other` is the free-text escape hatch. Kept as plain strings so the DB fields
// stay `string` and unknown legacy values never break.
export const MAINTENANCE_CATEGORIES = [
  'oil-change',
  'tire-rotation',
  'tire-replacement',
  'tire-balancing',
  'tire-inspection',
  'wheel-alignment',
  'engine-air-filter',
  'cabin-air-filter',
  'brake-fluid',
  'brake-inspection',
  'coolant',
  'transmission-fluid',
  'cvt-fluid',
  'spark-plugs',
  'timing-belt',
  'serpentine-belt',
  'fuel-filter',
  'power-steering-fluid',
  'transfer-case-fluid',
  'differential-fluid',
  'battery-check',
  'wiper-blades',
  'multi-point-inspection',
  'other',
] as const

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number]

// The full set of categories a single event covers: its primary `category`
// plus any `additionalCategories`, deduped and primary-first. This is what the
// reminder engine matches against so ONE logged multi-service visit refreshes
// every rule it touched. Pure; safe to call on any event-shaped object.
export function effectiveCategories(
  event: Pick<MaintenanceEvent, 'category' | 'additionalCategories'>,
): MaintenanceCategory[] {
  const seen = new Set<MaintenanceCategory>([event.category])
  for (const c of event.additionalCategories ?? []) seen.add(c)
  return [...seen]
}

// Human-friendly labels for each category (used in dropdowns and lists).
export const CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  'oil-change': 'Engine oil & filter',
  'tire-rotation': 'Tire rotation',
  'tire-replacement': 'Tire replacement',
  'tire-balancing': 'Tire balancing',
  'tire-inspection': 'Tire inspection',
  'wheel-alignment': 'Wheel alignment',
  'engine-air-filter': 'Engine air filter',
  'cabin-air-filter': 'Cabin air filter',
  'brake-fluid': 'Brake fluid',
  'brake-inspection': 'Brake inspection',
  coolant: 'Engine coolant',
  'transmission-fluid': 'Transmission fluid',
  'cvt-fluid': 'CVT fluid',
  'spark-plugs': 'Spark plugs',
  'timing-belt': 'Timing belt',
  'serpentine-belt': 'Serpentine / drive belt',
  'fuel-filter': 'Fuel filter',
  'power-steering-fluid': 'Power steering fluid',
  'transfer-case-fluid': 'Transfer case fluid',
  'differential-fluid': 'Differential / axle fluid',
  'battery-check': 'Battery & charging check',
  'wiper-blades': 'Wiper blades',
  'multi-point-inspection': 'Multi-point inspection',
  other: 'Other',
}
