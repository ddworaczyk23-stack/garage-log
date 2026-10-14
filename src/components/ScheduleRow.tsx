import { useEffect, useRef, useState } from 'preact/hooks'
import { itemBand, BAND_LABELS, type SignalBand } from '../domain/verdict'
import { formatInterval, formatShortDate } from '../domain/format'
import { reminderProgress } from '../domain/progress'
import { BulletTrack } from './motion/BulletTrack'
import { RuleOverrideEditor } from './RuleOverrideEditor'
import { ChevronRightIcon } from './icons'
import type { ComputedReminder } from '../domain/reminderEngine'

// Pill color follows the band, not the raw engine status: an overdue routine
// item is amber "Book soon" (itemBand), so it takes the due-next style.
const PILL_STATUS: Record<SignalBand, string> = {
  'fix-now': 'overdue',
  'book-soon': 'due-next',
  coast: 'watch-next',
  'all-clear': 'completed',
}

interface Props {
  reminder: ComputedReminder
  animate: boolean
  reduced: boolean
  estimated?: boolean
}

// One row in VehicleDetail's service schedule. Toggles into RuleOverrideEditor
// (pre-filled) for editing this item's interval or marking it not needed / DIY'd
// / already handled — no onChanged plumbing needed, Dexie's liveQuery already
// re-runs the reminders query whenever reminderRules changes.
export function ScheduleRow({ reminder: r, animate, reduced, estimated = false }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li class="vd-row vd-row-editing">
        <RuleOverrideEditor rule={r.rule} onDone={() => setEditing(false)} />
      </li>
    )
  }

  const prog = reminderProgress(r)
  const band = itemBand(r)
  const hasHistory = r.lastDone.date != null || r.lastDone.miles != null
  // Set-up car, but nothing logged for THIS item: its status is a factory
  // projection, so it reads "Unknown" with no date or progress, never urgency.
  const unknown = !estimated && !hasHistory && r.status !== 'not-applicable'

  // Log payoff: a row that JUST resolved (was overdue/due-next, now completed)
  // gets a one-time flash instead of silently snapping to its new state — the
  // BulletTrack fill already animates via CSS transition; this calls out the
  // moment on the row itself. prevStatus starts as the current status so a
  // fresh mount (e.g. navigating to the page) never flashes.
  const prevStatus = useRef(r.status)
  const [justResolved, setJustResolved] = useState(false)
  useEffect(() => {
    const was = prevStatus.current
    prevStatus.current = r.status
    if (r.status === 'completed' && (was === 'overdue' || was === 'due-next')) {
      setJustResolved(true)
      const id = setTimeout(() => setJustResolved(false), 900)
      return () => clearTimeout(id)
    }
  }, [r.status])

  return (
    <li
      class={`vd-row${band === 'fix-now' ? ' is-overdue' : ''}${justResolved ? ' vd-row-resolved' : ''}`}
    >
      <a class="vd-row-hit" href={`#/service/${r.rule.id}`} aria-label={`Open ${r.rule.label}`} />
      <div class="vd-row-main">
        <span class="vd-svc">
          {r.rule.label} <ChevronRightIcon />
        </span>
        <div class="vd-svc-meta">
          <span class="interval">
            {formatInterval(r.interval.miles, r.interval.months, r.interval.conditionBased)}
          </span>
          <button type="button" class="vd-interval-edit" onClick={() => setEditing(true)}>
            Edit
          </button>
          {hasHistory && (
            <>
              <span class="sep">·</span>
              <span class="vd-row-reason">
                {r.reason}
              </span>
            </>
          )}
          {r.projectedDueDate && !unknown && (
            <>
              <span class="sep">·</span>
              <span class="vd-eta">est. {formatShortDate(r.projectedDueDate)}</span>
            </>
          )}
        </div>
      </div>
      <div class="vd-row-end">
        <span
          class={`status-pill ${estimated || unknown ? 'status-estimated' : `status-${band ? PILL_STATUS[band] : r.status}`}`}
        >
          {/* Band vocabulary, not the raw engine status — DESIGN.md: the
              four-signal labels mean the same thing everywhere. */}
          {estimated ? 'Estimated' : unknown ? 'Unknown' : band ? BAND_LABELS[band] : 'Not applicable'}
        </span>
      </div>
      {!unknown && <BulletTrack pct={prog.pct} zone={prog.zone} animate={animate} reduced={reduced} />}
    </li>
  )
}
