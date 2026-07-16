import { db } from './db'
import {
  computeVehicleReminders,
  DEFAULT_ANNUAL_MILEAGE,
  type ComputedReminder,
} from '../domain/reminderEngine'
import { getCurrentMileageEstimate } from './events'
import {
  estimateAnnualMileage,
  resolveAnnualMileage,
  type MileagePoint,
  type ResolvedAnnualMileage,
} from '../domain/mileage'
import {
  countByStatus,
  compareVehicleUrgency,
  vehicleBadges,
  HIGH_COST_REPAIR,
  RECENT_REPAIR_DAYS,
  type AttentionBadge,
  type ReminderCounts,
  type VehicleUrgency,
} from '../domain/vehicleRanking'
import { buildCostBreakdown, costPerMile, filterByYear, type CostBreakdown } from '../domain/cost'
import { vehicleLabel } from '../domain/vehicle'
import { getOpenConcerns } from './concerns'
import type { Concern, MaintenanceEvent, Vehicle } from '../types'

/** Full computed+ranked reminders list for a vehicle — shared by every page
 * that needs it (Vehicle Detail, the reminders debug panel, list/dashboard
 * status badges) so there's one query shape instead of several copies. */
export async function getVehicleReminders(vehicleId: string): Promise<ComputedReminder[]> {
  const [rules, events, readings, mileage, vehicle] = await Promise.all([
    db.reminderRules.where('vehicleId').equals(vehicleId).toArray(),
    db.events.where('vehicleId').equals(vehicleId).toArray(),
    db.odometerReadings.where('vehicleId').equals(vehicleId).toArray(),
    getCurrentMileageEstimate(vehicleId),
    db.vehicles.get(vehicleId),
  ])
  const annual = resolveAnnualMileage(
    vehicle?.annualMileageOverride ?? null,
    estimateAnnualMileage(mileagePoints(events, readings))?.annual ?? null,
    DEFAULT_ANNUAL_MILEAGE,
  )
  return computeVehicleReminders(rules, events, {
    currentMiles: mileage?.miles ?? null,
    odometerAsOfDate: mileage?.asOfDate ?? null,
    asOf: new Date(),
    annualMileage: annual.value,
  })
}

/** All odometer observations for a vehicle (readings + service events), as the
 * point set the annual-mileage estimator consumes. */
function mileagePoints(
  events: { date: string; odometerMiles: number }[],
  readings: { date: string; miles: number }[],
): MileagePoint[] {
  return [
    ...readings.map((r) => ({ date: r.date, miles: r.miles })),
    ...events.map((e) => ({ date: e.date, miles: e.odometerMiles })),
  ]
}

export interface VehicleAnnualMileage extends ResolvedAnnualMileage {
  /** History-derived estimate, or null when there isn't enough history yet. */
  calculated: number | null
  /** The user's manual override, or null when unset. */
  override: number | null
}

/** The effective average miles/year for a vehicle plus its inputs, for the
 * "Average mileage" control on Vehicle Detail (which value is in use and why). */
export async function getVehicleAnnualMileage(vehicleId: string): Promise<VehicleAnnualMileage> {
  const [events, readings, vehicle] = await Promise.all([
    db.events.where('vehicleId').equals(vehicleId).toArray(),
    db.odometerReadings.where('vehicleId').equals(vehicleId).toArray(),
    db.vehicles.get(vehicleId),
  ])
  const calculated = estimateAnnualMileage(mileagePoints(events, readings))?.annual ?? null
  const override = vehicle?.annualMileageOverride ?? null
  const resolved = resolveAnnualMileage(override, calculated, DEFAULT_ANNUAL_MILEAGE)
  return { ...resolved, calculated, override }
}

/** Total logged cost for a vehicle within a calendar year (default: this year). */
export async function getYearSpend(vehicleId: string, year = new Date().getFullYear()): Promise<number> {
  const events = await db.events.where('vehicleId').equals(vehicleId).toArray()
  const prefix = String(year)
  return events.filter((e) => e.date.startsWith(prefix)).reduce((sum, e) => sum + (e.cost || 0), 0)
}

// --- Cross-vehicle summary (Milestone 5) -----------------------------------

