import { describe, expect, it } from 'vitest'
import { pushSupport, randomToken, urlBase64ToBytes } from '../src/domain/push'

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
