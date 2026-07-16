import type { ComputedReminder } from './reminderEngine'
import type { MaintenanceStatus } from '../types'
import { formatMiles, formatShortDate } from './format'

// ---------------------------------------------------------------------------
// Coast verdict layer (Stage 1 of the Coast migration — see design/COAST-PLAN.md).
//
// Pure re-narration of the reminder engine's output: it never re-decides a
// status, it only translates the ranked ComputedReminder list into the
// four-signal verdict vocabulary and one plain-English sentence per vehicle.
// The engine's 5-state MaintenanceStatus maps onto four signal bands:
//   overdue    -> 'fix-now'    (red)
//   due-next   -> 'book-soon'  (amber)
//   watch-next -> 'coast'      (blue — the brand signal: "you can coast")
//   completed  -> 'all-clear'  (green)
//   not-applicable is excluded entirely.
// No DOM, no Dexie, no I/O — unit-tested in tests/verdict.test.ts.
// ---------------------------------------------------------------------------

export type SignalBand = 'fix-now' | 'book-soon' | 'coast' | 'all-clear'

export const BAND_LABELS: Record<SignalBand, string> = {
  'fix-now': 'Fix now',
  'book-soon': 'Book soon',
  coast: 'Can coast',
  'all-clear': 'All clear',
}

/** Band for a single engine status; null = excluded from verdicts. */
export function bandFromStatus(s: MaintenanceStatus): SignalBand | null {
  switch (s) {
    case 'overdue':
      return 'fix-now'
    case 'due-next':
      return 'book-soon'
    case 'watch-next':
      return 'coast'
    case 'completed':
      return 'all-clear'
    case 'not-applicable':
      return null
  }
}

/** One deferred-but-tracked item for the "can coast" list. */
export interface CoastItem {
  label: string
  /** Plain window text, e.g. "in ~1,200 mi" or "by Oct 2026". */
  window: string
}

export interface VehicleVerdict {
  band: SignalBand
  /** The sign: short, declarative. e.g. "One thing to book soon." */
  headline: string
  /** The human voice: one serif sentence explaining the sign. */
  sentence: string
  /** Marker position on the 4-zone urgency ruler, 0 (worst) .. 100 (clear). */
  rulerPin: number
  /** e.g. "Safe window: about 3 weeks of normal driving." null when n/a. */
  safeWindow: string | null
  coastItems: CoastItem[]
  /** Odometer caveat ("no reading on file" / "estimate is stale"), else null. */
  confidenceNote: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-04" -> "Sep 2026" (month precision — verdicts promise windows, not days). */
function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  if (!m) return null
  const month = Number(m[2]) - 1
  if (month < 0 || month > 11) return null
  return `${MONTHS[month]} ${m[1]}`
}

/** Days rendered as the unit a person would say: days under 2 weeks, else weeks/months. */
function daysAsSpeech(days: number): string {
  const abs = Math.abs(days)
  if (abs < 14) return `${abs} day${abs === 1 ? '' : 's'}`
  if (abs < 75) return `about ${Math.round(abs / 7)} weeks`
  return `about ${Math.round(abs / 30)} months`
}

/** "in ~400 mi (around Sep 2026)" / "by Sep 2026" / null when nothing numeric. */
function windowText(r: ComputedReminder): string | null {
  const date = monthYear(r.dueAtDate ?? r.projectedDueDate)
  if (r.milesRemaining != null && r.milesRemaining > 0) {
    return `in ~${formatMiles(r.milesRemaining)}${date ? ` (around ${date})` : ''}`
  }
  if (r.daysRemaining != null && r.daysRemaining > 0 && date) return `by ${date}`
  if (date) return `around ${date}`
  return null
}

