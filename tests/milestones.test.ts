import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/db'
import {
  MILESTONE_ITEM_CATEGORY,
  buildMilestoneChecklist,
  componentProfile,
  milestoneMileages,
  milestoneOverview,
  milestoneState,
  type ComponentProfile,
} from '../src/domain/milestones'
import {
  completeMilestone,
  reopenMilestone,
  setMilestoneItem,
  setMilestoneItemOk,
  setMilestoneItemServiced,
  skipMilestone,
} from '../src/db/milestones'
import { rulesForVehicle } from '../src/db/scheduleTemplates'
import type { Vehicle } from '../src/types'

const F150 = componentProfile({ engine: '2.7L EcoBoost V6', drivetrain: '4WD' }, [
  'oil-change',
  'transmission-fluid',
  'transfer-case-fluid',
  'differential-fluid',
])
const ROGUE = componentProfile({ engine: '2.5L I4', drivetrain: 'FWD' }, ['oil-change', 'cvt-fluid'])

const ids = (miles: number, p: ComponentProfile) => buildMilestoneChecklist(miles, p).map((i) => i.id)

describe('componentProfile', () => {
  it('reads a turbo 4WD automatic truck', () => {
    expect(F150).toEqual({
      turbo: true,
      fourWheel: true,
      cvAxles: false,
      driveshaft: true,
      cvt: false,
      automatic: true,
    })
  })

  it('reads a naturally aspirated FWD CVT crossover', () => {
    expect(ROGUE).toEqual({
      turbo: false,
      fourWheel: false,
      cvAxles: true,
      driveshaft: false,
      cvt: true,
      automatic: false,
    })
  })

  it('treats AWD as CV axles + four-wheel, no driveshaft assumption', () => {
    const p = componentProfile({ engine: '', drivetrain: 'AWD' }, [])
    expect(p).toMatchObject({ fourWheel: true, cvAxles: true, driveshaft: false })
  })
})

describe('milestoneMileages', () => {
  it('is 30k steps plus the 100k major, at least through 150k', () => {
    expect(milestoneMileages(0)).toEqual([30_000, 60_000, 90_000, 100_000, 120_000, 150_000])
  })
  it('extends past 150k as the odometer grows', () => {
    expect(milestoneMileages(210_000).slice(-2)).toEqual([180_000, 210_000])
  })
})

describe('buildMilestoneChecklist', () => {
  it('30k is the base checkup, tailored by component', () => {
    expect(ids(30_000, F150)).toEqual(expect.arrayContaining(['driveshaft', 'turbo-intake', 'oil-filter']))
    expect(ids(30_000, F150)).not.toContain('cv-boots')
    expect(ids(30_000, ROGUE)).toContain('cv-boots')
    expect(ids(30_000, ROGUE)).not.toContain('brake-fluid')
  })

  it('60k adds the drivetrain fluids that this car actually has', () => {
    expect(ids(60_000, F150)).toEqual(
      expect.arrayContaining(['brake-fluid', 'transmission-fluid', 'transfer-case', 'differentials', 'spark-plugs-turbo']),
    )
    const rogue = ids(60_000, ROGUE)
    expect(rogue).toContain('cvt-fluid')
    expect(rogue).not.toContain('transmission-fluid')
    expect(rogue).not.toContain('transfer-case')
  })

  it('100k major service: plugs for non-turbo, coolant, belt, timing check; no duplicate ids', () => {
    const rogue = ids(100_000, ROGUE)
    expect(rogue).toEqual(expect.arrayContaining(['spark-plugs', 'coolant', 'serpentine-belt', 'timing', 'cvt-fluid']))
    expect(ids(100_000, F150)).not.toContain('spark-plugs')
    for (const m of milestoneMileages(300_000)) {
      for (const p of [F150, ROGUE]) {
        const list = ids(m, p)
        expect(new Set(list).size).toBe(list.length)
      }
    }
  })

  it('150k adds high-mileage items', () => {
    expect(ids(150_000, ROGUE)).toEqual(expect.arrayContaining(['o2-sensors', 'fuel-system']))
    expect(ids(120_000, ROGUE)).not.toContain('o2-sensors')
  })
})

describe('MILESTONE_ITEM_CATEGORY', () => {
  it('maps only ids that a checklist can produce', () => {
    const all: ComponentProfile = { turbo: true, fourWheel: true, cvAxles: true, driveshaft: true, cvt: false, automatic: true }
    const ids = new Set(
      [100_000, 120_000, 300_000]
        .flatMap((m) => [
          ...buildMilestoneChecklist(m, all),
          ...buildMilestoneChecklist(m, { ...all, turbo: false, cvt: true }),
        ])
        .map((i) => i.id),
    )
    for (const id of Object.keys(MILESTONE_ITEM_CATEGORY)) expect(ids).toContain(id)
  })

  it('never maps an inspection to a replacement', () => {
    expect(MILESTONE_ITEM_CATEGORY.timing).toBeUndefined()
    expect(MILESTONE_ITEM_CATEGORY.brakes).toBe('brake-inspection')
  })
})

