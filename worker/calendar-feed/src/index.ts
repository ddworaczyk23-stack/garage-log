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

export interface FeedStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface Env {
  FEEDS: FeedStore
}

interface FeedRecord {
  keyHash: string
  ics: string
  updated: string
}

const ID = /^[A-Za-z0-9_-]{43}$/
export const MAX_ICS_BYTES = 100_000

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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin')
    const m = /^\/feed\/([A-Za-z0-9_-]+?)(\.ics)?$/.exec(url.pathname)
    if (!m || !ID.test(m[1])) return new Response('Not found', { status: 404 })
    const [, id, ics] = m
    const key = `feed:${id}`
    const h = cors(origin)
    const reply = (body: string | null, status: number, extra: Record<string, string> = {}) =>
      new Response(body, { status, headers: { ...h, ...extra } })

    if (req.method === 'OPTIONS') return reply(null, allowedOrigin(origin) ? 204 : 403)

    if (req.method === 'GET' && ics) {
      const raw = await env.FEEDS.get(key)
      if (!raw) return reply('Not found', 404)
      const rec = JSON.parse(raw) as FeedRecord
      return new Response(rec.ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'max-age=300',
          'X-Robots-Tag': 'noindex',
        },
      })
    }

    if (ics || (req.method !== 'PUT' && req.method !== 'DELETE')) return reply('Method not allowed', 405)

    const writeKey = bearer(req)
    if (!writeKey) return reply('Unauthorized', 401)
    const keyHash = await sha256(writeKey)
    const raw = await env.FEEDS.get(key)
    const existing = raw ? (JSON.parse(raw) as FeedRecord) : null
    if (existing && existing.keyHash !== keyHash) return reply('Forbidden', 403)

    if (req.method === 'DELETE') {
      if (existing) await env.FEEDS.delete(key)
      return reply(null, 204)
    }

    const body = await req.text()
    if (new TextEncoder().encode(body).length > MAX_ICS_BYTES) return reply('Too large', 413)
    if (!body.startsWith('BEGIN:VCALENDAR')) return reply('Not a calendar', 400)
    const rec: FeedRecord = { keyHash, ics: body, updated: new Date().toISOString() }
    await env.FEEDS.put(key, JSON.stringify(rec))
    return reply(null, 204)
  },
}