/** How far past due, spoken along the axis that's actually binding. */
function overdueText(r: ComputedReminder): string {
  if (r.milesRemaining != null && r.milesRemaining <= 0) {
    return `${formatMiles(Math.abs(r.milesRemaining))} past due`
  }
  if (r.daysRemaining != null && r.daysRemaining <= 0) {
    return `${daysAsSpeech(r.daysRemaining)} past due`
  }
  return 'past due'
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/**
 * Ruler zones (left = urgent): fix-now 0-25, book-soon 25-50, coast 50-75,
 * all-clear 75-100. Within a band the pin slides with how deep into the band
 * the driving item is, so two "book soon" vehicles can still read differently.
 */
function rulerPin(band: SignalBand, top: ComputedReminder | null): number {
  if (band === 'all-clear' || !top) return 88
  if (band === 'fix-now') {
    // Deeper overdue -> further left. Scale by miles or days past due.
    const overBy =
      top.milesRemaining != null && top.milesRemaining <= 0
        ? Math.abs(top.milesRemaining) / 2000
        : top.daysRemaining != null && top.daysRemaining <= 0
          ? Math.abs(top.daysRemaining) / 120
          : 0.5
    return clamp(21 - overBy * 17, 4, 21)
  }
  // Upcoming bands: fraction of the lead window still remaining (1 = just
  // entered the band, 0 = about to cross into the next-worse band).
  const frac =
    top.milesRemaining != null && top.milesRemaining > 0
      ? band === 'book-soon'
        ? top.milesRemaining / 500
        : (top.milesRemaining - 500) / 1000
      : top.daysRemaining != null && top.daysRemaining > 0
        ? band === 'book-soon'
          ? top.daysRemaining / 30
          : (top.daysRemaining - 30) / 60
        : 0.5
  const base = band === 'book-soon' ? 27 : 52
  return clamp(base + frac * 21, base, base + 21)
}

function headline(band: SignalBand, count: number): string {
  switch (band) {
    case 'fix-now':
      return count === 1 ? 'One thing needs attention now.' : `${count} things need attention now.`
    case 'book-soon':
      return count === 1 ? 'One thing to book soon.' : `${count} things to book soon.`
    case 'coast':
      return 'Nothing urgent. You can coast.'
    case 'all-clear':
      return 'All clear. Just drive.'
  }
}

function sentence(band: SignalBand, top: ComputedReminder | null, next: ComputedReminder | null): string {
  if (band === 'fix-now' && top) {
    const extra = next && bandFromStatus(next.status) === 'fix-now' ? ' Another item is past due too.' : ''
    return `${top.rule.label} is ${overdueText(top)} — sorting it soon keeps it a routine job.${extra}`
  }
  if (band === 'book-soon' && top) {
    const when = windowText(top)
    const extra = next && bandFromStatus(next.status) === 'book-soon' ? ' One more is close behind.' : ''
    return `${top.rule.label} comes due ${when ?? 'soon'}.${extra}`
  }
  if (band === 'coast' && top) {
    const when = windowText(top)
    return `Next attention: ${top.rule.label.toLowerCase()}, ${when ?? 'a while out'}.`
  }
  if (top) {
    const when = windowText(top)
    return when
      ? `Nothing needs you. Next attention: ${top.rule.label.toLowerCase()}, ${when}.`
      : 'Nothing needs you right now.'
  }
  return 'Nothing on the schedule needs you.'
}

function safeWindow(band: SignalBand, top: ComputedReminder | null): string | null {
  if (band === 'fix-now') return 'Don’t put this off — book it this week.'
  if (!top) return null
  if (band === 'book-soon') {
    if (top.milesRemaining != null && top.milesRemaining > 0) {
      return `Safe window: about ${formatMiles(top.milesRemaining)} of normal driving.`
    }
    if (top.daysRemaining != null && top.daysRemaining > 0) {
      return `Safe window: ${daysAsSpeech(top.daysRemaining)}.`
    }
    return null
  }
  if (band === 'coast') {
    if (top.milesRemaining != null && top.milesRemaining > 0) {
      return `Next check-in: ~${formatMiles(top.milesRemaining)} from now.`
    }
    if (top.daysRemaining != null && top.daysRemaining > 0) {
      return `Next check-in: ${daysAsSpeech(top.daysRemaining)} from now.`
    }
  }
  return null
}

/** First reminder in a band (input list is already ranked by the engine). */
function firstIn(reminders: ComputedReminder[], statuses: MaintenanceStatus[]): ComputedReminder | null {
  return reminders.find((r) => statuses.includes(r.status)) ?? null
}

/** The slice of a triage Concern the verdict needs (structural, so callers can
 * pass types.ts Concern rows directly). Only OPEN concerns belong here. */
export interface ConcernInput {
  title: string
  band: SignalBand
  createdDate: string // ISO
}

const BAND_ORDER: SignalBand[] = ['fix-now', 'book-soon', 'coast', 'all-clear']
const moreUrgentBand = (a: SignalBand, b: SignalBand): SignalBand =>
  BAND_ORDER.indexOf(a) <= BAND_ORDER.indexOf(b) ? a : b

/** Concern-driven sentence: the driver flagged this themselves, so the copy
 * points back at their own observation instead of the schedule. */
function concernSentence(band: SignalBand, c: ConcernInput): string {
  const date = formatShortDate(c.createdDate)
  if (band === 'fix-now') return `You flagged “${c.title}” on ${date} — it reads as fix now. Don’t sit on it.`
  if (band === 'book-soon') return `You flagged “${c.title}” on ${date} — get it booked while it’s still a small job.`
  return `You flagged “${c.title}” — it can wait, but keep an eye on it.`
}

// Concern verdicts have no mileage/date depth, so the pin sits mid-zone
// (same anchors the Check flow uses for a fresh triage verdict).
const CONCERN_PIN: Record<SignalBand, number> = { 'fix-now': 12, 'book-soon': 36, coast: 62, 'all-clear': 88 }

/**
 * The one-sentence verdict for a vehicle. `reminders` must be the engine's
 * ranked output (computeVehicleReminders / getVehicleReminders) — this layer
 * trusts that ranking completely. Open triage concerns merge in as siblings:
 * the vehicle's band is the worst of both worlds, a concern that outranks
 * every scheduled item takes over the sentence, and coast-band concerns join
 * the "can coast" list.
 */
export function vehicleVerdict(reminders: ComputedReminder[], concerns: ConcernInput[] = []): VehicleVerdict {
  const tracked = reminders.filter((r) => r.status !== 'not-applicable')

  const fixNow = tracked.filter((r) => r.status === 'overdue')
  const bookSoon = tracked.filter((r) => r.status === 'due-next')
  const watch = tracked.filter((r) => r.status === 'watch-next')

  const reminderBand: SignalBand = fixNow.length
    ? 'fix-now'
    : bookSoon.length
      ? 'book-soon'
      : watch.length
        ? 'coast'
        : 'all-clear'

  const concernBand: SignalBand = concerns.reduce<SignalBand>((worst, c) => moreUrgentBand(worst, c.band), 'all-clear')
  const band = moreUrgentBand(reminderBand, concernBand)
  const bandConcerns = concerns.filter((c) => c.band === band)
  // A concern only TAKES OVER the sentence when it strictly outranks every
  // scheduled item — on a tie the schedule keeps the mic (it has real numbers).
  const concernDriven = BAND_ORDER.indexOf(concernBand) < BAND_ORDER.indexOf(reminderBand)

  // The reminder that drives the sentence: worst actionable item, or for an
  // all-clear vehicle the nearest upcoming completed item with a real target.
  const top =
    reminderBand === 'all-clear'
      ? (tracked.find((r) => r.status === 'completed' && (r.milesRemaining != null || r.daysRemaining != null)) ?? null)
      : firstIn(tracked, reminderBand === 'fix-now' ? ['overdue'] : reminderBand === 'book-soon' ? ['due-next'] : ['watch-next'])
  const reminderCount =
    band === 'fix-now' ? fixNow.length : band === 'book-soon' ? bookSoon.length : band === 'coast' ? watch.length : 0
  const count = reminderCount + (band === 'all-clear' ? 0 : bandConcerns.length)
  const runnerUp = band === 'fix-now' ? (fixNow[1] ?? null) : band === 'book-soon' ? (bookSoon[1] ?? null) : null

  // "Can coast" = deferred-but-tracked: every watch-next item except the one
  // already carrying the verdict sentence, plus coast-band concerns (unless
  // one of those is itself carrying the sentence).
  const sentenceConcern = concernDriven ? bandConcerns[0] : null
  const coastItems: CoastItem[] = [
    ...concerns
      .filter((c) => c.band === 'coast' && c !== sentenceConcern)
      .map((c) => ({ label: c.title, window: `on your list since ${formatShortDate(c.createdDate)}` })),
    ...watch
      .filter((r) => r !== (concernDriven ? null : top))
      .map((r) => ({ label: r.rule.label, window: windowText(r) ?? 'a while out' })),
  ].slice(0, 4)

  const stale = tracked.some((r) => r.odometerStale)
  const noOdometer = stale && tracked.every((r) => r.milesRemaining == null || r.interval.miles == null)

  return {
    band,
    headline: headline(band, count),
    sentence: sentenceConcern ? concernSentence(band, sentenceConcern) : sentence(band, top, runnerUp),
    rulerPin: sentenceConcern ? CONCERN_PIN[band] : rulerPin(band, top),
    safeWindow: sentenceConcern
      ? band === 'fix-now'
        ? 'Don’t put this off — book it this week.'
        : null
      : safeWindow(band, top),
    coastItems,
    confidenceNote: stale
      ? noOdometer
        ? 'No odometer on file — add a reading to tighten these windows.'
        : 'Odometer estimate is stale — update it to tighten these windows.'
      : null,
  }
}
