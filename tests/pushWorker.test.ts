import { describe, expect, it } from 'vitest'
import {
  cleanAlerts,
  handle,
  MAX_ALERTS,
  MAX_PER_RUN,
  newYorkNow,
  sendDueAlerts,
  TEST_MESSAGE,
  WRITES_PER_HOUR,
  type Sender,
} from '../worker/push/src/index'
import { pushStore } from './pushWorkerDb'

const BASE = 'https://push.example'
const ID = 'a'.repeat(43)
const KEY = 'k'.repeat(43)
const OTHER = 'z'.repeat(43)
const SUB = {
  endpoint: 'https://web.push.apple.com/QAbc123',
  keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
}

function req(method: string, path: string, init: { key?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.key) headers.Authorization = `Bearer ${init.key}`
  if (init.origin) headers.Origin = init.origin
  const body = init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body)
  return new Request(`${BASE}${path}`, { method, headers, body })
}

/** A sender that records what it was asked to deliver and answers with `status`. */
function fakeSender(status = 201) {
  const calls: { endpoint: string; title: string }[] = []
  const send: Sender = async (sub, message) => {
    calls.push({ endpoint: sub.endpoint, title: message.title })
    return status
  }
  return { send, calls }
}

describe('push worker', () => {
  it('stores a subscription and sends the test message to it', async () => {
    const store = pushStore()
    const { send, calls } = fakeSender()
    expect((await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, send)).status).toBe(204)
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, send)).status).toBe(204)
    expect(calls).toEqual([{ endpoint: SUB.endpoint, title: TEST_MESSAGE.title }])
  })

  it('refreshes the subscription when the browser hands over a new one', async () => {
    const store = pushStore()
    const { send, calls } = fakeSender()
    await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, send)
    const next = { ...SUB, endpoint: 'https://web.push.apple.com/NEW' }
    await handle(req('POST', `/sub/${ID}`, { key: KEY, body: next }), store, send)
    await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, send)
    expect(calls[0].endpoint).toBe(next.endpoint)
  })

  it('only the claiming key can change, test or delete a subscription', async () => {
    const store = pushStore()
    const { send, calls } = fakeSender()
    await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, send)
    expect((await handle(req('POST', `/sub/${ID}`, { key: OTHER, body: SUB }), store, send)).status).toBe(403)
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: OTHER }), store, send)).status).toBe(403)
    expect((await handle(req('DELETE', `/sub/${ID}`, { key: OTHER }), store, send)).status).toBe(403)
    expect((await handle(req('POST', `/sub/${ID}/test`), store, send)).status).toBe(401)
    expect(calls).toHaveLength(0)
    expect((await handle(req('DELETE', `/sub/${ID}`, { key: KEY }), store, send)).status).toBe(204)
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, send)).status).toBe(404)
  })

  it('refuses keys that are not a P-256 point and a 16-byte secret', async () => {
    const store = pushStore()
    const { send } = fakeSender()
    const short = { ...SUB, keys: { p256dh: 'A'.repeat(20), auth: SUB.keys.auth } }
    expect((await handle(req('POST', `/sub/${ID}`, { key: KEY, body: short }), store, send)).status).toBe(400)
  })

  it('refuses a subscription that points anywhere but a real push service', async () => {
    const store = pushStore()
    const { send } = fakeSender()
    const evil = { ...SUB, endpoint: 'https://evil.example/x' }
    expect((await handle(req('POST', `/sub/${ID}`, { key: KEY, body: evil }), store, send)).status).toBe(400)
    expect((await handle(req('POST', `/sub/${ID}`, { key: KEY, body: 'nope' }), store, send)).status).toBe(400)
    expect((await handle(req('POST', `/sub/${ID}`, { key: KEY, body: { endpoint: SUB.endpoint } }), store, send)).status).toBe(400)
  })

  it('forgets a subscription the phone has dropped (410) and says so', async () => {
    const store = pushStore()
    await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, fakeSender().send)
    const res = await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, fakeSender(410).send)
    expect(res.status).toBe(410)
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, fakeSender().send)).status).toBe(404)
  })

  it('reports a push service refusal as 502', async () => {
    const store = pushStore()
    await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, fakeSender().send)
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, fakeSender(403).send)).status).toBe(502)
  })

  it('404s a bad path and 405s a wrong method', async () => {
    const store = pushStore()
    const { send } = fakeSender()
    expect((await handle(req('POST', '/sub/short'), store, send)).status).toBe(404)
    expect((await handle(req('GET', `/sub/${ID}`, { key: KEY }), store, send)).status).toBe(405)
    expect((await handle(req('DELETE', `/sub/${ID}/test`, { key: KEY }), store, send)).status).toBe(405)
  })

  it('allows CORS only from the app origins', async () => {
    const store = pushStore()
    const { send } = fakeSender()
    const ok = await handle(req('OPTIONS', `/sub/${ID}`, { origin: 'https://ddworaczyk23-stack.github.io' }), store, send)
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://ddworaczyk23-stack.github.io')
    expect((await handle(req('OPTIONS', `/sub/${ID}`, { origin: 'https://evil.example' }), store, send)).status).toBe(403)
  })

  it('caps writes and sends per IP per hour', async () => {
    const store = pushStore()
    const { send } = fakeSender()
    const now = Date.UTC(2026, 10, 19, 12)
    for (let i = 0; i < WRITES_PER_HOUR; i++) {
      expect((await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, send, now)).status).toBe(204)
    }
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, send, now)).status).toBe(429)
    // The next hour starts a fresh count.
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, send, now + 3_600_000)).status).toBe(204)
  })
})

