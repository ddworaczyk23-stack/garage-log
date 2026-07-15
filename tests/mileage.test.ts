import { describe, it, expect } from 'vitest'
import {
  estimateAnnualMileage,
  resolveAnnualMileage,
  projectDueDate,
  MIN_ESTIMATE_DAYS,
} from '../src/domain/mileage'

describe('estimateAnnualMileage', () => {
  it('annualizes miles accrued over the logged span', () => {
    // 6,000 mi over exactly 365.25 days -> ~6,000/yr.
    const est = estimateAnnualMileage([
      { date: '2025-01-01', miles: 40000 },
      { date: '2026-01-01', miles: 46000 },
    ])
    expect(est).not.toBeNull()
    expect(est!.annual).toBe(6004) // 6000 / 365 * 365.25, rounded
    expect(est!.milesDelta).toBe(6000)
  })

  it('uses the earliest and latest dated points regardless of input order', () => {
    const est = estimateAnnualMileage([
      { date: '2025-07-01', miles: 43000 },
      { date: '2026-01-01', miles: 46000 },
      { date: '2025-01-01', miles: 40000 },
    ])
    expect(est!.milesDelta).toBe(6000) // 46000 - 40000
  })

  it('returns null when the span is shorter than the minimum', () => {
    // ~50 days apart, below MIN_ESTIMATE_DAYS (60).
    expect(MIN_ESTIMATE_DAYS).toBeGreaterThan(50)
    const est = estimateAnnualMileage([
      { date: '2026-01-01', miles: 40000 },
      { date: '2026-02-20', miles: 41000 },
    ])
    expect(est).toBeNull()
  })

  it('returns null with fewer than two points or no forward mileage', () => {
    expect(estimateAnnualMileage([{ date: '2026-01-01', miles: 40000 }])).toBeNull()
    expect(
      estimateAnnualMileage([
        { date: '2025-01-01', miles: 40000 },
        { date: '2026-01-01', miles: 40000 }, // no miles gained
      ]),
    ).toBeNull()
  })
})

describe('resolveAnnualMileage', () => {
  it('prefers a positive override, then calculated, then the fallback', () => {
    expect(resolveAnnualMileage(15000, 9000, 12000)).toEqual({ value: 15000, source: 'custom' })
    expect(resolveAnnualMileage(null, 9000, 12000)).toEqual({ value: 9000, source: 'calculated' })
    expect(resolveAnnualMileage(null, null, 12000)).toEqual({ value: 12000, source: 'default' })
  })

  it('skips non-positive values at each tier', () => {
    expect(resolveAnnualMileage(0, 9000, 12000).source).toBe('calculated')
    expect(resolveAnnualMileage(null, 0, 12000).source).toBe('default')
  })
})

describe('projectDueDate', () => {
  const asOf = new Date('2026-01-01T00:00:00')

  it('projects a future date from remaining miles and the yearly rate', () => {
    // 6,000 mi left at 12,000 mi/yr = half a year ~ 183 days -> 2026-07-03.
    expect(projectDueDate(6000, 12000, asOf)).toBe('2026-07-03')
  })

  it('returns null when already due, unprojectable, or the rate is non-positive', () => {
    expect(projectDueDate(0, 12000, asOf)).toBeNull()
    expect(projectDueDate(-500, 12000, asOf)).toBeNull()
    expect(projectDueDate(null, 12000, asOf)).toBeNull()
    expect(projectDueDate(6000, 0, asOf)).toBeNull()
  })
})
