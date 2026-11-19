// Coast push: a tiny Cloudflare Worker that remembers which devices turned
// notifications on and sends them a Web Push. Like the calendar feed Worker it
// holds no maintenance data: the app only ever asks it to "send my device a
// test". Real reminders (later) will send a title/body the app builds.
//
//   POST   /sub/<id>        Bearer <key>; body = the browser's PushSubscription JSON.
//                           First POST claims the id; later ones refresh the subscription.
//   DELETE /sub/<id>        Bearer <key>   ("Turn off")
//   POST   /sub/<id>/test   Bearer <key>   sends one test notification to that device
//   PUT    /sub/<id>/alerts Bearer <key>   replaces that device's due-date alerts
//
// A cron trigger runs hourly; at 9am Eastern (DST-aware) it sends every alert
// whose date has arrived and hasn't been sent. See `sendDueAlerts`.
//
// id and key are 32 random bytes, base64url (43 chars), made on the device.
// Only sha256(key) is stored. Writes and sends are capped per client IP per
// hour with an exact D1 counter (same approach as worker/calendar-feed).

import { isAllowedEndpoint, sendPush, type PushMessage, type PushSubscriptionRecord, type VapidKeys } from './webpush'

export interface SubRecord extends PushSubscriptionRecord {
  keyHash: string
  updated: string
}

/** One due-date alert as the app uploads it. `key` is the app's stable uid. */
export interface AlertInput {
  key: string
  date: string // YYYY-MM-DD, the device's local date
  title: string
  body: string
  /** In-app route to open on tap, like "#/vehicle/veh-1". May be empty. */
  hash: string
}

export interface DueAlert extends AlertInput {
  subId: string
  sub: SubRecord
}

/** Storage seam: D1 in production, SQLite in tests. */
export interface SubStore {
  /** Replace a device's alerts, keeping `sent` for alerts whose key and date are unchanged. */
  replaceAlerts(subId: string, alerts: AlertInput[]): Promise<void>
  /** Unsent alerts dated in [from, to], oldest first, with their subscriptions. */
  dueAlerts(from: string, to: string): Promise<DueAlert[]>
  markSent(subId: string, key: string): Promise<void>
  /** Drop alerts dated before `date`. */
  pruneAlerts(date: string): Promise<void>
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
  all<T>(): Promise<{ results: T[] }>
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
export const WRITES_PER_HOUR = 60
/** Most alerts one device may hold, and the length caps for their text. */
export const MAX_ALERTS = 60
const MAX_TEXT = 200
/** Notifications one device gets in a single morning run. */
export const MAX_PER_RUN = 5

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
      await db.prepare('DELETE FROM alerts WHERE sub_id = ?').bind(id).run()
    },
    async replaceAlerts(subId, alerts) {
      const prior = await db
        .prepare('SELECT key, date FROM alerts WHERE sub_id = ? AND sent = 1')
        .bind(subId)
        .all<{ key: string; date: string }>()
      const sent = new Set(prior.results.map((r) => `${r.key}|${r.date}`))
      await db.prepare('DELETE FROM alerts WHERE sub_id = ?').bind(subId).run()
      for (const a of alerts) {
        await db
          .prepare('INSERT INTO alerts (sub_id, key, date, title, body, hash, sent) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(subId, a.key, a.date, a.title, a.body, a.hash, sent.has(`${a.key}|${a.date}`) ? 1 : 0)
          .run()
      }
    },
    async dueAlerts(from, to) {
      const rows = await db
        .prepare(
          'SELECT a.sub_id, a.key, a.date, a.title, a.body, a.hash, s.key_hash, s.endpoint, s.p256dh, s.auth, s.updated ' +
            'FROM alerts a JOIN subs s ON s.id = a.sub_id ' +
            'WHERE a.sent = 0 AND a.date >= ? AND a.date <= ? ORDER BY a.date, a.key',
        )
        .bind(from, to)
        .all<{
          sub_id: string; key: string; date: string; title: string; body: string; hash: string
          key_hash: string; endpoint: string; p256dh: string; auth: string; updated: string
        }>()
      return rows.results.map((r) => ({
        subId: r.sub_id,
        key: r.key,
        date: r.date,
        title: r.title,
        body: r.body,
        hash: r.hash,
        sub: { keyHash: r.key_hash, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth, updated: r.updated },
      }))
    },
    async markSent(subId, key) {
      await db.prepare('UPDATE alerts SET sent = 1 WHERE sub_id = ? AND key = ?').bind(subId, key).run()
    },
    async pruneAlerts(date) {
      await db.prepare('DELETE FROM alerts WHERE date < ?').bind(date).run()
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
        'Access-Control-Allow-Methods': 'POST, PUT, DELETE',
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

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Validate an uploaded alert list; null if it isn't one. Text is trimmed to a safe length. */
export function cleanAlerts(raw: unknown): AlertInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ALERTS) return null
  const out: AlertInput[] = []
  for (const a of raw) {
    if (!a || typeof a !== 'object') return null
    const { key, date, title, body, hash } = a as Record<string, unknown>
    if (typeof key !== 'string' || !key || key.length > 200) return null
    if (typeof date !== 'string' || !DATE.test(date)) return null
    if (typeof title !== 'string' || typeof body !== 'string') return null
    if (hash !== undefined && typeof hash !== 'string') return null
    out.push({
      key,
      date,
      title: title.slice(0, MAX_TEXT),
      body: body.slice(0, MAX_TEXT),
      hash: typeof hash === 'string' && /^#\/[\w\-/%.:]*$/.test(hash) ? hash : '',
    })
  }
  return out
}

