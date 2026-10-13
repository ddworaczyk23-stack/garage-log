import { describe, it, expect } from 'vitest'
import {
  buildCalendar,
  milestoneCalendarItem,
  reminderCalendarItems,
  reminderDueDate,
} from '../src/domain/calendar'
import type { ComputedReminder } from '../src/domain/reminderEngine'
import type { MilestoneView } from '../src/domain/milestones'

const asOf = new Date('2026-10-13T12:00:00')

function rem(over: Partial<ComputedReminder> & { id?: string; label?: string } = {}): ComputedReminder {
  const { id = 'veh-1:oil-change', label = 'Engine oil & filter', ...rest } = over
  return {
    rule: { id, label, vehicleId: id.split(':')[0] } as ComputedReminder['rule'],
    status: 'completed',
    interval: { miles: 5000, months: 6, conditionBased: false } as ComputedReminder['interval'],
    lastDone: { date: null, miles: null },
    dueAtMiles: 45000,
    dueAtDate: null,
    milesRemaining: 3000,
    daysRemaining: null,
    odometerStale: false,
    projectedDueDate: null,
    reason: 'On track.',
    ...rest,
  }
}

describe('reminderDueDate', () => {
  it('takes the earlier of the date-based and projected due dates', () => {
    expect(reminderDueDate(rem({ dueAtDate: '2027-01-01', projectedDueDate: '2026-12-01' }), '2026-10-13')).toBe('2026-12-01')
    expect(reminderDueDate(rem({ dueAtDate: '2026-11-01', projectedDueDate: '2026-12-01' }), '2026-10-13')).toBe('2026-11-01')
  })
  it('skips past-due, not-applicable and undated items', () => {
    expect(reminderDueDate(rem({ dueAtDate: '2026-10-01' }), '2026-10-13')).toBeNull()
    expect(reminderDueDate(rem({ status: 'not-applicable', dueAtDate: '2027-01-01' }), '2026-10-13')).toBeNull()
    expect(reminderDueDate(rem(), '2026-10-13')).toBeNull()
  })
})

describe('reminderCalendarItems', () => {
  const logged = { lastDone: { date: '2026-06-01', miles: 40000 } }
  it('one event per day, skipping never-logged and out-of-horizon items', () => {
    const items = reminderCalendarItems(
      'F-150',
      [
        rem({ ...logged, projectedDueDate: '2026-12-01' }),
        rem({ ...logged, id: 'veh-1:tire-rotation', label: 'Tire rotation', projectedDueDate: '2026-12-01' }),
        rem({ id: 'veh-1:brake-inspection', label: 'Brakes', projectedDueDate: '2026-11-01' }), // never logged
        rem({ ...logged, id: 'veh-1:coolant', label: 'Coolant', dueAtDate: '2028-01-01' }), // beyond 12 months
      ],
      asOf,
      'https://example.test/app/',
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      uid: 'veh-1:2026-12-01@garage-log',
      date: '2026-12-01',
      title: 'F-150: Engine oil & filter + 1 more (est.)',
      url: 'https://example.test/app/#/vehicle/veh-1',
    })
    expect(items[0].description).toContain('Tire rotation')
  })

  it('a single item links straight to its service page', () => {
    const [item] = reminderCalendarItems('F-150', [rem({ ...logged, dueAtDate: '2027-01-05' })], asOf, 'https://x/')
    expect(item).toMatchObject({ title: 'F-150: Engine oil & filter', url: 'https://x/#/service/veh-1:oil-change' })
  })
})

describe('milestoneCalendarItem', () => {
  const next: MilestoneView = { miles: 60000, name: '60k checkup', state: 'upcoming', milesAway: 6000, checkedCount: 0, totalCount: 15 }
  it('projects the next upcoming milestone', () => {
    const it = milestoneCalendarItem('Rogue', 'veh-2', next, 12000, asOf)
    expect(it?.uid).toBe('veh-2:milestone-60000@garage-log')
    expect(it?.date.startsWith('2027-04')).toBe(true) // ~half a year out
  })
  it('skips due or unprojectable milestones', () => {
    expect(milestoneCalendarItem('R', 'v', { ...next, state: 'due' }, 12000, asOf)).toBeNull()
    expect(milestoneCalendarItem('R', 'v', null, 12000, asOf)).toBeNull()
  })
})

describe('buildCalendar', () => {
  const ics = buildCalendar(
    [{ uid: 'a@garage-log', date: '2026-12-31', title: 'Truck: Oil, filter; check', description: 'Line one\nmore '.repeat(10) }],
    asOf,
  )

  it('produces a CRLF iCalendar with an all-day event and two alarms', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\n')
    expect(ics).toContain('DTEND;VALUE=DATE:20270101\r\n')
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(1)
    expect(ics).toContain('TRIGGER:PT9H')
    expect(ics).not.toMatch(/[^\r]\n/)
  })

  it('escapes text and folds long lines to 75 octets', () => {
    expect(ics).toContain('SUMMARY:Truck: Oil\\, filter\\; check')
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    expect(ics).toContain('\\n')
  })
})
