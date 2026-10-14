import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db/db'
import { recordCompletedEvent, recordOdometerReading } from '../src/db/events'
import { addVehicle } from '../src/db/vehicleOnboarding'
import { disableFeed, enableFeed, feedLinks, getFeedState, pushFeed } from '../src/db/calendarFeed'
import worker, { type Env } from '../worker/calendar-feed/src/index'

// The app's feed code talks to the REAL Worker code over a fake fetch, with an
// in-memory KV, so the whole round trip (claim, upload, skip-if-unchanged,
// delete) is exercised without a network.

const BASE = 'https://feed.test'
let store: Map<string, string>
let puts: number

beforeEach(async () => {
  await Promise.all([
    db.vehicles.clear(),
    db.odometerReadings.clear(),
    db.events.clear(),
    db.reminderRules.clear(),
    db.appMeta.clear(),
  ])
  store = new Map()
  puts = 0
  const env: Env = {
    FEEDS: {
      get: async (k) => store.get(k) ?? null,
      put: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
    },
  }
  vi.stubEnv('VITE_CALENDAR_FEED_URL', `${BASE}/`)
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/' })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (init.method === 'PUT') puts++
    return worker.fetch(new Request(url, init), env)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function carWithHistory() {
  const { vehicle } = await addVehicle({
    identity: { year: 2020, make: 'Ford', model: 'F-150', trim: 'STX' },
    engine: '2.7L EcoBoost V6',
    drivetrain: '4WD',
  })
  const today = new Date()
  const iso = (daysAgo: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString().slice(0, 10)
  }
  await recordOdometerReading(vehicle.id, 90000, iso(5))
  await recordCompletedEvent({
    vehicleId: vehicle.id,
    kind: 'maintenance',
    date: iso(90),
    odometerMiles: 86000,
    category: 'oil-change',
    title: 'Oil change',
    cost: 60,
    documentIds: [],
  })
  return vehicle
}

async function servedIcs(): Promise<string | null> {
  const s = await getFeedState()
  if (!s) return null
  const res = await fetch(feedLinks(s).https, { method: 'GET' })
  return res.ok ? res.text() : null
}

describe('calendar feed', () => {
  it('enable uploads the calendar and serves it at the feed link', async () => {
    await carWithHistory()
    const s = await enableFeed()
    expect(s.feedId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(s.writeKey).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(s.lastPush).toBeTruthy()
    expect(feedLinks(s).https).toBe(`${BASE}/feed/${s.feedId}.ics`)
    expect(feedLinks(s).webcal).toBe(`webcal://feed.test/feed/${s.feedId}.ics`)
    const ics = await servedIcs()
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('F-150 STX: Engine oil & filter')
  })

  it('skips the upload when nothing changed, re-uploads when data changes', async () => {
    const v = await carWithHistory()
    await enableFeed()
    expect(puts).toBe(1)
    await pushFeed()
    expect(puts).toBe(1)
    // A fresh oil change moves the due date: the served file must follow.
    const before = await servedIcs()
    await recordCompletedEvent({
      vehicleId: v.id,
      kind: 'maintenance',
      date: new Date().toISOString().slice(0, 10),
      odometerMiles: 90000,
      category: 'oil-change',
      title: 'Oil change',
      cost: 60,
      documentIds: [],
    })
    await pushFeed()
    expect(puts).toBe(2)
    expect(await servedIcs()).not.toBe(before)
  })

  it('pushFeed is a no-op while the feed is off', async () => {
    await carWithHistory()
    await pushFeed()
    expect(puts).toBe(0)
  })

  it('enable twice keeps the same link', async () => {
    const a = await enableFeed()
    const b = await enableFeed()
    expect(b.feedId).toBe(a.feedId)
  })

  it('disable deletes the server copy and forgets the feed', async () => {
    await carWithHistory()
    const s = await enableFeed()
    await disableFeed()
    expect(await getFeedState()).toBeNull()
    const res = await fetch(feedLinks(s).https, { method: 'GET' })
    expect(res.status).toBe(404)
  })
})
