import { describe, it, expect } from 'vitest'
import {
  formatInterval,
  formatMiles,
  formatMoney,
  formatShortDate,
  localDateISO,
  parseNumberInput,
} from '../src/domain/format'

describe('formatShortDate', () => {
  it('formats an ISO date as a readable label', () => {
    expect(formatShortDate('2026-03-01')).toBe('Mar 1, 2026')
    expect(formatShortDate('2026-12-25')).toBe('Dec 25, 2026')
  })

  it('ignores any time component and never shifts the day (no Date/TZ math)', () => {
    expect(formatShortDate('2026-01-01T00:00:00.000Z')).toBe('Jan 1, 2026')
  })

  it('returns an em dash for null/blank', () => {
    expect(formatShortDate(null)).toBe('—')
    expect(formatShortDate(undefined)).toBe('—')
    expect(formatShortDate('')).toBe('—')
  })

  it('falls back to the raw input if it is unparseable', () => {
    expect(formatShortDate('not-a-date')).toBe('not-a-date')
    expect(formatShortDate('2026-13-40')).toBe('2026-13-40')
  })
})

describe('formatMiles', () => {
  it('adds thousands separators and a unit', () => {
    expect(formatMiles(40000)).toBe('40,000 mi')
    expect(formatMiles(0)).toBe('0 mi')
  })

  it('rounds fractional mileage', () => {
    expect(formatMiles(1234.6)).toBe('1,235 mi')
  })

  it('returns an em dash for null/NaN', () => {
    expect(formatMiles(null)).toBe('—')
    expect(formatMiles(undefined)).toBe('—')
    expect(formatMiles(NaN)).toBe('—')
  })
})

describe('formatMoney', () => {
  it('always shows two decimals', () => {
    expect(formatMoney(65)).toBe('$65.00')
    expect(formatMoney(65.5)).toBe('$65.50')
  })

  it('treats null/undefined as zero', () => {
    expect(formatMoney(null)).toBe('$0.00')
    expect(formatMoney(undefined)).toBe('$0.00')
  })
})

describe('formatInterval (unchanged M2 helper — guarded against regressions)', () => {
  it('formats miles + months and condition-based intervals', () => {
    expect(formatInterval(5000, 6)).toBe('Every 5,000 mi or 6 mo')
    expect(formatInterval(10000, 12)).toBe('Every 10,000 mi or 1 yr')
    expect(formatInterval(null, null, true)).toBe('Inspect / condition-based')
    expect(formatInterval(null, null)).toBe('As needed')
  })
})

describe('localDateISO', () => {
  it('formats using local calendar components, not UTC', () => {
    // 11:30pm local — a naive toISOString() UTC read would land on the next
    // day for any zone behind UTC (all US zones), which was the M13 bug.
    const d = new Date(2026, 0, 15, 23, 30)
    expect(localDateISO(d)).toBe('2026-01-15')
  })

  it('zero-pads single-digit months/days', () => {
    expect(localDateISO(new Date(2026, 2, 5))).toBe('2026-03-05')
  })
})

describe('parseNumberInput', () => {
  it('parses a plain numeric string', () => {
    expect(parseNumberInput('12000')).toBe(12000)
    expect(parseNumberInput('  42  ')).toBe(42)
  })

  it('returns null for blank input', () => {
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('   ')).toBeNull()
  })

  it('returns null (never NaN) for non-numeric input', () => {
    expect(parseNumberInput('12k')).toBeNull()
    expect(parseNumberInput('not-a-number')).toBeNull()
  })
})
