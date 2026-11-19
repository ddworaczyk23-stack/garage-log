import { STALE_ODOMETER_DAYS } from './reminderEngine'
import { localDateISO } from './format'
import { vehicleLabel } from './vehicle'
import type { CalendarItem } from './calendar'
import type { Vehicle } from '../types'

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

// --- Alerts ------------------------------------------------------------------
// The app uploads a short list of future alerts; the push Worker sends each one
// at 9am Eastern on its date (worker/push). Each kind has its own Settings switch.

export interface AlertPrefs {
  /** A service is coming due or overdue (the calendar's due dates). */
  due: boolean
  /** Only brakes, tires and timing belt (a stricter "due"; no repeats if both are on). */
  safety: boolean
  /** The last odometer reading is getting old. */
  mileage: boolean
  /** It has been a month since the last backup. */
  backup: boolean
  /** One note on the 1st of each month: what is coming up. */
  summary: boolean
}

/** Due dates and mileage are on at first; the rest are opt-in. */
export const DEFAULT_ALERT_PREFS: AlertPrefs = { due: true, safety: false, mileage: true, backup: false, summary: false }

export interface UploadAlert {
  key: string
  date: string // YYYY-MM-DD
  title: string
  body: string
  hash: string
}

/** Mirrors the Worker's cap (MAX_ALERTS). */
export const MAX_UPLOAD_ALERTS = 60
export const BACKUP_NUDGE_DAYS = 30

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** First of anchor + first + step*k that is today or later: a nudge that repeats until acted on. */
function nextRepeat(anchor: string, first: number, step: number, today: string): string {
  let date = addDaysISO(anchor, first)
  while (date < today) date = addDaysISO(date, step)
  return date
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface AlertInputs {
  items: CalendarItem[]
  vehicles: Pick<Vehicle, 'id' | 'name' | 'nickname' | 'createdAt'>[]
  readings: { vehicleId: string; date: string }[]
  /** ISO timestamp of the last backup, or null. */
  lastBackupAt: string | null
  prefs: AlertPrefs
  asOf: Date
}

/**
 * The alerts this device should have on the server, earliest first. Only
 * enabled kinds are included, so switching one off removes its alerts on the
 * next upload. Past dates are left out (the Worker catches up a missed
 * morning or two on its own). Alerts with the same key collapse to one.
 */
export function buildUploadAlerts({ items, vehicles, readings, lastBackupAt, prefs, asOf }: AlertInputs): UploadAlert[] {
  const today = localDateISO(asOf)
  const out = new Map<string, UploadAlert>()
  const add = (a: UploadAlert) => out.has(a.key) || out.set(a.key, a)

  for (const it of items) {
    if (it.date < today) continue
    if (!(prefs.due || (prefs.safety && it.safety))) continue
    add({
      key: it.uid,
      date: it.date,
      title: it.title,
      body: it.description,
      hash: it.url?.includes('#') ? it.url.slice(it.url.indexOf('#')) : '',
    })
  }

  if (prefs.mileage) {
    const last = new Map<string, string>()
    for (const r of readings) {
      if (!last.has(r.vehicleId) || r.date > last.get(r.vehicleId)!) last.set(r.vehicleId, r.date)
    }
    for (const v of vehicles) {
      const lastDate = last.get(v.id)
      if (!lastDate) continue // never logged: nothing to go stale yet
      // Stale means MORE than STALE_ODOMETER_DAYS old, so the first nudge is the day after.
      const date = nextRepeat(lastDate, STALE_ODOMETER_DAYS + 1, STALE_ODOMETER_DAYS, today)
      add({
        key: `mileage:${v.id}:${date}`,
        date,
        title: `Confirm mileage: ${vehicleLabel(v)}`,
        body: 'It has been a while since the last odometer reading. Tap to update it.',
        hash: `#/vehicle/${v.id}`,
      })
    }
  }

  if (prefs.backup && vehicles.length) {
    // Anchor: the last backup, else when the first car was added.
    const anchor = lastBackupAt
      ? localDateISO(new Date(lastBackupAt))
      : vehicles.map((v) => localDateISO(new Date(v.createdAt))).sort()[0]
    const date = nextRepeat(anchor, BACKUP_NUDGE_DAYS, BACKUP_NUDGE_DAYS, today)
    add({
      key: `backup:${date}`,
      date,
      title: 'Back up Coast',
      body: lastBackupAt
        ? 'It has been a month since your last backup. Tap to save one.'
        : 'You have not backed up your garage yet. Tap to save a copy.',
      hash: '#/backup',
    })
  }

  if (prefs.summary) {
    // The next few 1sts (this month's only if it is still ahead).
    const [y, m] = today.split('-').map(Number)
    for (let k = 0; k < 4; k++) {
      const month0 = (m - 1 + k) % 12
      const year = y + Math.floor((m - 1 + k) / 12)
      const date = `${year}-${String(month0 + 1).padStart(2, '0')}-01`
      if (date < today) continue
      const end = addDaysISO(date, 31)
      const coming = items.filter((it) => it.date >= date && it.date < end)
      add({
        key: `summary:${date}`,
        date,
        title: `${MONTHS[month0]} in your garage`,
        body: coming.length
          ? `${coming.length} thing${coming.length === 1 ? '' : 's'} coming up: ${coming
              .slice(0, 3)
              .map((it) => it.title)
              .join('; ')}${coming.length > 3 ? '; and more' : ''}.`
          : 'Nothing due this month. You can coast on what is logged.',
        hash: '',
      })
    }
  }

  return [...out.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
    .slice(0, MAX_UPLOAD_ALERTS)
}
