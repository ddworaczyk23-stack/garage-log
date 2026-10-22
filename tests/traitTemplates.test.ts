import { describe, expect, it } from 'vitest'
import { composeTraitTemplate, parseTraitsKey, traitsKey, type VehicleTraits } from '../src/db/traitTemplates'

const base: VehicleTraits = { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'no' }
const categories = (traits: VehicleTraits) => composeTraitTemplate(traits).map((entry) => entry.category)

describe('trait templates', () => {
  it('round-trips a versioned trait key', () => {
    const traits: VehicleTraits = { power: 'turbo', trans: 'auto', drive: '4wd', belt: 'no' }
    expect(parseTraitsKey(traitsKey(traits))).toEqual(traits)
    expect(parseTraitsKey('traits:v1:gas.auto.fwd.maybe')).toBeNull()
  })

  it('gives EVs their specific maintenance list', () => {
    const entries = composeTraitTemplate({ ...base, power: 'ev', drive: 'awd', belt: 'yes' })
    const list = entries.map((entry) => entry.category)
    expect(list).not.toEqual(expect.arrayContaining(['oil-change', 'spark-plugs', 'engine-air-filter', 'transmission-fluid', 'differential-fluid', 'timing-belt']))
    expect(entries.find((entry) => entry.category === 'battery-check')?.label).toBe('12V battery check')
    const coolant = entries.find((entry) => entry.category === 'coolant')
    expect(coolant?.label).toBe('Battery coolant check')
    expect(coolant?.factoryInterval).toEqual({ miles: null, months: 48 })
  })

  it('selects exactly one transmission block', () => {
    expect(categories({ ...base, trans: 'cvt' })).toContain('cvt-fluid')
    expect(categories({ ...base, trans: 'cvt' })).not.toContain('transmission-fluid')
    expect(categories({ ...base, power: 'hybrid', trans: 'cvt' })).not.toEqual(expect.arrayContaining(['cvt-fluid', 'transmission-fluid']))
  })

  it('applies diesel, drive, and belt modules', () => {
    const diesel = categories({ ...base, power: 'diesel', drive: '4wd' })
    expect(diesel).toEqual(expect.arrayContaining(['fuel-filter', 'transfer-case-fluid', 'differential-fluid']))
    expect(diesel).not.toContain('spark-plugs')
    expect(categories({ ...base, belt: 'yes' })).toContain('timing-belt')
    expect(categories({ ...base, belt: 'no' })).not.toContain('timing-belt')
  })

  it('never creates duplicate categories for valid trait combinations', () => {
    const powers: VehicleTraits['power'][] = ['gas', 'turbo', 'diesel', 'hybrid', 'ev']
    const transmissions: VehicleTraits['trans'][] = ['auto', 'cvt', 'dct', 'manual', 'none']
    const drives: VehicleTraits['drive'][] = ['fwd', 'rwd', 'awd', '4wd', 'none']
    const belts: VehicleTraits['belt'][] = ['yes', 'no']
    for (const power of powers) for (const trans of transmissions) for (const drive of drives) for (const belt of belts) {
      const list = categories({ power, trans, drive, belt })
      expect(new Set(list).size).toBe(list.length)
    }
  })
})
