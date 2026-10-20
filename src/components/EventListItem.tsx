import { useState } from 'preact/hooks'
import { useQuery } from '../db/useQuery'
import { deleteEvent } from '../db/events'
import { formatMiles, formatMoney, formatShortDate } from '../domain/format'
import { EventForm, loadEventDocs } from './EventForm'
import { ConfirmButton, Sheet } from './ui'
import { serviceHref } from '../domain/serviceHistory'
import { CATEGORY_LABELS, type MaintenanceEvent } from '../types'
import { ChevronRightIcon } from './icons'

interface Props {
  vehicleId: string
  event: MaintenanceEvent
  /** Title links to this event's service page. Off on that page itself. */
  linkToService?: boolean
}

// One row in the maintenance/repair history list. "Edit" opens the shared
// EventForm (pre-filled) in the same bottom sheet as logging. No onChanged plumbing needed — Dexie's
// liveQuery already re-runs every dependent query (history list, reminders,
// documents) automatically whenever the underlying tables change.
export function EventListItem({ vehicleId, event, linkToService = true }: Props) {
  const [editing, setEditing] = useState(false)
  const docs = useQuery(() => (editing ? loadEventDocs(event) : Promise.resolve([])), [editing, event.id])

  return (
    <li class="box-row event-row">
      <span class="box-row-main">
        {linkToService ? (
          <a class="box-row-title list-row-link" href={serviceHref(vehicleId, event.category)}>
            {event.title} <ChevronRightIcon />
          </a>
        ) : (
          <span class="box-row-title">{event.title}</span>
        )}
        <span class="muted small">
          {formatShortDate(event.date)} · {formatMiles(event.odometerMiles)}
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
      <span class="box-row-value">{event.cost ? formatMoney(event.cost) : '—'}</span>
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
      {editing && (
        <Sheet
          eyebrow={formatShortDate(event.date)}
          title={`Edit ${event.kind === 'repair' ? 'repair' : 'service'}`}
          onClose={() => setEditing(false)}
        >
          <EventForm
            vehicleId={vehicleId}
            kind={event.kind}
            existing={event}
            existingDocs={docs ?? []}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </Sheet>
      )}
    </li>
  )
}
