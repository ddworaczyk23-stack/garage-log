import { useState } from 'preact/hooks'
import { deleteConcern, reopenConcern, resolveConcern } from '../db/concerns'
import { formatShortDate } from '../domain/format'
import type { Concern, Vehicle } from '../types'
import type { SignalBand } from '../domain/verdict'
import { vehicleLabel } from '../domain/vehicle'
import { ConfirmButton } from './ui'

const TONE: Record<SignalBand, { cls: string; label: string }> = {
  'fix-now': { cls: 'cv-red', label: 'Fix now' },
  'book-soon': { cls: 'cv-amber', label: 'Book soon' },
  coast: { cls: 'cv-blue', label: 'Can coast' },
  'all-clear': { cls: 'cv-green', label: 'All clear' },
}

export function ConcernList({ vehicle, concerns }: { vehicle: Vehicle; concerns: Concern[] }) {
  const [handled, setHandled] = useState<Concern | null>(null)
  const visible = handled && !concerns.some((c) => c.id === handled.id) ? [...concerns, handled] : concerns
  if (!visible.length) return null
  return (
    <div class="card chk-onlist">
      <h3 class="chk-onlist-title">On {vehicleLabel(vehicle)}’s list</h3>
      {visible.map((concern) => {
        const tone = TONE[concern.band as SignalBand] ?? TONE['book-soon']
        return (
          <div key={concern.id} class="chk-onlist-row">
            <span class={`chk-dot ${tone.cls}`} aria-hidden="true" />
            <span class="chk-onlist-main">
              <b>{concern.title}</b>
              <small>{tone.label} · raised {formatShortDate(concern.createdDate)}</small>
              <a class="btn-link" href={`#/brief/${concern.id}`}>Shop brief →</a>
              {handled?.id === concern.id && (
                <span class="concern-status" role="status">Marked handled. <button type="button" class="btn-link" onClick={async () => { await reopenConcern(concern.id); setHandled(null) }}>Undo</button></span>
              )}
            </span>
            <span class="chk-onlist-actions">
              {handled?.id !== concern.id && <ConfirmButton label="Handled" confirmLabel="Mark handled" class="btn-link" onConfirm={async () => { await resolveConcern(concern.id); setHandled(concern) }} />}
              <ConfirmButton label="Remove" confirmLabel="Remove" class="btn-link" onConfirm={() => deleteConcern(concern.id)} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
