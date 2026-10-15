import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/db'
import { changeVehicleTraits } from '../src/db/traitChange'
import { rulesForVehicle } from '../src/db/scheduleTemplates'
import { traitsKey } from '../src/db/traitTemplates'

const oldKey = traitsKey({ power: 'gas', trans: 'cvt', drive: 'fwd', belt: 'no' })
beforeEach(async () => { await Promise.all([db.reminderRules.clear(), db.events.clear()]) })
describe('changeVehicleTraits', () => {
  it('preserves kept settings, deletes removed rules and uses matching event history for additions', async () => {
    const rules = rulesForVehicle('veh-change', oldKey)
    const oil = rules.find((rule) => rule.category === 'oil-change')!
    oil.customIntervalMiles = 4000
    await db.reminderRules.bulkAdd(rules)
    await db.events.add({ id: 'evt-trans', vehicleId: 'veh-change', kind: 'maintenance', date: '2026-01-01', odometerMiles: 30000, category: 'transmission-fluid', title: 'Fluid', cost: 0, documentIds: [] })
    await changeVehicleTraits('veh-change', { power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' })
    const updated = await db.reminderRules.where('vehicleId').equals('veh-change').toArray()
    expect(updated.find((rule) => rule.category === 'cvt-fluid')).toBeUndefined()
    expect(await db.events.get('evt-trans')).toBeTruthy()
    expect(updated.find((rule) => rule.category === 'oil-change')?.customIntervalMiles).toBe(4000)
    expect(updated.find((rule) => rule.category === 'transmission-fluid')).toMatchObject({ lastDoneDate: '2026-01-01', lastDoneMiles: 30000 })
    expect(updated.every((rule) => rule.templateKey === traitsKey({ power: 'gas', trans: 'auto', drive: 'fwd', belt: 'yes' }))).toBe(true)
  })
})
