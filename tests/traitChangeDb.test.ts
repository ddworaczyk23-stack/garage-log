import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/db'
import { changeVehicleTraits } from '../src/db/traitChange'
import { rulesForVehicle } from '../src/db/scheduleTemplates'
import { traitsKey } from '../src/db/traitTemplates'
import { seedIfEmpty } from '../src/db/seed'

const oldKey = traitsKey({ power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'no' })
const off = { kind: 'not-needed' as const, note: null, atDate: null, atMiles: null }
const rulesOf = (id: string) => db.reminderRules.where('vehicleId').equals(id).toArray()

beforeEach(async () => {
  await Promise.all([db.vehicles.clear(), db.reminderRules.clear(), db.events.clear()])
})

describe('changeVehicleTraits', () => {
  it('keeps settings, deletes removed rules, and uses event history for additions', async () => {
    const rules = rulesForVehicle('veh-change', oldKey)
    rules.find((rule) => rule.category === 'oil-change')!.customIntervalMiles = 4000
    await db.reminderRules.bulkAdd(rules)
    await db.events.add({ id: 'evt-cvt', vehicleId: 'veh-change', kind: 'maintenance', date: '2025-06-01', odometerMiles: 25000, category: 'cvt-fluid', title: 'CVT', cost: 0, documentIds: [] })
    await db.events.add({ id: 'evt-trans', vehicleId: 'veh-change', kind: 'maintenance', date: '2026-01-01', odometerMiles: 30000, category: 'transmission-fluid', title: 'Fluid', cost: 0, documentIds: [] })

    await changeVehicleTraits('veh-change', { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' })
    const updated = await rulesOf('veh-change')
    const newKey = traitsKey({ power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' })
    expect(updated.find((rule) => rule.category === 'cvt-fluid')).toBeUndefined()
    expect(await db.events.get('evt-cvt')).toBeTruthy()
    expect(updated.find((rule) => rule.category === 'oil-change')?.customIntervalMiles).toBe(4000)
    expect(updated.find((rule) => rule.category === 'transmission-fluid')).toMatchObject({ lastDoneDate: '2026-01-01', lastDoneMiles: 30000, override: null })
    expect(updated.every((rule) => rule.templateKey === newKey)).toBe(true)
  })

  it('updates labels to the new schedule (dual-clutch to automatic)', async () => {
    await db.reminderRules.bulkAdd(rulesForVehicle('veh-dct', traitsKey({ power: 'gas', trans: 'dct', drive: 'fwd', belt: 'no' })))
    expect((await rulesOf('veh-dct')).find((rule) => rule.category === 'transmission-fluid')?.label).toMatch(/Dual-clutch/)
    await changeVehicleTraits('veh-dct', { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'no' })
    expect((await rulesOf('veh-dct')).find((rule) => rule.category === 'transmission-fluid')?.label).toBe('Transmission fluid')
  })

  it('turns a "Not sure" row on for Yes, and adds a new "Not sure" row switched off', async () => {
    const key = traitsKey({ power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'yes' })
    await db.reminderRules.bulkAdd(rulesForVehicle('veh-unsure', key).map((rule) => (rule.category === 'timing-belt' ? { ...rule, override: off } : rule)))
    await changeVehicleTraits('veh-unsure', { power: 'gas', trans: 'none', drive: 'fwd', belt: 'yes' })
    const updated = await rulesOf('veh-unsure')
    expect(updated.find((rule) => rule.category === 'timing-belt')?.override).toBeNull()
    expect(updated.find((rule) => rule.category === 'transmission-fluid')?.override?.kind).toBe('not-needed')
  })

  it('refuses hand-built schedules and survives the boot reconcile', async () => {
    await db.reminderRules.bulkAdd(rulesForVehicle('veh-f150', 'f150-2020'))
    await expect(changeVehicleTraits('veh-f150', { power: 'turbo', trans: 'auto', drive: '4wd', belt: 'no' })).rejects.toThrow()

    await db.vehicles.add({ id: 'veh-boot', name: 'Car', year: 2020, make: 'Mazda', model: '3', trim: '', engine: '', drivetrain: '', createdAt: new Date().toISOString() })
    await db.reminderRules.bulkAdd(rulesForVehicle('veh-boot', oldKey))
    await changeVehicleTraits('veh-boot', { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'no' })
    const before = (await rulesOf('veh-boot')).length
    await seedIfEmpty()
    const after = await rulesOf('veh-boot')
    expect(after.length).toBe(before)
    expect(after.find((rule) => rule.category === 'cvt-fluid')).toBeUndefined()
  })
})
