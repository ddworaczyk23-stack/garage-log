import { useState } from 'preact/hooks'
import { db } from '../db/db'
import { getVehicleReminders } from '../db/summary'
import { getMilestoneContext } from '../db/milestones'
import {
  buildCalendar,
  milestoneCalendarItem,
  reminderCalendarItems,
  type CalendarItem,
} from '../domain/calendar'
import { milestoneOverview } from '../domain/milestones'
import { formatShortDate, localDateISO } from '../domain/format'
import { vehicleLabel } from '../domain/vehicle'
import { InfoTip } from './ui'

// "Add to Calendar": exports upcoming due dates (from the projected mileage)
// as an .ics file so the phone's Calendar app delivers the reminders, with no
// server involved (domain/calendar.ts). It's a snapshot, so we remember when
// it was last exported (per device, localStorage) and suggest re-adding.

const LAST_EXPORT_KEY = 'gl_calendar_exported'

function readLastExport(): string | null {
  try {
    return localStorage.getItem(LAST_EXPORT_KEY)
  } catch {
    return null
  }
}

async function collectItems(vehicleId: string | undefined, asOf: Date): Promise<CalendarItem[]> {
  const vehicles = vehicleId
    ? [await db.vehicles.get(vehicleId)].filter((v) => !!v)
    : await db.vehicles.toArray()
  const appUrl = `${location.origin}${location.pathname}`
  const out: CalendarItem[] = []
  for (const v of vehicles) {
    if (!v) continue
    const name = vehicleLabel(v)
    const [reminders, ctx] = await Promise.all([getVehicleReminders(v.id), getMilestoneContext(v.id)])
    out.push(...reminderCalendarItems(name, reminders, asOf, appUrl))
    if (ctx?.mileage) {
      const { next } = milestoneOverview(ctx.mileage.miles, ctx.profile, v.milestones)
      const item = milestoneCalendarItem(name, v.id, next, ctx.mileage.annualMileage, asOf, appUrl)
      if (item) out.push(item)
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function CalendarExport({ vehicleId }: { vehicleId?: string }) {
  const [last, setLast] = useState(readLastExport)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function exportCalendar() {
    setBusy(true)
    setStatus(null)
    try {
      const asOf = new Date()
      const items = await collectItems(vehicleId, asOf)
      if (!items.length) {
        setStatus('Nothing comes due in the next 12 months yet. Log some mileage or service history first.')
        return
      }
      const blob = new Blob([buildCalendar(items, asOf)], { type: 'text/calendar;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'car-maintenance.ics'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      const today = localDateISO(asOf)
      try {
        localStorage.setItem(LAST_EXPORT_KEY, today)
      } catch {
        /* per-device convenience only */
      }
      setLast(today)
      setStatus(`${items.length} reminder${items.length === 1 ? '' : 's'} exported.`)
    } catch {
      setStatus('Could not build the calendar file. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="cal-export">
      <div class="cal-export-row">
        <button type="button" class="btn btn-secondary" onClick={exportCalendar} disabled={busy}>
          {busy ? 'Preparing…' : 'Add reminders to Calendar'}
        </button>
        {last && <span class="muted small">Last added {formatShortDate(last)}</span>}
      </div>
      <p class="muted small cal-export-hint">
        One alert at 9am on each due date. Re-add every month or two.
        <InfoTip label="How to add on iPhone">Open the downloaded file and tap Add All.</InfoTip>
      </p>
      {status && (
        <p class="muted small" role="status">
          {status}
        </p>
      )}
    </div>
  )
}
