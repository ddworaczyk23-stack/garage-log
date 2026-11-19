// Web Push for a Cloudflare Worker, using only WebCrypto (no npm packages):
//   - VAPID (RFC 8292): a signed JWT that proves the push came from this server.
//   - Message encryption (RFC 8291, "aes128gcm"): the push service (Apple,
//     Google, Mozilla) relays bytes it cannot read.
// Pure functions: `encryptPayload` and `vapidHeaders` take their randomness and
// clock as arguments so tests can pin them to the RFC's published test vector.

const enc = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Uint8Array {
  const pad = '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

export interface PushKeys {
  /** The browser's public key (65 bytes, base64url). */
  p256dh: string
  /** The browser's auth secret (16 bytes, base64url). */
  auth: string
}

/** Test seam: a fixed server key pair and salt. Production passes nothing. */
export interface EncryptFixture {
  serverPrivateJwk: JsonWebKey
  serverPublic: Uint8Array
  salt: Uint8Array
}

/**
 * Encrypt `plaintext` for one browser as a single aes128gcm record
 * (RFC 8188 + RFC 8291). Push payloads are small (4 KB max), so one record is
 * all this ever needs.
 */
export async function encryptPayload(plaintext: Uint8Array, keys: PushKeys, fixture?: EncryptFixture): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(keys.p256dh)
  const authSecret = b64urlDecode(keys.auth)

  let serverPrivate: CryptoKey
  let serverPublic: Uint8Array
  if (fixture) {
    serverPrivate = await crypto.subtle.importKey('jwk', fixture.serverPrivateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    serverPublic = fixture.serverPublic
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    serverPrivate = pair.privateKey
    serverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  }
  const salt = fixture?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, serverPrivate, 256))

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, serverPublic)
  const ikm = await hkdf(ecdh, authSecret, keyInfo, 32)
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12)

  // 0x02 marks the last (here: only) record.
  const record = concat(plaintext, new Uint8Array([2]))
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record))

  // Header: salt (16) | record size (4, big-endian) | key id length (1) | key id (server public key).
  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = serverPublic.length
  return concat(header, serverPublic, cipher)
}

/** The VAPID key pair as the Worker is configured with it. */
export interface VapidKeys {
  /** 65-byte uncompressed public key, base64url. Also what the browser subscribes with. */
  publicKey: string
  /** 32-byte private scalar, base64url. A Worker secret. */
  privateKey: string
  /** https: or mailto: contact for the push service to reach the operator. */
  subject: string
}

async function importVapidPrivate(v: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlDecode(v.publicKey)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    d: v.privateKey,
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/** The `Authorization` header value for a push to `endpoint` (valid 12 hours). */
export async function vapidAuthorization(endpoint: string, v: VapidKeys, nowMs = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin
  const head = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: v.subject })))
  const signingInput = `${head}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await importVapidPrivate(v), enc.encode(signingInput)))
  return `vapid t=${signingInput}.${b64urlEncode(sig)}, k=${v.publicKey}`
}

export interface PushSubscriptionRecord extends PushKeys {
  endpoint: string
}

/** Push services this Worker will talk to. Anything else is refused so the
 * Worker can't be pointed at an arbitrary URL. */
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
]

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((re) => re.test(u.hostname))
  } catch {
    return false
  }
}

export interface PushMessage {
  title: string
  body: string
  /** Page to open when the notification is tapped (relative to the app). */
  url?: string
}

/** Encrypt and POST one message. Returns the push service's HTTP status:
 * 201 = accepted, 404/410 = the subscription is gone. */
export async function sendPush(sub: PushSubscriptionRecord, message: PushMessage, vapid: VapidKeys): Promise<number> {
  if (!isAllowedEndpoint(sub.endpoint)) return 400
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub)
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  })
  return res.status
}
