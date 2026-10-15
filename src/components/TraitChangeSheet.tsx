import { useMemo, useState } from 'preact/hooks'
import { Sheet } from './ui'
import { changeVehicleTraits } from '../db/traitChange'
import { diffSchedules, traitSummary } from '../domain/traitChange'
import { traitsKey, type VehicleTraits } from '../db/traitTemplates'
import { CATEGORY_LABELS, type ReminderRule } from '../types'

export function TraitChangeSheet({ vehicleId, rules, initial, onClose, onSaved }: { vehicleId: string; rules: ReminderRule[]; initial: VehicleTraits; onClose: () => void; onSaved: () => void }) {
  const [traits, setTraits] = useState(initial)
  const [saving, setSaving] = useState(false)
  const key = traitsKey(traits)
  const diff = useMemo(() => diffSchedules(rules, key), [rules, key])
  const changed = rules.some((rule) => rule.templateKey !== key)
  async function save() { setSaving(true); try { await changeVehicleTraits(vehicleId, traits); onSaved() } finally { setSaving(false) } }
  const picker = <div class="trait-pickers">
    <label>Engine type<select value={traits.power} onChange={(e) => setTraits({ ...traits, power: (e.target as HTMLSelectElement).value as VehicleTraits['power'] })}><option value="gas">Gas</option><option value="turbo">Turbo gas</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="ev">Electric</option></select></label>
    {traits.power !== 'hybrid' && traits.power !== 'ev' && <label>Transmission<select value={traits.trans} onChange={(e) => setTraits({ ...traits, trans: (e.target as HTMLSelectElement).value as VehicleTraits['trans'] })}><option value="auto">Automatic</option><option value="cvt">CVT</option><option value="dct">Dual-clutch</option><option value="manual">Manual</option><option value="none">Not sure</option></select></label>}
    {traits.power !== 'ev' && <label>Timing belt?<select value={traits.belt} onChange={(e) => setTraits({ ...traits, belt: (e.target as HTMLSelectElement).value as VehicleTraits['belt'] })}><option value="no">No / not sure</option><option value="yes">Yes</option></select></label>}
    <label>Drivetrain<select value={traits.drive} onChange={(e) => setTraits({ ...traits, drive: (e.target as HTMLSelectElement).value as VehicleTraits['drive'] })}><option value="none">Not sure</option><option value="fwd">FWD</option><option value="rwd">RWD</option><option value="awd">AWD</option><option value="4wd">4WD</option></select></label>
  </div>
  return <Sheet eyebrow={traitSummary(traits)} title="Change maintenance type" onClose={onClose}><div class="trait-change">{picker}<div class="trait-diff">{!changed ? <p>Same schedule.</p> : <><p><b>Added:</b> {diff.added.map((c) => CATEGORY_LABELS[c]).join(', ') || 'None'}</p><p><b>Removed:</b> {diff.removed.map((r) => r.label).join(', ') || 'None'}</p><small>Your logged service stays in history.</small><p><b>Kept:</b> {diff.kept.length} items, your settings stay.</p></>}</div><button class="btn" type="button" disabled={!changed || saving} onClick={save}>{saving ? 'Updating…' : 'Update schedule'}</button></div></Sheet>
}
