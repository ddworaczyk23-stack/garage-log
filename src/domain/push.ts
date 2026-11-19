// Pure helpers for web push (no DB, no browser globals), so they're unit-tested.

export type PushSupport =
  /** Push is available: the button can ask for permission. */
  | 'ready'
  /** iPhone/iPad in Safari: push only works once Coast is on the Home Screen. */
  | 'needs-install'
  /** This browser can't do web push at all. */
  | 'unsupported'

export function pushSupport(env: { hasPushManager: boolean; isIos: boolean; isStandalone: boolean }): PushSupport {
  if (env.hasPushManager) return 'ready'
  // iOS 16.4+ hides PushManager until the site is added to the Home Screen.
  if (env.isIos && !env.isStandalone) return 'needs-install'
  return 'unsupported'
}

/** The browser wants the VAPID public key as bytes, not base64url text. */
export function urlBase64ToBytes(text: string): Uint8Array {
  const pad = '='.repeat((4 - (text.length % 4)) % 4)
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Random 32-byte id/key, base64url (43 chars): what the push Worker expects. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
