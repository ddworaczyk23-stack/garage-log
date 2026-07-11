import { useState } from 'preact/hooks'
import { setVehicleNickname } from '../db/vehicles'
import type { Vehicle } from '../types'

// Inline nickname editor shown in the vehicle-detail header. Saving writes the
// nickname (blank clears it); the vehicle liveQuery re-renders the header and
// every other screen that labels this vehicle.
export function NicknameEditor({ vehicle, onDone }: { vehicle: Vehicle; onDone: () => void }) {
  const [value, setValue] = useState(vehicle.nickname ?? '')
  const [saving, setSaving] = useState(false)

  async function save(e: Event) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    await setVehicleNickname(vehicle.id, value)
    setSaving(false)
    onDone()
  }

  return (
    <form class="nickname-editor" onSubmit={save}>
      <input
        type="text"
        maxLength={40}
        placeholder={vehicle.name}
        value={value}
        aria-label="Vehicle nickname"
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autofocus
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
      />
      <div class="form-actions">
        <button class="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button class="btn-link" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      <p class="muted small">Leave blank to use “{vehicle.name}”.</p>
    </form>
  )
}
