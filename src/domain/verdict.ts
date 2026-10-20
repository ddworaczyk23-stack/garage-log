import { urgencyValue, DEFAULT_ANNUAL_MILEAGE, type ComputedReminder } from './reminderEngine'
import type { MaintenanceEvent, MaintenanceStatus } from '../types'
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

/**
 * The verdict layer's band adds one honest state the signal scale can't carry:
 * 'not-set-up' — the app has NO real data for this vehicle (no logged history,
 * no odometer estimate), so it refuses to claim anything. Absence of data must
 * never render as "all clear" (or even "you can coast"): green is earned by
 * real history. Playbook outcomes and concerns never produce this band — a
 * driver-reported symptom is real data.
 */
export type VerdictBand = SignalBand | 'not-set-up'

export const BAND_LABELS: Record<SignalBand, string> = {
  'fix-now': 'Fix now',
  'book-soon': 'Book soon',
  coast: 'Can coast',
  'all-clear': 'All clear',
}

export const VERDICT_BAND_LABELS: Record<VerdictBand, string> = {
  ...BAND_LABELS,
  'not-set-up': 'Not set up yet',
}

/**
 * True when at least one tracked reminder has a logged last-done date or
 * mileage — i.e. this vehicle has real SERVICE HISTORY, not just a current
 * odometer estimate. A bare odometer reading tells us where the car is, not
 * what's been done to it, so it must not count here: every never-serviced
 * rule projects a plausible-looking status from the factory schedule alone
 * (see the `neverServiced` branch in reminderEngine.ts), and treating that
 * projection as "real data" is exactly how a car with zero logged history
 * used to earn a green "all clear" verdict — the Earned Green Rule violation
 * this function exists to prevent. When false, every status in `reminders`
 * is a data-free baseline — the verdict and health layers exclude them
 * rather than narrating them as knowledge.
 */
export function hasRealData(reminders: ComputedReminder[]): boolean {
  return reminders.some((r) => r.status !== 'not-applicable' && hasHistory(r))
}

/** True when this item has a logged last-done date or mileage. */
export function hasHistory(r: ComputedReminder): boolean {
  return r.lastDone.date != null || r.lastDone.miles != null
}

/**
 * The reminders that may speak in a verdict, health score, or count: tracked
 * items with logged history. A never-logged item's status is a projection from
 * the factory schedule, not knowledge — on a car with SOME history it must not
 * read as "book soon" any more than a car with none may read as "all clear".
 */
export function knownReminders(reminders: ComputedReminder[]): ComputedReminder[] {
  return reminders.filter((r) => r.status !== 'not-applicable' && hasHistory(r))
}

/** Tracked items Coast has no history for (shown as "Unknown"). */
export function unknownReminders(reminders: ComputedReminder[]): ComputedReminder[] {
  return reminders.filter((r) => r.status !== 'not-applicable' && !hasHistory(r))
}

/**
 * Safety items: overdue means red "fix now". Everything else is routine
 * maintenance, where overdue is amber "book soon" (PRODUCT.md principle 4:
 * err urgent on safety, calm on money). User decision, 2026-10-13.
 */
export const SAFETY_CATEGORIES: ReadonlySet<string> = new Set([
  'brake-inspection',
  'brake-fluid',
  'tire-replacement',
  'tire-inspection',
  'timing-belt',
])

/** The signal band for one reminder: like bandFromStatus, but an overdue
 *  ROUTINE item is "book soon", not "fix now". Use this for anything shown. */