describe('milestoneState / milestoneOverview', () => {
  it('derives state from mileage and the record', () => {
    expect(milestoneState(60_000, 50_000, undefined)).toBe('upcoming')
    expect(milestoneState(60_000, 57_500, undefined)).toBe('due')
    expect(milestoneState(60_000, 65_000, undefined)).toBe('due')
    expect(milestoneState(60_000, 70_001, undefined)).toBe('missed')
    expect(milestoneState(60_000, 80_000, { checked: [], completedDate: '2026-01-01' })).toBe('done')
    expect(milestoneState(60_000, 80_000, { checked: [], skipped: true })).toBe('skipped')
    expect(milestoneState(60_000, null, undefined)).toBe('upcoming')
  })

  it('picks the due milestone as next, never a missed one', () => {
    const { next, all } = milestoneOverview(98_000, ROGUE, undefined)
    expect(next?.miles).toBe(100_000)
    expect(all.find((m) => m.miles === 30_000)?.state).toBe('missed')
    // 90k is only 8k behind, but 100k is now due and supersedes it
    expect(all.find((m) => m.miles === 90_000)?.state).toBe('missed')
  })

  it('moves on once the due one is done, and counts only known checked ids', () => {
    const { next, all } = milestoneOverview(98_000, ROGUE, {
      '100000': { checked: ['coolant', 'not-a-real-id'], completedDate: '2026-10-01' },
    })
    expect(next?.miles).toBe(120_000)
    expect(all.find((m) => m.miles === 100_000)?.checkedCount).toBe(1)
  })
})

describe('db/milestones', () => {
  const vehicle = { id: 'veh-m', name: 'Test', year: 2020, make: 'X', model: 'Y', trim: '', engine: '', drivetrain: '', createdAt: '' } as Vehicle

  beforeEach(async () => {
    await db.vehicles.clear()
    await db.vehicles.add(vehicle)
  })

  it('checks, unchecks, completes, reopens and skips', async () => {
    await setMilestoneItem('veh-m', 60_000, 'brakes', true)
    await setMilestoneItem('veh-m', 60_000, 'coolant', true)
    await setMilestoneItem('veh-m', 60_000, 'brakes', true) // idempotent
    await setMilestoneItem('veh-m', 60_000, 'coolant', false)
    expect((await db.vehicles.get('veh-m'))?.milestones?.['60000']?.checked).toEqual(['brakes'])

    await completeMilestone('veh-m', 60_000, '2026-10-01', 60_250)
    let r = (await db.vehicles.get('veh-m'))?.milestones?.['60000']
    expect(r).toMatchObject({ completedDate: '2026-10-01', completedMiles: 60_250, checked: ['brakes'] })

    await reopenMilestone('veh-m', 60_000)
    r = (await db.vehicles.get('veh-m'))?.milestones?.['60000']
    expect(r?.completedDate).toBeUndefined()
    expect(r?.checked).toEqual(['brakes'])

    await skipMilestone('veh-m', 30_000)
    const all = (await db.vehicles.get('veh-m'))?.milestones
    expect(all?.['30000']?.skipped).toBe(true)
    expect(all?.['60000']).toBeDefined() // other milestones untouched
  })

  it('never touches reminder rules', async () => {
    await db.reminderRules.clear()
    await completeMilestone('veh-m', 60_000, '2026-10-01', 60_000)
    expect(await db.reminderRules.count()).toBe(0)
  })

  describe('Checked, OK and Serviced', () => {
    const when = { date: '2026-10-10', miles: 100_400 }
    const record = async () => (await db.vehicles.get('veh-m'))?.milestones?.['100000']

    beforeEach(async () => {
      await db.events.clear()
      await db.reminderRules.clear()
      await db.reminderRules.bulkPut(rulesForVehicle('veh-m', 'f150-2020'))
    })

    it('logs a brake inspection on OK and deletes it on undo', async () => {
      await setMilestoneItemOk('veh-m', 100_000, 'brakes', true, when)
      const events = await db.events.toArray()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({ category: 'brake-inspection', date: '2026-10-10', odometerMiles: 100_400 })
      expect(await db.reminderRules.get('veh-m:brake-inspection')).toMatchObject({ lastDoneDate: '2026-10-10' })
      expect((await record())?.inspectionEvents).toEqual({ brakes: events[0].id })

      await setMilestoneItemOk('veh-m', 100_000, 'brakes', true, when) // no second event
      expect(await db.events.count()).toBe(1)

      await setMilestoneItemOk('veh-m', 100_000, 'brakes', false, when)
      expect(await db.events.count()).toBe(0)
      expect((await db.reminderRules.get('veh-m:brake-inspection'))?.lastDoneDate ?? null).toBeNull()
      expect(await record()).toMatchObject({ checked: [] })
      expect((await record())?.inspectionEvents).toBeUndefined()
    })

    it('only marks non-inspection items, and needs a date to log', async () => {
      await setMilestoneItemOk('veh-m', 100_000, 'exhaust', true, when)
      await setMilestoneItemOk('veh-m', 100_000, 'oil-filter', true, when)
      await setMilestoneItemOk('veh-m', 100_000, 'battery', true, null)
      expect(await db.events.count()).toBe(0)
      expect((await record())?.checked).toEqual(['exhaust', 'oil-filter', 'battery'])
    })

    it('records serviced items', async () => {
      await setMilestoneItemServiced('veh-m', 100_000, 'oil-filter')
      await setMilestoneItemServiced('veh-m', 100_000, 'oil-filter')
      expect((await record())?.serviced).toEqual(['oil-filter'])
    })
  })
})
