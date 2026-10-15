import { describe, expect, it } from 'vitest'
import { diffSchedules, traitSummary, canChangeTraits } from '../src/domain/traitChange'
import { rulesForVehicle } from '../src/db/scheduleTemplates'
import { traitsKey } from '../src/db/traitTemplates'

const cvt = traitsKey({ power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'no' })
describe('trait changes', () => {
  it('summarizes traits and refuses curated schedules', () => {
    expect(traitSummary({ power: 'gas', trans: 'auto', drive: 'awd', belt: 'no' })).toBe('Gas · Automatic · AWD · Timing chain')
    expect(canChangeTraits(cvt)).toBe(true)
    expect(canChangeTraits('f150-2020')).toBe(false)
  })
  it('diffs CVT to automatic with a timing belt', () => {
    const diff = diffSchedules(rulesForVehicle('v', cvt), traitsKey({ power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' }))
    expect(diff.added).toEqual(expect.arrayContaining(['transmission-fluid', 'timing-belt']))
    expect(diff.removed.map((rule) => rule.category)).toContain('cvt-fluid')
    expect(diff.kept.map((rule) => rule.category)).toContain('oil-change')
  })
})
