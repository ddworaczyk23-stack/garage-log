import { liveQuery } from 'dexie'
import { db } from './db'
import { collectCalendarItems } from './calendarExport'
import { buildCalendar } from '../domain/calendar'

// Live calendar feed: the app uploads its .ics to a tiny Worker
// (worker/calendar-feed) and Apple/Google Calendar SUBSCRIBE to it, so due
// dates already on the phone move by themselves. A subscribed calendar is
// replaced wholesale on every refresh, so moved dates move and finished items
// disappear without stable per-event ids.
//
// Off unless VITE_CALENDAR_FEED_URL is set at build time. Feed credentials
// live in appMeta (local, never synced; they ride along in backups so a
// restore keeps the same subscription link working). One feed per device.
// The feed always covers every car.

const META_KEY = 'calendarFeed'
const PUSH_DEBOUNCE_MS = 5000

export interface FeedState {
  feedId: string
  writeKey: string
  lastHash?: string
  lastPush?: string // ISO timestamp of the last successful upload
}

function baseUrl(): string | null {
  const url = import.meta.env.VITE_CALENDAR_FEED_URL as string | undefined
  return url ? url.replace(/\/+$/, '') : null
}

export function feedConfigured(): boolean {
  return !!baseUrl()
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function getFeedState(): Promise<FeedState | null> {
  const rec = await db.appMeta.get(META_KEY)
  return (rec?.value as FeedState | undefined) ?? null
}

export function feedLinks(state: FeedState): { https: string; webcal: string } {
  const https = `${baseUrl()}/feed/${state.feedId}.ics`
  return { https, webcal: https.replace(/^https?:/, 'webcal:') }
}

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

let inFlight: Promise<void> | null = null

/**
 * Upload the current calendar if it changed since the last upload. No-op when
 * the feed is off. Failures throw; callers that run in the background swallow
 * them and the next trigger retries.
 */
export function pushFeed(force = false): Promise<void> {
  // Serialize: a write burst must not race two uploads (or two state writes).
  const run = async () => {
    const base = baseUrl()
    const state = await getFeedState()
    if (!base || !state) return
    const asOf = new Date()
    const items = await collectCalendarItems(undefined, asOf)
    // Hash the items, not the .ics: its DTSTAMP changes on every build.
    const h = await hash(JSON.stringify(items))
    if (!force && h === state.lastHash) return
    const res = await fetch(`${base}/feed/${state.feedId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${state.writeKey}`, 'Content-Type': 'text/calendar' },
      body: buildCalendar(items, asOf),
    })
    if (!res.ok) throw new Error(`Feed upload failed (${res.status})`)
    await db.appMeta.put({ key: META_KEY, value: { ...state, lastHash: h, lastPush: asOf.toISOString() } })
  }
  const next = (inFlight ?? Promise.resolve()).catch(() => {}).then(run)
  inFlight = next
  return next
}

/** Turn the feed on (or reuse the existing one) and upload now. */
export async function enableFeed(): Promise<FeedState> {
  if (!baseUrl()) throw new Error('Calendar feed is not configured')
  let state = await getFeedState()
  if (!state) {
    state = { feedId: randomId(), writeKey: randomId() }
    await db.appMeta.put({ key: META_KEY, value: state })
  }
  await pushFeed(true)
  return (await getFeedState())!
}

/** "Stop sharing": delete the feed on the server, then forget it here. */
export async function disableFeed(): Promise<void> {
  const base = baseUrl()
  const state = await getFeedState()
  if (!state) return
  if (base) {
    const res = await fetch(`${base}/feed/${state.feedId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${state.writeKey}` },
    })
    if (!res.ok && res.status !== 404) throw new Error(`Feed delete failed (${res.status})`)
  }
  await db.appMeta.delete(META_KEY)
}

/**
 * Keep the feed current: push on start, after data changes (debounced), and
 * when the app comes back to the foreground (projected dates move daily, and
 * an installed PWA can sit suspended for days).
 */
export function startFeedSync(): void {
  if (!baseUrl()) return
  const quiet = () => pushFeed().catch(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  let first = true
  liveQuery(() =>
    Promise.all([
      db.vehicles.toArray(),
      db.events.toArray(),
      db.odometerReadings.toArray(),
      db.reminderRules.toArray(),
    ]),
  ).subscribe({
    next: () => {
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
