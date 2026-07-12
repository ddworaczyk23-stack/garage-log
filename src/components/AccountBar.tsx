import { cloudConfigured, login, logout, useCloudUser } from '../db/cloud'

// Slim account-state strip shown between the header and the routed page.
// Renders nothing at all when Dexie Cloud isn't configured (no VITE_DEXIE_
// CLOUD_URL set) — see db/cloud.ts — so the app looks and behaves exactly as
// it did before this feature until a database URL is wired up.
export function AccountBar() {
  if (!cloudConfigured) return null

  const user = useCloudUser()
  if (user === undefined) return null // still resolving initial auth state

  if (user.isLoggedIn) {
    return (
      <div class="account-bar">
        <span class="account-status">Synced as {user.email ?? user.name ?? user.userId}</span>
        <button type="button" class="btn-link" onClick={logout}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div class="account-bar">
      <span class="account-status">Not signed in — data stays on this device</span>
      <button type="button" class="btn-link" onClick={login}>
        Sign in to sync
      </button>
    </div>
  )
}
