import { useState } from 'preact/hooks'
import { collectCalendarItems } from '../db/calendarExport'
import { buildCalendar, calendarText, type CalendarItem } from '../domain/calendar'
import { formatShortDate, localDateISO } from '../domain/format'
import { InfoTip } from './ui'

// "Add to Calendar": exports upcoming due dates (from the projected mileage)
// as an .ics file so the phone's Calendar app delivers the reminders, with no
// server involved (domain/calendar.ts). It's a snapshot, so we remember when
// it was last exported (per device, localStorage) and suggest re-adding.
//
// Items load when the sheet opens, NOT on the button tap: iOS Safari drops the
// tap's user activation across an IndexedDB await, so share/clipboard called
// after one can be refused.

const LAST_EXPORT_KEY = 'gl_calendar_exported'

function readLastExport(): string | null {
  try {
    return localStorage.getItem(LAST_EXPORT_KEY)
  } catch {
    return null
  }
}

interface Loaded {
  asOf: Date
  items: CalendarItem[]
}

export function CalendarExport({ vehicleId }: { vehicleId?: string }) {
  const [last, setLast] = useState(readLastExport)
  const [status, setStatus] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  // undefined = loading, null = failed to load
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined)

  async function openSheet() {
    setStatus(null)
    setLoaded(undefined)
    setOpen(true)
    try {
      const asOf = new Date()
      setLoaded({ asOf, items: await collectCalendarItems(vehicleId, asOf) })
    } catch {
      setLoaded(null)
    }
  }

  function close() {
    setOpen(false)
  }

  function exportCalendar(l: Loaded) {
    const blob = new Blob([buildCalendar(l.items, l.asOf)], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'car-maintenance.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    const today = localDateISO(l.asOf)
    try {
      localStorage.setItem(LAST_EXPORT_KEY, today)
    } catch {
      /* per-device convenience only */
    }
    setLast(today)
    setStatus(`${l.items.length} reminder${l.items.length === 1 ? '' : 's'} exported.`)
    close()
  }

  async function copyCalendarText(l: Loaded) {
    const text = calendarText(l.items)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Car maintenance reminders', text })
      } else {
        await navigator.clipboard.writeText(text)
        setStatus('Copied. Paste it anywhere.')
      }
      close()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setStatus("Couldn't share or copy the reminders. Try again.")
      close()
    }
  }

  return (
    <div class="cal-export">
      <div class="cal-export-row">
        <button type="button" class="btn btn-secondary" onClick={openSheet}>
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
        <div class="modal-backdrop" onClick={close}>
          <div
            class="modal-panel cal-export-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-export-title"
          >
            <div class="modal-head">
              <h3 id="calendar-export-title" class="modal-title">Add reminders to Calendar</h3>
              <button type="button" class="modal-close" aria-label="Close" onClick={close}>✕</button>
            </div>
            {loaded === undefined && <p class="muted small">Preparing…</p>}
            {loaded === null && <p class="muted small">Could not load your reminders. Try again.</p>}
            {loaded && !loaded.items.length && (
              <p class="muted small">
                Nothing comes due in the next 12 months yet. Log some mileage or service history first.
              </p>
            )}
            {loaded && loaded.items.length > 0 && (
              <>
                <button type="button" class="btn" onClick={() => exportCalendar(loaded)}>
                  Download file
                </button>
                <p class="muted small">One-time copy. Won't update.</p>
                <button type="button" class="btn btn-secondary" onClick={() => copyCalendarText(loaded)}>
                  Copy as text
                </button>
                <p class="muted small">Share to Notes or Messages.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
