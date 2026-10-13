import { useEffect, useRef, useState } from 'preact/hooks'
import { bandFromStatus, BAND_LABELS } from '../domain/verdict'
import { formatInterval, formatShortDate } from '../domain/format'
import { reminderProgress } from '../domain/progress'
import { BulletTrack } from './motion/BulletTrack'
import { RuleOverrideEditor } from './RuleOverrideEditor'
import { WarningIcon } from './icons'
import type { ComputedReminder } from '../domain/reminderEngine'

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
  const band = bandFromStatus(r.status)
  const hasHistory = r.lastDone.date != null || r.lastDone.miles != null

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
      class={`vd-row${r.status === 'overdue' ? ' is-overdue' : ''}${justResolved ? ' vd-row-resolved' : ''}`}
    >
      <a class="vd-row-hit" href={`#/service/${r.rule.id}`} aria-label={`Open ${r.rule.label}`} />
      <div class="vd-row-main">
        <span class="vd-svc">
          {r.rule.label} <span aria-hidden="true">›</span>
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
                {r.odometerStale && (
                  <span class="warning-mark" title="Odometer reading may be stale">
                    <WarningIcon />
                    <span class="sr-only">Odometer reading may be stale</span>
                  </span>
                )}
              </span>
            </>
          )}
          {!hasHistory && !estimated && (
            <>
              <span class="sep">·</span>
              <span class="vd-row-no-history">No history</span>
            </>
          )}
          {r.projectedDueDate && (
            <>
              <span class="sep">·</span>
              <span class="vd-eta">est. {formatShortDate(r.projectedDueDate)}</span>
            </>
          )}
        </div>
      </div>
      <div class="vd-row-end">
        <span class={`status-pill ${estimated ? 'status-estimated' : `status-${r.status}`}`}>
          {/* Band vocabulary, not the raw engine status — DESIGN.md: the
              four-signal labels mean the same thing everywhere. */}
          {estimated ? 'Estimated' : band ? BAND_LABELS[band] : 'Not applicable'}
        </span>
      </div>
      <BulletTrack pct={prog.pct} zone={prog.zone} animate={animate} reduced={reduced} />
    </li>
  )
}
