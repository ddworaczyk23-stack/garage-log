import { useEffect, useMemo, useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import {
  deleteDocument,
  getVehicleEvents,
  reassignDocument,
  setDocumentTags,
} from '../db/documents'
import { formatBytes } from '../domain/documents'
import { CATEGORY_LABELS, type VehicleDocument } from '../types'
import type { DocumentIndexEntry } from '../domain/documents'
import { ConfirmButton, Tooltip } from './ui'

interface Props {
  entry: DocumentIndexEntry
  onClose: () => void
}

// Glovebox target has a fixed value; event targets use the event id.
const GLOVEBOX_VALUE = 'glovebox'

// Full-screen preview + organize sheet for one document. Preview adapts to the
// file type (inline image, in-app PDF iframe, or a metadata card for anything
// else); every type still gets an Open/Download action. Also hosts the tag
// editor, the reassign picker (same-vehicle events + glovebox), and remove.
export function DocumentPreviewModal({ entry, onClose }: Props) {
  const { doc } = entry
  const url = useMemo(() => URL.createObjectURL(doc.blob), [doc.id])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  const events = useQuery(() => getVehicleEvents(entry.vehicleId), [entry.vehicleId])
  const [tagInput, setTagInput] = useState((doc.tags ?? []).join(', '))
  const [tagSaved, setTagSaved] = useState(false)

  // Close on Escape for keyboard/desktop use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentTarget = doc.linkedTo.type === 'event' ? doc.linkedTo.id : GLOVEBOX_VALUE

  async function onReassign(value: string) {
    if (value === currentTarget) return
    const target: VehicleDocument['linkedTo'] =
      value === GLOVEBOX_VALUE
        ? { type: 'vehicle', id: entry.vehicleId }
        : { type: 'event', id: value }
    await reassignDocument(doc.id, target)
    onClose() // entry is now stale; the list re-renders reactively
  }

  async function saveTags() {
    await setDocumentTags(doc.id, tagInput)
    setTagSaved(true)
    setTimeout(() => setTagSaved(false), 1500)
  }

  async function remove() {
    await deleteDocument(doc.id)
    onClose()
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div
        class="modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-modal-title"
      >
        <div class="modal-head">
          <h3 id="doc-modal-title" class="modal-title" title={doc.filename}>
            {doc.filename}
          </h3>
          <Tooltip label="Close">
            <button type="button" class="modal-close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </Tooltip>
        </div>

        <div class="modal-preview">
          {entry.fileType === 'image' ? (
            <img class="preview-media" src={url} alt={doc.filename} />
          ) : entry.fileType === 'pdf' ? (
            <iframe class="preview-media" src={url} title={doc.filename} />
          ) : (
            <div class="preview-fallback">
              <span class="preview-fallback-icon" aria-hidden="true">
                📎
              </span>
              <p class="muted small">No inline preview for this file type.</p>
            </div>
          )}
        </div>

        <dl class="doc-meta">
          <div>
            <dt>Vehicle</dt>
            <dd>{entry.vehicleName}</dd>
          </div>
          <div>
            <dt>Attached to</dt>
            <dd>{entry.context}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{doc.mimeType || 'unknown'}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {formatBytes(doc.sizeBytes)}
              {doc.optimized && doc.originalSizeBytes
                ? ` (from ${formatBytes(doc.originalSizeBytes)})`
                : ''}
            </dd>
          </div>
        </dl>

        <a class="btn full" href={url} target="_blank" rel="noreferrer" download={doc.filename}>
          Open / download
        </a>

        <label class="admin-field">
          <span class="muted small">Tags (comma-separated)</span>
          <div class="tag-edit-row">
            <input
              type="text"
              placeholder="e.g. warranty, receipt"
              value={tagInput}
              onInput={(e) => setTagInput((e.target as HTMLInputElement).value)}
            />
            <button type="button" class="btn" onClick={saveTags}>
              {tagSaved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </label>

        <label class="admin-field">
          <span class="muted small">Reassign to</span>
          <select
            value={currentTarget}
            onChange={(e) => onReassign((e.target as HTMLSelectElement).value)}
          >
            <option value={GLOVEBOX_VALUE}>Glovebox (not an event)</option>
            {(events ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.kind === 'repair' ? 'Repair' : 'Service'} · {ev.title || CATEGORY_LABELS[ev.category]} · {ev.date}
              </option>
            ))}
          </select>
        </label>

        <ConfirmButton
          class="btn-link danger"
          label="Remove document"
          confirmLabel="Yes, remove this document"
          busyLabel="Removing…"
          onConfirm={remove}
        />
        <p class="muted small">Removing deletes the file only — the service/repair entry stays.</p>
      </div>
    </div>
  )
}
