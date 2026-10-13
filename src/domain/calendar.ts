import type { ComputedReminder } from './reminderEngine'
import { localDateISO } from './format'
import { projectDueDate } from './mileage'
import type { MilestoneView } from './milestones'

// Builds an iCalendar (.ics) file of upcoming maintenance so the phone's own
// Calendar app delivers the reminders, with no server. Pure: no DOM, no I/O —
// unit-tested in tests/calendar.test.ts.
//
// Each due date is an all-day event (the earlier of the engine's date-based due
// date and the mileage projection), one per car per day, with two alerts: 9am
// a week before and 9am the day before. Never-logged items are left out: they
// only have a baseline guess, not a real due date.

export interface CalendarItem {
  uid: string
  date: string // YYYY-MM-DD
  title: string
  description: string
  url?: string
}

/** How far ahead to export. */
export const CALENDAR_HORIZON_DAYS = 365

/**
 * The calendar date an item comes due: the earlier of its date-based due date
 * and the mileage projection. Null for items with neither, or that are already
 * past (already due shows in the app; a past-dated event alerts nobody).
 */
export function reminderDueDate(r: ComputedReminder, today: string): string | null {
  if (r.status === 'not-applicable') return null
  const dates = [r.dueAtDate, r.projectedDueDate].filter((d): d is string => !!d)
  if (!dates.length) return null
  const due = dates.sort()[0]
  return due >= today ? due : null
}

export function reminderCalendarItems(
  vehicleName: string,
  reminders: ComputedReminder[],
  asOf: Date,
  appUrl?: string,
): CalendarItem[] {
  const today = localDateISO(asOf)
  const horizon = new Date(asOf)
  horizon.setDate(horizon.getDate() + CALENDAR_HORIZON_DAYS)
  const last = localDateISO(horizon)

  // Group by due date: several items landing on one day become ONE event, so
  // the phone fires one alert per car per day instead of a burst.
  const byDate = new Map<string, ComputedReminder[]>()
  for (const r of reminders) {
    // Never-logged items only have a baseline guess, not a real due date.
    if (r.lastDone.date == null && r.lastDone.miles == null) continue
    const date = reminderDueDate(r, today)
    if (!date || date > last) continue
    byDate.set(date, [...(byDate.get(date) ?? []), r])
  }

  const items: CalendarItem[] = []
  for (const [date, group] of byDate) {
    const estimated = group.some((r) => r.projectedDueDate === date && r.dueAtDate !== date)
    const first = group[0]
    const label =
      group.length === 1 ? first.rule.label : `${first.rule.label} + ${group.length - 1} more`
    items.push({
      uid: `${first.rule.vehicleId}:${date}@garage-log`,
      date,
      title: `${vehicleName}: ${label}${estimated ? ' (est.)' : ''}`,
      description: [
        ...group.map(
          (r) =>
            `${r.rule.label}${r.dueAtMiles != null ? ` (due at ${r.dueAtMiles.toLocaleString()} mi)` : ''}`,
        ),
        estimated ? 'Date estimated from your average mileage.' : null,
      ]
        .filter(Boolean)
        .join('\n'),
      url: appUrl
        ? group.length === 1
          ? `${appUrl}#/service/${first.rule.id}`
          : `${appUrl}#/vehicle/${first.rule.vehicleId}`
        : undefined,
    })
  }
  return items
}

/**
 * The next milestone checkup as a calendar item, dated by projecting the miles
 * left at the vehicle's average rate. Null when it's already due (the app shows
 * it), unprojectable, or beyond the horizon.
 */
export function milestoneCalendarItem(
  vehicleName: string,
  vehicleId: string,
  next: MilestoneView | null,
  annualMileage: number,
  asOf: Date,
  appUrl?: string,
): CalendarItem | null {
  if (!next || next.state !== 'upcoming' || next.milesAway == null) return null
  const date = projectDueDate(next.milesAway, annualMileage, asOf)
  if (!date) return null
  const horizon = new Date(asOf)
  horizon.setDate(horizon.getDate() + CALENDAR_HORIZON_DAYS)
  if (date > localDateISO(horizon)) return null
  return {
    uid: `${vehicleId}:milestone-${next.miles}@garage-log`,
    date,
    title: `${vehicleName}: ${next.name} (est.)`,
    description: `Whole-vehicle checkup at ${next.miles.toLocaleString()} mi, ${next.totalCount} items. Date estimated from your average mileage.`,
    url: appUrl ? `${appUrl}#/milestone/${vehicleId}/${next.miles}` : undefined,
  }
}

// --- iCalendar serialization ------------------------------------------------

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** RFC 5545 line folding: max 75 octets per line, continuation lines start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    const limit = out.length === 0 ? 75 : 74 // continuation lines carry a leading space
    if (size + n > limit) {
      out.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  out.push(current)
  return out.join('\r\n ')
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, '')
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return localDateISO(d)
}

function stamp(asOf: Date): string {
  return asOf.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function buildCalendar(items: CalendarItem[], asOf: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Garage Log//Maintenance reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Car maintenance',
  ]
  for (const it of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${it.uid}`,
      `DTSTAMP:${stamp(asOf)}`,
      `DTSTART;VALUE=DATE:${compactDate(it.date)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(it.date))}`,
      `SUMMARY:${escapeText(it.title)}`,
      `DESCRIPTION:${escapeText(it.description)}`,
      ...(it.url ? [`URL:${it.url}`] : []),
      'TRANSP:TRANSPARENT',
      // All-day events start at midnight: -6D15H = 9am a week before, -15H = 9am the day before.
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(it.title)}`,
      'TRIGGER:-P6DT15H',
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(it.title)}`,
      'TRIGGER:-PT15H',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
