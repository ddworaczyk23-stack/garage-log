import { useState } from 'preact/hooks'
import { deleteOdometerReading } from '../db/events'
import { formatMiles, formatShortDate } from '../domain/format'
import { OdometerForm } from './OdometerForm'
import { ConfirmButton } from './ui'
import type { OdometerReading } from '../types'

interface Props {
  vehicleId: string
  reading: OdometerReading
}

export function OdometerListItem({ vehicleId, reading }: Props) {
  const [editing, setEditing] = useState(false)

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
        <span class="list-row-title">{formatMiles(reading.miles)}</span>
        <span class="muted small">
          {formatShortDate(reading.date)} · {reading.source === 'quick-log' ? 'manual reading' : 'from service log'}
        </span>
      </span>
      <span class="row-actions">
        <button type="button" class="btn-link" onClick={() => setEditing(true)}>
          Edit
        </button>
        <ConfirmButton
          label="Delete"
          confirmLabel="Delete?"
          onConfirm={() => deleteOdometerReading(reading.id)}
        />
      </span>
    </li>
  )
}
