import { templateEntries } from '../db/scheduleTemplates'
import { CATEGORY_LABELS, type Interval, type MaintenanceCategory, type ReminderRule } from '../types'
import type { VehicleTraits } from '../db/traitTemplates'

export type ScheduleEdit = {
  enabled: boolean
  customMiles: number | null
  customMonths: number | null
  lastDoneDate: string | null
  lastDoneMiles: number | null
}

export type ScheduleReviewItem = {
  category: MaintenanceCategory
  label: string
  group: string
  suggested: Interval
  maker: Interval
  note: string | undefined
}

export type EditErrors = Partial<Record<'custom' | 'lastDoneDate' | 'lastDoneMiles', string>>

export const blankScheduleEdit = (): ScheduleEdit => ({
  enabled: true, customMiles: null, customMonths: null, lastDoneDate: null, lastDoneMiles: null,
})

/** Step-1 answers. `trans: 'none'` is the "Not sure" chip. */
export type TraitAnswers = Omit<VehicleTraits, 'belt'> & { belt: 'yes' | 'no' | 'not-sure' }

export const UNSURE_NOTE = 'Not sure if your car has this. Check your manual.'

/**
 * "Not sure" still shows the row on step 2, switched off: build from the
 * timing-belt / automatic variant and list those categories as unsure.
 */
export function resolveTraitAnswers(answers: TraitAnswers): { traits: VehicleTraits; unsure: MaintenanceCategory[] } {
  const unsure: MaintenanceCategory[] = []
  const electrified = answers.power === 'hybrid' || answers.power === 'ev'
  let trans = electrified ? 'none' : answers.trans
  if (trans === 'none' && !electrified) {
    trans = 'auto'
    unsure.push('transmission-fluid')
  }
  let belt: VehicleTraits['belt'] = answers.belt === 'yes' ? 'yes' : 'no'
  if (answers.belt === 'not-sure' && answers.power !== 'ev') {
    belt = 'yes'
    unsure.push('timing-belt')
  }
  return { traits: { power: answers.power, trans, drive: answers.drive, belt }, unsure }
}

/** Unsure rows start off unless the user already set them. */
export function seedUnsureEdits(edits: Partial<Record<MaintenanceCategory, ScheduleEdit>>, unsure: MaintenanceCategory[]): Partial<Record<MaintenanceCategory, ScheduleEdit>> {
  const next = { ...edits }
  for (const category of unsure) next[category] ??= { ...blankScheduleEdit(), enabled: false }
  return next
}

export const SCHEDULE_GROUPS = ['Engine', 'Tires and brakes', 'Fluids', 'Other'] as const

export function scheduleGroup(category: MaintenanceCategory): string {
  if (['oil-change', 'engine-air-filter', 'spark-plugs', 'timing-belt', 'serpentine-belt', 'fuel-filter'].includes(category)) return 'Engine'
  if (['tire-rotation', 'tire-replacement', 'tire-balancing', 'tire-inspection', 'wheel-alignment', 'brake-fluid', 'brake-inspection'].includes(category)) return 'Tires and brakes'
  if (['coolant', 'transmission-fluid', 'cvt-fluid', 'power-steering-fluid', 'transfer-case-fluid', 'differential-fluid'].includes(category)) return 'Fluids'
  return 'Other'
}

export function reviewItems(templateKey: string): ScheduleReviewItem[] {
  return templateEntries(templateKey).map((entry) => ({
    category: entry.category,
    label: entry.label ?? CATEGORY_LABELS[entry.category],
    group: scheduleGroup(entry.category),
    suggested: entry.mechanicConsensusInterval ?? entry.factoryInterval,
    maker: entry.factoryInterval,
    note: entry.consensusNote ?? entry.note,
  }))
}

function matchesInterval(edit: ScheduleEdit, interval: Interval): boolean {
  return edit.customMiles === interval.miles && edit.customMonths === interval.months
}

/** True when the edit stores an interval other than the suggested one. */
export function intervalChanged(edit: ScheduleEdit, item: Pick<ScheduleReviewItem, 'suggested'>): boolean {
  if (edit.customMiles == null && edit.customMonths == null) return false
  return !matchesInterval(edit, item.suggested)
}

export function applyScheduleEdits(rules: ReminderRule[], edits: Partial<Record<MaintenanceCategory, ScheduleEdit>>): ReminderRule[] {
  return rules.map((rule) => {
    const edit = edits[rule.category]
    if (!edit) return rule
    if (!edit.enabled) return { ...rule, override: { kind: 'not-needed', note: null, atDate: null, atMiles: null }, customIntervalMiles: null, customIntervalMonths: null }
    const entry = templateEntries(rule.templateKey).find((item) => item.category === rule.category)
    const suggested = entry?.mechanicConsensusInterval ?? entry?.factoryInterval ?? { miles: null, months: null }
    const custom = matchesInterval(edit, suggested) ? { customIntervalMiles: null, customIntervalMonths: null } : { customIntervalMiles: edit.customMiles, customIntervalMonths: edit.customMonths }
    const hasLastDone = edit.lastDoneDate != null || edit.lastDoneMiles != null
    return {
      ...rule,
      ...custom,
      override: hasLastDone ? { kind: 'already-replaced', note: null, atDate: edit.lastDoneDate, atMiles: edit.lastDoneMiles } : null,
    }
  })
}

/** `customMode`: the row is in Custom, so it needs at least one of miles/months. */
export function validateEdit(edit: ScheduleEdit, currentMiles: number | null, today: string, customMode = false): EditErrors {
  const errors: EditErrors = {}
  if ((edit.customMiles != null && (!Number.isInteger(edit.customMiles) || edit.customMiles <= 0)) || (edit.customMonths != null && (!Number.isInteger(edit.customMonths) || edit.customMonths <= 0))) errors.custom = 'Use whole numbers greater than 0.'
  if (customMode && edit.customMiles == null && edit.customMonths == null) errors.custom = 'Enter miles or months.'
  if (edit.lastDoneDate && edit.lastDoneDate > today) errors.lastDoneDate = 'Last-done date cannot be in the future.'
  if (edit.lastDoneMiles != null && currentMiles != null && edit.lastDoneMiles > currentMiles) errors.lastDoneMiles = 'Last-done miles cannot be higher than current miles.'
  return errors
}
