import { useEffect, useState } from 'preact/hooks'
import { db } from './db'
import type { UserLogin } from 'dexie-cloud-addon'

// Dexie Cloud is only wired up when a database URL is provided (see
// .env.local / CLAUDE.md) — without one, `cloudConfigured` stays false and
// the app behaves exactly as it did before this migration: fully local, no
// login option shown anywhere.
const databaseUrl = import.meta.env.VITE_DEXIE_CLOUD_URL as string | undefined
export const cloudConfigured = !!databaseUrl

if (databaseUrl) {
  db.cloud.configure({
    databaseUrl,
    // Optional login: the app must stay fully usable offline/local-only with
    // no account, per the migration plan. Logging in only adds sync on top.
    requireAuth: false,
    // These three tables are local-only (see db/db.ts's constructor comment
    // for why: their primary keys are deterministic, not globally unique
    // across users, and none hold user-entered data worth syncing).
    unsyncedTables: ['appMeta', 'factoryMaintenanceData', 'consensusData'],
  })
}

export function login(): void {
  void db.cloud.login()
}

export function logout(): void {
  void db.cloud.logout()
}

// Whatever data already exists locally when a user first logs in (a fresh
// install's seeded vehicles, or years of prior local-only history) is
// automatically "claimed" into their private realm — Dexie Cloud's own sync
// engine stamps owner/realmId on any pre-existing row that doesn't have one
// yet, the first time it syncifies tables after a login (verified by reading
// dexie-cloud-addon's source: modifyLocalObjectsWithNewUserId() runs from the
// internal sync() flow whenever there's a logged-in user and tables pending
// syncification — no app-level migration code needed here).

// Mirrors the subscribe/cleanup pattern in db/useQuery.ts, but subscribes to
// db.cloud.currentUser — a plain rxjs BehaviorSubject, not a Dexie liveQuery.
export function useCloudUser(): UserLogin | undefined {
  const [user, setUser] = useState<UserLogin>()
  useEffect(() => {
    if (!cloudConfigured) return
    const sub = db.cloud.currentUser.subscribe((u) => setUser(u))
    return () => sub.unsubscribe()
  }, [])
  return user
}
