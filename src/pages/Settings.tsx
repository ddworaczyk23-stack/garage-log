import { cloudConfigured, login, logout, useCloudUser } from '../db/cloud'
import { ChevronRightIcon } from '../components/icons'
import { PageHeader } from '../components/ui'

// Settings tab: sync account (when Dexie Cloud is configured) + Backup &
// restore. Replaces the old "Synced as …" strip under the header and the
// Backup tab in the bottom nav.
export function Settings() {
  return (
    <section class="page">
      <PageHeader eyebrow="Your data" title="Settings" />

      {cloudConfigured && <SyncCard />}

      <ul class="list">
        <li>
          <a class="list-row" href="#/backup">
            <span class="list-row-main">
              <span class="list-row-title">Back up &amp; restore</span>
              <span class="muted small">Save a copy of your garage, or load one.</span>
            </span>
            <ChevronRightIcon />
          </a>
        </li>
      </ul>
    </section>
  )
}

function SyncCard() {
  const user = useCloudUser()
  if (user === undefined) return null // still resolving initial auth state

  return (
    <div class="card settings-sync">
      <h3 class="list-row-title">Sync</h3>
      <p class="muted small">
        {user.isLoggedIn
          ? `Synced as ${user.email ?? user.name ?? user.userId}`
          : 'Not signed in. Your data stays on this device.'}
      </p>
      <button type="button" class="btn-link" onClick={user.isLoggedIn ? logout : login}>
        {user.isLoggedIn ? 'Sign out' : 'Sign in to sync'}
      </button>
    </div>
  )
}