const ACTIONABLE = new Set(['overdue', 'due-next', 'watch-next'])
const ATTENTION_FEED_LIMIT = 8
// Cap each vehicle's contribution so the combined feed always represents BOTH
// vehicles rather than being flooded by one (e.g. a vehicle whose whole schedule
// is still baseline "due-next" because nothing's been logged yet). The per-
// vehicle card shows that vehicle's full detail anyway.
const ATTENTION_MAX_PER_VEHICLE = 3

export interface VehicleSummary {
  vehicle: Vehicle
  reminders: ComputedReminder[] // per-vehicle ranked (unchanged from the engine)
  /** Open triage concerns (Stage 2) — merged into the Today verdict. */
  openConcerns: Concern[]
  counts: ReminderCounts
  urgency: VehicleUrgency
  badges: AttentionBadge[]
  /** Most urgent actionable reminder (overdue/due-next/watch-next), else null. */
  topReminder: ComputedReminder | null
  /** The next few actionable reminders after the top one. */
  nextReminders: ComputedReminder[]
  recentServices: MaintenanceEvent[]
  recentRepairs: MaintenanceEvent[]
  recentHighCostRepair: MaintenanceEvent | null
  mileage: { miles: number; asOfDate: string; stale: boolean } | null
  milesThisYear: number | null
  spendThisYear: number
  spendAllTime: number
  documentCount: number
  lastActivityDate: string | null
}

export interface AttentionItem {
  ordinal: number
  priority: number
  vehicleId: string
  vehicleName: string
  tone: 'overdue' | 'due' | 'watch' | 'stale' | 'cost'
  title: string
  detail: string
}

export interface GarageSummary {
  year: number
  vehicles: VehicleSummary[] // ranked, most-urgent-first
  attention: AttentionItem[]
}

interface MilePoint {
  date: string
  miles: number
}

function later(a: MilePoint, b: MilePoint): MilePoint {
  return b.date > a.date || (b.date === a.date && b.miles > a.miles) ? b : a
}
function earlier(a: MilePoint, b: MilePoint): MilePoint {
  return b.date < a.date || (b.date === a.date && b.miles < a.miles) ? b : a
}

/** Best-effort estimate of miles driven so far this calendar year: current
 * mileage minus the mileage as-of the start of the year (last reading before
 * Jan 1). If there's no pre-year reading we fall back to the earliest reading
 * this year, i.e. "miles logged since the first entry this year". null when
 * there aren't enough distinct points to compute a delta. */
function milesThisYear(points: MilePoint[], year: number): number | null {
  if (points.length < 2) return null
  const latest = points.reduce(later)
  const yearStart = `${year}-01-01`
  const preYear = points.filter((p) => p.date < yearStart)
  const baseline = preYear.length ? preYear.reduce(later) : points.reduce(earlier)
  if (baseline === latest) return null
  const driven = latest.miles - baseline.miles
  return driven >= 0 ? driven : null
}

function daysSince(isoDate: string, asOf: Date): number {
  const then = new Date(`${isoDate}T00:00:00`).getTime()
  return Math.round((asOf.getTime() - then) / 86_400_000)
}

