import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { attachVehicleDocument, deleteDocument, getVehicleLevelDocuments } from '../db/documents'
import { DocumentGrid } from './DocumentGrid'
import { Collapsible } from './motion/Collapsible'
import type { VehicleDocument } from '../types'

interface Props {
  vehicleId: string
  eventDocuments?: VehicleDocument[]
  embedded?: boolean
}

// Glovebox: documents attached to the vehicle itself (registration, insurance
// card, owner's manual, title) rather than to a service/repair event. Uploads
// run through the same compression path as event attachments (db/documents.ts);
// the grid is reactive via liveQuery, so add/delete need no manual refresh.
export function VehicleDocuments({ vehicleId, eventDocuments = [], embedded = false }: Props) {
  const documents = useQuery(() => getVehicleLevelDocuments(vehicleId), [vehicleId])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onFiles(e: Event) {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    if (!files.length) return
    setBusy(true)
    setError('')
    // Attach each file independently so one failure (e.g. a corrupt image)
    // can't abort the rest of a multi-file selection.
    const failed: string[] = []
    for (const file of files) {
      try {
        await attachVehicleDocument(vehicleId, file)
      } catch (err) {
        console.error('[VehicleDocuments]', err)
        failed.push(file.name)
      }
    }
    setBusy(false)
    input.value = '' // allow re-selecting the same file
    if (failed.length) {
      setError(`Couldn't save: ${failed.join(', ')}. Please try again.`)
    }
  }

  const content = (
    <>
      <p class="muted small">
        Registration, insurance, title, owner's manual — anything about the vehicle
        that isn't a specific service. Large photos are compressed automatically.
      </p>

      <label class="admin-field">
        <span class="muted small">Add vehicle document</span>
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          disabled={busy}
          onChange={onFiles}
        />
      </label>
      {busy && <p class="muted small">Saving…</p>}
      {error && (
        <p class="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {documents === undefined ? (
        <p class="muted small">Loading…</p>
      ) : (
        <DocumentGrid documents={documents} onRemove={(id) => void deleteDocument(id)} />
      )}

      <div class="vd-receipts">
        <div class="card-title-row">
          <h4 class="vd-subtitle">Service & repair receipts</h4>
          <a class="btn-link" href={`#/documents/${vehicleId}`}>
            Browse all →
          </a>
        </div>
        <p class="muted small">Files attached to a logged service or repair.</p>
        <DocumentGrid documents={eventDocuments} />
      </div>
    </>
  )

  if (embedded) {
    const total = (documents?.length ?? 0) + eventDocuments.length
    return (
      <Collapsible title="Glovebox" count={`${total} ${total === 1 ? 'file' : 'files'}`}>
        {content}
      </Collapsible>
    )
  }

  return (
    <section class="card">
      <h3 class="card-title">Glovebox ({documents?.length ?? 0})</h3>
      {content}
    </section>
  )
}
