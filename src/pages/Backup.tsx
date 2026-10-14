import { useState } from 'preact/hooks'
import { db } from '../db/db'
import {
  downloadBackup,
  exportGarage,
  importGarage,
  readBackupFile,
  serializeBackupToJson,
} from '../db/backup'
import { backupFilename, summarizeBackup, validateBackup, type BackupFile } from '../domain/backup'
import { ConfirmButton, PageHeader } from '../components/ui'
import { Reveal } from '../components/motion/Reveal'

type Notice = { kind: 'success' | 'error'; text: string } | null

// Backup & restore (Milestone 8). Two independent flows on one screen:
//   • Export  → build a single portable JSON, trigger a download.
//   • Restore → pick a file, validate it, PREVIEW its contents, and only on an
//               explicit confirm REPLACE the whole local database with it.
// Nothing here touches reminder math, templates, or ranking.
export function Backup() {
  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState<Notice>(null)

  const [pending, setPending] = useState<BackupFile | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreNotice, setRestoreNotice] = useState<Notice>(null)

  async function onExport() {
    setExporting(true)
    setExportNotice(null)
    try {
      const backup = await exportGarage()
      downloadBackup(serializeBackupToJson(backup), backupFilename(new Date()))
      await db.appMeta.put({ key: 'lastBackupAt', value: new Date().toISOString() })
      setExportNotice({
        kind: 'success',
        text: `Backup downloaded — ${backup.counts.vehicles} vehicles, ${backup.counts.events} events, ${backup.counts.documents} documents.`,
      })
    } catch (e) {
      setExportNotice({ kind: 'error', text: `Export failed: ${(e as Error).message}` })
    } finally {
      setExporting(false)
    }
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = '' // allow re-picking the same file
    setPending(null)
    setRestoreError(null)
    setRestoreNotice(null)
    if (!file) return
    try {
      const raw = await readBackupFile(file)
      const result = validateBackup(raw, db.verno)
      if (!result.ok) {
        setRestoreError(result.error)
        return
      }
      setPending(result.backup)
    } catch {
      setRestoreError('Couldn’t read that file — it isn’t valid JSON.')
    }
  }

  async function onConfirmRestore() {
    if (!pending) return
    const when = new Date(pending.exportedAt).toLocaleString()
    setRestoring(true)
    setRestoreNotice(null)
    try {
      await importGarage(pending)
      setRestoreNotice({
        kind: 'success',
        text: `Restore complete — local data replaced with the backup from ${when}.`,
      })
      setPending(null)
    } catch (e) {
      setRestoreNotice({
        kind: 'error',
        text: `Restore failed: ${(e as Error).message}. Your existing data was left unchanged.`,
      })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <section class="page">
      <a class="back-link" href="#/settings">
        ‹ Settings
      </a>
      <PageHeader eyebrow="Your data" title="Backup & restore">
        <p class="page-header-prose">Stored only on this device.</p>
      </PageHeader>

      <Reveal>
        <section class="card">
          <h3 class="card-title">Export</h3>
          <p class="muted small">One file with everything, photos included.</p>
          <button class="btn full" onClick={onExport} disabled={exporting}>
            {exporting ? 'Preparing…' : 'Download backup'}
          </button>
          {exportNotice && (
            <p
              class={`notice notice-${exportNotice.kind}`}
              role={exportNotice.kind === 'error' ? 'alert' : 'status'}
            >
              {exportNotice.text}
            </p>
          )}
        </section>
      </Reveal>

      <Reveal>
        <section class="card">
          <h3 class="card-title">Restore</h3>
          <p class="muted small">Replaces <strong>all data on this device</strong>.</p>

          <label class="admin-field">
            <span class="muted small">Choose a backup file (.json)</span>
            <input type="file" accept="application/json,.json" onChange={onFile} disabled={restoring} />
          </label>

          {restoreError && <p class="notice notice-error" role="alert">{restoreError}</p>}

          {pending && (
            <div class="restore-preview">
              <p class="muted small">
                Backup from <strong>{new Date(pending.exportedAt).toLocaleString()}</strong>{' '}
                (format v{pending.version}). Contents:
              </p>
              <ul class="restore-summary">
                {summarizeBackup(pending).map((row) => (
                  <li key={row.label}>
                    <span class="muted small">{row.label}</span>
                    <span>{row.count}</span>
                  </li>
                ))}
              </ul>
              <div class="form-actions">
                <ConfirmButton
                  class="btn btn-danger"
                  label="Replace all data & restore"
                  confirmLabel={restoring ? 'Restoring…' : 'Yes, replace everything'}
                  busyLabel="Restoring…"
                  onConfirm={onConfirmRestore}
                />
                <button class="btn-link" type="button" onClick={() => setPending(null)} disabled={restoring}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {restoreNotice && (
            <p
              class={`notice notice-${restoreNotice.kind}`}
              role={restoreNotice.kind === 'error' ? 'alert' : 'status'}
            >
              {restoreNotice.text}
            </p>
          )}
        </section>
      </Reveal>
    </section>
  )
}
