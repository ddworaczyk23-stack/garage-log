import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { attachVehicleDocument, deleteDocument, getVehicleLevelDocuments } from '../db/documents'
import { DocumentGrid } from './DocumentGrid'

interface Props {
  vehicleId: string
}

// Glovebox: documents attached to the vehicle itself (registration, insurance
// card, owner's manual, title) rather than to a service/repair event. Uploads
// run through the same compression path as event attachments (db/documents.ts);
// the grid is reactive via liveQuery, so add/delete need no manual refresh.
export function VehicleDocuments({ vehicleId }: Props) {
  const documents = useQuery(() => getVehicleLevelDocuments(vehicleId), [vehicleId])
  const [busy, setBusy] = useState(false)

  async function onFiles(e: Event) {
    const input = e.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    if (!files.length) return
    setBusy(true)
    try {
      for (const file of files) await attachVehicleDocument(vehicleId, file)
    } finally {
      setBusy(false)
      input.value = '' // allow re-selecting the same file
    }
  }

  return (
    <section class="card">
      <h3 class="card-title">Glovebox ({documents?.length ?? 0})</h3>
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

      {documents === undefined ? (
        <p class="muted small">Loading…</p>
      ) : (
        <DocumentGrid documents={documents} onRemove={(id) => void deleteDocument(id)} />
      )}
    </section>
  )
}
