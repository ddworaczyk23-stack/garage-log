import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { deleteEvent } from '../db/events'
import { EventForm, loadEventDocs } from './EventForm'
import type { MaintenanceEvent } from '../types'

interface Props {
  vehicleId: string
  event: MaintenanceEvent
}

// One row in the maintenance/repair history list. Toggles into the shared
// EventForm (pre-filled) for editing. No onChanged plumbing needed — Dexie's
// liveQuery already re-runs every dependent query (history list, reminders,
// documents) automatically whenever the underlying tables change.
export function EventListItem({ vehicleId, event }: Props) {
  const [editing, setEditing] = useState(false)
  const docs = useQuery(() => (editing ? loadEventDocs(event) : Promise.resolve([])), [editing, event.id])

  async function handleDelete() {
    if (!confirm(`Delete this ${event.kind} entry? This cannot be undone.`)) return
    await deleteEvent(event.id)
  }

  if (editing) {
    return (
      <EventForm
        vehicleId={vehicleId}
        kind={event.kind}
        existing={event}
        existingDocs={docs ?? []}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <li class="list-row event-row">
      <span class="list-row-main">
        <span class="list-row-title">{event.title}</span>
        <span class="muted small">
          {event.date} · {event.odometerMiles.toLocaleString()} mi
          {event.cost ? ` · $${event.cost.toFixed(2)}` : ''}
          {event.documentIds.length ? ` · 📎${event.documentIds.length}` : ''}
        </span>
        {event.notes && <span class="muted small">{event.notes}</span>}
      </span>
      <span class="row-actions">
        <button class="btn-link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button class="btn-link btn-link-danger" onClick={handleDelete}>
          Delete
        </button>
      </span>
    </li>
  )
}
