// dexie-cloud-addon assumes a browser/service-worker environment (self,
// BroadcastChannel-adjacent globals, navigator.onLine listeners) and does
// real setup work the moment it's attached to a Dexie instance, even before
// db.cloud.configure() is ever called. That setup isn't reliably safe under
// plain Node — tests never set VITE_DEXIE_CLOUD_URL, so the addon is never
// actually configured/used, and db/db.ts's schema/CRUD behavior is identical
// with or without it. vitest.config.ts aliases 'dexie-cloud-addon' to this
// no-op stub so the whole suite exercises the real Dexie schema without
// depending on the addon's browser-only environment assumptions.
export default function dexieCloudStub(): void {}