async function buildVehicleSummary(vehicle: Vehicle, year: number, asOf: Date): Promise<VehicleSummary> {
  const [reminders, events, readings, mileageEst, gloveboxDocCount, openConcerns] = await Promise.all([
    getVehicleReminders(vehicle.id),
    db.events.where('vehicleId').equals(vehicle.id).toArray(),
    db.odometerReadings.where('vehicleId').equals(vehicle.id).toArray(),
    getCurrentMileageEstimate(vehicle.id),
    db.documents.where('[linkedTo.type+linkedTo.id]').equals(['vehicle', vehicle.id]).count(),
    getOpenConcerns(vehicle.id),
  ])

  const byDateDesc = (a: MaintenanceEvent, b: MaintenanceEvent) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  const services = events.filter((e) => e.kind === 'maintenance').sort(byDateDesc)
  const repairs = events.filter((e) => e.kind === 'repair').sort(byDateDesc)

  // Recent high-cost repair: highest-cost repair within the recent window.
  let recentHighCostRepair: MaintenanceEvent | null = null
  for (const r of repairs) {
    if (daysSince(r.date, asOf) > RECENT_REPAIR_DAYS) continue
    if (!recentHighCostRepair || r.cost > recentHighCostRepair.cost) recentHighCostRepair = r
  }
  const recentRepairCost = recentHighCostRepair?.cost ?? 0

  const counts = countByStatus(reminders)
  const odometerStale = reminders[0]?.odometerStale ?? true

  const activityDates = [...events.map((e) => e.date), ...readings.map((r) => r.date)]
  const lastActivityDate = activityDates.length ? activityDates.reduce((m, d) => (d > m ? d : m)) : null

  const points: MilePoint[] = [
    ...events.map((e) => ({ date: e.date, miles: e.odometerMiles })),
    ...readings.map((r) => ({ date: r.date, miles: r.miles })),
  ]

  const actionable = reminders.filter((r) => ACTIONABLE.has(r.status))

  const urgency: VehicleUrgency = {
    counts,
    odometerStale,
    recentRepairCost: recentHighCostRepair && recentHighCostRepair.cost >= HIGH_COST_REPAIR ? recentRepairCost : 0,
    daysSinceLastActivity: lastActivityDate ? daysSince(lastActivityDate, asOf) : null,
  }

  return {
    vehicle,
    reminders,
    openConcerns,
    counts,
    urgency,
    badges: vehicleBadges(urgency),
    topReminder: actionable[0] ?? null,
    nextReminders: actionable.slice(1, 4),
    recentServices: services.slice(0, 2),
    recentRepairs: repairs.slice(0, 2),
    recentHighCostRepair: recentHighCostRepair && recentHighCostRepair.cost >= HIGH_COST_REPAIR ? recentHighCostRepair : null,
    mileage: mileageEst ? { miles: mileageEst.miles, asOfDate: mileageEst.asOfDate, stale: odometerStale } : null,
    milesThisYear: milesThisYear(points, year),
    spendThisYear: events.filter((e) => e.date.startsWith(`${year}-`)).reduce((s, e) => s + (e.cost || 0), 0),
    spendAllTime: events.reduce((s, e) => s + (e.cost || 0), 0),
    documentCount: events.reduce((n, e) => n + e.documentIds.length, 0) + gloveboxDocCount,
    lastActivityDate,
  }
}

/** Flatten the ranked per-vehicle summaries into one "what needs attention
 * first" feed. Priority tiers (lower = shown first): overdue < due-next <
 * stale odometer < watch-next < recent high-cost repair. Within a tier the feed
 * preserves the ranked vehicle/reminder order (ordinal), so it's deterministic. */
function buildAttentionFeed(summaries: VehicleSummary[]): AttentionItem[] {
  const items: AttentionItem[] = []
  let ordinal = 0

  for (const s of summaries) {
    // Gather this vehicle's candidate items, then keep only its most important
    // few (by priority) so it can't crowd the other vehicle out of the feed.
    const vItems: AttentionItem[] = []
    for (const r of s.reminders) {
      if (r.status === 'overdue') vItems.push(reminderItem(0, 'overdue', s, r, 0))
      else if (r.status === 'due-next') vItems.push(reminderItem(1, 'due', s, r, 0))
      else if (r.status === 'watch-next') vItems.push(reminderItem(3, 'watch', s, r, 0))
    }
    if (s.mileage?.stale || s.mileage == null) {
      vItems.push({
        ordinal: 0,
        priority: 2,
        vehicleId: s.vehicle.id,
        vehicleName: vehicleLabel(s.vehicle),
        tone: 'stale',
        title: 'Mileage estimate is stale',
        detail: s.mileage ? `last reading ${s.mileage.asOfDate}` : 'no odometer logged yet',
      })
    }
    if (s.recentHighCostRepair) {
      const rep = s.recentHighCostRepair
      vItems.push({
        ordinal: 0,
        priority: 4,
        vehicleId: s.vehicle.id,
        vehicleName: vehicleLabel(s.vehicle),
        tone: 'cost',
        title: rep.title,
        detail: `$${rep.cost.toFixed(2)} · ${rep.date}`,
      })
    }

    vItems.sort((a, b) => a.priority - b.priority)
    for (const it of vItems.slice(0, ATTENTION_MAX_PER_VEHICLE)) {
      items.push({ ...it, ordinal: ordinal++ })
    }
  }

  // Global sort: by priority, then ordinal (which preserves ranked-vehicle order
  // within a priority tier), so the feed is deterministic.
  items.sort((a, b) => a.priority - b.priority || a.ordinal - b.ordinal)
  return items.slice(0, ATTENTION_FEED_LIMIT)
}

