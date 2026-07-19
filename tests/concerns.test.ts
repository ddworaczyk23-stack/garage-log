import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/db'
import {
  openConcern,
  resolveConcern,
  reopenConcern,
  deleteConcern,
  getOpenConcerns,
  getAllOpenConcerns,
} from '../src/db/concerns'
import { getPlaybook } from '../src/domain/playbooks'

const VEHICLE_ID = 'test-vehicle'
const OTHER_ID = 'other-vehicle'

const pb = getPlaybook('brake-noise')!
const grind = pb.outcomes.find((o) => o.id === 'grind')!
const squeal = pb.outcomes.find((o) => o.id === 'squeal-most')!

beforeEach(async () => {
  await db.concerns.clear()
})

describe('openConcern', () => {
  it('writes an open concern with a globally-unique id and a band/title snapshot', async () => {
    const id = await openConcern(VEHICLE_ID, pb, grind, { sound: 'grind' })
    expect(id.startsWith('concern-')).toBe(true)

    const c = await db.concerns.get(id)
    expect(c).toBeDefined()
    expect(c!.vehicleId).toBe(VEHICLE_ID)
    expect(c!.status).toBe('open')
    expect(c!.band).toBe(grind.band)
    expect(c!.title).toBe(grind.title)
    expect(c!.category).toBe('brake-inspection')
    expect(c!.playbookId).toBe('brake-noise')
    expect(c!.outcomeId).toBe('grind')
    expect(c!.answers).toEqual({ sound: 'grind' })
    expect(c!.resolvedDate).toBeNull()
  })

  it('gives each concern a distinct id', async () => {
    const a = await openConcern(VEHICLE_ID, pb, grind, { sound: 'grind' })
    const b = await openConcern(VEHICLE_ID, pb, squeal, { sound: 'squeal', often: 'most' })
    expect(a).not.toBe(b)
    expect(await db.concerns.count()).toBe(2)
  })
})

describe('getOpenConcerns', () => {
  it('returns only this vehicle’s open concerns, newest first', async () => {
    await openConcern(OTHER_ID, pb, grind, {})
    const older = await openConcern(VEHICLE_ID, pb, squeal, {})
    const newer = await openConcern(VEHICLE_ID, pb, grind, {})
    // Force a deterministic order regardless of same-day createdDate.
    await db.concerns.update(older, { createdDate: '2026-07-10' })
    await db.concerns.update(newer, { createdDate: '2026-07-14' })

    const open = await getOpenConcerns(VEHICLE_ID)
    expect(open.map((c) => c.id)).toEqual([newer, older])
    expect(open.every((c) => c.vehicleId === VEHICLE_ID)).toBe(true)
  })
})

describe('resolveConcern / reopenConcern', () => {
  it('marks a concern resolved so it drops off the open list', async () => {
    const id = await openConcern(VEHICLE_ID, pb, grind, {})
    await resolveConcern(id, 'event-123')

    const c = await db.concerns.get(id)
    expect(c!.status).toBe('resolved')
    expect(c!.resolvedDate).not.toBeNull()
    expect(c!.resolvedEventId).toBe('event-123')
    expect(await getOpenConcerns(VEHICLE_ID)).toHaveLength(0)
  })

  it('reopens a resolved concern', async () => {
    const id = await openConcern(VEHICLE_ID, pb, grind, {})
    await resolveConcern(id)
    await reopenConcern(id)

    const c = await db.concerns.get(id)
    expect(c!.status).toBe('open')
    expect(c!.resolvedDate).toBeNull()
    expect(await getOpenConcerns(VEHICLE_ID)).toHaveLength(1)
  })

  it('reopening truly clears resolvedEventId — the key is removed, not left as literal undefined', async () => {
    // Dexie's update() special-cases a `key: undefined` change as a delete of
    // that key (verified against node_modules/dexie's applyUpdateSpec/
    // setByKeyPath, which calls `delete obj[keyPath]` for an undefined value) —
    // this guards that behavior so a future Dexie upgrade can't silently
    // regress it into storing a literal `undefined` instead.
    const id = await openConcern(VEHICLE_ID, pb, grind, {})
    await resolveConcern(id, 'event-123')
    expect((await db.concerns.get(id))!.resolvedEventId).toBe('event-123')

    await reopenConcern(id)

    const c = await db.concerns.get(id)
    expect(c!.resolvedEventId).toBeUndefined()
    expect('resolvedEventId' in c!).toBe(false)
  })
})

describe('deleteConcern', () => {
  it('removes the concern entirely', async () => {
    const id = await openConcern(VEHICLE_ID, pb, grind, {})
    await deleteConcern(id)
    expect(await db.concerns.get(id)).toBeUndefined()
  })
})

describe('getAllOpenConcerns', () => {
  it('spans every vehicle but excludes resolved ones', async () => {
    await openConcern(VEHICLE_ID, pb, grind, {})
    const resolved = await openConcern(OTHER_ID, pb, squeal, {})
    await openConcern(OTHER_ID, pb, grind, {})
    await resolveConcern(resolved)

    const all = await getAllOpenConcerns()
    expect(all).toHaveLength(2)
    expect(all.every((c) => c.status === 'open')).toBe(true)
  })
})
