import { describe, it, expect } from 'vitest'
import { parseQuickEntry } from '../src/domain/quickEntry'

describe('parseQuickEntry', () => {
  it('detects category, cost, and vendor from a natural sentence', () => {
    const r = parseQuickEntry('Oil change at Jiffy Lube, $45.99')
    expect(r.category).toBe('oil-change')
    expect(r.additionalCategories).toEqual([])
    expect(r.cost).toBe(45.99)
    expect(r.vendor).toBe('Jiffy Lube')
    expect(r.hadMatch).toBe(true)
  })

  it('promotes the primary category and keeps the rest as additional', () => {
    const r = parseQuickEntry('Oil change and tire rotation, $89')
    expect(r.category).toBe('oil-change')
    expect(r.additionalCategories).toEqual(['tire-rotation'])
    expect(r.cost).toBe(89)
  })

  it('does not misfire a vendor on lowercase phrasing', () => {
    const r = parseQuickEntry('Replaced the battery by hand')
    expect(r.vendor).toBeNull()
  })

  it('returns a null cost when no dollar amount is present', () => {
    const r = parseQuickEntry('Replaced wiper blades')
    expect(r.cost).toBeNull()
  })

  it('reports hadMatch=false when no category keyword is found, even if other fields matched', () => {
    const r = parseQuickEntry('Paid $45 for something')
    expect(r.category).toBeNull()
    expect(r.cost).toBe(45)
    expect(r.hadMatch).toBe(false)
  })

  it('returns an all-empty result for blank input', () => {
    const r = parseQuickEntry('   ')
    expect(r).toEqual({ category: null, additionalCategories: [], cost: null, vendor: null, hadMatch: false })
  })

  it('caps the vendor phrase at 4 words', () => {
    const r = parseQuickEntry('Oil change at Ford Lincoln Mercury Dealership Downtown, $200')
    expect(r.vendor).toBe('Ford Lincoln Mercury Dealership')
  })

  it('never throws on arbitrary text', () => {
    expect(() => parseQuickEntry('$$$ at at at from from !!! ###')).not.toThrow()
  })
})