function reminderItem(
  priority: number,
  tone: 'overdue' | 'due' | 'watch',
  s: VehicleSummary,
  r: ComputedReminder,
  ordinal: number,
): AttentionItem {
  return {
    ordinal,
    priority,
    vehicleId: s.vehicle.id,
    vehicleName: vehicleLabel(s.vehicle),
    tone,
    title: r.rule.label,
    detail: r.reason,
  }
}

/** Ranked cross-vehicle summary for the dashboard. Reads every table it needs
 * inside the caller's liveQuery, so it recomputes reactively on any change. */
export async function getGarageSummary(): Promise<GarageSummary> {
  const asOf = new Date()
  const year = asOf.getFullYear()
  const vehicles = await db.vehicles.orderBy('name').toArray()
  const summaries = await Promise.all(vehicles.map((v) => buildVehicleSummary(v, year, asOf)))

  summaries.sort(
    (a, b) => compareVehicleUrgency(a.urgency, b.urgency) || a.vehicle.name.localeCompare(b.vehicle.name),
  )

  return { year, vehicles: summaries, attention: buildAttentionFeed(summaries) }
}

// --- Cost summary (Milestone 11) -------------------------------------------

export interface VehicleCostSummary {
  vehicle: Vehicle
  allTime: CostBreakdown
  thisYear: CostBreakdown
  currentMiles: number | null
  /** Miles driven since the earliest logged odometer point (event or reading);
   * null when there isn't a positive span to divide by. */
  milesTracked: number | null
  /** All-time spend per mile over `milesTracked`; null when unknown. */
  costPerMile: number | null
}

export interface GarageCostSummary {
  year: number
  vehicles: VehicleCostSummary[]
  /** All-time spend across every vehicle. */
  grandTotal: number
}

async function buildVehicleCostSummary(vehicle: Vehicle, year: number): Promise<VehicleCostSummary> {
  const [events, readings, mileageEst] = await Promise.all([
    db.events.where('vehicleId').equals(vehicle.id).toArray(),
    db.odometerReadings.where('vehicleId').equals(vehicle.id).toArray(),
    getCurrentMileageEstimate(vehicle.id),
  ])

  const allTime = buildCostBreakdown(events)
  const thisYear = buildCostBreakdown(filterByYear(events, year))

  const currentMiles = mileageEst?.miles ?? null
  const odoPoints = [...events.map((e) => e.odometerMiles), ...readings.map((r) => r.miles)].filter(
    (m): m is number => typeof m === 'number' && !Number.isNaN(m),
  )
  const baselineMiles = odoPoints.length ? Math.min(...odoPoints) : null
  const milesTracked =
    currentMiles != null && baselineMiles != null && currentMiles > baselineMiles
      ? currentMiles - baselineMiles
      : null

  return {
    vehicle,
    allTime,
    thisYear,
    currentMiles,
    milesTracked,
    costPerMile: costPerMile(allTime.total, milesTracked),
  }
}

/** Cross-vehicle cost summary for the Costs page. Reads events + odometer inside
 * the caller's liveQuery, so it recomputes reactively when anything is logged. */
export async function getGarageCostSummary(): Promise<GarageCostSummary> {
  const year = new Date().getFullYear()
  const vehicles = await db.vehicles.orderBy('name').toArray()
  const summaries = await Promise.all(vehicles.map((v) => buildVehicleCostSummary(v, year)))
  const grandTotal = summaries.reduce((sum, v) => sum + v.allTime.total, 0)
  return { year, vehicles: summaries, grandTotal }
}
