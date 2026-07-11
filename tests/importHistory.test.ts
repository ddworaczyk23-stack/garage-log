import { describe, it, expect } from 'vitest'
import {
  baselineCategories,
  isImportable,
  mapServiceToCategory,
  parseHistoryText,
} from '../src/domain/importHistory'

describe('mapServiceToCategory', () => {
  it('maps common Carfax service phrases to categories', () => {
    expect(mapServiceToCategory('Oil and filter changed')).toBe('oil-change')
    expect(mapServiceToCategory('Cabin air filter replaced/cleaned')).toBe('cabin-air-filter')
    expect(mapServiceToCategory('Air filter replaced')).toBe('engine-air-filter')
    expect(mapServiceToCategory('Tires rotated')).toBe('tire-rotation')
    expect(mapServiceToCategory('Brakes checked')).toBe('brake-inspection')
    expect(mapServiceToCategory('Differential fluid flushed/changed')).toBe('differential-fluid')
    expect(mapServiceToCategory('Battery/charging system checked')).toBe('battery-check')
    expect(mapServiceToCategory('Wiper(s) replaced')).toBe('wiper-blades')
    expect(mapServiceToCategory('Maintenance inspection completed')).toBe('multi-point-inspection')
  })

  it('prefers the more specific rule (cabin air before air filter, brake fluid before brakes)', () => {
    expect(mapServiceToCategory('Cabin air filter')).toBe('cabin-air-filter')
    expect(mapServiceToCategory('Brake fluid flushed')).toBe('brake-fluid')
  })

  it('returns null for non-maintenance records', () => {
    expect(mapServiceToCategory('Registration issued or renewed')).toBeNull()
    expect(mapServiceToCategory('Title issued or updated')).toBeNull()
    expect(mapServiceToCategory('Bed liner installed')).toBeNull()
  })
})

describe('parseHistoryText', () => {
  it('parses "date, miles, service" lines regardless of separator', () => {
    const rows = parseHistoryText(
      [
        '06/23/2026, 95,170, Oil and filter changed',
        '06/22/2024 | 69,284 mi | Cabin air filter replaced',
        '2025-12-02\t90179\tTires rotated',
      ].join('\n'),
    )
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      date: '2026-06-23',
      miles: 95170,
      service: 'Oil and filter changed',
      category: 'oil-change',
    })
    expect(rows[1].miles).toBe(69284)
    expect(rows[1].category).toBe('cabin-air-filter')
    expect(rows[2].date).toBe('2025-12-02')
    expect(rows[2].miles).toBe(90179)
  })

  it('does not mistake the date digits for mileage', () => {
    const [row] = parseHistoryText('07/01/2022, 29,464, Oil and filter changed')
    expect(row.miles).toBe(29464)
    expect(row.date).toBe('2022-07-01')
  })

  it('skips lines with no date, and date-only lines', () => {
    const rows = parseHistoryText(['Services Performed', '95,170 mi', '06/23/2026'].join('\n'))
    expect(rows).toHaveLength(0)
  })

  it('handles a two-digit year and a missing mileage', () => {
    const [row] = parseHistoryText('6/9/25, Oil and filter changed')
    expect(row.date).toBe('2025-06-09')
    expect(row.miles).toBeNull()
  })
})

describe('parseHistoryText — raw Carfax "Services Performed" blocks', () => {
  // Shape produced by copying a Carfax Car Care service-history page.
  const carfax = [
    'Take 5 Oil Change (https://www.carfax.com/Reviews-Take-5-Oil-Change-Livingston-TX_XHCNDLFTX8?intp=cc)',
    'Date',
    '06/22/2024',
    'Odometer',
    '69,284 mi',
    'Services Performed',
    'Vehicle serviced',
    'Cabin air filter replaced/cleaned',
    'Oil and filter changed',
    'Take 5 Oil Change (https://www.carfax.com/Reviews-Take-5-Oil-Change-Livingston-TX_XHCNDLFTX8?intp=cc)',
    'Date',
    '12/23/2023',
    'Odometer',
    '58,757 mi',
    'Services Performed',
    'Vehicle serviced',
    'Oil and filter changed',
    'Edit Record',
    'Upload Receipts',
    'Add Note',
    '7/10/26, 9:01 PM',
    '5/9',
  ].join('\n')

  it('extracts one row per service with the right date + mileage', () => {
    const rows = parseHistoryText(carfax)
    expect(rows).toEqual([
      { date: '2024-06-22', miles: 69284, service: 'Cabin air filter replaced/cleaned', category: 'cabin-air-filter' },
      { date: '2024-06-22', miles: 69284, service: 'Oil and filter changed', category: 'oil-change' },
      { date: '2023-12-23', miles: 58757, service: 'Oil and filter changed', category: 'oil-change' },
    ])
  })

  it('skips the generic "Vehicle serviced" header and page chrome', () => {
    const rows = parseHistoryText(carfax)
    expect(rows.some((r) => /vehicle serviced/i.test(r.service))).toBe(false)
    expect(rows.some((r) => /edit record|9:01 pm/i.test(r.service))).toBe(false)
  })

  it('leaves non-maintenance services (e.g. registration) for review as null category', () => {
    const reg = [
      'Texas Motor Vehicle Dept.',
      'Date',
      '03/31/2026',
      'Odometer',
      '93,437 mi',
      'Services Performed',
      'Registration issued or renewed',
    ].join('\n')
    const rows = parseHistoryText(reg)
    expect(rows).toEqual([
      { date: '2026-03-31', miles: 93437, service: 'Registration issued or renewed', category: null },
    ])
  })
})

describe('isImportable', () => {
  it('requires a date, mileage, and category', () => {
    expect(isImportable({ date: '2026-01-01', miles: 100, service: 'x', category: 'oil-change' })).toBe(true)
    expect(isImportable({ date: '2026-01-01', miles: null, service: 'x', category: 'oil-change' })).toBe(false)
    expect(isImportable({ date: null, miles: 100, service: 'x', category: 'oil-change' })).toBe(false)
    expect(isImportable({ date: '2026-01-01', miles: 100, service: 'x', category: null })).toBe(false)
  })
})

describe('baselineCategories', () => {
  it('lists the distinct category labels, sorted', () => {
    const labels = baselineCategories([
      { date: '2026-01-01', miles: 1, service: 'a', category: 'oil-change' },
      { date: '2026-01-02', miles: 2, service: 'b', category: 'oil-change' },
      { date: '2026-01-03', miles: 3, service: 'c', category: 'tire-rotation' },
      { date: '2026-01-04', miles: 4, service: 'd', category: null },
    ])
    expect(labels).toEqual(['Engine oil & filter', 'Tire rotation'])
  })
})
