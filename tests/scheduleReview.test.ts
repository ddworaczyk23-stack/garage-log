import { describe, expect, it } from 'vitest'
import { applyScheduleEdits, blankScheduleEdit, intervalChanged, resolveTraitAnswers, reviewItems, scheduleGroup, seedUnsureEdits, validateEdit } from '../src/domain/scheduleReview'
import { rulesForVehicle } from '../src/db/scheduleTemplates'
import { parseTraitsKey, traitsKey, type VehicleTraits } from '../src/db/traitTemplates'

const traits: VehicleTraits = { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'no' }
const key = traitsKey(traits)
const rules = rulesForVehicle('veh-test', key)

describe('schedule review', () => {
  it('groups template entries and recognizes collapsed maker/suggested intervals', () => {
    expect(scheduleGroup('oil-change')).toBe('Engine')
    expect(scheduleGroup('tire-rotation')).toBe('Tires and brakes')
    expect(scheduleGroup('coolant')).toBe('Fluids')
    expect(scheduleGroup('battery-check')).toBe('Other')
    const oil = reviewItems(key).find((item) => item.category === 'oil-change')!
    expect(oil.suggested).toEqual({ miles: 5000, months: 6 })
    const transmission = reviewItems(key).find((item) => item.category === 'transmission-fluid')!
    expect(transmission.maker).toEqual(transmission.suggested)
  })

  it('applies off, custom, maker, and prior-history edits', () => {
    const edited = applyScheduleEdits(rules, {
      'engine-air-filter': { ...blankScheduleEdit(), enabled: false, lastDoneDate: '2026-01-01' },
      'oil-change': { ...blankScheduleEdit(), customMiles: 4000, customMonths: 5, lastDoneDate: '2026-01-02', lastDoneMiles: 30000 },
      'cabin-air-filter': { ...blankScheduleEdit(), customMiles: 30000, customMonths: 36 },
    })
    const air = edited.find((rule) => rule.category === 'engine-air-filter')!
    expect(air.override?.kind).toBe('not-needed')
    const oil = edited.find((rule) => rule.category === 'oil-change')!
    expect(oil.customIntervalMiles).toBe(4000)
    expect(oil.override).toMatchObject({ kind: 'already-replaced', atDate: '2026-01-02', atMiles: 30000 })
    const cabin = edited.find((rule) => rule.category === 'cabin-air-filter')!
    expect(cabin.customIntervalMiles).toBe(30000)
  })

  it('does not persist a custom interval when it equals suggested', () => {
    const edited = applyScheduleEdits(rules, { 'oil-change': { ...blankScheduleEdit(), customMiles: 5000, customMonths: 6 } })
    const oil = edited.find((rule) => rule.category === 'oil-change')!
    expect(oil.customIntervalMiles).toBeNull()
    expect(oil.customIntervalMonths).toBeNull()
  })

  it('validates custom intervals and last-done values', () => {
    expect(validateEdit({ ...blankScheduleEdit(), customMiles: 0 }, 50000, '2026-10-15').custom).toBeTruthy()
    expect(validateEdit({ ...blankScheduleEdit(), lastDoneDate: '2026-10-16' }, 50000, '2026-10-15').lastDoneDate).toBeTruthy()
    expect(validateEdit({ ...blankScheduleEdit(), lastDoneMiles: 50001 }, 50000, '2026-10-15').lastDoneMiles).toBeTruthy()
  })

  it('flags a changed interval only when it differs from suggested', () => {
    const oil = reviewItems(key).find((item) => item.category === 'oil-change')!
    expect(intervalChanged(blankScheduleEdit(), oil)).toBe(false)
    expect(intervalChanged({ ...blankScheduleEdit(), customMiles: 5000, customMonths: 6 }, oil)).toBe(false)
    expect(intervalChanged({ ...blankScheduleEdit(), customMiles: 4000, customMonths: 6 }, oil)).toBe(true)
  })

  it('requires miles or months only while a row is in Custom mode', () => {
    expect(validateEdit(blankScheduleEdit(), null, '2026-10-15').custom).toBeUndefined()
    expect(validateEdit(blankScheduleEdit(), null, '2026-10-15', true).custom).toBeTruthy()
    expect(validateEdit({ ...blankScheduleEdit(), customMonths: 6 }, null, '2026-10-15', true).custom).toBeUndefined()
  })

  it('keeps "Not sure" timing-belt and transmission rows, switched off', () => {
    const { traits: resolved, unsure } = resolveTraitAnswers({ power: 'gas', trans: 'none', drive: 'fwd', belt: 'not-sure' })
    expect(resolved).toEqual({ power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' })
    expect(parseTraitsKey(traitsKey(resolved))).toEqual(resolved)
    expect(unsure).toEqual(['transmission-fluid', 'timing-belt'])
    const categories = reviewItems(traitsKey(resolved)).map((item) => item.category)
    expect(categories).toEqual(expect.arrayContaining(['transmission-fluid', 'timing-belt']))
    const edits = seedUnsureEdits({}, unsure)
    expect(edits['timing-belt']?.enabled).toBe(false)
    expect(edits['transmission-fluid']?.enabled).toBe(false)
  })

  it('marks nothing unsure for sure answers or where the item cannot apply', () => {
    expect(resolveTraitAnswers({ power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'no' }).unsure).toEqual([])
    const hybrid = resolveTraitAnswers({ power: 'hybrid', trans: 'none', drive: 'fwd', belt: 'yes' })
    expect(hybrid.traits.trans).toBe('none')
    expect(hybrid.unsure).toEqual([])
    const ev = resolveTraitAnswers({ power: 'ev', trans: 'none', drive: 'awd', belt: 'not-sure' })
    expect(ev.traits.belt).toBe('no')
    expect(ev.unsure).toEqual([])
  })

  it('does not overwrite a row the user already set', () => {
    const userOn = { ...blankScheduleEdit(), lastDoneMiles: 90000 }
    const edits = seedUnsureEdits({ 'timing-belt': userOn }, ['timing-belt', 'transmission-fluid'])
    expect(edits['timing-belt']).toBe(userOn)
    expect(edits['transmission-fluid']?.enabled).toBe(false)
  })

  it('saves unsure rows left off as not-needed, and switched-on rows as tracked', () => {
    const { traits: resolved, unsure } = resolveTraitAnswers({ power: 'gas', trans: 'none', drive: 'fwd', belt: 'not-sure' })
    const unsureRules = rulesForVehicle('veh-test', traitsKey(resolved))
    const seeded = seedUnsureEdits({}, unsure)
    const off = applyScheduleEdits(unsureRules, seeded)
    expect(off.find((rule) => rule.category === 'timing-belt')!.override?.kind).toBe('not-needed')
    expect(off.find((rule) => rule.category === 'transmission-fluid')!.override?.kind).toBe('not-needed')
    const on = applyScheduleEdits(unsureRules, { ...seeded, 'timing-belt': { ...seeded['timing-belt']!, enabled: true } })
    expect(on.find((rule) => rule.category === 'timing-belt')!.override).toBeNull()
    expect(on.find((rule) => rule.category === 'transmission-fluid')!.override?.kind).toBe('not-needed')
  })
})
