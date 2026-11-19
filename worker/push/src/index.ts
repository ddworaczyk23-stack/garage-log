// Coast push: a tiny Cloudflare Worker that remembers which devices turned
// notifications on and sends them a Web Push. Like the calendar feed Worker it
// holds no maintenance data: the app only ever asks it to "send my device a
// test". Real reminders (later) will send a title/body the app builds.
//
//   POST   /sub/<id>        Bearer <key>; body = the browser's PushSubscription JSON.
//                           First POST claims the id; later ones refresh the subscription.
//   DELETE /sub/<id>        Bearer <key>   ("Turn off")
//   POST   /sub/<id>/test   Bearer <key>   sends one test notification to that device
//
// id and key are 32 random bytes, base64url (43 chars), made on the device.
// Only sha256(key) is stored. Writes and sends are capped per client IP per
// hour with an exact D1 counter (same approach as worker/calendar-feed).

import { isAllowedEndpoint, sendPush, type PushMessage, type PushSubscriptionRecord, type VapidKeys } from './webpush'

export interface SubRecord extends PushSubscriptionRecord {
  keyHash: string
  updated: string
}

/** Storage seam: D1 in production, SQLite in tests. */
export interface SubStore {
  get(id: string): Promise<SubRecord | null>
  put(id: string, rec: SubRecord): Promise<void>
  delete(id: string): Promise<void>
  hits(ip: string, hour: number): Promise<number>
  addHit(ip: string, hour: number): Promise<void>
  pruneHits(beforeHour: number): Promise<void>
}

// Minimal D1 surface, so the Worker needs no @cloudflare/workers-types.
interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T>(): Promise<T | null>
  run(): Promise<unknown>
}
export interface D1Like {
  prepare(sql: string): D1Statement
}

export interface Env {
  DB: D1Like
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
}

/** Test seam: how a message is delivered (returns the push service's status). */
export type Sender = (sub: PushSubscriptionRecord, message: PushMessage) => Promise<number>

const ID = /^[A-Za-z0-9_-]{43}$/
const B64 = /^[A-Za-z0-9_-]{16,128}$/
/** Subscribing happens rarely, and tests are a human tapping a button. */
export const WRITES_PER_HOUR = 30

export function d1Store(db: D1Like): SubStore {
  return {
    async get(id) {
      const row = await db
        .prepare('SELECT key_hash, endpoint, p256dh, auth, updated FROM subs WHERE id = ?')
        .bind(id)
        .first<{ key_hash: string; endpoint: string; p256dh: string; auth: string; updated: string }>()
      return row
        ? { keyHash: row.key_hash, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, updated: row.updated }
        : null
    },
    async put(id, rec) {
      await db
        .prepare(
          'INSERT INTO subs (id, key_hash, endpoint, p256dh, auth, updated) VALUES (?, ?, ?, ?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET endpoint = excluded.endpoint, p256dh = excluded.p256dh, ' +
            'auth = excluded.auth, updated = excluded.updated',
        )
        .bind(id, rec.keyHash, rec.endpoint, rec.p256dh, rec.auth, rec.updated)
        .run()
    },
    async delete(id) {
      await db.prepare('DELETE FROM subs WHERE id = ?').bind(id).run()
    },
    async hits(ip, hour) {
      const row = await db
        .prepare('SELECT n FROM write_hits WHERE ip = ? AND hour = ?')
        .bind(ip, hour)
        .first<{ n: number }>()
      return row?.n ?? 0
    },
    async addHit(ip, hour) {
      await db
        .prepare(
          'INSERT INTO write_hits (ip, hour, n) VALUES (?, ?, 1) ' +
            'ON CONFLICT(ip, hour) DO UPDATE SET n = n + 1',
        )
        .bind(ip, hour)
        .run()
    },
    async pruneHits(beforeHour) {
      await db.prepare('DELETE FROM write_hits WHERE hour < ?').bind(beforeHour).run()
    },
  }
}

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  if (origin === 'https://ddworaczyk23-stack.github.io') return origin
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return origin
  return null
}

function cors(origin: string | null): Record<string, string> {
  const ok = allowedOrigin(origin)
  return ok
    ? {
        'Access-Control-Allow-Origin': ok,
        'Access-Control-Allow-Methods': 'POST, DELETE',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        Vary: 'Origin',
      }
    : {}
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function bearer(req: Request): string | null {
  const m = /^Bearer (\S+)$/.exec(req.headers.get('Authorization') ?? '')
  return m && ID.test(m[1]) ? m[1] : null
}

/** The fixed text of the test notification. */
export const TEST_MESSAGE: PushMessage = {
  title: 'Coast',
  body: 'Notifications are working on this phone.',
  url: './',
}

export async function handle(req: Request, store: SubStore, send: Sender, now = Date.now()): Promise<Response> {
  const url = new URL(req.url)
  const origin = req.headers.get('Origin')
  const m = /^\/sub\/([A-Za-z0-9_-]+?)(\/test)?$/.exec(url.pathname)
  if (!m || !ID.test(m[1])) return new Response('Not found', { status: 404 })
  const [, id, test] = m
  const h = cors(origin)
  const reply = (body: string | null, status: number) => new Response(body, { status, headers: h })

  if (req.method === 'OPTIONS') return reply(null, allowedOrigin(origin) ? 204 : 403)

  const isTest = !!test && req.method === 'POST'
  const isSub = !test && (req.method === 'POST' || req.method === 'DELETE')
  if (!isTest && !isSub) return reply('Method not allowed', 405)

  // Rate limit before anything else costs a write or a send.
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const hour = Math.floor(now / 3_600_000)
  if ((await store.hits(ip, hour)) >= WRITES_PER_HOUR) return reply('Too many requests', 429)
  await store.addHit(ip, hour)
  if (Math.random() < 0.01) await store.pruneHits(hour - 24)

  const key = bearer(req)
  if (!key) return reply('Unauthorized', 401)
  const keyHash = await sha256(key)
  const existing = await store.get(id)
  if (existing && existing.keyHash !== keyHash) return reply('Forbidden', 403)

  if (isTest) {
    if (!existing) return reply('Not found', 404)
    const status = await send(existing, TEST_MESSAGE)
    // 404/410: the phone dropped the subscription (app removed, permission off).
    if (status === 404 || status === 410) {
      await store.delete(id)
      return reply('Subscription expired', 410)
    }
    return status >= 200 && status < 300 ? reply(null, 204) : reply('Push service refused', 502)
  }

  if (req.method === 'DELETE') {
    if (existing) await store.delete(id)
    return reply(null, 204)
  }

  let sub: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  try {
    sub = JSON.parse(await req.text())
  } catch {
    return reply('Bad JSON', 400)
  }
  const { endpoint } = sub
  const p256dh = sub.keys?.p256dh
  const auth = sub.keys?.auth
  if (
    typeof endpoint !== 'string' ||
    endpoint.length > 1000 ||
    !isAllowedEndpoint(endpoint) ||
    typeof p256dh !== 'string' ||
    !B64.test(p256dh) ||
    typeof auth !== 'string' ||
    !B64.test(auth)
  ) {
    return reply('Not a push subscription', 400)
  }
  await store.put(id, { keyHash, endpoint, p256dh, auth, updated: new Date(now).toISOString() })
  return reply(null, 204)
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    const vapid: VapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
    return handle(req, d1Store(env.DB), (sub, message) => sendPush(sub, message, vapid))
  },
}