/** The calendar date and hour right now in New York (handles daylight saving). */
export function newYorkNow(now: number): { date: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(now))
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Alerts older than this many days are dropped unsent instead of arriving late. */
const CATCH_UP_DAYS = 2
/** Mornings are 9:00 to 11:59 Eastern: the cron runs hourly, so a missed run catches up. */
const SEND_HOURS = [9, 10, 11]

/**
 * The hourly cron body. Between 9am and noon Eastern, send each device its alerts
 * dated today (or up to two days back, if a run was missed), at most
 * MAX_PER_RUN per device, then mark them sent. A 404/410 from the push
 * service means the phone dropped the subscription, so it is forgotten.
 */
export async function sendDueAlerts(store: SubStore, send: Sender, now = Date.now()): Promise<number> {
  const { date, hour } = newYorkNow(now)
  if (!SEND_HOURS.includes(hour)) return 0
  await store.pruneAlerts(addDays(date, -7))
  const due = await store.dueAlerts(addDays(date, -CATCH_UP_DAYS), date)
  const perSub = new Map<string, number>()
  const gone = new Set<string>()
  let sent = 0
  for (const a of due) {
    if (gone.has(a.subId)) continue
    const n = perSub.get(a.subId) ?? 0
    if (n >= MAX_PER_RUN) continue
    perSub.set(a.subId, n + 1)
    const status = await send(a.sub, { title: a.title, body: a.body, url: `./${a.hash}` })
    if (status === 404 || status === 410) {
      gone.add(a.subId)
      await store.delete(a.subId)
    } else if (status >= 200 && status < 300) {
      await store.markSent(a.subId, a.key)
      sent++
    }
  }
  return sent
}

export async function handle(req: Request, store: SubStore, send: Sender, now = Date.now()): Promise<Response> {
  const url = new URL(req.url)
  const origin = req.headers.get('Origin')
  const m = /^\/sub\/([A-Za-z0-9_-]+?)(\/test|\/alerts)?$/.exec(url.pathname)
  if (!m || !ID.test(m[1])) return new Response('Not found', { status: 404 })
  const [, id, suffix] = m
  const test = suffix === '/test'
  const alerts = suffix === '/alerts'
  const h = cors(origin)
  const reply = (body: string | null, status: number) => new Response(body, { status, headers: h })

  if (req.method === 'OPTIONS') return reply(null, allowedOrigin(origin) ? 204 : 403)

  const isTest = !!test && req.method === 'POST'
  const isAlerts = alerts && req.method === 'PUT'
  const isSub = !suffix && (req.method === 'POST' || req.method === 'DELETE')
  if (!isTest && !isSub && !isAlerts) return reply('Method not allowed', 405)

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

  if (isAlerts) {
    if (!existing) return reply('Not found', 404)
    let parsed: { alerts?: unknown }
    try {
      parsed = JSON.parse(await req.text())
    } catch {
      return reply('Bad JSON', 400)
    }
    const clean = cleanAlerts(parsed.alerts)
    if (!clean) return reply('Not a list of alerts', 400)
    await store.replaceAlerts(id, clean)
    return reply(null, 204)
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

function liveSender(env: Env): Sender {
  const vapid: VapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
  return (sub, message) => sendPush(sub, message, vapid)
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, d1Store(env.DB), liveSender(env))
  },
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await sendDueAlerts(d1Store(env.DB), liveSender(env))
  },
}
