import { describe, expect, it } from 'vitest'
import { handle, TEST_MESSAGE, WRITES_PER_HOUR, type Sender } from '../worker/push/src/index'
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