export function itemBand(r: ComputedReminder): SignalBand | null {
  if (r.status === 'overdue' && !SAFETY_CATEGORIES.has(r.rule.category)) return 'book-soon'
  return bandFromStatus(r.status)
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

/** A fix-now / book-soon item; carries its OWN band so a book-soon row under
 *  a red sign is still painted amber (red is for safety only). */
export interface ActionItem extends CoastItem {
  band: 'fix-now' | 'book-soon'
  /** Past due (vs. due soon) — lets a one-item headline say "is overdue". */
  overdue: boolean
}

export interface VehicleVerdict {
  band: VerdictBand
  /** The sign: short, declarative. e.g. "One thing to book soon." */
  headline: string
  /** The human voice: one serif sentence explaining the sign. */
  sentence: string
  /** Marker position on the 4-zone urgency ruler, 0 (worst) .. 100 (clear).
   *  Null for 'not-set-up' — an unknown vehicle has no place on the scale. */
  rulerPin: number | null
  /** e.g. "Safe window: about 3 weeks of normal driving." null when n/a. */
  safeWindow: string | null
  coastItems: CoastItem[]
  /** The watch-next item carrying a coast sentence. Kept out of coastItems so
   *  the full panel doesn't list it twice; the compact Home card, which has no
   *  sentence, shows it as "Next". Null otherwise. */
  lead: CoastItem | null
  /** The fix-now / book-soon items behind the headline, worst first (max 3). */
  actionItems: ActionItem[]
  /** Tracked items with no logged history — "Unknown", never counted above. */
  unknownCount: number
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
  // An overdue routine item sits at the urgent edge of the amber zone.
  if (band === 'book-soon' && top.status === 'overdue') return 27
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
    const extra = next && itemBand(next) === 'fix-now' ? ' Another item is past due too.' : ''
    return `${top.rule.label} is ${overdueText(top)} — sorting it soon keeps it a routine job.${extra}`
  }
  if (band === 'book-soon' && top) {
    const when = windowText(top)
    // No "one more is close behind": the next jobs are listed right below.
    const extra = ''
    if (top.status === 'overdue') {
      return `${top.rule.label} is ${overdueText(top)}. It's routine, so book it when it suits you.${extra}`
    }
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
  if (band === 'book-soon' && top.status === 'overdue') return 'Book it in the next few weeks.'
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

/** Days between two ISO (day-only) dates. Never negative in practice — a
 * concern's createdDate is always <= today — but not clamped defensively,
 * so a corrupt/future createdDate is visible rather than silently hidden. */
function daysBetweenISO(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime()
  const b = new Date(`${to}T00:00:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

// Below this age a concern still reads as fresh — showing the actual date is
// more informative than "1 week ago". At or above it, a fix-now concern that's
// been sitting is worth saying so plainly rather than repeating a now-stale
// date as if it were still new information.
const CONCERN_AGE_THRESHOLD_DAYS = 14

function concernAgeLabel(days: number): string | null {
  if (days < CONCERN_AGE_THRESHOLD_DAYS) return null
  // Below the 14-day threshold we returned null above, so weeks is always >= 2
  // and the plural is always correct.
  return `${Math.round(days / 7)} weeks ago`
}

/** Concern-driven sentence: the driver flagged this themselves, so the copy
 * points back at their own observation instead of the schedule. A fix-now
 * concern that's been open a while says so by age instead of repeating an
 * increasingly-stale-looking date — a "fix now" flagged 19 weeks ago and
 * still open deserves honesty about how long it's actually been sitting. */
function concernSentence(band: SignalBand, c: ConcernInput, today: string): string {
  if (band === 'fix-now') {
    const age = concernAgeLabel(daysBetweenISO(c.createdDate, today))
    const when = age ?? `on ${formatShortDate(c.createdDate)}`
    return `You flagged “${c.title}” ${when} — it reads as fix now. Don’t sit on it.`
  }
  if (band === 'book-soon') {
    return `You flagged “${c.title}” on ${formatShortDate(c.createdDate)} — get it booked while it’s still a small job.`
  }
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
 *
 * `today` is an explicit ISO date, the same convention as the reminder
 * engine's `asOf` — this module stays wall-clock-free; callers compute "now"
 * once and pass it in. Required (not defaulted) rather than silently falling
 * back to something that would render "NaN weeks ago" for an unmigrated
 * caller — a missing date should fail to compile, not fail at the counter.
 * Only used for a fix-now concern's age framing.
 */
export function vehicleVerdict(
  reminders: ComputedReminder[],
  concerns: ConcernInput[],
  today: string,
): VehicleVerdict {
  // No real data at all → refuse to claim anything (never "all clear", never
  // "you can coast"). A flagged concern IS real data — with one present, the
  // verdict proceeds concern-driven, but the data-free baseline reminder
  // statuses are still excluded so they can't inflate counts or coast lists.
  const known = hasRealData(reminders)
  if (!known && !concerns.some((c) => c.band !== 'all-clear')) {
    return {
      band: 'not-set-up',
      headline: 'Not set up yet.',
      sentence:
        "Coast doesn't know this car yet. Log your last oil change (or import your service history) and real verdicts start.",
      rulerPin: null,
      safeWindow: null,
      coastItems: [],
      lead: null,
      actionItems: [],
      unknownCount: 0,
      confidenceNote: null,
    }
  }
  const tracked = knownReminders(reminders)

  const fixNow = tracked.filter((r) => itemBand(r) === 'fix-now')
  const bookSoon = tracked.filter((r) => itemBand(r) === 'book-soon')
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
      : reminderBand === 'fix-now'
        ? (fixNow[0] ?? null)
        : reminderBand === 'book-soon'
          ? (bookSoon[0] ?? null)
          : firstIn(tracked, ['watch-next'])
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

  const untracked = known && unknownReminders(reminders).length > 0
  const stale = tracked.some((r) => r.odometerStale)
  const noOdometer = stale && tracked.every((r) => r.milesRemaining == null || r.interval.miles == null)

  return {
    band,
    // "Just drive" would narrate the untracked items as fine (principle 1).
    headline:
      band === 'all-clear' && untracked
        ? 'All clear on what’s logged.'
        : headline(band, count),
    sentence: sentenceConcern
      ? concernSentence(band, sentenceConcern, today)
      : band === 'all-clear' && untracked
        ? sentence(band, top, runnerUp).replace(/^Nothing (on the schedule )?needs you( right now)?\./, 'Nothing you’ve logged is due.')
        : sentence(band, top, runnerUp),
    rulerPin: sentenceConcern ? CONCERN_PIN[band] : rulerPin(band, top),
    safeWindow: sentenceConcern
      ? band === 'fix-now'
        ? 'Don’t put this off — book it this week.'
        : null
      : safeWindow(band, top),
    coastItems,
    lead:
      band === 'coast' && !concernDriven && top
        ? { label: top.rule.label, window: windowText(top) ?? 'a while out' }
        : null,
    actionItems: [...fixNow, ...bookSoon]
      .slice(0, 3)
      .map((r) => ({
        label: r.rule.label,
        band: fixNow.includes(r) ? ('fix-now' as const) : ('book-soon' as const),
        overdue: r.status === 'overdue',
        window: r.status === 'overdue' ? overdueText(r) : (windowText(r) ?? 'due now'),
      })),
    unknownCount: known ? unknownReminders(reminders).length : 0,
    confidenceNote: stale
      ? noOdometer
        ? 'No odometer on file — add a reading to tighten these windows.'
        : 'Odometer estimate is stale — update it to tighten these windows.'
      : null,
  }
}

/** The sign fields a VerdictPanel renders. */
export type VerdictSign = Pick<VehicleVerdict, 'band' | 'headline' | 'sentence'>

/**
 * The road sign for ONE service (the service page). Same bands as the vehicle
 * verdict; a never-logged item is slate "Not logged yet", never a projected
 * urgency (see knownReminders).
 */
export function serviceVerdict(r: ComputedReminder): VerdictSign {
  if (r.status === 'not-applicable') {
    return { band: 'not-set-up', headline: 'Not tracked.', sentence: r.reason }
  }
  if (!hasHistory(r)) {
    return {
      band: 'not-set-up',
      headline: 'Not logged yet.',
      sentence: 'Log when you last did this and Coast tracks it from there.',
    }
  }
  const when = windowText(r)
  // The headline already says when; the sentence adds the anchor it's from.
  const sentence = r.lastDone.date
    ? `Last done ${formatShortDate(r.lastDone.date)}${r.lastDone.miles != null ? ` at ${formatMiles(r.lastDone.miles)}` : ''}.`
    : r.reason
  switch (r.status) {
    case 'overdue':
      return { band: itemBand(r) ?? 'fix-now', headline: `${capitalize(overdueText(r))}.`, sentence }
    case 'due-next':
      return { band: 'book-soon', headline: when ? `Due ${when}.` : 'Due soon.', sentence }
    case 'watch-next':
      return { band: 'coast', headline: when ? `Coming up ${when}.` : 'Coming up.', sentence }
    default:
      return {
        band: 'all-clear',
        headline:
          r.milesRemaining != null && r.milesRemaining > 0
            ? `All clear for ~${formatMiles(r.milesRemaining)}.`
            : 'All clear.',
        sentence,
      }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// --- Home page (compact cards, garage line, coming-up list) -----------------

/** The short sign on a Home car card, plus one line for what else is behind it. */
export interface CompactSign {
  headline: string
  also: { text: string; band: VerdictBand } | null
}

const dropPeriod = (t: string) => t.replace(/\.$/, '')

/** Squeezes a full vehicle verdict into the Home card's one-line sign. When
 * the sign stands for exactly one scheduled item, it names that item ("Brake
 * inspection is overdue"); otherwise it keeps the verdict's own headline. */
export function compactSign(v: VehicleVerdict): CompactSign {
  if (v.band === 'not-set-up') {
    return { headline: dropPeriod(v.headline), also: { text: 'Log your last oil change to start.', band: 'not-set-up' } }
  }
  if (v.band === 'fix-now' || v.band === 'book-soon') {
    const inBand = v.actionItems.filter((i) => i.band === v.band)
    const single = inBand.length === 1 && v.headline.startsWith('One thing')
    if (single) {
      const top = inBand[0]
      const rest = v.actionItems.filter((i) => i !== top)
      return {
        headline: `${top.label} ${top.overdue ? 'is overdue' : 'is due soon'}`,
        also: rest.length
          ? { text: `Also: ${rest.map((i) => `${i.label}, ${BAND_LABELS[i.band].toLowerCase()}`).join('; ')}`, band: rest[0].band }
          : null,
      }
    }
    const labels = inBand.map((i) => i.label)
    return {
      headline: dropPeriod(v.headline),
      also: labels.length ? { text: joinAnd(labels), band: v.band } : null,
    }
  }
  const next = v.lead ?? v.coastItems[0]
  return {
    headline: dropPeriod(v.headline),
    also: next ? { text: `Next: ${next.label} ${next.window}`, band: 'coast' } : null,
  }
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  const lower = items.map((t, i) => (i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1)))
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`
}

/** Whole-garage count for the Home line: every known fix-now / book-soon
 * reminder plus every open concern in those bands, across all vehicles. */
export function garageTally(
  vehicles: { reminders: ComputedReminder[]; openConcerns: ConcernInput[] }[],
): { fixNow: number; bookSoon: number } {
  let fixNow = 0
  let bookSoon = 0
  for (const v of vehicles) {
    const bands = [...knownReminders(v.reminders).map(itemBand), ...v.openConcerns.map((c) => c.band)]
    fixNow += bands.filter((b) => b === 'fix-now').length
    bookSoon += bands.filter((b) => b === 'book-soon').length
  }
  return { fixNow, bookSoon }
}

/** windowText's short form for a narrow list column: one axis only. */
/** True when the calendar comes due before the miles do (same mileage
 * assumption the engine ranks with), e.g. oil at 6 months on a low-mileage car. */
function dateBinds(r: ComputedReminder): boolean {
  if (r.daysRemaining == null || !r.dueAtDate) return false
  if (r.milesRemaining == null) return true
  return r.daysRemaining < (r.milesRemaining / DEFAULT_ANNUAL_MILEAGE) * 365
}

function shortWindow(r: ComputedReminder): string {
  if (dateBinds(r)) return `by ${monthYear(r.dueAtDate)}`
  if (r.milesRemaining != null && r.milesRemaining > 0) return `in ~${formatMiles(r.milesRemaining)}`
  const date = monthYear(r.dueAtDate ?? r.projectedDueDate)
  return date ? `~${date}` : 'coming up'
}

export interface ComingUpItem {
  vehicleId: string
  vehicleName: string
  label: string
  window: string
}

/** The "Coming up" list on Home: every known can-coast (watch-next) reminder
 * across all vehicles, in the engine's urgency order (urgencyValue), so it
 * never disagrees with a car card's "Next". Overdue / due-soon items are left out —
 * the car cards already show those. */
export function comingUp(
  vehicles: { vehicleId: string; vehicleName: string; reminders: ComputedReminder[] }[],
  max = 5,
): ComingUpItem[] {
  const rows = vehicles.flatMap((v) =>
    knownReminders(v.reminders)
      .filter((r) => r.status === 'watch-next')
      .map((r) => ({
        vehicleId: v.vehicleId,
        vehicleName: v.vehicleName,
        label: r.rule.label,
        window: shortWindow(r),
        key: urgencyValue(r),
      })),
  )
  rows.sort((a, b) => a.key - b.key)
  return rows.slice(0, max).map(({ key: _key, ...item }) => item)
}

export interface RecentWorkItem {
  vehicleId: string
  vehicleName: string
  title: string
  cost: number
  date: string
}

/** Recent logged maintenance and repairs across the garage, newest first. */
export function recentWork(
  vehicles: { vehicleId: string; vehicleName: string; events: MaintenanceEvent[] }[],
  max = 3,
): RecentWorkItem[] {
  return vehicles
    .flatMap((vehicle) => vehicle.events.map((event) => ({
      vehicleId: vehicle.vehicleId,
      vehicleName: vehicle.vehicleName,
      title: event.title,
      cost: event.cost,
      date: event.date,
    })))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, max)
}
