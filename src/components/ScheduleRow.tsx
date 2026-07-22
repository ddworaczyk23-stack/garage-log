import { useEffect, useRef, useState } from 'preact/hooks'
import { bandFromStatus, BAND_LABELS } from '../domain/verdict'
import { formatInterval, formatShortDate } from '../domain/format'
import { reminderProgress } from '../domain/progress'
import { BulletTrack } from './motion/BulletTrack'
import { RuleOverrideEditor } from './RuleOverrideEditor'
import type { ComputedReminder } from '../domain/reminderEngine'
import type { MaintenanceCategory } from '../types'

interface Props {
  reminder: ComputedReminder
  onLog: (category: MaintenanceCategory) => void
  animate: boolean
  reduced: boolean
}

// One row in VehicleDetail's service schedule. Toggles into RuleOverrideEditor
// (pre-filled) for editing this item's interval or marking it not needed / DIY'd
// / already handled — no onChanged plumbing needed, Dexie's liveQuery already
// re-runs the reminders query whenever reminderRules changes.
export function ScheduleRow({ reminder: r, onLog, animate, reduced }: Props) {
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
      <div class="vd-row-main">
        <div class="vd-svc">{r.rule.label}</div>
        <div class="vd-svc-meta">
          <span class="interval">
            {formatInterval(r.interval.miles, r.interval.months, r.interval.conditionBased)}
          </span>
          <button type="button" class="vd-interval-edit" onClick={() => setEditing(true)}>
            Edit
          </button>
          <span class="sep">·</span>
          <span>
            {r.reason}
            {r.odometerStale ? ' ⚠️' : ''}
          </span>
          {r.projectedDueDate && (
            <>
              <span class="sep">·</span>
              <span class="vd-eta">est. ~{formatShortDate(r.projectedDueDate)}</span>
            </>
          )}
        </div>
      </div>
      <div class="vd-row-end">
        <span class={`status-pill status-${r.status}`}>
          {/* Band vocabulary, not the raw engine status — DESIGN.md: the
              four-signal labels mean the same thing everywhere. */}
          {band ? BAND_LABELS[band] : 'Not applicable'}
        </span>
        {/* Actionable items get a one-tap shop brief (Stage 3) — the thing
            you show at the counter when booking this service. */}
        {(r.status === 'overdue' || r.status === 'due-next') && (
          <a class="btn-link vd-log-btn" href={`#/brief/${r.rule.id}`}>
            Brief
          </a>
        )}
        {r.status !== 'not-applicable' && (
          <button type="button" class="btn-link vd-log-btn" onClick={() => onLog(r.rule.category)}>
            {r.rule.lastDoneDate ? 'Log' : 'Log first'}
          </button>
        )}
      </div>
      <BulletTrack pct={prog.pct} zone={prog.zone} animate={animate} reduced={reduced} />
    </li>
  )
}
