import { useEffect, useRef, useState } from 'preact/hooks'
import { formatBytes } from '../domain/documents'
import type { VehicleDocument } from '../types'

interface Props {
  documents: VehicleDocument[]
  /** When provided, each thumbnail gets a delete control that calls this. */
  onRemove?: (id: string) => void
}

// Renders attached receipts/photos/PDFs as clickable thumbnails. Object URLs
// are created per-document and revoked on unmount/change — the only cleanup
// this needs since blobs themselves live in IndexedDB, not here.
export function DocumentGrid({ documents, onRemove }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    // Diff by document id so an add/remove elsewhere in the list only
    // creates/revokes the URLs that actually changed, rather than churning
    // (and re-flickering) every thumbnail on any single addition/removal.
    setUrls((prev) => {
      const next: Record<string, string> = {}
      for (const doc of documents) next[doc.id] = prev[doc.id] ?? URL.createObjectURL(doc.blob)
      for (const [id, url] of Object.entries(prev)) {
        if (!(id in next)) URL.revokeObjectURL(url)
      }
      return next
    })
  }, [documents])

  // Revoke whatever's left only on final unmount (the effect above already
  // handles revocation as documents come and go); a ref keeps the cleanup
  // closure from seeing a stale `urls` snapshot from an earlier render.
  const urlsRef = useRef(urls)
  urlsRef.current = urls
  useEffect(() => {
    return () => {
      Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  if (!documents.length) {
    return <p class="muted small">No documents attached yet.</p>
  }

  return (
    <div class="doc-grid">
      {documents.map((doc) => {
        const url = urls[doc.id]
        const isImage = doc.mimeType.startsWith('image/')
        return (
          <div key={doc.id} class="doc-cell">
            <a class="doc-thumb" href={url} target="_blank" rel="noreferrer" title={doc.filename}>
              {isImage && url ? (
                <img src={url} alt={doc.filename} />
              ) : (
                <span class="doc-thumb-icon" aria-hidden="true">
                  {doc.mimeType === 'application/pdf' ? '📄' : '📎'}
                </span>
              )}
              <span class="doc-thumb-name">{doc.filename}</span>
              <span class="doc-thumb-meta">
                {formatBytes(doc.sizeBytes)}
                {doc.optimized ? ' · optimized' : ''}
              </span>
            </a>
            {onRemove &&
              (confirmingId === doc.id ? (
                <span class="doc-confirm" role="group" aria-label={`Delete ${doc.filename}?`}>
                  <button
                    type="button"
                    class="doc-confirm-yes"
                    title="Confirm delete"
                    onClick={() => {
                      setConfirmingId(null)
                      onRemove(doc.id)
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    class="doc-confirm-no"
                    title="Cancel"
                    aria-label="Cancel delete"
                    onClick={() => setConfirmingId(null)}
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  class="doc-remove-btn"
                  title="Delete document"
                  aria-label={`Delete ${doc.filename}`}
                  onClick={() => setConfirmingId(doc.id)}
                >
                  ✕
                </button>
              ))}
          </div>
        )
      })}
    </div>
  )
}
