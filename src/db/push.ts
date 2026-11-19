import { db } from './db'
import { pushSupport, randomToken, urlBase64ToBytes, type PushSupport } from '../domain/push'

// Web push notifications. The app asks the browser for permission, subscribes
// with the server's public (VAPID) key, and hands the subscription to a tiny
// Worker (worker/push) that can then send this device a notification. So far
// the only thing it sends is a test; real reminders come later.
//
// Off unless VITE_PUSH_URL and VITE_VAPID_PUBLIC_KEY are set at build time.
// Like the calendar feed, the device's record lives in appMeta (local, never
// synced) and is kept OUT of backups: a restore must not strand a device
// whose subscription belongs to its own browser.

/** appMeta key of this device's push record. Device-only: kept out of backups. */
export const PUSH_KEY = 'pushSub'

export interface PushState {
  id: string
  key: string
}

function baseUrl(): string | null {
  const url = import.meta.env.VITE_PUSH_URL as string | undefined
  return url ? url.replace(/\/+$/, '') : null
}

function vapidKey(): string | null {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || null
}

export function pushConfigured(): boolean {
  return !!baseUrl() && !!vapidKey()
}

export function currentPushSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean }
  return pushSupport({
    hasPushManager: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    isIos: /iphone|ipad|ipod/i.test(navigator.userAgent),
    isStandalone: nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches,
  })
}

export async function getPushState(): Promise<PushState | null> {
  const rec = await db.appMeta.get(PUSH_KEY)
  return (rec?.value as PushState | undefined) ?? null
}

async function call(method: string, path: string, state: PushState, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl()}/sub/${state.id}${path}`, {
    method,
    headers: { Authorization: `Bearer ${state.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Ask permission, subscribe, and register with the Worker. Must be called from
 * a tap (browsers, iOS especially, refuse the permission prompt otherwise).
 * Throws an Error with a plain-language message on failure.
 */
export async function enablePush(): Promise<PushState> {
  const base = baseUrl()
  const key = vapidKey()
  if (!base || !key) throw new Error('Notifications are not set up in this build.')
  if (currentPushSupport() !== 'ready') throw new Error('This browser cannot receive notifications.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Turn them on for Coast in your phone settings, then try again.')
  }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true, // required by Safari and Chrome
    applicationServerKey: urlBase64ToBytes(key) as BufferSource,
  })

  const state = (await getPushState()) ?? { id: randomToken(), key: randomToken() }
  const res = await call('POST', '', state, sub.toJSON())
  if (!res.ok) {
    await sub.unsubscribe().catch(() => {})
    throw new Error(`Could not register this phone (${res.status}).`)
  }
  await db.appMeta.put({ key: PUSH_KEY, value: state })
  return state
}

/** Ask the Worker to send this device one test notification. */
export async function sendTestPush(): Promise<void> {
  const state = await getPushState()
  if (!state) throw new Error('Turn notifications on first.')
  const res = await call('POST', '/test', state)
  if (res.status === 410 || res.status === 404) {
    // The phone dropped its subscription; start over cleanly.
    await db.appMeta.delete(PUSH_KEY)
    throw new Error('This phone stopped accepting notifications. Turn them on again.')
  }
  if (!res.ok) throw new Error(`The test did not go through (${res.status}).`)
}

/** Turn notifications off: unsubscribe in the browser, delete on the server, forget here. */
export async function disablePush(): Promise<void> {
  const state = await getPushState()
  if (!state) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  await sub?.unsubscribe().catch(() => {})
  if (baseUrl()) {
    const res = await call('DELETE', '', state)
    if (!res.ok && res.status !== 404) throw new Error(`Could not turn off (${res.status}).`)
  }
  await db.appMeta.delete(PUSH_KEY)
}
