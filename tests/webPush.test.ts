import { describe, expect, it } from 'vitest'
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  isAllowedEndpoint,
  vapidAuthorization,
} from '../worker/push/src/webpush'

// RFC 8291 Appendix A: the published test vector for aes128gcm Web Push.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('web push encryption (RFC 8291)', () => {
  it('matches the RFC test vector byte for byte', async () => {
    const pub = b64urlDecode(RFC.asPublic)
    const body = await encryptPayload(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      {
        serverPrivateJwk: {
          kty: 'EC',
          crv: 'P-256',
          d: RFC.asPrivate,
          x: b64urlEncode(pub.slice(1, 33)),
          y: b64urlEncode(pub.slice(33, 65)),
        },
        serverPublic: pub,
        salt: b64urlDecode(RFC.salt),
      },
    )
    expect(b64urlEncode(body)).toBe(RFC.body)
    expect(b64urlEncode(body.slice(21, 86))).toBe(RFC.asPublic) // header carries the server key
  })

  it('uses a fresh key and salt each time', async () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.auth }
    const a = await encryptPayload(new TextEncoder().encode('hi'), keys)
    const b = await encryptPayload(new TextEncoder().encode('hi'), keys)
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b))
    expect(a[20]).toBe(65) // key id is the 65-byte server public key
  })
})

describe('VAPID', () => {
  it('signs a JWT the public key verifies, scoped to the push service', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const vapid = { publicKey: b64urlEncode(pub), privateKey: jwk.d!, subject: 'https://example.test/' }
    const now = 1_800_000_000_000

    const header = await vapidAuthorization('https://web.push.apple.com/abc123', vapid, now)
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!
    expect(m[4]).toBe(vapid.publicKey)

    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])))
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', exp: now / 1000 + 12 * 3600, sub: 'https://example.test/' })

    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      b64urlDecode(m[3]),
      new TextEncoder().encode(`${m[1]}.${m[2]}`),
    )
    expect(ok).toBe(true)
  })
})

describe('push endpoint allow-list', () => {
  it('accepts the real push services', () => {
    expect(isAllowedEndpoint('https://web.push.apple.com/QAbc')).toBe(true)
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
  })
  it('refuses anything else', () => {
    expect(isAllowedEndpoint('http://web.push.apple.com/x')).toBe(false)
    expect(isAllowedEndpoint('https://evil.example/x')).toBe(false)
    expect(isAllowedEndpoint('https://web.push.apple.com.evil.example/x')).toBe(false)
    expect(isAllowedEndpoint('https://web.push.apple.com:8443/x')).toBe(false)
    expect(isAllowedEndpoint('not a url')).toBe(false)
  })
})
