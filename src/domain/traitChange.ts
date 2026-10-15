import { GENERIC_TEMPLATE_KEY, templateEntries } from '../db/scheduleTemplates'
import { parseTraitsKey, traitsKey } from '../db/traitTemplates'
import { resolveTraitAnswers, type TraitAnswers } from './scheduleReview'
import type { MaintenanceCategory, ReminderRule } from '../types'

// Changing a car's traits after it was added. Pure: the DB write lives in
// db/traitChange.ts. "Not sure" answers are stored the way "Add a car" stores
// them (resolveTraitAnswers): the row exists but carries a `not-needed`
// override, so we read that back here to show the answer the user gave.

export function canChangeTraits(key: string): boolean {
  return key === GENERIC_TEMPLATE_KEY || parseTraitsKey(key) !== null
}

const isOff = (rules: ReminderRule[], category: MaintenanceCategory) =>
  rules.find((rule) => rule.category === category)?.override?.kind === 'not-needed'

/** The step-1 answers that would produce this car's current rules. */
export function answersFromRules(rules: ReminderRule[]): TraitAnswers {
  const traits = parseTraitsKey(rules[0]?.templateKey ?? '')
  // Cars from before trait schedules: nothing was asked, so everything is "Not sure".
  if (!traits) return { power: 'gas', trans: 'none', drive: 'none', belt: 'not-sure' }
  const electrified = traits.power === 'hybrid' || traits.power === 'ev'
  return {
    power: traits.power,
    trans: !electrified && traits.trans === 'auto' && isOff(rules, 'transmission-fluid') ? 'none' : traits.trans,
    drive: traits.drive,
    belt: traits.belt === 'yes' && isOff(rules, 'timing-belt') ? 'not-sure' : traits.belt,
  }
}

export function sameAnswers(a: TraitAnswers, b: TraitAnswers): boolean {
  const ra = resolveTraitAnswers(a)
  const rb = resolveTraitAnswers(b)
  return traitsKey(ra.traits) === traitsKey(rb.traits) && [...ra.unsure].sort().join() === [...rb.unsure].sort().join()
}

const POWER_TEXT = { gas: 'Gas', turbo: 'Turbo gas', diesel: 'Diesel', hybrid: 'Hybrid', ev: 'Electric' } as const
const TRANS_TEXT = { auto: 'Automatic', cvt: 'CVT', dct: 'Dual-clutch', manual: 'Manual', none: 'Transmission not sure' } as const
const BELT_TEXT = { yes: 'Timing belt', no: 'Timing chain', 'not-sure': 'Belt or chain not sure' } as const

/** "Gas · Automatic · AWD · Timing chain". Parts that don't apply are left out. */
export function traitSummary(a: TraitAnswers): string {
  const electrified = a.power === 'hybrid' || a.power === 'ev'
  return [
    POWER_TEXT[a.power],
    electrified ? null : TRANS_TEXT[a.trans],
    a.drive === 'none' ? null : a.drive.toUpperCase(),
    a.power === 'ev' ? null : BELT_TEXT[a.belt],
  ].filter(Boolean).join(' · ')
}

export interface ScheduleDiff {
  newKey: string
  added: MaintenanceCategory[]
  removed: ReminderRule[]
  kept: ReminderRule[]
  /** Answer is "Not sure": the row is (or stays) switched off. */
  unsure: MaintenanceCategory[]
  /** Was off as "Not sure"; a real answer now switches it on. */
  turnedOn: MaintenanceCategory[]
}

export function diffSchedules(current: ReminderRule[], next: TraitAnswers): ScheduleDiff {
  const before = resolveTraitAnswers(answersFromRules(current)).unsure
  const { traits, unsure } = resolveTraitAnswers(next)
  const newKey = traitsKey(traits)
  const nextCategories = new Set(templateEntries(newKey).map((entry) => entry.category))
  const prior = new Set(current.map((rule) => rule.category))
  return {
    newKey,
    added: [...nextCategories].filter((category) => !prior.has(category)),
    removed: current.filter((rule) => !nextCategories.has(rule.category)),
    kept: current.filter((rule) => nextCategories.has(rule.category)),
    unsure: unsure.filter((category) => nextCategories.has(category)),
    turnedOn: before.filter((category) => prior.has(category) && nextCategories.has(category) && !unsure.includes(category)),
  }
}
