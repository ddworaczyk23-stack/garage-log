import type { ComputedReminder } from './reminderEngine'
import { bandFromStatus, type SignalBand } from './verdict'

// ---------------------------------------------------------------------------
// Coast vehicle health score (Stage 5B — design/COAST-PLAN-STAGE5.md).
//
// A single honest read on a vehicle: reuses the four-signal band vocabulary
// (worst-wins across reminders + open concerns, same as domain/verdict.ts) plus
// a 0-100 score for a compact meter. PURE — no DOM, no Dexie, no I/O. This is
// a SUMMARY field only: it never feeds domain/vehicleRanking.ts's
// compareVehicleUrgency, which stays the audited lexicographic ranking.
// ---------------------------------------------------------------------------

export interface VehicleHealth {
  band: SignalBand
  /** 0 (worst) .. 100 (nothing pending), for a compact meter. */
  score: number
  /** Plain phrases explaining the read, e.g. ["1 overdue", "1 open concern"]. */
  reasons: string[]
}

/** The slice of an open Concern the score needs — kept structural like
 *  verdict.ts's ConcernInput so callers can pass types.ts Concern rows directly. */
export interface ConcernBandInput {
  band: SignalBand
}

const BAND_ORDER: SignalBand[] = ['fix-now', 'book-soon', 'coast', 'all-clear']
const moreUrgentBand = (a: SignalBand, b: SignalBand): SignalBand =>
  BAND_ORDER.indexOf(a) <= BAND_ORDER.indexOf(b) ? a : b

// Score deductions, tuned so a single overdue item or a fix-now concern always
// outweighs any number of due-soon/watch-next items (band severity dominates
// the score the same way it dominates the band itself).
const PENALTY_OVERDUE = 25
const PENALTY_DUE_SOON = 8
const PENALTY_WATCH = 2
const PENALTY_CONCERN: Record<SignalBand, number> = {
  'fix-now': 25,
  'book-soon': 10,
  coast: 3,
  'all-clear': 0,
}
const PENALTY_STALE = 5

/**
 * One health read for a vehicle: worst-wins band across the reminder engine's
 * tracked statuses and every open concern, plus a 0-100 score built from
 * overdue count, each open concern's band, and whether the mileage estimate
 * is stale. Never a new vocabulary — `band` is exactly a SignalBand.
 */
export function vehicleHealth(
  reminders: ComputedReminder[],
  openConcerns: ConcernBandInput[],
  mileageStale: boolean,
): VehicleHealth {
  const tracked = reminders.filter((r) => r.status !== 'not-applicable')
  const overdueCount = tracked.filter((r) => r.status === 'overdue').length
  const dueSoonCount = tracked.filter((r) => r.status === 'due-next').length
  const watchCount = tracked.filter((r) => r.status === 'watch-next').length

  let band: SignalBand = 'all-clear'
  for (const r of tracked) {
    const b = bandFromStatus(r.status)
    if (b) band = moreUrgentBand(band, b)
  }
  for (const c of openConcerns) band = moreUrgentBand(band, c.band)

  const concernPenalty = openConcerns.reduce((sum, c) => sum + PENALTY_CONCERN[c.band], 0)
  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        overdueCount * PENALTY_OVERDUE -
        dueSoonCount * PENALTY_DUE_SOON -
        watchCount * PENALTY_WATCH -
        concernPenalty -
        (mileageStale ? PENALTY_STALE : 0),
    ),
  )

  const reasons: string[] = []
  if (overdueCount > 0) reasons.push(`${overdueCount} overdue`)
  if (openConcerns.length > 0) reasons.push(`${openConcerns.length} open concern${openConcerns.length === 1 ? '' : 's'}`)
  if (dueSoonCount > 0) reasons.push(`${dueSoonCount} due soon`)
  if (reasons.length === 0 && watchCount > 0) reasons.push(`${watchCount} to watch`)
  if (mileageStale) reasons.push('mileage estimate is stale')
  if (reasons.length === 0) reasons.push('all caught up')

  return { band, score, reasons }
}
