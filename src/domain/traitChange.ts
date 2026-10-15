import { GENERIC_TEMPLATE_KEY, templateEntries } from '../db/scheduleTemplates'
import { parseTraitsKey, type VehicleTraits } from '../db/traitTemplates'
import type { MaintenanceCategory, ReminderRule } from '../types'

export function traitSummary(t: VehicleTraits): string {
  const power = { gas: 'Gas', turbo: 'Turbo gas', diesel: 'Diesel', hybrid: 'Hybrid', ev: 'Electric' }[t.power]
  const trans = { auto: 'Automatic', cvt: 'CVT', dct: 'Dual-clutch', manual: 'Manual', none: 'No transmission service' }[t.trans]
  const drive = { fwd: 'FWD', rwd: 'RWD', awd: 'AWD', '4wd': '4WD', none: 'Standard drive' }[t.drive]
  return `${power} · ${trans} · ${drive} · ${t.belt === 'yes' ? 'Timing belt' : 'Timing chain'}`
}

export function canChangeTraits(key: string): boolean {
  return key === GENERIC_TEMPLATE_KEY || parseTraitsKey(key) !== null
}

export function diffSchedules(current: ReminderRule[], newKey: string): { added: MaintenanceCategory[]; removed: ReminderRule[]; kept: ReminderRule[] } {
  const next = new Set(templateEntries(newKey).map((entry) => entry.category))
  const prior = new Set(current.map((rule) => rule.category))
  return {
    added: [...next].filter((category) => !prior.has(category)),
    removed: current.filter((rule) => !next.has(rule.category)),
    kept: current.filter((rule) => next.has(rule.category)),
  }
}
