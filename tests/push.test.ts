import { describe, expect, it } from 'vitest'
import { buildUploadAlerts, DEFAULT_ALERT_PREFS, pushSupport, randomToken, urlBase64ToBytes } from '../src/domain/push'

describe('pushSupport', () => {
  it('is ready wherever the browser has PushManager', () => {
    expect(pushSupport({ hasPushManager: true, isIos: true, isStandalone: true })).toBe('ready')
    expect(pushSupport({ hasPushManager: true, isIos: false, isStandalone: false })).toBe('ready')
  })
  it('tells iPhone Safari users to add Coast to the Home Screen', () => {
    expect(pushSupport({ hasPushManager: false, isIos: true, isStandalone: false })).toBe('needs-install')
  })
  it('is unsupported elsewhere without PushManager', () => {
    expect(pushSupport({ hasPushManager: false, isIos: false, isStandalone: false })).toBe('unsupported')
    // Installed iOS app that still lacks push (iOS older than 16.4).
    expect(pushSupport({ hasPushManager: false, isIos: true, isStandalone: true })).toBe('unsupported')
  })
})

describe('push helpers', () => {
  it('decodes the VAPID public key to 65 bytes', () => {
    const key = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'
    const bytes = urlBase64ToBytes(key)
    expect(bytes).toHaveLength(65)
    expect(bytes[0]).toBe(4)
  })
  it('makes 43-char url-safe tokens that differ each time', () => {
    const a = randomToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(a)
  })
})

describe('buildUploadAlerts', () => {
  const asOf = new Date(2026, 10, 19, 12) // Nov 19 2026, local noon
  const veh = { id: 'veh-1', name: 'F-150', nickname: undefined, createdAt: '2026-01-01T12:00:00' }
  const item = (uid: string, date: string, safety = false) => ({ uid, date, title: `Do ${uid}`, description: 'd', url: 'https://x/#/service/veh-1%3Abrake', safety })
  const base = { items: [], vehicles: [veh], readings: [], lastBackupAt: null as string | null, asOf }
  const all = (o: Partial<typeof DEFAULT_ALERT_PREFS>) => ({ due: false, safety: false, mileage: false, backup: false, summary: false, ...o })

  it('due: future items only, with the route hash', () => {
    const items = [item('past', '2026-11-01'), item('soon', '2026-12-01')]
    const out = buildUploadAlerts({ ...base, items, prefs: all({ due: true }) })
    expect(out.map((a) => a.key)).toEqual(['soon'])
    expect(out[0].hash).toBe('#/service/veh-1%3Abrake')
  })

  it('safety: only safety items, and no duplicate when due is on too', () => {
    const items = [item('oil', '2026-12-01'), item('brakes', '2026-12-02', true)]
    expect(buildUploadAlerts({ ...base, items, prefs: all({ safety: true }) }).map((a) => a.key)).toEqual(['brakes'])
    expect(buildUploadAlerts({ ...base, items, prefs: all({ safety: true, due: true }) })).toHaveLength(2)
  })

  it('mileage: the day after 90 days, repeating every 90 until a new reading', () => {
    const fresh = buildUploadAlerts({ ...base, readings: [{ vehicleId: 'veh-1', date: '2026-11-10' }], prefs: all({ mileage: true }) })
    expect(fresh.map((a) => a.date)).toEqual(['2027-02-09', '2027-05-10', '2027-08-08']) // Nov 10 + 91, then every 90
    const stale = buildUploadAlerts({ ...base, readings: [{ vehicleId: 'veh-1', date: '2026-06-01' }], prefs: all({ mileage: true }) })
    expect(stale[0].date >= '2026-11-19').toBe(true)
    expect(buildUploadAlerts({ ...base, prefs: all({ mileage: true }) })).toEqual([]) // never logged
  })

  it('backup: a month after the last one, or after the first car was added', () => {
    expect(buildUploadAlerts({ ...base, lastBackupAt: '2026-11-10T12:00:00', prefs: all({ backup: true }) }).map((a) => a.date)).toEqual(['2026-12-10', '2027-01-09', '2027-02-08'])
    const never = buildUploadAlerts({ ...base, prefs: all({ backup: true }) })[0]
    expect(never.date >= '2026-11-19').toBe(true)
    expect(never.body).toContain('not backed up')
  })

  it('summary: the next 1sts, listing what is coming that month', () => {
    const items = [item('a', '2026-12-05'), item('b', '2026-12-20'), item('c', '2027-01-15')]
    const out = buildUploadAlerts({ ...base, items, prefs: all({ summary: true }) })
    expect(out.map((a) => a.date)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01'])
    expect(out[0].title).toBe('December in your garage')
    expect(out[0].body).toContain('2 things coming up')
    expect(out[2].body).toContain('Nothing due')
  })

  it('summary: a month never counts the next month\'s first days', () => {
    const items = [item('feb', '2027-02-20'), item('mar', '2027-03-02')]
    const out = buildUploadAlerts({ ...base, items, prefs: all({ summary: true }) })
    const feb = out.find((a) => a.date === '2027-02-01')!
    expect(feb.body).toContain('1 thing coming up')
    expect(feb.body).not.toContain('Do mar')
  })

  it('everything off uploads nothing', () => {
    expect(buildUploadAlerts({ ...base, items: [item('a', '2026-12-01')], prefs: all({}) })).toEqual([])
  })
})