describe('due-date alerts', () => {
  const alert = (key: string, date: string, extra = {}) => ({ key, date, title: `T ${key}`, body: 'B', hash: '#/vehicle/veh-1', ...extra })
  const put = (store: ReturnType<typeof pushStore>, send: Sender, alerts: unknown) =>
    handle(req('PUT', `/sub/${ID}/alerts`, { key: KEY, body: { alerts } }), store, send)
  // 2026-11-19 14:30Z = 9:30am Eastern (EST).
  const MORNING = Date.UTC(2026, 10, 19, 14, 30)

  async function setup() {
    const store = pushStore()
    const { send, calls } = fakeSender()
    await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, send)
    return { store, send, calls }
  }

  it('sends today\'s alert once, at 9am Eastern, then never again', async () => {
    const { store, send, calls } = await setup()
    expect((await put(store, send, [alert('a', '2026-11-19'), alert('b', '2026-11-25')])).status).toBe(204)
    expect(await sendDueAlerts(store, send, MORNING)).toBe(1)
    expect(await sendDueAlerts(store, send, MORNING + 3_600_000)).toBe(0)
    expect(calls.map((c) => c.title)).toEqual(['T a'])
    // A re-upload of the same alert must not re-arm it.
    await put(store, send, [alert('a', '2026-11-19'), alert('b', '2026-11-25')])
    expect(await sendDueAlerts(store, send, MORNING + 7_200_000)).toBe(0)
  })

  it('a moved date is a new alert; a removed one never sends', async () => {
    const { store, send, calls } = await setup()
    await put(store, send, [alert('a', '2026-11-19'), alert('gone', '2026-11-19')])
    await put(store, send, [alert('a', '2026-11-19')])
    await sendDueAlerts(store, send, MORNING)
    expect(calls.map((c) => c.title)).toEqual(['T a'])
    await put(store, send, [alert('a', '2026-11-20')])
    expect(await sendDueAlerts(store, send, Date.UTC(2026, 10, 20, 14, 30))).toBe(1)
  })

  it('stays quiet outside 9 to noon Eastern, and handles daylight saving', async () => {
    const { store, send } = await setup()
    await put(store, send, [alert('a', '2026-11-19'), alert('s', '2026-07-01')])
    expect(await sendDueAlerts(store, send, Date.UTC(2026, 10, 19, 12, 0))).toBe(0) // 7am EST
    expect(await sendDueAlerts(store, send, Date.UTC(2026, 10, 19, 18, 0))).toBe(0) // 1pm EST
    expect(newYorkNow(Date.UTC(2026, 10, 19, 14, 0))).toEqual({ date: '2026-11-19', hour: 9 }) // EST, UTC-5
    expect(newYorkNow(Date.UTC(2026, 6, 1, 13, 0))).toEqual({ date: '2026-07-01', hour: 9 }) // EDT, UTC-4
    expect(newYorkNow(Date.UTC(2026, 6, 1, 3, 0))).toEqual({ date: '2026-06-30', hour: 23 }) // still yesterday
  })

  it('catches up a missed morning but not an old one, and caps a device per run', async () => {
    const { store, send, calls } = await setup()
    await put(store, send, [alert('late', '2026-11-18'), alert('stale', '2026-11-10')])
    await sendDueAlerts(store, send, MORNING)
    expect(calls.map((c) => c.title)).toEqual(['T late'])
    const many = Array.from({ length: 8 }, (_, i) => alert(`m${i}`, '2026-11-19'))
    await put(store, send, many)
    expect(await sendDueAlerts(store, send, MORNING)).toBe(MAX_PER_RUN)
  })

  it('one device failing to send does not stop the others', async () => {
    const store = pushStore()
    const ok = fakeSender()
    await handle(req('POST', `/sub/${ID}`, { key: KEY, body: SUB }), store, ok.send)
    const ID2 = 'c'.repeat(43)
    await handle(req('POST', `/sub/${ID2}`, { key: KEY, body: { ...SUB, endpoint: 'https://web.push.apple.com/two' } }), store, ok.send)
    await handle(req('PUT', `/sub/${ID}/alerts`, { key: KEY, body: { alerts: [alert('a', '2026-11-19')] } }), store, ok.send)
    await handle(req('PUT', `/sub/${ID2}/alerts`, { key: KEY, body: { alerts: [alert('b', '2026-11-19')] } }), store, ok.send)
    const calls: string[] = []
    const flaky: Sender = async (sub, m) => {
      if (sub.endpoint.endsWith('QAbc123')) throw new Error('bad key')
      calls.push(m.title)
      return 201
    }
    expect(await sendDueAlerts(store, flaky, MORNING)).toBe(1)
    expect(calls).toEqual(['T b'])
    // The failed alert is still unsent, so the next run retries it.
    expect(await sendDueAlerts(store, ok.send, MORNING + 3_600_000)).toBe(1)
  })

  it('forgets a phone that dropped its subscription', async () => {
    const { store, send } = await setup()
    await put(store, send, [alert('a', '2026-11-19')])
    await sendDueAlerts(store, fakeSender(410).send, MORNING)
    expect((await handle(req('POST', `/sub/${ID}/test`, { key: KEY }), store, send)).status).toBe(404)
  })

  it('rejects malformed uploads and other devices\' keys', async () => {
    const { store, send } = await setup()
    expect((await put(store, send, 'nope')).status).toBe(400)
    expect((await put(store, send, [{ ...alert('a', 'tomorrow') }])).status).toBe(400)
    expect((await put(store, send, Array.from({ length: MAX_ALERTS + 1 }, (_, i) => alert(`k${i}`, '2026-11-19')))).status).toBe(400)
    expect((await handle(req('PUT', `/sub/${ID}/alerts`, { key: OTHER, body: { alerts: [] } }), store, send)).status).toBe(403)
    expect((await handle(req('PUT', `/sub/${'b'.repeat(43)}/alerts`, { key: KEY, body: { alerts: [] } }), store, send)).status).toBe(404)
  })

  it('drops an unsafe route hash and trims long text', () => {
    const [a] = cleanAlerts([{ ...alert('a', '2026-11-19', { hash: 'javascript:alert(1)', title: 'x'.repeat(500) }) }])!
    expect(a.hash).toBe('')
    expect(a.title).toHaveLength(200)
    expect(cleanAlerts([alert('a', '2026-11-19', { hash: '#/service/veh-1%3Abrake-fluid' })])![0].hash).toBe('#/service/veh-1%3Abrake-fluid')
  })
})
