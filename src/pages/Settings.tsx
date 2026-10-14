import { cloudConfigured, login, logout, useCloudUser, useSyncState } from '../db/cloud'
import { db } from '../db/db'
import { useQuery } from '../db/useQuery'
import { formatShortDate, localDateISO } from '../domain/format'
import { ChevronRightIcon } from '../components/icons'
import { ConfirmButton, PageHeader } from '../components/ui'

declare const __COAST_BUILD__: string

// Settings tab: sync account (when Dexie Cloud is configured) + Backup &
// restore. Replaces the old "Synced as …" strip under the header and the
// Backup tab in the bottom nav.
export function Settings() {
  const lastBackup = useQuery(() => db.appMeta.get('lastBackupAt'))
  const lastBackupAt = typeof lastBackup?.value === 'string' ? lastBackup.value : null
  return (
    <section class="page">
      <PageHeader eyebrow="Your data" title="Settings" />

      {cloudConfigured && <SyncCard />}

      <ul class="list">
        <li>
          <a class="list-row" href="#/backup">
            <span class="list-row-main">
              <span class="list-row-title">Back up &amp; restore</span>
              <span class="muted small">
                {lastBackupAt ? `Last backup: ${formatShortDate(localDateISO(new Date(lastBackupAt)))}` : 'No backup yet'}
              </span>
            </span>
            <ChevronRightIcon />
          </a>
        </li>
      </ul>

      <p class="muted small settings-build">Coast · build {__COAST_BUILD__}</p>
    </section>
  )
}

function SyncCard() {
  const user = useCloudUser()
  const { state, lastSynced } = useSyncState()
  if (user === undefined) return null // still resolving initial auth state

  return (
    <div class="card settings-sync">
      <h3 class="list-row-title">Sync</h3>
      <p class="muted small">
        {user.isLoggedIn
          ? `Synced as ${user.email ?? user.name ?? user.userId}`
          : 'Not signed in. Your data stays on this device.'}
      </p>
      <p class="muted small">{syncStatus(state)}</p>
      {lastSynced && <p class="muted small">Last synced {relativeTime(lastSynced)}</p>}
      {user.isLoggedIn ? (
        <ConfirmButton
          label="Sign out"
          confirmLabel="Sign out? Data stays on this device."
          onConfirm={logout}
          class="btn-link"
        />
      ) : (
        <button type="button" class="btn-link" onClick={login}>Sign in to sync</button>
      )}
    </div>
  )
}

function syncStatus(state: ReturnType<typeof useSyncState>['state']): string {
  if (!state) return 'Checking sync status…'
  if (state.phase === 'offline') return 'Offline. Will sync when you’re back online.'
  if (state.phase === 'error') return `Sync problem: ${shortError(state.error?.message)}`
  if (state.phase === 'in-sync') return 'Up to date'
  if (state.phase === 'pushing') return 'Saving changes…'
  if (state.phase === 'pulling') return 'Getting changes…'
  return 'Preparing sync…'
}

function shortError(message: string | undefined): string {
  const clean = message?.replace(/\s+/g, ' ').trim()
  if (!clean) return 'Please try again.'
  return clean.length > 88 ? `${clean.slice(0, 85)}…` : clean
}

function relativeTime(when: Date): string {
  const seconds = Math.max(0, Math.round((Date.now() - when.getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
