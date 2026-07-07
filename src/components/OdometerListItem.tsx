import { useState } from 'preact/hooks'
import { deleteOdometerReading } from '../db/events'
import { OdometerForm } from './OdometerForm'
import type { OdometerReading } from '../types'

interface Props {
  vehicleId: string
  reading: OdometerReading
}

export function OdometerListItem({ vehicleId, reading }: Props) {
  const [editing, setEditing] = useState(false)

  async function handleDelete() {
    if (!confirm('Delete this odometer reading?')) return
    await deleteOdometerReading(reading.id)
  }

  if (editing) {
    return (
      <OdometerForm
        vehicleId={vehicleId}
        existing={reading}
        onDone={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <li class="list-row">
      <span class="list-row-main">
        <span class="list-row-title">{reading.miles.toLocaleString()} mi</span>
        <span class="muted small">
          {reading.date} · {reading.source === 'quick-log' ? 'manual reading' : 'from service log'}
        </span>
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
