// Coast calendar feed: a tiny Cloudflare Worker that stores and serves one
// .ics file per feed so Apple/Google Calendar can SUBSCRIBE and pick up date
// changes by themselves. It holds bytes only: the app builds the .ics on the
// device and PUTs it here; this never sees the database or does any logic.
//
//   GET    /feed/<feedId>.ics   open (calendar apps fetch it; the id is the secret)
//   PUT    /feed/<feedId>       Authorization: Bearer <writeKey>; first PUT claims the id
//   DELETE /feed/<feedId>       same auth ("Stop sharing")
//
// feedId and writeKey are 32 random bytes, base64url (43 chars), made on the
// device. Only sha256(writeKey) is stored.
//
// Storage is D1 (100k row writes/day free; KV allowed only 1k). Writes are open
// by design (anyone may create a feed), so PUT/DELETE are capped per client IP
// per hour with an EXACT counter in D1 (Cloudflare's rate-limit binding is
// approximate and didn't enforce in a live test). The counter is read before
// it is written, so requests over the cap cost no writes. Residual risk: a
// flood past the free plan's 100k requests/day stops the Worker until reset.

export interface FeedRecord {
  keyHash: string
  ics: string
  updated: string
}

/** Storage seam: D1 in production, an in-memory map in tests. */
export interface FeedStore {
  get(id: string): Promise<FeedRecord | null>
  put(id: string, rec: FeedRecord): Promise<void>
  delete(id: string): Promise<void>
  /** Writes counted for this IP in this hour. */
  hits(ip: string, hour: number): Promise<number>
  /** Count one write for this IP in this hour. */
  addHit(ip: string, hour: number): Promise<void>
  /** Drop counters older than `beforeHour`. */
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
}

const ID = /^[A-Za-z0-9_-]{43}$/
export const MAX_ICS_BYTES = 100_000
/** The app writes at most once per change (5 s debounce); 60/hour is plenty. */
export const WRITES_PER_HOUR = 60

export function d1Store(db: D1Like): FeedStore {
  return {
    async get(id) {
      const row = await db
        .prepare('SELECT key_hash, ics, updated FROM feeds WHERE id = ?')
        .bind(id)
        .first<{ key_hash: string; ics: string; updated: string }>()
      return row ? { keyHash: row.key_hash, ics: row.ics, updated: row.updated } : null
    },
    async put(id, rec) {
      await db
        .prepare(
          'INSERT INTO feeds (id, key_hash, ics, updated) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT(id) DO UPDATE SET ics = excluded.ics, updated = excluded.updated',
        )
        .bind(id, rec.keyHash, rec.ics, rec.updated)
        .run()
    },
    async delete(id) {
      await db.prepare('DELETE FROM feeds WHERE id = ?').bind(id).run()
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
        'Access-Control-Allow-Methods': 'PUT, DELETE',
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

export async function handle(req: Request, store: FeedStore, now = Date.now()): Promise<Response> {
  const url = new URL(req.url)
  const origin = req.headers.get('Origin')
  const m = /^\/feed\/([A-Za-z0-9_-]+?)(\.ics)?$/.exec(url.pathname)
  if (!m || !ID.test(m[1])) return new Response('Not found', { status: 404 })
  const [, id, ics] = m
  const h = cors(origin)
  const reply = (body: string | null, status: number) => new Response(body, { status, headers: h })

  if (req.method === 'OPTIONS') return reply(null, allowedOrigin(origin) ? 204 : 403)

  if (req.method === 'GET' && ics) {
    const rec = await store.get(id)
    if (!rec) return reply('Not found', 404)
    return new Response(rec.ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'max-age=300',
        'X-Robots-Tag': 'noindex',
      },
    })
  }

  if (ics || (req.method !== 'PUT' && req.method !== 'DELETE')) return reply('Method not allowed', 405)

  // Rate limit before anything else costs a write.
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  const hour = Math.floor(now / 3_600_000)
  if ((await store.hits(ip, hour)) >= WRITES_PER_HOUR) return reply('Too many requests', 429)
  await store.addHit(ip, hour)
  // Old counters are only bookkeeping; prune them now and then, not every write.
  if (Math.random() < 0.01) await store.pruneHits(hour - 24)

  const writeKey = bearer(req)
  if (!writeKey) return reply('Unauthorized', 401)
  const keyHash = await sha256(writeKey)
  const existing = await store.get(id)
  if (existing && existing.keyHash !== keyHash) return reply('Forbidden', 403)

  if (req.method === 'DELETE') {
    if (existing) await store.delete(id)
    return reply(null, 204)
  }

  const body = await req.text()
  if (new TextEncoder().encode(body).length > MAX_ICS_BYTES) return reply('Too large', 413)
  if (!body.startsWith('BEGIN:VCALENDAR')) return reply('Not a calendar', 400)
  await store.put(id, { keyHash, ics: body, updated: new Date(now).toISOString() })
  return reply(null, 204)
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, d1Store(env.DB))
  },
}
