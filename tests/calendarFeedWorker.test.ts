import { describe, expect, it } from 'vitest'
import worker, { MAX_ICS_BYTES, type Env } from '../worker/calendar-feed/src/index'

const BASE = 'https://feed.example'
const ID = 'a'.repeat(43)
const KEY = 'k'.repeat(43)
const OTHER = 'z'.repeat(43)
const ICS = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'

function env(): Env {
  const m = new Map<string, string>()
  return {
    FEEDS: {
      get: async (k) => m.get(k) ?? null,
      put: async (k, v) => void m.set(k, v),
      delete: async (k) => void m.delete(k),
    },
  }
}

function req(method: string, path: string, init: { key?: string; body?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {}
  if (init.key) headers.Authorization = `Bearer ${init.key}`
  if (init.origin) headers.Origin = init.origin
  return new Request(`${BASE}${path}`, { method, headers, body: init.body })
}

describe('calendar feed worker', () => {
  it('stores on PUT and serves the .ics on GET', async () => {
    const e = env()
    expect((await worker.fetch(req('PUT', `/feed/${ID}`, { key: KEY, body: ICS }), e)).status).toBe(204)
    const res = await worker.fetch(req('GET', `/feed/${ID}.ics`), e)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/calendar')
    expect(await res.text()).toBe(ICS)
  })

  it('404s an unknown feed and a malformed id', async () => {
    const e = env()
    expect((await worker.fetch(req('GET', `/feed/${ID}.ics`), e)).status).toBe(404)
    expect((await worker.fetch(req('GET', '/feed/short.ics'), e)).status).toBe(404)
    expect((await worker.fetch(req('GET', '/'), e)).status).toBe(404)
  })

  it('only the claiming key can overwrite or delete', async () => {
    const e = env()
    await worker.fetch(req('PUT', `/feed/${ID}`, { key: KEY, body: ICS }), e)
    expect((await worker.fetch(req('PUT', `/feed/${ID}`, { key: OTHER, body: ICS }), e)).status).toBe(403)
    expect((await worker.fetch(req('DELETE', `/feed/${ID}`, { key: OTHER }), e)).status).toBe(403)
    expect((await worker.fetch(req('PUT', `/feed/${ID}`, { body: ICS }), e)).status).toBe(401)
    expect((await worker.fetch(req('DELETE', `/feed/${ID}`, { key: KEY }), e)).status).toBe(204)
    expect((await worker.fetch(req('GET', `/feed/${ID}.ics`), e)).status).toBe(404)
  })

  it('rejects non-calendar and oversized bodies', async () => {
    const e = env()
    expect((await worker.fetch(req('PUT', `/feed/${ID}`, { key: KEY, body: 'hello' }), e)).status).toBe(400)
    const big = 'BEGIN:VCALENDAR' + 'x'.repeat(MAX_ICS_BYTES)
    expect((await worker.fetch(req('PUT', `/feed/${ID}`, { key: KEY, body: big }), e)).status).toBe(413)
  })

  it('allows CORS only from the app origins', async () => {
    const e = env()
    const ok = await worker.fetch(req('OPTIONS', `/feed/${ID}`, { origin: 'https://ddworaczyk23-stack.github.io' }), e)
    expect(ok.status).toBe(204)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://ddworaczyk23-stack.github.io')
    const local = await worker.fetch(req('OPTIONS', `/feed/${ID}`, { origin: 'http://localhost:5174' }), e)
    expect(local.status).toBe(204)
    const bad = await worker.fetch(req('OPTIONS', `/feed/${ID}`, { origin: 'https://evil.example' }), e)
    expect(bad.status).toBe(403)
    expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
