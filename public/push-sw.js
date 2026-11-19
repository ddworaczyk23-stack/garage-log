// Push handlers, pulled into the generated service worker by vite.config.ts
// (workbox.importScripts). Plain JS on purpose: it runs as-is, unbundled.

self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    /* fall through to the defaults */
  }
  // iOS requires every push to show a notification, so always show one.
  event.waitUntil(
    self.registration.showNotification(msg.title || 'Coast', {
      body: msg.body || 'Open Coast to see what needs attention.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: msg.url || './' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.registration.scope) && 'focus' in w) {
          if ('navigate' in w && w.url !== target) w.navigate(target)
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
