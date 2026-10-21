import { liveQuery } from 'dexie'
import { LocalNotifications } from '@capacitor/local-notifications'
import { collectCalendarItems } from './calendarExport'
import { localAlerts } from '../domain/calendar'

// Store app only (main.tsx imports this under `--mode capacitor`): due dates
// become on-device notifications, no server. Same items as the calendar feed.
// The whole pending set is replaced on every change, so moved dates move and
// finished items disappear.

let queue: Promise<unknown> = Promise.resolve()

function reschedule(): void {
  queue = queue
    .catch(() => {})
    .then(async () => {
      const alerts = localAlerts(await collectCalendarItems(undefined, new Date()), new Date())
      const { notifications } = await LocalNotifications.getPending()
      if (notifications.length) {
        await LocalNotifications.cancel({ notifications: notifications.map((n) => ({ id: n.id })) })
      }
      if (!alerts.length) return
      await LocalNotifications.schedule({
        notifications: alerts.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          schedule: { at: a.at, allowWhileIdle: true },
          extra: { hash: a.hash },
        })),
      })
    })
    .catch((err) => console.error('[reminders] scheduling failed', err))
}

export async function startLocalReminders(): Promise<void> {
  const { display } = await LocalNotifications.requestPermissions()
  if (display !== 'granted') return

  LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const hash = notification.extra?.hash
    if (typeof hash === 'string') location.hash = hash
  })

  // Re-run on any data change (liveQuery tracks every table collect reads)
  // and on return to the foreground, since projected dates move daily.
  liveQuery(() => collectCalendarItems(undefined, new Date())).subscribe({
    next: reschedule,
    error: () => {},
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reschedule()
  })
}
