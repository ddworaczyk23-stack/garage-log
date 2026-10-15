import { db } from './db'
import { rulesForVehicle, templateEntries } from './scheduleTemplates'
import { canChangeTraits, diffSchedules } from '../domain/traitChange'
import { matchesRule } from '../domain/reminderEngine'
import type { TraitAnswers } from '../domain/scheduleReview'
import { CATEGORY_LABELS, type MaintenanceCategory, type RuleOverride } from '../types'

const UNSURE_OFF: RuleOverride = { kind: 'not-needed', note: null, atDate: null, atMiles: null }

/**
 * Re-key a car's schedule to new trait answers in one transaction. Kept rules
 * keep their settings and history; removed rules are deleted (logged events
 * are never touched); added rules take last done from matching events. Every
 * rule ends on the same templateKey: seedIfEmpty reconciles one key per car.
 */
export async function changeVehicleTraits(vehicleId: string, answers: TraitAnswers): Promise<void> {
  await db.transaction('rw', db.reminderRules, db.events, async () => {
    const current = await db.reminderRules.where('vehicleId').equals(vehicleId).toArray()
    if (!current.length || !canChangeTraits(current[0].templateKey)) throw new Error('This car has a hand-built schedule.')
    const diff = diffSchedules(current, answers)
    const entries = templateEntries(diff.newKey)
    const labelFor = (category: MaintenanceCategory) =>
      entries.find((entry) => entry.category === category)?.label ?? CATEGORY_LABELS[category]

    for (const rule of diff.kept) {
      const override = diff.unsure.includes(rule.category) ? UNSURE_OFF : diff.turnedOn.includes(rule.category) ? null : rule.override
      await db.reminderRules.update(rule.id, { templateKey: diff.newKey, label: labelFor(rule.category), override })
    }
    await db.reminderRules.bulkDelete(diff.removed.map((rule) => rule.id))

    const events = await db.events.where('vehicleId').equals(vehicleId).toArray()
    const additions = rulesForVehicle(vehicleId, diff.newKey)
      .filter((rule) => diff.added.includes(rule.category))
      .map((rule) => {
        const last = events.filter((event) => matchesRule(event, rule)).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
        return {
          ...rule,
          lastDoneDate: last?.date ?? null,
          lastDoneMiles: last?.odometerMiles ?? null,
          override: diff.unsure.includes(rule.category) ? UNSURE_OFF : null,
        }
      })
    await db.reminderRules.bulkAdd(additions)
  })
}
