import { db } from './db'
import { liveQuery } from 'dexie'
import { collectCalendarItems } from './calendarExport'
import {
  buildUploadAlerts,
  DEFAULT_ALERT_PREFS,
  pushSupport,
  randomToken,
  urlBase64ToBytes,
  type AlertPrefs,
  type PushSupport,
} from '../domain/push'

// Web push notifications. The app asks the browser for permission, subscribes
// with the server's public (VAPID) key, and hands the subscription to a tiny
// Worker (worker/push) that can then send this device a notification. So far
// it sends a test, plus due-date alerts: the app uploads a short list of future
// alerts and the Worker sends each at 9am Eastern on its date. Each kind of
// alert has its own switch (AlertPrefs).
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
  /** Which alert kinds are on. Missing = all on (DEFAULT_ALERT_PREFS). */
  prefs?: AlertPrefs
  /** Hash of the last uploaded alert list, to skip identical uploads. */
  lastHash?: string
}

export function alertPrefs(state: PushState | null): AlertPrefs {
  return { ...DEFAULT_ALERT_PREFS, ...state?.prefs }
}

const PUSH_DEBOUNCE_MS = 5000

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
  // Best effort: the alerts catch up on the next change or app open if this fails.
  await pushAlerts(true).catch(() => {})
  return (await getPushState()) ?? state
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

// Alert uploads run one at a time so a slow upload can't overwrite a newer one
// or re-save state after "Turn off".
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => {}).then(fn)
  queue = next
  return next
}

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function pushAlertsNow(force: boolean): Promise<void> {
  const state = await getPushState()
  if (!state || !baseUrl()) return
  const asOf = new Date()
  const backup = (await db.appMeta.get('lastBackupAt'))?.value
  const alerts = buildUploadAlerts({
    items: await collectCalendarItems(undefined, asOf),
    vehicles: await db.vehicles.toArray(),
    // Mileage logged with a service counts as a reading too (as in the reminder engine).
    readings: [...(await db.odometerReadings.toArray()), ...(await db.events.toArray())],
    lastBackupAt: typeof backup === 'string' ? backup : null,
    prefs: alertPrefs(state),
    asOf,
  })
  const h = await hash(JSON.stringify(alerts))
  if (!force && h === state.lastHash) return
  const res = await call('PUT', '/alerts', state, { alerts })
  if (res.status === 404 || res.status === 410) return // subscription is gone; the next test or enable repairs it
  if (!res.ok) throw new Error(`Alert upload failed (${res.status})`)
  // Re-read: the state may have changed (prefs) while the upload was in flight.
  const latest = await getPushState()
  if (latest) await db.appMeta.put({ key: PUSH_KEY, value: { ...latest, lastHash: h } })
}

/** Upload the alert list if it changed. No-op while notifications are off. */
export function pushAlerts(force = false): Promise<void> {
  return serial(() => pushAlertsNow(force))
}

/** Switch one kind of alert on or off, and update the server right away. */
export async function setAlertPref(kind: keyof AlertPrefs, on: boolean): Promise<void> {
  const state = await getPushState()
  if (!state) return
  await db.appMeta.put({ key: PUSH_KEY, value: { ...state, prefs: { ...alertPrefs(state), [kind]: on } } })
  await pushAlerts(true)
}

/**
 * Keep the server's alert list current: upload on start, after data changes
 * (debounced) and when the app returns to the foreground (projected dates move
 * daily). While notifications are off the watch reads only the push record.
 */
export function startPushSync(): void {
  if (!pushConfigured()) return
  const quiet = () => pushAlerts().catch(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  let first = true
  liveQuery(async () => {
    if (!(await getPushState())) return null
    return Promise.all([
      db.vehicles.toArray(),
      db.events.toArray(),
      db.odometerReadings.toArray(),
      db.reminderRules.toArray(),
      db.appMeta.get('lastBackupAt'),
    ])
  }).subscribe({
    next: (watched) => {
      if (!watched) return
      if (first) {
        first = false
        quiet()
        return
      }
      clearTimeout(timer)
      timer = setTimeout(quiet, PUSH_DEBOUNCE_MS)
    },
    error: () => {},
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') quiet()
  })
}
