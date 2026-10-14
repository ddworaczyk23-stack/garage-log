import { useState } from 'preact/hooks'
import { collectCalendarItems } from '../db/calendarExport'
import { buildCalendar, calendarText } from '../domain/calendar'
import { formatShortDate, localDateISO } from '../domain/format'
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

export function CalendarExport({ vehicleId }: { vehicleId?: string }) {
  const [last, setLast] = useState(readLastExport)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  async function getItems() {
    const asOf = new Date()
    const items = await collectCalendarItems(vehicleId, asOf)
    if (!items.length) {
      setStatus('Nothing comes due in the next 12 months yet. Log some mileage or service history first.')
      return null
    }
    return { asOf, items }
  }

  async function exportCalendar() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await getItems()
      if (!result) return
      const { asOf, items } = result
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
      setOpen(false)
    } catch {
      setStatus('Could not build the calendar file. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copyCalendarText() {
    setBusy(true)
    setStatus(null)
    try {
      const result = await getItems()
      if (!result) return
      const text = calendarText(result.items)
      if (navigator.share) {
        await navigator.share({ title: 'Car maintenance reminders', text })
        setOpen(false)
      } else {
        await navigator.clipboard.writeText(text)
        setStatus('Copied to the clipboard — paste it anywhere.')
        setOpen(false)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setStatus("Couldn't share or copy the reminders. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="cal-export">
      <div class="cal-export-row">
        <button type="button" class="btn btn-secondary" onClick={() => setOpen(true)} disabled={busy}>
          Add reminders to Calendar
        </button>
        <InfoTip label="Calendar reminders">
          One alert at 9am on each due date. Re-add every month or two. On iPhone, open the file and tap Add All.
        </InfoTip>
        {last && <span class="muted small">Last added {formatShortDate(last)}</span>}
      </div>
      {status && (
        <p class="muted small" role="status">
          {status}
        </p>
      )}
      {open && (
        <div class="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            class="modal-panel cal-export-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-export-title"
          >
            <div class="modal-head">
              <h3 id="calendar-export-title" class="modal-title">Add reminders to Calendar</h3>
              <button type="button" class="modal-close" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <p class="muted small">Choose a one-time copy. You can return here whenever dates change.</p>
            <button type="button" class="btn" onClick={exportCalendar} disabled={busy}>
              {busy ? 'Preparing…' : 'Download file'}
            </button>
            <p class="muted small">One-time copy, won’t update automatically.</p>
            <button type="button" class="btn btn-secondary" onClick={copyCalendarText} disabled={busy}>
              {busy ? 'Preparing…' : 'Copy as text'}
            </button>
            <p class="muted small">Share to Notes or Messages, or copy it to paste anywhere.</p>
          </div>
        </div>
      )}
    </div>
  )
}
