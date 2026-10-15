import { describe, expect, it } from 'vitest'
import { answersFromRules, canChangeTraits, diffSchedules, sameAnswers, traitSummary } from '../src/domain/traitChange'
import { GENERIC_TEMPLATE_KEY, rulesForVehicle } from '../src/db/scheduleTemplates'
import { traitsKey } from '../src/db/traitTemplates'
import type { TraitAnswers } from '../src/domain/scheduleReview'

const cvtAnswers: TraitAnswers = { power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'no' }
const cvt = traitsKey({ power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'no' })
const off = { kind: 'not-needed' as const, note: null, atDate: null, atMiles: null }

describe('trait changes', () => {
  it('summarizes answers and refuses curated schedules', () => {
    expect(traitSummary({ power: 'gas', trans: 'auto', drive: 'awd', belt: 'no' })).toBe('Gas · Automatic · AWD · Timing chain')
    expect(traitSummary({ power: 'ev', trans: 'none', drive: 'none', belt: 'not-sure' })).toBe('Electric')
    expect(canChangeTraits(cvt)).toBe(true)
    expect(canChangeTraits(GENERIC_TEMPLATE_KEY)).toBe(true)
    expect(canChangeTraits('f150-2020')).toBe(false)
  })

  it('diffs CVT to automatic with a timing belt', () => {
    const diff = diffSchedules(rulesForVehicle('v', cvt), { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' })
    expect(diff.added).toEqual(expect.arrayContaining(['transmission-fluid', 'timing-belt']))
    expect(diff.removed.map((rule) => rule.category)).toContain('cvt-fluid')
    expect(diff.kept.map((rule) => rule.category)).toContain('oil-change')
    expect(diff.unsure).toEqual([])
  })

  it('reads "Not sure" back from switched-off rows', () => {
    const key = traitsKey({ power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' })
    const rules = rulesForVehicle('v', key).map((rule) =>
      rule.category === 'timing-belt' || rule.category === 'transmission-fluid' ? { ...rule, override: off } : rule,
    )
    expect(answersFromRules(rules)).toEqual({ power: 'gas', trans: 'none', drive: 'fwd', belt: 'not-sure' })
    expect(answersFromRules(rulesForVehicle('v', GENERIC_TEMPLATE_KEY)).belt).toBe('not-sure')
  })

  it('switches a "Not sure" row on when the answer becomes Yes', () => {
    const key = traitsKey({ power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'yes' })
    const rules = rulesForVehicle('v', key).map((rule) => (rule.category === 'timing-belt' ? { ...rule, override: off } : rule))
    const next: TraitAnswers = { ...cvtAnswers, belt: 'yes' }
    expect(sameAnswers(answersFromRules(rules), next)).toBe(false)
    const diff = diffSchedules(rules, next)
    expect(diff.added).toEqual([])
    expect(diff.turnedOn).toEqual(['timing-belt'])
  })
})
