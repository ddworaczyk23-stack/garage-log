import { describe, it, expect } from 'vitest'
import { estimateCostRange, deriveCostConfidence, DEFAULT_LABOR_RATE_PER_HOUR } from '../src/domain/costHeuristics'

describe('estimateCostRange', () => {
  it('combines labor cost with the parts range using the default rate', () => {
    const r = estimateCostRange(0.5, 40, 90)
    expect(r.laborCost).toBe(Math.round(0.5 * DEFAULT_LABOR_RATE_PER_HOUR))
    expect(r.totalLow).toBe(r.laborCost + 40)
    expect(r.totalHigh).toBe(r.laborCost + 90)
  })

  it('accepts a custom rate', () => {
    const r = estimateCostRange(1, 0, 0, 100)
    expect(r.laborCost).toBe(100)
    expect(r.totalLow).toBe(100)
    expect(r.totalHigh).toBe(100)
  })

  it('rounds to whole dollars', () => {
    const r = estimateCostRange(0.33, 10.4, 10.6)
    expect(Number.isInteger(r.laborCost)).toBe(true)
    expect(Number.isInteger(r.totalLow)).toBe(true)
    expect(Number.isInteger(r.totalHigh)).toBe(true)
  })
})

describe('deriveCostConfidence', () => {
  it('is high only when both labor and parts came from provider data', () => {
    expect(deriveCostConfidence(true, true)).toBe('high')
  })
  it('is medium when only one side is provider-sourced', () => {
    expect(deriveCostConfidence(true, false)).toBe('medium')
    expect(deriveCostConfidence(false, true)).toBe('medium')
  })
  it('is low when neither side is provider-sourced', () => {
    expect(deriveCostConfidence(false, false)).toBe('low')
  })
})
