import { describe, it, expect } from 'vitest'
import {
  milesThisYear,
  estimateAnnualMileage,
  resolveAnnualMileage,
  projectDueDate,
  projectMileage,
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

describe('projectMileage', () => {
  const asOf = new Date('2026-07-01T12:00:00')

  it('rolls the last real reading forward at the yearly rate', () => {
    const p = projectMileage({ miles: 40000, asOfDate: '2026-01-01' }, 12000, asOf)
    // 181 days at 12,000 mi/yr ≈ 5,947 mi
    expect(p.miles).toBe(40000 + Math.round((12000 * 181) / 365.25))
    expect(p.isProjected).toBe(true)
    expect(p.asOfDate).toBe('2026-07-01')
    expect(p.lastActual).toEqual({ miles: 40000, asOfDate: '2026-01-01' })
  })

  it('uses a reading from today (or the future) as-is', () => {
    expect(projectMileage({ miles: 50000, asOfDate: '2026-07-01' }, 12000, asOf)).toMatchObject({
      miles: 50000,
      isProjected: false,
    })
    expect(projectMileage({ miles: 50000, asOfDate: '2026-08-01' }, 12000, asOf).miles).toBe(50000)
  })

  it('does not project with a non-positive rate', () => {
    expect(projectMileage({ miles: 1, asOfDate: '2020-01-01' }, 0, asOf)).toMatchObject({
      miles: 1,
      isProjected: false,
    })
  })
})

describe('milesThisYear', () => {
  it('a same-day service and reading use the higher reading as latest (no false 0)', () => {
    const points = [
      { date: '2026-03-01', miles: 89500 },
      { date: '2026-10-13', miles: 89500 },
      { date: '2026-10-13', miles: 89620 },
    ]
    expect(milesThisYear(points, 2026)).toBe(120)
  })

  it('interpolates Jan 1 between the readings on either side of it', () => {
    // 2025-07-01 -> 2026-07-01 is 365 days; Jan 1 is 184 days in.
    const points = [
      { date: '2025-07-01', miles: 80000 },
      { date: '2026-07-01', miles: 86000 },
    ]
    expect(milesThisYear(points, 2026)).toBe(86000 - Math.round(80000 + 6000 * (184 / 365)))
  })

  it('does not count last year\'s driving when the pre-year reading is old', () => {
    const points = [
      { date: '2025-05-20', miles: 76000 },
      { date: '2026-01-10', miles: 82100 },
      { date: '2026-10-05', miles: 90650 },
    ]
    const ytd = milesThisYear(points, 2026)!
    expect(ytd).toBeGreaterThan(8550) // a little more than since Jan 10
    expect(ytd).toBeLessThan(8800)
  })

  it('returns null when every reading is from last year', () => {
    const points = [
      { date: '2025-12-20', miles: 80000 },
      { date: '2025-12-01', miles: 79000 },
    ]
    expect(milesThisYear(points, 2026)).toBeNull()
  })

  it('is null with fewer than two points', () => {
    expect(milesThisYear([{ date: '2026-01-05', miles: 1000 }], 2026)).toBeNull()
  })
})
