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
      <h2 class="page-title">Backup &amp; restore</h2>
      <p class="muted">
        Everything is stored only on this device. Export a backup before clearing
        browser data or switching phones — then restore it on the new device.
      </p>

      <section class="card">
        <h3 class="card-title">Export</h3>
        <p class="muted small">
          Downloads one file with every vehicle, service &amp; repair, odometer
          reading, reminder override, and document (photos/PDFs included).
        </p>
        <button class="btn full" onClick={onExport} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download backup'}
        </button>
        {exportNotice && (
          <p class={`notice notice-${exportNotice.kind}`}>{exportNotice.text}</p>
        )}
      </section>

      <section class="card">
        <h3 class="card-title">Restore</h3>
        <p class="muted small">
          Restoring <strong>replaces all data on this device</strong> with the
          backup file. Documents and their links are restored too.
        </p>

        <label class="admin-field">
          <span class="muted small">Choose a backup file (.json)</span>
          <input type="file" accept="application/json,.json" onChange={onFile} disabled={restoring} />
        </label>

        {restoreError && <p class="notice notice-error">{restoreError}</p>}

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
              <button class="btn btn-danger" onClick={onConfirmRestore} disabled={restoring}>
                {restoring ? 'Restoring…' : 'Replace all data & restore'}
              </button>
              <button class="btn-link" type="button" onClick={() => setPending(null)} disabled={restoring}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {restoreNotice && (
          <p class={`notice notice-${restoreNotice.kind}`}>{restoreNotice.text}</p>
        )}
      </section>
    </section>
  )
}
