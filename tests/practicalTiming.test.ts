import { describe, it, expect } from 'vitest'
import { practicalInterval } from '../src/domain/practicalTiming'

describe('practicalInterval', () => {
  it('shortens the factory interval for a category with a heuristic', () => {
    const { interval, note } = practicalInterval({ miles: 10000, months: 12 }, 'oil-change')
    expect(interval.miles).toBeLessThan(10000)
    expect(interval.months).toBeLessThan(12)
    expect(note).toMatch(/short trips|degrade/i)
  })

  it('rounds miles to the nearest 500', () => {
    const { interval } = practicalInterval({ miles: 10000, months: null }, 'oil-change')
    expect(interval.miles! % 500).toBe(0)
  })

  it('falls back to the factory interval unchanged for a category with no heuristic', () => {
    const { interval, note } = practicalInterval({ miles: 30000, months: null }, 'spark-plugs')
    expect(interval).toEqual({ miles: 30000, months: null })
    expect(note).toMatch(/no category-specific adjustment/i)
  })

  it('passes condition-based intervals through untouched', () => {
    const factory = { miles: null, months: null, conditionBased: true }
    const { interval, note } = practicalInterval(factory, 'wheel-alignment')
    expect(interval).toBe(factory)
    expect(note).toMatch(/condition-based/i)
  })

  it('never produces a negative or zero months value', () => {
    const { interval } = practicalInterval({ miles: null, months: 1 }, 'brake-fluid')
    expect(interval.months).toBeGreaterThanOrEqual(1)
  })
})
