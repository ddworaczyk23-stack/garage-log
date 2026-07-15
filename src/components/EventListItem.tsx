import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { deleteEvent } from '../db/events'
import { formatMiles, formatMoney, formatShortDate } from '../domain/format'
import { EventForm, loadEventDocs } from './EventForm'
import { ConfirmButton } from './ui'
import { CATEGORY_LABELS, type MaintenanceEvent } from '../types'

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
          {formatShortDate(event.date)} · {formatMiles(event.odometerMiles)}
          {event.cost ? ` · ${formatMoney(event.cost)}` : ''}
          {event.documentIds.length ? ` · 📎 ${event.documentIds.length}` : ''}
        </span>
        {event.notes && <span class="muted small">{event.notes}</span>}
        {event.additionalCategories && event.additionalCategories.length > 0 && (
          <span class="also-tag-row">
            <span class="muted small">Also:</span>
            {event.additionalCategories.map((c) => (
              <span key={c} class="doc-tag">{CATEGORY_LABELS[c]}</span>
            ))}
          </span>
        )}
      </span>
      <span class="row-actions">
        <button type="button" class="btn-link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <ConfirmButton
          label="Delete"
          confirmLabel="Delete?"
          onConfirm={() => deleteEvent(event.id)}
        />
      </span>
    </li>
  )
}
